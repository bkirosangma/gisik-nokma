// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { solveFit } from '../../src/engine/fit.js';
import { emptyStore } from '../../src/engine/model.js';
import { zones } from '../../src/engine/zones.js';
import { buildDrawModel } from '../../src/react/draw-model.js';
import { ALL_GROUPS, edge, item, N, storeOf, T } from '../engine/fixture.js';

/*
 * The centre `c`; three chips at hop 1 (the note n1, the tickets a and b); two fog items at hop 2 (f1 past a, f2 past b).
 * Clear edges: blocks c→a, attached n1→c, relates c→b, relates a→b. Fog edges: blocks a→f1, parent b→f2. `z` (hop 3) is held
 * but past the fog: its edges f1→z and z→f2 touch one drawn end each and are not drawn.
 */
const store = storeOf(
  [item('c'), item('n1', { kind: 'note' }), item('a'), item('b'), item('f1'), item('f2'), item('z')],
  [edge('blocks', T('c'), T('a')), edge('attached', N('n1'), T('c')), edge('relates', T('c'), T('b')), edge('relates', T('a'), T('b')), edge('blocks', T('a'), T('f1')), edge('parent', T('b'), T('f2')), edge('relates', T('f1'), T('z')), edge('relates', T('z'), T('f2'))],
);
const zonesAt = (center: string) => zones(store, { center, on: ALL_GROUPS, reach: 1, inScope: () => true, semantic: true });
const model = (center: string, selected: string | null, selectedEdge: string | null = null) =>
  buildDrawModel(store, zonesAt(center), { config: 'desktop', centre: center, selected, selectedEdge, on: ALL_GROUPS });

describe('buildDrawModel (`render`, knowledge-graph-sigma.html:915-948)', () => {
  it('27.310 fog nodes are bare, a hop-1 note has its icon, a note CENTRE has none, fog edges are not counted, and the selected item lights only its own edges; control: an edge selected lights none; nothing the store does not hold is drawn', () => {
    const m = model(T('c'), T('a'));
    const fog = m.nodes.filter((n) => n.fog);
    expect(fog.map((n) => n.ref).sort()).toEqual([T('f1'), T('f2')]);
    for (const n of fog) {
      expect(n.lv).toBe('fog');
      expect(n.lbl).toBe('');
      expect(n.sub).toBeNull();
      expect(n.icon).toBeNull();
    }
    expect(m.nodes.find((n) => n.ref === N('n1'))!.icon).toEqual({ kind: 'note' });
    // a ticket never has an icon, so the centre leg needs a NOTE centre: the same note, centred, has none
    const noteCentred = model(N('n1'), N('n1'));
    expect(noteCentred.nodes.find((n) => n.ref === N('n1'))!.center).toBe(true);
    expect(noteCentred.nodes.find((n) => n.ref === N('n1'))!.icon).toBeNull();
    // fog edges are drawn as fog and not counted: the LITERAL clear counts of the fixture
    const edgeOf = (id: string) => m.edges.find((e) => e.id === id)!;
    expect(edgeOf(`blocks|${T('a')}|${T('f1')}`).fog).toBe(true);
    expect(edgeOf(`parent|${T('b')}|${T('f2')}`).fog).toBe(true);
    expect(m.counts).toEqual({ blocks: 1, relates: 2, attached: 1 });
    // the whole edge list: z's two edges (one drawn end each) are not in it
    expect(m.edges.map((e) => e.id).sort()).toEqual(
      [`attached|${N('n1')}|${T('c')}`, `blocks|${T('a')}|${T('f1')}`, `blocks|${T('c')}|${T('a')}`, `parent|${T('b')}|${T('f2')}`, `relates|${T('a')}|${T('b')}`, `relates|${T('c')}|${T('b')}`].sort(),
    );
    expect(m.nodes.map((n) => n.ref)).not.toContain(T('z'));
    // the fit's four fog points sit on ring 2 (the desktop R table's [440, 290]) × 0.9, and the top band is the desktop's 40 px
    expect(m.fit.slice(-4).map((f) => [f.x, f.y])).toEqual([[396, 0], [-396, 0], [0, 261], [0, -261]]);
    expect(m.topPx).toBe(40);
    const phone = buildDrawModel(store, zones(store, { center: T('c'), on: ALL_GROUPS, reach: 1, inScope: () => true, semantic: true }), { config: 'phone', centre: T('c'), selected: null, selectedEdge: null, on: ALL_GROUPS });
    expect(phone.topPx).toBe(52);
    // the selected item's edges are lit; an edge not touching it is not
    expect(edgeOf(`blocks|${T('c')}|${T('a')}`).on).toBe(true);
    expect(edgeOf(`relates|${T('a')}|${T('b')}`).on).toBe(true);
    expect(edgeOf(`relates|${T('c')}|${T('b')}`).on).toBe(false);
    expect(edgeOf(`attached|${N('n1')}|${T('c')}`).on).toBe(false);
    expect(edgeOf(`blocks|${T('a')}|${T('f1')}`).on).toBe(false); // touches a, but fog
    // control: with an edge selected, no item's edges are lit
    const withEdge = model(T('c'), T('a'), `blocks|${T('c')}|${T('a')}`);
    expect(withEdge.edges.filter((e) => e.on)).toEqual([]);
    // before ring 1 answers the walk lists the centre, but the store does not hold it yet: nothing is drawn, nothing throws
    const none = emptyStore();
    const early = buildDrawModel(none, zones(none, { center: T('c'), on: ALL_GROUPS, reach: 1, inScope: () => true, semantic: true }), { config: 'desktop', centre: T('c'), selected: T('c'), selectedEdge: null, on: ALL_GROUPS });
    expect(early.nodes).toEqual([]);
    expect(early.fit).toEqual([]);
  });
});

