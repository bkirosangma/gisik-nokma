import { GROUP_OF_EDGE_KIND, GROUP_RANK, compareRingEntries, type GraphEdgeView, type GraphGroup } from '@gisik-nokma/domain';
import type { GraphStore } from './model.js';

export type Walk = {
  dist: Map<string, number>;
  parent: Map<string, { from: string; edge: GraphEdgeView }>;
  kids: Map<string, string[]>;
  order: string[];
  out: Set<string>;
};

/**
 * Breadth-first from `center` over the loaded rings (port of `bfs`, `knowledge-graph-sigma.html:592-600`).
 * - Only edges in an enabled group are followed (§3.5 "Hidden groups are not walked").
 * - An item outside the scope is reached, marked `out`, and never walked past (§2.2, §3.1).
 * - An edge whose far end the store does not hold is ignored: the server never sends an item the viewer cannot see.
 * - Neighbours are taken in the spec's ring order (§2.2), not the mockup's `cmp` (`:591`).
 * `reach` is the last distance walked FROM; pass `reach + 1` to include the fog ring.
 */
export function walk(
  store: GraphStore,
  center: string,
  on: ReadonlySet<GraphGroup>,
  reach: number,
  inScope: (ref: string) => boolean,
  gone: ReadonlySet<string> = new Set(),
): Walk {
  const dist = new Map<string, number>([[center, 0]]);
  const parent = new Map<string, { from: string; edge: GraphEdgeView }>();
  const kids = new Map<string, string[]>([[center, []]]);
  const order = [center];
  const out = new Set<string>();
  let queue = [center];
  while (queue.length > 0) {
    const next: string[] = [];
    for (const u of queue) {
      if ((dist.get(u) ?? 0) >= reach) continue;
      const around = (store.adj.get(u) ?? [])
        .filter((x) => on.has(GROUP_OF_EDGE_KIND[x.edge.kind]) && !gone.has(x.to) && store.items.has(x.to))
        .map((x) => ({ ...x, ref: x.to, rank: GROUP_RANK[GROUP_OF_EDGE_KIND[x.edge.kind]] }))
        .sort(compareRingEntries);
      for (const { to, edge } of around) {
        if (dist.has(to)) continue;
        dist.set(to, (dist.get(u) ?? 0) + 1);
        parent.set(to, { from: u, edge });
        kids.get(u)!.push(to);
        kids.set(to, []);
        order.push(to);
        if (inScope(to)) next.push(to);
        else out.add(to);
      }
    }
    queue = next;
  }
  return { dist, parent, kids, order, out };
}
