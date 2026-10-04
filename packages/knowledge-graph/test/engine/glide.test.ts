// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { COAST_MS, coastOffset } from '../../src/engine/coast.js';
import { GLIDE_MS, easeOutCubic, glideFrame } from '../../src/engine/glide.js';

describe('glide (port of glide, knowledge-graph-sigma.html:890-895) and coast (spec C §3.6, new)', () => {
  it('27.251 the glide eases out over 320 ms and ends exactly on the new layout; an item that did not move does not tween, a new one starts at its place; control: reduced motion lands at once', () => {
    expect(GLIDE_MS).toBe(320);
    expect(easeOutCubic(0.5)).toBe(0.875);
    const from = new Map([['a', { x: 0, y: 0 }], ['s', { x: 5, y: 5 }], ['g', { x: 9, y: 9 }]]);
    const to = new Map([['a', { x: 100, y: 0 }], ['s', { x: 5, y: 5 }], ['n', { x: 7, y: 8 }]]);
    const half = glideFrame(from, to, 160, false);
    expect(half.positions.get('a')).toEqual({ x: 87.5, y: 0 });
    expect(half.positions.get('s')).toBe(to.get('s')); // the same point: the adapter skips it, so its edges never flash
    expect(half.positions.get('n')).toEqual({ x: 7, y: 8 }); // no old place: it does not fly in
    expect(glideFrame(new Map([['v', { x: 3, y: 0 }]]), new Map([['v', { x: 3, y: 40 }]]), 160, false).positions.get('v')).toEqual({ x: 3, y: 35 }); // straight down still tweens
    expect([...half.positions.keys()]).toEqual(['a', 's', 'n']); // an item that left is not drawn
    expect(half.done).toBe(false);
    expect(glideFrame(from, to, 319, false).done).toBe(false);
    expect(glideFrame(from, to, -10, false).positions.get('a')).toEqual({ x: 0, y: 0 }); // a clock behind the start holds the old place
    expect(glideFrame(from, to, 320, false)).toEqual({ positions: to, done: true });
    expect(glideFrame(from, to, 0, true)).toEqual({ positions: to, done: true });
  });

  it('27.252 a released drag coasts on in its last direction for 300 ms of travel, at the velocity of the last 100 ms; control: a drag that stopped before release, or rested 50 ms, does not coast', () => {
    expect(COAST_MS).toBe(300);
    const moving = [{ t: 0, x: 0, y: 0 }, { t: 50, x: 50, y: 0 }, { t: 100, x: 100, y: 0 }];
    expect(coastOffset(moving, 100)).toEqual({ x: 300, y: 0 }); // 1 px/ms × 300 ms
    expect(coastOffset([...moving, { t: 200, x: 100, y: 0 }], 200)).toEqual({ x: 0, y: 0 });
    expect(coastOffset(moving, 150)).toEqual({ x: 0, y: 0 }); // the OTHER "stopped" arm: no new sample, but the pointer rested 50 ms
    // speeding up: only the last 100 ms count (t 0 → 100: 1 px/ms across, 0.5 px/ms down), not t −50 nor only t 50 → 100
    const speeding = [{ t: -50, x: -500, y: 0 }, { t: 0, x: 0, y: 0 }, { t: 50, x: 10, y: 5 }, { t: 100, x: 100, y: 50 }];
    expect(coastOffset(speeding, 100)).toEqual({ x: 300, y: 150 });
    expect(coastOffset(speeding, 149)).toEqual({ x: 300, y: 150 });
    expect(coastOffset(speeding, 150)).toEqual({ x: 0, y: 0 }); // rested 50 ms before release
    expect(coastOffset([{ t: 0, x: 5, y: 5 }], 0)).toEqual({ x: 0, y: 0 }); // one sample has no velocity
    expect(coastOffset([], 0)).toEqual({ x: 0, y: 0 });
  });
});
