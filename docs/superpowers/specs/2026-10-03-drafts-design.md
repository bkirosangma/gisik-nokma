# Drafts (Workflow and Timeline series, spec 1) — design

**Date:** 2026-10-03.

**Base:** `origin/release/knowledge-graph` @ `4cc486ca`, where the code below was read. Spec A (typed links) is read from its design doc and from `origin/task/kg-a-t1-events`; it is planned, not landed.

**Target branch:** a NEW release branch cut after the Knowledge Graph release ships (owner, 2026-10-03). One release branch at a time: this spec lands as a doc in `release/knowledge-graph`; no code starts before the next release branch exists.

**Status:** the owner reviewed this spec on 2026-10-03 and ruled on it; the rulings are applied below (list under "Owner's words and rulings"). The design is decided; where the code makes a decision hard, §16 says so with `file:line`. Open-question numbers are stable: the resolved ones are gone from §16 and listed as rulings here.

**Series** (this series; the Knowledge Graph series A–E is separate):

| Spec | Subject | Depends on |
|---|---|---|
| 1 (this) | Drafts: private tickets with no key until published | A (links), for §10 only |
| 2 | Workflow graph and Timeline graph (owns `publish_flow`, the graph UI, "leads to", Decision type) | 1, A |
| 3 | MCP sweep 2 | — |

Plans go in the order 1 → 2. Spec 2 builds on the primitives in this spec (§7.4 states exactly what it may rely on).

**Owner's words and rulings (2026-10-03):**
- "Tickets can be created in Draft mode. A draft is PRIVATE to its author until published (not on boards, lists, search, My Work, attention, notifications, Home counts, the Knowledge Graph, or MCP reads by anyone else)."
- "Keys only when publish." A draft has no ticket key and shows "Draft". Ticket keys are counted and never reused, so a draft never consumes one. Publishing assigns the next key.
- Tickets created inside the Workflow or Timeline graph are drafts; the graph has "Publish flow" (spec 2).
- MCP: `create_ticket` gains a draft flag; new `list_my_drafts`, `publish_draft`, `discard_draft`. Spec 2 owns `publish_flow`.
- Rule D2 (owner): every MCP write is visible in the app, attributed, and removable by a member.
- **Owner rulings on review (2026-10-03):**
  1. A draft appears only on a **Drafts page (nav entry)**, the sheet and the graphs, not on boards or lists.
  2. A draft is invisible to everyone but its author, **including the workspace owner and the assignee**.
  3. "They can attach on draft (but permanently removed on discard, if they were uploaded from the draft)." A draft **can take attachments**. On discard, attachments uploaded FROM the draft are permanently erased (object and rows); anything that existed before (for example a note linked to the draft) is only unlinked, never erased. **Comments still open only after publish.**
  4. Discard **erases now**, after a confirm dialog (not the 15-day Deleted items).
  5. After publish the **full history**, drafting edits included, is the ticket's history.
  6. A published draft lands at the **END of the Backlog** (publish writes a rank).
  - Planner reconciliation (the blockquote in §1): links that touch a draft live on the DRAFT's stream until an atomic publish; `ingestAtomic` is accepted.
- Mockup copy (approved): "3 drafts in this flow. Only you can see them. Publishing makes every draft a Backlog ticket." Legend: "Draft, only you see it". A dashed outline and a "Draft" pill mark a draft.

**Decisions taken in this spec** (the rulings above settle D4, D6, D9 and D10; the rest follow from them). Each that could reasonably go the other way is in §16.

| # | Decision |
|---|---|
| D1 | A draft is a **ticket** with a flag, not a new entity kind. It has a ticket stream, so edits, links and the graph work unchanged. |
| D2 | **Events:** `ticket.created` gains an optional `draft: true`; new `ticket.published {projectId}`; new `ticket.discarded {}`. |
| D3 | **The key is counted from the publish event** (§6). A draft's `ticket.created` is not a numbering row. |
| D4 | **A draft is invisible to everyone but its author, including the workspace owner and the assignee** (§4; owner ruling 2). This overrides two existing grants. |
| D5 | **A draft is always born in Backlog** and publishes as a Backlog ticket (the approved copy). |
| D6 | **Discard erases, after a confirm** (owner ruling 4). A draft has no key and has never been shared, so unlike a trashed ticket its events can be truly erased, and the attachments uploaded from it with them (§8). |
| D7 | **A single publish is one event. A set of drafts publishes atomically through one new online route and one new ingest primitive, `ingestAtomic`** (§7.4); a failure commits nothing. Spec 2's need D-4 is met this way. |
| D8 | **Drafts reach other places only through named "doors"** (§4.2, group D). Every other read path stays closed without being edited, because the shared predicates close it. |
| D9 | **A draft takes attachments** (owner ruling 3, R56-R63); comments and collaborators wait for publish. |
| D10 | **Publish writes a rank** so the ticket lands at the end of the Backlog (owner ruling 6, R64-R65). |
| D11 | **Links that touch a draft are filed on the draft's stream** through one additive `from` member on spec A's link payloads, and re-filed on the source's stream at publish inside the same transaction (planner reconciliation; §10). |

> **Planner reconciliation (2026-10-03), drafts Q4 ↔ graphs D-3 / open question 7:** a link that touches a draft lives on the DRAFT's stream while the draft exists (the structural fix, not a per-viewer filter). Spec A's `ticket.link_added` gains an optional, additive direction member (`from`) so the draft can carry an outgoing OR incoming link; the published ticket's stream gets nothing until publish. At publish the link is re-filed on its source's stream inside the same atomic publish (drafts §7.4). This lands in the Drafts plan as an additive payload change; spec A's T1 (`origin/task/kg-a-t1-events`) is not reopened. Atomic publish (`ingestAtomic`, drafts Q13) is accepted by the planner as the only way to meet D-4.

## 1. What exists today (read on the base)

**How a key is made.** The number in `GN-142` is not stored. It is the ticket's position among its project's `ticket.created` rows, ordered by `workspace_seq`:
- `apps/server/src/read/ticket-numbers.ts:104-111` (`ticketNumbers`) and `:152-159` (`ticketIdsAtNumber`) run `row_number() OVER (PARTITION BY payload->>'projectId' ORDER BY workspace_seq)` over `type = 'ticket.created'`;
- the docblock gives the wall: the ledger cannot be given a number after the fact (`events_append_only`), and a stored number would fail `verify-projections` (`ticket-numbers.ts:1-30`);
- every caller treats a missing number as "no key" (`read/ticket-cards.ts:303-313` `composeCardKey`; `routes/tickets.ts:583-587`; `read/deleted-items.ts:184-197`). This is what lets a draft show no key without a special case.

**What a purge keeps.** `purge_ledger` deletes every event of a ticket except `ticket.created`, which it redacts in place to `{projectId, purged: true}` so no later key shifts (`apps/server/migrations/1790600000000_purge-engine.sql:86-93`). The append-only trigger allows only that exact redaction (`:134-140`). TS mirrors: `packages/domain/src/purge.ts:27` `redactedTicketCreatedPayload`, `:38` `isRedactedTicketCreated`.

**Who can see a ticket.** One decision, written twice:
- TypeScript `canSeeResolved` (`apps/server/src/visibility/can-see.ts:120`) and `canSee` (`:283`): audience first, then the assignee arm (`:289-292`). The workspace owner sees everything (`:127`, disclosed owner decision 2026-08-27).
- SQL `visibleTicketsWhere` (`apps/server/src/read/visible-where.ts:136`): owner compiles to `TRUE`, others to audience OR assignee arm (`:138-139`). Requires `proj_visibility` as `v`.
- Soft delete is a separate predicate, `LIVE_TICKET_WHERE` (`visible-where.ts:231`), requiring `proj_tickets` as `t`. Its own docblock records that a sweep for it is only as complete as its pattern: it counted 14 uses, then found 4 longhand sites and a TypeScript one (`visible-where.ts:189-215`). This spec's census (§4.2) is built to avoid repeating that.

**How events reach a device.**
- The stream: `visibleEventsFor` (`visibility/visible-events-for.ts:442`) asks `canSee` per ticket event (`:493`). Events at or below the reader's cursor are never re-sent; a widening of reach is announced by a `reach-granted` notice that makes the device pull (`visibility/grant-backfill.ts:153` `GRANT_BACKFILL_TRIGGERS = ['visibility.set','ticket.reparented','ticket.assigned']`).
- Bootstrap: `/v1/sync/bootstrap` lists `listVisibleTickets` (`sync/sync-routes.ts:497`) and pulls each with `bootstrapTicket` (`:201`); `/v1/sync/bootstrap/ticket` gates on `canSee` (`:434`).
- Reconcile: a device names the ids it holds and is told which it may no longer hold, by `canSee` (`sync/reconcile-route.ts:153`).

**How events are committed.** `ingestAll` (`ingest/ingest-service.ts:432`) commits each event in its OWN transaction, in order (`commitOne`, `:166`). The gate order inside one commit is: purge check, permission (`checkPermission`), contest coherence, rule engine, server gates, insert, projections (`:255-330`). There is no batch atomicity.

**Permission for ticket events.** `checkVisibilityPermission` (`permissions/check-permission.ts:1596`): `ticket.created` needs the project (`:1604-1635`), everything else on a ticket needs `canSee` (`:1639`). Guests cannot create (`:844`).

**Creation rules.** `checkTicketCreated` (`packages/rule-engine/src/checks/hierarchy.ts:53`): unknown type, creatable state, parent exists / same workspace / not deleted / same project / rank / not terminal (`:95-183`); the deepest rank must have a parent (`:132`). `checkTicketLive` refuses edits to a deleted ticket (`checks/deletion.ts`, `LIVE_GATE_EXEMPT`).

