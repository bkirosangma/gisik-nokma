import type { GraphEdgeView, GraphItemView, GraphRingResponse } from '@gisik-nokma/domain';

export type AdjEntry = { to: string; edge: GraphEdgeView };
/**
 * The union of the rings fetched for one centre (spec §2.3), as plain maps. graphology lives only in `render/sigma/`
 * (§4.1), so the engine walks these maps and the adapter mirrors what is drawn. `exhausted` = the last ring came back
 * empty: "Everything" has reached the end.
 */
export type GraphStore = {
  items: ReadonlyMap<string, GraphItemView>;
  edges: ReadonlyMap<string, GraphEdgeView>;
  adj: ReadonlyMap<string, readonly AdjEntry[]>;
  rings: number;
  exhausted: boolean;
};

export function emptyStore(): GraphStore {
  return { items: new Map(), edges: new Map(), adj: new Map(), rings: 0, exhausted: false };
}

export function mergeRing(store: GraphStore, ring: GraphRingResponse): GraphStore {
  const items = new Map(store.items);
  for (const it of ring.items) if (!items.has(it.ref)) items.set(it.ref, it);
  const edges = new Map(store.edges);
  const adj = new Map<string, AdjEntry[]>([...store.adj].map(([k, v]) => [k, [...v]]));
  for (const e of ring.edges) {
    if (edges.has(e.id)) continue;
    edges.set(e.id, e);
    adj.set(e.from, [...(adj.get(e.from) ?? []), { to: e.to, edge: e }]);
    adj.set(e.to, [...(adj.get(e.to) ?? []), { to: e.from, edge: e }]);
  }
  return { items, edges, adj, rings: Math.max(store.rings, ring.hop), exhausted: store.exhausted || (ring.items.length === 0 && ring.cursor === null) };
}
