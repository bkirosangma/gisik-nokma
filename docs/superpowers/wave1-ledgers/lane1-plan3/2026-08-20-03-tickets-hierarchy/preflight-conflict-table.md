# Plan 3 pre-flight conflict table

Produced by the mandatory pre-flight fan-out (coordination doc, "Ultracode usage policy": task
extractors + repo-verified adaptation map + coordination-obligation lens → this table) before the
first task dispatches. Branch `exec/03-tickets-hierarchy` at `f363b2f`; Tasks 1–2 and the §9 rider
landed on `main` as the keystone (`b0fda11`, `3aec0a0`, `bd9e022`, `f363b2f`).

**This document is BINDING over the task briefs.** Where a brief and this table disagree, this
table wins, and the implementer records the deviation in its report. Every row cites shipped code
at `file:line`; plan text is never the authority for an identifier, an import origin or a path
(coordination doc, parallel-execution discipline: "import origins come from shipped code, never
plan text — standing law, now load-bearing across lanes").

**Scope note.** Task 4b has no brief-extraction because it did not exist when the extractors ran:
it was created by the controller's pre-flight rulings R1–R4 (`progress.md`) to hold the RDU
decision the coordination doc assigned Plan 3 and no task owned. Its rows below are sourced from
`.superpowers/sdd/2026-08-20-03-tickets-hierarchy/task-4b-brief.md`.

---

## Adaptation map (BINDING over the briefs)

| # | Tasks | Plan says | Repo has | Evidence | Instruction implementers follow |
|---|---|---|---|---|---|
| A1 | 3, 4, 5, 6, 7 | Tests live beside sources in `src/`, run as `vitest run src/<name>.test.ts` | All three vitest configs collect ONLY `test/**/*.test.ts`; every shipped test is under `test/` | `packages/domain/vitest.config.ts:5`; `packages/rule-engine/vitest.config.ts:5`; `apps/server/vitest.config.ts:5`; root `package.json:9` `"test": "turbo run test"` | Put every new test under the package's `test/` directory. Import the code under test relatively with the ESM `.js` suffix (`../src/ticket-state.js`). A `.test.ts` under `src/` is silently never collected by plain `vitest run` — the brief's explicit-path command hides this locally while CI never runs the file. |
| A2 | 9, 10, 11, 12, 13 | `pnpm --filter server exec …`, `pnpm --filter server verify-projections` | Package is `@gisik-nokma/server`; scripts are `migrate` and `verify:projections`; the CLI reads `DATABASE_URL` via `loadConfig` | `apps/server/package.json:2,11,12`; `apps/server/src/config.ts:4` | Spell every command `pnpm --filter @gisik-nokma/server exec vitest run test/<file>.test.ts`. Never invoke the verify CLI from a test — per-file random databases mean its `DATABASE_URL` points elsewhere; import and call `verifyProjections({ pool, projections })` (`apps/server/src/tools/verify-projections.ts:36`) against the test pool. |
| A3 | 9, 10, 11 | node-pg-migrate `.js` migrations using the `pgm` builder, timestamps `17556…` | Every shipped migration is raw `.sql` with `-- Up Migration` / `-- Down Migration`; shipped timestamps are `1787841717635`, `1787847393435`, `1787896601515` — all LARGER than the briefs' | `apps/server/migrations/1787896601515_proj-workflows.sql:1,23`; `apps/server/test/helpers/db.ts:40-46` (`runner({ dir: MIGRATIONS_DIR, … })`) | Write the three migrations as `.sql` with both sections, mirroring `1787896601515_proj-workflows.sql`, with timestamps strictly greater than `1787896601515` in ascending order (e.g. `1787900000000_proj-ticket-types.sql`, `1787900100000_proj-tickets.sql`, `1787900200000_proj-rollups.sql`). Follow shipped conventions: lowercase unqualified names, `COMMENT ON TABLE/COLUMN`, explicit `CREATE INDEX <table>_<cols>_idx`, `jsonb` only (never `json` — the verifier's diff needs an equality operator, `registry.ts:20-21`). |
| A4 | 9, 10, 11, 12, 13 | `projections/index.ts` exports `registerProjection`, `applyEvent(db, env)`, `resetProjections(db)` | It exports exactly one function, `buildProjectionRegistry()`, calling `registry.register(...)`. None of the three named symbols exists anywhere in the repo | `apps/server/src/projections/index.ts` (whole file, 14–19); `apps/server/src/projections/registry.ts:51-73`; `apps/server/src/ingest/ingest-service.ts:127-129` | Register by appending `registry.register(<x>Projection);` inside `buildProjectionRegistry()`. Extend `apps/server/test/projection-order.test.ts:24-27` in the SAME commit (see O-registration-order). In tests drive events through `createIngestService(...).ingestBatch(...)` or by calling `projection.apply(ledgerEvent, client)` / `projection.reset(client)` directly (`apps/server/test/proj-workflows.test.ts` is the shipped pattern), and use `rebuildProjection(name, { pool, projections })` (`apps/server/src/projections/rebuild.ts:12`) for the projection-outer rebuild-and-diff. |
| A5 | 9, 10, 11 | A projection is `{ name, apply(env, db), reset(db) }` | The `Projection` type additionally REQUIRES `tables: readonly string[]`; the verifier iterates it to build shadow copies | `apps/server/src/projections/registry.ts:44-49`; `apps/server/src/tools/verify-projections.ts:45-48` | Give every new projection a `tables` array (`['proj_ticket_types']`, `['proj_tickets']`, `['proj_rollups']`). Type `apply`'s first parameter `LedgerEvent` (from `@gisik-nokma/domain`, post-hoist) and the second `PoolClient`. `reset(tx)` clears exactly the listed tables. |
| A6 | 9, 10, 11, 12, 13 | `test/helpers/db.ts` exports `testPool()` / `wipe(db)`, `TEST_DATABASE_URL` defaulting to `postgres://postgres:postgres@localhost:5432/gisik_nokma_test`; Task 9 creates the helper if absent | The helper exists and exports `createTestDatabase(): Promise<{ pool, url, drop() }>` — a uniquely named database per test FILE, timezone `Asia/Kolkata`, migrations run, pool from `createPool`. Env var is `TEST_DATABASE_ADMIN_URL`, default `postgres://gisik:gisik@localhost:54329/postgres` | `apps/server/test/helpers/db.ts:9-10,31-59`; `apps/server/src/db.ts:8`; `apps/server/test/proj-workflows.test.ts:11-18` | Do NOT create the helper. Use `let db: TestDatabase; beforeAll(… createTestDatabase()); afterAll(… db.drop());` and `db.pool`. There is nothing to wipe — isolation is a fresh database per file. Never reference `TEST_DATABASE_URL`; `docker-compose.yml` stands up 54329, not 5432. |
| A7 | 4, 5, 6, 7, 12 | `EngineContext` from `src/engine-context.ts` or `../types`; verdict type `EngineVerdict` from `evaluate.ts` | `EngineContext`, `Accept`, `Refusal`, `Verdict` all live in `packages/rule-engine/src/engine.ts`. No `engine-context.ts`, no `../types`, no `EngineVerdict` anywhere. `evaluate.ts` exports only `evaluateEvent`, returning `Promise<Accept \| Refusal>` | `packages/rule-engine/src/engine.ts:3-11`; `packages/rule-engine/src/evaluate.ts:12`; `packages/rule-engine/src/index.ts:5` | Inside the package: `import type { Accept, EngineContext, Refusal } from '../engine.js';` (from `src/checks/*`) or `'./engine.js'` (from `src/*`). Read every `EngineVerdict` as `Accept \| Refusal` (or the alias `Verdict`, `engine.ts:5`), every `../types` / `./engine-context` as `../engine.js`. From `apps/server`: `import type { EngineContext } from '@gisik-nokma/rule-engine';`. Read Task 6's `./shared` as Task 5's two real modules: `./refusals.js` and `./context-helpers.js`. |
| A8 | 5, 6, 7 | `getTicketState` / `getTicketTypeDef` are thin wrappers over `ctx.getEntityState('ticket'\|'ticket-type', id)` | `getEntityState` returns `EntityState \| null`, a union keyed on `kind`. `'ticket-type'` is an `OtherEntityState` — literally `{ kind, id }`, no rank/name/workflowId/fields — and the shipped server context returns exactly that | `packages/rule-engine/src/engine.ts:8`; `packages/domain/src/entity-state.ts:49-53`; `apps/server/src/engine-context.ts:15-20,64-68` | `getTicketState` narrows: `const s = await ctx.getEntityState('ticket', id); return s !== null && s.kind === 'ticket' ? s : null;` — the pattern at `packages/rule-engine/src/transition.ts:41-42`. For ticket TYPES the shipped `EngineContext` cannot serve a `TicketTypeDef` at all — see **BA-4** and **ruling 3**; the widening must be ruled before Task 4 dispatches. |
| A9 | 3, 10 | `foldStateIdForward(stateId, fromVersion, target, getVersion)` with `getVersion: (v) => WorkflowDef \| undefined`, imported from `'@gisik-nokma/domain'` inside `packages/domain`; `WorkflowDef` carries `stateMapping` (fixtures cast `as unknown as WorkflowDef`) | Signature is `(stateId, fromVersion, latest: WorkflowDef, intermediate: (version: number) => WorkflowDef \| null): FoldedState` in `packages/domain/src/workflow.ts`. The callback returns `null`. `workflowDefSchema` has NO `stateMapping`; it lives on `workflowDefinedPayloadSchema` / alias `PublishedWorkflowDef`, with `hasStateMapping(def)` as the shipped type guard | `packages/domain/src/workflow.ts:109-128,84,41-49,68-74,77-82` | In `ticket-state.ts` import RELATIVELY: `import { foldStateIdForward, type FoldedState, type PublishedWorkflowDef, type WorkflowDef } from './workflow.js';` — never `'@gisik-nokma/domain'` (a package self-import; the exports map points at `dist/`). Declare `getVersion: (version: number) => WorkflowDef \| null` and pass it through, or adapt at the call site with `?? null`. Drop every `as unknown as WorkflowDef` cast: type fixtures and projection definitions as `PublishedWorkflowDef` and narrow with `hasStateMapping`. |
| A10 | 3, 4, 5, 6, 8, 10, 11, 12, 13 | `ticketTransitionedPayload` lives in `events/ticket-events.ts`; a `ticket.transitioned` payload is `{ toStateId }` | There is NO `ticketTransitionedPayload` in `events/ticket-events.ts` — the file says so explicitly. The schema is `ticketTransitionedPayloadSchema` in `workflow.ts`, field `to`, with optional `comment: { text }`, `evidenceAttachmentId`, `cause: { kind: 'reopened-for-child', childTicketId }`. The transition LOG ENTRY separately and correctly spells `toStateId` | `packages/domain/src/events/ticket-events.ts:11-14`; `packages/domain/src/workflow.ts:137-145`; `packages/domain/src/entity-state.ts:38`; `packages/rule-engine/src/fixtures/harness.ts:251-257` | Import `ticketTransitionedPayloadSchema` from `'./workflow.js'` (or the package root outside `packages/domain`). Read the destination as `payload.to`. Every JSON fixture's `ticket.transitioned` payload uses `"to"`. When appending to `TicketState.transitions`, spell the entry field `toStateId` and also record `actorId`, `seq`, `workflowId`, `workflowVersion`. Both spellings are real; do NOT unify them, and do NOT "correct" the shipped schema (coordination doc forbids it — O-transitioned-payload). NOTE the asymmetry: `ticket.workflow_rebound`'s payload genuinely IS `{ toWorkflowId, toStateId }` (`events/ticket-events.ts:97-100`). |
| A11 | 10, 11, 12, 14 | `getWorkflowDef(db, workspaceId, workflowId, version)` and `getWorkflowDefAsOf(db, workspaceId, workflowId, asOfWorkspaceSeq)` | One function, `getWorkflowDefFromProjection(db, workflowId, select?: number \| { asOfWorkspaceSeq: number })`. No `workspaceId` parameter at all (proj_workflows is keyed on `(workflow_id, version)`); a union deliberately, so "version 3" and "as of position 3" cannot be blurred. Returns `PublishedWorkflowDef \| null` | `apps/server/src/projections/workflows.ts:56-72,74-108`; `apps/server/migrations/1787896601515_proj-workflows.sql:11,21` | Replace `getWorkflowDef(db, ws, id, v)` with `getWorkflowDefFromProjection(db, id, v)` and `getWorkflowDefAsOf(db, ws, id, seq)` with `getWorkflowDefFromProjection(db, id, { asOfWorkspaceSeq: seq })`. Drop `workspaceId` everywhere. In `proj_tickets.apply`, resolve as of the applying event: `{ asOfWorkspaceSeq: event.workspaceSeq }`. Task 14's Open question 9 is ALREADY ANSWERED in shipped code, not pending; Features.md must not describe `getWorkflowDefAsOf` as a shipped symbol. |
| A12 | 12 | CREATE `apps/server/src/engine-context.ts` exporting `createEngineContext(db: Pool, workspaceId: string)`; CREATE `test/engine-context.test.ts` with 3 tests; `src/ingest.ts` holds a stub to replace | Both files ship on `main`. Source exports `createEngineContext(client: PoolClient)` — one argument, the ingest transaction's client — already wired at `ingest/ingest-service.ts:120` (there is no `ingest.ts` and no stub). The test file has four tests, two of which assert the OPPOSITE of Task 12's deliverable | `apps/server/src/engine-context.ts:38,64-68,70-81`; `apps/server/src/ingest/ingest-service.ts:120`; `apps/server/test/engine-context.test.ts:97-104,145-163` | EDIT both files in place. KEEP the `(client: PoolClient)` signature — do not add `workspaceId`, do not create a second factory, do not touch ingest-service. Add `'ticket'` (and `'ticket-type'`, if it gains a real body) branches BEFORE the identity-only branch, preserving the four identity-only kinds and leaving `'membership'` null until Plan 4. Replace `getChildrenStates`'s `return []` (line 80) with the real `proj_tickets` query. Because there is no `workspaceId`, the read helpers must be callable without one (look up by id, return the row's `workspace_id`) or read the workspace from `proj_entity_heads` first. REWRITE the two shipped assertions (`:97` null → real TicketState; `:145` `unknown-ticket` refusal → the now-resolvable outcome) and RETIRE the `PLAN 3 TASK 12` seam comments (`:9-20,:59-63,:74-78`) in the same change. |
| A13 | 13 | `buildServer({ db })` from `apps/server/src/server.ts`; register as a Fastify plugin `ticketHistoryRoutes(app, { db })` | There is no `server.ts`. The factory is `buildApp(deps: AppDeps, options?)` in `app.ts`, and `AppDeps.db` is `HealthDb = { query(sql: string): Promise<unknown> }` — one argument, no parameter array, healthcheck-only. Routes register as plain functions (`registerEventRoutes(app, ingest)`). A per-entity ledger read already exists | `apps/server/src/app.ts:6,19-22,24,58`; `apps/server/src/routes/events.ts:11`; `apps/server/src/ledger/event-store.ts:110-125,132-143` | Modify `app.ts`, not a non-existent `server.ts`. Register as `registerTicketHistoryRoutes(app, pool)`. Build the query on `readEntityEvents(pool, 'ticket', id, afterSeq)` — it already returns LedgerEvents with both clocks normalised to ISO-8601 `Z` via `rowToEnvelope`, which is the normalization the brief wanted, and it carries `workspaceSeq` (decide explicitly whether the response includes it). Widening `AppDeps` to carry a real `pg.Pool` is unscoped work the brief never priced — see **BA-5** and **ruling 7**. |
| A14 | 8 | Swap the `fixtures.test.ts` runner to `buildMemoryContext(fixture.workflowDefs, fixture.priorEvents)` and merge Plan 2's require-different-user transition-history layering | The runner already builds context with `buildInMemoryContext(fx)`, which needs the WHOLE fixture (`fx.memberships` for restrict-to's fixtures, `fx.workflowDefs` for latest/exact lookup). Its prior-event dialect is not the domain schemas: `ticket.created` is `{ workflowId, workflowVersion?, parentId?, assigneeId?, stateId?, stateCategory? }`, field_set uses `field` not `fieldId`, ids are non-ULID (`t1`, `ws_1`). It THROWS on prior-event types outside created/transitioned/workflow_rebound/assigned/field_set. 30 tests pin this, including the throw | `packages/rule-engine/test/fixtures.test.ts:13-15,19`; `packages/rule-engine/src/fixtures/harness.ts:137-155,157,168-183,224-225,301-305`; `packages/rule-engine/test/harness.test.ts:177` | Do NOT swap the runner. EXTEND `harness.ts`: (a) add `typeId`, `projectId`, `title` as OPTIONAL keys to `ticketCreatedFixturePayloadSchema` (`:137`), used in place of the `'prj_1'`/`'task'` defaults when present; (b) add `ticket-type.defined` and `ticket.reparented` cases to `applyPriorEvent` plus a `ticketTypes` map the widened context serves; (c) extend the throw's message at `:303`. Keep `fixtures.test.ts:19` unchanged and bump the count gate at `:14` in the same commit. Give new fixtures ULID-shaped ids wherever a domain schema parses them (`ticketCreatedPayload.projectId`/`parentId` are `ulidString`, `events/ticket-events.ts:18-19`). Assert `rule` only for the two parent-terminal fixtures — `fixtureSchema`'s rule-only branch exists for exactly this (`harness.ts:78-83`). |
| A15 | 4 | CREATE `memory-context.ts` — a first in-memory EngineContext for the fixture suite | An in-memory EngineContext already exists: `buildInMemoryContext(fx)` with tickets/memberships/version maps, direct-children filtering, exact-and-latest `getWorkflowDef`. What it lacks: the shared reducer (it hand-writes a switch), a ticketTypes map, `ticket-type.defined`, `ticket.reparented`, collaborator events, refold-on-`workflow.defined` | `packages/rule-engine/src/fixtures/harness.ts:157-199,201-306,191-197` | Build `memory-context.ts` as the reducer-backed context, stating explicitly that it is a SECOND context that does not replace `buildInMemoryContext` (61 fixtures + 30 harness tests keep the old one). Mirror `getChildrenStates` (direct children only) and `getWorkflowDef` (exact when a version is given, else latest) verbatim from `harness.ts:191-197` so the two contexts cannot disagree. Use the `WorkflowDef \| null` intermediate contract when refolding. |
| A16 | 7, 8 | A `ticket.field_set` payload is `{ fieldId, value }` throughout, fixtures included | The domain schema IS `{ fieldId, value }` — so any CANDIDATE field_set must use `fieldId`. But the harness's PRIOR-event parser uses `{ field, value }` and writes under `ticket.fields[payload.field]` | `packages/domain/src/events/ticket-events.ts:33`; `packages/rule-engine/src/fixtures/harness.ts:155,293` | Spell the CANDIDATE payload `fieldId` and any PRIOR field_set payload `field`. Renaming the harness key to `fieldId` (`harness.ts:155,293` + `test/harness.test.ts:50`) is permitted only as a deliberate, separately-called-out change — see **ruling 8**. |
| A17 | 3, 10 | The reducer produces a `TicketState` whose fields the briefs enumerate loosely; Task 3's header writes the type out inline "echoed for reference" | `TicketState` is already the authoritative merged shape and requires ALL of: `kind:'ticket'`, `id`, `workspaceId`, `projectId`, `typeId`, `parentId`, `workflowId`, `workflowVersion`, `stateId`, `stateCategory`, `assigneeId`, `collaboratorIds`, `fields`, `transitions`. `kind` and `workspaceId` are easy to omit and load-bearing | `packages/domain/src/entity-state.ts:24-39`; `packages/domain/src/index.ts:12` | Import `TicketState` and `FieldClaim` from `'./entity-state.js'` — never restate the type. On `ticket.created` fill every field including `kind: 'ticket'` and `workspaceId: env.workspaceId`, `collaboratorIds: []`, `fields: {}`, `transitions: []`. `proj_tickets` needs a `workspace_id` column, and `rowToTicketState` must repopulate `kind: 'ticket'`, which no DB column carries. `index.ts` needs only `export * from './ticket-state.js';` and `'./workflow-helpers.js'`. |
| A18 | 6 | `BUILTIN_TICKET_TYPE_SEEDS` entries are `{ id, rank, … }` | Present, but seeds carry ONLY `{ id, name, icon, rank }` — no `workflowId`, no `fields`. Full defs come from `builtinTicketTypeDefs(defaultWorkflowId)`. The array is `as const` | `packages/domain/src/ticket-types.ts:72-77,85-94` | Look the seed up with `BUILTIN_TICKET_TYPE_SEEDS.find(s => s.id === def.id)` and compare `def.rank !== seed.rank`. Never expect `workflowId`/`fields` on a seed; where a test needs a full built-in def, call `builtinTicketTypeDefs(WF.id)`. |
| A19 | 5, 6, 7 | Add `case 'ticket.created'` / `'ticket.reparented'` / `'ticket.field_set'` / `'ticket-type.defined'` / `'ticket.workflow_rebound'` to `evaluate.ts`'s switch | The switch exists with two cases and a pass-through default. Adding these is safe: the only fixture exercising the default has a `comment.added` candidate, and all 61 candidates are `workflow.defined` or `ticket.transitioned` | `packages/rule-engine/src/evaluate.ts:13-20`; `packages/rule-engine/fixtures/pass-through-accepts-unhandled-event-types.json` | Append the new cases, keeping `default: return { refused: false }`. No shipped fixture flips. Each new check ALSO carries its own `env.entity.kind` guard, matching the two-layer precedent at `transition.ts:11-28` (the fixture suite and Plan 10's replica enter at `evaluateEvent` and never pass `parseEvent`'s door). |

