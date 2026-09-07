import { render, screen, waitFor, within } from '@testing-library/react';
// Named import, not the default: `@testing-library/user-event` ships no default
// export that survives `verbatimModuleSyntax` — settled at
// packages/ui/test/components.test.tsx and again in board.test.tsx.
import { userEvent } from '@testing-library/user-event';
import { act, useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_GROUPING,
  DEFAULT_LIST_COLUMNS,
  DEFAULT_VIEW_PREFS,
  type Grouping,
  type ListColumnId,
  type ListRow,
  type ProjectViewPrefs,
  type UserPreferences,
} from '../../src/view-types.js';
import { TicketList, useTicketList } from '../../src/views/ticket-list.js';
import type { GroupLabels } from '../../src/views/list-model.js';
import { createFakeDataSource, type FakeDataSource } from '../helpers/fake-data-source.js';
import { PROJECT, TICKET, WS, claim, listRowSeed } from '../helpers/seed.js';

const LABELS: GroupLabels = {
  epicTitle: (id) => (id === 'epic_reg' ? 'Registrations' : id),
  typeName: (id) => id,
};

const ROWS: ListRow[] = [
  listRowSeed({ ticketId: 'epicA', title: 'Registrations', typeId: 'epic', typeRank: 1 }),
  listRowSeed({
    ticketId: 't2',
    title: 'DLT registration',
    parentId: 'epicA',
    epicId: 'epic_reg',
    stateId: 'doing',
    stateName: 'Doing',
    stateCategory: 'active',
    assignee: { id: 'me', name: 'Kiro' },
    assignedProvenance: claim(),
    dueDate: { date: '2026-08-30', claim: claim({ actorName: 'Kiro', actorId: 'me' }) },
  }),
  listRowSeed({ ticketId: 't3', title: 'Chase the vendor', parentId: 't2', epicId: 'epic_reg' }),
  listRowSeed({
    ticketId: 't5',
    title: 'Done thing',
    stateId: 'done',
    stateName: 'Done',
    stateCategory: 'terminal',
  }),
];

/**
 * A `ProjectViewPrefs` whose BOTH halves the user chose, from plain values.
 *
 * The plain literal `{ columns: [...], grouping: '...' }` no longer typechecks,
 * and that is the point of the type change rather than an inconvenience of it:
 * each half is a `Chosen<T>` whose `default` arm carries NO value, so a fixture
 * has to say who chose what. `chose` is the "the user chose this" spelling;
 * `DEFAULT_VIEW_PREFS` is the "nobody chose either" one; a half-set project is
 * written out longhand at the two tests that are about exactly that.
 */
function chose(columns: ListColumnId[], grouping: Grouping): ProjectViewPrefs {
  return { columns: { origin: 'stored', value: columns }, grouping: { origin: 'stored', value: grouping } };
}

/**
 * `TicketList` is CONTROLLED: `prefs` arrives as a prop and `onPrefsChange`
 * reports upwards. The plan's own harness passes a `vi.fn()` and a frozen
 * `prefs`, so picking a grouping in it changes nothing on screen and the
 * "identical under every grouping" test compares one arrangement with itself
 * five times. This wrapper closes the loop, which is the only way that
 * assertion measures a regrouping at all.
 */
function ControlledList({
  rows = ROWS,
  initial = DEFAULT_VIEW_PREFS,
  // Deliberately NOT defaulted here. Defaulting it in the harness means every
  // test passes the prop explicitly and `TicketList`'s own default is never
  // exercised — measured: flipping that default to `false` killed nothing.
  prefsEditable,
  onOpenTicket = vi.fn(),
  onChange,
  // Undefaulted for the same reason `prefsEditable` is: `TicketList`'s own
  // unnarrowed arm is the one every existing case exercises, and defaulting it
  // here would leave that arm untested by all of them.
  narrowing,
}: {
  rows?: ListRow[];
  initial?: ProjectViewPrefs;
  prefsEditable?: boolean;
  onOpenTicket?: (ticketId: string) => void;
  onChange?: (prefs: ProjectViewPrefs) => void;
  narrowing?: string;
}) {
  const [prefs, setPrefs] = useState(initial);
  return (
    <TicketList
      rows={rows}
      currentUserId="me"
      prefs={prefs}
      prefsEditable={prefsEditable}
      onPrefsChange={(next) => {
        onChange?.(next);
        setPrefs(next);
      }}
      labels={LABELS}
      onOpenTicket={onOpenTicket}
      {...(narrowing === undefined ? {} : { narrowing })}
    />
  );
}

