-- Up Migration

-- User-level My work preferences (my-work-global plan, Task 2): the "Show"
-- filter and the "Group" toggle of the global `/my-work` page, remembered per
-- person. Keyed by `user_id` alone for the reason
-- `user_notification_preferences` is (see
-- `packages/domain/src/my-work-preferences.ts`): the page spans every
-- workspace, so there is no one workspace to key it by. Rows, not ledger
-- events: a view choice arranges what is shown and says nothing about the
-- work. The whole document is replaced by `putMyWorkPreferences`, validated by
-- zod on the way in and out.
CREATE TABLE user_my_work_preferences (
  user_id    text PRIMARY KEY,
  doc        jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE user_my_work_preferences IS 'AUTHORED, one row per user (global, never per-workspace). NOT a projection. Absent means DEFAULT_MY_WORK_PREFERENCES.';

-- Down Migration

DROP TABLE IF EXISTS user_my_work_preferences;