**Where a ticket is created today.** The New ticket dialog (`packages/app-core/src/views/new-ticket-dialog.tsx`) via `create-ticket-flow.tsx:315`; MCP `create_ticket` (`packages/mcp-server/src/tools/write-tools.ts:59`, defaults to `start:'backlog'`); the sheet's sub-ticket path (`views/ticket-sheet.tsx:2604`). The dialog already has a type named `NewTicketDraft` (form values, `new-ticket-dialog.tsx:79`). **That is not this spec's Draft.** §3.1 fixes the naming.

## 2. The model

### 2.1 States

```
            ticket.created {draft:true}          ticket.published
 (nothing) ─────────────────────────────▶ DRAFT ─────────────────▶ TICKET (Backlog, keyed)
                                            │
                                            │ ticket.discarded
                                            ▼
                                        ERASED (events gone, id in purged_entities)
```

A draft never goes back to being a draft. A published ticket is deleted, trashed and purged by the existing rules, unchanged.

### 2.2 Events

All three are registered against entity kind `ticket`, version 1.

```ts
// ticketCreatedPayload gains ONE optional member (packages/domain/src/events/ticket-events.ts:42)
draft: z.literal(true).optional()   // absent = published at birth: what every stored event meant
// and one more .refine beside the start/stateId one at :153:
//   draft === true  ⇒  start === 'backlog'  AND  stateId === undefined
//   message: 'a draft is born in the backlog: send start: "backlog" and no stateId'
export const ticketPublishedPayload = z.object({ projectId: ulidString }).strict();  // the ticket's project
export const ticketDiscardedPayload = z.object({}).strict();
```

