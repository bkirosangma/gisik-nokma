# Plan 4 — coordination-obligation lens

**Lane 2, Wave 1.** Every obligation the coordination doc (`docs/superpowers/plans/2026-08-20-00-series-coordination.md`, read in full, 613 lines) places on Plan 4 (auth, workspaces & visibility), classified against Plan 4's own task text.

## Method and classification convention

Sources: the coordination doc in full; the five task extracts in this directory (`extract-A` … `extract-E`) as the record of Plan 4's own text — the plan document itself was not re-read; and the shipped code on `main` for every claim either document makes about it.

- **ABSORBED** — Plan 4's task text already carries the obligation. Nearly every one of these is an item the coordination doc itself marks `~~Done~~`, meaning the plan text was amended when the decision landed.
- **RIDER** — the work falls inside an existing task's scope but that task's text does not say it. The implementer must be told explicitly. *Everything dated 2026-08-28 — Plan 1 and Plan 2 execution consequences, the seven pre-rulings, the autonomous protocol, the model/effort policy — post-dates Plan 4's text and can be at best a RIDER.*
- **UNABSORBED** — no Plan 4 task owns it: it needs a decision, an artifact, or a file that appears in no task's Files list.

A rider is not a defect in the plan. An UNABSORBED row is a hole, and under the autonomous protocol's ruling 3 most of them must be answered conservatively and recorded in the coordination doc **in the same change set as the task that discovers them**.

---

## 1. Obligation table

### 1.1 Reconciliation decisions (§1–§8)

| # | Source | Obligation | Owning task | Status |
|---|---|---|---|---|
| A1 | §1 Package scope | Every import specifier is `@gisik-nokma/*`; `@gisik/*` is drift. | all | ABSORBED |
| A2 | §2 Features/test-cases | Plan 4 owns `Features.md` §6 and `test-cases/06-auth-visibility.md` (cases 6.x), moved in the same change set as the work; never renumber 03–05. | T12 (creates), T13, T14 (extend) | ABSORBED |
| A3 | §4 Entity-state types | `MembershipState` is defined once in `@gisik-nokma/domain`; Plan 4 produces membership rows, never a second membership type. | T3, T4 | ABSORBED (`packages/domain/src/entity-state.ts:41` verified) |
| A4 | §5 Deterministic membershipId | Membership entity id is `membershipId(workspaceId, userId)` = `` `${workspaceId}:${userId}` `` — Plan 2's domain helper; a fresh ULID per event was drift, because the engine must address membership from `(workspaceId, actorId)`. | T3 | ABSORBED (helper verified at `entity-state.ts:58`) |
| A5 | §6 amendment (2026-08-28) | Any Plan 4 fixture or test emitting `ticket.transitioned` speaks the SHIPPED payload — field `to` (never `toStateId`), `comment` as `{ text }` — because the door and the engine already speak it. | T5, T7, T9, T12 | RIDER |
| A6 | §6 vocabulary ownership | Workspace/project/membership/visibility events belong to Plan 4; **Plan 1's `workspace.created` / `workspace.renamed` seeds are provisional until Plan 4 lands**, so T3 must *replace* them, not add alongside. | T3 | RIDER — see C3 |
| A7 | §8 Registration order | The order is `proj_entity_heads, proj_workflows, proj_ticket_types, proj_projects, proj_tickets, proj_rollups, proj_memberships, proj_visibility`, with `proj_projects` before `proj_tickets` because the ticket precondition reads it. | T9 (Step 3b) | ABSORBED in intent |
| A8 | §8 + Plan 1 §6 + pre-ruling 6 | The **shipped** pin — the order list in `src/projections/registry.ts`'s doc comment and the array in `apps/server/test/projection-order.test.ts` — omits `proj_projects` entirely; Plan 4 corrects both, and every one of its four registrants extends the order test in the same commit that registers. | T4, T6, T9, T14 | RIDER |

### 1.2 Contract amendments recorded

