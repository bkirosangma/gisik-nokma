-- Up Migration

-- Projection: one row per structured reference in a ticket description, a
-- comment or a note body (Knowledge Graph spec B §2.1). Rebuildable from the
-- ledger; written only by `src/projections/references.ts`.
--
-- `source_parent_kind` / `source_parent_id` replace the spec's `source_ticket`:
-- a comment may be filed against a ticket OR a note (`vocabulary.ts`,
-- `entityKind: ['ticket', 'note']`), so the parent is a kind and an id. For a
-- ticket or note source the parent is the source itself.
--
-- text / int / timestamptz / bigint only, no json: `tools/verify-projections.ts`
-- diffs a rebuild against the live table with EXCEPT.

CREATE TABLE proj_references (
  workspace_id        text NOT NULL,
  source_kind         text NOT NULL CHECK (source_kind IN ('ticket', 'comment', 'note')),
  source_id           text NOT NULL,
  source_parent_kind  text NOT NULL CHECK (source_parent_kind IN ('ticket', 'note')),
  source_parent_id    text NOT NULL,
  target_kind         text NOT NULL CHECK (target_kind IN ('ticket', 'note', 'person')),
  target_id           text NOT NULL,
  ordinal             int  NOT NULL,
  snippet             text NOT NULL,
  updated_by          text NOT NULL,
  updated_at          timestamptz NOT NULL,
  seq                 bigint NOT NULL,
  PRIMARY KEY (source_kind, source_id, ordinal)
);
CREATE INDEX proj_references_target_idx ON proj_references (target_kind, target_id);
CREATE INDEX proj_references_parent_idx ON proj_references (source_parent_kind, source_parent_id);
CREATE INDEX proj_references_ws_idx ON proj_references (workspace_id);

COMMENT ON TABLE proj_references IS 'Knowledge Graph spec B: every ticketRef, wikiLink and mention in a description, comment or note body. A source''s rows are REPLACED on every body change. A reference to a purged item is not indexed. Trash keeps rows; reads hide them. Read only through read/linked-from.ts.';
COMMENT ON COLUMN proj_references.snippet IS 'At most 160 characters of the enclosing block, the reference wrapped in [[…]] exactly once; a literal [[ or ]] in the person''s text is written [ [ / ] ].';
COMMENT ON COLUMN proj_references.seq IS 'The workspace_seq of the event that last wrote this source''s body: the read''s newest-first order and its cursor.';

-- One row per one-shot projection backfill that has COMPLETED (Knowledge Graph B:
-- `src/projections/backfill-references.ts`). No row = never completed: the server
-- runs it after boot. Not a projection (never reset, never rebuilt).
CREATE TABLE projection_backfills (
  name          text PRIMARY KEY,
  completed_at  timestamptz NOT NULL,
  entities      bigint NOT NULL
);

-- Down Migration

DROP TABLE projection_backfills;
DROP TABLE proj_references;
