import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkspaceRef } from '@gisik-nokma/app-core';
import { Providers, resetLastKnownUser } from '../src/providers.js';
import { stubServices } from './helpers/stub-services.js';

/**
 * 27.675–27.679 (release walk should-fix #1, `PTR-kg-home-remember-fallback.md`): the workspace Home FALLS BACK to
 * becomes the current one. Spec E says Home shows "the current one (the switcher's)"; on a first visit Home titled the
 * first live workspace while the nav in the same frame said "No workspace selected". Rendered with the REAL `Providers`,
 * `HomeScreen` and its `AppNav` (the seam `home-route.test.tsx` uses), so the nav leg reads the bar a viewer sees.
 */
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useParams: () => ({}),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

const KIRO = { id: 'u_kiro', name: 'Kiro', email: 'kiro@example.com' };
vi.mock('../src/auth-client.js', () => ({
  authClient: {
    useSession: () => ({ data: { user: KIRO }, isPending: false }),
    signOut: async () => ({ data: {}, error: null }),
  },
}));

// The setter, spied THROUGH the module so the once leg counts Home's calls (the route arm is never reached on `/`).
const recorded = vi.hoisted(() => ({ calls: [] as [string, string][] }));
vi.mock('../src/use-last-workspace.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../src/use-last-workspace.js')>();
  return {
    ...real,
    rememberLastWorkspace: (userId: string, workspaceId: string) => {
      recorded.calls.push([userId, workspaceId]);
      real.rememberLastWorkspace(userId, workspaceId);
    },
  };
});

import { HomeScreen } from '../src/home/home-screen.js';
import { LAST_WORKSPACE_KEY, clearLastWorkspaceCache, rememberLastWorkspace, useLastWorkspace, type LastWorkspace } from '../src/use-last-workspace.js';
import { clearWorkspaceNameCache } from '../src/use-workspace-name.js';

const NO_WORKSPACE = 'No workspace selected. Pick one to reach its board, members and settings.';
const NOTIFICATIONS = { notifications: { unreadCount: async () => 0 } };

function workspace(over: Partial<WorkspaceRef> & { id: string; name: string }): WorkspaceRef {
  return { prefix: 'CC', role: 'owner', archived: false, memberCount: 3, nameRestrictedProjectCount: 0, projects: [], ...over };
}
const FIRST = workspace({ id: 'ws_first', name: 'Kalita Tea' });
const SECOND = workspace({ id: 'ws_second', name: 'Dakmanda Looms' });

function stored(): unknown {
  const raw = window.localStorage.getItem(LAST_WORKSPACE_KEY);
  return raw === null ? null : JSON.parse(raw);
}
function remember(workspaceId: string): void {
  window.localStorage.setItem(LAST_WORKSPACE_KEY, JSON.stringify({ userId: KIRO.id, workspaceId }));
}
function renderHome(workspaces: () => Promise<WorkspaceRef[]>) {
  return render(
    <Providers services={stubServices({ getMyWorkspaces: workspaces, getHome: () => new Promise(() => undefined) }, NOTIFICATIONS)}>
      <HomeScreen />
    </Providers>,
  );
}
/** The nav's workspace link (`.gn-nav__workspace`), the name the bar shows as the current workspace. */
function navWorkspace(): HTMLElement | null {
  return within(screen.getByRole('navigation', { name: 'Main' })).queryByRole('link', { name: /Kalita Tea|Dakmanda Looms/ });
}
async function settled(name: string): Promise<void> {
  await waitFor(() => expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(name));
}

beforeEach(() => {
  window.localStorage.clear();
  clearLastWorkspaceCache();
  clearWorkspaceNameCache();
  resetLastKnownUser();
  recorded.calls.length = 0;
});
afterEach(() => cleanup());

