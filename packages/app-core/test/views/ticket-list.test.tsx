import { render, screen, waitFor, within } from '@testing-library/react';
// Named import, not the default: `@testing-library/user-event` ships no default
// export that survives `verbatimModuleSyntax` — settled at
// packages/ui/test/components.test.tsx and again in board.test.tsx.
import { userEvent } from '@testing-library/user-event';
import { act, useState, type ReactNode } from 'react';
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
 * Task 10 (backlog/closed spec §5.4) fixtures for 13.596/13.597 — module scope
 * because both case numbers' `describe` blocks read them. `assignee: null` (the
 * seed default) on both, deliberately: see 13.597's own docblock for why an
 * assigned row would render its `rowAction`/`Closed` chip a second time in the
 * "Recently assigned" pin and pass either case by accident.
 */
const OPEN_ROW: ListRow = listRowSeed({ ticketId: 'ra_open', title: 'Row one' });
const CLOSED_ROW: ListRow = listRowSeed({
  ticketId: 'ra_closed',
  title: 'Row two',
  closed: { actorId: 'anselma', at: '2026-09-17T09:00:00.000Z' },
});

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
  // Task 10 (backlog/closed spec §5.4) — undefaulted for the same reason
  // `narrowing` is: every existing case exercises `TicketList`'s own
  // no-trailing-column default, and defaulting it here would leave that
  // default untested.
  rowAction,
}: {
  rows?: ListRow[];
  initial?: ProjectViewPrefs;
  prefsEditable?: boolean;
  onOpenTicket?: (ticketId: string) => void;
  onChange?: (prefs: ProjectViewPrefs) => void;
  narrowing?: string;
  rowAction?: (row: ListRow) => ReactNode;
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
      {...(rowAction === undefined ? {} : { rowAction })}
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
  it('narrowed: the count reads `matching`, the `done` half is gone, and the narrowing is named', () => {
    render(<ControlledList narrowing="tickets in progress" />);
    // `· N done` is dropped, not recomputed. It is a claim about the PROJECT, and
    // under the only shipped narrowing it is structurally always `0 done` — a
    // number that can only say zero, in a shape that invites the project-wide
    // reading the count no longer supports.
    expect(screen.getByTestId('list-summary')).toHaveTextContent('4 matching');
    expect(screen.getByTestId('list-summary')).not.toHaveTextContent('done');
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
      await user.click(screen.getByRole('button', { name: /Group by/ }));
      await user.click(within(await screen.findByRole('listbox')).getByRole('option', { name: grouping }));
      expect(screen.getByRole('button', { name: /Group by/ })).toHaveTextContent(grouping);
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
      await user.click(screen.getByRole('button', { name: /Group by/ }));
      await user.click(within(await screen.findByRole('listbox')).getByRole('option', { name: grouping }));
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
    await user.click(screen.getByRole('button', { name: /Group by/ }));
    await user.click(within(await screen.findByRole('listbox')).getByRole('option', { name: 'status' }));
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
    await user.click(screen.getByRole('button', { name: /Group by/ }));
    await user.click(within(await screen.findByRole('listbox')).getByRole('option', { name: 'status' }));
    expect(onChange).toHaveBeenCalledWith({
      columns: { origin: 'default' },
      grouping: { origin: 'stored', value: 'status' },
    });
  });

  it('PLANTED DEFECT: the controls are DISABLED, not merely inert, before the document loads', () => {
    render(<ControlledList prefsEditable={false} />);
    // Not `getByLabelText('Group by')`: post-migration that name resolves to BOTH
    // the shared Select's visible trigger button and its `HiddenSelect` mirror's
    // own hidden native `<select>` (they share the accessible name via `label`/
    // `name`), so an unscoped label-text query throws "Found multiple elements"
    // (confirmed empirically) — the same gotcha Task 2's reopen-dialog migration
    // hit and documented at its own call site.
    expect(screen.getByRole('button', { name: /Group by/ })).toBeDisabled();
    expect(screen.getByLabelText('Status')).toBeDisabled();
  });

  it('and enabled once it has — which is the component’s own default, not the harness’s', () => {
    render(<ControlledList />);
    expect(screen.getByRole('button', { name: /Group by/ })).toBeEnabled();
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

/**
 * 12.386 — CHANGING THE FILTER ASKS THE QUESTION AGAIN.
 *
 * **This case exists because its mutation SURVIVED.** Dropping the filter from
 * `useLiveQuery`'s key — leaving it as the bare `projectId` — broke nothing in the
 * suite, so the docblock claiming the key must carry it was an unwitnessed claim.
 * Recorded rather than quietly covered, because a survivor with no explanation is the
 * thing this series keeps finding, and here the explanation was simply that nobody had
 * ever changed a filter on a mounted hook.
 *
 * The failure it guards is silent and worse than a stale render: `useLiveQuery`'s load
 * effect depends on the KEY, and its `load` closure is refreshed through a ref on every
 * render. So with the filter outside the key the component re-renders with the new
 * filter, issues NO request, and leaves the previous rows on screen underneath a
 * control that says they were narrowed. Nothing throws and nothing spins — the list
 * simply answers the wrong question, and 12.384's summary would then name a narrowing
 * that had not been applied.
 *
 * Both halves: the read is re-issued WITH the new filter, and the rows on screen become
 * the narrowed ones. The first alone would pass if the answer were discarded; the
 * second alone would pass if the fake ignored its argument.
 */
describe('12.386 useTicketList — a filter change re-issues the read', () => {
  function FilterHarness({ source }: { source: FakeDataSource }) {
    const [narrow, setNarrow] = useState(false);
    const list = useTicketList(
      source,
      WS,
      PROJECT,
      'me',
      narrow ? { stateCategories: ['active'] } : {},
    );
    return (
      <div>
        <span data-testid="rows">{list.rows === null ? 'loading' : `rows:${list.rows.length}`}</span>
        <button type="button" onClick={() => setNarrow(true)}>
          narrow
        </button>
      </div>
    );
  }

  it('re-asks with the new filter, and the narrowed rows reach the screen', async () => {
    const asked: unknown[] = [];
    const source = createFakeDataSource({
      getTickets: async (_projectId: string, filter: unknown) => {
        asked.push(filter);
        const wide = (filter as { stateCategories?: string[] }).stateCategories === undefined;
        return {
          projectId: PROJECT,
          rows: wide ? [ROWS[0]!, ROWS[1]!, ROWS[2]!] : [ROWS[0]!],
        };
      },
    });
    render(<FilterHarness source={source} />);
    await waitFor(() => expect(screen.getByTestId('rows')).toHaveTextContent('rows:3'));

    await userEvent.setup().click(screen.getByRole('button', { name: 'narrow' }));

    // The rows on screen are the narrowed ones — the half a user sees.
    await waitFor(() => expect(screen.getByTestId('rows')).toHaveTextContent('rows:1'));
    // And the read was actually re-issued, with the filter, rather than the view
    // being filtered client-side out of rows it already had. Printed whole so a
    // failure says what was asked instead of only how many times.
    expect(asked).toEqual([{}, { stateCategories: ['active'] }]);
  });
});

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

/**
 * 13.597 — Task 10's two `TicketList` additions, both used by the Backlog tab
 * and neither exclusive to it: a per-row trailing slot (`rowAction`) a page can
 * fill with whatever a row's own tab wants to offer (the Backlog tab's Start,
 * here a plain probe button so this file does not depend on `apps/web`), and a
 * second `Closed` chip beside the state chip for a row whose `closed` is set.
 *
 * Both fixture rows carry `assignee: null` (the seed default) so `pinned`
 * (`recentlyAssignedRows`) is empty and neither renders twice — see
 * `TicketList`'s own docblock, invariant 1: "exactly once ACROSS THE
 * SECTIONS", never "exactly once on the page". A row assigned to `currentUserId`
 * here would pass this case by accident, rendering `rowAction` — and the
 * `Closed` chip — a second time in the pin, which `getAllByRole` would then
 * over-count and a page mounting one Start button per row would ambiguously
 * duplicate (two identical `aria-label`s on one ticket).
 */
describe('13.597 the rowAction slot and the Closed chip (packages/app-core/src/views/ticket-list.tsx)', () => {
  it('rowAction renders once per row, not once per pinned+sectioned occurrence', () => {
    render(
      <ControlledList
        rows={[OPEN_ROW, CLOSED_ROW]}
        initial={chose([], 'flat')}
        rowAction={(row) => <button aria-label={`Row action ${row.ticketId}`}>Act</button>}
      />,
    );
    expect(screen.getAllByRole('button', { name: /^Row action / })).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Row action ra_open' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Row action ra_closed' })).toBeInTheDocument();
  });

  it('a closed row shows a Closed chip beside the state chip; a non-closed row does not', () => {
    render(<ControlledList rows={[OPEN_ROW, CLOSED_ROW]} initial={chose(['status'], 'flat')} />);
    const openRow = screen.getByTestId('ticket-card-ra_open').closest('tr');
    const closedRow = screen.getByTestId('ticket-card-ra_closed').closest('tr');
    if (openRow === null || closedRow === null) throw new Error('row <tr> not found');
    expect(within(closedRow).getByText('Closed')).toBeInTheDocument();
    expect(within(openRow).queryByText('Closed')).not.toBeInTheDocument();
    // The state chip itself is still there, unreplaced — Closed is BESIDE it.
    expect(within(openRow).getByText(OPEN_ROW.stateName)).toBeInTheDocument();
    expect(within(closedRow).getByText(CLOSED_ROW.stateName)).toBeInTheDocument();
  });

  it('with no rowAction passed, no trailing column renders — byte-identical to before Task 10', () => {
    render(<ControlledList rows={[OPEN_ROW]} initial={chose([], 'flat')} />);
    expect(screen.queryAllByRole('button', { name: /^Row action / })).toHaveLength(0);
  });
});

