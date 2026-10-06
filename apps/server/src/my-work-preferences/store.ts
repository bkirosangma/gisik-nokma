import {
  myWorkPreferencesSchema,
  DEFAULT_MY_WORK_PREFERENCES,
  type MyWorkPreferences,
} from '@gisik-nokma/domain';
import type { Queryable } from '../db/queryable.js';

/**
 * One person's My work page choices, or the default (created by me and
 * assigned to me, grouped by workspace and project) when they never saved
 * one — "never saved" has no `null` arm, the same collapse
 * `getNotificationPreferences` makes.
 *
 * Re-validated on the way OUT through the schema that gates the way in, for
 * the reason `getNotificationPreferences` states: it fails only after a future
 * schema tightening, and a 500 is more honest than silently answering the
 * default over what the person actually chose.
 */
export async function getMyWorkPreferences(db: Queryable, userId: string): Promise<MyWorkPreferences> {
  const { rows } = await db.query<{ doc: unknown }>(
    'SELECT doc FROM user_my_work_preferences WHERE user_id = $1',
    [userId],
  );
  const row = rows[0];
  if (row === undefined) return DEFAULT_MY_WORK_PREFERENCES;
  return myWorkPreferencesSchema.parse(row.doc);
}

/**
 * Replaces one person's document whole — the FULL REPLACE
 * `putNotificationPreferences` uses: one writer per key (the session), so
 * last-writer-wins between that person's devices is the whole concurrency
 * story.
 */
export async function putMyWorkPreferences(
  db: Queryable,
  userId: string,
  prefs: MyWorkPreferences,
): Promise<void> {
  await db.query(
    `INSERT INTO user_my_work_preferences (user_id, doc, updated_at)
     VALUES ($1, $2, now())
     ON CONFLICT (user_id) DO UPDATE SET doc = EXCLUDED.doc, updated_at = now()`,
    [userId, JSON.stringify(prefs)],
  );
}