describe('27.675 a fresh browser: Home falls back to the first live workspace, and it becomes the current one', () => {
  it('the h1 and the nav name the same workspace, the scope note is gone, and the stored last workspace is it', async () => {
    renderHome(async () => [FIRST, SECOND]);
    await settled('Kalita Tea');
    await waitFor(() => expect(navWorkspace()?.getAttribute('href')).toBe('/w/ws_first'));
    expect(navWorkspace()?.textContent).toBe('Kalita Tea');
    expect(screen.queryByText(NO_WORKSPACE)).not.toBeInTheDocument();
    expect(stored()).toEqual({ userId: KIRO.id, workspaceId: 'ws_first' });
  });

  it('the next page\'s nav starts from it on its FIRST render (the module cache the remount reads, Round 26)', async () => {
    renderHome(async () => [FIRST, SECOND]);
    await waitFor(() => expect(stored()).toEqual({ userId: KIRO.id, workspaceId: 'ws_first' }));
    cleanup();
    const firstRenders: LastWorkspace[] = [];
    function NextPageNav() {
      const value = useLastWorkspace(undefined, KIRO.id);
      if (firstRenders.length === 0) firstRenders.push(value);
      return null;
    }
    render(<NextPageNav />);
    expect(firstRenders).toEqual([{ status: 'remembered', workspaceId: 'ws_first' }]);
  });
});

describe('27.676 CONTROL: a remembered live workspace is shown and stays remembered', () => {
  it('a remembered second workspace titles Home and the nav; the first never overwrites it, and nothing is recorded', async () => {
    remember('ws_second');
    renderHome(async () => [FIRST, SECOND]);
    await settled('Dakmanda Looms');
    await waitFor(() => expect(navWorkspace()?.getAttribute('href')).toBe('/w/ws_second'));
    expect(stored()).toEqual({ userId: KIRO.id, workspaceId: 'ws_second' });
    expect(recorded.calls).toEqual([]);
  });

  it('a record made for ANOTHER person never reaches this person\'s mounted nav (the listener is keyed by user)', async () => {
    remember('ws_second');
    renderHome(async () => [FIRST, SECOND]);
    await waitFor(() => expect(navWorkspace()?.getAttribute('href')).toBe('/w/ws_second'));
    act(() => rememberLastWorkspace('u_someone_else', 'ws_first'));
    expect(navWorkspace()?.getAttribute('href')).toBe('/w/ws_second');
    // control, same it: the same record for THIS person moves the nav at once
    act(() => rememberLastWorkspace(KIRO.id, 'ws_first'));
    await waitFor(() => expect(navWorkspace()?.getAttribute('href')).toBe('/w/ws_first'));
  });
});

describe('27.677 a remembered archived or unknown id: Home falls back to the first live one and records it', () => {
  it.each([
    ['archived', () => [workspace({ id: 'ws_gone', name: 'Old Mill', archived: true }), FIRST, SECOND], 'ws_gone'],
    ['unknown', () => [FIRST, SECOND], 'ws_nobody'],
  ])('%s remembered id → the first live workspace is shown, named by the nav and stored', async (_label, list, id) => {
    remember(id);
    renderHome(async () => list());
    await settled('Kalita Tea');
    await waitFor(() => expect(navWorkspace()?.getAttribute('href')).toBe('/w/ws_first'));
    expect(stored()).toEqual({ userId: KIRO.id, workspaceId: 'ws_first' });
    expect(recorded.calls).toEqual([[KIRO.id, 'ws_first']]);
  });
});

describe('27.678 no live workspace: the empty state, and nothing is recorded', () => {
  it('"Create or join a workspace" with nothing stored; the scope note stays (nothing is current)', async () => {
    renderHome(async () => [workspace({ id: 'ws_gone', name: 'Old Mill', archived: true })]);
    expect(await screen.findByRole('link', { name: 'Create or join a workspace' })).toHaveAttribute('href', '/workspaces');
    expect(stored()).toBeNull();
    expect(recorded.calls).toEqual([]);
    expect(screen.getByText(NO_WORKSPACE)).toBeInTheDocument();
  });
});

describe('27.679 the fallback is recorded once per resolution, not on every render', () => {
  it('re-renders after the record (the nav catching up, a re-render of Home) call the setter exactly once', async () => {
    const view = renderHome(async () => [FIRST, SECOND]);
    await settled('Kalita Tea');
    await waitFor(() => expect(navWorkspace()).not.toBeNull());
    view.rerender(
      <Providers services={stubServices({ getMyWorkspaces: async () => [FIRST, SECOND], getHome: () => new Promise(() => undefined) }, NOTIFICATIONS)}>
        <HomeScreen />
      </Providers>,
    );
    await settled('Kalita Tea');
    await act(async () => undefined);
    expect(recorded.calls).toEqual([[KIRO.id, 'ws_first']]);
  });
});
