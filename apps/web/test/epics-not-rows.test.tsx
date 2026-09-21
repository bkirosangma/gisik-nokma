import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BACKLOG_STATE_ID, type TicketTypeDef } from '@gisik-nokma/domain';
import type { BoardCard, BoardView, ClaimProvenance, ListRow, TicketListView } from '@gisik-nokma/app-core';
// Value import, deliberately: 13.1046 asserts the same string that renders rather
// than a re-typed copy of it — two spellings of one sentence is how a copy change
// passes a test it broke (`EMPTY_BOARD_COPY`'s own docblock, one constant over).
import {
  EMPTY_BOARD_COPY,
  EMPTY_BOARD_EPICS_COPY,
  EMPTY_COLUMN_COPY,
  EMPTY_COLUMN_EPICS_COPY,
} from '@gisik-nokma/app-core';
import { Providers } from '../src/providers.js';
import { stubServices } from './helpers/stub-services.js';

/**
 * THE OWNER'S RULING, 2026-09-20 — **AN EPIC IS A ROW IN THE LIST AND NOWHERE
 * ELSE.** Two instructions, the second extending the first:
 *
 * > *"epics should never show up in the board, timeline and calendar views.
 * > they can only be in the list views."*
 *
 * > *"it shouldnt show up in the backlog either. only in the list view."*
 *
 * And one follow-up question the controller put to the owner rather than
 * letting this lane guess, because the Backlog and the List are the SAME
 * COMPONENT (`<TicketList>`) and the Backlog's sections are headed BY THE EPIC:
 *
 * > *"Row only."*
 *
 * So the Backlog keeps its epic-headed SECTIONS and loses the epic ROW. The
 * heading is now the only thing naming the group a child sits in, and the
 * ownership of this distinction is the whole reason the question was asked.
 *
 * ## What this file is, and what it is NOT
 *
 * Every case here is a PAGE case: it renders the real project page over a
 * stubbed server and reads what is DRAWN. The model-level halves — that a
 * hidden epic still counts as a narrowing on the calendar, and that the
 * timeline's lane keeps its name — live in `packages/app-core`, where the
 * model is, and are not repeated here.
 *
 * ⚠ EACH VIEW GETS ITS OWN CASE, PER VIEW, ON PURPOSE. The dispatch asked for
 * the exclusion to be witnessable one view at a time: removing it from ONE
 * view must redden that view's case and no other's. A single test that rendered
 * all four tabs and asserted "no epic anywhere" would pass with three of the
 * four exclusions missing, which is the check-that-cannot-fail shape this
 * project keeps recording.
 *
 * ⚠ `getTicketTypes` SERVES A RANK-1 TYPE IN EVERY CASE, and that is not
 * decoration. An epic is a RANK, never an id (`epic-ancestor.ts`), and
 * `rankOneEpicPredicate([])` answers FALSE for every type — so a fixture with
 * an empty roster would draw every epic and every case below would fail for a
 * reason that is not the product's.
 */

const WORKSPACE_ID = 'ws_1';
const PROJECT_ID = 'p_1';

/** Sunday 2026-09-13, 11:30 IST — inside September, and after the window's own Monday. */
const PINNED_NOW = new Date('2026-09-13T06:00:00.000Z');

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useParams: () => ({ workspaceId: WORKSPACE_ID, projectId: PROJECT_ID }),
  usePathname: () => `/w/${WORKSPACE_ID}/p/${PROJECT_ID}`,
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('../src/auth-client.js', () => ({
  authClient: {
    useSession: () => ({ data: { user: { id: 'user_kiro', name: 'Kiro' } }, isPending: false }),
    signOut: async () => ({ data: {}, error: null }),
  },
}));

import ProjectPage, {
  BACKLOG_EMPTY_COPY,
  BACKLOG_EMPTY_EPICS_COPY,
} from '../app/w/[workspaceId]/p/[projectId]/page.js';

