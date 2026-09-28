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
- ✅ **19.071 — the replica twin rejects with `ReplicaGapError`;** control: `getMyWorkspaces` on the same replica resolves. Mutation: resolve `[]` (an empty list would tell a person they have nothing deleted, when nobody was asked). Amended 2026-09-29 by 19.197 (trash Plan 3): the rejection now happens only while nothing is cached — the absence is `DELETED_ITEMS_NOT_CACHED` ("DeletedItem[] — until one online read is cached on this device"); with a cache the replica rejects with `DeletedItemsFromCache` instead (19.196).

## 19.9 Purge — every table has a rule

- ✅ **19.081 — every base table carrying an entity column (`workspace_id`, `project_id`, `ticket_id`, `note_id`, `entity_id`, `parent_id`, `home_project_id`, `parent_ticket_id`) has an entry in `PURGE_TABLE_RULES`;** control: the same check run against the rules minus `proj_search` names exactly `proj_search`. Mutation: delete the `proj_search` entry — the case reddens naming it.
- ✅ **19.082 — every rule names a table that exists, and every `by` column exists on its table;** control: a rule for a fictitious `proj_gone`, and a `by` of `proj_tickets.ticket_idx`, are each named. Mutation: add `proj_gone: { rule: 'erase', by: ['workspace_id'], why: '…' }`.
- ✅ **19.083 — every base table except `pgmigrations` has a rule, and no entity-bearing table is labelled `not-entity-bearing`;** control: relabelling `proj_tickets` `not-entity-bearing` is named. Mutation: relabel `attachments` `not-entity-bearing`.

## 19.10 Purge vocabulary

- ✅ **19.086 — `purge.completed` parses against `workspace`, `project`, `ticket` and `note` with `{ kind, markedBy, markedAt }`, and is refused against `workflow`;** control: `ticket` accepted in the same `it`. Mutation: omit `'note'` from the registration's kinds.
- ✅ **19.087 — the `purge.completed` payload refuses a stranger's field (`title`), a missing `markedAt`, a non-ULID `markedBy` and a `kind` of `workflow`;** control: the exact three-field payload accepted. Mutation: drop `.strict()`.
- ✅ **19.088 — `SYSTEM_ACTOR_PURGE` is a ULID the ingest door can accept, is named `Permanent deletion` in `SYSTEM_ACTOR_NAMES`, and `isSystemActor` says so;** control: `'00000000000000000000SYS0PI'` (an `I`) fails `ULID_REGEX`. Mutation: spell the constant `…SYS0PI`.
- ✅ **19.089 — `PURGED_REASON`, `PURGE_SERVER_ONLY_REASON` and `PURGED_ITEM_LABEL` are the exact strings in Global Constraints;** control: `PURGED_REASON` differs from Plan 1's `WORKSPACE_DELETED_REASON` (a deleted item and an erased one are different sentences). Mutation: `PURGED_ITEM_LABEL = 'Deleted'`.
- ✅ **19.090 — `isRedactedTicketCreated` is true for `ticket.created` with `{ projectId, purged: true }` and false for an ordinary `ticket.created`, for `purged: 'true'` (a string), and for `{ purged: true }` on `ticket.field_set`;** control: `redactedTicketCreatedPayload(p)` satisfies it. Mutation: test `'purged' in payload` instead of `payload.purged === true`.

## 19.11 Redacted ticket creations replay

- ✅ **19.091 — `applyTicketEvent` on a redacted `ticket.created` throws the named purged-row error (not a ZodError), and `foldTicketEvent` returns the input state (`undefined`) for it;** control: `foldTicketEvent` folds an ordinary creation into a state whose title claim is the payload's. Mutation: make `foldTicketEvent` delegate without the redaction check.
- ✅ **19.092 — `ticketsProjection` applied to a redacted row writes no `proj_tickets` row and does not throw;** control: an ordinary creation in the same workspace has its row. Mutation: remove the skip in `projections/tickets.ts`.
- ✅ **19.093 — `projVisibility` applied to a redacted row writes no `proj_visibility` row;** control: the ordinary ticket's row exists. Mutation: remove the skip in `proj-visibility.ts`.
- ✅ **19.094 — `searchProjection` applied to a redacted row writes no `proj_search` row;** control: the ordinary ticket's row carries its title. Mutation: remove the skip in `search.ts`.
- ✅ **19.095 — `foldTicketHead` for a ticket whose stream is `[redacted ticket.created, purge.completed]` returns `null`;** control: the ordinary ticket folds to a state with its title. Mutation: fold with `applyTicketEvent` in `snapshot-writer.ts`.
- ✅ **19.096 — a redacted row keeps its key slot: the ticket created after it in the same project is numbered 3, not 2, and `verifyProjections` over a ledger holding redacted rows is clean;** control: the ticket created before it is numbered 1. Mutation: add `AND NOT (payload ? 'purged')` to `ticketNumbers`' `WHERE`.

## 19.12 The sanctioned ledger path

