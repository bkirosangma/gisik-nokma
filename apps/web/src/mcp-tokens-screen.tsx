'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Button, Card } from '@gisik-nokma/ui';
import { createHttpClient, HttpError, refusalText } from '@gisik-nokma/app-core/online';
import { IST_TIME_ZONE } from '@gisik-nokma/domain';
import { useSessionStatus } from './providers.js';

/**
 * `McpTokensScreen` — extracted from `app/mcp/tokens/page.tsx` (Round 19d,
 * owner: "workflows and mcp tokens should not be opening up a separate
 * route. it should live inside settings.").
 *
 * The owner's own reference (the prototype's `isSettingsShell`) treats
 * Ticket types, Workflows and MCP tokens as three sections of ONE screen,
 * swapped by a sidebar rather than reached by leaving it — `settingsScreens
 * = ["workflows", "types", "typeeditor", "mcptokens"]` and one `isSettingsShell`
 * flag gates all four. `/settings` (`app/settings/page.tsx`) inlines this
 * component as its "MCP tokens" tab for exactly that reason. `/mcp/tokens`
 * keeps working too — nothing here required removing a URL that already
 * existed and is not the one the owner named — it just mounts the same
 * screen now, so the two callers cannot drift into two implementations of
 * "revoke an assistant's access" the way two ticket-type-list screens
 * could not either (`src/app-nav.tsx`'s own docblock on that shape of
 * duplication, applied here to a component instead of a data read).
 */

type TokenRow = {
  id: string;
  /**
   * What the person calls this connection (door D, 2026-09-19), or **`null` for
   * one nobody has named**.
   *
   * `null` is a value the server states, not an absent key: the route always
   * sends `name`, spelling "nobody has named this" as `null`. A row without a
   * name renders the date line alone — **never an empty string**, which would
   * draw a blank where a name belongs and read as a name of zero length.
   */
  name: string | null;
  createdAt: string;
  lastUsedAt: string | null;
};

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

/**
 * `heading` defaults to `'h1'` — the standalone `/mcp/tokens` page's own top
 * heading, unchanged from before this extraction. A host whose own `<h1>`
 * already owns level 1 passes `'h2'`: nesting a second h1 under it would be the
 * wrong heading structure for a screen reader outline, not merely a style
 * choice. (`/settings` passed `'h2'` for that reason until Round 21 moved this
 * screen off that shell; `/account` passes it now, for the same reason.)
 *
 * `variant` is a SEPARATE knob from `heading` because the two answer different
 * questions — `heading` is the document outline, `variant` is the surface this
 * screen is drawn on — and they genuinely vary independently.
 *
 * `'account'` (Round 21, owner: "move MCP tokens to the account page") adapts
 * three things to `/account`'s column, all of which would otherwise be visibly
 * or factually wrong there:
 *
 * - **The heading class.** `gn-page-title` is roughly twice the size of the
 *   `gn-account__section-title` every sibling section uses.
 * - **The card width.** `.gn-mcp-tokens__card`'s 34rem cap is narrower than the
 *   42.5rem column, so the card would sit visibly short of its neighbours'
 *   edges. The modifier lifts the cap rather than a `.gn-account__column
 *   .gn-mcp-tokens__card` descendant rule — a page-scoped override of a shared
 *   class is the shape case 13.355 exists about.
 * - **The sign-in return path**, which is the one that is not cosmetic: the
 *   signed-out branch below says "you land back here", and `next` decides
 *   whether that sentence is TRUE. Hard-coded to `/mcp/tokens`, a signed-out
 *   visitor to `/account` would be promised this page and delivered another.
 *
 * It is derived from `variant` rather than taking a third prop precisely so the
 * promise and the surface cannot be configured to disagree.
 *
 * The card itself is NOT wrapped in `.gn-account__section` by the caller: that
 * class is already a raised card (radius, surface, shadow, padding), so the two
 * together would be a card holding a card. `<Card>` here IS the section.
 */
