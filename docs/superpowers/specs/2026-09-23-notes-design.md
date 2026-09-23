# Notes — design (literal edition)

**Date:** 2026-09-23. **Release branch:** `release/notes`, cut from `main` `59029e1c`. Task branches
are cut from `release/notes` and PR back into it. Merging `release/notes` into `main` is the release
and deploys to production; only the owner does that.

This document is written so that a model with a small context and no memory of the brainstorm can
build from it. Every rule is stated once, in full, with the file it lives in. Nothing is left to be
inferred from "how tickets do it": where tickets are the model, the ticket rule is quoted.

---

## 0. How to read and use this document

### 0.1 Rules for the builder

1. **Read the named file at the named line before writing code that touches it.** Line numbers were
   opened on 2026-09-23 at `main` `59029e1c`. They drift; the symbol names do not.
2. **Do not invent a second way to do something this repo already does.** If a section says "reuse X",
   call X. If X does not fit, stop and report, do not copy X.
3. **Every behaviour in §3–§10 has a test case in §11.** Write the test first (it must fail), then the
   code, then run the test (it must pass), then apply the named mutation (it must fail again), then
   restore the code. A test that cannot fail is not a test.
4. **Build before testing.** Packages import siblings by name, which resolves to `dist/`. Run
   `pnpm turbo run build` at the repo root before any suite. A stale `dist/` gives false results in
   both directions.
5. **Run a suite as** `cd <package> && pnpm exec vitest run --no-file-parallelism > /tmp/<lane>-run.log 2>&1`
   then read the log's last lines. Never pipe a test run into `head`. Never trust `$?` of a chain.
   Use Node 22 (`~/.nvm/versions/node/v22.22.2/bin`). Name the Node version in every report.
6. **Case ids.** Cases live in `test-cases/18-notes.md` (new file). Ids are `18.<n>`, allocated in
   blocks per task by the plan. Start a case at `❌`; flip to `✅` in the same commit as the test that
   covers it; a `✅` with no test citing its id fails `pnpm check:citations`. Test names contain the id.
7. **`Features.md`** gets a "Notes" section describing what shipped, updated in the same commit as
   the code. `⚙️` marks internal subsystems, `✅` user-visible features.
8. **Migrations** go in `apps/server/migrations/` with a numeric prefix **greater than
   `1790000000000`** (the current latest). A migration numbered below an applied one never runs.
9. **Projection tables** are prefixed `proj_`, use `jsonb` (never `json`), and must be a deterministic
   function of the events (the verifier `pnpm verify:projections` replays and compares). A table that
   depends on anything else (a model binary, the clock) is **not** a projection and is not `proj_`.
10. **Never edit `reference/`.** Never commit to `main` or to `release/notes` directly.

### 0.2 Glossary

| Term | Meaning in this document |
|---|---|
| **note** | A rich-text document. Entity kind `note`. Id: a ULID minted on the client. |
| **body** | The note's content: a ProseMirror JSON document, type `DocJson` (`packages/editor/src/doc.ts:10`). Never Markdown. |
| **home** | Where the note is filed: one project of its workspace, or the workspace itself. Stored as `home_project_id`, `''` meaning workspace level. |
| **scope** | The note's visibility rule. One of `private`, `workspace`, `project`, `inherit`, `explicit`. |
| **reader** | A user for whom `canReadNote` (§4.1) returns `true`. |
| **author** | `actorId` of the `note.created` event. Never changes. |
| **attachment (note→ticket)** | A link from a note to a ticket, created by `note.attached`. A note may be attached to many tickets. Not to be confused with **file attachments** (uploaded files, event `attachment.added`). |
| **ledger** | The `events` table (`apps/server/migrations/1787841717635_events-and-snapshots.sql:3-18`). Append-only. Each event has `seq` (per entity) and `workspace_seq` (per workspace). |
| **envelope** | `EventEnvelope` (`packages/domain/src/envelope.ts:164-176`): `{ id, workspaceId, entity: {kind, id}, type, version, payload, actorId, origin, clientTime, serverTime, seq }`. |
| **projection** | A `proj_*` table rebuilt from the ledger by a `Projection` (`apps/server/src/projections/registry.ts:44-49`): `{ name, tables, apply(event, tx), reset(tx) }`. |
| **replica** | The client's local SQLite copy of the events it may see (`packages/sync-client/src/storage/schema.ts`). |
| **stream** | The WebSocket at `/v1/stream` that feeds a replica. Server: `apps/server/src/visibility/visible-events-for.ts:384` decides which events a user receives. |
| **effective role** | `EffectiveRole` (`apps/server/src/permissions/effective-role.ts:42-46`): `{ workspaceRole: 'owner'\|'admin'\|'member'\|'guest'\|null, projects: Map<projectId, {projectAdmin: boolean}> }`, from `resolveEffectiveRole(db, userId, workspaceId)` (`:100`). |
| **ticket visibility** | `ResolvedVisibility` (`apps/server/src/visibility/can-see.ts:14-19`): `{ workspaceId, projectId, resolvedMode: 'workspace'\|'project'\|'explicit', resolvedUserIds }`; decided by `canSeeResolved(eff, userId, v)` (`:118-137`). |
| **lexical search** | Postgres full-text search: `tsvector`/`tsquery`, dictionary `'simple'`. |
| **meaning search** | Nearest-neighbour search over embedding vectors (`pgvector`). |
| **fold** | `foldSearchText` (§7.2): the normalisation applied to text before indexing and to queries. |

### 0.3 Decisions (owner rulings, 2026-09-23)

