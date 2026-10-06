import {
  istDayOf,
  planAlone,
  planFlow,
  segmentsFor,
  TIMELINE_FLOW_CAP,
  TIMELINE_INDEX_CAP,
  type FlowNode,
  type NodePlan,
  type NotTakenResolution,
  type TimelineDetail,
  type TimelineEntry,
  type TimelineFlow,
  type TimelineFlowNode,
  type TimelinePin,
  type TimelineResolution,
  type TimelineTrayItem,
  type WorkPeriod,
} from '@gisik-nokma/domain';

/** One loaded ticket: what the SQL read plus the facts the assembler needs. Pure data, so the assembler is testable without a database. */
export type LoadedTicket = {
  id: string;
  workspaceId: string;
  projectId: string;
  stateName: string;
  assigneeId: string | null;
  title: string;
  /** Passes the project / Me narrowing. Out-of-scope tickets are flow members only. */
  inScope: boolean;
  /** IST day of `TicketState.closed.at` (null when open): the stub day of a never-started Not-taken ticket (D-W4-11). */
  closedDay: string | null;
  /** Part 2's single flow input (type, state, category, draft, dates, estimates, wait-for-all, periods as instants, passes, rounds, `notTaken`), made in `load.ts` by `flowNodeOf(rowToTicketState(row), def, { draft })` and by nothing else (Part 2 T10). */
  node: FlowNode;
};
export type LoadedEdge = { workspaceId: string; from: string; to: string; kind: 'leads_to' | 'blocks'; label: string | null };
export type Limits = { index: number; flow: number };
export const DEFAULT_LIMITS: Limits = { index: TIMELINE_INDEX_CAP, flow: TIMELINE_FLOW_CAP };

export type ScopeCore = {
  today: string;
  entries: TimelineEntry[];
  flows: TimelineFlow[];
  tray: TimelineTrayItem[];
  details: Map<string, TimelineDetail>;
  truncated: null | { dropped: number; before: string };
};

const NO_PIN: TimelinePin = { notes: 0, attachments: 0 };

/**
 * Weakly connected components over `leads_to` edges whose two ends are both LOADED: a hidden ticket is simply never loaded, so it is a hole
 * and the walk cannot pass through it (FL-1). A component is named by its smallest member id; members are sorted. Deterministic.
 */
export function componentsOf(ids: readonly string[], edges: readonly LoadedEdge[]): Map<string, string[]> {
  const parent = new Map(ids.map((x) => [x, x]));
  const find = (x: string): string => {
    let r = x;
    while (parent.get(r) !== r) r = parent.get(r) as string;
    for (let c = x; parent.get(c) !== r; ) {
      const next = parent.get(c) as string;
      parent.set(c, r);
      c = next;
    }
    return r;
  };
  for (const e of edges) {
    if (e.kind !== 'leads_to' || !parent.has(e.from) || !parent.has(e.to)) continue;
    const a = find(e.from);
    const b = find(e.to);
    if (a !== b) parent.set(a < b ? b : a, a < b ? a : b); // always attach the larger root under the smaller: roots stay the minimum
  }
  const out = new Map<string, string[]>();
  for (const x of [...ids].sort()) {
    const r = find(x);
    out.set(r, [...(out.get(r) ?? []), x]);
  }
  return out;
}

/** `FlowNode.periods` are instants (WP-1); `segmentsFor` draws IST days. `planFlow` converts for itself (Part 2 T11, `istDayOf(period.end)`). */
export const dayPeriods = (periods: readonly WorkPeriod[]) =>
  periods.map((p) => ({ start: istDayOf(p.start), end: p.end === null ? null : istDayOf(p.end), pass: p.pass }));

/**
 * The resolution AS SERVED (FL-1, PTR privacy rule): the Decision's id and its outcome only when that Decision is loaded for
 * this viewer (`seen`: a hidden ticket is never loaded); else the id is `null` and the outcome, the hidden Decision's authored
 * branch name, is not served (planner ruling 2026-10-06 05:46); the kind and the pass stay. Part 3's `buildFlowRead` serves
 * a hole the same way (`resolutionRead`, 29.449). `planFlow` reads only whether `notTaken` is null, so the plan is unchanged.
 * The server's fold never holds a withheld cause, so `decisionTicketId` is a string here; a `null` one is never in `seen`.
 */
export function servedResolution(r: NotTakenResolution | null, seen: ReadonlySet<string | null>): TimelineResolution {
  if (r === null) return null;
  return seen.has(r.decisionTicketId) ? { ...r } : { kind: r.kind, decisionTicketId: null, pass: r.pass };
}

/**
 * Each component's edges, in ONE pass over them (owner ruling (c), 10-06: a scan of every edge per component, singletons
 * included, was the assembler's cost). An edge belongs to the component holding BOTH its ends; one across two components
 * (a `blocks`) or touching an unloaded id belongs to none. Each bucket keeps the edges' input order.
 */
