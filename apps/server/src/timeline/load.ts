import { flowNodeOf, istDayOf, statesWithBacklog, type TimelinePin } from '@gisik-nokma/domain';
import type { Queryable } from '../db/queryable.js';
import type { EffectiveRole } from '../permissions/effective-role.js';
import { rowToTicketState } from '../projections/tickets.js';
import { listMyDrafts } from '../read/drafts.js';
import { NOTE_PROJECT_LIVE_WHERE } from '../read/notes.js';
import { SqlParams } from '../read/sql-params.js';
import { LIVE_TICKET_WHERE, visibleNotesWhere, visibleTicketsWhere } from '../read/visible-where.js';
import { foldedDefKey, foldedWorkflowDefs } from '../read/workflow-defs.js';
import type { LoadedEdge, LoadedTicket } from './assemble.js';
import type { TimelineScope } from './scope.js';

/** The projection row `rowToTicketState` folds, declared as Part 2 T12's `walkFlow` declares it (`read-flow.ts`). `t.*` carries Part 2's and Drafts' columns. */
type TicketRow = Parameters<typeof rowToTicketState>[0];
type Row = TicketRow & { in_scope?: boolean };
type Def = Parameters<typeof flowNodeOf>[1];

/** Part 2's one way to make a flow input: fold the row, then `flowNodeOf` against the ticket's own workflow version (Part 2 plan :5359-5384). */
function loaded(row: Row, inScope: boolean, draft: boolean, def: Def, stateName: string): LoadedTicket {
  const title = row.fields['title']?.value;
  const state = rowToTicketState(row);
  return {
    id: row.ticket_id,
    workspaceId: row.workspace_id,
    projectId: row.project_id,
    stateName,
    assigneeId: row.assignee_id,
    title: typeof title === 'string' ? title : '',
    inScope,
    closedDay: state.closed?.at ? istDayOf(state.closed.at) : null,
    node: flowNodeOf(state, def, { draft }),
  };
}

/** D-W4-4: Me = assigned OR collaborating (the clause of `read/compile-filter.ts:100`), not My Work's assignee-only rule. */
const meClause = (viewerId: string, params: SqlParams): string =>
  `(t.assignee_id = ${params.add(viewerId)} OR t.collaborator_ids @> to_jsonb(${params.add(viewerId)}::text))`;

/**
 * One workspace's loaded set: the viewer's VISIBLE live tickets that are in scope, plus every visible ticket at either end of a `leads_to`
 * (flow members the narrowing leaves out), plus the viewer's OWN live drafts through `listMyDrafts` (D-W4-5; `LIVE_TICKET_WHERE` holds no
 * draft). Hidden tickets are not loaded, so they are holes. Edges are kept only when BOTH ends are loaded.
 */
