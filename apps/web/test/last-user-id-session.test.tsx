import { renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readLastUserId, rememberLastUserId } from '../src/last-user-id.js';
import { resetLastKnownUser, useCurrentUser } from '../src/providers.js';

/**
 * Smoothness T4 FIX 1, F2 (case 25.042): `resolveSession` is what writes the stored user id, so it is driven
 * here through `useCurrentUser` under the real resolver, with the session answers the auth client can give.
 */
type Answer = { data?: { user: { id: string; name: string } } | null; isPending: boolean; error?: { status: number } | null };
let answer: Answer = { isPending: true };
vi.mock('../src/auth-client.js', () => ({
  authClient: { useSession: () => answer, signOut: async () => ({ data: {}, error: null }) },
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useParams: () => ({}),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}));

beforeEach(() => {
  window.localStorage.clear();
  resetLastKnownUser();
  answer = { isPending: true };
});

describe('25.042 resolveSession keeps gn-last-user-id: a signed-in answer writes it, a settled signed-out one removes it', () => {
  it('25.042 loading and a non-401 error leave the stored id alone; signed-in writes it; signed-out removes it', () => {
    rememberLastUserId('u_seed');
    const hook = renderHook(() => useCurrentUser());

    // Controls: nothing has been decided yet, so the id the last visit left is untouched.
    expect(hook.result.current).toBeNull();
    expect(readLastUserId()).toBe('u_seed');
    answer = { data: null, isPending: false, error: { status: 500 } }; // the session read failed, not "signed out"
    hook.rerender();
    expect(readLastUserId()).toBe('u_seed');

    answer = { data: { user: { id: 'u_kiro', name: 'Kiro' } }, isPending: false };
    hook.rerender();
    expect(hook.result.current?.id).toBe('u_kiro');
    expect(readLastUserId()).toBe('u_kiro');
    expect(window.localStorage.getItem('gn-last-user-id')).toBe('u_kiro');

    answer = { data: null, isPending: false };
    hook.rerender();
    expect(hook.result.current).toBeNull();
    expect(readLastUserId()).toBeNull();
    expect(window.localStorage.getItem('gn-last-user-id')).toBeNull();
  });
});
