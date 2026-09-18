import { describe, expect, it } from 'vitest';
import { compareByRank, isRankKey, rankBetween } from '../src/rank.js';

/**
 * 13.694 — the ordering property the whole ranking feature rests on: a key
 * returned by `rankBetween` is STRICTLY between its neighbours, and inserting
 * between the same pair forever never renumbers anyone else, because the only
 * thing that changes is the new key's own length.
 *
 * The trailing-zero refusal is not decoration. A key ending in `0` has NO room
 * below it — nothing in `[0-9a-z]` sorts under `'0'` — so `rankBetween('a',
 * 'a0')` has no answer to give. Measured on the plan's own algorithm before it
 * was shipped: it does not throw, it does not return; it appends `'0'` forever
 * (probed with a step cap, `NONTERMINATING at i=20001`). `isRankKey` is what
 * keeps such a key out of the key space, and the payload door is tested beside
 * this in `ticket-state.test.ts`'s 13.696.
 */
describe('13.694 rankBetween yields a key strictly between its neighbours without touching them', () => {
  it('first key: (null, null) is a valid key', () => {
    const k = rankBetween(null, null);
    expect(isRankKey(k)).toBe(true);
  });
  it('after: (k, null) > k', () => {
    const k = rankBetween(null, null);
    expect(rankBetween(k, null) > k).toBe(true);
  });
  it('before: (null, k) < k', () => {
    const k = rankBetween(null, null);
    expect(rankBetween(null, k) < k).toBe(true);
  });
  it('between: a < (a, b) < b, and repeated insertion between the same pair keeps working 200 times', () => {
    let a = rankBetween(null, null);
    const b = rankBetween(a, null);
    for (let i = 0; i < 200; i += 1) {
      const m = rankBetween(a, b);
      expect(m > a && m < b).toBe(true);
      a = m;
    }
  });
  it('refuses a === b and a > b', () => {
    const a = rankBetween(null, null);
    expect(() => rankBetween(a, a)).toThrow(/strictly/);
    const b = rankBetween(a, null);
    expect(() => rankBetween(b, a)).toThrow(/strictly/);
  });
  it('isRankKey refuses the empty string, spaces, and characters outside the alphabet', () => {
    expect(isRankKey('')).toBe(false);
    expect(isRankKey('a b')).toBe(false);
    expect(isRankKey('Ä')).toBe(false);
    expect(isRankKey(42)).toBe(false);
  });
  it('every key rankBetween RETURNS is a valid key — prefix-adjacent neighbours included', () => {
    // The module's docblock states this as a guarantee "by construction". Until
    // this case existed, NOTHING here checked it: `isRankKey` was called on a
    // `rankBetween` result in exactly two places, both single calls, neither of
    // them on the descent path.
    //
    // The cost of that hole was measured, not imagined. A mutant that stops
    // descending once `lo` is exhausted — `h - l > 1 || i >= lo.length`, a
    // plausible "optimisation" — leaves THIS WHOLE FILE GREEN (reproduced:
    // exit 0, zero failures) while returning `'0010'` for `('001', '0011')`.
    // That key is strictly between its neighbours and is exactly the
    // unorderable trailing-zero shape `isRankKey` refuses and the payload door
    // rejects — so the module's central guarantee would be gone with nothing
    // to say so.
    //
    // Prefix-adjacent pairs are the ones that reach the descent branch instead
    // of diverging at the first digit, which is why they are named rather than
    // left to the fuzz:
    // Every pair here is IN the key space — no bound ends in `0` — because a
    // pair that is not has no answer to give at all: `('1', '10')` does not
    // throw, it does not return, it loops (verified while writing this case; a
    // first version of this list contained it and hung the suite rather than
    // failing it). Naming out-of-space pairs here would be testing a hang.
    const prefixAdjacent: [string, string][] = [
      ['a', 'ab'],
      ['a', 'a1'],
      ['001', '0011'],
      ['zz', 'zz1'],
      ['1', '11'],
      ['0i', '0i1'],
    ];
    for (const [lo, hi] of prefixAdjacent) {
      const mid = rankBetween(lo, hi);
      expect(lo < mid && mid < hi).toBe(true);
      expect(isRankKey(mid)).toBe(true);
    }
    // ...and the same guarantee over keys the producers actually emit, walking
    // the descent corridor rather than sampling one call.
    let a = rankBetween(null, null);
    const b = rankBetween(a, null);
    expect(isRankKey(a)).toBe(true);
    for (let i = 0; i < 300; i += 1) {
      const m = rankBetween(a, b);
      expect(isRankKey(m)).toBe(true);
      a = m;
    }
  });

  it('isRankKey refuses a TRAILING ZERO, and every key it accepts has room below it', () => {
    // The key space's own rule: a trailing `0` is unorderable (see the block
    // docblock). Every producer obeys it — `rankBetween` appends a midpoint
    // digit that is always >= 1 — so the only way one arrives is through a
    // hand-written claim, which is what the door refuses.
    expect(isRankKey('a0')).toBe(false);
    expect(isRankKey('0')).toBe(false);
    expect(isRankKey('a0b')).toBe(true);
    // The positive control: the keys the producers actually emit are accepted,
    // so the refusal above is about the trailing zero and not about `0` as a
    // character. `rankBetween(null, 'a1')` returns a key ending in a non-zero
    // digit that may itself contain `0`.
    const below = rankBetween(null, 'a1');
    expect(isRankKey(below)).toBe(true);
    expect(rankBetween(null, below) < below).toBe(true);
  });
});

/** 13.695 — ranked tickets first, in key order; unranked after them, in creation order. */
describe('13.695 compareByRank: ranked first (by key), unranked after (by ticketId)', () => {
  const r = (rank: string | null, ticketId: string) => ({ rank, ticketId });
  it('ranked before unranked, whatever the ids say', () => {
    expect(compareByRank(r('n', '01ZZZ'), r(null, '01AAA'))).toBeLessThan(0);
  });
  it('two ranked: by key', () => {
    expect(compareByRank(r('a', '01ZZZ'), r('b', '01AAA'))).toBeLessThan(0);
  });
  it('two unranked: by ticketId ascending (ULID = creation order)', () => {
    expect(compareByRank(r(null, '01AAA'), r(null, '01BBB'))).toBeLessThan(0);
  });
  it('sort is stable for equal keys (falls back to ticketId)', () => {
    expect(compareByRank(r('a', '01AAA'), r('a', '01BBB'))).toBeLessThan(0);
  });
});
