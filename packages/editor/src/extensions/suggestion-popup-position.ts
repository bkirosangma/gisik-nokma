/**
 * ONE positioning helper shared by every suggestion popup this package draws
 * (`mention-popup.ts`, `wiki-link-popup.ts`, `ticket-ref-popup.ts`) — bug fix,
 * case 9.314–9.316, 2026-09-24 (owner report 2026-09-23: "the inline :note
 * menu ... floats way above ... it looks like it is fixed at that absolute
 * position").
 *
 * ## The bug, and why `position: fixed` is the whole fix
 *
 * Every popup was `position: absolute` on `document.body` with `left`/`top`
 * set straight from `clientRect()` — a viewport-relative `DOMRect` (the same
 * shape `getBoundingClientRect()` returns). `position: absolute` on `<body>`
 * places an element relative to the DOCUMENT, not the viewport, so those
 * viewport coordinates were being read as document coordinates: on any
 * scrolled ancestor the popup landed `scrollY` pixels above the caret, and
 * once placed it never moved again on scroll, since nothing repainted it.
 * `position: fixed` positions relative to the viewport, which is exactly
 * what `clientRect()` already measures — no `scrollY` arithmetic belongs in
 * this file at all; adding it would only reintroduce the mismatch the other
 * way.
 *
 * ## Split: a pure placement function, and a thin DOM binder
 *
 * `computeSuggestionPopupPlacement` takes the caret rect, the popup's own
 * measured size and the viewport size, and returns where to put it — no DOM
 * reads, no DOM writes, so jsdom (which lays out nothing) can still exercise
 * every branch. `bindSuggestionPopupPosition` is the only DOM-touching half:
 * it sets `position: fixed` once, measures the container and calls the pure
 * function on every `reposition()`, and tracks scroll/resize so an already-
 * open popup follows a sheet that scrolls under it.
 */

export type CaretRect = { top: number; bottom: number; left: number };
export type PopupSize = { width: number; height: number };
export type Viewport = { width: number; height: number };
export type PopupPlacement = { top: number; left: number; placement: 'below' | 'above' };

/** The gap between the caret and the popup — `@tiptap/suggestion`'s own default `offset.mainAxis`, matched rather than invented. */
const POPUP_GAP = 4;

/**
 * Below the caret by default. Flips above when there is not enough room
 * below — never when there merely IS room above, so a popup that fits either
 * way stays below (the common case, and the one a flip-on-any-headroom rule
 * would needlessly destabilise while scrolling). Both axes are then clamped
 * inside the viewport, which is the floor for a caret near an edge with no
 * good placement at all.
 */
export function computeSuggestionPopupPlacement(
  caret: CaretRect,
  popup: PopupSize,
  viewport: Viewport,
): PopupPlacement {
  const roomBelow = viewport.height - caret.bottom;
  const fitsBelow = roomBelow >= popup.height + POPUP_GAP;
  const placement: 'below' | 'above' = fitsBelow ? 'below' : 'above';
  const rawTop = fitsBelow ? caret.bottom + POPUP_GAP : caret.top - popup.height - POPUP_GAP;
  const top = Math.max(0, Math.min(rawTop, viewport.height - popup.height));
  const left = Math.max(0, Math.min(caret.left, viewport.width - popup.width));
  return { top, left, placement };
}

export type SuggestionPopupPositionBinding = {
  /**
   * Re-reads the caret and re-measures the container, then repositions it.
   * `clientRect`, when passed, REPLACES the getter used by a later scroll or
   * resize event — `onUpdate` calls this with the suggestion's latest one;
   * a scroll/resize handler calls it with no argument, reusing whichever
   * getter was passed last.
   */
  reposition(clientRect?: (() => DOMRect | null) | null): void;
  /** Removes the scroll/resize listeners. Positioning itself needs no other teardown — the container is removed by the caller. */
  unbind(): void;
};

/**
 * Binds ONE popup container to `position: fixed`, kept aligned to its caret
 * on scroll and resize.
 *
 * The scroll listener is bound on `window` in the CAPTURE phase.
 * `scroll` does not bubble, but the capture phase still visits every
 * ancestor on the way down to whichever element actually scrolled — which is
 * what lets this file track a sheet's own scroll container without ever
 * naming it. Resize needs no capture: there is one `window` to resize.
 */
export function bindSuggestionPopupPosition(container: HTMLElement): SuggestionPopupPositionBinding {
  let getRect: (() => DOMRect | null) | null | undefined = null;
  container.style.position = 'fixed';

  function reposition(clientRect?: (() => DOMRect | null) | null): void {
    if (clientRect !== undefined) getRect = clientRect;
    const rect = getRect?.();
    if (!rect) return; // jsdom / detached: leave it unpositioned but present
    const placement = computeSuggestionPopupPlacement(
      { top: rect.top, bottom: rect.bottom, left: rect.left },
      { width: container.offsetWidth, height: container.offsetHeight },
      { width: window.innerWidth, height: window.innerHeight },
    );
    container.style.top = `${placement.top}px`;
    container.style.left = `${placement.left}px`;
    container.dataset['placement'] = placement.placement;
  }

  const onScrollOrResize = (): void => reposition();
  window.addEventListener('scroll', onScrollOrResize, true);
  window.addEventListener('resize', onScrollOrResize);

  return {
    reposition,
    unbind() {
      window.removeEventListener('scroll', onScrollOrResize, true);
      window.removeEventListener('resize', onScrollOrResize);
    },
  };
}
