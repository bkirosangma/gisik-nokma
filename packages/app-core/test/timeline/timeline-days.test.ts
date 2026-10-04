import { describe, expect, it } from 'vitest';
import { dayNumberOf, isoDayOf } from '../../src/timeline/timeline-days.js';

describe('29.080 a claimed day is a day number', () => {
  it('29.080 1970-01-05 is day 4 and a Monday; the round trip holds across a leap day and a year end; control: a 30th of February is refused, not rounded to a neighbour', () => {
    expect(dayNumberOf('1970-01-01')).toBe(0);
    expect(dayNumberOf('1970-01-05')).toBe(4);
    expect(dayNumberOf('2026-10-05') % 7).toBe(4); // a Monday
    for (const day of ['2024-02-29', '2026-12-31', '2027-01-01', '1999-12-31', '2026-03-29']) {
      expect(isoDayOf(dayNumberOf(day))).toBe(day);
    }
    expect(dayNumberOf('2026-03-01') - dayNumberOf('2026-02-28')).toBe(1);
    expect(dayNumberOf('2024-03-01') - dayNumberOf('2024-02-28')).toBe(2);
    expect(() => dayNumberOf('2026-02-30')).toThrow(RangeError);
  });
});
