import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
  /* Typed argument, so `.mock.calls[n][0]` is a real object rather than an
     empty tuple — the assertions below read the callbackURL out of it. */
  magicLink: vi.fn(async (_args: { email: string; callbackURL: string }) => ({
    data: {},
    error: null,
  })),
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

/**
 * MUTABLE, so the `?next=` guard can be exercised. It was a fixed empty
 * `URLSearchParams`, which meant the one attacker-controllable input on this
 * page had no test of any kind.
 */
const { query } = vi.hoisted(() => ({ query: { current: new URLSearchParams() } }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  useSearchParams: () => query.current,
}));

import SignInPage from '../app/sign-in/page.js';

/**
 * THE SERVER'S ANSWER ABOUT WHICH SOCIAL METHODS EXIST, stubbed per test.
 *
 * The page asks `GET /v1/auth/methods` on mount and renders a social button only
 * for a provider the server says it will accept. `{ google: false, apple: false }`
 * is the DEFAULT here because it is the dev stack's real state — `GOOGLE_CLIENT_ID`
 * is unset — and a default that matched production would make every case below
 * pass for a reason unrelated to what it names.
 */
function serverOffers(answer: { google: boolean; apple: boolean }): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes('/v1/auth/methods')) {
        return new Response(JSON.stringify(answer), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      throw new Error(`unexpected fetch in sign-in test: ${String(input)}`);
    }),
  );
}

beforeEach(() => {
  serverOffers({ google: false, apple: false });
});

afterEach(() => {
  vi.unstubAllGlobals();
  passkey.mockClear();
});

