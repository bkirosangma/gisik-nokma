import {
  notificationPreferencesSchema,
  EMPTY_NOTIFICATION_PREFERENCES,
  type NotificationPreferences,
} from '@gisik-nokma/domain';
import type { Queryable } from '../db/queryable.js';

/**
 * One person's global choice of which notification kinds still reach their
 * Inbox, or the empty (everything-on) preference.
 *
 * "Never set" and "set to the empty mute list" are ONE answer, the same
 * collapse `preferences/store.ts` makes for `PreferencesDoc`: a missing row
 * answers `EMPTY_NOTIFICATION_PREFERENCES` and there is no `null` arm to
 * tell "never saved" apart from "saved, muting nothing" — there is no
 * behaviour a caller could hang on the difference.
 *
 * The stored row is re-validated on the way OUT through the same schema
 * that gates the way in, for the reason `getPreferences` states: this parses
 * only after a future schema TIGHTENING, and throwing (rather than silently
 * answering the empty default, which would erase what a user actually
 * chose) is the honest failure — a 500 via the app's `INTERNAL_ERROR_BODY`.
 */
export async function getNotificationPreferences(
  db: Queryable,
  userId: string,
): Promise<NotificationPreferences> {
  const { rows } = await db.query<{ muted_kinds: string[] }>(
    'SELECT muted_kinds FROM user_notification_preferences WHERE user_id = $1',
    [userId],
  );
  const row = rows[0];
  if (row === undefined) return EMPTY_NOTIFICATION_PREFERENCES;
  return notificationPreferencesSchema.parse({ mutedKinds: row.muted_kinds });
}

/**
 * Replaces one person's global preference, whole — the same FULL REPLACE
 * `putPreferences` uses and for the same reason: a merge cannot express a
 * deletion (un-muting a kind), and there is exactly one writer per key (the
 * session), so last-writer-wins between that person's own devices is the
 * whole concurrency story.
 */
export async function putNotificationPreferences(
  db: Queryable,
  userId: string,
  prefs: NotificationPreferences,
): Promise<void> {
  await db.query(
    `INSERT INTO user_notification_preferences (user_id, muted_kinds, updated_at)
     VALUES ($1, $2, now())
     ON CONFLICT (user_id) DO UPDATE SET muted_kinds = EXCLUDED.muted_kinds, updated_at = now()`,
    [userId, prefs.mutedKinds],
  );
}
