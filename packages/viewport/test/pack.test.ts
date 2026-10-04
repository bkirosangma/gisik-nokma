// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { BAR_PAD_PX, KEY_GAP_PX, MIN_BAR_PX, barPx, footprintOf, keyOutside, maxOverlap, naturalKeyCompare, packLane, packLaneBy, type PackItem, type Seg } from '../src/index.js';

/** A small seeded generator so a failing seed can be replayed. */
const rng = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 2 ** 32;
};

const single = (seed: number, n = 40): PackItem[] => {
  const r = rng(seed);
  return Array.from({ length: n }, (_, i) => {
    const start = Math.floor(r() * 60);
    return { id: `i${i}`, key: r() < 0.2 ? null : `GN-${Math.floor(r() * 500)}`, segments: [{ start, end: start + Math.floor(r() * 9) }] };
  });
};

/** First fit WITHOUT the sort: the planted wrong packer for the control. */
function unsortedFirstFit(items: readonly PackItem[]): number {
  const rows: Seg[][] = [];
  for (const item of items) {
    const s = item.segments[0] as Seg;
    let r = 0;
    while (r < rows.length && (rows[r] as Seg[]).some((o) => o.start <= s.end && s.start <= o.end)) r += 1;
    if (r === rows.length) rows.push([]);
    (rows[r] as Seg[]).push(s);
  }
  return rows.length;
}

const overlaps = (a: Seg, b: Seg) => a.start <= b.end && b.start <= a.end;

describe('29.050 packing is optimal for single-interval items', () => {
  it('29.050 rows equal the greatest overlap on 200 seeds, and no two items in a row share a day; control: an UNSORTED first fit exceeds the optimum on at least one seed', () => {
    let controlWorse = 0;
    for (let seed = 1; seed <= 200; seed += 1) {
      const items = single(seed);
      const out = packLane(items, { ppd: 16 });
      expect(out.rows, `seed ${seed}`).toBe(maxOverlap(items, { ppd: 16 }));
      const byRow = new Map<number, Seg[]>();
      for (const it of items) {
        const row = out.rowOf.get(it.id) as number;
        const held = byRow.get(row) ?? [];
        for (const o of held) expect(overlaps(o, it.segments[0] as Seg), `seed ${seed}`).toBe(false);
        held.push(it.segments[0] as Seg);
        byRow.set(row, held);
      }
      if (unsortedFirstFit(items) > out.rows) controlWorse += 1;
    }
    expect(controlWorse).toBeGreaterThan(0);
  });
});

