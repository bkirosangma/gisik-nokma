export type WheelIntent = { kind: 'zoom'; factor: number } | { kind: 'pan'; dx: number; dy: number };
/** `onWheel` (`knowledge-graph-sigma.html:840-845`): ctrl (and a trackpad pinch, which arrives as ctrl+wheel) zooms; a notched wheel zooms; a pixel scroll pans. */
export function wheelIntent(e: { deltaMode: number; deltaX: number; deltaY: number; ctrlKey: boolean }): WheelIntent {
  const px = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
  const dx = e.deltaX * px, dy = e.deltaY * px;
  const mouseWheel = e.deltaMode !== 0 || (dx === 0 && Math.abs(dy) >= 40 && Number.isInteger(dy));
  if (e.ctrlKey) return { kind: 'zoom', factor: Math.exp(-dy * 0.012) };
  if (mouseWheel) return { kind: 'zoom', factor: Math.exp(-dy * 0.0022) };
  return { kind: 'pan', dx, dy };
}
