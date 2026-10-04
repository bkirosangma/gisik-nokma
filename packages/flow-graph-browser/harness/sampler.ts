/**
 * Frame pacing for the stress scenes (Workflow and Timeline graphs, Part 1 T1; spec §13 pan bars).
 *
 * PURE: `frameStats` takes the gaps between consecutive animation frames in milliseconds and answers the three numbers the
 * bars are written in (frames a second, the worst frame, how many frames missed a budget). `samplePan` is the only DOM-facing
 * function: it drives a scripted pan on `requestAnimationFrame` and returns the gaps.
 */
export type FrameStats = {
  frames: number;
  /** 1000 / the mean gap. */
  fps: number;
  /** The largest gap. The bars say "worst frame <= N ms". */
  worstMs: number;
  p95Ms: number;
  /** Frames whose gap exceeded 16.7, 20 and 50 ms (a 60 fps frame, the desktop bar, the phone bar). */
  over167: number;
  over20: number;
  over50: number;
};

export function frameStats(gapsMs: readonly number[]): FrameStats {
  if (gapsMs.length === 0) throw new RangeError('frameStats: no frames were sampled');
  const sorted = [...gapsMs].sort((a, b) => a - b);
  const sum = gapsMs.reduce((total, gap) => total + gap, 0);
  const p95 = sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)] as number;
  const round = (n: number): number => Math.round(n * 10) / 10;
  return {
    frames: gapsMs.length,
    fps: round(1000 / (sum / gapsMs.length)),
    worstMs: round(sorted[sorted.length - 1] as number),
    p95Ms: round(p95),
    over167: gapsMs.filter((gap) => gap > 16.7).length,
    over20: gapsMs.filter((gap) => gap > 20).length,
    over50: gapsMs.filter((gap) => gap > 50).length,
  };
}

/**
 * Runs `step(dtMs, elapsedMs)` once per animation frame for `durationMs` and returns the gaps between frames. The first gap
 * (start-up, not a pan frame) is dropped. `step` is where a scene moves: `scrollLeft += ...`, or a camera transform.
 */
export function samplePan(step: (dtMs: number, elapsedMs: number) => void, durationMs: number): Promise<number[]> {
  return new Promise((resolve) => {
    const gaps: number[] = [];
    let last = 0;
    let start = 0;
    const frame = (now: number): void => {
      if (last === 0) {
        last = now;
        start = now;
        requestAnimationFrame(frame);
        return;
      }
      const dt = now - last;
      last = now;
      step(dt, now - start);
      gaps.push(dt);
      if (now - start < durationMs) requestAnimationFrame(frame);
      else resolve(gaps);
    };
    requestAnimationFrame(frame);
  });
}