- ✅ **19.100 — outside a purge, `DELETE` and `UPDATE` on `events` still raise `events is append-only: DELETE refused` / `… UPDATE refused`;** control: an `INSERT` in the same transaction succeeds. Mutation: `RETURN OLD` at the top of the new function for `DELETE`.
- ✅ **19.101 — inside a transaction that ran `purge_ledger('ticket', A)`, deleting a row of B (not in A's set) raises;** control: in the same transaction, a row planted on A (in the set) is deletable. Mutation: sanction whenever `gisik.purge` is merely non-empty (spec §8's own mutation).
- ✅ **19.102 — the sanction does not outlive the transaction: after `COMMIT` of a `purge_ledger`, the same connection reads `gisik.purge` as empty, `pg_temp.purge_set` is gone, and deleting the purged ticket's surviving redacted row raises;** control: inside the transaction the setting read `ticket:<id>`. Mutation: `set_config('gisik.purge', …, false)`.
- ✅ **19.103 — the only UPDATE the trigger admits is the exact redaction: inside a purge, rewriting a set member's `ticket.created` to `{ projectId, purged: true, title }` raises, and so does changing its `actor_id`;** control: re-applying the exact redaction to a set member succeeds. Mutation: drop the `NEW.payload = jsonb_build_object(…)` condition.
- ✅ **19.104 — `TRUNCATE events` raises `events is append-only: TRUNCATE refused` even inside a purge;** control: a sanctioned `DELETE` in the same transaction succeeds. Mutation: move the `TG_OP = 'TRUNCATE'` test below the sanction lookup.
- ✅ **19.105 — `purge_erasure_set`: a ticket takes its whole subtree (child and grandchild) and not its sibling; a project takes itself, its tickets (a deleted one included) and its notes, and not a workspace-level note; a note takes itself; a workspace takes every entity in its events and none of another workspace's;** control: the sibling, the workspace-level note and the other workspace are absent. Mutation: drop the recursive arm (only the root ticket).
- ✅ **19.106 — `purge_ledger('ticket', A)` leaves exactly A's subtree's `ticket.created` rows, each `{ projectId, purged: true }`, deletes their other rows and snapshots, and returns the set; `purge_ledger('project', P2)` leaves no row for any member of P2's set;** control: B's snapshot and rows are untouched. Mutation: redact `ticket.created` for a project purge too.
- ✅ **19.107 — both functions are `SECURITY DEFINER` and neither grants EXECUTE to PUBLIC;** control: the same ACL probe reports PUBLIC execute for `events_append_only` (default ACL). Mutation: remove the two `REVOKE` lines.

## 19.13 Purging a ticket

- ✅ **19.110 — after `purgeItem` on a ticket T with a child C, the only rows anywhere naming T or C are T's and C's redacted `ticket.created`, T's tombstone, their two `proj_entity_heads` rows and their two `purged_entities` rows — no `proj_tickets`, `proj_visibility`, `proj_search`, `proj_ticket_comments`, `proj_contested`, `snapshots`, `attachments` or `notifications` row survives;** control: the sibling S1 keeps its ticket, search, attachment, contest and snapshot rows. Mutation: skip the `proj_visibility` delete in `eraseRows`.
- ✅ **19.111 — the purged ticket's content (a unique marker in its title, description, comment, attachment filename, notification and snapshot) appears in no text, jsonb, array or tsvector column anywhere;** control: before the purge the marker is in `events.payload`, `proj_tickets.fields`, `proj_search.{title,description,comments}`, `proj_ticket_comments.body`, `attachments.filename`, `notifications.payload` and `snapshots.state`. Mutation: skip the `notifications` delete.
- ✅ **19.112 — a later ticket's key is unchanged by the purge: S2 is number 4 before and after;** control: two redacted `ticket.created` rows (T, C) hold the slots. Mutation: have `purge_ledger` delete `ticket.created` for a ticket purge instead of redacting it (spec §8's own mutation).
- ✅ **19.113 — `purge.completed` is the only new event: filed on T by `SYSTEM_ACTOR_PURGE`, origin `server`, `seq` = T's old maximum + 1, `workspace_seq` = the workspace's old maximum + 1, payload `{ kind: 'ticket', markedBy, markedAt }` copied from the lifecycle row;** control: the payload parses with `purgeCompletedPayload`. Mutation: capture `nextWorkspaceSeq` after `purge_ledger` instead of before.
- ✅ **19.114 — `verifyProjections` is clean after ticket purges;** control: `proj_tickets`, `proj_search`, `proj_visibility`, `proj_contested` and `proj_entity_heads` are non-empty. Mutation: skip `replayRemaining`.
- ✅ **19.115 — `purgeItem` skips, never erases, an item not yet due (`now` = due − 1 ms → `not-due`), an unmarked one (`not-marked`), an unknown id (`not-found`) and an erased one (`already-purged`);** control: at exactly the due instant the same ticket is purged. Mutation: compare the due instant with `>=` instead of `>`.
- ✅ **19.116 — the purged ticket's attachment object is deleted from the store after commit, exactly once, and its queue row is gone;** control: the sibling's attachment row and object are untouched. Mutation: collect object keys by `workspace_id` instead of by the set's tickets and notes.
- ✅ **19.117 — a failing object delete leaves the key in `purge_pending_objects` with `attempts = 1` and the error, and the outcome reports it pending; the ledger half is committed regardless;** control: T's events are the redacted creation and the tombstone. Mutation: delete the objects inside the transaction, before `COMMIT`, letting a store error propagate.

## 19.14 Purging a note, a project, a workspace