| # | Decision |
|---|---|
| D1 | Scope is one visibility rule per note. Not a filing location. Not a union of rules. |
| D2 | Five scopes: `private`, `workspace`, `project`, `inherit`, `explicit`. |
| D3 | Home is chosen at creation from any workspace/project the person belongs to, defaulting to where Create was pressed (or the ticket's project when created from a ticket). Home can change to another project of the same workspace. Never to another workspace. |
| D4 | `inherit` can be chosen only while the note has ≥1 attachment. When the last attachment is removed from an `inherit` note, scope reverts to the scope it had before `inherit`; if there was none (born in `inherit`), scope becomes `private`. |
| D5 | On a ticket, a note the viewer cannot read is simply absent. No locked badge, no count of hidden notes. |
| D6 | The author edits. Admins: see §4.2 (narrower than the brainstorm; flagged). Any reader may attach/detach on a ticket they may edit. |
| D7 | The Notes page is its own route `/notes`; a link left of "Inbox" in the top navigation, with a page icon; Confluence-shaped layout. |
| D8 | The left tree is flat under containers (workspace, then projects). No nesting in v1. A `parent_note_id` column is reserved (always `''`). |
| D9 | Editor: port task lists, code blocks with copy button, wiki-links, reading extras, Markdown paste and Markdown copy from the knowledge-base app. Do not port the live markdown reveal. Add a collapsible block triggered by `< ` at line start. |
| D10 | The collapsible block's open/closed state is stored in the document. |
| D11 | Storage is the same JSON document tickets use. Markdown is only an import (paste) and export (copy) format. |
| D12 | From a ticket, a note is attached through a picker that offers existing notes and a "New note" row. |
| D13 | Clicking a note badge on a ticket navigates to `/notes/<noteId>`. |
| D14 | Autosave, coalesced to one event per typing pause, with a Saved indicator. Last write wins across the author's own devices. |
| D15 | History: a list of saved versions, a read-only view of any version, and Restore. |
| D16 | Soft delete with Undo. Restore by author or admin-reader or owner. |
| D17 | Web app only in v1. Desktop and mobile receive the data (replica) but get no screens. |
| D18 | Byline: author + edited time, scope chip, attached-ticket chips with ×, reading time, History control. |
| D19 | Comments: one page-level thread per note, reusing the ticket comment stack. No inline comments. |
| D20 | Search: lexical + meaning. The embedding model is a small **English** model running inside the server process. No multilingual model in v1. Garo is served by trigram matching and raka folding. A Garo-tuned model is a follow-up. |
| D21 | Notes appear in the global search (labelled by kind) **and** the Notes page has its own notes-only search box. |
| D22 | Search runs as you type: lexical on every keystroke (last word as prefix); meaning after a pause; meaning results are **appended below** the lexical results and never reorder them. |
| D23 | Indexed text: title, body, and the keys and titles of attached tickets. Author is a filter, not indexed text. |
| D24 | Filters beside the notes search box: author, scope. |
| D25 | Mentions in a note comment notify like mentions in a ticket comment. Mentions in a note body notify each mentioned person once, on the first save whose body contains them. |
| D26 | **Inline references** (owner, 2026-09-23 afternoon): in any comment — on a ticket or on a note — typing `:ticket` opens an in-place picker that searches tickets and inserts the chosen one; `:note` does the same for notes. |
| D27 | **Tagging a note in a ticket comment attaches the note to that ticket** — it appears in the ticket's Notes section as if attached by hand. |
| D28 | Defaults set by the planner, unobjected: the two triggers exist in every editor (descriptions and note bodies too, since the editor is shared), but the auto-attach fires only when a *ticket comment* is posted; a reference that cannot be attached (permission refused) still posts the comment and shows a toast naming the note and the reason; removing a reference never detaches; the ticket picker searches the whole workspace the person can see, current project's tickets first. |

### 0.4 Out of scope (do not build)

Inline/anchored comments · nested notes · folders · desktop and mobile screens · note counts on board
cards or list rows · multilingual or Garo-tuned model · views · reactions · multi-author editing ·
live markdown reveal · moving a note between workspaces · backlinks panel · syntax highlighting.

---

## 1. Build order

Tasks depend on each other in this order. The implementation plan follows it.

1. Domain: entity kind, payload schemas, reducer (§3).
2. Server permissions: `checkNotePermission`, `canReadNote`, `visibleNotesWhere` (§4).
3. Migration 1: tables `proj_notes`, `proj_note_attachments`, `proj_note_comments` (§6.1–6.3); projections; reads and routes (§6.4).
4. Sync: audience class, purge/reach transitions, replica schema and `ReplicaDataSource` methods (§5).
5. File attachments' note branch (§4.4).
6. Migration 2: extensions pre-flight, `proj_note_search`, `proj_note_lexemes`, `search_note_chunks` (§7); search projection; embedding worker; search route changes.
7. Editor port (§8) — independent of 1–6; can run in parallel.
8. Notes page (§9) — needs 1–6 and 7.
9. Ticket Notes section (§10) — needs 1–6 and the `NoteBadge`.
10. Browser cases and the performance case (§11.9–11.10).

---

## 2. Data shapes (TypeScript)

These types are the contract between sections. Put them in `packages/domain/src/note-state.ts`
(state, scope) and `packages/domain/src/read-models.ts` (read models), following where
`ticket-state.ts` and the existing read models live.

```ts
export const NOTE_SCOPE_MODES = ['private', 'workspace', 'project', 'inherit', 'explicit'] as const;
export type NoteScopeMode = (typeof NOTE_SCOPE_MODES)[number];

export type NoteScope =
  | { mode: 'private' }
  | { mode: 'workspace' }
  | { mode: 'project' }
  | { mode: 'inherit' }
  | { mode: 'explicit'; userIds: string[] };   // non-empty

export type NoteState = {
  noteId: string;
  workspaceId: string;
  authorId: string;
  title: string;
  body: unknown;                 // DocJson; EMPTY_NOTE_DOC until the first body_set
  homeProjectId: string;         // '' = workspace level
  scope: NoteScope;
  scopeBeforeInherit: NoteScope | null;
  attachedTicketIds: string[];   // sorted, unique
  deleted: boolean;
  createdAt: string;             // serverTime of note.created
  updatedAt: string;             // serverTime of the latest event of any type
  lastBodyEventId: string;       // event id of the latest note.created-with-body or note.body_set
  seq: number;
};

// Read model returned by getNotes / getNote / getNotesForTicket (packages/domain/src/read-models.ts)
export type NoteSummary = {
  noteId: string;
  workspaceId: string;
  homeProjectId: string;
  authorId: string;
  title: string;
  scope: NoteScope;
  attachedTickets: { ticketId: string; key: string; title: string }[];
  deleted: boolean;
  createdAt: string;
  updatedAt: string;
};
export type NoteDetail = NoteSummary & { body: unknown; schemaVersion: number };
export type NoteVersion = { eventId: string; authorId: string; recordedAt: string; seq: number };
export type NoteComment = { commentId: string; authorId: string; body: unknown; recordedAt: string };
export type NoteSearchHit = {
  noteId: string;
  title: string;
  snippet: string;                // ts_headline output, `**` around matches
  homeProjectId: string;
  scopeMode: NoteScopeMode;
  attachedTicketKeys: string[];
  authorId: string;
  updatedAt: string;
  source: 'lexical' | 'meaning';
};
```

---

## 3. Domain

### 3.1 Entity kind

File `packages/domain/src/envelope.ts:15-24`, `ENTITY_KINDS`: add `'note'`. This constant feeds
`z.enum` in `entitySchema` (`:110`) and the switch in `audienceClassOf`
(`apps/server/src/visibility/visible-events-for.ts:221-236`), which has no `default` and a declared
return type, so TypeScript fails until §5.1 is done. That failure is intended.

### 3.2 Event payload schemas

New file `packages/domain/src/events/note-events.ts`. Use zod exactly as
`packages/domain/src/events/ticket-events.ts` does. The `DocJson` check is `isDocJson`
(`packages/editor/src/doc.ts:20`); in `packages/domain` use the same structural test the description
field uses (`z.record(z.string(), z.unknown())` with `type === 'doc'`).

```ts
import { z } from 'zod';

export const noteScopePayload = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('private') }),
  z.object({ mode: z.literal('workspace') }),
  z.object({ mode: z.literal('project') }),
  z.object({ mode: z.literal('inherit') }),
  z.object({ mode: z.literal('explicit'), userIds: z.array(z.string().min(1)).min(1) }),
]);

const docJson = z.record(z.string(), z.unknown()).refine((d) => d.type === 'doc', 'not a doc');

export const noteCreatedPayload = z.object({
  title: z.string().min(1).max(500),
  homeProjectId: z.string(),            // '' = workspace level
  scope: noteScopePayload,
  body: docJson.optional(),
  attachTicketId: z.string().min(1).optional(),
}).refine((p) => p.scope.mode !== 'inherit' || p.attachTicketId !== undefined,
  'inherit at birth requires attachTicketId')
  .refine((p) => p.scope.mode !== 'project' || p.homeProjectId !== '',
  'project scope requires a project home');

export const noteRenamedPayload  = z.object({ title: z.string().min(1).max(500) });
export const noteBodySetPayload  = z.object({ body: docJson });
export const noteScopeSetPayload = noteScopePayload;
export const noteMovedPayload    = z.object({ homeProjectId: z.string() });
export const noteAttachedPayload = z.object({ ticketId: z.string().min(1) });
export const noteDetachedPayload = z.object({ ticketId: z.string().min(1) });
export const noteDeletedPayload  = z.object({});
export const noteRestoredPayload = z.object({});
```

Register each in `packages/domain/src/vocabulary.ts` after the `attachment.added` registration
(`:231`), in this exact form (the registry is `domainRegistry.register({ type, version, entityKind,
payloadSchema })`, `:58-63`):

| `type` | `payloadSchema` |
|---|---|
| `note.created` | `noteCreatedPayload` |
| `note.renamed` | `noteRenamedPayload` |
| `note.body_set` | `noteBodySetPayload` |
| `note.scope_set` | `noteScopeSetPayload` |
| `note.moved` | `noteMovedPayload` |
| `note.attached` | `noteAttachedPayload` |
| `note.detached` | `noteDetachedPayload` |
| `note.deleted` | `noteDeletedPayload` |
| `note.restored` | `noteRestoredPayload` |

All `version: 1`, `entityKind: 'note'`.

**`comment.added` is not re-registered.** It is already registered with `entityKind: 'ticket'`
(`vocabulary.ts:224`, payload `commentAddedPayload` at `ticket-events.ts:119` = `{ body }`). Change its
registration so the registry accepts it against both kinds: if the registry's `entityKind` field is a
single string, change that field to accept `readonly EntityKind[]` and register `comment.added` with
`['ticket', 'note']`. Read `createEventTypeRegistry` before deciding; do not register a second type
named `comment.added`.

### 3.3 Reducer

New file `packages/domain/src/note-state.ts`, exporting `NOTE_EVENT_TYPES` and
`applyNoteEvent(state: NoteState | null, env: EventEnvelope): NoteState`. Shape it like
`applyTicketEvent` (`packages/domain/src/ticket-state.ts:117`, one `switch (env.type)` at `:220`).
Provenance wrapping (`claim()`, `:101`) is **not** needed for notes; store plain values.

**`EMPTY_NOTE_DOC`.** `packages/domain` must not import `packages/editor` (the dependency runs the other
way: `packages/editor/package.json:26` depends on `@gisik-nokma/domain`). So `note-state.ts` defines
`export const EMPTY_NOTE_DOC = { type: 'doc', attrs: { schemaVersion: 2 }, content: [{ type: 'paragraph' }] }`
— copy the exact literal that `emptyDoc()` returns (`packages/editor/src/doc.ts:12`) with the new schema
version, and add a test in `packages/editor` asserting `emptyDoc()` deep-equals `EMPTY_NOTE_DOC` so the
two cannot drift.

Transitions. "Refuse" means: throw an `Error` with a message that names the event type and the reason
(as `applyTicketEvent` does at `packages/domain/src/ticket-state.ts:126`); the server's submission path
turns a reducer throw into a rejected event, and the client runs the reducer before enqueueing, so it
never enqueues one.

| Event | Precondition (else refuse) | Effect |
|---|---|---|
| `note.created` | `state === null` | Build `NoteState`: `authorId = env.actorId`, `body = payload.body ?? EMPTY_NOTE_DOC`, `scope = payload.scope`, `scopeBeforeInherit = null`, `attachedTicketIds = payload.attachTicketId ? [it] : []`, `deleted = false`, `lastBodyEventId = env.id`. |
| `note.renamed` | `!deleted` | `title = payload.title` |
| `note.body_set` | `!deleted` | `body = payload.body`; `lastBodyEventId = env.id` |
| `note.scope_set` | `!deleted`; if `mode === 'inherit'` then `attachedTicketIds.length >= 1`; if `mode === 'project'` then `homeProjectId !== ''` | If new mode is `inherit` and current mode is not `inherit`: `scopeBeforeInherit = current scope`. If new mode is not `inherit`: `scopeBeforeInherit = null`. Then `scope = payload`. |
| `note.moved` | `!deleted`; if `payload.homeProjectId === ''` then `scope.mode !== 'project'` | `homeProjectId = payload.homeProjectId` |
| `note.attached` | `!deleted` | Add `ticketId` to `attachedTicketIds` if absent (idempotent). |
| `note.detached` | `!deleted` | Remove `ticketId` if present. **Then, if `attachedTicketIds` is now empty and `scope.mode === 'inherit'`:** `scope = scopeBeforeInherit ?? { mode: 'private' }`; `scopeBeforeInherit = null`. |
| `note.deleted` | `!deleted` | `deleted = true` |
| `note.restored` | `deleted` | `deleted = false` |
| `comment.added` | `!deleted` | no state change |

Every event sets `updatedAt = env.serverTime`, `seq = env.seq`.

Server-only preconditions (checked in §4.2 because they need the database, not in the reducer):
the ticket in `attachTicketId`/`ticketId` exists, is in `env.workspaceId`, and is not deleted; the
project in `homeProjectId` exists in `env.workspaceId` and is not archived.

### 3.4 Worked example of D4 (the detach rule)

1. `note.created { scope: {mode:'project'}, homeProjectId:'P1' }` → scope `project`, before `null`.
2. `note.attached { ticketId:'T1' }` → attached `[T1]`.
3. `note.scope_set { mode:'inherit' }` → scope `inherit`, **before = `{mode:'project'}`**.
4. `note.attached { ticketId:'T2' }` → attached `[T1,T2]`.
5. `note.detached { ticketId:'T1' }` → attached `[T2]`; scope unchanged (not empty).
6. `note.detached { ticketId:'T2' }` → attached `[]`; **scope = `{mode:'project'}`**, before `null`.

Second example: `note.created { scope:{mode:'inherit'}, attachTicketId:'T1' }` then
`note.detached { ticketId:'T1' }` → scope **`private`**.

### 3.5 Plain text of a body

`docToPlainText(doc)` (`packages/domain/src/doc-text.ts:47`) must return the text of the new node
types (§8.3): `taskItem` (its paragraph text), `codeBlock` (its text), `detailsSummary` and
`detailsContent` (their text, summary first), `wikiLink` (its `title` attr). Add one test per node.

---

## 4. Permissions and the reader predicate

### 4.1 `canReadNote` — the single definition of "reader"

New file `apps/server/src/visibility/can-read-note.ts`. Pure function. `attachedVisibilities` is the
`ResolvedVisibility` of each attached, non-deleted ticket, fetched by the caller with
`getResolvedVisibility` (`can-see.ts:150`).

```ts
export function canReadNote(
  eff: EffectiveRole,
  userId: string,
  note: Pick<NoteState, 'authorId' | 'homeProjectId' | 'scope' | 'deleted'>,
  attachedVisibilities: ResolvedVisibility[],
): boolean {
  if (eff.workspaceRole === null) return false;           // not a member of the workspace
  if (note.authorId === userId) return true;              // the author always reads their own note
  if (eff.workspaceRole === 'owner') return true;         // the owner reads everything (can-see.ts:125)
  switch (note.scope.mode) {
    case 'private':   return false;
    case 'workspace': return eff.workspaceRole !== 'guest';                    // can-see.ts:127-131
    case 'project':   return eff.workspaceRole !== 'guest' && eff.projects.has(note.homeProjectId);
    case 'explicit':  return note.scope.userIds.includes(userId);            // guests included, as for tickets
    case 'inherit':   return attachedVisibilities.some((v) => canSeeResolved(eff, userId, v));
  }
}
```

Deleted notes: `canReadNote` ignores `deleted`. Reads (§6.4) exclude deleted notes except
`getDeletedNotes`, which returns deleted notes for which `canReadNote` is true **and** the caller is
the author, an admin, or the owner.

### 4.2 Who may write which event — `checkNotePermission`

File `apps/server/src/permissions/check-permission.ts`. `checkPermission` (`:1345`) runs a chain of
checks; add `checkNotePermission(env, ctx, eff)` **after** `checkRolePermission` (`:559`) and before
`checkVisibilityPermission` (`:1060`). It returns the same result type the other checks return. It
runs only when `env.entity.kind === 'note'`.

Definitions used below:
- `isAuthor` = `note.authorId === ctx.sessionUserId`
- `isOwner` = `eff.workspaceRole === 'owner'`
- `isAdminReader` = `eff.workspaceRole === 'admin' && canReadNote(...)`
- `canEditTicket(ticketId)` = the actor test `ticket.field_set` passes in `checkRolePermission` for that
  ticket (read the rule at the `case 'ticket.field_set'` in `:559-874` and call the same helper).

| Event | Allowed when |
|---|---|
| `note.created` | role is `owner`, `admin` or `member` (guests refused, matching `ticket.created` at `:741`); if `homeProjectId !== ''` the actor is a member of that project or `isOwner`; if `attachTicketId` is set, `canEditTicket(attachTicketId)` |
| `note.renamed`, `note.body_set`, `note.scope_set`, `note.moved`, `note.deleted`, `note.restored` | `isAuthor \|\| isAdminReader \|\| isOwner` |
| `note.attached`, `note.detached` | `canReadNote(...) && canEditTicket(payload.ticketId)` |
| `comment.added` (entity kind `note`) | `canReadNote(...)` |

**Deviation from the brainstorm, flagged for the owner:** the brainstorm said "admins can edit or
delete any note". The ticket code gives admins no override (`canSeeResolved` treats `admin` like
`member`, `can-see.ts:129-131`); only `owner` has one. This spec follows the code. If the owner wants
the broader rule, change `isAdminReader` to `eff.workspaceRole === 'admin'` in one place.

