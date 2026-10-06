import {
  flowNodeOf,
  istDayOf,
  planFlow,
  segmentsFor,
  statesWithBacklog,
  TIMELINE_PAGE_SIZE,
  type TimelineChunkResponse,
  type TimelineEntry,
  type TimelineFlow,
  type TimelineFlowNode,
  type TimelinePin,
  type TimelineIndexResponse,
  type TimelineDetail,
  type TimelineTrayItem,
  type TimelineTrayResponse,
} from '@gisik-nokma/domain';
import type { Queryable } from '../../../src/db/queryable.js';
import type { EffectiveRole } from '../../../src/permissions/effective-role.js';
import { rowToTicketState } from '../../../src/projections/tickets.js';
import { listMyDrafts } from '../../../src/read/drafts.js';
import { SqlParams } from '../../../src/read/sql-params.js';
import { cardKeysFor } from '../../../src/read/ticket-cards.js';
import { LIVE_TICKET_WHERE, visibleTicketsWhere } from '../../../src/read/visible-where.js';
import { foldedDefKey, foldedWorkflowDefs } from '../../../src/read/workflow-defs.js';
import {
  componentsOf,
  DEFAULT_LIMITS,
  dayPeriods,
  mergeCores,
  servedResolution,
  type Limits,
  type LoadedEdge,
  type LoadedTicket,
  type ScopeCore,
} from '../../../src/timeline/assemble.js';
import { readAsOf } from '../../../src/timeline/as-of.js';
import { pinCountsFor } from '../../../src/read/pin-counts.js';
import type { ReadableWorkspace, TimelineScope } from '../../../src/timeline/scope.js';