- ✅ **19.120 — after purging a note N (with a comment, an attachment, a search row, chunks and lexemes), the only rows naming N are its tombstone, its head and its registry row, and the note's marker is nowhere — `proj_note_lexemes` included;** control: the ticket X that N was attached to keeps its row. Mutation: skip the `proj_note_comments` delete.
- ✅ **19.121 — after purging a project P2 (tickets A and child A1, deleted ticket B, ticket B2 purged individually beforehand, note NP, a project membership, preferences keyed by P2), the only rows naming any of them are P2's tombstone, its head and six registry rows; the preferences keep only the sibling project's keys;** control: the sibling project's ticket keeps its number and the workspace-level note survives. Mutation: drop the `ticket.created` arm of `purge_erasure_set`'s project branch (D11).
- ✅ **19.122 — a workspace purge erases every row of W1 — `invite_tokens` included — and leaves W2's memberships, preferences, notifications and events exactly as they were, though one user belongs to both;** control: W2's four counts, compared before and after. Mutation: delete `user_preferences` by `user_id` instead of `workspace_id` in the workspace branch.
- ✅ **19.123 — after a workspace purge the workspace's stream is exactly one event, `purge.completed` `{ kind: 'workspace', markedBy, markedAt }` filed on the workspace at the old maximum `workspace_seq` + 1, and `verifyProjections` is clean over every purge in the file;** control: the verify is over non-empty `proj_notes` and `proj_projects`. Mutation: capture `nextWorkspaceSeq` after `purge_ledger`.

## 19.15 Survivors

- ✅ **19.128 — `docToPlainText` with an `isPurged` resolver renders a purged `ticketRef` and a purged `wikiLink` as `Deleted item`, and `chunkDoc` passes the resolver to both the body and a heading path;** control: without the option the same document renders `KEY title` and the link's title. Mutation: ignore `options` in the `wikiLink` branch.
- ✅ **19.129 — `collectDocReferences` returns each chipped ticket id and linked note id once, at any depth, ignoring mentions and empty ids;** control: a non-document input returns empty lists. Mutation: omit the `wikiLink` arm.
- ✅ **19.130 — a surviving ticket S1 whose comment chips the purged ticket T no longer matches T's title in search after the purge, matches `deleted item`, and `verifyProjections` is clean;** control: before the purge S1 matches T's title. Mutation: replay `proj_search` without the resolver (plain `docToPlainText(payload.body)` in the comment arm).
- ✅ **19.131 — surviving notes attached to T lose their `proj_note_attachments` rows; a note that moved to `inherit` after attaching T keeps `scope_mode = 'inherit'`; the purge does not throw and a rebuild agrees;** control: before the purge both notes had their rows. Mutation: remove `purgedAttachmentsOf` from the notes fold — the replay refuses "inherit needs an attachment".
- ✅ **19.132 — a surviving note whose body chips T is re-indexed: its `body_text` reads `deleted item`, T's title is gone from `proj_note_lexemes`, and its `search_note_chunks` are deleted;** control: an unrelated note keeps its chunk. Mutation: skip the `search_note_chunks` delete in `rederiveSurvivors`.
- ✅ **19.133 — the embed worker re-chunks that note with `Deleted item` in place of the chip;** control: the unrelated note's chunk, current by model and seq, is not rewritten. Mutation: call `chunkDoc(note.body)` without the resolver in `embed-worker.ts`.
- ✅ **19.134 — the erasure proof with ruling A's allowlist: after purging T in a world seeded with every referencing shape, T's and C's ids appear only in `events.entity_id` (3), `events.payload` (4: S1's chip comment, N1's creation, N2's attach, R's creation), `proj_entity_heads.entity_id` (2), `purged_entities.entity_id` (2), `proj_ticket_comments.body` (1) and `proj_notes.body` (1); T's content only in `events.payload` (2), `proj_ticket_comments.body` (1) and `proj_notes.body` (1);** control: before the purge the content marker is also in `proj_search`, `proj_note_search`, `proj_note_lexemes` and `search_note_chunks`. Mutation: skip `reindexNote` in `rederiveSurvivors`.
- ✅ **19.135 — purging a project drops it from a pending invite's `project_ids`, keeping the other project in order, and `verifyProjections` is clean;** control: the invite is still `pending`. Mutation: remove the purged-project filter from `proj-invites.ts`'s `invite.sent` fold.
- ✅ **19.136 — purging a child whose parent survives leaves the parent's `proj_rollups` row as it was, and a rebuild agrees;** control: the parent's row counted one live child before the purge. Mutation: erase `proj_rollups` by the set's `workspace_id` instead of by `parent_ticket_id`.

## 19.16 The door after a purge

- ✅ **19.140 — `purge.completed` is refused with `PURGE_SERVER_ONLY_REASON` at the client door (from the workspace owner) and at the internal door;** control: an ordinary `ticket.field_set` by the same owner commits. Mutation: drop the `purge.completed` arm of `checkPurged`.
- ✅ **19.141 — at the client door, a `ticket.field_set` and a `comment.added` on the purged ticket, and a `ticket.created` naming it as parent, are refused with `PURGED_REASON`;** control: a `comment.added` on the surviving sibling commits. Mutation: drop the payload-id arm (the `ticket.created` then answers with a hierarchy refusal).
- ✅ **19.142 — a `project.created` in a purged workspace, by the user who owned it, is refused with `PURGED_REASON`, not `permission.role`;** control: the same event in that user's other workspace commits. Mutation: check only the event's entity, not its workspace.
- ✅ **19.143 — at the INTERNAL door, a server-origin `claim.contested` on the purged ticket is refused with `PURGED_REASON` and the ticket's stream is unchanged; at the client door, a `note.attached` naming it is refused;** control: the same contest on the sibling, and an attach of the sibling, commit. Mutation: move the `checkPurged` call from `commitOne` into `checkPermission` (client door only).

