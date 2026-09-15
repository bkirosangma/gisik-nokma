'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button, Card, SegmentedControl } from '@gisik-nokma/ui';
import { authClient } from '../../src/auth-client.js';

type Method = 'phone' | 'email';

/**
 * `useSearchParams()` opts a client page out of static prerendering, and Next 15
 * makes that an ERROR at `next build` — "useSearchParams() should be wrapped in
 * a suspense boundary at page /sign-in" — rather than a warning. The default
 * export is therefore the boundary and the form is the child that reads the
 * query. Same shape on the project page, for the same reason.
 */
export default function SignInPage() {
  return (
    <Suspense fallback={<main className="gn-shell gn-shell--centred" />}>
      <SignInForm />
    </Suspense>
  );
}

/**
 * WHERE THE USER LANDS AFTER THE LINK IS VERIFIED — and why a relative path was
 * the wrong thing to hand better-auth.
 *
 * `callbackURL` is resolved by the BROWSER at the moment the magic-link token is
 * verified, and at that moment the browser is sitting on the API origin, because
 * the link in the email points at `BETTER_AUTH_URL`. A relative `/workspaces`
 * therefore resolves against the API, not the app: the owner signed in by hand
 * on 2026-09-08 and landed on the API's JSON 404. Measured on the dev stack:
 * `:3001/workspaces` → 200, `:3000/workspaces` → 404.
 *
 * **This is not a dev-stack artefact.** `deploy/do/app.yaml` puts production on
 * two sibling subdomains — `pm.artsourced.in` for the web app and
 * `pm-api.artsourced.in` for the API — which is the same split. Every
 * magic-link sign-in in production ended on raw JSON at the API host, which is
 * the first thing a new user would ever have seen.
 *
 * So the callback is made ABSOLUTE against the origin this page is served from.
 * `window.location.origin` is the web origin by definition — there is no env var
 * to drift out of sync with reality. better-auth accepts it because
 * `WEB_ORIGIN` is in `trustedOrigins` (`apps/server/src/auth/auth.ts:83`);
 * that is verified by cases 13.268/13.269 rather than assumed, and the
 * refusal side is pinned too, because "it is accepted" alone would also be true
 * of a build that had stopped checking.
 */
function webOriginCallback(path: string): string {
  // Only ever called from an event handler, so `window` exists. Computing it at
  // render time would break Next's prerender of this route.
  return new URL(path, window.location.origin).toString();
}

/**
 * `?next=` is attacker-controllable, so it is constrained to a PATH ON THIS SITE
 * before it is used — and this guard is load-bearing precisely BECAUSE of the
 * change above.
 *
 * A bare `next` was already handed to `router.push`, where `//evil.example` is
 * protocol-relative and navigates off-site. Making the callback absolute would
 * additionally have fed `new URL()` an attacker's absolute URL, turning a
 * client-side redirect into an authenticated one. better-auth's own
 * `isTrustedOrigin` would refuse to send a token there, but relying on a
 * library's check to cover a hole this file opened is the wrong place to put
 * the guarantee.
 *
 * Accepted: exactly one leading `/`, no scheme and no authority. Everything else
 * falls back to the default rather than erroring — a mangled `next` should sign
 * you in and drop you home, not refuse to sign you in.
 */
const DEFAULT_NEXT = '/workspaces';

function samePathOnly(raw: string | null): string {
  if (raw === null || !raw.startsWith('/')) return DEFAULT_NEXT;
  // `//host` is protocol-relative; `/\host` is treated as `//host` by browsers.
  if (raw.startsWith('//') || raw.startsWith('/\\')) return DEFAULT_NEXT;
  return raw;
}

