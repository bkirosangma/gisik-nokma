import { act, fireEvent, render, screen } from '@testing-library/react';
import { Profiler } from 'react';
import { describe, expect, it, vi } from 'vitest';
import type { BoardCard, BoardView, ClaimProvenance, TicketListView } from '@gisik-nokma/app-core';
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

const services = () =>
  stubServices({
    getBoard: async () => board,
    getMembers: async () => [],
    getTicketTypes: async () => [],
    getTickets: async (): Promise<TicketListView> => ({ projectId: PROJECT_ID, rows: [] }),
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