describe('29.051 multi-segment items', () => {
  it('29.051 never more rows than the hull packing, and every segment of an item sits in its one row without sharing a day; control: the hull packer alone can need more rows', () => {
    let hullWorse = 0;
    for (let seed = 1; seed <= 200; seed += 1) {
      const r = rng(seed + 1000);
      // 1 to 3 segments per item, the count drawn from the seeded generator (spec PK-2; planner ruling 2026-10-04).
      // Checked by hand-simulation of Step 3's code: the hull packing is worse on 187 of the 200 seeds and never better.
      const items: PackItem[] = Array.from({ length: 24 }, (_, i) => {
        const n = 1 + Math.floor(r() * 3);
        const segments: Seg[] = [];
        let at = Math.floor(r() * 40);
        for (let k = 0; k < n; k += 1) {
          const end = at + 2 + Math.floor(r() * 5);
          segments.push({ start: at, end });
          at = end + 2 + Math.floor(r() * 12);
        }
        return { id: `m${i}`, key: `GN-${i}`, segments };
      });
      const out = packLane(items, { ppd: 16 });
      const hull = packLaneBy(items, { ppd: 16 }, 'hull');
      // The SEGMENT packing itself, not `out`: `packLane` returns the smaller of the two, so `out.rows <= hull.rows` held by construction.
      const segs = packLaneBy(items, { ppd: 16 }, 'segments');
      expect(segs.rows, `seed ${seed}`).toBeLessThanOrEqual(hull.rows);
      if (hull.rows > out.rows) hullWorse += 1;
      const placed = new Map<number, Seg[]>();
      for (const it of items) {
        const row = out.rowOf.get(it.id) as number;
        const held = placed.get(row) ?? [];
        for (const s of it.segments) for (const o of held) expect(overlaps(o, s), `seed ${seed}`).toBe(false);
        held.push(...it.segments);
        placed.set(row, held);
      }
    }
    expect(hullWorse).toBeGreaterThan(0);
    // A tie keeps the segment packing (PK-2): both packings need 2 rows here.
    const twin = (id: string): PackItem => ({ id, key: `GN-${id}`, segments: [{ start: 0, end: 1 }, { start: 5, end: 6 }] });
    const tie = packLane([twin('1'), twin('2')], { ppd: 16 });
    expect([tie.rows, tie.strategy]).toEqual([2, 'segments']);
  });

  it("29.051 an item's segments may come in any order (its first day is its earliest), and its own label footprints merge so no other item slips inside them (a bar inside a swollen label footprint, before or after the segment it swallows); control: the same items with sorted segments, and without the label", () => {
    // The SEGMENT packing (the hull packing ties at 2 rows here, and a tie keeps the segments): u starts on day 0 whichever
    // order its segments come in, so it packs before w (day 1) and keeps row 0; v fits u's gap.
    const uSorted: PackItem = { id: 'u', key: 'GN-1', segments: [{ start: 0, end: 2 }, { start: 10, end: 12 }] };
    const u: PackItem = { ...uSorted, segments: [{ start: 10, end: 12 }, { start: 0, end: 2 }] };
    const w: PackItem = { id: 'w', key: 'GN-2', segments: [{ start: 1, end: 1 }] };
    const v: PackItem = { id: 'v', key: 'GN-3', segments: [{ start: 5, end: 6 }] };
    const sorted = packLane([uSorted, w, v], { ppd: 16 });
    expect([sorted.rowOf.get('u'), sorted.rowOf.get('w'), sorted.rowOf.get('v')]).toEqual([0, 1, 0]);
    const unsorted = packLane([u, w, v], { ppd: 16 });
    expect([unsorted.rowOf.get('u'), unsorted.rowOf.get('w'), unsorted.rowOf.get('v')]).toEqual([0, 1, 0]);
    // a's first segment swells to days 0-11 with a 160 px label (drawn 4 px after its end: 164 px is 11 days at 16 px/day,
    // 29.055) and swallows its own second segment (days 2-3); normalise merges the two into one footprint, days 0-11.
    const a: PackItem = { id: 'a', key: 'GN-4', segments: [{ start: 0, end: 0 }, { start: 2, end: 3 }] };
    const labelled = { ppd: 16, labelPx: (item: PackItem, i: number) => (item.id === 'a' && i === 0 ? 160 : 0) };
    // The SEGMENT search: b on day 1 sits inside the swollen footprint, before the swallowed segment. Left unmerged, the row
    // holds [2-3] then [0-11] (sorted by end); the search for the first interval ending on or after day 1 stops at [2-3],
    // which starts after b, so b slips in beside a (the unmerged hull, days 0-3, still refuses b, but packLane keeps the
    // fewer rows). Control: without the label b fits a's gap on day 1.
    const early: PackItem = { id: 'b', key: 'GN-5', segments: [{ start: 1, end: 1 }] };
    expect(packLane([a, early], { ppd: 16 }).rows).toBe(1);
    expect(packLane([a, early], labelled).rows).toBe(2);
    // The HULL: b on day 5 sits inside the swollen footprint, after the swallowed segment, so the segment search reaches
    // [0-11] and refuses b merged or not. Merged, a has one footprint and packLane never builds the hull; left unmerged, the
    // hull ends where the swallowed segment ends (day 3), b fits beside it, and packLane takes the hull's 1 row. Control:
    // without the label b fits after a.
    const late: PackItem = { id: 'b', key: 'GN-5', segments: [{ start: 5, end: 5 }] };
    expect(packLane([a, late], { ppd: 16 }).rows).toBe(1);
    expect(packLane([a, late], labelled).rows).toBe(2);
  });
});