/**
 * WHICH SOCIAL METHODS THIS SERVER WILL ACTUALLY ACCEPT.
 *
 * This page used to render `Continue with Google` unconditionally. On the dev
 * stack `GOOGLE_CLIENT_ID` is unset, so that button failed at the server for
 * every user who pressed it — the owner found it by clicking it. A control that
 * can never succeed and is shown anyway is the audit's own principle inverted.
 *
 * The answer comes from the server rather than a `NEXT_PUBLIC_*` build flag,
 * because a build flag is baked into a bundle at image-build time and read by a
 * browser that may be talking to a server deployed later with different secrets.
 * `GET /v1/auth/methods` reads `auth.options.socialProviders` off the running
 * instance (`apps/server/src/routes/auth-methods.ts`), so it cannot drift.
 *
 * `null` while the answer is in flight, and `null` renders NOTHING. That is the
 * conservative default and it is the right one here: a brief absence is a button
 * that appears a moment late, while a brief presence is a button that works for
 * nobody and is the defect being fixed. Same reasoning if the fetch fails — a
 * server that cannot tell us which methods it accepts is not a server we should
 * be guessing on behalf of. Phone and email are unaffected either way; they need
 * no provider and are never gated by this.
 */
type AuthMethods = { google: boolean; apple: boolean; phone: boolean };

function useAuthMethods(): AuthMethods | null {
  const [available, setAvailable] = useState<AuthMethods | null>(null);

  useEffect(() => {
    // `/v1/*` is rewritten to the API by `next.config.ts`, so this is
    // same-origin and needs no base URL — the same path `authClient` relies on.
    const controller = new AbortController();
    void fetch('/v1/auth/methods', { signal: controller.signal })
      .then(async (response) => (response.ok ? ((await response.json()) as AuthMethods) : null))
      .then((answer) => {
        if (answer !== null) setAvailable(answer);
      })
      .catch(() => {
        // Deliberately silent, and deliberately NOT `setError`. A refusal here
        // is not something the person signing in can act on, and the two methods
        // that need no provider still work. It stays `null`, so nothing renders.
      });
    return () => controller.abort();
  }, []);

  return available;
}

/**
 * Apple's logo mark, INLINE and monochrome.
 *
 * The opposite exit from Google's, and for a measured reason. The colour-literal
 * gate (`packages/ui/test/token-discipline.test.ts`) scans `apps/web/app` and
 * reports a hit for `fill="#4285F4"` inside TSX — a JSX attribute is a string
 * literal to that scanner — but reports NOTHING for `fill="currentColor"`. Both
 * were run against `findColourLiterals` before either mark was written.
 *
 * So Google's four-colour mark is a file under `public/` (outside the scan
 * roots) and Apple's lives here, where `currentColor` also does the job the
 * file could not: Apple's HIG asks for a black mark on light surfaces and a
 * white one on dark, and this product ships both themes. A fixed-colour asset
 * would be wrong in one of them.
 */
function AppleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">
      <path d="M17.05 12.54c-.02-2.2 1.8-3.26 1.88-3.31-1.02-1.5-2.61-1.7-3.18-1.72-1.35-.14-2.64.8-3.33.8-.69 0-1.75-.78-2.87-.76-1.48.02-2.84.86-3.6 2.18-1.53 2.66-.39 6.6 1.1 8.76.73 1.06 1.6 2.25 2.74 2.2 1.1-.04 1.52-.71 2.85-.71 1.33 0 1.7.71 2.86.69 1.18-.02 1.93-1.08 2.65-2.14.84-1.23 1.18-2.42 1.2-2.48-.03-.01-2.3-.88-2.3-3.51zM14.88 5.6c.6-.74 1.01-1.76.9-2.78-.87.04-1.93.58-2.56 1.31-.56.65-1.06 1.69-.92 2.69.97.07 1.97-.49 2.58-1.22z" />
    </svg>
  );
}

