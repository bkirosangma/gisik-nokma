-- Up Migration

-- Workflow and timeline graphs (Part 2, NT-3; wtg2 T18): two new notification kinds, `flow-ready` and
-- `flow-reopened`, which makes seven. A kind can only be ADDED through a migration, in both tables that fix the
-- vocabulary at the database boundary. The old migration files are NOT edited: this drops and re-adds the two
-- explicitly named constraints (`1788437881385_notifications.sql:13`, `1788900000000_user-notification-preferences.sql:49-51`).
ALTER TABLE notifications DROP CONSTRAINT notifications_kind_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_kind_check
  CHECK (kind IN ('assignment', 'mention', 'contested-claim', 'date-approaching', 'stale-ticket', 'flow-ready', 'flow-reopened'));
ALTER TABLE user_notification_preferences DROP CONSTRAINT user_notification_preferences_muted_kinds_check;
ALTER TABLE user_notification_preferences ADD CONSTRAINT user_notification_preferences_muted_kinds_check
  CHECK (muted_kinds <@ ARRAY['assignment', 'mention', 'contested-claim', 'date-approaching', 'stale-ticket', 'flow-ready', 'flow-reopened']::text[]);

-- Down Migration

-- DESTRUCTIVE by necessity: a row of a kind the restored CHECK refuses cannot stay. Notifications are server-owned
-- per-user messages, not ledger events (`packages/domain/src/notifications.ts`), so deleting the two new kinds loses
-- nothing the ledger holds; a mute of a kind that no longer exists means nothing. Rows and mutes go FIRST: a CHECK is
-- validated against the rows already in the table when it is added.
DELETE FROM notifications WHERE kind IN ('flow-ready', 'flow-reopened');
UPDATE user_notification_preferences SET muted_kinds = array_remove(array_remove(muted_kinds, 'flow-ready'), 'flow-reopened')
 WHERE muted_kinds && ARRAY['flow-ready', 'flow-reopened']::text[];
ALTER TABLE notifications DROP CONSTRAINT notifications_kind_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_kind_check
  CHECK (kind IN ('assignment', 'mention', 'contested-claim', 'date-approaching', 'stale-ticket'));
ALTER TABLE user_notification_preferences DROP CONSTRAINT user_notification_preferences_muted_kinds_check;
ALTER TABLE user_notification_preferences ADD CONSTRAINT user_notification_preferences_muted_kinds_check
  CHECK (muted_kinds <@ ARRAY['assignment', 'mention', 'contested-claim', 'date-approaching', 'stale-ticket']::text[]);
