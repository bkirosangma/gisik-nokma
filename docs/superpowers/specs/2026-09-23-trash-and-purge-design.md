# Archive, delete, and permanent purge — design

**Status:** spec for owner review. Brainstormed 2026-09-23 with the owner (planner session `gisik-nokma-notes-28`).
**Base:** `origin/release/notes` at `3377b10c`. Every citation below is a line read on that tree; it is a reading that expires — the plan re-reads each before it builds on it.
**Target branch:** `release/notes` (ships with the notes release, as the board-card and starting-status requests do) unless the owner rules otherwise.

## 1. The request (owner's words, 2026-09-23)

1. "Workspace card needs an archive (similar to projects.)"
2. "need delete route for projects and workspaces as well. soft delete."
3. "in the account page, need a section to see all soft deleted items. need to be able to mark them for permanent delete. which deletes them permanently after 15 days. (they can be unmarked for permanent deletion at any time before that.)"
4. (added in the brainstorm) "for every delete, there should be a confirmation dialog that opens. with a switch 'delete permanently' with a small note that says deleted items sit in deleted items and deleting permanently marks the item to be permanently purged after 15 days."

## 2. Decisions

| # | Decision | Source |
|---|---|---|
| T1 | "Permanently deleted" means **truly erased** — the item's events, projections, search rows and attachment objects are removed, not merely hidden. | owner: "Truly gone" |
| T2 | The Deleted items section holds **everything soft-deleted**: workspaces, projects, tickets, notes. | owner: A |
| T3 | **Whoever could delete an item** sees it in Deleted items and may restore it, mark it, and unmark it. | owner: A |
| T4 | **Backups get a retention**: backup objects older than **30 days** are deleted, so an erased item leaves the last backup within 15 + 30 = 45 days of being marked. The 30 is the planner's number; the owner accepted the option without naming one — change it here if wanted. | owner: A |
| T5 | Erasure takes **everything the item owns** (children, comments, attachments, its history); a surviving reference elsewhere becomes a **"Deleted item" stub** (no title, no key); a surviving note attached to an erased ticket is **detached**, not erased. | owner: A |
| T6 | Erasure runs through **one sanctioned purge path** (approach 1): a single database function is the only thing allowed to remove ledger rows; `events_append_only` keeps refusing everyone else. | owner: "1." |
| T7 | **Every delete opens a confirmation dialog** with a **"Delete permanently"** switch (off by default) and the note in §6.1. Switch on = soft delete AND mark for purge in one act. | owner, added |
| T8 | Workspace archive works exactly like project archive: hides from lists of live work, removes nobody's access, reversible. | planner assumption, owner did not object |
| T9 | An unmarked soft-deleted item stays in Deleted items **indefinitely**; the 15 days start at the MARK, not at the delete. | planner assumption, owner did not object |
| T10 | Soft-deleting a workspace or project hides it **and everything inside it** from every member at once; restoring brings everything back. | planner assumption, owner did not object |

## 3. What exists today (measured)

