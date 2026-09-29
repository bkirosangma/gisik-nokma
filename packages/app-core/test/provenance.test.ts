import { describe, expect, it } from 'vitest';
import { IST_CLOCK_NOTE, isSystemActor, SYSTEM_ACTOR_AUTO_CLOSE } from '@gisik-nokma/domain';
import { actorLabel, formatDate, formatDateTime, formatStateProvenance } from '../src/provenance.js';
import { claim } from './helpers/seed.js';

describe('actorLabel — never anonymous (honesty contract 1)', () => {
  it('prefers the display name', () => {
    expect(actorLabel('user_anselma', 'Anselma Marak')).toBe('Anselma Marak');
  });

  // Amended 2026-09-29 by 6.254 (R3 N4): the floor is `Unknown person`, not the id.
  it('PLANTED DEFECT: a null name falls back to Unknown person, never the raw id', () => {
    expect(actorLabel('user_anselma', null)).toBe('Unknown person');
  });

  it('PLANTED DEFECT: an undefined name falls back to Unknown person, never the raw id', () => {
    expect(actorLabel('user_anselma', undefined)).toBe('Unknown person');
  });

  it('PLANTED DEFECT: a blank name falls back to Unknown person, never the raw id', () => {
    expect(actorLabel('user_anselma', '   ')).toBe('Unknown person');
  });

  it('PLANTED DEFECT: a nameless claim never renders as the empty string', () => {
    expect(actorLabel('user_anselma', null)).not.toBe('');
  });

  it('PLANTED DEFECT: a nameless claim is never laundered into "system"', () => {
    expect(actorLabel('user_anselma', null).toLowerCase()).not.toContain('system');
  });
});

describe('deterministic date rendering (one zone, named; nothing invented)', () => {
  it('formats an instant as the IST day it falls in', () => {
    expect(formatDate('2026-08-19T10:00:00.000Z')).toBe('19 Aug 2026');
  });

  it('formats a DAY CLAIM as the day it already is — no zone conversion, because it never was an instant', () => {
    expect(formatDate('2026-08-30')).toBe('30 Aug 2026');
  });

  it('formats a datetime in India time and names the clock', () => {
    expect(formatDateTime('2026-08-19T10:05:00.000Z')).toBe('19 Aug 2026, 15:35 IST');
  });

  it('rolls the day at IST midnight, not UTC midnight — the last instant of the IST day', () => {
    expect(formatDateTime('2026-08-20T18:29:59.999Z')).toBe('20 Aug 2026, 23:59 IST');
  });

  it('rolls the day at IST midnight, not UTC midnight — the first instant of the next IST day', () => {
    expect(formatDateTime('2026-08-20T18:30:00.000Z')).toBe('21 Aug 2026, 00:00 IST');
  });

  it('PLANTED DEFECT: an unparseable claim renders as claimed by formatDate', () => {
    expect(formatDate('not-a-date')).toBe('not-a-date');
  });

  it('PLANTED DEFECT: an unparseable claim renders as claimed by formatDateTime', () => {
    expect(formatDateTime('not-a-date')).toBe('not-a-date');
  });

  /**
   * MAP-MISSED ADAPTATION. `2026-02-30` matches IST_DAY_REGEX and `istDayBounds`
   * REFUSES it by throwing (Date.UTC rolls it into March). The plan's formatDate
   * calls istDayBounds unguarded, so the honest "render as claimed" promise
   * became an exception thrown at a rendering surface — worse than the invented
   * date the promise exists to prevent.
   */
  function rendered(value: string): string {
    // A throw IS the defect here, so it is folded into the value the assertion
    // reads: a test that merely died would report a stack, not the property.
    try {
      return formatDate(value);
    } catch (error) {
      return `threw ${String(error)}`;
    }
  }

  it('PLANTED DEFECT: a calendar-impossible day claim renders as claimed, and does not throw', () => {
    expect(rendered('2026-02-30')).toBe('2026-02-30');
  });

  it('PLANTED DEFECT: a day claim istDayBounds cannot round-trip renders as claimed, and does not throw', () => {
    expect(rendered('0099-01-01')).toBe('0099-01-01');
  });

  /**
   * The defect this catches is device-local formatting — toLocaleString,
   * toLocaleDateString, getHours(). Under those, two collaborators reading the
   * same claim read two different times, and neither is the one the ledger
   * recorded. Rendered from two absurd zones, the words must not move; and they
   * must be the IST words, so a formatter that is merely CONSISTENTLY wrong
   * (fixed to UTC, say) fails here too. Split in three because vitest stops at
   * the first failing expect: one assertion each, so each names its own defect.
   */
  function fromZone(zone: string): { at: string; on: string } {
    const original = process.env.TZ;
    try {
      process.env.TZ = zone;
      return {
        at: formatDateTime('2026-08-19T10:05:00.000Z'),
        on: formatDate('2026-08-19T10:05:00.000Z'),
      };
    } finally {
      process.env.TZ = original;
    }
  }

  it('PLANTED DEFECT: a rendered timestamp does not move with the machine that renders it', () => {
    expect(fromZone('Pacific/Kiritimati')).toEqual(fromZone('Pacific/Niue'));
  });

  it('PLANTED DEFECT: and the words it does not move from are the IST words, not merely consistent ones', () => {
    expect(fromZone('Pacific/Kiritimati').at).toBe('19 Aug 2026, 15:35 IST');
  });

  it('PLANTED DEFECT: the same holds for the date half', () => {
    expect(fromZone('Pacific/Niue').on).toBe('19 Aug 2026');
  });

  /** The probe that keeps the two tests above from being vacuous. */
  it('the harness above really can move the ambient zone — otherwise it proves nothing', () => {
    const original = process.env.TZ;
    try {
      process.env.TZ = 'Pacific/Kiritimati';
      const east = new Date('2026-08-19T10:05:00.000Z').toLocaleString();
      process.env.TZ = 'Pacific/Niue';
      const west = new Date('2026-08-19T10:05:00.000Z').toLocaleString();
      expect(east).not.toBe(west);
    } finally {
      process.env.TZ = original;
    }
  });

  it('names the clock from the domain constant, so a surface can say which one it is showing', () => {
    expect(IST_CLOCK_NOTE).toBe('times are shown in Asia/Kolkata');
  });
});

