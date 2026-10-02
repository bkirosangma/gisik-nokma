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
  });

  it('25.513 a guide beats the grid on its axis only: the guided axis lands off-grid, the other axis still snaps to the grid', () => {
    // centre of `odd` is y 195; a dragged centre at 197 snaps to y 165, which is not a multiple of 16 (the grid alone would give 160)
    const odd = { x: 400, y: 165, width: 100, height: 60 };
    const r = snapPosition({ x: 37, y: 167 }, size, [odd], base);
    expect(r.position.y).toBe(165);
    expect(165 % GRID).not.toBe(0);
    expect(r.position.x).toBe(32);
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

  it('25.516 target reports the snapped pre-clamp point (for the dashed outline); unblocked → target equals position', () => {
    const r = snapPosition({ x: 330, y: 163 }, size, [other], { ...base, lastValid: { x: 0, y: 163 } });
    expect(r.target).toEqual({ x: 336, y: 160 });
    expect(r.position).toEqual({ x: 292, y: 160 });
    const free = snapPosition({ x: 37, y: 9 }, size, [other], base);
    expect(free.blocked).toBe(false);
    expect(free.target).toEqual(free.position);
  });
});
