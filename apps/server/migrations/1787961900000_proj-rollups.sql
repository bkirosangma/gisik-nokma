-- Up Migration

-- Projection: one row per parent ticket, holding the counts of its DIRECT
-- children by state category. Plan 3 Chain B Task 11; coordination §8 position
-- 6, directly after proj_tickets, because every number in this table is read
-- out of proj_tickets inside the SAME ingest transaction.
--
-- ## Derived, never authored — and a STALE row breaks that as badly as an
-- ## invented one
--
-- No event in the vocabulary authors a rollup. There is no `rollup.*` type, no
-- payload field this table takes a number from, and no writer but
-- `src/projections/rollups.ts`. Every row is a full recomputation of
-- `count(*) FILTER (WHERE state_category = …)` over proj_tickets.
--
-- "Never authored" is therefore not only "nobody may INSERT a number". A row
-- that no longer matches the children it claims to count is an assertion this
-- table is making on its own account, which is exactly what authored means
-- here. That is why the trigger set in `rollups.ts` is enumerated against
-- every event that can move a child's `parent_id`, `state_category` or
-- `project_id`, rather than against the events somebody remembered.
--
-- ## `open_children` is NOT the parent-terminal invariant's "open children"
--
-- The invariant (spec §4, `checks/hierarchy.ts`) asks for the NON-TERMINAL
-- direct children — `open` PLUS `active` — which is `total_children -
-- terminal_children`. This column is the `open` category alone. The two agree
-- only while no child is `active`, so a reader who takes this column for the
-- invariant's number is right in every fixture with two states and wrong in
-- the product. `test/proj-rollups.test.ts` asserts both numbers off the same
-- row precisely where they differ (0 versus 1).
--
-- ## Keys, constraints and what they enforce
--
-- The primary key is `parent_ticket_id` ALONE, for proj_tickets' reason: a
-- ticket id is an entity ULID, unique across the whole ledger, so a composite
-- `(workspace_id, parent_ticket_id)` would let one parent hold two rows and
-- the recompute's `ON CONFLICT` would stop being a single-row upsert.
--
-- `total_children > 0` is the "absence, not zeros" rule made unbreakable by
-- the database rather than promised by a comment: a childless parent has NO
-- ROW here, because `{0, 0, 0, 0}` would assert that a parent with no children
-- exists, and Plan 4's read path (`src/visibility/rollup.ts`) answers `null`
-- for a leaf on the same reasoning.
--
-- `total_children = open_children + active_children + terminal_children` holds
-- because proj_tickets' `state_category` is NOT NULL under a CHECK admitting
-- exactly those three values. Stated as a constraint so a fourth category, or
-- a FILTER that stopped counting one of them, fails at the write instead of
-- reading back as a plausible smaller number.
--
-- Counts are `integer`, not `bigint`: `count(*)` is bigint in Postgres and
-- narrows on insert, `createPool` installs an int8 parser so either would read
-- back as a JS number, and `RollupRow`'s fields are `number`. A workspace with
-- more than two billion direct children of one ticket has a different problem.
--
-- No column is `json` (the registry contract forbids it — the verifier's
-- EXCEPT diff needs an equality operator); every column here is a scalar, so
-- the question does not arise beyond saying it was asked.
--
-- The index is `(workspace_id, project_id)`, which serves the project-wide
-- DELETE `recomputeProject` runs on every reparent. The per-parent recompute
-- reads proj_tickets through ITS `(workspace_id, parent_id)` index and writes
-- here by primary key, so it needs nothing else.

CREATE TABLE proj_rollups (
  parent_ticket_id  text NOT NULL PRIMARY KEY,
  workspace_id      text NOT NULL,
  project_id        text NOT NULL,
  total_children    integer NOT NULL,
  open_children     integer NOT NULL,
  active_children   integer NOT NULL,
  terminal_children integer NOT NULL,
  CONSTRAINT proj_rollups_has_children_check
    CHECK (total_children > 0),
  CONSTRAINT proj_rollups_categories_total_check
    CHECK (total_children = open_children + active_children + terminal_children)
);

CREATE INDEX proj_rollups_project_idx ON proj_rollups (workspace_id, project_id);

COMMENT ON TABLE proj_rollups IS 'Projection: direct-children progress per parent ticket, counted per state category out of proj_tickets. Rebuildable from the ledger; NEVER authored — no event carries these numbers, and a row that has gone stale against its children is as much a violation of that as an invented one. Childless parents are ABSENT, not zeroed.';

COMMENT ON COLUMN proj_rollups.parent_ticket_id IS 'The parent. Primary key alone, not composite with workspace_id: a ticket id is a globally unique entity ULID, so a composite key would let one parent hold two rows and the recompute''s ON CONFLICT would stop being a single-row upsert.';
COMMENT ON COLUMN proj_rollups.project_id IS 'The project the counted children are in, which is also the parent''s: hierarchy.cross-project (packages/rule-engine/src/checks/hierarchy.ts) refuses both a creation and a reparent whose parent sits in another project, so every child of one parent shares one project. That refusal is what makes the recompute''s min(project_id) exact rather than an arbitrary pick, and what makes the project-scoped DELETE on reparent safe.';
COMMENT ON COLUMN proj_rollups.total_children IS 'DIRECT children only — never the transitive subtree. Direct-only suffices for the parent-terminal invariant by induction: the refusal holds at every level, so a terminal child''s own subtree was already settled when it went terminal. Constrained > 0 because a childless parent has no row at all.';
COMMENT ON COLUMN proj_rollups.open_children IS 'Direct children whose state_category is exactly ''open''. THIS IS NOT the parent-terminal invariant''s "open children", which is the NON-TERMINAL children — open plus active — and is total_children - terminal_children. The two are equal only while nothing is active.';
COMMENT ON COLUMN proj_rollups.terminal_children IS 'Direct children in a terminal category. total_children - terminal_children is the number the parent-terminal invariant reads, and the number a workflow republish can move without anybody touching a ticket: this table consumes workflow.defined for exactly that reason.';

-- Down Migration

DROP TABLE proj_rollups;
