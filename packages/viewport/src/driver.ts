/**
 * The one interface both adapters implement (spec VP-0), so the range planner, the cache and the packer never know
 * which one is under them. Units are the surface's: for the time views `offset` is a DAY (fractional) and `scale` is
 * px per day; the Workflow graph's camera uses graph px and a unitless zoom.
 */
export type Frame = {
  /** `performance.now()` of the frame, ms. */
  now: number;
  offset: number;
  scale: number;
  /** Smoothed velocity along the axis, in `offset` units per second (days per second on a time view). */
  velocity: number;
  /** True while something is still moving (a glide, momentum, a spring-back, a native scroll). */
  moving: boolean;
};

export type AnimateTarget = { offset?: number; scale?: number };
export type AnimateOptions = {
  /** Px from the viewport's leading edge to hold still while the scale changes. Default: the viewport centre. */
  anchorPx?: number;
  /** A glide never takes longer than this many ms whatever the distance (VP-5: 450). */
  maxMs?: number;
  /** Land at once (the caller read `prefers-reduced-motion`, VP-9). */
  instant?: boolean;
};

export interface ViewportDriver {
  /** The leading edge of the viewport on the axis (a day, fractional, on a time view). */
  offset(): number;
  /** Px per axis unit (px per day on a time view). */
  scale(): number;
  /** Glide to a target on the critically damped spring. Replaces any glide in progress. */
  animateTo(target: AnimateTarget, options?: AnimateOptions): void;
  /** Called once per frame while something moves, and once more when it settles. Returns the unsubscribe. */
  onFrame(callback: (frame: Frame) => void): () => void;
  /** The axis range in view now, inclusive (days on a time view). */
  visibleRange(): { start: number; end: number };
}

/** What a range source answers (the fake in the browser harness, the real routes in Part 4). */
export interface RangeSource<I extends { id: string }, D extends { id: string }> {
  fetchIndex(signal: AbortSignal): Promise<readonly I[]>;
  fetchChunk(chunk: number, signal: AbortSignal): Promise<readonly D[]>;
}
