import { describe, expect, it } from 'vitest';
import { addDays, dateMs, isoDate, mondayOnOrBefore, monthGridWeeks } from '../../src/claims/dates.js';

describe('11.6 (support) monthGridWeeks — the grid rows a bar is clamped into', () => {
  it('covers August 2026 in Monday-start weeks, padded to full rows', () => {
    const weeks = monthGridWeeks(2026, 8);
    expect(weeks[0]![0]).toBe('2026-07-27'); // 1 Aug 2026 is a Saturday
    expect(weeks[0]![5]).toBe('2026-08-01');
    expect(weeks).toHaveLength(6); // 31 Aug is a Monday and opens a sixth row
    expect(weeks[5]![0]).toBe('2026-08-31');
    expect(weeks[5]![6]).toBe('2026-09-06');
    for (const week of weeks) expect(week).toHaveLength(7);
  });

  /**
   * A month that starts ON a Monday and ends ON a Sunday is the one shape a
   * `<=` / `<` slip in the row loop gets wrong in opposite directions: Feb 2027
   * is exactly four rows, and an off-by-one emits three or five.
   */
  it('emits exactly the rows the month occupies — no phantom leading or trailing week', () => {
    const feb2027 = monthGridWeeks(2027, 2); // 1 Feb 2027 is a Monday, 28 Feb a Sunday
    expect(feb2027).toHaveLength(4);
    expect(feb2027[0]![0]).toBe('2027-02-01');
    expect(feb2027[3]![6]).toBe('2027-02-28');
  });

  it('crosses a year boundary in both directions', () => {
    const jan2026 = monthGridWeeks(2026, 1);
    expect(jan2026[0]![0]).toBe('2025-12-29');
    const dec2026 = monthGridWeeks(2026, 12);
    expect(dec2026[dec2026.length - 1]![6]).toBe('2027-01-03');
  });
});

describe('11.6 (support) day helpers — day-string in, day-string out', () => {
  it('addDays crosses months', () => {
    expect(addDays('2026-08-30', 7)).toBe('2026-09-06');
  });
  it('addDays crosses a leap day forwards and backwards', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29');
  });
  it('mondayOnOrBefore is identity on Mondays', () => {
    expect(mondayOnOrBefore('2026-08-31')).toBe('2026-08-31');
    expect(mondayOnOrBefore('2026-08-23')).toBe('2026-08-17'); // a Sunday folds back six days
  });
});

describe('11.6 (support) the arithmetic refuses what it cannot mean', () => {
  it('a month outside 1–12 is refused, never rolled into a neighbouring year', () => {
    expect(() => monthGridWeeks(2026, 13)).toThrow(/not a calendar month/);
    expect(() => monthGridWeeks(2026, 0)).toThrow(/not a calendar month/);
    expect(() => monthGridWeeks(2026.5, 8)).toThrow(/not a calendar month/);
  });

  it('a day that is not a day is refused, never silently NaN', () => {
    expect(() => dateMs('2026-02-30')).toThrow(/not a real calendar day/);
    expect(() => dateMs('not a day')).toThrow(/not a YYYY-MM-DD day/);
    expect(() => addDays('2026-13-01', 1)).toThrow();
  });

  it('a two-digit year stays in the first century — Date.UTC would read it as 1999', () => {
    expect(isoDate(dateMs('0099-01-01'))).toBe('0099-01-01');
  });
});
