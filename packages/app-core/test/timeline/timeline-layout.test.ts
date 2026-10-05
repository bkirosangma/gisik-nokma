import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROW_GAP_PX, maxOverlap, routeEdge, type Box, type PackItem } from '@gisik-nokma/viewport';
import { describe, expect, it } from 'vitest';
import {
  BAR_HEIGHT,
  COLUMN_WIDTH,
  LANE_HEADING,
  PIN_PX,
  PORTRAIT_BAR_INSET,
  PORTRAIT_BAR_WIDTH,
  PORTRAIT_GUTTER_PX,
  ROW_PITCH,
  barsInRange,
  layoutLanes,
  type LayoutItem,
  type LayoutLane,
} from '../../src/timeline/timeline-layout.js';

const fixed = (px: number) => () => px;
const item = (id: string, startDay: number, endDay: number, key: string | null = id.toUpperCase(), pinned = false): LayoutItem => ({ id, key, startDay, endDay, pinned });

const rng = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 2 ** 32;
};

describe('29.081 lanes pack on their own and stack', () => {
  it('29.081 each lane is its own packing, under its own id; bars that start on one day take rows in natural key order; landscape lanes stack by 34 px heading + 40 px per row (a 28 px bar); portrait lanes sit side by side at 112 px per column; control: two lanes with the same items get the same rows', () => {
    const a: LayoutLane = { laneId: 'a', items: [item('a1', 0, 9), item('a2', 3, 12), item('a3', 5, 6)] }; // 3 overlap on days 5-6
    const b: LayoutLane = { laneId: 'b', items: [item('b1', 0, 4), item('b2', 10, 14)] }; // 1 row
    const land = layoutLanes([a, b], { ppd: 24, measure: fixed(0) });
    expect(land.lanes.map((l) => l.rows)).toEqual([3, 1]);
    // The rows each bar was given, not only the count: a1, a2, a3 all overlap on days 5-6.
    expect(land.lanes[0]?.bars.map((bar) => [bar.id, bar.row])).toEqual([['a1', 0], ['a2', 1], ['a3', 2]]);
    expect(land.lanes.map((l) => l.laneId)).toEqual(['a', 'b']);
    // Bars that start on one day take rows in natural key order (T4): GN-2 before GN-10, the reverse of id order and of
    // plain string order, so the leg reads the key the layout hands to the packer.
    const tie = layoutLanes([{ laneId: 't', items: [item('a', 0, 3, 'GN-10'), item('b', 0, 3, 'GN-2')] }], { ppd: 24, measure: fixed(0) });
    expect(tie.lanes[0]?.bars.map((bar) => [bar.id, bar.row])).toEqual([['a', 1], ['b', 0]]);
    // The spec's pixels as literals (34 heading, 40 pitch, 112 column): a test that re-reads the exported constants stays
    // green when a constant changes.
    expect([LANE_HEADING, ROW_PITCH, COLUMN_WIDTH]).toEqual([34, 40, 112]);
    // The bar's height in that pitch (spec TG-13: 28 px, 12 px of gap); nothing in the layout reads it, so it is pinned here.
    expect(BAR_HEIGHT).toBe(28);
    expect(land.lanes[0]).toMatchObject({ offset: 0, extent: 34 + 3 * 40 });
    expect(land.lanes[1]).toMatchObject({ offset: 34 + 3 * 40, extent: 34 + 40 });
    expect(land.extent).toBe(34 * 2 + 4 * 40);
    const port = layoutLanes([a, b], { ppd: 24, measure: fixed(0), orientation: 'portrait' });
    expect(port.lanes.map((l) => [l.offset, l.extent])).toEqual([[0, 3 * 112], [3 * 112, 112]]);
    const twin = layoutLanes([a, { laneId: 'c', items: a.items.map((i) => ({ ...i, id: `c-${i.id}` })) }], { ppd: 24, measure: fixed(0) });
    expect(twin.lanes.map((l) => l.rows)).toEqual([3, 3]);
  });

  it('29.081 an empty lane list is a zero-height layout, and a lane never has fewer than one row', () => {
    expect(layoutLanes([], { ppd: 24, measure: fixed(0) })).toMatchObject({ lanes: [], extent: 0 });
    // Both the row count and the extent of an empty lane (planner ruling 2026-10-04): one row, and the room for one row.
    expect(layoutLanes([{ laneId: 'x', items: [] }], { ppd: 24, measure: fixed(0) }).lanes[0]).toMatchObject({ rows: 1, extent: 34 + 40 });
    expect(layoutLanes([{ laneId: 'x', items: [] }], { ppd: 24, measure: fixed(0), orientation: 'portrait' }).lanes[0]).toMatchObject({ rows: 1, extent: 112 });
  });
});

