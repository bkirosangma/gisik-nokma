import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Case block 14.108–14.111 — the DENIAL control on `/mcp/authorize`, added
 * 2026-09-19 with the sibling route `POST /v1/mcp/device/deny`.
 *
 * **The accessible names are asserted BY STRING here, and that is not
 * decoration.** `e2e-viewport`'s sweep counts `aria-label` ATTRIBUTES, so it
 * cannot tell one name from another — a rename keeps its count at 1 while the
 * announced name changes underneath. This screen is also not in either
 * accessible-names baseline (measured: neither `accessible-names-baseline.json`
 * carries a `/mcp/authorize` key), so nothing else is watching these strings.
 */

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams(),
}));

/**
 * `useSessionStatus` reads `authClient.useSession()`, so the signed-in state is
 * a mock of that module rather than of the hook — the hook's own three-state
 * collapse is a different thing, tested where it lives.
 */
vi.mock('../src/auth-client.js', () => ({
  authClient: {
    useSession: () => ({ data: { user: { id: 'u_kiro', name: 'Kiro' } } }),
    signOut: async () => ({ data: {}, error: null }),
  },
}));

import McpAuthorizePage from '../app/mcp/authorize/page.js';

/** Every request the page made, so a case can assert WHICH door was used. */
let calls: Array<{ url: string; method: string; body: unknown }> = [];
let status = 200;
let payload: unknown = { denied: true };

beforeEach(() => {
  calls = [];
  status = 200;
  payload = { denied: true };
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({
      url: String(input),
      method: init?.method ?? 'GET',
      body: init?.body === undefined ? undefined : JSON.parse(String(init.body)),
    });
    return new Response(JSON.stringify(payload), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function typeCode(code = 'ABCD-EFGH'): Promise<void> {
  await userEvent.type(screen.getByLabelText('Code from your assistant'), code);
}

describe('14.108–14.111 — the DENIAL control on /mcp/authorize', () => {
  it('14.108 offers Deny BESIDE Approve, and Deny posts to the DENIAL door', async () => {
    render(<McpAuthorizePage />);

    // Both controls exist, by their announced names — the strings a screen
    // reader says, asserted literally because the viewport sweep cannot.
    const approve = screen.getByRole('button', { name: 'Approve this assistant' });
    const deny = screen.getByRole('button', { name: 'Deny' });
    expect(approve).toBeTruthy();
    expect(deny).toBeTruthy();

    await typeCode();
    await userEvent.click(deny);

    // The assertion that matters: the refusal goes to its OWN sibling route.
    // A `deny: true` flag posted to approve would pass a weaker test that only
    // checked "something was sent", and would be exactly the one-route-two-
    // questions shape this repo refuses by name.
    await waitFor(() => {
      expect(calls.length).toBe(1);
    });
    expect(calls[0]?.url).toBe('/v1/mcp/device/deny');
    expect(calls[0]?.method).toBe('POST');
    expect(calls[0]?.body).toEqual({ userCode: 'ABCD-EFGH' });

    // And the screen says what happened, rather than silently returning.
    const denied = await screen.findByTestId('mcp-authorize-denied');
    expect(denied).toHaveTextContent('Denied. The assistant was not connected.');
    expect(screen.queryByTestId('mcp-authorize-approved')).toBeNull();
  });

  it('14.109 Approve still posts to APPROVE — the sibling did not replace it', async () => {
    render(<McpAuthorizePage />);
    await typeCode();
    await userEvent.click(screen.getByRole('button', { name: 'Approve this assistant' }));

    await waitFor(() => {
      expect(calls.length).toBe(1);
    });
    expect(calls[0]?.url).toBe('/v1/mcp/device/approve');
    // The positive control for 14.108: the two doors really are two.
    expect(await screen.findByTestId('mcp-authorize-approved')).toBeTruthy();
  });

  it('14.110 both controls are disabled until a code is present', async () => {
    render(<McpAuthorizePage />);
    const approve = screen.getByRole('button', { name: 'Approve this assistant' });
    const deny = screen.getByRole('button', { name: 'Deny' });
    expect(approve).toBeDisabled();
    expect(deny).toBeDisabled();

    await typeCode();
    expect(approve).toBeEnabled();
    expect(deny).toBeEnabled();
  });

  it('14.111 a refusal on DENY is rendered as a sentence, and the form comes back', async () => {
    status = 404;
    payload = { error: 'unknown_code' };
    render(<McpAuthorizePage />);
    await typeCode();
    await userEvent.click(screen.getByRole('button', { name: 'Deny' }));

    const refusal = await screen.findByTestId('mcp-authorize-refused');
    // The 404 arm on the DENY path has to name both possibilities, because a
    // code that was already spent and a code that never existed answer the
    // same body on purpose.
    expect(refusal).toHaveTextContent('not recognised');
    expect(refusal).toHaveTextContent('already been used');
    // Back to the form rather than stuck in a sending state.
    expect(screen.getByRole('button', { name: 'Deny' })).toBeEnabled();
  });
});
