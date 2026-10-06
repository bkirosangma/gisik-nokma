import { flowNodeOf, istDayOf, statesWithBacklog } from '@gisik-nokma/domain';
import type { Queryable } from '../db/queryable.js';
import type { EffectiveRole } from '../permissions/effective-role.js';
import { rowToTicketState } from '../projections/tickets.js';
import { listMyDrafts } from '../read/drafts.js';
import { SqlParams } from '../read/sql-params.js';
import { LIVE_TICKET_WHERE, visibleTicketsWhere } from '../read/visible-where.js';
import { foldedDefKey, foldedWorkflowDefs } from '../read/workflow-defs.js';
import type { LoadedEdge, LoadedTicket } from './assemble.js';
import type { TimelineScope } from './scope.js';

/** The projection row `rowToTicketState` folds, declared as Part 2 T12's `walkFlow` declares it (`read-flow.ts`). */
type TicketRow = Parameters<typeof rowToTicketState>[0];
type Def = Parameters<typeof flowNodeOf>[1];

/**
 * The columns this file reads (owner ruling (c), 10-06: `t.*` fetched and parsed every row's history and links): what
 * `loaded` folds through `rowToTicketState` and `flowNodeOf`, `draftInScope`'s, and `cardKeysFor`'s three.
 */
const FOLD_COLUMNS = [
  'ticket_id', 'workspace_id', 'project_id', 'type_id', 'parent_id', 'workflow_id', 'workflow_version', 'state_id', 'state_category',
  'assignee_id', 'collaborator_ids', 'fields', 'closed_at', 'closed_by', 'closed_cause', 'deleted_at', 'deleted_by', 'outcome', 'passes',
  'periods', 'rounds',
] as const satisfies readonly (keyof TicketRow)[];
type FoldRow = Pick<TicketRow, (typeof FOLD_COLUMNS)[number]>;
type Row = FoldRow & { in_scope?: boolean };
/**
 * The claims the fold reads from `fields`: `title` (`loaded`) and the five `flowNodeOf` reads (`dayClaim`, `claimedEstimate`,
 * `claimedWaitForAll`). The rest of the bag (a description is the large one) is never fetched.
 */
export const FOLD_FIELD_IDS = ['title', 'startDate', 'dueDate', 'estimate', 'reworkEstimate', 'waitForAll'] as const;
/** `fields` as the claims above, an absent claim left out (never a JSON null in its place). */
const FOLD_SELECT = FOLD_COLUMNS.map((c) =>
  c === 'fields'
    ? `coalesce((SELECT jsonb_object_agg(f.key, f.value) FROM jsonb_each(t.fields) AS f WHERE f.key IN (${FOLD_FIELD_IDS.map((k) => `'${k}'`).join(', ')})), '{}'::jsonb) AS fields`
    : `t.${c}`,
).join(', ');
/**
 * The columns `rowToTicketState` reads that the fold never does, as the values of a ticket that has none: it takes a whole
 * row and reads these unconditionally (`links.length`, `pending_children.length`, `draft_at.toISOString()` behind its
 * null check), and `flowNodeOf` reads none of what they become (the draft flag comes from `listMyDrafts`, not the row).
 * Typed as exactly the columns `FOLD_COLUMNS` leaves out, so a new projection column fails to compile until it is read or
 * named here. `equivalence.test.ts` (29.295/29.299) proves the bodies byte-identical to the `t.*` read's.
 */
const UNREAD: Omit<TicketRow, (typeof FOLD_COLUMNS)[number]> = {
  transitions: [],
  rank: null,
  reopened_at: null,
  draft_author_id: null,
  draft_at: null,
  draft_discarded: null,
  links: [],
  pending_children: [],
  started_at: null,
  ended_at: null,
};

/** Part 2's one way to make a flow input: fold the row, then `flowNodeOf` against the ticket's own workflow version (Part 2 plan :5359-5384). */
function loaded(row: Row, inScope: boolean, draft: boolean, def: Def, stateName: string): LoadedTicket {
  const title = row.fields['title']?.value;
  const state = rowToTicketState({ ...UNREAD, ...row });
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
    `SELECT ${FOLD_SELECT}, (${inScopeSql}) AS in_scope
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
          await db.query<Row>(`SELECT ${FOLD_SELECT} FROM proj_tickets t WHERE t.workspace_id = $1 AND t.ticket_id = ANY ($2::text[]) AND t.deleted_at IS NULL`, [
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
