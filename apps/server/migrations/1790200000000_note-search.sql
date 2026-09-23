-- Up Migration

-- Notes search, part 1 (Plan 3 of 6, spec §7.1): the two extensions and the two
-- DETERMINISTIC tables. `search_note_chunks` is deliberately NOT here.
--
-- NUMBERS ABOVE 1790110000000, the highest applied migration, because a
-- migration numbered below an applied one can never run — and
-- `pnpm check:migrations` refuses the ordering before a database ever sees it.
--
-- ## Why the chunks table is a second migration
--
-- `search_note_chunks.embedding` is `vector(<DIM>)` and the dimension is not a
-- choice this file can make: it is whatever the embedding backend Task 2's
-- spike measures as loadable on the runtime image (384 for MiniLM/ONNX, 512 for
-- the static fallback). A `vector(384)` written here would be a guess baked
-- into a migration that can never be renumbered, and a rebuild would have to
-- carry the guess forward. Splitting costs one migration; guessing costs the
-- table.
--
-- ## `pg_trgm` and `vector` are extensions of the DATABASE, not of a schema
--
-- Both are created unqualified, in `public`. `vector` is NOT a trusted
-- extension in Postgres 16 (`pg_available_extension_versions.trusted` is false
-- for it, true for `pg_trgm`), so creating it needs a role that is a superuser
-- — which is what `tools/search-preflight.ts` exists to find out about a target
-- database BEFORE this file is applied to it. On the managed DigitalOcean
-- database the owner runs that tool first; the answer is recorded on the PR.
--
-- ## The generated `tsv` and the `'simple'` configuration
--
-- `'simple'` is spelled as SQL text here, exactly as `FTS_CONFIG`
-- (`src/read/fts.ts`) spells it for every query on this table, and the two are
-- tied by BEHAVIOUR rather than by the compiler — a migration is SQL that runs
-- before any TypeScript exists. `test-cases/18-notes.md` case 18.135 is that
-- tie: it asserts the stored vector keeps `licences` unstemmed, which is false
-- under any configuration that stems.
--
-- The generated expression is legal as a STORED column because
-- `to_tsvector(<constant regconfig>, text)` is immutable — the two-argument
-- form with a LITERAL configuration is, while the one-argument form (which
-- reads `default_text_search_config`) is not.

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS vector;

-- The three folded columns are the projection's whole output (see
-- `projections/note-search.ts`). Folding happens in TypeScript, not here:
-- `foldSearchText` (spec §7.2) has to be the SAME function on the query path and
-- the index path, and only one of those two is a database.
CREATE TABLE proj_note_search (
  note_id          text PRIMARY KEY,
  workspace_id     text NOT NULL,
  home_project_id  text NOT NULL,
  title            text NOT NULL,       -- folded (spec §7.2)
  body_text        text NOT NULL,       -- folded
  ticket_text      text NOT NULL,       -- folded; "<key> <title>\n" per attached ticket
  tsv tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', title), 'A') ||
    setweight(to_tsvector('simple', body_text), 'B') ||
    setweight(to_tsvector('simple', ticket_text), 'C')
  ) STORED
);
CREATE INDEX proj_note_search_tsv_idx ON proj_note_search USING gin (tsv);
CREATE INDEX proj_note_search_ws_idx  ON proj_note_search (workspace_id);

-- The vocabulary spelling correction reads (spec §7.5). A lexeme is never
-- deleted: the table holds every word the workspace has ever indexed, and a
-- word that no longer appears anywhere is the one a misspelling is most likely
-- to be a misspelling OF. `reset` truncates it with the rest of the projection,
-- so a rebuild still reproduces it exactly.
CREATE TABLE proj_note_lexemes (
  workspace_id text NOT NULL,
  lexeme       text NOT NULL,
  PRIMARY KEY (workspace_id, lexeme)
);
CREATE INDEX proj_note_lexemes_trgm_idx ON proj_note_lexemes USING gin (lexeme gin_trgm_ops);

COMMENT ON TABLE proj_note_search IS 'Projection: one row per note, holding the folded title, body and attached-ticket text, with a weighted generated tsvector. Rebuildable from the ledger; never authored. Read only by the note search queries, always with visibleNotesWhere applied.';
COMMENT ON COLUMN proj_note_search.body_text IS 'The note body FLATTENED to plain text (spec §3.5) and then FOLDED (spec §7.2) — never the document JSON. Storing the JSON here would make the generated tsvector a function of markup, and a `**bold**` in the body would be indexed as a word.';
COMMENT ON COLUMN proj_note_search.ticket_text IS 'One line per attached ticket, "<key> <title>", folded. Title changes are applied by the projection on ticket.field_set, so this column tracks the ticket without the note being rewritten.';
COMMENT ON TABLE proj_note_lexemes IS 'The workspace''s folded vocabulary, one row per word of three or more letters ever seen in a note title, body or ticket text. Feeds trigram spelling correction (spec §7.5). Rows are inserted, never deleted; reset truncates.';

-- Down Migration

-- The extensions are NOT dropped. `vector` may by then have a dependent table
-- (`search_note_chunks`, migration 1790300000000) and a `DROP EXTENSION` would
-- cascade into it; more importantly an extension is a property of the
-- DATABASE, and a migration that rolls back its own tables has no business
-- taking a facility the database may share with something else. Reversing the
-- extension creation is `DROP EXTENSION pg_trgm, vector` by hand, deliberately.

DROP TABLE proj_note_lexemes;
DROP TABLE proj_note_search;
