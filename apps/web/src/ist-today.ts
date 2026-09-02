import { istDayOf } from '@gisik-nokma/domain';

/**
 * The day this shell means by "today" (owner decision 2026-08-20, "time is
 * Asia/Kolkata"). The device supplies the INSTANT — a fact it genuinely owns —
 * and the domain helper turns it into the day; the device's own opinion about
 * which day that is never enters. `toLocaleDateString()` would ring a
 * collaborator's own timezone and `toISOString().slice(0, 10)` would ring
 * yesterday for five and a half hours every night, and both would disagree with
 * the day cells the calendar model already computes in IST.
 *
 * `now` is injected per the plan's DIP constraint, so the tests are facts about
 * named instants rather than guesses about the wall clock.
 *
 * `now().toISOString()` is safe to hand `istDayOf`: it always ends in `Z`, and
 * `ISO_DATETIME_REGEX` (`packages/domain/src/envelope.ts:37`) accepts
 * `(Z|[+-]\d\d:\d\d)`. A `Date` is an instant, so this call cannot throw for
 * any clock the device has.
 */
export function istToday(now: () => Date = () => new Date()): string {
  return istDayOf(now().toISOString());
}
