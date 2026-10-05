-- Up Migration

-- Work periods (Workflow and Timeline graphs T9, WP-1, ES-4, PS-2). `periods` is the fold; `started_at` and `ended_at` are
-- DERIVED from it by the projection (the first period's start, the last period's end while closed) for the sweep and the
-- index. Existing rows read as no periods until `rebuild:projection proj_tickets` replays the ledger (the owner's deploy
-- step). `snapshots.fold_version` marks which fold wrote a snapshot (1 = before periods); the snapshot pass restates a
-- row below the current version.
ALTER TABLE proj_tickets
  ADD COLUMN started_at timestamptz NULL,
  ADD COLUMN ended_at timestamptz NULL,
  ADD COLUMN periods jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN rounds integer NOT NULL DEFAULT 1 CHECK (rounds >= 1),
  ADD COLUMN closed_cause jsonb NULL;
ALTER TABLE snapshots ADD COLUMN fold_version integer NOT NULL DEFAULT 1;

COMMENT ON COLUMN proj_tickets.periods IS 'Work periods, oldest first: [{start, end|null, pass}] from event serverTime. ''[]'' when the ticket never started.';
COMMENT ON COLUMN proj_tickets.rounds IS '1 plus the reopened-by-flow transitions filed on the ticket.';
COMMENT ON COLUMN proj_tickets.closed_cause IS 'The close''s flow cause (branch-not-taken), or NULL: a person''s close, or no close.';
COMMENT ON COLUMN snapshots.fold_version IS 'TICKET_FOLD_VERSION of the fold that wrote the row; a row below the current version is restated.';

-- Down Migration

ALTER TABLE snapshots DROP COLUMN fold_version;
ALTER TABLE proj_tickets
  DROP COLUMN closed_cause, DROP COLUMN rounds, DROP COLUMN periods, DROP COLUMN ended_at, DROP COLUMN started_at;
