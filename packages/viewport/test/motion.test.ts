// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  MOMENTUM_TAU_MS,
  RUBBER_POWER,
  SPRING_DT_MAX_MS,
  SPRING_TAU_MS,
  clampOffset,
  momentumStep,
  releaseVelocity,
  rubber,
  rubberOvershoot,
  springAlpha,
  stepGeometric,
  stepLinear,
  tauFor,
} from '../src/index.js';

const settle = (from: number, to: number, ms: number, frame = 16) => {
  let value = from;
  let t = 0;
  let settled = false;
  while (t < ms && !settled) ({ value, settled } = stepLinear(value, to, frame)), (t += frame);
  return { value, settled, t };
};

describe('29.008 the critically damped spring', () => {
  it('29.008 tau = 85 ms: 95% of the way by about 300 ms, exactly on the target when it settles, never past it; control: a 1,000 ms step moves what a 100 ms step moves (the dt clamp)', () => {
    expect([SPRING_TAU_MS, SPRING_DT_MAX_MS]).toEqual([85, 100]);
    expect(settle(0, 1, 300).value).toBeGreaterThan(0.95);
    const done = settle(0, 1, 5000);
    expect(done.settled).toBe(true);
    expect(done.value).toBe(1);
    let v = 0;
    let max = 0;
    for (let i = 0; i < 100; i += 1) ({ value: v } = stepLinear(v, 1, 16)), (max = Math.max(max, v));
    expect(max).toBeLessThanOrEqual(1);
    // control: the clamp
    expect(springAlpha(1000)).toBe(springAlpha(100));
    expect(springAlpha(50)).toBeLessThan(springAlpha(100));
    expect(stepLinear(0, 1, 1000).value).toBeCloseTo(stepLinear(0, 1, 100).value, 12);
  });

  it('29.008 reduced motion lands at once; a zoom (px per day) eases geometrically, so halfway in time is the geometric mean; control: without reduce one frame is partial', () => {
    expect(stepLinear(0, 9, 16, 1e-3, true)).toEqual({ value: 9, settled: true });
    expect(stepGeometric(56, 8, 16, 1e-4, true)).toEqual({ value: 8, settled: true });
    expect(stepLinear(0, 9, 16).settled).toBe(false);
    const k = 1 - Math.exp(-16 / SPRING_TAU_MS);
    expect(stepGeometric(64, 4, 16).value).toBeCloseTo(64 * Math.pow(4 / 64, k), 12);
  });
});

describe('29.009 momentum', () => {
  it('29.009 the velocity is the least-squares slope of the last 80 ms; a pointer that rested before release has none; control: samples older than 80 ms are ignored', () => {
    const moving = [0, 20, 40, 60, 80].map((t) => ({ t, x: t * 2 })); // 2 px/ms = 2000 px/s
    expect(releaseVelocity(moving, 80)).toBeCloseTo(2000, 6);
    expect(releaseVelocity(moving, 400)).toBe(0); // rested 320 ms
    // t = 90 is 90 ms old: outside the 80 ms window, inside a 120 ms one
    const old = [{ t: 0, x: 0 }, { t: 10, x: 1000 }, { t: 90, x: 0 }, { t: 100, x: 1100 }, { t: 140, x: 1140 }, { t: 180, x: 1180 }];
    expect(releaseVelocity(old, 180)).toBeCloseTo(1000, 6); // only t >= 100 counts: 1 px/ms
    expect(releaseVelocity([...moving, { t: 120, x: 0 }], 80)).toBeCloseTo(2000, 6); // a sample after `now` is not in the window
    expect(releaseVelocity([{ t: 5, x: 3 }], 5)).toBe(0);
  });

  it('29.009 v(t) = v0 e^(-t/240): travel is v0 * tau, one long step equals many short ones, and it stops below 2 px/s; control: 2,000 px/s travels 480 px', () => {
    expect(MOMENTUM_TAU_MS).toBe(240);
    let s = { offset: 0, velocity: 2000, stopped: false };
    for (let t = 0; t < 10_000 && !s.stopped; t += 16) s = momentumStep(s.offset, s.velocity, 16);
    expect(s.stopped).toBe(true);
    expect(s.offset).toBeGreaterThan(478);
    expect(s.offset).toBeLessThan(480.01);
    const one = momentumStep(0, 2000, 1000);
    const many = Array.from({ length: 1000 }).reduce<{ offset: number; velocity: number; stopped: boolean }>((a) => momentumStep(a.offset, a.velocity, 1), { offset: 0, velocity: 2000, stopped: false });
    expect(one.offset).toBeCloseTo(many.offset, 3);
    expect(momentumStep(0, 3, 16).stopped).toBe(false);
    expect(momentumStep(0, 2.02, 100).stopped).toBe(true);
  });
});

describe('29.010 the rubber band', () => {
  it('29.010 power 0.3 with unit slope at the limit: resisted, monotone, and bounded by extent / 0.3; control: inside the limits nothing changes', () => {
    expect(RUBBER_POWER).toBe(0.3);
    expect(rubberOvershoot(0.001, 800) / 0.001).toBeCloseTo(1, 3);
    let last = 0;
    for (const over of [1, 10, 100, 400, 800, 3200, 12800]) {
      const shown = rubberOvershoot(over, 800);
      expect(shown).toBeGreaterThan(last);
      expect(shown).toBeLessThan(over);
      last = shown;
    }
    expect(rubberOvershoot(800, 800)).toBeCloseTo((800 * (2 ** 0.3 - 1)) / 0.3, 9);
    expect(rubber(50, 0, 100, 800)).toBe(50);
    expect(rubber(-40, 0, 100, 800)).toBeCloseTo(-rubberOvershoot(40, 800), 9);
    expect(rubber(160, 0, 100, 800)).toBeCloseTo(100 + rubberOvershoot(60, 800), 9);
    expect(clampOffset(160, 0, 100)).toBe(100);
    expect(clampOffset(-3, 0, 100)).toBe(0);
    expect(clampOffset(40, 0, 100)).toBe(40);
  });
});

describe('29.008 a long glide is faster, never cut off', () => {
  it('29.008 tauFor keeps 85 ms for a short distance and shortens it so any distance arrives inside maxMs; control: with the fixed 85 ms a 1,000,000 px glide is still moving at 450 ms', () => {
    expect(tauFor(10, 0.5, 450)).toBe(85);
    expect(tauFor(100, 0.5, 450)).toBeLessThanOrEqual(85);
    const arrive = (distance: number, tau: number) => {
      let value = 0;
      let t = 0;
      let settled = false;
      while (!settled && t < 5000) ({ value, settled } = stepLinear(value, distance, 8, 0.5, false, tau)), (t += 8);
      return t;
    };
    const tau = tauFor(1_000_000, 0.5, 450);
    expect(tau).toBeLessThan(85);
    expect(arrive(1_000_000, tau)).toBeLessThanOrEqual(450);
    expect(arrive(1_000_000, 85)).toBeGreaterThan(450);
  });
});