function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = samePathOnly(searchParams.get('next'));
  const social = useAuthMethods();

  /**
   * PHONE IS OFFERED ONLY WHERE A CODE CAN ARRIVE, and `method` is DERIVED
   * rather than stored, which is what makes the bad state unreachable instead
   * of merely unlikely.
   *
   * The stored-state version — `useState<Method>('phone')` corrected by an
   * effect when availability lands — has a window in which `method` is
   * `'phone'` and the Phone tab is not rendered. What the user sees there is a
   * card with no form in it at all: the tab that would switch back does not
   * exist, so it is not even recoverable. Deriving it means "no phone tab" and
   * "phone form showing" cannot both be true, for any ordering of the fetch,
   * any re-render, and any future edit that adds another `setMethod` call.
   *
   * `null` (in flight, or the fetch failed) reads as UNAVAILABLE, which is the
   * same conservative default the hook above already documents for the social
   * buttons: a method that appears a moment late is a smaller fault than one
   * that is offered and refused. Email link needs no channel and always works,
   * so the page is never empty while it waits.
   */
  const phoneAvailable = social?.phone === true;
  const [chosen, setChosen] = useState<Method | null>(null);
  const method: Method = phoneAvailable ? (chosen ?? 'phone') : 'email';
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [email, setEmail] = useState('');
  const [emailSent, setEmailSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fail = (message: string | undefined) => setError(message ?? 'Sign-in failed. Try again.');

  /**
   * PASSKEY: THE BUTTON IS BACK, BECAUSE REGISTRATION NOW EXISTS — AND IT IS A
   * CLICK, NEVER CONDITIONAL MEDIATION. The measurement that removed it is the
   * measurement that shapes it, so it is kept in full below.
   *
   * ## Why it was gone, and what changed
   *
   * There was a `Sign in with a passkey` button and it could not work for ANY
   * user ANYWHERE: **there was no passkey registration flow anywhere in app
   * code**, so nobody could hold a passkey to sign in with. `rpID` was already
   * correct (`auth.ts`, `new URL(baseUrl).hostname`) and WebAuthn already
   * wired; the credential simply could not exist. The button was removed, and
   * the offer was owed back to the day a person could actually register one.
   *
   * That day is this change. `/account`'s Passkeys section
   * (`packages/app-core/src/account/passkeys-section.tsx`, wired through
   * `apps/web/src/account/account-clients.ts`) registers credentials through
   * `authClient.passkey.addPasskey`, so the offer below now has a population it
   * can serve. `docs/manual.md` and `docs/faq.md` have described this button in
   * these exact words the whole time; they become accurate again here rather
   * than being edited.
   *
   * ## AN EXPLICIT CLICK, NOT `autoFill: true` — and this is the security
   * ## property of the change, not a styling preference
   *
   * The instruction this restores asked for WebAuthn conditional mediation:
   * `signIn.passkey({ autoFill: true })` issued on page load, surfacing a
   * credential through the email field's autofill. **That cannot ship, and the
   * numbers are production's own.**
   *
   * `signInPasskey` in `@better-auth/passkey@1.7.2` issues
   * `GET /passkey/generate-authenticate-options` as its FIRST statement, before
   * any capability check — re-read in the installed `dist/client.mjs` for this
   * change, not taken on trust from the earlier note. That path is under
   * `/api/auth/*`, which `app.ts` charges against the shared `auth:` bucket —
   * `RATE_LIMIT_AUTH_MAX` is **10** per 60s in `deploy/do/app.yaml`. A reviewer
   * drove ten such probes through the assembled app and the eleventh real
   * `POST /sign-in/magic-link` answered **429**, with a control run at zero
   * probes answering 500 (offline DB) and not 429 — so the refusal was
   * attributable to the probes and nothing else. That witness now lives in the
   * suite rather than in a review comment:
   * `apps/server/test/http/security-middleware.test.ts`, the
   * "anonymous /sign-in page load" cases.
   *
   * And the budget is SHARED. `http/rate-limit.ts` records as measured that the
   * dev stack raised `AUTH_MAX` to 60 "because its web container proxies every
   * browser into a single client key". Production has the same topology. So the
   * cost of a mount-time request is not one user's own budget; it is everyone's
   * — an anonymous visitor who merely OPENS this page could refuse somebody
   * else's magic link.
   *
   * **So the rule this page must keep is: an anonymous `/sign-in` load charges
   * the `auth:` bucket ZERO times.** A click-triggered call satisfies it
   * trivially and unarguably — `signIn.passkey` is reachable from exactly one
   * place, the `onClick` below. It is in no effect, no `useMemo`, no render
   * path, and `autoFill` is passed **`false`** explicitly rather than omitted,
   * so a future reader cannot mistake the default for a decision. Case 13.326
   * in `test/sign-in.test.tsx` asserts both halves: not called on mount, called
   * once with `{ autoFill: false }` on click.
   *
   * A click is also the honest interaction here. Conditional mediation is a
   * silent offer that appears only if the browser happens to hold a credential;
   * a button is a control whose presence is a promise the product can keep for
   * everybody, including the person who has not registered one yet and needs to
   * be told so (the refusal renders below, verbatim).
   *
   * *(One limb of the original finding was refuted and is recorded so nobody
   * builds against it: the challenge rows are NOT unbounded.
   * `findVerificationValue` sweeps expired rows globally on every call and
   * `disableCleanup` is unset, and phone-OTP verification calls it — so they
   * are reclaimed opportunistically rather than never. No cleanup job is owed.)*
   *
   * The email input keeps `autocomplete="username webauthn"`. It costs nothing,
   * it is correct, and it is the half that must already be in place if
   * conditional mediation is ever switched on deliberately — which would need
   * the rate-limit question answered first, not inherited from this change.
   */

  return (
    <main className="gn-shell gn-shell--centred">
      <header className="gn-page-header">
        <div className="gn-page-header__icon" aria-hidden="true">
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H10l2 2.5h6.5A1.5 1.5 0 0 1 20 8v10.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5Z" />
            <path d="M8 13h8" /><path d="M8 16.5h5" />
          </svg>
        </div>
        <h1 className="gn-page-header__title">Gisik Nokma</h1>
        <p className="gn-page-header__tagline">The keeper of memory</p>
      </header>
      <Card className="gn-sign-in">
        {/*
          No control at all when phone is unavailable, rather than a control
          with one option. A segmented control offering a single choice is a
          control that cannot control anything — it asks the user to make a
          decision that has already been made — and it is the same defect this
          round exists to remove, one layer up from the tab itself. Dropping it
          also takes the `tab` roles out of the accessibility tree, which is why
          the `/sign-in` accessible-names baseline falls in this change; that is
          a dead control leaving, not a ratchet going slack.
        */}
        {phoneAvailable ? (
          <SegmentedControl
            aria-label="Sign-in method"
            value={method}
            onChange={setChosen}
            options={[
              { value: 'phone', label: 'Phone' },
              { value: 'email', label: 'Email link' },
            ]}
          />
        ) : null}

        {method === 'phone' ? (
          <div className="gn-sign-in__method">
            <label className="gn-field">
              <span className="gn-field__label">Phone number</span>
              <input
                className="gn-field__input"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="+91…"
              />
            </label>
            {!codeSent ? (
              <Button
                variant="primary"
                onClick={() =>
                  void authClient.phoneNumber
                    .sendOtp({ phoneNumber: phone })
                    .then(({ error: sendError }) =>
                      sendError ? fail(sendError.message) : setCodeSent(true),
                    )
                }
              >
                Send code
              </Button>
            ) : (
              <>
                <label className="gn-field">
                  <span className="gn-field__label">One-time code</span>
                  <input
                    className="gn-field__input"
                    value={code}
                    onChange={(event) => setCode(event.target.value)}
                  />
                </label>
                <Button
                  variant="primary"
                  onClick={() =>
                    void authClient.phoneNumber
                      .verify({ phoneNumber: phone, code })
                      .then(({ error: verifyError }) =>
                        verifyError ? fail(verifyError.message) : router.push(next),
                      )
                  }
                >
                  Verify and sign in
                </Button>
              </>
            )}
          </div>
        ) : (
          <div className="gn-sign-in__method">
            <label className="gn-field">
              <span className="gn-field__label">Email</span>
              <input
                className="gn-field__input"
                type="email"
                /* The `webauthn` token is what the conditional-mediation request
                   above attaches to. Without it the browser has no field to
                   offer a passkey through and `autoFill: true` does nothing. */
                autoComplete="username webauthn"
                /* Verbatim from the owner's neo prototype
                   (`design-system/interactive/desktop.dc.html:149`), an
                   ADDITION rather than a copy change — the shipped input had
                   no placeholder at all. */
                placeholder="you@example.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
            {emailSent ? (
              <p>Check your inbox — the link signs you in.</p>
            ) : (
              <>
                <p className="gn-sign-in__hint">
                  We&rsquo;ll email you a link that signs you in. It expires in 15 minutes.
                </p>
                <Button
                  variant="primary"
                  onClick={() =>
                    void authClient.signIn
                      .magicLink({ email, callbackURL: webOriginCallback(next) })
                      .then(({ error: linkError }) =>
                        linkError ? fail(linkError.message) : setEmailSent(true),
                      )
                  }
                >
                  Send magic link
                </Button>
              </>
            )}
          </div>
        )}

        {/* THE PASSKEY ENTRY POINT. Deliberately OUTSIDE the social row below:
            that row is gated on `GET /v1/auth/methods` answering that a
            provider is configured, and a passkey needs no provider and no
            server capability check at all — gating it on the social answer
            would make it vanish on the dev stack, which is the exact shape of
            "a control that exists only where it was not needed".

            Its own `.gn-sign-in__alternatives` block, not the social one's:
            reusing that element would put this button inside the container
            case 13.326 asserts is absent when neither provider is available.

            No `disabled` state and no capability probe: `signIn.passkey`'s
            own refusal path is what tells a person without a credential, and
            it renders in the shared `role="alert"` at the foot of this card.
            Asking the browser whether a passkey exists is precisely the
            conditional-mediation request the docblock above refuses. */}
        <div className="gn-sign-in__alternatives">
          <Button
            onClick={() =>
              void authClient.signIn
                // `autoFill: false` EXPLICITLY. Omitting it would reach the
                // same behaviour through a library default, and this argument
                // is the one thing standing between a click and the
                // mount-time conditional-mediation request that spends a
                // shared sign-in budget for every anonymous page load.
                .passkey({ autoFill: false })
                .then(({ error: passkeyError }) =>
                  passkeyError
                    ? fail(passkeyError.message ?? 'That passkey was not accepted.')
                    : router.push(next),
                )
            }
          >
            Sign in with a passkey
          </Button>
        </div>

        {/* Rendered only for providers this server will actually accept, and
            only once it has said so. `social === null` is both "still asking"
            and "could not ask", and both render nothing — see
            `useSocialAvailability`. The whole row disappears when neither is
            available, rather than leaving an empty separator above nothing. */}
        {social !== null && (social.google || social.apple) ? (
          <div className="gn-sign-in__alternatives">
            <p className="gn-sign-in__hint">Or continue with</p>
            <div className="gn-sign-in__marks">
              {social.google ? (
                <Button
                  className="gn-sign-in__mark"
                  /* THE VISIBLE TEXT GOES AND THE ACCESSIBLE NAME STAYS, and it
                     stays as the EXACT shipped wording. The owner asked for logo
                     marks; the copy rule's "keep the shipped wording" is
                     satisfied where it matters, because `aria-label` is what a
                     screen reader announces and what `getByRole('button', {
                     name: 'Continue with Google' })` resolves — so 13.292's
                     locator still finds this control after the restyle. */
                  aria-label="Continue with Google"
                  onClick={() =>
                    void authClient.signIn
                      .social({ provider: 'google', callbackURL: webOriginCallback(next) })
                      .then(({ error: socialError }) =>
                        socialError ? fail(socialError.message) : undefined,
                      )
                  }
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/google-mark.svg" alt="" width={18} height={18} />
                </Button>
              ) : null}
              {social.apple ? (
                <Button
                  className="gn-sign-in__mark"
                  aria-label="Continue with Apple"
                  onClick={() =>
                    void authClient.signIn
                      .social({ provider: 'apple', callbackURL: webOriginCallback(next) })
                      .then(({ error: socialError }) =>
                        socialError ? fail(socialError.message) : undefined,
                      )
                  }
                >
                  <AppleMark />
                </Button>
              ) : null}
            </div>
          </div>
        ) : null}

        {error !== null ? (
          <p role="alert" className="gn-shell__refusal">
            {error}
          </p>
        ) : null}
      </Card>
      <p className="gn-sign-in__legal">
        By continuing you agree to the <Link href="/terms">Terms</Link> and{' '}
        <Link href="/privacy">Privacy notice</Link>.
      </p>
    </main>
  );
}