describe('formatStateProvenance — the unfold text', () => {
  it('reads "marked <state> by <who> on <when>" from the server-recorded clock', () => {
    expect(formatStateProvenance('Done', claim())).toBe('marked Done by Anselma Marak on 19 Aug 2026');
  });

  // Amended 2026-09-29 by 6.254 (R3 N4): a nameless claim still names an ACTOR — as Unknown person, not the id.
  it('PLANTED DEFECT: nameless claims still attribute the claim, as Unknown person', () => {
    expect(formatStateProvenance('Done', claim({ actorName: null }))).toBe(
      'marked Done by Unknown person on 19 Aug 2026',
    );
  });

  /**
   * The history view shows both clocks; the unfold text shows ONE, and it is
   * the server's. A claimed clock five hours out would otherwise put a ticket
   * on a day it was never marked on.
   */
  it('PLANTED DEFECT: reads serverTime, not the actor-claimed clientTime', () => {
    expect(
      formatStateProvenance('Done', claim({ clientTime: '2026-08-01T09:58:12.000Z' })),
    ).toBe('marked Done by Anselma Marak on 19 Aug 2026');
  });
});

/**
 * 13.725 — `actorLabel` knows the reserved system actors, and the roster cannot
 * rename one (spec §8.2, second wave 2026-09-18).
 *
 * The auto-close sweep closes tickets under `SYSTEM_ACTOR_AUTO_CLOSE`, and
 * §8.2 fixes what a reader sees for it: the sheet reads "Closed by Auto-close
 * on <date>". `actorLabel` is the ONE join every attribution in the product goes
 * through — the sheet's badge, the field claims, the transition history — so
 * teaching it the system name is what makes that sentence true everywhere at
 * once rather than at the one call site somebody remembered.
 *
 * **The order is the load-bearing part, not the lookup.** System name FIRST,
 * then the roster, then the id. A roster row keyed by this id — impossible
 * through any shipped door, and exactly why the reservation is documented
 * rather than assumed — would otherwise print a person's name over a decision
 * no person made. The middle assertion below is that arm, and it is the reason
 * this is a precedence rule rather than an extra fallback.
 */
describe('13.725 actorLabel knows the reserved system actors; the roster cannot rename one', () => {
  it('names the auto-close actor whether or not a roster name arrives with it', () => {
    expect(actorLabel(SYSTEM_ACTOR_AUTO_CLOSE, null)).toBe('Auto-close');
    // The arm that makes the precedence a rule: a name for this id is REFUSED
    // rather than preferred.
    expect(actorLabel(SYSTEM_ACTOR_AUTO_CLOSE, 'Someone')).toBe('Auto-close');
    // The positive control, through the same call: an ordinary id still takes
    // the roster's name, so the system lookup is a FIRST check and not a
    // replacement for the roster.
    expect(actorLabel('user_anselma', 'Anselma Marak')).toBe('Anselma Marak');
    // And the fallback below it still attributes rather than blanks (honesty
    // contract 1) — as Unknown person, not the id (Amended 2026-09-29 by 6.254 (R3 N4)).
    expect(actorLabel('user_anselma', null)).toBe('Unknown person');
  });

  it('the provenance sentence for a system actor reads as the spec fixes it', () => {
    // `formatStateProvenance` is the unfold text the history view renders, and
    // it goes through the same `actorLabel`. Asserted here because it is the
    // second surface that would otherwise print the raw 26-character id.
    expect(
      formatStateProvenance('Done', claim({ actorId: SYSTEM_ACTOR_AUTO_CLOSE, actorName: null })),
    ).toBe('marked Done by Auto-close on 19 Aug 2026');
  });

  it('isSystemActor is true for the reserved id and false for an ordinary one', () => {
    expect(isSystemActor(SYSTEM_ACTOR_AUTO_CLOSE)).toBe(true);
    expect(isSystemActor('user_anselma')).toBe(false);
    // `Object.prototype` is the reason `SYSTEM_ACTOR_NAMES` is a `Map` rather
    // than an object literal: `'toString' in {}` is true, so an object-backed
    // lookup would answer `true` for a name no product ever reserved.
    expect(isSystemActor('toString')).toBe(false);
  });
});
