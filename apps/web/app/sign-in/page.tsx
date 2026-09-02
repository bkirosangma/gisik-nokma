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

function SignInForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get('next') ?? '/workspaces';
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
                    .magicLink({ email, callbackURL: next })
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
                .social({ provider: 'google', callbackURL: next })
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
