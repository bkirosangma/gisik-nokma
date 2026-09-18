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

**Correction to the row above, made while applying it (Plan 6 Task 16, 2026-09-02): Plan 6's row does not hold.** Every Plan 6 web-client feature landed in `Features.md` §3 and was catalogued there, in `test-cases/03-foundation-ledger.md`, with 144 live cases (3.1–3.144, plus 3.145–3.146 added by Task 16's own sweep) — none of them ever minted under an 8.x id, because the §8/`08-web-client` destination this table names was never opened before the work outran it. Task 16 measured this rather than migrating: renumbering 112+ already-cross-referenced ids to match this row would violate `test-cases/README.md`'s own never-renumber rule for a purely cosmetic relocation, so §3 stays Plan 6's permanent home and §8/`08-web-client.md` are not created. This row is not corrected in place because the table above is this document's numbering authority for every other plan in it — Plans 7–11 still read `7 → §9`, `8 → §10`, `9 → §11`, `10 → §12`, `11 → §13` verbatim — and only Plan 6's cell is superseded. Full reasoning: `Features.md`'s §3 web-client note and `test-cases/README.md`'s matching correction.

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
| Magic-link sender | **`contact@artsourced.in`** — the apex, not a product subdomain, so sender reputation and deliverability stay with the established zone. **Corrected 2026-09-02**, superseding the `sign-in@artsourced.in` this table originally recorded on 2026-08-20; no other reasoning in this row changes. | 11 |
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
- ~~**Plan 8** — the divergence-notice component.~~ **Done, but this line was false when it was written, and the correction is the point.** It claimed the component "was already complete when this line was written" and that the claim had been "verified against the code rather than the note", enumerating a copy table, a population read with its degradation states, helper functions, JSX and tests. None of it existed. Measured on the Plan 8 execution branch before Task 11 ran: `git log --all -- packages/app-core/src/workflow-builder/ticket-types` was empty, there was no `ticket-types/` directory at all, and a `git grep` over the committed tree (`packages/**`, `apps/**`) returned zero files for "Leave them on", "Move them to", `WorkflowRebindDialog`, `rankImplications` and `TicketTypeEditorScreen` — with `transitionOptions` (6 files) and `adviseWorkflowDef` (34 files) named as controls **before** the run, so the zeros were the sweep working rather than the sweep failing. One name the earlier statement of this correction put in the zero list does **not** belong there, and saying so is part of the point: `migrateTypeToWorkflow` returns **3** files at that same sha — `gateway.ts`, `fake-gateway.ts` and `events.test.ts` — because Task 4 had already landed the gateway method and its fake. A brief that carried the absence claim forward had measured it before Task 4, so the enumeration this correction was handed was itself one row stale. What was missing was every consumer of that method, not the method. **The commit carrying this correction is the one that supplies the component**: `TicketTypeEditorScreen` with the divergence notice and its `getTypeWorkflowPopulation` read (`counting tickets…` / `ticket count unavailable`, never a substituted zero), `WorkflowRebindDialog`, `rankImplications`/`rankImplicationsCopy`, the icon and fields editors, the list screen, and 22 tests. "Leave them on …" is an affirmative button beside "Move them to …" — the thing the false line described is now true, and it is true because of that commit and not before it.
  The lesson this line is kept for: a `Done` written from a note rather than from the code is indistinguishable, in this document, from one written from the code — and this one even said "verified against the code" while being the opposite. A verifier that reads only this file cannot tell them apart. **Nothing in this list is evidence of anything; the repository is.** Plan 10's bullet directly above learned a milder version of the same lesson, where the prose described a behaviour in three places and that is what made it look finished.
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

**Resolved by Plan 3, Task 3 (2026-08-28): the version clause is DROPPED.** Plan 3 is the plan that next touched the fold — `foldTicketToWorkflowVersion` in `packages/domain/src/ticket-state.ts` is built on `foldStateIdForward` and inherited the same inaccuracy into its own message — so the take-or-record obligation fell due here, and it was taken rather than declined. `transition.ts:65` now reads `Ticket ${id} sits in state "${unmappedStateId}", which no longer exists in version ${latest.version} and no state mapping covers it.`, and `fixtures/transition-refuses-a-stranded-ticket.json` matches it character-for-character. **The fixture COUNT is unchanged at 61** — this is a copy edit to an existing fixture, not an addition. `packages/rule-engine/src/refusal-rules.ts` and the `stranded-state` rule id are untouched, so nothing that keys on the rule moves; only the sentence a human reads changes. The reasoning now lives in a comment at the refusal site, so a later tidy-up cannot restore the clause without reading why it went.

Why this half rather than the surface change: the two options are not equally priced. Dropping the clause is a two-line copy edit inside one plan's blast radius; carrying the break version on `FoldedState` retypes `workflow.ts:84` and every consumer of the union across two packages, for a sentence that would then have to explain to a human why the version it names is neither the ticket's nor the latest. **The `FoldedState` break-version change stays available and is not withdrawn** — it remains the strictly more informative answer, and the trigger that should reopen it is a support or debugging need to know *where* a chain broke rather than merely *that* it did (Plan 6's refusal rendering, or an operator tool over a corrupted store). Folding the id back to the origin version remains forbidden either way.

Two consequences later plans inherit as fact. **Plan 2's canonical copy table (`docs/superpowers/plans/2026-08-20-02-workflow-engine.md:164`) is superseded for this one reason** and is deliberately left unedited — plan text is never the authority for shipped behaviour, and a landed plan document is a record of what was decided then, not a mirror of what is running now. And **the same wording discipline now applies to the fold's own stranding error**: `foldTicketToWorkflowVersion` names the break-point state id and no version beside it, for the same reason, with the same citation of `workflow.ts:99-101` at the throw site. Plan 3 also authored the series' first three-version walk (`packages/domain/test/ticket-state.test.ts`), which is where §1 predicted the divergence would first be observable directly; it is, and the fold's separate hole-in-the-chain error is what names the missing version when there is one to name.

### 2. `WorkflowDef.roles` is plain strings, so a definition can name a role that does not exist — owner needed

`packages/domain/src/workflow.ts:21` types restrict-to's roles as `z.array(z.string()).optional()`, not `WorkspaceRole[]`. A definition whose restrict-to names `"wizard"` therefore validates clean, publishes, lands in `proj_workflows`, and renders in the builder as a guard — and `evaluateRestrictTo` then compares `"wizard"` against a real membership role forever, matching nobody. The transition is not guarded; it is **closed**, silently, and the refusal reason names a rule that reads entirely legitimate.

This is precisely the shape `validateWorkflowDef` refuses everywhere else: `rdu-unknown-state` exists because a rule watching a state that does not exist is a declared thing that cannot function. A rule naming a role that does not exist is the same defect with no check behind it.

**This needs an owner, and the choice is a real one.** Either (a) Task 3's validator gains an unknown-role check — but `validateWorkflowDef` is pure and I/O-free by design and workspace roles are a domain constant, so this only works if the role vocabulary is a closed domain enum the validator may import; or (b) it becomes a **Plan 8 builder-surface** concern, because the builder picks roles from a list and can simply never emit an unknown one — which leaves the API door open to a hand-written definition. (a) is the honesty floor; (b) is cheaper. Plan 2 declined to rule it, because either answer changes a behaviour the plan had frozen. **Whoever rules it: typing `roles` as `WorkspaceRole[]` is the same fix as (a) and is strictly better than a check, if the enum can live in domain.**

### 3. `require-different-user` is fail-open on an unresolvable entry, and the comment justifying that is conditionally false

`packages/rule-engine/src/rules/require-different-user.ts:56` is `if (!resolved.ok) continue;`, and the comment above it argues the skip is safe because "in such a store the ticket's own state resolution refuses first, as stranded-state, before any rule runs."

**That holds only while the ticket's version and the entry's version coincide.** The ticket resolves from `ticket.workflowVersion`; each log entry resolves from its own `entry.workflowVersion`. When they are equal — as they are in every fixture on this branch — any break the entry hits, the ticket hits first, and the claim is true. **Plan 3's refresh-on-publish makes divergence routine**: a new version is published, the ticket's row is refreshed to latest, and the ticket now folds latest→latest as a no-op while a v1 log entry still walks the entire chain. From then on an entry can strand where the ticket cannot, the entry is skipped, `prior` stays undefined, and the rule returns `{refused: false}` — **four-eyes silently disarmed, for a security control, with no diagnostic anywhere**.

Nothing on this branch is broken: publishing refuses unmapped drops, so an unresolvable entry only exists in a corrupted or planted store. But "only reachable through corruption" is exactly the condition under which a security control should fail *closed*.

**Plan 3 owns the decision, and it is a decision, not a bug fix.** Fail-closed (refuse the transition when any candidate entry cannot be resolved) is the safe reading and can deny a legitimate move on a store nobody has noticed is corrupt. Diagnostics-only (skip, but surface the unresolvable entry somewhere an operator sees) keeps availability and admits the control is advisory in that state. What must not survive Plan 3 is the current arrangement: fail-open, plus a committed comment asserting a precondition Plan 3 itself removes. **Whichever is chosen, that comment gets rewritten in the same change.**

**Resolved by Plan 3, Task 4b (2026-08-28): FAIL-CLOSED.** An entry that cannot be resolved forward now refuses the transition. `if (!resolved.ok) continue;` is gone and the comment justifying it is gone with it. The refusal carries the four-eyes rule id — `require-different-user`, not a sixth id, because the rule vocabulary is closed and versioned (spec §4) and a client filtering on four-eyes must see this one — with the reason templated on the rule's target state exactly as the accepting path's is: `This step needs a second person, and this ticket's history cannot be read against its current workflow, so who last performed the move to "<target>" is unknown. Ask an admin to check this workflow's version history.` The **first** unresolvable candidate entry refuses, rather than the loop finishing and refusing at the end: an entry that cannot be read is a fact about the store, and continuing past it to find a resolvable match would let a later entry paper over an unreadable earlier one, which is the fail-open failure wearing a longer loop. **Guard 1 is untouched and still runs first** — an entry from a workflow the ticket has left is skipped before any resolution is attempted, because it is not unreadable, it is correctly out of scope.

Why fail-closed rather than diagnostics-only: this section's own observation settles it. The path is reachable "only through corruption", and only-reachable-through-corruption is exactly the condition under which a security control should fail closed; the autonomous execution protocol's ruling 3 makes the conservative option the standing default for a question the plans do not answer. Diagnostics-only was also the more expensive half in practice — the engine is pure, returns a verdict and holds no logger, so "surface the unresolvable entry somewhere an operator sees" is a new cross-package surface, not a branch.

**The comment was rewritten in the same change, as this section required**: it now states what the code does and why the old justification died — that the justification rested on the ticket's `workflowVersion` and the entry's coinciding, which refresh-on-publish ends. One correction to record beside it, found while staging the evidence: **the old precondition was weaker than this section credited even at EQUAL versions.** The ticket walks only the ONE id it currently sits in, so a version that dropped some OTHER state without mapping it strands an entry while the ticket resolves cleanly — no version divergence needed. That is the shape the new end-to-end fixture uses (`rule-rdu-refuses-a-history-it-cannot-read`), because the fixture harness has no refresh-on-publish and cannot stage the divergence shape; the unit tests (`packages/rule-engine/test/require-different-user.test.ts`) stage the divergence shape directly, ticket at the latest version folding as a no-op while a v1 entry walks a chain with a hole in it. Both reach the same line. **The fixture count moves 61 → 62 in the same commit**, and `Features.md` §4 plus cases 4.52/4.53 in `test-cases/04-workflow-engine.md` carry the user-visible copy — §4 rather than §5, because four-eyes is catalogued there (4.9, 4.28, 4.35, 4.37) and §5's ids 5.4–5.36 are reserved verbatim for Plan 3's own catalogue task.

### 4. `require-different-user` trusts the log's array order, not the `seq` each entry carries — Plan 3's projection brief

The same rule ends with `// Iterating oldest-first and overwriting leaves the LAST match standing` (`require-different-user.ts:57-58`). That is correct today and it is correct *by convention*: `TicketState.transitions` is documented as appended oldest-first, and Plan 2's harness appends in order. Every entry carries a `seq` field (`packages/domain/src/entity-state.ts:38`) and **nothing in the monorepo reads it**.

So the identity of "the last person to make this move" — the whole content of four-eyes — rests on a projection's append order rather than on the ordering field the data already carries. **A Plan 3 projection that appends out of order silently inverts latest-wins**, and the failure mode is not an error: it is the wrong person's id compared against the wrong actor, refusing legitimate moves and accepting self-approvals, with a green suite. There is no test that would catch it, because every fixture's log is built in order.

**Plan 3's projection brief must either guarantee append order explicitly** (and say so where the guarantee is made, so a later refactor knows it is load-bearing) **or sort by `seq` at the point of use** — which is a one-line change in RDU and makes the field earn its place. The second is preferable: a guarantee that lives in one projection's implementation detail is the same durability problem this whole section is about.

**Resolved by Plan 3, Task 4b (2026-08-28): RDU sorts by `seq` at the point of use** — the option this section names preferable. `evaluateRequireDifferentUser` now iterates `[...input.ticket.transitions].sort((a, b) => a.seq - b.seq)`. A COPY, because `input.ticket.transitions` is engine input and a rule that reorders the state it was handed is a defect of its own kind; ascending, because `seq` is the per-entity sequence number and so a total order within one ticket's log. The `// Iterating oldest-first and overwriting leaves the LAST match standing` comment is replaced by one saying the ordering is established here rather than inherited, and naming the hazard the field's existing-but-unread status created. **Plan 3's `proj_tickets` therefore inherits no obligation to guarantee append order for four-eyes' sake** — the guarantee no longer lives in one projection's implementation detail, which is the durability problem this whole section is about. The test that pins it is the one no fixture could be: two entries matching the watched state whose array order contradicts their `seq`, which the pre-change code answers with the wrong person.

Residual for Plan 3's Task 10, unchanged: it should still SAY what order it appends in, where it appends. Four-eyes no longer depends on the answer, but a reader of `proj_tickets` still has to know whether the log in that table is ordered, and "some consumer sorts it" is not an answer a projection gets to give about its own table.

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
- **A claim on Plan 10: `checkTicketCreated` is non-idempotent under re-evaluation, and the replica is the only caller that could re-judge.** Plan 3 Task 5 added `ticket.already-exists` — a `ticket.created` for a ticket the context already holds is refused, because the shared reducer folds creation unconditionally (`packages/domain/src/ticket-state.ts:94`) and an accepted duplicate silently RESETS the fold, erasing status, collaborators, field claims and the transition log four-eyes reads. That is correct under the engine's contract: `evaluateEvent` judges a CANDIDATE against a context of already-accepted history, and an event that is already in that history is not a candidate. The server is safe (ingest evaluates once, before insert), and so is the fixture suite (only `candidateEvent` faces the engine; `priorEvents` are folded, never judged). **Plan 10's offline replica is the one place this could bite**, and Plan 3 Task 5's own justifications name it twice (`packages/rule-engine/src/checks/hierarchy.ts`, `evaluate.ts`) as a caller that enters at `evaluateEvent` without ingest's door in front of it. If the replica ever re-runs the engine over SYNCED events rather than only over pending local ones, every re-judged `ticket.created` is refused — and it will look like a hierarchy defect rather than a replay defect. **Plan 10 either judges only pending local events, or records why re-judging is safe.** The same shape applies to any later check that asks "does this already exist"; this is the first one in the series.

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

> ### SUPERSEDED TABLE — DO NOT DISPATCH FROM THIS
> This table's `fable` / top-tier rows were removed by the **2026-08-31 cost ruling** (*"Fable out
> entirely"*, later in this document). **Fable is not dispatched for any role.** Sonnet is the
> default and opus the exception. The governing table is in that ruling. This one is kept because
> later sections cite its work classes by name.
>
> *Recorded because a rewritten executor brief still deferred to "the document wins", and this table
> is what a reader hits first — the supersession sat 375 lines below it. The reversal was caught by
> the executor before a restart could act on it.*

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
| The mocked-contract lens | ~~top tier (Fable-class)~~ **DEAD — see the 2026-08-31 cost ruling** | — |
| Adversarial refuters | ~~top tier (Fable-class)~~ **DEAD — see the 2026-08-31 cost ruling** | — |
| Lane controllers / orchestrators | ~~Opus 5~~ **SONNET for the loop, OPUS for rulings — owner ruling 2026-09-02; syntactic escalation triggers in `docs/lanes/controller-state.md`** | — |

> **SUPERSEDED IN PART, 2026-08-31.** Every `fable` assignment below is DEAD. The controller-runs-Opus
> half stands. See *"Owner ruling (2026-08-31, second and stronger): Fable out entirely"*.

**Owner amendment (2026-08-28, second ruling on this table): controller sessions run Opus 5, and "top tier" in this table means an explicit `fable` dispatch, never "the session's own model."** The original line ("controllers are top-tier deliberately") is amended on the owner's direction, with the account's weekly usage pool as the stated reason: controller sessions carry the bulk of every lane's tokens, and Fable-class spend there exhausts the shared pool fastest for the least marginal judgment. What does NOT move down: final whole-branch review lenses, adversarial refuters, and floor-list task reviewers are dispatched with `model: fable` explicitly — bounded fan-outs where the top tier's judgment is the product. If a session cannot dispatch fable, the fallback is opus at max effort, recorded in the ledger as a deviation.

**Budget pressure is never grounds to thin a gate.** When the weekly pool nears its cap, the sanctioned response is to DEFER work — pause non-critical-path lanes, hold a wave until the reset — never to skip a review, drop a refuter, or de-escalate below a class floor. A lane that cannot afford its machinery does not run until it can.

### ~~Owner ruling (2026-08-31): Fable is narrowed to the absolute necessity~~ — SUPERSEDED THE SAME DAY

> **This ruling is DEAD.** It preserved `fable` for adversarial refuters, the mocked-contract lens and
> floor-list reviewers. The later *"Owner ruling (2026-08-31, second and stronger): Fable out entirely"*
> removes all three. Kept for its reasoning and its cost ledger, not for its policy.

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
of `artsourced.in`. Line 84 puts the magic-link sender at the apex (`contact@artsourced.in` as of the
2026-09-02 correction), explicitly because it is *"the established zone"* — so this is not a fresh domain
bought for this product; other things already live on it. `SameSite` is scoped to the **registrable domain**, and `artsourced.in` is the
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

## Serial execution (owner decision 2026-08-31) — the wave schedule is superseded

Wave 1 folded back into a serial run. **The parallel-waves schedule above is superseded in its entirety**
— its gates (`Plans 3+4 → Wave 2`, `Plan 5 → Wave 3`, `Plan 6 → Wave 4`) describe transitions between
concurrent lanes that no longer exist. What survives untouched: the eleven plans and their task
dependencies, the model/effort table, the floor list, the verification-method rules, and every ruling.

### Topology: two sessions, not one

**Controller** (as during Wave 1) and **one executor**. The second session is not a convenience — it is
the check that caught most of Wave 1's orchestrator errors, and a single-session run would have shipped
every one of them. On 2026-08-31 alone, peer lanes caught the controller's T5 sequencing ruling (which
would have held a security window open longer), its fixture arithmetic twice, its claim that
`.superpowers` was untracked-by-oversight, its assertion that a hosting fact was unestablished when the
answer sat eighty lines above in this document, and its estimate of an incident window that was off by 4x.

**None of those were caught by a rule.** They were caught by an agent with a different vantage. The
verification rules below are correct and were, in several cases, asserted by their own authors in the same
message where they went unrun — one lane asserted its ledger was durable in the message declining a
`/clear`, another asserted recoverability twice before testing it, and the controller wrote the
mutating-worktree rule and then mutated a lane's worktree. **A rule does not reliably fire on its author.
A peer does.**

What the split preserves and what it does not: the SDD machinery (implementer → reviewer → refuters) was
never the thing at risk — those are separate agents with separate context and they survive any topology.
What needs the second session is review of the ORCHESTRATOR's judgments: rulings, arithmetic, scope
claims, sequencing. That layer had no reviewer in Wave 1 either, except by accident of there being peers.

### Authority (owner re-grant 2026-08-31)

**Auto-merge: re-granted.** Clause 1 of the autonomous execution protocol was never schedule-tied and
stands — a PR that has passed its full machinery AND an independent CI run green merges without a per-PR
ask. **Amended for this topology: the controller merges the executor's work, never its own.** Self-merging
one's own branch is a weaker check than the clause was written to describe, and the two-session split
exists precisely to avoid it.

**Ultracode orchestration: re-granted.** Clause 2 tied fan-out authorization to "all lane work under this
schedule," and the schedule is void, so on a literal reading the authorization lapsed with it. It is
re-granted here explicitly rather than inferred. The two-fan-out shape is restated **per plan** rather
than per lane: a pre-flight scan before the plan's first task, and a final whole-branch review before its
PR is auto-merge-eligible. The pre-flight's sibling-branch ingestion has no input in a serial run and is
dropped; the adaptation map and the coordination-obligation lens remain.

### Context management for the executor

**The controller cannot clear the executor — `/clear` is user-typed.** This was established when a lane
refused the instruction on exactly those grounds, and the refusal was correct. What the controller CAN do
is kill and relaunch the executor from its brief, which is a **restart, not a clear**, and is survivable
only if the handoff is current. So the protocol is:

1. Controller watches the executor's context and calls the boundary — at a task boundary, never mid-task.
2. **Precondition, non-negotiable: the executor's handoff anchors must be verified REACHABLE**, not merely
   resolvable. `git branch --contains <sha>` — empty means orphaned. Wave 1 measured 17 of 32 cited shas
   orphaned in one lane and 10 of 25 in another, all of which still `cat-file`d clean. **Clearing a
   session whose handoff has rotted destroys exactly the state the clear was meant to preserve.**
3. The executor writes its handoff to a TRACKED file and pushes. Not `.superpowers/` — that directory
   carries its own `.gitignore` containing `*`, placed by the SDD skill, so a handoff written there is a
   handoff thrown away. Wave 1 lost nothing to this only because it was caught in time.
4. Controller verifies the push, then either signals the owner for the keystroke or relaunches.

### ~~The serial sequence~~ — RETIRED 2026-09-07. ALL 177 TASKS ARE DONE.

> **Do not start work from this section.** It is kept so its reasoning stays readable, exactly as
> Phase 0 was. **Your position after any restart is `docs/lanes/executor-state.md`, never the phase
> list below.** The dispatch brief's mirror of this section was retired the same day (owner-approved,
> PR #287); this is the same retirement applied to the copy that lives in the repo, because the brief
> tells a restarting executor to READ THIS DOCUMENT FIRST and fixing only the brief leaves the stale
> figure reachable.
>
> **Measured at `c5e3e02`:** `pnpm check:tasks` → **177/177**, zero claimed/in-flight/todo across all
> 12 plan files. The "~109 remain" below was true 2026-08-31 and is not true now. Every task the phase
> list names (21 of them) was audited individually against `task-ledger.tsv`: each `merge_sha` is an
> ancestor of `origin/main` **and** touches real `apps/` or `packages/` source, 21/21 — with a negative
> control, a docs-only commit, correctly failing that same test.

Derived from the plans' own dependency declarations, not from the wave gates. The spine is
`1,2 → 3,4 → 5 → {6,7,8,9,10} → 11`; Plan 5 states it itself — *"Runs after Plans 1-4; Plans 6-10 consume
everything in this plan's Produces blocks."* ~~**~109 of 177 tasks remain.**~~ **(stale — 0 remain)**

**Phase 0 — land what exists.** Three branches, all clean against `main` individually; the collisions
appear only once one lands and the others rebase. Fixture count goes 67 → 84 at step 1, and every later
assertion is **recounted, never computed**.

1. `exec/03-tickets-hierarchy` — Plan 3 Chain A (T3-T8), complete and reviewed. First: largest shared
   surface, and Plan 10 T4 must rebase onto its `contests.test.ts` change regardless.
2. `exec/06a-client-core` **at `8209397`, not at the branch tip.** T6 is reviewed; T9 sits on top
   **unreviewed** — it finished after the stop order and was committed deliberately, labelled in three
   places. Merging at the reviewed sha keeps the work and keeps the gate; T9 takes its review in the
   serial run. Do not merge this branch on a green gate.
3. `exec/07-editor-client` — **T4's scoped re-review was never dispatched**, so every surface says
   complete except the gate. Review first, then merge. Also 13 behind, so it takes the largest rebase.

**Phase 1 — finish the Plan 5 gate.**

4. Plan 4 **T4** → **T5** *(floor-list)* — permission gate, carrying the CSRF ruling's three items:
   HTTP-Origin on cookie-authenticated routes, `sameSite` set explicitly, and the sentence naming that the
   cookie assertion forbids a `Domain` attribute.
5. Plan 4 **T6, T7** *(T7 floor-list)*.
6. **LIFTED: Plan 10 T4** — the §11 closer, out of Plan 10's position and to here. It consumes only Plan
   1's registry, Plan 10 T1's schemas (both on `main`) and `canSee` from the step above. `fc904f4` closed
   the forgery at the client door only; this closes it at the constructor. Note it registers a projection
   after `proj_visibility`, which collides with Plan 5's registrations — §8's order is the single source.
7. Plan 4 **T8-T14** *(T11, T14 floor-list)*.
8. Plan 3 **Chain B: T9-T13, then T14** *(T10, T12 floor-list)*. **Read `docs/plan-3-chain-b-handoff.md`
   before T12, not during it** — two independent tenancy hazards converge on that one commit, and one is a
   total outage that presents as a data problem.

**Phase 2 — the hinge.**

9. **Plan 5, all 17 tasks** *(T5, T9b, T14, T15 floor-list)*.
10. **Integration checkpoint** — the replacement for the wave-boundary pass. Prove Plans 6a, 8 and 9's
    fakes against the real server before anything builds further on them.

**Phase 3 — the consumers.**

11. **Plan 6 remainder** — first, because Plan 8's T13-14 and Plan 9's T14 both require `apps/web`.
12. **Plan 7 remainder** *(T9, T11 floor-list)*.
13. **Plan 8** — T1-T12 self-contained in `app-core`; T13-14 after Plan 6 *(F5 amendment floor-list)*.
14. **Plan 9** *(T6 floor-list)* — T14 after `apps/web`.
15. **Plan 10 remainder** *(T7, T9, T14, T15 floor-list)*.

**Phase 4.**

16. **Plan 11** *(T8/T9, T12 floor-list)* — last by construction: its interim-plumbing CI gate fails while
    Plan 10's marked shortcuts are still present.

**~~Nine floor-list tasks remain ahead~~ — NONE REMAIN (verified 2026-09-07).** All nine are `done` in
`task-ledger.tsv` with merge shas reachable from `origin/main`. The **class definition survives for any
future work**: a floor-list task keeps an opus implementer and an ~~`fable`~~ **opus** reviewer under the
2026-08-31 narrowing. The seven pre-rulings survive as DECISIONS but are moot as OWNERSHIP — one executor
cannot collide with itself, and the trap is reading "a pre-ruling covers this" and skipping the thought
when the ruling was about *who*, not *what*.

### Two concerns the topology does NOT solve, recorded so they are not assumed away

