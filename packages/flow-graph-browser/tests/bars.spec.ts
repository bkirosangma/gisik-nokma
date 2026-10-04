import { expect, test } from '@playwright/test';
import { BARS, barFor, judge } from '../harness/bars.js';
import type { StressRecord } from '../harness/results.js';

const pan = { frames: 240, fps: 60, worstMs: 20, p95Ms: 16.7, over167: 2, over20: 0, over50: 0 };
const record = (over: Omit<Partial<StressRecord>, 'pan'> & { pan?: Partial<StressRecord['pan']> }): StressRecord => ({
  scene: 'time',
  count: 1200,
  device: 'test',
  touch: false,
  clickToSettleMs: null,
  ...over,
  pan: { ...pan, ...over.pan },
});

test('29.006 the pan bars are the spec numbers (section 13) and judge holds a record to them: exactly on the bar passes, a hair under on fps or over on the worst frame fails, and a lighter load is refused', () => {
  expect(BARS.time.desktop).toEqual({ count: 1200, minFps: 60, maxWorstMs: 20 });
  expect(BARS.time.phone).toEqual({ count: 600, minFps: 30, maxWorstMs: 50 });
  expect(BARS.flow.desktop).toEqual({ count: 300, minFps: 60, maxWorstMs: 16.7 });
  expect(BARS.flow.phone).toEqual({ count: 100, minFps: 30, maxWorstMs: 50 });
  expect(BARS.view).toEqual({ desktop: { count: 2000, minFps: 60, maxWorstMs: 20 }, phone: { count: 2000, minFps: 30, maxWorstMs: 50 } });
  // CONTROL, same test: exactly on the bar passes
  expect(judge(record({}))).toEqual([]);
  expect(judge(record({ touch: true, count: 600, pan: { fps: 30, worstMs: 50 } }))).toEqual([]);
  // one number at a time over the line
  expect(judge(record({ pan: { fps: 59.9 } }))).toEqual(['59.9 fps is under 60']);
  expect(judge(record({ pan: { worstMs: 20.1 } }))).toEqual(['worst frame 20.1 ms is over 20']);
  expect(judge(record({ scene: 'flow', count: 300, pan: { worstMs: 16.8 } }))).toEqual(['worst frame 16.8 ms is over 16.7']);
  // a lighter load says nothing about the bar
  expect(judge(record({ count: 1199 }))).toEqual(["load 1199 is below the bar's 1200"]);
  // the phone bar is chosen by touch, not by the scene
  expect(barFor(record({ touch: true }))).toBe(BARS.time.phone);
  expect(judge(record({ touch: true, count: 600, pan: { fps: 29 } }))).toEqual(['29 fps is under 30']);
});