### Broken assumptions

Things a rename cannot fix — the brief's premise is false and the work must be reshaped.

| # | Tasks | Assumption | Reality | Evidence | Consequence |
|---|---|---|---|---|---|
| BA-1 | 9, 10, 11, 12, 13 | `projections/index.ts` exports `registerProjection`, `applyEvent(db, env)`, `resetProjections(db)`, and server tests drive projections through them | None of the three symbols exists anywhere in the repository. The only export is `buildProjectionRegistry()`; application is a loop over `registry.all()` inside the ingest transaction; rebuild is `rebuildProjection(name, { pool, projections })` | `apps/server/src/projections/index.ts` (whole file); `apps/server/src/projections/registry.ts:51-73`; `apps/server/src/ingest/ingest-service.ts:127-129` | Tasks 9–13 as written do not compile at all — every test body and every registration instruction names a non-existent function. Rewrite every server test per **A4** before writing code. |
| BA-2 | 10, 11, 12, 14 | `getWorkflowDefAsOf` and `getWorkflowDef` are two separate exports of `projections/workflows.ts` | Neither name exists. One function, `getWorkflowDefFromProjection(db, workflowId, select?)`, deliberately unified as a union, taking no `workspaceId` | `apps/server/src/projections/workflows.ts:62-65,72-108` | Every call site in 10/11/12 is rewritten and loses the `workspaceId` argument. Task 14's Features.md must not name `getWorkflowDefAsOf` as shipped; the as-of capability ships as a selector backed by `proj_workflows.published_workspace_seq`. |
| BA-3 | 12 | `apps/server/src/engine-context.ts` is new work (`filesCreate`), and `test/engine-context.test.ts` is a new 3-test file | Both ship on `main`. The source binds to the ingest transaction's `PoolClient`; the test file contains four tests whose whole purpose is to pin the OPPOSITE of Task 12's deliverable (`getEntityState('ticket')` is null; a `ticket.transitioned` refuses as `unknown-ticket`) | `apps/server/src/engine-context.ts:38,64-68,70-81`; `apps/server/test/engine-context.test.ts:96-142,144-163`; `apps/server/src/ingest/ingest-service.ts:120` | Task 12 is an EDIT of both files and must consciously invert two shipped, passing assertions. Publishing new tests alongside the old leaves a suite asserting both that tickets resolve and that they do not. The brief's `(db: Pool, workspaceId: string)` signature would additionally force a change to `ingest-service.ts:120` that the brief never mentions, and would move reads outside the ingest transaction — silently changing what rules judge against (`engine-context.ts:29-37`). |
| BA-4 | 5, 6, 7 (and 4, 12 by consequence) | `ctx.getEntityState('ticket-type', id)` yields a `TicketTypeDef` with rank/name/workflowId/fields, so `getTicketTypeDef` is a thin wrapper | `'ticket-type'` is an `OtherEntityState` — literally `{ kind; id }`. The shipped server context returns exactly that, by design, with a comment saying identity is all these states claim | `packages/domain/src/entity-state.ts:49-53`; `apps/server/src/engine-context.ts:15-25,64-68` | Every rank check (Task 5's `hierarchy.rank` / `deepest-rank-parent-required`, Task 6's reparent rank check) is unimplementable through the shipped `EngineContext`. Either widen `EngineContext` (`packages/rule-engine/src/engine.ts:7-11`) with `getTicketTypeDef(typeId): Promise<TicketTypeDef \| null>` — implemented in the memory context, the fixture harness AND `apps/server/src/engine-context.ts` — or promote `'ticket-type'` into a real `TicketTypeState` in the domain union. **A cross-package decision that must be made before any check is written; it cannot be deferred.** See **ruling 3**. |
| BA-5 | 13 | `buildServer({ db })` exists in `src/server.ts` and can back a route needing `db.query(sql, params)` | No `server.ts`. `buildApp(deps: AppDeps, options)` in `app.ts`, whose `db` is `HealthDb = { query(sql: string): Promise<unknown> }` — one argument, no parameter array | `apps/server/src/app.ts:6,19-22,24,58` | Task 13 cannot be implemented without first widening `AppDeps` to carry a real `pg.Pool`, touching `apps/server/src/index.ts` and every test that calls `buildApp` (`test/app.test.ts`, `test/events-route.test.ts`). Unscoped work the brief does not name — decide the shape before writing the route (**ruling 7**). |
| BA-6 | 8 | The `fixtures.test.ts` runner can be swapped to `buildMemoryContext(workflowDefs, priorEvents)` while preserving Plan 2's require-different-user "transition-history layering" | There is no separate layering to merge — the history IS `buildInMemoryContext`'s ticket fold. The context also needs `fx.memberships` and `fx.workflowDefs`, which a `(workflowDefs, events)` signature cannot receive. The 61 shipped fixtures speak a harness-only dialect a domain-schema context rejects wholesale | `packages/rule-engine/src/fixtures/harness.ts:137-155,168-183,220-259`; `packages/rule-engine/fixtures/rule-restrict-to-accepts-the-role.json`; `packages/rule-engine/test/fixtures.test.ts:19` | The swap breaks all 61 fixtures plus 30 harness tests. Task 8 extends `applyPriorEvent` instead (**A14**), and MUST bump the count gate — which the brief never mentions; without it the suite fails on the first new fixture. |
| BA-7 | 3, 4, 5, 6, 7 | New tests at `packages/*/src/<name>.test.ts` will run and gate the work | All three vitest configs collect ONLY `test/**/*.test.ts`. The briefs' own explicit-path commands override `include`, so the developer sees green locally while CI's `turbo run test` never runs the file | `packages/domain/vitest.config.ts:5`; `packages/rule-engine/vitest.config.ts:5`; `apps/server/vitest.config.ts:5`; root `package.json:9` | Five tasks' entire falsifiability apparatus silently disappears from CI. Relocate every new test to `test/` before writing it. |
| BA-8 | 9, 10, 11, 12, 13 | `test/helpers/db.ts` exports `testPool()` / `wipe(db)`, or Task 9 creates them | It exports `createTestDatabase()` returning `{ pool, url, drop() }`; a fresh database per test file, so there is nothing to wipe. Env is `TEST_DATABASE_ADMIN_URL`, default `postgres://gisik:gisik@localhost:54329/postgres` — a different user, port and database than the brief's | `apps/server/test/helpers/db.ts:9-10,31-59` | Task 9 must NOT create the helper (it would collide with the existing file). A brief hardcoding `postgres:postgres@5432` points at a database this repo never provisions. |
| BA-9 | 3 | `ticketWorkflowReboundPayload` and the other schemas come into `ticket-state.ts` from `'./events/ticket-events'`, and `foldStateIdForward` from `'@gisik-nokma/domain'` | The payload schemas ARE in `events/ticket-events.ts` (including `ticketWorkflowReboundPayload` at `:97`) with ONE exception: `ticket.transitioned`'s schema is `ticketTransitionedPayloadSchema` in `workflow.ts`. And `'@gisik-nokma/domain'` resolves to `./dist/index.js` — a source file inside `packages/domain` importing its own package root is a build-order cycle | `packages/domain/src/events/ticket-events.ts:97-100`; `packages/domain/src/workflow.ts:109,137`; `packages/domain/package.json:8-13` | `ticket-state.ts` as specified references an unimported name (`ticketWorkflowReboundPayload` is used but never imported) AND self-imports its own package. Import the five from `'./events/ticket-events.js'`, and `ticketTransitionedPayloadSchema` + `foldStateIdForward` from `'./workflow.js'`. |

---

## Verified facts

Confirmed against shipped code at `f363b2f`. **Downstream agents do not re-check these.**

