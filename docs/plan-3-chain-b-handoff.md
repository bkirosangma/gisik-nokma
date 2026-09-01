# Plan 3 handoff — Chain A shipped, Chain B outstanding

**Written at Wave 1's fold-back into serial execution, 2026-08-31.** Lane 1's execution workspace
(`.superpowers/sdd/…`) is gitignored by a `*` rule the SDD skill creates, so the conflict table, the
task riders and the per-task reports **do not survive the worktree**. This file is the durable
extract: what a serial resumer needs to finish Plan 3 that is not already in the code, the commit
messages, or the coordination doc.

Branch: **`exec/03-tickets-hierarchy`**, pushed, head `11f1fb3`, 19 commits off `main`.

## What shipped (Chain A — Tasks 3–8, all reviewed clean)

| Task | What it produced |
|---|---|
| T3 | `applyTicketEvent` + `foldTicketToWorkflowVersion` in `@gisik-nokma/domain`; the monotone fold guard |
| T4 | `buildMemoryContext` — a reducer-backed in-memory `EngineContext`; the fourth context method |
| T4b | `require-different-user` fails **closed** and reads the log in ascending `seq` |
| T5 | `checkTicketCreated` — hierarchy, rank, deepest-rank, cross-project, preconditions |
| T6 | `checkTicketReparented`, `checkTicketWorkflowRebound`, `checkTicketTypeDefined` (built-in rank lock) |
| T7 | `checkTicketFieldSet`; closed the `z.unknown()` presence hole in `ticketFieldSetPayload` |
| T7b | Batched corrections: whitespace-title refusal, `malformedPayloadDetail` across seven sites |
| T8 | Fourteen end-to-end fixtures; the fixture-harness presence audit; gate 70 → **84** |

Fixture gate: **84**, matching the directory. Full gate: **18/18 turbo tasks green**.

**Outstanding on Chain A:** Task 8's task review had not returned when the lane wound down, and its
conclusions need one caveat — see "Contamination window" below. Chain A's PR was not opened.

## Chain B — Tasks 9–13, then T14. **Tasks 9, 10, 11 and 12 have landed; 13 and T14 are outstanding.**

Task 9 shipped `proj_ticket_types`, Task 10 `proj_tickets`, Task 11 `proj_rollups` — all three registered at their
coordination §8 positions (3, 5 and 6), with both order pins extended each time. **Task 12 shipped the server
`EngineContext` over all three**, closing rulings P14 and P9 and inverting the two assertions that pinned the
opposite. The heading above said "None
started" through the first two of those, which is the shape of stale-absolute this lane keeps producing; it is
corrected here rather than left for a resumer to disbelieve.

Needs Postgres 16 on **54329** (compose from the main checkout; `createTestDatabase` mints a database
per test file, so lanes cannot collide).

### Rulings that bind Chain B (made during Chain A; the reasoning is in the coordination doc)

- **P14 — BLOCKING on T12, and it is a tenancy hole that ADMITS a write.** `ctx.getWorkflowDef(p.toWorkflowId)`
  in `checks/workflow-rebind.ts` resolves an **actor-supplied** workflow id with no workspace predicate
  anywhere on the server path: `proj_workflows`' PK is `(workflow_id, version)` (global), the projection
  reader has no tenancy filter in any of its three selector branches, and the engine context passes
  through. A foreign workflow id resolves, the target-state check runs against **another workspace's
  state graph**, and the event is accepted. **Latent only because `getEntityState('ticket')` returns null
  on the server today — it goes live in the same commit T12 lands.** Ruled fail-closed; the design is
  T12's; no unit test can pin it (`buildMemoryContext` has no workspace notion for workflows), so the
  test home is T12's `engine-context` suite. The class extends to `getTicketTypeDef(ctx, p.typeId)` on
  the create path once T12 backs it with `proj_ticket_types`.
- **T12 total-outage trap, converging on the same commit.** `rowToTicketState` **must** populate
  `workspaceId`. The guard P12 added is `parent.workspaceId !== env.workspaceId`, and
  `undefined !== env.workspaceId` is always true — a missing field refuses **every parented
  `ticket.created` on the server**, presenting as a data problem rather than a mapping bug. It must also
  repopulate `kind: 'ticket'`, which no DB column carries.
