-- Up Migration

-- The soft-delete flag, projected from TicketState.deleted. Both NULL for every
-- ticket that is not deleted — every existing row, since nothing could have set
-- them before this migration.
--
-- This is the product's `Delete`: a history-retaining removal with an undo, not
-- an erasure. The row stays, the ledger stays, the history endpoint keeps
-- serving it; what changes is that every VIEW excludes it. The FAQ states the
-- semantics (`design-system/interactive/desktop.dc.html`, the `faq-delete`
-- entry): "The ticket stops appearing in views. Its history is retained,
-- because other events cite it — a comment, a block, a workflow version."
-- "This is why the product says \"deleted\" rather than \"erased\"."
ALTER TABLE proj_tickets
  ADD COLUMN deleted_at timestamptz NULL,
  ADD COLUMN deleted_by text NULL;

-- The read filter's hot path: rows no view should serve. Partial, like
-- proj_tickets_open_idx, because the predicate every view ANDs in is exactly
-- `deleted_at IS NULL` and the deleted rows are the rare ones — a full index
-- would carry a row for every live ticket to answer a question about the few
-- that are not.
CREATE INDEX proj_tickets_live_idx ON proj_tickets (workspace_id, project_id) WHERE deleted_at IS NULL;

COMMENT ON COLUMN proj_tickets.deleted_at IS 'When the ticket was soft-deleted — the ticket.deleted event''s server time — or NULL. A deleted ticket keeps its state_id/state_category and its whole ledger: deleted is a flag over a ticket, never a state, and nothing is erased. Cleared with deleted_by by ticket.restored.';
COMMENT ON COLUMN proj_tickets.deleted_by IS 'The actor of the ticket.deleted event, or NULL. Cleared with deleted_at by ticket.restored. Never overwritten while set — a second ticket.deleted on a live ticket is refused (already-deleted), because the reducer folds this pair from the ENVELOPE and a repeat delete would rewrite who did it.';

-- Down Migration

DROP INDEX proj_tickets_live_idx;

ALTER TABLE proj_tickets
  DROP COLUMN deleted_at,
  DROP COLUMN deleted_by;
