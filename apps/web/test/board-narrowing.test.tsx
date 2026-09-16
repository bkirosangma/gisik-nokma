import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { BoardCard, BoardView, ClaimProvenance, TicketListView } from '@gisik-nokma/app-core';
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
 * with three cards and a list fixture with one row, `activeOnly` turned on,
 * and an assertion that the count reads the board's three, never the list's
 * one.
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
    // The list fixture is narrower than the board fixture — exactly the shape
    // `activeOnly` produces server-side against a real server (terminal
    // tickets withheld from `getTickets`, never from `getBoard`, which cannot
    // take a filter at all — see this file's own docblock).
    render(
      <Providers services={servedBoard(threeCards, [])}>
        <ProjectPage />
      </Providers>,
    );
    await screen.findByText('Restock the cold shelf');

    await userEvent.click(screen.getByLabelText('Only tickets in progress'));
    // The pre-existing note this page already renders for the toggle — kept
    // intact, not replaced by anything this task adds.
    expect(await screen.findByTestId('list-filter-note')).toHaveTextContent(/in progress/i);

    await userEvent.type(await searchbox(), 'board');

    // Honest: the board's own total is 3, unaffected by `activeOnly` — this
    // would read "1 of 0 shown" (or throw) if `M` were ever sourced from
    // `list.rows.length` instead of `board.data`.
    expect(await screen.findByText('1 of 3 shown')).toBeInTheDocument();
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
