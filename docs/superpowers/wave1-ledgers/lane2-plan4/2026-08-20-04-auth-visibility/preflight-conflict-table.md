# Plan 4 — SDD pre-flight conflict table

**Lane 2, wave 1.** Required by `superpowers:subagent-driven-development` before the first dispatch.

**Basis.** `adaptation-map.md` (BINDING over plan text — shipped code beats the plan),
`coordination-obligations.md` (contradictions C1–C13, rulings §3), the five task extracts,
and direct re-verification against the worktree at `main = f363b2f`. Every "seed" handed to
this synthesis was re-checked against the artifacts and the tree; where a seed was
incomplete, the row says so.

**Re-verified in this pass (not taken on faith):**

| Seed | Verdict |
|---|---|
| T14 modifies `src/sync/visible-events.ts`, T11 creates `src/visibility/visible-events-for.ts`; T11 path governs | CONFIRMED. extract-E T14 Files; extract-D T11 Files; coordination C2 quotes the by-catch verbatim. **Extends further than the seed:** case **6.38** cites `test/sync/visible-events.test.ts`, which must move to `test/visibility/visible-events-for.test.ts` too. |
| T8 creates `routes/tickets.ts`; Plan 3 ships `routes/ticket-history.ts`; adapt at merge | CONFIRMED (coordination B3, I1 / pre-ruling 1). **Extends:** T8's own third endpoint is `GET /v1/workspaces/:workspaceId/tickets/:ticketId/events` — a *different URL* for the same surface, so it is not a Fastify path collision but a duplicated read surface. The duplicate is the thing to remove, not the path clash. |
| T5 step 6 founding order: `workflow.defined` → 4 × `ticket-type.defined` from `builtinTicketTypeDefs` → founder `membership.granted` | CONFIRMED three ways: extract-B "Founding-sequence rules", coordination D2, and `packages/domain/src/ticket-types.ts:79-94` whose own docstring names Plan 4 as the founder. |
| T5 role gate and T9 visibility gate both in `src/permissions/check-permission.ts`; T9's project-existence check runs BEFORE the membership check | CONFIRMED as to the file (extract-B T5 Files, extract-C T9 Files). **The ordering claim is under-specified and is a ruling, not a fact** — see C-ORDER below: "before the membership check" is unambiguous for the *project*-membership check and dangerous if read as the *workspace*-membership check. |
| T7's `canSee` has a SQL twin in `listVisibleTickets`; owner bypass in both; owner-viewer test stands guard | CONFIRMED (coordination F9/F10, cases 6.39/6.40). **Extends:** T7's own printed decision table and T4's role-resolution note both still say NO bypass (C5) — two pieces of plan text the owner decision overrides. |
| `proj_memberships` (T4), `proj_visibility` (T6), `proj_projects` (T9-3b) all touch `projections/index.ts` + the order test; `main` omits `proj_projects` and mis-slots `proj_tickets`; lane 1 concurrent | CONFIRMED by direct read. `apps/server/src/projections/index.ts` registers exactly two. `apps/server/test/projection-order.test.ts:24-27` asserts exactly `['proj_entity_heads','proj_workflows']`. Both doc comments (`registry.ts:22-26`, the test's docstring) list a **seven**-name order that omits `proj_projects` and puts `proj_tickets` directly after `proj_ticket_types`. **Extends:** T14 adds a *fourth* Plan 4 registrant (`proj_invites`) whose slot has no authority (C8). |

**Also verified fresh at f363b2f:** `ENTITY_KINDS` is the closed six-member set with no `'invite'`
(`packages/domain/src/envelope.ts:4`); `vocabulary.ts` registers fourteen types, including
`workspace.created`, `workspace.renamed` and `ticket.workflow_rebound`, and **does not**
register `project.created`; `ingestBatch(rawEvents: unknown[])` is arity 1
(`ingest-service.ts:50`); migrations are three `.sql` files, latest prefix `1787896601515`.

---

## 0. The merged projection array — stated once, since four tasks and two lanes write it

Coordination §8 is the single source. Lane 2 contributes `proj_projects` (T9-3b),
`proj_memberships` (T4), `proj_visibility` (T6); lane 1 contributes `proj_ticket_types`,
`proj_tickets`, `proj_rollups`. **Whichever lane merges second writes the whole array.**

`buildProjectionRegistry()` must end at, and `projection-order.test.ts` must assert, exactly:

```ts
[
  'proj_entity_heads',
  'proj_workflows',
  'proj_ticket_types',   // lane 1
  'proj_projects',       // lane 2, T9 step 3b — BEFORE proj_tickets: the ticket precondition reads it
  'proj_tickets',        // lane 1
  'proj_rollups',        // lane 1
  'proj_memberships',    // lane 2, T4
  'proj_visibility',     // lane 2, T6
  'proj_invites',        // lane 2, T14 — appended last, under ruling R7 (no §8 authority exists)
]
```

The two stale doc comments (`src/projections/registry.ts:22-26` and the docstring of
`test/projection-order.test.ts`) omit `proj_projects` and must be corrected in the same commit
that first inserts it. A merge that resolves this file by taking one side wholesale drops the
other lane's registrants silently — the order test is the only thing that catches it, so it
must be merged by *union in §8 order*, never by "ours"/"theirs".

---

## 1. ROW TYPE 1 — every pair of Plan 4 tasks sharing a file or an interface

64 pairs, across fewer rows: where several pairs share one artifact and one finding they are
grouped into a single row that names **every** member of the group in its Pair cell, so no pair
is unstated. `→` means "left produces, right consumes". A pair that agrees says so; a pair that
agrees only after an adaptation-map ruling says which one.

### 1.1 Task 1's foundations (`src/db/queryable.ts`, `test/helpers/db.ts`, `src/auth/*`)

| Pair | Shared artifact | Produces → consumes | Finding | Ruling |
|---|---|---|---|---|
| T1 → T2 | `src/auth/auth.ts`, `otp-sender.ts`, `magic-link-sender.ts` | `createAuth`, `Auth`, `LogOtpSender`, `LogMagicLinkSender` | AGREE on names. Both are written against better-auth API shapes that exist in **no lockfile** (`grep -c better-auth pnpm-lock.yaml` → 0). Every endpoint path T2 asserts is an install-time claim T1 must confirm first. | T1 pins 1.7.2, reads the installed `.d.ts`, and records every divergence in the ledger *before* T2 is briefed. T2's brief carries T1's findings, not the plan's. |
| T1 → T4 | `src/db/queryable.ts` + `test/helpers/db.ts` | `Queryable`; `migrateTestDb`/`testPool`/`truncateAll` | `Queryable` AGREES. The db-helper trio **does not exist**: shipped `helpers/db.ts` exports only `createTestDatabase()` returning `{pool,url,drop}`, per-file databases, port 54329 (map §9). | Map §9 governs: T1 does **not** create the trio; T4 and every consumer use `createTestDatabase` + `beforeAll/afterAll`. T1's Files entry for `test/helpers/db.ts` becomes "modify, only if a `truncateProjections` is needed". |
| T1 → T5 | `src/db/queryable.ts` | `Queryable` for `checkPermission(db, …)` | AGREE. The gate runs on `commitOne`'s transactional `client` (a `PoolClient`), which is exactly why the union type is right. | None. Confirms map §11's choice. |
| T1 → T6 | `queryable.ts` + `helpers/db.ts` | as T4 | Same as T1→T4. | Same. |
| T1 → T7 | `queryable.ts` + `helpers/db.ts` | as T4 | Same as T1→T4. | Same. |
| T1 → T8 | `helpers/db.ts` + `src/auth/auth.ts` | `Auth` type into `registerTicketRoutes(app,{pool,auth})` | AGREE on `Auth`. db-helper mismatch as above. | Same. |
| T1 → T9 | `queryable.ts` + `helpers/db.ts` | as T4 | Same as T1→T4. | Same. |
| T1 → T10 | `queryable.ts` + `helpers/db.ts` | as T4 | Same as T1→T4. | Same. |
| T1 → T11 | `queryable.ts` + `helpers/db.ts` | as T4 | Same as T1→T4. | Same. |
| T1 → T12 | `helpers/db.ts` + `otp-sender.ts` | `LogOtpSender` constructed as `new LogOtpSender(() => {})` | AGREE on the sender's constructor. db-helper mismatch as above. | Same. |
| T1 → T13 | `helpers/db.ts` + `src/auth/auth.ts` | `Auth`; `truncateAll(pool)` | AGREE on `Auth`. **Sharper failure than the generic mismatch:** T13's "a nameless workspace appends nothing" test does `truncateAll(pool)` then asserts `count(*) FROM events === 0`. `events` carries an append-only trigger that **refuses TRUNCATE** with `P0001 'events is append-only: TRUNCATE refused'` (`1787841717635_events-and-snapshots.sql:36-38`, proven at `migrations.test.ts:152-157`). T1's own `truncateAll` DO-block truncates every non-`pgmigrations` table in `public` — it throws on its first call. | The helper is not written. T13 gets a fresh database per file (`createTestDatabase`), so the count assertion holds without truncation. |
| T1 → T14 | `queryable.ts`, `helpers/db.ts`, `src/config.ts` | `Queryable`; `AppConfig` gains `webOrigin` | AGREE. `AppConfig` exists at `src/config.ts:10-15` with four fields and a zod `configSchema`; adding `WEB_ORIGIN` is additive. | T14 adds one `config.test.ts` case proving a missing `WEB_ORIGIN` is a `ConfigError` naming it. Does **not** create `.env.example` (Plan 11's). |

### 1.2 `apps/server/src/app.ts` and the session helpers — a four-way modify

| Pair | Shared artifact | Produces → consumes | Finding | Ruling |
|---|---|---|---|---|
| T2 ↔ T8 | `src/app.ts` | both append a `registerXRoutes(app, …)` line | CONFLICT (mechanical). Both edit the same registration block; T2 additionally widens `AppDeps`. Shipped `AppDeps = { db: HealthDb; ingest: IngestService }`, `buildApp` is **synchronous** and returns the instance (`app.ts:19-24,60`) — not `{app}`, not a Promise. | T2 widens `AppDeps` **additively** (`+ pool, auth, otpSender`) and keeps `buildApp` synchronous by constructing `auth` in the caller. T8/T13/T14 only append one registration line each. Serialize the four in dispatch order; each rebases on the previous. |
| T2 ↔ T13 | `src/app.ts`, `test/helpers/session.ts` | `signInWithPhone` | **CONFLICT, real.** T2 produces `signInWithPhone(app, sender, phone): Promise<string>` (a bare token). T13 calls `const { token, userId } = await signInWithPhone('+919000000201')` — one argument, an object result. T12 and T8 call T2's three-argument form. | T2's helper becomes `signInWithPhone(app, sender, phone): Promise<{ token: string; userId: string }>` — a superset that serves both; T13's brief carries the three-argument call site. Named in T2's brief so it is not "fixed" back. |
| T2 ↔ T14 | `src/app.ts`, `require-session.ts` | `makeRequireSession` | AGREE on the preHandler; app.ts mechanical conflict as above. | Serialize. |
| T2 ↔ T12 | `src/app.ts` (`buildApp`) | T12 calls `buildApp({ pool, otpSender })` and destructures `{ app }` | CONFLICT. Shipped signature returns `FastifyInstance` synchronously; there is no `{app}` wrapper and `AppDeps` has no `pool`/`otpSender` until T2 widens it. | T12 writes `const server = buildApp({...})`, never `const { app } = …` (map §12). |
| T2 ↔ T5 | `src/routes/events.ts` (the `requireSession` preHandler) | T2 produces `makeRequireSession`; T5/T12 must attach it to `POST /v1/events` | GAP. `routes/events.ts:12-25` registers **no** preHandler, and `ingestBatch` carries no identity — so today an unauthenticated ingest succeeds. T12 asserts it is a 401. Neither T2's nor T5's Files list names `routes/events.ts`. | T5 owns it (it is the same change set that threads `sessionUserId`), and updates `events-route.test.ts`'s 12 existing unauthenticated cases in the same commit. Recorded so T12 does not discover it. |
| T8 ↔ T13 | `src/app.ts` | registration lines | Mechanical only. | Serialize. |
| T8 ↔ T14 | `src/app.ts` | registration lines | Mechanical only. | Serialize. |
| T13 ↔ T14 | `src/app.ts`, `src/workspaces/workspace-name.ts`, `Features.md`, `test-cases/06-*.md` | `workspaceNameFromLedger(db, workspaceId)` | **CONFLICT, orphaned dependency.** Both tasks call it; T13's comment attributes it to T14, T14's text calls it pre-existing; **neither Files list creates it**, and it exists nowhere on `main` (C3, map §23). | Map §23 governs: **T13 creates** `apps/server/src/workspaces/workspace-name.ts`, ordered by `workspace_seq DESC` over `workspace.created`/`workspace.renamed`. T14 imports it. T13 records the ownership move in the coordination doc in its own commit. |

### 1.3 `src/projections/index.ts` + `test/projection-order.test.ts` — a four-way modify

Every pair below is the same mechanical conflict on the same two files, plus a shape question.
Neither task's Files list names the order test — that is rider A8/G4, and it is mandatory.

| Pair | Shared artifact | Produces → consumes | Finding | Ruling |
|---|---|---|---|---|
| T4 ↔ T6 | `projections/index.ts`, `projection-order.test.ts`, `test/helpers/envelope.ts` | both append `registry.register(...)`; T6 consumes T4's `testEnvelope` | CONFLICT (mechanical) + both declare `{name, apply, reset}` with **no `tables`** and type `apply(env: EventEnvelope, db: Queryable)`. Shipped `Projection` requires `tables: readonly string[]` and types `apply(event: LedgerEvent, tx: PoolClient)` (C13; `registry.ts:44-49`, with an explicit "DO NOT fix this back to `EventEnvelope`" note). | Both write shipped-shape object literals with `tables`, both extend the order array in their own commit, T6 rebases on T4. `registerProjection` does not exist — registration is one line inside `buildProjectionRegistry`. |
| T4 ↔ T9(3b) | `projections/index.ts`, `projection-order.test.ts`, `check-permission.ts` | T9-3b registers `projProjects` **before** `proj_tickets` | CONFLICT (mechanical) + **shape inconsistency inside Plan 4**: T9's `projProjects` and T14's `projInvites` already declare `tables`; T4's and T6's do not. The plan is inconsistent with itself as well as with the code. | Shipped shape for all four. Insertion slot per §0. |
| T4 ↔ T14 | `projections/index.ts`, `projection-order.test.ts`, `proj_memberships` rows | T14's accept path writes `membership.granted` + `project.member_added` that T4's projection materialises | CONFLICT (mechanical) + T14's registration slot ("after `proj_memberships` per coordination §8 amendment") **cites an amendment that does not exist** (C8). | Append `proj_invites` last (nothing reads it during another projection's `apply`), and record the missing §8 amendment as a ruling in T14's own change set. |
| T6 ↔ T9(3b) | `projections/index.ts`, `projection-order.test.ts` | ordering | Mechanical. `proj_projects` sorts *before* `proj_tickets` and therefore before `proj_visibility` in the §8 order, so T9-3b's insert is not a simple append. | Union-merge on §0's array. |
| T6 ↔ T14 | `projections/index.ts`, `projection-order.test.ts` | ordering | Mechanical. | Union-merge. |
| T9(3b) ↔ T14 | `projections/index.ts`, `projection-order.test.ts`, `check-permission.ts` | both extend the gate and the registry | CONFLICT on two files at once. | Serialize T14 after T9; T14 rebases. |
| T4 ↔ T6 ↔ T9 ↔ T14 (all four) | `apps/server/migrations/` | four new `.sql` files | Latent CONFLICT: all four (plus T1) must carry epoch-ms prefixes **greater than 1787896601515** and distinct from each other and from lane 1's. Concurrent authoring can mint identical prefixes; node-pg-migrate applies in filename order, so a tie is a silent ordering flip. | Each task takes `Date.now()` at authoring time and the controller checks uniqueness across the lane before merge. All are handwritten `.sql` with `-- Up Migration` / `-- Down Migration` markers (map §1), never `.cjs`, never `node-pg-migrate create`. Every table gets a PRIMARY KEY and no `json` column (G1/G2). |

### 1.4 Task 3's vocabulary → its consumers

| Pair | Shared artifact | Produces → consumes | Finding | Ruling |
|---|---|---|---|---|
| T3 → T4 | `MembershipGrantedPayload`, `MembershipRevokedPayload`, `ProjectMemberAddedPayload`, `ProjectMemberRemovedPayload`; `packages/domain/src/index.ts` | payload types into `projMemberships.apply` | AGREE on names. Both inherit the scope collapse: `.strict()` payloads make a stale `scope` an `invalid-payload` refusal (F2, map §16). | T3 writes zod schemas with `.strict()`; T4 reads `role` only from `membership.granted` and hard-codes `'member'` on project rows. |
| T3 → T6 | `VisibilitySetPayload` | payload type into `projVisibility.apply` | AGREE. | None. |
| T3 → T7 | `visibility.set` mode vocabulary | `'workspace'\|'project'\|'explicit'\|'inherit'` → the decision table | AGREE. T3 refuses `userIds` on non-explicit modes and demands them on explicit — exactly the four states `canSeeResolved` switches on (`resolved_mode` is only ever the first three). | None. |
| T3 → T9 | `VisibilitySetPayload`; registration of `project.created` | T9-3b's `projProjects.apply` handles `project.created` | **DEPENDENCY, and T9's premise is false.** T9's problem statement says `project.created` "was a registered event type that nothing projected". On `main` it is **not registered at all** (14 types, none of them `project.created`). T9-3b cannot ingest one until T3 lands. | T3 dispatches before T9-3b. T9's prose is corrected to "a type this plan registers, that nothing projected". |
| T3 → T11 | membership payload shapes | `membership.revoked`/`project.member_removed` drive purge-on-membership-loss | AGREE, and T11's own note ("membership is workspace-scoped now and its payload carries no scope at all") matches T3 post-collapse. | None. |
| T3 → T13 | `workspace.created` registration + payload | T13's founding route submits it | **CONFLICT.** `workspace.created` and `workspace.renamed` are **already registered** (`vocabulary.ts:29,36`) and `createEventTypeRegistry.register` **throws** `event type already registered` on a duplicate — T3's registration crashes at module load (C3). | T3 **takes over** the provisional registrations (retires the PROVISIONAL comment) rather than adding beside them, and adds only the five genuinely new types. `workspace.renamed` has no Plan 4 owner — ruling R9. |
| T3 ↔ T5 | `packages/domain/src/index.ts` (barrel) | T3 appends two `export *`; T5 appends `./simple-kanban.js` | Mechanical conflict on the barrel; both also touch `packages/domain/test/` layout. | Serialize; both use flat `src/` paths (`simple-kanban.ts`, not `src/workflows/`) per map §19. |
| T3 ↔ T14 | `packages/domain/src/vocabulary.ts`, `src/index.ts`, **`src/envelope.ts`** | T3 registers 5–7 types; T14 registers 3 more with `entityKind: 'invite'` | **CONFLICT, and the sharpest one in the domain package.** Both tasks must edit `envelope.ts`, and **neither Files list contains it**: T3 to admit the composite membership id (map §7, `ULID_REGEX.test('…:…')` → false, executed), T14 to add `'invite'` to the closed six-member `ENTITY_KINDS` (C11, verified at `envelope.ts:4`). Without T14's edit, `parseEvent` refuses all three invite types at the door. The Global Constraints' entity-kind line changes with it. | Both edits are owed and both are recorded rulings (R1, R8). T3 lands first and owns the entity-id shape; T14 appends `'invite'` to `ENTITY_KINDS` and adds a falsifiable envelope test. |

### 1.5 Task 4's `proj_memberships` / `EffectiveRole` → its consumers

| Pair | Shared artifact | Produces → consumes | Finding | Ruling |
|---|---|---|---|---|
| T4 → T5 | `src/permissions/effective-role.ts` | `EffectiveRole`, `resolveEffectiveRole`, `hasProjectAdminRights` | AGREE on the interface. **Latent contradiction inside T4's own note**: it states "Task 7's `canSee` grants owners/admins NO read bypass", which the 2026-08-27 owner amendment overrides for `owner` (C5, F9). T5 only reads management rights, so its behaviour is unaffected — but the note must not be copied forward into T7. | Strike the note from T4's brief; replace with "management rights only; read bypass for `owner` is T7's and is ON". |
| T4 → T7 | `EffectiveRole`, `proj_memberships`, `test/helpers/envelope.ts` | `canSeeResolved(eff, userId, v)` switches on `eff.workspaceRole` and `eff.projects` | AGREE structurally. **Dead branch:** T4's `resolveEffectiveRole` infers workspace `guest` from "only project-scope rows, any carrying role `'guest'`", and case 6.5 asserts it. After the collapse nothing can produce that state — `project.member_added` writes `role='member'` unconditionally (C6). | Delete the inference branch and rewrite case 6.5 to "a workspace-scope `membership.granted {role:'guest'}` resolves to a guest with zero projects". A guest with no seedable path is a guard that proves nothing. |
| T4 → T9 | `hasProjectAdminRights(eff, projectId)`, `EffectiveRole.projects` (a `Map`) | `visibility.set` gate; project-membership check on `ticket.created` | AGREE. `.has(projectId)` is available on the Map as T9 assumes. | None. |
| T4 → T10 | `resolveEffectiveRole(db, viewerId, workspaceId)`, `test/helpers/envelope.ts` | per-viewer `restrictedCount` | AGREE. | None. |
| T4 → T11 | `resolveEffectiveRole`, `proj_memberships`, `test/helpers/envelope.ts` | guest detection; purge-on-membership-loss scope query | AGREE on `workspaceRole`. **Depends on the `scope_kind` ruling (R2):** T11's `nowInvisibleTicketsInScope` reads a project scope out of the same table. | Ruling R2 settles the column set before T4 writes the migration. |
| T4 → T13 | `proj_memberships` columns | `SELECT workspace_id, role FROM proj_memberships WHERE user_id=$1 AND scope_kind='workspace'` | **CONFLICT, contract-level.** T4 produces `scope_kind`; adaptation map §16 says the table has **no `scope_kind` column**; coordination C9 says the four-column key `(workspace_id,user_id,scope_kind,project_id)` "stands on its own footing". Three consumers (T13's directory, T11's scope purge, T14's accept path) spell `scope_kind` in SQL. | Ruling **R2**. Conservative option named there: keep `scope_kind`. If the map's reading is taken instead, all three consumer queries are rewritten against the `project_id = ''` sentinel **in T4's own change set**, not discovered later. |
| T4 → T14 | `proj_memberships` rows, `projections/index.ts` | accept path appends `membership.granted` + `project.member_added` | AGREE, subject to R2. | R2. |
| T4 → T6 / T7 / T8 / T10 / T11 / T12 | `test/helpers/envelope.ts` (`testEnvelope`, `nextSeq`, `resetSeq`) | envelope factory | AGREE on need. Two collisions: `makeEnvelope` already ships from `packages/domain/src/testing.ts` (returns `EventEnvelope`, **not** assignable to `Projection.apply`'s `LedgerEvent`), and `event-store.ts:21` already exports a `nextSeq(client, kind, id)`. | T4's helper wraps `makeEnvelope` and adds `workspaceSeq`; the counters are renamed `nextTestSeq`/`resetTestSeq` (map §21). Not a fourth set of defaults. |
| T4 → T8 | `test/helpers/envelope.ts` + `LedgerEvent` import origin | `appendTestEvent(db, env: LedgerEvent)` | AGREE on shape. Both import `LedgerEvent` from `'../../src/ledger/event-store'`, which **no longer re-exports it** — the hoist moved it to `@gisik-nokma/domain` and `event-store.ts:2` only `import type`s it (C4b, map §4). The plan's path fails to compile, not merely drifts. | Both import from `@gisik-nokma/domain`. Same fix in T11. |
| T4 → T12 | `test/helpers/envelope.ts`, `proj_memberships` verifier round-trip | T12 asserts `verifyProjections(...)` reports zero diffs | AGREE. `verifyProjections` iterates `projections.all()` and shadows every `tables` entry, so registration alone makes it aware (map §18) — which is why `tables` is not optional. | T12 calls the function in-process (`verify-projections.test.ts` is the pattern), not the CLI; script name is `verify:projections`. |

### 1.6 Task 6's `proj_visibility` → its consumers

| Pair | Shared artifact | Produces → consumes | Finding | Ruling |
|---|---|---|---|---|
| T6 → T7 | `proj_visibility` (`workspace_id, project_id, resolved_mode, resolved_user_ids`) | `getResolvedVisibility` reads exactly these | AGREE, column for column. | `resolved_user_ids` must not be a `json` column (no equality operator; the verifier diffs with `EXCEPT`) — `jsonb` or `text[]`. |
| T6 → T10 | `proj_visibility` keyed by `parent_id` | direct-children scan for `restrictedCount` | AGREE; T6's `proj_visibility_children (parent_id)` index is exactly what T10's scan needs. | None. |
| T6 → T11 | `proj_visibility` (`own_mode`, `parent_id`, `ticket_id`, `workspace_id`, `project_id`) | inherit-subtree walk for purges | AGREE. T11 prunes at authored descendants using `own_mode = 'inherit'`, which is T6's discriminator. | None. |
| T6 → T12 | verifier round-trip | zero diffs after `reset` + replay | **CONFLICT with a shipped guarantee.** T6's algorithm rests on "a parent's row always exists before any child references it", true in `workspace_seq` order and **false** under canonical replay order `(entity_kind, entity_id, seq)` — which is what `reset` + replay and `verify-projections` deliver (G5; `registry.ts:10-12` states the canonical order in terms). T6's own test 8 ("rebuild deterministically via reset+replay") is the test that will expose it. | Ruling **R5**: make the projection order-independent (defensive re-resolve / resolve-on-read), not the replay order. This is also the moment determinism test 3 goes live and must be re-read rather than assumed green. |

### 1.7 Task 7's `canSee` twin → its consumers

| Pair | Shared artifact | Produces → consumes | Finding | Ruling |
|---|---|---|---|---|
| T7 → T8 | `can-see.ts`, `visible-tickets.ts` | `canSee(db,userId,ticketId)` for 404s; `listVisibleTickets` for the list route | AGREE. The 404-for-invisible and 404-for-nonexistent bodies are identical `{ error: 'not_found' }` by design. | None — but see the owner-bypass guard below: both copies must carry it or T8's list and T8's single read disagree for an owner. |
| T7 → T9 | `canSee`, `getResolvedVisibility` | check #4 ("This ticket is not visible to you.") and the creatorship test | AGREE. `permission.visibility` is one shared rule id with Plan 10's sync door (`VISIBILITY_REFUSAL_RULE`, B8) and may not be renamed or forked. | None. |
| T7 → T10 | `canSeeResolved(eff, viewerId, {…})` | per-child visibility for `restrictedCount` | AGREE. | None. |
| T7 → T11 | `canSee(db, userId, ticketId)` | per-event ticket filter | AGREE. | None. |
| T7 internal ↔ T7 SQL twin (surfaces to T8, T10, T11 alike) | `canSeeResolved` vs `listVisibleTickets` | the same decision table, twice | **THE standing drift hazard.** The owner read bypass (2026-08-27) must land in **both**; T7's own printed table still shows the pre-amendment "member / admin / owner" row (C5). | Owner row is all-yes in both copies. Cases **6.39** and **6.40** are the guard between them and **may not be merged, dropped, or reduced to one**: 6.40 asserts an owner on no project and no list gets every ticket from `listVisibleTickets` while `canSee` agrees ticket by ticket. |
| T7 → T10 / T11 / T12 | `test/helpers/seed.ts` (`applyAll`, `seedMember`, `seedGuest`, `seedTicket`, `setVisibilityEnv`) | scenario builders | AGREE. `seedTicket` writes `proj_tickets` (lane 1's table) by raw SQL — legitimate, and the reason all four are partition B1. | Readable ids (`'tkt_1'`, `'prj_1'`) survive **only** on paths that never cross `parseEvent` (map §8). `setVisibilityEnv` builds an envelope that *does* cross it, so its ids must be ULIDs bound to greppable constants. |
| T10 ↔ T11 | T7's two entry points | `canSeeResolved(eff, id, v)` vs `canSee(db, id, ticketId)` | NOT a conflict — two functions with different shapes from one module. Recorded because an implementer can conflate them and because T11's per-event call is the expensive one. | Keep both; T11 may not "simplify" to `canSeeResolved` without carrying the resolve itself. |

### 1.8 The read routes and the ingest gate

| Pair | Shared artifact | Produces → consumes | Finding | Ruling |
|---|---|---|---|---|
| T8 ↔ T10 | `src/routes/tickets.ts`, `test/routes/tickets-read.test.ts` | T8 returns `{ticket, parent}`; T10 changes it to `{ticket, parent, rollup}` | CONFLICT (intentional, sequential). Test counts chain: T8 ships 6, T10 adds 1 → 7. | T10 rebases on T8. Any T8 assertion written with `toEqual` on the whole body must be `toMatchObject` or updated by T10 in the same commit. |
| T8 → T11 | `test/helpers/ledger.ts` (`appendTestEvent`) | raw ledger seeding | AGREE. **Rider:** the helper INSERTs into `events` directly, bypassing Plan 2's entity↔workspace door — a test can seed data ingest would refuse (G13). | Build the helper on `insertEvent` (`event-store.ts:58`) rather than hand-written SQL, so the column list cannot drift; state the bypass in its docstring. |
| T8 ↔ T12 | `test/routes/tickets-read.test.ts`, `{error:'not_found'}` | T12's e2e re-proves T8's 404 at the HTTP surface | AGREE on the body. | None. |
| T5 ↔ T9 | `src/permissions/check-permission.ts` | T5 creates (`checkRolePermission`, `checkPermission`, `PermissionContext`, `refuse`); T9 extends with `checkVisibilityPermission`, `checkProjectExists`, `projectNamedBy` | CONFLICT (sequential, same file, twice within T9 itself — Step 3 and Step 3b). `checkPermission`'s **call site is unchanged**, which is what keeps this additive. | T9 rebases on T5. The gate stays one function that ingest calls once. |
| T5 ↔ T14 | `check-permission.ts` (`ADMIN_ONLY_TYPES`), `ingest-service.ts` (multi-append) | T14 joins `invite.sent`/`invite.revoked` to the set and refuses `invite.accepted` from every client origin | CONFLICT (sequential). Both need a multi-append transaction that `commitOne` does not offer (one `BEGIN…COMMIT` per event). | T5 builds the multi-append path once (founding); T14 reuses it (acceptance: `invite.accepted` + `membership.granted` + N × `project.member_added` + the token delete, one transaction). T14 does not build a second one. |
| T9 ↔ T14 | `check-permission.ts`, `projections/index.ts` | both extend the gate and the registry | CONFLICT on two files. | T14 dispatches after T9 and rebases. |
| T5 → T12 | `ingest-service.ts`, `routes/events.ts`, refusal shape | T12's e2e asserts a refusal at `POST /v1/events` | **CONFLICT.** T12 asserts `res.json()` matches a bare `{refused:true, rule, reason}`. The shipped door answers `200 { results: [ { status:'refused', eventId, rule, reason } ] }`, index-aligned (`routes/events.ts:26-30`, `ingest-result.ts:14-17`). A bare top-level refusal never appears. | T12 asserts `res.json().results[0]` with `{status:'refused', rule:'permission.visibility', reason:'This ticket is not visible to you.'}` (map §17). The rule id and reason string are unchanged. |
| T5 → T13 | `ingest-service.ts` (`ingestBatch`), `bootstrap-workspace.ts`, `check-role-permission.test.ts` | T13 calls `ingestBatch([founding], { sessionUserId })` and relies on the bootstrap firing | **CONFLICT.** Shipped `ingestBatch(rawEvents)` is arity 1 (verified, `ingest-service.ts:50`); `checkPermission(db, env, sessionUserId)` needs the identity. 31 existing tests call the current arity (`ingest.test.ts` 19, `events-route.test.ts` 12). | T5 widens to `ingestBatch(rawEvents, ctx: { sessionUserId: string \| null })` with the **second parameter required**, so an unauthenticated call site is a compile error rather than a silent bypass, and updates the 31 tests in the same change set. T13 consumes the widened signature. |

### 1.9 The sync-down seam

| Pair | Shared artifact | Produces → consumes | Finding | Ruling |
|---|---|---|---|---|
| T11 ↔ T14 | **the sync-down file and its test** | T11 creates `src/visibility/visible-events-for.ts`; T14 modifies `src/sync/visible-events.ts` and its case 6.38 cites `test/sync/visible-events.test.ts` | **CONFLICT — the plan is internally inconsistent about its own sync path.** Two paths for one file; the second does not exist and nothing creates it. Coordination's by-catch rules it in terms: *"The T11 path governs."* | `apps/server/src/visibility/visible-events-for.ts` is the file. T14's Files list changes to modify it; **case 6.38's citation moves to `test/visibility/visible-events-for.test.ts`** — the half the by-catch did not name. T14 adds the `'invite'` arm to T11's non-ticket switch: `invite.*` yields to `owner`/`admin` only, because the payload carries an address (F17). |
| T11 → T12 | `SyncItem`, `visible-events-for.test.ts` | cases 6.16, 6.17, 6.21, 6.22 cite T11's test file | AGREE on citations. **Interface CONFLICT inside T11 that T12 inherits:** the Interfaces bullet pins `SyncItem = LedgerEvent \| PurgeInstruction` and says "do not rename anything here", while Step 3 defines and folds in `ScopeRevokedInstruction` (C1). Plan 10 has already landed its consumption (`replica.revokeScope`). | Ruling **R3**: three members. The **prose** is corrected, not the code; T12's Features.md bullet (which mentions only `{kind:'purge'}` tombstones) gains the scope-revoked half. |
| T10 → T12 | `rollup.test.ts` | case 6.13 cites it | AGREE. | None. |
| T9 → T12 | `proj_projects` in the verifier | zero-diff assertion covers a table T12 predates | AGREE — `verifyProjections` derives its shadow set from the registry, so a later registrant is covered automatically. | None. |
| T9 → T13 | `check-project-exists.test.ts`, `proj-projects.test.ts` | cases 6.27–6.30 appended by T13 cite T9's files | AGREE on citation; **dispatch inversion** (below). | See T12↔T13. |

### 1.10 The catalogue files

| Pair | Shared artifact | Produces → consumes | Finding | Ruling |
|---|---|---|---|---|
| T12 ↔ T13 | `Features.md` §6, `test-cases/06-auth-visibility.md` | T12 **creates** both (§6 block, cases 6.1–6.22); T13 **appends** 6.23–6.31 | **CONFLICT created by the partition gates, not by the plan.** T13 is partition **B2** and T12 is partition **B1** — so under the schedule T13 appends to a file T12 has not yet created. The plan assumed serial order. | Ruling **R11**: **T13 creates** `test-cases/06-auth-visibility.md` with the §6 header and its own cases, and opens `Features.md` §6 with its founding bullet. T12 then **inserts 6.1–6.22 above** them and prepends its §6 bullets. Nothing is renumbered; 6.23–6.31 keep their ids. |
| T12 ↔ T14 | same two files | T14 appends 6.32–6.42 and one Features bullet | Sequential append; T14 is last in B1 so no inversion. **Mis-filing:** cases **6.39** and **6.40** describe Task 7's owner bypass, not invites, and cite `can-see.test.ts` / `visible-tickets.test.ts`. | The two cases move to T7's change set, where the tests they name are written. T14 keeps 6.32–6.38 and 6.41–6.42. |
| T13 ↔ T14 | same two files (+ `app.ts`, `workspace-name.ts`) | 6.23–6.31 then 6.32–6.42 | Sequential append; mechanical. | Serialize. |
| T12 → T13 | `test/helpers/session.ts`, `buildApp` | shared harness | AGREE, subject to the `signInWithPhone` superset (T2↔T13). | None. |

### 1.11 Cross-lane pairs — not Plan 4 pairs, but they conflict at merge

| Pair | Shared artifact | Finding | Ruling |
|---|---|---|---|
| Plan 4 T8 ↔ Plan 3 T13 | ticket read surface | Plan 3 ships `routes/ticket-history.ts` serving `GET /v1/tickets/:id/history`; T8's third endpoint is `GET /v1/workspaces/:workspaceId/tickets/:ticketId/events` — the same surface at a different URL. Different paths, so no Fastify collision; the defect is the duplicate. | Pre-ruling 1: **Plan 4 adapts at merge and cites the pre-ruling line.** If Plan 3's route has landed, T8 does not ship a second history endpoint — it wraps its read enforcement (visibility 404, provenance-untouched) around Plan 3's. Ruling **R6**. |
| Plan 4 T4/T6/T9/T14 ↔ Plan 3 lane 1 | `src/projections/index.ts`, `test/projection-order.test.ts` | **WILL conflict at merge**, guaranteed: lane 1 adds `proj_ticket_types`, `proj_tickets`, `proj_rollups` to the same array concurrently. | §0's array is the merge result, union-merged in §8 order, with the two stale doc comments corrected. Never resolve by taking one side. |
| Plan 4 T1 ↔ Plan 7 | `Queryable` specifier | Plan 7's server T7/T8 are scheduled "once Plan 4 T1 lands `Queryable`". The import path is a cross-lane contract. | Ruling **R12** picks the home and T1 records it in the coordination doc in the landing commit. Merge as a micro-PR when green. |
| Plan 4 T5 ↔ Plan 8 | `simple-kanban.ts` path | Plan 8 T3's guard must NOT create the file; if absent, that lane waits. Plan 8's own text spells `src/workflows/simple-kanban.ts`; map §19 puts it flat at `packages/domain/src/simple-kanban.ts`. Plan 8 would wait forever on a path Plan 4 never creates. | T5 records the flat path in the coordination doc **in the commit that lands the file**, and merges it as a micro-PR. |
| Plan 4 T5 ↔ Plan 7 | `IngestDeps` | Plan 7 wants `IngestDeps.gates?: ServerGate[]` (amendment 15); Plan 4 arrives first and wires `checkPermission` directly. | Keep T5's diff minimal and additive. If T5 introduces an array instead, it is spelled `gates?: ServerGate[]` exactly, so Plan 7 appends rather than re-plumbs. |
| Plan 4 T4 ↔ Plan 2/3 | `src/engine-context.ts` `'membership'` branch | `engine-context.ts:59-63` hands `'membership'` to Plan 4 by name. If `proj_memberships` ships while the branch still returns `null`, `evaluateRestrictTo` sees no membership and **every role-gated transition is silently refused** with a legitimate-reading reason, against a green suite (G9/B4). | **T4 owns it**, same change set: parse the composite id, read `proj_memberships`, return a `MembershipState`; update the comment; add the engine-context cases (granted resolves, revoked → `null`). Ruling **R10**. |

---

## 2. ROW TYPE 2 — does each task's own text agree with itself?

One row per task: the tests it specifies against the code it specifies, and the files it
creates against the files it later touches.

| Task | Self-consistent? | What disagrees inside the task |
|---|---|---|
| **T1** | **NO — three ways** | (a) Files create `test/helpers/db.ts` exporting `TEST_DATABASE_URL`/`migrateTestDb`/`testPool`/`truncateAll`; the file already exists with one export, `createTestDatabase()`, per-file databases, admin URL on port **54329** under user `gisik`. T1's default URL points at port 5432, where nothing listens. (b) T1's own `truncateAll` DO-block truncates every `public` table except `pgmigrations` — including `events`, whose append-only trigger **refuses TRUNCATE** (`P0001`). The helper T1 specifies cannot execute against the migrations T1 specifies. (c) Files create `<ts>_auth-tables.cjs` via `node-pg-migrate create`; the shipped format is handwritten `.sql` with `-- Up Migration`/`-- Down Migration` markers and there is no `create` script. Test count: 2, and both are pure sender tests — internally fine. |
| **T2** | **Mostly — one produced/consumed mismatch** | Its `signInWithPhone(app, sender, phone): Promise<string>` is consumed by T13 as `signInWithPhone(phone): Promise<{token,userId}>`. Its "expose `auth` from the builder's return value" conflicts with T8/T13/T14, which all receive `auth` through a deps object instead. Its 5+3=8 tests are internally consistent, but every asserted endpoint path is an unverified better-auth claim. Deliberate and correct: the 401 body `{error:'unauthenticated'}` is **not** the `{refused,rule,reason}` shape — an auth 401 is not a ledger refusal. |
| **T3** | **NO — four ways** | (a) Test count: Step 4 says 13, the enumerated file has **14** `it` blocks. (b) It registers `workspace.created`, which is already registered and whose registry **throws** on a duplicate — the task crashes at module load. (c) It exports `WorkspaceRole` from `events/membership.ts` while `WorkspaceRole` already ships from `entity-state.ts:3`; two `export *` lines both exporting it is a duplicate-export error in the barrel. (d) Its own event→entity note says "`proj_memberships` keys on `(workspaceId, userId, scope)`" and "scope stays in payload", while its own design-rationale note (2026-08-27) removes `MembershipScope` and makes a `scope` a **refusal**. Also: its registration call shape (`parsePayload` throwing `Error`) is not the shipped one (`payloadSchema`, a zod schema), which puts its **eighteen pinned refusal messages** in need of deliberate adaptation — the two scope refusals (F2) and the ownership refusal (F7) carry real semantic content and must survive the translation. |
| **T4** | **NO — three ways** | (a) Its role-resolution note asserts "Task 7's `canSee` grants owners/admins NO read bypass", which the owner amendment overrides for `owner`. (b) Its guest-inference branch and its own case 6.5 describe a state no shipped parser can produce after the collapse. (c) It declares `{name, apply, reset}` with `apply(env: EventEnvelope, db: Queryable)`; the shipped `Projection` requires `tables` and types `apply(event: LedgerEvent, tx: PoolClient)`, with an explicit in-code note not to "fix" it back to `EventEnvelope`. Its `registerProjection` import does not exist. Test counts 6+6 are internally consistent. Its Files list omits `test/projection-order.test.ts` (mandatory) and `src/engine-context.ts` (its own hand-off). |
| **T5** | **NO — three ways** | (a) Files modify `src/ingest/pipeline.ts`, which does not exist; the seam is `commitOne` in `ingest-service.ts`, line 119. (b) The plan's wiring is `return permissionRefusal;` — returning a `Refusal` where `IngestResult` is required, **and leaking an open transaction**: every other early return in `commitOne` does `ROLLBACK` first. (c) Step 6 constraint 1 requires the whole founding sequence in one transaction (D3), while `commitOne` opens one per event — a path T5 must add. Its control flow is load-bearing and internally correct: `workspace.created` is allowed at step 3, **before** the `role === null` refusal at step 4, and a naive reordering makes founding impossible. Test counts 12 + 2 + 5. Files create `packages/domain/src/workflows/simple-kanban.ts` and a matching `test/workflows/` path; no `workflows/` directory exists in either tree. `ticket.workflow_rebound` in `ADMIN_ONLY_TYPES` is sound — the type is registered (`vocabulary.ts:123`). |
| **T6** | **NO — two ways** | (a) Its algorithm's stated premise — "a parent's row always exists before any child references it" — is true in `workspace_seq` arrival order and **false** under the canonical replay order `(entity_kind, entity_id, seq)`, and its **own test 8** ("rebuild deterministically via reset+replay") is precisely the test that runs in that order. The task's implementation and its acceptance test disagree. (b) It consumes `ticket.reparented` as `{parentId: string \| null}`; the shipped payload field is **`newParentId`**, and `ticket.created`'s `parentId` is *nullable-required*, not optional, with `projectId`/`parentId` both ULIDs. Test count 8 = 8 counted. Files omit the order test. Column shapes must avoid `json` for the two user-id arrays. |
| **T7** | **NO — three ways** | (a) Its printed decision table has one "member / admin / owner" row (project: only if on the project), the pre-amendment rule; the owner bypass survives only as a prose note beside it. Table and note contradict. (b) `can-see.test.ts`: Step 5 says 7 tests, the file has **8** `it` blocks. (c) `visible-tickets.test.ts`: Step 7 says "1 test", the file has **2**. Structurally sound and important: two implementations of one decision table, with 6.39/6.40 as the guard between them. |
| **T8** | **Mostly — two import/scope items** | Its `appendTestEvent` imports `LedgerEvent` from `src/ledger/event-store`, which no longer re-exports it. Its third endpoint duplicates Plan 3's history surface (cross-lane, R6). Test count 6 = 6 counted, and the chain to T10's 7 is consistent. Its readable ids (`'tkt_parent'`) are legal **only** because they are seeded by raw SQL and never cross `parseEvent`; the moment a test in this file ingests, they must become ULIDs. Honest and internally consistent: one 404 body for invisible and nonexistent alike, with the restricted-parent placeholder as the single deliberate existence leak, structurally unable to carry a title. |
| **T9** | **NO — two ways** | (a) Its header Files block lists only "modify `check-permission.ts`", while Step 3b adds a migration, a projection, two test files and a second edit to `projections/index.ts` — the header undercounts the task by most of its surface. (b) Its problem statement says `project.created` "was a registered event type"; on `main` it is not registered at all, and T3 is what registers it. Its ordering claim ("existence check before the membership check") is under-specified — see ruling **R4**. Test count 10 = 10 counted. `projProjects` correctly declares `tables`, unlike T4's and T6's. |
| **T10** | **YES** | 4 + 1 = 5 new tests, and its "+1 brings `tickets-read.test.ts` to 7" matches T8's 6. `restrictedCount` is explicitly always present, never implied, and null is returned rather than invented when no rollup row exists. Its only cross-task edge is that it changes T8's response shape by one key. |
| **T11** | **NO — two ways** | (a) Its Interfaces bullet pins a two-member `SyncItem` and says "do not rename anything here"; its Step 3 implementation defines `ScopeRevokedInstruction` and folds it in, making three — with a matching stream frame already amended and Plan 10 already consuming it. (b) Its filter-semantics bullet 5 and open question 4 both say definition events go "to everyone including guests" unqualified, while its own implementation narrows them to the workflows and ticket types used by tickets the guest can see. In both cases the **implementation** is right and the prose is stale. Test count 9 = 9 counted. `LedgerEvent` import origin as in T4/T8. The purge/scope-revoked split must be **guest-only** — a universal split would be a different behaviour than F13 records. |
| **T12** | **NO — three ways** | (a) Step 5 prose says "cases 6.1–6.20"; the block it introduces runs to **6.22**. (b) It asserts a refusal as a bare top-level `{refused, rule, reason}`; the shipped door returns `{results:[…]}` with `status:'refused'` inside. (c) It calls `buildApp({pool, otpSender})` and destructures `{app}`; `buildApp` is synchronous and returns the instance. Test count 5 = 5. Script name `verify-projections` is `verify:projections`, and the verifier is a function to call in-process, not a CLI to shell out to. Its `POST /v1/events` URL and body are already correct (open question 11 fixed them). |
| **T13** | **NO — four ways** | (a) `buildApp({pool})` awaited, returning `{app}`-less `FastifyInstance` synchronously. (b) `ingestBatch([founding], {sessionUserId})` against a shipped arity of 1. (c) Its "nothing was appended" test calls `truncateAll(pool)` on a table that refuses TRUNCATE. (d) Its `GET /v1/me/workspaces` calls `workspaceNameFromLedger`, which its own comment attributes to T14 and which **no task creates**. Its Features.md bullet cites `bootstrap-workspace.ts`, T5's file. Test count: 4 stated and 4 written, plus 4 unnumbered Step-4b scenarios. **Partition problem of its own:** its second test reads `proj_ticket_types`, a lane-1 table absent from `main` — see the dispatch notes. |
| **T14** | **NO — five ways** | (a) It registers three types with `entityKind: 'invite'`; `ENTITY_KINDS` is closed at six and has no `'invite'`, so `parseEvent` refuses all three at the door — and `envelope.ts` is **not in its Files list**. (b) It modifies `src/sync/visible-events.ts`, a file T11 creates elsewhere, and cites a test path that moves with it. (c) It slots `projInvites` "per coordination §8 amendment" — no such amendment exists. (d) `projInvites.reset` is `DELETE FROM proj_invites`, a weaker lock than the `TRUNCATE` every shipped reset uses, and Plan 2's entity↔workspace-door argument leans on `TRUNCATE`'s ACCESS EXCLUSIVE. (e) Its `apply` bodies are **comments**, not code — the one place the plan's "no TBDs" self-review claim does not hold. Also: the 404 body it insists is identical for unknown/revoked/spent is specified nowhere; two of the cases it appends (6.39, 6.40) belong to T7; no test count is stated anywhere. |

---

## 3. RULINGS NEEDED before dispatch

Under the autonomous protocol (ruling 3): take the conservative option, record a ruling-request
in the coordination doc **in the same change set as the task that acts on it**, push-notify the
owner, continue. Block only where a MUST says so.

**Must be settled before the FIRST dispatch — they are contracts other tasks transcribe:**

- **R1 — the membership entity id vs. the envelope door (T3, affects T4/T5/T7/T11/T12/T13/T14).**
  Coordination §5 pins the entity id as `` `${workspaceId}:${userId}` ``; `envelope.ts:75` requires
  every `entity.id` to be a bare ULID, and the composite fails `ULID_REGEX` (verified by execution).
  Both cannot stand. **Conservative option: the adaptation map's §7 default** — amend the door's
  entity schema so `kind === 'membership'` admits the composite and every other kind keeps the bare
  ULID, leaving the frozen `EventEnvelope` *type* untouched, with two falsifiable envelope tests.
  It is the narrower change in behaviour (nothing previously admitted becomes refused) and it
  honours the later, owner-recorded decision that explicitly rejected the fresh-ULID alternative as
  drift. Because it touches Plan 1's frozen contract, it is raised, not made silently. If the owner
  declines: §7's fallback (ULID entity ids, composite resolved inside `engine-context`), which costs
  `membership.granted`/`revoked` a shared entity stream.

- **R2 — does `proj_memberships` keep `scope_kind`? (T4, binds T11/T13/T14.)**
  Adaptation map §16 says the table has no `scope_kind`; coordination C9 says the four-column key
  `(workspace_id, user_id, scope_kind, project_id)` stands. Three consumers already spell
  `scope_kind` in SQL. **Conservative option: keep `scope_kind` and the four-column key.** The map's
  §16 rationale is load-bearing about the *payload* (a `scope` key must be refused, which `.strict()`
  delivers) and only incidental about the *column*; keeping it preserves three written consumer
  queries and leaves the discriminator explicit rather than resting on a `project_id = ''` sentinel.
  If the map's reading is taken instead, T13's directory query, T11's scope purge and T14's accept
  path are rewritten in T4's own change set.

- **R3 — `SyncItem` is two members or three? (T11, binds T14 and Plan 5/10.)**
  **Conservative option: three.** `ScopeRevokedInstruction` is required by the 2026-08-27 purge
  split, amendment 13 gained the matching stream frame, and Plan 10 has already landed
  `replica.revokeScope`. The stale §18 text and T11's interface bullet are corrected; the code is not.

- **R4 — where exactly does the project-existence check sit? (T9-3b, binds T5's gate order.)**
  "Before the membership check" is unambiguous for the *project*-membership check and dangerous if
  read as the *workspace*-membership check: running existence first would let someone outside the
  workspace probe which project ids exist. **Conservative option: after T5's `role === null`
  workspace refusal, before T9's project-membership check.** A non-member of the *workspace* still
  gets "You are not a member of this workspace."; a workspace member naming a project nobody founded
  gets `project.unknown`. Case 6.30's wording ("a non-member … is told the project does not exist")
  is rewritten to say *project* non-member, so the test asserts the safe ordering rather than the leak.

- **R5 — the replay-order hazard (T4 + T6).**
  `proj_memberships`' `membership.revoked` deletes rows written by *project*-entity events, and
  `proj_visibility` resolves inherit chains on parent-before-child — both hold in `workspace_seq`
  order and neither holds under canonical `(entity_kind, entity_id, seq)` replay. **Conservative
  option: make the projections order-independent** (defensive re-resolve, resolve-on-read), never
  change the replay order. This is also where determinism test 3 goes live and must be **re-read**,
  not assumed still green for the right reason.

- **R6 — ticket read routes vs. Plan 3's `routes/ticket-history.ts` (T8, T10).**
  **Conservative option: do not duplicate the surface.** If Plan 3's history route has landed by the
  time T8 runs, T8 ships list + single-read only and wraps its read enforcement (404 for invisible,
  restricted-parent placeholder, provenance untouched) around Plan 3's route, citing pre-ruling 1.
  If it has not landed, T8 ships its own and the merge removes one.

- **R7 — `projInvites`' registration slot (T14).** No §8 authority exists. **Conservative option:
  append at the end of the order** (nothing reads `proj_invites` during another projection's
  `apply`), and record the amendment §8 is missing, in T14's own change set.

- **R8 — `'invite'` joins `ENTITY_KINDS` (T14).** The Global Constraints' entity-kind line changes
  with it. **Conservative option: add it, narrowly, in `envelope.ts`, with a falsifiable test**, and
  record the constraint amendment — the alternative is three registered event types that the door
  refuses, which is a silent dead feature.

- **R9 — `workspace.renamed`'s owner and `workspaceNameFromLedger`'s home (T3, T13, T14).**
  §6 calls Plan 1's seeds provisional until Plan 4 lands; T3 registers seven types, none of them
  `workspace.renamed`; a helper both T13 and T14 call is created by neither. **Conservative option:**
  T3 takes over both provisional registrations (retiring the PROVISIONAL comment) and adds no
  `workspace.renamed` behaviour beyond that; **T13 creates** `src/workspaces/workspace-name.ts`
  ordering by `workspace_seq DESC`, and records the ownership move in the coordination doc in its own
  commit.

- **R10 — `getEntityState('membership', …)` (T4).** Nobody in Plan 3 or Plan 4 makes membership
  entity state honest, and the failure mode is a silently closed role gate with a legitimate-reading
  refusal and a green suite. **Conservative option: assign it to T4**, same change set as
  `proj_memberships`, with engine-context tests proving a granted member resolves and a revoked one
  returns `null`.

- **R11 — who creates `Features.md` §6 and `test-cases/06-auth-visibility.md` (T12 vs T13).**
  The partition gates put T13 (B2) before T12 (B1), inverting the plan's own order. **Conservative
  option: T13 creates both sections** with the §6 header and its own bullets/cases; T12 inserts
  6.1–6.22 above T13's block and prepends its §6 bullets. **Never renumber** — 6.23–6.31 keep their
  ids, and buckets 03–05 are untouched.

- **R12 — where `Queryable` lives (T1).** `src/db/queryable.ts` (a new directory beside the existing
  `src/db.ts`) or an added export on `src/db.ts`. Plan 7's server T7/T8 are blocked on the specifier.
  **Conservative option: the plan's `src/db/queryable.ts`**, because it is the path Plan 7's own text
  will have been written against; whichever is chosen, **T1 records it in the coordination doc in the
  landing commit** and it merges as a micro-PR when green.

- **R13 — `ingestBatch`'s widened signature and the internal append path (T5).**
  **Conservative option: `ingestBatch(rawEvents, ctx: { sessionUserId: string | null })` with the
  second parameter REQUIRED** — an unauthenticated call site becomes a compile error rather than a
  silent bypass — and the server-origin bootstrap recognised by the pair
  (`sessionUserId: null` **and** `origin: 'server'`), never by a second append function. The 31
  existing tests move in the same change set.

**Owed to the coordination doc, ruled by the task that hits them (not blockers to dispatch):**

- **R14 — the `pg_locks` lock-order test (T5).** Plan 4 is the series' second both-lock production
  path (the founding sequence takes `lockWorkspace` once and `lockEntity` seven times across four
  entity kinds; acceptance takes three-plus more), so the test becomes falsifiable here and is owed
  here. **Conservative option: write it** — hold the pair in one transaction and assert the
  acquisition order actually observed.
- **R15 — `projInvites.reset` (T14).** **Conservative option: `TRUNCATE proj_invites`**, leaving
  `invite_tokens` untouched, so Plan 2's entity↔workspace-door argument keeps its second leg.
- **R16 — the invite 404 body (T14).** Specified nowhere. **Conservative option: reuse
  `{ error: 'not_found' }`**, so unknown, revoked and spent stay indistinguishable from a nonexistent
  route target — the same body T8 already uses.
- **R17 — test-count drift.** T3 (13 vs 14), T7 (7 vs 8; "1 test" vs 2), T12 (6.1–6.20 vs 6.22).
  **Conservative option: resolve every one by literal count** and correct the plan's number, never
  delete a written test to match a stated total.
- **R18 — T4's dead guest-inference branch and case 6.5.** **Conservative option: delete the branch
  and rewrite the case** against a workspace-scope guest grant, which is seedable through the shipped
  parsers. A guard with no reachable path proves nothing.
- **R19 — the owner read bypass overrides two pieces of Plan 4's own text (T4's note, T7's table).**
  **Conservative option: the owner amendment governs** — owner row all-yes in both `canSeeResolved`
  and `listVisibleTickets`, admins unchanged, cases 6.39/6.40 kept separate as the drift alarm.

---

## 4. Recommended DISPATCH ORDER

Gates: partition **A** and **B2** run now (the Plan 3 keystone is on `main` at `f363b2f`).
Partition **B1** waits on lane 1's `proj_tickets` / `proj_rollups` migrations reaching
`origin/main`. Re-run the adaptation map at the wave boundary before any B1 brief is written
(discipline I8) — nothing in the "Unverifiable" section of the map may be assumed.

**Partition A — today, on `f363b2f`**

1. **T1** — `Queryable`, senders, `createAuth`, vendor schema. First because R12's specifier gates
   Plan 7, because the better-auth pin must be read from the installed package before T2 is briefed,
   and because the db-helper policy (map §9) must be settled before six later tasks import a helper
   that does not exist. Implementer tier **opus/high**, not sonnet: "pin the latest 1.x at execution
   time" makes this adaptation work, not transcription. **Merge `Queryable` as a micro-PR when green.**
2. **T3** — domain vocabulary (+ the R1 envelope amendment). Second because it is the riskiest single
   edit in the lane and because T4, T6, T9-3b and T13 all consume types it registers. Runs in parallel
   with T2 (disjoint packages).
   **T2** — auth routes, `require-session`, `signInWithPhone` (the superset shape from R-T2↔T13).
   Depends only on T1.
3. **T4** — `proj_memberships`, `effective-role`, `test/helpers/envelope.ts`, **plus the
   `engine-context.ts` membership branch (R10)** and the first entry in §0's array + the order test.
4. **T5 steps 1–5** — the gate in `commitOne` line 119, the widened `ingestBatch` (R13), the
   `requireSession` preHandler on `POST /v1/events`, and the 31 updated tests. Land **early**: it is
   the lane's highest merge-conflict surface. Runs in parallel with T6 (T5 does not touch
   `projections/index.ts`).
   **T5's `simple-kanban.ts`** ships as its own micro-PR the moment it is green — Plan 8 T3 is waiting
   on it and must not create it. Record the flat path in the coordination doc in that commit.
   **T6** — `proj_visibility` (+ R5), second entry in the array.
5. **T9 step 3b** — `proj_projects`, `projectExists`, `projectNamedBy`, `checkProjectExists` (+ R4).
   Last in A: it needs T3's `project.created`, T5's `check-permission.ts`, and the array slot ahead of
   both T4's and T6's entries.

**Partition B2 — immediately after A (keystone already satisfied)**

6. **T5 step 6** — `bootstrapWorkspace` and the multi-append transaction (+ R14's lock-order test).
   **Split it:** the founding-order assertion reads `events` ordered by `workspace_seq` and runs here;
   the integration case "a workspace can hold a ticket immediately" (case 6.25) needs `proj_tickets`
   and Plan 3's reducer and **moves to B1**.
7. **T13** — `POST /v1/workspaces`, `GET /v1/me/workspaces`, `workspace-name.ts` (R9), and — under R11
   — the creation of `Features.md` §6 and `test-cases/06-auth-visibility.md`.
   **Split it too:** its "the founded workspace arrives usable" test queries `proj_ticket_types`,
   which is **not on `main`** (three migrations only, none of them ticket types). In B2 it asserts the
   founder's owner row, the `proj_workflows` row, and the four `ticket-type.defined` events in
   `workspace_seq` order from the `events` table; the `proj_ticket_types` assertion moves to B1.

**Partition B1 — after lane 1's `proj_tickets` / `proj_rollups` reach `origin/main`**

8. Re-run the adaptation map against the new `origin/main`; rewrite the B1 briefs from it.
9. **T7** — `canSee` + `listVisibleTickets` + `seed.ts`, with the owner bypass in **both** copies and
   cases 6.39/6.40 as the guard (moved here from T14's block). Floor **opus/high**, reviewer top-tier.
10. **T8** — `routes/tickets.ts` (+ R6) and `test/helpers/ledger.ts`.
    **T9 steps 1–3** — `checkVisibilityPermission`. Parallel with T8 (T8 does not touch
    `check-permission.ts`); both depend only on T7.
11. **T10** — `rollup.ts` and the `{ticket, parent, rollup}` shape change. After T8.
12. **T11** — `visible-events-for.ts` (+ R3). After T7 and T8's ledger helper. Floor **opus/high**.
13. **T12** — `security.test.ts`, the verifier round-trip, and (under R11) 6.1–6.22 inserted **above**
    T13's block. After everything it cites.
14. **T14** — invites. **Last**, because it touches T11's file, T5's gate, `projections/index.ts`,
    `envelope.ts`, `config.ts`, `Features.md` and `test-cases/06` — five of them behind another Plan 4
    task. Floor **opus/high** (token custody), reviewer top-tier.
15. Deferred from earlier partitions and run here: T5 step 6's case 6.25, T13's `proj_ticket_types`
    assertion.

**Standing obligations for every dispatch in this lane:** each brief carries the sibling lanes'
current branch heads; import origins come from shipped code, never plan text; the `projections/index.ts`
and `projection-order.test.ts` merge is union-on-§0, never "ours"/"theirs"; mutation restorations are
verified with `git diff` or by reading the file, **never** with a proxied shell `diff`; and no gate is
thinned for throughput — budget pressure defers work, it never thins a gate.
