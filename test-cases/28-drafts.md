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

- ❌ **28.001 — `ticket.created` accepts `draft: true` only with `start: 'backlog'` and no `stateId`:** it is refused with `start: 'focus'`, with `start` absent, with a `stateId`, and with `draft: false`; the refusal message is `a draft is born in the backlog: send start: "backlog" and no stateId`. Control: the same payload without `draft` still parses (a v1 event), with `start: 'focus'` and with `start` absent. Mutation: drop the second `.refine` → the `start: 'focus'` arm parses.
- ❌ **28.002 — `ticket.published` is strict `{projectId: ULID}` and `ticket.discarded` is strict `{}`;** both registered at version 1 against entity kind `ticket` only, each once in `registrations()`. Control: `parseEvent` accepts both on a ticket and refuses both on a note with `entity-kind-mismatch`. Mutation: drop `.strict()` from `ticketPublishedPayload` → the extra-member arm parses.
- ❌ **28.003 — the reducer: a draft creation sets `draft = {authorId, at}` from the envelope (actor and server time), stays in Backlog with `rank: null`; `ticket.published` removes the key and re-pins `workflowId` / `workflowVersion` to the type's CURRENT binding while the state stays Backlog;** control: a ticket whose type was re-pointed while it was a draft ends on the NEW workflow, and a ticket created without `draft` has no `draft` key (`'draft' in state === false`) and is unchanged by the same type re-point. Mutation: skip the re-pin → the new workflow id is not reached.
- ❌ **28.004 — `ticket.discarded` sets `draft.discarded = true` and keeps `authorId` and `at`; `ticket.published` and `ticket.discarded` on a ticket that is not a draft throw, naming the ticket;** control: both fold on a draft, and `isDraft` / `isDiscardedDraft` read the flag (`isDraft` stays true after a discard so every door can tell "gone" from "published").
- ❌ **28.005 — THE CENSUS (server) now covers the draft pair:** both types are in `TICKET_EVENT_TYPES` (so the census of 27.004 stays empty), `payloadIds('ticket.published', {projectId})` names the project, `payloadIds('ticket.discarded', {})` names nothing, and a committed `ticket.discarded` notifies nobody (owner ruling 2026-10-04: a discard leaves no trace). Control: the planted type is still reported. Mutation: remove `'ticket.published'` from `TICKET_EVENT_TYPES` → red naming it.
- ❌ **28.006 — History narrates the pair:** a `ticket.created` with `draft: true` reads `Drafted as <Type>`, `ticket.published` reads `Published`, and `ticket.discarded` reads `Discarded` (never shown: the stream is erased, but the census of 3.183 wants every type narrated). Control: a `ticket.created` without `draft` still reads `Created as <Type>`. Mutation: ignore `draft` → the first arm reads `Created as`.
- ❌ **28.007 — the author's allowlist:** `draftAllows` is true for exactly the eight allowlisted types and the exempt bookkeeping types, and every other ticket-scoped registration is refused with `A draft cannot be <verb>. Publish it first, or discard it.` (`ticket.deleted`: `A draft cannot be deleted. Discard it instead.`). The CENSUS partitions the registry's ticket-scoped types into allowed, exempt and refused, so a new ticket type must pick a side; control: a planted `ticket.planted_for_census` is reported as unclassified. Mutation: add `ticket.transitioned` to `DRAFT_ALLOWED_EVENT_TYPES` → red naming it.
- ❌ **28.008 — the live-ticket gate refuses both on a deleted ticket** (`deleted-ticket`) and the E6-2 table covers the new registrations (so a ticket-scoped type that picks neither side fails the case). Control: the same events pass the gate on a live twin.
- ❌ **28.009 — `TICKET_EVENT_TYPES` has nineteen members and both draft types are in it;** control: the registry check in the same `it` still holds for every member. (`packages/domain/test/ticket-state.test.ts`)

## 28.2 Keys and purge (T2)

<!-- drafts T2 -->

## 28.3 Projections and the privacy predicates (T3)

<!-- drafts T3 -->

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
