import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Providers } from '../src/providers.js';
import { stubServices } from './helpers/stub-services.js';

/**
 * Case 23.195 (UX fixes T11, SYS-18): an empty or dead-end state gives a next step, and the next step is a real
 * link or button, not a sentence about one. The web half of the case: the inbox, the connect page with no request
 * and the connected-assistants list. The workflow list and history are in app-core's `empty-states.test.tsx`; the
 * board's empty column and the timeline's undated list are cited there.
 */
const search = { value: '' };
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useParams: () => ({}),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(search.value),
}));
vi.mock('../src/auth-client.js', () => ({
  authClient: {
    useSession: () => ({ data: { user: { id: 'u_kiro', name: 'Kiro' } }, isPending: false }),
    signOut: async () => ({ data: {}, error: null }),
  },
}));

import InboxPage from '../app/inbox/page.js';
import ConnectPage from '../app/mcp/connect/page.js';
import McpTokensPage from '../app/mcp/tokens/page.js';
import NotesPage from '../app/notes/page.js';

const HELP_HREF = '/help#manual-16-connecting-claude-or-chatgpt';

beforeEach(() => {
  search.value = '';
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function stubFetch(answers: Record<string, { status: number; body: unknown }>): void {
  vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
    const url = String(input).split('?')[0]!;
    const hit = answers[url] ?? { status: 404, body: null };
    return new Response(JSON.stringify(hit.body), { status: hit.status, headers: { 'content-type': 'application/json' } });
  });
}

describe('23.195 empty states point to a next step (web)', () => {
  it('the empty inbox links to My work or to the workspace list, never to nothing', async () => {
    render(
      <Providers services={stubServices({}, { notifications: { list: async () => ({ notifications: [], nextCursor: null }) } })}>
        <InboxPage />
      </Providers>,
    );
    await screen.findByText(/^Nothing in your inbox\./);
    const next = await screen.findByRole('link', { name: /^(Open My work|Choose a workspace)$/ });
    const href = next.getAttribute('href')!;
    expect(href === '/workspaces' || /^\/w\/[^/]+\/my-work$/.test(href)).toBe(true);
    // CONTROL, same it(): a non-empty inbox does not show the empty-state step.
    cleanup();
    const row = {
      id: 'n1', userId: 'u_kiro', workspaceId: 'ws_1', kind: 'assignment', dedupeKey: 'a:1', read: false,
      createdAt: '2026-08-20T10:00:00.000Z',
      payload: { ticketId: 't_1', ticketTitle: 'Restock', assignedBy: 'u_ana', eventId: 'e', clientTime: '2026-08-20T09:59:00.000Z', serverTime: '2026-08-20T10:00:00.000Z' },
    };
    render(
      <Providers services={stubServices({}, { notifications: { list: async () => ({ notifications: [row as never], nextCursor: null }) } })}>
        <InboxPage />
      </Providers>,
    );
    await screen.findByText(/Restock/);
    expect(screen.queryByRole('link', { name: /^(Open My work|Choose a workspace)$/ })).toBeNull();
  });

  it('the connect page with no request says so and links to the how-to, apart from the real expiry', async () => {
    search.value = '';
    stubFetch({});
    render(
      <Providers services={stubServices({})}>
        <ConnectPage />
      </Providers>,
    );
    expect(await screen.findByText(/no connection request on this page/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'How to connect an assistant' })).toHaveAttribute('href', HELP_HREF);
    expect(screen.queryByText(/has expired/)).toBeNull();
    // CONTROL, same it(): a request the server no longer knows IS an expiry, and keeps its own sentence.
    cleanup();
    search.value = 'request=req_gone';
    render(
      <Providers services={stubServices({})}>
        <ConnectPage />
      </Providers>,
    );
    expect(await screen.findByText(/has expired/)).toBeInTheDocument();
    expect(screen.queryByText(/no connection request on this page/i)).toBeNull();
  });

  it('an empty connected-assistants list offers the how-to link', async () => {
    stubFetch({
      '/v1/me/mcp-tokens': { status: 200, body: { tokens: [] } },
      '/v1/me/mcp-connections': { status: 200, body: { connections: [] } },
      '/v1/mcp/public-url': { status: 200, body: { url: null } },
    });
    render(
      <Providers services={stubServices({})}>
        <McpTokensPage />
      </Providers>,
    );
    const empty = await screen.findByTestId('mcp-tokens-empty');
    expect(empty).toHaveTextContent('No assistants connected yet.');
    expect(empty.querySelector(`a[href="${HELP_HREF}"]`)).not.toBeNull();
  });

  it('the notes landing offers a Create note control beside "Pick a note"', async () => {
    stubFetch({});
    render(
      <Providers services={stubServices({ getMyWorkspaces: async () => [] }, { notifications: { unreadCount: async () => 0 } })}>
        <NotesPage />
      </Providers>,
    );
    await screen.findByText(/Pick a note/);
    expect(await screen.findByRole('button', { name: 'Create note' })).toBeInTheDocument();
  });
});