| # | Source | Obligation | Owning task | Status |
|---|---|---|---|---|
| B1 | Contract amendments | `canSee` and `visibleEventsFor` take a leading `db: Queryable` (DI per CODING_STANDARDS). | T7, T11 | ABSORBED |
| B2 | Contract amendments + §18 | `visibleEventsFor` yields `SyncItem`, the union that carries purge tombstones — Plan 10 consumes this shape. | T11 | ABSORBED, but the union is three-member — see C1 |
| B3 | Contract amendments + pre-ruling 1 | Plan 3 owns `GET /v1/tickets/:id/history` (`routes/ticket-history.ts`); Plan 4 owns ticket read endpoints and **wraps its read enforcement — visibility, restricted-parent placeholder, provenance-untouched — around both**. | T8, T10 | RIDER — see C2 |
| B4 | Contract amendments / sign-off table | Auth library is **better-auth**, owner-signed-off; pin the latest 1.x, exact version in the lockfile and PR description. | T1 | ABSORBED |
| B5 | Contract amendments | Rule-id strings are opaque module-scoped identifiers; the values in each Produces block are the contract (`permission.role`, `permission.visibility`, `project.unknown`). Styles across modules do not converge. | T5, T9 | ABSORBED |
| B6 | Contract amendments | A duplicate event id refuses as `duplicate-event-id`; the founding path must answer it without re-bootstrapping. | T5, T13 (case 6.26) | ABSORBED |
| B7 | Amendment 15 | Plan 7 extends `IngestDeps` additively with `gates?: ServerGate[]`; Plan 4's gate wiring into the same ingest transaction must stay additively compatible with it (both lanes touch ingest). | T5 | RIDER |
| B8 | Amendment 16 + Plan 10 walk | `permission.visibility` is now ONE rule id shared by the interactive door and Plan 10's sync door (`VISIBILITY_REFUSAL_RULE`); it may not be renamed or forked. | T9 | RIDER |
| B9 | Amendment 18 | `workspace_seq` is the stream cursor: `visibleEventsFor(…, afterSeq)` filters and orders by it, per-entity `seq` keeps its role, and clients treat `afterSeq` as opaque. | T11 | ABSORBED (cases 6.21, 6.22) |
| B10 | Amendment 19 | Stream frames carry `workspaceId` on purge/caught-up/error. | — | NO ACTION — Plan 5's frame layer; `visibleEventsFor` is called per workspace, so the caller already holds it |
| B11 | Amendment 13 + Plan 10 walk | A `scope-revoked` instruction must exist for Plan 5's stream layer to map to its `{type:'scope-revoked'}` frame — without it a connected guest's revocation reaches them only at next bootstrap. | T11 | ABSORBED (implementation), CONTRADICTED by the interface bullet — see C1 |
| B12 | Amendment 20 + 2026-08-27 route-prefix ruling | The product API is `/v1/*`; `/api/auth/*` is better-auth's vendor surface and the only exception. Plan 4's 19 registrations moved; the end-to-end tests post to Plan 1's real `POST /v1/events` with body `{ events: [envelope, …] }`. | T2, T8, T12, T13, T14 | ABSORBED (open question 11) |

### 1.3 Owner decision 2026-08-26 — "A new workspace can hold a ticket the moment it exists"

| # | Source | Obligation | Owning task | Status |
|---|---|---|---|---|
| D1 | Founding decision | Every workspace is founded with the simple-Kanban template bound to all four built-in types; the founder is never asked to choose. | T5 Step 6, T13 | ABSORBED |
| D2 | Founding decision — LOAD-BEARING ORDER | Immediately after `workspace.created` is accepted, append **in this order**: the default `workflow.defined`, then the four `ticket-type.defined` from `builtinTicketTypeDefs(defaultWorkflowId)`, then the founder's `membership.granted` — a type naming an undefined workflow is refused. | T5 Step 6 | ABSORBED |
| D3 | Founding decision + Plan 11 walk | The whole founding sequence runs **inside the same transaction** as `workspace.created` (that is the property Plan 11's seeds were rewritten onto), through the server-origin internal append path, bypassing `checkPermission`. | T5 Step 6 | RIDER — `commitOne` opens one transaction per event today; T5 must add a multi-append path. See G3. |
| D4 | Founding decision | The bootstrap fires on accept and never on `duplicate-event-id`, or Plan 11's idempotent seed CLIs double-append on every re-run. | T5 Step 6 | ABSORBED |
| D5 | Founding decision | The hook lives in the shared ingest path, not the route, so `POST /v1/workspaces` and Plan 11's seeds share exactly one founding sequence. | T5 Step 6 | ABSORBED |
| D6 | Founding decision + pre-ruling 2 | The simple-Kanban definition gets ONE home in `@gisik-nokma/domain`, consumed by Plan 4's bootstrap and Plan 8's gallery alike — carried **by identity**, as `ERRAND_WITH_WAITS_TEMPLATE` is. Plan 8 T3's guard must not create the file; if absent, that lane waits. | T5 Step 6 | ABSORBED (file), RIDER (export from the barrel; merge early; the gallery-identity test is Plan 8's) |

### 1.4 Owner decision 2026-08-26 — "a ticket cannot be created into a project that was never founded"