describe('29.052 adjacency, ties and stability', () => {
  it('29.052 adjacent days share a row (the next can stand side by side); a shared day does not; control: the same pair one day apart split', () => {
    const a: PackItem = { id: 'a', key: 'GN-1', segments: [{ start: 10, end: 14 }] };
    const next: PackItem = { id: 'b', key: 'GN-2', segments: [{ start: 15, end: 18 }] };
    const touching: PackItem = { id: 'c', key: 'GN-3', segments: [{ start: 14, end: 18 }] };
    expect(packLane([a, next], { ppd: 16 }).rows).toBe(1);
    expect(packLane([a, touching], { ppd: 16 }).rows).toBe(2);
    // The same rule through the row search (a row that already reaches past the bar's start): a two-segment item whose gap
    // is exactly days 10-14 takes `a` beside both of its segments; with day 10 shared it does not.
    const gapped: PackItem = { id: 'g', key: 'GN-4', segments: [{ start: 0, end: 9 }, { start: 15, end: 18 }] };
    const gappedShared: PackItem = { id: 'h', key: 'GN-5', segments: [{ start: 0, end: 10 }, { start: 15, end: 18 }] };
    expect(packLane([a, gapped], { ppd: 16 }).rows).toBe(1);
    expect(packLane([a, gappedShared], { ppd: 16 }).rows).toBe(2);
  });

  it('29.052 equal starts order by natural key (GN-9 before GN-10, GN before GN1), keyed before unkeyed, then by id; the input order does not matter', () => {
    expect(naturalKeyCompare('GN-9', 'GN-10')).toBeLessThan(0);
    expect(naturalKeyCompare('GN-10', 'GN-9')).toBeGreaterThan(0);
    // A key whose parts are a prefix of another's sorts first (the part-list length tiebreak).
    expect(naturalKeyCompare('GN', 'GN1')).toBeLessThan(0);
    expect(naturalKeyCompare('GN1', 'GN')).toBeGreaterThan(0);
    const mk = (id: string, key: string | null): PackItem => ({ id, key, segments: [{ start: 5, end: 9 }] });
    // `w` before `z` here, so a sort that drops the id tie-break keeps `forward` right and only `back` ([z, x, y, w]) goes wrong.
    const items = [mk('w', null), mk('y', 'GN-10'), mk('x', 'GN-9'), mk('z', null)];
    const forward = packLane(items, { ppd: 16 });
    const back = packLane([...items].reverse(), { ppd: 16 });
    expect([...back.rowOf].sort()).toEqual([...forward.rowOf].sort());
    for (const it of items) expect(back.rowOf.get(it.id)).toBe(forward.rowOf.get(it.id));
    expect([forward.rowOf.get('x'), forward.rowOf.get('y'), forward.rowOf.get('w'), forward.rowOf.get('z')]).toEqual([0, 1, 2, 3]);
  });

  it('29.052 the input order does not matter on 200 seeds: reversed and rotated input give every item the forward row; control: the seeds hold items that start on the same day', () => {
    let sameStart = 0;
    for (let seed = 1; seed <= 200; seed += 1) {
      const items = single(seed);
      const starts = items.map((item) => (item.segments[0] as Seg).start);
      if (new Set(starts).size < starts.length) sameStart += 1;
      const forward = packLane(items, { ppd: 16 });
      const back = packLane([...items].reverse(), { ppd: 16 });
      const rotated = packLane([...items.slice(17), ...items.slice(0, 17)], { ppd: 16 });
      for (const item of items) {
        expect(back.rowOf.get(item.id), `seed ${seed} ${item.id}`).toBe(forward.rowOf.get(item.id));
        expect(rotated.rowOf.get(item.id), `seed ${seed} ${item.id}`).toBe(forward.rowOf.get(item.id));
      }
    }
    expect(sameStart).toBeGreaterThan(0);
  });

  it('29.052 adding an item that starts after everything changes no existing row; control: adding one that starts first can', () => {
    const items = single(7, 30);
    const before = packLane(items, { ppd: 16 });
    const later: PackItem = { id: 'later', key: 'GN-999', segments: [{ start: 5000, end: 5003 }] };
    const after = packLane([...items, later], { ppd: 16 });
    for (const it of items) expect(after.rowOf.get(it.id)).toBe(before.rowOf.get(it.id));
    let moved = 0;
    for (let seed = 1; seed <= 30 && moved === 0; seed += 1) {
      const base = single(seed, 12);
      const first: PackItem = { id: 'first', key: 'GN-0', segments: [{ start: -1, end: 80 }] };
      const a = packLane(base, { ppd: 16 });
      const b = packLane([...base, first], { ppd: 16 });
      moved += base.filter((it) => a.rowOf.get(it.id) !== b.rowOf.get(it.id)).length;
    }
    expect(moved).toBeGreaterThan(0);
  });

  it('29.052 an item with no segment is refused, not silently dropped', () => {
    expect(() => packLane([{ id: 'x', key: null, segments: [] }], { ppd: 16 })).toThrow(RangeError);
  });
});

