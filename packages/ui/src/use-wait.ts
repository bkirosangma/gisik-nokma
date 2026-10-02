import { useEffect, useRef, useState } from 'react';

/** Spec S2 / D4: nothing before this many ms of waiting… */
export const WAIT_BEFORE_MS = 150;
/** …and once a placeholder is shown it stays at least this long, so a 160 ms read never flashes it for 10 ms. */
export const WAIT_HOLD_MS = 350;

/**
 * Whether a placeholder should be ON SCREEN for a `pending` region. Pure timing: the caller
 * decides what to draw. `immediate` is for a region that has never had content (a route's first
 * paint), where an empty page for 150 ms is worse than a wireframe for 150 ms.
 */
export function useWait(pending: boolean, options: { immediate?: boolean } = {}): boolean {
  const immediate = options.immediate === true;
  const [shown, setShown] = useState(pending && immediate);
  const shownAt = useRef<number | null>(pending && immediate ? Date.now() : null);

  useEffect(() => {
    if (pending) {
      if (shownAt.current !== null) return undefined;
      if (immediate) {
        shownAt.current = Date.now();
        setShown(true);
        return undefined;
      }
      const timer = setTimeout(() => {
        shownAt.current = Date.now();
        setShown(true);
      }, WAIT_BEFORE_MS);
      return () => clearTimeout(timer);
    }
    if (shownAt.current === null) {
      setShown(false);
      return undefined;
    }
    const rest = Math.max(0, WAIT_HOLD_MS - (Date.now() - shownAt.current));
    const timer = setTimeout(() => {
      shownAt.current = null;
      setShown(false);
    }, rest);
    return () => clearTimeout(timer);
  }, [pending, immediate]);

  return shown;
}
