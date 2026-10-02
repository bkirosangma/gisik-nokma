-- Up Migration

-- MCP-everything T2 (spec §6, M-E9): comment edit and delete, for ticket and note comments alike.
-- A deleted row KEEPS comment_id, author_id and recorded_at — the "Comment deleted" placeholder shows
-- who and when — and loses its body, so `body` becomes nullable. All four new columns are filled only
-- by `comment.edited` / `comment.deleted` (projections/ticket-comments.ts) and rebuild from the ledger.
ALTER TABLE proj_ticket_comments ALTER COLUMN body DROP NOT NULL;
ALTER TABLE proj_ticket_comments
  ADD COLUMN edited_at timestamptz NULL,
  ADD COLUMN edited_by text NULL,
  ADD COLUMN deleted_at timestamptz NULL,
  ADD COLUMN deleted_by text NULL;
ALTER TABLE proj_note_comments ALTER COLUMN body DROP NOT NULL;
ALTER TABLE proj_note_comments
  ADD COLUMN edited_at timestamptz NULL,
  ADD COLUMN edited_by text NULL,
  ADD COLUMN deleted_at timestamptz NULL,
  ADD COLUMN deleted_by text NULL;
COMMENT ON COLUMN proj_ticket_comments.edited_at IS 'serverTime of the latest comment.edited; NULL = never edited.';
COMMENT ON COLUMN proj_ticket_comments.deleted_at IS 'serverTime of comment.deleted; the body is NULL from then on (the ledger keeps it).';
COMMENT ON COLUMN proj_note_comments.edited_at IS 'serverTime of the latest comment.edited; NULL = never edited.';
COMMENT ON COLUMN proj_note_comments.deleted_at IS 'serverTime of comment.deleted; the body is NULL from then on (the ledger keeps it).';

-- Down Migration

UPDATE proj_ticket_comments SET body = '{"type":"doc","content":[{"type":"paragraph"}]}'::jsonb WHERE body IS NULL;
ALTER TABLE proj_ticket_comments DROP COLUMN edited_at, DROP COLUMN edited_by, DROP COLUMN deleted_at, DROP COLUMN deleted_by;
ALTER TABLE proj_ticket_comments ALTER COLUMN body SET NOT NULL;
UPDATE proj_note_comments SET body = '{"type":"doc","content":[{"type":"paragraph"}]}'::jsonb WHERE body IS NULL;
ALTER TABLE proj_note_comments DROP COLUMN edited_at, DROP COLUMN edited_by, DROP COLUMN deleted_at, DROP COLUMN deleted_by;
ALTER TABLE proj_note_comments ALTER COLUMN body SET NOT NULL;
