export const GLIDE_MS = 320;
export const easeOutCubic = (k: number) => 1 - Math.pow(1 - k, 3);
type Pt = { x: number; y: number };
/**
 * `glide` (`knowledge-graph-sigma.html:890-895`): items tween from where they were; one with no `from` starts at its
 * target, so it does not fly in. An item that did not move keeps its target object, so the adapter can skip it.
 */
export function glideFrame(from: ReadonlyMap<string, Pt>, to: ReadonlyMap<string, Pt>, elapsedMs: number, reduce: boolean): { positions: Map<string, Pt>; done: boolean } {
  if (reduce || elapsedMs >= GLIDE_MS) return { positions: new Map(to), done: true };
  const e = easeOutCubic(Math.max(0, elapsedMs) / GLIDE_MS);
  const positions = new Map<string, Pt>();
  for (const [id, t] of to) {
    const f = from.get(id) ?? t;
    positions.set(id, f.x === t.x && f.y === t.y ? t : { x: f.x + (t.x - f.x) * e, y: f.y + (t.y - f.y) * e });
  }
  return { positions, done: false };
}
