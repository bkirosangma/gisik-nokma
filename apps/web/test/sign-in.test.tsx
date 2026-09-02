import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

/**
 * `vi.hoisted`, not five bare `const`s. `vi.mock` is hoisted above every
 * statement in the file, so a factory closing over module-level bindings throws
 * `ReferenceError: Cannot access 'sendOtp' before initialization` at import
 * time — the plan's spelling, and it fails on collection rather than in a test,
 * which is the failure mode that looks like a broken suite instead of a broken
 * mock.
 */
const { sendOtp, verify, magicLink, social, passkey } = vi.hoisted(() => ({
  sendOtp: vi.fn(async () => ({ data: {}, error: null })),
  verify: vi.fn(async () => ({ data: {}, error: null })),
  magicLink: vi.fn(async () => ({ data: {}, error: null })),
  social: vi.fn(async () => ({ data: {}, error: null })),
  passkey: vi.fn(async () => ({ data: {}, error: null })),
}));

/**
 * ## WHAT THIS MOCK MAKES THIS FILE UNABLE TO CATCH, said before the assertions
 *
 * `../src/auth-client.js` is replaced WHOLESALE. Every assertion below is
 * therefore about the page calling the members of THIS object — it cannot fail
 * because better-auth spells one of them differently, because the real module
 * is never loaded here. By the branch's own taxonomy that is a HARNESS vacuity
 * on the member-name axis, and it is named rather than left for a reader to
 * discover.
 *
 * The member names are checked by `typecheck` instead, and only there: `tsc`
 * resolves `better-auth/react`, `better-auth/client/plugins` and
 * `@better-auth/passkey/client` for real, so `authClient.signIn.passkey` not
 * existing is a compile error in `app/sign-in/page.tsx`. Measured 2026-09-02:
 * with `passkeyClient()` dropped from the plugin list in `src/auth-client.ts`,
 * `pnpm typecheck` answers two errors, the first being
 * `app/sign-in/page.tsx(149,38): error TS2339: Property 'passkey' does not
 * exist on type '{ phoneNumber: …; } & { …'` — and this suite stays green
 * through it (6 files, 28 tests, 0 failures), which is exactly the point.
 *
 * What this file DOES prove is the page's own contract: that all four methods
 * are offered, that nothing password-shaped is, that the phone flow is two
 * steps and not one, and that each button reaches the method it names with the
 * arguments the flow implies.
 */
vi.mock('../src/auth-client.js', () => ({
  authClient: {
    phoneNumber: { sendOtp, verify },
    signIn: { magicLink, social, passkey },
    useSession: () => ({ data: null }),
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

import SignInPage from '../app/sign-in/page.js';

describe('sign-in — all four passwordless methods (spec §6)', () => {
  it('offers phone OTP, magic link, Google and passkey — and nothing password-shaped', () => {
    render(<SignInPage />);
    expect(screen.getByRole('tab', { name: 'Phone' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Email link' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue with Google' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in with a passkey' })).toBeInTheDocument();
    expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument();
  });

  it('phone flow: request the code, then verify it', async () => {
    const user = userEvent.setup();
    render(<SignInPage />);
    await user.type(screen.getByLabelText('Phone number'), '+919812345678');
    await user.click(screen.getByRole('button', { name: 'Send code' }));
    expect(sendOtp).toHaveBeenCalledWith({ phoneNumber: '+919812345678' });
    await user.type(await screen.findByLabelText('One-time code'), '123456');
    await user.click(screen.getByRole('button', { name: 'Verify and sign in' }));
    expect(verify).toHaveBeenCalledWith({ phoneNumber: '+919812345678', code: '123456' });
  });

  it('the code field does not exist until a code has been sent', () => {
    render(<SignInPage />);
    expect(screen.queryByLabelText('One-time code')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Verify and sign in' })).not.toBeInTheDocument();
  });

  it('magic-link flow sends the email', async () => {
    const user = userEvent.setup();
    render(<SignInPage />);
    await user.click(screen.getByRole('tab', { name: 'Email link' }));
    await user.type(screen.getByLabelText('Email'), 'anselma@example.com');
    await user.click(screen.getByRole('button', { name: 'Send magic link' }));
    expect(magicLink).toHaveBeenCalledWith({
      email: 'anselma@example.com',
      callbackURL: '/workspaces',
    });
  });

  it('Google and passkey call their sign-in methods', async () => {
    const user = userEvent.setup();
    render(<SignInPage />);
    await user.click(screen.getByRole('button', { name: 'Continue with Google' }));
    expect(social).toHaveBeenCalledWith({ provider: 'google', callbackURL: '/workspaces' });
    await user.click(screen.getByRole('button', { name: 'Sign in with a passkey' }));
    expect(passkey).toHaveBeenCalled();
  });
});