| # | Source | Obligation | Owning task | Status |
|---|---|---|---|---|
| E1 | Project-existence decision | `proj_projects` projects `project.created` and kin into a queryable table, registered **before `proj_tickets`**. | T9 Step 3b | ABSORBED |
| E2 | Project-existence decision | The refusal names the honest reason — the project does not exist — rather than reporting a nonexistent project as a membership problem (`project.unknown`). | T9 Step 3b | ABSORBED (cases 6.29, 6.30) |
| E3 | Project-existence decision + outstanding-item note | The check covers **every event that names a project**, not only `ticket.created`, and runs **before** the membership check so the honest reason wins where both would fire. | T9 Step 3b | ABSORBED (`projectNamedBy`) |
| E4 | Project-existence decision | "Membership grants validate their project scope" — after the 2026-08-27 collapse this obligation lands on `project.member_added` / `project.member_removed`, which is the only remaining project association. | T9 Step 3b | ABSORBED (`projectNamedBy` maps both to `entity.id`; membership events map to `null`) |
| E5 | Outstanding-item note | `ticket.workflow_rebound` joins `ADMIN_ONLY_TYPES` — migration re-homes other people's work and is not an ordinary ticket edit. | T5 | ABSORBED (case 6.31) |

### 1.5 Owner decisions 2026-08-27 — Plan 4's open questions

| # | Source | Obligation | Owning task | Status |
|---|---|---|---|---|
| F1 | One way onto a project | Membership collapses to **workspace-scope only**; `MembershipScope` is removed from the vocabulary. | T3, T4 | ABSORBED |
| F2 | Outstanding-from-this-wave | `membership.granted` / `membership.revoked` **REFUSE** a `scope` rather than ignoring one — silently doing something else with a stale client's claim is the quiet acceptance the contract forbids. | T3 | ABSORBED (two exact parser messages) |
| F3 | Outstanding-from-this-wave | `membership.revoked` deletes a person's **project** rows too — leaving someone on a project after they are out of the workspace is the same silent-access failure elsewhere. | T4 | ABSORBED (live path); the rebuild path is UNABSORBED — see G5 |
| F4 | One way onto a project | `project.member_added` / `project.member_removed` are the only project association; guests reach work through `visibility.set` explicit lists only. | T3, T4 | ABSORBED — but T4's guest-inference branch is now dead, see C6 |
| F5 | Invites name an address | `invite.sent { inviteId, address, channel, role, projectIds? }`, `invite.accepted { inviteId, userId }`, `invite.revoked { inviteId }` — an invite names an address, because somebody who has never signed in has no user id. | T14 | ABSORBED |
| F6 | Invites — pinned shapes | `GET /v1/invites/:token` → `InviteSummary { workspaceId, workspaceName, role }` or null; `POST /v1/invites/:token/accept` → `{ workspaceId }`. These are Plan 6's contract, consumed verbatim — do not invent a third shape, do not rename. | T14 | ABSORBED |
| F7 | Invites | `role` excludes `owner`: an invitation cannot make somebody the owner of a workspace they have not entered. | T14 | ABSORBED (parser refuses by omission, with the reason saying so) |
| F8 | The token is a credential | The token is not the event id and never enters the ledger; it lives hashed in server-owned state beside the sessions. Anyone who can read a workspace's history could otherwise accept an invitation addressed to somebody else. | T14 | ABSORBED (`invite_tokens`, sha256, planted credential-separation defect 6.35) |
| F9 | The owner reads everything | The workspace `owner` bypasses read visibility across their workspace; `admin` does **not** and must join a project to read its project-mode tickets. Writing is unchanged. | T7 | ABSORBED in the amendment note, CONTRADICTED by two pieces of plan text — see C5 |
| F10 | The owner reads everything | The bypass lands in `canSeeResolved` **and** in `listVisibleTickets`, which restates the decision table in SQL; an owner-viewer test stands guard between the two copies and must not be dropped or merged away. | T7 | ABSORBED (cases 6.39, 6.40) — RIDER: the guard is the point, not the coverage |
| F11 | The owner reads everything | The power is made honest by disclosure, not attribution — the visibility controls state plainly that the workspace owner can always see. | — | NO ACTION — Plan 6 T15b copy |
| F12 | Guests receive only the workflows they need | Definition events are narrowed to the workflows and ticket types actually used by tickets that guest can see — sending all of them leaks internal process to an external party. | T11 | ABSORBED (implementation), CONTRADICTED by the interface bullet — see C7 |
| F13 | Purge on membership loss | Members losing a project get per-id purges; a **guest** being revoked gets a single scope-revoked instruction instead, because per-id purges tell an external party the size of work they were never shown. | T11 | ABSORBED — RIDER: the split must be guest-only, not universal |
| F14 | A creator may still lock themselves out | Explicit lists stay exactly the authored list — appending the creator or assignee would be the system inventing a claim nobody made. Server behaviour is unchanged; the warning is client copy. | T7, T9 | ABSORBED (open question 9) |
| F15 | Client visibility editor assignment | `GET /v1/me/workspaces` — the workspace directory Plan 6's navigation coded against and its Playwright smoke **mocked**, which no plan served. | T13 Step 4b | ABSORBED (case 6.41) |
| F16 | Client visibility editor assignment | `GET /v1/workspaces/:workspaceId/invites` — the pending list, admin-only, which **never re-serves a token**: a list that re-served credentials would turn a read into an issuance. | T14 | ABSORBED (case 6.42) |
| F17 | Outstanding-from-this-wave | `invite.sent` reaches only owners and admins in sync-down, because it carries an address. | T14 | ABSORBED — but written against the wrong file, see C2 |
| F18 | Outstanding-from-this-wave | Client-submitted `invite.accepted` is refused even from an admin — otherwise anyone reading an `inviteId` could bind it tokenlessly. Acceptance is server-recorded. | T14 | ABSORBED (case 6.34) |
| F19 | Outstanding-from-this-wave | Unknown, revoked and spent tokens answer one identical 404. | T14 | ABSORBED — RIDER: the 404 **body** is specified nowhere; needs a recorded ruling (see §3) |

