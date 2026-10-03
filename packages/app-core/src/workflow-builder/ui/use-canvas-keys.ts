import { useEffect, useRef } from 'react';

type Point = { x: number; y: number };
const ARROWS: Record<string, Point> = {
  ArrowLeft: { x: -1, y: 0 },
  ArrowRight: { x: 1, y: 0 },
  ArrowUp: { x: 0, y: -1 },
  ArrowDown: { x: 0, y: 1 },
};

/**
 * The keys the canvas pipeline needs to know about when React Flow reports a change (G-9 T3), tracked on the window in the capture phase so they
 * are set before React Flow's own handlers run: Alt (skips guides and grid), the arrow key being acted on (React Flow moves a selected node by 5 px and
 * mutates its own store first, so the direction comes from the key, never from the change's position), and Enter/Space (React Flow's keyboard selection).
 */
export function useCanvasKeys() {
  const altDown = useRef(false);
  const arrow = useRef<(Point & { alt: boolean }) | null>(null);
  const selectKey = useRef(false);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const down = event.type === 'keydown';
      if (event.key === 'Alt') altDown.current = down;
      if (event.key === 'Enter' || event.key === ' ') selectKey.current = down;
      const step = ARROWS[event.key];
      if (step) arrow.current = down ? { ...step, alt: event.altKey } : null;
    };
    const onBlur = () => {
      altDown.current = false;
      selectKey.current = false;
      arrow.current = null;
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('keyup', onKey, true);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('keyup', onKey, true);
      window.removeEventListener('blur', onBlur);
    };
  }, []);
  return { altDown, arrow, selectKey };
}
