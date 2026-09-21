import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { FieldClaim, TicketTypeDef } from '@gisik-nokma/domain';
import { EMPTY_BOARD_COPY, EMPTY_COLUMN_COPY } from '@gisik-nokma/app-core';
import type {
  BoardCard,
  BoardGroup,
  BoardView,
  ClaimProvenance,
  ListRow,
  RosterMember,
  TicketListView,
} from '@gisik-nokma/app-core';
import { Providers } from '../src/providers.js';
import { EMPTY_PREFERENCES, stubServices } from './helpers/stub-services.js';

/**
 * ## The client-side board narrowing (board-prototype-port Task 4)
 *
 * `matchesBoardCard`/`BoardFilterSpec` (Task 3, `13.433`/`13.434`) is a pure
 * predicate with no caller. This file exercises the CALLER: `page.tsx`'s
 * search box, the `N of M shown` count, the removable chip, and the rule that
 * neither renders without the other (`board.tsx:216-219`'s disclosure
 * invariant, restated in the spec at line 240).
 *
 * ## Test 2 is NOT the brief's literal text, and here is the primary source why
 *
 * The brief's own Step 5 snippet asks for a case where `activeOnly: true`
 * makes the board's `N of M shown` avoid a bare `1 of 3 shown`, reasoning that
 * "the server already withheld the terminal ones". `getBoard` cannot receive
 * ANY filter at all — `packages/app-core/src/data-source.ts:134` declares it
 * `getBoard(projectId: string): Promise<BoardView>`, one argument, no filter —
 * and `page.tsx`'s own docblock says so in words ("`useBoard` takes none and
 * cannot be narrowed"). So the board's own `M` is the complete board total
 * under EVERY value of `activeOnly`; the literal assertion is unsatisfiable
 * without either lying (claiming the board is narrowed when it is not) or
 * merging the list's server narrowing into the board's own count element,
 * which the brief's own scope-note rule forbids one paragraph later ("beside
 * the count, not inside it").
 *
 * The real hazard the brief was reaching for — and the one worth a test — is
 * an implementation that sources `M` from `list.rows.length` (which
 * `activeOnly` DOES narrow, server-side) instead of from `board.data` (which
 * it never does). `13.436` below reproduces exactly that: a board fixture
 * with three cards and a list fixture with TWO rows — nonzero, and
 * deliberately different from three rather than zero, so a `list.rows`-sourced
 * `M` would print a plausible "1 of 2 shown" rather than an obviously-broken
 * "1 of 0" — `activeOnly` turned on, and a negative assertion naming that
 * exact wrong string rather than trusting that any wrong answer looks
 * different from the right one.
 */

const PROJECT_ID = '01J9PROJECT000000000000000';
const WORKSPACE_ID = '01J9WORKSPACE0000000000000';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useParams: () => ({ workspaceId: WORKSPACE_ID, projectId: PROJECT_ID }),
  usePathname: () => `/w/${WORKSPACE_ID}/p/${PROJECT_ID}`,
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('../src/auth-client.js', () => ({
  authClient: {
    useSession: () => ({
      data: { user: { id: '01J9USER000000000000000000', name: 'Anselma Marak' } },
    }),
    signOut: async () => ({ data: {}, error: null }),
  },
}));

import ProjectPage from '../app/w/[workspaceId]/p/[projectId]/page.js';

function claim(): ClaimProvenance {
  return {
    actorId: 'user_kiro',
    actorName: 'Kiro',
    clientTime: '2026-08-19T10:00:00.000Z',
    serverTime: '2026-08-19T10:00:01.000Z',
  };
}

function card(overrides: Partial<BoardCard> = {}): BoardCard {
  return {
    ticketId: 't_1',
    title: 'Untitled',
    typeId: 'task',
    assignee: null,
    stateProvenance: claim(),
    // Ruling E5-2 made this REQUIRED on `BoardCard`; `null` is "this ticket
    // claims no date", the same default `boardCardSeed` uses. No case in this
    // file is about the due label.
    dueDate: null,
    // REQUIRED since spec 2026-09-22 and never nullable: the birth default, and
    // no case in this file is about the priority either.
    priority: { value: 'P2', claim: claim() },
    cause: null,
    rollup: null,
    pending: false,
    ...overrides,
  };
}

/** Three cards in one column, one of which contains "board" in its title. */
const threeCards: BoardCard[] = [
  card({ ticketId: 't_1', title: 'Board onboarding checklist' }),
  card({ ticketId: 't_2', title: 'Restock the cold shelf' }),
  card({ ticketId: 't_3', title: 'Renew the lease' }),
];

function boardOf(cards: BoardCard[]): BoardView {
  return {
    projectId: PROJECT_ID,
    groups: [
      {
        workflowId: 'wf_1',
        workflowVersion: 1,
        workflowName: 'Basic',
        columns: [
          { stateId: 'doing', name: 'Doing', category: 'active', blocked: false, cards },
        ],
      },
    ],
  };
}

/**
 * A `FieldClaim`, reusing `claim()`'s fixed actor/instant. `dateClaimOf`
 * (`ticket-dates.ts`) reads a `startDate`/`dueDate` claim's `value` as
 * `{ date }`; `titleOf` reads a `title` claim's `value` as a bare string.
 * Needed because `toTicketDatesInput` maps `row.fields` VERBATIM into what
 * `dateClaimOf` reads — `ListRow.dueDate` (the List tab's own display field,
 * set by overriding `listRow()` directly) is a SEPARATE field `dateClaimOf`
 * never looks at, so a fixture wanting a ticket to render on Calendar or
 * Timeline must set `fields.dueDate` (and, since `titleOf` reads
 * `fields.title` and not the top-level `ListRow.title`, `fields.title` too
 * when a case cares what title those two views show — `13.558` is the first
 * case here that does).
 */
function fieldClaim(value: unknown): FieldClaim {
  const c = claim();
  return { value, actorId: c.actorId, clientTime: c.clientTime, serverTime: c.serverTime };
}