### 1.6 Plan 1 execution consequences (2026-08-28) — all post-date Plan 4's text

| # | Source | Obligation | Owning task | Status |
|---|---|---|---|---|
| G1 | §1 | Every projection's table names are **unqualified** and lowercase-unquoted (`proj_memberships`, never `public.proj_memberships`) — the verifier's only fence is `search_path`, so a qualified name writes LIVE during a read-only verify. No projection column may be of type `json` (no equality operator, so `EXCEPT` cannot diff it). `jsonb` is fine. | T4, T6, T9, T14 | RIDER |
| G2 | §3 | Every projection table carries a primary key, or the diff must switch to `EXCEPT ALL` — `EXCEPT` has set semantics and cannot see duplicate-row drift. All four of Plan 4's tables do; state it so it survives a schema edit. | T4, T6, T9, T14 | RIDER |
| G3 | §5 | **The plan that ships the series' second both-lock production path must land the `pg_locks` lock-order test** — hold the pair in one transaction, assert the acquisition order actually observed. The coordination doc asks in terms whether Plan 4 introduces one. It does: the founding sequence is one transaction taking `lockWorkspace` once and `lockEntity` seven times across four entity kinds (D3), and invite acceptance takes three-plus more. | T5 | **UNABSORBED** |
| G4 | §6 | Registration order is unpinned until a second registrant arrives with the ordering assertion; Plan 4 brings four registrants and must extend `test/projection-order.test.ts` in the same commit as each. | T4, T6, T9, T14 | RIDER (merges with A8) |
| G5 | §6 + `event-store.ts:140-153` | **Determinism test 3 goes live with the first order-sensitive projection and must be re-read then, not assumed still green for the right reason.** Canonical replay order is `(entity_kind, entity_id, seq)` — per-entity causality only, and the doc comment says in terms that `workspace_seq` "orders live streams, never replay." Two Plan 4 projections assume otherwise: `proj_memberships`' `membership.revoked` deletes rows written by *project*-entity events (`membership` sorts before `project`, so on replay the delete runs before the rows exist), and `proj_visibility` resolves inherit chains on "a parent's row always exists before any child references it," which holds in `workspace_seq` order and not in ULID order over ticket ids. Live and re-derived tables can disagree; `verify-projections` would report the drift. | T4, T6 | **UNABSORBED** |
| G6 | §6 + Plan 2 §5 | `reset()` is `TRUNCATE` today; whoever writes the first non-TRUNCATE reset owns re-deriving the lock contract — and Plan 2's entity↔workspace door depends on TRUNCATE's ACCESS EXCLUSIVE for its "a rebuild cannot expose an empty table as not-yet-bound" argument. `projInvites.reset` is `DELETE FROM proj_invites`. | T14 | **UNABSORBED** |
| G7 | §7 | No silent type coercion at any HTTP door: the Fastify instance is `coerceTypes: false`, `removeAdditional: false`, **instance-wide**. Query and path parameters do not coerce either; a route wanting a number converts explicitly. No later plan may re-enable coercion to fix one route. | T8, T13, T14 | RIDER |
| G8 | §8 | `nextSeq`/`nextWorkspaceSeq` require READ COMMITTED; no later plan may raise the ingest transaction's isolation level without replacing the seq mechanism. T5 modifies `ingest/pipeline.ts` and T5/T14 open multi-append transactions. | T5, T14 | RIDER |
| G9 | §9 | In the Plan 3 T2→T12 window, `getEntityState` returns a head **pointer** cast through `as unknown as`, so `evaluateRestrictTo`'s `membership.role` is `undefined` at runtime and **every role-gated transition is silently refused** with a legitimate-reading reason. The keystone's rider makes the stubs return `null` for kinds they cannot serve. Membership is Plan 4's entity kind, and nothing in Plan 4 or Plan 3 makes `getEntityState('membership', …)` honest. | — | **UNABSORBED** |
| G10 | §10 | Plan 4 sources `Refusal` from `@gisik-nokma/domain`; the shipped code puts it in `@gisik-nokma/rule-engine`. **Plan 4's executor takes the import origin from the shipped code, not from the plan text.** | T5, T9 | RIDER — see C4 |
| G11 | §10 + pre-work micro-PR | `LedgerEvent` was hoisted to `@gisik-nokma/domain`; `apps/server/src/ledger/event-store.ts` imports it and does **not** re-export it, so Plan 4's `import type { LedgerEvent } from '../../src/ledger/event-store'` fails as written. | T4, T8, T11 | RIDER — see C4 |
| G12 | §2, §4 | Verifier autocommit snapshots and the verifier's DDL credential must be ruled at Plan 11's pre-flight. | — | NO ACTION — Plan 11's |
| G13 | §11 | The entity↔workspace and type↔kind refusals landed in Plan 2; Plan 4's registrations must keep their `entityKind` bindings honest, and its `appendTestEvent` helper writes to `events` directly, bypassing that door — so a test can seed data ingest would refuse. | T3, T8 | RIDER |

