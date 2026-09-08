import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { passkey, seen } = vi.hoisted(() => ({
  // Records the DOM state AT THE MOMENT better-auth's client would run
  // @simplewebauthn's `document.querySelectorAll("input[autocomplete$='webauthn']")`.
  seen: [] as number[],
  passkey: vi.fn(async (_o: { autoFill: boolean }) => {
    seen.push(document.querySelectorAll("input[autocomplete$='webauthn']").length);
    return { data: {}, error: null };
  }),
}));

vi.mock('../src/auth-client.js', () => ({
  authClient: {
    phoneNumber: { sendOtp: vi.fn(), verify: vi.fn() },
    signIn: { magicLink: vi.fn(), social: vi.fn(), passkey },
    useSession: () => ({ data: null }),
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

import SignInPage from '../app/sign-in/page.js';

beforeEach(() => {
  seen.length = 0;
  passkey.mockClear();
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ google: false, apple: false }), {
    status: 200, headers: { 'content-type': 'application/json' },
  })));
});

describe('REFUTATION ATTEMPT', () => {
  it('A: eligible webauthn inputs present when the mediation request is issued', async () => {
    render(<SignInPage />);
    await waitFor(() => expect(passkey).toHaveBeenCalled());
    console.log('CALLS:', passkey.mock.calls.length, 'ELIGIBLE-INPUTS-AT-CALL:', JSON.stringify(seen));
    expect(seen[0]).toBeGreaterThan(0);
  });

  it('B: switching to Email link re-issues the request', async () => {
    const user = userEvent.setup();
    render(<SignInPage />);
    await waitFor(() => expect(passkey).toHaveBeenCalled());
    const before = passkey.mock.calls.length;
    await user.click(screen.getByRole('tab', { name: /email/i }));
    await waitFor(() => expect(document.querySelectorAll("input[autocomplete$='webauthn']").length).toBe(1));
    console.log('CALLS-BEFORE-TAB:', before, 'CALLS-AFTER-TAB:', passkey.mock.calls.length,
      'ELIGIBLE-AFTER-TAB:', document.querySelectorAll("input[autocomplete$='webauthn']").length);
    expect(passkey.mock.calls.length).toBeGreaterThan(before);
  });
});
