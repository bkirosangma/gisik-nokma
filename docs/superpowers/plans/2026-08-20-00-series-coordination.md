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

Execution order: 1 → 2 → 3 → 4 → 5, then 6/7/8/9 in parallel, then 10, then 11 — **superseded for Plans 3–11 by the owner decision of 2026-08-28 (parallel waves), at the end of this document.** Each plan's Interfaces blocks are the contract for its successors. Features.md/test-cases numbering: Plan 5 → §7/`07-api-realtime-search` · 6 → §8/`08-web-client` · 7 → §9/`09-editor-attachments` · 8 → §10/`10-workflow-builder` · 9 → §11/`11-calendar-notifications` · 10 → §12/`12-offline-sync-apps` · 11 → §13/`13-deployment-dogfooding`.

## Reconciliation decisions

1. **Package scope is `@gisik-nokma/*`** — `@gisik-nokma/domain`, `@gisik-nokma/rule-engine`, `@gisik-nokma/server`. Plan 1 owns the scaffold; `@gisik/*` specifiers elsewhere were drift.

2. **`Features.md` sections and `test-cases/` buckets:** §3 + `test-cases/03-foundation-ledger.md` → Plan 1 · §4 + `test-cases/04-workflow-engine.md` (cases 4.x) → Plan 2 · §5 + `test-cases/05-tickets-hierarchy.md` (cases 5.x) → Plan 3 · §6 + `test-cases/06-auth-visibility.md` (cases 6.x) → Plan 4. Plans 5–11 claim §7+ / 07+ in order, one bucket each.

3. **`WorkflowDef` gains explicit `initialStateId: string`** (contract amendment). A positional "first state in the list" initial state is the silent-reorder defect the base's slug-versus-position lesson exists to kill — the builder UI will reorder states visually, and semantics must not follow the order. `validateWorkflowDef` refuses an `initialStateId` naming no state; reachability is computed from it. Every `WorkflowDef` literal in every plan and fixture carries it.

