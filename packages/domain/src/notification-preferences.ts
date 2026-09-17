import { z } from 'zod';
import { NOTIFICATION_KINDS } from './notifications.js';

/**
 * A person's own choice of which real notification kinds still reach their
 * Inbox and its unread count — global, never per-workspace (the inbox
 * itself is a global route, `NotificationsGateway.list()` takes no
 * workspace parameter). A MUTED list, not an enabled one: an empty list
 * and "no preference recorded" are the same state, which is what makes
 * "everything on by default" free rather than a second constant to keep
 * in sync with `NOTIFICATION_KINDS` as it grows.
 *
 * ## Why this is not a fourth key on `PreferencesDoc` (coordination note,
 * Task 5 of the account/help-screens plan)
 *
 * `PreferencesDoc` (`./preferences.ts`) is keyed `(user_id, workspace_id)`
 * end to end — its schema is `.strict()` with all three keys required, and
 * `apps/server/src/tools/sweep-user-preferences.ts` deletes a row 30 days
 * after the membership that made it reachable is revoked. Every part of
 * that design assumes "this preference belongs to one workspace." A muted
 * kind belongs to nobody's workspace — bolting it onto `PreferencesDoc`
 * would force the Inbox to pick an arbitrary workspace just to read a
 * setting with nothing to do with any one of them, and a membership
 * revocation in any ONE workspace would sweep away a preference the sweep
 * has no business touching. A table keyed by `user_id` alone avoids both.
 *
 * ## What muting changes, and what it does not
 *
 * Muting a kind hides it from what is READ — the Inbox list and the unread
 * count — it never stops the row from being WRITTEN. `notifications/fanout.ts`
 * still inserts a row for a muted kind; the filter lives entirely on the read
 * side (`listNotifications`, `unreadNotificationCount`). Preferences arrange
 * what is shown; they do not change what happened — the same statement
 * `preferences.ts` makes about view preferences, one step further from the
 * ledger: those arrange RECORDED work, this arranges DELIVERY of a message
 * about it.
 */
export const notificationPreferencesSchema = z
  .object({
    mutedKinds: z.array(z.enum(NOTIFICATION_KINDS)).max(NOTIFICATION_KINDS.length),
  })
  .strict();
export type NotificationPreferences = z.infer<typeof notificationPreferencesSchema>;

/**
 * What a person who has never saved a preference reads: everything on.
 *
 * A frozen module-level constant, the same reasoning `EMPTY_PREFERENCES`
 * states: nothing mutates a preferences document in place (a PUT replaces it
 * whole), so one shared instance is safe, and `Object.freeze` is what keeps
 * a future caller from turning "safe" into "assumed." `Object.freeze` is
 * SHALLOW, so `mutedKinds` is frozen explicitly too — a caller that pushed
 * into `EMPTY_NOTIFICATION_PREFERENCES.mutedKinds` would otherwise be
 * editing every future "this person has muted nothing" answer at once.
 * Built through a function with a typed local, not a cast on a frozen
 * literal, because `Object.freeze([])` is `readonly never[]`, which is NOT
 * assignable to `NotificationKind[]`.
 */
function emptyNotificationPreferences(): NotificationPreferences {
  const doc: NotificationPreferences = { mutedKinds: [] };
  Object.freeze(doc.mutedKinds);
  return Object.freeze(doc);
}

export const EMPTY_NOTIFICATION_PREFERENCES: NotificationPreferences = emptyNotificationPreferences();
