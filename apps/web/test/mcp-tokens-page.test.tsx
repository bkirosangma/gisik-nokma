import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HELP_CONTENT } from '@gisik-nokma/app-core';
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
  // E5-17 mounted `AppNav` on this route, and `AppNav` reads `usePathname` for
  // the current-page marker. The mock is extended rather than the mount dropped:
  // the page needed a way out, and a mock that omits a hook its own tree uses is
  // a harness gap, not a product constraint.
  usePathname: () => '/mcp/tokens',
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

/**
 * The hosted-door reads Task 8 added to this screen (`/v1/me/mcp-connections`,
 * `/v1/mcp/public-url`). They are answered BEFORE the script and recorded apart
 * from `calls`, so every case written about the tokens door keeps asserting
 * exactly what it did: which requests THAT door made, in what order. A case about
 * the hosted door overrides `hosted`; the default is "no connections, door off".
 */
type Answer = { status: number; body?: unknown };
const HOSTED_DEFAULTS: Record<string, Answer> = {
  '/v1/me/mcp-connections': { status: 200, body: { connections: [] } },
  '/v1/mcp/public-url': { status: 200, body: { url: null } },
};
let hosted: Record<string, Answer | ((call: Call) => Answer | Promise<Answer>)> = { ...HOSTED_DEFAULTS };
let hostedCalls: Call[] = [];

