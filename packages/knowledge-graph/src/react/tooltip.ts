/** The edge sentence follows the pointer and stays inside the canvas (Review Focus 4). Port of `placeTip` (`knowledge-graph-sigma.html:877`). */
export function tooltipPosition(x: number, y: number, tip: { width: number; height: number }, canvasWidth: number): { left: number; top: number } {
  return { left: Math.max(8, Math.min(x + 14, canvasWidth - tip.width - 8)), top: Math.max(8, y - tip.height - 10) };
}
