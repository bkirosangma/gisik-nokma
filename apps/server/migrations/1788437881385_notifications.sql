-- Up Migration

CREATE TABLE notifications (
  id           text NOT NULL PRIMARY KEY,
  user_id      text NOT NULL,
  workspace_id text NOT NULL,
  kind         text NOT NULL,
  dedupe_key   text NOT NULL,
  payload      jsonb NOT NULL,
  read         boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notifications_user_dedupe_unique UNIQUE (user_id, dedupe_key),
  CONSTRAINT notifications_kind_check CHECK (kind IN ('assignment', 'mention', 'contested-claim', 'date-approaching', 'stale-ticket'))
);

CREATE INDEX notifications_user_id_idx ON notifications (user_id, id DESC);
CREATE INDEX notifications_user_unread_idx ON notifications (user_id) WHERE read = false;

COMMENT ON TABLE notifications IS 'Per-user rows outside the projection registry: never re-derived from the ledger, so replay must never re-create a row. Rows are NOT redacted when a recipient''s visibility to the underlying ticket is later revoked (Plan 9 ruling) — a message already delivered stays delivered.';

-- Down Migration

DROP TABLE notifications;
