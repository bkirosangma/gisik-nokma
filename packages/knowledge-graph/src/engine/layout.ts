import type { Level } from '../render/node-attributes.js';
import type { Walk } from './walk.js';

export type RingConfig = { R: readonly (readonly [number, number])[]; levels: readonly Level[]; min: readonly number[] };
export type RingConfigName = 'desktop' | 'phone' | 'home';
/** `CFG`, verbatim (`knowledge-graph-sigma.html:602-606`). */
export const RING_CONFIGS: Record<RingConfigName, RingConfig> = {
  desktop: { R: [[0, 0], [300, 185], [440, 290], [545, 355], [625, 405], [690, 445]], levels: ['card', 'chip', 'compact', 'dot'], min: [0, 0, 13, 9, 7, 6] },
  phone: { R: [[0, 0], [150, 170], [240, 262], [300, 320], [340, 360], [370, 390]], levels: ['cardS', 'tap'], min: [0, 0, 16, 11, 8, 7] },
  home: { R: [[0, 0], [260, 150], [560, 330], [700, 420], [790, 480], [860, 520]], levels: ['card', 'chip', 'compact', 'dot'], min: [0, 0, 13, 9, 7, 6] },
};

/** `radius` (`:607`): past the table, +60 / +40 per hop. */
export function radius(R: RingConfig['R'], h: number): [number, number] {
  if (h < R.length) return [R[h]![0], R[h]![1]];
  const last = R[R.length - 1]!;
  const extra = h - R.length + 1;
  return [last[0] + 60 * extra, last[1] + 40 * extra];
}

/** `layout` (`:608-617`): angles from −90°, hop 1 evenly; children centred on the parent's angle, `min[d+1]` apart. Layout y points DOWN; the adapter flips it. */
export function layoutRings(w: Walk, center: string, cfg: RingConfig, ringOf: (ref: string) => number): Map<string, { x: number; y: number }> {
  const angle = new Map<string, { a: number; w: number }>([[center, { a: -90, w: 360 }]]);
  const pos = new Map<string, { x: number; y: number }>([[center, { x: 0, y: 0 }]]);
  const h1 = w.kids.get(center) ?? [];
  h1.forEach((id, i) => angle.set(id, { a: -90 + (i * 360) / h1.length, w: 360 / h1.length }));
  for (const id of w.order) {
    if (id === center) continue;
    const p = angle.get(id)!;
    const [rx, ry] = radius(cfg.R, ringOf(id));
    const rad = (p.a * Math.PI) / 180;
    pos.set(id, { x: rx * Math.cos(rad), y: ry * Math.sin(rad) });
    const ks = w.kids.get(id) ?? [];
    if (ks.length === 0) continue;
    const step = Math.max(p.w / ks.length, cfg.min[(w.dist.get(id) ?? 0) + 1] ?? 6);
    ks.forEach((k, j) => angle.set(k, { a: p.a + (j - (ks.length - 1) / 2) * step, w: step }));
  }
  return pos;
}
