import { useCallback, useEffect, useState } from 'react';
import type { HomeNumberKey, HomeResponse } from '@gisik-nokma/domain';

/**
 * Which number is lit (spec E §2.3). Clicking the lit one clears it; another switches; Escape clears — unless
 * something nearer the focus already handled that Escape (`defaultPrevented`: an open menu, the graph's own
 * `onEscape`, T4). A lit number whose tile turns disabled clears (Review Focus 5; planner ruling 2026-10-04 Q1): a
 * reload that drops it to 0, a Members count withdrawn to `null`, or the whole answer withdrawn (`home` null after a
 * refused read, `use-live-query.ts`'s stale-cache withdrawal). A count that changes but stays above 0 stays lit.
 */
export function useHomeHighlight(home: HomeResponse | null) {
  const [pressed, setPressed] = useState<HomeNumberKey | null>(null);
  const toggle = useCallback((key: HomeNumberKey) => setPressed((current) => (current === key ? null : key)), []);
  const clear = useCallback(() => setPressed(null), []);
  useEffect(() => {
    if (pressed !== null && (home === null || home.counts[pressed] === 0 || home.counts[pressed] === null)) setPressed(null);
  }, [home, pressed]);
  useEffect(() => {
    if (pressed === null) return undefined;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      setPressed(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pressed]);
  return { pressed, toggle, clear };
}
