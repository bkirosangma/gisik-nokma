/**
 * The ONLY file in the package that names the browser clock (spec VP-0: `src/dom/` owns `requestAnimationFrame` and
 * `performance.now()`). Everything above it takes a `Clock`, so a test drives frames by hand.
 */
export type Clock = {
  now(): number;
  raf(callback: () => void): number;
  caf(handle: number): void;
};

export const browserClock: Clock = {
  now: () => performance.now(),
  raf: (callback) => requestAnimationFrame(() => callback()),
  caf: (handle) => cancelAnimationFrame(handle),
};

/** `prefers-reduced-motion: reduce` (VP-9). False where `matchMedia` does not exist. */
export function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * A frame loop that runs `tick(now, dtMs)` once per animation frame while it returns true, then stops itself.
 * `start()` is idempotent; the first tick after a start gets the real time since `start()`.
 */
export function createFrameLoop(clock: Clock, tick: (now: number, dtMs: number) => boolean) {
  let handle: number | null = null;
  let last = 0;
  const run = (): void => {
    handle = null;
    const now = clock.now();
    const dt = now - last;
    last = now;
    if (tick(now, dt)) handle = clock.raf(run);
  };
  return {
    start(): void {
      if (handle !== null) return;
      last = clock.now();
      handle = clock.raf(run);
    },
    stop(): void {
      if (handle !== null) clock.caf(handle);
      handle = null;
    },
    running: (): boolean => handle !== null,
  };
}
