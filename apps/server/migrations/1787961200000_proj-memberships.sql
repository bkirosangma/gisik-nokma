-- Up Migration

-- Projection: membership history becomes current membership rows (Plan 4 Task 4).
--
-- project_id '' is the workspace-scope sentinel. A Postgres primary key cannot
-- contain NULLs, and '' never collides with a real ULID, so the composite key
-- holds both scopes in one table without a partial-unique trick.
--
-- No json/jsonb column here, deliberately: `json` has no equality operator and
-- tools/verify-projections.ts diffs with EXCEPT, which needs one for every
-- column it compares.

CREATE TABLE proj_memberships (
  workspace_id  text NOT NULL,
  user_id       text NOT NULL,
  scope_kind    text NOT NULL CHECK (scope_kind IN ('workspace', 'project')),
  project_id    text NOT NULL DEFAULT '',
  role          text NOT NULL CHECK (role IN ('owner', 'admin', 'member', 'guest')),
  project_admin boolean NOT NULL DEFAULT false,
  granted_by    text NOT NULL,
  granted_at    timestamptz NOT NULL,
  workspace_seq bigint NOT NULL,
  CONSTRAINT proj_memberships_workspace_scope_has_no_project
    CHECK ((scope_kind = 'workspace') = (project_id = '')),
  PRIMARY KEY (workspace_id, user_id, scope_kind, project_id)
);

COMMENT ON TABLE proj_memberships IS 'Projection: one row per membership identity — a user''s workspace-scope role, plus a row per project they are on. Rebuildable from the ledger; never authored. READ IT THROUGH resolveEffectiveRole (src/permissions/effective-role.ts), never directly: a project-scope row alone does NOT mean the user is still in the workspace, because membership.revoked may only delete what its own entity stream owns (see the module docblock for why). resolveEffectiveRole is where "no workspace membership means no project rights" is enforced.';
COMMENT ON COLUMN proj_memberships.project_id IS 'The project a project-scope row is about. '''' (empty string) is the workspace-scope sentinel — not a project id, and not NULL, because this column is part of the primary key.';
COMMENT ON COLUMN proj_memberships.role IS 'Workspace-scope rows carry the granted WorkspaceRole. Project-scope rows are always ''member'': project association is not a role grant (owner decision 2026-08-27 collapsed membership scope), and project-admin rights ride on project_admin, not on this column.';
COMMENT ON COLUMN proj_memberships.workspace_seq IS 'The workspace stream position (coordination §18) of the event that last wrote this row. Stored, not derived at apply time, so a replay reproduces it exactly and apply stays deterministic. It is the workspace cursor and NOT the per-entity seq: membership and project entities each run their own seq, so only this number is comparable across the two streams that write this table.';

CREATE INDEX proj_memberships_by_user_idx ON proj_memberships (user_id, workspace_id);
-- The roster access path: everyone on one project.
CREATE INDEX proj_memberships_by_project_idx ON proj_memberships (workspace_id, project_id)
  WHERE scope_kind = 'project';

-- Down Migration

DROP TABLE proj_memberships;