describe('29.082 the fewest rows', () => {
  it('29.082 on 50 seeds the rows of a lane equal the greatest overlap of its bars with their labels at the packing scale; control: an item order that is shuffled gives the same rows', () => {
    for (let seed = 1; seed <= 50; seed += 1) {
      const r = rng(seed);
      const items = Array.from({ length: 30 }, (_, i) => {
        const s = Math.floor(r() * 50);
        return item(`i${i}`, s, s + Math.floor(r() * 8), `GN-${i}`);
      });
      const out = layoutLanes([{ laneId: 'l', items }], { ppd: 20, measure: fixed(40) });
      const packItems: PackItem[] = items.map((it) => ({ id: it.id, key: it.key, segments: [{ start: it.startDay, end: it.endDay }] }));
      expect(out.lanes[0]?.rows, `seed ${seed}`).toBe(maxOverlap(packItems, { ppd: out.scale, labelPx: () => 40 }));
      const shuffled = layoutLanes([{ laneId: 'l', items: [...items].reverse() }], { ppd: 20, measure: fixed(40) });
      expect(shuffled.lanes[0]?.bars.map((b) => [b.id, b.row])).toEqual(out.lanes[0]?.bars.map((b) => [b.id, b.row]));
    }
  });
});

describe('29.083 the key label is part of the footprint, at the bucketed scale', () => {
  // The key is drawn 4 px after the bar's END (29.055, ERRATA E10), so a one-day bar with a 70 px key reserves
  // ceil(74 / scale) days after its day: days 0-5 at 16 px/day, days 0-3 at 32.
  const lane = (): LayoutLane => ({ laneId: 'l', items: [item('a', 0, 0, 'GN-123'), item('b', 4, 7, 'GN-124')] });

  it('29.083 a one-day bar whose key needs 70 px reserves days 0-5 at 16 px/day, so a bar on day 4 goes to a second row; at 32 px/day it reserves days 0-3 and they share one row; the key of each bar is measured', () => {
    expect(layoutLanes([lane()], { ppd: 16, measure: fixed(70) }).lanes[0]?.rows).toBe(2);
    expect(layoutLanes([lane()], { ppd: 32, measure: fixed(70) }).lanes[0]?.rows).toBe(1);
    // Each bar's own key is measured: only GN-123 (the one-day bar) needs 70 px. Control: when only GN-124 needs it, the
    // one-day bar takes no extra room and they share one row.
    expect(layoutLanes([lane()], { ppd: 16, measure: (key) => (key === 'GN-123' ? 70 : 0) }).lanes[0]?.rows).toBe(2);
    expect(layoutLanes([lane()], { ppd: 16, measure: (key) => (key === 'GN-124' ? 70 : 0) }).lanes[0]?.rows).toBe(1);
  });

  it('29.083 rows are the same for every ppd inside one bucket and change only across its edge; control: 31.99 and 32 differ', () => {
    const rowsAt = (ppd: number) => layoutLanes([lane()], { ppd, measure: fixed(70) }).lanes[0]?.bars.map((b) => b.row).join(',');
    for (const ppd of [16, 17.3, 24, 31.99]) expect(rowsAt(ppd)).toBe(rowsAt(16));
    expect(rowsAt(31.99)).not.toBe(rowsAt(32));
    expect(layoutLanes([lane()], { ppd: 24, measure: fixed(70) }).scale).toBe(16);
  });
});

