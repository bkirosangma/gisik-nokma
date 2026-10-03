# Reference index and "Linked from" (Knowledge Graph spec B) — design

**Date:** 2026-10-03.

**Base:** `release/smoothness` @ `dce9ca61`.

**Target branch:** the next release branch (not cut yet).

**Status:** the owner approved the design in conversation on 2026-10-03 ("write the specs A to E"). This file is the written spec for review. The series table is in spec A.

**Owner's words:**
- The brainstorm listed "B reference index (`proj_references`, "Linked from")".
- Mockup v4's inspector shows "Linked from" with the quoted sentence.

**Assumptions** (correct them at review):
- Only STRUCTURED references count: the editor's ticket reference, note link and mention nodes. Bare text such as `GN-142` in a sentence is not parsed (§1).
- A comment's references belong to its ticket for the graph, with the comment shown as the source in "Linked from".

## 1. What exists today

**Bodies are ProseMirror JSON** (editor schema v2):
- note `docJson`;
- ticket `description` (`ticket.created` or `ticket.field_set` with `fieldId:'description'`);
- comment `body` (`commentAddedPayload`, `ticket-events.ts:211`).

Markdown exists only at the MCP door (`packages/editor/src/markdown-doc/`).

**Reference nodes:**
- `ticketRef {ticketId, projectId, key, title}` (`packages/editor/src/extensions/ticket-ref.ts:63`);
- `wikiLink {noteId, title}` (`wiki-link.ts:68`);
- `mention {userId}`.

In Markdown, only `[[KEY-12]]` becomes a `ticketRef` (`markdown-doc/refs.ts:10`). Bare keys stay text.

**Extraction:**
- `collectDocReferences` (`packages/domain/src/doc-text.ts:149`) already collects ticket and note references, but only purge uses it (`apps/server/src/purge/purged-lookup.ts:28`).
- `extractMentionedUserIds` (`packages/domain/src/doc-mentions.ts:25`) feeds mention notifications (`fanout.ts:166`, `:277`).

**Backlinks:** none. The only trace is a "not ported … backlink count" comment (`wiki-link.ts:276`).

## 2. The index

### 2.1 Projection `proj_references`

Migration `<next ts>_proj-references.sql`:

```sql
CREATE TABLE proj_references (
  workspace_id  text NOT NULL,
  source_kind   text NOT NULL CHECK (source_kind IN ('ticket','comment','note')),
  source_id     text NOT NULL,     -- ticket id, comment id, or note id
  source_ticket text,              -- for a comment: its ticket (the graph's endpoint)
  target_kind   text NOT NULL CHECK (target_kind IN ('ticket','note','person')),
  target_id     text NOT NULL,
  ordinal       int  NOT NULL,     -- nth reference in the source, for a stable order
  snippet       text NOT NULL,     -- ≤ 160 chars of the block around the reference, the reference marked [[…]]
  updated_by    text NOT NULL,
  updated_at    timestamptz NOT NULL,
  seq           bigint NOT NULL,
  PRIMARY KEY (source_kind, source_id, ordinal)
);
CREATE INDEX proj_references_target_idx ON proj_references (target_kind, target_id);
CREATE INDEX proj_references_ws_idx ON proj_references (workspace_id);
```

**The projection** is `apps/server/src/projections/references.ts`. It REPLACES all rows for a source whenever that source's body changes, on:
- `ticket.created` (description), and `ticket.field_set` with `fieldId:'description'`;
- comment added, edited and deleted (deleted removes the rows);
- `note.created`, `note.body_set`;
- ticket and note trash, restore and purge, following the same rule as spec A §2.5: trash keeps the rows and reads hide them; purge deletes them.

**Extraction** extends `collectDocReferences` to return mentions, the ordinal and the snippet, in one walk. `extractMentionedUserIds` keeps its own contract; the plan checks the two agree on mentions in a shared fixture.

**Snippet.** It is the plain text of the enclosing block (paragraph, list item, heading or table cell):
- trimmed to 160 characters around the reference;
- the reference's own text wrapped in `[[…]]` so the UI can mark it.