- **Ledger immutability.** `events` is append-only by trigger: `events_append_only()` raises on UPDATE, DELETE (`BEFORE UPDATE OR DELETE … FOR EACH ROW`) and TRUNCATE (`apps/server/migrations/1787841717635_events-and-snapshots.sql:29-41`).
- **Soft delete exists for two kinds.** `ticket.deleted`/`ticket.restored` (`packages/domain/src/vocabulary.ts:226,233`) and `note.deleted`/`note.restored` (`vocabulary.ts:334,341`). The ticket pair's docblock states the old semantics this spec supersedes for purge: "the whole vocabulary is append-only, so the only delete this product can have is a flag on head state" (`packages/rule-engine/src/checks/deletion.ts`, header).
- **Project archive exists; project delete does not.** `project.archived`/`project.restored` (`vocabulary.ts:411,418`), empty strict payloads; the docblock says "There is still no `project.deleted` event anywhere — the invitation gate … depends on a founded project staying founded" (`packages/domain/src/events/membership.ts:230-235`). The archive gate is workspace admins (`ADMIN_ONLY_TYPES`, `apps/server/src/permissions/check-permission.ts:369-370`; `apps/web/app/w/[workspaceId]/page.tsx:67-70`).
- **Workspaces have neither.** Only `workspace.created`, `workspace.renamed`, `workspace.settings_set` (`vocabulary.ts:72,79,520`).
- **Delete authority today.** Ticket: project admins (`check-permission.ts:1424-1430`, `ticketDeleteAuthorityReason`). Note: "the note's author, an admin who can read it, or the workspace owner" (`check-permission.ts:1147`, `NOTE_AUTHOR_EVENTS` at `:1161-1168`).
- **Ticket keys are COUNTED from the ledger.** `row_number() OVER (PARTITION BY payload->>'projectId' ORDER BY workspace_seq)` over `type = 'ticket.created'` rows (`apps/server/src/read/ticket-numbers.ts:104-111`); the replica mirrors it (`packages/app-core/src/replica/replica-data-source.ts:1495`). Removing a `ticket.created` row would renumber every later ticket in that project.
- **Stream resume is gap-tolerant.** Streams resume by `workspace_seq > $2` (`apps/server/src/visibility/visible-events-for.ts:444`; `apps/server/src/stream/hub.ts:324`). A removed row leaves a gap the cursor steps over.
- **Backups have no retention in code.** `apps/server/src/ops/` (7 files: backup daemon, schedule, pg-dump, object sink, export-ledger, fetch-backup, env) contains no prune/expire/retention path; `object-sink.ts:161` deletes only to undo a failed put. A bucket lifecycle rule on DigitalOcean was NOT read.
- **The ticket sheet's Delete** is a history-retaining removal with an undo (owner ruling 2026-09-20; `Features.md:82`).
- **Tables**: the migrations create 28 tables (`attachments events invite_tokens mcp_device_codes mcp_tokens notifications proj_contested proj_entity_heads proj_invites proj_memberships proj_note_attachments proj_note_comments proj_note_lexemes proj_note_search proj_notes proj_projects proj_rollups proj_search proj_ticket_comments proj_ticket_types proj_tickets proj_visibility proj_workflows proj_workspace_settings search_note_chunks snapshots user_notification_preferences user_preferences`).

## 4. Event vocabulary

New types, each v1, each `.strict()`, filed against the entity it names:

| Type | Entity | Payload | Meaning |
|---|---|---|---|
| `workspace.archived` / `workspace.restored` | workspace | `{}` | T8. Mirrors the project pair exactly (same docblock argument: a pair, not a toggle). |
| `workspace.deleted` / `workspace.undeleted` | workspace | `{}` | Soft delete / restore of the whole workspace (T10). |
| `project.deleted` / `project.undeleted` | project | `{}` | Soft delete / restore of the project and its contents. |
| `purge.marked` / `purge.unmarked` | the item (workspace, project, ticket, note) | `{}` (both) | T9. The purge date is DERIVED, never claimed: `dueAt` = the mark event's `server_time` + 15 days, computed by every reader from the ledger. The empty `.strict()` payload is what refuses a client trying to supply its own date. |
| `purge.completed` | the item | `{ kind, markedBy, markedAt }` | The tombstone (§5.3). Content-free by construction: no title, no name, no body. Written only by the purge function. |