/**
 * 13.596 (list half) — `emptyCopy` defaults to ABSENCE, not a new sentence.
 * `TicketList` rendered NOTHING beneath its controls bar for a zero-row set
 * before Task 10 (`groupRows([], DEFAULT_GROUPING, labels)` answers `[]` for
 * every non-flat grouping, and `sections.map` over `[]` renders no section at
 * all) — measured by reading the component, not assumed. Introducing visible
 * copy for every `TicketList` mount by DEFAULT would be a behaviour change on
 * a surface outside this task, and the wrong ONE at that: `rows.length === 0`
 * here can mean "the project truly has none" or "a filter hid all of them"
 * (`listNarrowing`'s own docblock, and Ruling 19's `isNarrowed` one layer up),
 * and a flat sentence picks the first without knowing which is true. So the
 * List tab (which passes no `emptyCopy`) gets exactly what it got before: silence.
 * Only a caller that HANDS a sentence — the Backlog tab, `apps/web/test/backlog-tab.test.tsx`
 * case 13.596 — gets one.
 */
describe('13.596 emptyCopy renders only when a caller passes one, over a zero-row set', () => {
  it('renders nothing for a zero-row set with no emptyCopy — the pre-Task-10 default', () => {
    const { container } = render(<ControlledList rows={[]} initial={chose([], 'flat')} />);
    expect(screen.queryByTestId('list-empty')).not.toBeInTheDocument();
    // Belt and braces: no table row of any kind either.
    expect(container.querySelectorAll('tbody tr')).toHaveLength(0);
  });

  it('renders the caller-supplied sentence for a zero-row set once emptyCopy is passed', () => {
    render(
      <TicketList
        rows={[]}
        currentUserId="me"
        prefs={DEFAULT_VIEW_PREFS}
        onPrefsChange={vi.fn()}
        labels={LABELS}
        onOpenTicket={vi.fn()}
        emptyCopy="Nothing in the backlog — new tickets land here."
      />,
    );
    expect(screen.getByTestId('list-empty')).toHaveTextContent(
      'Nothing in the backlog — new tickets land here.',
    );
  });

  it('does not render emptyCopy once rows arrive', () => {
    render(<ControlledList rows={[OPEN_ROW]} initial={chose([], 'flat')} />);
    expect(screen.queryByTestId('list-empty')).not.toBeInTheDocument();
  });
});

