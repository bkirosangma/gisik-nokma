# MCP everything: Notes in the MCP, every missing action, Markdown bodies, comment edit and delete — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the MCP a full write-partner (notes, comments, attachments, every ticket act, discovery, "me", admin behind a confirmation, trash, search), make every body Markdown both ways through one pure converter, and add comment edit and delete to the product (app and MCP, tickets and notes).

**Architecture:** Three roots run in parallel: a DOM-free Markdown ⇄ editor-document converter exported from `packages/editor` on its own subpath (T1); two new ledger events `comment.edited` / `comment.deleted` with their permission, projection columns, mention diff, search re-derivation and read fields (T2); and the MCP plumbing every new tool needs (byte reads, multipart upload, image replies, a larger `/mcp` body, the non-throwing preview helper, and conflict-free tool registration blocks) (T3). The app UI and the offline replica follow T2; the MCP tool modules follow T1/T3, one module per lane, each filling a registration block T3 laid down, so no two lanes edit the same lines.

**Tech Stack:** TypeScript, zod, Fastify, Postgres projections, `@tiptap/core` `getSchema`, `prosemirror-markdown@1.13.8` over `markdown-it@15.0.2`, React (Next.js app router), `@modelcontextprotocol/sdk@1.30.0`, Vitest, better-sqlite3 (replica).

**Spec:** `docs/superpowers/specs/2026-10-02-mcp-everything-design.md` (owner-approved 2026-10-02, rulings M-E1..M-E9). Where this plan's corrections (below) differ from the spec, this plan wins; each one is listed.

## Global Constraints

- Branch work off `origin/release/mcp-everything` (cut from `origin/main` right after `release/prefix-groups-ux` merges, M-E7); each task is ONE lane branch `task/mcp-e-<n>-<slug>` and ONE PR `--base release/mcp-everything`; never commit or push to `main` (a push to `main` deploys, `deploy/do/app.yaml:50`).
- Node 22 for every install and run (`node --version` prints `v22.*`; root `package.json:6` pins `>=22.0.0 <23`).
- Never pipe a test or build run into `head` or `grep -m`. Every run in this plan writes a log (`> /tmp/mcpe-<task>.log 2>&1`) and reads it with `tail -N`.
- Every MCP write carries `origin: 'mcp'` and `actorId` = the session user (`packages/mcp-server/src/tools/submit.ts:62-83`); every write goes to `POST /v1/events` except the attachment bytes (`POST /v1/attachments`, `apps/server/src/routes/attachments.ts:325`) and the REST doors the app itself uses (invites, member removal, invitation answers, notification marks, ticket-type migration).
- Every tool exists in BOTH doors through `allTools()` (`packages/mcp-server/src/tools/register.ts:17`). No hosted-only and no stdio-only tool.
- Refusals are passed through VERBATIM (`refused by <rule>: <reason>` / `<code>: <message>`, `submit.ts:20-56`). Not-found answers are uniform: `<thing> not found or not visible to you` (every read of a parent goes through T3's `readOrNotFound`). Every list tool takes `cursor` and `limit` (default 50, max 200; `list_notifications` max 100, the server's own cap) through T3's `page`/`pageField`. Every tool is driven through the HOSTED door by a stranger, a forbidden member and the allowed caller (T3's `runDoorMatrix`, one table per task).
- Bodies are Markdown both ways (M-E2). A mention is `@[Display Name](user:<userId>)`, a ticket ref `[[KEY-12]]`, a note link `[[note:<title or id>]]`, an image `![alt](attachment:<attachmentId>)` on a line of its own, a collapsible `<details>` / `<summary>…</summary>` / `</details>` each on its own line. An unresolvable mention, ticket or note is a REFUSAL naming the token; nothing silently becomes plain text.
- The server never fetches a URL the caller gives it (M-E5). Inline files are base64, at most **10 MiB decoded = 10,485,760 bytes** per call; the base64 string is length-checked (`≤ 13,981,016` characters) BEFORE it is decoded. `get_attachment` never returns more than 10,485,760 bytes.
- Admin and high-impact tools (M-E4) change NOTHING without an exact `confirm_name`; without it, or with a wrong one, they answer a successful PREVIEW (`{ preview: true, … }`), never an error. Comparison is exact: case, spaces, trailing spaces. The existing workspace/project tools keep their throwing `confirmName` unchanged.
- OUT of scope (M-E3, spec §9): permanent purge, passkeys, devices, MCP tokens/connections, OAuth/device approval, threaded comments/reactions/resolve, server-side URL fetch, saved views, ledger export, replacing the browser copy-as-Markdown serializer.
- Comment edit: author only, while the author can still read the parent. Comment delete: author, or workspace owner/admin. A deleted comment cannot be edited or deleted again. An edit notifies only ADDED mentions, and only people who can read the parent (M-E9).
- `Features.md` and `test-cases/` change in the SAME commit as the code they describe. Flip a case ✅ only in the commit that adds its test; every ✅ id appears literally in a test file (`pnpm check:citations`).
- Case-id blocks (measured 2026-10-02 on `63a9c26a`: `test-cases/14-mcp-server.md` highest `14.359`; no `26.*` id exists anywhere): **MCP `14.360–14.599`** — T3 `14.360–14.379`, T6 `14.380–14.399`, T7 `14.400–14.429`, T8 `14.430–14.449`, T9 `14.450–14.479`, T10 `14.480–14.499`, T11 `14.500–14.529`, T12 `14.530–14.549`, T13 `14.550–14.569`, T14 `14.570–14.579`, spare `14.580–14.599`. **Comments and Markdown `26.001–26.999`** (new file `test-cases/26-comments-and-markdown.md`, 3-digit padded) — T1 `26.001–26.039`, T2 `26.040–26.089`, T4 `26.090–26.109`, T5 `26.110–26.149`. Unused ids stay free for that task's follow-ups; never renumber.
- `Features.md`: MCP bullets go in §14 ("MCP server", line 3380 at base); comment edit/delete and the converter go in a NEW **§23 "Comment edit and delete, Markdown bodies"** at the end of the file (§21 is neo, §22 is smoothness, both on other release branches; §23 is created by T0 even though §21–§22 may not be on `main` yet).
- Migration: `apps/server/migrations/1791300000000_comment-edit-delete.sql`. `release/neo-refresh` also ends at `1791200000000_groups.sql` and runs alongside, so the lane runs `pnpm check:migrations` against `origin/main` AND lists `git ls-tree --name-only origin/release/neo-refresh apps/server/migrations/ | tail -1` before merging; if anything at or above `1791300000000` exists there, rename to the next free `17914…` and say so in the PR.

## Review Focus

1. **A Markdown body that contains a literal `[[` that is not a ref** (`[[draft]]`, `[[ ccso-4 ]]`, `` `[[CCSO-4]]` `` in a code span, a fenced block containing `[[note:x]]`) — must store as literal text/code, never refuse and never become a chip. Pinned by **26.006** in T1.
2. **An `@mention` of someone who cannot read the note** (a member outside an explicit-scope note) — the comment/edit/body commits, the mention node is stored, and NO notification row is written for that person, while a reader mentioned in the same body is notified. Pinned by **26.058** in T2 (edit path) and **14.404** in T7 (note body through the MCP).
3. **A base64 string of 10 MiB + 1 byte decoded** (and one whose string length alone exceeds 13,981,016) — refused before upload naming "10 MB", with no `POST /v1/attachments` call and no allocation of the decoded buffer for the over-long string; exactly 10,485,760 bytes is accepted. Pinned by **14.432** (unit) and **14.438** (the hosted path end to end) in T8.
4. **Editing a comment whose parent was deleted** (a soft-deleted ticket; a soft-deleted note) — refused (`deleted-ticket` "This ticket is deleted; restore it first." / `permission.comment` "This note is deleted; restore it first."), nothing written; restoring the parent makes the same edit commit. Pinned by **26.052** in T2.
5. **`confirm_name` with a trailing space** (`"Corner Shop "` for `Corner Shop`) — answers a successful preview naming `confirm_name must be "Corner Shop"` and sends no event; the exact name commits. Pinned by **14.362** in T3 (helper) and **14.502** in T11 (a real admin tool).

---

## Spec corrections (this plan wins)

- **SC1 — `serializer.ts`'s DOM uses are `:74` and `:310`, not `:73`/`:265`/`:304`.** `htmlToMarkdown` is declared at `:73` and calls `new DOMParser()` at `:74`; `exportMarkdown` is declared at `:304` and calls `document.createElement` at `:310`. `markdownToHtml` (`:265`) is DOM-free (markdown-it only). Conclusion unchanged: the browser serializer cannot run on the server.
- **SC2 — the collapsible block is the `details` / `detailsSummary` / `detailsContent` nodes of `@tiptap/extension-details`**, configured at `packages/editor/src/schema/extensions.ts:267-280`; `extensions/collapsible.ts` is an `Extension` (input rule + keymap) that registers no node.
- **SC3 — schema v2 has NO colour or highlight marks.** The closed vocabulary is pinned at `packages/editor/test/schema.test.ts:26-59`: marks `bold`, `italic`, `strike`, `code`, `link`. The converter's lossy kinds are therefore `image.wrap` (an image not wrapped `block`), `table.span` (colspan/rowspan > 1), `table.colwidth`, `table.header` (a first row that is not header cells), `table.cell-blocks` (a cell holding more than one paragraph), `details.open` is NOT lossy (written as `<details open>`).
- **SC4 — `docToMarkdown` returns `{ markdown, lossy }`, not a bare string**, so every read can carry `lossy` without a second walk.
- **SC5 — note comments are NOT in any search index.** `proj_note_search` skips `comment.added` (`apps/server/src/projections/note-search.ts:135`); only TICKET comment text is indexed, in `proj_search.comments` (`apps/server/src/projections/search.ts:124-138`). T2 re-derives `proj_search.comments` on edit/delete; nothing to do for notes.
- **SC6 — purge needs no code change.** The ledger half deletes every event of an erased entity (`apps/server/migrations/1790600000000_purge-engine.sql:91-95`, `entity_kind`/`entity_id` match, any type), and the comment projections are erased by parent (`apps/server/src/purge/erasure.ts:82`, `:88`). `comment.edited`/`comment.deleted` are filed against the parent, so they go with it. T2 adds the test, not code.
- **SC7 — the attachment upload appends NOTHING to the ledger.** `POST /v1/attachments` stores bytes and answers the sniffed truth; the client then submits `attachment.added` itself (`attachments.ts:229-238`, `packages/editor/src/upload.ts:26-31`). `add_attachment` therefore uploads, then submits `attachment.added { kind: 'upload', … }` built from the answer.
- **SC8 — `attachment.added` is TICKET-only** (`packages/domain/src/vocabulary.ts:286-291`, `entityKind: 'ticket'`), there is NO note attachment list route, and no app surface uploads to a note (`uploadNoteAttachmentHttp` is exported at `packages/editor/src/index.ts:58` and called nowhere). A note's files are the images its own body embeds. So `list_attachments({noteId})` lists the body's image ids, and `add_attachment({noteId})` takes images only and appends an image node to the body (owner question Q2).
- **SC9 — there is no generic link attachment.** The only link kind is a Google Drive reference (`ticket-events.ts:234-255`), which requires a Drive `mimeType` and `capturedAt` the server can only learn by fetching. `add_attachment` therefore takes `file` only; links go in Markdown (owner question Q1).
- **SC10 — `/v1/search` has no cursor** (`apps/server/src/routes/search.ts:400-408`: `workspaceId`, `q`, `filter`, `kinds`, `mode`, `author`, `scope`). `search` drops the spec's `cursor`.
- **SC11 — `/v1/me/work` REQUIRES `workspaceId`** (`apps/server/src/routes/my-work.ts:598-600` answers 400 without it). `my_work(workspaceId)` is required.
- **SC12 — `set_visibility` takes a MODE**: `workspace | project | explicit | inherit` (`packages/domain/src/events/visibility.ts:18`), with `userIds` only for `explicit`. There is no `'default'` mode.
- **SC13 — `invites.ts:792` is the invitation LIST**, not revoke. Revoking is the `invite.revoked { inviteId }` event (`vocabulary.ts:622`, payload `events/invites.ts:143`) against the invite entity. Inviting is `POST /v1/workspaces/:id/invites` `{ address, channel: 'email'|'phone', role: 'admin'|'member'|'guest', projectIds? }` (`invites.ts:434-455`). A role change is `membership.granted { userId, role }` (`events/membership.ts:189-191`), as the Members screen does (`apps/web/app/w/[workspaceId]/members/page.tsx:410`).
- **SC14 — `noteCreatedPayload` is at `note-events.ts:72-85`** (the `inherit` refine is `:80-83`), not `:36-42`; `ticketCreatedPayload` starts at `ticket-events.ts:42`. `plainTextToDoc` is `contest-events.ts:163-168`.
- **SC15 — the notes list route has no paging.** `list_notes` pages the route's answer itself (an opaque offset cursor), `limit` default 50, max 200.
- **SC16 — "history lines" exist for TICKETS only.** A ticket's History tab narrates each ledger event (`packages/app-core/src/views/history-copy.ts:187`, "Comment added"); a note's history is its body VERSIONS only (`apps/server/src/read/notes.ts:320-338`). T5 adds "Comment edited" / "Comment deleted" to the ticket History; a note's thread shows "edited"/"Comment deleted" in place (owner question Q3).
- **SC17 — the stale prefix text is at `project-tools.ts:132` and `:167`** (`create_project`'s "The prefix cannot be changed later", `update_project`'s "fixed when the project is created and cannot be changed").
- **SC18 — the fan-out's comment branch is `fanout.ts:337-341`**, and note mentions already diff (`handleNoteMentions`, `:246-280`); TICKET mentions do not (`handleMentions`, `:154-205`, every mention every time). T2 gives `handleMentions` the same `previous` argument for `comment.edited`, leaving description behaviour unchanged.
- **SC19 — four test files pin the tool list, not one**: `packages/mcp-server/test/register.test.ts:27-52`, `packages/mcp-server/test/exports.test.ts:24-49`, `apps/server/test/mcp/mcp-http.test.ts:169-194` (14.262), `apps/server/test/mcp/mcp-remote-e2e.test.ts:104-112`. T3 moves the literal to one per-module fixture and makes the two server tests assert "hosted lists exactly what `allTools` lists".
- **SC20 — the hosted `/mcp` POST is bounded by Fastify's default 1 MiB body** (no `bodyLimit` anywhere but the multipart comment at `attachments.ts:264-265`; `routes/mcp-http.ts:43`). A 10 MiB file is ~13.4 MB of JSON, so T3 sets `bodyLimit: 16 MiB` on `POST /mcp` only.
- **SC21 — the in-process door is text-only today**: `inProcessFetch` forwards only a string body (`apps/server/src/mcp/in-process-fetch.ts:26`) and rebuilds the response from `res.body` (`:33`, a UTF-8 string), and the HTTP client reads every answer with `response.text()` (`packages/mcp-server/src/http-client.ts:26-34`). Binary in both directions is T3's.
- **SC22 — the comment tools take the PARENT too.** The spec writes `edit_comment(commentId, markdown)` / `delete_comment(commentId)`; the events are filed against the comment's ticket or note (T2), and no route maps a comment id to its parent, so both tools (and `list_comments`, `add_comment`, `list_attachments`, `add_attachment`) take `workspaceId` + exactly one of `ticketId` / `noteId`. A wrong parent is refused "That comment is not on this ticket or note." (26.046).
- **SC23 — `list_notifications` pages at most 100**, the route's own cap (`apps/server/src/routes/notifications.ts:51`, `MAX_LIMIT = 100`, refused with 400 above it), not the spec's 200.
- **SC24 — the real-client check runs right AFTER the release merge, not before** (spec §8 "before release"). claude.ai cannot reach a dev stack (the hosted door is reached by public URL, `MCP_PUBLIC_URL`), and a merge to `main` IS the release. T14 runs the check in production immediately after the owner's merge, in a throwaway project; a failure becomes a defect on the next release (owner question Q6).

## Verified assumptions

| Assumption (spec) | Verdict | Evidence |
|---|---|---|
| Link attachments exist as a product feature (Drive link via `attachment.added`) | **WRONG** (partly) | Only a Google Drive reference exists (`ticket-events.ts:234-255`), ticket-only, and it needs `driveFileId`, `mimeType`, `webViewLink`, `capturedAt` — Drive observations the server cannot make without fetching. No generic URL attachment. See SC9 / Q1. |
| Comment ids exist and are addressable per comment in both projections | **CONFIRMED** | `comment_id` IS the `comment.added` event id in `proj_ticket_comments` (`migrations/1790000000000_proj-ticket-comments.sql`, PK + COMMENT) and `proj_note_comments` (`1790100000000_proj-notes.sql:78-95`); both reads serve `commentId` (`read/ticket-comments.ts:127`, `read/notes.ts:299`). |
| `ticket.field_set` covers title/description/priority/dates/custom fields | **CONFIRMED** | `checkTicketFieldSet` (`packages/rule-engine/src/checks/fields.ts:123-174`): `title` (non-blank string), `description` (document or null), `dueDate`/`startDate` (`{date: 'YYYY-MM-DD', note?}` or null), `priority` (`P1`/`P2`/`P3`, never null), else a custom field of the ticket's type (text/number/date/select/person). |
| `ticket.closed` / `ticket.reopened` are separate events | **CONFIRMED** | `vocabulary.ts:210`, `:217`; empty strict payloads `ticket-events.ts:276-278`. |
| The in-process session can POST multipart to `/v1/attachments` | **WRONG** (today) | `inProcessFetch` passes only string bodies and stringifies replies (`in-process-fetch.ts:26`, `:33`); `GisikClient` has JSON `get`/`post` only (`http-client.ts:21-24`). T3 adds `postMultipart` + `getBytes` and binary passthrough. |
| `my-invitations` accept/decline accept token callers | **CONFIRMED** | Both use `requireSession` alone (`routes/my-invitations.ts:220-222`, `:262-264`), which falls back to a bearer token (`auth/require-session.ts:126-134`); only devices/passkeys add `sessionOnly` (`routes/me-devices.ts:40`, `me-passkeys.ts:18`). Accept answers `{ workspaceId }`, decline `204`. |
| Migrate route path | **CONFIRMED** | `POST /v1/workspaces/:workspaceId/ticket-types/:typeId/migrate` (`builder-reads.ts:992`), body `{ fromWorkflowId, toWorkflowId, stateMap }` strict (`:626-632`), admin-only 404 door, answers `{ status: 'migrated', count }` (`:1220`). Preview count: `GET …/ticket-types/:typeId/population?workflowId=` (`:846`, admin-only). |
| Notifications mark-read routes | **CONFIRMED** (no "all") | `POST /v1/me/notifications/:id/read` → 204 (`notifications.ts:149-158`); `POST /v1/me/notifications/read` `{ ids: string[1..100], read: boolean }` → `{ changed }` (`:190-212`). There is no mark-all route; `mark_notifications_read({ all: true })` pages unread ids (≤ 10 pages of 100) and posts them in chunks of 100. |
| How the stdio door would upload (http-client multipart) | **WRONG** (today) | `createGisikClient` sends `JSON.stringify(body)` with `content-type: application/json` only (`http-client.ts:36-48`). T3 adds `postMultipart` that builds a `multipart/form-data` body (owner field first, then `file`, as `upload.ts:86-88` does) over the same `fetch`, so the stdio door and the hosted in-process door share one encoder. |
| `packages/mcp-server` can import the editor's schema without React/DOM | **CONFIRMED with a subpath** | The barrel `packages/editor/src/index.ts` re-exports React components (`:64-116`), so the server must NOT import the package root. `schema/extensions.ts` and every extension it imports use `@tiptap/core`/`@tiptap/pm` and touch `document` only inside functions (`extensions/*-popup.ts`), and `exportMarkdown` already calls `getSchema(buildEditorExtensions())` (`serializer.ts:307`). T1 exports the converter as `@gisik-nokma/editor/markdown-doc` and proves it under `// @vitest-environment node` and in the `pnpm deploy --prod` output. |
| `prosemirror-markdown` / `markdown-it` already deps | **markdown-it CONFIRMED, prosemirror-markdown WRONG** | `packages/editor/package.json` has `"markdown-it": "^15"` (lock `markdown-it@15.0.2`, `pnpm-lock.yaml:4631`) and `@types/markdown-it@14.2.0`; `prosemirror-markdown` is absent from `pnpm-lock.yaml`. Add **`"prosemirror-markdown": "1.13.8"`** (exact; `npm view` 2026-10-02: latest 1.13.8, deps `markdown-it ^14.0.0`, `prosemirror-model ^1.25.0`, `@types/markdown-it ^14.0.0`). It will bring its own `markdown-it@14`; the converter passes the editor's `markdown-it@15` instance into `MarkdownParser`, and the lane asserts ONE `prosemirror-model` (1.25.11) in the lock. |

## Owner questions (the plan proceeds on the recommended default; the task named changes if the ruling differs)

- **Q1 — Link attachments.** Only Drive references exist and they need a fetched mime. **Recommend: no link attachments through the MCP; Claude writes Markdown links in comments, descriptions and notes.** If the owner wants Drive links: T8 adds `link: { driveFileId, name, mimeType, webViewLink }` and the tool records what Claude asserts with `capturedAt` = now, which records an observation the product did not make.
- **Q2 — Note attachments.** **Recommend: images only for notes, appended to the note body (`note.body_set`), non-images refused before upload by extension and after upload by the sniffed mime** (an orphaned object is the documented harmless residue, `attachments.ts:232-235`). If the owner wants any file on a note: a note attachment list (route + event) is new product, out of this release.
- **Q3 — "Edited/deleted a comment" history lines.** **Recommend: ticket History only (notes have no activity history); a note's thread marks edits and deletions in place.**
- **Q4 — Where deleted comment text survives.** The thread, `list_comments`, `proj_search`, the offline replica's thread and offline search all lose it (T2, T4, T6). It REMAINS in (a) mention notification excerpts already delivered (the fan-out's "a message you were sent is yours", `fanout.ts:30-33`) and (b) the raw ledger reads (`/v1/tickets/:id/history`, `…/tickets/:id/events`, `/v1/notes/:id/events`, sync) — the spec's "the event log keeps it". **Recommend: accept both, say so in Features §23, and make `get_ticket_history` never echo a comment body (T9).**
- **Q5 — What `confirm_name` names for each admin tool** (this plan's table in T11/T12): the person's display name for member acts, the invited address for invites, the current workspace/project name for a prefix change, the group's name for group acts (the workspace name for `create`), the workflow's/type's current name for definitions and migration, the ticket KEY for visibility and delete, the workspace name for settings. **Recommend as listed.**
- **Q6 — When the claude.ai check runs** (SC24). **Recommend: immediately after the owner merges `release/mcp-everything` to `main`, in a throwaway project, with failures fixed on the next release.** The alternative — a temporary public staging door — is new infrastructure.

## File structure

| File | Responsibility | Task |
|---|---|---|
| `test-cases/26-comments-and-markdown.md` (new), `test-cases/README.md`, `test-cases/14-mcp-server.md` header, `Features.md` §23 heading | catalogue scaffold | T0 |
| `packages/editor/src/markdown-doc/{schema,refs,parse,serialize,splice,index}.ts` (new); `packages/editor/package.json` (`exports["./markdown-doc"]`, `prosemirror-markdown@1.13.8`) | Markdown ⇄ document, DOM-free | T1 |
| `packages/domain/src/events/ticket-events.ts`, `vocabulary.ts`, `note-state.ts` | `comment.edited` / `comment.deleted`, `COMMENT_EVENT_TYPES` | T2 |
| `apps/server/migrations/1791300000000_comment-edit-delete.sql` (new); `projections/ticket-comments.ts`, `notes.ts`, `note-search.ts`, `search.ts` | projection columns and re-derivation | T2 |
| `apps/server/src/permissions/check-comment-authority.ts` (new), `check-permission.ts` | who may edit/delete | T2 |
| `apps/server/src/read/ticket-comments.ts`, `read/notes.ts`, `routes/tickets.ts`, `packages/domain/src/read-models.ts` | `editedAt` / `deletedAt` / null body | T2 |
| `apps/server/src/notifications/fanout.ts`, `gates/image-embed-gate.ts`, `sync/sync-routes.ts` | mention diff, embeds, bootstrap backfill | T2 |
| `packages/sync-client/src/storage/schema.ts`, `replica/replica.ts` | offline thread and offline search see edits/deletes | T4 |
| `packages/app-core/src/views/comments-thread.tsx`, `flows/comment-edits.ts` (new), `views/history-copy.ts`, `views/ticket-sheet.tsx`, `views/editor-slot.tsx`, `online/mappers.ts`, `online/online-data-source.ts`; `packages/editor/src/components/TicketEditorSlot.tsx`; `apps/web/src/notes/note-comments.tsx`, `note-document.tsx`, ticket-sheet hosts; `packages/ui/src/ui.css`; `docs/manual.md` + help | comment Edit/Delete UI | T5 |
| `packages/mcp-server/src/http-client.ts`, `session.ts`, `lazy-session.ts`, `apps/server/src/mcp/in-process-fetch.ts`, `routes/mcp-http.ts` | bytes in and out; `/mcp` body limit | T3 |
| `packages/mcp-server/src/tools/{reply,preview}.ts` (new), `submit.ts`, `register.ts`, empty factories `{comment,note,attachment,ticket,discovery,member-admin,definition-admin,trash}-tools.ts` (new) | plumbing and registration blocks | T3 |
| `packages/mcp-server/test/fixtures/{tool-names,tool-sweep,fake-session}.ts` (new) | one literal tool pin, per-module blocks | T3 |
| `packages/mcp-server/src/tools/markdown-io.ts` (new), `comment-tools.ts`, `write-tools.ts` (`add_comment`) | comments in Markdown | T6 |
| `packages/mcp-server/src/tools/note-tools.ts` | notes | T7 |
| `packages/mcp-server/src/tools/attachment-tools.ts` | attachments | T8 |
| `packages/mcp-server/src/tools/ticket-tools.ts`, `write-tools.ts` (`create_ticket`), `read-tools.ts` (`get_ticket`) | every ticket act | T9 |
| `packages/mcp-server/src/tools/discovery-tools.ts` | types, workflows, my work, attention, notifications, invitations | T10 |
| `packages/mcp-server/src/tools/member-admin-tools.ts` | members, prefix, groups | T11 |
| `packages/mcp-server/src/tools/definition-admin-tools.ts` | workflow/type definition, migration, visibility, settings | T12 |
| `packages/mcp-server/src/tools/{read,trash,project}-tools.ts`, `docs/manual.md` §16, `apps/server/test/mcp/mcp-everything-round-trip.test.ts` (new) | `search`, `list_deleted`, text fixes, member help, the round trip | T13 |
| (no file: the steps are T14's, the evidence goes in its 🧪 cases `14.570`–`14.575`) | the owner's claude.ai check | T14 |

## Task graph

| Task | Lane branch | Depends on | Parallel with | Size |
|---|---|---|---|---|
| T0 release cut (controller, no checkout) + catalogue scaffold | `task/mcp-e-0-scaffold` | prefix-groups-ux merged | — | S |
| T1 converter | `task/mcp-e-1-converter` | T0 | T2, T3 | L |
| T2 comment edit/delete — domain + server | `task/mcp-e-2-comment-events` | T0 | T1, T3 | L |
| T3 MCP plumbing | `task/mcp-e-3-plumbing` | T0 | T1, T2 | M |
| T4 offline replica sees edits/deletes | `task/mcp-e-4-replica-comments` | T2 | T5–T12 | M |
| T5 comment Edit/Delete in the app | `task/mcp-e-5-comment-ui` | T2 | T4, T6–T12 | L |
| T6 MCP comments in Markdown | `task/mcp-e-6-comment-tools` | T1, T2, T3 | T4, T5, T10–T12 | M |
| T7 MCP note tools | `task/mcp-e-7-note-tools` | T6 | T8–T12 | M |
| T8 MCP attachment tools | `task/mcp-e-8-attachment-tools` | T6 (it adds the editor dependency T8's note-image append needs) | T4, T5, T7, T9–T12 | M |
| T9 MCP ticket tools | `task/mcp-e-9-ticket-tools` | T6 | T7, T8, T10–T12 | L |
| T10 MCP discovery + me | `task/mcp-e-10-discovery-tools` | T3 | T4–T9, T11, T12 | M |
| T11 MCP admin: members, prefix, groups | `task/mcp-e-11-member-admin` | T3 | T4–T10, T12 | L |
| T12 MCP admin: definitions, migration, visibility, settings | `task/mcp-e-12-definition-admin` | T3 | T4–T11 | M |
| T13 search, trash, text fixes, help, round trip | `task/mcp-e-13-search-trash-help` | T5–T12 | — | M |
| T14 real-client production check | (owner step + controller) | T13 merged; release on `main` behind the switch | — | S |

Lanes T6–T12 each write ONLY their own `src/tools/<module>-tools.ts`, their own test file, and their own block in `test/fixtures/tool-names.ts` / `tool-sweep.ts` (between `// <module> begin` / `// <module> end` lines T3 lays down, separated by unchanged lines, so git merges them without conflict). `Features.md` §14 gets one bullet per task appended under the marker line T0 writes (`<!-- mcp-everything bullets: append below, one per task, in task order -->`); a conflict there is a two-line append the controller resolves by keeping both.

**Final tool order (pinned by T3's fixture; 63 tools):** reads `search` (T13), `search_tickets`, `list_tickets`, `get_ticket`, `list_members` · writes `create_ticket`, `transition_ticket`, `add_comment`, `assign_ticket` · workspace (8) · project (8) · comment `list_comments`, `edit_comment`, `delete_comment` · note `list_notes`, `get_note`, `create_note`, `update_note`, `link_note`, `delete_note`, `restore_note`, `get_note_history` · attachment `list_attachments`, `get_attachment`, `add_attachment` · ticket `update_ticket`, `close_ticket`, `reopen_ticket`, `delete_ticket`, `restore_ticket`, `get_ticket_history`, `rank_ticket` · discovery `list_ticket_types`, `list_workflows`, `my_work`, `get_attention`, `list_notifications`, `mark_notifications_read`, `list_my_invitations`, `respond_to_invitation` · member admin `manage_members`, `change_prefix`, `manage_groups` · definition admin `define_workflow`, `define_ticket_type`, `migrate_ticket_type`, `set_visibility`, `update_workspace_settings` · trash `list_deleted`.

**Every lane's LOCAL battery** (run from the worktree root under Node 22, each into a log read with `tail`): `pnpm install --frozen-lockfile` (T1 only: `pnpm install`), `pnpm turbo run build --filter=<affected>...`, `pnpm --filter <pkg> typecheck` for each touched package, the affected suites, `node scripts/check-case-ids.mjs`, `pnpm check:citations`, plus `pnpm check:help` when `docs/manual.md` moved and `pnpm check:migrations` when a migration moved. Report it as "LOCAL run, Node 22, <date>", never as CI.

**DONE line:** a lane ends with exactly `DONE task/mcp-e-<n>-<slug> <sha40>` (the PR head sha, 40 hex).

---

### Task 0: Cut the release branch (controller) and lay the catalogue scaffold (lane `task/mcp-e-0-scaffold`)

**Files:**
- Create: `test-cases/26-comments-and-markdown.md`
- Modify: `test-cases/README.md` (bucket index, after the `23-ux-fixes.md` paragraph), `test-cases/14-mcp-server.md` (header: the block line), `Features.md` (§14 append marker; new §23 heading at the end)

**Interfaces:**
- Produces: the section headings every later task appends under — `## 26.1 The Markdown converter (T1)`, `## 26.2 Comment edit and delete — events and server (T2)`, `## 26.3 The offline replica (T4)`, `## 26.4 The app (T5)` in the new bucket; `## 14.14 MCP everything (block 14.360–14.599)` in §14's bucket; the §14 marker comment and §23 heading in `Features.md`.

- [ ] **Step 1: Cut the branch WITHOUT a checkout** (controller). Only after `release/prefix-groups-ux` is merged to `main` (owner's word). The primary checkout is a live tree (`ctl rebuild` builds its current branch while `release/neo-refresh` runs), so no `git switch` there; which branch it sits on stays the controller's call:

```bash
cd /Users/kiro/my_projects/gisik-nokma && git fetch -q origin && git push origin origin/main:refs/heads/release/mcp-everything && git ls-remote origin refs/heads/release/mcp-everything
```

Expected: one line, the sha of `origin/main`. Then the scaffold lane works in its own worktree: `git worktree add ../gisik-nokma-mcpe-0 -b task/mcp-e-0-scaffold origin/release/mcp-everything` (Node 22 `pnpm install` there before any check).

- [ ] **Step 2: Write the bucket file** `test-cases/26-comments-and-markdown.md`:

```markdown
# §26 — Comment edit and delete, Markdown bodies

**Opened 2026-10-02 by the MCP-everything plan** (`docs/superpowers/plans/2026-10-02-mcp-everything.md`; spec `docs/superpowers/specs/2026-10-02-mcp-everything-design.md`, owner-approved, M-E1..M-E9). Mirrors `Features.md` §23. Ships on `release/mcp-everything`. (24 is neo, 25 is smoothness.)
3-DIGIT PADDED `26.001`–`26.999`, blocks per task: T1 26.001–26.039 · T2 26.040–26.089 · T4 26.090–26.109 · T5 26.110–26.149. Unused ids in a block stay free for that task's follow-ups.

Legend: ✅ covered by a test · ❌ not yet · 🟡 partial · 🧪 manual · 🚫 out of scope, with a reason.

## 26.1 The Markdown converter (T1)

## 26.2 Comment edit and delete — events and server (T2)

## 26.3 The offline replica (T4)

## 26.4 The app (T5)
```

- [ ] **Step 3: Index it.** In `test-cases/README.md`, after the `23-ux-fixes.md` paragraph, add:

```markdown
`26-comments-and-markdown.md` (`Features.md` §23 — comment edit and delete, and Markdown bodies, **opened by the MCP-everything plan on 2026-10-02** (`docs/superpowers/plans/2026-10-02-mcp-everything.md`; spec `docs/superpowers/specs/2026-10-02-mcp-everything-design.md`); 3-DIGIT PADDED `26.001`–`26.999`, blocks per task in the bucket file's own header. `24-*` is neo and `25-*` is smoothness, both on other release branches).
```

- [ ] **Step 4: Reserve §14's block.** In `test-cases/14-mcp-server.md`, append at the end:

```markdown

## 14.14 MCP everything (MCP-everything plan; block `14.360`–`14.599`)

*Blocks per task: T3 14.360–14.379 · T6 14.380–14.399 · T7 14.400–14.429 · T8 14.430–14.449 · T9 14.450–14.479 · T10 14.480–14.499 · T11 14.500–14.529 · T12 14.530–14.549 · T13 14.550–14.569 · T14 14.570–14.579 · spare 14.580–14.599. Each task appends its cases under its own `### T<n>` heading below, in task order.*

### T3 — plumbing

### T6 — comments in Markdown

### T7 — notes

### T8 — attachments

### T9 — tickets

### T10 — discovery and me

### T11 — members, prefix, groups

### T12 — definitions, migration, visibility, settings

### T13 — search, trash, text fixes, help, round trip

### T14 — the real client
```

- [ ] **Step 5: `Features.md`.** At the end of §14's bullet list (the line before `## 15. Notes`) add the line `<!-- mcp-everything bullets: append below, one per task, in task order -->`. At the end of the file add:

```markdown

## 23. Comment edit and delete, Markdown bodies

*Comments on tickets and notes can be edited by their author and deleted by their author or a workspace owner/admin; every body (note, description, comment) reads and writes as Markdown through one pure converter. Spec `docs/superpowers/specs/2026-10-02-mcp-everything-design.md`; plan `docs/superpowers/plans/2026-10-02-mcp-everything.md`. Mirrored by `test-cases/26-comments-and-markdown.md`. (§21 is neo and §22 is smoothness, on other release branches.)*
```

- [ ] **Step 6: Check, commit on the lane, PR into the release branch** (every change is a PR — CLAUDE.md "Never commit or push to `main`" and the release-branch task flow):

```bash
node --version && node scripts/check-case-ids.mjs > /tmp/mcpe-t0.log 2>&1; tail -5 /tmp/mcpe-t0.log
pnpm check:citations > /tmp/mcpe-t0c.log 2>&1; tail -5 /tmp/mcpe-t0c.log
git branch --show-current   # task/mcp-e-0-scaffold
git add test-cases/26-comments-and-markdown.md test-cases/README.md test-cases/14-mcp-server.md Features.md
git commit -m "MCP everything 0: catalogue scaffold (§23, test-cases/26, §14 block 14.360-14.599)"
git push -u origin task/mcp-e-0-scaffold
```

Open the PR with `ctl pr open --base release/mcp-everything --repo <this worktree>` (never `gh pr create` in a compound command), then `ctl gate <sha> --base release/mcp-everything` and `ctl land <pr> --base release/mcp-everything` from the same `--repo`. Expected: both checks green (no ids minted yet). DONE line: `DONE task/mcp-e-0-scaffold <sha40>`. If `check:citations`' ratchet complains about a new file with no ids, add `"test-cases/26-comments-and-markdown.md": 0` to `scripts/fixtures/check-case-citations-baseline.json` in the same commit.

---

### Task 1: The Markdown ⇄ document converter (`@gisik-nokma/editor/markdown-doc`)

**Lane:** `task/mcp-e-1-converter` off `origin/release/mcp-everything`. Root; parallel with T2 and T3.

**Decision (read `packages/editor/src/index.ts` and `package.json`):** the converter lives IN `packages/editor`, because it must build the schema from the editor's own `buildEditorExtensions()` (`schema/extensions.ts:104`) — a second package would need that list moved or duplicated. It is exported on its OWN subpath, `@gisik-nokma/editor/markdown-doc`, because the package root re-exports React components (`index.ts:64-116`). Nothing under `src/markdown-doc/` imports `react`, `@tiptap/react`, a component, or `markdown/serializer.ts`.

**Files:**
- Create: `packages/editor/src/markdown-doc/schema.ts`, `refs.ts`, `parse.ts`, `serialize.ts`, `splice.ts`, `index.ts`
- Modify: `packages/editor/package.json` (`exports["./markdown-doc"]`; dependency `"prosemirror-markdown": "1.13.8"`), `pnpm-lock.yaml` (by `pnpm install`)
- Test: `packages/editor/test/markdown-doc/convert.test.ts` (node environment), `packages/editor/test/markdown-doc/splice.test.ts` (node), `packages/editor/test/markdown-doc/agreement.test.ts` (jsdom — the browser serializer needs a DOM)
- Catalogue: `test-cases/26-comments-and-markdown.md` §26.1, `Features.md` §23

**Interfaces:**
- Produces (all from `@gisik-nokma/editor/markdown-doc`):
  - `type DocNode = { type: string; attrs?: Record<string, unknown>; content?: DocNode[]; marks?: Array<{ type: string; attrs?: Record<string, unknown> }>; text?: string }`
  - `type RefResolver = { user(userId: string): { userId: string; label: string } | null; ticket(key: string): { ticketId: string; projectId: string; key: string; title: string } | null; note(ref: string): { noteId: string; title: string } | null }`
  - `type MarkdownRefs = { userIds: string[]; ticketKeys: string[]; noteRefs: string[] }`
  - `scanMarkdownRefs(markdown: string): MarkdownRefs` — the refs a body names, found by the SAME tokenizer the parse uses (so refs in code are not listed).
  - `markdownToDoc(markdown: string, resolve: RefResolver): { doc: DocJson; problems: string[] }` — `problems` non-empty ⇒ `doc` is `emptyDoc()` and the caller refuses with `problems.join('; ')`.
  - `docToMarkdown(doc: unknown): { markdown: string; lossy: string[] }` — total: a non-document yields `{ markdown: '', lossy: [] }`.
  - `type BodyEdit = { mode: 'replace' } | { mode: 'append' } | { mode: 'replace_section'; section: string }`
  - `spliceDoc(current: unknown, incoming: DocJson, edit: BodyEdit): { doc: DocJson } | { problem: string }`
  - `MARKDOWN_SYNTAX_HELP: string` — the one paragraph every tool description embeds.
  - re-exports `emptyDoc`, `isDocJson`, `type DocJson` (from `../doc.js`, which has no React), so a server caller needs only this subpath.
  - `TICKET_KEY_PATTERN = /^[A-Z]{2,6}-[1-9][0-9]*$/` (workspace prefix 1–3 + project prefix 1–3, `packages/domain/src/prefix.ts:68-70`, `:293-295`).

Cases (`## 26.1 The Markdown converter (T1)`):

```markdown
- ❌ **26.001 — the converter runs with no DOM: under the node environment `typeof document === 'undefined'` and `markdownToDoc('**x**', r)` returns a document whose paragraph carries a `bold` mark;** control: the same call under jsdom returns the identical JSON. Mutation: import `markdown/serializer.ts`'s `exportMarkdown` into `serialize.ts` → the node run throws `document is not defined`.
- ❌ **26.002 — every supported node and mark round-trips Markdown → document → Markdown unchanged** (headings 1/2/6, paragraph, bold, italic, strike, code, link, bullet list with a nested list, ordered list, task list, blockquote with two paragraphs, fenced code with a language, horizontal rule, hard break, table with a header row, mention, ticket ref, note link, image, collapsible); control: a non-canonical spelling (`*` bullets, `__bold__`) comes back canonical (`-`, `**`). Mutation: drop the `taskItem` serializer entry → the task-list fixture fails.
- ❌ **26.003 — every node type round-trips document → Markdown → document equal, and the declared lossy kinds are exactly what is lost** (an `inline-left` image comes back `block` with `lossy: ['image.wrap']`; a colspan-2 cell comes back unspanned with `['table.span']`; a `colwidth` cell with `['table.colwidth']`); control: a document with none of those has `lossy: []`. Mutation: stop adding `image.wrap` → the lossy assertion fails.
- ❌ **26.004 — an unresolvable mention, ticket or note is a problem naming it and the document is EMPTY:** `unknown mention @[Asha](user:01J0…)`, `unknown ticket [[CCSO-99]]`, `unknown note [[note:Nowhere]]`, and a mention whose id is not a ULID; control: the resolvable three produce `mention`, `ticketRef`, `wikiLink` nodes with the RESOLVED label/key/title. Mutation: skip pushing the problem → the call returns a doc with an empty-attr node.
- ❌ **26.005 — the owner's 13:37 comment (`# Achri's Brief`, `### 1. …`, `- responding to …`) stores a level-1 `heading`, a level-3 `heading` and a `bulletList` — never one paragraph of raw Markdown;** control: `plainTextToDoc` of the same text is one paragraph (the defect). Mutation: return `plainTextToDoc(markdown)` from `markdownToDoc`.
- ❌ **26.006 — a literal `[[` that is not a ref stays literal:** `[[draft]]`, `[[ CCSO-4 ]]`, `[[ccso-4]]` are text; `` `[[CCSO-4]]` `` is a code mark; a fenced block holding `[[note:x]]` is a code block; an escaped `\[\[CCSO-4\]\]` is the text `[[CCSO-4]]` — none refuses and none is a chip; and literal TEXT `[[CCSO-4]]` in a document serializes escaped and parses back as text (no ref is invented). Control: `[[CCSO-4]]` in prose becomes a `ticketRef`. Mutation: resolve refs with a regex over the raw string (the browser serializer's way, `serializer.ts:269`) → the code-span and fenced cases refuse.
- ❌ **26.007 — images: `![chart](attachment:<ULID>)` alone on a line is an `image` node (`wrap: 'block'`); an image beside text, and `![x](https://…)`, are problems that say how to write one;** control: alt text survives. Mutation: accept an external URL → the second problem disappears.
- ❌ **26.008 — raw HTML is text, and only http(s)/mailto/relative links become links:** `<script>x</script>` is literal text, `[a](javascript:alert(1))` is literal text, `[a](user:01J0…)` is literal text; control: `[a](https://x.in)` is a link mark with that href. Mutation: construct markdown-it with `html: true` → the script line becomes something other than text.
- ❌ **26.009 — `scanMarkdownRefs` lists the ids, keys and note refs of a body using the same tokenizer:** a key inside a code span is NOT listed; control: one of each in prose are listed, de-duplicated. Mutation: scan with a regex → the code-span key is listed.
- ❌ **26.010 — `replace_section` replaces only the content under one heading up to the next heading of the same or higher level, and every node outside is byte-identical (`JSON.stringify` of each);** `append` adds to the end (an empty placeholder paragraph is replaced, not kept); a missing section is a problem listing the headings; two headings with the same text is a problem saying the section is ambiguous; control: `replace` returns the incoming document. Mutation: re-serialize the whole document through Markdown → an outside node with an `inline-left` image changes.
- ❌ **26.011 — the browser's copy-as-Markdown and the server converter agree on the shared node set:** for paragraph, headings, bold/italic/strike/code, links, bullet and ordered lists, blockquote, fenced code and the horizontal rule, `markdownToDoc(exportMarkdown(doc))` equals `doc` (jsdom); `wikiLink`, `ticketRef`, `mention`, `details`, `taskList`, `table` and `image` are excluded by name (the browser writes `[[title]]` for a note and nothing for an image). Control: a changed browser rule for `**` reddens the bold fixture. Mutation: change `htmlToMarkdown`'s `strong` case to `__` → red.
- 🧪 **26.012 — the subpath loads from the PRODUCTION install:** `pnpm deploy --prod --filter=@gisik-nokma/server /tmp/mcpe-deploy` then `node --input-type=module -e "import('@gisik-nokma/editor/markdown-doc').then(m => console.log(typeof m.markdownToDoc))"` run inside `/tmp/mcpe-deploy` prints `function`. Evidence: the command and its output in the PR.
```

- [ ] **Step 1: Add the dependency and the subpath** (Node 22). In `packages/editor/package.json`: add `"prosemirror-markdown": "1.13.8"` to `dependencies`, and to `exports`:

```json
    "./markdown-doc": {
      "types": "./dist/markdown-doc/index.d.ts",
      "default": "./dist/markdown-doc/index.js"
    },
```

Run `pnpm install > /tmp/mcpe-t1-install.log 2>&1; tail -5 /tmp/mcpe-t1-install.log`, then `grep -n "prosemirror-model@" pnpm-lock.yaml` — expected: exactly ONE version key, `1.25.11`. If a second appears, add a root `pnpm.overrides` entry `"prosemirror-model": "1.25.11"` and re-run.

- [ ] **Step 2: Write the failing tests.** `packages/editor/test/markdown-doc/convert.test.ts`:

```ts
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { plainTextToDoc } from '@gisik-nokma/domain';
import {
  docToMarkdown,
  markdownToDoc,
  scanMarkdownRefs,
  type DocNode,
  type RefResolver,
} from '../../src/markdown-doc/index.js';

const ulid = (tag: string): string => `01J0${tag}`.padEnd(26, '0');
const ASHA = ulid('ASHA');
const IMG = ulid('1MG');
const NOTE = ulid('N0TE');
const TICKET = ulid('TKT');
const PROJECT = ulid('PRJ');

const resolve: RefResolver = {
  user: (id) => (id === ASHA ? { userId: ASHA, label: 'Asha Marak' } : null),
  ticket: (key) => (key === 'CCSO-4' ? { ticketId: TICKET, projectId: PROJECT, key: 'CCSO-4', title: 'Chiller' } : null),
  note: (ref) => (ref === 'Cold room' || ref === NOTE ? { noteId: NOTE, title: 'Cold room' } : null),
};

const blocks = (md: string): DocNode[] => {
  const { doc, problems } = markdownToDoc(md, resolve);
  expect(problems).toEqual([]);
  return (doc as { content: DocNode[] }).content;
};
const types = (nodes: DocNode[] | undefined): string[] => (nodes ?? []).map((n) => n.type);
const inline = (md: string): DocNode[] => blocks(md)[0]?.content ?? [];

describe('26.001–26.009 the converter', () => {
  it('26.001 runs with no DOM', () => {
    expect(typeof (globalThis as { document?: unknown }).document).toBe('undefined');
    expect(inline('**x**')[0]).toMatchObject({ type: 'text', text: 'x', marks: [{ type: 'bold' }] });
  });

  it('26.002 every supported node and mark round-trips Markdown → document → Markdown', () => {
    const canonical = [
      '# One\n\n## Two\n\n###### Six',
      'Plain **bold** *italic* ~~gone~~ `code` [site](https://example.com)',
      '- a\n- b\n  - nested',
      '1. one\n2. two',
      '- [ ] open\n- [x] done',
      '> quoted\n>\n> two',
      '```ts\nconst a = 1;\n```',
      '---',
      'line one\\\nline two',
      '| A | B |\n| --- | --- |\n| 1 | 2 |',
      `@[Asha Marak](user:${ASHA}) see [[CCSO-4]] and [[note:Cold room]]`,
      `![chart](attachment:${IMG})`,
      '<details>\n<summary>More</summary>\n\nHidden text\n\n</details>',
    ];
    for (const md of canonical) {
      const { doc, problems } = markdownToDoc(md, resolve);
      expect(problems, md).toEqual([]);
      expect(docToMarkdown(doc).markdown, md).toBe(md);
    }
    // CONTROL: a non-canonical spelling comes back canonical.
    expect(docToMarkdown(markdownToDoc('* a\n* b\n\n__bold__', resolve).doc).markdown).toBe('- a\n- b\n\n**bold**');
  });

  it('26.003 document → Markdown → document is equal, minus exactly the declared lossy kinds', () => {
    const image = (wrap: string): DocNode => ({ type: 'image', attrs: { attachmentId: IMG, wrap, alt: 'chart' } });
    const doc = (content: DocNode[]) => ({ type: 'doc', attrs: { schemaVersion: 2 }, content });
    const clean = doc([{ type: 'paragraph', content: [{ type: 'text', text: 'hello' }] }, image('block')]);
    expect(docToMarkdown(clean).lossy).toEqual([]); // CONTROL
    expect(markdownToDoc(docToMarkdown(clean).markdown, resolve).doc).toEqual(clean);

    const wrapped = doc([image('inline-left')]);
    const out = docToMarkdown(wrapped);
    expect(out.lossy).toEqual(['image.wrap']);
    expect(markdownToDoc(out.markdown, resolve).doc).toEqual(doc([image('block')]));

    const cell = (type: string, text: string, attrs: Record<string, unknown> = {}): DocNode => ({
      type,
      attrs: { colspan: 1, rowspan: 1, colwidth: null, ...attrs },
      content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
    });
    const table = (second: DocNode): DocNode => ({
      type: 'table',
      content: [
        { type: 'tableRow', content: [cell('tableHeader', 'A'), cell('tableHeader', 'B')] },
        { type: 'tableRow', content: [cell('tableCell', '1'), second] },
      ],
    });
    expect(docToMarkdown(doc([table(cell('tableCell', '2', { colspan: 2 }))])).lossy).toEqual(['table.span']);
    expect(docToMarkdown(doc([table(cell('tableCell', '2', { colwidth: [120] }))])).lossy).toEqual(['table.colwidth']);
  });

  it('26.004 an unresolvable mention, ticket or note is a problem naming it, and the document is empty', () => {
    const stranger = ulid('STRNGR');
    const { doc, problems } = markdownToDoc(
      `Hi @[Asha](user:${stranger}), see [[CCSO-99]] and [[note:Nowhere]] and @[Ravi](user:not-an-id)`,
      resolve,
    );
    expect(problems).toEqual([
      `unknown mention @[Asha](user:${stranger})`,
      'unknown ticket [[CCSO-99]]',
      'unknown note [[note:Nowhere]]',
      'unknown mention @[Ravi](user:not-an-id)',
    ]);
    expect(doc).toEqual({ type: 'doc', attrs: { schemaVersion: 2 }, content: [{ type: 'paragraph' }] });
    // CONTROL: the resolvable three, with RESOLVED label/key/title (not the typed ones).
    expect(inline(`@[Asha](user:${ASHA}) [[CCSO-4]] [[note:${NOTE}]]`).filter((n) => n.type !== 'text')).toEqual([
      { type: 'mention', attrs: { userId: ASHA, label: 'Asha Marak' } },
      { type: 'ticketRef', attrs: { ticketId: TICKET, projectId: PROJECT, key: 'CCSO-4', title: 'Chiller' } },
      { type: 'wikiLink', attrs: { noteId: NOTE, title: 'Cold room' } },
    ]);
  });

  it("26.005 the owner's 13:37 comment stores headings and a bullet list", () => {
    const md = "# Achri's Brief\n\n### 1. Where we are\n\n- responding to the cold-room ticket\n- waiting on the chiller part";
    const out = blocks(md);
    expect(types(out)).toEqual(['heading', 'heading', 'bulletList']);
    expect(out[0]?.attrs?.level).toBe(1);
    expect(out[1]?.attrs?.level).toBe(3);
    expect(types(out[2]?.content)).toEqual(['listItem', 'listItem']);
    // CONTROL: the defect — plainTextToDoc keeps it as ONE paragraph of raw Markdown.
    expect(types((plainTextToDoc(md) as { content: DocNode[] }).content)).toEqual(['paragraph']);
  });

  it('26.006 a literal [[ that is not a ref stays literal', () => {
    for (const md of ['[[draft]]', '[[ CCSO-4 ]]', '[[ccso-4]]']) {
      expect(inline(md), md).toEqual([{ type: 'text', text: md }]);
    }
    expect(inline('`[[CCSO-4]]`')).toEqual([{ type: 'text', text: '[[CCSO-4]]', marks: [{ type: 'code' }] }]);
    expect(types(blocks('```\n[[note:x]]\n```'))).toEqual(['codeBlock']);
    expect(inline('\\[\\[CCSO-4\\]\\]')).toEqual([{ type: 'text', text: '[[CCSO-4]]' }]);
    // A document holding the TEXT "[[CCSO-4]]" must not grow a ref on the way back.
    const literal = { type: 'doc', attrs: { schemaVersion: 2 }, content: [{ type: 'paragraph', content: [{ type: 'text', text: '[[CCSO-4]]' }] }] };
    expect(markdownToDoc(docToMarkdown(literal).markdown, resolve).doc).toEqual(literal);
    // CONTROL: in prose it IS a ref.
    expect(inline('see [[CCSO-4]]')[1]?.type).toBe('ticketRef');
  });

  it('26.007 an image is an attachment on a line of its own', () => {
    expect(blocks(`![chart](attachment:${IMG})`)).toEqual([
      { type: 'image', attrs: { attachmentId: IMG, wrap: 'block', alt: 'chart' } },
    ]);
    expect(markdownToDoc(`see ![chart](attachment:${IMG})`, resolve).problems).toEqual([
      'an image must be on a line of its own: write ![alt](attachment:<attachmentId>) alone on its line',
    ]);
    expect(markdownToDoc('![x](https://example.com/x.png)', resolve).problems).toEqual([
      'images must be attachments of this ticket or note: upload with add_attachment, then write ![alt](attachment:<attachmentId>)',
    ]);
  });

  it('26.008 raw HTML is text; only http(s), mailto and relative links are links', () => {
    expect(inline('<script>x</script>')).toEqual([{ type: 'text', text: '<script>x</script>' }]);
    expect(inline('[a](javascript:alert(1))')).toEqual([{ type: 'text', text: '[a](javascript:alert(1))' }]);
    expect(inline(`[a](user:${ASHA})`)).toEqual([{ type: 'text', text: `[a](user:${ASHA})` }]);
    expect(inline('[a](https://x.in)')[0]?.marks?.[0]).toMatchObject({ type: 'link', attrs: { href: 'https://x.in' } });
  });

  it('26.009 scanMarkdownRefs uses the same tokenizer', () => {
    expect(scanMarkdownRefs(`@[A](user:${ASHA}) [[CCSO-4]] [[CCSO-4]] [[note:Cold room]] \`[[ZZ-9]]\``)).toEqual({
      userIds: [ASHA],
      ticketKeys: ['CCSO-4'],
      noteRefs: ['Cold room'],
    });
  });
});
```

`packages/editor/test/markdown-doc/splice.test.ts`:

```ts
// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { spliceDoc, type DocNode } from '../../src/markdown-doc/index.js';

const h = (level: number, text: string): DocNode => ({ type: 'heading', attrs: { level }, content: [{ type: 'text', text }] });
const p = (text: string): DocNode => ({ type: 'paragraph', content: [{ type: 'text', text }] });
const img: DocNode = { type: 'image', attrs: { attachmentId: '01J0IMG0000000000000000000', wrap: 'inline-left', alt: '' } };
const doc = (content: DocNode[]) => ({ type: 'doc' as const, attrs: { schemaVersion: 2 }, content });

describe('26.010 spliceDoc', () => {
  const current = doc([h(1, 'Plan'), p('intro'), img, h(2, 'Risks'), p('old risk'), h(3, 'Minor'), p('tiny'), h(2, 'Owners'), p('Asha')]);
  it('26.010 replace_section keeps every outside node byte-identical', () => {
    const out = spliceDoc(current, doc([p('new risk')]), { mode: 'replace_section', section: 'Risks' });
    if (!('doc' in out)) throw new Error(out.problem);
    expect(out.doc.content).toEqual([h(1, 'Plan'), p('intro'), img, h(2, 'Risks'), p('new risk'), h(2, 'Owners'), p('Asha')]);
    for (const outside of [0, 1, 2, 5, 6]) {
      expect(JSON.stringify((out.doc.content as DocNode[])[outside])).toBe(
        JSON.stringify(current.content[[0, 1, 2, 7, 8][[0, 1, 2, 5, 6].indexOf(outside)]!]),
      );
    }
  });
  it('26.010 append; a missing or ambiguous section is a problem; replace is the incoming doc', () => {
    expect(spliceDoc(doc([{ type: 'paragraph' }]), doc([p('a')]), { mode: 'append' })).toEqual({ doc: doc([p('a')]) });
    expect(spliceDoc(doc([p('x')]), doc([p('a')]), { mode: 'append' })).toEqual({ doc: doc([p('x'), p('a')]) });
    expect(spliceDoc(current, doc([p('a')]), { mode: 'replace_section', section: 'Nope' })).toEqual({
      problem: 'section "Nope" not found; the headings are: "Plan", "Risks", "Minor", "Owners"',
    });
    expect(spliceDoc(doc([h(2, 'A'), h(2, 'A')]), doc([p('a')]), { mode: 'replace_section', section: 'A' })).toEqual({
      problem: 'section "A" is ambiguous: 2 headings read "A"; use mode "replace"',
    });
    expect(spliceDoc(current, doc([p('a')]), { mode: 'replace' })).toEqual({ doc: doc([p('a')]) }); // CONTROL
  });
});
```

`packages/editor/test/markdown-doc/agreement.test.ts` (jsdom, the package default):

```ts
import { describe, expect, it } from 'vitest';
import { exportMarkdown } from '../../src/markdown/serializer.js';
import { markdownToDoc, type RefResolver } from '../../src/markdown-doc/index.js';

const none: RefResolver = { user: () => null, ticket: () => null, note: () => null };
const t = (text: string, marks?: Array<{ type: string; attrs?: Record<string, unknown> }>) =>
  marks === undefined ? { type: 'text', text } : { type: 'text', text, marks };
const doc = (...content: unknown[]) => ({ type: 'doc', attrs: { schemaVersion: 2 }, content });

/** The node set BOTH serializers speak. Excluded by name: wikiLink, ticketRef, mention, details, taskList, table, image. */
const SHARED = [
  doc({ type: 'paragraph', content: [t('plain')] }),
  doc({ type: 'heading', attrs: { level: 2 }, content: [t('Title')] }),
  doc({ type: 'paragraph', content: [t('b', [{ type: 'bold' }]), t(' '), t('i', [{ type: 'italic' }]), t(' '), t('s', [{ type: 'strike' }]), t(' '), t('c', [{ type: 'code' }])] }),
  doc({ type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [t('one')] }] }] }),
  doc({ type: 'orderedList', attrs: { start: 1, type: null }, content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [t('one')] }] }] }),
  doc({ type: 'blockquote', content: [{ type: 'paragraph', content: [t('q')] }] }),
  doc({ type: 'codeBlock', attrs: { language: 'ts' }, content: [t('const a = 1;')] }),
  doc({ type: 'horizontalRule' }),
];

describe('26.011 the browser serializer and the converter agree on the shared node set', () => {
  it('26.011 markdownToDoc(exportMarkdown(doc)) equals doc for every shared node', () => {
    for (const d of SHARED) {
      const { doc: back, problems } = markdownToDoc(exportMarkdown(d), none);
      expect(problems).toEqual([]);
      expect(back, JSON.stringify(d)).toEqual(d);
    }
  });
});
```

If a fixture's attrs differ from the built schema's defaults (e.g. `orderedList.type`), read the default from `markdownSchema().nodes.orderedList.spec.attrs` and write the fixture with it — the assertion is semantic equality, and a fixture that disagrees with the schema is the fixture's defect.

- [ ] **Step 3: Run them to see them fail.** `pnpm --filter @gisik-nokma/editor exec vitest run test/markdown-doc > /tmp/mcpe-t1.log 2>&1; tail -30 /tmp/mcpe-t1.log` → FAIL (`Cannot find module '../../src/markdown-doc/index.js'`).

- [ ] **Step 4: Implement.** `packages/editor/src/markdown-doc/schema.ts`:

```ts
import { getSchema } from '@tiptap/core';
import type { Schema } from '@tiptap/pm/model';
import { buildEditorExtensions } from '../schema/extensions.js';

let cached: Schema | null = null;

/**
 * Schema v2, built from the editor's OWN extension list (spec §3, M-E8), once.
 * `getSchema` walks extension configs and never builds a view, so this runs on
 * the server; the DOM appears only inside popup/node-view functions nothing here
 * calls (case 26.001 runs this module under the node environment).
 */
export function markdownSchema(): Schema {
  cached ??= getSchema(buildEditorExtensions());
  return cached;
}
```

`packages/editor/src/markdown-doc/refs.ts`:

```ts
/** The product-specific Markdown forms (spec §3). One place, so parse, scan and the help text cannot disagree. */
export type RefResolver = {
  user(userId: string): { userId: string; label: string } | null;
  ticket(key: string): { ticketId: string; projectId: string; key: string; title: string } | null;
  note(ref: string): { noteId: string; title: string } | null;
};
export type MarkdownRefs = { userIds: string[]; ticketKeys: string[]; noteRefs: string[] };

/** `<workspace prefix 1-3><project prefix 1-3>-<n>` (`packages/domain/src/prefix.ts:293-295`). Uppercase only. */
export const TICKET_KEY_PATTERN = /^[A-Z]{2,6}-[1-9][0-9]*$/;
export const ULID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/;
/** `@[Name](user:<id>)` and `[[…]]`, matched inside ONE unescaped text token (see parse.ts for why). */
export const INLINE_REF = /@\[([^\]\n]+)\]\(user:([^)\s]*)\)|\[\[([^\[\]\n]+)\]\]/g;

export const MARKDOWN_SYNTAX_HELP =
  'Write Markdown: # headings, - and 1. lists, - [ ] / - [x] task lists, **bold**, *italic*, ~~strike~~, `code`, ' +
  '``` fenced code ```, > quotes, | tables |, and [links](https://…). Mention a person as @[Their Name](user:<userId>) ' +
  '(find userIds with list_members; a plain @Name is only text and notifies nobody). Link a ticket as [[KEY-12]] and a ' +
  'note as [[note:<note title or id>]]; anything else inside [[ ]] stays plain text. An image is ' +
  '![alt](attachment:<attachmentId>) alone on its own line (upload it with add_attachment first). A collapsible ' +
  'section is <details> on its own line, then <summary>Title</summary>, the content, and </details>. A person, ' +
  'ticket or note that cannot be found is refused, naming it; nothing is silently turned into plain text.';
```

`packages/editor/src/markdown-doc/parse.ts`:

```ts
import MarkdownIt from 'markdown-it';
import { MarkdownParser } from 'prosemirror-markdown';
import { emptyDoc, type DocJson } from '../doc.js';
import { INLINE_REF, TICKET_KEY_PATTERN, ULID_PATTERN, type RefResolver } from './refs.js';
import { markdownSchema } from './schema.js';

// markdown-it's own types are reached through its rulers so this file does not
// depend on which `@types/markdown-it` subpath exports them.
type CoreRule = Parameters<MarkdownIt['core']['ruler']['push']>[1];
type StateCore = Parameters<CoreRule>[0];
type Token = StateCore['tokens'][number];
type BlockRule = Parameters<MarkdownIt['block']['ruler']['before']>[2];
type StateBlock = Parameters<BlockRule>[0];

export type ParseEnv = { resolve: RefResolver; problems: string[] };

const IMAGE_ALONE = 'an image must be on a line of its own: write ![alt](attachment:<attachmentId>) alone on its line';
const IMAGE_EXTERNAL =
  'images must be attachments of this ticket or note: upload with add_attachment, then write ![alt](attachment:<attachmentId>)';

/** `[[KEY]]`, `[[note:x]]` and `@[Name](user:id)` inside ONE text token, split into text + ref tokens. */
function refTokens(state: StateCore, parent: Token): void {
  const env = state.env as ParseEnv;
  const out: Token[] = [];
  for (const child of parent.children ?? []) {
    // ONLY plain `text`: an escaped `\[` is a `text_special` token at this point (this rule runs BEFORE
    // `text_join`), and a code span is `code_inline` — so neither can ever form a ref (case 26.006).
    if (child.type !== 'text') {
      out.push(child);
      continue;
    }
    let last = 0;
    for (const m of child.content.matchAll(INLINE_REF)) {
      const ref = refToken(state, env, m);
      if (ref === null) continue; // `[[draft]]`: stays inside the surrounding text
      if (m.index > last) out.push(textToken(state, child.content.slice(last, m.index)));
      out.push(ref);
      last = m.index + m[0].length;
    }
    if (last === 0) out.push(child);
    else if (last < child.content.length) out.push(textToken(state, child.content.slice(last)));
  }
  parent.children = out;
}

function textToken(state: StateCore, content: string): Token {
  const t = new state.Token('text', '', 0);
  t.content = content;
  return t;
}

function refToken(state: StateCore, env: ParseEnv, m: RegExpMatchArray): Token | null {
  if (m[2] !== undefined) {
    const id = m[2];
    const person = ULID_PATTERN.test(id) ? env.resolve.user(id) : null;
    if (person === null) env.problems.push(`unknown mention ${m[0]}`);
    const t = new state.Token('gn_mention', '', 0);
    t.meta = { userId: person?.userId ?? id, label: person?.label ?? m[1] };
    return t;
  }
  const inner = m[3] ?? '';
  if (inner.startsWith('note:') && inner.slice(5).trim() !== '') {
    const ref = inner.slice(5).trim();
    const note = env.resolve.note(ref);
    if (note === null) env.problems.push(`unknown note [[note:${ref}]]`);
    const t = new state.Token('gn_wiki_link', '', 0);
    t.meta = { noteId: note?.noteId ?? '', title: note?.title ?? ref };
    return t;
  }
  if (TICKET_KEY_PATTERN.test(inner)) {
    const ticket = env.resolve.ticket(inner);
    if (ticket === null) env.problems.push(`unknown ticket [[${inner}]]`);
    const t = new state.Token('gn_ticket_ref', '', 0);
    t.meta = ticket ?? { ticketId: '', projectId: '', key: inner, title: '' };
    return t;
  }
  return null;
}

/** A paragraph whose only content is one `attachment:` image becomes a block `image`; any other image is a problem. */
function liftImages(state: StateCore): void {
  const env = state.env as ParseEnv;
  const out: Token[] = [];
  const tokens = state.tokens;
  for (let i = 0; i < tokens.length; i++) {
    const open = tokens[i]!;
    const body = tokens[i + 1];
    const close = tokens[i + 2];
    if (open.type === 'paragraph_open' && body?.type === 'inline' && close?.type === 'paragraph_close') {
      const meaningful = (body.children ?? []).filter((c) => !(c.type === 'text' && c.content.trim() === '') && c.type !== 'softbreak');
      if (meaningful.length === 1 && meaningful[0]!.type === 'image') {
        const image = meaningful[0]!;
        const src = image.attrGet('src') ?? '';
        const id = src.startsWith('attachment:') ? src.slice('attachment:'.length) : '';
        if (!ULID_PATTERN.test(id)) env.problems.push(IMAGE_EXTERNAL);
        const block = new state.Token('gn_image', 'img', 0);
        block.meta = { attachmentId: id, wrap: 'block', alt: image.content };
        out.push(block);
        i += 2;
        continue;
      }
      if ((body.children ?? []).some((c) => c.type === 'image')) {
        const external = (body.children ?? []).some((c) => c.type === 'image' && !(c.attrGet('src') ?? '').startsWith('attachment:'));
        env.problems.push(external ? IMAGE_EXTERNAL : IMAGE_ALONE);
      }
    }
    out.push(open);
  }
  state.tokens = out;
}

/** `- [ ] x` / `- [x] x`: a bullet list whose EVERY item starts with a box is a task list (core runs before `inline`). */
function taskLists(state: StateCore): void {
  const t = state.tokens;
  for (let i = 0; i < t.length; i++) {
    if (t[i]!.type !== 'bullet_list_open') continue;
    const level = t[i]!.level;
    let close = i + 1;
    while (close < t.length && !(t[close]!.type === 'bullet_list_close' && t[close]!.level === level)) close++;
    const items: number[] = [];
    for (let j = i + 1; j < close; j++) if (t[j]!.type === 'list_item_open' && t[j]!.level === level + 1) items.push(j);
    const boxes = items.map((j) => /^\[([ xX])\] /.exec(t[j + 2]?.type === 'inline' ? t[j + 2]!.content : ''));
    if (items.length === 0 || boxes.some((b) => b === null)) continue;
    t[i]!.type = 'task_list_open';
    t[close]!.type = 'task_list_close';
    items.forEach((j, k) => {
      t[j]!.type = 'task_item_open';
      t[j]!.meta = { checked: boxes[k]![1] !== ' ' };
      t[j + 2]!.content = t[j + 2]!.content.slice(4);
      let end = j + 1;
      while (!(t[end]!.type === 'list_item_close' && t[end]!.level === level + 1)) end++;
      t[end]!.type = 'task_item_close';
    });
  }
}

/** A table cell holds blocks in schema v2; markdown-it puts its inline straight inside `th`/`td`. */
function cellParagraphs(state: StateCore): void {
  const out: Token[] = [];
  for (const tok of state.tokens) {
    if (tok.type === 'th_close' || tok.type === 'td_close') out.push(new state.Token('paragraph_close', 'p', -1));
    out.push(tok);
    if (tok.type === 'th_open' || tok.type === 'td_open') {
      tok.attrs = null; // alignment is not part of schema v2
      out.push(new state.Token('paragraph_open', 'p', 1));
    }
  }
  state.tokens = out;
}

/** `<details>` / `<summary>…</summary>` / … / `</details>`, each tag on its own line (html stays OFF). */
function detailsBlock(state: StateBlock, startLine: number, endLine: number, silent: boolean): boolean {
  const lineText = (n: number): string => state.src.slice(state.bMarks[n]! + state.tShift[n]!, state.eMarks[n]!).trim();
  const open = /^<details( open)?>$/.exec(lineText(startLine));
  if (open === null || startLine + 1 >= endLine) return false;
  const summary = /^<summary>(.*)<\/summary>$/.exec(lineText(startLine + 1));
  if (summary === null) return false;
  let depth = 1;
  let close = startLine + 2;
  for (; close < endLine; close++) {
    const text = lineText(close);
    if (/^<details( open)?>$/.test(text)) depth++;
    else if (text === '</details>' && --depth === 0) break;
  }
  if (depth !== 0) return false;
  if (silent) return true;
  const opened = state.push('details_open', 'details', 1);
  opened.meta = { open: open[1] !== undefined };
  state.push('details_summary_open', 'summary', 1);
  const inline = state.push('inline', '', 0);
  inline.content = summary[1] ?? '';
  inline.map = [startLine + 1, startLine + 2];
  inline.children = [];
  state.push('details_summary_close', 'summary', -1);
  state.push('details_content_open', 'div', 1);
  const oldMax = state.lineMax;
  state.lineMax = close;
  state.md.block.tokenize(state, startLine + 2, close);
  state.lineMax = oldMax;
  state.push('details_content_close', 'div', -1);
  state.push('details_close', 'details', -1);
  state.line = close + 1;
  return true;
}

function markdownIt(): MarkdownIt {
  // `html: false`: Claude must not be able to store raw HTML (case 26.008). `linkify: false`: a bare
  // URL is text, as the editor's own `autolink: false` keeps it (`schema/extensions.ts`).
  const md = new MarkdownIt('default', { html: false, linkify: false, typographer: false });
  md.validateLink = (url: string): boolean => /^(https?:|mailto:)/i.test(url) || /^[/#]/.test(url) || url.startsWith('attachment:');
  md.block.ruler.before('table', 'gn_details', detailsBlock, { alt: ['paragraph', 'reference', 'blockquote', 'list'] });
  md.core.ruler.before('inline', 'gn_task_lists', taskLists);
  md.core.ruler.before('inline', 'gn_cell_paragraphs', cellParagraphs);
  md.core.ruler.after('inline', 'gn_images', liftImages);
  md.core.ruler.before('text_join', 'gn_refs', (state) => {
    for (const tok of state.tokens) if (tok.type === 'inline') refTokens(state, tok);
  });
  return md;
}

let parser: MarkdownParser | null = null;

function markdownParser(): MarkdownParser {
  parser ??= new MarkdownParser(markdownSchema(), markdownIt(), {
    blockquote: { block: 'blockquote' },
    paragraph: { block: 'paragraph' },
    list_item: { block: 'listItem' },
    bullet_list: { block: 'bulletList' },
    ordered_list: { block: 'orderedList', getAttrs: (tok) => ({ start: Number(tok.attrGet('start') ?? 1) }) },
    task_list: { block: 'taskList' },
    task_item: { block: 'taskItem', getAttrs: (tok) => ({ checked: (tok.meta as { checked: boolean }).checked }) },
    heading: { block: 'heading', getAttrs: (tok) => ({ level: Number(tok.tag.slice(1)) }) },
    code_block: { block: 'codeBlock', noCloseToken: true },
    fence: { block: 'codeBlock', getAttrs: (tok) => ({ language: tok.info.trim() || null }), noCloseToken: true },
    hr: { node: 'horizontalRule' },
    hardbreak: { node: 'hardBreak' },
    table: { block: 'table' },
    thead: { ignore: true },
    tbody: { ignore: true },
    tr: { block: 'tableRow' },
    th: { block: 'tableHeader' },
    td: { block: 'tableCell' },
    details: { block: 'details', getAttrs: (tok) => ({ open: (tok.meta as { open: boolean }).open }) },
    details_summary: { block: 'detailsSummary' },
    details_content: { block: 'detailsContent' },
    gn_image: { node: 'image', getAttrs: (tok) => tok.meta as Record<string, unknown> },
    gn_mention: { node: 'mention', getAttrs: (tok) => tok.meta as Record<string, unknown> },
    gn_ticket_ref: { node: 'ticketRef', getAttrs: (tok) => tok.meta as Record<string, unknown> },
    gn_wiki_link: { node: 'wikiLink', getAttrs: (tok) => tok.meta as Record<string, unknown> },
    em: { mark: 'italic' },
    strong: { mark: 'bold' },
    s: { mark: 'strike' },
    link: { mark: 'link', getAttrs: (tok) => ({ href: tok.attrGet('href') }) },
    code_inline: { mark: 'code', noCloseToken: true },
  });
  return parser;
}

/** Markdown → schema-v2 JSON. Any problem ⇒ `emptyDoc()` and the problems, so a caller can only refuse. */
export function markdownToDoc(markdown: string, resolve: RefResolver): { doc: DocJson; problems: string[] } {
  const env: ParseEnv = { resolve, problems: [] };
  const node = markdownParser().parse(markdown, env);
  if (env.problems.length > 0) return { doc: emptyDoc(), problems: env.problems };
  return { doc: node.toJSON() as DocJson, problems: [] };
}

/** The refs a body names, by the SAME tokenizer (so a key in a code span is not one). */
export function scanRefs(markdown: string): { userIds: string[]; ticketKeys: string[]; noteRefs: string[] } {
  const userIds = new Set<string>();
  const ticketKeys = new Set<string>();
  const noteRefs = new Set<string>();
  const recording: RefResolver = {
    user: (id) => (userIds.add(id), { userId: id, label: id }),
    ticket: (key) => (ticketKeys.add(key), { ticketId: '', projectId: '', key, title: '' }),
    note: (ref) => (noteRefs.add(ref), { noteId: '', title: ref }),
  };
  markdownIt().parse(markdown, { resolve: recording, problems: [] } satisfies ParseEnv);
  return { userIds: [...userIds], ticketKeys: [...ticketKeys], noteRefs: [...noteRefs] };
}
```

(A mention whose id fails `ULID_PATTERN` never reaches `resolve.user`, so `scanRefs` lists only well-formed ids; the parse still reports it as `unknown mention …`. If `MarkdownParser.prototype.parse` in the installed 1.13.8 does not take a second `markdownEnv` argument, read `node_modules/prosemirror-markdown/dist/index.d.ts` and pass the env the way that version does — the env is the only channel the core rules have to the resolver.)

`packages/editor/src/markdown-doc/serialize.ts`:

```ts
import { MarkdownSerializer, defaultMarkdownSerializer, type MarkdownSerializerState } from 'prosemirror-markdown';
import type { Node as PMNode } from '@tiptap/pm/model';
import { markdownSchema } from './schema.js';

/** Markdown for one node's inline content, through a fresh serializer (table cells need it as a string). */
function inlineOf(node: PMNode | null, lossy: Set<string>): string {
  if (node === null) return '';
  const schema = markdownSchema();
  const para = node.type.name === 'paragraph' ? node : schema.nodes.paragraph!.create(null, node.content);
  return serializer(lossy).serialize(schema.topNodeType.create(null, [para]), { tightLists: true }).trim();
}

function serializer(lossy: Set<string>): MarkdownSerializer {
  return new MarkdownSerializer(
    {
      paragraph(state, node) {
        state.renderInline(node);
        state.closeBlock(node);
      },
      heading(state, node) {
        state.write(`${'#'.repeat(Number(node.attrs['level']))} `);
        state.renderInline(node, false);
        state.closeBlock(node);
      },
      blockquote(state, node) {
        state.wrapBlock('> ', null, node, () => state.renderContent(node));
      },
      codeBlock(state, node) {
        const runs = node.textContent.match(/`{3,}/gm);
        const fence = runs ? `${[...runs].sort().slice(-1)[0]}\`` : '```';
        state.write(`${fence}${(node.attrs['language'] as string | null) ?? ''}\n`);
        state.text(node.textContent, false);
        state.write('\n');
        state.write(fence);
        state.closeBlock(node);
      },
      horizontalRule(state, node) {
        state.write('---');
        state.closeBlock(node);
      },
      bulletList(state, node) {
        state.renderList(node, '  ', () => '- ');
      },
      orderedList(state, node) {
        const start = Number(node.attrs['start'] ?? 1);
        const width = String(start + node.childCount - 1).length;
        state.renderList(node, ' '.repeat(width + 2), (i) => {
          const n = String(start + i);
          return `${' '.repeat(width - n.length)}${n}. `;
        });
      },
      listItem(state, node) {
        state.renderContent(node);
      },
      taskList(state, node) {
        state.renderList(node, '  ', (i) => `- [${node.child(i).attrs['checked'] === true ? 'x' : ' '}] `);
      },
      taskItem(state, node) {
        state.renderContent(node);
      },
      hardBreak(state, node, parent, index) {
        for (let i = index + 1; i < parent.childCount; i++) {
          if (parent.child(i).type !== node.type) {
            state.write('\\\n');
            return;
          }
        }
      },
      text(state, node) {
        state.text(node.text ?? '');
      },
      image(state, node) {
        if (node.attrs['wrap'] !== 'block') lossy.add('image.wrap');
        state.write(`![${state.esc(String(node.attrs['alt'] ?? ''))}](attachment:${String(node.attrs['attachmentId'])})`);
        state.closeBlock(node);
      },
      mention(state, node) {
        const label = String(node.attrs['label'] ?? '').replace(/[\]\n]/g, '');
        state.write(`@[${label}](user:${String(node.attrs['userId'])})`);
      },
      ticketRef(state, node) {
        const key = String(node.attrs['key'] ?? '');
        if (key === '') {
          lossy.add('ticketRef.key');
          state.text(String(node.attrs['title'] ?? ''));
        } else state.write(`[[${key}]]`);
      },
      wikiLink(state, node) {
        const title = String(node.attrs['title'] ?? '');
        state.write(`[[note:${title !== '' && !/[\]\n]/.test(title) ? title : String(node.attrs['noteId'])}]]`);
      },
      details(state, node) {
        state.write(node.attrs['open'] === true ? '<details open>' : '<details>');
        state.ensureNewLine();
        state.renderContent(node);
        state.write('</details>');
        state.closeBlock(node);
      },
      detailsSummary(state, node) {
        state.write('<summary>');
        state.renderInline(node);
        state.write('</summary>');
        state.closeBlock(node);
      },
      detailsContent(state, node) {
        state.renderContent(node);
      },
      table(state: MarkdownSerializerState, node) {
        const rows: string[][] = [];
        node.forEach((row, _offset, r) => {
          const cells: string[] = [];
          row.forEach((cell) => {
            if (r === 0 && cell.type.name !== 'tableHeader') lossy.add('table.header');
            if (Number(cell.attrs['colspan'] ?? 1) > 1 || Number(cell.attrs['rowspan'] ?? 1) > 1) lossy.add('table.span');
            const widths = cell.attrs['colwidth'];
            if (Array.isArray(widths) && widths.some((w) => typeof w === 'number' && w > 0)) lossy.add('table.colwidth');
            if (cell.childCount > 1) lossy.add('table.cell-blocks');
            cells.push(inlineOf(cell.firstChild, lossy).replace(/\|/g, '\\|').replace(/\n/g, ' '));
          });
          rows.push(cells);
        });
        const line = (cells: string[]): string => `| ${cells.join(' | ')} |`;
        rows.forEach((cells, i) => {
          state.write(line(cells));
          state.ensureNewLine();
          if (i === 0) {
            state.write(line(cells.map(() => '---')));
            state.ensureNewLine();
          }
        });
        state.closeBlock(node);
      },
      tableRow() {},
      tableHeader() {},
      tableCell() {},
    },
    {
      italic: defaultMarkdownSerializer.marks['em']!,
      bold: defaultMarkdownSerializer.marks['strong']!,
      code: defaultMarkdownSerializer.marks['code']!,
      link: defaultMarkdownSerializer.marks['link']!,
      strike: { open: '~~', close: '~~', mixable: true, expelEnclosingWhitespace: true },
    },
  );
}

/** Schema-v2 JSON → Markdown, and the kinds Markdown could not carry (spec §3, SC3/SC4). Total. */
export function docToMarkdown(doc: unknown): { markdown: string; lossy: string[] } {
  if (doc === null || typeof doc !== 'object' || (doc as { type?: unknown }).type !== 'doc') return { markdown: '', lossy: [] };
  const node = markdownSchema().nodeFromJSON(doc);
  const lossy = new Set<string>();
  const markdown = serializer(lossy).serialize(node, { tightLists: true }).trim();
  return { markdown, lossy: [...lossy].sort() };
}
```

`packages/editor/src/markdown-doc/splice.ts`:

```ts
import { emptyDoc, isDocJson, type DocJson } from '../doc.js';

export type DocNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: DocNode[];
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
  text?: string;
};
export type BodyEdit = { mode: 'replace' } | { mode: 'append' } | { mode: 'replace_section'; section: string };

const textOf = (node: DocNode): string => (node.text ?? '') + (node.content ?? []).map(textOf).join('');
const isHeading = (node: DocNode | undefined): node is DocNode => node?.type === 'heading';
const levelOf = (node: DocNode): number => Number(node.attrs?.['level'] ?? 1);
const isEmptyParagraph = (node: DocNode | undefined): boolean =>
  node?.type === 'paragraph' && (node.content === undefined || node.content.length === 0);

/**
 * Section and append edits SPLICE the stored JSON: every node outside the edited range is the
 * very object that was stored, so it serializes byte-for-byte as before (spec §3, case 26.010).
 */
export function spliceDoc(current: unknown, incoming: DocJson, edit: BodyEdit): { doc: DocJson } | { problem: string } {
  if (edit.mode === 'replace') return { doc: incoming };
  const base = isDocJson(current) ? current : emptyDoc();
  const blocks = Array.isArray(base['content']) ? (base['content'] as DocNode[]) : [];
  const added = Array.isArray(incoming['content']) ? (incoming['content'] as DocNode[]) : [];
  if (edit.mode === 'append') {
    const kept = blocks.length === 1 && isEmptyParagraph(blocks[0]) ? [] : blocks;
    return { doc: { ...base, content: [...kept, ...added] } };
  }
  const want = edit.section.trim();
  const matches = blocks.flatMap((b, i) => (isHeading(b) && textOf(b).trim() === want ? [i] : []));
  if (matches.length === 0) {
    const names = blocks.filter(isHeading).map((b) => `"${textOf(b).trim()}"`);
    return { problem: `section "${want}" not found; the headings are: ${names.length > 0 ? names.join(', ') : 'none'}` };
  }
  if (matches.length > 1) return { problem: `section "${want}" is ambiguous: ${matches.length} headings read "${want}"; use mode "replace"` };
  const at = matches[0]!;
  const level = levelOf(blocks[at]!);
  let end = at + 1;
  while (end < blocks.length && !(isHeading(blocks[end]) && levelOf(blocks[end]!) <= level)) end++;
  return { doc: { ...base, content: [...blocks.slice(0, at + 1), ...added, ...blocks.slice(end)] } };
}
```

`packages/editor/src/markdown-doc/index.ts`:

```ts
/**
 * The server-safe Markdown ⇄ document converter (MCP-everything spec §3, M-E8), exported on its
 * own subpath because the package root carries React. Nothing here may import a component, `react`,
 * `@tiptap/react` or `../markdown/serializer.js` (the browser copy-as-Markdown, which needs a DOM).
 */
export { markdownToDoc, scanRefs as scanMarkdownRefs } from './parse.js';
export { docToMarkdown } from './serialize.js';
export { spliceDoc, type BodyEdit, type DocNode } from './splice.js';
export { markdownSchema } from './schema.js';
export { MARKDOWN_SYNTAX_HELP, TICKET_KEY_PATTERN, type MarkdownRefs, type RefResolver } from './refs.js';
export { emptyDoc, isDocJson, type DocJson } from '../doc.js';
```

- [ ] **Step 5: Run to pass.** `pnpm --filter @gisik-nokma/editor exec vitest run test/markdown-doc > /tmp/mcpe-t1.log 2>&1; tail -40 /tmp/mcpe-t1.log` → PASS. A canonical fixture that differs only in whitespace (the serializer's own spelling) is fixed in the FIXTURE with a one-line note in the PR; any semantic difference is a defect to fix in the converter.

- [ ] **Step 6: Mutations** (each must redden its case, then revert): `html: true` → 26.008; resolve refs by regex over `markdown` before parsing → 26.006; delete `taskList`/`taskItem` serializer entries → 26.002; drop `lossy.add('image.wrap')` → 26.003. Record "4/4 mutations red" in the PR.

- [ ] **Step 7: The whole package, build and the production-install check.**

```bash
pnpm --filter @gisik-nokma/editor exec vitest run > /tmp/mcpe-t1-all.log 2>&1; tail -15 /tmp/mcpe-t1-all.log
pnpm --filter @gisik-nokma/editor typecheck > /tmp/mcpe-t1-tc.log 2>&1; tail -15 /tmp/mcpe-t1-tc.log
pnpm turbo run build --filter=@gisik-nokma/editor... > /tmp/mcpe-t1-build.log 2>&1; tail -10 /tmp/mcpe-t1-build.log
```

26.012 is T6's to run (it is the first task that makes the server depend on this subpath); T1 records it ❌ with that note.

- [ ] **Step 8: Catalogue + commit.** Flip 26.001–26.011 ✅ (each id is in its `it` title). Features.md §23 bullet:

```markdown
- ⚙️ **One Markdown ⇄ document converter, with no DOM** (MCP-everything T1; `packages/editor/src/markdown-doc/`, exported as `@gisik-nokma/editor/markdown-doc`) — built from the editor's own schema v2 (`getSchema(buildEditorExtensions())`) with `prosemirror-markdown@1.13.8`. `@[Name](user:<id>)` is a mention, `[[KEY-12]]` a ticket ref, `[[note:<title or id>]]` a note link, `![alt](attachment:<id>)` alone on a line an image, `<details>`/`<summary>` lines a collapsible; GFM tables, task lists and marks. An unknown person, ticket or note is a problem naming it (never plain text); anything else in `[[ ]]`, and anything in code, stays literal; raw HTML is text and only http(s)/mailto/relative links link. Reads report `lossy` (image wrap, table spans/widths). `spliceDoc` replaces one section or appends, keeping every other node byte-identical. Agrees with the browser's copy-as-Markdown on the shared node set (26.011). Cases 26.001–26.011.
```

```bash
git branch --show-current   # task/mcp-e-1-converter
git add packages/editor/package.json pnpm-lock.yaml packages/editor/src/markdown-doc packages/editor/test/markdown-doc test-cases/26-comments-and-markdown.md Features.md
git commit -m "MCP everything 1: Markdown <-> document converter, DOM-free (26.001-26.011)"
git push -u origin task/mcp-e-1-converter
```

DONE line: `DONE task/mcp-e-1-converter <sha40>`.

---

### Task 2: Comment edit and delete — events, permission, projections, reads, mentions, search

**Lane:** `task/mcp-e-2-comment-events` off `origin/release/mcp-everything`. Root; parallel with T1 and T3. A product feature (M-E9): T5 (app) and T6 (MCP) are its two doors.

**Files:**
- Modify: `packages/domain/src/events/ticket-events.ts` (after `commentAddedPayload`, `:211`), `packages/domain/src/vocabulary.ts` (after the `comment.added` registration, `:279-284`), `packages/domain/src/note-state.ts` (`NOTE_EVENT_TYPES` `:109-120`, reducer `:209-213`), `packages/domain/src/read-models.ts` (`NoteComment`, `:897`)
- Create: `apps/server/migrations/1791300000000_comment-edit-delete.sql`, `apps/server/src/permissions/check-comment-authority.ts`
- Modify: `apps/server/src/permissions/check-permission.ts` (`checkPermission`'s last line, `:1990`), `apps/server/src/projections/ticket-comments.ts:60-112`, `projections/notes.ts:269`, `projections/note-search.ts:135`, `projections/search.ts:124-138`, `read/ticket-comments.ts:62-134`, `read/notes.ts:285-305`, `routes/tickets.ts:978-994`, `notifications/fanout.ts:154-205`, `:246-280`, `:337-341`, `gates/image-embed-gate.ts:88-111`, `sync/sync-routes.ts:89-95`
- Test: `packages/domain/test/comment-events.test.ts` (new), `apps/server/test/permissions/check-comment-authority.test.ts` (new), `apps/server/test/routes/comment-edit-delete.test.ts` (new), `apps/server/test/notifications/comment-edit-mentions.test.ts` (new), `apps/server/test/purge/purge-comment-edits.test.ts` (new), `apps/server/test/sync/bootstrap.test.ts:435-442` (the literal list)
- Catalogue: `test-cases/26-comments-and-markdown.md` §26.2, `Features.md` §23

**Interfaces:**
- Produces (domain, exported from `@gisik-nokma/domain`):
  - `commentEditedPayload = z.object({ commentId: ulidString, body: z.record(z.string(), z.unknown()) }).strict()`
  - `commentDeletedPayload = z.object({ commentId: ulidString }).strict()`
  - `COMMENT_EVENT_TYPES = ['comment.added', 'comment.edited', 'comment.deleted'] as const`; `isCommentEvent(type: string): boolean`
  - Event types `comment.edited@1`, `comment.deleted@1`, `entityKind: ['ticket', 'note']`, filed against the comment's PARENT; `commentId` is the `comment.added` event id.
  - `NoteComment` gains `editedAt: string | null; deletedAt: string | null`, and `body` is `null` when deleted.
- Produces (server): `TicketCommentRow` gains the same two fields; `GET …/tickets/:id/comments` and `GET /v1/notes/:id/comments` serve `{ commentId, authorId, body: <doc> | null, recordedAt, editedAt, deletedAt, files? }`; refusal rule `permission.comment` with reasons `COMMENT_UNKNOWN_REASON = 'That comment is not on this ticket or note.'`, `COMMENT_ALREADY_DELETED_REASON = 'This comment has been deleted.'`, `COMMENT_EDIT_AUTHOR_REASON = 'Only the person who wrote a comment can edit it.'`, `COMMENT_DELETE_AUTHORITY_REASON = 'Only the person who wrote a comment, or a workspace owner or admin, can delete it.'`, `COMMENT_NOTE_DELETED_REASON = 'This note is deleted; restore it first.'` (all exported from `check-comment-authority.ts`).

Cases (`## 26.2 Comment edit and delete — events and server (T2)`):

```markdown
- ❌ **26.040 — `comment.edited {commentId, body}` and `comment.deleted {commentId}` are registered against `ticket` AND `note`, strict, with a ULID `commentId`;** control: both parse against a ticket and a note; refused against a `project`, with an extra key, with a non-ULID id. Mutation: register ticket-only → the note arm fails.
- ❌ **26.041 — both are in `NOTE_EVENT_TYPES` and fold to no change on a live note, and the note reducer refuses them on a deleted note;** control: `comment.added` behaves identically. Mutation: drop them from the reducer's case list → "unknown note event type".
- ❌ **26.042 — editing a TICKET comment: only its author commits; an admin, the owner and another member are refused `permission.comment` "Only the person who wrote a comment can edit it."; a person who cannot see the ticket is refused `permission.visibility` first;** control: the author's edit passes. Mutation: allow admins to edit → the admin cell commits.
- ❌ **26.043 — deleting a TICKET comment: its author, a workspace admin and the owner commit; another member is refused "Only the person who wrote a comment, or a workspace owner or admin, can delete it.";** control: the author passes. Mutation: drop the admin arm → the admin cell is refused.
- ❌ **26.044 — the same two rules on a NOTE comment, behind the note read rule** (a member who cannot read a private note is refused `permission.note` "You cannot see this note." before the comment rule);** control: the author passes. Mutation: skip `checkCommentAuthority` for notes → a non-author member's edit commits.
- ❌ **26.045 — a deleted comment can be neither edited nor deleted again ("This comment has been deleted.");** control: before the delete, the author's edit commits. Mutation: drop the `deleted_at` test → the second delete commits.
- ❌ **26.046 — a `commentId` that names no comment, or a comment on ANOTHER ticket or note, is refused "That comment is not on this ticket or note." (one answer for both);** control: the right parent passes. Mutation: look the comment up by id alone → the cross-parent edit commits.
- ❌ **26.047 — the projection: an edit replaces the body and sets `edited_at`/`edited_by`; a delete clears the body, keeps `comment_id`/`author_id`/`recorded_at`, sets `deleted_at`/`deleted_by`; a sibling comment is untouched;** control: the sibling's row is byte-identical. Mutation: `DELETE` the row on `comment.deleted` → the placeholder loses its author.
- ❌ **26.048 — a rebuild of `proj_ticket_comments`, `proj_note_comments` and `proj_search` from the ledger equals the live tables after added → edited → deleted;** control: the tables are non-empty. Mutation: apply edits live only (skip them in `apply`) → drift reported.
- ❌ **26.049 — `GET …/tickets/:id/comments` serves `editedAt` and `deletedAt` (ISO or null), the edited body, `body: null` and `files: []` for a deleted comment;** control: an untouched comment has both null. Mutation: serve the stored body of a deleted comment → red.
- ❌ **26.050 — `GET /v1/notes/:id/comments` does the same for a note.** Control and mutation as 26.049.
- ❌ **26.051 — ticket search follows the comment: after an edit the old word no longer finds the ticket and the new word does; after a delete neither does; another comment's word still does;** control: before the edit the old word finds it. Mutation: leave `proj_search.comments` alone on `comment.edited` → the old word still finds it.
- ❌ **26.052 — editing a comment whose PARENT is deleted is refused, nothing written: a deleted ticket answers `deleted-ticket` "This ticket is deleted; restore it first."; a deleted note answers `permission.comment` "This note is deleted; restore it first."; after `ticket.restored` / `note.restored` the same edit commits** (Review Focus 4). Control: the restore arm. Mutation: drop the note-deleted test → the note edit commits.
- ❌ **26.053 — an edit may embed only an image attached to the same ticket (`attachment.embed-unknown` otherwise), exactly as `comment.added`;** control: an edit embedding this ticket's image commits. Mutation: drop the `comment.edited` gate → the cross-ticket edit commits.
- ❌ **26.054 — an edit of a TICKET comment notifies only the mentions it ADDS, and only people who can see the ticket; the notification's `eventId` is the COMMENT's id (the thread anchor); a redelivery adds no row;** control: the original `comment.added` notified its mention once. Mutation: pass `previous: null` for edits → the kept mention is notified again.
- ❌ **26.055 — the same on a NOTE comment (`source: 'note-comment'`, `eventId` = the comment id).** Control and mutation as 26.054.
- ❌ **26.056 — a description `ticket.field_set` still notifies every mention it carries, as before (guard: the new `previous` parameter defaults to nothing for descriptions);** control: the description fan-out cases in `fanout.test.ts` stay green. Mutation: diff descriptions against nothing-yet-defined → still green (guard case).
- ❌ **26.057 — `comment.edited` and `comment.deleted` filed BELOW a ticket's snapshot seq travel in a bootstrap (they carry content beyond the fold, like `comment.added`);** control: 12.94's boundary loop lists the seven backfill types. Mutation: leave them out of `BOOTSTRAP_BACKFILL_TYPES` → the edit is missing from the tail.
- ❌ **26.058 — an edit that adds a mention of someone who cannot read the NOTE writes no row for them and no log line naming them, while a reader added beside them is notified** (Review Focus 2). Control: the reader's row. Mutation: drop the `canReadNote` gate for edits → the non-reader gets a row.
- ❌ **26.059 — purging a ticket or a note erases its `comment.edited`/`comment.deleted` events and comment rows with it (no code: the ledger half deletes by entity, `1790600000000_purge-engine.sql:91-95`);** control: a sibling ticket's edited comment survives whole. Mutation: none in code (guard: the marker scan finds nothing).
```

- [ ] **Step 1: Failing domain test.** `packages/domain/test/comment-events.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  applyNoteEvent,
  COMMENT_EVENT_TYPES,
  commentDeletedPayload,
  commentEditedPayload,
  domainRegistry,
  isCommentEvent,
  newUlid,
  NOTE_EVENT_TYPES,
  type EventEnvelope,
} from '../src/index.js';

const body = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hi' }] }] };

describe('26.040–26.041 comment.edited / comment.deleted', () => {
  it('26.040 registered for ticket and note, strict, ULID commentId', () => {
    const id = newUlid();
    expect(commentEditedPayload.safeParse({ commentId: id, body }).success).toBe(true); // control
    expect(commentDeletedPayload.safeParse({ commentId: id }).success).toBe(true);
    expect(commentEditedPayload.safeParse({ commentId: 'c1', body }).success).toBe(false);
    expect(commentDeletedPayload.safeParse({ commentId: id, body }).success).toBe(false);
    for (const type of ['comment.edited', 'comment.deleted']) {
      expect(domainRegistry.get(type, 1)?.entityKind).toEqual(['ticket', 'note']);
    }
    expect(COMMENT_EVENT_TYPES).toEqual(['comment.added', 'comment.edited', 'comment.deleted']);
    expect(isCommentEvent('comment.deleted')).toBe(true);
    expect(isCommentEvent('note.body_set')).toBe(false);
  });

  it('26.041 fold to no change on a live note; refused on a deleted one', () => {
    expect(NOTE_EVENT_TYPES).toContain('comment.edited');
    expect(NOTE_EVENT_TYPES).toContain('comment.deleted');
    const noteId = newUlid();
    const env = (type: string, payload: unknown, seq: number): EventEnvelope =>
      ({
        id: newUlid(), workspaceId: newUlid(), entity: { kind: 'note', id: noteId }, type, version: 1, payload,
        actorId: newUlid(), origin: 'web', clientTime: '2026-10-02T10:00:00.000Z', serverTime: `2026-10-02T10:00:0${seq}.000Z`, seq,
      }) as EventEnvelope;
    const live = applyNoteEvent(null, env('note.created', { title: 'N', homeProjectId: '', scope: { mode: 'private' } }, 1));
    const edited = applyNoteEvent(live, env('comment.edited', { commentId: newUlid(), body }, 2));
    expect({ ...edited, updatedAt: live.updatedAt, seq: live.seq }).toEqual(live);
    const added = applyNoteEvent(live, env('comment.added', { body }, 2)); // control
    expect({ ...added, updatedAt: live.updatedAt, seq: live.seq }).toEqual(live);
    const gone = applyNoteEvent(live, env('note.deleted', {}, 3));
    expect(() => applyNoteEvent(gone, env('comment.deleted', { commentId: newUlid() }, 4))).toThrow(/the note is deleted/);
  });
});
```

(Read `EventEnvelope`'s exact required keys in `packages/domain/src/envelope.ts` and complete the literal if `parseEvent`-only fields are needed; the cast stays because the reducer reads only the fields set.)

- [ ] **Step 2: Failing permission test.** `apps/server/test/permissions/check-comment-authority.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeEnvelope, newUlid } from '@gisik-nokma/domain';
import { checkPermission, PERMISSION_VISIBILITY_RULE } from '../../src/permissions/check-permission.js';
import {
  COMMENT_ALREADY_DELETED_REASON,
  COMMENT_DELETE_AUTHORITY_REASON,
  COMMENT_EDIT_AUTHOR_REASON,
  COMMENT_NOTE_DELETED_REASON,
  COMMENT_PERMISSION_RULE,
  COMMENT_UNKNOWN_REASON,
} from '../../src/permissions/check-comment-authority.js';
import { applyCommitted, makeCommitted } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { seedNotesFixture, type NotesFixture, type NotesUser } from '../helpers/notes-fixture.js';

let db: TestDatabase;
let fx: NotesFixture;
const BODY = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x' }] }] };

/** A comment through the projections, by `who`, on a ticket or a note; answers its id. */
async function comment(kind: 'ticket' | 'note', parent: string, who: NotesUser): Promise<string> {
  const env = makeCommitted({ workspaceId: fx.WS, actorId: fx.ids[who], entity: { kind, id: parent }, type: 'comment.added', payload: { body: BODY } });
  await applyCommitted(db.pool, [env]);
  return env.id;
}

async function gate(type: 'comment.edited' | 'comment.deleted', kind: 'ticket' | 'note', parent: string, commentId: string, who: NotesUser) {
  const env = makeEnvelope({
    type, workspaceId: fx.WS, entity: { kind, id: parent }, actorId: fx.ids[who], origin: 'web',
    payload: type === 'comment.edited' ? { commentId, body: BODY } : { commentId },
  });
  return checkPermission(env, { db: db.pool, sessionUserId: fx.ids[who] });
}

const refusal = (reason: string) => ({ refused: true, rule: COMMENT_PERMISSION_RULE, reason });

beforeAll(async () => {
  db = await createTestDatabase();
  fx = await seedNotesFixture(db.pool);
});
afterAll(async () => {
  await db.drop();
});

describe('26.042–26.046 who may edit or delete a comment', () => {
  it('26.042 ticket edit: author only; visibility first', async () => {
    const c = await comment('ticket', fx.TP, 'memberIn');
    expect(await gate('comment.edited', 'ticket', fx.TP, c, 'memberIn')).toBeNull(); // control
    expect(await gate('comment.edited', 'ticket', fx.TP, c, 'admin')).toEqual(refusal(COMMENT_EDIT_AUTHOR_REASON));
    expect(await gate('comment.edited', 'ticket', fx.TP, c, 'owner')).toEqual(refusal(COMMENT_EDIT_AUTHOR_REASON));
    expect((await gate('comment.edited', 'ticket', fx.TP, c, 'guestUnlisted'))?.rule).toBe(PERMISSION_VISIBILITY_RULE);
  });

  it('26.043 ticket delete: author, admin, owner; not another member', async () => {
    const byMember = await comment('ticket', fx.TP, 'memberIn');
    for (const who of ['memberIn', 'admin', 'owner'] as const) {
      expect(await gate('comment.deleted', 'ticket', fx.TP, byMember, who), who).toBeNull();
    }
    const byAdmin = await comment('ticket', fx.TP, 'admin');
    expect(await gate('comment.deleted', 'ticket', fx.TP, byAdmin, 'memberIn')).toEqual(refusal(COMMENT_DELETE_AUTHORITY_REASON));
  });

  it('26.044 note comments: the note read rule first, then the same two rules', async () => {
    const c = await comment('note', fx.NOTES.nWorkspace, 'memberIn');
    expect(await gate('comment.edited', 'note', fx.NOTES.nWorkspace, c, 'memberIn')).toBeNull(); // control
    expect(await gate('comment.edited', 'note', fx.NOTES.nWorkspace, c, 'admin')).toEqual(refusal(COMMENT_EDIT_AUTHOR_REASON));
    expect(await gate('comment.deleted', 'note', fx.NOTES.nWorkspace, c, 'owner')).toBeNull();
    expect(await gate('comment.deleted', 'note', fx.NOTES.nWorkspace, c, 'memberOut')).toEqual(refusal(COMMENT_DELETE_AUTHORITY_REASON));
    const onPrivate = await comment('note', fx.NOTES.nPrivate, 'author');
    expect(await gate('comment.edited', 'note', fx.NOTES.nPrivate, onPrivate, 'memberIn')).toMatchObject({ rule: 'permission.note' });
  });

  it('26.045 a deleted comment can be neither edited nor deleted again', async () => {
    const c = await comment('ticket', fx.TP, 'memberIn');
    expect(await gate('comment.edited', 'ticket', fx.TP, c, 'memberIn')).toBeNull(); // control
    await applyCommitted(db.pool, [
      makeCommitted({ workspaceId: fx.WS, actorId: fx.ids.memberIn, entity: { kind: 'ticket', id: fx.TP }, type: 'comment.deleted', payload: { commentId: c } }),
    ]);
    expect(await gate('comment.edited', 'ticket', fx.TP, c, 'memberIn')).toEqual(refusal(COMMENT_ALREADY_DELETED_REASON));
    expect(await gate('comment.deleted', 'ticket', fx.TP, c, 'owner')).toEqual(refusal(COMMENT_ALREADY_DELETED_REASON));
  });

  it('26.046 an unknown id and another parent\'s comment are one answer', async () => {
    const onTE = await comment('ticket', fx.TE, 'owner');
    expect(await gate('comment.edited', 'ticket', fx.TP, newUlid(), 'memberIn')).toEqual(refusal(COMMENT_UNKNOWN_REASON));
    expect(await gate('comment.deleted', 'ticket', fx.TP, onTE, 'owner')).toEqual(refusal(COMMENT_UNKNOWN_REASON));
    expect(await gate('comment.deleted', 'ticket', fx.TE, onTE, 'owner')).toBeNull(); // control: the right parent
  });

  it('26.052 (note arm) a deleted note refuses an edit; restoring it lets the same edit through', async () => {
    const c = await comment('note', fx.NOTES.nProject, 'author');
    const noteEv = (type: string) =>
      makeCommitted({ workspaceId: fx.WS, actorId: fx.ids.author, entity: { kind: 'note', id: fx.NOTES.nProject }, type, payload: {} });
    await applyCommitted(db.pool, [noteEv('note.deleted')]);
    expect(await gate('comment.edited', 'note', fx.NOTES.nProject, c, 'author')).toEqual(refusal(COMMENT_NOTE_DELETED_REASON));
    await applyCommitted(db.pool, [noteEv('note.restored')]);
    expect(await gate('comment.edited', 'note', fx.NOTES.nProject, c, 'author')).toBeNull();
  });
});
```

(`PERMISSION_VISIBILITY_RULE` is exported at `check-permission.ts:53`. If `seedNotesFixture` puts `memberIn` off `TP`'s project, use the fixture's own per-user `canSee` facts from its docblock and swap the cell's person; the rule under test does not change.)

- [ ] **Step 3: Failing door test** (reads, projection, search, deleted ticket, embeds, rebuild). `apps/server/test/routes/comment-edit-delete.test.ts` — the harness is `ticket-comments.test.ts:158-206` (`post` through `POST /v1/events`, asserted committed) and `:268-276` (`found`), copied, plus a `refused` twin:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid } from '@gisik-nokma/domain';
import type { FastifyInstance } from 'fastify';
import { insertAttachment } from '../../src/attachments/attachment-repo.js';
import { buildProjectionRegistry } from '../../src/projections/index.js';
import { verifyProjections } from '../../src/tools/verify-projections.js';
import { buildTestApp } from '../helpers/app.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { signInWithPhone } from '../helpers/session.js';

let db: TestDatabase;
let app: FastifyInstance;
let token = '';
let me = '';
let WS = '';
let PRJ = '';
let TICKET = '';
let OTHER = '';
const doc = (text: string) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] });

type Result = { status: string; rule?: string; reason?: string };
async function send(entity: { kind: string; id: string }, type: string, payload: unknown, id = newUlid()): Promise<Result> {
  const res = await app.inject({
    method: 'POST', url: '/v1/events', headers: { authorization: `Bearer ${token}` },
    payload: { events: [{ id, workspaceId: WS, entity, type, version: 1, payload, actorId: me, origin: 'web', clientTime: new Date().toISOString() }] },
  });
  return res.json<{ results: Result[] }>().results[0]!;
}
async function ok(entity: { kind: string; id: string }, type: string, payload: unknown, id = newUlid()): Promise<string> {
  const r = await send(entity, type, payload, id);
  expect(r.status, `${type}: ${r.rule ?? ''} ${r.reason ?? ''}`).toBe('committed');
  return id;
}
const thread = async (ticketId: string) =>
  (await app.inject({ method: 'GET', url: `/v1/workspaces/${WS}/tickets/${ticketId}/comments`, headers: { authorization: `Bearer ${token}` } }))
    .json<{ comments: Array<{ commentId: string; body: unknown; editedAt: string | null; deletedAt: string | null; files: unknown[] }> }>().comments;
const hits = async (q: string) =>
  (await app.inject({ method: 'GET', url: `/v1/search?workspaceId=${WS}&q=${q}&kinds=ticket`, headers: { authorization: `Bearer ${token}` } }))
    .json<{ hits: Array<{ card: { ticketId: string } }> }>().hits.map((h) => h.card.ticketId);

beforeAll(async () => {
  db = await createTestDatabase();
  const built = buildTestApp(db);
  app = built.app;
  await app.ready();
  const user = await signInWithPhone(app, built.otp, '+919000002604');
  token = user.token;
  me = user.userId;
  const founded = await app.inject({ method: 'POST', url: '/v1/workspaces', headers: { authorization: `Bearer ${token}` }, payload: { name: 'Comment edits' } });
  WS = founded.json<{ workspaceId: string }>().workspaceId;
  PRJ = newUlid();
  await ok({ kind: 'project', id: PRJ }, 'project.created', { name: 'Edits' });
  await ok({ kind: 'project', id: PRJ }, 'project.member_added', { userId: me, projectAdmin: true });
  TICKET = newUlid();
  OTHER = newUlid();
  for (const [id, title] of [[TICKET, 'Edited ticket'], [OTHER, 'Another ticket']] as const) {
    await ok({ kind: 'ticket', id }, 'ticket.created', { typeId: 'task', projectId: PRJ, parentId: null, title });
  }
});
afterAll(async () => {
  await db.drop();
});

describe('26.047–26.053 through the door', () => {
  it('26.047/26.049/26.051 edit and delete: projection, read and search follow', async () => {
    const t = { kind: 'ticket', id: TICKET };
    const first = await ok(t, 'comment.added', { body: doc('walrusfirst') });
    const sibling = await ok(t, 'comment.added', { body: doc('penguinsibling') });
    expect(await hits('walrusfirst')).toEqual([TICKET]); // control: indexed before the edit
    await ok(t, 'comment.edited', { commentId: first, body: doc('narwhalsecond') });
    let rows = await thread(TICKET);
    expect(rows.find((c) => c.commentId === first)).toMatchObject({ body: doc('narwhalsecond'), deletedAt: null });
    expect(rows.find((c) => c.commentId === first)?.editedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(rows.find((c) => c.commentId === sibling)).toMatchObject({ body: doc('penguinsibling'), editedAt: null, deletedAt: null });
    expect(await hits('walrusfirst')).toEqual([]);
    expect(await hits('narwhalsecond')).toEqual([TICKET]);
    await ok(t, 'comment.deleted', { commentId: first });
    rows = await thread(TICKET);
    expect(rows.find((c) => c.commentId === first)).toMatchObject({ body: null, files: [] });
    expect(rows.find((c) => c.commentId === first)?.deletedAt).toMatch(/^\d{4}-/);
    expect(await hits('narwhalsecond')).toEqual([]);
    expect(await hits('penguinsibling')).toEqual([TICKET]); // control: the sibling's text stays
    const { rows: raw } = await db.pool.query('SELECT author_id, body FROM proj_ticket_comments WHERE comment_id = $1', [first]);
    expect(raw[0]).toEqual({ author_id: me, body: null });
  });

  it('26.052 (ticket arm) a deleted ticket refuses an edit; restored, the edit commits', async () => {
    const t = { kind: 'ticket', id: OTHER };
    const c = await ok(t, 'comment.added', { body: doc('before') });
    await ok(t, 'ticket.deleted', {});
    const before = (await db.pool.query('SELECT count(*)::int AS n FROM events')).rows[0].n as number;
    expect(await send(t, 'comment.edited', { commentId: c, body: doc('after') })).toMatchObject({
      status: 'refused', rule: 'deleted-ticket', reason: 'This ticket is deleted; restore it first.',
    });
    expect((await db.pool.query('SELECT count(*)::int AS n FROM events')).rows[0].n).toBe(before);
    await ok(t, 'ticket.restored', {});
    await ok(t, 'comment.edited', { commentId: c, body: doc('after') });
  });

  it('26.053 an edit may embed only this ticket\'s own image', async () => {
    const own = newUlid();
    const foreign = newUlid();
    for (const [id, ticketId] of [[own, TICKET], [foreign, OTHER]] as const) {
      await insertAttachment(db.pool, { id, workspaceId: WS, ticketId, noteId: null, uploaderId: me, filename: 'p.png', mime: 'image/png', size: 4, objectKey: `w/${WS}/a/${id}`, sha256: 'a'.repeat(64) });
    }
    const t = { kind: 'ticket', id: TICKET };
    const c = await ok(t, 'comment.added', { body: doc('pic soon') });
    const withImage = (attachmentId: string) => ({ type: 'doc', content: [{ type: 'image', attrs: { attachmentId, wrap: 'block', alt: '' } }] });
    expect(await send(t, 'comment.edited', { commentId: c, body: withImage(foreign) })).toMatchObject({ status: 'refused', rule: 'attachment.embed-unknown' });
    await ok(t, 'comment.edited', { commentId: c, body: withImage(own) }); // control
  });

  it('26.048 rebuild equals live', async () => {
    for (const table of ['proj_ticket_comments', 'proj_search']) {
      const { rows } = await db.pool.query(`SELECT count(*)::int AS n FROM ${table}`);
      expect(rows[0].n, `${table} empty`).toBeGreaterThan(0); // control
    }
    expect(await verifyProjections({ pool: db.pool, projections: buildProjectionRegistry() })).toEqual({ clean: true, diffs: [] });
  });
});
```

(`insertAttachment`'s exact argument shape is `attachments/attachment-repo.ts:100-115`; pass `noteId: null` only if the type requires it. 26.050 is the same shape against a note: create one with `note.created { title, homeProjectId: '', scope: { mode: 'workspace' } }`, comment, edit, delete, and read `GET /v1/notes/:id/comments` — write it as a fifth `it` in this file.)

- [ ] **Step 4: Failing mention and purge tests.** `apps/server/test/notifications/comment-edit-mentions.test.ts` — the harness is `note-mention-fanout.test.ts:39-107` (`fanout()`, `docMentioning`, `rowsFor`, `commit`, `freshNote`) copied whole, then:

```ts
describe('26.054–26.058 an edit notifies only the mentions it adds', () => {
  const addComment = (kind: 'ticket' | 'note', parent: string, body: unknown, actor = fx.ids.author) =>
    makeCommitted({ workspaceId: fx.WS, actorId: actor, entity: { kind, id: parent }, type: 'comment.added', payload: { body } });
  const editComment = (kind: 'ticket' | 'note', parent: string, commentId: string, body: unknown, actor = fx.ids.author) =>
    makeCommitted({ workspaceId: fx.WS, actorId: actor, entity: { kind, id: parent }, type: 'comment.edited', payload: { commentId, body } });
  const forTicket = async (userId: string, ticketId: string) =>
    (await db.pool.query(`SELECT payload FROM notifications WHERE user_id = $1 AND payload->>'ticketId' = $2 ORDER BY id`, [userId, ticketId])).rows as Array<{ payload: Record<string, unknown> }>;

  it('26.054 ticket comment: only the added mention, anchored on the comment, once', async () => {
    const added = await commit(addComment('ticket', fx.TP, docMentioning([fx.ids.memberIn]), fx.ids.owner));
    expect(await forTicket(fx.ids.memberIn, fx.TP)).toHaveLength(1); // control: the add notified
    const edit = editComment('ticket', fx.TP, added.id, docMentioning([fx.ids.memberIn, fx.ids.admin], 'now both'), fx.ids.owner);
    await commit(edit);
    await fanout().onCommitted(edit); // redelivery
    expect(await forTicket(fx.ids.memberIn, fx.TP)).toHaveLength(1);
    const adminRows = await forTicket(fx.ids.admin, fx.TP);
    expect(adminRows).toHaveLength(1);
    expect(adminRows[0]?.payload).toMatchObject({ eventId: added.id, source: 'comment' });
  });

  it('26.055 / 26.058 note comment: only added mentions; a non-reader gets nothing, a reader beside them does', async () => {
    const noteId = await freshNote({ mode: 'private' });
    const added = await commit(addComment('note', noteId, docMentioning([])));
    await commit(editComment('note', noteId, added.id, docMentioning([fx.ids.memberIn, fx.ids.owner], 'both now')));
    const ownerRows = await rowsFor(fx.ids.owner, noteId);
    expect(ownerRows).toHaveLength(1); // control: a reader is notified
    expect(ownerRows[0]?.payload).toMatchObject({ eventId: added.id, source: 'note-comment' });
    expect(await rowsFor(fx.ids.memberIn, noteId), 'a private note must not out-leak through an edit').toHaveLength(0);
    expect(logged.join('\n')).not.toContain(fx.ids.memberIn);
  });

  it('26.056 a description still notifies every mention it carries', async () => {
    const fieldSet = (body: unknown) =>
      makeCommitted({ workspaceId: fx.WS, actorId: fx.ids.owner, entity: { kind: 'ticket', id: fx.TP }, type: 'ticket.field_set', payload: { fieldId: 'description', value: body } });
    const before = (await forTicket(fx.ids.admin, fx.TP)).length;
    await commit(fieldSet(docMentioning([fx.ids.admin], 'desc one')));
    await commit(fieldSet(docMentioning([fx.ids.admin], 'desc two')));
    expect((await forTicket(fx.ids.admin, fx.TP)).length).toBe(before + 2);
  });
});
```

`apps/server/test/purge/purge-comment-edits.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid } from '@gisik-nokma/domain';
import { buildProjectionRegistry } from '../../src/projections/index.js';
import { purgeItem } from '../../src/purge/purge-item.js';
import { applyCommitted, resetEntitySeqs } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { scan } from './scan.js';
import { doc, dueAt, ev, newMarker, projectCreated, recordingStore, seedWorkspace, text, ticketCreated } from './world.js';

let db: TestDatabase;
beforeAll(async () => {
  db = await createTestDatabase();
  resetEntitySeqs();
}, 60_000);
afterAll(async () => {
  await db.drop();
});

describe('26.059 purge takes a comment\'s edits and deletion with its ticket', () => {
  it('26.059 no edited text survives; the sibling is whole', async () => {
    const base = await seedWorkspace(db.pool);
    const marker = newMarker();
    const P = newUlid();
    const T = newUlid();
    const S = newUlid();
    const cT = newUlid();
    const cS = newUlid();
    await applyCommitted(db.pool, [
      projectCreated(base, P, 'Edits', 'ED'),
      ticketCreated(base, T, P, 'Purged'),
      ticketCreated(base, S, P, 'Sibling'),
      { ...ev(base, 'ticket', T, 'comment.added', { body: doc(text('first')) }), id: cT },
      ev(base, 'ticket', T, 'comment.edited', { commentId: cT, body: doc(text(`edited ${marker}`)) }),
      ev(base, 'ticket', T, 'comment.deleted', { commentId: cT }),
      { ...ev(base, 'ticket', S, 'comment.added', { body: doc(text('sibling first')) }), id: cS },
      ev(base, 'ticket', S, 'comment.edited', { commentId: cS, body: doc(text('sibling edited')) }),
    ]);
    await applyCommitted(db.pool, [ev(base, 'ticket', T, 'ticket.deleted', {}), ev(base, 'ticket', T, 'purge.marked', {})]);
    await purgeItem(db.pool, { kind: 'ticket', id: T }, { projections: buildProjectionRegistry(), store: recordingStore(), now: await dueAt(db.pool, 'ticket', T) });
    expect(await scan(db.pool, marker)).toEqual([]);
    const { rows } = await db.pool.query(`SELECT count(*)::int AS n FROM events WHERE entity_id = $1 AND type IN ('comment.edited', 'comment.deleted')`, [T]);
    expect(rows[0].n).toBe(0);
    const sibling = await db.pool.query('SELECT body, edited_at FROM proj_ticket_comments WHERE comment_id = $1', [cS]);
    expect(sibling.rows[0]?.body).toEqual(doc(text('sibling edited'))); // control
  });
});
```

(Read `purge/scan.ts` for `scan`'s exact signature and `world.ts:18-28` for whether `ev` accepts an id override; if not, read the id back from `ev(...)`'s return value before applying, which is how `comment.added`'s id becomes the `commentId`.)

Bootstrap (26.057): in `apps/server/test/sync/bootstrap.test.ts:435-442` add `'comment.edited'` and `'comment.deleted'` to the hardcoded backfill list, and add one `it('26.057 …')` beside 12.115 that files `comment.added` then `comment.edited` BELOW a snapshot (copy 12.115's below-snapshot setup) and asserts both appear in the bootstrap tail.

- [ ] **Step 5: Run them to see them fail.**

```bash
pnpm --filter @gisik-nokma/domain exec vitest run test/comment-events.test.ts > /tmp/mcpe-t2-d.log 2>&1; tail -20 /tmp/mcpe-t2-d.log
pnpm turbo run build --filter=@gisik-nokma/domain > /tmp/mcpe-t2-b.log 2>&1; tail -5 /tmp/mcpe-t2-b.log
pnpm --filter @gisik-nokma/server exec vitest run test/permissions/check-comment-authority.test.ts test/routes/comment-edit-delete.test.ts test/notifications/comment-edit-mentions.test.ts test/purge/purge-comment-edits.test.ts test/sync/bootstrap.test.ts > /tmp/mcpe-t2-s.log 2>&1; tail -40 /tmp/mcpe-t2-s.log
```

Expected: FAIL (exports missing, unregistered types refused as `unknown-type`).

- [ ] **Step 6: Implement — domain.** `ticket-events.ts`, after `commentAddedPayload`:

```ts
/**
 * `comment.edited` — the AUTHOR replaces a comment's body (MCP-everything spec §6, M-E9). Filed against
 * the comment's PARENT (ticket or note), never a comment entity: a comment is a claim on its parent's
 * history, as `comment.added` is. `commentId` is that `comment.added` event's id — a comment's only identity.
 */
export const commentEditedPayload = z.object({ commentId: ulidString, body: z.record(z.string(), z.unknown()) }).strict();
/** `comment.deleted` — author, or workspace owner/admin. The body leaves every view; the ledger keeps it (spec §6). */
export const commentDeletedPayload = z.object({ commentId: ulidString }).strict();
export const COMMENT_EVENT_TYPES = ['comment.added', 'comment.edited', 'comment.deleted'] as const;
export function isCommentEvent(type: string): boolean {
  return (COMMENT_EVENT_TYPES as readonly string[]).includes(type);
}
```

`vocabulary.ts`, after the `comment.added` registration (import the two payloads):

```ts
domainRegistry.register({ type: 'comment.edited', version: 1, entityKind: ['ticket', 'note'], payloadSchema: commentEditedPayload });
domainRegistry.register({ type: 'comment.deleted', version: 1, entityKind: ['ticket', 'note'], payloadSchema: commentDeletedPayload });
```

`note-state.ts`: append `'comment.edited', 'comment.deleted'` to `NOTE_EVENT_TYPES`, and make the reducer's `case 'comment.added':` read `case 'comment.added': case 'comment.edited': case 'comment.deleted':` with the comment "Legal on a live note and moves nothing: the comment rows live in `proj_note_comments`." `read-models.ts:897`:

```ts
export type NoteComment = {
  commentId: string;
  authorId: string;
  /** `null` once the comment is deleted (spec §6): the placeholder keeps the author and time, never the text. */
  body: unknown;
  recordedAt: string;
  editedAt: string | null;
  deletedAt: string | null;
};
```

- [ ] **Step 7: Implement — migration.** `apps/server/migrations/1791300000000_comment-edit-delete.sql`:

```sql
-- Up Migration

-- MCP-everything T2 (spec §6, M-E9): comment edit and delete, for ticket and note comments alike.
-- A deleted row KEEPS comment_id, author_id and recorded_at — the "Comment deleted" placeholder shows
-- who and when — and loses its body, so `body` becomes nullable. All four new columns are filled only
-- by `comment.edited` / `comment.deleted` (projections/ticket-comments.ts) and rebuild from the ledger.
ALTER TABLE proj_ticket_comments ALTER COLUMN body DROP NOT NULL;
ALTER TABLE proj_ticket_comments
  ADD COLUMN edited_at timestamptz NULL,
  ADD COLUMN edited_by text NULL,
  ADD COLUMN deleted_at timestamptz NULL,
  ADD COLUMN deleted_by text NULL;
ALTER TABLE proj_note_comments ALTER COLUMN body DROP NOT NULL;
ALTER TABLE proj_note_comments
  ADD COLUMN edited_at timestamptz NULL,
  ADD COLUMN edited_by text NULL,
  ADD COLUMN deleted_at timestamptz NULL,
  ADD COLUMN deleted_by text NULL;
COMMENT ON COLUMN proj_ticket_comments.edited_at IS 'serverTime of the latest comment.edited; NULL = never edited.';
COMMENT ON COLUMN proj_ticket_comments.deleted_at IS 'serverTime of comment.deleted; the body is NULL from then on (the ledger keeps it).';
COMMENT ON COLUMN proj_note_comments.edited_at IS 'serverTime of the latest comment.edited; NULL = never edited.';
COMMENT ON COLUMN proj_note_comments.deleted_at IS 'serverTime of comment.deleted; the body is NULL from then on (the ledger keeps it).';

-- Down Migration

UPDATE proj_ticket_comments SET body = '{"type":"doc","content":[{"type":"paragraph"}]}'::jsonb WHERE body IS NULL;
ALTER TABLE proj_ticket_comments DROP COLUMN edited_at, DROP COLUMN edited_by, DROP COLUMN deleted_at, DROP COLUMN deleted_by;
ALTER TABLE proj_ticket_comments ALTER COLUMN body SET NOT NULL;
UPDATE proj_note_comments SET body = '{"type":"doc","content":[{"type":"paragraph"}]}'::jsonb WHERE body IS NULL;
ALTER TABLE proj_note_comments DROP COLUMN edited_at, DROP COLUMN edited_by, DROP COLUMN deleted_at, DROP COLUMN deleted_by;
ALTER TABLE proj_note_comments ALTER COLUMN body SET NOT NULL;
```

- [ ] **Step 8: Implement — projection.** `projections/ticket-comments.ts` `apply` becomes:

```ts
  async apply(event: LedgerEvent, tx: PoolClient): Promise<void> {
    if (!isCommentEvent(event.type)) return;
    if (event.entity.kind !== 'ticket' && event.entity.kind !== 'note') return;
    const table = event.entity.kind === 'note' ? 'proj_note_comments' : 'proj_ticket_comments';
    const parent = event.entity.kind === 'note' ? 'note_id' : 'ticket_id';

    if (event.type === 'comment.edited') {
      const p = commentEditedPayload.parse(event.payload);
      // `deleted_at IS NULL`: the permission gate refuses an edit of a deleted comment, so this guard
      // never fires live; it keeps a REPLAY of a hand-ordered ledger from resurrecting deleted text.
      await tx.query(
        `UPDATE ${table} SET body = $3, edited_at = $4, edited_by = $5
          WHERE comment_id = $1 AND ${parent} = $2 AND deleted_at IS NULL`,
        [p.commentId, event.entity.id, JSON.stringify(p.body), event.serverTime, event.actorId],
      );
      return;
    }
    if (event.type === 'comment.deleted') {
      const p = commentDeletedPayload.parse(event.payload);
      await tx.query(
        `UPDATE ${table} SET body = NULL, deleted_at = $3, deleted_by = $4
          WHERE comment_id = $1 AND ${parent} = $2 AND deleted_at IS NULL`,
        [p.commentId, event.entity.id, event.serverTime, event.actorId],
      );
      return;
    }
    // …the existing `comment.added` INSERT, unchanged.
```

`projections/notes.ts:269` and `projections/note-search.ts:135`: `if (event.type === 'comment.added') return;` → `if (isCommentEvent(event.type)) return;` (import from `@gisik-nokma/domain`), with the existing comment amended to "comment events".

`projections/search.ts`, after the `comment.added` branch:

```ts
    if (event.type === 'comment.edited' || event.type === 'comment.deleted') {
      // RE-DERIVED from the ledger up to THIS event's seq, so a rebuild (canonical replay order) and the
      // live ingest compute the same text at every step (case 26.048). Appending, as `comment.added`
      // does, cannot express "replace" or "remove".
      await tx.query('UPDATE proj_search SET comments = $2 WHERE ticket_id = $1', [
        event.entity.id,
        await ticketCommentText(tx, event.entity.id, event.seq),
      ]);
    }
```

and at the bottom of the file:

```ts
/** The ticket's live comment text, oldest first, one line per non-empty comment — what `comment.added`'s appends build. */
async function ticketCommentText(tx: PoolClient, ticketId: string, uptoSeq: number): Promise<string> {
  const { rows } = await tx.query<{ id: string; type: string; payload: { body?: unknown; commentId?: string } }>(
    `SELECT id, type, payload FROM events
      WHERE entity_kind = 'ticket' AND entity_id = $1 AND seq <= $2
        AND type IN ('comment.added', 'comment.edited', 'comment.deleted')
      ORDER BY seq`,
    [ticketId, uptoSeq],
  );
  const bodies = new Map<string, unknown>();
  for (const row of rows) {
    if (row.type === 'comment.added') bodies.set(row.id, row.payload.body ?? null);
    else if (row.type === 'comment.edited' && row.payload.commentId !== undefined && bodies.has(row.payload.commentId)) {
      bodies.set(row.payload.commentId, row.payload.body ?? null);
    } else if (row.type === 'comment.deleted' && row.payload.commentId !== undefined) bodies.delete(row.payload.commentId);
  }
  const live = [...bodies.values()];
  const isPurged = await purgedResolverFor(tx, live);
  return live.map((body) => docToPlainText(body, { isPurged })).filter((t) => t.length > 0).join('\n');
}
```

- [ ] **Step 9: Implement — permission.** `apps/server/src/permissions/check-comment-authority.ts`:

```ts
import { commentDeletedPayload, commentEditedPayload, type EventEnvelope } from '@gisik-nokma/domain';
import type { Refusal } from '@gisik-nokma/rule-engine';
import type { VisibilityContext } from './check-permission.js';

export const COMMENT_PERMISSION_RULE = 'permission.comment';
export const COMMENT_UNKNOWN_REASON = 'That comment is not on this ticket or note.';
export const COMMENT_ALREADY_DELETED_REASON = 'This comment has been deleted.';
export const COMMENT_EDIT_AUTHOR_REASON = 'Only the person who wrote a comment can edit it.';
export const COMMENT_DELETE_AUTHORITY_REASON =
  'Only the person who wrote a comment, or a workspace owner or admin, can delete it.';
export const COMMENT_NOTE_DELETED_REASON = 'This note is deleted; restore it first.';

const refuse = (reason: string): Refusal => ({ refused: true, rule: COMMENT_PERMISSION_RULE, reason });

/**
 * Who may edit or delete a comment (MCP-everything spec §6, M-E9). Runs LAST in `checkPermission`, after
 * the parent's own audience questions (`checkVisibilityPermission` for a ticket, `checkNotePermission` for a
 * note), so a person who cannot see the parent is told THAT and never learns whether a comment id exists.
 *
 * The comment is looked up by id AND parent: an id from another ticket or note is the same answer as an id
 * that names nothing (case 26.046). A deleted TICKET is the rule engine's live gate (`deleted-ticket`); a
 * deleted NOTE has no engine gate for comment events (the notes projection never folds them), so it is here.
 */
export async function checkCommentAuthority(env: EventEnvelope, ctx: VisibilityContext): Promise<Refusal | null> {
  if (env.type !== 'comment.edited' && env.type !== 'comment.deleted') return null;
  if (env.entity.kind !== 'ticket' && env.entity.kind !== 'note') return refuse(COMMENT_UNKNOWN_REASON);
  const { commentId } = (env.type === 'comment.edited' ? commentEditedPayload : commentDeletedPayload).parse(env.payload);
  const table = env.entity.kind === 'note' ? 'proj_note_comments' : 'proj_ticket_comments';
  const parent = env.entity.kind === 'note' ? 'note_id' : 'ticket_id';
  const { rows } = await ctx.db.query<{ author_id: string; deleted_at: Date | null }>(
    `SELECT author_id, deleted_at FROM ${table} WHERE comment_id = $1 AND ${parent} = $2`,
    [commentId, env.entity.id],
  );
  const row = rows[0];
  if (row === undefined) return refuse(COMMENT_UNKNOWN_REASON);
  if (env.entity.kind === 'note') {
    const note = await ctx.db.query<{ deleted: boolean }>('SELECT deleted FROM proj_notes WHERE note_id = $1', [env.entity.id]);
    if (note.rows[0]?.deleted === true) return refuse(COMMENT_NOTE_DELETED_REASON);
  }
  if (row.deleted_at !== null) return refuse(COMMENT_ALREADY_DELETED_REASON);
  const isAuthor = row.author_id === ctx.sessionUserId;
  if (env.type === 'comment.edited') return isAuthor ? null : refuse(COMMENT_EDIT_AUTHOR_REASON);
  const role = ctx.eff.workspaceRole;
  return isAuthor || role === 'owner' || role === 'admin' ? null : refuse(COMMENT_DELETE_AUTHORITY_REASON);
}
```

`check-permission.ts`, the last line of `checkPermission` (`return checkVisibilityPermission(env, permissionContext);`) becomes:

```ts
  const visibilityRefusal = await checkVisibilityPermission(env, permissionContext);
  if (visibilityRefusal !== null) {
    return visibilityRefusal;
  }
  // LAST: the comment's own author/admin question (MCP-everything T2), after every audience question,
  // so it can never answer for a parent the person cannot see (`check-comment-authority.ts`).
  return checkCommentAuthority(env, permissionContext);
```

- [ ] **Step 10: Implement — reads.** `read/ticket-comments.ts`: `DbRow` gains `edited_at: Date | null; deleted_at: Date | null`, the SELECT reads `comment_id, author_id, body, recorded_at, edited_at, deleted_at`, `TicketCommentRow` gains `editedAt: string | null; deletedAt: string | null`, and the mapper adds `editedAt: row.edited_at?.toISOString() ?? null, deletedAt: row.deleted_at?.toISOString() ?? null` (files come from `collectImageAttachmentIds(row.body)`, which answers `[]` for `null`). `routes/tickets.ts` (the comments route's map, `:978-994`) adds `editedAt: comment.editedAt, deletedAt: comment.deletedAt`. `read/notes.ts` `listNoteComments` does the same two columns and fields.

- [ ] **Step 11: Implement — mentions.** `fanout.ts`:

```ts
  async function handleMentions(
    env: EventEnvelope,
    doc: unknown,
    source: 'comment' | 'description',
    previous: unknown = null,
    anchorId: string = env.id,
  ): Promise<void> {
    const before = new Set(previous === null ? [] : extractMentionedUserIds(previous));
    const mentioned = extractMentionedUserIds(doc).filter((userId) => !before.has(userId));
    // …unchanged from here, except the payload's `eventId: env.id` becomes `eventId: anchorId`
    // (the dedupe key stays `mention:${env.id}:${userId}`, so an edit's rows never collide with the add's).
```

`handleNoteMentions` gains the same trailing `anchorId: string = env.id` and its payload `eventId: anchorId`. Beside `previousBodyOf`:

```ts
  /**
   * The body a comment carried just BEFORE this edit: its `comment.added`, or its latest earlier
   * `comment.edited` — strictly below this event's seq, in the parent's own stream, so a replayed
   * fan-out compares against the version the edit replaced (the `note.body_set` rule, spec §6).
   */
  async function previousCommentBodyOf(env: EventEnvelope, commentId: string): Promise<unknown> {
    const { rows } = await deps.pool.query<{ body: unknown }>(
      `SELECT payload -> 'body' AS body FROM events
        WHERE entity_kind = $1 AND entity_id = $2 AND seq < $3
          AND ((type = 'comment.added' AND id = $4) OR (type = 'comment.edited' AND payload ->> 'commentId' = $4))
        ORDER BY seq DESC LIMIT 1`,
      [env.entity.kind, env.entity.id, env.seq, commentId],
    );
    return rows[0]?.body ?? null;
  }
```

and the dispatch (`:337-341`):

```ts
        } else if (env.type === 'comment.added' || env.type === 'comment.edited') {
          const parsed = commentPayloadSchema.safeParse(env.payload);
          if (!parsed.success) return;
          const commentId = env.type === 'comment.edited' ? String((env.payload as { commentId?: unknown }).commentId) : null;
          const previous = commentId === null ? null : await previousCommentBodyOf(env, commentId);
          const anchor = commentId ?? env.id;
          if (env.entity.kind === 'note') await handleNoteMentions(env, parsed.data.body, previous, 'note-comment', anchor);
          else await handleMentions(env, parsed.data.body, 'comment', previous, anchor);
```

Amend `handleNoteMentions`' docblock sentence "Comments are never edited, so their `previous` is `null`" → "A comment's `previous` is `null` on `comment.added` and its prior body on `comment.edited`."

- [ ] **Step 12: Implement — embeds and sync.** `gates/image-embed-gate.ts`, a third gate in `makeImageEmbedGates()`:

```ts
    {
      // An edit is a new document for the same comment: held to the same rule as the comment it replaces.
      eventType: 'comment.edited',
      async check(event, db) {
        const payload = event.payload as { body?: unknown };
        return checkDocEmbeds(payload.body ?? null, event.entity.id, db);
      },
    },
```

`sync/sync-routes.ts` `BOOTSTRAP_BACKFILL_TYPES`: add `'comment.edited', 'comment.deleted'` after `'comment.added'`, and correct the docblock's arithmetic sentence to name seven backfill types.

- [ ] **Step 13: Run to pass, then the battery.**

```bash
pnpm turbo run build --filter=@gisik-nokma/server... > /tmp/mcpe-t2-b.log 2>&1; tail -5 /tmp/mcpe-t2-b.log
pnpm --filter @gisik-nokma/domain exec vitest run > /tmp/mcpe-t2-d.log 2>&1; tail -10 /tmp/mcpe-t2-d.log
pnpm --filter @gisik-nokma/server exec vitest run > /tmp/mcpe-t2-s.log 2>&1; tail -20 /tmp/mcpe-t2-s.log
pnpm --filter @gisik-nokma/sync-client exec vitest run > /tmp/mcpe-t2-sc.log 2>&1; tail -10 /tmp/mcpe-t2-sc.log
pnpm --filter @gisik-nokma/domain typecheck && pnpm --filter @gisik-nokma/server typecheck > /tmp/mcpe-t2-tc.log 2>&1; tail -10 /tmp/mcpe-t2-tc.log
pnpm check:migrations > /tmp/mcpe-t2-m.log 2>&1; tail -5 /tmp/mcpe-t2-m.log
git ls-tree --name-only origin/release/neo-refresh apps/server/migrations/ | tail -1
```

Mutations (each reddens its case, then revert): allow admins to edit (26.042); skip `checkCommentAuthority` for notes (26.044); look the comment up by id alone (26.046); `DELETE` on `comment.deleted` (26.047); leave `proj_search` alone on edit (26.051); `previous: null` for edits (26.054).

- [ ] **Step 14: Catalogue + commit.** Flip 26.040–26.059 ✅. Features.md §23 bullet:

```markdown
- ⚙️ **Comments can be edited and deleted — the events and the server** (MCP-everything T2; `packages/domain/src/events/ticket-events.ts`, `apps/server/src/permissions/check-comment-authority.ts`, `projections/ticket-comments.ts`, migration `1791300000000_comment-edit-delete.sql`) — `comment.edited {commentId, body}` and `comment.deleted {commentId}`, filed against the comment's ticket or note. Only the author edits; the author or a workspace owner/admin deletes; a deleted comment is final; a comment on a deleted ticket or note cannot be changed until it is restored. A deleted comment keeps its id, author and time ("Comment deleted") and loses its text in every product view and in ticket search; the event log keeps it, as do mention notifications already delivered and the raw ledger reads (owner question Q4). An edit notifies only the mentions it ADDS, only people who can read the parent, anchored on the comment. Purge takes edits with their parent. Cases 26.040–26.059.
```

```bash
git branch --show-current   # task/mcp-e-2-comment-events
git add packages/domain apps/server test-cases/26-comments-and-markdown.md Features.md
git commit -m "MCP everything 2: comment.edited / comment.deleted — permission, projection, reads, mentions, search (26.040-26.059)"
git push -u origin task/mcp-e-2-comment-events
```

DONE line: `DONE task/mcp-e-2-comment-events <sha40>`.

---

### Task 3: MCP plumbing — bytes both ways, image replies, the `/mcp` body limit, the preview helper, and conflict-free registration

**Lane:** `task/mcp-e-3-plumbing` off `origin/release/mcp-everything`. Root; parallel with T1 and T2. Every later MCP lane builds on this and edits none of its lines except its own fixture block.

**Files:**
- Modify: `packages/mcp-server/src/http-client.ts` (whole file, 68 lines), `session.ts:6-14`, `:63-68`, `lazy-session.ts:61-76`, `src/tools/submit.ts:62-68` (`envelopeFor`'s entity kind), `src/tools/register.ts:1-19`, `:54-80`
- Modify: `apps/server/src/mcp/in-process-fetch.ts:14-54`, `apps/server/src/routes/mcp-http.ts:43`
- Create: `packages/mcp-server/src/tools/reply.ts`, `src/tools/preview.ts`, `src/tools/reads.ts`, `apps/server/test/mcp/helpers/door-matrix.ts`, and the eight empty factories `src/tools/comment-tools.ts`, `note-tools.ts`, `attachment-tools.ts`, `ticket-tools.ts`, `discovery-tools.ts`, `member-admin-tools.ts`, `definition-admin-tools.ts`, `trash-tools.ts`
- Create: `packages/mcp-server/test/fixtures/tool-names.ts`, `test/fixtures/tool-sweep.ts`, `test/fixtures/fake-session.ts`
- Modify (tests): `packages/mcp-server/test/register.test.ts:21-101`, `:282-316`, `test/exports.test.ts:21-49`, the seven `Session` literals in `test/{workspace-tools,lazy-session,write-tools,project-tools,read-tools}.test.ts`, `apps/server/test/mcp/mcp-http.test.ts:169-194`, `apps/server/test/mcp/mcp-remote-e2e.test.ts:104-112`
- Test (new): `packages/mcp-server/test/plumbing.test.ts`, `apps/server/test/mcp/mcp-bytes.test.ts`, `apps/server/test/mcp/door-matrix.test.ts`
- Catalogue: `test-cases/14-mcp-server.md` `### T3 — plumbing`, `Features.md` §14

**Interfaces:**
- Produces:
  - `type FileBytes = { name: string; bytes: Uint8Array }`; `type DownloadedBytes = { bytes: Uint8Array; contentType: string; filename: string | null }`
  - `GisikClient` gains `getBytes(path: string, token: string): Promise<DownloadedBytes>` and `postMultipart(path: string, fields: Record<string, string>, file: FileBytes, token: string): Promise<unknown>`; `encodeMultipart(fields: Record<string, string>, file: FileBytes, boundary: string): Uint8Array` (exported).
  - `Session` gains `getBytes(path: string): Promise<DownloadedBytes>` and `postMultipart(path: string, fields: Record<string, string>, file: FileBytes): Promise<unknown>` — in `createSession` (re-auth once on 401), `lazySession` and `hostedSession`.
  - `class ToolReply { constructor(readonly content: ContentBlock[]) }`, `type ContentBlock = { type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string }` (`tools/reply.ts`); `registerTools` returns `{ content: reply.content }` for a `ToolReply` and the JSON text block for anything else.
  - `type Preview = { preview: true; wouldChange: string; counts: Record<string, number>; nothingChanged: true; confirm: string }`; `confirmOrPreview(expected: string, given: string | undefined, describe: () => Promise<{ sentence: string; counts?: Record<string, number> }>): Promise<Preview | null>` (`tools/preview.ts`) — `null` means "confirmed, go ahead".
  - `envelopeFor(session, workspaceId, entity: { kind: EntityKind; id: string }, type, payload)` (any domain entity kind).
  - `MCP_BODY_LIMIT_BYTES = 16 * 1024 * 1024` (exported from `routes/mcp-http.ts`).
  - Empty factories `commentTools`, `noteTools`, `attachmentTools`, `ticketTools`, `discoveryTools`, `memberAdminTools`, `definitionAdminTools`, `trashTools`, each `(session: Session) => ToolDefinition[]`, already composed into `allTools` in the FINAL order.
  - `registerToolDefinitions(server: McpServer, session: LazySession, tools: ToolDefinition[], hooks?: RegisterHooks): void` (exported from `register.ts`; `registerTools` = `registerToolDefinitions(server, session, allTools(session), hooks)`), so a test can register a fake `ToolDefinition` through the REAL loop.
  - `tools/reads.ts`: `readOrNotFound(session: Session, path: string, thing: string): Promise<unknown>` (a 404 becomes `<thing> not found or not visible to you`); `page<T>(items: readonly T[], cursor: string | undefined, limit: number | undefined): { items: T[]; nextCursor: string | null }` (default 50, max 200, opaque offset cursor); `pageArgs = { cursor, limit }` (zod raw shape every list tool spreads); `pageField(body: Record<string, unknown>, key: string, cursor, limit): Record<string, unknown>` (pages the array under `key`, adds `nextCursor`).
  - Test helper `apps/server/test/mcp/helpers/door-matrix.ts`: `buildDoorWorld(db: TestDatabase, phoneTail: string): Promise<DoorWorld>`, `callTool(app, token, name, args)`, `runDoorMatrix(world: DoorWorld, rows: DoorRow[]): Promise<void>`, `type DoorRow = { tool: string; args: (w: DoorWorld) => Record<string, unknown>; stranger: string | { json: unknown }; forbidden?: { text: string }; allowed?: { caller: 'owner' | 'member'; eventType?: string } }` — spec §8's three callers for every tool (T6–T12 each add one table).
  - Test fixtures: `TOOL_NAMES_BY_MODULE`, `TOOL_NAMES` (`test/fixtures/tool-names.ts`); `SWEEP: Record<string, { args: Record<string, unknown>; session?: Partial<Session> }>` (`test/fixtures/tool-sweep.ts`); `NO_TRANSFER: Pick<Session, 'getBytes' | 'postMultipart'>` (`test/fixtures/fake-session.ts`).

Cases (`### T3 — plumbing`):

```markdown
- ❌ **14.360 — `encodeMultipart` writes every field part BEFORE the file part, the file's bytes byte-identical (including bytes that are not UTF-8), and a filename's `"`, CR and LF replaced so a name cannot break the header;** control: a plain name passes through. Mutation: write the file part first → the order assertion fails.
- ❌ **14.361 — through the HOSTED in-process door, `postMultipart('/v1/attachments', {ticketId}, png)` uploads (201, sniffed `image/png`) and `getBytes('/v1/attachments/:id')` returns the SAME bytes;** control: the JSON `get` still works on the same session. Mutation: keep `inProcessFetch` string-only → the upload answers 400 "a multipart file part is required".
- ❌ **14.362 — `confirmOrPreview` answers `null` only for the exact name; a missing, case-changed or trailing-space name answers a preview (`preview: true`, `nothingChanged: true`, `confirm: 'confirm_name must be "Corner Shop"'`) and calls `describe` once** (Review Focus 5); control: the exact name never calls `describe`. Mutation: `trim()` before comparing → the trailing-space case answers `null`.
- ❌ **14.363 — a `ToolDefinition` whose handler answers a `ToolReply` with an image block, registered through the REAL loop (`registerToolDefinitions`), reaches a REAL MCP client as an `image` content item (`data`, `mimeType`); a handler answering a plain object is still ONE JSON text block;** control: the plain-object tool in the same server. Mutation: `JSON.stringify` every answer in the loop → the image arrives as text.
- ❌ **14.368 — `page` slices from an opaque offset cursor, defaults to 50 and caps at 200, answers `nextCursor: null` on the last page, and refuses a cursor it did not give out;** control: 120 items → 50/50/20. Mutation: no cap → a 500-limit call answers 500.
- ❌ **14.369 — `readOrNotFound` turns a 404 into `<thing> not found or not visible to you` and rethrows anything else untouched;** control: a 200 passes through. Mutation: map every error → a 500 reads as not-found.
- ❌ **14.370 — `runDoorMatrix` over three EXISTING tools (`get_project` read, `rename_workspace` write, `archive_project` confirm) passes: the stranger's exact sentence, the member's verbatim refusal, the owner's event with `origin: 'mcp'`;** control: a row expecting the wrong stranger text fails the helper (asserted with `rejects`). Mutation: compare with `toContain` → the wrong-text control passes.
- ❌ **14.364 — `POST /mcp` accepts a 12 MB JSON body (no 413) and refuses one over 16 MiB with 413;** control: a small body is unchanged. Mutation: drop `bodyLimit` → the 12 MB call answers 413.
- ❌ **14.365 — the stdio session's `getBytes` and `postMultipart` re-authenticate ONCE on 401, like `get`, and a 403 is thrown without a login;** control: `get`'s 14.300 cases stay green. Mutation: call the client without `withReauth` → the 401 case throws.
- ❌ **14.366 — the tool list is pinned ONCE (`test/fixtures/tool-names.ts`, one block per module, in `allTools` order); `register.test.ts` and `exports.test.ts` read it; the hosted `tools/list` (`mcp-http.test.ts` 14.262, `mcp-remote-e2e.test.ts`) equals `allTools(stub)` in order;** control: the 24 names of today, unchanged. Mutation: drop a tool from a factory → 14.80 and 14.262 both redden.
- ❌ **14.367 — `envelopeFor` takes any domain entity kind (`note`, `workflow`, `ticket-type`, `invite`, `group`) and its envelope passes `parseEvent`;** control: `ticket` unchanged. Mutation: keep the three-kind union → the typecheck of T6+ fails (recorded as the reason, not a runtime case).
```

- [ ] **Step 1: Failing package tests.** `packages/mcp-server/test/plumbing.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { domainRegistry, parseEvent } from '@gisik-nokma/domain';
import { encodeMultipart, HttpError, type GisikClient } from '../src/http-client.js';
import { createSession } from '../src/session.js';
import { lazySession } from '../src/lazy-session.js';
import { confirmOrPreview } from '../src/tools/preview.js';
import { ToolReply } from '../src/tools/reply.js';
import { registerToolDefinitions } from '../src/tools/register.js';
import { page, readOrNotFound } from '../src/tools/reads.js';
import type { ToolDefinition } from '../src/tools/read-tools.js';
import { envelopeFor } from '../src/tools/submit.js';
import { NO_TRANSFER } from './fixtures/fake-session.js';

const dec = new TextDecoder();

describe('14.360–14.367 plumbing', () => {
  it('14.360 fields first, the file byte-identical, header-breaking characters replaced', () => {
    const bytes = new Uint8Array([0x89, 0x50, 0xff, 0x00, 0x0d, 0x0a]);
    const body = encodeMultipart({ ticketId: 'T1' }, { name: 'a"b\r\nc.png', bytes }, 'BOUNDARY');
    const text = dec.decode(body);
    expect(text.indexOf('name="ticketId"')).toBeLessThan(text.indexOf('name="file"'));
    expect(text).toContain('filename="a_b__c.png"');
    const head = new TextEncoder().encode('Content-Type: application/octet-stream\r\n\r\n');
    const start = indexOf(body, head) + head.length;
    expect([...body.slice(start, start + bytes.length)]).toEqual([...bytes]);
    expect(dec.decode(encodeMultipart({}, { name: 'plain.png', bytes }, 'B'))).toContain('filename="plain.png"'); // control
  });

  it('14.362 only the exact name confirms; anything else is a preview and describes once', async () => {
    let described = 0;
    const describe = async () => ((described += 1), { sentence: 'Renames 12 ticket keys.', counts: { ticketKeys: 12 } });
    expect(await confirmOrPreview('Corner Shop', 'Corner Shop', describe)).toBeNull(); // control
    expect(described).toBe(0);
    for (const given of [undefined, 'corner shop', 'Corner Shop ']) {
      expect(await confirmOrPreview('Corner Shop', given, describe)).toEqual({
        preview: true,
        wouldChange: 'Renames 12 ticket keys.',
        counts: { ticketKeys: 12 },
        nothingChanged: true,
        confirm: 'confirm_name must be "Corner Shop"',
      });
    }
    expect(described).toBe(3);
  });

  it('14.363 a ToolReply image goes through the REAL registration loop as an image; a plain answer stays one JSON text block', async () => {
    const session = lazySession(async () => ({
      userId: () => 'u', get: async () => ({}), post: async () => ({}), postEvents: async () => ({}), ...NO_TRANSFER,
    }));
    const tools: ToolDefinition[] = [
      { name: 'picture', description: 'test', inputSchema: {}, handler: async () => new ToolReply([{ type: 'image', data: 'iVBORw0KGgo=', mimeType: 'image/png' }]) },
      { name: 'plain', description: 'test', inputSchema: {}, handler: async () => ({ ok: true }) },
    ];
    const server = new McpServer({ name: 't', version: '0' });
    registerToolDefinitions(server, session, tools);
    const client = new Client({ name: 'c', version: '0' });
    const [a, b] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(b), client.connect(a)]);
    expect((await client.callTool({ name: 'picture', arguments: {} })).content).toEqual([{ type: 'image', data: 'iVBORw0KGgo=', mimeType: 'image/png' }]);
    expect((await client.callTool({ name: 'plain', arguments: {} })).content).toEqual([{ type: 'text', text: JSON.stringify({ ok: true }, null, 2) }]); // control
  });

  it('14.368 page: offset cursor, default 50, cap 200, refuses a foreign cursor', () => {
    const items = Array.from({ length: 120 }, (_, i) => i);
    const first = page(items, undefined, undefined);
    const second = page(items, first.nextCursor ?? undefined, undefined);
    const third = page(items, second.nextCursor ?? undefined, undefined);
    expect([first.items.length, second.items.length, third.items.length, third.nextCursor]).toEqual([50, 50, 20, null]);
    expect(page(Array.from({ length: 500 }, (_, i) => i), undefined, 500).items).toHaveLength(200);
    expect(() => page(items, 'abc', 10)).toThrow('cursor is not one this tool gave out');
  });

  it('14.369 readOrNotFound maps only a 404', async () => {
    const s = (error: unknown) => ({ userId: () => 'u', get: async () => { throw error; }, post: async () => ({}), postEvents: async () => ({}), ...NO_TRANSFER });
    await expect(readOrNotFound(s(new HttpError(404, null)), '/x', 'ticket')).rejects.toThrow('ticket not found or not visible to you');
    await expect(readOrNotFound(s(new HttpError(500, null)), '/x', 'ticket')).rejects.toThrow('gisik-nokma answered 500');
    const okSession = { userId: () => 'u', get: async () => ({ a: 1 }), post: async () => ({}), postEvents: async () => ({}), ...NO_TRANSFER };
    expect(await readOrNotFound(okSession, '/x', 'ticket')).toEqual({ a: 1 }); // control
  });

  it('14.365 getBytes and postMultipart re-authenticate once on 401; 403 is thrown', async () => {
    let calls = 0;
    const client: GisikClient = {
      get: async () => ({}),
      post: async () => ({}),
      getBytes: async () => {
        calls += 1;
        if (calls === 1) throw new HttpError(401, null);
        return { bytes: new Uint8Array([1]), contentType: 'image/png', filename: null };
      },
      postMultipart: async () => {
        throw new HttpError(403, { error: 'forbidden' });
      },
    };
    let logins = 0;
    const session = await createSession({
      config: { serverUrl: 'http://x', tokenPath: '/tmp/mcpe-t3-token.json' } as never,
      client: { ...client, post: async (path: string) => (path.includes('device') ? ((logins += 1), { token: 't', userId: 'u' }) : {}) } as never,
      prompt: () => undefined,
      sleep: async () => undefined,
      now: () => 0,
    });
    await expect(session.getBytes('/v1/attachments/a')).resolves.toMatchObject({ contentType: 'image/png' });
    expect(calls).toBe(2);
    await expect(session.postMultipart('/v1/attachments', {}, { name: 'x', bytes: new Uint8Array() })).rejects.toMatchObject({ status: 403 });
  });

  it('14.367 envelopeFor takes any domain entity kind', () => {
    const s = { userId: () => '01J0A5ER0000000000000000AA', get: async () => ({}), post: async () => ({}), postEvents: async () => ({}), ...NO_TRANSFER };
    const env = envelopeFor(s, '01J0WS000000000000000000AA', { kind: 'note', id: '01J0N0TE00000000000000000A' }, 'note.renamed', { title: 'x' });
    expect(parseEvent({ ...env, serverTime: '2026-10-02T10:00:00.000Z', seq: 1 }, domainRegistry).ok).toBe(true);
  });
});

function indexOf(haystack: Uint8Array, needle: Uint8Array): number {
  outer: for (let i = 0; i <= haystack.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) if (haystack[i + j] !== needle[j]) continue outer;
    return i;
  }
  return -1;
}
```

(14.365's device-flow stubbing follows `test/session.test.ts`' own fake client exactly — copy its `deps` builder rather than the inline one above if they differ; the assertion is the re-auth count.)

`apps/server/test/mcp/mcp-bytes.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid } from '@gisik-nokma/domain';
import type { FastifyInstance } from 'fastify';
import { hostedSession } from '../../src/mcp/in-process-fetch.js';
import { buildOAuthApp, hostedToken } from '../helpers/oauth.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { signInWithPhone } from '../helpers/session.js';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
let db: TestDatabase;
beforeAll(async () => {
  db = await createTestDatabase();
});
afterAll(async () => {
  await db.drop();
});

describe('14.361 / 14.364 bytes through the hosted door', () => {
  it('14.361 upload and download through the in-process session are byte-identical', async () => {
    const { app, otp } = buildOAuthApp(db);
    await app.ready();
    const user = await signInWithPhone(app, otp, '+911100002361');
    const auth = { authorization: `Bearer ${user.token}` };
    const ws = (await app.inject({ method: 'POST', url: '/v1/workspaces', headers: auth, payload: { name: 'Bytes' } })).json<{ workspaceId: string }>().workspaceId;
    const project = newUlid();
    const ticket = newUlid();
    const event = (entity: { kind: string; id: string }, type: string, payload: unknown) => ({
      id: newUlid(), workspaceId: ws, entity, type, version: 1, payload, actorId: user.userId, origin: 'web', clientTime: new Date().toISOString(),
    });
    await app.inject({ method: 'POST', url: '/v1/events', headers: auth, payload: { events: [
      event({ kind: 'project', id: project }, 'project.created', { name: 'B' }),
      event({ kind: 'project', id: project }, 'project.member_added', { userId: user.userId, projectAdmin: true }),
      event({ kind: 'ticket', id: ticket }, 'ticket.created', { typeId: 'task', projectId: project, parentId: null, title: 'Has a file' }),
    ] } });
    const token = await hostedToken(app as FastifyInstance, db.pool, user.userId);
    const session = hostedSession(app as FastifyInstance, { ip: '127.0.0.1', xff: undefined }, token, user.userId);
    await session.ready();
    const uploaded = (await session.postMultipart('/v1/attachments', { ticketId: ticket }, { name: 'dot.png', bytes: new Uint8Array(PNG) })) as { attachmentId: string; mime: string; size: number };
    expect(uploaded).toMatchObject({ mime: 'image/png', size: PNG.length });
    const back = await session.getBytes(`/v1/attachments/${uploaded.attachmentId}`);
    expect(Buffer.from(back.bytes).equals(PNG)).toBe(true);
    expect(back.contentType).toBe('image/png');
    expect(await session.get('/v1/me/workspaces')).toMatchObject({ workspaces: [{ workspaceId: ws }] }); // control: JSON still works
    await app.close();
  });

  it('14.364 /mcp takes a 12 MB body and refuses one over 16 MiB', async () => {
    const { app, otp } = buildOAuthApp(db);
    await app.ready();
    const user = await signInWithPhone(app, otp, '+911100002364');
    const token = await hostedToken(app as FastifyInstance, db.pool, user.userId);
    const call = (size: number) =>
      app.inject({
        method: 'POST', url: '/mcp',
        headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'mcp-protocol-version': '2025-06-18', authorization: `Bearer ${token}` },
        payload: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'list_workspaces', arguments: { pad: 'x'.repeat(size) } } }),
      });
    expect((await call(10)).statusCode).toBe(200); // control
    expect((await call(12_000_000)).statusCode).not.toBe(413);
    expect((await call(17 * 1024 * 1024)).statusCode).toBe(413);
    await app.close();
  });
});
```

(`list_workspaces`' zod shape ignores the extra `pad` key or the SDK refuses it with -32602 — either way the answer is NOT 413, which is the property. If `hostedSession`'s `ready` is not on the returned type, it is: `LazySession`, `lazy-session.ts:26-29`.)

- [ ] **Step 2: Run to fail.** `pnpm --filter @gisik-nokma/mcp-server exec vitest run test/plumbing.test.ts > /tmp/mcpe-t3.log 2>&1; tail -30 /tmp/mcpe-t3.log` → FAIL (missing exports).

- [ ] **Step 3: Implement — HTTP client.** `packages/mcp-server/src/http-client.ts` keeps `TransportError`, `HttpError` and `readBody`, and `createGisikClient` becomes:

```ts
export type FileBytes = { name: string; bytes: Uint8Array };
export type DownloadedBytes = { bytes: Uint8Array; contentType: string; filename: string | null };

export type GisikClient = {
  get(path: string, token: string): Promise<unknown>;
  getBytes(path: string, token: string): Promise<DownloadedBytes>;
  post(path: string, body: unknown, token: string | null): Promise<unknown>;
  postMultipart(path: string, fields: Record<string, string>, file: FileBytes, token: string): Promise<unknown>;
};

/**
 * One `multipart/form-data` body: every FIELD part first, then the file part — the order the upload
 * route's contract asks for (`apps/server/src/routes/attachments.ts`, `packages/editor/src/upload.ts:86-88`).
 * The part's Content-Type is octet-stream on purpose: the server sniffs the bytes and never trusts a claim.
 */
export function encodeMultipart(fields: Record<string, string>, file: FileBytes, boundary: string): Uint8Array {
  const enc = new TextEncoder();
  const safe = (value: string): string => value.replace(/["\r\n\\]/g, '_');
  const chunks: Uint8Array[] = [];
  for (const [name, value] of Object.entries(fields)) {
    chunks.push(enc.encode(`--${boundary}\r\nContent-Disposition: form-data; name="${safe(name)}"\r\n\r\n${value}\r\n`));
  }
  chunks.push(
    enc.encode(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${safe(file.name)}"\r\nContent-Type: application/octet-stream\r\n\r\n`),
  );
  chunks.push(file.bytes);
  chunks.push(enc.encode(`\r\n--${boundary}--\r\n`));
  const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}

export function createGisikClient(serverUrl: string, fetchImpl: typeof fetch = fetch): GisikClient {
  async function request(method: string, path: string, init: { body?: BodyInit; headers?: Record<string, string> }, token: string | null): Promise<Response> {
    const headers: Record<string, string> = { accept: 'application/json', ...init.headers };
    if (token !== null) headers['authorization'] = `Bearer ${token}`;
    try {
      return await fetchImpl(`${serverUrl}${path}`, { method, headers, body: init.body });
    } catch (cause) {
      // NOT retried, on purpose (case 14.46): a retried write can double-submit.
      throw new TransportError(
        `could not reach gisik-nokma at ${serverUrl}: ${cause instanceof Error ? cause.message : String(cause)}`,
        { cause },
      );
    }
  }
  async function json(response: Response): Promise<unknown> {
    const parsed = await readBody(response);
    if (!response.ok) throw new HttpError(response.status, parsed);
    return parsed;
  }
  return {
    get: async (path, token) => json(await request('GET', path, {}, token)),
    post: async (path, body, token) =>
      json(await request('POST', path, body === undefined ? {} : { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }, token)),
    postMultipart: async (path, fields, file, token) => {
      const boundary = `gisik-${crypto.randomUUID()}`;
      return json(
        await request('POST', path, { body: encodeMultipart(fields, file, boundary), headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } }, token),
      );
    },
    getBytes: async (path, token) => {
      const response = await request('GET', path, { headers: { accept: '*/*' } }, token);
      if (!response.ok) throw new HttpError(response.status, await readBody(response));
      const disposition = response.headers.get('content-disposition') ?? '';
      return {
        bytes: new Uint8Array(await response.arrayBuffer()),
        contentType: response.headers.get('content-type') ?? 'application/octet-stream',
        filename: /filename="([^"]*)"/.exec(disposition)?.[1] ?? null,
      };
    },
  };
}
```

`session.ts`: the type gains

```ts
  /** Raw bytes of a download (`GET /v1/attachments/:id`); never parsed as JSON. */
  getBytes(path: string): Promise<DownloadedBytes>;
  /** A multipart upload (`POST /v1/attachments`): fields first, then the file. */
  postMultipart(path: string, fields: Record<string, string>, file: FileBytes): Promise<unknown>;
```

and the returned object gains `getBytes: (path) => withReauth((token) => deps.client.getBytes(path, token)), postMultipart: (path, fields, file) => withReauth((token) => deps.client.postMultipart(path, fields, file, token)),`. `lazy-session.ts` gains the two methods in the shape of its `post` (await `ready()`, then `resolved().…`). `apps/server/src/mcp/in-process-fetch.ts`: `hostedSession` gains `getBytes: (path) => client.getBytes(path, accessToken), postMultipart: (path, fields, file) => client.postMultipart(path, fields, file, accessToken),`, and `inProcessFetch` becomes binary-safe:

```ts
    const body = init?.body;
    const res = await app.inject({
      method: (init?.method ?? 'GET') as 'GET' | 'POST',
      url: `${url.pathname}${url.search}`,
      headers,
      // A multipart upload arrives as bytes (`encodeMultipart`); JSON as a string. Anything else is a bug upstream.
      payload: typeof body === 'string' ? body : body instanceof Uint8Array ? Buffer.from(body.buffer, body.byteOffset, body.byteLength) : undefined,
      remoteAddress: outer.ip,
    });
    const out = new Headers();
    for (const [k, v] of Object.entries(res.headers)) {
      if (v !== undefined) out.set(k, Array.isArray(v) ? v.join(', ') : String(v));
    }
    // `rawPayload`, never `res.body`: `body` is the payload decoded as UTF-8, which corrupts every
    // download that is not text (an image's bytes would come back as replacement characters).
    return new Response(res.rawPayload.length === 0 ? null : res.rawPayload, { status: res.statusCode, headers: out });
```

`routes/mcp-http.ts:43`:

```ts
/** A 10 MiB file is ~13.4 MB of base64 inside JSON-RPC; Fastify's default 1 MiB would refuse it (SC20). */
export const MCP_BODY_LIMIT_BYTES = 16 * 1024 * 1024;
// …
  app.post('/mcp', { bodyLimit: MCP_BODY_LIMIT_BYTES }, async (request, reply) => {
```

- [ ] **Step 4: Implement — reply, preview, envelope.** `src/tools/reply.ts`:

```ts
export type ContentBlock = { type: 'text'; text: string } | { type: 'image'; data: string; mimeType: string };

/**
 * A tool answer that is NOT one JSON text block — today, an image from `get_attachment` (spec §4). Every
 * other tool answers a plain value, which `registerTools` serializes; only this class passes through as is.
 */
export class ToolReply {
  constructor(readonly content: ContentBlock[]) {}
}
```

`src/tools/preview.ts`:

```ts
export type Preview = {
  preview: true;
  /** One plain sentence of what WOULD change. */
  wouldChange: string;
  /** The counts it affects (ticket keys renamed, tickets migrated, people removed from projects). */
  counts: Record<string, number>;
  nothingChanged: true;
  confirm: string;
};

/**
 * The admin confirmation (spec §5.1, M-E4). `null` = the exact name was given: go ahead. Otherwise a
 * PREVIEW — a successful answer, not an error, so the assistant can show it to the person before acting.
 * Exact comparison: case, inner spaces and a trailing space all count (Review Focus 5). Distinct from
 * `directory.ts`'s throwing `confirmName`, which the workspace and project tools keep (spec §5.1).
 */
export async function confirmOrPreview(
  expected: string,
  given: string | undefined,
  describe: () => Promise<{ sentence: string; counts?: Record<string, number> }>,
): Promise<Preview | null> {
  if (given === expected) return null;
  const { sentence, counts } = await describe();
  return { preview: true, wouldChange: sentence, counts: counts ?? {}, nothingChanged: true, confirm: `confirm_name must be "${expected}"` };
}
```

`submit.ts` `envelopeFor`'s parameter becomes `entity: { kind: EntityKind; id: string }` (`import { newSubmittedEvent, type EntityKind, type SubmittedEvent } from '@gisik-nokma/domain'`).

- [ ] **Step 5: Implement — registration.** Each of the eight new factory files is exactly (name and task number per file):

```ts
import type { Session } from '../session.js';
import type { ToolDefinition } from './read-tools.js';

/** MCP-everything T6 fills this (`list_comments`, `edit_comment`, `delete_comment`). Composed into `allTools` by T3 so the composition never moves again. */
export function commentTools(_session: Session): ToolDefinition[] {
  return [];
}
```

(`noteTools` — T7; `attachmentTools` — T8; `ticketTools` — T9; `discoveryTools` — T10; `memberAdminTools` — T11; `definitionAdminTools` — T12; `trashTools` — T13.) `register.ts`:

```ts
export function allTools(session: Session): ToolDefinition[] {
  return [
    ...readTools(session),
    ...writeTools(session),
    ...workspaceTools(session),
    ...projectTools(session),
    ...commentTools(session),
    ...noteTools(session),
    ...attachmentTools(session),
    ...ticketTools(session),
    ...discoveryTools(session),
    ...memberAdminTools(session),
    ...definitionAdminTools(session),
    ...trashTools(session),
  ];
}
```

and `registerTools` becomes a one-line call into an exported loop, so a test can push a fake `ToolDefinition` through the REAL code (14.363):

```ts
export function registerTools(server: McpServer, session: LazySession, hooks: RegisterHooks = {}): void {
  registerToolDefinitions(server, session, allTools(session), hooks);
}

/** The registration loop itself (the docblock above moves here unchanged). */
export function registerToolDefinitions(server: McpServer, session: LazySession, tools: ToolDefinition[], hooks: RegisterHooks = {}): void {
  for (const tool of tools) {
    server.registerTool(tool.name, { description: tool.description, inputSchema: tool.inputSchema }, async (args: Record<string, unknown>) => {
      const started = Date.now();
      const observe = (outcome: ToolCallEvent['outcome']): void => hooks.onCall?.({ tool: tool.name, outcome, durationMs: Date.now() - started });
      try {
        await session.ready();
        const result = await tool.handler(args);
        observe('ok');
        if (result instanceof ToolReply) return { content: result.content };
        return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
      } catch (error) {
        observe('error');
        return { isError: true, content: [{ type: 'text' as const, text: error instanceof Error ? error.message : String(error) }] };
      }
    });
  }
}
```

`src/tools/reads.ts`:

```ts
import { z } from 'zod';
import { HttpError } from '../http-client.js';
import type { Session } from '../session.js';

/** A GET whose 404 is the product's "you may not know whether this exists" — answered in ONE sentence shape (spec §4). */
export async function readOrNotFound(session: Session, path: string, thing: string): Promise<unknown> {
  try {
    return await session.get(path);
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) throw new Error(`${thing} not found or not visible to you`);
    throw error;
  }
}

/** Every list tool's paging arguments (spec §4: cursor and limit, default 50, max 200). */
export const pageArgs = { cursor: z.string().regex(/^\d+$/).optional(), limit: z.number().int().min(1).max(200).optional() };

/** Pages a list the route answered whole. The cursor is an offset, opaque to the caller. */
export function page<T>(items: readonly T[], cursor: string | undefined, limit: number | undefined): { items: T[]; nextCursor: string | null } {
  const from = cursor === undefined ? 0 : Number(cursor);
  if (cursor !== undefined && (!/^\d+$/.test(cursor) || from > items.length)) throw new Error('cursor is not one this tool gave out');
  const size = Math.min(Math.max(limit ?? 50, 1), 200);
  return { items: items.slice(from, from + size), nextCursor: from + size < items.length ? String(from + size) : null };
}

/** `page` over the array a route answers under `key`, keeping the rest of the body. */
export function pageField(body: Record<string, unknown>, key: string, cursor: string | undefined, limit: number | undefined): Record<string, unknown> {
  const list = body[key];
  if (!Array.isArray(list)) return body;
  const { items, nextCursor } = page(list, cursor, limit);
  return { ...body, [key]: items, nextCursor };
}
```

`apps/server/test/mcp/helpers/door-matrix.ts` (spec §8: for every tool, the event written, a forbidden caller's refusal and the uniform not-found):

```ts
import { expect } from 'vitest';
import { newUlid } from '@gisik-nokma/domain';
import type { FastifyInstance } from 'fastify';
import { buildOAuthApp, hostedToken } from '../../helpers/oauth.js';
import type { TestDatabase } from '../../helpers/db.js';
import { signInWithPhone } from '../../helpers/session.js';

export type Caller = { userId: string; token: string; sessionToken: string };
export type DoorWorld = {
  app: FastifyInstance; db: TestDatabase; owner: Caller; member: Caller; stranger: Caller;
  workspaceId: string; workspaceName: string; projectId: string; ticketId: string; ticketKey: string; secondTicketId: string; secondTicketKey: string;
  commentId: string; privateNoteId: string; workspaceNoteId: string; memberName: string;
};
export type DoorRow = {
  tool: string;
  args: (w: DoorWorld) => Record<string, unknown>;
  /** What a signed-in person with NO role in the workspace is answered: an exact sentence, or (for a per-person list) the empty JSON. */
  stranger: string | { json: unknown };
  /** What the MEMBER is answered, verbatim, when the act is not theirs. */
  forbidden?: { text: string };
  /** Who may do it, and the event that must then be in the ledger with origin `mcp` and that actor. */
  allowed?: { caller: 'owner' | 'member'; eventType?: string };
};

export async function callTool(app: FastifyInstance, token: string, name: string, args: Record<string, unknown>) {
  const res = await app.inject({
    method: 'POST', url: '/mcp',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', 'mcp-protocol-version': '2025-06-18', authorization: `Bearer ${token}` },
    payload: { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } },
  });
  const result = res.json().result as { isError?: boolean; content: Array<{ type: string; text?: string }> };
  const text = result.content.find((c) => c.type === 'text')?.text ?? '';
  return { isError: result.isError === true, text, json: result.isError === true ? null : (JSON.parse(text) as unknown) };
}

/** An owner, a plain member (on the project), a signed-in stranger; one project, two tickets, the owner's comment, a private and a workspace note. */
export async function buildDoorWorld(db: TestDatabase, phoneTail: string): Promise<DoorWorld> {
  const { app, otp } = buildOAuthApp(db);
  await app.ready();
  const person = async (n: number): Promise<Caller> => {
    const u = await signInWithPhone(app, otp, `+9111${phoneTail}${n}`);
    return { userId: u.userId, sessionToken: u.token, token: await hostedToken(app, db.pool, u.userId) };
  };
  const owner = await person(1);
  const member = await person(2);
  const stranger = await person(3);
  const workspaceName = 'Door matrix';
  const workspaceId = (await app.inject({ method: 'POST', url: '/v1/workspaces', headers: { authorization: `Bearer ${owner.sessionToken}` }, payload: { name: workspaceName } })).json<{ workspaceId: string }>().workspaceId;
  const projectId = newUlid();
  const ticketId = newUlid();
  const secondTicketId = newUlid();
  const commentId = newUlid();
  const privateNoteId = newUlid();
  const workspaceNoteId = newUlid();
  const ev = (entity: { kind: string; id: string }, type: string, payload: unknown, id = newUlid()) =>
    ({ id, workspaceId, entity, type, version: 1, payload, actorId: owner.userId, origin: 'web', clientTime: new Date().toISOString() });
  const res = await app.inject({ method: 'POST', url: '/v1/events', headers: { authorization: `Bearer ${owner.sessionToken}` }, payload: { events: [
    ev({ kind: 'project', id: projectId }, 'project.created', { name: 'Matrix' }),
    ev({ kind: 'project', id: projectId }, 'project.member_added', { userId: owner.userId, projectAdmin: true }),
    ev({ kind: 'membership', id: `${workspaceId}:${member.userId}` }, 'membership.granted', { userId: member.userId, role: 'member' }),
    ev({ kind: 'project', id: projectId }, 'project.member_added', { userId: member.userId, projectAdmin: false }),
    ev({ kind: 'ticket', id: ticketId }, 'ticket.created', { typeId: 'task', projectId, parentId: null, title: 'Matrix ticket', start: 'backlog' }),
    ev({ kind: 'ticket', id: secondTicketId }, 'ticket.created', { typeId: 'task', projectId, parentId: null, title: 'Second ticket', start: 'backlog' }),
    ev({ kind: 'ticket', id: ticketId }, 'comment.added', { body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'owner says' }] }] } }, commentId),
    ev({ kind: 'note', id: privateNoteId }, 'note.created', { title: 'Private matrix note', homeProjectId: '', scope: { mode: 'private' } }),
    ev({ kind: 'note', id: workspaceNoteId }, 'note.created', { title: 'Matrix note', homeProjectId: '', scope: { mode: 'workspace' } }),
  ] } });
  for (const r of res.json<{ results: Array<{ status: string; reason?: string }> }>().results) expect(r.status, r.reason).toBe('committed');
  const get = (url: string) => app.inject({ method: 'GET', url, headers: { authorization: `Bearer ${owner.sessionToken}` } });
  const ticketKey = (await get(`/v1/workspaces/${workspaceId}/tickets/${ticketId}`)).json<{ key: string }>().key;
  const secondTicketKey = (await get(`/v1/workspaces/${workspaceId}/tickets/${secondTicketId}`)).json<{ key: string }>().key;
  const memberName = (await get(`/v1/workspaces/${workspaceId}/members`)).json<{ members: Array<{ userId: string; displayName: string }> }>()
    .members.find((m) => m.userId === member.userId)!.displayName;
  return { app, db, owner, member, stranger, workspaceId, workspaceName, projectId, ticketId, ticketKey, secondTicketId, secondTicketKey, commentId, privateNoteId, workspaceNoteId, memberName };
}

export async function runDoorMatrix(w: DoorWorld, rows: DoorRow[]): Promise<void> {
  for (const row of rows) {
    const s = await callTool(w.app, w.stranger.token, row.tool, row.args(w));
    if (typeof row.stranger === 'string') {
      expect(s.isError, `${row.tool}: stranger`).toBe(true);
      expect(s.text, `${row.tool}: stranger`).toBe(row.stranger); // EXACT: a uniform sentence, never "answered 404"
    } else {
      expect(s.json, `${row.tool}: stranger`).toEqual(row.stranger.json);
    }
    if (row.forbidden !== undefined) {
      const m = await callTool(w.app, w.member.token, row.tool, row.args(w));
      expect(m.isError, `${row.tool}: member`).toBe(true);
      expect(m.text, `${row.tool}: member`).toBe(row.forbidden.text);
    }
    if (row.allowed === undefined) continue;
    const caller = w[row.allowed.caller];
    const count = async () =>
      row.allowed?.eventType === undefined ? 0
        : (await w.db.pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM events WHERE workspace_id = $1 AND type = $2 AND origin = 'mcp' AND actor_id = $3`, [w.workspaceId, row.allowed.eventType, caller.userId])).rows[0]!.n;
    const before = await count();
    const ok = await callTool(w.app, caller.token, row.tool, row.args(w));
    expect(ok.isError, `${row.tool}: ${row.allowed.caller}: ${ok.text}`).toBe(false);
    if (row.allowed.eventType !== undefined) expect(await count(), `${row.tool}: ${row.allowed.eventType} with origin mcp`).toBe(before + 1);
  }
}
```

14.370 lives in `apps/server/test/mcp/door-matrix.test.ts` (new): `buildDoorWorld(db, '2370')`, then `runDoorMatrix` over `get_project` (stranger: `'project not found or not visible to you'`, allowed member), `rename_workspace` (stranger: `refused by permission.role: <NOT_A_MEMBER_REASON>`, forbidden member: `refused by permission.role: <WORKSPACE_RENAME_REASON>`, allowed owner `workspace.renamed`) — import both constants from `apps/server/src/permissions/check-permission.ts` — and a control `await expect(runDoorMatrix(w, [{ tool: 'get_project', args: …, stranger: 'wrong sentence' }])).rejects.toThrow()`.

(If the SDK's callback return type rejects the union, type the image member as the SDK's own `ImageContent` from `@modelcontextprotocol/sdk/types.js` — verified against the installed 1.30.0, not recalled.)

- [ ] **Step 6: The fixtures and the four pinned lists.** `test/fixtures/tool-names.ts`:

```ts
/**
 * THE literal pin of every MCP tool, in `allTools` order (MCP-everything T3). One block per module; a
 * lane edits ONLY the lines between its own `begin`/`end` comments, so parallel lanes never touch the same
 * hunk. `register.test.ts` (14.80/14.81) and `exports.test.ts` read `TOOL_NAMES`; the hosted tests compare
 * against `allTools`, which this pin already holds to the literal.
 */
export const TOOL_NAMES_BY_MODULE = {
  read: [
    // read begin
    'search_tickets', 'list_tickets', 'get_ticket', 'list_members',
    // read end
  ],
  write: ['create_ticket', 'transition_ticket', 'add_comment', 'assign_ticket'],
  workspace: ['list_workspaces', 'get_workspace', 'create_workspace', 'rename_workspace', 'archive_workspace', 'restore_workspace', 'delete_workspace', 'undelete_workspace'],
  project: ['list_projects', 'get_project', 'create_project', 'update_project', 'archive_project', 'restore_project', 'delete_project', 'undelete_project'],
  comment: [
    // comment begin (T6)
    // comment end
  ],
  note: [
    // note begin (T7)
    // note end
  ],
  attachment: [
    // attachment begin (T8)
    // attachment end
  ],
  ticket: [
    // ticket begin (T9)
    // ticket end
  ],
  discovery: [
    // discovery begin (T10)
    // discovery end
  ],
  memberAdmin: [
    // member-admin begin (T11)
    // member-admin end
  ],
  definitionAdmin: [
    // definition-admin begin (T12)
    // definition-admin end
  ],
  trash: [
    // trash begin (T13)
    // trash end
  ],
} satisfies Record<string, string[]>;

export const TOOL_NAMES: string[] = Object.values(TOOL_NAMES_BY_MODULE).flat();
```

`test/fixtures/tool-sweep.ts` holds the 24 existing `ARGS` entries from `register.test.ts:76-101` as `name: { args: {...} }`, then one `// <module> begin (Tn)` / `// <module> end` pair per new module, in the same order; `export type SweepEntry = { args: Record<string, unknown>; session?: Partial<Session> }`. `test/fixtures/fake-session.ts`:

```ts
import type { Session } from '../../src/session.js';

/** Spread into a fake `Session` that never transfers bytes; a call is a test bug and says so. */
export const NO_TRANSFER: Pick<Session, 'getBytes' | 'postMultipart'> = {
  getBytes: async () => {
    throw new Error('getBytes is not stubbed in this test');
  },
  postMultipart: async () => {
    throw new Error('postMultipart is not stubbed in this test');
  },
};
```

`register.test.ts`: delete the `TOOL_NAMES` literal and the `ARGS` map, import `TOOL_NAMES` and `SWEEP`, spread `...NO_TRANSFER` into `fakeSession`, and make 14.88's loop build each tool over its own session:

```ts
      for (const name of TOOL_NAMES) {
        const entry = SWEEP[name];
        if (entry === undefined) throw new Error(`no sweep entry for ${name} — add one in test/fixtures/tool-sweep.ts`);
        const s = lazySession(async () => ({ ...fakeSession(), ...entry.session }));
        await s.ready();
        const tool = allTools(s).find((t) => t.name === name);
        if (tool === undefined) throw new Error(`${name} is pinned but not registered`);
        await tool.handler(entry.args);
      }
```

`exports.test.ts`: import `TOOL_NAMES` and compare `pkg.allTools(fake).map(...)` to it (its `fake` gains `...NO_TRANSFER`). The five other package test files spread `...NO_TRANSFER` into their `Session` literals. `apps/server/test/mcp/mcp-http.test.ts` (14.262) and `mcp-remote-e2e.test.ts`: replace each literal list with

```ts
const stub = { userId: () => 'u', get: async () => ({}), post: async () => ({}), postEvents: async () => ({}), getBytes: async () => { throw new Error('unused'); }, postMultipart: async () => { throw new Error('unused'); } };
// The hosted door lists EXACTLY what `allTools` lists, in order; the package's own fixture pins the literal (14.366).
expect(tools.map((t) => t.name)).toEqual(allTools(stub).map((t) => t.name));
expect(tools.length).toBeGreaterThanOrEqual(24); // CONTROL: not an empty registry agreeing with itself
```

(`mcp-remote-e2e.test.ts` compares sorted lists; keep `.sort()` on both sides there.)

- [ ] **Step 7: Run to pass, then the battery.**

```bash
pnpm turbo run build --filter=@gisik-nokma/server... > /tmp/mcpe-t3-b.log 2>&1; tail -5 /tmp/mcpe-t3-b.log
pnpm --filter @gisik-nokma/mcp-server exec vitest run > /tmp/mcpe-t3-p.log 2>&1; tail -15 /tmp/mcpe-t3-p.log
pnpm --filter @gisik-nokma/server exec vitest run test/mcp > /tmp/mcpe-t3-s.log 2>&1; tail -15 /tmp/mcpe-t3-s.log
pnpm --filter @gisik-nokma/mcp-server typecheck && pnpm --filter @gisik-nokma/server typecheck > /tmp/mcpe-t3-tc.log 2>&1; tail -10 /tmp/mcpe-t3-tc.log
```

Mutations: string-only `inProcessFetch` (14.361), `trim()` in `confirmOrPreview` (14.362), stringify every answer in `registerToolDefinitions` (14.363), no `bodyLimit` (14.364), no cap in `page` (14.368), `toContain` in `runDoorMatrix` (14.370).

- [ ] **Step 8: Catalogue + commit.** Flip 14.360–14.370 ✅. Features.md §14, under the marker:

```markdown
- ⚙️ **The MCP can move bytes, answer images, take a large call and preview an admin act** (MCP-everything T3; `packages/mcp-server/src/http-client.ts`, `session.ts`, `tools/reply.ts`, `tools/preview.ts`, `apps/server/src/mcp/in-process-fetch.ts`, `routes/mcp-http.ts`) — every session has `getBytes` and `postMultipart` (fields first, file second; the server sniffs), the hosted in-process door is binary-safe both ways, `POST /mcp` takes up to 16 MiB, a tool can answer an MCP image, and `confirmOrPreview` answers a successful preview for any `confirm_name` but the exact one. Every list pages (`page`, default 50, max 200) and every read of a parent answers one not-found sentence (`readOrNotFound`). `allTools` composes twelve modules in a fixed order; the tool list is pinned once per module (`test/fixtures/tool-names.ts`) and the hosted door is held equal to it; `door-matrix.ts` drives any tool through the hosted door as a stranger, a member and the allowed caller. Cases 14.360–14.370.
```

```bash
git branch --show-current   # task/mcp-e-3-plumbing
git add packages/mcp-server apps/server/src/mcp apps/server/src/routes/mcp-http.ts apps/server/test/mcp test-cases/14-mcp-server.md Features.md
git commit -m "MCP everything 3: bytes both ways, image replies, /mcp body limit, preview helper, registration blocks (14.360-14.367)"
git push -u origin task/mcp-e-3-plumbing
```

DONE line: `DONE task/mcp-e-3-plumbing <sha40>`.

---

### Task 4: The offline replica sees comment edits and deletions

**Lane:** `task/mcp-e-4-replica-comments` off `origin/release/mcp-everything` after T2 merged. Parallel with T5–T12.

**Why:** the replica stores the ledger and serves a note's thread and an offline search (`packages/sync-client/src/replica/replica.ts:1863-1875`, `:1932-1963`). Without this task, an edited note comment shows its old text offline and offline search finds deleted text (owner question Q4). The local schema has NO `ALTER` path (`storage/schema.ts:66-84`, "Recorded, not fixed: this schema has no migration path at all"), so the edit/delete state lives in a NEW sibling table, the `snapshot_provenance` precedent (`:85-90`).

**Files:**
- Modify: `packages/sync-client/src/storage/schema.ts` (`LOCAL_SCHEMA_VERSION` `:20` → 4; a `comment_changes` table in `TABLES`; `LOCAL_TABLE_RULES` `:204-221`), `packages/sync-client/src/replica/replica.ts` (`LocalNoteComment` `:206-212`; `applyServerItem` `:1528-1570`; `loadNoteEventsIn` `:1060-1068`; the bootstrap ticket-event insert sites — every site that stores an event and dispatches on `comment.added`, found with `grep -n "comment.added\|insertEnvelope(tx" replica.ts`; `purgeEntity` `:1581-1615`, `revokeScope` `:1616-1682`, `eraseEntities` `:1683-1719`, the table list at `:1194`; `listNoteComments` `:1863-1875`; `searchLocal` `:1932-1963`)
- Modify: `packages/app-core/src/replica/replica-data-source.ts:1295-1305` (`getNoteComments` carries the two new fields)
- Test: `packages/sync-client/test/replica-comment-changes.test.ts` (new); the existing 19.172 census (`test/purge-erase.test.ts`) must stay green with the new rule
- Catalogue: `test-cases/26-comments-and-markdown.md` §26.3, `Features.md` §23

**Interfaces:**
- Consumes: T2's `comment.edited {commentId, body}`, `comment.deleted {commentId}`, `NoteComment.editedAt/deletedAt`.
- Produces: `LocalNoteComment` gains `editedAt: string | null; deletedAt: string | null` (and `body: null` once deleted); local table `comment_changes(comment_id PK, workspace_id, entity_kind, entity_id, edited_at, edited_by, deleted_at, deleted_by)`; `LOCAL_SCHEMA_VERSION = 4`.

Cases (`## 26.3 The offline replica (T4)`):

```markdown
- ❌ **26.090 — the local schema is version 4 with a `comment_changes` table, and `LOCAL_TABLE_RULES` names it (`erase`, by entity) so the 19.172 census stays green;** control: a version-3 database migrates by `CREATE TABLE IF NOT EXISTS` with its rows intact. Mutation: omit the rule → 19.172 reddens naming the table.
- ❌ **26.091 — a note comment edited then deleted on the server reads, offline, as the new body with `editedAt`, then as `body: null` with `deletedAt`; the author and time are kept;** control: a sibling comment is unchanged. Mutation: skip `applyCommentChange` for notes → the old body is served.
- ❌ **26.092 — offline search follows the comment: after an edit the old word does not find the ticket and the new one does; after a delete neither does; a sibling comment's word still does;** control: before the edit the old word finds it. Mutation: keep scanning raw `comment.added` payloads → the deleted text is found.
- ❌ **26.093 — a redelivered edit or delete changes nothing more (at-least-once safe), and an entity purge or a scope revoke erases its `comment_changes` rows;** control: another ticket's rows survive. Mutation: no `comment_changes` delete in `purgeEntity` → a row survives the purge.
```

- [ ] **Step 1: Failing test.** `packages/sync-client/test/replica-comment-changes.test.ts` — the harness is `test/replica-notes.test.ts:1-110` (`envelope`, `noteCreated`, `commentOn`, `freshReplica`), copied; then:

```ts
describe('26.090–26.093 the replica sees comment edits and deletions', () => {
  const edit = (kind: 'ticket' | 'note', id: string, commentId: string, text: string) =>
    envelope({ kind, id }, 'comment.edited', { commentId, body: plainTextToDoc(text) });
  const remove = (kind: 'ticket' | 'note', id: string, commentId: string) =>
    envelope({ kind, id }, 'comment.deleted', { commentId });

  it('26.090 schema v4 has comment_changes', async () => {
    const { storage } = await freshReplica();
    expect(LOCAL_SCHEMA_VERSION).toBe(4);
    expect((await storage.all("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'comment_changes'", [])).length).toBe(1);
    expect(LOCAL_TABLE_RULES['comment_changes']?.rule).toBe('erase');
  });

  it('26.091 a note comment: edited, then deleted', async () => {
    const { replica } = await freshReplica();
    const first = commentOn(NOTE, 'walrus first');
    const sibling = commentOn(NOTE, 'sibling stays');
    for (const env of [noteCreated(NOTE, { mode: 'private' }), first, sibling]) await replica.applyServerItem(env);
    await replica.applyServerItem(edit('note', NOTE, first.id, 'narwhal second'));
    let rows = await replica.listNoteComments(NOTE);
    expect(rows.find((r) => r.commentId === first.id)).toMatchObject({ body: plainTextToDoc('narwhal second'), deletedAt: null });
    expect(rows.find((r) => r.commentId === first.id)?.editedAt).toBe(CLIENT_TIME);
    await replica.applyServerItem(remove('note', NOTE, first.id));
    rows = await replica.listNoteComments(NOTE);
    expect(rows.find((r) => r.commentId === first.id)).toMatchObject({ body: null, deletedAt: CLIENT_TIME, authorId: USER_A });
    expect(rows.find((r) => r.commentId === sibling.id)).toMatchObject({ body: plainTextToDoc('sibling stays'), editedAt: null }); // control
  });

  it('26.092 offline search follows edits and deletions', async () => {
    const { replica } = await freshReplica();
    // A ticket the replica holds, built the way `replica.test.ts:400-426` seeds `searchLocal`'s fixture.
    await seedHeldTicket(replica, TICKET, 'Cold room'); // copy replica.test.ts's own seeding helper for a held ticket
    const first = envelope({ kind: 'ticket', id: TICKET }, 'comment.added', { body: plainTextToDoc('walrusword') });
    const sibling = envelope({ kind: 'ticket', id: TICKET }, 'comment.added', { body: plainTextToDoc('penguinword') });
    await replica.applyServerItem(first);
    await replica.applyServerItem(sibling);
    expect((await replica.searchLocal(WS, 'walrusword')).map((h) => h.ticketId)).toEqual([TICKET]); // control
    await replica.applyServerItem(edit('ticket', TICKET, first.id, 'narwhalword'));
    expect(await replica.searchLocal(WS, 'walrusword')).toEqual([]);
    expect((await replica.searchLocal(WS, 'narwhalword')).map((h) => h.ticketId)).toEqual([TICKET]);
    await replica.applyServerItem(remove('ticket', TICKET, first.id));
    expect(await replica.searchLocal(WS, 'narwhalword')).toEqual([]);
    expect((await replica.searchLocal(WS, 'penguinword')).map((h) => h.ticketId)).toEqual([TICKET]);
  });

  it('26.093 redelivery is a no-op; a purge erases the rows', async () => {
    const { replica, storage } = await freshReplica();
    const c = commentOn(NOTE, 'x');
    for (const env of [noteCreated(NOTE, { mode: 'private' }), c]) await replica.applyServerItem(env);
    const e = edit('note', NOTE, c.id, 'y');
    expect((await replica.applyServerItem(e)).applied).toBe(true);
    expect((await replica.applyServerItem(e)).applied).toBe(false);
    await replica.purgeEntity(NOTE);
    expect(await storage.all('SELECT * FROM comment_changes WHERE entity_id = ?', [NOTE])).toEqual([]);
  });
});
```

(`seedHeldTicket` is whatever `replica.test.ts` uses to put a ticket into the `tickets` table before its `searchLocal` cases — read `:395-426` and reuse it verbatim; `searchLocal` only returns tickets the replica holds, `replica.ts:1958-1960`.)

- [ ] **Step 2: Run to fail.** `pnpm --filter @gisik-nokma/sync-client exec vitest run test/replica-comment-changes.test.ts > /tmp/mcpe-t4.log 2>&1; tail -30 /tmp/mcpe-t4.log`.

- [ ] **Step 3: Implement.** `schema.ts`: `LOCAL_SCHEMA_VERSION = 4` (docblock line: "Raised to 4 by MCP-everything T4, which added `comment_changes` — a NEW table, for the same reason."), and in `TABLES` after `note_comments`:

```ts
  /**
   * Comment edits and deletions (MCP-everything T4, spec §6) — a SIBLING table, not columns on
   * `note_comments`, because this schema can only CREATE (see `snapshot_provenance` above). One row per
   * changed comment, ticket or note; `entity_kind`/`entity_id` name the parent so a purge reaches it.
   */
  `CREATE TABLE IF NOT EXISTS comment_changes (
     comment_id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, entity_kind TEXT NOT NULL, entity_id TEXT NOT NULL,
     edited_at TEXT, edited_by TEXT, deleted_at TEXT, deleted_by TEXT
   )`,
  `CREATE INDEX IF NOT EXISTS comment_changes_entity_idx ON comment_changes (entity_kind, entity_id)`,
```

and `LOCAL_TABLE_RULES.comment_changes = { rule: 'erase', why: "an erased ticket's or note's comment edits, by (entity_kind, entity_id); a workspace's by workspace_id" }`. `replica.ts`:

```ts
  /** `comment.edited` / `comment.deleted`, ticket or note: the change row, and a note comment's own row. */
  async function applyCommentChange(tx: SyncStorage, env: LedgerEvent): Promise<void> {
    const commentId = String((env.payload as { commentId?: unknown }).commentId);
    const deleted = env.type === 'comment.deleted';
    await tx.run(
      `INSERT INTO comment_changes (comment_id, workspace_id, entity_kind, entity_id, edited_at, edited_by, deleted_at, deleted_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(comment_id) DO UPDATE SET
         edited_at = COALESCE(excluded.edited_at, comment_changes.edited_at),
         edited_by = COALESCE(excluded.edited_by, comment_changes.edited_by),
         deleted_at = COALESCE(comment_changes.deleted_at, excluded.deleted_at),
         deleted_by = COALESCE(comment_changes.deleted_by, excluded.deleted_by)`,
      [commentId, env.workspaceId, env.entity.kind, env.entity.id,
        deleted ? null : env.serverTime, deleted ? null : env.actorId,
        deleted ? env.serverTime : null, deleted ? env.actorId : null],
    );
    if (env.entity.kind !== 'note') return;
    const body = deleted ? 'null' : JSON.stringify((env.payload as { body?: unknown }).body ?? null);
    await tx.run(
      `UPDATE note_comments SET body = ? WHERE comment_id = ? AND note_id = ?
         AND NOT EXISTS (SELECT 1 FROM comment_changes c WHERE c.comment_id = ? AND c.deleted_at IS NOT NULL AND ? = 0)`,
      [body, commentId, env.entity.id, commentId, deleted ? 1 : 0],
    );
  }
```

In `applyServerItem`, a branch directly after the contest branch: `} else if (env.type === 'comment.edited' || env.type === 'comment.deleted') { await applyCommentChange(tx, env); }` (BEFORE the note branch, so a comment change never refolds a note's head row, the 18.078 rule). `loadNoteEventsIn`: `if (env.type === 'comment.added') await applyNoteComment(tx, env); else if (env.type === 'comment.edited' || env.type === 'comment.deleted') await applyCommentChange(tx, env); else touched.add(env.entity.id);`. Every other site that stores backfilled ticket events (bootstrap) calls `applyCommentChange` for the two types the same way. `purgeEntity`: `DELETE FROM comment_changes WHERE entity_id = ?`; `revokeScope` / `eraseEntities` / the workspace erase: the same by `(entity_kind, entity_id)` or `workspace_id`; add `'comment_changes'` to the table list at `:1194`. `listNoteComments`:

```ts
      const rows = await storage.all(
        `SELECT n.*, c.edited_at, c.deleted_at FROM note_comments n
           LEFT JOIN comment_changes c ON c.comment_id = n.comment_id
          WHERE n.note_id = ? ORDER BY n.workspace_seq`,
        [noteId],
      );
      // …map as before, plus:
      //   editedAt: (row['edited_at'] as string | null) ?? null,
      //   deletedAt: (row['deleted_at'] as string | null) ?? null,
      //   body: row['deleted_at'] == null ? JSON.parse(row['body'] as string) : null,
```

`searchLocal` — replace the raw `comment.added` scan (`:1950-1962`) by the live bodies:

```ts
      // The CURRENT text of every live comment (spec §6): an edited comment is searched by its latest
      // edit, a deleted one not at all. Read in JS rather than with json_extract so both storage seams
      // (better-sqlite3 and the phone's) answer identically.
      const deleted = new Set(
        (await storage.all('SELECT comment_id FROM comment_changes WHERE workspace_id = ? AND deleted_at IS NOT NULL', [workspaceId]))
          .map((row) => row['comment_id'] as string),
      );
      const latest = new Map<string, { seq: number; body: unknown }>();
      for (const row of await storage.all("SELECT seq, payload FROM events WHERE workspace_id = ? AND type = 'comment.edited'", [workspaceId])) {
        const p = JSON.parse(row['payload'] as string) as { commentId: string; body: unknown };
        const seen = latest.get(p.commentId);
        if (seen === undefined || Number(row['seq']) > seen.seq) latest.set(p.commentId, { seq: Number(row['seq']), body: p.body });
      }
      const comments = await storage.all(
        "SELECT id, entity_id, payload FROM events WHERE workspace_id = ? AND entity_kind = 'ticket' AND type = 'comment.added'",
        [workspaceId],
      );
      for (const row of comments) {
        const id = row['id'] as string;
        if (deleted.has(id)) continue;
        const body = latest.get(id)?.body ?? (JSON.parse(row['payload'] as string) as { body: unknown }).body;
        if (!docToPlainText(body, { isPurged }).toLowerCase().includes(text.toLowerCase())) continue;
        // …the existing "already a hit / ticket still held / titleOf" tail, unchanged.
      }
```

`replica-data-source.ts` `getNoteComments` maps `editedAt` and `deletedAt` through.

- [ ] **Step 4: Pass + battery.** `pnpm --filter @gisik-nokma/sync-client exec vitest run > /tmp/mcpe-t4-all.log 2>&1; tail -15 /tmp/mcpe-t4-all.log`; `pnpm --filter @gisik-nokma/app-core exec vitest run > /tmp/mcpe-t4-ac.log 2>&1; tail -15 /tmp/mcpe-t4-ac.log`; typecheck both; build `--filter=@gisik-nokma/app-core...`. Mutations: skip `applyCommentChange` for notes (26.091), raw-payload search (26.092), no purge delete (26.093).

- [ ] **Step 5: Catalogue + commit.** Flip 26.090–26.093. Features.md §23:

```markdown
- ⚙️ **Offline, an edited or deleted comment reads as it does online** (MCP-everything T4; `packages/sync-client/src/storage/schema.ts`, `replica/replica.ts`) — local schema v4 adds `comment_changes` (a sibling table: the local schema can only create); a note's offline thread shows the latest text, "edited" and "Comment deleted"; offline search matches only a comment's current text and never a deleted one; purge and revoke erase the rows. Cases 26.090–26.093.
```

```bash
git branch --show-current   # task/mcp-e-4-replica-comments
git add packages/sync-client packages/app-core/src/replica/replica-data-source.ts test-cases/26-comments-and-markdown.md Features.md
git commit -m "MCP everything 4: the offline replica sees comment edits and deletions (26.090-26.093)"
git push -u origin task/mcp-e-4-replica-comments
```

DONE line: `DONE task/mcp-e-4-replica-comments <sha40>`.

---

### Task 5: Comment Edit and Delete in the app (tickets and notes)

**Lane:** `task/mcp-e-5-comment-ui` off `origin/release/mcp-everything` after T2 merged. Parallel with T4 and T6–T12. **UI work: invoke `frontend-design` alongside `test-driven-development`** (workspace rule, owner 2026-10-02), and name it in any sub-agent prompt.

**Files:**
- Modify: `packages/app-core/src/views/comments-thread.tsx` (`TicketComment` `:67-77`, `CommentsThreadProps` `:79-118`, `CommentItem` `:136-188`, `CommentsThread` `:190-294`)
- Create: `packages/app-core/src/flows/comment-edits.ts`
- Modify: `packages/app-core/src/views/history-copy.ts:187`, `packages/app-core/src/online/mappers.ts` (`mapTicketComments`, `:881-905`; `mapNoteComments`), `packages/app-core/src/views/ticket-sheet.tsx` (props `:180-240`; the thread mount `:4152-4175`), `packages/app-core/src/views/editor-slot.tsx:94-180` (`submitLabel`), `packages/app-core/src/index.ts` (exports)
- Modify: `packages/editor/src/components/TicketEditorSlot.tsx` (`EditorSlotProps` `:91-180`; the submit button `:675`)
- Modify: `apps/web/src/notes/note-comments.tsx` (`:42-150`), `apps/web/src/notes/note-document.tsx` (passes `canModerate`), every `TicketSheet` host that knows the viewer (`apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx`, `my-work/page.tsx`, `apps/web/src/notes/note-document.tsx`) → `canModerateComments`
- Modify: `packages/ui/src/ui.css` (`.gn-comment__*`), `docs/manual.md` (the ticket comments section, `:599-610`, and the notes comments section), regenerate `packages/app-core/src/help/content.generated.ts` (`pnpm help:generate`)
- Test: `packages/app-core/test/views/comments-thread-actions.test.tsx` (new), `test/views/history-copy.test.ts`, `test/online/mappers-comments.test.ts` (new or the existing mapper test file), `packages/editor/test/ticket-editor-slot.test.tsx` (submitLabel)
- Catalogue: `test-cases/26-comments-and-markdown.md` §26.4, `Features.md` §23

**Interfaces:**
- Consumes: T2's events, read fields and refusal sentences.
- Produces:
  - `TicketComment` gains `editedAt?: string | null; deletedAt?: string | null` (absent = never; `body` is `null` when deleted).
  - `type CommentActions = { currentUserId: string; canModerate: boolean; renderEditor(comment: TicketComment, done: () => void): ReactNode; deleteComment(comment: TicketComment): Promise<string | null> }`; `CommentsThreadProps.actions?: CommentActions`.
  - `commentEditedSeed(workspaceId: string, parent: { kind: 'ticket' | 'note'; id: string }, commentId: string, body: unknown): EnvelopeSeed` and `commentDeletedSeed(workspaceId, parent, commentId): EnvelopeSeed` (`flows/comment-edits.ts`).
  - `EditorSlotProps.submitLabel?: string` (both declarations, byte-for-byte).
  - `TicketSheetProps.canModerateComments?: boolean`; `NoteComments` prop `canModerate: boolean`.

Cases (`## 26.4 The app (T5)`):

```markdown
- ❌ **26.110 — an edited comment shows "edited" beside its time, and pressing it (or long-pressing on a phone) shows "Edited <date, time>"; an untouched comment shows nothing;** control: the untouched comment. Mutation: render "edited" for every comment → the control fails.
- ❌ **26.111 — a deleted comment renders "Comment deleted" with its author and the deletion time — no body, no file chips, no "…" button;** control: a live comment beside it renders its body. Mutation: render `renderCommentBody(null)` → an empty body appears without the sentence.
- ❌ **26.112 — the "…" button offers Edit AND Delete to the author, only Delete to a workspace owner/admin who is not the author, and is absent for anyone else and on a deleted comment;** control: the author's menu. Mutation: show Edit to moderators → red.
- ❌ **26.113 — Edit opens the editor in place holding the current body, with Save and Cancel; Cancel (and Escape) closes it and submits nothing; Save submits exactly ONE `comment.edited { commentId, body }` against the comment's ticket or note through `dataSource.ingest`, then the thread reloads and shows "edited";** control: the note thread does the same with `entity.kind: 'note'`. Mutation: submit on Cancel → red.
- ❌ **26.114 — Delete asks once, "Delete this comment? It is removed for everyone."; Cancel submits nothing; Delete submits ONE `comment.deleted { commentId }`; a refusal shows the server's sentence in an alert and the comment stays;** control: a committed delete shows "Comment deleted". Mutation: delete without the question → red.
- ❌ **26.115 — every edit and delete leaves through `dataSource.ingest` — the one write door the offline outbox sits behind (`packages/app-core/src/offline`), so offline they queue like any other write;** control: a recording data source sees the envelopes with `origin: 'web'` and the viewer as actor. Mutation: `fetch('/v1/events')` directly → the recording data source sees nothing.
- ❌ **26.116 — the mappers carry `editedAt`/`deletedAt` for ticket and note comments, read an absent field as `null` (an older server), and refuse a non-string non-null value with a `MappingError` naming the path;** control: a full row maps. Mutation: default a wrong type to `null` → the refusal case fails.
- ❌ **26.117 — the ticket History tab narrates `comment.edited` as "Comment edited" and `comment.deleted` as "Comment deleted" (never the wire name, never the body);** control: "Comment added" unchanged. Mutation: drop a case → the wire name appears.
- ❌ **26.118 — `EditorSlotProps.submitLabel` labels the submit button ("Save" for an edit); absent, the button still reads "Post" / "Save description"; the transcription case between the two declarations stays green;** control: the default labels. Mutation: declare it in one file only → the transcription case reddens.
- ❌ **26.119 — the manual says how to edit and delete a comment (and that only the writer edits; the writer or an owner/admin deletes; a deleted comment leaves "Comment deleted"); `pnpm check:help` is green;** control: the help content regenerates byte-identically. Mutation: edit the manual without regenerating → `check:help` fails.
- 🧪 **26.120 — browser pass on the dev stack built from the release branch: hig, minimal and neo, light and dark, desktop and a 390 px phone — the "…" target is ≥ 44 px, the menu is reachable by keyboard (Enter opens, arrows move, Escape closes and returns focus to "…"), long-press shows the edit time, the delete question and "Comment deleted" read correctly, on a ticket and on a note.** Evidence: per-style screenshots and the measured target size.
```

- [ ] **Step 1: Failing view tests.** `packages/app-core/test/views/comments-thread-actions.test.tsx`:

```tsx
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CommentsThread, type CommentActions, type TicketComment } from '../../src/views/comments-thread.js';

const doc = (text: string) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] });
const base = { recordedAt: '2026-10-02T08:00:00.000Z', files: [] };
const MINE: TicketComment = { ...base, commentId: '01MINE', authorId: 'u_me', body: doc('mine'), editedAt: '2026-10-02T09:30:00.000Z', deletedAt: null };
const THEIRS: TicketComment = { ...base, commentId: '01THEIRS', authorId: 'u_them', body: doc('theirs'), editedAt: null, deletedAt: null };
const GONE: TicketComment = { ...base, commentId: '01GONE', authorId: 'u_them', body: null, editedAt: null, deletedAt: '2026-10-02T10:00:00.000Z' };
const nameOf = (id: string) => (id === 'u_me' ? 'Asha Marak' : 'Ravi Sangma');

function actions(over: Partial<CommentActions> = {}): CommentActions {
  return {
    currentUserId: 'u_me',
    canModerate: false,
    renderEditor: (_c, done) => <button type="button" onClick={done}>fake editor</button>,
    deleteComment: vi.fn(async () => null),
    ...over,
  };
}
const item = (id: string) => screen.getByTestId(`comment-${id}`);

describe('26.110–26.114 comment actions', () => {
  it('26.110 "edited" only on an edited comment, with its time on press', () => {
    render(<CommentsThread comments={[MINE, THEIRS]} nameOf={nameOf} actions={actions()} />);
    expect(within(item('01THEIRS')).queryByText('edited')).toBeNull(); // control
    fireEvent.click(within(item('01MINE')).getByRole('button', { name: /edited/ }));
    expect(within(item('01MINE')).getByText(/^Edited /)).toBeTruthy();
  });

  it('26.111 a deleted comment is a placeholder with author and time, and no actions', () => {
    render(<CommentsThread comments={[GONE, THEIRS]} nameOf={nameOf} actions={actions({ canModerate: true })} />);
    expect(within(item('01GONE')).getByText('Comment deleted')).toBeTruthy();
    expect(within(item('01GONE')).getByText('Ravi Sangma')).toBeTruthy();
    expect(within(item('01GONE')).queryByRole('button', { name: /More actions/ })).toBeNull();
    expect(within(item('01THEIRS')).getByText('theirs')).toBeTruthy(); // control
  });

  it('26.112 author gets Edit+Delete; a moderator Delete only; anyone else nothing', () => {
    const { rerender } = render(<CommentsThread comments={[MINE, THEIRS]} nameOf={nameOf} actions={actions()} />);
    fireEvent.click(within(item('01MINE')).getByRole('button', { name: "More actions for Asha Marak's comment" }));
    expect(screen.getAllByRole('menuitem').map((m) => m.textContent)).toEqual(['Edit', 'Delete']);
    expect(within(item('01THEIRS')).queryByRole('button', { name: /More actions/ })).toBeNull();
    rerender(<CommentsThread comments={[MINE, THEIRS]} nameOf={nameOf} actions={actions({ canModerate: true })} />);
    fireEvent.click(within(item('01THEIRS')).getByRole('button', { name: "More actions for Ravi Sangma's comment" }));
    expect(within(item('01THEIRS')).getAllByRole('menuitem').map((m) => m.textContent)).toEqual(['Delete']);
  });

  it('26.113 Edit opens the host editor in place; Cancel closes it', () => {
    const renderEditor = vi.fn((_c: TicketComment, done: () => void) => <button type="button" onClick={done}>fake editor</button>);
    render(<CommentsThread comments={[MINE]} nameOf={nameOf} actions={actions({ renderEditor })} />);
    fireEvent.click(within(item('01MINE')).getByRole('button', { name: /More actions/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Edit' }));
    expect(renderEditor).toHaveBeenCalledWith(MINE, expect.any(Function));
    expect(within(item('01MINE')).queryByText('mine')).toBeNull();
    fireEvent.click(within(item('01MINE')).getByRole('button', { name: 'Cancel' }));
    expect(within(item('01MINE')).getByText('mine')).toBeTruthy();
  });

  it('26.114 Delete asks once; Cancel sends nothing; a refusal is shown and the comment stays', async () => {
    const deleteComment = vi.fn(async () => 'Only the person who wrote a comment, or a workspace owner or admin, can delete it.');
    render(<CommentsThread comments={[MINE]} nameOf={nameOf} actions={actions({ deleteComment })} />);
    const open = () => {
      fireEvent.click(within(item('01MINE')).getByRole('button', { name: /More actions/ }));
      fireEvent.click(screen.getByRole('menuitem', { name: 'Delete' }));
    };
    open();
    expect(screen.getByText('Delete this comment? It is removed for everyone.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(deleteComment).not.toHaveBeenCalled(); // control
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Delete comment' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Only the person who wrote a comment');
    expect(within(item('01MINE')).getByText('mine')).toBeTruthy();
    expect(deleteComment).toHaveBeenCalledTimes(1);
  });
});
```

`26.115` lives in the existing `test/views/ticket-sheet-comments.test.tsx` harness (its `fakeEditorSlot` and recording data source, `:127-200`): mount the sheet with `currentUserId` = the comment's author and `canModerateComments: false`, open Edit, have the fake editor call its `submit` with `{ type: 'comment.added', payload: { body } }`, and assert the recorded `ingest` received exactly one envelope `{ type: 'comment.edited', entity: { kind: 'ticket', id }, payload: { commentId, body }, origin: 'web', actorId: currentUserId }`; then Delete → one `comment.deleted`. The note twin is in a new `apps/web/test/note-comments-actions.test.tsx` over `NoteComments` with the same recording data source the existing note tests use (`grep -ln "NoteComments" apps/web/test`).

History (26.117) in `test/views/history-copy.test.ts`:

```ts
it('26.117 comment edits and deletions are narrated, never echoed', () => {
  const ev = (type: string, payload: unknown) => ({ id: 'e', type, version: 1, payload, actorId: 'a', origin: 'web', clientTime: 't', serverTime: 't', seq: 1 });
  expect(describeEvent(ev('comment.edited', { commentId: '01C', body: { type: 'doc' } }) as never)).toBe('Comment edited');
  expect(describeEvent(ev('comment.deleted', { commentId: '01C' }) as never)).toBe('Comment deleted');
  expect(describeEvent(ev('comment.added', { body: { type: 'doc' } }) as never)).toBe('Comment added'); // control
});
```

Mappers (26.116): feed `mapTicketComments` a row with `editedAt`/`deletedAt` strings → carried; without the keys → both `null`; `editedAt: 5` → `MappingError` whose path ends `.editedAt`; the same three for `mapNoteComments`.

- [ ] **Step 2: Run to fail.** `pnpm --filter @gisik-nokma/app-core exec vitest run test/views/comments-thread-actions.test.tsx test/views/history-copy.test.ts > /tmp/mcpe-t5.log 2>&1; tail -30 /tmp/mcpe-t5.log`.

- [ ] **Step 3: Implement — the thread.** In `comments-thread.tsx`:

```tsx
export type TicketComment = {
  commentId: string;
  authorId: string;
  /** The structured document; `null` once the comment is deleted (the placeholder keeps author and time). */
  body: unknown;
  recordedAt: string;
  /** Latest edit's serverTime; absent or `null` = never edited. */
  editedAt?: string | null;
  /** Deletion serverTime; absent or `null` = live. */
  deletedAt?: string | null;
  files: TicketCommentFile[];
};

/**
 * What the HOST lets a viewer do to a comment (MCP-everything spec §6, M-E9). The thread decides only
 * which controls to DRAW from these facts; the permission gate decides what commits, and its refusal is
 * shown in its own words.
 */
export type CommentActions = {
  currentUserId: string;
  /** A workspace owner or admin: may delete anyone's comment, never edit it. */
  canModerate: boolean;
  /** The in-place editor for one comment, holding its current body; `done()` closes it. */
  renderEditor(comment: TicketComment, done: () => void): ReactNode;
  /** Submits `comment.deleted`; resolves `null` when committed, else the refusal sentence. */
  deleteComment(comment: TicketComment): Promise<string | null>;
};
```

`CommentsThreadProps` gains `actions?: CommentActions` (absent = no controls, so every existing mount is unchanged), passed to each `CommentItem`. `CommentItem` keeps its markup for a live comment and adds, in order: the deleted arm, the edited marker, the menu, the editor, the delete question:

```tsx
function CommentItem({ comment, nameOf, ticketHref, isPurged, actions }: CommentItemProps): ReactElement {
  const name = nameOf(comment.authorId);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const [showEditTime, setShowEditTime] = useState(false);
  const moreRef = useRef<HTMLButtonElement>(null);

  if (comment.deletedAt != null) {
    return (
      <li className="gn-comment gn-comment--deleted" id={`comment-${comment.commentId}`} data-testid={`comment-${comment.commentId}`}>
        <span className="gn-comment__avatar" aria-hidden="true">{initialsOf(name)}</span>
        <div className="gn-comment__column">
          <p className="gn-comment__meta">
            <strong className="gn-comment__name">{name}</strong>
            <span className="gn-comment__time">{formatDateTime(comment.deletedAt)}</span>
          </p>
          <p className="gn-comment__deleted">Comment deleted</p>
        </div>
      </li>
    );
  }

  const isAuthor = actions !== undefined && actions.currentUserId === comment.authorId;
  const canDelete = actions !== undefined && (isAuthor || actions.canModerate);
  const closeMenu = (): void => {
    setMenuOpen(false);
    moreRef.current?.focus();
  };

  return (
    <li className="gn-comment" id={`comment-${comment.commentId}`} data-testid={`comment-${comment.commentId}`}>
      <span className="gn-comment__avatar" aria-hidden="true">{initialsOf(name)}</span>
      <div className="gn-comment__column">
        <p className="gn-comment__meta">
          <strong className="gn-comment__name">{name}</strong>
          <span className="gn-comment__time">{formatDateTime(comment.recordedAt)}</span>
          {comment.editedAt == null ? null : (
            <button type="button" className="gn-comment__edited" aria-expanded={showEditTime} onClick={() => setShowEditTime((v) => !v)}>
              {showEditTime ? `Edited ${formatDateTime(comment.editedAt)}` : 'edited'}
            </button>
          )}
          {isAuthor || canDelete ? (
            <button
              ref={moreRef}
              type="button"
              className="gn-comment__more"
              aria-label={`More actions for ${name}'s comment`}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
            >
              …
            </button>
          ) : null}
        </p>
        {menuOpen ? (
          <div className="gn-comment__menu" role="menu" onKeyDown={(e) => { if (e.key === 'Escape') closeMenu(); }}>
            {isAuthor ? (
              <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); setEditing(true); }}>Edit</button>
            ) : null}
            {canDelete ? (
              <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); setConfirming(true); }}>Delete</button>
            ) : null}
          </div>
        ) : null}
        {editing && actions !== undefined ? (
          <div className="gn-comment__editing" onKeyDown={(e) => { if (e.key === 'Escape') setEditing(false); }}>
            {actions.renderEditor(comment, () => setEditing(false))}
            <button type="button" className="gn-button gn-button--quiet" onClick={() => setEditing(false)}>Cancel</button>
          </div>
        ) : (
          <div className="gn-comment__body">
            {renderCommentBody(comment.body, ticketHref ?? (() => null), isPurged ?? (() => false), `comment-${comment.commentId}`)}
          </div>
        )}
        {confirming && actions !== undefined ? (
          <div className="gn-comment__confirm" role="group" aria-label="Delete comment">
            <p>Delete this comment? It is removed for everyone.</p>
            <button
              type="button"
              className="gn-button gn-button--danger"
              aria-label="Delete comment"
              onClick={async () => {
                const refused = await actions.deleteComment(comment);
                setConfirming(false);
                setRefusal(refused);
              }}
            >
              Delete
            </button>
            <button type="button" className="gn-button gn-button--quiet" onClick={() => setConfirming(false)}>Cancel</button>
          </div>
        ) : null}
        {refusal === null ? null : <p className="gn-comment__refusal" role="alert">{refusal}</p>}
        {/* …the existing files row, unchanged */}
      </div>
    </li>
  );
}
```

(The menu's arrow-key movement uses the product's existing menu helper if one exists — `grep -rn 'role="menu"' packages/app-core/src` — rather than a second implementation; the case asserts Escape and focus return. Class names follow the shared button rules, Plan B "one primary per form" — Delete is the danger action of its own question, Save is the editor's one primary.)

`flows/comment-edits.ts`:

```ts
import type { EnvelopeSeed } from '../submit.js';

/** `comment.edited` against the comment's PARENT (MCP-everything spec §6): `commentId` is the `comment.added` id. */
export function commentEditedSeed(workspaceId: string, parent: { kind: 'ticket' | 'note'; id: string }, commentId: string, body: unknown): EnvelopeSeed {
  return { workspaceId, entity: parent, type: 'comment.edited', payload: { commentId, body } };
}

export function commentDeletedSeed(workspaceId: string, parent: { kind: 'ticket' | 'note'; id: string }, commentId: string): EnvelopeSeed {
  return { workspaceId, entity: parent, type: 'comment.deleted', payload: { commentId } };
}
```

`history-copy.ts`, beside `case 'comment.added':`:

```ts
    case 'comment.edited':
      return 'Comment edited';
    case 'comment.deleted':
      return 'Comment deleted';
```

`mappers.ts` `mapTicketComments` (and `mapNoteComments` the same):

```ts
    const optionalInstant = (value: unknown, at: string): string | null => {
      if (value === undefined || value === null) return null; // an older server sends neither
      if (typeof value !== 'string') throw new MappingError(at, 'an ISO instant or null');
      return value;
    };
    // …in the returned row:
      editedAt: optionalInstant(row['editedAt'], `${path}.editedAt`),
      deletedAt: optionalInstant(row['deletedAt'], `${path}.deletedAt`),
```

- [ ] **Step 4: Implement — the hosts.** `EditorSlotProps` (both `packages/editor/src/components/TicketEditorSlot.tsx` and `packages/app-core/src/views/editor-slot.tsx`, same text): `/** The submit button's label when the default ("Post" / "Save description") is wrong — an in-place comment edit says "Save". */ submitLabel?: string;`, and `TicketEditorSlot`'s button reads `{props.submitLabel ?? (isComment ? 'Post' : 'Save description')}`. In `ticket-sheet.tsx`, a new prop `canModerateComments?: boolean` and, beside `submitComment`:

```tsx
  const commentActions: CommentActions | undefined =
    editorSlot === undefined
      ? undefined
      : {
          currentUserId,
          canModerate: canModerateComments === true,
          renderEditor: (comment, done) => (
            <EditorSlot
              mode="comment"
              doc={comment.body}
              readOnly={false}
              workspaceId={workspaceId}
              ticketId={ticketId}
              submitLabel="Save"
              footerNote="Saving records an edit citing you."
              submit={async (submission) => {
                const body = submission.type === 'comment.added' ? submission.payload.body : null;
                if (body === null) return false;
                const [result] = await dataSource.ingest([make(commentEditedSeed(workspaceId, { kind: 'ticket', id: ticketId }, comment.commentId, body))]);
                if (result?.status !== 'committed') {
                  setServerRefusal(result?.status === 'refused' ? { rule: result.rule, reason: result.reason } : { rule: 'transport', reason: 'The server did not answer this change.' });
                  return false;
                }
                comments.reload();
                history.reload();
                done();
                return true;
              }}
            />
          ),
          deleteComment: async (comment) => {
            const [result] = await dataSource.ingest([make(commentDeletedSeed(workspaceId, { kind: 'ticket', id: ticketId }, comment.commentId))]);
            if (result?.status === 'committed') {
              comments.reload();
              history.reload();
              return null;
            }
            return result?.status === 'refused' ? result.reason : result?.status === 'invalid' ? result.message : 'The server did not answer this change.';
          },
        };
```

and the thread mount passes `actions={commentActions}` (with the same `{...(x === undefined ? {} : { actions: x })}` spelling the mount uses for `ticketHref`, for `exactOptionalPropertyTypes`). Read `IngestResult`'s real status union in `packages/domain/src/ingest-result.ts` and spell the refusal arms from it (an offline queue answer, if the union has one, is treated as success: close the editor, reload). `apps/web/src/notes/note-comments.tsx` does the same with `entity: { kind: 'note', id: noteId }` and a new required prop `canModerate: boolean`, which `note-document.tsx` passes from the workspace role it already resolves for `canEdit` (owner/admin ⇒ true). Each web `TicketSheet` host passes `canModerateComments={mayAdminister(viewer)}` where it already resolves the viewer (`apps/web/src/workspace-viewer.js`); a host with no viewer passes nothing (Delete is then offered to authors only — still correct, the gate decides).

- [ ] **Step 5: Styles (frontend-design).** `packages/ui/src/ui.css`: `.gn-comment__more` (a quiet icon button, `min-width`/`min-height: 2.75rem` — the 44 px floor), `.gn-comment__menu` (the shared popover surface tokens), `.gn-comment__edited` (inline, caption size, no button chrome, underline on focus-visible), `.gn-comment--deleted .gn-comment__deleted` (secondary text colour, italic), `.gn-comment__confirm` (a recessed row, Plan B B2 field surface), `.gn-comment__refusal` (the existing refusal colour token). Every colour from tokens, all three styles (hig/minimal/neo) and both themes; no new hex.

- [ ] **Step 6: The manual.** In `docs/manual.md`'s ticket comment section (`:599-610`) and the notes comment section, add:

```markdown
**Editing or deleting a comment.** Each comment you wrote has a **…** button: **Edit** opens it in place —
change it and press **Save**, or **Cancel** to leave it as it was. An edited comment says *edited* beside its
time; press that word (or hold it on a phone) to see when. **Delete** asks once — *Delete this comment? It is
removed for everyone.* — and leaves *Comment deleted*, with who wrote it and when, where it was. Only the person
who wrote a comment can edit it; they, or a workspace owner or admin, can delete it. Mentions you add in an
edit notify the new people only.
```

Then `pnpm help:generate > /tmp/mcpe-t5-h.log 2>&1; tail -3 /tmp/mcpe-t5-h.log` and `pnpm check:help`.

- [ ] **Step 7: Pass + battery.**

```bash
pnpm turbo run build --filter=@gisik-nokma/web... > /tmp/mcpe-t5-b.log 2>&1; tail -5 /tmp/mcpe-t5-b.log
pnpm --filter @gisik-nokma/app-core exec vitest run > /tmp/mcpe-t5-ac.log 2>&1; tail -15 /tmp/mcpe-t5-ac.log
pnpm --filter @gisik-nokma/editor exec vitest run > /tmp/mcpe-t5-ed.log 2>&1; tail -10 /tmp/mcpe-t5-ed.log
pnpm --filter @gisik-nokma/web exec vitest run > /tmp/mcpe-t5-web.log 2>&1; tail -15 /tmp/mcpe-t5-web.log
pnpm --filter @gisik-nokma/app-core typecheck && pnpm --filter @gisik-nokma/web typecheck && pnpm --filter @gisik-nokma/editor typecheck > /tmp/mcpe-t5-tc.log 2>&1; tail -10 /tmp/mcpe-t5-tc.log
pnpm check:help > /tmp/mcpe-t5-ch.log 2>&1; tail -5 /tmp/mcpe-t5-ch.log
```

(Web suites that time out at 5 s under load are rerun alone before being called red.) Mutations: Edit for moderators (26.112), submit on Cancel (26.113), delete without the question (26.114).

- [ ] **Step 8: Catalogue + commit.** Flip 26.110–26.119 ✅; 26.120 stays 🧪 for the controller's browser pass. Features.md §23:

```markdown
- ✅ **Edit and delete your comments, on tickets and notes** (MCP-everything T5; `packages/app-core/src/views/comments-thread.tsx`, `flows/comment-edits.ts`, `apps/web/src/notes/note-comments.tsx`) — a **…** button on each comment you may act on: **Edit** (the writer) opens the same editor in place with **Save**/**Cancel**; **Delete** (the writer, or a workspace owner/admin) asks *"Delete this comment? It is removed for everyone."* and leaves *Comment deleted* with author and time. An edited comment says *edited*; pressing it shows when. Both go through the app's one write door, so offline they queue like any change. The ticket History reads *Comment edited* / *Comment deleted*. Manual: the comments sections. Cases 26.110–26.120.
```

```bash
git branch --show-current   # task/mcp-e-5-comment-ui
git add packages/app-core packages/editor packages/ui apps/web docs/manual.md test-cases/26-comments-and-markdown.md Features.md
git commit -m "MCP everything 5: Edit and Delete a comment in the app, tickets and notes (26.110-26.120)"
git push -u origin task/mcp-e-5-comment-ui
```

DONE line: `DONE task/mcp-e-5-comment-ui <sha40>`.

---

### Task 6: MCP comments in Markdown — `add_comment` fixed, `list_comments`, `edit_comment`, `delete_comment`

**Lane:** `task/mcp-e-6-comment-tools` off `origin/release/mcp-everything` after T1, T2 and T3 merged. Parallel with T4, T5, T10–T12. T7, T8 and T9 wait for it (they import `markdown-io.ts`, or the editor dependency it adds). This is the task that fixes the owner's 13:37 defect.

**Files:**
- Modify: `packages/mcp-server/package.json` (dependency `"@gisik-nokma/editor": "workspace:*"`), `pnpm-lock.yaml`
- Create: `packages/mcp-server/src/tools/markdown-io.ts`
- Modify: `packages/mcp-server/src/tools/comment-tools.ts` (T3's empty factory), `src/tools/write-tools.ts:93-112` (`add_comment`)
- Modify (fixtures, own blocks only): `test/fixtures/tool-names.ts` (`comment begin/end`), `test/fixtures/tool-sweep.ts` (`comment begin/end`; and `add_comment`'s entry gains nothing — `text` stays valid)
- Test: `packages/mcp-server/test/comment-tools.test.ts` (new), `packages/mcp-server/test/write-tools.test.ts` (14.74 amended: a body is now a parsed document), `apps/server/test/mcp/mcp-comments.test.ts` (new, hosted)
- Catalogue: `test-cases/14-mcp-server.md` `### T6`, `test-cases/26-comments-and-markdown.md` (26.012 🧪 evidence), `Features.md` §14

**Interfaces:**
- Consumes: T1 `markdownToDoc`, `docToMarkdown`, `scanMarkdownRefs`, `MARKDOWN_SYNTAX_HELP`, `type DocJson` from `@gisik-nokma/editor/markdown-doc`; T2's events and read fields; T3's `envelopeFor` (any kind), `submitOne`.
- Produces (`tools/markdown-io.ts`): `markdownBody(session: Session, workspaceId: string, markdown: string): Promise<DocJson>` (throws one refusal naming every unresolvable token); `bodyAsMarkdown(doc: unknown): { markdown: string; lossy: string[] }`; `parentOf(args: { ticketId?: string; noteId?: string }, tool: string): { kind: 'ticket' | 'note'; id: string }`; re-export `MARKDOWN_SYNTAX_HELP`. Tools `list_comments`, `edit_comment`, `delete_comment`; `add_comment` gains `noteId` and `markdown` (`text` kept as an alias for one release).

Cases (`### T6 — comments in Markdown`):

```markdown
- ❌ **14.380 — through the hosted `/mcp`, `add_comment` with the owner's 13:37 text stores a comment whose document holds two `heading` nodes and a `bulletList`, never a paragraph of raw Markdown; the old `text` argument does exactly the same; both or neither is refused, sending nothing;** control: a one-line plain comment is one paragraph. Mutation: keep `plainTextToDoc` → the heading assertion fails.
- ❌ **14.381 — `add_comment` with `noteId` files `comment.added` against the NOTE (origin `mcp`); `ticketId` and `noteId` together, or neither, are refused naming the rule;** control: the ticket form. Mutation: always file against a ticket → the note case is refused by the gate.
- ❌ **14.382 — a mention written `@[Name](user:<id>)` for a workspace member is stored as a `mention` node labelled with the roster's name, and that member gets a mention notification;** control: a plain `@Asha` is text and notifies nobody. Mutation: drop the `user` resolver → the mention is refused.
- ❌ **14.383 — an unknown mention, ticket key or note is refused BEFORE anything is sent, naming each token (`unknown mention @[X](user:…)`, `unknown ticket [[ZZ-9]]`, `unknown note [[note:Nowhere]]`);** control: the resolvable body is sent. Mutation: send the body with the problems ignored → an event is written.
- ❌ **14.384 — `[[KEY-12]]` resolves only to a search hit whose key is EXACTLY that key (a hit for `CCSO-40` does not answer `[[CCSO-4]]`), and a note ref matches a note id or ONE exact title — two notes with that title is a refusal saying to use the id;** control: the exact key resolves. Mutation: take the first search hit → the wrong ticket is referenced.
- ❌ **14.385 — `list_comments` (ticket or note) answers each comment's `markdown`, `lossy`, `editedAt`, `deleted`, author and time; a deleted comment's `markdown` is `null`;** control: an untouched comment has `editedAt: null`, `deleted: false`. Mutation: return the stored JSON body → `markdown` is missing.
- ❌ **14.386 — `edit_comment` emits ONE `comment.edited { commentId, body }` against the given ticket or note (origin `mcp`); editing someone else's comment returns the gate's sentence VERBATIM;** control: the author's edit commits. Mutation: reword the refusal → the verbatim assertion fails.
- ❌ **14.387 — `delete_comment` emits ONE `comment.deleted { commentId }`; a member deleting another's comment gets the gate's sentence verbatim;** control: the author's delete commits. Mutation: send `comment.edited` with an empty body instead → red.
- ❌ **14.388 — every description of the four comment tools carries `MARKDOWN_SYNTAX_HELP` (the mention, ref and image forms), so an assistant learns the syntax from the tool list;** control: `list_comments`' description says bodies come back as Markdown. Mutation: drop the help from `add_comment` → red.
- ❌ **14.389 — the door matrix (hosted): for each of the four tools, a stranger gets the exact uniform not-found sentence (reads) or the product's refusal (writes), the member is refused editing/deleting the owner's comment in the gate's words, and the allowed caller's event is in the ledger with `origin: 'mcp'`; `list_comments` pages (cursor/limit);** control: the allowed calls. Mutation: `session.get` without `readOrNotFound` in `list_comments` → the stranger reads "gisik-nokma answered 404".
```

- [ ] **Step 1: Dependency.** Add `"@gisik-nokma/editor": "workspace:*"` to `packages/mcp-server/package.json` `dependencies`; `pnpm install > /tmp/mcpe-t6-i.log 2>&1; tail -5 /tmp/mcpe-t6-i.log`.

- [ ] **Step 2: Failing package tests.** `packages/mcp-server/test/comment-tools.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { domainRegistry, parseEvent } from '@gisik-nokma/domain';
import { HttpError } from '../src/http-client.js';
import type { Session } from '../src/session.js';
import { commentTools } from '../src/tools/comment-tools.js';
import { writeTools } from '../src/tools/write-tools.js';
import { NO_TRANSFER } from './fixtures/fake-session.js';

const ulid = (tag: string) => `01J0${tag}`.padEnd(26, '0');
const ME = ulid('ME');
const ASHA = ulid('ASHA');
const WS = ulid('WS');
const T = ulid('TKT');
const N = ulid('N0TE');
const C = ulid('CMNT');
const COMMITTED = { results: [{ status: 'committed', eventId: 'e', seq: 1, serverTime: '2026-10-02T10:00:00.000Z' }] };

function fake(routes: Record<string, unknown> = {}) {
  const sent: Array<Record<string, unknown>> = [];
  const asked: string[] = [];
  const session: Session = {
    userId: () => ME,
    get: async (path) => {
      asked.push(path);
      for (const [prefix, body] of Object.entries(routes)) if (path.startsWith(prefix)) return body;
      if (path.endsWith('/members')) return { members: [{ userId: ASHA, displayName: 'Asha Marak', role: 'member' }] };
      if (path.startsWith('/v1/search')) return { hits: [{ card: { ticketId: ulid('T40'), projectId: ulid('P'), key: 'CCSO-40', title: 'Not it' } }, { card: { ticketId: T, projectId: ulid('P'), key: 'CCSO-4', title: 'Chiller' } }], notes: [] };
      if (path.endsWith('/notes')) return { notes: [{ noteId: N, title: 'Cold room' }, { noteId: ulid('D1'), title: 'Twice' }, { noteId: ulid('D2'), title: 'Twice' }] };
      return {};
    },
    post: async () => ({}),
    postEvents: async (events) => {
      sent.push(...(events as Array<Record<string, unknown>>));
      return COMMITTED;
    },
    ...NO_TRANSFER,
  };
  return { session, sent, asked };
}
const tool = (name: string, s: Session) => {
  const t = [...writeTools(s), ...commentTools(s)].find((x) => x.name === name);
  if (t === undefined) throw new Error(name);
  return t;
};
type Node = { type: string; attrs?: Record<string, unknown>; content?: Node[] };
const blocks = (e: Record<string, unknown> | undefined) => ((e?.['payload'] as { body: { content: Node[] } }).body.content ?? []);

describe('14.380–14.388 comments in Markdown', () => {
  const BRIEF = "# Achri's Brief\n\n### 1. Where we are\n\n- responding to the cold-room ticket\n- waiting on the chiller part";

  it('14.380 add_comment stores a document; `text` is the same; both/neither refused', async () => {
    for (const key of ['markdown', 'text']) {
      const f = fake();
      await tool('add_comment', f.session).handler({ workspaceId: WS, ticketId: T, [key]: BRIEF });
      expect(blocks(f.sent[0]).map((b) => b.type), key).toEqual(['heading', 'heading', 'bulletList']);
      expect(parseEvent({ ...f.sent[0], serverTime: '2026-10-02T10:00:00.000Z', seq: 1 }, domainRegistry).ok).toBe(true);
    }
    const f = fake();
    await expect(tool('add_comment', f.session).handler({ workspaceId: WS, ticketId: T, markdown: 'a', text: 'b' })).rejects.toThrow(/exactly one of markdown or text/);
    await expect(tool('add_comment', f.session).handler({ workspaceId: WS, ticketId: T })).rejects.toThrow(/exactly one of markdown or text/);
    expect(f.sent).toEqual([]);
  });

  it('14.381 noteId files against the note; both or neither parent refused', async () => {
    const f = fake();
    await tool('add_comment', f.session).handler({ workspaceId: WS, noteId: N, markdown: 'hello' });
    expect(f.sent[0]).toMatchObject({ type: 'comment.added', entity: { kind: 'note', id: N }, origin: 'mcp', actorId: ME });
    await expect(tool('add_comment', f.session).handler({ workspaceId: WS, ticketId: T, noteId: N, markdown: 'x' })).rejects.toThrow('add_comment takes exactly one of ticketId or noteId');
  });

  it('14.382 / 14.384 mention, exact key and note title resolve; ambiguity refuses', async () => {
    const f = fake();
    await tool('add_comment', f.session).handler({ workspaceId: WS, ticketId: T, markdown: `@[Asha](user:${ASHA}) see [[CCSO-4]] and [[note:Cold room]] and @Asha` });
    const inline = blocks(f.sent[0])[0]?.content ?? [];
    expect(inline.filter((n) => n.type !== 'text')).toEqual([
      { type: 'mention', attrs: { userId: ASHA, label: 'Asha Marak' } },
      { type: 'ticketRef', attrs: { ticketId: T, projectId: ulid('P'), key: 'CCSO-4', title: 'Chiller' } },
      { type: 'wikiLink', attrs: { noteId: N, title: 'Cold room' } },
    ]);
    await expect(tool('add_comment', fake().session).handler({ workspaceId: WS, ticketId: T, markdown: '[[note:Twice]]' })).rejects.toThrow(
      'two or more notes are titled "Twice"; write [[note:<note id>]] instead',
    );
  });

  it('14.383 unknown tokens refuse before anything is sent', async () => {
    const f = fake();
    const stranger = ulid('STRNGR');
    await expect(
      tool('add_comment', f.session).handler({ workspaceId: WS, ticketId: T, markdown: `@[X](user:${stranger}) [[ZZ-9]] [[note:Nowhere]]` }),
    ).rejects.toThrow(`the Markdown was not stored: unknown mention @[X](user:${stranger}); unknown ticket [[ZZ-9]]; unknown note [[note:Nowhere]]`);
    expect(f.sent).toEqual([]);
  });

  it('14.385 list_comments answers Markdown, flags and lossy', async () => {
    const body = { type: 'doc', content: [{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Hi' }] }] };
    const f = fake({
      [`/v1/workspaces/${WS}/tickets/${T}/comments`]: {
        comments: [
          { commentId: C, authorId: ASHA, body, recordedAt: '2026-10-02T09:00:00.000Z', editedAt: '2026-10-02T09:05:00.000Z', deletedAt: null, files: [] },
          { commentId: ulid('G0NE'), authorId: ASHA, body: null, recordedAt: '2026-10-02T09:01:00.000Z', editedAt: null, deletedAt: '2026-10-02T09:06:00.000Z', files: [] },
        ],
      },
    });
    const out = (await tool('list_comments', f.session).handler({ workspaceId: WS, ticketId: T })) as { comments: Array<Record<string, unknown>> };
    expect(out.comments).toEqual([
      { commentId: C, authorId: ASHA, recordedAt: '2026-10-02T09:00:00.000Z', editedAt: '2026-10-02T09:05:00.000Z', deleted: false, markdown: '## Hi', lossy: [], files: [] },
      { commentId: ulid('G0NE'), authorId: ASHA, recordedAt: '2026-10-02T09:01:00.000Z', editedAt: null, deleted: true, markdown: null, lossy: [], files: [] },
    ]);
  });

  it('14.386 / 14.387 edit and delete emit one event each; refusals verbatim', async () => {
    const f = fake();
    await tool('edit_comment', f.session).handler({ workspaceId: WS, noteId: N, commentId: C, markdown: '**new**' });
    await tool('delete_comment', f.session).handler({ workspaceId: WS, ticketId: T, commentId: C });
    expect(f.sent.map((e) => [e['type'], (e['entity'] as { kind: string }).kind, (e['payload'] as { commentId: string }).commentId])).toEqual([
      ['comment.edited', 'note', C],
      ['comment.deleted', 'ticket', C],
    ]);
    const refused: Session = {
      ...f.session,
      postEvents: async () => ({ results: [{ status: 'refused', eventId: 'e', rule: 'permission.comment', reason: 'Only the person who wrote a comment can edit it.' }] }),
    };
    await expect(tool('edit_comment', refused).handler({ workspaceId: WS, ticketId: T, commentId: C, markdown: 'x' })).rejects.toThrow(
      'refused by permission.comment: Only the person who wrote a comment can edit it.',
    );
  });

  it('14.388 every comment tool teaches the syntax', () => {
    const s = fake().session;
    for (const name of ['add_comment', 'edit_comment']) expect(tool(name, s).description).toContain('@[Their Name](user:<userId>)');
    expect(tool('list_comments', s).description).toMatch(/Markdown/);
  });
});
```

Hosted (`apps/server/test/mcp/mcp-comments.test.ts`): copy the bootstrap and `call` helper of `mcp-crud-round-trip.test.ts:21-56`; found a workspace, a project and a ticket with `create_workspace` / `create_project` / `create_ticket`; a second signed-in member joins by `membership.granted` + `project.member_added` through `/v1/events` as the owner; then:

```ts
    const brief = "# Achri's Brief\n\n### 1. Where we are\n\n- responding to the cold-room ticket\n- waiting on the chiller part";
    const added = await call('add_comment', { workspaceId, ticketId, markdown: `${brief}\n\n@[Ravi](user:${member.userId})` });
    expect(added.isError).toBe(false);
    const { rows } = await db.pool.query<{ body: { content: Array<{ type: string }> } }>(
      'SELECT body FROM proj_ticket_comments WHERE ticket_id = $1', [ticketId]);
    expect(rows[0]?.body.content.map((n) => n.type)).toEqual(['heading', 'heading', 'bulletList', 'paragraph']); // 14.380
    const notified = await db.pool.query(`SELECT 1 FROM notifications WHERE user_id = $1 AND kind = 'mention'`, [member.userId]);
    expect(notified.rowCount).toBe(1); // 14.382
    const plain = await call('add_comment', { workspaceId, ticketId, markdown: 'just a line' });
    expect(plain.isError).toBe(false); // control: one paragraph
```

The door matrix (14.389, spec §8 — every tool, three callers), in the same hosted file:

```ts
import { NOT_A_MEMBER_REASON, PERMISSION_ROLE_RULE } from '../../src/permissions/check-permission.js';
import { COMMENT_DELETE_AUTHORITY_REASON, COMMENT_EDIT_AUTHOR_REASON, COMMENT_PERMISSION_RULE } from '../../src/permissions/check-comment-authority.js';
import { buildDoorWorld, runDoorMatrix } from './helpers/door-matrix.js';

const NOT_MEMBER = `refused by ${PERMISSION_ROLE_RULE}: ${NOT_A_MEMBER_REASON}`;
it('14.389 every comment tool: stranger, forbidden member, allowed caller', async () => {
  const w = await buildDoorWorld(db, '2389');
  const onTicket = (extra: Record<string, unknown>) => (x: typeof w) => ({ workspaceId: x.workspaceId, ticketId: x.ticketId, ...extra });
  await runDoorMatrix(w, [
    { tool: 'list_comments', args: onTicket({}), stranger: 'ticket not found or not visible to you', allowed: { caller: 'member' } },
    { tool: 'add_comment', args: onTicket({ markdown: 'From the matrix' }), stranger: NOT_MEMBER, allowed: { caller: 'member', eventType: 'comment.added' } },
    { tool: 'edit_comment', args: (x) => ({ workspaceId: x.workspaceId, ticketId: x.ticketId, commentId: x.commentId, markdown: 'edited' }), stranger: NOT_MEMBER,
      forbidden: { text: `refused by ${COMMENT_PERMISSION_RULE}: ${COMMENT_EDIT_AUTHOR_REASON}` }, allowed: { caller: 'owner', eventType: 'comment.edited' } },
    { tool: 'delete_comment', args: (x) => ({ workspaceId: x.workspaceId, ticketId: x.ticketId, commentId: x.commentId }), stranger: NOT_MEMBER,
      forbidden: { text: `refused by ${COMMENT_PERMISSION_RULE}: ${COMMENT_DELETE_AUTHORITY_REASON}` }, allowed: { caller: 'owner', eventType: 'comment.deleted' } },
  ]);
});
```

(If the stranger's write answers a different rule than `NOT_A_MEMBER_REASON` — read `checkRolePermission`'s first branches, `check-permission.ts:655-720` — the row uses that exported constant instead; the assertion stays exact.)

- [ ] **Step 3: Run to fail.** `pnpm --filter @gisik-nokma/mcp-server exec vitest run test/comment-tools.test.ts > /tmp/mcpe-t6.log 2>&1; tail -30 /tmp/mcpe-t6.log`.

- [ ] **Step 4: Implement.** `packages/mcp-server/src/tools/markdown-io.ts`:

```ts
import {
  docToMarkdown,
  markdownToDoc,
  MARKDOWN_SYNTAX_HELP,
  scanMarkdownRefs,
  type DocJson,
  type RefResolver,
} from '@gisik-nokma/editor/markdown-doc';
import { HttpError } from '../http-client.js';
import type { Session } from '../session.js';

export { MARKDOWN_SYNTAX_HELP };

type Person = { userId: string; displayName: string };
type TicketHit = { card: { ticketId: string; projectId: string; key: string | null; title: string } };
type NoteRow = { noteId: string; title: string };

const enc = encodeURIComponent;

/** The people a body may mention: the roster, or for a guest the people on their own tickets (the `list_members` rule). */
async function peopleOf(session: Session, workspaceId: string): Promise<Person[]> {
  const base = `/v1/workspaces/${enc(workspaceId)}`;
  try {
    return ((await session.get(`${base}/members`)) as { members: Person[] }).members;
  } catch (error) {
    if (!(error instanceof HttpError && error.status === 404)) throw error;
    return ((await session.get(`${base}/actor-names`)) as { names: Person[] }).names;
  }
}

/** A key resolves only to the hit whose key is EXACTLY it — the search ranks `CCSO-40` beside `CCSO-4` (case 14.384). */
async function ticketByKey(session: Session, workspaceId: string, key: string) {
  const query = new URLSearchParams({ workspaceId, q: key, kinds: 'ticket' });
  const { hits } = (await session.get(`/v1/search?${query.toString()}`)) as { hits: TicketHit[] };
  const hit = hits.find((h) => h.card.key === key);
  return hit === undefined ? null : { ticketId: hit.card.ticketId, projectId: hit.card.projectId, key, title: hit.card.title };
}

/**
 * Markdown → the stored document (spec §3). Reads ONLY what the body names (no roster read for a body with
 * no mention), resolves through the product's own reads — so a person, ticket or note the caller cannot see
 * cannot be referenced — and refuses with every unresolvable token named. Nothing is sent on a refusal.
 */
export async function markdownBody(session: Session, workspaceId: string, markdown: string): Promise<DocJson> {
  const refs = scanMarkdownRefs(markdown);
  const people = refs.userIds.length === 0 ? [] : await peopleOf(session, workspaceId);
  const tickets = new Map<string, Awaited<ReturnType<typeof ticketByKey>>>();
  for (const key of refs.ticketKeys) tickets.set(key, await ticketByKey(session, workspaceId, key));
  const notes = refs.noteRefs.length === 0 ? [] : ((await session.get(`/v1/workspaces/${enc(workspaceId)}/notes`)) as { notes: NoteRow[] }).notes;
  const extra: string[] = [];
  const resolve: RefResolver = {
    user: (id) => {
      const person = people.find((p) => p.userId === id);
      return person === undefined ? null : { userId: person.userId, label: person.displayName };
    },
    ticket: (key) => tickets.get(key) ?? null,
    note: (ref) => {
      const byId = notes.find((n) => n.noteId === ref);
      if (byId !== undefined) return { noteId: byId.noteId, title: byId.title };
      const titled = notes.filter((n) => n.title === ref);
      if (titled.length > 1) {
        extra.push(`two or more notes are titled "${ref}"; write [[note:<note id>]] instead`);
        return { noteId: titled[0]!.noteId, title: ref }; // placeholder; the refusal below stops the write
      }
      return titled[0] === undefined ? null : { noteId: titled[0].noteId, title: titled[0].title };
    },
  };
  const { doc, problems } = markdownToDoc(markdown, resolve);
  const all = [...problems, ...extra];
  if (extra.length > 0 && problems.length === 0) throw new Error(extra.join('; '));
  if (all.length > 0) throw new Error(`the Markdown was not stored: ${all.join('; ')}`);
  return doc;
}

export function bodyAsMarkdown(doc: unknown): { markdown: string; lossy: string[] } {
  return docToMarkdown(doc);
}

/** Exactly one of `ticketId` / `noteId` — a comment, an attachment and a body all belong to ONE parent. */
export function parentOf(args: { ticketId?: string | undefined; noteId?: string | undefined }, tool: string): { kind: 'ticket' | 'note'; id: string } {
  if ((args.ticketId === undefined) === (args.noteId === undefined)) throw new Error(`${tool} takes exactly one of ticketId or noteId`);
  return args.ticketId !== undefined ? { kind: 'ticket', id: args.ticketId } : { kind: 'note', id: args.noteId as string };
}
```

`comment-tools.ts` replaces T3's stub:

```ts
import { z } from 'zod';
import type { Session } from '../session.js';
import { bodyAsMarkdown, markdownBody, MARKDOWN_SYNTAX_HELP, parentOf } from './markdown-io.js';
import type { ToolDefinition } from './read-tools.js';
import { page, pageArgs, readOrNotFound } from './reads.js';
import { envelopeFor, submitOne } from './submit.js';

const id = z.string().min(1);
const parentShape = { workspaceId: id, ticketId: id.optional(), noteId: id.optional() };
type Row = { commentId: string; authorId: string; body: unknown; recordedAt: string; editedAt?: string | null; deletedAt?: string | null; files?: unknown[] };

export function commentTools(session: Session): ToolDefinition[] {
  return [
    {
      name: 'list_comments',
      description:
        'The comments on one ticket (ticketId) or one note (noteId), oldest first. Each body comes back as Markdown, ' +
        'with `lossy` naming anything Markdown cannot show, `editedAt` when it was edited, and `deleted: true` (no text) ' +
        'for a deleted comment. Pages with cursor/limit (default 50, max 200). Use the commentId with edit_comment or delete_comment.',
      inputSchema: { ...parentShape, ...pageArgs },
      handler: async (args) => {
        const a = z.object({ ...parentShape, ...pageArgs }).parse(args);
        const parent = parentOf(a, 'list_comments');
        const path =
          parent.kind === 'ticket'
            ? `/v1/workspaces/${encodeURIComponent(a.workspaceId)}/tickets/${encodeURIComponent(parent.id)}/comments`
            : `/v1/notes/${encodeURIComponent(parent.id)}/comments`;
        const { comments } = (await readOrNotFound(session, path, parent.kind)) as { comments: Row[] };
        const { items, nextCursor } = page(comments, a.cursor, a.limit);
        return {
          nextCursor,
          comments: items.map((c) => {
            const deleted = c.deletedAt != null;
            const md = deleted ? { markdown: null, lossy: [] as string[] } : bodyAsMarkdown(c.body);
            return { commentId: c.commentId, authorId: c.authorId, recordedAt: c.recordedAt, editedAt: c.editedAt ?? null, deleted, ...md, files: c.files ?? [] };
          }),
        };
      },
    },
    {
      name: 'edit_comment',
      description:
        `Replace the text of a comment you wrote, on a ticket (ticketId) or a note (noteId). Only the person who wrote a comment can edit it; mentions you ADD notify those people. ${MARKDOWN_SYNTAX_HELP}`,
      inputSchema: { ...parentShape, commentId: id, markdown: z.string().min(1) },
      handler: async (args) => {
        const a = z.object({ ...parentShape, commentId: id, markdown: z.string().min(1) }).parse(args);
        const parent = parentOf(a, 'edit_comment');
        const body = await markdownBody(session, a.workspaceId, a.markdown);
        return submitOne(session, envelopeFor(session, a.workspaceId, parent, 'comment.edited', { commentId: a.commentId, body }));
      },
    },
    {
      name: 'delete_comment',
      description:
        'Delete a comment on a ticket (ticketId) or a note (noteId). The person who wrote it, or a workspace owner or admin, can. ' +
        'Its text disappears for everyone and "Comment deleted" stays in the thread with who wrote it and when.',
      inputSchema: { ...parentShape, commentId: id },
      handler: async (args) => {
        const a = z.object({ ...parentShape, commentId: id }).parse(args);
        const parent = parentOf(a, 'delete_comment');
        return submitOne(session, envelopeFor(session, a.workspaceId, parent, 'comment.deleted', { commentId: a.commentId }));
      },
    },
  ];
}
```

`write-tools.ts` `add_comment`:

```ts
    {
      name: 'add_comment',
      description: `Add a comment to a ticket (ticketId) or a note (noteId), attributed to you. ${MARKDOWN_SYNTAX_HELP} (\`text\` is the old name of \`markdown\` and is read the same way.)`,
      inputSchema: { workspaceId: z.string().min(1), ticketId: z.string().min(1).optional(), noteId: z.string().min(1).optional(), markdown: z.string().min(1).optional(), text: z.string().min(1).optional() },
      handler: async (args) => {
        const a = z
          .object({ workspaceId: z.string().min(1), ticketId: z.string().min(1).optional(), noteId: z.string().min(1).optional(), markdown: z.string().min(1).optional(), text: z.string().min(1).optional() })
          .parse(args);
        const parent = parentOf(a, 'add_comment');
        if ((a.markdown === undefined) === (a.text === undefined)) throw new Error('add_comment takes exactly one of markdown or text');
        // MARKDOWN, not `plainTextToDoc` (the 13:37 defect): the converter stores headings, lists and mentions as the editor would.
        const body = await markdownBody(session, a.workspaceId, (a.markdown ?? a.text) as string);
        return submitOne(session, envelopeFor(session, a.workspaceId, parent, 'comment.added', { body }));
      },
    },
```

(`plainTextToDoc` leaves `write-tools.ts`' imports. `transition_ticket`'s `comment` stays plain text: `workflow.ts`' transition payload is `{ text }`, not a document.) Fixture blocks: `tool-names.ts` `comment` block → `'list_comments', 'edit_comment', 'delete_comment',`; `tool-sweep.ts` `comment` block → `list_comments: { args: { workspaceId: 'w', ticketId: 't' }, session: { get: async () => ({ comments: [] }) } }, edit_comment: { args: { workspaceId: 'w', ticketId: 't', commentId: 'c', markdown: 'x' } }, delete_comment: { args: { workspaceId: 'w', ticketId: 't', commentId: 'c' } },`.

- [ ] **Step 5: Pass + battery + 26.012.**

```bash
pnpm turbo run build --filter=@gisik-nokma/server... > /tmp/mcpe-t6-b.log 2>&1; tail -5 /tmp/mcpe-t6-b.log
pnpm --filter @gisik-nokma/mcp-server exec vitest run > /tmp/mcpe-t6-p.log 2>&1; tail -15 /tmp/mcpe-t6-p.log
pnpm --filter @gisik-nokma/server exec vitest run test/mcp > /tmp/mcpe-t6-s.log 2>&1; tail -15 /tmp/mcpe-t6-s.log
pnpm --filter @gisik-nokma/mcp-server typecheck > /tmp/mcpe-t6-tc.log 2>&1; tail -10 /tmp/mcpe-t6-tc.log
rm -rf /tmp/mcpe-deploy && pnpm deploy --prod --filter=@gisik-nokma/server /tmp/mcpe-deploy > /tmp/mcpe-t6-dep.log 2>&1; tail -5 /tmp/mcpe-t6-dep.log
cd /tmp/mcpe-deploy && node --input-type=module -e "import('@gisik-nokma/editor/markdown-doc').then(m => console.log(typeof m.markdownToDoc, typeof globalThis.document))"
```

Expected last line: `function undefined`. Paste it into 26.012's evidence and flip it ✅🧪 (manual, evidenced). Mutation: keep `plainTextToDoc` (14.380).

- [ ] **Step 6: Catalogue + commit.** Flip 14.380–14.389. Features.md §14:

```markdown
- ✅ **Comments through the assistant are Markdown, on tickets and notes, and can be listed, edited and deleted** (MCP-everything T6; `packages/mcp-server/src/tools/markdown-io.ts`, `comment-tools.ts`, `write-tools.ts`) — `add_comment` (ticketId or noteId; `markdown`, or `text` as its old name) stores headings, lists, mentions (`@[Name](user:<id>)`, which notify), ticket refs (`[[KEY-12]]`, exact key only) and note links (`[[note:<title or id>]]`) as real document nodes — the fix for raw `#`/`-` showing in comments (owner, 2 Oct 13:37); anything unresolvable is refused by name before anything is sent. `list_comments` answers Markdown with `lossy`, `editedAt`, `deleted`; `edit_comment` / `delete_comment` follow the product's rules (writer edits; writer or owner/admin deletes). Cases 14.380–14.389.
```

```bash
git branch --show-current   # task/mcp-e-6-comment-tools
git add packages/mcp-server pnpm-lock.yaml apps/server/test/mcp/mcp-comments.test.ts test-cases Features.md
git commit -m "MCP everything 6: Markdown comments — add_comment fixed, list/edit/delete_comment (14.380-14.389, 26.012)"
git push -u origin task/mcp-e-6-comment-tools
```

DONE line: `DONE task/mcp-e-6-comment-tools <sha40>`.

---

### Task 7: MCP note tools

**Lane:** `task/mcp-e-7-note-tools` off `origin/release/mcp-everything` after T6 merged (it reuses `markdown-io.ts`). Parallel with T8–T12.

**Files:**
- Modify: `packages/mcp-server/src/tools/note-tools.ts` (T3's stub), fixture blocks `note begin/end` in `test/fixtures/tool-names.ts` and `tool-sweep.ts`
- Test: `packages/mcp-server/test/note-tools.test.ts` (new), `apps/server/test/mcp/mcp-notes.test.ts` (new, hosted)
- Catalogue: `test-cases/14-mcp-server.md` `### T7`, `Features.md` §14

**Interfaces:**
- Consumes: T6 `markdownBody`, `bodyAsMarkdown`, `MARKDOWN_SYNTAX_HELP`; T1 `spliceDoc`, `type BodyEdit`; T3 `confirmOrPreview`, `submitBatch`, `envelopeFor`; domain `collectImageAttachmentIds`, `newUlid`.
- Produces: tools `list_notes`, `get_note`, `create_note`, `update_note`, `link_note`, `delete_note`, `restore_note`, `get_note_history`; exported `readNote(session: Session, noteId: string): Promise<NoteDetailWire>` (T13's round trip reuses it) where `NoteDetailWire = { noteId: string; workspaceId: string; homeProjectId: string; authorId: string; title: string; scope: unknown; attachedTickets: unknown[]; deleted: boolean; createdAt: string; updatedAt: string; body: unknown }` (the `{ note }` of `GET /v1/notes/:id`, `routes/notes.ts:79-85`).

Cases (`### T7 — notes`):

```markdown
- ❌ **14.400 — `list_notes` reads `GET /v1/workspaces/:id/notes` with `home`/`author` (`"me"` = the caller)/`scope`/`deleted=1` and pages the answer itself (`limit` default 50, max 200, opaque `cursor`, `nextCursor: null` on the last page);** control: no filters → no query string. Mutation: ignore `include: ['deleted']` → deleted notes are absent.
- ❌ **14.401 — `get_note` answers the metadata, the body as `markdown` with `lossy`, the attached tickets and `images` (the attachment ids the body embeds) — never the raw document; an unreadable or unknown note is "note not found or not visible to you";** control: a note with no body answers `markdown: ''`. Mutation: return `body` → red.
- ❌ **14.402 — `create_note` emits ONE `note.created { title, homeProjectId: projectId ?? '', scope, body?, attachTicketId? }` with a fresh ULID, scope defaulting to `private` (to `inherit` when `attachTicketId` is given, as the app's dialog does), `explicit` requiring `explicitUserIds`; the reply carries `noteId`;** control: the envelope passes `parseEvent`. Mutation: default scope `workspace` → red.
- ❌ **14.403 — `update_note` sends ONE batch of exactly the events its arguments imply — `note.renamed`, `note.body_set` (mode `replace` | `append` | `replace_section` via `spliceDoc`, outside nodes byte-identical), `note.scope_set`, `note.moved` — and refuses no-op calls and a missing section (naming the headings), sending nothing; a `replace` reply lists what the old body had that Markdown dropped (`lossy`);** control: title only → one `note.renamed`. Mutation: always send `note.body_set` → red.
- ❌ **14.404 — through the hosted door, a note body with `@[Name](user:<id>)` for a reader notifies them, and for a member who cannot read the (private) note writes no notification** (Review Focus 2); control: the reader's row. Mutation: none in this package (the gate is the fan-out's; guard).
- ❌ **14.405 — `link_note` emits `note.attached` / `note.detached { ticketId }`; a refusal (a ticket the caller cannot see) comes back verbatim;** control: attach then detach. Mutation: send `note.attached` for `detach` → red.
- ❌ **14.406 — `delete_note` without the exact current TITLE answers a preview ("Moves the note … to Deleted items; it can be restored for 15 days.") and sends nothing; with it, ONE `note.deleted {}`; `restore_note` needs no name and sends `note.restored {}`;** control: the exact title commits. Mutation: compare titles case-insensitively → red.
- ❌ **14.407 — `get_note_history` lists the versions (`eventId`, author, time); with `versionId` it answers that version as Markdown with `lossy`;** control: an unknown version id is "note version not found or not visible to you". Mutation: return the raw body → red.
- ❌ **14.408 — the door matrix (hosted): every note tool answers a stranger "note not found or not visible to you" (or an empty list, or the product's not-a-member refusal for `create_note`), refuses a non-author member's rename/delete in the gate's words, hides a private note from the member with the same not-found, and writes the allowed caller's event with `origin: 'mcp'`;** control: the allowed calls. Mutation: let `readNote` rethrow the bare 404 → "gisik-nokma answered 404".
```

- [ ] **Step 1: Failing tests.** `packages/mcp-server/test/note-tools.test.ts` uses T6's `fake` shape (copy it) with routes for `/v1/notes/<N>` → `{ note: { noteId: N, workspaceId: WS, homeProjectId: '', authorId: ME, title: 'Cold room', scope: { mode: 'private' }, attachedTickets: [], deleted: false, createdAt, updatedAt, body } }`, where `body` holds `h2 "Risks"`, a paragraph and `h2 "Owners"`. Then:

```ts
  it('14.403 update_note sends one batch of exactly the implied events; section edits splice', async () => {
    const f = fake(NOTE_ROUTES);
    await tool('update_note', f.session).handler({ noteId: N, title: 'Cold room 2', markdown: 'new risk', mode: 'replace_section', section: 'Risks' });
    expect(f.batches).toHaveLength(1);
    expect(f.batches[0]!.map((e) => e['type'])).toEqual(['note.renamed', 'note.body_set']);
    const content = (f.batches[0]![1]!['payload'] as { body: { content: Array<{ type: string }> } }).body.content;
    expect(JSON.stringify(content[0])).toBe(JSON.stringify(NOTE_BODY.content[0])); // the Risks heading, byte-identical
    expect(JSON.stringify(content.at(-1))).toBe(JSON.stringify(NOTE_BODY.content.at(-1))); // Owners' paragraph
    await expect(tool('update_note', f.session).handler({ noteId: N })).rejects.toThrow('update_note needs at least one of title, markdown, scope or projectId');
    await expect(tool('update_note', f.session).handler({ noteId: N, markdown: 'x', mode: 'replace_section', section: 'Nope' })).rejects.toThrow(
      'section "Nope" not found; the headings are: "Risks", "Owners"',
    );
    expect(f.batches).toHaveLength(1);
    await tool('update_note', f.session).handler({ noteId: N, title: 'Only a title' }); // control
    expect(f.batches[1]!.map((e) => e['type'])).toEqual(['note.renamed']);
  });

  it('14.406 delete_note previews without the exact title; restore needs none', async () => {
    const f = fake(NOTE_ROUTES);
    const preview = await tool('delete_note', f.session).handler({ noteId: N, confirm_name: 'cold room' });
    expect(preview).toMatchObject({ preview: true, nothingChanged: true, confirm: 'confirm_name must be "Cold room"' });
    expect(f.batches).toEqual([]);
    await tool('delete_note', f.session).handler({ noteId: N, confirm_name: 'Cold room' });
    await tool('restore_note', f.session).handler({ noteId: N });
    expect(f.batches.flat().map((e) => e['type'])).toEqual(['note.deleted', 'note.restored']);
  });
```

plus 14.400 (query strings asserted from `f.asked`; 120 notes → pages of 50/50/20 with `nextCursor` `'50'`, `'100'`, `null`), 14.401 (no `body` key in the answer; `markdown`, `lossy`, `images`), 14.402 (`parseEvent` ok; scope defaults), 14.405 (types), 14.407 (`/history` then `/history/<V>`), each in the same `fake`/`tool` shape. `fake` here collects `batches` (one array per `postEvents` call) rather than a flat `sent`. Hosted 14.404 (`apps/server/test/mcp/mcp-notes.test.ts`, the `mcp-crud-round-trip` bootstrap): `create_note` with `scope: 'private'` and a body mentioning a second member → no notification row for them (`SELECT … FROM notifications WHERE user_id = $1`); the owner's `update_note` adding a mention of themself is excluded by the self rule, so the control is a `workspace`-scoped note mentioning the member → one row.

The door matrix (14.408) in `apps/server/test/mcp/mcp-notes.test.ts`:

```ts
const NOT_MEMBER = `refused by ${PERMISSION_ROLE_RULE}: ${NOT_A_MEMBER_REASON}`;
const NOT_YOURS = 'Only the note’s author, an admin who can read it, or the workspace owner can change it.'; // check-permission.ts:1463-1464 (not exported; copied with its curly apostrophe)
it('14.408 every note tool: stranger, forbidden member, allowed caller', async () => {
  const w = await buildDoorWorld(db, '2408');
  const NOTE_GONE = 'note not found or not visible to you';
  await runDoorMatrix(w, [
    { tool: 'list_notes', args: (x) => ({ workspaceId: x.workspaceId }), stranger: { json: { notes: [], nextCursor: null } }, allowed: { caller: 'member' } },
    { tool: 'get_note', args: (x) => ({ noteId: x.privateNoteId }), stranger: NOTE_GONE, forbidden: { text: NOTE_GONE }, allowed: { caller: 'owner' } },
    { tool: 'create_note', args: (x) => ({ workspaceId: x.workspaceId, title: 'Member note' }), stranger: NOT_MEMBER, allowed: { caller: 'member', eventType: 'note.created' } },
    { tool: 'update_note', args: (x) => ({ noteId: x.workspaceNoteId, title: 'Matrix note B' }), stranger: NOTE_GONE,
      forbidden: { text: `event 0 refused by permission.note: ${NOT_YOURS}` }, allowed: { caller: 'owner', eventType: 'note.renamed' } },
    { tool: 'link_note', args: (x) => ({ noteId: x.workspaceNoteId, ticketId: x.ticketId, action: 'attach' }), stranger: NOTE_GONE, allowed: { caller: 'member', eventType: 'note.attached' } },
    { tool: 'delete_note', args: (x) => ({ noteId: x.workspaceNoteId, confirm_name: 'Matrix note B' }), stranger: NOTE_GONE,
      forbidden: { text: `refused by permission.note: ${NOT_YOURS}` }, allowed: { caller: 'owner', eventType: 'note.deleted' } },
    { tool: 'restore_note', args: (x) => ({ noteId: x.workspaceNoteId }), stranger: NOTE_GONE, allowed: { caller: 'owner', eventType: 'note.restored' } },
    { tool: 'get_note_history', args: (x) => ({ noteId: x.privateNoteId }), stranger: NOTE_GONE, forbidden: { text: NOTE_GONE }, allowed: { caller: 'owner' } },
  ]);
});
```

- [ ] **Step 2: Run to fail.** `pnpm --filter @gisik-nokma/mcp-server exec vitest run test/note-tools.test.ts > /tmp/mcpe-t7.log 2>&1; tail -30 /tmp/mcpe-t7.log`.

- [ ] **Step 3: Implement** `note-tools.ts`:

```ts
import { z } from 'zod';
import { collectImageAttachmentIds, newUlid } from '@gisik-nokma/domain';
import { spliceDoc, type BodyEdit } from '@gisik-nokma/editor/markdown-doc';
import { HttpError } from '../http-client.js';
import type { Session } from '../session.js';
import { bodyAsMarkdown, markdownBody, MARKDOWN_SYNTAX_HELP } from './markdown-io.js';
import { confirmOrPreview } from './preview.js';
import type { ToolDefinition } from './read-tools.js';
import { page, pageArgs } from './reads.js';
import { envelopeFor, submitBatch, submitOne } from './submit.js';

export type NoteDetailWire = {
  noteId: string; workspaceId: string; homeProjectId: string; authorId: string; title: string; scope: unknown;
  attachedTickets: unknown[]; deleted: boolean; createdAt: string; updatedAt: string; body: unknown;
};
const NOT_FOUND = 'note not found or not visible to you';
const enc = encodeURIComponent;
const id = z.string().min(1);
const SCOPES = ['private', 'workspace', 'project', 'inherit', 'explicit'] as const;
const mode = z.enum(['replace', 'append', 'replace_section']).optional();

export async function readNote(session: Session, noteId: string): Promise<NoteDetailWire> {
  try {
    return ((await session.get(`/v1/notes/${enc(noteId)}`)) as { note: NoteDetailWire }).note;
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) throw new Error(NOT_FOUND);
    throw error;
  }
}

function scopePayload(scope: (typeof SCOPES)[number], userIds: string[] | undefined): Record<string, unknown> {
  if (scope !== 'explicit') return { mode: scope };
  if (userIds === undefined || userIds.length === 0) throw new Error('scope "explicit" needs explicitUserIds (at least one person; find them with list_members)');
  return { mode: 'explicit', userIds };
}

function edit(m: z.infer<typeof mode>, section: string | undefined): BodyEdit {
  if (m === 'replace_section') {
    if (section === undefined || section.trim() === '') throw new Error('mode "replace_section" needs `section`: the exact text of one heading');
    return { mode: 'replace_section', section };
  }
  return { mode: m ?? 'replace' };
}

export function noteTools(session: Session): ToolDefinition[] {
  const listShape = {
    workspaceId: id,
    projectId: z.string().optional(),
    authorId: id.optional(),
    scope: z.enum(SCOPES).optional(),
    include: z.array(z.enum(['deleted'])).optional(),
    ...pageArgs,
  };
  const createShape = {
    workspaceId: id, title: z.string().min(1).max(500), markdown: z.string().optional(), projectId: z.string().optional(),
    scope: z.enum(SCOPES).optional(), explicitUserIds: z.array(id).optional(), attachTicketId: id.optional(),
  };
  const updateShape = {
    noteId: id, title: z.string().min(1).max(500).optional(), markdown: z.string().optional(), mode, section: z.string().optional(),
    scope: z.enum(SCOPES).optional(), explicitUserIds: z.array(id).optional(), projectId: z.string().optional(),
  };
  return [
    {
      name: 'list_notes',
      description:
        'The notes you can read in a workspace, newest first. Filter by projectId ("" = filed at workspace level), authorId ("me" for yours) ' +
        'or scope; include: ["deleted"] lists deleted notes you may restore instead. Pages with cursor/limit (default 50, max 200).',
      inputSchema: listShape,
      handler: async (args) => {
        const a = z.object(listShape).parse(args);
        const q = new URLSearchParams();
        if (a.projectId !== undefined) q.set('home', a.projectId);
        if (a.authorId !== undefined) q.set('author', a.authorId === 'me' ? session.userId() : a.authorId);
        if (a.scope !== undefined) q.set('scope', a.scope);
        if (a.include?.includes('deleted') === true) q.set('deleted', '1');
        const qs = q.toString();
        const { notes } = (await session.get(`/v1/workspaces/${enc(a.workspaceId)}/notes${qs === '' ? '' : `?${qs}`}`)) as { notes: unknown[] };
        const { items, nextCursor } = page(notes, a.cursor, a.limit);
        return { notes: items, nextCursor };
      },
    },
    {
      name: 'get_note',
      description: 'Read one note: title, scope, where it is filed, attached tickets, the image attachments its body shows, and its body as Markdown (`lossy` names anything Markdown cannot show; replacing the whole body would drop it).',
      inputSchema: { noteId: id },
      handler: async (args) => {
        const note = await readNote(session, z.object({ noteId: id }).parse(args).noteId);
        const { body, ...meta } = note;
        return { ...meta, ...bodyAsMarkdown(body), images: collectImageAttachmentIds(body) };
      },
    },
    {
      name: 'create_note',
      description:
        `Create a note. projectId files it under a project ("" or absent = workspace level). scope: private (default), workspace, project, ` +
        `explicit (with explicitUserIds) or inherit (only with attachTicketId — it then follows that ticket's audience, and is the default when attachTicketId is given). ${MARKDOWN_SYNTAX_HELP}`,
      inputSchema: createShape,
      handler: async (args) => {
        const a = z.object(createShape).parse(args);
        const noteId = newUlid();
        const scope = scopePayload(a.scope ?? (a.attachTicketId === undefined ? 'private' : 'inherit'), a.explicitUserIds);
        const payload = {
          title: a.title,
          homeProjectId: a.projectId ?? '',
          scope,
          ...(a.markdown === undefined || a.markdown.trim() === '' ? {} : { body: await markdownBody(session, a.workspaceId, a.markdown) }),
          ...(a.attachTicketId === undefined ? {} : { attachTicketId: a.attachTicketId }),
        };
        const committed = await submitOne(session, envelopeFor(session, a.workspaceId, { kind: 'note', id: noteId }, 'note.created', payload));
        return { noteId, ...(committed as object) };
      },
    },
    {
      name: 'update_note',
      description:
        'Change a note: title; body (markdown, with mode "replace" (default) the whole body, "append" to the end, or "replace_section" ' +
        'the content under the heading named in `section`, keeping everything else exactly); scope (+explicitUserIds); or projectId to move it. ' +
        `Only the author, an admin who can read it, or the owner can. ${MARKDOWN_SYNTAX_HELP}`,
      inputSchema: updateShape,
      handler: async (args) => {
        const a = z.object(updateShape).parse(args);
        if (a.title === undefined && a.markdown === undefined && a.scope === undefined && a.projectId === undefined) {
          throw new Error('update_note needs at least one of title, markdown, scope or projectId');
        }
        const note = await readNote(session, a.noteId);
        const entity = { kind: 'note' as const, id: a.noteId };
        const events = [];
        let dropped: string[] = [];
        if (a.title !== undefined) events.push(envelopeFor(session, note.workspaceId, entity, 'note.renamed', { title: a.title }));
        if (a.markdown !== undefined) {
          const e = edit(a.mode, a.section);
          const incoming = await markdownBody(session, note.workspaceId, a.markdown);
          const spliced = spliceDoc(note.body, incoming, e);
          if ('problem' in spliced) throw new Error(spliced.problem);
          if (e.mode === 'replace') dropped = bodyAsMarkdown(note.body).lossy;
          events.push(envelopeFor(session, note.workspaceId, entity, 'note.body_set', { body: spliced.doc }));
        }
        if (a.scope !== undefined) events.push(envelopeFor(session, note.workspaceId, entity, 'note.scope_set', scopePayload(a.scope, a.explicitUserIds)));
        if (a.projectId !== undefined) events.push(envelopeFor(session, note.workspaceId, entity, 'note.moved', { homeProjectId: a.projectId }));
        const results = await submitBatch(session, events);
        return { results, ...(dropped.length === 0 ? {} : { dropped, note: 'The old body had these, which Markdown cannot carry; they are gone.' }) };
      },
    },
    // link_note, delete_note, restore_note, get_note_history — below, same pattern:
  ];
}
```

The four remaining tools, appended to the same array:

```ts
    {
      name: 'link_note',
      description: 'Attach a note to a ticket (action "attach") or detach it ("detach"). You must be able to see both.',
      inputSchema: { noteId: id, ticketId: id, action: z.enum(['attach', 'detach']) },
      handler: async (args) => {
        const a = z.object({ noteId: id, ticketId: id, action: z.enum(['attach', 'detach']) }).parse(args);
        const note = await readNote(session, a.noteId);
        return submitOne(session, envelopeFor(session, note.workspaceId, { kind: 'note', id: a.noteId }, a.action === 'attach' ? 'note.attached' : 'note.detached', { ticketId: a.ticketId }));
      },
    },
    {
      name: 'delete_note',
      description: 'Move a note to Deleted items (restorable for 15 days with restore_note — nothing is erased). confirm_name must be the note\'s exact current title; without it you get a preview and nothing changes.',
      inputSchema: { noteId: id, confirm_name: z.string().optional() },
      handler: async (args) => {
        const a = z.object({ noteId: id, confirm_name: z.string().optional() }).parse(args);
        const note = await readNote(session, a.noteId);
        const preview = await confirmOrPreview(note.title, a.confirm_name, async () => ({
          sentence: `Moves the note "${note.title}" to Deleted items; it can be restored for 15 days.`,
        }));
        if (preview !== null) return preview;
        return submitOne(session, envelopeFor(session, note.workspaceId, { kind: 'note', id: a.noteId }, 'note.deleted', {}));
      },
    },
    {
      name: 'restore_note',
      description: 'Bring a deleted note back from Deleted items.',
      inputSchema: { noteId: id },
      handler: async (args) => {
        const { noteId } = z.object({ noteId: id }).parse(args);
        const note = await readNote(session, noteId);
        return submitOne(session, envelopeFor(session, note.workspaceId, { kind: 'note', id: noteId }, 'note.restored', {}));
      },
    },
    {
      name: 'get_note_history',
      description: 'A note\'s saved versions (who, when). With versionId, that version\'s body as Markdown.',
      inputSchema: { noteId: id, versionId: id.optional() },
      handler: async (args) => {
        const a = z.object({ noteId: id, versionId: id.optional() }).parse(args);
        try {
          if (a.versionId === undefined) return await session.get(`/v1/notes/${enc(a.noteId)}/history`);
          const { body } = (await session.get(`/v1/notes/${enc(a.noteId)}/history/${enc(a.versionId)}`)) as { body: unknown };
          return { versionId: a.versionId, ...bodyAsMarkdown(body) };
        } catch (error) {
          if (error instanceof HttpError && error.status === 404) throw new Error(a.versionId === undefined ? NOT_FOUND : 'note version not found or not visible to you');
          throw error;
        }
      },
    },
```

Fixture blocks: `tool-names.ts` `note` → the eight names in the order above; `tool-sweep.ts` `note` → each tool with a `session.get` answering `{ note: {...the NOTE_ROUTES detail...}, notes: [], versions: [], body: null }` (one object serves every path).

- [ ] **Step 4: Pass + battery** (as T6 Step 5, without the deploy check). Mutations: ignore `include` (14.400), always send `note.body_set` (14.403), case-insensitive title (14.406).

- [ ] **Step 5: Catalogue + commit.** Flip 14.400–14.408. Features.md §14:

```markdown
- ✅ **The assistant works with notes** (MCP-everything T7; `packages/mcp-server/src/tools/note-tools.ts`) — `list_notes` (by project, author/"me", scope, or deleted; paged), `get_note` (body as Markdown with `lossy`, attached tickets, images), `create_note` (scope defaults to private, or inherit when attached at birth), `update_note` (title, body by replace / append / one section — every other part of the body kept exactly — scope, move), `link_note`, `delete_note` (preview unless the exact title; restorable 15 days) / `restore_note`, `get_note_history`. Mentions in a body notify readers only. Cases 14.400–14.408.
```

```bash
git branch --show-current   # task/mcp-e-7-note-tools
git add packages/mcp-server apps/server/test/mcp/mcp-notes.test.ts test-cases/14-mcp-server.md Features.md
git commit -m "MCP everything 7: note tools (14.400-14.408)"
git push -u origin task/mcp-e-7-note-tools
```

DONE line: `DONE task/mcp-e-7-note-tools <sha40>`.

---

### Task 8: MCP attachment tools

**Lane:** `task/mcp-e-8-attachment-tools` off `origin/release/mcp-everything` after T6 merged. Parallel with T7, T9–T12. Defaults Q1 (no link attachments) and Q2 (images only on notes) apply; a different owner ruling changes only this task.

**Files:**
- Modify: `packages/mcp-server/src/tools/attachment-tools.ts` (T3's stub), fixture blocks `attachment begin/end`
- Test: `packages/mcp-server/test/attachment-tools.test.ts` (new), `apps/server/test/mcp/mcp-attachments.test.ts` (new, hosted)
- Catalogue: `test-cases/14-mcp-server.md` `### T8`, `Features.md` §14

**Interfaces:**
- Consumes: T3 `Session.getBytes`, `Session.postMultipart`, `ToolReply`; T6 `parentOf`; T1 `spliceDoc`; domain `isEmbeddableImageMime`, `collectImageAttachmentIds`.
- Produces: tools `list_attachments`, `get_attachment`, `add_attachment`; constants `MCP_ATTACHMENT_MAX_BYTES = 10_485_760`, `MAX_BASE64_CHARS = 13_981_016` (exported from `attachment-tools.ts`).

Cases (`### T8 — attachments`):

```markdown
- ❌ **14.430 — `add_attachment` to a ticket uploads the decoded bytes to `POST /v1/attachments` (field `ticketId` first) and then submits ONE `attachment.added { kind: 'upload', attachmentId, filename, mime, size, sha256 }` built from the SERVER's answer, not from the caller's name or guess;** control: the envelope passes `parseEvent`. Mutation: take `mime` from the filename → the sniffed-mime assertion fails.
- ❌ **14.431 — `add_attachment` to a note takes images only: a non-image name is refused before upload; an upload the server sniffs as non-image is refused after; an image is appended to the note body as `image { attachmentId, wrap: 'block', alt: filename }` by ONE `note.body_set`, every existing node kept;** control: the image case. Mutation: append without the mime check → a PDF node is written.
- ❌ **14.432 — a base64 string longer than 13,981,016 characters is refused before it is decoded, and one that decodes to 10,485,761 bytes is refused after decoding — both naming "10 MB", neither calling `postMultipart`; exactly 10,485,760 bytes is uploaded** (Review Focus 3). Control: the exact-limit upload. Mutation: compare against 25 MiB → the +1 case uploads.
- ❌ **14.433 — malformed base64 (`not base64!`) is refused naming the field; `file` is required (there is no `link` — owner ruling Q1: links go in Markdown);** control: valid base64 passes. Mutation: `Buffer.from` without the alphabet check → garbage is uploaded.
- ❌ **14.434 — an upload refusal comes back in the server's words (`payload-too-large: …`, a 404 for an invisible ticket as "ticket not found or not visible to you");** control: the 201 path. Mutation: rethrow the bare `HttpError` → "gisik-nokma answered 413".
- ❌ **14.435 — `get_attachment`: `text/*` answers the text; `image/*` answers an MCP image block (plus a text block of name, mime and size); anything else answers its metadata and "open it in the app"; anything over 10,485,760 bytes answers metadata only; an invisible id is "attachment not found or not visible to you";** control: a small PNG round-trips byte-identical (hosted). Mutation: return every file as text → the image case fails.
- ❌ **14.436 — `list_attachments` lists a ticket's files (`GET …/attachments`); for a note it lists the image ids its body embeds and says a note's files are its body's images; both page (cursor/limit);** control: an empty ticket answers `[]`. Mutation: read the ticket route for a note → 404.
- ❌ **14.437 — the door matrix (hosted): a stranger gets "ticket not found or not visible to you" / "note not found or not visible to you" / "attachment not found or not visible to you" — never "answered 404" — and the member's upload writes `attachment.added` with `origin: 'mcp'`;** control: the allowed calls. Mutation: drop `readOrNotFound` from `list_attachments` → red.
- ❌ **14.438 — the whole hosted path at the limit: exactly 10,485,760 bytes go through `/mcp` (~14 MB JSON), the decode, `inject` and multipart into `/v1/attachments`; one byte more is refused naming "10 MB" and nothing is stored** (Review Focus 3, end to end). Control: the exact-limit upload. Mutation: drop T3's `bodyLimit` → the exact-limit call answers 413.
```

- [ ] **Step 1: Failing tests.** `packages/mcp-server/test/attachment-tools.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { domainRegistry, parseEvent } from '@gisik-nokma/domain';
import { HttpError } from '../src/http-client.js';
import type { Session } from '../src/session.js';
import { attachmentTools, MAX_BASE64_CHARS, MCP_ATTACHMENT_MAX_BYTES } from '../src/tools/attachment-tools.js';
import { ToolReply } from '../src/tools/reply.js';

const ulid = (tag: string) => `01J0${tag}`.padEnd(26, '0');
const WS = ulid('WS');
const T = ulid('TKT');
const N = ulid('N0TE');
const A = ulid('ATT');
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const COMMITTED = { results: [{ status: 'committed', eventId: 'e', seq: 1, serverTime: '2026-10-02T10:00:00.000Z' }] };
const NOTE_BODY = { type: 'doc', attrs: { schemaVersion: 2 }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'keep me' }] }] };

function fake(sniffed = 'image/png') {
  const uploads: Array<{ fields: Record<string, string>; name: string; size: number }> = [];
  const sent: Array<Record<string, unknown>> = [];
  const session: Session = {
    userId: () => ulid('ME'),
    get: async (path) => (path.startsWith('/v1/notes/') ? { note: { noteId: N, workspaceId: WS, title: 'N', body: NOTE_BODY } } : { attachments: [] }),
    post: async () => ({}),
    postEvents: async (events) => {
      sent.push(...(events as Array<Record<string, unknown>>));
      return COMMITTED;
    },
    getBytes: async () => ({ bytes: Buffer.from(PNG_B64, 'base64'), contentType: 'image/png', filename: 'dot.png' }),
    postMultipart: async (_path, fields, file) => {
      uploads.push({ fields, name: file.name, size: file.bytes.length });
      return { attachmentId: A, url: `/v1/attachments/${A}`, mime: sniffed, filename: file.name, size: file.bytes.length, sha256: 'a'.repeat(64) };
    },
  };
  return { session, uploads, sent };
}
const tool = (name: string, s: Session) => attachmentTools(s).find((t) => t.name === name)!;

describe('14.430–14.436 attachments', () => {
  it('14.430 ticket: upload, then attachment.added from the server answer', async () => {
    const f = fake('image/png');
    await tool('add_attachment', f.session).handler({ workspaceId: WS, ticketId: T, file: { name: 'shot.jpg', base64: PNG_B64 } });
    expect(f.uploads).toEqual([{ fields: { ticketId: T }, name: 'shot.jpg', size: 70 }]);
    expect(f.sent[0]).toMatchObject({ type: 'attachment.added', entity: { kind: 'ticket', id: T }, payload: { kind: 'upload', attachmentId: A, mime: 'image/png', size: 70 } });
    expect(parseEvent({ ...f.sent[0], serverTime: '2026-10-02T10:00:00.000Z', seq: 1 }, domainRegistry).ok).toBe(true);
  });

  it('14.431 note: images only, appended to the body', async () => {
    const f = fake('image/png');
    await expect(tool('add_attachment', f.session).handler({ workspaceId: WS, noteId: N, file: { name: 'report.pdf', base64: PNG_B64 } })).rejects.toThrow(/A note holds images/);
    expect(f.uploads).toEqual([]);
    await tool('add_attachment', f.session).handler({ workspaceId: WS, noteId: N, file: { name: 'dot.png', base64: PNG_B64 } });
    const body = (f.sent[0]!['payload'] as { body: { content: unknown[] } }).body;
    expect(f.sent[0]!['type']).toBe('note.body_set');
    expect(body.content).toEqual([NOTE_BODY.content[0], { type: 'image', attrs: { attachmentId: A, wrap: 'block', alt: 'dot.png' } }]);
    const pdf = fake('application/pdf');
    await expect(tool('add_attachment', pdf.session).handler({ workspaceId: WS, noteId: N, file: { name: 'sneaky.png', base64: PNG_B64 } })).rejects.toThrow(/A note holds images/);
    expect(pdf.sent).toEqual([]);
  });

  it('14.432 the 10 MB limit, before decoding and after', async () => {
    const f = fake();
    const call = (base64: string) => tool('add_attachment', f.session).handler({ workspaceId: WS, ticketId: T, file: { name: 'big.bin', base64 } });
    await expect(call('A'.repeat(MAX_BASE64_CHARS + 4))).rejects.toThrow(/10 MB/);
    await expect(call(Buffer.alloc(MCP_ATTACHMENT_MAX_BYTES + 1).toString('base64'))).rejects.toThrow(/10 MB/);
    expect(f.uploads).toEqual([]);
    await call(Buffer.alloc(MCP_ATTACHMENT_MAX_BYTES).toString('base64')); // control: exactly the limit
    expect(f.uploads[0]?.size).toBe(MCP_ATTACHMENT_MAX_BYTES);
  });

  it('14.433 / 14.434 malformed base64; server refusals in its words', async () => {
    const f = fake();
    await expect(tool('add_attachment', f.session).handler({ workspaceId: WS, ticketId: T, file: { name: 'x', base64: 'not base64!' } })).rejects.toThrow('file.base64 is not valid base64');
    const refused: Session = { ...f.session, postMultipart: async () => { throw new HttpError(413, { error: 'payload-too-large', reason: 'This request has too many parts.' }); } };
    await expect(tool('add_attachment', refused).handler({ workspaceId: WS, ticketId: T, file: { name: 'x.png', base64: PNG_B64 } })).rejects.toThrow('payload-too-large: This request has too many parts.');
    const hidden: Session = { ...f.session, postMultipart: async () => { throw new HttpError(404, { error: 'not_found' }); } };
    await expect(tool('add_attachment', hidden).handler({ workspaceId: WS, ticketId: T, file: { name: 'x.png', base64: PNG_B64 } })).rejects.toThrow('ticket not found or not visible to you');
  });

  it('14.435 get_attachment: image as an image block', async () => {
    const out = await tool('get_attachment', fake().session).handler({ attachmentId: A });
    expect(out).toBeInstanceOf(ToolReply);
    expect((out as ToolReply).content[1]).toEqual({ type: 'image', data: PNG_B64, mimeType: 'image/png' });
  });
});
```

Hosted (`apps/server/test/mcp/mcp-attachments.test.ts`, the `mcp-crud-round-trip` bootstrap): `create_ticket`, `add_attachment` with the 70-byte PNG, `list_attachments` shows it, `get_attachment` answers an `image` content item whose `data` decodes to the same 70 bytes (14.435's control), a STRANGER's `get_attachment` of that id answers "attachment not found or not visible to you", and the ledger holds `attachment.added` with `origin: 'mcp'`. Then the whole real path at the limit (14.438): a PNG padded to exactly 10,485,760 bytes (the 70-byte PNG followed by zero bytes — the sniffer reads the signature) goes through `/mcp` as ~14 MB of JSON, is decoded, crosses `inject` as a Buffer and lands in `/v1/attachments` (`size` 10,485,760 in the answer); the same with one more byte is refused naming "10 MB" and no row is added to `attachments`.

The door matrix (14.437):

```ts
it('14.437 every attachment tool: stranger, allowed caller', async () => {
  const w = await buildDoorWorld(db, '2437');
  const file = { name: 'dot.png', base64: PNG_B64 };
  await runDoorMatrix(w, [
    { tool: 'list_attachments', args: (x) => ({ workspaceId: x.workspaceId, ticketId: x.ticketId }), stranger: 'ticket not found or not visible to you', allowed: { caller: 'member' } },
    { tool: 'add_attachment', args: (x) => ({ workspaceId: x.workspaceId, ticketId: x.ticketId, file }), stranger: 'ticket not found or not visible to you', allowed: { caller: 'member', eventType: 'attachment.added' } },
    { tool: 'list_attachments', args: (x) => ({ workspaceId: x.workspaceId, noteId: x.privateNoteId }), stranger: 'note not found or not visible to you', forbidden: { text: 'note not found or not visible to you' }, allowed: { caller: 'owner' } },
  ]);
});
```

- [ ] **Step 2: Run to fail.** `pnpm --filter @gisik-nokma/mcp-server exec vitest run test/attachment-tools.test.ts > /tmp/mcpe-t8.log 2>&1; tail -30 /tmp/mcpe-t8.log`.

- [ ] **Step 3: Implement** `attachment-tools.ts`:

```ts
import { z } from 'zod';
import { collectImageAttachmentIds, isEmbeddableImageMime } from '@gisik-nokma/domain';
import { spliceDoc, type DocJson } from '@gisik-nokma/editor/markdown-doc';
import { HttpError } from '../http-client.js';
import type { Session } from '../session.js';
import { parentOf } from './markdown-io.js';
import type { ToolDefinition } from './read-tools.js';
import { page, pageArgs, readOrNotFound } from './reads.js';
import { ToolReply } from './reply.js';
import { envelopeFor, submitOne } from './submit.js';

/** 10 MiB per call (M-E5); the product's own limit stays 25 MiB (`apps/server/src/routes/attachments.ts:22`). */
export const MCP_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;
/** The longest base64 string that can decode to the limit: checked BEFORE decoding, so no huge buffer is allocated. */
export const MAX_BASE64_CHARS = 4 * Math.ceil(MCP_ATTACHMENT_MAX_BYTES / 3);
const TOO_BIG = 'This file is over the 10 MB an assistant can send in one call (the app itself takes up to 25 MB). Attach it in the app instead.';
const IMAGE_NAME = /\.(png|jpe?g|gif|webp)$/i;
const NOTE_IMAGES_ONLY = 'A note holds images only, shown in its body. Attach other files to a ticket.';
const id = z.string().min(1);
const fileArg = z.object({ name: z.string().min(1).max(255), base64: z.string().min(1) });

function decode(base64: string): Uint8Array {
  if (base64.length > MAX_BASE64_CHARS) throw new Error(TOO_BIG);
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(base64) || base64.length % 4 === 1) throw new Error('file.base64 is not valid base64');
  const bytes = Buffer.from(base64, 'base64');
  if (bytes.length > MCP_ATTACHMENT_MAX_BYTES) throw new Error(TOO_BIG);
  return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.length);
}

type Uploaded = { attachmentId: string; mime: string; filename: string; size: number; sha256: string };

async function upload(session: Session, parent: { kind: 'ticket' | 'note'; id: string }, name: string, bytes: Uint8Array): Promise<Uploaded> {
  try {
    return (await session.postMultipart('/v1/attachments', { [parent.kind === 'ticket' ? 'ticketId' : 'noteId']: parent.id }, { name, bytes })) as Uploaded;
  } catch (error) {
    if (!(error instanceof HttpError)) throw error;
    if (error.status === 404) throw new Error(`${parent.kind} not found or not visible to you`);
    const b = (error.body ?? {}) as { error?: unknown; reason?: unknown };
    if (typeof b.reason === 'string') throw new Error(typeof b.error === 'string' ? `${b.error}: ${b.reason}` : b.reason);
    throw error;
  }
}

export function attachmentTools(session: Session): ToolDefinition[] {
  const addShape = { workspaceId: id, ticketId: id.optional(), noteId: id.optional(), file: fileArg };
  return [
    {
      name: 'list_attachments',
      description: "A ticket's files (ticketId), or the images in a note's body (noteId) — a note's files are the images it shows.",
      inputSchema: { workspaceId: id, ticketId: id.optional(), noteId: id.optional(), ...pageArgs },
      handler: async (args) => {
        const a = z.object({ workspaceId: id, ticketId: id.optional(), noteId: id.optional(), ...pageArgs }).parse(args);
        const parent = parentOf(a, 'list_attachments');
        if (parent.kind === 'ticket') {
          const path = `/v1/workspaces/${encodeURIComponent(a.workspaceId)}/tickets/${encodeURIComponent(parent.id)}/attachments`;
          const { attachments } = (await readOrNotFound(session, path, 'ticket')) as { attachments: unknown[] };
          const { items, nextCursor } = page(attachments, a.cursor, a.limit);
          return { attachments: items, nextCursor };
        }
        const { note } = (await readOrNotFound(session, `/v1/notes/${encodeURIComponent(parent.id)}`, 'note')) as { note: { body: unknown } };
        const { items, nextCursor } = page(collectImageAttachmentIds(note.body).map((attachmentId) => ({ attachmentId })), a.cursor, a.limit);
        return { images: items, nextCursor, note: "A note's files are the images in its body." };
      },
    },
    {
      name: 'get_attachment',
      description: 'Read one attachment, up to 10 MB: a text file as text, an image as an image, anything else as its name, type and size with a note to open it in the app.',
      inputSchema: { attachmentId: id },
      handler: async (args) => {
        const { attachmentId } = z.object({ attachmentId: id }).parse(args);
        let got;
        try {
          got = await session.getBytes(`/v1/attachments/${encodeURIComponent(attachmentId)}`);
        } catch (error) {
          if (error instanceof HttpError && error.status === 404) throw new Error('attachment not found or not visible to you');
          throw error;
        }
        const meta = { attachmentId, filename: got.filename, mime: got.contentType, size: got.bytes.length };
        if (got.bytes.length > MCP_ATTACHMENT_MAX_BYTES) return { ...meta, note: 'This file is over 10 MB; open it in the app.' };
        if (got.contentType.startsWith('text/')) return { ...meta, text: new TextDecoder().decode(got.bytes) };
        if (got.contentType.startsWith('image/')) {
          return new ToolReply([
            { type: 'text', text: JSON.stringify(meta) },
            { type: 'image', data: Buffer.from(got.bytes).toString('base64'), mimeType: got.contentType },
          ]);
        }
        return { ...meta, note: 'This kind of file cannot be shown here; open it in the app.' };
      },
    },
    {
      name: 'add_attachment',
      description:
        'Attach a file you have, as base64, to a ticket (ticketId) or — images only — to a note (noteId), where it is added to the end of the body. ' +
        'At most 10 MB per call. The server reads the file to decide its type. To share a link, write it in a comment or note as Markdown instead.',
      inputSchema: addShape,
      handler: async (args) => {
        const a = z.object(addShape).parse(args);
        const parent = parentOf(a, 'add_attachment');
        if (parent.kind === 'note' && !IMAGE_NAME.test(a.file.name)) throw new Error(NOTE_IMAGES_ONLY);
        const bytes = decode(a.file.base64);
        const up = await upload(session, parent, a.file.name, bytes);
        if (parent.kind === 'ticket') {
          return submitOne(session, envelopeFor(session, a.workspaceId, parent, 'attachment.added', {
            kind: 'upload', attachmentId: up.attachmentId, filename: up.filename, mime: up.mime, size: up.size, sha256: up.sha256,
          }));
        }
        // The SNIFFED type decides (attachments.ts:132-140): a `.png` that is a PDF is refused here. The uploaded object
        // stays an orphan no row names — the route's own documented residue (`attachments.ts:232-235`).
        if (!isEmbeddableImageMime(up.mime)) throw new Error(NOTE_IMAGES_ONLY);
        const { note } = (await readOrNotFound(session, `/v1/notes/${encodeURIComponent(parent.id)}`, 'note')) as { note: { workspaceId: string; body: unknown } };
        const image: DocJson = { type: 'doc', content: [{ type: 'image', attrs: { attachmentId: up.attachmentId, wrap: 'block', alt: up.filename } }] };
        const spliced = spliceDoc(note.body, image, { mode: 'append' });
        if ('problem' in spliced) throw new Error(spliced.problem);
        return submitOne(session, envelopeFor(session, note.workspaceId, parent, 'note.body_set', { body: spliced.doc }));
      },
    },
  ];
}
```

Fixture blocks: names `'list_attachments', 'get_attachment', 'add_attachment',`; sweep entries use a session whose `getBytes`/`postMultipart` answer like `fake()` above.

- [ ] **Step 4: Pass + battery** (T6 Step 5 shape, no deploy check). Mutations: mime from filename (14.430), no note mime check (14.431), 25 MiB limit (14.432), bare `HttpError` (14.434).

- [ ] **Step 5: Catalogue + commit.** Flip 14.430–14.438. Features.md §14:

```markdown
- ✅ **The assistant attaches and reads files** (MCP-everything T8; `packages/mcp-server/src/tools/attachment-tools.ts`) — `add_attachment` sends a file as base64 (at most 10 MB a call; the length is checked before decoding) through the product's own upload (the server sniffs the type), then records `attachment.added`; on a note it takes images only and adds them to the end of the body. `get_attachment` answers text as text and images as images, up to 10 MB; `list_attachments` lists a ticket's files or a note's images. No link attachments: links go in Markdown (owner ruling Q1). Cases 14.430–14.438.
```

```bash
git branch --show-current   # task/mcp-e-8-attachment-tools
git add packages/mcp-server apps/server/test/mcp/mcp-attachments.test.ts test-cases/14-mcp-server.md Features.md
git commit -m "MCP everything 8: attachment tools, 10 MB inline, images to notes (14.430-14.438)"
git push -u origin task/mcp-e-8-attachment-tools
```

DONE line: `DONE task/mcp-e-8-attachment-tools <sha40>`.

---

### Task 9: MCP ticket tools — every ticket act

**Lane:** `task/mcp-e-9-ticket-tools` off `origin/release/mcp-everything` after T6 merged. Parallel with T7, T8, T10–T12.

**Files:**
- Modify: `packages/mcp-server/src/tools/ticket-tools.ts` (T3's stub), `src/tools/write-tools.ts:13-65` (`create_ticket`), `src/tools/read-tools.ts:131-144` (`get_ticket`), fixture blocks `ticket begin/end`; `tool-sweep.ts`' `create_ticket` / `get_ticket` entries keep their args (the core block is T3's; T9 edits only those two entries' `session` if the new `get_ticket` needs a shaped answer)
- Test: `packages/mcp-server/test/ticket-tools.test.ts` (new), `test/write-tools.test.ts` (create_ticket's new arguments), `test/read-tools.test.ts` (get_ticket's Markdown description), `apps/server/test/mcp/mcp-tickets.test.ts` (new, hosted)
- Catalogue: `test-cases/14-mcp-server.md` `### T9`, `Features.md` §14

**Interfaces:**
- Consumes: T6 `markdownBody`, `bodyAsMarkdown`, `MARKDOWN_SYNTAX_HELP`; T1 `spliceDoc`, `BodyEdit`; T3 `confirmOrPreview`, `submitBatch`, `envelopeFor`; domain `rankBetween` (`packages/domain/src/rank.ts:54`), `PRIORITIES`.
- Produces: tools `update_ticket`, `close_ticket`, `reopen_ticket`, `delete_ticket`, `restore_ticket`, `get_ticket_history`, `rank_ticket`; `create_ticket` gains `markdown`, `priority`, `assigneeId` (`"me"`), `stateId`, `startDate`, `dueDate`; `get_ticket` answers `description: { markdown, lossy }` instead of the raw document; exported `readTicket(session, workspaceId, ticketId): Promise<TicketDetailWire>` where `TicketDetailWire = { key: string | null; title: string; ticketState: { fields: Record<string, { value: unknown }>; rank?: string | null; workflowId: string; deleted?: unknown }; rollup?: { totalChildren?: number } | null }` (the detail route's answer, `apps/server/src/routes/tickets.ts:700-710`).

Cases (`### T9 — tickets`):

```markdown
- ❌ **14.450 — `create_ticket` passes `markdown` as the birth description (a document), `priority` (P1–P3), `assigneeId` (`"me"` → the caller), `stateId` (which makes it start in focus — a backlog ticket has no starting status, `ticket-events.ts:152-159`), `startDate`/`dueDate` as `{ date }`; the envelope passes `parseEvent`;** control: today's four-argument call is unchanged. Mutation: send `stateId` with `start: 'backlog'` → the domain refuses.
- ❌ **14.451 — `update_ticket` sends ONE batch of exactly the implied events: `ticket.field_set` for title, description (replace | append | replace_section, outside nodes byte-identical), priority, start/due date (`null` clears), each custom field; `ticket.reparented`; collaborator add/remove (`"me"` allowed); `ticket.workflow_rebound`; nothing → refused; a built-in field id inside `fields` → refused naming the argument to use;** control: title only → one `field_set`. Mutation: send every field every time → red.
- ❌ **14.452 — `close_ticket` / `reopen_ticket` send `ticket.closed {}` / `ticket.reopened {}`, preceded in the SAME batch by the optional Markdown comment; the engine's refusal (e.g. "close-requires-terminal") comes back verbatim;** control: no comment → one event. Mutation: two batches → red.
- ❌ **14.453 — `delete_ticket` without `confirm_name` = the ticket KEY answers a preview naming the key, title and child count and sends nothing; with it, ONE `ticket.deleted {}`; `restore_ticket` needs no confirmation;** control: the exact key commits. Mutation: confirm against the title → red.
- ❌ **14.454 — `get_ticket_history` answers the ledger lines (type, actor, origin, time) and NEVER a comment body or a description document: `comment.*` lines carry only `commentId`, a description `field_set` only `fieldId`** (owner question Q4); control: an assignment line keeps its `assigneeId`. Mutation: pass payloads through → a comment's text appears.
- ❌ **14.455 — `rank_ticket` places a backlog ticket between `before` and `after` (either or both) with `rankBetween` of their current ranks, ONE `ticket.ranked { rank }`; a neighbour outside the backlog is refused naming it; neither neighbour is refused;** control: `after` only. Mutation: swap the bounds → `rankBetween` throws / the order inverts.
- ❌ **14.456 — `get_ticket` answers the description as `{ markdown, lossy }` and no raw document; a ticket with no description answers `markdown: ''`;** control: the other fields are unchanged. Mutation: keep the raw value → red.
- ❌ **14.457 — through the hosted door: update a description section, close with a comment, reopen, delete (preview, then the key), restore — each event `origin: 'mcp'`;** control: the ticket reads back with the new section. Mutation: none (round trip).
- ❌ **14.458 — the door matrix (hosted): every ticket tool answers a stranger the uniform "ticket not found or not visible to you" (reads, and acts that read the ticket first) or the product's not-a-member refusal (blind writes); a plain member is refused delete/restore in the gate's words; the allowed caller's event is `origin: 'mcp'`;** control: the allowed calls. Mutation: return `get_ticket`'s raw 404 → "gisik-nokma answered 404".
```

- [ ] **Step 1: Failing tests.** `packages/mcp-server/test/ticket-tools.test.ts` — the T6 `fake` shape with `batches`, and a route for `/v1/workspaces/<WS>/tickets/<T>` answering `{ key: 'CCSO-4', title: 'Chiller', ticketState: { fields: { description: { value: DESC } }, rank: 'm', workflowId: 'wf' }, rollup: { totalChildren: 2 } }` where `DESC` holds `h2 "Steps"`, a paragraph, `h2 "Notes"`; neighbours `B` (rank `'g'`) and `C` (rank `'t'`); `X` (rank `null`). Then:

```ts
  it('14.451 update_ticket: one batch, exactly the implied events', async () => {
    const f = fake(ROUTES);
    await tool('update_ticket', f.session).handler({
      workspaceId: WS, ticketId: T, title: 'Chiller v2', markdown: '1. call the vendor', mode: 'replace_section', section: 'Steps',
      priority: 'P1', dueDate: '2026-10-09', startDate: null, fields: { region: 'south' }, parentId: null,
      addCollaborators: ['me'], removeCollaborators: [ulid('XYZ')], workflow: { toWorkflowId: 'wf2', toStateId: 'todo' },
    });
    expect(f.batches).toHaveLength(1);
    expect(f.batches[0]!.map((e) => [e['type'], (e['payload'] as { fieldId?: string }).fieldId ?? null])).toEqual([
      ['ticket.field_set', 'title'],
      ['ticket.field_set', 'description'],
      ['ticket.field_set', 'priority'],
      ['ticket.field_set', 'startDate'],
      ['ticket.field_set', 'dueDate'],
      ['ticket.field_set', 'region'],
      ['ticket.reparented', null],
      ['ticket.collaborator_added', null],
      ['ticket.collaborator_removed', null],
      ['ticket.workflow_rebound', null],
    ]);
    const desc = (f.batches[0]![1]!['payload'] as { value: { content: unknown[] } }).value.content;
    expect(JSON.stringify(desc.at(-1))).toBe(JSON.stringify(DESC.content.at(-1))); // "Notes" kept byte-identical
    expect((f.batches[0]![4]!['payload'] as { value: unknown }).value).toEqual({ date: '2026-10-09' });
    expect((f.batches[0]![3]!['payload'] as { value: unknown }).value).toBeNull();
    expect((f.batches[0]![7]!['payload'] as { userId: string }).userId).toBe(ME);
    await expect(tool('update_ticket', f.session).handler({ workspaceId: WS, ticketId: T })).rejects.toThrow('update_ticket needs at least one change');
    await expect(tool('update_ticket', f.session).handler({ workspaceId: WS, ticketId: T, fields: { title: 'x' } })).rejects.toThrow('"title" is a built-in field: use the title argument');
    await tool('update_ticket', f.session).handler({ workspaceId: WS, ticketId: T, title: 'Only' }); // control
    expect(f.batches[1]).toHaveLength(1);
  });

  it('14.453 delete_ticket confirms against the KEY', async () => {
    const f = fake(ROUTES);
    expect(await tool('delete_ticket', f.session).handler({ workspaceId: WS, ticketId: T, confirm_name: 'Chiller' })).toMatchObject({
      preview: true, confirm: 'confirm_name must be "CCSO-4"', counts: { childTickets: 2 },
    });
    expect(f.batches).toEqual([]);
    await tool('delete_ticket', f.session).handler({ workspaceId: WS, ticketId: T, confirm_name: 'CCSO-4' });
    await tool('restore_ticket', f.session).handler({ workspaceId: WS, ticketId: T });
    expect(f.batches.flat().map((e) => e['type'])).toEqual(['ticket.deleted', 'ticket.restored']);
  });

  it('14.454 history never echoes a body', async () => {
    const f = fake({
      [`/v1/tickets/${T}/history`]: { ticketId: T, events: [
        { id: ulid('C1'), type: 'comment.added', payload: { body: { type: 'doc', content: [{ type: 'text', text: 'secret' }] } }, actorId: ME, origin: 'web', serverTime: 't', seq: 1, version: 1, clientTime: 't' },
        { id: ulid('E2'), type: 'comment.edited', payload: { commentId: ulid('C1'), body: { type: 'doc' } }, actorId: ME, origin: 'mcp', serverTime: 't', seq: 2, version: 1, clientTime: 't' },
        { id: ulid('F3'), type: 'ticket.field_set', payload: { fieldId: 'description', value: { type: 'doc' } }, actorId: ME, origin: 'web', serverTime: 't', seq: 3, version: 1, clientTime: 't' },
        { id: ulid('A4'), type: 'ticket.assigned', payload: { assigneeId: ME }, actorId: ME, origin: 'web', serverTime: 't', seq: 4, version: 1, clientTime: 't' },
      ] },
    });
    const out = (await tool('get_ticket_history', f.session).handler({ ticketId: T })) as { events: Array<{ payload: unknown }> };
    expect(out.events.map((e) => e.payload)).toEqual([{ commentId: ulid('C1') }, { commentId: ulid('C1') }, { fieldId: 'description' }, { assigneeId: ME }]);
    expect(JSON.stringify(out)).not.toContain('secret');
  });

  it('14.455 rank_ticket between neighbours', async () => {
    const f = fake(ROUTES);
    await tool('rank_ticket', f.session).handler({ workspaceId: WS, ticketId: T, before: B, after: C });
    const rank = (f.batches[0]![0]!['payload'] as { rank: string }).rank;
    expect(rank > 'g' && rank < 't').toBe(true);
    await expect(tool('rank_ticket', f.session).handler({ workspaceId: WS, ticketId: T, before: X })).rejects.toThrow(`ticket ${X} is not in the backlog, so nothing can be ranked beside it`);
    await expect(tool('rank_ticket', f.session).handler({ workspaceId: WS, ticketId: T })).rejects.toThrow('rank_ticket needs before, after, or both');
  });
```

plus 14.450 (`write-tools.test.ts`: the new arguments' payload, `parseEvent` ok), 14.452 (`close_ticket` with `comment: '**done**'` → one batch `['comment.added', 'ticket.closed']`; a refused result verbatim), 14.456 (`read-tools.test.ts`: `description: { markdown: '## Steps…', lossy: [] }`, no `ticketState.fields.description`). Hosted 14.457 in `apps/server/test/mcp/mcp-tickets.test.ts` (the round-trip bootstrap): the listed sequence, then `SELECT origin FROM events WHERE entity_id = $1 AND type <> 'ticket.created'` all `mcp`.

The door matrix (14.458) in `apps/server/test/mcp/mcp-tickets.test.ts`:

```ts
import { NOT_A_MEMBER_REASON, PERMISSION_ROLE_RULE, ticketDeleteAuthorityReason } from '../../src/permissions/check-permission.js';

const NOT_MEMBER = `event 0 refused by ${PERMISSION_ROLE_RULE}: ${NOT_A_MEMBER_REASON}`;
const TICKET_GONE = 'ticket not found or not visible to you';
it('14.458 every ticket tool: stranger, forbidden member, allowed caller', async () => {
  const w = await buildDoorWorld(db, '2458');
  const t = (extra: Record<string, unknown> = {}) => (x: typeof w) => ({ workspaceId: x.workspaceId, ticketId: x.ticketId, ...extra });
  const t2 = (extra: Record<string, unknown> = {}) => (x: typeof w) => ({ workspaceId: x.workspaceId, ticketId: x.secondTicketId, ...extra });
  await runDoorMatrix(w, [
    { tool: 'update_ticket', args: t({ title: 'Renamed in the matrix' }), stranger: NOT_MEMBER, allowed: { caller: 'member', eventType: 'ticket.field_set' } },
    { tool: 'close_ticket', args: t(), stranger: NOT_MEMBER }, // allowed path needs a terminal state: 14.457
    { tool: 'reopen_ticket', args: t(), stranger: NOT_MEMBER },
    { tool: 'delete_ticket', args: (x) => ({ workspaceId: x.workspaceId, ticketId: x.secondTicketId, confirm_name: x.secondTicketKey }), stranger: TICKET_GONE,
      forbidden: { text: `event 0 refused by ${PERMISSION_ROLE_RULE}: ${ticketDeleteAuthorityReason('delete')}` }, allowed: { caller: 'owner', eventType: 'ticket.deleted' } },
    { tool: 'restore_ticket', args: t2(), stranger: NOT_MEMBER,
      forbidden: { text: `event 0 refused by ${PERMISSION_ROLE_RULE}: ${ticketDeleteAuthorityReason('restore')}` }, allowed: { caller: 'owner', eventType: 'ticket.restored' } },
    { tool: 'get_ticket_history', args: (x) => ({ ticketId: x.ticketId }), stranger: TICKET_GONE, allowed: { caller: 'member' } },
    { tool: 'rank_ticket', args: t({ after: w.secondTicketId }), stranger: TICKET_GONE }, // the rank arithmetic is 14.455's
    { tool: 'get_ticket', args: t(), stranger: TICKET_GONE, allowed: { caller: 'member' } },
  ]);
});
```

(`ticketDeleteAuthorityReason` is `check-permission.ts:224`; if the delete refusal is reported under another rule id, read the `ticket.deleted` branch of `checkVisibilityPermission` and use its constant. `get_ticket`'s stranger sentence requires `get_ticket` to map its 404 — `read-tools.ts:138-143` returns `session.get(...)` raw today, so T9 wraps it in `readOrNotFound(…, 'ticket')`.)

- [ ] **Step 2: Run to fail.** `pnpm --filter @gisik-nokma/mcp-server exec vitest run test/ticket-tools.test.ts > /tmp/mcpe-t9.log 2>&1; tail -30 /tmp/mcpe-t9.log`.

- [ ] **Step 3: Implement** `ticket-tools.ts`:

```ts
import { z } from 'zod';
import { PRIORITIES, rankBetween } from '@gisik-nokma/domain';
import { spliceDoc, type BodyEdit } from '@gisik-nokma/editor/markdown-doc';
import { HttpError } from '../http-client.js';
import type { Session } from '../session.js';
import { markdownBody, MARKDOWN_SYNTAX_HELP } from './markdown-io.js';
import { confirmOrPreview } from './preview.js';
import type { ToolDefinition } from './read-tools.js';
import { envelopeFor, submitBatch } from './submit.js';

export type TicketDetailWire = {
  key: string | null;
  title: string;
  ticketState: { fields: Record<string, { value: unknown }>; rank?: string | null; workflowId: string };
  rollup?: { totalChildren?: number } | null;
};
const id = z.string().min(1);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'a day in YYYY-MM-DD form');
const BUILT_IN = new Set(['title', 'description', 'priority', 'startDate', 'dueDate']);
const enc = encodeURIComponent;

export async function readTicket(session: Session, workspaceId: string, ticketId: string): Promise<TicketDetailWire> {
  try {
    return (await session.get(`/v1/workspaces/${enc(workspaceId)}/tickets/${enc(ticketId)}`)) as TicketDetailWire;
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) throw new Error('ticket not found or not visible to you');
    throw error;
  }
}

const updateShape = {
  workspaceId: id, ticketId: id, title: z.string().min(1).optional(), markdown: z.string().optional(),
  mode: z.enum(['replace', 'append', 'replace_section']).optional(), section: z.string().optional(),
  priority: z.enum(PRIORITIES).optional(), startDate: day.nullable().optional(), dueDate: day.nullable().optional(),
  fields: z.record(z.string().min(1), z.unknown()).optional(), parentId: id.nullable().optional(),
  addCollaborators: z.array(id).optional(), removeCollaborators: z.array(id).optional(),
  workflow: z.object({ toWorkflowId: id, toStateId: id }).optional(),
};

/** A history line without any document in it (owner question Q4): the ledger's facts, never a body. */
function historyLine(e: { id: string; type: string; payload: Record<string, unknown>; actorId: string; origin: string; serverTime: string }) {
  let payload: Record<string, unknown> = e.payload;
  if (e.type === 'comment.added') payload = { commentId: e.id };
  else if (e.type === 'comment.edited' || e.type === 'comment.deleted') payload = { commentId: e.payload['commentId'] };
  else if (e.type === 'ticket.field_set' && e.payload['fieldId'] === 'description') payload = { fieldId: 'description' };
  else if (e.type === 'ticket.created' && 'description' in e.payload) {
    const { description: _omit, ...rest } = e.payload;
    payload = rest;
  }
  return { eventId: e.id, type: e.type, actorId: e.actorId, origin: e.origin, serverTime: e.serverTime, payload };
}

export function ticketTools(session: Session): ToolDefinition[] {
  const me = (userId: string): string => (userId === 'me' ? session.userId() : userId);
  return [
    {
      name: 'update_ticket',
      description:
        'Change a ticket in one go: title; description (markdown, mode "replace" (default) / "append" / "replace_section" with `section` = a heading\'s exact text); ' +
        'priority P1–P3; startDate / dueDate (YYYY-MM-DD, null clears); custom `fields` by field id; parentId (null = top level); ' +
        `addCollaborators / removeCollaborators ("me" works); workflow { toWorkflowId, toStateId }. Every rule is the product's. ${MARKDOWN_SYNTAX_HELP}`,
      inputSchema: updateShape,
      handler: async (args) => {
        const a = z.object(updateShape).parse(args);
        const t = { kind: 'ticket' as const, id: a.ticketId };
        const ev = (type: string, payload: unknown) => envelopeFor(session, a.workspaceId, t, type, payload);
        const set = (fieldId: string, value: unknown) => ev('ticket.field_set', { fieldId, value });
        for (const key of Object.keys(a.fields ?? {})) {
          if (BUILT_IN.has(key)) throw new Error(`"${key}" is a built-in field: use the ${key} argument`);
        }
        const events = [];
        if (a.title !== undefined) events.push(set('title', a.title));
        if (a.markdown !== undefined) {
          const edit: BodyEdit = a.mode === 'replace_section' ? { mode: 'replace_section', section: a.section ?? '' } : { mode: a.mode ?? 'replace' };
          const current = edit.mode === 'replace' ? null : (await readTicket(session, a.workspaceId, a.ticketId)).ticketState.fields['description']?.value ?? null;
          const spliced = spliceDoc(current, await markdownBody(session, a.workspaceId, a.markdown), edit);
          if ('problem' in spliced) throw new Error(spliced.problem);
          events.push(set('description', spliced.doc));
        }
        if (a.priority !== undefined) events.push(set('priority', a.priority));
        if (a.startDate !== undefined) events.push(set('startDate', a.startDate === null ? null : { date: a.startDate }));
        if (a.dueDate !== undefined) events.push(set('dueDate', a.dueDate === null ? null : { date: a.dueDate }));
        for (const [fieldId, value] of Object.entries(a.fields ?? {})) events.push(set(fieldId, value));
        if (a.parentId !== undefined) events.push(ev('ticket.reparented', { newParentId: a.parentId }));
        for (const u of a.addCollaborators ?? []) events.push(ev('ticket.collaborator_added', { userId: me(u) }));
        for (const u of a.removeCollaborators ?? []) events.push(ev('ticket.collaborator_removed', { userId: me(u) }));
        if (a.workflow !== undefined) events.push(ev('ticket.workflow_rebound', a.workflow));
        if (events.length === 0) throw new Error('update_ticket needs at least one change');
        return { results: await submitBatch(session, events) };
      },
    },
    ...(['close', 'reopen'] as const).map((verb): ToolDefinition => ({
      name: `${verb}_ticket`,
      description: `${verb === 'close' ? 'Close' : 'Reopen'} a ticket, optionally with a comment (Markdown) recorded first in the same change. The product's rules decide (a ticket closes only from a terminal state).`,
      inputSchema: { workspaceId: id, ticketId: id, comment: z.string().min(1).optional() },
      handler: async (args) => {
        const a = z.object({ workspaceId: id, ticketId: id, comment: z.string().min(1).optional() }).parse(args);
        const t = { kind: 'ticket' as const, id: a.ticketId };
        const events = [];
        if (a.comment !== undefined) events.push(envelopeFor(session, a.workspaceId, t, 'comment.added', { body: await markdownBody(session, a.workspaceId, a.comment) }));
        events.push(envelopeFor(session, a.workspaceId, t, verb === 'close' ? 'ticket.closed' : 'ticket.reopened', {}));
        return { results: await submitBatch(session, events) };
      },
    })),
    {
      name: 'delete_ticket',
      description: 'Move a ticket to Deleted items (restorable for 15 days with restore_ticket). confirm_name must be the ticket KEY (e.g. CCSO-4); without it you get a preview and nothing changes.',
      inputSchema: { workspaceId: id, ticketId: id, confirm_name: z.string().optional() },
      handler: async (args) => {
        const a = z.object({ workspaceId: id, ticketId: id, confirm_name: z.string().optional() }).parse(args);
        const ticket = await readTicket(session, a.workspaceId, a.ticketId);
        const key = ticket.key ?? a.ticketId;
        const children = ticket.rollup?.totalChildren ?? 0;
        const preview = await confirmOrPreview(key, a.confirm_name, async () => ({
          sentence: `Moves ${key} "${ticket.title}" to Deleted items; it can be restored for 15 days.`,
          counts: { childTickets: children },
        }));
        if (preview !== null) return preview;
        return { results: await submitBatch(session, [envelopeFor(session, a.workspaceId, { kind: 'ticket', id: a.ticketId }, 'ticket.deleted', {})]) };
      },
    },
    {
      name: 'restore_ticket',
      description: 'Bring a deleted ticket back from Deleted items.',
      inputSchema: { workspaceId: id, ticketId: id },
      handler: async (args) => {
        const a = z.object({ workspaceId: id, ticketId: id }).parse(args);
        return { results: await submitBatch(session, [envelopeFor(session, a.workspaceId, { kind: 'ticket', id: a.ticketId }, 'ticket.restored', {})]) };
      },
    },
    {
      name: 'get_ticket_history',
      description: "A ticket's history: every recorded change, who made it, from where (web, phone, mcp) and when. Comment and description text is not repeated here; read it with list_comments / get_ticket.",
      inputSchema: { ticketId: id, cursor: z.string().regex(/^\d+$/).optional(), limit: z.number().int().min(1).max(1000).optional() },
      handler: async (args) => {
        const a = z.object({ ticketId: id, cursor: z.string().regex(/^\d+$/).optional(), limit: z.number().int().min(1).max(1000).optional() }).parse(args);
        const q = new URLSearchParams();
        if (a.cursor !== undefined) q.set('afterSeq', a.cursor);
        if (a.limit !== undefined) q.set('limit', String(a.limit));
        const qs = q.toString();
        try {
          const out = (await session.get(`/v1/tickets/${enc(a.ticketId)}/history${qs === '' ? '' : `?${qs}`}`)) as { ticketId: string; events: Parameters<typeof historyLine>[0][] };
          return { ticketId: out.ticketId, events: out.events.map(historyLine) };
        } catch (error) {
          if (error instanceof HttpError && error.status === 404) throw new Error('ticket not found or not visible to you');
          throw error;
        }
      },
    },
    {
      name: 'rank_ticket',
      description: 'Reorder a backlog ticket: put it right after the ticket `before` and/or right before the ticket `after` (both must be in the backlog).',
      inputSchema: { workspaceId: id, ticketId: id, before: id.optional(), after: id.optional() },
      handler: async (args) => {
        const a = z.object({ workspaceId: id, ticketId: id, before: id.optional(), after: id.optional() }).parse(args);
        if (a.before === undefined && a.after === undefined) throw new Error('rank_ticket needs before, after, or both');
        const rankOf = async (ticketId: string | undefined): Promise<string | null> => {
          if (ticketId === undefined) return null;
          const rank = (await readTicket(session, a.workspaceId, ticketId)).ticketState.rank ?? null;
          if (rank === null) throw new Error(`ticket ${ticketId} is not in the backlog, so nothing can be ranked beside it`);
          return rank;
        };
        const rank = rankBetween(await rankOf(a.before), await rankOf(a.after));
        return { results: await submitBatch(session, [envelopeFor(session, a.workspaceId, { kind: 'ticket', id: a.ticketId }, 'ticket.ranked', { rank })]) };
      },
    },
  ];
}
```

(The history route's paging parameters are `parseQuery`'s, `routes/ticket-history.ts:160-180` — read their names there; `afterSeq` and `limit` are what the file's own `return { afterSeq, limit }` at `:173` names.) `create_ticket` (`write-tools.ts`): the schema gains `markdown: z.string().optional(), priority: z.enum(PRIORITIES).optional(), assigneeId: z.string().min(1).optional(), stateId: z.string().min(1).optional(), startDate: day.optional(), dueDate: day.optional()`, and the payload:

```ts
          start: a.stateId !== undefined ? 'focus' : (a.start ?? 'backlog'),
          ...(a.markdown === undefined || a.markdown.trim() === '' ? {} : { description: await markdownBody(session, a.workspaceId, a.markdown) }),
          ...(a.priority === undefined ? {} : { priority: a.priority }),
          ...(a.assigneeId === undefined ? {} : { assigneeId: a.assigneeId === 'me' ? session.userId() : a.assigneeId }),
          ...(a.stateId === undefined ? {} : { stateId: a.stateId }),
          ...(a.startDate === undefined ? {} : { startDate: { date: a.startDate } }),
          ...(a.dueDate === undefined ? {} : { dueDate: { date: a.dueDate } }),
```

(`start` explicitly `'focus'` when a `stateId` is named: the domain refuses `backlog` + `stateId`; a caller who names `start: 'backlog'` AND a `stateId` is refused locally with that sentence.) `get_ticket` (`read-tools.ts`) maps the detail answer:

```ts
        const detail = (await readOrNotFound(session, `/v1/workspaces/${encodeURIComponent(parsed.workspaceId)}/tickets/${encodeURIComponent(parsed.ticketId)}`, 'ticket')) as {
          ticketState: { fields: Record<string, { value: unknown }> };
        } & Record<string, unknown>;
        const { description, ...fields } = detail.ticketState.fields;
        return { ...detail, ticketState: { ...detail.ticketState, fields }, description: bodyAsMarkdown(description?.value ?? null) };
```

Fixture blocks: the seven names in tool order; sweep entries with `session.get` answering the `ROUTES` detail shape.

- [ ] **Step 4: Pass + battery** (T6 Step 5 shape). Mutations: every field every time (14.451), two batches for close (14.452), confirm on title (14.453), payload passthrough in history (14.454).

- [ ] **Step 5: Catalogue + commit.** Flip 14.450–14.458. Features.md §14:

```markdown
- ✅ **The assistant can do every ticket act** (MCP-everything T9; `packages/mcp-server/src/tools/ticket-tools.ts`, `write-tools.ts`, `read-tools.ts`) — `create_ticket` takes a Markdown description, priority, assignee ("me"), starting status and dates; `update_ticket` changes title, description (whole, append, or one section), priority, dates, custom fields, parent, collaborators and workflow in one change; `close_ticket` / `reopen_ticket` (optionally with a comment); `delete_ticket` (preview unless the exact ticket key; restorable 15 days) / `restore_ticket`; `get_ticket_history` (never repeats comment or description text); `rank_ticket` (between two backlog tickets). `get_ticket` reads the description as Markdown. Cases 14.450–14.458.
```

```bash
git branch --show-current   # task/mcp-e-9-ticket-tools
git add packages/mcp-server apps/server/test/mcp/mcp-tickets.test.ts test-cases/14-mcp-server.md Features.md
git commit -m "MCP everything 9: every ticket act through the MCP (14.450-14.458)"
git push -u origin task/mcp-e-9-ticket-tools
```

DONE line: `DONE task/mcp-e-9-ticket-tools <sha40>`.

---

### Task 10: MCP discovery and "me" tools

**Lane:** `task/mcp-e-10-discovery-tools` off `origin/release/mcp-everything` after T3 merged. Parallel with T4–T9, T11, T12. Reads plus three "me" writes through REST doors the app already uses.

**Files:**
- Modify: `packages/mcp-server/src/tools/discovery-tools.ts` (T3's stub), fixture blocks `discovery begin/end`
- Test: `packages/mcp-server/test/discovery-tools.test.ts` (new), `apps/server/test/mcp/mcp-discovery.test.ts` (new, hosted)
- Catalogue: `test-cases/14-mcp-server.md` `### T10`, `Features.md` §14

**Interfaces:**
- Consumes: T3 `postJson` (`submit.ts:93-106`), `Session`.
- Produces: tools `list_ticket_types`, `list_workflows`, `my_work`, `get_attention`, `list_notifications`, `mark_notifications_read`, `list_my_invitations`, `respond_to_invitation`.

Cases (`### T10 — discovery and me`):

```markdown
- ❌ **14.480 — `list_ticket_types(workspaceId)` reads `GET /v1/workspaces/:id/ticket-types` (`builder-reads.ts:757`); `list_workflows(workspaceId)` reads `/workflows` and with `workflowId` reads `/workflows/:workflowId` (states and transitions, `:708`, `:726`); a 404 is "workspace not found or not visible to you" / "workflow not found or not visible to you";** control: the answers pass through unchanged. Mutation: read `/workflows` for a `workflowId` call → red.
- ❌ **14.481 — `my_work(workspaceId)` reads `GET /v1/me/work?workspaceId=` (REQUIRED, SC11) and `get_attention(workspaceId)` reads `/v1/workspaces/:id/attention`;** control: the query string carries the id. Mutation: omit `workspaceId` → the server's 400.
- ❌ **14.482 — `list_notifications({ unreadOnly?, cursor?, limit? })` reads `/v1/me/notifications` with `unread=true`, `cursor`, `limit` (1–100) and passes `nextCursor` through;** control: no arguments → no query string. Mutation: send `unread=1` → the server's `invalid_unread`.
- ❌ **14.483 — `mark_notifications_read({ ids })` posts `{ ids, read: true }` to `/v1/me/notifications/read` (1–100 ids) and answers `{ changed }`; `{ all: true }` pages the UNREAD list (at most 10 pages of 100) and posts each page's ids, answering the total; both or neither is refused;** control: an empty unread list answers `{ changed: 0 }` with no POST. Mutation: post `read: false` → red.
- ❌ **14.484 — `list_my_invitations()` reads `/v1/me/invitations`; `respond_to_invitation({ inviteId, answer: 'accept' | 'decline' })` posts to `/v1/me/invitations/:id/accept` (answers `{ workspaceId }`) or `/decline` (204 → `{ declined: true }`); an invitation that is not the caller's answers the server's own 404 sentence;** control: accept. Mutation: post `decline` for `accept` → red.
- ❌ **14.485 — through the HOSTED door (a token caller), accept and decline work — they use `requireSession` alone (`my-invitations.ts:220-222`, `:262-264`);** control: `list_my_invitations` lists the pending one first. Mutation: none (proves the assumption the spec made).
- ❌ **14.486 — the door matrix (hosted): every discovery tool answers a stranger "workspace not found or not visible to you" (or an empty per-person list), an unknown invitation "invitation not found or not yours", and the member's reads succeed; the three lists page;** control: the allowed calls. Mutation: drop the 404 mapping in `respond_to_invitation` → "gisik-nokma answered 404".
```

- [ ] **Step 1: Failing tests.** `packages/mcp-server/test/discovery-tools.test.ts` (T6's `fake` with `asked`, plus a `posts` recorder on `post`):

```ts
  it('14.483 mark_notifications_read: ids, or all unread in pages', async () => {
    const pages: Record<string, unknown> = {
      '/v1/me/notifications?unread=true&limit=100': { notifications: Array.from({ length: 100 }, (_, i) => ({ id: `n${i}` })), nextCursor: 'n99' },
      '/v1/me/notifications?unread=true&limit=100&cursor=n99': { notifications: [{ id: 'n100' }], nextCursor: null },
    };
    const f = fake(pages, { changed: 1 });
    await tool('mark_notifications_read', f.session).handler({ ids: ['a', 'b'] });
    expect(f.posts[0]).toEqual(['/v1/me/notifications/read', { ids: ['a', 'b'], read: true }]);
    const all = (await tool('mark_notifications_read', f.session).handler({ all: true })) as { changed: number };
    expect(f.posts.slice(1).map(([, b]) => (b as { ids: string[] }).ids.length)).toEqual([100, 1]);
    expect(all.changed).toBe(2);
    await expect(tool('mark_notifications_read', f.session).handler({})).rejects.toThrow('mark_notifications_read takes ids or all: true, not both and not neither');
  });
```

(The fake's `get` looks a path up in `pages` exactly; `post` records `[path, body]` and answers `{ changed: 1 }`.) 14.480–14.482 and 14.484 assert the requested paths from `asked`/`posts` in the same shape; the hosted 14.485 (`mcp-discovery.test.ts`): the owner invites a second phone user through `POST /v1/workspaces/:id/invites` as a session caller, the second user gets a hosted token, `list_my_invitations` lists it, `respond_to_invitation` with `accept` answers the workspace id, and `/v1/me/workspaces` now lists it for them.

The door matrix (14.486) in `apps/server/test/mcp/mcp-discovery.test.ts`:

```ts
it('14.486 every discovery tool: stranger, allowed caller', async () => {
  const w = await buildDoorWorld(db, '2486');
  const WS_GONE = 'workspace not found or not visible to you';
  const ws = (x: typeof w) => ({ workspaceId: x.workspaceId });
  await runDoorMatrix(w, [
    { tool: 'list_ticket_types', args: ws, stranger: WS_GONE, allowed: { caller: 'member' } },
    { tool: 'list_workflows', args: ws, stranger: WS_GONE, allowed: { caller: 'member' } },
    { tool: 'my_work', args: ws, stranger: WS_GONE, allowed: { caller: 'member' } },
    { tool: 'get_attention', args: ws, stranger: WS_GONE, allowed: { caller: 'member' } },
    { tool: 'list_notifications', args: () => ({}), stranger: { json: { notifications: [], nextCursor: null } }, allowed: { caller: 'member' } },
    { tool: 'list_my_invitations', args: () => ({}), stranger: { json: { invitations: [], nextCursor: null } }, allowed: { caller: 'member' } },
    { tool: 'respond_to_invitation', args: () => ({ inviteId: '01J0N0SUCH1NV1TE000000000A', answer: 'accept' }), stranger: 'invitation not found or not yours' },
  ]);
});
```

(Each `stranger` sentence assumes the route 404s a non-member; where `requireMember` answers otherwise — read `my-work.ts:598-610` and `attention.ts:417-420` — the row asserts what the route really answers, and the tool maps it to the sentence.)

- [ ] **Step 2: Run to fail.** `pnpm --filter @gisik-nokma/mcp-server exec vitest run test/discovery-tools.test.ts > /tmp/mcpe-t10.log 2>&1; tail -30 /tmp/mcpe-t10.log`.

- [ ] **Step 3: Implement** `discovery-tools.ts`:

```ts
import { z } from 'zod';
import { HttpError } from '../http-client.js';
import type { Session } from '../session.js';
import type { ToolDefinition } from './read-tools.js';
import { pageArgs, pageField } from './reads.js';
import { postJson } from './submit.js';

const id = z.string().min(1);
const enc = encodeURIComponent;

async function read(session: Session, path: string, notFound: string): Promise<unknown> {
  try {
    return await session.get(path);
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) throw new Error(notFound);
    throw error;
  }
}

export function discoveryTools(session: Session): ToolDefinition[] {
  const markShape = { ids: z.array(id).min(1).max(100).optional(), all: z.literal(true).optional() };
  return [
    {
      name: 'list_ticket_types',
      description: 'The ticket types of a workspace (id, name, icon, the workflow each uses, custom fields). Use a type id with create_ticket.',
      inputSchema: { workspaceId: id, ...pageArgs },
      handler: async (args) => {
        const a = z.object({ workspaceId: id, ...pageArgs }).parse(args);
        const body = (await read(session, `/v1/workspaces/${enc(a.workspaceId)}/ticket-types`, 'workspace not found or not visible to you')) as Record<string, unknown>;
        return pageField(body, 'ticketTypes', a.cursor, a.limit); // `builder-reads.ts:766`
      },
    },
    {
      name: 'list_workflows',
      description: "A workspace's workflows; with workflowId, that workflow's states and the moves allowed between them (use a state id with transition_ticket).",
      inputSchema: { workspaceId: id, workflowId: id.optional(), ...pageArgs },
      handler: async (args) => {
        const a = z.object({ workspaceId: id, workflowId: id.optional(), ...pageArgs }).parse(args);
        if (a.workflowId !== undefined) return read(session, `/v1/workspaces/${enc(a.workspaceId)}/workflows/${enc(a.workflowId)}`, 'workflow not found or not visible to you');
        const body = (await read(session, `/v1/workspaces/${enc(a.workspaceId)}/workflows`, 'workspace not found or not visible to you')) as Record<string, unknown>;
        return pageField(body, 'workflows', a.cursor, a.limit); // `builder-reads.ts:720`
      },
    },
    {
      name: 'my_work',
      description: 'What is on your plate in one workspace: the tickets assigned to you or that you collaborate on, grouped the way the My Work screen groups them.',
      inputSchema: { workspaceId: id },
      handler: async (args) => read(session, `/v1/me/work?${new URLSearchParams({ workspaceId: z.object({ workspaceId: id }).parse(args).workspaceId }).toString()}`, 'workspace not found or not visible to you'),
    },
    {
      name: 'get_attention',
      description: 'What needs attention in a workspace: overdue, due soon, stale and blocked work, as the attention strip shows it.',
      inputSchema: { workspaceId: id },
      handler: async (args) => read(session, `/v1/workspaces/${enc(z.object({ workspaceId: id }).parse(args).workspaceId)}/attention`, 'workspace not found or not visible to you'),
    },
    {
      name: 'list_notifications',
      description: 'Your notifications, newest first (mentions, assignments, conflicts). unreadOnly for just the unread; page with cursor (the answer carries nextCursor); limit 1–100.',
      inputSchema: { unreadOnly: z.boolean().optional(), cursor: id.optional(), limit: z.number().int().min(1).max(100).optional() },
      handler: async (args) => {
        const a = z.object({ unreadOnly: z.boolean().optional(), cursor: id.optional(), limit: z.number().int().min(1).max(100).optional() }).parse(args);
        const q = new URLSearchParams();
        if (a.unreadOnly === true) q.set('unread', 'true');
        if (a.limit !== undefined) q.set('limit', String(a.limit));
        if (a.cursor !== undefined) q.set('cursor', a.cursor);
        const qs = q.toString();
        return session.get(`/v1/me/notifications${qs === '' ? '' : `?${qs}`}`);
      },
    },
    {
      name: 'mark_notifications_read',
      description: 'Mark notifications read: the given ids (1–100), or all: true for every unread one.',
      inputSchema: markShape,
      handler: async (args) => {
        const a = z.object(markShape).parse(args);
        if ((a.ids === undefined) === (a.all === undefined)) throw new Error('mark_notifications_read takes ids or all: true, not both and not neither');
        if (a.ids !== undefined) return postJson(session, '/v1/me/notifications/read', { ids: a.ids, read: true });
        let changed = 0;
        let cursor: string | null = null;
        for (let page = 0; page < 10; page++) {
          const q = new URLSearchParams({ unread: 'true', limit: '100' });
          if (cursor !== null) q.set('cursor', cursor);
          const list = (await session.get(`/v1/me/notifications?${q.toString()}`)) as { notifications: Array<{ id: string }>; nextCursor: string | null };
          if (list.notifications.length === 0) break;
          const done = (await postJson(session, '/v1/me/notifications/read', { ids: list.notifications.map((n) => n.id), read: true })) as { changed: number | unknown[] };
          changed += Array.isArray(done.changed) ? done.changed.length : Number(done.changed);
          cursor = list.nextCursor;
          if (cursor === null) break;
        }
        return { changed };
      },
    },
    {
      name: 'list_my_invitations',
      description: 'Invitations waiting for you to accept or decline, across workspaces.',
      inputSchema: { ...pageArgs },
      handler: async (args) => {
        const a = z.object(pageArgs).parse(args);
        return pageField((await session.get('/v1/me/invitations')) as Record<string, unknown>, 'invitations', a.cursor, a.limit); // `my-invitations.ts:184-200`
      },
    },
    {
      name: 'respond_to_invitation',
      description: 'Accept or decline one of your invitations (inviteId from list_my_invitations). Accepting adds you to the workspace with the invited role.',
      inputSchema: { inviteId: id, answer: z.enum(['accept', 'decline']) },
      handler: async (args) => {
        const a = z.object({ inviteId: id, answer: z.enum(['accept', 'decline']) }).parse(args);
        let out: unknown;
        try {
          out = await postJson(session, `/v1/me/invitations/${enc(a.inviteId)}/${a.answer}`, {});
        } catch (error) {
          // `INVITATION_NOT_YOURS_BODY` is a 404 (`my-invitations.ts:229-236`): one sentence for "no such invitation" and "not yours".
          if (error instanceof HttpError && error.status === 404) throw new Error('invitation not found or not yours');
          throw error;
        }
        return a.answer === 'decline' ? { declined: true } : out;
      },
    },
  ];
}
```

(`changed`'s exact type is `markNotificationsRead`'s return — read `notifications/store.ts`; count accordingly.) Fixture blocks: the eight names; sweep entries with `session.get` answering `{ notifications: [], nextCursor: null }`.

- [ ] **Step 4: Pass + battery** (T6 Step 5 shape). Mutations: `read: false` (14.483), `/decline` for accept (14.484).

- [ ] **Step 5: Catalogue + commit.** Flip 14.480–14.486. Features.md §14:

```markdown
- ✅ **The assistant can find its way around and act on your inbox** (MCP-everything T10; `packages/mcp-server/src/tools/discovery-tools.ts`) — `list_ticket_types`, `list_workflows` (states and allowed moves), `my_work`, `get_attention`, `list_notifications`, `mark_notifications_read` (ids, or all unread), `list_my_invitations`, `respond_to_invitation` (accept/decline). Cases 14.480–14.486.
```

```bash
git branch --show-current   # task/mcp-e-10-discovery-tools
git add packages/mcp-server apps/server/test/mcp/mcp-discovery.test.ts test-cases/14-mcp-server.md Features.md
git commit -m "MCP everything 10: discovery and me tools (14.480-14.486)"
git push -u origin task/mcp-e-10-discovery-tools
```

DONE line: `DONE task/mcp-e-10-discovery-tools <sha40>`.

---

### Task 11: MCP admin — members, prefix, groups (behind a confirmation)

**Lane:** `task/mcp-e-11-member-admin` off `origin/release/mcp-everything` after T3 merged. Parallel with T4–T10, T12. Every write here answers a PREVIEW unless `confirm_name` is exact (M-E4, §5.1); the product's role rules still decide who may act.

**`confirm_name` per act (owner question Q5, recommended):**

| Tool / action | `confirm_name` must be | Preview counts |
|---|---|---|
| `manage_members` `invite` | the address being invited | — |
| `manage_members` `revoke_invite` | the invitation's address | — |
| `manage_members` `change_role` / `remove` / `add_to_project` / `remove_from_project` | the person's display name (as `list_members` shows it) | `remove`: none (the server decides what leaves) |
| `change_prefix` | the workspace's or project's current name | `ticketKeys`: tickets whose keys change (directory ticket counts) |
| `manage_groups` `create` | the workspace's name | — |
| `manage_groups` `rename` / `reorder` / `delete` | the group's current name | `delete`: `projects` filed in it |
| `manage_groups` `file_project` | the project's current name | — |

**Files:**
- Modify: `packages/mcp-server/src/tools/member-admin-tools.ts` (T3's stub), fixture blocks `member-admin begin/end`
- Test: `packages/mcp-server/test/member-admin-tools.test.ts` (new), `apps/server/test/mcp/mcp-admin-roles.test.ts` (new, hosted: the guest/member/admin/owner matrix, spec §7)
- Catalogue: `test-cases/14-mcp-server.md` `### T11`, `Features.md` §14

**Interfaces:**
- Consumes: T3 `confirmOrPreview`, `submitOne`, `postJson`, `envelopeFor`; `directory.ts`' `readDirectory` (`:32-34`); domain `newUlid`, `rankBetween`, `WORKSPACE_ROLES`, `INVITE_ROLES`, `INVITE_CHANNELS`.
- Produces: tools `manage_members`, `change_prefix`, `manage_groups`.

Cases (`### T11 — members, prefix, groups`):

```markdown
- ❌ **14.500 — every act of the three tools without the exact `confirm_name` answers a preview and sends NOTHING (no `postEvents`, no `post`); with it, exactly one write;** control: the exact name. Mutation: write before checking → red.
- ❌ **14.501 — `manage_members`: `invite` posts `/v1/workspaces/:id/invites { address, channel, role, projectIds? }`; `revoke_invite` sends `invite.revoked { inviteId }` against the invite; `change_role` sends `membership.granted { userId, role }` against `membership` `<ws>:<userId>`; `remove` posts `/v1/workspaces/:id/members/:userId/remove`; `add_to_project` / `remove_from_project` send `project.member_added { userId, projectAdmin }` / `project.member_removed { userId }`; each envelope passes `parseEvent`;** control: invite. Mutation: send `membership.revoked` for `remove` (the app uses the route) → red.
- ❌ **14.502 — a `confirm_name` with a trailing space (`"Corner Shop "` for a group or workspace named `Corner Shop`) answers a preview naming the exact name and writes nothing** (Review Focus 5). Control: the exact name writes. Mutation: `trim()` → red.
- ❌ **14.503 — `change_prefix` previews the ticket keys that change (the workspace: every project's ticket count; a project: its own) and sends `workspace.prefix_changed { prefix }` or `project.updated { prefix }`; the server's prefix refusals (`project.prefix-taken`, reserved) come back verbatim;** control: the count. Mutation: count zero → red.
- ❌ **14.504 — `manage_groups`: `list` reads `/v1/workspaces/:id/groups`; `create` sends `group.created { parentId, level (parent's + 1, or 1), name, rank (after the last sibling) }` against a new group id; `rename` / `reorder` (`rankBetween` of the given neighbours) / `delete` send their events; `file_project` sends `project.updated { groupId }` (null ungroups); `delete`'s preview counts the projects filed in it;** control: `list`. Mutation: level always 1 → the server refuses a child group.
- ❌ **14.506 — the door matrix (hosted): a stranger gets "workspace not found or not visible to you" for every act (never "answered 404" — the groups and members reads use `readOrNotFound`), a plain member is refused confirmed admin acts in the gate's words, and the owner's event is `origin: 'mcp'`; `manage_groups list` pages;** control: the allowed calls. Mutation: `session.get` for the groups read → the stranger reads "answered 404".
- ❌ **14.505 — through the HOSTED door, the role matrix holds per tool: a guest and a member are refused (in the product's words) for every write act, an admin may invite/change roles below owner/manage groups, and only the owner may grant `owner`;** control: the owner's confirmed `change_prefix` commits. Mutation: none in the package (the gate is the product's; this proves the MCP added no authority).
```

- [ ] **Step 1: Failing tests.** `packages/mcp-server/test/member-admin-tools.test.ts` (T6's `fake` with `batches` and `posts`; routes for `/v1/me/workspaces` → one workspace `Corner Shop` (prefix `CS`, role owner) with projects `[{ projectId: P, name: 'Shop floor', prefix: 'SF', ticketCount: 7 }, { projectId: P2, name: 'Stock', prefix: 'ST', ticketCount: 5 }]`; `/members` → `[{ userId: RAVI, displayName: 'Ravi Sangma', role: 'member' }]`; `/invites` → `[{ inviteId: INV, address: 'asha@example.in', role: 'member' }]`; `/groups` → `{ groups: [{ id: G, parentId: null, level: 1, name: 'Corner Shop', rank: 'm', projectCount: 2, childCount: 0 }] }`):

```ts
  it('14.500 / 14.502 no exact name → preview, nothing written; trailing space is not exact', async () => {
    const f = fake(ROUTES);
    const calls: Array<[string, Record<string, unknown>]> = [
      ['manage_members', { workspaceId: WS, action: 'change_role', userId: RAVI, role: 'admin', confirm_name: 'ravi sangma' }],
      ['manage_members', { workspaceId: WS, action: 'invite', address: 'new@example.in', channel: 'email', role: 'member' }],
      ['change_prefix', { workspaceId: WS, prefix: 'CC', confirm_name: 'Corner Shop ' }],
      ['manage_groups', { workspaceId: WS, action: 'rename', groupId: G, name: 'Front', confirm_name: 'Corner Shop ' }],
    ];
    for (const [name, args] of calls) {
      expect(await tool(name, f.session).handler(args), name).toMatchObject({ preview: true, nothingChanged: true });
    }
    expect(f.batches).toEqual([]);
    expect(f.posts).toEqual([]);
    await tool('change_prefix', f.session).handler({ workspaceId: WS, prefix: 'CC', confirm_name: 'Corner Shop' }); // control
    expect(f.batches.flat().map((e) => e['type'])).toEqual(['workspace.prefix_changed']);
  });

  it('14.503 the preview counts the keys that change', async () => {
    const f = fake(ROUTES);
    expect(await tool('change_prefix', f.session).handler({ workspaceId: WS, prefix: 'CC' })).toMatchObject({ counts: { ticketKeys: 12 } });
    expect(await tool('change_prefix', f.session).handler({ projectId: P, prefix: 'FL' })).toMatchObject({ counts: { ticketKeys: 7 }, confirm: 'confirm_name must be "Shop floor"' });
  });
```

and 14.501 / 14.504 asserting each act's single write (type, entity, payload, `parseEvent` ok), in the same shape. Hosted 14.505 (`mcp-admin-roles.test.ts`): four phone users (owner founds; admin, member and guest join through `membership.granted` posted by the owner), each gets a hosted token; for `manage_members change_role` (confirmed), `manage_groups create` (confirmed) and `change_prefix` (confirmed) assert guest and member get `isError` with the product's refusal text and the admin/owner commit; then an admin's `change_role … role: 'owner'` is refused with `WORKSPACE_OWNER_GRANT_REASON` (`check-permission.ts:153`), the owner's commits.

The door matrix (14.506) in `apps/server/test/mcp/mcp-admin-roles.test.ts` (the role matrix 14.505 covers admin/owner/guest; this covers the stranger and a plain member for every act):

```ts
it('14.506 every admin act: stranger, member, owner', async () => {
  const w = await buildDoorWorld(db, '2506');
  const WS_GONE = 'workspace not found or not visible to you';
  const NOT_ADMIN = `refused by ${PERMISSION_ROLE_RULE}: ${adminOnlyReason('member')}`; // check-permission.ts:297; read the exact reason each act's gate gives and use its constant
  await runDoorMatrix(w, [
    { tool: 'manage_groups', args: (x) => ({ workspaceId: x.workspaceId, action: 'list' }), stranger: WS_GONE, allowed: { caller: 'member' } },
    { tool: 'manage_groups', args: (x) => ({ workspaceId: x.workspaceId, action: 'create', name: 'Front', confirm_name: x.workspaceName }), stranger: WS_GONE,
      forbidden: { text: NOT_ADMIN }, allowed: { caller: 'owner', eventType: 'group.created' } },
    { tool: 'change_prefix', args: (x) => ({ workspaceId: x.workspaceId, prefix: 'DM', confirm_name: x.workspaceName }), stranger: WS_GONE,
      forbidden: { text: NOT_ADMIN }, allowed: { caller: 'owner', eventType: 'workspace.prefix_changed' } },
    { tool: 'manage_members', args: (x) => ({ workspaceId: x.workspaceId, action: 'add_to_project', userId: x.member.userId, projectId: x.projectId, projectAdmin: true, confirm_name: x.memberName }),
      stranger: WS_GONE, allowed: { caller: 'owner', eventType: 'project.member_added' } },
  ]);
});
```

(`memberName` is the roster's display name, read by `buildDoorWorld`; a stranger's `readDirectory` finds no workspace, hence `WS_GONE`.)

- [ ] **Step 2: Run to fail.** `pnpm --filter @gisik-nokma/mcp-server exec vitest run test/member-admin-tools.test.ts > /tmp/mcpe-t11.log 2>&1; tail -30 /tmp/mcpe-t11.log`.

- [ ] **Step 3: Implement** `member-admin-tools.ts`:

```ts
import { z } from 'zod';
import { INVITE_CHANNELS, INVITE_ROLES, newUlid, rankBetween, WORKSPACE_ROLES } from '@gisik-nokma/domain';
import type { Session } from '../session.js';
import { readDirectory } from './directory.js';
import { confirmOrPreview } from './preview.js';
import type { ToolDefinition } from './read-tools.js';
import { page, pageArgs, readOrNotFound } from './reads.js';
import { envelopeFor, postJson, submitOne } from './submit.js';

const id = z.string().min(1);
const enc = encodeURIComponent;
type Member = { userId: string; displayName: string; role: string };
type Group = { id: string; parentId: string | null; level: number; name: string; rank: string; projectCount: number; childCount: number };

async function workspaceOf(session: Session, workspaceId: string) {
  const ws = (await readDirectory(session)).find((w) => w.workspaceId === workspaceId);
  if (ws === undefined) throw new Error('workspace not found or not visible to you');
  return ws;
}
async function memberOf(session: Session, workspaceId: string, userId: string): Promise<Member> {
  const { members } = (await readOrNotFound(session, `/v1/workspaces/${enc(workspaceId)}/members`, 'workspace')) as { members: Member[] };
  const m = members.find((x) => x.userId === userId);
  if (m === undefined) throw new Error('person not found in this workspace');
  return m;
}
async function groupsOf(session: Session, workspaceId: string): Promise<Group[]> {
  // The groups route 404s a GUEST as well as a stranger (`routes/groups.ts:37-39`): one sentence for both.
  return ((await readOrNotFound(session, `/v1/workspaces/${enc(workspaceId)}/groups`, 'workspace')) as { groups: Group[] }).groups;
}

const membersShape = {
  workspaceId: id,
  action: z.enum(['invite', 'revoke_invite', 'change_role', 'remove', 'add_to_project', 'remove_from_project']),
  userId: id.optional(), role: z.enum(WORKSPACE_ROLES).optional(), projectId: id.optional(), projectAdmin: z.boolean().optional(),
  address: z.string().min(1).optional(), channel: z.enum(INVITE_CHANNELS).optional(), inviteRole: z.enum(INVITE_ROLES).optional(),
  projectIds: z.array(id).optional(), inviteId: id.optional(), confirm_name: z.string().optional(),
};

export function memberAdminTools(session: Session): ToolDefinition[] {
  return [
    {
      name: 'manage_members',
      description:
        'Workspace people, behind a confirmation: invite (address, channel email|phone, inviteRole admin|member|guest, projectIds?), revoke_invite (inviteId), ' +
        'change_role (userId, role), remove (userId), add_to_project / remove_from_project (userId, projectId, projectAdmin?). Without confirm_name — the ' +
        "invited address, or the person's exact name from list_members — you get a preview of what would change and nothing happens. Your role decides what is allowed.",
      inputSchema: membersShape,
      handler: async (args) => {
        const a = z.object(membersShape).parse(args);
        const need = <T>(value: T | undefined, name: string): T => {
          if (value === undefined) throw new Error(`${a.action} needs ${name}`);
          return value;
        };
        if (a.action === 'invite') {
          const address = need(a.address, 'address');
          const role = need(a.inviteRole, 'inviteRole');
          const preview = await confirmOrPreview(address, a.confirm_name, async () => ({ sentence: `Sends an invitation to ${address} to join as ${role}.` }));
          if (preview !== null) return preview;
          return postJson(session, `/v1/workspaces/${enc(a.workspaceId)}/invites`, {
            address, channel: need(a.channel, 'channel'), role, ...(a.projectIds === undefined ? {} : { projectIds: a.projectIds }),
          });
        }
        if (a.action === 'revoke_invite') {
          const inviteId = need(a.inviteId, 'inviteId');
          const { invites } = (await readOrNotFound(session, `/v1/workspaces/${enc(a.workspaceId)}/invites`, 'workspace')) as { invites: Array<{ inviteId: string; address: string }> };
          const invite = invites.find((i) => i.inviteId === inviteId);
          if (invite === undefined) throw new Error('invitation not found or not visible to you');
          const preview = await confirmOrPreview(invite.address, a.confirm_name, async () => ({ sentence: `Withdraws the invitation to ${invite.address}.` }));
          if (preview !== null) return preview;
          return submitOne(session, envelopeFor(session, a.workspaceId, { kind: 'invite', id: inviteId }, 'invite.revoked', { inviteId }));
        }
        const person = await memberOf(session, a.workspaceId, need(a.userId, 'userId'));
        const confirm = (sentence: string) => confirmOrPreview(person.displayName, a.confirm_name, async () => ({ sentence }));
        if (a.action === 'change_role') {
          const role = need(a.role, 'role');
          const preview = await confirm(`Changes ${person.displayName} from ${person.role} to ${role}.`);
          if (preview !== null) return preview;
          return submitOne(session, envelopeFor(session, a.workspaceId, { kind: 'membership', id: `${a.workspaceId}:${person.userId}` }, 'membership.granted', { userId: person.userId, role }));
        }
        if (a.action === 'remove') {
          const preview = await confirm(`Removes ${person.displayName} from the workspace and every project in it.`);
          if (preview !== null) return preview;
          return postJson(session, `/v1/workspaces/${enc(a.workspaceId)}/members/${enc(person.userId)}/remove`, {});
        }
        const projectId = need(a.projectId, 'projectId');
        const adding = a.action === 'add_to_project';
        const preview = await confirm(`${adding ? 'Adds' : 'Removes'} ${person.displayName} ${adding ? 'to' : 'from'} the project.`);
        if (preview !== null) return preview;
        return submitOne(
          session,
          envelopeFor(session, a.workspaceId, { kind: 'project', id: projectId }, adding ? 'project.member_added' : 'project.member_removed',
            adding ? { userId: person.userId, projectAdmin: a.projectAdmin ?? false } : { userId: person.userId }),
        );
      },
    },
    {
      name: 'change_prefix',
      description: "Change a workspace's (workspaceId) or a project's (projectId) key prefix — every ticket key under it changes (old keys still find the ticket). confirm_name is its exact current name; without it you get a preview counting the keys that change.",
      inputSchema: { workspaceId: id.optional(), projectId: id.optional(), prefix: z.string().regex(/^[A-Z]{1,3}$/), confirm_name: z.string().optional() },
      handler: async (args) => {
        const a = z.object({ workspaceId: id.optional(), projectId: id.optional(), prefix: z.string().regex(/^[A-Z]{1,3}$/), confirm_name: z.string().optional() }).parse(args);
        if ((a.workspaceId === undefined) === (a.projectId === undefined)) throw new Error('change_prefix takes exactly one of workspaceId or projectId');
        const directory = await readDirectory(session);
        if (a.workspaceId !== undefined) {
          const ws = directory.find((w) => w.workspaceId === a.workspaceId);
          if (ws === undefined) throw new Error('workspace not found or not visible to you');
          const keys = ws.projects.reduce((n, p) => n + (p.ticketCount ?? 0), 0);
          const preview = await confirmOrPreview(ws.name, a.confirm_name, async () => ({
            sentence: `Changes the workspace prefix from ${ws.prefix} to ${a.prefix}; every ticket key in it changes.`, counts: { ticketKeys: keys },
          }));
          if (preview !== null) return preview;
          return submitOne(session, envelopeFor(session, ws.workspaceId, { kind: 'workspace', id: ws.workspaceId }, 'workspace.prefix_changed', { prefix: a.prefix }));
        }
        for (const ws of directory) {
          const project = ws.projects.find((p) => p.projectId === a.projectId);
          if (project === undefined) continue;
          const preview = await confirmOrPreview(project.name, a.confirm_name, async () => ({
            sentence: `Changes the project prefix from ${project.prefix} to ${a.prefix}; its ticket keys change.`, counts: { ticketKeys: project.ticketCount ?? 0 },
          }));
          if (preview !== null) return preview;
          return submitOne(session, envelopeFor(session, ws.workspaceId, { kind: 'project', id: project.projectId }, 'project.updated', { prefix: a.prefix }));
        }
        throw new Error('project not found or not visible to you');
      },
    },
    {
      name: 'manage_groups',
      description:
        'Project groups (up to 4 levels): list; create (name, parentId?); rename (groupId, name); reorder (groupId, before?/after? sibling ids); delete (groupId); ' +
        "file_project (projectId, groupId or null to ungroup). Every change but list needs confirm_name — the group's exact name (the workspace's for create, the project's for file_project); without it you get a preview.",
      inputSchema: {
        workspaceId: id, action: z.enum(['list', 'create', 'rename', 'reorder', 'delete', 'file_project']), groupId: id.nullable().optional(),
        parentId: id.optional(), name: z.string().min(1).optional(), before: id.optional(), after: id.optional(), projectId: id.optional(), confirm_name: z.string().optional(),
        ...pageArgs,
      },
      handler: async (args) => {
        const a = z.object({
          workspaceId: id, action: z.enum(['list', 'create', 'rename', 'reorder', 'delete', 'file_project']), groupId: id.nullable().optional(),
          parentId: id.optional(), name: z.string().min(1).optional(), before: id.optional(), after: id.optional(), projectId: id.optional(), confirm_name: z.string().optional(),
          ...pageArgs,
        }).parse(args);
        const groups = await groupsOf(session, a.workspaceId);
        if (a.action === 'list') {
          const { items, nextCursor } = page(groups, a.cursor, a.limit);
          return { groups: items, nextCursor };
        }
        const g = (gid: string | null | undefined): Group => {
          const found = groups.find((x) => x.id === gid);
          if (found === undefined) throw new Error('group not found or not visible to you');
          return found;
        };
        const ev = (entity: { kind: 'group' | 'project'; id: string }, type: string, payload: unknown) => submitOne(session, envelopeFor(session, a.workspaceId, entity, type, payload));
        if (a.action === 'create') {
          const name = a.name ?? '';
          const parent = a.parentId === undefined ? null : g(a.parentId);
          const siblings = groups.filter((x) => x.parentId === (parent?.id ?? null)).sort((x, y) => (x.rank < y.rank ? -1 : 1));
          const ws = await workspaceOf(session, a.workspaceId);
          const preview = await confirmOrPreview(ws.name, a.confirm_name, async () => ({ sentence: `Creates the group "${name}"${parent === null ? '' : ` inside "${parent.name}"`}.` }));
          if (preview !== null) return preview;
          return ev({ kind: 'group', id: newUlid() }, 'group.created', {
            parentId: parent?.id ?? null, level: parent === null ? 1 : parent.level + 1, name, rank: rankBetween(siblings.at(-1)?.rank ?? null, null),
          });
        }
        if (a.action === 'file_project') {
          const ws = await workspaceOf(session, a.workspaceId);
          const project = ws.projects.find((p) => p.projectId === a.projectId);
          if (project === undefined) throw new Error('project not found or not visible to you');
          const target = a.groupId === null || a.groupId === undefined ? null : g(a.groupId);
          const preview = await confirmOrPreview(project.name, a.confirm_name, async () => ({ sentence: target === null ? `Takes "${project.name}" out of its group.` : `Files "${project.name}" under "${target.name}".` }));
          if (preview !== null) return preview;
          return ev({ kind: 'project', id: project.projectId }, 'project.updated', { groupId: target?.id ?? null });
        }
        const group = g(a.groupId);
        const sentences = { rename: `Renames "${group.name}" to "${a.name ?? ''}".`, reorder: `Moves "${group.name}" among its siblings.`, delete: `Deletes the group "${group.name}".` } as const;
        const preview = await confirmOrPreview(group.name, a.confirm_name, async () => ({
          sentence: sentences[a.action as 'rename' | 'reorder' | 'delete'],
          ...(a.action === 'delete' ? { counts: { projects: group.projectCount } } : {}),
        }));
        if (preview !== null) return preview;
        if (a.action === 'rename') return ev({ kind: 'group', id: group.id }, 'group.renamed', { name: a.name ?? '' });
        if (a.action === 'delete') return ev({ kind: 'group', id: group.id }, 'group.deleted', {});
        const rankOf = (gid: string | undefined) => (gid === undefined ? null : g(gid).rank);
        return ev({ kind: 'group', id: group.id }, 'group.reordered', { rank: rankBetween(rankOf(a.before), rankOf(a.after)) });
      },
    },
  ];
}
```

(The `membership` entity id `<workspaceId>:<userId>` is the shape the app and the fixtures use, `apps/server/test/helpers/notes-fixture.ts:147`; read the Members screen's own `membership.granted` builder at `apps/web/app/w/[workspaceId]/members/page.tsx:400-415` and match it exactly. `rankBetween` signature: `packages/domain/src/rank.ts:54`.) Fixture blocks: the three names; sweep entries with the `ROUTES` answers above folded into one `get`.

- [ ] **Step 4: Pass + battery** (T6 Step 5 shape, plus `pnpm --filter @gisik-nokma/server exec vitest run test/mcp/mcp-admin-roles.test.ts`). Mutations: write before confirming (14.500), `trim()` (14.502), level always 1 (14.504).

- [ ] **Step 5: Catalogue + commit.** Flip 14.500–14.506. Features.md §14:

```markdown
- ✅ **The assistant can run workspace admin, behind a confirmation** (MCP-everything T11; `packages/mcp-server/src/tools/member-admin-tools.ts`, `tools/preview.ts`) — `manage_members` (invite, withdraw an invitation, change a role, remove someone, add to / remove from a project), `change_prefix` (workspace or project; the preview counts the ticket keys that change), `manage_groups` (list, create, rename, reorder, delete, file a project). Nothing changes until `confirm_name` is exactly the person's name, the address, or the item's current name; without it the answer is a plain preview. Your role still decides; the assistant gains nothing (guest/member/admin/owner matrix). Cases 14.500–14.506.
```

```bash
git branch --show-current   # task/mcp-e-11-member-admin
git add packages/mcp-server apps/server/test/mcp/mcp-admin-roles.test.ts test-cases/14-mcp-server.md Features.md
git commit -m "MCP everything 11: members, prefix and groups behind a confirmation (14.500-14.506)"
git push -u origin task/mcp-e-11-member-admin
```

DONE line: `DONE task/mcp-e-11-member-admin <sha40>`.

---

### Task 12: MCP admin — workflow and type definitions, type migration, visibility, settings

**Lane:** `task/mcp-e-12-definition-admin` off `origin/release/mcp-everything` after T3 merged. Parallel with T4–T11.

**Files:**
- Modify: `packages/mcp-server/src/tools/definition-admin-tools.ts` (T3's stub), fixture blocks `definition-admin begin/end`
- Test: `packages/mcp-server/test/definition-admin-tools.test.ts` (new), `apps/server/test/mcp/mcp-definitions.test.ts` (new, hosted)
- Catalogue: `test-cases/14-mcp-server.md` `### T12`, `Features.md` §14

**Interfaces:**
- Consumes: T3 `confirmOrPreview`, `submitOne`, `postJson`, `envelopeFor`; `directory.ts` `readDirectory`; domain `workflowDefSchema`, `stateMappingSchema` (`packages/domain/src/workflow.ts:100-110`), `ticketTypeDefSchema` (`ticket-types.ts:97`), `VISIBILITY_MODES` (`events/visibility.ts:18`), `workspaceSettingsSetPayloadSchema` (`events/workspace-settings.ts:46`), `newUlid`.
- Produces: tools `define_workflow`, `define_ticket_type`, `migrate_ticket_type`, `set_visibility`, `update_workspace_settings`.

Cases (`### T12 — definitions, migration, visibility, settings`):

```markdown
- ❌ **14.530 — `define_workflow` validates `definition` with the domain's `workflowDefSchema` BEFORE anything (a bad definition is refused naming the zod path), previews "publishes version N of workflow X (S states, T moves)" with the tickets currently in it (`state-occupancy`, admin-only), and on the exact name (the workflow's CURRENT name, or the workspace's for a new id) sends ONE `workflow.defined` against `workflow` `<definition.id>` with the optional `stateMapping`;** control: the confirmed new workflow. Mutation: skip the schema → a malformed definition reaches the server.
- ❌ **14.531 — `define_ticket_type` validates with `ticketTypeDefSchema`, confirms against the type's current name (or the workspace's for a new type), previews the tickets of that type (`ticket-counts-by-type`), and sends ONE `ticket-type.defined` against a FRESH `ticket-type` entity id (the app's convention, `packages/app-core/src/workflow-builder/events.ts:58-62`);** control: the payload passes `parseEvent`. Mutation: reuse the type id as the entity id → red.
- ❌ **14.532 — `migrate_ticket_type` confirms against the type's name, previews the population (`…/population?workflowId=`) and posts `{ fromWorkflowId, toWorkflowId, stateMap }` to `…/ticket-types/:typeId/migrate`, answering `{ status, count }`; the route's refusals (`migration.same-workflow`, unmapped states) come back verbatim;** control: a confirmed migration. Mutation: send `stateMap` as an array → the route's 400.
- ❌ **14.533 — `set_visibility` confirms against the ticket KEY, previews the change from the current audience, and sends `visibility.set { ticketId, mode, userIds? }` — `userIds` only with `explicit` (refused locally otherwise, SC12);** control: `mode: 'project'`. Mutation: always send `userIds` → the domain refuses.
- ❌ **14.534 — `update_workspace_settings` confirms against the workspace name and sends `workspace.settings_set` with only the given settings (`autoCloseAfterDays: null` turns auto-close off; nothing given is refused);** control: one setting. Mutation: send every key → red.
- ❌ **14.535 — through the hosted door a MEMBER is refused each of the five (in the product's words) and an ADMIN commits each confirmed act;** control: the admin's. Mutation: none (proves no added authority).
- ❌ **14.536 — the door matrix (hosted): a stranger gets the uniform "workspace … / ticket not found or not visible to you" for each of the five, a plain member is refused the confirmed admin acts verbatim, and the owner's event is `origin: 'mcp'`;** control: the allowed calls. Mutation: read ticket-types with `session.get` → the stranger reads "answered 404".
```

- [ ] **Step 1: Failing tests.** `packages/mcp-server/test/definition-admin-tools.test.ts` (T6 `fake` with `batches`/`posts`):

```ts
  it('14.530 define_workflow: schema first, preview, then one event', async () => {
    const f = fake(ROUTES); // /workflows/wf-new → 404 (HttpError), /me/workspaces → 'Corner Shop'
    const definition = {
      id: 'wf-new', version: 1, name: 'Repairs', initialStateId: 'open',
      states: [{ id: 'open', name: 'Open', category: 'open' }, { id: 'done', name: 'Done', category: 'terminal' }],
      transitions: [{ from: 'open', to: 'done' }],
    };
    await expect(tool('define_workflow', f.session).handler({ workspaceId: WS, definition: { ...definition, states: 'x' }, confirm_name: 'Corner Shop' })).rejects.toThrow(/states/);
    expect(await tool('define_workflow', f.session).handler({ workspaceId: WS, definition })).toMatchObject({
      preview: true, confirm: 'confirm_name must be "Corner Shop"', counts: { ticketsInWorkflow: 0 },
    });
    expect(f.batches).toEqual([]);
    await tool('define_workflow', f.session).handler({ workspaceId: WS, definition, confirm_name: 'Corner Shop' });
    expect(f.batches[0]?.[0]).toMatchObject({ type: 'workflow.defined', entity: { kind: 'workflow', id: 'wf-new' }, payload: definition });
  });

  it('14.533 set_visibility: userIds only with explicit', async () => {
    const f = fake(ROUTES);
    await expect(tool('set_visibility', f.session).handler({ workspaceId: WS, ticketId: T, mode: 'project', userIds: [RAVI], confirm_name: 'CCSO-4' })).rejects.toThrow(
      'userIds go only with mode "explicit"',
    );
    await tool('set_visibility', f.session).handler({ workspaceId: WS, ticketId: T, mode: 'explicit', userIds: [RAVI], confirm_name: 'CCSO-4' });
    expect(f.batches[0]?.[0]).toMatchObject({ type: 'visibility.set', payload: { ticketId: T, mode: 'explicit', userIds: [RAVI] } });
  });
```

(Read `workflowStateSchema` / `transitionSchema` in `packages/domain/src/workflow.ts` and write the fixture's states and transitions in their exact keys — the fixture must PARSE, and the first assertion must fail on `states` alone.) 14.531, 14.532, 14.534 in the same shape; hosted 14.535 in `mcp-definitions.test.ts` with a member and an admin token (as T11's matrix test).

The door matrix (14.536) in `apps/server/test/mcp/mcp-definitions.test.ts`:

```ts
it('14.536 every definition/visibility/settings act: stranger, member, owner', async () => {
  const w = await buildDoorWorld(db, '2536');
  const WS_GONE = 'workspace not found or not visible to you';
  const NOT_ADMIN = `refused by ${PERMISSION_ROLE_RULE}: ${adminOnlyReason('member')}`; // or the act's own exported reason — exact either way
  await runDoorMatrix(w, [
    { tool: 'update_workspace_settings', args: (x) => ({ workspaceId: x.workspaceId, staleDays: 9, confirm_name: x.workspaceName }), stranger: WS_GONE,
      forbidden: { text: NOT_ADMIN }, allowed: { caller: 'owner', eventType: 'workspace.settings_set' } },
    { tool: 'set_visibility', args: (x) => ({ workspaceId: x.workspaceId, ticketId: x.ticketId, mode: 'project', confirm_name: x.ticketKey }),
      stranger: 'ticket not found or not visible to you', allowed: { caller: 'owner', eventType: 'visibility.set' } },
    { tool: 'define_ticket_type', args: (x) => ({ workspaceId: x.workspaceId, definition: NEW_TYPE, confirm_name: x.workspaceName }), stranger: WS_GONE,
      forbidden: { text: NOT_ADMIN }, allowed: { caller: 'owner', eventType: 'ticket-type.defined' } },
    { tool: 'migrate_ticket_type', args: (x) => ({ workspaceId: x.workspaceId, typeId: 'task', fromWorkflowId: 'a', toWorkflowId: 'b', stateMap: {}, confirm_name: 'Task' }), stranger: WS_GONE },
    { tool: 'define_workflow', args: (x) => ({ workspaceId: x.workspaceId, definition: NEW_WORKFLOW, confirm_name: x.workspaceName }), stranger: WS_GONE,
      forbidden: { text: NOT_ADMIN }, allowed: { caller: 'owner', eventType: 'workflow.defined' } },
  ]);
});
```

(`NEW_TYPE` / `NEW_WORKFLOW` are the parse-valid fixtures of `test/definition-admin-tools.test.ts`, exported from it or copied into this file.)

- [ ] **Step 2: Run to fail.** `pnpm --filter @gisik-nokma/mcp-server exec vitest run test/definition-admin-tools.test.ts > /tmp/mcpe-t12.log 2>&1; tail -30 /tmp/mcpe-t12.log`.

- [ ] **Step 3: Implement** `definition-admin-tools.ts`:

```ts
import { z } from 'zod';
import {
  newUlid,
  stateMappingSchema,
  ticketTypeDefSchema,
  VISIBILITY_MODES,
  workflowDefSchema,
  workspaceSettingsSetPayloadSchema,
} from '@gisik-nokma/domain';
import { HttpError } from '../http-client.js';
import type { Session } from '../session.js';
import { readDirectory } from './directory.js';
import { confirmOrPreview } from './preview.js';
import type { ToolDefinition } from './read-tools.js';
import { readOrNotFound } from './reads.js';
import { envelopeFor, postJson, submitOne } from './submit.js';

const id = z.string().min(1);
const enc = encodeURIComponent;

async function workspaceName(session: Session, workspaceId: string): Promise<string> {
  const ws = (await readDirectory(session)).find((w) => w.workspaceId === workspaceId);
  if (ws === undefined) throw new Error('workspace not found or not visible to you');
  return ws.name;
}
async function maybe<T>(read: () => Promise<T>): Promise<T | null> {
  try {
    return await read();
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) return null;
    throw error;
  }
}
function parsed<T>(schema: z.ZodType<T>, value: unknown, what: string): T {
  const r = schema.safeParse(value);
  if (!r.success) throw new Error(`${what} is not valid: ${r.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ')}`);
  return r.data;
}

export function definitionAdminTools(session: Session): ToolDefinition[] {
  return [
    {
      name: 'define_workflow',
      description:
        "Publish a workflow definition (new, or a new version of an existing one — same id, version + 1, with stateMapping for removed states). Validated before anything is sent. confirm_name is the workflow's current name (the workspace's name for a new one); without it you get a preview with the tickets in it.",
      inputSchema: { workspaceId: id, definition: z.record(z.unknown()), stateMapping: z.record(z.string()).optional(), confirm_name: z.string().optional() },
      handler: async (args) => {
        const a = z.object({ workspaceId: id, definition: z.record(z.unknown()), stateMapping: z.record(z.string()).optional(), confirm_name: z.string().optional() }).parse(args);
        const def = parsed(workflowDefSchema, a.definition, 'definition');
        const mapping = a.stateMapping === undefined ? undefined : parsed(stateMappingSchema, a.stateMapping, 'stateMapping');
        const current = await maybe(() => session.get(`/v1/workspaces/${enc(a.workspaceId)}/workflows/${enc(def.id)}`) as Promise<{ name?: string; workflow?: { name: string } }>);
        const currentName = current === null ? null : (current.workflow?.name ?? current.name ?? null);
        const occupancy = current === null ? null : await maybe(() => session.get(`/v1/workspaces/${enc(a.workspaceId)}/workflows/${enc(def.id)}/state-occupancy`) as Promise<{ counts: Record<string, number> }>);
        const inIt = Object.values(occupancy?.counts ?? {}).reduce((n, c) => n + c, 0);
        const preview = await confirmOrPreview(currentName ?? (await workspaceName(session, a.workspaceId)), a.confirm_name, async () => ({
          sentence: `Publishes version ${def.version} of workflow "${def.name}" (${def.states.length} states, ${def.transitions.length} moves).`,
          counts: { ticketsInWorkflow: inIt },
        }));
        if (preview !== null) return preview;
        return submitOne(session, envelopeFor(session, a.workspaceId, { kind: 'workflow', id: def.id }, 'workflow.defined', mapping === undefined ? def : { ...def, stateMapping: mapping }));
      },
    },
    {
      name: 'define_ticket_type',
      description: "Create or change a ticket type (id, name, icon, rank, workflowId, fields). Validated before anything is sent. confirm_name is the type's current name (the workspace's for a new type); without it you get a preview with how many tickets have that type.",
      inputSchema: { workspaceId: id, definition: z.record(z.unknown()), confirm_name: z.string().optional() },
      handler: async (args) => {
        const a = z.object({ workspaceId: id, definition: z.record(z.unknown()), confirm_name: z.string().optional() }).parse(args);
        const def = parsed(ticketTypeDefSchema, a.definition, 'definition');
        const { ticketTypes } = (await readOrNotFound(session, `/v1/workspaces/${enc(a.workspaceId)}/ticket-types`, 'workspace')) as { ticketTypes: Array<{ id: string; name: string }> };
        const existing = ticketTypes.find((t) => t.id === def.id);
        const counts = (await maybe(() => session.get(`/v1/workspaces/${enc(a.workspaceId)}/ticket-counts-by-type`) as Promise<{ counts: Record<string, number> }>))?.counts ?? {};
        const preview = await confirmOrPreview(existing?.name ?? (await workspaceName(session, a.workspaceId)), a.confirm_name, async () => ({
          sentence: existing === undefined ? `Creates the ticket type "${def.name}".` : `Changes the ticket type "${existing.name}".`,
          counts: { ticketsOfType: counts[def.id] ?? 0 },
        }));
        if (preview !== null) return preview;
        // A FRESH entity id per submission; the projection folds by payload id (app-core workflow-builder/events.ts:58-62).
        return submitOne(session, envelopeFor(session, a.workspaceId, { kind: 'ticket-type', id: newUlid() }, 'ticket-type.defined', def));
      },
    },
    {
      name: 'migrate_ticket_type',
      description: "Move every ticket of a type from one workflow to another, mapping each occupied state (stateMap: { fromStateId: toStateId }). confirm_name is the type's exact name; without it you get a preview counting the tickets that move.",
      inputSchema: { workspaceId: id, typeId: id, fromWorkflowId: id, toWorkflowId: id, stateMap: z.record(id), confirm_name: z.string().optional() },
      handler: async (args) => {
        const a = z.object({ workspaceId: id, typeId: id, fromWorkflowId: id, toWorkflowId: id, stateMap: z.record(id), confirm_name: z.string().optional() }).parse(args);
        const { ticketTypes } = (await readOrNotFound(session, `/v1/workspaces/${enc(a.workspaceId)}/ticket-types`, 'workspace')) as { ticketTypes: Array<{ id: string; name: string }> };
        const type = ticketTypes.find((t) => t.id === a.typeId);
        if (type === undefined) throw new Error('ticket type not found or not visible to you');
        const population = (await maybe(() => session.get(`/v1/workspaces/${enc(a.workspaceId)}/ticket-types/${enc(a.typeId)}/population?workflowId=${enc(a.fromWorkflowId)}`) as Promise<{ count: number }>))?.count ?? 0;
        const preview = await confirmOrPreview(type.name, a.confirm_name, async () => ({
          sentence: `Moves every "${type.name}" ticket from workflow ${a.fromWorkflowId} to ${a.toWorkflowId}.`, counts: { ticketsMoved: population },
        }));
        if (preview !== null) return preview;
        return postJson(session, `/v1/workspaces/${enc(a.workspaceId)}/ticket-types/${enc(a.typeId)}/migrate`, { fromWorkflowId: a.fromWorkflowId, toWorkflowId: a.toWorkflowId, stateMap: a.stateMap });
      },
    },
    {
      name: 'set_visibility',
      description: 'Change who can see a ticket: mode workspace, project, inherit (from its parent) or explicit (with userIds). confirm_name is the ticket KEY; without it you get a preview.',
      inputSchema: { workspaceId: id, ticketId: id, mode: z.enum(VISIBILITY_MODES), userIds: z.array(id).optional(), confirm_name: z.string().optional() },
      handler: async (args) => {
        const a = z.object({ workspaceId: id, ticketId: id, mode: z.enum(VISIBILITY_MODES), userIds: z.array(id).optional(), confirm_name: z.string().optional() }).parse(args);
        if (a.mode === 'explicit' && (a.userIds === undefined || a.userIds.length === 0)) throw new Error('mode "explicit" needs userIds (at least one person)');
        if (a.mode !== 'explicit' && a.userIds !== undefined) throw new Error('userIds go only with mode "explicit"');
        const detail = (await readOrNotFound(session, `/v1/workspaces/${enc(a.workspaceId)}/tickets/${enc(a.ticketId)}`, 'ticket')) as { key: string | null; ticket?: { visibility?: { mode?: string } } };
        const key = detail.key ?? a.ticketId;
        const preview = await confirmOrPreview(key, a.confirm_name, async () => ({
          sentence: `Changes who can see ${key} from ${detail.ticket?.visibility?.mode ?? 'its current audience'} to ${a.mode}${a.mode === 'explicit' ? ` (${a.userIds?.length ?? 0} people)` : ''}.`,
        }));
        if (preview !== null) return preview;
        return submitOne(session, envelopeFor(session, a.workspaceId, { kind: 'ticket', id: a.ticketId }, 'visibility.set', {
          ticketId: a.ticketId, mode: a.mode, ...(a.userIds === undefined ? {} : { userIds: a.userIds }),
        }));
      },
    },
    {
      name: 'update_workspace_settings',
      description: 'Change workspace settings: staleDays (1–365), dueSoonDays (0–365), autoCloseAfterDays (1–365, or null to turn auto-close off). confirm_name is the workspace name; without it you get a preview.',
      inputSchema: { workspaceId: id, staleDays: z.number().int().optional(), dueSoonDays: z.number().int().optional(), autoCloseAfterDays: z.number().int().nullable().optional(), confirm_name: z.string().optional() },
      handler: async (args) => {
        const a = z.object({ workspaceId: id, staleDays: z.number().int().optional(), dueSoonDays: z.number().int().optional(), autoCloseAfterDays: z.number().int().nullable().optional(), confirm_name: z.string().optional() }).parse(args);
        const payload = parsed(workspaceSettingsSetPayloadSchema, {
          ...(a.staleDays === undefined ? {} : { staleDays: a.staleDays }),
          ...(a.dueSoonDays === undefined ? {} : { dueSoonDays: a.dueSoonDays }),
          ...(a.autoCloseAfterDays === undefined ? {} : { autoCloseAfterDays: a.autoCloseAfterDays }),
        }, 'settings');
        const name = await workspaceName(session, a.workspaceId);
        const preview = await confirmOrPreview(name, a.confirm_name, async () => ({ sentence: `Changes ${Object.keys(payload).join(', ')} for "${name}".` }));
        if (preview !== null) return preview;
        return submitOne(session, envelopeFor(session, a.workspaceId, { kind: 'workspace', id: a.workspaceId }, 'workspace.settings_set', payload));
      },
    },
  ];
}
```

(`…/ticket-types` answers `{ workspaceId, ticketTypes }` (`builder-reads.ts:766`). The answer shapes of `GET …/workflows/:id` and the ticket detail's visibility block are read at `builder-reads.ts:726-752` and `routes/tickets.ts:363-420` before the lane relies on them; the code above reads each defensively and the tests pin the shapes the lane finds. `workflowStateSchema` / `transitionSchema` are re-exported by the domain index — if not, add them to `packages/domain/src/index.ts` in this task.) Fixture blocks: the five names; sweep entries with a `get` that answers `{ workspaces: [...], types: [], counts: {}, count: 0, key: 'K-1' }`.

- [ ] **Step 4: Pass + battery** (T6 Step 5 shape, plus the hosted file). Mutations: skip the workflow schema (14.530), type id as entity id (14.531), `userIds` always (14.533), every settings key (14.534).

- [ ] **Step 5: Catalogue + commit.** Flip 14.530–14.536. Features.md §14:

```markdown
- ✅ **The assistant can define workflows and types, migrate a type, set who sees a ticket and change workspace settings — behind a confirmation** (MCP-everything T12; `packages/mcp-server/src/tools/definition-admin-tools.ts`) — `define_workflow` and `define_ticket_type` are validated with the product's own schemas before anything is sent; `migrate_ticket_type` uses the app's migration route (all-or-nothing pre-flight); `set_visibility` (workspace / project / inherit / explicit people); `update_workspace_settings`. Each previews what would change (tickets in the workflow, of the type, that move) until `confirm_name` is exact. Cases 14.530–14.536.
```

```bash
git branch --show-current   # task/mcp-e-12-definition-admin
git add packages/mcp-server packages/domain/src/index.ts apps/server/test/mcp/mcp-definitions.test.ts test-cases/14-mcp-server.md Features.md
git commit -m "MCP everything 12: definitions, migration, visibility, settings behind a confirmation (14.530-14.536)"
git push -u origin task/mcp-e-12-definition-admin
```

DONE line: `DONE task/mcp-e-12-definition-admin <sha40>`.

---

### Task 13: `search`, `list_deleted`, the stale texts, member help, and the whole round trip

**Lane:** `task/mcp-e-13-search-trash-help` off `origin/release/mcp-everything` after T5–T12 merged. Runs alone: it pins the final tool list end to end.

**Files:**
- Modify: `packages/mcp-server/src/tools/read-tools.ts:41-70` (`search` added before `search_tickets`; `search_tickets` becomes its documented alias), `src/tools/trash-tools.ts` (T3's stub), `src/tools/project-tools.ts:128-136` (`create_project`'s description), `:163-185` (`update_project`: description, and `groupId`), fixture blocks `read begin/end` (`'search'` first) and `trash begin/end`
- Modify: `docs/manual.md` §16 "What your assistant can do" (`:2010-2035`), regenerate help
- Test: `packages/mcp-server/test/read-tools.test.ts` (search), `test/trash-tools.test.ts` (new), `test/project-tools.test.ts` (groupId, texts), `apps/server/test/mcp/mcp-everything-round-trip.test.ts` (new)
- Catalogue: `test-cases/14-mcp-server.md` `### T13`, `Features.md` §14 (and the "Five MCP read tools" / "nine registered tools" bullets amended to today's counts)

**Interfaces:**
- Consumes: every tool of T6–T12.
- Produces: tools `search`, `list_deleted`; `update_project` gains `groupId: string | null`; the final 63-tool order of the plan's header, pinned.

Cases (`### T13 — search, trash, text fixes, help, round trip`):

```markdown
- ❌ **14.550 — `search(workspaceId, query, kinds?, mode?, filter?)` reads `/v1/search` with `kinds=ticket,note` (default both) and `mode=lexical|meaning`, and answers ticket `hits` and note `notes`; `search_tickets` is kept for one release with the SAME reply it gave, and its description says to use `search`; there is no cursor (SC10);** control: `kinds: ['note']` asks for notes only. Mutation: drop `kinds` from the query → the note-only case returns tickets.
- ❌ **14.551 — `list_deleted({ workspaceId?, kinds? })` answers the caller's Deleted items (tickets, notes, projects, workspaces), filtered to one workspace and to the given kinds, each with the tool that restores it;** control: no filter → every item. Mutation: ignore `kinds` → red.
- ❌ **14.552 — `create_project` and `update_project` no longer say a prefix "cannot be changed"; they name `change_prefix`; `update_project` takes `groupId` (null ungroups) and sends it in `project.updated`;** control: name-only update unchanged. Mutation: keep the old sentence → the text case fails.
- ❌ **14.553 — manual §16 lists notes, comments (edit/delete), attachments (10 MB, images on notes), every ticket act, discovery, notifications, invitations, and admin acts with their preview-then-exact-name rule; Markdown is how bodies are written; `pnpm check:help` green;** control: regeneration is byte-identical. Mutation: drop the "preview" sentence → the section test reddens.
- ❌ **14.554 — the round trip through the hosted `/mcp` on a test app: `create_note` (Markdown, a mention of a reader) → `get_note` (Markdown back) → `update_note` (one section) → `add_comment` (the 13:37 text) → `list_comments` → `edit_comment` → `delete_comment` → `add_attachment` (PNG) → `get_attachment` (image) → `update_ticket` (description section) → `close_ticket` / `reopen_ticket` → `delete_ticket` (preview, then the key) → `list_deleted` → `restore_ticket` → `manage_groups create` (preview, then confirmed) → `search` (finds the note and the ticket); every written event `origin: 'mcp'`, the mentioned reader notified once;** control: a wrong `confirm_name` mid-way writes nothing. Mutation: route one tool around `allTools` → the hosted list differs.
- ❌ **14.555 — the final registry is 63 tools in the plan's order, in both doors (`register.test.ts` 14.80/14.81 with T3's fixture, `mcp-http.test.ts` 14.262 equal to `allTools`);** control: every tool described. Mutation: none (the pin).
```

- [ ] **Step 1: Failing tests.** `packages/mcp-server/test/trash-tools.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import type { Session } from '../src/session.js';
import { trashTools } from '../src/tools/trash-tools.js';
import { NO_TRANSFER } from './fixtures/fake-session.js';

const items = [
  { kind: 'ticket', id: 't1', workspaceId: 'w1', label: 'CCSO-4 Chiller', deletedAt: '2026-10-01T00:00:00Z' },
  { kind: 'note', id: 'n1', workspaceId: 'w1', label: 'Cold room', deletedAt: '2026-10-01T00:00:00Z' },
  { kind: 'project', id: 'p1', workspaceId: 'w2', label: 'Stock', deletedAt: '2026-10-01T00:00:00Z' },
];
const session: Session = { userId: () => 'u', get: async () => ({ items }), post: async () => ({}), postEvents: async () => ({}), ...NO_TRANSFER };
const listDeleted = trashTools(session).find((t) => t.name === 'list_deleted')!;

describe('14.551 list_deleted', () => {
  it('14.551 filters by workspace and kind and names the restoring tool', async () => {
    expect(((await listDeleted.handler({})) as { items: unknown[] }).items).toHaveLength(3); // control
    expect(await listDeleted.handler({ workspaceId: 'w1', kinds: ['note'] })).toEqual({
      items: [{ ...items[1], restoreWith: 'restore_note' }],
      nextCursor: null,
    });
  });
});
```

14.550 in `read-tools.test.ts` (requested path `/v1/search?workspaceId=w&q=cold&kinds=note&mode=meaning`), 14.552 in `project-tools.test.ts` (description texts; `groupId: null` → payload `{ groupId: null }`), 14.555 is T3's pin re-run with the full fixture. The round trip `apps/server/test/mcp/mcp-everything-round-trip.test.ts` copies `mcp-crud-round-trip.test.ts:21-56` (bootstrap, `call`, `ledger`, `committed`) and walks 14.554's steps with an assertion after each, ending:

```ts
    const { rows } = await db.pool.query<{ origin: string }>(
      `SELECT DISTINCT origin FROM events WHERE workspace_id = $1 AND actor_id = $2 AND type NOT IN ('workspace.created', 'membership.granted')`,
      [workspaceId, user.userId],
    );
    expect(rows.map((r) => r.origin)).toEqual(['mcp']);
    const mentioned = await db.pool.query(`SELECT 1 FROM notifications WHERE user_id = $1 AND kind = 'mention'`, [reader.userId]);
    expect(mentioned.rowCount).toBe(1);
```

(The founding events of `create_workspace` are the server's — `origin: 'server'` — hence the exclusion; read the founding sequence's types in `routes/workspaces.ts:81-176` and list exactly those.)

- [ ] **Step 2: Run to fail.** `pnpm --filter @gisik-nokma/mcp-server exec vitest run test/trash-tools.test.ts test/read-tools.test.ts test/project-tools.test.ts > /tmp/mcpe-t13.log 2>&1; tail -30 /tmp/mcpe-t13.log`.

- [ ] **Step 3: Implement.** `trash-tools.ts`:

```ts
import { z } from 'zod';
import type { Session } from '../session.js';
import { readDeleted } from './directory.js';
import type { ToolDefinition } from './read-tools.js';
import { page, pageArgs } from './reads.js';

const RESTORE_WITH: Record<string, string> = {
  ticket: 'restore_ticket', note: 'restore_note', project: 'undelete_project', workspace: 'undelete_workspace',
};

export function trashTools(session: Session): ToolDefinition[] {
  const shape = { workspaceId: z.string().min(1).optional(), kinds: z.array(z.enum(['ticket', 'note', 'project', 'workspace'])).optional(), ...pageArgs };
  return [
    {
      name: 'list_deleted',
      description: 'Your Deleted items — tickets, notes, projects and workspaces you may bring back (within 15 days of deletion) — optionally for one workspace or some kinds. Each names the tool that restores it.',
      inputSchema: shape,
      handler: async (args) => {
        const a = z.object(shape).parse(args);
        const items = (await readDeleted(session))
          .filter((i) => a.workspaceId === undefined || i.workspaceId === a.workspaceId)
          .filter((i) => a.kinds === undefined || (a.kinds as string[]).includes(i.kind));
        const paged = page(items, a.cursor, a.limit);
        return { items: paged.items.map((i) => ({ ...i, restoreWith: RESTORE_WITH[i.kind] ?? null })), nextCursor: paged.nextCursor };
      },
    },
  ];
}
```

`read-tools.ts`, a new first tool:

```ts
    {
      name: 'search',
      description:
        'Search one workspace\'s tickets and notes you can see. kinds: ["ticket"], ["note"] or both (default). mode: "lexical" (words, default) or ' +
        '"meaning" (notes only, by meaning). A ticket key such as "CCSO-12" returns that ticket first. At most 50 ticket hits and no pages — narrow the query. ' +
        'Use list_tickets / list_notes to enumerate.',
      inputSchema: { workspaceId: z.string().min(1), query: z.string().min(1).max(500), kinds: z.array(z.enum(['ticket', 'note'])).min(1).optional(), mode: z.enum(['lexical', 'meaning']).optional(), filter: filterArg },
      handler: async (args) => {
        const p = z.object({ workspaceId: z.string().min(1), query: z.string().min(1).max(500), kinds: z.array(z.enum(['ticket', 'note'])).min(1).optional(), mode: z.enum(['lexical', 'meaning']).optional(), filter: filterArg }).parse(args);
        const q = new URLSearchParams({ workspaceId: p.workspaceId, q: p.query });
        if (p.kinds !== undefined) q.set('kinds', p.kinds.join(','));
        if (p.mode !== undefined) q.set('mode', p.mode);
        if (p.filter !== undefined) q.set('filter', JSON.stringify(p.filter));
        return session.get(`/v1/search?${q.toString()}`);
      },
    },
```

`search_tickets`' description gains, at its start: "Kept for one release as the old name of `search`; it answers exactly what it always did (tickets, and notes too). Prefer `search`." `project-tools.ts`: `create_project`'s sentence "The prefix cannot be changed later." becomes "An owner or admin can change it later with change_prefix."; `update_project`'s "The prefix is fixed when the project is created and cannot be changed." becomes "To change its prefix use change_prefix; to file it in a group pass groupId (null takes it out of its group)."; its schema gains `groupId: z.string().min(1).nullable().optional()`, the "needs a new name or description" refusal becomes "update_project needs a new name, description or groupId", and the payload spreads `...(a.groupId === undefined ? {} : { groupId: a.groupId })`.

Manual §16 "What your assistant can do" gains (after the Tickets bullet):

```markdown
- **Notes.** Read, write and change notes — the whole body, one section under a heading, or a few lines at the end —
  move them, attach them to tickets, and delete or bring them back.
- **Comments.** Comment on tickets and notes, and edit or delete its own comments (an owner or admin can delete
  anyone's). Mentions like *@Asha* notify only people who can read the ticket or note.
- **Files.** Attach a file of up to 10 MB to a ticket, or a picture to a note, and read attachments back.
- **Every ticket action** — change any field, close and reopen, reorder the backlog, see a ticket's history, delete
  one or bring it back.
- **Your work and your inbox.** What is on your plate, what needs attention, your notifications (and marking them
  read), and invitations waiting for you.
- **Admin, with a check first.** Inviting and removing people, roles, prefixes, groups, workflows, ticket types,
  who can see a ticket and workspace settings. For each, the assistant first shows you what would change; nothing
  happens until it repeats the exact name of what it is changing — the person, the address, the ticket key or the
  item's current name.

**Formatting comes through.** The assistant writes in Markdown, so headings, lists, bold text, links, mentions and
ticket links appear in comments and notes exactly as if you had typed them in the app.
```

Then `pnpm help:generate` and `pnpm check:help`. Fixture blocks: `read` → `'search', 'search_tickets', 'list_tickets', 'get_ticket', 'list_members',`; `trash` → `'list_deleted',`; sweep entries for both.

- [ ] **Step 4: Pass + the whole battery.**

```bash
pnpm turbo run build > /tmp/mcpe-t13-b.log 2>&1; tail -5 /tmp/mcpe-t13-b.log
pnpm --filter @gisik-nokma/mcp-server exec vitest run > /tmp/mcpe-t13-p.log 2>&1; tail -15 /tmp/mcpe-t13-p.log
pnpm --filter @gisik-nokma/server exec vitest run > /tmp/mcpe-t13-s.log 2>&1; tail -20 /tmp/mcpe-t13-s.log
pnpm --filter @gisik-nokma/app-core exec vitest run > /tmp/mcpe-t13-ac.log 2>&1; tail -10 /tmp/mcpe-t13-ac.log
pnpm typecheck > /tmp/mcpe-t13-tc.log 2>&1; tail -10 /tmp/mcpe-t13-tc.log
pnpm check:help && node scripts/check-case-ids.mjs && pnpm check:citations > /tmp/mcpe-t13-cat.log 2>&1; tail -10 /tmp/mcpe-t13-cat.log
```

- [ ] **Step 5: Catalogue + commit.** Flip 14.550–14.555. Features.md §14: amend the "Five MCP read tools" and "nine registered tools (sixteen since …)" bullets to "sixty-three since MCP-everything", and add:

```markdown
- ✅ **One `search` for tickets and notes, Deleted items, and member help for everything the assistant can now do** (MCP-everything T13; `packages/mcp-server/src/tools/read-tools.ts`, `trash-tools.ts`, `project-tools.ts`, `docs/manual.md` §16) — `search` (tickets and/or notes, by words or, for notes, by meaning; `search_tickets` kept one release as its old name), `list_deleted` (with the tool that restores each item), `update_project` files a project in a group, and the stale "prefix cannot be changed" texts are gone. The hosted round trip walks notes → comments → files → ticket acts → trash → admin preview → search with every event `origin: mcp`. Sixty-three tools in both doors. Cases 14.550–14.555.
```

```bash
git branch --show-current   # task/mcp-e-13-search-trash-help
git add packages apps docs/manual.md test-cases/14-mcp-server.md Features.md
git commit -m "MCP everything 13: search, list_deleted, text fixes, member help, the round trip (14.550-14.555)"
git push -u origin task/mcp-e-13-search-trash-help
```

DONE line: `DONE task/mcp-e-13-search-trash-help <sha40>`.

---

### Task 14: The real-client check in production (owner step)

**When:** after T13 is merged into `release/mcp-everything`, the release→`main` PR's CI is green, and the owner has merged it (the merge IS the release, owner's word only). The hosted door is already switched on in production (`MCP_PUBLIC_URL`, `deploy/do/app.yaml`); this task changes no code.

**Who:** the owner, in a claude.ai session connected to `https://pm-api.artsourced.in/mcp`, with the controller recording. The controller first creates a throwaway project in the owner's workspace (`create_project` via the same connection) so nothing touches real work, and removes it at the end (`delete_project`, exact name; left in Deleted items for the 15-day window).

Cases (`### T14 — the real client`; each 🧪, evidence = what the owner saw, request ids, no tokens):

```markdown
- 🧪 **14.570 — the owner asks Claude to write a note with a heading, a bullet list and an @mention of a teammate (written `@[Name](user:<id>)` after `list_members`): the note renders formatted in the app, and the teammate receives one mention notification.**
- 🧪 **14.571 — the owner asks for a Markdown comment on a ticket (the 13:37 brief): it renders with headings and bullets in the ticket's thread, not raw `#`/`-`.**
- 🧪 **14.572 — the owner asks Claude to edit that comment, then delete it: the thread shows "edited", then "Comment deleted" with author and time; the ticket History reads "Comment edited" / "Comment deleted".**
- 🧪 **14.573 — the owner gives Claude a small image (under 1 MB) to attach to the ticket: it appears in the ticket's Attachments, and `get_attachment` shows it back in the chat.**
- 🧪 **14.574 — the owner asks Claude to delete the throwaway project without naming it exactly: Claude answers with the preview and the exact name it needs, and nothing changes until the owner confirms.**
- 🧪 **14.575 — the controller reads the production request log for the session's tool calls (`mcp tool call` lines: tool, outcome, duration — no arguments, `register.ts:47-52`) and the ledger rows' `origin: 'mcp'`; no 413 and no 5xx.**
```

- [ ] **Step 1:** Owner connects and runs 14.570–14.574 in order; the controller records each result in `test-cases/14-mcp-server.md` (🧪 with evidence) on a `task/mcp-e-14-real-client` branch cut from the NEXT release branch (`release/smoothness`, once cut) — never from or onto `main`.
- [ ] **Step 2:** Any failure is a defect on the next release, opened as a ticket with the request ids; the release itself is not rolled back unless the owner says so.
- [ ] **Step 3:** Commit the evidence (`MCP everything 14: real-client production check (14.570-14.575)`) on that branch; DONE line `DONE task/mcp-e-14-real-client <sha40>`.

---

## Self-review

- **Spec coverage.** §1 defect → T6 (14.380, 26.005). M-E1 notes → T7; comments → T5/T6; attachments → T8; mentions → T2/T6/T7 (14.382, 14.404, 26.054–26.058). M-E2/M-E8 converter → T1 (26.001–26.011), used by T6/T7/T9. M-E3 every gap → T7–T13 (63 tools), exclusions held (Global Constraints). M-E4 confirmation → T3 `confirmOrPreview` + T7 (`delete_note`), T9 (`delete_ticket`), T11, T12. M-E5 → T8 (10 MiB, no URL fetch; Q1/Q2). M-E6 grouped tools → T11 `manage_members`/`manage_groups`, T9 `update_ticket`, T7 `update_note`. M-E7 → T0. M-E9 → T2 (server), T4 (offline), T5 (app), T6 (MCP). §5.1 → T3/T11. §5.2 → T3 (body limit, binary) + T8. §5.3 errors → every task's verbatim cases. §5.4 → T2 fan-out. §6 events/permission/projections/purge/mentions/history/search → T2 (SC5, SC6), history lines T5 (SC16). §7 security: no new route (T3 adds a body limit, not a route), no scopes, no fetch, role matrices T11 (14.505) and T12 (14.535), bounded base64 T8 (14.432). §8 testing → per task, and every tool through the hosted door with three callers (door matrices 14.370, 14.389, 14.408, 14.437, 14.458, 14.486, 14.506, 14.536); every list pages (T3 `page`); real client → T14 (SC24/Q6). §9 out of scope → Global Constraints.
- **Placeholders.** None of "TBD/TODO/implement later". Where a step reuses a harness, it names the file and line range to copy and gives the assertions; where an answer shape must be read at execution (detail route, workflow read), the step names the file and lines to read and the tests pin what is found.
- **Type consistency.** `markdownToDoc(md, resolve) → { doc, problems }`, `docToMarkdown(doc) → { markdown, lossy }`, `scanMarkdownRefs(md) → { userIds, ticketKeys, noteRefs }`, `spliceDoc(current, incoming, BodyEdit)`, `RefResolver.{user,ticket,note}` (T1) are used identically in T6–T9. `commentEditedPayload`/`commentDeletedPayload`/`COMMENT_EVENT_TYPES`/`isCommentEvent` (T2) in T2/T4/T6. `Session.getBytes`/`postMultipart`, `ToolReply`, `confirmOrPreview`, `envelopeFor(…, { kind: EntityKind; id })`, `NO_TRANSFER`, `TOOL_NAMES_BY_MODULE`, `SWEEP` (T3) in T6–T13. `markdownBody`/`bodyAsMarkdown`/`parentOf` (T6) in T7–T9. `CommentActions`, `commentEditedSeed`/`commentDeletedSeed`, `submitLabel` (T5) only in T5.
- **Review Focus.** 1 → 26.006 (T1); 2 → 26.058 (T2) + 14.404 (T7); 3 → 14.432 + 14.438 (T8); 4 → 26.052 (T2, both parents); 5 → 14.362 (T3) + 14.502 (T11).