### 1.7 Plan 2 execution consequences (2026-08-28)

| # | Source | Obligation | Owning task | Status |
|---|---|---|---|---|
| H1 | §2 | `WorkflowDef.roles` is `z.array(z.string())`, so a definition can name a role that does not exist and the guard is silently *closed*, not guarded. **Does Plan 4's simple-kanban template touch this? No** — all four transitions carry `rules: []`, so the template names no role at all. The hole stays unowned and Plan 4 does not widen it. | T5 Step 6 | ABSORBED by non-applicability — RIDER only if the template ever gains a `restrict-to` |
| H2 | §5 | The entity↔workspace door is server-only, spelled `entity-workspace-mismatch`; Plan 10 mirrors it in the replica. | — | NO ACTION — Plan 10's |
| H3 | §6 + pre-ruling 6 | Rule-engine fixtures live flat in `packages/rule-engine/fixtures/` and `fixtures.test.ts`'s exact count is bumped in the same commit; under parallelism every colliding branch states its delta and the merger sums them. **Plan 4's delta is ZERO** — its planted defects are ordinary Vitest tests in `apps/server` because permission refusals are pre-engine and involve no `workflowDef`. Stated so the arithmetic merge is not left guessing. | — | NO ACTION — declared zero |
| H4 | §7 rider | Verify mutation restorations with `git diff` or by reading the file, **never** with a proxied shell `diff` — an RTK-proxied `diff` reported "identical" for files that differed. Binding on every mutation sweep in this lane's per-task reviews. | lane | RIDER |
| H5 | §7 rider | Evidence-id existence is Plan 7's unconditionally (pre-ruling 5); the "whichever lands second" clause is resolved and Plan 4 does not inherit it. | — | NO ACTION |
| H6 | §8 ruling + landed F5 amendment | The generalised `rule-bypassable` advisory tier now ships. `SIMPLE_KANBAN_TEMPLATE` carries no wildcard edges and no rules, so it trips nothing — but the product's default workflow should assert `adviseWorkflowDef(def) === []` beside its `validateWorkflowDef(def) === []`, so a warned default can never become the next unremarked example. | T5 Step 6 | RIDER |

### 1.8 Parallel-waves pre-rulings and schedule

| # | Source | Obligation | Owning task | Status |
|---|---|---|---|---|
| I1 | Pre-ruling 1 | Ticket read routes: Plan 3 T13 ships `routes/ticket-history.ts`; Plan 4 T8 creates `routes/tickets.ts`; **Plan 4 adapts at merge and cites the pre-ruling line.** Plan 4's read enforcement wraps both. | T8, T10 | RIDER — see C2 |
| I2 | Pre-ruling 2 | `simple-kanban.ts` is Plan 4's; Plan 8 T3's guard must NOT create it, so the lane waits on Plan 4 — which makes it an unblocking artifact that merges as a micro-PR when green. | T5 | RIDER |
| I3 | Pre-ruling 6 | `projections/index.ts` collisions merge onto §8's order as the single source; the plan merging second updates the array to the **full** order. | T4, T6, T9, T14 | RIDER (merges with A8/G4) |
| I4 | Pre-ruling 7 | `packages/app-core` and `packages/ui` scaffolds are Plan 6a's, not Plan 4's; the founding *screen* is Plan 6 T15b. Plan 4 creates no client package and no client surface. | — | NO ACTION — confirms Plan 4's open question 10 is closed |
| I5 | Wave 1, finding 2 | Plan 4 runs as partition A → B2 → B1. **T9 splits**: Step 3b (`proj_projects` + the honest refusal) is partition A and runs on today's `main`; the rest of T9 waits on Plan 3. The plan presents T9 as one task. | T9 | RIDER |
| I6 | Wave 1, finding 2 | T6 destructures Plan 3's `ticket.created` / `ticket.reparented` payloads **inline** rather than importing Plan 3's types, so it runs in partition A. The plan text imports them. | T6 | RIDER |
| I7 | Discipline — micro-PRs | Unblocking artifacts merge when green, not at plan end: **T1's `Queryable` gates Plan 7 T7/T8** and T5's `simple-kanban.ts` gates Plan 8 T3. A keystone sitting unmerged in a lane branch blocks other lanes exactly as if it were unwritten. | T1, T5 | RIDER |
| I8 | Discipline — adaptation maps | Every dispatch carries the sibling lanes' current branch heads; maps re-run at each wave boundary; **import origins come from shipped code, never plan text** (standing law, load-bearing across lanes). | lane | RIDER — this is what makes C3, C4 and C8 executor-facing rather than academic |
| I9 | Discipline — mocked contracts | At each wave boundary one live-integration pass proves the seams against the real server before the next wave builds on them. Plan 4 serves three previously-mocked contracts (`GET /v1/me/workspaces`, the two invite routes). | T13, T14 | RIDER |
| I10 | Discipline — review depth | Review depth is not trimmed: full SDD per-task implementer→reviewer→fix rounds, the pre-flight scan, the final whole-branch review with adversarial refuters. No lane may cite throughput as grounds to skip a gate. | lane | RIDER |

