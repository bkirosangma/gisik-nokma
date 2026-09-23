-- Up Migration

-- Notes search, part 2 (Plan 3 of 6, spec §7.1): the chunk table the meaning
-- query reads. Not a projection, and the absence of a `proj_` prefix is the
-- statement rather than an oversight.
--
-- ## Why this is NOT a projection
--
-- Every `proj_*` table in this repository is a pure function of the ledger:
-- `tools/verify-projections.ts` rebuilds it from the events into a shadow schema
-- and diffs the two with EXCEPT, and that is what makes a drift a `{ clean:
-- false }` rather than a mystery. This table cannot be that. Its `embedding`
-- column is the output of a model BINARY, so a rebuild reproduces the rows only
-- while the model files and the library that reads them are byte-identical —
-- which no gate in this repository can check. Registering it would either make
-- `verify:projections` fail for a reason that is not drift, or force a
-- projection to special-case itself out of the verifier it is registered with.
--
-- So it is a CACHE with a provenance column instead. `model` and `source_seq`
-- are what make it safe to be one: a row is stale when the note's `seq` has
-- moved past it, or when the model that wrote it is not the model the server is
-- running (`src/search/embedding.ts`'s `CURRENT_MODEL`). The embedding worker
-- reads exactly that and nothing else.
--
-- ## The dimension is decided here and nowhere else
--
-- `vector(512)` is potion-base-32M's `hidden_dim`, measured by Task 2's spike
-- rather than assumed: the plan's first choice, `Xenova/all-MiniLM-L6-v2` (384),
-- needs `onnxruntime-node`, which fails to load on the `node:22-alpine` runtime
-- image with `ERR_DLOPEN_FAILED — ld-linux-aarch64.so.1`. The spike's output is
-- in `src/search/embedding.ts` and in case 18.125's commit. `EMBEDDING_DIM` in
-- that file and this number are the same fact spelled twice, and the loader
-- CHECKS them against each other: a shard whose dim is not `EMBEDDING_DIM`
-- throws rather than half-filling the table.
--
-- ## No HNSW index in v1
--
-- Spec §7.1 asks for the exact scan first and the index only if §7.9's
-- measurement needs it (case 18.162, and migration 1790400000000 if so). An
-- HNSW index with a visibility filter is also the case pgvector only supports
-- well from 0.8.0, and adding an index nobody has measured a need for is a
-- write cost on every chunk replacement in exchange for a guess.

CREATE TABLE search_note_chunks (
  note_id       text NOT NULL,
  chunk_index   integer NOT NULL,
  workspace_id  text NOT NULL,
  heading_path  text NOT NULL,
  chunk_text    text NOT NULL,
  model         text NOT NULL,
  source_seq    bigint NOT NULL,      -- proj_notes.seq the chunk was built from
  embedding     vector(512) NOT NULL,
  PRIMARY KEY (note_id, chunk_index)
);
CREATE INDEX search_note_chunks_ws_idx ON search_note_chunks (workspace_id);

COMMENT ON TABLE search_note_chunks IS 'CACHE, not a projection: one row per chunk of a note body, with its embedding. Written only by the embedding worker (src/search/embed-worker.ts). Stale when source_seq is behind proj_notes.seq or when model is not CURRENT_MODEL — the two conditions the worker''s staleness query is written in terms of. Never registered in the projection registry and never verified by verify:projections, because a rebuild depends on the model binary rather than on the ledger.';
COMMENT ON COLUMN search_note_chunks.heading_path IS 'The heading breadcrumb the chunk was cut under, e.g. "Cold room > Compressor" (chunkDoc, packages/domain/src/doc-chunks.ts). Stored as well as being the first line of chunk_text so a reader can show the location without parsing the text.';
COMMENT ON COLUMN search_note_chunks.source_seq IS 'proj_notes.seq at the moment the chunk was built. The worker replaces the whole set for a note in one transaction, so this is uniformly the seq of the body the chunks describe.';
COMMENT ON COLUMN search_note_chunks.model IS 'CURRENT_MODEL at the moment the chunk was written, e.g. "minishlab/potion-base-32M@static". A change of model re-embeds every note — the column exists so that swap is a one-line change rather than a migration.';

-- Down Migration

DROP TABLE search_note_chunks;
