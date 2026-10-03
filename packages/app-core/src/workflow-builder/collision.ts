export type Rect = { x: number; y: number; width: number; height: number };
type Point = { x: number; y: number };

export const NODE_GAP = 8;

export function rectsOverlap(a: Rect, b: Rect, gap: number): boolean {
  return (
    a.x < b.x + b.width + gap &&
    a.x + a.width + gap > b.x &&
    a.y < b.y + b.height + gap &&
    a.y + a.height + gap > b.y
  );
}

/**
 * Ported from the Knowledgebase diagram's `clampToAvoidOverlap`
 * (knowledge-base/.../diagram/utils/collisionUtils.ts:39-81): a fast path, edge
 * candidates tested in every x/y combination, and a binary search as the fallback.
 */
export function clampToAvoidOverlap(
  target: Point,
  size: { width: number; height: number },
  obstacles: Rect[],
  lastValid: Point,
  gap = NODE_GAP,
): Point {
  const free = (p: Point) => obstacles.every((o) => !rectsOverlap({ ...p, ...size }, o, gap));
  if (free(target)) return target;

  const xs = new Set<number>([target.x]);
  const ys = new Set<number>([target.y]);
  for (const o of obstacles) {
    xs.add(o.x - gap - size.width);
    xs.add(o.x + o.width + gap);
    ys.add(o.y - gap - size.height);
    ys.add(o.y + o.height + gap);
  }
  let best: Point | null = null;
  let bestD = Infinity;
  for (const x of xs) {
    for (const y of ys) {
      const p = { x, y };
      if (!free(p)) continue;
      const d = (x - target.x) ** 2 + (y - target.y) ** 2;
      if (d < bestD) {
        bestD = d;
        best = p;
      }
    }
  }
  if (best) return best;

  const at = (t: number): Point => ({
    x: lastValid.x + (target.x - lastValid.x) * t,
    y: lastValid.y + (target.y - lastValid.y) * t,
  });
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    if (free(at(mid))) lo = mid;
    else hi = mid;
  }
  return at(lo);
}
