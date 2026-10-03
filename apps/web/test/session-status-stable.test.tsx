import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resetLastKnownUser, useSessionStatus } from '../src/providers.js';

/**
 * Smoothness T12 (audit SM-10) — case 25.204. `useSessionStatus` is read by a dozen consumers; a session read that changes
 * nothing a consumer can see (a refetch that returns the same person in a new object) must not hand each of them a new
 * object, or every dependent memo below them recomputes for nothing.
 */

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useParams: () => ({}),
  usePathname: () => '/workspaces',
  useSearchParams: () => new URLSearchParams(),
}));

type MockUser = { id: string; name: string; email: string };
let user: MockUser | null = null;

vi.mock('../src/auth-client.js', () => ({
  authClient: {
    // A NEW session object (and a new `user` object) on every call, as a refetch produces.
    useSession: () => ({
      data: user === null ? null : { user: { ...user } },
      isPending: false,
      isRefetching: false,
      error: null,
    }),
  },
}));

beforeEach(() => {
  resetLastKnownUser();
  user = null;
});

describe('25.204 the session status keeps one identity while the person is unchanged', () => {
  it('25.204 same person across renders is the same object; a different person, and signing out, are not', () => {
    user = { id: 'u_kiro', name: 'Kiro', email: 'kiro@example.com' };
    const hook = renderHook(() => useSessionStatus());
    const first = hook.result.current;
    expect(first).toEqual({ kind: 'signed-in', user: { id: 'u_kiro', name: 'Kiro' } });

    hook.rerender();
    expect(hook.result.current).toBe(first);

    // CONTROL — the memo is keyed on what a consumer reads, not frozen: a new name is a new object …
    user = { id: 'u_kiro', name: 'Kiro Sangma', email: 'kiro@example.com' };
    hook.rerender();
    expect(hook.result.current).not.toBe(first);
    expect(hook.result.current).toEqual({ kind: 'signed-in', user: { id: 'u_kiro', name: 'Kiro Sangma' } });

    // … and so is a sign-out.
    resetLastKnownUser();
    user = null;
    hook.rerender();
    expect(hook.result.current).toEqual({ kind: 'signed-out' });
  });
});
