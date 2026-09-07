import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import McpTokensPage from '../app/mcp/tokens/page.js';
import { Providers } from '../src/providers.js';
import { stubServices } from './helpers/stub-services.js';

/**
 * Plan: MCP server, Task 12. Cases 14.96–14.99.
 *
 * The revoke screen is the ONLY way a person withdraws an assistant's access
 * until somebody gives them a `psql` prompt, so it gets gate coverage rather
 * than living behind `test:e2e`, which CI does not run.
 *
 * `fetch` is stubbed at the boundary the page actually uses — it builds
 * `createHttpClient('', fetch)` inline — so these cases drive the real client,
 * the real 404-throws-on-a-DELETE rule, and the real component.
 */
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams(),
}));

let session: { data?: { user?: { id: string; name: string } }; isPending: boolean } = {
  isPending: false,
};
vi.mock('../src/auth-client.js', () => ({
  authClient: {
    useSession: () => session,
    signOut: async () => ({ data: {}, error: null }),
  },
}));

const ID = 'a'.repeat(64);
const OTHER = 'b'.repeat(64);

type Call = { url: string; method: string };
let calls: Call[] = [];

/** A `fetch` that answers from a script, recording every call it was asked to make. */
function fetchStub(script: (call: Call, n: number) => { status: number; body?: unknown }): void {
  let n = 0;
  globalThis.fetch = (async (input: string, init?: RequestInit) => {
    const call = { url: String(input), method: init?.method ?? 'GET' };
    calls.push(call);
    const answer = script(call, n);
    n += 1;
    return {
      ok: answer.status >= 200 && answer.status < 300,
      status: answer.status,
      json: async () => answer.body,
    } as Response;
  }) as typeof globalThis.fetch;
}

function mount(): void {
  render(
    <Providers services={stubServices({})}>
      <McpTokensPage />
    </Providers>,
  );
}

beforeEach(() => {
  calls = [];
  session = { isPending: false, data: { user: { id: '01J9USER000000000000000000', name: 'Kiro' } } };
});

describe('14.96 signed out', () => {
  it('offers a sign-in that lands back here, and asks the server nothing', async () => {
    session = { isPending: false };
    fetchStub(() => ({ status: 200, body: { tokens: [] } }));
    mount();

    const link = screen.getByRole('link', { name: 'Sign in' });
    expect(link).toHaveAttribute('href', `/sign-in?next=${encodeURIComponent('/mcp/tokens')}`);
    // Not merely "no list rendered": a signed-out page that still fired the
    // request would 401 and look identical on screen.
    await waitFor(() => expect(calls).toEqual([]));
  });
});

describe('14.97 the list shows what is honestly available', () => {
  it('names the approval date and NEVER anything resembling the credential', async () => {
    const zone = vi.spyOn(Date.prototype, 'toLocaleDateString');
    fetchStub(() => ({
      status: 200,
      body: { tokens: [{ id: ID, createdAt: '2026-09-07T19:51:44.951Z' }] },
    }));
    mount();

    await screen.findByTestId('mcp-tokens-list');
    // The rendered day, and then the thing the rendered day CANNOT prove here.
    // This instant is 19:51Z on the 7th: "7 Sept 2026" in UTC, "8 Sept 2026" in
    // IST. Asserting the day alone looked like it pinned the timezone — and
    // measured, it did not: removing `timeZone: 'Asia/Kolkata'` left this case
    // green, because THIS RUNNER IS ALREADY IN IST and the ambient default
    // agreed. The options object is what makes the claim falsifiable anywhere.
    expect(screen.getByText(/Approved 8 Sept 2026/)).toBeInTheDocument();
    expect(zone.mock.calls[0]?.[1]).toMatchObject({ timeZone: 'Asia/Kolkata' });
    // `mcp_tokens` stores only sha256(token). A row that printed the id would
    // be showing a hash while implying it had the credential.
    expect(document.body.textContent ?? '').not.toContain(ID);
    expect(screen.getByRole('button', { name: 'Revoke' })).toBeInTheDocument();
  });

  it('says where a connection comes from when there are none', async () => {
    fetchStub(() => ({ status: 200, body: { tokens: [] } }));
    mount();
    await screen.findByTestId('mcp-tokens-empty');
    expect(screen.getByRole('link', { name: 'connect page' })).toHaveAttribute(
      'href',
      '/mcp/authorize',
    );
  });
});

describe('14.98 revoking', () => {
  it('DELETEs that row’s id and reloads the list from the server', async () => {
    // TWO rows, and the SECOND is the one revoked. With one row the assertion
    // below cannot fail: `tokens[0].id` and the clicked row's id are the same
    // string, so a handler that always revoked the first token passed — checked
    // by mutation, and it did.
    const both = [
      { id: ID, createdAt: '2026-09-07T19:51:44.951Z' },
      { id: OTHER, createdAt: '2026-09-06T10:00:00.000Z' },
    ];
    fetchStub((call) => {
      if (call.method === 'DELETE') return { status: 204 };
      const already = calls.some((c) => c.method === 'DELETE');
      return { status: 200, body: { tokens: already ? [both[0]] : both } };
    });
    mount();
    await screen.findByTestId('mcp-tokens-list');

    await userEvent.click(screen.getByTestId(`mcp-tokens-revoke-${OTHER}`));

    await waitFor(() => expect(screen.queryByTestId(`mcp-tokens-revoke-${OTHER}`)).toBeNull());
    const del = calls.filter((c) => c.method === 'DELETE');
    expect(del).toHaveLength(1);
    // THAT row's id, not whichever token the component happened to hold first.
    expect(del[0]?.url).toBe(`/v1/me/mcp-tokens/${OTHER}`);
    expect(del[0]?.url).not.toContain(ID);
    // Reloaded from the server rather than spliced locally: a client that only
    // removed the row would keep showing a stale list after any other change.
    expect(calls.filter((c) => c.method === 'GET')).toHaveLength(2);
  });
});

describe('14.99 a revoke the server refuses', () => {
  it('reports the 404 as “already gone” — the only thing true of both its meanings', async () => {
    fetchStub((call) => {
      if (call.method === 'DELETE') return { status: 404, body: { error: 'not_found' } };
      return { status: 200, body: { tokens: [{ id: ID, createdAt: '2026-09-07T19:51:44.951Z' }] } };
    });
    mount();
    await screen.findByTestId('mcp-tokens-list');

    await userEvent.click(screen.getByTestId(`mcp-tokens-revoke-${ID}`));

    const said = await screen.findByTestId('mcp-tokens-refused');
    // The server's 404 is deliberately ambiguous — the same answer for "not
    // yours" and "already gone" — so the screen must not claim to know which.
    expect(said).toHaveTextContent('That connection is already gone. The list below is up to date.');
    expect(said).toHaveAttribute('role', 'alert');
    // And it re-read the list rather than leaving a row the server may have
    // already dropped.
    await waitFor(() => expect(calls.filter((c) => c.method === 'GET')).toHaveLength(2));
  });
});