/**
 * A `ListRow` exactly as `view-types.ts` declares it — no `as ListRow`
 * anywhere (matching `project-calendar-timeline.test.tsx`'s own `row()`).
 * Only used to give the LIST a row count that is real, nonzero, and
 * DIFFERENT from the board's, so `13.436` can name the wrong number a
 * `list.rows`-sourced count would actually produce, not merely assert some
 * other number showed up.
 */
function listRow(overrides: Partial<ListRow> = {}): ListRow {
  const base: ListRow = {
    ticketId: 'lt_1',
    title: 'A ticket the list can see',
    typeId: 'task',
    typeRank: 3,
    parentId: null,
    epicId: null,
    stateId: 'doing',
    stateName: 'Doing',
    stateCategory: 'active',
    stateProvenance: claim(),
    assignee: null,
    assignedProvenance: null,
    dueDate: null,
    // REQUIRED since spec 2026-09-22 (see `card()` above).
    priority: { value: 'P2', claim: claim() },
    fields: {
      title: {
        value: 'A ticket the list can see',
        actorId: 'user_kiro',
        clientTime: '2026-08-19T10:00:00.000Z',
        serverTime: '2026-08-19T10:00:01.000Z',
      },
    },
    rollup: null,
    hasRestrictedParent: false,
    pending: false,
    closed: null,
    rank: null,
  };
  return { ...base, ...overrides };
}

/** The shipped-server-shaped stub every case below starts from. */
function servedBoard(cards: BoardCard[], rows: TicketListView['rows'] = []) {
  return stubServices({
    getBoard: async () => boardOf(cards),
    getMembers: async () => [],
    getTicketTypes: async () => [],
    getTickets: async (): Promise<TicketListView> => ({ projectId: PROJECT_ID, rows }),
  });
}

async function searchbox() {
  return screen.findByRole('searchbox');
}

describe('13.435 the board search narrows the grid and reads an honest N of M', () => {
  it('reads N of M shown when a client filter narrows the board', async () => {
    render(
      <Providers services={servedBoard(threeCards)}>
        <ProjectPage />
      </Providers>,
    );
    // Board is the default tab; wait for the unfiltered grid before typing.
    await screen.findByText('Restock the cold shelf');

    await userEvent.type(await searchbox(), 'board');

    expect(await screen.findByText('1 of 3 shown')).toBeInTheDocument();
    // The two non-matching cards actually left the grid — the count is not
    // merely printed beside an unfiltered board.
    expect(screen.queryByText('Restock the cold shelf')).not.toBeInTheDocument();
    expect(screen.queryByText('Renew the lease')).not.toBeInTheDocument();
    expect(screen.getByText('Board onboarding checklist')).toBeInTheDocument();
  });
});

describe('13.436 the count is read from the board’s own data, never the list’s narrower one', () => {
  it('does not source M from list.rows when the server narrowing (“Only tickets in progress”) is on', async () => {
    // The list fixture carries a REAL, nonzero row count — 2 — that is
    // DIFFERENT from the board's 3. `activeOnly`'s server narrowing produces
    // exactly this shape against a real server (terminal tickets withheld
    // from `getTickets`, never from `getBoard`, which cannot take a filter at
    // all — see this file's own docblock). Two nonzero numbers, not "3 vs 0",
    // because a wrong implementation reading `list.rows.length` would print a
    // plausible-looking "1 of 2 shown" here, not an obviously-broken "1 of 0"
    // — the negative assertion below names that exact wrong number rather
    // than trusting that any failure would look different from success.
    render(
      <Providers services={servedBoard(threeCards, [listRow({ ticketId: 'lt_1' }), listRow({ ticketId: 'lt_2' })])}>
        <ProjectPage />
      </Providers>,
    );
    await screen.findByText('Restock the cold shelf');

    await userEvent.click(screen.getByLabelText('Only tickets in progress'));
    // The pre-existing note this page already renders for the toggle — kept
    // intact, not replaced by anything this task adds.
    expect(await screen.findByTestId('list-filter-note')).toHaveTextContent(/in progress/i);

    await userEvent.type(await searchbox(), 'board');

    // Honest: the board's own total is 3, unaffected by `activeOnly`.
    expect(await screen.findByText('1 of 3 shown')).toBeInTheDocument();
    // Named, not merely absent-by-omission: this is what a `list.rows`-sourced
    // `M` would actually print (1 match against 2 list rows), so the case
    // rejects that specific wrong answer rather than any answer that isn't 3.
    expect(screen.queryByText('1 of 2 shown')).not.toBeInTheDocument();
  });
});

describe('13.437 the chip and the count move together', () => {
  it('removing the chip clears the search and restores every card and the whole count', async () => {
    render(
      <Providers services={servedBoard(threeCards)}>
        <ProjectPage />
      </Providers>,
    );
    await screen.findByText('Restock the cold shelf');
    const search = await searchbox();

    await userEvent.type(search, 'board');
    expect(await screen.findByText('1 of 3 shown')).toBeInTheDocument();
    const chip = await screen.findByTestId('board-filter-chip-text');
    expect(chip).toHaveTextContent('Search: "board"');

    await userEvent.click(screen.getByRole('button', { name: /Remove filter/i }));

    // With no filter active at all, the whole strip disappears — count
    // included (13.438's own rule: it is not unconditionally present). A
    // count that lingered at "3 of 3 shown" here would be a second, stale
    // read of the same fact rather than the one this pass just computed.
    await screen.findByText('Renew the lease');
    expect(screen.queryByTestId('board-narrowing')).not.toBeInTheDocument();
    expect(search).toHaveValue('');
    expect(screen.getByText('Restock the cold shelf')).toBeInTheDocument();
    expect(screen.queryByTestId('board-filter-chip-text')).not.toBeInTheDocument();
  });
});

describe('13.438 the strip is not unconditionally present', () => {
  it('renders no narrowing strip while no filter is active', async () => {
    render(
      <Providers services={servedBoard(threeCards)}>
        <ProjectPage />
      </Providers>,
    );
    await screen.findByText('Restock the cold shelf');

    expect(screen.queryByTestId('board-narrowing')).not.toBeInTheDocument();
    expect(screen.queryByText(/shown$/)).not.toBeInTheDocument();
  });
});

