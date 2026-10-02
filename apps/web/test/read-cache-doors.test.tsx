import { cleanup, render, renderHook, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SessionExpiredError,
  clearLiveQueryCache,
  liveQueryStoreKey,
  recallLiveQuery,
  rememberLiveQuery,
  type DataSource,
} from '@gisik-nokma/app-core';

/**
 * Smoothness T3, review focus 2 (case 25.028): no cached read, board, list or
 * in-flight request of one signed-in person is ever served to the next one on
 * the same device. The cache is emptied at EVERY door through which the person
 * changes, and each door below is driven for real, with a control that plants an
 * answer, takes the nearest NON-door action, and finds it still there:
 *
 *   1. the account menu's sign-out (a successful answer, never a refusal);
 *   2. a WRITE's 401, through the shell's one data-source guard;
 *   3. a READ's 401, through `useSignInOnExpiredSession`;
 *   4. the session resolving to somebody else, or to nobody (another tab's
 *      sign-out, an expired cookie, a sign-in as someone else), through
 *      `useCurrentUser`;
 *   5. the shell's own composed data source (`Providers` with no injected services,
 *      a stubbed `fetch`): identical reads in flight share one request, and a read
 *      in flight across a sign-out is not shared (`withInflightDedupe` stamped with
 *      the epoch).
 */

const routerPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush }),
  useParams: () => ({}),
  usePathname: () => '/w/ws/p/prj',
  useSearchParams: () => new URLSearchParams(),
}));

let sessionUser: { id: string; name: string; email?: string } | null = { id: 'u_kiro', name: 'Kiro', email: 'kiro@example.com' };
let signOutImpl: () => Promise<{ data: object | null; error: { status: number; statusText: string } | null }> = async () => ({
  data: {},
  error: null,
});
vi.mock('../src/auth-client.js', () => ({
  authClient: {
    useSession: () => ({ data: sessionUser === null ? null : { user: sessionUser }, isPending: false }),
    signOut: () => signOutImpl(),
  },
}));

import { AppNav } from '../src/app-nav.js';
import { Providers, useAppServices, useCurrentUser } from '../src/providers.js';
import { useSignInOnExpiredSession, withSignInOnExpiredWrite } from '../src/expired-session.js';
import { clearMyWorkspacesCache, peekMyWorkspacesCache, useMyWorkspaces } from '../src/use-my-workspaces.js';
import { stubServices } from './helpers/stub-services.js';

const KEY = liveQueryStoreKey('ws', 'board:prj');
const plant = () => rememberLiveQuery(KEY, { groups: ["the first person's board"] });
const planted = () => recallLiveQuery(KEY) !== undefined;

// The shared workspaces read (smoothness T4, FD5) is a second per-person cache the doors must empty. It
// is planted through the hook a screen mounts and observed with `peekMyWorkspacesCache`.
const workspacesServices = () => {
  let calls = 0;
  return stubServices(
    {
      getMyWorkspaces: () => {
        calls += 1;
        return calls === 1
          ? Promise.resolve([{ id: 'ws', name: 'Shop', prefix: 'SH', role: 'owner' as const, archived: false, memberCount: 1, nameRestrictedProjectCount: 0, projects: [] }])
          : new Promise<never>(() => undefined);
      },
    },
    { notifications: { unreadCount: async () => 0 } },
  );
};
let wsServices = workspacesServices();
const withWorkspaces = ({ children }: { children: ReactNode }) => <Providers services={wsServices}>{children}</Providers>;
const plantWorkspaces = async () => {
  wsServices = workspacesServices(); // a fresh source: its FIRST read answers
  const first = renderHook(() => useMyWorkspaces(), { wrapper: withWorkspaces });
  await waitFor(() => expect(first.result.current.rows?.[0]?.name).toBe('Shop'));
  first.unmount();
};
/** Does the shared read still hold rows? Peeked, not mounted: a mount resolves the session, which is itself door 4. */
const workspacesAnswer = () => peekMyWorkspacesCache()?.rows != null;

beforeEach(() => {
  clearLiveQueryCache();
  clearMyWorkspacesCache();
  wsServices = workspacesServices();
  routerPush.mockClear();
  sessionUser = { id: 'u_kiro', name: 'Kiro', email: 'kiro@example.com' };
  signOutImpl = async () => ({ data: {}, error: null });
});
afterEach(cleanup);

