import { describe, expect, it } from 'vitest';
import { DrawIndex } from '../../src/timeline-graph/draw-index.js';
import type { Draw } from '../../src/timeline-graph/draw-types.js';

const bar = (i: number, x0: number, w: number, row: number): Draw => ({
  kind: 'bar', id: `b${i}`, ticketId: `t${i}`, z: 1, b: { x0, x1: x0 + w, y0: row * 40, y1: row * 40 + 28 },
  style: 'planned', key: null, title: 't', long: w >= 150, mark: null, passRank: 0, pass: 1, pin: null, chip: null, draft: false, labelPx: 0, keyOutside: false, pinAt: null, ariaLabel: 't',
});
const many: Draw[] = Array.from({ length: 10_000 }, (_, i) => bar(i, (i * 37) % 26_400, 24 + (i % 7) * 24, i % 120));

describe('29.303 DrawIndex', () => {
  const index = new DrawIndex(many);
  it('29.303 returns exactly the touching primitives, once each; control: overscan 0 returns fewer', () => {
    const view = { x0: 5_000, x1: 6_500, y0: 400, y1: 1_300 };
    const ids = index.query(view).map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    const expected = many.filter((d) => d.b.x1 >= view.x0 && d.b.x0 <= view.x1 && d.b.y1 >= view.y0 && d.b.y0 <= view.y1).map((d) => d.id);
    expect([...ids].sort()).toEqual([...expected].sort());
    const wide = index.query({ x0: view.x0 - 1_500, x1: view.x1 + 1_500, y0: view.y0 - 900, y1: view.y1 + 900 });
    expect(wide.length).toBeGreaterThan(ids.length);
  });
  it('29.303 a bar spanning many buckets is found from any bucket it covers', () => {
    const long: Draw[] = [bar(1, 0, 5_000, 0), bar(2, 100, 24, 0)];
    const idx = new DrawIndex(long, 512);
    expect(idx.query({ x0: 4_000, x1: 4_100, y0: 0, y1: 28 }).map((d) => d.id)).toEqual(['b1']);
  });
  it('29.303 "touch" includes a shared edge on each side and on each axis; control: one px apart is out', () => {
    // b1 ends where the view starts, b2 starts where it ends, b3 ends on its top edge, b4 starts on its bottom edge
    const edges: Draw[] = [bar(1, 900, 100, 5), bar(2, 2_000, 50, 5), { ...bar(3, 1_200, 50, 0), b: { x0: 1_200, x1: 1_250, y0: 172, y1: 200 } }, { ...bar(4, 1_300, 50, 0), b: { x0: 1_300, x1: 1_350, y0: 400, y1: 428 } }];
    const view = { x0: 1_000, x1: 2_000, y0: 200, y1: 400 };
    expect(new DrawIndex(edges).query(view).map((d) => d.id)).toEqual(['b1', 'b2', 'b3', 'b4']);
    const apart = { x0: 1_001, x1: 1_999, y0: 201, y1: 399 }; // control: each edge is now one px away
    expect(new DrawIndex(edges).query(apart).map((d) => d.id)).toEqual([]);
  });
});