/**
 * 12.384 — A NARROWED LIST MAY NOT WEAR THE PROJECT'S COUNT.
 *
 * `{total} tickets · {terminal} done` is a claim about the PROJECT. Over a filtered
 * set it says the project holds `total` tickets, which is 12.258's defect — a partial
 * list presented as whole — in a new costume. That case is precisely why `getTickets`
 * refuses past the cap instead of serving the pages it already had, so handing the
 * same falsehood back through a filter would return what the refusal was protecting.
 *
 * **Both halves are asserted because either alone passes against a page that is still
 * lying.** A note saying "narrowed" beside the words "12 tickets" leaves the NUMBER
 * claiming to be the project's, and the number is what a person reads first; changing
 * the number without naming the narrowing leaves a reader unable to tell what "12
 * matching" matched. And the unnarrowed control is what stops the fix from being "say
 * `matching` always", which would make every list hedge and none of them informative.
 */
describe('12.384 the summary says when the rows are not the whole project', () => {
  it('narrowed: the count reads `matching`, and the narrowing is named beside it', () => {
    render(<ControlledList narrowing="tickets in progress" />);
    expect(screen.getByTestId('list-summary')).toHaveTextContent('4 matching · 1 done');
    expect(screen.getByTestId('list-narrowing')).toHaveTextContent(
      'narrowed to tickets in progress — not the whole project',
    );
  });

  it('CONTROL: unnarrowed, the count still speaks for the project and no note appears', () => {
    render(<ControlledList />);
    expect(screen.getByTestId('list-summary')).toHaveTextContent('4 tickets · 1 done');
    expect(screen.queryByTestId('list-narrowing')).not.toBeInTheDocument();
  });
});

const ALL_GROUPINGS: Grouping[] = ['epic', 'status', 'assignee', 'type', 'flat'];

describe('3.51 TicketList — Asana-shaped, honest to the row set', () => {
  it('pins Recently assigned at the top with my newest assignment', () => {
    render(<ControlledList />);
    const pinned = screen.getByRole('region', { name: 'Recently assigned' });
    expect(within(pinned).getByText('DLT registration')).toBeInTheDocument();
  });

  it('PLANTED DEFECT: the pin holds MY assignments only — a colleague’s newer claim stays out of it', () => {
    const mine = listRowSeed({
      ticketId: 'mine',
      title: 'Mine to do',
      assignee: { id: 'me', name: 'Kiro' },
      assignedProvenance: claim({ serverTime: '2026-08-01T00:00:00.000Z' }),
    });
    const theirs = listRowSeed({
      ticketId: 'theirs',
      title: 'Anselma’s to do',
      assignee: { id: 'user_anselma', name: 'Anselma Marak' },
      assignedProvenance: claim({ serverTime: '2026-09-01T00:00:00.000Z' }),
    });
    render(<ControlledList rows={[mine, theirs]} initial={chose([], 'flat')} />);
    const pinned = screen.getByRole('region', { name: 'Recently assigned' });
    expect(within(pinned).getByText('Mine to do')).toBeInTheDocument();
    expect(within(pinned).queryByText('Anselma’s to do')).not.toBeInTheDocument();
    // …and it is still IN THE LIST. The pin is a surface, not a filter.
    const section = screen.getByRole('region', { name: 'All tickets' });
    expect(within(section).getByText('Anselma’s to do')).toBeInTheDocument();
  });

  it('PLANTED DEFECT: the summary line is identical under every grouping — arranging truth never changes it', async () => {
    const user = userEvent.setup();
    render(<ControlledList />);
    const summary = () => screen.getByTestId('list-summary').textContent;
    const baseline = summary();
    expect(baseline).toBe('4 tickets · 1 done');
    for (const grouping of ALL_GROUPINGS) {
      await user.selectOptions(screen.getByLabelText('Group by'), grouping);
      expect(screen.getByLabelText('Group by')).toHaveValue(grouping);
      expect(summary(), `grouping=${grouping}`).toBe(baseline);
    }
  });

  /**
   * The summary is a NUMBER; this is the rendering. Every row the view was
   * given appears exactly once ACROSS THE SECTIONS under all five groupings.
   *
   * Scoped to `.gn-list__section` on purpose: *Recently assigned* is an extra
   * surface pinned above, so a document-wide count would report `t2` twice and
   * a reader would conclude the invariant is violated. The pin is measured
   * separately, above.
   */
  it('PLANTED DEFECT: every row renders exactly once across the sections, under every grouping', async () => {
    const user = userEvent.setup();
    const view = render(<ControlledList />);
    const expected = ROWS.map((row) => row.title).sort();
    for (const grouping of ALL_GROUPINGS) {
      await user.selectOptions(screen.getByLabelText('Group by'), grouping);
      const titles = [...view.container.querySelectorAll('.gn-list__section .gn-list__open')]
        .map((node) => node.textContent ?? '')
        .sort();
      expect(titles, `grouping=${grouping}`).toEqual(expected);
    }
  });

  it('renders chosen columns in chosen order, including the attributed due-date claim', () => {
    render(<ControlledList initial={chose(['dueDate', 'status'], 'flat')} />);
    const section = screen.getByRole('region', { name: 'All tickets' });
    const headers = within(section)
      .getAllByRole('columnheader')
      .map((header) => header.textContent);
    expect(headers).toEqual(['Title', 'Due date', 'Status']);
    expect(within(section).getByText("30 Aug 2026 — Kiro's claim")).toBeInTheDocument();
  });

  it('PLANTED DEFECT: a due date is never rendered bare — the claimant travels with it', () => {
    render(<ControlledList initial={chose(['dueDate'], 'flat')} />);
    const section = screen.getByRole('region', { name: 'All tickets' });
    expect(within(section).queryByText('30 Aug 2026')).not.toBeInTheDocument();
  });

  it('collapses a subtree without touching the summary counts', async () => {
    const user = userEvent.setup();
    render(<ControlledList initial={chose(['status'], 'flat')} />);
    expect(screen.getByText('Chase the vendor')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Collapse DLT registration' }));
    expect(screen.queryByText('Chase the vendor')).not.toBeInTheDocument();
    expect(screen.getByTestId('list-summary')).toHaveTextContent('4 tickets · 1 done');
  });

  it('persists grouping and column changes through onPrefsChange', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ControlledList onChange={onChange} />);
    await user.selectOptions(screen.getByLabelText('Group by'), 'status');
    expect(onChange).toHaveBeenCalledWith({
      ...DEFAULT_VIEW_PREFS,
      grouping: { origin: 'stored', value: 'status' },
    });
    await user.click(screen.getByLabelText('Type'));
    // Both halves now `stored`: the user picked the grouping, then touched the
    // columns, and touching a half is what transfers authority over it.
    expect(onChange).toHaveBeenLastCalledWith({
      columns: { origin: 'stored', value: [...DEFAULT_LIST_COLUMNS, 'type'] },
      grouping: { origin: 'stored', value: 'status' },
    });
  });

  it('opens a ticket on title click', async () => {
    const user = userEvent.setup();
    const onOpenTicket = vi.fn();
    render(<ControlledList initial={chose([], 'flat')} onOpenTicket={onOpenTicket} />);
    const section = screen.getByRole('region', { name: 'All tickets' });
    await user.click(within(section).getByRole('button', { name: 'Done thing' }));
    expect(onOpenTicket).toHaveBeenCalledWith('t5');
  });
});

