import {
  LINKED_FROM_PAGE_SIZE,
  ticketKey,
  type LinkedFromPage,
  type LinkedFromRow,
  type LinkedFromTarget,
  type StateCategory,
} from '@gisik-nokma/domain';
import type { Queryable } from '../db/queryable.js';
import type { EffectiveRole } from '../permissions/effective-role.js';
import { workspaceIdentityFromLedger } from '../workspaces/workspace-name.js';
import { NOTE_PROJECT_LIVE_WHERE } from './notes.js';
import { SqlParams } from './sql-params.js';
import { ticketNumbers } from './ticket-numbers.js';
import { LIVE_TICKET_WHERE, visibleNotesWhere, visibleTicketsWhere } from './visible-where.js';
import { projectPrefixesInWorkspace } from './visible-projects.js';

/**
 * "Linked from" (Knowledge Graph spec B §2.2, §3.2): the ONLY read of
 * `proj_references`. A row is returned only when the viewer may see its SOURCE
 * — the ticket arm applies `visibleTicketsWhere` + `LIVE_TICKET_WHERE`, the
 * note arm `visibleNotesWhere` + `n.deleted = FALSE` + `NOTE_PROJECT_LIVE_WHERE`
 * (a comment is seen through its parent) — and `total` is counted from the
 * same statement, so a hidden source is never a count either. The target's
 * own visibility is the CALLER's check (routes/references.ts).
 *
 * One row per source (its lowest ordinal); a source that IS the target is
 * left out. Newest source first by `seq` (unique per source: one event wrote
 * its body), which is also the cursor.
 */
type VisRow = {
  source_kind: 'ticket' | 'note' | 'comment';
  source_id: string;
  source_parent_kind: 'ticket' | 'note';
  source_parent_id: string;
  snippet: string;
  updated_by: string;
  updated_at: Date;
  seq: string;
  ticket_project_id: string | null;
  parent_title: string | null;
  ticket_state_category: StateCategory | null;
};

function visibleSources(eff: EffectiveRole, userId: string, workspaceId: string, target: LinkedFromTarget, params: SqlParams): string {
  const ws = params.add(workspaceId);
  const kind = params.add(target.kind);
  const id = params.add(target.id);
  const ticketArm = visibleTicketsWhere(eff, userId, params);
  const noteArm = visibleNotesWhere(eff, userId, params);
  return `WITH firsts AS (
      SELECT DISTINCT ON (r.source_kind, r.source_id)
             r.source_kind, r.source_id, r.source_parent_kind, r.source_parent_id, r.snippet, r.updated_by, r.updated_at, r.seq
        FROM proj_references r
       WHERE r.workspace_id = ${ws} AND r.target_kind = ${kind} AND r.target_id = ${id}
         AND NOT (r.source_kind = ${kind} AND r.source_id = ${id})
       ORDER BY r.source_kind, r.source_id, r.ordinal
    ),
    vis AS (
      SELECT f.*, t.project_id AS ticket_project_id, t.fields -> 'title' ->> 'value' AS parent_title, t.state_category AS ticket_state_category
        FROM firsts f
        JOIN proj_tickets t ON t.ticket_id = f.source_parent_id
        JOIN proj_visibility v ON v.ticket_id = f.source_parent_id
       WHERE f.source_parent_kind = 'ticket' AND t.workspace_id = ${ws} AND ${LIVE_TICKET_WHERE} AND ${ticketArm}
      UNION ALL
      SELECT f.*, NULL::text, n.title, NULL::text
        FROM firsts f
        JOIN proj_notes n ON n.note_id = f.source_parent_id
       WHERE f.source_parent_kind = 'note' AND n.workspace_id = ${ws} AND n.deleted = FALSE AND ${NOTE_PROJECT_LIVE_WHERE} AND ${noteArm}
    )`;
}

export async function listLinkedFrom(
  db: Queryable,
  eff: EffectiveRole,
  userId: string,
  workspaceId: string,
  target: LinkedFromTarget,
  cursor: string | null,
): Promise<LinkedFromPage> {
  const countParams = new SqlParams();
  const countSql = `${visibleSources(eff, userId, workspaceId, target, countParams)} SELECT count(*)::int AS n FROM vis`;
  const total = (await db.query<{ n: number }>(countSql, countParams.toArray())).rows[0]?.n ?? 0;
  if (total === 0) return { total: 0, items: [], nextCursor: null };

  const params = new SqlParams();
  const cte = visibleSources(eff, userId, workspaceId, target, params);
  const after = cursor === null ? '' : `WHERE seq < ${params.add(cursor)}::bigint`;
  const { rows } = await db.query<VisRow>(
    `${cte} SELECT * FROM vis ${after} ORDER BY seq DESC, source_kind, source_id LIMIT ${LINKED_FROM_PAGE_SIZE + 1}`,
    params.toArray(),
  );
  const page = rows.slice(0, LINKED_FROM_PAGE_SIZE);
  const ticketIds = page.filter((row) => row.source_parent_kind === 'ticket').map((row) => row.source_parent_id);
  const identity = await workspaceIdentityFromLedger(db, workspaceId);
  const prefixes = await projectPrefixesInWorkspace(db, workspaceId);
  const numbers = await ticketNumbers(db, workspaceId, ticketIds);
  const items = page.map((row): LinkedFromRow => {
    const base = { sourceKind: row.source_kind, sourceId: row.source_id, authorId: row.updated_by, snippet: row.snippet, updatedAt: row.updated_at.toISOString() };
    if (row.source_parent_kind === 'note') {
      return { ...base, parent: { kind: 'note', noteId: row.source_parent_id, title: row.parent_title ?? '' } };
    }
    const projectId = row.ticket_project_id ?? '';
    const projectPrefix = prefixes.get(projectId) ?? null;
    const number = numbers.get(row.source_parent_id) ?? null;
    const key = identity.prefix === null || projectPrefix === null || number === null ? '' : ticketKey(identity.prefix, projectPrefix, number);
    return {
      ...base,
      parent: { kind: 'ticket', ticketId: row.source_parent_id, projectId, key, title: row.parent_title ?? '', stateCategory: row.ticket_state_category ?? 'open' },
    };
  });
  const last = page[page.length - 1];
  return { total, items, nextCursor: rows.length > LINKED_FROM_PAGE_SIZE && last !== undefined ? String(last.seq) : null };
}