/** A `fetch` that answers from a script, recording every call it was asked to make. */
function fetchStub(script: (call: Call, n: number) => { status: number; body?: unknown } | Promise<{ status: number; body?: unknown }>): void {
  let n = 0;
  globalThis.fetch = (async (input: string, init?: RequestInit) => {
    // The REQUEST body is recorded, not just the method and url: a case about a
    // write that only asserted "a PUT happened" would pass on a client that sent
    // the wrong name, or none. It stays the raw string the transport was handed.
    const call = { url: String(input), method: init?.method ?? 'GET', body: init?.body };
    const isHosted = call.url.startsWith('/v1/me/mcp-connections') || call.url === '/v1/mcp/public-url';
    if (isHosted) hostedCalls.push(call);
    else calls.push(call);
    const hostedAnswer = isHosted ? hosted[call.url.split('?')[0]!] ?? hosted['/v1/me/mcp-connections'] : undefined;
    const answer = isHosted
      ? typeof hostedAnswer === 'function' ? await hostedAnswer(call) : hostedAnswer!
      : await script(call, n);
    if (isHosted) return { ok: answer.status >= 200 && answer.status < 300, status: answer.status, json: async () => answer.body } as Response;
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
  // 23.193: the year is dropped when it is the current one, so the clock is named rather than read.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-02T06:00:00.000Z'));
  calls = [];
  hostedCalls = [];
  hosted = { ...HOSTED_DEFAULTS };
  session = { isPending: false, data: { user: { id: '01J9USER000000000000000000', name: 'Kiro' } } };
});

afterEach(() => {
  vi.useRealTimers();
});

describe('E5-17 the route is not a chrome-less orphan', () => {
  it('mounts the app nav, so a person sent back here has a way out', async () => {
    session = { isPending: false };
    fetchStub(() => ({ status: 200, body: { tokens: [] } }));
    mount();
    // Nothing in `apps/web/app` or `apps/web/src` links to `/mcp/tokens`, and
    // `mcp-tokens-screen.tsx`'s `returnTo` sends a signed-out person BACK here
    // after sign-in — so before this mount the only route a reader could reach by
    // typing was also the only one with no bar on it.
    expect(document.querySelector('nav.gn-nav')).not.toBeNull();
    // E5-31 (B11): signed out, the bar no longer offers `Workspaces` (a link that
    // could only 401-bounce); the way out it offers is its own `Sign in`, which
    // carries `next=` back here. Two `Sign in` links are on this page — the
    // bar's and the screen's — so the assertion names the bar's by class.
    expect(document.querySelector('nav.gn-nav a.gn-nav__signin')).toHaveTextContent('Sign in');
  });
});

describe('14.96 signed out', () => {
  it('offers a sign-in that lands back here, and asks the server nothing', async () => {
    session = { isPending: false };
    fetchStub(() => ({ status: 200, body: { tokens: [] } }));
    mount();

    // E5-31 (B11) added the bar's own `Sign in` beside the screen's; both carry
    // `next=` back here, and this case is about the SCREEN's — every `Sign in`
    // link on the page must land back here.
    const links = screen.getAllByRole('link', { name: 'Sign in' });
    expect(links).toHaveLength(2);
    for (const link of links) {
      expect(link).toHaveAttribute('href', `/sign-in?next=${encodeURIComponent('/mcp/tokens')}`);
    }
    // Not merely "no list rendered": a signed-out page that still fired the
    // request would 401 and look identical on screen.
    await waitFor(() => expect(calls).toEqual([]));
  });
});

describe('14.97 the list shows what is honestly available', () => {
  it('names the approval date and NEVER anything resembling the credential', async () => {
    fetchStub(() => ({
      status: 200,
      body: { tokens: [{ id: ID, createdAt: '2026-09-07T19:51:44.951Z', lastUsedAt: null }] },
    }));
    mount();

    await screen.findByTestId('mcp-tokens-list');
    // This instant is 19:51Z on the 7th: the 7th in UTC, the 8th in IST. The day is rendered by `formatDay`
    // (23.193), which reads the IST day and drops the year when it is the current one, so "8 Sep" is the
    // falsifiable answer: a renderer in UTC would print "7 Sep", and one that kept the year "8 Sep 2026".
    expect(screen.getByText(/Created 8 Sep\./)).toBeInTheDocument();
    // `mcp_tokens` stores only sha256(token). A row that printed the id would
    // be showing a hash while implying it had the credential.
    expect(document.body.textContent ?? '').not.toContain(ID);
    expect(screen.getByRole('button', { name: 'Revoke this token' })).toBeInTheDocument();
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
   * exactly the value the empty arm asserts over ("No assistants connected yet.
   * One appears here after you approve it on the connect page."). So a 500 was
   * drawn as a confident statement about the person's account, on the one screen
   * whose whole subject is which assistants still hold access — and the sentence
   * it printed sent them to a connect page to approve a second one.
   *
   * Asserted on the pair, and the absence is the half that matters: the failure
   * sentence is present AND the empty state is not. Asserting only the sentence
   * would pass on a screen that rendered both.
   */
  it('14.150 a rejected read is a failure sentence, never “No assistants connected yet”', async () => {
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
    expect(screen.getByText('Created 8 Sep. Never used.')).toBeInTheDocument();
    expect(screen.getByText('Created 6 Sep. Last used 8 Sep.')).toBeInTheDocument();
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

  it('16.11 a connection nobody named draws no name element, and the control says Add a name', async () => {
    fetchStub(rowScript(null));
    mount();
    await screen.findByTestId('mcp-tokens-list');
    const list = screen.getByTestId('mcp-tokens-list');
    // NO ELEMENT AT ALL — not an empty one. `toBeNull` on the query rather than
    // a text assertion, because an empty span has no text to assert against and
    // would pass every content-shaped check.
    expect(list.querySelector('.gn-mcp-tokens__name')).toBeNull();
    expect(screen.getByRole('button', { name: /^Add a name to the connection/ })).toBeInTheDocument();
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

/**
 * Case block 14.274–14.277 — the hosted MCP door's half of this screen (remote-MCP
 * plan Task 8): the assistant APPS a person connected by URL, Disconnect, and the
 * Connect panel. The tokens door's own cases above are untouched.
 */
const CONN = { id: 'conn_1', clientName: 'Claude', redirectHost: 'claude.ai', createdAt: '2026-09-30T00:00:00Z', lastUsedAt: '2026-09-30T10:00:00Z' };
const LOCAL = { id: ID, name: 'laptop', createdAt: '2026-09-01T00:00:00Z', lastUsedAt: null };
const tokensOnly = (tokens: unknown[]) => (call: Call) =>
  call.method === 'GET' ? { status: 200, body: { tokens } } : { status: 204 };

describe('14.274 hosted connections beside the local tokens', () => {
  it('shows app · host, Connected, Last used and Disconnect; local rows keep Revoke', async () => {
    hosted['/v1/me/mcp-connections'] = { status: 200, body: { connections: [CONN, { ...CONN, id: 'conn_2', clientName: 'ChatGPT', redirectHost: 'chatgpt.com', lastUsedAt: null }] } };
    fetchStub(tokensOnly([LOCAL]));
    mount();
    expect(await screen.findByText('Claude (claude.ai)')).toBeInTheDocument();
    expect(screen.getByText('ChatGPT (chatgpt.com)')).toBeInTheDocument();
    const list = screen.getByTestId('mcp-connections-list');
    expect(list).toHaveTextContent(/Connected 30 Sep/);
    expect(list).toHaveTextContent(/Last used 30 Sep/);
    expect(list).toHaveTextContent('Never used');
    const disconnect = screen.getByTestId('mcp-connections-disconnect-conn_1');
    expect(disconnect).toHaveTextContent('Disconnect Claude'); // the visible label, not only the accessible name
    expect(screen.getByRole('button', { name: 'Disconnect Claude (claude.ai)' })).toBeInTheDocument();
    expect(screen.getByTestId(`mcp-tokens-revoke-${ID}`)).toHaveTextContent('Revoke this token'); // CONTROL — the local row is unchanged
    expect(screen.queryByTestId('mcp-tokens-empty')).toBeNull();
  });

  it('control: a person with neither sees the existing empty state', async () => {
    fetchStub(tokensOnly([]));
    mount();
    expect(await screen.findByTestId('mcp-tokens-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('mcp-connections-list')).toBeNull();
  });
});

describe('14.274 zero local tokens, live hosted connections', () => {
  it('does NOT say "No assistants connected yet" while an app is connected; both lists empty does', async () => {
    hosted['/v1/me/mcp-connections'] = { status: 200, body: { connections: [CONN] } };
    fetchStub(tokensOnly([]));
    mount();
    expect(await screen.findByText('Claude (claude.ai)')).toBeInTheDocument(); // both reads have landed
    await waitFor(() => expect(calls.some((c) => c.method === 'GET')).toBe(true));
    expect(screen.queryByTestId('mcp-tokens-empty')).toBeNull();
    expect(screen.queryByText(/No assistants connected yet/)).toBeNull();
    // CONTROL, same `it`: the same screen with BOTH lists empty says it.
    cleanup();
    hosted['/v1/me/mcp-connections'] = { status: 200, body: { connections: [] } };
    fetchStub(tokensOnly([]));
    mount();
    expect(await screen.findByTestId('mcp-tokens-empty')).toHaveTextContent('No assistants connected yet.');
  });
});

describe('14.275 Disconnect', () => {
  it('keeps the row while the DELETE is in flight and drops it after it resolves', async () => {
    let release!: (a: Answer) => void;
    hosted['/v1/me/mcp-connections'] = { status: 200, body: { connections: [CONN] } };
    hosted['/v1/me/mcp-connections/conn_1'] = () => new Promise<Answer>((resolve) => { release = resolve; });
    fetchStub(tokensOnly([]));
    mount();
    const button = await screen.findByTestId('mcp-connections-disconnect-conn_1');
    await userEvent.setup().click(button);
    await waitFor(() => expect(hostedCalls.some((c) => c.method === 'DELETE' && c.url === '/v1/me/mcp-connections/conn_1')).toBe(true));
    expect(screen.getByText('Claude (claude.ai)')).toBeInTheDocument(); // CONTROL — still there mid-request
    expect(screen.getByTestId('mcp-connections-disconnect-conn_1')).toHaveTextContent('Disconnecting…');
    release({ status: 204 });
    await waitFor(() => expect(screen.queryByText('Claude (claude.ai)')).toBeNull());
  });

  it('shows the server\'s reason when the DELETE fails, and keeps the row', async () => {
    hosted['/v1/me/mcp-connections'] = { status: 200, body: { connections: [CONN] } };
    hosted['/v1/me/mcp-connections/conn_1'] = { status: 500, body: { error: 'boom', message: 'The server could not disconnect that right now.' } };
    fetchStub(tokensOnly([]));
    mount();
    await userEvent.setup().click(await screen.findByTestId('mcp-connections-disconnect-conn_1'));
    expect(await screen.findByTestId('mcp-tokens-refused')).toHaveTextContent('The server could not disconnect that right now.');
    expect(screen.getByText('Claude (claude.ai)')).toBeInTheDocument();
  });
});

describe('14.276 the Connect an assistant panel', () => {
  it('shows the server\'s URL with a Copy that writes it to the clipboard, and a How to connect link', async () => {
    hosted['/v1/mcp/public-url'] = { status: 200, body: { url: 'https://pm-api.artsourced.in/mcp' } };
    fetchStub(tokensOnly([]));
    mount();
    expect(await screen.findByTestId('mcp-public-url')).toHaveTextContent('https://pm-api.artsourced.in/mcp');
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
    await user.click(screen.getByTestId('mcp-public-url-copy'));
    expect(writeText).toHaveBeenCalledWith('https://pm-api.artsourced.in/mcp');
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument();
    // The href is DERIVED from the generated manual, the way the Help browser builds a section's
    // DOM id (`${document.id}-${section.id}`), so the link and the section cannot drift apart (14.282).
    const manual = HELP_CONTENT.find((doc) => doc.id === 'manual');
    const section = manual?.sections.find((s) => s.title.startsWith('Connecting Claude or ChatGPT') || s.id === '16-connecting-claude-or-chatgpt');
    expect(section?.id).toBe('16-connecting-claude-or-chatgpt');
    expect(screen.getByRole('link', { name: 'How to connect' }).getAttribute('href')).toBe(`/help#manual-${section?.id}`);
    expect(`/help#manual-${section?.id}`).toBe('/help#manual-16-connecting-claude-or-chatgpt'); // the literal, pinned once
    expect(screen.getByRole('heading', { name: 'Connect an assistant' })).toBeInTheDocument();
  });

  it('control: with the door off the panel is absent', async () => {
    fetchStub(tokensOnly([]));
    mount();
    await screen.findByTestId('mcp-tokens-empty');
    await waitFor(() => expect(hostedCalls.some((c) => c.url === '/v1/mcp/public-url')).toBe(true));
    expect(screen.queryByTestId('mcp-public-url')).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Connect an assistant' })).toBeNull();
  });
});

describe('14.277 the two lists are read independently', () => {
  it('a failed connections read still shows the tokens, with its own sentence', async () => {
    hosted['/v1/me/mcp-connections'] = { status: 500, body: {} };
    fetchStub(tokensOnly([LOCAL]));
    mount();
    expect(await screen.findByTestId('mcp-connections-failed')).toHaveTextContent('could not be loaded');
    expect(screen.getByTestId('mcp-tokens-list')).toBeInTheDocument();
    expect(screen.queryByTestId('mcp-tokens-failed')).toBeNull();
    expect(screen.queryByTestId('mcp-tokens-empty')).toBeNull(); // unknown is not empty
  });

  it('a failed tokens read still shows the connections, with its own sentence', async () => {
    hosted['/v1/me/mcp-connections'] = { status: 200, body: { connections: [CONN] } };
    fetchStub((call) => (call.method === 'GET' ? { status: 500, body: {} } : { status: 204 }));
    mount();
    expect(await screen.findByTestId('mcp-tokens-failed')).toBeInTheDocument();
    expect(await screen.findByText('Claude (claude.ai)')).toBeInTheDocument();
    expect(screen.queryByTestId('mcp-connections-failed')).toBeNull();
  });

  it.each([
    ['the connections failure arrives AFTER the tokens', 'tokens-first'],
    ['the connections failure arrives BEFORE the tokens', 'connections-first'],
  ] as const)('%s — the token list renders either way', async (_label, order) => {
    const gate = () => {
      let open!: () => void;
      const opened = new Promise<void>((resolve) => { open = resolve; });
      return { opened, open };
    };
    const tokensGate = gate();
    const connectionsGate = gate();
    hosted['/v1/me/mcp-connections'] = async () => { await connectionsGate.opened; return { status: 500, body: {} }; };
    fetchStub(async (call) => {
      if (call.method !== 'GET') return { status: 204 };
      await tokensGate.opened;
      return { status: 200, body: { tokens: [LOCAL] } };
    });
    mount();
    if (order === 'tokens-first') {
      tokensGate.open();
      expect(await screen.findByTestId('mcp-tokens-list')).toBeInTheDocument();
      connectionsGate.open();
    } else {
      connectionsGate.open();
      expect(await screen.findByTestId('mcp-connections-failed')).toBeInTheDocument();
      tokensGate.open();
    }
    expect(await screen.findByTestId('mcp-connections-failed')).toBeInTheDocument();
    expect(await screen.findByTestId('mcp-tokens-list')).toBeInTheDocument();
    expect(screen.queryByTestId('mcp-tokens-failed')).toBeNull();
    expect(screen.getByTestId(`mcp-tokens-revoke-${ID}`)).toBeInTheDocument();
  });

  it('control: both succeed, both lists render', async () => {
    hosted['/v1/me/mcp-connections'] = { status: 200, body: { connections: [CONN] } };
    fetchStub(tokensOnly([LOCAL]));
    mount();
    expect(await screen.findByText('Claude (claude.ai)')).toBeInTheDocument();
    expect(screen.getByTestId('mcp-tokens-list')).toBeInTheDocument();
    expect(screen.queryByTestId('mcp-connections-failed')).toBeNull();
  });
});


/**
 * UX fixes T10 (FD1 / audit SET-02) — a row says what it IS in words, and never offers a button whose
 * visible text is the bare noun "Name".
 */
describe('23.170 a connected-assistant row speaks plainly', () => {
  it('23.170 a token row reads "Assistant connected with a token", Created · last used, and "Revoke this token"; a hosted row reads "<app> (<host>)" with "Disconnect <app>"; no button reads "Name"', async () => {
    hosted['/v1/me/mcp-connections'] = { status: 200, body: { connections: [CONN] } };
    fetchStub(
      tokensOnly([
        { id: ID, name: null, createdAt: '2026-09-07T19:51:44.951Z', lastUsedAt: null },
        { id: OTHER, name: 'Claude Desktop — Anjali', createdAt: '2026-09-06T10:00:00.000Z', lastUsedAt: '2026-09-07T19:52:00.000Z' },
      ]),
    );
    mount();
    await screen.findByTestId('mcp-connections-list');
    const tokens = screen.getByTestId('mcp-tokens-list');
    const unnamed = tokens.querySelectorAll('li')[0]!;
    expect(unnamed).toHaveTextContent('Assistant connected with a token');
    expect(unnamed).toHaveTextContent('Created 8 Sep. Never used.');
    expect(screen.getAllByRole('button', { name: 'Revoke this token' })).toHaveLength(2);
    const named = tokens.querySelectorAll('li')[1]!;
    expect(named).toHaveTextContent('Created 6 Sep. Last used 8 Sep.');

    const hostedRow = screen.getByTestId('mcp-connections-list');
    expect(hostedRow).toHaveTextContent('Claude (claude.ai)');
    expect(screen.getByTestId('mcp-connections-disconnect-conn_1')).toHaveTextContent('Disconnect Claude');

    // NO ROW'S VISIBLE BUTTON TEXT IS "Name" — the unnamed token's control says what it does.
    const visible = [...document.querySelectorAll('.gn-mcp-tokens__row button')].map((b) => (b.textContent ?? '').trim());
    expect(visible).not.toContain('Name');
    expect(visible).toContain('Add a name');

    // CONTROL — the named row's own control and the generic line's absence: a NAMED token keeps its name
    // line and does not also claim to be an anonymous one.
    expect(visible).toContain('Rename');
    expect(named).toHaveTextContent('Claude Desktop — Anjali');
    expect(named).not.toHaveTextContent('Assistant connected with a token');
  });
});
