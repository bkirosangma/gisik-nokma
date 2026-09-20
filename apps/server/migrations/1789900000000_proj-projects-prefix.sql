-- Up Migration

-- The ticket key, part 2 of 2 (owner spec 2026-09-20): a project carries the
-- prefix that forms the second half of every ticket key it will hold —
-- `CCSO-1183`.
--
-- NUMBERS ABOVE 1789800000000, the highest applied migration, because a
-- migration numbered below an applied one can never run — and
-- `pnpm check:migrations` refuses the ordering before a database ever sees it.
--
-- ⚠ RENUMBERED FROM 1789800000000 AT THE MERGE (2026-09-20), and the reason is worth
-- keeping: this file was written against a `main` whose highest migration was
-- 1789700000000, and while this branch ran, `main` gained
-- `1789800000000_proj-tickets-deleted.sql` — the SAME number. Two migrations sharing a
-- prefix are ordered by FILENAME, so which ran first was undetermined; worse, a
-- migration numbered AT the highest applied one can never run at all. A fresh test
-- database applies both cleanly, so no test and no gate could see it —
-- `pnpm check:migrations` is the only instrument that did, and it did it only because
-- the branch was re-measured after the merge rather than assumed still valid.
--
-- ## NULL, and NOTHING IS BACKFILLED — and both halves of that are deliberate
--
-- The column is nullable and this migration writes NO data into it, which makes
-- it the only column-addition in this series that leaves every existing row
-- NULL without a `DEFAULT`. `archived` could take `NOT NULL DEFAULT false`
-- because "not archived" is the truth about a project founded before the pair
-- existed; a prefix has no such truth. Every project in the ledger today was
-- founded before `project.created` could carry one, so NO EVENT EVER MADE A
-- CLAIM about its prefix, and a value written here would be a claim invented by
-- a migration.
--
-- **A backfill is not merely undesirable, it is impossible to make honest.**
-- Two independent walls:
--
--   1. The ledger REFUSES to be rewritten. `events` carries a
--      `BEFORE UPDATE OR DELETE` trigger that RAISES
--      (`1787841717635_events-and-snapshots.sql`, `events_append_only`), so the
--      honest repair — record the derived prefix as a claim on the founding
--      event — cannot be issued at all. Only the projection table is writable,
--      and a projection table is a DERIVED thing.
--   2. `tools/verify-projections.ts` diffs live against a rebuild with `EXCEPT`
--      in BOTH directions, and a rebuild replays the LEDGER. A prefix written
--      here and not derivable from the ledger would make the shadow row and the
--      live row disagree, and the verifier would report it — correctly. The
--      column can only ever hold what `project.created` said, or NULL.
--
-- ## What a NULL means, and who fills the gap
--
-- NULL means **no prefix was ever entered** — not "the prefix is empty", and
-- emphatically not "this project has no key". The key's second half is derived
-- from the project's NAME instead, by `derivePrefix` in
-- `packages/domain/src/prefix.ts`, which is a pure function of a ledger fact
-- and therefore returns the same answer on every read and every replay. A
-- reader resolves the two cases in one place with one rule: the stored prefix
-- where there is one, the derivation where there is not.
--
-- The derivation reproduces the prefixes the owner named on 2026-09-20 for the
-- three rows that exist — `Convenience Corner` -> `CC`, `Shop operations` ->
-- `SO`, `gggg` -> `GG` — so no dev-database data step is needed, and the rule is
-- the same one every other install gets.
--
-- text, not json: `verify-projections` compares with EXCEPT, which needs an
-- equality operator for every column it reads — the recorded reason json was
-- kept out of this table for `archived` and out of `proj_tickets.rank`.

ALTER TABLE proj_projects ADD COLUMN prefix text NULL;

COMMENT ON COLUMN proj_projects.prefix IS 'The project prefix (owner spec 2026-09-20): up to three capital letters, entered at project creation, immutable afterwards, and the second half of every ticket key this project holds — `CCSO-1183`. NULL means NO PREFIX WAS EVER ENTERED, which is true of every project founded before the field existed and is NOT the claim "this project has no key": a reader derives the half from the name instead (`packages/domain/src/prefix.ts`), a pure function of a ledger fact, so the key is stable across replays and matches what the owner would have typed. Nothing is backfilled here — the ledger refuses UPDATE (`events_append_only`) and a value that a ledger replay could not reproduce would fail `tools/verify-projections.ts`, which diffs live against a rebuild in both directions. Project prefixes are UNIQUE WITHIN A WORKSPACE by owner ruling, enforced at the door where the value is entered; the migration deliberately adds no unique index, because the door is the only writer that can be asked to choose again and an index would turn a duplicate into a hard error inside a projection.';

-- Down Migration

ALTER TABLE proj_projects DROP COLUMN prefix;
