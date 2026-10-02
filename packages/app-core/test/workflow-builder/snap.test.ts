import { describe, expect, it } from 'vitest';
import { snapPosition, GRID } from '../../src/workflow-builder/snap.js';

const size = { width: 100, height: 60 };
const other = { x: 400, y: 160, width: 100, height: 60 };
const base = { zoom: 1, alt: false, lastValid: { x: 0, y: 0 } };

describe('snapping (spec §3.2)', () => {
  it('25.511 off-guide positions snap to the 16 px grid', () => {
    expect(snapPosition({ x: 37, y: 9 }, size, [other], base).position).toEqual({ x: 32, y: 16 });
  });

  it('25.512 a centre within 6 SCREEN px of another centre snaps to it and reports a guide; at zoom 0.25 the flow threshold is 24', () => {
    const r = snapPosition({ x: 37, y: 163 }, size, [other], base);
    expect(r.position.y).toBe(160);
    expect(r.guides).toContainEqual({ axis: 'y', at: 190 });
    const z = snapPosition({ x: 37, y: 180 }, size, [other], { ...base, zoom: 0.25 });
    expect(z.position.y).toBe(160);
    // control: at zoom 1, 20 px is beyond the guide, so the grid takes it
    expect(snapPosition({ x: 37, y: 180 }, size, [other], base).position.y).toBe(176);
    // the 6 px boundary is inclusive: d = 6 (centre 184 vs 190) reports the guide, d = 7 does not
    expect(snapPosition({ x: 37, y: 154 }, size, [other], base).guides).toContainEqual({ axis: 'y', at: 190 });
    expect(snapPosition({ x: 37, y: 153 }, size, [other], base).guides.find((g) => g.axis === 'y')).toBeUndefined();
  });

  it('25.513 a guide (edge-to-edge pairs included) beats the grid on its axis only: the guided axis lands off-grid, the other axis still snaps to the grid', () => {
    // centre of `odd` is y 195; a dragged centre at 197 snaps to y 165, which is not a multiple of 16 (the grid alone would give 160)
    const odd = { x: 400, y: 165, width: 100, height: 60 };
    const r = snapPosition({ x: 37, y: 167 }, size, [odd], base);
    expect(r.position.y).toBe(165);
    expect(165 % GRID).not.toBe(0);
    expect(r.position.x).toBe(32);
    // edge-to-edge pairs count too; y is far away so the clamp cannot interfere
    const rl = snapPosition({ x: 297, y: 400 }, size, [other], base); // my right (397) ↔ their left (400); the grid alone gives 304
    expect(rl.position.x).toBe(300);
    expect(rl.guides).toContainEqual({ axis: 'x', at: 400 });
    const lr = snapPosition({ x: 503, y: 400 }, size, [other], base); // my left (503) ↔ their right (500); the grid alone gives 496
    expect(lr.position.x).toBe(500);
    expect(lr.guides).toContainEqual({ axis: 'x', at: 500 });
  });

  it('25.514 the collision clamp runs last and hides a guide it moved off (the other axis keeps its guide)', () => {
    // raw x 297 is within 6 px of an x guide (other's left edge via right↔left, d = 3)
    const aligner = { x: 300, y: 400, width: 100, height: 60 };
    const r = snapPosition({ x: 297, y: 163 }, size, [other, aligner], { ...base, lastValid: { x: 0, y: 163 } });
    expect(r.target).toEqual({ x: 300, y: 160 }); // an x guide + the y guide (centre↔centre)
    expect(r.blocked).toBe(true);
    expect(r.position).toEqual({ x: 292, y: 160 }); // clamped left of `other`
    expect(r.guides.find((g) => g.axis === 'x')).toBeUndefined();
    expect(r.guides).toContainEqual({ axis: 'y', at: 190 });
  });

  it('25.515 Alt skips guides and grid (the clamp still applies)', () => {
    expect(snapPosition({ x: 37, y: 163 }, size, [other], { ...base, alt: true }).position).toEqual({ x: 37, y: 163 });
  });

  it('25.516 target reports the snapped pre-clamp point (for the dashed outline); unblocked → target equals position; a y-only block is blocked too', () => {
    const r = snapPosition({ x: 330, y: 163 }, size, [other], { ...base, lastValid: { x: 0, y: 163 } });
    expect(r.target).toEqual({ x: 336, y: 160 });
    expect(r.position).toEqual({ x: 292, y: 160 });
    const free = snapPosition({ x: 37, y: 9 }, size, [other], base);
    expect(free.blocked).toBe(false);
    expect(free.target).toEqual(free.position);
    // a block on y alone still counts: x on the centre↔centre guide, y on the grid, clamped above `other`
    const v = snapPosition({ x: 400, y: 120 }, size, [other], base);
    expect(v.target).toEqual({ x: 400, y: 128 });
    expect(v.position).toEqual({ x: 400, y: 92 });
    expect(v.blocked).toBe(true);
    expect(v.guides).toContainEqual({ axis: 'x', at: 450 });
  });
});