4. **Entity-state types are defined once, in `@gisik-nokma/domain`:**
   - `EntityState` is the discriminated union `TicketState | MembershipState | OtherEntityState` (Plan 2's shape). Plan 1's head-pointer type is renamed **`EntityHead`** (`proj_entity_heads`' natural product; `readEntityHead → EntityHead | null`).
   - **`TicketState`** is Plan 3's full shape (id, workspaceId, projectId, typeId, parentId, workflowId, stateId, stateCategory, assigneeId, collaboratorIds, fields with per-field `FieldClaim` provenance) **plus** Plan 2's transition log `transitions: { toStateId: string; actorId: string; seq: number; workflowId: string; workflowVersion: number }[]` — `require-different-user` resolves its named earlier transition from this log via `ctx.getEntityState`. Plan 2's Task 2 is the definition site; Plan 3's reducer produces (not redefines) the type. The per-entry `workflowVersion` is the owner decision of 2026-08-26 below: without it a remapped state id silently disarms four-eyes.

5. **Membership entity id is deterministic:** `membershipId(workspaceId, userId)` = `` `${workspaceId}:${userId}` `` (Plan 2's helper in domain). Plan 4's fresh-ULID-per-event mapping was drift — the engine must address a membership from `(workspaceId, actorId)` via `getEntityState('membership', id)`, which an opaque ULID cannot do. Scope stays in the payload; `proj_memberships` keys as Plan 4 designed.

6. **`ticket.transitioned` is registered exactly once, by Plan 3** (Task 2, ~~contracted payload `{toStateId, comment?, evidenceAttachmentId?}`~~ — **superseded 2026-08-28 by the keystone; see the amendment immediately below**). ~~Plan 2's registration is provisional for its own tests and is deleted when Plan 3 lands.~~ **Verified at the keystone: Plan 2 registered nothing, so there was nothing to delete.**

   **Amendment (2026-08-28, recorded by the change set that discovered it — Plan 3's keystone micro-PR).** The registered payload is **Plan 2's shipped `ticketTransitionedPayloadSchema`** (`packages/domain/src/workflow.ts`), not the literal this decision named when it was written — which predates Plan 2's execution. Four consequences, all load-bearing for the lanes running in parallel:
   - **The field is `to`, not `toStateId`.** The engine reads `payload.to` (`packages/rule-engine/src/transition.ts`) and every fixture on `main` already speaks it. Shipped code beats plan text; this is that law applied, not a new decision.
   - **`comment` is `{ text }`, not a bare string.**
   - **`evidenceAttachmentId` and `cause.childTicketId` are not ULID-checked at the door.** Plan 7's evidence gates own existence and kind; the door proves shape only.
   - **`toStateId` remains correct for the transition-log ENTRY** (decision 4, unchanged). The payload and the log entry are two layers that happen to describe the same move — both spellings are right in their own place, and this is not a fork.

   **What every later plan must do with this:** Plans 5, 6, 10 and 11 carry ~36 `payload: { toStateId: … }` literals, and Plans 6 and 10 additionally carry `comment: '<string>'`. Plan 6's are the dangerous ones because they are client *logic*, not fixtures — a client transcribed verbatim from that plan submits payloads the shipped door refuses as `invalid-payload`. Adapt them at transcription, per the adaptation-map law, and do not "correct" the shipped schema to match a plan written before it existed. `workflow.defined` belongs to Plan 2; the remaining ticket vocabulary to Plan 3; workspace/project/membership/visibility events to Plan 4; Plan 1's `workspace.created`/`workspace.renamed` seeds are provisional until Plan 4 lands.

7. **Parent-terminal rule id is `parent-terminal-with-open-children`** (Plan 2 owns the rule and its reason string; Plan 3's `invariant.parent-open-children` was drift).

8. **The projection registry applies projections in registration order** within each event's transaction (Plan 1 guarantee; Plan 3's `proj_rollups` reads `proj_tickets` and depends on it). Registration order: `proj_entity_heads`, `proj_workflows`, `proj_ticket_types`, `proj_projects`, `proj_tickets`, `proj_rollups`, `proj_memberships`, `proj_visibility`. (`proj_projects` was added by the owner decision of 2026-08-26 below, and sits before `proj_tickets` because the ticket precondition reads it.)

## Contract amendments recorded (no plan edits needed)

- `canSee` and `visibleEventsFor` take a leading `db: Queryable` parameter (DI per CODING_STANDARDS); `visibleEventsFor` yields `SyncItem = EventEnvelope | PurgeInstruction` — purge tombstones are how revocation reaches replicas. Plan 10 consumes this shape.
- Rule-id strings are opaque, module-scoped identifiers; the exact values listed in each plan's Produces block are the contract. Styles differ across modules; they do not converge.
- Duplicate event id refuses as `duplicate-event-id` for now; Plan 10 may propose idempotent-accept for at-least-once sync retries (additive).
- The `snapshots` table ships in Plan 1 with no writer; snapshot-taking policy is assigned to **Plan 10** (replica bootstrap is its first real need).
- Plan 3 owns `GET /v1/tickets/:id/history`; Plan 4 owns ticket read endpoints and wraps its read enforcement (visibility, restricted-parent placeholder, provenance-untouched) around both.
- Auth library is **better-auth** (Plan 4's justification stands) — flagged for owner sign-off at plan review.
- ~~Sub-task-requires-parent applies to the built-in `sub-task` type only~~ — **superseded by the owner sign-off below**: the requirement follows the rank (`rank >= DEEPEST_RANK`, the constant fixed at the built-in sub-task's 4), so any custom type at or below the deepest rank requires a parent too.

## Owner decision (2026-08-20): live children under terminal parents — reopen as an offered option

Creating a new child under a terminal parent, or reparenting a non-terminal child under one, is **allowed but may not leave the contradiction standing**. Mechanics:

- The engine refuses the bare `ticket.created`/`ticket.reparented` (rule `hierarchy.parent-terminal`), with the remedy named in the reason: the parent must reopen because it is acquiring live work.
- Clients present the option **at the moment it happens**: "Parent X is <terminal state>. Reopen it to [selectable non-terminal state] and proceed?" On acceptance the client emits the parent's `ticket.transitioned` first (to the chosen state), then the child event. The parent workflow's own transition rules still apply to the reopen — a restrict-to on leaving Done is honoured, not bypassed.
- `ticket.transitioned` payload gains optional `cause?: { kind: 'reopened-for-child'; childTicketId: string }`; boards render it ("reopened — live work added"), so the reopen is never an anonymous flip.
- **Pending doc amendments (orchestrator applies after the reconciliation agent finishes, to avoid concurrent edits):** Plan 3 — the two refusals + `cause` in the `ticket.transitioned` registration + planted-defect fixtures; Plan 2 — additive `cause` passthrough where transition payload is parsed.

## Owner sign-offs (2026-08-20) — all blocking questions answered

| Question | Decision | Plans to amend |
|---|---|---|
| Auth library | **better-auth** — approved | none (as planned) |
| Hosting | **DigitalOcean App Platform + Managed PostgreSQL in BLR1** (convenience-corner's stack) **+ DigitalOcean Spaces in BLR1** for object storage. Spaces was compared against convenience-corner's Cloudflare R2 and won on **data residency**: this product takes arbitrary user uploads served under permission checks, and R2 pins only to EU/US jurisdictions (`apac` is a best-effort, unchangeable hint) while Spaces BLR1 keeps files in Bangalore beside the ledger. R2 is cheaper — free egress versus $0.01/GiB after the 1 TiB included — so revisit when monthly egress approaches 1 TiB; `ObjectStore` keeps the switch a config change. Spaces Standard is available in BLR1; Spaces Cold Storage is not. The USD-invoicing forex markup and import-of-services GST that convenience-corner recorded apply here too. | 11 |
| Google Drive attachments | **In v1, as references only.** Google Picker API with the non-sensitive `drive.file` scope, reusing the existing Google OAuth. A Drive attachment stores a reference (file id, name, mime, view link), never a copy. **Three rules, because the product cannot vouch for content it does not hold:** (1) a Drive reference can NEVER satisfy `require-evidence` — evidence must be an uploaded attachment, refused with a named reason otherwise; (2) it renders as an external reference with its last-seen name and date, never as settled fact; (3) it can never be inline-embedded (inline stays uploads-only). No import-a-copy promotion in v1 — a user who needs a file as evidence uploads it. Uploaded attachments additionally carry a SHA-256 so evidence is verifiable rather than merely present. | spec §2, 7, 6, 3 (event) |
| Sub-task parenting | **The built-in `sub-task` always requires a parent, and so does any custom type at the deepest rank** — the requirement follows the rank, not the built-in id. Overrules Plan 8's Open question 6. Types at epic/story/task ranks are unaffected: an epic-rank custom type may still sit at project root. | 3 (engine check + fixtures), 8 (builder copy) |
| Attention thresholds | **7 days / 7 days** defaults approved | none |
| Epic grouping | **Custom epic-rank types DO head groups.** Grouping resolves the nearest ancestor-or-self whose type carries the *epic rank*, not only the built-in `epic` id. | 5 |
| Custom date fields on Calendar/Timeline | **Include them.** Any custom `date`-kind field renders as a claim, on the same honesty terms as `dueDate`/`startDate`: attributed, never estimated, absent when unclaimed. Moves from v2 candidate to v1 scope. | 9 |
| Domain | **`pm.artsourced.in`** for the product, **`pm-api.artsourced.in`** for the API — two sibling subdomains of artsourced.in, so two plain CNAMEs in one zone. App Platform routes web and API as separate services and needs two authorities. | 11 |
| Magic-link sender | **`sign-in@artsourced.in`** — the apex, not a product subdomain, so sender reputation and deliverability stay with the established zone. | 11 |
| Runbook location | **In-repo** (`docs/runbook.md`) | none |
| Branch protection | **`main` stays unprotected** — free private repo, same as convenience-corner. Compensating control: a standing instruction never to commit or push to `main` directly, recorded in `CLAUDE.md`. | 11 (record the control, drop the plan-upgrade question) |

## Owner decision (2026-08-20): time is Asia/Kolkata

Both clocks are India time. Concretely, and binding on every plan:

- **Storage:** both `client_time` and `server_time` are `timestamptz` — absolute instants. Plan 1's original "`client_time` as verbatim text" is overruled: text made every comparison a cast and every sort fragile, and converting loses nothing about *when* a claim was made, only the label the device attached to it. The spec's "both are true in different senses" is preserved intact — the claimed instant and the received instant remain two separate facts, and the existing skew flag still records when they disagree.
- **Rendering:** every surface renders both clocks in **Asia/Kolkata**, always, in v1. The database session timezone is set to `Asia/Kolkata` so ad-hoc queries agree with the product.
- **Day boundaries are IST.** This settles an ambiguity that was previously undefined and would have produced real disagreement: `dueDate`/`startDate` are day claims (`YYYY-MM-DD`), so "due today", "overdue", which calendar cell a claim falls in, and how many days a ticket has been in flight all depend on where the day starts. It starts at IST midnight. Every plan that computes a day boundary or a day count uses IST, never the server's locale and never the viewer's device.
- **Known consequence:** a collaborator acting from another timezone sees their own action rendered in IST — the same instant, correctly labelled, not a distortion. A per-user or per-workspace display timezone is a cheap later addition; v1 does not have one.

## Amendments pinned for plans 5–11 (written in parallel against these)

9. **`blocked` state flag.** A workflow state may carry optional `blocked?: boolean` (additive to `WorkflowDef`; category stays one of the three). The attention strip's "blocked" bucket reads this flag; templates set it on their Blocked states; the builder exposes it as a checkbox. (Plan 2 zod gains the optional field — pending amendment as above.)
10. **`packages/app-core` + `DataSource`.** Shared React views/view-models (Board, List, My Work, Calendar, Timeline, ticket sheet, attention strip) consume a `DataSource` interface — `{ ingest(events: SubmittedEvent[]): Promise<IngestResult[]>; query: typed read functions; subscribe(workspaceId, afterSeq, cb): Unsubscribe }` — implemented twice: **online** (Plan 6: HTTP + WebSocket) and **replica** (Plan 10: local store + outbox). Views never speak HTTP directly. **`IngestResult` is additive across the two** (recorded 2026-08-27, Plan 10's flag): the replica returns `{status:'pending', eventId}` where the online source returns `committed`, because a replica cannot truthfully claim commitment it has not seen — views treat `pending` as accepted-for-now and render the claim-in-transit badge, which is spec §5's own vocabulary, not a client liberty.
11. **`packages/ui` is the one colour origin.** Design tokens live in `packages/ui/src/tokens.ts`; no colour literal anywhere else in any client; a test enforces it (the base's token discipline, carried over).
12. **`packages/editor`.** Tiptap v3; description/comment bodies are its ProseMirror JSON, opaque outside the editor; image node with `wrap: 'inline-left'|'inline-right'|'block'`; a structured mention node `{userId}`; RN hosts the editor in a webview. `@gisik-nokma/domain` exports a dependency-free `docToPlainText(doc: unknown): string` JSON-walker for search/notifications.
13. **Realtime protocol (Plan 5 owns the server side).** WS `/v1/stream`; client → `{type:'subscribe', workspaceId, afterSeq}`; server → `{type:'event', envelope}` · `{type:'purge', entityId}` · `{type:'scope-revoked', workspaceId, projectId?}` (added 2026-08-27 with the guest purge split — without a frame, a connected guest's revocation could reach them only at next bootstrap; carries no seq and must be idempotent, like purge per §19) · `{type:'caught-up', seq}` · ping/pong. Backed by `visibleEventsFor` + `onEventCommitted`. **Plan 5's stream layer maps the new instruction to the new frame — a one-line addition, to apply when Plan 5 is walked.**
14. **Preferences are server-owned per-user rows, not ledger events** — saved filters, list columns, grouping choices. `/v1/me/preferences` (Plan 5 owns store + routes). View preferences arrange truth; they are not history.
15. **Attachments.** `POST /v1/attachments` (multipart) → `{attachmentId, url, mime, filename, size}` — the response is a superset of the original pin (recorded 2026-08-27 at Plan 7's walk, which had flagged it unrecorded since writing). The extra fields are load-bearing, not convenience: `mime` and `size` are the **server's sniffed truth**, and the client MUST echo them into `attachment.added` rather than the local file's own claims — a file's opinion of its type is not evidence. Storage behind an `ObjectStore` interface with an S3-compatible implementation; then the `attachment.added` event references it (Plan 7 owns). **Same walk, same recording: `IngestDeps.gates?: ServerGate[]`** — Plan 7 extends Plan 1's ingest contract additively (default `[]`, invisible when unused) with gates that run inside `ingestBatch`'s transaction, where the attachments table and the ledger are both in reach; the evidence gate (a Drive reference can never satisfy `require-evidence`) lives there because `TicketState` never carries attachments, so no pure engine rule has anywhere to read an attachment's kind from. Deliberate consequence: Plan 10's `POST /v1/sync` wraps the same ingest, so a sync-refused gate violation becomes a contested claim with no extra wiring.
16. **Contested claims live in the ledger.** Offline-originated events arrive via `POST /v1/sync` (Plan 10 adds it, wrapping ingest). A sync-time refusal appends a `claim.contested` event (entity = the ticket; payload = the original event, rule, reason) — the contest is itself history, visible to everyone who can see the ticket. Resolution is `claim.contested_resolved { resolution: 'redone'|'converted-to-comment'|'discarded' }`. Interactive `POST /v1/events` refusals return without recording. On the sync path, `duplicate-event-id` becomes idempotent-accept (retries are expected); interactive ingest keeps the refusal.
17. **Client shells.** `apps/web` = Next.js 15 App Router, online DataSource. `apps/desktop` = Tauri 2 + Vite React, app-core + replica DataSource. `apps/mobile` = React Native (Expo), native navigation over app-core view-models, webview editor, replica DataSource. Local replica storage is SQLite on both app platforms behind one storage interface; the local read model is built from domain reducers (`applyTicketEvent` + workflow defs), never from the server's pg projections.
18. **`workspace_seq` is the stream cursor** (defect found by Plan 5, case 7.34): per-entity `seq` cannot order a workspace stream — resuming at `afterSeq` would silently skip newer entities' early events. The `events` table gains `workspace_seq bigint` with `UNIQUE(workspace_id, workspace_seq)`, assigned in the ingest transaction under a per-workspace advisory lock; `visibleEventsFor(…, afterSeq)` filters and orders by it; `{type:'caught-up', seq}` carries it; per-entity `seq` keeps its role (entity history, replay, snapshots). Clients treat `afterSeq` as an opaque resume token. **Applied** to Plan 1 (schema, two-lock ingest — workspace lock before entity lock, always that order — and ledger store, which now returns `LedgerEvent = EventEnvelope & { workspaceSeq: number }`) and Plan 4 (`visibleEventsFor` filters and orders by it; `SyncItem = LedgerEvent | PurgeInstruction`). The domain `EventEnvelope` stays frozen: `workspaceSeq` is server-enriched on read, never a client-authored field.
19. **Stream frames carry `workspaceId`** on purge/caught-up/error (additive; forced by multi-workspace subscriptions on one socket). Purge frames carry no seq; purge-only drains may re-emit and must be idempotent (they are deletes).
20. **Route prefixes:** the product API lives under `/v1/*`; better-auth's vendor surface stays mounted at `/api/auth/*`. Both are deliberate; no unification.

## Owner decisions (2026-08-26): the workflow engine's two open questions

Plan 2's Open questions 6 and 10, walked at review. Both are settled here; Plan 2's own text is amended to match and stops describing either as provisional.

### The state-mapping rule is permanent semantics, not a stopgap

Publishing version N+1 that drops states version N has is refused unless `stateMapping` covers **every** dropped state, occupied or not. Plan 2 had justified this as a temporary safety margin — the frozen `EngineContext` cannot enumerate tickets by state, and the server ctx returns `null` for entity lookups until Plan 3 — and recorded it as "safe to relax later". **It is not to be relaxed.** The permanent reason is stronger than the temporary one: the rule engine runs identically on client and server, proven by one shared fixture suite, and client replicas are visibility-scoped (spec §5, §6). A user who cannot see three tickets sitting in the dropped state computes occupancy 0 while the server computes 3. Making publish legality depend on occupancy would make the two engines disagree by construction — precisely what the shared-fixture promise exists to prevent. Occupancy is a **builder courtesy, never an engine input**: Plan 8's `GET /v1/workspaces/:workspaceId/workflows/:workflowId/state-occupancy` prefills the mapping dialog's counts, and the dialog degrades honestly when that read fails.

Consequence for copy, because the product does not assert what it has not checked: neither the refusal nor the dialog may claim in-flight tickets it has not counted. The `workflow-state-mapping` reason names the real reason (publishing cannot see which tickets sit where), and Plan 8's mapping-dialog heading becomes `Every dropped state needs a destination`. Occupancy *counts* shown beside each state remain accurate and stay as they are.

### `require-different-user`: a dead rule is refused, a bypassable one is warned, and versioning may not disarm it

Three parts, all owner-approved:

1. **Dead-rule refusal (error).** `validateWorkflowDef` gains issue code `rdu-unenterable-state`: an RDU rule naming a state that no transition in this version enters. Given the existing `unreachable-state` and `terminal-no-inbound` checks, in a workflow that otherwise validates this reduces to the initial state with nothing looping back — the exact self-approval hole Open question 10 named, caught at publish rather than tolerated at runtime. Same class as `terminal-no-inbound`: a declared thing that structurally cannot function.

2. **Bypassable-rule advisory (warning), in a new tier.** Warnings **must not** enter `validateWorkflowDef`'s array: Plan 8 gates publish on that array being empty, every template asserts it validates clean, and Plan 2's engine joins every message it returns into one `workflow-structure` refusal — a warning placed there becomes a refusal. So `@gisik-nokma/domain` gains a separate **`adviseWorkflowDef(def: WorkflowDef): Advisory[]`**, `Advisory = { code: string; message: string }`, which the rule engine never calls. A distinct type name protects nothing under structural typing, so the guarantee is proven by planted defects instead: a Plan 2 fixture in which the engine *accepts* a def that trips only an advisory, and a Plan 8 test in which publish stays enabled. Its one code is `rdu-bypassable` — the guarded transition is reachable from `initialStateId` without ever entering the watched state, so on that path the rule finds no earlier performer. It is suppressed when `rdu-unenterable-state` already fired for the same rule.

3. **The transition log records its workflow version.** Log entries stored a raw `toStateId` and no version while RDU compared them against a state id in the *latest* definition, so a version that dropped and remapped a state left the historical entries unmatchable: RDU found no prior performer and one person made both moves — on a workflow the advisory correctly calls clean, because structurally it is. Versioning quietly disarmed four-eyes. Matching forward-mapped ids without a per-entry version was considered and declined: entries carry no version, so a dropped-then-reintroduced state id can satisfy the rule with the wrong move — the same silent failure, narrower. The entry therefore carries `workflowVersion` (decision 4 above, amended), and RDU resolves a candidate entry's id forward through the version chain before comparing.

**Scope note the plans must not overclaim.** The advisory characterises reachable vacuous acceptance **within a single workflow version** only; part 3 is the counterexample across versions. Plan 2's Open question 10 and the fixture comment say so in those words.

**Fixture consequence.** `rule-rdu-accepts-when-nobody-performed-the-earlier-move` cannot survive as written: in a sound single-version workflow, reaching the guarded move requires having entered the watched state, so the vacuous path is unreachable through any legal event sequence and the fixture would have to stage a state the ledger cannot produce. It is rebuilt on a def that trips `rdu-bypassable` and renamed to say so.

**Plans to amend:** 2 (all of the above; definition site) · 8 (dialog heading, refusal literal, planted-defect table 10 → 11 codes, advisory panel that visibly does not gate publish) · 1, 3, 6, 10 (transition-log shape and literals only).

## Owner decisions (2026-08-26): stale categories, and the workspace that could not hold a ticket

Plan 3's Open questions 9 and 7. Both were deferred to owners that did not exist — no plan refreshed a re-categorised state, and the "workspace-bootstrap plan" was named only in Plan 3 and never resolved to a number.

### A new workflow version refreshes the tickets it re-categorises

**Decision: refresh on publish.** `proj_tickets` consumes `workflow.defined`. When version N of workflow W is published, every `proj_tickets` row with `workflow_id = W` is folded forward — `state_id` through the version chain's `stateMapping`, `state_category` recomputed from version N, `workflow_version` set to N. Two consequences that are part of the decision, not optional extras:

- **`proj_rollups` refreshes in the same transaction.** It is registered after `proj_tickets` and its counts are `FILTER (WHERE state_category = …)`, so a category change that stopped at `proj_tickets` would leave every parent's progress lying — and the parent-terminal invariant refusing legitimate closes.
- **The replica applies the same fold.** Amendment 17 builds the local read model from domain reducers, never from the server's pg projections, so an offline client that never re-folds keeps stale categories forever. The fold lives in `@gisik-nokma/domain` as one function both sides call; it is not written twice.

**Corollary — the defect underneath, which is why this was never merely a preference.** `proj_tickets` resolves its workflow with `getWorkflowDef(db, workspaceId, workflowId)` — no version, contracted as "the latest at the current ledger position". That phrase is aspirational: the projection reads whatever `proj_workflows` holds *now*. Plan 1's verifier rebuilds **projection-outer** (`for (const projection of projections) { reset; for (const event of ledger) apply }`), so `proj_workflows` is fully built to the newest version before `proj_tickets` replays its first event. Two things follow, both true today:

1. Replaying a `ticket.transitioned` whose `toStateId` a later version dropped **throws** — `stateCategoryOf` finds no such state and the reducer raises. So any workflow version that drops a state makes `proj_tickets` unrebuildable, breaking the spec §3 promise that projections rebuild deterministically from scratch. The mandatory `stateMapping` does not save it: that mapping is consulted by the engine's `resolveCurrentStateId`, not by the projection's reducer, which looks `toStateId` up in the definition directly.
2. Even with no state dropped, re-derivation stamps the newest `workflow_version` where the live row holds the version in force at the time, so the verifier reports drift after *any* republish.

Therefore the projection resolves the definition **as of the event it is applying**, never as of now: `proj_workflows` records the ledger position at which each version was published, and `getWorkflowDef` gains an as-of-position lookup which the projection passes the current event's `workspace_seq`. With that and refresh-on-publish together, `proj_tickets` becomes a pure function of the ledger prefix — live and re-derived converge, because the last `workflow.defined` folds every row to the same place whatever path it took to get there.

### A new workspace can hold a ticket the moment it exists

**Decision: found every workspace with the simple-Kanban template, bound to all four built-in types, changeable immediately afterwards.** The founder is not asked to choose a template at creation; a workspace that cannot accept its first ticket is not a workspace.

**Ownership: Plan 4** acquires the workspace-creation surface, which is presently unowned end to end — there is no `POST /v1/workspaces` anywhere in the series, no client emitter, and Plan 4's hook after `workspace.created` appends exactly one event, the founder's `membership.granted`. Plan 11 loops `builtinTicketTypeDefs` but only inside its demo and dev seed CLIs, and says in terms that it expects Plan 4 to own the real path. Mechanics:

- Immediately after `workspace.created` is accepted and appended, Plan 4 appends, through the same server-origin append+project path it already uses for the founder grant and **in this order**: the default `workflow.defined` (simple-Kanban, version 1), then the four `ticket-type.defined` events from `builtinTicketTypeDefs(defaultWorkflowId)`, then the existing founder `membership.granted`. Order is load-bearing — a type naming an undefined workflow is refused.
- **The simple-Kanban definition gets one home**, `@gisik-nokma/domain`, consumed by Plan 4's bootstrap and Plan 8's template gallery alike. Two copies of one workflow is the drift this series keeps finding; a test asserts the gallery's Kanban template and the bootstrap default are the same object.
- Plan 11's seed CLIs call the bootstrap path rather than re-emitting the events themselves.

**Recorded as still unowned, to be assigned when Plan 6 is walked:** the *client* half of workspace creation — the screen that founds a workspace — together with invite issuance and acceptance, which Plan 6 has already flagged as having no owner. This decision settles the server surface only.

## Owner decision (2026-08-26): a ticket's workflow is pinned at creation, and moved only deliberately

Plan 3's Open question 8 — re-binding a ticket type to a *different workflow* (not a new version of the same one). Nothing in the series owned it: `stateMapping` is keyed inside one workflow's version chain, so it cannot express a move between two unrelated graphs, and a ticket's `workflowId` is immutable after creation while Plan 8's type editor exposes the binding as a live combobox.

**Decision: versioned bindings — a ticket pins the workflow it was created under, and an explicit migration moves it.** The earlier recommendation to *forbid* re-binding was withdrawn: it rested on the premise that two populations of one type would make the board contradict itself, and Plan 5 already specifies board columns as *one column per (workflow in use, state of its latest def) — tickets of different workflows are grouped by their own states, side by side*, with `BoardColumn` carrying `workflowId` and `workflowName`. A board holding several workflows is a case the design was built for, because a project holds many types.

**Scope line, load-bearing: pin which workflow, never which version.** Within a workflow, tickets keep folding forward through `stateMapping` — spec §4 says a new version applies to all tickets of its type, and the mapping decision recorded above only has meaning if in-flight tickets actually move. Version-pinning would make that refusal dead code. Across workflows, tickets stay put until moved.

This is largely **ratification of what the code already does**: `proj_tickets` carries its own `workflow_id`, set from `type.workflowId` only in the `ticket.created` branch and never touched again; every read path resolves per ticket (`latestWorkflowDefs(db, workflowIds)`, the blocked filter keyed `(t.workflow_id, t.state_id)`, the board's per-workflow card filter); and `proj_ticket_types` upserts `workflow_id = EXCLUDED.workflow_id`, so re-pointing a type changes only what new tickets get. What is missing is that the pinning is incidental rather than stated, and that nothing completes it. Three additions:

1. **A migration event.** `ticket.workflow_rebound { toWorkflowId, toStateId }` — a claim like any other, attributed, refused when `toStateId` is not a state of the target workflow. It cannot reuse `stateMapping`, which is keyed within one workflow's version chain; across workflows there is no chain. It needs a **bulk affordance**: an admin authors one cross-workflow state map for the type and the server emits one event per ticket, or "manual" means moving hundreds of tickets by hand.

2. **Transition log entries carry `workflowId` beside the `workflowVersion` added earlier today** (decision 4, amended again above). Four-eyes now resolves an entry by walking its state id forward from the version it was recorded under; if a ticket can also change workflow, a pre-migration entry would be walked through the *new* workflow's version chain, which is meaningless — it either fails to match or matches the wrong move, reopening the hole closed this morning through a different door.

3. **The divergence is visible.** Plan 8's type editor states how many existing tickets stay on the outgoing workflow, and offers the migration. An admin who re-points a type and is never told two populations now exist is precisely the board knowing something the user does not.

**A limit on this decision, found while applying it (Plan 3's Open question 11), which the owner should know about rather than meet later as a bug.** "A ticket keeps the workflow it was created under" is true on the live path and **not yet true on a re-derivation.** `proj_tickets` resolves a `ticket.created`'s type through `proj_ticket_types`, which is last-definition-wins with no history, so replaying that creation after the type has been re-bound resolves the *new* `workflowId` for a ticket the live path bound to the old one. It is the same drift class as the workflow-version defect fixed above, but the fix is not symmetric: `proj_workflows` already keeps every version keyed `(workflow_id, version)`, so asking it as-of is a `WHERE` clause, whereas giving `proj_ticket_types` history means changing its primary key and touching readers in Plans 3, 4 and 5. It was scoped out deliberately rather than smuggled in. **So the "pure function of the ledger prefix" claim holds for workflow versioning, and holds for type re-binding only until somebody re-binds a type.** Whoever takes the type-versioning work takes this with it; until then, a rebuild after a re-binding is known to disagree with the live table.

**A consequence that was predicted here and turned out to be wrong, corrected rather than quietly dropped.** This section originally said migration would make Plan 5's fallback-column path (a ticket whose `state_id` is absent from its workflow's latest definition) reachable again, reopening its "contracted-unreachable, no planted test" annotation. It does not: `ticket.workflow_rebound` refuses a target state the incoming workflow does not have, so a migrated ticket always lands on a state that exists.

Checking it turned up something better. The annotation's *reasoning* was wrong even before migration existed — it rested on Plan 2's forced state mapping, and a forced mapping guarantees a mapping **exists**, not that anything **applied** it. Until refresh-on-publish, nothing did: the mapping was consulted by the engine's version walk at transition time while `proj_tickets` kept the id it was written with. So a version that dropped a state left every ticket standing in it holding a dead id, and that fallback column was not a defensive branch at all — it was the normal rendering for those tickets. The path is genuinely unreachable now, because of the fold rather than because of the refusal, and Plan 5's annotation now says so and points at where the fold is actually proven.

**Plans to amend:** 3 (the event, the reducer, the pinning rule with a planted test that a `ticket-type.defined` re-bind leaves existing `proj_tickets.workflow_id` untouched — true today only by accident of which reducer branch assigns the field) · 8 (divergence copy + bulk migration authoring) · 5 (the fallback-column annotation) · 1, 2, 6, 10 (log entry shape).

## Owner decision (2026-08-26): a ticket cannot be created into a project that was never founded

Plan 3's Open question 6. Nothing in the series validates that `ticket.created.projectId` names a real project: there is no `proj_projects` projection anywhere, and `project.created` is a registered event type that nothing projects into a queryable table. Plan 3's own precondition list (`ticket.unknown-type`, `ticket.unknown`, `ticket.workflow-undefined`, `hierarchy.unknown-parent`) has no project entry.

What accidentally covers the common case is a **membership** check in Plan 4, which refuses `ticket.created` when the actor is not a member of the project. But `ctx.eff.projects` is built from `proj_memberships` — that is, from `membership.granted`/`project.member_added` — and never from `project.created`; and those grant events accept any non-empty string as a project scope without checking that the project exists either. So a fabricated `projectId` is refused only because nobody happens to be a member of it, and the refusal names the wrong reason. Grant yourself membership on a typo'd id and the ticket is accepted: it lands in `proj_tickets` and `proj_visibility` with a dangling `project_id`, appears on no board and in no project list, and nobody is ever told.

**Decision: add it, owned by Plan 4** (which owns project events per §6). Three parts:

- **`proj_projects`**, a projection of `project.created` and kin, registered **before `proj_tickets`** (§8 amended above) because the ticket precondition reads it.
- **A precondition refusal on `ticket.created`** that names the honest reason — the project does not exist — rather than leaving a nonexistent project to be reported as a membership problem. It joins Plan 3's precondition list as a cross-reference; the check itself lives with Plan 4's other pre-engine gates.
- **Membership grants validate their project scope**, so the hole cannot be re-opened from the side it is actually reachable from.

The general principle, stated once because it recurs: a refusal that happens to fire for the wrong reason is not coverage. It leaves the real gap open on every path where the coincidence does not hold, and it tells the user something false on the paths where it does.

## Outstanding from the 2026-08-26 amendment wave

Every decision above is settled and recorded. These plan edits are **not yet applied** — listed here rather than left to be rediscovered, because a decision recorded but unapplied is the same drift this document exists to prevent. Delete each line as it lands.

- ~~**Plan 3** — `ticket.workflow_rebound` and the pinning test.~~ **Done.** The event, its reducer branch and its checks are in, along with the two projection tests. One refusal was added that the decision did not anticipate: a rebound to the ticket's **own** workflow is refused, because the event places a ticket without evaluating any transition rule, and permitting it within one workflow would be a way to reach any state without satisfying `restrict-to`, `require-evidence`, four-eyes or anything else — and without leaving the log entry four-eyes reads. Moving inside a workflow already has a mechanism that honours all of them.
- ~~**Plan 4** — `proj_projects` and the honest precondition refusal.~~ **Done** (Task 9 Step 3b). The check covers every event that *names* a project, not only `ticket.created` — the membership grant is the path the hole was actually reachable through, so validating only ticket creation would have left it open. It runs **before** the membership check, so where both would fire the honest reason wins. `ticket.workflow_rebound` joined `ADMIN_ONLY_TYPES`.
- **Type versioning (unassigned)** — the re-derivation limit recorded under the workflow-pinning decision above. Not urgent, but it should not be discovered by a verifier alarm.
- ~~**Plan 5** — the fallback-column annotation.~~ **Done**, and the premise it was queued on was wrong; see the correction under the workflow-pinning decision above. The annotation now names the chain that actually makes the path unreachable and points at Plan 3's cases 5.27 and 5.30, where the fold is proven, rather than resting on a refusal that never guaranteed it.
- ~~**Plan 8** — the divergence-notice component.~~ **Done** — it was already complete when this line was written; the agent that appeared to stall mid-insert had finished. Verified against the code rather than the note: the copy table, the population read with its honest-degradation states, the helper functions, the JSX, and the tests are all present, including "Leave them on …" as an affirmative button beside "Move them to …", so staying put is a decision rather than the absence of one.
- ~~**Plan 10** — the replica-fold tests.~~ **Done**, and this line had it backwards both ways: the tests were already written, and the fold was *not* wired. `applyServerItem` stored an arriving `workflow.defined` and never folded the tickets standing on it — only the bootstrap path refolded — so the two tests asserting it would have failed. The prose described the behaviour in three places, which is what made it look finished. `foldTicketsOntoVersion` now does it, calling domain's `foldStateIdForward`, and it writes the folded state as the ticket's new replay baseline as well as its row — without that second write the next event replays pre-fold history against the new definition and undoes the fold, or throws on a state the version dropped.
- ~~**Plan 11** — the seed CLIs re-emitting the founding events.~~ **Done.** Both seeds now emit `workspace.created` and let Plan 4's bootstrap append the workflow, the four built-in types and the founder grant inside the same transaction; each seed keeps only what is genuinely its own (the shop's errand workflow and errand type, the dev project). Their own kanban workflow ids, built-in type definitions and owner grants are gone, along with the imports and constants that fed them — a duplicate founding sequence is one that can drift, and it would have been the version everybody saw demoed.

**With that, the 2026-08-26 wave is fully applied.** The only item left open is the unassigned type-versioning limit above.

## Owner decisions (2026-08-27): Plan 4's open questions

Settled without change: **better-auth** (already signed off); `visibleEventsFor` yielding `SyncItem` (a recorded contract amendment, and Plan 10 does consume the union); better-auth's vendor table naming as a documented exception. Plan 4's claim to own the ticket *history* endpoint was stale text — §"Contract amendments" already gives it to Plan 3 — and is corrected rather than asked about.

### One way onto a project, one way off

`membership.granted {userId, role, scope}` could carry `scope: {projectId}`, and `project.member_added {userId, projectAdmin}` did the roster; both wrote `proj_memberships`. **Two ways on meant two ways off** — `membership.revoked {scope:{projectId}}` and `project.member_removed` both mean "take them off this project", and unless they write the identical projection key, removing by one path leaves the other standing. An admin believes access is gone when it is not: a silent access-control failure, the same shape as the two-sources-of-truth defects found earlier on this branch.

Checking what the project-scoped grant bought found that it bought nothing. The only guest in the series — the accountant in Plan 11's seed — receives a project-scoped grant and then receives their actual access from `visibility.set` explicit lists. The grant confers no reads (a guest's `canSee` is explicit-only) and no writes (guests are refused ticket creation before the project check is reached). It was inert.

**Decision:**
- `membership.granted` / `membership.revoked` are **workspace-scope only**; they carry the workspace role and nothing else. `MembershipScope` is removed from the vocabulary.
- `project.member_added` / `project.member_removed` are the **only** project association, carrying the project-admin flag.
- Guests reach work through `visibility.set` explicit lists, which is what spec §6 says a guest is.

Project-wide guest access is given up. The spec never promised it, and it returns later as a deliberate feature rather than as an accident of two overlapping events.

### Invites name an address, not a user id

Spec §6 promises "Invites travel as links or QR from an admin", and the vocabulary could not express it: `MembershipGrantedPayload` names a `userId`, which somebody who has never signed in does not have. So no new person could be invited to a workspace at all — including the accountant the dogfooding plan depends on.

**Decision (owner: "ask them to create an account when they land"):** a new event pair. `invite.sent { inviteId, address, channel: 'email' | 'phone', role, projectIds? }` records the attributed claim that an admin invited somebody, naming the address rather than a user. `invite.accepted { inviteId, userId }` is appended when the invitee lands, authenticates (creating an account if they have none — the existing phone-OTP / magic-link / Google paths, no new auth), and the server binds the invite to the resolved user, appending the `membership.granted` and any `project.member_added` the invite promised. An invite is a claim like everything else: attributed, dated, and visible as pending until accepted. Revocation before acceptance is `invite.revoked { inviteId }`.

**Correction to the paragraph above, made while applying it: the client half is NOT unowned, and the server contract is already pinned.** Plan 4's Open question 10 said nobody owned invite issuance or acceptance, and this document repeated it. Plan 6 in fact owns the client half in its Task 15 — `app/invite/[token]/page.tsx`, `packages/app-core/src/online/invites.ts`, an `InviteGateway` and its tests — and it names the server gap explicitly while pinning the surface it calls:

- `GET /v1/invites/:token` → `InviteSummary { workspaceId, workspaceName, role: 'admin' | 'member' | 'guest' }`, or null for a dead token.
- `POST /v1/invites/:token/accept` → `{ workspaceId }`.

Plan 4 implements exactly those two routes over the event pair above rather than inventing a third shape. Note `role` excludes `owner`: an invitation cannot make somebody the owner of a workspace they have not entered.

**The token is a credential, so it is not the event id and does not live in the ledger.** Anyone who can read a workspace's history can read an event id; if that id were the link's token, any member could accept an invitation addressed to somebody else. The token is server-owned state keyed to the invite — the same line this plan already draws for identity, where sessions are better-auth's tables and not workspace history. The ledger records that an invitation was made, to what address, by whom; it does not record the secret that opens it.

### The owner reads everything; an admin does not

The original rule gave nobody a visibility bypass. **Owner-amended:** the workspace `owner` role bypasses read visibility across their workspace; `admin` does not and must still join a project to read its project-mode tickets. The hierarchy makes the workspace the right unit — it is the container everything else sits inside.

Reads leave no event trace, so this power cannot be made honest by attribution. It is made honest **by disclosure**: the visibility controls state plainly that the workspace owner can always see. A stated power is not a lie; a hidden one is. Writing is unchanged — creating in a project still requires joining it, which is an attributed event.

### Guests receive only the workflows they need to render what they can see

Definitions were sent to everyone including guests, so a guest received every workflow in the workspace and with it every state name — internal process leaked to an external party. Narrowed to the workflows and ticket types actually used by tickets that guest can see. Same rendering, much smaller surface.

### Purge on membership loss: per-id for members, scope-revoked for guests

Per-id purges tell the recipient how many tickets existed in a scope, including ids they never held. For a member losing a project that is minor and consistent with the restricted-parent existence-leak spec §6 already accepts. For a **guest** being revoked it is an external party learning the size of work they were never shown, so guests receive a single scope-revoked instruction instead of per-id purges.

### A creator may still lock themselves out, and is warned first

Explicit lists stay exactly the authored list — appending the creator would be the system inventing a claim nobody made. The client warns at the moment of authoring that the author will lose access, and names the repair path (a project admin can restore it). Warning is not inventing.

### Route prefix

Task 8's ticket read routes were `/api/workspaces/...`, predating amendment 20. Moved to `/v1/*`: 19 occurrences in Plan 4 and six across Plans 5, 6, 9 and 10. better-auth's vendor surface stays at `/api/auth/*` — that exception is unchanged.

**Plans to amend:** 4 (all of the above; definition site) · 5, 6, 9, 10 (route prefix; 5 and 10 also the guest slice and the purge split) · 11 (the accountant's now-removed project-scoped grant).

### Outstanding from this wave

Applied so far: the **membership collapse** end to end in Plan 4 — vocabulary, parsers, `proj_memberships`, the role gate, the purge path, the fixtures — plus the **guest definition slice** and the **purge split** in `visibleEventsFor`, and every `seedGuest` caller in Plans 4, 7 and 10. Two things were found while applying it and are now part of it: `membership.granted`/`revoked` **refuse** a `scope` rather than ignoring one (a stale client's claim means "put them on project P", and silently doing something else is the quiet acceptance the contract forbids); and `membership.revoked` deletes a person's **project** rows too, since leaving someone on a project after they are out of the workspace is the same silent-access failure in a different place.

Still to apply. Delete each line as it lands:

- ~~**Plan 4** — invites, owner bypass, creator warning, catalogues.~~ **Done.** Task 14 is the invite definition site: `invite.sent` names an address and refuses `role: 'owner'` and guest-with-projects; acceptance is server-recorded (client-submitted `invite.accepted` is refused even from an admin — otherwise anyone reading an inviteId could bind it tokenlessly); the token lives hashed beside the sessions, unknown/revoked/spent answer one identical 404, and `invite.sent` reaches only owners/admins in sync-down because it carries an address. The owner read bypass landed in `canSeeResolved` — **and in `listVisibleTickets`, which restates the decision table in SQL and would otherwise have silently disagreed with it**; an owner-viewer test now stands guard between the two copies. Creator lockout stays legal server-side with the warning pinned as client copy.
- ~~**Client visibility editor — UNOWNED.**~~ **Assigned (2026-08-27): Plan 6 Task 15b owns all four queued client surfaces** — the founding screen, the invite mint (`/w/[workspaceId]/members`), the visibility editor with both lines of pinned copy landing verbatim, and the empty-board first-run copy. Two small server reads were added to Plan 4 in the same walk because the surfaces cannot exist without them: `GET /v1/me/workspaces` (the workspace directory — Plan 6's navigation coded against it and its Playwright smoke **mocked** it, while no plan served it; a mocked contract in an E2E is how a missing route hides) and `GET /v1/workspaces/:workspaceId/invites` (the pending list — an admin who cannot see outstanding invites re-sends and cannot revoke; it never re-serves a token, because a list that re-served credentials would turn a read into an issuance).

## Plan 11 walked (2026-08-27) — the last walk, and the conflict a question predicted for itself came true

**Every plan in the series has now been walked.** Plan 11's fourteen questions closed with seven already settled by sign-offs and one genuine cross-plan conflict — the one its own question 4 had anticipated and pre-armed: Plan 8's inline errand template disagreed with Plan 11's `checkErrandTemplate` on every pinned axis (invented state ids against the frozen tracker's lanes; `require-evidence` into done against the pinned `require-comment`; waiting reachable only in two hops, which would have made every seeded waiting errand carry a **fabricated intermediate transition** — invariant 4 applied to seeds). The pre-agreed rule resolved it without discussion: the template amended, the check untouched. `ERRAND_WITH_WAITS_TEMPLATE` now lives in `@gisik-nokma/domain` beside the Kanban template — Plan 11's seed is a *server* consumer, and a template a server founds real workflows from cannot live in a React client package — declared by Plan 8's guard to the check's shape, carried by the gallery card **by identity**, so the shop's workflow and the builder's card are one object forever. Also corrected: the CI's dual-client script named a package that does not exist (`@gisik-nokma/sync-harness`); the harness lives at `apps/server/test/dual-client/` and the script now says so. The `/v1/sync`-in-the-events-rate-budget question settled by reading the retry semantics: capped backoff + at-least-once + idempotent duplicate-accept means a 429 delays a drain and loses nothing, so a separate sync budget would be a second number with no behaviour to buy. Questions 10 and 12 had been settled elsewhere without the text knowing (runbook in-repo per the sign-off table; the seeds already founding through Plan 4's bootstrap since the founding wave).

## Plan 10 walked (2026-08-27) — two alarms that were already answered, and one real defect between the doors

Plan 10's two security questions recommended checks that Plan 4's permission gate had already implemented before the recommendation was made: interactive `/v1/events` **does** visibility-check every ticket write (`checkVisibilityPermission` → `permission.visibility`), and forged `origin: 'server'` from a client **is** refused at the gate's first lines, with the server's own appends going through the internal path the gate never sees. The real defect was smaller and between the doors: the sync door contested a visibility refusal as its own `visibility.not-visible` while the interactive door refused `permission.visibility` — two ids for one fact, the stale-threshold shape in miniature. Plan 10's `VISIBILITY_REFUSAL_RULE` is now `'permission.visibility'`; one fact, one name, and a client filtering on either door's answer sees both.

Two promises were moved into the documents that must hold them: amendment 10 now records the replica's additive `{status:'pending'}` ingest result (a replica cannot truthfully claim commitment it has not seen; `pending` renders as the claim-in-transit badge, spec §5's own vocabulary), and Plan 11's CI gained the interim-plumbing gate — Plan 10 marked its temporary session shortcuts and said "Plan 11 must not ship with these", and a rule addressed to the plan that executes last now lives in that plan's own pipeline as a failing grep, not in a sentence its executor may never read. Settled with reasons: contest resolution stays open to anyone who can submit on the ticket (resolution is an attributed act; restricting it would leave contests rotting on tickets their own collaborators could settle), the derived clock-skew flag stays derived (immutable inputs, rebuild-safe; a persisted flag is an additive projection if reporting wants one), and the theoretical non-ticket contest path stays `refused` until offline workflow editing exists. The rest are adaptation seams, accepted as the discipline they are.

## Plan 9 walked (2026-08-27) — seventeen questions, one wrong assumption, one caveat that died well

Five were already settled (startDate ownership, route prefix, the sweep unification, custom dates in v1, the IST day). One assumption was checked against its owning plan and found wrong: Plan 9 assumed per-key `PUT /v1/me/preferences/:key`, while Plan 5 serves whole-document `GET/PUT ?workspaceId=` — corrected at the seam it had wisely built (`PreferencesGateway` does read-modify-write of the document, inheriting the accepted last-write-wins). Question 16's caveat died the good way: `stateName` resolving via the latest workflow version was written as a compromise pending a `workflowVersion` column; refresh-on-publish made it **exact by construction**, since every ticket is folded into the latest vocabulary when a version lands — the rewrite records that the lookup is now correct rather than tolerated. Two settlements with reasons: notification rows stay unredacted after revocation (a message you were sent is yours; revocation removes future sight, not letters delivered — scrubbing an ex-guest's inbox would be invariant 5's silent vanish applied to messages), and the mention-gate stays silent server-side (a mention must not become a probe for who can see), with the editor-side warning recorded as permissible polish, not queued scope. The remaining eight are guarded adaptation seams, each naming its single file — accepted as the discipline they are.

## Plan 8 walked (2026-08-27) — the fake gateway was hiding two missing routes, and a lock became real

The mocked-contract lesson recurred at once, in its third costume: Plan 8's divergence notice and bulk migration were coded against a type-population read and a migrate endpoint that **no server plan served** — the fake gateway that let every component test run was the thing excusing the server from existing, exactly as Plan 6's mocked E2E route and Plan 7's aspirational Plan 11 citations were. Both now live in Plan 5's Task 9b: the population read on state-occupancy's terms, and `POST …/ticket-types/:typeId/migrate` serving Plan 8's pinned `MigrationOutcome` verbatim — all-or-nothing in one transaction (a half-migrated type is two populations nobody chose), one `ticket.workflow_rebound` per ticket through ordinary ingest so the admin gate and state checks fire per event, refused whole on the first unmapped occupied state (`migration.unmapped-state`).

The half of Plan 8's question 6 that stayed open is closed the only honest way: **the built-in rank lock is now the server's** (Plan 3 Task 6 Step 4c, refusal `type.builtin-rank`, case 5.36). The UI locked the four built-ins' ranks while last-definition-wins accepted a re-rank — and `DEEPEST_RANK` is 4 *because* sub-task's rank is, so re-ranking `sub-task` to 3 would have let every sub-task escape the parent requirement while the builder displayed the lock. Name/icon/workflow of built-ins stay editable; custom types stay re-rankable. The `ref?`-on-`Issue` contract amendment Plan 8 proposed was **declined**: two plans' shapes would move to spare one client file whose recomputation is robust and oracle-tested; it re-opens only on observed anchor drift, with evidence.

## Plan 7 walked (2026-08-27) — eleven questions, two unkept promises made true

Plan 7's pending Plan 3 amendment was already applied (2026-08-20) and is now **verified present and marked discharged** — the plan had been carrying an instruction to do finished work. Its two requested recordings landed in amendment 15 above (the upload-response superset with its reason — the client echoes the server's sniffed truth, because a file's opinion of its type is not evidence — and the `IngestDeps.gates` seam). Two claims it made about Plan 11 were checked and found aspirational, then made true: Plan 11 now names the three Drive-picker variables in its build args and `.env.example` (its completeness gate exists for exactly this), and owns the monthly orphan-upload sweep with the honesty constraint as the design — only objects **no ledger event has ever named**, aged 30 days, may go, so this is hygiene rather than a deletion policy, and a large count is an incident signal. Two settlements with the dogfooding checked rather than assumed: unsniffable types stay refused (the accountant's spreadsheets are covered by XLSX magic bytes and Drive references; bare CSV waits for content-inspection), and upload permission stays `canSee` — the stricter guests-cannot-attach alternative would kill the accountant's own evidence loop, which is the founding scenario. The lesson this walk adds: **a plan citing another plan's provisioning is a claim, and claims get checked** — both false ones were about Plan 11, the plan that executes last, where an unkept promise would have surfaced latest and cost most.

## Plan 6 walked (2026-08-27) — fifteen questions, one hole, four assignments

Beyond the Task 15b assignments above: questions 2, 3, 7 and 10 dissolved because the surfaces they assumed now exist — two of them (invite routes, workflow read) at *exactly the paths this plan had pinned*, the contract having flowed client-to-server for once. Question 4 was half-dissolved and half a genuine hole (the workspace directory, above). Question 9's production recommendation ("terminate both behind one origin") was overtaken by the two-subdomain domain sign-off; the real mechanism is Plan 11 Task 2's CORS-with-credentials, and the two origins are same-*site* under `artsourced.in`, so the session cookie survives `SameSite=Lax` — dev and production now share one shape rather than one origin. The rest are executor-facing adaptation rules, accepted as written. Standing habit confirmed again: every dissolved question was dissolved by *checking the sibling plan*, not by trusting the flag.
- ~~The route prefix.~~ **Done.** Plan 4's 19 registrations and tests moved to `/v1/workspaces/…`; the four Open questions in Plans 5, 6, 9 and 10 that described it as pending now record it as settled; Plan 6's Next dev rewrite for `/api/workspaces/*` was dropped, since a proxy rule for a path nothing serves is a trap. Moving it exposed a second and worse error in the same tests: Plan 4's end-to-end cases posted events to `POST /api/workspaces/:workspaceId/events`, **a route no plan registers**, recorded as an assumption rather than checked. Plan 1 Task 11 serves `POST /v1/events` with body `{ events: [envelope, …] }` and the workspace inside each envelope. The tests were wrong about the URL and the request shape both, and would have 404'd rather than proving anything.
- ~~**Plan 10** — consume `ScopeRevokedInstruction`.~~ **Done.** `replica.revokeScope` deletes by scope inside one transaction, idempotent like a purge, keeping the purge path's honesty exception (the local user's own contest stubs survive; outbox rows stay). A workspace-wide revocation also drops the local definitions and cursor — a replica for a workspace you are not in should hold nothing of it — while a project-scope loss leaves them, because the member is still in the workspace. Amendment 13 gained the `{type:'scope-revoked'}` stream frame in the same change: without a frame, a connected guest's revocation could only reach them at next bootstrap. **Plan 5's stream layer maps instruction to frame — one line, to apply when Plan 5 is walked.**
- ~~**Plan 11** — the accountant's project-scoped grant.~~ **Done** — workspace-scope, with the inertness argument recorded at the site. The staged-seeding test needed no change: it counts committed events (grant + four visibility claims = 5), and the count is unchanged because the scope field was payload shape, not an extra event.
- ~~**Plans 5, 6, 9, 10 route-prefix narrations.~~ **Done** with the prefix move above.

## Plan 5 walked (2026-08-27) — twelve questions, none needed a new decision

Five were already settled by earlier decisions (stream cursor §18, route prefix, thresholds, epic rank, fallback column) and one — frame `workspaceId` — had been settled by amendment 19 before it was asked. The remaining six were reviewed and accepted as written, each now recording *why* it holds rather than only *that* it does: `'simple'` FTS is an honesty argument (stemming one language and not others ranks dishonestly), not tuning; the empty board answers `columns: []` because default columns would leak a restricted project's workflows to viewers who cannot see its tickets — the first-run experience is Plan 6 copy, queued for its walk; My Work stays per-workspace (cross-workspace scoping belongs to nobody yet, and the replica aggregates the same way); preferences keep full-replace PUT (the race is one person against themselves, and the loser loses an arrangement, never truth); attention reasons stay English templates with the spec's "user's language" pinned to mean *named reasons, not localisation*, structured fields carrying what localisation will need; assembler cost stands until profiling, not intuition, says otherwise. The walk also discharged the owed one-liner: the `scope-revoked` stream frame is defined, mapped in the drain, and proven by case 7.43 — one frame that never advances the cursor, so a guest revoked mid-session learns it over the socket and learns nothing else. Plan 5's citations of `getWorkflowDefFromProjection` were updated to the selector signature.

## Plan 1 execution consequences (2026-08-28) — recorded where a later plan will read them

Plan 1 ran with an execution ledger, and several of its deferrals were sound *on condition* that the mitigation was recorded somewhere a later session would see. That ledger is `.superpowers/sdd/…/progress.md`, which is gitignored — so every one of those conditions was, in fact, unmet: the branch changed no document at all. This section is the recording. None of it changes Plan 1's shipped behaviour; all of it is a claim on a later plan.

The shape recurred often enough to name: **a correct ruling whose entire value lives in a note is worth exactly as much as the note is durable.** A ruling written only into a gitignored file has been made and then thrown away.

### 1. A projection's table names are unqualified — always

`verify-projections` rebuilds every projection into a shadow schema and confines it there with `search_path` **alone**: `SET search_path TO verify_shadow, public` makes each projection's unqualified `proj_*` name resolve to its shadow copy while `events`, which has no shadow copy, still resolves to `public.events`. There is no second fence. A projection that writes `public.proj_tickets` instead of `proj_tickets` would therefore **write LIVE during a verify** — a read-only freshness check silently mutating the thing it is checking.

Plan 1's sole projection is unqualified throughout and the mechanism is documented at `verify-projections.ts:30-33`; the constraint now also lives on the `Projection` type in `src/projections/registry.ts`, beside the contract every later projection implements. Two neighbours ride with it there: projection table and column identifiers stay lowercase and unquoted (the verifier interpolates them into `CREATE TABLE`/`EXCEPT` SQL without quoting), and no projection column may be of type `json` — `json` has no equality operator, so `EXCEPT` cannot compare it and the diff would fail rather than pass.

### 2. `verifyProjections` reads in autocommit — rule this before Plan 11 schedules it

The verifier's `readLedger` and each of its per-table diffs run as separate statements outside any transaction, so they see **different snapshots**. Under concurrent ingest the CLI can report drift that never existed — the ledger read missed an event the live table already holds — and exit 1.

Harmless in Plan 1, where the verifier is a manually invoked operational tool. It stops being harmless the moment **Plan 11 schedules it**, because a scheduled exit-1 is an alert, and an alert that cries drift under normal load trains its operator to ignore it. **MUST be ruled before Plan 11 wires the schedule.** Two fix shapes, either acceptable: wrap read + diff in one `REPEATABLE READ` transaction so every comparison shares a snapshot, or have the scheduler retry once on drift and alert only on a repeat.

### 3. The diff uses `EXCEPT`, not `EXCEPT ALL` — so duplicate-row drift is invisible

`diffTable` compares with set semantics: if live holds a row twice and the rebuild derives it once, `EXCEPT` in both directions returns nothing and the table reports clean. Plan 1's only projection has a primary key, which makes duplicates impossible, so nothing is wrong today. The consequence is a standing requirement: **every projection table must carry a primary key, or the diff must switch to `EXCEPT ALL`.** A projection whose table is a keyless append log is the case that breaks it.

### 4. The verifier CLI needs DDL rights on the database it verifies

`verifyProjections` does `DROP SCHEMA` / `CREATE SCHEMA` / `CREATE TABLE … (LIKE …)` on the target database. A production deployment that hands the application a read-write-but-not-DDL role cannot run it, and the failure arrives as a permission error at 3am rather than at provisioning time. Whichever plan provisions production roles owes the verifier its own credential — or an explicit decision that the verifier runs elsewhere.

Related and worth stating once: the shadow schema name is a fixed constant, so **two concurrent verifies on one database collide.** Accepted for an operational CLI; a scheduler must not run two.

### 5. The second both-lock production path owes a falsifiable lock-order test

Ingest takes `lockWorkspace` then `lockEntity`, in that order, everywhere — one global order, so two ingests cannot deadlock by taking the pair in opposite orders. The contract is documented at `ingest-service.ts:70-72` and `event-store.ts:27-29`.

It is not *tested*, and on this branch it cannot be: with ingest as the only path that takes both locks, a **uniform** swap of the order is still deadlock-free, so no test on Plan 1's code can distinguish the correct order from a uniformly wrong one. The mutant was raised at Task 10, confirmed latently dangerous, and correctly deferred. **The plan that ships the series' second both-lock production path must land the `pg_locks` test** — hold the pair in one transaction, assert the acquisition order actually observed — because at that moment a non-uniform order becomes a real deadlock and the test becomes falsifiable.

### 6. Seeds for Plan 2's brief

Four things Plan 1 could not test, each because Plan 2 is the first plan that makes them testable:

- **Registration order is unpinned.** `ProjectionRegistry.all()` returns insertion order, and §8 above states the order later plans depend on — but Plan 1 registers exactly one projection, so nothing can fail. **The second registrant must arrive with the ordering assertion.**
- **Determinism test 3 is currently vacuous-adjacent.** `proj_entity_heads` is order-insensitive by construction (the `head_seq` guard), so "reversed arrival derives the same bytes" is true for a weaker reason than the one it is testing for. **The first order-sensitive projection makes that test live** — and it must be re-read then, not assumed still green for the right reason.
- **`reset()` is `TRUNCATE` today, and a DELETE-based reset changes the lock contract.** `TRUNCATE` takes ACCESS EXCLUSIVE; a projection whose reset must preserve identity/FK behaviour and switches to `DELETE` takes a weaker lock, and a concurrent rebuild-plus-ingest is no longer serialised by the reset alone. Whoever writes the first non-TRUNCATE reset owns re-deriving the contract.
- **Fixtures need a second entity kind.** Discharged in Plan 1's fix wave (`ledger-fixture.ts` now carries a `ticket` event whose `entity.id ≠ workspaceId` and whose `seq ≠ workspaceSeq`), recorded here because the *reason* generalises: a fixture where every pair coincides cannot see a transposition, and every later plan's fixtures inherit that trap.

### 7. No silent type coercion at any HTTP door — instance-wide, for the whole series

The Fastify instance is built with `coerceTypes: false` and `removeAdditional: false` (`app.ts`). These are **instance-wide AJV policy, not route-local choices**, and they were chosen deliberately: coercion silently wrapped a scalar into a one-element array, violating the stated non-array→400 contract, and `removeAdditional`'s default would have silently stripped unknown keys that `additionalProperties: false` declares an intent to *refuse*.

The consequence for later plans: **query and path parameters do not coerce either.** A route expecting `?limit=20` as a number gets the string `'20'` and must convert it explicitly in its schema or its handler. Every later plan that adds a door inherits this; none of them may re-enable coercion instance-wide to fix one route.

### 8. `nextSeq` and `nextWorkspaceSeq` require READ COMMITTED

MAX+1 under an advisory lock is correct only because the read after the lock sees rows committed by the transaction that just released it. Under REPEATABLE READ the snapshot predates that commit, both ingests compute the same number, and the second collides on `events_entity_seq_unique` immediately — proven at Task 10, not theorised. The dependency now lives as a doc comment on both functions in `src/ledger/event-store.ts`, not only in a test comment. **No later plan may raise the ingest transaction's isolation level without replacing the seq assignment mechanism.** The failure is loud, which is why this is a note rather than a code change.

### 9. The Plan 3 Task 2 → Task 12 window, where role-gated transitions refuse silently

`createEngineContext.getEntityState` (`apps/server/src/engine-context.ts`) returns `readEntityHead(...) as unknown as EntityState | null`. What comes back is a head **pointer** — `{kind, id, headSeq, headEventId, headEventType}` — and not per-kind entity state. The cast is a ruled Plan-1 seam and stands; `as unknown as` defeats every structural check, so the compiler cannot warn any consumer.

The comment on that seam used to say the cast dies at Plan 2 Task 2. It does not: Plan 2 Task 2 replaces the domain *types*, lists `engine-context.ts` as MODIFY only to wire `getWorkflowDef`, and states verbatim that `getEntityState` and `getChildrenStates` stay Plan 1's stubs until Plan 3. **The cast dies at Plan 3 Task 12**, and the comment now says so.

The gap between those two facts is a live hazard: **Plan 3 Task 2 registers `ticket.transitioned` v1 into the domain registry, and Plan 3 Task 12 is ten tasks later.** In that window `parseEvent` admits transitions at the door, ingest evaluates them, and Plan 2's `evaluateRestrictTo` calls `getEntityState('membership', …)` against this shipped context. If the membership entity has any committed event the guard passes `!== null`, `kind === 'membership'` narrows successfully, `membership.role` is `undefined` at runtime, `rule.roles.includes(undefined)` is false — and **every role-gated transition is silently refused**, with a plain-language reason naming the rule that reads entirely legitimate. TypeScript reports nothing. Plan 3's own tests in that window run against Task 4's in-memory fixture context, not this one, so the suite stays green.

**Plan 3's Task 2 dispatch must know this.** Either land Task 12 before Task 2, or make this body return `null` for the kinds it cannot honestly serve.

### 10. `LedgerEvent` has no hoist step, and Plan 10 imports it from a package that cannot see it

`type LedgerEvent = EventEnvelope & { workspaceSeq: number }` lives in `apps/server/src/ledger/event-store.ts`, exactly where Plan 1 Task 7's Produces block pins it, under an explicit "only server-side code sees LedgerEvent." That pin is correct for Plan 1 and is not being changed.

Plan 10 breaks it. `packages/sync-client` imports `type LedgerEvent` from `'@gisik-nokma/domain'`, and a package cannot import from `apps/server`. Plan 6 hit exactly this with `IngestResult` and wrote the remedy into itself: define it in domain, re-export from the barrel, replace the server's local definition with an import — *one definition, one origin*. **No equivalent step exists anywhere in the series for `LedgerEvent`**, so Plan 10 will either invent a second definition of the ledger's own event shape or stall on the import.

**Owner: the first plan that introduces a client-side package needing `LedgerEvent`** — Plan 10 as the series stands — which does the `IngestResult` hoist verbatim, in its own first task, before any file imports the type.

Weaker instance in the same class, recorded so it is not rediscovered: **Plan 4 sources `Refusal` from `@gisik-nokma/domain`** (lines 1762, 1931) while Plan 1's Global Constraints and the shipped code put it in `@gisik-nokma/rule-engine` (`packages/rule-engine/src/engine.ts:3`). Plan 4 is internally inconsistent about it — it imports `LedgerEvent` from the correct relative path at line 1247 — so this is almost certainly a plan typo, not an architectural need. **Plan 4's executor takes the import origin from the shipped code, not from the plan text.**

### 11. Nothing binds an event's workspace to its entity, or its type to its entity kind — Plan 2 owns both refusals

`commitOne` takes `lockWorkspace(submitted.workspaceId)` and mints `workspace_seq` from an entirely unvalidated claim. `submittedEventSchema` checks only that `workspaceId` is a ULID; the pass-through engine consults nothing; no projection or constraint ties an entity to one workspace. So **two events on the same entity claiming different workspaceIds both commit**: the entity's history is permanently split across two workspace streams (a client resuming workspace A's cursor never sees the event filed under B), and `proj_entity_heads.workspace_id` flips to whichever claim arrived last, because the head-advance `ON CONFLICT` overwrites it.

The same absence covers type↔kind: the registry keys on `type@version` alone, so `type: 'workspace.created'` against `entity.kind: 'ticket'` is accepted at the door, and Plan 1's own tests do exactly that.

This is correctly outside Plan 1's implementation scope — rule *content* is Plan 2's, and a pass-through engine that accepts everything is Plan 1's documented semantics. But the hole is only visible when the tasks are composed, and no plan document names an owner. **Plan 2 owns both refusals: entity↔workspace binding and type↔kind binding.** The cost of leaving them unowned is not recoverable: **the ledger is append-only by trigger, so a mis-filed event cannot be corrected, only superseded** — and the head row's workspace_id keeps flipping in the meantime. They must land before a second entity kind and real multi-workspace data exist, which is to say before Plan 3.

## Plan 2 execution consequences (2026-08-28) — the same lesson, learned twice

Plan 2 ran with an execution ledger too, and at six separate points it wrote "routed to coordination doc at plan end." Plan end came; `git diff 569fd41..c33d94a` changed no document at all. The lesson recorded one section above — **a correct ruling whose entire value lives in a note is worth exactly as much as the note is durable** — was not a lesson Plan 2 escaped by having read it. It was routed *into the same gitignored file*, by an executor who had the Plan 1 section available the whole time. Twice is a pattern, and the pattern is that "route it at plan end" is not a mechanism; it is an intention held by a session that is about to end. **The routing must happen in the task that discovers the item, not at plan end.** Later plans: when a reviewer's finding is deferred to you, the deferral is not complete until it is committed here.

This section is that recording, late. One of the six is recorded as *resolved* rather than deferred, because the fix was small enough to take in the fix wave (item 6). The rest are claims on later plans. None of it changes Plan 2's shipped behaviour.

### 1. The stranded-state refusal names a state against the wrong version's vocabulary

`transition.ts:65` renders the stranding refusal as `Ticket X sits in state "<unmappedStateId>" of workflow version <ticket.workflowVersion>` — asserting that the unmapped id belongs to the ticket's **origin** version. By `foldStateIdForward`'s own documented contract (`packages/domain/src/workflow.ts:99-101`, "on failure it reports the id at the point the chain broke, not the id it started from"), it does not. For a v1 ticket walking v1→v2→v3, the id reported is the one current *where the walk failed* — possibly a v2 id that the ticket's v1 vocabulary never contained. The sentence names a state and a version that never coexisted.

The copy is character-exact to the plan's canonical table, so this is an inaccuracy in the pinned copy rather than an implementation slip, and it is invisible to the current suite because every stranded-state fixture is two-version, where break-point and origin coincide. **Plan 6 renders these reasons verbatim to a human**, which is where a state id belonging to no version the reader can see becomes a support ticket.

The fix is a cross-plan surface change and belongs to whichever plan next touches the fold: **`FoldedState` must carry the version the chain broke on**, so the refusal can name `"<id>" of version <breakVersion>` truthfully — or drop the version clause and name only the id. Do not "fix" it by folding the id back to the origin version; there is no backward walk, and inventing one is a second set of rounding errors of exactly the kind the ONE VERSION WALK comment forbids. First plan to author a three-version fixture will observe this directly.

### 2. `WorkflowDef.roles` is plain strings, so a definition can name a role that does not exist — owner needed

`packages/domain/src/workflow.ts:21` types restrict-to's roles as `z.array(z.string()).optional()`, not `WorkspaceRole[]`. A definition whose restrict-to names `"wizard"` therefore validates clean, publishes, lands in `proj_workflows`, and renders in the builder as a guard — and `evaluateRestrictTo` then compares `"wizard"` against a real membership role forever, matching nobody. The transition is not guarded; it is **closed**, silently, and the refusal reason names a rule that reads entirely legitimate.

This is precisely the shape `validateWorkflowDef` refuses everywhere else: `rdu-unknown-state` exists because a rule watching a state that does not exist is a declared thing that cannot function. A rule naming a role that does not exist is the same defect with no check behind it.

**This needs an owner, and the choice is a real one.** Either (a) Task 3's validator gains an unknown-role check — but `validateWorkflowDef` is pure and I/O-free by design and workspace roles are a domain constant, so this only works if the role vocabulary is a closed domain enum the validator may import; or (b) it becomes a **Plan 8 builder-surface** concern, because the builder picks roles from a list and can simply never emit an unknown one — which leaves the API door open to a hand-written definition. (a) is the honesty floor; (b) is cheaper. Plan 2 declined to rule it, because either answer changes a behaviour the plan had frozen. **Whoever rules it: typing `roles` as `WorkspaceRole[]` is the same fix as (a) and is strictly better than a check, if the enum can live in domain.**

### 3. `require-different-user` is fail-open on an unresolvable entry, and the comment justifying that is conditionally false

`packages/rule-engine/src/rules/require-different-user.ts:56` is `if (!resolved.ok) continue;`, and the comment above it argues the skip is safe because "in such a store the ticket's own state resolution refuses first, as stranded-state, before any rule runs."

**That holds only while the ticket's version and the entry's version coincide.** The ticket resolves from `ticket.workflowVersion`; each log entry resolves from its own `entry.workflowVersion`. When they are equal — as they are in every fixture on this branch — any break the entry hits, the ticket hits first, and the claim is true. **Plan 3's refresh-on-publish makes divergence routine**: a new version is published, the ticket's row is refreshed to latest, and the ticket now folds latest→latest as a no-op while a v1 log entry still walks the entire chain. From then on an entry can strand where the ticket cannot, the entry is skipped, `prior` stays undefined, and the rule returns `{refused: false}` — **four-eyes silently disarmed, for a security control, with no diagnostic anywhere**.

Nothing on this branch is broken: publishing refuses unmapped drops, so an unresolvable entry only exists in a corrupted or planted store. But "only reachable through corruption" is exactly the condition under which a security control should fail *closed*.

**Plan 3 owns the decision, and it is a decision, not a bug fix.** Fail-closed (refuse the transition when any candidate entry cannot be resolved) is the safe reading and can deny a legitimate move on a store nobody has noticed is corrupt. Diagnostics-only (skip, but surface the unresolvable entry somewhere an operator sees) keeps availability and admits the control is advisory in that state. What must not survive Plan 3 is the current arrangement: fail-open, plus a committed comment asserting a precondition Plan 3 itself removes. **Whichever is chosen, that comment gets rewritten in the same change.**

### 4. `require-different-user` trusts the log's array order, not the `seq` each entry carries — Plan 3's projection brief

The same rule ends with `// Iterating oldest-first and overwriting leaves the LAST match standing` (`require-different-user.ts:57-58`). That is correct today and it is correct *by convention*: `TicketState.transitions` is documented as appended oldest-first, and Plan 2's harness appends in order. Every entry carries a `seq` field (`packages/domain/src/entity-state.ts:38`) and **nothing in the monorepo reads it**.

So the identity of "the last person to make this move" — the whole content of four-eyes — rests on a projection's append order rather than on the ordering field the data already carries. **A Plan 3 projection that appends out of order silently inverts latest-wins**, and the failure mode is not an error: it is the wrong person's id compared against the wrong actor, refusing legitimate moves and accepting self-approvals, with a green suite. There is no test that would catch it, because every fixture's log is built in order.

**Plan 3's projection brief must either guarantee append order explicitly** (and say so where the guarantee is made, so a later refactor knows it is load-bearing) **or sort by `seq` at the point of use** — which is a one-line change in RDU and makes the field earn its place. The second is preferable: a guarantee that lives in one projection's implementation detail is the same durability problem this whole section is about.

### 5. The entity↔workspace door is server-only, and Plan 10's replica must mirror it knowingly

Coordination §11 gave Plan 2 both the type↔kind and entity↔workspace refusals. Type↔kind (G1) landed in `parseEvent`, in domain, so every consumer inherits it. Entity↔workspace (G2) landed in `commitOne` (`apps/server/src/ingest/ingest-service.ts:115-122`) and **could not** land in the shared engine: the check reads which workspace an entity is already bound to, and a workspace-scoped client replica cannot see a binding in a workspace it does not hold. The obligation is carried today only in a code comment at that site.

**Plan 10 must mirror this door in the offline replica, spelling the refusal code `entity-workspace-mismatch` identically** (the constant sits beside `IngestErrorCode` for exactly this reason, and Plan 6's UI must spell it the same way). A replica that omits it will accept locally what the server refuses on sync, which is the worst version of this failure — the user has already done the work.

Recorded with it, the coupling Plan 2 accepted deliberately, so Plan 10 inherits the reasoning rather than the conclusion: **the tenant boundary reads `proj_entity_heads`, a derived and rebuildable projection, not `events`, which is authoritative.** Normally that is backwards. It is safe here for two named reasons, and only while both hold: the head row is written in the **same transaction** as the event, so the projection cannot lag the ledger by even one commit; and `reset()` is `TRUNCATE`, which takes ACCESS EXCLUSIVE, so a rebuild cannot interleave with an ingest and expose an empty table as "not yet bound." **A projection reset that switches to `DELETE` (Plan 1 §6 already names this as a live possibility) breaks the second reason, and this door with it.** Whoever writes the first non-`TRUNCATE` reset re-derives this.

### 6. The node:fs barrel hazard — resolved in this branch; the new import path is the part later plans need

`packages/rule-engine/src/index.ts` re-exported the fixture harness, and the harness imports `node:fs`, `node:path` and `node:url` at module top level. Since **Plan 6's web client and Plan 10's offline replica both enter this package at `evaluateEvent`**, the package's only entry point dragged the filesystem into the browser, with no `sideEffects: false` to let a bundler drop it. Ruled a real hazard at Task 4 and routed here; taken in the branch's fix wave instead, because it was five lines.

The resolution, which later plans need as fact rather than as warning:

- **The root entry no longer exposes the harness.** Verified in the built output: thirteen modules are reachable from `dist/index.js` and none imports a node builtin.
- **The harness ships as a subpath export — `@gisik-nokma/rule-engine/fixtures`.** This is a deviation from Plan 2's File Structure pin ("`src/index.ts` — export engine + fixture harness"), ruled deliberately: the pin's intent was that the harness ships from this package so server and client builds prove the same refusals against the same defects, and a subpath serves that intent exactly, without every browser consumer paying for it.
- **`"sideEffects": false` is declared**, so a bundler may drop unused re-exports safely.

**Plans 3 and 9 ship fixtures into `packages/rule-engine/fixtures/` and import the harness from `@gisik-nokma/rule-engine/fixtures`, not from the package root.** Two constraints ride with that import, both previously brief-only and now committed beside the code they constrain: fixtures live **flat** in that directory (the scan is non-recursive; a fixture in a subdirectory is silently skipped, which `fixtures.test.ts`'s exact-count assertion now catches — **bump the count in the same commit as the fixture**), and fixture candidates stay in workspace **`ws_1`** unless the harness is extended, because memberships are keyed to `ws_1` unconditionally and an overridden workspaceId yields a null membership and a legitimate-looking restrict-to refusal.

Carried in the same item because it was routed with it: **`asOfWorkspaceSeq`'s same-stream precondition, for Plan 3's brief.** The docstring half is durable in code already; the half that is not is who it is for. Positions from different workspace streams are not comparable — asking for a definition as of another workspace's sequence number returns a silently *wrong* version, not an empty result. **`proj_tickets` is the intended caller**, and it must pass a position from the same workspace stream as the workflow it is asking about.

### 7. Riders — smaller claims on later plans, recorded so they are not rediscovered

- **The parent-terminal invariant is inert server-side until Plan 3.** `getChildrenStates` stubs `[]` in `apps/server/src/engine-context.ts`, so the one invariant no workflow author can switch off currently refuses nothing in production. It is fully proven by fixtures against the in-memory harness, which is why the suite says nothing about it. **Plan 3 makes it real when it lands the ticket projection**, and that is the moment its fixtures stop being the only thing holding it up.
- **Evidence-id existence is unchecked by design.** `require-evidence` proves an id was supplied, not that it points at anything. Attachments are Plan 7's and the ticket projection is Plan 3's; **whichever lands second owns the existence check**, or owns recording that it stays unchecked.
- **Dispatch hygiene: an RTK-proxied `diff` reported "identical" for files that differed**, during a Task 10 mutation sweep — a false clean on the exact operation a mutation restoration depends on. The incident was closed by sampling the tree directly, and the compensating procedure was applied for the rest of the plan and belongs in every future one: **verify mutation restorations with `git diff` or by reading the file, never with a proxied shell `diff`.** A tool that lies about equality turns a mutation sweep into theatre.
- **`transitionSchema` admits `to: '*'`, and a dangling wildcard target publishes clean.** `packages/domain/src/workflow.ts:36` types `to` as `z.string().min(1)`, and the reference check at `packages/domain/src/validate-workflow.ts:40` is `if (ref !== '*' && !stateIds.has(ref))` — applied to **both** endpoints. The wildcard is only meaningful on `from`; on `to` it means nothing. Such an edge passes `unknown-transition-state`, contributes nothing to reachability or `terminal-no-inbound`, and can never be selected at runtime (the engine refuses `unknown-state` first), so it is inert — but it survives into `proj_workflows` and **Plan 8's builder will read it back and render an edge to nowhere**. The fix is one condition: make the check endpoint-aware, so the `'*'` exemption applies to `from` only, plus an issue code for the `to` case. Taking it or explicitly declining it both close this; leaving it unrecorded does not.

### 8. Owner ruling requested: a wildcard edge voids the rule vocabulary on every other inbound edge

This is a **request, not a ruling.** It is the same class as item 2 — a shape that publishes clean and silently does not do what its author drew — and Plan 2 declined to rule it because the answer changes a tier the owner scoped by hand.

Rules in the closed vocabulary attach to **one transition**. A `from: '*'` transition is an edge from *every* state. So an authored `{from:'*', to:'done', rules:[]}` sitting beside a guarded `{from:'doing', to:'done', rules:[restrict-to …]}` makes the guard optional for any ticket not currently in `doing`: the author drew a guard, the engine honours it on one path, and nothing tells them.

Probed against the built engine on exactly the canonical `wf_rules` "Guarded" definition that all seventeen rule-vocabulary fixtures use, with a restrict-to on doing→done naming only `user_boss`:

```
validateWorkflowDef(def) -> []            (publishes clean)
adviseWorkflowDef(def)   -> []            (no warning)
todo  -> done  as user_a -> {"refused":false}                <-- guard bypassed
doing -> done  as user_a -> {"refused":true,"rule":"restrict-to", …}
```

Three things this is **not**, so the ruling is made on the real question. It is not the exact-over-wildcard precedence, which is pinned and genuinely witnessed — the bypass exists with no exact edge shadowing anything. It is not a deviation from what was ordered: the owner decision above scopes the advisory tier to "its one code is `rdu-bypassable`," and `advise-workflow.ts:28` (`if (rule.kind !== 'require-different-user') continue;`) implements exactly that, faithfully. And it is not a code bug — `validateWorkflowDef` *deliberately* blesses the coexistence (an exact edge plus a from-any edge to the same target is affirmatively not a duplicate).

What the composition exposes is narrower and more uncomfortable: **the owner's own reasoning for `rdu-bypassable` — "a rule whose guarded transition is reachable without the guarded precondition is real but not structural, so warn rather than refuse" — applies verbatim to restrict-to, require-comment, require-evidence and require-field over a wildcard edge.** Only require-different-user got the warning. Against spec invariant 2 and §4's builder promise ("live validation, publish when clean"), a definition that publishes clean while its declared guard is void from the initial state is a failure of the honesty floor, not of the code.

Two candidate resolutions, both coherent:

1. **Generalise the advisory tier.** `adviseWorkflowDef` emits a `rule-bypassable`-style advisory for any guarded target also reachable by a lower-guard edge, for every rule kind. Consistent with the reasoning already accepted, costs one issue code and one walk, and warns at publish where the author is looking.
2. **Make it a Plan 8 builder-surface warning.** The builder is where the two edges are drawn and is the only surface that can show *which* edge voids *which* guard, visually. Cheaper in domain, but a hand-authored definition posted to the API gets no warning at all.

Whichever is chosen, one consequence follows either way: **the `wf_rules` fixture definition is itself an instance** — the J-kill wildcard edge added by the Task 8 ruling put it there — and it should stop being the unremarked example that seventeen fixtures are written against.

**Owner ruling (2026-08-28): option 1 — generalise the advisory tier.** And a codicil the request underspecified, stated in the owner's own words: *"we should be able to have the anywhere arrow carry its own guard."* A `{from:'*', to, rules:[…]}` edge is already structurally legal, and the engine already enforces whatever rules the resolved edge carries — the evaluation path does not care which edge shape resolved. That guarded-wildcard shape is the **sanctioned way to close the hole**: the generalised advisory must NOT fire when the wildcard edge's own rules cover the guard on the exact edge. What "cover" means precisely — same-kind-present as the floor, or full rule-set equivalence — is the implementer's design call, argued in the amendment's own brief rather than pinned here.

The amendment lands in **the plan that next touches `advise-workflow.ts` — Plan 8 at the latest** (the builder then gets the which-edge-voids-which-guard visual for free from the same advisory data). Four requirements travel with it:

1. A `rule-bypassable`-family advisory for every rule kind; whether `rdu-bypassable` stays distinct or is subsumed is the implementer's call, with the copy-table discipline either way.
2. The silencing behaviour is witnessed in **both** directions: an uncovered wildcard edge warns; a covering one does not.
3. Wildcard-edge rule *enforcement* gets its first witness. As of 2026-08-28 no fixture in the suite carries a wildcard edge with non-empty rules — the enforcement is structural but unproven. A planted-defect fixture (a wildcard edge carrying `restrict-to`, refused through it) lands with the amendment.
4. The `wf_rules` fixture definition stops being the unremarked instance: its wildcard edge either gains a covering guard or a comment naming it as the deliberately-warned example once the advisory exists.

**Amendment landed 2026-08-28, as the micro-PR on `pre/f5-advisory-generalisation` rather than inside Plan 8.** All four requirements are discharged. The three calls the ruling delegated to the implementer were made, and are recorded here so Plan 8 inherits them rather than reopening them; each is argued at length in the doc comments of `packages/domain/src/advise-workflow.ts`.

- **`rdu-bypassable` was kept, not subsumed.** The two codes answer different questions — whether the WATCHED STATE can be avoided, versus whether the GUARDED EDGE can be. `rdu-bypassable` can fire on a target with exactly one edge into it, which the new code cannot by construction; and a def can trip both on one rule, for reasons an author would fix in two different places. One code could not have said that.
- **Cover is same-kind-present, not rule-set equivalence.** A rule of kind K on the guarded edge is covered when the other edge carries at least one rule of kind K. Parameters are never compared — not restrict-to's assignee/roles/userIds, not require-field's `field` — because there is no honest ordering over them at a layer that cannot see who holds which role in a workspace. Silence therefore means the author *said something* of that kind on the other path, and nothing stronger. Requiring equivalence would have left the owner's sanctioned fix carrying a warning nobody could clear.
- **Requirement 4 took the annotation route, not the covering guard.** Checked first, as the requirement asks: a covering guard on `wf_rules`'s wildcard edge changes no fixture's expected outcome, because every one of them puts its ticket in `doing` and the exact edge wins. It would still have cost something the requirement did not price. With the wildcard's rules empty, **twelve of those fixtures refuse only if the exact edge resolved** — they are the suite's only witness for exact-over-wildcard precedence (there is no dedicated precedence test; §8 above calls the precedence "genuinely witnessed", and this is where). Identical covering rules would leave all of them green while retiring that witness in silence. The fixture schema gained an optional top-level `notes` string instead — the only comment JSON allows, kept at the top level because a note nested in the def would be stripped by `workflowDefinedPayloadSchema`'s non-strict parse — and every instance now names itself as the deliberately-warned example. *(The count above says seventeen; the true figure is nineteen — seventeen `rule-*` files plus the two `rules-*` ordering fixtures, all carrying the same def.)*

## Owner decision (2026-08-28): Plans 3–11 execute in parallel waves

The declared order (3 → 4 → 5 serial, then 6/7/8/9, then 10, then 11) was written at plan granularity. A task-level extraction of all nine remaining plans — nine agents, one per document, every load-bearing claim verified against `main` at `faca8b2` rather than taken from plan text — found that the real gates are narrow, named artifacts, not whole plans. This section is the restructured schedule and the rulings that make it safe. Honest expectation, stated so nobody audits against a number that was never promised: **~3× versus continuing one-plan-at-a-time (how Plans 1–2 actually ran), ~2× versus the declared order if its 6–9 wave would genuinely have run four-wide.** What caps it is not dependency structure but the owner's review bandwidth (3–4 concurrent PR streams), merge churn on shared files, and the per-plan review machinery — all priced below.

### The three findings the schedule stands on

1. **Plan 3 Tasks 1–2 are the keystone.** Pure domain work (ticket type module + event vocabulary, no database). They alone unblock Plan 4's workspace bootstrap (`builtinTicketTypeDefs` + `ticket-type.defined`), ~10 of Plan 8's 15 tasks (everything downstream of `TicketTypeDef`), Plan 5 Task 6's vocabulary shapes, and Plan 7's server gates. They therefore merge to `main` as an early micro-PR the moment they are green — not at Plan 3's end. **Mandatory rider (Plan 1 consequences §9):** registering `ticket.transitioned` opens the Task 2→12 hazard window, and early-merging makes it *worse* than the plan's own serial order — the type becomes ingestible on `main` exactly while Plan 4's lane runs ingest tests against that `main`. The micro-PR carries the recorded remedy **in the same commit**: `engine-context.ts`'s `getEntityState`/`getChildrenStates` return `null` for the kinds they cannot honestly serve, until Plan 3 Task 12 replaces the stubs.

2. **Plan 4 is mostly Plan-3-independent.** Its partition A — better-auth identity (T1), sessions/routes (T2), membership+visibility domain events (T3), `proj_memberships` (T4), the role gate without bootstrap (T5 steps 1–5) plus `simple-kanban.ts`, `proj_visibility` (T6, payloads destructured inline, no Plan 3 import), and `proj_projects` + the honest project-existence refusal (T9 step 3b) — runs on today's `main`. Its Plan 3 needs collapse to exactly two seams: Tasks 1–2 (bootstrap, T13 runtime) and the `proj_tickets`/`proj_rollups` migrations (read paths T7/T8/T9/T10 and test seeding).

3. **The tail is fatter than declared.** Plan 10 needs Plan 5 for *nothing structural* (tests use scripted fake transports; the dual-client rig deliberately bypasses the WS and pipes `visibleEventsFor` straight into `applyServerItem`). Plan 6 splits at the `DataSource` seam: **6a** (ui tokens, the `DataSource` contract + view types, domain guards, claims machinery, all views over the fake source — 12 of 17 units, containing everything Plan 10 consumes) runs on `main` today; only **6b** (online HTTP/WS transport, shell, invite pages, the doors) waits on Plans 4/5. Plan 7's client half (~12 tasks — the whole editor package, Drive picker, evidence picker, RN webview bundle) runs today. Plan 8 needs Plan 5 for **zero** authoring tasks (the fake gateway is the seam and Plan 5 Task 9b serves its pinned interface verbatim). Plan 11's infra scaffold (env contract, alerting, rate limiter, server Dockerfile, backup modules, CI skeleton, DB/DNS provisioning docs, `.env.example` + `check:env` gate) runs today.

### Pre-work — standalone micro-PRs before any lane dispatches

- **The F5 advisory amendment** (§ ruling above). The extraction found it is absorbed by *no* task in any plan — Plan 8 only consumes `adviseWorkflowDef`, never modifies it. It is pure `packages/domain` + fixtures work, executable now; the schedule pulls it forward as its own PR, all four travelling requirements included. "Plan 8 at the latest" stands satisfied early rather than reassigned.
- **The type hoist** (Plan 1 consequences §10): `LedgerEvent`, `IngestResult`, `IngestErrorCode`, and `ENTITY_WORKSPACE_MISMATCH_RULE` move to `@gisik-nokma/domain` in one PR. Plan 6 T5 and Plan 10's first task each claim half of this; done once here, both claims are discharged and the barrel conflict never happens.
- **`docToPlainText`** (Plan 5 Task 1 — consumes nothing) lands as a micro-PR in Wave 1, so Plan 9 T2's and Plan 7 T6's create-if-absent guards never fire.

### Seven pre-rulings — collision ownership under concurrency

The plans' create-if-absent guards and overlapping claims were written assuming serial execution, where "absent" meant "the owner hasn't run yet." Under parallel lanes it can mean "the owner is running right now in another worktree." Ownership is therefore pinned:

1. **Ticket read routes.** The earlier ruling stands (Plan 3 owns `GET /v1/tickets/:id/history`; Plan 4 owns ticket read endpoints and wraps enforcement around both) — but both plan *texts* still claim overlapping surface (Plan 4 line 5289 vs Plan 3 Task 13). Executors: Plan 3 T13 ships `routes/ticket-history.ts`; Plan 4 T8 creates `routes/tickets.ts`; Plan 4 adapts at merge and cites this line.
2. **`simple-kanban.ts`**: Plan 4 lands it (partition A). Plan 8 T3's guard must NOT create it — if absent, the lane waits.
3. **`clock-skew.ts`**: Plan 10 T1 owns it. Plan 6 T6's guard defers.
4. **`docToPlainText`**: pre-work micro-PR above; no guard creates it.
5. **Evidence-existence gate**: Plan 7 owns it unconditionally (its Task 11 already implements it with no conditional branch); the "whichever lands second" clause in Plan 2's consequences is resolved.
6. **`projections/index.ts` + the projection-order test**: §8's order is the single source; whichever plan merges second updates the array to the full §8 order. *(Corrected 2026-08-28 by the cross-lane controller: this parenthetical previously read "the pin on `main` today omits `proj_projects` and mis-slots `proj_tickets`." Nothing was mis-slotted — the registry held exactly two projections and the assertion pinned exactly those two, so there was no third to mis-slot. What omitted `proj_projects` was the **doc comment** above the assertion, reciting the pre-2026-08-26 order. Lane 2's brief inherited the original wording; no other brief carries it.)* `fixtures.test.ts`'s exact count merges arithmetically — every colliding branch states its delta, the merger sums them.
7. **`packages/app-core` + `packages/ui` scaffolds**: Plan 6a owns both and merges the scaffold early (same micro-PR pattern as the keystone). Plan 8 T1's and Plan 9 T8 Step 0's guards wait for it rather than exercise.

### The waves (3–4 worktree lanes; one shared Postgres — per-test-file databases already isolate them)

**Wave 1 (now).** Lane 1: Plan 3 in full (keystone micro-PR first; internally two independent chains — domain/rule-engine T3–T8 needing no database, server T9–T13 — which may be two sub-lanes). Lane 2: Plan 4 partition A → B2 (bootstrap, after the keystone merges) → B1 (read paths, after Plan 3's T10/T11 migrations merge). Lane 3: Plan 7 client half + Plan 8 pre-Plan-3 tasks (T1, T2's summaries/anchoring, T3 minus the kanban guard); Plan 7's server T7/T8 once Plan 4 T1 lands `Queryable`. Lane 4 (periphery): Plan 6a; Plan 11 infra scaffold; Plan 5's zero-dependency micro-tasks (T1, T2, T3/T13/T14 domain halves); Plan 10's prefix (T1 contest vocabulary, T2 contest evaluators, T8 `SyncStorage`, T3a `stream-seq`); Plan 9's T2/T3.

**Wave 2 (Plans 3+4 on `main`).** Plan 5's spine (T4→T5→T6→T7→T8→routes→T9b→T13→T14/T15). Plan 9's middle (T1 with the fixture-count sum, T4, T5, T7, client chain T8–T13). Plan 10's core (T3b–T7 server side, T9–T12 replica, then T14/T15 dual-client). Plan 8's A′ (T4–T12, everything `TicketTypeDef`-gated) + Plan 7's server remainder (T9/9a/10/11/11a) + Plan 7 T6.

**Wave 3 (Plan 5 on `main`).** Plan 6b (T7/T8 transport, T14 shell, T15/15b invite pages and doors). Plan 9 T6 — the attention sweep, the one task in the series genuinely needing the full 3→4→5 chain, with its explicit no-stub instruction honoured. Plan 8 T13.

**Wave 4 (Plan 6 on `main`).** Plan 10 T13/T16/T17 (contest UX, Tauri, Expo). Plan 9 T14, Plan 8 T14. Plan 11's remainder: web Dockerfile + full compose + seeds (needs Plans 3/4/8) + full CI + deployed-stack E2E + provisioning + dogfooding. Each plan's catalogue task closes its own plan, same change set as ever.

**Critical path:** Plan 3 → Plan 4 remainder → Plan 5 spine → Plan 6b → Plan 10 shells → Plan 11 close. Plan 3 heads it; its two-chain split is the next lever if more compression is wanted.

### Parallel-execution discipline (binding on every lane dispatch)

- **Unblocking artifacts merge as micro-PRs when green.** A keystone sitting unmerged in a lane branch blocks three other lanes exactly as if it were unwritten.
- **Adaptation maps get staler faster under parallelism.** Every dispatch carries the sibling lanes' current branch heads; maps re-run at each wave boundary; import origins come from shipped code, never plan text (standing law, now load-bearing across lanes).
- **The mocked-contract law gains a checkpoint.** The fakes the early lanes build against (6a's fake `DataSource`, 8's fake gateway, 9's abstract gateways) are the plans' own sanctioned seams, and every one now has a named plan+task serving the real contract. What parallelism adds: at each wave boundary, one live-integration pass proves the seams against the real server before the next wave builds on them. Separately and regardless of this schedule: Plan 6's Playwright smoke stubs every server call and can pass with no API server running — it gains a live-server variant when Plan 6b lands.
- **Review machinery is unchanged per plan — ruled by the owner, 2026-08-28: review depth is not trimmed.** Every lane carries the full machinery — SDD per-task implementer→reviewer→fix rounds, the pre-flight scan with its adaptation map, the final whole-branch review with adversarial refuters. The speedup is schedule-only; the ~4× compute and review-attention cost of four lanes at full depth is accepted. The machinery is what caught every recorded defect class in Plans 1–2, and no lane may cite this section's throughput goal as grounds to skip a gate.

### Autonomous execution protocol (owner-ruled 2026-08-28)

The owner answered the three authority questions that would otherwise make them the blocking step in every lane. All three rulings are standing; each is revocable by the owner at any time, in a word.

1. **Merge authority — standing authorization to auto-merge when fully green.** Any PR that has passed its full machinery (SDD per-task gates, review clean, fix rounds closed) **and** an independent CI run green may be merged to `main` by the controller without a per-PR ask. The owner is notified after each merge and may revert any of them. What does NOT change: direct pushes to `main` remain forbidden, every change still travels branch→PR, and the full-depth review ruling above still applies — this delegates the approval click, never the checks. **Precondition: the CI skeleton must exist on `main` before the first auto-merge.** Without an independent check, "green" is a lane's own word — self-certification. Plan 11 Task 14's lint/typecheck/unit/server-fixtures skeleton is therefore **promoted into the pre-work micro-PRs**; the fixtures-client, dual-client, e2e jobs and the interim-plumbing gate still land with their owning plans.
2. **Wave transitions — standing go-ahead.** Wave N+1 dispatches automatically the moment its gate condition is met (Plans 3+4 on `main` → Wave 2; Plan 5 → Wave 3; Plan 6 → Wave 4), with a notification at each transition. Ultracode orchestration carries standing authorization for all lane work under this schedule — granted with this protocol, in place of the per-message grants used for Plans 1–2.
3. **Rulings — conservative default + record, never silently and never blocking.** When a lane hits a decision the plans do not answer (a new F5-class question), it takes the conservative option — fail-closed, refuse, the narrower scope — records a ruling-request entry in this document **in the same change set**, push-notifies the owner, and continues. The owner ratifies or overrules post-hoc; an overruled default becomes a follow-up PR. A lane blocks only where a plan or this document says MUST (e.g., Plan 9 Task 6's no-stub instruction).

Mechanics that ride with the protocol: lane sessions run in per-lane git worktrees with pre-approved permissions so no tool prompt stalls them; the session-limit resumer (already enabled) covers session death; true blockers push-notify rather than waiting silently.

**Owner ruling (2026-08-28): lanes run fully unattended — no permission prompts.** Lane sessions launch with `--permission-mode bypassPermissions`, which is the default in `start-lanes.sh`; a session intended for supervision overrides with `PERM_MODE=manual`. This removes the last human-in-the-loop stall from the protocol: a lane that pauses for a prompt at 3am has stopped being autonomous, and the prompts were never the control that mattered — the controls are branch-and-PR discipline, the independent CI gate, the full review machinery, and the owner's power to revoke any of these authorizations in a word. Note what this does NOT relax: `main` is still never committed to directly, every change still travels through a PR, review depth is still not trimmed, and conservative-default rulings are still recorded in this document as they are made. The irreducible owner touchpoints — the two things no protocol can delegate — are DigitalOcean credentials/DNS at Plan 11's deploy, and the dogfooding itself.

### Model and effort policy (owner-directed 2026-08-28) — right-sized in both directions

The tier follows the **failure cost** of the task, not its size. "Optimised" cuts both ways: no top-tier tokens spent transcribing code the plan already contains, and no mid-tier tokens spent on tenancy or security semantics where a plausible-looking wrong answer ships silently. This generalises the map Plans 1–2 proved (sonnet transcription / opus semantics / top-tier final review) to the whole parallel run.

| Work class | Model | Effort |
|---|---|---|
| Transcription implementers (plan text carries complete code; adapt spellings per the adaptation map) | sonnet | medium |
| Mechanical: scaffolds, Dockerfiles, CI YAML, barrel exports, migrations from pinned schemas, Features.md/test-cases catalogue tasks | sonnet | low–medium |
| Pre-flight task extractors, grep verifiers, pure search | sonnet (haiku acceptable for pure search) | low |
| The adaptation-map agent (binding over the briefs — it caught ~a dozen collisions in Plan 2) | opus | high |
| Core-semantics implementers: reducers, projections, engine checks, folds, stream/sync logic, view-models carrying honesty semantics | opus | high |
| Fixture authoring and planted-defect design (falsifiability-load-bearing) | opus | high |
| Per-task reviewers | opus | high |
| Final whole-branch review lenses — the three reading lenses | opus (owner ruling 2026-08-31, below) | max |
| The mocked-contract lens | top tier (Fable-class) | xhigh–max |
| Adversarial refuters | top tier (Fable-class) | xhigh–max |
| Lane controllers / orchestrators | Opus 5 (owner amendment, below) | — |

**Owner amendment (2026-08-28, second ruling on this table): controller sessions run Opus 5, and "top tier" in this table means an explicit `fable` dispatch, never "the session's own model."** The original line ("controllers are top-tier deliberately") is amended on the owner's direction, with the account's weekly usage pool as the stated reason: controller sessions carry the bulk of every lane's tokens, and Fable-class spend there exhausts the shared pool fastest for the least marginal judgment. What does NOT move down: final whole-branch review lenses, adversarial refuters, and floor-list task reviewers are dispatched with `model: fable` explicitly — bounded fan-outs where the top tier's judgment is the product. If a session cannot dispatch fable, the fallback is opus at max effort, recorded in the ledger as a deviation.

**Budget pressure is never grounds to thin a gate.** When the weekly pool nears its cap, the sanctioned response is to DEFER work — pause non-critical-path lanes, hold a wave until the reset — never to skip a review, drop a refuter, or de-escalate below a class floor. A lane that cannot afford its machinery does not run until it can.

### Owner ruling (2026-08-31): Fable is narrowed to the absolute necessity, and this DOES amend the rule above

The owner has directed that Fable-class dispatch be cut to what is strictly necessary, on the account's
weekly pool. **This is a budget-motivated de-escalation of a gate, which "budget pressure is never grounds
to thin a gate" forbids in as many words.** That paragraph is amended here by the owner rather than
quietly worked around, because a contradiction between two live rules is worse than either rule being
wrong. The controller argued against this specific change and was overruled; the argument is recorded
below so a later reader can weigh it rather than rediscover it.

**What moves down: three of the four final whole-branch review lenses, to opus at `max` effort.** They are
the expensive half — $78.70 of the measured $117 — and the most substitutable, because their work is
reading for the presence of correctness across a delta, which opus at max does well. The deviation-ledger
path this document already defines for an unavailable fable dispatch becomes the normal path for them.

**What does NOT move, and the reason is evidence rather than caution:**

- **The adversarial refuters.** They are the cheaper half at $38.50 and they are where the top tier's
  judgment is demonstrably the product. The §11 cross-workspace forgery was found by a refuter that
  **committed the forgery end to end over the shipped door** rather than reasoning about whether it was
  possible. Three layers each individually correct, no layer asking the question — that is not a finding
  reading produces. Cutting the refuters would have saved $38.50 and cost the single most serious defect
  found in this series.
- **The mocked-contract lens**, kept at top tier and split out of the lens row above. A mocked contract is
  what excuses the server from existing, and it is this series' signature failure — the one the plan
  review found repeatedly and the one no other lens is pointed at.
- **The floor-list task reviewers**, unchanged. Twenty-four named tasks selected precisely because a
  plausible-looking wrong answer ships silently, which is the condition under which a tier drop is least
  affordable.

**The controller's argument against, recorded because it was overruled and may prove right.** Of the three
levers measured on 2026-08-31, this is the smallest saving and the only one that trades away a check.
Batching already cuts the NUMBER of Fable reviews without touching what any one of them does; concurrency
caps and the unfollowed sonnet rows were both larger and free. The risk this accepts is not a worse review
today but a defect escaping the last gate before `main`, which in this series has repeatedly cost a
follow-up PR — and the accounting for that never lands in the same column as the saving.

**What this does NOT relax.** Escalation still runs the other way: a task failing two fix rounds escalates
its implementer a tier, and a lens that returns a finding it cannot resolve escalates to fable for the
re-read. De-escalating below a class floor remains forbidden. Deferral remains the sanctioned response to
budget pressure for everything not named here — this ruling narrows one row, it does not license lanes to
tier down at their own discretion when the pool is tight.

**The floor list** — tasks the extraction flagged as subtle enough that the implementer floor is opus-high AND the reviewer is top-tier, non-negotiable: Plan 3 T3 (reducer + fold), T10 (as-of resolution), T12 (engine-context hazard closure), and the RDU fail-closed decision · Plan 4 T5 (permission gate + bootstrap), T7 (canSee + the SQL twin that must not disagree), T11 (visibleEventsFor + purge split), T14 (invite token custody) · Plan 5 T5 (visibleTicketsWhere), T9b (all-or-nothing migrate), T14/T15 (stream hub + WS) · Plan 6 T6 (claims machinery/precheck) · Plan 7 T9 (sniffing + upload permission), T11 (ingest-transaction gates) · Plan 8's F5 amendment (the "cover" semantics are a design call) · Plan 9 T6 (the four-plan sweep) · Plan 10 T7 (sync idempotency + contests), T9 (replica fold + baseline rewrite), T14/T15 (dual-client rig + scenarios) · Plan 11 T8/T9 (the CC mapping — invariant 4, no fabricated history) and T12 (restore drill).

**Escalation, never silent de-escalation:** a task that fails two fix rounds escalates its implementer one tier for the retry, recorded in the ledger with the reason. De-escalating below a class floor is forbidden on the same grounds as the review-depth ruling — throughput is never grounds to thin a check.

**Ultracode usage — where it is required, where it is waste.** The standing authorization above says lanes *may* orchestrate; this pins *when*, because a fan-out where one agent suffices is the same mis-sizing as a top-tier model on transcription — in the other direction.

- **Required, per full plan lane (the Plans 1–2 proven shape, unchanged):** exactly two fan-outs — the **pre-flight scan** (task extractors + the repo-verified adaptation map, which under parallelism also ingests sibling lanes' branch heads, + the coordination-obligation lens → conflict table) before the first task dispatches, and the **final whole-branch review** (four lenses with mocked-contract at top effort, adversarial refuters, ledger triage, synthesis) before the branch's PR is auto-merge-eligible. No full plan ships without both.
- **Required, per periphery lane — batched, not per branch (2026-08-31):** a lane holding slices of several plans ships a series of small branches rather than one large one, and the rule above, written per *plan lane*, silently became per *branch* for it. Lane 4 is the live case: five plans' slices, already on its second `exec/` branch, each one triggering a full review fan-out. It therefore **batches** — one final whole-branch review over the accumulated slices at a coherence point of the controller's choosing, not one per branch. This is not a thinned gate and does not touch the review-depth ruling: the same lenses at the same tier read the same lines of code, once, over a wider delta. **Lane 4's own argument for it is better than the cost one and replaces it here: per-branch was buying a NARROWER review at four times the price.** A whole-branch lens cannot see interaction between two branches it read separately, so the per-branch shape paid more for less of exactly the thing the lens exists to do. What is NOT batched: the floor-list reviewers, which are per task and stay per task.
- **Required, conditionally:** any fix wave that follows a finding-bearing final review gets a **scoped re-review fan-out** over the fix commits (the Plan 2 pattern, now pinned rather than habitual). A wave-boundary live-integration checkpoint that finds seam drift escalates from its single-session check to a scoped fan-out over the drifted seams.
- **Not used, deliberately:** per-task implementation (plain SDD implementer→reviewer→fix rounds is the machinery), micro-PRs (pre-work, the keystone, scaffolds — single implementer + single reviewer at their class tiers, floor-list tiers where the F5 amendment or the keystone rider applies, CI still gating the merge), catalogue tasks, and mechanical rebases. Running the two-fan-out treatment on a forty-line diff is theatre, and theatre spends the budget honesty needs.
- **Controller's judgment for everything else:** a lane controller may invoke a fan-out wherever independent perspectives or adversarial verification would change the answer — a cross-lane conflict no pre-ruling covers, a floor-list task still failing after tier escalation, a suspicious green. The test is written here so the judgment is auditable: *would a second, independent look plausibly reverse this conclusion?* If no, one agent; if yes, fan out.

### Fan-out sizing and budget mechanics (2026-08-31) — measured, after the first stall

The tier table above was written from judgment. This section is written from the transcripts: 306 session files, weighted at published per-model rates with cache write at 1.25x input and cache read at 0.1x. It exists so the next budget decision argues with numbers rather than intuitions, and because two of the intuitions were wrong.

**One final whole-branch review costs ~$117.** Measured on Lane 4's `exec/10-prefix` run of 2026-08-31: four lenses at $78.70 over 559 requests, then eight refuter and triage dispatches at $38.50 over 399. Estimates before the measurement ran to ~$295; the real figure is under half that, and the cheaper half of it is the adversarial work. Budget a wave's reviews at this number, not at a guess.

**The controller question is closed, and the 2026-08-28 amendment was right.** The controller session cost $173 across 2.5 days on 715 requests, all Opus, zero subagents — 4.6% of the project's total spend and the cheapest session per unit of wall-clock in the series. Cost tracks fan-out, not session tier: the plan-authoring session (26 subagents) cost $929 and the Plans 1-2 execution session (67 subagents) cost $657, both over shorter spans. **Do not re-litigate the controller's tier downward.** Moving it to sonnet would save ~2% of project spend and would spend it on the one faculty the role exists for — catching the contract drift and the cross-lane collision no pre-ruling covers. The controller's remaining lever is context size, not tier: its bill is nearly all cache reads on a 2,146-line document re-sent every poll, which is what the clear-and-reload-from-handoff protocol addresses. The watch monitor is the pattern to keep — a shell loop costs zero tokens and wakes the session only when `main` moves, the PR set changes, or a lane pane disappears.

**No fan-out starts against a pool that cannot finish it.** On 2026-08-28 at 22:28 IST Lane 4 dispatched four review lenses; the weekly limit killed them partway and $27 was spent on work that was discarded and re-run three days later. The dispatches are visibly truncated in the transcripts at 35-40% of their completed twins' size. The "budget pressure is never grounds to thin a gate" rule above already names deferral as the sanctioned response; this pins the mechanic that makes deferral possible: **before any fan-out, check remaining pool against this section's measured cost for that fan-out shape. If it does not clearly fit, defer the fan-out and record the deferral — do not start it.** A fan-out killed mid-flight is the worst of both outcomes: full price, no gate. This is the one budget rule that costs nothing to obey, because the tokens it saves were going to be wasted, not spent.

**A fan-out needs isolated worktrees, or serialised mutation windows.** Reported by Lane 4 from the same review: thirteen concurrent review agents mutation-testing a single shared worktree produced transient states another reviewer read as tampering — "a stat-invisible process planting defects with `git status` clean throughout." It was the agents observing each other's in-flight mutations. No damage, tree verified clean afterwards, but it came within one step of being filed as a security finding, and a false security finding costs a full investigation. **Any fan-out whose agents mutate the tree — mutation testers, planted-defect verifiers, refuters that edit to check a claim — gets one worktree per agent, or a serialised mutation window.** Read-only lenses may share.

**What the burn actually looked like, for calibration.** Fable was 45% of spend on 22% of requests, Opus 52% on 65%, sonnet 2% on 12%. But 59% of everything was *cache reads* — context re-sent per request, a function of session length and request count that no tier policy touches. And the day the weekly pool blew (2026-08-28, 39% of the project's entire spend in one day) was 71% Opus, not Fable: four lanes launched at once alongside the controller. **CORRECTED 2026-08-31, later the same day: concurrency AND tier drift, not concurrency alone.** The
original sentence read "concurrency, not tier, is what exhausted the pool" and was written without looking
at the serial baseline's tier mix. Measured since: Plans 1-2, executed serially, ran **30.1% sonnet /
45.6% opus / 23.8% fable**. Wave 1, parallel, ran **2.9% sonnet / 82.3% opus / 14.4% fable**. The tier
policy was in force during the serial run and had collapsed during the parallel one. Tier drift was a
co-cause, not a bystander, and the first version of this line would have sent a reader to cap lanes while
leaving the cheaper fix untouched.

### Wave 1 decomposition (2026-08-31) — 93% of spend carries context, 7.5% produces it

| where | $out | $cacheW | $cacheR | total | cacheR% | avg ctx/req |
|---|---|---|---|---|---|---|
| lane4 | 29 | 123 | 303 | 455 | 67% | 144K |
| lane2 | 19 | 116 | 231 | 366 | 63% | 169K |
| lane1 | 22 | 91 | 227 | 340 | 67% | 179K |
| controller | 39 | 51 | 195 | 285 | 69% | 240K |
| lane3 | 18 | 73 | 157 | 249 | 63% | 143K |
| **WAVE 1** | **127** | **453** | **1,114** | **1,695** | **66%** | |

**The controller seat is 17% of the wave.** That is not where the money is, and the coordination it buys
has receipts no lane could produce: the compound forgery window was findable only from a seat that saw
both halves, and no lane can inspect another's worktree for a collision. It is not free either — the
controller introduced the T5 sequencing error Lane 2 corrected, and one of the two wrong fixture absolutes.

**Coordination's true share is a RANGE, not 17%.** Lanes carry coordination artifacts too: this document
is ~45K tokens, which is 25-30% of a lane's measured 143-179K average context, plus every cross-lane
message sits permanently in the recipient's transcript. Honest bound: **17% (controller seat) to roughly a
third (if this doc is resident in every lane request).** Which end is true is unmeasured. The mitigation
already exists and is not switched on — the briefs became self-sufficient on 2026-08-31, so lanes no
longer need this document resident, and the owner-approved clear-and-reload protocol is the mechanism.

**Do not read the per-task comparison as a parallelism tax.** Serial Plans 1-2 came to ~$23/task; parallel
Wave 1 to ~$94/task so far. The tier table above says a material and unseparated fraction of that gap is
drift rather than parallelism. **Killing parallelism on that number would pay for a tier problem with
wall-clock.** And $94 is an interim upper bound: the window contains a 2.5-day stall and one unusually
heavy coordination day, and Wave 1 is front-loaded — four pre-flights paid, 18 of 55+ tasks done. The
honest figure exists at wave end, not now.

**The synthesis, since the constraint is the pool and not dollars:** parallelism's entire product is
wall-clock, and pool exhaustion destroyed 2.5 days of it across all four lanes at once. **Parallel at four
lanes annulled its own benefit, once.** A wave that must fit a budget caps lanes AND enforces the tier
table — the second costs nothing, because the table already says it.

**Sonnet is under-used against this table's own instructions.** Lane requests ran 27:1 to 69:1 Opus-over-sonnet, against a table that assigns sonnet to transcription implementers, scaffolds, migrations, barrel exports, catalogue tasks, extractors and grep verifiers. Either the dispatches are not setting the model or the work is genuinely all semantics; the first is drift and costs nothing to correct, since this table already authorises it. Lanes should audit their own dispatch models against the table before the next wave.

### Ruling (2026-08-31, controller under delegated owner authority): product-route CSRF — neither option as posed

Lane 2's ruling-request, raised from measurement rather than reading: `validateOrigin` returns immediately
with no request context (`origin-check.mjs:98`) and session resolution goes through
`auth.api.getSession({ headers })`, so better-auth's origin machinery never sees a product route. Against
the shipped server, `POST /v1/events` with a valid session cookie and a forged `origin:
https://evil.example` returns **200**, and a `requireSession`-protected route returns **200 with the
resolved `userId`**. Never 403. Once `requireSession` reaches `/v1/events` (T5 or T12), cookie auth there
rests on `SameSite=Lax` and nothing else.

**The owner delegated this ruling to the controller. It is revocable in a word, like every other.**

Lane 2 posed two options — ratify Lax-only, or require an `Origin` on product routes and accept that every
non-browser caller must then send one. **Neither is taken, because the second option's cost is an artifact
of stating it unconditionally, and the first ratifies something that is not yet a decision.**

**1. `SameSite` is not currently a choice this repository has made, and that is the first thing to fix.**
Swept `apps/server/src` file-by-file: **no `sameSite` setting exists anywhere.** The entire defence being
proposed for ratification is an unwritten default of a dependency. If better-auth changes its default, or
a later task sets `SameSite=None` because some cross-site client needs it, the defence vanishes and
nothing in this repo fails. **Pin it explicitly.** Cheap, immediate, affects no caller.

**The test already exists — Lane 2's correction, and it makes item 1 smaller and sharper than first
costed.** `sign-in-flows.test.ts:148` already asserts the exact attribute list
`['Max-Age=604800', 'Path=/', 'HttpOnly', 'SameSite=Lax']`, so the value already goes red if better-auth
changes its default. The remaining work is the **setting**, not the test. And the reason to do it is not
that the value would otherwise go unnoticed — it would — but Lane 2's distinction, which is the useful
one: **that assertion currently guards a dependency's default; once the value is set explicitly it guards
a decision. Same test, same line, different meaning, and only the second is a security property this
repository owns.**

**1b. The same assertion guards a second thing, and nobody has said so — which is how it gets lost.**
Lane 2's addition. The attribute list is `['Max-Age=604800', 'Path=/', 'HttpOnly', 'SameSite=Lax']` and it
carries **no `Domain` attribute**, so the session cookie is host-only: set by `pm-api.artsourced.in`, sent
only to `pm-api.artsourced.in`. That must stay true, and the way it breaks is specific enough to name.
A later task debugging a cookie-not-arriving problem — entirely plausible the first time the web client is
wired against the API in a real browser — has an obvious-looking fix to hand: add `Domain=.artsourced.in`.
**It would work.** It would also send the session cookie to every subdomain of the zone, converting
today's "a sibling subdomain can forge a request that carries the cookie" into "a sibling subdomain
receives the cookie directly." Strictly worse, and it would arrive looking like configuration rather than
a security change.

Because the matcher is an exact `toEqual` rather than a `toContain`, the guard already exists — adding
`Domain` reddens it. What is missing is any statement that **preventing a `Domain` attribute is one of the
things that assertion is for.** The list is exact, and the absence it protects matters as much as the
presence. Say so at the assertion, or the next person to read it will see four attributes being checked
and not the fifth being forbidden.

**2. The Origin requirement is scoped to COOKIE-authenticated requests, and the stated cost disappears.**
CSRF is a problem about **ambient credentials**. A cookie is ambient — the browser attaches it whether or
not the page meant to. A bearer token is not: it is attached deliberately by code that had to hold it. So
the check belongs exactly where the ambient credential is used, and nowhere else. **Require and validate
`Origin` on product requests authenticated by cookie; require nothing of bearer-authenticated requests.**
Lane 2's objection — that every non-browser caller must then send an `Origin` it has no reason to send —
is true of the unconditional form and false of this one. The desktop and mobile clients are bearer-
authenticated and are untouched.

**3. Why not simply ratify Lax — and the hosting fact is SETTLED ADVERSE, not open.** Verified:
`/v1/events` is POST-only (`routes/events.ts:12`), so Lax's top-level-GET gap does not reach it, and Lax
is a real defence rather than a fig leaf. It is nonetheless insufficient here, and **an earlier draft of
this ruling wrongly left that conditional on a hosting decision it called unestablished. Lane 2 found the
decision, at line 83 of this document, in the owner sign-off table.**

The product is **`pm.artsourced.in`** and the API is **`pm-api.artsourced.in`** — two sibling subdomains
of `artsourced.in`. Line 84 puts the magic-link sender at the apex, `sign-in@artsourced.in`, explicitly
because it is *"the established zone"* — so this is not a fresh domain bought for this product; other
things already live on it. `SameSite` is scoped to the **registrable domain**, and `artsourced.in` is the
registrable domain. Everything on that zone is same-site with the product, and **Lax does nothing between
them.**

**And it is worse than "the deployment happens to be adverse": the architecture REQUIRES the relaxation
that removes the protection.** The web client at `pm.artsourced.in` calls the API at
`pm-api.artsourced.in`. Those are cross-origin, and the session cookie must reach the API for the product
to function at all — which works precisely because they are same-site. So the same-site relaxation is
load-bearing for the product, cannot be tightened without breaking the web client, and any other subdomain
of `artsourced.in` inherits it. **Lax was never going to protect this deployment, and no future hosting
decision can rescue it short of moving the API to a different registrable domain.** Item 2 is therefore
the only CSRF defence available on cookie-authenticated product routes — not defence-in-depth.

**Owner touchpoint, flagged rather than assumed:** if the product ever ships on a domain sharing a
registrable domain with anything untrusted — including a platform's default `*.provider.app` subdomain
where the parent is not on the Public Suffix List — item 2 stops being defence-in-depth and becomes the
only defence. That is a question for Plan 11's deploy, and it should be answered there rather than
rediscovered.

**Assignment.** Item 1 is small and belongs with Plan 4 T5's gate work — Lane 2. Item 2 is also T5's, as
the second branch of the same gate, after the envelope-origin micro-PR and T4. Neither blocks the
envelope-origin closer, which remains the nearer priority. **Note the term collision applies here in full:
item 2 is HTTP-Origin. The micro-PR is envelope-origin. They are different fixes and this ruling asks for
both.**

**Confidence, restated after Lane 2's corrections — and the stated-uncertainty is what made them
findable.** Item 1 unambiguous, and now smaller: the test exists, only the setting is missing. Item 2
standard practice, cost objection dissolved by scoping. **Item 3 is now the MOST certain of the three, not
the least** — the first draft marked its bite conditional on an unestablished hosting fact, Lane 2 went
and found the fact at line 83 of this document, and it is adverse. There is nothing left to re-examine
there; a later reader should treat it as settled and, if anything, check only whether the API has since
moved to a different registrable domain, which is the one change that would alter it.

**Recorded because the process point outlives the ruling, in Lane 2's sharper form:** per-item confidence
did not merely make the weak paragraph *findable* — it told a reader with no budget to re-verify a whole
ruling **where to spend one check.** "This item's bite depends on a fact nobody has established" is an
explicit invitation to go establish it, and it cost one grep. Uniform confidence would have been cheaper
to write and would have hidden the one paragraph that was wrong, inside a document containing its own
refutation eighty lines up. **Stating which claim you are least sure of is how a reader with limited
budget knows where to aim it** — the same family as enumerating absences rather than asserting
partiality, and for the same reason: both convert a reader's attention from scanning to targeting. It also
produced a reasoning failure worth naming, from Lane 2: **an option priced as unacceptable is sometimes an
option scoped too widely** — it rejected a correct control because it had described that control more
broadly than anyone had proposed it.

### By-catch — plan defects found by the extraction, recorded so they are not rediscovered

- **Plan 11's CI YAML omits the interim-plumbing gate** its own Produces bullet promises (the failing grep for Plan 10's session shortcuts). An executor following the YAML literally ships without it.
- **`ops:sweep-orphans` exists only as runbook prose** — no task, no Files entry, no steps anywhere in Plan 11. Needs a task added before Plan 11 executes.
- **Plan 1 consequences §2 (verifier autocommit snapshot) and §4 (verifier DDL credential) are discharged by no Plan 11 step** — §2 says MUST be ruled before Plan 11 wires a schedule; as written Plan 11 wires none, but the restore-drill cadence and production role provisioning still meet §4. Rule both at Plan 11's pre-flight.
- **Plan 11's web Dockerfile ARG block** lists only the two API/WS args; the three Drive-picker args are prose-only — an executor trap its own walk created.
- **Plan 9 Task 1 cites `src/fixtures.test.ts`**; the file lives at `packages/rule-engine/test/fixtures.test.ts`. Mechanical adapt.
- **Plan 4 is internally inconsistent about the sync path** (T14 modifies `src/sync/visible-events.ts`; T11 creates `src/visibility/visible-events-for.ts`). The T11 path governs.
- **Stale claude-mem note, corrected:** the `attachment.added` discriminated-union amendment to Plan 3 was verified applied at Plan 7's walk; observation 19160 describing it as pending is superseded.

## Lane 4 (periphery) execution consequences (2026-08-28) — recorded at the scaffold, not at plan end

Lane 4's first artifact is the `packages/ui` + `packages/app-core` scaffold (pre-ruling 7), merged
early because Lane 3 is blocked on it. Its review turned up six items that are claims on later
plans. They are recorded **here, in the same change set as the code**, because Plans 1 and 2 each
proved that "route it at plan end" is an intention held by a session that is about to end.

### 1. Amendment 10's `pending` ingest result has no home, and this PR is where it became consumed code

Amendment 10 states that the replica "returns `{status:'pending', eventId}` where the online source
returns `committed`," and that `IngestResult` "is additive across the two." Shipped
`packages/domain/src/ingest-result.ts` is a **three**-variant union — `committed` / `invalid` /
`refused` — with no `pending`. The hoist that moved it into domain (pre-work PR #9) moved the
server's definition verbatim, which was correct for the server and silently dropped the additive
member the amendment had already decided on.

`DataSource.ingest(): Promise<IngestResult[]>` is now pinned in `packages/app-core/src/data-source.ts`
and byte-identical to Plan 6's text. So as things stand **Plan 10's replica cannot implement the
interface it is contracted to implement**, and every `switch (result.status)` written between now and
then will be missing a case the decision already promised.

Not fixed here, deliberately: adding an unproduced variant would oblige `apps/server`'s existing
consumers to handle a status nothing emits, which is noise until the replica exists. **Owner: whichever
lands first of Plan 6 Task 7 (the online DataSource, the first real `switch (result.status)`) and
Plan 10 Task 10 (the outbox, the first producer of `pending`).** It is one union member plus the
consumers' new case — small, and much smaller now than after four plans have written switches.

### 2. The colour-discipline scanner does not see bare named CSS colours

Amendment 11 says no colour literal outside `tokens.ts`, enforced by a test. The test enforces most of
it. `packages/ui/test/helpers/colour-scan.ts`'s `COLOUR_LITERAL` matches hex and colour *functions*
(`rgb(`, `hsl(`, `oklch(`, `color-mix(`, …) and **not** bare keywords, so `color: red` in a client CSS
file passes the gate. Proven both ways rather than assumed: a planted `color: red; background: tomato`
in `ui.css` passes 31/31, while a planted `#c0ffee` in the same file fails — so `.css` is genuinely
scanned and the keyword class is genuinely the blind spot.

Plan 6 Task 2's own pinned test forecloses the obvious fix: it asserts
`findColourLiterals('color: color-mix(in srgb, red, blue)')` equals **exactly** `['color-mix(']`, which
a widened regex would break. The resolution that satisfies both is **additive** — a second exported
check for bare named colours, scoped to `.css` declaration values only, wired into the same walk,
leaving `findColourLiterals` byte-identical to its pin, with its own planted-defect test. The
`.ts`/`.tsx` exclusion is deliberate: `red`, `tan`, `plum` and `gold` occur constantly in ordinary
identifiers and strings, and a false positive in the one test that gates every client package costs
more than the hole.

Carried rather than fixed at the scaffold because there is **no live violation** (every declaration in
`ui.css` takes its colour from `var(--gn-*)`) and the next client CSS arrives in Wave 3. The gap is
disclosed in `Features.md`'s own bullet rather than only in a review. **Owner: Plan 6 Task 2, at its
next opening.**

### 3. `CONTRAST_PAIRS` states its text guarantees and is silent about its non-text ones

`packages/ui/src/tokens.ts` declares seven contrast pairs × two themes, and all fourteen verify at
≥ 4.5:1 (tightest: light `successText` on `success` at 5.40). All fourteen were re-derived
independently at review from the raw primitives, not by re-running the suite.

Every declared pair is a **text** pair. WCAG 1.4.11 (non-text contrast, 3.0:1) is undeclared, and two
roles that draw control boundaries fall short of it: `borderStrong` on `surfaceRaised` is **2.49**
light / **2.08** dark, and `border` on `surfaceRaised` is **1.45** / **1.34**. `ui.css`'s `.gn-button`
uses `border: 1px solid var(--gn-border-strong)` over `background: var(--gn-surface-raised)`, so for
the ghost variant that border is the control's only visual boundary. (The focus ring is fine at
5.76 / 6.32; the chip category dots are ≥ 5.6 and carry a text label besides.)

Nothing renders yet, so this is free to fix. The fix that matters is not the hex values but
**declaring the non-text pairs in `CONTRAST_PAIRS`**, so the colour origin keeps stating its own
guarantees instead of leaving them in a review. Recorded here with the numbers so the next editor
does not have to re-derive them.

*Context for whoever picks it up:* the workspace convention pairing UI work with the `ui-ux-pro-max`
skill could not be honoured — the skill is not installed on this machine. Numeric WCAG verification
was substituted, which is why the text pairs are proven and the non-text ones were the thing a
design review would have caught.

### 4. Two Plan 6 defects were transcribed faithfully, and later lanes should not re-inherit them

Both were verified as the plan's, not the executor's, by hash-comparing the shipped files against the
plan's pinned blocks:

- **Plan 6 Task 3 pins a `components.test.tsx` that never exercises `Card`**, though Task 3's own Files
  and Interfaces blocks specify it. Six of seven components are covered. `Card` is a `div` with a
  className join and no behaviour, so the risk is not the component — it is the precedent.
- **Plan 6 Task 1 pins a type-tautological `it()` block in `tokens.test.ts`.** "Every role in both
  themes resolves to a declared primitive" cannot fail while the file compiles, because `themes` is
  typed `Record<ThemeName, Record<TokenRole, PrimitiveName>>`; the sibling assertion in the same block
  restates `colorOf`'s one-line body. The block as a whole is inert. That file's real teeth are its
  primitive-shape regex (which is also what makes the contrast math's `hex.slice()` parsing safe), the
  fourteen contrast assertions, the kebab-case variable-name cases, and the stylesheet
  selector/precedence assertions.

### 5. The app-core seed builders use non-ULID actor ids

`packages/app-core/test/helpers/seed.ts` uses `actorId: 'user_kiro'` / `'user_anselma'`, as Plan 6
pins them, while shipped `submittedEventSchema` requires `actorId: ulidString`. Harmless where they
live — the fake `DataSource` validates nothing — and latent everywhere else: **the first task that
pipes a seed through `parseEvent` or the real door gets `invalid-payload`.** A claim on Plan 6 Task 7
and on Plan 10, whichever first sends a seeded event somewhere that checks it.

### 6. `git diff --no-index` is unreliable here too — Plan 2's rider needs widening

Plan 2 consequences §7 records that an RTK-proxied shell `diff` reported "identical" for files that
differed, and prescribes `git diff` or reading the file instead. **`git diff --no-index` is also
affected.** At this review it printed no output for two files that differ by seven lines, while
`git hash-object` gave `3d95ab65…` and `e166f5bf…`.

So the prescription tightens: **verify a mutation restoration with `git hash-object` against the
pre-mutation blob hash, with `git diff` against the index, or by reading the file — never with any
`diff` invocation, `--no-index` included.** Every comparison in this review used `git hash-object` or
Python `difflib`. This matters to every lane, because a tool that lies about equality turns a mutation
sweep into theatre, and the whole falsifiability discipline rests on those restorations being real.

### 7. The env-contract gate ships with three known limits, all inherited from Plan 11 Task 6's own checker

The gate landed early (Plan 11 Task 6's env-contract slice only — the dev stack stays in Wave 4)
because it is what forces every later plan to document its variables, and it is worth more the
earlier it exists. Landing it exposed that **the plan's checker cannot fail on this codebase**:
it greps `process.env.NAME`, while `apps/server` hands the whole environment to `loadConfig` and
declares its contract as **zod schema keys** in `config.ts`. The plan's gate would have reported
`0 referenced in code` and passed vacuously forever — and its own planted-defect proof writes a
`process.env.X` file, the single shape the checker can see, so the plant passes while real
coverage is nil. **A planted-defect proof that plants the shape the checker already detects
proves nothing about coverage.**

The shipped gate reads three shapes (`process.env.X`, destructuring, and UPPER_SNAKE object keys
in files that mention `process.env`/`ProcessEnv`) and carries two guards that were themselves
proven to fire: it fails if it finds **no** variables at all, and it fails if the contract site is
missing or contributes nothing. Whoever extends it inherits three limits:

- **A commented-out variable still counts as documented.** The documented-side regex is `^#?\s*
  ([A-Z][A-Z0-9_]*)=`, so `# PORT=3000` satisfies the gate exactly as `PORT=3000` does. Verified
  by plant. Defensible for a `.example` file where optional variables are conventionally
  commented — but it means **"documented" and "enabled" are different predicates**, and the
  live-versus-documented-ahead distinction in that file is carried by section prose, not by
  comment status.
- **`apps/server/test/` and `scripts/` are outside the scanned roots**, and the walker skips any
  `*.test.*` file. Two test helpers read `TEST_DATABASE_ADMIN_URL` and are invisible to the gate
  (harmless — that name is both ignored and documented). A future test helper or ops script
  reading an undocumented variable would not be caught.
- **`IGNORE` is a permanent unaudited exemption list.** Kept verbatim from the plan. Worth
  revisiting when Plan 11's remainder lands, because an exemption nobody re-reads is how a real
  variable stops being checked.

The `.env.example` header states the honesty convention this file needs in order not to mislead:
each section names the plan that reads its variables, and a variable whose plan has not landed is
**documented ahead of its reader, not live** — setting it today changes nothing, because no
shipped code looks at it. Only the Core (Plan 1) group is live. Two forward references
transcribed from the plan (`deploy/do/README.md` and `pnpm check:db-tz`) were annotated at the
same time: both land with Plan 11 and neither is a command an operator can run today, which the
convention covered for variables and not for commands.

### 8. Plan 10 Task 1's pinned code does not compile, then crashes — and its test count is wrong

Recorded at execution of Plan 10 Task 1 (lane 4), verified against shipped code.

Step 3's pinned `events/contest-events.ts` does `import { domainRegistry } from '../registry.js'` and
self-registers both contest types as a module side-effect. Two independent failures in one
instruction. `registry.ts` exports `createEventTypeRegistry`, `EventTypeRegistry` and
`EventTypeRegistration` and **not** `domainRegistry` — that is created in `vocabulary.ts` — so the
import does not compile. And had it compiled, `register` throws `event type already registered`
(`registry.ts:31-33`) the moment `vocabulary.ts` registers the same two types, so the package would
crash at first import. The local pattern is the opposite of what the step describes: `events/*.ts`
state schemas and register nothing, and all registrations live centrally in `vocabulary.ts`.

**As landed:** schemas in `events/contest-events.ts` with no registration; both
`domainRegistry.register({... entityKind: 'ticket'})` calls in `vocabulary.ts` beside the other
fourteen; a plain `export * from './events/contest-events.js'` in `index.ts`. The step's
side-effect-import instruction was dropped. Note the `entityKind` too: the plan's registrations omit
it, and `parse-event.ts:79` short-circuits its type-kind check when a registration does, so an
omitted field would have silently admitted a `claim.contested` filed against a workflow or a
workspace — into a table that is append-only by trigger.

Step 4 states `Expected: PASS (10 tests)` for a body containing **11** `it` blocks (13 shipped, with
the entity-kind guard and the missing-payload guard added). **Resolve test counts by literal
per-file `it` count and correct the plan's number — never author a filler test to reach a stated
number, and never delete one to match it.** The same caution applies wherever a plan in this series
states a count beside a pinned body; the two are written at different times and only one of them is
executable.

### 9. `packages/domain/src/clock-skew.ts` DEVIATES from Plan 10 Task 1 Step 5, and Plan 6 Task 6 must check the repo file, not the plan text

**Load-bearing. Read this before executing Plan 6 Task 6.**

Plan 6 Task 6's precondition says to create `clock-skew.ts` from Plan 10 Task 1 Step 5 **verbatim**,
and Plan 10 Task 1's own file list tells whichever plan runs second to leave the other's copy
byte-identical rather than rewriting it — the whole point being that a formatter which differs
between two copies is exactly the second clock the amendment exists to prevent.

Plan 10 Task 1 has now landed `clock-skew.ts`, and it is **deliberately not** Step 5's text.
`formatIstInstant` as pinned guards the NORMALISED string — it calls `istDayOf` on
`new Date(ms).toISOString()` — so `isRealCalendarDatetime` never sees the overflow it exists to
catch. Three verified consequences, all contradicting the function's own docblock:
`'+275760-09-13T00:00:00.000Z'` and `'-000001-01-01T00:00:00.000Z'` **throw `RangeError`** where the
docblock promises verbatim; `'2026-02-30T00:00:00.000Z'` is silently rolled and prints
`'2 Mar 2026, 05:30 IST'`, a date nobody claimed; and a non-ISO but `Date.parse`-able string such as
`'Aug 20, 2026'` is read in the **device's** zone. Measured, printing what `formatIstInstant`
actually returned: UTC `20 Aug 2026, 05:30 IST`, `Asia/Kolkata` `20 Aug 2026, 00:00 IST`,
`America/Los_Angeles` `20 Aug 2026, 12:30 IST`, `Pacific/Kiritimati` `19 Aug 2026, 15:30 IST` —
four zones, four answers, and two different calendar days. That is precisely the device-zone
fallback the docblock says does not happen. The shipped file guards the INPUT instead, with the two predicates `envelope.ts` already
exports and `istDayOf` itself applies:

```ts
if (IST_DAY_REGEX.test(instant)) return instant;
if (!ISO_DATETIME_REGEX.test(instant) || !isRealCalendarDatetime(instant)) return instant;
```

None of this is reachable through the product today: `ISO_DATETIME_REGEX` **and** the
`isRealCalendarDatetime` refine on the same schema together stop all four inputs from ever becoming
a stored `clientTime`. (Corrected 2026-08-31 — this sentence previously credited the regex alone,
and the calendar-overflow case is the refine's, not the regex's. Both clauses are load-bearing:
dropping either one leaves an input the other admits.) It was fixed at Plan 10 Task 1
because that was the last moment one copy of the formatter existed.

**Therefore: any byte-identical check for `clock-skew.ts` must be run against
`packages/domain/src/clock-skew.ts` as it stands in the repo, NOT against the plan's Step 5 text.**
A lane that diffs the repo file against the plan will find a difference, and the plan is the side
that is wrong. If Plan 6 Task 6 finds the file already present — it will — it should add only what is
missing and change nothing that is there.

### 10. Plan 10 Task 2 — two live windows the contest evaluators opened, one interim fix that is FORBIDDEN, one plan-vs-repo trap, and a count

**Load-bearing. Read this before executing Plan 10 Task 4 (`proj_contested` + engine lookup),
Plan 10 Task 10 (outbox + local pre-check), or Plan 4 Task 5 (pre-engine permission gate).**

Recorded at execution of Plan 10 Task 2 (lane 4). Every line below is verified against shipped
code; window A was additionally reproduced over real HTTP by the reviewer.

**A. `claim.contested_resolved` reaches the ingest door and 500s the WHOLE BATCH until Plan 10
Task 4.** Plan 10 Task 1 registered both contest types (`vocabulary.ts:241,248`), so `parseEvent`
now admits them; `evaluate.ts:19-22` dispatches them; `contests.ts:55` **throws** when
`ctx.getContest` is `undefined`; and `createEngineContext` (`apps/server/src/engine-context.ts:38`)
does not implement it. The throw is raised inside `commitOne`'s `try` (`deps.evaluate`,
`ingest-service.ts:120`); the `catch` at `:133` does its ROLLBACK and duplicate-id check and then
**rethrows at `:150`**; `app.ts:46` answers `INTERNAL_ERROR_BODY`.

State the blast radius truthfully, because it is wider than "that event 500s". Reproduced over
real HTTP with a batch of `[workspace.created, claim.contested_resolved]`: the call returns 500
with the fixed body, the ledger afterwards holds `["workspace.created"]`, and **the caller
receives no `results` array at all** — a committed neighbour is silently unacknowledged.
`ingestBatch`'s own docblock (`ingest-service.ts:40-47`) documents exactly this as the
rejects-the-whole-call path, and the client's recovery is a batch retry that answers
`duplicate-event-id` for the committed neighbour. This is **materially wider than the Plan 1 §9
precedent it resembles**, where the degraded case was a per-event refusal that still rode inside
`results`.

The throw itself is correct and deliberate (Plan 10 Task 2 semantics 5): a context that cannot see
contests has made no claim about the world, and a wiring bug must not be dressed as a verdict.
**Closer: Plan 10 Task 4**, whose own file list pins it —
`2026-08-20-10-offline-sync-apps.md:100`: `src/engine-context.ts  # (modify) additive getContest
over proj_contested`.

**B. The attractive interim fix is FORBIDDEN: `getContest: async () => null` is not permitted**, in
the server context, in the replica context, or in any test double that stands in for either.
Measured by mutation at execution: delete the guard, degrade a missing lookup to `null`, and the
wiring bug resolves to `{ refused: true, rule: 'contest.unknown', reason: 'No contested claim … is
recorded.' }` — a refusal that reads entirely legitimate and blames the caller for the server's own
mis-wiring. The sharper consequence lands once Task 4's refusal-to-contest pipeline exists: a
`null` lookup would have the server **append a FABRICATED `claim.contested` to a trigger-protected
append-only table on the strength of a wiring bug** — a record nobody can delete and nobody can
correct, only contest again. A 500 that names the wiring is honest; a refusal that invents history
is not. Leave the throw.

**C. Origin provenance is unguarded at the ingest door until Plan 4 — and Task 2 NARROWS this
window rather than widening it.** `contest.server-only` (`contests.ts:12`) trusts `env.origin`, and
`origin` arrives from the client: `submittedEventSchema` (`packages/domain/src/envelope.ts:182`)
accepts it verbatim, and nothing in `apps/server/src` validates or overwrites it:
`event-store.ts:61,72` write it and `:95,119` only type the row and read it back; a repo-wide
`grep -rn "origin" apps/server/src` returns **six** hits, and the two that are not `event-store.ts`
are both prose — the word "original" at `projections/rebuild.ts:32`, and a comment at
`auth/auth.ts:71` that Plan 4 added after this section was first written. (Re-verified 2026-08-31
after the rebase. The count moved because another lane landed; a quoted command in this document is
a claim that decays when the tree does, and is worth re-running rather than trusting.) A client that sets `origin: 'server'` walks
past the rule today.

Record the direction honestly: **before this delta, `evaluateEvent`'s `default:` branch silently
ACCEPTED both contest types regardless of origin.** Task 2 turns "always accepted" into "accepted
only when the claim says server", which is strictly narrower. The rule is right as written — the
shared engine runs in a browser and cannot know provenance. **Closer: Plan 4 Task 5's
`checkRolePermission`** (`2026-08-20-04-auth-visibility.md:1968`), which refuses `permission.role`
on `env.origin === 'server'` *before* `evaluateEvent` runs. **Do not expose a reachable ingest door
to untrusted callers before Plan 4 lands it:** a forged contest lands in an append-only table
protected by trigger and cannot be corrected afterwards.

**D. Task 2's fixtures DEVIATE from the plan's pinned JSON, and the repo file is the correct
side.** The plan writes `originalEvent.payload` as `{ "toStateId": "done" }`; the shipped fixtures
write `{ "to": "done" }`. `toStateId` is the retired pre-Plan-2 shape — the shipped
`ticket.transitioned` payload is `{ to, comment?, … }`. Harmless on this path either way, which is
the danger: `submittedEventSchema.payload` is `z.unknown()` and nothing checks the nested claim
against the registry inside a fixture, so the retired shape ships green and a later byte-identical
check against plan text would "fix" it back. **Same trap §9 records for `clock-skew.ts`: any such
check runs against the repo file, and the plan is the side that is wrong.**

**E. Plan count.** Task 2 Step 4 states `Expected: PASS (8 tests)`; the pinned body contains
**7** `it` blocks, the shipped `test/contests.test.ts` has 7, and the gate prints `(7 tests)`.
Second instance inside this plan after §8's `(10 tests)` for an 11-block body. Resolve by literal
per-file `it` count; never author a filler test to reach a stated number, never delete one to match
it.

### 11. Nothing binds a contest's embedded claim to the envelope it arrives in — Plan 10 Task 4 owns the check

Found at Lane 4 P2's final whole-branch review, and **committed end to end over the shipped door**
rather than argued: a `claim.contested` filed on ticket `t2` in workspace B, `origin: 'server'`,
embedding a fabricated refused claim naming ticket `t1` in workspace A, returns **HTTP 200,
committed** — and the append-only trigger makes it permanent.

Every layer is individually correct and none of them asks the question.
`claimContestedPayloadSchema` validates the embedded event's internal shape; `parseEvent` reads the
OUTER envelope; `evaluateClaimContested` reads `origin` and nothing else. So the coherence between
"the ticket this contest is filed on" and "the ticket the refused claim touched" is asserted by
three separate comments and enforced by nobody.

`contests.ts`'s docblock previously implied the opposite — *"the only question left for a rule is
who is allowed to say it"* — and has been re-trued at the site to state the gap plainly.

**Owner: Plan 10 Task 4**, which builds contests server-side and is the only place that can compare
the embedded claim against the envelope before appending. Recorded here rather than fixed in P2
because enforcement is T4's constructor, not this partition's — and recorded at all because unlike
this branch's other two live windows (the `getContest` 500, the origin-provenance gap) this one had
no owner and appeared in no section.

## Wave 1 cross-lane watch (2026-08-28, controller) — where the decision-6 drift is loud, where it is silent, one obligation assigned by position, and one MUST that does not fire

Recorded by the cross-lane controller during Wave 1. Everything here is verified against shipped code or
read at the cited plan line. **This section was substantially wrong on first writing and was corrected
before merge** — the review that corrected it is described at the end, because the corrections are more
instructive than the claims.

### The decision-6 drift: T6 fails loudly, T12 and T13 do not

Decision 6's amendment tells later plans to adapt ~36 stale `toStateId` literals and calls Plan 6's "the
dangerous ones because they are client *logic*, not fixtures." Correct. The refinement that matters for a
lane planning its work is **which** of Plan 6's sites announce themselves and which do not.

The three production sites carry the wrong wire format (`toStateId` where shipped
`ticketTransitionedPayloadSchema` requires `to`):

- `packages/app-core/src/precheck.ts` (T6, `restrictToNeedsMembership`, plan line 2758) reads the field
  through an explicit cast — `(submitted.payload as { toStateId?: string } | null)?.toStateId` — and
  returns `true` when it is `undefined`, which against real payloads is always. **This cast is the one
  genuine compiler-defeat of the three.** Note the direction, because it is the safe one: `true` means
  "this restrict-to resolves against memberships only the server holds," and the caller at plan line 2707
  turns a local `refused` verdict into `not-evaluated` on it. The client stops deciding restrict-to
  locally and defers to the server — degraded precheck UX, not a bypassed guard.
- `submitTransition` (T12, plan lines 6426-6427) builds the payload as
  `Record<string, unknown> = { toStateId: … }` and assigns `comment` as a **bare string**.
- `reopenAndProceed` (T13, plan lines 7105-7113) submits `{ toStateId, cause }`; its `cause` shape
  already matches the amended contract exactly.

**T6 fails loudly, and this is the correction that matters most.** Plan 6's own text at line 2564 states
the pre-check "runs the REAL `@gisik-nokma/rule-engine` in the browser build." Shipped
`packages/rule-engine/src/transition.ts` does `ticketTransitionedPayloadSchema.safeParse(env.payload)`
and refuses with `malformed-payload` when it fails. So the `transitionTo()` helper at plan lines
2578-2583 produces a `malformed-payload` refusal while the tests at 2592 and 2604 assert
`require-comment` and a pass — **those tests fail.** The drift announces itself in the first task that
touches it. An earlier draft of this section claimed the opposite.

**T12 and T13 are where a wrong shape can be locked in by a passing test.** `TicketSheet.test.tsx` at
plan line 6309 asserts `batch[0].payload` equals `{ toStateId: 'done', comment: 'filed at the portal' }`,
and `reopen.test.ts` at 6971-6974 does the equivalent. Both assert what the **fake** `DataSource`
received, with no engine in the path and no schema consulted, so both pass unmodified. That is the real
instance of the mocked-contract failure mode here, and it is narrower than "the whole plan ships green."

**Two independent shape errors travel together** (sharpened by Lane 4, which verified all five sites
against shipped `workflow.ts` before adopting them). The field name is one; `comment` as a bare string
where the door requires `{ text }` is a second. A transcription correcting only `toStateId` is still
refused — with a *different* error, arriving later, where the first fix appears to have worked.

**The enumeration above is not the whole set, and the remainder creates two bad partial fixes.** Two more
`toStateId` builders exist: the precheck *candidate* at plan line 6417 (production, same task as T12) and
the T6 test helper at 2578-2583. As Plan 6 is written those make the 2758 cast **self-consistent** — the
payload it reads genuinely does carry `toStateId`, so the cast is not yet wrong. It becomes always-true
only once the builders are adapted. So there are two ways to half-fix this and be worse off than either
extreme:

- Adapt 6426/7105/6417 but leave the 2758 cast → the wire format is now correct and the cast silently
  reads `undefined` forever, which is the degraded-precheck state described above, with no test red.
- Adapt 2758 but leave 6417 → the precheck candidate still speaks the old spelling.

Fix all five sites (2758, 6417, 6426-6427, 7105-7113, and the 2578-2583 helper) in one change, or none.

**What the owning lane does:** at T12 and T13 specifically, write one assertion that parses the payload
the client actually builds against the exported `ticketTransitionedPayloadSchema`
(`packages/domain/src/workflow.ts`). T6 needs no such help; its own tests will go red.

**And a general fact that resets what "compiler net" means here:** `EventEnvelope.payload` is typed
`unknown` (`packages/domain/src/envelope.ts:61`), so **no client-built payload is typechecked anywhere in
the series** — every net is a runtime parse. The 2758 cast is not one net among several; it is the single
place a compiler check was actively suppressed. A lane that tries to restore type-safety at T12 by
removing the `Record<string, unknown>` annotation will get nothing for it.

**Plan 3's reducer is loud for a different reason, and the remedy is not the obvious one.** Plan 3 T3
reads `p.toStateId` (plan-3 lines 1123-1129) after parsing with a schema it imports from
`./events/ticket-events` (plan-3 lines 1038-1041). Shipped `packages/domain/src/events/ticket-events.ts`
deliberately does **not** define that schema and says so in its header: `ticket.transitioned`'s schema
lives in `../workflow.ts` because the engine parses it, and the vocabulary registers that one. So the
plan's import does not resolve and the failure is a build error — loud, and arriving before any test.
The fix is `import { ticketTransitionedPayloadSchema } from './workflow.js'` — a **relative** import,
because `packages/domain` cannot import from `@gisik-nokma/domain`, which is itself. Re-declaring a
plan-local schema is the one path that compiles and removes the net.

Two spellings remain correct and are not drift: the transition-**log entry**
(`TicketState.transitions[]`) keeps `toStateId`, and `ticket.workflow_rebound`'s own payload has a
`toStateId` field of its own.

### One obligation assigned by position, which no lane brief names

**`FoldedState` must carry the break version — Lane 1, Plan 3 T3.** Plan 2 consequences §1 assigns it to
"whichever plan next touches the fold." Plan 3 T3 is the fold, and it is a floor-list task. Lane 1's
brief lists five claims recorded against Plan 3 and this is not among them, so the list reads complete
when it is not. The stranding refusal names a state id against the ticket's origin version while
`foldStateIdForward` reports the id at the point the chain broke; for a three-version walk those differ,
and Plan 6 renders the sentence to a human verbatim.

*Discharged 2026-08-28 by Lane 1 as its ruling P2, taking the fix rather than deferring it:* the version
clause is dropped rather than the `FoldedState` surface changed — §1 sanctions both, and this one avoids
cross-plan churn with four lanes in flight while leaving the fuller sentence available later. Lane 1's
reasoning for not deferring is worth keeping: Plan 3 does not merely inherit the inaccuracy, it **arms**
it, because refresh-on-publish is exactly what makes ticket-version and break-version diverge routinely.

### The verifier's autocommit MUST does NOT fire in Wave 1 — checked, not ruled

Plan 1 consequences §2 says `verifyProjections` reads outside any transaction and "MUST be ruled before
Plan 11 wires the schedule." An earlier draft of this section routed that MUST to Lane 4 on the grounds
that it owns `schedule.ts`. **That was wrong.** Plan 11 Task 11's `apps/server/src/ops/schedule.ts` is
the *backup daemon's* schedule — nightly `pg_dump`, weekly ledger export — and wires no verifier. The
by-catch already said as much ("as written Plan 11 wires none"); §2's MUST is conditioned on a schedule
that does not exist. Recorded here as **checked and not applicable** so the next lane inherits a
discharged item rather than an open one, and so the condition is stated for whoever does wire one.

**§4 does land with Lane 4, and stands.** The verifier does `DROP SCHEMA` / `CREATE SCHEMA` /
`CREATE TABLE (LIKE …)`, so a production role without DDL cannot run it. Lane 4 owns `deploy/do/app.yaml`
and the provisioning notes: the verifier gets its own credential there, or an explicit recorded decision
that it runs elsewhere.

### The "mis-slots `proj_tickets`" phrase is this document's own error, now fixed at source

Pre-ruling 6 above stated that the pin on `main` "omits `proj_projects` and mis-slots `proj_tickets`."
Nothing was mis-slotted: `apps/server/src/projections/index.ts` registered exactly two projections and
`apps/server/test/projection-order.test.ts` pinned exactly those two, so there was no third to mis-slot.
What omitted `proj_projects` was the **doc comment** above that assertion, reciting the pre-2026-08-26
order. Pre-ruling 6 has been corrected in place rather than only annotated here, because a lane reading
the ruling would not have found the correction. Lane 2's brief inherited the phrase from this document
and should be read with that in mind. The ruling itself is unchanged: §8 is the single source, and the
second lane to merge writes the full order into both the array and the comment.

### `packages/domain/src/envelope.ts` is Wave 1's real collision surface, and no pre-ruling covers it

Found by Lane 2's pre-flight, verified by execution rather than by reading, and recorded here because
the seven pre-rulings pinned ownership of every collision anyone anticipated and this is not among them.
Every lane imports this file.

**Owner ruling (2026-08-28): the membership entity-id exception is RATIFIED.** Lane 2's kind-aware
check is the decision, not a conservative default awaiting review — `membership` admits the composite
`${workspaceId}:${userId}`, every other kind keeps `ulidString` byte-for-byte, and the `EventEnvelope`
type is untouched. Recorded here so no later lane re-opens it as an open question.

Two things the ruling does **not** cover, stated so they are not read into it. `'invite'` joining
`ENTITY_KINDS` was never put to the owner and did not need to be — a member added to a closed set is
inert until an event type declares it. And the ruling settles the *exception*, not the test design that
proves it: the three-direction assertion below is Lane 2's own and is what keeps "every other kind
unchanged" a proof rather than a claim.

**Two independent amendments are owed to it, both by Plan 4.**

1. **Decision §5's composite membership id cannot be submitted.** §5 pins `membershipId(workspaceId,
   userId)` = `` `${workspaceId}:${userId}` ``. Shipped `envelope.ts:75` is
   `entity: z.object({ kind: z.enum(ENTITY_KINDS), id: ulidString })` — *every* entity id must be a bare
   ULID — so a membership event is refused `malformed-envelope` at `parse-event.ts` before any Plan 4
   code runs. §5 and the envelope schema cannot both stand as written. Lane 2's kind-aware check —
   its conservative default at the time, **ratified by the owner 2026-08-28** (above) — is: `membership` admits `^<ULID>:<ULID>$`, every other kind keeps `ulidString`
   byte-for-byte, and the `EventEnvelope` *type* is untouched. Four alternatives (composite as lookup
   key only, filing under `kind:'workspace'`, a hashed pseudo-ULID, relaxing `ulidString` generally)
   were each refuted on stream identity: `seq`, `lockEntity`, snapshots, `readEntityEvents` and
   canonical replay all key on `(entity_kind, entity_id)`, so grant → revoke → re-grant must share one
   id and a replica must mint it without a read-before-write.
2. **`ENTITY_KINDS` is a closed six-member set and Plan 4 T14 registers three event types with
   `entityKind: 'invite'`.** That member has to join it, and the Global Constraints' entity-kind line
   moves with it. T14's own Files list does not mention `envelope.ts`.

**Who else touches this file, so the sequencing is known rather than discovered at merge:** Plan 3 refers
to it once, Plan 9 twice, and Plan 10 references `ENTITY_KINDS`. None of those is in Wave 1's Plan 4
window except Plan 3 (Lane 1). **Sequencing rule for this wave: Plan 4 lands both envelope amendments as
early, separate, additive changes, and any other lane needing `envelope.ts` rebases onto them rather than
editing in parallel.** Merge-resolving a schema that governs every event's identity is the one place in
this series where a textual merge is more expensive than waiting.

Amendment 1 was raised as a ruling-request and is now **ratified** by the owner (see the ruling at the
top of this section); amendment 2 needed no ruling, being inert until an event type declares the kind.
Neither ever blocked.

**A third amendment, found while the file was open, and landed with the other two.**
`submittedEventSchema` declared `payload: z.unknown()`, and `z.unknown()` does not require the key.
Probed against this repo's own zod rather than reasoned about:

| payload | before | after |
|---|---|---|
| absent | ACCEPTED — the claim erased entirely | REFUSED |
| present-but-undefined | ACCEPTED | REFUSED |
| `null` | ACCEPTED | ACCEPTED |
| `{}` | ACCEPTED | ACCEPTED |

**Only absence was the defect**, and the two acceptances are pinned by tests as deliberate: an empty
claim is still a claim and a null payload is still a claim, so a "fix" that also refused them would look
correct and quietly refuse legitimate events. The check is `!== undefined`, not `'payload' in v`, because
both absent and present-but-undefined must go and `JSON.stringify` erases the difference between them on
the wire anyway. `eventEnvelopeSchema` inherited the hole through `.extend()` and inherits the fix the
same way. There was no live exploit path — `parse-event.ts` reconstructs the event explicitly rather than
passing the inferred object through — so this is recorded for the next person to add a field to that
schema, not as an incident. Not fixed here and not Plan 4's: `z.infer` on the fixed schema yields
`payload?: unknown`, which is not assignable to `SubmittedEvent`, so a downstream consumer's natural
unblock is a cast that erases the guarantee; that half belongs to the app-core factory's lane.

**LANDED 2026-08-28 by Lane 2 (Plan 4 Task 3), all three in one commit.** What shipped, so no lane has to
read the diff to know:

- `ids.ts` gains `MEMBERSHIP_ID_REGEX`, **composed from `ULID_REGEX.source`** rather than hand-spelled —
  a second spelling of what a ULID is would be free to drift from the first, which is the discipline
  `ulidString` already states about itself. (The adaptation map's sketch hand-spelled it; the composition
  is the version that shipped.)
- `envelope.ts`: the entity schema is a `superRefine` that branches on `kind`. `membership` takes
  `MEMBERSHIP_ID_REGEX`; every other kind takes `ULID_REGEX` with the message `'must be a ULID'`
  byte-for-byte. `EventEnvelope` the TYPE is untouched.
- **The coherence check is in TWO halves, and half of it is not in `envelope.ts`.** The regex alone admits
  `entity.id = wsB:userC` on an event whose `workspaceId` is `wsA` granting `userD`, and that is not a
  harmless mis-address: `ingest-service.ts`'s entity↔workspace guard only fires once a head row exists, so
  the first mis-filed event commits cleanly and a later, correctly-addressed revoke opens a SECOND stream
  at seq 1 — the split membership stream decision 5 exists to prevent, re-created by its own fix. The
  **workspace** half is a cross-field `superRefine` in `envelope.ts`; the **user** half needs the parsed
  payload and lives in `parse-event.ts`, after payload validation, returning `malformed-envelope` (the
  code union is unchanged — nothing downstream has to widen `IngestErrorCode`). Reading `userId` off raw
  JSON instead would report an id mismatch when the real complaint is that `userId` is not a ULID.
- Because both exported schemas now carry a cross-field refinement, they are built from a shared private
  `z.object` and each `.superRefine`d — a ZodEffects has no `.extend`. `eventEnvelopeSchema` is still
  derived from the same shape; only the route changed. Both remain `safeParse`-only consumers' concern.
- `'invite'` is appended to `ENTITY_KINDS` (seventh member, at the end). Inert: every registration names
  its `entityKind` and `parseEvent` refuses a type filed against a kind it did not declare, so no event
  can carry it until Plan 4 T14 registers the three invite types. The Global Constraints entity-kind line
  in `2026-08-20-04-auth-visibility.md` moved with it.
- **A consequence every lane will meet:** a user id is now a ULID at the door. A membership is addressed
  as `${workspaceId}:${userId}` and the door admits only `^<ULID>:<ULID>$`, so `membership.granted`,
  `membership.revoked`, `project.member_added`, `project.member_removed` and `visibility.set`'s explicit
  `userIds` all type their user ids as `ulidString`. This is the dialect trap below, arriving in payloads
  as predicted — `usr_1` and `usr_founder` are refused `invalid-payload`. better-auth must therefore mint
  ULID user ids; that is now a constraint on Task 1, not a preference.
- **The test design, which the ruling explicitly did not settle:** three directions for the regex
  (`membership` composite accepted; `membership` bare ULID refused; a non-`membership` kind still refusing
  a composite with `'must be a ULID'` byte-for-byte), and the two coherence halves are asserted through
  DIFFERENT doors on purpose — the workspace half against `submittedEventSchema` directly, the user half
  through `parseEvent` with a prefix-CORRECT, user-wrong id. Full equality subsumes the prefix, so
  asserting both through `parseEvent` would let either check be deleted with nothing noticing.

**The dialect trap that rides with this file, found twice in one day in two different fields.** Shipped
`envelope.ts:53` defines `ulidString` as `z.string().regex(ULID_REGEX, 'must be a ULID')`, and `ids.ts:9`
pins `ULID_REGEX = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/`. So `t1` and `ws_1` are not ULIDs.

- **Entity ids** (Lane 1): the rule-engine fixtures use exactly that short dialect and are fine, because
  the harness enters at `evaluateEvent` and never passes the envelope door. A **server** test that
  ingests with a short id is refused at the door **for a reason unrelated to what it is proving**, and
  the refusal reads as the thing under test failing. Live for Plan 3's T9–T13.
- **Actor ids** (Lane 4): `packages/app-core`'s seed builders use `actorId: 'user_kiro'` against the same
  schema's `actorId: ulidString`, harmless against `createFakeDataSource` because it validates nothing,
  and `invalid-payload` at the first real door.

One fixture dialect, one door dialect, and the gap is invisible until something crosses. Two fields found
it in one day, so expect a third: **state it as a class, not as two instances.** The detection is
mechanical and does not require reading the tests — for any test that crosses `parseEvent`/ingest, every
field the schema types as `ulidString` must match `ids.ts:9`'s regex: entity id, actor id, and payload
ids alike. A grep for short quoted ids in server-test files finds it.

Note the interaction with the amendment above: a kind-aware entity-id check makes the door's behaviour
**non-uniform across kinds for the first time**, so whether a given id passes will depend on the `kind`
it declares as well as its shape. Whatever proves that check should assert all three directions — a
`membership` composite accepted, a non-`membership` kind still refusing a composite byte-for-byte, and
the unchanged kinds unchanged — because the third is the only thing keeping "every other kind is
byte-identical" honest.

**A related correction to pre-ruling 2, from the same scan.** The ruling says Plan 8 T3's guard "must NOT
create" `simple-kanban.ts` and must wait if it is absent. Checked rather than assumed: grepping Plans 8
and 11 for `simple-kanban` / `SIMPLE_KANBAN` / `simpleKanban` returns **nothing** — neither plan names a
path, both consume it from the `@gisik-nokma/domain` barrel. So the file *path* is not a cross-plan
contract and no Plan 8 guard can be waiting on one. What actually binds is the two export names,
`SIMPLE_KANBAN_TEMPLATE` and `simpleKanbanWorkflowDef(workflowId)`. The ruling's intent stands — Plan 4
owns it — but a lane keying a guard on the path is guarding the wrong thing.

### `@better-auth/cli` is BANNED in this repo, and Plan 4's Step 10 told the executor to use it

Found by Lane 2's T1 and verified independently at the installed tree, because it is a
production-failure claim.

`@better-auth/cli`'s latest release is **1.4.21**, and it pins `"better-auth": "1.4.21"` as an exact
hard dependency — so it reports the **1.4 schema regardless of which version the server imports.** This
repo imports 1.7.2. Run against this repo's real config it emitted an `account` table with **no
`issuer` column and no `account_issuer_accountId_uidx` index**, both of which 1.7.2 writes on every
account link. That migration applies cleanly and then **fails on the first Google sign-in.**

What makes it worth a section rather than a bullet: **Plan 4 Step 10 instructed the executor to
reconcile the handwritten migration against exactly that tool.** Following the plan text literally ships
the broken schema, and the reconciliation step that exists to catch schema drift is the thing that
introduces it. A check that does not merely miss the defect but manufactures it.

**Plan 4 names the banned CLI three times, and a ban naming only the last one is unenforceable.**
Line 116 (Step 1) **installs** it — `pnpm add -D @better-auth/cli` — so a lane executing partition A
step-by-step adds the banned package to the lockfile long before it reaches any warning. Line 299's doc
comment on the exported `auth` instance re-motivates it ("Concrete instance for `npx @better-auth/cli
generate` and local dev") at the very site the replacement reads. Line 403 (Step 10) runs it. **All three
are void: the dependency is not to be added.**

**The replacement, already shipped by Lane 2:** `pnpm --filter @gisik-nokma/server run auth:schema`,
which reads the *installed* library's own `getMigrations`, plus a test asserting the live database leaves
that planner nothing to create — so the next better-auth upgrade turns the suite red rather than
production. **Ownership splits in two, and the first draft of this section put both halves in the wrong place.**
Grepped across all eleven plans, `@better-auth/cli` appears in **Plan 4 only** — Plan 11 names it zero
times, so Plan 11 cannot own the risk of it being *added*.

- **Risk of addition — Plan 4's, i.e. Lane 2's**, enforced at its own Step 1 (line 116). That is where
  the dependency enters.
- **Risk of shipping — Plan 11's, i.e. Lane 4's**, and it is real even though the plan never names the
  tool: Plan 11's Dockerfile runs `pnpm install --frozen-lockfile` (lines 915 and 943), so a lockfile
  entry created by Plan 4 becomes a **shipped artifact** through packaging. The right check there is
  therefore not "grep my plan text for the tool" — it is not there to find — but **assert the lockfile
  does not carry it before building the image, and keep that assertion inside the build so it cannot
  regress.** (Lane 4's formulation, and a better check than the one the original framing would have
  produced.)

  **Write that assertion against the lockfile FILE, never against install output.** Lane 2 observed that
  the peer warning it was tracking **was not printed** under `--frozen-lockfile` (its sources say "the
  peer warning", about the specific `better-call`/zod one — the general claim that pnpm prints *no* peer
  warnings under frozen installs is **not** independently verified here and should not be relied on
  beyond the observed case). Either way the conclusion holds and does not depend on the general form: a
  check that greps the install's *output* inside a Docker build can read clean **for a reason unrelated
  to what it asserts**, and would then read clean forever. Same shape as everything else in this section: the easy check confirms the command
  ran, not that it looked where the answer is.

**State of the ban as of 2026-08-28, and the history is the load-bearing half.** Current state:
`@better-auth/cli` is in **no** lockfile and **no** `package.json`. But it was **not** "never installed"
— an earlier draft of this section said so, and that erased the fact that justifies the check.

What actually happened, from Lane 2's T1 report: the CLI **was** installed and run (`generate --config`
executed successfully), its output was found wrong for the installed library, and it was removed. **And
`pnpm remove` did not clean the lockfile.** The CLI's optional peers stayed baked in as resolution keys —
`better-auth@1.7.2(@prisma/client@5.22.0)(better-sqlite3@12.11.1)(pg…)` — so a `--frozen-lockfile` CI
install would still have fetched prisma and compiled a native `better-sqlite3`, dragging ~150 packages
into every image, to support a tool nobody was using. The lockfile had to be **reset to `HEAD` and
re-resolved from `package.json`** before it was actually clean.

**Key the gate on the banned package itself, never on the residue fingerprint.** The residue names
above (`@prisma/client`, `better-sqlite3`) are what the leftovers looked like *for Lane 2*. A gate
written against that fingerprint would be correct today, stay green through Plan 10's T1/T2/T3a — and
then **fail on Plan 10 Task 8, which legitimately adds `better-sqlite3` as the sync-client's storage
adapter** (plan-10 line 2856 creates `storage/better-sqlite3.ts`, line 2897 declares
`"better-sqlite3": "^11.10.0"`). At that point it looks like a false positive from a gate nobody
remembers the reason for, and the reasonable response is to weaken or delete it. So the assertion targets
`better-auth` and `@better-auth/cli` by name and nothing transitive.

Worth naming as its own direction of the day's shape: the other three instances were checks that **pass
when they should fail**; this one is a check that **fails when it should pass**. Both end the same way —
deleted by someone reasonable — which is why "would this ever fire for a reason unrelated to its name?"
has to be asked in both directions. (Found by Lane 4 while adopting the corrected justification; it
generalises past lockfiles to anything where a cleanup is partial — migrations, generated files, a
projection reset.)

**That is the whole argument for Lane 4's check, and "we removed it" is not evidence the lockfile is
clean.** A lane that later adds a banned package, runs `pnpm remove`, and trusts the removal will ship
the residue. The assertion against the lockfile file is what catches it; nothing else in the pipeline
would.

Line 403 is killed by `auth:schema`. **Two distinct artifacts carried the comment problem and an earlier
draft merged them into one sentence**: plan-4 line 299 is *plan text* reading "Concrete instance for
`npx @better-auth/cli generate` and local dev", while the *shipped* `apps/server/src/auth/auth-dev.ts:7`
carried a different variant naming `pnpm exec better-auth generate` — a command that never existed, since
the `generate` bin ships in the CLI package under the name `better-auth`, not in the library. Lane 2 has
since fixed the shipped file; it now names `auth:schema`. The plan line stands as plan text and is void
along with the other two.

**DO NOT TIDY: `auth-schema.ts:11` and `auth-tables.test.ts:64` stay.** They reference
`@better-auth/cli` in order to explain *why it is banned*, which means they look exactly like the stale
references this section exists to remove. A reviewer sweeping for mentions of a banned tool — especially
during Plan 11's packaging work, which touches these files — would helpfully delete the only surviving
explanation of the ban, leaving a prohibition with no reachable reasoning behind it. The hazard is
general: **a comment warning about X necessarily contains X, so any grep-and-remove pass over X destroys
its own documentation first.** Lane 4 has recorded it as a do-not-tidy on its side.

### The actionable form of all of it, from Lane 4's three instances

Lane 4 hit this shape three times in its own scope in one day — Plan 11's `check:env` grepping
`process.env.X` against a codebase that declares config as zod schema keys; Plan 10 T8's conformance
assertion whose array contains the value under test as its own first element, so no interleaving can fail
it; and the lockfile assertion it was about to write against install output. **The tell is identical every
time: the check passes for a reason unrelated to the property it names, and the wrong version is the one
that is easier to write.**

So the rule it now puts on every gate it lands, which is the operational form of this whole section:

> **State what would make it fail, then make it fail once, before trusting it.**

Its env gate carries two guards built exactly that way, both proven to fire rather than assumed to. This
is the same discipline as the mutation-proof requirement on fixtures, applied to gates and assertions
rather than to tests — and it is cheap precisely because it is done once, at authoring time, by the
person who still remembers what the check was for.

The falsifiability shape is worth keeping as a worked example of plant-in-production-shape: planting
*exactly the CLI's output* makes the drift check fail naming `account.issuer`, while a "five tables
exist" check and a "columns are camelCase" check both still pass. Those two are the obvious tests to
write and neither catches it.

**Two adjacent facts verified at the same tree, so no lane re-derives them.** `better-auth@1.7.2`
declares **no zod peer dependency** — zod `^4.3.6` is its own direct dep, nested, and the monorepo's
3.25.76 is untouched. ~~The `better-call ✕ unmet peer zod@^4.0.0` warning is cosmetic.~~ **Struck
2026-08-28: that warning is ACCURATE**, and Plan 4's execution consequences below prove it from the
lockfile — there is exactly one `better-call` snapshot, `better-call@1.4.0(zod@3.25.76)`, so it resolved
its optional zod peer *outside* its declared `^4.0.0`, which is precisely what pnpm reported. The claim
here was inherited from a lane summary and was never checked against the lockfile; the corrected entry
below is the authority. And **passkey has
left better-auth core**: 1.7.2 exposes 54 export subpaths, none containing `passkey`, and carries no
`@simplewebauthn/*` dependency. It ships as `@better-auth/passkey@1.7.2`, a separate package.
`PasskeyOptions` still takes `rpID`/`rpName`, so only the specifier moves — any plan text naming
`better-auth/plugins/passkey` is wrong.

### The complete better-auth specifier triage, run across all eleven plans — and why "the subpath exists" is not the test

Lane 3 proposed the right triage and it is cheap: **a plan that consumes a *type* is insulated from its
provider's packaging; a plan that names a *subpath* is not**, so grepping for `from 'better-auth/...'` is a
complete test needing no judgment. Run across all eleven plans, exactly two carry such imports:

| Plan | Line | Import | Verdict (checked against the installed 1.7.2 tree) |
|---|---|---|---|
| 4 | 234 | `{ bearer, magicLink, phoneNumber } from 'better-auth/plugins'` | subpath present — **fine** |
| 4 | 235 | `{ passkey } from 'better-auth/plugins/passkey'` | subpath **absent** — move to `@better-auth/passkey` |
| 4 | 685 | `{ fromNodeHeaders } from 'better-auth/node'` | subpath present — **fine** |
| 6 | 7885 | `{ createAuthClient } from 'better-auth/react'` | subpath present — **fine** |
| 6 | 7886 | `{ magicLinkClient, phoneNumberClient } from 'better-auth/client/plugins'` | subpath present — **fine** |
| 6 | 7887 | `{ passkeyClient } from 'better-auth/client/plugins'` | **subpath present, export ABSENT** — see below |

Plan 7 is a clean negative and the reason is the rule working: its two `better-auth` mentions are prose,
it consumes `Auth` as a type from Plan 4, and it stubs sessions as `Bearer <userId>` by its own sanction.
It survives better-auth being repackaged entirely.

**The refinement the triage needs, found by running it.** Plan 6 line 7887 is the dangerous row, and a
subpath grep marks it clean: `better-auth/client/plugins` **does** exist in 1.7.2. What no longer exists
is the *named export*. `passkeyClient` appears nowhere in better-auth core's `dist`; it ships in
`@better-auth/passkey/dist/client.mjs`, reachable at that package's `./client` subpath (its only two
subpaths are `.` and `./client`).

**The fix, confirmed independently by Lane 4 against the same tree:**
`import { passkeyClient } from '@better-auth/passkey/client'`, with `@better-auth/passkey` declared as a
dependency. Recorded against 6b T14 so Wave 3 does not re-derive it. Lane 4 also verified the negative
half — `passkeyClient` has zero hits across every file in core's `dist`, while `magicLinkClient` and
`phoneNumberClient` are both present in `dist/client`, so lines 7885-7886 are genuinely fine.

So a specifier move splits into two failure shapes with different detection costs. **A missing subpath
fails at resolution — loud, immediate, and the same way for everyone. A present subpath missing a named
export fails at the import site**, which means — Lane 4's sharpening, and it is the load-bearing part —
**how loudly it fails depends on the consumer's build config, not on the defect.** A strict `tsconfig`
catches it at typecheck; a bundler with loose interop hands back `undefined` and defers the failure to
first call. The same defect therefore has a different blast radius in every package that imports it,
which is precisely why this belongs in one repo-wide sweep rather than in each lane's local judgment.
**The complete test is three checks, not one** — Lane 3 found the third by running the rule *forward*
over its eleven undispatched tasks rather than backward over what shipped:

1. **The subpath resolves.** Missing → fails at resolution, loudly, identically for everyone.
2. **The named export exists in it.** Missing → fails at the import site, at whatever volume the
   consumer's build config decides.
3. **The binding form matches.** `@vitejs/plugin-react` exports **only** `default`, so a named import of
   it fails exactly like an absent export — and a grep for the name marks it clean *twice over*, since
   both the subpath and the identifier are present. Plan 7 happens to get it right at line 6955
   (`import react from '@vitejs/plugin-react'`), so this is a clean negative rather than a catch.
   `@tiptap/suggestion` is the control case worth knowing: it publishes both a named `Suggestion` and a
   default, so either style works and nothing distinguishes a lucky guess from a checked one.

Lane 3's forward sweep over Plan 7's remaining tasks is clean on all three: eleven specifiers, all
resolving, every named export present, every binding form correct.

### The controller's own failure class, named by the lanes that kept catching it

Recorded because it is a property of this role rather than of one session, and the next controller
inherits it. Across a full day of cross-lane work, the corrections that reached the controller were
**overwhelmingly ownership and location claims** — which plan owns a thing, which line does it,
which task it sits in. The specifier table, the payload shapes, the append-only trigger names, the exact
fix for Plan 6 line 7887: all correct. What kept slipping was `schedule.ts` mistaken for the verifier's,
`CONTEST_EVENT_TYPES` filed under the wrong task, the CLI ban addressed to the wrong plan, a rule's
example attached to a vocabulary that does not reach the ledger.

**An earlier draft of this paragraph said "every … never a technical one", and the same commit series
falsified it.** The "never installed" claim corrected above is neither ownership nor location — it is a
claim about **repo state and history**, and it carried this section's strongest confidence marker while
being contradicted by a primary source in the very lane it credited. Worse, the rule drawn from it did
not cover it: **a grep proves current absence, and current absence is exactly compatible with
installed-then-removed.** The evidence for "never installed" is git history, not a grep — so the guard as
first written would have passed the claim it needed to catch. A section warning against overreach that
closes on an overreach is the day's own lesson arriving one more time.

Lane 4's diagnosis is the useful part: **that is the class where plan text and repo diverge fastest under
parallel execution, and it is also the cheapest class to check** — one grep answers it — which is
presumably why it keeps getting asserted instead. A controller synthesising across eleven plans it has
not read end-to-end is structurally most confident exactly where it is least entitled to be.

**So the rule the controller runs under, stricter than the one it gives the lanes, and widened by the
failure that escaped its first form:** any claim about repo **state or history** — who owns a thing,
where it lives, *and whether something ever happened* — ships with the artifact that proves it, or it
ships as a question. With the discriminator that first form missed: **absence now does not establish
never-present.** A grep answers "is it here"; only history answers "was it ever". The technical claims
were already surviving review; this class is the one that was not.

### The one shape under all of it

Stated once, because today produced three independent instances and they are the same defect:

> **The check that is easy to write asks whether something is present. The check that is correct asks
> whether it is present *in the form you are about to use it*.**

`toContain` versus set-equality. Subpath versus export. Export versus binding form. Each easy version
returns green over the failing case, and each correct version costs the same to write once someone has
noticed the difference. The corollary that makes it actionable: **an inclusion check is never a
sufficient test of a closed set** — and when the set is one the ledger persists, the asymmetry becomes
unrecoverable rather than merely weak. Lane 4's statement of it is the one to keep: a *missing* member of
a closed vocabulary fails at the door, while an *extra* member commits and is permanent, because the
ledger is append-only by trigger. That is not a test that could be stronger; it is an unrecoverable
write. Set-equality is therefore **mandatory, not preferable**, for any vocabulary reaching the ledger.

**The two vocabularies named when this rule was first written are already compliant, and the check that
established that is the point.** `CONTEST_EVENT_TYPES` (Plan 10 **Task 1**, not T2 — the wave schedule
above has it right) is pinned at plan-10 line 196 with
`expect(CONTEST_EVENT_TYPES).toEqual(['claim.contested', 'claim.contested_resolved'])`, and
`NOTIFICATION_KINDS` at plan-9 line 625 with `toEqual` over its five kinds. Neither needs fixing; the
mandate is that they **stay** that way, and that any vocabulary added later starts there.

One distinction the first draft of this paragraph collapsed: **`NOTIFICATION_KINDS` does not reach the
ledger.** Plan 9 Task 4 puts notifications in an ordinary mutable table, so the unrecoverability argument
does not apply to it — it gets the softer landing, like Lane 3's `underline` mark, where a wrong value is
at least migratable. The append-only trigger is real (`events_append_only` /
`events_no_update_no_delete` / `events_no_truncate`) and it is what makes the argument bite for
`CONTEST_EVENT_TYPES`, which does reach the ledger. A rule stated with an example that does not support
it teaches the wrong boundary.

**Why this one was found centrally, recorded because it argues for how the remaining sweeps run.** Three
lanes each held one piece — Lane 3 had the type-versus-subpath insight, Lane 2 had the installed tree,
Lane 4 had the Plan 6 lines — and no lane held all three. Every per-lane check would have marked line
7887 clean, because a subpath grep passes it. **Cross-plan sweeps against installed reality are the
controller's to run once, not the lanes' to run four times**, and the argument is not effort but
completeness: a lane can only check what it can see.

Nothing here is Wave 1 work — Plan 6's client transport is 6b, deferred to Wave 3 — but it is recorded
now because the tree that proves it is installed today in Lane 2's worktree, and by Wave 3 the cheap
check will require re-deriving what someone already ran.

### Two blind spots in how tests are written, both found on first contact

Both from Lane 3's Plan 7 T1, both the same family as the fixture and checker findings above.

**1. `toContain` is silent about "and nothing else", and a bundled preset is where the extra arrives.**
StarterKit v3.30.5 bundles an `underline` mark that Plan 7's schema v1 does not name. Nothing in the plan
disables it, and the plan's own vocabulary test uses `toContain` — which cannot notice a *sixth* mark.
All three clients would have stored a mark no spec text names, and the test written to cover exactly that
risk would have stayed green. Fixed with `underline: false` and set-equality pinning in both directions.
**Generalises past tiptap: any assertion of the form "the vocabulary includes X" says nothing about what
else is in it, and any preset dependency — a component library, a lint config, a zod `.extend` — is
precisely where the unnamed extra comes from.**

**2. A `typecheck` config that excludes `test/` cannot see a broken test helper.** Plan 7 shipped only a
build config, which includes `src` but not `test`. Lane 3 carried an adaptation adding
`tsconfig.typecheck.json`, and it paid immediately: the plan's own `typeText` helper **does not compile**
— prosemirror-view's `handleTextInput` takes five arguments and the plan passes four. That error lives in
`test/`, so a single-tsconfig `typecheck` would never have read it, and the helper would have shipped
into eleven downstream tasks silently failing to drive input rules. **Any client-package plan pointing
`typecheck` at a config that excludes `test/` has the same blind spot**, and it presents as a runtime
mystery in whatever task first depends on a test helper's behaviour rather than as a type error. Worth a
check in Plans 6 and 9 before their client tasks dispatch.

### Merge rule for this document: resolve by heading nesting, never by arrival order

Found by Lane 4 resolving its own collision with this section, and worth pinning because it will recur
every time two lanes append here — which under parallel waves is constantly.

Two lanes appending at end-of-file produce a conflict git describes as "both sides added at EOF". Taking
both sides in arrival order is textually correct and **structurally wrong**: Lane 4's addition was a
`### 7.` written under its own `## Lane 4 (periphery) execution consequences` heading, and arrival order
would have parked it after the `## Wave 1 cross-lane watch` heading that follows — silently reparenting a
Plan 11 env-gate limit as a cross-lane watch item. **Markdown raises no error when a `###` lands under
the wrong `##`,** and nothing downstream ever complains; the only symptom is a reader finding a claim
filed under a heading that misdescribes it.

**The rule: when this file conflicts at EOF, place each `###` back inside the `##` it was written under,
then order the `##` sections by merge order.** A `###` in an EOF conflict almost always belongs to the
`##` above it on its own side, not to whatever heading happens to precede it after the merge. Cheap to
get wrong, invisible afterwards, and it corrupts the one document four lanes treat as authority.

### What the review of this section caught, recorded because it generalises

This section was reviewed before merge by a single opus reviewer instructed to verify every claim against
primary sources. It found four material errors in the first draft: the "green suite" claim (false for T6,
which runs the real engine); the `schedule.ts` MUST (a file-name match mistaken for a scope match); the
`Record<string, unknown>` compiler-defeat claim (`EventEnvelope.payload` is already `unknown`, so there
was no net at that site to defeat); and a remedy that told Plan 3 to import from `@gisik-nokma/domain`
while the code in question lives *inside* that package.

The generalisable part: every one of those was a **plausible inference from a real fact** — the fake
DataSource is real, `schedule.ts` is real and is Lane 4's, the cast at 2758 really does defeat the
compiler, and the import law really is standing. None was invented. What failed was checking the
inference one step further: what the schedule actually schedules, what the test actually calls, what the
envelope's payload type already is. A finding that names a file and a line is not yet a finding that has
been verified to *do* what the name suggests, and this document is acted on by four lanes at once.

Lane 1 named the operative asymmetry more precisely, and it is worth adopting as a rule: **the inference
was always about a file that had not been opened.** A plausible inference about unread code is
indistinguishable from knowledge until someone opens the file. Its pre-flight already forbids an
adaptation-map entry without a `file:line` citation for exactly this reason. Extended to this document:
**a cross-lane claim about another lane's code carries the `file:line` that proves it, or it ships as a
question rather than a finding.**

### Three findings of one shape, and the rule that catches all of them

Independently, in one day, three lanes found checks that pass without checking:

- **Lane 3** mutated fixtures Plan 7 Task 2 ships as pinned text and found four surviving mutants,
  including a `type === 'image'` discriminator deletable with all seven cases still green — so a walker
  that also harvested mention ids would change what a server gate checks, silently.
- **Lane 4** found Plan 11's `check:env` gate greps for `process.env.X` while this codebase reads config
  through a zod schema and passes `process.env` in wholesale, so it finds zero variables and passes
  vacuously — and its planted-defect proof plants a `process.env.X`, the one pattern it can see.
- **Lane 4** also found the colour-discipline scanner matches hex and colour functions but not bare
  named colours, so `color: red` passes; proven both ways with plants.

Lane 3's name for the shared disease is the sharpest available: **an artifact whose planted-defect proof
is drawn from the same assumption as the artifact.** The checker's plant confirms the mechanism works,
not that the mechanism looks where the variables are; the fixture's cases confirm the walker finds, not
that it discriminates. In every instance the defect was invisible from inside the artifact and appeared
only when someone mutated the *implementation* rather than extending the *test*.

**The rule, binding on every planted check in the series:** *mutate the implementation, not the fixture.*
A plant drawn from the same assumption as the check will always pass. And for transcribed fixtures
specifically, which read authoritative and are therefore least likely to be interrogated: confirm the
mutation goes red **at the fixture's own expected outcome** rather than at setup or parse, and for a
refusal fixture confirm it fails for the *named* rule — one that still refuses after the check under
test is deleted is pinning something else.

**A corollary Lane 3 raised that the deferral above needs, in the narrower form Lane 4's check makes
correct.** The general worry — a widened check that only ever scans trees authored after it silently
exempts everything predating it — does not fire against this scanner, because `walk()` enumerates every
*existing* root on every run, so a bare-keyword check wired into the same walk covers
`packages/editor/src` the moment that tree exists, with no re-scan step for anyone to remember. The
constraint that actually needs to travel to Plan 6 Task 2 is therefore narrower and structural:
**put the keyword check inside `walk()`; do not invent a changed-files mechanism for it.** A check that
enumerates gets this property for free; a check that watches a diff has to be told about history, and
will not be.

**A fourth instance, from Lane 2, where the pressure runs the other way.** Plan 4's text carries four
test-count drifts — it states 13 tests where 14 `it` blocks are written, 7 where 8 are, "1 test" where 2
are, and a header saying cases 6.1–6.20 over a list running to 6.22. Individually trivial; dangerous in
aggregate because of the repair they invite. An executor who trusts the stated total and finds one test
more than expected has an obvious tidy-up available: delete the extra so the count matches the number the
plan pinned. **Standing ruling, adopted from Lane 2 and generalised to the series: resolve every count
discrepancy by literal count and correct the plan's number, never the reverse.** "Make the count match"
is how deliberately-written coverage gets deleted by someone being tidy. Any lane whose plan carries the
same drift takes the same ruling.

**Direction is what decides whether a drift is dangerous, and Lane 1's per-task pass proves it.** Six of
Plan 3's twelve tasks carry a count mismatch, but only two carry the dangerous direction. Where the plan
states a number *above* the blocks actually written (Plan 3 T3, T5, T6, T7 — 14/10/8/10 stated against
13/8/7/8 written) the invitation is to write more, which is harmless. Where it states a number *below*
(T10: 8 stated, 9–10 written — a floor-list task; T14: 31 scenarios stated, 36 case ids written) the
invitation is to delete. **T14's is the sharp instance and is worse than a count**: reaching "thirty-one"
by deleting case ids would break live cross-plan citations — 5.27 and 5.30 are cited by Plan 5
(`2026-08-20-05-api-realtime-search.md:6158`) and by this document at line 213, and 5.36 is cited at line
303. So a tidy-up inside one plan silently breaks two other documents' references. Lanes should sort
their own count drifts by direction and warn only the dispatches where deletion is the tempting repair.

**The rule needs a second clause, or it manufactures the harm it prevents — found by Lane 3 running the
check over Plan 7 before anyone tripped on it.** Plan 7 has no real instance (fourteen in-scope tasks,
counts exact where stated), but T11a *looks* like one: 6 `it` blocks against a stated 4. It is not a
defect. That task is split across two packages — 4 domain cases in `attachment-kinds.test.ts` and 2
server cases appended to `evidence-gate.test.ts` — and the plan states them separately and correctly
further down. A task-range count flags it; reading the range clears it. The danger is that a split task
produces **the same arithmetic signature as a real drift**, and the naive resolution ("the plan says 4, I
have 6, delete two") is precisely the coverage deletion this ruling exists to prevent.

**Operative form, therefore: resolve by literal block count *per file*, not per task, and correct the
plan's number rather than the tests.** A task that appends cases to another package's suite is the
false-positive shape to expect.

**Run against Plan 3 T10, the clause clears it as a real drift — and the instance is the best argument
the rule has.** One test file named (`task-10-brief.md:6, :74, :393, :585`), ten `it` blocks all in it
(`:238, :249, :263, :269, :284, :296, :321, :336, :346, :359`), one stated expectation
`Expected: PASS (8 tests)` at `:586`. No second package, no separately-stated half — the split-task
signature does not apply, so the stated-BELOW warning stands: write all ten, correct the number, delete
nothing. What makes it worth recording is *which* two an executor would most plausibly delete: `:346`
("the fold leaves the transition log alone — entries keep the version their state ids are written in")
and `:359` (the planted-defect projection-outer replay). **Those two pin decision 10 — the monotone fold
guard and as-of resolution — which is the entire reason T10 is on the floor list.** The naive repair does
not remove two arbitrary tests; it removes precisely the coverage the task exists for.

**Stated once, because it is the same rule as the fixture finding above seen from the other side.** There
the danger is a test that cannot fail; here it is a test that gets deleted for being unexpected. Both
arrive out of authoritative-looking plan text, and both resolve identically: **the literal file is the
authority; the plan's number is a claim about it.**

**A note on the evidence, since the series keeps re-learning it:** Lane 3 reported a clean negative on
Plan 7 rather than staying silent, and that is the right behaviour — a clean negative is evidence that
the check ran, and silence is indistinguishable from not having looked.

**And a diagnostics corollary, from Lane 4's scanner.** `colour-scan.ts` reports hits as
`relative(root, path)` — relative to each individual source root — so once a second package exists, a hit
in `packages/editor/src/styles/editor.css` prints as `styles/editor.css` with nothing naming the package,
and two roots each holding an `index.css` produce two indistinguishable lines. This is the series' own
"a refusal that fires for the wrong reason is not coverage" applied to diagnostics: a check that fires
correctly but cannot say *where* sends its red to the wrong owner. Invisible while one lane owns every
scanned tree; it bites the moment a second lane's tree enters the walk. Fix is `relative(REPO_ROOT, path)`
and Lane 4 is landing it ahead of Lane 3's rebase.

---

## Plan 4 execution consequences (2026-08-28) — recorded by the task that acted on each

Same discipline as Plan 1's and Plan 2's sections, and for the same reason: the lane's adaptation map is gitignored, so a ruling that lives only there has been made and then thrown away. Each entry below is written by the task that acted on it, in that task's own commit.

### 1. `Queryable` lives at `apps/server/src/db/queryable.ts` — Plan 7's blocker, discharged (Task 1)

`export type Queryable = Pool | PoolClient;` ships at `apps/server/src/db/queryable.ts`, imported as `'../db/queryable.js'`. The alternative the adaptation map offered — folding it into the existing `src/db.ts`, which owns `createPool` — was declined because the Wave-1 schedule reads *"Plan 7's server T7/T8 once Plan 4 T1 lands `Queryable`"*, and Plan 7's tasks were written against the `src/db/queryable` specifier. A file and a directory of the same stem coexist fine under NodeNext; `src/db.ts` keeps `createPool` and gains nothing.

It is deliberately **not** retro-fitted onto `Projection.apply`, whose `tx: PoolClient` parameter is a design decision (`src/projections/registry.ts`), not an oversight: a projection may only ever write inside the ingest transaction.

### 2. `@better-auth/cli` is NOT a dependency of this repo, and must not be reintroduced (Task 1)

better-auth is pinned at **1.7.2**; `@better-auth/cli`'s latest release is **1.4.21** and it pins its own `better-auth@1.4.21` as a hard dependency, so `better-auth generate` reports the **1.4** schema no matter which version the server imports. Run against this repo's own config it emitted an `account` table with **no `"issuer"` column and no `account_issuer_accountId_uidx` unique index** — both of which 1.7.2 writes on every account link. A vendor schema drifted that way fails on the first Google sign-in, not at migrate time.

What replaces it: `pnpm --filter @gisik-nokma/server run auth:schema` (`src/tools/auth-schema.ts`) prints the schema of the **installed** better-auth via its own `getMigrations(auth.options).compileMigrations()`. `apps/server/test/auth/auth-tables.test.ts` then asserts the live migrated database leaves that planner with nothing to create, add or index **and nothing to warn about**. Both channels are needed: presence drift (a missing table, column or index) lands in `toBeCreated`/`toBeAdded`/`toBeAddedIndexes`, but **shape drift — a column of the wrong type, or nullable where the field is required — reaches neither array and is only a `logger.warn`** (`better-auth/dist/db/get-migration.mjs`, the `column.isNullable` and `matchType` branches). A version that asserted only on the arrays passed happily with `"emailVerified"` made nullable and `"counter"` retyped to `text`; the test now passes a capturing logger and asserts the warnings empty too. So a better-auth upgrade that changes the vendor schema in either way turns the suite red instead of production. Plan 11, which packages and deploys the server, inherits both: do not add the CLI to get a schema, and treat a red anti-drift test as a required migration, not a flake.

### 3. `apps/server` emits no declarations (Task 1)

`declaration` is `false` in both `apps/server/tsconfig.json` and `tsconfig.typecheck.json`. `betterAuth(...)`'s inferred type reaches into `@simplewebauthn/server` and zod 4, both nested under better-auth in the pnpm store and therefore unnameable from this package — declaration emit fails with TS2742 on any export whose type touches the auth instance, `createAuth` and `type Auth` included. `apps/server` is a private leaf app that nothing imports, so it loses nothing. The two alternatives were worse: hoisting a second zod major into a package that already depends on zod 3, or hand-writing a facade type that would silently narrow the auth API. Any later plan adding server code inherits this; `packages/*` are unaffected and still emit declarations.

### 4. zod 3 stands — but not for the reason first recorded (Task 1, corrected on review)

**The conclusion holds: nobody upgrades zod.** `apps/server` keeps `zod ^3.25.0`, no package in the monorepo moved, and better-auth 1.7.2 declares **no zod peer range** — zod `^4.3.6` is a direct dependency of its own.

**The first version of this entry got the mechanism backwards and is corrected here**, because it is the durable record and a wrong reason is worse than none. It claimed the single `better-call` had resolved zod 4 and that pnpm's warning was reporting the wrong thing. The lockfile says the opposite, and the warning is accurate. Derived from `pnpm-lock.yaml` and a pruned `node_modules` (`pnpm install --frozen-lockfile` into an emptied tree):

- `pnpm-lock.yaml` holds exactly **one** `better-call` snapshot — `better-call@1.4.0(zod@3.25.76)` — whose `optionalDependencies` read `zod: 3.25.76`.
- `@better-auth/core`'s snapshot **key** contains the substring `(better-call@1.4.0(zod@4.4.3))`, but its `dependencies` block resolves `better-call: 1.4.0(zod@3.25.76)`. The key is a stale peer label; the edge is what counts. Reading the key — or worse, a leftover `.pnpm` directory name — is what produced the original error.
- On a pruned store there is exactly one `better-call` directory, `better-call@1.4.0_zod@3.25.76`, and **all three** of `better-auth`, `@better-auth/core` and `@better-auth/passkey` symlink to it.

So `better-call` resolved its optional zod peer to **3.25.76, outside its declared `^4.0.0`** — precisely what pnpm's `✕ unmet peer zod@^4.0.0: found 3.25.76` reports. The zod split in force is: `better-call` → 3.25.76; `better-auth`, `@better-auth/core`, `@better-auth/passkey` → 4.4.3 (passkey via its own direct `zod ^4.3.6`).

**Why that is nevertheless safe here, and what would actually break it.** `better-call`'s only use of zod anywhere is `dist/openapi.mjs` / `openapi.cjs` (`import { ZodObject, ZodOptional } from "zod"`, resolving to **3.25.76**). That module is **not** absent from the running process: `generator` and `getHTML` are re-exported from better-call's **root barrel** (`dist/index.cjs:8,17,19`; `dist/index.mjs:7`) and `dist/router.mjs:4` imports them too, so `openapi` and its zod-3 binding load **eagerly on every `import 'better-call'`**. The accurate statement is that the code is *loaded and never reached*, not that it is never loaded.

Reached, it would misbehave silently: `openapi.cjs:20` and `:36` evaluate `options.query instanceof ZodObject` / `options.body instanceof ZodObject` with a **zod-3** constructor against the **zod-4** schema objects better-auth's endpoints carry. Every test is `false` — no compile error, no throw, just an OpenAPI document quietly missing its parameters and request bodies.

**The trigger is narrower than first recorded here, and the earlier version named the wrong one.** It is *not* "whichever plan enables better-auth's openAPI plugin", and the remedy is *not* "force one zod major":

- better-auth's `openAPI()` plugin **does not use better-call's generator**. It ships its own — `dist/plugins/open-api/index.mjs:5` imports `./generator.mjs`, whose line 3 is `import * as z from "zod"` resolving through better-auth's own link to **zod 4.4.3**. Enabling that plugin never reaches better-call's zod-3 code.
- better-call's own hazard path is **already switched off**. Its router registers `/api/reference` and calls `generator` only under `if (!config?.openapi?.disabled)` (`better-call/dist/router.mjs:7-16`), and better-auth passes `openapi: { disabled: true }` unconditionally (`better-auth/dist/api/index.mjs:155`).
- Nothing in `apps/` or `packages/` imports `better-call` at all.

**So what a future plan should actually watch for:** repo code calling better-call's `createRouter` **without** `openapi: { disabled: true }`, or calling the root barrel's `generator` / `getHTML` directly. Only those reach the zod-3 `instanceof`. If that day comes, the fix is to keep better-call's OpenAPI generation disabled — or to align better-call's zod with better-auth's — and enabling better-auth's own `openAPI()` plugin is not the event to watch for.

Do not "fix" the pnpm warning by upgrading the workspace to zod 4: that would touch every package in the monorepo, and it is not what makes `better-call` zod-3.

**The runtime half of that, checked rather than assumed (Task 1, on review request).** Type-level silence is not the whole question: if better-auth's *exported* surface handed back zod schemas, a zod-4 schema composed with one of ours would misbehave at runtime with no type error. Verified on both axes against the installed package.

Nothing flows in: `BetterAuthOptions` and the option types of every plugin we configure contain zero zod references, so no field of better-auth's could accept one of our zod-3 schemas. Things do flow out: seven barrel exports (`userSchema`, `sessionSchema`, `accountSchema`, `verificationSchema`, `coreSchema`, `rateLimitSchema`, `additionalAuthorizationParamsSchema`) are live zod-4 objects, and every `auth.api.<endpoint>.options.body`/`.query` is one too — `auth.api.getSession.options.query._zod.version` reads `{major: 4, minor: 4, patch: 3}`. Composing either with our zod 3 **in our own code** is a compile error rather than a silent runtime bug: `z.object({…}).and(userSchema)` fails with TS2345, zod 4's `ZodObject<…, $strip>` "missing the following properties from type `ZodType<any, any, any>`", and only an explicit cast gets a mix through. That protection stops at our source: §4 above records where the same mix already happens **inside the vendor**, silently, with no compile step to refuse it. The rule below is what keeps our side clean; it is not a claim that the hazard cannot occur.

One trap worth naming because it looks correct in an editor: `better-auth/dist/index.d.mts:29` carries `export * from "zod"`, so **`import { z } from 'better-auth'` type-checks** — while the runtime barrel has no such export, making it an ESM link failure (`SyntaxError: The requested module 'better-auth' does not provide an export named 'z'`). Loud, and it can never reach production, but it will waste someone's afternoon.

**Standing rule for every plan that enters `apps/server`'s auth code:** import `z` only from `zod`, never from `better-auth`, and never reuse `auth.api.*.options.body` as a validator inside our own zod-3 code. Write our own schema.

### 5. better-auth mints ULID ids, by configuration — and it does not by default (Task 1)

`createAuth` sets `advanced.database.generateId: () => newUlid()`. **This is load-bearing, not tidiness.** better-auth's default generator is `createRandomStringGenerator("a-z","A-Z","0-9")(32)` — a 32-character mixed-case random string (`@better-auth/core/dist/utils/id.mjs`). A user's id is not only better-auth's business: it becomes `actorId` on every event that user authors, and `packages/domain/src/envelope.ts` (Plan 1, shipped) declares `actorId: ulidString`. So an unconfigured better-auth produces users who **cannot author any event at all** — every submission refused `malformed-envelope`, a refusal naming the envelope for a fault in the identity layer, which is the kind of bug that gets debugged in the wrong file for a day. Reproduced deliberately: with the option removed, `parseEvent` answers *"event envelope is malformed at actorId: must be a ULID"* and the minted id reads `QhiYV1j73o6pGaVNrVv37ccUwk9fsFtY`.

The ratified membership entity id `${workspaceId}:${userId}` needs it for the same reason, and `project.member_added`/`removed` and `visibility.set`'s explicit `userIds` inherit it.

**Scope: every model, not only `user`.** Session, account, verification and passkey ids never enter the ledger and carry no ULID requirement, so this is wider than strictly necessary — deliberately. One unconditional rule has no branch to get wrong; it needs no vendor internal as a fallback for the other models (returning `false` would ask Postgres for a default the vendor schema does not define); and a table a future plugin adds conforms without anyone remembering to extend a list. Session **tokens** are untouched — those call better-auth's own `generateId(32)` directly (`db/internal-adapter.mjs`), so token entropy is unchanged by this.

`newUlid()` from `@gisik-nokma/domain`, never a local `ulid()` call: `ids.ts` is the single origin of what a ULID is here, the same discipline `envelope.ts` states for `ULID_REGEX`.

**No migration change was needed and this was checked, not assumed:** every id column in the vendor schema is unbounded `text` (`user.id`, and the `userId` foreign keys on `session`, `account`, `passkey`), with no `varchar(n)` or `char(n)` anywhere, so 26 characters fit where 32 did. better-auth's own migration planner agrees — a function-valued `generateId` is not `"uuid"` or `"serial"`, so it still expects `text`, and the anti-drift test (§2) stays green with the option in place.

**Any later plan that swaps the auth provider inherits this constraint.** The requirement belongs to the ledger, not to better-auth: whatever mints user ids must mint ULIDs, or `envelope.ts` must change — and it should not, because `actorId: ulidString` is the contract every other id in the series is held to. Covered by `apps/server/test/auth/user-ids.test.ts`, which signs a user up through the real phone-OTP path and puts the id better-auth actually stored through the real door.

### 6. Three constraints the membership coherence check creates, which exist in code and nowhere else (Task 3)

All three were found by review, not by execution. None is a defect; each is a fact a later author needs
before touching this code, and the durable record is the only place they can look.

**`submittedEventSchema` and `eventEnvelopeSchema` carry only the WORKSPACE half of the check.** The
membership coherence check has two halves (see the envelope-collision section above). The workspace half
is a cross-field refinement inside both exported schemas; the user half compares `entity.id` in FULL
against `membershipId(workspaceId, payload.userId)` (`parse-event.ts` — not the right half alone, so it
re-proves the workspace half as a by-product) and therefore needs the payload PARSED, which needs the
event's type, version and registered schema, none of them knowable inside a schema whose `payload` is
`unknown` by design. So it lives in `parseEvent`. That full-equality shape is exactly why the two halves
are asserted through DIFFERENT doors — see the test-design bullet in the envelope-collision section
above; asserting both through `parseEvent` would let either be deleted with nothing noticing. Verified
rather than reasoned about:

| input | `submittedEventSchema` | `eventEnvelopeSchema` | `parseEvent` |
|---|---|---|---|
| membership in wsA, filed `A:userC`, payload grants **userD** | **accepts** | **accepts** | `malformed-envelope` |
| membership in wsA, filed **wsB**`:userD`, payload grants userD | refuses | refuses | `malformed-envelope` |

Note the first row is `true` for **both** schemas, not only the full-envelope one — the review named
`eventEnvelopeSchema` because that is the one a sync-down reader reaches for, but a consumer of
`submittedEventSchema` inherits exactly the same gap. **Zero production consumers validate a bare
envelope today** (`parse-event.ts` is the only caller; everything else is tests), so nothing is broken
now. The hazard is the first consumer that does: it would inherit half a check with no way to tell. The
rule, stated once: **to validate an event, call `parseEvent`** — these schemas are the shape layer
underneath it, not a substitute for it. `envelope.ts` carries that note **twice, once above each export**,
and the duplication is deliberate rather than sloppy: a doc comment binds to the single declaration
beneath it, so a note written only above `submittedEventSchema` reaches nobody hovering
`eventEnvelopeSchema` — in the emitted `envelope.d.ts` the whole inlined shape of the first export sits
between the two declarations, putting them ~100 lines apart. That was the round-1 defect: one comment,
one export covered, and the uncovered one was the export the finding was about. Checked in
`dist/envelope.d.ts` after a rebuild, both before and after, not assumed from the source layout.

**Any future `membership`-kind event type must carry a top-level string `userId`.** The user half is
written against the entity KIND, not against the two types that exist — `if (entity.kind ===
'membership')`, then read `userId` off the parsed payload. A membership-kind event whose payload has no
top-level string `userId` is refused `malformed-envelope` with *"…its payload names no user…"*.

**Which refusal a caller actually meets depends on the type's own schema, and for the two shipped types
it is NOT that one** — run, not reasoned: `membership.granted` with `{role}` and `membership.revoked`
with `{}` both answer `invalid-payload` — *"payload for '…' v1 is invalid at userId: Required"* — because
their payload schemas require `userId: ulidString` and the payload gate runs first. The
`malformed-envelope` sentence is exact only for a **future** membership-kind type whose own schema does
not require `userId`, which is precisely the case the by-kind check exists for. Both refusals are
correct; a later author should expect the payload one while the shipped types are the only two.

The by-kind design is deliberate: a membership's entity id IS `${workspaceId}:${userId}`, so an event that
does not say who it is about cannot be addressed at all, and a per-type check would let the next
membership type inherit the hole instead of meeting the refusal. **Consequence for T14, Plan 10, and
anyone else adding one:** name the user in a top-level `userId`, or file the event against a different
kind. It is not enough to satisfy the entity-id regex. (The branch is reachable and tested — see
`parse-event.test.ts`, which registers a userId-less membership type through `parseEvent`'s injectable
registry rather than leaving a check that cannot fail.)

**`workspace.created`, `workspace.renamed` and `project.created` now refuse a WHITESPACE-ONLY name, and
refuse rather than trim.** Taking over Plan 1's provisional seeds meant adopting Plan 4's stricter shape:
`z.string().min(1)` accepted `'   '`, which names nothing while looking like a name everywhere it is
displayed. The door is the shared `displayName` schema at **`packages/domain/src/events/membership.ts`**,
bound to all three types through `vocabulary.ts` — not in `envelope.ts`, which has nothing to do with it.

**The interesting half is that it REFUSES rather than trims.** Run, not reasoned: `'   '` is refused
*"must not be blank — a name of only spaces names nothing"*, `''` is refused
*"String must contain at least 1 character(s)"*, and **`'  Corner  '` is ACCEPTED and stored verbatim** —
padding is not the defect and a test pins that. Trimming would have been the obvious implementation and
would put words in the actor's mouth; the ledger stores the claim as it was made.

**No existing fixture is affected**, checked across `apps/server/test`, `packages/domain/test` and
`packages/rule-engine`: every `workspace.created` / `workspace.renamed` payload in the repo carries a
real name (`'Convenience Corner'`, `'Gisik Nokma Build'`, `'Personal'`, `'CC HQ'`, …) and there are no
`project.created` fixtures at all. What a sibling lane inherits on rebase is the door, not a breakage.


### 7. The auth HTTP surface, measured rather than read — cookie, bearer, session shape, and the CSRF rule (Task 2)

Task 1 verified better-auth's compile-time API and deliberately stopped short of the runtime surface.
Task 2 mounted the handler and ran it. Everything below came off a live request against better-auth
**1.7.2**; where plan text disagreed, the observation is what is recorded. Plan 6's client and Plan 10's
sync code against these exact strings.

| Fact | Value | Where it is pinned |
|---|---|---|
| session cookie, http baseURL | `better-auth.session_token`; `Max-Age=604800; Path=/; HttpOnly; SameSite=Lax` — **no `Secure`** | `test/auth/sign-in-flows.test.ts` |
| session cookie, **https** baseURL | `__Secure-better-auth.session_token`, same attributes **plus `Secure`** | same file |
| bearer token | response header `set-auth-token`, echoed in `access-control-expose-headers` | same file |
| session object | `{ session: {id, token, userId, expiresAt, createdAt, updatedAt, ipAddress, userAgent}, user: {id, name, email, emailVerified, image, phoneNumber, phoneNumberVerified, createdAt, updatedAt} }`; `getSession` answers **`null`** for absent, forged and signed-out alike | same file |
| other cookies seen | `better-auth.session_data`, `better-auth.dont_remember` (cleared on sign-out), `better-auth.state` (OAuth, `Max-Age=300`), `better-auth.better-auth-passkey` (challenge, `Max-Age=300`) | observed, not pinned |

**The https name is a DIFFERENT NAME, not a flag.** `__Secure-` is a browser-enforced prefix. A client
matching on `better-auth.session_token` finds nothing in production. Both are pinned by test so a
better-auth upgrade that renames either turns the suite red.

**The CSRF rule every later plan has to live with. It has TWO halves, and an earlier version of this
entry recorded only the first — corrected here, because Plan 6 and Plan 10 read the mechanism sentence,
not just the practical advice.**

*Half one, the cookie gate.* `originCheckMiddleware` runs on every non-GET and calls `validateOrigin`,
which returns early unless `headers.has("cookie")` (`api/middlewares/origin-check.mjs`). So a request
**carrying a `Cookie`** needs a trusted `Origin` or `Referer`:
403 `{"message":"Missing or null Origin","code":"MISSING_OR_NULL_ORIGIN"}` for none,
403 `{"message":"Invalid origin","code":"INVALID_ORIGIN"}` for an untrusted one. A **bearer-only**
request is exempt.

*Half two, and it is the one a browser meets FIRST — before it has any cookie to send.*
`formCsrfMiddleware` is mounted **per-endpoint** (`api/routes/sign-in.mjs:245` `/sign-in/email`,
`sign-up.mjs:26` `/sign-up/email`, `plugins/magic-link/index.mjs:60` `/sign-in/magic-link`,
`plugins/email-otp/routes.mjs:77`). Of those four, **three are registered in this configuration** — the
email-otp plugin is not enabled — and it calls `validateOrigin(ctx, forceValidate = true)` when a
**cookieless** request carries `Origin`, `Referer` or any `Sec-Fetch-*` header. Measured:
`POST /sign-in/magic-link` with no cookie and `origin: https://evil.example` → **403 INVALID_ORIGIN**;
with `sec-fetch-site: cross-site, sec-fetch-mode: navigate` → **403 CROSS_SITE_NAVIGATION_LOGIN_BLOCKED**;
with the trusted origin → 200. `POST /phone-number/send-otp` and `POST /sign-out` carry no such
middleware and pass the same forged `Origin`. So "bearer-only is exempt" is true of half one and **false
as a general statement** — the exemption belongs to the endpoint as much as to the request.

**Consequence for Tasks 5/8/12/13, Plan 6 and Plan 10:** authenticate route tests with the bearer token
`signInWithPhone` returns (one header, no origin needed) — that helper's own path, `send-otp` +
`phone-number/verify`, carries no `formCsrfMiddleware`, which is why it works with no `Origin` at all.
A **web** client signing in by magic link must send a trusted `Origin`, which a browser does for it.
`trustedOrigins` is left at better-auth's default — the origin of `baseUrl` — so **when T14's
`WEB_ORIGIN` lands and the web app is served from a different origin, that origin must be added to
`trustedOrigins`.** That wiring is not done here.

**…and adding it will NOT be sufficient on its own.** The catch-all mounts `GET` and `POST` only, because
those are the only methods better-auth's routed endpoints use. A cross-origin browser preflights every
`application/json` POST with `OPTIONS`, and that request never reaches better-auth — measured,
`OPTIONS /api/auth/get-session` with preflight headers answers **404 from Fastify**
(`{"message":"Route OPTIONS:/api/auth/get-session not found","error":"Not Found","statusCode":404}`);
`HEAD` likewise. Whoever wires CORS must answer the preflight as well as extend `trustedOrigins`. The gap
is pinned by a test named `known gap: OPTIONS and HEAD are not mounted`, which goes red the moment CORS
is mounted — so the fix and the pin land in one commit.

**Product routes are outside better-auth's CSRF entirely, and this is a security posture nobody had
written down.** `validateOrigin` returns immediately when there is no `ctx.request`, and
`makeRequireSession` calls `auth.api.getSession({ headers })` — a direct API call with no request object.
So the origin rule binds `/api/auth/*` and nothing else. Measured: `POST /v1/events` with a valid session
cookie and no `Origin` is answered by the ingest door (200, or 400 for a bad body) — never 403. **Once
Task 5 or 12 puts `requireSession` on `/v1/events`, a cookie-authenticated cross-site POST is defended by
`SameSite=Lax` alone.** That is defensible — Lax does stop a cross-site POST from carrying the cookie at
all, so the request arrives unauthenticated and meets the 401 — but it is one mechanism rather than two,
it is a browser behaviour rather than a server check, and it does nothing for a non-browser client
replaying a stolen cookie. Whoever adds the guard should decide deliberately whether to require an
`Origin` on product routes too; today the answer is no, by omission rather than by decision.

**`createAuth` now sets `advanced.disableOriginCheck: false`, and this is load-bearing.** better-auth's
default for it is `isTest() ? true : false` (`context/create-context.mjs`), and `isTest()` is
`NODE_ENV === 'test'` — which vitest sets. Left unset, the origin check is ON in production and OFF in
every test; and while `disableCSRFCheck` is unset, `shouldSkipCSRFForBackwardCompat` takes the whole CSRF
middleware down with it. That is a security control whose presence depends on `NODE_ENV`, and it produces
the worst failure mode available: a green suite in which every cookie POST passes, against a production
that 403s them. Proven by mutation — removing the line turns the two refusal tests green-for-the-wrong-reason (both answer 200).
**Do not remove it, and do not add `disableCSRFCheck`.**

**No user-existence oracle, and one weaker split that was left alone.** A wrong OTP answers
byte-identically for a number with an account and a number without
(`400 {"message":"Invalid OTP","code":"INVALID_OTP"}`), and a magic-link request answers
`200 {"status":true}` for a known and an unknown address alike — both pinned. What better-auth *does*
distinguish is `INVALID_OTP` from `OTP_NOT_FOUND` (no code pending). That is a fact about whether a code
was recently **requested** — which the attacker requested themselves — and it is the same either way for
an account that exists and one that does not, so it is not the user oracle. Left as the vendor ships it:
normalising vendor error bodies at the mount would break better-auth's own client, which Plan 6 uses.

**The mount, and the one thing that must not be copied from the plan text.** `registerAuthRoutes(app,
auth)` registers an **encapsulated** Fastify scope with `removeAllContentTypeParsers()` + a raw `'*'`
buffer parser, then one `['GET','POST']` catch-all at `/api/auth/*`. The verbs are enumerated, not
guessed: `auth.api` carries **46 entries, 44 of which have an HTTP `path`** (`setPassword` and
`consumePhoneNumberOTP` are server-only helpers), and the distinct methods across those 44 are exactly
`GET` and `POST`. It also **throws at assembly** if `auth.options.baseURL` is unset rather than falling
back to the request `Host` header — that fallback was in the first version and reintroduced exactly the
input the line exists to exclude. The plan's `JSON.stringify(request.body)` sketch does not work — with Fastify's own
JSON parser, `request.body` is an object, every POST reaches better-auth with no body, and every check in
`sign-in-flows.test.ts` that puts a JSON body through the mount fails — every sign-in route the product
offers, plus the bearer token, the passkey options and the Google authorization URL. (Stated as a set and
not a count: "12 of the 17" stood here until a later commit added three tests to that file and made both
numbers false.) Encapsulation is what keeps that parser off `/v1/events`: hoisted
to the root instance, the events door stops enforcing `additionalProperties: false`. Both directions are
proven by mutation. A later task adding routes under a new prefix inherits nothing from this scope.

**`buildApp` widened: `AppDeps` gains `auth: Auth`, required.** Still synchronous, still
`buildApp(deps, options) -> FastifyInstance`. `pool`/`otpSender` were **not** added — nothing in
`buildApp` needs them, and `createAuth` stays in the caller, which is what keeps the signature sync.
`auth` is required rather than optional because an app with no identity surface should take a different
builder to produce; the cost is nil because **`createAuth` opens no connection** — measured at ~2ms
against a pool whose port nothing listens on, which is how `test/app.test.ts` stays database-free.
All five shipped call sites are updated — four in tests, one in `src/index.ts`.

**`.env.example` documented a boot-failing value and no gate could see it.** Line 35 read
`BETTER_AUTH_SECRET=change-me` — nine characters against the new 32 floor — so an operator following the
file's own "copy to .env and adjust" met `ConfigError` with nothing saying length was the reason.
`pnpm check:env` passed throughout, because it proves every variable code READS is **documented**, which
is presence, not validity. Fixed, and the class closed: `config.test.ts` now parses `.env.example` and
feeds its documented values to `loadConfig`, so a documented value that cannot boot is a red test. The
file's header also claimed only "Core (Plan 1)" is live, which this task made false; it now names the
live set explicitly.

**`LogOtpSender` in production has TWO faults, not one.** Beyond writing every one-time code to the
process log, it accumulates every code ever issued in an **unbounded in-process array**
(`otp-sender.ts`'s `sent`, which exists only so a test can read the issued code) — unbounded memory plus
a heap-dump disclosure surface. `otp-sender.ts`'s own comment claimed no production implementation kept
such a transcript; Task 2's assembly made that false, and the comment is corrected rather than left
standing. Both faults are in the implementation, not the interface, so the real sender removes them
together. Plan 11 owns the replacement.

**`AppConfig` gains `betterAuthUrl` and `betterAuthSecret`**, from required `BETTER_AUTH_URL` and
`BETTER_AUTH_SECRET` with **no defaults**. The plan's Step 9 reached for
`?? 'dev-only-secret-change-me'` in the production entrypoint, which would let a deploy boot signing
every session with a key printed in this repository. `BETTER_AUTH_SECRET` is `z.string().min(32)` —
32 is better-auth's own threshold, below which it warns and starts anyway. **T14 adds `webOrigin` to this
same schema**; the file is now shared between the two tasks. `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`
stay read at their site in `createAuth` (Task 1's decision) — a test that exercises `/sign-in/social` must
set both placeholders on `process.env` **before** `createAuth`, or better-auth answers 500
`CLIENT_ID_AND_SECRET_REQUIRED`.

**`makeRequireSession(auth)` and `request.currentUserId`.** 401 body is exactly `{"error":"unauthenticated"}`
— **deliberately not** the ledger's `{refused, rule, reason}`: a refusal is a judgement about a claim, and
an unidentified caller has made none. The same bytes answer no header, a forged bearer, a corrupt cookie
and a signed-out token, because every distinction is an oracle. A thrown error is **not** caught — a
session store outage is a 5xx, not a mass sign-out. `currentUserId` is declared non-optional on
`FastifyRequest`, which is a type lie on a route that forgot the preHandler; taken knowingly, because
`string | undefined` would put a `!` in four later tasks. **A route that reads `currentUserId` registers
`requireSession`.**

**`signInWithPhone(app, sender, phone)` returns `{token, userId}`** (`test/helpers/session.ts`) — not the
plan's bare token, because Tasks 8/12/13 need different halves and they must be the same person. `userId`
comes off the verify response, so no test needs a database read to attribute an event.


## `z.unknown()` makes a key optional, and the sweep for who inherits it (2026-08-28, controller)

Found by Lane 4's T1 review, swept centrally because the hole is in a **shared** schema and propagates
by **embedding** — the shape where no single lane can see all the consumers.

**The defect, proven rather than argued.** `z.unknown()` does not require the key. Probed against the
repo's own zod build:

```
z.object({ a: z.string(), payload: z.unknown() })
  { a: 'x' }                  -> ACCEPTED, parsed keys: ["a"]     <-- payload absent entirely
  { a: 'x', payload: undefined } -> ACCEPTED
  { a: 'x', payload: null }      -> ACCEPTED
  { a: 'x', payload: {} }        -> ACCEPTED
```

`submittedEventSchema` (`packages/domain/src/envelope.ts:72`) declares `payload: z.unknown()`. So any
schema embedding it admits an event with **no payload key at all**, and `JSON.stringify` drops absent
and `undefined` values alike, so the wire form loses it silently. In Lane 4's instance the renderer then
writes a literal `undefined` into a comment body that lands in an append-only table permanently.

**There is a compile-time half with the same root:** `z.infer` yields `payload?: unknown`, which is not
assignable to `SubmittedEvent`. The natural downstream unblock is a cast, and the cast erases the
guarantee silently instead of failing. The repo already met this quirk once and handled it by hand —
`parse-event.ts:138` reconstructs the event as `{ ...envelope.data, payload: payload.data as unknown }`
rather than passing the inferred object through. That is the precedent; there is none for shipping the
loose inferred type as a cross-plan contract.

### The sweep: exactly two embedders, and Plan 6 is exposed to a different half

Grepped across shipped code and all eleven plans.

| Embedder | Where | Status |
|---|---|---|
| `eventEnvelopeSchema` | shipped, `envelope.ts:84`, `submittedEventSchema.extend({serverTime, seq})` | **inherits the hole. Owner: Lane 2 / Plan 4**, as a ride-along with the two `envelope.ts` amendments it is already landing in T3. Consumed today only by `envelope.ts` and its own test, so no live exploit path and not urgent — but it is a shared export and the next consumer inherits it silently. |
| `claimContestedPayloadSchema` | Plan 10 line 309, `originalEvent: submittedEventSchema` | Lane 4's instance, in its current scope, being fixed there. |

`parse-event.ts` uses the schema but is **safe**: it reconstructs with `payload` explicitly set (line 99).

**Plan 6 names `submittedEventSchema` zero times** — worth stating because it was the suspected third
consumer. Its client builds `SubmittedEvent` through `makeSubmittedFactory` (18 occurrences), i.e. it is
exposed to the **type** half (`payload?: unknown` and the tempting cast), not the schema-embedding half.
**The remedy there is different and the difference is load-bearing:** state the contracted type
explicitly, and specifically do *not* reach for a `.refine` (there is no embedded schema to refine) or a
cast (**the cast is the failure**). Lane 4 records that arriving at Plan 6 T6 with "apply the T1 fix" in
mind would have produced exactly the cast — which is why a zero-count is worth reporting rather than
treating as an absence of news.

**Ownership, stated because a sweep result reads like an action item and this one is not everybody's.**
Lane 4 found the defect and **correctly declined to fix the shipped half**: `packages/domain/src/envelope.ts`
is on its MUST-not-touch list precisely because Plan 4 owes that file two amendments, and editing another
lane's pending file in parallel is the collision class this document exists to prevent. Being already
inside the package is not a licence to fix a neighbour's file. So the shipped half is **Lane 2's**, routed
there explicitly rather than left to whoever noticed it; Lane 4 owns only its own embed and the Plan 6
type half.

**The test matrix, which is the part most worth a reviewer's attention** (Lane 4's formulation):

```
absent                -> REFUSED
present-but-undefined -> REFUSED
null                  -> ACCEPTED
{}                    -> ACCEPTED
```

**A fix that also refuses `null` or `{}` would look correct, pass a careless review, and quietly refuse
legitimate claims.** That is the same shape as everything else in this document — a check that fails for
a reason unrelated to what it names — arriving inside the remedy rather than the defect.

**The fix pattern** (Lane 4's, verified against the built schemas): a `.refine` on the embedded schema
asserting `payload !== undefined`, plus stating the contracted type explicitly rather than taking
`z.infer`. **Superseded for `claimContestedPayloadSchema` on 2026-08-31**: Plan 4's envelope amendment
landed the same rule at the door, so Lane 4 REMOVED its local refine rather than keeping it as
belt-and-braces — two schemas stating one rule is a second definition that drifts the moment either
moves. The test stayed and now guards the door across a package boundary (proven by neutering the
door's refine and watching that test go red). The pattern below still applies to any embedder the
door does not cover; the explicit-type half is unaffected. Prefer `payload !== undefined` over `'payload' in v`, **for a sharper reason than the first
draft gave.** That draft said `in` cannot tell the two cases apart; the probe above disproves it in its
own output — absent parses to `keys: ["a"]`, present-but-`undefined` to `keys: ["a","payload"]`, so `in`
distinguishes them perfectly. Lane 2 reproduced this independently and supplied the real argument:
**both cases must be refused, so one predicate covers both, and reaching for `in` invites the next reader
to believe the distinction is meaningful when the matrix says it is not.** The recommendation is
unchanged; the reasoning behind it was wrong, and it was wrong against data printed three lines above it.
**Boundary that must not be over-tightened:** `payload: null` and `payload: {}` both stay **accepted** —
null is still a claim, an empty claim is still a claim. Only absence is the defect.

### `envelope.ts` settles at Plan 4 T3 — the schedule fact three lanes need

Lane 2 confirms **T3 is the last amendment it has planned for `packages/domain/src/envelope.ts`**; T14's
invite work was the other one and its share was pulled forward deliberately. After T3 lands, the file
carries all three changes together — the owner-ratified membership composite id, `'invite'` in
`ENTITY_KINDS`, and payload presence — and **lanes may treat that landing as the point the schema
settles.**

That is the payoff of the sequencing rule rather than a coincidence: three amendments to the schema every
event passes through, batched into one change set so three sibling lanes rebase onto it **once**. A
separate PR for the three-line payload fix would have cost more in rebase churn across four worktrees
than the fix is worth — and Lane 4 declining to touch the file, despite already being inside the package
and holding the finding, is the same discipline working from the other side. **A must-not-touch list that
holds when the fix is small and the fixer is right there is the list doing its job, not a gap in it.**

### The sweep was scoped to the wrong question — `z.unknown()` is a type assertion, not a presence assertion

The sweep above asked *"who embeds `submittedEventSchema`?"* That is narrower than the defect. Lane 1
asked the right question — *"where is `z.unknown()` used at all?"* — and found a second instance. Widening
it again, across `packages/` **and** `apps/` rather than `packages/domain/src`, found two more. **Five
sites, four of them the defect:**

| Site | Shape | Verdict |
|---|---|---|
| `packages/domain/src/envelope.ts:78` | `payload: z.unknown()` | **defect** — routed to Lane 2 with Plan 4 T3 |
| `packages/domain/src/events/ticket-events.ts:33` | `ticketFieldSetPayload.value` | **defect, and the worst of them** — see below |
| `packages/rule-engine/src/fixtures/harness.ts:32` | the fixture envelope's `payload` | **defect** — the fixture door has the same hole as the real one |
| `packages/rule-engine/src/fixtures/harness.ts:155` | `ticketFieldSetFixturePayloadSchema.value` | **defect** — exact twin of the `ticket-events` one |
| `packages/domain/src/events/ticket-events.ts:38` | `commentAddedPayload.body: z.record(z.string(), z.unknown())` | **cleared** — the record itself is required; only its values are unconstrained |

**The `ticketFieldSetPayload` instance fabricates a claim rather than dropping one, which is worse.**
Plan 3's reducer does `claim(p.value ?? null, env)` (`ticket-state.ts:201`, brief-mandated). So an omitted
`value` does not go missing — it **records a null clearing claim nobody made**, wiping a field under
someone's name and both their clocks, into an append-only table. That is spec invariant 4 ("nothing is
invented") violated *by the door* rather than by a renderer. `title` is masked by the follow-on
`field.title-required`; every other field clears silently. Lane 4's instance wrote a literal `undefined`
into permanent storage; this one writes an **attributed erasure**.

**The two harness instances matter for a reason of their own.** That harness is what all 61 fixtures run
through, so **the fixture door is currently exactly as loose as the production door** — which means no
fixture can witness the difference between them. A falsifiability substrate that shares the defect it is
meant to catch cannot catch it. Lane 1 owns both (it authors fixtures through that harness at T8).

**The class, stated once:** `z.unknown()` says *this value may be anything*. It does **not** say *this
value is present*. Any schema meaning "some value, contents unconstrained" must state presence
separately. The grep is one line — `grep -rn 'z\.unknown()' packages/ apps/` — and worth running
wherever a payload schema is authored.

**All four defects take the same four-case matrix**, so the doors answer alike instead of diverging by a
hair: absent refused, present-but-`undefined` refused, `null` accepted, `{}` accepted. Lane 1 is pinning
its T7 to it explicitly and citing the envelope matrix as the precedent it matches. For `ticketFieldSet`
it also lands cleanly on Plan 3's design decision 3, which already sanctions `value: null` as an explicit
clearing claim with provenance retained — so the matrix is not a new rule there, it is the existing one
enforced.

### The harness reproduces the fabrication, and two further sweeps that fall out of it

**The harness does not merely share the hole — it reproduces the fabrication character-for-character.**
`harness.ts:294` is `value: payload.value ?? null`, the same construction as the production reducer at
`ticket-state.ts:201`. So a fixture omitting `value` is accepted by the harness, records the identical
fabricated null clearing claim, and therefore **agrees with production while both are wrong together.**
That is "a fixture that agrees with the implementation without constraining it" in its purest form, and
it is why the fix order matters.

**The floor is narrower than first stated here, and Lane 1 checked rather than reasoned.**
`fixtures.test.ts:19` is `evaluateEvent(completeCandidate(fx), buildInMemoryContext(fx))`, and
`applyPriorEvent` (`harness.ts:201`, called from `:170`) handles **priors only**. So a **candidate-position**
event is judged by the **real domain schema** and never by a harness payload schema — a fixture whose
candidate is a `ticket.field_set` omitting `value` *can* prove T7's matrix today, because it reaches
`checkTicketFieldSet` and the production door. The harness schemas gate **prior-event staging**, and that
is where looseness actually bites: a prior can stage a world the real server could not have produced.

So "a fixture cannot be the thing that proves the fix" is **true for prior-position and false for
candidate-position**. The harness fix is still required on its own terms — a prior door looser than the
real door is a defect regardless — but it does **not** block T7's end-to-end proof. **T7** fixes
`ticket-events.ts:33` and proves it with unit tests *and* a candidate-position fixture; **T8** fixes the
harness pair for the prior-staging reason, not as a precondition.

**The mutation must kill the right case.** Revert to bare `z.unknown()` and watch the **absent** case fail
specifically. A mutation that only kills present-but-`undefined` has proven a side effect of the fix
rather than the fix — the distinction is the whole reason the matrix has four rows rather than two.

#### Sweep 1 — `?? null` is a separate defect from `z.unknown()`, and only sometimes a fabrication

Lane 1's point, and correct: the two co-occur here but are independent. `z.unknown()` lets the key
vanish; `?? null` turns the vanishing into a claim. A schema could be tightened while a downstream
`?? null` still invents from a legitimately-absent optional. Swept across `packages/` and `apps/` — ten
sites, and the discriminator is **what `null` means in that position**:

- **Seven are `Map.get(…) ?? null`** — the ordinary not-found idiom. Not claims at all.
- **`harness.ts:226` `parentId ?? null` and `:231` `assigneeId ?? null`** — the fixture created-schema
  declares both `.nullable().optional()`, so absent really does become null. **But that is correct
  semantics, not fabrication:** a ticket created with no parent *is* a root ticket, one with no assignee
  *is* unassigned. Null is the natural default of a state field there.
- **`harness.ts:294` `value ?? null`** — the defect, because in `ticket.field_set` **null is not a default,
  it is an act**: the clearing claim, sanctioned by design decision 3 and carrying provenance.

**The rule that makes the grep usable:** `?? null` fabricates only where `null` carries the meaning of a
**deliberate act**. Where `null` is a state field's natural absence-default, converting absent to null is
the intended reading. That is the question to ask of each hit, and it is answerable without running
anything.

#### Sweep 2 — a third divergence between the fixture door and the real one, found in passing

`ticketCreatedFixturePayloadSchema` (`harness.ts:140`) declares `parentId: z.string().nullable().optional()`
while the shipped `ticketCreatedPayload` (`ticket-events.ts:19`) declares `parentId: ulidString.nullable()`
— **required, not optional.** So a fixture may omit `parentId` and be accepted, where a real event
omitting it is refused at the door. Independent of `z.unknown()`, same consequence: the fixture door is
looser than the door it stands in for, so a fixture cannot witness a refusal the real door would make.
Lane 1 then ran the deliberate pass this argued for, over all eleven mirrored fields, and found a
**fourth** presence defect plus the discriminator that sorts the whole class.

**`ticketCreatedFixturePayloadSchema` omits `typeId`, `projectId` and `title` entirely**, while all three
are required in `ticketCreatedPayload` (`ticket-events.ts:17,18,20`). Worse, the existing instruction to
T8 said to add them as **optional** keys — which would have reproduced the `parentId` presence defect
three more times *in the act of fixing something else*. Corrected: they land **required**.

#### The rule that sorts harness-versus-domain divergence in one pass

> **A harness schema may diverge from its domain twin in VALUE FORMAT. It may not diverge in PRESENCE.**

Format divergence is deliberate and load-bearing: fixtures use `t1`/`ws_1` because they enter at
`evaluateEvent` and never pass `parseEvent`'s door, and tightening `z.string()` to `ulidString` would
invalidate all 62 shipped fixtures for no gain. **Presence divergence has no purpose at all** — it only
lets a fixture stage a prior state the real door would refuse. That settles the
`ulidString`-versus-`z.string()` axis raised earlier: **format, therefore deliberate, therefore keep.**

Applied across eleven mirrored fields without running anything: **four presence defects** (`parentId`
optional; `typeId`/`projectId`/`title` absent; the partial envelope's `payload`; `ticketFieldSet.value`),
**three deliberate format divergences** (assignee `min(1)`, rebound `min(1)`, short ids), **three
deliberate harness-only affordances** (`workflowId`, the `stateId`/`stateCategory` planting overrides,
the `field`/`fieldId` split), and **one schema still to be added** — `ticketReparented`, which must mirror
presence as required-nullable rather than optional.

**And the `?? null` discriminator prevents an over-correction inside this fix.** A T8 implementer
tightening presence could easily "fix" `harness.ts:226`/`:231` into refusals. It must not: a ticket
created with no parent *is* a root ticket, one with no assignee *is* unassigned. Only `value` is an act.
The two rules are twins and are needed together — **presence, not format** decides what to tighten;
**act, not default** decides where `?? null` is a fabrication.

#### The positional rule, so a reader knows which grep hits to open

Lane 1's correction to its own earlier framing, and it generalises better than the instance did:
`z.unknown()` is dangerous **exactly where it stands as an object property's schema**, and harmless where
it describes a container's contents. `z.record(K, z.unknown())` is safe because the *record* is the
required thing and `z.unknown()` sits only in value position — which is why `commentAddedPayload.body`
is cleared rather than being a fifth instance.

### Byte-identical instructions target the repo file, not the plan text

Recorded by Lane 4 against its own two partitions, and general. Plan 6 T6's precondition says to create
`clock-skew.ts` from Plan 10 T1 Step 5 **verbatim**. Lane 4's implementation is about to deviate from
that pinned text deliberately — the plan's formatter throws on two exotic ISO shapes, silently rolls
`2026-02-30` instead of returning it verbatim, and reads non-ISO strings in the device's zone, giving
four timezones four answers on two different days. Not reachable through the envelope door today.
**So any byte-identical check between two plans must target the shipped repo file, never the plan text**
— otherwise the check pins a version that was deliberately corrected. Both ends are Lane 4's here, which
is the only reason it is cheap to notice.


## The validating fake, the over-strict blind spot, and a fourth shape (2026-08-28, from Lane 3)

### Make the fakes refuse what the real door refuses

Lane 3's ruling for Plan 8, recorded here because it generalises past its lane and is probably the
highest-leverage application of the mocked-contract law currently available: **`createFakeGateway` will
run every submitted event through the shipped `submittedEventSchema` before accepting it.**

The reasoning is the payload-presence diagnosis turned into a remedy. That defect stayed invisible
because **a fake validates nothing, so a wrong shape only fails at a real door** — and Plan 8's fake is
the series' most exposed seam, since every authoring test runs through it and its real server (Plan 5
T9b) is a full wave away. The validator is a pure domain function needing no server and no database, so
sharing it costs nothing.

**This converts a fake from "the thing that excuses the server from existing" into "a local copy of the
door."** It is the `safeParse` pin one level up, and strictly stronger: a pin only checks the payloads a
test author remembered to check, while a validating fake checks every event it ever sees.

**Verified, and it applies immediately elsewhere:** `packages/app-core/test/helpers/fake-data-source.ts`
— shipped, Lane 4's — has an `ingest` that pushes to an array and optionally runs a script. **It
validates nothing.** Its own header calls itself "a sanctioned mocked-contract seam" that "must never
become the only thing that proves the contract works" — and as written it cannot refuse anything the real
door refuses. That is the fake through which both the `toStateId` payload drift and the non-ULID seed
`actorId`s pass silently today. **Owner: Lane 4**, as a candidate for the same treatment.

### An over-strict remedy is harder to catch than an under-strict check

Lane 3's observation on the four-case boundary, and it is a genuinely new axis. Every instance catalogued
so far is a check **weaker** than its claim — it passes when it should fail, and shows up eventually as a
production defect. The payload fix invites the opposite error: a remedy that also refuses `null` or `{}`
**would look more rigorous and pass a careless review.**

> **An over-strict remedy is harder to catch than an under-strict check, because it fails closed, and
> failing closed looks like working.**

The under-strict version surfaces as a bug. The over-strict version surfaces as a user being refused
something legitimate — **which nobody reports as a bug in the validator.** It is diagnosed, if ever, at
the far end of a support conversation. So "would this ever refuse something it should accept?" has to be
asked with the same seriousness as its opposite, and the four-case matrix exists to force it.

### RETRACTED: there is no fourth shape — and how a false one travelled

An earlier draft of this section carried a "fourth shape": `markdownLinks: false`, added as a guard, said
to be the very condition selecting the unguarded paste-rule branch — *a guard that enables what it
forbids*. **Lane 3 retracted it and the retraction is right.** `markdownLinkPasteRule` **also** links
plain URLs through its own `findPlainUrls` (extension-link@3.30.5 dist:225, 233), verified empirically
with the option set both ways: plain URL still becomes a link either way. **No value of that option
escapes the defect** — it selects which rule *object* implements the same behaviour. The literal sentence
about branch selection was accurate; the reading built on it was not.

The narrower thing that *is* true, recorded as a variant rather than a species: **an option that appears
to select between a safe branch and an unsafe one may be selecting between two implementations of the
same behaviour.** The trap is that reading the branch condition *confirms the story* — you see
`if (opt) … else <the bad rule>` and stop, because the code agrees with you. Checking the other branch is
what breaks it.

**Why this is recorded rather than quietly deleted.** It is the day's own failure mode pointed at the
people cataloguing it. Lane 3's implementer produced the claim, Lane 3 found it striking and forwarded it
on that strength, and the controller amplified it into this document — **three sessions, no one spending
the two minutes it would have taken to check.** Lane 3's statement of it is the one to keep:

> **A finding that is interesting is not thereby verified, and interestingness is precisely what makes it
> travel.**

It was caught only because Lane 3 had instructed its re-reviewer to re-derive the implementer's headline
claims independently — luck of instruction rather than a systematic guard. The systematic version, and
the reason the review-depth ruling exists: **a claim's velocity through the lanes is not evidence, and
the more quotable a finding is the more it needs the check nobody wanted to spend on it.**

**Still true and unaffected by the retraction:** the paste path itself is real and independently
confirmed — `addPasteRules` fires from `appendTransaction` on `uiEvent === 'paste'`, gated by none of the
three options, live across five extensions, and it **also fires on drop**. And Lane 3's round-1 lesson
stands: that commit closed a real hole and minted a false green check in the same breath, which is worse
than the hole — a hole is merely open, while a false check tells the next person to stop looking.

**One more ownership claim that did not hold, same species as the rest.** Lane 3 had assigned the
paste-path decision to Plan 7 Task 5, on the grounds that Task 5 owns spec §2's "nothing silently becomes
markup". **Task 5's brief contains zero occurrences of "paste"** — its trigger table is explicitly input
rules, its contract is typed sequences, and its mechanism reads `undoInputRule`'s store, which paste
rules never populate. Executed as briefed it would go green, the tripwire tests would stay green, and the
path would ship unnoticed. The assignment read right and did not hold. Corrected: Task 5's dispatch is
widened and **Task 12** named as the implementation site, since `enablePasteRules` is an `Editor` option
and `TicketEditor` is where the `Editor` is constructed.


## A forgeable `origin`, and the window Lane 4's merge opens (2026-08-28, controller ruling)

Found by Lane 4 implementing Plan 10 T2. **Verified independently at the shipped tree**, because it is
security-adjacent and a relayed security claim is worth nothing.

**The gap.** `contest.server-only` refuses a `claim.contested` whose `origin` is not `'server'` — it is
the rule stopping a client forging the system's own record of a refusal. **But nothing validates
`origin`.** `submittedEventSchema` checks only that it is one of the four enum members
(`envelope.ts:80`, `ORIGINS` at `:7` — and `'server'` is one of them), and `apps/server/src` merely
**stores** it: `event-store.ts:61` in the insert column list, `:72` binding it, `:119` reading it back.
Swept the whole of `apps/server/src` and `packages/` for any validate / overwrite / compare of `origin`:
**zero hits.** A client that sets `origin: 'server'` walks straight past the rule.

**The rule is correct and is not what changes.** The engine is shared between server and replica and
genuinely cannot know provenance, so the check belongs at the door, not in the evaluator. This document
already records that Plan 4's permission gate refuses forged server-origin at the gate's first lines.
That remains the fix.

**Reachability today is nil, and Lane 4's merge is exactly what changes it.** Verified: `claim.contested`
is **not** registered in `vocabulary.ts` on `main` (zero occurrences), and **no shipped rule reads
`origin` at all** — the only reference in `packages/rule-engine/src` is the fixture harness defaulting it
to `'server'` (`harness.ts:100`). So a forged origin has nothing to attach to. Lane 4's T1 registers
`claim.contested`, at which point `parseEvent` admits it and `contest.server-only` starts reading a field
the door never checked.

**Controller ruling: Lane 4 merges; the window is recorded with a named closer; Lane 2 is asked to land
the origin check inside Plan 4 T5 rather than as a follow-up.** Reasoning, since a security window ruled
open needs its argument written down:

- Nothing is deployed and there are no users; the exposure is theoretical inside a pre-release repo, and
  it is closed by work already scheduled in the same wave.
- Holding Lane 4 would stall Plan 10's prefix on Plan 4's partition-A timing, for a window nobody can
  reach.
- **This is exactly the Plan 1 §9 shape** — register-then-gap — and the series' settled answer there was
  a rider making the unsafe path honest, **not** a held merge. The rider is unavailable here for a good
  reason: the fix lives in `apps/server` ingest, which is Lane 2's pending surface, and Lane 4 editing it
  in parallel is the collision class that discipline exists to prevent.
- So the §9 remedy applies in its other form: **name the closer, record the window, and make sure the
  closing lane knows it is closing something rather than adding something.** Plan 4 T5 is the closer.

**A second window in the same family, deliberately left open by Lane 4, and its reasoning is the
important half.** `claim.contested_resolved` is reachable at the ingest door once T1 merges and will
**500** until Plan 10 T4, because `createEngineContext` has no `getContest` and the evaluator throws by
design. The attractive fix — have `getContest` return `null` — is **worse**, and Lane 4's implementer
proved it by mutation rather than arguing it: it converts a wiring bug into a legitimate-reading refusal
that tells a user *"no contested claim is recorded"* when the truth is that the context cannot see
contests at all. **A loud 500 on an event nothing submits yet beats a quiet lie.** That is §9's lesson
exactly — the silent-wrong-refusal hazard — and T4 is named as the closer.

### Follow-up (2026-08-31, controller): the window is now OPEN, its named closer has not landed, and §11 made it wider than what was ruled

> **TERM WARNING — two unrelated things are called "the origin check" in this document, and they meet in
> one task.** Everything in THIS section means the **event-envelope `origin` field** — the provenance
> enum (`web` | `mobile` | `desktop` | `server`) that `contest.server-only` reads and that nothing
> validates. §7's prose means the **HTTP `Origin` header** — CSRF and cross-site navigation, a different
> layer, a different attack, a different fix. Plan 4 T5 is asked to do something about both, in the same
> region of the same file. An implementer who conflates them will write a header check and believe the
> forgery window is closed. Flagged by Lane 2 before it dispatched. **Say "envelope-origin" or
> "HTTP-Origin" in every task, commit and review that touches either.**

The ruling above accepted the `origin` window on two stated grounds: reachability was nil, and it "is
closed by work already scheduled in the same wave." **The first has expired and the second has not
happened.** Verified at `main` = `b62be74` after Lane 4's P2 merge (#23):

- **`claim.contested` is registered** — `vocabulary.ts:241`. `parseEvent` admits it. This is precisely
  the event the ruling predicted would open the window, and Lane 4's merge is the merge that did it.
- **`origin` is still unvalidated.** Swept `apps/server/src` and `packages/` again: the only production
  read of `origin` is `contests.ts:43` — the evaluator the forgery defeats. `event-store.ts` stores it.
  The two other apparent hits are prose: `auth.ts:71` is the sentence "origin of what a ULID is", and
  `rebuild.ts:32` matched inside the word "original". **Zero checks.**
- **Plan 4 T5 has not landed.** There is no permission-gate module in `apps/server/src` at all. #22
  (`exec/04-auth-visibility`) merged without it.

**The compound, which is the part no earlier section states.** Each window was ruled on alone. Together
they are worse than either: a forged `origin: 'server'` gets a client past `contest.server-only`, and §11
means the contest it then files may embed *any* fabricated claim naming *any* ticket in *any* workspace.
So the reachable defect on `main` today is not "a client can forge the system's record of a refusal" but
**a client can write a permanent, un-deletable ledger entry attributing a fabricated claim to any actor,
naming any workspace.** `renderContestedClaimText` renders it into a comment body; the append-only
trigger makes it permanent; only supersession, never deletion, is available afterwards.

**What does NOT mitigate it, checked rather than assumed.** `ENTITY_WORKSPACE_MISMATCH_RULE`
(`ingest-service.ts:110`) refuses an envelope filing an entity under the wrong workspace — but the §11
forgery's OUTER envelope is honest (a real ticket in its real workspace). The lie is inside `payload`,
which that guard does not read and, being opaque JSON, could not.

**Assessment unchanged on risk, changed on scheduling.** Nothing is deployed, there are no users, and the
exposure remains theoretical inside a pre-release repo — the Aug 28 reasoning holds on that point and is
not being reopened. What changed is that the closer is no longer "work already scheduled in the same
wave" running on time; it is now the last thing standing between `main` and a defect of this shape.

**Controller ruling, CORRECTED 2026-08-31 by Lane 2 — the closer is an extracted micro-PR, not T5.**
The original ruling said "T5 is elevated to Lane 2's next task." That was wrong on sequencing and Lane 2
caught it by reading T5's own dependencies, which the controller had not: `checkPermission` calls
`resolveEffectiveRole` and `PermissionContext` embeds `EffectiveRole` — both **Task 4** deliverables. So
"T5 next" means waiting for T4 regardless, and then taking the whole gate as one large task at the end of
it. It would have held the window open LONGER than the alternative.

**The closer is the origin refusal, extracted.** It is `checkRolePermission`'s first branch, reads only
`env.origin`, and touches `ctx` not at all — separable on the merits rather than carved out for
scheduling. Lane 2 lands it as its own micro-PR the moment T2 merges: a `check-permission` module holding
the server-origin refusal and nothing else, wired into `commitOne` between the entity↔workspace guard and
`deps.evaluate`. Then T4, then T5 fills in role logic on top — the additive layering the plan already uses
where T9 extends T5's gate. Order: **T2 → origin micro-PR → T4 → T5.**

The split's one real risk is a one-branch gate misread as a complete one, and the mitigation is in the
rule below: the module names the checks it does **not** yet perform, rather than labelling itself partial.
§11's envelope-coherence check remains Plan 10 T4 as recorded, but T4 stops being sufficient on its own
the moment `origin` is trusted anywhere. **Escalated to the owner** as a security-relevant default that
should not stand: recorded and assigned, not silently carried.

### Verification-method rules (2026-08-31) — four, each earned by a wrong claim this wave

These are not about what the code must do; they are about how a lane establishes that a claim is true.
All four were produced during a single exchange between the controller and Lanes 1 and 2, and **each one
is named by whoever was wrong, not whoever was right** — three of the four caught the controller.

**A delta is a fact about a commit; an absolute is a fact about a moment, and nobody holds the moment.**
Lane 1's Ruling P6, generalised past its lane because it caught the controller in the same message where
the controller warned Lane 1 about the identical error. Both parties computed the fixture gate's absolute
by adding a remembered delta to a remembered base; both were wrong, in different directions, within one
exchange — controller said 80, Lane 1's own tracker would have said 79, the counted answer is 83. **Each
task bumps by its own delta, in its own commit, computing the absolute from the directory at that moment,
and no task writes a number it did not count.** Every dispatch brief's arithmetic is advisory.

**A partial-implementation marker enumerates the absences; it does not assert the partiality.** Lane 2's,
arising from the origin micro-PR above. "Deliberately partial" ages into background noise within a week
and tells a cold reader nothing actionable; *"does not yet check role, membership, or visibility"* tells
them exactly which questions the module has not answered, which is what they need in order not to trust
it. Same family as the documentation rule: a sentence claiming a property is worth less than a sentence
naming what would falsify it.

**Any claim of the form "X appears nowhere" must be confirmed by a second independent sweep, or by
file-by-file enumeration rather than a directory scan — and every null result prints a positive control
from the same run.** Lane 2's, with the controller supplying two corroborating failures from the same
hour. The hazard is specific and local: the search proxy on this machine silently turns some directory
searches into empty results, and an empty result is indistinguishable from a true negative from inside
the run. The instructive instance is the second — verifying Lane 1's fixture count, the controller diffed
the wrong directory and got `only in lane1: [] / only in main: []`, a well-formed answer whose meaning is
"the trees are identical." It was caught only because the counts printed beside it read `main=0` against a
known 67. **Printed alone, that diff would have told the owner Lane 1 had shipped no fixtures.** Hence the
positive control: `main=67` beside "no differences" is visibly incoherent; "no differences" alone is not.
The control makes the failure self-announcing instead of requiring a second lane to notice it.

**A sweep is a fact about a tree, and "the repo" is not a tree — name the tree you swept, and sweep the others.**
Lane 1's, produced by a symmetrical failure between lane and controller within one exchange. Lane 1 swept
only its own branch and reported a repo-wide property; the controller swept only `main`, got 1 citation
against Lane 1's claimed 5, and would have called the ruling overstated. Two agents, two single-tree
sweeps, one claim about "the repo", opposite errors. The corrected enumeration is 1 on `main` and **six**
on Lane 1's branch — five of them Lane 1's own, added since Plan 2 merged, four in files that do not exist
on `main` at all.

The live instance that shows why this is not pedantry: **Lane 3 and the controller independently reported
508 tests and the numbers are not evidence for each other.** Controller on `b0ef5f5`: domain 230 ·
rule-engine 128 · server 106 · ui 31 · sync-client 8 · app-core 5. Lane 3 on its own tree: domain 216 ·
rule-engine 115 · server 102 · **editor 39** · ui 31 · app-core 5. Same total, different decomposition,
different package sets — one tree has `editor`, the other has `sync-client`. Had either cited the other as
corroboration, a coincidence would have been laundered into a cross-check that survived both parties being
careful. This is the absolute-versus-delta rule at a second axis: same failure, different dimension.

**A fifth silent-wrong-answer instrument, and the one that hides inside the recovery set: an orphaned sha
in a rebased repo does not behave like a dead link. It behaves like a live one pointing somewhere else.**
Lane 1's, found by auditing its ledger for the survivable-clear property rather than by using it. Of 32
shas cited across its ledger, **17 are orphaned** after four rebases — unreachable from both `HEAD` and
`origin/main`. They still `git cat-file -e` clean and `git show` successfully, returning **pre-rebase
content**. A resumer checking one is not handed an error; it is handed a stale tree that looks correct.
Verified independently by the controller on four of them: all four resolve, all four fail ancestry, and a
live HEAD passes both.

**"Does it resolve" is the test that lies. The test that works is reachability:**
`git merge-base --is-ancestor <sha> HEAD`.

Two things make this worse than the other four instruments. First, it lives in the **recovery set** — the
artifact whose entire purpose is to be correct when everything else is gone, and which is consulted only
when nobody has the context to notice it is wrong. Second, it rots on a schedule nobody watches: every
rebase orphans another batch, silently. Lane 3 hit the same class with a luckier outcome — its ledger
header named the original base after three rebases, which happened to stay reachable from `main`, so it
was accurate **by luck rather than design** and would not have been caught by inspection either.

**Remedy, and both lanes have shipped it:** a validity block at the head of the ledger carrying live
anchors (merge-base, HEAD, ahead-count, tree state, gate, fixture count), a task-to-commit table rebuilt
from `git log --reverse --oneline origin/main..HEAD`, an explicit instruction not to `git show` anything
below it, and **the regeneration command**, because this will rot again at the next rebase.

**The general form, which is the reason this is recorded above the instrument rules rather than beside
them: durable state that nobody has tested is not durable state.** Lane 1 had asserted its ledger's
recoverability twice before testing it, and lanes 2 and 3 asserted the same property about theirs. The
assertion is free and the test is one command. **Before any lane session is cleared, its ledger's anchors
must be verified reachable — clearing a lane whose recovery set has rotted destroys exactly the state the
clear was meant to preserve.**

**Prefer the check whose failure is loud, even when it is slower.** Lane 3's, and it belongs above the
individual instrument rules rather than beside them, because it is the property they all share. Four
instruments recorded on one branch — the proxied directory search, the wrong-directory enumeration, the
reformatted diff markers, the mid-rebase count — fail by returning a **confident, well-formed, wrong
answer**, and not one of them announces itself. A slower check that errors is worth more than a fast one
that lies, and the choice between them is usually made before anyone is thinking about failure modes at
all. Make it deliberately.

**An echo is not a source: a number that comes back to you carries no more evidence than when it left.**
Recorded from a round trip neither party noticed at the time. Lane 3 wrote "the one fable dispatch"; the
controller repeated it back as "your single fable dispatch"; Lane 3 then read its own unverified figure as
established and answered from it. Counted, it was two — an escalation that stays and a reading lens that
was over-tiered. The direction is the trap: the controller had no way to count another lane's dispatches,
so the number was always that lane's to verify, and it returned wearing the authority of an outside
confirmation. **A count laundered through someone else comes back with nothing added but confidence.**
The related half, which Lane 3 named: echoing a count IS asserting it — repeating a number in a reply
feels like agreement and is a claim.

**Naming the commit is not sufficient — confirm no operation is in flight and the tree is clean before a
count means anything.** Lane 3's refinement, and it is a refinement rather than an instance because the
failure satisfies the rule as previously written. Mid-rebase on a lockfile conflict, Lane 3 ran a forced
count and got `editor 16` at commit `d30a375` — a coherent number, at a real sha, from a half-applied
tree. It was caught only because 16 contradicted a figure verified minutes earlier; had it been plausible
it would have shipped. A mid-rebase, mid-merge or dirty tree HAS a sha and is not a state anything can be
counted at, and the number arrives looking exactly like a good one.

**Two totals agreeing is not evidence; a decomposition that reconciles is.** Lane 3's, and the general
form of the 508 coincidence above. Its properly-counted total is 558, and that number is checkable rather
than comparable: every shared package equals the controller's exactly (rule-engine 128, server 106, ui 31,
sync-client 8, app-core 5), domain is 230 + its 11, and editor 39 exists only there — 508 + 50 = 558. The
coincidence was detectable ONLY because the controller published a breakdown instead of a sum. **Publish
the decomposition; a bare total cannot be audited, only matched.**

**A fourth silent-empty mode on this machine: the proxy reformats `git diff`, indenting the `+`/`-`
markers, which defeats any `grep "^[+-]"` filter.** Lane 2's, found when a comment-only-change check
returned a false clean that happened to be implausible enough to recheck. Parse the `.diff` file the
review-package script writes; never `git diff` piped through a marker filter. That makes four distinct
silent-empty modes recorded here — eaten globs, wrong-directory enumeration, proxied directory search, and
now reformatted diff markers — **all four producing well-formed wrong answers rather than errors.** The
common remedy is the positive control, and the reason it is not optional is that none of the four is
detectable from inside its own run.

**A fix is a change like any other — re-run the citation sweep over the files the FIX round touched, not
only the ones the original round did.** Lane 1's, and the count behind it is the argument: four instances
of this shape in one week. Lane 4's fix displaced ten citations; the controller's correction to Lane 1's
fixture number introduced a false absolute of its own; and Lane 1's own fix round introduced a comment
naming `fieldId` while pointing at the line for `value` — the same defect class the task existed to fix,
introduced by the fix. Cheap, narrow, and it closes the loop the original sweep leaves open.

**The instinct to fix what you find is the one that hides compounds.** Lane 4's, and the strongest argument
in this series for record-rather-than-fix. Had Lane 4 fixed §11 inside its own partition it would have
closed the specific hole and left the compound invisible: the `origin` gap lived in another lane's file, so
nobody would ever have written the sentence that made the two legible together — and the compound, not
either half, is the reachable defect. A lane that finds something outside its partition records it with a
named owner. The correct-looking instinct has a cost, and this is it.

**"A fan-out is running" is a claim with a short shelf life, not a state you can report and forget.**
Lane 4's, wider than the budget-check rule above and belonging beside the documentation rule rather than
with budget. Lane 4 reported a review as running; it was true when said and false within the hour when the
weekly limit killed it; the correction arrived three days later. No check existed that would have caught
it. Any claim about work in flight decays, and the longer-lived the claim's audience, the shorter its
useful life.

**When one rule ends up stated in two schemas, delete the duplicate implementation and keep the test.**
Lane 2's reading of Lane 4's `contest-events.ts`, recorded because the tempting move is the wrong one.
That module dropped its own `.refine` asserting `payload !== undefined` once the envelope amendment
enforced it at the door, and kept the test. Two schemas stating one rule is a second definition that
drifts the moment either moves — but deleting the test alongside the refine removes the witness. The
symmetric move looks tidy and destroys the evidence. **Drop the duplicate mechanism, keep the guarantee
pinned** — and the test is then the better artifact, since it pins behaviour across a package boundary
rather than re-implementing it.



### Negative space: two fixtures are the entire net for one defect class

Lane 4 had its implementer build the harness fold **the wrong way round on purpose** — filter-then-complete,
the order the plan text invites — and ran the package. **All 61 pre-existing fixtures stayed green, and
both unit-test files stayed 100% green.** Only the two new fixtures caught it, and the symptom was
"still refused, wrong rule".

The finding is the negative space rather than the catch: **two fixtures are the entire net in this
repository for that defect class.** A suite of 61 that survives an inverted fold is not thereby a suite
that tests folding. Worth doing deliberately elsewhere — mutate the thing, run everything, and count what
actually goes red — because the number is usually smaller than the suite size suggests, and it is the
only way to learn which parts of a suite are load-bearing.


### The gate's placement was contradicted by a brief, and Plan 10 inherits the answer

Found by Lane 2 while checking the origin gap. **Plan 4 T5's brief (line 292) states the bootstrap's
server-origin appends bypass `checkPermission` because "the gate is the HTTP door (Step 5)".** Lane 2's
own earlier ruling put the gate inside `commitOne` with the session threaded in. Those are different
designs, and **this document already settled it in the other direction**: decision 15 (line 105) records
that `IngestDeps.gates` run **inside `ingestBatch`'s transaction**, and states the consequence outright —
*"Plan 10's `POST /v1/sync` wraps the same ingest, so a sync-refused gate violation becomes a contested
claim with no extra wiring."*

**If the gate lived only at the HTTP door, `POST /v1/sync` would bypass it entirely** and a permission
violation arriving over the sync path would never become a contested claim — contradicting the sentence
above and silently removing the sync-path enforcement that Plan 10's amendment 16 depends on. So: **the
gate goes inside the ingest path; the session originates at the door and is threaded in.** Lane 2 is
carrying the reconciliation into T5's dispatch. This is not a new decision — it is the brief being
corrected against the document.

Note the brief was already internally tensioned: three lines below the disputed sentence it says *"the
hook lives in the shared ingest path, not in the route,"* about the bootstrap hook, for exactly the
reason that both `POST /v1/workspaces` and Plan 11's seed CLIs go through the ingest service. The same
argument applies to the gate and the brief did not make it.

**Plan 10's lane inherits the answer** rather than re-deriving it at T7: the sync ingress is covered by
the permission gate because the gate is in the ingest path, and `claim.contested` on a sync-path refusal
therefore includes permission refusals, not only rule refusals.

### The ULID dialect trap, third field, at the identity layer

Also from Lane 2's T1: **`createAuth` never configured an id generator**, and `envelope.ts:79` has
required `actorId: ulidString` since Plan 1. So better-auth's default user ids — which are not ULIDs —
**would have made every event unauthorable.** Not a subtle failure; a total one, discovered only because
the lane checked the identity library's defaults against the door rather than assuming they met it.

That is the same trap recorded twice already (fixture entity ids, seed `actorId`s), now in a third field
and from a new direction: not a test dialect meeting a real door, but a **third-party library's** default
meeting it.

**Lane 4's note on why this instance is the worst of the four is worth keeping:** the first three were
ours to get wrong. This one was a dependency's *default* silently failing to meet a contract nobody had
thought to check it against — **the only one that no amount of care with our own code would have
caught.** The check that finds it is not review; it is testing the library's output against our door.

**A fourth instance, and it widens the rule.** Lane 4 found it in code that had already passed a *clean*
review, and it is not a mint site at all. `newSubmittedEvent` mints correctly via `newUlid()`. The defect
is the **test**: `packages/domain/test/contest-events.test.ts:162` asserts
`toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/)` — 26 Crockford characters, **missing the leading `[0-7]`** that
`ids.ts:9`'s `ULID_REGEX` requires. So it pins *"looks ULID-ish"*, not *"passes the door"*, and an id the
test accepts while the envelope refuses is expressible. Unreachable in practice — `ulid()`'s first
character is timestamp-bounded below `8` until the year 10889 — but it is the day's shape again: **a
check that does not check the property it names.**

**So the rule is not about mint sites; it is about mint sites AND every assertion about a minted id.** A
hand-written regex approximating `ULID_REGEX` is a **second definition of the format**, and second
definitions drift silently. That is the same disease as the two copies of `formatIstInstant` the
byte-identical rule exists to prevent, and as `@better-auth/cli` pinning the 1.4 schema whatever the
server imports. Stated generally:

> **Where a format has one authority, tests assert through the authority, not alongside it.**

The domain exports `isUlid` (`ids.ts:17`) for exactly this, and asserting through it also means the test
cannot drift when the door changes.

**Lane 2's addition, which lane 4's instance does not show: composition must be ASSERTED, not merely
performed.** `MEMBERSHIP_ID_REGEX` is built as `new RegExp(\`^${ULID_BODY}:${ULID_BODY}$\`)`
(`ids.ts:27`), and `ids.test.ts` carries a test named *"is composed from `ULID_REGEX` rather than
re-spelled — one origin for what a ULID is"* which compares `MEMBERSHIP_ID_REGEX.source` against the
composed string. So **a later hand-spelling that behaves identically still fails.** Without that
assertion the composition is a convention rather than a guarantee: someone "simplifying" the construction
back into a literal gets a green suite, and the second definition is reintroduced silently. This is
"state what would make it fail, then make it fail once" applied to a *convention* rather than to a check
— and conventions are the things most likely to be tidied away by someone being helpful.

**Convergence, not compliance, and worth recording as such:** Lane 2 wrote its version into T3's dispatch
before seeing the rule recorded here. Its reasoning was "a second spelling of what a ULID is would be
free to drift from the first"; the recorded form covers the assertion side as well as the definition
side. Two lanes and the controller reached the same rule from three directions in one day — from a
production regex, from a test regex, and from a swept negative.

**Swept, so nobody re-runs it:** across `main` and all four lane worktrees, `packages/` and `apps/`,
there is **exactly one** hand-written ULID-shaped regex outside `ids.ts` — the one above, which Lane 4 is
fixing. Everywhere else asserts through the authority or not at all. A clean negative, and evidence that
the check ran rather than that nobody looked.


## Two findings about method, from Lane 2's T3 review (2026-08-28)

Both are about *how* defects were caught rather than what they were, and both bind the controller harder
than they bind any lane.

### `grep -r` over a directory is unreliable here — and a silent empty result is not a negative

Lane 2's T3 reviewer had an early directory grep **silently return nothing**, and redid every sweep with
`find … | xargs grep` and explicit file enumeration. **Second independent confirmation this session**
(the first is recorded in this session's own tooling notes), so it is a property of the environment
rather than one bad invocation.

Why it matters more than a tooling annoyance, in Lane 2's framing: **a silent empty result is
indistinguishable from a true negative.** That makes directory grep exactly the wrong instrument for the
question *"does this claim have a referent anywhere in the repo"* — which is the shape of nearly every
cross-plan negative traded in this document. Lane 2 hit it on a sentence claiming a fixture now fails,
which was false.

**The technique alone is not the fix, and Lane 4 supplied the part that is: run a POSITIVE CONTROL.**
Search for something you *know* is present, in the same directory, with the same invocation. That
converts *"I found nothing"* into *"the instrument works and found nothing."* Without it, `find | xargs`
is just a different way to get an unverified empty.

**Lane 4's near-miss is the argument.** Its `process.env` sweep with a bare `grep -rn` over two
directories returned nothing; redone with `find | xargs` it found **two files — and those two files are
what exposed Plan 11's `check:env` gate as vacuous.** Had it trusted the empty result, it would have
concluded the codebase reads no environment variables at all and shipped the plan's broken checker
unchanged. So the failure mode is worse than missing a hit: **an empty result can look like confirmation
of the very thing you are investigating.**

> **An empty result without a positive control is not evidence of absence.** The control costs one
> command.

**Audited under that standard, not merely by technique.** Every sweep reported in this document this
session used `find … | xargs grep` or per-file enumeration, and the pure-negative ones have now been
re-run with positive controls beside them:

| Negative claimed | Positive control, same invocation | Result |
|---|---|---|
| `@better-auth/cli` absent from Plan 11 and nine others | `ticket` across the same plan files → 104 / 23 / 301 hits | control passes; negative **stands** (only Plan 4 and this doc) |
| No `origin` validation in `apps/server/src` + `packages/` | `workspaceId` over the same file set → 28 files | control passes; negative **stands** (0) |
| `submittedEventSchema` absent from Plan 6 | `makeSubmittedFactory` in Plan 6 → 18 hits | control passes; negative **stands** (0) |

The remaining sweeps (`z.unknown()`, `?? null`, hand-spelled ULID regexes, `better-auth` subpaths,
schema embedders) **returned hits**, and a sweep that returns hits validates its own instrument.

### The prose is the deliverable, so run the sentence

Lane 2's branch produced **four separate prose claims explaining why something was safe, all false**: the
`noEmit` assertion, a lockfile resolution key misread as a dependency edge, a caveat naming a trigger
that cannot fire, and a sentence claiming a fixture now fails. Every one was written confidently, every
one sat in or was headed for this durable record, and every one was caught only because a reviewer **ran
the mechanism instead of reading it**. **The fourth was introduced by the fix for the third.**

> **For every sentence asserting that something happens, is inherited, or now fails — run it. If you
> cannot run it, do not assert it.**

That is the operational form of everything else in this document, pointed at documentation rather than at
code, and it is the rule the controller has broken most often: the corrections to this section have been
overwhelmingly prose claims about state, ownership and history that were plausible, unchecked, and cheap
to check. The four-instances-in-one-branch count is what makes it a rule rather than an exhortation —
**a documentation round is a change set like any other, and its assertions are as falsifiable as code.**


### better-auth's runtime surface is plan text until Plan 4 T2 records it

Flagged by Lane 2, and it binds two other plans. **Task 1 deliberately left better-auth's *runtime*
surface unverified** — endpoint paths, cookie name, bearer header — because establishing them needs a
live request rather than a `.d.ts` read. T1 verified the type surface and stopped there, honestly.

**Plan 6's client and Plan 10's sync both code against those exact strings**, and **until T2 lands they
are plan text rather than fact.** Given this series' record with plan text versus shipped reality — the
`better-auth/plugins/passkey` subpath that does not exist, the CLI pinned to a schema two minors old, an
id generator that was never configured — a string copied from a plan into a client is exactly the shape
that fails at the first live request and nowhere earlier.

**So: no lane hard-codes an auth endpoint path, cookie name or bearer header from plan text.** Wait for
T2's recorded values, or route through whatever T2 exports. T2 will record the verified strings in this
document.