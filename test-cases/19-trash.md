# §19 — Archive, delete and purge

**Opened 2026-09-23 by Plan 1 of the trash series** (`docs/superpowers/plans/2026-09-23-trash-1-lifecycle-core.md`;
spec `docs/superpowers/specs/2026-09-23-trash-and-purge-design.md`).

## THE ID SHAPE

§19 is uniformly 3-digit padded: `19.001`–`19.999`, following §17's and §18's ruling. Blocks are allocated per plan
in the table below. Take from your block, never from the tip.

| Plan | Block |
|---|---|
| 1 Lifecycle core | `19.001`–`19.080` |
| 2 Purge engine | `19.081`–`19.160` |
| 3 Replica + sync | `19.161`–`19.200` |
| 4 UI | `19.201`–`19.260` |

**Write cases as `- ❌ **19.001 — …**` id LINES.** The guard (`scripts/check-case-ids.mjs`) counts id LINES and
nothing else; four spellings are invisible to it (a markdown **table row**, a **`##` heading**, a **backticked**
id inside the bold, and **two ids in one sentence**). After adding cases, confirm the count moved by EXACTLY
the number you added — an unchanged count has reported a clean sweep over cases it never saw.

## 19.1 Vocabulary

- ✅ **19.001 — each of the eight lifecycle types parses against its entity kind with `{}`;** control: the same type against a wrong kind is refused with `entity-kind-mismatch`. Mutation: register `project.deleted` with `entityKind: 'workspace'`.
- ✅ **19.002 — every lifecycle payload refuses a stranger's field** (`{ projectId: 'x' }`, `{ dueAt: '…' }` on `purge.marked`); control: `{}` accepted. Mutation: drop `.strict()` from `purgeMarkedPayload`.
- ✅ **19.003 — `purge.marked`/`purge.unmarked` parse against `workspace`, `project`, `ticket` and `note`, and are refused against `workflow`;** control: `note`. Mutation: omit `'note'` from the kinds.
- ✅ **19.004 — `purgeDueAt('2026-09-23T10:00:00.000Z')` is `'2026-10-08T10:00:00.000Z'`;** control: the result is `PURGE_DELAY_DAYS` days after the input to the millisecond. Mutation: `PURGE_DELAY_DAYS = 14`.

## 19.2 Projection

- ✅ **19.010 — `workspace.archived` then `workspace.restored` writes `archived` true then false on a `proj_workspaces` row created by the first;** control: a workspace with no lifecycle event has no row. Mutation: insert a row on `workspace.created`.
- ✅ **19.011 — `workspace.deleted` writes `deleted_at` = the event's `server_time` and `deleted_by` = its actor; `workspace.undeleted` nulls both;** control: `archived` untouched. Mutation: write `client_time`.
- ✅ **19.012 — `project.deleted`/`project.undeleted` write and clear `proj_projects.deleted_at`/`deleted_by`;** control: `archived` untouched. Mutation: clear `archived` on undelete.
- ✅ **19.013 — `purge.marked` writes `purge_marked_at`/`purge_marked_by` on the row of its entity kind (all four tables); `purge.unmarked` nulls them;** control: the other three tables untouched. Mutation: route `note` to `proj_tickets`.
- ✅ **19.014 — `note.deleted` writes `proj_notes.deleted_at`/`deleted_by` beside `deleted = true`; `note.restored` nulls them;** control: `deleted` still flips. Mutation: leave `deleted_at` set on restore.
- ✅ **19.015 — after a mixed sequence of all eight types, `verifyProjections` reports no difference;** control: hand-writing one `proj_workspaces.archived` makes it report one. Mutation: make the projection read `now()` instead of `server_time`.

## 19.3 Authority

- ✅ **19.020 — each workspace act (archive, restore, delete, undelete, mark, unmark) is refused for an admin with `WORKSPACE_OWNER_ONLY_REASON` and accepted for the owner;** control: the owner's acceptance in the same `it`. Mutation: allow `isWorkspaceAdmin`.
- ✅ **19.021 — `project.deleted` and a project mark are refused for a member (`permission.role`) and accepted for an admin;** control: admin. Mutation: remove `project.deleted` from `ADMIN_ONLY_TYPES`.
- ✅ **19.022 — a ticket mark is refused for a non-project-admin member and accepted for a project admin;** control: project admin. Mutation: skip the ticket arm for `purge.marked`.
- ✅ **19.023 — a note mark is refused for a member who is not the author, and accepted for the author, an admin who can read it, and the owner;** control: the author. Mutation: drop `purge.marked` from `NOTE_AUTHOR_EVENTS`.

