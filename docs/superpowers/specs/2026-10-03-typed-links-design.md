# Typed ticket links (Knowledge Graph spec A) — design

**Date:** 2026-10-03.

**Base:** `release/smoothness` @ `dce9ca61`, where the code below was read.

**Target branch:** the next release branch, after `release/smoothness` ships. It does not exist yet; the owner cuts it (one release branch at a time).

**Status:** the owner approved the design in conversation on 2026-10-03 ("write the specs A to E"). This file is the written spec for review.

**Series:**

| Spec | Subject | Depends on |
|---|---|---|
| A (this) | Typed links | — |
| B | Reference index and backlinks | — |
| C | Knowledge Graph view | A, B |
| D | MCP graph query and semantic layer | C |
| E | Home | C |

The plans go in the order A → B → C → E → D.

**Owner's words:**
- "graph view"; links between tickets "blocks / relates / duplicates" (brainstorm, 2026-10-03).
- The edge inspector's "Remove link" for typed links was shown in mockup v4 and the Sigma port, with no objection.

**Decisions taken in conversation:**
- **Kinds:** three link kinds — blocks, relates, duplicates.
- **Events:** `ticket.link_*`.

**Assumptions** (not stated by the owner; correct them at review):
- A link joins two tickets in the same workspace. Cross-workspace links are refused.
- Marking a duplicate does not close either ticket. Closing stays a separate act.
- Links send no notifications in this spec.

## 1. What exists today

**Ticket to ticket.** Only parent/child exists:
- `parentId` on `ticket.created` and `ticket.reparented {newParentId}` (`packages/domain/src/events/ticket-events.ts:42`, `:208`);
- it is projected to `proj_tickets.parent_id`.

There is no typed relation.

**Note to ticket.** This is `note.attached` / `note.detached {ticketId}` on the note stream (`events/note-events.ts:97`):
- the table is `proj_note_attachments (note_id, ticket_id)`;
- the MCP tool is `link_note` (`packages/mcp-server/src/tools/note-tools.ts:156`);
- the app section is `TicketNotesSection` (`packages/app-core/src/views/ticket-notes-section.tsx:37`).

**Events** are registered in `packages/domain/src/vocabulary.ts`. A type is `<noun>.<verb>`, version 1, with a zod payload. A new optional member means "absent = the old meaning".

## 2. The model

### 2.1 Kinds and direction

| Kind | Stored as | Reads from the source | Reads from the target |
|---|---|---|---|
| `blocks` | source blocks target | "blocks GN-142" | "is blocked by GN-133" |
| `relates` | unordered pair | "relates to GN-120" | "relates to GN-151" |
| `duplicates` | source duplicates target (the original) | "duplicates GN-142" | "is duplicated by GN-139" |

### 2.2 Events (ticket entity, version 1)

```ts
ticketLinkAddedPayload   = z.object({ kind: z.enum(['blocks','relates','duplicates']), targetId: ulidString }).strict();
ticketLinkRemovedPayload = z.object({ kind: z.enum(['blocks','relates','duplicates']), targetId: ulidString }).strict();
```

- **`ticket.link_added`** goes on the SOURCE ticket's stream; that stream is the link's home.
- **`ticket.link_removed`** goes on the same stream, whoever removes it. Removing from the target's side writes to the source's stream, which keeps one history of the link.
- **No new entity kind.** `ENTITY_KINDS` stays as it is (`packages/domain/test/envelope.test.ts:310` pins its exact list).

### 2.3 Rules (the server's precheck and `check-permission`)

1. A ticket cannot be linked to itself.
2. Both tickets must be in the same workspace and neither may be deleted (in the trash).
3. **No duplicate links:**
   - `blocks` and `duplicates` are refused if the same ordered pair already holds that kind;
   - `relates` is refused if the pair holds it in either direction.
4. **`blocks` refuses its direct reverse.** If B already blocks A, then A blocks B is refused ("GN-142 already blocks GN-133"). Longer cycles are allowed, because detecting them costs a graph walk at write time and they are rare.
5. **`duplicates` refuses its direct reverse**, for the same reason as rule 4.
6. **Who may add:** someone who may edit the source ticket (the same right as `ticket.field_set`) AND can see the target (`canSee`, `apps/server/src/visibility/can-see.ts:283`).
7. **Who may remove:** someone who may edit either end.