/**
 * 13.659–13.670 — the List tab's controls row, column-picker tray and table,
 * restyled to the prototype's `isListView` block
 * (`design-system/interactive/desktop.dc.html:405-479`) and its row builders
 * (`:2839-2930`).
 *
 * WHAT THESE CASES CAN AND CANNOT SEE. They are jsdom cases and this package's
 * vitest config loads no stylesheet, so every assertion below is about the
 * MARKUP the restyle renders — which classes exist, which state each control
 * reports, which sentence each cell composes — and never about a colour, a
 * radius or a pixel. A case here that claimed to measure a shadow would be
 * measuring jsdom.
 *
 * THE VISUAL HALF, stated as measured rather than as hoped. An earlier draft of
 * this paragraph said the visual metrics were held by
 * `packages/ui/test/components.test.tsx` and `apps/web/e2e-viewport/`, and that
 * was FALSE: neither suite names a single `.gn-list__*` selector. Every `it` in
 * the ui file names another block, and the viewport sweeps never open this tab
 * at all (the project page defaults to the board). The claim was load-bearing —
 * it sat above `.gn-list__columns-tray[hidden] { display: none }`, a rule that
 * could have been deleted with every suite in the repo green while the tray
 * stopped closing in a browser. What actually holds the declarations this
 * restyle depends on is `./ticket-list-css-binding.test.tsx` (13.671), which
 * reads them out of `ui.css` beside the classes this component really renders.
 *
 * THE RESIDUAL GAP, named rather than papered over: nothing measures the
 * COMPUTED result for this tab in a browser. There is no viewport sweep, no
 * screenshot diff, and the type-scale and tap-target ratchets do not visit it,
 * so a declaration that is present and then overridden, or one whose token
 * resolves to a colour nobody wanted, is invisible to every suite here. 13.671
 * narrows this to "the declaration exists and says the right thing"; it does not
 * close it.
 *
 * The five chips, the five grouping keys and the `Group by` accessible name are
 * the three HARD CONSTRAINTS of this task that are also the three things a
 * restyle can silently take away: a tray rewritten as a `<details>`, a picker
 * rebuilt on a new component, five keys quietly grown to six. Each has its own
 * case, and 13.659's negative assertion (`workflow` is ABSENT) is the half that
 * a `toEqual` over five names cannot make on its own.
 */

