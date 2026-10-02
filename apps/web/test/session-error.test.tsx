import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useSyncExternalStore } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Providers, resetLastKnownUser, useSessionStatus } from '../src/providers.js';
import { noteRetryAfter, parseRetryAfter, retryDelayMs } from '../src/session-retry.js';
import { stubServices } from './helpers/stub-services.js';

/**
 * SYS-01 (audit 2026-10-01), cases 21.239–21.241: a FAILED session read (a 429, a 5xx, a dropped
 * connection) must not look like "signed out". Two code paths read the session — `useSessionStatus`
 * (the pages' "Sign in to …" fallbacks) and, before this fix, `useCurrentUser` (the nav) — and both
 * ignored `session.error`.
 */

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useParams: () => ({}),
  usePathname: () => '/workspaces',
  useSearchParams: () => new URLSearchParams(),
}));

type MockSession = {
  data: { user: { id: string; name: string; email: string } } | null;
  isPending: boolean;
  isRefetching: boolean;
  error: { status: number; statusText: string } | null;
};
const ME = { id: 'u_kiro', name: 'Kiro', email: 'kiro@example.com' };
const SIGNED_IN: MockSession = { data: { user: ME }, isPending: false, isRefetching: false, error: null };
/** A genuine "nobody": the server ANSWERED (200) with no user. */
const SIGNED_OUT: MockSession = { data: null, isPending: false, isRefetching: false, error: null };
const PENDING: MockSession = { data: null, isPending: true, isRefetching: false, error: null };
const tooMany = (): MockSession => ({
  data: null,
  isPending: false,
  isRefetching: false,
  error: { status: 429, statusText: 'Too Many Requests' },
});

/** A tiny external store, so a case can change the session and the mounted tree follows. */
let current: MockSession = SIGNED_IN;
const listeners = new Set<() => void>();
function setSession(next: MockSession): void {
  current = next;
  act(() => listeners.forEach((listener) => listener()));
}
const refetch = vi.fn(async (): Promise<void> => undefined);

vi.mock('../src/auth-client.js', () => ({
  authClient: {
    useSession: () => ({
      ...useSyncExternalStore(
        (listener) => {
          listeners.add(listener);
          return () => listeners.delete(listener);
        },
        () => current,
      ),
      refetch,
    }),
    signOut: async () => ({ data: {}, error: null }),
  },
}));

import { AppNav } from '../src/app-nav.js';
import { clearLastProjectCache } from '../src/use-last-project.js';
import { clearLastWorkspaceCache } from '../src/use-last-workspace.js';
import { clearWorkspaceNameCache } from '../src/use-workspace-name.js';
import { clearWorkspaceProjectsCache } from '../src/use-workspace-projects.js';

function stubPhoneViewport(matches: boolean): void {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (media: string) => ({ matches, media, addEventListener: () => undefined, removeEventListener: () => undefined }),
  });
}

/** What the pages' "Sign in to …" fallbacks do, reduced to the one branch that matters. */
function PageFallback() {
  const status = useSessionStatus();
  return <p data-testid="page">{status.kind === 'signed-out' ? 'Sign in to open settings' : `status:${status.kind}`}</p>;
}

function shell() {
  return (
    <Providers services={stubServices({ getMyWorkspaces: async () => [] }, { notifications: { unreadCount: async () => 0 } })}>
      <AppNav />
      <PageFallback />
    </Providers>
  );
}

const NOTICE = /Can.t reach the server right now\. Retrying…/;

beforeEach(() => {
  cleanup();
  window.localStorage.clear();
  clearLastWorkspaceCache();
  clearWorkspaceNameCache();
  clearLastProjectCache();
  clearWorkspaceProjectsCache();
  resetLastKnownUser();
  refetch.mockClear();
  current = SIGNED_IN;
  stubPhoneViewport(true);
});
afterEach(() => {
  vi.useRealTimers();
  Reflect.deleteProperty(window, 'matchMedia');
});

