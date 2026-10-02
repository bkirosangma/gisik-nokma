import { describe, expect, it } from 'vitest';
import { clampToAvoidOverlap, rectsOverlap, NODE_GAP } from '../../src/workflow-builder/collision.js';

const size = { width: 100, height: 60 };
const ob = { x: 200, y: 0, width: 100, height: 60 };

describe('collision (spec §3.1)', () => {
  it('25.505 a free target is returned unchanged', () => {
    expect(clampToAvoidOverlap({ x: 0, y: 200 }, size, [ob], { x: 0, y: 0 })).toEqual({ x: 0, y: 200 });
  });

  it('25.506 overlap honours the gap on all four sides: touching within 8 px counts, 9 px apart does not', () => {
    const a = { x: 0, y: 0, ...size };
    // right of a, left of a, below a, above a (a is 100 x 60)
    expect(rectsOverlap(a, { ...ob, x: 107 }, NODE_GAP)).toBe(true);
    expect(rectsOverlap(a, { ...ob, x: 109 }, NODE_GAP)).toBe(false);
    expect(rectsOverlap(a, { ...ob, x: -107 }, NODE_GAP)).toBe(true);
    expect(rectsOverlap(a, { ...ob, x: -109 }, NODE_GAP)).toBe(false);
    expect(rectsOverlap(a, { ...ob, x: 0, y: 67 }, NODE_GAP)).toBe(true);
    expect(rectsOverlap(a, { ...ob, x: 0, y: 69 }, NODE_GAP)).toBe(false);
    expect(rectsOverlap(a, { ...ob, x: 0, y: -67 }, NODE_GAP)).toBe(true);
    expect(rectsOverlap(a, { ...ob, x: 0, y: -69 }, NODE_GAP)).toBe(false);
  });

  it('25.507 dragging into an obstacle from the left or the right stops at the near edge plus/minus the gap (slides, does not jump past)', () => {
    expect(clampToAvoidOverlap({ x: 150, y: 0 }, size, [ob], { x: 0, y: 0 })).toEqual({ x: 92, y: 0 });
    // the mirror: a drag into `ob` from the right stops at its right edge plus the gap
    expect(clampToAvoidOverlap({ x: 250, y: 0 }, size, [ob], { x: 400, y: 0 })).toEqual({ x: 308, y: 0 });
  });

  it('25.508 the nearest valid candidate wins: approaching from above or below stops at the near edge', () => {
    expect(clampToAvoidOverlap({ x: 200, y: -20 }, size, [ob], { x: 200, y: -200 })).toEqual({ x: 200, y: -68 });
    // approaching from below stops below it
    expect(clampToAvoidOverlap({ x: 200, y: 40 }, size, [ob], { x: 200, y: 200 })).toEqual({ x: 200, y: 68 });
  });

  it('25.509 a corner between two obstacles picks the closest free spot', () => {
    const ob2 = { x: 200, y: 68, width: 100, height: 60 };
    const out = clampToAvoidOverlap({ x: 150, y: 40 }, size, [ob, ob2], { x: 0, y: 40 });
    for (const o of [ob, ob2]) expect(rectsOverlap({ ...out, ...size }, o, NODE_GAP)).toBe(false);
    expect(out.x).toBe(92);
  });

  it('25.510 a target inside a stack of obstacles still lands on a free spot', () => {
    const ring = [ob, { x: 200, y: 68, width: 100, height: 60 }, { x: 200, y: -68, width: 100, height: 60 }];
    const out = clampToAvoidOverlap({ x: 210, y: 0 }, size, ring, { x: 0, y: 0 });
    for (const o of ring) expect(rectsOverlap({ ...out, ...size }, o, NODE_GAP)).toBe(false);
  });
});