/** A due date claimed by Kiro, and the closed twin of it (13.666). */
const DUE_CLAIMED: ListRow = listRowSeed({
  ticketId: 'due_open',
  title: 'File the return',
  dueDate: { date: '2026-08-30', claim: claim({ actorId: 'me', actorName: 'Kiro' }) },
});
const DUE_CLOSED: ListRow = listRowSeed({
  ticketId: 'due_closed',
  title: 'Filed the return',
  dueDate: { date: '2026-08-30', claim: claim({ actorId: 'me', actorName: 'Kiro' }) },
  closed: { actorId: 'me', at: '2026-09-17T09:00:00.000Z' },
});

describe('13.659 Group by keeps its accessible name and exactly its five keys', () => {
  it('the control is a button named `Group by`, and its panel offers epic/status/assignee/type/flat — and no sixth key', async () => {
    const user = userEvent.setup();
    render(<ControlledList />);
    // MEASURED, and worth recording because it looks like a defect and is not
    // one this task may fix: the trigger's COMPUTED name is `epic Group by`,
    // not `Group by`. React Aria writes `aria-labelledby` (value id, then label
    // id) as well as the `aria-label` it was handed, and the computed name
    // prefers `aria-labelledby`. That composition predates this restyle — the
    // `Select` and its props are untouched here, and every pre-existing case in
    // this file queries `/Group by/` for the same reason. What this restyle is
    // required to PRESERVE is the attribute, so the attribute is what is
    // asserted verbatim below; the computed name is asserted as containing it.
    const trigger = screen.getByRole('button', { name: /Group by/ });
    expect(trigger).toHaveAttribute('aria-label', 'Group by');
    await user.click(trigger);
    const listbox = await screen.findByRole('listbox');
    expect(within(listbox).getAllByRole('option')).toHaveLength(5);
    for (const key of ['epic', 'status', 'assignee', 'type', 'flat']) {
      expect(within(listbox).getByRole('option', { name: key })).toBeInTheDocument();
    }
    // The prototype's own list carries `workflow` in this slot
    // (`desktop.dc.html:410`). This product's wire has no workflow field on
    // `ListRow`, so the key is held, not transcribed — and a length check
    // alone would pass if someone swapped `flat` out for `workflow`.
    expect(within(listbox).queryByRole('option', { name: 'workflow' })).not.toBeInTheDocument();
  });
});