## 19.17 The purge sweep

- ✅ **19.145 — the sweep purges every due item parents first: with a marked project P2 and its marked ticket B2 both due, P2 is purged and B2 is skipped (already erased by P2), and a note marked later (not yet due) is not a candidate;** control: the later note is untouched. Mutation: reverse `PURGE_KIND_ORDER` (B2 is then purged on its own first — `purged: 2`).
- ✅ **19.146 — when the first of two due items throws, the second is still purged, the failure is logged and alerted once as `purge:ticket:<id>`, and the next sweep purges the first;** control: the second sweep reports no failure and the alert count stays one. Mutation: remove the `try`/`catch` around the per-item purge.
- ✅ **19.147 — an object left queued by a failed delete is retried by every sweep: a still-failing store leaves it queued with `attempts` incremented, a working one deletes it and empties the queue;** control: before any sweep the key is queued with `attempts = 1`. Mutation: in `deletePendingObjects`, delete the queue row before calling `store.delete`.
- ✅ **19.148 — a marked item is not a candidate one millisecond before `purgeDueAt(mark)` and is one at exactly that instant;** control: the second run purges it. Mutation: filter with `<` instead of `<=`.
- ✅ **19.149 — the daemon refuses `PURGE_SWEEP_INTERVAL_MS=0` before arming any job, naming the variable;** control: with `3600000` it arms and announces itself. Mutation: remove the `requirePositiveIntervalMs` call from the `purge` job's `delayMs`.
- ✅ **19.150 — the deploy spec's `backup` worker declares `OBJECT_STORE=s3` and `OBJECT_STORE_S3_BUCKET=gisik-nokma-attachments`;** control: that is the bucket the `server` service writes attachments to, and it differs from `BACKUP_S3_BUCKET`. Mutation: delete the worker's `OBJECT_STORE` entry. Whole-branch review addition: the scheduled `purge` job also refuses to run unless `OBJECT_STORE` is set explicitly (`requireExplicitObjectStore`, fail closed on the local-disk fallback); control: `s3` and `local` pass. Mutation: neutralise the check.
- ✅ **19.151 — an item already in `purged_entities` is never a candidate, even if its lifecycle row still says it is due;** control: a second due item in the same sweep is a candidate and is purged. Mutation: drop the `NOT EXISTS (… purged_entities …)` filter from the candidate query.

## 19.18 Backup retention

- ✅ **19.153 — `pruneBackups` deletes a `pg/` object older than the window and keeps one exactly at the boundary and the newest;** control: `examined` counts all three and `keptNewest` names the newest. Mutation: delete at `<=` the cutoff instead of `<`.
- ✅ **19.154 — the newest object under a prefix is kept even when it is older than the window: a lone 90-day-old `pg/` dump survives;** control: under `ledger/`, of a 90-day and a 60-day export, the 90-day one IS deleted. Mutation: drop the newest-per-prefix exclusion.
- ✅ **19.155 — pagination is followed: an old object on the second `ListObjectsV2` page is deleted, and the second request carries the first page's continuation token;** control: the first page's old object is deleted too. Mutation: read only the first page (ignore `IsTruncated`).
- ✅ **19.156 — a failing `DeleteObject` is reported in `errors`, not thrown, and the other deletes still happen;** control: the second old object is in `deleted`. Mutation: remove the `try`/`catch` around the delete.
- ✅ **19.157 — `BACKUP_RETENTION_DAYS` defaults to 30 when unset or empty, accepts `45`, and throws naming the variable for `abc`, `0`, `-3` and `1.5`;** control: the default. Mutation: parse with `Number.parseInt` (accepts `1.5` as 1).
- ✅ **19.158 — `runThenPrune` prunes only after the job succeeds; a prune that throws or reports errors alerts `backup:prune-after-<job>` and resolves;** control: a failing job rejects and the prune is never called. Mutation: rethrow the prune's error.
- ✅ **19.159 — the daemon refuses `BACKUP_RETENTION_DAYS=abc` before arming any job, naming the variable;** control: with `30` it arms and announces itself. Mutation: move the `backupRetentionDaysFromEnv` call inside the prune closure (read lazily).

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

## 19.23 The ticket sheet

- ✅ **19.228 — the sheet's **Delete** opens the shared `alertdialog` `Delete ticket “<title>”?` with its **Delete permanently** switch, and posts nothing;** control: exactly one button is named `Delete` (the footer's) and one `Delete ticket` (the confirm). Mutation: mount the old E2-35 `Dialog` instead.
- ✅ **19.229 — confirming posts ONE `ticket.deleted` for this ticket, closes the sheet, and calls `onDeleted(ticketId, key ?? title, { permanent: false })`;** control: the batch holds no `purge.marked`. Mutation: drop the third argument.
- ✅ **19.230 — with the switch on, confirming posts ONE batch `[ticket.deleted, purge.marked]` and calls `onDeleted(…, { permanent: true })`;** control: both events name this ticket. Mutation: pass `{ permanent: false }` always.
- ✅ **19.231 — a refused delete answers INSIDE the dialog, once, and the sheet stays open (its `onClose` is not called); the footer holds no refusal;** control: the footer's `Delete` is still there. Mutation: render the refusal in the sheet's head slot as well.
- ✅ **19.232 — Escape inside the delete dialog closes the dialog and NOT the sheet under it;** control: nothing was posted. Mutation: drop `event.preventDefault()` from `Dialog`'s Escape handler (the E5-20 mechanism).
- ✅ **19.233 — on the project page a PERMANENT delete's toast reads "<name> marked for permanent deletion · …" and its **Undo** posts ONE batch `[purge.unmarked, ticket.restored]` for that ticket;** control: the soft sentence is not on screen (16.84 is the soft Undo's own case). Mutation: always restore with `ticket.restored` alone.
- ✅ **19.234 — the page strip's Undo after a permanent delete sends the pair; if only the unmark lands, the refusal is shown and the strip's next Undo sends `ticket.restored` alone;** control: the strip's sentence turns to the soft one once the mark is gone. Mutation: keep `permanent: true` on the strip after a `partly` answer.

