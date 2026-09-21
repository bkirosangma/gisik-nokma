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
 * and the round-trip afterwards refuses `2026-02-30`, which the day-setter
 * rolls into 2 March.
 *
 * IT IS NOT THE SAME RULE AS `istDayBounds`, and an earlier version of this
 * block claimed it was — "one rule, stated once, applied twice", naming
 * `0099-01-01` as a second day both refuse. Measured on this branch:
 * `dateMs('0099-01-01')` SUCCEEDS. `istDayBounds` builds its instant with
 * `Date.UTC(99, 0, 1)`, which folds a two-digit year into 1999 and fails its
 * round-trip; `setUTCFullYear(99, 0, 1)` below does NOT fold, and `isoDate`
 * pads the year back to `0099`, so this round-trip agrees and places it. The
 * two functions agree on `2026-02-30` and disagree on `0099-01-01`: TWO rules.
 *
 * Left as a disagreement rather than closed, and the choice is deliberate.
 * Making `dateMs` refuse pre-1000 years would invent a validity rule at a
 * rendering surface that the WRITE path does not have — `IST_DAY_REGEX` admits
 * `0099-01-01`, and until E6-19 (2026-09-21) `dueDateValueSchema` checked
 * nothing stronger; it now refuses what `istDayBounds` cannot place, which
 * includes a year below `0100`, but the ledger is append-only and a claim
 * committed before that stands — so the product would store a claim it then
 * refuses to place, with no migration and nobody's decision behind it. A year-99 claim is placeable, lands far outside
 * any window, and is therefore absent from the timeline the same way any other
 * distant work is. `provenance.ts` already absorbs the domain's stricter
 * refusal in a `try`/`catch` and renders such a day verbatim.
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
 * March); the write path refuses them since E6-19 (2026-09-21), but a claim
 * committed before that, or folded from an older client's outbox, can still
 * carry one, so a stored claim can. A surface that does day
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
