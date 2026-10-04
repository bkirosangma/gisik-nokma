export const COAST_MS = 300;
type Sample = { t: number; x: number; y: number };
/**
 * Momentum after a drag pan (spec C §3.6; the mockup has none). Velocity over the last 100 ms of pointer samples
 * (screen px/ms) × 300 ms (the spring's visible settle). Zero if the pointer rested ≥ 50 ms before release.
 */
export function coastOffset(samples: readonly Sample[], now: number): { x: number; y: number } {
  const last = samples[samples.length - 1];
  if (last === undefined || now - last.t >= 50) return { x: 0, y: 0 };
  const recent = samples.filter((s) => last.t - s.t <= 100);
  const first = recent[0]!;
  const dt = last.t - first.t;
  if (dt <= 0) return { x: 0, y: 0 };
  return { x: ((last.x - first.x) / dt) * COAST_MS, y: ((last.y - first.y) / dt) * COAST_MS };
}
