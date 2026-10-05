// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { tooltipPosition } from '../../src/react/tooltip.js';

describe('tooltipPosition (`placeTip`, knowledge-graph-sigma.html:877)', () => {
  it('27.311 the tip stays inside the canvas at its right and top edges, and a tip wider than the canvas starts at 8; control: mid-canvas it sits up and right of the pointer', () => {
    const tip = { width: 120, height: 28 };
    const right = tooltipPosition(300 - 20, 100, tip, 300);
    expect(right.left + tip.width).toBeLessThanOrEqual(300 - 8);
    expect(right.left).toBe(300 - 120 - 8);
    expect(tooltipPosition(100, 5, tip, 300).top).toBe(8);
    expect(tooltipPosition(5, 100, { width: 2000, height: 28 }, 300).left).toBe(8);
    // control
    expect(tooltipPosition(100, 100, tip, 300)).toEqual({ left: 100 + 14, top: 100 - 28 - 10 });
  });
});
