// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { RING_CONFIGS, layoutRings, radius } from '../../src/engine/layout.js';
import { walk } from '../../src/engine/walk.js';
import { ALL_GROUPS, edge, item, storeOf, T } from './fixture.js';

describe('layout (port of CFG/radius/layout, knowledge-graph-sigma.html:602-617)', () => {
  it('27.229 the centre sits at 0,0 and hop 1 spreads evenly from 12 o\'clock on the first ellipse; control: the radii are the mockup\'s', () => {
    const s = storeOf([item('c'), item('a'), item('b'), item('d'), item('e')], ['a', 'b', 'd', 'e'].map((x) => edge('relates', T('c'), T(x))));
    const w = walk(s, T('c'), ALL_GROUPS, 1, () => true);
    const pos = layoutRings(w, T('c'), RING_CONFIGS.desktop, (id) => w.dist.get(id) ?? 0);
    expect(pos.get(T('c'))).toEqual({ x: 0, y: 0 });
    const first = pos.get(w.order[1]!)!;
    expect(first.x).toBeCloseTo(0, 6);
    expect(first.y).toBeCloseTo(-185, 6); // angle −90°, ry 185
    expect(pos.get(w.order[2]!)!.x).toBeCloseTo(300, 6); // angle 0°, rx 300
    expect(RING_CONFIGS.desktop.R[1]).toEqual([300, 185]);
    expect(RING_CONFIGS.phone.R[1]).toEqual([150, 170]);
    expect(RING_CONFIGS.home.R[1]).toEqual([260, 150]);
  });

  it('27.230 children sit under their parent\'s angle, at least the ring\'s minimum step apart; control: a single child sits exactly on its parent\'s angle', () => {
    // 20 items on hop 1 leave each an 18° wedge, so a's three children (18/3 = 6°) are held apart by min[2] = 13°
    const fillers = Array.from({ length: 18 }, (_, i) => `f${String(i).padStart(2, '0')}`);
    const s = storeOf([item('c'), item('a'), item('k1'), item('k2'), item('k3'), item('b'), item('only'), ...fillers.map((f) => item(f))],
      [edge('relates', T('c'), T('a')), edge('relates', T('c'), T('b')), ...fillers.map((f) => edge('relates', T('c'), T(f))),
        ...['k1', 'k2', 'k3'].map((k) => edge('parent', T('a'), T(k))), edge('parent', T('b'), T('only'))]);
    const w = walk(s, T('c'), ALL_GROUPS, 2, () => true);
    const pos = layoutRings(w, T('c'), RING_CONFIGS.desktop, (id) => w.dist.get(id) ?? 0);
    const angle = (ref: string) => (Math.atan2(pos.get(ref)!.y / 290, pos.get(ref)!.x / 440) * 180) / Math.PI;
    const ks = ['k1', 'k2', 'k3'].map((k) => angle(T(k))).sort((x, y) => x - y);
    expect(ks[1]! - ks[0]!).toBeCloseTo(13, 6); // min[2] = 13°, not the 6° wedge share
    const parentAngle = (Math.atan2(pos.get(T('b'))!.y / 185, pos.get(T('b'))!.x / 300) * 180) / Math.PI;
    expect(angle(T('only'))).toBeCloseTo(parentAngle, 6);
  });

  it('27.231 radius past the table grows by 60 and 40 per hop; control: inside the table it is the table', () => {
    expect(radius(RING_CONFIGS.desktop.R, 7)).toEqual([690 + 120, 445 + 80]);
    expect(radius(RING_CONFIGS.desktop.R, 6)).toEqual([690 + 60, 445 + 40]);
    expect(radius(RING_CONFIGS.desktop.R, 5)).toEqual([690, 445]);
  });
});
