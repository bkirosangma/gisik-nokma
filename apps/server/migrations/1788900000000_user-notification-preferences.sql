-- Up Migration

-- Global, per-kind notification preferences (account/help-screens plan, Task
-- 5). NOT an extension of `user_preferences` (spec §5's obvious default) —
-- see `packages/domain/src/notification-preferences.ts` for why: that table
-- is keyed `(user_id, workspace_id)` end to end and its rows are swept 30
-- days after the membership that made them reachable is revoked
-- (`apps/server/src/tools/sweep-user-preferences.ts`), and the Inbox is a
-- global route with no workspace of its own to pin a preference to. A
-- second AUTHORED table keyed by `user_id` alone avoids both problems.
--
-- Rows here, not ledger events, for the same reason `user_preferences` is
-- rows and not events (coordination amendment 14): a muted-kinds list
-- ARRANGES which messages a person is shown, it says nothing about the work
-- itself, so there is nothing to attribute and nothing a replica must
-- replay.
--
-- `muted_kinds` is a MUTE list, not an enable list: an empty array and "no
-- row at all" read as the identical answer through
-- `getNotificationPreferences` (`EMPTY_NOTIFICATION_PREFERENCES`), which is
-- what makes "everything on by default" free instead of a second constant
-- that has to be kept in sync with the kind vocabulary as it grows.
--
-- `text[]` and not a normalised join table: five kinds today, no query ever
-- needs to join against a single muted kind, and the whole document is
-- replaced wholesale by `putNotificationPreferences` exactly the way
-- `user_preferences.doc` is — there is no partial update to make a join
-- table earn its cost.
--
-- The CHECK below mirrors `notifications_kind_check` and keeps every row
-- honest at the database boundary too, not only at the zod door: `<@` reads
-- "is a subset of". This is a FOURTH copy of the five-kind list (domain
-- schema, `notifications` table's CHECK, the reporting-scope-guard's closed
-- vocabulary assertion (11.181), and this one) — accepted anyway, the same
-- way `notifications_kind_check` already is, because a kind can only be
-- ADDED through a migration in this table too, and a schema-level guard that
-- only the application enforces would leave a hand-written INSERT (or a
-- future writer that forgets to import the zod schema) free to store a kind
-- number could never mean.
CREATE TABLE user_notification_preferences (
  user_id     text        NOT NULL,
  muted_kinds text[]      NOT NULL DEFAULT '{}',
  updated_at  timestamptz NOT NULL
);

ALTER TABLE user_notification_preferences
  ADD CONSTRAINT user_notification_preferences_pk PRIMARY KEY (user_id);

ALTER TABLE user_notification_preferences
  ADD CONSTRAINT user_notification_preferences_muted_kinds_check
  CHECK (muted_kinds <@ ARRAY['assignment', 'mention', 'contested-claim', 'date-approaching', 'stale-ticket']::text[]);

COMMENT ON TABLE user_notification_preferences IS 'AUTHORED, one row per user (global — never per-workspace, because the Inbox itself is a global route). NOT a projection: nothing derives it from the ledger and nothing rebuilds it. A mute list, not an enable list: absent and empty both mean everything on.';

COMMENT ON COLUMN user_notification_preferences.user_id IS 'The person whose preference this is. Written only from the SESSION — no request parameter names it.';
COMMENT ON COLUMN user_notification_preferences.muted_kinds IS 'NotificationKind values this person no longer wants to see in their Inbox or its unread count. Replaced wholesale by PUT, validated by zod on the way in and out; the CHECK is the database''s own copy of the same closed vocabulary.';
COMMENT ON COLUMN user_notification_preferences.updated_at IS 'When the row was last replaced, from Postgres now(). On no response and read by nothing — kept for operators, the same standing `user_preferences.updated_at` has.';

-- Down Migration

DROP TABLE user_notification_preferences;