The client runs the same function before enqueueing (the sync client already runs `checkRolePermission`
locally; find where and add the note check beside it).

### 4.3 `visibleNotesWhere` — the SQL form

New function in `apps/server/src/read/visible-where.ts`, beside `visibleTicketsWhere` (`:95`). Same
signature: `(eff: EffectiveRole, userId: string, params: SqlParams): string`, returning a WHERE
fragment over an alias `n` of `proj_notes`. It must return exactly the rows `canReadNote` accepts.

```sql
-- eff.workspaceRole === null           → FALSE
-- eff.workspaceRole === 'owner'        → TRUE
-- otherwise:
(
  n.author_id = $user
  OR (n.scope_mode = 'workspace' AND $role <> 'guest')
  OR (n.scope_mode = 'project'   AND $role <> 'guest' AND n.home_project_id = ANY($memberProjectIds))
  OR (n.scope_mode = 'explicit'  AND $user = ANY(n.scope_user_ids))
  OR (n.scope_mode = 'inherit'   AND EXISTS (
        SELECT 1 FROM proj_note_attachments na
        JOIN proj_visibility v ON v.ticket_id = na.ticket_id
        JOIN proj_tickets t ON t.ticket_id = na.ticket_id AND t.deleted = FALSE   -- use the live-ticket predicate LIVE_TICKET_WHERE (visible-where.ts:200)
        WHERE na.note_id = n.note_id AND ( <visibleTicketsWhere over v> )
     ))
)
```

`$memberProjectIds` = `[...eff.projects.keys()]`. The inner `<visibleTicketsWhere over v>` is the
existing function's output aliased to `v`; read `explicitAudienceWhere` (`:226`) for the explicit arm.
Test §11.3 asserts `canReadNote` and `visibleNotesWhere` agree on one fixture.

### 4.4 File attachments (uploads) in notes

`POST /v1/attachments` (`apps/server/src/routes/attachments.ts:302`) and `GET /v1/attachments/:id`
(`:532`) authorise against a ticket today. Each gets a note branch:

- Upload request carries either `ticketId` or `noteId` (exactly one). With `noteId`: allowed when the
  actor `isAuthor || isAdminReader || isOwner` of that note.
- Download of an attachment stored against a note: allowed when `canReadNote`.
- Store the owning note id in the same column that stores the owning ticket id, with a new column
  `owner_kind text` (`'ticket'|'note'`), or a nullable `note_id` column — read the attachments table
  before choosing; keep one pattern.

---

## 5. Sync (stream and replica)

### 5.1 Audience class

`apps/server/src/visibility/visible-events-for.ts:219`: add `'note'` to `AudienceClass`.
`audienceClassOf` (`:221`): `case 'note': return 'note';`.

In the generator's `switch (audienceClassOf(env.entity.kind))` (`:434`), add:

```ts
case 'note': {
  const note = await loadNoteForVisibility(db, env.entity.id);        // proj_notes row + attachments
  const vis  = await resolvedVisibilitiesOf(db, note.attachedTicketIds);
  if (canReadNote(eff, userId, note, vis)) {
    if (isNoteGrantTrigger(env.type)) {                                  // scope_set, attached, restored, created
      const notes = await noteGrantNoticeFor(db, userId, env.entity.id, afterSeq, backfilled);
      if (notes.length > 0) yield { kind: 'reach-granted', workspaceId, notes };
    }
    yield env;
  } else if (isNoteRevokeTrigger(env.type)) {                            // scope_set, detached, deleted
    yield { kind: 'purge', entityId: env.entity.id };
  }
  break;
}
```

`reach-granted` (`ReachGrantedInstruction`, `:195`) carries `tickets: string[]` today; extend it with
an optional `notes: string[]` rather than adding a second instruction kind. `PurgeInstruction` (`:103`)
is `{ kind: 'purge', entityId }` and is reused unchanged; the client learns the kind from its local
`events.entity_kind` for that id.

### 5.2 The ticket-visibility cascade

When a **ticket** event changes visibility (`visibility.set`, `ticket.reparented`, `ticket.deleted`,
`ticket.restored`, membership changes that `nowInvisibleTicketsInScope` (`:288`) already handles), every
`inherit`-scoped note attached to an affected ticket must be re-evaluated for the user:

