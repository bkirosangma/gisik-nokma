/**
 * Edge routing on packed rows (spec TG-5). PURE and deterministic.
 *
 * An arrow leaves the source bar's END anchor, runs on axis-aligned segments only, and enters the target bar's START
 * anchor with the arrowhead on the anchor: from the left in landscape, from above in portrait. It takes a vertical
 * run in the gutter just before the target (`target.start - 14 px`), or just after the source end, or, when the target
 * starts before the source ends, a horizontal channel in the middle of the row gap next to the source row, on the target's
 * side (below it when the target is on the same row or lower, above it when higher): never on a bar's edge or inside
 * another row's bars. Of those candidates (in that order) the first that crosses no third bar wins; if none is clean, the
 * one with the fewest crossings.
 *
 * Portrait is the same router on transposed boxes: time runs down, so "left" becomes "above".
 * Loops (TG-12) are curves, not corners: `routeLoop` below.
 */
export type Box = { x: number; y: number; w: number; h: number };
export type Pt = { x: number; y: number };
export type Orientation = 'landscape' | 'portrait';
export type Route = {
  /** From the source's end anchor to the target's start anchor, every step axis-aligned. */
  points: Pt[];
  /** Where the label pill sits: the middle of the longest segment along the time axis. */
  label: Pt;
  /** Third bars the chosen path still crosses (0 when a clean candidate existed). */
  crossings: number;
};

export const GUTTER_PX = 14;
/** The gap between two rows of bars (spec TG-13: a 28 px bar in a 40 px pitch, 12 px of gap). */
const ROW_GAP_PX = 12;

const transposeBox = (b: Box): Box => ({ x: b.y, y: b.x, w: b.h, h: b.w });
const transposePt = (p: Pt): Pt => ({ x: p.y, y: p.x });

function segmentCrossesBox(a: Pt, b: Pt, box: Box): boolean {
  if (a.y === b.y) {
    return a.y > box.y && a.y < box.y + box.h && Math.max(a.x, b.x) > box.x && Math.min(a.x, b.x) < box.x + box.w;
  }
  return a.x > box.x && a.x < box.x + box.w && Math.max(a.y, b.y) > box.y && Math.min(a.y, b.y) < box.y + box.h;
}

function crossings(points: readonly Pt[], obstacles: readonly Box[]): number {
  let n = 0;
  for (const box of obstacles) {
    for (let i = 1; i < points.length; i += 1) {
      if (segmentCrossesBox(points[i - 1] as Pt, points[i] as Pt, box)) {
        n += 1;
        break;
      }
    }
  }
  return n;
}

/** Drops zero-length steps and collinear middle points, so the path is the minimum number of corners. */
function simplify(points: readonly Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (last !== undefined && last.x === p.x && last.y === p.y) continue;
    out.push(p);
  }
  for (let i = out.length - 2; i >= 1; i -= 1) {
    const a = out[i - 1] as Pt;
    const b = out[i] as Pt;
    const c = out[i + 1] as Pt;
    if ((a.x === b.x && b.x === c.x) || (a.y === b.y && b.y === c.y)) out.splice(i, 1);
  }
  return out;
}

function routeLandscape(from: Box, to: Box, obstacles: readonly Box[]): Route {
  const s: Pt = { x: from.x + from.w, y: from.y + from.h / 2 };
  const t: Pt = { x: to.x, y: to.y + to.h / 2 };
  const vx = t.x - GUTTER_PX;
  const ux = s.x + GUTTER_PX;
  const below = t.y >= s.y;
  const cy = below ? from.y + from.h + ROW_GAP_PX / 2 : from.y - ROW_GAP_PX / 2;
  const candidates: Pt[][] = [];
  if (s.y === t.y && s.x < t.x) candidates.push([s, t]);
  if (vx > s.x) candidates.push([s, { x: vx, y: s.y }, { x: vx, y: t.y }, t]);
  if (ux < t.x) candidates.push([s, { x: ux, y: s.y }, { x: ux, y: t.y }, t]);
  candidates.push([s, { x: ux, y: s.y }, { x: ux, y: cy }, { x: vx, y: cy }, { x: vx, y: t.y }, t]);
  let best: Pt[] = candidates[0] as Pt[];
  let bestCrossings = Number.POSITIVE_INFINITY;
  for (const c of candidates) {
    const n = crossings(c, obstacles);
    if (n < bestCrossings) {
      best = c;
      bestCrossings = n;
      if (n === 0) break;
    }
  }
  const points = simplify(best);
  let longest = -1;
  let label: Pt = points[0] as Pt;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1] as Pt;
    const b = points[i] as Pt;
    if (a.y === b.y && Math.abs(b.x - a.x) > longest) {
      longest = Math.abs(b.x - a.x);
      label = { x: (a.x + b.x) / 2, y: a.y };
    }
  }
  return { points, label, crossings: bestCrossings };
}

