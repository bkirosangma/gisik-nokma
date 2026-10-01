'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { Button, Card } from '@gisik-nokma/ui';
import { createHttpClient, HttpError } from '@gisik-nokma/app-core/online';
import { useSessionStatus } from '../../../src/providers.js';

/**
 * `/mcp/authorize` — the one place a person consents to an assistant acting as
 * them.
 *
 * ## This URL is the SERVER's, not this file's
 *
 * `POST /v1/mcp/device/code` hands the CLI
 * `verificationUri = ${WEB_ORIGIN}/mcp/authorize` — the WEB origin, never the
 * API's. Renaming this route segment breaks every code already minted, and no
 * test in this app would notice. It is one half of a contract the server has
 * already shipped.
 *
 * ## Why the approval can only happen HERE, on the web origin
 *
 * `/v1/mcp/device/approve` is inside `HTTP_ORIGIN_PROTECTED_ROUTES`, so a
 * cookie-carrying POST to it must present `Origin: <WEB_ORIGIN>`. Only a page
 * served from the web origin does that. A server-rendered approval page on the
 * API origin would be refused by the product's own CSRF control — which is why
 * this task exists at all, in a plan whose architecture diagram lists no
 * `apps/web` changes.
 *
 * ## The consent has to be LEGIBLE, and that is a styling decision too
 *
 * What is being granted is not a scope or a checkbox: it is a credential that
 * acts AS this person, with THEIR permissions, until they revoke it. The screen
 * says so in those words, before the button, and again in the confirmation.
 *
 * It says it in `--gn-surface-sunken`, NOT in `--gn-danger` or `--gn-warning`,
 * and that follows the reasoning already recorded on the 404 page: a warning
 * colour "would tell the reader something has gone wrong, when the whole point
 * of the paragraph is that the product is behaving correctly". Approving your
 * own assistant is a normal thing to do. Dressing it as an alarm trains people
 * to click through alarms, which is the opposite of informed consent.
 */
/**
 * Who the consent sentence names, and why it is not just `session.user.name`.
 *
 * FOUND BY DRIVING THE REAL FLOW, not by any test: the approval confirmation
 * rendered "It now acts as , with exactly your permissions" — naming nobody, in
 * the one sentence whose entire job is naming somebody.
 *
 * `useSessionStatus` builds the name as `user.name ?? user.id`, and `??` only
 * catches null and undefined. A magic-link account has name `''` — an EMPTY
 * STRING, confirmed in the database — so the fallback never fires and the empty
 * string wins. That is a latent defect in the shared hook, recorded for its
 * owner rather than changed here, because every other surface reading a name
 * would move with it.
 *
 * "you" rather than the user id: an id is not an answer to "who is this
 * assistant going to act as", and a consent screen that answers with
 * `01M1V02CWM3G3SADCCRC40JQ42` has technically named the person and actually
 * told them nothing.
 */
function actingAs(name: string): string {
  return name.trim() === '' ? 'you' : name;
}

