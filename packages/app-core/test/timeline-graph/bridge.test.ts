// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import type { Clock } from '@gisik-nokma/viewport';
import { attachDriver } from '../../src/timeline-graph/bridge.js';
import type { View } from '../../src/timeline-graph/draw-types.js';

/** Frames by hand (the shape of Part 1's `packages/viewport/test/fake-clock.ts`). */
function fakeClock(frameMs = 16) {
  let t = 1_000;
  let next = 1;
  const queue = new Map<number, () => void>();
  const clock: Clock = { now: () => t, raf: (cb) => (queue.set(next, cb), next++), caf: (id) => void queue.delete(id) };
  return {
    clock,
    pending: () => queue.size,
    advance(ms: number) {
      const end = t + ms;
      while (t < end) {
        t = Math.min(end, t + frameMs);
        const due = [...queue.values()];
        queue.clear();
        for (const cb of due) cb();
      }
    },
  };
}

/** jsdom lays nothing out: the test says how big the scroller is. */
function scroller(): HTMLElement {
  const el = document.createElement('div');
  el.innerHTML = '<div class="gn-tlg-canvas"></div>';
  document.body.append(el);
  for (const [k, v] of Object.entries({ clientWidth: 1_000, clientHeight: 400, scrollWidth: 26_400, scrollHeight: 5_000 })) Object.defineProperty(el, k, { configurable: true, value: v });
  return el;
}
const scrollTo = (el: HTMLElement, fc: ReturnType<typeof fakeClock>, left: number, top: number): void => {
  el.scrollLeft = left;
  el.scrollTop = top;
  el.dispatchEvent(new Event('scroll'));
  fc.advance(32);
};

afterEach(() => void (document.body.innerHTML = ''));

describe('29.303 attachDriver: the window the painter mounts', () => {
  it('29.303 starts at the scroll position rounded OUT to the quantum; reports a change only when an edge crosses a quantum; y is the same scroller\'s; control: a move inside the quantum reports nothing', () => {
    const fc = fakeClock();
    const el = scroller();
    const w = attachDriver(el, { quantisePx: 256, firstDay: 20_000, ppd: 24, extentDays: () => 1_100, clock: fc.clock });
    expect(w.current()).toEqual({ x0: 0, x1: 1_024, y0: 0, y1: 512 }); // 1000 px wide -> [0, 768 + 256]; 400 tall -> [0, 256 + 256]
    const seen: View[] = [];
    const off = w.onWindow((v) => seen.push(v));
    scrollTo(el, fc, 100, 0); // the right edge 1100 crosses 1024
    expect(seen).toEqual([{ x0: 0, x1: 1_280, y0: 0, y1: 512 }]);
    scrollTo(el, fc, 120, 0); // control: 1120 stays inside [1024, 1280)
    expect(seen).toHaveLength(1);
    scrollTo(el, fc, 120, 300); // y: [300, 700] -> [256, 512 + 256]
    expect(seen[1]).toEqual({ x0: 0, x1: 1_280, y0: 256, y1: 768 });
    expect(w.current()).toEqual(seen[1]);
    expect(w.driver.offset()).toBe(20_000 + 120 / 24); // the adapter reads the same scroller as a day
    off();
    scrollTo(el, fc, 3_000, 300); // unsubscribed: nothing more is reported, but the window still follows
    expect(seen).toHaveLength(2);
    expect(w.current()).toEqual({ x0: 2_816, x1: 4_096, y0: 256, y1: 768 });
    w.destroy();
    el.scrollLeft = 6_000;
    el.dispatchEvent(new Event('scroll'));
    expect(fc.pending()).toBe(0); // destroyed: the adapter no longer listens, no frame is asked for
  });
});
