# MCP everything: Notes in the MCP, every missing action, Markdown bodies, comment edit and delete — design

**Status:** spec for owner review. Written 2026-10-02 by the planner. The design was approved in chat section by section: section 1 *"approach 1"*, section 2 *"looks good"*, section 3 *"looks right"*.
**Base:** `origin/release/prefix-groups-ux` at `63a9c26a`. Citations were read on that tree; the plan re-reads each one.
**Target branch:** `release/mcp-everything`. It is cut from `main` right after `release/prefix-groups-ux` merges (M-E7), runs alongside `release/neo-refresh`, and ships before `release/smoothness`.
**Builds on:**
- The hosted MCP server, shipped 2026-10-01.
- The MCP workspace/project CRUD release (`docs/superpowers/specs/2026-10-01-mcp-workspace-project-crud-design.md`).
- The notes series (§15 of `Features.md`).

Every tool here exists in BOTH doors (hosted `/mcp` and the local stdio server) through the shared tool list `allTools()` (`packages/mcp-server/src/tools/register.ts:17`).

## 1. The request

Owner, 2026-10-02, 14:1x IST:
- *"Need Notes controls to be added to the MCP. CRUD, Attach, Mentions, comments, Everything. New release. before the smoothness release."*
- Then: *"do a check of what major features/ actions the MCP is still missing"*. On the result: **"Notes + all gaps"**.
- Then, on the tool list: *"also lets add an edit comment. and delete comment. both notes and tickets."*

**The defect that prompted Markdown (owner screenshot, comment of 2 Oct 13:37 IST).**
- A comment Claude posted through `add_comment` showed its Markdown raw: `# Achri's Brief`, `### 1. …`, `- responding to …`.
- **Cause:** `add_comment` sends `{ body: plainTextToDoc(a.text) }` (`packages/mcp-server/src/tools/write-tools.ts:109`). `plainTextToDoc` (`packages/domain/src/events/contest-events.ts:163-167`) wraps the WHOLE text as ONE paragraph holding ONE text node. Nothing on the server parses Markdown.
- The only Markdown ⇄ editor converter is browser-only: `packages/editor/src/markdown/serializer.ts` uses `DOMParser`/`document` at `:73`, `:265` and `:304`.
- The tool's description ("Add a comment to a ticket, attributed to you.") never says the text is plain, so Claude wrote Markdown.

**Today (read):**
- **24 MCP tools:**
  - Reads `search_tickets`, `list_tickets`, `get_ticket`, `list_members` (`read-tools.ts:42,72,132,146`).
  - Ticket writes `create_ticket`, `transition_ticket`, `add_comment`, `assign_ticket` (`write-tools.ts:14,67,94,114`).
  - Eight workspace tools and eight project tools (`workspace-tools.ts`, `project-tools.ts`).
- **Every write is a domain event** submitted to `POST /v1/events` (`apps/server/src/routes/events.ts:85`), with `actorId` = the caller and `origin: 'mcp'` (`packages/mcp-server/src/tools/submit.ts:62-83`). The product's permission gate, rule engine and visibility rules therefore apply unchanged.
- **Notes have no MCP tool.** All note writes are events (`note.created`, `note.renamed`, `note.body_set`, `note.scope_set`, `note.moved`, `note.attached`, `note.detached`, `note.deleted`, `note.restored`: `packages/domain/src/events/note-events.ts`, registered at `vocabulary.ts:311-367`). Note comments are `comment.added` against kind `note` (`vocabulary.ts:266-280`).
- **`search_tickets` already returns notes.** `/v1/search` defaults `kinds` to ticket + note (`apps/server/src/routes/search.ts:140,186`). This is undocumented and untested on the MCP side.
- **No comment can be edited or deleted** anywhere in the product. There is no event for it. Ticket comments live in `proj_ticket_comments` (`apps/server/migrations/1790000000000_proj-ticket-comments.sql`) and note comments in `proj_note_comments` (`1790100000000_proj-notes.sql`).

## 2. Decisions (owner rulings, 2026-10-02)

