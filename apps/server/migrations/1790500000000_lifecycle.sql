-- Up Migration
-- Trash series, Plan 1 (spec docs/superpowers/specs/2026-09-23-trash-and-purge-design.md §4).
-- proj_workspaces holds a workspace's LIFECYCLE only. A row exists only once a lifecycle
-- event names the workspace: absence is "live, unarchived, unmarked", and no backfill is
-- written because a ledger rebuild would not write one either (verifyProjections diffs both ways).
CREATE TABLE proj_workspaces (
  workspace_id    text PRIMARY KEY,
  archived        boolean NOT NULL DEFAULT false,
  deleted_at      timestamptz NULL,
  deleted_by      text NULL,
  purge_marked_at timestamptz NULL,
  purge_marked_by text NULL
);
ALTER TABLE proj_projects
  ADD COLUMN deleted_at timestamptz NULL, ADD COLUMN deleted_by text NULL,
  ADD COLUMN purge_marked_at timestamptz NULL, ADD COLUMN purge_marked_by text NULL;
ALTER TABLE proj_tickets
  ADD COLUMN purge_marked_at timestamptz NULL, ADD COLUMN purge_marked_by text NULL;
ALTER TABLE proj_notes
  ADD COLUMN deleted_at timestamptz NULL, ADD COLUMN deleted_by text NULL,
  ADD COLUMN purge_marked_at timestamptz NULL, ADD COLUMN purge_marked_by text NULL;
COMMENT ON COLUMN proj_projects.purge_marked_at IS 'The server_time of the latest purge.marked not undone by a purge.unmarked. The purge is due PURGE_DELAY_DAYS later (packages/domain/src/lifecycle.ts); the due instant is derived, never stored.';

-- Down Migration
ALTER TABLE proj_notes DROP COLUMN purge_marked_by, DROP COLUMN purge_marked_at, DROP COLUMN deleted_by, DROP COLUMN deleted_at;
ALTER TABLE proj_tickets DROP COLUMN purge_marked_by, DROP COLUMN purge_marked_at;
ALTER TABLE proj_projects DROP COLUMN purge_marked_by, DROP COLUMN purge_marked_at, DROP COLUMN deleted_by, DROP COLUMN deleted_at;
DROP TABLE proj_workspaces;