- If `canReadNote` was `true` before and is `false` now → `{ kind: 'purge', entityId: noteId }`.
- If it was `false` before and is `true` now → reach-granted with `notes: [noteId]` and the note's full
  event history (same mechanism as ticket backfill, `grantNoticeFor`).

Implement as a helper `notesAffectedByTicketChange(db, ticketIds) → noteIds` (query
`proj_note_attachments` joined to `proj_notes WHERE scope_mode = 'inherit'`) called from the same
place `nowInvisibleTicketsInScope` is called. Test §11.4.

### 5.3 Replica (client SQLite)

`packages/sync-client/src/storage/schema.ts`: `LOCAL_SCHEMA_VERSION` → `2`, and add:

```sql
CREATE TABLE IF NOT EXISTS notes (
  note_id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, home_project_id TEXT NOT NULL,
  author_id TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, scope TEXT NOT NULL,
  scope_before_inherit TEXT, attached_ticket_ids TEXT NOT NULL, deleted INTEGER NOT NULL,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL, last_body_event_id TEXT NOT NULL, seq INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS notes_home_idx ON notes (workspace_id, home_project_id, updated_at);
CREATE TABLE IF NOT EXISTS note_comments (
  comment_id TEXT PRIMARY KEY, note_id TEXT NOT NULL, author_id TEXT NOT NULL,
  body TEXT NOT NULL, recorded_at TEXT NOT NULL, workspace_seq INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS note_comments_note_idx ON note_comments (note_id, workspace_seq);
```

`scope`, `scope_before_inherit`, `attached_ticket_ids`, `body` are JSON strings. The local reducer is
`applyNoteEvent` (§3.3) — the replica folds the same events. A `purge` for a note deletes its `notes`
row, its `note_comments` rows and its `events` rows. Write the version-1→2 migration in the file's
existing migration mechanism (read how `LOCAL_SCHEMA_VERSION` 1 is applied first).

`ReplicaDataSource` (`packages/sync-client/src/replica/replica.ts`) implements every method in §6.4
against these tables. There is no local search in v1: `searchNotes` on the replica calls the server
when online and returns `[]` offline.

---

## 6. Server storage, projections, reads

### 6.1 Migration 1 — `apps/server/migrations/1790100000000_proj-notes.sql`

```sql
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
```

### 6.2 Projection `notes` — `apps/server/src/projections/notes.ts`

`{ name: 'proj_notes', tables: ['proj_notes', 'proj_note_attachments'], apply, reset }`. `apply`
returns immediately unless `event.entity.kind === 'note'`. It loads the current `NoteState` (from
`proj_notes` + `proj_note_attachments`, or `null`), calls `applyNoteEvent`, and writes the whole row
back (`INSERT … ON CONFLICT (note_id) DO UPDATE`). For `note.attached`/`note.detached` it also inserts
or deletes the `proj_note_attachments` row. `schema_version` is read from
`body.attrs.schemaVersion` (`packages/editor/src/schema/versioned-document.ts:9-15`), default `1`.
Writing the full row from the reducer's state keeps the table a pure function of the events.

Register it in `apps/server/src/projections/index.ts` (`:64-95`) **after** `proj_visibility` and
`proj_tickets` (the search projection of §7 reads them).

### 6.3 Comments projection — note branch

`apps/server/src/projections/ticket-comments.ts:46-60`: today `apply` returns when
`event.entity.kind !== 'ticket'`. Change to a branch: kind `ticket` → the existing insert; kind `note` →
the same insert into `proj_note_comments` with `note_id = event.entity.id`. Add `'proj_note_comments'`
to `tables` and to `reset`.

### 6.4 Reads, routes, data-source methods

Add to `DataSourceQuery` (`packages/app-core/src/data-source.ts:193-200`), and implement in the HTTP
data source and in `ReplicaDataSource`:

| Method | Route | SQL core (server) |
|---|---|---|
| `getNotes(workspaceId, filter?: { homeProjectId?: string; authorId?: string; scopeMode?: NoteScopeMode }): Promise<NoteSummary[]>` | `GET /v1/workspaces/:workspaceId/notes?home=&author=&scope=` | `FROM proj_notes n WHERE n.workspace_id=$1 AND n.deleted=FALSE AND <visibleNotesWhere> [AND filters] ORDER BY n.updated_at DESC` |
| `getDeletedNotes(workspaceId): Promise<NoteSummary[]>` | `GET …/notes?deleted=1` | same with `deleted=TRUE` and the §4.1 deleted rule |
| `getNote(workspaceId, noteId): Promise<NoteDetail \| null>` | `GET /v1/notes/:noteId` | one row; `null` (HTTP 404) when absent **or unreadable** — never 403, so existence does not leak |
| `getNotesForTicket(workspaceId, ticketId): Promise<NoteSummary[]>` | `GET /v1/tickets/:ticketId/notes` | `JOIN proj_note_attachments na ON na.note_id=n.note_id WHERE na.ticket_id=$1 AND n.deleted=FALSE AND <visibleNotesWhere>` |
| `getNoteComments(workspaceId, noteId): Promise<NoteComment[]>` | `GET /v1/notes/:noteId/comments` | readable check, then `proj_note_comments ORDER BY workspace_seq` |
| `getNoteHistory(workspaceId, noteId): Promise<NoteVersion[]>` | `GET /v1/notes/:noteId/history` | readable check, then `SELECT id, actor_id, server_time, seq FROM events WHERE entity_kind='note' AND entity_id=$1 AND type IN ('note.created','note.body_set') ORDER BY seq` |
| `getNoteVersion(workspaceId, noteId, eventId): Promise<unknown>` | `GET /v1/notes/:noteId/history/:eventId` | readable check, then that event's `payload.body` |
| `searchNotes(...)` | see §7.7 | |

`attachedTickets` in `NoteSummary` is built by joining `proj_note_attachments` to `proj_tickets`
(key and title) **and filtering by `visibleTicketsWhere`**: a reader of the note who cannot see one of
its tickets does not learn that ticket's key.

Place the route handlers in a new `apps/server/src/routes/notes.ts`, registered where
`routes/tickets.ts` is registered. Use `requireSession` as the other read routes do.

Writes: none of the above writes. All writes are events through the existing submission route.

---

## 7. Search

### 7.1 Migration 2 — `apps/server/migrations/1790200000000_note-search.sql`

```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE proj_note_search (
  note_id          text PRIMARY KEY,
  workspace_id     text NOT NULL,
  home_project_id  text NOT NULL,
  title            text NOT NULL,       -- folded (§7.2)
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

CREATE TABLE proj_note_lexemes (
  workspace_id text NOT NULL,
  lexeme       text NOT NULL,
  PRIMARY KEY (workspace_id, lexeme)
);
CREATE INDEX proj_note_lexemes_trgm_idx ON proj_note_lexemes USING gin (lexeme gin_trgm_ops);

-- NOT a projection: depends on the model binary. No proj_ prefix. Not registered in the projection registry.
CREATE TABLE search_note_chunks (
  note_id       text NOT NULL,
  chunk_index   integer NOT NULL,
  workspace_id  text NOT NULL,
  heading_path  text NOT NULL,
  chunk_text    text NOT NULL,
  model         text NOT NULL,
  source_seq    bigint NOT NULL,      -- proj_notes.seq the chunk was built from
  embedding     vector(384) NOT NULL,
  PRIMARY KEY (note_id, chunk_index)
);
CREATE INDEX search_note_chunks_ws_idx ON search_note_chunks (workspace_id);
-- No HNSW index in v1. Add `CREATE INDEX … USING hnsw (embedding vector_cosine_ops)` only when §7.9's measurement requires it.
```

**Pre-flight (a script `apps/server/src/tools/search-preflight.ts`, run before this migration is
applied to any database, and as case 18.x):**

```sql
SELECT name, default_version, installed_version FROM pg_available_extensions WHERE name IN ('pg_trgm','vector');
SELECT rolname, rolsuper, rolcreatedb FROM pg_roles WHERE rolname = current_user;
```

Both extensions must be available. Record `default_version` of `vector` in the case (≥ `0.8.0` is
needed before an HNSW index is used with a visibility filter). DigitalOcean lists both as supported
for managed PostgreSQL 14–18, installable with `CREATE EXTENSION`
(docs.digitalocean.com/products/databases/postgresql/details/supported-extensions, read 2026-09-23).

**Docker images:** change `postgres:16-alpine` to `pgvector/pgvector:pg16` in `docker-compose.yml:3`
and `docker-compose.dev.yml:101`. Keep every other setting (timezone `Asia/Kolkata`, ports 54329 test /
54330 dev).

### 7.2 `foldSearchText` — `packages/domain/src/search-fold.ts`

Pure function `foldSearchText(s: string): string`:

1. Unicode NFC normalise.
2. Lowercase.
3. Remove the raka mark when it sits between two letters: the characters `·` (U+00B7), `'` (U+0027),
   `’` (U+2019), `ʼ` (U+02BC). `a·chik` → `achik`, `a'chik` → `achik`, `a’chik` → `achik`. An
   apostrophe **not** between two letters is left alone (`don't` → `dont` — this is between letters, so
   removed; `'quoted'` → `'quoted'`).
4. Collapse whitespace runs to one space; trim.

Applied by the search projection to `title`, `body_text`, `ticket_text`, and by the search route to
the query string. Tests: each example above, plus a control string with no marks that must come back
unchanged except for case.

### 7.3 Projection `note-search` — `apps/server/src/projections/note-search.ts`

