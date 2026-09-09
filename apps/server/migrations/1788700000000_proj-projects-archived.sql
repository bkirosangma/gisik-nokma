-- Up Migration

-- Task 16 (HIG per-screen plan, owner brief 2026-09-09): a project can be put
-- away without being deleted.
--
-- NOT NULL DEFAULT false is what makes this an additive migration rather than a
-- rebuild: every project founded before the event pair existed is not archived,
-- which is both the truth and what `project.created` alone would produce on a
-- replay. The projection writes the column from `project.archived` /
-- `project.restored` and from nothing else, so the table stays a pure function
-- of the project streams.
--
-- boolean, not a timestamp: "when was it archived" is a ledger question and the
-- ledger answers it. A stored `archived_at` would be a second source for the
-- same fact, and the one that drifts. It is also a type verify-projections can
-- diff — that tool compares live against a rebuild with EXCEPT, which needs an
-- equality operator for every column it reads (the same constraint that keeps
-- json out of this table).

ALTER TABLE proj_projects ADD COLUMN archived boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN proj_projects.archived IS 'Whether this project has been archived, folded from the project.archived / project.restored pair on the project''s own stream (last writer wins on this column alone, exactly as a rename would be). Archiving is not a delete and it is not a permission: nothing in src/permissions/ reads this column, no membership changes, and checkProjectExists still answers true for an archived project — the invitation gate depends on a founded project staying founded. It decides only where a project is LISTED.';

-- Down Migration

ALTER TABLE proj_projects DROP COLUMN archived;