## 19.24 The note page

- ✅ **19.236 — a note's editor (its author, here the owner) sees **Delete…** in the byline;** control: a plain member who is not the author sees none, and neither does anyone on a note that is already deleted. Mutation: pass `onDelete` regardless of `canEditNow`.
- ✅ **19.237 — **Delete…** opens `Delete note “<title>”?`; confirming with the switch on posts ONE batch `[note.deleted, purge.marked]` for this note, and the page then shows the deleted banner;** control: switch off posts `[note.deleted]` alone. Mutation: send the batch against `kind: 'ticket'`.
- ✅ **19.238 — after a permanent delete made on this page, the banner's **Restore** posts ONE batch `[purge.unmarked, note.restored]`;** control: after a soft delete it posts `[note.restored]` alone. Mutation: always restore with `note.restored` alone.
- ✅ **19.239 — a refused banner Restore shows the server's reason in the banner (`role="alert"`), and the banner stays;** control: a committed Restore removes the banner. Mutation: return on refusal without setting the message (the old silent `write`).

## 19.25 Project delete on the workspace home

- ✅ **19.241 — an admin's project card shows **Delete…** (accessible name `Delete <project>`) beside **Archive**;** control: a member's card shows neither. Mutation: render Delete… for every role.
- ✅ **19.242 — **Delete…** opens `Delete project “<name>”?`; confirming posts ONE batch `[project.deleted]` (with the switch on, `[project.deleted, purge.marked]`) against the project, the page re-reads, and a status line names the project and Deleted items;** control: Cancel posts nothing and leaves the card. Mutation: send `project.archived`.
- ✅ **19.243 — an ARCHIVED project card (behind the archived toggle) also offers **Delete…**;** control: its Archive control reads **Restore**, unchanged. Mutation: render Delete… only on live cards.

## 19.26 Workspace cards

