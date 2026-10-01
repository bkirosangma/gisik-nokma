/**
 * WHICH ELEMENT SCROLLS, resolved rather than assumed.
 *
 * The knowledge-base source hands `ReadingTOC` and `ReadingProgress` a ref to
 * "the scroll container" and reads `scrollTop` / calls `scrollTo` on it. That
 * is true of its app shell (a pane that scrolls) and false of gisik's note
 * page, where `.gn-notes__editor` has a `min-height` and no `overflow`: the
 * WINDOW scrolls. Against that page the source's reading reads `scrollTop === 0`
 * forever and its `root.scrollTo(...)` is a silent no-op — and both would still
 * pass a jsdom test that stubs the numbers.
 *
 * So the ref names the READING SURFACE (the element whose text is being read)
 * and this module answers the two questions the ports ask of it, for either
 * kind of host.
 *
 * The answer can CHANGE while a page is open: the note page scrolls the window
 * at and below 60rem and its document column above it, so resizing across the
 * breakpoint (or rotating a tablet) moves the scroller. Both readers therefore
 * re-ask on every window `resize` and rebind only when the answer differs
 * (`sameScroller`). It is `findScroller`, not a `matchMedia` literal, because
 * this package is shared with the ticket sheet and the desktop app and the
 * 60rem is the web app's own breakpoint.
 */

export type Scroller = { kind: 'element'; element: HTMLElement } | { kind: 'window' };

const SCROLLING_OVERFLOW = /^(auto|scroll|overlay)$/;

/**
 * The nearest ancestor-or-self whose own `overflow-y` makes it a scroller, else
 * the window. Decided on the declared overflow, not on whether it overflows
 * RIGHT NOW: a scroller with short content is still the scroller, and its
 * progress is simply zero.
 */
export function findScroller(surface: HTMLElement): Scroller {
  for (let node: HTMLElement | null = surface; node !== null; node = node.parentElement) {
    if (node === document.body || node === document.documentElement) break;
    if (SCROLLING_OVERFLOW.test(getComputedStyle(node).overflowY)) {
      return { kind: 'element', element: node };
    }
  }
  return { kind: 'window' };
}

/** Whether two answers of `findScroller` name the same scroller. */
export function sameScroller(a: Scroller, b: Scroller): boolean {
  return a.kind === 'window' ? b.kind === 'window' : b.kind === 'element' && a.element === b.element;
}

/** The node whose `scroll` event fires for `scroller`. */
export function scrollEventTarget(scroller: Scroller): HTMLElement | Window {
  return scroller.kind === 'element' ? scroller.element : window;
}

/**
 * The fraction of `surface` that has been read, 0–1.
 *
 * - An element scroller: `scrollTop / (scrollHeight − clientHeight)`, the
 *   source's own formula.
 * - The window: how far the surface's top has travelled above the viewport's
 *   top, over the distance it can travel (`surface height − viewport height`).
 *   Anything above the surface (a title, a byline) is not part of the reading,
 *   so the bar starts when the surface reaches the top and ends when its
 *   bottom reaches the bottom.
 *
 * Nothing to scroll → 0 (a document that fits has not been "read through").
 */
export function readingProgress(surface: HTMLElement, scroller: Scroller): number {
  let travelled: number;
  let range: number;
  if (scroller.kind === 'element') {
    const el = scroller.element;
    travelled = el.scrollTop;
    range = el.scrollHeight - el.clientHeight;
  } else {
    const rect = surface.getBoundingClientRect();
    travelled = -rect.top;
    range = rect.height - window.innerHeight;
  }
  if (!(range > 0)) return 0;
  return Math.min(1, Math.max(0, travelled / range));
}
