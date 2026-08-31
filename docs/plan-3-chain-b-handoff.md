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

## Chain B — Tasks 9–13, then T14. None started.

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

## Contamination window (affects Task 8's review only)

This worktree was checked out to another branch for 26 seconds (13:24:42–13:25:08 on 2026-08-31) by a
sibling controller while T8's reviewer was running. State was verified restored afterwards. The
reviewer's activity after 13:25:26 is provably against the correct tree; what it read **during** the
window is unknown. **Whoever resumes should re-verify T8's file-based findings** rather than treating
that review as clean — or simply re-run it.