| # | Decision |
|---|---|
| M-E1 | **Claude is a full write-partner on Notes.** It can do through the MCP whatever a member can do in the app: create, read, edit, rename, re-scope, move, attach to tickets, delete and restore notes, and read history. It can also read, add, edit and delete comments, and add and read attachments, with @mentions that notify people. |
| M-E2 | **Bodies are Markdown both ways.** Note bodies, ticket descriptions and comments (tickets and notes) are read as Markdown and written as Markdown. This fixes the raw-Markdown comment (§1). |
| M-E3 | **Scope: Notes + every gap** in the 2026-10-02 gap analysis (§4 lists the tools). Purge, passkeys, devices, MCP tokens and OAuth/device approval stay OUT. |
| M-E4 | **Admin and high-impact actions are allowed, behind a confirmation.** They need an exact `confirm_name` and return a plain preview (§5.1). This applies to member removal, role changes, invites, prefix changes, groups, workflow and ticket-type definition, ticket-type migration, visibility and workspace settings. The product's role rules still decide who may do each. |
| M-E5 | **Attachments go inline or as links.** An inline file is base64, at most **10 MB per call** (the product's own limit stays 25 MiB, `apps/server/src/routes/attachments.ts:22`). A link attachment uses the product's existing link attachment. Reads return text as text and images as images, up to 10 MB. **The server never fetches a URL Claude gives it.** |
| M-E6 | **Grouped tools.** There is one tool per object and verb family, about 30 new tools, not one per field. |
| M-E7 | **Release slot.** `release/mcp-everything` is cut from `main` right after `release/prefix-groups-ux` merges. It runs alongside `release/neo-refresh` and ships before `release/smoothness`, whose cut moves to after this release. |
| M-E8 | **Converter approach 1.** A pure-JavaScript Markdown ⇄ editor-document converter, built from the editor's own schema with `prosemirror-markdown`. The server gets **no DOM shim** (§3). |
| M-E9 | **Comment edit and delete, in the APP and the MCP, for ticket and note comments.** Only the author may edit. The author or a workspace admin/owner may delete. An edited comment shows "edited". A deleted one leaves "Comment deleted" in the thread, with the text gone from every view (the event log keeps it, as it keeps everything, and purge erases it with its parent). An edit notifies only the @mentions it ADDS (§6). |

## 3. The Markdown converter (M-E2, M-E8)

**Where:** a new module in `packages/editor` (or a new small package if `packages/editor` cannot be imported by the server without its React parts; the plan decides after reading `packages/editor/src/index.ts`).
- It exports `docToMarkdown(doc) → string` and `markdownToDoc(md, resolve) → { doc, problems }`.
- It builds the ProseMirror schema from the same extension list the editor uses (`packages/editor/src/schema/extensions.ts`) through Tiptap's `getSchema`, which needs no DOM.
- It uses `prosemirror-markdown` (markdown-it underneath) with custom token rules.

**Syntax for product-specific nodes:**

| Editor node | Markdown |
|---|---|
| `mention` (`extensions/mention.ts:154`) | `@[Display Name](user:<userId>)` |
| `ticketRef` (`extensions/ticket-ref.ts:63`) | `[[CCSO-4]]` (the ticket key) |
| `wikiLink` (`extensions/wiki-link.ts`) | `[[note:<note title or id>]]` |
| collapsible (`extensions/collapsible.ts`) | `<details><summary>Title</summary> … </details>` |
| task list, tables, code blocks, images, links, marks | GitHub-flavoured Markdown |

**Writing (`markdownToDoc`):**
- Every mention, ticket ref and note link is resolved through `resolve`: the members the caller can see, ticket keys and note titles in the workspace.
- An unresolvable token is a **refusal** that names it (`unknown mention @[Asha](user:…)`, `unknown ticket [[CCSO-99]]`). It never silently becomes plain text.
- A plain `@Asha` with no target is NOT a mention: Claude must use the full form. The tool descriptions say so and show the form.

**Reading (`docToMarkdown`):**
- Nodes Markdown cannot express (colour or highlight marks, image wrap settings, column widths) are dropped from the Markdown.
- Each read reply carries `lossy: [list of node/mark kinds]`, so Claude knows a whole-body replace would lose them.

**Edit modes (for notes and ticket descriptions):**
- `replace` the whole body. The reply lists anything dropped.
- `replace_section`: the content under one heading, up to the next heading of the same or a higher level.
- `append`: add to the end.
- Section and append edits splice into the stored document, so every node outside the section is kept byte-for-byte.

**Round-trip invariant (tested):**
- For every node and mark type the converter supports, `docToMarkdown(markdownToDoc(md))` returns `md` normalised.
- For every node type, `markdownToDoc(docToMarkdown(doc))` equals `doc` minus the declared lossy kinds.
- The owner's 13:37 comment text is a fixture: through `add_comment` it must store `heading` nodes and a `bulletList`.

**The browser copy-as-Markdown** (`serializer.ts`) is NOT replaced in this release. The plan adds a test that the two serializers agree on the shared node set, so they cannot drift silently.

## 4. Tools (M-E3, M-E6)

Every write goes to `POST /v1/events` with `origin: 'mcp'`, except attachment upload, which goes to `POST /v1/attachments` (`apps/server/src/routes/attachments.ts:325`). Every list takes `cursor` and `limit` (default 50, max 200). Every answer uses the product's refusal text unchanged. Not-found answers are uniform ("… not found or not visible to you").

**Notes**
- `list_notes(workspaceId, projectId?, authorId?|"me", scope?, include?: 'deleted')`: `GET /v1/workspaces/:id/notes` (`routes/notes.ts:59`).
- `get_note(noteId)`: the metadata plus the body as Markdown, `lossy`, the attached tickets and the attachment list (`notes.ts:79`).
- `create_note(workspaceId, title, markdown?, projectId?, scope?, explicitUserIds?, attachTicketId?)`: `note.created`. `scope: 'inherit'` requires `attachTicketId` (`note-events.ts:36-42`).
- `update_note(noteId, title?, markdown?, mode?: replace|replace_section|append, section?, scope?, explicitUserIds?, projectId?)`: emits `note.renamed` / `note.body_set` / `note.scope_set` / `note.moved` as needed, in one batch.
- `link_note(noteId, ticketId, action: attach|detach)`: `note.attached` / `note.detached`.
- `delete_note(noteId, confirm_name)` / `restore_note(noteId)`: `note.deleted` / `note.restored`. This is a soft delete (15-day window, as the app).
- `get_note_history(noteId, versionId?)`: the version list (`notes.ts:118`), or one version as Markdown (`notes.ts:190`).

**Comments (tickets and notes)**
- `list_comments(ticketId | noteId)`: `GET …/tickets/:id/comments` (`routes/tickets.ts:945`), `GET /v1/notes/:id/comments` (`notes.ts:99`). Bodies come back as Markdown. Each comment shows `edited` / `deleted`.
- `add_comment(ticketId | noteId, markdown)`: `comment.added`, Markdown via §3. The old `text` parameter is accepted as an alias for one release.
- `edit_comment(commentId, markdown)` / `delete_comment(commentId)`: the new events (§6).

**Attachments (tickets and notes)**
- `list_attachments(ticketId | noteId)` (`tickets.ts:856`; notes through `get_note`).
- `get_attachment(attachmentId)`: text/* as text, image/* as an MCP image, anything else as a metadata summary saying "open it in the app". The 10 MB cap applies (`GET /v1/attachments/:id`, `attachments.ts:613`).
- `add_attachment(ticketId | noteId, file?: {name, base64}, link?: {url, title})`: exactly one of `file` or `link`. The file goes in-process to `POST /v1/attachments`, which sniffs the type and enforces the limit. The link becomes the product's link attachment (`attachment.added`, `vocabulary.ts:287`).

**Tickets**
- `create_ticket` gains `markdown` (description), `priority`, `assigneeId|"me"`, `stateId`, `startDate`, `dueDate`. The event already accepts them (`packages/domain/src/events/ticket-events.ts:68-151`).
- `update_ticket(ticketId, title?, markdown?, mode?, section?, priority?, startDate?, dueDate?, fields?, parentId?, addCollaborators?, removeCollaborators?, workflowId?)`: emits `ticket.field_set` (`vocabulary.ts:183`), `ticket.reparented` (`:190`), collaborator events (`:169`, `:176`) and `ticket.workflow_rebound` (`:197`) as needed, in one batch.
- `close_ticket(ticketId, comment?)` / `reopen_ticket(ticketId, comment?)`: `ticket.closed` / `ticket.reopened` (`:210`, `:217`).
- `delete_ticket(ticketId, confirm_name)` / `restore_ticket(ticketId)`: `:252`, `:259`. Here `confirm_name` is the ticket KEY.
- `get_ticket_history(ticketId)`: `GET /v1/tickets/:id/history` (`apps/server/src/routes/ticket-history.ts:272`).
- `rank_ticket(ticketId, before?|after?)`: `ticket.ranked` (`:232`).

**Discovery**
- `list_ticket_types(workspaceId)` (`apps/server/src/routes/builder-reads.ts:757`).
- `list_workflows(workspaceId, workflowId?)`: the states and allowed transitions (`builder-reads.ts:708`, `:726`).

**Me**
- `my_work(workspaceId?)`: `GET /v1/me/work` (`routes/my-work.ts:592`).
- `get_attention(workspaceId)`: `GET /v1/workspaces/:id/attention` (`routes/attention.ts:411`).
- `list_notifications(unreadOnly?)` and `mark_notifications_read(ids? | all)` (`routes/notifications.ts:67`, `:141`, `:150`, `:191`).
- `list_my_invitations()` / `respond_to_invitation(inviteId, accept|decline)` (`routes/my-invitations.ts:184`, `:220`, `:262`).

**Admin (M-E4: `confirm_name` + preview, §5.1)**
- `manage_members(workspaceId, action: invite|revoke_invite|change_role|remove|add_to_project|remove_from_project, …)`. The routes and events are `invites.ts:435`, `:792`, `vocabulary.ts:622`, `members.ts:95` and `:402`, `:409`, `:416`, `:423`.
- `change_prefix(workspaceId | projectId, prefix, confirm_name)`: `workspace.prefix_changed` (`:105`) / `project.updated.prefix`. The preview counts the ticket keys that change.
- `manage_groups(workspaceId, action: create|rename|reorder|delete|file_project, …)`: `:463`, `:469`, `:475`, `:481` and `project.updated.groupId`. `list_groups` is a read inside it (`routes/groups.ts:31`).
- `define_workflow(workspaceId, …)`: `workflow.defined` (`:112`).
- `define_ticket_type(workspaceId, …)`: `ticket-type.defined` (`:141`).
- `migrate_ticket_type(…)`: `builder-reads.ts:992`. The preview counts the tickets that move.
- `set_visibility(ticketId, userIds | 'default')`: `visibility.set` (`:547`).
- `update_workspace_settings(workspaceId, staleDays?, dueSoonDays?, autoCloseAfterDays?)`: `workspace.settings_set` (`:642`).

**Trash**
- `list_deleted(workspaceId?)`: tickets, notes, projects and workspaces (`GET /v1/me/deleted-items`, `apps/server/src/read/deleted-items.ts`).

**Search**
- `search(workspaceId, query, kinds?: ticket|note, mode?: lexical|meaning, cursor?)` replaces `search_tickets`. `search_tickets` stays as an alias that returns the same reply, for one release.

**Text fixes**
- `create_project` / `update_project` lose the stale "prefix cannot be changed" text (`project-tools.ts:131`, `:166`).
- `update_project` gains `groupId`.

## 5. Behaviour details

### 5.1 Confirmation for admin and destructive tools (M-E4)
- A call without `confirm_name`, or with a wrong one, changes NOTHING. It returns a **preview**: one plain sentence of what would change, the counts it affects (ticket keys renamed, tickets migrated, people removed from projects), and `confirm_name must be "<exact current name>"`.
- The name is compared exactly against the name read at call time, as `directory.ts:41-43` does today.
- The preview is a successful answer, not an error. Claude can show it to the member before acting.
- Restore and undelete tools need no confirmation. The existing workspace/project tools keep their current behaviour.

### 5.2 Attachments (M-E5)
- The base64 payload is decoded in the tool. A file over 10 MB is refused before upload, naming the limit.
- The upload then goes in-process to `POST /v1/attachments`, so byte-sniffing, the 25 MiB stream limit and the note/ticket permission checks (`attachments.ts:376-388`, `:446-466`) apply unchanged.
- `get_attachment` never returns more than 10 MB. A larger file answers with its metadata and "open it in the app".

### 5.3 Errors
- Rule refusals and invalid events are passed on word for word, as today (`submit.ts:20-56`).
- Converter problems are refusals naming the bad token (§3).
- A lossy whole-body replace is NOT refused. Its answer lists what was dropped.

### 5.4 Mentions
- Mentions in a note body or comment notify through the existing fan-out (`apps/server/src/notifications/fanout.ts:246`, `:340-349`): only newly added mentions, and only people who can read the note or ticket.
- This now works from the MCP because the body carries real `mention` nodes.

## 6. Comment edit and delete (M-E9): a product feature

**Events (new, two-kind like `comment.added`):**
- `comment.edited{commentId, body}` and `comment.deleted{commentId}`, against kind `ticket` or `note`.
- **Permission:**
  - `edited`: the comment's author only, and only while the author can still read the parent.
  - `deleted`: the author, or the workspace owner/admin.
  - A deleted comment cannot be edited.
  - These sit in the same permission module as today's comment rules (`apps/server/src/permissions/check-permission.ts`).
- **Projections:** `proj_ticket_comments` / `proj_note_comments` gain `edited_at`, `edited_by`, `deleted_at` and `deleted_by`. A deleted row keeps its id and author for the "Comment deleted" placeholder. Its body is cleared in the projection, and the event log keeps it as for every event.
- **Purge** erases comment edit and delete events with their parent ticket or note, as it does `comment.added`. The plan reads `apps/server/src/purge/erasure.ts` and adds them.
- **Mentions on edit:** the fan-out diffs the new body against the previous body (the same rule `note.body_set` uses) and notifies only ADDED mentions.
- **History:** a ticket's and a note's history show "edited a comment" / "deleted a comment" lines.
- **Search:** note-comment text in the note search index (`proj_note_search`, weight C) is re-indexed on edit and removed on delete. The plan confirms which comment text feeds which index.

**App UI (tickets and notes alike):**
- Each comment the viewer may act on gets an overflow ("…") with **Edit** (author) and **Delete** (author or admin).
- Edit opens the same editor in place with Save and Cancel. Delete asks once ("Delete this comment? It is removed for everyone."), then shows "Comment deleted" with the author and time.
- An edited comment shows "edited" beside its time, with the edit time on hover/long-press.
- Offline: the app queues edit/delete like other writes. The plan reads the outbox (`packages/app-core`) and follows its pattern.
- `frontend-design` applies to this UI.

## 7. Security
- No new route. Tools reach the existing routes through the same in-process session (`apps/server/src/mcp/in-process-fetch.ts:41`) or the stdio HTTP client.
- No token scopes are added. A token is its user (`apps/server/src/auth/require-session.ts:126-134`).
- The server never fetches caller-supplied URLs (M-E5).
- Admin tools are only as strong as the product's role checks, which the plan verifies per tool with a guest, member, admin and owner matrix test.
- Base64 decoding is bounded before allocation: the string length is checked against the 10 MB limit.

## 8. Testing
- **Converter (package tests):** the round-trip invariant for every node and mark; refusal of every unresolvable token; section splice keeps outside nodes byte-identical; the owner's 13:37 comment fixture; agreement with the browser serializer on the shared node set.
- **Each tool (server tests through the hosted door, `app.inject`):** the event written (type, payload, `origin: 'mcp'`), the refusal text for a forbidden caller, and the uniform not-found.
- **Each admin tool:** a refused-preview test (nothing written) and a confirmed test.
- **Comment edit/delete:** domain permission matrix (author, other member, admin, owner, guest); projections; mention diff; purge; app UI tests (Edit, Delete, "edited", "Comment deleted") in web and app-core.
- **Pinned tool order:** `packages/mcp-server/test/register.test.ts:28` gets the new list.
- **Real client (before release, production behind the existing switch):** a claude.ai session posts a Markdown note with an @mention (it renders and notifies), edits and deletes a comment, and attaches a small image.
- **Catalogue:**
  - MCP cases continue in `test-cases/14-mcp-server.md` from **14.360** (14.360–14.599 reserved).
  - The converter and comment edit/delete get a new bucket, **`test-cases/26-comments-and-markdown.md`** (26.001+). 24 is neo, 25 is smoothness.
  - `Features.md` gets §14 MCP bullets and a new **§23 "Comment edit and delete, Markdown bodies"**. §21 is neo and §22 is smoothness.

## 9. Out of scope
- Permanent purge from the MCP. Passkeys, devices, MCP tokens/connections, OAuth/device approval.
- Replacing the browser copy-as-Markdown serializer (§3: agreement test only).
- Threaded comments, reactions and comment resolve (not in the product).
- Server-side URL fetch for attachments (M-E5).
- Saved views (the preferences route is not mounted, `Features.md` marks it ⚙️).
- Ledger export.