/**
 * ## The mirror note — HISTORY (Task 4 fix round 1, coordinator Ruling 10;
 * WIDENED, final whole-branch review's fix wave, Finding 1, 2026-09-16;
 * RETIRED 2026-09-17)
 *
 * From Task 4 to 2026-09-17 the search box sat page-level, above the tab
 * rail, on every tab, but only the BOARD path applied it (`useBoard` could
 * not be narrowed by anything). A note
 * (`data-testid="search-not-applied-note"`) told a sighted person on
 * List/Calendar/Timeline that what they typed did not apply there. Ruling 10
 * gated it on `text` alone; Finding 1 (2026-09-16) widened the gate to cover
 * the five other axes Task 5's Filters sheet later reached onto the same
 * `filter` from every tab.
 *
 * RETIRED (exclude-mode spec §3, 2026-09-17): the filter now reaches every
 * tab for real (`matchesListRow`/`listNarrowing`), so there is nothing left
 * for the note to apologise for. `13.439`/`13.444`, which exercised the note
 * directly, retired with it — their numbers stay unused, never reassigned.
 * `13.517`, which exercised Finding 1's widened gate, FLIPPED into a case
 * (below) asserting the List tab actually NARROWS instead of merely
 * disclosing that it can't.
 */
/**
 * 13.557 — the search box reaches the List tab (exclude-mode spec §3). The
 * mirror note that used to apologise for the opposite is GONE — asserted by
 * its old testid being absent even with a term present.
 */
describe('13.557 the search narrows the List tab, and the note that said otherwise is gone', () => {
  it('a term drops the non-matching row, shows the strip with the LIST\'s own count, and no mirror note', async () => {
    render(
      <Providers
        services={servedBoard(threeCards, [
          listRow({ ticketId: 'lt_1', title: 'Ship the board' }),
          listRow({ ticketId: 'lt_2', title: 'Restock the cold shelf' }),
        ])}
      >
        <ProjectPage />
      </Providers>,
    );
    await screen.findByText('Restock the cold shelf');
    await userEvent.click(await screen.findByRole('tab', { name: 'List' }));
    await screen.findByText('Ship the board');

    await userEvent.type(await searchbox(), 'board');

    expect(await screen.findByText('1 of 2 shown')).toBeInTheDocument(); // the list has 2, the board 3
    expect(screen.queryByText('1 of 3 shown')).not.toBeInTheDocument();
    expect(screen.getByText('Ship the board')).toBeInTheDocument();
    expect(screen.queryByText('Restock the cold shelf')).not.toBeInTheDocument();
    expect(screen.getByTestId('board-filter-chip-text')).toHaveTextContent('Search: "board"');
    expect(screen.queryByTestId('search-not-applied-note')).not.toBeInTheDocument();
    expect(screen.getByTestId('list-narrowing')).toHaveTextContent('narrowed to your filters');
  });

  it('13.558 the Timeline draws from the narrowed rows at ticket level; the Calendar shows the same count', async () => {
    // `fields.dueDate`, not the top-level `ListRow.dueDate` the brief's own
    // snippet set — `dateClaimOf` reads `row.fields` verbatim (see
    // `fieldClaim`'s own docblock above), so a fixture setting only the
    // top-level field renders NOTHING on either view, which would make every
    // assertion below pass or fail for the wrong reason.
    render(
      <Providers
        services={servedBoard(threeCards, [
          listRow({
            ticketId: 'lt_1',
            title: 'Ship the board',
            fields: { title: fieldClaim('Ship the board'), dueDate: fieldClaim({ date: '2026-09-18' }) },
          }),
          listRow({
            ticketId: 'lt_2',
            title: 'Restock the cold shelf',
            fields: { title: fieldClaim('Restock the cold shelf'), dueDate: fieldClaim({ date: '2026-09-18' }) },
          }),
        ])}
      >
        <ProjectPage />
      </Providers>,
    );
    await screen.findByText('Restock the cold shelf');
    await userEvent.type(await searchbox(), 'board');

    // The strip's own count ("1 of 2 shown") is `listNarrowing`'s alone — it
    // says nothing about `dateInputs`, the SEPARATE memo `CalendarView`/
    // `TimelineView` actually read their tickets from, so this loop alone
    // cannot tell a correct `dateInputs` from a stale, unnarrowed one.
    for (const tab of ['Calendar', 'Timeline']) {
      await userEvent.click(await screen.findByRole('tab', { name: tab }));
      expect(await screen.findByText('1 of 2 shown')).toBeInTheDocument();
      expect(screen.queryByTestId('search-not-applied-note')).not.toBeInTheDocument();
    }

    // The loop above leaves Timeline active. A due-only ticket (no
    // `startDate`) lands in `TimelineView`'s own `sideList` — "Undated or
    // partially dated" — never the main dated grid (`timeline-model.ts`'s
    // `classify`), but `sideList` entries render `entry.title` regardless
    // (`timeline-view.tsx:317-321`), so this is a real discriminator: it
    // reads whichever rows `dateInputs` actually carried. `CalendarView` has
    // no equivalent for a due-only marker — it renders only a date label,
    // never the ticket's title (`calendar-view.tsx:465-477`) — so Timeline is
    // the one tab that can prove this without a `startDate` too.
    expect(await screen.findByText('Ship the board')).toBeInTheDocument();
    expect(screen.queryByText('Restock the cold shelf')).not.toBeInTheDocument();
  });

  it('13.559 clearing the term restores the row and removes the strip on the List tab', async () => {
    render(
      <Providers services={servedBoard(threeCards, [listRow({ ticketId: 'lt_1', title: 'Ship the board' }), listRow({ ticketId: 'lt_2', title: 'Restock the cold shelf' })])}>
        <ProjectPage />
      </Providers>,
    );
    await screen.findByText('Restock the cold shelf');
    await userEvent.click(await screen.findByRole('tab', { name: 'List' }));
    const search = await searchbox();
    await userEvent.type(search, 'board');
    await screen.findByText('1 of 2 shown');

    await userEvent.clear(search);

    expect(await screen.findByText('Restock the cold shelf')).toBeInTheDocument();
    expect(screen.queryByTestId('board-narrowing')).not.toBeInTheDocument();
  });
});

