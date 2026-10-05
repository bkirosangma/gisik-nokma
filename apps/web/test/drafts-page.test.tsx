import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TicketState, WorkflowDef } from '@gisik-nokma/domain';
import type { DataSourceQuery, DraftRow, TicketRead } from '@gisik-nokma/app-core';
import { createClientStateCache } from '@gisik-nokma/app-core';
import { HttpError } from '@gisik-nokma/app-core/online';
import { Providers } from '../src/providers.js';
import { EXPIRED_SESSION_COPY } from '../src/expired-session.js';
import { stubServices } from './helpers/stub-services.js';

/**
 * Case 28.178 (drafts T8): `/w/[workspaceId]/drafts`. The search params are MUTABLE on purpose, as in
 * `my-work-sheet-in-place.test.tsx`: `router.push` is a mock that does not feed back, so a case that needs the sheet on
 * screen sets the param and re-renders, which is what the router's landing produces.
 */
const WS = 'ws1';
const USER = 'u_kiro';
const push = vi.fn();
let searchParams = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useParams: () => ({ workspaceId: 'ws1' }),
  usePathname: () => '/w/ws1/drafts',
  useSearchParams: () => searchParams,
}));
vi.mock('../src/auth-client.js', () => ({
  authClient: {
    useSession: () => ({ data: { user: { id: 'u_kiro', name: 'Kiro' } }, isPending: false }),
    signOut: async () => ({ data: {}, error: null }),
  },
}));

import DraftsPage from '../app/w/[workspaceId]/drafts/page.js';

afterEach(() => {
  cleanup();
  push.mockClear();
  searchParams = new URLSearchParams();
});

const WF: WorkflowDef = {
  id: 'wf-errand', version: 1, name: 'Errand', initialStateId: 'todo',
  states: [{ id: 'backlog', name: 'Backlog', category: 'open' }, { id: 'todo', name: 'To do', category: 'open' }],
  transitions: [],
};
const draftRow = (id: string): DraftRow => ({
  ticketId: id, projectId: 'p', projectName: 'P', typeId: 'task', title: id, parentId: null,
  updatedAt: '2026-10-03T08:00:00.000Z', attachmentCount: 0, pending: false,
});
/** The sheet's read of a draft: no key, `draft: true` (the app-core sheet test's builder). */
function draftTicketRead(id = 'a'): TicketRead {
  const ticket: TicketState = {
    kind: 'ticket', id, workspaceId: WS, projectId: 'p', typeId: 'task', parentId: null, workflowId: WF.id,
    workflowVersion: WF.version, stateId: 'backlog', stateCategory: 'open', assigneeId: null, collaboratorIds: [],
    fields: { title: { value: id, actorId: USER, clientTime: '2026-10-03T08:00:00.000Z', serverTime: '2026-10-03T08:00:01.000Z' } },
    transitions: [], closed: null, rank: null, reopenedAt: null, deleted: null,
    draft: { authorId: USER, at: '2026-10-03T08:00:00.000Z' },
  };
  const claim = { actorId: USER, actorName: 'Kiro', clientTime: '2026-10-03T08:00:00.000Z', serverTime: '2026-10-03T08:00:01.000Z', cause: null };
  return { ticket, title: id, stateProvenance: claim, assignedProvenance: null, visibility: null, parent: null, rollup: null, key: null, epic: null, draft: true };
}
const workspaceRow = {
  id: WS, name: 'Roads Co', prefix: 'RC', role: 'owner', archived: false, memberCount: 1, nameRestrictedProjectCount: 0,
  projects: [{ id: 'p', name: 'P', prefix: 'P', archived: false, ticketCount: 0, blockedCount: 0 }],
};

function renderPage(overrides: Partial<DataSourceQuery>) {
  const services = stubServices({
    getMyWorkspaces: async () => [workspaceRow],
    getTicketTypes: async () => [{ id: 'task', name: 'Task', icon: 'check', rank: 3, workflowId: 'wf-errand', fields: [] }],
    getWorkflowDef: async () => WF,
    getTicketHistory: async () => [],
    getTicketComments: async () => [],
    getTicketAttachments: async () => [],
    getMembers: async () => [{ id: USER, name: 'Kiro', role: 'owner' }],
    getTickets: async (projectId) => ({ projectId, rows: [] }),
    ...overrides,
  });
  services.cache = createClientStateCache();
  const view = render(<Providers services={services}><DraftsPage /></Providers>);
  const rerenderWith = (search: string) => {
    searchParams = new URLSearchParams(search);
    view.rerender(<Providers services={services}><DraftsPage /></Providers>);
  };
  return { rerenderWith };
}

describe('28.178 the Drafts page', () => {
  it("28.178 lists the viewer's drafts and opens a listed draft in place; an unlisted ?ticket= mounts nothing", async () => {
    const getMyDrafts = vi.fn(async () => [draftRow('a'), draftRow('b')]);
    const getTicket = vi.fn(async (_ws: string, id: string) => draftTicketRead(id));
    const { rerenderWith } = renderPage({ getMyDrafts, getTicket });
    const list = await screen.findByRole('list', { name: 'Drafts' });
    expect(list.querySelectorAll(':scope > li')).toHaveLength(2);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Open a' }));
    expect(push).toHaveBeenCalledWith('/w/ws1/drafts?ticket=a', { scroll: false });
    rerenderWith('?ticket=a');
    expect(await screen.findByTestId('sheet-crumb-ticket')).toBeInTheDocument();
    rerenderWith('?ticket=not-listed');
    await waitFor(() => expect(screen.queryByTestId('sheet-crumb-ticket')).toBeNull());
    // The crumb is also briefly absent while a mounted sheet reloads, so the sheet's own read is the proof: it never
    // asks for the unlisted id.
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 50)); });
    expect(getTicket.mock.calls.some((call) => call[1] === 'not-listed')).toBe(false);
  });
  it('28.178 an empty list shows the empty state', async () => {
    renderPage({ getMyDrafts: async () => [] });
    expect(await screen.findByText('No drafts. A draft is a ticket only you can see, until you publish it.')).toBeInTheDocument();
  });
  it('28.178 a 401 shows the sign-in notice and no list', async () => {
    renderPage({ getMyDrafts: async () => { throw new HttpError(401, '/v1/workspaces/ws1/drafts', { error: 'unauthenticated' }); } });
    expect(await screen.findByText(EXPIRED_SESSION_COPY)).toBeInTheDocument();
    expect(screen.queryByRole('list', { name: 'Drafts' })).toBeNull();
  });
});