/**
 * THE ORACLE for the owner's (c) ruling (AMEND-wtg4-t1-reads-perf.md, 10-06): the Timeline reads as they were at 1882524a,
 * BEFORE edge bucketing, the narrow SELECT and the edgeless-singleton shortcut. `equivalence.test.ts` asserts the shipped
 * reads answer byte-identical bodies to these. Each function body below is a VERBATIM copy of 1882524a's
 * (`git show 1882524a:apps/server/src/timeline/{load,assemble,compute,read-index,read-chunk,read-tray}.ts`), renamed with
 * `BeforeC` and calling its own siblings; the helpers (c) did not touch (`componentsOf`, `dayPeriods`, `servedResolution`,
 * `mergeCores`, `pinCountsFor`, `cardKeysFor`, `readAsOf`) are imported from the shipped code. One line is not 1882524a's:
 * `computeScopeBeforeC`'s pin call reads `pinCountsFor` bound to the core's workspace, where 1882524a called the Timeline's own
 * pin reader, which bound no workspace (wtg4-reads FIX 1 deleted it: both paths read the one shipped reader, which (c) never touched).
 * Never edit a body here to make the comparison pass: the point is that it is the old code.
 */

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
export async function loadWorkspaceBeforeC(
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


const NO_PIN: TimelinePin = { notes: 0, attachments: 0 };

export function assembleScopeBeforeC(
  i: { tickets: readonly LoadedTicket[]; edges: readonly LoadedEdge[]; keys: ReadonlyMap<string, string | null>; pins: ReadonlyMap<string, TimelinePin>; today: string },
  limits: Limits = DEFAULT_LIMITS,
): ScopeCore {
  const byId = new Map(i.tickets.map((t) => [t.id, t]));
  const seen = new Set(byId.keys());
  const entries: TimelineEntry[] = [];
  const flows: TimelineFlow[] = [];
  const tray: TimelineTrayItem[] = [];
  const details = new Map<string, TimelineDetail>();

  for (const [root, members] of componentsOf([...byId.keys()], i.edges)) {
    const set = new Set(members);
    const inFlow = members.length > 1;
    const nodes = members.map((m) => (byId.get(m) as LoadedTicket).node);
    const inner = i.edges.filter((e) => set.has(e.from) && set.has(e.to));
    const plan = planFlow({ nodes, edges: inner.filter((e) => e.kind === 'leads_to').map(({ from, to, label }) => ({ sourceId: from, targetId: to, label })) });
    const tooBig = members.length > limits.flow;
    if (inFlow && members.some((m) => byId.get(m)?.inScope === true)) {
      flows.push({
        id: root,
        workspaceId: (byId.get(root) as LoadedTicket).workspaceId,
        truncated: tooBig,
        nodes: tooBig ? [] : nodes.map((n): TimelineFlowNode => ({ ...n, notTaken: servedResolution(n.notTaken, seen) })),
        edges: tooBig ? [] : inner.map(({ from, to, kind, label }) => ({ from, to, kind, label })),
      });
    }
    for (const m of members) {
      const tk = byId.get(m) as LoadedTicket;
      const np = plan.get(m);
      if (np === undefined) continue;
      const key = i.keys.get(m) ?? null;
      const n = tk.node;
      const segments = segmentsFor({ periods: dayPeriods(n.periods), planned: np.intervals, notTaken: n.notTaken, closedDay: tk.closedDay, today: i.today });
      const firstPlanned = np.intervals.find((p) => p.pruned !== true);
      details.set(m, {
        id: m,
        title: tk.title,
        stateId: n.stateId,
        stateName: tk.stateName,
        assigneeId: tk.assigneeId,
        dueDate: n.explicitDue,
        basis: firstPlanned?.basis ?? null,
        startsBeforePredecessor: np.intervals.some((p) => p.startsBeforePredecessor === true),
        round: n.rounds,
        waitForAll: n.waitForAll,
        estimate: n.estimate,
        passes: n.isDecision ? n.passes : null,
      });
      if (!tk.inScope) continue;
      if (segments.length > 0) {
        entries.push({
          id: m,
          workspaceId: tk.workspaceId,
          key,
          draft: n.draft,
          kind: n.isDecision ? 'decision' : 'ticket',
          lane: tk.projectId,
          segments,
          pin: i.pins.get(m) ?? NO_PIN,
          resolution: servedResolution(n.notTaken, seen),
          category: n.category,
          flowId: inFlow ? root : null,
        });
      } else if (n.notTaken === null) {
        tray.push({
          id: m,
          workspaceId: tk.workspaceId,
          projectId: tk.projectId,
          key,
          title: tk.title,
          draft: n.draft,
          reason: np.unscheduled ?? 'no-dates',
          reachedBy: reachedBy(m, inner, byId, i.keys),
        });
      }
    }
  }
  entries.sort((a, b) => (a.id < b.id ? -1 : 1));
  tray.sort((a, b) => (a.id < b.id ? -1 : 1));
  return { today: i.today, entries, flows, tray, details, truncated: null };
}

/** TG-6 / TG-12: the lowest-id Decision with a LABELLED edge into this ticket. Only loaded (visible) Decisions are in `byId`. */
function reachedBy(
  target: string,
  edges: readonly LoadedEdge[],
  byId: ReadonlyMap<string, LoadedTicket>,
  keys: ReadonlyMap<string, string | null>,
): TimelineTrayItem['reachedBy'] {
  const via = edges
    .filter((e) => e.kind === 'leads_to' && e.to === target && e.label !== null && byId.get(e.from)?.node.isDecision === true)
    .sort((a, b) => (a.from < b.from ? -1 : 1))[0];
  if (via === undefined) return null;
  const d = byId.get(via.from) as LoadedTicket;
  return { decisionTicketId: d.id, decisionKey: keys.get(d.id) ?? null, decisionTitle: d.title, outcome: via.label as string };
}

export async function computeScopeBeforeC(
  db: Queryable,
  readable: readonly ReadableWorkspace[],
  viewerId: string,
  scope: TimelineScope,
  now: Date,
  limits: Limits = DEFAULT_LIMITS,
): Promise<ScopeCore> {
  const today = istDayOf(now.toISOString());
  const cores = await Promise.all(
    readable.map(async ({ workspaceId, eff }) => {
      const loaded = await loadWorkspaceBeforeC(db, eff, viewerId, workspaceId, scope);
      const keys = await cardKeysFor(db, loaded.rows);
      const pins = await pinCountsFor(db, eff, viewerId, workspaceId, loaded.tickets.filter((t) => t.inScope).map((t) => t.id));
      return assembleScopeBeforeC({ tickets: loaded.tickets, edges: loaded.edges, keys, pins, today }, limits);
    }),
  );
  return mergeCores(today, cores, limits);
}

export async function readTimelineIndexBeforeC(
  db: Queryable,
  readable: readonly ReadableWorkspace[],
  viewerId: string,
  scope: TimelineScope,
  now: Date,
): Promise<TimelineIndexResponse> {
  const asOf = await readAsOf(db, readable);
  const core = await computeScopeBeforeC(db, readable, viewerId, scope, now);
  return { today: core.today, asOf, items: core.entries, flows: core.flows, tray: { count: core.tray.length }, truncated: core.truncated };
}

export async function readTimelineChunkBeforeC(
  db: Queryable,
  readable: readonly ReadableWorkspace[],
  viewerId: string,
  scope: TimelineScope,
  now: Date,
  window: { from: string; to: string },
  cursor?: string,
  pageSize: number = TIMELINE_PAGE_SIZE,
): Promise<TimelineChunkResponse> {
  const core = await computeScopeBeforeC(db, readable, viewerId, scope, now);
  const hit = core.entries
    .filter((e) => e.segments.some((s) => s.start <= window.to && s.end >= window.from)) // inclusive both ends
    .filter((e) => cursor === undefined || e.id > cursor)
    .sort((a, b) => (a.id < b.id ? -1 : 1));
  const page = hit.slice(0, pageSize);
  return {
    items: page.map((e) => core.details.get(e.id)).filter((d): d is NonNullable<typeof d> => d !== undefined),
    nextCursor: hit.length > pageSize ? (page[page.length - 1]?.id ?? null) : null,
  };
}

export async function readTimelineTrayBeforeC(
  db: Queryable,
  readable: readonly ReadableWorkspace[],
  viewerId: string,
  scope: TimelineScope,
  now: Date,
  cursor?: string,
  pageSize: number = TIMELINE_PAGE_SIZE,
): Promise<TimelineTrayResponse> {
  const core = await computeScopeBeforeC(db, readable, viewerId, scope, now);
  const rows = core.tray.filter((r) => cursor === undefined || r.id > cursor);
  const page = rows.slice(0, pageSize);
  return { items: page, nextCursor: rows.length > pageSize ? (page[page.length - 1]?.id ?? null) : null };
}
