import { istDayOf } from '@gisik-nokma/domain';
import { describe, expect, it } from 'vitest';
import { classifyDue } from '../../src/routes/attention.js';

/**
 * NP-06 (audit 2026-10-01): My Work's strip labelled a date long past "Due soon — due within 7
 * days". `classifyDue` is the one place the date is compared with today; pure, so the boundary is
 * pinned here without a database (the route's own ordering and buckets are in `attention.test.ts`).
 */

const TODAY = '2026-10-02';
const HORIZON = '2026-10-09';

describe('21.242 a date in the past is overdue, with its own words; a date in 3 days is still due soon', () => {
  it('21.242 2026-08-17 read on 2026-10-02 is overdue with "was due 17 Aug (46 days ago)"; CONTROL: 2026-10-05 is due soon with "due 5 Oct (in 3 days)"', () => {
    expect(classifyDue('2026-08-17', TODAY, HORIZON)).toEqual({
      kind: 'overdue',
      days: 46,
      reason: 'was due 17 Aug (46 days ago)',
    });
    expect(classifyDue('2026-10-05', TODAY, HORIZON)).toEqual({
      kind: 'due-soon',
      days: 3,
      reason: 'due 5 Oct (in 3 days)',
    });
    // a date outside the horizon is neither; a date in another year carries its year
    expect(classifyDue('2026-10-10', TODAY, HORIZON)).toBeNull();
    expect(classifyDue('2025-12-31', TODAY, HORIZON)?.reason).toBe('was due 31 Dec 2025 (275 days ago)');
  });
});

describe('21.243 the boundary: today is due soon, yesterday is overdue (IST)', () => {
  it('21.243 due today → due soon "(today)", due yesterday → overdue "(yesterday)", due tomorrow → "(tomorrow)", due on the horizon → due soon', () => {
    expect(classifyDue(TODAY, TODAY, HORIZON)).toEqual({ kind: 'due-soon', days: 0, reason: 'due 2 Oct (today)' });
    expect(classifyDue('2026-10-01', TODAY, HORIZON)).toEqual({
      kind: 'overdue',
      days: 1,
      reason: 'was due 1 Oct (yesterday)',
    });
    expect(classifyDue('2026-10-03', TODAY, HORIZON)?.reason).toBe('due 3 Oct (tomorrow)');
    expect(classifyDue(HORIZON, TODAY, HORIZON)?.kind).toBe('due-soon');
  });

  it('21.243 "today" is the INDIAN day: at 18:29Z on the 1st it is still the 1st, one minute later it is the 2nd', () => {
    const before = istDayOf('2026-10-01T18:29:59.999Z');
    const after = istDayOf('2026-10-01T18:30:00.000Z');
    expect(before).toBe('2026-10-01');
    expect(after).toBe('2026-10-02');
    // the same claim (due 2026-10-01) flips from due-soon to overdue across that instant
    expect(classifyDue('2026-10-01', before, '2026-10-08')?.kind).toBe('due-soon');
    expect(classifyDue('2026-10-01', after, '2026-10-09')?.kind).toBe('overdue');
  });
});
