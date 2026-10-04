// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  CHUNK_DAYS,
  IDLE_MS,
  MAX_CHUNKS,
  RangeCache,
  ScopeCaches,
  chunkEnd,
  chunkOf,
  chunkStart,
  chunksCovering,
  chunksToEvict,
  mountRange,
  neighbourScales,
  nextCoarserPpd,
  panLimits,
  planFetches,
  planWiden,
  rangeAtPpd,
  scopeKey,
  wantedRange,
  isMonday,
} from '../src/index.js';

const bounds = { first: -100, last: 100 };
const none = new Map<number, 'high' | 'low'>();

describe('29.020 chunks', () => {
  it('29.020 28 days from a Monday; the day before a start is the previous chunk\'s last; control: no chunk starts on a non-Monday', () => {
    expect(CHUNK_DAYS).toBe(28);
    for (let c = -5; c <= 5; c += 1) {
      expect(isMonday(chunkStart(c))).toBe(true);
      expect(chunkEnd(c) - chunkStart(c) + 1).toBe(28);
      expect(chunkOf(chunkStart(c))).toBe(c);
      expect(chunkOf(chunkEnd(c))).toBe(c);
      expect(chunkOf(chunkStart(c) - 1)).toBe(c - 1);
    }
    expect(chunksCovering({ start: chunkStart(2), end: chunkStart(4) })).toEqual([2, 3, 4]);
  });
});