describe('3.152 TicketList — a queued claim is badged on the LIST, not only on the board', () => {
  /**
   * THE ASYMMETRY THIS CLOSES, in `view-types.ts`'s own words: the badge "was on
   * the board and not on the list, and the asymmetry was silent" — an offline
   * list is the surface where a queued claim is most common, so the half that
   * was missing is the half that needed it most. `ListRow.pending` has existed
   * since ruling P30 permitted the widening; nothing rendered it until now
   * (ruling P34, closure 2b).
   *
   * Both directions in ONE render, which is what makes this a measurement
   * rather than a story: a badge wired to render always would fail the second
   * assertion, and one wired to render never would fail the first. A single
   * pending row asserted alone cannot tell those apart.
   */
  it('PLANTED DEFECT: the pending row says "claim in transit" and the settled row beside it does not', () => {
    const rows = [
      listRowSeed({ ticketId: 'q', title: 'Queued thing', pending: true }),
      listRowSeed({ ticketId: 's', title: 'Settled thing', pending: false }),
    ];
    render(<ControlledList rows={rows} initial={chose([], 'flat')} />);

    // Both rows render — the badge annotates a row, it never replaces or hides
    // one, which is the same invariant 3.51 pins for restriction.
    expect(screen.getByText('Queued thing')).toBeInTheDocument();
    expect(screen.getByText('Settled thing')).toBeInTheDocument();

    // Exactly ONE badge, so "the pending row is badged" is a fact about that
    // row rather than about the list rendering a badge somewhere.
    expect(screen.getAllByText('claim in transit')).toHaveLength(1);

    // And it is attached to the right row. `getByRole('row')` scoping is what
    // stops this passing when the badge lands on the settled row instead — the
    // count above would be satisfied either way.
    const settled = screen.getByText('Settled thing').closest('tr');
    expect(settled).not.toBeNull();
    expect(within(settled as HTMLElement).queryByText('claim in transit')).toBeNull();
    const queued = screen.getByText('Queued thing').closest('tr');
    expect(within(queued as HTMLElement).getByText('claim in transit')).toBeInTheDocument();
  });

  it('the badge is the SAME wording the board already uses, so one claim reads one way in both surfaces', () => {
    // Not a style point. A user who sees "claim in transit" on the board and
    // something else on the list has to learn that they mean the same thing;
    // `board.tsx` renders this exact string for `card.pending`, and the two
    // surfaces disagreeing is how the original asymmetry would come back
    // wearing a different shape.
    const rows = [listRowSeed({ ticketId: 'q', title: 'Queued thing', pending: true })];
    render(<ControlledList rows={rows} initial={chose([], 'flat')} />);
    expect(screen.getByText('claim in transit')).toBeInTheDocument();
  });
});

