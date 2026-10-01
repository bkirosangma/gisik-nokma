'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { Button, Card } from '@gisik-nokma/ui';
import { createHttpClient, HttpError } from '@gisik-nokma/app-core/online';
import { useSessionStatus } from '../../../src/providers.js';

/**
 * `/mcp/connect` — where a person answers "may this assistant app act as me?"
 * for the HOSTED MCP door (remote-MCP plan Task 4; the device-code twin is
 * `/mcp/authorize`).
 *
 * ## This URL is the SERVER's, not this file's
 *
 * `GET /oauth/authorize` answers 302 to `${WEB_ORIGIN}/mcp/connect?request=…`
 * (`apps/server/src/routes/mcp-oauth.ts`). Renaming this segment breaks every
 * consent already in flight, and no test here would notice.
 *
 * ## Why the answer can only be given HERE
 *
 * `POST /v1/mcp/oauth/requests/:id/decision` is in `HTTP_ORIGIN_PROTECTED_ROUTES`,
 * so a cookie POST must present `Origin: <WEB_ORIGIN>`, and only a page served
 * from the web origin does. The response carries the URL to send the browser
 * on to (`redirectTo`, the client's own callback with a code or an error).
 *
 * ## The consent names WHO twice
 *
 * The client's name is self-reported at registration, so it is never shown
 * alone: the redirect host (`claude.ai`, `chatgpt.com`) always sits beside it.
 * Allow is the page's one primary button; Deny is the quiet one. Neither is
 * dressed as an alarm — connecting your own assistant is a normal act.
 *
 * ## The card sits in the middle, and there is no app nav (owner 2026-09-30)
 *
 * People arrive from Claude or ChatGPT for one decision, so the page carries no
 * navigation and the stage (title + card) is centred in the viewport — see
 * `.gn-mcp-connect` in `globals.css` for why `margin: auto` and not
 * `justify-content: center`.
 */
type Details = { requestId: string; clientName: string; redirectHost: string };

/** Everything the screen can be showing once a person is signed in. */
type View =
  | { kind: 'loading' }
  | { kind: 'expired' }
  | { kind: 'refused'; message: string }
  | { kind: 'ready'; details: Details };

const EXPIRED = 'This connection request has expired. Go back to your assistant and connect again.';
const GENERIC = 'That could not be completed, and the server did not say why. Go back to your assistant and connect again.';

/** The server's own words out of a refusal, when it sent any. */
function serverMessage(cause: unknown): string | null {
  if (!(cause instanceof HttpError)) return null;
  const body = cause.body as { message?: unknown } | undefined;
  return typeof body?.message === 'string' ? body.message : null;
}

function ConnectScreen(): React.JSX.Element {
  const params = useSearchParams();
  const request = params.get('request') ?? '';
  // The discriminated union, not `useCurrentUser()`: that hook answers `null` for
  // BOTH 'still loading' and 'signed out', and collapsing those would flash a
  // sign-in prompt at somebody who is already signed in.
  const session = useSessionStatus();
  const [view, setView] = useState<View>({ kind: 'loading' });
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const signedIn = session.kind === 'signed-in';

  useEffect(() => {
    // Nothing is asked of the API while signed out: the request row is the
    // person's to see only once they are who they say they are.
    if (!signedIn || request === '') return;
    let live = true;
    const http = createHttpClient('', (input, init) => fetch(input, init));
    void http.get(`/v1/mcp/oauth/requests/${encodeURIComponent(request)}`).then(
      (details) => {
        // `createHttpClient` answers a GET 404 with `null` rather than throwing
        // (it is the "not found" affordance for reads), so an expired request
        // arrives HERE, not in the rejection arm below.
        if (live) setView(details === null ? { kind: 'expired' } : { kind: 'ready', details: details as Details });
      },
      (cause: unknown) => {
        if (!live) return;
        setView(
          { kind: 'refused', message: serverMessage(cause) ?? GENERIC },
        );
      },
    );
    return () => {
      live = false;
    };
  }, [signedIn, request]);

  const decide = (allow: boolean): void => {
    setRefusal(null);
    setBusy(true);
    const http = createHttpClient('', (input, init) => fetch(input, init));
    void http.post(`/v1/mcp/oauth/requests/${encodeURIComponent(request)}/decision`, { allow }).then(
      (answer) => {
        // Busy stays on: the page is about to be replaced by the assistant app.
        window.location.assign((answer as { redirectTo: string }).redirectTo);
      },
      (cause: unknown) => {
        setBusy(false);
        const message = serverMessage(cause);
        // A 409 means the request is spent: the buttons go, the server's
        // sentence stays. Anything else is retryable, so the buttons stay.
        if (cause instanceof HttpError && cause.status === 409) {
          setView({ kind: 'refused', message: message ?? GENERIC });
          return;
        }
        setRefusal(message ?? GENERIC);
      },
    );
  };

  const returnPath = `/mcp/connect?request=${request}`;

  return (
    <main id="gn-main" className="gn-shell gn-mcp-authorize gn-mcp-connect">
      <div className="gn-mcp-connect__stage">
        <h1 className="gn-page-title">Connect an assistant</h1>

        <Card className="gn-mcp-authorize__card">
          {session.kind === 'loading' || session.kind === 'error' ? (
            <p>Checking your session…</p>
          ) : session.kind === 'signed-out' ? (
            <p className="gn-mcp-authorize__signed-out">
              <Link href={`/sign-in?next=${encodeURIComponent(returnPath)}`}>Sign in</Link> to connect an
              assistant — you land back here.
            </p>
          ) : request === '' || view.kind === 'expired' ? (
            <p role="status">{EXPIRED}</p>
          ) : view.kind === 'refused' ? (
            <p role="status">{view.message}</p>
          ) : view.kind === 'loading' ? (
            <p>Loading the request…</p>
          ) : (
            <>
              <p className="gn-mcp-authorize__lead">
                <strong>{view.details.clientName}</strong> ({view.details.redirectHost}) wants to use Gisik Nokma as{' '}
                <strong>you</strong>.
              </p>
              <p className="gn-mcp-authorize__consent">
                It will be able to see and change everything you can — read tickets, create them, move them, comment
                and assign, and create, rename, archive or delete workspaces and projects (deleted ones can be
                restored for 15 days) — in all your workspaces.
              </p>
              <p className="gn-mcp-authorize__revoke">
                You can disconnect it any time from Account → Connected assistants.
              </p>
              <div className="gn-mcp-authorize__actions">
                <Button variant="primary" onClick={() => decide(true)} disabled={busy}>
                  Allow
                </Button>
                <Button variant="ghost" onClick={() => decide(false)} disabled={busy}>
                  Deny
                </Button>
              </div>
            </>
          )}

          {refusal !== null ? (
            <p className="gn-mcp-authorize__refusal" role="alert">
              {refusal}
            </p>
          ) : null}
        </Card>
      </div>
    </main>
  );
}

/** `useSearchParams` needs a Suspense boundary under Next's app router. */
export default function McpConnectPage(): React.JSX.Element {
  return (
    <Suspense fallback={<main className="gn-shell" />}>
      <ConnectScreen />
    </Suspense>
  );
}
