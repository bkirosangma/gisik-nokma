// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { GUTTER_PX, LOOP_LIFTS_PX, routeEdge, routeLoop, type Box } from '../src/index.js';

const bar = (day: number, row: number, days: number, ppd = 16): Box => ({ x: day * ppd, y: row * 40, w: days * ppd, h: 28 });
const axisAligned = (pts: readonly { x: number; y: number }[]) => pts.every((p, i) => i === 0 || p.x === (pts[i - 1] as { x: number }).x || p.y === (pts[i - 1] as { y: number }).y);

describe('29.065 edge routing on packed rows', () => {
  it('29.065 same row, target later: a straight line from the end anchor to the start anchor; every step axis-aligned', () => {
    const r = routeEdge(bar(0, 0, 4), bar(8, 0, 3), []);
    expect(r.points).toEqual([{ x: 64, y: 14 }, { x: 128, y: 14 }]);
    expect(r.crossings).toBe(0);
    // a gap narrower than the 14 px gutter has no gutter candidate: only the straight-line candidate gives two points here
    expect(routeEdge(bar(0, 0, 4), { x: 72, y: 0, w: 48, h: 28 }, []).points).toEqual([{ x: 64, y: 14 }, { x: 72, y: 14 }]);
  });

  it('29.065 another row: the vertical run is in the gutter 14 px before the target; the path ends ON the start anchor', () => {
    const to = bar(8, 2, 3);
    const r = routeEdge(bar(0, 0, 4), to, []);
    expect(GUTTER_PX).toBe(14);
    expect(r.points[0]).toEqual({ x: 64, y: 14 });
    expect(r.points[r.points.length - 1]).toEqual({ x: to.x, y: to.y + 14 });
    expect(r.points).toContainEqual({ x: to.x - 14, y: to.y + 14 });
    expect(axisAligned(r.points)).toBe(true);
    expect(r.crossings).toBe(0);
  });

  it('29.065 a third bar in the way: the router takes the gutter after the source instead; control: with the bar absent the first candidate is used and the two differ', () => {
    const from = bar(0, 0, 4);
    const to = bar(20, 2, 3);
    const blocker = bar(18, 1, 2); // x 288-320 on row 1: stands in the gutter before the target at x = 306
    const clean = routeEdge(from, to, []);
    const around = routeEdge(from, to, [{ x: to.x - 40, y: 40, w: 30, h: 28 }]);
    const forced = routeEdge(from, to, [blocker]);
    // CONTROL: no bar, the first candidate (the gutter 14 px before the target, x = 306)
    expect(clean.points).toEqual([{ x: 64, y: 14 }, { x: 306, y: 14 }, { x: 306, y: 94 }, { x: 320, y: 94 }]);
    expect(clean.points).not.toEqual(around.points);
    // a bar in the gutter before the target: the gutter AFTER the source (x = 64 + 14 = 78), clean
    expect(around.points).toEqual([{ x: 64, y: 14 }, { x: 78, y: 14 }, { x: 78, y: 94 }, { x: 320, y: 94 }]);
    expect(around.crossings).toBe(0);
    expect(forced.points).toEqual(around.points);
    expect(forced.crossings).toBe(0);
    expect(axisAligned(around.points)).toBe(true);
    // a bar that only TOUCHES the first candidate's runs (an edge on x = 306 from either side, an edge on y = 14 from
    // above and from below) is not in the way: the first candidate is kept
    const touching: Box[] = [
      { x: 306, y: 40, w: 10, h: 28 },
      { x: 296, y: 40, w: 10, h: 28 },
      { x: 100, y: 14, w: 20, h: 20 },
      { x: 100, y: -6, w: 20, h: 20 },
    ];
    const grazed = routeEdge(from, to, touching);
    expect(grazed.points).toEqual(clean.points);
    expect(grazed.crossings).toBe(0);
  });

  it('29.065 the target starts before the source ends: a channel between the rows, five corners at most', () => {
    const from = bar(10, 0, 6);
    const to = bar(12, 1, 3);
    const r = routeEdge(from, to, []);
    expect(axisAligned(r.points)).toBe(true);
    expect(r.points.length).toBeLessThanOrEqual(6);
    expect(r.points[0]).toEqual({ x: from.x + from.w, y: 14 });
    expect(r.points[r.points.length - 1]).toEqual({ x: to.x, y: to.y + 14 });
    // the channel runs half-way between the source's bottom (28) and the target's top (40), out past the source end (256 + 14)
    // and back to the gutter before the target (192 - 14)
    expect(r.points).toEqual([{ x: 256, y: 14 }, { x: 270, y: 14 }, { x: 270, y: 34 }, { x: 178, y: 34 }, { x: 178, y: 54 }, { x: 192, y: 54 }]);
  });

  it('29.065 portrait is the same route transposed: time runs down, the arrowhead enters from above', () => {
    const from = bar(0, 0, 4);
    const to = bar(8, 2, 3);
    const land = routeEdge(from, to, []);
    const t = (b: Box): Box => ({ x: b.y, y: b.x, w: b.h, h: b.w });
    const port = routeEdge(t(from), t(to), [], 'portrait');
    expect(port.points).toEqual(land.points.map((p) => ({ x: p.y, y: p.x })));
    expect(port.label).toEqual({ x: land.label.y, y: land.label.x });
    // the last step runs DOWN onto the target's start anchor (its top edge's middle): the arrowhead enters from above
    expect(port.points.slice(-2)).toEqual([{ x: 94, y: 114 }, { x: 94, y: 128 }]);
  });

  it('29.065 the label sits on the longest segment along the time axis', () => {
    const r = routeEdge(bar(0, 0, 4), bar(30, 2, 3), []);
    expect(r.label.y).toBe(14);
    expect(r.label.x).toBeGreaterThan(64);
    expect(r.label.x).toBeLessThan(30 * 16);
    // the path is 64 -> 466 on row 0 (402 px), down, then 466 -> 480 (14 px): the middle of the long run
    expect(r.label).toEqual({ x: 265, y: 14 });
  });
});

