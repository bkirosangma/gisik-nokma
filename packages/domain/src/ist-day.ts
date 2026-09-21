import { ISO_DATETIME_REGEX, isRealCalendarDatetime } from './envelope.js';

/**
 * Where a day starts, for the whole product.
 *
 * Owner decision (coordination doc, "time is Asia/Kolkata"): day boundaries are
 * IST. `dueDate`/`startDate` are day claims, so "due today", "overdue", which
 * calendar cell a claim falls in, and how many days a ticket has been in flight
 * all depend on this and on nothing else — not the server's locale, not the
 * viewer's device.
 *
 * India Standard Time is UTC+05:30 and has NO daylight saving: the offset is
 * fixed by law (IST is defined against the 82°30'E meridian and has been a
 * single, unchanging offset since 1945), not an assumption that happens to hold
 * today. That is why this module does constant-offset arithmetic and pulls in no
 * date library and no timezone database — there is no rule to look up.
 */
export const IST_TIME_ZONE = 'Asia/Kolkata';

/** +05:30, in minutes. Fixed by law; not derived from any runtime clock. */
export const IST_OFFSET_MINUTES = 330;

const MS_PER_MINUTE = 60_000;
const MS_PER_DAY = 86_400_000;

/**
 * A day claim: `YYYY-MM-DD`, the shape `dueDate`/`startDate` carry.
 *
 * SHAPE only. `2026-02-30`, `2026-13-45` and `0000-00-00` all match; whether a
 * day EXISTS is `isRealIstDay` below, and a door that admits a day claim asks
 * both (E6-19).
 */
export const IST_DAY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The IST calendar day an absolute instant falls in.
 *
 * Reads the instant, never the label: '2026-08-20T14:30:00.000+05:30' and
 * '2026-08-20T09:00:00.000Z' are the same moment and yield the same day.
 * The 18:29:59Z / 18:30:00Z pair straddles the boundary — one is 2026-08-20,
 * the other 2026-08-21.
 */
export function istDayOf(instant: string): string {
  if (!ISO_DATETIME_REGEX.test(instant)) {
    throw new RangeError(
      `not an ISO 8601 instant with a stated offset: ${instant} — a day claim is not an instant`,
    );
  }
  const ms = Date.parse(instant);
  // Date.parse alone accepts day-of-month overflow (e.g. 2026-02-30) and rolls
  // it into a later, different instant instead of rejecting it — the same
  // failure envelope.ts's clientTime/serverTime validation already closes.
  // Reusing isRealCalendarDatetime here means "this instant does not exist"
  // has one answer and one error path, not a looser one at the day boundary.
  if (Number.isNaN(ms) || !isRealCalendarDatetime(instant)) {
    throw new RangeError(`not a real calendar instant: ${instant}`);
  }
  return formatUtcDay(new Date(ms + IST_OFFSET_MINUTES * MS_PER_MINUTE));
}

/**
 * The half-open UTC interval [startUtc, endUtc) covering one IST day.
 * `startUtc` is IST midnight of `day`; `endUtc` is IST midnight of the next day
 * and is NOT part of it, so consecutive days chain with no gap and no overlap.
 * Compare a `timestamptz` column with `>= startUtc AND < endUtc`.
 */
export function istDayBounds(day: string): { startUtc: string; endUtc: string } {
  if (!IST_DAY_REGEX.test(day)) {
    throw new RangeError(`not a YYYY-MM-DD day claim: ${day}`);
  }
  const startMs = istDayStartMs(day);
  if (startMs === null) {
    throw new RangeError(`not a real calendar day: ${day}`);
  }
  return { startUtc: new Date(startMs).toISOString(), endUtc: new Date(startMs + MS_PER_DAY).toISOString() };
}

/**
 * Is this a day a calendar has — one `istDayBounds` can place?
 *
 * The one definition of "real" for a day claim, shared by the write doors
 * (`dueDateValueSchema` for the two built-ins, the rule engine's custom
 * `date` arm) and by `istDayBounds`, so the door cannot admit a day the
 * bounds function then throws on. Before this (E6-19, 2026-09-21) the doors
 * checked `IST_DAY_REGEX` alone: `2026-02-30`, `2026-13-45` and `0000-00-00`
 * committed as due dates, the attention strip compared them as strings and
 * said "Needed by 0000-00-00 — due within 7 days", and the notifications
 * sweep repeated the sentence in the inbox and the mail.
 *
 * "Real" is the round trip `istDayBounds` has always made — `Date.UTC`, then
 * `istDayOf`, then compare — so it refuses exactly what that function refuses:
 * a month or day-of-month the calendar lacks, and a year below `0100`, which
 * `Date.UTC` reads as `19xx` and so cannot round-trip. The year floor is
 * therefore not a product rule but the placement function's own limit, and
 * the door now agrees with it rather than storing a claim the calendar and
 * the filters throw on. Shape is checked first so a non-day string answers
 * `false` rather than throwing.
 */
export function isRealIstDay(day: string): boolean {
  return IST_DAY_REGEX.test(day) && istDayStartMs(day) !== null;
}

/**
 * IST midnight of `day` as a UTC millisecond instant, or `null` when the day
 * is not one the calendar has. `Date.UTC` silently rolls 2026-02-30 into
 * March and reads 0099 as 1999; round-tripping through `istDayOf` refuses
 * both instead of inventing a day. Expects a string that already matches
 * `IST_DAY_REGEX`.
 */
function istDayStartMs(day: string): number | null {
  const year = Number.parseInt(day.slice(0, 4), 10);
  const month = Number.parseInt(day.slice(5, 7), 10);
  const date = Number.parseInt(day.slice(8, 10), 10);
  const startMs = Date.UTC(year, month - 1, date) - IST_OFFSET_MINUTES * MS_PER_MINUTE;
  if (Number.isNaN(startMs)) {
    return null;
  }
  return istDayOf(new Date(startMs).toISOString()) === day ? startMs : null;
}

/** `YYYY-MM-DD` of a Date's UTC fields — the shifted clock, never the local one. */
function formatUtcDay(shifted: Date): string {
  const year = String(shifted.getUTCFullYear()).padStart(4, '0');
  const month = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const date = String(shifted.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${date}`;
}
