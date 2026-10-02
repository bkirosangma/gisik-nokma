import { clampToAvoidOverlap, type Rect } from './collision.js';

export const GRID = 16;
export const GUIDE_SCREEN_PX = 6;

export type Guide = { axis: 'x' | 'y'; at: number };
type Point = { x: number; y: number };

// Indices into [start, centre, end]. Centre↔centre comes FIRST so a tie keeps it, then
// start↔start, end↔end, start↔end, end↔start.
const PAIRS: [number, number][] = [[1, 1], [0, 0], [2, 2], [0, 2], [2, 0]];

function guideAxis(
  start: number,
  len: number,
  others: { start: number; len: number }[],
  threshold: number,
): { value: number; at: number } | null {
  const mine = [start, start + len / 2, start + len];
  let best: { value: number; at: number; d: number } | null = null;
  for (const o of others) {
    const theirs = [o.start, o.start + o.len / 2, o.start + o.len];
    for (const [i, j] of PAIRS) {
      const d = Math.abs(mine[i]! - theirs[j]!);
      if (d <= threshold && (best === null || d < best.d)) {
        best = { value: start + (theirs[j]! - mine[i]!), at: theirs[j]!, d };
      }
    }
  }
  return best && { value: best.value, at: best.at };
}

export function snapPosition(
  raw: Point,
  size: { width: number; height: number },
  others: Rect[],
  opts: { zoom: number; alt: boolean; lastValid: Point },
): { position: Point; guides: Guide[]; blocked: boolean; target: Point } {
  let x = raw.x;
  let y = raw.y;
  const guides: Guide[] = [];
  if (!opts.alt) {
    const threshold = GUIDE_SCREEN_PX / opts.zoom;
    const gx = guideAxis(raw.x, size.width, others.map((o) => ({ start: o.x, len: o.width })), threshold);
    const gy = guideAxis(raw.y, size.height, others.map((o) => ({ start: o.y, len: o.height })), threshold);
    if (gx) {
      x = gx.value;
      guides.push({ axis: 'x', at: gx.at });
    } else x = Math.round(raw.x / GRID) * GRID;
    if (gy) {
      y = gy.value;
      guides.push({ axis: 'y', at: gy.at });
    } else y = Math.round(raw.y / GRID) * GRID;
  }
  const target = { x, y };
  const position = clampToAvoidOverlap(target, size, others, opts.lastValid);
  const kept = guides.filter((g) => (g.axis === 'x' ? position.x === target.x : position.y === target.y));
  return { position, guides: kept, blocked: position.x !== target.x || position.y !== target.y, target };
}
