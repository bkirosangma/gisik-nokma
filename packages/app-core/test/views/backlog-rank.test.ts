import { describe, expect, it } from 'vitest';
import { moveTarget, neighboursFor, sortByRank, type RankRow } from '../../src/views/backlog-rank.js';

/**
 * 13.707 — the Backlog tab's rank arithmetic, pure and headless.
 *
 * Every case here names, in its own body, the production change that would
 * make it fail. That is deliberate and it is this file's whole value: the
 * three helpers are small enough to look obviously right while returning a
 * key that is merely *plausible*, and `rankBetween` will happily hand back a
 * key that is sorted wrongly in exactly one direction (it only throws when
 * `before >= after`, so a swapped pair that happens to still compare the
 * right way round passes silently). A test that asserted a LITERAL key could
 * not tell those apart; every assertion below is therefore about ORDER and
 * ABOUT WHICH ROW'S KEY, never about a key's spelling.
 */

function r(ticketId: string, rank: string | null): RankRow {
  return { ticketId, rank };
}

/**
 * The fixture the whole file turns on: two ranked rows and one unranked, in
 * rank order. `C` is the unranked one, and it is LAST — which is the case the
 * plan calls out, because "place last" then has no key of its own to sit
 * after and must fall back to the last RANKED row's key.
 */
const SORTED: RankRow[] = [r('A', 'g'), r('B', 'n'), r('C', null)];

describe('13.707 sortByRank — ranked first in rank order, unranked last by id', () => {
  it('orders by rank key, not by the order the rows arrived in', () => {
    // KILLS: returning `rows` unchanged, or sorting by ticketId. The input
    // below is in NO useful order (C, B, A) while the answer is A, B, C —
    // and it is both the rank order and the id order, so a `sortByRank` that
    // ignored `rank` entirely would still pass THIS case. The next one is the
    // one that separates them.
    expect(sortByRank([r('C', null), r('B', 'n'), r('A', 'g')]).map((x) => x.ticketId)).toEqual(['A', 'B', 'C']);
  });

  it('PLANTED DEFECT: rank order and id order DISAGREE, and rank wins', () => {
    // KILLS: sorting by `ticketId`. Here the ids run opposite to the ranks:
    // 'g' < 'n' while 'z' > 'a'. Sorting by id gives ['a','z']; sorting by
    // rank gives ['z','a']. Only the rank answer is correct, so this case
    // cannot be passed by a helper that never looks at `rank`.
    expect(sortByRank([r('a', 'n'), r('z', 'g')]).map((x) => x.ticketId)).toEqual(['z', 'a']);
  });

  it('PLANTED DEFECT: every unranked row sorts after every ranked row', () => {
    // KILLS: treating `null` as the empty string, or as a low sentinel that
    // sorts first. An unranked row sorts LAST however its id reads — here the
    // unranked id 'a' is textually below the ranked id 'z', so a helper that
    // compared the two as strings would put 'a' first and fail.
    expect(sortByRank([r('a', null), r('z', 'g')]).map((x) => x.ticketId)).toEqual(['z', 'a']);
  });

  it('breaks ties among unranked rows by ticket id, deterministically', () => {
    // KILLS: an unstable comparator, or `return 0` for two unranked rows —
    // which leaves the order to the input and makes the tab's row order
    // depend on the server's answer order. Two unranked rows must not reorder
    // between renders.
    expect(sortByRank([r('z', null), r('a', null)]).map((x) => x.ticketId)).toEqual(['a', 'z']);
    expect(sortByRank([r('a', null), r('z', null)]).map((x) => x.ticketId)).toEqual(['a', 'z']);
  });

  it('is a permutation — it never drops or duplicates a row', () => {
    // KILLS: a filter-shaped mistake in a sort helper. The count and the set
    // are asserted, not the order.
    const out = sortByRank([r('C', null), r('A', 'g'), r('B', 'n')]);
    expect(out).toHaveLength(3);
    expect([...out].map((x) => x.ticketId).sort()).toEqual(['A', 'B', 'C']);
  });
});

