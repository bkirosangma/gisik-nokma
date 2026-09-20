-- Up Migration

-- Projection: one row per comment (the read `comment.added` has never had).
--
-- NUMBERS ABOVE 1789900000000, the highest applied migration, because a
-- migration numbered below an applied one can never run — and
-- `pnpm check:migrations` refuses the ordering before a database ever sees it.
--
-- ## Why a TABLE and not a column on proj_tickets
--
-- `proj_tickets.transitions` is a jsonb ARRAY on the ticket's own row, and the
-- same shape here would have been the smaller diff. It is refused for three
-- reasons that are properties of this read rather than of taste:
--
--   1. A comment is the only ticket-scoped claim that has NO folded head state
--      (`packages/domain/src/ticket-state.ts:400` returns the state unchanged),
--      so it is not part of the fold and has no business inside the fold's row.
--   2. The row is the unit the read returns, and `proj_search` is the standing
--      counter-example for the other direction: its `comments` column is a
--      CONCATENATED TEXT, built for full-text search, with no author, no time
--      and no per-comment identity. It cannot serve a thread and must not be
--      press-ganged into one.
--   3. Append-inside-a-column cannot be indexed, ordered or paged by Postgres;
--      a row per comment can, and `ORDER BY workspace_seq` is the ordering this
--      read needs (see below).
--
-- ## `jsonb`, NOT `json`, and NOT text
--
-- `registry.ts`'s contract says no projection column may be `json`: it has no
-- equality operator and `tools/verify-projections.ts` diffs a rebuild against
-- the live table with EXCEPT. `jsonb` HAS one. Text was the other candidate and
-- is refused because the body is a document the route walks for its embedded
-- attachment ids (`collectImageAttachmentIds`, `packages/domain/src/doc-embeds.ts:25`)
-- — text would mean re-parsing it at every read, and `jsonb` stores exactly the
-- value the ledger holds.
--
-- ## `recorded_at` is `serverTime`, and the choice is not cosmetic
--
-- The envelope carries two clocks (`packages/domain/src/envelope.ts:173-174`):
-- `clientTime` is the actor's claim about when, `serverTime` is assigned at
-- ingest. This column stores `serverTime` — the same instant the sheet's
-- provenance line renders for every other claim, so a comment's timestamp and a
-- field claim's timestamp are the same kind of fact. `clientTime` is NOT stored
-- here: it is on the ledger row already, and anything that needs to show the
-- skew between the two reads it from there (the ledger route).
--
-- ## `workspace_seq` IS the ordering
--
-- Rows are read `ORDER BY workspace_seq`, which is the workspace stream
-- position the ledger assigns under UNIQUE(workspace_id, workspace_seq) — a
-- STORED property of the event, never an arrival artefact, and the same
-- canonical order `(entity_kind, entity_id, seq)` replay delivers. So a rebuild
-- and the live table order identically, and a thread's order is a fact about
-- the ledger rather than about when a projection happened to run. `recorded_at`
-- is deliberately NOT the sort key: two events may share an instant, and a sort
-- with a tie-break invented here would be a second, weaker answer to "what
-- order did these happen in".
--
-- ## There is NO column for the comment's files, and that is deliberate
--
-- A comment's files are the attachments ITS OWN DOCUMENT embeds (image nodes
-- carrying `attrs.attachmentId`), which `collectImageAttachmentIds` derives from
-- `body` — a pure function of a column already here. Storing the derived ids
-- would give one fact two spellings that can disagree, and the derivation is
-- total: it cannot fail on any body this door accepts. The names are resolved at
-- READ time against the `attachments` table, scoped to the ticket, by the same
-- rule `gates/image-embed-gate.ts` enforces at WRITE time.

CREATE TABLE proj_ticket_comments (
  comment_id text PRIMARY KEY,
  workspace_id text NOT NULL,
  ticket_id text NOT NULL,
  author_id text NOT NULL,
  body jsonb NOT NULL,
  recorded_at timestamptz NOT NULL,
  workspace_seq bigint NOT NULL
);

-- The read's own access path: one ticket's thread, already in its render order.
CREATE INDEX proj_ticket_comments_ticket_idx ON proj_ticket_comments (ticket_id, workspace_seq);

COMMENT ON TABLE proj_ticket_comments IS 'One row per `comment.added` event (the read that event has never had). Rebuildable from the ledger and never authored; `comment_id` IS the event id, which is what makes a comment addressable — the payload carries no id of its own (`packages/domain/src/events/ticket-events.ts:108` is `z.object({ body })`).';
COMMENT ON COLUMN proj_ticket_comments.body IS 'The comment as a structured document, stored as the ledger holds it. It is `jsonb` and not `json` because the projection verifier diffs with EXCEPT and needs an equality operator. Its embedded attachment ids are NOT duplicated into a column: they are derived from this value by `collectImageAttachmentIds`.';
COMMENT ON COLUMN proj_ticket_comments.recorded_at IS 'The envelope''s `serverTime` — assigned at ingest, the same instant every other provenance line in this product renders. NOT `clientTime`, which is the actor''s claim and stays on the ledger row.';
COMMENT ON COLUMN proj_ticket_comments.workspace_seq IS 'The workspace stream position, a stored property of the event (UNIQUE(workspace_id, workspace_seq)). This is the thread''s ORDER BY: it is the canonical replay order, so a rebuild orders identically to the live table.';

-- Down Migration

DROP TABLE proj_ticket_comments;