### 1.9 Autonomous execution protocol and model/effort policy

| # | Source | Obligation | Owning task | Status |
|---|---|---|---|---|
| J1 | Protocol 1 | Direct pushes to `main` stay forbidden; every change travels branch→PR. A PR that passed its full machinery **and** an independent CI run green may be auto-merged without a per-PR ask, owner notified after. | lane | RIDER |
| J2 | Protocol 2 | Wave transitions dispatch automatically on their gate condition, with a notification. Lane work under this schedule carries standing authorization. | lane | RIDER |
| J3 | Protocol 3 | On a decision the plans do not answer: take the **conservative** option (fail-closed, refuse, the narrower scope), record a ruling-request entry in the coordination doc **in the same change set**, push-notify the owner, continue. Block only where a MUST says so. | lane | RIDER — see §3 for this plan's live candidates |
| J4 | Plan 2 consequences preamble | "Route it at plan end" is not a mechanism — it is an intention held by a session that is about to end. **The routing happens in the task that discovers the item.** A deferral is not complete until it is committed to the coordination doc. | lane | RIDER |
| J5 | Owner ruling 2026-08-28 | Lanes run unattended under `bypassPermissions`; the controls are branch-and-PR discipline, the CI gate, review depth, and the owner's power to revoke. | lane | NO ACTION |
| K1 | Model/effort — floor list | **T5** (permission gate + bootstrap), **T7** (canSee + the SQL twin that must not disagree), **T11** (visibleEventsFor + purge split), **T14** (invite token custody) are floor-list: implementer floor opus/high, reviewer top-tier. Non-negotiable. | T5, T7, T11, T14 | RIDER |
| K2 | Model/effort — owner amendment | "Top tier" means an explicit `model: fable` dispatch, never "the session's own model." Controllers run Opus 5. If fable cannot be dispatched, the fallback is opus at max effort, **recorded in the ledger as a deviation**. | lane | RIDER |
| K3 | Model/effort | Right-sized in both directions: sonnet/medium for transcription implementers, sonnet/low–medium for migrations from pinned schemas and the Features.md/test-cases catalogue tasks (T12), opus/high for reducers, projections, gates, folds and planted-defect design. | T4, T6, T9, T12 | RIDER |
| K4 | Ultracode usage | Exactly two fan-outs are required per full plan lane: the **pre-flight scan** (task extractors + repo-verified adaptation map + this obligation lens → conflict table) before the first dispatch, and the **final whole-branch review** (four lenses with mocked-contract at top effort, adversarial refuters, ledger triage, synthesis) before the PR is auto-merge-eligible. No full plan ships without both. | lane | RIDER |
| K5 | Ultracode usage | A finding-bearing final review gets a **scoped re-review fan-out** over the fix commits. Micro-PRs get a single implementer + single reviewer at their class tiers — running the two-fan-out treatment on a forty-line diff is theatre. | lane | RIDER |
| K6 | Model/effort | Escalate an implementer one tier after two failed fix rounds, recorded with the reason; never de-escalate below a class floor. **Budget pressure defers work; it never thins a gate.** | lane | RIDER |

---

## 2. Contradictions — where the coordination doc and Plan 4 disagree

Ordered by how expensive each is to discover late.

**C1 — `SyncItem` is two members in the contract and three in the code.** Amendment 18 and the contract-amendments block both pin `SyncItem = LedgerEvent | PurgeInstruction`, and T11's own Interfaces bullet repeats it with "do not rename anything here." But the 2026-08-27 purge/scope-revoked split requires a third member, T11's Step 3 implementation defines `ScopeRevokedInstruction { kind, workspaceId, projectId? }` and folds it in, amendment 13 gained the matching stream frame, and **Plan 10 has already landed its consumption of it** (`replica.revokeScope`). The coordination doc's §18 text is stale against its own later sections. *Resolution: three members. T11's interface bullet and open question 2 are corrected, not the code; Plan 5's stream layer maps the third member to its frame.*