- **P1 — `TicketStateDeps.getWorkflow(workflowId)` is a pure by-id lookup.** T10's `loadDeps` must serve
  **any** id asked for: `toWorkflowId` off a `ticket.workflow_rebound` payload, `current.workflowId`
  otherwise. A T3 test fails on caller-side pre-selection.
- **P4 — projection `reset()` is `TRUNCATE`**, matching both shipped projections. `DELETE` takes a weaker
  lock and would make Plan 3 the owner of re-deriving the entity↔workspace tenancy contract.
- **P7 — T13 adds a `pool: Pool` field to `AppDeps`**, leaving `db: HealthDb` untouched. There is no
  `server.ts`; the factory is `buildApp(deps)` in `app.ts`, and routes register as plain functions.
- **P9 — `getEntityState` parity on identity-only kinds is deferred to T12**, which must align all three
  `EngineContext` implementations in one change set.
- **P6 — count, never compute.** Preconditions before any count: tree clean **and** no rebase/merge in
  flight. Three stale absolutes were caught during Chain A, every one supplied by the controller and
  corrected by an implementer who counted.

### Adaptations binding Chain B (shipped code differs from the plan text)

- **`registerProjection`, `applyEvent(db, env)` and `resetProjections(db)` do not exist.** The only export
  is `buildProjectionRegistry()`; register by appending `registry.register(<x>Projection)`. Drive tests
  through `createIngestService(...).ingestBatch`, direct `projection.apply(ledgerEvent, client)`, or
  `rebuildProjection`.
- **`getWorkflowDefAsOf` does not exist.** One function: `getWorkflowDefFromProjection(db, workflowId,
  select?: number | { asOfWorkspaceSeq: number })` — **no `workspaceId` parameter**. `proj_tickets`
  resolves as of the applying event: `{ asOfWorkspaceSeq: event.workspaceSeq }`.
