import { render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import McpTokensPage from '../app/mcp/tokens/page.js';
import { Providers } from '../src/providers.js';
import { stubServices } from './helpers/stub-services.js';

/**
 * Plan: MCP server, Task 12. Cases 14.96–14.99, and 14.103 (owner ruling, 2026-09-08).
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

type Call = { url: string; method: string; body?: unknown };
let calls: Call[] = [];

/** A `fetch` that answers from a script, recording every call it was asked to make. */
function fetchStub(script: (call: Call, n: number) => { status: number; body?: unknown }): void {
  let n = 0;
  globalThis.fetch = (async (input: string, init?: RequestInit) => {
    // The REQUEST body is recorded, not just the method and url: a case about a
    // write that only asserted "a PUT happened" would pass on a client that sent
    // the wrong name, or none. It stays the raw string the transport was handed.
    const call = { url: String(input), method: init?.method ?? 'GET', body: init?.body };
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
      body: { tokens: [{ id: ID, createdAt: '2026-09-07T19:51:44.951Z', lastUsedAt: null }] },
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

describe('14.150 a read of your connected assistants that FAILS', () => {
  /**
   * 14.150 — E2-44. `load`'s rejection arm was `() => setTokens([])`, and `[]` is
   * exactly the value the empty arm asserts over ("No assistants are connected.
   * One appears here after you approve it on the connect page."). So a 500 was
   * drawn as a confident statement about the person's account, on the one screen
   * whose whole subject is which assistants still hold access — and the sentence
   * it printed sent them to a connect page to approve a second one.
   *
   * Asserted on the pair, and the absence is the half that matters: the failure
   * sentence is present AND the empty state is not. Asserting only the sentence
   * would pass on a screen that rendered both.
   */
  it('14.150 a rejected read is a failure sentence, never “No assistants are connected”', async () => {
    fetchStub(() => ({ status: 500, body: { error: 'internal' } }));
    mount();

    const failed = await screen.findByTestId('mcp-tokens-failed');
    expect(failed.textContent ?? '').toMatch(/could not be loaded/i);
    expect(screen.queryByTestId('mcp-tokens-empty')).toBeNull();
    expect(screen.queryByTestId('mcp-tokens-list')).toBeNull();
  });

  /**
   * 14.150, second half — the CONTROL that the pair is not satisfied by a screen
   * which simply never renders the empty state. An ANSWERED empty list still has
   * to say the empty sentence; otherwise "no assistants" is unreachable and the
   * fix would have traded one false statement for another.
   */
  it('14.150 control: an ANSWERED empty list still renders the empty state', async () => {
    fetchStub(() => ({ status: 200, body: { tokens: [] } }));
    mount();

    await screen.findByTestId('mcp-tokens-empty');
    expect(screen.queryByTestId('mcp-tokens-failed')).toBeNull();
  });
});

describe('14.98 revoking', () => {
  it('DELETEs that row’s id and reloads the list from the server', async () => {
    // TWO rows, and the SECOND is the one revoked. With one row the assertion
    // below cannot fail: `tokens[0].id` and the clicked row's id are the same
    // string, so a handler that always revoked the first token passed — checked
    // by mutation, and it did.
    const both = [
      { id: ID, createdAt: '2026-09-07T19:51:44.951Z', lastUsedAt: null },
      { id: OTHER, createdAt: '2026-09-06T10:00:00.000Z', lastUsedAt: null },
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
      return { status: 200, body: { tokens: [{ id: ID, createdAt: '2026-09-07T19:51:44.951Z', lastUsedAt: null }] } };
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

describe('14.103 last used', () => {
  it('says “Never used” for a token nothing has touched, and names the day for one that has', async () => {
    fetchStub(() => ({
      status: 200,
      body: {
        tokens: [
          { id: ID, createdAt: '2026-09-07T19:51:44.951Z', lastUsedAt: null },
          { id: OTHER, createdAt: '2026-09-06T10:00:00.000Z', lastUsedAt: '2026-09-07T19:52:00.000Z' },
        ],
      },
    }));
    mount();
    await screen.findByTestId('mcp-tokens-list');

    // Both halves, in one case, because either alone passes for a component
    // that renders one string unconditionally.
    expect(screen.getByText('Never used')).toBeInTheDocument();
    expect(screen.getByText('Last used 8 Sept 2026')).toBeInTheDocument();
  });
});

/**
 * Door D, 2026-09-19 — the row's NAME. Cases `16.10`–`16.14`.
 *
 * **`null` draws NOTHING, and that is the case worth having.** The failure this
 * guards is not a missing name; it is an EMPTY line where a name belongs, which
 * looks like a correct row with a name of zero length and is invisible to any
 * assertion that only checks a named row renders.
 */
describe('D — naming a connection from the row', () => {
  const rowScript =
    (name: string | null) =>
    (): { status: number; body?: unknown } => ({
      status: 200,
      body: { tokens: [{ id: ID, name, createdAt: '2026-09-07T19:51:44.951Z', lastUsedAt: null }] },
    });

  it('16.10 draws the name when there is one, and draws NO name line when there is not', async () => {
    fetchStub(rowScript('Claude Desktop — Anjali'));
    mount();
    await screen.findByTestId('mcp-tokens-list');
    const named = screen.getByTestId('mcp-tokens-list');
    expect(named.querySelector('.gn-mcp-tokens__name')?.textContent).toBe('Claude Desktop — Anjali');
    // The control for the assertion below: this fixture DOES render the element,
    // so an absent one in the next render is the component's answer and not a
    // class that never appears.
    expect(screen.getByRole('button', { name: /^Rename the connection/ })).toBeInTheDocument();
  });

  it('16.11 a connection nobody named draws no name element, and the control says Name', async () => {
    fetchStub(rowScript(null));
    mount();
    await screen.findByTestId('mcp-tokens-list');
    const list = screen.getByTestId('mcp-tokens-list');
    // NO ELEMENT AT ALL — not an empty one. `toBeNull` on the query rather than
    // a text assertion, because an empty span has no text to assert against and
    // would pass every content-shaped check.
    expect(list.querySelector('.gn-mcp-tokens__name')).toBeNull();
    expect(screen.getByRole('button', { name: /^Name the connection/ })).toBeInTheDocument();
  });

  it('16.12 sends the draft AS TYPED, to the token it belongs to, and re-reads the list', async () => {
    fetchStub((call) => {
      if (call.method === 'PUT') return { status: 204 };
      return rowScript(null)();
    });
    mount();
    await screen.findByTestId('mcp-tokens-list');

    await userEvent.click(screen.getByTestId(`mcp-tokens-name-${ID}`));
    // AS TYPED, including the spaces — the server's schema is what refuses a
    // blank, and a component that trimmed would make that refusal unreachable
    // while quietly rewriting the person's words.
    await userEvent.type(screen.getByTestId(`mcp-tokens-name-input-${ID}`), '  CI — ticket sync  ');
    await userEvent.click(screen.getByTestId(`mcp-tokens-name-save-${ID}`));

    await waitFor(() =>
      expect(calls.some((c) => c.method === 'PUT' && c.url === `/v1/me/mcp-tokens/${ID}`)).toBe(true),
    );
    const put = calls.find((c) => c.method === 'PUT');
    // The BODY, parsed — because "a PUT reached the right url" is satisfied by a
    // client that sent the wrong name, or an empty one.
    expect(JSON.parse(String(put?.body))).toEqual({ name: '  CI — ticket sync  ' });
    // The outcome is OBSERVED by re-reading, never by editing this list: a
    // second GET after the PUT is the proof.
    await waitFor(() =>
      expect(calls.filter((c) => c.method === 'GET').length).toBeGreaterThan(1),
    );
  });

  it('16.13 a refusal keeps the editor OPEN and shows the server’s own sentence', async () => {
    fetchStub((call) => {
      if (call.method === 'PUT') {
        return { status: 400, body: { error: 'invalid', message: 'nope' } };
      }
      return rowScript(null)();
    });
    mount();
    await screen.findByTestId('mcp-tokens-list');

    await userEvent.click(screen.getByTestId(`mcp-tokens-name-${ID}`));
    await userEvent.click(screen.getByTestId(`mcp-tokens-name-save-${ID}`));

    // The editor is still on screen, so the draft is not thrown away by a
    // refusal the person can fix — and the input still holds what they typed.
    await waitFor(() =>
      expect(screen.getByTestId(`mcp-tokens-name-input-${ID}`)).toBeInTheDocument(),
    );
    expect(document.body.textContent ?? '').toMatch(/1 to 60 characters/);
  });

  it('16.14 Cancel closes the editor and sends the server NOTHING', async () => {
    fetchStub(rowScript(null));
    mount();
    await screen.findByTestId('mcp-tokens-list');

    await userEvent.click(screen.getByTestId(`mcp-tokens-name-${ID}`));
    await userEvent.type(screen.getByTestId(`mcp-tokens-name-input-${ID}`), 'discarded');
    await userEvent.click(screen.getByTestId(`mcp-tokens-name-cancel-${ID}`));

    // `queryByTestId`, NOT `getByTestId`: the latter THROWS when the element is
    // absent, so `waitFor` would retry on the very condition this asserts and
    // report the passing state as an error. A test whose success is its own
    // failure mode is worse than no test.
    await waitFor(() =>
      expect(screen.queryByTestId(`mcp-tokens-name-input-${ID}`)).toBeNull(),
    );
    // Not merely "the editor closed": a Cancel that had saved the draft would
    // look identical on screen. No write of any method reached the server.
    expect(calls.filter((c) => c.method !== 'GET')).toEqual([]);
  });
});
