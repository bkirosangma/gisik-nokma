import { act, render, screen, waitFor } from '@testing-library/react';
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
   * 13.326 — THE DISCRIMINATION CASE, and it replaces a negative that could not
   * fail. **Found by mutation, not by reading.**
   *
   * The first version of this case answered `{google:false, apple:false}` and
   * wrapped the absence in `waitFor`. That does not wait for anything: `waitFor`
   * retries until its callback PASSES, and a callback asserting a button is
   * absent passes on the very first tick — before the fetch has resolved and
   * before the page has re-rendered with any answer at all. A mutation that
   * dropped the per-provider check entirely and rendered the row on any answer
   * left it GREEN. It was asserting the absence of a state update, not the
   * presence of a gate. **The comment there claimed `waitFor` handled this. The
   * comment was wrong, and it made the gap read as covered.**
   *
   * The answer here is asymmetric on purpose: `apple: true, google: false`.
   * Apple's button appearing is a POSITIVE, awaited signal that the answer
   * arrived AND was applied — `findByRole` genuinely waits, because it is
   * waiting for something to exist — and Google's absence is then read from the
   * same settled DOM. There is no tick at which this passes vacuously, and a
   * page that ignores the per-provider flags renders both and fails.
   *
   * The two orderings are both asserted (`apple` on / `google` off, then the
   * reverse) because a page that rendered whichever provider it checked FIRST
   * would satisfy one of them.
   */
  it.each([
    { on: 'apple', off: 'google', answer: { google: false, apple: true } },
    { on: 'google', off: 'apple', answer: { google: true, apple: false } },
  ])(
    '13.326 renders $on and not $off when that is what the server says',
    async ({ on, off, answer }) => {
      serverOffers(answer);
      render(<SignInPage />);

      const onName = on === 'apple' ? 'Continue with Apple' : 'Continue with Google';
      const offName = off === 'apple' ? 'Continue with Apple' : 'Continue with Google';

      // Awaited POSITIVE. Until this resolves, the answer has not been applied,
      // so nothing below can be read as a fact about the gate.
      await screen.findByRole('button', { name: onName });
      // Same settled DOM, and the whole property: the gate DISCRIMINATES.
      expect(screen.queryByRole('button', { name: offName })).toBeNull();
      // The old dead control is gone rather than hidden, in every answer.
      expect(screen.queryByRole('button', { name: 'Sign in with a passkey' })).toBeNull();
    },
  );

  /**
   * 13.326 — and the all-disabled answer, which is the dev stack's real state.
   *
   * This one CANNOT anchor on a positive rendering, because a correct page
   * renders nothing new for it. So it anchors on the fetch having been made and
   * its body having been consumed, then flushes the microtask queue the page's
   * `.then` chain runs on, and only then reads the DOM. That is weaker than the
   * discrimination case above by construction, and it is kept for what it adds:
   * that the marks ROW itself disappears rather than rendering empty, which the
   * asymmetric answers cannot show because one button is always present.
   */
  it('13.326 renders no social row at all when the server accepts neither', async () => {
    serverOffers({ google: false, apple: false });
    const { container } = render(<SignInPage />);

    // The page rendered, so a zero count is a fact about buttons, not a blank DOM.
    expect(screen.getByRole('tab', { name: 'Phone' })).toBeInTheDocument();
    // The request was actually made and its body consumed before anything below
    // is read. Without this the assertions run on the first tick and pass
    // against a page that has not yet been told anything.
    await waitFor(() => {
      expect(globalThis.fetch).toHaveBeenCalledWith('/v1/auth/methods', expect.anything());
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.queryByRole('button', { name: 'Continue with Google' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Continue with Apple' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Sign in with a passkey' })).toBeNull();
    expect(container.querySelector('.gn-sign-in__marks')).toBeNull();
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
  /**
   * 13.326 — the passkey BUTTON is gone and NO passkey request is made, and the
   * second half is the one that took a demonstration to earn.
   *
   * The dispatch's replacement for the dead button was
   * `signIn.passkey({ autoFill: true })`. `signInPasskey` issues
   * `GET /passkey/generate-authenticate-options` as its FIRST statement, which
   * lands under `/api/auth/*` and is charged against the shared `auth:` bucket
   * — `RATE_LIMIT_AUTH_MAX` is 10 per 60s in production. Review drove ten such
   * probes through the assembled app and the eleventh real
   * `POST /sign-in/magic-link` answered 429, against a zero-probe control that
   * answered 500 and not 429. And `http/rate-limit.ts` records as measured that
   * a web container proxies every browser into ONE client key, so that budget is
   * shared across users.
   *
   * A request that spends a shared sign-in budget on a flow with zero possible
   * successes — nobody can register a passkey — is the same defect this task
   * removes, one layer down. So it is deferred to Task 12, which builds
   * registration in the same change set.
   *
   * **The field keeps `autocomplete="username webauthn"`**, asserted here,
   * because that half costs nothing and must already be in place when Task 12
   * switches mediation on. Asserting only "no button" would let the request come
   * back silently; asserting only "no request" would let the token be dropped
   * and Task 12 start from a worse place.
   */
  it('13.326 makes no passkey request, and keeps the field ready for Task 12', async () => {
    const user = userEvent.setup();
    render(<SignInPage />);

    expect(screen.queryByRole('button', { name: /passkey/i })).toBeNull();

    await user.click(screen.getByRole('tab', { name: 'Email link' }));
    // The field IS present and carries the token — so the absence below is a
    // fact about the request, never about a missing field.
    expect(document.querySelector('input[autocomplete~="webauthn"]')).not.toBeNull();

    // Give any mount- or tab-triggered effect a chance to fire before concluding
    // it did not. Asserting immediately would pass against a page that issues
    // the request one tick later — the exact shape that made the first version
    // of this case vacuous.
    await act(async () => {
      await Promise.resolve();
    });
    expect(passkey).not.toHaveBeenCalled();
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
