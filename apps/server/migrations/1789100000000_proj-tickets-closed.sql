-- Up Migration

-- Backlog/closed spec §3.1 (2026-09-17): the closed flag, projected from
-- TicketState.closed. Both NULL for every ticket that is not closed — every
-- existing row, since nothing could have set them before this migration.
ALTER TABLE proj_tickets
  ADD COLUMN closed_at timestamptz NULL,
  ADD COLUMN closed_by text NULL;

-- The board, my-work and attention hot path: rows that are not closed.
CREATE INDEX proj_tickets_open_idx ON proj_tickets (workspace_id, project_id) WHERE closed_at IS NULL;

COMMENT ON COLUMN proj_tickets.closed_at IS 'When the ticket was closed — the ticket.closed event''s server time — or NULL. A closed ticket keeps its state_id/state_category: closed is a flag over a terminal state, never a state (owner decision 2026-09-17).';
COMMENT ON COLUMN proj_tickets.closed_by IS 'The actor of the ticket.closed event, or NULL. Cleared with closed_at by ticket.reopened.';

-- Down Migration

DROP INDEX proj_tickets_open_idx;

ALTER TABLE proj_tickets
  DROP COLUMN closed_at,
  DROP COLUMN closed_by;