/**
 * `from` and `to` are the two bars' boxes in px; `obstacles` are every other bar on the surface. `orientation` is the
 * surface's: landscape runs time left to right, portrait top to bottom.
 */
export function routeEdge(from: Box, to: Box, obstacles: readonly Box[], orientation: Orientation = 'landscape'): Route {
  if (orientation === 'landscape') return routeLandscape(from, to, obstacles);
  const r = routeLandscape(transposeBox(from), transposeBox(to), obstacles.map(transposeBox));
  return { points: r.points.map(transposePt), label: transposePt(r.label), crossings: r.crossings };
}

// ---- loops (TG-12) ----

/** A loop's smallest lift above the higher end, and the three lifts tried in turn when a bar is in the way. */
export const LOOP_LIFTS_PX = [28, 64, 100] as const;
/** How far inside the target bar's start the arrowhead lands, at most (a bar narrower than twice this lands in its middle). */
export const LOOP_ENTRY_INSET_PX = 6;

export type LoopRoute = {
  /** One cubic: `M x y C x y, x y, x y`, from the source's anchor to the arrowhead on the target. */
  d: string;
  /** The four points of the cubic: start, two controls, end. */
  points: [Pt, Pt, Pt, Pt];
  /** Where the label sits: the highest point of the curve (the left-most in portrait), on a chip of the canvas colour. */
  label: Pt;
  /** Third bars the chosen curve still crosses (0 when a lift was clean). */
  crossings: number;
};

const bezierAt = (p: readonly [Pt, Pt, Pt, Pt], t: number): Pt => {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const e = t * t * t;
  return { x: a * p[0].x + b * p[1].x + c * p[2].x + e * p[3].x, y: a * p[0].y + b * p[1].y + c * p[2].y + e * p[3].y };
};

const LOOP_SAMPLES = 48;
const round2 = (n: number): number => Math.round(n * 100) / 100;

/**
 * A loop is a curved return arrow from a Decision to the bar its outcome sends the work back to (TG-12). No pill, no corners.
 * Landscape: it leaves the diamond's TOP anchor going up, arcs over everything between, and comes down onto the target's top
 * edge just inside its start with the arrowhead (so it arrives "from above"). Portrait (time runs down): it leaves the
 * diamond's LEFT anchor going left and comes down onto the target's top edge. The curve is one cubic whose two controls sit
 * `lift` px beyond the endpoints; the smallest of `LOOP_LIFTS_PX` whose sampled curve crosses no third bar wins, otherwise the
 * one with the fewest crossings. Deterministic: the result is a function of the boxes alone.
 */
export function routeLoop(from: Box, to: Box, obstacles: readonly Box[] = [], orientation: Orientation = 'landscape'): LoopRoute {
  const portrait = orientation === 'portrait';
  const s: Pt = portrait ? { x: from.x, y: from.y + from.h / 2 } : { x: from.x + from.w / 2, y: from.y };
  const e: Pt = { x: to.x + Math.min(LOOP_ENTRY_INSET_PX, to.w / 2), y: to.y };
  let best: LoopRoute | null = null;
  for (const lift of LOOP_LIFTS_PX) {
    const c1: Pt = portrait ? { x: Math.min(s.x, e.x) - lift, y: s.y } : { x: s.x, y: Math.min(s.y, e.y) - lift };
    const c2: Pt = portrait ? { x: e.x, y: e.y - lift } : { x: e.x, y: Math.min(s.y, e.y) - lift };
    const points: [Pt, Pt, Pt, Pt] = [s, c1, c2, e];
    let label = s;
    const sampled: Pt[] = [];
    for (let i = 0; i <= LOOP_SAMPLES; i += 1) {
      const p = bezierAt(points, i / LOOP_SAMPLES);
      sampled.push(p);
      if (portrait ? p.x < label.x : p.y < label.y) label = p;
    }
    let n = 0;
    for (const box of obstacles) {
      if (sampled.some((p) => p.x > box.x && p.x < box.x + box.w && p.y > box.y && p.y < box.y + box.h)) n += 1;
    }
    const d = `M ${round2(s.x)} ${round2(s.y)} C ${round2(c1.x)} ${round2(c1.y)}, ${round2(c2.x)} ${round2(c2.y)}, ${round2(e.x)} ${round2(e.y)}`;
    if (best === null || n < best.crossings) best = { d, points, label: { x: round2(label.x), y: round2(label.y) }, crossings: n };
    if (n === 0) break;
  }
  return best as LoopRoute;
}
