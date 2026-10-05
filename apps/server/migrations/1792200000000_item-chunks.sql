-- Up Migration

-- Knowledge Graph spec D §2: ticket and ticket-comment chunks, beside search_note_chunks
-- (1790300000000_note-chunks.sql). A CACHE, not a projection, for that file's reason: a rebuild
-- depends on the model binary, not on the ledger.

CREATE TABLE search_item_chunks (
  item_kind     text NOT NULL CHECK (item_kind IN ('ticket', 'comment')),
  item_id       text NOT NULL,          -- ticket_id, or comment_id
  chunk_index   integer NOT NULL,
  workspace_id  text NOT NULL,
  ticket_id     text NOT NULL,          -- the item's ticket (itself, for a ticket): visibility and purge key
  heading_path  text NOT NULL,
  chunk_text    text NOT NULL,
  model         text NOT NULL,
  source_hash   text NOT NULL,          -- md5 of the text the chunks were built from (see COMMENT)
  embedding     vector(512) NOT NULL,
  PRIMARY KEY (item_kind, item_id, chunk_index)
);
CREATE INDEX search_item_chunks_ws_idx ON search_item_chunks (workspace_id);
CREATE INDEX search_item_chunks_ticket_idx ON search_item_chunks (ticket_id);

COMMENT ON TABLE search_item_chunks IS 'CACHE, not a projection: one row per chunk of a ticket (title, then description) or a ticket comment, with its embedding. Written only by the embedding worker (src/search/embed-worker.ts itemsPass). Stale when source_hash differs from the hash of the current text or model is not CURRENT_MODEL. Never in the projection registry, never verified by verify:projections.';
COMMENT ON COLUMN search_item_chunks.source_hash IS 'md5(title || E''\n'' || description jsonb text) for a ticket; md5(body jsonb text) for a comment. A hash, not a seq: proj_tickets has no per-entity seq column.';

-- Down Migration

DROP TABLE search_item_chunks;