describe('sign-in — all four passwordless methods (spec §6)', () => {
  /**
   * 3.84, AMENDED — and the amendment is the finding, not a relaxation.
   *
   * This case used to assert that all four methods render as controls. Two of
   * those four COULD NOT WORK, and asserting their presence is what kept them on
   * screen:
   *
   *   * `Continue with Google` rendered unconditionally while
   *     `GOOGLE_CLIENT_ID` was unset on the dev stack. The owner found it by
   *     pressing it.
   *   * `Sign in with a passkey` could not work for ANY user ANYWHERE — there is
   *     no passkey registration flow in app code, so nobody can hold a passkey
   *     to sign in with. Not a configuration gap; a missing feature.
   *
   * So the property is no longer *four methods are offered* but **exactly the
   * methods that can work are offered**. Phone and email need no provider and
   * are unconditional; the social pair is gated on the server's own answer; and
   * passkey moves from a button to conditional mediation, which shows itself
   * only to a user who actually has one.
   *
   * The password absence is unchanged and still asserted: `auth.ts:84` sets
   * `emailAndPassword: { enabled: false }` with "the spec forbids passwords", so
   * the prototype's Password tab is not merely absent but forbidden.
   */
  it('3.84 offers phone OTP and magic link unconditionally, and nothing password-shaped', () => {
    render(<SignInPage />);
    expect(screen.getByRole('tab', { name: 'Phone' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Email link' })).toBeInTheDocument();
    expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /password/i })).not.toBeInTheDocument();
  });

  /**
   * 13.326 — THE LOAD-BEARING CASE, and it is asserted in BOTH directions
   * because each alone passes on a broken page.
   *
   * A page that renders no social button ever satisfies the first half. A page
   * that renders both unconditionally satisfies the second. Only the pair says
   * *the button appears when and only when the server will accept it*.
   *
   * The negative half uses `waitFor` around a NEGATIVE, which is a shape worth
   * justifying: the fetch resolves on a microtask, so asserting absence
   * synchronously would pass before the answer had arrived — green for the wrong
   * reason, and green even against a page that renders the button a tick later.
   * Waiting for the POSITIVE control (the tabs, which render immediately) is not
   * enough either, because it does not order against the fetch. So the negative
   * is asserted after the page has been given the answer and re-rendered, which
   * `findByRole` on a control that DOES appear in the enabled case establishes.
   */
  it('13.326 renders no social button for a provider the server will not accept', async () => {
    serverOffers({ google: false, apple: false });
    render(<SignInPage />);

    // Positive control first: the page rendered at all, so a zero count below is
    // a fact about the buttons and not about an empty DOM.
    expect(screen.getByRole('tab', { name: 'Phone' })).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Continue with Google' })).toBeNull();
    });
    expect(screen.queryByRole('button', { name: 'Continue with Apple' })).toBeNull();
    // The old dead control, gone rather than hidden.
    expect(screen.queryByRole('button', { name: 'Sign in with a passkey' })).toBeNull();
  });

  it('13.326 renders each social button, by its shipped accessible name, when the server accepts it', async () => {
    serverOffers({ google: true, apple: true });
    render(<SignInPage />);

    // The EXACT shipped wording, carried by `aria-label` now that the visible
    // text is a logo mark. This is the locator 13.292 uses, so the copy rule is
    // satisfied where a screen reader and a test both look.
    const google = await screen.findByRole('button', { name: 'Continue with Google' });
    const apple = await screen.findByRole('button', { name: 'Continue with Apple' });

    // Icon-only: the accessible name comes from the label, not from text.
    expect(google.textContent).toBe('');
    expect(apple.textContent).toBe('');

    // And the button reaches the provider it names — a mark wired to the wrong
    // provider would satisfy every assertion above.
    await userEvent.click(google);
    expect(social).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'google' }),
    );
    await userEvent.click(apple);
    expect(social).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'apple' }),
    );
  });

  /**
   * 13.326 — passkey is offered through WebAuthn conditional mediation, not a
   * button. `autoFill: true` is the whole point: it asks the browser to surface a
   * REGISTERED passkey through the email field's autofill and to show nothing at
   * all when the user has none.
   *
   * Asserting the call is made is not enough on its own — `signIn.passkey()`
   * with no argument would also be "called" — so the ARGUMENT is asserted. That
   * is the difference between conditional UI and the dead modal-triggering call
   * this replaces.
   */
  it('13.326 asks for a passkey through conditional mediation, with no button', async () => {
    render(<SignInPage />);
    await waitFor(() => {
      expect(passkey).toHaveBeenCalledWith({ autoFill: true });
    });
    expect(screen.queryByRole('button', { name: /passkey/i })).toBeNull();
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

  /* Reset the query between tests. Without this the hostile `?next=` cases leak
     into every test after them, and those tests would still pass — because the
     guard neutralises the hostile value — which is precisely the shape of a
     test passing for a reason unrelated to what it names. */
  beforeEach(() => {
    query.current = new URLSearchParams();
  });

  /**
   * 13.271 — the callbackURL the page sends is ABSOLUTE on the web origin, not a
   * relative path. Asserted inside the two flows below; this comment is the
   * catalogue anchor for both.
   *
   * 13.272 — `?next=` is constrained to a same-site PATH before it is used, so a
   * protocol-relative or absolute value cannot steer either the post-sign-in
   * redirect or the authenticated callback off-site.
   */
  it.each([
    ['//evil.example/steal', 'protocol-relative'],
    ['https://evil.example/steal', 'absolute'],
    ['/\\evil.example/steal', 'backslash-authority'],
    ['not-a-path', 'schemeless junk'],
  ])('a %s ?next= is ignored (%s) and cannot steer the callback off-site', async (hostile) => {
    query.current = new URLSearchParams(`next=${hostile}`);
    const user = userEvent.setup();
    render(<SignInPage />);
    await user.click(screen.getByRole('tab', { name: 'Email link' }));
    await user.type(screen.getByLabelText('Email'), 'anselma@example.com');
    await user.click(screen.getByRole('button', { name: 'Send magic link' }));

    const sent = magicLink.mock.calls.at(-1)?.[0];
    /* The whole URL, not just its origin — and that distinction was found by
       MUTATION rather than by inspection. Removing the guard and asserting only
       the ORIGIN left `not-a-path` green, because `new URL('not-a-path', origin)`
       resolves same-origin: three of the four shapes killed the mutant and the
       fourth could not, an assertion that cannot fail hiding inside a set that
       can. Pinning the resolved URL makes every row falsifiable — without the
       guard this one becomes `…/not-a-path`. */
    expect(
      sent?.callbackURL,
      `?next=${hostile} steered the authenticated callback to ${sent?.callbackURL}. ` +
        'better-auth would refuse to send a token off-origin, but the guarantee belongs here — ' +
        'and an on-origin path is not refused by anything at all.',
    ).toBe('http://localhost:3000/workspaces');
  });

  it('magic-link flow sends the email', async () => {
    const user = userEvent.setup();
    render(<SignInPage />);
    await user.click(screen.getByRole('tab', { name: 'Email link' }));
    await user.type(screen.getByLabelText('Email'), 'anselma@example.com');
    await user.click(screen.getByRole('button', { name: 'Send magic link' }));
    /* ABSOLUTE, against the origin this page is served from — jsdom's default
       `http://localhost:3000`. The literal is asserted rather than rebuilt from
       `window.location.origin`, which would restate the implementation and pass
       for a relative value too. Case 13.268 pins the SERVER's side: that an
       absolute callback at WEB_ORIGIN is actually accepted. */
    expect(magicLink).toHaveBeenCalledWith({
      email: 'anselma@example.com',
      callbackURL: 'http://localhost:3000/workspaces',
    });
    const sent = magicLink.mock.calls[0]?.[0];
    expect(
      sent?.callbackURL.startsWith('/'),
      'callbackURL is relative again. The browser resolves it against the API origin the emailed ' +
        'link points at, which is how every magic-link sign-in ended on the API JSON 404.',
    ).toBe(false);
  });

  /**
   * The social callback, which is the half of 13.271 that reaches a PROVIDER
   * rather than an inbox — and it now needs the server to say Google is
   * available before the button it clicks exists at all.
   *
   * The passkey half moved OUT of this case. It used to click
   * `Sign in with a passkey` and assert `passkey` was called with no argument,
   * which is exactly the call that shipped a dead control: it opens a modal
   * asking for a credential no user in this product can hold. 13.326 asserts the
   * replacement — `{ autoFill: true }`, conditional mediation — and asserts the
   * argument rather than the call, because a bare `passkey()` would satisfy
   * "was called" while being the thing that was wrong.
   */
  it('13.271 the Google button carries the absolute web-origin callback', async () => {
    serverOffers({ google: true, apple: false });
    const user = userEvent.setup();
    render(<SignInPage />);
    await user.click(await screen.findByRole('button', { name: 'Continue with Google' }));
    expect(social).toHaveBeenCalledWith({
      provider: 'google',
      callbackURL: 'http://localhost:3000/workspaces',
    });
  });
});