/**
 * ## Finding 1, final whole-branch review's fix wave (2026-09-16) — HISTORY,
 * FLIPPED 2026-09-17 (exclude-mode spec §3)
 *
 * Finding 1 found the (now-retired) mirror note's gate inert on five
 * Filters-sheet axes beyond `text`; `13.517` originally drove the Filters
 * sheet's real Assignee control — open it, tick a real checkbox, press Done,
 * rather than writing `filter.assigneeIds` directly — to prove the note
 * appeared. The mirror note no longer exists (see its own docblock above),
 * so `13.517` below is FLIPPED: the SAME real path, now asserting the List
 * tab actually NARROWS rather than that a note appears. `ROSTER` (a real
 * roster; `board-narrowing.test.tsx`'s own `servedBoard` stubs `getMembers`
 * to `[]`) is still what that real path needs, reused by `13.560`/`13.561`
 * and `13.556b` (all below) as well.
 */
/**
 * `role` is REQUIRED since 2026-09-18 (case 13.760): `getMembers` answers
 * `RosterMember[]` now, because the route has always sent a `role` per person
 * and the members screen DRAWS it — a roster fixture without one would be a
 * body the server cannot send. The board itself reads only the name.
 */
const ROSTER: RosterMember[] = [{ id: 'u1', name: 'Uma One', role: 'owner' }];

/**
 * Full `TicketTypeDef` shape (controller's resolution of 13.561's
 * conditional) — `customDateFieldsByType` (`src/ticket-dates-input.ts`) reads
 * `.fields` on every entry unconditionally, so an `{id, name}`-only fixture
 * throws before the create dialog's parent picker is ever reached. Same
 * shape as `filters-sheet.test.tsx`'s own `TYPES`.
 */
const TYPES: TicketTypeDef[] = [
  { id: 'task', name: 'Task', icon: 'check', rank: 3, workflowId: 'wf_1', fields: [] },
  { id: 'bug', name: 'Bug', icon: 'bug', rank: 3, workflowId: 'wf_1', fields: [] },
];

async function openFiltersAndPickAssignee(name: string) {
  await userEvent.click(await screen.findByRole('button', { name: 'Filters' }));
  const dialog = await screen.findByRole('dialog', { name: 'Filters' });
  const group = within(dialog).getByRole('group', { name: 'Assignee' });
  await userEvent.click(within(group).getByRole('button', { name }));
  // Finding 1's own scenario: "tick an assignee, press Done" — Done and
  // Escape both close the sheet (`13.446`/`13.461` prove that separately),
  // but this drives the literal path named rather than a merely-equivalent one.
  await userEvent.click(within(dialog).getByRole('button', { name: 'Done' }));
}

