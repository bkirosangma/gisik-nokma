import { IST_DAY_REGEX } from '@gisik-nokma/domain';

/**
 * Day-string calendar arithmetic: `YYYY-MM-DD` in, `YYYY-MM-DD` out.
 *
 * NOTHING here converts an instant to a day, and nothing here is a statement
 * about UTC. `Date.UTC`/`getUTC*` are used as fixed-offset arithmetic — a way
 * to add seven days to a calendar label without a leap-year table — and the
 * value that goes in is already the day someone claimed. That is why these
 * functions need no timezone: the timezone question was answered before the
 * day reached them, and `test/calendar/clock-free.test.ts` holds them to it by
 * running the whole calendar suite under three zones and by refusing the
 * device-reading getters at the source level.
 *
 * The one place that question IS answered is `istDayOf` in
 * `@gisik-nokma/domain` (owner decision: a day starts at IST midnight). Every
 * instant→day step — the shell computing `today`, the timeline's `anchor`, the
 * inbox rendering a stored `enteredAt` — goes through it. If you find yourself
 * wanting to pass a timestamp into `dateMs` or `isoDate`, call `istDayOf`
 * first: these take days, and a truncated timestamp is not one.
 */
export const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * A grid row is EXACTLY seven days, said in the type rather than in a comment.
 * `string[]` would leave `days[6]` as `string | undefined` at every call site,
 * and the honest handling of that `undefined` — a row with no seventh day —
 * describes a calendar that cannot exist. A tuple removes the question.
 */
export type WeekDays = readonly [string, string, string, string, string, string, string];

/**
 * A day label as a UTC-midnight instant, for arithmetic only.
 *
 * THROWS rather than returning NaN, and the reason is this plan's own subject:
 * NaN propagates through `+`, through `isoDate`, and out the other side as a
 * rendered date — `Invalid Date` in a cell, or worse, a plausible neighbour.
 * The shape check is the domain's single `IST_DAY_REGEX`, never a local copy,
 * and the round-trip afterwards refuses the two days `Date.UTC` invents
 * instead of rejecting: `2026-02-30` (rolled into March) and `0099-01-01`
 * (read as 1999). `istDayBounds` in the domain refuses the same pair the same
 * way — one rule, stated once, applied twice.
 */
export function dateMs(isoDay: string): number {
  if (!IST_DAY_REGEX.test(isoDay)) {
    throw new RangeError(`not a YYYY-MM-DD day: ${isoDay}`);
  }
  const at = new Date(0);
  at.setUTCFullYear(
    Number(isoDay.slice(0, 4)),
    Number(isoDay.slice(5, 7)) - 1,
    Number(isoDay.slice(8, 10)),
  );
  const ms = at.getTime();
  if (Number.isNaN(ms) || isoDate(ms) !== isoDay) {
    throw new RangeError(`not a real calendar day: ${isoDay}`);
  }
  return ms;
}

/** Inverse of `dateMs` — for day-arithmetic results only, never for a clock reading. */
export function isoDate(ms: number): string {
  const at = new Date(ms);
  const year = String(at.getUTCFullYear()).padStart(4, '0');
  const month = String(at.getUTCMonth() + 1).padStart(2, '0');
  const day = String(at.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function addDays(isoDay: string, days: number): string {
  return isoDate(dateMs(isoDay) + days * DAY_MS);
}

export function mondayOnOrBefore(isoDay: string): string {
  const ms = dateMs(isoDay);
  const sinceMonday = (new Date(ms).getUTCDay() + 6) % 7;
  return isoDate(ms - sinceMonday * DAY_MS);
}

/**
 * Monday-start weeks covering the month, padded with adjacent-month days.
 *
 * The bounds are refused rather than coerced: `monthGridWeeks(2026, 13)` would
 * otherwise roll into January 2027 and hand back a grid for a month the caller
 * never asked for, headed by whatever month label the caller printed.
 */
export function monthGridWeeks(year: number, month: number): WeekDays[] {
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    throw new RangeError(`not a calendar month: ${year}-${month}`);
  }
  const firstIso = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-01`;
  // The last day of the month is the day before the first of the next one —
  // day arithmetic, so no month-length table and no leap-year branch.
  const firstOfNext =
    month === 12
      ? `${String(year + 1).padStart(4, '0')}-01-01`
      : `${String(year).padStart(4, '0')}-${String(month + 1).padStart(2, '0')}-01`;
  const lastMs = dateMs(addDays(firstOfNext, -1));
  const weeks: WeekDays[] = [];
  for (
    let weekStart = dateMs(mondayOnOrBefore(firstIso));
    weekStart <= lastMs;
    weekStart += 7 * DAY_MS
  ) {
    weeks.push([
      isoDate(weekStart),
      isoDate(weekStart + DAY_MS),
      isoDate(weekStart + 2 * DAY_MS),
      isoDate(weekStart + 3 * DAY_MS),
      isoDate(weekStart + 4 * DAY_MS),
      isoDate(weekStart + 5 * DAY_MS),
      isoDate(weekStart + 6 * DAY_MS),
    ]);
  }
  return weeks;
}

/**
 * Can this day be PLACED — i.e. does `dateMs` accept it?
 *
 * `IST_DAY_REGEX` admits days that no calendar has (`2026-02-30` rolls into
 * March, `0099-01-01` reads as 1999) and the write path checks nothing
 * stronger, so a stored claim can carry one. A surface that does day
 * ARITHMETIC — the timeline, which turns a claim into a week index — must ask
 * before it computes, because `dateMs` throws and one such claim would
 * otherwise blank the whole view. Surfaces that only COMPARE day strings (the
 * calendar grid) never need this.
 *
 * Implemented as a question to `dateMs` rather than as a second round-trip
 * check: two statements of "what a real day is" are two chances to disagree,
 * and this one must agree with the function that will do the arithmetic.
 */
export function isCalendarDay(isoDay: string): boolean {
  try {
    dateMs(isoDay);
    return true;
  } catch {
    return false;
  }
}
