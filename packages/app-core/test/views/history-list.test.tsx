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

describe('3.69 HistoryList — the ledger filtered, never summarised (spec §3)', () => {
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
    // Amended 2026-09-29 by 6.254 (R3 N4): the floor is `Unknown person`, not the id.
    expect(container.querySelector('.gn-history__actor')?.textContent).toBe('Unknown person');
    expect(container.querySelector('.gn-history__actor')?.textContent).not.toBe('');
    expect(container.textContent).not.toContain('system');
  });

  it('renders every event it is given, oldest-first order preserved — filtered, never summarised', () => {
    const earlier: TicketHistoryEvent = { ...SKEWED, id: 'e1', type: 'ticket.created', seq: 1 };
    const { container } = render(<HistoryList events={[earlier, SKEWED]} nameOf={(id) => id} />);
    const types = [...container.querySelectorAll('.gn-history__type')].map((n) => n.textContent);
    // E4-19/E5-8 — the headline is now the SENTENCE. ⚠ `earlier` reuses
    // SKEWED's payload (`{to: 'done'}`), which is the WRONG shape for a
    // `ticket.created` — no `typeId` — so that row falls back to the wire name.
    // That is the fallback working, not this fixture being sloppy: it is the
    // one row here that proves an unreadable payload states the raw type rather
    // than inventing "Created as undefined", and it is asserted as such in
    // 3.179 below rather than left to be read as an accident.
    expect(types).toEqual(['ticket.created', 'Moved to done']);
    // One `<li>` per event, in the order given — still filtered, never merged.
    expect(container.querySelectorAll('.gn-history__event')).toHaveLength(2);
  });

  /**
   * 3.179 / E4-19 + E5-8 — THE MEASURED HISTORY, NARRATED.
   *
   * The defect is reproduced as a fixture rather than described in prose: the
   * six rows the reviewers read on `CCSO-6`, in order — `ticket.created`,
   * `ticket.field_set` three times, `ticket.transitioned`, `visibility.set` —
   * carried the payloads the route already selects, and the tab printed the
   * event type as the headline. Three consecutive rows reading
   * `ticket.field_set`, nothing on any of them saying which field changed or to
   * what.
   *
   * **The load-bearing assertion is not the six strings; it is that the three
   * field rows are DISTINCT.** A `describeEvent` that mapped every
   * `field_set` to the same generic sentence would satisfy a per-row
   * "it narrates" check and still leave the reader unable to tell the rows
   * apart — which is the whole complaint. `new Set(...).size` is what pins it,
   * and it is checked against the raw-count case below it so the set is not
   * trivially satisfied by having three rows.
   *
   * The third field row is the CLEARING claim (`value: null`), and it reads as
   * an act ("Cleared priority") rather than as the not-set em dash the Details
   * tab uses — clearing is something somebody did, and this is the ledger.
   */
  it('3.179 — the six measured CCSO-6 rows narrate, and the three field rows are DISTINCT', () => {
    const rows: TicketHistoryEvent[] = [
      {
        ...SKEWED,
        id: 'e1',
        type: 'ticket.created',
        payload: { typeId: 'task', projectId: 'prj', parentId: null, title: 'HSN codes' },
        seq: 1,
      },
      { ...SKEWED, id: 'e2', type: 'ticket.field_set', payload: { fieldId: 'title', value: 'HSN codes' }, seq: 2 },
      {
        ...SKEWED,
        id: 'e3',
        type: 'ticket.field_set',
        payload: { fieldId: 'dueDate', value: { date: '2026-08-30' } },
        seq: 3,
      },
      { ...SKEWED, id: 'e4', type: 'ticket.field_set', payload: { fieldId: 'priority', value: null }, seq: 4 },
      { ...SKEWED, id: 'e5', type: 'ticket.transitioned', payload: { to: 'doing' }, seq: 5 },
      { ...SKEWED, id: 'e6', type: 'visibility.set', payload: { mode: 'project' }, seq: 6 },
    ];
    const { container } = render(
      <HistoryList
        events={rows}
        nameOf={() => 'Anselma Marak'}
        stateName={(id) => (id === 'doing' ? 'Doing' : id)}
        typeName={(id) => (id === 'task' ? 'Task' : id)}
      />,
    );

    const headlines = [...container.querySelectorAll('.gn-history__type')].map((n) => n.textContent);
    expect(headlines).toEqual([
      'Created as Task',
      'Set title to HSN codes',
      'Set dueDate to 30 Aug 2026',
      'Cleared priority',
      'Moved to Doing',
      'Visibility set to project',
    ]);

    // THE PROPERTY, stated separately from the strings: the three field rows
    // differ. Reverting the headline to `event.type` makes this read
    // `['ticket.field_set']` — size 1 — which is the measured defect exactly.
    const fieldRows = headlines.slice(1, 4);
    expect(fieldRows).toHaveLength(3);
    expect(new Set(fieldRows).size).toBe(3);

    // And the wire names are still on screen, in their own slot, one per row —
    // the reviewers asked for the slug KEPT, and this is where it is kept.
    const slugs = [...container.querySelectorAll('.gn-history__slug')].map((n) => n.textContent);
    expect(slugs).toEqual([
      'ticket.created',
      'ticket.field_set',
      'ticket.field_set',
      'ticket.field_set',
      'ticket.transitioned',
      'visibility.set',
    ]);
  });

  /**
   * 3.180 / E4-19 — THE FALLBACK IS THE WIRE NAME, for an event this file has
   * not learned and for a payload it cannot read.
   *
   * Two different failures, one answer, and the case holds them apart:
   *
   * 1. An UNRECOGNISED TYPE (`ticket.something_new`). A future event type must
   *    render as it always did rather than as a guessed sentence about a claim
   *    nobody described in `history-copy.ts`.
   * 2. A RECOGNISED TYPE WITH AN UNREADABLE PAYLOAD (`ticket.field_set` with no
   *    `fieldId`). The sentence cannot be built, and the honest answer is the
   *    wire name — never "Set undefined to undefined", which reads as a fact
   *    about the ticket.
   *
   * The slug is asserted ABSENT on both rows: when the headline already IS the
   * wire name, a second copy beside it would say nothing that is not said.
   */
  it('3.180 — an unknown event type, and a recognised type with an unreadable payload, both fall back to the wire name', () => {
    const rows: TicketHistoryEvent[] = [
      { ...SKEWED, id: 'e1', type: 'ticket.something_new', payload: { anything: 1 }, seq: 1 },
      { ...SKEWED, id: 'e2', type: 'ticket.field_set', payload: { value: 'orphan' }, seq: 2 },
      { ...SKEWED, id: 'e3', type: 'ticket.field_set', payload: { fieldId: '', value: 'blank id' }, seq: 3 },
    ];
    const { container } = render(
      <HistoryList
        events={rows}
        nameOf={() => 'Anselma Marak'}
        stateName={(id) => id}
        typeName={(id) => id}
      />,
    );

    const headlines = [...container.querySelectorAll('.gn-history__type')].map((n) => n.textContent);
    expect(headlines).toEqual(['ticket.something_new', 'ticket.field_set', 'ticket.field_set']);
    // Nothing invented: no `undefined`, no empty interpolation, no double space.
    for (const headline of headlines) {
      expect(headline).not.toMatch(/undefined|\[object|null/);
      expect(headline).not.toMatch(/\s\s/);
    }
    // No second copy of a name that IS the headline.
    expect(container.querySelectorAll('.gn-history__slug')).toHaveLength(0);
  });

  /**
   * 3.181 / E4-19 — WITH NO RESOLVERS the sentences still narrate, falling back
   * to the raw ids.
   *
   * This is the same floor `nameOf` gives the actor line, and it is asserted
   * rather than assumed because the sheet is not the only caller: a resolver
   * that answers nothing — a workflow read that failed, a ladder that 404'd —
   * must leave a sentence that names the id, never a blank and never an
   * invented name.
   */
  it('3.181 — with no resolvers the sentence still names something, by raw id', () => {
    const { container } = render(
      <HistoryList
        events={[
          {
            ...SKEWED,
            id: 'e1',
            type: 'ticket.created',
            payload: { typeId: 'task', projectId: 'prj', parentId: null, title: 'x' },
            seq: 1,
          },
          { ...SKEWED, id: 'e2', type: 'ticket.transitioned', payload: { to: 'doing' }, seq: 2 },
          { ...SKEWED, id: 'e3', type: 'ticket.assigned', payload: { assigneeId: 'user_anselma' }, seq: 3 },
        ]}
        nameOf={() => ''}
      />,
    );
    expect(
      [...container.querySelectorAll('.gn-history__type')].map((n) => n.textContent),
    ).toEqual(['Created as task', 'Moved to doing', 'Assigned to Unknown person']);
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
describe('3.70 HistoryList — neither clock moves with the viewer’s laptop', () => {
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
