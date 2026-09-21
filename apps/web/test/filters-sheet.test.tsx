import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type {
  BoardCard,
  BoardView,
  ClaimProvenance,
  FilterSpec,
  ListRow,
  RosterMember,
  TicketListView,
} from '@gisik-nokma/app-core';
import type { TicketTypeDef } from '@gisik-nokma/domain';
import { Providers } from '../src/providers.js';
import { stubServices } from './helpers/stub-services.js';

/**
 * ## The Filters sheet (board-prototype-port Task 5)
 *
 * This file is `board-narrowing.test.tsx`'s sibling: same harness shape
 * (`Providers` + `stubServices`, copied rather than imported — the
 * convention every test file in this directory already follows), same
 * `13.4xx` numbering series (`test-cases/13-deployment-dogfooding.md`), new
 * cases `13.445`–`13.462`.
 *
 * `13.451` is the test Task 4's own brief deferred: "names the axes the
 * board could not evaluate, beside the count and not inside it... helper
 * added in Task 5... do not stub the helper." `openFiltersAndPickCollaborator`
 * below is that helper, doing the real thing (open the sheet, click a real
 * checkbox) rather than reaching into `setFilter` directly.
 *
 * `13.460` is RULING 13's regression guard, and it is a UNIT test on
 * `clearFilterAxes` rather than a UI interaction — deliberately: `projectIds`
 * has no control anywhere on this page (see `FiltersSheet`'s own docblock on
 * why), so there is no way to set it through the rendered UI and no way to
 * write an end-to-end case proving "Clear all" empties it. Exercising the
 * extracted pure function directly against a `FilterSpec` carrying
 * `projectIds` is the only way to prove the exact set Ruling 13 named,
 * independent of what any control on this page can currently produce.
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

import ProjectPage, {
  FILTERS_SHEET_CLEARABLE_AXES,
  clearFilterAxes,
} from '../app/w/[workspaceId]/p/[projectId]/page.js';

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
    // REQUIRED since spec 2026-09-22 and never nullable: the birth default,
    // attributed to the same seeded claimant `claim()` names.
    priority: { value: 'P2', claim: claim() },
    cause: null,
    rollup: null,
    pending: false,
    ...overrides,
  };
}

/** Two cards in one column: one assigned to `u1`, one not — enough to prove the assignee axis actually removes a card rather than merely rendering a chip. */
const twoCards: BoardCard[] = [
  card({ ticketId: 't_1', title: 'Carve the new workflow', assignee: { id: 'u1', name: 'Uma One' } }),
  card({ ticketId: 't_2', title: 'Restock the cold shelf', typeId: 'bug' }),
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
 * `role` is REQUIRED since 2026-09-18 (case 13.760) — `getMembers` answers
 * `RosterMember[]`, because the route has always sent a role per person and the
 * members screen draws it. The filter sheet reads only the names.
 */
const ROSTER: RosterMember[] = [
  { id: 'u1', name: 'Uma One', role: 'owner' },
  { id: 'u9', name: 'Nine Nonesuch', role: 'member' },
];

/** Full `TicketTypeDef` shape — `customDateFieldsByType` (`src/ticket-dates-input.ts:117`) reads `.fields` on every entry unconditionally, so an `{id, name}`-only fixture throws before the sheet is ever reached. */
const TYPES: TicketTypeDef[] = [
  { id: 'task', name: 'Task', icon: 'check', rank: 3, workflowId: 'wf_1', fields: [] },
  { id: 'bug', name: 'Bug', icon: 'bug', rank: 3, workflowId: 'wf_1', fields: [] },
];

/** The shipped-server-shaped stub every case below starts from — same shape as `board-narrowing.test.tsx`'s `servedBoard`, with a real roster and a real type list so the sheet's person rows and type chips have something to render. */
function servedBoard(cards: BoardCard[], overrides: Parameters<typeof stubServices>[0] = {}) {
  return stubServices({
    getBoard: async () => boardOf(cards),
    getMembers: async () => ROSTER,
    getTicketTypes: async () => TYPES,
    getTickets: async () => ({ projectId: PROJECT_ID, rows: [] }),
    ...overrides,
  });
}

async function openFilters() {
  await userEvent.click(await screen.findByRole('button', { name: 'Filters' }));
  return screen.findByRole('dialog', { name: 'Filters' });
}

/**
 * The helper Task 4's own brief named and deferred to this commit. Real
 * interaction, not a `setFilter` shortcut: opens the sheet through the
 * Filters button, finds the named person's own checkbox inside the
 * "Collaborators" group, and clicks it.
 */
async function openFiltersAndPickCollaborator(name: string) {
  const dialog = await openFilters();
  const group = within(dialog).getByRole('group', { name: 'Collaborators' });
  await userEvent.click(within(group).getByRole('button', { name }));
}

describe('13.445 the sheet is a real dialog, and focus moves into it on open', () => {
  it('opens with role=dialog, aria-modal, labelled by its own heading, and focus inside', async () => {
    render(
      <Providers services={servedBoard(twoCards)}>
        <ProjectPage />
      </Providers>,
    );
    await screen.findByText('Restock the cold shelf');
    const filtersButton = screen.getByRole('button', { name: 'Filters' });

    const dialog = await openFilters();
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(within(dialog).getByRole('heading', { name: 'Filters' })).toBeInTheDocument();

    // Focus actually LEFT the trigger — the precondition account-menu.tsx's
    // own docblock says is what makes "Escape returns focus" a real
    // assertion rather than a vacuous one (focus never having left).
    expect(document.activeElement).not.toBe(filtersButton);
    expect(dialog.contains(document.activeElement)).toBe(true);
  });
});

describe('13.446 Escape closes the sheet and returns focus to the Filters button', () => {
  it('returns focus to the exact control that opened the sheet', async () => {
    render(
      <Providers services={servedBoard(twoCards)}>
        <ProjectPage />
      </Providers>,
    );
    await screen.findByText('Restock the cold shelf');
    const filtersButton = screen.getByRole('button', { name: 'Filters' });

    const dialog = await openFilters();
    await userEvent.keyboard('{Escape}');

    expect(dialog).not.toBeInTheDocument();
    expect(document.activeElement).toBe(filtersButton);
  });
});

describe('13.447 picking an assignee narrows the board and discloses it', () => {
  it('shows the assignee chip and the honest count once a person row is checked', async () => {
    render(
      <Providers services={servedBoard(twoCards)}>
        <ProjectPage />
      </Providers>,
    );
    await screen.findByText('Restock the cold shelf');

    const dialog = await openFilters();
    const group = within(dialog).getByRole('group', { name: 'Assignee' });
    await userEvent.click(within(group).getByRole('button', { name: 'Uma One' }));
    await userEvent.keyboard('{Escape}');

    expect(await screen.findByText('1 of 2 shown')).toBeInTheDocument();
    expect(screen.getByTestId('board-filter-chip-assigneeIds')).toHaveTextContent('Uma One');
    expect(screen.getByText('Carve the new workflow')).toBeInTheDocument();
    expect(screen.queryByText('Restock the cold shelf')).not.toBeInTheDocument();
  });

  /**
   * RULING E5-4 — two of the finding's "four sites" render `member.name`
   * verbatim in this SAME person-row: the Assignee group here and the
   * Collaborators group below it, both fed by `personSection`. A member
   * with no display name (the magic-link population, `name: ''`) used to
   * paint a row with no visible text and no accessible name — the
   * `getByRole('button', { name: … })` query below is the same shape
   * every other case in this file already uses to find a row, so this is
   * the case that shows a nameless member was simply unfindable that way.
   */
  it('E5-4 a member with no display name renders and is findable by id, in both person groups', async () => {
    render(
      <Providers
        services={servedBoard(twoCards, {
          getMembers: async () => [...ROSTER, { id: 'u_nameless', name: '', role: 'guest' }],
        })}
      >
        <ProjectPage />
      </Providers>,
    );
    await screen.findByText('Restock the cold shelf');

    const dialog = await openFilters();
    const assignee = within(dialog).getByRole('group', { name: 'Assignee' });
    expect(within(assignee).getByRole('button', { name: 'u_nameless' })).toBeInTheDocument();
    const collaborators = within(dialog).getByRole('group', { name: 'Collaborators' });
    expect(within(collaborators).getByRole('button', { name: 'u_nameless' })).toBeInTheDocument();
  });
});

describe('13.448 picking a type chip narrows the board and discloses it', () => {
  it('shows the type chip and the honest count once a type chip is pressed', async () => {
    render(
      <Providers services={servedBoard(twoCards)}>
        <ProjectPage />
      </Providers>,
    );
    await screen.findByText('Restock the cold shelf');

    const dialog = await openFilters();
    const group = within(dialog).getByRole('group', { name: 'Type' });
    const bugChip = within(group).getByRole('button', { name: /^Bug/ });
    await userEvent.click(bugChip);
    expect(bugChip).toHaveAttribute('data-mode', 'include');
    await userEvent.keyboard('{Escape}');

    expect(await screen.findByText('1 of 2 shown')).toBeInTheDocument();
    expect(screen.getByTestId('board-filter-chip-typeIds')).toHaveTextContent('Bug');
    expect(screen.getByText('Restock the cold shelf')).toBeInTheDocument();
    expect(screen.queryByText('Carve the new workflow')).not.toBeInTheDocument();
  });
});

describe('13.449 picking a state chip narrows the board and discloses it', () => {
  it('shows the state chip and the honest count once a state chip is pressed', async () => {
    render(
      <Providers services={servedBoard(twoCards)}>
        <ProjectPage />
      </Providers>,
    );
    await screen.findByText('Restock the cold shelf');

    const dialog = await openFilters();
    const group = within(dialog).getByRole('group', { name: 'State' });
    // The board fixture has exactly one column, "Doing".
    await userEvent.click(within(group).getByRole('button', { name: 'Doing' }));
    await userEvent.keyboard('{Escape}');

    // Every card sits in "Doing", so selecting it narrows nothing — but it
    // must still disclose via the chip (the narrowing strip's own three-term
    // gate opens on a chip existing, independent of whether it removed a
    // card — see `shouldRenderNarrowingStrip`).
    expect(await screen.findByTestId('board-filter-chip-stateIds')).toHaveTextContent('Doing');
    expect(screen.getByText('2 of 2 shown')).toBeInTheDocument();
  });
});

describe('13.450 picking a category chip narrows the board and discloses it', () => {
  it('shows the category chip and the honest count once a category chip is pressed', async () => {
    render(
      <Providers services={servedBoard(twoCards)}>
        <ProjectPage />
      </Providers>,
    );
    await screen.findByText('Restock the cold shelf');

    const dialog = await openFilters();
    const group = within(dialog).getByRole('group', { name: 'Category' });
    // The board fixture's one column is category "active"; "Terminal" excludes both cards.
    await userEvent.click(within(group).getByRole('button', { name: 'Terminal' }));
    await userEvent.keyboard('{Escape}');

    expect(await screen.findByTestId('board-filter-chip-stateCategories')).toHaveTextContent('Terminal');
    expect(screen.getByText('0 of 2 shown')).toBeInTheDocument();
  });
});

describe('13.451 the deferred Task 4 test: collaborator is unapplied on the board, not silently ignored', () => {
  it('names the axis the board could not evaluate, beside the count and not inside it', async () => {
    render(
      <Providers services={servedBoard(twoCards)}>
        <ProjectPage />
      </Providers>,
    );
    await screen.findByText('Restock the cold shelf');

    await openFiltersAndPickCollaborator('Nine Nonesuch');
    await userEvent.keyboard('{Escape}');

    const note = await screen.findByTestId('board-scope-note');
    expect(note).toHaveTextContent(/not applied on the board/i);
    expect(note).toHaveTextContent(/collaborator/i);
    // The count reports cards the board filtered; the note reports an axis it
    // never ran — collaborator cannot narrow a `BoardCard` at all
    // (`matchesBoardCard` carries no collaborators), so both cards remain.
    expect(screen.getByText('2 of 2 shown')).toBeInTheDocument();
  });
});

describe('13.452 Clear all resets every axis the sheet owns, without closing', () => {
  it('clears the assignee selection and the sheet stays open', async () => {
    render(
      <Providers services={servedBoard(twoCards)}>
        <ProjectPage />
      </Providers>,
    );
    await screen.findByText('Restock the cold shelf');

    const dialog = await openFilters();
    const group = within(dialog).getByRole('group', { name: 'Assignee' });
    const row = within(group).getByRole('button', { name: 'Uma One' });
    await userEvent.click(row);
    expect(row).toHaveAttribute('data-mode', 'include');

    await userEvent.click(within(dialog).getByRole('button', { name: 'Clear all' }));

    expect(row).toHaveAttribute('data-mode', 'off');
    // Clear all does not close the sheet — it is a distinct action from Done.
    expect(screen.getByRole('dialog', { name: 'Filters' })).toBeInTheDocument();

    await userEvent.keyboard('{Escape}');
    expect(screen.queryByTestId('board-narrowing')).not.toBeInTheDocument();
  });
});

/**
 * RULING 12 (coordinator remediation, same session). The first version of
 * `clearAll` cleared the sheet's own five axes only, leaving `text` alone on
 * the reasoning that the search box is Task 4's control, outside this sheet.
 * That reasoning was correct about ownership and wrong about what the
 * button ON SCREEN promises: a person who types a search term, opens
 * Filters, and clicks a button labelled "Clear all" would have watched the
 * text chip survive — an accurate docblock above an inaccurate control is
 * still a lie to whoever is looking at the control, not the comment.
 *
 * Two failure shapes, asserted separately, because they are not the same
 * bug: the CHIP surviving (the disclosure surface lying about what is still
 * filtering) and the INPUT still showing the typed text (the control lying
 * about what it holds) are independent — a fix that only clears `filter`
 * and never checks the input's own rendering could pass the first
 * assertion while failing the second if the search box ever grew local
 * state. Checked directly before writing the fix: `ProjectBoard`'s search
 * `<input>` is `value={filter.text ?? ''}`, a CONTROLLED component with no
 * local state of its own, so clearing `filter.text` was sufficient — no
 * separate desync to fix, confirmed here rather than assumed.
 */
describe('13.459 Clear all clears the search term too, not only the five axes the sheet has controls for', () => {
  it('removes the text chip AND empties the search box', async () => {
    render(
      <Providers services={servedBoard(twoCards)}>
        <ProjectPage />
      </Providers>,
    );
    await screen.findByText('Restock the cold shelf');
    const search = await screen.findByRole('searchbox');

    await userEvent.type(search, 'restock');
    expect(await screen.findByTestId('board-filter-chip-text')).toHaveTextContent('restock');
    expect(search).toHaveValue('restock');

    const dialog = await openFilters();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Clear all' }));

    // The chip is gone — the disclosure surface no longer claims a search is active.
    expect(screen.queryByTestId('board-filter-chip-text')).not.toBeInTheDocument();
    // The box is empty — the control itself no longer shows text that is not filtering anything.
    expect(search).toHaveValue('');
  });
});

describe('13.453 absence: the roster not yet read renders a sentence, never an invented empty list', () => {
  it('says the roster has not loaded, rather than showing zero people to choose from', async () => {
    render(
      <Providers
        services={servedBoard(twoCards, {
          // Never resolves — `members.data` stays `null` for the life of this test.
          getMembers: () => new Promise<RosterMember[]>(() => undefined),
        })}
      >
        <ProjectPage />
      </Providers>,
    );
    await screen.findByText('Restock the cold shelf');

    const dialog = await openFilters();
    const group = within(dialog).getByRole('group', { name: 'Assignee' });
    expect(within(group).getByText(/roster has not loaded/i)).toBeInTheDocument();
    expect(within(group).queryByRole('checkbox')).not.toBeInTheDocument();
  });
});

describe('13.454 absence: a failed ticket-types read refuses, never falling back to the built-in ladder', () => {
  it('says types could not be loaded rather than offering the four built-ins', async () => {
    render(
      <Providers
        services={servedBoard(twoCards, {
          getTicketTypes: () => Promise.reject(new Error('types unavailable')),
        })}
      >
        <ProjectPage />
      </Providers>,
    );
    await screen.findByText('Restock the cold shelf');

    const dialog = await openFilters();
    const group = within(dialog).getByRole('group', { name: 'Type' });
    expect(within(group).getByText(/could not be loaded/i)).toBeInTheDocument();
    expect(within(group).queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('13.455 absence: the board not yet read renders a sentence for the State section', () => {
  it('says the board has not loaded, rather than showing zero states', async () => {
    render(
      <Providers
        services={servedBoard(twoCards, {
          getBoard: () => new Promise<BoardView>(() => undefined),
        })}
      >
        <ProjectPage />
      </Providers>,
    );
    // The board never resolves, so wait on the Filters button itself, which
    // does not depend on `board.data`.
    const dialog = await openFilters();
    const group = within(dialog).getByRole('group', { name: 'State' });
    expect(within(group).getByText(/board has not loaded/i)).toBeInTheDocument();
  });
});

describe('13.456 the scope note no longer names a location the sheet made untrue', () => {
  it('states the unapplied axis without pointing at "the list tab"', async () => {
    render(
      <Providers services={servedBoard(twoCards)}>
        <ProjectPage />
      </Providers>,
    );
    await screen.findByText('Restock the cold shelf');

    await openFiltersAndPickCollaborator('Nine Nonesuch');
    await userEvent.keyboard('{Escape}');

    const note = await screen.findByTestId('board-scope-note');
    expect(note).not.toHaveTextContent(/list tab/i);
  });
});

/**
 * ## PENDING is not REFUSED — `.data === null` is true of both
 *
 * `13.453`/`13.455` above prove the PENDING sentence. These two prove the
 * component does not ALSO print that same sentence over a real refusal —
 * `advisor()` caught this as a real gap after the first review pass: `Type`
 * already distinguished `typesError`/`typesPending` (the built-in-ladder
 * rule forbids the fallback surviving a FAILED read), but Assignee/
 * Collaborators and State collapsed pending and refused into one
 * `members === null` / `!boardLoaded` check, which would have named the
 * wrong cause — "has not loaded yet" over a read that will never load,
 * because it already answered no. Fixed by checking `membersError`/
 * `boardError` (from `useLiveQuery`'s own error channel) FIRST.
 */
describe('13.457 absence: a failed roster read refuses, never claiming it is merely pending', () => {
  it('says the roster could not be loaded, not that it has not loaded yet', async () => {
    render(
      <Providers
        services={servedBoard(twoCards, {
          getMembers: () => Promise.reject(new Error('roster unavailable')),
        })}
      >
        <ProjectPage />
      </Providers>,
    );
    await screen.findByText('Restock the cold shelf');

    const dialog = await openFilters();
    const group = within(dialog).getByRole('group', { name: 'Assignee' });
    expect(within(group).getByText(/could not be loaded/i)).toBeInTheDocument();
    expect(within(group).queryByText(/has not loaded yet/i)).not.toBeInTheDocument();
    expect(within(group).queryByRole('checkbox')).not.toBeInTheDocument();
  });
});

describe('13.458 absence: a failed board read refuses, never claiming it is merely pending', () => {
  it('says the board could not be loaded, not that it has not loaded yet', async () => {
    render(
      <Providers
        services={servedBoard(twoCards, {
          getBoard: () => Promise.reject(new Error('board unavailable')),
        })}
      >
        <ProjectPage />
      </Providers>,
    );

    const dialog = await openFilters();
    const group = within(dialog).getByRole('group', { name: 'State' });
    expect(within(group).getByText(/could not be loaded/i)).toBeInTheDocument();
    expect(within(group).queryByText(/has not loaded yet/i)).not.toBeInTheDocument();
    expect(within(group).queryByRole('button')).not.toBeInTheDocument();
  });
});

/**
 * RULING 13 (coordinator remediation, same session). The reviewer checked
 * `clearAll` axis-by-axis against `BoardFilterSpec` rather than accepting
 * Ruling 12's own "clears all six" claim, and found a DIFFERENT six: the
 * fixed version included `collaboratorIds` (not a `BoardFilterSpec` axis,
 * produces no chip) while OMITTING `projectIds` (one of the six, with a
 * working chip via `buildFilterChips` (renamed 2026-09-17; was
 * `buildBoardFilterChips`)). Harmless only because nothing
 * on this page sets `filter.projectIds` yet — which is exactly why it
 * needed fixing now rather than being left for the day some future control
 * writes it and finds "Clear all" silently does not clear it.
 *
 * A UNIT test, not a UI interaction: `projectIds` has no control anywhere
 * on this page (see `FiltersSheet`'s own docblock for why), so there is no
 * rendered checkbox or chip to drive through `userEvent`. `clearFilterAxes`
 * is exercised directly against a `FilterSpec` literal instead — the only
 * way to prove the exact axis this ruling was about, independent of what
 * any control can currently produce.
 */
describe('13.460 "Clear all" clears exactly the six BoardFilterSpec axes plus collaboratorIds and closed', () => {
  it('lists the axes as the six BoardFilterSpec fields plus collaboratorIds and closed, nothing else', () => {
    // Order-independent: the SET is what Ruling 13 is about, not the sequence.
    // `closed` joined this set in Task 11 (advisor review) — the array's own
    // criterion is "every axis the strip's chips can represent", and
    // `board-filter-chip-closed` is exactly that since `buildFilterChips`
    // grew a `closed` branch; this test and the array share one source, so a
    // future regression here is exactly what Ruling 13 found the hard way.
    expect(new Set(FILTERS_SHEET_CLEARABLE_AXES)).toEqual(
      new Set([
        'text',
        'assigneeIds',
        'typeIds',
        'stateIds',
        'stateCategories',
        'projectIds',
        'collaboratorIds',
        'closed',
        'exclude',
      ]),
    );
  });

  it('clears the whole exclude half too — one axis in this list, not five separately', () => {
    expect(
      clearFilterAxes({ text: 'x', exclude: { typeIds: ['bug'] }, dueBefore: '2026-01-01' }),
    ).toEqual({
      text: undefined,
      assigneeIds: undefined,
      typeIds: undefined,
      stateIds: undefined,
      stateCategories: undefined,
      projectIds: undefined,
      collaboratorIds: undefined,
      closed: undefined,
      exclude: undefined,
      dueBefore: '2026-01-01',
    });
  });

  it('clears projectIds — the axis Ruling 13 found silently omitted — even though no UI control sets it', () => {
    const dirty: FilterSpec = {
      text: 'restock',
      assigneeIds: ['u1'],
      typeIds: ['bug'],
      stateIds: ['doing'],
      stateCategories: ['active'],
      projectIds: ['p1', 'p2'],
      collaboratorIds: ['u9'],
      closed: true,
      // Untouched by `clearAll` on purpose — not one of `BoardFilterSpec`'s
      // six and not settable by this sheet either.
      dueBefore: '2026-01-01',
    };

    const cleared = clearFilterAxes(dirty);

    // HARD-CODED, not a loop over `FILTERS_SHEET_CLEARABLE_AXES` itself —
    // looping over the very array under test would make this assertion
    // shrink along with a mutated/wrong array and pass vacuously (measured:
    // with `projectIds` temporarily removed from the exported array to
    // reproduce Ruling 13's exact bug, a version of this test that looped
    // over the array still passed, because it never checked the one field
    // Ruling 13 was about). Each field is named explicitly so a future
    // regression in the array cannot also hide itself from this test.
    expect(cleared.text).toBeUndefined();
    expect(cleared.assigneeIds).toBeUndefined();
    expect(cleared.typeIds).toBeUndefined();
    expect(cleared.stateIds).toBeUndefined();
    expect(cleared.stateCategories).toBeUndefined();
    expect(cleared.projectIds).toBeUndefined();
    expect(cleared.collaboratorIds).toBeUndefined();
    expect(cleared.closed).toBeUndefined();
    // The negative control: an axis outside the clearable set must survive,
    // proving this function narrows rather than wiping the whole filter.
    expect(cleared.dueBefore).toBe('2026-01-01');
  });
});

/**
 * MINOR (coordinator review). Both close paths route through the same
 * `onClose`/`closeFilters` that `13.446` already mutation-proves for
 * Escape, so the underlying risk is low — but neither had a passing
 * assertion of its own, and `filters-scrim`'s testid was referenced by no
 * test at all before this.
 */
describe('13.461 "Done" closes the sheet and returns focus to the Filters button', () => {
  it('closes on click, same as Escape', async () => {
    render(
      <Providers services={servedBoard(twoCards)}>
        <ProjectPage />
      </Providers>,
    );
    await screen.findByText('Restock the cold shelf');
    const filtersButton = screen.getByRole('button', { name: 'Filters' });

    const dialog = await openFilters();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Done' }));

    expect(dialog).not.toBeInTheDocument();
    expect(document.activeElement).toBe(filtersButton);
  });
});

describe('13.462 clicking the scrim closes the sheet', () => {
  it('closes on a click outside the panel', async () => {
    render(
      <Providers services={servedBoard(twoCards)}>
        <ProjectPage />
      </Providers>,
    );
    await screen.findByText('Restock the cold shelf');

    const dialog = await openFilters();
    await userEvent.click(screen.getByTestId('filters-scrim'));

    expect(dialog).not.toBeInTheDocument();
  });
});

/** 13.552 — the cycle, through the real sheet (exclude-mode spec §4). */
describe('13.552 a person row cycles off → included → excluded → off, in its accessible name', () => {
  it('three clicks walk the three names and return to the start', async () => {
    render(
      <Providers services={servedBoard(twoCards)}>
        <ProjectPage />
      </Providers>,
    );
    await screen.findByText('Restock the cold shelf');
    const dialog = await openFilters();
    const group = within(dialog).getByRole('group', { name: 'Assignee' });

    const row = within(group).getByRole('button', { name: 'Uma One' });
    expect(row).not.toHaveAttribute('aria-pressed');
    await userEvent.click(row);
    expect(within(group).getByRole('button', { name: 'Uma One, included' })).toHaveAttribute('data-mode', 'include');
    await userEvent.click(within(group).getByRole('button', { name: 'Uma One, included' }));
    expect(within(group).getByRole('button', { name: 'Uma One, excluded' })).toHaveAttribute('data-mode', 'exclude');
    await userEvent.click(within(group).getByRole('button', { name: 'Uma One, excluded' }));
    expect(within(group).getByRole('button', { name: 'Uma One' })).toHaveAttribute('data-mode', 'off');
  });
});

/** 13.553 — exclusion narrows the BOARD and is disclosed as "Not assignee". */
describe('13.553 excluding an assignee drops that card from the board and shows a "Not assignee" chip', () => {
  it('two clicks on Uma One leave only the unassigned card, under a "1 of 2 shown" strip', async () => {
    render(
      <Providers services={servedBoard(twoCards)}>
        <ProjectPage />
      </Providers>,
    );
    await screen.findByText('Restock the cold shelf');
    const dialog = await openFilters();
    const group = within(dialog).getByRole('group', { name: 'Assignee' });
    await userEvent.click(within(group).getByRole('button', { name: 'Uma One' }));
    await userEvent.click(within(group).getByRole('button', { name: 'Uma One, included' }));
    await userEvent.keyboard('{Escape}');

    expect(await screen.findByText('1 of 2 shown')).toBeInTheDocument();
    expect(screen.getByTestId('board-filter-chip-exclude.assigneeIds')).toHaveTextContent('Not assignee: Uma One');
    expect(screen.queryByTestId('board-filter-chip-assigneeIds')).not.toBeInTheDocument();
    expect(screen.getByText('Restock the cold shelf')).toBeInTheDocument();
    expect(screen.queryByText('Carve the new workflow')).not.toBeInTheDocument();
  });

  it("the exclude chip's × clears the exclusion and restores both cards", async () => {
    render(
      <Providers services={servedBoard(twoCards)}>
        <ProjectPage />
      </Providers>,
    );
    await screen.findByText('Restock the cold shelf');
    const dialog = await openFilters();
    const group = within(dialog).getByRole('group', { name: 'Assignee' });
    await userEvent.click(within(group).getByRole('button', { name: 'Uma One' }));
    await userEvent.click(within(group).getByRole('button', { name: 'Uma One, included' }));
    await userEvent.keyboard('{Escape}');
    await screen.findByText('1 of 2 shown');

    await userEvent.click(screen.getByRole('button', { name: 'Remove filter — Not assignee: Uma One' }));

    expect(await screen.findByText('Carve the new workflow')).toBeInTheDocument();
    expect(screen.queryByTestId('board-narrowing')).not.toBeInTheDocument();
  });
});

/** 13.554 — a type chip excluded, the same way; and the category chips cycle too. */
describe('13.554 type and category chips cycle and exclude', () => {
  it('excluding the Bug type drops the bug card', async () => {
    render(
      <Providers services={servedBoard(twoCards)}>
        <ProjectPage />
      </Providers>,
    );
    await screen.findByText('Restock the cold shelf');
    const dialog = await openFilters();
    const group = within(dialog).getByRole('group', { name: 'Type' });
    await userEvent.click(within(group).getByRole('button', { name: 'Bug' }));
    await userEvent.click(within(group).getByRole('button', { name: 'Bug, included' }));
    await userEvent.keyboard('{Escape}');

    expect(await screen.findByText('1 of 2 shown')).toBeInTheDocument();
    expect(screen.getByTestId('board-filter-chip-exclude.typeIds')).toHaveTextContent('Not type: Bug');
    expect(screen.queryByText('Restock the cold shelf')).not.toBeInTheDocument();
  });

  it('a category chip reaches the excluded state', async () => {
    render(
      <Providers services={servedBoard(twoCards)}>
        <ProjectPage />
      </Providers>,
    );
    await screen.findByText('Restock the cold shelf');
    const dialog = await openFilters();
    const group = within(dialog).getByRole('group', { name: 'Category' });
    await userEvent.click(within(group).getByRole('button', { name: 'Active' }));
    await userEvent.click(within(group).getByRole('button', { name: 'Active, included' }));
    expect(within(group).getByRole('button', { name: 'Active, excluded' })).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    // Both cards sit in the one `active` column, so excluding the category empties the board honestly.
    expect(await screen.findByText('0 of 2 shown')).toBeInTheDocument();
  });
});

/** 13.555 — "Clear all" clears the exclude half too, through the real button. */
describe('13.555 Clear all clears an exclusion', () => {
  it('after Clear all the excluded row reads off and both cards are back', async () => {
    render(
      <Providers services={servedBoard(twoCards)}>
        <ProjectPage />
      </Providers>,
    );
    await screen.findByText('Restock the cold shelf');
    const dialog = await openFilters();
    const group = within(dialog).getByRole('group', { name: 'Assignee' });
    await userEvent.click(within(group).getByRole('button', { name: 'Uma One' }));
    await userEvent.click(within(group).getByRole('button', { name: 'Uma One, included' }));
    await screen.findByText('1 of 2 shown');

    await userEvent.click(within(dialog).getByRole('button', { name: 'Clear all' }));

    expect(within(group).getByRole('button', { name: 'Uma One' })).toHaveAttribute('data-mode', 'off');
    expect(dialog).toBeInTheDocument(); // Clear all does not close (Ruling 12)
    expect(screen.queryByText('1 of 2 shown')).not.toBeInTheDocument();
  });
});

/**
 * 13.556a — Task 9 fix round 1 (coordinator, Important finding). `boardFilter.exclude`
 * deliberately omits `collaboratorIds` (`BoardIdAxes` has no such field —
 * `board-filter.ts`'s own docblock), so an EXCLUDED collaborator narrows nothing and
 * earns no chip in EITHER direction — the only disclosure left for this half is the
 * scope note, driven by `describeUnappliedBoardAxes` → `collaboratorsSet`, which reads
 * `filter.exclude?.collaboratorIds` (`board-search-scope.ts`). `boardUnappliedAxes`'s
 * `filter.exclude` dependency (`page.tsx`) is exactly what keeps that note in sync with
 * this half; this case is its only exercise in the suite. The THIRD click (excluded →
 * off) is the one transition where `filter.collaboratorIds` itself does not change
 * (it is `undefined` on both sides of that step — only `filter.exclude` collapses) —
 * so it is the one assertion a missing `filter.exclude` dependency cannot survive by
 * riding along on a co-occurring change to `filter.collaboratorIds`, unlike the first
 * two clicks, which also touch the top-level `collaboratorIds` field and would recompute
 * regardless. Reads as the RED case for the mutation this task's own report names.
 */
describe('13.556a an excluded collaborator is disclosed by the scope note, not silently ignored', () => {
  it('two clicks (off → included → excluded) show the note and narrow nothing; a third clears it', async () => {
    render(
      <Providers services={servedBoard(twoCards)}>
        <ProjectPage />
      </Providers>,
    );
    await screen.findByText('Restock the cold shelf');

    let dialog = await openFilters();
    let group = within(dialog).getByRole('group', { name: 'Collaborators' });
    await userEvent.click(within(group).getByRole('button', { name: 'Nine Nonesuch' }));
    await userEvent.click(within(group).getByRole('button', { name: 'Nine Nonesuch, included' }));
    await userEvent.keyboard('{Escape}');

    const note = await screen.findByTestId('board-scope-note');
    expect(note).toHaveTextContent(/collaborator/i);
    // Neither direction of this axis has a chip — `BoardFilterSpec`/its `exclude`
    // half cannot carry `collaboratorIds` at all, so no key for it exists to render.
    expect(screen.queryByTestId('board-filter-chip-exclude.collaboratorIds')).not.toBeInTheDocument();
    expect(screen.queryByTestId('board-filter-chip-collaboratorIds')).not.toBeInTheDocument();
    expect(screen.getByTestId('board-narrowing')).toBeInTheDocument();
    // The board did not narrow — collaborator cannot narrow a `BoardCard` at all,
    // excluded or not — both cards remain, under the honest "2 of 2 shown" count.
    expect(screen.getByText('2 of 2 shown')).toBeInTheDocument();
    expect(screen.getByText('Restock the cold shelf')).toBeInTheDocument();
    expect(screen.getByText('Carve the new workflow')).toBeInTheDocument();

    dialog = await openFilters();
    group = within(dialog).getByRole('group', { name: 'Collaborators' });
    await userEvent.click(within(group).getByRole('button', { name: 'Nine Nonesuch, excluded' }));
    await userEvent.keyboard('{Escape}');

    expect(screen.queryByTestId('board-scope-note')).not.toBeInTheDocument();
    expect(screen.queryByTestId('board-narrowing')).not.toBeInTheDocument();
  });
});

/**
 * A `ListRow` exactly as `view-types.ts` declares it — `closed` REQUIRED
 * (Task 4), matching `board-narrowing.test.tsx`'s own `listRow` fixture.
 * Titles deliberately avoid `twoCards`'s own ("Carve the new workflow",
 * "Restock the cold shelf") so a query made after switching to the List tab
 * can never accidentally match a leftover Board-tab element.
 */
function listRow(overrides: Partial<ListRow> = {}): ListRow {
  const base: ListRow = {
    ticketId: 'lt_1',
    title: 'A list row',
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
    fields: {},
    rollup: null,
    hasRestrictedParent: false,
    pending: false,
    closed: null,
    rank: null,
  };
  return { ...base, ...overrides };
}

/**
 * 13.600 — the Closed control (Task 11, Ruling 44/45, spec §5.5): cycles
 * with the names `Closed` / `Closed, included` / `Closed, excluded`;
 * "Closed only" on the List tab shows only the closed row, "Not closed"
 * hides it; the State chips include `Backlog` (Ruling 45 — no second def
 * fetch, the universal state appended after the board's own columns).
 */
describe('13.600 the Closed control cycles and narrows the List tab; Backlog joins the State chips', () => {
  const rows: ListRow[] = [
    listRow({ ticketId: 'lt_open', title: 'Ship the roadmap' }),
    listRow({
      ticketId: 'lt_closed',
      title: 'Archive the sunset feature',
      closed: { actorId: 'user_kiro', at: '2026-09-17T00:00:00.000Z' },
    }),
  ];

  function servedWithRows() {
    return servedBoard(twoCards, {
      getTickets: async (): Promise<TicketListView> => ({ projectId: PROJECT_ID, rows }),
    });
  }

  it('cycles through the three accessible names, off -> included -> excluded -> off', async () => {
    render(
      <Providers services={servedWithRows()}>
        <ProjectPage />
      </Providers>,
    );
    await screen.findByText('Restock the cold shelf');

    const dialog = await openFilters();
    const group = within(dialog).getByRole('group', { name: 'Closed' });
    const control = within(group).getByRole('button', { name: 'Closed' });
    expect(control).not.toHaveAttribute('aria-pressed');

    await userEvent.click(control);
    expect(within(group).getByRole('button', { name: 'Closed, included' })).toHaveAttribute('data-mode', 'include');
    await userEvent.click(within(group).getByRole('button', { name: 'Closed, included' }));
    expect(within(group).getByRole('button', { name: 'Closed, excluded' })).toHaveAttribute('data-mode', 'exclude');
    await userEvent.click(within(group).getByRole('button', { name: 'Closed, excluded' }));
    expect(within(group).getByRole('button', { name: 'Closed' })).toHaveAttribute('data-mode', 'off');
  });

  it('"Closed only" shows only the closed row on the List tab, under a "Closed: only" chip', async () => {
    render(
      <Providers services={servedWithRows()}>
        <ProjectPage />
      </Providers>,
    );
    await screen.findByText('Restock the cold shelf');
    await userEvent.click(await screen.findByRole('tab', { name: 'List' }));
    await screen.findByText('Archive the sunset feature');

    const dialog = await openFilters();
    const group = within(dialog).getByRole('group', { name: 'Closed' });
    await userEvent.click(within(group).getByRole('button', { name: 'Closed' }));
    await userEvent.keyboard('{Escape}');

    expect(await screen.findByTestId('board-filter-chip-closed')).toHaveTextContent('Closed: only');
    expect(screen.getByText('Archive the sunset feature')).toBeInTheDocument();
    expect(screen.queryByText('Ship the roadmap')).not.toBeInTheDocument();
  });

  it('"Not closed" hides the closed row on the List tab, under a "Closed: hidden" chip', async () => {
    render(
      <Providers services={servedWithRows()}>
        <ProjectPage />
      </Providers>,
    );
    await screen.findByText('Restock the cold shelf');
    await userEvent.click(await screen.findByRole('tab', { name: 'List' }));
    await screen.findByText('Archive the sunset feature');

    const dialog = await openFilters();
    const group = within(dialog).getByRole('group', { name: 'Closed' });
    await userEvent.click(within(group).getByRole('button', { name: 'Closed' }));
    await userEvent.click(within(group).getByRole('button', { name: 'Closed, included' }));
    await userEvent.keyboard('{Escape}');

    expect(await screen.findByTestId('board-filter-chip-closed')).toHaveTextContent('Closed: hidden');
    expect(screen.getByText('Ship the roadmap')).toBeInTheDocument();
    expect(screen.queryByText('Archive the sunset feature')).not.toBeInTheDocument();
  });

  it('Backlog appears exactly once among the State chips', async () => {
    render(
      <Providers services={servedWithRows()}>
        <ProjectPage />
      </Providers>,
    );
    await screen.findByText('Restock the cold shelf');

    const dialog = await openFilters();
    const group = within(dialog).getByRole('group', { name: 'State' });
    // The board fixture (`twoCards`) has exactly one column, "Doing" — Backlog
    // is the universal state Ruling 45 appends, never a real column.
    expect(within(group).getAllByRole('button', { name: 'Backlog' })).toHaveLength(1);
    expect(within(group).getByRole('button', { name: 'Doing' })).toBeInTheDocument();
  });
});

/**
 * E5-5 (round-2 ruling, IMPORTANT) — the Collaborators section SAYS what it
 * does not do, before the press.
 *
 * The tri-state rows work and the filter keeps what you set, but no view
 * narrows by `collaboratorIds`, and the ONLY place the product said so was a
 * strip printed after the fact (`docs/manual.md:826-828`: *"Collaborators is
 * the one thing no tab applies — the strip's own sentence is 'Not applied on
 * the board: collaborator.'"*). A control that looks like the six around it and
 * quietly does nothing is the dead-affordance shape this shell refuses
 * elsewhere, and the ruling's remedy is to say it up front.
 */
describe('E5-5 the Collaborators section says it is not applied by any view', () => {
  it('13.1161 carries the note in the Collaborators group, and the Assignee group does not', async () => {
    render(
      <Providers services={servedBoard(twoCards)}>
        <ProjectPage />
      </Providers>,
    );
    const dialog = await openFilters();

    const collaborators = within(dialog).getByRole('group', { name: 'Collaborators' });
    expect(collaborators).toHaveTextContent('No view narrows by this yet');

    // The control that makes this a measurement rather than "the sheet says it
    // somewhere": Assignee IS applied by every view, so the sentence must be
    // absent there — a note rendered by `personSection` unconditionally would
    // satisfy the assertion above and be false about the section beside it.
    const assignee = within(dialog).getByRole('group', { name: 'Assignee' });
    expect(assignee).not.toHaveTextContent('No view narrows by this yet');
  });
});