function claim(value: unknown): ClaimProvenance & { value: unknown } {
  return {
    value,
    actorId: 'user_kiro',
    actorName: 'Kiro',
    clientTime: '2026-09-01T10:00:00.000Z',
    serverTime: '2026-09-01T10:00:01.000Z',
  } as ClaimProvenance & { value: unknown };
}

/** A `ListRow` exactly as `view-types.ts` declares it. */
function row(overrides: Partial<ListRow> = {}): ListRow {
  const base: ListRow = {
    ticketId: 't_1',
    title: 'Restock the cold shelf',
    typeId: 'task',
    typeRank: 3,
    parentId: null,
    epicId: null,
    stateId: 'doing',
    stateName: 'Doing',
    stateCategory: 'active',
    stateProvenance: claim(undefined),
    assignee: null,
    assignedProvenance: null,
    dueDate: null,
    // REQUIRED since spec 2026-09-22. Built from the four provenance fields
    // directly rather than through `claim(...)`: that helper's shape carries its
    // own `value` key (it is the `fields`-entry factory), and `PriorityView`
    // nests the claim under `claim` — reusing it here would put a stray `value`
    // inside the provenance and read as if it meant something.
    priority: {
      value: 'P2',
      claim: {
        actorId: 'user_kiro',
        actorName: 'Kiro',
        clientTime: '2026-09-01T10:00:00.000Z',
        serverTime: '2026-09-01T10:00:01.000Z',
      },
    },
    fields: { title: claim('Restock the cold shelf') },
    rollup: null,
    hasRestrictedParent: false,
    pending: false,
    closed: null,
    rank: null,
  };
  return { ...base, ...overrides, fields: { ...base.fields, ...overrides.fields } };
}

function card(overrides: Partial<BoardCard> = {}): BoardCard {
  return {
    ticketId: 't_1',
    title: 'Restock the cold shelf',
    typeId: 'task',
    assignee: null,
    stateProvenance: claim(undefined),
    // Ruling E5-2 made this REQUIRED on `BoardCard`; `null` is "this ticket
    // claims no date", the same default `boardCardSeed` uses.
    dueDate: null,
    // REQUIRED since spec 2026-09-22; see the same member on `row()` above.
    priority: {
      value: 'P2',
      claim: {
        actorId: 'user_kiro',
        actorName: 'Kiro',
        clientTime: '2026-09-01T10:00:00.000Z',
        serverTime: '2026-09-01T10:00:01.000Z',
      },
    },
    cause: null,
    rollup: null,
    pending: false,
    ...overrides,
  };
}

function boardOf(cards: BoardCard[]): BoardView {
  return {
    projectId: PROJECT_ID,
    groups: [
      {
        workflowId: 'wf_basic',
        workflowVersion: 1,
        workflowName: 'Basic',
        columns: [{ stateId: 'doing', name: 'Doing', category: 'active', blocked: false, cards }],
      },
    ],
  };
}

/** `rank: 1` is the epic rank, and it is the ONLY thing that makes a type one. */
const EPIC_TYPE: TicketTypeDef = {
  id: 'epic',
  name: 'Epic',
  icon: 'layers',
  rank: 1,
  workflowId: 'wf_basic',
  fields: [],
};
const TASK_TYPE: TicketTypeDef = {
  id: 'task',
  name: 'Task',
  icon: 'check',
  rank: 3,
  workflowId: 'wf_basic',
  fields: [],
};

function servedWorld(
  options: {
    cards?: BoardCard[];
    rows?: ListRow[];
    types?: TicketTypeDef[];
  } = {},
) {
  return stubServices({
    getBoard: async () => boardOf(options.cards ?? []),
    getMembers: async () => [],
    getTicketTypes: async () => options.types ?? [EPIC_TYPE, TASK_TYPE],
    getTickets: async (): Promise<TicketListView> => ({
      projectId: PROJECT_ID,
      rows: options.rows ?? [],
    }),
  });
}

/** Pins the clock for the two date views, and restores it whatever the case does. */
function pinClock(): void {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(PINNED_NOW);
}

