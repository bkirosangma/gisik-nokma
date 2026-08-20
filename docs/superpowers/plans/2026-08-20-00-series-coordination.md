# Plan series coordination — Gisik Nokma

**Date:** 2026-08-20
**Spec:** `docs/superpowers/specs/2026-08-20-gisik-nokma-product-design.md`
**Role of this document:** the single authority for cross-plan interfaces, naming, and ownership. Plans 1–4 were written in parallel from one pinned contract; where they drifted or where the contract was silent, the decisions below reconcile them. Where a plan disagrees with this document, this document wins. Later plans (5–11) are written against the contract *as amended here*.

## The series

| # | Plan | Document | Status |
|---|---|---|---|
| 1 | Foundation & event ledger | `2026-08-20-01-foundation-ledger.md` | written |
| 2 | Workflow engine & rule vocabulary | `2026-08-20-02-workflow-engine.md` | written |
| 3 | Tickets, hierarchy & rollups | `2026-08-20-03-tickets-hierarchy.md` | written |
| 4 | Auth, workspaces & visibility | `2026-08-20-04-auth-visibility.md` | written |
| 5 | API, realtime & search | `2026-08-20-05-api-realtime-search.md` | written in parallel |
| 6 | Web client core | `2026-08-20-06-web-client.md` | written in parallel |
| 7 | Editor & attachments | `2026-08-20-07-editor-attachments.md` | written in parallel |
| 8 | Workflow builder UI | `2026-08-20-08-workflow-builder.md` | written in parallel |
| 9 | Calendar, timeline & notifications | `2026-08-20-09-calendar-notifications.md` | written in parallel |
| 10 | Offline sync & the apps | `2026-08-20-10-offline-sync-apps.md` | written in parallel |
| 11 | Deployment & dogfooding | `2026-08-20-11-deployment-dogfooding.md` | written in parallel |

Execution order: 1 → 2 → 3 → 4 → 5, then 6/7/8/9 in parallel, then 10, then 11. Each plan's Interfaces blocks are the contract for its successors. Features.md/test-cases numbering: Plan 5 → §7/`07-api-realtime-search` · 6 → §8/`08-web-client` · 7 → §9/`09-editor-attachments` · 8 → §10/`10-workflow-builder` · 9 → §11/`11-calendar-notifications` · 10 → §12/`12-offline-sync-apps` · 11 → §13/`13-deployment-dogfooding`.

## Reconciliation decisions

1. **Package scope is `@gisik-nokma/*`** — `@gisik-nokma/domain`, `@gisik-nokma/rule-engine`, `@gisik-nokma/server`. Plan 1 owns the scaffold; `@gisik/*` specifiers elsewhere were drift.

2. **`Features.md` sections and `test-cases/` buckets:** §3 + `test-cases/03-foundation-ledger.md` → Plan 1 · §4 + `test-cases/04-workflow-engine.md` (cases 4.x) → Plan 2 · §5 + `test-cases/05-tickets-hierarchy.md` (cases 5.x) → Plan 3 · §6 + `test-cases/06-auth-visibility.md` (cases 6.x) → Plan 4. Plans 5–11 claim §7+ / 07+ in order, one bucket each.

3. **`WorkflowDef` gains explicit `initialStateId: string`** (contract amendment). A positional "first state in the list" initial state is the silent-reorder defect the base's slug-versus-position lesson exists to kill — the builder UI will reorder states visually, and semantics must not follow the order. `validateWorkflowDef` refuses an `initialStateId` naming no state; reachability is computed from it. Every `WorkflowDef` literal in every plan and fixture carries it.

