/**
 * The camera spring (spec C §3.6), pure: the Sigma adapter owns `requestAnimationFrame` and the coordinate
 * conversions and calls these each frame. Ported from the mockup's `loop`, `zoomAt`, `settle` and `panBy`
 * (`knowledge-graph-sigma.html:823-839`).
 */
export type CameraState = { x: number; y: number; ratio: number };
export const TAU_MS = 85;
export const DT_MAX_MS = 100;
export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 4;
/** `zoomAt`'s idle timer (`:834`): the spring-back starts this long after the last input. */
export const SETTLE_MS = 160;
export const RUBBER_POWER = 0.3;

/** One frame of the critically damped spring (`loop`, `:823-826`). Ratio interpolates geometrically. */
export function springStep(c: CameraState, t: CameraState, dtMs: number, reduce: boolean): { state: CameraState; settled: boolean } {
  if (reduce) return { state: { ...t }, settled: true };
  const a = 1 - Math.exp(-Math.min(DT_MAX_MS, Math.max(0, dtMs)) / TAU_MS);
  const n = { x: c.x + (t.x - c.x) * a, y: c.y + (t.y - c.y) * a, ratio: c.ratio * Math.pow(t.ratio / c.ratio, a) };
  if (Math.abs(n.x - t.x) < 1e-5 && Math.abs(n.y - t.y) < 1e-5 && Math.abs(n.ratio / t.ratio - 1) < 1e-4) return { state: { ...t }, settled: true };
  return { state: n, settled: false };
}

/** The limits of `zoomAt` (`:831-832`): Sigma's ratio is inverse zoom, so 4× = fit/4 and 0.5× = fit/0.5. */
export function clampRatio(r: number, fitRatio: number, soft: boolean): number {
  const lo = fitRatio / MAX_ZOOM, hi = fitRatio / MIN_ZOOM;
  if (r < lo) return soft ? lo * Math.pow(r / lo, RUBBER_POWER) : lo;
  if (r > hi) return soft ? hi * Math.pow(r / hi, RUBBER_POWER) : hi;
  return r;
}

/** `zoomAt` (`:831-834`). `anchor` is the graph point under the pointer, read with `{ cameraState: base }` (§4.2 trap 8). */
export function zoomTarget(base: CameraState, factor: number, anchor: { x: number; y: number }, fitRatio: number, soft: boolean): CameraState {
  const r = clampRatio(base.ratio / factor, fitRatio, soft);
  const k = r / base.ratio;
  return { x: anchor.x + (base.x - anchor.x) * k, y: anchor.y + (base.y - anchor.y) * k, ratio: r };
}

/** `settle` (`:835-836`): the factor that brings an over-zoomed target back inside, or null. */
export function settleFactor(target: CameraState, fitRatio: number): number | null {
  const r = Math.max(fitRatio / MAX_ZOOM, Math.min(fitRatio / MIN_ZOOM, target.ratio));
  return r === target.ratio ? null : target.ratio / r;
}

/** `panBy` (`:837-839`), with the graph delta already converted by the adapter. */
export function panTarget(base: CameraState, d: { x: number; y: number }): CameraState {
  return { x: base.x + d.x, y: base.y + d.y, ratio: base.ratio };
}
