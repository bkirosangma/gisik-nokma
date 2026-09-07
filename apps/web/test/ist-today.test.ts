import { describe, expect, it } from 'vitest';
import { istToday } from '../src/ist-today.js';

/**
 * 3.85 — cited on the block: `istToday()` answers the IST day an instant falls in and ROLLS at IST midnight, so a late-evening instant is already tomorrow. The block below also pins that the day does not move with the machine that asks, which is what makes this more than a restatement of the runner’s zone.
 */
describe('istToday — the day the shell hands the calendar', () => {
  it('is the IST day the given instant falls in', () => {
    expect(istToday(() => new Date('2026-08-20T12:00:00.000Z'))).toBe('2026-08-20');
  });

  it('PLANTED DEFECT: the day rolls at IST midnight, so a late-evening instant is already tomorrow', () => {
    // 18:29:59.999Z is 23:59 IST on the 20th; one millisecond later is the
    // 21st. `new Date().toISOString().slice(0, 10)` — the obvious wrong
    // answer — reports the 20th for both, and rings yesterday's cell for five
    // and a half hours every night. `toLocaleDateString()` — the other wrong
    // answer — rings whatever day the viewer's laptop believes in.
    expect(istToday(() => new Date('2026-08-20T18:29:59.999Z'))).toBe('2026-08-20');
    expect(istToday(() => new Date('2026-08-20T18:30:00.000Z'))).toBe('2026-08-21');
  });

  it('the default clock is the device clock — no argument still answers a day', () => {
    // The only assertion that exercises the parameter's default. Shape, not
    // value: the value is whatever the machine's clock says, and asserting it
    // would be asserting the wall clock.
    expect(istToday()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

/**
 * ## WHAT THE ZONE LOOP CAN AND CANNOT CATCH, stated where it is claimed
 *
 * Against the CURRENT implementation this block cannot fail on the zone axis,
 * and saying otherwise would be the fourth overclaim of its kind on this
 * branch. `istToday` is `istDayOf(now().toISOString())`; `toISOString` is UTC by
 * definition, and `istDayOf` (`packages/domain/src/ist-day.ts:47`) does constant
 * +05:30 arithmetic and then reads `getUTCFullYear`/`getUTCMonth`/`getUTCDate`
 * only. No local zone is consulted anywhere on the path, so every zone below
 * yields the IDENTICAL string. Measured 2026-09-02: unmutated, `istToday` under
 * `Pacific/Kiritimati`, `Asia/Kolkata` and `Pacific/Niue` answers `2026-08-21`
 * three times and this whole block passes. Under the M2 mutation
 * (`now().toLocaleDateString('en-CA')` — a separate run, not a control living
 * in this file) the first two zones still answered `2026-08-21` and
 * `Pacific/Niue` answered `2026-08-20`: two different calendar days from one
 * instant, which is what the loop is watching for.
 *
 * The CONTROL below proves the TZ knob really moves this process. It does NOT
 * make the zone assertions discriminate, and reading it as if it did is the
 * claim this paragraph exists to refuse.
 *
 * ## WHAT IT DOES CATCH
 *
 * It is a REGRESSION GUARD, and its teeth are the MUTATION. Rewriting
 * `src/ist-today.ts` to `now().toLocaleDateString('en-CA')` — the device's own
 * opinion about which day it is, which is the whole failure this helper exists
 * to prevent — kills 2 in this block (measured 2026-09-02, see the report). The
 * IST-midnight case above is what kills the OTHER wrong answer,
 * `toISOString().slice(0, 10)`, which no zone can see because it does not read
 * a zone either. Two wrong answers, two different guards; neither guard covers
 * the other's.
 */
describe('istToday — the day does not move with the machine that asks', () => {
  const ZONES = ['Pacific/Kiritimati', 'Asia/Kolkata', 'Pacific/Niue'] as const;
  const AT = () => new Date('2026-08-20T18:30:00.000Z');

  function todayUnder(zone: string): string {
    const original = process.env['TZ'];
    process.env['TZ'] = zone;
    try {
      return istToday(AT);
    } finally {
      // The delete-when-unset restore: `= undefined` assigns the STRING
      // "undefined", which ICU resolves to GMT, silently switching every later
      // file in this worker to UTC — and only when TZ was unset, which is the
      // default here and in CI.
      if (original === undefined) delete process.env['TZ'];
      else process.env['TZ'] = original;
    }
  }

  it('CONTROL — setting process.env.TZ really does change what this process thinks local time is', () => {
    const original = process.env['TZ'];
    try {
      process.env['TZ'] = 'UTC';
      const utcHour = new Date(0).getHours();
      process.env['TZ'] = 'Asia/Kolkata';
      const istHour = new Date(0).getHours();
      expect(utcHour).toBe(0);
      expect(istHour).toBe(5);
    } finally {
      if (original === undefined) delete process.env['TZ'];
      else process.env['TZ'] = original;
    }
  });

  it('CONTROL — a device-local rendering of this instant really would land on two different days', () => {
    // Kiritimati is a fixed +14 and Niue a fixed −11. 18:30Z on the 20th is
    // 08:30 on the 21st in Kiritimati and 07:30 on the TWENTIETH in Niue.
    // Computed by arithmetic here, not by the TZ database and not by anything
    // under test — this is what makes the comparison below a test rather than
    // a tautology.
    const naiveDayAt = (offsetHours: number) =>
      new Date(AT().getTime() + offsetHours * 3600 * 1000).toISOString().slice(0, 10);
    expect(naiveDayAt(14)).toBe('2026-08-21');
    expect(naiveDayAt(-11)).toBe('2026-08-20');
    expect(naiveDayAt(14)).not.toBe(naiveDayAt(-11));
  });

  it('PLANTED DEFECT: every zone answers the same IST day, each checked alone', () => {
    for (const zone of ZONES) {
      expect(todayUnder(zone), `zone ${zone}`).toBe('2026-08-21');
    }
  });

  it('PLANTED DEFECT: and no zone slides the day onto the one before it', () => {
    for (const zone of ZONES) {
      expect(todayUnder(zone), `zone ${zone}`).not.toBe('2026-08-20');
    }
  });

  it('PLANTED DEFECT: the zone swap hands the worker back exactly the TZ it borrowed', () => {
    const outer = process.env['TZ'];
    try {
      delete process.env['TZ'];
      todayUnder('Pacific/Niue');
      expect(Object.hasOwn(process.env, 'TZ')).toBe(false);
      expect(process.env['TZ']).toBeUndefined();

      process.env['TZ'] = 'Pacific/Kiritimati';
      todayUnder('Pacific/Niue');
      expect(process.env['TZ']).toBe('Pacific/Kiritimati');
    } finally {
      if (outer === undefined) delete process.env['TZ'];
      else process.env['TZ'] = outer;
    }
  });
});