describe('3.51 TicketList — restriction is named, never a vanish (invariant 5)', () => {
  const RESTRICTED_CHILD = listRowSeed({
    ticketId: 'child',
    title: 'Under something I cannot see',
    parentId: 'secret',
    hasRestrictedParent: true,
  });

  it('PLANTED DEFECT: a row whose parent is restricted still renders, and says so', () => {
    render(<ControlledList rows={[RESTRICTED_CHILD]} initial={chose([], 'flat')} />);
    expect(screen.getByText('Under something I cannot see')).toBeInTheDocument();
    expect(screen.getByText('under a restricted parent')).toBeInTheDocument();
  });

  it('PLANTED DEFECT: it is COUNTED too — a hidden parent does not shrink the summary', () => {
    render(<ControlledList rows={[RESTRICTED_CHILD]} initial={chose([], 'flat')} />);
    expect(screen.getByTestId('list-summary')).toHaveTextContent('1 tickets · 0 done');
  });

  /**
   * MEASURED VACUITY, then closed. `ROWS` carries one terminal row and one
   * active row, so a summary counting the wrong category read `1 done` either
   * way. This fixture makes the two numbers differ.
   */
  it('PLANTED DEFECT: the summary’s "done" counts terminal rows only', () => {
    const rows = [
      listRowSeed({ ticketId: 'a1', title: 'Doing one', stateCategory: 'active' }),
      listRowSeed({ ticketId: 'a2', title: 'Doing two', stateCategory: 'active' }),
      listRowSeed({ ticketId: 'd1', title: 'Finished', stateCategory: 'terminal' }),
    ];
    render(<ControlledList rows={rows} initial={chose([], 'flat')} />);
    expect(screen.getByTestId('list-summary')).toHaveTextContent('3 tickets · 1 done');
  });

  it('PLANTED DEFECT: progress keeps the true denominator and names the restricted children', () => {
    const parent = listRowSeed({
      ticketId: 'p',
      title: 'Registrations',
      rollup: { totalChildren: 8, terminalChildren: 5, restrictedCount: 2 },
    });
    render(<ControlledList rows={[parent]} initial={chose(['progress'], 'flat')} />);
    expect(screen.getByText('5 of 8 done · 2 restricted')).toBeInTheDocument();
    // The two deceptive alternatives, refused by name.
    expect(screen.queryByText('5 of 6 done')).not.toBeInTheDocument();
    expect(screen.queryByText('5 of 8 done')).not.toBeInTheDocument();
  });
});

describe('3.53 TicketList — a default arrangement never wears the user’s authority (ruling P24)', () => {
  it('PLANTED DEFECT: says so on screen when the arrangement is this client’s default', () => {
    render(<ControlledList initial={DEFAULT_VIEW_PREFS} />);
    expect(screen.getByTestId('list-prefs-origin')).toHaveTextContent(
      'default arrangement — you have not arranged this project',
    );
  });

  /**
   * The control that makes the assertion above a measurement: the SAME VALUES
   * on screen, chosen instead of defaulted. Nothing a reader could see in the
   * rendered columns or grouping differs between these two tests — only who
   * chose them — so a component that decided the note from the values, or one
   * that showed it always, fails one of the pair.
   */
  it('and says nothing when the arrangement really is the user’s', () => {
    render(<ControlledList initial={chose(DEFAULT_LIST_COLUMNS, DEFAULT_GROUPING)} />);
    expect(screen.queryByTestId('list-prefs-origin')).not.toBeInTheDocument();
    expect(screen.queryByTestId('list-prefs-origin-columns')).not.toBeInTheDocument();
    expect(screen.queryByTestId('list-prefs-origin-grouping')).not.toBeInTheDocument();
  });

  /**
   * RULING P24's OTHER ASYMMETRY, at the surface — the half-set project.
   *
   * The server keeps `listColumns` and `grouping` as two records, so it can hold
   * one and not the other. `mapPreferences` used to fill the missing half with
   * `DEFAULT_VIEW_PREFS`, which is what the ruling forbids in as many words; the
   * half now arrives `{ origin: 'default' }` and the surface names WHICH half
   * nobody chose. The two directions are asserted in the same test so a note
   * that fires for both halves, or for the wrong one, cannot pass.
   */
  /**
   * 3.65 — the surface names WHICH half nobody chose: a half-set project is told "default grouping — you have not chosen a grouping for this project" and stays SILENT about the chosen half. The mirror case below proves neither note is hard-wired to one side.
   */
  it('PLANTED DEFECT: a HALF the user never chose is named as a default, and the chosen half is not', () => {
    render(
      <ControlledList
        initial={{
          columns: { origin: 'stored', value: ['status'] },
          grouping: { origin: 'default' },
        }}
      />,
    );
    expect(screen.getByTestId('list-prefs-origin-grouping')).toHaveTextContent(
      'default grouping — you have not chosen a grouping for this project',
    );
    expect(screen.queryByTestId('list-prefs-origin-columns')).not.toBeInTheDocument();
    // NOT the whole-project sentence: the user HAS arranged this project, half of it.
    expect(screen.queryByTestId('list-prefs-origin')).not.toBeInTheDocument();
  });

  it('PLANTED DEFECT: and the mirror half, so neither note is hard-wired to one side', () => {
    render(
      <ControlledList
        initial={{
          columns: { origin: 'default' },
          grouping: { origin: 'stored', value: 'flat' },
        }}
      />,
    );
    expect(screen.getByTestId('list-prefs-origin-columns')).toHaveTextContent(
      'default columns — you have not chosen columns for this project',
    );
    expect(screen.queryByTestId('list-prefs-origin-grouping')).not.toBeInTheDocument();
    expect(screen.queryByTestId('list-prefs-origin')).not.toBeInTheDocument();
  });

  /**
   * The WRITE half of the same rule: touching one half transfers authority over
   * THAT half and leaves the other's origin alone. Without this, a user who
   * picks a grouping on an unarranged project hands their name to this client's
   * stock columns — and `toServerPreferences` would then store them.
   */
  it('PLANTED DEFECT: choosing one half leaves the other half’s origin untouched', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<ControlledList initial={DEFAULT_VIEW_PREFS} onChange={onChange} />);
    await user.selectOptions(screen.getByLabelText('Group by'), 'status');
    expect(onChange).toHaveBeenCalledWith({
      columns: { origin: 'default' },
      grouping: { origin: 'stored', value: 'status' },
    });
  });

  it('PLANTED DEFECT: the controls are DISABLED, not merely inert, before the document loads', () => {
    render(<ControlledList prefsEditable={false} />);
    expect(screen.getByLabelText('Group by')).toBeDisabled();
    expect(screen.getByLabelText('Status')).toBeDisabled();
  });

  it('and enabled once it has — which is the component’s own default, not the harness’s', () => {
    render(<ControlledList />);
    expect(screen.getByLabelText('Group by')).toBeEnabled();
    expect(screen.getByLabelText('Status')).toBeEnabled();
  });
});