4. **Entity-state types are defined once, in `@gisik-nokma/domain`:**
   - `EntityState` is the discriminated union `TicketState | MembershipState | OtherEntityState` (Plan 2's shape). Plan 1's head-pointer type is renamed **`EntityHead`** (`proj_entity_heads`' natural product; `readEntityHead → EntityHead | null`).
   - **`TicketState`** is Plan 3's full shape (id, workspaceId, projectId, typeId, parentId, workflowId, stateId, stateCategory, assigneeId, collaboratorIds, fields with per-field `FieldClaim` provenance) **plus** Plan 2's transition log `transitions: { toStateId: string; actorId: string; seq: number }[]` — `require-different-user` resolves its named earlier transition from this log via `ctx.getEntityState`. Plan 2's Task 2 is the definition site; Plan 3's reducer produces (not redefines) the type.

5. **Membership entity id is deterministic:** `membershipId(workspaceId, userId)` = `` `${workspaceId}:${userId}` `` (Plan 2's helper in domain). Plan 4's fresh-ULID-per-event mapping was drift — the engine must address a membership from `(workspaceId, actorId)` via `getEntityState('membership', id)`, which an opaque ULID cannot do. Scope stays in the payload; `proj_memberships` keys as Plan 4 designed.

6. **`ticket.transitioned` is registered exactly once, by Plan 3** (Task 2, contracted payload `{toStateId, comment?, evidenceAttachmentId?}`). Plan 2's registration is provisional for its own tests and is deleted when Plan 3 lands. `workflow.defined` belongs to Plan 2; the remaining ticket vocabulary to Plan 3; workspace/project/membership/visibility events to Plan 4; Plan 1's `workspace.created`/`workspace.renamed` seeds are provisional until Plan 4 lands.

7. **Parent-terminal rule id is `parent-terminal-with-open-children`** (Plan 2 owns the rule and its reason string; Plan 3's `invariant.parent-open-children` was drift).

8. **The projection registry applies projections in registration order** within each event's transaction (Plan 1 guarantee; Plan 3's `proj_rollups` reads `proj_tickets` and depends on it). Registration order: `proj_entity_heads`, `proj_workflows`, `proj_ticket_types`, `proj_tickets`, `proj_rollups`, `proj_memberships`, `proj_visibility`.

## Contract amendments recorded (no plan edits needed)

- `canSee` and `visibleEventsFor` take a leading `db: Queryable` parameter (DI per CODING_STANDARDS); `visibleEventsFor` yields `SyncItem = EventEnvelope | PurgeInstruction` — purge tombstones are how revocation reaches replicas. Plan 10 consumes this shape.
- Rule-id strings are opaque, module-scoped identifiers; the exact values listed in each plan's Produces block are the contract. Styles differ across modules; they do not converge.
- Duplicate event id refuses as `duplicate-event-id` for now; Plan 10 may propose idempotent-accept for at-least-once sync retries (additive).
- The `snapshots` table ships in Plan 1 with no writer; snapshot-taking policy is assigned to **Plan 10** (replica bootstrap is its first real need).
- Plan 3 owns `GET /v1/tickets/:id/history`; Plan 4 owns ticket read endpoints and wraps its read enforcement (visibility, restricted-parent placeholder, provenance-untouched) around both.
- Auth library is **better-auth** (Plan 4's justification stands) — flagged for owner sign-off at plan review.
- Sub-task-requires-parent applies to the built-in `sub-task` type only; whether custom max-rank types inherit the constraint is a spec-owner question deferred to Plan 8 (builder UX makes it concrete).

## Owner decision (2026-08-20): live children under terminal parents — reopen as an offered option

Creating a new child under a terminal parent, or reparenting a non-terminal child under one, is **allowed but may not leave the contradiction standing**. Mechanics:

- The engine refuses the bare `ticket.created`/`ticket.reparented` (rule `hierarchy.parent-terminal`), with the remedy named in the reason: the parent must reopen because it is acquiring live work.
- Clients present the option **at the moment it happens**: "Parent X is <terminal state>. Reopen it to [selectable non-terminal state] and proceed?" On acceptance the client emits the parent's `ticket.transitioned` first (to the chosen state), then the child event. The parent workflow's own transition rules still apply to the reopen — a restrict-to on leaving Done is honoured, not bypassed.
- `ticket.transitioned` payload gains optional `cause?: { kind: 'reopened-for-child'; childTicketId: string }`; boards render it ("reopened — live work added"), so the reopen is never an anonymous flip.
- **Pending doc amendments (orchestrator applies after the reconciliation agent finishes, to avoid concurrent edits):** Plan 3 — the two refusals + `cause` in the `ticket.transitioned` registration + planted-defect fixtures; Plan 2 — additive `cause` passthrough where transition payload is parsed.

## Amendments pinned for plans 5–11 (written in parallel against these)

9. **`blocked` state flag.** A workflow state may carry optional `blocked?: boolean` (additive to `WorkflowDef`; category stays one of the three). The attention strip's "blocked" bucket reads this flag; templates set it on their Blocked states; the builder exposes it as a checkbox. (Plan 2 zod gains the optional field — pending amendment as above.)
10. **`packages/app-core` + `DataSource`.** Shared React views/view-models (Board, List, My Work, Calendar, Timeline, ticket sheet, attention strip) consume a `DataSource` interface — `{ ingest(events: SubmittedEvent[]): Promise<IngestResult[]>; query: typed read functions; subscribe(workspaceId, afterSeq, cb): Unsubscribe }` — implemented twice: **online** (Plan 6: HTTP + WebSocket) and **replica** (Plan 10: local store + outbox). Views never speak HTTP directly.
11. **`packages/ui` is the one colour origin.** Design tokens live in `packages/ui/src/tokens.ts`; no colour literal anywhere else in any client; a test enforces it (the base's token discipline, carried over).
12. **`packages/editor`.** Tiptap v3; description/comment bodies are its ProseMirror JSON, opaque outside the editor; image node with `wrap: 'inline-left'|'inline-right'|'block'`; a structured mention node `{userId}`; RN hosts the editor in a webview. `@gisik-nokma/domain` exports a dependency-free `docToPlainText(doc: unknown): string` JSON-walker for search/notifications.
13. **Realtime protocol (Plan 5 owns the server side).** WS `/v1/stream`; client → `{type:'subscribe', workspaceId, afterSeq}`; server → `{type:'event', envelope}` · `{type:'purge', entityId}` · `{type:'caught-up', seq}` · ping/pong. Backed by `visibleEventsFor` + `onEventCommitted`.
14. **Preferences are server-owned per-user rows, not ledger events** — saved filters, list columns, grouping choices. `/v1/me/preferences` (Plan 5 owns store + routes). View preferences arrange truth; they are not history.
15. **Attachments.** `POST /v1/attachments` (multipart) → `{attachmentId, url}`; storage behind an `ObjectStore` interface with an S3-compatible implementation; then the `attachment.added` event references it (Plan 7 owns).
16. **Contested claims live in the ledger.** Offline-originated events arrive via `POST /v1/sync` (Plan 10 adds it, wrapping ingest). A sync-time refusal appends a `claim.contested` event (entity = the ticket; payload = the original event, rule, reason) — the contest is itself history, visible to everyone who can see the ticket. Resolution is `claim.contested_resolved { resolution: 'redone'|'converted-to-comment'|'discarded' }`. Interactive `POST /v1/events` refusals return without recording. On the sync path, `duplicate-event-id` becomes idempotent-accept (retries are expected); interactive ingest keeps the refusal.
17. **Client shells.** `apps/web` = Next.js 15 App Router, online DataSource. `apps/desktop` = Tauri 2 + Vite React, app-core + replica DataSource. `apps/mobile` = React Native (Expo), native navigation over app-core view-models, webview editor, replica DataSource. Local replica storage is SQLite on both app platforms behind one storage interface; the local read model is built from domain reducers (`applyTicketEvent` + workflow defs), never from the server's pg projections.
18. **`workspace_seq` is the stream cursor** (defect found by Plan 5, case 7.34): per-entity `seq` cannot order a workspace stream — resuming at `afterSeq` would silently skip newer entities' early events. The `events` table gains `workspace_seq bigint` with `UNIQUE(workspace_id, workspace_seq)`, assigned in the ingest transaction under a per-workspace advisory lock; `visibleEventsFor(…, afterSeq)` filters and orders by it; `{type:'caught-up', seq}` carries it; per-entity `seq` keeps its role (entity history, replay, snapshots). Clients treat `afterSeq` as an opaque resume token. **Applied** to Plan 1 (schema, two-lock ingest — workspace lock before entity lock, always that order — and ledger store, which now returns `LedgerEvent = EventEnvelope & { workspaceSeq: number }`) and Plan 4 (`visibleEventsFor` filters and orders by it; `SyncItem = LedgerEvent | PurgeInstruction`). The domain `EventEnvelope` stays frozen: `workspaceSeq` is server-enriched on read, never a client-authored field.
19. **Stream frames carry `workspaceId`** on purge/caught-up/error (additive; forced by multi-workspace subscriptions on one socket). Purge frames carry no seq; purge-only drains may re-emit and must be idempotent (they are deletes).
20. **Route prefixes:** the product API lives under `/v1/*`; better-auth's vendor surface stays mounted at `/api/auth/*`. Both are deliberate; no unification.
