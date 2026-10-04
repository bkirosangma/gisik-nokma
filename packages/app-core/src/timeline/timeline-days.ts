import { DAY_MS, dateMs, isoDate } from '../claims/dates.js';

/**
 * An IST calendar day as a day NUMBER: days since 1970-01-01, the unit `@gisik-nokma/viewport` counts in
 * (a Monday is a number that is 4 mod 7). `dateMs` reads the claimed day as a plain UTC date, so the division is
 * exact and `Math.round` only absorbs float noise. A string that is not a real day throws `RangeError`, like `dateMs`.
 *
 * Clock-free like everything under `src/timeline`: it converts a day someone claimed and never reads the device.
 */
export function dayNumberOf(isoDay: string): number {
  return Math.round(dateMs(isoDay) / DAY_MS);
}

/** The inverse: a day number back to its `YYYY-MM-DD` day. */
export function isoDayOf(dayNumber: number): string {
  return isoDate(dayNumber * DAY_MS);
}