- Restore names: the ticket and note pairs already use `*.restored` for undelete; the project and workspace pairs already use `*.restored` for UNARCHIVE. To keep one type = one meaning, the new undelete events for project and workspace are `*.undeleted`. The ticket/note `*.restored` keep their names (renaming live types is not worth a migration).
- **Refusals.** `purge.marked` refuses an item that is not soft-deleted ("Delete it first") and one already marked; `purge.unmarked` refuses one not marked, and one whose `dueAt` has passed (the purge may already be running). `*.undeleted`/`*.restored` refuse a marked item until it is unmarked (so "restore" never races the purge). Every `*.deleted` refuses an already-deleted item.
- **Authority (T3).** Workspace: delete/undelete/mark/unmark/archive/restore = the workspace **owner** only. Project: delete/undelete/mark/unmark = workspace admins and owner (the archive gate's set, `ADMIN_ONLY_TYPES`). Ticket: project admins (the existing `ticket.deleted` rule). Note: the existing `NOTE_AUTHOR_EVENTS` rule. `purge.marked`/`unmarked` inherit the authority of the item's own delete.
- **Containment.** A child inside a deleted parent is "deleted by containment": hidden, not separately listed, not separately markable. Marking a parent marks its whole subtree for the same `dueAt`. A child that was deleted on its own BEFORE its parent keeps its own row and its own mark state; if the parent is purged first, the child goes with it.

## 5. The purge

### 5.1 Scheduler

A sweep modelled on the existing ones (`apps/server/src/auto-close/sweep.ts`, `apps/server/src/notifications/sweep.ts`; which process hosts it is the plan's reading) runs every hour: `SELECT` items with a `purge.marked` whose `dueAt <= now()` and no later `purge.unmarked`/`purge.completed`. Each item is purged in its own transaction; a failure alerts through the existing error alerter (`apps/server/src/alerts/error-alerter.ts`) and is retried on the next sweep. The sweep is idempotent: an item already purged is skipped.

### 5.2 The sanctioned function

- `events_append_only()` is replaced by a version that allows `DELETE` and `UPDATE` **only** when the transaction-local setting `gisik.purge` equals the id of the item being purged, and the setting is set **only** inside `purge_item(kind, id)`, a `SECURITY DEFINER` function owned by the migration role. Every other path keeps the existing refusal and its message. TRUNCATE stays refused unconditionally.
- `purge_item` computes the **erasure set**: the item, plus everything it owns (a workspace → its projects, tickets, notes, workflows, ticket types, settings, invites, memberships; a project → its tickets and project-scoped notes; a ticket → its sub-tree of child tickets, its comments; a note → its comments). It then, in one transaction:
  1. deletes every `events` row whose `(entity_kind, entity_id)` is in the set, **except** each ticket's `ticket.created` row, which is **redacted in place** to `{ projectId, purged: true }` (§5.4);
  2. deletes the set's rows from every projection, search, snapshot and notification table (§5.5);
  3. applies the stub rule to survivors (§5.6);
  4. appends one `purge.completed` event per top-level item.
- Attachment objects (Spaces) are deleted AFTER the commit, from the attachment keys the transaction collected; a failed object delete is retried by the next sweep from a small `purge_pending_objects` table, so a crash cannot strand a file with no row pointing at it.

### 5.3 The tombstone

`purge.completed { kind, markedBy, markedAt }` is the only trace in the ledger: "a workspace was purged, marked by Kiro on 23 Sep". No name, no title — the whole point is that the content is gone. It lives in the workspace's stream (for ticket/note/project purges) or, for a workspace purge, in a system stream the owner's account reads.

### 5.4 Ticket keys stay stable

Because keys are counted from `ticket.created` rows (§3), the purge **keeps each purged ticket's `ticket.created` row with a redacted payload** `{ projectId, purged: true }` rather than deleting it. The number slot survives, so `SHOP-8` stays `SHOP-8` after `SHOP-7` is purged; `SHOP-7` is never reissued. Every reader of `ticket.created` payloads (projections, replay, the replica, `verify-projections`) must accept the redacted shape and produce no ticket from it — the plan enumerates them. A whole-project or whole-workspace purge deletes the `ticket.created` rows too (no survivor can be renumbered).

### 5.5 Every table has a purge rule — and a guard that proves it

The plan's first task enumerates every table (28 today, §3) and assigns each a rule: *erase rows in the set*, *stub*, or *not entity-bearing*. A guard test reads `information_schema.columns` for any column named `workspace_id`, `project_id`, `ticket_id`, `note_id`, `entity_id` and fails when a table carrying one has no rule — so a table added next month cannot silently keep purged data.

### 5.6 Survivors (T5)

- A `ticketRef` chip or `wikiLink` in a surviving comment or note body whose target is purged renders **"Deleted item"** (no key, no title, no link). The stored document is not rewritten; the renderer resolves the id and finds nothing. Search indexes (which store rendered text) are re-derived for the affected surviving rows so the purged title stops matching.
- A surviving note attached to a purged ticket is detached: its `proj_note_attachments` row goes; the note is untouched.
- A surviving child ticket whose parent is purged cannot exist (children are in the erasure set); any surviving ticket-to-ticket link to a purged ticket (whatever link kinds the tree has — the §5.5 enumeration names them) is dropped from the projection.
- `verify-projections` must stay green after a purge: live and rebuild both read the post-purge ledger, so they agree. The plan adds a case that purges and then runs the verifier.

### 5.7 Offline devices

The replica receives `purge.completed` through normal sync and deletes every local row and local event for the erasure set (it recomputes the set locally from its own tables, then applies the same survivor rules). A device offline for longer than the purge window resyncs from a snapshot that no longer contains the item. A device holding **unsent** events against a purged item has them refused at the door ("This item was permanently deleted") and dropped from its outbox with a visible notice — never silently.

### 5.8 Backups (T4)

The backup daemon gains a prune step after each successful backup: delete backup objects older than `BACKUP_RETENTION_DAYS` (default 30). The prune never deletes the newest successful backup, whatever its age. The DigitalOcean bucket's own lifecycle rules are read before the plan is written and recorded (if one already expires objects, the plan says so and does not duplicate it).

## 6. UI

### 6.1 The delete confirmation dialog (T7) — every delete

One shared component used by every delete door (ticket sheet, note page, project, workspace):

- Title: "Delete <kind> “<name>”?"
- A **switch**, off by default: **"Delete permanently"**.
- Small note under it, always visible: **"Deleted items sit in Deleted items on your Account page, where you can restore them. Deleting permanently marks the item to be purged for good after 15 days — you can unmark it there any time before then."**
- Buttons: **Cancel** (default focus), **Delete** (destructive). With the switch on, the destructive button reads **"Delete permanently"**.
- Workspace delete additionally requires typing the workspace name (it removes the workspace from every member).
- Submitting sends `*.deleted`, and with the switch on also `purge.marked`, in **one** ingest batch, deleted first.
- The ticket sheet's existing post-delete **undo** (ruling 2026-09-20) stays for a soft delete; after a permanent delete the undo is offered as "Undo" and sends `purge.unmarked` + `ticket.restored`. This **adds a step** to the 2026-09-20 delete flow (a dialog before it) — recorded as a deliberate change to that ruling.

### 6.2 Archive and delete on the cards

- **Workspace card** (`/workspaces`): an overflow menu with **Archive** (owner) / **Restore**, and **Delete…** (owner). Archived workspaces move to a collapsed **"Archived"** group below the live ones (how the workspace home presents archived projects was not read; the plan reads it and matches it).
- **Project** (workspace home / project page): **Delete…** beside the existing Archive, for workspace admins.

### 6.3 Account page — Deleted items

A new section on `/account`, **"Deleted items"**:

- A list of every soft-deleted item this person has authority over (T3), newest first: kind icon, name/title, where it lived (workspace › project), who deleted it and when.
- Children of a deleted parent are not listed separately; the parent's row says "and 42 items inside".
- Per row: **Restore**, and **Mark for permanent deletion** / **Unmark**. A marked row shows **"Permanently deleted on 8 Oct"** (the `dueAt` as an IST day).
- Empty state: "Nothing deleted."
- The list is a server read (`GET /v1/me/deleted-items`); the replica serves it offline from its own tables.

## 7. Error handling

- Every refusal in §4 reaches the UI through the existing refusal copy path; the dialog shows it inline and keeps the dialog open.
- A purge sweep failure: logged, alerted, retried next sweep; the item stays in Deleted items as "Permanently deleted on …" (overdue) until it succeeds.
- An object-store delete failure: retried from `purge_pending_objects`; never blocks the ledger transaction.

## 8. Testing (the plan pins case ids)

- Vocabulary: each new type accepts its payload and refuses a stranger's field; `purge.marked` refuses a client `dueAt`.
- Authority: each door refused for the wrong role, accepted for the right one (one fixture per kind).
- Purge: after `purge_item`, **no row in any table** carries an id from the erasure set (the §5.5 enumeration drives it); `purge.completed` is the only new row; a later ticket's key is unchanged (mutation: delete the `ticket.created` row instead of redacting → the key shifts → red); `verify-projections` green.
- The trigger: a plain `DELETE FROM events` still raises; the same statement inside `purge_item` succeeds (mutation: allow when the setting is merely non-empty → a second item's row can be deleted → red).
- Survivors: a comment chip to a purged ticket renders "Deleted item"; its search no longer matches the old title.
- Replica: applying `purge.completed` removes the local rows; an outbox event against a purged item is refused with the notice.
- Backups: prune deletes objects older than the window and never the newest (fake clock).
- UI: the dialog's switch, note text, button label flip, one-batch order; the Deleted items list, restore, mark/unmark, the date line.
- Browser (dev stack, 🧪 until run): delete a ticket permanently → it appears marked in Deleted items → unmark → restore → it is back on the board.

## 9. Out of scope

- A per-workspace "Deleted items" admin console (T3's per-person list covers it).
- Scrubbing existing backups (T4 option C, rejected).
- Changing the 15-day window per workspace.
- Erasing a USER account (a different request: members' events across workspaces).

## 10. Risks the plan must measure before it builds

- Every reader of `ticket.created` payloads, server and replica, tolerating the redacted shape (§5.4).
- The replica's local erasure-set computation matching the server's (a disagreement leaves data on a device).
- `SECURITY DEFINER` on DigitalOcean managed Postgres: the migration role can create it (measure in a scratch DB on the cluster, as the `vector` pre-flight was measured).
- The bucket lifecycle reading (§5.8).
