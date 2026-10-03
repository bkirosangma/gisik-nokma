# §28 — Drafts

**Opened 2026-10-03 by the drafts plan Task 1** (`docs/superpowers/plans/2026-10-03-drafts.md`; spec `docs/superpowers/specs/2026-10-03-drafts-design.md`, Workflow and Timeline series spec 1). Mirrors `Features.md` §25. Ships on `release/workflow-graph`.
3-DIGIT PADDED `28.001`–`28.199`, one block per task (the plan's Global Constraints is the authority):

| Block | Task |
|---|---|
| 28.001–28.019 | T1 domain: events, refine, state, reducer, vocabulary census |
| 28.020–28.044 | T2 keys and purge: numbering query, migration, redaction |
| 28.045–28.069 | T3 projections, the four predicates, the census (groups A to C) |
| 28.070–28.089 | T4 delivery: doors G1 to G8, stream, bootstrap, reconcile, replica |
| 28.090–28.109 | T5 publish and discard: rules, fanout, erasure, sweep (28.102 and 28.105 are written by T6; 28.103 and 28.104 by T5b) |
| 28.110–28.129 | T6 links and parent/child relations touching a draft (28.128, 28.129: owner ruling O1) |
| 28.130–28.149 | T7 MCP |
| 28.150–28.179 | T8 app: dialog, Drafts page, sheet, phone, offline |
| 28.180–28.194 | T9 attachments on drafts, notes, rank on publish |
| 28.195–28.199 | free, for follow-ups |

Legend: ✅ covered by a test · ❌ not yet · 🟡 partial · 🧪 manual · 🚫 out of scope, with a reason.

**Owner ruling (2026-10-04), the sentence every case in this file is checked against:** a draft leaves NO trace anywhere outside its author's view until publish (no parent/child on the other ticket, no edges, no counts, no notifications), and a discard erases everything.

## 28.1 Domain (T1)

<!-- drafts T1 -->

- ✅ **28.001 — `ticket.created` accepts `draft: true` only with `start: 'backlog'` and no `stateId`:** it is refused with `start: 'focus'`, with `start` absent, with a `stateId`, and with `draft: false`; the refusal message is `a draft is born in the backlog: send start: "backlog" and no stateId`. Control: the same payload without `draft` still parses (a v1 event), with `start: 'focus'` and with `start` absent. Mutation: drop the second `.refine` → the `start: 'focus'` arm parses.
- ✅ **28.002 — `ticket.published` is strict `{projectId: ULID}` and `ticket.discarded` is strict `{}`;** both registered at version 1 against entity kind `ticket` only, each once in `registrations()`. Control: `parseEvent` accepts both on a ticket and refuses both on a note with `entity-kind-mismatch`. Mutation: drop `.strict()` from `ticketPublishedPayload` → the extra-member arm parses.
- ✅ **28.003 — the reducer: a draft creation sets `draft = {authorId, at}` from the envelope (actor and server time), stays in Backlog with `rank: null`; `ticket.published` removes the key and re-pins `workflowId` / `workflowVersion` to the type's CURRENT binding while the state stays Backlog;** control: a ticket whose type was re-pointed while it was a draft ends on the NEW workflow, and a ticket created without `draft` has no `draft` key (`'draft' in state === false`) and is unchanged by the same type re-point. Mutation: skip the re-pin → the new workflow id is not reached.
- ✅ **28.004 — `ticket.discarded` sets `draft.discarded = true` and keeps `authorId` and `at`; `ticket.published` and `ticket.discarded` on a ticket that is not a draft throw, naming the ticket;** control: both fold on a draft, and `isDraft` / `isDiscardedDraft` read the flag (`isDraft` stays true after a discard so every door can tell "gone" from "published").
- ✅ **28.005 — THE CENSUS (server) now covers the draft pair:** both types are in `TICKET_EVENT_TYPES` (so the census of 27.004 stays empty), `payloadIds('ticket.published', {projectId})` names the project, `payloadIds('ticket.discarded', {})` names nothing, and a committed `ticket.discarded` notifies nobody (owner ruling 2026-10-04: a discard leaves no trace). Control: the planted type is still reported. Mutation: remove `'ticket.published'` from `TICKET_EVENT_TYPES` → red naming it.
- ✅ **28.006 — History narrates the pair:** a `ticket.created` with `draft: true` reads `Drafted as <Type>`, `ticket.published` reads `Published`, and `ticket.discarded` reads `Discarded` (never shown: the stream is erased, but the census of 3.183 wants every type narrated). Control: a `ticket.created` without `draft` still reads `Created as <Type>`. Mutation: ignore `draft` → the first arm reads `Created as`.
- ✅ **28.007 — the author's allowlist:** `draftAllows` is true for exactly the eight allowlisted types and the exempt bookkeeping types, and every other ticket-scoped registration is refused with `A draft cannot be <verb>. Publish it first, or discard it.` (`ticket.deleted`: `A draft cannot be deleted. Discard it instead.`). The CENSUS partitions the registry's ticket-scoped types into allowed, exempt and refused, so a new ticket type must pick a side; control: a planted `ticket.planted_for_census` is reported as unclassified. Mutation: add `ticket.transitioned` to `DRAFT_ALLOWED_EVENT_TYPES` → red naming it.
- ✅ **28.008 — the live-ticket gate refuses both on a deleted ticket** (`deleted-ticket`) and the E6-2 table covers the new registrations (so a ticket-scoped type that picks neither side fails the case). Control: the same events pass the gate on a live twin.
- ✅ **28.009 — `TICKET_EVENT_TYPES` has nineteen members and both draft types are in it;** control: the registry check in the same `it` still holds for every member. (`packages/domain/test/ticket-state.test.ts`)

## 28.2 Keys and purge (T2)

<!-- drafts T2 -->

- ✅ **28.020 — parity:** on a ledger with no draft event, `ticketNumbers` and `ticketIdsAtNumber` return exactly what the old `type = 'ticket.created'` query returned, for every ticket, including one whose creation was purged (redacted; the test asserts the redaction happened). Control: the old query is run in the same `it` and the two maps are compared whole. (`apps/server/test/read/ticket-key-drafts.test.ts`)
- ✅ **28.021 — a draft takes no number:** draft X1, then ticket Y2, then publish X1 → Y2 is #1 and X1 is #2; a draft that was never published has no number. Control: the same creates without `draft` number X1 #1, Y2 #2. (`apps/server/test/read/ticket-key-drafts.test.ts`)
- ✅ **28.022 — a discarded draft leaves no gap:** D1 (draft), T2, discard D1 (the ledger purge), then T3 → T2 is #1 and T3 is #2, and D1's creation is redacted WITH `draft: true`. (`apps/server/test/purge/draft-keys.test.ts`)
- ✅ **28.023 — purge failure (1):** purging an UNPUBLISHED draft, then creating a ticket, leaves that ticket's number unchanged by the redacted row. Control: purging a non-draft keeps its slot. Mutation: redact a draft creation without `draft: true` → the number moves (the case reds). (`apps/server/test/purge/draft-keys.test.ts`)
- ✅ **28.024 — purge failure (2):** purging a PUBLISHED draft-born ticket keeps every later ticket's number, and the purged ticket still holds its own slot. Mutation: delete the `ticket.published` row in `purge_ledger` → the later tickets shift down. (`apps/server/test/purge/draft-keys.test.ts`)
- ✅ **28.025 — the trigger accepts exactly three redactions and nothing else:** `ticket.created` to `{projectId, purged: true}`, a DRAFT `ticket.created` to `{projectId, purged: true, draft: true}`, and `ticket.published` to `{projectId, purged: true}`. It refuses a draft creation redacted WITHOUT the marker, a non-draft creation redacted WITH it, a `ticket.published` redacted with `draft`, an extra member, another project, and every UPDATE or DELETE outside a purge, each with the original message `events is append-only: <OP> refused`. (`apps/server/test/purge/draft-keys.test.ts`)
- ✅ **28.026 — the domain vocabulary:** `redactedTicketCreatedPayload(projectId)` is `{projectId, purged: true}` and `(projectId, true)` adds `draft: true` (still a redacted creation to `isRedactedTicketCreated`); `redactedTicketPublishedPayload(projectId)` is `{projectId, purged: true}`; `isRedactedTicketPublished` is true exactly for a `ticket.published` with `purged === true`. `applyTicketEvent` refuses a redacted published row BY NAME and `foldTicketEvent` returns the input state for it (undefined, or an existing ticket's state untouched). Control: an ordinary `ticket.published` still folds. Mutation: `purged: 'true'` (a string) is not redacted. (`packages/domain/test/ticket-draft-purge.test.ts`)
- ✅ **28.027 — every reader of a purged draft-born ticket produces nothing from its redacted rows:** the `proj_tickets` projection writes no row from a redacted `ticket.published`, neither do `proj_visibility` and `proj_search`, the snapshot fold returns null for a ticket whose creation and publish are both redacted, and `verifyProjections` is clean over a ledger holding one. Control: the sibling ticket keeps its rows and its number (Y1 = 1, X = 2 from its publish, Y2 = 3). (`apps/server/test/purge/redacted-published.test.ts`)
- ✅ **28.028 — the schema:** `proj_tickets` has `draft_author_id`, `draft_at`, `draft_discarded`; `proj_visibility` has `draft_author_id`; both partial indexes exist on `(workspace_id, draft_author_id) WHERE draft_author_id IS NOT NULL`; every column is NULL on the projected rows of a pre-draft ledger (the rows are asserted to exist). Control: no other table in the schema has a `draft_*` column. (`apps/server/test/read/ticket-key-drafts.test.ts`)

## 28.3 Projections and the privacy predicates (T3)

<!-- drafts T3 -->

- ✅ **28.045 — the projections carry the flag:** `proj_tickets.draft_author_id/draft_at/draft_discarded` and `proj_visibility.draft_author_id` are set by `ticket.created {draft:true}` (author = the event's actor), the discard sets `draft_discarded`, `ticket.published` clears all of them in both tables and re-pins the workflow; `rowToTicketState(row)` equals the reducer's state for a draft, a published draft and a discarded draft; `verifyProjections` is clean over a ledger holding all three. Control: a ticket created without `draft` has NULL in every draft column. (`apps/server/test/projections/tickets-draft.test.ts`)
- ✅ **28.046 — `canSeeResolved` closes a draft for everyone:** owner, admin, member who is the author, another member, a guest named in an explicit list: all `false` when `draftAuthorId` is set, in every resolved mode. Control: the same inputs with `draftAuthorId: null` are `true` for the owner, the admin, both members and the guest exactly as before. (`apps/server/test/visibility/draft-predicates.test.ts`)
- ✅ **28.047 — `canSee` closes it before the owner case and the assignee arm:** with a draft by A in a project-mode project, `canSee` is false for A, a member, an admin, the owner, the draft's assignee and a guest; a published ticket with the same audience and assignee is visible to each as before. The draft's assignee has the assignee arm for the PUBLISHED twin and not for the draft. (`apps/server/test/visibility/draft-predicates.test.ts`)
- ✅ **28.048 — `visibleTicketsWhere` agrees with `canSee` on drafts:** over the draft world (a draft, a draft in `doing`, a root draft, a guest-named draft, two published tickets) and every role, the SQL membership equals `canSee` for every ticket, the owner's constant branch included. Mutation: drop `v.draft_author_id IS NULL` from the owner branch → the owner row reds. (`apps/server/test/visibility/draft-predicates.test.ts`)
- ✅ **28.049 — `LIVE_TICKET_WHERE` closes a draft and `LIVE_BASE_WHERE` does not:** `ticketIsLive` is false for a draft and true for its published twin; a query using `LIVE_BASE_WHERE` returns the draft; `LIVE_TICKET_WHERE` is exactly `LIVE_BASE_WHERE` plus the draft clause. Control: a soft-deleted ticket is closed by both. (`apps/server/test/visibility/draft-predicates.test.ts`)
- ❌ **28.050 — the census:** every `proj_tickets` / `proj_visibility` SQL literal and every `canSee(`, `canSeeResolved(`, `getResolvedVisibility(` call in `apps/server/src` is accounted for in groups A to E, per file and per kind; a site in no group, or a count that moved, fails naming the file. Control: a planted source that reads `proj_tickets` is reported, and prose that merely names the table is not.
- ✅ **28.051 — the board** never carries a draft, the author's role and the planted draft in `doing` included. Control: with the flag cleared the same request shows it. (`apps/server/test/routes/draft-closed-reads.test.ts`)
- ✅ **28.052 — the project list, the workspace ticket list, Backlog and the text filter** never carry a draft (same control). (`apps/server/test/routes/draft-closed-reads.test.ts`)
- ✅ **28.053 — search** never returns a draft by title or by a key-shaped query: a project with a draft created first and two tickets after it numbers them 1 and 2, `<key>-3` finds nothing, `<key>-1` finds the first ticket. (`apps/server/test/routes/draft-closed-reads.test.ts`)
- ✅ **28.054 — My Work** never lists a draft assigned to the viewer, the author's own root draft included (same control). (`apps/server/test/routes/draft-closed-reads.test.ts`)
- ✅ **28.055 — Attention** never carries a draft that is overdue or stale and assigned to the viewer (same control). (`apps/server/test/routes/draft-closed-reads.test.ts`)
- ✅ **28.056 — Home and workspace-card counts** (`GET /v1/me/workspaces`: `ticketCount`) exclude drafts: the count with the flag cleared exceeds the count with it set by exactly the number of drafts the viewer could otherwise see. (`apps/server/test/routes/draft-closed-reads.test.ts`)
- ✅ **28.057 — the single-ticket reads** (detail, events, comments, attachments list, notes of a ticket, ticket history, the bootstrap ticket list) answer the not-found response for the owner, an admin and the assignee. The author's answer is T4's. Control: with the flag cleared the owner gets 200 on each. (`apps/server/test/routes/draft-closed-reads.test.ts`)
- ❌ **28.058 — the stored rollup does not count a draft (C1):** a parent with one published and one draft child holds `total_children = 1`; publishing the draft makes it 2; deleting the only published child of a parent that still has a draft child removes the parent's row (it does not go stale). Control: a parent whose other child is published keeps its row.
- ❌ **28.059 — the viewer's rollup and `restrictedCount` do not count a draft (C2):** over the draft world's parent every viewer gets `{ total: 2, restrictedCount: 0 }`, not `restrictedCount: 2`. Control: with the flag cleared `total` is 4 and `restrictedCount` is still 0 for the viewers who see them.
- ✅ **28.060 — the builder reads:** the guest's actor names do not include the author of a guest-visible draft; state occupancy, the type population and the per-type ticket counts do not count a draft (each exceeds by exactly the number of drafts with the flag cleared). Mutation: drop `k.draft_author_id IS NULL` from `readTicketCounts` → the per-type count case reds. (`apps/server/test/routes/draft-closed-reads.test.ts`)
- ❌ **28.061 — the delete-confirm counts (C3):** deleting a project holding one published ticket and one draft lists `containedCount: 1`. Control: with the flag cleared it is 2.
- ❌ **28.062 — the scope-lost purge list (C4):** an owner re-granted as a member inside one window is told to purge the explicit ticket only the owner bypass reached, and is NOT told another person's draft id. Control: with the flag cleared that id is named.
- ❌ **28.063 — `migrate_ticket_type` (C5):** an owner's migration is not blocked by other members' drafts of the type (it passes the visibility gate and reaches the next rule, `migration.unmapped-state`); an admin who cannot see a published ticket of the type IS blocked (`migration.not-visible`), so the gate is live in the same case.
- ❌ **28.064 — the notification sweeps** never name a draft, with the visibility gate stubbed to allow everything so only the SQL predicate closes it: the due-soon and stale candidate counts differ by exactly the planted draft when the flag is cleared.
- ❌ **28.065 — "in Backlog since" (C7):** a draft created on day 1 and published on day 10 reads state provenance from the publish (day 10, the publisher); `foldTicketHead`'s state claim is the same. Control: a never-drafted ticket keeps its creation instant.
- ❌ **28.066 — a workflow republish folds drafts forward (R40):** after `workflow.defined` version 2 every ticket of the workflow, drafts included, is on version 2.
- ✅ **28.067 — notes attached to a draft:** a note attached to a published ticket and to a draft lists only the published ticket in `attachedTickets` and in the ticket's note list. Control: with the flag cleared both are listed. (`apps/server/test/routes/draft-closed-reads.test.ts`)
- ❌ **28.068 — the reference index skips a draft (errata E1):** a draft whose description (at creation, and again by a later `ticket.field_set`) mentions a published ticket writes no `proj_references` row, so that ticket gains no "Linked from" row and its incoming-reference count does not move; `ticket.published` indexes the then-current description, attributed to the publish (its actor, time and seq), and a description edit after the publish indexes as usual; `ticket.discarded` leaves no row; `rebuildProjection('proj_references')` and the boot backfill give exactly the live rows. Control: the same body on a published ticket writes the row.

## 28.4 Delivery and the doors (T4)

<!-- drafts T4 -->

## 28.5 Publish and discard (T5, T5b)

<!-- drafts T5 -->
<!-- drafts T5b -->

## 28.6 Links touching a draft (T6)

<!-- drafts T6 -->

## 28.7 MCP (T7)

<!-- drafts T7 -->

## 28.8 App (T8)

<!-- drafts T8 -->

## 28.9 Attachments, notes and rank on publish (T9)

<!-- drafts T9 -->