export function McpTokensScreen({
  heading = 'h1',
  variant = 'page',
}: { heading?: 'h1' | 'h2'; variant?: 'page' | 'account' } = {}): React.JSX.Element {
  // The discriminated union, not `useCurrentUser()`: that hook answers `null`
  // for BOTH 'still loading' and 'signed out', and flashing a sign-in prompt at
  // somebody who is already signed in is a false statement about their session.
  const session = useSessionStatus();
  const [tokens, setTokens] = useState<TokenRow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);
  /** The row whose name is being edited, or null. ONE at a time: two open editors would be two unsaved drafts against one list. */
  const [namingId, setNamingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

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

  /**
   * Save a name for one connection (door D, 2026-09-19).
   *
   * **The draft goes AS TYPED**, like every other name in this product: the
   * server's schema refuses a blank or a spaces-only name with its own sentence,
   * and trimming here would silently repair a claim the person made while making
   * that refusal unreachable. The value is NOT defaulted and NOT `''`-substituted
   * — an empty box is submitted as an empty string and refused by the server,
   * which is the same answer the person would get from any other door.
   *
   * The outcome is OBSERVED by re-reading, never by editing this list: the
   * server is the authority on what the row now says.
   */
  const saveName = (id: string): void => {
    setRefusal(null);
    setBusy(id);
    void http.put(`/v1/me/mcp-tokens/${id}`, { name: draft }).then(
      () => {
        setBusy(null);
        setNamingId(null);
        setDraft('');
        load();
      },
      (cause: unknown) => {
        setBusy(null);
        if (cause instanceof HttpError && cause.status === 400) {
          setRefusal('A name must be 1 to 60 characters and cannot be only spaces.');
          return;
        }
        if (cause instanceof HttpError && cause.status === 404) {
          setRefusal('That connection is already gone. The list below is up to date.');
          setNamingId(null);
          load();
          return;
        }
        setRefusal(
          (cause instanceof HttpError ? refusalText(cause.body) : null) ??
            'That name could not be saved, and the server did not say why. Try again in a moment.',
        );
      },
    );
  };

  const Heading = heading;
  const onAccount = variant === 'account';
  // See the docblock: all three follow from ONE decision, so they cannot be
  // configured into disagreeing about which page this is.
  const headingClass = onAccount ? 'gn-account__section-title' : 'gn-page-title';
  const cardClass = onAccount
    ? 'gn-mcp-tokens__card gn-mcp-tokens__card--account'
    : 'gn-mcp-tokens__card';
  const returnTo = onAccount ? '/account' : '/mcp/tokens';

  return (
    <>
      <Heading className={headingClass}>Connected assistants</Heading>

      <Card className={cardClass}>
        {session.kind === 'loading' ? (
          <p>Checking your session…</p>
        ) : session.kind === 'signed-out' ? (
          <p className="gn-mcp-tokens__signed-out">
            <Link href={`/sign-in?next=${encodeURIComponent(returnTo)}`}>Sign in</Link> to see
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
                      {/* The NAME leads the row, as the prototype draws it — a bold
                          line above the dates. A connection nobody has named draws
                          NOTHING here rather than an empty line: `null` is the
                          server's spelling for "not named", and a blank line would
                          read as a name of zero length. */}
                      {token.name === null ? null : (
                        <span className="gn-mcp-tokens__name">{token.name}</span>
                      )}
                      Approved {approvedOn(token.createdAt)}
                      {/* The honest answer for a token nothing has used yet, rather
                          than a date picked to fill the column. `last_used` is NULL
                          until the first resolution. */}
                      <span className="gn-mcp-tokens__used">
                        {token.lastUsedAt === null
                          ? 'Never used'
                          : `Last used ${approvedOn(token.lastUsedAt)}`}
                      </span>
                    </span>
                    {namingId === token.id ? (
                      <form
                        className="gn-mcp-tokens__naming"
                        onSubmit={(event) => {
                          event.preventDefault();
                          saveName(token.id);
                        }}
                      >
                        <label className="gn-field" htmlFor={`mcp-token-name-${token.id}`}>
                          <span className="gn-field__label">Name</span>
                          <input
                            id={`mcp-token-name-${token.id}`}
                            className="gn-field__input"
                            data-testid={`mcp-tokens-name-input-${token.id}`}
                            placeholder="e.g. Claude Desktop — Anjali"
                            value={draft}
                            onChange={(event) => setDraft(event.target.value)}
                            disabled={busy !== null}
                          />
                        </label>
                        <Button
                          data-testid={`mcp-tokens-name-save-${token.id}`}
                          type="submit"
                          disabled={busy !== null}
                        >
                          {busy === token.id ? 'Saving…' : 'Save name'}
                        </Button>
                        <Button
                          data-testid={`mcp-tokens-name-cancel-${token.id}`}
                          type="button"
                          disabled={busy !== null}
                          onClick={() => {
                            setNamingId(null);
                            setDraft('');
                          }}
                        >
                          Cancel
                        </Button>
                      </form>
                    ) : (
                      <>
                        <Button
                          data-testid={`mcp-tokens-name-${token.id}`}
                          // The accessible name carries the ROW, so a column of
                          // identically-labelled buttons does not tell a
                          // screen-reader user which one renames what — the rule
                          // the workspace rename control and the project card's
                          // Archive button both keep. The approval date is the only
                          // human handle an UNNAMED connection has; two approved on
                          // the same day are the one pair this cannot separate, and
                          // that is stated rather than hidden.
                          aria-label={`${token.name === null ? 'Name' : 'Rename'} the connection approved ${approvedOn(token.createdAt)}`}
                          disabled={busy !== null}
                          onClick={() => {
                            setRefusal(null);
                            setNamingId(token.id);
                            setDraft(token.name ?? '');
                          }}
                        >
                          {token.name === null ? 'Name' : 'Rename'}
                        </Button>
                        <Button
                          data-testid={`mcp-tokens-revoke-${token.id}`}
                          onClick={() => revoke(token.id)}
                          disabled={busy !== null}
                        >
                          {busy === token.id ? 'Revoking…' : 'Revoke'}
                        </Button>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            )}

            {/* Stated once, plainly, rather than as a per-row tooltip nobody
                opens: the product cannot show the credential, and saying so is
                more honest than a masked string implying it could. */}
            <p className="gn-mcp-tokens__what">
              The connection itself is never shown — only a one-way hash of it is stored, so there is
              nothing here to copy or leak. &ldquo;Last used&rdquo; is the day the assistant last made
              a request as you; the product records that so you can tell a live connection from a
              forgotten one before revoking it.
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
    </>
  );
}
