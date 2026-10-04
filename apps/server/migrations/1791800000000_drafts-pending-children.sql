-- Up Migration

-- Drafts T6 Step 5a (spec R4, owner ruling O1): a DRAFT holds published tickets as PENDING children, filed by
-- `ticket.reparented { childId }` on the draft's stream. Neither ticket's parent_id moves until the draft is
-- published, when the server re-files each child's reparent on its own stream and the list empties. The column is
-- TicketState.pendingChildren's head state, so rowToTicketState rebuilds the reducer's output exactly (the rule
-- `links` follows); `[]` on every row that holds none, which is every existing row.
ALTER TABLE proj_tickets ADD COLUMN pending_children jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN proj_tickets.pending_children IS 'On a DRAFT only: the published ticket ids it holds as pending children (ticket.reparented with childId), in the order held. Their parent_id is untouched until the draft is published. [] otherwise. Drafts T6, owner ruling O1.';

-- Down Migration

ALTER TABLE proj_tickets DROP COLUMN pending_children;
