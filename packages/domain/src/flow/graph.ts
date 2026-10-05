import { normaliseLinkLabel } from '../link-label.js';
import { edgeKey, type FlowAnalysis, type FlowEdge, type FlowNode } from './types.js';

/** Two outcome labels are the same when they agree after trim and case folding; two absent labels agree, an absent and a present one do not. */
export function sameLabel(a: string | null, b: string | null): boolean {
  if (a === null || b === null) return a === b;
  return normaliseLinkLabel(a) === normaliseLinkLabel(b);
}

/** The edges that are not loop-closing (FL-3): the DAG every ordering, chaining and reachability question is asked on. */
export function forwardEdges(edges: readonly FlowEdge[], analysis: FlowAnalysis): FlowEdge[] {
  return edges.filter((e) => !analysis.backEdges.has(edgeKey(e)));
}

/**
 * PS-1: the flow's edges minus, for every Decision with a non-null outcome, its outgoing edges whose
 * label differs from the outcome. Only that. An edge from a Not-taken source stays (the settle plan
 * must reason about the state AFTER it runs, when that source may be live again); the promotion rule
 * AP-3 excludes Not-taken sources itself.
 */
export function effectiveEdges(nodes: readonly FlowNode[], edges: readonly FlowEdge[]): FlowEdge[] {
  const byId = new Map(nodes.map((n) => [n.id, n] as const));
  return edges.filter((e) => {
    const source = byId.get(e.sourceId);
    if (source === undefined || !source.isDecision || source.outcome === null) return true;
    return sameLabel(e.label, source.outcome);
  });
}

function adjacency(edges: readonly FlowEdge[], known: ReadonlySet<string>, reverse = false): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const e of edges) {
    if (!known.has(e.sourceId) || !known.has(e.targetId)) continue;
    const [from, to] = reverse ? [e.targetId, e.sourceId] : [e.sourceId, e.targetId];
    map.set(from, [...(map.get(from) ?? []), to]);
  }
  return map;
}

function reach(starts: Iterable<string>, next: ReadonlyMap<string, string[]>, blocked?: string): Set<string> {
  const seen = new Set<string>();
  const queue = [...starts].filter((id) => id !== blocked);
  for (const id of queue) seen.add(id);
  for (let i = 0; i < queue.length; i += 1) {
    for (const to of next.get(queue[i] as string) ?? []) {
      if (to === blocked || seen.has(to)) continue;
      seen.add(to);
      queue.push(to);
    }
  }
  return seen;
}

/**
 * PS-1: the tickets reachable from the flow's roots over the effective graph's non-back edges. A
 * root is a ticket with no incoming non-back edge in the WHOLE flow (not in the effective graph: a
 * ticket cut off by a Decision's choice must not become a root and so live for free).
 */
export function liveSet(nodes: readonly FlowNode[], edges: readonly FlowEdge[], analysis: FlowAnalysis): Set<string> {
  const known = new Set(nodes.map((n) => n.id));
  const forward = forwardEdges(edges, analysis).filter((e) => known.has(e.sourceId) && known.has(e.targetId));
  const hasIncoming = new Set(forward.map((e) => e.targetId));
  const roots = nodes.filter((n) => !hasIncoming.has(n.id)).map((n) => n.id);
  return reach(roots, adjacency(forwardEdges(effectiveEdges(nodes, edges), analysis), known));
}

/**
 * PS-1: the loop body of back edge `D -> T`: `T`, `D` and every ticket on a forward path from `T`
 * to `D`, i.e. reachable from `T` AND reaching `D` over non-back edges. A ticket the walk merely
 * passes through on its way elsewhere (reachable from `T`, never reaching `D`) is not in it. Taken
 * over the whole flow, not the effective graph: the body is structure, independent of any outcome.
 */
export function loopBody(
  backEdge: Pick<FlowEdge, 'sourceId' | 'targetId'>,
  edges: readonly FlowEdge[],
  analysis: FlowAnalysis,
): Set<string> {
  const forward = forwardEdges(edges, analysis);
  const known = new Set(forward.flatMap((e) => [e.sourceId, e.targetId]).concat(backEdge.sourceId, backEdge.targetId));
  const fromTarget = reach([backEdge.targetId], adjacency(forward, known));
  const toDecision = reach([backEdge.sourceId], adjacency(forward, known, true));
  return new Set([...fromTarget].filter((id) => toDecision.has(id)));
}

/**
 * PS-1: the tickets on branch `label` of a Decision: reachable from that edge's target over
 * non-back edges, never passing through the Decision. `label` is null for a Decision's unlabeled edge
 * (the engine requires labels, but a link relabelled out from under a Decision must not crash the plan).
 * Empty when the Decision has no such edge.
 */
export function branchOf(
  decisionId: string,
  label: string | null,
  edges: readonly FlowEdge[],
  analysis: FlowAnalysis,
): Set<string> {
  const edge = edges.find((e) => e.sourceId === decisionId && sameLabel(e.label, label));
  if (edge === undefined) return new Set();
  const forward = forwardEdges(edges, analysis);
  const known = new Set(forward.flatMap((e) => [e.sourceId, e.targetId]).concat(edge.targetId));
  return reach([edge.targetId], adjacency(forward, known), decisionId);
}
