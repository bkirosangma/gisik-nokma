-- Up Migration

-- A rename must never re-key a project (owner, 2026-10-01: a project's ticket
-- keys are frozen at founding, entered or derived).
--
-- A project founded WITHOUT an entered prefix gets one DERIVED from its name by
-- the reader (`resolveProjectPrefixes`), and until now the reader derived from
-- `proj_projects.name`. `project.updated` (#862) rewrites that column, so a
-- rename silently re-keyed every ticket in the project and could shift a
-- neighbour's derived prefix when two bases collide. This column is what the
-- reader derives from instead: the name the project was FOUNDED under, written
-- by `project.created` and by nothing else — the same rule workspaces already
-- follow (`workspaces/workspace-name.ts` derives from the founding name).
--
-- Added nullable, backfilled, then NOT NULL, in that order inside one
-- migration, so no row is ever readable without it.
--
-- The backfill reads each project's FIRST `project.created` by `seq`, because
-- the projection is first-writer-wins (`ON CONFLICT DO NOTHING`) and a rebuild
-- replays by (entity_kind, entity_id, seq): picking any other claim would make
-- the backfilled value disagree with a rebuild and `verify-projections` would
-- report the drift.
--
-- A row with no `project.created` in the ledger cannot exist — the projection
-- creates a row from that event alone — but a migration that fails on a live
-- deploy is a worse outcome than a fallback, so such a row (should one ever
-- appear) takes its current name. That is the only case in which this column
-- is not a pure function of the ledger, and a rebuild would not reproduce it.

ALTER TABLE proj_projects ADD COLUMN founding_name text;

UPDATE proj_projects p
   SET founding_name = f.founding_name
  FROM (
    SELECT DISTINCT ON (entity_id) entity_id, payload->>'name' AS founding_name
      FROM events
     WHERE entity_kind = 'project' AND type = 'project.created'
     ORDER BY entity_id, seq
  ) f
 WHERE f.entity_id = p.project_id;

UPDATE proj_projects SET founding_name = name WHERE founding_name IS NULL;

ALTER TABLE proj_projects ALTER COLUMN founding_name SET NOT NULL;

COMMENT ON COLUMN proj_projects.founding_name IS 'The name this project was FOUNDED under: written by project.created and never by project.updated. The reader derives an un-entered project prefix from THIS, not from name, so a rename never moves a ticket key (owner, 2026-10-01). Backfilled from each project''s first project.created event; reproducible from the ledger, so verify-projections diffs it.';

-- Down Migration

ALTER TABLE proj_projects DROP COLUMN founding_name;