`{ name: 'proj_note_search', tables: ['proj_note_search','proj_note_lexemes'], apply, reset }`.
Reacts to:

- every `note.*` event → recompute the note's row from `proj_notes` (+ attachments joined to
  `proj_tickets` for `ticket_text`); on `note.deleted` delete the row; on `note.restored` recreate it.
- `ticket.field_set` where `payload.fieldId === 'title'`, `ticket.deleted`, `ticket.restored` →
  recompute `ticket_text` of every note attached to that ticket (query `proj_note_attachments`).
- After writing a row, recompute the workspace's lexemes for that note: split the folded
  `title || ' ' || body_text || ' ' || ticket_text` on `[^\p{L}\p{N}]+`, keep tokens of length ≥ 3,
  `INSERT … ON CONFLICT DO NOTHING` into `proj_note_lexemes`. Lexemes are never deleted (a lexeme table
  with extra words is still deterministic given the events; `reset` truncates both tables).

Register **after** `proj_notes` and `proj_tickets`. Deterministic: it reads only projection tables
and applies pure functions.

### 7.4 Lexical query (per keystroke)

Input: `workspaceId`, folded query `q`, optional `authorId`, `scopeMode`, `limit` (default 50).

```ts
const words = q.split(' ').filter(Boolean);
if (words.length === 0) return [];
const last = words.pop()!;
const tsq = [...words.map(w => `'${esc(w)}'`), `'${esc(last)}':*`].join(' & ');
```

```sql
SELECT s.note_id, n.title AS title_raw, n.home_project_id, n.scope_mode, n.author_id, n.updated_at,
       ts_headline('simple', s.body_text, to_tsquery('simple', $tsq),
                   'StartSel=**, StopSel=**, MaxWords=18, MinWords=6') AS snippet,
       ts_rank_cd(s.tsv, to_tsquery('simple', $tsq)) AS rank
FROM proj_note_search s
JOIN proj_notes n ON n.note_id = s.note_id
WHERE s.workspace_id = $1 AND n.deleted = FALSE
  AND s.tsv @@ to_tsquery('simple', $tsq)
  AND <visibleNotesWhere over n>
  [AND n.author_id = $author] [AND n.scope_mode = $scope]
ORDER BY rank DESC, n.updated_at DESC
LIMIT $limit;
```

The headline options string is the existing constant `HEADLINE_OPTIONS`
(`apps/server/src/routes/search.ts:26`); import it, do not retype it.

### 7.5 Spelling correction (only when 7.4 returns zero rows)

For each word `w` in the query (including the last one, without `:*`):

```sql
SELECT lexeme FROM proj_note_lexemes
WHERE workspace_id = $1 AND lexeme % $w
ORDER BY similarity(lexeme, $w) DESC
LIMIT 3;
```

with `SET LOCAL pg_trgm.similarity_threshold = 0.3` in the same transaction. Replace `w` by
`(w | alt1 | alt2 | alt3)` in the tsquery and run §7.4 once more. If the second run also returns zero
rows, return zero rows. The response carries `corrected: true` and the corrected words so the UI can
show "showing results for …".

### 7.6 Meaning query (after the pause)

**Model:** `Xenova/all-MiniLM-L6-v2` through `@huggingface/transformers` (ONNX, quantized, 384
dimensions). The model files are copied into the server image at build time under
`apps/server/models/all-MiniLM-L6-v2/`; the loader is told that directory and is configured to
**never** fetch from the network (`env.allowRemoteModels = false`). Loaded once, lazily, on first use.
`CURRENT_MODEL = 'Xenova/all-MiniLM-L6-v2@q8'` is a string constant in `apps/server/src/search/embedding.ts`.

**Chunking** `chunkDoc(doc): { headingPath: string; text: string }[]` in `packages/domain/src/doc-chunks.ts`:
walk the top-level blocks; maintain the current heading path (`"H1 > H2"`); accumulate paragraph-like
blocks (paragraph, list items, task items, code, details summary+content, table cells) into a chunk
until the chunk's word count exceeds 150, then start a new chunk with the same heading path. Chunk
text = `headingPath + '\n' + accumulated text`. Empty documents produce zero chunks.

**Worker loop** in `apps/server/src/search/embed-worker.ts`, started with the server (same process):
every 10 s, and immediately after any `note.body_set`/`note.created` commit (an in-process event
emitter, not a queue table):

```sql
SELECT n.note_id, n.body, n.seq FROM proj_notes n
LEFT JOIN (SELECT note_id, max(source_seq) AS src, min(model) AS model FROM search_note_chunks GROUP BY note_id) c
  ON c.note_id = n.note_id
WHERE n.deleted = FALSE AND (c.note_id IS NULL OR c.src < n.seq OR c.model <> $CURRENT_MODEL)
ORDER BY n.updated_at DESC LIMIT 20;
```

For each row: chunk, embed each chunk, then in one transaction `DELETE FROM search_note_chunks WHERE
note_id=$1` and insert the new rows with `source_seq = n.seq`, `model = CURRENT_MODEL`. Deleted notes:
delete their chunks in the same loop (`WHERE n.deleted = TRUE AND EXISTS chunks`). This loop is also
the backfill and the re-index after a model change.

**Query:** embed `q` (LRU cache of 256 entries, 60 s), then

```sql
SELECT DISTINCT ON (c.note_id) c.note_id, n.title, n.home_project_id, n.scope_mode, n.author_id, n.updated_at,
       c.chunk_text, (c.embedding <=> $vec) AS distance
FROM search_note_chunks c
JOIN proj_notes n ON n.note_id = c.note_id
WHERE c.workspace_id = $1 AND n.deleted = FALSE AND <visibleNotesWhere over n> [filters]
ORDER BY c.note_id, distance
LIMIT 200;
```

then sort by `distance` ascending in code and keep the first 20. The snippet of a meaning hit is the
first 160 characters of `chunk_text` after the heading line. (v1 uses an exact scan; the `LIMIT 200`
bounds the client-side sort.)

### 7.7 Route and response

Extend `GET /v1/search` (`apps/server/src/routes/search.ts:304`):

| Param | Values | Default |
|---|---|---|
| `q` | text | required |
| `kinds` | comma list of `ticket`, `note` | `ticket,note` |
| `mode` | `lexical` \| `meaning` | `lexical` |
| `author` | user id (notes only) | none |
| `scope` | a `NoteScopeMode` (notes only) | none |
| `workspaceId` | existing | existing |

Response: `{ tickets: SearchHit[], notes: NoteSearchHit[], corrected?: string[] }`. `mode=meaning`
returns only `notes` (tickets have no chunks in v1). Add `searchNotes(workspaceId, q, opts: { mode,
authorId?, scopeMode? }): Promise<{ notes: NoteSearchHit[]; corrected?: string[] }>` to `DataSourceQuery`.

### 7.8 Client merge rule (D22)

In the search hook (`apps/web/src/use-notes-search.ts`, new):

1. On every input change, after a 100 ms debounce, call `mode=lexical`. Replace the displayed list
   with the result. Cancel any pending meaning call.
2. 400 ms after the last input change, call `mode=meaning`.
3. When the meaning result arrives **and the input has not changed since it was requested**, append
   each meaning hit whose `noteId` is not already in the displayed list, in the order returned, after
   the lexical hits. Never reorder, remove or re-rank the lexical hits.
4. A stale response (input changed) is discarded.

### 7.9 Targets (case 18.x, seeded corpus)

A seeding script creates 10 000 notes across 3 workspaces with bodies of 200–800 words. Measure
server-side, p95 over 100 queries: lexical ≤ 50 ms; meaning ≤ 150 ms including query embedding;
worker throughput ≥ 20 chunks/s. Record the numbers and the machine in the case. If meaning exceeds
the target, add the HNSW index (§7.1) and re-measure; record both.

### 7.10 Garo evaluation (case 18.x)

A fixture `apps/server/test/fixtures/garo-eval.json`: 30–50 `{ query, expectedNoteTitle }` pairs
written by the owner, with the matching notes seeded. Compute recall@5 for (a) lexical + correction
and (b) meaning. Record both numbers in the case. If (b) ≤ (a), the help text says search in Garo
matches spelling, not meaning. This case is `🧪` until the owner supplies the pairs.

---

## 8. Editor port

### 8.1 Where and what

All changes are in the existing package `packages/editor` (Tiptap `^3.22.3`). The source is
`/Users/kiro/my_projects/knowledge-base/src/app/knowledge_base/features/document/` (no Tauri imports —
verified). Copy the files below, then adapt: replace Tailwind classes with `gn-editor__*` BEM classes
styled in `packages/ui/src/ui.css`; replace vault repositories with props; keep the tests and adapt
their imports.

Add these dependencies to `packages/editor/package.json` (all `^3.31.3`, MIT, verified 2026-09-23):
`@tiptap/extension-task-list`, `@tiptap/extension-task-item`, `@tiptap/extension-details`,
`@tiptap/extension-details-summary`, `@tiptap/extension-details-content`, `@tiptap/extension-code-block`.
Declare `@tiptap/core`, `@tiptap/extension-heading`, `@tiptap/extension-list-item` explicitly if the
copied files import them (pnpm does not resolve undeclared transitive imports).

### 8.2 Files

