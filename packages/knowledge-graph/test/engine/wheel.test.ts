// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { wheelIntent } from '../../src/engine/wheel.js';
const w = (o: Partial<{ deltaMode: number; deltaX: number; deltaY: number; ctrlKey: boolean }>) => ({ deltaMode: 0, deltaX: 0, deltaY: 0, ctrlKey: false, ...o });

describe('the wheel (port of onWheel, knowledge-graph-sigma.html:840-845)', () => {
  it('27.247 ctrl+wheel (and a trackpad pinch) zooms, a notched mouse wheel zooms, a two-finger scroll pans; control: each clause of "notched" alone — a fractional, a sub-40 or a sideways delta pans', () => {
    expect(wheelIntent(w({ ctrlKey: true, deltaY: 10 }))).toEqual({ kind: 'zoom', factor: Math.exp(-10 * 0.012) });
    expect(wheelIntent(w({ ctrlKey: true, deltaY: 100 }))).toEqual({ kind: 'zoom', factor: Math.exp(-100 * 0.012) });
    expect(wheelIntent(w({ deltaY: 100 }))).toEqual({ kind: 'zoom', factor: Math.exp(-100 * 0.0022) });
    expect(wheelIntent(w({ deltaY: -100 }))).toEqual({ kind: 'zoom', factor: Math.exp(100 * 0.0022) });
    expect(wheelIntent(w({ deltaY: 40 }))).toEqual({ kind: 'zoom', factor: Math.exp(-40 * 0.0022) });
    expect(wheelIntent(w({ deltaX: 3, deltaY: 12 }))).toEqual({ kind: 'pan', dx: 3, dy: 12 });
    expect(wheelIntent(w({ deltaY: 39.5 }))).toEqual({ kind: 'pan', dx: 0, dy: 39.5 });
    expect(wheelIntent(w({ deltaY: 100.5 }))).toEqual({ kind: 'pan', dx: 0, dy: 100.5 });
    expect(wheelIntent(w({ deltaY: 39 }))).toEqual({ kind: 'pan', dx: 0, dy: 39 });
    expect(wheelIntent(w({ deltaX: 1, deltaY: 100 }))).toEqual({ kind: 'pan', dx: 1, dy: 100 });
  });
  it('27.248 line and page delta modes scale by 16 and 400 and count as a mouse wheel; control: pixel mode is unscaled', () => {
    expect(wheelIntent(w({ deltaMode: 1, deltaY: 3 }))).toEqual({ kind: 'zoom', factor: Math.exp(-48 * 0.0022) });
    expect(wheelIntent(w({ deltaMode: 2, deltaY: 1 }))).toEqual({ kind: 'zoom', factor: Math.exp(-400 * 0.0022) });
    // 2 lines = 32 px with a sideways part: only the delta mode makes it a mouse wheel
    expect(wheelIntent(w({ deltaMode: 1, deltaX: 1, deltaY: 2 }))).toEqual({ kind: 'zoom', factor: Math.exp(-32 * 0.0022) });
    expect(wheelIntent(w({ deltaY: 5 }))).toEqual({ kind: 'pan', dx: 0, dy: 5 });
  });
});