describe('29.053 the label is part of the footprint', () => {
  it('29.053 a one-day bar whose key needs 70 px at 16 px/day reserves the 5 days after it (4 + 70 px, counted from its end: days 0-5), so a bar on day 3 goes to a second row; control: no label measure and they share a row', () => {
    const a: PackItem = { id: 'a', key: 'GN-123', segments: [{ start: 0, end: 0 }] };
    const b: PackItem = { id: 'b', key: 'GN-124', segments: [{ start: 3, end: 6 }] };
    expect(footprintOf({ start: 0, end: 0 }, 70, 16)).toEqual({ start: 0, end: 5 });
    expect(footprintOf({ start: 0, end: 9 }, 70, 16)).toEqual({ start: 0, end: 9 });
    expect(packLane([a, b], { ppd: 16, labelPx: () => 70 }).rows).toBe(2);
    expect(packLane([a, b], { ppd: 16 }).rows).toBe(1);
  });

  it("29.053 each segment's label is measured for that item and that segment: a second label of 70 px reserves days 10-15, so a bar on days 12-13 goes to a second row; control: the same 70 px on the first label leaves the second segment its own width", () => {
    const g: PackItem = { id: 'g', key: 'GN-7', segments: [{ start: 0, end: 0 }, { start: 10, end: 10 }] };
    const c: PackItem = { id: 'c', key: 'GN-8', segments: [{ start: 12, end: 13 }] };
    expect(packLane([g, c], { ppd: 16, labelPx: (item, i) => (item.id === 'g' && i === 1 ? 70 : 0) }).rows).toBe(2);
    expect(packLane([g, c], { ppd: 16, labelPx: (item, i) => (item.id === 'g' && i === 0 ? 70 : 0) }).rows).toBe(1);
  });

  it('29.053 the packing scale is injected: at 8 px/day the same label and its gap are 10 days after the bar\'s drawn end (a one-day bar is drawn 12 px, days 0-1, E11), so the footprint is wider (the bucket rule is applied by the caller via packScale)', () => {
    expect(footprintOf({ start: 0, end: 0 }, 70, 8)).toEqual({ start: 0, end: 11 });
  });
});

/**
 * 29.055 — spec PK-4's prose puts an outside key "just outside its END", and the view draws it there (`KEY_GAP_PX` after
 * the bar's last day, `ui.css` `.gn-timeline__key--outside`); the first formula counted the label from the bar's START, so
 * at the Month preset 10 of 12 outside keys ran over the next bar in their row (LOCAL real-browser look, T1 harness, P1 T9;
 * ERRATA E10, planner ruling (b) 2026-10-04). Every leg is two bars in one row where the SECOND bar's day decides.
 */
