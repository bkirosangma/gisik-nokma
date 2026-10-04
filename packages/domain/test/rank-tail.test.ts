import { describe, expect, it } from 'vitest';
import { compareByRank, isRankKey, planTailRank, type RankAssignment, type RankedRow } from '../src/rank.js';

const row = (ticketId: string, rank: string | null = null): RankedRow => ({ ticketId, rank });

/** What the ledger would hold after the assignments, in order, and the order it draws. Ids the rows do not have are new. */
function drawn(rows: readonly RankedRow[], assignments: readonly RankAssignment[]): string[] {
  const keys = new Map(assignments.map((a) => [a.ticketId, a.rank]));
  const all = new Map(rows.map((r) => [r.ticketId, r]));
  for (const a of assignments) if (!all.has(a.ticketId)) all.set(a.ticketId, row(a.ticketId));
  return [...all.values()]
    .map((r) => ({ ticketId: r.ticketId, rank: keys.get(r.ticketId) ?? r.rank }))
    .sort(compareByRank)
    .map((r) => r.ticketId);
}

describe('28.192 planTailRank', () => {
  it('backfills the unranked rows in drawn order above the last key, then places the ticket; the ranked rows are not rewritten', () => {
    const rows = [row('B', 'p'), row('A', 'g'), row('D'), row('C')]; // unsorted on purpose
    const plan = planTailRank(rows, ['P']);
    expect(plan.backfill).toEqual([{ ticketId: 'C', rank: 'u' }, { ticketId: 'D', rank: 'x' }]);
    expect(plan.tail).toEqual([{ ticketId: 'P', rank: 'y' }]);
    expect(drawn(rows, [...plan.backfill, ...plan.tail])).toEqual(['A', 'B', 'C', 'D', 'P']);
    expect([...plan.backfill, ...plan.tail].every((a) => isRankKey(a.rank))).toBe(true);
    // CONTROL: the tail key alone draws ABOVE the unranked rows, the defect the backfill removes
    expect(drawn(rows, plan.tail)).toEqual(['A', 'B', 'P', 'C', 'D']);
  });

  it('does not backfill a placed id that is already among the rows, and places a repeated id once', () => {
    const rows = [row('A', 'g'), row('C'), row('P')];
    const plan = planTailRank(rows, ['P', 'P']);
    expect(plan.backfill).toEqual([{ ticketId: 'C', rank: 'q' }]);
    expect(plan.tail).toEqual([{ ticketId: 'P', rank: 'v' }]);
  });

  it('has no backfill when every row has a key, places several ids in the given order, and re-keys a placed id that held one', () => {
    const ranked = [row('A', 'g'), row('B', 'p')];
    // ['Q', 'P'], not ['P', 'Q']: the given order must differ from the sorted order, or a planner that sorted its
    // tail ids would pass.
    expect(planTailRank(ranked, ['Q', 'P'])).toEqual({
      backfill: [],
      tail: [{ ticketId: 'Q', rank: 'u' }, { ticketId: 'P', rank: 'x' }],
    });
    const again = planTailRank([row('P', 'g'), row('A', 'p')], ['P']);
    expect(again.tail).toEqual([{ ticketId: 'P', rank: 'u' }]);
    expect(drawn([row('P', 'g'), row('A', 'p')], again.tail)).toEqual(['A', 'P']);
  });

  it('places an empty project\'s ids i, r, v, and does not touch its input', () => {
    expect(planTailRank([], ['R', 'P', 'Q'])).toEqual({
      backfill: [],
      tail: [{ ticketId: 'R', rank: 'i' }, { ticketId: 'P', rank: 'r' }, { ticketId: 'Q', rank: 'v' }],
    });
    const rows = Object.freeze([Object.freeze(row('B')), Object.freeze(row('A', 'g'))]);
    const snapshot = JSON.stringify(rows);
    planTailRank(rows, ['P']);
    expect(JSON.stringify(rows)).toBe(snapshot);
  });
});
