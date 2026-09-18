-- Up Migration

-- Backlog/closed second wave, spec §8.2 (2026-09-18): when this ticket was last
-- explicitly reopened, projected from `TicketState.reopenedAt`. NULL for every
-- row that has never been reopened OR has been transitioned since — which is
-- every existing row, since no event could set one before this migration.
--
-- `NULL` is the wire reader's ordinary value here rather than a special case:
-- `rowToTicketState` maps it to `reopenedAt: null` unconditionally, so the
-- reducer's own output and this column read agree in SHAPE as well as in value.
--
-- This column is a SWEEP INPUT, not a display fact. Nothing renders it and it
-- is deliberately absent from `TicketCard`/`ListRow`; Task 8's auto-close sweep
-- reads it to honour §8.2's "reopen wins" clause — the one thing that tells a
-- ticket nobody came back to apart from one a person reopened yesterday, since
-- both carry the same `closed_at IS NULL` and the same terminal `state_category`.
ALTER TABLE proj_tickets
  ADD COLUMN reopened_at timestamptz NULL;

COMMENT ON COLUMN proj_tickets.reopened_at IS 'When this ticket was last explicitly reopened (spec §8.2, second wave 2026-09-18), or NULL for a ticket never reopened or transitioned since. Set by ticket.reopened from the envelope''s server time; cleared by ANY ticket.transitioned, including one back into the same terminal state, because the sweep measures how long the ticket has sat in its current state and a transition restarts that clock. The auto-close sweep skips rows where this is NOT NULL.';

-- Down Migration

ALTER TABLE proj_tickets
  DROP COLUMN reopened_at;
