# Notes — design

**Date:** 2026-09-23. **Owner rulings** taken in the brainstorm on that date are marked *(owner)*. Everything
else is the recommendation the owner accepted. **Release branch:** `release/notes`, cut from `main`
`59029e1c`; work integrates there and merging it to `main` is the release (`CLAUDE.md`, 2026-09-23).

## 0. What is being built

A **note** is a rich-text document that lives in one workspace, is filed under the workspace or one of
its projects (*home*), carries one visibility rule (*scope*), can be attached to any number of tickets,
and is searchable by spelling and by meaning across everything the searcher may read. Notes get their
own page in the web app, a section on the ticket sheet, page-level comments, saved history with restore,
soft delete with undo, and the document editor ported from the knowledge-base app.

Built on the existing ledger (event-sourced, per-workspace `workspace_seq`, projections, visibility
stream), the existing editor package, the existing ticket search, and the existing comment stack.

### 0.1 Decisions, in one table

| # | Decision | Ruling |
|---|---|---|
| 1 | Scope is **one visibility rule per note** (not a filing location, not a union) | *(owner)* A |
| 2 | Scopes: **private, workspace, project, inherit, explicit** | *(owner)* — private added by the owner |
| 3 | Home is chosen at creation from any workspace/project the person belongs to, defaulting to where Create was pressed; changeable within the workspace | *(owner)* |
| 4 | Inherit is offered only while ≥1 ticket is attached; last detach reverts to the pre-inherit scope, or to private if born in inherit | *(owner)* |
| 5 | A note the viewer cannot read is **absent** from the ticket's Notes section — no locked badge | *(owner)* A |
| 6 | Author edits; admins per §2.2; any reader attaches/detaches on tickets they may edit | *(owner)* A |
| 7 | Notes page is its own route, link **left of Inbox** with a page icon, Confluence-shaped | *(owner)* |
| 8 | Left tree is **flat under containers** (workspace, projects); no nesting in v1; parent field reserved | *(owner)* A |
| 9 | Editor: port task lists, code blocks with copy, wiki-links, reading extras, Markdown paste/copy; **not** the live markdown reveal; plus a new **collapsible block** on `< ` | *(owner)* |
| 10 | Collapsible folded state is **part of the document** | *(owner)* A |
| 11 | Storage is the **JSON document** tickets use; Markdown is an import/export format | accepted |
| 12 | Attach from the ticket: **pick an existing note or create a new one** from the picker | *(owner)* B |
| 13 | Clicking a badge **navigates to the Notes page** | *(owner)* A |
| 14 | **Autosave, coalesced**, with a Saved indicator; last write wins across the author's own devices | *(owner)* C |
| 15 | **History list, read-only view, restore** | *(owner)* C |
| 16 | **Soft delete with undo**; restore by author/admin | *(owner)* A |
| 17 | **Web only** in v1; desktop and mobile get the data, not screens | *(owner)* A |
| 18 | Byline: author + edited time, scope chip, attached ticket chips with ×, reading time | *(owner)* |
| 19 | Comments: **page-level thread** reusing the ticket stack; inline comments deferred | *(owner)* A |
| 20 | Search: hybrid lexical + meaning; **small English model inside the server process**; no multilingual model in v1; Garo through trigram + raka folding; a fine-tuned Garo model is a follow-up | *(owner)* |
| 21 | Search surfaces: **notes in the global search under a kind label AND a notes-only box on the Notes page** | *(owner)* C |
| 22 | Search **as you type**: lexical per keystroke (prefix on the last word), meaning after a pause, **appended below, never reranking** | *(owner)* |
| 23 | Indexed text: **title, body, and attached tickets' keys and titles**; author is a filter, not index text | *(owner)* B |
| 24 | Filters beside the notes search box: **author and scope** | *(owner)* B |
| 25 | Mentions: in a note comment notify as ticket comment mentions do; in a note body notify each person once, on the first save containing them | default, unobjected |

### 0.2 Out of scope for this release

Inline (anchored) comments · nested notes and drag-to-reparent · folders · notes on desktop and mobile
screens · note counts on board cards and list rows · a multilingual or Garo-tuned embedding model · views,
reactions · collaborative (multi-author) editing · the live markdown reveal · moving a note between
workspaces · backlinks rail (cheap later: a query over stored wiki-link ids).

