import { istDayOf } from '../ist-day.js';
import { analyzeFlow } from './analysis.js';
import { effectiveEdges, forwardEdges, liveSet, sameLabel } from './graph.js';
import { edgeKey, type FlowAnalysis, type FlowEdge, type FlowNode } from './types.js';

export type PlannedInterval = {
  /** The pass (round) this interval plans; pass 1 is the original plan and is kept when later passes are added. */
  pass: number;
  /** Inclusive IST days, YYYY-MM-DD. */
  start: string;
  end: string;
  basis: 'explicit' | 'chained';
  /** PL-3: an explicit start earlier than the ready day. A warning glyph; never blocking. */
  startsBeforePredecessor?: true;
  /** PL-6: planned as if the branch had been taken; drawn only as a ghost, never a predecessor end. */
  pruned?: true;
};
export type UnscheduledReason = 'start-after-due' | 'no-estimate' | 'no-dates';
export type NodePlan = {
  /** One per planned pass, ascending pass. */
  intervals: PlannedInterval[];
  /** Why the node's LATEST planned pass has no interval, or null when it has one. */
  unscheduled: UnscheduledReason | null;
  /** PL-4: has a non-pruned planned interval, or has actually been worked. */
  onTimeline: boolean;
};
export type FlowPlan = Map<string, NodePlan>;

type Cell = { interval: PlannedInterval | null; reason: UnscheduledReason | null };

const DAY_MS = 86_400_000;

function addDays(day: string, n: number): string {
  const at = new Date(Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10))) + n * DAY_MS);
  const pad = (v: number, width: number): string => String(v).padStart(width, '0');
  return `${pad(at.getUTCFullYear(), 4)}-${pad(at.getUTCMonth() + 1, 2)}-${pad(at.getUTCDate(), 2)}`;
}
const earliest = (days: readonly string[]): string => days.reduce((a, b) => (b < a ? b : a));
const latest = (days: readonly string[]): string => days.reduce((a, b) => (b > a ? b : a));

/**
 * PL-1 to PL-6, pure and clock-free: no function here reads today, so a plan changes only when an
 * event does (an overdue active predecessor does not slide its successors).
 *
 * Passes: pass 1 is planned for every node (the original plan, kept). Pass k >= 2 is planned for a
 * node whose round reached k, and for the target of a back edge whose Decision recorded that loop
 * outcome in pass k - 1. A predecessor that does not re-run in pass k contributes nothing to pass k.
 *
 * Which edges feed a node: a live node is fed only by live, non-Not-taken sources over the effective
 * graph's non-back edges; a pruned node (not live) is planned as if its branch had been taken, so it
 * is fed by every non-back edge.
 */
export function planFlow(input: { nodes: readonly FlowNode[]; edges: readonly FlowEdge[]; analysis?: FlowAnalysis }): FlowPlan {
  const { nodes, edges } = input;
  const analysis = input.analysis ?? analyzeFlow(nodes, edges);
  const byId = new Map(nodes.map((n) => [n.id, n] as const));
  const live = liveSet(nodes, edges, analysis);
  const effective = new Set(forwardEdges(effectiveEdges(nodes, edges), analysis).map(edgeKey));
  const forward = forwardEdges(edges, analysis).filter((e) => byId.has(e.sourceId) && byId.has(e.targetId));
  const incoming = new Map<string, FlowEdge[]>();
  for (const e of forward) incoming.set(e.targetId, [...(incoming.get(e.targetId) ?? []), e]);
  const loopsInto = new Map<string, FlowEdge[]>();
  for (const e of edges) {
    if (!analysis.backEdges.has(edgeKey(e)) || !byId.get(e.sourceId)?.isDecision || !byId.has(e.targetId)) continue;
    loopsInto.set(e.targetId, [...(loopsInto.get(e.targetId) ?? []), e]);
  }

  /** The Decision recorded this loop edge's outcome in `pass`: the target runs again in pass + 1. */
  const looped = (e: FlowEdge, pass: number): boolean =>
    (byId.get(e.sourceId)?.passes ?? []).some((r) => r.pass === pass && r.outcome !== null && sameLabel(r.outcome, e.label));
  const member = (n: FlowNode, k: number): boolean =>
    k === 1 || n.rounds >= k || (loopsInto.get(n.id) ?? []).some((e) => looped(e, k - 1));
  const maxPass = Math.max(1, ...nodes.map((n) => n.rounds), ...nodes.filter((n) => n.isDecision).map((n) => n.passes.length + 1));

  const lastPass = new Map(
    nodes.map((n) => {
      let last = 1;
      for (let k = 2; k <= maxPass; k += 1) if (member(n, k)) last = k;
      return [n.id, last] as const;
    }),
  );

  const memo = new Map<string, Cell>();
  const busy = new Set<string>();
  /**
   * The plan cell of `id` in pass `k`, or undefined when the node does not run in that pass. Computed
   * on demand and memoised, because the dependencies cross passes: a loop target's pass k reads its
   * Decision's pass k - 1, and a node that does not run again reads its predecessors' LAST pass.
   * A dependency cycle through passes cannot occur on data the settle cascade produced; if one is
   * ever read (a half-applied cascade), the cell in progress answers "no dates" instead of recursing.
   */
  const cellOf = (k: number, id: string): Cell | undefined => {
    const n = byId.get(id);
    if (n === undefined || !member(n, k)) return undefined;
    const key = `${k}:${id}`;
    const hit = memo.get(key);
    if (hit !== undefined) return hit;
    if (busy.has(key)) return { interval: null, reason: 'no-dates' };
    busy.add(key);
    const ready = readyDay(n, k);
    const cell = k === 1 ? firstPass(n, ready) : laterPass(n, k, ready);
    busy.delete(key);
    memo.set(key, cell);
    return cell;
  };

  const actualEnd = (n: FlowNode, k: number): string | null => {
    const period = n.periods.filter((p) => p.pass === k).at(-1);
    return period === undefined || period.end === null ? null : istDayOf(period.end);
  };
  /** PL-1: the end of `p` in pass `k`: what happened if the last period of that pass is closed, else the plan, else unknown. */
  const endIn = (p: FlowNode, k: number): string | null => {
    const own = actualEnd(p, k) ?? cellOf(k, p.id)?.interval?.end ?? null;
    const revisions = p.isDecision ? (p.passes.find((r) => r.pass === k)?.revisions ?? []) : [];
    if (revisions.length === 0) return own;
    const revised = latest(revisions.map((r) => istDayOf(r.at)));
    return own === null ? revised : latest([own, revised]);
  };

  /**
   * PL-2: the ready day of `n` in pass `k`, or null when no usable predecessor gives one.
   * A node that runs again later chains from its predecessors' pass k. A node whose last pass is k
   * chains from each predecessor's LAST pass, so what leaves a loop starts after the loop's final run.
   */
  const readyDay = (n: FlowNode, k: number): string | null => {
    const reruns = member(n, k + 1);
    const ends: Array<string | null> = [];
    for (const e of incoming.get(n.id) ?? []) {
      const p = byId.get(e.sourceId);
      if (p === undefined) continue;
      if (live.has(n.id) && !(live.has(p.id) && effective.has(edgeKey(e)) && p.notTaken === null)) continue;
      const pass = reruns ? k : (lastPass.get(p.id) ?? 1);
      if (!member(p, pass) || pass < k) continue;
      ends.push(endIn(p, pass));
    }
    if (k >= 2) {
      for (const e of loopsInto.get(n.id) ?? []) {
        const d = byId.get(e.sourceId);
        if (d !== undefined && looped(e, k - 1)) ends.push(endIn(d, k - 1));
      }
    }
    const known = ends.filter((d): d is string => d !== null);
    if (known.length === 0) return null;
    if (!n.waitForAll) return addDays(earliest(known), 1);
    return known.length === ends.length ? addDays(latest(known), 1) : null;
  };

  const out: FlowPlan = new Map();
  for (const n of nodes) {
    const intervals: PlannedInterval[] = [];
    let last: Cell | undefined;
    for (let k = 1; k <= maxPass; k += 1) {
      const cell = cellOf(k, n.id);
      if (cell === undefined) continue;
      last = cell;
      if (cell.interval !== null) intervals.push(live.has(n.id) ? cell.interval : { ...cell.interval, pruned: true });
    }
    out.set(n.id, {
      intervals,
      unscheduled: last?.interval === null ? (last.reason ?? null) : null,
      onTimeline: intervals.some((i) => i.pruned === undefined) || n.periods.length > 0,
    });
  }
  return out;
}