| Fact | Evidence |
|---|---|
| `ticket.transitioned`'s payload field is `to`, NOT `toStateId`, with optional `comment: { text }`, `evidenceAttachmentId`, and `cause: { kind: 'reopened-for-child', childTicketId }`. The transition LOG ENTRY inside `TicketState` separately and correctly spells `toStateId` alongside `actorId`/`seq`/`workflowId`/`workflowVersion`. Both spellings are real and must not be unified | `packages/domain/src/workflow.ts:137-145`; `packages/domain/src/entity-state.ts:38`; `packages/rule-engine/src/fixtures/harness.ts:251-257` (reads `.to`, writes `toStateId`) |
| `ticket.workflow_rebound`'s payload genuinely IS `{ toWorkflowId, toStateId }` | `packages/domain/src/events/ticket-events.ts:97-100` |
| `foldStateIdForward(stateId, fromVersion, latest, intermediate)` where `intermediate` returns `WorkflowDef \| null` (not `undefined`). `FoldedState = {ok:true;stateId} \| {ok:false;unmappedStateId}`, aliased `ResolvedState` in the rule engine. It is THE ONE VERSION WALK for the monorepo, and its own doc comment names `proj_tickets` refresh-on-publish (Plan 3) and Plan 10's replica as callers | `packages/domain/src/workflow.ts:102-128,84`; `packages/rule-engine/src/version-map.ts:9` |
| `WorkflowDef` (`workflowDefSchema`) has NO `stateMapping`. It lives on `workflowDefinedPayloadSchema`, aliased `PublishedWorkflowDef`, and `hasStateMapping(def)` is the shipped type guard — no `as unknown as WorkflowDef` cast is ever needed | `packages/domain/src/workflow.ts:41-49,68-74,77-82` |
| `proj_workflows` carries `published_workspace_seq bigint NOT NULL` with index on `(workflow_id, published_workspace_seq)`. PK is `(workflow_id, version)`; `workspace_id` is a plain indexed column, not part of any key | `apps/server/migrations/1787896601515_proj-workflows.sql:11,21` |
| The `asOfWorkspaceSeq` PRECONDITION is documented in shipped code: the position must come from the same workspace stream as the workflow, because cursors restart at 1 per workspace and a cross-stream position returns a WRONG version rather than nothing | `apps/server/src/projections/workflows.ts:66-70` |
| The fixture count gate asserts EXACTLY **61** today, and there are exactly 61 `.json` files in `packages/rule-engine/fixtures/` (flat; the scan is non-recursive). Its comment orders the bump in the SAME COMMIT as any fixture addition | `packages/rule-engine/test/fixtures.test.ts:9-15`; `ls packages/rule-engine/fixtures/*.json \| wc -l` → 61 |
| The fixture harness ships as the `@gisik-nokma/rule-engine/fixtures` subpath export (`dist/fixtures/harness.js`), deliberately NOT re-exported from the package root (it imports `node:fs` at module top level). Inside the package, tests import it relatively as `../src/fixtures/harness.js` | `packages/rule-engine/package.json:14-17`; `packages/rule-engine/src/index.ts:1-4`; `packages/rule-engine/test/fixtures.test.ts:3` |
| The harness keys memberships to `ws_1` UNCONDITIONALLY while `completeEnvelope` only DEFAULTS `workspaceId` to `ws_1`; its own comment warns that a fixture overriding `workspaceId` makes restrict-to look up a key never inserted, get null, and refuse for a reason that reads entirely legitimate | `packages/rule-engine/src/fixtures/harness.ts:168-183` |
| `EngineContext` has exactly three methods: `getEntityState(kind, id)`, `getChildrenStates(ticketId)`, `getWorkflowDef(workflowId, version?)`. Verdicts are `Accept`/`Refusal`/`Verdict`. There is no `EngineVerdict` in the repo and no `packages/rule-engine/src/engine-context.ts` | `packages/rule-engine/src/engine.ts:3-11` |
| `apps/server/src/engine-context.ts` returns null from `getEntityState` for `'ticket'` and `'membership'`, and `[]` from `getChildrenStates`. Its own comments name **Plan 3 Task 12** as the change set that replaces both, "in the same change set … neither may land without the other" | `apps/server/src/engine-context.ts:15-20,59-68,70-81` |
| The projections wiring is `buildProjectionRegistry()` registering `entityHeadsProjection` then `workflowsProjection`. `apps/server/test/projection-order.test.ts` asserts exactly `['proj_entity_heads','proj_workflows']`, is deliberately DB-free, and its comment requires EVERY later registrant to extend the array in the same commit | `apps/server/src/projections/index.ts:14-19`; `apps/server/test/projection-order.test.ts:12-27` |
| The pinned §8 order as written in the shipped test comment is `proj_entity_heads, proj_workflows, proj_ticket_types, proj_tickets, proj_rollups, proj_memberships, proj_visibility` — it does NOT yet include `proj_projects`, which Plan 4's lane inserts before `proj_tickets` | `apps/server/test/projection-order.test.ts:6-8`; `progress.md` (standing note, pre-ruling 6) |
| `LedgerEvent`, `IngestResult`, `IngestErrorCode` and `ENTITY_WORKSPACE_MISMATCH_RULE` all live in `@gisik-nokma/domain` after the pre-work hoist | `packages/domain/src/ledger-event.ts:8`; `packages/domain/src/ingest-result.ts:3,12,14-17`; `apps/server/src/projections/registry.ts:2` |
| All eleven ticket event types are already registered in the vocabulary (Task 2, landed `3aec0a0`). Registering any of them again throws | `packages/domain/src/vocabulary.ts:66-141`; `packages/domain/src/registry.ts:31-33` |
| The parent-terminal invariant already ships: rule id `parent-terminal-with-open-children`, fired with reason `This ticket cannot enter "<StateName>" while N of its child tickets is/are still open.` It counts NON-TERMINAL children (`child.stateCategory !== 'terminal'`, i.e. open+active) — this settles Task 11's ambiguity: the invariant's "open children" = `totalChildren - terminalChildren`, not the `open_children` column alone | `packages/rule-engine/src/refusal-rules.ts:14`; `packages/rule-engine/src/transition.ts:92-101` |
| `packages/domain/src/index.ts` already star-exports `./entity-state.js`, `./workflow.js`, `./ticket-types.js`, `./events/ticket-events.js`, and exports `makeEnvelope` from `./testing.js`. Task 3 adds only its two new modules | `packages/domain/src/index.ts:9,12,15,16,17` |
| `makeEnvelope(partial)` fills `id` (real ulid), `workspaceId '01J9GWS0000000000000000000'`, `version 1`, `actorId '01J9GACT000000000000000000'`, `origin 'server'`, both clocks, `seq 1`. It requires `type`, `entity`, `payload`. It does NOT set `workspaceSeq` — a `LedgerEvent` needs that added explicitly | `packages/domain/src/testing.ts:18-32` |
| `DEEPEST_RANK = 4`; `SUB_TASK_TYPE_ID = 'sub-task'`; `BUILTIN_TICKET_TYPE_SEEDS` = epic(1)/story(2)/task(3)/sub-task(4) carrying only `{id,name,icon,rank}`; `builtinTicketTypeDefs(defaultWorkflowId)`; `dueDateValueSchema`; `IST_DAY_REGEX`; `CUSTOM_FIELD_KINDS`; `BUILTIN_FIELD_IDS`; `ticketTypeDefSchema` — all shipped and exported | `packages/domain/src/ticket-types.ts:53,70,72-77,85-94,113-116,4,7,27`; `packages/domain/src/ist-day.ts:27` |
| The test DB helper is `createTestDatabase(): Promise<{pool, url, drop()}>`, one fresh database per test file, admin URL `TEST_DATABASE_ADMIN_URL` defaulting to `postgres://gisik:gisik@localhost:54329/postgres`. There is no `testPool`, no `wipe`, no `TEST_DATABASE_URL` | `apps/server/test/helpers/db.ts:9-10,31-59` |
| The verifier rebuilds projection-outer — per projection, reset then apply every ledger event in canonical order — into a shadow schema fenced by `search_path`. This is exactly why `proj_tickets` must resolve definitions as-of the applying event rather than latest | `apps/server/src/tools/verify-projections.ts:45-58`; `apps/server/src/ledger/event-store.ts:146-159` |
| `int8` columns come back as JS numbers because `pg.types.setTypeParser(20, parseInt)` runs in `createPool`; every pool (app and tests) goes through it. `seq`/`workspace_seq` need no manual coercion | `apps/server/src/db.ts:8` |
| `validateWorkflowDef` refuses an `initialStateId` naming no state with code `unknown-initial-state` — confirming Task 14's Features.md claim | `packages/domain/src/validate-workflow.ts:72-73` |
| The pass-through fixture's candidate is `comment.added`, so adding `evaluate.ts` cases for `ticket.created` / `ticket.reparented` / `ticket.field_set` / `ticket-type.defined` / `ticket.workflow_rebound` flips no shipped fixture | `packages/rule-engine/fixtures/pass-through-accepts-unhandled-event-types.json`; `packages/rule-engine/src/evaluate.ts:13-20` |
| `require-different-user.ts` today: guard 1 skips foreign-workflow entries at `:43`; the fail-open skip is `if (!resolved.ok) continue;` at `:56` under a comment (`:51-55`) whose precondition Plan 3 removes; `:57` says "Iterating oldest-first and overwriting leaves the LAST match standing" — an ordering guarantee inherited from the caller and asserted nowhere | `packages/rule-engine/src/rules/require-different-user.ts:40-59` |

---

## Coordination obligations

Source: `docs/superpowers/plans/2026-08-20-00-series-coordination.md`. **MUST** items block the
branch; the rest are take-or-record.

