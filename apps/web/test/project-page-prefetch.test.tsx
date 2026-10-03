import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BoardCard, BoardView, TicketListView } from '@gisik-nokma/app-core';
import { Providers } from '../src/providers.js';
import { stubServices } from './helpers/stub-services.js';

/**
 * 25.178 — opening a ticket from the board warms the editor chunk BEFORE the route changes (smoothness T10 FIX 1; audit SM-16). The
 * editor-slot module is mocked at its seam, as the page tests mock theirs, and both calls write to one ordered log.
 */

const PROJECT_ID = '01J9PROJECT000000000000000';
const WORKSPACE_ID = '01J9WORKSPACE0000000000000';

const log = vi.hoisted(() => ({ calls: [] as string[] }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: (url: string) => log.calls.push(`push ${url}`) }),
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

vi.mock('../src/editor-slot.js', () => ({
  prefetchEditor: () => log.calls.push('prefetchEditor'),
  TicketEditorSlot: () => null,
  uploadAttachmentHttp: async () => {
    throw new Error('not used');
  },
}));

import ProjectPage from '../app/w/[workspaceId]/p/[projectId]/page.js';

const claim = { actorId: 'user_kiro', actorName: 'Kiro', clientTime: '2026-08-19T10:00:00.000Z', serverTime: '2026-08-19T10:00:01.000Z' };
const card: BoardCard = {
  ticketId: 't_1',
  title: 'Restock the cold shelf',
  typeId: 'task',
  assignee: null,
  stateProvenance: claim,
  dueDate: null,
  key: null,
  priority: { value: 'P2', claim },
  cause: null,
  rollup: null,
  pending: false,
  parent: null,
  epic: null,
};
const board: BoardView = {
  projectId: PROJECT_ID,
  groups: [
    {
      workflowId: 'wf_1',
      workflowVersion: 1,
      workflowName: 'Basic',
      columns: [{ stateId: 'doing', name: 'Doing', category: 'active', blocked: false, creatable: true, cards: [card] }],
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

beforeEach(() => {
  log.calls.length = 0;
});

describe('25.178 opening a ticket from the board prefetches the editor first', () => {
  it('calls prefetchEditor before the route push, and a render with no open calls neither', async () => {
    render(
      <Providers services={services()}>
        <ProjectPage />
      </Providers>,
    );
    const title = await screen.findByText('Restock the cold shelf');
    // Control: mounting and settling the board opens nothing, so neither call has happened.
    expect(log.calls).toEqual([]);

    await userEvent.click(title);

    expect(log.calls).toEqual(['prefetchEditor', `push /w/${WORKSPACE_ID}/p/${PROJECT_ID}?ticket=t_1`]);
  });
});