describe('the empty frame (27.673, AMEND-kg-empty-reframe-fit)', () => {
  // The stage each config draws on (measured in the browser harness: 1280 and 768 desktop 930 × 496 / 736 × 496, a 360 phone
  // 328 × 560); k1 = 1, as `fit.test.ts`. On 8671e629 the centre alone solved to 0.00188 (desktop) and 0.0212 (phone), the
  // camera ratios the browser read, so this pure solve is the browser's.
  const VP = { desktop: { width: 930, height: 496 }, phone: { width: 328, height: 560 }, home: { width: 930, height: 496 } } as const;
  /**
   * The alone/one-item ratio per config, measured with the fix ±10% (planner ruling on the 06:41 ⚑): desktop 0.771 / 0.473 =
   * 1.63×, home 0.625 / 0.383 = 1.63×, phone 0.809 / 0.380 = 2.13× (its portrait stage binds on width: ring 1 is ±123 units
   * wide, one card is not; the 360 paint, roles/mut-out/kg-empty-reframe/after-fit/360-gn9-*.png, shows it sane). The old fit
   * (K4) gives 0.004× / 0.056× / 0.005×, ring 2's radius (K6) 2.56× / 3.41× / 3.59×: both outside every band.
   */
  const BAND = { desktop: [1.47, 1.79], phone: [1.92, 2.34], home: [1.47, 1.79] } as const;
  const alone = storeOf([item('c')], []);
  const one = storeOf([item('c'), item('a')], [edge('blocks', T('c'), T('a'))]);
  const frame = (st: typeof alone, config: keyof typeof VP) => {
    const m = buildDrawModel(st, zones(st, { center: T('c'), on: ALL_GROUPS, reach: 2, inScope: () => true, semantic: true }), { config, centre: T('c'), selected: T('c'), selectedEdge: null, on: ALL_GROUPS });
    return { fit: m.fit, cam: solveFit(m.fit, 1, VP[config], m.topPx) };
  };

  it('27.673 the centre alone frames within its band of a centre with one hop-1 item, in every config; control: the one-item frame is byte-equal to 8671e629', () => {
    for (const config of ['desktop', 'phone', 'home'] as const) {
      const k = frame(alone, config).cam.ratio / frame(one, config).cam.ratio;
      expect.soft(k, config).toBeGreaterThanOrEqual(BAND[config][0]);
      expect.soft(k, config).toBeLessThanOrEqual(BAND[config][1]);
    }
    // the centre alone takes ring 1's four points (desktop R[1] = [300, 185] × 0.9), after its own card
    expect(frame(alone, 'desktop').fit.slice(1).map((f) => [f.x, f.y])).toEqual([[270, 0], [-270, 0], [0, 166.5], [0, -166.5]]);
    // and a phone takes its own ring 1 with its own factor (R[1] = [150, 170] × 0.82); the band alone holds × 0.9 (review rider, P44)
    expect(frame(alone, 'phone').fit.slice(1).map((f) => [Math.round(f.x * 10) / 10, Math.round(f.y * 10) / 10])).toEqual([[123, 0], [-123, 0], [0, 139.4], [0, -139.4]]);
    // control: a frame with any clear item besides the centre is exactly 8671e629's (the literals read off that tip's draw-model)
    const card = { x: 0, y: 0, l: 59.5, r: 59.5, t: 30, b: 30 };
    expect(frame(one, 'desktop')).toEqual({ fit: [card, { x: 1.8369701987210297e-14, y: -185, l: 16, r: 103, t: 18, b: 36 }], cam: { cx: 10.33544140625001, cy: -99.15269791666667, ratio: 0.4725353298611111 } });
    expect(frame(one, 'phone')).toEqual({ fit: [card, { x: 9.184850993605149e-15, y: -170, l: 16, r: 41, t: 14, b: 14 }], cam: { cx: 0, cy: -91.89174129859556, ratio: 0.3800660911627016 } });
    expect(frame(one, 'home')).toEqual({ fit: [card, { x: 1.592040838891559e-14, y: -150, l: 16, r: 103, t: 18, b: 36 }], cam: { cx: 8.405443576388896, cy: -80.41040046296295, ratio: 0.38335048225308643 } });
  });
});
