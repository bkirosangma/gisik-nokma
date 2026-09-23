# Notes — Plan 3 of 6: Search Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make notes searchable by spelling (prefix as you type, trigram correction of misspelt words) and by meaning (embeddings computed inside the server process), through the existing `/v1/search` route extended with `kinds`, `mode`, `author` and `scope`, with the reader predicate inside every query so nothing leaks, and a client hook that shows lexical results per keystroke and appends meaning results after a pause.

**Architecture:** Two Postgres extensions (`pg_trgm`, `vector`) arrive with the first migration; because `postgres:16-alpine` has no pgvector, every Postgres image site (two compose files, two CI service blocks) moves to `pgvector/pgvector:pg16` first. `proj_note_search` (folded text, generated `tsvector`) and `proj_note_lexemes` (trigram-indexed vocabulary) are deterministic projections; `search_note_chunks` is **not** a projection: an embedding worker started from `index.ts` (like the snapshot writer) keeps it current, nudged after commits through a callback injected into `buildApp`. The embedding backend is decided by a measured spike in Task 2, because `onnxruntime-node` may not load on the Alpine runtime image.

**Tech Stack:** Postgres 16 + `pg_trgm` + `pgvector`, `@huggingface/transformers` (tokenizer always; ONNX inference if the spike allows, else a static-embedding table), Fastify, vitest, React hook in `apps/web`.

**Spec:** `docs/superpowers/specs/2026-09-23-notes-design.md` §7. **Depends on:** Plan 1 merged (`visibleNotesWhere`, `proj_notes`, `proj_note_attachments`, `read/notes.ts`, the notes fixture).

## Global Constraints

- **Branch shape.** Cut `task/notes-3-search` from `origin/release/notes` after Plan 1 is in it. One commit per task. PR `--base release/notes` through `bash scripts/ctl/ctl pr open …`.
- **Node 22; `pnpm turbo run build` before suites; log files, never `| head`; read the summary line.** Server suite needs the test Postgres on 54329 — **after Task 1 that is the pgvector image**; run `docker compose down postgres && docker compose up -d postgres` once after Task 1.
- **Every case: RED first, a control in the same `it`, the named mutation shown red after the commit, then restored.**
- **Case ids.** Block **`18.121`–`18.180`** in `test-cases/18-notes.md`; add the row `| 3 Search | \`18.121\`–\`18.180\` |` to its block table in Task 1. Section `## 18.10 Search`.
- **`Features.md` §15** gets one bullet per task; the §7 (API, realtime & search) bullet for `/v1/search` is amended in Task 6.
- **Migrations:** `pnpm check:migrations` requires every new file's prefix strictly above the base's highest; Plan 1 used `1790100000000` and `1790110000000`; this plan uses **`1790200000000`** (extensions + tables). Never rename a migration after it is on the branch.
- **`FTS_CONFIG` is `'simple'`** (`apps/server/src/read/fts.ts:44`) and is interpolated as SQL text; the notes migration's generated column and every new query spell it the same way. Task 3 adds the behavioural test that ties the note spellings to the constant (there is none today — the link is behavioural only, `fts.ts:26-36`).
- **`readSearch` and the route are two surfaces** (`apps/server/src/routes/search.ts:118-237` and `:298-351`); every new parameter lands in both.
- **`search_note_chunks` is never registered in the projection registry** and never verified by `verify:projections`. Its table has no `proj_` prefix.
- **No model download at runtime.** Model files are committed under `apps/server/models/` (Task 2 decides which) and reach the image through `pnpm deploy` (`apps/server/Dockerfile:27`; `.dockerignore` and `.gitignore` have no `models` entry — keep it that way). Loader configured `env.allowRemoteModels = false`, `env.localModelPath = <that dir>`.
- **Never `AskUserQuestion`.** Line numbers were read at Plan 1's head `b083b452` and `release/notes`; trust symbols.

---

## File map

