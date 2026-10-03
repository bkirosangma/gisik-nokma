import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { Profiler } from 'react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { BoardCard, BoardView, ClaimProvenance, ListRow, TicketListView } from '@gisik-nokma/app-core';
import { Providers } from '../src/providers.js';
import { stubServices } from './helpers/stub-services.js';

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
    useSession: () => ({ data: { user: { id: '01J9USER000000000000000000', name: 'Anselma Marak' } } }),
    signOut: async () => ({ data: {}, error: null }),
  },
}));

import ProjectPage from '../app/w/[workspaceId]/p/[projectId]/page.js';

/**
 * Smoothness T12 (audit SM-10, owner D12) — case 25.203. The search box writes the live filter and must paint at once; the
 * board's narrowing reads a DEFERRED copy, so a keystroke's own commit is the box with the OLD board and a later commit is
 * the narrowed board. Read where React commits: a `Profiler` fires in the commit's layout phase, with the DOM already
 * written, so each commit's (box value, cards on screen) is observed directly rather than inferred from timing.
 */

function claim(): ClaimProvenance {
  return { actorId: 'user_kiro', actorName: 'Kiro', clientTime: '2026-08-19T10:00:00.000Z', serverTime: '2026-08-19T10:00:01.000Z' };
}

function card(ticketId: string, title: string): BoardCard {
  return {
    ticketId,
    title,
    typeId: 'task',
    assignee: null,
    stateProvenance: claim(),
    dueDate: null,
    key: null,
    priority: { value: 'P2', claim: claim() },
    cause: null,
    rollup: null,
    pending: false,
    parent: null,
    epic: null,
  };
}

const COUNT = 300;
const cards: BoardCard[] = [
  ...Array.from({ length: COUNT }, (_, index) => card(`t_${index}`, `Restock shelf ${index}`)),
  card('t_match', 'Board onboarding checklist'),
];

const board: BoardView = {
  projectId: PROJECT_ID,
  groups: [
    {
      workflowId: 'wf_1',
      workflowVersion: 1,
      workflowName: 'Basic',
      columns: [{ stateId: 'doing', name: 'Doing', category: 'active', blocked: false, creatable: true, cards }],
    },
  ],
};

function listRow(ticketId: string, title: string): ListRow {
  return {
    ticketId,
    title,
    key: 'CCSO-7',
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
    priority: { value: 'P2', claim: claim() },
    fields: { title: { value: title, actorId: 'user_kiro', clientTime: '2026-08-19T10:00:00.000Z', serverTime: '2026-08-19T10:00:01.000Z' } },
    rollup: null,
    hasRestrictedParent: false,
    pending: false,
    closed: null,
    rank: null,
  };
}

const rows: ListRow[] = [
  ...Array.from({ length: COUNT }, (_, index) => listRow(`l_${index}`, `Restock shelf ${index}`)),
  listRow('l_match', 'Board onboarding checklist'),
];

const services = () =>
  stubServices({
    getBoard: async () => board,
    getMembers: async () => [],
    getTicketTypes: async () => [],
    getTickets: async (): Promise<TicketListView> => ({ projectId: PROJECT_ID, rows }),
  });

const cardsOnScreen = () => document.querySelectorAll('[data-testid^="ticket-card-"]').length;

describe('25.203 typing paints the box before the board narrows', () => {
  it('25.203 one commit has the new text over the old board; the narrowed board follows and is correct', async () => {
    const commits: Array<{ text: string; cards: number }> = [];
    render(
      <Profiler
        id="page"
        onRender={() => {
          const box = document.querySelector('input[type="search"]') as HTMLInputElement | null;
          commits.push({ text: box?.value ?? '', cards: cardsOnScreen() });
        }}
      >
        <Providers services={services()}>
          <ProjectPage />
        </Providers>
      </Profiler>,
    );
    const box = await screen.findByRole('searchbox');
    // CONTROL — the whole board is on screen before anything is typed (a real measurement, not a silent zero).
    await screen.findByText('Board onboarding checklist');
    expect(cardsOnScreen()).toBe(COUNT + 1);

    commits.length = 0;
    await act(async () => {
      fireEvent.change(box, { target: { value: 'board' } });
    });

    // THE PROPERTY — a commit painted the typed text while the board was still whole …
    expect(commits.some((commit) => commit.text === 'board' && commit.cards === COUNT + 1)).toBe(true);
    // … and the board then narrowed to the one match, and says so.
    expect(commits.at(-1)).toEqual({ text: 'board', cards: 1 });
    expect(await screen.findByText(`1 of ${COUNT + 1} shown`)).toBeInTheDocument();
    expect(screen.getByText('Board onboarding checklist')).toBeInTheDocument();
  });
});