describe('29.021 what to fetch', () => {
  const view = { start: 100, end: 120 }; // V = 21
  it('29.021 still: one viewport either side; moving: ahead by max(V, 1.5 s of travel) and half a viewport behind; exactly 1 day/s already moves; a fractional look-ahead rounds up', () => {
    expect(wantedRange(view, 0).range).toEqual({ start: 79, end: 141 });
    expect(wantedRange(view, 0.5).side).toBe(0);
    expect(wantedRange(view, 10)).toEqual({ range: { start: 100 - 11, end: 120 + 21 }, side: 1 });
    expect(wantedRange(view, 40).range.end).toBe(120 + 60);
    expect(wantedRange(view, -40)).toEqual({ range: { start: 100 - 60, end: 120 + 11 }, side: -1 });
    // the threshold itself: below 1 day/s is still, so 1 day/s either way is travel
    expect([wantedRange(view, 1).side, wantedRange(view, -1).side]).toEqual([1, -1]);
    // a fractional look-ahead rounds UP: 15 x 1.5 = 22.5 days becomes 23, so rounding outward never leaves the leading edge short
    expect([wantedRange(view, 15).range.end, wantedRange(view, -15).range.start]).toEqual([143, 77]);
  });

  it('29.021 at most two in flight; the visible chunks first; low-priority behind-the-travel fetches are cancelled when a visible one needs the slot, and only as many as it needs; then the nearer chunk first', () => {
    // still: wanted = days 79-141 = chunks 2, 3, 4; visible = chunks 3 (days 88-115) and 4 (days 116-143); chunk 2 is outside the view
    const p = planFetches({ view, velocity: 0, loaded: new Set(), inFlight: none, bounds, reversed: false });
    expect(p.start).toEqual([{ chunk: 3, priority: 'high' }, { chunk: 4, priority: 'high' }]);
    // one already in flight: one slot left, and the in-flight chunk is not started twice
    const oneBusy = planFetches({ view, velocity: 0, loaded: new Set(), inFlight: new Map<number, 'high' | 'low'>([[3, 'high']]), bounds, reversed: false });
    expect(oneBusy.start).toEqual([{ chunk: 4, priority: 'high' }]);
    // two high fetches in flight (even unwanted ones): nothing starts and a HIGH fetch is never cancelled
    const busy = planFetches({ view, velocity: 0, loaded: new Set(), inFlight: new Map([[50, 'high'], [51, 'high']]), bounds, reversed: false });
    expect(busy.start).toEqual([]);
    expect(busy.cancel).toEqual([]);
    // a low fetch no longer wanted is cancelled even when nothing waits: travelling later from days 100-120 wants
    // days 89-141 = chunks 3, 4 (both loaded), so chunk 2 (days 60-87) has fallen out of the wanted range
    const stray = planFetches({ view, velocity: 12, loaded: new Set([3, 4]), inFlight: new Map<number, 'high' | 'low'>([[2, 'low']]), bounds, reversed: false });
    expect(stray).toEqual({ start: [], cancel: [2] });
    // the slot rule: travelling later over days 116-136 wants chunks 3, 4, 5; chunk 3 (behind, low) and chunk 5 (high) are in
    // flight and STILL wanted, chunk 4 (visible) waits: the low fetch is cancelled to free its slot and chunk 4 starts
    const full = planFetches({
      view: { start: chunkStart(4), end: chunkStart(4) + 20 },
      velocity: 12,
      loaded: new Set(),
      inFlight: new Map<number, 'high' | 'low'>([[3, 'low'], [5, 'high']]),
      bounds,
      reversed: false,
    });
    expect(full).toEqual({ start: [{ chunk: 4, priority: 'high' }], cancel: [3] });
    // only as many as it needs: travelling later over days 116-175 (chunks 4-6 visible) wants chunks 2-8; chunks 2 and 3
    // (behind, low) are in flight and still wanted, 5-8 are loaded, and visible chunk 4 alone waits: ONE low fetch goes
    const twoLows = planFetches({
      view: { start: 116, end: 175 },
      velocity: 12,
      loaded: new Set([5, 6, 7, 8]),
      inFlight: new Map<number, 'high' | 'low'>([[2, 'low'], [3, 'low']]),
      bounds,
      reversed: false,
    });
    expect(twoLows).toEqual({ start: [{ chunk: 4, priority: 'high' }], cancel: [2] });
    // visible first even when farther: travelling later over days 113-143 (chunks 3 and 4 visible), chunk 3's centre (101.5)
    // is 41.5 days behind the leading edge and chunk 5's (157.5) only 14.5 ahead, yet both visible chunks take the two slots
    expect(planFetches({ view: { start: 113, end: 143 }, velocity: 12, loaded: new Set(), inFlight: none, bounds, reversed: false }).start)
      .toEqual([{ chunk: 3, priority: 'high' }, { chunk: 4, priority: 'high' }]);
    // then the nearer: standing still over days 120-141 (centre 130.5) with chunk 4 loaded, chunk 5 (centre 157.5, 27 away)
    // starts before chunk 3 (centre 101.5, 29 away)
    expect(planFetches({ view: { start: 120, end: 141 }, velocity: 0, loaded: new Set([4]), inFlight: none, bounds, reversed: false }).start)
      .toEqual([{ chunk: 5, priority: 'high' }, { chunk: 3, priority: 'high' }]);
  });

  it('29.021 travelling later, the chunk BEHIND the view is low priority and starts after the visible one; control: standing still, the same chunk is high, and so is the chunk ahead', () => {
    // chunk 4 is days 116-143 (the view), chunk 3 is days 88-115 (wholly behind it), chunk 5 is days 144-171 (ahead)
    const ahead = { start: chunkStart(4), end: chunkStart(4) + 20 };
    const moving = planFetches({ view: ahead, velocity: 12, loaded: new Set([5]), inFlight: none, bounds, reversed: false });
    expect(moving.start).toEqual([{ chunk: 4, priority: 'high' }, { chunk: 3, priority: 'low' }]);
    const still = planFetches({ view: ahead, velocity: 0, loaded: new Set([5]), inFlight: none, bounds, reversed: false });
    expect(still.start.find((s) => s.chunk === 3)?.priority).toBe('high');
    // standing still nothing is behind: with chunk 3 loaded, chunk 5 (days 144-171, after the view) is high too
    expect(planFetches({ view: ahead, velocity: 0, loaded: new Set([3]), inFlight: none, bounds, reversed: false }).start)
      .toEqual([{ chunk: 4, priority: 'high' }, { chunk: 5, priority: 'high' }]);
  });

  it('29.021 a reversal cancels every low-priority fetch; chunks outside the index bounds and loaded chunks are never fetched', () => {
    const lows = new Map<number, 'high' | 'low'>([[chunkOf(110), 'low']]);
    const rev = planFetches({ view, velocity: 12, loaded: new Set(), inFlight: lows, bounds, reversed: true });
    expect(rev.cancel).toEqual([chunkOf(110)]);
    const loaded = new Set(chunksCovering(wantedRange(view, 0).range));
    expect(planFetches({ view, velocity: 0, loaded, inFlight: none, bounds, reversed: false }).start).toEqual([]);
    expect(planFetches({ view, velocity: 0, loaded: new Set(), inFlight: none, bounds: { first: 99, last: -99 }, reversed: false }).start).toEqual([]);
    // each bound on its own: the wanted chunks are 2, 3, 4; only the one inside [first, last] may start
    expect(planFetches({ view, velocity: 0, loaded: new Set(), inFlight: none, bounds: { first: 4, last: 100 }, reversed: false }).start).toEqual([{ chunk: 4, priority: 'high' }]);
    expect(planFetches({ view, velocity: 0, loaded: new Set(), inFlight: none, bounds: { first: -100, last: 2 }, reversed: false }).start).toEqual([{ chunk: 2, priority: 'high' }]);
  });
});

