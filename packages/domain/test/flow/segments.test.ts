import { describe, expect, it } from 'vitest';
import { segmentsFor } from '../../src/flow/segments.js';

const planned = [{ pass: 1, start: '2026-10-05', end: '2026-10-07', basis: 'explicit' as const }]; // Part 2's PlannedInterval: `pruned` only when pruned
const ghost = [{ pass: 1, start: '2026-10-08', end: '2026-10-09', basis: 'chained' as const, pruned: true as const }];
// pass 2, not 1: every planned/ghost/period fixture is pass 1, so a stub that took any pass but the resolution's would still pass
const notTaken = { kind: 'not-taken' as const, decisionTicketId: '01HZ0000000000000000000001', outcome: 'Yes', pass: 2 };

describe('29.294 segmentsFor', () => {
  it('29.294 planned bar; open period grows to today; closed period stays; control: moving today moves only the open end', () => {
    expect(segmentsFor({ periods: [], planned, notTaken: null, closedDay: null, today: '2026-10-03' })).toEqual([
      { start: '2026-10-05', end: '2026-10-07', pass: 1, type: 'planned' },
    ]);
    const open = (today: string) =>
      segmentsFor({ periods: [{ start: '2026-10-01', end: null, pass: 1 }], planned, notTaken: null, closedDay: null, today });
    expect(open('2026-10-03').find((s) => s.type === 'actual')).toEqual({ start: '2026-10-01', end: '2026-10-03', pass: 1, type: 'actual' });
    expect(open('2026-10-09').find((s) => s.type === 'actual')?.end).toBe('2026-10-09');
    const closed = (today: string) =>
      segmentsFor({ periods: [{ start: '2026-10-01', end: '2026-10-02', pass: 1 }], planned: [], notTaken: null, closedDay: null, today });
    expect(closed('2026-10-03')).toEqual([{ start: '2026-10-01', end: '2026-10-02', pass: 1, type: 'actual' }]); // the closed period's own end, not a derived one
    expect(closed('2026-10-03')).toEqual(closed('2026-10-20')); // control
  });

  it('29.294 two passes keep both periods, in start order; a period opened today is one day, never negative', () => {
    const two = segmentsFor({
      periods: [{ start: '2026-10-06', end: null, pass: 2 }, { start: '2026-10-01', end: '2026-10-04', pass: 1 }],
      planned: [], notTaken: null, closedDay: null, today: '2026-10-06',
    });
    expect(two.map((s) => [s.pass, s.start, s.end])).toEqual([[1, '2026-10-01', '2026-10-04'], [2, '2026-10-06', '2026-10-06']]);
    // a clock that is a day behind the period's own serverTime never yields end < start
    const skew = segmentsFor({ periods: [{ start: '2026-10-07', end: null, pass: 1 }], planned: [], notTaken: null, closedDay: null, today: '2026-10-06' });
    expect(skew[0]).toMatchObject({ start: '2026-10-07', end: '2026-10-07' });
  });

  it('29.294 Not taken: work stays as actual segments, a never-started ticket is one stub on its close day, ghosts stay; control: no resolution brings the planned bar back and no stub', () => {
    const worked = segmentsFor({ periods: [{ start: '2026-10-01', end: '2026-10-02', pass: 1 }], planned, notTaken, closedDay: '2026-10-04', today: '2026-10-05' });
    expect(worked).toEqual([{ start: '2026-10-01', end: '2026-10-02', pass: 1, type: 'actual' }]); // TG-10: the work stays drawn; no planned, no stub
    const workedWithGhost = segmentsFor({ periods: [{ start: '2026-10-01', end: '2026-10-02', pass: 1 }], planned: [...planned, ...ghost], notTaken, closedDay: '2026-10-04', today: '2026-10-05' });
    expect(workedWithGhost.map((s) => s.type)).toEqual(['actual', 'ghost']);
    expect(segmentsFor({ periods: [], planned: [...planned, ...ghost], notTaken, closedDay: '2026-10-04', today: '2026-10-05' })).toEqual([
      { start: '2026-10-04', end: '2026-10-04', pass: 2, type: 'stub' }, // the stub carries the resolution's pass
      { start: '2026-10-08', end: '2026-10-09', pass: 1, type: 'ghost' },
    ]);
    expect(segmentsFor({ periods: [], planned, notTaken, closedDay: null, today: '2026-10-05' })).toEqual([]); // no close day, no stub
    const freeWorked = segmentsFor({ periods: [{ start: '2026-10-01', end: '2026-10-02', pass: 1 }], planned, notTaken: null, closedDay: null, today: '2026-10-03' });
    expect(freeWorked.map((s) => s.type)).toEqual(['actual', 'planned']); // control
    const free = segmentsFor({ periods: [], planned, notTaken: null, closedDay: '2026-10-04', today: '2026-10-03' });
    expect(free.map((s) => s.type)).toEqual(['planned']); // control: a close day alone makes no stub
    // the served resolution may carry no Decision id (a Decision this viewer cannot see): the stub is the same
    const blind = segmentsFor({ periods: [], planned, notTaken: { ...notTaken, decisionTicketId: null }, closedDay: '2026-10-04', today: '2026-10-05' });
    expect(blind).toEqual([{ start: '2026-10-04', end: '2026-10-04', pass: 2, type: 'stub' }]);
  });

  it('29.294 one start day: actual, then stub, then planned, then ghost, then by pass; Part 3 wire `pruned: false` is a planned bar', () => {
    const day = '2026-10-05';
    const same = segmentsFor({
      periods: [{ start: day, end: '2026-10-06', pass: 2 }, { start: day, end: '2026-10-05', pass: 1 }],
      planned: [
        { pass: 3, start: day, end: '2026-10-09', basis: 'chained', pruned: true },
        { pass: 2, start: day, end: '2026-10-08', basis: 'chained', pruned: true },
        { pass: 1, start: day, end: '2026-10-07', basis: 'explicit' },
      ],
      notTaken: null, closedDay: null, today: '2026-10-10',
    });
    expect(same.map((s) => [s.type, s.pass])).toEqual([['actual', 1], ['actual', 2], ['planned', 1], ['ghost', 2], ['ghost', 3]]);
    // a never-started Not-taken ticket closed on the day a ghost starts: the stub comes first
    const stubFirst = segmentsFor({ periods: [], planned: [{ pass: 1, start: day, end: '2026-10-06', basis: 'chained', pruned: true }], notTaken, closedDay: day, today: day });
    expect(stubFirst.map((s) => s.type)).toEqual(['stub', 'ghost']);
    // FlowNodeRead.planned (Part 3's wire) says `pruned: false` for an ordinary interval: it is a planned bar, not a ghost
    const wire = segmentsFor({ periods: [], planned: [{ pass: 1, start: day, end: '2026-10-07', basis: 'explicit', pruned: false }], notTaken: null, closedDay: null, today: day });
    expect(wire).toEqual([{ start: day, end: '2026-10-07', pass: 1, type: 'planned' }]);
  });
});