/**
 * ONE CLOCK, and it is not the viewer's laptop. A due date is a DAY CLAIM
 * ('2026-08-30'), which `formatDate` must hand back as the day it already is —
 * no zone maths may invent a time of day for it and then round it to the wrong
 * date. Rendered from two absurd zones the words must not move, AND they must
 * be the IST words, so a formatter that is merely consistently wrong fails too.
 *
 * ## WHAT THE ZONE AXIS CANNOT CATCH TODAY
 *
 * Against the CURRENT implementation the two zones discriminate nothing.
 * `formatDate` sends a day claim through `istDayBounds` and `formatIstInstant`,
 * both of which are constant +05:30 arithmetic over the UTC getters
 * (`packages/domain/src/ist-day.ts`, `packages/domain/src/clock-skew.ts:51`)
 * with no local-zone reader on the path, so every zone renders the same string.
 * Measured 2026-09-02: `formatDate('2026-08-30')` answered `30 Aug 2026` under
 * `Pacific/Kiritimati`, `Asia/Kolkata` and `Pacific/Niue` alike, while a
 * `new Date('2026-08-30').toLocaleDateString()` control in the same run answered
 * `30/8/2026`, `30/8/2026` and `29/8/2026` — the wrong DAY in the third.
 *
 * ## WHAT IT DOES CATCH, and the mutation that proves it
 *
 * These are REGRESSION GUARDS. Replacing `formatDate`'s body with
 * `new Date(value).toLocaleDateString()` (`packages/app-core/src/provenance.ts:27`)
 * kills THREE cases in this block — the +14 case, the −11 case and the
 * day-anchored one. Measured 2026-09-02: `expected '30/8/2026 — Kiro's claim'
 * to be '30 Aug 2026 — Kiro's claim'` from Kiritimati and
 * `expected '29/8/2026 — Kiro's claim' to be '30 Aug 2026 — Kiro's claim'` from
 * Niue — note that the +14 case dies on the SPELLING while only the −11 case
 * dies on the wrong DAY, which is why both zones are kept. That is what they
 * are for.
 */