**C2 — the sync-down file, and the test path that must move with it.** Plan 4 T14 modifies `apps/server/src/sync/visible-events.ts` while T11 creates `apps/server/src/visibility/visible-events-for.ts`. The coordination doc's by-catch names this exactly: *"Plan 4 is internally inconsistent about the sync path … The T11 path governs."* Riding with it, and not named in the by-catch: test case **6.38** cites `test/sync/visible-events.test.ts`, which under the governing path is `test/visibility/visible-events-for.test.ts`. T14's Files list and its case citation both move.

**C3 — `workspace.created` is already registered, and `workspace.renamed` has no Plan 4 owner.** §6 says Plan 1's `workspace.created` / `workspace.renamed` seeds are *provisional until Plan 4 lands*, which reads as "Plan 4 registers them." On `main` both are already registered in `packages/domain/src/vocabulary.ts`, and `createEventTypeRegistry.register` **throws** `event type already registered` on a duplicate — so T3's registration of `workspace.created` does not add, it crashes at module load. T3 must take the provisional registrations over. And T3 registers seven types, none of them `workspace.renamed`, while T13's `GET /v1/me/workspaces` and T14's `GET /v1/invites/:token` both call a `workspaceNameFromLedger` helper documented as reading "the latest `workspace.created`/`workspace.renamed`" — **a helper no task's Files list creates**, cited by T13 as Task 14's and by T14 as pre-existing.

**C4 — two import origins the plan gets wrong, both verified against `main`.** (a) Plan 4 sources `Refusal` from `@gisik-nokma/domain`; it lives at `packages/rule-engine/src/engine.ts:3`. The coordination doc already rules this: *"Plan 4's executor takes the import origin from the shipped code, not from the plan text."* (b) T4's test helper, T8 and T11 import `LedgerEvent` from `apps/server/src/ledger/event-store`; the pre-work hoist moved it to `@gisik-nokma/domain`, and `event-store.ts` now imports it without re-exporting — so the plan's path resolves to nothing.

**C5 — the owner read bypass contradicts two pieces of Plan 4's own text.** The 2026-08-27 decision gives the workspace `owner` a read bypass. But T4's role-resolution note says in terms *"Task 7's `canSee` grants owners/admins NO read bypass (Open questions)"*, and T7's printed decision table has one row for "member / admin / owner" reading *workspace: yes · project: only if on the project · explicit: only if listed* — the pre-amendment rule, with the bypass surviving only as a prose note beside the table. Both are pre-amendment text the owner decision governs: the owner row is all-yes in both `canSeeResolved` and `listVisibleTickets`, and the owner-viewer test stands guard between the two copies.

**C6 — T4's guest-inference branch is unconstructible after the collapse.** `resolveEffectiveRole` infers a workspace `guest` from *"only project-scope rows, any of them carrying role `'guest'`"*, and case **6.5** asserts *"a project-scope guest is a guest of the workspace."* After the collapse no path can produce that state: `project.member_added` writes `role='member'` unconditionally, `membership.granted` refuses a scope, and `invite.sent` refuses a guest carrying `projectIds`. The branch is dead and its test cannot be seeded through the shipped parsers. The collapse governs; the branch and the case need rewriting or removing.

**C7 — the guest definition slice is narrowed in the code and unnarrowed in the prose.** The 2026-08-27 decision narrows definition events reaching a guest to *"the workflows and ticket types actually used by tickets that guest can see."* T11's implementation does exactly that (`definitionsFor`, `definitionIsUsedByVisibleTicket` reading `proj_tickets.workflow_id` / `type_id`), but T11's filter-semantics bullet 5 and open question 4 both still say definition events *"go to everyone including guests"*, unqualified. Implementation governs; the two prose statements are stale.

**C8 — `proj_invites` is slotted by a coordination amendment that does not exist.** T14 registers `projInvites` "after `proj_memberships` per coordination §8 amendment." §8 lists eight projections and names no `proj_invites`, and no amendment anywhere in the coordination doc adds one. There is no authority for that slot. Nothing reads `proj_invites` during any other projection's `apply`, so appending at the end is the conservative choice — but it is a ruling Plan 4 must make and record, not cite.

**C9 — §5 still says the membership scope stays in the payload.** Reconciliation §5 closes with *"Scope stays in the payload; `proj_memberships` keys as Plan 4 designed"*, and T3's extract repeats it (`proj_memberships` keys on `(workspaceId, userId, scope)`). The 2026-08-27 collapse removed `MembershipScope` from the vocabulary and made a `scope` a **refusal**. §5's sentence is stale; only its `membershipId` half survives. The projection's four-column key stands on its own footing — `scope_kind` and `project_id` are now written by the project-roster events, not by a payload scope.

