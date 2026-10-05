// TEST-ONLY COPY of packages/knowledge-graph-browser/harness/fixture-source.ts (KV7), as a FACTORY: each test gets its own
// request log, delay and failing hop, so no state leaks between tests. The ring logic is the original's.
import { GROUP_OF_EDGE_KIND, inGraphScope, type GraphRingResponse } from '@gisik-nokma/domain';
import { emptyStore, mergeRing, type GraphStore } from '../../../src/engine/model.js';
import { walk } from '../../../src/engine/walk.js';
import type { GraphRingQuery, GraphSource } from '../../../src/react/types.js';
import { fixtureEdges, fixtureItems } from './fixture.js';

export function fixtureWorld(): GraphStore {
  const items = fixtureItems();
  return mergeRing(emptyStore(), { hop: 1, center: items[0]!, items, edges: fixtureEdges(), frontier: [], truncated: false, cursor: null });
}

/** ONE ring the way the server answers it (out flags, edges into the ring and among it, `frontier`, the `center`). */
export function fixtureRing(all: GraphStore, q: GraphRingQuery): GraphRingResponse {
  const scope = { workspaceIds: q.workspaceIds, projectIds: q.projectIds };
  const inScope = (r: string) => inGraphScope(all.items.get(r)!, scope);
  const w = walk(all, q.center, new Set(q.groups), q.hops, (r) => r === q.center || inScope(r));
  const ring = w.order.filter((r) => w.dist.get(r) === q.hops);
  const inRing = new Set(ring), upTo = new Set(w.order);
  const edges = [...all.edges.values()].filter((e) => new Set(q.groups).has(GROUP_OF_EDGE_KIND[e.kind]) && (inRing.has(e.from) || inRing.has(e.to)) && upTo.has(e.from) && upTo.has(e.to));
  const items = ring.map((r) => ({ ...all.items.get(r)!, hop: q.hops, out: !inScope(r) }));
  return { hop: q.hops, center: { ...all.items.get(q.center)!, hop: 0, out: !inScope(q.center) }, items, edges, frontier: items.filter((i) => !i.out).map((i) => i.ref), truncated: false, cursor: null };
}

export type FixtureOptions = { delayFor?: (q: GraphRingQuery) => number; failHop?: number };
export function fixtureSource(opts: FixtureOptions = {}) {
  const all = fixtureWorld();
  const log: GraphRingQuery[] = [];
  const ctl = { failHop: opts.failHop ?? 0 };
  const source: GraphSource = {
    async ring(q) {
      log.push(q);
      const ms = opts.delayFor?.(q) ?? 0;
      if (ms > 0) await new Promise((r) => setTimeout(r, ms));
      if (ctl.failHop === q.hops) throw new Error('fixture: ring failed');
      return fixtureRing(all, q);
    },
  };
  return { all, log, ctl, source };
}
