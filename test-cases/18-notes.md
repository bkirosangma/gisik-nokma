# §18 — Notes

**Opened 2026-09-23 by Plan 1 of the notes series** (`docs/superpowers/plans/2026-09-23-notes-1-backend-core.md`;
spec `docs/superpowers/specs/2026-09-23-notes-design.md`).

## THE ID SHAPE

§18 is uniformly 3-digit padded: `18.001`–`18.999`, following §17's ruling. Blocks are allocated per plan
in the table below. Take from your block, never from the tip.

| Plan | Block |
|---|---|
| 1 Backend core | `18.001`–`18.060` — **minted: `18.001`–`18.042`**, so the next plan takes the table's next row or continues at `18.043` if it is drawn from this block |
| 3 Search | `18.121`–`18.180` |

**Write cases as `- ❌ **18.001 — …**` id LINES.** The guard (`scripts/check-case-ids.mjs`) counts id LINES and
nothing else; four spellings are invisible to it (a markdown **table row**, a **`##` heading**, a **backticked**
id inside the bold, and **two ids in one sentence**). After adding cases, confirm the count moved by EXACTLY
the number you added — an unchanged count has reported a clean sweep over cases it never saw.

## 18.1 Domain

- ✅ **18.001 — `note` is an entity kind.** `ENTITY_KINDS` contains `'note'` and `entitySchema` accepts `{ kind: 'note', id }`; control: `{ kind: 'notebook' }` is refused.
- ✅ **18.002 — `noteCreatedPayload` refusals.** Refuses: empty title; `inherit` without `attachTicketId`; `project` scope with `homeProjectId: ''`; `explicit` with empty `userIds`; `userIds` on a non-explicit mode. Accepts the minimal valid payload (control).
- ✅ **18.003 — `comment.added` parses against a `note` entity and against a `ticket` entity;** control: `note.renamed` against a `ticket` entity is refused with `entity-kind-mismatch`.

- ✅ **18.004 — `note.created` builds the state:** author = actor, body = payload body, attached = `[attachTicketId]`, `scopeBeforeInherit = null`, `deleted = false`, `lastBodyEventId` = the event id. Mutation: drop `attachTicketId` handling.
- ✅ **18.005 — detach rule, remembered scope** (spec §3.4 example 1): final scope `project`. Mutation: return `private` unconditionally.
- ✅ **18.006 — detach rule, born in inherit** (spec §3.4 example 2): final scope `private`. Mutation: keep `inherit`.
- ✅ **18.007 — explicit remembered with its `userIds`:** `explicit [A,B]` → `inherit` → last detach → `explicit [A,B]`. Mutation: drop `userIds`.
- ✅ **18.008 — a detach that is not the last keeps `inherit`.** Mutation: revert on every detach.
- ✅ **18.009 — `scope_set` to a non-inherit mode clears `scopeBeforeInherit`.** Mutation: keep it.
- ✅ **18.010 — each refusal in spec §3.3 throws; a control valid event does not.** Mutation: remove one precondition.
- ✅ **18.011 — `note.attached` is idempotent.** Mutation: push the duplicate.
- ✅ **18.012 — `note.moved` to `''` under `project` scope throws.** Mutation: allow it.
- ✅ **18.013 — `EMPTY_NOTE_DOC` deep-equals `emptyDoc()` from `packages/editor`.** Mutation: change a key in either.
- ✅ **18.014 — every event sets `updatedAt` to the envelope's `serverTime` and `seq` to its `seq`.** Mutation: skip `updatedAt` on `note.renamed`.

## 18.2 Server — storage