- **`ticket.published {projectId}`** carries the project so the key query is ledger-only and a purge can redact it to the same shape as a creation (§6.3). The engine refuses a `projectId` that is not the draft's project (`draft.project-mismatch`).
- **`ticket.discarded {}`** is the client's intent. The server erases the draft after it commits (§8). It is an event so an offline device can queue it in the outbox.
- No new entity kind (`ENTITY_KINDS`, `packages/domain/src/envelope.ts:15`, stays; spec A's test `envelope.test.ts:310` pins it).

### 2.3 Head state

`TicketState` (`packages/domain/src/entity-state.ts:24`) gains one optional member, absent on every non-draft (so no stored snapshot, fixture or `toEqual` changes — the same rule `links` follows in spec A):

```ts
draft?: { authorId: string; at: string; discarded?: true }
```

Reducer (`packages/domain/src/ticket-state.ts:118-258`, `applyTicketEvent`):
- `ticket.created` with `draft:true` sets `draft = { authorId: env.actorId, at: env.serverTime }`; everything else as today (`stateId` = Backlog, `rank: null`).
- `ticket.published` removes `draft` and **re-pins the workflow to the ticket type's CURRENT binding** (`workflowId`, `workflowVersion`; `stateId` stays Backlog, whose category is `open` in every workflow). Why: a draft may sit for weeks, and `migrate_ticket_type` cannot touch it (§4.2 C5); a published draft is "created" under the workflow in force at publish, which is the owner's rule that a ticket pins the workflow it was created under (2026-08-26, quoted at `projections/tickets.ts:31,47`).
- `ticket.discarded` sets `draft.discarded = true` (so every draft door treats it as gone between the commit and the erasure).
- A `published`/`discarded` event on a ticket with no `draft` throws, like the other reducer arms: the engine refuses it first (§3.3).
- `TICKET_EVENT_TYPES` (`ticket-state.ts:84`) gains `ticket.published` and `ticket.discarded` (they fold).

## 3. Rules

### 3.1 Naming

In code and copy, **Draft** means this spec's ticket state. The dialog's form values stay `NewTicketDraft`. New names: `draft` (state), `draftAuthorId` (column and field), `isDraft`, `canOpen` (§4.2, group D). No existing name is reused.

### 3.2 Creating a draft

R1. A draft is `ticket.created` with `draft: true`. It goes through every existing creation gate unchanged — role (guests cannot), the project, the named assignee, `checkTicketCreated` — plus the refine in §2.2.
R2. **Who may create:** the same people as a ticket (members on the project). No new role.
R3. **Parent:** a draft's parent may be a published ticket or the author's OWN draft. Another person's draft as a parent is refused as `hierarchy.unknown-parent` (the same sentence as a parent that does not exist, so it is no oracle). The engine reads the parent's `draft.authorId` against `env.actorId` (`checks/hierarchy.ts:147-157`).
R4. **A published ticket never has a draft parent.** `ticket.created` without `draft`, and `ticket.reparented`, naming a draft parent are refused `draft.parent-is-draft` ("Publish the parent first"). This closes the crumb and the restricted-parent chip (`read/restricted-parents.ts:100`) by rule instead of by code.
R5. The deepest rank still needs a parent (`hierarchy.ts:132`): a graph-made draft of that type must be given one at creation. This is checked at draft creation, not deferred to publish.

### 3.3 What an author may do to a draft (the allowlist)

R6. On a draft, only its author may submit these events: `ticket.field_set` (title, description, priority, start and due date, and any later field such as the Estimate of spec 2), `ticket.assigned`, `ticket.reparented`, `ticket.link_added` / `ticket.link_removed` (spec A; spec 2's kinds; filed on the draft's stream, R42), `attachment.added` (R56), `note.attached` / `note.detached` naming the draft (R66), `ticket.published`, `ticket.discarded`.
R7. Everything else is refused with rule `draft.not-allowed` and a sentence that names the way out: transition, close, reopen, rank, delete/restore, `workflow_rebound`, collaborators, comments, `visibility.set`, contests. (Attachments are allowed, owner ruling 3; comments open after publish.) Examples of the text: "A draft cannot be closed. Publish it first, or discard it." and, for `ticket.deleted`, "A draft cannot be deleted. Discard it instead."
   - Rank is written by the publish (R64), not by the author while drafting: `ticket.ranked` on a draft is refused like the rest.
R8. **Assigning a draft** is allowed to existing members only. It gives the assignee no sight (the assignee arm is closed, §4.1) and sends no notice until publish (§9). The outsider door is closed for drafts: `POST /v1/workspaces/:id/assign-outsider` (`routes/people.ts:161-177`) refuses a draft event or a draft target with `draft.no-outsiders` ("Publish the ticket before inviting someone from outside"), because that door would grant a guest membership as a side effect of a private act.
R9. **Anyone else** who names a draft (any event on its stream, any read of it) gets the same answer as for a ticket that does not exist: `permission.visibility`, `TICKET_NOT_VISIBLE_REASON` (`check-permission.ts:1639-1641`). The workspace owner and admins are included.

### 3.4 Publishing a draft

R10. `ticket.published {projectId}` is accepted only if the ticket is a draft that is not discarded, the actor is its author, `projectId` is its project, and the creation checks still hold against the world as it is now: the type exists and has a workflow, a non-null parent still passes `hierarchy.parent-deleted` / `hierarchy.parent-terminal`, the deepest rank still has a parent. The parent half is the same function `checkTicketCreated` calls (factor it out; do not copy it).
R11. A draft whose parent is itself an unpublished draft is refused `draft.parent-unpublished` ("Publish the parent first"). In a flow, the parent must be published before the child (§7.4).
R12. A published or non-draft ticket gets `draft.not-a-draft`. A discarded one gets `ticket.unknown` (it is gone).
R13. **Authority:** the author alone. The project's admins and the owner cannot publish someone else's draft (they cannot see it).
R14. **Result:** the ticket becomes an ordinary Backlog ticket. Its key is the next number in its project (§6). All of its pre-publish events become part of its history (owner ruling 5), and it is ranked at the end of its project's Backlog (R64).

### 3.5 Discarding a draft

R15. `ticket.discarded {}` is accepted only for a draft, from its author. It then runs the erasure of §8.
R16. There is no Undo after a discard. The app asks first (§12.3). The MCP tool asks the same way (§13).

### 3.6 Attachments and notes on a draft (owner ruling 3)

R56. **A draft takes attachments.** The author uploads with `POST /v1/attachments` naming the draft's `ticketId` (`routes/attachments.ts:325`); the gate at `:412` asks `canOpen` instead of `canSee` (G10), and the file is filed as for any ticket under the object key `w/<workspaceId>/a/<attachmentId>` (`routes/attachments.ts:484`) with a row in `attachments` (`ticket_id` = the draft; `attachments/attachment-repo.ts:49`). The author records it with `attachment.added` (allowlisted, R6). Listing (`routes/tickets.ts:864`) and download (`routes/attachments.ts:627`) are G10 too. Everyone else gets the not-found answer (R9). An upload is an HTTP request, so it needs a connection exactly as for a published ticket.
R57. **Publish keeps them.** The rows and objects do not change; the attachments become visible to whoever can see the ticket, and their `attachment.added` events are part of the history (owner ruling 5).
R58. **Discard erases the attachments uploaded from the draft, objects and rows.** This needs no new erase code: `purgeItem`'s transaction reads the keys with `objectKeysOf` (`purge/erasure.ts:40-52`: every `attachments` row whose `ticket_id` is in the erasure set), deletes the rows (`erasure.ts:85`), queues the object keys in `purge_pending_objects` (`purge/pending-objects.ts:11-20`, inside the transaction), and after the commit `deletePendingObjects` deletes each object from the store (`pending-objects.ts:29-56`; `purge-item.ts:155,160`). A failed delete leaves the key queued with its error and the scheduled sweep drains it (`pending-objects.ts:44-50`; `purge/sweep.ts`), so no object is left without a record. A sub-draft's attachments are in the set too. An attachment row exists from the upload, so one whose `attachment.added` never arrived is erased as well.
R59. **Only what came from the draft is erased.** A note linked to the draft survives with all its content and its own attachments (`attachments.note_id` rows are not in a ticket's set; notes are survivors, `purge/survivors.ts:32`). The link goes: `proj_note_attachments` is `rederive` (`purge/table-rules.ts:147-151`: "a link to a purged ticket goes; the note is replayed so a rebuild agrees") and the note's replay skips tickets in `purged_entities` (`projections/notes.ts:222-241`, `:234`). The same holds for anything else that pointed at the draft and existed before it.
R60. **The confirm says it.** The discard dialog and the MCP preview state the number: "N attachments uploaded to this draft will be permanently deleted" (R16). The draft read (`GET …/drafts`) carries `attachmentCount`.
R61. **Comments** stay closed until publish (`comment.added` refused `draft.not-allowed`), and collaborators too (R7).
R62. **Dev and test stores.** `discardDraft` deletes through the store the server was started with; the scheduled worker already refuses to run without an explicit `OBJECT_STORE` (`purge/sweep.ts:79-86`), which is also what drains leftovers from a discard.
R63. **Verification.** After a discard no row of `attachments` names the draft, `purge_pending_objects` is empty once drained, and the object store holds none of its keys (case 28.183).
R66. **A note linked to a draft.** `note.attached` / `note.detached` naming a draft are allowed to the draft's author (G11) on a note they may edit; the note-side gate (`check-permission.ts:1577-1581`) is unchanged. The event sits on the NOTE's stream, so it cannot live on the draft's: `noteEventVisibleTo(db, viewer, event)` (in `visibility/can-open.ts`) withholds a `note.attached` / `note.detached` whose `ticketId` is another person's draft from the note's stream arm (`visible-events-for.ts:714` area), the note history and events reads, and the note bootstrap tail; publish names the linked notes in the `reach-granted` notice (R21) so their readers pull the events. A note whose visibility is `inherit` widens to the ticket's audience at publish, as attaching it to a ticket does today (`check-permission.ts:1577-1581`: "Attaching is how a note's audience is widened"); until then a draft widens nothing, because `LIVE_TICKET_WHERE` excludes it from the inherit arm (`visible-where.ts:303`). See Q16.

## 4. Privacy

### 4.1 The rule

R17. **A draft's audience is exactly its author.** Not the owner, not an admin, not the assignee, not a project admin. This overrides the owner's disclosed power (`can-see.ts:127`) and the assignee arm (`visible-where.ts:138-139`, `assignee-arm.ts:36,63`); the visibility controls' disclosure text must say that drafts are the exception (owner ruling 2).
R18. **The author is the only person who can open it, and only while they could still create in its project:** a workspace role of owner/admin/member and the project in `eff.projects`. An author demoted to guest, removed from the project or from the workspace no longer reaches their drafts (they stay, closed; Q7).
R19. **The mechanism is one flag, closed in the shared places** rather than a clause per route:
   - `proj_visibility.draft_author_id text NULL` and `proj_tickets.draft_author_id text NULL`, both folded from the same events (the first is the audience mirror every `v`-joined read already has; the second is the head state the engine and the `t`-joined reads have). They are written by the projections in §11 and diffed by `verify-projections`.
   - `canSeeResolved` and `canSee` return `false` for **every** viewer when `draftAuthorId` is set, the author included, **before** the owner case and the assignee arm.
   - `visibleTicketsWhere` and `LIVE_TICKET_WHERE` each AND a `draft_author_id IS NULL` clause, in the constant-`TRUE` owner branch too (no parameter is bound; the "no parameter it does not use" rule at `visible-where.ts:84-92` holds).
   - So a read that already goes through those, or through `canSee`, is closed **for the author as well**. The author reaches a draft only through the named doors (§4.2, group D).

### 4.2 The census: every read path

This is the list the plan builds from. It is grouped by what the path needs. The plan's last task writes a census test (case 28.050) that fails when a `proj_tickets` / `proj_visibility` SQL statement or a `canSee` call appears in `apps/server/src` and is in none of groups A–D; the test lists each by `file:line` so a new site is found by its absence, not by a grep pattern (the lesson of `visible-where.ts:189-215`).

**Group A — the predicates (edit; four places).**

| # | Place | Edit |
|---|---|---|
| A1 | `visibility/can-see.ts:120` `canSeeResolved`; `ResolvedVisibility` (`:20-30` area); `getResolvedVisibility` (`:152`) selects `draft_author_id` | `false` when `draftAuthorId !== null`, first |
| A2 | `visibility/can-see.ts:283` `canSee` | returns before the assignee arm (`:289-292`) for a draft |
| A3 | `read/visible-where.ts:136` `visibleTicketsWhere` (both constant returns and the composed one) | `AND v.draft_author_id IS NULL` |
| A4 | `read/visible-where.ts:231` `LIVE_TICKET_WHERE` | `AND t.draft_author_id IS NULL` |

`ticketAudienceWhere` (`:99`) is the audience table alone and stays unedited: its only other caller is the note inherit arm (`:304`), which is already ANDed with `LIVE_TICKET_WHERE` (`:303`) and cannot attach to a draft (`note.attached` needs `canSee`, `check-permission.ts:1556,1585`).

**Group B — closed by A, no edit (each gets a draft control case).** Verified by reading the call:

| Read path | Site (the predicate it uses) |
|---|---|
| Board | `routes/board.ts:118-119` (LIVE + visible) |
| List, Backlog, Closed; text filter | `routes/list.ts:133-136`; `read/compile-filter.ts:144` (inside the list's WHERE) |
| Search (tickets) and the key lookup | `routes/search.ts:220-227`; `ticketIdsForKey` ids pass the same WHERE (`:209-213` comment); `proj_search` rows exist for drafts and are never read except through this join |
| My Work (assigned, shared, titles) | `routes/my-work.ts:129,138,249,364-367` |
| Attention | `routes/attention.ts:182,192` |
| **Home counts and workspace-card counts** | `read/workspace-counts.ts:85,112` (`visibleProjectCounts`), `:210,226` (`ticketVisibleProjectIds`) |
| Ancestry / epic chain | `read/ancestry.ts:75,92` |
| Notes attached to a ticket | `read/notes.ts:133`; note inherit arm `visible-where.ts:303` |
| Guest actor names | `routes/builder-reads.ts:368` |
| State occupancy; type population (admin counts) | `routes/builder-reads.ts:459,535` |
| Single ticket: detail, events, ancestors, comments | `routes/tickets.ts:372,426,674,725,952` (detail `:372` is door G7; the attachment list `:864` is door G10) |
| Ticket history (MCP `get_ticket_history`) | `routes/ticket-history.ts:281` |
| Attachment upload and download gates | `routes/attachments.ts:412,627` — **also doors** (G10) |
| The ticket list used by bootstrap and `GET /tickets` | `visibility/visible-tickets.ts:56,68` → `routes/tickets.ts:345`, `sync/sync-routes.ts:497`, `visibility/grant-backfill.ts:647` |
| Single-ticket live read | `read/live-ticket.ts:58` |
| Notification recipients | `notifications/fanout.ts:85` (every recipient is gated by `canSeeTicket`, so no draft assignment or mention notice leaves the author's hands) |
| Date-approaching and stale sweeps | `notifications/sweep.ts:125,187,265` |
| Auto-close sweep | `auto-close/sweep.ts:197` |
| Note indexing from attached tickets | `projections/note-search.ts:259` |
| Note attach, note create-with-ticket | `check-permission.ts:1556,1585` — **also a door** (G11) |
| Contests roster | `sync/contests-route.ts:293` — **also a door** (G6) |
| Knowledge Graph neighbours; Home | spec C §2.2 and spec E §2.4 use `visibleTicketsWhere` / `visibleNotesWhere`: closed with no edit. Drafts appear in graphs only through spec 2's doors |
| Reference index "Linked from" | spec B §2.2 asks `canSee` of the source: closed |
| MCP reads | every MCP read is an HTTP read of the routes above (`packages/mcp-server/src/tools/read-tools.ts:132-160`, `ticket-tools.ts:24,155`): closed |

**Group C — bypass both predicates (edit; the dangerous ones).**

| # | Site | What it does | Edit |
|---|---|---|---|
| C1 | `projections/rollups.ts:237`, `:345` (`recomputeParent`, `recomputeProject`); event arms `:412-446` | counts a parent's children | `AND draft_author_id IS NULL` in both statements; add a `ticket.published` arm that recomputes the parent (as `ticket.created` does at `:412`) |
| C2 | `visibility/rollup.ts:290` | the viewer-facing child tally and `restrictedCount` | `AND v.draft_author_id IS NULL` in the WHERE. Without it another person's draft under a visible parent reads as "1 restricted" |
| C3 | `read/deleted-items.ts:105`, `:141` | "contains N tickets" on workspace/project delete | exclude drafts from the counts. (A discarded draft is erased, so the ticket listing at `:175` needs no edit; the plan adds a control that a draft is absent from it) |
| C4 | `visibility/visible-events-for.ts:346` `nowInvisibleTicketsInScope` (called at `:622`, `:653`) | ids to purge when a member loses a scope | skip other people's drafts. Naming one is "an id for an entity the recipient stands in no relationship to" (the docblock at `:20-60` bans exactly that); the member's OWN drafts in the lost scope are still named |
| C5 | `routes/builder-reads.ts:1076` (the `migrate_ticket_type` select) and the `hidden` loop `:1098` | migrates every ticket of a type | `AND draft_author_id IS NULL` on the select. Otherwise another member's draft counts as "not visible to you" and blocks an admin's migration, and discloses that it exists (Q9) |
| C6 | `read/ticket-numbers.ts:104-111`, `:152-159` | the key | §6 |
| C7 | `sync/snapshot-writer.ts:95`; `read/state-provenance.ts:63`; `auto-close/sweep.ts:181`; `notifications/sweep.ts:259` | "when did it enter this state" reads `type IN ('ticket.created','ticket.transitioned')` | add `'ticket.published'`, so a draft-born ticket is "in Backlog since" its publish, not its drafting |
| C8 | `read/assigned-provenance.ts:111` | "who assigned it" reads `ticket.created` with an `assigneeId` | no edit: the draft's birth assignee keeps the creator's attribution and the drafting time, which is the true fact |
| C9 | `routes/people.ts:161-177` | outsider assignment | R8 |
| C10 | `projections/search.ts:58` | `proj_search` row at creation | no edit (see group B, Search). The census asserts no read of `proj_search` exists outside `routes/search.ts` and `read/compile-filter.ts:144` |

**Group D — doors: the places that DO admit the author.** Each calls one new function:

```ts
// apps/server/src/visibility/can-open.ts
// canOpen(db, userId, ticketId) = canSee(...)  ||  isOpenableDraft(...)
// isOpenableDraft: draftAuthorId === userId  &&  !draft.discarded  &&  R18's role/project test
```

| # | Door | Site |
|---|---|---|
| G1 | permission for the allowlisted events (§3.3) | `check-permission.ts:1639`: replace `canSee` by a three-way `ticketAccess` (`visible` / `own-draft` / `none`); `own-draft` applies R6-R7 |
| G2 | the stream | `visible-events-for.ts:493`: `canOpen` |
| G3 | single-ticket bootstrap | `sync-routes.ts:434`: `canOpen` |
| G4 | full bootstrap | `sync-routes.ts:497`: append the author's own drafts (`listMyDrafts`) after `listVisibleTickets` |
| G5 | reconcile | `reconcile-route.ts:153`: `canOpen`. If this stayed `canSee`, a device would be told to purge its owner's own drafts at every catch-up |
| G6 | contests roster | `contests-route.ts:293`: `canOpen` |
| G7 | ticket detail | `routes/tickets.ts:372`: `canOpen`; the response carries the folded `ticketState.draft` (`{ authorId, at }`) and `key: null`, and no new top-level wire field |
| G8 | the Drafts list | new `GET /v1/workspaces/:id/drafts` and `GET /v1/me/drafts` (§12.2, §13) |
| G9 | spec 2's graph reads | `canOpen` / `listMyDrafts` (spec 2 owns the route; §7.4) |
| G10 | attachments of a draft | upload `routes/attachments.ts:412`, download `:627`, list `routes/tickets.ts:864`: `canOpen` (R56) |
| G11 | a note linked to a draft | `check-permission.ts:1585` (the `note.attached` / `note.detached` gate): `canOpen` for the draft, the note-side gate (`:1577-1581`) unchanged (R66) |

Everything else the author does to a draft goes through G1 and the allowlist.

### 4.3 What each person sees (the table)

| Surface | The author | Everyone else (owner, admins, assignee included) |
|---|---|---|
| Board, Backlog tab, list, Closed | no | no |
| Search; the `:ticket` reference picker | no | no |
| My Work; Attention; Inbox notifications | no | no |
| Home counts; workspace-card counts | no | no |
| Knowledge Graph (spec C); Home graph | no | no |
| Workflow graph, Timeline graph, Home Timeline (spec 2) | **yes**, with the Draft pill | no |
| Drafts page and `list_my_drafts` | **yes** | n/a |
| The draft's sheet by URL; MCP `get_ticket` of it | **yes** | 404 |
| The draft's History tab | not shown while a draft; after publish it shows the whole stream, drafting included (ruling 5) | 404 |
| The draft's Attachments tab; downloads | **yes** (R56) | 404 |
| Sub-ticket list and progress of its parent | no | no |
| Links to or from it | on the author's own sheets and graphs | not shown, not counted (§10) |
| Trash | n/a (a discard erases) | n/a |
| Ledger export and backups (`ops/export-ledger.ts`, `pg-dump.ts`) | n/a | operators only; they hold draft events until a discard erases them. Stated so no copy claims drafts are encrypted |

## 5. Delivery: stream, bootstrap, offline

R20. **Live stream and catch-up** use door G2: the author's devices receive the draft's events; no other reader does. A reader who was offline across a publish is handed the draft's whole history in the ordinary catch-up, because `canSee` is evaluated now.
R21. **Publish is a grant.** `'ticket.published'` is added to `GRANT_BACKFILL_TRIGGERS` (`grant-backfill.ts:153`). Every reader who can see the ticket after the publish gets a `reach-granted` notice naming it (its inheriting children, and the notes linked to the draft, R66), and their device pulls `/v1/sync/bootstrap/ticket`. This is how a reader who was online during the drafting gets a ticket their cursor had already passed.
R22. **The author's replica** holds its drafts (G4, G3) and must keep them out of every offline read. In `packages/app-core/src/replica/replica-data-source.ts`, the places that skip `deleted` also skip `draft`: `listTicketSummaries` (`:1003-1008`), `isLive` in `boardHierarchyOf` (`:1066`), the board and list loops (`:1386`, `:1419`), offline search (`:1810`); and `outbox.pendingCreatedTickets` (`sync-client/src/outbox/outbox.ts:527`) skips a pending `ticket.created` with `draft: true` (an offline-born draft must not flash on the board). The replica adds `listDrafts(workspaceId)` for the Drafts page.
R23. **Events delivered to others never name a draft** (links: §10).
R24. **The offline key.** Unchanged: the replica has no key for any ticket (`replica-data-source.ts:896,1054` returns `key: null` and the sheet falls back to the title). A draft shows the Draft pill in that slot. A key appears only after the server publishes and the device pulls.

## 6. Keys

### 6.1 The rule

R25. A ticket's number is its position, per project, among **numbering rows**, ordered by `workspace_seq`:
- a `ticket.created` whose payload does not say `draft: true`;
- a `ticket.published`.

A draft's `ticket.created` is not a numbering row. A draft that is discarded never had one. A draft that is published takes the next number at its `ticket.published`. Numbers are never reused, because `workspace_seq` never repeats (`ticket-numbers.ts:36-60`).

R26. **The new query** (both functions, `ticket-numbers.ts:104-111` and `:152-159`):

```sql
SELECT entity_id AS ticket_id,
       row_number() OVER (PARTITION BY payload->>'projectId' ORDER BY workspace_seq) AS number
  FROM events
 WHERE workspace_id = $1
   AND ( (type = 'ticket.created' AND payload->>'draft' IS DISTINCT FROM 'true')
         OR type = 'ticket.published' )
```

R27. **Parity.** On a ledger with no draft events the new query returns exactly what the old one returns, for every ticket (a rebuild-equality case, 28.020, on the dev seed and on a fixture with purged tickets).

### 6.2 Why this shape (alternatives rejected)

- **A different founding event for drafts** (`ticket.drafted`): the key query would not change, but every one of the 134 non-test source files under `apps/` and `packages/` that name `ticket.created` (grep, 2026-10-03) would need a twin. Rejected for the blast radius.
- **A second `ticket.created` at publish**: two founding events on one stream break `applyTicketEvent`'s "never created / already exists" contract (`ticket-state.ts:118-135`, `hierarchy.ts:95`). Rejected.
- **A separate draft entity that publish copies into a new ticket**: the ticket id changes at publish, so every link, graph position and URL must be remapped by many non-atomic events. Rejected; ids are stable here.
- **A stored counter:** forbidden by `ticket-numbers.ts:1-30`.

### 6.3 Purge must keep the numbering rows (migration)

Today a purge keeps only `ticket.created` (`1790600000000_purge-engine.sql:86-93`). With §6.1 two things break unless the migration changes:
1. a purged **unpublished** draft would keep a redacted `ticket.created` that no longer says `draft: true`, so the key query would COUNT it (a number consumed by a draft);
2. a purged **published** draft-born ticket would lose its `ticket.published` row, so every ticket numbered after it in the project would move down by one (a reuse).

R28. A new migration `apps/server/migrations/<next 13-digit>_drafts.sql` (the plan takes the next free prefix after the highest on the release tip, and re-checks it against spec A's `proj_ticket_links` migration):
- `ALTER TABLE proj_tickets ADD COLUMN draft_author_id text;` and the same on `proj_visibility`; a partial index on each `(workspace_id, draft_author_id) WHERE draft_author_id IS NOT NULL`;
- `purge_ledger` redacts `ticket.created` to `{projectId, purged: true}` **plus `draft: true` when the original said so**, redacts `ticket.published` to `{projectId, purged: true}`, and deletes every other event as before;
- `events_append_only` accepts exactly those three redactions (the column-equality guard at `:136-140` is unchanged), and refuses anything else with the original message.

R29. TS mirrors in `packages/domain/src/purge.ts`: `redactedTicketCreatedPayload(projectId, draft?)`, `redactedTicketPublishedPayload`, `isRedactedTicketPublished`. **Every replay reader that asks `isRedactedTicketCreated` first (`ticket-state.ts:126`, `projections/tickets.ts`, `proj-visibility.ts:240`, `search.ts:58`, `snapshot-writer`, `rollups.ts`, the replica) asks the new predicate for `ticket.published` too.** A redacted `ticket.published` no longer satisfies `ticketPublishedPayload`; a reader that parses it would throw during `replayRemaining` (`purge/erasure.ts`).

R30. `checkPurged.payloadIds` (`purge/check-purged.ts:35-52`) names nothing for the new events (they carry no foreign id).

## 7. Publish (single) and what spec 2 may rely on

### 7.1 Projections on publish

- `proj_tickets`: `draft_author_id = NULL`; workflow re-pin (§2.3).
- `proj_visibility`: `draft_author_id = NULL`; `resolved_*` already hold the project default (`projections/proj-visibility.ts:103,153`: a ticket is born `project`-mode and `reResolveSubtree` runs at creation `:253`), so no re-resolve is needed. `seq` advances.
- `proj_rollups`: recompute the parent (C1).
- `proj_search`: nothing (the row exists since creation).
- `proj_lifecycle`, `proj_contested`: nothing.

### 7.2 Provenance and "in Backlog since"

C7 lists the four places. After a publish, "in Backlog since" is the publish instant.

### 7.3 Notifications at publish (`notifications/fanout.ts`)

R31. `onCommitted` (`fanout.ts:352`) gains an arm for `ticket.published`, read from the ticket's head state at that moment:
- **assignment:** if the ticket has an assignee who is not the publisher, one `assignment` notice with `dedupeKey assignment:${env.id}`, through the same `handleAssigned` guards (`fanout.ts:132`);
- **mentions:** every person mentioned in the current description who is not the publisher gets one `mention` notice (`handleMentions`, `fanout.ts:154`, source `description`, with no "previous" document);
- nothing else. Everything the author did while drafting is quiet (the `canSeeTicket` gate in `fanout.ts:85` already makes the drafting-time events silent for everyone but the author).

### 7.4 Atomic publish of a set, and what spec 2's `publish_flow` may rely on

Spec 2 needs "a transactional publish of an ordered set of drafts, every key assigned in the given order, all or nothing" (its need D-4). The ledger cannot do this today: `ingestAll` commits each event in its OWN transaction (`ingest-service.ts:432`, `commitOne` at `:166`, which opens its own `BEGIN`). This spec adds the primitive.

R47. **`ingestAtomic(events, door)`** in `apps/server/src/ingest/ingest-service.ts`. `commitOne`'s body is factored into `commitInTx(client, submitted, door)`, which does everything `commitOne` does up to and including projections but neither `BEGIN` nor `COMMIT`. `commitOne` becomes `BEGIN` + `commitInTx` + `COMMIT`; `commitInTx` is also what lets a `ticket.published` append its re-filed link events and its rank events (R44, R64) inside the one transaction; `ingestAtomic` is one `BEGIN`, `lockWorkspace` once, then `commitInTx` for each event in the given order, then `COMMIT`. Any refusal or throw rolls the whole transaction back. Every gate already reads through the transaction's `client`, never `deps.pool` (purge check `ingest-service.ts:225`, the door gate with `db: client` `:265`, the engine `deps.evaluate(envelope, createEngineContext(client))` `:310`, the server gates `gate.check(submitted, client)` `:343`, projections `:376`), which is what lets a later event in the batch see an earlier one's writes under READ COMMITTED; the factoring must keep that and a case pins it (28.103). The `onEventCommitted` listeners (fanout, grant-backfill) fire from `notifyCommitted` at `:379`, inside `commitOne` after its `COMMIT`; the factoring moves that call to the caller, so `ingestAtomic` calls it for each event, in order, only after its single `COMMIT`. Entity locks are taken in the order the events are given; the workspace lock first (the existing global order, `ingest-service.ts:171-174`) means two atomic calls on one workspace cannot deadlock on each other.
R48. **The route:** `POST /v1/workspaces/:workspaceId/drafts/publish`, body `{ ticketIds: string[] }` (1 to 200 ids, ordered, no repeats). Online only (an offline device queues single `ticket.published` events instead, and the app disables "Publish flow" while offline). For each id the server builds one `ticket.published {projectId}` (the actor is the session user, the origin is the door) and calls `ingestAtomic`.
R49. **Response:** success `{ results: [{ ticketId, key }] }` in the given order. Refusal `409 { rule: 'draft.publish-refused', ticketId, cause: { rule, reason } }` naming the FIRST failing ticket and its underlying rule (`draft.parent-unpublished`, `hierarchy.parent-terminal`, `permission.visibility`, …); nothing is committed.
R50. **Keys:** the workspace lock is held for the whole transaction, so no other writer's creation lands between the publishes. Within one project the keys are consecutive and follow the given order (the key is the position among numbering rows, R25). Across projects each project's keys are consecutive in the given order.
R51. **Order is the caller's.** The route does not sort. A child listed before its unpublished parent fails with `draft.parent-unpublished` and rolls everything back; a parent listed before its child passes because the engine reads the parent's state inside the same transaction. Spec 2 defines "flow order" and must list parents first.
R52. **Rules applied:** every event goes through the same gates as a single publish (R10-R13), judged against the state the earlier events in the batch left, not the state at the start.
R53. **Idempotence:** a retry after a lost response sees `draft.not-a-draft` for the first id and the batch refuses; the caller (spec 2's `publish_flow`) reads the drafts first, drops ids that are no longer drafts and retries with the rest.
R54. **Tickets in the batch that cannot be seen by the caller** (another author's draft) refuse with the not-found answer (R9) naming that ticket id as `ticketId`; the response reveals only that the id is not the caller's, as for any unknown id.
R55. **Everything else spec 2 may rely on:** a single `ticket.published` commits atomically on its own; the committed `ticket.published` events are what its auto-promotion listens to (its need D-5); a draft cannot be decided, transitioned, promoted or counted by anyone else (R6-R9, its need D-7); `listMyDrafts(db, userId, workspaceId)` is exported from `apps/server/src/read/drafts.ts` for its flow and timeline reads (its need D-8). Its need D-3 is met by §10: a link that touches a draft lives in the draft's own stream until publish, then is re-filed atomically (R44).

### 7.5 Rank on publish (owner ruling 6)

R64. **A publish lands the ticket at the END of its project's Backlog.** Ranked rows draw above unranked rows, and unranked rows draw by ticket id (`packages/domain/src/rank.ts:85` `compareByRank`; `backlog-rank.ts:70`), so one new key on its own lands above every unranked row. The published ticket is therefore ranked the way a drag to the end is today: `planRankMove` (`packages/app-core/src/views/backlog-rank.ts:214`) backfills the unranked rows, in their drawn order, with ascending keys (`rankBetween`, `rank.ts:54`) and then gives the moved ticket the next key. The owner accepted that cost for drags ("one ingest, N+1 events", `backlog-rank.ts:195-199`).
- The algorithm moves into `packages/domain/src/rank.ts` as `planTailRank(rows, tailIds)` (pure; `tailIds` names the tickets to place last; `planRankMove` calls it for its end-of-list case, with no change to its behaviour), so the server and the client share it.
- Publishing is `ticket.published` followed by `ticket.ranked` (the rank needs the ticket to be in the Backlog, `refusal-rules.ts:40` `rank-requires-backlog`, so the rank cannot precede the publish). The backfill `ticket.ranked` events come first. Through `POST …/drafts/publish` and `publish_draft` the server builds all of them and commits them in the one transaction (R47/R48); through the app's single publish and offline, the client sends the batch and `submitRank`'s partial-application rule applies (`backlog-rank.ts:209-218`).
- For a set (R48), the backfill runs once per project, then each published ticket takes the next key in the given order.
R65. **Whose rows.** The backfill ranks the Backlog rows the PUBLISHER can see (`visibleTicketsWhere`), as a drag does. Rows they cannot see stay unranked and so draw below the new ticket for people who can see them (Q15).

## 8. Discard

### 8.1 The rule and why

R32. **Discard erases.** After `ticket.discarded` commits, the server erases the draft's whole stream.

Why this and not the trash: the trash rule ("ticket keys are counted, redact never delete", `ticket-numbers.ts` docblock: "a number is NEVER REUSED") protects numbers. A draft has none, so nothing is owed to the numbering and nothing else cites the draft (no comment, no notification; the attachments uploaded to it go with it, R58). It was never shared. "Discard" means the author wants it gone; the owner's own trash decision T1 reads "truly erased" (`docs/superpowers/specs/2026-09-23-trash-and-purge-design.md` §2). Routing it through Deleted items would also put a private draft's title in front of every project admin (T3 shows deleted tickets to whoever could delete them). The cost is no Undo; the app asks first (R16). This is owner ruling 4.

### 8.2 Mechanism

R33. `apps/server/src/purge/discard-draft.ts` exports `discardDraft(pool, ticketId, deps)`. It reuses the sanctioned purge path:
- `purgeItem` (`purge/purge-item.ts:101`) today refuses an item that is not marked and due (`:110-111`). It gains a gate parameter; the default stays "marked and due". The draft gate is "head state has `draft` and `draft.discarded`".
- Inside the one transaction, as `purgeItem` already does: allocate `workspaceSeq` and `seq` BEFORE deleting (so the stream position is not reissued; `purge-item.ts:114-115`), call `purge_ledger('ticket', id)`, erase the projection rows (`purge/erasure.ts` `eraseRows`: `proj_tickets`, `proj_visibility`, `proj_rollups`, `proj_search`, …), record the id in `purged_entities`, re-derive survivors, and append the content-free tombstone `purge.completed`. The tombstone is an event on a ticket that no longer exists, so no reader is handed it (the stream gates tickets by `canSee`, `visible-events-for.ts:493`).
- `markedBy` / `markedAt` in the tombstone are the author and the discard instant.
- A draft's child drafts are in `purge_erasure_set('ticket', id)` already (a ticket's sub-tree); the author is told the count in the confirm dialog.
- The attachment objects are handled by the same path (R58): `objectKeysOf` reads them before the rows go, they are queued in `purge_pending_objects` inside the transaction and deleted after the commit.
- `deps` for `discardDraft` carries the object store the uploads used (`routes/attachments.ts:495` `deps.store.put`), so the delete reaches the same store.

R34. **Trigger.** After a `ticket.discarded` commits (the `onEventCommitted` hook, `ingest-service.ts:102,496`), the server runs `discardDraft`. It also runs from `purge/sweep.ts` for any draft whose `draft.discarded` is set and which still exists (a crash between the two). Idempotent: an erased draft is skipped (`purge-item.ts:103`, `already-purged`).

R35. **Links need no compensation.** Every link that touches a draft is filed on the draft's own stream (R42), so the erase removes it with the stream. No event is appended to any other ticket's stream, and `proj_ticket_links` rows touching the erased id go with the purge (spec A §2.5: purge deletes every row that touches the ticket). Discard therefore never depends on another ticket's permissions.

R36. **Offline.** A change queued for a draft that was erased is refused `purge.erased` at the door (`purge/check-purged.ts`) and the device shows the existing notice, `PURGED_OUTBOX_NOTICE` (`packages/domain/src/purge.ts`), and drops it.

R37. **What survives:** one redacted `ticket.created` row `{projectId, purged: true, draft: true}` (§6.3) and one `purged_entities` row. Neither carries content. No number was consumed and none is reused.

## 9. Sweeps and engines

R38. Auto-close, date-approaching and stale sweeps never see a draft (A4 closes them). A draft has no due-date notice, even with a due date set.
R39. Spec 2's auto-promotion (Backlog → To-do) must skip drafts; stated in §14 as an obligation. Nothing in this spec's code does promotion.
R40. A workflow republish (`workflow.defined`) folds drafts forward with every other ticket (`projections/tickets.ts:423` `refreshTicketsForWorkflow`); no exception, and the plan adds a control.

## 10. Links that touch a draft

Spec A files `ticket.link_added` on the SOURCE ticket's stream and folds links into the source's head state (`typed-links §2.2`; `origin/task/kg-a-t1-events`: `ticket-state.ts` `links`). The graph's "+ after GN-150" creates a draft AND links the published GN-150 to it; filed in the usual place the event would land on a public stream and name a private ticket. The planner's reconciliation (block in §1) fixes this structurally: **while the draft exists, every link that touches it lives on the draft's own stream.**

R41. **Reads:** a link is shown only to a viewer who can see both ends (A §2.4). A draft is seen by no one through `canSee`, so another person sees no trace of the link and no count. The author sees it on the draft's sheet and, via the doors, on their own graphs: spec A's link reads accept an allowance for the viewer's own draft ids (obligation in §14).
R42. **Draft-side filing (additive `from`).** Spec A's two payloads gain one optional member, `from: ulidString` (still `.strict()`, `from` must differ from `targetId`):
- a link whose SOURCE is the draft: filed as A defines it, on the draft's stream, no `from`;
- a link whose TARGET is the draft and whose source is another ticket S: filed on the DRAFT's stream with `targetId = <draft id>` and `from = S`. Its meaning is "S `kind` the draft"; the stream it sits on is the draft's.
- `proj_ticket_links` takes `source_id = from ?? entity id`, `target_id = targetId`. The reducer keeps such entries in the draft's `TicketState.links` marked with their `from`.
R43. **Permission and engine.** A `from`-form event: the actor must be the draft's author (the draft door, G1) AND be allowed to edit `from` (A's rule 6 applied to S); a plain-form event (no `from`) on S's stream that names a draft as `targetId` is refused `draft.link-form` ("Link to a draft from the draft's side"), so no event on a public stream ever names a draft. A's other rules (self-link, same workspace, duplicates, direct reverse) are judged on the (source, target) pair.
R44. **Publish re-files the incoming links, inside the publish transaction.** On `ticket.published` the server, in the same transaction (`commitInTx`, R47), takes each `from`-form link of the draft whose source S is not itself an unpublished draft and appends a plain `ticket.link_added {kind, targetId}` on S's stream (actor the publisher, origin `server`, through the same gates, so A's rule 6 is checked against S again). The reducer's `ticket.published` arm drops the `from` entries from the ticket's `links` (they now live on S). If the re-file is refused (the publisher can no longer edit S, S was deleted), the publish is refused `draft.link-refile-refused` naming S, and nothing commits. Outgoing links of the draft need nothing: they already sit on its stream and become visible when both ends are visible.
R45. **MCP:** spec A's `get_ticket.links` lists visible ends only (A §4); on the author's own draft it includes the draft-side links. `redactedPayload` (`mcp-server/src/tools/ticket-tools.ts:41`) is unchanged.
R46. **Discard** removes them with the stream (R35). **Publish** otherwise adds none and removes none.

No stream reader, snapshot or History route needs a per-viewer filter for links: the events are on a stream only the author may open.

## 11. Projections, in order

| Projection | Change |
|---|---|
| `proj_tickets` (`projections/tickets.ts`, registered at `projections/index.ts:91`) | the `draft_author_id` column (`TicketRow`, `upsertTicket`, `rowToTicketState`); folds the new events (they are in `TICKET_EVENT_TYPES`) |
| `proj_rollups` | C1 |
| `proj_visibility` (`proj-visibility.ts:240`) | `ticket.created` inserts `draft_author_id`; `ticket.published` clears it; `ticket.discarded` is a no-op (the erase deletes the row) |
| `proj_search` | none |
| `proj_lifecycle` | none |

The registry order is unchanged. `tools/verify-projections.ts` must stay clean with drafts in the ledger (case 28.045): live equals a rebuild for both new columns.

## 12. App

### 12.1 Creating a draft

- **The New ticket dialog** (`new-ticket-dialog.tsx`; footer at `:965-977`) gains a secondary button **Save as draft** beside **Create ticket**. It sends `ticket.created` with `draft: true`, `start: 'backlog'`, no `stateId`. The "Starts in the backlog?" switch (`:1032`) is shown ON and disabled while saving a draft (Q6). Success closes the dialog with a toast **Draft saved** and an **Open** action.
- **Elsewhere:** spec 2 creates drafts in the graphs. No other create entry changes (the board column "Create ticket", the sheet's sub-ticket path stay non-draft).
- Optimism follows the smoothness rules (`docs/superpowers/specs/2026-10-02-smoothness-design.md`): the draft row appears on the Drafts page at once and rolls back on a refusal.

### 12.2 The Drafts page

- Route `apps/web/app/w/[workspaceId]/drafts/page.tsx`; a **Drafts** entry in the nav (`apps/web/src/app-nav.tsx:201`) with a count badge of the viewer's own drafts in this workspace (owner ruling 1).
- Server read `GET /v1/workspaces/:id/drafts` → `{ items: [{ ticketId, projectId, projectName, typeId, title, parentId, updatedAt }] }`, the viewer's own, newest first, read from `proj_tickets` where `draft_author_id = viewer` and not discarded and `canOpen`'s role test holds. It never contains a key.
- Each row: the type chip, the title, the project, the parent title if any, **Publish**, **Discard**, and the row opens the sheet.
- Empty state: "No drafts. A draft is a ticket only you can see, until you publish it."
- Phone: the same list at full width, actions in a row menu.

### 12.3 The sheet

- A draft opens in the ordinary ticket sheet. **No key**: the crumb and header show a **Draft** pill where the key goes (`ticket-sheet.tsx:3033` `lastCrumb = ticketRead.key ?? ticketRead.title` already falls back to the title; the pill is added). The pill is the mockup's: a dashed outline in the draft colour.
- A banner under the header: "Only you can see this draft." with **Publish** (primary) and **Discard**.
- Tabs: **Details** and, once spec 2 lands, **Graph**. **Attachments** is shown (R56) and the Notes section works (R66); **History** is hidden while it is a draft (it shows the whole stream after publish), and comments are not offered. Hidden controls for the refused events of R7 are disabled with the reason ("Available after you publish"), not removed, so the layout does not move on publish.
- **Publish** confirms nothing. It submits `ticket.published` plus the rank events (R64); on commit the pill is replaced by the key the server returns on the next read, and the ticket appears last in the project's Backlog.
- **Discard** opens a confirmation: "Discard this draft? It is erased and can't be recovered." plus "N sub-drafts will be erased too" when there are any, and "N attachments uploaded to this draft will be permanently deleted" when there are any (R60). Notes linked to the draft are not deleted; the dialog says "Linked notes are kept and unlinked." Button **Discard draft**.
- The wire view `TicketRead` (`packages/app-core/src/view-types.ts:639`) gains `draft?: true`, which the client maps from the detail's `ticketState.draft` (G7 serves no separate `draft` field); `TicketSummary`, `BoardCard` and list rows never carry a draft (the server never returns one there).

### 12.4 Offline

The author can create, edit, publish and discard offline. A publish made offline shows the Draft pill until the device has the server's answer; the key arrives on the pull that R21 triggers for the author's own device too (a `reach-granted` is also sent to the author's other devices, since their cursors passed the draft).

## 13. MCP

All tools register in `packages/mcp-server/src/tools/` and are added to `test/fixtures/tool-names.ts` (14.80/14.81; the fixture's per-module blocks are the pin). `create_ticket` stays in `write-tools.ts`; the three new tools go in a new `draft-tools.ts` module registered in `register.ts:allTools`.

**`create_ticket`** gains `draft?: boolean` (default `false`).
- With `draft: true` it sends `draft: true`, `start: 'backlog'`, and refuses `stateId` and `start: 'focus'` with the domain's sentence (the same early check the tool already makes for `stateId` + backlog, `write-tools.ts:55-56`).
- The reply is `{ ticketId, draft: true, key: null }`.
- The description says: "A draft is private to you until `publish_draft`. It has no key."

**`list_my_drafts`** `{ workspaceId?, projectId?, cursor?, limit? }` → `{ items: [{ workspaceId, ticketId, projectId, projectName, title, typeId, parentId, updatedAt }], nextCursor }`. Reads `GET /v1/me/drafts` (all the caller's workspaces, optionally narrowed), like `list_deleted` reads `/v1/me/deleted-items` (`trash-tools.ts`). Pages with `pageArgs`.

**`publish_draft`** `{ workspaceId, ticketId }` → submits `ticket.published {projectId}` (the tool reads the draft first for `projectId`), then writes the rank events of R64 and reads the ticket, returning `{ ticketId, key, published: true }`. Refusals pass through with the server's rule and sentence (`packages/mcp-server/src/tools/submit.ts:30`): `draft.not-a-draft`, `draft.parent-unpublished`, `hierarchy.parent-terminal`, …

**`discard_draft`** `{ workspaceId, ticketId, confirm_name? }` → `confirm_name` must be the draft's exact title; without it the tool returns a `Preview` (`preview.ts`, as `delete_ticket` does with the key) "Erases the draft "<title>", N sub-drafts and M attachments uploaded to them (permanently deleted). Linked notes are kept. This cannot be undone." and nothing changes.

**Existing tools on a draft** (the author's own session): `get_ticket` returns it with `draft: true`, `key: null`; `update_ticket`, `assign_ticket`, `link_tickets` (spec A), `add_attachment` and `link_note` work; `transition_ticket`, `close_ticket`, `reopen_ticket`, `rank_ticket`, `delete_ticket`, `restore_ticket`, `add_comment`, `set_visibility`, `migrate_ticket_type` refuse (R7) with the pointer to publish or discard. For anyone else every tool answers "not found".

**Rule D2** (restated): a draft made by MCP appears on the author's Drafts page, is attributed (`origin: 'mcp'`, "via Claude" in the history copy once published), and its author removes it with Discard.

**`history-copy.ts:109`** (`describeEvent`) narrates: `ticket.created` with `draft` → "Ama Rangsa drafted this ticket"; `ticket.published` → "Ama Rangsa published this ticket"; `ticket.discarded` is never shown (it is erased).

## 14. Obligations on the other specs

| Spec | Obligation |
|---|---|
| A (typed links) | (a) its link reads keep asking `canSee` for both ends, with an allowance for the viewer's own draft ids (R41); (b) both payloads gain the optional `from` member (R42; additive, `origin/task/kg-a-t1-events` is not reopened, the Drafts plan adds it) and its projection reads `source_id = from ?? entity id`; (c) its purge rule deletes every `proj_ticket_links` row touching an erased ticket (§2.5), which is what makes a discard leave no link; (d) its link permission accepts the `from` form (R43) |
| 2 (graphs, owns `publish_flow`) | reads drafts only through door G9; shows the Draft pill; creates drafts with `draft: true` and a `leads_to` link; `publish_flow` obeys §7.4; auto-promotion skips drafts (R39); the "Publish flow" copy reads "Publishing makes every draft a Backlog ticket" |
| B (reference index) | none: its sources are gated by `canSee` |
| C (graph view), E (Home) | none: they use `visibleTicketsWhere` |
| D (semantic layer) | its indexer, clustering and concept tagging must **skip drafts** and index a ticket at its publish. A concept is hidden from a reader who cannot see all its items (D4), so a tagged draft would hide the concept from everyone but the author. Add to D's plan |
| 3 (MCP sweep 2) | `close_tickets` (bulk) must exclude drafts and say so |

## 15. Testing and proof

### 15.1 Case block

**Features.md §25 "Drafts" ↔ `test-cases/28-drafts.md`, cases 28.001–28.199.** Grepped on 2026-10-03: no remote branch (862 under `origin/*`) has a `test-cases/28-*` file or a `## 25.` heading; the Knowledge Graph series holds §24 and file 27 (`origin/task/kg-a-t1-events`, `origin/docs/kg-catalogue-seed`). The plan re-greps every live tip before it opens the section. The catalogue guard counts id lines (`case-id-catalogue.md`), so each id is allocated once.

| Block | Plan task |
|---|---|
| 28.001–28.019 | T1 domain: events, refine, state, reducer, vocabulary census |
| 28.020–28.044 | T2 keys and purge: numbering query, migration, redaction |
| 28.045–28.069 | T3 projections, the four predicates, the census (groups A–C) |
| 28.070–28.089 | T4 delivery: doors G1–G8, stream, bootstrap, reconcile, replica |
| 28.090–28.109 | T5 publish and discard: rules, fanout, erasure, sweep |
| 28.110–28.129 | T6 links touching a draft (R41-R46) |
| 28.130–28.149 | T7 MCP |
| 28.150–28.179 | T8 app: dialog, Drafts page, sheet, phone, offline |
| 28.180–28.194 | T9 attachments on drafts, notes, rank on publish (R56-R66) |
| 28.195–28.199 | free, for follow-ups |

### 15.2 Cases (RED first; each has its control in the same `it`)

1. **28.001** `ticket.created {draft:true}` parses with `start:'backlog'`; refused with `start:'focus'`, with `start` absent, and with a `stateId`. Control: the same payload without `draft` still parses (a v1 event). 28.002 `ticket.published` is strict and needs a ULID `projectId`; `ticket.discarded` is strict and empty.
2. **28.003** the reducer: a draft has `draft = {authorId, at}`; `ticket.published` clears it and re-pins the workflow to the type's CURRENT workflow while the state stays Backlog (control: a ticket whose type was re-pointed while it was a draft ends on the NEW workflow; a ticket created and never drafted is unchanged). 28.004 a `published` on a non-draft throws.
3. **28.005** the vocabulary census (spec A's test, `apps/server/test/census/ticket-vocabulary-census.test.ts`): both new types appear in `TICKET_EVENT_TYPES`, `history-copy`, `redactedPayload`, `fanout`, the replica, `check-purged.payloadIds`. Mutation: drop one from `TICKET_EVENT_TYPES` → red naming it.
4. **28.020** parity: with no draft event, `ticketNumbers` and `ticketIdsAtNumber` equal the old query for every ticket (dev seed; fixture with a purged ticket).
5. **28.021** a draft takes no number: create draft X1, create ticket Y2, publish X1 → Y2 is #1 and X1 is #2. Control: the same creates without `draft` number X1 #1, Y2 #2. 28.022 a discarded draft leaves no gap: D1 (draft), T2, discard D1 → T3 is #2.
6. **28.023** purge failure (1): purge an UNPUBLISHED draft, then create a ticket → its number is unchanged by the redacted row. Mutation: redact without `draft: true` → the number moves.
7. **28.024** purge failure (2): purge a published draft-born ticket → tickets numbered after it keep their numbers. Mutation: delete the `ticket.published` row → they shift.
8. **28.025** the trigger refuses every other UPDATE and DELETE (the three accepted redactions are the only ones).
9. **28.045** projections: `proj_tickets` and `proj_visibility` carry `draft_author_id` and clear it on publish; `verify-projections` is clean with drafts, publishes and a discard in the ledger.
10. **28.046–28.049** the four predicates, on one fixture with a draft by user A in a `workspace`-mode project, viewers: the author, a member, an admin, the owner, the assignee of the draft, a guest. `canSee` is false for all of them (including A); `visibleTicketsWhere` and `LIVE_TICKET_WHERE` exclude it for all. Controls: a published ticket with the same audience is visible to each as before. The agreement test (`test/read/visible-where.test.ts`) stays green because both sides exclude drafts.
11. **28.050** the CENSUS: lists every `proj_tickets` / `proj_visibility` SQL string and every `canSee(` call in `apps/server/src` by `file:line` and fails on one not in groups A–D. Control: a planted route that reads `proj_tickets` is reported.
12. **28.051–28.069** one case per group B / C row of §4.2: the draft is absent from the board, list, search (including a key-shaped query for a number the draft cannot have), My Work, attention, Home counts, workspace-card counts, notes, guest names, state occupancy, type population, a parent's rollup AND `restrictedCount` (C2), the delete-confirm counts (C3), the scope-lost purge list (C4), `migrate_ticket_type` (C5: an admin's migration succeeds while another member holds a draft of that type, and the draft is untouched), and the sweeps. Each has a control viewer, the author on a door route.
13. **28.070–28.089** the doors: the author's stream, bootstrap, single bootstrap, reconcile, contests and detail read return the draft; everyone else gets the 404 answer; reconcile does NOT list the author's own draft as restricted (mutation: `canSee` at `reconcile-route.ts:153` → the draft is listed). The replica never lists a draft on any offline read (R22) and `pendingCreatedTickets` skips an offline-born draft.
14. **28.090** permission: the author's allowlisted events commit; every refused event of R7 is refused with `draft.not-allowed`; another person's, the owner's and an admin's events on the draft get `permission.visibility`. 28.091 a published ticket under a draft parent is refused (R4); a draft under another person's draft is `hierarchy.unknown-parent`.
15. **28.092** publish: success; each refusal of R10-R12; the project mismatch; a publish by an admin who is not the author. 28.093 publish by the author after the type's workflow moved → the published ticket is on the new workflow.
16. **28.094** fanout: drafting events notify nobody (assignment, a mention, a due date); publish notifies the assignee once and each mentioned person once; redelivering the event adds no row (the dedupe key).
17. **28.095** `reach-granted` on publish reaches a member who was online during the drafting and their device pulls the ticket; a member offline across the publish gets the ticket in the ordinary catch-up.
18. **28.100** discard: after `ticket.discarded` the draft's events and projection rows are gone, `purged_entities` holds the id, one redacted `ticket.created {…, draft:true}` remains, a later event for it is refused `purge.erased`. Control: a published ticket is not erased by a `ticket.discarded` (refused `draft.not-a-draft`). 28.101 the sweep erases a draft whose hook never ran. 28.102 a discard with an incoming draft-side link (R42) leaves the published source's stream and state untouched and `proj_ticket_links` has no row touching the erased id. **28.103** the atomic route: three drafts (parent first) publish with consecutive keys in the given order and a concurrent creation cannot land between them (workspace lock); with the third draft's parent terminal NOTHING commits (no `ticket.published` row, no key consumed, no notification) and the response names that ticket. Control: the same three published one by one succeed. Mutation: commit per event inside `ingestAtomic` → the rollback arm reds. A child listed before its parent refuses `draft.parent-unpublished` and rolls back. **28.104** `commitOne` parity: the existing ingest suites run unchanged against the factored `commitInTx`, and a thrown projection error still rolls back one event only. 28.105 `GET .../events` and History hide a link to another person's draft from a viewer of the published source (R42), and show it after publish.
19. **28.110–28.119** links (R41-R46): a link from a published ticket S to a draft is filed on the draft's stream with `from = S`; no event on S's stream, S's state, S's History, `get_ticket(S)`, another member's snapshot or stream carries it, and a plain-form `link_added` on S naming the draft is refused `draft.link-form` (control: the same link to a published target is accepted). Publish re-files it: S's stream gains the plain `link_added`, the ticket's `links` lose the `from` entry, `proj_ticket_links` equals a rebuild; with S no longer editable by the publisher the publish is refused `draft.link-refile-refused` and nothing commits (no `ticket.published` row, no key consumed). Mutation: file the re-file after the `COMMIT` → the rollback arm reds.
20. **28.130–28.149** MCP: `create_ticket {draft:true}`, `list_my_drafts`, `publish_draft` (returns the key), `discard_draft` (preview, then erase), the refusal text of each refused tool, and `tool-names.ts`.
21. **28.150–28.179** app: Save as draft, the Drafts page, the sheet's pill/banner/disabled controls, Publish, Discard confirm; phone; offline create+publish; a11y names.

22. **28.180** attachments on a draft: the author uploads (201), lists and downloads; another member, an admin and the owner get 404 on upload, list and download. Control: the same three on a published ticket succeed. **28.181** `attachment.added` by the author commits; by anyone else `permission.visibility`; `comment.added` on the draft is refused `draft.not-allowed`. **28.182** publish keeps the rows and object keys unchanged and the attachment becomes visible to a reader; History shows `attachment.added`.
23. **28.183** discard erases what came from the draft: each `attachments` row gone, each object key `w/<ws>/a/<id>` deleted from the store, `purge_pending_objects` empty after the drain; a sub-draft's attachment too. Controls: an attachment on another ticket and a note's own attachment (`note_id`) remain, objects included. Mutation: drop the `ticket_id = ANY(...)` arm of `objectKeysOf` → the object survives and the case reds. **28.184** a store that throws on delete: the draft and its rows are gone, the key stays queued with `attempts` incremented, the sweep drain deletes it later.
24. **28.185** a note linked to the draft survives the discard with its content; the link row is gone; `verify-projections` is clean. **28.186** a `note.attached` naming another person's draft reaches no other reader of the note (stream, history, bootstrap); after publish the readers get it through the `reach-granted` notice (control: a note attached to a published ticket is delivered as before).
25. **28.187** publish rank: a project Backlog with ranked and unranked rows; after publish the ticket draws LAST and the backfilled rows draw in their old order. Mutation: skip the backfill → the ticket draws above the unranked rows and the case reds. **28.188** a set publish: three tickets draw last in the given order, one backfill per project. **28.189** rows the publisher cannot see are not touched and the publish does not fail (Q15).
26. **28.190** discard confirm and preview state the attachment count (app dialog, MCP preview).

### 15.3 Mutation targets (named for the reviewer)

Drop `draft_author_id IS NULL` from `LIVE_TICKET_WHERE` → 28.051+ reds. Make `canSee` skip the draft test for the owner → 28.046 reds. Swap `canOpen` for `canSee` at `reconcile-route.ts:153` → 28.072 reds (the reconcile case in 28.070-28.089). Remove `'ticket.published'` from `GRANT_BACKFILL_TRIGGERS` → 28.095 reds. Remove the `draft` marker from the redaction → 28.023 reds.

### 15.4 Gate

Unit and integration suites only; the gate's task count is unchanged. The new migration runs in the existing DB setup.

## 16. Open questions (for the owner; each with its anchor)

> **Planner rulings (2026-10-03), technical — no owner call needed:** **Q15** accepted: "end of the Backlog" is the end as the publisher sees it (a fractional rank after the last row the publisher can see; a row the publisher cannot see keeps its own place). **Q16** accepted: a `note.attached`/`note.detached` that names a draft is withheld per viewer (only the draft's author sees it) until publish, then delivered as-is. **Q17** accepted: a refused re-file refuses the WHOLE publish (all-or-nothing, D7), with the refusal naming the link and the reason.

Q-numbers are stable. Resolved by the owner's review and removed: Q1 (Drafts page only, ruling 1), Q2 (owner and assignee excluded, ruling 2), Q3 (full history, ruling 5), Q4 (draft-side link storage, planner reconciliation), Q5 (erase now, ruling 4), Q8 (nav entry, ruling 1), Q10 (attachments allowed, comments after publish, ruling 3), Q11 (publish writes a rank, ruling 6), Q13 (`ingestAtomic` accepted).

**Q6. A draft is always born in Backlog.** From the approved copy ("Publishing makes every draft a Backlog ticket"). The dialog's switch (`new-ticket-dialog.tsx:1032`) is disabled ON for drafts. If drafts may carry a starting status, `publish` would have to set it, and the domain refine (§2.2) changes.

**Q7. A draft whose author loses access.** Default: it stays, closed to everyone, and returns if the author regains the role (R18). A project or workspace delete erases it with the rest (a project's erasure set includes its tickets). Alternative: auto-discard on `membership.revoked`; not built.

**Q9. `migrate_ticket_type` leaves drafts alone** (`builder-reads.ts:1076`); a published draft re-pins on publish (§2.3), so nothing is stranded. Confirm that an admin's bulk act should not touch private work.

**Q12. The mockups put a key on draft nodes** (`Timeline.dc.html`, "GN-148 Ready for client?" with the Draft pill). The owner's ruling is no key; the graph spec must show the pill in the key's place. Flagged because the approved image contradicts the ruling.

**Q14. `ticket.published` carries `projectId`** (redundant with the creation; engine-checked). The alternative is a join in the key query; chosen against because the purge then needs the creation row to keep its project AND its draft marker, and the query gets a self-join.



**Q15. "End of the Backlog" is the end as the publisher sees it.** Ranked rows draw above unranked rows (`packages/domain/src/rank.ts:85`), and a backfill can only rank rows the publisher can see: a `ticket.ranked` on a restricted ticket is refused by the permission gate (`check-permission.ts:1639`). Rows the publisher cannot see stay unranked and draw below the new ticket for people who can see them (the same limit a drag has today, `backlog-rank.ts:96-101`). Accept, or make publish refuse when the project's Backlog has rows the publisher cannot see.

**Q16. A note linked to a draft is the one claim that cannot live on the draft's stream.** `note.attached` is an event on the NOTE's stream (`check-permission.ts:1577-1585`), so it needs per-viewer withholding (R66, `visible-events-for.ts:714` area) and a re-delivery at publish. Default: supported as written. Alternative: refuse `note.attached` naming a draft until publish and drop R66 (the note section on a draft sheet is then disabled), which removes the only per-viewer event filter in this spec.

**Q17. A re-file can refuse a publish** (R44): if the publisher lost edit right on the source of an incoming link, or it was deleted, the whole publish is refused `draft.link-refile-refused`. Default: refuse (nothing half-public). Alternative: publish and drop that one link with a notice.

## 17. Files (expected)

- `packages/domain/src/events/ticket-events.ts`, `vocabulary.ts`, `ticket-state.ts`, `entity-state.ts`, `purge.ts`
- `packages/rule-engine/src/checks/hierarchy.ts` (parent guard factored; `draft.*` rules), a new `checks/drafts.ts`, `evaluate.ts`
- `apps/server/migrations/<ts>_drafts.sql`
- `apps/server/src/visibility/can-see.ts`, a new `can-open.ts`, `visible-events-for.ts`, `grant-backfill.ts`
- `apps/server/src/read/visible-where.ts`, `ticket-numbers.ts`, `deleted-items.ts`, `state-provenance.ts`, a new `read/drafts.ts`
- `apps/server/src/projections/tickets.ts`, `proj-visibility.ts`, `rollups.ts`; `visibility/rollup.ts`
- `apps/server/src/permissions/check-permission.ts`
- `apps/server/src/sync/sync-routes.ts`, `reconcile-route.ts`, `contests-route.ts`, `snapshot-writer.ts`
- `apps/server/src/routes/tickets.ts`, `builder-reads.ts`, `people.ts`, a new `routes/drafts.ts`
- `apps/server/src/ingest/ingest-service.ts` (`commitInTx`, `ingestAtomic`), a new `routes/drafts-publish.ts`
- `apps/server/src/routes/attachments.ts` (G10), `routes/tickets.ts` (attachment list)
- `packages/domain/src/rank.ts` (`planTailRank(rows, tailIds)`), `packages/app-core/src/views/backlog-rank.ts`
- `apps/server/src/purge/purge-item.ts`, `sweep.ts`, a new `discard-draft.ts`; `notifications/fanout.ts`, `sweep.ts`; `auto-close/sweep.ts`
- `packages/app-core/src/views/new-ticket-dialog.tsx`, `create-ticket-flow.tsx`, `ticket-sheet.tsx`, `history-copy.ts`, a new `drafts-page.tsx`; `view-types.ts`; `replica/replica-data-source.ts`; `precheck.ts`
- `packages/sync-client/src/outbox/outbox.ts`, `replica/replica.ts`
- `packages/mcp-server/src/tools/write-tools.ts`, a new `draft-tools.ts`, `register.ts`; `test/fixtures/tool-names.ts`
- `apps/web/app/w/[workspaceId]/drafts/page.tsx`, `apps/web/src/app-nav.tsx`
- `Features.md` §25, `test-cases/28-drafts.md`

## 18. Out of scope

- The Workflow and Timeline graphs, "leads to", Decision, auto-promotion, `publish_flow` (spec 2).
- Sharing a draft with a named person ("draft for review").
- Publishing someone else's draft; handing a draft to another author.
- Collaborators and comments on a draft (comments open after publish, owner ruling 3).
- Undo of a discard (owner ruling 4).
- An atomic multi-publish of ANY events other than `ticket.published` (R47 is general in shape, but only this route uses it).
- Encrypting drafts at rest.

## 19. Risks

- **The key query is the fragile part.** Two SQL statements and a trigger must agree; 28.020-28.025 pin parity, both purge failures and the trigger.
- **A new `proj_tickets` / `canSee` site added later** reopens the leak. The census test (28.050) fails on it by `file:line`; the plan's last task re-runs the census against the live release tip.
- **`reconcile` is the quiet one.** A draft not named by door G5 is purged from its author's device at the next catch-up, and looks like data loss.
- **`ingestAtomic` holds the workspace lock for up to 200 events**, which stalls every other write in that workspace while it runs; the route caps the set at 200 and the plan measures a 200-event publish.
- **`ingestAtomic` touches the hot path.** `commitOne` is the only writer; the factoring (R47) must leave single-event behaviour byte-identical (case 28.104). 
- **The `from` member** is a payload change to spec A's events; if the Drafts plan lands before A's T1 does, the member joins A's first version instead (no migration either way, absent = old meaning).
- **Discard deletes objects.** A bug in `objectKeysOf` scoping would delete another ticket's attachment; case 28.183 holds both controls.
- **Naming:** `NewTicketDraft` (form values) and Draft (state) share a word; §3.1.