describe('29.084 the paper pin', () => {
  it('29.084 a pinned bar adds 14 px to its label footprint: 4 + 60 px of key at 16 px/day is 4 days after the bar, 4 + 74 px is 5; control: the unpinned neighbour on day 5 shares a row, the pinned one does not; the pin is read per bar, and a bar with no pinned flag is unpinned', () => {
    expect(PIN_PX).toBe(14);
    const make = (pinned: boolean): LayoutLane => ({ laneId: 'l', items: [item('a', 0, 0, 'GN-1', pinned), item('b', 5, 7, 'GN-2')] });
    expect(layoutLanes([make(false)], { ppd: 16, measure: fixed(60) }).lanes[0]?.rows).toBe(1);
    expect(layoutLanes([make(true)], { ppd: 16, measure: fixed(60) }).lanes[0]?.rows).toBe(2);
    // Exactly 14 px, by behaviour: 4 + 46 + 14 = 64 px is 4 days at 16 px/day (one row), 4 + 47 + 14 = 65 px is 5 (two
    // rows). 13 px would put 47 in one row; 15 px would put 46 in two.
    expect(layoutLanes([make(true)], { ppd: 16, measure: fixed(46) }).lanes[0]?.rows).toBe(1);
    expect(layoutLanes([make(true)], { ppd: 16, measure: fixed(47) }).lanes[0]?.rows).toBe(2);
    expect(layoutLanes([make(false)], { ppd: 16, measure: fixed(47) }).lanes[0]?.rows).toBe(1);
    // The pin is read per bar: pinning the SECOND bar (day 5, 4 + 60 + 14 = 78 px is 5 days after it, 5-10) widens its own
    // footprint into c on day 10. Control: unpinned it ends on day 9 and all three share one row.
    const second = (pinned: boolean): LayoutLane => ({ laneId: 'l', items: [item('a', 0, 0, 'GN-1'), item('b', 5, 5, 'GN-2', pinned), item('c', 10, 11, 'GN-3')] });
    expect(layoutLanes([second(true)], { ppd: 16, measure: fixed(60) }).lanes[0]?.rows).toBe(2);
    expect(layoutLanes([second(false)], { ppd: 16, measure: fixed(60) }).lanes[0]?.rows).toBe(1);
    // A bar with no pinned flag at all (the field is optional) is unpinned: it shares a row with its day-5 neighbour.
    const bare: LayoutLane = { laneId: 'l', items: [{ id: 'a', key: 'GN-1', startDay: 0, endDay: 0 }, item('b', 5, 7, 'GN-2')] };
    expect(layoutLanes([bare], { ppd: 16, measure: fixed(60) }).lanes[0]?.rows).toBe(1);
  });
});

describe('29.085 stability', () => {
  it('29.085 adding a bar that starts after everything changes no existing row; control: a bar that starts first can', () => {
    const items = Array.from({ length: 20 }, (_, i) => item(`i${i}`, i * 2, i * 2 + 5, `GN-${i}`));
    const before = layoutLanes([{ laneId: 'l', items }], { ppd: 24, measure: fixed(40) }).lanes[0]?.bars;
    // Non-empty, and the bars really sit in different rows (each spans 6 days and one starts every 2: rows 0, 1, 2 in turn),
    // so "no row changed" below is a claim about three rows, not about one row every bar shares.
    expect(before?.map((bar) => bar.row).join('')).toBe('01201201201201201201');
    const later = layoutLanes([{ laneId: 'l', items: [...items, item('later', 900, 904, 'GN-900')] }], { ppd: 24, measure: fixed(40) }).lanes[0]?.bars;
    for (const bar of before ?? []) expect(later?.find((b) => b.id === bar.id)?.row).toBe(bar.row);
    const first = layoutLanes([{ laneId: 'l', items: [item('first', -5, 100, 'GN-0'), ...items] }], { ppd: 24, measure: fixed(40) }).lanes[0]?.bars;
    expect((before ?? []).some((bar) => first?.find((b) => b.id === bar.id)?.row !== bar.row)).toBe(true);
  });
});

