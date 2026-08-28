import { describe, expect, it } from 'vitest';
import {
  GROSS_CLOCK_SKEW_MS,
  IST_CLOCK_NOTE,
  clockSkewMs,
  formatIstInstant,
  hasGrossClockSkew,
} from '../src/clock-skew.js';
import { IST_TIME_ZONE, istDayOf } from '../src/ist-day.js';

const SERVER = '2026-08-20T12:00:00.000Z';

describe('clockSkewMs', () => {
  it('is client minus server — positive when the client clock runs ahead', () => {
    expect(clockSkewMs({ clientTime: '2026-08-20T12:00:05.000Z', serverTime: SERVER })).toBe(5000);
    expect(clockSkewMs({ clientTime: '2026-08-20T11:59:55.000Z', serverTime: SERVER })).toBe(-5000);
  });

  it('is null when the client claim is unparseable — flagged, not invented', () => {
    expect(clockSkewMs({ clientTime: 'not-a-date', serverTime: SERVER })).toBeNull();
  });
});

describe('hasGrossClockSkew', () => {
  it('planted defect: an 11-minute skew is gross; 9 minutes is not', () => {
    expect(GROSS_CLOCK_SKEW_MS).toBe(600_000);
    expect(hasGrossClockSkew({ clientTime: '2026-08-20T12:11:00.000Z', serverTime: SERVER })).toBe(true);
    expect(hasGrossClockSkew({ clientTime: '2026-08-20T11:49:00.000Z', serverTime: SERVER })).toBe(true);
    expect(hasGrossClockSkew({ clientTime: '2026-08-20T12:09:00.000Z', serverTime: SERVER })).toBe(false);
  });

  it('an unparseable client time counts as gross — the claim cannot be checked', () => {
    expect(hasGrossClockSkew({ clientTime: 'garbage', serverTime: SERVER })).toBe(true);
  });

  it('the boundary is inclusive: exactly 10 minutes is already gross', () => {
    // The threshold is `>=`. Nothing else in the suite distinguishes `>=` from
    // `>`, so without this line the boundary is free to drift by one whole
    // millisecond-sharp definition of "gross" and no test would notice.
    expect(hasGrossClockSkew({ clientTime: '2026-08-20T12:10:00.000Z', serverTime: SERVER })).toBe(true);
  });
});

describe('formatIstInstant', () => {
  it('prints India time, and the day it prints is the day istDayOf gives', () => {
    expect(formatIstInstant('2026-08-20T12:00:00.000Z')).toBe('20 Aug 2026, 17:30 IST');
    expect(formatIstInstant('2026-08-20T00:00:00.000Z')).toBe('20 Aug 2026, 05:30 IST');
  });

  it('planted defect: the day rolls at IST midnight, not UTC midnight', () => {
    // 18:29:59.999Z is 23:59:59 IST on the 20th; one millisecond later is the
    // 21st. A formatter that printed the UTC day — or the device's day — would
    // put these two on the same date and disagree with the calendar cell the
    // same instant lands in.
    expect(formatIstInstant('2026-08-20T18:29:59.999Z')).toBe('20 Aug 2026, 23:59 IST');
    expect(formatIstInstant('2026-08-20T18:30:00.000Z')).toBe('21 Aug 2026, 00:00 IST');
    // And it agrees with the helper the calendar uses, by construction.
    expect(istDayOf('2026-08-20T18:29:59.999Z')).toBe('2026-08-20');
    expect(istDayOf('2026-08-20T18:30:00.000Z')).toBe('2026-08-21');
  });

  it('reads the instant, not the label — the same moment stated two ways prints once', () => {
    expect(formatIstInstant('2026-08-21T00:00:00.000+05:30')).toBe(formatIstInstant('2026-08-20T18:30:00.000Z'));
  });

  it('an unreadable instant travels verbatim — a time is never invented to fill the gap', () => {
    expect(formatIstInstant('garbage')).toBe('garbage');
  });

  it('planted defect: a DAY claim is not given a time of day', () => {
    // Date.parse('2026-08-20') is midnight UTC, which a naive formatter would
    // print as '20 Aug 2026, 05:30 IST' — an hour and a half nobody claimed.
    expect(formatIstInstant('2026-08-20')).toBe('2026-08-20');
  });

  it('anything that is not a real, well-formed ISO instant travels verbatim', () => {
    // All four of these were silently mishandled while the day was taken from
    // the NORMALISED string instead of the caller's own:
    //   - year-extended instants made istDayOf THROW, where this function
    //     promises verbatim;
    expect(formatIstInstant('+275760-09-13T00:00:00.000Z')).toBe('+275760-09-13T00:00:00.000Z');
    expect(formatIstInstant('-000001-01-01T00:00:00.000Z')).toBe('-000001-01-01T00:00:00.000Z');
    //   - a calendar-impossible date was rolled into a real one, printing
    //     '2 Mar 2026' for a February the 30th nobody can have claimed;
    expect(formatIstInstant('2026-02-30T00:00:00.000Z')).toBe('2026-02-30T00:00:00.000Z');
    //   - and a string with no stated offset was read in the DEVICE's zone.
    //     Measured across four zones it printed 05:30, 00:00 and 12:30 IST on
    //     20 Aug and 15:30 IST on the 19th — four answers, two calendar days.
    //     Returning it verbatim is what makes this assertion the same on every
    //     machine that runs it.
    expect(formatIstInstant('Aug 20, 2026')).toBe('Aug 20, 2026');
  });

  it('names the clock it is showing, from the domain constant and not a literal', () => {
    expect(IST_CLOCK_NOTE).toBe(`times are shown in ${IST_TIME_ZONE}`);
  });
});
