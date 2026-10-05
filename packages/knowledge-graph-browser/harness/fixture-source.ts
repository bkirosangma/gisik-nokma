import { GROUP_OF_EDGE_KIND, inGraphScope, type GraphGroup, type GraphRingResponse } from '@gisik-nokma/domain';
import { emptyStore, mergeRing, walk, type GraphStore } from '@gisik-nokma/knowledge-graph';
import { fixtureEdges, fixtureItems, titleOverride } from './fixture.js';

let all: GraphStore = build();
function build(): GraphStore {
  return mergeRing(emptyStore(), { hop: 1, items: fixtureItems(), edges: fixtureEdges(), frontier: [], truncated: false, cursor: null });
}
export type FixtureQuery = { center: string; hops: number; workspaceIds: string[]; projectIds: string[]; groups: GraphGroup[] };
export const fixtureLog: FixtureQuery[] = [];
/** Delay per ring (ms), settable from a test to make a race (27.318). */
export const fixtureDelay = { ms: 0, failHop: 0 };

/** Replaces an item's title (27.282's 200-character title) and rebuilds the world. */
export function setFixtureTitle(ref: string, title: string): void {
  titleOverride.set(ref, title);
  all = build();
}

/** The in-browser stand-in for `GET /v1/graph/neighbours`: ONE ring the way the server answers it (out flags, edges into the ring and among it, `frontier`). */
export async function fixtureRing(q: FixtureQuery): Promise<GraphRingResponse> {
  fixtureLog.push(q);
  if (fixtureDelay.ms > 0) await new Promise((r) => setTimeout(r, fixtureDelay.ms));
  if (fixtureDelay.failHop === q.hops) throw new Error('fixture: ring failed');
  const scope = { workspaceIds: q.workspaceIds, projectIds: q.projectIds };
  const inScope = (r: string) => inGraphScope(all.items.get(r)!, scope);
  const w = walk(all, q.center, new Set(q.groups), q.hops, (r) => r === q.center || inScope(r));
  const ring = w.order.filter((r) => w.dist.get(r) === q.hops);
  const inRing = new Set(ring), upTo = new Set(w.order);
  const edges = [...all.edges.values()].filter((e) => new Set(q.groups).has(GROUP_OF_EDGE_KIND[e.kind]) && (inRing.has(e.from) || inRing.has(e.to)) && upTo.has(e.from) && upTo.has(e.to));
  const items = ring.map((r) => ({ ...all.items.get(r)!, hop: q.hops, out: !inScope(r) }));
  return { hop: q.hops, items, edges, frontier: items.filter((i) => !i.out).map((i) => i.ref), truncated: false, cursor: null };
}