| Create in `packages/editor/src/` | From knowledge-base | Purpose |
|---|---|---|
| `extensions/code-block-copy.tsx` | `extensions/codeBlockCopy.tsx` | code block node view with a Copy button |
| `extensions/collapsible.ts` | new | input rule + keymap around the Details extensions (§8.4) |
| `extensions/wiki-link.tsx` | `extensions/wikiLink.tsx` | `[[` suggestion, node, red pill (§8.5) |
| `components/WikiLinkHoverCard.tsx` | `components/WikiLinkHoverCard.tsx` | hover preview |
| `markdown/serializer.ts` | `extensions/markdownSerializer.ts` (`htmlToMarkdown` `:12`, `markdownToHtml` `:178`) | paste-in and copy-out |
| `extensions/markdown-paste.ts` | new | paste rule (§8.6) |
| `extensions/markdown-clipboard.ts` | new | `clipboardTextSerializer` (§8.6) |
| `reading/extract-headers.ts`, `reading/reading-time.ts` | `utils/extractHeaders.ts`, reading-time logic in `MarkdownPane.tsx` | Notes page extras |

Add to `buildEditorExtensions` (`packages/editor/src/schema/extensions.ts:52-153`): `TaskList`,
`TaskItem.configure({ nested: true })`, `CodeBlockWithCopy` (and set `codeBlock: false` in
`StarterKit.configure`), `Details`, `DetailsSummary`, `DetailsContent`, `Collapsible`, `WikiLink`,
`MarkdownPaste`, `MarkdownClipboard`. Toolbar (`components/EditorToolbar.tsx`): buttons Task item,
Code block, Collapsible, Wiki-link.

### 8.3 New node types in the document (schema version 2)

| Node | attrs | Tiptap source |
|---|---|---|
| `taskList`, `taskItem` | `taskItem.checked: boolean` | extension-task-list/-item |
| `codeBlock` | `language: string \| null` | extension-code-block |
| `details` | `open: boolean` | extension-details |
| `detailsSummary`, `detailsContent` | none | extension-details-summary/-content |
| `wikiLink` (inline) | `noteId: string`, `title: string` (last known) | ported |

`DOC_SCHEMA_VERSION` (`packages/editor/src/doc.ts:1`) becomes `2`. A version-1 document contains none
of these nodes and renders unchanged under version 2. `isDocJson` accepts both versions.

**Consequences outside the editor (each is a task with a case):**
1. `renderCommentBody` (`packages/app-core/src/views/comment-body.tsx:231`) renders each node above
   (task item as a disabled checkbox + text; code block as `<pre><code>`; details as `<details open?>`
   with `<summary>`; wiki-link as a link to `/notes/<noteId>` showing `title`). Unknown nodes are
   rendered as their text, never dropped silently.
2. `docToPlainText` (§3.5).
3. The mobile WebView bundle: run `packages/editor`'s `build:webview` and commit the regenerated
   `apps/mobile/src/editor/editor-html.generated.ts`.
4. `EditorSlotSubmission` (`packages/app-core/src/views/editor-slot.tsx:79-81`) gains
   `{ type: 'note.body_set'; body: unknown }` and `EditorSlotProps.mode` (`:95`) gains `'note'`.
   In note mode the slot receives `onDraft(doc)` (every change) and `onSave(doc)` (see §9.4) instead of
   a submit button.

### 8.4 Collapsible block — exact behaviour

- Input rule: regex `/^<\s$/` at the start of a textblock (the user typed `<` then a space as the first
  two characters of the line). Effect: replace the paragraph with `details(open=true)` containing
  `detailsSummary` (empty, cursor inside) and `detailsContent` with one empty paragraph.
- Typing continues into the summary. **Enter** in the summary moves the cursor to the first paragraph
  of the content.
- **Enter** on an empty paragraph that is the last child of `detailsContent` removes that paragraph and
  places the cursor in a new paragraph after the `details` node (exit).
- **Backspace** at the start of an empty summary with empty content removes the whole block and leaves
  a paragraph.
- `< ` typed when the line already has text (`abc< `) does nothing special. `<div>` does nothing
  special (no space after `<`).
- Clicking the summary's marker toggles `open` and **this changes the document** (D10): the change
  goes through the editor as a transaction, so autosave (§9.4) persists it for editors; for readers
  (read-only editor) the toggle is applied to the view only and not saved.
- Rendered as `<details class="gn-editor__details"><summary>…</summary><div>…</div></details>`.
- Markdown export: `<details><summary>Title</summary>\n\ncontent\n\n</details>`; Markdown paste of that
  form recreates the node.

### 8.5 Wiki-link — exact behaviour

- Trigger: `[[` opens a suggestion popup (use `@tiptap/suggestion`, already a dependency). Items come
  from a prop `searchNoteTitles(query: string): Promise<{ noteId: string; title: string }[]>`, which the
  Notes page implements as a client-side filter over `getNotes(workspaceId)` (title `includes`, case-
  insensitive), first 8 matches.
- Selecting an item inserts `wikiLink { noteId, title }` and closes the brackets. Escape closes without
  inserting and leaves `[[` as text.
- Rendering: `<a class="gn-editor__wikilink" href="/notes/<noteId>">title</a>`. The page passes a
  prop `resolveNoteTitle(noteId): string | null` backed by the live notes list; when it returns a
  string, that string is displayed (rename-following); when it returns `null` (missing or unreadable),
  render `<span class="gn-editor__wikilink gn-editor__wikilink--missing">title</span>` (the red pill),
  not a link.
- Hover for 400 ms shows `WikiLinkHoverCard` with the target's first 200 characters of plain text from
  `getNote`; nothing for a missing target.

### 8.6 Markdown paste and copy

- **Paste rule.** Fires only when the clipboard has **no** `text/html` and the plain text matches at
  least one of: a line starting with `#`, `- `, `* `, `1. `, `> `, three backticks; or contains `**` or
  `[[`. Then `markdownToHtml(text)` → insert as HTML. Otherwise default paste.
- **Copy.** `clipboardTextSerializer(slice)` returns `htmlToMarkdown(sliceAsHtml)`. The HTML clipboard
  flavour is unchanged. Round-trip test: build a document with heading, list, task list, code block,
  details, bold, link; copy → Markdown string → paste → document equal to the original (ignoring
  `wikiLink`, which exports as `[[title]]` text and re-imports as plain text unless a note with that
  exact title exists).
- Export: `exportMarkdown(doc): string` in `markdown/serializer.ts`, used by a "Copy as Markdown"
  action on the Notes page.

### 8.7 Not ported

`markdownReveal*.ts`, `rawSyntaxEngine.ts`, `RawBlock`, `MarkdownPane.tsx`, `DocumentView.tsx`,
`useDocumentContent.ts`, `useDocumentFileWatcher.ts`, `useLinkIndex.ts`, `BacklinksRail.tsx`,
`DraftRestoreBanner.tsx`, `UnlinkedMentions.tsx`, `FolderPicker.tsx`, `VaultImage` (this repo's
`TicketImage` + `AttachmentPaste` already handle images).

---

## 9. The Notes page (web)

### 9.1 Routes and navigation

- `apps/web/app/notes/page.tsx` (`/notes`) and `apps/web/app/notes/[noteId]/page.tsx`. `layout.tsx`
  sets the document title with `documentTitleFor('Notes')` (see `apps/web/app/inbox/layout.tsx:18`).
- `apps/web/src/app-nav.tsx`: insert `<NotesNavLink active={pathname.startsWith('/notes')} />`
  immediately **before** `<InboxNavLink …/>` (`:467`). Model `NotesNavLink` on
  `apps/web/src/inbox-nav-link.tsx`: `href="/notes"`, a page icon (a new 16 px glyph in
  `packages/ui/src/select/select-icons.tsx` or a sibling icons file, exported from `packages/ui`),
  visible text "Notes", `aria-current="page"` when active.

### 9.2 Component tree

```
NotesPage                                  apps/web/src/notes/notes-page.tsx      class gn-notes  data-testid=notes-page
├─ NotesHeader                             .gn-notes__header
│   ├─ NotesSearchBox                      input[type=search] aria-label="Search notes"  data-testid=notes-search
│   ├─ author filter (Select)              aria-label="Author"
│   └─ scope filter (Select)               aria-label="Scope"
├─ NotesTree                               .gn-notes__tree   (a <nav aria-label="Notes">; drawer below 960px)
│   ├─ title filter                        input aria-label="Filter by title"
│   ├─ Create button                       → CreateNoteDialog
│   ├─ per workspace: <section>            data-testid=notes-container-<workspaceId>
│   │   ├─ workspace-level notes (home '') sorted updated_at DESC
│   │   └─ per project: <section>          data-testid=notes-container-<projectId>
│   │       └─ NoteRow                     link to /notes/<id>; ticket keys as small text; aria-current when open
│   └─ Deleted group                       data-testid=notes-deleted (authors/admins/owner only) with Restore buttons
├─ NoteDocument (when a note is open)      .gn-notes__document   data-testid=note-document
│   ├─ Breadcrumb                          workspace / project / note
│   ├─ Title                               <h1 contenteditable> → note.renamed on blur/Enter   data-testid=note-title
│   ├─ Byline                              .gn-notes__byline
│   │   ├─ Avatar + author name + "edited N min ago"
│   │   ├─ ScopeChip                       button → ScopeEditor        data-testid=note-scope
│   │   ├─ NoteBadge per attached ticket   (§10.2) key, link to ticket, × detach
│   │   ├─ reading time
│   │   ├─ SaveIndicator                   data-testid=note-save-state  text: Saved | Saving… | Not saved (kept on this device)
│   │   └─ History button                  → HistoryPanel
│   ├─ EditorToolbar (editors only)
│   ├─ Editor (mode 'note'; readOnly for readers)   data-testid=note-editor
│   └─ CommentsThread                      reused from packages/app-core (comments-thread.tsx:171), fed by getNoteComments
└─ ReadingTOC (≥ 1280px only)              .gn-notes__toc
```