**Refusal text.** Errors name the rule in the house shape, `refused by <rule>: <reason>` (`packages/mcp-server/src/submit.ts:21`).

### 2.4 Visibility

A link is shown only to a viewer who can see BOTH tickets. When the viewer can't see one end, the link is left out entirely; there is no "1 hidden link" count, because that would leak the hidden ticket's existence. This matches the graph's rule that items the viewer can't see are left out.

### 2.5 Projection

Migration `apps/server/migrations/<next 13-digit>_proj-ticket-links.sql`:

```sql
CREATE TABLE proj_ticket_links (
  workspace_id text NOT NULL,
  source_id    text NOT NULL,
  target_id    text NOT NULL,
  kind         text NOT NULL CHECK (kind IN ('blocks','relates','duplicates')),
  created_by   text NOT NULL,        -- actorId of the link_added event
  created_at   timestamptz NOT NULL, -- serverTime of the link_added event
  origin       text NOT NULL,        -- 'web' | 'mobile' | 'mcp' …, for the provenance line
  seq          bigint NOT NULL,
  PRIMARY KEY (source_id, target_id, kind)
);
CREATE INDEX proj_ticket_links_target_idx ON proj_ticket_links (target_id);
CREATE INDEX proj_ticket_links_ws_idx ON proj_ticket_links (workspace_id);
```

**The projection** is `apps/server/src/projections/ticket-links.ts`:
- `link_added` inserts a row and `link_removed` deletes it;
- it is registered in `buildProjectionRegistry()` after `proj_tickets` (the order is load-bearing, `projections/index.ts:68-198`);
- `relates` is stored as written, and its "either direction" rule is enforced in the precheck.

**Deletion and purge.** A ticket moved to the trash keeps its rows, and reads hide them (rule 2 and §2.4). Restore brings them back. Purge deletes every row that touches the ticket (`apps/server/src/purge/`).

### 2.6 The vocabulary census (new event type ⇒ every list)

Each of these is updated in the same change, and the plan's last task greps the registry against each one:

| Place | What changes |
|---|---|
| `packages/domain/src/vocabulary.ts` | register both types |
| `packages/domain/src/ticket-state.ts:84` `TICKET_EVENT_TYPES`, `applyTicketEvent` (:118) | the ticket's own state carries `links` |
| `apps/server/src/sync/sync-routes.ts:94` `BOOTSTRAP_BACKFILL_TYPES` | its docblock says nothing fails if this is missed |
| `packages/rule-engine/src/evaluate.ts:33` + `fixtures/harness.ts` | a no-op arm; workflow rules do not react to links |
| `packages/app-core/src/precheck.ts:162` | rules 1–5 on the client |
| `apps/server/src/permissions/check-permission.ts` (:656, switch ~:952) | rules 6–7 |
| `packages/app-core/src/views/history-copy.ts:109` `describeEvent` | "Ama Rangsa linked: GN-133 blocks GN-142" / "removed the link …" |
| `packages/mcp-server/src/tools/ticket-tools.ts:41` `redactedPayload` | a target the reader can't see is redacted to "a ticket you can't see" |
| `apps/server/src/notifications/fanout.ts` | an explicit no-op (no notification) |
| `apps/server/src/purge/check-purged.ts:35-52` | a purged target |
| `packages/sync-client/src/replica/replica.ts` | the offline replica applies both |

## 3. App

### 3.1 Ticket sheet: a "Links" section in Details

This goes in `ticket-sheet.tsx`, under the fields and above notes:
- **Grouping.** Rows are grouped by the reading from this ticket (blocks / is blocked by / relates to / duplicates / is duplicated by).
- **A row** shows the other ticket's status dot, key and title, and a Remove button.
- **Remove** writes `ticket.link_removed`, and shows a toast with Undo (Undo writes `link_added` again).
- **"Add link".** The kind is a Select, and the ticket picker reuses the `:ticket` reference search (`packages/editor/src/extensions/ticket-ref.ts:181`), so there is one way to find a ticket.
- **Phone.** The same section goes in the phone sheet, and the picker is the full-height phone list.
- **Optimism.** It follows the smoothness rules (a pending row shows at once and rolls back on a refusal).