function AuthorizeScreen(): React.JSX.Element {
  const params = useSearchParams();
  // The discriminated union, not `useCurrentUser()`: that hook answers `null`
  // for BOTH 'still loading' and 'signed out', and the invite page records at
  // length why collapsing those two is a false statement for the whole of the
  // session request. Here it would flash a sign-in prompt at somebody who is
  // already signed in, mid-approval.
  const session = useSessionStatus();
  // Pre-filled from `?code=` when the CLI could open a browser for the person;
  // typed by hand when it could not. Both paths reach the same input, so there
  // is one code path to get right rather than two.
  const [code, setCode] = useState(params.get('code') ?? '');
  const [state, setState] = useState<
    'idle' | 'approving' | 'denying' | 'approved' | 'denied'
  >('idle');
  const [refusal, setRefusal] = useState<string | null>(null);

  /**
   * ONE handler for both doors, because the two differ only in their verb.
   *
   * `POST /v1/mcp/device/deny` is a SIBLING of approve, not a flag on it —
   * deliberately, since one route answering two questions is the shape this
   * repo refuses by name — and the pair answers the SAME three refusals, so the
   * mapping below is shared rather than copied. What differs is the success
   * state and one sentence of the catch-all.
   */
  const submit = (action: 'approve' | 'deny'): void => {
    setRefusal(null);
    setState(action === 'approve' ? 'approving' : 'denying');
    const http = createHttpClient('', (input, init) => fetch(input, init));
    void http.post(`/v1/mcp/device/${action}`, { userCode: code.trim().toUpperCase() }).then(
      () => setState(action === 'approve' ? 'approved' : 'denied'),
      (cause: unknown) => {
        setState('idle');
        // A PRESENTATION of the server's single-key refusal, not a paraphrase
        // of a rule: the server says `{error:'unknown_code'}` and this is the
        // one place in the product where that is rendered as a sentence a
        // person can act on. Every branch ends in something to DO.
        //
        // The 404 arm carries extra weight on the DENY path: it is what a
        // person sees when the code was already spent or already denied, which
        // is why the sentence names both possibilities rather than assuming
        // the code never existed.
        if (cause instanceof HttpError && cause.status === 410) {
          setRefusal('That code has expired. Ask for a new one and try again.');
          return;
        }
        if (cause instanceof HttpError && cause.status === 404) {
          setRefusal(
            'That code is not recognised. It may have already been used, or it may have expired — ask for a new one.',
          );
          return;
        }
        setRefusal(
          action === 'approve'
            ? 'That approval could not be completed, and the server did not say why. Ask for a new code and try again.'
            : 'That denial could not be completed, and the server did not say why. Ask for a new code and try again.',
        );
      },
    );
  };

  const returnPath = '/mcp/authorize';

  return (
    <main id="gn-main" className="gn-shell gn-mcp-authorize">
      <h1 className="gn-page-title">Connect an assistant</h1>

      <Card className="gn-mcp-authorize__card">
        {session.kind === 'loading' || session.kind === 'error' ? (
          <p>Checking your session…</p>
        ) : session.kind === 'signed-out' ? (
          /* 401 handled BEFORE the form rather than after a failed POST: asking
             somebody to type a code and then telling them to sign in wastes the
             code, which is single-use and short-lived. */
          <p className="gn-mcp-authorize__signed-out">
            <Link href={`/sign-in?next=${encodeURIComponent(returnPath)}`}>Sign in</Link> to approve
            an assistant — you land back here.
          </p>
        ) : state === 'approved' ? (
          <div data-testid="mcp-authorize-approved" role="status">
            <p className="gn-mcp-authorize__granted">Approved. The assistant is connected.</p>
            <p className="gn-mcp-authorize__what">
              It now acts <strong>as {actingAs(session.user.name)}</strong>, with exactly your permissions — it can see
              and change whatever you can, and every claim it records will carry your name.
            </p>
            <p className="gn-mcp-authorize__revoke">
              This lasts until you revoke it. You can close this page; the assistant already has
              what it needs.
            </p>
          </div>
        ) : state === 'denied' ? (
          /* The counterpart the consent panel implied: a screen that says what
             approving MEANS, and offers no way to say no, is not asking. The
             sentence is careful about what actually happened — the grant row is
             deleted, so the code is spent in BOTH directions and the CLI's next
             poll answers `unknown_code`, which is a real thing it can act on. */
          <div data-testid="mcp-authorize-denied" role="status">
            <p className="gn-mcp-authorize__denied">Denied. The assistant was not connected.</p>
            <p className="gn-mcp-authorize__what">
              The code is spent — it cannot be approved later, and it cannot collect a credential.
              Your assistant&rsquo;s next check will tell it the code is no longer recognised, so ask
              it for a new one if you change your mind.
            </p>
          </div>
        ) : (
          <>
            <p className="gn-mcp-authorize__lead">
              Enter the code your assistant is showing you.
            </p>

            {/* The consent, stated BEFORE the button rather than beside it. */}
            <p className="gn-mcp-authorize__consent">
              <span className="gn-mcp-authorize__consent-label">What you are approving</span>
              An assistant that acts <strong>as {actingAs(session.user.name)}</strong>, with exactly your permissions.
              It can see and change whatever you can, and every claim it records will carry your
              name. It lasts until you revoke it.
            </p>

            <label className="gn-mcp-authorize__label" htmlFor="mcp-user-code">
              Code from your assistant
            </label>
            <input
              id="mcp-user-code"
              className="gn-mcp-authorize__input"
              data-testid="mcp-authorize-code-input"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              // The code is 8 characters from an alphabet with no vowels and no
              // 0/O/1/I/5/S, formatted XXXX-XXXX to be read aloud. The server
              // upper-cases and trims, so the browser must not fight the person
              // over case, and a spell-checker has nothing useful to say about
              // it. `one-time-code` is the honest autocomplete value: it is
              // exactly that.
              autoComplete="one-time-code"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              placeholder="XXXX-XXXX"
              aria-describedby="mcp-user-code-hint"
            />
            <span className="gn-mcp-authorize__hint" id="mcp-user-code-hint">
              Eight characters, shown as two groups of four. Upper or lower case both work.
            </span>

            {/* Two controls of EQUAL WEIGHT, because this screen is asking a
                question rather than recommending an answer. Deny is therefore
                NOT `variant="danger"`: the product reserves that variant for
                the destructive actions it names (`revoke`, `delete`), and this
                page's own docblock already records why alarm-dressing a normal
                decision trains people to click through alarms. */}
            <div className="gn-mcp-authorize__actions">
              <Button
                data-testid="mcp-authorize-submit"
                onClick={() => submit('approve')}
                disabled={state !== 'idle' || code.trim() === ''}
              >
                {state === 'approving' ? 'Approving…' : 'Approve this assistant'}
              </Button>
              <Button
                variant="ghost"
                data-testid="mcp-authorize-deny"
                onClick={() => submit('deny')}
                disabled={state !== 'idle' || code.trim() === ''}
              >
                {state === 'denying' ? 'Denying…' : 'Deny'}
              </Button>
            </div>
          </>
        )}

        {/* `role="alert"` rather than colour alone: a refusal that is only red
            is silent to a screen reader, and this one always names a next step. */}
        {refusal !== null ? (
          <p className="gn-mcp-authorize__refusal" data-testid="mcp-authorize-refused" role="alert">
            {refusal}
          </p>
        ) : null}
      </Card>
    </main>
  );
}

/**
 * `useSearchParams` requires a Suspense boundary under Next's app router, and
 * without one `next build` fails the whole route rather than this component.
 */
export default function McpAuthorizePage(): React.JSX.Element {
  return (
    <Suspense fallback={<main className="gn-shell" />}>
      <AuthorizeScreen />
    </Suspense>
  );
}
