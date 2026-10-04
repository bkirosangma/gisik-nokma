/**
 * The record a stress run leaves behind. A phone cannot be driven by a test runner, so a run on it (`stress.html?auto=1`)
 * shows its numbers on screen AND posts them to the dev server (`/__results`, see vite.config.ts), which appends one JSON line
 * per run to `results/stress.jsonl`. `parseResult` is the one gate on that file: a body that is not a run record is refused,
 * so a stray request cannot put a line in it.
 */
import type { FrameStats } from './sampler.js';

export type SceneName = 'time' | 'flow' | 'view';
export type StressRecord = {
  scene: SceneName;
  /** What was on the page: mounted bars, nodes, or dated tickets. */
  count: number;
  /** `navigator.userAgent`, so a line says which device it came from. */
  device: string;
  /** Ran on a real touch device (`maxTouchPoints > 0`). */
  touch: boolean;
  /** The scripted pan: the second pass of three (the first is warm-up). */
  pan: FrameStats;
  /** `scene === 'view'` only: ms from a click to the frame after it settled. Null for the other scenes. */
  clickToSettleMs: number | null;
};

const SCENES: readonly SceneName[] = ['time', 'flow', 'view'];
const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

/** The record, or the reason the body is not one. */
export function parseResult(body: unknown): { ok: true; record: StressRecord } | { ok: false; reason: string } {
  if (typeof body !== 'object' || body === null) return { ok: false, reason: 'not an object' };
  const b = body as Record<string, unknown>;
  if (!SCENES.includes(b['scene'] as SceneName)) return { ok: false, reason: `unknown scene ${String(b['scene'])}` };
  if (!isNumber(b['count']) || b['count'] < 0) return { ok: false, reason: 'count must be a non-negative number' };
  if (typeof b['device'] !== 'string' || b['device'].length === 0) return { ok: false, reason: 'device must be a non-empty string' };
  if (typeof b['touch'] !== 'boolean') return { ok: false, reason: 'touch must be a boolean' };
  const pan = b['pan'] as Record<string, unknown> | null;
  if (typeof pan !== 'object' || pan === null) return { ok: false, reason: 'pan must be a stats object' };
  for (const key of ['frames', 'fps', 'worstMs', 'p95Ms', 'over167', 'over20', 'over50']) {
    if (!isNumber(pan[key])) return { ok: false, reason: `pan.${key} must be a number` };
  }
  if (b['clickToSettleMs'] !== null && !isNumber(b['clickToSettleMs'])) return { ok: false, reason: 'clickToSettleMs must be a number or null' };
  return { ok: true, record: body as StressRecord };
}