describe('3.52 TicketList — one clock, named, and not the device’s', () => {
  const DUE_ONLY: ListRow[] = [
    listRowSeed({
      ticketId: 'due',
      title: 'File the GST return',
      // No assignee: nothing to pin, so the row renders once and the query below
      // cannot pick up a second copy from the pinned surface.
      dueDate: { date: '2026-08-30', claim: claim({ actorId: 'me', actorName: 'Kiro' }) },
    }),
  ];

  function dueTextUnder(zone: string): string {
    const original = process.env.TZ;
    process.env.TZ = zone;
    try {
      const view = render(<ControlledList rows={DUE_ONLY} initial={chose(['dueDate'], 'flat')} />);
      const section = screen.getByRole('region', { name: 'All tickets' });
      const cells = within(section).getAllByRole('cell');
      const text = cells[1]?.textContent ?? '';
      view.unmount();
      return text;
    } finally {
      // `process.env.TZ = undefined` assigns the STRING "undefined", which ICU
      // resolves to GMT — the naive restore silently switches every file after
      // this one in the same worker to UTC, and only when TZ was unset, which
      // is the default here and in CI.
      if (original === undefined) delete process.env.TZ;
      else process.env.TZ = original;
    }
  }

  it('PLANTED DEFECT: the due date reads the same from a zone fourteen hours ahead', () => {
    expect(dueTextUnder('Pacific/Kiritimati')).toBe("30 Aug 2026 — Kiro's claim");
  });

  it('PLANTED DEFECT: and from a zone eleven hours behind — two zones, one answer', () => {
    expect(dueTextUnder('Pacific/Niue')).toBe("30 Aug 2026 — Kiro's claim");
    expect(dueTextUnder('Pacific/Kiritimati')).toEqual(dueTextUnder('Pacific/Niue'));
  });

  /**
   * MEASURED VACUITY, then closed. Written as `not.toContain('29 Aug')` this
   * survived swapping `formatDate` for `toLocaleDateString`, which renders the
   * shifted day as `8/29/2026` — a string containing neither "29 Aug" nor "31
   * Aug". The absence assertion was checking a spelling the defect does not
   * use. Anchoring on what the day MUST be catches every spelling of what it
   * must not.
   */
  it('PLANTED DEFECT: no zone can move a claimed day off the day it claims', () => {
    expect(dueTextUnder('Pacific/Kiritimati')).toMatch(/^30 Aug 2026 — /);
    expect(dueTextUnder('Pacific/Niue')).toMatch(/^30 Aug 2026 — /);
  });

  /**
   * THE PROBE, AND EXACTLY WHAT IT ESTABLISHES. It proves the KNOB moves: under
   * vitest's `threads` pool a worker gets no `process.env.TZ` reconfiguration at
   * all — measured on this repo in `board.test.tsx`, 32/32 green — and this
   * config sets no pool, so the harness above really can change the ambient zone.
   *
   * It does NOT make the three cases above non-vacuous, and an earlier version
   * of this comment said it did. Against today's `formatDate` the zones cannot
   * discriminate at all (see the block docblock): a working knob turned on a
   * formatter that reads no zone still yields three identical strings. What the
   * probe buys is that the day a device-reading formatter IS written back in,
   * the harness will detect it rather than sitting inert. Knob and discrimination
   * are two different claims; only the first is proven here.
   */
  it('the harness above really can move the ambient zone — otherwise it proves nothing', () => {
    const original = process.env.TZ;
    try {
      process.env.TZ = 'Pacific/Kiritimati';
      const east = new Date('2026-08-19T10:05:00.000Z').toLocaleString();
      process.env.TZ = 'Pacific/Niue';
      const west = new Date('2026-08-19T10:05:00.000Z').toLocaleString();
      expect(east).not.toBe(west);
    } finally {
      if (original === undefined) delete process.env.TZ;
      else process.env.TZ = original;
    }
  });

  it('PLANTED DEFECT: the zone swap hands the worker back exactly the TZ it borrowed', () => {
    const outer = process.env.TZ;
    try {
      delete process.env.TZ;
      dueTextUnder('Pacific/Kiritimati');
      expect(Object.hasOwn(process.env, 'TZ')).toBe(false);
      process.env.TZ = 'Pacific/Niue';
      dueTextUnder('Pacific/Kiritimati');
      expect(process.env.TZ).toBe('Pacific/Niue');
    } finally {
      if (outer === undefined) delete process.env.TZ;
      else process.env.TZ = outer;
    }
  });
});

/**
 * A SANCTIONED MOCKED-CONTRACT SEAM. `createFakeDataSource` stands in for the
 * `DataSource` this hook consumes; it is NOT the contract. The online source is
 * `src/online/`, where SIX of the thirteen query methods — `getTickets` among
 * them — deliberately THROW a `ServingGapError` because the shipped routes do
 * not carry `typeRank`, `epicId`, `stateName`, `assignedProvenance` or
 * `hasRestrictedParent`. Everything below is proven about the hook; the rows it
 * is proven on are not yet obtainable from a server.
 *
 * The preferences fixtures key by `PROJECT`, a real ULID, and not by the plan's
 * `prj_1`: ruling P24 names that literal as one of the three ways the shipped
 * `.strict()` document refuses Plan 6's, because `projectIdKey` is `ulidString`.
 * A round-trip proven on `prj_1` is a round-trip the real server answers 400 to.
 */