---

## 1. Domain model and events

### 1.1 The entity

`'note'` joins `ENTITY_KINDS` (`packages/domain/src/envelope.ts:15-24`). Its id is a client-minted ULID,
as tickets' are, so a note created offline exists at once and syncs later. All note events are filed
against the note (`entity: { kind: 'note', id }`), including comments.

A note carries two properties that are related but distinct:

- **home** — `projectId | null` (`null` = workspace level). Where it sits in the tree. Set at creation;
  changeable to another project *of the same workspace* (`note.moved`). Never to another workspace.
- **scope** — the visibility rule (§2.1). One of `private | workspace | project | inherit | explicit`,
  with `userIds` only when `explicit`.

### 1.2 Events (all `version: 1`, `entityKind: 'note'`)

| Type | Payload | Notes |
|---|---|---|
| `note.created` | `{ title, home: projectId\|null, scope: {mode, userIds?}, body?: DocJson, attachTicketId?: string }` | `attachTicketId` makes "create from a ticket in inherit scope" one atomic event. `inherit` at birth requires `attachTicketId`. |
| `note.renamed` | `{ title }` | |
| `note.body_set` | `{ body: DocJson }` | The **full document**, schema version inside it (`versioned-document.ts`). |
| `note.scope_set` | `{ mode, userIds? }` | Same shape and refusals as `visibility.set` (`packages/domain/src/events/visibility.ts:18-57`): `userIds` required non-empty for `explicit`, refused otherwise. `inherit` refused when the note has no attachments. `project` refused when home is `null`. |
| `note.moved` | `{ home: projectId\|null }` | Moving to `null` while scope is `project` is refused (scope must change first). |
| `note.attached` | `{ ticketId }` | Ticket must exist, be live, and be in the same workspace. Idempotent on a duplicate. |
| `note.detached` | `{ ticketId }` | No-op on a ticket not attached. |
| `note.deleted` / `note.restored` | `{}` | Soft. |
| `comment.added` | `{ body }` | **Reused unchanged** from tickets (`ticket-events.ts:119`), filed against the note. |

### 1.3 Reducer — `applyNoteEvent`

`packages/domain/src/note-state.ts`, same shape as `ticket-state.ts:117` (one `switch`, `claim()`
provenance per value). State: `title, body, home, scope, scopeBeforeInherit, attachments: Set<ticketId>,
authorId, deleted, createdAt, updatedAt, lastBodySeq`.

**The detach rule (owner ruling 4), derived in the reducer, never a separate event:**

- On `note.scope_set` → `inherit` (or `note.created` with `inherit`): `scopeBeforeInherit :=` the scope
  in force before (with its `userIds` if `explicit`), or `null` when born in inherit.
- On `note.detached` that empties `attachments` while `scope.mode === 'inherit'`:
  `scope := scopeBeforeInherit ?? { mode: 'private' }`; `scopeBeforeInherit := null`.
- On `note.scope_set` to anything other than `inherit`: `scopeBeforeInherit := null`.

Every consumer (server projection, sync classifier, client replica) folds the same ledger through the same
reducer, so the reverted scope is identical everywhere, including offline.

**Refusals the reducer/payload schema enforce** (each a test): `userIds` outside `explicit`; empty
`userIds` in `explicit`; `project` scope with `null` home; `inherit` with no attachment; `note.moved` to
`null` under `project` scope; attach to a ticket in another workspace, a deleted ticket, or a non-existent
one (server-side existence check, as `checkProjectExists` does for projects).

### 1.4 Ledger growth

Each save stores the whole document. This is what makes history and restore free (§3.3). Long notes saved
often grow the ledger faster than tickets do; accepted for v1 (coalescing in §6.4 keeps it to one event per
typing pause). Diff storage is not planned.

---

## 2. Visibility and sync

### 2.1 The reader predicate — written once, used three times

`canReadNote(eff: EffectiveRole, userId, note)` (domain-pure, beside `canSeeResolved`), its SQL twin
`visibleNotesWhere(eff, userId, params)` (beside `visibleTicketsWhere`, `apps/server/src/read/visible-where.ts:95`),
and the sync classifier (§2.4) all implement this table. A test runs the three against one fixture and
asserts identical answers.