describe('13.517 (flipped 2026-09-17) an assignee picked in the Filters sheet narrows the List tab', () => {
  it('drops the row assigned to someone else and discloses through the strip, not a note', async () => {
    render(
      <Providers
        services={stubServices({
          getBoard: async () => boardOf(threeCards),
          getMembers: async () => ROSTER,
          getTicketTypes: async () => [],
          getTickets: async (): Promise<TicketListView> => ({
            projectId: PROJECT_ID,
            rows: [
              listRow({ ticketId: 'lt_1', title: 'Restock the cold shelf', assignee: { id: 'u1', name: 'Uma One' } }),
              listRow({ ticketId: 'lt_2', title: 'A ticket nobody owns' }),
            ],
          }),
        })}
      >
        <ProjectPage />
      </Providers>,
    );
    await screen.findByText('Restock the cold shelf');
    await userEvent.click(await screen.findByRole('tab', { name: 'List' }));
    await screen.findByText('A ticket nobody owns');

    await openFiltersAndPickAssignee('Uma One');

    expect(await screen.findByText('1 of 2 shown')).toBeInTheDocument();
    expect(screen.getByTestId('board-filter-chip-assigneeIds')).toHaveTextContent('Uma One');
    expect(screen.queryByText('A ticket nobody owns')).not.toBeInTheDocument();
    expect(screen.queryByTestId('search-not-applied-note')).not.toBeInTheDocument();
  });

  it('13.560 an EXCLUDED assignee drops the row assigned to them instead', async () => {
    render(
      <Providers
        services={stubServices({
          getBoard: async () => boardOf(threeCards),
          getMembers: async () => ROSTER,
          getTicketTypes: async () => [],
          getTickets: async (): Promise<TicketListView> => ({
            projectId: PROJECT_ID,
            rows: [
              listRow({ ticketId: 'lt_1', title: 'Restock the cold shelf', assignee: { id: 'u1', name: 'Uma One' } }),
              listRow({ ticketId: 'lt_2', title: 'A ticket nobody owns' }),
            ],
          }),
        })}
      >
        <ProjectPage />
      </Providers>,
    );
    await screen.findByText('Restock the cold shelf');
    await userEvent.click(await screen.findByRole('tab', { name: 'List' }));
    await screen.findByText('A ticket nobody owns');

    await userEvent.click(await screen.findByRole('button', { name: 'Filters' }));
    const dialog = await screen.findByRole('dialog', { name: 'Filters' });
    const group = within(dialog).getByRole('group', { name: 'Assignee' });
    await userEvent.click(within(group).getByRole('button', { name: 'Uma One' }));
    await userEvent.click(within(group).getByRole('button', { name: 'Uma One, included' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Done' }));

    expect(await screen.findByText('1 of 2 shown')).toBeInTheDocument();
    expect(screen.getByTestId('board-filter-chip-exclude.assigneeIds')).toHaveTextContent('Not assignee: Uma One');
    expect(screen.getByText('A ticket nobody owns')).toBeInTheDocument();
    expect(screen.queryByText('Restock the cold shelf')).not.toBeInTheDocument();
  });

  it('13.561 the create dialog\'s parent picker still offers the filtered-out ticket', async () => {
    render(
      <Providers
        services={stubServices({
          getBoard: async () => boardOf(threeCards),
          getMembers: async () => ROSTER,
          getTicketTypes: async () => TYPES,
          getPreferences: async () => EMPTY_PREFERENCES,
          getTickets: async (): Promise<TicketListView> => ({
            projectId: PROJECT_ID,
            rows: [
              listRow({ ticketId: 'lt_1', title: 'Restock the cold shelf', assignee: { id: 'u1', name: 'Uma One' } }),
              listRow({ ticketId: 'lt_2', title: 'A ticket nobody owns' }),
            ],
          }),
        })}
      >
        <ProjectPage />
      </Providers>,
    );
    await screen.findByText('Restock the cold shelf');
    await openFiltersAndPickAssignee('Uma One');
    // `threeCards` carries no assignee at all, so the BOARD narrows to none — the
    // pick is real and the list rows (one of which IS Uma's) are what the picker reads.
    await screen.findByText('0 of 3 shown');

    await userEvent.click(await screen.findByRole('button', { name: 'New ticket' }));
    await userEvent.click(screen.getByRole('combobox', { name: 'Parent' }));
    const options = within(await screen.findByRole('listbox')).getAllByRole('option').map((o) => o.textContent);
    expect(options).toContain('A ticket nobody owns');
    await userEvent.keyboard('{Escape}');
  });
});

/**
 * 13.556b — controller ruling on Task 10's fix round 1: the scope note names
 * the tab it is on. `collaboratorIds` is `ListFilterSpec`'s one unanswerable
 * axis (same reason `board-filter.ts` gives for the board — see
 * `describeUnappliedListAxes`'s own docblock in `board-search-scope.ts`), so
 * an excluded collaborator on the LIST tab narrows nothing and earns no chip
 * in either direction — the scope note is the only disclosure, and it must
 * say "the list", not "the board", now that it renders on both.
 */
describe('13.556b the scope note names the LIST tab, not the board, when it renders there', () => {
  it('an excluded collaborator on the List tab narrows nothing and the note says "the list"', async () => {
    render(
      <Providers
        services={stubServices({
          getBoard: async () => boardOf(threeCards),
          getMembers: async () => ROSTER,
          getTicketTypes: async () => [],
          getTickets: async (): Promise<TicketListView> => ({
            projectId: PROJECT_ID,
            rows: [
              listRow({ ticketId: 'lt_1', title: 'Restock the cold shelf' }),
              listRow({ ticketId: 'lt_2', title: 'A ticket nobody owns' }),
            ],
          }),
        })}
      >
        <ProjectPage />
      </Providers>,
    );
    await screen.findByText('Restock the cold shelf');
    await userEvent.click(await screen.findByRole('tab', { name: 'List' }));
    await screen.findByText('A ticket nobody owns');

    await userEvent.click(await screen.findByRole('button', { name: 'Filters' }));
    const dialog = await screen.findByRole('dialog', { name: 'Filters' });
    const group = within(dialog).getByRole('group', { name: 'Collaborators' });
    await userEvent.click(within(group).getByRole('button', { name: 'Uma One' }));
    await userEvent.click(within(group).getByRole('button', { name: 'Uma One, included' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Done' }));

    const note = await screen.findByTestId('board-scope-note');
    expect(note).toHaveTextContent(/not applied on the list/i);
    expect(note).toHaveTextContent(/collaborator/i);
    expect(screen.queryByTestId('board-filter-chip-exclude.collaboratorIds')).not.toBeInTheDocument();
    expect(screen.getByTestId('board-narrowing')).toBeInTheDocument();
    expect(screen.getByText('Restock the cold shelf')).toBeInTheDocument();
    expect(screen.getByText('A ticket nobody owns')).toBeInTheDocument();
  });
});

/**
 * ## The workflow picker (board-prototype-port Task 8, Ruling R3)
 *
 * Narrows by dropping a whole GROUP, never by setting an axis on `filter`/
 * `boardFilter` — `matchesBoardCard` has no group in its signature, so no
 * chip built by `buildFilterChips` (renamed 2026-09-17; was
 * `buildBoardFilterChips`) could ever name this mechanism.
 * These cases exercise the debt Task 4 named for the mechanism that could
 * eventually produce "narrowing with no filter axis set": before this task,
 * nothing could ever make `boardNarrowing.shown !== boardNarrowing.total`
 * true while `activeFilterChips` stayed empty, so
 * `shouldRenderNarrowingStrip`'s (renamed 2026-09-17; was
 * `shouldRenderBoardNarrowingStrip`) third term was verified by reading the
 * code, not by a test that reaches it through real data. This file's own
 * cases are that test now (`13.470` below).
 *
 * `defaultWorkflow`/`bugWorkflow` deliberately reuse the workflow's own
 * NAME ("Default"/"Bug triage") on BOTH the board's group heading
 * (`<h2 className="gn-board__workflow">`, `board.tsx` — an `h3` until E4-24,
 * below) and the picker's own
 * `<option>` text — the picker's options are built from the same
 * `workflowName` field the heading reads. `screen.getByText('Default')`
 * would therefore match BOTH elements and throw on an ambiguous query; the
 * group-heading assertions below use `getByRole('heading', { level: 2,
 * name: … })` instead, which is also the MORE precise check (it proves the
 * board's own group rail rendered, not merely that the string exists
 * somewhere on the page — the option would have supplied that either way).
 *
 * Cards render as `<li data-testid="ticket-card-…">` inside a `<ul>`
 * (`board.tsx`), not `role="article"` — matching the discipline the
 * existing `packages/app-core/test/views/board.test.tsx` already uses
 * (`getAllByRole('listitem')`), per this task's own brief ("use the query
 * the existing `board.test.tsx` uses rather than adding a role to satisfy a
 * test"). Verified against this exact page mount, not assumed. `AttentionStrip`
 * was the component to check here — it returns `null` for an empty `items`
 * array, and every fixture below stubs `getAttention` to `[]` — but the strip
 * left the project page on 2026-09-18 (owner: *"the attention section should not
 * be there in the project page"*; case 13.881), so nothing it would have drawn
 * is on this page at all, and **the `getAttention: async () => []` overrides this
 * file used to carry are gone with it.** An override for a read a page never
 * makes is a fixture telling the next reader that it does — and 13.881 now
 * asserts that read is never made, so leaving them would leave entries the
 * suite's own case contradicts.
 *
 * **All EIGHTEEN were swept in the same change**, measured on the fix round's own
 * diff as `^- *getAttention: async \(\) => \[\],$` with the ADDED side returning
 * 0 in the same invocation as the control: **7 here**, 1 each in `backlog-tab`,
 * `filters-sheet` and `list-bulk-close`, and **8** in `project-calendar-timeline`.
 * *(An earlier draft of this paragraph said "eleven" — the count you get from
 * sweeping four of the five files and forgetting this one. It was caught in
 * review, which is the second reason it is written out per-file here.)* Every one
 * of the five is a `ProjectPage`-only fixture. **`my-work-open-shared` and
 * `page-refusals` KEEP theirs**, because they mount `MyWorkPage`, where the strip
 * still lives — the distinction is which page the fixture mounts, not which file
 * it is in. Nothing else this page mounts (`AppNav`, `FiltersSheet` closed)
 * renders a `<li>` either.
 */

/** Two columns, two cards — the workflow this project's board is attached to before Task 8 ever runs. */
const defaultWorkflow: BoardGroup = {
  workflowId: 'wf-default',
  workflowVersion: 1,
  workflowName: 'Default',
  columns: [
    {
      stateId: 'todo',
      name: 'To do',
      category: 'open',
      blocked: false,
      cards: [card({ ticketId: 'd_1', title: 'Default lane card one' })],
    },
    {
      stateId: 'doing',
      name: 'Doing',
      category: 'active',
      blocked: false,
      cards: [card({ ticketId: 'd_2', title: 'Default lane card two' })],
    },
  ],
};

/** Two columns, three cards — a second workflow attached to the same project, so the picker has something to pick between. */
const bugWorkflow: BoardGroup = {
  workflowId: 'wf-bug',
  workflowVersion: 1,
  workflowName: 'Bug triage',
  columns: [
    {
      stateId: 'triage',
      name: 'Triage',
      category: 'open',
      blocked: false,
      cards: [
        card({ ticketId: 'b_1', title: 'Bug lane card one' }),
        card({ ticketId: 'b_2', title: 'Bug lane card two' }),
      ],
    },
    {
      stateId: 'fixing',
      name: 'Fixing',
      category: 'active',
      blocked: false,
      cards: [card({ ticketId: 'b_3', title: 'Bug lane card three' })],
    },
  ],
};

/** Two columns, zero cards in either — a workflow attached to the project with nothing filed against it yet, for the Ruling 20(a) fixture below. */
const emptyWorkflow: BoardGroup = {
  workflowId: 'wf-empty',
  workflowVersion: 1,
  workflowName: 'Onboarding',
  columns: [
    { stateId: 'intake', name: 'Intake', category: 'open', blocked: false, cards: [] },
    { stateId: 'review', name: 'Review', category: 'active', blocked: false, cards: [] },
  ],
};

/** One column, one card — a THIRD workflow, distinct from both `defaultWorkflow` and `bugWorkflow`, standing in for `bugWorkflow` after it "disappears" mid-session in the Ruling 20(b) fixture below. */
const otherWorkflow: BoardGroup = {
  workflowId: 'wf-other',
  workflowVersion: 1,
  workflowName: 'Support',
  columns: [
    {
      stateId: 'open',
      name: 'Open',
      category: 'open',
      blocked: false,
      cards: [card({ ticketId: 'o_1', title: 'Support lane card one' })],
    },
  ],
};

/** Same shipped-server-shaped stub `servedBoard` above builds, but over a caller-supplied `BoardView` rather than `boardOf`'s single fixed group — this suite's own fixtures need MULTIPLE groups, which `boardOf` cannot produce. */
function renderProjectPage({ groups }: { groups: BoardGroup[] }) {
  const board: BoardView = { projectId: PROJECT_ID, groups };
  return render(
    <Providers
      services={stubServices({
        getBoard: async () => board,
        getMembers: async () => [],
        getTicketTypes: async () => [],
        getTickets: async (): Promise<TicketListView> => ({ projectId: PROJECT_ID, rows: [] }),
      })}
    >
      <ProjectPage />
    </Providers>,
  );
}

async function workflowSelect() {
  return screen.findByRole('combobox', { name: /workflow/i });
}

describe('13.468 the picker defaults to All workflows, and the default drops no card', () => {
  it('renders every group with the picker at its default value', async () => {
    renderProjectPage({ groups: [defaultWorkflow, bugWorkflow] });
    await screen.findByText('Default lane card one');

    expect(await workflowSelect()).toHaveValue('all');
    expect(screen.getByRole('heading', { level: 2, name: 'Default' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Bug triage' })).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(5);
    // The resting state has dropped nothing, so the disclosure strip this
    // mechanism shares with the client filter (13.438's own rule) stays
    // absent — a stray "5 of 5 shown" here would itself be the small lie
    // 13.438 already guards against for the card filter.
    expect(screen.queryByTestId('board-narrowing')).not.toBeInTheDocument();
  });
});

describe('13.469 the picker does not render where it offers no real choice', () => {
  it('renders no workflow combobox for a project with exactly one workflow', async () => {
    renderProjectPage({ groups: [defaultWorkflow] });
    await screen.findByText('Default lane card one');

    // Mirrors `Board`'s own identical judgment one level down: the group
    // heading (`board.groups.length > 1 ? <h3>…`) is also absent here —
    // checked as a cross-confirmation that this fixture really does carry
    // only one workflow, not merely trusted from the fixture's own shape.
    expect(screen.queryByRole('heading', { level: 2 })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /workflow/i })).not.toBeInTheDocument();
  });
});

describe('13.470 the picker discloses through the SAME count and chip the client filter uses', () => {
  it('narrows to the picked workflow and names what it hid', async () => {
    renderProjectPage({ groups: [defaultWorkflow, bugWorkflow] });
    await screen.findByText('Default lane card one');

    await userEvent.selectOptions(await workflowSelect(), 'wf-bug');

    // board.tsx:216-219 — a rearrangement that drops a card is a filter
    // wearing a grouping's name. This one is labelled as a filter (the
    // chip) and says what it hid (the count).
    expect(await screen.findByText('3 of 5 shown')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /remove.*Bug triage/i })).toBeInTheDocument();
    // Named, not merely counted: proves the SURVIVING three are the bug
    // workflow's own cards, discriminating "the right group survived" from
    // "some three cards survived" — the same discipline 13.435 already
    // applies to the card-level filter, one section up.
    expect(screen.queryByText('Default lane card one')).not.toBeInTheDocument();
    expect(screen.queryByText('Default lane card two')).not.toBeInTheDocument();
    expect(screen.getByText('Bug lane card one')).toBeInTheDocument();
    expect(screen.getByText('Bug lane card two')).toBeInTheDocument();
    expect(screen.getByText('Bug lane card three')).toBeInTheDocument();
    // The dropped workflow's own group heading is gone too — Board renders
    // every group `boardNarrowing.view` hands it exactly once, and the
    // Default group is no longer one of them.
    expect(screen.queryByRole('heading', { level: 2, name: 'Default' })).not.toBeInTheDocument();
  });
});

describe('13.471 the chip and the count move together for the workflow picker too', () => {
  it('restores every group and the picker’s own default when the chip is removed', async () => {
    renderProjectPage({ groups: [defaultWorkflow, bugWorkflow] });
    await screen.findByText('Default lane card one');

    await userEvent.selectOptions(await workflowSelect(), 'wf-bug');
    await screen.findByText('3 of 5 shown');

    await userEvent.click(screen.getByRole('button', { name: /remove.*Bug triage/i }));

    await screen.findByText('Default lane card one');
    expect(screen.getAllByRole('listitem')).toHaveLength(5);
    expect(await workflowSelect()).toHaveValue('all');
    // With nothing narrowed at all, the whole strip disappears — the SAME
    // rule 13.438 already pins for the card-level filter, proven here for
    // the group-level one.
    expect(screen.queryByTestId('board-narrowing')).not.toBeInTheDocument();
  });
});

/**
 * ## Fix round — coordinator Ruling 20, 2026-09-16
 *
 * Two closures the coordinator required after reviewing Task 8: `13.472`
 * takes up the offer the Task 8 report itself made (composition had proven
 * the empty-picked-workflow / `isNarrowed` interaction correct by reading two
 * unchanged expressions; the coordinator wanted it run, not only reasoned
 * about — "composition proves the pieces; it does not run them together").
 * `13.473` closes the report's OWN second concern (Ruling 20(b)): a picked
 * workflow that drops out of `board.data` mid-session now falls back to
 * `'all'` (`resolvedWorkflowFilter`, `page.tsx`) rather than narrowing to a
 * phantom.
 */

describe('13.472 an empty picked workflow suppresses EMPTY_BOARD_COPY, not the per-column empty states', () => {
  it('narrows to the empty group, hides the whole-board sentence, and still draws the rail', async () => {
    renderProjectPage({ groups: [defaultWorkflow, emptyWorkflow] });
    await screen.findByText('Default lane card one');

    await userEvent.selectOptions(await workflowSelect(), 'wf-empty');

    // The strip discloses the narrowing through the SAME `shown`/`total`
    // pair `isNarrowed` reads below — `0 of 2`, not `0 of 0`: the two
    // DEFAULT-workflow cards are real and still counted in `total`, even
    // though the picked group holds neither of them.
    expect(await screen.findByText('0 of 2 shown')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /remove.*Onboarding/i })).toBeInTheDocument();

    // R19's whole point, exercised through REAL group-dropping data rather
    // than composed by reading two unchanged expressions: the remedy for an
    // empty picked workflow is the chip in the strip, not "create one" — a
    // project that DOES hold tickets (Default's own two) must never say it
    // has none.
    expect(screen.queryByText(EMPTY_BOARD_COPY)).not.toBeInTheDocument();

    // The rail still draws: two per-column empty states, one per Onboarding
    // column, proving `Board` rendered every column the surviving group
    // declares rather than collapsing to nothing once `EMPTY_BOARD_COPY` is
    // suppressed.
    expect(screen.getAllByText(EMPTY_COLUMN_COPY)).toHaveLength(2);
    expect(screen.getByRole('region', { name: 'Intake' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Review' })).toBeInTheDocument();
  });
});

describe('13.473 an unresolvable picked workflow falls back to All, not a phantom narrowing', () => {
  it('resets the picker to All when the picked workflow disappears from the board mid-session', async () => {
    const { rerender } = renderProjectPage({ groups: [defaultWorkflow, bugWorkflow] });
    await screen.findByText('Default lane card one');

    await userEvent.selectOptions(await workflowSelect(), 'wf-bug');
    await screen.findByText('3 of 5 shown');

    // A LIVE re-fetch mid-session (the workflow reassigned or detached
    // elsewhere), not a fresh mount: `rerender` keeps the SAME `ProjectPage`
    // instance mounted, so `workflowFilter`'s own state SURVIVES the update
    // and still names the now-absent 'wf-bug' — exactly the shape Ruling
    // 20(b) describes. This is not a simulation hack: `Providers` passes a
    // NEW `services` object straight into context on every render
    // (`value = services ?? constructed`, no memo wrapping an injected
    // value), which changes `useLiveQuery`'s own `source` identity, which is
    // in ITS first effect's dependency array — the exact path a real
    // workspace-stream event drives in production. The new board keeps TWO
    // groups (`defaultWorkflow` + `otherWorkflow`, replacing `bugWorkflow`)
    // so the picker itself stays mounted and its own `value` is directly
    // assertable, rather than folding this case into the single-workflow
    // gate (`13.469`) it is not about.
    rerender(
      <Providers
        services={stubServices({
          getBoard: async () => ({ projectId: PROJECT_ID, groups: [defaultWorkflow, otherWorkflow] }),
          getMembers: async () => [],
          getTicketTypes: async () => [],
          getTickets: async (): Promise<TicketListView> => ({ projectId: PROJECT_ID, rows: [] }),
        })}
      >
        <ProjectPage />
      </Providers>,
    );

    await screen.findByText('Support lane card one');
    // Falls back to the picker's own resting state (R3) rather than staying
    // pointed at a workflow that no longer exists.
    expect(await workflowSelect()).toHaveValue('all');
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    // Not merely "some strip" — NO strip at all: the fallback is `'all'`,
    // which drops nothing, so `shown === total` and the THIRD gate term
    // (the one `13.470` proved fires for group-dropping) is false again too.
    expect(screen.queryByTestId('board-narrowing')).not.toBeInTheDocument();
  });
});

/**
 * 13.601 — Calendar and Timeline hide closed tickets by default (Task 11,
 * Ruling 44, spec §5.5): a closed ticket with a due date is absent from both
 * tabs until the mandated "Closed: hidden" chip (key `closed-default`,
 * distinct from the EXPLICIT control's own `closed` chip) is removed; an
 * explicit "Closed only" overrides the default in the other direction.
 * `AMENDED` per Ruling 44's own text: "removing the Closed: hidden chip shows
 * the closed ticket on the Calendar; the List tab is unaffected; the Timeline
 * likewise" — the List-tab check below is that amendment, exercised directly.
 */
describe('13.601 Calendar and Timeline hide closed tickets by default, disclosed by their own chip', () => {
  const datedRows: ListRow[] = [
    listRow({
      ticketId: 'lt_open',
      title: 'Ship the board',
      fields: { title: fieldClaim('Ship the board'), dueDate: fieldClaim({ date: '2026-09-18' }) },
    }),
    listRow({
      ticketId: 'lt_closed',
      title: 'Archive the old workflow',
      closed: { actorId: 'user_kiro', at: '2026-09-17T00:00:00.000Z' },
      fields: { title: fieldClaim('Archive the old workflow'), dueDate: fieldClaim({ date: '2026-09-18' }) },
    }),
  ];

  it('hides the closed ticket on the Calendar tab by default; removing the chip shows it', async () => {
    render(
      <Providers services={servedBoard(threeCards, datedRows)}>
        <ProjectPage />
      </Providers>,
    );
    await screen.findByText('Restock the cold shelf');
    await userEvent.click(await screen.findByRole('tab', { name: 'Calendar' }));

    expect(await screen.findByText('1 of 2 shown')).toBeInTheDocument();
    expect(screen.getByTestId('board-filter-chip-closed-default')).toHaveTextContent('Closed: hidden');

    await userEvent.click(screen.getByRole('button', { name: /Remove filter.*Closed: hidden/i }));

    // `CalendarView` renders a due-only marker's LABEL, never the ticket's
    // title (13.558's own discriminator), so there is no title text to query
    // for on this tab. The strip vanishing ENTIRELY — the same proof
    // `13.437`/`13.471` use for "everything reset" — is what it means for
    // `shown` to have become `total` again: nothing left active (no explicit
    // chip, the default no longer in force) and nothing left hidden.
    expect(screen.queryByTestId('board-narrowing')).not.toBeInTheDocument();
  });

  it('the Timeline tab hides the same closed ticket by default, at ticket level; the List tab is unaffected', async () => {
    render(
      <Providers services={servedBoard(threeCards, datedRows)}>
        <ProjectPage />
      </Providers>,
    );
    await screen.findByText('Restock the cold shelf');
    await userEvent.click(await screen.findByRole('tab', { name: 'Timeline' }));

    // Due-only rows land in Timeline's own "Undated or partially dated" side
    // list, which renders titles directly (13.558's own discriminator) — a
    // real presence/absence check, not only a count.
    await screen.findByText('Ship the board');
    expect(screen.queryByText('Archive the old workflow')).not.toBeInTheDocument();
    expect(screen.getByTestId('board-filter-chip-closed-default')).toHaveTextContent('Closed: hidden');

    await userEvent.click(screen.getByRole('button', { name: /Remove filter.*Closed: hidden/i }));
    expect(await screen.findByText('Archive the old workflow')).toBeInTheDocument();

    // THE AMENDMENT: the List tab never applied this default at all —
    // `listFilterSpec.closed` carries only the EXPLICIT control, so the
    // closed row is visible there regardless of `showClosedOnDates`.
    await userEvent.click(await screen.findByRole('tab', { name: 'List' }));
    expect(await screen.findByText('Archive the old workflow')).toBeInTheDocument();
    expect(screen.getByText('Ship the board')).toBeInTheDocument();
    expect(screen.queryByTestId('board-filter-chip-closed-default')).not.toBeInTheDocument();
  });

  it('an explicit "Closed only" on the Calendar tab overrides the default and shows only the closed ticket', async () => {
    render(
      <Providers services={servedBoard(threeCards, datedRows)}>
        <ProjectPage />
      </Providers>,
    );
    await screen.findByText('Restock the cold shelf');
    await userEvent.click(await screen.findByRole('tab', { name: 'Calendar' }));
    await screen.findByText('1 of 2 shown');

    await userEvent.click(await screen.findByRole('button', { name: 'Filters' }));
    const dialog = await screen.findByRole('dialog', { name: 'Filters' });
    const group = within(dialog).getByRole('group', { name: 'Closed' });
    await userEvent.click(within(group).getByRole('button', { name: 'Closed' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Done' }));

    // Same numeric shape as the default (1 of 2), but the SURVIVING ticket is
    // the opposite one — the explicit control, not the default, is now
    // driving the narrowing, and only one "Closed: …" chip is present.
    expect(await screen.findByText('1 of 2 shown')).toBeInTheDocument();
    expect(screen.getByTestId('board-filter-chip-closed')).toHaveTextContent('Closed: only');
    expect(screen.queryByTestId('board-filter-chip-closed-default')).not.toBeInTheDocument();
  });
});