export async function loadWorkspace(
  db: Queryable,
  eff: EffectiveRole,
  viewerId: string,
  workspaceId: string,
  scope: TimelineScope,
): Promise<{ tickets: LoadedTicket[]; edges: LoadedEdge[]; rows: Row[] }> {
  const params = new SqlParams();
  const scoped: string[] = ['TRUE'];
  if (scope.projectIds.length > 0) scoped.push(`t.project_id = ANY(${params.add(scope.projectIds)}::text[])`);
  if (scope.mine) scoped.push(meClause(viewerId, params));
  const inScopeSql = scoped.join(' AND ');
  const visible = `${visibleTicketsWhere(eff, viewerId, params)} AND ${LIVE_TICKET_WHERE}`;
  const { rows } = await db.query<Row>(
    `SELECT t.*, (${inScopeSql}) AS in_scope
       FROM proj_tickets t
       JOIN proj_visibility v ON v.ticket_id = t.ticket_id
      WHERE t.workspace_id = ${params.add(workspaceId)} AND ${visible}
        AND ((${inScopeSql}) OR EXISTS (
              SELECT 1 FROM proj_ticket_links l
               WHERE l.kind = 'leads_to' AND (l.source_id = t.ticket_id OR l.target_id = t.ticket_id)))
      ORDER BY t.ticket_id`,
    params.toArray(),
  );

  const mine = await listMyDrafts(db, viewerId, workspaceId);
  // `listMyDrafts` still lists a soft-deleted draft (`ticket.deleted` does not discard it): the row fetch drops it, as
  // walkFlow's own-draft arm does (`read-flow.ts`, `t.deleted_at IS NULL`).
  const draftRows =
    mine.length === 0
      ? []
      : (
          await db.query<Row>('SELECT t.* FROM proj_tickets t WHERE t.workspace_id = $1 AND t.ticket_id = ANY ($2::text[]) AND t.deleted_at IS NULL', [
            workspaceId,
            mine.map((d) => d.ticketId),
          ])
        ).rows;
  const draftIds = new Set(draftRows.map((r) => r.ticket_id));
  const all = [...rows.filter((r) => !draftIds.has(r.ticket_id)), ...draftRows];

  const defs = await foldedWorkflowDefs(db, workspaceId, all.map((r) => ({ workflowId: r.workflow_id, version: r.workflow_version })));
  const defOf = (r: Row): Def => {
    const def = defs.get(foldedDefKey(r.workflow_id, r.workflow_version));
    if (def === undefined) {
      throw new Error(`loadWorkspace: no workflow definition ${r.workflow_id}@${r.workflow_version} for ticket ${r.ticket_id}; the projection and the ledger disagree`);
    }
    return def;
  };
  const stateName = (r: Row): string => statesWithBacklog(defOf(r)).find((s) => s.id === r.state_id)?.name ?? r.state_id;
  const draftInScope = (r: Row): boolean =>
    (scope.projectIds.length === 0 || scope.projectIds.includes(r.project_id)) &&
    (!scope.mine || r.assignee_id === viewerId || r.collaborator_ids.includes(viewerId));
  const tickets = all.map((r) =>
    loaded(r, draftIds.has(r.ticket_id) ? draftInScope(r) : r.in_scope === true, draftIds.has(r.ticket_id), defOf(r), stateName(r)),
  );

  const ids = new Set(tickets.map((t) => t.id));
  const { rows: edgeRows } = await db.query<{ source_id: string; target_id: string; kind: 'leads_to' | 'blocks'; label: string | null }>(
    `SELECT source_id, target_id, kind, label FROM proj_ticket_links WHERE workspace_id = $1 AND kind IN ('leads_to', 'blocks')`,
    [workspaceId],
  );
  const edges: LoadedEdge[] = edgeRows
    .filter((e) => ids.has(e.source_id) && ids.has(e.target_id))
    .map((e) => ({ workspaceId, from: e.source_id, to: e.target_id, kind: e.kind, label: e.label }));
  return { tickets, edges, rows: all };
}

/**
 * TG-11 / D-W4-2: per ticket, the notes THIS viewer can see attached to it and its ticket-owned attachments. A note-owned attachment has
 * `ticket_id IS NULL` (`1790110000000_attachments-note-owner.sql`) and is not counted; no attachment-removal event exists on the tip, so every row is live
 * until a purge deletes it (`purge/erasure.ts`).
 */
export async function loadPins(db: Queryable, eff: EffectiveRole, viewerId: string, ticketIds: readonly string[]): Promise<Map<string, TimelinePin>> {
  const pins = new Map<string, TimelinePin>();
  if (ticketIds.length === 0) return pins;
  const params = new SqlParams();
  const ids = params.add([...ticketIds]);
  const notes = await db.query<{ ticket_id: string; n: number }>(
    `SELECT pa.ticket_id, count(DISTINCT n.note_id)::int AS n
       FROM proj_note_attachments pa
       JOIN proj_notes n ON n.note_id = pa.note_id
      WHERE pa.ticket_id = ANY(${ids}::text[]) AND n.deleted = FALSE AND ${NOTE_PROJECT_LIVE_WHERE} AND ${visibleNotesWhere(eff, viewerId, params)}
      GROUP BY pa.ticket_id`,
    params.toArray(),
  );
  const files = await db.query<{ ticket_id: string; n: number }>(
    `SELECT ticket_id, count(*)::int AS n FROM attachments WHERE ticket_id = ANY($1::text[]) GROUP BY ticket_id`,
    [[...ticketIds]],
  );
  for (const r of notes.rows) pins.set(r.ticket_id, { notes: r.n, attachments: 0 });
  for (const r of files.rows) pins.set(r.ticket_id, { notes: pins.get(r.ticket_id)?.notes ?? 0, attachments: r.n });
  return pins;
}