- ✅ **18.015 — `proj_notes` is a pure function of the events:** after applying the §3.4 example-1 sequence, the row has `scope_mode='project'`, `pre_inherit_mode IS NULL`, two attachment rows then none; `verifyProjections` reports clean. Mutation: write `scope_mode` from the payload instead of the reducer's state.
- ✅ **18.016 — `rebuildProjection('proj_notes')` reproduces identical rows** (reset + replay). Mutation: skip `reset`.
- ✅ **18.017 — `comment.added` on a note lands in `proj_note_comments`** with `note_id` = entity id and `comment_id` = event id; control: a ticket comment still lands in `proj_ticket_comments` only. Mutation: drop the note branch.
- ✅ **18.018 — `schema_version` is read from `body.attrs.schemaVersion`,** default 1 when absent. Mutation: hard-code 1.
- ✅ **18.019 — `getNoteStateFromDb` round-trips a state** through the row and back (`toEqual` the reducer's state). Mutation: drop `scopeBeforeInherit` from `rowToNoteState`.

## 18.3 Server — who may read a note

- ✅ **18.020 — `canReadNote` implements spec §4.1** for every (scope × relationship) cell of the fixture: 5 notes × 7 users. Mutation: flip the `guest` arm of `workspace`.
- ✅ **18.021 — `visibleNotesWhere` returns exactly the notes `canReadNote` accepts,** asserted per user on the same fixture. Mutation: change the `project` arm to ignore project membership.
- ✅ **18.022 — an `inherit` note is readable through ANY one attached visible ticket** (union), and not readable when every attached ticket is invisible or deleted. Mutation: require all.
- ✅ **18.023 — the owner reads every note; the author reads their own private note; a non-member reads nothing.** Mutation: drop the author arm.

## 18.4 Server — who may write which note event

- ✅ **18.024 — the matrix of spec §4.2**: every note event × {author, reader-member, non-reader-member, guest-listed, admin-reader, admin-non-reader, owner} refuses or allows exactly as the table says. Mutation: flip one cell.
- ✅ **18.025 — `note.created` refuses a guest, refuses a project home the actor is not on, and requires ticket visibility for `attachTicketId`.** Control: a member on the project creates. Mutation: drop the project-membership check.
- ✅ **18.026 — `note.attached` requires BOTH reading the note AND seeing the ticket;** a reader who cannot see the ticket is refused, a ticket-viewer who cannot read the note is refused. Mutation: drop either half.
- ✅ **18.027 — refusals carry rule `permission.note` and a plain-language reason;** `note.created` by a guest carries `permission.role` (the role check fires first). Mutation: use the visibility rule id.

## 18.5 Server — reads

- ✅ **18.028 — `GET …/notes` returns exactly the readable, non-deleted notes for each fixture user,** newest `updated_at` first. Mutation: drop `visibleNotesWhere`.
- ✅ **18.029 — `?home=`, `?author=`, `?scope=` filters narrow the list;** control: no filter returns the superset. Mutation: ignore `scope`.
- ✅ **18.030 — `?deleted=1` returns deleted notes only to the author, an admin-reader or the owner;** a member sees `[]`. Mutation: return them to any reader.
- ✅ **18.031 — `GET /v1/notes/:id` is 404 with the same body for an unreadable note and for a random id.** Mutation: 403 for unreadable.
- ✅ **18.032 — `GET …/tickets/:id/notes` omits notes the viewer cannot read** (D5): `guestListed` sees `nInherit` on `TE`; `memberIn` does not. Mutation: drop the predicate.
- ✅ **18.033 — `attachedTickets` in a summary omits tickets the viewer cannot see.** Mutation: drop `visibleTicketsWhere` from the join.
- ✅ **18.034 — history lists `note.created` and every `note.body_set` in order; the version body is that event's payload body.** Mutation: include `note.renamed`.
- ✅ **18.035 — comments are returned in `workspace_seq` order only to readers.** Mutation: skip the readability check.

## 18.6 Client data layer

- ✅ **18.036 — `mapNoteSummaries` maps the server's `{ notes: [...] }` shape and refuses a row missing `noteId` with a `MappingError` naming the path.** Mutation: default `noteId` to `''`.
- ✅ **18.037 — `mapNoteDetail` carries `body` through untouched (as `unknown`) and `schemaVersion` as a number.** Mutation: `JSON.stringify` the body.
- ✅ **18.038 — every note method on the replica data source rejects with `ReplicaGapError`** naming the method; control: `getTicketSummary` (or another implemented read) resolves. Mutation: return `[]` from `getNotes`.

## 18.7 Server — file attachments on notes

- ✅ **18.039 — upload with `noteId` succeeds for the author and is 403 for a non-author reader;** control: upload with `ticketId` is unchanged. Mutation: skip the author check.
- ✅ **18.040 — download of a note-owned attachment is 200 for a reader and 404 for a non-reader** (same body as an unknown id). Mutation: authorise by ticket only.
- ✅ **18.041 — a request naming both `ticketId` and `noteId`, or neither, is 400.** Mutation: prefer `ticketId` silently.
- ✅ **18.042 — `note.created` refuses a `homeProjectId` no project was founded under, even for the owner and even when the actor holds a forged membership on it** (spec §3.3's existence precondition); control: a real project is accepted. Mutation: drop the `note.created` case from `projectsNamedBy`.

## 18.10 Search

- ✅ **18.121 — every fresh test database has `pg_trgm` and `vector` installed** (`SELECT extname FROM pg_extension`); control: `postgis` is absent. Mutation: drop `CREATE EXTENSION vector` from the migration (red only on the pgvector image, which is the point of 18.122). `apps/server/test/search/preflight.test.ts`.
- ✅ **18.122 — the four Postgres image sites name one image string**, `pgvector/pgvector:pg16`: the two compose files and `ci.yml`'s two postgres service blocks. The COUNT (`4`) is asserted as well as the distinct value — deleting a site or adding a fifth pgvector site both leave the distinct set correct and only the count catches them. Mutation: change one site. `apps/server/test/search/preflight.test.ts`.
- ✅ **18.123 — `proj_note_search.tsv` is generated from the three columns with weights A/B/C** (title A, body B, ticket text C); control: a word in no column has no weight. The weight is read by suffix, not by position: `tsvector` concatenation offsets the right operand's positions, so `'room':1B` would pin an arithmetic detail of the generator rather than the claim that the body is weight B. Mutation: swap A and B in the migration. `apps/server/test/search/preflight.test.ts`.
- ✅ **18.124 — the pre-flight tool reports both extensions available and the connected role able to create them**, and reads `vector`'s `default_version` as ≥ `0.8.0` (spec §7.1's floor for an HNSW index under a visibility filter). Two controls, both in the same case: `postgis` is absent from `pg_available_extensions` and reported unavailable, and **`hstore` is available and NOT installed** — reported `available: true` with a null `installedVersion`, which is what makes a tool reading `pg_extension` fail this case instead of passing it. Mutation: query `pg_extension` instead of `pg_available_extensions`. `apps/server/test/search/preflight.test.ts`.
- ✅ **18.125 — `chunkDoc` splits on headings and the 150-word budget, prepends the heading path, and returns `[]` for an empty document**; control: one short paragraph → ONE chunk whose text is that paragraph exactly (no heading path, and no newline where one would be). Also pinned: an H2 under an H1 gives `"H1 > H2"`, a second H1 RESETS the path, and the 150-word budget is measured on the BODY while the heading line is part of the chunk text (so 200 one-word paragraphs give 151 and 51 words). Mutation: drop the heading path. `packages/domain/test/doc-chunks.test.ts`.
- ✅ **18.126 — `embedTexts` returns unit-length vectors of `EMBEDDING_DIM` (512), deterministically, and never touches the network** (`env.allowRemoteModels === false`, and `HF_HUB_OFFLINE=1` set BEFORE the module is loaded by a dynamic import). Controls: a different text is a different vector, and a 20-text batch keeps its order and length. Mutation: skip normalisation. `apps/server/test/search/embedding.test.ts`.
- ✅ **18.127 — semantically close texts are closer than unrelated ones:** `cos("fridge broken", "compressor stopped in the cold room")` > `cos("fridge broken", "quarterly tax filing")`, with a margin over `0.1` so it is not a rounding artefact (measured on this machine: `0.3631` against `0.0356`; the measured values are in the assertion messages). Mutation: return zeros. `apps/server/test/search/embedding.test.ts`.
- ✅ **18.128 — `embedQuery` caches: two calls with the same string return the SAME vector object**, which is a stronger proof than a call counter — the identical `Float32Array` instance cannot come from a recomputation. Control: a different string is a different object, so "always returns the first cached vector" fails too, and the cache size grows by exactly one per distinct string. Mutation: disable the cache. `apps/server/test/search/embedding.test.ts`.
- ✅ **18.129 — the pre-flight prints RSS before and after `embedQuery('warm-up')`, and the delta is under 400 MB on this machine.** Measured 2026-09-23 on the lane's `pgvector/pgvector:pg16` container, Node 22.22.2, `pnpm --filter @gisik-nokma/server run search:preflight`: **RSS 268.7 MB → 543.5 MB, Δ 274.8 MB** (and `vector 0.8.6, trusted=false` beside it). The warm-up string is one no other case uses, so the query cache cannot make the delta look like zero. The measurement is REPORTED, not thrown: a checkout with no model files still gets the extension verdict. Mutation: — (a measurement, not a behaviour). `apps/server/test/search/embedding.test.ts`.
- ✅ **18.130 — `foldSearchText`: `a·chik`, `a'chik`, `a’chik`, `aʼchik` → `achik`; `don't` → `dont`; `'quoted'` keeps its quotes; `  Cold   Room ` → `cold room`;** NFC before lowercasing (a decomposed `Café` is the same string as a composed one); control: `compressor` unchanged but for case. Mutation: skip the mark removal. `packages/domain/test/search-fold.test.ts`.
- ✅ **18.131 — after `note.created` + `note.body_set`, `proj_note_search` holds the folded title and body text** (`Broken Fridge` → `broken fridge`; control: `proj_notes.title` still holds the raw `Broken Fridge`, so the fold is this table's property and not the note's); `ticket_text` is empty until an attachment, then it is exactly `ccre-3 fix the freezer` — the fixture's own derived key (`Convenience Corner` → `CC`, `Registrations` → `RE`, third ticket in the project) and the folded ticket title, pinned as a LITERAL rather than recomputed with the same helpers the projection calls. The same fact is asserted from the fixture's own `nInherit`/`TE` pair (`ccre-2 share the july invoices`). Mutation: skip folding the body. `apps/server/test/projections/note-search.test.ts`.
- ✅ **18.132 — renaming the attached ticket re-derives `ticket_text`; deleting it removes the line; restoring it brings it back.** Control in the same case: a `ticket.field_set` whose `fieldId` is NOT `title` carries the renamed title as its value, so a projection that ignored `fieldId` would pass by accident — the assertion is that the line is unchanged, which that projection would change. Mutation: ignore ticket events. `apps/server/test/projections/note-search.test.ts`.
- ✅ **18.133 — `note.deleted` removes the row; `note.restored` recreates it** — from `proj_notes`, with the folded title and body intact, and not from nothing. Mutation: keep the row. `apps/server/test/projections/note-search.test.ts`.
- ✅ **18.134 — `proj_note_lexemes` holds every folded word ≥ 3 letters from title, body and ticket text, once per workspace;** control: `to` (2 letters) is absent. The split is on `[^\p{L}\p{N}]+` and that is pinned in both directions: `belt` and `room` are present while `cold-room` is NOT, so a space split reddens. `freezer` — a word that appears in a TICKET TITLE and nowhere else — is present, which is what pins ticket text as the third source. Mutation: split on spaces only. `apps/server/test/projections/note-search.test.ts`.
- ✅ **18.135 — replay is clean:** `verifyProjections` reports `{ clean: true, diffs: [] }` for both tables after the sequence, and the stored tsvector contains the unstemmed `licences` (the `simple` behavioural tie, and no `licenc:` prefix). Runs LAST in its file, because it asserts the whole table against a rebuild. Mutation: use `'english'` in the migration's generated column. `apps/server/test/projections/note-search.test.ts`.
- ✅ **18.136 — `runOnce` embeds a stale note into `search_note_chunks` with `source_seq` = the note's `seq` and `model` = the worker's model** (the vector is `vector_dims` 512, matching the column), and a **TITLE FALLBACK** covers a note whose document yields no chunks — one chunk built from the title, which is plain rather than folded (chunk text is what a snippet is cut from; folding is `proj_note_search`'s job). **Ruling, against the spec's literal query:** `c.note_id IS NULL` never becomes false for a chunk-less note, so without the fallback such a note would be re-processed on every pass forever and, with `LIMIT 20`, could starve the queue. Control: the next run returns 0. Mutation: ignore `source_seq`. `apps/server/test/search/embed-worker.test.ts`.
- ✅ **18.137 — after `note.body_set`, the next run REPLACES the chunks:** one paragraph becomes a two-chunk document and the table holds exactly two rows, all carrying the new `source_seq`, with the previous body's text gone. Mutation: append instead of replace. `apps/server/test/search/embed-worker.test.ts`.
- ✅ **18.138 — changing the model re-embeds every note;** every note is stale and comes back with the new `model` column, and the control is the next run with the SAME model returning 0 — so the count is about the model column and not about notes being endlessly stale. Mutation: ignore the model column. `apps/server/test/search/embed-worker.test.ts`.
- ✅ **18.139 — a deleted note's chunks are removed; a restored note's are rebuilt.** The delete arm is its own statement, not the staleness query: that query filters `deleted = FALSE`, so a deleted note's chunks would never be reached by it. Mutation: skip deleted notes. `apps/server/test/search/embed-worker.test.ts`.
- ✅ **18.140 — only `note.created` and `note.body_set` nudge, and three nudges inside 100 ms collapse into one pass.** Two halves, both needed: the predicate over every note type plus a ticket (controls: `note.renamed`, `note.scope_set`, `comment.added`), and the **real `buildApp` wiring** — a recording ingest service, the registered listener handed events, and the callback observed — because a predicate nothing calls is not a listener. The debounce is counted against a FAKE pool under fake timers, where a SELECT per pass is the observable. Mutation: nudge on every note event. `apps/server/test/search/embed-worker.test.ts`.