- **The `Projection` type requires `tables: readonly string[]`**; `apply`'s first parameter is
  `LedgerEvent`, second `PoolClient`. Projection table/column names must be **unqualified and
  lowercase**, and no column may be `json` (the verifier's `EXCEPT` needs an equality operator).
- **Migrations are raw `.sql`** with `-- Up Migration` / `-- Down Migration`, timestamps strictly greater
  than `1787896601515`.
- **The test DB helper is `createTestDatabase()`** returning `{ pool, url, drop() }` — one fresh database
  per file. There is no `testPool`, no `wipe`, no `TEST_DATABASE_URL`; the env var is
  `TEST_DATABASE_ADMIN_URL`, defaulting to port **54329**.
- **`apps/server/src/engine-context.ts` and its test already exist.** T12 **edits** them, keeping
  `createEngineContext(client: PoolClient)` — do **not** add `workspaceId`, do not create a second
  factory, do not touch `ingest-service`. Two shipped assertions pin the *opposite* of T12's deliverable
  and must be inverted; the `PLAN 3 TASK 12` seam comments retire in the same change. **Its brief
  instructs ruling P3's REJECTED alternative at three lines — `getEntityState('ticket-type')` must keep
  answering identity-only; the definition arrives via `getTicketTypeDef`.**
- **`projections/index.ts` order** is coordination §8's; whichever lane merges second writes the full
  order and extends `test/projection-order.test.ts` in the same commit.
- **Plan 4 owns the project-existence refusal.** Plan 3's precondition list carries a cross-reference so
  it does not read as complete.

### Method rules earned during Chain A (all cost real defects to learn)

- **A survivor with no explanation is either an unconstrained path or a mutation that never ran** — and
  those must be distinguished before either is reported. Two instances found: a cross-package mutation
  read stale `dist`, and a mutation script replaced the *first* of two identical anchors.
- **Cross-package mutation needs `pnpm turbo run test` or an explicit rebuild.** The exposed surface is a
  **value** import by package name (`import type` is erased). Server tests carry **15** such imports.
- **Verify mutation restorations with `git diff` or by reading the file — never a shell `diff`.**
- **"Tree clean" is a racing check while a mutation review runs.**
- **Count fixtures/case-ids from the artifact, never from a tracker.**
- **Rulings go in the coordination doc in the same commit as the code.** This ledger being gitignored is
  precisely why.

### Catalogue state

`test-cases/05-tickets-hierarchy.md` holds 5.1–5.3, 5.26, 5.37–5.53. **5.4–5.36 are reserved for T14**,
and **5.27, 5.30 and 5.36 are cited by other documents and may not be renumbered.** Next free id is what
the file's own scope note says. **T14 must fold 5.43 into the corrected 5.34** rather than catalogue
both. The plan's canonical refusal table is **six ids behind** what shipped.


## Task 12's outcome, and what it left for others (2026-09-01)

### Rulings discharged

- **P14 — CLOSED, on the reader, in both places.** `EngineContext.getWorkflowDef` and `getTicketTypeDef` take a
  `TenantScope` (`{ workspaceId }` — an object, so a transposition with the ULID-shaped id beside it does not
  compile) and every check passes `env`. `getWorkflowDefFromProjection` gained `workspaceId` as its second
  parameter, matching the three reader neighbours already spelled `(db, workspaceId, id)`. Test home:
  `apps/server/test/engine-context.test.ts`, cases 5.65 and 5.66, each with the control that keeps it about
  tenancy. **Where tenancy comes from, and why an actor cannot choose it:** `env.workspaceId` is gated twice
  before the engine — the permission gate resolves the SESSION user's effective role in it and refuses a
  non-member (`permissions/check-permission.ts`), and ingest's entity-to-workspace guard refuses an event about
  an entity homed elsewhere. **Neither closes P14**, and that is the point: an admin of their own workspace
  passes both and then names another workspace's workflow id. The predicate on the reader is the only thing
  that refuses that.
- **P9 — DISCHARGED, and the divergences are stated per kind rather than smoothed over.** All four
  implementations moved in one change set: the server's, `fixtures/harness.ts`, `memory-context.ts`, and
  `contextFromCache` (`packages/app-core/src/precheck.ts`), which the previous attempt missed entirely.
  - `getEntityState('ticket')` — real in all four (cache-backed in `contextFromCache`). ALIGNED.
  - `getEntityState('membership')` — server null (Plan 4 owes the wiring, ruling P18), harness real from its
    fixture roster, memory-context null, precheck null. The harness is where restrict-to's 61 fixtures live;
    the server's null is what makes `restrict-to` refuse on the server path today.
  - `getEntityState` on the four identity-only kinds — the server answers `{kind,id}` from a head row;
    `memory-context` answers only for `'ticket-type'`, from its own inventory; the harness answers none;
    `contextFromCache` answers none. **They are not the same predicate and were deliberately not aligned onto
    the server's**: the server's is "an entity with this id has committed events ANYWHERE", because
    `proj_entity_heads`' key is `(entity_kind, entity_id)` — global — while the in-memory ones would be "this
    workspace defined it", which is the stronger and more honest claim. Aligning downward would have been
    aligning onto the weaker one. Latent rather than live: no check in the engine reads existence for
    `workspace`, `project`, `workflow` or `ticket-type`.
  - `getTicketTypeDef` — four different behaviours, on purpose: the server scoped and null for a type this
    workspace never defined; the harness and `memory-context` by key, each holding one workspace's world;
    `contextFromCache` THROWS, because `null` there would manufacture a refusal out of "I do not hold it".
  - `getChildrenStates` — real in all four, direct children only.
- **P3 — held against the plan text.** `getEntityState('ticket-type')` stays identity-only. The plan's Task 12
  brief instructs the rejected alternative at lines 4552, 4621 and 4680 (`return getTicketTypeFromDb(db,
  workspaceId, id)` from `getEntityState`); it was not followed, and no `TicketTypeState` was grown.
- **The T12 total-outage trap — CONFIRMED, not assumed.** `rowToTicketState` populates both `workspaceId` and
  `kind: 'ticket'`; Task 10 landed both with the argument beside them, and case 5.18 now names the two fields
  in an assertion rather than checking non-null.

### One contradiction this server now carries, recorded because it cannot be closed here

`getEntityState('ticket-type', 'task')` answers `{kind, id}` off a GLOBAL head row while
`getTicketTypeDef(env, 'task')` — scoped — answers null for the same id in the same evaluation. Two doors,
opposite claims. Closing it needs a scope on `getEntityState`, and adding one is what would make ruling P12's
parent guard a branch no input can take. **Owner: whoever gives `proj_entity_heads` a per-tenant key.** Latent
today, for the reason in the P9 entry above.

### RECORDED, not fixed — six source comments in Plan 4's lane that name Task 12 and are false

Task 12 did not edit them, following Task 10's and Task 11's precedent for another plan's files. Every one says
some form of "`proj_tickets` does not exist on this branch (Plan 3 Task 12 owns it)". Two things are wrong with
that sentence and have been since Task 10: the table is **Task 10's**, and it **exists**. Whoever owns these
read paths corrects them:

| File | What it says |
|---|---|
| `apps/server/src/visibility/visible-tickets.ts` (~12) | "**`proj_tickets` does not exist on this branch** — Plan 3 Task 12 owns it" |
| `apps/server/src/visibility/visible-events-for.ts` (~480, ~486) | "does not exist here (Plan 3 Task 12 owns it)"; "*Owner: Plan 3 Task 12 (`proj_tickets`), case 6.94*" |
| `apps/server/src/visibility/rollup.ts` (~53) | "`proj_rollups`, Task 12 owns `proj_tickets`), and no migration for either is …" — both tables exist and both have migrations |
| `apps/server/src/permissions/check-permission.ts` (~626) | "…does not exist on this branch (Plan 3 Task 12 owns it)" |
| `apps/server/src/routes/tickets.ts` (~25, ~41) | "**`proj_tickets` does not exist on this branch.** Plan 3 Task 12 owns it"; "case 6.66, owner Plan 3 Task 12" |
| `apps/server/test/routes/tickets-read.test.ts` (~27), `apps/server/test/helpers/seed.ts` (~213) | the same sentence in two test files |

This is item 3 and item 4 of the section below, widened: those two recorded `Features.md` §6 and
`visibility/rollup.ts` alone, and the same sentence turns out to be in five more places.

### RECORDED, not fixed — case 6.25 went stale in Plan 4's catalogue

`apps/server/test/routes/workspaces.test.ts` said a founded workspace "still cannot hold a ticket on this
branch", naming this exact wiring as the reason. Task 12 **inverted that assertion**, because a test that fails
cannot be left standing and the file itself listed the condition under which it flips. The reserved text of
**case 6.25 — "a founded workspace accepts a ticket immediately" — is now the true one**, and whatever
`test-cases/06-*.md` says about it was written against the refusal. **Owner: Plan 4.** Task 12 did not edit
§6 or its catalogue file.

## RECORDED, not fixed — carried out of Task 10's floor-list fix round and Task 11 (2026-09-01)

Four items. Items 1–3 came out of Task 10 and none is fixable inside its surface; each was previously
recorded only in a commit message or a code comment, which is the shape Finding 4 of that review was
about. Item 4 came out of Task 11, which also UPDATED item 3 rather than leaving a recorded finding that
had itself gone stale.

### 1. The ticket-TYPE ladder is not as-of. Open question 11. Owner: **UNASSIGNED, deliberately.**

`proj_tickets`' `loadDeps` resolves the WORKFLOW as of the applying event's `workspace_seq`
(`getWorkflowDefsInForce`) and the ticket TYPE as of **now** (`getTicketTypeLadderFromDb`, which takes
no sequence number). So the table is a pure function of the ledger prefix for workflow versioning, and
for type binding **only until somebody re-points a ticket type at another workflow**: after that,
replaying the `ticket.created` resolves the NEW `workflowId` for a ticket the live path bound to the
old one. That is live-versus-rebuild divergence — the class that has bitten three projections in this
series — and it contradicts the owner's own 2026-08-26 decision that a re-binding affects new tickets
only.

The fix is not symmetric with the workflow one. `proj_workflows` keeps every version keyed
`(workflow_id, version)`, so as-of is a `WHERE` clause; `proj_ticket_types` is last-definition-wins
with **one row per type** and no history at all, so as-of needs a primary-key change, and
`getTicketTypeFromDb` has readers in Task 12's engine context and in Plans 4–5. Plan 3's own Open
question 11 scoped it out on exactly that reasoning.

**UNASSIGNED with a reason, following the 6.130 precedent:** no plan in the series has an open task on
that table's key. Parking it on Plan 4 or Plan 10 would be a handoff nobody receives. Whoever opens the
type-versioning work takes it.

The claim is now narrowed everywhere it was overstated — `apps/server/src/projections/tickets.ts`
(header point 1 and `loadDeps`' closing docstring), `Features.md` §5's `proj_tickets` bullet, and a NOTE
beside the two live-path cases in `apps/server/test/proj-tickets.test.ts`. **It is not asserted by a
test**: the only rebuild case in that file is also the only one that may write to `events` (a second
writer would replay through the first, and that case's own length assertion is what guards it).

### 2. Nothing refuses an assignment of nothing to somebody. Owner: **the controller to assign.**

`evaluateEvent` has no case for `ticket.assigned`, `ticket.collaborator_added`,
`ticket.collaborator_removed`, `comment.added` or `attachment.added`, so all five fall through to
`{ refused: false }` with **no existence check**, and the server commits them against a ticket that was
never created — `apps/server/test/permissions/check-role-permission.test.ts` ingests two such
`ticket.assigned` events and both are committed, not refused. Registering `proj_tickets` made that
latent gap live: folding one would throw inside the ingest transaction, so `proj_tickets` skips those
five **by name** when the ticket is absent, while the four types the door DOES guard keep the reducer's
throw. Case **5.58** constrains that set in both directions now — the five skip and write no row, the
four throw, and all five still fold against a ticket that exists.

The projection's skip is a containment, not a fix. When the refusal lands, the set becomes unreachable
rather than wrong and the two lines can go. **No plan document owns this refusal**, which is why it is
here rather than parked.

### 3. `Features.md` §6 is Plan 4's and now carries three false sentences. Owner: **Plan 4.**

Task 10 correctly did not touch another plan's section. Three of its sentences stopped being true when
`proj_tickets` landed, and **Task 11 made the last of them false in its second half too** — this entry is
updated rather than left standing, because a recorded finding that has itself gone stale is the same defect
one level up:

| Where | What it says | Why it is false |
|---|---|---|
| §6 preamble | "no ticket titles exist to serve, because `proj_tickets` is Plan 3 Task 12's" | The table is **Task 10's** and it shipped; titles are queryable |
| `listVisibleTickets` bullet | "**`proj_tickets` does not exist on this branch**" | It does |
| Rollup-honesty bullet | "neither table exists on this branch (Plan 3 Tasks 11 and 12)" | **Both now exist**: `proj_tickets` shipped with Task 10, `proj_rollups` with Task 11 |

Whoever merges Chain B into a branch carrying §6 must correct all three in the same change set, or §6
will read as evidence that the tables are missing.

### 4. The same sentence in Plan 4's SOURCE, not just its section. Owner: **Plan 4.**

`apps/server/src/visibility/rollup.ts` (the docblock above `RollupView`, around line 52) says
**"Neither table exists on this branch"** of `proj_tickets` and `proj_rollups`. That was half false after
Task 10 and is now wholly false. Task 11 did not edit it, following Task 10's precedent for another plan's
file — the correction belongs with whoever owns that read path, because it lands in the same docblock as
the design decision it explains, and a drive-by edit would conflict with Plan 4's own lane.

The same docblock names two open cases whose OWNER IS WRITTEN AS "Plan 3 Task 11" and whose work is not in
Task 11's file list, so neither is done and neither is Task 11's to do:

- **6.82** — `RollupView` ships with `total` and `restrictedCount` only; `open` / `active` / `terminal` are
  deliberately absent from the type rather than zeroed, "so the compiler demands a decision at every
  construction site the day Plan 3 Task 11 lands". Task 11 landed the table. Nothing wires it, and Task 11's
  brief creates the migration, the projection, the registration and the test — nothing under
  `src/visibility/`.
- **6.83** — whether `proj_visibility`'s notion of "children" equals `proj_tickets`', which the docblock
  says "must be measured rather than assumed" before `RollupView.total` is served from `proj_rollups.total_children`.
  Still unmeasured.

Both are Plan 4's read path. Recorded here because the docblock points at a task that has now finished
without them.

## Contamination window (affects Task 8's review only)

This worktree was checked out to another branch for 26 seconds (13:24:42–13:25:08 on 2026-08-31) by a
sibling controller while T8's reviewer was running. State was verified restored afterwards. The
reviewer's activity after 13:25:26 is provably against the correct tree; what it read **during** the
window is unknown. **Whoever resumes should re-verify T8's file-based findings** rather than treating
that review as clean — or simply re-run it.