const OTHER_PROJECT = '01J9GPRJ000000000000000002';
const STREAM_EVENT_ID = '01J9GEVT000000000000000002';
const STREAM_ACTOR_ID = '01J9GACT000000000000000000';

function storedPreferences(prefs: ProjectViewPrefs): UserPreferences {
  return {
    version: 1,
    projects: {
      [PROJECT]: prefs,
      [OTHER_PROJECT]: chose(['dueDate'], 'type'),
    },
    savedFilters: [{ id: 'f1', name: 'Mine, overdue', filter: { assigneeIds: ['me'] } }],
  };
}

function Harness({ source }: { source: FakeDataSource }) {
  const list = useTicketList(source, WS, PROJECT, 'me');
  return (
    <div>
      <span data-testid="rows">{list.rows === null ? 'loading' : `rows:${list.rows.length}`}</span>
      <span data-testid="grouping">
        {list.prefs.grouping.origin === 'stored' ? list.prefs.grouping.value : `default:${DEFAULT_GROUPING}`}
      </span>
      <span data-testid="origin">{list.prefsOrigin}</span>
      <span data-testid="can-set">{String(list.canSetPrefs)}</span>
      <span data-testid="error">{list.error ?? '-'}</span>
      <button type="button" onClick={() => list.setPrefs(chose(['status'], 'flat'))}>
        rearrange
      </button>
    </div>
  );
}

function eventFrame(source: FakeDataSource): void {
  source.pushStreamItem({
    type: 'event',
    envelope: {
      id: STREAM_EVENT_ID,
      workspaceId: WS,
      entity: { kind: 'ticket', id: TICKET },
      type: 'ticket.assigned',
      version: 1,
      payload: { assigneeId: null },
      actorId: STREAM_ACTOR_ID,
      origin: 'web',
      clientTime: '2026-08-20T08:59:00.000Z',
      serverTime: '2026-08-20T09:00:00.000Z',
      seq: 4,
      workspaceSeq: 9,
    },
  });
}

describe('3.53 useTicketList — preferences round-trip through the DataSource (amendment 14)', () => {
  it('loads stored prefs and writes changes back via putPreferences, workspace and all', async () => {
    const putPreferences = vi.fn(async () => {});
    const source = createFakeDataSource({
      getTickets: async () => ({ projectId: PROJECT, rows: ROWS }),
      getPreferences: async () => storedPreferences(chose(['assignee'], 'type')),
      putPreferences,
    });
    render(<Harness source={source} />);
    await waitFor(() => expect(screen.getByTestId('grouping')).toHaveTextContent('type'));
    expect(screen.getByTestId('origin')).toHaveTextContent('stored');
    await act(async () => {
      screen.getByRole('button', { name: 'rearrange' }).click();
    });
    expect(putPreferences).toHaveBeenCalledWith(WS, {
      version: 1,
      projects: {
        [PROJECT]: chose(['status'], 'flat'),
        [OTHER_PROJECT]: chose(['dueDate'], 'type'),
      },
      savedFilters: [{ id: 'f1', name: 'Mine, overdue', filter: { assigneeIds: ['me'] } }],
    });
  });

  /**
   * A preference change is a WHOLE-DOCUMENT PUT. Composed before the document
   * has been read it can only carry `savedFilters: []` and this one project —
   * so a click landing in the load window deletes every saved filter and every
   * other project's arrangement, on the server, permanently.
   */
  it('PLANTED DEFECT: a change made before the document loads is REFUSED, not written as a document that erases the rest', async () => {
    const putPreferences = vi.fn(async () => {});
    const source = createFakeDataSource({
      getTickets: async () => ({ projectId: PROJECT, rows: ROWS }),
      // Never resolves: the load window, held open.
      getPreferences: () => new Promise<UserPreferences>(() => {}),
      putPreferences,
    });
    render(<Harness source={source} />);
    expect(screen.getByTestId('can-set')).toHaveTextContent('false');
    await act(async () => {
      screen.getByRole('button', { name: 'rearrange' }).click();
    });
    expect(putPreferences).not.toHaveBeenCalled();
  });

  it('PLANTED DEFECT: a project absent from the document reports its arrangement as a DEFAULT, not as a choice', async () => {
    const source = createFakeDataSource({
      getTickets: async () => ({ projectId: PROJECT, rows: ROWS }),
      getPreferences: async () => ({ version: 1, projects: {}, savedFilters: [] }),
    });
    render(<Harness source={source} />);
    await waitFor(() => expect(screen.getByTestId('can-set')).toHaveTextContent('true'));
    expect(screen.getByTestId('origin')).toHaveTextContent('default');
    expect(screen.getByTestId('grouping')).toHaveTextContent(`default:${DEFAULT_GROUPING}`);
  });
});