It is computed once at projection time, so reads never parse documents.

**Backfill.** A new projection is rebuilt from the ledger at deploy (`rebuildProjection`, `projections/rebuild.ts:12`). The plan measures the rebuild time on a copy of prod's ledger size before it ships.

### 2.2 Visibility

A "Linked from" row is shown only when the viewer can see the SOURCE:
- a ticket source uses `canSee`;
- a note source uses `canReadNoteById`;
- a comment source uses its ticket's `canSee`.

The viewer can always see the target, because they are looking at it. The snippet comes from the source, so this rule is what keeps hidden text from leaking. The control case has a viewer who can see the target but not the source, and gets no row and no count.

A mention of a person is shown on that person's node in the graph (spec C), under the same source rule.

### 2.3 Census

The new projection reads existing events only, so no new event types are added and the vocabulary census is unchanged. The projection's own switch is covered by a test that lists every body-changing event type (`description`, comment, note body) and asserts each one is handled.

## 3. App

### 3.1 "Linked from" on the ticket sheet and the note document

**Ticket sheet.** This is a section at the end of the Details tab, below spec A's Links section.

**Note document.** This goes in the document's side panel, desktop and phone.

**Each row:**
- the source's glyph (a ticket's status dot, the page icon for a note, the speech mark for a comment);
- the source's name ("GN-118 Phone pass", "Note: Phone pass rulings", "Comment on GN-160 by Ama Rangsa");
- the snippet, with the reference marked (`<mark>`).

A click opens the source. For a comment, it opens the ticket scrolled to the comment.

**Count and paging.** A count badge sits on the heading. Past 20 rows, a "Show all N" control loads the rest from the same endpoint, paged.

**Empty.** With no references, the section is absent (nothing to say).

### 3.2 Endpoint

`GET /v1/workspaces/:id/references?target=<kind>:<id>&cursor=` returns visible rows only, newest source first, with 20 per page.

## 4. MCP

- `get_ticket` and `get_note` gain `linkedFrom: { total, items:[{sourceKind, sourceId, title, snippet}] }`. The first 20 are visible only, and `total` counts visible rows only.
- There is no new tool. Spec D's `graph_neighbours` reads the same index.

## 5. Testing and proof

**Case block:** 27.100–27.179 (spec A §5.1).

1. **Extraction.** Each node type, nested in lists and tables, gives the right ordinal and snippet, and the snippet marks the reference. A bare `GN-142` in text yields nothing (the control).
2. **Projection.** Editing a body replaces its rows, never adding to them (the control edits the same body twice). A comment delete removes its rows. Trash, restore and purge behave as in §2.1. The rebuild equals the live table.
3. **Visibility.** There is no row and no count from a source the viewer can't see, and the control viewer sees both.
4. **Endpoint paging** at exactly 20 and 21 rows.
5. **App.** The section renders, a click opens the source (a comment scrolls into view), and the section is absent when there are no references.
6. **MCP.** `linkedFrom` matches the endpoint for the same viewer.

## 6. Files (expected)

- `packages/domain/src/doc-text.ts` (extended extraction).
- `apps/server/migrations/<ts>_proj-references.sql`, `apps/server/src/projections/references.ts`, `projections/index.ts`.
- A new `apps/server/src/routes/references.ts`.
- `packages/app-core/src/views/linked-from-section.tsx` (new), `ticket-sheet.tsx`, `apps/web/src/notes/note-document.tsx`.
- `packages/mcp-server/src/tools/ticket-tools.ts`, `note-tools.ts`.
- `Features.md` §24, `test-cases/27-knowledge-graph.md`.

## 7. Out of scope

- Parsing bare keys in text.
- References in ticket custom fields other than the description.
- References to projects or workspaces.
- An "unlinked mentions" finder.

## 8. Risks

- **Rebuild time on deploy** for a large ledger. This is measured first (§2.1).
- **Snippet leakage** through any read that skips §2.2. Every read goes through the one endpoint helper, which is tested by case 3.
