import { useCallback, useRef, type MutableRefObject, type RefCallback } from 'react';

/** Within this many pixels of an end counts as AT that end (sub-pixel scroll positions never land exactly). */
const EDGE_SLACK_PX = 1;

type Axis = 'x' | 'y';

/**
 * Edge cues for a scroller (UX fixes Task 6, audit SYS-14/BRD-07/ENT-13/SET-25/WF-10/PV-04): sets
 * `data-at-start` and `data-at-end` ("true" / "false") on the element so `.gn-scroll-fade` can mask the edge that has
 * more content past it. A scroller whose content fits has both "true", so nothing is faded.
 *
 * Returns a callback ref, so it works on an element that mounts late (a phone-only picker, a panel behind a
 * condition). `ownRef` is the caller's own ref to the same element — the board rail already holds one for its
 * scroll-into-view effect — assigned here so the caller keeps it. Re-measures on scroll, on a resize of the element or
 * of its children (content arriving), and on a child being added or removed.
 */
export function useScrollEdges<T extends HTMLElement>(axis: Axis = 'x', ownRef?: MutableRefObject<T | null>): RefCallback<T> {
  const cleanup = useRef<(() => void) | null>(null);
  return useCallback(
    (element: T | null) => {
      cleanup.current?.();
      cleanup.current = null;
      if (ownRef !== undefined) ownRef.current = element;
      if (element === null) return;

      const measure = (): void => {
        const position = axis === 'x' ? element.scrollLeft : element.scrollTop;
        const size = axis === 'x' ? element.clientWidth : element.clientHeight;
        const extent = axis === 'x' ? element.scrollWidth : element.scrollHeight;
        const overflowing = extent > size + EDGE_SLACK_PX;
        element.setAttribute('data-at-start', !overflowing || position <= EDGE_SLACK_PX ? 'true' : 'false');
        element.setAttribute('data-at-end', !overflowing || position + size >= extent - EDGE_SLACK_PX ? 'true' : 'false');
      };

      measure();
      element.addEventListener('scroll', measure, { passive: true });
      window.addEventListener('resize', measure);
      let resizes: ResizeObserver | null = null;
      let mutations: MutationObserver | null = null;
      if (typeof ResizeObserver !== 'undefined') {
        resizes = new ResizeObserver(measure);
        resizes.observe(element);
        for (const child of Array.from(element.children)) resizes.observe(child);
      }
      if (typeof MutationObserver !== 'undefined') {
        mutations = new MutationObserver(() => {
          if (resizes !== null) for (const child of Array.from(element.children)) resizes.observe(child);
          measure();
        });
        mutations.observe(element, { childList: true });
      }
      cleanup.current = () => {
        element.removeEventListener('scroll', measure);
        window.removeEventListener('resize', measure);
        resizes?.disconnect();
        mutations?.disconnect();
      };
    },
    [axis, ownRef],
  );
}