## 19.4 State

- ✅ **19.030 — deleting a deleted project or workspace is refused with `ALREADY_DELETED_REASON`;** control: the first delete accepted. Mutation: drop the arm.
- ✅ **19.031 — marking a live item is refused with `DELETE_FIRST_REASON`, for each of the four kinds;** control: marking after delete accepted. Mutation: skip the deleted test for notes.
- ✅ **19.032 — marking twice is refused with `ALREADY_MARKED_REASON`; unmarking an unmarked item with `NOT_MARKED_REASON`;** control: mark → unmark → mark accepted. Mutation: drop the already-marked arm.
- ✅ **19.033 — restoring/undeleting a marked item is refused with `UNMARK_FIRST_REASON`, for each kind;** control: unmark then restore accepted. Mutation: skip the marked arm for tickets.
- ✅ **19.034 — marking a ticket inside a deleted project is refused with `PROJECT_DELETED_REASON`;** control: the same ticket marked before the project was deleted stays marked (the column is not cleared). Mutation: skip the container arm.
- ✅ **19.035 — unmarking after the due instant is refused with `PURGE_DUE_REASON`;** control: one millisecond before, accepted. `now` is injected (the check takes `now: Date`; the door passes `new Date()`); the test calls `checkLifecycle` directly with a fixed `now` for this case. Mutation: compare with `<` instead of `<=`.

## 19.5 Deleted workspace

