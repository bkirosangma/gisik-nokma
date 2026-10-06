import { GROUP_OF_EDGE_KIND, inGraphScope, type GraphEdgeView, type GraphGroup, type GraphItemView, type GraphRingResponse } from '@gisik-nokma/domain';
import { emptyStore, mergeRing, walk, type GraphStore } from '@gisik-nokma/knowledge-graph';
import { fixtureEdges, fixtureItems, titleOverride } from './fixture.js';

/** Extra tickets in Mobile web (`setBigWorld`): Home's big workspace (release walk row 8, 444 clear items). */
let extra = 0;
let all: GraphStore = build();
function build(): GraphStore {
  const big: GraphItemView[] = Array.from({ length: extra }, (_, i) => ({ ref: `ticket:big${i}`, kind: 'ticket', id: `big${i}`, workspaceId: 'gn', projectId: 'j_mw', label: `GN-${1000 + i}`, title: `Seeded ticket ${i + 1}`, category: 'open', hop: 0, out: false, suggested: false }));
  const bigEdges: GraphEdgeView[] = big.map((t) => ({ id: `in|project:j_mw|${t.ref}`, kind: 'in', from: 'project:j_mw', to: t.ref, snippet: null, addedBy: null, addedAt: null, origin: null, suggested: false }));
  const items = [...fixtureItems(), ...big];
  return mergeRing(emptyStore(), { hop: 1, center: items[0]!, items, edges: [...fixtureEdges(), ...bigEdges], frontier: [], truncated: false, cursor: null });
}

/** Adds `n` tickets to Mobile web, each linked only by its project (`?big=n`), and rebuilds the world. */
export function setBigWorld(n: number): void {
  extra = n;
  all = build();
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

/** The in-browser stand-in for `GET /v1/graph/neighbours`: ONE ring the way the server answers it (out flags, edges into the ring and among it, `frontier`, and the `center` on every answer). */
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
  return { hop: q.hops, center: { ...all.items.get(q.center)!, hop: 0, out: !inScope(q.center) }, items, edges, frontier: items.filter((i) => !i.out).map((i) => i.ref), truncated: false, cursor: null };
}