function edgesByComponent(components: ReadonlyMap<string, readonly string[]>, edges: readonly LoadedEdge[]): Map<string, LoadedEdge[]> {
  const rootOf = new Map<string, string>();
  for (const [root, members] of components) for (const m of members) rootOf.set(m, root);
  const out = new Map<string, LoadedEdge[]>([...components.keys()].map((root) => [root, []]));
  for (const e of edges) {
    const root = rootOf.get(e.from);
    if (root !== undefined && root === rootOf.get(e.to)) (out.get(root) as LoadedEdge[]).push(e);
  }
  return out;
}

export function assembleScope(
  i: { tickets: readonly LoadedTicket[]; edges: readonly LoadedEdge[]; keys: ReadonlyMap<string, string | null>; pins: ReadonlyMap<string, TimelinePin>; today: string },
  limits: Limits = DEFAULT_LIMITS,
): ScopeCore {
  const byId = new Map(i.tickets.map((t) => [t.id, t]));
  const seen = new Set(byId.keys());
  const entries: TimelineEntry[] = [];
  const flows: TimelineFlow[] = [];
  const tray: TimelineTrayItem[] = [];
  const details = new Map<string, TimelineDetail>();
  const components = componentsOf([...byId.keys()], i.edges);
  const edgesOf = edgesByComponent(components, i.edges);

  for (const [root, members] of components) {
    const inFlow = members.length > 1;
    const nodes = members.map((m) => (byId.get(m) as LoadedTicket).node);
    const inner = edgesOf.get(root) as LoadedEdge[];
    const leads = inner.filter((e) => e.kind === 'leads_to');
    // A component with no `leads_to` is one ticket (the engine refuses a self-link, `link.self`): `planAlone` answers what
    // `planFlow` would, without the analysis (owner ruling (c)).
    const plan =
      leads.length === 0
        ? new Map([[root, planAlone(nodes[0] as FlowNode)]])
        : planFlow({ nodes, edges: leads.map(({ from, to, label }) => ({ sourceId: from, targetId: to, label })) });
    const tooBig = members.length > limits.flow;
    if (inFlow && members.some((m) => (byId.get(m) as LoadedTicket).inScope)) {
      flows.push({
        id: root,
        workspaceId: (byId.get(root) as LoadedTicket).workspaceId,
        truncated: tooBig,
        nodes: tooBig ? [] : nodes.map((n): TimelineFlowNode => ({ ...n, notTaken: servedResolution(n.notTaken, seen) })),
        edges: tooBig ? [] : inner.map(({ from, to, kind, label }) => ({ from, to, kind, label })),
      });
    }
    for (const m of members) {
      const tk = byId.get(m) as LoadedTicket; // a member is a loaded id (`componentsOf` over `byId`'s keys)
      const np = plan.get(m) as NodePlan; // `planFlow` answers every node it is given; `planAlone` the one
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
  return { today: i.today, entries, flows, tray, details, truncated: null };
}

/** TG-6 / TG-12: the lowest-id Decision with a LABELLED edge into this ticket. Only loaded (visible) Decisions are in `byId`, and an inner edge joins two of them (`edgesByComponent`). */
function reachedBy(
  target: string,
  edges: readonly LoadedEdge[],
  byId: ReadonlyMap<string, LoadedTicket>,
  keys: ReadonlyMap<string, string | null>,
): TimelineTrayItem['reachedBy'] {
  const via = edges
    .filter((e) => e.kind === 'leads_to' && e.to === target && e.label !== null && (byId.get(e.from) as LoadedTicket).node.isDecision)
    .sort((a, b) => (a.from < b.from ? -1 : 1))[0];
  if (via === undefined) return null;
  const d = byId.get(via.from) as LoadedTicket;
  return { decisionTicketId: d.id, decisionKey: keys.get(d.id) ?? null, decisionTitle: d.title, outcome: via.label as string };
}

const endOf = (e: TimelineEntry): string => e.segments.reduce((m, s) => (s.end > m ? s.end : m), '');

const byIdAsc = (a: { id: string }, b: { id: string }): number => (a.id < b.id ? -1 : 1);

/**
 * Merge per-workspace cores and apply PR-0's cap: the entries that ended longest ago go first. Entries and tray rows are
 * put in `ticket_id` order ACROSS workspaces HERE, the one place the served order is made (a core lists them component by
 * component; `computeScope` merges even one core): the tray's keyset pager (`id > cursor`) needs that order.
 */
export function mergeCores(today: string, cores: readonly ScopeCore[], limits: Limits = DEFAULT_LIMITS): ScopeCore {
  const all = cores.flatMap((c) => c.entries).sort(byIdAsc);
  let entries = all;
  let truncated: ScopeCore['truncated'] = null;
  if (all.length > limits.index) {
    const byEnd = [...all].sort((a, b) => (endOf(a) < endOf(b) ? -1 : endOf(a) > endOf(b) ? 1 : a.id < b.id ? -1 : 1));
    const keep = new Set(byEnd.slice(all.length - limits.index).map((e) => e.id));
    entries = all.filter((e) => keep.has(e.id));
    truncated = { dropped: all.length - limits.index, before: endOf(byEnd[all.length - limits.index] as TimelineEntry) };
  }
  return {
    today,
    entries,
    flows: cores.flatMap((c) => c.flows),
    tray: cores.flatMap((c) => c.tray).sort(byIdAsc),
    details: new Map(cores.flatMap((c) => [...c.details])),
    truncated,
  };
}