const chipOnScreen = () => document.querySelector('[data-testid="board-filter-chip-text"]')?.textContent?.includes('Search: "board"') === true;

/**
 * Case 25.206 — the chips read the LIVE filter. The box's own commit already carries the new `Search: "…"` chip while the
 * board is still whole, and removing the chip drops it from the strip at once while the board is still narrowed; the
 * narrowed (or restored) board follows in a later commit. Same `Profiler` reading as 25.203.
 */
describe('25.206 the filter chips follow the live filter, not the deferred one', () => {
  it('25.206 a typed term shows its chip before the board narrows; removing the chip drops it before the board widens', async () => {
    const commits: Array<{ chip: boolean; cards: number }> = [];
    render(
      <Profiler id="page" onRender={() => commits.push({ chip: chipOnScreen(), cards: cardsOnScreen() })}>
        <Providers services={services()}>
          <ProjectPage />
        </Providers>
      </Profiler>,
    );
    const box = await screen.findByRole('searchbox');
    await screen.findByText('Board onboarding checklist');
    // CONTROL — the whole board and no chip before anything is typed.
    expect({ chip: chipOnScreen(), cards: cardsOnScreen() }).toEqual({ chip: false, cards: COUNT + 1 });

    commits.length = 0;
    await act(async () => {
      fireEvent.change(box, { target: { value: 'board' } });
    });
    expect(commits.some((commit) => commit.chip && commit.cards === COUNT + 1)).toBe(true);
    expect(commits.at(-1)).toEqual({ chip: true, cards: 1 });

    commits.length = 0;
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Remove filter: Search: "board"' }));
    });
    expect(commits.some((commit) => !commit.chip && commit.cards === 1)).toBe(true);
    expect(commits.at(-1)).toEqual({ chip: false, cards: COUNT + 1 });
  });
});

/**
 * Case 25.208 — the List tab's narrowing is deferred too (`listFilterSpec`); the Calendar and Timeline tabs read the same
 * `listFilterSpec`, so this one case stands for all three.
 */
describe('25.208 the List tab narrows on the deferred text', () => {
  it('25.208 on the List tab one commit has the new text over all the rows; the narrowed rows follow', async () => {
    const commits: Array<{ text: string; rows: number; chip: boolean }> = [];
    render(
      <Profiler
        id="page"
        onRender={() => {
          const box = document.querySelector('input[type="search"]') as HTMLInputElement | null;
          commits.push({ text: box?.value ?? '', rows: cardsOnScreen(), chip: chipOnScreen() });
        }}
      >
        <Providers services={services()}>
          <ProjectPage />
        </Providers>
      </Profiler>,
    );
    await userEvent.setup().click(await screen.findByRole('tab', { name: 'List' }));
    await screen.findByRole('searchbox');
    // CONTROL — every row is on screen before anything is typed (the List does not window them).
    await screen.findByText('Board onboarding checklist');
    expect(cardsOnScreen()).toBe(COUNT + 1);

    commits.length = 0;
    await act(async () => {
      fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'board' } });
    });
    expect(commits.some((commit) => commit.text === 'board' && commit.rows === COUNT + 1)).toBe(true);
    // The List strip's chips are live too (`listFilterChips`): the chip is already there in a commit that still shows every row.
    expect(commits.some((commit) => commit.chip && commit.rows === COUNT + 1)).toBe(true);
    expect(commits.at(-1)).toEqual({ text: 'board', rows: 1, chip: true });
    expect(within(document.body).getByText('Board onboarding checklist')).toBeInTheDocument();
  });
});