describe('29.066 a loop is a curved return arrow, with no pill and no corners', () => {
  const diamond: Box = { x: 400, y: 80, w: 28, h: 28 }; // a Decision on row 2
  const target = bar(2, 0, 6); // the work it sends back to, on row 0, earlier in time

  it('29.066 landscape: one cubic that leaves the diamond\'s top anchor going up, rises above both ends, and lands on the target\'s top edge just inside its start; control: a target on a lower row is entered from above too', () => {
    const r = routeLoop(diamond, target);
    expect(r.points[0]).toEqual({ x: 414, y: 80 }); // top anchor of the diamond
    expect(r.points[3]).toEqual({ x: target.x + 6, y: target.y }); // the target's top edge, 6 px in
    expect(r.points[1].x).toBe(414); // leaves straight up
    expect(r.points[1].y).toBeLessThan(0); // above the higher end (the target's top is y = 0)
    expect(r.points[2].x).toBe(target.x + 6); // lands straight down
    expect(r.d).toBe('M 414 80 C 414 -28, 38 -28, 38 0');
    expect(r.crossings).toBe(0);
    expect(r.label.y).toBeLessThan(0); // the label is at the curve\'s highest point, above both ends
    expect(r.label.y).toBeGreaterThan(-28);
    // CONTROL, same it: a target on a LOWER row than the diamond still arrives from above, and the curve still rises above the higher end (the diamond)
    const lower = routeLoop(diamond, bar(2, 4, 6));
    expect(lower.points[3]).toEqual({ x: 38, y: 160 });
    expect(lower.points[2].x).toBe(38);
    expect(lower.points[2].y).toBeLessThan(80);
    expect(lower.points[1].y).toBeLessThan(80);
  });

  it('29.066 portrait: it leaves the diamond\'s LEFT anchor going left and lands on the target\'s top edge; control: the landscape curve is not the portrait one', () => {
    const d: Box = { x: 100, y: 400, w: 28, h: 28 };
    const t: Box = { x: 0, y: 32, w: 100, h: 96 }; // time runs down: a column
    const r = routeLoop(d, t, [], 'portrait');
    expect(r.points[0]).toEqual({ x: 100, y: 414 });
    expect(r.points[1].y).toBe(414); // leaves horizontally
    expect(r.points[1].x).toBeLessThan(0); // out to the left of both ends
    expect(r.points[3]).toEqual({ x: 6, y: 32 });
    expect(r.points[2].x).toBe(6); // lands vertically
    expect(r.points[2].y).toBeLessThan(32);
    expect(r.label.x).toBeLessThan(6); // the curve\'s left-most point is left of where it lands
    expect(routeLoop(d, t, [], 'landscape').d).not.toBe(r.d);
  });

  it('29.066 the curve is deterministic, a bar narrower than 12 px takes the arrowhead in its middle, and the same boxes always give the same string', () => {
    const slim: Box = { x: 50, y: 0, w: 8, h: 28 };
    expect(routeLoop(diamond, slim).points[3]).toEqual({ x: 54, y: 0 });
    expect(routeLoop(diamond, target).d).toBe(routeLoop({ ...diamond }, { ...target }).d);
    // a function of the boxes alone: fresh copies give the exact string, not merely an equal one
    expect(routeLoop({ ...diamond }, { ...target }).d).toBe('M 414 80 C 414 -28, 38 -28, 38 0');
  });
});

describe('29.067 a loop lifts over a bar that is in its way', () => {
  it('29.067 the smallest lift that crosses no third bar wins; with nothing in the way the first lift is used; with all three blocked the one with the fewest crossings is reported', () => {
    const diamond: Box = { x: 400, y: 80, w: 28, h: 28 };
    const target: Box = { x: 32, y: 0, w: 96, h: 28 };
    expect(LOOP_LIFTS_PX).toEqual([28, 64, 100]);
    const clear = routeLoop(diamond, target, []);
    expect(clear.points[1].y).toBe(-28); // the first lift, as a literal (not read back from the constant)
    expect(clear.crossings).toBe(0);
    // a bar the arc crosses at lift 28 (y about -11 at x = 226) but clears at lift 64 (y about -38 there): the SECOND lift wins
    const low: Box = { x: 200, y: -30, w: 40, h: 25 };
    const second = routeLoop(diamond, target, [low]);
    expect(second.crossings).toBe(0);
    expect(second.points[1].y).toBe(-64);
    // a bar sitting in the arc at the first two lifts (y -40 to -10): only the third lift (y about -65 there) clears it
    const inTheWay: Box = { x: 200, y: -40, w: 40, h: 30 };
    const lifted = routeLoop(diamond, target, [inTheWay]);
    expect(lifted.crossings).toBe(0);
    expect(lifted.points[1].y).toBeLessThan(clear.points[1].y);
    expect(lifted.points[1].y).toBe(-100);
    // blocked at every lift: a wall across the arc; the three tie at one crossing and the first (smallest) is reported
    const wall = [{ x: 200, y: -120, w: 40, h: 118 }];
    const stuck = routeLoop(diamond, target, wall);
    expect(stuck.crossings).toBe(1);
    expect(stuck.points[1].y).toBe(-28);
    // the wall plus the low bar: lift 28 crosses two, lifts 64 and 100 cross one: the fewest, smallest first, is lift 64
    const fewest = routeLoop(diamond, target, [...wall, low]);
    expect(fewest.crossings).toBe(1);
    expect(fewest.points[1].y).toBe(-64);
  });
});