`NotesPage` gets the workspaces from the existing workspaces read, and for each workspace calls
`useLiveQuery(dataSource, workspaceId, 'notes', () => dataSource.getNotes(workspaceId))`
(`packages/app-core/src/views/use-live-query.ts:53`). Search results (§7.8) replace the tree's note
rows while the search box is non-empty.

### 9.3 CreateNoteDialog and ScopeEditor

- **CreateNoteDialog** (`Dialog` from `packages/ui`): Title input (required), Home select (options:
  each workspace as "<workspace> — workspace", each of its projects as "<workspace> / <project>";
  default per D3), Scope select (`private`, `workspace`, `project` (only when home is a project),
  `explicit` (shows a people picker — reuse the people list `VisibilityEditor` uses), and `inherit`
  **only** when the dialog was opened from a ticket, preselected). Create writes one `note.created` and
  navigates to `/notes/<id>`.
- **ScopeEditor**: a `Popover` with the same Scope select plus the people picker; `inherit` offered
  only when the note has ≥1 attachment. Writes `note.scope_set`. Do not reuse `VisibilityEditor`
  directly (its props are ticket-bound: `visibility-editor.tsx:129-133`); extract its people picker if
  it is separable, otherwise copy the picker only.

### 9.4 Autosave (D14)

In `NoteDocument`:

1. On every editor change: `onDraft(doc)` → write `localStorage["gn.note-draft.<userId>.<noteId>"] =
   JSON.stringify({ doc, at: Date.now() })` inside `try/catch`; set indicator to "Saving…"; reset a 2 s
   timer.
2. When the timer fires, on editor blur, on `beforeunload`, and on route change: if the draft differs
   from the last saved doc, submit `note.body_set { body }` through the data source; on success remove
   the draft key and set "Saved"; on failure keep the draft and set "Not saved (kept on this device)".
3. On open: if a draft exists for this user+note and its `at` is newer than the note's `updatedAt`,
   load the draft into the editor and set "Not saved (kept on this device)"; otherwise delete the key.
4. Offline: the data source's outbox already queues events; the indicator shows "Saving…" until the
   outbox confirms.

Rename (`note.renamed`) is written on title blur/Enter when the text changed and is non-empty.

### 9.5 History (D15)

`HistoryPanel` (`Sheet` from `packages/ui`, side): rows from `getNoteHistory`, newest first, each
"<relative time> · <author name>". Selecting a row: `getNoteVersion` → render read-only in place of the
editor with a banner "Viewing version from <time>" and buttons **Restore** and **Back**. Restore writes
`note.body_set { body: thatVersion }` and returns to editing. Back returns without writing.

### 9.6 Readers (non-authors)

`canEdit = isAuthor || isAdminReader || isOwner` computed on the client from the session user and
the workspace role (same inputs as §4.2). When `!canEdit`: editor `readOnly`, no toolbar, title not
editable, ScopeChip is static text, no History Restore (view only), Create still available (it creates
a different note). Readers may attach the note to tickets (from the ticket side, §10) and comment.

### 9.7 Required states (each a case)

| State | Behaviour |
|---|---|
| No notes anywhere | tree shows "No notes yet" and the Create button |
| Open note becomes unreadable (purge arrives) | navigate to `/notes`, toast "That note is no longer shared with you" |
| Open note deleted by someone else | banner "This note was deleted" with Restore if `canEdit`, else Back |
| Save fails offline | indicator "Not saved (kept on this device)", draft persists across reload |
| Search returns nothing | "No notes match" under the box; with `corrected`, "Showing results for …" |
| Wiki-link target unreadable | red pill, no navigation |

Styling, spacing and accessibility go through the `ui-ux-pro-max` skill on the token system in
`packages/ui/src/ui.css`. Every interactive element has an accessible name; the × is never the only way
to detach (the ScopeEditor/ticket page also can).

---

## 10. The ticket's Notes section

### 10.1 Placement

`packages/app-core/src/views/ticket-sheet.tsx`, Details tab. Insert a section **after** the
description block and **before** the "Comments · N" heading (the region documented around `:3521`).
Markup:

```
<section class="gn-ticket-sheet__notes" data-testid="ticket-notes">
  <h3>Notes · {n}</h3>
  <ul class="gn-ticket-sheet__note-badges">  one <li><NoteBadge …/></li> per readable attached note
  <button data-testid="attach-note">Attach note</button>   (only when canEditTicket)
</section>
```

Data: `useLiveQuery(dataSource, workspaceId, 'ticket-notes:'+ticketId, () =>
dataSource.getNotesForTicket(workspaceId, ticketId))`. `n` = the returned length (D5).

### 10.2 `NoteBadge` — new component in `packages/ui/src/components/note-badge.tsx`

```ts
export type NoteBadgeProps = {
  title: string;
  scopeMode: 'private' | 'workspace' | 'project' | 'inherit' | 'explicit';
  href: string;                 // /notes/<id>
  onDetach?: () => void;        // when absent, no × is rendered
};
```

Renders `<span class="gn-note-badge gn-note-badge--<scopeMode>"><a href={href} title={title}
class="gn-note-badge__title">{truncated title}</a>{onDetach && <button type="button"
class="gn-note-badge__remove" aria-label={`Detach ${title}`} onClick={onDetach}><RemoveIcon/></button>}</span>`.
`RemoveIcon` is exported from `packages/ui/src/index.ts:43` and is `aria-hidden`; the button's
`aria-label` is the accessible name. Truncate at 40 characters with an ellipsis; the full title is in
`title=`. Export `NoteBadge` from `packages/ui/src/index.ts`. Style in `ui.css` as a new block
`.gn-note-badge` (do not extend `.gn-chip`).

Detach: write `note.detached { ticketId }`, then show a `Toast` "Note detached" with an **Undo** action
that writes `note.attached { ticketId }`.

### 10.3 Attach picker (D12)

`AttachNotePicker` in `packages/app-core/src/views/attach-note-picker.tsx`, a `Popover` anchored to the
Attach button:

- Search input `aria-label="Find a note"`. Candidates = `getNotes(workspaceId)` minus already-attached
  ids, filtered client-side by title (case-insensitive `includes`), first 8. When the typed text is ≥ 3
  characters and the client filter has < 8 results, also call `searchNotes(workspaceId, text, { mode:
  'lexical' })` and merge by id.
- Last row always: **"New note: <typed text>"** (disabled when the text is empty).
- Choosing an existing note → `note.attached { ticketId }`; picker closes; badge appears via the live
  query.
- Choosing New note → one `note.created { title: text, homeProjectId: ticket.projectId, scope: {mode:
  'inherit'}, attachTicketId: ticketId }`, then navigate to `/notes/<newId>`.

---

## 11. Test cases (`test-cases/18-notes.md`)

Each row becomes a case with the next id in its task's block. "Mutation" is the change that must
turn the test red after the code is written.

### 11.1 Domain (`packages/domain/test/note-state.test.ts`)
| Case | Given / when / then | Mutation |
|---|---|---|
| created | `note.created` with body and `attachTicketId` → state has author, body, attached `[T]`, `scopeBeforeInherit null` | drop `attachTicketId` handling |
| detach rule, remembered scope | §3.4 example 1 → final scope `project` | return `private` unconditionally |
| detach rule, born in inherit | §3.4 example 2 → final scope `private` | keep `inherit` |
| explicit remembered with userIds | `explicit [A,B]` → `inherit` → last detach → `explicit [A,B]` (same ids) | drop `userIds` |
| detach not-last keeps scope | attached `[T1,T2]`, detach `T1` → still `inherit` | revert early |
| scope_set to non-inherit clears memory | `project` → `inherit` → `workspace` → `scopeBeforeInherit null` | keep memory |
| refusals | each refusal in §3.3 throws; a control valid event does not | remove one precondition |
| attach idempotent | attach `T1` twice → `[T1]` | push duplicate |
| moved refusal | `project` scope + `moved ''` throws | allow |
| plain text of new nodes | one test per node in §3.5, control: a paragraph | return '' for one node |
| fold | each example in §7.2 + control | skip step 3 |

### 11.2 Permissions (`apps/server/test/permissions/notes.test.ts`)
A table-driven test over every event × actor in {author, reader-member, non-reader-member, guest-listed,
admin-reader, admin-non-reader, owner}. Expected per §4.2. Mutation: flip one cell's expectation.

### 11.3 Reader predicate agreement (`apps/server/test/visibility/can-read-note.test.ts`)
Fixture: 5 notes (one per scope; the `inherit` one attached to a `project`-visible ticket and to an
`explicit` ticket), 7 users (author, owner, admin, member-in-project, member-outside, guest-listed,
guest-unlisted). For every (note, user): `canReadNote` result == whether `getNotes` returns it ==
whether the stream classifier yields its events. Mutation: change one arm of `visibleNotesWhere`.
Also: `getNotesForTicket` omits the unreadable note (D5); `getNote` returns 404 for an unreadable id and
for a random id, with identical response bodies.

### 11.4 Sync (`apps/server/test/visibility/notes-stream.test.ts`)
| Case | Then | Mutation |
|---|---|---|
| reach lost by scope_set | user's replica has no `notes` row, no `note_comments`, no `events` for the note | skip purge |
| reach lost by last detach of the only visible ticket | same | — |
| reach gained by scope_set | replica holds all note events including those before the change | skip backfill |
| reach gained by attach to a visible ticket | same | — |
| ticket cascade | `visibility.set` on T narrows; inherit note attached only to T is purged on device B and kept on device A | skip `notesAffectedByTicketChange` |
| restore | `note.restored` re-delivers to readers | — |

