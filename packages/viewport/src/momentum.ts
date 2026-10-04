/**
 * Momentum after a drag-pan (spec VP-3). On release the offset keeps its release velocity `v0` and decays
 * `v(t) = v0 * e^(-t / tau)`, tau = 240 ms, stopping below 2 px/s. The velocity is the least-squares slope of the
 * last 80 ms of pointer samples. PURE: the caller supplies the sample times and `now`.
 */
export const MOMENTUM_TAU_MS = 240;
export const MOMENTUM_STOP_PX_S = 2;
export const VELOCITY_WINDOW_MS = 80;

/** One pointer sample: `t` in ms (any origin, one clock), `x` in px along the pan axis. */
export type PanSample = { t: number; x: number };

/**
 * Release velocity in px/s: the least-squares slope of `x` over `t` for the samples no older than 80 ms before
 * `now`. Fewer than two samples in the window (the pointer rested before release) is 0.
 */
export function releaseVelocity(samples: readonly PanSample[], now: number): number {
  const recent = samples.filter((s) => now - s.t <= VELOCITY_WINDOW_MS && now - s.t >= 0);
  if (recent.length < 2) return 0;
  const n = recent.length;
  const meanT = recent.reduce((a, s) => a + s.t, 0) / n;
  const meanX = recent.reduce((a, s) => a + s.x, 0) / n;
  let num = 0;
  let den = 0;
  for (const s of recent) {
    num += (s.t - meanT) * (s.x - meanX);
    den += (s.t - meanT) * (s.t - meanT);
  }
  if (den === 0) return 0;
  return (num / den) * 1000;
}

export type MomentumState = { offset: number; velocity: number; stopped: boolean };

/**
 * One frame of the decay, integrated exactly over `dtMs` (so a long frame travels the right distance, no clamp
 * needed): distance = v * tau * (1 - e^(-dt/tau)), velocity = v * e^(-dt/tau). `velocity` is px/s.
 */
export function momentumStep(offset: number, velocity: number, dtMs: number): MomentumState {
  const dt = Math.max(0, dtMs);
  const decay = Math.exp(-dt / MOMENTUM_TAU_MS);
  const travelled = velocity * (MOMENTUM_TAU_MS / 1000) * (1 - decay);
  const next = velocity * decay;
  if (Math.abs(next) < MOMENTUM_STOP_PX_S) return { offset: offset + travelled, velocity: 0, stopped: true };
  return { offset: offset + travelled, velocity: next, stopped: false };
}