describe('25.028 the read cache is emptied at every door the signed-in person changes through', () => {
  const services = () => wsServices;
  const openMenu = async () => {
    render(
      <Providers services={services()}>
        <AppNav />
      </Providers>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Account menu for Kiro' }));
  };

  it('25.028 door 1: a sign-out the server accepted empties the cache; one it refused does not', async () => {
    plant();
    await plantWorkspaces();
    signOutImpl = async () => ({ data: null, error: { status: 503, statusText: 'Service Unavailable' } });
    await openMenu();
    await userEvent.click(screen.getByRole('menuitem', { name: 'Sign out Kiro' }));
    await screen.findByRole('alert');
    expect(planted()).toBe(true); // control: still signed in, the cache is still theirs
    expect(workspacesAnswer()).toBe(true); // control: the shared workspaces read answers

    signOutImpl = async () => ({ data: {}, error: null });
    await userEvent.click(screen.getByRole('menuitem', { name: 'Sign out Kiro' }));
    await waitFor(() => expect(routerPush).toHaveBeenCalledWith('/sign-in'));
    expect(planted()).toBe(false);
    expect(workspacesAnswer()).toBe(false);
  });

  it('25.028 door 2: a write that ends in a 401 empties the cache before it redirects; any other failure does not', async () => {
    const failing = (cause: Error): DataSource =>
      ({ ingest: async () => { throw cause; }, query: {}, subscribe: () => () => undefined }) as unknown as DataSource;
    const onExpired = vi.fn();

    plant();
    await plantWorkspaces();
    await expect(withSignInOnExpiredWrite(failing(new Error('HTTP 500')), onExpired).ingest([])).rejects.toThrow('HTTP 500');
    expect(planted()).toBe(true); // control: a refusal is not a session ending
    expect(workspacesAnswer()).toBe(true);
    expect(onExpired).not.toHaveBeenCalled();

    await expect(
      withSignInOnExpiredWrite(failing(new SessionExpiredError('/v1/events')), onExpired).ingest([]),
    ).rejects.toBeInstanceOf(SessionExpiredError);
    expect(planted()).toBe(false);
    expect(workspacesAnswer()).toBe(false);
    expect(onExpired).toHaveBeenCalledTimes(1);
  });

  it('25.028 door 3: a read that came back 401 empties the cache as it redirects; any other message does not', async () => {
    plant();
    await plantWorkspaces();
    const other = renderHook(() => useSignInOnExpiredSession(['HTTP 500 for /v1/projects/prj/board']));
    expect(other.result.current).toBe(false);
    expect(planted()).toBe(true); // control
    expect(workspacesAnswer()).toBe(true);
    other.unmount();

    const expired = renderHook(() => useSignInOnExpiredSession(['HTTP 401 for /v1/projects/prj/board']));
    expect(expired.result.current).toBe(true);
    expect(routerPush).toHaveBeenCalled();
    expect(planted()).toBe(false);
    expect(workspacesAnswer()).toBe(false);
  });

  it('25.028 door 4: the session resolving to somebody else, or to nobody, empties the cache; the same person again, and a person arriving after nobody, do not', async () => {
    plant();
    await plantWorkspaces();
    const hook = renderHook(() => useCurrentUser());
    expect(hook.result.current?.id).toBe('u_kiro');
    expect(planted()).toBe(true); // control: the person this tab already knew, resolving again
    expect(workspacesAnswer()).toBe(true);

    hook.rerender();
    expect(planted()).toBe(true); // control: the same person again
    expect(workspacesAnswer()).toBe(true);

    sessionUser = { id: 'u_other', name: 'Other', email: 'other@example.com' };
    hook.rerender();
    expect(hook.result.current?.id).toBe('u_other');
    expect(planted()).toBe(false);
    expect(workspacesAnswer()).toBe(false);

    plant();
    await plantWorkspaces();
    sessionUser = null; // signed out in another tab, or the cookie expired
    hook.rerender();
    expect(hook.result.current).toBeNull();
    expect(planted()).toBe(false);
    expect(workspacesAnswer()).toBe(false);

    plant();
    sessionUser = { id: 'u_third', name: 'Third', email: 'third@example.com' };
    hook.rerender();
    expect(hook.result.current?.id).toBe('u_third');
    expect(planted()).toBe(true); // control: nobody to somebody is not a change; the cache was emptied when the last person left
  });

  it('25.028 door 5: the shell\'s OWN composed data source (Providers, no injected services) shares an identical read in flight, and does not share one across a sign-out', async () => {
    let calls = 0;
    let release!: () => void;
    let gate = new Promise<void>((r) => {
      release = r;
    });
    const rearm = () => {
      gate = new Promise<void>((r) => {
        release = r;
      });
    };
    vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
      if (!String(input).endsWith('/v1/me/workspaces')) return { ok: false, status: 404, json: async () => null };
      calls += 1;
      await gate;
      return { ok: true, status: 200, json: async () => ({ workspaces: [] }) };
    });
    try {
      // No `services`: `Providers` builds the online source and wraps it itself, which is
      // the composition under test. A shell built by hand here would leave a dropped
      // `withInflightDedupe` in `providers.tsx` unseen.
      const { result } = renderHook(() => useAppServices().dataSource, { wrapper: Providers });
      const ds = result.current;

      // Control: two identical reads in flight, ONE request.
      const a = ds.query.getMyWorkspaces();
      const b = ds.query.getMyWorkspaces();
      expect(calls).toBe(1);
      release();
      await Promise.all([a, b]);

      // The epoch: a sign-out between two identical reads in flight splits them.
      rearm();
      const c = ds.query.getMyWorkspaces();
      clearLiveQueryCache();
      const d = ds.query.getMyWorkspaces();
      expect(calls).toBe(3);
      release();
      await Promise.all([c, d]);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