afterEach(() => {
  vi.useRealTimers();
  push.mockClear();
});

const EPIC_CARD = card({ ticketId: 'epic_1', title: 'The epic', typeId: 'epic' });
const TASK_CARD = card({ ticketId: 'task_1', title: 'Restock the cold shelf', typeId: 'task' });

/**
 * 13.1038 — THE BOARD. The epic's card is gone, and BOTH counts move with it:
 * the column's own chip and the strip's `N of M`.
 */
describe('13.1038 the Board draws no epic card, and neither count includes one', () => {
  it('drops the rank-1 card from the grid, the column count, and the N of M strip', async () => {
    render(
      <Providers services={servedWorld({ cards: [EPIC_CARD, TASK_CARD] })}>
        <ProjectPage />
      </Providers>,
    );

    await screen.findByRole('searchbox');
    expect(await screen.findByText('Restock the cold shelf')).toBeInTheDocument();
    expect(screen.queryByText('The epic')).not.toBeInTheDocument();

    // THE COLUMN'S COUNT: one card drawn, one counted.
    const count = document.querySelector('.gn-board__count');
    expect(count?.textContent).toBe('1');

    /*
      THE STRIP. `1 of 2 shown` is the exact string a board that counted the
      epic in `total` without drawing it would print — a permanent narrowing
      claim over a project with no filter in force, and the reason the epic is
      dropped BEFORE `total` increments. Named literally rather than trusting
      that any wrong answer looks different: a plausible wrong string and a
      right one can both render.
    */
    expect(screen.queryByText('1 of 2 shown')).not.toBeInTheDocument();
    expect(screen.queryByText(/of \d+ shown/)).not.toBeInTheDocument();
  });
});

/**
 * 13.1043 — THE ALL-EPIC BOARD NAMES THE CAUSE (owner ruling, 2026-09-20), **AND IT IS NOT
 * THE SENTENCE A GENUINELY EMPTY PROJECT GETS.**
 *
 * Minted as a RECORDED residual: `#602` left it saying *"No tickets here yet — create one."*
 * over a project that holds an epic, where "create one" names the one action that cannot
 * help. It flips with this change — and it flips into **TWO arms**, because a single
 * sentence for both cases is exactly the defect the split exists to prevent.
 */
describe('13.1043 the all-epic Board names the cause, and the empty Board keeps its own sentence', () => {
  it('says epics appear in the List over a project that holds an epic', async () => {
    render(
      <Providers services={servedWorld({ cards: [EPIC_CARD] })}>
        <ProjectPage />
      </Providers>,
    );
    await screen.findByRole('searchbox');
    expect(await screen.findByText(EMPTY_BOARD_EPICS_COPY)).toBeInTheDocument();
    // AND NOT THE OLD ONE, which is the sentence this case was minted to record: it calls
    // an epic-holding project empty and points at "create one".
    expect(screen.queryByText(EMPTY_BOARD_COPY)).toBeNull();
    expect(screen.queryByText('The epic')).not.toBeInTheDocument();
  });

  /**
   * ⚠ THE ARM THAT MAKES THE SPLIT A MEASUREMENT RATHER THAN A WISH — controller ruling
   * (b): *"a project with nothing in it is not that case — its sentence was true before
   * the ruling and is still true after it."*
   *
   * **Represented here as a PROP rather than derived in the component**, because the two
   * cases are otherwise identical: a page spec asserting the same constant for both, from
   * the same gate, is what established that. One card different from the arm above.
   */
  it('13.1043 CONTROL — a genuinely empty project keeps "No tickets here yet — create one."', async () => {
    render(
      <Providers services={servedWorld({ cards: [] })}>
        <ProjectPage />
      </Providers>,
    );
    await screen.findByRole('searchbox');
    expect(await screen.findByText(EMPTY_BOARD_COPY)).toBeInTheDocument();
    expect(screen.queryByText(EMPTY_BOARD_EPICS_COPY)).toBeNull();
  });
});

