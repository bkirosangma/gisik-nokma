// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  DT_MAX_MS,
  MAX_ZOOM,
  MIN_ZOOM,
  RUBBER_POWER,
  SETTLE_MS,
  TAU_MS,
  clampRatio,
  panTarget,
  settleFactor,
  springStep,
  zoomTarget,
} from '../../src/engine/camera.js';

const run = (from: { x: number; y: number; ratio: number }, to: typeof from, ms: number, frame = 16) => {
  let s = from, settled = false, t = 0;
  while (t < ms && !settled) ({ state: s, settled } = springStep(s, to, frame, false)), (t += frame);
  return { s, settled, t };
};

describe('the camera spring (port of loop/zoomAt/settle/panBy, knowledge-graph-sigma.html:823-839)', () => {
  it('27.240 critically damped, τ = 85 ms: 95% of the way by about 300 ms, and it settles exactly on the target; control: it never overshoots', () => {
    expect(TAU_MS).toBe(85);
    const a = { x: 0, y: 0, ratio: 1 }, b = { x: 1, y: 0, ratio: 1 };
    expect(run(a, b, 300).s.x).toBeGreaterThan(0.95);
    const done = run(a, b, 5000);
    expect(done.settled).toBe(true);
    expect(done.s).toEqual(b);
    let s = a, max = 0;
    for (let i = 0; i < 100; i += 1) ({ state: s } = springStep(s, b, 16, false)), (max = Math.max(max, s.x));
    expect(max).toBeLessThanOrEqual(1);
  });

  it('27.241 dt is clamped to 100 ms (a stalled tab does not jump); control: a 100 ms step and a 1,000 ms step move the same, 99 ms moves less, and a negative dt does not move', () => {
    expect(DT_MAX_MS).toBe(100);
    const a = { x: 0, y: 0, ratio: 1 }, b = { x: 1, y: 0, ratio: 1 };
    expect(springStep(a, b, 1000, false).state.x).toBeCloseTo(springStep(a, b, 100, false).state.x, 12);
    expect(springStep(a, b, 50, false).state.x).toBeLessThan(springStep(a, b, 100, false).state.x);
    expect(springStep(a, b, 99, false).state.x).toBeLessThan(springStep(a, b, 100, false).state.x);
    expect(springStep(a, b, -50, false)).toEqual({ state: a, settled: false });
  });

  it('27.242 prefers-reduced-motion makes the move instant; control: without it, one frame is partial', () => {
    const a = { x: 0, y: 0, ratio: 1 }, b = { x: 1, y: 2, ratio: 0.5 };
    expect(springStep(a, b, 16, true)).toEqual({ state: b, settled: true });
    expect(springStep(a, b, 16, false).settled).toBe(false);
  });

  it('27.243 the zoom ratio eases geometrically (equal steps feel equal); control: halfway in time is the geometric mean, not the arithmetic', () => {
    const a = { x: 0, y: 0, ratio: 4 }, b = { x: 0, y: 0, ratio: 1 };
    const k = 1 - Math.exp(-16 / TAU_MS);
    expect(springStep(a, b, 16, false).state.ratio).toBeCloseTo(4 * Math.pow(1 / 4, k), 12);
    // the dt at which the spring is half way (a = 0.5): 4 → 1 passes 2 (√(4·1)), not 2.5 ((4 + 1) / 2)
    expect(springStep(a, b, -TAU_MS * Math.log(0.5), false).state.ratio).toBeCloseTo(2, 12);
  });

  it('27.244 limits 0.5×–4× of the fit; past one, a soft zoom rubber-bands with power 0.3; control: inside the range nothing changes', () => {
    expect([MIN_ZOOM, MAX_ZOOM, RUBBER_POWER]).toEqual([0.5, 4, 0.3]);
    const fit = 1;
    expect(clampRatio(0.1, fit, false)).toBe(0.25); // fit / 4
    expect(clampRatio(5, fit, false)).toBe(2); // fit / 0.5
    expect(clampRatio(0.1, fit, true)).toBeCloseTo(0.25 * Math.pow(0.1 / 0.25, 0.3), 12);
    expect(clampRatio(5, fit, true)).toBeCloseTo(2 * Math.pow(5 / 2, 0.3), 12);
    expect(clampRatio(0.7, fit, true)).toBe(0.7);
    // the limits scale with the fit: at fit 2 they are 0.5 and 4
    expect(clampRatio(0.1, 2, false)).toBe(0.5);
    expect(clampRatio(5, 2, false)).toBe(4);
    expect(clampRatio(3, 2, true)).toBe(3);
  });

  it('27.245 zoom keeps the anchor fixed: the anchor\'s offset from the camera scales with the ratio; control: zooming about the camera centre leaves x,y alone', () => {
    const base = { x: 0.5, y: 0.5, ratio: 1 }, anchor = { x: 0.8, y: 0.3 };
    const t = zoomTarget(base, 2, anchor, 1, false);
    expect(t.ratio).toBe(0.5);
    expect((anchor.x - t.x) / t.ratio).toBeCloseTo((anchor.x - base.x) / base.ratio, 12);
    expect((anchor.y - t.y) / t.ratio).toBeCloseTo((anchor.y - base.y) / base.ratio, 12);
    const c = zoomTarget(base, 2, { x: 0.5, y: 0.5 }, 1, false);
    expect([c.x, c.y]).toEqual([0.5, 0.5]);
    // an over-zoom (8× from the fit) stops at the limit, or rubber-bands when soft, and the anchor still holds
    const hard = zoomTarget(base, 8, anchor, 1, false);
    expect(hard.ratio).toBe(0.25);
    expect((anchor.x - hard.x) / hard.ratio).toBeCloseTo((anchor.x - base.x) / base.ratio, 12);
    expect(zoomTarget(base, 8, anchor, 1, true).ratio).toBeCloseTo(0.25 * Math.pow(0.125 / 0.25, 0.3), 12);
  });

  it('27.246 settling after an over-zoom: the factor back to the limit, 160 ms after the last input; control: a target inside the limits needs none, and a pan only moves x,y', () => {
    expect(SETTLE_MS).toBe(160);
    expect(settleFactor({ x: 0, y: 0, ratio: 0.2 }, 1)).toBeCloseTo(0.2 / 0.25, 12);
    expect(settleFactor({ x: 0, y: 0, ratio: 3 }, 1)).toBeCloseTo(3 / 2, 12);
    expect(settleFactor({ x: 0, y: 0, ratio: 0.4 }, 2)).toBeCloseTo(0.4 / 0.5, 12);
    expect(settleFactor({ x: 0, y: 0, ratio: 0.6 }, 1)).toBeNull();
    expect(settleFactor({ x: 0, y: 0, ratio: 3 }, 2)).toBeNull();
    expect(panTarget({ x: 0.5, y: 0.5, ratio: 0.6 }, { x: 0.1, y: -0.2 })).toEqual({ x: 0.6, y: 0.3, ratio: 0.6 });
  });
});
