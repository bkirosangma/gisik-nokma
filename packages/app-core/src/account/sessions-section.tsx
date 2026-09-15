import { Button } from '@gisik-nokma/ui';
import { formatDateTime } from '../provenance.js';
import type { SessionSummary } from './sessions-client.js';

export type SessionsSectionProps = {
  sessions: SessionSummary[];
  onRevoke: (token: string) => void;
};

/**
 * The `/account` "Sign-in and devices" section, Sessions half (Passkeys is a
 * later task) — framework-free beyond React itself, matching every other
 * view in this package. `deviceLabel` and `isCurrent` are computed entirely
 * by the caller's adapter (`apps/web/src/account/account-clients.ts`); this
 * component only renders what it is handed and calls `onRevoke` with the
 * token, the same "hand the caller a value, let it own the mutation" shape
 * `NotificationsSection`'s `onToggle` and `ProfileSection`'s `onSave` use.
 *
 * The current session renders no revoke control at all — not a disabled
 * one — because there is nothing a disabled control would honestly be
 * offering to do here.
 *
 * "Last active" goes through `formatDateTime` (this package's own
 * `provenance.ts`, already used by `HistoryList`/`VisibilityEditor` for the
 * same "who did what and when" shape) rather than the raw ISO string —
 * Features.md's own clock rule ("every date goes through the domain's one
 * `formatIstInstant`... an ISO slice... would disagree with every other date
 * on the sheet") applies here exactly as it does everywhere else this client
 * shows a moment.
 *

 * Unstyled by the same disclosed convention `ProfileSection`/
 * `WorkspacesSection` already establish on this page: `gn-account__section`,
 * `gn-account__section-title`, `gn-account__session-row` carry no CSS rule
 * in `globals.css` today. `gn-account__session-list` is the one exception —
 * it is a `<ul>`, so the page-wide `.gn-account ul` descendant rule (list
 * spacing) applies to it the same way it already does to
 * `gn-account__workspace-list`. `/mcp/tokens`'s `.gn-mcp-tokens__row` was
 * considered as a reusable row treatment (same shape: a row, a revoke
 * button) and rejected — it is that route's own namespaced class, not a
 * shared utility, and borrowing it here would be the same mistake as
 * inventing a class, just in the other direction. The revoke button uses
 * the shared `Button` component (`variant="danger"`) rather than a bare
 * `<button>`, matching `ProfileSection`'s own use of `Button` on this page.
 */
export function SessionsSection({ sessions, onRevoke }: SessionsSectionProps) {
  return (
    <section className="gn-account__section gn-account__sessions">
      <h2 className="gn-account__section-title">Sign-in and devices</h2>
      <ul className="gn-account__session-list">
        {sessions.map((session) => (
          <li key={session.token} className="gn-account__session-row">
            <span>{session.deviceLabel}</span>
            <span>{session.isCurrent ? 'This device' : `Last active ${formatDateTime(session.updatedAt)}`}</span>
            {!session.isCurrent ? (
              <Button variant="danger" onClick={() => onRevoke(session.token)}>
                Sign out
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
