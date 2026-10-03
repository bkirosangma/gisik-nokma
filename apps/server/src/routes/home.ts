import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import { HOME_ID_CAP, istDayOf, type FieldClaim, type HomeResponse, type StateCategory } from '@gisik-nokma/domain';
import type { Queryable } from '../db/queryable.js';
import type { EffectiveRole } from '../permissions/effective-role.js';
import { getWorkspaceSettings } from '../projections/workspace-settings.js';
import { READ_NOT_FOUND_BODY, requireMember } from '../read/membership.js';
import { NOTE_PROJECT_LIVE_WHERE } from '../read/notes.js';
import { SqlParams } from '../read/sql-params.js';
import { dueDateOfClaim } from '../read/ticket-cards.js';
import { LIVE_TICKET_WHERE, visibleNotesWhere, visibleTicketsWhere } from '../read/visible-where.js';
import { visibleMemberIds } from '../read/workspace-counts.js';
import { addIstDays, classifyDue } from './attention.js';

type HomeTicketRow = { ticket_id: string; state_category: StateCategory; closed: boolean; due_claim: FieldClaim | null };
type Dated = { id: string; day: string };

/** The first `HOME_ID_CAP` ids, in the order given. The count is taken BEFORE this, never after. */
export function capIds(ids: readonly string[]): string[] {
  return ids.slice(0, HOME_ID_CAP);
}

const byDayThenId = (a: Dated, b: Dated): number =>
  a.day < b.day ? -1 : a.day > b.day ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

/**
 * Home's six numbers (spec E §2.2, §2.4). ONE ticket SELECT supplies Tickets, Open, Past due and Due soon: the
 * counts are lengths of the id lists built from the same rows, so a count and the items it lights cannot
 * disagree. It selects four columns, never a card — `readAttention` assembles a full card per ticket and would
 * not meet the 120 ms budget (27.600).
 *
 * - Visibility is `visibleTicketsWhere` / `visibleNotesWhere` / the roster clause, CONSUMED (as attention does).
 * - The trash is `LIVE_TICKET_WHERE` and `n.deleted = FALSE` + `NOTE_PROJECT_LIVE_WHERE` (as `listNotes` does).
 * - Open = not `terminal` and not closed (decision D-E1, the same exclusion `readAttention` makes at :188).
 * - Past due / Due soon = `classifyDue` over the claimed due day only (`dueDateOfClaim`), today and the horizon
 *   in IST from `now` and the workspace's `dueSoonDays` (attention's own arithmetic, `addIstDays`).
 * - Archived projects are counted (D-E2), which is what makes 27.611's agreement with attention exact.
 */
export async function readHome(
  db: Queryable,
  eff: EffectiveRole,
  viewerId: string,
  workspaceId: string,
  now: Date,
): Promise<HomeResponse> {
  const settings = await getWorkspaceSettings(db, workspaceId);
  const today = istDayOf(now.toISOString());
  const horizon = addIstDays(today, settings.dueSoonDays);

  const params = new SqlParams();
  const where = [`t.workspace_id = ${params.add(workspaceId)}`, visibleTicketsWhere(eff, viewerId, params), LIVE_TICKET_WHERE];
  const { rows } = await db.query<HomeTicketRow>(
    `SELECT t.ticket_id, t.state_category, (t.closed_at IS NOT NULL) AS closed, t.fields -> 'dueDate' AS due_claim
       FROM proj_tickets t
       JOIN proj_visibility v ON v.ticket_id = t.ticket_id
      WHERE ${where.join(' AND ')}
      ORDER BY t.ticket_id DESC`,
    params.toArray(),
  );

  const tickets: string[] = [];
  const open: string[] = [];
  const pastDue: Dated[] = [];
  const dueSoon: Dated[] = [];
  for (const row of rows) {
    tickets.push(row.ticket_id);
    if (row.state_category === 'terminal' || row.closed) continue;
    open.push(row.ticket_id);
    const due = dueDateOfClaim(row.due_claim ?? undefined, row.ticket_id);
    if (due.state !== 'claimed') continue;
    const verdict = classifyDue(due.claim.date, today, horizon);
    if (verdict === null) continue;
    (verdict.kind === 'overdue' ? pastDue : dueSoon).push({ id: row.ticket_id, day: due.claim.date });
  }
  pastDue.sort(byDayThenId);
  dueSoon.sort(byDayThenId);

  const noteParams = new SqlParams();
  const noteWhere = [
    `n.workspace_id = ${noteParams.add(workspaceId)}`,
    visibleNotesWhere(eff, viewerId, noteParams),
    NOTE_PROJECT_LIVE_WHERE,
    'n.deleted = FALSE',
  ];
  const { rows: noteRows } = await db.query<{ note_id: string }>(
    `SELECT n.note_id FROM proj_notes n WHERE ${noteWhere.join(' AND ')} ORDER BY n.updated_at DESC, n.note_id`,
    noteParams.toArray(),
  );
  const notes = noteRows.map((row) => row.note_id);
  const members = await visibleMemberIds(db, eff, workspaceId);

  return {
    workspaceId,
    generatedAt: now.toISOString(),
    dueSoonDays: settings.dueSoonDays,
    counts: {
      tickets: tickets.length,
      open: open.length,
      pastDue: pastDue.length,
      dueSoon: dueSoon.length,
      members: members === null ? null : members.length,
      notes: notes.length,
    },
    ids: {
      tickets: capIds(tickets),
      open: capIds(open),
      pastDue: capIds(pastDue.map((d) => d.id)),
      dueSoon: capIds(dueSoon.map((d) => d.id)),
      members: capIds(members ?? []),
      notes: capIds(notes),
    },
  };
}

/** `GET /v1/workspaces/:workspaceId/home` — attention's door exactly: 401 by the preHandler, 404 by `requireMember`. */
export function registerHomeRoutes(
  app: FastifyInstance,
  deps: { pool: Queryable; now?: () => Date },
  requireSession: preHandlerHookHandler,
): void {
  const now = deps.now ?? ((): Date => new Date());
  app.get<{ Params: { workspaceId: string } }>(
    '/v1/workspaces/:workspaceId/home',
    { preHandler: requireSession },
    async (request, reply) => {
      const { workspaceId } = request.params;
      const viewerId = request.currentUserId;
      const eff = await requireMember(deps.pool, viewerId, workspaceId);
      if (eff === null) return reply.status(404).send(READ_NOT_FOUND_BODY);
      return readHome(deps.pool, eff, viewerId, workspaceId, now());
    },
  );
}
