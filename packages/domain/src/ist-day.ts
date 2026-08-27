import { ISO_DATETIME_REGEX } from './envelope.js';

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

/** A day claim: `YYYY-MM-DD`, the shape `dueDate`/`startDate` carry. */
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
  if (Number.isNaN(ms)) {
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
  const year = Number.parseInt(day.slice(0, 4), 10);
  const month = Number.parseInt(day.slice(5, 7), 10);
  const date = Number.parseInt(day.slice(8, 10), 10);
  const startMs = Date.UTC(year, month - 1, date) - IST_OFFSET_MINUTES * MS_PER_MINUTE;
  if (Number.isNaN(startMs)) {
    throw new RangeError(`not a real calendar day: ${day}`);
  }
  const startUtc = new Date(startMs).toISOString();
  // Date.UTC silently rolls 2026-02-30 into March and reads 0099 as 1999.
  // Round-tripping through istDayOf refuses both instead of inventing a day.
  if (istDayOf(startUtc) !== day) {
    throw new RangeError(`not a real calendar day: ${day}`);
  }
  return { startUtc, endUtc: new Date(startMs + MS_PER_DAY).toISOString() };
}

/** `YYYY-MM-DD` of a Date's UTC fields — the shifted clock, never the local one. */
function formatUtcDay(shifted: Date): string {
  const year = String(shifted.getUTCFullYear()).padStart(4, '0');
  const month = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const date = String(shifted.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${date}`;
}
