import { ScrollAdapter, type Clock, type ViewportDriver } from '@gisik-nokma/viewport';
import type { View } from './draw-types.js';

export type Windowed = {
  /** Part 1's scroll adapter: the time axis (x) of the scroller. */
  driver: ViewportDriver;
  /** The quantised window now. `onWindow` reports each change after this one. */
  current(): View;
  onWindow(cb: (v: View) => void): () => void;
  destroy(): void;
};

export type AttachOptions = {
  /** `onWindow` fires only when an edge of the window crosses a multiple of this many px, so React renders a few times a second, never per frame. */
  quantisePx: number;
  /** The day at scroll x = 0. */
  firstDay: number;
  /** The px per day the draw list was laid out at (the adapter's starting scale). */
  ppd: number;
  /** How many days the surface draws (the adapter caps its zoom with it). */
  extentDays: () => number;
  todayDay?: () => number;
  /** A test drives frames by hand; the browser clock otherwise. */
  clock?: Clock;
};

/**
 * Wire Part 1's scroll adapter to a scroller: `el` is the `overflow: auto` element and its FIRST child the painter's canvas
 * (the surface the adapter scrolls). The adapter owns the time axis; the window's y is the same scroller's native
 * `scrollTop`, whose scroll events wake the same frame loop. The window is the viewport rounded OUT to `quantisePx`, so it
 * always covers what is on screen. This is the only file in `timeline-graph/` that imports `@gisik-nokma/viewport`.
 */
export function attachDriver(el: HTMLElement, opts: AttachOptions): Windowed {
  const adapter = new ScrollAdapter({
    element: el,
    axis: 'x',
    firstDay: opts.firstDay,
    scale: opts.ppd,
    extentDays: opts.extentDays,
    ...(opts.todayDay === undefined ? {} : { todayDay: opts.todayDay }),
    ...(opts.clock === undefined ? {} : { clock: opts.clock }),
  });
  const q = (n: number): number => Math.floor(n / opts.quantisePx) * opts.quantisePx;
  const read = (): View => {
    const x = (adapter.offset() - opts.firstDay) * adapter.scale();
    const y = el.scrollTop;
    return { x0: q(x), x1: q(x + el.clientWidth) + opts.quantisePx, y0: q(y), y1: q(y + el.clientHeight) + opts.quantisePx };
  };
  const listeners = new Set<(v: View) => void>();
  let view = read();
  let last = keyOf(view);
  const stop = adapter.onFrame(() => {
    const next = read();
    const key = keyOf(next);
    if (key === last) return;
    last = key;
    view = next;
    for (const cb of [...listeners]) cb(next);
  });
  return {
    driver: adapter,
    current: () => view,
    onWindow: (cb) => {
      listeners.add(cb);
      return () => void listeners.delete(cb);
    },
    destroy: () => {
      stop();
      listeners.clear();
      adapter.destroy();
    },
  };
}

const keyOf = (v: View): string => `${v.x0}|${v.x1}|${v.y0}|${v.y1}`;