describe('29.055 an outside key is counted from the bar END, where it is drawn', () => {
  it('29.055 one gap and one predicate: KEY_GAP_PX is 4, and a bar exactly as wide as its key holds it while one a px narrower does not', () => {
    expect(KEY_GAP_PX).toBe(4);
    expect(keyOutside(40, 40)).toBe(false);
    expect(keyOutside(39, 40)).toBe(true);
    expect(keyOutside(16, 0)).toBe(false);
  });

  it('29.055 a two-day bar at 8 px/day with a 40 px key reserves days 0-7 (1 + ceil((4 + 40) / 8)): a bar on day 5 or 7 takes a second row, one on day 8 shares the row; control: the same bars with no key share one row', () => {
    const a: PackItem = { id: 'a', key: 'GN-1', segments: [{ start: 0, end: 1 }] };
    const at = (day: number): PackItem => ({ id: 'b', key: 'GN-2', segments: [{ start: day, end: day + 2 }] });
    const keyed = { ppd: 8, labelPx: (item: PackItem) => (item.id === 'a' ? 40 : 0) };
    expect(footprintOf({ start: 0, end: 1 }, 40, 8)).toEqual({ start: 0, end: 7 });
    // Day 5 is past a START-counted label (days 0-4) and inside the drawn key: the start-based formula would share the row.
    expect(packLane([a, at(5)], keyed).rows).toBe(2);
    // Day 7 is past the key without its gap (40 px is exactly 5 days: days 0-6) and inside it with the gap.
    expect(packLane([a, at(7)], keyed).rows).toBe(2);
    expect(packLane([a, at(8)], keyed).rows).toBe(1);
    expect(packLane([a, at(5)], { ppd: 8 }).rows).toBe(1);
  });

  it('29.055 a bar exactly as wide as its key (5 days at 8 px/day, 40 px) holds it, so its footprint is the bar and a bar on day 5 shares the row; control: a 41 px key is outside and reserves days 0-10', () => {
    const a: PackItem = { id: 'a', key: 'GN-1', segments: [{ start: 0, end: 4 }] };
    const b: PackItem = { id: 'b', key: 'GN-2', segments: [{ start: 5, end: 6 }] };
    expect(footprintOf({ start: 0, end: 4 }, 40, 8)).toEqual({ start: 0, end: 4 });
    expect(packLane([a, b], { ppd: 8, labelPx: (item) => (item.id === 'a' ? 40 : 0) }).rows).toBe(1);
    expect(footprintOf({ start: 0, end: 4 }, 41, 8)).toEqual({ start: 0, end: 10 });
    expect(packLane([a, b], { ppd: 8, labelPx: (item) => (item.id === 'a' ? 41 : 0) }).rows).toBe(2);
  });
});

/**
 * 29.056 / 29.057 — ERRATA E11: a bar is never drawn narrower than its two 6 px paddings (`MIN_BAR_PX`, 12 px; `ui.css`
 * floors the bar's width there), so at the Month preset (8 px per day) a one-day bar is drawn 12 px, a day and a half. The
 * packer counted it as 8 px, so the next day's bar shared its row and the two overlapped on screen. Every leg is two bars in
 * one row where the SECOND bar's day decides.
 */
describe('29.056 a bar is packed at the width it is drawn, never under MIN_BAR_PX', () => {
  it('29.056 one floor and one width: BAR_PAD_PX is 6, MIN_BAR_PX is 12, and barPx is the days\' width floored there', () => {
    expect(BAR_PAD_PX).toBe(6);
    expect(MIN_BAR_PX).toBe(12);
    expect(barPx(1, 8)).toBe(12);
    expect(barPx(1, 12)).toBe(12);
    expect(barPx(2, 8)).toBe(16);
    expect(barPx(1, 16)).toBe(16);
  });

  it('29.056 a keyless one-day bar on day 10 at 8 px/day is drawn over day 11, so a bar on day 11 takes a second row and one on day 12 shares; control: at 16 px/day the one day holds its 12 px and the day-11 bar shares', () => {
    const a: PackItem = { id: 'a', key: null, segments: [{ start: 10, end: 10 }] };
    const at = (day: number): PackItem => ({ id: 'b', key: null, segments: [{ start: day, end: day + 1 }] });
    expect(footprintOf({ start: 10, end: 10 }, 0, 8)).toEqual({ start: 10, end: 11 });
    expect(packLane([a, at(11)], { ppd: 8 }).rows).toBe(2);
    expect(packLane([a, at(12)], { ppd: 8 }).rows).toBe(1);
    // CONTROL: one day at 16 px/day is wider than the floor, so the bar is its own day.
    expect(footprintOf({ start: 10, end: 10 }, 0, 16)).toEqual({ start: 10, end: 10 });
    expect(packLane([a, at(11)], { ppd: 16 }).rows).toBe(1);
  });

  it('29.056 a bar wider than the floor keeps its own days: a keyless three-day bar at 8 px/day (24 px) ends on day 2, so a bar on day 2 takes a second row and one on day 3 shares', () => {
    const a: PackItem = { id: 'a', key: null, segments: [{ start: 0, end: 2 }] };
    const at = (day: number): PackItem => ({ id: 'b', key: null, segments: [{ start: day, end: day }] });
    expect(footprintOf({ start: 0, end: 2 }, 0, 8)).toEqual({ start: 0, end: 2 });
    expect(packLane([a, at(2)], { ppd: 8 }).rows).toBe(2);
    expect(packLane([a, at(3)], { ppd: 8 }).rows).toBe(1);
  });

  it('29.056 the drawn days round UP: at 5 px/day a one-day bar\'s 12 px cover 2.4 days, so it reaches day 2 (3 days); at 4 px/day exactly 3 days, days 0-2', () => {
    expect(footprintOf({ start: 0, end: 0 }, 0, 5)).toEqual({ start: 0, end: 2 });
    expect(footprintOf({ start: 0, end: 0 }, 0, 4)).toEqual({ start: 0, end: 2 });
  });

  it('29.056 the key is decided on the drawn width: a 10 px key fits a one-day bar drawn 12 px at 8 px/day, so the bar is its drawn days 0-1 and a bar on day 2 shares; control: a 13 px key is outside and reserves days 0-4 (1 + ceil((4 + 13) / 8))', () => {
    const a: PackItem = { id: 'a', key: 'GN-1', segments: [{ start: 0, end: 0 }] };
    const b: PackItem = { id: 'b', key: 'GN-2', segments: [{ start: 2, end: 3 }] };
    expect(footprintOf({ start: 0, end: 0 }, 10, 8)).toEqual({ start: 0, end: 1 });
    expect(packLane([a, b], { ppd: 8, labelPx: (item) => (item.id === 'a' ? 10 : 0) }).rows).toBe(1);
    expect(footprintOf({ start: 0, end: 0 }, 12, 8)).toEqual({ start: 0, end: 1 });
    expect(footprintOf({ start: 0, end: 0 }, 13, 8)).toEqual({ start: 0, end: 4 });
    expect(packLane([a, b], { ppd: 8, labelPx: (item) => (item.id === 'a' ? 13 : 0) }).rows).toBe(2);
  });
});

