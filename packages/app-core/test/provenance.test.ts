import { describe, expect, it } from 'vitest';
import { IST_CLOCK_NOTE } from '@gisik-nokma/domain';
import { actorLabel, formatDate, formatDateTime, formatStateProvenance } from '../src/provenance.js';
import { claim } from './helpers/seed.js';

describe('actorLabel — never anonymous (honesty contract 1)', () => {
  it('prefers the display name', () => {
    expect(actorLabel('user_anselma', 'Anselma Marak')).toBe('Anselma Marak');
  });

  it('PLANTED DEFECT: a null name falls back to the raw id', () => {
    expect(actorLabel('user_anselma', null)).toBe('user_anselma');
  });

  it('PLANTED DEFECT: an undefined name falls back to the raw id', () => {
    expect(actorLabel('user_anselma', undefined)).toBe('user_anselma');
  });

  it('PLANTED DEFECT: a blank name falls back to the raw id', () => {
    expect(actorLabel('user_anselma', '   ')).toBe('user_anselma');
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

  it('PLANTED DEFECT: nameless claims still name the actor by id', () => {
    expect(formatStateProvenance('Done', claim({ actorName: null }))).toBe(
      'marked Done by user_anselma on 19 Aug 2026',
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