/**
 * 13.1046 — THE FOURTH EMPTY STATE, AND THE ONE `#602` DID NOT MINT.
 *
 * The SAME `boardNarrowing` pass that drops the epic from the grid drops it from
 * `column.cards` too. `boardOf` above always builds a `Doing` column, so the fixture
 * 13.1043 uses **is** an all-epic board with a workflow attached — that case simply never
 * asserted the region, which is how this site went unminted. **The two sentences render on
 * ONE screen**: 13.1043's whole-board copy sits above a rail of columns, each saying its
 * own.
 *
 * ⚠ ITS OWN ARM, DELIBERATELY — and this is a correction, not tidiness. The first version
 * of this measurement asserted both sentences in ONE test with the BOARD first. Under a
 * mutation the board assertion failed and aborted the test before this one ran, so the run
 * proved the TEST was sensitive while leaving THIS claim unwitnessed. **An assertion above
 * another masks it; a red test can be as silent as a green one about the line you care
 * about.**
 */
describe('13.1046 the all-epic column names the cause, and an empty column keeps its own sentence', () => {
  it('draws the Doing region and renders EMPTY_COLUMN_EPICS_COPY inside it', async () => {
    render(
      <Providers services={servedWorld({ cards: [EPIC_CARD] })}>
        <ProjectPage />
      </Providers>,
    );
    await screen.findByRole('searchbox');

    // The rail must exist for the assertion below to be about it at all.
    const doing = await screen.findByRole('region', { name: 'Doing' });
    expect(within(doing).getByText(EMPTY_COLUMN_EPICS_COPY)).toBeInTheDocument();
    // And not the column's other sentence, which is true of it only when epics are NOT
    // the reason it is empty.
    expect(screen.queryByText(EMPTY_COLUMN_COPY)).toBeNull();
  });

  /**
   * ⚠ RULING (b) AT THE COLUMN, AND IT IS A SEPARATE ARM FROM THE BOARD'S because this is
   * a separate gate: a column only takes the new sentence when NOTHING else was removed
   * from it (`.epicsHidden` on the column, stricter than the board's). A column with no
   * cards at all keeps the original sentence.
   */
  it('13.1046 CONTROL — a genuinely empty column keeps "No tickets in this column."', async () => {
    render(
      <Providers services={servedWorld({ cards: [] })}>
        <ProjectPage />
      </Providers>,
    );
    await screen.findByRole('searchbox');
    const doing = await screen.findByRole('region', { name: 'Doing' });
    expect(within(doing).getByText(EMPTY_COLUMN_COPY)).toBeInTheDocument();
    expect(screen.queryByText(EMPTY_COLUMN_EPICS_COPY)).toBeNull();
  });

  /**
   * THE SECOND CONTROL, on the same fixture and one card different: with a TASK sitting in
   * the column it is not empty and no column sentence renders.
   */
  it('13.1046 CONTROL — the same fixture with a TASK card renders no column sentence', async () => {
    render(
      <Providers services={servedWorld({ cards: [TASK_CARD] })}>
        <ProjectPage />
      </Providers>,
    );
    await screen.findByRole('searchbox');
    expect(await screen.findByText('Restock the cold shelf')).toBeInTheDocument();
    expect(screen.queryByText(EMPTY_COLUMN_COPY)).toBeNull();
    expect(screen.queryByText(EMPTY_COLUMN_EPICS_COPY)).toBeNull();
  });
});

const BACKLOG_EPIC = row({
  ticketId: 'epic_1',
  title: 'The epic',
  typeId: 'epic',
  typeRank: 1,
  epicId: 'epic_1',
  stateId: BACKLOG_STATE_ID,
  stateName: 'Backlog',
  stateCategory: 'open',
  fields: { title: claim('The epic') },
});
const BACKLOG_CHILD = row({
  ticketId: 'child_1',
  title: 'A child of the epic',
  typeId: 'task',
  typeRank: 3,
  parentId: 'epic_1',
  epicId: 'epic_1',
  stateId: BACKLOG_STATE_ID,
  stateName: 'Backlog',
  stateCategory: 'open',
  fields: { title: claim('A child of the epic') },
});