### 3.2 Elsewhere

- **History** shows both events (§2.6).
- **Board cards and lists** are unchanged. A "blocked by an open ticket" mark on the card is out of scope (§7).

## 4. MCP

**New write tool `link_tickets`:**
- input `{ ticketId, targetId, kind: 'blocks'|'relates'|'duplicates', action: 'add'|'remove' }`;
- it emits through `envelopeFor` (`submit.ts:43`), so the actor and `origin:'mcp'` are recorded;
- add it to `packages/mcp-server/test/fixtures/tool-names.ts` (14.80/14.81).

**`get_ticket`** gains `links: [{kind, direction:'out'|'in', ticket:{id,key,title}}]`, visible ends only.

**Restated MCP rule (spec D, D2).** This tool is visible in the app (the Links section and history), attributed (the actor, plus "via Claude" for `origin:'mcp'`), and removable by a member.

## 5. Testing and proof

### 5.1 Case block

The Knowledge Graph series opens **Features.md §24 "Knowledge Graph"** ↔ **`test-cases/27-knowledge-graph.md`**:
- every live release tip was grepped on 2026-10-03, and none has §24 or a file 27;
- the plan re-greps every live release tip before allocating.

| Block | Spec |
|---|---|
| 27.001–27.094 | A (this spec; T4b's 27.080–27.094 added 2026-10-04) |
| 27.100–27.179 | B |
| 27.200–27.349 | C |
| 27.400–27.549 | D |
| 27.600–27.659 | E |

Each case's test carries its id.

### 5.2 Cases (in order, RED first)

1. **Domain.** Each payload accepts its shape and refuses an unknown kind or an extra member.
2. **Precheck and permission.** One case per rule in §2.3, each with its control in the same `it`; for example, a self-link is refused while the same call with another target is accepted.
3. **Projection.** Add, then remove, leaves no row. A trash then restore keeps the row. A purge deletes it. A rebuild from the ledger equals the live table (`tools/verify-projections.ts`).
4. **Visibility.** A viewer without access to the target sees no row and no count. The control is a viewer with access, who sees it.
5. **History text** for both events, from both ends.
6. **MCP `link_tickets`.** It adds, removes and refuses (the rule text passes through). `get_ticket` shows only visible ends.
7. **Census.** A test that lists every registered `ticket.*` type and asserts each list in §2.6 handles it, so a missing arm fails.
8. **App.** Add, Undo and remove in the Links section, desktop and phone.

### 5.3 Gate

These are unit and integration suites only, so the gate's task count is unchanged.

## 6. Files (expected)

- `packages/domain/src/events/ticket-events.ts`, `vocabulary.ts`, `ticket-state.ts`.
- `apps/server/migrations/<ts>_proj-ticket-links.sql`, `apps/server/src/projections/ticket-links.ts`, `projections/index.ts`.
- `apps/server/src/permissions/check-permission.ts`, `sync/sync-routes.ts`, `purge/*`.
- `packages/app-core/src/precheck.ts`, `views/ticket-sheet.tsx`, a new `views/ticket-links-section.tsx`, `views/history-copy.ts`.
- `packages/mcp-server/src/tools/ticket-tools.ts`, `test/fixtures/tool-names.ts`.
- `packages/sync-client/src/replica/replica.ts`, `packages/rule-engine/src/evaluate.ts`.
- `Features.md` §24, `test-cases/27-knowledge-graph.md`.

## 7. Out of scope

- Notifications on link changes.
- A "blocked" mark on board cards.
- Closing a duplicate automatically.
- Cross-workspace links.
- Detecting cycles longer than two.
- Bulk linking.

## 8. Risks

- **The census.** `BOOTSTRAP_BACKFILL_TYPES` fails silently if it is missed, which is why case 7 exists.
- **A link pointing into a ticket the viewer can't see** must not leak through history or MCP redaction, which is why cases 4 and 6 exist.