> **⚠ AMENDED 2026-09-07 — BOTH CONCERNS BELOW ARE STALE, AND THIS SECTION IS NOT COVERED BY THE
> SEQUENCE RETIREMENT ABOVE.** `### ~~The serial sequence~~ — RETIRED` is a *sibling* `###` heading,
> so its "do not start work from this section" banner stops before this one. A reader arriving here
> cold gets two present-tense claims with nothing marking them. Corrected, not deleted:
>
> 1. **The wave-boundary checkpoint's "replacement trigger: the Phase 2/3 boundary" already fired,
>    and points into the retired phase list.** All 177 tasks are done (`pnpm check:tasks`), so Plan 5
>    landed and Plans 6–10 built on it long ago. What actually happened is messier than either the
>    trigger or its own description: **step 10 ran 2026-09-02 (`ac187e8`, PR #70) but covered only
>    Plan 5's `applyCommitted` fake and Plan 6a's client contract** — it could not have covered Plans
>    8 and 9, whose fakes landed later — and **Plans 8 and 9 were witnessed 2026-09-06 by Lane F
>    (`e33c429`, PR #187)** under a different name. The residual was **Plan 9's notifications
>    consumer**, witnessed producer-side only. **It is CLOSED — #293, cases 11.190–11.195**, and this
>    line is corrected rather than deleted because it read "is being closed as assigned work", which
>    was true in flight and became false on merge. A present-progressive claim about work in flight
>    expires silently: nothing rereads it the day it lands.
>    `apps/server/test/integration/notifications-consumer-roundtrip.test.ts` drives the real
>    `createHttpNotificationsGateway` over a real `createHttpClient` against the real route, store and
>    Postgres, with zero `vi.mock`. The blocker was never the dependency graph — the adapter was
>    misfiled in `apps/web` despite importing nothing web-specific, and `apps/server` already
>    devDepended on `@gisik-nokma/app-core`.
> 2. **The `TZ` figure is wrong by an order of magnitude** — see the correction inline below.

**The wave-boundary integration checkpoint no longer fires, and it guarded the signature defect.** The
schedule provided "at each wave boundary, one live-integration pass proves the seams against the real
server before the next wave builds on them." Plans 6a, 8 and 9 all build against sanctioned fakes, and *a
mocked contract is the thing that excuses the server from existing* is this series' most-repeated failure
— the Fable narrowing kept a dedicated lens for it. **Replacement trigger: the Phase 2/3 boundary** —
after Plan 5 lands and before Plan 6, 7, 8, 9 or 10 build on it. It is the only point in the serial order
where the same seams are exposed.

**The environment is a fixture, and no test on `main` varies it.** ~~Measured across all 48 test files on
`main`: **zero vary `TZ`; seven are day- or clock-sensitive; all seven omit it.**~~
**AMENDED 2026-09-07, measured at `7f80048`: 17 of 298 test files vary `TZ` by assignment** (27 mention
it at all, so ten mention without setting it); the denominator came from `git ls-files` over
`*.test.ts`/`*.test.tsx`, a different method from the gate's own "298 test files", and the two agree. A
negative control (`NOT_A_REAL_VAR_XYZ`) returned 0, so the 17 is a real count and not a matching bug.
**The RULE below stands unchanged and is the part that matters** — the aggregate went stale, the
principle did not. The dispatch brief carried this same correction on 2026-09-06 and *this* document,
which its own `## READ FIRST` calls "the interface authority" and sends a restarting executor to FIRST,
did not get it — the identical structural miss PR #289 fixed for the serial sequence, one section over. The exposed set includes
`packages/domain/test/ist-day.test.ts` — the dedicated test for the IST day-boundary module, which
therefore cannot distinguish *the code computes IST correctly* from *the machine is already in IST*.
**Still true at `7f80048`: that file contains zero occurrences of `TZ`.** The aggregate above went
stale; this example did not, and correcting the count must not quietly retire the instance it names. Also
`clock-skew.test.ts` and `event-store.test.ts`.

Found by Lane 4's T9, which mutated the shared IST renderer to the device's `toLocaleDateString` and
**passed the plan's own test** — this machine runs Asia/Kolkata, so the device clock printed the correct
day by coincidence. Only tests swapping to Kiritimati and Niue killed it, and those exist nowhere on
`main`. Since the owner decision put both clocks in Asia/Kolkata and every machine here matches, **every
day-boundary and one-clock proof currently on `main` is consistent with the property being false.** This
is a class of evidence, not a test: any clock-sensitive assertion must vary `TZ` explicitly, and the fix
is a pattern applied to Plan 1's `ist-day.ts`, Plan 9's Calendar and Timeline, and anything reasoning
about a day boundary.

## Owner ruling (2026-08-31, second and stronger): Fable out entirely, opus by exception, and the machinery gets thinner

**This supersedes the earlier same-day narrowing and overrides "budget pressure is never grounds to thin a
gate" a second time, further.** The owner has weighed it twice; it is their call and it is recorded here
in the open rather than worked around. The controller argued against the first narrowing and was
overruled; it is not re-arguing, and the argument below is a cost statement, not an objection.

**The number that forced it.** *(Historical — the projection below is spent; all 177 tasks completed.
Left unedited because it is the reasoning that produced the model ruling, not an instruction.)* Measured
across the parallel window and the serial start: **$113 per task
at 17.6 subagents per task**, with **opus 85% of spend, fable 15%, sonnet 0%**. The 109 remaining tasks at
that shape project to **~$12,400 — 3.3x everything spent on the project to date.** At 31% of a weekly
quota consumed in two sessions, it does not finish. **Removing Fable entirely saves 15% and leaves ~$10,500,
so the tier change alone does not solve this.** The multiplier is agent count, and agent count is why opus
dominates: nearly every one of those 17.6 agents was opus.

### Tier: Fable is out, with no exception clause

| Work class | Model | Effort |
|---|---|---|
| Transcription implementers (plan carries the code) | sonnet | medium |
| Mechanical: scaffolds, Dockerfiles, CI YAML, barrel exports, migrations, catalogue tasks | sonnet | low |
| Pre-flight extraction, grep verification, search | sonnet | low |
| Per-task reviewers where the plan text is complete | sonnet | medium |
| **Everything else not named below** | **sonnet** | medium |
| Core semantics: reducers, projections, engine checks, folds, stream/sync, honesty-carrying view-models | opus | high |
| Fixture authoring and planted-defect design | opus | high |
| Floor-list task reviewers | opus | high |
| Final whole-branch review (one reviewer, see below) | opus | high |
| Adversarial refuter, when one is run at all | opus | max |

**Fable is not dispatched.** Not for refuters, not for the mocked-contract lens, not for floor-list
reviewers — the three the earlier narrowing preserved. The deviation-ledger path is no longer a deviation;
opus at the stated effort is the ceiling.

> **STILL OPERATIVE 2026-09-07 — but read this before you conclude otherwise, because the obvious
> reading of the record reverses it.** `docs/lanes/controller-state.md` records a LATER owner ruling,
> verbatim: *"fable unblock is lifted. but fable should only be used for what is actually necessary. do
> not need to use a butcher's knife to kill a chicken"*, dated **2026-09-06**, which supersedes the
> 2026-08-31 "fable out entirely" ruling with a proportionality rule. Taken alone that revives fable
> for three named uses and makes this section dead.
>
> **It does not, and the discriminating fact is the heading the quote sits under, not the quote's own
> date.** That ruling lives inside the entry headed *"⚡ RESUMED 2026-09-06 **00:30** IST — FIVE
> PARALLEL LANES, OWNER-DIRECTED"*, and every use it authorises is named against that topology (Lane
> A's closure-2 reviewer, the HELD pair, a *lane's* final whole-branch reviewer). The same file carries
> a later entry the same day — *"⛔ OWNER INSTRUCTION 2026-09-06 **18:41** IST — AFTER MONDAY'S WEEKLY
> RESET, BACK TO SERIAL EXECUTION, TOKEN ECONOMY FIRST"* — which ends the five lanes. **18:41 > 00:30,
> and the topology the unblock was scoped to no longer exists**, so the unblock has nothing left to
> apply to and this section governs.
>
> Written down because an executor checked exactly this on 2026-09-07 and was one step from escalating
> it as a live conflict: **a dated quote is not a dated ruling — the entry it lives inside carries its
> scope, and in an append-at-top file the entry above is the later one.** Anyone re-opening this should
> re-read both entries rather than the two quotes.

**Sonnet is the default and opus is the exception**, which inverts the previous table's posture. A
dispatch goes to opus only if its work class is named in an opus row above. **If you are unsure, it is
sonnet** — the previous inversion produced 2.9% sonnet against a table that had assigned it far more.

### Machinery depth — the larger lever, and where "more work for fewer tokens" actually comes from

- **One fan-out per plan, not two.** The pre-flight scan is retired: its cross-lane half died with
  parallelism, and the adaptation map becomes **one sonnet agent**, not a fan-out.
- **The final whole-branch review is ONE opus reviewer**, not four lenses plus refuters plus triage plus
  synthesis. Measured, that fan-out was ~$117 each; there are nine plans left.
- **Judgment fan-outs are withdrawn.** The "would a second independent look plausibly reverse this?" clause
  is revoked as a standing authorization — it is what let a single rebase collision draw eight agents.
  A collision gets **one** analyst.
- **Per-task machinery is implementer → reviewer.** A fix round runs only if the reviewer returned an
  Important or worse; a scoped re-review runs only if the fix round touched more than it was scoped to.
- **Batch the PRs.** Group each phase's plans into as few PRs as coherence allows — one final review per
  PR, not per plan.
- **Hard cap: 6 subagents per task.** Exceeding it requires an owner ask, not a judgment call.

Target shape: **~6 agents per task at sonnet-default**, which projects to roughly **$25-30 per task and
~$3,000 for the remaining 109** — inside the budget rather than triple it.

### Chunk the SESSION, batch the REVIEWS — they are different axes and they pull opposite ways

Measured on the executor's first task: its own session context ran **98K → 143K → 201K → 282K per
request** across four quarters of a single task. **It nearly tripled inside one task.** Its subagents
averaged 86K — less than half — because each starts fresh carrying only its dispatch.

That decides the shape, because the two obvious economies conflict:

- **Smaller PRs** would cut the delta each review must read, but multiply the number of reviews, and every
  review pays full agent-startup context. **Rejected — keep batching PRs per phase.**
- **Smaller SESSIONS** cut the compounding carriage that is 66% of all spend. **Adopted.**

**The rule: the controller restarts the executor at every task boundary.** Not at plan boundaries — task
boundaries. At 282K/request and climbing, every request late in a task costs roughly three times an early
one, and the tail is where most requests are. A restart returns it to ~98K.

This is the largest single lever available and the controller can execute it without the owner, because a
restart-from-brief is not a `/clear` — see the clearing protocol above. Its preconditions are unchanged
and non-negotiable: **the handoff must be current, tracked, pushed, and its anchors verified reachable
rather than merely resolvable.** A restart against a stale handoff destroys exactly what it was meant to
preserve.

**Consequences for how work is sized.** A task is the chunk. If a plan task is large enough that its
context triples before it completes, it is split at a coherent internal boundary and the handoff carries
the seam. **Wall-clock cost of a restart is accepted deliberately** — the owner has stated the trade:
slower is fine, expensive is not.

**Dispatch prompts stay lean.** A subagent at 86K is cheap only while its dispatch is small; a fan-out
brief that inlines whole documents rebuilds the problem inside every agent it spawns.

### What this costs, stated once so nobody has to rediscover it

The two most valuable findings of 2026-08-31 came from exactly what is being removed. **The §11
cross-workspace forgery was found by a fable refuter that committed the forgery end to end over the shipped
door** rather than reasoning about whether it was possible — reading does not produce that finding. **Plan
6 T6's version-chain asymmetry was found by a fable floor-list reviewer** after three parties missed it.
Neither would have been found under this ruling.

**A third instance, filed by the executor as evidence rather than as an argument, hours after the first
two.** Ruling P16's load-bearing half — that `precheckParentTerminal`'s three `passed` exits had to become
`not-evaluated` — was **missed by two of the four opus lenses**, both of which wanted to scope it out as
Plan 6a's problem, and **caught by the refuters**. Under this ruling that collision gets one analyst and no
refuter. On this session's own evidence the downgrade would plausibly have shipped a known-false `passed`
— a client asserting a verdict it had not computed, which is the failure class this series is built to
refuse.

**Any further instance goes in this list.** The trade was priced twice by the owner and is not being
re-opened; the list exists so that when it is next reviewed, it is reviewed against evidence rather than
against recollection.

The expected consequence is a **higher defect-escape rate at the last gate before `main`**, and in this
series an escaped defect has repeatedly cost a follow-up PR. That cost lands in a different column from
the saving, which is why it is written here.

**What does NOT change.** Class floors still exist — they are simply lower. Escalation still runs upward:
a task failing two fix rounds escalates its implementer one tier, recorded. Deferral is still the answer
when the pool cannot fund the work. Direct pushes to `main` remain forbidden, every change still travels
branch → PR → controller merge, and no ruling here permits skipping a review — only running a smaller one.

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

### 12. Plan 6 Task 6's local pre-check — one false `passed` closed, and two claims on other plans

The claims machinery ships with a scope sentence: **`passed` means no rule the shared engine can
evaluate refuses this claim, AND every fact the verdict rested on came from server-served state
this client holds.** The line it holds is between `passed` and `not-evaluated` — **a pre-check may
never manufacture a pass out of absence.** Two holes in that line were found and closed; both are
recorded because Plan 10 reuses `precheckEvent` unchanged over the offline replica, where the
window is a whole offline period rather than a race.

- **The child set could not be bounded.** `getChildrenStates` answered with cached children only,
  and the parent-terminal invariant counts open children — so an unseen open child read as *no*
  open child and the pre-check announced `passed` for a move the server refuses. Closed with an
  explicit completeness vouch: absence downgrades. **The vouch has no producer yet**, so every
  accepted move into a terminal state answers `not-evaluated` in production today. Feeding it is
  **Plan 6 Task 7's** (the online `DataSource`) or the board/list reads. `TicketRead.rollup` was
  deliberately NOT used as the voucher: `rollup: null` cannot distinguish "no children" from "not
  computed", and guessing there re-opens the hole.
- **The version-chain gate guarded one end of a range.** It scanned versions between the earliest
  recorded version and the *cached* latest, assuming the cached latest was the latest. A ticket read
  after a republish names a version newer than anything cached — so **the cache held the proof a
  version was missing and the gate ignored it**. `foldStateIdForward` runs zero iterations when
  `fromVersion` exceeds `latest.version` and then merely containment-checks the id, so a state id
  resolves *cleanly* against the wrong vocabulary. Proven end to end: a server holding v1+v2 refuses
  `require-different-user`; the v1-only client answered `passed`. The same gap on the log side
  disarms four-eyes, which **skips** entries it cannot resolve rather than refusing.
  **Generalisation worth more than the fix: a gate that closes one end of a range is the shape to
  check both ends of.** Three readers missed it, including the one who had just fixed the other end.

**Two claims on other plans.**

1. **Plan 3 should export its parent-terminal refusal sentence.** The rule *id*
   `hierarchy.parent-terminal` is pinned and matches. The *sentence* does not: Plan 3 pins
   `"${parentTitle}" is finished (${stateName}). Adding live work reopens it — …` while the
   client's preview says something else. Plan 6 did not copy it — it is not exported, and
   duplicating an unlanded string is the second-definition drift this series keeps finding. Until
   Plan 3 exports a builder and Plan 6 imports it, **a user can meet two wordings for one refusal.**
2. **Plan 3's hierarchy checks will silently widen this pre-check's pass surface.**
   `precheckParentTerminal` answers `passed` for `ticket.created` / `ticket.reparented` without
   consulting the engine — true today, verified at two commits, because `evaluateEvent` passes both
   types through. The moment Plan 3 lands rank, cycle, deepest-rank and cross-project checks as
   engine cases, that `passed` violates the scope sentence above. **A canary now asserts the engine
   still has nothing to say for those two types, so Plan 3's landing breaks `app-core` loudly rather
   than quietly.** It is fed claims a real hierarchy rule would refuse, so it trips on the arrival
   of a *rule*, not of a `case` label.

   **DISCHARGED 2026-08-31 by ruling P16** (Plan 3 Chain A's rebase). The canary fired, the three
   `passed` exits became `not-evaluated`, and the canary was superseded in place. One correction to
   the sentence above, recorded so the history is not written wrong: it did **not** trip on the
   arrival of a rule. It tripped at the ticket's own type lookup, which sits ahead of every hierarchy
   rule — a `case` label routing to a rule-free body would have tripped it too.

**Also recorded, because it is a correction to this lane's own earlier framing:** "stale local state
over-refuses, and over-refusing is the safe direction" is **false**. Staleness under-refuses too —
the version-chain hole above is exactly that. After both fixes the *locally detectable* subset is
closed: every absence the cache can prove from what it holds now downgrades. What remains is
undetectable from local state — a snapshot the client believes current with nothing in hand to
contradict it — bounded by stream invalidation and disclaimed by "`passed` is not a promise of
acceptance." No client-side pre-check can do better.

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

### 8. The envelope-origin gate has landed — which doors it closes, and the one sentence Plan 10 must obey (origin micro-PR)

> **SUPERSEDED IN PART, 2026-08-31 (Plan 4 Task 5 landed).** The gate's POSITION and the two refusal
> strings below are unchanged and still binding. Its SIGNATURE is not: `checkPermission` is now
> `(env, ctx: { db, sessionUserId }) => Promise<Refusal | null>`, `SubmissionGate` is async, and
> `ingestClientBatch` takes the session as a second argument. The "server-origin refusal and nothing
> else" sentence below is now false — the gate also checks actor identity, workspace membership and
> role. What did NOT change: envelope-origin `'server'` is refused at the client door and admitted at
> the internal one, which is what Plan 10's sync route must obey.

The closer named in "A forgeable `origin`…" is **in**. `apps/server/src/permissions/check-permission.ts`
holds `checkPermission(env): Refusal | null` — the server-origin refusal and nothing else — wired inside
`commitOne` between the entity↔workspace guard and `deps.evaluate`, exactly the position the 2026-08-31
ruling names. Rule `permission.role`, reason `Only the server itself may record server-origin events.`,
character for character as Task 5's plan text pins them.

**"envelope-origin", not "HTTP Origin", and the distinction is why this entry spells it out.** The repo
now uses "origin check" for two unrelated things. This is the event envelope's `origin` field — the
provenance enum `'web' | 'mobile' | 'desktop' | 'server'`. It has nothing to do with the browser `Origin`
header, CSRF, or cross-site navigation, both of which §7 above discusses a few hundred lines earlier in
the same document. Somebody who conflates them writes a header check and believes this window is closed.

**The reconciliation, because the ruling as written would have broken the bootstrap.** The ruling says
"wired into `commitOne`", and a blanket refusal there is the obvious reading — but it is wrong, and the
wrongness is not subtle: `packages/domain/src/testing.ts` defaults envelopes to `origin: 'server'`, four
server test files call `ingestBatch` directly, and more importantly **the server's own future appends are
legitimately server-origin** — Task 5's workspace bootstrap and Task 14's invite acceptance both append
internally. T5's brief protects exactly this ("the bootstrap appends are server-origin and go through
Plan 1's internal append path, **not** through `checkPermission`"). The two are reconcilable because the
extraction source already carried the precondition: `checkRolePermission` only ever runs with a
session-bearing `PermissionContext`, i.e. only on the client path. A branch extracted out of it inherits
that precondition, and dropping it is what a blanket wiring does.

**So the distinguishing fact is not the value of `origin`; it is which door the event arrived through**,
and the door is now a named entry point rather than a route-layer `if`. `IngestService` has two:
`ingestBatch` (INTERNAL, trusted, ungated) and `ingestClientBatch` (CLIENT, gated). The gate is passed
per call into `commitOne`; the placement ruling is satisfied because the check still lives inside the
ingest transaction, which is what decision 15 requires and what lets a sync-path permission refusal
become a `claim.contested` with no extra wiring.

**Doors, stated so nobody has to infer them:**

- **CLOSED:** `POST /v1/events` — it calls `ingestClientBatch`. Verified by running the forgery through
  the assembled app, not by reading the route.
- **NOT CLOSED, by design:** direct `ingestBatch`. This is the internal append path and gating it would
  refuse the founding sequence.
- **NOT CLOSED, does not exist yet:** `POST /v1/sync` (Plan 10). **This is the durable instruction this
  entry exists to add: the sync route must call `ingestClientBatch`, not `ingestBatch`.** The document
  already settled "the gate is in the ingest path"; it did not name the wiring, and a Plan 10 author
  reaching for the obvious `ingestBatch` would reopen the window for every offline-originated event.
- **Still open, unchanged:** §11's envelope-coherence check (Plan 10 T4). Nothing binds a contest's
  embedded original event to the outer envelope. The compound defect is closed at the `origin` end only.

**What the module does NOT check, and why it says so in its own docblock rather than calling itself
partial:** actor identity (the client door carries no session yet, so `actorId` is compared to nothing —
a client may still submit a claim attributed to another person), role, membership, visibility. The ruling
asked for the checks to be named rather than the partiality labelled; a label ages into background noise
while a list of absences stays actionable. **Task 5 completes the gate** on top of this — Task 4 first,
for `resolveEffectiveRole`.

**Do not fold this into `IngestDeps.gates`** (decision 15's Plan 7 contract). Those are construction-time
and unconditional — they run for every caller — so a construction-time gate cannot tell one door from
another, which is the one thing this check must do. Tidying it there would refuse the bootstrap.

**Falsifiability, run in both directions rather than argued.** The red baseline first: at `main` =
`51aba55` the forged `claim.contested` submitted over `POST /v1/events` answered `status: 'committed'`
with one row in `events` — the window observed open, not inferred. Then two mutations. Breaking the
comparison (`=== 'server'` → `=== 'desktop'`) reddens the three refusal cases at their own assertion
lines; gating the internal door (`ingestBatch` passed `checkPermission`) reddens the internal-append case
at its own assertion. The second mutation is the one that matters: without it, a test proving only that
the refusal fires would pass equally had the legitimate path been broken.

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

**"Does it resolve" is the test that lies — and Lane 2's refinement says WHY, which matters because the
obvious test passes on everything.** The orphans are **reflog-only**: alive in the worktree that made them,
so `git cat-file -e` succeeds on all of them, and absent from a fresh clone, dying at the next `gc`. A lane
that "tested its ledger" with the obvious command gets a clean bill and is still broken. So the finding is
not *check your ledger* but **`cat-file` is the wrong question; ref-reachability is the right one** —
`git branch --contains <sha>` (empty output means orphaned), or `git merge-base --is-ancestor <sha> HEAD`
for the narrower ancestry form. Lane 2 measured **10 of 25** orphaned this way; Lane 1, **17 of 32**.
Every merged task was rebase-merged, rewriting its shas a second time.

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

**A cross-package mutation run under bare `vitest` tests the stale `dist` and proves nothing.** Lane 4's,
from T6's re-review, verified independently here. `domain`, `rule-engine` and `app-core` each export only
`./dist/index.js` — no source export — and `app-core`'s vitest config carries no source alias. So mutating
a `domain` or `rule-engine` SOURCE and running bare vitest exercises the last build, not the mutation.
Lane 4 proved it live: **25/25 green with a mutated engine source, and the same mutant killed its test
after a rebuild.**

**CI is safe and the exposure is entirely local:** `turbo.json` sets `test.dependsOn: ["^build"]` and
`ci.yml` runs `turbo build test typecheck`. `dist/` is gitignored, so the staleness exists only in a
working tree. `pnpm -r exec vitest run` shares the hole. **Rule: cross-package mutation means
`pnpm turbo run test`, or an explicit rebuild first.**

The scope is wider than the canary that found it — every cross-package assertion rides `dist`: engine-parity
previews, the envelope-door tests, the provenance planted defects against `formatIstInstant` and
`istDayBounds`. **Any lane that has mutation-tested across a package boundary with bare vitest holds
evidence worth re-running**, and a planted-defect proof is exactly the evidence that cannot be taken on
trust, since its whole purpose is to show a check can fail.

Lane 4's framing: this is the third costume of *a mutation that does not do what you think proves nothing*
— after a regex that matched a comment, and a deletion that left no marker — and the first that crosses a
package boundary.

**The general rule, Lane 1's, and it covers a case the turbo remedy does not.** Lane 1 hit the stale-`dist`
false green independently before the broadcast reached it — `task-8-report.md:139`, diagnosed from
`exports` and killed by a rebuild — and then hit a SECOND false green that no build step would have
caught: its mutation script replaced the **first** occurrence of an anchor, and `parse-event.ts` carries
two identical `const at = …` lines, so the mutant landed in the envelope branch instead of the intended
one. Fresh output, correct build, suite green, proving nothing — and reading exactly like an
unfalsifiable assertion. So the rule is not about build staleness:

> **A survivor with no explanation is either an unconstrained path or a mutation that never ran, and those
> must be distinguished before either is reported.**

Stale `dist` and a mis-anchored replace are two instances of *the mutation never ran*. There will be
others — a guard clause returning early, a mutated branch no fixture enters. **A lane following only the
turbo form will still report a mis-anchored mutant as an unfalsifiable check**, which is the more damaging
error: it condemns a check that is fine.

**The cheap corroboration that distinguishes them, also Lane 1's: every mutation you keep should produce a
failure specific enough to identify its own site.** That is what confirms the anchor landed where intended,
without inspecting each one. **A mutation whose failure could have come from anywhere has not proven its
anchor.**

**Never run a state-changing git command in a shell whose working directory was set for a read — and this
is a gap neither worktree rule covers.** Controller incident, 2026-08-31: verifying Lane 1's orphaned-sha
claim required `cd` into its worktree; the next command in the same shell was a `git checkout` of the
controller's own branch, which swapped Lane 1's working tree out from under a live task. Reflog-measured
window: **26 seconds** (13:24:42 to 13:25:08). Restored, and verified by both parties independently —
branch, HEAD `11f1fb3`, 19 ahead, tree clean, fixtures 84/84, nothing uncommitted lost.

The cwd was correct for the read and wrong for everything after it, and nothing announced the difference.
Use `git -C <path>` for inspection; never a bare `checkout` after a `cd` made for another purpose.

**Why the existing rules would not have caught it.** Lane 4's rule covers agents *inside* one fan-out
sharing a tree; the per-agent isolation remedy covers mutating reviewers. **This came from outside the
fan-out entirely — a peer with filesystem access to a lane it does not own.** Per-agent isolation would
not have prevented it, because the controller was not one of the agents. Lane 1's framing, and it is the
gap this rule closes.

**Corollary from the same incident, Lane 1's: during an active mutation review, "tree clean" is a RACING
check.** Its answer depends on where in the reviewer's cycle it lands. Lane 1 caught a transient
` M checks/hierarchy.ts` and briefly read it as controller damage; it was its own reviewer mid-mutation.
Anyone verifying a lane's state while a mutation review runs will otherwise diagnose contamination that is
not there, or miss contamination that is. **And a contaminated review input is repaired by re-verification
at the same tier, not by discarding the review** — which would be thinning a gate to fix someone else's
mistake.

**One more of the controller's own, recorded because it is the fifth today.** The incident report said the
window was "roughly two minutes." It was 26 seconds, and Lane 1 measured it from the reflog because the
controller had estimated rather than checked. An error report is a claim like any other and inherits every
rule above it.

**A sixth silent-empty mode, found inside the verification itself.** Lane 2's first check reported
`tested=1 resolve=0 dead=1` — zsh does not word-split an unquoted parameter, so it tested the entire sha
list as a single token. It was caught only because the count was printed beside the result. **That is the
positive-control rule catching a failure in the checking rather than in the tooling**, which is the case
the rule was least obviously written for and most needed in.

**The general form, which is the reason this is recorded above the instrument rules rather than beside
them: durable state that nobody has tested is not durable state.** All three lanes with ledgers asserted
the property. Both that then tested it found it false. Lane 2's assertion was the load-bearing one — it
was made in the same message that declined a `/clear`, so it was offered as grounds for someone else's
decision, and it had not been run. The
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


### Verification-method rules (2026-09-06, serial executor) — two more, both found by their own author failing them

Added on the controller's instruction, so they live in the authority rather than only in a handoff. **Both
were caught in one session, and in both cases the CONCLUSION was right while the EVIDENCE was worthless** —
which is the shape worth recognising, because a right answer arriving by a broken route feels exactly like a
right answer.

**5. `git diff | grep "^+"` IS ALWAYS EMPTY UNDER THE rtk PROXY, and a control that does not travel the same
path certifies nothing.** The proxy reformats `git diff` into a `--stat` header, a `--- Changes ---` banner,
and hunk lines **indented two spaces**, so an added line arrives as `␣␣+␣␣/**`. Measured: **`git diff | grep -c
"^+"` → `0`** against a **31 KB** diff carrying **294 additions**. It underwrote three separate "comments only"
and "branch is subsumed" claims in one session, **one of them inside an already-merged PR**; all three were
re-checked and all three held, but none had been established. The third is the sharpest: *"`exec/50` is
subsumed — zero `+` lines"* — **there were nine**, and `--stat` printed *"9 insertions"* directly beside the
grep that said zero, a contradiction sitting in the same output and read by nobody.
> **The rule this earns: a positive control must run through the SAME PATH as the measurement.** The control
> used here fed a non-comment line through the filter with `printf`, watched it come back, and proved only
> that the surviving stage worked — the corruption was upstream, in a stage the control never entered.
> "A control was printed" is not a property of a run; "the control traversed the same path" is.
**Use instead:** `git show <sha>:<file>` against the other version through Python `difflib`, **asserting the
added-line count equals `git diff --numstat` before believing anything else it reports.** `--numstat` is safe
on its own; it is not line-prefix parsing. **What actually exposed it** was an *impossible* answer to an
unrelated second question — "no numeric tokens at all in the added lines", about docblocks reading `9.36 —`.
**A null is deniable; an impossibility is not.** Where you can, ask the same pipeline something whose answer
you already know to be non-empty, in the same invocation.

**6. COMMIT FIRST, THEN MUTATE — `git checkout -- <file>` restores from HEAD, not from the pre-mutation working
tree.** Mutation-testing a citation on **uncommitted** work and restoring that way reverted the file wholesale
and **destroyed sixteen citations** that had not been committed yet (§09 fell `211 cited / 8 uncited` →
`195 / 24`). The same command had been correct twice earlier the same day **because those mutations ran against
committed work, so HEAD was the right restore point** — same command, different precondition, nothing in its
appearance to tell the two cases apart. **A procedure that is correct only because of an unstated precondition
breaks the first time that precondition quietly changes.** If uncommitted work must be mutated, copy the file
aside and restore from the copy.
> **And the half that generalises furthest: the restoration check SHOWED the damage and the author did not act
> on it.** The standing rule says verify a restoration by reading the file — the read was done, and returned
> `expect(ghost.statusCode).toBe(404);` where a docblock belonged. What caught the loss was the citation **count**
> returning 195/24 against an expected 211/8. **Reading evidence is not checking it.** A verification step only
> works when you know what the output MUST say before you look: the count had a prediction attached to it, the
> line read was only an observation, and an observation cannot be contradicted.
**Why recovery was cheap:** the damage was bounded to ids **9.192–9.207**, sixteen contiguous ids the catalogue
assigns to that one file, mapping 1:1 in order onto its sixteen tests. **A catalogue that records which test
covers which case is also a backup of work derived from it** — an argument for the citation convention that has
nothing to do with the convention's stated purpose.


### Verification-method rule 9 (2026-09-07, serial executor) — an extractor that reads the WRONG SHAPE of the source produces a well-formed count about something else, four times in one session

The citation backfill needed to know which catalogue rows name a covering test. A private extractor answered
that question **four times, wrongly, in four different ways** — and each wrong answer was reported to the
controller as fact before it was checked.

| # | what the extractor assumed | what the catalogue does | rows hidden |
|---|---|---|---|
| 1 | ids look like `- 7.5 ✅` | §13 also uses **marker-first** `- ✅ **13.9 — …**` | 27 in §13 |
| 2 | ids are single tokens | §03 uses **ranges**: `- **3.89–3.94** ✅` | 50 in §03 |
| 3 | a row is ONE LINE | rows **WRAP**, and the file is often on the continuation line | **46 in §13** |
| 4 | a path ends at `.ts` | paths carry **line numbers**: `` `contest-events.test.ts:45` `` | 23 in §12 |

*(A fifth shape — the file named once in a **block header** rather than per row — hid all 36 of §07's remainder.)*

**Every one produced a well-formed number.** None errored. Two of them were reported as "these rows are a
reading job, not transcription" — a claim that would have written off ~120 mechanically citable rows.

> **The rule: a count is a claim about the SHAPE of the source, not only about its content.** Before believing an
> extractor, check it against an authority that reads the source independently — here `pnpm check:citations`,
> whose totals caught defects 1 and 2 — and **when no authority exists for the sub-question you are asking
> (which rows NAME a file), go and read the raw text.**

**What actually found each one, and it was never more counting.** Defect 3 surfaced only because the executor
**stopped citing and went to characterise what the "reader job" rows were** — reading six of them verbatim, and
noticing one ended mid-sentence at *"each refused by name when"*. **A truncated sentence is a shape error you
can SEE; a wrong total is not.** Prefer, at least once per instrument, reading a handful of raw records beside
the number the instrument gives for them.

**TWO MORE OF THE SAME CLASS, found after this rule was first written — the shape error is not confined to parsing.**

**6. The GROUPING step, not the parser.** Candidates were clustered with `'invites.test.ts' in row`, which
substring-matches **`proj-invites.test.ts`** and **`packages/domain/test/events/invites.test.ts`** as well. Three
different files were collapsed into one cluster, so six rows appeared not to match the tests being read — and
were written off as "each would have been a guess" — when they simply belonged to two other files. **A
well-formed set that is about something slightly different from the question asked.** Resolve names to REAL
paths before grouping by them; a substring is not an identity.

**7. A POSITIONAL reference that was true when measured and false when used.** An inserter refused to write a
docblock at `events-route.test.ts:79` because that line was no longer an `it(` — an earlier docblock in the same
file had shifted every line below it. **The assertion turned a would-be misplaced citation into a stopped run.**
Line numbers gathered before an edit are stale after it; re-read them, or assert on the content at the line.

**And a habit worth naming, because it cost more than any single defect.** Rows were deferred as "ambiguous" or
"undecidable" eleven times. On re-examination **almost none were**: five lived in a file their candidate list did
not point at, three were simply further down a file whose head had been skimmed, and two were RECORDS rather than
assertions — which is a decision about the convention, not an ambiguity in the source. **"I have not decided" and
"this is undecidable" are different claims, and the first was repeatedly reported as the second.** Deferring
remained the right call each time — the alternative was citing on a filename rather than on a read — but the
deferrals were far cheaper to resolve than they looked, and should be revisited rather than accumulated.

*(A record CAN be cited, incidentally: its ✅ means the work was done and verified, so citing it beside the suite
it describes points a reader at where it applies. Say in the docblock that it is a record. Pretending it is an
assertion is dishonest; leaving it uncited forever because it is not one is merely incomplete.)*

**Corollary already in this document's spirit:** the totals agreed with the checker at every point after defects
1 and 2 were fixed, because the checker counts ✅ ids — it has no opinion on which rows name a file. **An
authority validates only the question it answers.** Agreement with it on totals said nothing about the
sub-question, and that false comfort is what let defects 3 and 4 survive two more reports.

**8. AN EIGHTH SHAPE, and this one was not an extractor at all — it was a HAND-TYPED LIST beside a table
derived from a different measurement.** (2026-09-07, the `exec/65` rebuild.)

A restart brief instructed a rebuild by cherry-pick and enumerated the commits to pick: **4 for one branch,
16 for the other, 20 in total. The branch held 23 content commits.** The three omitted were `52a68d6` (§04
opened, 45 → 39), `f717189` (§07 driven to ONE uncited) and `45f52fd` (the reader-job correction, which also
carried rule 9's own record into this document).

**The brief's summary table, printed directly above the lists, asserted §07 = 1 uncited — a state unreachable
without `f717189`.** The document therefore contradicted itself across four lines, and a restarted executor
following it faithfully would have produced a branch whose numbers disagreed with the table it was working
from, most likely discovering this only at the gate, or not at all: dropping `52a68d6` breaks §04's later
batches by replaying them onto a baseline that never reached 39, which surfaces as a *conflict*, not as a
missing commit.

**Why it belongs to rule 9 rather than to carelessness.** The list and the table answered different questions
— *"which commits do I replay"* versus *"where did each section end up"* — and were produced by different
means, one by hand and one by measurement. **A count is a claim about the shape of a source; a hand-typed
list is a claim about a set, and neither validates the other.** Sixteen of the twenty entries were right,
which is precisely the condition rule 4 names: *a decomposition that reconciles almost everywhere reads as
verified, and the wrong entry hides inside the right ones.*

**The fix, and it is mechanical:** never type a commit list beside a table you measured. Generate it from the
same tree you are reporting —

```
git log --reverse --format='%h|%s' <base>..<branch>   # then classify each by files-touched
```

— which is how the 23 were found, and which also settles the content-versus-handoff classification that a
hand list has to assert without evidence.

**And the same defect had a sibling in the same brief.** It recorded *"Verified safe: `engine-context.test.ts`
— 40+ lines apart, clean merge"*. That was true, and it covered **one of the three** test files in the actual
collision surface. Computing the surface properly — intersecting `git diff --name-only $MB main` with
`git diff --name-only $MB branch` — showed `projection-order.test.ts`, where **both sides insert at the same
line**, and `verify-projections.test.ts`, where they insert one line apart. Both were real conflicts; neither
was mentioned. **Verifying the instance you happened to think of, then generalising to the class, is how the
other two stayed invisible.** Two commands size the surface, and they cost nothing next to discovering a
conflict twelve picks into a sequence.

### The six `helpers/seed.ts` borderline rows, SETTLED (2026-09-07, serial executor)

Lane A classified seven borderline rows at 2026-09-06 17:35 (`eac1caa`) and the number went 23 → 29 → 21
along the way, so each classification was **re-measured here rather than adopted**. All seven hold. What
follows is the measurement, because a classification without one is the thing this series keeps paying for.

| row | A's call | measured here | settled as |
|---|---|---|---|
| `apps/server/test/helpers/seed.ts` — `applyAll` | not a witness item; applies 4 of 12 | **CONFIRMED: exactly four** — `projProjects`, `memberships`, `projInvites`, `projVisibility` | **Recorded, not fixed.** A dedicated cleanup; ~20 files share the helper |
| `apps/server/test/helpers/seed.ts` — `insertTicketHead` | addressable, but the producer is the REDUCER, not a route | CONFIRMED — it writes `transitions`/`fields` the real fold computes | **Recorded, not fixed.** Different witness shape, high blast radius |
| `app-core/test/helpers/seed.ts` — `WF_ERRAND` | not addressable; real problem is the non-ULID `id` | **CONFIRMED, and stronger than stated** — see below | **SCOPE CALL, raised** |
| `app-core/test/helpers/seed.ts` — `ticketStateSeed` | same, domain-owned | CONFIRMED; also carries `actorId: 'user_anselma'`, and the envelope types `actorId` as `ulidString` | **SCOPE CALL, same one** |
| `fake-data-source.ts` — `ingest()` default | DISCHARGED by 7.226/7.234 | **CONFIRMED** — both exist in `fixture-witnesses.test.ts`: 7.226 over a real COMMITTED response, 7.234 over a real RULE REFUSAL | **Closed** |
| `fake-data-source.ts` — `pushStreamItem` | needs a real hub and socket peer | CONFIRMED | **Not this lane's surface** |
| `flows/guarded-child-event.test.ts` — three builders | addressable, promoted | CONFIRMED | **Belongs to A's witness cluster** |

**The realism finding is real, and larger than "a non-ULID".** `workflowDefSchema.id` is only
`z.string().min(1)`, so the DEF type admits `wf-errand` — but a `workflow.defined` event carries
`entity: { kind: 'workflow', id }`, and the envelope tests `ULID_REGEX` on `entity.id` for every
non-membership kind. Measured: `ULID_REGEX.test('wf-errand')` is **false**, as is
`ULID_REGEX.test('user_anselma')`, while a real ULID passes. **So no `workflow.defined` naming
`wf-errand` can exist, and these fixtures model a state production refuses at the door.**

**Not fixed here, on purpose.** `wf-errand` appears **139 times across 23 files** — 133 in tests, and the
4 in `src` are inside a docblock quoting a different string (`wf-errands`), so no production code depends
on it. A 133-occurrence rename across ~20 test files, many of which assert on the literal, is not a
smallest-correct-change and several of those assertions would have to be re-reasoned rather than
substituted. **Owner: the controller/owner to schedule as its own item.** Raised as a scope call rather
than taken, per the standing instruction to ask when a change reaches shared test infrastructure.

### SCHEDULED FOLLOW-UP (owner ruling 2026-09-07): the `wf-errand` fixture-realism rename

**Its own branch and PR, careful per-assertion review, deliberately NOT folded into a sweep.** The owner
scheduled this rather than taking it, after the measurement below was raised as a scope call. It is
recorded here in full so nobody has to re-derive it.

**The defect.** `workflowDefSchema.id` is only `z.string().min(1)`, so the DEF type admits `wf-errand`.
But a `workflow.defined` event carries `entity: { kind: 'workflow', id }`, and the envelope tests
`ULID_REGEX` on `entity.id` for every non-membership kind. **Measured:** `ULID_REGEX.test('wf-errand')` is
`false`, `ULID_REGEX.test('user_anselma')` is `false`, a real ULID passes. `actorId` is typed `ulidString`
outright. **So no `workflow.defined` naming `wf-errand` can exist, and the fixtures carrying it model a
state production refuses at the door.**

**The size, measured rather than estimated.** `wf-errand` appears **139 times across 23 files**. **133 are
in tests.** The **4 in `src` are inside a docblock quoting a different string (`wf-errands`)**, so
**nothing in production depends on it** — this is a test-fixture change end to end.

**Why it is not mechanical.** Many of the 133 are assertions ON the literal. Substituting a ULID
everywhere would leave assertions that still pass while asserting something weaker or different, which is
the failure this repo keeps finding. Each site needs reading, not replacing.

**Where to start:** `packages/app-core/test/helpers/seed.ts` (`WF_ERRAND`, `ticketStateSeed`) is the
origin; the other files consume it. `user_anselma` and any other non-ULID actor id belong to the same
item.

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

---

---

## Ruling P13 (2026-08-28, controller) — a refusal id is correct for the SUBJECT it was written about, and this plan borrowed one three times

Raised by Plan 3's Task 6 during execution, ruled before review because it is a correctness concern.

**The ruling.** `checkTicketWorkflowRebound` must not refuse an undefined **target** workflow with
`ticket.workflow-undefined`. That reason — *"This ticket type's workflow has not been defined yet, so the
ticket would have no status."* — makes the ticket TYPE's binding its subject. On a migration the type's
binding may be perfectly well defined and is beside the point; what is missing is the workflow the
**payload** names. The sentence is false on the path, and it sends an admin to inspect a thing that is
not broken. The branch now raises **`ticket.rebound-unknown-workflow`**, joining
`ticket.rebound-same-workflow` and `ticket.rebound-unknown-state`, with the target workflow as its
subject and two remedies an admin can take alone (a rebound is already in Plan 4's `ADMIN_ONLY_TYPES`).

**Three authorities said otherwise and are overruled, on a distinction worth keeping.** Plan 3's canonical
refusal table (line 77), its own body (line 2221) and its case 5.34 all specify `ticket.workflow-undefined`
here. The **id is not wrong** — it is exactly right on `ticket.created`, where a ticket has no workflow
except the one its type names. What is wrong is its **application** to a neighbouring path, precisely as
the table's `ticket.unknown-type` was right until Task 5's brief pointed it at a *parent's* type. The plan
is the argument; the spec is the authority (invariant 2, and this document's own line 204: *"a refusal that
happens to fire for the wrong reason is not coverage"*).

**The citation objection dissolved on inspection, and inspecting it is the transferable part.** The
implementer declined to mint an id partly because case 5.34 looked externally cited. It is not: 5.34 is
referenced only inside `2026-08-20-03-tickets-hierarchy.md:5046`. The externally-cited ids are **5.27 and
5.30** (Plan 5, `2026-08-20-05-api-realtime-search.md:6158`) and **5.36** (this document, line 303). So the
number stays and its description changes; nothing outside Plan 3 moves. **Check which ids are actually cited
before treating a catalogue number as immovable** — the never-renumber rule protects three ids in this
section, not all thirty-three.

**The pattern, stated because it is now three-for-three in one plan and the lanes still transcribing plan
text will meet it again.** P11 (a parent's undefined type answered with the *ticket's* unknown-type
sentence), P12 (a foreign-workspace parent answered with a sentence about *projects*), and now P13 (a
missing target workflow answered with a sentence about the *type's binding*) are one defect wearing three
costumes:

> **A refusal id carries a subject, and the subject is part of the copy.** Reusing an id for a
> structurally similar check on a neighbouring path silently inherits a sentence that is true of something
> and false of the path that reached it. The reader is told a fact about the wrong noun and sent to fix
> the one thing that was never the problem.

The tell is cheap and mechanical: **read the reason aloud at the line that raises it, and name the noun it
is about.** If that noun is not what the check just failed to resolve, the id is borrowed. All three
instances in this plan were visible that way, and all three shipped in plan text that read authoritative.

**Two findings from the same task, recorded so they are not rediscovered.**

- **Fixture-count arithmetic: the directory, never the plan.** Pre-flight ruling 6 tracked `61 → 63 after
  T6`; it assumed Task 4b would add no fixture, and Task 4b added one. The base at Task 6's dispatch was
  **62**, so the correct running total is **62 → 64 after T6**. The count-from-the-directory rule is what
  caught it — an absolute number copied from the plan would have shipped wrong and failed the gate in
  whichever lane merged second.
- **A dispatch nobody tested.** Every Plan 3 check test called its function directly, so deleting a `case`
  from `packages/rule-engine/src/evaluate.ts` left a fully mutation-proven, **unreachable** check while
  `evaluateEvent`'s pass-through default accepted every reparent and every same-workflow rebind. Task 6
  added **two** assertions that enter at `evaluateEvent` — `ticket.reparented` in `test/reparent.test.ts`
  and `ticket.workflow_rebound` in `test/workflow-rebind.test.ts` — plus two `ticket-type.defined`
  fixtures, which enter there too because `test/fixtures.test.ts:19` is `evaluateEvent(...)`.
  *(Corrected by Task 7, which counted the shipped files. The earlier "three" conflated the two unit
  assertions with the fixture-carried third; `test/ticket-type.test.ts` had no `evaluateEvent` entry of
  its own, so `ticket-type.defined`'s routing rested entirely in another file and a task relocating those
  two fixtures would have silently reopened the gap. Task 7 added that third describe and a fourth for
  `ticket.field_set`, so the sentence is now true of the repo as well as of the intent.)*
  **Task 7 appended to the same switch and inherited the obligation.** The shape generalises: a lane can
  prove every branch of a check falsifiable and still never touch the one line that decides whether the
  check runs — and a dispatch pinned only from another file is one relocation away from unpinned.

---

## Ruling P14 (2026-08-31, controller) — an actor-supplied id resolved with no workspace predicate, and this one is ACCEPTED rather than mislabelled

Found by Plan 3 Task 6's review; **recorded here by Task 7**, the next change set, rather than at plan end —
this series has lost rulings twice to a gitignored ledger. **Task 7 does not implement it. Task 12 does.**

**P12 closed a tenancy hole on the parent. The same hole is open on the target workflow, and there it admits
a write.** `packages/rule-engine/src/checks/workflow-rebind.ts:87` calls `ctx.getWorkflowDef(p.toWorkflowId)`
on an id the ACTOR supplied, and there is no workspace predicate anywhere on the server path:

- `apps/server/migrations/1787896601515_proj-workflows.sql:4-13` — `workspace_id` is a plain column; the PK
  is `(workflow_id, version)`, global.
- `apps/server/src/projections/workflows.ts:80-83` — `WHERE workflow_id = $1 ORDER BY version DESC LIMIT 1`.
  No tenancy filter in any of the three selector branches.
- `apps/server/src/engine-context.ts:92` — passes straight through.

So a foreign workflow id RESOLVES, the target-state check runs against another workspace's state graph, and
the event is accepted: a live ticket bound to a workflow its workspace cannot see, standing in one of that
workflow's states. `ticket.workflow_rebound` is the first check in this plan where an actor-supplied id is
resolved directly — creation reads the type's binding, a transition reads the ticket's own — which is why
the class did not appear until now. P12's own shipped comment indicts it verbatim once the noun is
substituted (`checks/hierarchy.ts:242-244`): *"The ingest door's tenancy check does not cover this: it
guards the event's own entity, never the parent the payload names."*

**Severity, against the two rulings it extends.** P11 told the actor a false sentence. P12 mislabelled a
refusal and confirmed that an id exists somewhere they cannot see. **P14 admits the write** — the worst of
the three, and a boundary the spec makes explicit (§6: *"Enforcement is server-side on every read and every
sync-down"*).

**Latent today, live in one specific commit.** `apps/server/src/engine-context.ts:74-76` returns null for
every kind outside `KINDS_WHOSE_STATE_IS_ONLY_IDENTITY`, `'ticket'` among them, so `ticket.unknown` fires
first at `workflow-rebind.ts:64` and the workflow lookup is never reached on the server. (Addendum 10 cited
`:76-78` for this; the branch is at `:74-76` in the shipped file — checked, not inherited.) **It goes live in the same commit Task 12 lands** — the same commit
Addendum 9 already flags for the `rowToTicketState` `workspaceId` trap, where a missing field refuses every
parented `ticket.created`. Two independent tenancy hazards converge there; Task 12 meets both or neither.

**The ruling: close it fail-closed, in Task 12.** The conservative option under the autonomous protocol is
to refuse. The DESIGN is Task 12's — either a workspace predicate on the `EngineContext` lookups at all
three implementations, or an equivalent that keeps the comparison inside the check — because Task 12 is
what backs those lookups with real projections. **No unit test can pin the fix:** `buildMemoryContext` has
no workspace notion for workflows at all, so the test home is Task 12's `apps/server/test/engine-context.test.ts`
suite. Cost if wrong: a workspace predicate on a lookup that is already per-workspace in every legitimate
call.

**The class extends one step further, and Task 12 owns that end too.** `getTicketTypeDef(ctx, p.typeId)` on
the create path (`checks/hierarchy.ts:84`) has the identical shape the moment Task 12 backs it with
`proj_ticket_types` — a type id the actor supplies, resolved with no tenancy filter. Addendum 9a recorded
the *own-entity* sibling of P12 (`hierarchy.ts:82`, `ticket.already-exists`) and ruled it non-blocking
because both real consumers are workspace-scoped before the engine; the **actor-supplied-id** siblings were
not considered then. They are this ruling.

**The transferable tell, alongside P11–P13's.** Those three ask *"read the reason aloud — is its noun what
the check just failed to resolve?"* This one asks a different question of the same line: **whose id is
this?** An id the ACTOR chose, resolved through a lookup with no tenancy predicate, is a tenancy hole
whatever the answer looks like — and it is worst where the lookup succeeding leads to an ACCEPT rather than
to a refusal, because nothing downstream will ever mention it.

---

## A mutation that crosses a package boundary is inert until the package is rebuilt (2026-08-31, Lane 1 Task 8)

**Found by a mutation that reported the wrong answer, and would have been reported as a finding.** Plan 3's
end-to-end fixture for the whitespace-title refusal was mutated by deleting the refine on
`ticketCreatedPayload.title` (`packages/domain/src/events/ticket-events.ts`) and rerunning
`packages/rule-engine`'s fixture suite. Every fixture stayed green. Under the standing discipline — *if no
mutation can make a fixture fail, report it, do not ship it* — that reads as a fixture that agrees without
constraining, and the honest thing to do would have been to report it as such.

It was the mutation that was wrong. `@gisik-nokma/domain`'s `exports` map points at `./dist/index.js`
(`packages/domain/package.json`), so every package that imports it by name reads BUILT OUTPUT, not source.
A rule-engine test therefore cannot see an unbuilt change to a domain source file at all. Rebuilding the
domain package and rerunning turned the same mutation red immediately, at the fixture's own expected
outcome — the candidate is ACCEPTED once the refine is gone, which is precisely the proof the fixture exists
to give.

**Binding on every task that mutates across a package boundary**, which is most of the remaining lane:
`packages/domain` is mutated by tasks whose tests live in `packages/rule-engine` and `apps/server`, and the
same asymmetry holds for `packages/rule-engine` read from `apps/server`.

- **A same-package mutation needs no rebuild** — vitest compiles the package's own sources, and a relative
  `../src/x.js` import sees the edit. Every mutation inside `packages/rule-engine/src` proven by this task
  behaved correctly without one.
- **A cross-package mutation needs `pnpm --filter <pkg> run build` before the run, and again after the
  restore.** Skipping the second rebuild leaves a mutated `dist/` standing behind a clean `git status`,
  which is worse than the first error: the tree reads restored and the next suite runs against the mutant.
- **The tell is a survivor with no explanation.** A mutation that deletes a check and changes nothing is
  either a genuinely unconstrained path or a mutation that never arrived. Distinguish them before
  reporting: assert the mutation is live (read the built file, or watch the mutated package's OWN suite go
  red) and only then call the surviving fixture unfalsifiable.

This is the same shape as the verification-method rules above — a method that produces a confident wrong
answer, silently. It differs from them in one respect worth naming: the wrong answer here is
*conservative-looking*. It reports a weakness that does not exist, so it would have been believed.

### Fixture count on Lane 1 at Task 8, counted (Ruling P6)

`packages/rule-engine/fixtures/` held **70** `.json` files before this task and holds **84** after, a delta
of **+14** — the thirteen the plan text specifies plus one closing Ruling P15's end-to-end residual. Both
numbers were counted from the directory rather than derived from a tracker, with no `MERGE_HEAD`,
`rebase-apply`, `rebase-merge` or `CHERRY_PICK_HEAD` present, so no operation was in flight — which is the
rider's actual requirement, and not the same as a clean tree, which the count could not have had because
the fixtures being counted were the uncommitted objects; the gate at
`packages/rule-engine/test/fixtures.test.ts` moved in the same commit as the fixtures.
Lane 4's cross-lane merge resolves against whatever each lane counted at its own commit, per pre-ruling 6.

**Task 14 inherits two facts from this, and one instruction.** The fourteen fixtures are catalogued in
`Features.md` §5 but **claim no new test-case ids**: thirteen of them prove scenarios Plan 3's own document
already reserves inside 5.4–5.36, so Task 14 cites the fixture filenames from those ids rather than
minting a second set of numbers for the same behaviour. Only the three things no plan document anticipated
— the harness/domain presence audit, the fold extension, and Ruling P15's end-to-end proof — take new ids,
at 5.51–5.53. New cases beyond those continue from 5.54.

### The fixture prior-event dialect changed shape, and later fixture authors inherit it

Any task or lane that writes a fixture with a `ticket.created` prior must now spell `typeId`, `projectId`,
`parentId` and `title` — required, with `parentId` required-and-nullable, mirroring `ticketCreatedPayload`'s
PRESENCE while keeping the loose string FORMAT that lets `t1` and `prj_1` work (Ruling P10). The fold no
longer answers `prj_1`/`task` from constants, and it records the title as a field claim exactly as
`applyTicketEvent` does — which is what makes the parent-terminal refusals quote a title rather than a raw
ticket id. `workflowId` stays a harness-only affordance and stays required: this dialect binds a workflow
directly because no ticket-type projection stands behind it, and the fold deliberately does NOT throw on a
`typeId` no `ticket-type.defined` declared, so a fixture about transitions need not invent a type ladder.

## Ruling P16 (2026-08-31, serial executor) — a fourth context method answered by a store that has none, and a `passed` its own landing falsified

Plan 3 Chain A's rebase onto `main` merged **textually clean and semantically broken**, which is the
collision this document predicted for Phase 0 ("the collisions appear only once one lands and the others
rebase"). Two things had to be true at once and could not be: ruling P3 made `getTicketTypeDef` a REQUIRED
fourth `EngineContext` method, and `main` had independently landed `packages/app-core/src/precheck.ts`
(Plan 6a T6, `3fb22d3`) whose exported `contextFromCache` builds a THREE-method context. `tsc` caught the
arity. Nothing caught the rest, and the rest is the ruling.

### The method answers by THROWING, and the taxonomy already said so

The monorepo has four `getTicketTypeDef` implementations and they already encode a rule, which was
extracted and quoted rather than invented. **`null` is licensed only where "this workspace has no such
type" is a TRUE statement about the store's own world**: the fixture harness earned its `null` by folding
`ticket-type.defined` into a real map, `memory-context.ts` answers over its reducer-built map, and
`apps/server/src/engine-context.ts` answers `null` because `proj_ticket_types` genuinely holds nothing
today. **A throw is the answer where the context has no store at all** — where the absence is in the
wiring, not in the world. Both throw sites say why in the same words, and the harness's own retired throw
put it best: *"answering `null` would have made the check refuse for a reason that reads entirely
legitimate. The throw was the placeholder telling the truth."*

`ClientStateCache` has no ticket-type store whatsoever. So `null` there is not a claim about the
workspace, it is "I do not hold it" — which this cache spells `undefined` everywhere else, and which
`precheckEvent` turns into `not-evaluated`. Answering `null` would let the engine convert that absence
into `ticket.unknown-type`: **a refusal manufactured out of absence**, the exact mirror of the `passed`
that module's whole invariant forbids, and a violation of its own definition of `refused` ("the facts it
read were server-served state this client holds").

**The server's counter-example does not transfer**, and this was verified rather than assumed. That
context answers `null` *because it is live and a throw would turn an ingest into a 500*. No live client
path can reach this one: `precheckEvent` routes only `ticket.transitioned` to the engine, and
`getTicketTypeDef` is reached only from `checks/hierarchy.ts` (four sites) and `checks/fields.ts:145` —
that is, only from `ticket.created`, `ticket.reparented` and `ticket.field_set`. **Correction to a claim
made three times during the analysis: `checkTicketWorkflowRebound` does NOT call `getTicketTypeDef`.**

### The forced half nobody would have found from the build error: `passed` had to go

`precheckParentTerminal` answered `passed` for `ticket.created` / `ticket.reparented` without consulting
the engine. **§12 claim 2 pre-ruled this exact moment**: *"The moment Plan 3 lands rank, cycle,
deepest-rank and cross-project checks as engine cases, that `passed` violates the scope sentence above."*
It landed. The code confirms it independently and more sharply than the claim did: `checks/hierarchy.ts:84`
resolves the ticket's **own** type ahead of every branch *including the no-parent branch at `:90`*, and
`:108` then refuses `hierarchy.deepest-rank-parent-required` off `type.rank`. So the unconditional
`passed` for a parentless create was not merely unproven — it was **false for every type at or below the
deepest rank**.

All three `passed` exits become `not-evaluated`. This needed **none** of the three genuinely-deferred
absences: it is three return statements in a file the PR could not compile without touching. Scoping it
out would have shipped a known-false answer to a user. **The `hierarchy.parent-terminal` refusal STAYS** —
it reads only cached, server-served `stateCategory`, so it satisfies the `refused` clause, and its failure
direction is over-refusal on an advisory surface, which the module already tolerates and names.

### The canary fired, and the honest mechanism is not the designed one

`precheck.test.ts`'s canary — Lane 4's tripwire for precisely this landing — went red. It is **superseded
in place**: not deleted (that removes the tripwire) and not greened (that leaves a green suite over
violated semantics). Recorded because writing the designed mechanism as history would be false: **it did
not trip on a hierarchy RULE refusing a planted claim.** It trips at the ticket's own type lookup, which
sits ahead of every hierarchy rule — so a case label routing to a rule-free body would have tripped it
too. The successor says so, and is pinned in both directions: remove the dispatcher cases and no rejection
is thrown; answer `null` instead of throwing and the engine refuses rather than rejects. Both go red.
Verified by mutation, not by reasoning — reverting the throw to `null` turns it red at its own site with
`rule: "ticket.unknown-type"`.

**§12 claim 2 is DISCHARGED by this ruling.** §12 claim 1 (the two wordings for `hierarchy.parent-terminal`,
`parentTerminalRefusal` unexported) stays **OPEN** — owner Plan 3 Chain B for the export, Plan 6 for the
import.

### Recorded with named owners, deliberately NOT fixed here

- **A ticket-type store on `ClientStateCache`** — owner **Plan 6a**. It must land with a completeness
  notion in the `markChildrenComplete` mould: a partially-fed type store answering `null` reproduces this
  same absence-becomes-a-verdict hole in a new place.
- **The producer feeding it** — owner **Plan 6 Task 7**, over Plan 5's ticket-types read. The identical
  unfilled-producer position §12 already records for the child-set vouch.
- **Routing `precheckParentTerminal` through the engine** — owner **Plan 6 Task 7**, BLOCKED on both of
  the above; routing before them refuses `ticket.unknown-type` on every create. That change set replaces
  the re-aimed canary a second time.
- **THE INTERIM GAP THIS OPENS, stated plainly:** between this merge and that routing, creates and
  reparents lose their accept preview entirely — only the parent-terminal refusal survives. That is a real
  regression on the surface `app-core` exists to provide. The direction is deferral to the server, never a
  bypassed guard.
- **Preview value recoverable without the cache growing types**, surfaced here and deliberately not built:
  `hierarchy.cross-project` is decidable from cached `parent.projectId`, and the self-parent
  `hierarchy.cycle` from the payload alone. Owner: Plan 6 Task 7, same change set.
- **Plan 10 reuses `precheckEvent` unchanged over its offline replica**, whose store also holds no
  ticket-type definitions, and inherits both the throw and the hierarchy deferral. It must meet them as a
  recorded decision rather than as a crash. Owner: Plan 10's replica `DataSource` task.
- **`apps/server/src/engine-context.ts:94` stays `null`** — owner Plan 3 Chain B Task 12, already bound at
  the site. Cross-reference only; do not partially wire it while fixing `app-core`.

### One stale comment repaired in passing, because this branch's own work falsified it

`packages/rule-engine/test/fields.test.ts` stated that the fixture harness's `getTicketTypeDef` "THROWS by
design". **Task 8 on this same branch changed it to answer `null`.** The conclusion it supports still
holds; its reason did not. A claim made false by one's own landing is inside scope — it is the defect
class this branch has now caught six times, and it does not get an exemption for sitting in a test file.

## Task 8's re-review, run because its first one was contaminated (2026-08-31, serial executor)

`docs/plan-3-chain-b-handoff.md` recorded that T8's task review ran while a sibling controller had this
worktree checked out to another branch for 26 seconds, and instructed a re-verification or a re-run. The
dispatch brief for the serial executor described Chain A as "complete and reviewed clean", which the
document contradicts; **the document wins, and this is the re-run**, against the rebased tree — which is
also the tree that merges. Three lenses, six raw findings, one refuted, five upheld by `fable` refuters.

### Fixed here

**`reparent-legal-grandchild-up.json` claimed a property its staging did not have** — the third instance
of this branch's own recurring class, a sentence beside the code that the code contradicts. Its note said
"a real three-deep chain, so the ancestor walk actually walks". The walk starts at the NEW PARENT, and the
fixture moved a grandchild under the ROOT grandparent — so the loop ran exactly one iteration and
terminated. Two mutations proved it: refusing whenever the cursor has a parent, and refusing on entering a
second iteration, **both left the whole fixture suite green**. Restaged four deep (epic → story → task →
sub-task) with the move landing under `TKB`, whose parent is `TKA`: the walk now visits two nodes, and
both mutations die naming this fixture at its own site. Fixture count is unchanged at 84.

### Recorded with owners, not fixed

- **The reparent path's rank rules have no end-to-end fixture.** Across all 84 fixtures, `hierarchy.rank`
  and `hierarchy.deepest-rank-parent-required` appear exactly once each, **both on the created path**.
  Neutralising either of `checkTicketReparented`'s twins leaves the whole fixture suite green. Correctly
  classified as an UNCONSTRAINED PATH rather than a mutation that never ran — `fixtures.test.ts` imports
  `../src/index.js`, so the mutated code executed, and the same mutations flipped `test/reparent.test.ts`
  in the same run, which is the positive control. Both rules do have unit coverage; it is the end-to-end
  layer that is one-sided, and the code comments make the shared refusal sentence a deliberate cross-path
  property. Owner: **Plan 3 Task 14**.
- **Eleven refusal ids have no end-to-end fixture, not four.** Commit `646939c` corrected a false universal
  by naming four (`hierarchy.unknown-parent`, `hierarchy.parent-type-unknown`, `hierarchy.cross-project`,
  `field.title-required`) and was right about those, but it is not the full inventory: `ticket.unknown`,
  `ticket.unknown-type`, `ticket.already-exists`, `ticket.workflow-undefined`,
  `ticket.rebound-same-workflow`, `ticket.rebound-unknown-state` and `ticket.rebound-unknown-workflow` are
  also absent. A resumer reading that commit as the inventory would think seven ids are covered that are
  not — the same class the commit exists to repair, one level up. `Features.md` now names all eleven.
  Owner: **Plan 3 Task 14**.
- **No test in the repo cites a catalogue case id**, so the `test-cases/` ↔ test citation is
  one-directional: a test can be deleted and its case keeps its ✅. Repo-wide convention gap predating T8,
  reported because the honest answer to "are the ✅ markers true?" is that it is unanswerable in that
  direction. Owner: **workspace convention / Plan 11**.

### A process finding, and it is the executor's own

One lens reported **BLOCKING: this worktree is being concurrently mutated while the re-review runs**, and
it was right. The reviewers were told read-only and then also told to restore anything they mutated —
which on a SHARED tree is precisely the pattern that produced Wave 1's near-miss false tampering finding.
The rule already existed ("mutating fan-outs get one worktree per agent, or a serialised mutation window;
read-only lenses may share") and the executor wrote a dispatch that violated it. **A rule does not
reliably fire on its author.**

No result was corrupted, and that is luck plus discipline rather than design: the agents used
anchor-uniqueness guards, positive controls in the same run, and md5-verified restores, and one explicitly
identified a red run at 15:02:56 as a sibling's mutation rather than reporting it as a T8 defect — which
is exactly the trap. Afterwards the tree was verified byte-identical to the pinned baseline (`HEAD`
`6027d7e`, tree `e7f2cbec`, `git status` clean, empty `git diff`). **The gate that certifies this branch
ran at 14:52, before the fan-out started, so it is uncontaminated — and was re-run afterwards on the
verified-restored tree anyway.** Standing correction: any fan-out permitted to mutate gets a worktree per
agent, and "read-only" in a prompt is not read-only if the same prompt also explains how to restore.

## A handoff can be tracked, pushed, and unreachable (2026-08-31, serial executor)

The executor's handoff protocol says the file must be **tracked and pushed**. Both were true of
`docs/lanes/executor-state.md` and it still failed its purpose. It reached `main` inside the Chain A
squash (`6b2fc76`); every update after that merge went onto `exec/03-tickets-hierarchy`, which was
already merged. Seven commits, tracked and pushed, on a branch nobody would read again — while
`main`'s copy sat 70 lines behind, predating both the hazard record and the cost ruling.

**The missing clause is "reachable from where a restart reads."** This is the orphaned-sha finding at
a different layer: an artifact satisfying its stated precondition while failing the thing the
precondition exists to guarantee, with nothing in the check able to tell the difference. `git
branch --contains` was already the rule for shas; nothing applied the same test to the file.

**RULE: once the branch carrying the handoff merges, the next handoff update opens its own branch off
`main`.** Do not keep committing to the merged branch. Verify by reading the copy **on `main`**, not
the copy in the working tree.

**And the reason the author cannot self-check this.** The executor first reported that `main`'s copy
"still carried the superseded policy block" — describing what it had last WRITTEN to the file rather
than what the file contained. The controller grepped `main` and found the opposite, and worse. This is
the third instance of one shape today: a lane reported T8's review had returned while its own doc said
it had not; a brief pointed at a superseded table its author had just replaced; and here. **An
artifact's author is the worst-placed party to say what that artifact currently contains — the
artifact does not get to be checked by the person who wrote it.**

---

## Ruling P17 (2026-08-31, serial executor) — `useLiveQuery` takes a query key, and eight call sites in Plan 6's own text are now wrong

**Interface change, binding on Plans 6 T10–T13 and Plan 10.** The signature is now:

```ts
useLiveQuery(source, workspaceId, queryKey, load, debounceMs = 200)
```

`packages/app-core/src/views/use-live-query.ts`, exported from `packages/app-core/src/index.ts`.
Landed on `exec/06a-client-core` as the fix for the T9 review's F2.

**Why the parameter exists, since a reader will reasonably ask why the closure is not enough.**
`useBoard` shipped keyed on nothing: `reload` was `useCallback(…, [])` and the only effect's deps
were `[source, workspaceId, debounceMs, reload]`, none of which move when `projectId` does. Pointing
the Board at another project left the previous project's columns on screen **as** the current
project's, correcting itself only if an unrelated stream frame happened to arrive. Keying on `load`'s
identity is not available: it is a fresh closure every render, so that refetches forever.

**Three obligations, and the third is the one that will bite:**

1. ~~**`docs/superpowers/plans/2026-08-20-06-web-client.md` carries eight 3-argument call sites and a
   contract line documenting the old signature.**~~ **DISCHARGED.** T10–T13 are executed from that
   text, and an implementer transcribing it faithfully writes code that does not compile — which is
   the good case; the bad case is transcribing the *shape* and passing something that is not a key.
   Marked at every entry point a transcriber actually uses: a DEAD banner at the contract line, a
   SUPERSEDED note inside the definition's own docblock, and an inline `P17: STALE` marker on each
   call site. **The count was wrong in two places before it was recounted: this ruling said eight and
   the controller's dispatch named four. There are NINE** — `useBoard`'s own (historical, T9 is
   merged) plus eight in unwritten tasks. Verified after the edit by enumerating every
   `useLiveQuery(` call line and checking each for a preceding marker: 9 found, 9 marked, 0 unmarked.
   *A pointer from a correct document to a stale one does not drift; it reverses, and the reversal is
   silent when the transcriber copies a shape rather than a signature.*
2. **The key drives the reload; the WORKSPACE drives the subscription, and they are two effects on
   purpose.** The cheap fix — putting `load` in the subscription effect's deps — works and re-opens
   the stream on every switch, and `subscribe` is called with cursor `0`, so each re-open replays the
   whole workspace from the start. That cursor is Plan 6 T8's to fix; nothing may multiply it in the
   meantime. A test pins one subscription across a project switch.
3. **UNSTATED INVARIANT, enforced by nothing: the key must name every input `load` closes over.**
   A hook that closes over two ids and passes one as the key gets exactly the F2 defect back, silently
   and with a test suite that says the hook is fixed. Whoever writes the next `useX` on this hook owns
   checking it. Recorded here rather than left to be rediscovered.

**Also recorded, for whoever closes F6** (overlapping reloads for the same key resolve last-one-wins;
no staleness flag on `LiveQueryResult`) — **owner Plan 6 T7/T8.** The clear-on-key-change is a passive
effect, so there is still one committed render, and in a browser possibly one paint, showing the
previous project's data under the new project's heading. F2's window is shortened from indefinite to
one frame, not removed. **Both close together** under one design: store the answer stamped with the
key it was issued for, and derive `data` at render time only when the stamp matches the current key.
Then the wrong-project render is structurally impossible rather than effect-ordered, and the
generation counter F6 needs has a natural home. Not done here: it is a redesign of a module already
through review, at a merge boundary, and the minimal fix is verified.

---

## A green suite that proves nothing, and the probe that is the only thing standing between them (2026-08-31, serial executor)

**Under vitest's `threads` pool, `process.env.TZ = zone` does not move the clock.** A worker thread
does not get the process-level reconfiguration. Verified at the language level, not inferred: inside
`new Worker(...)` the same instant renders **identically** under `Pacific/Kiritimati` and
`Pacific/Niue`; on the main thread it differs. Under `forks` — vitest's default, and what this repo's
config leaves it at — assignment works normally.

**The consequence is not a broken test. It is a green one.** `board.test.tsx`'s three zone tests —
Plan 6a T9's headline claim that the client has one clock and it is not the viewer's laptop — were
**32/32 green** under `--pool=threads`, passing while the zone never moved. Nothing said so.
`test/provenance.test.ts` has carried an anti-vacuity probe since T6 (*"the harness above really can
move the ambient zone — otherwise it proves nothing"*), which is why the identical condition surfaces
there as a **failure** and surfaced in `board.test.tsx` as three passes.

**Binding, and it generalises past TZ:** the brief's known gap 2 says any clock-sensitive assertion
must vary `TZ` explicitly. That is necessary and not sufficient. **A test that varies an ambient
setting must also assert that varying it does something** — otherwise the variation is a no-op and
every assertion built on it is vacuous in exactly the configuration where the no-op happens. Applies
to Plan 1's `ist-day.ts`, **Plan 9's Calendar and Timeline**, and anything reasoning about a day
boundary. One probe per harness, and it costs six lines.

**How it was found, which is the part worth keeping.** A scoped re-review filed a Critical with the
wrong mechanism — it attributed the failure to a naive `process.env.TZ = original` restore leaking
across files in a shared worker. Four experiments refuted it: the failure reproduces on `main` with
that file **alone**; `--pool=forks --poolOptions.forks.singleFork=true` runs all seven files in one
process sequentially and is **92/92 green**, which is the sharing hypothesis in its own maximal
configuration; `--pool=threads` without `singleThread` fails on that file alone, isolating the pool as
the variable; and the worker probe names the mechanism. **Investigating a wrong Critical found a real
defect the review had not been asked to look for.** A finding whose mechanism is refuted is not
therefore worthless — refute the mechanism, then ask what the observation was actually evidence of.

**Recorded, not fixed:** `packages/app-core/test/provenance.test.ts:104,130` still carry the naive
restore. It is genuinely the F1 class — `process.env.TZ = undefined` assigns the string `"undefined"`,
which ICU resolves to GMT — but with the demonstrated-harm claim refuted (`forks`+`singleFork` is
92/92) there is no urgency left to override the standing record-do-not-fix rule. Two-line fix shape,
same as `board.test.tsx`'s. **Owner: Plan 6a.**

**Machinery instance, per the owner's standing ask to record what the thinner machinery costs and
buys.** Three agents (1 opus, 2 sonnet; cap is 6) returned 1 Critical, 4 Important, 7 Minor. The
Critical was wrong about its mechanism and right that something was there. One Important was a
*prediction* the lens could not execute under its read-only mandate — the executor ran the mutation in
two seconds and it survived, confirming a load-bearing line was pinned by nothing. **A read-only lens
that names its mutation precisely and hands it back is cheap and works**; it is the shape to prefer
over granting a fan-out write access to a shared tree.

---

## Counting a defect class you are about to fix: recount from the file, then verify with the marker as its own control (2026-08-31, serial executor + controller)

**The false-negative class has a cheap answer and this is it.** A sweep that returns zero is
indistinguishable from a sweep that matched nothing, and six silent-empty modes are already recorded
on this machine. So:

1. **Recount from the FILE, never from a claim** — not from the ruling that named the count, not from
   the dispatch that listed the sites. Both can be wrong, and when they disagree neither is a
   tiebreak. Ruling P17 said *eight* stale `useLiveQuery` call sites; the dispatch asking for them to
   be marked named *four*. **There were nine.** The five in neither list sat in Tasks 11–13 — the only
   tasks not yet written, i.e. precisely the ones the marking existed to protect.
2. **After the edit, enumerate every site again and check each one for its marker** — do not trust
   that N replacements means N sites. Assert the count of unmarked sites is zero.
3. **Count the marker string itself in the same run.** That is the control: a zero-unmarked result is
   only evidence if the thing being searched for is demonstrably findable. Without it, "0 unmarked"
   and "the search is broken" print identically.

```
call sites found: 9      UNMARKED: 0
control — lines containing "P17: STALE": 9
```

**Why step 3 is not optional here.** *"A decomposition that reconciles almost everywhere reads as
verified"* — the four sites the dispatch named were all real, so marking exactly those would have
produced a clean-looking sweep with the live defect still in it. The wrong entry hides inside the
right ones, and granularity makes the drift more persuasive, not less.

**Companion rule, from the same exchange:** when a document cites a sha it knows to be orphaned,
**label it orphaned in the same table that cites it.** A later reader's `git branch --contains` sweep
will flag it, and the label is the difference between a cheap confirmation and a true finding about a
false problem.
## Plan 7 client half — execution consequences (2026-08-31, lane 3, recorded at wind-down)

Wave 1 folded back into serial execution with this partition part-done: **T1, T2, T11a (domain
half) and T3 complete and review-clean; T4 implemented with its fix round landed but its
scoped re-review never dispatched.** Branch `exec/07-editor-client`, pushed. Everything below
is a claim on whoever executes Plan 7 next, and none of it changes what shipped.

### Plan-text defects found by executing it

These are defects in the plan document, several of which sibling plans transcribe.

1. **Task 2's fixture carries four surviving mutants.** Its six specified cases do not catch:
   a `String()` coercion behind the `!= null` guard; the `type === 'image'` discriminator
   entirely unpinned (deleting it passed all seven cases, so a walker that also harvested a
   `fileChip` or mention id would change what the server gate checks with every suite green);
   a sorted-output escape; and Task 11a's guard leaving the `name`/`mimeType` conjuncts
   unkilled. All four are closed on the branch. **Any lane transcribing a fixture block from
   plan text should mutate the implementation before trusting it** — a fixture that agrees with
   the implementation without constraining it is the recurring shape here.

2. **Task 4's node-level `parseHTML().getAttrs` is a person-substitution forgery, and Task 3's
   is the same trap one node earlier.** Tiptap's `injectExtensionAttributesToParseRule`
   (`@tiptap/core@3.30.5` dist:1452-1471) spreads per-attribute results *after* a node-level
   `getAttrs`, so validation placed there is dead code. Shipped verbatim and observed: a
   `<span data-mention-user-id="…A" userId="…B" label="Mallory">@Anselma</span>` parsed to
   `{userId:"…B", label:"Mallory"}` — **the stored document naming a different person than the
   one displayed, in exactly the field notifications read.** Both nodes now validate
   per-attribute. Swept with a working positive control: `getAttrs` appears in exactly two of
   Plan 7's fourteen in-scope briefs, T3 and T4, both closed. No remaining task inherits it.

3. ~~**Task 4's "planted defect: Escape" is vacuous.**~~ **HALF WRONG, corrected by T4's scoped
   re-review (2026-08-31) — and the correction is the more useful claim.** `@tiptap/suggestion`
   (dist:129-138) does call `dispatchExit(view)` unconditionally and return true regardless of the
   renderer, so no mutation of `packages/editor` can redden *whether Escape reaches the exit path*.
   But the sentence as written said "the dismissal half", and **the renderer's own teardown is part
   of that half and IS constrained**: deleting `container?.remove()` from `destroy()`
   (`mention-popup.ts:146`) reddens exactly one test — the `toBeNull()` assertion in
   *'Escape dismisses the picker and the typed text stays literal'* — with 69/70 otherwise green.
   Measured, not reasoned. The `@an`-surviving-as-literal-text half was already recorded as genuine.

   **So the test is not vacuous; one of its three assertions is.** That distinction matters more than
   the original verdict did, because "vacuous" invites deletion and the honest answer is that this
   test earns its place while one line inside it cannot fail. **A claim that a test cannot fail is
   itself a claim, and it needs the same mutation evidence as the claim that it can.** The original
   was derived from library source rather than from a run — correct about the library, wrong about
   the test, and it would have licensed deleting a check that works.

4. **Task 1's `vitest.config` block omits `esbuild: { jsx: 'automatic' }`.** No `.test.tsx`
   compiles without it, and four of this partition's tasks add one. The next plan authoring a
   client-package config hits this identically.

5. **Task 1's `typeText` helper does not compile.** `prosemirror-view`'s `handleTextInput`
   takes five arguments; the plan passes four. It lives in `test/`, which the plan's own
   single-tsconfig `typecheck` never reads — every shipped package carries a second
   `tsconfig.typecheck.json` including `test`, and the plan omits it.

6. **Task 1's `Link.configure` is internally inconsistent.** It sets `autolink: false` to keep
   typed URLs literal and leaves `linkOnPaste` at the library default `true` two properties
   away, under a comment quoting spec §2's "nothing silently becomes markup".

7. **Task 4's Step 5 export line is a `TS2300` duplicate identifier** — `MentionCandidate`
   already had an origin in `schema/extensions.ts`.

8. **Plan 7's Consumed-interfaces table is stale in two rows**: the upload response is still
   the pre-amendment `{attachmentId, url}` (amendment 15 pins a five-field superset whose
   `mime`/`size` are the server's sniffed truth), and `ticket.transitioned` is still
   `{toStateId, comment}` (decision 6's 2026-08-28 amendment makes it `{to, comment:{text}}`).
   Task 12's body text carries the correct upload shape; the header row does not.

9. **Plan 7 numbers no test case for Task 2.** Task 16 pins 9.1–9.34 and claims "no other
   numbers"; `doc-embeds.test.ts` has none. Assigned **9.35** on the branch, past the end of
   the list, following bd9e022's 5.37 precedent.

10. **`@testing-library/react` skew**: Plan 7 pins `^16.1.0`, lane 4 shipped `^16.2.0`.

### A tooling hazard that can void falsifiability evidence — measured, not theorised

A test importing another workspace package **by name** resolves through that package's
`./dist`. Mutating the other package's *source* and running bare `vitest` therefore tests a
stale build and **passes**. Measured on this branch: dropping `'paragraph'` from
`packages/domain/src/doc-text.ts` gave **8 passed** under bare vitest and **3 failed / 70**
under `pnpm turbo run test`. A test importing `../src/…` is immune.

This matters because two workarounds compose badly: the output proxy collapses `pnpm test` to
a bare pass/fail count, which is why dispatches push bare vitest for assertion-level detail —
safe for a same-package mutation, unsafe the moment the test crosses a package name. **Anyone
who adopted the first workaround without knowing the second has evidence that may be void.**
CI is unaffected (`turbo.json` has `test.dependsOn: ["^build"]`).

### Three product questions this lane took the conservative option on, unruled

Each is recorded here rather than settled, per autonomy protocol #3.

- **`trailingNode`.** StarterKit appends an empty paragraph after a non-paragraph block,
  asymmetrically — nothing on load, on first keystroke. So a user who opens a description
  ending in a code block, types one character and saves produces a version diff containing
  their character *and* a paragraph they never wrote. Kept, and pinned by tests. Invariant 4
  targets invented *facts* and an empty paragraph asserts none; the tension is with §2's
  "description edits stay versioned claims". `trailingNode: false` is a one-line reversal
  while no documents exist and a migration afterwards.
- **Unreadable stored `wrap`.** Layer 1 coerces to `block` rather than declaring a ProseMirror
  `validate`. The trade is not "hard failure versus degrade": with `enableContentCheck` at its
  default the throw is caught, one `console.warn` is emitted, and **the whole document is
  replaced by an empty paragraph** — observed on a document with two paragraphs either side of
  one bad image, both of which vanish. The destroyed text has nothing to do with the failing
  attribute.
- **Paste- and drop-to-markup.** Seven paste rules across five extensions turn pasted
  `**bold**`, `` `code` ``, `~~strike~~` and bare URLs into markup, fired from
  `pasteRulesPlugin`'s `appendTransaction` on paste **and on drop**, gated by none of
  `autolink` / `linkOnPaste` / `markdownLinks`. Eighteen input rules across ten extensions do
  the same for typed text through a separate lever. Spec §2's escape-suggestion mechanic
  (Task 5) addresses the typed path only — its brief contains no occurrence of "paste".
  **Task 5 decides whether §2 reaches paste and drop; Task 12 is the implementation site**,
  since `enablePasteRules`/`enableInputRules` are `Editor` options `buildEditorExtensions`
  structurally cannot reach. Two tests document current behaviour and say "flip, don't delete".

---

## Run the gate BEFORE a rebase, so a post-rebase red is attributable (2026-08-31, controller + serial executor)

**One extra run converts a pass/fail into a diagnostic, and every remaining rebase in the serial
order has the ambiguity it removes.**

Rebasing a long-lived branch across a moved `main` produces exactly two interesting outcomes and they
are easy to confuse: the branch was already broken, or the rebase broke it. A gate run at the OLD tip
answers that before the question can be asked. Step 3 measured `Tasks: 21 successful, 21 total`,
589 tests at `52520b0` (**orphaned by the rebase that followed — do not cite it as a live sha**),
then 21/21 and 934 after, both under Node v22.22.2.

**Pair it with a reconciliation, or the second number is just a number.** 934 = 853 (`main`) + 70
(`@gisik-nokma/editor`, the branch's own package) + 11 (domain 263 → 274). A total that only *rises*
tells you nothing; a total that decomposes into named, expected parts is checkable by the next reader.

**And state the Node version beside both.** Each worktree carries its own `node_modules`, and a native
binding matches whichever Node last rebuilt it — so two sessions can certify the same commit under
different Node majors and both report green. The loud half of that (an ABI mismatch reddening
`sync-client`) cost the controller a round; the quiet half is a false green and nothing in this repo
would catch it. `engines` declares `>=22 <23`, and with no `.npmrc` setting `engine-strict=true`,
nothing enforces it — `pnpm` under Node 24 runs with no refusal and no warning.

---

## A `sleep`-based timer is not a wake-up mechanism here (2026-08-31, serial executor)

A backgrounded `sleep 1432` intended to wake the executor at a quota boundary was **still alive at
59:11 elapsed** — nearly an hour into a 24-minute wait, never having advanced, exited, or notified.
Not clamped, not killed, not overshot: suspended, and silent about it. Its output file still read
`waiting 1432s until 18:00 IST`, which was true when written and had been false for 35 minutes. Cost:
roughly 55 minutes of a full quota, idle — the resource the cost ruling exists to conserve.

**The failure mode is silence, and silence is indistinguishable from "still waiting."** There is no
state a caller can read that separates them, which puts it in the same family as this document's
other entries: it fails by staying quiet and produces a well-formed wrong answer rather than an error.

**Do not schedule work behind one.** Either re-check a cheap condition on the next real turn, or let
the work itself be the clock. If a timer is unavoidable, treat "the timer has not fired" as evidence
of nothing at all, and verify the process is actually advancing (`ps -o etime`) before believing it.

---

## What a catalogue entry is actually worth (2026-08-31, serial executor + controller)

**A `✅` written from the implementation instead of from the test is the drift the catalogue exists to
prevent, arriving during its creation.**

Measured, on the `Features.md` §9 / `09-editor-attachments.md` bucket that #47 was blocked on. The
cases were drafted from the source and the commit messages — which is the natural way to write them,
because that is where the author's knowledge is — and then checked against the actual `it(...)` names.
**Four of them did not survive:** one cited `rule-census.test.ts` for assertions living in
`schema.test.ts`; one asserted a property (`VersionedDocument` replaces rather than re-registers) that
no test makes; one described a mechanism as directly tested when what is tested is the round trip that
implies it; and one marked a behaviour `🚫` out-of-scope when two tests already document it as current
behaviour pending a later task, i.e. `✅` with a *flip, don't delete* note.

**So: draft from the implementation if you like, but VERIFY EVERY MARKER AGAINST THE TEST NAMES before
committing.** Listing `it(...)` titles per file takes one command and it caught four errors in
twenty-eight entries.

**And state the limit, because the marker is weaker than it looks.** No test in this repo cites a case
id in either direction — the cross-reference rule is unimplemented repo-wide (owner workspace/Plan 11).
So a `✅` is checkable only by reading the file the case names, never by grep, and **nothing fails when
a test covering a case is deleted.** The catalogue is a claim about coverage that the suite does not
enforce. Both halves belong in any bucket that carries a `✅`: name the covering file, and say that the
naming is all the linkage there is.

**Section numbers are RESERVED, not next-free — this is where it bites.** `test-cases/README.md` says
claim from the table rather than renumbering, and the table above assigns §6 to Plan 4. A block on #47
asked for the editor's section to be `## 6.` on next-free reasoning; §9 is Plan 7's reservation, and
§6 would have collided with the very next task in the serial order, against a rule that forbids
renumbering to fix it. **The case-level rule ("next free number in the matching section") does not
generalise one level up to sections.**

---

## An ahead-count is not a work-count: run `git cherry` BEFORE the pre-rebase gate (2026-08-31, serial executor)

**Step 4 was scheduled around a rebase that did not need to happen, and the two measurements that
scheduled it were both correct.**

The recon for step 4 reported `exec/04-auth-visibility` as **30 behind / 4 ahead** of `main`, with
`git merge-tree --write-tree` returning two genuine conflicts, one of them in code
(`apps/server/src/app.ts`). It concluded — reasonably, on that evidence — that step 4 opened with "the
largest rebase left in the series", and the handoff instructed the next session to *"Rebase FIRST, then
review the rebased tree."*

Every one of those four commits was **already on `main`**:

```
$ git cherry -v origin/main origin/exec/04-auth-visibility
- c6bafb9  better-auth turns its CSRF check off when NODE_ENV=test...
- 950131f  A comment justified a process.env write with a mechanism nobody ran...
- e772499  Every Set-Cookie assertion in the suite was n=1...
- 5c71689  A count in a comment is a claim with an expiry date...
```

`-` means *already upstream by patch-id*. They landed as `31df85b`, `24fba16`, `8c4216a`, `51aba55` —
rebase-merged rather than squashed, so they kept their own shas on `main` and their originals kept
theirs on the branch. **The branch reported "4 ahead" forever while contributing nothing.**

**Why neither existing measurement could have caught it.** `git rev-list --left-right --count` measures
**commit identity**. `git merge-tree` measures **a merge** — and it dutifully reported real conflicts,
because the branch's tree genuinely differs from `main`'s: it is 30 commits *older*, so a merge has
plenty to disagree about. Neither command asks the only question that decides whether there is work to
do: **is this content already upstream?** Only `git cherry` (or `git range-diff`) asks that.

**The rule.** For every remaining branch in the serial order, `git cherry -v origin/main <branch>` runs
**before** the rule in *"Run the gate BEFORE a rebase"* fires. If every line is `-`, delete the branch
and start from `main`; there is nothing to gate and nothing to rebase. **The cheapest way to make a
rebase gate unnecessary is discovering that there is no rebase.**

**What it cost to learn late.** One full gate run at `5c71689`, per the pre-rebase rule: green, 15/15
tasks, 488 tests, Node v22.22.2. It is a control for **nothing** — it measured a tree strictly *behind*
`main`. It is recorded as a footnote and explicitly fenced off from any `main`-derived total, because
this series has already been burned by a number that rises without decomposing.

**The generalisation, which is the part worth keeping.** This is the same shape as every other defect
recorded in this document: *a measurement that was accurate about what it measured, and was read as
answering a question it never asked.* A count of commits answered "how far apart are these histories",
and was read as "how much work is there". Before acting on any figure in this project, say out loud
which question it answers — and check that it is the question you are about to bet a round on.

### Three claims from the same recon, checked rather than adopted — two of them false

| Claim | Finding |
|---|---|
| The coordination-doc conflict risks losing content | **False.** The branch's 154-line §7 block is **byte-identical** on `main`. The one differing line in the first comparison was the *extraction* picking up main's next heading, not a real difference — a reminder that the boundary of a diffed region is itself a claim. |
| The `app.ts` conflict risks losing content | **False.** Main's copy is a strict superset: it carries the branch's `auth: Auth` block *and* the `ingest: ClientIngest` narrowing the branch never had. |
| Plan 4 Task 5 is unstarted | **False, and load-bearing.** T5's first branch landed on `main` as `fc904f4`: `checkPermission`, `SERVER_ORIGIN_RULE`, `SERVER_ORIGIN_REASON`, and the `SubmissionGate` type — whose own comment records that it was *"named as a type so Task 5 can widen it to carry the session (`(env, session)`) without every call site changing shape."* **T5 widens; it does not create.** Widening that signature is a breaking change, and **Ruling P17 is the precedent**: it owes a sweep of call sites in the plan text, not only in code. |

**And one anchor re-verified rather than inherited.** T5's third CSRF item anchors a sentence to
`apps/server/test/auth/sign-in-flows.test.ts:148`. The recon verified that line **on the branch** — the
stale tree. Line numbers drift across a rebase-merge, so it was re-checked on `main @ 91df593`: still
line 148, content unchanged. **An anchor verified on the wrong tree is not verified.**

### The caveat that makes the rule safe to apply, contributed by the controller: `cherry` is ASYMMETRIC here

**`-` is strong evidence of redundancy. `+` is NOT conclusive, because this repo uses BOTH merge
strategies.** A squash-merge collapses N commits into one and destroys the per-commit patch-ids
`cherry` matches on, so every commit of a squash-merged branch reports `+` — "new" — long after it has
landed. Measured across the remaining branches:

| Branch | `cherry` | Truth |
|---|---|---|
| `exec/04-auth-visibility` | 0 of 4 new | redundant; **do not merge, it would regress `main`** |
| `exec/04-envelope-origin-gate` | 0 of 3 new | genuinely inert — merge-tree byte-identical to `main`; safe to delete |
| `exec/10-prefix` | 0 of 1 new | content superseded; conflicts; do not merge |
| `exec/03-tickets-hierarchy` | **31 of 31 new** | **MERGED** as `6b2fc76`, Phase 0 step 1 — squashed |

Both strategies are visible on `main` and they are told apart at a glance: **a squash-merge carries a
`(#N)` PR suffix** (`6b2fc76 … (#38)`, `a3746fb … (#47)`), while Plan 4's four rebase-merged commits
sit on `main` under their own subjects with no suffix. Confirmed by counting both populations.

The asymmetry runs in the safe direction — **a false `+` costs unnecessary work, never lost work** — but
it must be stated that way, or the next reader concludes a merged branch has 31 commits outstanding.
Where `+` matters, fall back to `git range-diff` or a content diff; `cherry` alone cannot clear it.

### A check that cannot return "identical" for the case you care about is not a check

Recorded because it nearly became a false finding against this executor, and it is the fifth costume of
the non-falsifiable check.

Confirming redundancy "authoritatively" by comparing `git merge-tree --write-tree <main> <branch>`
against `main`'s tree looks rigorous: a redundant branch should produce an identical tree. It reported
an 11-line difference, apparently contradicting the `cherry` result. **The 11 lines were conflict
markers.** `merge-tree --write-tree` writes `<<<<<<<` / `=======` / `>>>>>>>` *into the tree* when a
merge conflicts, so tree-vs-tree comparison silently answers **"did this conflict"** rather than
**"is this redundant"** — and a conflicting branch can therefore *never* compare equal, whatever its
content. The instrument could not produce the answer that would have cleared the branch.

It was caught only by printing the actual differing lines instead of trusting the stat — the same move
that caught the `grep -c` proxy reformatting earlier in the same session. **Print the rows, not the
count, whenever a count is about to decide something.**

**Telling the two strategies apart costs one command, and the marker has its own limit.**
`git log -1 --format=%s <sha>` ending in `(#N)` means a squash landing — so `cherry`'s `+` is
unreliable for that branch; the suffix's *absence* means the patch-ids are trustworthy. Both
populations were counted on `main` by two sessions independently: every squash landing carries it
(`#38`, `#43`, `#45`, `#47`, `#48`), and all four rebase-merged Plan 4 commits carry none.

**But the marker is a convention of the GitHub squash UI, not a property of git.** A hand-written
commit message ending in `(#12)`, or a squash performed by another tool, would both fool it. It is good
evidence, not proof — **the same shape as `cherry` itself, one level up.** Recorded here deliberately,
so the signal that just rescued a rule does not become the next over-trusted one.

### The rule all of these are instances of

**Print the rows, not the count, whenever a count is about to decide something.**

One cause behind four separate incidents in this series: the `grep -c` proxy reformatting its output;
the `merge-tree` stat that reported 11 differing lines which were conflict markers; the `9.1`/`9.34`
catalogue census that matched prose; and the idle check where a `✻` inside a *"done"* status line made
a finished session look busy. Every one was a count that was accurate about what it counted and was
read as answering a different question. Every one was caught by looking at the rows.

**Corollary, for when the rows are too many to read: print the first few AND the count.** The
disagreement between them is itself the signal.

**And the sharpest statement of the `merge-tree` costume, because it is distinct from the others in
this document:** the instrument *could not produce the answer that would have cleared the branch.* It
was not noisy, approximate, or tracking the wrong variable — it varied correctly. It answered a
different question, and its output looks identical either way. A check whose passing outcome is
unreachable for the population you are asking about has already decided, before you run it.

---

## Ruling P18 (2026-08-31, serial executor) — `proj_memberships` has landed and nothing reads it through the engine; the contract's trigger condition has fired and no task owns it

**Plan 4 Task 4 lands `proj_memberships`. `engine-context.ts`'s `getEntityState('membership')` still
returns `null`. No task in Plan 4 owns the wiring between them, and the plan text was checked twice.**

`apps/server/src/engine-context.ts` says, and has said since Plan 1:

> "PLAN 3 TASK 12 is where this grows a real body for 'ticket', from proj_tickets. **Plan 4 owns
> 'membership' via proj_memberships. Until each lands, its kind stays null here**"

`proj_memberships` has now landed. The sharper framing is therefore not *"this is unassigned"* but
**a stated contract whose trigger condition has fired.** The same file's ticket analogue is explicit
that the projection and its context method *"neither may land without the other"* — the membership half
has no such pairing anywhere.

**How thoroughly "no task owns it" was established, because it is an absence claim.** Two sweeps, both
with positive controls from the same run:
1. Literal identifiers across Plan 4: `engine-context` → **0 hits**; `getEntityState` → **exactly 1**,
   at line 874, which falls inside **Task 3**'s body (860–1227) and is an event→entity *modeling
   decision*, not a deliverable assignment. Positive control: `proj_memberships` → **32 hits**.
2. A **second sweep for the capability in prose** rather than the identifier — "rule engine", "available
   to rules", "entity state", "restrict-to" — across Tasks 6–14. **No hit assigns the wiring.** Positive
   control: the same sweep over Tasks 1–5 returns 4 hits, so it is capable of hitting.

Neither Task 4's nor Task 5's `Files` list names `engine-context.ts`.

### What is actually broken, stated in the direction it actually fails

**It fails CLOSED, and that is why nothing has noticed.** `restrict-to.ts:26` reads

```js
if (membership !== null && membership.kind === 'membership' && rule.roles.includes(membership.role))
```

so a `null` membership means the criterion does not match and the transition is **refused**. The null
case is deliberate and *tested*: `packages/rule-engine/fixtures/rule-restrict-to-refuses-without-membership.json`.
So this is a **functionality gap** — role-gated transition rules do not work on the server path — and
**not** a forgery window or an authorisation bypass. Anyone reporting it as a live security defect will
provoke a mis-sequencing ruling.

**It is reachable, not dormant. Correcting a claim made in T4's own implementation report:** that report
stated "the engine has no caller today — `transition.ts:499` is the only `getEntityState` call site and
it reads `'ticket'`." **False.** Enumerating every call site in `packages/rule-engine/src` finds two in
production code, reading *different kinds*: `transition.ts:41` (`'ticket'`) and **`restrict-to.ts:25`
(`'membership'`)**, dispatched from `rules/index.ts:34`. Any workflow definition carrying a `restrict-to`
rule with `roles` reaches it. Recorded because a "no caller" claim is exactly the kind that retires a
hazard by accident.

**And the suite cannot see it.** The rule engine's own `restrict-to` tests run against
`fixtures/harness.ts`, which carries `fx.memberships` and *does* answer (`harness.ts:294`) — so they
pass. (Corrected by the step-10 checkpoint's fix round: this used to name `memory-context.ts`, whose
`getEntityState` answers `null` for `'membership'` exactly as the server did.) The server path is
the only place the null appears, and no server test exercises a role-gated transition. **A
half-witnessed contract: green on the side that has the fake, untested on the side that has the truth.**

### Why it was NOT fixed inside Task 4, and what would have made that right

The wiring is *technically* trivial: `resolveEffectiveRole(db, userId, workspaceId)` is **scopeless**,
taking exactly the `(workspaceId, userId)` pair `membershipId()` encodes, so an adapter is a few lines
over T4's own deliverable — no scope-collapse policy has to be invented. **That was the discriminator,
and it came back trivial.** It was still not done, for reasons that outrank convenience:

1. **It flips rule-evaluation outcomes** — role-holders go from refused to permitted. That is a
   behavioural change, and appending it to an already-reviewed diff ships it unreviewed.
2. **The plan text assigns it to nobody**, and *"the instinct to fix what you find is the one that hides
   compounds."* Recorded halves are what let Wave 1's cross-workspace forgery become visible.
3. The serial order already has the instrument for exactly this: **step 10, the integration checkpoint**
   — *prove the fakes against the real server before anything builds further.* A recorded gap with an
   owner feeds that checkpoint. A quietly-widened Task 4 does not.

**Owner: the ruling below, to be taken by whoever dispatches Plan 4 Task 6 or the step-10 integration
checkpoint, whichever comes first.** The conservative default, absent an owner decision, is that the
wiring lands as its **own reviewed change** — a projection nothing reads is this series' signature
failure at small scale, and `proj_memberships` is one adapter away from being exactly that.

### The absence is enumerated in code, not labelled

Per the standing rule that a partial-implementation marker *enumerates the absences rather than the
partiality*: `engine-context.ts` is **deliberately untouched by Task 4**, including its comment. Editing
that comment inside T4's diff would read as "Task 4 wired the engine", which is the misreading most
likely to retire this entry before it is acted on.

---

## A projection handler may only write keys its own entity totally orders (2026-08-31, Plan 4 Task 4)

**The general rule.** A projection's `apply` may write only those keys for which its own entity's event
stream is the single, totally-ordered writer. Any key two different entity streams can write is
order-dependent, and `readLedger` replays in `(entity_kind, entity_id, seq)` — per-entity causality
only, with no cross-entity guarantee. So live arrival order and rebuild order disagree, `diffTable`'s
`EXCEPT` sees a set difference, and **`verify-projections` reports drift on a table nobody corrupted.**

**The instance that produced it.** Plan 4 Task 4's plan text told `membership.revoked` to delete every
row for that user, project rows included. But `membership.granted`/`revoked` file against the
**membership** entity and `project.member_added`/`removed` against the **project** entity, and
`'membership' < 'project'`, so a rebuild applies every membership event before any roster event.
Arrival `grant → member_added → revoked` leaves `{}` live and `{project row}` on rebuild.

**What landed instead:** disjoint key ownership. `(ws, u, 'workspace', '')` is written only by the
membership stream; `(ws, u, 'project', P)` only by project `P`'s stream. One totally-ordered writer per
key, so no interleaving can change the final set. The safety property the plan wanted did not
disappear — it moved to `resolveEffectiveRole`, which returns no projects when there is no workspace
row. That placement is **stronger**, because it also covers the roster row a legitimate rebuild leaves
standing, which a table-level delete could not.

### The part a reader will not reconstruct: `registry.ts` beat the plan text

The invariant was **already stated in the code**, at the top of
`apps/server/src/projections/registry.ts`, verbatim: *"Table contents must be a pure function of the
ledger's rows — never of cross-entity arrival interleaving."* The plan text violated an invariant the
shipped code already declared.

**This is worth naming because the reflex when a plan and the code disagree is to trust the plan.** It
is the same shape as coordination doc §10's ruling on `Refusal`'s import origin — *"Plan 4's executor
takes the import origin from the shipped code, not from the plan text"* — and it generalises past
imports: **where a plan document and a shipped invariant disagree, the shipped invariant wins**, because
it is the thing the rest of the system was built against and the thing a verifier actually enforces.

---

## Search for a fact in the vocabulary the OTHER author would have used, not in your own (2026-08-31, controller)

**An over-specific search returns a false negative that looks like a finding.**

Establishing whether "Features.md and test-cases/ move in the same change set" was a Plan-4 quirk or a
series-wide constraint, a search for **Plan 4's exact phrasing** across all twelve plan files returned
**one** hit — Plan 4 itself — which supported the conclusion "Plan 4 contradicts itself." A second pass
searching for the *rule* rather than the *wording* found it in **all eleven numbered plans**, phrased
differently in each: `` `Features.md`/`test-cases/` must move in the same change set `` (Plan 1),
"stay in sync with reality in the same change set" (Plan 2), section-scoped variants in Plans 7, 10, 11.

The conclusion reversed completely. Not "one plan is internally inconsistent" but **"a standing
series-wide constraint governs every plan's task-level steps"** — so reading Plan 4's Task 12–14
catalogue steps as exempting earlier tasks would exempt earlier tasks in *every* plan and leave the rule
meaning nothing anywhere.

**The rule: when testing whether a convention is local or global, search for the FACT in the vocabulary
the other author would have used, not the string you happen to have in front of you.** Your phrasing
comes from one document, and that document is the one file guaranteed to match it — so an exact-phrase
sweep is biased toward "unique to this file" by construction.

**A supporting detail from the same run:** two of the twelve files returned **blank rather than `0`**,
which is the silent-empty mode again. It is why the second pass printed rows instead of counts, and it
is another instance of the standing rule — **print the rows, not the count, whenever a count is about to
decide something.**

---

## Ruling P19 (2026-08-31) — a guest is admitted TODAY for four event types, and the module that says otherwise is the one Task 9 will read

**Owner: Plan 4 Task 9.** Recorded here and not only in a code comment, because the entire risk is
*"if Task 9's implementer trusts that list"* — so the correction has to live in the artifact that
implementer reads.

**The measured fact, stated undimmed.** Against the gate built at `6a6203c`, a workspace **guest is
ADMITTED** for `ticket.created`, `visibility.set`, `workspace.renamed` and `comment.added`. Positive
controls from the same run: a guest `workflow.defined` is refused *"Your role is guest."*, and a
non-member `ticket.created` is refused NOT_A_MEMBER — so the harness can produce refusals, and the
admissions are real rather than a broken probe.

**Why the docblock made this invisible.** `check-permission.ts`'s absence list said Task 5 *"closed the
other three — actor identity, role and membership"*, leaving **Visibility** as the single remaining
absence, and described the extension path as `checkVisibilityPermission` running AFTER
`checkRolePermission`. But Plan 4 Task 9's own check list assigns **two refusals to `permission.role`**:

* `ticket.created` — guests refused (`permission.role`, "Guests cannot create tickets.")
* `visibility.set` — additionally requires project-admin rights on the ticket's project OR ticket
  creatorship (`permission.role`)

Those are **write-authority** questions and belong INSIDE `checkRolePermission`. **A visibility pass
running after it has nowhere to put them.**

**The failure this would have produced:** Task 9's implementer reads the absence list, sees role marked
closed with only read-visibility outstanding, implements `checkVisibilityPermission` as a pure `canSee`
gate exactly as the bullet describes, and ships. Checks #2 and #5 are never written. **A workspace guest
can then permanently retarget any ticket they can see to `mode: 'workspace'`**, widening its audience to
the entire workspace — in an append-only ledger, where that can only be superseded, never removed.

**The general rule, which is the reusable half: NEVER LET A CATEGORY BE DECLARED CLOSED. Enumerate the
absences.** "Role: closed" is a summary; "nothing yet asks whether a guest may create a ticket, or
whether a `visibility.set` author holds project-admin rights or wrote the ticket" is actionable. The
standing marker rule — *a partial-implementation marker enumerates the absences, not the partiality* —
applies to a category being retired just as much as to one being declared partial. **A closed category
is the one thing a later reader will not re-derive**, because there is nothing left in the text to
prompt the question.

Fixed as documentation only in T5. **The checks themselves are Task 9's**, and writing them inside T5
would ship unreviewed authorisation logic in a reviewed diff — the same reason the P18 adapter was
declined.

---

## Ruling P20 (2026-08-31) — when two refusal reasons share an identifier, asserting that identifier is not a discriminating check

**`SERVER_ORIGIN_RULE` is DEFINED AS `PERMISSION_ROLE_RULE`.** Every permission refusal — identity
spoof, envelope-origin forgery, not-a-member, admin-only, project-roster overreach — therefore reports
the **same `rule` id**. Only the `reason` string separates them.

So a test asserting only `rule` cannot tell which refusal fired, and **a test that asserts a refusal
HAPPENED cannot tell you WHY.** Measured instance: deleting the `env.origin === 'server'` branch from
`checkPermission` left two of three forgery cases green, because `forgedContest()` minted a fresh
`workspaceId` and the caller was a non-member of it — the membership check T5 itself had just added
refused the event instead, wearing the same rule id.

### The sharpest detail, and the one worth carrying forward

**The test that survived was the LEDGER-LEVEL one** — `it('commits nothing for the refused forgery —
the append-only ledger never sees it')`. That is the test a security reviewer trusts **most**, precisely
because it checks the ledger rather than a string. And it is, for exactly the same reason, **the test
least able to distinguish WHY the row is absent.** Trustworthiness and discriminating power ran in
opposite directions here.

**The fix that works, and the one that does not.** Seeding the caller as a *member* of the forged
workspace fixes all three cases at once: under the mutation the event then commits, the ledger row count
goes 0 → 1, and the ledger test reddens. **Asserting `reason` would NOT have worked** — the ledger-count
test has no reason string to assert, so the most-trusted test would have stayed green under the mutation.
**When a check's strength comes from observing an outcome rather than a message, the only way to sharpen
it is to remove the OTHER causes of that outcome from the fixture.**

---

## A test named for a property must enumerate the paths that reach it (2026-08-31, controller + serial executor)

**This is the escape analysis for T5's privilege escalation, and it generalises well past that bug.**

T5's first commit contained a live escalation: nothing refuses a *second* `workspace.created`, the
founding bypass admitted one, and the bootstrap then appended `membership.granted {role:'owner'}` for
the sender — **a stranger resolving as owner of a workspace they were never in.**

The implementer *had* written a test for the property. It was named `does not bootstrap twice`. **It
exercised only the duplicate-event-id path.** A submission with a *fresh* event id is a different path
to the same property, and it was the one that was open. **28 tests and 11 dead mutations never touched
it.**

**Two rules, and the second is the counter-intuitive one:**

1. **A test named for a property must enumerate the paths that reach that property.** A test named for
   the property reads, to every later reviewer, as coverage *of the property* — not as coverage of the
   one path the author happened to think of. The name is the claim; the paths are the evidence.
2. **A mutation score is evidence about the paths exercised, not about the property.** Eleven mutations
   died here, and every one of them died on the path that was already covered. **The high score made the
   area look better tested, not worse** — it actively concealed the gap, because a reader who sees a
   dense mutation table stops looking. A mutation can only kill on a path some test already walks.

### Where the line actually falls — the valid half of a mutation score, kept

The rule above is easy to over-correct into "mutation scores are worthless." They are not, and the
distinction is the useful part:

> **Mutate to prove an ASSERTION; enumerate paths to prove a PROPERTY.**

Killing a *targeted* mutation proves something real and specific: that **this assertion** is load-bearing
for **this** behaviour. Two good instances from this same task — reverting `sameSite` to `'strict'` and
watching two named tests redden, and enabling `crossSubDomainCookies` and watching `Domain=localhost`
appear in the diff — are genuine evidence, and they are why those two CSRF items count as *intent*
rather than accident.

What a kill can **never** establish is coverage across the paths that reach the property, because **a
mutation can only kill on a path some test already walks.** A high kill count is therefore not a
coverage claim, and a test named for a property still owes an enumeration of the routes to it.

Recorded because *both* sessions were making the error in the same direction all day — one reporting
kill counts as if they were coverage, the other asking for mutation proof repeatedly without ever
asking which paths the mutations sat on.

**And the guard that finally closed it had the same shape as the bug.** The obvious fix — ask whether
the event's *entity* already has a head row — is defeated by a founding filed under a **fresh entity
id** against the victim's workspace. The correct question is about the **workspace**
(`workspaceExists`), not about one entity id. `workspaceExists` is a **required** field, so a call site
that forgets it is a type error rather than a silently re-opened door — *prefer the check whose failure
is loud*, applied to a function signature.

---

## "Tracked and pushed" — the resumer covers connection loss, not unpushed work (2026-08-31, controller)

T5's five commits, including **the fix for a live privilege escalation**, sat on one machine's disk
through an entire review cycle. Local `HEAD` was `6a6203c`; `origin/exec/04-t4-t5-permissions` was still
`a5b761c`, the previous task's handoff commit.

**Caught by a peer, not by a rule** — the controller went to verify the two escalation guards, searched
the *remote* for `workspaceExists` and `workspaceSeq === 1`, and got **zero hits with `checkPermission`
as a positive control returning four files.** The zero was true of the remote and false of the tree.

**The gap this exposes in the safety nets:** the session-limit resumer handles connection loss, and
processes and commits survive that fine. **It does nothing for work that was never pushed.** That is
why the handoff protocol's phrase is "tracked **and pushed**" rather than "committed".

**Rule: push at every commit inside a task, not only at the task boundary.** A `--force-with-lease`
after a later amend costs nothing; an unpushed escalation fix costs the whole task. And **verify with
`git branch -r --contains`** — the remote-tracking form — because the same trap applies here as
everywhere: a sha that resolves locally says nothing about what the remote holds.

---

## A determinism test that replays the order it applied is vacuous (2026-08-31, Plan 4 Task 6)

**Task 4 found that a projection handler may only write keys its own entity totally orders. Task 6 found
the test that was supposed to catch such a violation, and it could not have.**

The plan text's determinism test for `proj_visibility` applied a set of events, then "replayed" them and
compared. **It replayed the same ARRIVAL order it had just applied.** Two runs of the same function over
the same input in the same order agree trivially — so the test asserted only that `apply` is a
deterministic *function*, which is true of almost any code, and never that the table is a pure function
of the ledger's *rows*. It is a check whose passing outcome is unreachable for the failure it names.

**And there was a live defect underneath it.** Every event `proj_visibility` reads is filed against a
**ticket**, so `readLedger`'s canonical `(entity_kind, entity_id, seq)` order is ticket-id order — under
ULIDs a parent is routinely created when its own children are already in the table. The plan's
`ticket.created` handler resolved only the new ticket, reasoning *"a fresh ticket has no children, so no
recursion"*. **True of arrival order, false of replay.** With ULIDs sorting child < grandparent <
parent, a rebuild left the grandchild at `project`/`''` while live said `workspace`/G.

### The shape of a determinism test that can actually fail

**It must assert that the canonical order DIFFERS from the arrival order before it compares anything.**
Otherwise the two orders may coincide — by fixture luck, or by ULIDs that happen to sort the way they
were created — and the test passes without ever having exercised reordering. The harness that replaced
it does exactly that: it asserts the orders differ, does a real ledger insert, and calls
`rebuildProjection` rather than re-running `apply` over its own arrival sequence.

**Generalisation, and it is the reason this is recorded separately from Task 4's rule:** *when a test's
job is to detect a disagreement between two orderings, the test must first prove the two orderings are
not the same ordering.* A comparison between a thing and itself is the most convincing green there is.

**The corrective design is also worth keeping:** every handler now restores one **table-wide invariant**
rather than applying a delta. A delta is correct only relative to a state the arrival order produced; an
invariant is correct at any point in any order — which is what the projection contract actually demands.

**Two further plan-text corrections from the same task**, both of the class §10 already rules on
(*take the shape from the shipped code, not from the plan text*): the reparent handler read
`payload.parentId` where the shipped schema names it **`newParentId`** — and **the plan's own fixture
was self-consistently wrong the same way**, so nothing would have gone red until a real Plan 3 event
flowed through, at which point reparent resolution silently stops working rather than erroring. And
`visibility.set` is keyed on `event.entity.id`, not `payload.ticketId`: until Task 9 refuses a
disagreement between them, keying on the payload is a **cross-entity write** and reopens exactly the
determinism hazard above.

---

## Ruling P21 (2026-08-31, Plan 4 Task 7) — when a branch falls through, ask which way the fallthrough DECIDES

**The tell is an asymmetry inside a single function, and it is measurable in one command.**

`canSeeResolved` (`apps/server/src/visibility/can-see.ts`) decided the viewer's role with an if-chain
and the resolved mode with a `switch`. Measured at `669209f`:

| widening | result |
|---|---|
| add a fourth `resolvedMode` (`\| 'inherit'`) to `ResolvedVisibility` | **TS2366**, *"Function lacks ending return statement"* |
| add `\| 'viewer'` to `WorkspaceRole` | **`tsc --noEmit` exits 0. No error.** |

**The mode union is protected; the role union is not — and the role chain's unenumerated direction is
GRANT.** Any role that is not `null`/`owner`/`guest` falls past those branches into the member branch
and reads every `resolved_mode = 'workspace'` ticket, plus every explicit list naming them.
`listVisibleTickets` restates the same decision table in SQL and takes the same fall-through, handing
back the whole workspace-mode slice in one call.

**The general rule, which is sharper than "add exhaustiveness checks":**

> **When a branch falls through, ask which way the fallthrough decides. An unguarded chain whose default
> is DENY is a bug. An unguarded chain whose default is GRANT is a latent privilege escalation waiting
> for someone to add an enum member.**

Nothing is wrong today — `WorkspaceRole` is a closed four-member union and the migration's
`CHECK (role IN (...))` names the same four, so the branch is unreachable with current inputs. The
defect is that the *next* person to add a read-restricted role (`viewer`, `billing`, an external
accountant) ships a workspace-wide read leak with **nothing red and nothing failing to compile.**

**And where one decision table is written twice — once in TypeScript, once in SQL — the second copy can
silently disagree.** Whatever guards the first must guard the second, or the second must be pinned by a
test that names why the two guards differ in kind.

---

## Ruling P22 (2026-08-31, Plan 4 Task 7) — `EffectiveRole` is trusted by convention, and TypeScript is structural

**Every safety property verified for `canSeeResolved` rests on its `EffectiveRole` argument having been
produced by `resolveEffectiveRole`.** That provenance is what makes `workspaceRole === null` imply an
empty project set, and what confines `workspaceRole` to the four roles the branches enumerate.

**Nothing enforces it.** `canSeeResolved` takes the value by parameter, and TypeScript is *structural* —
any object of the right shape is accepted. Task 8's route, Task 9's ingest check and Task 11's sync
filter can each construct or cache an `EffectiveRole` from somewhere else, inheriting a project set no
early return has ever emptied, and **neither the compiler nor the suite would object.**

**The closer, named here so its implementer does not have to invent it: make `EffectiveRole` a branded
(opaque) type** — carrying a unique symbol property that only `resolveEffectiveRole` can produce. That
converts *"verified by convention"* into *"unconstructable elsewhere"*, and turns every future misuse
into a **compile error rather than a silent grant**. *Owner: the first task that calls `canSee` —
Plan 4 Task 8.* Catalogued as an ❌ absence.

### A correction to the expectation this task was dispatched with

The dispatch named `resolveEffectiveRole`'s empty-project-set early return as the guard to watch, and
told the implementer to STOP and report if the plan text routed around it. **That expectation was wrong,
and the implementer proved it against its own work.** The trigger never fired — the plan text does route
through `resolveEffectiveRole`, and exactly one SQL statement in all of `apps/server/src` touches
`proj_memberships`. But **the mutation meant to prove the ruling SURVIVED**: deleting the early return
leaves all 16 of Task 7's tests green and reddens exactly one case in the whole 237-test server suite —
Task 4's own.

The reason is structural: `canSeeResolved` and `listVisibleTickets` both short-circuit on a null
workspace role **before** the project set is read, so nothing reachable from `canSee` can make a
surviving roster row matter. **The ruling holds — but by two short-circuits, not by the early return.**
That distinction is what a future reader needs, and it is recorded because the implementer **withdrew
the catalogue claim it had already written** rather than keeping a sentence the evidence no longer
supported. The early return is still worth keeping: it protects readers that have no null check of their
own, such as `hasProjectAdminRights`.

---

## Two more instruments with unstated preconditions (2026-08-31)

Both print a plausible number. Neither looks like an error. They join `merge-tree --write-tree` and the
`(#N)` squash marker on the list of good instruments that mislead when their precondition is unstated.

### `@{u}` is not a stable referent — name the ref, don't trust the symbol

`git rev-list --left-right --count @{u}...HEAD` was prescribed as the check for unpushed work. Run
immediately **after a successful push**, it returned **`0 6`**, which reads as six unpushed commits and
sent the executor hunting for a fan-out that was still committing. Nothing was wrong.

`@{u}` is whatever upstream the branch was **created** with, and `git checkout -b <name> origin/main`
sets it to **`origin/main`**. The command truthfully answered *"how far ahead of main am I"* — the right
question about the wrong **subject**.

**Rule: name the ref — `git rev-list --left-right --count origin/<branch>...HEAD` — and repoint the
upstream so the symbol means what a copier will assume it means.** Fixing only the invocation leaves the
trap set for the next person.

**This is a distinct family from the `merge-tree` trap.** There, the instrument answered a different
*question* (did this conflict, not is this redundant). Here it answers the right question about a
different *subject*. Both produce well-formed wrong answers; the first is caught by asking what the tool
computes, the second by asking what its arguments resolve to.

### `git cat-file` lies from a SIBLING WORKTREE, not only from the reflog

The standing warning is that `cat-file` passes on reflog-only commits. **There is a second source, and
it is the one that fools a REVIEWING session rather than the authoring one.** Worktrees share a single
object store, so a commit that exists **only locally, in another worktree** resolves cleanly from the
main clone and reads as landed. Demonstrated: `git cat-file -t 669209f` returned `commit` from both the
executor's worktree and the main clone while the commit was on **no remote at all**.

The reviewer is the party with no reason to suspect and the least ability to check, which is exactly why
this costume is dangerous. **`git branch -r --contains <sha>` returning empty is the discriminating
test** — it asks about the remote rather than about the object store.

---

## An author is the worst-placed party to report their own artifact — including the reporting sentence

Recorded as the general form of what this two-session topology exists for.

The executor wrote *"everything pushed as committed"* one message after staging the rule that work must
be pushed at every commit. It was **a belief about its own action, not a check** — two commits, including
the one carrying the gate figures, were on one machine's disk. Caught by the controller, which went to
verify a claim and found `canSeeResolved` nowhere on the remote.

The same session had, an hour earlier, correctly caught the identical class in three other places. **The
rule does not reliably fire on its author** — not because the author is careless, but because the
author's evidence for "I pushed" is a memory of intending to, and the reader's evidence is the remote.

**So: make it a check, not an assertion, and paste the measurement.** This applies to the reporting
sentence itself, not only to the work being reported — which is the sharpest available statement of why
neither session can audit its own output.

### The measurement that produced P21 was itself taken with a stale instrument

Recorded because it nearly made a real finding unprovable, and because it is the **type-level** form of
a trap this document already records for tests.

The reviewer established P21's asymmetry by widening `WorkspaceRole` in
`packages/domain/src/entity-state.ts` and running `tsc --noEmit` in `apps/server`. It exited 0 — which
was read as *"the role side has no exhaustiveness guard"*. **But `apps/server` resolves
`@gisik-nokma/domain` through `packages/domain/dist/*.d.ts`, so widening the union in SOURCE never
reached the server's compiler at all.** Exit 0 was equally consistent with a real finding and with an
instrument that could not see the change.

The conclusion happened to be correct. **The evidence for it was not.**

**The discriminating move is a positive control that proves the change is visible before you interpret
the result:** rebuild the package, then compile a probe — `const _probe: WorkspaceRole = 'viewer'` —
and confirm it does NOT error. A probe that fails means the widened type never arrived and the whole
measurement is void. With the rebuild and the probe in place, the fix was verified independently: two
`TS2366` errors, **one per file**. *One error would have meant only one of the two switches was
load-bearing* — the count is itself the discriminator.

**Generalisation: the stale-`dist` trap is not only about tests.** This document already records that a
cross-package mutation under bare `vitest` tests the stale `dist`. The same boundary defeats
**type-level** measurements: any claim of the form *"widening this type produces / does not produce a
compile error over there"* is void unless the package was rebuilt and the visibility proved. Both halves
of the trap — a mutation that never ran, and a widening that never arrived — produce a **quiet pass**
rather than an error.

**And where a decision table is written twice, the guards can differ in KIND, which is a fact to state
rather than a defect to hide.** `listVisibleTickets`'s role dispatch is TypeScript, so it was made
compiler-exhaustive alongside `canSeeResolved`. Its **mode** side cannot be: those values are literals
inside a SQL string. A fourth mode therefore fails **closed** there (excluded from every non-owner list)
while `canSeeResolved` fails to compile — **drift, not a grant**. Named in the docblock as the reason
the two guards differ, and catalogued as an open item (6.65) rather than left as a silent asymmetry.

---

## The sonnet reviewer default is CONDITIONAL, and the condition is checkable (2026-08-31, controller + serial executor)

The cost ruling's table reads **"Per-task reviewers *where the plan text is complete* | sonnet | medium."**
That row carries its own **stated precondition**, and the precondition is measurable in one command.

For the lifted Plan 10 Task 4 it is **false**: swept T4's own range (lines 1300–1810) for `coheren`,
`binds`, `embedded`, `outer envelope`, `envelope-origin` and `§11` — **zero hits for every one**, with
`projection` returning 30 in the same range as the positive control, so the probe was alive and the
absence real.

**So an opus reviewer there is not opus-by-exception under a sonnet default. It is the sonnet row not
covering the case.** The distinction matters for the cost ruling: exceptions invite argument, an
unsatisfied precondition does not.

**Procedure, because it turns a judgment call into a measurement:** before defaulting a reviewer to
sonnet, grep the task's own line range for the security-relevant terms that task is supposed to cover,
with a positive control from the same run. Most tasks pass. This one measurably does not.

*(The older table elsewhere in this document reads "Per-task reviewers | opus | high" — superseded by
the cost ruling, do not cite it.)*

---

## A closer named where the evaluator's reader looks, and absent where the task's reader looks (2026-08-31)

**The lifted Plan 10 Task 4 was moved out of Plan 10's position specifically to close §11's
envelope-coherence window. Its own plan text does not mention that window anywhere.**

The assignment exists in exactly two places, and neither is the task:
1. This document's *"Still open, unchanged: §11's envelope-coherence check (Plan 10 T4)."*
2. `packages/rule-engine/src/contests.ts`'s docblock — *"Enforcing that coherence belongs to the
   constructor that builds contests server-side (Plan 10 Task 4)."*

**So the closer is named where a reader of the EVALUATOR would find it, and absent where a reader of the
TASK would.** An implementer following T4's eight steps faithfully ships the projection, the engine
lookup and the route — and leaves the window open, having done everything the task asked.

**The generalisation, and it is the reason this is recorded rather than just fixed: lifting a task
changes WHEN it runs, not WHAT ITS TEXT SAYS.** A schedule change cannot carry an obligation that lives
only in another document. **When an obligation is assigned to a task from outside that task, the
assignment must be written INTO the task's own text, or the next reader of that task will not perform
it** — and the more faithful they are to the plan, the more certainly they will miss it.

**Corollary for every remaining lifted or re-sequenced item in the serial order:** before dispatching
one, sweep its own range for the thing it was moved to do. If the terms are absent, the dispatch must
carry the obligation explicitly, because the plan text will not.

---

## The sweep for an externally-assigned obligation must DISCRIMINATE, not just confirm (2026-08-31)

Step 6 established that **lifting a task changes when it runs, not what its text says**, and that any
obligation assigned to a task from outside must be carried by the dispatch. Applied to Plan 4 Tasks
8–14, the sweep produced three results and **the discriminating one is worth more than the confirming
ones**:

| task | range | terms swept | result | control |
|---|---|---|---|---|
| **T8** | 3292–3635 | `branded`, `opaque`, `EffectiveRole`, `exhaustive` | **all 0 — BLIND** | `404`=12, `proj_tickets`=4 |
| **T13** | 5008–5244 | `already exists`, `half-founded`, `repair` | **all 0 — BLIND** | `workspace.created`=4 |
| **T9** | 3635–4039 | `guest`, `visibility.set`, `project-admin`, `creatorship` | **all present — SIGHTED** | `permission.role`=9 |

**The rule this yields:**

> **A BLIND task needs the obligation carried in the dispatch. A SIGHTED one needs only the urgency
> explained.**

Without that distinction the sweep degenerates into pasting every standing ruling into every dispatch —
which **buries the two that genuinely are not in the text** among a dozen that are. The sweep's value is
in the zeros, and a zero is only legible beside a control.

*(Two sessions ran this sweep independently and got different counts for `guest` — 22 vs 30 — because one
counted matching LINES and the other matching OCCURRENCES. Immaterial here, and worth noting anyway: two
correct answers to two different questions, which is the `@{u}` family again. The discrimination held
under both.)*

### The correction this produced to Ruling P19's own framing

P19 was being read — by both sessions — as *"Task 9 must remember to write these checks."* **That was
never the risk.** The sweep shows the checks are natively in T9's text; P19 was *derived from* T9's own
check list. The actual hazard was that **Task 5's absence list declared the category "role" CLOSED**,
which would have told T9's implementer there was nothing left to do.

**That list was corrected in step 4, so P19 is HANDLED, not merely ASSIGNED.** Those are different
states, and a later reader seeing "P19, owner T9" would otherwise re-derive the wrong worry and go
looking for missing checks that are present.

**Generalisation: when a ruling names an owner, say whether the owner still has WORK or only has a
DEPENDENCY that has since been satisfied.** An owner line is not a status.

---

## A half-applied opaque type is worse than the convention it replaces (2026-08-31)

Recorded when Ruling P22's closer — branding `EffectiveRole` so only `resolveEffectiveRole` can produce
one — was dispatched to Plan 4 Task 8 **with an explicit licence to defer.**

**The reasoning, which generalises past this instance:** a brand that covers some construction sites and
not others **looks enforced**. A reader seeing an opaque type reasonably stops checking provenance by
hand — that is the entire point of the type — so a partial brand withdraws the human check while
supplying only part of the machine one. The convention it replaced was at least honestly unenforced.

**This is the same family as a vacuous test and a blind instrument: the failure is not the absence of
protection but the FALSE APPEARANCE of it.** Each of the three passes something that looks like a check
and answers a question nobody asked.

So the dispatch said: brand it if genuinely mechanical; **if it ripples into surfaces Task 8 does not
own, say so plainly and leave 6.64 recorded with the mechanism named.** An honest deferral is not a miss
here, and must not be read as one.

### Ruling P22 is CLOSED — verified independently, not accepted from a report

Plan 4 Task 8 branded `EffectiveRole` with a real module-private `unique symbol` in
`apps/server/src/permissions/effective-role.ts`. **Verified by the executor rather than taken from a
zero-finding review, because a security closer's own report is the last thing that should establish it:**
a probe constructing `const forged: EffectiveRole = { workspaceRole: 'owner', projects: new Map() }` —
exactly the right shape, no provenance — now fails to compile with

> `TS2741: Property '[RESOLVED]' is missing in type '{ workspaceRole: "owner"; projects: Map }' but
> required in type 'EffectiveRole'.`

**So "verified by convention" became "unconstructable elsewhere", and every future misuse in Task 9,
Task 11 or Plan 10's sync filter is now a compile error rather than a silent grant.** The ripple was
exactly the two hand-build sites the ruling predicted, both in tests.

**The deferral licence was not needed — but it was still the right thing to grant**, and the reasoning
stands for the next closer of this kind: a brand covering some construction sites and not others *looks*
enforced, which is worse than an honestly unenforced convention.

---

## The sweep for an externally-assigned obligation must DISCRIMINATE, not just confirm (2026-08-31)

Step 6 established that **lifting a task changes when it runs, not what its text says**, and that any
obligation assigned to a task from outside must be carried by the dispatch. Applied to Plan 4 Tasks
8–14, the sweep produced three results and **the discriminating one is worth more than the confirming
ones**:

| task | range | terms swept | result | control |
|---|---|---|---|---|
| **T8** | 3292–3635 | `branded`, `opaque`, `EffectiveRole`, `exhaustive` | **all 0 — BLIND** | `404`=12, `proj_tickets`=4 |
| **T13** | 5008–5244 | `already exists`, `half-founded`, `repair` | **all 0 — BLIND** | `workspace.created`=4 |
| **T9** | 3635–4039 | `guest`, `visibility.set`, `project-admin`, `creatorship` | **all present — SIGHTED** | `permission.role`=9 |

**The rule this yields:**

> **A BLIND task needs the obligation carried in the dispatch. A SIGHTED one needs only the urgency
> explained.**

Without that distinction the sweep degenerates into pasting every standing ruling into every dispatch —
which **buries the two that genuinely are not in the text** among a dozen that are. The sweep's value is
in the zeros, and a zero is only legible beside a control.

*(Two sessions ran this sweep independently and got different counts for `guest` — 22 vs 30 — because one
counted matching LINES and the other matching OCCURRENCES. Immaterial here, and worth noting anyway: two
correct answers to two different questions, which is the `@{u}` family again. The discrimination held
under both.)*

### The correction this produced to Ruling P19's own framing

P19 was being read — by both sessions — as *"Task 9 must remember to write these checks."* **That was
never the risk.** The sweep shows the checks are natively in T9's text; P19 was *derived from* T9's own
check list. The actual hazard was that **Task 5's absence list declared the category "role" CLOSED**,
which would have told T9's implementer there was nothing left to do.

**That list was corrected in step 4, so P19 is HANDLED, not merely ASSIGNED.** Those are different
states, and a later reader seeing "P19, owner T9" would otherwise re-derive the wrong worry and go
looking for missing checks that are present.

**Generalisation: when a ruling names an owner, say whether the owner still has WORK or only has a
DEPENDENCY that has since been satisfied.** An owner line is not a status.

---

## A half-applied opaque type is worse than the convention it replaces (2026-08-31)

Recorded when Ruling P22's closer — branding `EffectiveRole` so only `resolveEffectiveRole` can produce
one — was dispatched to Plan 4 Task 8 **with an explicit licence to defer.**

**The reasoning, which generalises past this instance:** a brand that covers some construction sites and
not others **looks enforced**. A reader seeing an opaque type reasonably stops checking provenance by
hand — that is the entire point of the type — so a partial brand withdraws the human check while
supplying only part of the machine one. The convention it replaced was at least honestly unenforced.

**This is the same family as a vacuous test and a blind instrument: the failure is not the absence of
protection but the FALSE APPEARANCE of it.** Each of the three passes something that looks like a check
and answers a question nobody asked.

So the dispatch said: brand it if genuinely mechanical; **if it ripples into surfaces Task 8 does not
own, say so plainly and leave 6.64 recorded with the mechanism named.** An honest deferral is not a miss
here, and must not be read as one.

---

## A right answer from an over-specific sweep, caught by re-running it in the author's vocabulary (2026-09-01)

**The blind/sighted sweep for Plan 4 Task 13 returned the correct verdict on evidence that did not
support it**, and it was caught only because the controller's own rule — *search for the fact in the
vocabulary the OTHER author would have used, not in yours* — was applied a second time.

**First pass**, using the phrasing from the catalogue entry: `"already exists"` → **0**, `repair` → 0,
`half-founded` → 0. Verdict: T13 is blind to case 6.52. **Second pass**, in the plan author's own
vocabulary: `duplicate` → **2**, `already` → **1**, `founding` → 12.

Reading the rows rather than the counts settles it, and the distinction is the whole point:

* T13's text **does** cover a **re-submitted SAME event id** — case 6.26, *"re-submitting the same
  founding event id answers `duplicate-event-id` and bootstraps nothing a second time."*
* Case **6.52** is a second `workspace.created` carrying a **FRESH id**, which still commits.

**Those are different paths, and the difference is exactly what step 4's privilege escalation turned
on.** A same-id duplicate has `committed === null`, so the bootstrap never re-fires; a fresh id walks a
path the same-id guard never sees. The escalation survived 28 tests and 11 dead mutations precisely
because its own test exercised the same-id path and was named for the property.

**So the verdict "blind to 6.52" is right, and the first pass's zeros were not the reason.** Had the
plan author happened to write "already exists", the first sweep would have returned a hit and produced
the *wrong* verdict — sighted — on a task whose text addresses a neighbouring path and not this one.

### Two rules, and the second is the sharper

1. **Run the sweep twice: once in your vocabulary, once in the author's.** A single exact-phrase sweep is
   biased toward "absent" by construction, in the same way an exact-phrase sweep across many files is
   biased toward "unique to this file".
2. **A hit is not the end of the sweep — READ THE ROW.** A near-miss hit is more dangerous than a zero,
   because it reads as coverage. Here, `duplicate` × 2 would have retired the finding, and both hits are
   about a different path than the one at issue. **The sweep's output is a place to look, not an answer.**

**Consequence for T13's dispatch:** it must say explicitly that the plan covers the same-id duplicate and
is silent on the fresh-id one — because an implementer who greps their own text, finds 6.26, and
concludes the duplicate case is handled will ship 6.52 open, having checked.

---

## Pair a mutation that kills nothing with one that kills, or report neither (2026-09-01, floor-list review of Plan 4 T11)

**"343/343 still green" is equally consistent with a coverage gap and with a mutation that never ran, and
those two demand opposite responses.** One says write a test; the other says the check you were about to
condemn is fine. The record already carries the principle; this is the first run that ships a
**demonstration**, in one suite, in one sitting:

| mutation | result | what it establishes |
|---|---|---|
| **M-A** — delete the `canSee` guard around `yield env` | **7 of 16 cases redden**, both arms of case 6.16 by name | the visibility filter is genuinely exercised |
| **M-B** — `throw` in the non-guest re-grant arm | **343/343 green, TURBO_EXIT=0** | that arm is an **unexecuted path** |

**M-B alone proves nothing. Beside M-A it proves everything** — the harness runs, the file is reached,
the suite is live, so a survivor is a real gap rather than a dead instrument.

> **THE RULE: a mutation that kills nothing is not evidence until a mutation that DOES kill has run
> beside it, in the same suite, in the same run.**

Same family as the stale-`dist` entry and the right-answer-on-dead-evidence entry, and this is their
operational form: **before believing a survivor, prove the instrument can kill.**

---

## Two guest disclosures in this record are NOT the same class — do not file them together

Both are Critical, both name a guest, and **their remedies differ completely.** A reader who groups them
will over-scope one and under-scope the other.

| | **P19 — guest admissions** | **T11 — purge disclosure** |
|---|---|---|
| What is wrong | **ledger rows** written by an under-gated door | a **read-path computation** over correct rows |
| Store | append-only by trigger | derived, recomputed per request |
| Remedy | closes the door for the FUTURE; existing rows can only be **superseded, never removed** | **complete AND retroactive the moment it lands** |

**No ledger row is wrong in the T11 case.** The events are correct; the generator was deriving a purge
list from them without a role test. Fix the derivation and every past and future sync is correct — there
is nothing to migrate, supersede or apologise for.

**The general form, which is why this distinction is worth a section:** *when triaging a disclosure, ask
whether the wrong thing was WRITTEN or COMPUTED.* A written wrong is permanent in an append-only store
and its blast radius is every reader forever; a computed wrong dies with the code that computed it.

---

## `pnpm run` DOES warn on the wrong Node — the shared record said otherwise, and it was measured wrong

`docs/lanes/controller-state.md` recorded that pnpm accepts an unsupported Node *"with no refusal and not
a single warning."* **Half true, and the false half is the load-bearing one.** Re-measured today with
v22.22.2 as the control:

| command | Node v24.11.1 | Node v22.22.2 (control) |
|---|---|---|
| `pnpm run` | **`WARN Unsupported engine: wanted: {"node":">=22.0.0 <23"} (current: {"node":"v24.11.1",…})`** | silent |
| `pnpm exec` | **silent** | silent |

**Every gate runs through `pnpm run`.** So the gate is NOT unguarded: **if `WARN Unsupported engine`
appears anywhere in gate output, you are on the wrong Node and the run is not evidence.** That upgrades
the Node gap from *"nothing enforces it"* to *"the output names it, if you read it"* — which is a
detection, not a prevention, and still argues for the `.nvmrc` + `engine-strict` fix owned by Plan 11.

**How the original error happened is the reusable part:** the earlier probe used `pnpm exec node -v`,
observed silence, and generalised to "pnpm". **The instrument was real and its scope was narrower than
the claim built on it** — the `@{u}` family again, right answer about the wrong subject.

---

## A dead branch in plan text is worse than a missing one, and transcription fidelity makes it worse still

Plan 4 Task 11's text opens `if (eff.workspaceRole === null) return;` and places the
`membership.revoked` purge branch **inside the loop below that return**. But a revocation deletes the
workspace-scope row — **the revoked user's role IS null.** The generator returns before ever reaching the
branch written to serve exactly those people.

**Consequence had it shipped as written: every ticket on a revoked user's device stays there forever.**
The code looks complete, reviews as complete, and is unreachable by construction.

**And the more faithfully an implementer transcribes the plan, the more certainly they ship it** — which
inverts the usual assumption that fidelity to a reviewed plan is the safe path. **State this in the PR as
a PLAN-TEXT defect, not an implementation one**, or the next reader credits the implementer with a bug
they in fact caught.

**Also found here: five purge triggers, not three** — `visibility.set`, `ticket.reparented`, the
inheriting subtree under either, `project.member_removed`, `membership.revoked`. The brief said three.
**Carry the corrected count into later dispatches in WRITING**: an obligation discovered outside a task's
text does not reach the next implementer unless it is written into that text.

---

## THE FAILURE CLASS A POSITIVE CONTROL CANNOT CATCH: a true answer about the wrong subject (2026-09-01)

Three instances in one session, and separating them from the rest of this document is the point of the
entry — **every other trap here is caught by asking whether the instrument works. This one is not,
because in all three cases the instrument worked perfectly.**

| instrument | what it truthfully answered | what the sentence written from it claimed |
|---|---|---|
| `git merge-tree --write-tree` vs a tree | **"did this conflict"** — it writes conflict markers INTO the tree | *"is this branch redundant"* — a conflicting branch can never compare equal, whatever its content |
| `git rev-list --left-right --count @{u}...HEAD` | **"how far ahead of the upstream this branch was CREATED with"** — `-b <name> origin/main` sets that to `origin/main` | *"is my work pushed"* — it returned **`0 6` immediately after a successful push** |
| `pnpm exec node -v` | **"does `pnpm exec` warn"** — it does not | *"does pnpm warn"* — `pnpm run` **does**, and every gate runs through `pnpm run` |

**None of these is a broken tool, a stale instrument, or an eaten glob.** Each ran correctly, returned a
true value, and was read as answering a neighbouring question.

### Why this is structurally different from everything else recorded here

**All three passed every falsifiability check this project applies.** Positive controls, mutation
evidence, print-the-rows, rebuild-and-probe — **every one of those asks whether the INSTRUMENT WORKS.**
In all three cases it did. **Not one of them asks what the instrument was POINTED AT.**

So a positive control is *structurally incapable* of catching this class, which is precisely why it
recurs. A control confirms the probe can produce a signal; it says nothing about whether the signal is
about your subject.

### The check, and it has to be a different shape

> **Name the subject your instrument actually ranged over. Then reread your sentence and check it names
> the same subject.**

Not "did this run correctly" but "what, exactly, was measured". `merge-tree` ranged over a *merge*;
`@{u}` over *whatever upstream the branch was born with*; `pnpm exec` over *`pnpm exec`*. Each sentence
silently widened to *branch redundancy*, *pushed-ness*, *pnpm*.

**Corollaries earned the same day:**
* **Name the ref, don't trust the symbol.** `@{u}` is not a stable referent — say `origin/<branch>`, and
  repoint the upstream so the symbol means what a copier will assume.
* **A generalisation from one command to its family is a new claim and needs its own probe.** `exec` to
  `run` was one word and inverted the conclusion.
* **The instrument's own scope belongs in the sentence.** *"`pnpm exec` is silent"* would have been true
  and harmless; *"pnpm is silent"* was neither.

---

## Ruling P23 (2026-09-01) — RESOLVED. Do not re-run this probe.

**Disposition, stated so nothing downstream is ambiguous:**
* The **guest-side** purge disclosure is **gated** (`!isGuest`). Closed.
* The **member-side PER-EVENT** purge from the subtree walk is **gated too**. The under-purge residual —
  an entity that genuinely became invisible may not be purged, leaving stale local data until a full
  resync — is **disclosed** as a sibling of case 6.102, **owner Plan 10**.
* The **scope-wide** itemised purge at the revocation boundary **stands, untouched.** Its blessing is
  carried by three corroborating sources, one of which (`Features.md`) had **already shipped the rule** —
  so the guest-side behaviour was a failure to honour an existing contract, not a fix inventing an
  allowance. **A fix round is not the place to reopen a shipped contract.**
* **Prior audience is NOT reconstructed** — cases 6.82/6.94's second-definition ban holds.

**The probe that settled it was already in the suite.** No new experiment was run: the shipped case 6.101
seeds a ticket in a project the viewer was **never on**, asserts `canSee(...) === false`, and then
asserts `purge:<that id>` IS yielded. Relationship absent, therefore branch one. **Better than a fresh
experiment, because it is already in the suite and cannot drift out of it.**

### The reason the extension failed, and it is not "unconvincing"

The precedent (case 6.14) is tolerable on **cardinality AND relationship**, and **relationship is the
axis doing the work**: 6.14 is acceptable because the viewer **already holds the child**, so the id names
something they have a relationship to. **Drop that axis and 6.14 degenerates into "small leaks are
fine", which is not what it says.**

The cardinality half was also unsound on its own terms: *"one subtree per event is smaller than the whole
workspace at once"* compares a **per-emission** quantity against a **per-boundary** one — the
wrong-subject class again. The per-event walk fires far more often, and **nobody measured the integral
over a sync window.** An unmeasured integral is not an argument; it is a reading nobody took.

---

## An inability to tell two cases apart is a reason to take the SAFE branch, not a licence to take the unsafe one

**The most valuable thing to come out of P23, and it was hiding in a test's explanatory comment beside a
passing assertion.**

Case 6.101's comment defended the disclosure like this: `canSee` asked NOW is *"true of a ticket taken
away and equally true of one never held, and this module cannot ask the other question."* True — and
then it reasoned **from that inability to a permission to disclose.**

**The valid inference from indistinguishability always runs toward the conservative case.** Here the
asymmetry is total and settles it without further argument: **under-purge is recoverable by a resync; a
disclosure is not recoverable at all.** The module cannot distinguish *lost access* from *never held*, so
it must treat both as *never held* and withhold.

### The tell, written down so it is recognisable in advance rather than in hindsight

> **A sentence of the form "X and Y are indistinguishable here, so we treat both as Y" — where Y is the
> PERMISSIVE case.**

The same sentence with Y as the restrictive case is sound engineering. The permissive form is a defect
wearing the costume of a limitation, and it reads as candid — it *admits* the module cannot tell — which
is exactly what makes it persuasive.

### Where it was hiding is half the lesson

**In a test's explanatory comment, beside a passing assertion.** The test pinned the wrong behaviour AND
shipped the argument for it, so anyone reading the test as documentation propagates the defect rather
than catching it. **A green suite is not evidence that the behaviour it pins is correct** — an
uncomfortable sentence for a project that leans on its suite as hard as this one, and the reason the
remedy was to **rewrite the comment**, not merely flip the assertion. A false sentence a maintainer
reasons from is worse than a missing one.

**And note the guest side had already been gated for this exact reason.** The member side inherited the
same blind spot at a smaller radius and kept it, because the radius made the argument feel different when
the structure was identical.

---

## Three sweeps of one question, three different answers — and the middle one nearly won (2026-09-01)

Sweeping Plan 4 Task 14 for whether its text addresses invite-token **lifetime**:

| pass | method | result | verdict |
|---|---|---|---|
| 1 | `expiry`, `expire`, `single-use`, `reuse` — my vocabulary | all **0** | BLIND |
| 2 | plus `ttl`, `consumed`, `one-time` — the author's likely vocabulary | **`ttl` = 4** | *"sighted, my first pass was over-specific"* |
| 3 | same terms, **word boundaries**, with `invite` = 37 as control | `ttl` **0** | **BLIND — pass 1 was right** |

**Pass 2's four hits were the letters `ttl` inside the word `SETTLED`.** `se`**`TTL`**`ed`. The count was
real, the substring was really there, and the sentence built on it — *"T14 addresses token TTL"* — was
false. **It would have retired a genuine finding, and it arrived wearing the authority of a
self-correction**, which is the part that makes it dangerous: pass 2 felt like the standing rule
*"search in the author's vocabulary"* working, and rules that have just been validated are the ones
least likely to be re-checked.

### This is the wrong-subject class again, at the token level

`awk 'index($0,"ttl")'` truthfully answered **"which lines contain those three characters anywhere"**.
It was read as **"which lines mention TTL"**. Same shape as `merge-tree`, `@{u}`, `pnpm exec` and
`git checkout --`: a real instrument, a true answer, a narrower subject than the sentence.

**Instance five, and the first where the two subjects differ only by tokenisation** — which is why the
usual corrective (name the subject) is not enough on its own here. The subject *sounds* identical:
"lines mentioning ttl". The difference lives entirely in what counts as a mention.

### The rules

1. **A substring search is not a word search.** For any short term — three or four letters, or one that
   is a common fragment — use a boundary-anchored pattern:
   `$0 ~ "(^|[^a-zA-Z])" t "([^a-zA-Z]|$)"`. `ttl`, `id`, `key`, `arg`, `sec`, `env`, `run` are all
   fragments of ordinary English or of each other.
2. **A hit is not the end of a sweep — READ THE ROW.** This is now recorded twice, and both times the
   count was real and the rows disagreed with it. Pass 2's rows were about *settled owner decisions* and
   had nothing to do with tokens.
3. **A self-correction gets the same scrutiny as the claim it corrects.** Pass 2 reversed a finding and
   was believed *because* it looked like a rule being applied. **A correction is a new claim, with its
   own instrument, and it needs its own control.**

**The finding that survives:** Plan 4 Task 14's text says the invite token is a credential that never
enters the ledger, and that `invite_tokens` is a server-owned table deliberately excluded from
`reset()` — both good and both about *storage*. It says nothing about **expiry**, **single-use**, or
**consumption on acceptance**. An invite token with neither is a **durable, replayable credential**:
anyone who ever sees the link joins at the granted role, repeatedly, forever. **Carried into batch 4's
dispatch in writing, because the plan text will not raise it.**

---

## The wrong-subject class caught in BOTH directions, about one instrument, within an hour (2026-09-01)

The standing rule says: *if `WARN Unsupported engine` appears in gate output you are on the wrong Node and
the run is void.* Task 14's implementer reported the instrument **inert** — that `pnpm run` in a workspace
package prints no warning under Node v24, because `engines` lives only in the **root** manifest and
`pnpm run` reads the manifest of the package it is invoked in. It added `test/node-version.test.ts` to
replace the instrument it believed was dead.

**Both parties measured truthfully. Both generalised past their subject. In opposite directions.**

| # | invocation | Node v24 | who measured it |
|---|---|---|---|
| A | bare `pnpm run` in `apps/server` | **1 WARN** | — |
| B | `pnpm run typecheck` in `apps/server` | **0 WARNs** | the agent — **claim correct** |
| C | **`pnpm turbo run typecheck --force` at the repo ROOT — the actual gate** | **1 WARN** | the executor — **rule correct** |
| D | control: C under v22.22.2 | **0 WARNs** | — |

**The agent measured B and wrote "the instrument is inert here." It never ran C, which is the only
invocation the rule was ever about.** The executor measured C and wrote "pnpm run warns." It never ran B,
which is where a reader following a package-local workflow would look.

**Neither statement is false. Neither is adequate.** And note A vs B: the *same command* in the *same
directory* differs by whether a script name follows it.

### Why this instance is worth its own entry

**The class was already recorded, with five instances and a stated check — and it still caught both
sessions, on the same instrument, in the same hour, while both were consciously applying the rule.**
Knowing about the trap is demonstrably not sufficient protection against it.

The reason it recurs is structural: **naming your subject requires already suspecting that a
neighbouring subject exists.** The executor did not think "root versus package" because the gate is
always run from root; the agent did not think "package versus root" because it was working inside a
package. **Each party's habitual context silently supplied the scope of the sentence.**

### What actually caught it

**Not a control** — both measurements had controls and both controls passed. It was caught because two
parties with different habitual contexts measured the same instrument and **disagreed**, and the
disagreement was investigated rather than adjudicated. That is not a technique available to one session
alone, and it is the clearest argument yet for the two-session split.

**The nearest single-session substitute, and it is weaker: enumerate the invocations that matter before
measuring any of them.** Here: root vs package, with-script-name vs without. Then measure each and put
the table in the record rather than a sentence.

### Disposition

**The standing rule STANDS, unchanged** — the gate runs from root, C warns, D is silent. **And T14's
`node-version.test.ts` is kept**, because a test that asserts its own Node inside the gate is stronger
than a warning a reader must notice: it fails loudly rather than printing quietly. Verified both
directions by its author — green on v22.22.2, and on v24.11.1 it fails naming the version.
**Its justification is corrected in place: the instrument was never inert for the gate.**

**A footnote, because it happened in the very act of checking this:** the executor's first attempt at C
used `timeout`, which does not exist on this machine, so the command exited 127 and reported *0 WARNs* —
a wrong answer from a command that never ran, produced while investigating wrong answers from commands
that did. Caught by reading the exit code instead of the WARN count.

### Instance seven, and this one CAUSED a Critical rather than merely misreporting one

Plan 4 Task 14 shipped a single-use invite token that admitted **N concurrent acceptances** — measured
at **24 of 25 trials**: three parallel presentations of one token, three `admin` rows, three
`membership.granted` events. The projection's `AND status = 'pending'` then dropped every acceptance but
the first, so the record named **one** acceptor while three joined. **A defect that erased its own
evidence.**

**Its root cause was this class.** The task had reasoned that atomic consumption was unavailable because
`commitOne` opens its own connection and a route cannot enlist in its transaction. **That is TRUE — of
the LEDGER.** It was generalised into a claim about **the token**, and `invite_tokens` is server-owned,
is not a projection, and nothing else writes it: the route owns its transactions there outright. One
conditional statement — `DELETE ... WHERE token_hash = $1 AND expires_at > now() RETURNING` — is one
transaction, and concurrent presentations queue on the row lock and match nothing.

**So the sentence "atomicity is unavailable here" was a true fact about one subject, applied to a
neighbouring one, and it licensed shipping a permanent multi-admin door.** Every earlier instance of this
class produced a wrong *report*. This one produced a wrong *product*.

**The tell, had anyone been looking for it: the word "here".** *"Atomicity is unavailable **here**"* —
`here` is a scope word, and a scope word is exactly where a subject silently widens. Same shape as
*"the instrument is inert **here**"* one task earlier.

**Two method results from the same round worth keeping:**
* **The reproduction was committed RED before the fix** (`5575c9a`, *"one invitation token, three
  parallel presentations, three admins"*). A test that has been seen to fail for the stated reason is
  worth more than one that has only ever passed — and a *sequential* accept-then-accept test passed on
  the broken code and would have shipped it.
* **A survivor was retained with its killer named in the same round:** dropping expiry from the consume
  alone killed nothing, dropping it from `openableInvite` alone killed one, and dropping **both** killed
  two. The two clauses are alternatives and neither is load-bearing alone — a fact only visible because
  the pair was run together rather than the survivor being reported by itself.

## Plan 5 execution consequences (2026-09-01) — two contract widenings and one owner question

Recorded by the serial executor at Plan 5 Task 7, in the same change set that made them, per the
executor brief's rule that anything outside a task's scope is **recorded with a named owner rather
than fixed silently**. Both reviews of Task 7 were clean; these are not defects. They are shape
changes a later plan compiles against, and the expensive version of this note is the one written
after Plan 6 fails to build.

### 1. `TicketRollup` is FOUR fields, not the three Plan 5 specified — binding on Plans 6, 9 and 10

Shipped shape:

```ts
type TicketRollup = {
  totalChildren: number;        // over ALL children, viewer-invariant
  terminalChildren: number;     // over ALL children, viewer-invariant
  restrictedCount: number;      // per-viewer — what the disclosure is honest WITH
  uncategorizedChildren: number; // children whose category nothing knows
};
```

`uncategorizedChildren` is the added one and it is **not padding**. The rollup counts categories via
`LEFT JOIN proj_tickets`, and that join CAN miss — commonly in fixtures that seed a subset of the
registry (`test/helpers/seed.ts`'s `applyAll` seeds four projections, not `proj_tickets`). Folding a
miss into "not done" would have been a view-model quietly asserting something it does not know, which
is the exact failure Task 7 exists to prevent. So the miss is **counted and named**. Plans 6/9/10 render
this through the `DataSource`: **a renderer that shows `terminalChildren` of `totalChildren` without
consulting `uncategorizedChildren` is showing a progress bar that is silently incomplete.**

### 2. `RollupView` gained `terminal` and `uncategorized`, and a SHIPPED ROUTE'S BODY CHANGED

`apps/server/src/visibility/rollup.ts`'s `RollupView` was `{total, restrictedCount}`. Plan 5's text
assumed `{total, open, active, terminal, restrictedCount}` and read `rollupView.terminal`, which did
not exist — caught by the adaptation map before an implementer met it. It is now
`{total, terminal, uncategorized, restrictedCount}`; `open` and `active` stay absent because nothing
reads them.

**The consequence that reaches outside Plan 5:** `GET /v1/workspaces/:ws/tickets/:id` returns the view
verbatim, so **that response body now carries two additional keys.** Additive, so no client breaks —
but it is Plan 4's read path, changed by a Plan 5 task. **Owner: Plan 4's read path.**

The alternative — sourcing `terminalChildren` from the shipped `proj_rollups.terminal_children` column
— looked free and was **ruled out by measurement, not taste.** `rollupFor` walks
`proj_visibility WHERE parent_id = $1` with **no workspace clause** (deliberately, case 6.84: dropping
a cross-workspace child would understate a total this design exists to keep honest), while `getRollup`
and `recomputeParent` are `workspace_id`-scoped. The two enumerate **different child sets**, so a
`totalChildren` from one table beside a `restrictedCount` from the other can emit
`restrictedCount > totalChildren`. A test builds the cross-workspace child and watches the two counts
part, 2 against 1 — closing case 6.83, open since Plan 3's handoff.

### 3. OWNER QUESTION, not a ruling: does the done-count cross the visibility boundary?

`terminalChildren` counts children **the viewer cannot see** — strictly more disclosure than
`totalChildren`, which reveals existence; this reveals state. The implementer and the reviewer arrived
at the same reading independently, and **both flagged the same uncertainty**, which is why it is here
rather than buried.

The support is the product design doc, line 116: *"5 of 8 done · 2 restricted … nothing pretended
absent."* It reads unambiguously as a done-count over all children. But it is a brief's **illustrative
phrase, not a ruling on this API shape.**

**Conservative default in force: shipped as the spec's plain reading says.** If the owner reads that
line more narrowly, `terminalChildren` becomes per-viewer and the disclosure argument collapses. The
change would be local — one `LEFT JOIN` predicate and its tests — so this is cheap to reverse and is
recorded rather than escalated.

### 4. The prototype-key class, swept across Plan 5's own files — one fixed, one recorded

Added at the Task 9b fix round (2026-09-02). A state id, a field id and a filter key are all
`z.string().min(1)` and nothing more, so **any plain object indexed by one of them can be walked
into `Object.prototype`.** Two distinct failure modes, and they are not the same bug:

- **A method** (`toString`, `valueOf`, `constructor`) — a READ finds an inherited function where the
  code expected `undefined`. A WRITE is safe: plain assignment creates an own property that shadows
  the method. This is what case 7.88 closed in the bulk rebind's `stateMap`.
- **`__proto__`** — an ACCESSOR PAIR. A read finds `Object.prototype`; a **write of a non-object is
  silently discarded**, creating no own key and throwing nothing. This is what case 7.89 closed in
  `readStateOccupancy`, where a whole state and its live tickets were absent from the response.

**Swept:** every source file Plan 5 created — `routes/{board,list,builder-reads}.ts`,
`read/{compile-filter,membership,sql-params,state-provenance,ticket-cards,visible-where,workflow-defs}.ts`,
`projections/{search,workspace-settings}.ts`, `domain/src/{filter-spec,read-models}.ts` and
`domain/src/events/workspace-settings.ts`. Every other keyed collection on the surface is already a
`Map` or a `Set` (`blockedStateKeys`, the board's `byColumn`, the list's `buckets` and `epics`,
`stateProvenanceFor`, `latestWorkflowDefs`). `ticket-cards.ts` reads `row.fields['title']` and
`row.fields['dueDate']` from an actor-keyed object, but the INDEX is a fixed literal that is not on
`Object.prototype`, so it is not an instance of this class. **`readStateOccupancy` was the only one,
and it is fixed.**

**RECORDED, NOT FIXED — outside Plan 5's files.** `foldStateIdForward` in
`packages/domain/src/workflow.ts:120` reads `def.stateMapping[current]`, where `current` is a state
id that came from a ticket and `stateMapping` is a plain object parsed out of a stored definition
(`stateMappingSchema = z.record(z.string(), z.string())`, which constrains neither key nor prototype).
A ticket parked in a state called `toString` therefore folds through a version whose mapping does not
name it and reads `Object.prototype.toString` as the target: `mapped !== undefined`, so the walk
continues with a FUNCTION in a variable TypeScript believes is a `string`, and the refusal that
eventually comes out carries that function as its `unmappedStateId` instead of the state id it is
required to name. **Owner: Plan 3, which owns THE ONE VERSION WALK** (that docblock's own words —
the engine, the server's refresh-on-publish and Plan 10's replica all route through this function, so
a fix here is a fix in three places and must not be made from a Plan 5 task). **Plan 8 is the first
plan that can author a `stateMapping` at all**, so it is the plan that makes the hazard reachable
through a shipped door, and the natural place to close it is the same one-line change made twice here.
Not fixed from this fix round on purpose: reaching outside the task's files is what hides compounds,
and this one is a wrong refusal MESSAGE rather than a wrong refusal.

### 5. EXECUTOR RULING (2026-09-02): a guest may NOT call `GET /v1/workspaces/:id/members`

A ruling on a genuine ambiguity, not a defect report, and a **conservative default taken where the
plan is silent.**

Plan 5 Task 9b settles who is **HIDDEN** from the roster listing — guests are withheld from
non-admin callers — and never says who may **CALL** it. So the caller question fell through to this
surface's blanket "not a member → 404", under which a guest passes `requireMember` like anyone else.
The shipped consequence was that a guest invited to ONE shared ticket received the workspace's entire
non-guest staff directory, user ids and display names, and nothing in that response is about their
ticket.

The withholding rule's own stated rationale decides it: a guest is *"a person invited to one shared
ticket, not a member of the workspace's roster"*, and handing that person the full directory is the
mirror of the leak the rule exists to prevent. The roster's stated purpose — *"the people a
`require-different-user` rule can name"* — is workflow-builder work, which is owner/admin work.

**Shipped:** the `/members` door is `no-guests`; a guest draws the same `READ_NOT_FOUND_BODY`, with
the same headers, that every other refusal on this prefix answers. Case 7.91 asserts the refusal and
carries three positive controls (the same guest still reads `/workflows` and `/ticket-types`; a
non-guest member still reads the roster). The assertion that previously pinned the permissive
behaviour — case 7.39's third case, "a guest asking for the roster gets the non-guest members" — is
replaced by it rather than left standing beside a contradiction.

**Cheap to reverse:** one enum value at `door()` and that one case. If the owner reads the plan the
other way, a guest gets the guest-withheld roster back and nothing else moves. **Owner: Plan 8's
workflow builder**, which is the consumer that actually needs the roster, and the plan that would
notice if guests were meant to have it.

### 6. Preferences (Task 13): a contract NARROWED, a shape Plan 6 disagrees with, and three residues

Added at Plan 5 Task 13 (2026-09-02), in the same change set. Nothing here is a defect in the
shipped code; all five are things a later plan compiles or reasons against, recorded rather than
decided by an executor.

**6a. `listColumns` and `grouping` keys are ULIDs, not arbitrary strings — a TIGHTENING of amendment
14. Owner: this document.** The plan text declares `Record<string, …>` "keyed by project id". The
shipped schema keys both records with `ulidString`, and that is a guard rather than tidiness:
MEASURED on zod 3.25.76, `z.record(z.string(), …).parse(JSON.parse('{"__proto__": ["status"]}'))`
**succeeds and answers `{}`** — the key is assigned onto a plain object, goes through
`Object.prototype`'s accessor, and creates no own property. Under a full-replace PUT the server would
then store, and answer, a document the caller never sent. With the ULID key schema the same document
is refused at the door. Every project id in this product is a bare ULID (`ids.ts`: `membership` is the
one entity kind whose id is not), so nothing legitimate is refused — but a client that PUTs a
non-ULID key now gets a 400 where the plan text implied a 200. Cheap to widen: one constant in
`packages/domain/src/preferences.ts`, and the domain test names what widening it costs.

**6b. Plan 6 declares a DIFFERENT preferences shape, and it will not compile against the server's.**
Plan 6's `UserPreferences` is `{ version: 1; projects: Record<string, ProjectViewPrefs>; savedFilters:
SavedFilter[] }` with `ProjectViewPrefs = { columns; grouping }` and `SavedFilter.filter`; Plan 5 Task
13 ships `{ savedFilters: [{ id, name, filterSpec }]; listColumns; grouping }` — no `version`, the
per-project pair split across two records, and the saved filter's field spelled `filterSpec`. The
server's is the one with a table, a route and tests behind it; Plan 6's is plan text with fakes.
**Owner: this document**, to rule which shape the `DataSource` carries before Plan 6's Task 10 is
executed. Whoever rules should note that the two are informationally equivalent — the mapping is
mechanical either way — so the cost is a decision, not a migration.

**6c. A revoked member's preferences row survives, unreachable and uncollected.** `user_preferences`
has no foreign keys (matching every projection table here) and preferences are not events, so the
purge tombstones `visibleEventsFor` emits on membership loss do not reach this table: the row stays,
the door answers that person 404, and nothing ever deletes it. Harmless for storage at this scale and
NOT harmless as a statement — it is per-user data outliving the relationship that justified it.
**Owner: Plan 11's deployment/retention work**, which is where data lifecycle belongs.

**6d. A future tightening of `preferencesDocSchema` bricks existing rows with a 500 for that user
until they save again.** `getPreferences` re-validates on the way OUT, deliberately: answering
`EMPTY_PREFERENCES` on a parse failure would silently discard somebody's saved filters, and answering
the raw row would hand a client a shape its types forbid. There is no migration path and no
per-user repair. Case 7.132 executes the behaviour so the cost is visible rather than discovered.
**Owner: whoever next changes that schema.**

**6e. Duplicate `savedFilters[].id` is unrefused.** The server never indexes by that id — the filters
are an array and stay one — so a duplicate is a client-side confusion rather than a server-side
ambiguity, and refusing it would be the door enforcing a rule only the renderer needs. **Owner: Plan
6**, which renders the list.

### 7. Task 14 fix round (2026-09-02): the stream suite's tenancy coverage is an ARTIFACT OF TEST ORDER

**Owner: Plan 4** — the predicate is `visibility/visible-events-for.ts`'s, not the hub's, and this is
recorded rather than fixed for that reason.

`visibleEventsFor` opens with `SELECT … FROM events WHERE workspace_id = $1 AND workspace_seq > $2`.
Removing the `workspace_id` clause **and its parameter**, so the mutation genuinely runs rather than
failing to bind, reddened exactly ONE case in `apps/server/test/stream/hub-integration.test.ts` — and
only incidentally.

**Case 7.134 survives the mutation because it runs FIRST in the file.** The `events` table is
append-only and refuses `TRUNCATE`, so every case mints a fresh workspace into a table that keeps
everything the earlier cases wrote; at the moment 7.134 runs, no other workspace's rows exist for a
workspace-blind query to pick up. Every case after it can see the mutation only because of the
fixtures that ran before it. Nothing in the file *asserts* tenancy: re-ordering the cases, or running
one with `.only`, removes the coverage in silence and no assertion changes.

The honest fix is one case that seeds TWO workspaces itself and asserts that the second's events
reach no subscriber of the first — a fact about the filter, independent of what ran before it. It is
deliberately not added from a Plan 5 task: the predicate belongs to Plan 4, and a Plan 4 case can
also cover the visibility suite, which has the same exposure. Recorded in the test file's header as
well, where the next reader of that suite will meet it.

### 8. Task 14 fix round (2026-09-02): `StreamSocket.terminate()` is declared, faked, and CALLED BY NOTHING

**Owner: Task 15 (the `WS /v1/stream` route)** — named so its author does not assume the hub already
terminates sockets.

`StreamSocket` in `apps/server/src/stream/hub.ts` declares `terminate(): void`, and
`test/helpers/stream-socket.ts` implements it, but no path in the hub invokes it. Every place the hub
gives up on a peer — the slow-consumer bound, a drain that threw — goes through
`close(code, reason)`, so the connection is closed with a protocol code (1013, 1011) and the client
can tell why it happened. That is the right default and is not changing.

The caller with a genuine reason to `terminate()` is the one Task 15 owns: a heartbeat that has timed
out has no peer left to negotiate a close handshake with, and `ws`'s `close()` on a dead socket waits
for a reply that never comes. **Task 15 should either wire `terminate()` to the heartbeat timeout or
delete it from the interface** — it is currently an unmeasured affordance that reads, to anyone
looking at the type, as though the hub already uses it. A Nit, recorded because leaving it silent is
how a later plan comes to trust it.

---

## Step 10, the integration checkpoint (2026-09-02, serial executor) — what it found before it wrote a line

The checkpoint's own scoping was the first thing it produced, and it corrected the two documents that
told it what to do. Both corrections are measured, each with a positive control run in the same
command, and both are recorded here rather than in the executor's handoff because they outlive it.

### The six `applyCommitted` absences are NOT this step's target — five are already closed

The dispatch brief and the preceding recon both frame step 10 as closing the six things
`test/helpers/apply.ts` enumerates that real ingest does and `applyCommitted` does not. Counted
against the tree at `c9ab31c`, **only `lockWorkspace`/`lockEntity` is uncovered through the real
door.** Say it that way and not "anywhere", because "anywhere" is false and this section's own lesson
is the one that catches it: both locks are covered directly, in `apps/server/test/event-store.test.ts`.
`:83` is *`lockEntity` holds off a second transaction until the first commits (falsifiable)* — A takes
the lock, B is asserted not to have acquired after 100 ms, `pg_locks` is asserted to report exactly
one ungranted advisory lock in this database, and B is asserted to acquire the moment A commits; its
docblock records that the neighbouring race test passed 5/5 with `lockEntity` no-opped, which is why
that one exists. `lockWorkspace` is driven at `:242` by `appendUnderBothLocks`. What no test does is
reach either lock **through `POST /v1/events`**, and concurrency was not step 10's subject.
Seqs-from-the-database, `checkPermission`, the rule engine and `bootstrapWorkspace` are all exercised
by `test/routes/workspaces.test.ts`, and `notifyCommitted` — the one the recon explicitly called
still-open — is exercised by `test/stream/stream-route.test.ts`'s `submit()` helper, whose own
docblock states the reason a row-writing seeder cannot substitute: *"the hub wakes on
`onEventCommitted`, which the ingest service fires after a transaction commits, and a helper that
writes rows straight into `events` fires nothing."*

**The real gap is one sentence:** *every Plan 5 read-route test seeds its world with `applyCommitted`
and none of them writes through `POST /v1/events`.* The absences are closed for the WRITE path and
open for the READ path. Measured: `grep -l "v1/events"` over `board`, `list`, `search`, `my-work`,
`attention` and `preferences`.test.ts returns **nothing**, while the same grep returns 4, 5, 3 and 2
for `workspaces`, `invites`, `security` and `stream-route`. The grep can hit. Two corrections to how
that used to be written: `stream-route.test.ts` returns **2**, not 1 (`grep -c v1/events` on it — a
docblock mention at `:114` and the real `url: '/v1/events'` at `:126`), and it is **not the same
directory** — the first three live in `test/routes/` and it lives in `test/stream/`.

And the write half is already proven end to end — `workspaces.test.ts` walks real sign-in →
`POST /v1/workspaces` → `project.created` → `project.member_added` → `ticket.created`, every one
committing, and then asserts **`proj_tickets` by querying the table directly.** So the missing link
was never "reproduce ingest"; it was the last hop, and it is a much smaller task than the one the
brief describes.

**The general form, because it will recur:** a partial-implementation marker that enumerates its
absences is doing the right thing, and it is still not a coverage report. `applyCommitted`'s list is
true about `applyCommitted` and says nothing about whether some other test closes the same hole
elsewhere. **An absence enumerated in one file is a fact about that file.** Re-measure before
scoping work off it.

### The client `DataSource` contract cannot be implemented over the shipped routes — 9 of 12 methods

The recon reported "six shape disagreements". Recounted from each handler's own `return` statement
plus `packages/app-core/src/data-source.ts`, `view-types.ts` and `packages/domain/src/read-models.ts`,
the figure is wrong and — more usefully — **the question was wrong.** A client adapter is allowed to
rename and unwrap, so the test is not *do the shapes differ* but **can an HTTP `DataSource` produce
the client shape from what the route answers.** By that test:

| Method | Verdict | The fact the adapter cannot manufacture |
|---|---|---|
| `getMyWorkspaces` | **blocked** | `WorkspaceRef.projects`; no projects-per-workspace read exists |
| `getMembers` | adaptable | rename + unwrap |
| `getBoard` | **blocked** | `BoardCard.assignee.name` — the server sends `assigneeId` and resolves no name |
| `getTickets` | **blocked** | `ListRow.stateName`, `typeRank`, `epicId`, `assignedProvenance`, `hasRestrictedParent` |
| `getTicket` | **blocked, worst** | the route returns a snake_case visibility row — `{ticket_id, workspace_id, project_id, parent_id, own_mode, resolved_mode, seq}`. No title, no state, no provenance anywhere in the body |
| `getTicketHistory` | adaptable | unwrap; the element type matches field for field |
| `getWorkflowDef` | adaptable | `PublishedWorkflowDef` is a strict superset of `WorkflowDef` |
| `search` | **blocked** | `SearchHit.matchedIn`; `ts_headline` blobs title+description+comments and the server cannot say which matched |
| `getMyWork` | **blocked ×2** | a different grouping MODEL, and it takes no `workspaceId` |
| `getAttention` | **blocked** | client `AttentionKind` includes `'contested'`; the server union has three arms and not that one |
| `getPreferences` / `putPreferences` | **blocked (signature)** | neither takes a `workspaceId`; both routes answer **400 `invalid_query`** without one |

**The denominator is 12 and the table has 11 rows — do not recount it from rows.**
`packages/app-core/src/data-source.ts` declares **twelve** methods on `DataSourceQuery`, and the
table's own verdicts sum to twelve: blocked = `getMyWorkspaces`, `getBoard`, `getTickets`,
`getTicket`, `search`, `getMyWork`, `getAttention`, `getPreferences`, `putPreferences` (9);
adaptable = `getMembers`, `getTicketHistory`, `getWorkflowDef` (3). The last row pairs
`getPreferences` with `putPreferences` because they share a verdict and a reason, so a row count is
11 and a method count is 12. This heading previously read *9 of 11*, which mixed the two.

**Sort the blocked rows into two kinds, because the sort decides who fixes each.** A **serving gap**
is a fact the server holds and does not put on the wire — one route change. A **data gap** is a fact
the server does not have — a product decision. `BoardGroup.workflowVersion` and `ListRow.stateName`
are serving gaps (`proj_tickets` holds the version; 0 hits in `read-models.ts` and `board.ts`, 3 in
`projections/tickets.ts`). `matchedIn`, `contested`, `WorkspaceRef.projects` and
`BoardCard.assignee.name` are data gaps. **That distinction was itself nearly lost:** the first sweep
scoped `workflowVersion` to two files, found zero, and would have reported a fact the server holds as
one it does not. *A null scoped to two files is a fact about two files.*

### A live defect, not a disagreement — `board.tsx` dereferences two fields no response carries

`packages/app-core/src/views/board.tsx` is the one real view component on `main` and it is fed by
`source.query.getBoard(...)` through `DataSource` (line 127, via `useLiveQuery`). It reads
`group.workflowVersion` at line 28 and `card.assignee.id`/`.name` at line 94. Neither exists in any
response — one a serving gap, one a data gap. It breaks the moment an HTTP `DataSource` exists.

Recorded with that framing deliberately: **"type mismatch" reads deferrable and "the one real view
component dereferences two fields the server never sends" reads blocking**, and the framing is what
decides whether the next plan acts. **Owner: Plan 6, which is the very next step in the serial
order.**

### `StreamItem` has no `scope-revoked` member, so a revocation is silently dropped

`packages/domain/src/stream-frames.ts` declares `scope-revoked` on `ServerStreamFrame` and the hub
emits it; `packages/app-core/src/data-source.ts`'s `StreamItem` has no such member, so it arrives at
a client as an unrecognised `type` and is dropped — leaving stale authorization in the client cache
for exactly the person whose scope was revoked. The client union also carries `EventEnvelope` where
the server sends `LedgerEvent`, so it lacks `workspaceSeq`, the field the resume protocol needs.
**Owner: Plan 6.**

**DISCHARGED 2026-09-02 (step 11, Plan 6 Task 8), and the discharge is recorded HERE because a
ruling whose value lives only in a note is worth exactly what the note is durable.** Both drifts are
closed in `packages/app-core/src/data-source.ts`: `StreamItem` has a fifth `scope-revoked` member
carrying the server's `projectId?: never` verbatim, and its event member carries `LedgerEvent`.
`EventEnvelope` was NOT touched. The widening is an alignment rather than a contract move — this
document already records `replica.revokeScope` as **Done**, i.e. Plan 10 already consumes
`ScopeRevokedInstruction`, so the narrow union was stranding the implementer that had already
shipped. Step 10's two client-contract cases were rewritten to pin the AGREEMENT (set equality
against `serverStreamFrameSchema`'s derived option list; the event member's declared type) rather
than deleted, and the second of them had to GAIN a client half — its body was server-side only, so
it would have stayed green through the very reconciliation its title described. **Still open, and
the only one of the three: `error.code` is bare `string` where the server types `StreamErrorCode`.**
`stream-frames.ts` argues the end state is replacement of `StreamItem` by `ServerStreamFrame` rather
than re-synchronisation; that judgement stands, owner Plan 10.

It does not change step 10's scope — no client consumer exists yet — and
`serverStreamFrameSchema` already exists as the runtime instrument for pinning it.

*One correction while here:* that file names its mocking readers as **Plans 6, 9 and 10**. The
dispatch brief says "6a, 8 and 9". The code is the primary source.

---

## Ruling P18 is DISCHARGED (2026-09-02, step 10) — and it was genuinely unclaimed

The ruling handed the `proj_memberships` → `engine-context` wiring to *"whoever dispatches Plan 4 Task
6 or the step-10 integration checkpoint, whichever comes first."* **Plan 4 Task 6 ran and did not take
it** — `getEntityState('membership')` still answered `null` at `c9ab31c`, and the only section this
document gained from T6 is about vacuous determinism tests. So the conservative default the ruling
itself named binds, and the wiring landed as **its own reviewed change**.

It reads `proj_memberships` through **`resolveEffectiveRole`**, never a SELECT of its own. That is
the one decision here with a defect behind it rather than a preference, and the defect is measurable:
substituting a bare `WHERE workspace_id = $1 AND user_id = $2` **passes all 720 tests**, while handing
back a revoked person's surviving project-roster row as a role — because `membership.revoked` deletes
the workspace-scope row alone and the guarantee lives in that function's early return.

A second mutation, `role: eff.workspaceRole === 'admin' ? 'admin' : 'guest'`, **also passed all 720**,
because `role` was only ever witnessed as `'admin'`. The `member` refusal cannot see it: a wrong role
and a missing one are refused identically, so only a direct read of the whole `MembershipState`
separates them. **Both survivors were found by the reviewer against a suite the implementer had
already run green** — the per-task reviewer paying for itself twice in one task, under the thinned
machinery.

The id is decoded **fail-closed, by re-encoding the halves and comparing to the input**, rather than
by reasoning about whether a ULID may contain a colon. And `'membership'` is answered BEFORE the head
read: a membership head row is the §9 hazard's own instrument, and a head gate would be true for
every membership the ledger can produce — **a check that cannot fail, sitting in an authorisation
path.**

**State it as a functionality gap, never as a bypass.** `restrict-to` fails CLOSED, so what the null
cost was every workflow whose approval step is spelled as a role, for everyone, always — an owner
included. Reported as an authorisation defect it would have provoked a mis-sequencing ruling.

Why nothing noticed is this series' signature failure in its purest form: the rule engine's own
`restrict-to` suite drives **`fixtures/harness.ts` ALONE** — it is the only in-memory context that
carries `fx.memberships` and answers (`harness.ts:294`), and the eleven `rule-restrict-to-*` fixtures
run through it via `test/fixtures.test.ts`. The SECOND in-memory context, `memory-context.ts`,
answered `null` for `'membership'` **exactly as the server did**, and its own suite pins that:
`test/memory-context.test.ts:214` is a
case named *"does not serve memberships — this context is a SECOND context, not a replacement"*.
**Sixty-one fixtures green on the one side with the fake; every other side never exercised.**

**Name the right module, because three documents on this branch first named the wrong one, and the
misread is instructive.** `memory-context.ts:18-24` reads *"It does NOT replace `buildInMemoryContext`
in `./fixtures/harness.js` … and **it** carries `fx.memberships`"* — the `it` is the harness, not the
file the sentence is in. A signature-failure lesson that points at a module which answers null is
worse than no lesson: the next reader concludes the fake side is broader than it is. The corrected
version of this same claim already existed on the branch, at `test-cases/06-auth-visibility.md` case
6.136 and in `docs/plan-3-chain-b-handoff.md` — so this was a disagreement inside one branch, not a
missing measurement.

---

## Ruling P24 (2026-09-02, serial executor) — the `UserPreferences` collision resolves to the SERVER's shape

§6b left this open with a deadline: *"Owner: this document, to rule which shape the `DataSource`
carries before Plan 6's Task 10 is executed."* Ruled here, conservative default, because step 11 is
Plan 6 and after that the ruling is no longer cheap.

**The server's shape wins. Plan 6 Task 10 adopts it.**

§6b's premise needs correcting first, and the correction strengthens the conclusion. It says the two
are *"informationally equivalent — the mapping is mechanical either way — so the cost is a decision,
not a migration."* True in the abstract. In practice **`preferencesDocSchema` is `.strict()`, so Plan
6's document is not renamed by an adapter — it is refused at the door, three separate ways**:

1. `version: 1` is an unknown top-level key → `400 invalid_preferences`, the whole PUT lost;
2. `SavedFilter.filter` (Plan 6) against the shipped `filterSpec`, inside a `.strict()` member;
3. project keys are narrowed to `ulidString`, and that schema's own docblock records that **Plan 6's
   fixtures key by `prj_1`**.

And one asymmetry §6b does not name: **server → client is not total.** The client pairs
`{columns, grouping}` under one project key; the server keeps two parallel records. A project present
in `listColumns` and absent from `grouping` has no faithful client representation, and reaching for
`DEFAULT_VIEW_PREFS` there presents a default as the user's own choice.

Grounds: the server's shape has a table, a route, a strict schema and tests; Plan 6's is plan text
with fakes. **Ruling for the fake over the shipped thing is this series' signature failure stated
exactly.** The alternative — loosening `.strict()` and widening `projectIdKey` — would undo three
deliberate decisions each with an executed test behind it, including the `__proto__` record drop that
was measured on zod 3.25.76 and is the whole reason `projectIdKey` is `ulidString`.

Client-side, `version` is not lost: it belongs on the client's cache envelope, not inside a
server-owned document whose shape the server already versions by refusing unknown keys. The
per-project asymmetry is the one thing an adapter must handle explicitly — a project missing from
`grouping` surfaces as *not set*, never as a default wearing a user's authority.

## Step 11 (Plan 6 remainder) — the `DataSource` register, re-derived, and RULING REQUEST P25

**Status: RULING REQUESTED, not taken.** The executor proceeds on the conservative default stated at
the end of this section and will reverse if the owner rules otherwise. Everything above the ruling is
measurement; the ruling is the only judgement.

### Why this was re-derived rather than inherited

Step 10 measured "9 of 12 `DataSourceQuery` methods cannot be implemented over the shipped routes"
and **named that sort as the claim it was least sure of.** It was re-derived from the files by an
agent given the count as a claim to check rather than as input. The count reproduces exactly — **3
adaptable, 9 blocked, denominator 12 counted from the `DataSourceQuery` interface body at
`packages/app-core/src/data-source.ts:36-47`** — and the sort moves:

| | step 10 | re-derived |
|---|---|---|
| adaptable | 3 | 3 — `getMembers`, `getTicketHistory`, `getWorkflowDef` |
| **signature** | 3 (`getMyWork`, `getPreferences`, `putPreferences`) | **2** — `getPreferences`, `putPreferences` |
| **serving** | not separated | **6** — `getMyWorkspaces`, `getBoard`, `getTickets`, `getTicket`, `search`, `getAttention` |
| **data** | not separated | **1** — `getMyWork` |

The disagreement is not about facts. `getMyWork` is blocked BOTH ways — it cannot form its request
(no `workspaceId`) **and** its `inTransit` member is structurally unservable. Step 10 reported the
signature half; the re-derivation reports the severest half. **Both readings are true of the same
method**, which is why a register that reports one label per method must say which ordering it used.
This one uses data > serving > signature.

### The six serving gaps, each with the thing the server already holds

A **serving** gap is a fact the server has and does not put on the wire. Every row below cites where
the fact lives, because a serving claim with no such citation is a data gap wearing a cheaper label.

| Method | Missing | Where the server already holds it |
|---|---|---|
| `getMyWorkspaces` | `WorkspaceRef.projects` | `proj_projects` (`migrations/1787961500000_proj-projects.sql`), queryable per workspace, never joined at `routes/workspaces.ts:149-165` |
| `getBoard` | `BoardGroup.workflowVersion` | `PublishedWorkflowDef.version`, already in the `defs` Map built at `routes/board.ts:102-106` and dropped when columns are pushed at `:123-135` |
| `getTickets` | `typeRank`, `epicId`, `stateName`, `hasRestrictedParent`, `assignedProvenance` | `proj_ticket_types.rank`; `epicAncestors` (`routes/list.ts:369-428`, docblock from `:305`) already computes the epic and uses it only as a group key; workflow defs already fetched at `:233-247` carry state names |
| `getTicket` | `title`, `stateProvenance`, a real `TicketState` | the route answers a raw `proj_visibility` row (`routes/tickets.ts:56-64`); `proj_tickets` exists and its siblings `board.ts`/`list.ts` already read it through `read/ticket-cards.ts` |
| `search` | `SearchHit.matchedIn` | `proj_search` stores `title`/`description`/`comments` as three independently weighted columns; `routes/search.ts:142-146` concatenates them before one `ts_headline`, so which matched is destroyed in the query, not absent from the store |
| `getAttention` | the `contested` item kind | **THIS ROW WAS WRONG AND IS CORRECTED.** It said the fix was joining `proj_contested` into `routes/attention.ts`. **`GET /v1/contests` is already shipped** — `sync/contests-route.ts:107`, wired at `app.ts:208`, filtered per row through `canSee`, taking `?workspaceId=&ticketId=&claimantId=&open=true` — and its own docblock says *"The ticket banner, My Work and the attention strip all read this."* A client may join it, exactly as `getBoard` joins the members route. The real gap is one field pair: **`ContestView` carries no `projectId` and no `title`**, both required by `AttentionItem`. Fix belongs in `contests-route.ts` |

**One row was shipped contested by its deriver and is RESOLVED here, against the deriver.**
`getTickets`' `assignedProvenance` was called *serving* by analogy to `read/state-provenance.ts`,
which reconstructs state provenance with a `DISTINCT ON` over the raw `events` table — and the
deriver then flagged that `packages/domain/src/read-models.ts` says `proj_tickets.assignee_id` is a
bare column with no provenance beside it and "the projection does not hold the difference either",
which if read as a position rather than a not-yet would flip the label to *data*.

**Read at the site, the note does not say that.** `read-models.ts:141-147` is scoped to one thing:
what `TicketCard.assigneeId: null` can and cannot mean. It says null cannot distinguish *never
assigned* from *unassigned by somebody*, because the column holds no provenance — and that inventing
"a union whose second arm could never be populated would be worse than the honest gap." That is an
argument about the **absence** case, and it is the *reason* one would go to the ledger rather than a
reason not to. `ticket.assigned` is a real event type (`vocabulary.ts:112`), and
`read/state-provenance.ts:42-84` (`stateProvenanceFor`) is the same query shape already shipped for state.

The client type settles it from the other side: **`ListRow.assignedProvenance` is already
`ClaimProvenance | null`** (`view-types.ts:100`), paired with `assignee: Actor | null`. So the client
contract encodes precisely the honest gap the note protects — no assignee, no provenance — and asks
for provenance only in the case the ledger can answer. **Serving.** The label stands and the cell is
no longer the least-safe one in the table.

### What is NOT a gap, and would have become one

Three things read as gaps and are not, and each would have cost a wrong route change:

1. **`BoardCard.assignee`.** The server sends `assigneeId` and no name; `Actor` requires one. But
   `getMembers` is *adaptable* and answers `{id, name}` for the whole workspace, and the board body
   carries `workspaceId`. The name is a **client-side join over a shipped route** — no server change.
2. **`BoardView.groups`.** The server returns flat `columns[]`, each already carrying `workflowId`.
   Grouping is a pure client mapping; Plan 6's Open question 10 settled this in 2026-08-27 and the
   flat shape is what it settled ON.
3. **`inTransit`.** `routes/my-work.ts:91-101` states that claims in transit live in the replica's
   outbox and are "never served from a server that by definition has not received them." **The web
   client is online-only (spec §5, line 104): it has no outbox, so `inTransit: []` is not a degradation, it
   is the true answer**, and the test that pins it must say *because there is no outbox*, never
   *because the read returned nothing*.

### What legitimately DEFERS, with an owner that still has tasks

`contested`, in both `getAttention` and `getMyWork`. `routes/attention.ts:150` and
`routes/my-work.ts:91` each open a docblock section naming **Plan 10** as its owner in a docblock headed `EXTENSION POINT
(Plan 10)`, and both were written that way deliberately — `AttentionItem` is a discriminated union
and `MyWorkResponse` nests under `groups` precisely so the fourth arm arrives additively. **Plan 10
has 13 tasks outstanding, so this deferral has a live owner.** It is the only one here that does.

### THE RULING REQUEST — and why "record it with a named owner" does not work this time

The standing rule is that a finding outside the current scope is **recorded with a named owner, not
fixed.** Applied here it names Plan 5 for all six serving gaps. **Plan 5 is 17/17 done and merged. It
has no task left to carry them.** A gap recorded against an owner with no remaining tasks is not
deferred; it is dropped, quietly, by a rule whose whole purpose is to prevent exactly that.

And the alternative to fixing them is worse than it looks. Plan 6's adaptation rule confines all
adaptation to `packages/app-core/src/online/` and forbids moving view types or `DataSource`
signatures. Under that rule a mapper facing a serving gap has exactly two moves, and **both are the
failure this series is named for:**

- **invent the fact.** `workflowVersion` is the sharp case. A mapper could fetch the workflow def and
  read its version — but `getWorkflowDef` is latest-by-default, and `workflowVersion` exists, in
  Plan 6's own words, so that "a v2 state remap shows rather than hides." Filling it with *latest*
  hides precisely what the field was added to show. A plausible number in the honest field is worse
  than an absent one.
- **widen the view type to admit absence.** That degrades a guarantee the plan names as load-bearing,
  in the client, permanently, to accommodate a route that could serve it in one line.

**Proposed ruling P25, three clauses, conservative in the direction of the server holding the fact:**

1. **FOUR serving gaps are closed in the SERVER, inside step 11**, each with a test through the real
   door. Not because Plan 6 owns `apps/server`, but because the fact is already in the database, the
   client cannot honestly synthesise it, and no other plan has a task that will. Named, because a
   clause that says "the serving gaps" reads as six and two of the six are not in it:

   | | why it is in clause 1 | shape of the change |
   |---|---|---|
   | `getBoard` | `board.tsx` dereferences `workflowVersion` today | **DONE.** `def.version` added at both push sites in `routes/board.ts`; a straggler column answers `0`, which `workflowDefSchema.version`'s `min(1)` makes uncollidable with any published version |
   | `getMyWorkspaces` | the nav (T14) has no other source of `projects` | **CORRECTED 2026-09-02, after the table was first written and reported: this is NOT a field addition.** `grep -rn "proj_projects" apps/server/src` returns the projection that writes it, one existence check, and **no route that reads it** (positive control in the same sweep: `proj_memberships` has eight readers). There is no shipped project-list read at all, so adding `projects` here means DESIGNING one, and its first question is what a project-scoped guest sees of a workspace's other projects. **A VISIBILITY DECISION** |
   | `getTicket` | the route answers a `proj_visibility` row where its name promises a ticket | **read `proj_tickets` instead. A VISIBILITY DECISION, not a field addition** |
   | `getTickets` | five fields, four of them not derivable client-side | **`hasRestrictedParent` is itself about restricted visibility; `assignedProvenance` reads the raw `events` table. A VISIBILITY DECISION** |

   `getAttention` is NOT in clause 1 — its only gap is `contested`, which clause 3 defers to Plan 10.
   `search`'s `matchedIn` is NOT in clause 1 — no view among Plan 6's twelve remaining tasks consumes
   it, so it blocks nothing here and is recorded for whoever builds the search surface.

   **THREE of the four carry a visibility decision rather than a field addition** — corrected upward
   from two after `getMyWorkspaces` was checked rather than assumed. They sit under Plan 4's read
   enforcement, the surface whose own execution notes recorded the cross-workspace forgery hazard.
   That is what decides whether clause 1 is a few tasks inside a step or a step of its own.

   **Only `getBoard` is a pure field addition, and it is the one being done.** `def.version` comes off
   the same `PublishedWorkflowDef` the column's `workflowName` already comes from, so it discloses
   nothing a viewer of that board cannot already see. The other three are HELD pending the ruling.

   The correction is itself the lesson: the first version of this table priced two rows as one-line
   changes on the strength of "the fact is in a table". A fact being in a table says nothing about
   whether a door exists to hand it through, or who is allowed to walk up to it.
2. **Signature gaps are closed in the CLIENT.** `getPreferences`/`putPreferences` cannot form their
   request at all, so there is no server-side reading of the problem. This extends **ruling P24** —
   already taken, that the shipped `.strict()` preferences document wins over Plan 6's — from the
   document's shape to the method's signature, which is the same argument one layer out.
   `getMyWork` takes a `workspaceId` for the same reason.
3. **The one data gap is answered honestly, not filled.** `inTransit: []` for the online source, with
   the reason in the assertion. `contested` defers to Plan 10, named above.

**The executor proceeds on this default** and does the unblocked work first — Plan 6 T8's stream
widening, which needs no ruling because the server already sends both missing things, and T7's
transport and the three adaptable mappers. If the owner rules that `apps/server` is out of step 11's
scope, clause 1 becomes a new step and Plan 6's view tasks wait for it; nothing done under clauses 2
and 3 is wasted either way.

**Least sure, stated so a reader with limited budget knows where to aim it:** whether `getTicket` and
`getTickets` can be changed without reopening a Plan 4 visibility decision. Both are asserted above to
carry one; neither has been implemented, so the assertion is a prediction from reading the routes, not
a measurement. If it is wrong in the safe direction they are field additions like the other two; if it
is wrong in the unsafe direction, clause 1 is bigger than a step.


### P25 postscript, written after clause 1's one approved row was executed

**Two corrections the execution produced, both against this document.**

**1. The `getAttention` row above was wrong about which file closes it**, and it was wrong in the
direction that costs most: it named a route change in `attention.ts` when a route serving exactly those
rows was already shipped and already names the attention strip as its consumer. A register exists so a
recorded gap does not outlive the thing it described; a register that misroutes the fix is worse than
none, because it looks like it was checked. Found by reading `sync/contests-route.ts`, which nothing in
the original derivation had opened — the derivation swept `apps/server/src/routes/**`, and this route
lives in `apps/server/src/sync/`. **A sweep is a fact about the directories it walked.**

**2. `getBoard`'s field addition was nearly a check that could not fail.** Every workflow a board could
see in the test fixtures was at v1, so serving the constant `1` instead of `def.version` left all 756
server tests green — the whole-body round-trip `toEqual` and the client-contract agreement case
included. The fixtures were tidy, and tidy fixtures make a version field indistinguishable from a
constant. A second workflow is now published at v2 for the sole purpose of making the two
distinguishable. This is the brief's *"a count equal to a max because the fixtures were tidy"*, in a
new costume.

**And one measurement corrected:** step 10 recorded that adding `workflowVersion` "kills 6 tests
including the serving gap case". Measured at execution it kills **2**. Not a mistake at the time
necessarily — but a kill count is a fact about a suite at a moment, and this one was cited three steps
later as though it were a property of the change.

## ~~RULING P26 EXISTS AS A NUMBER WITH NO TEXT~~ — SUPERSEDED. P26 was written 2026-09-02; see the correction at the end of this section. Recorded by the executor 2026-09-02, corrected by the step-14 executor 2026-09-03

`docs/lanes/controller-state.md:159` says the cross-plan shape scan found *"1 live (`SavedFilter`, now
Ruling P26)"*. **Searched at `origin/main`: the string `P26` appears in that one line and nowhere else
in `docs/`** (`git grep -n "P26" origin/main -- docs/` → a single hit; positive control in the same
sweep — `SavedFilter` returns five files). So the ruling has a number, a subject and a claim that it was
taken, and no statement of what it decided.

This is the failure the coordination doc already names in its own words — *a correct ruling whose entire
value lives in a note is worth exactly as much as the note is durable* — one turn further along: here
not even the note survived, only the citation.

**What the collision actually is, measured, so the ruling can be written from evidence rather than
recalled.** Three spellings of one field:

| Where | Declaration |
|---|---|
| Plan 6 (`…-06-web-client.md:1663`) | `{ id; name; filter: FilterSpec }` |
| Plan 9 (`…-09-calendar-notifications.md:5795`) | `{ id; name; spec: FilterSpec }` |
| **SHIPPED** (`packages/domain/src/preferences.ts:24-31`) | `{ id; name; filterSpec }`, and the schema is **`.strict()`** |

`.strict()` is what makes this live rather than cosmetic: the shipped door **refuses both plan
spellings**, so neither plan's document can round-trip through storage as written. And
`preferences.ts:22` already names the owner — *"Recorded rather than fixed; the owner is Plan 6, which
renders the list."*

**For Plan 6 the substance is already settled and needs no new ruling: RULING P24 covers it.** P24 took
the shipped `UserPreferences` shape over Plan 6's, naming `SavedFilter.filter` vs the shipped
`filterSpec` as one of the three ways `.strict()` refuses Plan 6's document. Task 10 is executing under
P24 now, and Task 7's `mapPreferences` already implements the translation.

**The part P24 does NOT cover is Plan 9**, whose `spec` spelling nobody has been told about. That is
step 14's, and it is written here rather than left in a number so step 14 inherits the evidence rather
than the citation.

~~**Not resolved by the executor**, because P26 is the controller's ruling and inventing its text would
be worse than reporting it missing. The ask is one sentence: *does P24's reasoning extend to Plan 9's
`spec`?*~~

**ANSWERED. P26 WAS WRITTEN ON 2026-09-02 AND THE ANSWER IS YES — `filterSpec` WINS, AND PLAN 9 TASK
13'S `spec` IS SUPERSEDED BEFORE IT IS WRITTEN.** The full text is in `docs/lanes/controller-state.md`
under *"Standing owner rulings currently in force"*. Its reasoning is exactly the extension this
section asked for: **a `.strict()` schema REFUSES a third spelling rather than renaming it**, so
`filterSpec` wins on P24's own logic applied to a plan P24 never looked at. P26 also records that Plan
9 T13 *is not disagreeing — it does not know*: measured against its own text, **zero** mentions of
`filterSpec`, **zero** of `preferencesDocSchema`, **zero** of `Plan 5`.

**Step 14 needs no ruling here. Task 13 adopts `filterSpec`.** The other two spellings — app-core's
`filter` and Plan 6's — are **closed under P24** and pinned by `client-contract.test.ts:605`; they are
not reopened.

> **Why this correction is worth more than the line it fixes.** The section above, and the one at
> *"RULING P26 EXISTS AS A NUMBER WITH NO TEXT"*, both still described P26 as unwritten **the day
> after it was written**, because the ruling landed in `controller-state.md` and nothing came back
> here. Step 14's pre-flight agent read *this* document — the interface authority — and duly reported
> the question as "OPEN / UNRESOLVED … needs an explicit ruling before or during Task 13". **It was
> reporting this file accurately.** Had the executor forwarded that, it would have escalated a
> settled question and spent a controller round-trip re-deciding what was decided.
>
> The generalisation: **a ruling recorded in one lane's state file is invisible to the other lane's
> agents.** (An earlier draft of this paragraph called it the *third* instance in two days. Two are
> demonstrable -- P26 ruled in a message with no text, then P26 written to `controller-state.md` only.
> The third was not enumerable, and a counted plural inside a correction about stale documents is a
> bad place to round up.) `controller-state.md`
> is not read by dispatched subagents; this document is. **A ruling is not landed until it is written
> where the work will read it** — which for anything binding a plan's task means here, not only there.

---

## Step 11 (Plan 6 remainder) — four findings RECORDED, each with a named owner

Found while closing ruling P24's per-project asymmetry in `ProjectViewPrefs` (step 11). None is owned
by that task; each is recorded here rather than fixed, per the standing rule, and each names an owner
that still has work. **None of the three was implemented.**

### 1. Two date spellings will sit side by side on one screen. Owner: whoever next touches the attention route.

`apps/server/src/routes/attention.ts:245` composes its `due-soon` reason from the **raw `YYYY-MM-DD`
day claim**:

```ts
reason: `Needed by ${due.date} — due within ${settings.dueSoonDays} days.`,
```

My Work's due line, in the same client, renders the same kind of fact through the domain's one
renderer — `packages/app-core/src/views/my-work.tsx:167`, `formatDate(item.dueDate.date)` → `30 Aug
2026`. Both surfaces can be on screen together, so a user sees `2026-08-30` in the strip and
`30 Aug 2026` in My Work, for the same claim.

**The client is not the site to fix.** The owner decision is that attention reasons are the SERVER's,
rendered verbatim (spec §7's "user's language" means named reasons, not localisation), and
`attention-strip.test.tsx:25` pins that the strip renders the server's spelling as sent. Re-deriving
the date in the browser would compute it without the workspace's thresholds — the thing the verbatim
rule exists to prevent. **The spelling to change is the route's**, so that what it emits is already the
domain's spelling. Nothing here should be changed until that route is touched, because changing the
route's text moves a string the client tests quote.

### 2. No test under `packages/app-core/test/views/` carries a test-case ID. Owner: Plan 6 Task 16.

The workspace convention (`/Users/kiro/my_projects/CLAUDE.md`, `test-cases/`) is that tests
cross-reference cases by id so grep finds both directions. **The claim as first written was "no test in
`packages/app-core`", and a sweep falsified that** — recorded here in its corrected form, because a
recorded finding that overstates its scope sends its owner to the wrong files.

Measured 2026-09-02, `grep -rnE "(it|describe|test)\(\s*['\"\`][^'\"\`]*[0-9]+\.[0-9]+"` with quoted
globs over each test file:

| id-carrying test names | file |
|---|---|
| 27 | `test/online/mappers.test.ts` |
| 14 | `test/online/online-data-source.test.ts` |
| 7 | `test/online/http.test.ts` |
| 3 | `test/no-http-in-views.test.ts` |
| **0** | `test/views/board.test.tsx` |
| **0** | `test/views/ticket-list.test.tsx` |
| **0** | `test/views/list-model.test.ts` |
| **0** | `test/views/my-work.test.tsx` |
| **0** | `test/views/attention-strip.test.tsx` |
| **0** | `test/views/rollup-text.test.ts` |
| 0 | `cache` / `data-source` / `precheck` / `provenance` / `submit` / `stream` |

Positive control, same command shape and same run: `apps/server/test/` returns **206** hits (e.g.
`visible-events-for.test.ts:121` — `it('6.16 never yields an event about a ticket …')`), so the regex
finds ids where ids exist. Second control: the ids are not absent from `app-core` as *text* —
`no-http-in-views.test.ts:30` carries `3.47` and `online/http.test.ts:57` carries `3.45` — they are
absent from the **views** suite specifically. The 51-vs-0 split inside one package is the finding.

`rollup-text.test.ts` is added to the list the finding was reported with; it has the same gap and was
not named. **Owner: Plan 6 Task 16**, which owns the catalogue and is where the ids and the tests get
reconciled in one pass.

**PARTIALLY RESOLVED (Plan 6 Task 16's fix round, 2026-09-02).** `rollup-text.test.ts`, the one file
this table names by name and Task 16's original sweep left out, now carries a case-id prefix on its
`describe(...)` block (`3.145`, matching the case that already cited the file). Measured across the
whole `packages/app-core/test/views/` directory (`grep -cE "^describe\('[0-9]" <file>` against
`grep -cE "^describe\(" <file>` per file): `ticket-list.test.tsx`, `list-model.test.ts`,
`my-work.test.tsx`, `attention-strip.test.tsx`, `attachment-list.test.tsx`, `history-list.test.tsx`,
`editor-slot.test.tsx`, `transition-dialog.test.tsx` and `rollup-text.test.ts` — nine files — now carry
an id on every `describe` block, twenty-seven blocks in total (`git diff -- <file> | grep -cE
'^\+describe\('` per file), each resolving to a live entry in `test-cases/03-foundation-ledger.md`
(swept and confirmed with a `3.9999` negative control). **`board.test.tsx` is still 1 of 10 and
`ticket-sheet.test.tsx` still 1 of 8** — neither was in this round's four assigned fixes, and this
table's own "no test under `packages/app-core/test/views/` carries a test-case ID" framing named the
directory, not only the six files its table rows list by name, so both remain open against that
framing. Recorded here so the next reader does not read "27 blocks fixed" as "the directory is done."

### 3. `SHIPPED_KINDS` in the attention tests is a reconstruction, not a measurement. Owner: whoever closes the attention serving gap.

`packages/app-core/test/views/attention-strip.test.tsx:69` declares
`const SHIPPED_KINDS: AttentionItem[] = [ITEMS[0]!, ITEMS[1]!, ITEMS[3]!]` — "the three the server
emits today" — and two tests rest on it (`:129`, `:145`). **That three-kind array is inferred from
reading `routes/attention.ts`, not observed.** `mapAttention` refuses over the contested kind's missing
`title` (`ServingGapError`), so no fixture reaching this file can be the server's real answer; the day
the route emits a fourth kind, or stops emitting one of the three, nothing in `app-core` goes red.

The place that WOULD go red is `apps/server/test/integration/client-contract.test.ts`, which injects
the real route and reads the real body. **Owner: whoever closes the attention serving gap** — the same
change that makes `contested` servable is the change that must move this constant and pin it
server-side, because until then there is no run in which the client can observe the true kind set.

### 4. Task 13's instant pre-check opens the reopen offer without submitting anything — a SPEC-READING ambiguity. **Owner: the owner. Not resolved here.**

`packages/app-core/src/views/create-ticket-flow.tsx:189-201`: when a `ClientStateCache` is present and
the draft names a parent, `create` runs `precheckEvent` locally, and on a `hierarchy.parent-terminal`
refusal it opens the reopen prompt and **returns at `:200`** — `dataSource.ingest` is never called. The
test that pins this is `packages/app-core/test/views/reopen-flow.test.tsx:254` (case T13.4g, *"a local
refusal is not presented as though the server had spoken — nothing is even submitted"*), which asserts
`source.ingested` is EMPTY on that path.

**The spec line in tension.** `docs/superpowers/specs/2026-08-20-gisik-nokma-product-design.md:104` —
*"**The web client** is online-only — the same rule engine runs for instant feedback, but every action
round-trips."*

**The implementer's reading (what is shipped).** "Round-trips" attaches to the CLAIM. On the instant
path no claim is made at all: the user is offered a remedy instead, and accepting it sends
parent-then-child exactly as the server-refused path does — the shortcut is to the OFFER and never past
the two claims. Under this reading the sentence is satisfied because every action that is *taken* still
round-trips; declining the offer takes no action.

**The equally defensible reading.** "Every action round-trips" means the create is SUBMITTED regardless,
so the refusal the actor sees is always the authority's, and the local engine only shortens the wait
rather than standing in for the server. This reading has real weight: the local cache can be stale in
ways the server is not, so a locally-refused create that the server would have ACCEPTED is silently
converted into a reopen offer the user did not need — and the sheet's own `precheck` docblock already
says a pre-check is advisory and never a promise about acceptance.

**The exact fix if the owner takes the second reading.** Small and local: delete the early `return` at
`create-ticket-flow.tsx:200` so the flow falls through to `submitChildEvent`, and pass `'server'` rather
than `'instant'` as `openReopenPrompt`'s origin — at which point the pre-check branch's only remaining
job is that it has already computed the prompt. **Case T13.4g would need REWRITING, not deleting:** its
subject (a refusal wears the name of whoever made it) survives the change; what changes is that
`source.ingested` is no longer empty on that path and the label under the preview class becomes the
server's. The `refusalOrigin` prop itself stays either way — the reopen prompt can still be reached from
a purely local refusal elsewhere.

**Why it is recorded rather than decided.** Both readings are defensible from one sentence, and the
choice is a product decision about whose refusal a user should be shown, not an implementation detail.

## RULING P29 — TAKEN AND APPLIED (owner-approved 2026-09-03). Plan 8 Task 3's frozen errand template trips `rule-bypassable`, and it is ACCEPTED. Full text in `docs/lanes/controller-state.md` as P29 — cite that, not the message that carried it.

**The verdict: option 3 — accept both trips as known and expected. Touch NEITHER
`checkErrandTemplate` NOR `adviseWorkflowDef`.** Both are correct as they stand: the advisory is
right that the guard is skippable, and the template is right to keep those paths rule-free, because
they are the one-hop seeding paths the oracle pins.

**The reasoning, recorded because it decides a class of question and not just this one.**
`rule-bypassable` is advisory-only and never blocks publishing, so this costs nothing functionally.
Plan 11 Task 8's framing is *"frozen record in, events out, nothing invented"* — the template exists
to digitize the real shop's actual workflow, warts included. **Sanitizing it to clear an advisory
panel would mean inventing a cleaner reality than the one being recorded**, which contradicts the
reason it is imported by identity in the first place. **Scoped to this one frozen,
identity-imported template — NOT a general carve-out for `rule-bypassable` elsewhere.**

**The rationale is written at the declaration** (`packages/domain/src/workflows/errand-with-waits.ts`),
because that is where someone meeting the warning looks first, and echoed in `Features.md` §10 and
`test-cases/10-workflow-builder.md` case 10.61.

**Verified alongside the ruling, because it changes how much this matters: an admin is NOT stuck
with the warning.** The controller asked whether the dogfooding seed creates an independently
editable live `WorkflowDef` row separate from the frozen constant. **It does, and the guarantee is
structural rather than incidental:** the constant's type is `Omit<WorkflowDef, 'id' | 'version'>`, so
it **lacks exactly the two fields a real definition requires** and nothing can publish the object
itself. Every live def is a copy that acquired its own id and version — `cloneTemplate` (app-core)
via `structuredClone` + `newUlid()` + `version: 1`, and Plan 11's seed via a `workflow.defined`
payload carrying its own id. So the shop's admin can later guard those two paths on their own live
copy through the builder, and neither this constant nor the oracle is touched by that.

*(The request that preceded this ruling is kept below, because its measurement is the evidence the
ruling rests on.)*

### The original request, as filed (2026-09-03, exec/13 executor; corrected 2026-09-03, T3 fix round)

`ERRAND_WITH_WAITS_TEMPLATE` (`packages/domain/src/workflows/errand-with-waits.ts`) is pinned by Plan
11's `checkErrandTemplate` oracle (verified absent from this branch by search this session — Plan 11
has not landed here yet) and its own docblock: *"Edit this only with that check green."* Task 3's own
prose states the opposite invariant twice — *"a shipped template that greets the author with a warning
is a shipped template that is wrong."*

Both cannot hold. **Correction (this fix round): the prior text here claimed to have "verified Plan 2
... doesn't claim this check in its own execution-consequences section" and titled the entry "unowned by
any open plan." Both claims were false and are withdrawn.** `packages/domain/src/advise-workflow.ts`'s
`rule-bypassable` check is exactly the check Plan 2's own execution-consequences §8 above (lines
491-530) owns: §8 is the owner-ruling request for it, the owner's 2026-08-28 ruling ("option 1 —
generalise the advisory tier," line 517) that created it, and the amendment landing note (line 526)
that names the cover semantics — "same-kind-present, not rule-set equivalence" (line 529) — which
`advise-workflow.ts`'s own docblock carries verbatim. So the check is owned, and its design is Plan 2's;
what is NOT settled is the shape below. The check correctly reports two bypasses on the frozen
template: `require-comment` guards `in-progress -> waiting`, but `later -> waiting` and `next ->
waiting` both enter the same state carrying no `require-comment` rule — and `later -> waiting` must
stay rule-free, because it is one of the seed's pinned one-hop paths (Task 3's own guard-step comment).

Task 3 cannot resolve this: fixing the template violates Plan 11's oracle pin (owned there, not here);
silencing `rule-bypassable` means editing a check Plan 2 designed and Task 3 does not own.
`packages/app-core/test/workflow-builder/templates.test.ts` records the actual advisory output (2×
`rule-bypassable`) rather than asserting the stale "warns about nothing" claim for this one template —
the other two templates (`simple-kanban`, `approval-chain`) still assert clean per Task 3's invariant.

**What actually needs a ruling.** The owner's 2026-08-28 ruling (§8 above) designed COVER as
"same-kind-present on another edge into the same target" and explicitly made the *guarded wildcard*
the sanctioned way to close a bypass (§8's codicil, line 517: "we should be able to have the anywhere
arrow carry its own guard"). It did not design a way to mark an edge as *deliberately* left uncovered —
which is what `later -> waiting` and `next -> waiting` are here: adding `require-comment` to satisfy
COVER would break the pinned one-hop seed invariant, so this is not a case the landed design missed by
oversight, it is a shape the design never had to address, because §8's own worked examples all involve
closing the bypass, not preserving it as read. Either (a) the advisory tier gains an explicit
exemption/annotation path for a deliberately-uncovered edge — the `wf_rules` fixture's own `notes`
field (amendment requirement 4, line 530 above) is already exactly this shape, though scoped there to
annotating the wildcard archetype rather than to any def, so extending it is a design act, not a copy —
or (b) Task 3's "warns about nothing" invariant is amended to admit a documented exception for
templates whose shape is pinned by a downstream oracle, or (c) the template itself changes and Plan
11's `checkErrandTemplate` changes with it in the same commit, once Plan 11 actually lands and its
author can make that call. This entry does not pick one — same discipline as ruling-request entries
above (autonomous execution protocol, ruling 3: conservative default + record, never silently and
never blocking).

## Plan 8 execution consequences (2026-09-03) — the connect gesture, measured and closed

Recorded at Task 6, whose brief handed it the one thing Task 5 explicitly left open: "ANSWERED FOR
RENDER AND DRAG, OPEN FOR CONNECT — whether a CONNECT gesture (mousedown on a Handle through to
`onConnect`) completes under this harness at all... DO NOT ASSUME IT FROM THE DRAG RESULT." Tasks 7–10
all write canvas-adjacent component tests and would otherwise re-litigate this from scratch.

**Measured: a connect gesture cannot be driven to completion in jsdom, and worse than a silent no-op —
it throws an uncaught exception that fails the whole vitest process.** A real pointerdown-on-Handle →
pointermove → pointerup-on-Handle sequence (`@testing-library/user-event`'s `pointer()`, the same
primitive Task 5's drag test uses) hits `@xyflow/system`'s connection hit-testing
(`isValidHandle`, called from its own pointermove listener), which calls
`document.elementFromPoint` — an API jsdom has never implemented. Without a stub the sequence throws
`TypeError: doc.elementFromPoint is not a function` as an *uncaught* exception (it escapes the test
body — the test itself can still report passed — and fails the process, `ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL`
on `pnpm --filter @gisik-nokma/app-core exec vitest run`).

**Fix (already landed, Task 6): `packages/app-core/test/setup.ts` stubs `document.elementFromPoint` to
return `null`** — "nothing is at this point," the honest answer given every element's rect is 0x0 in
this harness (no layout engine), so no two distinct handles can ever occupy the same hit-tested pixel.
With the stub, the identical pointer sequence completes without throwing and `onConnect` is measured
firing **zero times** — the gesture genuinely cannot be driven to completion here, not merely landing a
zero-delta the way the drag gesture does. Confirmed the pointerdown itself is real (not a target-selector
miss) by temporarily wiring `onConnectStart` to force a call, observing it fire, then reverting.

**What Tasks 7–10 do instead, per the brief that resolved this:** test `connectionToTransition`
(`packages/app-core/src/workflow-builder/ui/flow-graph.ts`) directly — already fully covered,
gesture-free, in `packages/app-core/test/workflow-builder/flow-graph.test.ts` (Task 5). Do not add a
gesture test asserting a connect completes; write the negative measurement once (it now lives in
`packages/app-core/test/workflow-builder/canvas.test.tsx`, `'CANNOT drive a connect gesture to
completion in jsdom — measured, not assumed'`) and test the mapping layer for everything else.

The `elementFromPoint` stub is package-wide (`test/setup.ts` runs for all `app-core` test files); jsdom
never defined the API at all, so nothing pre-existing depended on its absence — the full gate
(`rtk proxy pnpm turbo run build test typecheck`) stayed 24/24 green across the stub's introduction,
with the app-core test count accounting for exactly the new tests added (562 → 578, no pre-existing
test changed status — 562 measured directly against a clean worktree at f1610e8, the commit
immediately before this task's first commit; the +16 delta matches inspectors.test.tsx +13,
draft-store.test.ts +2, canvas.test.tsx +1).

## Plan 8 Task 7 fix round (2026-09-03) — an off-roster restrict-to reference is invisible, and NOBODY currently owns it

Recorded, not fixed: outside Task 7's scope, and — this is the point of the entry — outside every
open task's scope too. The T7 review parked it on Task 8's issues panel. That owner does not hold.

**The gap.** `RestrictToEditor` renders a checkbox per workspace member and one per role literal in
`ALL_ROLES = ['owner','admin','member','guest']`, checked from `rule.userIds?.includes(...)` /
`rule.roles?.includes(...)`. A rule naming a `userId` who is not on the roster the environment
supplies — a departed member, or any member at all when the roster comes back refused or empty
(the guest ruling, 2026-09-02) — or a `roles` entry that is not one of the four literals, renders
**every box unchecked and no warning of any kind**. The emptiness helper does not cover it either:
`isEmpty` is a length test, and the array is not empty. So the author is shown a restriction that
looks like it names nobody while the def still carries the reference. (Toggling another box does
*not* silently drop it — `update()` spreads `rule.userIds ?? []`, which includes the unknown id. The
defect is invisibility, not loss.)

Place it against the other two editors and the shape of the hole is exact. `RequireFieldEditor`
computes `known` and renders an inline `<p>` warning when it is false — it has to, because nothing
downstream will. `RequireDifferentUserEditor` computes `known` too but renders **no** warning on it
(its only `<p>` is the start-state note, keyed on `initialStateId`, not on `!known`) — and it does
not need one, because `rdu-unknown-state` catches an unknown target and Task 8's panel will say so.
So: require-field warns inline because it is the only thing that can; rdu stays quiet because the
validator speaks for it; restrict-to has **neither** — no inline warning and no code. That is the
gap, and it is the only one of the three shapes that is silent end to end.

**Why Task 8 is not the owner.** Task 8 renders `validateWorkflowDef` and `adviseWorkflowDef` output.
Those emit thirteen codes between them, enumerated at this sha: no-states, duplicate-state-id,
no-terminal-state, unknown-transition-state, duplicate-transition, unknown-initial-state,
unreachable-state, terminal-no-inbound, empty-restrict-to, rdu-unknown-state, rdu-unenterable-state
(validate), rdu-bypassable, rule-bypassable (advise). `empty-restrict-to` is the only restrict-to
code and it is a pure `length > 0` test — never roster membership, never role-literal membership.
Task 8's panel will therefore render *nothing at all* for this draft. Assigning it there would
repeat the failure the house rules name: work parked on a task that cannot cover it.

**Where it actually belongs.** This is a validator code-set gap (a `restrict-to-unknown-principal`
issue or advisory that `validateWorkflowDef` does not have) plus the editor's inline warning that
would anchor to it. Neither `packages/domain`'s validator nor Plan 8 has an open task for it: Plan 8's
remaining tasks are 8–15 and none touches `validate-workflow.ts`. **No owner exists — it needs one
assigned, not inherited.** Note the roster half is not purely cosmetic: with a guest's refused
roster, *every* named-person reference in *every* rule renders unchecked, so a warning keyed only on
"not in `members`" would cry wolf across the whole workflow. The honest fix distinguishes "the roster
says this person is not here" from "there is no roster to ask" — which is design work, not a patch.

## Plan 8 Task 12 (2026-09-03) — the read-only gate is sound INSIDE app-core, and the one hole is a route Task 13 has not written yet

Task 12 wired the look-not-touch banner into the four screens and proved the gate end to end rather
than affordance by affordance. Three things came out of it worth keeping.

**The end-to-end claim, made falsifiable.** Naming buttons that should be absent proves nothing on
its own — a typo in the name makes every `not.toBeInTheDocument()` pass against a screen that never
had that button. So the sweep is an enumeration in both directions, at this sha:

- Every state-mutating gateway call in `packages/app-core/src/workflow-builder` is one of **three**
  call sites — `ui/publish-controls.tsx:73` (`submit`), `ticket-types/ticket-type-editor-screen.tsx:272`
  (`migrateTypeToWorkflow`) and `:296` (`submit`). Controls named before the run: both files had to
  appear, and both did. `publish-controls.tsx` returns `null` outright when `!env.canAuthor`; the
  editor's Save button is `canAuthor ? … : null`; the migrate path is behind a Move button that is
  `disabled={!canAuthor}` *and* only reachable once the workflow combobox has changed, which is
  itself disabled for a non-author. Two independent locks on the only irreversible one — and that
  one now has a test, which it did not: `migrateTypeToWorkflow` expands into a
  `ticket.workflow_rebound` per ticket, Task 11's rebind suite drives the whole flow but its helper
  defaults to an admin session, so no non-author had ever reached the divergence section. The new
  test attempts the admin's own gesture as a member and asserts the section never opens and
  `gateway.migrations` stays empty, with the admin doing the identical gesture as the control in the
  same file. Note an assertion on `migrations` from the BUILDER screen would not have covered it:
  that screen has no migrate path, so it could never fail.
- All **four** of `WorkspaceRole` are exercised, not two. The gate is `canAuthorRole`, a one-line
  predicate over that union, and a member/admin pair does not test a predicate's boundaries: measured
  by mutation at this sha, narrowing it to `role === 'admin'` reddens **exactly one** test out of 211
  in `test/workflow-builder/` + `test/ticket-types/` — the new owner test — and widening it to
  `role !== 'member'` reddens exactly one, the new guest test. Before them, either mutation was
  invisible to 210 tests, and an owner would have been shown a banner saying they may not change the
  thing they own. Guest is the sharper half: `screens.test.tsx`'s test *named* for the guest
  `listMembers` refusal (executor ruling 2026-09-02) passes an **admin** session, so nothing in the
  repo pinned any guest behaviour on these screens. The new one refuses the roster and asserts the
  screen still renders, still reads read-only, and still offers nothing but jumps.
- On the member's builder screen the value-bearing controls number **eleven** — one workflow-name
  textbox, five category comboboxes, five blocked checkboxes — every one disabled, and the admin
  render carries the identical eleven, every one enabled. That pair is the design decision stated as
  a measurement: read-only is *frozen*, not *hidden*. Nothing is omitted from a member's view.
- **Added in this task's FIX ROUND, because the enumeration above stopped at the builder screen.** The
  ticket-type editor is the other surface behind the same gate, and it is the one that owns
  field-schema authoring and the rank D4's requires-parent rule reads. The gate was correct in the
  code at the reviewed sha — every call site sits behind `canAuthor`, which is what the first bullet
  measured — but three of its terms were pinned by NOTHING, and that is a different claim from
  "sound". Measured: dropping `disabled` on the `IconPicker`, dropping it on the `FieldsEditor`, and
  removing the `!canAuthor` half of the rank input's `!canAuthor || isBuiltin` each left **211 of 211**
  green. The third is the sharpest, and the reason it hid is worth keeping: every member fixture in
  both suites — `access.test.tsx`'s `taskType` and `ticket-types.test.tsx`'s builtin seeds — is one of
  `BUILTIN_TICKET_TYPE_SEEDS`, so `isBuiltin` was already true and satisfied the gate whatever the
  author half said. A CUSTOM type's rank had no non-author test at all. What closes it is one test,
  `no authoring action is reachable by any path the TICKET-TYPE EDITOR offers a member` > `shows the
  member every control the admin gets, disables every one of them, and every button on the screen is
  an icon choice`, over a custom type at rank 5 carrying a text field and a select field: **eight**
  value-bearing controls (four textboxes — the select field's options textarea reports as one — three
  comboboxes, one spinbutton), every one disabled, and **sixteen** buttons, every one an icon choice
  and every one disabled. Its control asserts the identical eight ENABLED and the same button
  predicate FALSE, because on the admin's render Add field, two Remove fields and Save sit outside the
  icon group. Re-measured at the new denominator: each of the three mutations now reddens **exactly
  one** of **213**, and the two `canAuthorRole` mutations still redden exactly one each — the owner
  test and the guest test, unmoved. The `isBuiltin` half of the same gate was already pinned:
  replacing it with `!canAuthor` alone reddens `locks the rank of a built-in type and says why`, so
  D7's UI-only lock needed nothing.
- **NOT pinned, stated at the site rather than covered by a test that could not fail.** The
  `!canAuthor` term on the divergence section's `Move them to ...` and `Leave them on ...` buttons is
  unreachable for a member by construction: `diverged` compares `def.workflowId` against the
  `initialDef`'s own, so it is false at mount for every role, and the only gesture that can make it
  true is the Workflow combobox, itself `disabled={!canAuthor}`. Dropping `!canAuthor` from either
  button reddens **0** of 213. The lock that actually holds is the outer one and it IS tested —
  `locks the binding itself, so the divergence section a migration lives in never opens` — so a test
  aimed at these two terms would have to defeat the combobox gate in its own setup and would then be
  asserting that setup rather than the gate. The reason now sits in a comment beside the two buttons,
  which is the honest place for a term no test reaches.

**A claim this task wrote and then had to withdraw.** The first version of the sweep asserted "a
member's builder screen offers no button at all". It is false, and the reason is the open ruling
request above: the frozen `ERRAND_WITH_WAITS_TEMPLATE` trips `rule-bypassable` twice, so the
advisories panel puts two jump buttons on screen for every role. The template was not touched. The
surviving invariant is narrower and stronger — **every button a member is offered matches
`(issues|advisories)-panel__jump`**, whose whole effect is `store.actions.select` — and the test
clicks every one of them, re-checking the predicate after each click, because a jump mounts an
inspector and an inspector is where an ungated authoring button would appear. The admin control
asserts the same predicate is **false** on the admin's opening screen; a predicate that held for both
roles would have been measuring nothing.

**RECORDED, NOT FIXED — owner Plan 8 Task 13, verified open at this sha.** `TemplateGallery` takes no
session and applies no role check: `props.onPick` is unconditional. Inside app-core that is harmless,
because the only thing that mounts it is the list screens' `onNew`, which is `canAuthor ? … : null`.
The exposure is a **route**, and Task 13 is where routes get written: its own snippet for
`apps/web/app/w/[workspaceId]/settings/workflows/new/page.tsx` renders `<TemplateGallery>` after
`useBuilderWiring(...)` returns, and never consults `wiring.session.role` — so a member who types that
URL is handed the gallery the list screen deliberately hid from them, picks a template, and lands on a
read-only `WorkflowBuilderScreen`. No authoring action escapes (the banner shows, Publish is gone),
but an authoring *entry point* is offered, and `ticket-types/new/page.tsx` has the same shape. Task 13
is unstarted — every step box unchecked, `apps/web/src/authoring/` does not exist — and it is the task
that writes the two files, so the gate belongs in the same commit as the pages and not retrofitted
onto a component that has no session to consult.

**Not a hole, recorded so nobody "fixes" it into one.** `WorkflowCanvas` passes `nodesDraggable`
unconditionally, so a member can drag a node and `onNodeDragStop` calls `store.actions.moveState`.
That is deliberate and must stay: design decision 5 says layout is presentation, not truth, and is not
published — confirmed in the code, not inferred from the plan, at `events.ts`'s `buildPublishPayload`,
which spreads `draft.def` (a `WorkflowDef`, carrying no coordinates) and never reads `draft.positions`.
Gating the drag would freeze a member's ability to *read* a dense graph while protecting nothing.

**Plan text wrong about this repo, for the executor of Tasks 13–15.** Task 12's Step 1 snippet asserts
`'Must carry an attachment as evidence.'` renders on the errand template and clicks it to open the
transition inspector. The errand template carries **no `require-evidence` rule at all** — its three
guarded transitions (indices 3, 6 and 8) all carry `require-comment`, whose summary is identical
across all three, so even the correct string throws on multiple matches. The test addresses the edge
by its own `data-testid="transition-label-8"` instead. This is the same class of error Task 5's fix
round already recorded against the same template, and the third time in this plan that a Task's
snippet has imported `tokens.workflowBuilder.*` from `@gisik-nokma/ui`, an export that does not exist
(Tasks 8 and 9 corrected it before; the banner's colours are a BEM class in `packages/ui/src/ui.css`
over existing `var(--gn-*)` roles). A fourth: the snippets spell module imports `./read-only-banner.tsx`,
and Task 13's tsconfig step exists to make that spelling typecheck — but this repo's modules import
`.js` throughout, including every file this task touched, so the `.tsx` spelling is not the house
style it is written as. Step 4 also predicts "20 tests" for the three suites it names; they hold
**53** — the earlier suites grew past the plan's arithmetic, which is a stale prediction rather than
a missing test.

## Plan 8 Task 13 fix round (2026-09-03) — a refusal the adapter refused to guess, guessed by the screen; and NOBODY currently owns it

Recorded, not fixed, on the Task 7 entry's terms above: outside Task 13's scope, and outside every
open task's scope too.

**The gap.** `packages/app-core/src/workflow-builder/ui/workflow-builder-screen.tsx:70` loads the
roster as `props.gateway.listMembers(props.workspaceId).catch(() => [] as WorkspaceMember[])` — a
blanket catch on the promise, not a narrowing on the one refusal it was written for. Its own comment
names that refusal correctly (a guest may not call `GET /v1/workspaces/:id/members`, executor ruling
2026-09-02), but the code cannot tell that 404 from a 500, a dropped connection, or a roster body it
could not parse. All four become `[]`, which flows into `data.members` and from there into every rule
summary and the `require-different-user` editor as "nobody is in this workspace".

**Why it is only now reachable, and why the entry belongs to this task's fix round rather than to
Task 10 that wrote the line.** Before Task 13 no shipped `WorkflowAuthoringGateway` could produce a
non-404 rejection: `authoring` was not on `AppServices`, and the only implementation was
`fake-gateway.ts`'s `listMembers: async () => seed.members ?? []`, which cannot reject at all. Task 13
built the HTTP adapter, so the 500 and the dropped connection exist now. The adapter itself is
correct — it rejects rather than inventing an empty, and `gateway.ts` forbids the invention by name —
and its docblock previously claimed `WorkflowBuilderScreen` "catches a refused roster specifically".
That sentence was false the moment the adapter shipped.

**Correction, 2026-09-03, from Plan 8's final whole-branch review — this paragraph was itself an
overclaim, and the shape of it is the lesson.** It said the sentence "is corrected in the same commit
as this entry". The fix round corrected it in `data-source-gateway.ts` and **left the identical claim
standing one file away**, in `builder-wiring.tsx` (*"The screens are built for it —
`WorkflowBuilderScreen` catches a refused roster by name"*), where it survived until the final review
found it. `git log --oneline -- apps/web/src/authoring/builder-wiring.tsx` returned exactly ONE commit
— Task 13's own — and never a fix round. **A correction that names one site does not cover a claim
that lives at two**, and the doc entry asserting the correction landed is what stopped anyone
re-checking. Both sites now say the same true thing, and it is the one the sibling file already
argued: the screen's catch is blanket, and narrowing it by name is not merely undone but
**structurally impossible** there, because `AuthoringReadRefused` is declared under `apps/web` and
`packages/app-core` depends on nothing in `apps/`.

**Why it is not a one-line fix, which is the part an owner needs to know.** The narrowing that would
close it is `cause instanceof AuthoringReadRefused`, and that class is declared in
`apps/web/src/authoring/data-source-gateway.ts` — sweep: `AuthoringReadRefused` appears in **four**
files at this sha (`src/authoring/data-source-gateway.ts`, `src/authoring/builder-wiring.tsx`,
`test/data-source-gateway.test.ts`, `test/authoring-routes.test.tsx`), every one under `apps/web`, and `packages/app-core/package.json` depends on
`@gisik-nokma/domain`, `@gisik-nokma/rule-engine` and `@gisik-nokma/ui` and on nothing in `apps/`. A
screen in app-core therefore cannot name the error its own gateway contract's implementations throw.
Closing this means moving the refusal into `workflow-builder/gateway.ts` — a class or a predicate the
contract owns, which `builder-wiring.tsx` and the fake would both have to adopt — and that is a
contract change touching the adapter that throws (`data-source-gateway.ts`), the wiring that narrows
(`builder-wiring.tsx`), the screen that should (`workflow-builder-screen.tsx`) and the fake that
declares the contract's other implementation (`fake-gateway.ts`), not a catch clause. `builder-wiring.tsx` is the shape to copy:
it already answers a four-arm union in which a refused read is `refused` and never a role.

**The ownership sweep, run in the documents rather than from memory.** Plan 8 has two tasks left and
neither is a slot for this: **Task 14** is the Playwright smoke, four steps, all of them config, spec,
run and commit; **Task 15** is the catalogue and the final verification pass, four steps — Step 1 runs
commands, Steps 2 and 3 write `Features.md` §10 and `test-cases/10-workflow-builder.md`. A behaviour
change in an app-core screen fits neither, and parking it on Task 15 Step 1 would be parking a code
change on a verification run. Plans 9, 10 and 11 mention neither `WorkflowBuilderScreen` nor
`workflow-builder-screen` anywhere in their text. The only other mention of `listMembers` in this
document is the Task 12 section's fixture note, which assigns nothing. **So it is unowned, and it is
recorded that way rather than given a plausible-sounding owner** — this branch has already shipped one
false owner claim ("Lane 4") together with a false claim of having verified it.

**Also from this fix round, FIXED rather than recorded, and kept here because the measurement is the
transferable part.** **Four** of the adapter's five HTTP bodies were typed by hand-spelled inline `as`
shapes on `unknown` (`as { workflows: PublishedWorkflowDef[] }` and three siblings); the fifth, the
migrate POST, already asserted to the shared `MigrationOutcome` and narrows its refusal arm through
`isRefusal`, so it needed nothing. The review called it five; that half is refuted. `HttpClient.get`
answers `Promise<unknown>`, so the assertion was 100% of the typing, and the shapes were nominally
unlinked to the `WorkflowListResponse` / `MemberListResponse` / `StateOccupancyResponse` /
`TypePopulationResponse` the routes annotate their answers with. Measured as a pair, not argued:
renaming `workflows` -> `defs` on `WorkflowListResponse` in `packages/domain` reddened
`@gisik-nokma/server:typecheck` with TS2339 and left `@gisik-nokma/web:typecheck` **green** — the
mutation that killed nothing. After swapping the four assertions to the domain types, the identical
rename reddens web at the read itself, and so does `members` -> `roster` on `MemberListResponse`. Both
mutations were reverted with `git checkout --` and the revert confirmed by printing the two lines, not
by shell `diff`. The residual gap is stated in the adapter rather than papered over: this is
compile-time nominal linkage only, and unlike `mapWorkflowDef` nothing validates the wire, because the
`asRecord`/`asArray`/`asString` primitives are private to `online/mappers.ts` and absent from the
`@gisik-nokma/app-core/online` export list.

**Carried forward from a commit message, because that is not where this series records.** Commit
`2da26d1` reported `packages/app-core/test/workflow-builder/access.test.tsx` > "control: the identical
gesture as an admin opens the same inspector..." failing ONCE in three full-gate runs on
`[data-testid="transition-label-8"]`, and passing 5/5 alone and 6/6 as a whole app-core suite outside
turbo — read as a concurrency-load flake in a file that commit did not touch. That measurement is
quoted, not re-run here. Its stated owner was "Plan 8 Task 15, whose Step 1 is the full verification
pass", which is the right owner for a flake to be re-observed under a verification run — and, for the
avoidance of the confusion this entry could otherwise cause, is NOT an owner for the app-core
behaviour change above.
## Plan 8 Task 15 fix round (2026-09-03) — two things the catalogue sweep turned up in the code it was cataloguing

Both **RECORDED, NOT FIXED**. Task 15 writes `Features.md` §10 and `test-cases/10-workflow-builder.md`;
neither of these is a document, and parking a code change on a catalogue task is the same mistake the
Task 13 fix-round entry above declined to make.

**1. The withdrawn "catches a refused roster" sentence survives in a SECOND file, and the entry above
is not wrong about it.** The Task 13 fix-round entry says the false sentence "is corrected in the same
commit as this entry", and scopes that to "its docblock" — the adapter's. Measured: that is exactly
true. `apps/web/src/authoring/data-source-gateway.ts:114` now opens with "`WorkflowBuilderScreen` does
NOT" and spells out that the blanket catch turns a 500, a dropped connection or an unparseable body
into the empty roster — so the adapter's docblock was corrected exactly as claimed.
The reviewer's theory that the document overclaimed its own completeness is therefore **refuted**.
What is true is narrower and was missed by everyone: the same false claim was written **twice, into
two files**, and the withdrawal only ever covered one of them. `apps/web/src/authoring/builder-wiring.tsx:57`
still reads, verbatim:


    *    read-only, which is exactly what a guest should see. The screens are built
    *    for it — `WorkflowBuilderScreen` catches a refused roster by name.

It is false for the same reason the adapter's copy was: `workflow-builder-screen.tsx:70` catches the
whole promise, by no name at all. Sweep behind this: `rtk proxy grep -rn "refused roster"` over
`apps`, `packages`, `docs`, `Features.md` and `test-cases` returned **three** rows before this entry
was written — the `builder-wiring.tsx:57` row above, the Task 13 entry's own quotation of the
withdrawal at line 6392, and an unrelated `6.45` about project rosters — and returns three more now
that this entry quotes it, which is why the count is stated as of the sha before it. Positive control
for the same sweep: `AuthoringReadRefused` under `apps/web/src`, **8** rows across **2** files
(`data-source-gateway.ts` 6, `builder-wiring.tsx` 2); negative control: a nonexistent string returns
0 and exits 1.

**Owner: the same unowned `gateway.ts` contract change the entry above describes.** The sentence is
Task 13's, Task 13 is closed, and Plans 9, 10 and 11 mention `WorkflowBuilderScreen` and
`workflow-builder-screen` **zero times each** (Plan 8: 18, as the control). Whoever moves the refusal
into the contract deletes this sentence in the same change, because closing the gap is what would make
it true.

**2. Nothing in `apps/web` links to any of the six authoring routes.** `AppNav` renders *Workspaces*
and *My Work* and no settings entry. Sweep: `settings` across `apps/web/app` and `apps/web/src`,
excluding the six route files themselves, returns exactly **one** row — `builder-wiring.tsx:151`'s
*"Sign in to open settings"* copy, which is not an `href` to them — against a positive control of 14
`settings` hits inside the six route files. So `/w/[workspaceId]/settings/workflows` and its five
siblings are reachable only by typing the URL today. This is disclosed in the §10 routes bullet rather
than fixed, and it is **UNOWNED**, measured in the documents rather than from memory: `AppNav` is
Plan 6's (10 hits in Plan 6's text, zero in every other plan), Plan 6's catalogue task closed on
2026-09-02, and Plan 6's own text mentions `settings/workflows`, `settings/ticket-types` or `Settings`
**zero** times (control: `my-work`, 46 hits). Plans 9, 10 and 11: zero for `AppNav` and zero for both settings route paths. The bare word `Settings` is **not** zero there, and is named so a later sweep does not think it found something: 32 hits in Plan 9, every one of them `getWorkspaceSettings` / `proj_workspace_settings` (Plan 5's server-side notification thresholds), and 1 in Plan 10, a desktop sign-in hint telling a user to paste a token in the desktop app's own Settings. Neither is a nav entry to these six routes; the discriminating term is the route path, and that is zero in every plan but Plan 8's own Task 13. Plan 8's
own text never asks for a nav entry either — Task 13 is "the gateway adapter and the six pages". As
with the roster gap, this is recorded as unowned rather than handed a plausible-sounding owner.

**A measurement correction future ownership sweeps need.** Checkbox state in these plan files is
**not** evidence a plan has run: `2026-08-20-08-workflow-builder.md` has **0** checked and 98
unchecked boxes at this sha, with Tasks 1–15 executed and committed. The sweep above used artefacts
instead — `Features.md` carries no §11 heading and `test-cases/` holds no `11-` file, which is what
actually establishes that Plan 9 Task 15 (reserving ids 11.1–11.47) has not run.

> **SUPERSEDED 2026-09-04 by the event it was predicting: Plan 9 Task 15 HAS now run**, on
> `exec/14-plan9-calendar`. `Features.md` carries a §11 heading and `test-cases/` holds
> `11-calendar-notifications.md`, so the artefact test above now returns the opposite answer. The
> *method* stands and is the reason this note is amended rather than deleted — checkbox state is
> still not evidence, and artefacts still are. Two facts the sweep above could not have known,
> both measured at that branch: the reserved range it cites is **not** what shipped — Plan 9's
> nominal `11.1–11.47` was superseded on the branch by a one-id-per-test scheme, and the live
> range is **11.1–11.188 with 11.9–11.17, 11.19–11.35, 11.40–11.47 and 11.123–11.129
> permanently unused**; and the *second* half of the sweep above — that nothing in `apps/web`
> links to Plan 8's six authoring routes — is now pinned by a test rather than only disclosed.
> `apps/web/test/app-nav.test.tsx` case **11.185** asserts `AppNav`'s hrefs are EXACTLY
> `/workspaces`, `/w/<id>/my-work` and `/inbox`, so whoever wires a settings entry is told by a red
> test naming itself that the nav changed and the catalogue needs a case. **11.171, which asserts the
> same three links are present, is not that test and cannot be**: measured by wiring a
> `settings/workflows` link into `AppNav`, 11.170 and 11.171 both stayed GREEN and only 11.185 went
> red. A presence assertion cannot see a fourth door — which is the same blindness, one level up,
> that let a deleted `<InboxNavLink />` leave 125 tests green. The gap stays **UNOWNED**; only its
> silence is fixed.