/**
 * 13.1039 — THE BACKLOG, and it is the one view with TWO answers: the epic is
 * VISIBLE AS A NAME and ABSENT AS A TICKET.
 */
describe('13.1039 the Backlog loses the epic ROW and keeps the epic SECTION HEADER', () => {
  it('does not draw the epic as a row, still heads its section with the epic, and still draws the child', async () => {
    render(
      <Providers services={servedWorld({ rows: [BACKLOG_EPIC, BACKLOG_CHILD] })}>
        <ProjectPage />
      </Providers>,
    );
    await userEvent.click(await screen.findByRole('tab', { name: 'Backlog' }));

    // THE NAME SURVIVES — the section's own accessible name is the epic's
    // title, resolved through `labels.epicTitle`, which reads `list.rows`
    // UNNARROWED on purpose. A header sourced from the epic's own row would
    // have gone with it.
    const section = await screen.findByRole('region', { name: 'The epic' });
    expect(within(section).getByText('The epic')).toBeInTheDocument();

    // THE ROW DOES NOT. `ticket-card-<id>` is the title cell's own testid in
    // `ticket-list.tsx` — the thing you click to open the ticket — so its
    // absence is the absence of the ticket, not of the string.
    expect(screen.queryByTestId('ticket-card-epic_1')).not.toBeInTheDocument();
    expect(screen.getByTestId('ticket-card-child_1')).toBeInTheDocument();
    expect(screen.getByText('A child of the epic')).toBeInTheDocument();

    /*
      AND THE "of M" MOVES TOO, asserted literally because a mutation that left
      the epic in `total` SURVIVED the rest of this case: the row was gone, the
      header was there, the child was there, and the strip printed `1 of 2
      shown` over a backlog with no filter in force. `shown === total` is what
      keeps that strip off the screen at all.
    */
    expect(screen.queryByText('1 of 2 shown')).not.toBeInTheDocument();
    expect(screen.queryByText(/of \d+ shown/)).not.toBeInTheDocument();
  });

  /**
   * THE CONTROL FOR THE CASE ABOVE, and it is the arm that makes it a
   * measurement rather than an assumption: the SAME fixture on the List tab
   * still draws the epic as a row. If the assertion above were passing because
   * `ticket-card-*` is the wrong testid, or because the epic row never renders
   * for some unrelated reason, this arm would fail.
   */
  it('13.1040 — the List still draws the epic as a row, the ruling\'s other half', async () => {
    render(
      <Providers services={servedWorld({ rows: [BACKLOG_EPIC, BACKLOG_CHILD] })}>
        <ProjectPage />
      </Providers>,
    );
    await userEvent.click(await screen.findByRole('tab', { name: 'List' }));
    expect(await screen.findByTestId('ticket-card-epic_1')).toBeInTheDocument();
  });
});

/**
 * 13.1044 — THE ALL-EPIC BACKLOG NAMES THE CAUSE (owner ruling, 2026-09-20), **AND AN
 * EMPTY BACKLOG KEEPS ITS OWN SENTENCE.**
 *
 * Minted as a RECORDED residual: the sentence *"Nothing in the backlog — new tickets land
 * here."* was a claim about the backlog SET, and an epic is literally a member of it
 * (`stateId === BACKLOG_STATE_ID` is the very field `backlogNarrowing` reads to decide
 * what the backlog is) — so it denied the existence of something in the set it named.
 *
 * The sentence is chosen by the PAGE, not by `TicketList`: the component is handed only
 * the surviving rows and cannot tell a backlog that holds nothing from one whose only
 * tickets were epics.
 */
