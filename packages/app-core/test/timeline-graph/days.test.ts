import { describe, expect, it } from 'vitest';
import { addDays, chunkStart, dayNumber, dayString, mondayOf } from '../../src/timeline-graph/days.js';

describe('29.303 day arithmetic (infrastructure of the windowed mount)', () => {
  it('round-trips and adds across a month and a leap day', () => {
    expect(dayString(dayNumber('2026-10-03'))).toBe('2026-10-03');
    expect(addDays('2026-02-27', 3)).toBe('2026-03-02');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(dayNumber('2026-10-04') - dayNumber('2026-10-03')).toBe(1);
  });
  it('mondayOf: a Sunday and a Monday; chunkStart is always a Monday and 28-day aligned', () => {
    expect(mondayOf('2026-10-04')).toBe('2026-09-28'); // Sunday
    expect(mondayOf('2026-09-28')).toBe('2026-09-28'); // control: a Monday is its own
    for (const d of ['2026-01-01', '2026-10-03', '2027-03-31']) {
      expect(mondayOf(chunkStart(d))).toBe(chunkStart(d));
      expect((dayNumber(chunkStart(d)) - dayNumber('1970-01-05')) % 28).toBe(0);
      expect(dayNumber(d) - dayNumber(chunkStart(d))).toBeLessThan(28);
      expect(dayNumber(d) - dayNumber(chunkStart(d))).toBeGreaterThanOrEqual(0);
    }
  });
});
