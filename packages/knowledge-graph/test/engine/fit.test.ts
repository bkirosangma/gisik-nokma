// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { type FitItem, TOP_PX, fitItemsFor, solveFit } from '../../src/engine/fit.js';

/** Projects each item with the solved camera (k1 = 1) and checks its label box against the viewport less 8 px a side, under the top bar. */
function expectFramed(items: readonly FitItem[], vp: { width: number; height: number }, topPx: number): number {
  const f = solveFit(items, 1, vp, topPx);
  const k = 1 / f.ratio;
  for (const o of items) {
    const sx = (o.x - f.cx) * k + vp.width / 2, sy = (o.y - f.cy) * k + vp.height / 2;
    expect(sx - o.l).toBeGreaterThanOrEqual(8 - 0.5);
    expect(sx + o.r).toBeLessThanOrEqual(vp.width - 8 + 0.5);
    expect(sy - o.t).toBeGreaterThanOrEqual(8 + topPx - 0.5);
    expect(sy + o.b).toBeLessThanOrEqual(vp.height - 8 + 0.5);
  }
  // tight on the bounding axis: the fit does not zoom out further than it must
  const slack = Math.min(...items.flatMap((o) => {
    const sx = (o.x - f.cx) * k + vp.width / 2, sy = (o.y - f.cy) * k + vp.height / 2;
    return [sx - o.l - 8, vp.width - 8 - (sx + o.r), sy - o.t - 8 - topPx, vp.height - 8 - (sy + o.b)];
  }));
  expect(slack, `${vp.width}x${vp.height}`).toBeLessThan(0.5);
  return f.ratio;
}

describe('the fit (port of computeFit, knowledge-graph-sigma.html:854-861)', () => {
  it('27.249 the solved camera frames every item including its label inside the viewport less 8 px a side, under the top bar; control: one item moved far out widens the ratio', () => {
    expect(TOP_PX).toEqual({ phone: 52, desktop: 40 });
    const items = [{ x: -300, y: 0, l: 16, r: 120, t: 14, b: 14 }, { x: 300, y: 0, l: 16, r: 220, t: 14, b: 14 }, { x: 0, y: -185, l: 16, r: 90, t: 18, b: 36 }];
    const vp = { width: 800, height: 500 };
    const ratio = expectFramed(items, vp, TOP_PX.desktop); // width-bound
    expectFramed(items, { width: 1200, height: 400 }, TOP_PX.desktop); // near-bound on both axes (width binds by a hair): the top bar is still reserved
    expectFramed(items, { width: 1600, height: 300 }, TOP_PX.desktop); // height-bound: the top bar decides (the amendment's viewport)
    // a phone: the centre card (key + 22-character title, §3.3), hop 1 as key-only taps on the phone ellipse, the fog ring
    const at = (deg: number) => ({ x: 150 * Math.cos((deg * Math.PI) / 180), y: 170 * Math.sin((deg * Math.PI) / 180) });
    const phone = fitItemsFor(
      [
        { x: 0, y: 0, kind: 'ticket', label: 'GN-142', sub: 'Move sheet loses its s…', center: true },
        ...[-90, 0, 90, 180].map((d, i) => ({ ...at(d), kind: 'ticket' as const, label: `GN-10${i}`, sub: null, center: false })),
      ],
      { fogRadius: [240, 262], phone: true },
    );
    expectFramed(phone, { width: 360, height: 640 }, TOP_PX.phone);
    const wider = solveFit([...items, { x: 900, y: 0, l: 16, r: 60, t: 14, b: 14 }], 1, vp, TOP_PX.desktop);
    expect(wider.ratio).toBeGreaterThan(ratio);
  });

  it('27.250 the fit holds each label (right of the dot; a person\'s below; the centre\'s over it) and the fog ring at 0.9 (desktop) or 0.82 (phone); control: no fog, no ring points', () => {
    const clear = [
      { ref: 'ticket:c', x: 0, y: 0, kind: 'ticket' as const, label: 'GN-142', sub: 'Move sheet loses its scroll', center: true },
      { ref: 'person:u', x: 300, y: 0, kind: 'person' as const, label: 'Ama Rangsa', sub: null, center: false },
      { ref: 'ticket:a', x: 0, y: 185, kind: 'ticket' as const, label: 'GN-133', sub: null, center: false },
    ];
    const withFog = fitItemsFor(clear, { fogRadius: [440, 290], phone: false });
    expect(withFog).toHaveLength(7);
    // the centre: 6 × 8.4 px of key vs 27 × 6.9 px of title, + 34; half each side + 8; the title's height above and below
    expect(withFog[0]!.l).toBeCloseTo((27 * 6.9 + 34) / 2 + 8, 9);
    expect(withFog[0]).toEqual({ x: 0, y: 0, l: withFog[0]!.l, r: withFog[0]!.l, t: 30, b: 30 });
    expect(withFog[5]).toEqual({ x: 0, y: 290 * 0.9, l: 4, r: 4, t: 4, b: 4 }); // the VERTICAL radius is the second one
    expect(withFog[0]!.r).toBeCloseTo((27 * 6.9 + 34) / 2 + 8, 9);
    expect(withFog[1]).toEqual({ x: 300, y: 0, l: 43, r: 43, t: 18, b: 42 }); // a labelled person: label below
    expect(withFog[2]).toEqual({ x: 0, y: 185, l: 16, r: 6 * 7 + 34, t: 14, b: 14 });
    expect(withFog.slice(3)).toEqual([
      { x: 440 * 0.9, y: 0, l: 4, r: 4, t: 4, b: 4 },
      { x: -1 * 440 * 0.9, y: 0, l: 4, r: 4, t: 4, b: 4 },
      { x: 0, y: 290 * 0.9, l: 4, r: 4, t: 4, b: 4 },
      { x: 0, y: -1 * 290 * 0.9, l: 4, r: 4, t: 4, b: 4 },
    ]);
    expect(fitItemsFor(clear, { fogRadius: [240, 262], phone: true })[3]!.x).toBeCloseTo(240 * 0.82, 9);
    expect(fitItemsFor(clear, { fogRadius: null, phone: false })).toHaveLength(3);
    // the other shapes: a centre with no title, a person with no label, a ticket with a title, an unlabelled item
    const more = fitItemsFor(
      [
        { x: 0, y: 0, kind: 'note', label: 'Note', sub: null, center: true },
        { x: 1, y: 2, kind: 'person', label: '', sub: null, center: false },
        { x: 3, y: 4, kind: 'ticket', label: 'GN-1', sub: 'A title, twelve words of it', center: false },
        { x: 5, y: 6, kind: 'concept', label: '', sub: null, center: false },
      ],
      { fogRadius: null, phone: false },
    );
    expect(more).toEqual([
      { x: 0, y: 0, l: (4 * 8.4 + 34) / 2 + 8, r: (4 * 8.4 + 34) / 2 + 8, t: 16, b: 16 },
      { x: 1, y: 2, l: 18, r: 18, t: 18, b: 18 },
      { x: 3, y: 4, l: 16, r: 27 * 6.9 + 34, t: 18, b: 36 },
      { x: 5, y: 6, l: 16, r: 10, t: 14, b: 14 },
    ]);
  });
});
