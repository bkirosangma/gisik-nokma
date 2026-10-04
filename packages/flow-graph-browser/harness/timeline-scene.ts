import type { Draw } from '@gisik-nokma/app-core/timeline-graph';

/**
 * The Home-shaped scene of WTG Part 4 T2 (cases 29.300-29.302; spec HM-3): lane headings, randomly filled rows, long and
 * short bars, a pin on every tenth. Deterministic (a seeded mulberry32, no `Math.random`), so two runs pan the same scene.
 */
const mulberry32 = (seed: number) => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };

export const PPD = 24, BAR_H = 28, PITCH = 40, HEADING_H = 34;
export type SceneSpec = { count: number; days: number; lanes: number; rowsPerLane: number };
export type HomeScene = { draws: Draw[]; width: number; height: number; days: number; count: number };

/** Home-shaped (HM-3): lane headings, packed rows, long and short bars, edges only for one selected flow. */
export function makeHomeScene(spec: SceneSpec): HomeScene {
  const rnd = mulberry32(7);
  const draws: Draw[] = [];
  const laneH = HEADING_H + spec.rowsPerLane * PITCH;
  for (let l = 0; l < spec.lanes; l++) {
    draws.push({ kind: 'heading', id: `h${l}`, z: 0, sticky: true, text: `Project ${l + 1}`, b: { x0: 0, x1: spec.days * PPD, y0: l * laneH, y1: l * laneH + HEADING_H } });
  }
  for (let i = 0; i < spec.count; i++) {
    const lane = i % spec.lanes;
    const row = Math.floor(rnd() * spec.rowsPerLane);
    const start = Math.floor(rnd() * (spec.days - 8));
    const len = 1 + Math.floor(rnd() * (rnd() < 0.15 ? 12 : 4));
    const w = len * PPD;
    const y0 = lane * laneH + HEADING_H + row * PITCH;
    draws.push({
      kind: 'bar', id: `b${i}`, ticketId: `t${i}`, z: 1, b: { x0: start * PPD, x1: start * PPD + w, y0, y1: y0 + BAR_H },
      style: (['done', 'active', 'planned'] as const)[i % 3] ?? 'planned', key: `GN-${i}`, title: `Item ${i}`, long: w >= 150,
      mark: i % 3 === 0 ? 'done' : i % 3 === 1 ? 'active' : null, passRank: 0, pass: 1, pin: i % 10 === 0 ? { notes: 1, attachments: 0 } : null,
      chip: null, draft: false, labelPx: w >= 150 ? 0 : 56, keyOutside: w < 64, pinAt: i % 10 === 0 ? (w < 82 ? 'after-key' : 'inside') : null, ariaLabel: `Item ${i}`,
    });
  }
  return { draws, width: spec.days * PPD, height: spec.lanes * laneH, days: spec.days, count: spec.count };
}
export const DESKTOP: SceneSpec = { count: 10_000, days: 1_100, lanes: 12, rowsPerLane: 10 };
/**
 * Tuned in Step 4 until `maxMounted` sits near 600 on the 412 x 795 px stage (overscan 256, quantum 128): 594, measured LOCAL
 * on the Pixel 7 proxy. 240 days is room for the 10-viewport pan (4,120 px) and its window; the count sets the density.
 */
export const PHONE: SceneSpec = { count: 11_000, days: 240, lanes: 12, rowsPerLane: 10 };