| id | Source (section + lines) | What Plan 3 must do | Owning task(s) | MUST | Covered | Gap |
|---|---|---|---|---|---|---|
| O-transitioned-payload | Reconciliation decision 6, Amendment (2026-08-28 keystone), 39–47 | The registered `ticket.transitioned` payload is Plan 2's shipped `ticketTransitionedPayloadSchema`: field is `to`, `comment` is `{ text }`, `cause` is carried. Plans adapt their `toStateId` literals at transcription and must NOT "correct" the shipped schema | 3, 4, 5, 6, 8, 10, 12, 13 | **MUST** | No | Every brief writes the pre-keystone spelling: T3 reducer + tests (lines 134/257), T4 tests (71/121), T5 Step 7b (305), T6 (306/323), **T8 — all 13 fixtures use `"payload": {"toStateId": …}`**, T10 (251/271/323/338/348/367/373), T12 (69), T13 (77). Verified against `workflow.ts:137-139` and against all 61 shipped fixtures, which already speak `to`. Literal transcription produces `invalid-payload`/undefined-state failures across five tasks, and the tempting "fix" is the one the doc forbids. **Enforced by A10.** |
| O-log-entry-workflowid | Reconciliation decision 4 (33–35) as amended by the 2026-08-26 workflow-pinning decision item 2 (180–181) | Each transition-log entry carries `workflowId` BESIDE `workflowVersion` — `{ toStateId, actorId, seq, workflowId, workflowVersion }` — so four-eyes filters out entries recorded under a workflow the ticket has left. Plan 3's reducer PRODUCES the type; it does not redefine it | 3, 10, 12 | **MUST** | No | All three briefs echo the entry shape WITHOUT `workflowId` (t3:34, t10:21, t12:19) and T3's reducer literal (t3:430) constructs entries without it. **Two tests actively assert the wrong shape with `toEqual`** — t3:139 and t10:354-356 — so they fail against `main`, and the fix an implementer reaches for is deleting the field from `entity-state.ts`, silently reopening the migration hole item 2 closed. T3's own rebind comment (467–474) contradicts its own shape. **Fix direction is pinned: correct the briefs, NEVER `entity-state.ts`** (`packages/domain/src/entity-state.ts:38` and its doc comment `:14-23`). |
| O-rdu-fail-closed | Plan 2 consequences §3, 424–432; floor list 594 | Plan 3 OWNS the decision on RDU's fail-open skip; whichever is chosen, the comment at `require-different-user.ts:51-58` is rewritten in the same change | **4b** | **MUST** | **Yes — DISCHARGED BY RULING** | Ruled pre-flight by the controller: **R1 fail-closed**, **R1a comment rewritten same change**, **R3 lands in dedicated Task 4b (after T4, before T5; implementer opus-high, reviewer `fable`)**, **R4 coordination-doc edit in the SAME commit** (`progress.md`, "Pre-flight rulings"). Brief written: `task-4b-brief.md`, with the refusal copy pinned character-for-character. **Not re-opened here.** |
| O-rdu-seq-order | Plan 2 consequences §4, 434–440 | Either guarantee append order explicitly at the point the guarantee is made, or sort by `seq` at the point of use — the second is preferable | **4b** (with 10) | **MUST** | **Yes — DISCHARGED BY RULING** | Ruled pre-flight: **R2 — RDU sorts a COPY of candidate entries by ascending `seq`**, never mutating `input.ticket.transitions`, with the now-wrong `:57` comment rewritten (`progress.md`). Residual for **T10**: its append site is still undocumented; with R2 in place the ordering no longer rests on it, but T10 should say so where it appends rather than leave the reader to infer it. |
| O-fixture-count | Plan 2 consequences §6, 456–460; pre-ruling 6, 539 | Bump the exact-count assertion in the SAME COMMIT as any fixture addition; under parallelism every colliding branch states its delta and the merger sums them arithmetically | 6, 8, 4b | **MUST** | No | Neither T6 nor T8 mentions the count. Gate is `expect(fixtures).toHaveLength(61)` (`fixtures.test.ts:14`). Plan 3 adds **13 (T8) + at least 2 (T6 Step 4c, absent from T8's Files list) + 0-or-1 (T4b, conditional)** — a delta spanning three tasks and three commits. T8 Step 8's `git add packages/rule-engine/fixtures` commits fixtures without touching the count file at all. See **ruling 6**. |
| O-fixture-ws1-flat-path | Plan 2 consequences §6, 456–462 | Fixtures live FLAT in `packages/rule-engine/fixtures/`; candidates stay in workspace `ws_1` unless the harness is extended knowingly; the harness is imported from the `@gisik-nokma/rule-engine/fixtures` subpath | 6, 8 | No | Partial | Flat: covered. **ws_1: VIOLATED** — all 13 T8 fixtures hardcode `"workspaceId": "01J9GWS0000000000000000000"` on priorEvents and candidates, the exact override `harness.ts:168-183` warns yields a null membership and a legitimate-looking restrict-to refusal. Harmless only while no such fixture carries a `restrict-to` rule; latent the moment one does. Path: T8's Files list and Step 1 cite `packages/rule-engine/src/fixtures.test.ts`; the file is `packages/rule-engine/test/fixtures.test.ts`. See **ruling 5**. |
| O-fixture-harness | Plan 2 consequences §6, 450–462; parallel-execution discipline 557 | Plan 3's fixtures run through Plan 2's SHIPPED harness and format; any runner change keeps every existing fixture green | 8 | **MUST** | No | T8 Step 1 instructs replacing the runner's context construction with `buildMemoryContext`. Against shipped code that breaks all 61 fixtures in three independent ways the brief prices none of: (a) prior `ticket.created` payload dialect mismatch; (b) `getEntityState('membership')` returns null in the new context, so restrict-to's fixtures refuse for the wrong reason; (c) the harness's deliberate planted `stateId`/`stateCategory` overrides have no path through the reducer. Plus `field` vs `fieldId`. This is an unowned reconciliation work item, not the "merge, don't discard" one-liner the brief describes. **Enforced by A14/BA-6.** |
| O-reset-lock-contract | Plan 1 consequences §6 bullet 3, 361; Plan 2 consequences §5, 442–448 | `reset()` is `TRUNCATE` today; a DELETE-based reset changes the lock contract (TRUNCATE takes ACCESS EXCLUSIVE, so a rebuild cannot interleave with an ingest). The entity↔workspace tenancy door reads derived `proj_entity_heads` and is safe ONLY while both named reasons hold, the second being TRUNCATE. "Whoever writes the first non-TRUNCATE reset owns re-deriving the contract" | 9, 10, 11 | **MUST** | No | All three briefs ship DELETE-based resets (t9:157, t10:570, t11:363) while both shipped projections use TRUNCATE (`entity-heads.ts:40`, `workflows.ts` reset). No brief mentions the lock contract, the tenancy door, or re-deriving either. See **ruling 4**. |
| O-task12-hazard | Plan 1 consequences §9, 374–382; keystone rider 518; floor list 594 | The `as unknown as EntityState` cast dies at Task 12: `getEntityState` grows real bodies for `'ticket'` and `'ticket-type'` and `getChildrenStates` becomes the real query, in ONE change set — "neither may land without the other". `'membership'` stays null until Plan 4. The seam comment naming Plan 3 Task 12 is retired in the same change | 12 | **MUST** | No | Substance is there but collides in four unpriced ways: (1) signature — brief writes `(db: Pool, workspaceId: string)` vs shipped `(client: PoolClient)` bound to the ingest transaction, whose docstring makes not-yet-applied read semantics load-bearing; (2) regression — the brief's `getEntityState` returns null for everything but ticket/ticket-type, DROPPING the shipped identity-only kinds Plan 2/4 rules read; (3) it never says membership stays null and never retires the `PLAN 3 TASK 12` comments; (4) it returns a full `TicketTypeDef` for kind `'ticket-type'` where the union says `{kind,id}`. **Enforced by A12/BA-3; the type half is ruling 3.** |
| O-registration-order | Reconciliation decision 8, 51 (with the 2026-08-26 `proj_projects` insertion, 200); pre-ruling 6, 539; Plan 1 consequences §6 bullet 1, 359 | Projections apply in registration order; §8's order is the single source; whichever plan merges second updates the array to the FULL §8 order. The second registrant arrives with the ordering assertion | 9, 10, 11 | **MUST** | Partial | Relative ordering is instructed; four mechanics are missing: (a) shipped wiring is `buildProjectionRegistry()` + `registry.register(...)`, not `registerProjection(...)`; (b) the `Projection` type requires `tables` and `apply(event: LedgerEvent, tx)`, and T9 types apply as `(env: EventEnvelope, db)`; (c) `apps/server/test/projection-order.test.ts` exists and demands extension in the same commit as each registration — Plan 3 registers THREE projections, so it is edited three times; (d) pre-ruling 6's `proj_projects` collision with Plan 4's lane is unmentioned. **Enforced by A4/A5/BA-1; `progress.md` carries the merge-resolution note.** |
| O-determinism-live | Plan 1 consequences §6 bullet 2, 360 | "Determinism test 3 is currently vacuous-adjacent… The first order-sensitive projection makes that test live — and it must be re-read then, not assumed still green for the right reason" | 10, 11 | No | No | `proj_tickets` (order-dependent fold) and `proj_rollups` (reads `proj_tickets` in the same transaction) are the series' first order-sensitive projections. No brief instructs re-reading `apps/server/test/determinism.test.ts`; both tasks add their own rebuild-and-diff tests and leave Plan 1's reversed-arrival test standing untouched and unexamined. |
| O-asof-same-stream | Plan 2 consequences §6, 462 | `proj_tickets` is the intended caller of the as-of lookup and MUST pass a position from the same workspace stream as the workflow it asks about | 10 | No | Partial | T10 satisfies it in substance (`env.workspaceSeq` alongside `env.workspaceId`) but never states it — the durability half, "who it is for", stays missing. Compounded because the function it names does not exist and the real one takes NO `workspaceId`, so same-stream discipline rests entirely on the caller (`workflows.ts:66-70` states the precondition; `progress.md` carries it as a standing note). |
| O-foldedstate-version | Plan 2 consequences §1, 408–414 | The stranded-state refusal names a state id against the wrong version's vocabulary. "The fix is a cross-plan surface change and belongs to whichever plan next touches the fold": `FoldedState` must carry the version the chain broke on — or the version clause is dropped. Folding the id back to the origin version is explicitly forbidden | 3, 10 | No | No | **Plan 3 is the next plan to touch the fold.** T3 authors `foldTicketToWorkflowVersion` over `foldStateIdForward` and reads `resolved.unmappedStateId` into its own message (t3:549), inheriting the inaccuracy; T10's `refreshTicketsForWorkflow` walks multi-version chains, where a three-version case first becomes routine. No brief takes the change and none declines it. Take-or-record — see **ruling 2**. |
| O-import-origins | Parallel-execution discipline 557; pre-work type hoist 527 | Every identifier, import origin and file path is adapted from SHIPPED code at the branch head, never transcribed from plan text | 3, 4, 5, 6, 8, 9, 10, 11, 12, 13 | No | No | Nine verified instances, all now carried as adaptations A2/A3/A4/A7/A9/A10/A11/A12/A13 and BA-1/BA-2/BA-9, plus two internal to Plan 3: T6 Steps 4b/4c import from `'../types'` and `'./shared'` while T5 creates `refusals.ts`/`context-helpers.ts` (see conflict **C-22**), and `checkTicketWorkflowRebound`/`checkTicketTypeDefined` omit the `EventEnvelope` import their signatures use. |
| O-project-existence | Owner decision 2026-08-26, 198–204; outstanding 211 | Plan 4 owns `proj_projects` and the "the project does not exist" refusal; "it joins Plan 3's precondition list as a cross-reference" so Plan 3's list does not read as complete when it is not | 5, 14 | No | Partial | T14 OQ6 records the settlement in prose and claims the cross-reference is carried — but the actual precondition list, `REFUSALS` in `checks/refusals.ts` (T5 Step 4), carries no project entry and no cross-referencing comment, and `checkTicketCreated`'s documented check order (t5:232-236) omits it. A reader of the code sees a list that looks exhaustive. |
| O-refresh-on-publish | Owner decision 2026-08-26, 142–154; amendment 10 replica clause 147 | `proj_tickets` consumes `workflow.defined` and folds every row on that workflow forward; `proj_rollups` refreshes in the SAME transaction; the fold is ONE function in `@gisik-nokma/domain` that the projection, the fixture context and Plan 10's replica all call | 3, 4, 10, 11 | **MUST** | **Yes** | — (the one function is `foldStateIdForward`, `workflow.ts:102-128`, whose own doc comment names all three callers) |
| O-asof-resolution | Owner decision 2026-08-26 corollary, 149–154 | `proj_tickets` resolves the workflow definition AS OF the event it is applying, never as of now | 10 | **MUST** | **Yes** | Instructed and proven by a projection-outer planted-defect test (t10 Step 2, 359–387) — the strongest test in the plan. Only the API name is wrong (**A11**). |
| O-workflow-pinned | Owner decision 2026-08-26, 168–190; outstanding 210 | A ticket pins the workflow it was created under; `ticket.workflow_rebound { toWorkflowId, toStateId }` is the migration event, refused when `toStateId` is not a state of the target, and refused when it rebinds to the ticket's OWN workflow. A planted test proves a `ticket-type.defined` re-point leaves existing `proj_tickets.workflow_id` untouched | 3, 6, 10 | No | **Yes** | — |
| O-builtin-rank-lock | Plan 8 walked 2026-08-27, 303 | The server refuses a `ticket-type.defined` that re-ranks one of the four built-ins (`type.builtin-rank`); name/icon/workflow stay editable, custom types stay re-rankable. Catalogued as case 5.36 | 6, 14 | No | **Yes** | Only downstream gap: Step 4c's two fixtures are missing from T8's Files list and from the count bump (**O-fixture-count**). |
| O-deepest-rank | Owner sign-off 2026-08-20, 79; contract amendment 61; T14 OQ4 | The parent requirement follows the RANK (`rank >= DEEPEST_RANK`, fixed at the built-in sub-task's 4), not the built-in id | 5, 6, 8 | No | **Yes** | — |
| O-parent-terminal-real | Plan 2 consequences §7 rider 1, 466 | The parent-terminal invariant is inert server-side until Plan 3 lands the ticket projection; the rule id is Plan 2's `parent-terminal-with-open-children` | 10, 12 | No | **Yes** | T12's second test proves it end to end against Postgres with the correct rule id; T8's two fixtures correctly assert the rule id only. Covered in substance — but it lands through the T12 signature collision (**BA-3**), so it is only as real as that closure is correct. |
| O-evidence-ownership | Plan 2 consequences §7 rider 2, 467; pre-ruling 5, 538 | RESOLVED by pre-ruling 5: Plan 7 owns the evidence-existence gate unconditionally. Plan 3 must NOT implement it, and must not leave the "whichever lands second" clause live | 3, 14 | No | Partial | T3's `comment.added`/`attachment.added` comment (483–492) argues correctly and points at Plan 7, so the behaviour is right — but neither it nor T14 records that pre-ruling 5 resolved the ownership question. A later reader of Plan 2's consequences still sees a live "whichever lands second" claim on a plan that has landed. |
| O-history-route | Contract amendments 59; pre-ruling 1, 534 | Plan 3 owns `GET /v1/tickets/:id/history` and ships `routes/ticket-history.ts`; Plan 4 owns `routes/tickets.ts` and wraps read enforcement around both, adapting at merge and citing the pre-ruling | 13 | No | **Yes** | — |
| O-no-http-coercion | Plan 1 consequences §7, 364–368 | Fastify is built `coerceTypes: false` / `removeAdditional: false` instance-wide; query and path params do NOT coerce. No later plan re-enables coercion instance-wide to fix one route | 13 | **MUST** | **Yes** | Substantively covered — `parseNonNegativeInt` takes `unknown`, requires `typeof raw === 'string'` and `/^\d+$/` before `Number()`, and the route declares no AJV schema. The brief never cites the constraint as the REASON, so a later tidy-up adding a querystring schema with `type: 'integer'` would 400 every request with nobody knowing why. Add the citation. |
| O-ist-two-clocks | Owner decision 2026-08-20, 88–95 | Both clocks are `timestamptz` absolute instants and stay two separate facts; day claims are `YYYY-MM-DD` on IST boundaries; every plan computing a day boundary uses IST | 7, 13 | No | **Yes** | T13 proves `+05:30` reads back as the same instant; T7 holds custom `date` fields to the one imported `IST_DAY_REGEX` rather than a second copy. Plan 3 computes no day boundaries, so that half does not bite here. |
| O-catalogue-same-set | Reconciliation decision 2, 29 | Plan 3 claims `Features.md` §5 and `test-cases/05-tickets-hierarchy.md`, updated in the SAME change set. Cases **5.27** and **5.30** are cited by Plan 5 (line 213) and **5.36** by the coordination doc (line 303) | 14 | No | Partial | Section, filename and numbering are right and 5.27/5.30/5.36 land on the right content — but nothing tells the executor those three numbers are **cross-plan citations that may not be renumbered**. One overclaim to fix: the Features.md bullet (t14:26) says "Both projections resolve a workflow definition as of the ledger position of the event they are applying" — `proj_rollups` never resolves a definition at all (it recomputes `FILTER` counts), so the catalogue asserts a mechanism the code does not have. |
| O-model-floors | Model and effort policy 577–590; floor list 594; escalation 596 | Non-negotiable floors: **T3** (reducer + fold), **T10** (as-of resolution), **T12** (engine-context hazard closure) and **T4b** (the RDU decision) run implementer opus-high AND reviewer top tier (explicit `fable` dispatch; fallback opus/max recorded as a deviation). **T8** (fixture authoring / planted-defect design) is opus-high. De-escalating below a class floor is forbidden; two failed fix rounds escalates one tier | 3, 4b, 8, 10, 12 | **MUST** | No | Dispatch-level, correctly absent from brief content. The controller applies it. The floor-list item that had no task now has one: **T4b** (`progress.md` ruling R3 assigns it opus-high implementer, `fable` reviewer). |
| O-two-fanouts | Ultracode usage policy 598–603; parallel-execution discipline 556–559 | Every full plan lane runs exactly two mandatory fan-outs: this pre-flight scan, and the final whole-branch review (four lenses, mocked-contract at top effort, adversarial refuters, ledger triage, synthesis). "No full plan ships without both." A finding-bearing final review gets a scoped re-review over the fix commits | — (lane) | **MUST** | No | Lane-level, carried by no brief. The keystone micro-PR is merged with its §9 rider; this document discharges the first fan-out. The final whole-branch review with the mocked-contract lens is where **O-fixture-harness** and **O-task12-hazard** would otherwise surface too late. |
| O-rulings-same-set | Autonomous execution protocol item 3, 567; Plan 2 consequences preamble 402–406 | On a decision the plans do not answer: take the conservative option, record a ruling-request entry in the coordination document IN THE SAME CHANGE SET, push-notify the owner, continue. "The routing must happen in the task that discovers the item, not at plan end" | — (every task) | **MUST** | Partial | Plans 1 and 2 both lost their rulings to the gitignored `progress.md`; Plan 3's own ledger is the same file. R4 already fixes this for T4b (coordination-doc edit in the same commit as the code). The same discipline binds the remaining queued items: **ruling 2** (FoldedState), **ruling 4** (reset lock contract), **O-fixture-harness**. |
| O-rtk-diff | Plan 2 consequences §7 rider 3, 468 | Verify mutation restorations with `git diff` or by reading the file, NEVER with a proxied shell `diff` — an RTK-proxied `diff` reported "identical" for files that differed | — (every task) | No | No | Dispatch-level discipline carried by no brief; recorded as a standing note in `progress.md`. It bites hardest on T5–T8 and T10, where every refusal is proven by breaking something and restoring it, and this repo routes shell commands through the RTK proxy by hook. |

---

## Cross-task conflict table

**The required scan output.** Every pair of Plan 3 tasks (3–14, plus 4b) that shares a file path or
an interface gets a row. Pairs that agree are listed too — "no conflict" is a finding.

| id | Tasks | Shared surface: what one produces vs what the other consumes | Finding |
|---|---|---|---|
| C-01 | 3 × 4 | T3 produces `applyTicketEvent`, `TicketState`, `TicketStateDeps`, `TICKET_EVENT_TYPES`, `foldTicketToWorkflowVersion` in `@gisik-nokma/domain`; T4 consumes all five to build `MemoryContext` | **Conflict.** T4's `Consumes` line omits `foldTicketToWorkflowVersion` even though its Step 3 code imports it and it is load-bearing for design decision 10; it likewise omits `EventEnvelope` while typing `buildMemoryContext(seedWorkflows, events: EventEnvelope[])`. Both are real exports — add them to the contract so the produced/consumed sets match. Additionally `TicketStateDeps` as T3 defines it (`getTicketType`, `getWorkflow`) is exactly what T4 supplies from its maps: **that half agrees**. |
| C-02 | 3 × 4b | T3 produces `TicketState.transitions` entries; T4b's RDU reads them, sorting by `seq` (R2) and filtering on `workflowId` (guard 1) | **Conflict, blocking.** T3's brief constructs entries WITHOUT `workflowId` (t3:430) and asserts the truncated shape with `toEqual` (t3:139), while `entity-state.ts:38` already requires it and T4b's guard 1 depends on it. T3 must fill `{ toStateId, actorId, seq, workflowId, workflowVersion }` and its test must assert that shape. R2 removes T3's obligation to guarantee append ORDER, but T3 must still populate `seq` from `env.seq` — an entry with a wrong or missing `seq` now silently mis-sorts rather than being ignored. |
| C-03 | 3 × 5 | T3 produces `TicketState`; T5's `getTicketState` narrows `ctx.getEntityState('ticket', id)` to it, and `checkTicketCreated` reads `stateCategory`, `projectId`, `typeId`, `fields['title'].value` | **No conflict on TicketState** — every field T5 reads exists on the shipped type (`entity-state.ts:24-39`). Separate conflict on the TYPE side: T5 needs a `TicketTypeDef` (rank/name) which `getEntityState` cannot serve (**BA-4**, **ruling 3**). |
| C-04 | 3 × 6 | T3 produces `ticketWorkflowReboundPayload` handling and the pinned-workflow semantics; T6's `checkTicketWorkflowRebound` refuses same-workflow rebinds and unknown target states | **Agree on semantics.** Both implement the 2026-08-26 pinning decision, and T6's extra `ticket.rebound-same-workflow` refusal is the one the decision did not anticipate, correctly owned server-side. Shared hazard: `ticket.workflow_rebound`'s payload IS `{ toWorkflowId, toStateId }` (`events/ticket-events.ts:97-100`) — the ONE place `toStateId` is right in a payload; do not "adapt" it to `to` while fixing **A10** elsewhere. |
| C-05 | 3 × 7 | T3 produces the `FieldClaim` shape (`value`, `actorId`, both clocks); T7's `checkTicketFieldSet` validates the value before it becomes a claim | **No conflict.** T7 validates kinds only and never writes claims; T3 records provenance and never validates kinds. The division is clean, and T7's assumption that "Task 3 already proves the projection preserves actor and both times" is satisfied by T3's reducer test. |
| C-06 | 3 × 8 | T3 defines what the reducer accepts; T8's fixture `priorEvents` are folded into ticket state before the candidate is judged | **Conflict.** T8's fixtures do NOT reach T3's reducer at all under **A14** — they run through `buildInMemoryContext`'s hand-written fold. So a fixture and the reducer can disagree with no test noticing. Mitigation is **A15**: `memory-context.ts` mirrors the harness's `getChildrenStates`/`getWorkflowDef` verbatim, and the harness extension (**A14**) adds the two event types rather than a second dialect. |
| C-07 | 3 × 10 | T3 produces `applyTicketEvent(state, env, deps)` with `TicketStateDeps = { getTicketType, getWorkflow }`; T10's `loadDeps` supplies that object from Postgres | **CONFLICT — needs a fix instruction.** T10's `loadDeps` sets `workflowId` only when `env.type === 'ticket.transitioned'`, and fetches the type only for `ticket.created`. For a `ticket.workflow_rebound` — which T10 tests explicitly ("a rebound moves the one ticket it names") — `wfId` is `undefined`, so `deps.getWorkflow` resolves null, while T3's reducer branch calls `deps.getWorkflow(p.toWorkflowId)` and throws `workflow "…" is not defined`. Either T10's `loadDeps` reads `toWorkflowId` off the rebound payload (and the reparent/assign/field_set paths read `current.workflowId`), or `TicketStateDeps.getWorkflow` must be a by-id lookup T10 can serve for any id. **This is a cross-brief interface conflict, not merely T10's self-inconsistency, and it must be settled before T3 fixes the deps contract in code.** |
| C-08 | 3 × 12 | T3 produces `TicketState`; T12's `getEntityState('ticket')` must return exactly it, and its `getChildrenStates` returns `TicketState[]` | **Conflict inherited from C-02/A17.** T12's brief echoes the transition-entry shape without `workflowId` (t12:19). Also: `rowToTicketState` must repopulate `kind: 'ticket'` and `workspaceId`, neither of which is implied by the brief's column list — and `workspace_id` must exist as a column for T12's helpers to be callable without a `workspaceId` argument (**A12**). |
| C-09 | 3 × 14 | T3 produces `applyTicketEvent` / `foldTicketToWorkflowVersion`; T14 catalogues them in Features.md §5 and tests 5.30–5.31 | **No conflict** on names and paths (`packages/domain/src/ticket-state.ts`). One downstream correction: T14 must not describe `getWorkflowDefAsOf` as a shipped symbol (**BA-2**), and its "both projections resolve a workflow definition as of…" bullet is false of `proj_rollups` (**O-catalogue-same-set**). |
| C-10 | 4 × 4b | T4 ships `memory-context.ts` (a second in-memory context); T4b's RDU unit tests need a context that stages an unresolvable log entry while the ticket resolves cleanly | **Agree, and the dispatch order is already pinned.** R3 places T4b after T4 precisely so T4's context exists for those tests. T4b's brief additionally points at the shipped `test/version-map.test.ts` helpers — reuse those rather than requiring `memory-context.ts`, so T4b does not couple to a module it does not need. |
| C-11 | 4 × 5 | T4 produces `buildMemoryContext`; T5's `hierarchy.test.ts` uses it as the context under which `checkTicketCreated` runs | **Conflict deferred to ruling 3.** T5's `getTicketTypeDef` needs a type def that plain `EngineContext` cannot serve. T4's `MemoryContext` has a `ticketTypes` map, but a value typed `EngineContext` cannot expose it. Whatever **ruling 3** decides, T4 implements it — so ruling 3 must be ruled **before T4 dispatches**, not before T5. |
| C-12 | 4 × 6 | T4 produces `buildMemoryContext`; T6's `reparent.test.ts` uses it, replaying `ticket-type.defined` / `ticket.created` / `ticket.transitioned` | **Agree** on the events T4 handles. **Gap:** T6's rank-redefinition cycle test relies on `ticket-type.defined` being last-definition-wins in the memory context — T4's brief specifies that ("last type definition winning"), so this holds; T6 must not additionally require `ticket.reparented` replay in priors, which T4's context does not fold. |
| C-13 | 4 × 7 | T4 produces `buildMemoryContext`; T7's `fields.test.ts` uses it with `created(...)` / `typeDefined(...)` | **No conflict.** T7 only needs tickets and type defs in the context, both of which T4 provides — subject to **ruling 3** for how the type def is reached. |
| C-14 | 4 × 8 | T4's `buildMemoryContext` vs T8's instruction to swap the fixture runner onto it | **CONFLICT — resolved by A14/BA-6.** The swap breaks 61 fixtures and 30 harness tests. T4's context is a SECOND context; the fixture suite keeps `buildInMemoryContext`. T4's brief must state this so nobody later "unifies" them, and T8 extends the harness instead. |
| C-15 | 4 × 12 | Both implement `EngineContext` — one in memory, one over Postgres | **Conflict deferred to ruling 3, plus a semantic-parity obligation.** Any widening decided in ruling 3 must be implemented in BOTH (and in the fixture harness, three implementations). Additionally, T4 must mirror the shipped direct-children and exact-or-latest `getWorkflowDef` semantics (`harness.ts:191-197`) so the memory and server contexts cannot disagree about what the same rule sees. |
| C-16 | 4 × 14 | T4's `memory-context.test.ts` is cited by T14's test-case 5.31 (fold-on-publish in the in-memory context) | **No conflict**, subject to the test living at `packages/rule-engine/test/memory-context.test.ts` (**A1**) — T14's catalogue must cite the `test/` path. |
| C-17 | 4b × 5 | T4b changes RDU's refusal behaviour; T5 adds `evaluate.ts` dispatch cases | **No conflict.** RDU is reached through `evaluateTicketTransitioned`, an existing case; T5 appends new cases and leaves the `ticket.transitioned` arm untouched. Dispatch order (T4b before T5, R3) is a sequencing choice, not a code collision. |
| C-18 | 4b × 6 | Both may add fixtures under `packages/rule-engine/fixtures/` | **Conflict on the count gate only** — see C-30 and **ruling 6**. T4b's fixture is conditional ("required if expressible"; if the harness cannot stage an unresolvable entry without also stranding the ticket, it ships none and reports that). The arithmetic must be stated per commit, not assumed. |
| C-19 | 4b × 8 | T4b settles RDU semantics; T8 authors fixtures against final rule behaviour | **Agree, and the ordering is deliberate.** R3's rationale is exactly this: settling RDU before T8 means the fixture author writes against final behaviour. Any T8 fixture whose ticket has a foldable transition log must be re-read against fail-closed. |
| C-20 | 4b × 10 | T4b's R2 sorts a COPY by `seq`; T10's projection appends entries via T3's reducer | **Agree, with a residual.** R2 removes the load-bearing status of T10's append order. T10 should still document at its append site that entries carry a monotone `seq` — see **O-rdu-seq-order**. T10 must NOT sort or rewrite history: "a fold moves the ticket's current state, never the history that got it there" (`entity-state.ts:20-22`). |
| C-21 | 4b × 14 | T4b's ruling and refusal copy vs T14's Features.md / test-cases catalogue | **Gap.** T14's brief predates T4b and catalogues no four-eyes fail-closed case. The new refusal is user-visible (a named rule with pinned copy) and needs a Features.md line and a test-case id. Either T4b carries its own catalogue edit (consistent with R4's same-change-set discipline) or T14 adds it — **T4b is the better home**; whichever, it must not fall between them. |
| C-22 | 5 × 6 | T5 creates `checks/refusals.ts`, `checks/context-helpers.ts`, `checks/test-support.ts`, `checks/hierarchy.ts`; T6 modifies `hierarchy.ts` and consumes `ACCEPT`/`refuse`/`getTicketState`/`getTicketTypeDef`/`DEEPEST_RANK`/`rankRefusal`/`deepestRankParentRefusal`/`parentTerminalRefusal` | **CONFLICT — module locations disagree.** T5's extraction places `rankRefusal`, `deepestRankParentRefusal`, `parentTerminalRefusal`, `refuse`, `ACCEPT` in `checks/refusals.ts` and `getTicketState`/`getTicketTypeDef` in `checks/context-helpers.ts`. T6's assumptions say the three refusal helpers "exist in hierarchy.ts (Task 5)" and imports `ACCEPT, getTicketState, refuse` from a non-existent `./shared`, with `getTicketTypeDef` and `DEEPEST_RANK` used unqualified and unimported. **Pin T5's layout:** refusal vocabulary in `refusals.ts`, context wrappers in `context-helpers.ts`, `DEEPEST_RANK` imported from `@gisik-nokma/domain` (`ticket-types.ts:70`), nothing in a module named `shared`. T6 rewrites its imports accordingly. |
| C-23 | 5 × 7 | T5 creates `refusals.ts` (`ACCEPT`, `refuse`, `fieldKindRefusal`) and `context-helpers.ts`; T7 imports all of them, and both modify `evaluate.ts` | **Agree on module paths** — T7's extraction cites `./refusals` and `./context-helpers` correctly, unlike T6. **Contract to pin:** T7 assumes `refuse('ticket.unknown')` / `refuse('field.unknown')` / `refuse('field.title-required')` produce fixed default reasons from the `REFUSALS` map when called with one argument — T5's overloaded `refuse(rule: keyof typeof REFUSALS)` supports this, so the two agree, but the default reasons T7 asserts must be the exact strings T5 puts in the map. |
| C-24 | 5 × 8 | T5 produces the refusal reason strings; T8's fixtures assert them character-for-character (`hierarchy.rank`, `hierarchy.deepest-rank-parent-required`, `hierarchy.cycle`, `hierarchy.parent-terminal`) | **Agree on wording** — every string T8 asserts matches a T5 template, with the type names substituted (`"Epic" cannot go under "Story"…`). **Two conflicts to note:** (a) T8's parent-terminal fixtures must assert `rule` ONLY, deferring the reason to Plan 2's shipped rule — and they do; (b) T8's `expected.rule` for `parent-terminal-with-open-children` is Plan 2's id (`refusal-rules.ts:14`), while T5's NEW rule id is `hierarchy.parent-terminal` — **two different rules with adjacent meanings** (Plan 2's fires on a transition INTO terminal with open children; T5's fires on adding/moving live work UNDER a terminal parent). Both must exist; neither may be renamed to the other. |
| C-25 | 5 × 12 | T5's checks read `EngineContext`; T12 makes the server's `EngineContext` answer for tickets | **Agree in direction** — T12 is what makes T5's checks non-vacuous on the server. **Conflict is ruling 3's**: T5's type lookups need the widened method T12 must implement. Also note T12's brief asserts `rule: 'ticket.unknown-type'` and `rule: 'hierarchy.rank'` end-to-end — those ids come from T5's `REFUSALS`, so T5's spelling is authoritative. |
| C-26 | 5 × 14 | T5's file paths (`checks/hierarchy.ts`), rule ids and test file are catalogued in Features.md §5 and cases 5.x | **No conflict** on ids; T14 must cite `test/hierarchy.test.ts` (**A1**) and add the project-existence cross-reference **O-project-existence** names. |
| C-27 | 6 × 7 | Both modify `evaluate.ts` (adding `ticket.reparented`/`ticket-type.defined`/`ticket.workflow_rebound` and `ticket.field_set` respectively) and both consume T5's `refusals.ts` | **Merge collision, not a semantic conflict.** Three tasks (5, 6, 7) each append to the same `switch` and each extend `refusals.ts`. Dispatch serially in 5→6→7 order, or the second and third rebase; the switch has no ordering semantics (cases are disjoint on `env.type`), so resolution is mechanical. |
| C-28 | 6 × 8 | T6 Step 4c creates `type-defined-refuses-builtin-rerank.json` (and a companion); T8 owns "thirteen fixtures" and the count | **CONFLICT.** T6's fixtures are absent from T8's `filesCreate` and from T8's count arithmetic, and T8's commit message says "Thirteen end-to-end fixtures" while the directory will hold more. Neither task can bump the gate correctly without knowing the other's delta. **ruling 6.** |
| C-29 | 6 × 14 | T6's rule ids (`ticket.rebound-same-workflow`, `ticket.rebound-unknown-state`, `type.builtin-rank`) are catalogued; `type.builtin-rank` is externally pinned to case 5.36 | **Agree.** Note the external pin: 5.36 is cited by the coordination doc (line 303) and may not be renumbered. |
| C-30 | 7 × 8 | T7 produces `field.unknown` / `field.type-mismatch` reasons; T8's three field fixtures assert them | **Agree on wording** (`"Invoice amount" needs a number.`, `This ticket's type has no such field. Add the field to the ticket type first.`). **Conflict on payload key:** T8's field fixtures must spell the CANDIDATE payload `fieldId` (parsed by T7's `checkTicketFieldSet` via `ticketFieldSetPayload`) while any PRIOR field_set uses the harness's `field` (**A16**, **ruling 8**). |
| C-31 | 7 × 14 | T7's `checks/fields.ts` and its refusals are catalogued | **No conflict.** |
| C-32 | 8 × 14 | T8's fixture filenames are cited by name in T14's test-cases | **Conflict on count arithmetic.** T14's commit message claims "thirty-one scenarios, thirty covered" while its own list runs 5.1–5.36. Whatever T8 and T6 actually ship must be what T14 cites; T14 dispatches last and reconciles both. |
| C-33 | 9 × 10 | T9 produces `getTicketTypeFromDb` and `ticketTypesProjection` (the registration anchor); T10 consumes both, and both modify `projections/index.ts` + `projection-order.test.ts` | **Agree on the dependency; conflict on mechanics.** Both use the non-existent `registerProjection`/`applyEvent`/`resetProjections` (**BA-1**), both omit `tables` (**A5**), both write `.js` migrations with too-small timestamps (**A3**), and both must extend the order-assertion array — so the array is edited twice, and the second edit must include the first (plus `proj_projects` per pre-ruling 6). Additional contract point: T12 needs `getTicketTypeFromDb` callable WITHOUT a `workspaceId` (**A12**), which T9's signature `(db, workspaceId, typeId)` does not permit — T9 must ship a by-id form or T12 must resolve the workspace first. |
| C-34 | 9 × 11 | Both register projections and both create migrations | **Same mechanics conflict as C-33.** No semantic overlap: `proj_rollups` never reads `proj_ticket_types`. Migration timestamps must be ordered `ticket-types < tickets < rollups` and all above `1787896601515`. |
| C-35 | 9 × 12 | T9 produces `getTicketTypeFromDb`; T12's `getEntityState('ticket-type', …)` consumes it | **CONFLICT.** T12 returns a full `TicketTypeDef` for kind `'ticket-type'` where the domain union says `OtherEntityState = { kind, id }` (`entity-state.ts:49-53`) — a type error, not a style question. It is also a REGRESSION risk: `'ticket-type'` is currently one of the four identity-only kinds served in FULL, so a naive rewrite that returns a def for it must still satisfy every existing reader. **ruling 3** decides the shape; until then T12 must keep `'ticket-type'` in `KINDS_WHOSE_STATE_IS_ONLY_IDENTITY` and expose the def through the widened method instead. |
| C-36 | 9 × 13 | T9's brief would CREATE `test/helpers/db.ts`; T13's tests consume it | **Conflict — resolved.** The helper ships (`createTestDatabase`), so T9 creates nothing and both use the shipped API (**A6**, **BA-8**). |
| C-37 | 9 × 14 | `proj_ticket_types` and `getTicketTypeFromDb` are catalogued | **No conflict.** |
| C-38 | 10 × 11 | T10 produces the `proj_tickets` table (`state_category`, `parent_id`, `project_id`, `workflow_id`); T11's `rollupsProjection` reads those columns in the SAME ingest transaction, requiring registration strictly after T10's | **Agree on the order requirement; two conflicts.** (a) T11's `ticket.reparented` handler reads `project_id` from `proj_tickets` and is correct ONLY because `ticketsProjection` already ran for that event and because cross-project reparents are refused elsewhere — neither guarantee is encoded in `rollups.ts`; state both, in the file, as the load-bearing cross-file assumption they are. (b) `workflow.defined`: T10 refolds tickets, T11 must recompute the affected parents in the same transaction — this only works if T11 is registered AFTER T10 and reads post-fold rows, which the pinned order gives. Both must also extend the order assertion (C-33). |
| C-39 | 10 × 12 | T10 produces `getTicketStateFromDb` / `getChildrenStatesFromDb`; T12 wires both into `EngineContext` | **CONFLICT on signature.** T10 defines them as `(db, workspaceId, id)`; T12's shipped context has NO `workspaceId` (**A12**/**BA-3**). Either T10 ships by-id forms returning the row's `workspace_id`, or T12 reads the workspace from `proj_entity_heads` first. **Decide in T10, before T12 is written** — T10 is the producer and dispatches first. |
| C-40 | 10 × 13 | T10 produces the `proj_tickets` table; T13 queries `ticket_id` for its 404 existence check | **Agree.** The only column T13 needs is `ticket_id`, which T10's PK provides. Note the tenancy question T13's brief does not raise: with no auth yet, a history read is not workspace-scoped — the check should still be written so a workspace predicate can be added by Plan 4 without changing the shape. |
| C-41 | 10 × 14 | `proj_tickets`, `applyTicketEvent`, refresh-on-publish and the as-of resolution are catalogued (cases 5.15–5.17, 5.27–5.33) | **Conflict on one bullet** — T14's "both projections resolve a workflow definition as of…" is false of `proj_rollups` (**O-catalogue-same-set**). 5.27 and 5.30 are externally pinned by Plan 5 and may not be renumbered. |
| C-42 | 11 × 12 | T11's `proj_rollups` counts children by category; T12's `getChildrenStates` returns child rows for the parent-terminal invariant | **Finding: two implementations of one question, and they must not drift.** The shipped invariant counts NON-terminal children (`transition.ts:92-101`), i.e. `totalChildren - terminalChildren`, while T11's `open_children` column counts `state_category = 'open'` only. **Nothing may read `open_children` as "the invariant's open children".** T12 must NOT be reimplemented on top of rollups; keep `getChildrenStates` a direct `proj_tickets` query, and document in `rollups.ts` which column means what. |
| C-43 | 11 × 14 | `proj_rollups` is catalogued (cases 5.32–5.33) | **No conflict**, except the shared bullet correction in C-41. |
| C-44 | 12 × 13 | Both need a real database handle in `apps/server` — T12 through the ingest transaction's `PoolClient`, T13 through a route needing `Pool` | **Related but not colliding.** T12 must NOT switch to a `Pool` (**A12**); T13 needs one for the route (**BA-5**). The read helpers T10 ships must therefore accept `Pool | PoolClient`, which T10's brief already types correctly (`db: Pool \| PoolClient`). **That part agrees.** The `AppDeps` widening is T13's alone. |
| C-45 | 12 × 14 | `EngineContext.getChildrenStates` / `getEntityState` are catalogued (case 5.18) | **No conflict.** |
| C-46 | 13 × 14 | `GET /v1/tickets/:id/history` and `routes/ticket-history.ts` are catalogued | **No conflict** on the path; the file lives at `apps/server/src/routes/ticket-history.ts` and registers through `app.ts`, not `server.ts` (**A13**) — T14's Features.md must not name a `server.ts`. |

---

## Per-task self-consistency

`internalContradictions` are carried **verbatim** from the extractions.

| Task | Self-consistent? | Findings |
|---|---|---|
| **3** | No — six | 1. "The interfaces list (line 10) says 'Consumes: … payload schemas (Task 2)' while code comments say FieldClaim/TicketState come from 'Plan 2's Task 2' — it is ambiguous whether the payload schemas and makeEnvelope also come from Plan 2's Task 2 or from this Plan 3's own Task 2; two different 'Task 2's appear to be conflated under the same label." · 2. "Step 6 claims 'Expected: PASS (14 tests) — the nine reducer/helper cases plus the five that pin refresh-on-publish', but the Step 1 test file as written contains only 13 `it(...)` blocks total (7 under applyTicketEvent + 1 under stateCategoryOf + 5 under foldTicketToWorkflowVersion = 13, not 14; and 7+1=8 'reducer/helper cases', not nine)." · 3. "ticket-state.ts's applyTicketEvent switch handles case 'ticket.workflow_rebound' calling `ticketWorkflowReboundPayload.parse(env.payload)`, but the top-of-file import list only pulls ticketAssignedPayload, ticketCollaboratorPayload, ticketCreatedPayload, ticketFieldSetPayload, ticketReparentedPayload, ticketTransitionedPayload from './events/ticket-events' — ticketWorkflowReboundPayload is never imported, so the file as specified references an undefined name." · 4. "ticket-state.ts imports `foldStateIdForward` from `'@gisik-nokma/domain'`, which is this same package's own public entry point per Step 5 (index.ts exports ./ticket-state and ./workflow-helpers) — a self-referential import of the package's own aggregate index from inside a source file of that same package, with no relative-path home ever named for where foldStateIdForward actually lives." · 5. "The test file casts WF2_DROPS_DOING `as unknown as WorkflowDef` specifically because it carries a `stateMapping` field, implying WorkflowDef (as typed) does not have that property — yet foldTicketToWorkflowVersion's implementation reads `target: WorkflowDef` (no cast) and relies on foldStateIdForward walking target's stateMapping, a type-level inconsistency the brief never resolves." · 6. "The doc comment above applyTicketEvent says the function 'produces the type, never redefines it' for TicketState, yet the header's 'Produces' block fully writes out `type TicketState = {...}` inline labeled only 'echoed for reference' — risking an implementer copying it verbatim into ticket-state.ts, contrary to the stated intent." — *Resolved by A9 (4, 5), A10 (3, partially), A17 (6), BA-9 (3, 4). Item 2's count is recomputed after the test file moves to `test/` and the entry shape is fixed.* |
| **4** | No — two | 1. "The brief's 'Interfaces > Consumes' line (line 9) lists only applyTicketEvent, TicketState, TicketStateDeps, TICKET_EVENT_TYPES, TicketTypeDef, ticketTypeDefSchema, makeEnvelope from Tasks 1-3/domain, plus WorkflowDef and EngineContext — but the Step 3 implementation code (line 152-154) imports and centrally relies on `foldTicketToWorkflowVersion` from @gisik-nokma/domain, which is never mentioned in the Consumes list despite being the load-bearing function for the entire 'workflow.defined re-folds tickets' semantics (design decision 10) that the brief spends a full paragraph justifying." · 2. "Step 3's import block (lines 151-154) does not import `EventEnvelope` from anywhere explicit in the Consumes line, yet the function signature `buildMemoryContext(seedWorkflows: WorkflowDef[], events: EventEnvelope[])` and the import statement `import type { EventEnvelope, TicketState, TicketStateDeps, TicketTypeDef, WorkflowDef } from '@gisik-nokma/domain'` assume EventEnvelope is exported from @gisik-nokma/domain, which is never listed as a consumed symbol in the Interfaces section." — *Both are omissions from the contract line, not code errors; both symbols are real exports. Fix the Consumes line (C-01).* |
| **4b** | Yes — no internal contradictions | Sourced from the brief rather than an extraction. Its two rulings are stated as settled, the refusal copy is pinned character-for-character with an interpolated example, the four required tests each name their own falsifiability proof, and the fixture requirement is explicitly conditional with an instruction to REPORT rather than ship a weaker proof. Two external obligations it carries correctly: the same-commit coordination-doc edit (R4) and the same-commit count bump if a fixture is added. **Gap noted at C-21:** it does not carry a Features.md / test-case entry for a user-visible new refusal. |
| **5** | No — three (two are staging artifacts) | 1. "Step 5's initial implementation guards parentId===null with `type.id === SUB_TASK_TYPE_ID` importing SUB_TASK_TYPE_ID from @gisik-nokma/domain, but the Step 2 test file (written before Step 5 in the brief's own sequence, and never revised) already includes the Step 7d custom-type-at-rank tests and Step 7b terminal-parent test appended later — the brief is internally sequenced as though Step 2 is the complete final test file, but Steps 7b and 7d each separately 'append' more tests/imports to hierarchy.test.ts after Step 2, meaning the file in Step 2 is not actually the complete test file despite being presented as the singular Step-2 deliverable; the brief does not restate the final combined file, only the diffs, so combining them correctly is left implicit." · 2. "Step 5's code comment says the parent-terminal check is 'Step 7c' and lists check order as '…cross-project → rank → parent-terminal' but the Step 7c insertion instruction places the terminal check 'after the rank check and immediately before the final return ACCEPT' — consistent, but note Step 5's inline comment already documents Step 7c/7e behavior before those steps are implemented, meaning the shipped Step-5-only code (before 7c/7e) would not match its own docstring/comment until later steps land; not a bug but a staged-narration artifact worth flagging." · 3. "The brief's file list only declares 'Modify: packages/rule-engine/src/evaluate.ts' but Step 7c also modifies packages/rule-engine/src/checks/refusals.ts (appending parentTerminalRefusal) and checks/hierarchy.ts (extending imports and logic) beyond their Step 4/5 initial-create content — these are still within files already listed as 'Create' so not a contradiction per se, but the brief's file list undercounts the number of distinct edits refusals.ts and hierarchy.ts receive (each is touched in at least two separate steps: 4/5 then 7c/7e), which is fine but not explicitly called out as multi-step edits in the file list." |
| **6** | No — three | 1. "Step 4b's checkTicketWorkflowRebound code imports EventEnvelope implicitly (used as a bare type in the function signature) but the brief's import list only shows `import { ticketWorkflowReboundPayload } from '@gisik-nokma/domain'; import type { EngineContext, EngineVerdict } from '../types';` — EventEnvelope is never imported in that snippet… as written the workflow-rebind.ts code block would fail to compile for a missing EventEnvelope import." · 2. "Step 5's expected count says PASS (8 tests) for reparent.test.ts after Step 3, but Step 1's test file as written contains 7 `it(...)` blocks … the stated count of 8 does not match the visible 7 `it(...)` occurrences." · 3. "Step 3's checkTicketReparented code calls `getTicketTypeDef` and references `DEEPEST_RANK`, `deepestRankParentRefusal`, and `rankRefusal` without importing them in the shown snippet — the brief says these come from 'Task 5' but does not show any import statement extension for them in Step 3 itself (only the domain import extension is mentioned), leaving the exact source path implicit/unstated within this file." — *Item 3 is the cross-task conflict C-22; `../types` in item 1 is A7.* |
| **7** | No — three | 1. "Step 5 says 'Run the tests to verify they pass' expecting PASS (10 tests) for fields.test.ts, but the file as specified contains 9 `it(...)` blocks … actually counting `it(` occurrences: 6 in Step 1 + 2 in Step 1a = 8 total, not 10 as the brief claims in Step 5's expected output." · 2. "customFieldVerdict's switch over CustomFieldDef['type'] has no default/fallback case for an unrecognized field.type value, yet the function's return type is EngineVerdict (not EngineVerdict \| undefined) — if CustomFieldDef.type is a union broader than the 5 handled kinds, TypeScript would need exhaustiveness satisfied; the brief does not address what happens if type-checking of this switch fails to be exhaustive." · 3. "getTicketTypeDef(ctx, ticket.typeId) is called with ticket.typeId, but the test fixture `created(TICKET, 'invoice', null)` passes 'invoice' as the type id argument and the field-existence checks … never explicitly test the ticket.unknown-type branch, so refuse('ticket.unknown-type') is unverified by any test in this brief despite being implemented." — *Item 2 is answered by shipped code: `CUSTOM_FIELD_KINDS` is exactly the five (`ticket-types.ts:4`), so the switch IS exhaustive — add a `never` guard so it stays so. Item 3 is a real coverage hole: add the test or delete the branch.* |
| **8** | No — three (two are "checked and found consistent") | 1. "Step 7's heading says 'all thirteen new fixtures' but also implicitly may require an expected.rule edit for parent-terminal-with-open-children — meaning the fixture file's committed content and the brief's own JSON listing (which hardcodes rule: 'parent-terminal-with-open-children') may not match what actually ships; the brief authorizes editing that one field post-hoc, so the JSON shown in Step 3 is provisional despite being given as if final." · 2. "The Files list and prose both count 13 create files, consistent with 'thirteen fixtures' in Interfaces and Step 7 — no count mismatch found … listed here only because it was a checked candidate for contradiction and found consistent." · 3. "Step 1's code comment says 'Only candidateEvent faces the engine' and Runner semantics section repeats this, consistent — but Step 5's cycle fixture relies on this exact rule … if a future task changes the runner to evaluate priorEvents too, this fixture's expected outcome silently becomes wrong with no test signal in this file." — *Item 1 is settled by the verified fact: the rule id IS `parent-terminal-with-open-children` (`refusal-rules.ts:14`), so no post-hoc edit is needed. Item 2's internal consistency does NOT survive contact with T6's two extra fixtures (C-28). The brief's largest problems are cross-task, not internal: BA-6 and O-fixture-ws1-flat-path.* |
| **9** | **Yes — none.** | The extractor found no internal contradiction. Every problem in this task is external: BA-1 (registration API), BA-8 (the helper already exists), A3 (`.sql` migrations, timestamps), A5 (missing `tables`), O-reset-lock-contract (DELETE vs TRUNCATE), and C-33 (the `workspaceId` parameter T12 cannot supply). |
| **10** | No — two | 1. "Step 5 says 'Expected: PASS (8 tests)' but the test file in Step 2 contains 9 `it(...)` blocks: … actually counting gives 10 `it` blocks, not 8, so the stated count of 8 does not match the enumerated tests either way." · 2. "loadDeps only sets `workflowId = current?.workflowId` when `env.type === 'ticket.transitioned'`, leaving it undefined for other ticket event types like ticket.workflow_rebound, ticket.reparented, ticket.assigned, ticket.field_set, ticket.collaborator_added — for those, `wfId` falls back to `type?.workflowId`, but `type` is only fetched when `typeId` is set (which only happens for ticket.created). So for a ticket.workflow_rebound event (tested explicitly in 'a rebound moves the one ticket it names'), loadDeps would resolve `workflow` to null … meaning applyTicketEvent must itself supply/read the toWorkflowId from the payload rather than depending on deps.getWorkflow, or the deps mechanism as written cannot service that transition. This is an apparent gap in the shown loadDeps implementation versus the test's expectations, not explicitly reconciled in the brief text." — *Item 2 is escalated to the cross-task conflict **C-07**: it is a contract disagreement with Task 3, not a T10-local bug, and must be settled before T3 writes `TicketStateDeps`.* |
| **11** | No — two | 1. "Step 4's rollupsProjection.apply for 'ticket.reparented' queries SELECT project_id FROM proj_tickets WHERE ticket_id = env.entity.id to find the project to recompute; this depends entirely on ticketsProjection having already run for the same event (per the load-bearing registration order) and on the brief's separate claim that cross-project reparents are refused elsewhere — neither guarantee is encoded or checked in rollups.ts itself, so the file is correct only by an unenforced cross-file assumption." · 2. "The Semantics section defines the invariant's 'open children' as totalChildren - terminalChildren (i.e., non-terminal, open+active combined), but the schema/RollupRow's own 'openChildren' field is populated only from state_category = 'open' (excluding 'active') — same phrase 'open children' denotes two different quantities within the same brief, with no explicit reconciliation, which could mislead an implementer about which field satisfies the parent-terminal invariant." — *Item 2 is SETTLED by shipped code: the invariant counts `stateCategory !== 'terminal'` (`transition.ts:92-101`), i.e. `totalChildren - terminalChildren`. `open_children` is a display column and is NOT the invariant's quantity — say so in `rollups.ts`. See C-42.* |
| **12** | No — two | 1. "Step 3's getWorkflowDef signature call is `getWorkflowDef(db, workspaceId, workflowId, version)` but the EngineContext method signature in the interface comment only shows `getWorkflowDef(workflowId, version)` with version's optionality unstated; the test at line 96 calls `ctx.getWorkflowDef('wf-basic')` with no version argument, so the implementation must treat version as optional/undefined-tolerant, which the brief never states explicitly for getWorkflowDef's underlying projection function." · 2. "The file header comment (Step 3) says 'Entity kinds owned by later plans (workspace, project, membership) resolve to null until those plans land,' but the implementation only branches on 'ticket' and 'ticket-type' and returns null for everything else — including 'workflow', which is a valid EngineContext-adjacent kind get via a separate getWorkflowDef method, not getEntityState; this is not strictly a contradiction but the comment's phrasing implies broader kind coverage than the switch shows." — *Item 1 is answered: `getWorkflowDefFromProjection(db, workflowId, select?)` already treats the selector as optional (`workflows.ts:74-108`), and the shipped context already passes `version` straight through. Item 2 is the regression BA-3 names: `workspace`/`project`/`workflow`/`ticket-type` are served TODAY as identity-only and must keep being served.* |
| **13** | No — two | 1. "Step 2's expected-failure text says the test fails because buildServer 404s 'before registration' or the module can't be found — but Step 1's test imports applyEvent, makeEnvelope, buildServer directly and would actually fail at test execution (route 404) rather than at import/module-resolution time … a minor imprecision in the described failure mode rather than a hard contradiction." · 2. "The 400 validation branch treats limit=0 as invalid ('non-negative integers' error) even though 0 is itself a non-negative integer — parseNonNegativeInt would accept '0' as valid (returns 0), but the route code explicitly re-checks `limitRaw === 0` and rejects it, which is inconsistent with the error message's own wording ('non-negative integers' implies 0 should be allowed)." — *Item 2 is a real copy/behaviour mismatch: either accept `limit=0` (returning an empty page) or reword the message to say limit must be a positive integer. Conservative: reword, keep the rejection.* |
| **14** | No — three | 1. "Step 3 says 'Run the full suite one last time' with expected PASS across packages/domain, packages/rule-engine, apps/server — but this brief (Task 14) never itself creates or modifies any test file; all referenced test files … are attributed to earlier tasks, so Task 14 cannot independently verify this pass/fail claim from its own Files list." · 2. "The commit message in Step 4 says 'thirty-one scenarios, thirty covered by the tests landing with them, one honestly out of scope' but the test-cases list in Step 2 runs 5.1 through 5.36 (36 numbered ids) — the count only reconciles if one reads it as 'thirty-one enumerated feature-relevant scenarios' after excluding some ids, but the brief does not show that arithmetic; a naive count of listed items (36 ids, 35 marked ✅ and 1 marked 🚫) does not match 'thirty-one… one out of scope' at face value." · 3. "Open question 9 references 'getWorkflowDefAsOf(db, workspaceId, workflowId, asOfWorkspaceSeq)' as the fix already applied by 'passes the current event's workspaceSeq', implying Tasks 10-11 already did this — yet the Numbering note and Step 1 text present the whole feature list (including this fix) as newly-landing work in this same change set, creating ambiguity over whether the as-of fix is prior-shipped code being catalogued or code this task set is still producing." — *Item 3 is settled: the as-of selector is SHIPPED (`workflows.ts:72-108`), so Open question 9 is answered by existing code and Features.md must describe the selector, not a `getWorkflowDefAsOf` function (BA-2). Item 2's arithmetic must be recomputed against what T6/T8 actually ship (C-32). Item 1 stands: T14 recounts and reruns, it does not originate the evidence.* |

---

## Rulings needed before Task 3 dispatches

Each names the conservative option, per the autonomous execution protocol (ruling 3: conservative
default, recorded in the coordination doc **in the same change set**, owner push-notified).
**Rulings 1 and 2 gate the first dispatches; rulings 3 through 8 gate later ones but are cheapest
to settle now, while the whole lane is in view.**

1. **`TicketStateDeps` / the rebound workflow lookup (C-07) — blocks Task 3.** T3's reducer calls `deps.getWorkflow(p.toWorkflowId)` for `ticket.workflow_rebound`; T10's `loadDeps` never fetches by the payload's `toWorkflowId`, so the server path resolves null and throws on the very event T10 tests. **Conservative option:** keep `TicketStateDeps.getWorkflow(workflowId)` a pure by-id lookup (no caller-side pre-selection), and require T10's `loadDeps` to serve ANY workflow id asked for — reading `toWorkflowId` off the rebound payload and `current.workflowId` otherwise. The reducer stays the only place that knows which id an event needs.

2. **`FoldedState` break-version: take it or record the decline (O-foldedstate-version) — blocks Task 3.** Plan 3 is the next plan to touch the fold; the stranded-state refusal currently names a state id against the wrong version's vocabulary, and T3 inherits the inaccuracy into its own message (t3:549). **Conservative option:** DECLINE the surface change (it is a cross-plan type change touching `workflow.ts:84` and every consumer, and Plan 3 has no three-version fixture yet), and record the decline — with the reason and the trigger that should reopen it — in the coordination doc **in the same commit as Task 3**. Folding the id back to the origin version remains forbidden either way.

3. **`EngineContext` widening for ticket types (BA-4, C-11/C-15/C-25/C-35) — blocks Task 4.** `'ticket-type'` is `{ kind, id }`; no hierarchy rank check is implementable through the shipped context. Two options: (a) add `getTicketTypeDef(typeId): Promise<TicketTypeDef | null>` to `EngineContext` (`engine.ts:7-11`), implemented in the memory context, the fixture harness AND `apps/server/src/engine-context.ts`; (b) promote `'ticket-type'` out of `OtherEntityState` into a real `TicketTypeState` in the domain union. **Conservative option: (a)** — it is additive, leaves the shipped union and the four identity-only kinds untouched, and cannot regress any existing reader of `getEntityState`. It must be ruled before T4 writes `MemoryContext`, because T4 is the first implementation.

4. **Projection `reset()`: TRUNCATE or DELETE-plus-re-derivation (O-reset-lock-contract) — blocks Task 9.** All three projection briefs ship DELETE; both shipped projections use TRUNCATE, and the entity↔workspace tenancy door's safety argument rests on it. **Conservative option: TRUNCATE**, matching shipped code — nothing in these three tables needs identity or FK preservation, and it costs Plan 3 nothing. Choosing DELETE means Plan 3 owns re-deriving the tenancy contract (Plan 2 §5), which is unpriced work.

5. **Fixture `workspaceId` (O-fixture-ws1-flat-path) — blocks Task 6/8 fixture authoring.** All 13 T8 fixtures hardcode a ULID `workspaceId`, the exact override `harness.ts:168-183` warns yields a null membership and a legitimate-looking-but-wrong refusal. **Conservative option: OMIT `workspaceId` entirely** and let `completeEnvelope` default it to `ws_1`, as every shipped fixture does. This contradicts T8's `exactStrings`, so it is a ruling, not an implementer's judgement call.

6. **Fixture-count arithmetic, pinned per commit (O-fixture-count, C-28) — blocks the first fixture commit.** The gate is 61. Plan 3's delta spans T6 (2), T8 (13) and T4b (0 or 1). **Conservative option:** each task bumps the gate by its OWN delta in its own commit and states that delta in its commit message; the controller tracks the running total (61 → 63 after T6 → 76 after T8 → 76/77 after T4b) and the cross-lane merge with Plan 4 is resolved arithmetically per pre-ruling 6. No task may write an absolute number it did not compute from the directory at its own commit time.

7. **`AppDeps` shape for Task 13 (BA-5) — blocks Task 13.** The route needs `db.query(sql, params)`; `AppDeps.db` is a one-argument healthcheck shim. **Conservative option:** ADD a `pool: Pool` field to `AppDeps`, leaving `db: HealthDb` untouched — the narrower change, touching `apps/server/src/index.ts` and the `buildApp` call sites additively rather than retyping an existing field that the healthcheck and its tests depend on.

8. **Harness field key `field` vs `fieldId` (A16, C-30) — blocks Task 7/8 fixture authoring.** The harness's prior-event parser uses `field`; the domain schema uses `fieldId`. **Conservative option: KEEP THE SPLIT** — candidates use `fieldId`, priors use `field` — and add a comment at `harness.ts:155` saying why the two spellings are deliberate. Renaming touches shipped fixtures and `test/harness.test.ts:50` for cosmetic uniformity, which is scope Plan 3 was not given.

---

## Not re-opened here (already ruled)

Recorded so no downstream agent re-requests a decision the controller has made
(`progress.md`, "Pre-flight rulings", 2026-08-28):

- **R1 / R1a — RDU fails CLOSED**, refusal copy pinned in `task-4b-brief.md`, and the comment at `require-different-user.ts:51-58` rewritten in the same change. Discharges **O-rdu-fail-closed**.
- **R2 — RDU sorts a COPY of candidate entries by ascending `seq`** at the point of use, never mutating `input.ticket.transitions`. Discharges **O-rdu-seq-order**.
- **R3 — the work lands in a dedicated Task 4b**, dispatched after Task 4 and before Task 5; implementer opus-high, reviewer `fable`.
- **R4 — the coordination-doc edits discharging Plan 2 §3 and §4 land in the SAME commit as the RDU code**, not as a follow-up and not only in the gitignored ledger.

---

## Addendum 1 — A10 sharpened (cross-lane, verified by lane 4 across all five Plan 6 sites)

**`ticket.transitioned` carries TWO independent divergences from the plan text, not one.** A10's row
already names both, but the failure MODE was not stated and it is what makes this dangerous:

1. the destination field is **`to`**, not `toStateId`; and
2. **`comment` is `{ text }`, not a bare string.**

**A transcription that fixes only the field name is still refused — with a DIFFERENT error, arriving
later, at the moment the first fix looks like it worked.** Correct both or neither. Lane 4 verified
this independently across every Plan 6 occurrence.

Where it bites in this lane: T3 reads payloads (lower stakes, but its reducer tests still construct
them), while **T8, T10 and T11 BUILD payloads** — fixtures and projection tests. Every
`ticket.transitioned` payload authored in those tasks uses `{ "to": "...", "comment": { "text": "..." } }`.
Carry this verbatim in the T8/T10/T11 dispatches.

Unchanged and still correct in their own layers: the transition LOG ENTRY keeps `toStateId`, and
`ticket.workflow_rebound`'s payload genuinely is `{ toWorkflowId, toStateId }`.

---

## Addendum 2 — mutate TRANSCRIBED fixtures, not only authored ones (cross-lane, from lane 3)

**Binding on T6 (2 fixtures) and T8 (~13 fixtures), which are the tasks that transcribe fixture
JSON straight out of plan text.**

Lane 3 mutated the fixtures Plan 7 Task 2 ships as pinned text and found **four surviving mutants**
its own specified cases do not catch — including a discriminator (`type === 'image'`) that could be
**deleted entirely with all seven cases still green**. A walker that also harvested mention ids would
therefore have silently changed what a server gate checks, with a green suite.

The generalisation, which is correct and is the part to act on:

> A fixture that **agrees with** the implementation is not the same as a fixture that **constrains**
> it. Fixtures arriving pre-written in plan text read authoritative, so they are the ones least
> likely to be interrogated — and both instances were found by MUTATING a transcribed fixture, never
> by reading it.

So the falsifiability discipline this lane already carries applies **with equal force to fixture
blocks copied verbatim from the plan**. For every fixture T6 and T8 ship:

1. Mutate the production code path the fixture claims to pin, and confirm the fixture goes RED **at
   its own expected outcome**, not at setup or parse.
2. Where a fixture's expected outcome is a refusal, confirm it fails for the *named* rule — a
   fixture that would still refuse after the check under test is deleted is pinning something else.
3. If a fixture cannot be made to fail by any mutation of the code it claims to cover, it agrees
   without constraining: **report it, do not ship it silently.** That is the standing rule, and a
   transcribed fixture does not get an exemption for looking authoritative.
4. Restorations verified by reading the file or `git diff` — never a shell `diff`.

---

## Addendum 3 — test-count drift: resolve by LITERAL COUNT, never the reverse (series ruling)

Series-wide ruling from lane 2's pre-flight, adopted here: **where a brief's stated test count
disagrees with the number of `it` blocks actually written, the literal count wins and the plan's
number is corrected. Never delete a test to make a stated total come true.**

The defect is not the wrong number — it is the repair it invites. An executor who trusts a stated
total and finds one test MORE than expected has an obvious tidy-up available, and taking it deletes
coverage somebody wrote deliberately.

**This lane already has the per-task data, and the direction matters.** From the Per-task
self-consistency section above, Plan 3's stated-vs-actual counts split into two groups:

| Task | Stated | Actual | Direction | Risk |
|---|---|---|---|---|
| 3 | 14 | 13 | stated ABOVE | low — an executor writes more or recounts; **T3 shipped 23, recounted** |
| 5 | 10 | 9 (really 8) | stated ABOVE | low |
| 6 | 8 | 7 | stated ABOVE | low |
| 7 | 10 | 9 (really 8) | stated ABOVE | low |
| **10** | **8** | **9–10** | **stated BELOW** | **HIGH — invites deletion. Floor-list task.** |
| **14** | **31 scenarios** | **36 ids (5.1–5.36)** | **stated BELOW** | **HIGH — invites deleting case ids, and 5.27/5.30/5.36 are externally cited** |

**T10 and T14 carry the dangerous direction and must be told so explicitly in their dispatches.**
T14's is worse than a count: ids **5.27** and **5.30** are cited by Plan 5, and **5.36** by the
coordination doc. Deleting a case to reach "thirty-one" would break a cross-plan citation.

Note this is the **inverse pressure** to Addendum 2. There the danger is a test that cannot fail;
here it is a test that gets deleted for being unexpected. Both arrive out of authoritative-looking
plan text, and the resolution is the same in both directions: **the code and the literal file are the
authority; the plan's number is a claim about them.**

---

## Addendum 4 — `packages/domain/src/envelope.ts`: lane 1 is a pure consumer (no collision)

Wave 1's real collision surface is `envelope.ts`, which no pre-ruling covers. Plan 4's lane owes it
two amendments (a kind-aware entity-id check so the composite membership id `${workspaceId}:${userId}`
can be submitted at all, and `'invite'` joining the closed `ENTITY_KINDS`), landing early and
additively; other lanes rebase onto them rather than editing in parallel.

**Verified for this lane: Plan 3 does not edit `envelope.ts`.** Its single reference across all
twelve briefs is a type-only import of `EventEnvelope` in T3 (`task-3-brief.md:321`), already landed.
No brief lists it under Modify; no brief references `ENTITY_KINDS` or `ulidString`. **Lane 1 rebases
onto Plan 4's amendments and edits nothing there.** If a later task's work turns that reference into
an edit, coordinate through the cross-lane controller first.

**One trap that rides with this file, for T9–T13.** `submittedEventSchema` types the entity id as
`ulidString` (`envelope.ts:53,75`), so **any event going through `parseEvent`/ingest needs a
ULID-shaped `entity.id`**. Fixture ids like `t1`/`ws_1` are fine in `packages/rule-engine/fixtures/`
because the harness enters at `evaluateEvent` and never passes that door — but a server test that
ingests a ticket event with a short id is refused at the door for a reason that has nothing to do
with what the test is trying to prove. Use the shipped server-test helpers' id shapes, not the
fixture dialect. (Related, already binding: A14 requires ULID-shaped ids in fixture PAYLOAD fields
that are themselves `ulidString`, such as `ticketCreatedPayload.projectId`/`parentId`.)

### Addendum 3a — the per-file clause, and T10 checked against it

The count rule's operative form is **resolve by literal block count PER FILE, not per task**, and
correct the plan's number rather than the tests. The false-positive shape to expect: a task split
across two packages states its halves separately, so 6 blocks against a stated 4 can be entirely
correct. Deleting two would be exactly the coverage loss the rule exists to prevent.

**T10 checked against that clause and it is NOT a false positive — the drift is real.**

- The brief names exactly **one** test file: `apps/server/test/proj-tickets.test.ts`
  (`task-10-brief.md:6`, `:74`, `:393`, `:585`, and the `git add` at `:591`).
- It contains **10 `it` blocks**, all in that single file (`task-10-brief.md:238, 249, 263, 269, 284,
  296, 321, 336, 346, 359`).
- Its one stated expectation is **`Expected: PASS (8 tests)`** (`task-10-brief.md:586`).

10 blocks, one file, stated 8. No second package, no separately-stated half. **T10's dispatch keeps
the stated-BELOW warning: write all ten, correct the number, delete nothing.** Two of the blocks an
executor might "tidy away" are `:346` (the fold leaves the transition log alone) and `:359` (the
planted-defect projection-outer replay) — the two that pin design decision 10, which is the whole
reason this task is on the floor list.

**T14 re-checked:** 36 case-id occurrences in `task-14-brief.md` against a stated "thirty-one
scenarios". Not a per-file artifact — case ids are not test blocks. The earlier read stands, and the
citation risk is now verified rather than assumed: **5.27 and 5.30** are cited at
`docs/superpowers/plans/2026-08-20-05-api-realtime-search.md:6158` and coordination doc line 213;
**5.36** at coordination doc line 303. Deleting case ids to reach thirty-one breaks two other
documents' references — strictly worse than an inaccurate count.

---

## Addendum 5 — CORRECTION to C-12, and three facts Task 4 established

**C-12's parenthetical is WRONG and must not be inherited by T6's dispatch.** It says Task 4's
context "does not fold `ticket.reparented`". **It does.** `buildMemoryContext`'s dispatch is over
`TICKET_EVENT_TYPES` (all ten), and a test plus mutation M12 pin the reparent branch. The
"does not fold reparents" fact belongs to the **fixture harness** (A15's list), not to the memory
context. An implementer inheriting that clause verbatim would design around a constraint that does
not exist. **Operative form: T6 MAY replay `ticket.reparented` through `buildMemoryContext`; it may
NOT through the fixture harness until Task 8 extends `applyPriorEvent`.**

**The harness's `getTicketTypeDef` THROWS, deliberately — binding on T5, T6, T7.** Ruling P3's
widening required all four `EngineContext` literals to be filled. Task 4 made the fixture harness's
implementation **throw** (naming Task 8 and `applyPriorEvent`) rather than return `null`.
**Do not "fix" that throw by returning null.** A null there is precisely the silent,
legitimate-looking-but-wrong refusal that `harness.ts:168-183` warns about in its own voice: the
check would refuse for a reason unrelated to what the fixture is proving. A fixture reaching a rank
check means the harness needs Task 8's extension — that is the throw telling the truth. The SERVER
stub returns `null` instead, matching its two siblings, because a throw there would 500 a live
ingest.

**`workflowDefSchema` silently STRIPS `stateMapping` — parse with `workflowDefinedPayloadSchema`.**
The brief's `env.payload as WorkflowDef` looks harmless and is not: `stateMapping` lives on
`workflowDefinedPayloadSchema` (alias `PublishedWorkflowDef`), and parsing a `workflow.defined`
payload with the narrower schema drops it silently, so a version chain stops folding with no error.
Exactly one Task 4 test catches it (mutation M4). **Binding on T10 and T11**, which parse
`workflow.defined` payloads in their projections.

**"Latest" now means HIGHEST VERSION, not last-published**, in the memory context — for parity with
the harness's `latestOf` (C-15). **T10's reviewer must check this against the server's
`getWorkflowDefFromProjection`**: if the DB-backed reader's no-selector branch resolves "latest" by
any other ordering, the memory context and the server disagree about what the same rule sees, which
is the one divergence the shared-fixture promise exists to forbid.

---

## Addendum 6 — Task 12's brief instructs ruling P3's REJECTED alternative. These three lines are superseded.

Found by Task 4's review. Ruling P3 widened `EngineContext` with `getTicketTypeDef` **instead of**
growing a full `TicketTypeDef` out of `getEntityState('ticket-type', …)`. Task 4 corrected the
comment in `apps/server/src/engine-context.ts` that pointed at the rejected shape — but **a Task 12
implementer reads its brief, not that comment**, and the brief still says:

| Brief line | What it instructs | Status |
|---|---|---|
| `task-12-brief.md:92` | `const type = (await ctx.getEntityState('ticket-type', 'task')) as { rank: number … }` | **SUPERSEDED** |
| `task-12-brief.md:136` | `import { getTicketTypeFromDb }` for use inside `getEntityState` | **SUPERSEDED** as written |
| `task-12-brief.md:151` | `if (kind === 'ticket-type') return getTicketTypeFromDb(db, workspaceId, id);` | **SUPERSEDED** |

**Binding replacement.** `'ticket-type'` STAYS in `KINDS_WHOSE_STATE_IS_ONLY_IDENTITY` and
`getEntityState('ticket-type', id)` keeps returning `{ kind, id }`. The definition is served by the
**fourth method**, `getTicketTypeDef(typeId)`, which Task 12 backs with `proj_ticket_types`. The
`as { rank: number }` cast at `:92` is doubly forbidden — it is the rejected shape AND a
shape-forcing cast, which this lane prohibits because it removes the compile error that is the net.

**Why the rejected alternative must not creep back:** promoting `'ticket-type'` out of
`OtherEntityState` rewrites a domain union three lanes are reading concurrently, and it would
regress every existing reader of the four identity-only kinds. Task 4's mutation **M8** exists
specifically to kill this creeping back in through `getEntityState`.

**Task 12 aligns ALL THREE `EngineContext` implementations in one change set** — server,
memory context, fixture harness — extending its own brief's "neither may land without the other"
from two methods to the full set. See Ruling P9 below.

### Riders from Task 4's review, routed

- **→ T5 (⚠️-3):** `SpyCounts` in `test/engine.test.ts:68` adds a `getTicketTypeDef` spy but
  deliberately omits it from `counts()`/`calls()`. **The first rank check that calls it must add it**,
  or every "N context calls" assertion silently stops being total.
- **→ T7 (⚠️-4):** the harness's deliberate throw means a fixture proving "`ticket.created` with an
  unknown type is refused" **cannot** be written against `buildInMemoryContext` before Task 8 — it
  throws rather than refuses. T7's known coverage hole (`refuse('ticket.unknown-type')`, its
  self-consistency item 3) must therefore be closed by a **memory-context unit test, not a fixture**.
- **→ T8 (⚠️-2):** A14 scopes the harness extension to `ticket-type.defined` and `ticket.reparented`,
  which keeps the two in-memory contexts welded. **If Task 8 admits `workflow.defined` into the
  harness dialect, it MUST carry the `foldTicketToWorkflowVersion` loop with it** — otherwise the
  harness and the memory context split at exactly the seam Task 4 exists to weld.
- **→ T14 (⚠️-5):** C-16 pins only the test-case path. `buildMemoryContext` is a new ⚙️ subsystem
  exported from the package root, and the `EngineContext` widening is a **cross-package contract
  change**. Task 14 must catalogue BOTH in `Features.md` §5; nothing currently obliges it to.
- **→ T10 (discharged early, no action):** Addendum 5 asked T10's reviewer to check the
  "latest = highest version" parity against the server. Task 4's review verified it directly:
  `apps/server/src/projections/workflows.ts:82-85` is `ORDER BY version DESC LIMIT 1`. Memory,
  harness and server agree three ways. **The brief's `workflows.set(def.id, def)` would have
  diverged from the SERVER, not merely the harness.**

---

## Addendum 7 — the `z.unknown()` presence hole, and `envelope.ts` rebase timing

**`z.unknown()` does not require the key.** Probed against this repo's own zod:

```
z.object({ fieldId: z.string().min(1), value: z.unknown() })
  { fieldId: 'title' }                    -> ACCEPTED, key absent
  { fieldId: 'title', value: null }       -> ACCEPTED, value null
  { fieldId: 'title', value: undefined }  -> ACCEPTED, key present
```

Lane 2 found this in `submittedEventSchema.payload` (`packages/domain/src/envelope.ts:78`) — an event
carrying no payload is admitted, and `JSON.stringify` erases the absence. **It exists a second time,
inside Plan 3's own surface:** `ticketFieldSetPayload.value`
(`packages/domain/src/events/ticket-events.ts:33`). Checked and cleared: `commentAddedPayload`'s
`body` is `z.record(z.string(), z.unknown())`, where the RECORD is required and only its values are
unknown — not the same defect. Those are the only three `z.unknown()` uses in domain.

**Consequence for T7, which owns `ticket.field_set`.** Task 3's reducer does `p.value ?? null`
(`ticket-state.ts:203`, brief-mandated), so a payload **omitting** `value` records a null clearing
claim **nobody made** — a fabricated claim, against spec invariant 4 ("nothing is invented"). For
`title` the follow-on `field.title-required` masks it; for every other field it silently clears.

**T7's resolution is pinned to lane 2's four-case matrix**, so the two doors answer alike rather than
each inventing a rule:

| Case | Verdict | Why |
|---|---|---|
| `value` absent | **refuse** | no claim was made; recording one invents it |
| `value` present but `undefined` | **refuse** | the wire cannot distinguish this from absent |
| `value: null` | **accept** | null is still a claim — the explicit clearing claim design decision 3 sanctions |
| `value: {}` / any value | **accept** | an empty claim is still a claim |

T7 argues this in its report and cites lane 2's envelope matrix as the precedent it is matching.

**`envelope.ts` rebase timing (no action, schedule only).** Lane 2 confirms **Plan 4 Task 3 is the
last amendment planned for that file** — T14's invite share was pulled forward so it moves once, not
twice. After T3 it carries all three changes: the kind-aware composite membership entity id,
`'invite'` in `ENTITY_KINDS`, and the payload-presence check. **Lane 1 rebases onto it ONCE, after
T3 lands, rather than tracking it.** Lane 1 remains a pure consumer (Addendum 4).

**Binding on T9–T13**, which construct envelopes in server tests. After Plan 4 T3 the door becomes
**kind-sensitive** for entity ids (composite accepted only for `membership`; every other kind
byte-identical to today) **and payload-presence-checked**. A server test that omits a payload
entirely will start being refused where it passed before. This is the second dimension of the
ULID-dialect trap in Addendum 4: **one fixture dialect, one door dialect, and the gap stays invisible
until something crosses the door.**

### Addendum 7a — the full sweep, and a FIX-ORDER FLOOR for T7/T8

My Addendum 7 sweep was scoped to `packages/domain/src` and therefore incomplete. The full sweep
across `packages/` and `apps/` (excluding `node_modules` and `dist`) finds **five `z.unknown()`
sites, four of them defective:**

| Site | Owner | Status |
|---|---|---|
| `packages/domain/src/envelope.ts:78` | **lane 2**, Plan 4 T3 | the envelope payload-presence hole |
| `packages/domain/src/events/ticket-events.ts:33` | **T7** | `ticketFieldSetPayload.value` |
| `packages/rule-engine/src/fixtures/harness.ts:32` | **T8** | the fixture envelope's own `payload` |
| `packages/rule-engine/src/fixtures/harness.ts:155` | **T8** | `ticketFieldSetFixturePayloadSchema.value` |
| `packages/domain/src/events/ticket-events.ts:38` | — | **NOT the defect** — `z.record(z.string(), z.unknown())` requires the record; only its values are unconstrained |

**The harness does not merely share the hole — it reproduces the fabrication exactly.**
`harness.ts:308` is `value: payload.value ?? null`, character-for-character the same construction as
the production reducer at `ticket-state.ts:201`. So a fixture omitting `value` is accepted by the
harness, records the same fabricated null clearing claim, and **agrees with production** — Addendum 2's
"agrees without constraining" in its purest form. **The falsifiability substrate shares the defect it
exists to catch, so no fixture can currently witness the difference between the two doors.**

**FIX-ORDER FLOOR, binding:**

1. **T7** fixes `ticket-events.ts:33` to the four-case matrix and proves it with **unit tests**, which
   do not pass through the harness and are therefore capable of failing.
2. **T8** fixes the harness pair (`:32` and `:155`) to the same matrix **BEFORE** authoring any
   fixture intended to prove the door's behaviour. A fixture written against the loose harness proves
   nothing, whatever the production schema does.

**Falsifiability shape for both** (mirroring lane 2's, so the three doors are proven alike): implement
the matrix as **four assertions, not "make the field required"** — so the two acceptances (`null`,
`{}`) are deliberate rather than incidental — and mutate by **reverting to bare `z.unknown()`,
watching the ABSENT case fail specifically**. A mutation that kills only the present-but-undefined
case has not proven the thing that matters.

---

## Addendum 8 — the complete harness-vs-domain schema comparison, and the presence/format discriminator

Run once, with both files open, so **T8 inherits the list rather than a search.** Every fixture
payload schema in `packages/rule-engine/src/fixtures/harness.ts` against the domain schema it mirrors.

| Field | Harness | Domain | Divergence class |
|---|---|---|---|
| `ticketCreated.parentId` | `z.string().nullable().optional()` (`:140`) | `ulidString.nullable()` — **required** (`ticket-events.ts:19`) | **PRESENCE — defect** |
| `ticketCreated.typeId` / `projectId` / `title` | absent entirely | all required (`:17,18,20`) | **PRESENCE — defect** (A14 already requires T8 to add them; they must be **required**, not optional) |
| `ticketCreated.workflowId` | `z.string()` required (`:138`) | not in the domain schema at all | **Harness-only affordance — deliberate.** A fixture must bind a workflow directly; there is no ticket-type projection in memory. Keep. |
| `ticketCreated.stateId` / `stateCategory` | optional (`:143-144`) | absent | **Harness-only planting overrides — deliberate**, and named as such in the file's own comment. Keep. |
| `partialEnvelope.payload` | `z.unknown()` (`:32`) | `z.unknown()` (`envelope.ts:78`) | **PRESENCE — defect**, both sides (lane 2 fixes the domain half at Plan 4 T3) |
| `ticketFieldSet.value` | `z.unknown()` (`:155`) | `z.unknown()` (`ticket-events.ts:33`) | **PRESENCE — defect**, both sides |
| `ticketFieldSet` key name | `field` | `fieldId` | **Deliberate split** — Ruling P8, A16. Keep, with the comment P8 requires. |
| `ticketAssigned.assigneeId` | `z.string().nullable()` (`:154`) | `z.string().min(1).nullable()` (`:23`) | **FORMAT — deliberate.** Harness admits `''`; no fixture uses it. |
| `ticketWorkflowRebound.*` | `z.string()` ×2 (`:150-151`) | `z.string().min(1)` ×2 (`:97-100`) | **FORMAT — deliberate** |
| `ticketTransitioned` | `{ to: z.string() }` (`:147`) | `{ to, comment?: {text}, evidenceAttachmentId?, cause? }` (`workflow.ts:137-145`) | **Not a divergence that bites** — non-strict, and the CANDIDATE is parsed by the domain schema. See the floor refinement below. |
| `ticketReparented` | **absent** — A14 has T8 add it | `{ newParentId: ulidString.nullable() }` — required (`:35`) | **T8 must mirror PRESENCE**: required-nullable, never optional |

### Ruling P10 — the discriminator that makes this answerable without running anything

**A harness schema may diverge from its domain twin in VALUE FORMAT. It may not diverge in
PRESENCE.**

- **Format divergence is deliberate and load-bearing.** Fixtures use short ids (`t1`, `ws_1`) because
  they enter at `evaluateEvent` and never pass `parseEvent`'s door (Addendum 4). Tightening
  `z.string()` to `ulidString` would invalidate all 62 shipped fixtures for no gain.
- **Presence divergence has no purpose and is always a defect.** It lets a fixture stage a prior state
  the real door would refuse, so the suite proves a world the server cannot reach.

This is the exact parallel of the peer's `?? null` discriminator (*`?? null` fabricates only where
`null` means a deliberate act, not where it is a state field's natural absence-default*). Both turn a
grep into a question a reader answers by looking.

### Refinement to the fix-order floor (Addendum 7a) — narrower than first stated, VERIFIED

`packages/rule-engine/test/fixtures.test.ts:19` is
`evaluateEvent(completeCandidate(fx), buildInMemoryContext(fx))`, and `applyPriorEvent`
(`harness.ts:170,215`) handles **priors only**. So:

- **A CANDIDATE-position event is judged by the real domain schema**, never by the harness payload
  schema. A fixture whose candidate is a `ticket.field_set` omitting `value` therefore **CAN** prove
  T7's matrix today — it reaches `checkTicketFieldSet` and the domain door.
- **The harness schemas gate PRIOR-event staging only.** That is where the looseness bites: a prior
  that stages a state the real door would refuse builds a world the server cannot produce.

**Revised floor:** T8 must fix the harness pair before writing a fixture whose **prior events** depend
on the tightened behaviour, and before any fixture is taken as evidence that *the harness and the
production door agree*. A single candidate-position refusal fixture for T7's matrix does not need to
wait. The harness fix is still required — a prior door looser than the real door is a defect on its
own terms — but it does not block T7's end-to-end proof.

---

## Addendum 9 — Rulings P11/P12 propagate to Task 6, and a total-outage trap for Task 12

Found by Task 5's fix round while applying P11/P12. Both are **binding**.

### T6 carries the SAME two defects, and one of them is worse there

- **`task-6-brief.md:176` is `if (!parentType) return refuse('ticket.unknown-type')`** — byte-identical
  to the P11 violation just fixed in Task 5. **Superseded:** refuse with
  **`hierarchy.parent-type-unknown`** (minted in Task 5's `refusals.ts`, parent as the subject).
- **T6's `newParentId` resolution carries no workspace guard at all.** Apply **P12**: fold
  `parent.workspaceId !== env.workspaceId` into `hierarchy.unknown-parent`, so the two ways of not
  existing here give literally the same answer and neither confirms a foreign ticket id.

**Why it is worse on reparent than on create:** a create that resolves a foreign parent merely fails
to make a new ticket. **A reparent grafts an EXISTING ticket under a foreign parent** — a live ticket
moved into another workspace's hierarchy, refused (if at all) with a sentence about projects.

### T12: `rowToTicketState` MUST populate `workspaceId`, or parented creation is a total outage

A17 already requires it. P12 makes omitting it catastrophic rather than cosmetic: the guard is
`parent.workspaceId !== env.workspaceId`, and **`undefined !== env.workspaceId` is always true**, so a
missing field refuses **every parented `ticket.created` on the server**. The failure presents as a
data problem, not as a mapping bug — nothing in the message points at the projection row. `workspaceId`
is carried by no DB column implicitly; `rowToTicketState` must set it explicitly, alongside
`kind: 'ticket'`. **T12 meets `apps/server/test/engine-context.test.ts` before it writes
`rowToTicketState`, so the routing is already in its path.**

### Catalogue state after Task 5 (T14 reconciles against this, never renumbering)

`test-cases/05-tickets-hierarchy.md` now holds **5.37** (the keystone's, pre-existing), **5.38**
(duplicate create refused) and **5.39** (the two refusals that used to fire with somebody else's
sentence). The 5.4–5.36 reservation is intact and the externally-cited 5.27/5.30/5.36 were never
touched.

### Addendum 9a — riders from Task 5's scoped re-review

- **→ T6: close the order-pin gap P11/P12 opened.** The new checks are mutation-proven for existence
  and copy, but **prose-pinned only for chain position** in one place: a mutation hoisting the
  parent-type guard above the cross-project check passes the whole suite, because no test stages
  `cross-project` and `parent-type-unknown` simultaneously. (`parent-type` ↔ `rank` is unstageable by
  construction — the rank check needs `parentType`.) One hand-built ctx closes it: a parent whose type
  is missing AND whose `projectId` differs.
- **→ T6: hoist `createdIn`.** It is local to `test/hierarchy.test.ts:27` and T6 needs the identical
  helper. Move it to `checks/test-support.ts` when T6 lands, rather than copying it.
- **→ T8: `harness.ts:238` hardcodes `projectId: 'prj_1'`** on every prior-event ticket — a trap for
  parented-create fixtures under C-24, since every fixture ticket lands in one project and a
  cross-project scenario cannot be staged without extending the harness. Belongs with T8's other
  harness work (Addendum 8's presence list).
- **Ruling P5 gains a SECOND reason.** The coordination doc's ws_1 fixture rule is currently justified
  only by the restrict-to refusal. After P12 an overridden fixture `workspaceId` also yields a
  **legitimate-looking `hierarchy.unknown-parent`** — the parent resolves but fails the workspace
  guard. Two independent silent-wrong-refusal paths now depend on omitting `workspaceId`, which
  strengthens P5 from a convention into a requirement.
- **Rider, NOT a fix (verified non-blocking): the own-entity sibling of P12.** `hierarchy.ts:82`
  (`ticket.already-exists`) reads `getTicketState(ctx, env.entity.id)` with no workspace predicate, so
  in principle it can confirm a foreign id — the same shape P12 closed on the parent. It is unreachable
  in both real consumers: the server's G2 door answers `entity-workspace-mismatch` **before**
  `deps.evaluate` (`apps/server/src/ingest/ingest-service.ts:109-120`), and Plan 10's replica is
  workspace-scoped by construction. Recorded so it is not rediscovered as a novel finding; revisit if a
  third consumer without a workspace door ever enters at `evaluateEvent`.
- **Two nits for whoever next touches those lines:** `refusals.ts:63`'s comment ("they cannot define
  somebody else's ticket type") is stale post-P12 — by the time it fires the parent is same-workspace,
  so it is *this* workspace's own missing type; the remedy choice still stands on admin rights. And
  M-3's step 1 does not name which `workflowId` the added `ticket-type.defined` must bind (`WORKFLOW`,
  or the revert red-shifts to `ticket.workflow-undefined`).

---

## Addendum 10 — Ruling P14: the actor-supplied-id tenancy class (BLOCKING on T12)

Found by Task 6's review, which reproduced five mutations independently rather than reading them.

**P12 closed a tenancy hole on the parent. The same hole is open on the target workflow — and there it
yields an ACCEPT, not a mislabelled refusal.**

`packages/rule-engine/src/checks/workflow-rebind.ts:87-88` calls `ctx.getWorkflowDef(p.toWorkflowId)`,
and there is **no workspace predicate anywhere on the server path**:

- `apps/server/migrations/1787896601515_proj-workflows.sql:4-13` — `workspace_id` is a column, but the
  PK is `(workflow_id, version)`, global.
- `apps/server/src/projections/workflows.ts:80-83` — `WHERE workflow_id = $1 ORDER BY version DESC
  LIMIT 1`. No tenancy filter in any of the three branches.
- `apps/server/src/engine-context.ts:92` — passes straight through.

**`ticket.workflow_rebound` is the first check where an ACTOR-SUPPLIED id is resolved directly** —
create reads the type's binding, transition reads the ticket's own. So a foreign workflow id resolves,
the target-state check runs against **another workspace's state graph**, and the event is **accepted**:
a live ticket bound to a workflow it cannot see, placed in one of its states. P12's own shipped comment
indicts it verbatim once the noun is substituted (`hierarchy.ts:242-244`): *"The ingest door's tenancy
check does not cover this: it guards the event's own entity, never the parent the payload names."*

**Latent, not live.** `getEntityState('ticket')` returns null on the server today
(`engine-context.ts:74-76`), so `ticket.unknown` fires first at `workflow-rebind.ts:64`. **It goes live
in the same commit Task 12 lands** — which Addendum 9 already flags as a total-outage trap for
`rowToTicketState`'s `workspaceId`. Two independent tenancy hazards now converge on that one commit.

**The class extends one step further:** `getTicketTypeDef(ctx, p.typeId)` on the create path
(`hierarchy.ts:84`) has the identical shape once Task 12 backs it with `proj_ticket_types`. Addendum 9a
recorded the *own-entity* sibling of P12 and ruled it non-blocking; the **actor-supplied-id** siblings
were not considered. They are this ruling.

**Ruling P14 — close it, fail-closed, in Task 12.** An accept across a tenancy boundary is the worst
class of the three found in this plan: P11 told the actor a false sentence, P12 mislabelled a refusal
and leaked an id's existence, **P14 admits the write**. The conservative option under the autonomous
protocol is to refuse, and this is a security boundary the spec makes explicit (§6: "Enforcement is
server-side on every read and every sync-down"). The *design* is Task 12's — either a workspace
predicate on the `EngineContext` lookups at all three implementations, or an equivalent that keeps the
comparison inside the check. **Note no unit test can pin a fix:** `buildMemoryContext` has no workspace
notion for workflows at all, so the test home is **Task 12's `engine-context` suite**, alongside
Addendum 9's `rowToTicketState` trap. — Cost if wrong: a workspace predicate on a lookup that is
already per-workspace in every legitimate call.

**The record lands in the coordination doc in Task 7's commit** — the next change set — rather than at
plan end. This series has lost rulings twice to a gitignored ledger.