describe('29.022 widening, eviction, neighbours', () => {
  it('29.022 idle widening (after 200 ms still) alternates sides outward, may land on the index\'s first or last chunk, and stops at 40 chunks, 10,000 entries or the index extent; control: nothing loaded plans nothing', () => {
    const loaded = new Set([10, 11]);
    expect(planWiden({ loaded, bounds, lastSide: 1, entryCount: 5 })).toEqual({ chunk: 9, side: -1 });
    expect(planWiden({ loaded, bounds, lastSide: -1, entryCount: 5 })).toEqual({ chunk: 12, side: 1 });
    // widening may land ON the index's first or last chunk: loaded 10-11 inside bounds 9-12, either side
    expect(planWiden({ loaded, bounds: { first: 9, last: 12 }, lastSide: 1, entryCount: 5 })).toEqual({ chunk: 9, side: -1 });
    expect(planWiden({ loaded, bounds: { first: 9, last: 12 }, lastSide: -1, entryCount: 5 })).toEqual({ chunk: 12, side: 1 });
    // PR-3's "nothing has moved for 200 ms": the published contract Part 4's hook reads
    expect(IDLE_MS).toBe(200);
    expect(planWiden({ loaded, bounds: { first: 10, last: 11 }, lastSide: 0, entryCount: 5 })).toBeNull();
    // one side at the index extent: the other side is taken instead of stopping
    expect(planWiden({ loaded, bounds: { first: 10, last: 100 }, lastSide: 1, entryCount: 5 })).toEqual({ chunk: 12, side: 1 });
    expect(planWiden({ loaded: new Set(Array.from({ length: MAX_CHUNKS }, (_, i) => i)), bounds, lastSide: 0, entryCount: 5 })).toBeNull();
    expect(planWiden({ loaded, bounds, lastSide: 0, entryCount: 10_000 })).toBeNull();
    // the control needs UNBOUNDED bounds: with finite bounds an empty set's ±Infinity edges fail the bounds check anyway,
    // so the leg would stay green with the `size === 0` guard deleted
    expect(planWiden({ loaded: new Set(), bounds: { first: -Infinity, last: Infinity }, lastSide: 0, entryCount: 0 })).toBeNull();
  });

  it('29.022 past the cap the farthest chunk goes first and nothing within a viewport of the view is ever evicted; at exactly 10,000 entries nothing goes; each eviction counts its entries off; at equal distance the later chunk goes first', () => {
    const view = { start: 0, end: 27 };
    const loaded = new Set(Array.from({ length: 45 }, (_, i) => i - 22));
    // 45 chunks (-22..22), 5 over the cap. Distance of chunk c's centre from day 13.5 is |4 + 28c|: 22 → 620, -22 → 612,
    // 21 → 592, -21 → 584, 20 → 564. Farthest first, exactly five.
    const out = chunksToEvict(loaded, view, () => 1);
    expect(out).toEqual([22, -22, 21, -21, 20]);
    expect(chunksToEvict(new Set([0, 1, 2]), view, () => 1)).toEqual([]);
    // the protection leg: 24,000 entries, and evicting both far chunks still leaves 12,000 (> 10,000), so only the
    // protected set (chunks -2..1, days -28..55) stops the loop from taking chunk 1 next
    const heavy = chunksToEvict(new Set([0, 1, 40, -40]), view, () => 6000);
    expect(heavy).toEqual([40, -40]);
    // AT the entry cap is not past it: 2 x 5,000 = 10,000 evicts nothing
    expect(chunksToEvict(new Set([0, 40]), view, () => 5000)).toEqual([]);
    // each eviction takes its entries off: 16,000 → 12,000 (chunk 50) → 8,000 (chunk 40), so chunk -40 stays
    expect(chunksToEvict(new Set([0, 40, -40, 50]), view, () => 4000)).toEqual([50, 40]);
    // equal distance: days 4-31 are centred on chunk 0's own centre (17.5), so chunks 5 and -5 are both 140 away; the later
    // goes first. 18,000 entries: chunk 5 leaves 12,000, chunk -5 leaves 6,000; chunk 0 is protected
    expect(chunksToEvict(new Set([0, 5, -5]), { start: 4, end: 31 }, () => 6000)).toEqual([5, -5]);
  });

  it('29.023 the next coarser preset (a zoom a hair above a preset counts as that preset, one more than a hair above does not), the same centre at another scale, the neighbouring packing scales, the mount range', () => {
    expect([nextCoarserPpd(56), nextCoarserPpd(24), nextCoarserPpd(8), nextCoarserPpd(30)]).toEqual([24, 8, null, 24]);
    // 24.01 is Week (within 0.05 of it), so the next coarser is Month, not Week again
    expect(nextCoarserPpd(24.01)).toBe(8);
    // 24.1 is more than a hair above Week, so the next coarser preset is Week itself: 24.01 pins the lower side, this the upper
    expect(nextCoarserPpd(24.1)).toBe(24);
    expect(rangeAtPpd({ start: 100, end: 123 }, 24, 8)).toEqual({ start: 75, end: 148 });
    expect(neighbourScales(16)).toEqual([32, 8]);
    expect(neighbourScales(64)).toEqual([32]);
    expect(neighbourScales(4)).toEqual([8]);
    expect(mountRange({ start: 100, end: 120 })).toEqual({ start: 79, end: 141 });
  });

  it('29.023 pan limits: the drawn extent plus a viewport either side, never narrower than today +/- 56; nothing drawn is the minimum; a fractional viewport rounds outward', () => {
    expect(panLimits(null, 1000, 30)).toEqual({ start: 944, end: 1056 });
    expect(panLimits({ start: 990, end: 1010 }, 1000, 30)).toEqual({ start: 944, end: 1056 });
    expect(panLimits({ start: 500, end: 2000 }, 1000, 30)).toEqual({ start: 470, end: 2030 });
    // a viewport of 30.5 days (px / ppd is rarely whole): 469.5 rounds down and 2030.5 up, never inward
    expect(panLimits({ start: 500, end: 2000 }, 1000, 30.5)).toEqual({ start: 469, end: 2031 });
  });
});

