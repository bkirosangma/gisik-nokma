-- Up Migration

-- The snapshot write token (wtg2 fold-version writer token, planner ruling F, its clocks ruled 2026-10-05 18:31).
-- During a rolling deploy the OLD instance keeps running main's `overwriteSnapshot`, whose `ON CONFLICT ... DO UPDATE`
-- sets `state` and `provenance` but not `fold_version`. When it refreshes a ticket row the new instance has already
-- restated, it writes old-shape state (no work periods), and the row keeps the current `fold_version` and its old
-- `created_at`. Neither the snapshot pass's due query nor ruling E (`bootRestate.dueAt`) sees that row, so a schema-5
-- device that bootstraps the ticket is stranded until the ticket's next snapshot. The new code cannot change what the
-- old code writes, but the database can change what is done with the write, and this migration runs before the new
-- instance boots, while the old one is still live.
--
-- So every new writer sets a fresh `write_token` on every write (`apps/server/src/ledger/snapshot-store.ts`), and an
-- UPDATE of a ticket row that leaves the token as it was, which is exactly the old code's UPDATE, is DEMOTED:
-- `fold_version` 1, so the next snapshot pass restates it, and `created_at` the write's own clock, which is later than
-- the boot pass's `dueAt`, so ruling E refuses the row retryably until then. `clock_timestamp()`, not `now()`: the old
-- instance's publish refresh runs inside its ingest transaction, and `now()` is that transaction's START, which can
-- precede `dueAt` (then ruling E would serve the row as a restate that failed). `created_at`'s default moves to the
-- insert's own clock for the same reason: an old instance's INSERT inside that transaction is not stamped before `dueAt`.
--
-- It fails safe: a new UPDATE path that forgets the token costs one restate, never a stale serve. The trigger is
-- permanent and harmless once every writer sets the token. The residual it does not close (ruled accepted, 18:31): an old
-- transaction that WRITES before the boot pass reads `dueAt` but COMMITS after its due query is invisible to the pass,
-- and its row is served as a restate that failed.
ALTER TABLE snapshots ADD COLUMN write_token uuid NULL;
ALTER TABLE snapshots ALTER COLUMN created_at SET DEFAULT clock_timestamp();

CREATE FUNCTION snapshots_demote_tokenless_update() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.entity_kind = 'ticket'
     AND NEW.write_token IS NOT DISTINCT FROM OLD.write_token THEN
    NEW.fold_version := 1;
    NEW.created_at := clock_timestamp();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER snapshots_demote_tokenless_update
  BEFORE UPDATE ON snapshots
  FOR EACH ROW EXECUTE FUNCTION snapshots_demote_tokenless_update();

COMMENT ON COLUMN snapshots.write_token IS
  'Fresh on every write by a writer that knows fold versions (gen_random_uuid()). An UPDATE of a ticket row that leaves it unchanged is an old instance''s during a rolling deploy (its DO UPDATE sets no fold_version), so snapshots_demote_tokenless_update demotes that row: fold_version 1 and created_at the write''s clock, so the bootstrap refuses it retryably and the next pass restates it.';
COMMENT ON TRIGGER snapshots_demote_tokenless_update ON snapshots IS
  'Demotes a ticket-row UPDATE that did not set a fresh write_token (an old instance''s write during a rolling deploy, or a new path that forgot it): fold_version 1 and created_at clock_timestamp(), so the row is restated rather than served stale. Fails safe: a forgotten token costs one restate.';

-- Down Migration

DROP TRIGGER snapshots_demote_tokenless_update ON snapshots;
DROP FUNCTION snapshots_demote_tokenless_update();
ALTER TABLE snapshots ALTER COLUMN created_at SET DEFAULT now();
ALTER TABLE snapshots DROP COLUMN write_token;
