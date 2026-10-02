import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Case block 14.230–14.235 — the hosted-MCP consent page `/mcp/connect`
 * (remote-MCP plan Task 4). 14.236 (not frameable) is in `next-config.test.ts`.
 */

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useParams: () => ({}),
  useSearchParams: () => new URLSearchParams('request=req_x'),
}));

type Status = { kind: 'loading' } | { kind: 'signed-out' } | { kind: 'signed-in'; user: { id: string; name: string } };
const session: { status: Status } = { status: { kind: 'signed-in', user: { id: 'u1', name: 'Kiro' } } };
vi.mock('../src/providers.js', () => ({ useSessionStatus: () => session.status }));

import ConnectPage from '../app/mcp/connect/page.js';

type Reply = { status: number; body: unknown };
let calls: Array<{ url: string; method: string; body: unknown }> = [];
const assign = vi.fn();

function stubFetch(details: Reply, decision?: Reply | (() => Promise<Reply>)): void {
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, method: init?.method ?? 'GET', body: init?.body === undefined ? undefined : JSON.parse(String(init.body)) });
    const r = url.endsWith('/decision') ? (typeof decision === 'function' ? await decision() : decision!) : details;
    return new Response(JSON.stringify(r.body), { status: r.status, headers: { 'content-type': 'application/json' } });
  });
}
const LIVE: Reply = { status: 200, body: { requestId: 'req_x', clientName: 'Claude', redirectHost: 'claude.ai' } };
const decisionCalls = () => calls.filter((c) => c.url.endsWith('/decision'));

beforeEach(() => {
  calls = [];
  assign.mockReset();
  session.status = { kind: 'signed-in', user: { id: 'u1', name: 'Kiro' } };
  vi.stubGlobal('location', { ...window.location, assign });
});
afterEach(() => vi.unstubAllGlobals());

describe('the consent page', () => {
  it('14.230 signed out: the sign-in link carries next back here, and there is no Allow', async () => {
    session.status = { kind: 'signed-out' };
    stubFetch({ status: 401, body: {} });
    render(<ConnectPage />);
    const link = await screen.findByRole('link', { name: 'Sign in' });
    expect(link.getAttribute('href')).toBe('/sign-in?next=%2Fmcp%2Fconnect%3Frequest%3Dreq_x');
    expect(screen.queryByRole('button', { name: 'Allow' })).toBeNull();
    expect(calls).toEqual([]); // nothing is asked of the API while signed out
    session.status = { kind: 'signed-in', user: { id: 'u1', name: 'Kiro' } }; // CONTROL
    stubFetch(LIVE);
    render(<ConnectPage />);
    expect(await screen.findByRole('button', { name: 'Allow' })).toBeTruthy();
  });

  it('14.231 the consent copy is verbatim with the app name and the redirect host from the API', async () => {
    stubFetch(LIVE);
    const first = render(<ConnectPage />);
    expect(await screen.findByText(/wants to use Gisik Nokma as/)).toBeTruthy();
    expect(screen.getByText('Claude')).toBeTruthy();
    expect(screen.getByText('(claude.ai)', { exact: false })).toBeTruthy();
    // AMENDED 2026-10-01 (MCP CRUD Task 9 fix 1), and 2026-10-02 (UX T11, 23.191: no spaced em dashes): the copy names the workspace and project powers and the 15-day restore.
    expect(screen.getByText(/It will be able to see and change everything you can: read tickets, create them, move them, comment and assign, and create, rename, archive or delete workspaces and projects \(deleted ones can be restored for 15 days\), in all your workspaces\./)).toBeTruthy();
    expect(screen.getByText(/You can disconnect it any time from Account → Connected assistants\./)).toBeTruthy();
    expect(calls[0]).toMatchObject({ url: '/v1/mcp/oauth/requests/req_x', method: 'GET' });
    first.unmount();
    stubFetch({ status: 200, body: { requestId: 'req_x', clientName: 'ChatGPT', redirectHost: 'chatgpt.com' } }); // CONTROL
    render(<ConnectPage />);
    expect(await screen.findByText('ChatGPT')).toBeTruthy();
    expect(screen.getByText('(chatgpt.com)', { exact: false })).toBeTruthy();
    expect(screen.queryByText('(claude.ai)', { exact: false })).toBeNull();
  });

  it('14.232 Allow posts allow:true, is disabled while in flight, and navigates only after it resolves', async () => {
    let release!: (r: Reply) => void;
    stubFetch(LIVE, () => new Promise<Reply>((resolve) => { release = resolve; }));
    render(<ConnectPage />);
    const allow = (await screen.findByRole('button', { name: 'Allow' })) as HTMLButtonElement;
    fireEvent.click(allow);
    await waitFor(() => expect(decisionCalls()).toHaveLength(1));
    expect(allow.disabled).toBe(true); // CONTROL — no double submit
    expect((screen.getByRole('button', { name: 'Deny' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(allow);
    expect(decisionCalls()).toHaveLength(1);
    expect(assign).not.toHaveBeenCalled(); // CONTROL — nothing navigates before the POST resolves
    release({ status: 200, body: { redirectTo: 'https://claude.ai/cb?code=abc&state=s' } });
    await waitFor(() => expect(assign).toHaveBeenCalledWith('https://claude.ai/cb?code=abc&state=s'));
    expect(decisionCalls()[0]).toMatchObject({ url: '/v1/mcp/oauth/requests/req_x/decision', method: 'POST', body: { allow: true } });
  });

  it('14.233 Deny posts allow:false and navigates to the returned redirect', async () => {
    stubFetch(LIVE, { status: 200, body: { redirectTo: 'https://claude.ai/cb?error=access_denied&state=s' } });
    render(<ConnectPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Deny' }));
    await waitFor(() => expect(assign).toHaveBeenCalledWith('https://claude.ai/cb?error=access_denied&state=s'));
    expect(decisionCalls()).toHaveLength(1);
    expect(decisionCalls()[0]!.body).toEqual({ allow: false }); // CONTROL — Allow was not the call made
  });

  it('14.234 an expired request says so with no buttons; a 409 shows the server message verbatim', async () => {
    stubFetch({ status: 404, body: { error: 'unknown_request' } });
    const expired = render(<ConnectPage />);
    expect(await screen.findByText('This connection request has expired. Go back to your assistant and connect again.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Allow' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Deny' })).toBeNull();
    expired.unmount();

    stubFetch(LIVE, { status: 409, body: { error: 'already_answered', message: 'This request has already been answered. Go back to your assistant and connect again.' } });
    render(<ConnectPage />);
    expect(screen.queryByRole('alert')).toBeNull(); // CONTROL — a live request shows buttons and no refusal yet
    fireEvent.click(await screen.findByRole('button', { name: 'Allow' }));
    expect(await screen.findByText('This request has already been answered. Go back to your assistant and connect again.')).toBeTruthy();
    expect(assign).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Allow' })).toBeNull();
  });

  it('14.235 Allow is the one primary button and Deny is the ghost', async () => {
    stubFetch(LIVE);
    render(<ConnectPage />);
    const allow = await screen.findByRole('button', { name: 'Allow' });
    const deny = screen.getByRole('button', { name: 'Deny' });
    expect(allow.tagName).toBe('BUTTON'); // CONTROL — both real buttons with their accessible names
    expect(deny.tagName).toBe('BUTTON');
    expect(allow.className).toContain('gn-button--primary');
    expect(deny.className).toContain('gn-button--ghost');
    expect(deny.className).not.toContain('gn-button--primary');
    expect(document.querySelectorAll('.gn-button--primary')).toHaveLength(1);
  });
});
