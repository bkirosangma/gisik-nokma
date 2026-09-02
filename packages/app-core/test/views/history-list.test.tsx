import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { IST_CLOCK_NOTE } from '@gisik-nokma/domain';
import type { TicketHistoryEvent } from '../../src/view-types.js';
import { HistoryList } from '../../src/views/history-list.js';

const SKEWED: TicketHistoryEvent = {
  id: '01J9GEVT000000000000000009',
  type: 'ticket.transitioned',
  version: 1,
  payload: { to: 'done' },
  actorId: 'user_anselma',
  origin: 'mobile',
  // Claimed three days before the server heard it — an offline-shaped skew.
  clientTime: '2026-08-16T18:30:00.000Z',
  serverTime: '2026-08-19T10:00:00.000Z',
  seq: 6,
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const IST_OFFSET_MS = 5.5 * 3600 * 1000;

/**
 * '2026-08-16T18:30:00.000Z' → '17 Aug 2026, 00:00 IST', by arithmetic on the
 * UTC instant and a lookup table. No `formatIstInstant`, no `formatDateTime`,
 * no local-zone getter — an expectation reached through the machinery under
 * test agrees with it by construction and would survive the machinery being
 * wrong.
 */
function spellIst(iso: string): string {
  const shifted = new Date(Date.parse(iso) + IST_OFFSET_MS).toISOString();
  const [date, time] = shifted.split('T');
  const [year, month, day] = (date ?? '').split('-');
  return `${Number(day)} ${MONTHS[Number(month) - 1]} ${year}, ${(time ?? '').slice(0, 5)} IST`;
}

describe('HistoryList — the ledger filtered, never summarised (spec §3)', () => {
  /**
   * THE FIXTURE IS WHAT MAKES THIS FALSIFIABLE, so it is asserted rather than
   * assumed. `SKEWED`'s two clocks are three days apart: a surface that showed
   * only the claimed clock and one that showed only the recorded clock print
   * DIFFERENT strings, so either mutation is caught. With clocks seconds apart
   * inside one IST day both mutations print the same text and this whole
   * describe block would kill nothing while still passing.
   */
  it('CONTROL — the fixture straddles: the two clocks render as different strings', () => {
    expect(spellIst(SKEWED.clientTime)).toBe('17 Aug 2026, 00:00 IST');
    expect(spellIst(SKEWED.serverTime)).toBe('19 Aug 2026, 15:30 IST');
    expect(spellIst(SKEWED.clientTime)).not.toBe(spellIst(SKEWED.serverTime));
  });

  it('PLANTED DEFECT: renders BOTH clocks, labelled, even when they disagree by days', () => {
    render(
      <HistoryList
        events={[SKEWED]}
        nameOf={(id) => (id === 'user_anselma' ? 'Anselma Marak' : id)}
      />,
    );
    expect(screen.getByText('claimed (device clock)')).toBeInTheDocument();
    // 18:30:00Z is exactly IST midnight, so the claimed clock reads the 17th.
    expect(screen.getByText('17 Aug 2026, 00:00 IST')).toBeInTheDocument();
    expect(screen.getByText('recorded (server)')).toBeInTheDocument();
    expect(screen.getByText('19 Aug 2026, 15:30 IST')).toBeInTheDocument();
  });

  it('PLANTED DEFECT: neither clock is shown under a bare "when" — the labels are what stop the conflation', () => {
    const { container } = render(<HistoryList events={[SKEWED]} nameOf={() => 'Anselma Marak'} />);
    const labels = [...container.querySelectorAll('.gn-history__clock-label')].map(
      (node) => node.textContent,
    );
    expect(labels).toEqual(['claimed (device clock)', 'recorded (server)']);
    const values = [...container.querySelectorAll('.gn-history__clock-value')].map(
      (node) => node.textContent,
    );
    // Two values, both rendered, and the pair is the pair the event carries.
    expect(values).toEqual([spellIst(SKEWED.clientTime), spellIst(SKEWED.serverTime)]);
  });

  it('says which clock the reader is reading, once, from the domain constant', () => {
    render(<HistoryList events={[SKEWED]} nameOf={() => 'Anselma Marak'} />);
    // A collaborator in another timezone must not have to infer the zone from
    // the numbers. The note is the constant, never a retyped literal.
    expect(screen.getByText(IST_CLOCK_NOTE)).toBeInTheDocument();
  });

  it('names actor, origin and event type on every entry', () => {
    render(<HistoryList events={[SKEWED]} nameOf={() => 'Anselma Marak'} />);
    expect(screen.getByText('ticket.transitioned')).toBeInTheDocument();
    expect(screen.getByText('Anselma Marak')).toBeInTheDocument();
    expect(screen.getByText('from mobile')).toBeInTheDocument();
  });

  it('PLANTED DEFECT: a resolver that answers with nothing still names the actor by id', () => {
    // The provenance floor is a property of THIS surface, not of whoever
    // supplies `nameOf`. A roster that 404'd, or a member since removed, hands
    // back an empty name — and an entry that then rendered blank would turn a
    // person's claim into an anonymous fact. The plan's own fixture passes a
    // `nameOf` that already falls back to the id, so it cannot tell a component
    // that applies `actorLabel` from one that does not.
    const { container } = render(<HistoryList events={[SKEWED]} nameOf={() => ''} />);
    expect(container.querySelector('.gn-history__actor')?.textContent).toBe('user_anselma');
    expect(container.querySelector('.gn-history__actor')?.textContent).not.toBe('');
    expect(container.textContent).not.toContain('system');
  });

  it('renders every event it is given, oldest-first order preserved — filtered, never summarised', () => {
    const earlier: TicketHistoryEvent = { ...SKEWED, id: 'e1', type: 'ticket.created', seq: 1 };
    const { container } = render(<HistoryList events={[earlier, SKEWED]} nameOf={(id) => id} />);
    const types = [...container.querySelectorAll('.gn-history__type')].map((n) => n.textContent);
    expect(types).toEqual(['ticket.created', 'ticket.transitioned']);
  });
});

/**
 * BINDING SEMANTIC. Both clocks are INSTANTS, and the whole reason for printing
 * two of them is that a reader can compare them. A pair rendered in the
 * VIEWER'S zone would still show the same interval while naming two moments
 * that never happened — and two collaborators in different zones comparing
 * notes would be reading two different histories of one ticket.
 *
 * Three ingredients, the shape `my-work.test.tsx` established: a control that
 * the knob really moves, a control that the fixture really straddles a day
 * boundary, and each zone checked against an expectation computed WITHOUT the
 * code under test.
 *
 * ## WHAT THE THREE ZONES CANNOT CATCH TODAY, stated where it is claimed
 *
 * Against the CURRENT implementation this block cannot fail on the zone axis.
 * `formatIstInstant` (`packages/domain/src/clock-skew.ts:51`) does constant
 * +05:30 arithmetic and reads the UTC getters only — `istDayOf` and
 * `formatUtcDay` in `packages/domain/src/ist-day.ts` are the same — so no local
 * zone is consulted anywhere on this path and all three zones render the
 * IDENTICAL string. Measured 2026-09-02: `formatIstInstant` under
 * `Pacific/Kiritimati`, `Asia/Kolkata` and `Pacific/Niue` answered
 * `17 Aug 2026, 00:00 IST` three times, while a `toLocaleString` control in the
 * same run answered three different strings across two different calendar days
 * (`17/8/2026, 8:30:00 am` / `17/8/2026, 12:00:00 am` / `16/8/2026, 7:30:00 am`).
 * The `TZ` control below proves the KNOB moves; it does NOT make these
 * assertions discriminate, and reading it as if it did is the overclaim this
 * paragraph replaces.
 *
 * ## WHAT IT DOES CATCH, and the mutation that proves it
 *
 * It is a REGRESSION GUARD, which is where its teeth are. Swapping the domain
 * renderer for the device's — `formatDateTime` returning
 * `new Date(iso).toLocaleString()` at `packages/app-core/src/provenance.ts:60`
 * (mutation M8) — kills 5 across two files, TWO of them in this block. Measured
 * 2026-09-02: `both clocks render as recorded from every zone` dies with
 * `zone Pacific/Kiritimati: expected [ '17/8/2026, 8:30:00 am', …(1) ] to deeply
 * equal [ '17 Aug 2026, 00:00 IST', …(1) ]`, and `no zone slides the claimed
 * clock off the day it claims` with `zone Pacific/Kiritimati: expected
 * '17/8/2026, 8:30:00 am' to match /^17 Aug 2026, /`. (The other three kills sit
 * outside this block — two in the describe above and one in
 * `ticket-sheet.test.tsx` — and two of those three read `Unable to find an
 * element with the text: 17 Aug 2026, 00:00 IST`.) The day such a formatter is
 * written back in,
 * the zones start discriminating and these cases are the ones that say so.
 */
describe('HistoryList — neither clock moves with the viewer’s laptop', () => {
  const ZONES = ['Pacific/Kiritimati', 'Asia/Kolkata', 'Pacific/Niue'] as const;

  function clocksUnder(zone: string): string[] {
    const original = process.env['TZ'];
    process.env['TZ'] = zone;
    try {
      const view = render(<HistoryList events={[SKEWED]} nameOf={() => 'Anselma Marak'} />);
      const values = [...view.container.querySelectorAll('.gn-history__clock-value')].map(
        (node) => node.textContent ?? '',
      );
      view.unmount();
      return values;
    } finally {
      // The delete-when-unset restore: `= undefined` assigns the string
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

  it('CONTROL — a naive local rendering of the claimed clock really would land on a different day', () => {
    // Kiritimati is a fixed +14 and Niue a fixed −11. 18:30Z on the 16th is
    // 08:30 on the 17th in Kiritimati and 07:30 on the SIXTEENTH in Niue.
    // Computed by arithmetic, not by the TZ database and not by anything under
    // test — this is what makes the three-zone comparison below a test.
    const naivePageAt = (offsetHours: number) =>
      new Date(Date.parse(SKEWED.clientTime) + offsetHours * 3600 * 1000).toISOString().slice(0, 10);
    expect(naivePageAt(14)).toBe('2026-08-17');
    expect(naivePageAt(-11)).toBe('2026-08-16');
    expect(naivePageAt(14)).not.toBe(naivePageAt(-11));
  });

  it('PLANTED DEFECT: both clocks render as recorded from every zone, each checked alone', () => {
    const expected = [spellIst(SKEWED.clientTime), spellIst(SKEWED.serverTime)];
    for (const zone of ZONES) {
      expect(clocksUnder(zone), `zone ${zone}`).toEqual(expected);
    }
  });

  it('PLANTED DEFECT: and no zone slides the claimed clock off the day it claims', () => {
    for (const zone of ZONES) {
      expect(clocksUnder(zone)[0], `zone ${zone}`).toMatch(/^17 Aug 2026, /);
      expect(clocksUnder(zone)[0], `zone ${zone}`).not.toContain('16 Aug');
      expect(clocksUnder(zone)[0], `zone ${zone}`).not.toContain('18 Aug');
    }
  });

  it('PLANTED DEFECT: the zone swap hands the worker back exactly the TZ it borrowed', () => {
    const outer = process.env['TZ'];
    try {
      delete process.env['TZ'];
      clocksUnder('Pacific/Niue');
      expect(Object.hasOwn(process.env, 'TZ')).toBe(false);
      expect(process.env['TZ']).toBeUndefined();

      process.env['TZ'] = 'Pacific/Kiritimati';
      clocksUnder('Pacific/Niue');
      expect(process.env['TZ']).toBe('Pacific/Kiritimati');
    } finally {
      if (outer === undefined) delete process.env['TZ'];
      else process.env['TZ'] = outer;
    }
  });
});
