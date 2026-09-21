import { Button } from '@gisik-nokma/ui';
import { formatDateTime } from '../provenance.js';
import type { SessionSummary } from './sessions-client.js';

export type SessionsSectionProps = {
  sessions: SessionSummary[];
  onRevoke: (token: string) => void;
  /**
   * Set when the caller's own `onRevoke` refuses. Ruling E2-24(b): a "Sign
   * out" refusal used to be read and discarded entirely — the list simply
   * failed to shrink, with nothing on screen to say why. Same one-prop
   * shape `PasskeysSection`'s add/remove `error` already carries.
   */
  error?: string | null;
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

 * STYLED as of the Account styling port — this docblock previously disclosed
 * the opposite ("carry no CSS rule in `globals.css` today") and that is no
 * longer true. `globals.css`'s `/account` block styles
 * `gn-account__section`, `__section-title`, `__session-list` and
 * `__session-row`; the list is named explicitly out of the page-wide
 * `.gn-account ul` bullet rule there, since it is a row list now.
 *
 * The note below about `/mcp/tokens` is worth keeping and updating rather
 * than deleting. `.gn-mcp-tokens__row` was rejected as a class to BORROW —
 * it is that route's own namespaced class, not a shared utility — and that
 * still holds: nothing here references it. What the `/account` block does
 * instead is reuse its VALUES (sunken background, wrap, the
 * primary/secondary text split) under `/account`'s own class names, which is
 * the copy that costs nothing and keeps both routes independently editable.
 *
 * The revoke button uses the shared `Button` component (`variant="danger"`)
 * rather than a bare `<button>`, matching `ProfileSection`'s own use of
 * `Button` on this page.
 */
export function SessionsSection({ sessions, onRevoke, error = null }: SessionsSectionProps) {
  return (
    <section className="gn-account__section gn-account__sessions">
      <h2 className="gn-account__section-title">Sign-in and devices</h2>
      {error !== null ? (
        <p role="alert" className="gn-refusal gn-refusal--server">
          {error}
        </p>
      ) : null}
      {sessions.length === 0 ? (
        // THE WORDING HEDGES ON PURPOSE. `/account`'s own effect collapses a
        // FAILED read to `[]` (its docblock discloses this), so an empty list
        // here is either "no sessions" or "the read did not answer" and this
        // component cannot tell which. "to show" is therefore the honest
        // claim; "You have no other devices" would assert a fact about the
        // account that an empty array does not establish. The prototype has
        // no empty state to port — its rows are always seeded.
        <p className="gn-account__note">No signed-in devices to show.</p>
      ) : (
        <ul className="gn-account__session-list">
          {sessions.map((session) => (
            <li key={session.token} className="gn-account__session-row">
              <span className="gn-account__row-text">
                <span>{session.deviceLabel}</span>
                <span className="gn-account__row-meta">
                  {session.isCurrent
                    ? 'This device'
                    : `Last active ${formatDateTime(session.updatedAt)}`}
                </span>
              </span>
              {!session.isCurrent ? (
                // SOLID, though the prototype draws this control TINTED. The
                // tint was built and then removed on a measurement: `danger`
                // text on `surfaceSunken` is 3.84:1 and on `surfaceRaised`
                // 4.29:1, both under the 4.5 this 0.9375rem label owes, while
                // the solid variant's `dangerText on danger` is 5.0511:1 and is
                // the only one of the three `CONTRAST_PAIRS` actually gates.
                // The full table is on the `/account` block in `globals.css`.
                <Button variant="danger" onClick={() => onRevoke(session.token)}>
                  Sign out
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {/* Prototype copy, kept because it is TRUE of this product: history is
          append-only, so revoking a session does not retract what it
          recorded. */}
      <p className="gn-account__note">
        Signing a device out does not remove what it recorded — those claims stay, attributed to
        it.
      </p>
    </section>
  );
}
