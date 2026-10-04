// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { GraphEdgeView } from '@gisik-nokma/domain';
import { CLEAR_CAP, FOG_BUDGET, zones } from '../../src/engine/zones.js';
import { ALL_GROUPS, edge, item, storeOf, T } from './fixture.js';

/** A star: the centre with `n` children, each with one grandchild. */
function star(n: number) {
  const items = [item('c')], edges: GraphEdgeView[] = [];
  for (let i = 0; i < n; i += 1) {
    const k = `k${String(i).padStart(5, '0')}`, g = `g${String(i).padStart(5, '0')}`;
    items.push(item(k), item(g));
    edges.push(edge('parent', T('c'), T(k)), edge('parent', T(k), T(g)));
  }
  return storeOf(items, edges);
}
const base = { center: T('c'), on: ALL_GROUPS, inScope: () => true, semantic: true };

describe('zones (port of zones(), knowledge-graph-sigma.html:898)', () => {
  it('27.219 clear = within the hops, fog = the next ring; control: one hop more moves the fog ring into the clear', () => {
    const z = zones(star(3), { ...base, reach: 1 });
    expect(z.clear).toHaveLength(4);
    expect(z.fog).toHaveLength(3);
    expect(z.clearHop).toBe(1);
    const z2 = zones(star(3), { ...base, reach: 2 });
    expect(z2.clear).toHaveLength(7);
    expect(z2.fog).toHaveLength(0);
  });

  it('27.220 the cap: 500 clear at most, the rest go to fog, `beyond` counts what is past both; control: 499 candidates are not capped', () => {
    const z = zones(star(600), { ...base, reach: 1 });
    expect(CLEAR_CAP).toBe(500);
    expect(z.clear).toHaveLength(500);
    expect(z.capped).toBe(true);
    expect(z.clearHop).toBe(1);
    // the 101 children past the cap are fog (their parent, the centre, is clear); the 499 clear children's grandchildren
    // are the fog ring; the 101 grandchildren under fogged children are further out
    expect(z.fog).toHaveLength(101 + 499);
    expect(z.beyond).toBe(101);
    expect(z.fog.length + z.beyond + z.clear.length).toBe(1 + 600 * 2);
    // a cap reached inside hop 1 at reach 2: the clear hop is where the cap cut, not the hops asked for
    const deep = zones(star(600), { ...base, reach: 2 });
    expect(deep.capped).toBe(true);
    expect(deep.clearHop).toBe(1);
    const z2 = zones(star(498), { ...base, reach: 1 }); // 1 centre + 498 = 499
    expect(z2.capped).toBe(false);
    expect(z2.clear).toHaveLength(499);
    const exact = zones(star(499), { ...base, reach: 1 }); // 1 centre + 499 = 500: AT the cap is not past it
    expect(exact.capped).toBe(false);
    expect(exact.clear).toHaveLength(500);
  });

  it('27.221 the fog budget: 2,000 fog items at most; control: exactly 2,000 candidates are all kept', () => {
    expect(FOG_BUDGET).toBe(2000);
    const big = zones(star(2001), { ...base, reach: 0 }); // centre clear, 2,001 children fog
    expect(big.fog).toHaveLength(2000);
    expect(big.beyond).toBe(0); // the mockup's `beyond` (:909) counts only behind the clear cap
    const exact = zones(star(2000), { ...base, reach: 0 });
    expect(exact.fog).toHaveLength(2000);
  });

  it('27.222 an out-of-scope item is fog only beside a clear parent, and counted as outside; control: an in-scope one at the same place is clear', () => {
    const s = storeOf([item('c'), item('x', { project: 'p2' }), item('b'), item('bb')], [edge('relates', T('c'), T('x')), edge('relates', T('c'), T('b')), edge('parent', T('b'), T('bb'))]);
    const z = zones(s, { ...base, reach: 1, inScope: (r) => r !== T('x') });
    expect(z.fogSet.has(T('x'))).toBe(true);
    expect(z.fog).toHaveLength(2); // x (outside) and bb (the next ring): only x counts as outside
    expect(z.clearSet.has(T('x'))).toBe(false);
    expect(z.outN).toBe(1);
    expect(z.clearSet.has(T('b'))).toBe(true);
  });

  it('27.223 Everything (reach Infinity): the clear hop is the farthest clear item; control: a fixed reach reports itself', () => {
    const z = zones(star(3), { ...base, reach: Number.POSITIVE_INFINITY });
    expect(z.clearHop).toBe(2);
    expect(z.clear).toHaveLength(7);
    expect(zones(star(3), { ...base, reach: 4 }).clearHop).toBe(4);
  });

  it('27.224 semantic layer Off: concepts are neither drawn nor walked; control: On, they are', () => {
    const s = storeOf([item('c'), item('k1', { kind: 'concept', project: null }), item('t')], [edge('tag', 'concept:k1', T('c')), edge('tag', 'concept:k1', T('t'))]);
    const off = zones(s, { ...base, reach: 2, semantic: false });
    expect(off.clear).toEqual([T('c')]);
    const on = zones(s, { ...base, reach: 2, semantic: true });
    expect(on.clearSet.has('concept:k1')).toBe(true);
    expect(on.clearSet.has(T('t'))).toBe(true);
    // centred ON a concept with the layer Off, nothing is drawn (§6.4: the view returns to its own centre, Task 7)
    expect(zones(s, { ...base, center: 'concept:k1', reach: 2, semantic: false }).clear).toEqual([]);
    expect(zones(s, { ...base, center: 'concept:k1', reach: 2, semantic: true }).clear[0]).toBe('concept:k1');
  });
});