| Scope | Reads it |
|---|---|
| `private` | the author |
| `workspace` | as ticket `workspace` visibility: workspace `owner`, `admin`, `member`; **not** `guest` (`can-see.ts:118-137`) |
| `project` | `owner`, or `admin`/`member` who is a member of the home project |
| `inherit` | anyone who `canSeeResolved` **at least one** attached live ticket (union) |
| `explicit` | anyone on `userIds` (guests included, as for tickets) |

Plus, in every scope: **the author** reads their own note, and the workspace **`owner`** reads every note
(`can-see.ts:125`). **Admins have no override** — measured: `canSeeResolved` treats `admin` exactly as
`member`. The brainstorm's section 2 said "owners and admins"; the code says owners only, and notes
follow the code.

A deleted note is readable only through the Deleted group (§6.2) by its author or an admin who can
otherwise read it, and by the owner.

### 2.2 Writes — the permission pipeline

Note events pass through `checkPermission` (`check-permission.ts:1345`) like every other event. A new
step `checkNotePermission` runs after `checkRolePermission` and answers, per event:

| Event | Allowed for |
|---|---|
| `note.created` | any role that may create a ticket in the home (guests refused, as `check-permission.ts:741`) |
| `note.renamed`, `body_set`, `scope_set`, `moved`, `deleted`, `restored` | the author; a workspace `admin` **who can read the note**; the `owner` |
| `note.attached` / `note.detached` | any reader of the note who may edit the ticket (the same actor test `ticket.field_set` uses) |
| `comment.added` on a note | any reader of the note |

§2.1's admin finding narrows owner ruling 6 ("admins can edit or delete any note"): an admin edits and
deletes the notes they can read, the owner edits and deletes all. **Flagged for the owner to confirm.**

Client and server run the same check; a write the client would refuse never enters the outbox, and a
server refusal is surfaced through the outbox's existing rejected-batch handling
(`packages/sync-client/src/outbox/outbox.ts:147`).

### 2.3 Attachments (images) in notes

Inline images are `image` nodes with `attrs.attachmentId` (`doc-embeds.ts:25`). `POST /v1/attachments`
(`routes/attachments.ts:302`) and `GET /v1/attachments/:id` (`:532`) authorise by ticket today. Each gains
a note branch: upload against a note requires author/admin-reader/owner; download requires reading the
note. Without it an image pasted into a private note is fetchable by id.

### 2.4 Sync scope

`audienceClassOf` (`apps/server/src/visibility/visible-events-for.ts:221-253`) is a `default`-less switch
over `ENTITY_KINDS`; adding `'note'` fails typecheck until it is classified. Classification: **an event on
a note reaches a device when its user reads the note at that moment**, per §2.1, computed from
`proj_notes` + `proj_note_attachments` + `proj_visibility`.

Three transitions use the stream's existing instruction types (`SyncItem`, `:197`):

- **Reach lost** → `PurgeInstruction` for the note. Triggers: scope narrows; `explicit` list shrinks;
  the last ticket the user could see is detached; **a ticket's visibility changes under an inherit note**.
  The device drops the note, its attachments, its comments.
- **Reach gained** → `ReachGrantedInstruction` followed by the note's full event history. Triggers:
  scope widens; user added; a ticket they can see gets the note attached; restore.
- **Ticket visibility cascade.** `nowInvisibleTicketsInScope` (`:288`) already re-evaluates a ticket's
  descendants; the same pass re-evaluates readers of every `inherit` note attached to the ticket. This
  is the piece expected to take iteration; it has its own two-session browser case.

### 2.5 The local replica

`packages/sync-client/src/storage/schema.ts` gains `notes`, `note_attachments`, `note_comments`;
`LOCAL_SCHEMA_VERSION` → 2 with a migration for existing devices. `ReplicaDataSource` implements the new
`DataSourceQuery` methods (§3.4), so desktop and mobile hold the data the day they get a screen.

---

## 3. Storage and projections

Rules inherited from `apps/server/src/projections/registry.ts` and the ticket-comments migration header:
`proj_` prefix, unqualified names, `jsonb` never `json`, deterministic derivation (the verifier replays
and `EXCEPT`s), registration order in `projections/index.ts`, reset + replay in canonical order.
Migration numbers **exceed `1790000000000`** (the current latest).

### 3.1 `proj_notes`