describe('29.057 an outside key is counted from the bar\'s DRAWN end', () => {
  it('29.057 a keyed one-day bar at 8 px/day with a 40 px key: drawn days 0-1, then ceil((4 + 40) / 8) = 6 days, so days 0-7: a bar on day 7 takes a second row and one on day 8 shares; control: no key and the day-2 bar shares', () => {
    const a: PackItem = { id: 'a', key: 'GN-1', segments: [{ start: 0, end: 0 }] };
    const at = (day: number): PackItem => ({ id: 'b', key: 'GN-2', segments: [{ start: day, end: day + 1 }] });
    const keyed = { ppd: 8, labelPx: (item: PackItem) => (item.id === 'a' ? 40 : 0) };
    expect(footprintOf({ start: 0, end: 0 }, 40, 8)).toEqual({ start: 0, end: 7 });
    // Day 7 is past the key counted from the bar's LAST DAY (day 0: days 0-6) and inside it counted from the drawn end.
    expect(packLane([a, at(7)], keyed).rows).toBe(2);
    expect(packLane([a, at(8)], keyed).rows).toBe(1);
    expect(packLane([a, at(2)], { ppd: 8 }).rows).toBe(1);
  });
});

describe('29.054 ten thousand items', () => {
  it.skipIf(process.env['VP_PERF'] === undefined)('29.054 pack 10,000 items in one lane within the 20 ms bar (VP_PERF=1; a LOCAL, warm run, median of 5)', () => {
    const r = rng(99);
    const items: PackItem[] = Array.from({ length: 10_000 }, (_, i) => {
      const start = Math.floor(r() * 900);
      return { id: `p${i}`, key: `GN-${i}`, segments: [{ start, end: start + Math.floor(r() * 20) }] };
    });
    packLane(items, { ppd: 16 }); // warm
    const times: number[] = [];
    let out = packLane(items, { ppd: 16, labelPx: () => 40 });
    for (let k = 0; k < 5; k += 1) {
      const t0 = performance.now();
      out = packLane(items, { ppd: 16, labelPx: () => 40 });
      times.push(performance.now() - t0);
    }
    times.sort((a, b) => a - b);
    expect(out.rows).toBe(maxOverlap(items, { ppd: 16, labelPx: () => 40 }));
    console.log(`29.054 pack 10,000 items: median ${times[2]?.toFixed(1)} ms (LOCAL)`);
    expect(times[2]).toBeLessThan(20);
  });
});