**C10 — the plan's registry API is not the shipped one.** T3 and T14 are written against `registerEventType({ type, version, entityKind, parsePayload })` with seven hand-written parsers throwing `Error`, and pin eighteen exact message strings as contract. `main` ships `domainRegistry.register({ type, version, entityKind, payloadSchema })` taking a **zod schema**, and every existing registration is a schema. Under the standing "import origins come from shipped code" law the shipped API governs, which puts the eighteen pinned messages — several of which carry real semantic content, notably the two scope-refusals (F2) and the ownership refusal (F7) — in need of a deliberate adaptation rather than a transcription.

**C11 — `entity.kind` has no `'invite'`.** T14 registers three event types with `entityKind: 'invite'` and switches on `env.entity.kind === 'invite'` in sync-down. `ENTITY_KINDS` in `packages/domain/src/envelope.ts` is the closed six-member set the Global Constraints pin, and `'invite'` is not in it — so `parseEvent` refuses all three types at the door. T14 must extend `envelope.ts`, **a file its Files list does not contain**, and the Global Constraints' entity-kind line changes with it.

**C12 — `ingestBatch` has no session argument, and the founding sequence needs a transaction it does not have.** T13 calls `deps.ingest.ingestBatch([founding], { sessionUserId })`; the shipped signature is `ingestBatch(rawEvents)` with no options object, and `checkPermission(db, env, sessionUserId)` needs that value. Separately, `commitOne` opens `BEGIN`…`COMMIT` **per event**, while the coordination doc requires the whole founding sequence inside one transaction (D3) and T14 requires acceptance's three-plus appends plus the token delete inside one. Both extensions are Plan 4's to make, additively alongside Plan 7's `IngestDeps.gates`.

**C13 — the projection contract's shape differs from what T4 and T6 declare.** `Projection` on `main` requires `tables: readonly string[]` and types `apply(event: LedgerEvent, tx: PoolClient)`. T4's `projMemberships` and T6's `projVisibility` declare `{ name, apply, reset }` with no `tables` and type the parameters `(env: EventEnvelope, db: Queryable)`. There is no `registerProjection` export either — registration is `registry.register(...)` inside `buildProjectionRegistry()`. T9's `projProjects` and T14's `projInvites` already declare `tables`, so the plan is inconsistent with itself as well as with the code.

---

## 3. Rulings this lane owes the coordination doc

Under protocol ruling 3 each of these takes the conservative option, is recorded in the coordination doc **in the same change set as the task that hits it**, and push-notifies the owner. Listed so no lane rediscovers them.

1. **The replay-order hazard (G5, T4+T6).** Rebuild-stability of `proj_memberships`' cross-entity delete and `proj_visibility`'s parent-before-child assumption under canonical `(entity_kind, entity_id, seq)` replay. Conservative reading: the projections must be made order-independent (resolve on read, or re-resolve defensively), not the replay order changed. This is also the moment determinism test 3 goes live and must be re-read rather than assumed green.
2. **The `pg_locks` lock-order test (G3, T5).** Plan 4 is the second both-lock production path; the test becomes falsifiable here and is owed here.
3. **`projInvites`' registration slot (C8, T14).** No §8 authority exists. Conservative: append at the end of the order and record the amendment §8 is missing.
4. **`projInvites.reset` (G6, T14).** A `DELETE`-based reset takes a weaker lock than `TRUNCATE` and breaks the second leg of Plan 2's entity↔workspace-door argument. Conservative: keep `TRUNCATE proj_invites` and leave `invite_tokens` untouched, or re-derive the contract explicitly.
5. **The invite 404 body (F19, T14).** Specified nowhere. Conservative: reuse the existing `{ error: 'not_found' }` so unknown, revoked and spent stay indistinguishable from a nonexistent route target.
6. **`workspace.renamed` and `workspaceNameFromLedger` (C3).** Who owns the type, and where the helper lives — it is called by two tasks and created by none.
7. **`getEntityState('membership', …)` (G9).** Nobody makes membership entity state honest, and the failure mode is a silently closed role gate with a legitimate-reading refusal.

## 4. Minor notes (not coordination contradictions)

Recorded so the adaptation map does not spend time on them: the extracts flag internal test-count drift in Plan 4's own text — T3's membership suite states 13 where 14 `it` blocks are written, T7's `can-see` states 7 where 8 are written, T7's `visible-tickets` states "1 test" where 2 exist, and T12's test-cases header says 6.1–6.20 over a list running to 6.22. Resolve each by literal count. Also: `buildApp(deps, options)` on `main` returns a `FastifyInstance` synchronously, while Plan 4's tests `await buildApp({ pool })` and destructure `{ app }`; and T2's HTTP 401 `{ error: 'unauthenticated' }` is deliberately not the `{refused, rule, reason}` shape — the auth layer's 401 is not a ledger refusal.