| File | Responsibility |
|---|---|
| `docker-compose.yml:3`, `docker-compose.dev.yml:101`, `.github/workflows/ci.yml:416-434`, `:484-494` | `pgvector/pgvector:pg16` |
| `apps/server/migrations/1790200000000_note-search.sql` (new) | extensions, `proj_note_search`, `proj_note_lexemes`, `search_note_chunks` |
| `apps/server/src/tools/search-preflight.ts` (new) | extension/role/version check; RSS measurement |
| `packages/domain/src/search-fold.ts` (new), `src/doc-chunks.ts` (new) | `foldSearchText`, `chunkDoc` |
| `apps/server/src/projections/note-search.ts` (new), `src/projections/index.ts` | the deterministic projection |
| `apps/server/src/search/embedding.ts` (new), `src/search/embed-worker.ts` (new), `src/index.ts:268-275`, `src/app.ts:953-996`, `src/config.ts` | model, worker loop, nudge, config knob |
| `apps/server/src/read/note-search.ts` (new) | `lexicalNoteSearch`, `correctWords`, `meaningNoteSearch` |
| `apps/server/src/routes/search.ts:118-237`, `:298-351` | `kinds`, `mode`, `author`, `scope`; note rows in the response |
| `packages/domain/src/read-models.ts:386`, `packages/app-core/src/view-types.ts:818`, `src/data-source.ts` (`search`, `searchNotes`), `src/online/online-data-source.ts:446-453`, `src/online/mappers.ts:2192-2216`, `src/replica/replica-data-source.ts` (`SEARCH_ABSENCES`) | `NoteSearchHit`, `searchNotes`, `SearchResponse.notes` |
| `apps/web/src/use-notes-search.ts` (new) | the merge rule |
| `apps/server/test/fixtures/garo-eval.json` (new, placeholder rows), `apps/server/src/tools/seed-search-corpus.ts` (new) | Garo evaluation and the performance corpus |

---

### Task 1: Postgres images, the migration, and the pre-flight

