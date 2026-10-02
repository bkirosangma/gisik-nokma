import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Smoothness T8 — the entry pages say they are working (spec S6, S7; audit SM-11; cases 25.132–25.134).
 * The harness is `sign-in.test.tsx`'s: `authClient` and `fetch` are mocked. The real `/v1/auth/methods` answer is
 * `{ google, apple, phone }` (the plan's fixture was a different shape).
 */
const { sendOtp, verify, magicLink, social, passkey } = vi.hoisted(() => ({
  sendOtp: vi.fn(),
  verify: vi.fn(),
  magicLink: vi.fn(),
  social: vi.fn(),
  passkey: vi.fn(),
}));
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
  useParams: () => ({}),
}));

import SignInPage from '../app/sign-in/page.js';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}
type Methods = { google: boolean; apple: boolean; phone: boolean };
function methodsAnswer(answer: Promise<Methods | 'refused' | 'unreachable'>): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      const value = await answer;
      if (value === 'unreachable') throw new Error('offline');
      if (value === 'refused') return new Response('{}', { status: 500 });
      return new Response(JSON.stringify(value), { status: 200, headers: { 'content-type': 'application/json' } });
    }),
  );
}
const slot = (): HTMLElement => document.querySelector<HTMLElement>('.gn-sign-in .gn-sign-in__methods-slot')!;

