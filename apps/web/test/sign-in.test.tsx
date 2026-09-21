import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
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
  // Required by `LastProjectNav` (via `AppNav`), which reads the route's project
  // id. A partial mock of a module a component calls is an import-time throw.
  useParams: () => ({}),
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
function serverOffers(answer: { google: boolean; apple: boolean; phone?: boolean }): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes('/v1/auth/methods')) {
        // `phone` defaults to FALSE for the same reason the social pair does:
        // that is the dev stack's real state (`selectOtpSender()` returns a
        // `NullOtpSender`), and a default matching a hypothetical SMS-enabled
        // deployment would make every case below pass for a reason unrelated to
        // what it names. A case that wants the Phone tab asks for it.
        return new Response(JSON.stringify({ phone: false, ...answer }), {
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
   * methods that can work are offered**. Email link needs no channel and is the
   * one unconditional method; the social pair is gated on the server's own
   * answer; passkey has no entry point until Task 12 restores it with
   * registration.
   *
   * **AMENDED AGAIN (round 2c), and the sentence this replaces is the finding.**
   * It read *"Phone and email need no provider and are unconditional"*. Phone
   * was never unconditional — it only looked that way because the page offered
   * it unconditionally. `selectOtpSender()` returns a `NullOtpSender` that
   * refuses every code with 501, so the Phone tab was the same dead control the
   * Google button and the passkey button were, and this case's own NAME
   * asserted the defect. Phone is now gated on `GET /v1/auth/methods`, and both
   * directions are asserted below, because the false half alone would pass
   * against a page that had simply deleted phone sign-in.
   *
   * The password absence is unchanged and still asserted: `auth.ts:84` sets
   * `emailAndPassword: { enabled: false }` with "the spec forbids passwords", so
   * the prototype's Password tab is not merely absent but forbidden.
   *
   * 13.348 (Task 15, neo restyle) — this test is UNCHANGED and still green:
   * the property it pins ("exactly the methods that can work are offered")
   * is exactly what 13.348 requires to survive a CSS-only restyle, and this
   * page's markup was not touched in that task.
   */
  it('3.84 offers magic link always, phone only where SMS can deliver, and nothing password-shaped', async () => {
    render(<SignInPage />);
    // The dev stack's real state: no SMS channel. Email is the method, and there
    // is no segmented control at all — a control with one option asks the user
    // to make a decision that has already been made.
    expect(await screen.findByLabelText('Email')).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Phone' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Phone number')).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /password/i })).not.toBeInTheDocument();

    cleanup();
    serverOffers({ google: false, apple: false, phone: true });
    render(<SignInPage />);
    // And where a code CAN arrive the tab is back and phone is the default, so
    // this case cannot be satisfied by deleting phone sign-in altogether.
    expect(await screen.findByRole('tab', { name: 'Phone' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Email link' })).toBeInTheDocument();
    expect(screen.getByLabelText('Phone number')).toBeInTheDocument();
  });

  /**
   * 13.361 (Round 2d, 2026-09-09) — the email placeholder, an ADDITION verbatim
   * from the owner's neo prototype (`design-system/interactive/desktop.dc.html:149`
   * has `placeholder="you@example.com"` on the same field). The shipped input had
   * no placeholder before this change, so this is new coverage, not a regression
   * guard on existing behaviour.
   */
  it('13.361 the email field carries the neo prototype\'s placeholder verbatim', () => {
    render(<SignInPage />);
    expect(screen.getByLabelText('Email')).toHaveAttribute('placeholder', 'you@example.com');
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
      // UPDATED, Task 8: this line used to assert the passkey button was
      // ABSENT. It is back — registration now exists on `/account`, so the
      // offer has a population it can serve. What the line is FOR here is
      // unchanged and is why it was not simply deleted: the passkey button
      // must NOT be gated on the social answer, because a passkey needs no
      // provider. It is present under BOTH asymmetric answers.
      expect(
        screen.getByRole('button', { name: 'Sign in with a passkey' }),
      ).toBeInTheDocument();
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
    // The Email form still renders; the point of this case is that NO social row does.
    expect(await screen.findByLabelText('Email')).toBeInTheDocument();
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
    // UPDATED, Task 8, and this is the sharpest place the change is visible:
    // the dev stack's real answer offers NEITHER provider, and the passkey
    // button is still here. It lives in its own `.gn-sign-in__alternatives`
    // block rather than inside the social row, which is what keeps the
    // `.gn-sign-in__marks` assertion below true and meaningful.
    expect(screen.getByRole('button', { name: 'Sign in with a passkey' })).toBeInTheDocument();
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
   * 13.326, REWRITTEN for Task 8 — the passkey button is BACK, and the property
   * this case pins is no longer "no request" but **"no request until a click"**.
   *
   * ## Why the button returned
   *
   * It was removed because it could not work for anybody: there was no passkey
   * registration flow in app code, so no user could hold a credential to sign
   * in with. Task 8 builds registration on `/account`, so the offer now has a
   * population it can serve — and `docs/manual.md`/`docs/faq.md` have described
   * this exact button, in these exact words, the whole time.
   *
   * ## Why NOT conditional mediation, which is what the original instruction
   * ## asked for — the constraint this case exists to defend
   *
   * `signInPasskey` in `@better-auth/passkey@1.7.2` issues
   * `GET /passkey/generate-authenticate-options` as its FIRST statement (re-read
   * in the installed `dist/client.mjs` for this change, not inherited). That
   * path lands under `/api/auth/*` and is charged against the shared `auth:`
   * bucket — `RATE_LIMIT_AUTH_MAX` is 10 per 60s in production. Review drove ten
   * such probes through the assembled app and the eleventh real
   * `POST /sign-in/magic-link` answered 429, against a zero-probe control that
   * answered 500 and not 429; and `http/rate-limit.ts` records as measured that
   * a web container proxies every browser into ONE client key, so that budget is
   * shared across people. `autoFill: true` on mount would therefore let an
   * anonymous visitor who merely OPENS this page refuse somebody else's magic
   * link.
   *
   * That server-side witness now lives in the suite, at
   * `apps/server/test/http/security-middleware.test.ts` — it is not restated
   * here, because this file cannot see a request at all (see the mock's own
   * docblock above: `../src/auth-client.js` is replaced wholesale, so an
   * assertion here about `/api/auth/*` traffic would be vacuous by
   * construction). What this file CAN witness, and does, is the one fact that
   * makes the server-side charge zero: the page does not call the client on
   * mount.
   *
   * ## Both halves, because either alone is satisfiable by the wrong page
   *
   * "Not called on mount" alone is satisfied by a page with no button at all —
   * which is what shipped before this task and is the regression to guard
   * against in the other direction. "Called on click" alone is satisfied by a
   * page that ALSO fires on mount. And the ARGUMENT is asserted, not merely the
   * call: a bare `passkey()` or a `passkey({ autoFill: true })` would both count
   * as "called", and the second is precisely the thing that must not ship.
   */
  it('13.326 the passkey button exists and fires ONLY on click, never on mount', async () => {
    const user = userEvent.setup();
    render(<SignInPage />);

    const button = await screen.findByRole('button', { name: 'Sign in with a passkey' });

    // The field IS present and carries the token — so the absence below is a
    // fact about the request, never about a page that failed to render.
    expect(document.querySelector('input[autocomplete~="webauthn"]')).not.toBeNull();

    // Give any mount- or tab-triggered effect a chance to fire before concluding
    // it did not. Asserting immediately would pass against a page that issues
    // the request one tick later — the exact shape that made the first version
    // of this case vacuous.
    await act(async () => {
      await Promise.resolve();
    });
    expect(
      passkey,
      'the passkey client was called before any click. That is the ' +
        'conditional-mediation request this page must never make: it is charged to the shared ' +
        '`auth:` bucket, and an anonymous page load spending it can refuse somebody else\'s ' +
        'magic link.',
    ).not.toHaveBeenCalled();

    await user.click(button);
    // `autoFill: false` EXPLICITLY, not merely "called". The library's default
    // reaches the same behaviour, but an omitted argument is not a decision a
    // future reader can see — and `{ autoFill: true }` would satisfy a bare
    // "was called" assertion while being the exact thing that must not ship.
    expect(passkey).toHaveBeenCalledWith({ autoFill: false });
    expect(passkey).toHaveBeenCalledTimes(1);
  });

  it('phone flow: request the code, then verify it', async () => {
    // This flow only exists on a deployment with an SMS channel, so the case
    // says so rather than inheriting a default that no longer offers it.
    serverOffers({ google: false, apple: false, phone: true });
    const user = userEvent.setup();
    render(<SignInPage />);
    await user.type(await screen.findByLabelText('Phone number'), '+919812345678');
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
    // No tab to click: with no SMS channel there is no control, and Email link
    // is the method the page opens on.
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
    // No tab to click: with no SMS channel there is no control, and Email link
    // is the method the page opens on.
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
   * E5-33 — an EMPTY press does not leave the page.
   *
   * The control was a bare `<Button onClick>` rather than a submit, and the input
   * had no `required`, so pressing it with nothing typed called
   * `magicLink({ email: '' })`, round-tripped the server, and painted
   * better-call's own spelling into the card's `role="alert"`:
   * `[body.email] Invalid email address`.
   */
  it('E5-33 the email field is required inside a real form, so an empty press is refused locally', async () => {
    render(<SignInPage />);
    const email = await screen.findByLabelText('Email');
    expect(email).toBeRequired();
    // `required` only bites on a real SUBMIT, so the form is half the assertion —
    // a required input beside a non-submitting button would change nothing.
    expect(email.closest('form')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Send magic link' })).toHaveAttribute(
      'type',
      'submit',
    );
  });

  /**
   * The social callback, which is the half of 13.271 that reaches a PROVIDER
   * rather than an inbox — and it now needs the server to say Google is
   * available before the button it clicks exists at all.
   *
   * The passkey half moved OUT of this case and has stayed out. It used to
   * click `Sign in with a passkey` here and assert `passkey` was called with no
   * argument — which is exactly the call that shipped a dead control, opening a
   * modal for a credential no user could hold. 13.326 owns the passkey button
   * now, and asserts the ARGUMENT rather than the call (`{ autoFill: false }`,
   * a click and not conditional mediation), because a bare `passkey()` would
   * satisfy "was called" while being the thing that was wrong.
   *
   * There is no passkey `callbackURL` to assert alongside the Google one below:
   * `signIn.passkey` takes no callback at all — the ceremony finishes in the
   * browser and this page routes with `router.push(next)` through the same
   * `samePathOnly` guard the phone flow uses, so the hostile-`?next=` cases
   * above already cover that surface for it.
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
