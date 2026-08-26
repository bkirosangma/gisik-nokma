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
   - **`TicketState`** is Plan 3's full shape (id, workspaceId, projectId, typeId, parentId, workflowId, stateId, stateCategory, assigneeId, collaboratorIds, fields with per-field `FieldClaim` provenance) **plus** Plan 2's transition log `transitions: { toStateId: string; actorId: string; seq: number; workflowId: string; workflowVersion: number }[]` — `require-different-user` resolves its named earlier transition from this log via `ctx.getEntityState`. Plan 2's Task 2 is the definition site; Plan 3's reducer produces (not redefines) the type. The per-entry `workflowVersion` is the owner decision of 2026-08-26 below: without it a remapped state id silently disarms four-eyes.

5. **Membership entity id is deterministic:** `membershipId(workspaceId, userId)` = `` `${workspaceId}:${userId}` `` (Plan 2's helper in domain). Plan 4's fresh-ULID-per-event mapping was drift — the engine must address a membership from `(workspaceId, actorId)` via `getEntityState('membership', id)`, which an opaque ULID cannot do. Scope stays in the payload; `proj_memberships` keys as Plan 4 designed.

6. **`ticket.transitioned` is registered exactly once, by Plan 3** (Task 2, contracted payload `{toStateId, comment?, evidenceAttachmentId?}`). Plan 2's registration is provisional for its own tests and is deleted when Plan 3 lands. `workflow.defined` belongs to Plan 2; the remaining ticket vocabulary to Plan 3; workspace/project/membership/visibility events to Plan 4; Plan 1's `workspace.created`/`workspace.renamed` seeds are provisional until Plan 4 lands.

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

**Consequence to revisit, not to silence:** Plan 5 annotates its fallback-column path (a ticket whose `state_id` is absent from its workflow's latest definition) as "contracted-unreachable, no planted test", on the strength of Plan 2's forced state mapping. Migration makes it reachable again, so that annotation and its no-test decision are re-opened when this lands.

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
- **Plan 4** — `proj_projects`, the `ticket.created` precondition refusal naming the honest reason, and project-scope validation on membership grants. Also inherits the permission gate for `ticket.workflow_rebound`: migration re-homes work other people are doing, so it belongs with the admin-gated actions rather than with ordinary ticket edits.
- **Type versioning (unassigned)** — the re-derivation limit recorded under the workflow-pinning decision above. Not urgent, but it should not be discovered by a verifier alarm.
- **Plan 5** — the fallback-column annotation, currently "contracted-unreachable, no planted test" on the strength of Plan 2's forced state mapping. Migration makes it reachable; the annotation and the no-test decision both need revisiting.
- **Plan 8** — the divergence-notice component itself. Its design, copy table, gateway method, fake-gateway seams and honest-degradation paths are all in place; only the component code is unwritten.
- **Plan 10** — the replica-fold tests. The fold itself is wired.
- **Plan 11** — the demo and dev seed CLIs should call Plan 4's bootstrap rather than re-emitting the founding events, so the seeds cannot drift from the real founding sequence.
