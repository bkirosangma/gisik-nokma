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