**Files:**
- Modify: `docker-compose.yml:3`, `docker-compose.dev.yml:101`, `.github/workflows/ci.yml:416-434`, `:484-494` (image only; keep `command`, env, ports, healthcheck, `TZ`)
- Create: `apps/server/migrations/1790200000000_note-search.sql`, `apps/server/src/tools/search-preflight.ts`; `apps/server/package.json` script `search:preflight`
- Test: `apps/server/test/search/preflight.test.ts`
- Docs: `test-cases/18-notes.md` (row + `18.121`–`18.124`), `Features.md`, `docs/runbooks/` entry if the repo keeps one for compose (check `pnpm check:runbook`'s inputs)

**Interfaces:**
- Produces: extensions `pg_trgm` and `vector` in every fresh test database (`createTestDatabase` runs all migrations, `apps/server/test/helpers/db.ts:31`); tables per spec §7.1 with `embedding vector(<DIM>)` where `<DIM>` is a placeholder resolved by Task 2 — **write the migration in Task 2's commit if you reach it first; otherwise Task 1 creates the two `proj_` tables and Task 2 adds `search_note_chunks` in a second migration `1790300000000_note-chunks.sql`**. Choose the second path; it keeps the dimension decision where the evidence is.
- `search-preflight.ts` prints: `pg_available_extensions` rows for the two names, `current_user` privileges, the installed pgvector version, and (after Task 2) RSS before and after a warm-up embedding.

- [ ] **Step 1: Cases**

```markdown
## 18.10 Search

- ❌ **18.121 — every fresh test database has `pg_trgm` and `vector` installed** (`SELECT extname FROM pg_extension`); control: `postgis` is absent. Mutation: drop `CREATE EXTENSION vector` from the migration (red only on the pgvector image, which is the point of 18.122).
- ❌ **18.122 — the four Postgres image sites name the same image string** (a test reads the two compose files and `ci.yml` and asserts one distinct `image:` value under the postgres services, equal to `pgvector/pgvector:pg16`). Mutation: change one site.
- ❌ **18.123 — `proj_note_search.tsv` is generated from the three columns with weights A/B/C** (insert a row, assert `tsv` contains `'cold':1A` etc.). Mutation: swap A and B.
- ❌ **18.124 — the pre-flight tool reports both extensions available and the connected role able to create them** on the test DB; control: it reports `postgis` unavailable. Mutation: query `pg_extension` instead of `pg_available_extensions`.
```

- [ ] **Step 2–6:** change the four sites; write the migration with `CREATE EXTENSION IF NOT EXISTS pg_trgm; CREATE EXTENSION IF NOT EXISTS vector;` followed by the `proj_note_search` and `proj_note_lexemes` DDL from spec §7.1 verbatim (no chunks table yet); the pre-flight tool (a `tsx` script like `verify-projections.ts`, taking `DATABASE_URL`); tests; `docker compose down postgres && docker compose up -d postgres`; run the server suite; mutations; flip; commit `Notes 3/Task 1: pgvector image, extensions, proj_note_search and lexemes tables, pre-flight (18.121-18.124)`. Features §15: `- ⚙️ **The database gains \`pg_trgm\` and \`pgvector\`**; every Postgres image is \`pgvector/pgvector:pg16\`; a pre-flight tool checks a target database before the migration runs.` **PR body must say:** the managed DO database is checked with `pnpm --filter @gisik-nokma/server search:preflight` against `DATABASE_URL` **by the owner or the controller before this plan's PR merges into `release/notes`** — never from a lane, and never with the production URL in a lane's environment.

---

### Task 2: The embedding backend — a measured spike, then the model and the chunks table

**Files:**
- Create: `apps/server/src/search/embedding.ts`, `apps/server/models/<model>/…` (committed), `apps/server/migrations/1790300000000_note-chunks.sql`
- Modify: `apps/server/package.json` (deps), `apps/server/src/tools/search-preflight.ts` (RSS)
- Create: `packages/domain/src/doc-chunks.ts`
- Test: `apps/server/test/search/embedding.test.ts`, `packages/domain/test/doc-chunks.test.ts`
- Docs: `18.125`–`18.129`

**The spike (30 minutes, throwaway, before writing any code that stays):** build the runtime image (`docker build --target runtime -f apps/server/Dockerfile .`) and run inside it `node -e "import('@huggingface/transformers').then(async t => { t.env.allowRemoteModels=false; t.env.localModelPath='/app/models'; const e = await t.pipeline('feature-extraction','all-MiniLM-L6-v2',{ dtype:'q8' }); console.log((await e('warm-up',{pooling:'mean',normalize:true})).dims) })"` with the model files copied in. Record the outcome in the commit body and choose:

- **Backend A — ONNX loads on Alpine (musl):** keep `Xenova/all-MiniLM-L6-v2` (384 dims). `CURRENT_MODEL = 'Xenova/all-MiniLM-L6-v2@q8'`.
- **Backend B — it does not (the expected outcome; `onnxruntime-node` ships glibc binaries):** use a **static embedding model**: `minishlab/potion-base-32M` (512 dims) — its `tokenizer.json` is read by transformers.js's pure-JS tokenizer (`AutoTokenizer`, no ONNX), and its embedding table (`model.safetensors`, one vector per token) is loaded with a small safetensors reader; a text's vector is the mean of its token vectors, L2-normalised. No native dependency; ≈130 MB on disk, ≈150 MB RSS. `CURRENT_MODEL = 'minishlab/potion-base-32M@static'`. Do **not** change the Dockerfile base image to get Backend A working; that is a deploy change the owner did not ask for.

Either way the public surface is the same:

```ts
export const CURRENT_MODEL: string;             // '<name>@<variant>'
export const EMBEDDING_DIM: number;             // 384 or 512
export function embedTexts(texts: string[]): Promise<Float32Array[]>;   // lazily loads once; batches of ≤16
export function embedQuery(text: string): Promise<Float32Array>;        // 60 s LRU of 256 entries
```

`chunkDoc(doc): { headingPath: string; text: string }[]` per spec §7.6 (top-level walk; heading path `"H1 > H2"`; paragraph-like blocks accumulated up to 150 words; chunk text = heading path + newline + text; empty doc → `[]`). `1790300000000_note-chunks.sql` = the `search_note_chunks` DDL from spec §7.1 with `vector(<EMBEDDING_DIM>)`.

- [ ] **Step 1: Cases**

```markdown
- ❌ **18.125 — `chunkDoc` splits on headings and the 150-word budget, prepends the heading path, and returns `[]` for an empty document;** control: one short paragraph → one chunk. Mutation: drop the heading path.
- ❌ **18.126 — `embedTexts` returns unit-length vectors of `EMBEDDING_DIM`, deterministic across calls, and never touches the network** (`env.allowRemoteModels === false`; the test runs with `HF_HUB_OFFLINE=1`). Mutation: skip normalisation.
- ❌ **18.127 — semantically close texts are closer than unrelated ones:** cosine("fridge broken", "compressor stopped in the cold room") > cosine("fridge broken", "quarterly tax filing"). Mutation: return zeros.
- ❌ **18.128 — `embedQuery` caches: two calls with the same string load once** (spy on the underlying call). Mutation: disable the cache.
- ❌ **18.129 — the pre-flight prints RSS before and after `embedQuery('warm-up')`, and the delta is under 400 MB on this machine** (record the number in the case). Mutation: —
```

- [ ] **Step 2–6:** tests; the backend per the spike; the migration; `pnpm --filter @gisik-nokma/server add @huggingface/transformers` (and nothing else for Backend B); commit the model files (state their total size in the commit body; if over 100 MB in one file, split the safetensors into two files or choose `potion-base-8M` (256 dims) and record why); run; mutations; flip; commit `Notes 3/Task 2: embedding backend (<A|B>), chunking, chunks table (18.125-18.129)`. Features §15: `- ⚙️ **A small embedding model runs inside the server process** (<model>, <dim> dims), bundled in the image, never downloaded at runtime.`

---

### Task 3: The search projection — folded text, ticket text, lexemes

**Files:**
- Create: `packages/domain/src/search-fold.ts`, `apps/server/src/projections/note-search.ts`
- Modify: `apps/server/src/projections/index.ts` (register after `notesProjection`), `packages/domain/src/index.ts`
- Test: `packages/domain/test/search-fold.test.ts`, `apps/server/test/projections/note-search.test.ts`
- Docs: `18.130`–`18.135`

**Interfaces:**
- Produces: `foldSearchText(s: string): string` (spec §7.2: NFC, lowercase, remove `·` `'` `’` `ʼ` between two letters, collapse whitespace); `noteSearchProjection: Projection` (`name: 'proj_note_search'`, `tables: ['proj_note_search', 'proj_note_lexemes']`) reacting to every `note.*` event and to `ticket.field_set` (title), `ticket.deleted`, `ticket.restored` for attached tickets; lexeme extraction `[^\p{L}\p{N}]+`, length ≥ 3, `INSERT … ON CONFLICT DO NOTHING`.

- [ ] **Step 1: Cases**

```markdown
- ❌ **18.130 — `foldSearchText`: `a·chik`, `a'chik`, `a’chik`, `aʼchik` → `achik`; `don't` → `dont`; `'quoted'` keeps its quotes; `  Cold   Room ` → `cold room`;** control: `compressor` unchanged. Mutation: skip step 3.
- ❌ **18.131 — after `note.created` + `note.body_set`, `proj_note_search` holds the folded title and body text;** `ticket_text` is empty; after `note.attached` to a ticket titled "Fix the freezer" with key SHOP-7, `ticket_text` contains `shop-7 fix the freezer`. Mutation: skip folding the body.
- ❌ **18.132 — renaming the attached ticket re-derives `ticket_text`;** deleting it removes the line; restoring it brings it back. Mutation: ignore ticket events.
- ❌ **18.133 — `note.deleted` removes the row; `note.restored` recreates it.** Mutation: keep the row.
- ❌ **18.134 — `proj_note_lexemes` holds every folded word ≥ 3 letters from title, body and ticket text, once per workspace;** control: `to` (2 letters) is absent. Mutation: split on spaces only.
- ❌ **18.135 — replay is clean:** `verifyProjections` reports `{ clean: true }` for both tables after the sequence, and the tsvector for `licences` contains the unstemmed `licences` (the `simple` behavioural tie). Mutation: use `'english'` in the migration's generated column.
```

- [ ] **Step 2–6:** tests via `applyCommitted` on the notes fixture (`seedNotesFixture`) + a ticket created through the fixture's ticket events; implement; run; mutations; flip; commit `Notes 3/Task 3: proj_note_search and lexemes projection, foldSearchText (18.130-18.135)`. Features §15: `- ⚙️ **Notes are indexed for full-text search** with folded text (raka mark unified) and a trigram vocabulary per workspace; visibility is applied at read time only.`

---

### Task 4: The embedding worker — staleness loop, nudge, backfill

**Files:**
- Create: `apps/server/src/search/embed-worker.ts`
- Modify: `apps/server/src/index.ts:268-275` (start/stop beside the snapshot writer), `apps/server/src/app.ts:953-996` (register a commit listener that calls `deps.onNoteBodyCommitted?.(noteId)` — a new optional `AppDeps` field), `apps/server/src/config.ts` (`EMBED_WORKER_INTERVAL_MS`, default `10000`; `EMBED_WORKER_ENABLED`, default `true`), `.env.example`
- Test: `apps/server/test/search/embed-worker.test.ts`
- Docs: `18.136`–`18.140`

**Interfaces:**
- Produces: `startEmbedWorker(pool, { intervalMs, log }): { nudge(noteId: string): void; stop(): void; runOnce(): Promise<number> }` — `runOnce` selects up to 20 stale notes with the query in spec §7.6 (`c.note_id IS NULL OR c.src < n.seq OR c.model <> $CURRENT_MODEL`, plus deleted notes that still have chunks), chunks, embeds, replaces rows in one transaction with `source_seq = n.seq`, `model = CURRENT_MODEL`; returns the number of notes processed. `nudge` schedules a `runOnce` soon (debounced 500 ms). The loop uses `setInterval` + `timer.unref()` like `startSnapshotWriter` (`apps/server/src/sync/snapshot-writer.ts:298-312`), and `stop` clears it. `buildApp` registers the listener only when `deps.onNoteBodyCommitted` is given, so the ~60 test files that call `buildApp` start no loop.

- [ ] **Step 1: Cases**

```markdown
- ❌ **18.136 — `runOnce` embeds a new note into `search_note_chunks` with `source_seq` = the note's `seq` and `model` = `CURRENT_MODEL`;** control: an untouched note is not re-embedded on the next run (returns 0). Mutation: ignore `source_seq`.
- ❌ **18.137 — after `note.body_set`, the next run replaces the chunks (old rows gone, new `source_seq`).** Mutation: append instead of replace.
- ❌ **18.138 — changing `CURRENT_MODEL` (inject via the worker's options for the test) re-embeds every note.** Mutation: ignore the model column.
- ❌ **18.139 — a deleted note's chunks are removed; a restored note's are rebuilt.** Mutation: skip deleted notes.
- ❌ **18.140 — the commit listener nudges the worker for `note.body_set` and `note.created` only;** control: `note.renamed` does not. The nudge coalesces: three nudges in 100 ms → one run. Mutation: nudge on every note event.
```

- [ ] **Step 2–6:** tests with a fake embedder injected (`{ embedTexts }` option) so the suite does not load the model; implement; run; mutations; flip; commit `Notes 3/Task 4: embedding worker with staleness loop and commit nudge (18.136-18.140)`. Features §15: `- ⚙️ **An in-process worker keeps note embeddings current** — stale after a save, after a model change, and at backfill; the loop lives in \`index.ts\`, the nudge in \`buildApp\`.`

---

### Task 5: The three server queries — lexical, correction, meaning

**Files:**
- Create: `apps/server/src/read/note-search.ts`
- Test: `apps/server/test/search/note-search-read.test.ts`
- Docs: `18.141`–`18.148`

**Interfaces:**
- Consumes: `visibleNotesWhere` (Plan 1), `SqlParams`, `HEADLINE_OPTIONS` (`routes/search.ts:26`, export it), `FTS_CONFIG`, `foldSearchText`, `embedQuery`.
- Produces (each takes `(db, eff, userId, workspaceId, q, opts: { authorId?; scopeMode?; limit? })`):
  - `lexicalNoteSearch(...) → Promise<{ hits: NoteSearchHitRow[]; corrected?: string[] }>` — spec §7.4's query (`to_tsquery` from folded words, last word `:*`), and when it returns zero rows and the query has ≥ 1 word of ≥ 3 letters, `correctWords` (spec §7.5, `SET LOCAL pg_trgm.similarity_threshold = 0.3`) and one rerun.
  - `meaningNoteSearch(...) → Promise<NoteSearchHitRow[]>` — spec §7.6's query (`DISTINCT ON (note_id)`, `LIMIT 200`, sorted by distance in code, first 20).
  - `NoteSearchHitRow = { noteId, title, snippet, homeProjectId, scopeMode, authorId, updatedAt, attachedTicketKeys: string[] }` (keys via the same visible-ticket join `read/notes.ts` uses).

- [ ] **Step 1: Cases**

```markdown
- ❌ **18.141 — prefix:** `"cold compr"` finds the note "Compressor stopped in the cold room"; control: `"cold xylophone"` finds nothing. Mutation: drop `:*`.
- ❌ **18.142 — weights:** a title match ranks above a body-only match for the same word. Mutation: swap A and B in the migration (Task 1's) — assert via `ts_rank_cd` order.
- ❌ **18.143 — correction:** `"compresor"` returns hits with `corrected: ['compressor']`; control: `"compressor"` returns hits without `corrected`. Mutation: skip `correctWords`.
- ❌ **18.144 — no-leak, lexical:** for `memberIn`, a query matching only `nPrivate` returns `[]`; for `author` it returns the hit. Mutation: drop `visibleNotesWhere`.
- ❌ **18.145 — no-leak, meaning:** same as 18.144 through `meaningNoteSearch` (fake embedder, seeded chunks). Mutation: drop the predicate from the chunks query.
- ❌ **18.146 — filters:** `authorId` and `scopeMode` narrow both modes; control: no filter returns the superset. Mutation: ignore `scopeMode`.
- ❌ **18.147 — snippets carry `**` around the match and never exceed the headline's `MaxWords`.** Mutation: use `title` as the snippet.
- ❌ **18.148 — deleted notes never appear in either mode.** Mutation: drop `n.deleted = FALSE`.
```

- [ ] **Step 2–6:** tests on the notes fixture plus seeded search rows (through the projection) and seeded chunk rows (direct insert with a fake embedder's vectors); implement; run; mutations; flip; commit `Notes 3/Task 5: lexical, correction and meaning note queries (18.141-18.148)`. Features §15: `- ⚙️ **Three note search queries** — prefix lexical, trigram correction on zero hits, nearest-chunk meaning — each with the reader predicate inside the statement.`

---

### Task 6: The route, the response, the client method

**Files:**
- Modify: `apps/server/src/routes/search.ts:118-237` (`readSearch`), `:298-351` (route params), `apps/server/test/routes/search.test.ts` (extend)
- Modify: `packages/domain/src/read-models.ts:386` (`SearchResponse.notes`, `NoteSearchHit`), `packages/app-core/src/view-types.ts:818`, `src/data-source.ts` (`search` → add `searchNotes` beside it), `src/online/online-data-source.ts:446-453`, `src/online/mappers.ts:2192-2216` (`mapNoteSearchHits`), `src/replica/replica-data-source.ts` (search for `SEARCH_ABSENCES`; `searchNotes` becomes a gap entry beside `search`)
- Test: `apps/server/test/routes/search-notes.test.ts`, `packages/app-core/test/online/note-search-mappers.test.ts`
- Docs: `18.149`–`18.154`; `Features.md` §7 bullet for `/v1/search` amended

**Interfaces:**
- Route params (spec §7.7): `kinds` (`ticket,note` default both), `mode` (`lexical` default | `meaning`), `author`, `scope`; invalid values → 400 `invalid_query`. Response: `{ workspaceId, query, hits: [...tickets as today], notes: NoteSearchHit[], corrected?: string[] }` — `hits` unchanged for old clients. `mode=meaning` returns `hits: []`.
- `DataSourceQuery.searchNotes(workspaceId, text, opts: { mode: 'lexical' | 'meaning'; authorId?: string; scopeMode?: NoteScopeMode }): Promise<{ notes: NoteSearchHit[]; corrected?: string[] }>`; `NoteSearchHit` per spec §2 with `source` set client-side from `mode`.

- [ ] **Step 1: Cases**

```markdown
- ❌ **18.149 — `kinds=note` returns only `notes`; `kinds=ticket` returns only `hits`; default returns both;** control: the existing ticket cases still pass unchanged. Mutation: ignore `kinds`.
- ❌ **18.150 — `mode=meaning` returns notes from the chunks and an empty `hits`.** Mutation: run lexical in meaning mode.
- ❌ **18.151 — `author=` and `scope=` filter notes; an invalid `scope` is 400 `invalid_query`.** Mutation: accept any scope string.
- ❌ **18.152 — `corrected` is present exactly when a correction happened.** Mutation: always set it.
- ❌ **18.153 — a non-member is 404 and a member sees no unreadable note in `notes`** (route-level no-leak, both modes). Mutation: —
- ❌ **18.154 — `mapNoteSearchHits` maps the shape and refuses a row without `noteId`; `searchNotes` sets `source` from `mode`;** the replica's `searchNotes` rejects with `ReplicaGapError`. Mutation: default `source` to `'lexical'` in meaning mode.
```

- [ ] **Step 2–6:** implement in both `readSearch` and the route (parse `kinds` as a comma list validated against `['ticket','note']`; `mode` against the two values; `scope` against `NOTE_SCOPE_MODES`); mappers in the `mapTicketComments` style; run; mutations; flip; commit `Notes 3/Task 6: /v1/search gains kinds, mode, author, scope; searchNotes on the client (18.149-18.154)`. Features §15: `- ✅ **Notes are searchable through the same search API as tickets**, labelled by kind, with meaning search behind \`mode=meaning\`.`

---

### Task 7: The client hook — lexical per keystroke, meaning appended

**Files:**
- Create: `apps/web/src/use-notes-search.ts`
- Test: `apps/web/test/use-notes-search.test.tsx`
- Docs: `18.155`–`18.159`

**Interfaces:**
- Produces: `useNotesSearch(dataSource, workspaceId, { authorId?, scopeMode? }): { query: string; setQuery(q: string): void; results: NoteSearchHit[]; corrected: string[] | null; searching: boolean }` implementing spec §7.8 exactly: 100 ms debounce → lexical replaces `results` and cancels a pending meaning call; 400 ms after the last change → meaning; on arrival, if the query is unchanged, append hits whose `noteId` is not present, in returned order; stale responses discarded; empty query → `results = []`, no calls.

- [ ] **Step 1: Cases**

```markdown
- ❌ **18.155 — typing `c`, `co`, `col` within 100 ms makes ONE lexical call with `col`.** Mutation: no debounce.
- ❌ **18.156 — lexical `[A,B]` then meaning `[B,C,A]` displays `[A,B,C]`;** control: lexical-only displays `[A,B]`. Mutation: rerank by meaning order.
- ❌ **18.157 — a meaning response for an older query is discarded** (query changed before it resolved). Mutation: apply it.
- ❌ **18.158 — the meaning call fires 400 ms after the last change and not before;** a change at 300 ms resets the timer. Mutation: fire at 100 ms.
- ❌ **18.159 — `corrected` from the lexical response is exposed and cleared on the next query.** Mutation: keep the old value.
```

- [ ] **Step 2–6:** tests with `vi.useFakeTimers()` and a fake `dataSource.searchNotes` that resolves controlled promises; implement; run `cd apps/web && …`; mutations; flip; commit `Notes 3/Task 7: useNotesSearch — lexical per keystroke, meaning appended (18.155-18.159)`. Features §15: `- ✅ **Search as you type**: spelling results on every keystroke, meaning results appended after a pause, never reordering what is shown (spec §7.8).`

---

### Task 8: The Garo evaluation fixture and the performance corpus

**Files:**
- Create: `apps/server/test/fixtures/garo-eval.json` (schema `{ pairs: { query: string; expectedNoteTitle: string }[] }`, initially `{ "pairs": [] }`), `apps/server/test/search/garo-eval.test.ts` (skips with a printed reason when `pairs` is empty; otherwise seeds the titles as notes and records recall@5 for both modes into the test output), `apps/server/src/tools/seed-search-corpus.ts` (10 000 notes, 3 workspaces, 200–800 words of generated English, through the ledger so projections and chunks fill), `apps/server/test/search/perf.test.ts` (runs only with `NOTES_PERF=1`; p95 over 100 lexical and 100 meaning queries; prints the numbers)
- Docs: `18.160`–`18.162`

```markdown
- ❌ **18.160 — the Garo evaluation runs when pairs exist and records recall@5 for lexical and meaning** (🧪 until the owner supplies the pairs; the test's skip message says so). Mutation: —
- ❌ **18.161 — the corpus seeder creates 10 000 notes and the worker embeds them at ≥ 20 chunks/s on this machine** (number recorded). Mutation: —
- ❌ **18.162 — p95 lexical ≤ 50 ms and meaning ≤ 150 ms server-side on the seeded corpus** (numbers recorded; if meaning exceeds, add `CREATE INDEX search_note_chunks_hnsw ON search_note_chunks USING hnsw (embedding vector_cosine_ops)` in a migration `1790400000000_note-chunks-hnsw.sql` and record both numbers). Mutation: —
```

- [ ] **Step 2–6:** build; run the perf case once with `NOTES_PERF=1` and paste the numbers into the case and the commit body; commit `Notes 3/Task 8: Garo evaluation fixture, perf corpus and measurements (18.160-18.162)`. Features §15: `- ⚙️ **Search targets are measured** on a 10 000-note corpus; the Garo evaluation awaits the owner's pairs.`

---

### Task 9: Plan close — full gate, PR

- [ ] `pnpm turbo run build && pnpm test > /tmp/notes3-all.log 2>&1; tail -40 /tmp/notes3-all.log`; `pnpm typecheck`; `pnpm check:citations`; `pnpm check:migrations --base origin/release/notes`; `pnpm check:env` — green under Node 22. Re-read `Features.md` and `test-cases/18-notes.md` `18.121`–`18.162`. PR body: what landed, the spike's outcome and the chosen backend (A or B) with the model size, the four image sites, the pre-flight instruction for the managed database (owner/controller, before merge), summary lines with `NODE=`, the attribution line. `bash scripts/ctl/ctl pr open task/notes-3-search --repo <worktree> --base release/notes --title "Notes 3/6: search — pg_trgm, pgvector, in-process embeddings, /v1/search kinds+mode" --body <file>`; confirm the PR head equals `HEAD`.

---

## Self-review against the spec

- **§7.1** → Tasks 1–2 (two migrations, dimension decided by evidence). **§7.2** → Task 3. **§7.3** → Task 3. **§7.4–7.6** → Task 5 (+ Task 2 model, Task 4 worker). **§7.7** → Task 6. **§7.8** → Task 7. **§7.9–7.10** → Task 8. **§11.7** → Tasks 3–8.
- **Deviations recorded:** (1) the embedding backend may be a static-embedding model rather than MiniLM if ONNX cannot load on the Alpine image — the spec's "small English model inside the server process" holds either way, and `CURRENT_MODEL` + the worker make a later swap a one-line change; (2) the worker straddles `index.ts` (loop) and `buildApp` (nudge via injected callback) because the repo forbids loops in `buildApp` and cannot reach the commit feed from `index.ts` (the comment beside `createStreamHub` in `app.ts:953` and the comment above `startSnapshotWriter` in `index.ts:268`).
- **Names across tasks:** `foldSearchText`, `chunkDoc` (T2/T3) ← T4, T5; `CURRENT_MODEL`, `EMBEDDING_DIM`, `embedTexts`, `embedQuery` (T2) ← T4, T5; `noteSearchProjection` (T3) ← T8 seeder; `startEmbedWorker` (T4) ← T8; `lexicalNoteSearch`, `meaningNoteSearch`, `NoteSearchHitRow` (T5) ← T6; `searchNotes`, `NoteSearchHit` (T6) ← T7, Plan 5.
