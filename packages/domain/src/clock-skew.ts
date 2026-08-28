import type { EventEnvelope } from './envelope.js';
import { ISO_DATETIME_REGEX, isRealCalendarDatetime } from './envelope.js';
import { IST_DAY_REGEX, IST_OFFSET_MINUTES, IST_TIME_ZONE, istDayOf } from './ist-day.js';

/**
 * Spec §5 Clocks: client wall time is recorded as the claim it is; gross skew
 * is flagged against server time, keeping both. Both timestamps are immutable
 * in the envelope, so the flag is DERIVED — deterministic, rebuildable, and
 * identical wherever it is computed (server history endpoint or client render).
 *
 * Both are absolute instants (Plan 1 Task 6: `timestamptz`, re-emitted as ISO
 * 'Z'), which is what makes a subtraction meaningful at all — under the old
 * verbatim-text client_time, '…+05:30' and '…Z' were unequal strings for one
 * moment and this arithmetic would have needed a cast at every call site.
 */
export const GROSS_CLOCK_SKEW_MS = 600_000; // 10 minutes

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** What a surface says beside a printed time, so nobody has to guess the clock. */
export const IST_CLOCK_NOTE = `times are shown in ${IST_TIME_ZONE}`;

/**
 * The ONE way this product prints an absolute instant to a person:
 * '21 Aug 2026, 00:00 IST'.
 *
 * The day component comes from `istDayOf`, so a printed timestamp and the
 * calendar cell the same instant lands in can never disagree — the failure
 * this would otherwise cause is quiet and total: a history line saying
 * "20 Aug" beside a calendar marker on the 21st, with nothing to indicate
 * which one is wrong.
 *
 * The time component is a constant +05:30 shift rather than an Intl lookup,
 * for ist-day.ts's own reason (IST has no daylight saving, so there is no rule
 * to look up) plus one this plan cares about specifically: React Native's
 * Hermes runtime does not reliably ship a full timezone database, and a
 * formatter that silently fell back to the device's zone on mobile would be
 * the offline copy disagreeing with the server about when things happened.
 *
 * Anything that is not a well-formed, real ISO instant is returned verbatim —
 * unparseable, year-extended, calendar-impossible, or merely Date.parse-able
 * without a stated offset. It is someone's claim, however
 * broken; replacing it with a plausible time would be inventing one. A DAY
 * claim is returned verbatim too, and for a sharper reason: `Date.parse`
 * happily accepts '2026-08-20' and calls it midnight UTC, which this function
 * would then print as '20 Aug 2026, 05:30 IST' — a time of day nobody claimed,
 * conjured out of a date. `istDayOf` refuses a date-only string for exactly
 * this reason; a day is not an instant, and neither is it an instant with the
 * hours guessed.
 */
export function formatIstInstant(instant: string): string {
  if (IST_DAY_REGEX.test(instant)) return instant;
  // Guard the INPUT, not the normalised output. Calling istDayOf on
  // `new Date(ms).toISOString()` hands it an already-repaired string, so
  // isRealCalendarDatetime never sees the overflow it exists to catch and
  // '2026-02-30T00:00:00.000Z' prints as '2 Mar 2026' — a date nobody claimed.
  // Checking the caller's own string instead keeps ist-day.ts's rule that
  // "this instant does not exist" has ONE answer, and closes two more holes
  // with it: year-extended strings like '+275760-09-13T00:00:00.000Z' made
  // istDayOf THROW where this function promises verbatim, and a non-ISO but
  // Date.parse-able string like 'Aug 20, 2026' was read in the DEVICE's zone —
  // four zones, four answers, two different calendar days.
  if (!ISO_DATETIME_REGEX.test(instant) || !isRealCalendarDatetime(instant)) return instant;
  const ms = Date.parse(instant);
  if (Number.isNaN(ms)) return instant;
  // Cannot throw: `instant` has just passed the exact two predicates istDayOf
  // itself applies.
  const day = istDayOf(instant);
  const shifted = new Date(ms + IST_OFFSET_MINUTES * 60_000);
  const hours = String(shifted.getUTCHours()).padStart(2, '0');
  const minutes = String(shifted.getUTCMinutes()).padStart(2, '0');
  const [year, month, date] = day.split('-');
  return `${Number(date)} ${MONTH_SHORT[Number(month) - 1]} ${year}, ${hours}:${minutes} IST`;
}

export function clockSkewMs(env: Pick<EventEnvelope, 'clientTime' | 'serverTime'>): number | null {
  const client = Date.parse(env.clientTime);
  const server = Date.parse(env.serverTime);
  if (Number.isNaN(client) || Number.isNaN(server)) return null;
  return client - server;
}

export function hasGrossClockSkew(env: Pick<EventEnvelope, 'clientTime' | 'serverTime'>): boolean {
  const skew = clockSkewMs(env);
  return skew === null || Math.abs(skew) >= GROSS_CLOCK_SKEW_MS;
}
