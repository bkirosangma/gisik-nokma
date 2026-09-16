import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { EMPTY_BOARD_COPY, EMPTY_COLUMN_COPY } from '@gisik-nokma/app-core';
import type {
  BoardCard,
  BoardGroup,
  BoardView,
  ClaimProvenance,
  ListRow,
  TicketListView,
} from '@gisik-nokma/app-core';
import { Providers } from '../src/providers.js';
import { stubServices } from './helpers/stub-services.js';

/**
 * ## The client-side board narrowing (board-prototype-port Task 4)
 *
 * `matchesBoardCard`/`BoardFilterSpec` (Task 3, `13.433`/`13.434`) is a pure
 * predicate with no caller. This file exercises the CALLER: `page.tsx`'s
 * search box, the `N of M shown` count, the removable chip, and the rule that
 * neither renders without the other (`board.tsx:42-46`'s disclosure
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
  };
  return { ...base, ...overrides };
}

/** The shipped-server-shaped stub every case below starts from. */
function servedBoard(cards: BoardCard[], rows: TicketListView['rows'] = []) {
  return stubServices({
    getBoard: async () => boardOf(cards),
    getAttention: async () => [],
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
 * ## The mirror note (Task 4 fix round 1, coordinator Ruling 10; WIDENED,
 * final whole-branch review's fix wave, Finding 1, 2026-09-16)
 *
 * The search box sits page-level, above the tab rail, on every tab — but only
 * the BOARD path applies it (`useBoard` cannot be narrowed by anything; the
 * spec's own search ruling exists to avoid "one search box... answer[ing]
 * differently on two tabs"). A sighted person on List/Calendar/Timeline who
 * types into it would otherwise watch nothing happen with no explanation.
 * This note is the fix — and it must appear ONLY while something is actually
 * set on `filter` (never a permanent sentence on three tabs) and ONLY on the
 * tabs where that something does not apply (never on Board, where at least
 * part of it does).
 *
 * Exercised on all three non-board tabs individually (List and Timeline
 * below, Calendar in `13.444` — a Minor from the review: the gate is one
 * uniform `view !== 'board'` check, so divergence was unlikely, but
 * "unlikely" is not "tested").
 *
 * Finding 1: the gate was `activeFilterChips.some((chip) => chip.key ===
 * 'text')` — inert on the FIVE other axes Task 5's Filters sheet later
 * reached onto the same `filter` from every tab (open Filters on List, tick
 * an assignee, press Done: the list does not change, and nothing said so).
 * `13.517` below drives that exact path through the real sheet, on a
 * non-board tab, and is the case that would redden if the gate reverted to
 * the `text`-only check.
 */
describe('13.439 the tabs where search does not apply say so — only while a term is present', () => {
  it('shows nothing on the List tab until a search term exists, then names the limit', async () => {
    render(
      <Providers services={servedBoard(threeCards)}>
        <ProjectPage />
      </Providers>,
    );
    await screen.findByText('Restock the cold shelf');
    await userEvent.click(await screen.findByRole('tab', { name: 'List' }));

    // No term yet — a permanent sentence here would be noise nobody reads.
    expect(screen.queryByTestId('search-not-applied-note')).not.toBeInTheDocument();

    await userEvent.type(await searchbox(), 'board');

    const note = await screen.findByTestId('search-not-applied-note');
    expect(note).toHaveTextContent(/not applied on this tab/i);
  });

  it('never shows the note on the Board tab itself, even with a term present', async () => {
    render(
      <Providers services={servedBoard(threeCards)}>
        <ProjectPage />
      </Providers>,
    );
    await screen.findByText('Restock the cold shelf');

    await userEvent.type(await searchbox(), 'board');
    await screen.findByText('1 of 3 shown');

    // The search DOES apply here — naming a limit that isn't real would be
    // its own small lie.
    expect(screen.queryByTestId('search-not-applied-note')).not.toBeInTheDocument();
  });

  it('disappears again once the search term is cleared', async () => {
    render(
      <Providers services={servedBoard(threeCards)}>
        <ProjectPage />
      </Providers>,
    );
    await screen.findByText('Restock the cold shelf');
    await userEvent.click(await screen.findByRole('tab', { name: 'Timeline' }));
    const search = await searchbox();

    await userEvent.type(search, 'board');
    await screen.findByTestId('search-not-applied-note');

    await userEvent.clear(search);

    expect(screen.queryByTestId('search-not-applied-note')).not.toBeInTheDocument();
  });

  /**
   * 13.444 — the Minor the review flagged: the gate is a uniform
   * `view !== 'board'` check, so List and Timeline (above) already imply
   * Calendar behaves the same way — but "unlikely to diverge" is not
   * "tested", and this is the arm those two cases didn't cover.
   */
  it('13.444 also names the limit on the Calendar tab', async () => {
    render(
      <Providers services={servedBoard(threeCards)}>
        <ProjectPage />
      </Providers>,
    );
    await screen.findByText('Restock the cold shelf');
    await userEvent.click(await screen.findByRole('tab', { name: 'Calendar' }));

    expect(screen.queryByTestId('search-not-applied-note')).not.toBeInTheDocument();

    await userEvent.type(await searchbox(), 'board');

    const note = await screen.findByTestId('search-not-applied-note');
    expect(note).toHaveTextContent(/not applied on this tab/i);
  });
});

/**
 * ## Finding 1, final whole-branch review's fix wave (2026-09-16)
 *
 * Drives the actual Filters sheet — open it, tick a real checkbox, press
 * Done — rather than writing `filter.assigneeIds` directly, so this proves
 * the real user path Finding 1 named, not a shortcut approximation of it.
 * Needs a real roster (`board-narrowing.test.tsx`'s own `servedBoard` stubs
 * `getMembers` to `[]`), so this case builds its own services inline rather
 * than widening the shared helper for one case.
 */
const ROSTER: Array<{ id: string; name: string }> = [{ id: 'u1', name: 'Uma One' }];

async function openFiltersAndPickAssignee(name: string) {
  await userEvent.click(await screen.findByRole('button', { name: 'Filters' }));
  const dialog = await screen.findByRole('dialog', { name: 'Filters' });
  const group = within(dialog).getByRole('group', { name: 'Assignee' });
  await userEvent.click(within(group).getByRole('checkbox', { name }));
  await userEvent.keyboard('{Escape}');
}

describe('13.517 the mirror note also names Filters-sheet axes, not only search', () => {
  it('shows the note on the List tab once an assignee is picked from the Filters sheet, though nothing on the list changes', async () => {
    render(
      <Providers
        services={stubServices({
          getBoard: async () => boardOf(threeCards),
          getAttention: async () => [],
          getMembers: async () => ROSTER,
          getTicketTypes: async () => [],
          getTickets: async (): Promise<TicketListView> => ({
            projectId: PROJECT_ID,
            rows: [listRow({ ticketId: 'lt_1', title: 'Restock the cold shelf' })],
          }),
        })}
      >
        <ProjectPage />
      </Providers>,
    );
    await screen.findByText('Restock the cold shelf');
    await userEvent.click(await screen.findByRole('tab', { name: 'List' }));

    // No axis set yet — a permanent sentence here would be noise nobody reads.
    expect(screen.queryByTestId('search-not-applied-note')).not.toBeInTheDocument();

    await openFiltersAndPickAssignee('Uma One');

    // The List tab's own render is untouched — `filter` narrows the board
    // only, and this axis has no control anywhere else — which is precisely
    // why the note, not a changed list, is the only disclosure available.
    expect(screen.getByText('Restock the cold shelf')).toBeInTheDocument();
    const note = await screen.findByTestId('search-not-applied-note');
    expect(note).toHaveTextContent(/not applied on this tab/i);
  });
});

/**
 * ## The workflow picker (board-prototype-port Task 8, Ruling R3)
 *
 * Narrows by dropping a whole GROUP, never by setting an axis on `filter`/
 * `boardFilter` — `matchesBoardCard` has no group in its signature, so no
 * chip built by `buildBoardFilterChips` could ever name this mechanism.
 * These cases exercise the debt Task 4 named for the mechanism that could
 * eventually produce "narrowing with no filter axis set": before this task,
 * nothing could ever make `boardNarrowing.shown !== boardNarrowing.total`
 * true while `activeFilterChips` stayed empty, so `shouldRenderBoard
 * NarrowingStrip`'s third term was verified by reading the code, not by a
 * test that reaches it through real data. This file's own cases are that
 * test now (`13.470` below).
 *
 * `defaultWorkflow`/`bugWorkflow` deliberately reuse the workflow's own
 * NAME ("Default"/"Bug triage") on BOTH the board's group heading
 * (`<h3 className="gn-board__workflow">`, `board.tsx`) and the picker's own
 * `<option>` text — the picker's options are built from the same
 * `workflowName` field the heading reads. `screen.getByText('Default')`
 * would therefore match BOTH elements and throw on an ambiguous query; the
 * group-heading assertions below use `getByRole('heading', { level: 3,
 * name: … })` instead, which is also the MORE precise check (it proves the
 * board's own group rail rendered, not merely that the string exists
 * somewhere on the page — the option would have supplied that either way).
 *
 * Cards render as `<li data-testid="ticket-card-…">` inside a `<ul>`
 * (`board.tsx`), not `role="article"` — matching the discipline the
 * existing `packages/app-core/test/views/board.test.tsx` already uses
 * (`getAllByRole('listitem')`), per this task's own brief ("use the query
 * the existing `board.test.tsx` uses rather than adding a role to satisfy a
 * test"). Verified against this exact page mount, not assumed: `AttentionStrip`
 * (`attention-strip.tsx:72`) returns `null` outright when its `items` array
 * is empty, which every fixture here stubs it to be, so it contributes no
 * stray `<li>` to the count; nothing else this page mounts (`AppNav`,
 * `FiltersSheet` closed) renders one either.
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
        getAttention: async () => [],
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
    expect(screen.getByRole('heading', { level: 3, name: 'Default' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Bug triage' })).toBeInTheDocument();
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
    expect(screen.queryByRole('heading', { level: 3 })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /workflow/i })).not.toBeInTheDocument();
  });
});

describe('13.470 the picker discloses through the SAME count and chip the client filter uses', () => {
  it('narrows to the picked workflow and names what it hid', async () => {
    renderProjectPage({ groups: [defaultWorkflow, bugWorkflow] });
    await screen.findByText('Default lane card one');

    await userEvent.selectOptions(await workflowSelect(), 'wf-bug');

    // board.tsx:42-46 — a rearrangement that drops a card is a filter
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
    expect(screen.queryByRole('heading', { level: 3, name: 'Default' })).not.toBeInTheDocument();
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
          getAttention: async () => [],
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
