import { edgeSentence, GRAPH_GROUPS, type GraphGroup, type GraphItemView, type GraphPathResponse } from '@gisik-nokma/domain';
import type { Queryable } from '../db/queryable.js';
import { createGraphVisibility, expandGraph, graphEdgeView } from './graph-neighbours.js';

/** Spec D §5.1 `graph_path`: `maxHops ≤ 6`, up to 3 shortest paths. The route refuses a larger `maxHops` with this bound. */
export const PATH_MAX_HOPS = 6;
export const PATH_MAX_PATHS = 3;
/**
 * The groups a path walks when the caller names none: every group but `projects`, `concepts` and `people`, each a hub.
 * Containment makes any two items of one project two hops apart (item → project → item), so with it on, every shortest
 * path inside a project would be "both are in P"; a concept's tags do the same for its items, and the ring read leaves
 * `concepts` out by default too (`routes/graph.ts`); a person's assignee and mention edges do the same for every ticket
 * one person is assigned and every item that mentions them ("A is assigned to P, P is the assignee of B"). All three stay
 * available by name.
 */
export const PATH_DEFAULT_GROUPS: readonly GraphGroup[] = GRAPH_GROUPS.filter((g) => g !== 'projects' && g !== 'concepts' && g !== 'people');

type Raw = Awaited<ReturnType<typeof expandGraph>>[number];
/** `maxHops` is 1..`PATH_MAX_HOPS`: the route's bound (`routes/graph-query.ts`), the one place it is checked. */
export type GraphPathRequest = { from: string; to: string; maxHops: number; groups: ReadonlySet<GraphGroup> };

/**
 * Spec D §5.1 `graph_path`: up to 3 shortest paths. A BFS layer by layer over plan C's `expand` (every edge kind in
 * `groups`), keeping only refs `resolve` returns, so no path passes through anything the viewer cannot see (a hidden
 * item ends that branch: no edge reaches it). Every shortest predecessor of a node is kept; paths are enumerated back
 * from `to` over predecessors sorted by ref, and the answer is sorted lexicographically by its node-id sequence, so the
 * same graph always answers the same paths in the same order (planner ruling 2026-10-04, Q4). `null` when either end is
 * hidden or unknown (the route's one 404).
 */
export async function shortestPaths(db: Queryable, viewerId: string, req: GraphPathRequest) {
  const { from, to } = req;
  const vis = createGraphVisibility(db, viewerId);
  const known = await vis.resolve([from, to]);
  if (!known.has(from) || !known.has(to)) return null;
  const dist = new Map([[from, 0]]);
  const parents = new Map<string, Array<{ ref: string; edge: Raw }>>();
  let frontier = [from];
  for (let hop = 1; hop <= req.maxHops && frontier.length > 0 && !dist.has(to); hop += 1) {
    const raw = await expandGraph(db, frontier, req.groups);
    for (const [ref, item] of await vis.resolve(raw.flatMap((e) => [e.from, e.to]).filter((r) => !known.has(r)))) known.set(ref, item);
    const inFrontier = new Set(frontier);
    const next: string[] = [];
    for (const edge of raw) {
      if (!known.has(edge.from) || !known.has(edge.to)) continue; // a hidden end: no edge, and no step through it
      // `expand` answers only edges touching the frontier; one with BOTH ends in it reaches back a layer and the next check drops it.
      const near = inFrontier.has(edge.from) ? edge.from : edge.to;
      const far = near === edge.from ? edge.to : edge.from;
      if (dist.has(far) && dist.get(far) !== hop) continue; // reached on an earlier layer: not a shortest step
      if (!dist.has(far)) {
        dist.set(far, hop);
        next.push(far);
      }
      parents.set(far, [...(parents.get(far) ?? []), { ref: near, edge }]);
    }
    frontier = next;
  }
  for (const list of parents.values()) list.sort((x, y) => (x.ref < y.ref ? -1 : x.ref > y.ref ? 1 : 0));
  const paths: Array<{ refs: string[]; edges: Raw[] }> = [];
  const walk = (ref: string, refs: string[], edges: Raw[]): void => {
    if (paths.length >= PATH_MAX_PATHS) return;
    if (ref === from) {
      paths.push({ refs: [from, ...refs], edges });
      return;
    }
    for (const p of parents.get(ref) ?? []) walk(p.ref, [ref, ...refs], [p.edge, ...edges]);
  };
  if (dist.has(to)) walk(to, [], []);
  paths.sort((x, y) => bySequence(x.refs, y.refs));
  return { paths, known, vis };
}

/** Lexicographic order over node-id sequences (planner ruling 2026-10-04, Q4). */
function bySequence(a: readonly string[], b: readonly string[]): number {
  for (let i = 0; i < Math.min(a.length, b.length); i += 1) if (a[i] !== b[i]) return a[i]! < b[i]! ? -1 : 1;
  return a.length - b.length;
}

/**
 * The path answer: each path's edges as the ring answers them and one sentence per edge, over the response's own items.
 * A ticket is labelled by its card key, asked ONCE for the answer's items (`keysFor`), as the ring's page is (27.210).
 */
export async function readGraphPath(db: Queryable, viewerId: string, req: GraphPathRequest): Promise<GraphPathResponse | null> {
  const found = await shortestPaths(db, viewerId, req);
  if (found === null) return null;
  const { paths, known, vis } = found;
  const hopOf = new Map<string, number>();
  for (const path of paths) path.refs.forEach((ref, index) => hopOf.set(ref, index));
  const onPaths = [...hopOf.keys()].map((ref) => known.get(ref)!);
  const keys = await vis.keysFor(onPaths);
  const items: GraphItemView[] = onPaths.map((item) => ({ ...item, label: keys.get(item.id) ?? item.label, hop: hopOf.get(item.ref)!, out: false }));
  const labels = new Map(items.map((item) => [item.ref, item.label]));
  const labelOf = (ref: string) => labels.get(ref) ?? '';
  const answer: GraphPathResponse['paths'] = [];
  for (const path of paths) {
    const edges = [];
    for (const edge of path.edges) edges.push(await graphEdgeView(vis, edge));
    answer.push({ refs: path.refs, edges, sentences: edges.map((edge) => edgeSentence(edge, labelOf)) });
  }
  return { from: req.from, to: req.to, paths: answer, items };
}
