import type { GraphItemKind } from '@gisik-nokma/domain';

export type FitItem = { x: number; y: number; l: number; r: number; t: number; b: number };
export const TOP_PX = { phone: 52, desktop: 40 } as const;

/** The fit's items (`render`, `knowledge-graph-sigma.html:924-928`): each clear item with its label's extent in screen px; 4 points on the fog ring. Layout coords, y down. */
export function fitItemsFor(
  clear: readonly { x: number; y: number; kind: GraphItemKind; label: string; sub: string | null; center: boolean }[],
  opts: { fogRadius: readonly [number, number] | null; phone: boolean },
): FitItem[] {
  const out: FitItem[] = clear.map((o) => {
    if (o.kind === 'person') {
      const w = Math.max((o.label.length * 7) / 2 + 8, 18);
      return { x: o.x, y: o.y, l: w, r: w, t: 18, b: o.label ? 42 : 18 };
    }
    const w = Math.max(o.label.length * (o.center ? 8.4 : 7), (o.sub ?? '').length * 6.9) + (o.label ? 34 : 10);
    if (o.center) return { x: o.x, y: o.y, l: w / 2 + 8, r: w / 2 + 8, t: o.sub ? 30 : 16, b: o.sub ? 30 : 16 };
    return { x: o.x, y: o.y, l: 16, r: w, t: o.sub ? 18 : 14, b: o.sub ? 36 : 14 };
  });
  if (opts.fogRadius !== null) {
    const k = opts.phone ? 0.82 : 0.9;
    for (const [a, b] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) out.push({ x: a * opts.fogRadius[0] * k, y: b * opts.fogRadius[1] * k, l: 4, r: 4, t: 4, b: 4 });
  }
  return out;
}

/**
 * `computeFit` (`:854-861`), without Sigma: `k1` is screen px per layout unit at ratio 1 (the adapter measures it with
 * `graphToViewport` at a unit camera). Returns the layout-space centre (y down) and the ratio; the adapter normalises
 * the centre with `getNormalizationFunction()({ x: cx, y: -cy })`. Four rounds, because a label's px size does not scale.
 */
export function solveFit(items: readonly FitItem[], k1: number, viewport: { width: number; height: number }, topPx: number): { cx: number; cy: number; ratio: number } {
  let r = 1;
  let box = { L: 0, R: 0, T: 0, B: 0, k: k1 };
  for (let it = 0; it < 4; it += 1) {
    const k = k1 / r;
    let L = Infinity, R = -Infinity, T = Infinity, B = -Infinity;
    for (const o of items) {
      const x = o.x * k, y = o.y * k;
      L = Math.min(L, x - o.l); R = Math.max(R, x + o.r); T = Math.min(T, y - o.t); B = Math.max(B, y + o.b);
    }
    T -= topPx;
    box = { L, R, T, B, k };
    r = r * Math.max((R - L) / (viewport.width - 16), (B - T) / (viewport.height - 16));
  }
  return { cx: (box.L + box.R) / 2 / box.k, cy: (box.T + box.B) / 2 / box.k, ratio: r };
}
