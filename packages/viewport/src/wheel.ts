/**
 * Wheel input. `wheelIntent` is the classifier in the Knowledge Graph view plan
 * (`docs/superpowers/plans/2026-10-03-knowledge-graph-view.md` on `docs/kg-plans-cd`, its `src/engine/wheel.ts`, a port
 * of the mockup's `onWheel`), with the same branches and constants: Ctrl + wheel and a trackpad pinch (which arrives as
 * Ctrl + wheel) zoom, a notched mouse wheel zooms, a pixel scroll pans. That engine is not on this base, so this
 * package owns the classifier until it ships (spec open question 5). The CameraAdapter (a free 2D camera) uses it.
 *
 * `wheelZoomFactor` is what the time surfaces (ScrollAdapter) use: they let the platform scroll natively for every
 * wheel (a horizontal swipe, Shift + wheel and the vertical wheel are all native scrolling, VP-2) and take over ONLY
 * Ctrl + wheel.
 */
export type WheelIntent = { kind: 'zoom'; factor: number } | { kind: 'pan'; dx: number; dy: number };
export type WheelLike = { deltaMode: number; deltaX: number; deltaY: number; ctrlKey: boolean };

export function wheelIntent(e: WheelLike): WheelIntent {
  const px = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
  const dx = e.deltaX * px;
  const dy = e.deltaY * px;
  const mouseWheel = e.deltaMode !== 0 || (dx === 0 && Math.abs(dy) >= 40 && Number.isInteger(dy));
  if (e.ctrlKey) return { kind: 'zoom', factor: Math.exp(-dy * 0.012) };
  if (mouseWheel) return { kind: 'zoom', factor: Math.exp(-dy * 0.0022) };
  return { kind: 'pan', dx, dy };
}

/** The zoom factor of a Ctrl + wheel (or pinch) event, or null when the event is the platform's to scroll. */
export function wheelZoomFactor(e: WheelLike): number | null {
  if (!e.ctrlKey) return null;
  const px = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
  return Math.exp(-e.deltaY * px * 0.012);
}
