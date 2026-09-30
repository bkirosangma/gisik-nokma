/**
 * Optimistic board moves (owner, 2026-10-01) — the motion that keeps a dragged card in reach: edge
 * auto-scroll while the drag is live, the "is it off-screen" test that decides whether a settled card
 * scrolls itself into view, and the constants the spring-loaded columns share. No React in here: the
 * scroller owns document listeners and a `requestAnimationFrame` loop, and the board starts and stops it.
 */

/** How close to an edge (px) the pointer must be before that edge scrolls. */
export const EDGE_ZONE_PX = 64;

/** The fastest a frame may scroll (px per frame): reached at the edge itself and beyond it. */
export const EDGE_MAX_SPEED_PX = 28;

/** How long a drag must rest on a collapsed column before it opens (ms). */
export const SPRING_DELAY_MS = 600;

/** Longest a flight may wait for its card to mount before it is considered stale (ms). */
export const FLIGHT_MAX_AGE_MS = 3000;

/**
 * Scroll speed for a pointer `distance` px from an edge: nothing at the zone's rim, growing linearly to the
 * cap at the edge — and capped there for a pointer dragged past it (negative distance).
 */
export function edgeSpeed(distance: number, zone: number = EDGE_ZONE_PX, max: number = EDGE_MAX_SPEED_PX): number {
  if (distance >= zone) return 0;
  const proximity = Math.min(1, (zone - distance) / zone);
  return max * proximity;
}

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;
}

type Box = { left: number; top: number; right: number; bottom: number };

/**
 * Is a card's box outside what the person can see — the window, and (when it sits in one) the rail's own
 * visible box? Partly outside counts as outside: a half-visible landing slot is one the person should be
 * taken to.
 */
export function isOffscreen(rect: Box, viewport: { width: number; height: number }, rail?: Box): boolean {
  const outside = (box: Box): boolean =>
    rect.top < box.top || rect.bottom > box.bottom || rect.left < box.left || rect.right > box.right;
  if (outside({ left: 0, top: 0, right: viewport.width, bottom: viewport.height })) return true;
  return rail !== undefined && outside(rail);
}

type Pointer = { x: number; y: number; rail: Element | null };

/**
 * The edge auto-scroller. `begin()` when a card drag starts, `end()` when it is over (or the board
 * unmounts). While begun it listens on `document` — the drag can be anywhere on the page — and runs a
 * `requestAnimationFrame` loop ONLY while the latest `dragover` has the pointer in an edge zone:
 *
 * - within `EDGE_ZONE_PX` of the window's top/bottom the PAGE scrolls vertically;
 * - within it of the left/right edge of the `.gn-board__rail` under the pointer, that RAIL scrolls sideways.
 *
 * `drop`, `dragend` and the pointer leaving the window (`dragleave` with no `relatedTarget`) stop it. The
 * source card may be gone from the DOM by the time `dragend` fires (an optimistic drop unmounts it), and a
 * `dragend` on a detached node reaches nobody — which is why `drop` stops it too.
 */
export function createEdgeScroller(): { begin: () => void; end: () => void } {
  let pointer: Pointer | null = null;
  let frame: number | null = null;
  let active = false;

  const velocity = (): { x: number; y: number; rail: Element | null } => {
    if (pointer === null) return { x: 0, y: 0, rail: null };
    let y = 0;
    const fromTop = pointer.y;
    const fromBottom = window.innerHeight - pointer.y;
    if (fromTop < EDGE_ZONE_PX) y = -edgeSpeed(fromTop);
    else if (fromBottom < EDGE_ZONE_PX) y = edgeSpeed(fromBottom);
    let x = 0;
    if (pointer.rail !== null) {
      const box = pointer.rail.getBoundingClientRect();
      const fromLeft = pointer.x - box.left;
      const fromRight = box.right - pointer.x;
      if (fromLeft < EDGE_ZONE_PX) x = -edgeSpeed(fromLeft);
      else if (fromRight < EDGE_ZONE_PX) x = edgeSpeed(fromRight);
    }
    return { x, y, rail: pointer.rail };
  };

  const stopLoop = (): void => {
    if (frame !== null) window.cancelAnimationFrame(frame);
    frame = null;
  };

  const tick = (): void => {
    frame = null;
    const { x, y, rail } = velocity();
    if (x === 0 && y === 0) return;
    if (y !== 0) window.scrollBy(0, y);
    if (x !== 0 && rail !== null) rail.scrollLeft += x;
    frame = window.requestAnimationFrame(tick);
  };

  const onDragOver = (event: Event): void => {
    const mouse = event as MouseEvent;
    const target = event.target;
    pointer = {
      x: mouse.clientX,
      y: mouse.clientY,
      rail: target instanceof Element ? target.closest('.gn-board__rail') : null,
    };
    const { x, y } = velocity();
    if (x === 0 && y === 0) stopLoop();
    else if (frame === null) frame = window.requestAnimationFrame(tick);
  };

  const onLeave = (event: Event): void => {
    // Only the pointer leaving the WINDOW ends the zone; `dragleave` between elements carries a relatedTarget.
    if ((event as MouseEvent).relatedTarget === null) stopLoop();
  };

  const end = (): void => {
    if (!active) return;
    active = false;
    stopLoop();
    pointer = null;
    document.removeEventListener('dragover', onDragOver);
    document.removeEventListener('dragleave', onLeave);
    document.removeEventListener('drop', end);
    document.removeEventListener('dragend', end);
  };

  const begin = (): void => {
    if (active) return;
    active = true;
    document.addEventListener('dragover', onDragOver);
    document.addEventListener('dragleave', onLeave);
    document.addEventListener('drop', end);
    document.addEventListener('dragend', end);
  };

  return { begin, end };
}
