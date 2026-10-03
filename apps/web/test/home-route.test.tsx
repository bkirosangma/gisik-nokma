import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceRef } from '@gisik-nokma/app-core';
import { HttpError } from '@gisik-nokma/app-core/online';
import { Providers, resetLastKnownUser } from '../src/providers.js';
import { EXPIRED_SESSION_COPY, signInWithNext } from '../src/expired-session.js';
import { stubServices } from './helpers/stub-services.js';

/**
 * 27.625–27.628 (Knowledge Graph spec E §2.2, decisions D-E4/D-E8): `/` is Home. This file renders `HomeScreen`
 * with the REAL `Providers` and a stub `DataSource` (the seam `page-refusals.test.tsx` uses), the nav's `auth-client`
 * mock made mutable so the ordering case can land the session AFTER the workspaces have answered.
 */
const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useParams: () => ({}),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

let mockSessionUser: { id: string; name: string; email?: string } | null = null;
let mockPending = false;
vi.mock('../src/auth-client.js', () => ({
  authClient: {
    useSession: () => ({
      data: mockSessionUser === null ? null : { user: mockSessionUser },
      isPending: mockPending,
    }),
    signOut: async () => ({ data: {}, error: null }),
  },
}));

import { HomeScreen } from '../src/home/home-screen.js';
import { resolveHomeWorkspace } from '../src/home/resolve-home-workspace.js';
import { LAST_WORKSPACE_KEY, clearLastWorkspaceCache } from '../src/use-last-workspace.js';
import { clearWorkspaceNameCache } from '../src/use-workspace-name.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const PAGE_SOURCE = readFileSync(resolve(HERE, '../app/page.tsx'), 'utf8');

function workspace(over: Partial<WorkspaceRef> & { id: string }): WorkspaceRef {
  return {
    name: 'Convenience Corner',
    prefix: 'CC',
    role: 'owner',
    archived: false,
    memberCount: 3,
    nameRestrictedProjectCount: 0,
    projects: [],
    ...over,
  };
}

const NOTIFICATIONS = { notifications: { unreadCount: async () => 0 } };
const KIRO = { id: 'u_kiro', name: 'Kiro', email: 'kiro@example.com' };

function remember(workspaceId: string): void {
  window.localStorage.setItem(LAST_WORKSPACE_KEY, JSON.stringify({ userId: 'u_kiro', workspaceId }));
}

function renderHome(query: Parameters<typeof stubServices>[0]) {
  return render(
    <Providers services={stubServices(query, NOTIFICATIONS)}>
      <HomeScreen />
    </Providers>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  clearLastWorkspaceCache();
  clearWorkspaceNameCache();
  resetLastKnownUser();
  mockSessionUser = KIRO;
  mockPending = false;
  push.mockClear();
});
afterEach(() => cleanup());

describe('27.625 / is Home: a titled server page that does not redirect, with one h1', () => {
  it('page.tsx declares metadata from documentTitleFor("Home") and never redirects; HomeScreen holds one h1 (the workspace name), "Home" while the read is pending', async () => {
    expect(PAGE_SOURCE).toMatch(/export\s+const\s+metadata\s*=\s*\{\s*title:\s*documentTitleFor\('Home'\)\s*\}/);
    expect(PAGE_SOURCE).not.toMatch(/redirect\(/);

    renderHome({ getMyWorkspaces: async () => [workspace({ id: 'ws_1', name: 'Kalita Tea' })] });
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Kalita Tea'));
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);

    // control, same it: with the workspaces read pending forever the one h1 reads Home
    cleanup();
    renderHome({ getMyWorkspaces: () => new Promise<WorkspaceRef[]>(() => undefined) });
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Home');
  });
});

describe('27.626 signed out: Home sends the viewer to sign in and brings them back to /', () => {
  it('a 401 pushes signInWithNext("/") and shows the expired-session notice; control: a 500 does not push and shows the refusal with Retry', async () => {
    renderHome({ getMyWorkspaces: () => Promise.reject(new HttpError(401, '/v1/me/workspaces')) });
    await waitFor(() => expect(push).toHaveBeenCalledWith(signInWithNext('/')));
    expect(await screen.findByText(EXPIRED_SESSION_COPY)).toBeInTheDocument();
    expect(screen.queryByText("Couldn't load your workspaces.")).not.toBeInTheDocument();

    cleanup();
    push.mockClear();
    renderHome({ getMyWorkspaces: () => Promise.reject(new HttpError(500, '/v1/me/workspaces')) });
    expect(await screen.findByText("Couldn't load your workspaces.")).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
    expect(screen.queryByText(EXPIRED_SESSION_COPY)).not.toBeInTheDocument();
  });
});

