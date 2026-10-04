/**
 * The spring every glide uses (spec VP-4, VP-5, VP-6): tau = 85 ms, about 300 ms to settle, and a step is never longer
 * than 100 ms, so a stalled tab does not jump. The constants equal the camera spring in the Knowledge Graph view plan
 * (`docs/superpowers/plans/2026-10-03-knowledge-graph-view.md` on `docs/kg-plans-cd`, its `engine/camera.ts`:
 * `TAU_MS = 85`, `DT_MAX_MS = 100`; that engine is not on this base yet) so the two surfaces feel alike. (It is the
 * first-order critically damped form that plan uses: each frame closes the share `1 - e^(-dt / tau)` of the remaining
 * distance. It never overshoots and is exact for any frame length.)
 *
 * PURE: no clock, no DOM. The caller passes the frame's `dtMs`.
 */
export const SPRING_TAU_MS = 85;
export const SPRING_DT_MAX_MS = 100;

/** The share of the remaining distance one frame closes. `dtMs` is clamped to [0, 100]. */
export function springAlpha(dtMs: number, tauMs = SPRING_TAU_MS): number {
  const dt = Math.min(SPRING_DT_MAX_MS, Math.max(0, dtMs));
  return 1 - Math.exp(-dt / tauMs);
}

/**
 * VP-5: a glide takes at most `maxMs` whatever the distance. A first-order spring needs `tau * ln(distance / epsilon)`
 * to arrive, so a long distance gets a SHORTER tau (a faster spring), never a snap at the end. Short distances keep 85 ms.
 */
export function tauFor(distance: number, epsilon: number, maxMs: number): number {
  const steps = Math.log(Math.max(Math.E, Math.abs(distance) / epsilon));
  // 5% margin, so a frame boundary never carries the glide past the cap.
  return Math.min(SPRING_TAU_MS, (0.95 * maxMs) / steps);
}

export type SpringResult = { value: number; settled: boolean };

/** One frame toward `target`, linear. `epsilon` is the distance (in the value's own unit) that counts as arrived. */
export function stepLinear(
  current: number,
  target: number,
  dtMs: number,
  epsilon = 1e-3,
  reduce = false,
  tauMs = SPRING_TAU_MS,
): SpringResult {
  if (reduce) return { value: target, settled: true };
  const next = current + (target - current) * springAlpha(dtMs, tauMs);
  if (Math.abs(next - target) < epsilon) return { value: target, settled: true };
  return { value: next, settled: false };
}

/**
 * One frame toward `target`, geometric: equal steps feel equal on a zoom (px per day). Both values must be > 0.
 * Halfway in time is the geometric mean, not the arithmetic one.
 */
export function stepGeometric(
  current: number,
  target: number,
  dtMs: number,
  epsilon = 1e-4,
  reduce = false,
  tauMs = SPRING_TAU_MS,
): SpringResult {
  if (reduce) return { value: target, settled: true };
  const next = current * Math.pow(target / current, springAlpha(dtMs, tauMs));
  if (Math.abs(next / target - 1) < epsilon) return { value: target, settled: true };
  return { value: next, settled: false };
}
