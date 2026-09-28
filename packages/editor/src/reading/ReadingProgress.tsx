import { useEffect, useState } from 'react';
import { findScroller, readingProgress, scrollEventTarget } from './scroller.js';

/**
 * The thin reading-progress bar, ported from the knowledge-base app's
 * `ReadingProgress.tsx`. Structure in `editor.css`, colour in the web skin.
 *
 * ## WHAT CHANGED FROM THE SOURCE
 *
 * - **The ref names the reading surface, not the scroller** — see
 *   `scroller.ts`: gisik's page scrolls the window, so `scrollTop` on the
 *   surface would pin the bar at 0.
 * - **`transform: scaleX`, not an animated `width`** — no layout per frame.
 *   The transition is dropped under `prefers-reduced-motion` (the skin's rule).
 * - **`requestAnimationFrame`-coalesced** scroll and resize updates, and state
 *   only changes in half-percent steps, so a long scroll is not a render per
 *   pixel.
 * - **The source mounts it "in read mode only"; gisik has no read/edit
 *   toggle**, so the note page mounts it for every viewer and the ticket
 *   sheet (not a reading surface) does not.
 */
export type ReadingProgressProps = {
  /** The element whose text is being read (`ReadingTOC`'s ref, the same one). */
  scrollContainerRef: React.RefObject<HTMLElement | null>;
  /** When this changes the bar drops to 0 (the note id): a new note never starts halfway. */
  resetKey?: string | null;
};

/** State moves in steps this fine — the bar is 3px tall; finer is invisible. */
const STEPS = 200;

export function ReadingProgress({ scrollContainerRef, resetKey }: ReadingProgressProps): React.JSX.Element {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    setProgress(0);
    const surface = scrollContainerRef.current;
    if (surface === null) return;
    const scroller = findScroller(surface);
    const target = scrollEventTarget(scroller);
    let frame = 0;
    const update = (): void => {
      frame = 0;
      setProgress(Math.round(readingProgress(surface, scroller) * STEPS) / STEPS);
    };
    const schedule = (): void => {
      if (frame === 0) frame = requestAnimationFrame(update);
    };
    update();
    target.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    // The surface grows as the note is written or images load; the window's
    // `resize` does not see that.
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
    observer?.observe(surface);
    return () => {
      if (frame !== 0) cancelAnimationFrame(frame);
      target.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      observer?.disconnect();
    };
  }, [scrollContainerRef, resetKey]);

  return (
    <div
      className="reading-progress"
      role="progressbar"
      aria-label="Reading progress"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(progress * 100)}
    >
      <div className="reading-progress__bar" style={{ transform: `scaleX(${progress})` }} />
    </div>
  );
}