`note_id PK, workspace_id, home_project_id text DEFAULT '', author_id, title, body jsonb, schema_version
int, scope_mode, scope_user_ids text[], pre_inherit_mode, pre_inherit_user_ids text[], deleted bool,
created_at, updated_at, last_body_event_id, seq, workspace_seq`. Indexes: `(workspace_id, home_project_id,
updated_at DESC)` for the tree; `(workspace_id, author_id)` for the filter chip.

### 3.2 `proj_note_attachments`

`note_id, ticket_id, workspace_id, attached_at, workspace_seq`, PK `(note_id, ticket_id)`, index
`(ticket_id)` so the badge query is a lookup.

### 3.3 Comments and history

- **Comments:** `proj_note_comments (comment_id PK, workspace_id, note_id, author_id, body jsonb,
  recorded_at, workspace_seq)`, index `(note_id, workspace_seq)`. The ticket-comments projection
  (`projections/ticket-comments.ts:46`) gains a note branch keyed on `entity.kind`, rather than a copy.
- **History: no table.** `SELECT … FROM events WHERE entity_kind='note' AND entity_id=$1 AND type IN
  ('note.created','note.body_set') ORDER BY seq` is the version list; a version's body is that event's
  payload; restore is a new `note.body_set`. Nothing to project, nothing to drift.

### 3.4 Reads — new `DataSourceQuery` methods (`packages/app-core/src/data-source.ts`)

Every read applies `visibleNotesWhere`. `getNotes(workspaceId, { home?, authorId?, scopeMode? })` for
the tree · `getNote(noteId)` · `getNotesForTicket(ticketId)` (returns only readable notes — an unreadable
attachment is absent, ruling 5) · `getNoteComments(noteId)` · `getNoteHistory(noteId)` ·
`searchNotes(workspaceId?, text, { authorId?, scopeMode? })` (§4.6). Routes under `/v1/notes/…` mirror the
ticket read routes. **Writes need no new route** — the single event submission path.

---

## 4. Search

### 4.1 Lexical — `proj_note_search`

`note_id PK, workspace_id, home_project_id, title, body_text, ticket_text, tsv tsvector GENERATED ALWAYS
AS (setweight(to_tsvector('simple', title),'A') || setweight(to_tsvector('simple', body_text),'B') ||
setweight(to_tsvector('simple', ticket_text),'C')) STORED`, `GIN (tsv)`, index `(workspace_id)`. Mirrors
`proj_search` (`1788278094725_proj-search.sql:56-71`); `FTS_CONFIG = 'simple'` stays the single constant
(`read/fts.ts:44`). `body_text` = `docToPlainText(body)` (`packages/domain/src/doc-text.ts:47`) extended for
the new nodes (§5). `ticket_text` = the attached tickets' keys and titles, newline-joined; the projection
re-derives it on `note.attached`/`detached` and on `ticket.field_set` of a title (subscribes to both).

**Fold before index and before query**, one pure function `foldSearchText` in `packages/domain`: NFC,
lowercase, and the Garo raka mark unified — `·` (U+00B7), `'`, `’`, `ʼ` between letters are removed, so
`a·chik`, `a'chik`, `achik` are one token. Applied to `title`, `body_text`, `ticket_text` on write and to
the query string on read. Deterministic, so the projection stays verifiable.

Visibility is applied **at read time, never at index time** — the table holds every note, as
`proj_search` holds every ticket.

### 4.2 As you type

Per keystroke (client debounce ≈100 ms): all words but the last as terms, the last as a prefix —
`to_tsquery('simple', $folded_terms)` with `lastword:*`. Ranked by `ts_rank_cd` with the A/B/C weights,
`updated_at` as tiebreak, `LIMIT 50`, `ts_headline` snippet over `body_text` with the existing options
(`routes/search.ts:26`).

### 4.3 Similar spelling — `pg_trgm`

The project's first extension: `CREATE EXTENSION IF NOT EXISTS pg_trgm` in the notes migration. A derived
table `proj_note_lexemes (workspace_id, lexeme, PRIMARY KEY (workspace_id, lexeme))` with `GIN (lexeme
gin_trgm_ops)`, rebuilt from the folded text (deterministic: split on non-letters, distinct). When a typed
word yields no lexical hit, the nearest lexemes (`lexeme % $word ORDER BY similarity DESC LIMIT 3`,
`pg_trgm.similarity_threshold` set per query) replace it and the query reruns with `OR`. This is the "did
you mean" pattern; it is deterministic, language-neutral, and it is what carries Garo.

