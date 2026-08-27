import { describe, expect, it } from 'vitest';
import { IST_OFFSET_MINUTES, IST_TIME_ZONE, istDayBounds, istDayOf } from '../src/ist-day.js';

describe('istDayOf', () => {
  it('names the zone and the offset once, for everyone', () => {
    expect(IST_TIME_ZONE).toBe('Asia/Kolkata');
    expect(IST_OFFSET_MINUTES).toBe(330);
  });

  it('18:29:59Z is still the same IST day — 23:59:59 IST', () => {
    expect(istDayOf('2026-08-20T18:29:59.000Z')).toBe('2026-08-20');
    expect(istDayOf('2026-08-20T18:29:59.999Z')).toBe('2026-08-20');
  });

  it('18:30:00Z is the NEXT IST day — 00:00:00 IST', () => {
    expect(istDayOf('2026-08-20T18:30:00.000Z')).toBe('2026-08-21');
  });

  it('the one millisecond between them changes the day — the boundary a naive implementation loses', () => {
    expect(istDayOf('2026-08-20T18:29:59.999Z')).not.toBe(istDayOf('2026-08-20T18:30:00.000Z'));
  });

  it('reads the instant, not the label: the same moment stated as +05:30 and as Z lands on one day', () => {
    expect(istDayOf('2026-08-21T00:00:00.000+05:30')).toBe('2026-08-21');
    expect(istDayOf('2026-08-20T18:30:00.000Z')).toBe('2026-08-21');
    expect(istDayOf('2026-08-20T14:30:00.000+05:30')).toBe(istDayOf('2026-08-20T09:00:00.000Z'));
  });

  it('rolls the month and the year at the IST boundary, not the UTC one', () => {
    expect(istDayOf('2026-12-31T18:29:59.999Z')).toBe('2026-12-31');
    expect(istDayOf('2026-12-31T18:30:00.000Z')).toBe('2027-01-01');
    expect(istDayOf('2028-02-28T18:30:00.000Z')).toBe('2028-02-29'); // leap year
    expect(istDayOf('2026-08-31T18:30:00.000Z')).toBe('2026-09-01');
  });

  it('planted defect: refuses a date-only string — a day is not an instant', () => {
    expect(() => istDayOf('2026-08-20')).toThrowError(RangeError);
    expect(() => istDayOf('2026-08-20')).toThrowError(
      'not an ISO 8601 instant with a stated offset: 2026-08-20 — a day claim is not an instant',
    );
  });

  it('planted defect: refuses an unparseable instant, naming it', () => {
    expect(() => istDayOf('yesterday')).toThrowError(RangeError);
    expect(() => istDayOf('yesterday')).toThrowError(
      'not an ISO 8601 instant with a stated offset: yesterday — a day claim is not an instant',
    );
  });

  it('planted defect: refuses an instant with no offset at all — the instant would be a guess', () => {
    expect(() => istDayOf('2026-08-20T18:30:00.000')).toThrowError(RangeError);
    expect(() => istDayOf('2026-08-20T18:30:00.000')).toThrowError(
      'not an ISO 8601 instant with a stated offset: 2026-08-20T18:30:00.000 — a day claim is not an instant',
    );
  });

  it('planted defect: refuses day-of-month overflow instead of silently rolling forward — 2026-02-30 does not exist', () => {
    expect(() => istDayOf('2026-02-30T09:00:00.000Z')).toThrowError(RangeError);
    expect(() => istDayOf('2026-02-30T09:00:00.000Z')).toThrowError(
      'not a real calendar instant: 2026-02-30T09:00:00.000Z',
    );
  });

  it('planted defect: refuses month overflow, naming it — the Date.parse-NaN path', () => {
    expect(() => istDayOf('2026-13-01T00:00:00.000Z')).toThrowError(RangeError);
    expect(() => istDayOf('2026-13-01T00:00:00.000Z')).toThrowError(
      'not a real calendar instant: 2026-13-01T00:00:00.000Z',
    );
  });

  it('accepts 2028-02-29 — 2028 is a leap year, so the calendar gate refuses only unreal dates', () => {
    expect(istDayOf('2028-02-29T09:00:00.000Z')).toBe('2028-02-29');
  });
});

describe('istDayBounds', () => {
  it('a day runs from IST midnight to IST midnight, expressed in UTC', () => {
    expect(istDayBounds('2026-08-20')).toEqual({
      startUtc: '2026-08-19T18:30:00.000Z',
      endUtc: '2026-08-20T18:30:00.000Z',
    });
  });

  it('the interval is half-open: startUtc is inside the day, endUtc is the next day', () => {
    const { startUtc, endUtc } = istDayBounds('2026-08-20');
    expect(istDayOf(startUtc)).toBe('2026-08-20');
    expect(istDayOf(new Date(Date.parse(endUtc) - 1).toISOString())).toBe('2026-08-20');
    expect(istDayOf(endUtc)).toBe('2026-08-21');
  });

  it('round-trips: every day in a year maps to bounds that map back to that day', () => {
    let cursor = Date.parse('2026-01-01T00:00:00.000Z');
    const end = Date.parse('2027-01-01T00:00:00.000Z');
    let checked = 0;
    while (cursor < end) {
      const day = istDayOf(new Date(cursor).toISOString());
      const { startUtc, endUtc } = istDayBounds(day);
      expect(istDayOf(startUtc)).toBe(day);
      // India has no daylight saving: every day is exactly 24h, no exceptions.
      expect(Date.parse(endUtc) - Date.parse(startUtc)).toBe(86_400_000);
      // Days chain with no gap and no overlap.
      expect(istDayBounds(istDayOf(endUtc)).startUtc).toBe(endUtc);
      cursor += 86_400_000;
      checked += 1;
    }
    expect(checked).toBe(365);
  });

  it('handles the leap day', () => {
    expect(istDayBounds('2028-02-29').startUtc).toBe('2028-02-28T18:30:00.000Z');
  });

  it('planted defect: refuses a non-YYYY-MM-DD day, naming it', () => {
    expect(() => istDayBounds('2026-8-20')).toThrowError(RangeError);
    expect(() => istDayBounds('2026-8-20')).toThrowError('not a YYYY-MM-DD day claim: 2026-8-20');
    expect(() => istDayBounds('20-08-2026')).toThrowError(RangeError);
    expect(() => istDayBounds('20-08-2026')).toThrowError('not a YYYY-MM-DD day claim: 20-08-2026');
  });

  it('planted defect: refuses an instant where a day claim belongs', () => {
    expect(() => istDayBounds('2026-08-20T00:00:00.000Z')).toThrowError(RangeError);
    expect(() => istDayBounds('2026-08-20T00:00:00.000Z')).toThrowError(
      'not a YYYY-MM-DD day claim: 2026-08-20T00:00:00.000Z',
    );
  });

  it('planted defect: refuses a well-formed but unreal calendar day instead of silently rolling it forward', () => {
    expect(() => istDayBounds('2026-02-30')).toThrowError(RangeError);
    expect(() => istDayBounds('2026-02-30')).toThrowError('not a real calendar day: 2026-02-30');
    expect(() => istDayBounds('2026-13-01')).toThrowError(RangeError);
    expect(() => istDayBounds('2026-13-01')).toThrowError('not a real calendar day: 2026-13-01');
  });
});
