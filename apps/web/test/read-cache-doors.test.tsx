import { cleanup, render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SessionExpiredError,
  clearLiveQueryCache,
  liveQueryStoreKey,
  recallLiveQuery,
  rememberLiveQuery,
  withInflightDedupe,
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
 *   5. the shell's composed data source: an identical read in flight across a
 *      sign-out is not shared (`withInflightDedupe` stamped with the epoch).
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
import { Providers, useCurrentUser } from '../src/providers.js';
import { useSignInOnExpiredSession, withSignInOnExpiredWrite } from '../src/expired-session.js';
import { stubServices } from './helpers/stub-services.js';

const KEY = liveQueryStoreKey('ws', 'board:prj');
const plant = () => rememberLiveQuery(KEY, { groups: ["the first person's board"] });
const planted = () => recallLiveQuery(KEY) !== undefined;

beforeEach(() => {
  clearLiveQueryCache();
  routerPush.mockClear();
  sessionUser = { id: 'u_kiro', name: 'Kiro', email: 'kiro@example.com' };
  signOutImpl = async () => ({ data: {}, error: null });
});
afterEach(cleanup);

describe('25.028 the read cache is emptied at every door the signed-in person changes through', () => {
  const services = () => stubServices({}, { notifications: { unreadCount: async () => 0 } });
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
    signOutImpl = async () => ({ data: null, error: { status: 503, statusText: 'Service Unavailable' } });
    await openMenu();
    await userEvent.click(screen.getByRole('menuitem', { name: 'Sign out Kiro' }));
    await screen.findByRole('alert');
    expect(planted()).toBe(true); // control: still signed in, the cache is still theirs

    signOutImpl = async () => ({ data: {}, error: null });
    await userEvent.click(screen.getByRole('menuitem', { name: 'Sign out Kiro' }));
    await waitFor(() => expect(routerPush).toHaveBeenCalledWith('/sign-in'));
    expect(planted()).toBe(false);
  });

  it('25.028 door 2: a write that ends in a 401 empties the cache before it redirects; any other failure does not', async () => {
    const failing = (cause: Error): DataSource =>
      ({ ingest: async () => { throw cause; }, query: {}, subscribe: () => () => undefined }) as unknown as DataSource;
    const onExpired = vi.fn();

    plant();
    await expect(withSignInOnExpiredWrite(failing(new Error('HTTP 500')), onExpired).ingest([])).rejects.toThrow('HTTP 500');
    expect(planted()).toBe(true); // control: a refusal is not a session ending
    expect(onExpired).not.toHaveBeenCalled();

    await expect(
      withSignInOnExpiredWrite(failing(new SessionExpiredError('/v1/events')), onExpired).ingest([]),
    ).rejects.toBeInstanceOf(SessionExpiredError);
    expect(planted()).toBe(false);
    expect(onExpired).toHaveBeenCalledTimes(1);
  });

  it('25.028 door 3: a read that came back 401 empties the cache as it redirects; any other message does not', () => {
    plant();
    const other = renderHook(() => useSignInOnExpiredSession(['HTTP 500 for /v1/projects/prj/board']));
    expect(other.result.current).toBe(false);
    expect(planted()).toBe(true); // control
    other.unmount();

    const expired = renderHook(() => useSignInOnExpiredSession(['HTTP 401 for /v1/projects/prj/board']));
    expect(expired.result.current).toBe(true);
    expect(routerPush).toHaveBeenCalled();
    expect(planted()).toBe(false);
  });

  it('25.028 door 4: the session resolving to somebody else, or to nobody, empties the cache; the same person again, and a person arriving after nobody, do not', () => {
    plant();
    const hook = renderHook(() => useCurrentUser());
    expect(hook.result.current?.id).toBe('u_kiro');
    expect(planted()).toBe(true); // control: the person this tab already knew, resolving again

    hook.rerender();
    expect(planted()).toBe(true); // control: the same person again

    sessionUser = { id: 'u_other', name: 'Other', email: 'other@example.com' };
    hook.rerender();
    expect(hook.result.current?.id).toBe('u_other');
    expect(planted()).toBe(false);

    plant();
    sessionUser = null; // signed out in another tab, or the cookie expired
    hook.rerender();
    expect(hook.result.current).toBeNull();
    expect(planted()).toBe(false);

    plant();
    sessionUser = { id: 'u_third', name: 'Third', email: 'third@example.com' };
    hook.rerender();
    expect(hook.result.current?.id).toBe('u_third');
    expect(planted()).toBe(true); // control: nobody to somebody is not a change; the cache was emptied when the last person left
  });

  it("25.028 door 5: the shell's data source does not share an identical read in flight across a sign-out", async () => {
    let calls = 0;
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const raw = {
      ingest: async () => [],
      subscribe: () => () => undefined,
      query: {
        getMyWorkspaces: async () => {
          calls += 1;
          await gate;
          return [];
        },
      },
    } as unknown as DataSource;
    const shell = withSignInOnExpiredWrite(withInflightDedupe(raw), () => undefined);
    const first = shell.query.getMyWorkspaces();
    clearLiveQueryCache();
    const second = shell.query.getMyWorkspaces();
    expect(calls).toBe(2);
    release();
    await Promise.all([first, second]);
  });
});
