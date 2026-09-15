import { NOTIFICATION_KINDS, type NotificationKind } from '@gisik-nokma/domain';

const LABELS: Record<NotificationKind, string> = {
  assignment: 'A ticket is assigned to you',
  mention: 'You are mentioned in a comment or description',
  'contested-claim': 'A claim of yours is contested',
  'date-approaching': 'A date you are watching is approaching',
  'stale-ticket': 'A ticket has sat unmoved for a while',
};

export type NotificationsSectionProps = {
  mutedKinds: readonly NotificationKind[];
  onToggle: (kind: NotificationKind) => void;
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
export function NotificationsSection({ mutedKinds, onToggle }: NotificationsSectionProps) {
  return (
    <section className="gn-account__section gn-account__notifications">
      <h2 className="gn-account__section-title">Notifications</h2>
      {NOTIFICATION_KINDS.map((kind) => (
        <label key={kind} className="gn-account__notification-row">
          <input
            type="checkbox"
            checked={!mutedKinds.includes(kind)}
            onChange={() => onToggle(kind)}
          />
          {LABELS[kind]}
        </label>
      ))}
    </section>
  );
}