beforeEach(() => {
  cleanup();
  for (const mock of [sendOtp, verify, magicLink, social, passkey]) mock.mockReset();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe('25.132 the methods row reserves its place before /auth/methods answers', () => {
  it('25.132 the slot exists in the first frame holding a skeleton, is the card\'s first child, is the SAME element once the Phone/Email control lands, and reserves its height by rule', async () => {
    const methods = deferred<Methods>();
    methodsAnswer(methods.promise);
    render(<SignInPage />);
    const before = slot();
    expect(before.querySelector('.gn-skeleton')).not.toBeNull();
    expect(before.parentElement!.firstElementChild).toBe(before);
    expect(before.getAttribute('data-state')).toBe('pending');
    await screen.findByRole('textbox', { name: /Email/ });
    act(() => methods.resolve({ google: false, apple: false, phone: true }));
    await screen.findByRole('tab', { name: 'Phone' });
    // CONTROL: same node, now holding the real control and no skeleton.
    expect(slot()).toBe(before);
    expect(before.querySelector('.gn-skeleton')).toBeNull();
    expect(before.querySelector('.gn-segmented')).not.toBeNull();
    expect(screen.getByRole('textbox', { name: /Phone/ })).toBeInTheDocument();
  });

  it('25.133 a /auth/methods that is REFUSED or unreachable leaves no skeleton behind (the email form, no control): "null" is not "in flight"', async () => {
    methodsAnswer(Promise.resolve('refused'));
    render(<SignInPage />);
    await waitFor(() => expect(slot().querySelector('.gn-skeleton')).toBeNull());
    expect(slot().getAttribute('data-state')).toBe('ready');
    expect(screen.getByRole('textbox', { name: /Email/ })).toBeInTheDocument();
    cleanup();
    methodsAnswer(Promise.resolve('unreachable'));
    render(<SignInPage />);
    await waitFor(() => expect(slot().querySelector('.gn-skeleton')).toBeNull());
    expect(document.querySelector('[aria-busy="true"]')).toBeNull();
  });
});

describe('25.134 every submit is a busy button while its call is in flight', () => {
  it('25.134 Send code → "Sending…" (disabled, a second click sends nothing) → Verify → "Signing in…"', async () => {
    methodsAnswer(Promise.resolve({ google: false, apple: false, phone: true }));
    const send = deferred<{ error: null }>();
    sendOtp.mockReturnValueOnce(send.promise);
    const user = userEvent.setup();
    render(<SignInPage />);
    await screen.findByRole('tab', { name: 'Phone' });
    await user.type(screen.getByRole('textbox', { name: /Phone/ }), '+919999999999');
    await user.click(screen.getByRole('button', { name: 'Send code' }));
    const busy = screen.getByRole('button', { name: 'Sending…' });
    expect(busy).toBeDisabled();
    expect(busy).toHaveAttribute('aria-busy', 'true');
    await user.click(busy);
    expect(sendOtp).toHaveBeenCalledTimes(1);
    act(() => send.resolve({ error: null }));
    await screen.findByRole('textbox', { name: /One-time code/ });
    // CONTROL: the busy state ended with the call.
    expect(screen.queryByRole('button', { name: 'Sending…' })).toBeNull();
    const check = deferred<{ error: null }>();
    verify.mockReturnValueOnce(check.promise);
    await user.click(screen.getByRole('button', { name: 'Verify and sign in' }));
    expect(screen.getByRole('button', { name: 'Signing in…' })).toBeDisabled();
    act(() => check.resolve({ error: null }));
  });

  it('25.134 a refused send frees the button again (the finally), the magic-link and passkey buttons are busy too, and a social mark is disabled in flight', async () => {
    methodsAnswer(Promise.resolve({ google: true, apple: false, phone: false }));
    const user = userEvent.setup();
    render(<SignInPage />);
    await screen.findByRole('button', { name: 'Continue with Google' });
    await user.type(screen.getByRole('textbox', { name: /Email/ }), 'a@example.com');
    const link = deferred<{ error: { message: string } }>();
    magicLink.mockReturnValueOnce(link.promise);
    await user.click(screen.getByRole('button', { name: 'Send magic link' }));
    expect(screen.getByRole('button', { name: 'Sending…' })).toBeDisabled();
    // A submit that does not come through the disabled button (Enter in the field) is ignored while the call is open: the `run` guard.
    fireEvent.submit(screen.getByRole('textbox', { name: /Email/ }).closest('form') as HTMLFormElement);
    expect(magicLink).toHaveBeenCalledTimes(1);
    act(() => link.resolve({ error: { message: 'nope' } }));
    await screen.findByRole('button', { name: 'Send magic link' });
    // Passkey
    const key = deferred<{ error: null }>();
    passkey.mockReturnValueOnce(key.promise);
    await user.click(screen.getByRole('button', { name: 'Sign in with a passkey' }));
    expect(screen.getByRole('button', { name: 'Signing in…' })).toBeDisabled();
    act(() => key.resolve({ error: null }));
    // Social: icon-only, so it keeps its name and says busy by state.
    const via = deferred<{ error: null }>();
    social.mockReturnValueOnce(via.promise);
    await user.click(await screen.findByRole('button', { name: 'Continue with Google' }));
    const mark = screen.getByRole('button', { name: 'Continue with Google' });
    expect(mark).toBeDisabled();
    expect(mark).toHaveAttribute('aria-busy', 'true');
    act(() => via.resolve({ error: null }));
  });

  it('25.134 with both social marks, a click on Google makes Google busy and Apple disabled-not-busy, and the reverse', async () => {
    methodsAnswer(Promise.resolve({ google: true, apple: true, phone: false }));
    const user = userEvent.setup();
    render(<SignInPage />);
    const google = () => screen.getByRole('button', { name: 'Continue with Google' });
    const apple = () => screen.getByRole('button', { name: 'Continue with Apple' });
    await screen.findByRole('button', { name: 'Continue with Apple' });
    const first = deferred<{ error: null }>();
    social.mockReturnValueOnce(first.promise);
    await user.click(google());
    expect(google()).toBeDisabled();
    expect(google()).toHaveAttribute('aria-busy', 'true');
    expect(apple()).toBeDisabled();
    expect(apple()).not.toHaveAttribute('aria-busy', 'true');
    await user.click(apple());
    expect(social).toHaveBeenCalledTimes(1);
    act(() => first.resolve({ error: null }));
    await waitFor(() => expect(apple()).not.toBeDisabled());
    const second = deferred<{ error: null }>();
    social.mockReturnValueOnce(second.promise);
    await user.click(apple());
    expect(apple()).toHaveAttribute('aria-busy', 'true');
    expect(apple()).toBeDisabled();
    expect(google()).toBeDisabled();
    expect(google()).not.toHaveAttribute('aria-busy', 'true');
    act(() => second.resolve({ error: null }));
    await waitFor(() => expect(google()).not.toBeDisabled());
  });
});
