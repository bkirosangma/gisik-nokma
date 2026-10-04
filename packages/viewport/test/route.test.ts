// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { GUTTER_PX, LOOP_LIFTS_PX, routeEdge, routeLoop, type Box, type Pt } from '../src/index.js';

const bar = (day: number, row: number, days: number, ppd = 16): Box => ({ x: day * ppd, y: row * 40, w: days * ppd, h: 28 });
const axisAligned = (pts: readonly { x: number; y: number }[]) => pts.every((p, i) => i === 0 || p.x === (pts[i - 1] as { x: number }).x || p.y === (pts[i - 1] as { y: number }).y);

describe('29.065 edge routing on packed rows', () => {
  it('29.065 same row, target later: a straight line from the end anchor to the start anchor; every step axis-aligned; control: a target EARLIER on the same row is no straight line, it takes the channel', () => {
    const r = routeEdge(bar(0, 0, 4), bar(8, 0, 3), []);
    expect(r.points).toEqual([{ x: 64, y: 14 }, { x: 128, y: 14 }]);
    expect(r.crossings).toBe(0);
    // a gap narrower than the 14 px gutter has no gutter candidate: only the straight-line candidate gives two points here
    expect(routeEdge(bar(0, 0, 4), { x: 72, y: 0, w: 48, h: 28 }, []).points).toEqual([{ x: 64, y: 14 }, { x: 72, y: 14 }]);
    // CONTROL, same it: the target EARLIER on the same row: out past the source end, along the row's bottom edge, back to the
    // gutter before the target, and in from the left (never a straight line drawn backwards)
    expect(routeEdge(bar(8, 0, 3), bar(0, 0, 4), []).points).toEqual([
      { x: 176, y: 14 }, { x: 190, y: 14 }, { x: 190, y: 28 }, { x: -14, y: 28 }, { x: -14, y: 14 }, { x: 0, y: 14 },
    ]);
  });

  it('29.065 another row: the vertical run is in the gutter 14 px before the target; the path ends ON the start anchor; a gutter that would stand behind the source end is not used', () => {
    const to = bar(8, 2, 3);
    const r = routeEdge(bar(0, 0, 4), to, []);
    expect(GUTTER_PX).toBe(14);
    expect(r.points[0]).toEqual({ x: 64, y: 14 });
    expect(r.points[r.points.length - 1]).toEqual({ x: to.x, y: to.y + 14 });
    expect(r.points).toContainEqual({ x: to.x - 14, y: to.y + 14 });
    expect(axisAligned(r.points)).toBe(true);
    expect(r.crossings).toBe(0);
    // a gap of 8 px on another row: the gutter before the target (x = 58) is behind the source end (64), so the path takes
    // the channel between the rows instead of running backwards in it
    expect(routeEdge(bar(0, 0, 4), { x: 72, y: 80, w: 48, h: 28 }, []).points).toEqual([
      { x: 64, y: 14 }, { x: 78, y: 14 }, { x: 78, y: 54 }, { x: 58, y: 54 }, { x: 58, y: 94 }, { x: 72, y: 94 },
    ]);
    // a gap of exactly the gutter (14 px): neither gutter is used (one would leave the end anchor straight down along the
    // source's edge, the other would come down onto the start anchor from above); the arrowhead still enters from the left
    expect(routeEdge(bar(0, 0, 4), { x: 78, y: 80, w: 48, h: 28 }, []).points).toEqual([
      { x: 64, y: 14 }, { x: 78, y: 14 }, { x: 78, y: 54 }, { x: 64, y: 54 }, { x: 64, y: 94 }, { x: 78, y: 94 },
    ]);
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
    // one bar at a time beside the first candidate's runs (64 -> 306 on y = 14, 14 -> 94 on x = 306, 306 -> 320 on y = 94):
    // touching a run's END, or level with a run but past it, is not in the way (the whole route is the clean one); CONTROL
    // per row: the same bar moved or stretched onto the run is (another route, or the same one with a crossing reported)
    const sides: [string, Box, Box][] = [
      ['touches the y=14 run end from the right', { x: 306, y: 0, w: 10, h: 28 }, { x: 305, y: 0, w: 10, h: 28 }],
      ['touches the y=94 run start from the left', { x: 296, y: 80, w: 10, h: 28 }, { x: 297, y: 80, w: 10, h: 28 }],
      ['touches the x=306 run end from below', { x: 300, y: 94, w: 12, h: 20 }, { x: 300, y: 93, w: 12, h: 20 }],
      ['touches the x=306 run start from above', { x: 300, y: -6, w: 12, h: 20 }, { x: 300, y: -5, w: 12, h: 20 }],
      ['below the y=14 run', { x: 100, y: 20, w: 20, h: 20 }, { x: 100, y: 10, w: 20, h: 20 }],
      ['above the y=14 run', { x: 100, y: -30, w: 20, h: 10 }, { x: 100, y: -30, w: 20, h: 50 }],
      ['level with the y=14 run, past its end', { x: 330, y: 0, w: 10, h: 28 }, { x: 300, y: 0, w: 40, h: 28 }],
      ['level with the y=94 run, before its start', { x: 200, y: 80, w: 10, h: 28 }, { x: 200, y: 80, w: 110, h: 28 }],
      ['right of the x=306 run', { x: 310, y: 40, w: 10, h: 20 }, { x: 300, y: 40, w: 20, h: 20 }],
      ['left of the x=306 run', { x: 290, y: 40, w: 10, h: 20 }, { x: 290, y: 40, w: 20, h: 20 }],
      ['below the x=306 run', { x: 300, y: 100, w: 12, h: 10 }, { x: 300, y: 80, w: 12, h: 30 }],
      ['above the x=306 run', { x: 300, y: -20, w: 12, h: 10 }, { x: 300, y: -20, w: 12, h: 40 }],
    ];
    for (const [name, beside, across] of sides) {
      expect(routeEdge(from, to, [beside]), name).toEqual(clean);
      expect(routeEdge(from, to, [across]), `${name} (control)`).not.toEqual(clean);
    }
    // every candidate blocked: the first candidate crosses ONE bar (on two of its runs), the gutter after the source one,
    // the channel one; the fewest crossings, the first of equals, is reported and a bar counts once however many runs it crosses
    const fewest = routeEdge(from, to, [{ x: 290, y: 0, w: 30, h: 40 }, { x: 72, y: 40, w: 12, h: 10 }]);
    expect(fewest.points).toEqual(clean.points);
    expect(fewest.crossings).toBe(1);
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
    // a target on a HIGHER row: the channel runs half-way between the target's bottom (28) and the source's top (80), not on
    // the target row's edge (FD-1)
    expect(routeEdge(bar(10, 2, 6), bar(12, 0, 3), []).points).toEqual([
      { x: 256, y: 94 }, { x: 270, y: 94 }, { x: 270, y: 54 }, { x: 178, y: 54 }, { x: 178, y: 14 }, { x: 192, y: 14 },
    ]);
    // bars of mixed height (a 40 px box whose middle is level with the source's bottom): the channel's zero-length step and
    // collinear corner are dropped, so no two points repeat and no three lie on one line
    // a shorter target EARLIER with its middle level with the source's (y = 14): the channel runs under the source's bottom
    // (y = 28), not along the target's bottom (y = 24), which would cut through the source bar
    expect(routeEdge({ x: 100, y: 0, w: 64, h: 28 }, { x: 0, y: 4, w: 48, h: 20 }, []).points).toEqual([
      { x: 164, y: 14 }, { x: 178, y: 14 }, { x: 178, y: 28 }, { x: -14, y: 28 }, { x: -14, y: 14 }, { x: 0, y: 14 },
    ]);
    const mixed = routeEdge({ x: 0, y: 0, w: 64, h: 28 }, { x: 70, y: 8, w: 48, h: 40 }, []).points;
    expect(mixed[0]).toEqual({ x: 64, y: 14 });
    expect(mixed[mixed.length - 1]).toEqual({ x: 70, y: 28 });
    expect(axisAligned(mixed)).toBe(true);
    for (let i = 2; i < mixed.length; i += 1) {
      const [a, b, c] = [mixed[i - 2], mixed[i - 1], mixed[i]] as [Pt, Pt, Pt];
      expect(b, `point ${i - 1} repeats`).not.toEqual(a);
      expect((a.x === b.x && b.x === c.x) || (a.y === b.y && b.y === c.y), `points ${i - 2}..${i} on one line`).toBe(false);
    }
  });

  it('29.065 portrait is the same route transposed: time runs down, the arrowhead enters from above; a bar in the way is transposed with it', () => {
    const from = bar(0, 0, 4);
    const to = bar(8, 2, 3);
    const land = routeEdge(from, to, []);
    const t = (b: Box): Box => ({ x: b.y, y: b.x, w: b.h, h: b.w });
    const port = routeEdge(t(from), t(to), [], 'portrait');
    expect(port.points).toEqual(land.points.map((p) => ({ x: p.y, y: p.x })));
    expect(port.label).toEqual({ x: land.label.y, y: land.label.x });
    // the last step runs DOWN onto the target's start anchor (its top edge's middle): the arrowhead enters from above
    expect(port.points.slice(-2)).toEqual([{ x: 94, y: 114 }, { x: 94, y: 128 }]);
    // a bar standing in the landscape gutter before the target (x 100-120 on row 1), transposed, forces the transposed detour
    // (the gutter after the source, y = 78); CONTROL: the same bar NOT transposed stands nowhere near the portrait route,
    // which keeps the first candidate
    const blocker: Box = { x: 100, y: 40, w: 20, h: 28 };
    expect(routeEdge(t(from), t(to), [t(blocker)], 'portrait').points).toEqual([{ x: 14, y: 64 }, { x: 14, y: 78 }, { x: 94, y: 78 }, { x: 94, y: 128 }]);
    expect(routeEdge(t(from), t(to), [blocker], 'portrait').points).toEqual(port.points);
    // every candidate blocked (the landscape case's two bars, transposed): portrait reports the crossing too
    const walls: Box[] = [{ x: 290, y: 0, w: 30, h: 40 }, { x: 72, y: 40, w: 12, h: 10 }];
    expect(routeEdge(t(from), t(bar(20, 2, 3)), walls.map(t), 'portrait').crossings).toBe(1);
  });

  it('29.065 the label sits on the longest segment along the time axis', () => {
    const r = routeEdge(bar(0, 0, 4), bar(30, 2, 3), []);
    expect(r.label.y).toBe(14);
    expect(r.label.x).toBeGreaterThan(64);
    expect(r.label.x).toBeLessThan(30 * 16);
    // the path is 64 -> 466 on row 0 (402 px), down, then 466 -> 480 (14 px): the middle of the long run
    expect(r.label).toEqual({ x: 265, y: 14 });
    // two runs of equal length (64 -> 78 on row 0, 78 -> 92 on row 2): the first, nearer the source, takes the label
    expect(routeEdge(bar(0, 0, 4), { x: 92, y: 80, w: 48, h: 28 }, []).label).toEqual({ x: 71, y: 14 });
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
    expect(r.label).toEqual({ x: 135.48, y: -15.7 }); // the highest of the 49 sampled points, rounded to 0.01 px
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
    expect(r.d).toBe('M 100 414 C -22 414, 6 4, 6 32');
    expect(r.label).toEqual({ x: 3.23, y: 108.19 });
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
  it('29.067 the smallest lift that crosses no third bar wins; with nothing in the way the first lift is used; with all three blocked the one with the fewest crossings is reported; a bar that only touches the sampled curve, or lies beside it, is not in the way', () => {
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
    // at lift 28 the middle sample (t = 0.5) is exactly (226, -11). A bar with an EDGE on that point, or beside the arc, is not
    // in the way (the first lift is kept); CONTROL per row: the same bar moved 1 px onto the point, or moved onto the arc at
    // x 220-240 where only the first lift passes, is (the second lift is taken)
    const sides: [string, Box, Box][] = [
      ['left edge on the point', { x: 226, y: -20, w: 4, h: 20 }, { x: 225, y: -20, w: 4, h: 20 }],
      ['right edge on the point', { x: 222, y: -20, w: 4, h: 20 }, { x: 223, y: -20, w: 4, h: 20 }],
      ['top edge on the point', { x: 224, y: -11, w: 4, h: 6 }, { x: 224, y: -12, w: 4, h: 6 }],
      ['bottom edge on the point', { x: 224, y: -17, w: 4, h: 6 }, { x: 224, y: -16, w: 4, h: 6 }],
      ['left of the arc', { x: -100, y: -30, w: 10, h: 30 }, { x: 220, y: -30, w: 10, h: 30 }],
      ['right of the arc', { x: 500, y: -30, w: 10, h: 30 }, { x: 220, y: -30, w: 10, h: 30 }],
      ['above the arc', { x: 200, y: -200, w: 40, h: 10 }, { x: 200, y: -20, w: 40, h: 10 }],
      ['below the arc', { x: 200, y: 120, w: 40, h: 10 }, { x: 200, y: -20, w: 40, h: 10 }],
    ];
    for (const [name, beside, across] of sides) {
      expect(routeLoop(diamond, target, [beside]).points[1].y, name).toBe(-28);
      expect(routeLoop(diamond, target, [across]).points[1].y, `${name} (control)`).toBe(-64);
    }
  });
});
