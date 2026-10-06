import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { scheduleReload, type WorkspaceRef } from '@gisik-nokma/app-core';
import type { HomeResponse } from '@gisik-nokma/domain';
import { HttpError } from '@gisik-nokma/app-core/online';
import { Providers, resetLastKnownUser } from '../src/providers.js';
import { EXPIRED_SESSION_COPY, signInWithNext } from '../src/expired-session.js';
import { stubServices } from './helpers/stub-services.js';

/**
 * 27.625–27.628 (Knowledge Graph spec E §2.2, decisions D-E4/D-E8): `/` is Home. Task 3 adds the numbers' read through
 * `HomeScreen` (27.626's 401, 27.628's `getHome` spy, 27.637–27.639's HomeBody arms: its `failed`, its Retry and its
 * press); the tiles themselves are `home-numbers.test.tsx`'s. This file renders `HomeScreen`
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

// Task 4: Home's graph is `home-graph.test.tsx`'s. Here its one door draws nothing, so spec C's view (Sigma, WebGL)
// never loads in jsdom and its own states (a Retry of its own) never join these cases' queries.
vi.mock('../src/home/home-graph-canvas.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/home/home-graph-canvas.js')>()),
  HomeGraphCanvas: () => null,
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
/** Home's numbers (Task 3). Each case below that answers one uses a workspace id of its own: the read cache is module state. */
const HOME: HomeResponse = {
  workspaceId: 'ws_1',
  generatedAt: '2026-10-05T04:30:00.000Z',
  dueSoonDays: 3,
  counts: { tickets: 12, open: 9, pastDue: 3, dueSoon: 2, members: 5, notes: 4 },
  ids: { tickets: ['t_all'], open: ['t_open'], pastDue: ['t_pd'], dueSoon: ['t_ds'], members: ['u_1'], notes: ['n_1'] },
};
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

  // H11 (p11) + Q2 (planner ruling 14:44): the numbers' read is lifted into HomeScreen's expired-session check.
  it('27.626 a 401 from getHome pushes signInWithNext("/") with no numbers refusal beside the notice; control: a 500 does not push and shows the refusal', async () => {
    renderHome({
      getMyWorkspaces: async () => [workspace({ id: 'ws_h11' })],
      getHome: () => Promise.reject(new HttpError(401, '/v1/workspaces/ws_h11/home')),
    });
    await waitFor(() => expect(push).toHaveBeenCalledWith(signInWithNext('/')));
    expect(await screen.findByText(EXPIRED_SESSION_COPY)).toBeInTheDocument();
    expect(screen.queryByText("Couldn't load the numbers.")).not.toBeInTheDocument();

    cleanup();
    push.mockClear();
    renderHome({
      getMyWorkspaces: async () => [workspace({ id: 'ws_h11b' })],
      getHome: () => Promise.reject(new HttpError(500, '/v1/workspaces/ws_h11b/home')),
    });
    expect(await screen.findByText("Couldn't load the numbers.")).toBeInTheDocument();
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
    // Task 3: the numbers' read is asked only for the workspace Home settles on.
    const getHome = vi.fn(async (workspaceId: string): Promise<HomeResponse> => ({ ...HOME, workspaceId }));
    const services = stubServices({ getMyWorkspaces: async () => [ws1, ws2], getHome }, NOTIFICATIONS);
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
    expect(getHome).not.toHaveBeenCalled();

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
    await waitFor(() => expect(getHome).toHaveBeenCalledWith('ws_2'));
    expect(new Set(getHome.mock.calls.map(([id]) => id))).toEqual(new Set(['ws_2']));
  });
});