/**
 * What `planFlow` answers for a node with no edge, without the analysis (owner ruling (c), wtg4 T1: the Timeline plans each
 * edgeless component, one ticket, with this). A lone node is its own root, so it is live and never pruned, and it has no
 * ready day: pass 1 is PL-3 from its own dates, and every later pass its round reached is chained from nothing ('no-dates').
 * It shares `firstPass` and `laterPass` with `planFlow`, and `plan.test.ts` (29.295) proves the two equal on every shape.
 */
export function planAlone(n: FlowNode): NodePlan {
  const cells: Cell[] = [firstPass(n, null)];
  for (let k = 2; k <= n.rounds; k += 1) cells.push(laterPass(n, k, null));
  const intervals = cells.flatMap((c) => (c.interval === null ? [] : [c.interval]));
  const last = cells[cells.length - 1] as Cell;
  // a cell with an interval carries `reason: null` (`firstPass`, `laterPass`), so the last cell's reason is planFlow's `unscheduled`
  return { intervals, unscheduled: last.reason, onTimeline: intervals.length > 0 || n.periods.length > 0 };
}

/** PL-3, row by row, in the spec's order: explicit dates win. */
function firstPass(n: FlowNode, ready: string | null): Cell {
  const { explicitStart: start, explicitDue: due, estimate } = n;
  const made = (from: string, to: string, basis: PlannedInterval['basis']): Cell => ({
    interval: {
      pass: 1,
      start: from,
      end: to,
      basis,
      ...(basis === 'explicit' && start !== null && ready !== null && start < ready ? { startsBeforePredecessor: true as const } : {}),
    },
    reason: null,
  });
  if (start !== null && due !== null) return start > due ? { interval: null, reason: 'start-after-due' } : made(start, due, 'explicit');
  if (start !== null && estimate !== null) return made(start, addDays(start, estimate - 1), 'explicit');
  if (due !== null && estimate !== null) return made(addDays(due, 1 - estimate), due, 'explicit');
  if (start !== null) return made(start, start, 'explicit');
  if (due !== null) return made(due, due, 'explicit');
  if (ready !== null && estimate !== null) return made(ready, addDays(ready, estimate - 1), 'chained');
  return { interval: null, reason: ready !== null ? 'no-estimate' : 'no-dates' };
}

/** PL-6: explicit dates belong to pass 1; a later pass is chained and as long as the rework estimate, else the estimate. */
function laterPass(n: FlowNode, k: number, ready: string | null): Cell {
  const days = n.reworkEstimate ?? n.estimate;
  if (ready === null) return { interval: null, reason: 'no-dates' };
  if (days === null) return { interval: null, reason: 'no-estimate' };
  return { interval: { pass: k, start: ready, end: addDays(ready, days - 1), basis: 'chained' }, reason: null };
}
