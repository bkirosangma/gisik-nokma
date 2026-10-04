import type { Clock } from '../src/index.js';

/** A clock the test drives by hand: `advance(ms)` runs animation frames of `frameMs`. */
export function fakeClock(frameMs = 16) {
  let t = 1000;
  let next = 1;
  const queue = new Map<number, () => void>();
  const clock: Clock = {
    now: () => t,
    raf: (cb) => {
      const id = next++;
      queue.set(id, cb);
      return id;
    },
    caf: (id) => void queue.delete(id),
  };
  return {
    clock,
    now: () => t,
    pending: () => queue.size,
    advance(ms: number) {
      const end = t + ms;
      while (t < end) {
        t = Math.min(end, t + frameMs);
        const due = [...queue];
        queue.clear();
        for (const [, cb] of due) cb();
      }
    },
  };
}

/** jsdom lays nothing out, so the test says how big the container is. */
export function sizeOf(el: HTMLElement, o: { clientWidth: number; scrollWidth: number; clientHeight?: number; scrollHeight?: number }) {
  for (const [k, v] of Object.entries(o)) Object.defineProperty(el, k, { configurable: true, value: v });
  el.getBoundingClientRect = () => ({ left: 0, top: 0, right: o.clientWidth, bottom: o.clientHeight ?? 400, width: o.clientWidth, height: o.clientHeight ?? 400, x: 0, y: 0, toJSON: () => ({}) });
}

/** jsdom has no PointerEvent: a MouseEvent carrying `pointerId` and `pointerType`. */
export function pointer(type: string, init: { x: number; y: number; id?: number; kind?: string; button?: number }): Event {
  const e = new MouseEvent(type, { clientX: init.x, clientY: init.y, button: init.button ?? 0, bubbles: true, cancelable: true });
  Object.assign(e, { pointerId: init.id ?? 1, pointerType: init.kind ?? 'mouse' });
  return e;
}

export function wheel(init: { x?: number; y?: number; dx?: number; dy: number; ctrl?: boolean; mode?: number }): WheelEvent {
  return new WheelEvent('wheel', { clientX: init.x ?? 0, clientY: init.y ?? 0, deltaX: init.dx ?? 0, deltaY: init.dy, deltaMode: init.mode ?? 0, ctrlKey: init.ctrl ?? false, bubbles: true, cancelable: true });
}