- ✅ **19.040 — after `workspace.deleted`, a member's `GET /v1/me/workspaces` omits the workspace; `GET /v1/me/work`, `GET /v1/search`, a `:workspaceId` route and `GET /v1/tickets/:id/history` for a ticket in it answer what a non-member gets;** control: a second, live workspace of the same member is still served everywhere. Mutation: default `includeDeleted` to `true`.
- ✅ **19.041 — the owner's `workspace.undeleted`, `purge.marked` and `purge.unmarked` on the deleted workspace are accepted, and after the undelete every read in 19.040 serves it again;** control: an admin's undelete is refused (`WORKSPACE_OWNER_ONLY_REASON`). Mutation: resolve the write door without `includeDeleted`.
- ✅ **19.042 — any other event into a deleted workspace (a ticket field set, a note body set, `workspace.renamed`) is refused with `WORKSPACE_DELETED_REASON`;** control: the same event after undelete accepted. Mutation: exempt `ticket.field_set`.
- ✅ **19.043 — `GET /v1/me/workspaces` serves `archived: true` after `workspace.archived` and `false` after `workspace.restored`; an archived workspace is still served in full (T8: archive removes nobody's access);** control: a never-archived workspace serves `false`. Mutation: filter archived workspaces out.
- ✅ **19.044 — the online mapper maps `archived` onto `WorkspaceRef` and refuses a row without it;** control: `true` and `false` round-trip. Mutation: default a missing field to `false`.
- ✅ **19.045 — `GET /v1/stream` and `POST /v1/sync/bootstrap` for a member of a deleted workspace deliver nothing from it;** control: the live workspace still streams. Mutation: skip the resolver in the stream audience. (If either door does not ask the resolver, this case is where you find out — fix the door, and name it in the commit body.)

## 19.6 Deleted project

- ✅ **19.050 — after `project.deleted`, the project is absent from `GET /v1/me/workspaces`' projects (for owner and member alike) and its tickets from the board, list, search and my-work;** control: a sibling live, prefix-colliding project's tickets are still served on each and its resolved prefix is unchanged by its neighbour's deletion. Mutation: revert `LIVE_TICKET_WHERE`.
- ✅ **19.051 — each converted longhand site excludes a deleted project's ticket (one arm per site, named in the test by file);** control: the live sibling. Mutation: revert one longhand site — its arm alone reddens.
- ✅ **19.052 — `routes/my-work.ts`'s TypeScript filter excludes a deleted project's ticket;** control: the sibling. Mutation: revert it.
- ✅ **19.053 — a project-scoped note in a deleted project is absent from the notes list and from a ticket's attached-notes read;** control: a workspace-scoped note is still served. Mutation: skip the notes clause.
- ✅ **19.054 — a ticket event and a project-scoped note event into a deleted project are refused with `PROJECT_DELETED_REASON`;** control: accepted after `project.undeleted`. Mutation: exempt `ticket.field_set`.
- ✅ **19.055 — a ticket deleted on its own, then its project deleted, then the project undeleted, is still deleted (absent from the board; `deleted_at` unchanged);** control: its sibling that was not deleted on its own is back. Mutation: have the projection null tickets' `deleted_at` on `project.undeleted`.

## 19.7 The Deleted items read

- ✅ **19.060 — the owner sees a deleted workspace, an admin a deleted project, a project admin a deleted ticket, an author a deleted note — each with `deletedBy`, `deletedAt` and `purgeMarkedAt: null`;** control: a live item of each kind is absent. Mutation: drop the `deleted_at IS NOT NULL` filter for projects.
- ✅ **19.061 — a marked item carries `purgeMarkedAt` and `purgeDueAt = purgeDueAt(purgeMarkedAt)`;** control: unmarking returns both to null. Mutation: compute the due date from `deletedAt`.
- ✅ **19.062 — a member who is not a project admin does not see a deleted ticket; an admin does not see a deleted WORKSPACE;** control: the owner sees both. Mutation: list tickets by `canSee` instead of project-admin rights.
- ✅ **19.063 — the list is ordered by `deletedAt` descending;** control: three items deleted in known order. Mutation: ascending.
- ✅ **19.064 — a deleted project's row carries `containedCount` = its live tickets + project-scoped notes; a deleted workspace's = its projects + tickets + notes;** control: a ticket deleted on its own inside the project is not counted. Mutation: count deleted tickets too.
- ✅ **19.065 — a ticket inside a deleted project is not listed on its own;** control: after `project.undeleted` the individually-deleted ticket is listed again. Mutation: drop the container exclusion.
- ✅ **19.066 — an admin demoted to member no longer sees the deleted project they deleted;** control: the owner still does. Mutation: list by `deleted_by = caller`.
- ✅ **19.067 — a signed-out caller gets 401;** control: signed in, 200. Mutation: drop `requireSession`.

## 19.8 Client contract

- ✅ **19.070 — the online twin maps every `DeletedItem` field and refuses a row missing `purgeDueAt`;** control: a full row round-trips. Mutation: default a missing `purgeDueAt` to null.
- ✅ **19.071 — the replica twin rejects with `ReplicaGapError`;** control: `getMyWorkspaces` on the same replica resolves. Mutation: resolve `[]` (an empty list would tell a person they have nothing deleted, when nobody was asked).

## 19.19 UI primitives

- ✅ **19.201 — `Dialog` with `initialFocusRef` puts focus on that element when it opens;** control: the same dialog without the prop focuses its own panel (ruling P8's default). Mutation: ignore `initialFocusRef` in the focus effect.
- ✅ **19.202 — `Dialog role="alertdialog"` renders `role="alertdialog"` named by its title;** control: no `role` prop renders `role="dialog"`. Mutation: hard-code `role="dialog"`.
- ✅ **19.203 — `Dialog describedBy` sets `aria-describedby`, so the panel's accessible description is that element's text;** control: without it the panel has no `aria-describedby` attribute. Mutation: drop the attribute.
- ✅ **19.204 — `Button` forwards `ref` to its `<button>`;** control: the ref's element is the one the role query finds, with the variant class on it. Mutation: destructure `ref` out of the props and drop it.

## 19.20 Deleted items — who deleted it

- ✅ **19.206 — each row carries `deletedByName`: the deleter's name for a project the owner deleted and for one an admin deleted, and `null` once the admin's name is blank;** control: the two rows carry two different names (a join on the caller would give both the owner's). Mutation: join `"user"` on the CALLER's id instead of `deleted_by`.
- ✅ **19.207 — the online mapper maps `deletedByName` and refuses a row without the key;** control: `null` round-trips as `null`. Mutation: default a missing `deletedByName` to `null`.

## 19.21 The trash model

- ✅ **19.209 — the spec's fixed strings are the exported constants, verbatim: the note, `Delete permanently`, the title shape `Delete <kind> “<name>”?`, `Nothing deleted.`, `Deleted items needs a connection.`, `Permanently deleted on <day>`;** control: the note's day count is `String(PURGE_DELAY_DAYS)`, and the soft ticket toast is still the 2026-09-20 sentence. Mutation: reword the note ("…purged after…").
- ✅ **19.210 — with `PURGE_DELAY_DAYS` mocked to 14, the note and the permanent-delete notice say 14 days and contain no 15;** control: the note is otherwise the spec's sentence. Mutation: spell `15` in `DELETE_NOTE`'s template.
- ✅ **19.211 — `deleteSeeds` sends `<kind>.deleted` alone, or `<kind>.deleted` THEN `purge.marked`, each `{}` against the item's own entity and workspace;** control: all four kinds map to their own delete type. Mutation: put `purge.marked` first.
- ✅ **19.212 — `restoreSeeds` sends `workspace.undeleted`, `project.undeleted`, `ticket.restored`, `note.restored`, and with `unmarkFirst` sends `purge.unmarked` BEFORE it;** control: no restore ever sends `project.restored` or `workspace.restored` (those are un-archive). Mutation: map `project` to `project.restored`.
- ✅ **19.213 — `markSeeds`/`unmarkSeeds` file `purge.marked`/`purge.unmarked` against the item's own kind; `targetOf` of a deleted WORKSPACE targets the workspace in its own stream;** control: a note row targets `{ kind: 'note' }` in its workspace. Mutation: file every mark against `kind: 'ticket'`.
- ✅ **19.214 — `classifyBatch`: all committed → `committed`; none committed → `refused` with the FIRST non-committed reason (an `invalid` answer's message counts); some committed → `partly` with the per-event `committed` flags; fewer answers than claims → `unanswered`;** control: an empty batch is `committed`. Mutation: return `refused` whenever the first answer is not committed.
- ✅ **19.215 — `istDayLabel` prints the IST day as "8 Oct" and turns at IST midnight (18:30Z); a malformed instant is printed verbatim; `isPurgeOverdue` is true AT the due instant;** control: one millisecond before it, false; `null` is never overdue. Mutation: compare with `<` instead of `<=`.
- ✅ **19.216 — `archiveWorkspaceSeeds` sends `workspace.archived` for a live workspace and `workspace.restored` for an archived one, `{}` against the workspace;** control: never a `project.*` type. Mutation: send `project.archived`.

## 19.22 The delete dialog

- ✅ **19.218 — the dialog is an `alertdialog` titled `Delete ticket “File the GST return”?`, its **Delete permanently** switch starts OFF, and the note is shown;** control: turning the switch on keeps the note on screen. Mutation: start the switch on.
- ✅ **19.219 — the confirm reads **Delete** (accessible name `Delete ticket`, `gn-button--danger`) and, with the switch on, **Delete permanently** (accessible name the same);** control: there is exactly one confirm at a time. Mutation: never flip the label.
- ✅ **19.220 — switch off sends ONE batch `[ticket.deleted]` and calls `onDeleted({ permanent: false })`; switch on sends ONE batch `[ticket.deleted, purge.marked]`, both `{}` against the ticket, and calls `onDeleted({ permanent: true })`;** control: every event in the batch names this ticket in this workspace. Mutation: send the mark in a second `ingest` call.
- ✅ **19.221 — on open, focus is on **Cancel**; Escape calls `onCancel` and sends nothing;** control: Cancel's own press also calls `onCancel` and sends nothing. Mutation: drop `initialFocusRef`.
- ✅ **19.222 — a refusal shows the server's reason inline (`role="alert"`) and the dialog stays open still holding the typed workspace name and the switch position; `onDeleted` is not called;** control: pressing again sends a second batch (a retry is possible). Mutation: reset the switch and the typed name on a refusal.
- ✅ **19.223 — two presses of the confirm while the first ingest is pending send ONE batch, and the confirm is disabled meanwhile;** control: after the answer arrives, `onDeleted` is called once. Mutation: remove BOTH guards (the `inFlight` ref and `submitting` in `disabled`) — each covers the other in jsdom, so the mutation names the pair.
- ✅ **19.224 — a half-committed batch (`ticket.deleted` committed, `purge.marked` refused) shows "This ticket was deleted, but not marked for permanent deletion — <reason> …", offers only **Close** (focused), never resends, and Close calls `onDeleted({ permanent: false })`;** control: nothing was sent a second time. Mutation: classify the answer as a plain refusal (the dialog then offers **Delete permanently** again, which would resend the delete).
- ✅ **19.225 — deleting a WORKSPACE asks for its name: the confirm is disabled until the exact name is typed;** control: a ticket shows no text field and its confirm is enabled at once. Mutation: skip the name gate.
- ✅ **19.226 — a rejected ingest shows the transport sentence in `gn-refusal--transport` and the dialog stays open;** control: an answer shorter than the batch shows `unansweredLine(0, 1)`. Mutation: route the rejection through the server-refusal class.