describe('13.1044 the all-epic Backlog names the cause, and an empty backlog keeps its own sentence', () => {
  it('says epics appear in the List over a backlog that holds an epic', async () => {
    render(
      <Providers services={servedWorld({ rows: [BACKLOG_EPIC] })}>
        <ProjectPage />
      </Providers>,
    );
    await userEvent.click(await screen.findByRole('tab', { name: 'Backlog' }));
    expect(await screen.findByText(BACKLOG_EMPTY_EPICS_COPY)).toBeInTheDocument();
    expect(screen.queryByText(BACKLOG_EMPTY_COPY)).toBeNull();
  });

  /**
   * ⚠ RULING (b): *"a project with nothing in it is not that case."* One fixture array
   * different from the arm above.
   */
  it('13.1044 CONTROL — a genuinely empty backlog keeps "Nothing in the backlog — new tickets land here."', async () => {
    render(
      <Providers services={servedWorld({ rows: [] })}>
        <ProjectPage />
      </Providers>,
    );
    await userEvent.click(await screen.findByRole('tab', { name: 'Backlog' }));
    expect(await screen.findByText(BACKLOG_EMPTY_COPY)).toBeInTheDocument();
    expect(screen.queryByText(BACKLOG_EMPTY_EPICS_COPY)).toBeNull();
  });
});

const DATED_EPIC = row({
  ticketId: 'epic_1',
  title: 'The epic',
  typeId: 'epic',
  typeRank: 1,
  epicId: 'epic_1',
  fields: {
    title: claim('The epic'),
    startDate: claim({ date: '2026-09-15' }),
    dueDate: claim({ date: '2026-09-18' }),
  },
});
const DATED_CHILD = row({
  ticketId: 'child_1',
  title: 'A child of the epic',
  typeId: 'task',
  typeRank: 3,
  parentId: 'epic_1',
  epicId: 'epic_1',
  fields: {
    title: claim('A child of the epic'),
    startDate: claim({ date: '2026-09-21' }),
    dueDate: claim({ date: '2026-09-25' }),
  },
});

/** 13.1041 — THE CALENDAR. The epic's claimed dates are not drawn; its child's still are. */
describe('13.1041 the Calendar draws no entry for the epic, and still draws its child', () => {
  it('omits the epic\'s bar from the month grid and keeps the child\'s', async () => {
    pinClock();
    render(
      <Providers services={servedWorld({ rows: [DATED_EPIC, DATED_CHILD] })}>
        <ProjectPage />
      </Providers>,
    );
    await userEvent.click(await screen.findByRole('tab', { name: 'Calendar' }));

    // The child is the POSITIVE CONTROL and it runs first: it proves the
    // fixture really reaches the grid, so the negative below is about the epic
    // rather than about a month that drew nothing at all.
    expect(await screen.findByText('A child of the epic')).toBeInTheDocument();
    expect(screen.queryByText('The epic')).not.toBeInTheDocument();
  });
});

/** 13.1042 — THE TIMELINE. The epic's bar goes; the LANE it names stays. */
describe('13.1042 the Timeline draws no bar for the epic and KEEPS its lane heading', () => {
  it('omits the epic\'s row from the grid, and its lane still heads the child\'s bar', async () => {
    pinClock();
    render(
      <Providers services={servedWorld({ rows: [DATED_EPIC, DATED_CHILD] })}>
        <ProjectPage />
      </Providers>,
    );
    await userEvent.click(await screen.findByRole('tab', { name: 'Timeline' }));

    // THE HEADING IS THE HALF THAT STAYS, and it is asserted by ROLE so it
    // cannot be satisfied by a row that happens to carry the same string:
    // `gn-timeline__group-heading` is the `<h3>` over the lane.
    expect(await screen.findByRole('heading', { name: 'The epic' })).toBeInTheDocument();

    // AND THE ROW IS THE HALF THAT GOES. `data-ticket-id` names the row the
    // model placed, so its absence is the absence of the epic's own bar.
    const rows = [...document.querySelectorAll('.gn-timeline__row')];
    expect(rows.map((element) => element.getAttribute('data-ticket-id'))).toEqual(['child_1']);
  });
});