### 4.4 Meaning — `pgvector`

The second extension: `CREATE EXTENSION IF NOT EXISTS vector`.

- **Table `search_note_chunks`** — *deliberately not `proj_`*: a vector depends on the model binary, so
  the replay verifier could never reproduce it. `note_id, chunk_index, workspace_id, heading_path text,
  chunk_text, model text, source_seq bigint, embedding vector(384)`, PK `(note_id, chunk_index)`, index
  `(workspace_id)`. HNSW (`vector_cosine_ops`) is created **only** once §4.7's measurement says the exact
  scan is too slow; at v1 corpus sizes exact is milliseconds.
- **Chunking** from the document's block structure: paragraphs merged up to ≈200 tokens under their
  heading path; the heading path is prepended to the chunk text before embedding.
- **Model:** `Xenova/all-MiniLM-L6-v2` (384-d) through `@huggingface/transformers` (ONNX, quantized, CPU),
  **bundled into the server image at build time** — production never downloads at runtime. Loaded lazily
  on first use. Runtime memory ≈150 MB on the `professional-xs` server instance (`deploy/do/app.yaml:52`);
  the instance size does not change in v1.
- **Staleness loop inside the server process:** every N seconds (and nudged after a `note.body_set`
  commits), select notes where `proj_notes.seq > coalesce(max(chunks.source_seq), 0)` **or**
  `chunks.model <> $CURRENT_MODEL`, re-chunk, re-embed, replace the note's rows in one transaction. The
  same loop is therefore the **re-index job** for a model change and the backfill for notes that predate
  search. `CURRENT_MODEL` is a string constant `"<name>@<version>"`; changing it re-embeds everything.
- **Query:** embed the folded query once (60 s LRU keyed by string), `SELECT … ORDER BY embedding <=> $q
  LIMIT 20` **with `visibleNotesWhere` in the same statement**, grouped to one row per note (best chunk).

### 4.5 Fusion — the owner's ordering rule

Lexical results are the list. Meaning results run after a ≈400 ms typing pause and are **appended below**
the lexical list, skipping notes already present, in their own order. No reciprocal-rank fusion, no
reranking of what is already shown (ruling 22). A mutation that reranks must go red (§8).

### 4.6 Surfaces and the API

- `/v1/search` (`routes/search.ts:304`) gains `kinds=ticket,note` (default both) and returns note rows
  labelled `kind: 'note'` beside ticket rows; the client's `DataSourceQuery.search` gains the parameter.
- `searchNotes` (§3.4) is the same route restricted to notes, with `authorId` and `scopeMode` filters
  (ruling 24), and a `meaning=true` second call for the appended results.
- A **result row** carries: note id, title, snippet (highlighted), home, scope mode, attached ticket keys,
  author, `updated_at`, and which side produced it (`lexical` / `meaning`).

### 4.7 Pre-flight and targets

- **Pre-flight, run by the first migration task before it writes anything, against the dev DB (54330,
  read-only) and the managed DB:** `SELECT rolsuper, rolcreatedb FROM pg_roles WHERE rolname =
  current_user` and `SELECT name, default_version FROM pg_available_extensions WHERE name IN
  ('pg_trgm','vector')`. DigitalOcean lists both as supported on PG 14–18 and installable with `CREATE
  EXTENSION` (docs.digitalocean.com, supported-extensions, read 2026-09-23); the connected role is the
  cluster's injected `DATABASE_URL` user (`app.yaml:58-59`). The pgvector **version** is recorded from
  that query; ≥0.8 enables iterative filtered scans and decides the HNSW switch.
- **Test and dev Postgres image** changes from `postgres:16-alpine` (`docker-compose.yml:3`,
  `docker-compose.dev.yml:101`) to `pgvector/pgvector:pg16`, keeping the `Asia/Kolkata` timezone.
- **Targets**, measured by the seeded-corpus case (§8): lexical ≤ 50 ms server-side p95 at 10 000 notes;
  meaning ≤ 150 ms including query embedding. Embedding loop ≥ 20 chunks/s on the server instance.
