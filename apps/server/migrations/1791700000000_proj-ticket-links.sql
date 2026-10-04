-- Up Migration

-- Typed ticket links (Knowledge Graph spec A §2.5). One row per stored link,
-- keyed by the SOURCE stream that holds its events. `relates` is stored as
-- written; the engine refuses its reverse duplicate. Written only by
-- `src/projections/ticket-links.ts` and rebuildable from the ledger.
CREATE TABLE proj_ticket_links (
  workspace_id text NOT NULL,
  source_id    text NOT NULL,
  target_id    text NOT NULL,
  kind         text NOT NULL CHECK (kind IN ('blocks','relates','duplicates')),
  created_by   text NOT NULL,
  created_at   timestamptz NOT NULL,
  origin       text NOT NULL,
  seq          bigint NOT NULL,
  PRIMARY KEY (source_id, target_id, kind)
);
CREATE INDEX proj_ticket_links_target_idx ON proj_ticket_links (target_id);
CREATE INDEX proj_ticket_links_ws_idx ON proj_ticket_links (workspace_id);
COMMENT ON TABLE proj_ticket_links IS 'Knowledge Graph spec A: typed links between tickets. Trash keeps rows (reads hide a trashed end); a purge erases every row naming the ticket at either end, and a link to an erased ticket is never re-inserted.';
COMMENT ON COLUMN proj_ticket_links.seq IS 'The link_added event''s workspace_seq: the order links were made in, workspace-wide.';

-- The source ticket's own folded copy (`TicketState.links`), so the engine
-- reads both ends' links through `getEntityState` like every other fact.
ALTER TABLE proj_tickets ADD COLUMN links jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Down Migration

ALTER TABLE proj_tickets DROP COLUMN links;
DROP TABLE proj_ticket_links;