describe('27.627 no workspace: the empty state names the way out', () => {
  it('[] shows "You are not in a workspace yet." and a link to /workspaces; control: with one workspace that link is absent', async () => {
    renderHome({ getMyWorkspaces: async () => [] });
    expect(await screen.findByText('You are not in a workspace yet.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Create or join a workspace' })).toHaveAttribute('href', '/workspaces');

    cleanup();
    renderHome({ getMyWorkspaces: async () => [workspace({ id: 'ws_1', name: 'Kalita Tea' })] });
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Kalita Tea'));
    expect(screen.queryByRole('link', { name: 'Create or join a workspace' })).not.toBeInTheDocument();
    expect(screen.queryByText('You are not in a workspace yet.')).not.toBeInTheDocument();
  });
});

describe('27.628 which workspace Home shows (D-E4)', () => {
  const ws1 = workspace({ id: 'ws_1', name: 'First Workspace' });
  const ws2 = workspace({ id: 'ws_2', name: 'Second Workspace' });

  it('resolveHomeWorkspace: the remembered live one, else the first live one, else none, loading until known', () => {
    const remembered = (workspaceId: string) => ({ status: 'remembered' as const, workspaceId });
    expect(resolveHomeWorkspace(remembered('ws_2'), [ws1, ws2])).toEqual({ status: 'ready', workspace: ws2 });
    // remembered ws_9 is gone from the directory: never trusted
    expect(resolveHomeWorkspace(remembered('ws_9'), [ws1, ws2])).toEqual({ status: 'ready', workspace: ws1 });
    // remembered ws_2 is archived: falls through to the first LIVE one
    expect(resolveHomeWorkspace(remembered('ws_2'), [ws1, { ...ws2, archived: true }])).toEqual({
      status: 'ready',
      workspace: ws1,
    });
    expect(resolveHomeWorkspace({ status: 'none' }, [ws1, ws2])).toEqual({ status: 'ready', workspace: ws1 });
    expect(resolveHomeWorkspace(remembered('ws_2'), [{ ...ws1, archived: true }, { ...ws2, archived: true }])).toEqual({
      status: 'none',
    });
    expect(resolveHomeWorkspace({ status: 'unknown' }, [ws1, ws2])).toEqual({ status: 'loading' });
    expect(resolveHomeWorkspace(remembered('ws_2'), null)).toEqual({ status: 'loading' });
  });

  it('rendered: a remembered workspace the directory no longer holds shows the first live one; control: a live remembered one shows its own name', async () => {
    remember('ws_9');
    renderHome({ getMyWorkspaces: async () => [ws1, ws2] });
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('First Workspace'));

    cleanup();
    clearLastWorkspaceCache();
    clearWorkspaceNameCache();
    remember('ws_2');
    renderHome({ getMyWorkspaces: async () => [ws1, ws2] });
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Second Workspace'));
  });

  it('ordering: while the session has not landed Home never shows the first workspace, not even for a frame', async () => {
    remember('ws_2');
    mockSessionUser = null;
    mockPending = true;
    const services = stubServices({ getMyWorkspaces: async () => [ws1, ws2] }, NOTIFICATIONS);
    // A FRESH element per render: re-rendering the same element object would let React bail out, and the mocked
    // session (an external store here) would never be read again.
    const tree = () => (
      <Providers services={services}>
        <HomeScreen />
      </Providers>
    );
    const { rerender } = render(tree());
    const h1 = screen.getByRole('heading', { level: 1 });
    // Not seeded with the first text: only the observer may put "Home" here, so the control below is not vacuous.
    const seen = new Set<string>();
    // Record every text the h1 HELD, not its text when the callback runs: `rerender` commits a one-render flash
    // AND its correction inside one sync `act`, so a live `textContent` read would see only the correction.
    // Task 3's "getHome is never called with ws_1" is a CALL SPY on `getHome`, not this observer: a request leaves no DOM trace.
    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (record.oldValue !== null) seen.add(record.oldValue);
        record.removedNodes.forEach((node) => seen.add(node.textContent ?? ''));
      }
      seen.add(h1.textContent ?? '');
    });
    observer.observe(h1, { childList: true, characterData: true, characterDataOldValue: true, subtree: true });

    // The workspaces answered, the session is still pending: Home waits.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(h1.textContent).toBe('Home');

    // The session lands.
    mockSessionUser = KIRO;
    mockPending = false;
    rerender(tree());
    await waitFor(() => expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Second Workspace'));
    seen.add(screen.getByRole('heading', { level: 1 }).textContent ?? '');
    observer.disconnect();
    // Control: the observer DID record a change, "Home" being the text the h1 held before ws_2's name.
    expect([...seen]).toContain('Home');
    expect([...seen]).not.toContain('First Workspace');
  });
});