- ✅ **19.245 — an OWNER's workspace card holds exactly one link (the door) and one button (`More actions for <name>`), and the button is not inside the link;** control: an admin's card holds zero buttons (13.390's rule, for everyone but the owner). Mutation: render the menu for `mayAdminister`.
- ✅ **19.246 — the trigger opens a `menu` named `Workspace actions` with **Archive** and **Delete…**, focus on the first item; ArrowDown moves to **Delete…**; Escape closes it and returns focus to the trigger;** control: `aria-expanded` reads false then true then false. Mutation: drop the Escape branch.
- ✅ **19.247 — **Archive** posts ONE `workspace.archived` `{}` against the workspace in its own stream, and after the re-read the card has left the live list for the collapsed Archived group;** control: the other, live workspace's card is still in the live list. Mutation: send `project.archived`.
- ✅ **19.248 — the Archived group is collapsed behind `1 archived · show` (named `Show archived workspaces`, `aria-expanded="false"`); opening it shows the card dimmed with an `Archived` chip, and its menu's **Restore** posts `workspace.restored`;** control: **Hide archived** collapses it again. Mutation: render archived cards in the live list.
- ✅ **19.249 — **Delete…** opens `Delete workspace “<name>”?`, which needs the name typed; confirming posts ONE `[workspace.deleted]`, the re-read drops the card, and the status line names the workspace and Deleted items;** control: before typing, the confirm is disabled and nothing is posted. Mutation: open the dialog with `kind: 'project'`.

## 19.27 Account — Deleted items

- ✅ **19.251 — each row shows its kind (icon and text), its label, where it lived, "Deleted by you / <name> / someone · <IST day>", and "and N items inside" (singular at 1), in the order served;** control: a ticket row with `containedCount: 0` has no "inside" line. Mutation: print `deletedBy` (the id) instead of the name.
- ✅ **19.252 — an empty read shows "Nothing deleted."; a `ReplicaGapError` shows "Deleted items needs a connection."; any other failure shows the failure line;** control: neither failure ever shows "Nothing deleted.". Mutation: catch every failure as `[]`.
- ✅ **19.253 — an unmarked row's **Restore** posts ONE `project.undeleted` for a project row (never `project.restored`), and **Mark for permanent deletion** posts ONE `purge.marked` against the row's own kind; each re-reads;** control: an unmarked row offers no Unmark. Mutation: restore a project with `project.restored`.
- ✅ **19.254 — a marked row shows "Permanently deleted on 13 Oct", offers **Unmark** (posting `purge.unmarked`), and its **Restore** is disabled with "Unmark it to restore it.";** control: a marked row offers no Mark. Mutation: leave Restore enabled on a marked row.
- ✅ **19.255 — at its due instant a marked row still shows its date, offers NO Unmark, and says "Its permanent deletion is under way.";** control: one millisecond earlier, Unmark is offered. Mutation: `isPurgeOverdue` with `<`.
- ✅ **19.256 — two presses on a row action while one is pending post ONE batch; a refusal is shown inside that row;** control: the row's buttons are disabled while pending. Mutation: remove the row latch AND `disabled={busy}` (each covers the other in jsdom).
- ✅ **19.257 — `/account` shows the Deleted items section for a signed-in person, with the rows `getDeletedItems` served;** control: signed out, no section (and no read). Mutation: render it regardless of the session.
- ✅ **19.258 — every trash class the dialog and the section render, and every class the card pages add, has a rule inside the one `trash-4-ui` block of `globals.css`, and none of those classes is styled outside it;** control: the block exists exactly once. Mutation: delete the `.gn-deleted-items__due` rule.

## 19.28 Browser

- 🧪 **19.260 — on the dev stack (built from `release/trash` after this plan merges), a project admin deletes a ticket PERMANENTLY from its sheet, finds it marked in Account → Deleted items, unmarks it, restores it, and finds it back on the board with the same key;** control: pressing Escape in the delete dialog closes the dialog and leaves the sheet open, and the first focus in the dialog is Cancel. Steps: (1) sign in as the workspace owner; open a project's Board; open a live ticket (note its key, e.g. `CCSO-12`); (2) press **Delete** in the sheet's footer — the `Delete ticket “<title>”?` dialog opens with focus on **Cancel**; press Escape — the dialog closes and the sheet is still open; (3) press **Delete** again, turn on **Delete permanently**, press **Delete permanently** — the sheet closes, the toast reads "<key> marked for permanent deletion · you can also undo this on the page", the card is gone from the Board; (4) open the avatar menu → **Account** → **Deleted items**: the ticket's row shows "Ticket · <workspace> › <project>", "Deleted by you · <today, IST>", "Permanently deleted on <today + PURGE_DELAY_DAYS, IST>", an **Unmark** button, a disabled **Restore** and "Unmark it to restore it."; (5) press **Unmark** — the date line goes and **Restore** and **Mark for permanent deletion** are offered; (6) press **Restore** — the row goes (or the list reads "Nothing deleted." if it was the only one); (7) back on the project's Board the card is back with the SAME key. Evidence: one screenshot per step 2–7 into the PR thread, and the runner's name and the stack's commit. Mutation (for the runner, optional): none — a browser case is witnessed, not mutated.

## 19.29 Whole-branch review fixes

- ✅ **19.160 — a purge that lands while the embed worker is mid-call is not undone: the worker writes no chunk for the erased note, and a chunk row whose note no longer exists is removed by the next pass;** control: the live note beside it is embedded. Mutation: drop the worker's `FOR SHARE` re-check (the racing INSERT survives), or restore the join-based cleanup (the orphan survives).

## 19.30 The purged-id lookup

- ✅ **19.161 — `POST /v1/purged-lookup` answers, of the ids asked, exactly those in `purged_entities` whose kind is a lifecycle kind, as `{ kind, id }` sorted by kind then id;** control: a live id asked beside them is absent, and a registry row of kind `workflow` for an asked id is absent. Mutation: join on the id alone (drop the `PURGEABLE_KINDS` cross join) — the `workflow` row appears.
- ✅ **19.162 — the body is refused with 400 for 501 ids and for an id that is not a ULID;** control: exactly 500 ULIDs answer 200, and an empty list answers `{ purged: [] }`. Mutation: raise `maxItems` to 1000.
- ✅ **19.163 — a signed-out caller gets 401;** control: the same body with a session answers 200. Mutation: drop `preHandler: requireSession`.
- ✅ **19.164 — the device vocabulary is pinned: `PURGED_OUTBOX_NOTICE` verbatim, `PURGE_RULE` is `purge.erased` and the server's re-export is the same constant, `PURGED_LOOKUP_MAX_IDS` is 500, and `isPurgedRef` admits the four lifecycle kinds with a non-empty id;** control: a `workflow` ref, an empty id and a ref without an id are refused. Mutation: `isPurgedRef` accepts any string kind.

## 19.31 The door, through sync

- ✅ **19.165 — through `POST /v1/sync`'s service, a `ticket.created` whose parent was purged is answered `refused` with `PURGED_REASON` and rule `purge.erased`, and no row of any kind is written for the new ticket (no `claim.contested`);** control: a legal top-level creation in the same project commits. Mutation: delete the `claim.contested` arm of `payloadIds` — the answer becomes `contested`.
- ✅ **19.166 — through sync, a `ticket.created` in a purged project and a `ticket.reparented` of a live ticket under a purged one are both refused with `PURGED_REASON`, and the live ticket's stream is unchanged;** control: a creation in the kept project commits. Mutation: read only the original event's ENTITY, not its payload — both answers become `contested`.

## 19.32 The replica erases

- ✅ **19.167 — `eraseEntities([{ticket T}])` removes T's events, row, snapshot and provenance, T's local child, and EVERY contest on T — the device's own stub included;** control: the sibling S keeps its row, its snapshot and its own stub. Mutation: delete contests with `purgeEntity`'s rule (`claimant_id <> me`) — the own stub survives.
- ✅ **19.168 — an erased ticket's queued claim leaves the outbox as a `sync_notices` row naming only its event id, target and type (never the payload), and is neither silently deleted nor left failed;** control: another ticket's queued claim stays queued. Mutation: delete the outbox rows without recording a notice.
- ✅ **19.169 — erasing a note removes its events, its row and its comments, and its queued claim becomes a notice;** control: a second note and its comment are untouched. Mutation: skip `note_comments`.
- ✅ **19.170 — erasing a project recomputes the local subtree: every ticket whose state names the project (children included) and every note homed in it;** control: the other project's ticket and note stay. Mutation: expand by `parent_id` only, skipping the project scan.
- ✅ **19.171 — erasing the workspace empties every workspace-scoped local table, the definitions, the cursor and BOTH pending-pull keys, and records the workspace;** control: the device identity (`me`) is kept. Mutation: forget `pending-note-pulls:<ws>` (the key `revokeScope` also leaves behind).
- ✅ **19.172 — every local table has an entry in `LOCAL_TABLE_RULES`, and every entry names a real table;** control: the rules minus `contests` leave exactly `contests` uncovered. Mutation: delete the `contests` entry.
- ✅ **19.173 — `purgedAmong` answers only recorded ids, and an erase strips the Deleted-items cache of the erased ticket and, for a workspace, of every item in it;** control: an unrecorded id is absent and an item of another workspace stays cached. Mutation: skip the cache strip. Amended 2026-09-30 (final review I-2, I-3): the cached Deleted-items ids (item, project, workspace) are lookup candidates, an erased project strips its cached tickets, and offline `searchLocal` stops matching an erased title inside a surviving comment.

## 19.33 Client folds

- ✅ **19.174 — the replica applies a redacted `ticket.created` (`{ projectId, purged: true }`) without throwing and folds no ticket from it;** control: an ordinary creation beside it folds. Mutation: fold with `applyTicketEvent` again — its named throw rejects the apply.
- ✅ **19.175 — `buildPendingOverlay` over a queued redacted creation produces no state and does not mark the ticket unfoldable;** control: an ordinary queued creation folds into `states`. Mutation: fold with `applyTicketEvent` — the ticket lands in `unfoldable`.

## 19.34 When a device learns

- ✅ **19.176 — at `caught-up`, after the reconcile pass, the engine sends the ids it holds to the lookup and erases what comes back;** control: a held ticket the lookup does not name stays. Mutation: remove the `learnPurges` call from `onCaughtUp`.
- ✅ **19.177 — the lookup asks about more than the held rows: an id reconcile just evicted (whose own contest stub `purgeEntity` kept) and a chip id inside a held comment;** control: the untouched held ticket is still held. Mutation: build the candidates from `listTickets` alone — the chip id is never asked and never recorded.
- ✅ **19.178 — a device holding 1,102 ids asks in chunks of at most 500; one chunk failing is recorded in `lastPurgeLookupError` and the next chunk's answer is still erased;** control: an id answered only by the failing chunk is not erased. Mutation: stop at the first failing chunk.
- ✅ **19.179 — a `not-a-member` stream error whose lookup names the workspace erases the workspace and ENDS the stream: status `offline`, no resubscribe;** control: the recorded workspace answers `purgedAmong`. Mutation: erase without setting `streamEnded` — the engine reconnects.
- ✅ **19.180 — a `not-a-member` whose lookup names nothing erases nothing (a revoke is `revokeScope`'s), and a bootstrap 403 asks the lookup and rethrows `WorkspaceAccessLost`;** control: the same 403 when the lookup names the workspace resolves `start()` with the workspace recorded and no subscribe. Mutation: erase the workspace on any `not-a-member` without asking. Amended 2026-09-30 (final review I-4): a relaunch after the purge — the workspace already recorded, the lookup asking nothing — still resolves `start()` without a subscribe.
- ✅ **19.181 — a `purge.completed` envelope for a project is never stored and makes the device erase that project's local subtree;** control: the other project's ticket stays. Mutation: drop the replica's `purge.completed` branch — the tombstone lands in `events`.
- ✅ **19.182 — the HTTP transport POSTs `{ ids }` to `/v1/purged-lookup` with the bearer token and keeps only well-formed lifecycle refs, GETs `/v1/me/deleted-items`, and answers a bootstrap 403 with `WorkspaceAccessLost` (message `bootstrap failed: 403`);** control: a bootstrap 500 is a plain `Error`, and a lookup 502 throws `purged-lookup failed: 502`. Mutation: throw a plain `Error` on 403.

## 19.35 The outbox notice

- ✅ **19.183 — a claim the server refuses with rule `purge.erased` leaves the outbox as a notice and is NOT a failed row;** control: a claim refused by any other rule stays a failed row carrying its `rule: reason` as `lastError`. Mutation: delete the `PURGE_RULE` arm — the purge refusal becomes a permanent failed row.
- ✅ **19.184 — `failedItems` carries `lastError`, `dismissFailed` deletes a failed row, and `dismissNotice` deletes a notice;** control: `dismissFailed` on a QUEUED row's id leaves it queued. Mutation: `dismissFailed` without the `status = 'failed'` guard.
- ✅ **19.185 — `SyncNotices` draws each notice's sentence with a Dismiss button named `Dismiss: <sentence>`, calls `onDismiss` with its id, draws an empty live region for none, and every `gn-sync-notices*` class it renders has a rule in `ui.css` and vice versa;** control: no button for zero notices. Mutation: drop the `aria-label` — the button's name loses the sentence.
- ✅ **19.186 — the replica data source's `syncNotices` lists purge notices as `PURGED_OUTBOX_NOTICE` and failed claims as `failedClaimNotice(lastError)`, and `dismissSyncNotice` routes `purged:`/`failed:` ids to the right delete;** control: an unknown id changes nothing. Mutation: route `failed:` ids to `dismissNotice`.
- ✅ **19.187 — end to end against the real server: device A edits T offline, T is deleted, marked and purged, A reconnects — the edit comes back refused, leaves A's outbox as a notice (no failed row), A's lookup erases T, and A lists `PURGED_OUTBOX_NOTICE`;** control: A's offline edit to the surviving S commits. Mutation: delete the `PURGE_RULE` arm in `applyResult`.

## 19.36 Deleted item chips

- ✅ **19.188 — `renderCommentBody` draws a `ticketRef` and a `wikiLink` whose target the predicate names as `PURGED_ITEM_LABEL`, in a span with `gn-comment__ref--purged`, with no link even when the href resolver answers one;** control: a live chip beside them keeps `KEY title` and its link. Mutation: resolve the href before asking the predicate.
- ✅ **19.189 — the online twin of `purgedAmong` POSTs the unique ULIDs (a non-ULID is never sent) to `/v1/purged-lookup` in chunks of at most 500 and maps each row, refusing one that is not a lifecycle ref; the replica twin answers from `purged_ids`;** control: an empty list sends no request, and an unrecorded id is absent on the replica. Mutation: send every id in one request.
- ✅ **19.190 — `usePurgedPredicate` is not `ready` before its documents are `loaded`, asks once per id per session (a second mount of the same document asks nothing), is `ready` in the same render for a document without chips, and settles `ready` with nothing purged when the lookup fails — which it retries on the next mount;** control: the predicate names the purged id and not the live one. Mutation: drop the session cache.
- ✅ **19.191 — a SURVIVING comment's chip to a purged note reads "Deleted item" with no link, both in the ticket sheet's thread and in the web's note comments, and the stored comment body is unchanged;** control: the live ticket chip in the same comment keeps `SHOP-9 Fix the freezer` and its link. Mutation: do not pass `isPurged` from the sheet to `CommentsThread`.

## 19.37 Deleted item chips in the editor

- ✅ **19.192 — the editor's `ticketRef` whose target is purged renders `span.editor-ticketref.editor-ticketref--purged` reading `PURGED_ITEM_LABEL` with no href (node view, `renderHTML` and `renderText` alike), and the node's attrs in `getJSON()` still hold the stored key and title;** control: a live chip beside it is `a.editor-ticketref` reading `SHOP-9 Fix the freezer`. Mutation: resolve the href before asking the predicate in the node view.
- ✅ **19.193 — a purged `wikiLink` renders `PURGED_ITEM_LABEL` in `span.editor-wikilink--purged` even when `resolveNoteTitle` answers a title, and a click does not navigate;** control: a live link resolves its title and navigates. Mutation: ask `resolveNoteTitle` first.
- ✅ **19.194 — the webview bridge's `loadDoc` carries `purgedIds` (non-strings dropped), and they are applied BEFORE `setContent`, so a loaded chip to a purged id renders `PURGED_ITEM_LABEL`; the phone builds the message with them;** control: a `loadDoc` without the field parses without the key and renders the stored text. Mutation: call `onPurgedIds` after `setContent`.
- ✅ **19.195 — the ticket sheet mounts its description editor only once the description's chips have an answer, then hands it `isPurged`;** control: a description with no chips mounts on the first render. Mutation: mount the description slot without waiting for `ready`.

## 19.38 Deleted items offline

- ✅ **19.196 — the replica returns and caches an online `getDeletedItems`; offline it rejects with `DeletedItemsFromCache` holding the cached items and when they were read, and an erase strips an erased item from that cache;** control: back online the answer is a plain list again. Mutation: resolve the cached items instead of rejecting with them.
- ✅ **19.197 — a device that has never cached the list rejects with `ReplicaGapError` naming `DELETED_ITEMS_NOT_CACHED` (the entry `REPLICA_GAPS` lists), and a malformed online body is a `MappingError` that the cache does not mask;** control: a transport failure with a cache is `DeletedItemsFromCache`. Mutation: map inside the transport `try`, so a mapping failure falls back to the cache.

## 19.39 The cached Deleted items view

- ✅ **19.198 — a `DeletedItemsFromCache` answer draws the saved rows under `deletedItemsAsOf(<IST instant>)`, with no button in the list and no "Unmark it to restore it.";** control: a `ReplicaGapError` still reads "Deleted items needs a connection." and never "Nothing deleted.". Mutation: render the row actions for a cached answer.
- ✅ **19.199 — `deletedItemsAsOf` is pinned verbatim, and an EMPTY saved list reads "Nothing deleted." together with the as-of line, never the offline line;** control: an empty live list reads "Nothing deleted." with no as-of line. Mutation: treat an empty cached list as offline.

## 19.40 A purge redraws what it changed

- ✅ **19.200 — the engine's `onNoticesChanged` fires after a flushed claim is refused (a notice or a failed row) and after a purge lookup erases something, and the replica data source forwards it to a subscriber as a `refresh` frame;** control: a lookup naming nothing, and a flush with nothing queued, fire nothing. Mutation: drop the `notifyNoticesChanged()` after `eraseEntities`.