- **Garo:** an owner-written evaluation set of 30–50 query→note pairs is a test fixture. The case records
  recall@5 for the model versus the trigram baseline. If the model does not beat the baseline, Garo search
  is stated as spelling-based in the help text, and a Garo-tuned model is the follow-up.

---

## 5. The editor port

### 5.1 Where

Everything lands in the existing **`packages/editor`** (Tiptap `^3.22.3`, extension set in
`src/schema/extensions.ts:52-153`). No second editor package. The knowledge-base pieces
(`/Users/kiro/my_projects/knowledge-base/src/app/knowledge_base/features/document/`, zero Tauri
imports — measured) arrive as extensions and node views adapted to the JSON document and BEM styling,
with their unit tests adapted alongside. Its phantom dependencies (`@tiptap/extension-heading`,
`-list-item`, `-code-block`, `@tiptap/core`) are declared explicitly — pnpm does not resolve transitively.

### 5.2 What is added

| Feature | Source | Notes |
|---|---|---|
| Task lists, nested | `@tiptap/extension-task-list` / `-task-item` 3.31.3 (MIT) | Checkboxes live for editors, inert for readers. Input rule `[ ] `. |
| Code block with copy button | KB `codeBlockCopy.tsx` node view | No syntax highlighting in v1 (KB's `lowlight` dep was declared and unused). |
| **Collapsible block** | `@tiptap/extension-details` 3.31.3 — **MIT, verified 2026-09-23** (`npm view`) | Input rule on `< ` at line start; the rest of the line becomes the summary; body follows; Enter on an empty last body line exits; blocks nest. `open` attr **saved in the document** (ruling 10); a new block starts open. Rendered as native `<details><summary>`. |
| Wiki-links between notes | KB `extensions/wikiLink.tsx` + `WikiLinkHoverCard.tsx` | Trigger `[[`; suggestions from `getNotes` of readable notes (a prop, not a file index); **stores the note id**; display text follows the live title (`useLiveQuery`); unreadable/missing target → red pill with last known title; hover card shows the first lines via `getNote`. |
| Markdown paste | KB `markdownSerializer.ts:178` `markdownToHtml` | Paste rule fires only when the clipboard has no `text/html` and the text matches a Markdown heuristic (line-start `#`, `-`, `1.`, `>`, ``` or contains `**`/`[[`); otherwise plain paste. |
| Markdown copy | KB `htmlToMarkdown` (`:12`) as `clipboardTextSerializer` | Plain-text clipboard flavour is Markdown; HTML flavour unchanged; export function for the page. `<details>` round-trips as `<details><summary>`. |
| Reading extras | KB `ReadingTOC.tsx`, `extractHeaders.ts`, reading time | Notes page only, display only. |
| Toolbar | `EditorToolbar.tsx` | Buttons: task item, code block, collapsible, wiki-link. |

### 5.3 Consequences for tickets

The extension set is shared, so ticket descriptions and comments gain task lists, code blocks and
collapsibles. Obligations, each a task and a case:

1. `DOC_SCHEMA_VERSION` (`packages/editor/src/doc.ts:1`) → **2**; readers accept 1 and 2.
2. `renderCommentBody` (`packages/app-core/src/views/comment-body.tsx:231`) learns `taskList`,
   `taskItem`, `codeBlock`, `details`, `detailsSummary`, `detailsContent`, `wikiLink` — or it silently
   drops them.
3. `docToPlainText` (`doc-text.ts:47`) extracts text from the same nodes (search depends on it).
4. The mobile WebView bundle (`packages/editor` `build:webview` → `apps/mobile/src/editor/editor-html.generated.ts`)
   is rebuilt so a description containing a collapsible renders on the phone.
5. `EditorSlotSubmission` (`editor-slot.tsx:79-81`) gains a `note.body_set` arm and `mode: 'note'`
   with autosave props (`onDraft`, `onSave`, `saveState`).

### 5.4 Left behind

Live markdown reveal (~1 600 lines, Markdown-text model), `MarkdownPane`, `DocumentView`, vault hooks,
backlinks rail, folder picker, draft banner, unlinked-mention detection.

---

## 6. The Notes page (web)

### 6.1 Route and navigation

`apps/web/app/notes/page.tsx` at `/notes`, `/notes/[noteId]` for one note. A link **left of the Inbox
link** in `apps/web/src/app-nav.tsx` (`:467` is `InboxNavLink`) with a page icon, `aria-current` on the
route. Like the Inbox, the page spans every workspace the person belongs to.

### 6.2 Layout — three regions at desktop width

- **Left tree.** Title filter box; then each workspace, and under it each of its projects the person
  belongs to; under each container its notes sorted by `updated_at DESC`, an attached note showing its
  ticket keys beside the title. **Create** at the top opens the home + scope picker (§1.1; ruling 3).
  A **Deleted** group at the bottom for authors/admins with Restore. The tree is a `useLiveQuery`.
- **Centre document.** Breadcrumb (workspace / project / note). Editable `<h1>` title → `note.renamed`
  on blur or Enter. **Byline** (ruling 18): author avatar + name, "edited N min ago", the **scope chip**
  (opens a scope editor built on `VisibilityEditor`, `packages/app-core/src/views/visibility-editor.tsx`,
  extended with `private` and with `inherit` offered only while attached), the **attached ticket chips**
  (key, link to the ticket, × to detach — the badge component of §7.2), reading time, and a **History**
  control. Then the toolbar and editor (§6.4). Below: the comment thread (`CommentsThread`,
  `comments-thread.tsx:171`, fed by `getNoteComments`).
- **Right rail**, wide widths only: the table of contents. Below a threshold the rail hides and the tree
  becomes a drawer.

### 6.3 Search on the page

A search box in the page header. While it holds text the tree's note lists are replaced by the ranked
result list with snippets; **author** and **scope** chips beside the box (ruling 24); lexical results per
keystroke, meaning results appended after the pause (§4.5). Clearing restores the tree. Picking a result
opens the note with the matched text scrolled into view.

### 6.4 Saving

Autosave, coalesced (ruling 14): the editor keeps a local draft on every change (`localStorage`, keyed by
user + note, the pattern of `use-last-project.ts`); one `note.body_set` is written when typing pauses
≥ 2 s, on blur, and on leaving the page. A **Saved / Saving… / Not saved (kept locally)** indicator in the
byline. Offline, the event sits in the outbox as ticket events do. Last write wins across the author's own
devices.

### 6.5 History

The History control opens a panel listing versions (time, author) from `getNoteHistory`. Selecting one
shows it read-only in place of the editor with **Restore** and **Back**. Restore writes a new
`note.body_set` and returns to editing.

### 6.6 Readers versus authors

A reader gets the same page with the editor read-only, no toolbar, no rename, no scope editing; may
attach the note to tickets they may edit, toggle collapsibles, and comment.

### 6.7 States that must be drawn

Empty tree for a new member · note that became unreadable while open (return to the tree with a message)
· note deleted under you · save failure while offline (draft kept) · search with no results · a wiki-link
whose target the reader cannot see. Styling, spacing and accessibility go through the workspace's
`ui-ux-pro-max` skill on the existing token system (`packages/ui/src/ui.css`).

---

## 7. The ticket's Notes section

### 7.1 Placement

In the ticket sheet's Details tab (`packages/app-core/src/views/ticket-sheet.tsx`), a **"Notes · N"**
section between the description and the comments thread (the `Comments · N` heading region, `:3521`), where `ticketId` and
`workspaceId` are in scope. N counts only readable notes (ruling 5).

### 7.2 Badges — a new `NoteBadge` in `packages/ui`

The existing `Chip` (`packages/ui/src/components/chip.tsx:13`) has no dismiss control and `RemoveIcon`
(`select-icons.tsx:10`) is `aria-hidden`; a removable badge is therefore a **new component**, not a
composition at each call site. `NoteBadge { title, scopeMode, href, onDetach?, detachLabel }`: the title
truncated with the full title on hover; a small scope mark; the badge body is a link to `/notes/<id>`
(ruling 13); the × is its own `<button aria-label="Detach <title>">` on the corner, rendered only when
`onDetach` is given (viewer may edit the ticket). Detach writes `note.detached` and shows a toast with
**Undo** that writes `note.attached`.

### 7.3 Attach note — the picker (ruling 12)

A button at the end of the badge row opens a picker: a search box over titles of readable notes in this
workspace, already-attached notes excluded; results from the replica list (`getNotes`) filtered as you
type, with `searchNotes` behind it for long lists. The last row is always **"New note: <typed text>"**.
Choosing it writes one `note.created` with `home = ticket.projectId`, `scope = inherit`, `attachTicketId =
ticketId`, then navigates to `/notes/<id>`. Choosing an existing note writes `note.attached` and stays.

### 7.4 Live behaviour

The section is a `useLiveQuery` over `getNotesForTicket`, so a note attached elsewhere appears without
reload, and a note whose scope moves away from the viewer disappears (its purge arrives on the stream).

---

## 8. Testing and acceptance

A new `test-cases/18-notes.md` (next free section after `17-open-work.md`), catalogued in `Features.md`
in the same change set; ids from a block allocated in the §13 table's manner. Every case red first, a
control in the same `it`, a named post-commit mutation. Suites run after `pnpm turbo run build`, never
piped into `head`, Node named in every result.

| Layer | Cases |
|---|---|
| **Domain** | every scope transition; **the detach rule** (revert to remembered scope with `userIds`; private when born in inherit); each §1.3 refusal; `docToPlainText` over the new nodes; `foldSearchText` (raka forms → one token; a control word unchanged) |
| **Server — permissions** | the matrix: each note event × {author, reader, non-reader, admin-reader, admin-non-reader, owner, guest}; attach requires ticket-edit rights; guest cannot create |
| **Server — reader predicate** | one fixture: a note per scope, a user per relationship; `canReadNote`, `visibleNotesWhere` and the sync classifier asserted **identical** on it; `getNotesForTicket` omits unreadable notes |
| **Server — sync** | reach lost (each trigger) → local tables empty; reach gained → full history present; **the ticket visibility cascade** (change a ticket's visibility, assert the inherit note purged on the device that lost it and kept on the one that did not) |
| **Server — projections** | replay through `verify:projections` for `proj_notes`, `proj_note_attachments`, `proj_note_comments`, `proj_note_search`, `proj_note_lexemes`; `ticket_text` re-derived on a ticket rename |
| **Server — attachments** | note branches of upload/download; a private note's image is 404/403 to a non-reader |
| **Search** | prefix per keystroke; trigram correction ("compresor" → "compressor"); **no-leak property**: a non-reader never sees a restricted note in results, snippets or counts; staleness loop re-embeds after a save and after a model-name change; **ordering**: meaning results appended, mutation that reranks → red; the Garo fixture recording recall@5 vs baseline; pre-flight extension/role query |
| **Editor** | `< ` input rule; `[ ] `; Markdown paste and copy round-trip; wiki-link suggestion, red pill, rename-following; folded state survives save/reload; v1 documents render under v2; `renderCommentBody` shows each new node (mutation: drop a node → red); mobile bundle builds |
| **Web** | tree as live query; search-as-you-type; history view + restore; ticket section badges, picker, create-from-ticket, detach + undo; each §6.7 state; `NoteBadge` accessible name and the × as its own button |
| **Browser (built stack)** | create from a ticket → on the Notes page; detach the last ticket → private; two-session purge; meaning hit on a seeded fixture |
| **Performance** | 10 000-note seeded corpus: the two latency targets p95 server-side, recorded in the case; embedding throughput |

---

## 9. Risks and open verifications

| Risk | Handling |
|---|---|
| Ticket-visibility cascade into inherit notes | own cases, two-session browser case, expected to iterate (§2.4) |
| Filtered nearest-neighbour under-returns on HNSW | exact scan in v1; HNSW only after §4.7 measurement; pgvector version recorded |
| Model memory on `professional-xs` | ≈150 MB measured at first run; the pre-flight records RSS before/after model load |
| Extension creation rights on the managed DB | pre-flight query (§4.7); DO docs say `CREATE EXTENSION` by the cluster user |
| Garo quality of an English model | measured against the trigram baseline; help text follows the number |
| Ledger growth from full-document saves | coalesced saves; diffs not planned |
| Admin override narrower than the ruling | §2.1/§2.2 follow the ticket code; **owner to confirm** |

## 10. Follow-ups (not in this release)

Inline anchored comments (≈12–15 tasks; the page thread is its prerequisite) · nested notes (parent
field reserved) · desktop and mobile note screens (data already synced) · a Garo-tuned embedding model
(base chosen by measurement; the re-index loop is already the swap mechanism) · backlinks · note counts
on cards and rows · syntax highlighting in code blocks.