describe('3.54 useTicketList — preferences are not ledger events, so the stream does not feed them', () => {
  /**
   * Amendment 14: preferences are server-owned per-user rows. No frame on the
   * stream can carry one, so a preferences read subscribed to the stream is
   * asking a question the signal cannot answer — and `use-live-query.ts`'s
   * recorded F6 (same-key reloads resolve last-one-wins) turns that waste into
   * a wrong answer the moment a write path exists.
   */
  it('PLANTED DEFECT: a ticket event refetches the ROWS and never the preferences', async () => {
    vi.useFakeTimers();
    try {
      const getTickets = vi.fn(async () => ({ projectId: PROJECT, rows: ROWS }));
      const getPreferences = vi.fn(async () => storedPreferences(chose(['assignee'], 'type')));
      const source = createFakeDataSource({ getTickets, getPreferences });
      render(<Harness source={source} />);
      await act(async () => {
        await vi.runAllTimersAsync();
      });
      expect(getTickets).toHaveBeenCalledTimes(1);
      expect(getPreferences).toHaveBeenCalledTimes(1);
      act(() => {
        eventFrame(source);
      });
      await act(async () => {
        await vi.runAllTimersAsync();
      });
      // The positive control and the measurement in one run: the stream really
      // did move (rows refetched), and the preferences read did not follow it.
      expect(getTickets).toHaveBeenCalledTimes(2);
      expect(getPreferences).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  /**
   * The user-visible harm the count above is a proxy for: a stream-triggered
   * preferences GET resolving AFTER the PUT overwrites the arrangement the user
   * just chose with the pre-write document — the grouping snaps back on screen
   * while the server holds the new one.
   */
  it('PLANTED DEFECT: a stream frame after a preference change does not snap the arrangement back', async () => {
    vi.useFakeTimers();
    try {
      const source = createFakeDataSource({
        getTickets: async () => ({ projectId: PROJECT, rows: ROWS }),
        getPreferences: async () => storedPreferences(chose(['assignee'], 'type')),
        putPreferences: async () => {},
      });
      render(<Harness source={source} />);
      await act(async () => {
        await vi.runAllTimersAsync();
      });
      expect(screen.getByTestId('grouping')).toHaveTextContent('type');
      await act(async () => {
        screen.getByRole('button', { name: 'rearrange' }).click();
        await vi.runAllTimersAsync();
      });
      expect(screen.getByTestId('grouping')).toHaveTextContent('flat');
      act(() => {
        eventFrame(source);
      });
      await act(async () => {
        await vi.runAllTimersAsync();
      });
      expect(screen.getByTestId('grouping')).toHaveTextContent('flat');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('3.146 useTicketList — a refusal is an error, never an empty list', () => {
  /**
   * `getTickets` REFUSED until ruling P25 clause 1 — the shipped route served
   * none of `typeRank`, `epicId`, `stateName`, `assignedProvenance` or
   * `hasRestrictedParent`, and it serves all five now. The property this case
   * pins does not depend on that: the one thing this surface must never do with
   * a read that FAILS, for any reason, is render it as a project with no tickets
   * in it. A plain `Error` is thrown rather than the real `ServingGapError`, so
   * this view test does not reach into `online/` — which is also why the case
   * survives the gap closing at all.
   */
  it('PLANTED DEFECT: rows stay null and the reason surfaces — a serving gap never renders as "0 tickets"', async () => {
    const source = createFakeDataSource({
      getTickets: async () => {
        throw new Error('ServingGapError: list rows carry no stateName');
      },
      getPreferences: async () => storedPreferences(chose(['status'], 'epic')),
    });
    render(<Harness source={source} />);
    await waitFor(() =>
      expect(screen.getByTestId('error')).toHaveTextContent('ServingGapError: list rows carry no stateName'),
    );
    expect(screen.getByTestId('rows')).toHaveTextContent('loading');
    expect(screen.getByTestId('rows')).not.toHaveTextContent('rows:0');
  });
});

/**
 * 3.156 (list half) — the same `ticket-card-${ticketId}` hook board.test.tsx
 * pins for the board, on the list's title cell. Disambiguation only: the row
 * still opens through its own accessible "Open" button, scoped inside the
 * testid rather than replaced by it.
 */
describe('TicketList — entity-keyed data-testid hooks (Plan 11 T13)', () => {
  it('3.156 keys each row by its own ticketId, distinguishing two siblings', () => {
    // epicA and t3 — neither is assigned to 'me', so neither renders a
    // second time in the "Recently assigned" pin (t2 does, which would make
    // `getByTestId('ticket-card-t2')` ambiguous — the pin is a second
    // rendering of the same row, not a second entity).
    render(<ControlledList rows={ROWS} initial={chose([], 'flat')} />);
    const epicCard = screen.getByTestId('ticket-card-epicA');
    const t3Card = screen.getByTestId('ticket-card-t3');
    expect(epicCard).not.toBe(t3Card);
    expect(within(epicCard).getByText('Registrations')).toBeInTheDocument();
    expect(within(t3Card).getByText('Chase the vendor')).toBeInTheDocument();
  });
});