describe('21.239 a session error keeps the signed-in chrome', () => {
  it('21.239 signed in, then the read fails with 429: the nav keeps its signed-in links and the phone bottom bar, and nothing says "Sign in"; CONTROL: a genuine signed-out answer (200, no user) shows "Sign in" and no bottom bar', async () => {
    const { container } = render(shell());
    expect(await screen.findByRole('link', { name: 'Workspaces' })).toBeTruthy();
    expect(screen.getByRole('navigation', { name: 'Phone' })).toBeTruthy();

    setSession(tooMany());
    expect(screen.getByRole('link', { name: 'Workspaces' })).toBeTruthy();
    expect(screen.getByRole('navigation', { name: 'Phone' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Sign in' })).toBeNull();
    expect(container.textContent ?? '').not.toMatch(/Sign in/);
    // the pages' fallbacks read the same answer: the last known user, not "signed out"
    expect(screen.getByTestId('page').textContent).toBe('status:signed-in');

    // CONTROL — the server ANSWERED that nobody is signed in: the signed-out chrome is right.
    setSession(SIGNED_OUT);
    expect(screen.getByRole('link', { name: 'Sign in' })).toBeTruthy();
    expect(screen.queryByRole('navigation', { name: 'Phone' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Workspaces' })).toBeNull();
    expect(screen.getByTestId('page').textContent).toBe('Sign in to open settings');
  });

  it('21.239 a first-load failure (no user ever seen) is an `error` status — not signed out, not signed in — and the nav draws no "Sign in"', () => {
    current = tooMany();
    const { container } = render(shell());
    expect(screen.getByTestId('page').textContent).toBe('status:error');
    expect(screen.queryByRole('link', { name: 'Sign in' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Workspaces' })).toBeNull();
    expect(container.textContent ?? '').not.toMatch(/Sign in/);
    // CONTROL — a 401 IS an answer (the session expired): signed out.
    setSession({ ...SIGNED_OUT, error: { status: 401, statusText: 'Unauthorized' } });
    expect(screen.getByTestId('page').textContent).toBe('Sign in to open settings');
    expect(screen.getByRole('link', { name: 'Sign in' })).toBeTruthy();
    // …and a 401 is no outage: no notice, no Try again (the failure is the 429 above, not this answer)
    expect(screen.queryByText(NOTICE)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });

  it('21.239 sign-out forgets the user: signed in → a genuine "nobody" → a failed read is `error`, not the old user; CONTROL: before the sign-out the same failure DID keep the user', async () => {
    const { container } = render(shell());
    expect(await screen.findByRole('link', { name: 'Workspaces' })).toBeTruthy();
    setSession(tooMany());
    expect(screen.getByTestId('page').textContent).toBe('status:signed-in');
    expect(screen.getByRole('link', { name: 'Workspaces' })).toBeTruthy();

    setSession(SIGNED_OUT);
    expect(screen.getByTestId('page').textContent).toBe('Sign in to open settings');
    setSession(tooMany());
    expect(screen.getByTestId('page').textContent).toBe('status:error');
    expect(screen.queryByRole('link', { name: 'Workspaces' })).toBeNull();
    // AMENDED 2026-10-02 (F-6, 23.285): a failed read with no user is NOT signed out, so the phone bar stays — it was
    // `toBeNull()` here, which pinned the very hole F-6 closes (a first-request failure left a phone with no way to navigate).
    expect(screen.getByRole('navigation', { name: 'Phone' })).toBeTruthy();
    expect(container.textContent ?? '').not.toMatch(/Sign in/);
  });
});

describe('23.285 the phone bottom bar when the session never loads (F-6, owner follow-up 2026-10-02)', () => {
  it('23.285 a first request that FAILS (an `error` status, no last-known user) still shows the bar, with the default slots; CONTROL: a genuine signed-out answer shows none, and a read still pending shows none', () => {
    current = tooMany();
    render(shell());
    expect(screen.getByTestId('page').textContent).toBe('status:error');
    const phone = screen.getByRole('navigation', { name: 'Phone' });
    // The default bar (Board · My work · Notes · Inbox) is not rendered without a workspace; what resolves is Notes, Inbox and More.
    expect(within(phone).getByRole('link', { name: 'Notes' })).toBeTruthy();
    expect(within(phone).getByRole('link', { name: 'Inbox' })).toBeTruthy();
    expect(within(phone).getByRole('button', { name: 'More' })).toBeTruthy();
    // and nothing was remembered under a made-up id
    expect(window.localStorage.length).toBe(0);

    // CONTROL — the server ANSWERED that nobody is signed in: no bar.
    setSession(SIGNED_OUT);
    expect(screen.getByTestId('page').textContent).toBe('Sign in to open settings');
    expect(screen.queryByRole('navigation', { name: 'Phone' })).toBeNull();
    // CONTROL — still loading: no bar yet (nothing is known, and the signed-in markup hydrates later).
    setSession(PENDING);
    expect(screen.queryByRole('navigation', { name: 'Phone' })).toBeNull();
  });
});

describe('21.240 the notice and Try again', () => {
  it('21.240 the notice and Try again appear on error and disappear once a retry succeeds; Try again refetches the session; CONTROL: a healthy session shows neither', async () => {
    const user = userEvent.setup();
    render(shell());
    expect(screen.queryByText(NOTICE)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();

    setSession(tooMany());
    expect(screen.getByRole('status').textContent).toMatch(NOTICE);
    const retry = screen.getByRole('button', { name: 'Try again' });

    refetch.mockImplementationOnce(async () => setSession(SIGNED_IN));
    await user.click(retry);
    expect(refetch).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(NOTICE)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Workspaces' })).toBeTruthy();
  });

  it('21.240 no blink while a retry is in flight: the notice and Try again stay through the refetch (no error, isRefetching) and go only on success; CONTROL: a refetch that was never preceded by a failure shows nothing', () => {
    // CONTROL — better-auth's refetch-start state on a HEALTHY session is not a failure
    render(shell());
    setSession({ data: null, isPending: true, isRefetching: true, error: null });
    expect(screen.queryByText(NOTICE)).toBeNull();
    setSession(SIGNED_IN);

    setSession(tooMany());
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
    // what better-auth sets when a refetch starts (`client/query.mjs` onRequest): error cleared, isRefetching on
    setSession({ data: null, isPending: true, isRefetching: true, error: null });
    expect(screen.getByRole('status').textContent).toMatch(NOTICE);
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
    setSession(SIGNED_IN);
    expect(screen.queryByText(NOTICE)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
  });

  it("21.240 a failure retries on its own with backoff — the server's Retry-After when a 429 gave one, 1 s doubling to a 30 s ceiling when not", () => {
    vi.useFakeTimers();
    render(shell());
    noteRetryAfter({ status: 429, headers: { get: (name) => (name === 'retry-after' ? '7' : null) } });
    setSession(tooMany());
    act(() => void vi.advanceTimersByTime(6_900));
    expect(refetch).not.toHaveBeenCalled();
    act(() => void vi.advanceTimersByTime(200));
    expect(refetch).toHaveBeenCalledTimes(1);

    // the retry fails again (a NEW error): no Retry-After this time, so the second backoff step, 2 s
    setSession(tooMany());
    act(() => void vi.advanceTimersByTime(1_900));
    expect(refetch).toHaveBeenCalledTimes(1);
    act(() => void vi.advanceTimersByTime(200));
    expect(refetch).toHaveBeenCalledTimes(2);

    // the pure parts: delay-seconds, an HTTP date, junk, and the ceiling
    expect(parseRetryAfter('7')).toBe(7000);
    expect(parseRetryAfter('Thu, 01 Jan 2026 00:00:10 GMT', Date.parse('2026-01-01T00:00:00Z'))).toBe(10_000);
    expect(parseRetryAfter('soon')).toBeNull();
    expect(retryDelayMs(0, null)).toBe(1000);
    expect(retryDelayMs(10, null)).toBe(30_000);
    expect(retryDelayMs(0, 7000)).toBe(7000);
    // CONTROL — a healthy session sets no timer: nothing more is refetched
    setSession(SIGNED_IN);
    act(() => void vi.advanceTimersByTime(60_000));
    expect(refetch).toHaveBeenCalledTimes(2);

    // the backoff RESETS on recovery: a NEW failure retries after the first step (1 s) again, not the third (4 s)
    setSession(tooMany());
    act(() => void vi.advanceTimersByTime(900));
    expect(refetch).toHaveBeenCalledTimes(2);
    act(() => void vi.advanceTimersByTime(200));
    expect(refetch).toHaveBeenCalledTimes(3);

    // a zero wait is still a wait (floor 1 s), and a huge one is capped (120 s)
    expect(retryDelayMs(0, 0)).toBe(1000);
    expect(retryDelayMs(0, 600_000)).toBe(120_000);
  });
});

describe('21.241 first load while pending', () => {
  it('21.241 pending shows neither "Sign in" nor the notice (nor the signed-in chrome); CONTROL: once the read resolves signed out, "Sign in" appears', () => {
    current = PENDING;
    const { container } = render(shell());
    expect(screen.getByTestId('page').textContent).toBe('status:loading');
    expect(container.textContent ?? '').not.toMatch(/Sign in/);
    expect(screen.queryByText(NOTICE)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Workspaces' })).toBeNull();

    setSession(SIGNED_OUT);
    expect(screen.getByRole('link', { name: 'Sign in' })).toBeTruthy();
  });
});