describe('13.707 neighboursFor — the pair `rankBetween` is handed', () => {
  it('dropping before a row reads that row\'s key as `after`, and the key above it as `before`', () => {
    // KILLS: the swapped return `{ before: after, after: before }` — the
    // plan's own mutation. B is the second row, so `before` is A's key 'g'
    // and `after` is B's key 'n'; the swap hands `rankBetween('n', 'g')` its
    // two neighbours backwards, which THROWS (n >= g) rather than silently
    // mis-sorting, and this assertion catches it either way.
    expect(neighboursFor(SORTED, 'C', 'B')).toEqual({ before: 'g', after: 'n' });
  });

  it('dropping before the FIRST row has no `before` — the boundary is a real null, not a sentinel', () => {
    // KILLS: substituting `''` or `'0'` for a missing lower neighbour.
    // `rankBetween(null, after)` builds a key strictly BELOW `after`; passed
    // `''` it is the same thing by luck, but passed any real key it is not —
    // so this case pins the null shape the algorithm branches on.
    expect(neighboursFor(SORTED, 'C', 'A')).toEqual({ before: null, after: 'g' });
  });

  it('placing last sits after the last RANKED row, skipping the unranked tail', () => {
    // KILLS: reading `sorted.at(-1).rank` — the last row (C) is unranked, so
    // that is `null`, and `{ before: null, after: null }` means "the very
    // beginning", i.e. it would move the row to the TOP of the backlog while
    // the pointer sat on the tail zone. The last ranked row is B, 'n'.
    expect(neighboursFor(SORTED, 'C', null)).toEqual({ before: 'n', after: null });
  });

  it('the moved row is excluded from the search when it is not the last ranked row', () => {
    // NOT a kill of the exclusion — see the case below, which is. Measured:
    // with `SORTED`'s A moved last, the last RANKED row among the OTHERS is B
    // ('n') and the last ranked row INCLUDING the moved row is also B, so the
    // expected value is identical with the filter and without it. This case
    // pins the answer; it cannot pin the exclusion.
    expect(neighboursFor(SORTED, 'A', null)).toEqual({ before: 'n', after: null });
  });

  it('PLANTED DEFECT: the moved row is never its own neighbour — on the ONLY fixture that can tell', () => {
    // KILLS: dropping the `filter(row => row.ticketId !== movedId)`, and
    // filtering from the wrong end. The fixture above CANNOT do this job and
    // its comment claimed it could until an independent review ran the mutant
    // and watched every case stay green: with `SORTED`, the last ranked row
    // among the others (B, 'n') and the last ranked row overall (also B) are
    // the same row, so the mutant's answer is indistinguishable.
    //
    // Here they differ. Moving B last in a two-row list: B is the last ranked
    // row, so a search that includes it answers `before: 'n'` — B's OWN key,
    // which `rankBetween('n', null)` would then turn into a key built from the
    // row's own old key. Excluding it gives A's 'g'.
    const two = [r('A', 'g'), r('B', 'n')];
    expect(neighboursFor(two, 'B', null)).toEqual({ before: 'g', after: null });
    // The control in the same run: the SAME list with A moved last, where the
    // two searches agree — so the case above is a fact about the exclusion and
    // not about this fixture being special.
    expect(neighboursFor(two, 'A', null)).toEqual({ before: 'n', after: null });
  });

  it('a `beforeId` whose row is unranked falls back to "after the last ranked row"', () => {
    // KILLS: reading `.rank` off the `beforeId` row without checking it is a
    // string. Dropping before C (unranked) asks for a key below `null`; the
    // honest answer is the same one "place last" gives — after B, the last
    // row that actually has a key.
    expect(neighboursFor(SORTED, 'A', 'C')).toEqual({ before: 'n', after: null });
  });

  it('with nothing ranked at all, both neighbours are null and the key is the midpoint', () => {
    // KILLS: throwing or returning an empty-string neighbour on the empty
    // case. `rankBetween(null, null)` is defined to answer the midpoint
    // precisely so that the first row ranked in a brand-new backlog has a
    // key to take.
    expect(neighboursFor([r('A', null), r('B', null)], 'A', 'B')).toEqual({ before: null, after: null });
    expect(neighboursFor([r('A', null), r('B', null)], 'A', null)).toEqual({ before: null, after: null });
  });

  it('an unknown movedId is not a crash — the neighbours ignore a row that is not in the list', () => {
    // KILLS: an implementation that assumes the row is present (a
    // `findIndex` + `-1` off-by-one would otherwise take the LAST row's key
    // as "the row above"). A stranger id simply has no row to exclude.
    expect(neighboursFor(SORTED, 'ZZ', 'B')).toEqual({ before: 'g', after: 'n' });
  });
});

describe('13.707 moveTarget — where a Move up / Move down button points', () => {
  it('up from the top row is undefined — there is nowhere to go', () => {
    // KILLS: returning the row's own id, or the first row's id, at the edge.
    // `undefined` is what disables the button; `null` would mean "place last"
    // and would teleport the top row to the bottom.
    expect(moveTarget(SORTED, 'A', 'up')).toBeUndefined();
  });

  it('down from the bottom row is undefined — the same edge, the other way', () => {
    expect(moveTarget(SORTED, 'C', 'down')).toBeUndefined();
  });

  it('up is the row directly above, so the move lands before it', () => {
    // KILLS: returning `index - 2` (which would skip a row) or `index`
    // itself (a no-op that reports success).
    expect(moveTarget(SORTED, 'B', 'up')).toBe('A');
  });

  it('down is the row TWO below — "place before it" is how a row moves past one row', () => {
    // KILLS: returning the row directly below (index + 1). Dropping A before
    // B is a NO-OP — A is already there — so a button wired to `index + 1`
    // would ingest an event and change nothing.
    expect(moveTarget(SORTED, 'A', 'down')).toBe('C');
  });

  it('down from the second-to-last row is null — that is "place last", not an edge', () => {
    // KILLS: returning `undefined` here, which would disable the button on a
    // row that can still move. The plan names this case explicitly: the third
    // row does not exist to be moved before, so the target is the tail zone.
    expect(moveTarget(SORTED, 'B', 'down')).toBeNull();
  });

  it('the boundary is between the two cases above, at a two-row list', () => {
    // KILLS: an implementation that only checks `index + 2 < length` and so
    // reports `undefined` for a two-row list's first row, disabling a button
    // that should read "place last". The two rows are the whole list: A can
    // move down (to last), and B cannot.
    expect(moveTarget([r('A', 'g'), r('B', 'n')], 'A', 'down')).toBeNull();
    expect(moveTarget([r('A', 'g'), r('B', 'n')], 'B', 'down')).toBeUndefined();
  });

  it('an unknown movedId has no target in either direction', () => {
    expect(moveTarget(SORTED, 'ZZ', 'up')).toBeUndefined();
    expect(moveTarget(SORTED, 'ZZ', 'down')).toBeUndefined();
  });
});
