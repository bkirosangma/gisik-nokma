-- Up Migration

-- Projection: one row per project that was actually founded (Plan 4 Task 9
-- Step 3b, owner decision 2026-08-26). It exists for ONE question — does the
-- project this event names exist in this workspace — asked before any
-- membership question, so that a fabricated project id is reported as a
-- nonexistent project rather than as a membership problem.
--
-- Nothing in the series validated `ticket.created.projectId` before this table.
-- What covered the common case by accident was the project-membership check:
-- nobody is a member of a project that does not exist. But `proj_memberships`
-- is built from `project.member_added`, which accepts any non-empty ULID as a
-- project scope without checking it either — so granting yourself membership on
-- a typo'd id got the ticket accepted, and it landed in proj_visibility with a
-- dangling project_id, on no board and in no project list, with nobody told.
--
-- text/timestamptz only, no json: tools/verify-projections.ts diffs with EXCEPT
-- and needs an equality operator for every column it compares.

CREATE TABLE proj_projects (
  project_id   text PRIMARY KEY,
  workspace_id text NOT NULL,
  name         text NOT NULL,
  created_by   text NOT NULL,
  created_at   timestamptz NOT NULL
);

CREATE INDEX proj_projects_workspace_idx ON proj_projects (workspace_id);

COMMENT ON TABLE proj_projects IS 'Projection: one row per founded project, from project.created alone. Rebuildable from the ledger; never authored. Its whole purpose is the existence precondition in src/permissions/check-permission.ts (checkProjectExists), which runs BEFORE the project-membership check so that the honest reason wins wherever both would fire. Every key is written by exactly one totally-ordered stream — the project entity''s own — so no cross-entity interleaving can change the row set.';

COMMENT ON COLUMN proj_projects.project_id IS 'The project entity''s id. Primary key, and deliberately not composite with workspace_id: an entity id is a ULID and belongs to exactly one workspace, so a second workspace claiming the same id would be a collision to refuse rather than a row to add. projectExists() still scopes its lookup by workspace, so a real id asked under the wrong workspace is not "found".';
COMMENT ON COLUMN proj_projects.created_by IS 'The actor of the project.created claim. Provenance, kept because every projection here keeps it; nothing in the permission checks reads it today.';
COMMENT ON COLUMN proj_projects.created_at IS 'The RECEIVED instant (events.server_time) of the project.created claim, never a clock read at apply time — a projection that read a clock would not be a pure function of the ledger and every rebuild would disagree with live.';

-- Down Migration

DROP TABLE proj_projects;
