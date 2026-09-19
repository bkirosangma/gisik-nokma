-- Up Migration

-- Door A (2026-09-19): a project carries a short description.
--
-- NUMBERS ABOVE 1789500000000, the highest applied migration, because a
-- migration numbered below an applied one can never run — and
-- `pnpm check:migrations` refuses the ordering before a database ever sees it.
--
-- ## NULL, not `NOT NULL DEFAULT ''`, and that is the whole of this column's
-- ## design
--
-- `archived` could take `NOT NULL DEFAULT false` because its two states are
-- exhaustive: a project founded before the pair existed is not archived, and
-- that is the truth. A description has THREE states — never set, set to
-- something, and set to nothing by a later edit that clears it — and only NULL
-- can carry the first. `''` would be the claim "this project has no
-- description", which is a fact about the project; NULL is the ABSENCE of a
-- claim, which is what a project nobody has described actually has.
--
-- **This is the same distinction `ProjectRef.ticketCount` makes with `null`
-- meaning WITHHELD**, and the same one the card renders differently. Collapsing
-- it here would put a claim in the table that no event ever made.
--
-- ## text, not json
--
-- `verify-projections` compares the live table against a rebuild with EXCEPT,
-- which needs an equality operator for every column it reads. That is the
-- recorded reason json was kept out of this table for `archived`, and a plain
-- description has no structure to store anyway.

ALTER TABLE proj_projects ADD COLUMN description text NULL;

COMMENT ON COLUMN proj_projects.description IS 'A short description of this project (door A, 2026-09-19), set on `project.created` and NULL for a project nobody has described. NULL is the ABSENCE of a claim and not the claim "no description" — the same withheld-vs-empty distinction `ProjectRef.ticketCount` draws, and the reason this column is nullable rather than NOT NULL DEFAULT ''''. It rides with the NAME through `visibleProjects`, which filters ROWS rather than columns: a caller who is not on a project receives no row at all, so this column is scoped exactly as `name` and `archived` are and introduces no new disclosure rule.';

-- Down Migration

ALTER TABLE proj_projects DROP COLUMN description;