describe('29.086 what is mounted', () => {
  it('29.086 barsInRange returns the bars that touch the range, inclusive at both ends; control: one day outside is not returned', () => {
    const out = layoutLanes([{ laneId: 'l', items: [item('a', 0, 4), item('b', 5, 9), item('c', 10, 14), item('d', 20, 25)] }], { ppd: 24, measure: fixed(0) });
    const lane = out.lanes[0]!;
    expect(barsInRange(lane, { start: 5, end: 10 }).map((b) => b.id)).toEqual(['b', 'c']);
    expect(barsInRange(lane, { start: 4, end: 4 }).map((b) => b.id)).toEqual(['a']);
    expect(barsInRange(lane, { start: 15, end: 19 })).toEqual([]);
    expect(barsInRange(lane, { start: 25, end: 30 }).map((b) => b.id)).toEqual(['d']);
    expect(barsInRange(lane, { start: 26, end: 30 })).toEqual([]);
    // The slice is in start-day order, then id: ids that sort the other way, and a tie on day 5.
    const mixed = layoutLanes([{ laneId: 'm', items: [item('z', 0, 2), item('y', 5, 6), item('x', 5, 8)] }], { ppd: 24, measure: fixed(0) }).lanes[0]!;
    expect(barsInRange(mixed, { start: 0, end: 10 }).map((b) => b.id)).toEqual(['z', 'x', 'y']);
  });
});

/** `packages/app-core/test/timeline` -> four levels up (not `new URL(..., import.meta.url)`: see timeline-view.test.tsx's REPO_ROOT). */
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

/**
 * 29.109's E9 legs (owner ruling E9, 2026-10-04; AMEND-wtg-e9-portrait-gutter): a portrait bar is 100 px inside its 112 px
 * column, inset 6 px a side, so a 12 px gutter (`ROW_GAP_PX`, the landscape row gap) runs between columns and an edge's channel
 * runs on its midline. The constants are the source of truth; ui.css draws the same numbers (it cannot import them), so its
 * copies are pinned against the constants AND against the literals: a value scaled on both sides still reddens.
 */