describe('13.660 the tray renders five chips, each with its own accessible name and checked state', () => {
  it('five checkboxes, named for their columns, checked exactly where the preferences say', async () => {
    const user = userEvent.setup();
    render(<ControlledList initial={chose(['status', 'assignee'], 'flat')} />);
    // Opened first, and not as a convenience: a `hidden` subtree is excluded
    // from the accessible tree, so `getAllByRole` over a closed tray answers
    // ZERO while five chips sit in the DOM — a zero that would read as "the
    // chips are gone". `getAllByLabelText` below is the closed-tray arm.
    await user.click(screen.getByRole('button', { name: 'Columns' }));
    const tray = screen.getByTestId('list-columns-tray');
    expect(within(tray).getAllByRole('checkbox')).toHaveLength(5);
    for (const [name, checked] of [
      ['Status', true],
      ['Assignee', true],
      ['Due date', false],
      ['Type', false],
      ['Progress', false],
    ] as const) {
      const chip = within(tray).getByRole('checkbox', { name });
      if (checked) expect(chip, name).toBeChecked();
      else expect(chip, name).not.toBeChecked();
    }
  });

  it('CONTROL: the same query answers both ways, and the chips are MOUNTED while the tray is closed', () => {
    // Two jobs, and the first is the one that makes the case above evidence:
    // an `unchecked` assertion is only worth something if the same read can
    // come back `checked`. Both arms are measured in one run.
    const all = render(
      <ControlledList initial={chose(['status', 'assignee', 'dueDate', 'type', 'progress'], 'flat')} />,
    );
    const allTray = all.getByTestId('list-columns-tray');
    const allChips = [...allTray.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
    expect(allChips).toHaveLength(5);
    expect(allChips.every((chip) => chip.checked)).toBe(true);
    // The closed-tray arm, read straight off the DOM because the accessible
    // tree excludes a `hidden` subtree: this is the property the tray's
    // `hidden`-rather-than-conditional rendering exists for, and
    // `getByLabelText` is the query four pre-existing cases in this file use
    // to reach a chip on a List whose tray was never opened.
    expect(allTray).toHaveAttribute('hidden');
    expect(within(allTray).getByLabelText('Type')).toBeChecked();
    all.unmount();

    render(<ControlledList initial={chose([], 'flat')} />);
    const noneChips = [
      ...screen.getByTestId('list-columns-tray').querySelectorAll<HTMLInputElement>('input[type="checkbox"]'),
    ];
    expect(noneChips).toHaveLength(5);
    expect(noneChips.some((chip) => chip.checked)).toBe(false);
    expect(screen.getByLabelText('Type')).not.toBeChecked();
  });
});

describe('13.661 the Columns toggle opens and closes the tray it names', () => {
  it('starts closed with `aria-expanded="false"` and the tray hidden, then flips both on click', async () => {
    const user = userEvent.setup();
    render(<ControlledList />);
    const toggle = screen.getByRole('button', { name: 'Columns' });
    const tray = screen.getByTestId('list-columns-tray');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    // The tray is in the DOCUMENT while closed (four existing cases in this
    // file query its checkboxes by label text without ever opening it), so
    // "closed" is `hidden` and not absence — which is why this asserts the
    // attribute rather than `queryByTestId(...)` being null.
    expect(tray).toHaveAttribute('hidden');
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(tray).not.toHaveAttribute('hidden');
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(tray).toHaveAttribute('hidden');
  });
});

describe('13.662 the group header band names its group and counts its own rows', () => {
  it('each grouping axis renders its own word, its own section title, and a singular/plural count', () => {
    // ROWS, by axis, under `labels` above: epic → `No epic` holds epicA and t5;
    // status → `To do` holds epicA and t3, `Doing` holds t2 alone; assignee →
    // t2 is Kiro's and the other three are unassigned, so `Unassigned` holds
    // THREE, not four; and type → epicA is the `epic` type while t2/t3/t5 are
    // the seed's `task`, so `task` holds three. Both counts were MEASURED, not
    // reasoned: the first version of these two lines said four each and the run
    // answered `assignee · 3 tickets` then `type · 3 tickets`.
    const expected: [Grouping, string, string, string][] = [
      ['epic', 'No epic', 'epic · 2 tickets', 'Registrations'],
      ['status', 'To do', 'state · 2 tickets', 'Doing'],
      ['assignee', 'Unassigned', 'assignee · 3 tickets', 'Kiro'],
      ['type', 'task', 'type · 3 tickets', 'epic'],
    ];
    for (const [grouping, title, meta, alsoTitle] of expected) {
      const view = render(<ControlledList initial={chose([], grouping)} />);
      const band = (label: string): Element => {
        const region = view.getByRole('region', { name: label });
        const found = region.querySelector('.gn-list__section-title');
        if (found === null) throw new Error(`no band over ${label}`);
        return found;
      };
      const first = band(title);
      expect(first.querySelector('.gn-list__section-name'), grouping).toHaveTextContent(title);
      expect(first.querySelector('.gn-list__section-meta'), grouping).toHaveTextContent(meta);
      // The second half of the epic/status arms: more than one band per axis,
      // each carrying its OWN title — a band that hardcoded the first group's
      // name would pass everything above and fail here.
      const second = band(alsoTitle);
      expect(second.querySelector('.gn-list__section-name'), grouping).toHaveTextContent(alsoTitle);
      view.unmount();
    }
  });

  it('the singular form is real — a one-row section says `1 ticket`', () => {
    // `Doing` holds exactly one row above, so the plural branch cannot pass for
    // it. Separated from the loop so the failure names the plurality rather
    // than the axis.
    render(<ControlledList initial={chose([], 'status')} />);
    const region = screen.getByRole('region', { name: 'Doing' });
    const band = region.querySelector('.gn-list__section-title');
    if (band === null) throw new Error('no band over Doing');
    expect(band.querySelector('.gn-list__section-meta')).toHaveTextContent('state · 1 ticket');
  });

  it('the flat grouping renders no band at all — there is no group to name', () => {
    render(<ControlledList initial={chose([], 'flat')} />);
    expect(screen.queryByText(/^state · /)).not.toBeInTheDocument();
    expect(document.querySelector('.gn-list__section-meta')).toBeNull();
  });

  it('a COLLAPSED subtree does not shrink the band — the count is the section, not the screen', async () => {
    // THE CASE THAT MAKES `section.rows.length` FALSIFIABLE. Every other count
    // assertion in this file renders a section whose rows and whose visible nodes
    // are the same set, so `nodes.length` (the POST-`visibleNodes` list) passes
    // them all — measured: swapping the two in `ticket-list.tsx` compiled and
    // left the whole suite green. For a collapsed parent the two genuinely differ,
    // and this is the only arrangement in the fixture where they can: `epic`
    // grouping puts t2 and its child t3 in the same `Registrations` section (under
    // `status` they land in different sections and never nest; under `flat` there
    // is no band to read), so collapsing t2 hides t3 from the TABLE while the
    // section's own membership is untouched.
    const user = userEvent.setup();
    render(<ControlledList initial={chose([], 'epic')} />);
    const region = screen.getByRole('region', { name: 'Registrations' });
    const band = region.querySelector('.gn-list__section-title');
    if (band === null) throw new Error('no band over Registrations');
    expect(band.querySelector('.gn-list__section-meta')).toHaveTextContent('epic · 2 tickets');

    await user.click(within(region).getByRole('button', { name: 'Collapse DLT registration' }));

    // The CONTROL: the collapse really hid a node, or the assertion below would
    // read `2 tickets` off a table that still holds two rows and prove nothing
    // about which number the band reads.
    expect(within(region).queryByTestId('ticket-card-t3')).toBeNull();
    expect(within(region).getByTestId('ticket-card-t2')).not.toBeNull();
    expect(band.querySelector('.gn-list__section-meta')).toHaveTextContent('epic · 2 tickets');
    // The band answers for its section the way the summary answers for the
    // project: a count that shrank when a row was collapsed would be a count of
    // the user's scroll position. And the row's own state agrees with the table:
    // the same control now offers to expand, and draws the collapsed glyph.
    expect(within(region).getByRole('button', { name: 'Expand DLT registration' })).toHaveTextContent(
      '▸',
    );
  });
});

describe('13.663 the title cell indents by depth, from the row’s own numbers', () => {
  it('epic 16px, child 38px, grandchild 60px — the prototype’s `16 + depth*22`', () => {
    render(<ControlledList initial={chose([], 'flat')} />);
    // Scoped to the sections, never the document: t2 is assigned to
    // `currentUserId` and therefore renders a SECOND time in *Recently
    // assigned*, at depth 0 — so a document-wide `getByTestId('ticket-card-t2')`
    // is ambiguous and the pin's copy would answer 16px for a row whose section
    // copy is at 38px. The pin is a flat surface by design; this case is about
    // the section's indentation.
    const section = screen.getByRole('region', { name: 'All tickets' });
    const left = (ticketId: string): string => {
      const cell = within(section).getByTestId(`ticket-card-${ticketId}`);
      return (cell as HTMLElement).style.paddingLeft;
    };
    // ROWS nests epicA → t2 → t3, so the three rows are depths 0, 1, 2.
    expect(left('epicA')).toBe('16px');
    expect(left('t2')).toBe('38px');
    expect(left('t3')).toBe('60px');
    // Three DISTINCT values is the property; a cell that ignored depth would
    // make the three equal and this case would still pass a single assertion.
    expect(new Set([left('epicA'), left('t2'), left('t3')]).size).toBe(3);
  });

  it('a leaf reserves the caret’s column, so depth and not hasChildren sets the left edge', () => {
    render(<ControlledList initial={chose([], 'flat')} />);
    // t3 is a leaf at depth 2 and t2 a parent at depth 1: their indentation
    // must differ by exactly one step, which only holds if the missing caret is
    // SPACED OUT rather than collapsed. Scoped to the sections for the same
    // reason as the case above — the pin renders a second t2.
    const section = screen.getByRole('region', { name: 'All tickets' });
    const leaf = within(section).getByTestId('ticket-card-t3');
    const parent = within(section).getByTestId('ticket-card-t2');
    expect(leaf.querySelector('.gn-list__caret-spacer')).not.toBeNull();
    expect(parent.querySelector('.gn-list__collapse')).not.toBeNull();
    expect(leaf.querySelector('.gn-list__collapse')).toBeNull();
  });
});

describe('13.664 the status pill renders the state’s name and its category dot', () => {
  it('shows `Doing` inside a chip carrying the active category’s own modifier, and `Done` under terminal’s', () => {
    render(<ControlledList initial={chose(['status'], 'flat')} />);
    // Scoped to the sections: t2 is pinned a second time above, and that copy
    // carries the pin's own row, not the section's.
    const section = screen.getByRole('region', { name: 'All tickets' });
    const chipNamed = (ticketId: string, name: string): Element => {
      const row = within(section).getByTestId(`ticket-card-${ticketId}`).closest('tr');
      if (row === null) throw new Error(`no <tr> for ${ticketId}`);
      const chip = within(row).getByText(name).closest('.gn-chip');
      if (chip === null) throw new Error(`${name} is not inside a chip`);
      return chip;
    };
    // The dot is `Chip`'s own, `aria-hidden` and coloured per tone: the tone
    // class is what makes it the STATE's category rather than a generic bullet.
    const active = chipNamed('t2', 'Doing');
    expect(active.className).toContain('gn-chip--active');
    expect(active.querySelector('.gn-chip__dot')).not.toBeNull();
    // TWO categories, so the modifier is measured as tracking the row's state
    // and not as one class this view hardcodes for every chip it renders.
    const terminal = chipNamed('t5', 'Done');
    expect(terminal.className).toContain('gn-chip--terminal');
    expect(terminal.className).not.toContain('gn-chip--active');
    expect(terminal.querySelector('.gn-chip__dot')).not.toBeNull();
  });
});

describe('13.665 a due date is rendered as a claim, with its claimant', () => {
  it('reads `30 Aug 2026 — Kiro’s claim`', () => {
    render(<ControlledList rows={[DUE_CLAIMED]} initial={chose(['dueDate'], 'flat')} />);
    const row = screen.getByTestId('ticket-card-due_open').closest('tr');
    if (row === null) throw new Error('no <tr> for due_open');
    expect(within(row).getByText("30 Aug 2026 — Kiro's claim")).toBeInTheDocument();
  });
});

describe('13.666 a closed ticket’s due cell reads its closure, still attributed', () => {
  it('reads `Closed 17 Sep 2026 — Kiro’s claim`', () => {
    render(<ControlledList rows={[DUE_CLOSED]} initial={chose(['dueDate'], 'flat')} />);
    const row = screen.getByTestId('ticket-card-due_closed').closest('tr');
    if (row === null) throw new Error('no <tr> for due_closed');
    expect(within(row).getByText("Closed 17 Sep 2026 — Kiro's claim")).toBeInTheDocument();
    // The date's own claimant outlives the closure: `closed.actorId` is `me`
    // here too, so a cell that switched to the CLOSER would pass by accident.
    // This asserts the sentence's SHAPE instead, which is the part that would
    // change if the attribution source were swapped.
    expect(within(row).queryByText(/^17 Sep 2026/)).not.toBeInTheDocument();
  });
});

describe('13.667 an unclaimed due date is named, never blank', () => {
  it('reads `No date claimed`, and not a dash', () => {
    render(<ControlledList rows={[OPEN_ROW]} initial={chose(['dueDate'], 'flat')} />);
    const row = screen.getByTestId('ticket-card-ra_open').closest('tr');
    if (row === null) throw new Error('no <tr> for ra_open');
    expect(within(row).getByText('No date claimed')).toBeInTheDocument();
    expect(within(row).queryByText('—')).not.toBeInTheDocument();
  });
});

describe('13.668 progress reads `N of M done`, and its absence is a dash', () => {
  it('a rolled-up row states both counts and any restricted note', () => {
    const rolled = listRowSeed({
      ticketId: 'rolled',
      title: 'Has children',
      rollup: { terminalChildren: 3, totalChildren: 8, restrictedCount: 0 },
    });
    const partial = listRowSeed({
      ticketId: 'partial',
      title: 'Has hidden children',
      rollup: { terminalChildren: 4, totalChildren: 8, restrictedCount: 2 },
    });
    render(<ControlledList rows={[rolled, partial]} initial={chose(['progress'], 'flat')} />);
    const rolledRow = screen.getByTestId('ticket-card-rolled').closest('tr');
    const partialRow = screen.getByTestId('ticket-card-partial').closest('tr');
    if (rolledRow === null || partialRow === null) throw new Error('rows not found');
    expect(within(rolledRow).getByText('3 of 8 done')).toBeInTheDocument();
    expect(within(partialRow).getByText('4 of 8 done · 2 restricted')).toBeInTheDocument();
  });

  it('a row with no rollup renders the dash, not `0 of 0 done`', () => {
    render(<ControlledList rows={[OPEN_ROW]} initial={chose(['progress'], 'flat')} />);
    const row = screen.getByTestId('ticket-card-ra_open').closest('tr');
    if (row === null) throw new Error('no <tr> for ra_open');
    expect(within(row).getByText('—')).toBeInTheDocument();
    expect(within(row).queryByText(/done/)).not.toBeInTheDocument();
  });
});

describe('13.669 the controls row, tray and table render under all three styles', () => {
  it('hig, minimal and neo each render the same DOM — the style is carried by CSS alone', () => {
    // `data-style` lands on the document element (`apps/web`'s style toggle
    // sets it there), so this is the same switch the app flips. What is
    // measured is the property that makes "all three styles render" a
    // statement rather than a hope: NOTHING in `packages/app-core/src` reads
    // `data-style` — verified, not assumed — so the three renders must be
    // byte-identical, and a future `style === 'neo' ? … : …` branch in this
    // view would have to show up here as a difference.
    const markup: string[] = [];
    for (const style of ['hig', 'minimal', 'neo']) {
      document.documentElement.setAttribute('data-style', style);
      const view = render(<ControlledList initial={chose(['status', 'assignee'], 'status')} />);
      expect(screen.getByRole('button', { name: /Group by/ }), style).toHaveAttribute(
        'aria-label',
        'Group by',
      );
      expect(screen.getByRole('button', { name: 'Columns' }), style).toBeInTheDocument();
      // Read off the DOM, not the accessible tree: the tray mounts closed, so a
      // role query answers zero here for the reason 13.660 records.
      expect(
        screen.getByTestId('list-columns-tray').querySelectorAll('input[type="checkbox"]'),
        style,
      ).toHaveLength(5);
      expect(screen.getByTestId('list-summary'), style).toHaveTextContent('4 tickets · 1 done');
      expect(view.container.querySelector('.gn-list__section-title'), style).not.toBeNull();
      expect(view.container.querySelector('.gn-list__table-wrap'), style).not.toBeNull();
      // React Aria derives its ids from `useId`, whose counter advances per
      // React ROOT, so three renders in one process carry different id tokens
      // and a raw comparison would be measuring React's id counter rather than
      // this view. The mask is narrow — only `react-aria-*` tokens — which is
      // what makes the equality asserted below a PROOF rather than a hope: if
      // any other difference existed between two styles' renders, it would
      // survive the mask and redden here.
      markup.push(view.container.innerHTML.replace(/react-aria-[\w-]+/g, 'ID'));
      view.unmount();
    }
    document.documentElement.removeAttribute('data-style');
    expect(markup[1]).toBe(markup[0]);
    expect(markup[2]).toBe(markup[0]);
  });
});

describe('13.670 the title’s weight is a fact about the row, not about the class', () => {
  it('epic 600, a child 400, an unparented non-epic 500', () => {
    render(<ControlledList initial={chose([], 'flat')} />);
    const weight = (ticketId: string): string => {
      const cell = screen.getByTestId(`ticket-card-${ticketId}`);
      const button = cell.querySelector('.gn-list__open') as HTMLElement | null;
      if (button === null) throw new Error(`no title button for ${ticketId}`);
      return button.style.fontWeight;
    };
    // ROWS: epicA is the rank-1 type (the prototype's `isEpicT`), t3 hangs
    // under t2 (depth 2), t5 is a root of an ordinary type (rank 3, depth 0).
    expect(weight('epicA')).toBe('600');
    expect(weight('t3')).toBe('400');
    expect(weight('t5')).toBe('500');
    expect(new Set([weight('epicA'), weight('t3'), weight('t5')]).size).toBe(3);
  });
});
