import { NOTIFICATION_KINDS, type NotificationKind } from '@gisik-nokma/domain';
import { Switch } from '@gisik-nokma/ui';

const LABELS: Record<NotificationKind, string> = {
  assignment: 'A ticket is assigned to you',
  mention: 'You are mentioned in a comment, description or note',
  'contested-claim': 'A claim of yours is contested',
  'date-approaching': 'A date you are watching is approaching',
  'stale-ticket': 'A ticket has sat unmoved for a while',
  'flow-ready': 'A ticket is ready to start',
  'flow-reopened': 'A ticket was reopened by a flow',
};

export type NotificationsSectionProps = {
  mutedKinds: readonly NotificationKind[];
  onToggle: (kind: NotificationKind) => void;
  /**
   * Set when the caller's own read of the stored preferences failed. Every
   * row renders disabled and the section states the refusal rather than
   * letting a person "toggle" a guess — see `account/page.tsx`'s `prefsError`
   * (ruling E5-13): a failed read used to fall back to an all-on guess that a
   * toggle would then PUT as the whole document, silently un-muting whatever
   * was actually stored.
   */
  error?: string | null;
  /**
   * Set when the last SAVE (not read) was refused — distinct from `error`.
   * Ruling E2-24(a): a refused save reverted the optimistic flip with no
   * rendered outcome at all; the only trace was the switch silently
   * snapping back. Rendered as its own refusal WITHOUT disabling the rows
   * (unlike `error`): the data is still current once the revert settles,
   * only the last attempted change did not stick. Mutually exclusive with
   * `error` in practice — `toggleKind` cannot run while `prefs` is unset,
   * so a read failure and a save refusal are never both live at once.
   */
  saveError?: string | null;
};

/**
 * The `/account` Notifications section — framework-free beyond React itself,
 * matching every other view in this package (coordination amendment 10:
 * `no-http-in-views.test.ts` enforces that this module speaks no HTTP, and it
 * doesn't — it reads `mutedKinds` and calls `onToggle`, nothing else).
 *
 * One row per REAL kind, driven off `NOTIFICATION_KINDS` rather than a
 * hand-copied list — no "email" column, no "weekly digest" row. Neither
 * exists server-side (only in-app Inbox delivery is real, per
 * `packages/domain/src/notification-preferences.ts`), so this section shows
 * exactly what it can actually control.
 *
 * Checked means "not muted" — `mutedKinds` is a MUTE list (the domain's own
 * choice, so that "everything on" needs no second constant to track as
 * `NOTIFICATION_KINDS` grows), so a row's checked state is `!mutedKinds
 * .includes(kind)` rather than a membership test the other way round.
 *
 * `onToggle` receives the kind, not the next boolean or the next whole
 * document — the caller (`apps/web/app/account/page.tsx`'s `toggleKind`)
 * owns building the next `NotificationPreferences` and saving it, exactly as
 * `AppearanceSection`'s controls hand their caller a value rather than
 * reaching for a setter themselves.
 */
export function NotificationsSection({
  mutedKinds,
  onToggle,
  error = null,
  saveError = null,
}: NotificationsSectionProps) {
  return (
    <section className="gn-account__section gn-account__notifications">
      <h2 className="gn-account__section-title">Notifications</h2>
      {error !== null ? (
        <p role="alert" className="gn-refusal gn-refusal--server">
          {error}
        </p>
      ) : saveError !== null ? (
        <p role="alert" className="gn-refusal gn-refusal--server">
          {saveError}
        </p>
      ) : null}
      {NOTIFICATION_KINDS.map((kind) => (
        /* The switch is `@gisik-nokma/ui`'s, extracted 2026-09-18 when the
           Settings → Workspace tab needed the same control — see that
           component's docblock. `.gn-account__notification-row` stays on the
           label because it is one of the four row selectors sharing a single
           base rule in `globals.css` (width, wrap, min-height, padding), which
           is ACCOUNT layout and has no business in a shared package. */
        <Switch
          key={kind}
          className="gn-account__notification-row"
          checked={!mutedKinds.includes(kind)}
          disabled={error !== null}
          onChange={() => onToggle(kind)}
        >
          {LABELS[kind]}
        </Switch>
      ))}
      {/* Prototype copy, kept because it is TRUE: preferences live on the
          caller's own server-owned `UserPreferences` row, so they are global
          and no workspace can override them for one person.

          What is NOT ported is the prototype's per-row note — "Email and
          in-app", "One email on Monday" — and its Weekly digest row. No email
          delivery exists for notifications (only magic-link SMTP does), so
          those lines would be a promise the product cannot keep. That is the
          same invented-data trap the governing spec designs around, and it is
          why these rows carry a label and a switch but no second line. */}
      <p className="gn-account__note">
        These apply everywhere. A workspace cannot override them for you.
      </p>
    </section>
  );
}
