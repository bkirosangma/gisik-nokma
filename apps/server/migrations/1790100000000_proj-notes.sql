-- Up Migration

-- Projection: the notes series' three tables (Plan 1 of 6, spec §6.1).
--
-- NUMBERS ABOVE 1790000000000, the highest applied migration, because a
-- migration numbered below an applied one can never run — and
-- `pnpm check:migrations` refuses the ordering before a database ever sees it.
--
-- ## One row per note, and the WHOLE row is written from the reducer
--
-- `proj_notes` is a pure function of the ledger in the strict sense the
-- verifier checks: every column is a field of the state `applyNoteEvent`
-- returns, so a rebuild from the events reproduces the row byte for byte. That
-- is why `scope_mode` and `pre_inherit_mode` are derived rather than stored from
-- what the event's payload said — the payload names the scope ONE event asked
-- for, and the row must hold the scope the note is actually on (`project` after
-- spec §3.4's example, not the `inherit` the last `scope_set` asked for).
--
-- ## Attachments are ROWS, not an array column
--
-- The array is what `NoteState` holds and writing it back as `text[]` would be
-- the smaller diff. It is refused because the one query this table exists for is
-- a lookup BY TICKET: the ticket sheet asks "which notes are attached to this
-- ticket", and an array column answers that only by scanning every note in the
-- workspace. `proj_note_attachments_ticket_idx` is the access path that
-- question needs, and a row per link is what makes an index possible at all.
-- The alternative — a `text[]` column plus a GIN index — would still have to
-- rebuild the whole array on every attach and detach, which is a write
-- amplification on the hot path for no read benefit.
--
-- ## No history table
--
-- Versions are read from `events` (`listNoteHistory`, spec §6.4). A
-- `proj_note_versions` table would be a second copy of rows the ledger already
-- holds, with a body column that must be kept in step with a payload nothing
-- rewrites — one fact with two spellings, and the copy is the one that can go
-- stale silently.
--
-- ## `jsonb`, NOT `json`
--
-- `registry.ts`'s contract says no projection column may be `json`: it has no
-- equality operator and `tools/verify-projections.ts` diffs a rebuild against
-- the live table with EXCEPT. `jsonb` HAS one.

CREATE TABLE proj_notes (
  note_id                text PRIMARY KEY,
  workspace_id           text NOT NULL,
  home_project_id        text NOT NULL DEFAULT '',
  parent_note_id         text NOT NULL DEFAULT '',          -- reserved (D8), always ''
  author_id              text NOT NULL,
  title                  text NOT NULL,
  body                   jsonb NOT NULL,
  schema_version         integer NOT NULL,
  scope_mode             text NOT NULL CHECK (scope_mode IN ('private','workspace','project','inherit','explicit')),
  scope_user_ids         text[] NOT NULL DEFAULT '{}',
  pre_inherit_mode       text,
  pre_inherit_user_ids   text[] NOT NULL DEFAULT '{}',
  deleted                boolean NOT NULL DEFAULT FALSE,
  created_at             timestamptz NOT NULL,
  updated_at             timestamptz NOT NULL,
  last_body_event_id     text NOT NULL,
  seq                    bigint NOT NULL,
  workspace_seq          bigint NOT NULL
);
CREATE INDEX proj_notes_home_idx   ON proj_notes (workspace_id, home_project_id, updated_at DESC);
CREATE INDEX proj_notes_author_idx ON proj_notes (workspace_id, author_id);

CREATE TABLE proj_note_attachments (
  note_id        text NOT NULL,
  ticket_id      text NOT NULL,
  workspace_id   text NOT NULL,
  attached_at    timestamptz NOT NULL,
  workspace_seq  bigint NOT NULL,
  PRIMARY KEY (note_id, ticket_id)
);
CREATE INDEX proj_note_attachments_ticket_idx ON proj_note_attachments (ticket_id);

CREATE TABLE proj_note_comments (
  comment_id     text PRIMARY KEY,
  workspace_id   text NOT NULL,
  note_id        text NOT NULL,
  author_id      text NOT NULL,
  body           jsonb NOT NULL,
  recorded_at    timestamptz NOT NULL,
  workspace_seq  bigint NOT NULL
);
CREATE INDEX proj_note_comments_note_idx ON proj_note_comments (note_id, workspace_seq);

COMMENT ON TABLE proj_notes IS 'Projection: one row per note, holding the head state produced by the shared reducer applyNoteEvent. Rebuildable from the ledger; never authored. Read by getNoteStateFromDb, by canReadNote''s loader and by every note read route.';
COMMENT ON COLUMN proj_notes.parent_note_id IS 'RESERVED (owner decision D8) and always the empty string. The notes page''s left tree is FLAT under containers in v1; the column exists so nesting is an additive change to the page rather than a table rewrite. A non-empty value today is a defect in the projection, not an early feature.';
COMMENT ON COLUMN proj_notes.scope_user_ids IS 'The explicit audience, and only for scope_mode = ''explicit''. Empty for every other mode rather than a stale list: a note that moved off `explicit` is visible to a whole workspace or project, and a retained list would be a permanent, untrue record of a hand-picked audience. This is the column `visibleNotesWhere` reads.';
COMMENT ON COLUMN proj_notes.pre_inherit_mode IS 'The scope this note had BEFORE it became `inherit` (owner decision D4), so removing the last attachment reverts to it rather than guessing. NULL whenever the note is not on `inherit`, and NULL for a note BORN in `inherit` — which is why the detach rule falls back to `private` for that case.';
COMMENT ON COLUMN proj_notes.seq IS 'The note entity''s own per-entity seq of the latest event folded, mirroring proj_tickets. `workspace_seq` sits beside it and is the workspace''s stream cursor: one orders a note''s history, the other orders the workspace''s.';
COMMENT ON TABLE proj_note_attachments IS 'One row per note→ticket link. A note may be attached to many tickets and the ticket sheet''s badge is a lookup BY ticket_id, which is what proj_note_attachments_ticket_idx exists for.';
COMMENT ON TABLE proj_note_comments IS 'One row per comment.added filed against a NOTE — the same event type tickets use, split by entity kind in projections/ticket-comments.ts. comment_id IS the event id: the payload is `{ body }` and carries no identity of its own.';

-- Down Migration

DROP TABLE proj_note_comments;
DROP TABLE proj_note_attachments;
DROP TABLE proj_notes;
