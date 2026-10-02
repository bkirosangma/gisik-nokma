-- Up Migration
-- Project groups (prefixes and groups plan Task 6, spec R3/R4/R7). Both objects are
-- projections of the ledger: `proj_groups` from the four `group.*` events,
-- `proj_projects.group_id` from `project.updated {groupId}`. Rebuildable; never authored.

CREATE TABLE proj_groups (
  group_id     text PRIMARY KEY,
  workspace_id text NOT NULL,
  parent_id    text NULL,
  level        smallint NOT NULL CHECK (level BETWEEN 1 AND 4),
  name         text NOT NULL,
  rank         text NOT NULL,
  created_by   text NOT NULL,
  created_at   timestamptz NOT NULL
);

-- Sibling names are unique ignoring case (R4). The same name under a DIFFERENT parent
-- is a different group. An L1 group has no parent, so NULL is folded to '' for the key.
CREATE UNIQUE INDEX proj_groups_sibling_name ON proj_groups (workspace_id, COALESCE(parent_id, ''), lower(name));
CREATE INDEX proj_groups_workspace_idx ON proj_groups (workspace_id);

COMMENT ON TABLE proj_groups IS 'Projection: one row per live project group, from group.created / renamed / reordered / deleted. A deleted group''s row is removed. The door (checkGroupRules) refuses a delete while a project points at the group or children exist, so no row ever dangles.';

ALTER TABLE proj_projects ADD COLUMN group_id text NULL;
COMMENT ON COLUMN proj_projects.group_id IS 'The group this project is filed under, from the last project.updated that carried groupId (null ungroups). NULL = ungrouped, and is also the value for every project that predates groups.';

-- Down Migration
ALTER TABLE proj_projects DROP COLUMN group_id;
DROP TABLE proj_groups;