describe('29.109 E9: a portrait bar is 100 px inside its 112 px column, and an edge runs in the gutter between columns', () => {
  it('29.109 PORTRAIT_BAR_WIDTH = COLUMN_WIDTH - ROW_GAP_PX (100 = 112 - 12), inset 6 px a side; ui.css draws the 112 px pitch, the 6 px inset, the 100 px bar and the 80 px gutter from the same numbers', () => {
    expect(PORTRAIT_BAR_WIDTH).toBe(COLUMN_WIDTH - ROW_GAP_PX);
    expect([PORTRAIT_BAR_WIDTH, PORTRAIT_BAR_INSET, ROW_GAP_PX, COLUMN_WIDTH, PORTRAIT_GUTTER_PX]).toEqual([100, 6, 12, 112, 80]);
    expect(2 * PORTRAIT_BAR_INSET + PORTRAIT_BAR_WIDTH).toBe(COLUMN_WIDTH);
    const css = readFileSync(join(REPO_ROOT, 'packages/ui/src/ui.css'), 'utf8');
    const body = (selector: string) => {
      const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const hits = [...css.matchAll(new RegExp(`^${escaped} \\{([^}]*)\\}`, 'gm'))];
      expect(hits, selector).toHaveLength(1);
      return hits[0]?.[1] ?? '';
    };
    const value = (text: string, name: string) => new RegExp(`(?:^|;)\\s*${name}:\\s*([^;]+);`).exec(text)?.[1]?.trim();
    const bar = body(".gn-timeline[data-orientation='portrait'] .gn-timeline__bar");
    expect(value(bar, 'left')).toBe(`calc(var(--row) * ${COLUMN_WIDTH}px + ${PORTRAIT_BAR_INSET}px)`);
    expect(value(bar, 'left')).toBe('calc(var(--row) * 112px + 6px)');
    expect(value(bar, 'width')).toBe(`${PORTRAIT_BAR_WIDTH}px`);
    expect(value(bar, 'width')).toBe('100px');
    const panel = body(".gn-timeline[data-orientation='portrait']");
    expect(value(panel, '--tl-gutter')).toBe(`${PORTRAIT_GUTTER_PX}px`);
    expect(value(panel, '--tl-gutter')).toBe('80px');
    // The claims callout under a portrait bar sits in the same box.
    const claims = body(".gn-timeline[data-orientation='portrait'] .gn-timeline__row > .gn-timeline__claims");
    expect(value(claims, 'left')).toBe(value(bar, 'left'));
    expect(value(claims, 'max-width')).toBe(`${PORTRAIT_BAR_WIDTH}px`);
  });

  it('29.109 the bar width is defined once, derived, never a re-typed 100; control: the scan counts a planted copy', () => {
    const roots = [join(REPO_ROOT, 'packages/viewport/src'), join(REPO_ROOT, 'packages/app-core/src')];
    const definitions = (text: string, name: string) => (text.match(new RegExp(`\\b${name}\\s*=(?!=)`, 'g')) ?? []).length;
    const total = { width: 0, gap: 0 };
    for (const root of roots) {
      for (const file of readdirSync(root, { recursive: true }) as string[]) {
        if (!/\.tsx?$/.test(file)) continue;
        const text = readFileSync(join(root, file), 'utf8');
        total.width += definitions(text, 'PORTRAIT_BAR_WIDTH');
        total.gap += definitions(text, 'ROW_GAP_PX');
      }
    }
    expect(total).toEqual({ width: 1, gap: 1 });
    const layout = readFileSync(join(REPO_ROOT, 'packages/app-core/src/timeline/timeline-layout.ts'), 'utf8');
    expect(layout).toMatch(/\bexport const PORTRAIT_BAR_WIDTH = COLUMN_WIDTH - ROW_GAP_PX;/);
    expect(layout).toMatch(/\bexport const PORTRAIT_BAR_INSET = \(COLUMN_WIDTH - PORTRAIT_BAR_WIDTH\) \/ 2;/);
    // CONTROL: the scan finds a planted re-typed copy.
    expect(definitions('const PORTRAIT_BAR_WIDTH = 100;', 'PORTRAIT_BAR_WIDTH')).toBe(1);
  });

  it('29.109 an edge between bars in adjacent portrait columns runs its channel strictly inside the gutter and crosses no bar; control: the same scene with 112 px bars crosses', () => {
    const ppd = 24;
    // The source spans days 0-9; the target (days 3-5) starts before it ends, so the router takes the channel beside the
    // source's column (TG-5); a third bar (days 7-8) shares the target's column inside the channel's span.
    const lane = layoutLanes([{ laneId: 'l', items: [item('s', 0, 9), item('t', 3, 5), item('o', 7, 8)] }], { ppd, measure: fixed(0), orientation: 'portrait' }).lanes[0]!;
    expect(lane.bars.map((bar) => [bar.id, bar.row])).toEqual([['s', 0], ['t', 1], ['o', 1]]);
    const boxes = (inset: number, width: number): Record<string, Box> =>
      Object.fromEntries(lane.bars.map((bar) => [bar.id, { x: lane.offset + bar.row * COLUMN_WIDTH + inset, y: bar.startDay * ppd, w: width, h: (bar.endDay - bar.startDay + 1) * ppd }]));
    const channelXs = (b: Record<string, Box>) => {
      const route = routeEdge(b['s']!, b['t']!, [b['o']!], 'portrait');
      const centres = [b['s']!.x + b['s']!.w / 2, b['t']!.x + b['t']!.w / 2];
      const xs: number[] = [];
      for (let i = 1; i < route.points.length; i += 1) {
        const p = route.points[i - 1]!;
        const q = route.points[i]!;
        if (p.x === q.x && !centres.includes(p.x)) xs.push(p.x);
      }
      return { xs, crossings: route.crossings };
    };
    const e9 = boxes(PORTRAIT_BAR_INSET, PORTRAIT_BAR_WIDTH);
    const got = channelXs(e9);
    expect(got.xs.length).toBeGreaterThan(0);
    const gutterFrom = e9['s']!.x + e9['s']!.w;
    const gutterTo = e9['o']!.x;
    expect([gutterFrom, gutterTo]).toEqual([106, 118]);
    for (const x of got.xs) {
      expect(x).toBeGreaterThan(gutterFrom);
      expect(x).toBeLessThan(gutterTo);
    }
    // On the gutter's midline: the boundary between column 0 and column 1.
    expect(got.xs).toEqual([112]);
    expect(got.crossings).toBe(0);
    // CONTROL, same it: bars as wide as their column (the pre-E9 shape) leave no gutter, and the same route crosses the third bar.
    expect(channelXs(boxes(0, COLUMN_WIDTH)).crossings).toBeGreaterThan(0);
  });
});
