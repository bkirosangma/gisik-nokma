/**
 * The pan bars of the Workflow and Timeline graphs spec, section 13, as data (Part 1 T1). A stress record is judged against the
 * bar for its scene and device: it must have been taken at AT LEAST the load the bar is written for (a record of 300 bars says
 * nothing about 1,200), and must clear both numbers.
 *
 * Headless Chromium composites in software, so a headless record is a floor and never evidence of a pass: `judge` says what a
 * record would be worth against the bar, and the plan quotes only `FG_HEADED=1` and real-phone records as passes.
 */
import type { SceneName, StressRecord } from './results.js';

export type Bar = {
  /** The load the bar is written for: mounted bars, nodes, or dated tickets. */
  count: number;
  minFps: number;
  maxWorstMs: number;
};

/** Spec section 13: pan, desktop (an M2 Pro class machine) and pan, phone (a real mid-range phone). */
export const BARS: Readonly<Record<SceneName, { desktop: Bar; phone: Bar }>> = {
  /** Home Timeline at 10,000 index entries: at most 1,200 mounted bars on desktop, 600 on a phone. */
  time: { desktop: { count: 1200, minFps: 60, maxWorstMs: 20 }, phone: { count: 600, minFps: 30, maxWorstMs: 50 } },
  /** A flow of 300 bars or nodes on desktop, 100 on a phone. */
  flow: { desktop: { count: 300, minFps: 60, maxWorstMs: 16.7 }, phone: { count: 100, minFps: 30, maxWorstMs: 50 } },
  /** The existing project Timeline at 2,000 dated tickets: "the desktop and phone numbers above" (the 1,200 / 600 bar row). */
  view: { desktop: { count: 2000, minFps: 60, maxWorstMs: 20 }, phone: { count: 2000, minFps: 30, maxWorstMs: 50 } },
};

export function barFor(record: Pick<StressRecord, 'scene' | 'touch'>): Bar {
  return BARS[record.scene][record.touch ? 'phone' : 'desktop'];
}

/** The reasons the record misses its bar; an empty list is a pass. */
export function judge(record: StressRecord): string[] {
  const bar = barFor(record);
  const failures: string[] = [];
  if (record.count < bar.count) failures.push(`load ${record.count} is below the bar's ${bar.count}`);
  if (record.pan.fps < bar.minFps) failures.push(`${record.pan.fps} fps is under ${bar.minFps}`);
  if (record.pan.worstMs > bar.maxWorstMs) failures.push(`worst frame ${record.pan.worstMs} ms is over ${bar.maxWorstMs}`);
  return failures;
}
