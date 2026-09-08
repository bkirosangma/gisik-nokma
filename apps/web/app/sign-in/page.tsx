'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button, Card } from '@gisik-nokma/ui';
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
    <Suspense fallback={<main className="gn-shell" />}>
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

function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = samePathOnly(searchParams.get('next'));
  const [method, setMethod] = useState<Method>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [email, setEmail] = useState('');
  const [emailSent, setEmailSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fail = (message: string | undefined) => setError(message ?? 'Sign-in failed. Try again.');

  return (
    <main className="gn-shell">
      <h1 className="gn-page-title">Gisik Nokma</h1>
      <Card className="gn-sign-in">
        <div role="tablist" className="gn-view-tabs">
          <button
            role="tab"
            type="button"
            aria-selected={method === 'phone'}
            onClick={() => setMethod('phone')}
          >
            Phone
          </button>
          <button
            role="tab"
            type="button"
            aria-selected={method === 'email'}
            onClick={() => setMethod('email')}
          >
            Email link
          </button>
        </div>

        {method === 'phone' ? (
          <div className="gn-sign-in__method">
            <label>
              Phone number
              <input
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
                <label>
                  One-time code
                  <input value={code} onChange={(event) => setCode(event.target.value)} />
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
            <label>
              Email
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
            {emailSent ? (
              <p>Check your inbox — the link signs you in.</p>
            ) : (
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
            )}
          </div>
        )}

        <div className="gn-sign-in__alternatives">
          <Button
            onClick={() =>
              void authClient.signIn
                .social({ provider: 'google', callbackURL: webOriginCallback(next) })
                .then(({ error: socialError }) =>
                  socialError ? fail(socialError.message) : undefined,
                )
            }
          >
            Continue with Google
          </Button>
          <Button
            onClick={() =>
              void authClient.signIn.passkey().then((result) => {
                if (result?.error) fail(result.error.message);
                else router.push(next);
              })
            }
          >
            Sign in with a passkey
          </Button>
        </div>

        {error !== null ? (
          <p role="alert" className="gn-shell__refusal">
            {error}
          </p>
        ) : null}
      </Card>
    </main>
  );
}
