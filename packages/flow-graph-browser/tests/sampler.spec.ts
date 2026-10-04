import { expect, test } from '@playwright/test';
import { frameStats } from '../harness/sampler.js';

test('29.001 frameStats: 60 fps steady is 60 and 16.7 ms; a planted 120 ms stall is the worst frame and is counted over every budget; control: no stall, none over', () => {
  const steady = Array.from({ length: 120 }, () => 16.7);
  const base = frameStats(steady);
  expect(base).toMatchObject({ frames: 120, fps: 59.9, worstMs: 16.7, p95Ms: 16.7, over167: 0, over20: 0, over50: 0 });

  const stalled = [...steady];
  stalled[60] = 120;
  const s = frameStats(stalled);
  expect(s.worstMs).toBe(120);
  expect([s.over167, s.over20, s.over50]).toEqual([1, 1, 1]);
  // the mean moves a little, the worst frame moves a lot: the bars are written in the worst frame for this reason
  expect(s.fps).toBeLessThan(base.fps);
  expect(s.p95Ms).toBe(16.7);
});

test('29.001 frameStats: p95 is the 95th-percentile gap, 6 slow frames in 100 put it on the slow value, 5 do not (nearest rank: the 95th of 100); no frames is refused, not reported as 0 fps', () => {
  const gaps = (slow: number) => [...Array.from({ length: 100 - slow }, () => 10), ...Array.from({ length: slow }, () => 40)];
  expect(frameStats(gaps(5)).p95Ms).toBe(10);
  expect(frameStats(gaps(6)).p95Ms).toBe(40);
  expect(() => frameStats([])).toThrow(RangeError);
});
