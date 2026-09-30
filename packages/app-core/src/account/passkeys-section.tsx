import { useState } from 'react';
import { Button } from '@gisik-nokma/ui';
import type { PasskeySummary } from './passkey-client.js';

export type PasskeysSectionProps = {
  passkeys: PasskeySummary[];
  onAdd: (name: string) => void;
  onRemove: (id: string) => void;
  error?: string | null;
  /**
   * Set when the caller's own read of the passkey LIST failed — distinct
   * from `error`, which is an add/remove refusal. Ruling E2-23: a failed
   * list read used to collapse to `[]`, and "You have no passkeys yet."
   * then asserted a fact about the account nobody confirmed. Replaces ONLY
   * the empty-state claim: a caller still holding a real, previously-read
   * `passkeys` list keeps rendering it regardless of this flag.
   */
  listFailed?: boolean;
};

/**
 * The `/account` "Sign-in and devices" section, Passkeys half — the sibling
 * `SessionsSection`'s own docblock has been promising since Task 7.
 * Framework-free beyond React itself, matching every other view in this
 * package: it never touches `authClient`, never calls WebAuthn, and never
 * knows a passkey ceremony happens at all. It renders what it is handed and
 * calls `onAdd`/`onRemove` with a value, the same "hand the caller a value,
 * let it own the mutation" shape `SessionsSection`'s `onRevoke`,
 * `NotificationsSection`'s `onToggle` and `ProfileSection`'s `onSave` use.
 *
 * ## The per-row accessible name is load-bearing, not decoration
 *
 * Every delete control is `aria-label={`Delete passkey ${name}`}` rather than
 * a bare "Delete". Three rows of a control named only "Delete" are three
 * controls a screen reader announces identically, on a screen whose whole job
 * is telling one credential from another — and it is the one shape a test can
 * address unambiguously, which is why `passkeys-section.test.tsx` drives TWO
 * rows and clicks the second by name. The visible text stays "Delete" because
 * a row that reads "Delete passkey MacBook Touch ID" beside the words "MacBook
 * Touch ID" says the name twice.
 *
 * ## The refusal uses `gn-refusal gn-refusal--server`, an EXISTING rule —
 * REVISED, and the revision is the finding
 *
 * The final whole-branch review caught this: it previously used
 * `.gn-shell__refusal` (`apps/web/app/globals.css:669`, the same class
 * `sign-in/page.tsx:426` and `src/account/profile-section.tsx` use), copied
 * forward from Task 3's ruling for its OWN `apps/web`-only file without
 * noticing this component lives in `@gisik-nokma/app-core` — the package
 * whose entire point is cross-app reuse (web AND desktop). `apps/desktop`
 * never loads `globals.css`, so a passkey refusal there rendered as plain
 * unstyled text. `gn-refusal`/`gn-refusal--server` (`packages/ui/src/ui.css`,
 * near `.gn-transition__notice`) is the real app-core-level equivalent —
 * visually identical (`background: var(--gn-fill-secondary); box-shadow:
 * inset 4px 0 0 var(--gn-danger)`) and already used the same way by
 * `transition-dialog.tsx`, `create-ticket-flow.tsx` and `reopen-dialog.tsx`
 * in this same package. Not an invented `gn-account__error` either: a class
 * that looks real and matches no rule renders an unstyled paragraph that
 * reads as ordinary copy rather than as a refusal.
 *
 * STYLED as of the Account styling port — this docblock previously disclosed
 * the opposite ("carry no CSS rule in `globals.css` today") and that is no
 * longer true. `globals.css`'s `/account` block styles
 * `gn-account__section`, `__section-title`, `__passkey-list` and
 * `__passkey-row`; the list is named explicitly out of the page-wide
 * `.gn-account ul` bullet rule there, since it is a row list now.
 *
 * ONE SCOPE LIMIT, NAMED HERE BECAUSE THIS FILE IS WHERE IT BITES: those
 * rules live in `apps/web/app/globals.css`, and as the `gn-refusal` note
 * above already establishes, `apps/desktop` never loads that file —
 * `apps/desktop/src/main.tsx:6` imports `@gisik-nokma/ui/ui.css` and nothing
 * else, and `grep -rn "gn-account" apps/desktop apps/mobile` is empty, so
 * there is no competing rule either, only an absent one. So this section
 * renders styled in web and still-unstyled in desktop. That is
 * unchanged from before (it was unstyled in BOTH), not a regression, and the
 * rules were put there rather than in `packages/ui/src/ui.css` because every
 * other route's CSS lives in `globals.css` (`.gn-mcp-tokens__*`,
 * `.gn-settings__*`, `.gn-workspace-*`). Giving desktop the same treatment
 * means promoting the `/account` block to `ui.css`, which is a deliberate
 * cross-app decision and not something to slip in under a styling pass.
 * The field uses `gn-field`/`gn-field__label`/`gn-field__input`, which ARE
 * real rules and are exactly what `ProfileSection`'s Name field uses.
 *
 * ## An empty name is allowed through rather than blocked here
 *
 * The Add control is never disabled on an empty field. That is deliberate and
 * it is the server's own contract, not a shrug: `@better-auth/passkey`'s
 * registration options document that "a non-empty client-supplied name always
 * takes precedence over the returned `name`; whitespace-only input is treated
 * as absent", and the plugin then labels the credential from its AAGUID. So an
 * empty field means "let the server name it", which is a better answer than a
 * disabled button that gives no reason.
 */
export function PasskeysSection({
  passkeys,
  onAdd,
  onRemove,
  error = null,
  listFailed = false,
}: PasskeysSectionProps) {
  const [name, setName] = useState('');

  return (
    <section className="gn-account__section gn-account__passkeys">
      <h2 className="gn-account__section-title">Passkeys</h2>
      {error !== null ? (
        <p role="alert" className="gn-refusal gn-refusal--server">
          {error}
        </p>
      ) : null}
      {passkeys.length === 0 && listFailed ? (
        // `listFailed` only replaces the EMPTY-state claim — a caller that
        // still holds a real, previously-read list keeps showing it even if
        // a LATER poll failed, the same way a page does not un-render data
        // it already has just because a refresh hiccuped.
        <p role="alert" className="gn-refusal gn-refusal--server">
          Your passkeys could not be loaded.
        </p>
      ) : passkeys.length === 0 ? (
        <p>You have no passkeys yet.</p>
      ) : (
        <ul className="gn-account__passkey-list">
          {passkeys.map((passkey) => (
            <li key={passkey.id} className="gn-account__passkey-row">
              <span className="gn-account__row-text">{passkey.name}</span>
              <Button
                variant="danger"
                aria-label={`Delete passkey ${passkey.name}`}
                onClick={() => onRemove(passkey.id)}
              >
                Delete
              </Button>
            </li>
          ))}
        </ul>
      )}
      <label className="gn-field">
        <span className="gn-field__label">Passkey name</span>
        <input
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="gn-field__input"
        />
      </label>
      {/* Quiet, not primary: Save name is the Account page's one loud element (styling refresh Plan B, B17). */}
      <Button
        onClick={() => {
          onAdd(name);
          // Cleared BEFORE the ceremony resolves, on purpose: `onAdd` is a
          // fire-and-forget hand-off (the caller owns the promise), and a
          // field still holding the submitted name is a field a second click
          // would re-submit under the same label.
          setName('');
        }}
      >
        Add a passkey
      </Button>
    </section>
  );
}
