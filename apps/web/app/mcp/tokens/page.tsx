'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Button, Card } from '@gisik-nokma/ui';
import { createHttpClient, HttpError, refusalText } from '@gisik-nokma/app-core/online';
import { IST_TIME_ZONE } from '@gisik-nokma/domain';
import { useSessionStatus } from '../../../src/providers.js';

/**
 * `/mcp/tokens` — the revoke surface (owner ruling 5, MCP plan Task 12).
 *
 * ## Why it is here and not under `w/[workspaceId]/settings/`
 *
 * The plan called it "a fourth settings screen", and the three that exist there
 * are workspace-scoped (`workflows`, `ticket-types`). **An MCP token is not.**
 * It is minted for a PERSON and carries their permissions in every workspace
 * they belong to, so a path with a workspace in it would say something false
 * about what revoking does — and would leave the same credential reachable from
 * three different URLs in a three-workspace account. It sits beside
 * `/mcp/authorize`, which already established `app/mcp/` as the per-user MCP
 * surface, and revoking here revokes everywhere because there is only one here.
 *
 * ## The list cannot show the token, and does not pretend to
 *
 * `mcp_tokens` stores `sha256(token)`; the raw value existed only in the
 * response that minted it. So a row shows what is honestly available — when it
 * was approved — and the screen says why there is nothing else to show. A row
 * that implied it could reveal the credential would be a lie about the storage.
 *
 * ## It says what revoking actually does
 *
 * Deleting the row ends access at the assistant's NEXT request, because
 * `resolveMcpToken` then finds nothing. Nothing is killed mid-flight, and the
 * screen says that rather than implying a session is being torn down.
 */

type TokenRow = { id: string; createdAt: string };

/**
 * The approval date, in the product's timezone.
 *
 * The product's zone explicitly, not the viewer's locale default: a ledger whose
 * owner decided on one timezone should not render "yesterday" to one person and
 * "today" to another looking at the same row.
 *
 * `IST_TIME_ZONE` imported rather than the literal re-spelled. `packages/domain/
 * src/ist-day.ts` is the ONE declaration site, and `reporting-scope-guard.test.ts`
 * scans every source root to keep it that way — it caught the literal here on the
 * first full gate, which is the guard doing exactly its job.
 */
function approvedOn(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return 'an unknown date';
  return at.toLocaleDateString('en-IN', {
    timeZone: IST_TIME_ZONE,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export default function McpTokensPage(): React.JSX.Element {
  // The discriminated union, not `useCurrentUser()`: that hook answers `null`
  // for BOTH 'still loading' and 'signed out', and flashing a sign-in prompt at
  // somebody who is already signed in is a false statement about their session.
  const session = useSessionStatus();
  const [tokens, setTokens] = useState<TokenRow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);

  const http = createHttpClient('', (input, init) => fetch(input, init));

  const load = useCallback((): void => {
    void http.get('/v1/me/mcp-tokens').then(
      (body) => setTokens((body as { tokens: TokenRow[] }).tokens),
      () => setTokens([]),
    );
    // `http` is rebuilt each render and is stateless; depending on it would
    // reload on every render instead of on sign-in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (session.kind === 'signed-in') load();
  }, [session.kind, load]);

  const revoke = (id: string): void => {
    setRefusal(null);
    setBusy(id);
    void http.del(`/v1/me/mcp-tokens/${id}`).then(
      () => {
        setBusy(null);
        load();
      },
      (cause: unknown) => {
        setBusy(null);
        // A PRESENTATION of the server's refusal, never a paraphrase of one it
        // did not send. The 404 here is deliberately ambiguous — it is the same
        // answer for "not yours" and "already gone" — so the sentence says the
        // only thing that is true of both.
        if (cause instanceof HttpError && cause.status === 404) {
          setRefusal('That connection is already gone. The list below is up to date.');
          load();
          return;
        }
        setRefusal(
          (cause instanceof HttpError ? refusalText(cause.body) : null) ??
            'That could not be revoked, and the server did not say why. Try again in a moment.',
        );
      },
    );
  };

  return (
    <main className="gn-shell gn-mcp-tokens">
      <h1 className="gn-page-title">Connected assistants</h1>

      <Card className="gn-mcp-tokens__card">
        {session.kind === 'loading' ? (
          <p>Checking your session…</p>
        ) : session.kind === 'signed-out' ? (
          <p className="gn-mcp-tokens__signed-out">
            <Link href={`/sign-in?next=${encodeURIComponent('/mcp/tokens')}`}>Sign in</Link> to see
            and revoke the assistants connected to your account — you land back here.
          </p>
        ) : (
          <>
            <p className="gn-mcp-tokens__lead">
              Each of these can see and change whatever you can, and every claim it records carries
              your name. Revoking one takes effect at that assistant&rsquo;s next request — nothing
              is interrupted mid-task, and it will simply be asked to sign in again.
            </p>

            {tokens === null ? (
              <p data-testid="mcp-tokens-loading">Loading…</p>
            ) : tokens.length === 0 ? (
              <p className="gn-mcp-tokens__empty" data-testid="mcp-tokens-empty">
                No assistants are connected. One appears here after you approve it on the{' '}
                <Link href="/mcp/authorize">connect page</Link>.
              </p>
            ) : (
              <ul className="gn-mcp-tokens__list" data-testid="mcp-tokens-list">
                {tokens.map((token) => (
                  <li className="gn-mcp-tokens__row" key={token.id}>
                    <span className="gn-mcp-tokens__when">
                      Approved {approvedOn(token.createdAt)}
                    </span>
                    <Button
                      data-testid={`mcp-tokens-revoke-${token.id}`}
                      onClick={() => revoke(token.id)}
                      disabled={busy !== null}
                    >
                      {busy === token.id ? 'Revoking…' : 'Revoke'}
                    </Button>
                  </li>
                ))}
              </ul>
            )}

            {/* Stated once, plainly, rather than as a per-row tooltip nobody
                opens: the product cannot show the credential, and saying so is
                more honest than a masked string implying it could. */}
            <p className="gn-mcp-tokens__what">
              The connection itself is never shown — only a one-way hash of it is stored, so there is
              nothing here to copy or leak.
            </p>
          </>
        )}

        {/* `role="alert"` rather than colour alone: a refusal that is only red
            is silent to a screen reader, and this one always names a next step. */}
        {refusal !== null ? (
          <p className="gn-mcp-tokens__refusal" data-testid="mcp-tokens-refused" role="alert">
            {refusal}
          </p>
        ) : null}
      </Card>
    </main>
  );
}
