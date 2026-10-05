import { useEffect, useRef } from 'react';

/** One rung of the ladder: whether it is up, and how to take it down. */
export type EscapeLayer = { open: boolean; close: () => void };

/**
 * The full-screen editor's one Escape owner (G-9 T5, spec §4.1; planner ruling 2026-10-04 Q1). `layers` is innermost first
 * (`[panel, fullScreen]`): an Escape closes the first open one and marks the key handled with `preventDefault()`. Everything
 * nearer the focus handles its own Escape first and marks it the same way, so this listener ignores a prevented key:
 * the drag's capture listener (`useDragEscape`) stops it outright, `AddRuleMenu` and react-aria's `Popover` consume it,
 * `Dialog` closes on a document capture listener and prevents it, and the state-mapping dialog (an inline `role="dialog"`, NOT
 * the shared `Dialog`: ruling Q1's premise that it was is corrected, FIX 1) is cancelled by `PublishControls`' own key handler,
 * which prevents it. The guard's contract: any overlay that handles an Escape marks it with `preventDefault()`, and the ladder
 * then leaves it alone. One window listener in the BUBBLE phase, registered once (the layers are read from a ref), and it never
 * calls `stopPropagation()`: a listener added after it still hears the key.
 */
export function useEscapeLadder(layers: EscapeLayer[]): void {
  const latest = useRef(layers);
  latest.current = layers;
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      const layer = latest.current.find((candidate) => candidate.open);
      if (layer === undefined) return;
      event.preventDefault();
      layer.close();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
