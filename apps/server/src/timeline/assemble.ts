import {
  istDayOf,
  planFlow,
  segmentsFor,
  TIMELINE_FLOW_CAP,
  TIMELINE_INDEX_CAP,
  type FlowNode,
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
 * The resolution AS SERVED (FL-1, PTR privacy rule): the Decision's id only when that Decision is loaded for this viewer
 * (`seen`: a hidden ticket is never loaded), else `null`; the outcome and the pass stay. Part 3's `buildFlowRead` blanks
 * `FlowNodeRead.resolution` the same way. `planFlow` reads only whether `notTaken` is null, so the plan is unchanged.
 */
export function servedResolution(r: NotTakenResolution | null, seen: ReadonlySet<string>): TimelineResolution {
  return r === null ? null : { ...r, decisionTicketId: seen.has(r.decisionTicketId) ? r.decisionTicketId : null };
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

const endOf = (e: TimelineEntry): string => e.segments.reduce((m, s) => (s.end > m ? s.end : m), '');

/** Merge per-workspace cores and apply PR-0's cap: the entries that ended longest ago go first. */
export function mergeCores(today: string, cores: readonly ScopeCore[], limits: Limits = DEFAULT_LIMITS): ScopeCore {
  const all = cores.flatMap((c) => c.entries);
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
    tray: cores.flatMap((c) => c.tray),
    details: new Map(cores.flatMap((c) => [...c.details])),
    truncated,
  };
}
