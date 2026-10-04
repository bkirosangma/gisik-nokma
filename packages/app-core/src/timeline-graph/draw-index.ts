import type { Bounds, Draw, View } from './draw-types.js';

/** A uniform grid on the x axis. Each primitive is inserted in EVERY column its bounds cross, so a long bar or a loop arrow is found from any of them. */
export class DrawIndex {
  private readonly columns = new Map<number, Draw[]>();
  constructor(draws: readonly Draw[], private readonly bucketPx = 512) {
    for (const d of draws) {
      const first = Math.floor(d.b.x0 / bucketPx);
      const last = Math.floor(d.b.x1 / bucketPx);
      for (let c = first; c <= last; c++) {
        const list = this.columns.get(c);
        if (list === undefined) this.columns.set(c, [d]);
        else list.push(d);
      }
    }
  }
  /** Every primitive whose bounds touch `view` (a shared edge counts), once each, in paint order: `z`, then id. */
  query(view: View): Draw[] {
    const seen = new Set<string>();
    const out: Draw[] = [];
    for (let c = Math.floor(view.x0 / this.bucketPx); c <= Math.floor(view.x1 / this.bucketPx); c++) {
      for (const d of this.columns.get(c) ?? []) {
        if (seen.has(d.id) || !touches(d.b, view)) continue;
        seen.add(d.id);
        out.push(d);
      }
    }
    return out.sort((a, b) => a.z - b.z || (a.id < b.id ? -1 : 1));
  }
}
const touches = (a: Bounds, v: Bounds): boolean => a.x1 >= v.x0 && a.x0 <= v.x1 && a.y1 >= v.y0 && a.y0 <= v.y1;
