-- Up Migration
-- A project's FORMER prefixes (prefixes and groups plan Task 2, owner spec 2026-10-01 R1/R2).
-- The CURRENT prefix stays where it always was: `proj_projects.prefix` (entered) or derived from
-- `proj_projects.founding_name` (not entered). A former prefix is RESERVED: a derived prefix flees it
-- (`resolveProjectPrefixes`' `reserved` argument) and the door refuses it to any other project (Task 3).
CREATE TABLE proj_project_prefixes (
  project_id   text NOT NULL,
  workspace_id text NOT NULL,
  prefix       text NOT NULL,
  until_time   timestamptz NOT NULL,
  PRIMARY KEY (project_id, prefix)
);
CREATE INDEX proj_project_prefixes_ws ON proj_project_prefixes (workspace_id, prefix);

-- Down Migration
DROP TABLE proj_project_prefixes;