describe('27.637–27.639 the numbers through HomeScreen (Task 3)', () => {
  // H9a (p11)
  it('27.637 through HomeScreen: a pending getHome is the skeleton, not the failure', async () => {
    renderHome({
      getMyWorkspaces: async () => [workspace({ id: 'ws_h9a' })],
      getHome: () => new Promise<HomeResponse>(() => undefined),
    });
    expect(await screen.findByText('Loading the numbers')).toBeInTheDocument();
    expect(screen.queryByText("Couldn't load the numbers.")).not.toBeInTheDocument();
  });

  // H9b (p11)
  it('27.638 through HomeScreen: a reload that fails after an answer keeps the numbers', async () => {
    let calls = 0;
    renderHome({
      getMyWorkspaces: async () => [workspace({ id: 'ws_h9b' })],
      getHome: async () => {
        calls += 1;
        if (calls === 1) return { ...HOME, workspaceId: 'ws_h9b' };
        throw new Error('boom');
      },
    });
    expect(await screen.findByRole('button', { name: '12 Tickets' })).toBeEnabled();
    act(() => scheduleReload('ws_h9b', 0));
    await waitFor(() => expect(calls).toBe(2));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    }); // let the rejection land
    expect(screen.getByRole('button', { name: '12 Tickets' })).toBeEnabled();
    expect(screen.queryByText("Couldn't load the numbers.")).not.toBeInTheDocument();
  });

  // Planner ruling 2026-10-04 Q2, the HomeBody side of "last known" (AMEND p11 "The Q2 arm": reachable).
  it('27.638 through HomeScreen: a read that fails after a cached answer keeps that answer\'s window on the Due label', async () => {
    renderHome({
      getMyWorkspaces: async () => [workspace({ id: 'ws_q2' })],
      getHome: async () => ({ ...HOME, workspaceId: 'ws_q2', dueSoonDays: 3 }),
    });
    expect(await screen.findByRole('button', { name: '2 Due in 3 days' })).toBeEnabled();

    // Remount: the cached `home:ws_q2` answer is served first (and its window stored), then the read rejects, the
    // stale answer is withdrawn (`data` null) and the load has failed.
    cleanup();
    renderHome({
      getMyWorkspaces: async () => [workspace({ id: 'ws_q2' })],
      getHome: () => Promise.reject(new HttpError(500, '/v1/workspaces/ws_q2/home')),
    });
    expect(await screen.findByText("Couldn't load the numbers.")).toBeInTheDocument();
    const labels = [...document.querySelectorAll('.gn-home__number-label')].map((el) => el.textContent);
    expect(labels[3]).toBe('Due in 3 days');
    expect([...document.querySelectorAll('.gn-home__number-value')].map((el) => el.textContent)).toEqual(['–', '–', '–', '–', '–', '–']);
  });

  // FIX 1 F1 (reviewer B's RB4): `HomeBody` hands the read's own `reload` to Retry. 27.638 in `home-numbers.test.tsx`
  // wires `onRetry` itself, so only this leg reaches `HomeBody`'s prop.
  it('27.638 through HomeScreen: Retry after a failed read asks again and draws the numbers', async () => {
    const user = userEvent.setup();
    let calls = 0;
    renderHome({
      getMyWorkspaces: async () => [workspace({ id: 'ws_f1' })],
      getHome: async () => {
        calls += 1;
        if (calls === 1) throw new HttpError(500, '/v1/workspaces/ws_f1/home');
        return { ...HOME, workspaceId: 'ws_f1' };
      },
    });
    expect(await screen.findByText("Couldn't load the numbers.")).toBeInTheDocument();
    expect(calls).toBe(1); // nothing asks again by itself: the second call below is the click's
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    await waitFor(() => expect(screen.getByRole('button', { name: '12 Tickets' })).toBeEnabled());
    expect(calls).toBe(2);
    expect(screen.queryByText("Couldn't load the numbers.")).not.toBeInTheDocument();
  });

  // FIX 1 F2/F3 (reviewer B's RB5, RB6): `HomeBody` hands the highlight's `toggle` to the tiles and feeds the hook the
  // read's data. 27.639's `Harness` in `home-numbers.test.tsx` wires both itself. Read synchronously after each click:
  // with the hook fed `null`, its clear effect runs inside the click's act, so a wait would hide nothing.
  it('27.639 through HomeScreen: a press lights the tile; control: pressing it again clears', async () => {
    const user = userEvent.setup();
    renderHome({
      getMyWorkspaces: async () => [workspace({ id: 'ws_f2' })],
      getHome: async () => ({ ...HOME, workspaceId: 'ws_f2' }),
    });
    const pastDue = await screen.findByRole('button', { name: '3 Past due' });
    // The six tiles only: `AppNav` draws buttons of its own.
    const pressed = () => [...document.querySelectorAll('button.gn-home__number')].map((b) => b.getAttribute('aria-pressed'));
    expect(pressed()).toEqual(['false', 'false', 'false', 'false', 'false', 'false']);
    await user.click(pastDue);
    expect(pressed()).toEqual(['false', 'false', 'true', 'false', 'false', 'false']);
    await user.click(pastDue);
    expect(pressed()).toEqual(['false', 'false', 'false', 'false', 'false', 'false']);
  });
});