### 11.5 Projections and reads
Replay each new projection through `verify:projections` on a seeded ledger (green). `ticket_text`
changes after `ticket.field_set` of a title (mutation: ignore ticket events). History returns
`created` + every `body_set` in order; `getNoteVersion` returns that event's body.

### 11.6 Uploads
Upload against a note by a non-author reader → 403; download of a private note's attachment by a
non-reader → 404; by the author → 200.

### 11.7 Search (`apps/server/test/search/notes-search.test.ts`)
| Case | Then | Mutation |
|---|---|---|
| prefix | `"cold compr"` finds "compressor" note | drop `:*` |
| weights | title match ranks above body match for the same word | swap weights |
| correction | `"compresor"` (no hits) → corrected to `compressor`, hits returned, `corrected` set | skip §7.5 |
| no-leak | for each non-reader user: `notes` empty for a query that matches only a restricted note, in both modes; snippet absent | remove `visibleNotesWhere` from one query |
| staleness | after `body_set`, worker rebuilds chunks with `source_seq` = new seq; after changing `CURRENT_MODEL`, all chunks rebuilt | ignore model column |
| deleted | deleted note has no chunks and no search row | — |
| ordering (client hook test, `apps/web/test/use-notes-search.test.ts`) | lexical `[A,B]`, meaning `[B,C,A]` → displayed `[A,B,C]` | re-rank by distance |
| stale response | input changed before meaning result → result discarded | apply anyway |
| pre-flight | both extensions present in the test DB; role can create extensions | — |
| Garo | recall@5 for both modes recorded (🧪 until pairs exist) | — |
| targets | §7.9 numbers recorded | — |

### 11.8 Editor (`packages/editor/test/…`)
| Case | Then | Mutation |
|---|---|---|
| `< ` rule | typing `< Title` → `details(open) > summary("Title")` | change regex |
| `<div>` control | no details node | — |
| exit | Enter on empty last content paragraph leaves the block | — |
| toggle saved | toggling `open` changes `editor.getJSON()` | make toggle view-only |
| task item rule | `[ ] x` → taskItem unchecked | — |
| markdown paste | pasting `# H\n- a\n**b**` (no html) → heading, list, bold | disable rule |
| html paste control | pasting with `text/html` present is not converted | — |
| copy as markdown | round trip per §8.6 equals original | drop a node from serializer |
| wiki-link suggest | `[[co` lists notes whose title contains "co"; select inserts `wikiLink{noteId,title}` | — |
| wiki-link rename-following | `resolveNoteTitle` returns new title → rendered text updates | render stored title |
| wiki-link missing | `resolveNoteTitle` null → red pill, no `<a>` | render link |
| v1 doc under v2 | a stored v1 document renders identically | — |
| comment renderer | each new node renders; mutation: remove one case → test red | — |
| mobile bundle | `build:webview` succeeds and the generated file contains `details` | — |

### 11.9 Web
Tree renders containers and rows from `getNotes`; live update inserts a row without reload (mutation:
remove `useLiveQuery`); search replaces rows and clearing restores them; Create dialog defaults and
options per §9.3; autosave writes one `note.body_set` for five rapid changes (mutation: write per
change); draft restored after reload when newer; History view and Restore write; each §9.7 state;
`NotesNavLink` sits before `InboxNavLink`; ticket section: badges, `Attach note` hidden without
edit rights, picker attach, picker create-from-ticket writes one `note.created` with
`attachTicketId` and navigates, detach + Undo re-attaches, `NoteBadge` × has `aria-label="Detach
<title>"` and is a separate button from the link.

### 11.10 Browser (built stack, `apps/web/e2e-stack`)
1. Create a note from a ticket → it appears in the Notes page tree under the ticket's project with
   the ticket key.
2. Detach the last ticket → scope chip reads Private.
3. Two sessions: B can read an `inherit` note through ticket T; A sets T to `explicit` without B → B's
   open note page returns to `/notes` with the toast.
4. Seed a note "Compressor stopped in the cold room"; search "fridge broken" → after the pause the
   note appears in the meaning section.

---

## 12. Risks

| Risk | Handling |
|---|---|
| Ticket-visibility cascade (§5.2) misses a trigger | §11.4 cascade case; list every ticket event that changes `resolvedMode` in the helper |
| Filtered nearest-neighbour under-returns once HNSW exists | no HNSW in v1; exact scan; `LIMIT 200` then sort |
| Model memory on `professional-xs` (1 GB) | the pre-flight script logs RSS before and after `embed('warm-up')`; expected ≈150 MB |
| Extension rights on the managed DB | §7.1 pre-flight queries run against dev (54330) and production before the migration |
| Garo quality | measured (§7.10); help text follows the number |
| Ledger growth from full-document saves | 2 s coalescing; diffs not planned |
| Admin rights narrower than the brainstorm | §4.2; one-line change if the owner rules otherwise |
| `comment.added` registered for two kinds | §3.2: read `createEventTypeRegistry` first; if it cannot take two kinds, stop and report |

## 13. Follow-ups (not this release)

Inline anchored comments · nested notes (`parent_note_id` reserved) · desktop and mobile screens ·
Garo-tuned model (swap = change `CURRENT_MODEL`, the worker re-embeds) · backlinks · counts on cards
and rows · syntax highlighting · a local (replica) note search for offline.

---

## 14. Inline references in comments (`:ticket`, `:note`) — added 2026-09-23

### 14.1 What it is

Two suggestion triggers in the shared editor, modelled on the existing mention (`@`, `packages/editor/src/extensions/mention.ts`) and wiki-link (`[[`, `src/extensions/wiki-link.ts`) extensions:

| Typed | Picker searches | Inserts | Rendered as |
|---|---|---|---|
| `:ticket ` + query | tickets the person can see in the workspace (`DataSourceQuery.search`, current project's hits first) | inline atom node `ticketRef { ticketId, key, title }` | a chip `SHOP-7 Fix the freezer` linking to the ticket's page |
| `:note ` + query | notes the person can read (`getNotes`, title filter; `searchNotes` lexical behind it) | the existing `wikiLink { noteId, title }` node (no second note node) | as today: `<a href="/notes/<id>">title</a>`, red pill when unreadable |

The trigger is the literal string followed by a space; `startOfLine: false`; the default allowed prefix (a space or line start) means `re: ticket 5` in prose never opens the picker. Escape leaves the typed text. The picker is the same vanilla-DOM popup shape as the mention popup, listing up to 8 results with key + title (tickets) or title + home (notes).

### 14.2 The ticket reference node

`ticketRef` (inline, atom, selectable) with attrs `ticketId`, `key`, `title` (both strings are the values at insertion; the renderer shows the live title when it can resolve the ticket, else the stored one). HTML: `<a data-ticket-id data-ticket-key class="editor-ticketref" href="<ticket url>">KEY title</a>`. Plain text (`docToPlainText`): `KEY title`. Comment renderer (`renderCommentBody`): the same chip. Schema version stays 2 (an additive node; the v2 list grows by one and the pins move with it). The ticket URL is the one the board uses to open a ticket in its sheet (`/w/<workspaceId>/p/<projectId>?ticket=<ticketId>`); `projectId` comes from the search hit, so the node carries `projectId` too.

`DataSourceQuery.search`'s hits carry no key today (`SearchHit { ticketId, projectId, title, snippet, matchedIn }`); the server route gains `key` on each hit (it already assembles ticket cards) and the client mapper reads it.

### 14.3 The auto-attach rule (D27)

When a **ticket comment** is submitted (`comment.added` against a ticket) and its body contains `wikiLink` nodes, the submitting client also submits one `note.attached { ticketId }` against each distinct referenced note, **after** the comment's own event, in the same `ingest` batch where the outbox supports batches, else one after the other. `note.attached` is idempotent, so a note already attached costs nothing. Permission: the commenter can see the ticket (they are commenting on it) and read the note (they picked it from their own list), which is exactly what `checkNotePermission` requires for `note.attached`; a refusal (the note became unreadable between pick and post, or the ticket is no longer editable) leaves the comment posted and shows a toast "Couldn't attach <title>: <reason>". The rule lives in ONE function, `attachmentsImpliedBy(commentBody, ticketId): SubmittedEvent[]` in `packages/app-core`, called by the ticket sheet's comment submit; note comments and descriptions do not call it (D28). Removing the reference later never detaches.

The ticket's Notes section (spec §10) is a live query, so the badge appears without reload.

### 14.4 Mobile bridge

`ticketQuery` / `ticketResults` message pair beside `noteQuery` / `noteResults` (`src/webview/bridge.ts`), additive; the WebView bundle is regenerated in the plan's close.

### 14.5 Tests (block allocated by the plan)

Editor: each trigger opens its picker and inserts its node; `:ticket` mid-word and `re: ticket` do not; Escape leaves text; the ticket chip renders live/stored title; `docToPlainText` and `renderCommentBody` show `KEY title`; schema pins updated; bridge parses/serialises the new pair. App-core: `attachmentsImpliedBy` returns one `note.attached` per distinct note and none for a note comment or for a body without references; the ticket sheet submits comment then attachments; a refused attachment posts the comment and surfaces the toast. Server: `key` on search hits. Browser: post a ticket comment tagging a note → the note's badge appears in the ticket's Notes section without reload.