describe('29.024 the cache', () => {
  type I = { id: string; start: number };
  type D = { id: string; title: string };
  it('29.024 a stale chunk is still returned; putChunk clears the mark; markStale on an unloaded chunk reports false; the stale chunks are listed in order', () => {
    const c = new RangeCache<I, D>('s');
    c.putChunk(3, [{ id: 'a', title: 'A' }]);
    expect(c.markStale(3)).toBe(true);
    expect(c.markStale(9)).toBe(false);
    expect(c.getChunk(3)).toEqual({ items: [{ id: 'a', title: 'A' }], stale: true });
    expect(c.staleChunks()).toEqual([3]);
    c.putChunk(3, [{ id: 'a', title: 'A2' }]);
    expect(c.staleChunks()).toEqual([]);
    expect(c.getChunk(3)?.items[0]?.title).toBe('A2');
    expect(c.getChunk(4)).toBeUndefined();
    // listed in chunk order, not load order: chunk 3 was loaded before chunk 1
    c.putChunk(1, [{ id: 'b', title: 'B' }]);
    c.markStale(1);
    c.markStale(3);
    expect(c.staleChunks()).toEqual([1, 3]);
  });

  it('29.024 patchEntry changes the index and every chunk copy and reports how many; an unknown id reports 0; entriesIn counts one chunk; the arrays the caller handed in are never patched', () => {
    const c = new RangeCache<I, D>('s');
    const index = [{ id: 'a', start: 1 }, { id: 'b', start: 2 }];
    const zero = [{ id: 'a', title: 'A' }];
    c.setIndex(index);
    c.putChunk(0, zero);
    c.putChunk(1, [{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }]);
    expect(c.patchEntry('a', (e) => ({ ...e, start: 9 }), (d) => ({ ...d, title: 'new' }))).toBe(3);
    expect(c.getIndex()?.[0]?.start).toBe(9);
    expect(c.getChunk(1)?.items.map((d) => d.title)).toEqual(['new', 'B']);
    expect(c.patchEntry('zzz', (e) => e, (d) => d)).toBe(0);
    expect(c.entryCount()).toBe(3);
    expect([c.entriesIn(0), c.entriesIn(1), c.entriesIn(7)]).toEqual([1, 2, 0]);
    // the cache holds copies: the patch replaced its own entries, not the caller's
    expect([index[0]?.start, zero[0]?.title]).toEqual([1, 'A']);
    c.evict(0);
    expect([...c.loadedChunks()]).toEqual([1]);
  });

  it('29.025 scopes: the same scope in another order is one cache; the fifth scope drops the least recently used; a get refreshes', () => {
    expect(scopeKey(['b', 'a'], ['p'], true)).toBe(scopeKey(['a', 'b'], ['p'], true));
    expect(scopeKey(['a'], ['q', 'p'], true)).toBe(scopeKey(['a'], ['p', 'q'], true));
    expect(scopeKey(['a'], [], true)).not.toBe(scopeKey(['a'], [], false));
    const s = new ScopeCaches<I, D>(); // the DEFAULT max (4) is the contract; passing 4 would leave a wrong default green
    for (const k of ['1', '2', '3', '4']) s.get(k);
    s.get('1');
    s.get('5');
    expect(s.keys()).toEqual(['3', '4', '1', '5']);
    // one cache per scope: a second get of a held scope returns the SAME cache (with what it loaded), not a fresh one
    const five = s.get('5');
    five.putChunk(0, [{ id: 'x', title: 'X' }]);
    expect(s.get('5')).toBe(five);
    expect(s.get('5').has(0)).toBe(true);
  });
});
