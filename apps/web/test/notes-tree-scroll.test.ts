import { describe, expect, it, vi } from 'vitest';

/**
 * 18.489 — `carryTreeScroll`, the unit under 18.488 (`src/notes/tree-scroll.ts`).
 *
 * 18.488 drives the real page, where the rows always arrive AFTER the mount and the clamp is only
 * modelled through a re-render; this drives the function on bare elements, so it can present the
 * two shapes the page test cannot: a tree ALREADY populated when it attaches, and the `scroll`
 * event the browser fires when its own clamp moves the offset. A `scrollTop` that clamps to the rows
 * present (60px each, a 300px window) stands in for the browser, as in 18.488.
 * CONTROL (same `it`): a module that has saved nothing writes NOTHING — asserted on the setter (a spy), since a write of 0 is invisible
 * to a value read; so a `restoring = true` start is red, not equivalent.
 * MUTATION TARGETS: (a) drop the `restore()` call that follows `observer.observe` (only a populated
 * tree sees it); (b) record while restoring; (c) drop the takeover listeners; (d) drop the give-up
 * timer; (e) stop recording on `scroll`; (f) drop `observer.disconnect()` from the detach; (g) drop the `scroll`
 * `removeEventListener` from the detach; (h) start in the restoring state with nothing saved.
 */
/** Every value written to an element's `scrollTop`, in order — jsdom's own setter is unobservable, so a write of 0 is otherwise invisible. */
const writes = new WeakMap<Element, number[]>();
const writesOf = (element: Element): number[] => writes.get(element) ?? [];

function tree(rows: number): HTMLElement {
  const element = document.createElement('div');
  let offset = 0;
  writes.set(element, []);
  Object.defineProperty(element, 'scrollTop', {
    get: () => offset,
    set: (value: number) => {
      writes.get(element)?.push(value);
      offset = Math.min(value, Math.max(0, element.children.length * 60 - 300));
    },
  });
  addRows(element, rows);
  return element;
}

function addRows(element: HTMLElement, count: number): void {
  for (let i = 0; i < count; i++) element.appendChild(document.createElement('a'));
}

/** A MutationObserver callback is a microtask; fake timers do not hold it up. */
async function flush(): Promise<void> {
  for (let i = 0; i < 4; i++) await Promise.resolve();
}

async function freshModule() {
  vi.resetModules();
  return import('../src/notes/tree-scroll.js');
}

describe('18.489 carryTreeScroll', () => {
  it('18.489 restores a populated tree at once, waits out a short one, ignores the clamp’s own scroll event, yields to the reader and gives up; CONTROL: nothing saved, nothing written', async () => {
    const { carryTreeScroll } = await freshModule();

    // CONTROL: nothing has been recorded, so a populated tree is left at the top.
    const untouched = tree(30);
    const detachControl = carryTreeScroll(untouched);
    expect(untouched.scrollTop).toBe(0);
    expect(writesOf(untouched)).toEqual([]); // not even a write of 0: a first mount does not enter the restoring state
    untouched.scrollTop = 800;
    untouched.dispatchEvent(new Event('scroll')); // the reader's scroll — recorded
    detachControl();

    // (a) a tree that is ALREADY populated is restored by the attach itself — no mutation follows it.
    const populated = tree(30);
    const detachPopulated = carryTreeScroll(populated);
    expect(populated.scrollTop).toBe(800);
    detachPopulated();

    // (b) a short tree clamps to 0; the clamp's scroll event is not the reader's and must not overwrite the saved offset.
    const loading = tree(0);
    const detachLoading = carryTreeScroll(loading);
    expect(loading.scrollTop).toBe(0);
    loading.dispatchEvent(new Event('scroll'));
    addRows(loading, 30);
    await flush();
    expect(loading.scrollTop).toBe(800);
    detachLoading();

    // (c) the reader takes over before the rows arrive: the restore is cancelled.
    const taken = tree(0);
    const detachTaken = carryTreeScroll(taken);
    taken.dispatchEvent(new Event('wheel'));
    addRows(taken, 30);
    await flush();
    expect(taken.scrollTop).toBe(0);
    detachTaken();

    // (d) the rows never come back in time: the restore gives up after five seconds.
    vi.useFakeTimers();
    try {
      const late = tree(0);
      const detachLate = carryTreeScroll(late);
      vi.advanceTimersByTime(5000);
      addRows(late, 30);
      await flush();
      expect(late.scrollTop).toBe(0);
      detachLate();
    } finally {
      vi.useRealTimers();
    }

    // (e) what the reader scrolls to is what the next mount restores.
    const reader = tree(30);
    const detachReader = carryTreeScroll(reader);
    reader.scrollTop = 200;
    reader.dispatchEvent(new Event('scroll'));
    detachReader();
    const next = tree(30);
    const detachNext = carryTreeScroll(next);
    expect(next.scrollTop).toBe(200);
    detachNext();

    // (f) detach stops the observer: a row added to a still-short tree after detach restores nothing.
    const gone = tree(0);
    const detachGone = carryTreeScroll(gone);
    addRows(gone, 1);
    await flush();
    const before = writesOf(gone).length;
    expect(before).toBeGreaterThan(1); // CONTROL: the same mutation BEFORE detach does write (attach + the row)
    detachGone();
    addRows(gone, 1);
    await flush();
    expect(writesOf(gone)).toHaveLength(before);

    // (g) detach stops recording: a scroll event after detach does not move the saved offset.
    const leaver = tree(30);
    const detachLeaver = carryTreeScroll(leaver);
    leaver.scrollTop = 500;
    leaver.dispatchEvent(new Event('scroll')); // CONTROL: before detach it IS recorded
    detachLeaver();
    leaver.scrollTop = 900;
    leaver.dispatchEvent(new Event('scroll'));
    const successor = tree(30);
    const detachSuccessor = carryTreeScroll(successor);
    expect(successor.scrollTop).toBe(500);
    detachSuccessor();
  });
});
