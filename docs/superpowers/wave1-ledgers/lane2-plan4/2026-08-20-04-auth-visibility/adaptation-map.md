# Plan 4 (auth, workspaces & visibility) — Adaptation Map

**Binding basis.** Every ruling below was verified against the working tree at
`main` = `f363b2f` ("The ruling that was made in code and written nowhere…").
`git ls-remote --heads origin` shows exactly three refs — `main`,
`pre/doc-to-plain-text`, `pre/domain-type-hoist` — so **no sibling lane branch
head exists to bind against.** Plan 3's keystone (ticket types + the eleven-type
event vocabulary + the §9 engine-context rider) is on `main`; the rest of Plan 3
is not, and nothing in it may be assumed.

**Suite state at bind time.** `pnpm -r run test` is green: `packages/domain`,
`packages/rule-engine` (115 tests, 4 files), `apps/server` (93 tests, 14 files).
Postgres is up on `localhost:54329` (`docker-compose.yml:13`).

**This map is BINDING over Plan 4's task text.** Where the plan and shipped code
disagree, shipped code wins and the "Implementer writes" line is what goes in
the file.

> **Durability warning.** `.superpowers/sdd/.gitignore` is `*`. This file is
> gitignored — the exact failure mode the coordination doc names twice ("a
> correct ruling whose entire value lives in a note is worth exactly as much as
> the note is durable"). Anything here that survives execution as a *cross-plan*
> ruling must be committed into the coordination doc **by the task that acts on
> it**, not at plan end.

---

## 1. Migrations are handwritten `.sql`, not generated `.cjs`

- **Plan says:** `apps/server/migrations/<ts>_auth-tables.cjs`,
  `<ts>_proj-memberships.cjs`, `<ts>_proj-visibility.cjs`,
  `<ts>_proj-projects.cjs`, `<ts>_proj-invites.cjs`
  (plan lines 55–58, 103, 320, 1227, 1467, 2386, 2422, 3846, 3853, 5171), created
  via `pnpm exec node-pg-migrate create <name>`.
- **Main has:** three handwritten `.sql` files:
  `apps/server/migrations/1787841717635_events-and-snapshots.sql`,
  `1787847393435_proj-entity-heads.sql`,
  `1787896601515_proj-workflows.sql`. Each is a plain SQL file split by two
  literal marker comments, `-- Up Migration` and `-- Down Migration`
  (`1787841717635_events-and-snapshots.sql:1` and `:50`;
  `1787896601515_proj-workflows.sql:1` and `:22`).
- **Evidence:**
  - `apps/server/package.json:11` — `"migrate": "node-pg-migrate up --migrations-dir migrations"` (no `create` script).
  - `apps/server/test/helpers/db.ts:40-46` — migrations are run by the programmatic
    `runner({ databaseUrl, dir: MIGRATIONS_DIR, direction: 'up', migrationsTable: 'pgmigrations', log: () => {} })`,
    with `MIGRATIONS_DIR = fileURLToPath(new URL('../../migrations', import.meta.url))` (`db.ts:12`).
  - `apps/server/test/migrations.test.ts:44-53` — the shipped shape of a migration
    test: assert `information_schema.tables` contains the new table.
- **Implementer writes:** a new file `apps/server/migrations/<epoch-ms>_<name>.sql`
  whose timestamp prefix is **greater than 1787896601515**, containing
  `-- Up Migration`, the DDL, then `-- Down Migration` and the drops — mirroring
  `1787896601515_proj-workflows.sql` verbatim in structure (including
  `COMMENT ON TABLE`/`COMMENT ON COLUMN`, which every shipped migration carries).
  Do **not** run `node-pg-migrate create`; do not author `.cjs`.
  Every new table **MUST carry a PRIMARY KEY** and **MUST NOT** use a `json`
  column (`jsonb` is fine — `proj_workflows.definition` proves it): the verifier
  diffs with `EXCEPT`, which needs an equality operator and cannot see duplicate
  rows (coordination "Plan 1 execution consequences" §1 and §3;
  `apps/server/src/projections/registry.ts:15-21`).
- **Affects tasks:** 1, 4, 6, 9, 14.

---

## 2. The ingest seam: `pipeline.ts` does not exist — the gate goes in `commitOne`

- **Plan says:** `apps/server/src/ingest/pipeline.ts`, "exposing the point where
  `parseEvent` has succeeded and `evaluateEvent(env, ctx)` is about to run"
  (plan line 46); export named `ingestEvent(e, { db, sessionUserId })`
  (plan lines 2221, 2237, 2275, 2298, 2312, 2327); internal append referenced as
  `append`/`appendAndProject`; wiring step at plan lines 2018–2034.
- **Main has:** `apps/server/src/ingest/ingest-service.ts`, exporting
  `createIngestService(deps: IngestDeps): IngestService` and the types
  `IngestDeps`, `IngestService`, `CommittedEventListener`. There is no
  `ingestEvent`, no `appendAndProject`, no `pipeline.ts`.
- **Evidence — the EXACT insertion point.** `parseEvent` succeeds in
  `ingestBatch` (`ingest-service.ts:163-173`) and the per-event transaction is
  `commitOne` (`ingest-service.ts:73-157`). The gate goes **inside `commitOne`,
  after the entity↔workspace mismatch block ends at line 118 and before
  `deps.evaluate` at line 120**:

  ```ts
  // ingest-service.ts:109-124  (surrounding lines, verbatim)
  109      const head = await readEntityHead(client, envelope.entity.kind, envelope.entity.id);
  110      if (head !== null && head.workspaceId !== envelope.workspaceId) {
  111        await client.query('ROLLBACK');
  112        return {
  113          status: 'refused',
  114          eventId: envelope.id,
  115          rule: ENTITY_WORKSPACE_MISMATCH_RULE,
  116          reason: `This ${envelope.entity.kind} belongs to workspace …`,
  117        };
  118      }
  119                                  // <-- PLAN 4 TASK 5's PERMISSION GATE GOES HERE
  120      const verdict = await deps.evaluate(envelope, createEngineContext(client));
  121      if (verdict.refused) {
  122        await client.query('ROLLBACK');
  123        return { status: 'refused', eventId: envelope.id, rule: verdict.rule, reason: verdict.reason };
  124      }
  ```

  Line 119 and **not** the `ingestBatch` loop, for three reasons visible in the
  code: (a) `checkPermission(db, env, sessionUserId)` needs a `db` handle, and
  `client` — the transaction's own client — is the only handle that reads the
  world the engine is about to judge against; (b) `env` (a full `LedgerEvent`
  with `seq`/`workspaceSeq`/`serverTime`) does not exist until line 86, whereas
  `ingestBatch` holds only a `SubmittedEvent`; (c) the mismatch check at 109–118
  is already documented (lines 95-99) as belonging *after* the locks and *before*
  `deps.evaluate` — Plan 4's gate is the second occupant of that same slot.
- **Implementer writes (Task 5 Step 5):** a permission refusal returns in
  `commitOne`'s own shape, not the plan's bare `Refusal`:

  ```ts
  const permissionRefusal = await checkPermission(client, envelope, sessionUserId);
  if (permissionRefusal) {
    await client.query('ROLLBACK');
    return {
      status: 'refused',
      eventId: envelope.id,
      rule: permissionRefusal.rule,
      reason: permissionRefusal.reason,
    };
  }
  ```

  The plan's `return permissionRefusal;` would return a `Refusal`
  (`{refused, rule, reason}`) where `IngestResult` is required
  (`packages/domain/src/ingest-result.ts:14-17`) **and would leak an open
  transaction** — every other early return in `commitOne` does `ROLLBACK` first.
- **Threading `sessionUserId` — a signature change the plan does not name.**
  `IngestService.ingestBatch(rawEvents: unknown[]): Promise<IngestResult[]>`
  (`ingest-service.ts:50`) takes no caller identity, and
  `registerEventRoutes(app, ingest)` calls `ingest.ingestBatch(events)` with no
  preHandler and no session (`apps/server/src/routes/events.ts:11, 26-29`).
  Task 5 must widen it. The shape that keeps Plan 13's and Plan 10's callers
  honest:
  `ingestBatch(rawEvents: unknown[], ctx: { sessionUserId: string | null }): Promise<IngestResult[]>`
  — threaded into `commitOne(submitted, ctx)`. `apps/server/test/events-route.test.ts`
  and `apps/server/test/ingest.test.ts` (31 tests between them) call the current
  arity and must be updated in the same change set; make the second parameter
  **required** rather than optional, so an unauthenticated call site is a
  compile error rather than a silent bypass.
- **The internal (server-origin) path the gate must NOT see.** Plan Step 6
  constraint 3 requires the workspace bootstrap to append through the shared
  ingest path while bypassing `checkPermission`. On main there is exactly one
  path (`commitOne`). Task 5 supplies it by passing a sentinel the gate
  recognises — the cleanest form given `checkRolePermission` already refuses
  `origin: 'server'` from clients (plan line 1808): an internal caller passes
  `{ sessionUserId: null }` **and** `origin: 'server'`, and `checkPermission`
  returns `null` for that pair only. Do not add a second append function; the
  bootstrap must go through `commitOne` so it gets the locks, the seqs, the
  projections and `notifyCommitted`.
- **Bootstrap hook point.** Step 6 constraint 2 ("fires on accept, never on
  duplicate") maps to the `return { status: 'committed', … }` branch —
  `ingest-service.ts:132`, after `COMMIT` at line 130. The duplicate path is
  `ingest-service.ts:142-149` and must not fire it.
- **The gate does NOT read memberships through `EngineContext`.** Stated plainly
  because the plan never says it: `checkPermission` calls
  `resolveEffectiveRole(db, sessionUserId, env.workspaceId)` (Task 4), which
  queries `proj_memberships` **directly** off the transaction's own `client`. It
  never touches `createEngineContext` / `getEntityState`. The two are separate
  consumers of the same table: the gate is the *server's* door and needs an
  `EffectiveRole` (workspace role + a `projects` Map), while the context's
  `'membership'` branch (§13) exists for the *engine's* `restrict-to` rule,
  which needs a `MembershipState`. Both must land in Task 4; neither substitutes
  for the other.
- **Related recorded seam, do not fork it.** Coordination amendment 15 records
  `IngestDeps.gates?: ServerGate[]` — "Plan 7 extends Plan 1's ingest contract
  additively (default `[]`) with gates that run inside `ingestBatch`'s
  transaction." That seam does **not** exist on main
  (`IngestDeps` = `{pool, evaluate, projections, registry?, now?}`,
  `ingest-service.ts:25-31`) and Plan 4 arrives first. Plan 4 wires
  `checkPermission` directly as above; if the T5 implementer chooses to
  introduce the array instead, it must be spelled `gates?: ServerGate[]` on
  `IngestDeps` exactly as amendment 15 pins it, so Plan 7 appends rather than
  re-plumbs.
- **Affects tasks:** 5, 9, 12, 13, 14 (and every test that ingests).

---

## 3. Event-type registry: `domainRegistry.register`, not `registerEventType`

- **Plan says:** `packages/domain/src/events/registry.ts` exporting
  `registerEventType({type, version, entityKind, parsePayload})`; "payload
  parsers throw `Error` on invalid input" (plan line 43). Task 3 registers
  membership/visibility types through it.
- **Main has:** `packages/domain/src/registry.ts` (not under `events/`) exporting
  `createEventTypeRegistry(): EventTypeRegistry` and the type
  `EventTypeRegistration = { type, version, payloadSchema: z.ZodTypeAny, entityKind? }`.
  There is no `registerEventType`. Registration is
  `domainRegistry.register({...})`, and the field is **`payloadSchema` (a zod
  schema), not `parsePayload` (a throwing function)**.
- **Evidence:**
  - `packages/domain/src/registry.ts:4-17` (the registration shape), `:25-44`
    (`createEventTypeRegistry`, which throws on a duplicate `type@version`).
  - `packages/domain/src/vocabulary.ts:26` — `export const domainRegistry = createEventTypeRegistry();`
  - `packages/domain/src/vocabulary.ts:28-141` — all fourteen registrations
    (3 workspace/workflow + the 11-type ticket vocabulary).
  - `packages/domain/src/parse-event.ts:87-97` — payload validation is
    `registration.payloadSchema.safeParse(...)` returning
    `{ok: false, code: 'invalid-payload', …}`; **nothing throws.**
- **The file split Task 3 must follow** (stated at
  `packages/domain/src/events/ticket-events.ts:4-10` and reaffirmed at
  `vocabulary.ts:22-24`): **schemas live beside the concept, registrations live
  in `vocabulary.ts`.** Registering anywhere else means "the registry is
  complete for importers of the barrel but not for importers of `parseEvent`".
- **Implementer writes (Task 3):**
  - `packages/domain/src/events/membership.ts` — zod schemas
    (`membershipGrantedPayload`, `membershipRevokedPayload`,
    `projectMemberAddedPayload`, `projectMemberRemovedPayload`) plus their
    inferred types (`MembershipGrantedPayload` etc. via `z.infer`). No
    registrations in this file.
  - `packages/domain/src/events/visibility.ts` — `visibilitySetPayload` +
    `VisibilitySetPayload`. No registrations.
  - `packages/domain/src/vocabulary.ts` — **append**
    `domainRegistry.register({ type: 'membership.granted', version: 1, entityKind: 'membership', payloadSchema: membershipGrantedPayload })`
    and its four siblings, with the imports added at the top of the file.
  - `packages/domain/src/index.ts` — append
    `export * from './events/membership.js';` and
    `export * from './events/visibility.js';` after line 16. (The barrel is
    flat `export *` lines with `.js` specifiers; `index.ts:17` is the sole named
    export, `makeEnvelope`.)
  - Payload strictness: follow `vocabulary.ts:32` (`.strict()`) for the
    workspace-shaped seeds vs. the ticket vocabulary's non-strict objects. The
    `.strict()` choice is load-bearing for one recorded decision — coordination
    "Outstanding from this wave" requires `membership.granted`/`revoked` to
    **refuse** a `scope` key rather than ignore it. `.strict()` is what makes
    that refusal happen at the door.
- **Affects tasks:** 3, and every task that adds an event type (5, 9, 14).

---

## 4. `LedgerEvent`, `IngestResult`, `IngestErrorCode`, `ENTITY_WORKSPACE_MISMATCH_RULE` are in the domain barrel

- **Plan says:** `import type { LedgerEvent } from '../../src/ledger/event-store'`
  (plan lines 1247, 3256, 4197) and `'../ledger/event-store'` (line 4407).
- **Main has:** the hoist landed (commit `3750451`). All four live in
  `@gisik-nokma/domain` and **`event-store.ts` only imports the type — it does
  not re-export it.** The plan's relative import therefore *fails to compile*,
  not merely drifts.
- **Evidence:**
  - `packages/domain/src/ledger-event.ts:8` — `export type LedgerEvent = EventEnvelope & { workspaceSeq: number };`
  - `packages/domain/src/ingest-result.ts:3` (`IngestErrorCode`), `:12`
    (`ENTITY_WORKSPACE_MISMATCH_RULE`), `:14-17` (`IngestResult`).
  - `packages/domain/src/index.ts:3` (`export * from './ledger-event.js'`) and
    `:7` (`export * from './ingest-result.js'`).
  - `apps/server/src/ledger/event-store.ts:2` —
    `import type { EntityKind, LedgerEvent, Origin } from '@gisik-nokma/domain';`
    (an `import type`, with no `export` of it anywhere in the file).
  - `apps/server/src/ingest/ingest-service.ts:2-11` — the server's own import
    of all four from the barrel.
- **Implementer writes:** `import type { LedgerEvent } from '@gisik-nokma/domain';`
  in every one of the four sites. Coordination "Plan 1 consequences" §10 assigned
  this hoist to Plan 10; it is **discharged early** by the pre-work micro-PR, and
  Plan 4 must not re-do or re-declare it.
- **Affects tasks:** 4, 8, 11 (T11 is the sync-down reader that most depends on it).

---

## 5. `Refusal` is in `@gisik-nokma/rule-engine`, not `@gisik-nokma/domain`

- **Plan says:** "Consumes: `Refusal` shape from `@gisik-nokma/domain`" (line 1762)
  and `import type { EventEnvelope, Refusal } from '@gisik-nokma/domain';` (line 1931).
- **Main has:** `Refusal` defined and exported only from the rule-engine.
- **Evidence:**
  - `packages/rule-engine/src/engine.ts:3` —
    `export type Refusal = { refused: true; rule: string; reason: string };`
  - `packages/rule-engine/src/index.ts:5` — `export * from './engine.js';` (so the
    package specifier resolves).
  - `grep -rn "Refusal" packages/domain` → no match. It is not in the domain barrel.
  - Coordination "Plan 1 consequences" §10 already pre-rules this: *"Plan 4 is
    internally inconsistent about it… almost certainly a plan typo… Plan 4's
    executor takes the import origin from the shipped code, not from the plan text."*
- **Implementer writes:**
  ```ts
  import type { EventEnvelope } from '@gisik-nokma/domain';
  import type { Refusal } from '@gisik-nokma/rule-engine';
  ```
  The **shape** `{refused: true; rule: string; reason: string}` is contract-fixed
  and unchanged — only the specifier moves. `apps/server` already depends on
  `@gisik-nokma/rule-engine` (`apps/server/package.json:16`), so no dependency is added.
- **Affects tasks:** 5, 9, 12, 14.

---

## 6. `membershipId` already exists — no Plan 4 task creates it

- **Plan says:** Task 3 consumes "Plan 2: `membershipId(workspaceId, userId)`
  helper from `@gisik-nokma/domain`" (plan line 43 area / Task 3 Consumes).
- **Main has:** it, shipped and tested.
- **Evidence:**
  - `packages/domain/src/entity-state.ts:57-59` —
    `/** The entity id of a user's membership in a workspace — the cross-plan convention (Open question 4). */`
    `export function membershipId(workspaceId: string, userId: string): string { return `${workspaceId}:${userId}`; }`
  - Barrel: `packages/domain/src/index.ts:12` (`export * from './entity-state.js'`).
  - Live consumers: `packages/rule-engine/src/rules/restrict-to.ts:1, 25`;
    `packages/rule-engine/src/fixtures/harness.ts:6, 181`;
    `apps/server/test/engine-context.test.ts:2, 92, 116`.
  - Test: `packages/domain/test/entity-state.test.ts:9-11` asserts
    `membershipId('ws_1','user_a') === 'ws_1:user_a'`.
- **Also already present** and needing no creation: `WorkspaceRole`
  (`entity-state.ts:3`), `MembershipState` (`:41-47`), `EventEnvelope`
  (`envelope.ts:55-67`), `SubmittedEvent` (`envelope.ts:70`), `newUlid`
  (`ids.ts:13`), `builtinTicketTypeDefs` (`ticket-types.ts:85`).
- **Implementer writes:** import it; create nothing.
- **Affects tasks:** 3, 4, 7, 11.

---

## 7. A membership event's `entity.id` is refused at the door — CONTRACT COLLISION

**This is the single finding most likely to stop Task 3 on its first test.**

- **Plan says / coordination §5 says:** "Membership entity id is deterministic:
  `membershipId(workspaceId, userId)` = `` `${workspaceId}:${userId}` ``…
  the engine must address a membership from `(workspaceId, actorId)` via
  `getEntityState('membership', id)`, which an opaque ULID cannot do."
- **Main has:** an envelope door that requires **every** `entity.id` to be a
  bare ULID, for every kind — so the composite id is `malformed-envelope`
  before any Plan 4 code runs.
- **Evidence:**
  - `packages/domain/src/envelope.ts:75` —
    `entity: z.object({ kind: z.enum(ENTITY_KINDS), id: ulidString })`.
  - `packages/domain/src/envelope.ts:53` — `ulidString = z.string().regex(ULID_REGEX, 'must be a ULID')`.
  - `packages/domain/src/ids.ts:9` — `ULID_REGEX = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/`.
  - Executed check: `ULID_REGEX.test('01J60000000000000000000WKA:01J6000000000000000000ACTR')` → **`false`**.
  - `packages/domain/src/parse-event.ts:34-44` — a failing `submittedEventSchema`
    returns `{ok:false, code:'malformed-envelope'}` **before** type lookup,
    kind binding, or payload parsing.
  - Why nothing on main catches it: `'membership'` IS an admitted kind
    (`envelope.ts:4`), but no membership event type is registered
    (`vocabulary.ts` holds fourteen types, none of them membership), and the one
    server test that uses composite ids inserts DB rows directly rather than
    submitting events (`apps/server/test/engine-context.test.ts:92, 116`).
- **Ruling — implementer writes (Task 3, Step 0, before any registration):**
  amend the envelope's entity schema so `kind === 'membership'` admits the
  composite form and every other kind keeps the bare ULID. Concretely, in
  `packages/domain/src/envelope.ts`, replace the flat object at line 75 with a
  superRefined one:

  ```ts
  // ids.ts — one origin for the pattern, as ULID_REGEX already is
  export const MEMBERSHIP_ID_REGEX = /^[0-7][0-9A-HJKMNP-TV-Z]{25}:[0-7][0-9A-HJKMNP-TV-Z]{25}$/;

  // envelope.ts — replaces the flat z.object at line 75
  const entitySchema = z
    .object({ kind: z.enum(ENTITY_KINDS), id: z.string() })
    .superRefine((entity, ctx) => {
      const ok = entity.kind === 'membership'
        ? MEMBERSHIP_ID_REGEX.test(entity.id)
        : ULID_REGEX.test(entity.id);
      if (!ok) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['id'],
          message: entity.kind === 'membership'
            ? 'a membership entity id is `${workspaceId}:${userId}` (coordination §5)'
            : 'must be a ULID',
        });
      }
    });
  ```

  …with `submittedEventSchema.entity` bound to it. Cite coordination
  §5 at the site (it is the decision that sanctions the exception, and it
  explicitly killed the fresh-ULID alternative as drift). Add the two
  falsifiable cases to `packages/domain/test/envelope.test.ts`: a membership
  event with a bare ULID entity id is refused, and one with the composite is
  admitted.
  This **does not** touch the frozen `EventEnvelope` *type* (still
  `entity: { kind; id: string }`), only the door's shape check — so amendment
  §18's "the domain `EventEnvelope` stays frozen" is honoured.
- **Alternative, if the owner declines the envelope amendment:** membership
  events carry a ULID `entity.id` and Task 4's engine-context branch resolves
  the composite id by splitting on `:` and querying `proj_memberships` by
  `(workspace_id, user_id)`. This satisfies §5's *purpose* but not its *text*,
  and it costs `membership.granted` and `membership.revoked` a shared entity
  stream (no deterministic ULID exists for a `(workspace, user)` pair). Raised
  in **Blockers** as an owner ruling request.
- **Affects tasks:** 3, 4, 5, 7, 11, 12, 13, 14.

---

## 8. Readable placeholder ids do not survive the door — ULIDs in every ingested fixture

- **Plan says:** fixtures throughout use `'tkt_1'`, `'tkt_parent'`, `'prj_1'`,
  `'prj_first'`, `'usr_founder'`, `'usr_guest'`, `'usr_stranger'`, `'ws'`
  (plan lines 1794–1917, 2309, 3001, 3390–3408, 3427, 4010–4041, 4137–4138,
  4246–4247, 4267–4268, 4327, 4761, 4798, and every `seedTicket` call).
- **Main has:** `id`, `workspaceId`, `entity.id` and `actorId` are all
  `ulidString` at the door.
- **Evidence:** `packages/domain/src/envelope.ts:72-82` (all four fields);
  executed check `ULID_REGEX.test('tkt_1')` → **`false`**;
  `packages/domain/src/testing.ts:14-16` states the rule outright — *"The
  defaults are ULIDs because `submittedEventSchema` requires them of
  `workspaceId` and `actorId`: a readable placeholder like 'user-kiro' is
  refused as a malformed envelope before any payload schema is consulted."*
  Note `ticketCreatedPayload.projectId` and `.parentId` are **also** `ulidString`
  (`packages/domain/src/events/ticket-events.ts:18-19`), so `'prj_1'` fails
  even inside a payload.
- **Implementer writes:** a fixture that crosses `parseEvent`, `ingestBatch`, or
  an HTTP route uses real ULIDs — `newUlid()` from `@gisik-nokma/domain`, or a
  hand-written 26-char constant in the `apps/server/test/migrations.test.ts:27-33`
  style (`'01J60000000000000000000WKA'`, `'01J6000000000000000000ACTR'`) when a
  test needs a stable, greppable value. Bind the readable name to a ULID
  constant (`const TKT_1 = '01J6000000000000000000TK01';`) rather than
  scattering literals.
  **Exception, and it is real:** fixtures that call `projection.apply(event, tx)`,
  the pure `checkRolePermission(env, ctx)`, or raw SQL never cross the door and
  may keep readable strings — `Projection.apply` takes a typed `LedgerEvent`
  with no runtime validation (`apps/server/src/projections/registry.ts:47`), and
  plan lines 1794/1808's `payload: {}` unit envelopes are exactly this case.
  Decide per test, by whether `parseEvent` is on the path.
- **Affects tasks:** every task that writes a test — 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14.

---

## 9. Test DB: `createTestDatabase()`, per-file databases, port 54329 — extend, never duplicate

- **Plan says:** `apps/server/test/helpers/db.ts` exporting
  `TEST_DATABASE_URL` (default `postgres://postgres:postgres@localhost:5432/gisik_nokma_test`),
  `migrateTestDb`, `testPool`, `truncateAll` (plan lines 49, 413–426, 443, 450,
  1579, 2614; T4/T6/T7/T12/T13 all import the trio).
- **Main has:** a shipped `apps/server/test/helpers/db.ts` with a **completely
  different API**: one export, `createTestDatabase(): Promise<TestDatabase>`,
  where `TestDatabase = { pool: Pool; url: string; drop(): Promise<void> }`.
  It creates a **uniquely named database per call** (`gisik_test_<uuid>`), ALTERs
  it to `Asia/Kolkata`, runs every migration through `runner(...)`, and returns a
  pool built by `createPool` so the int8 parser and the IST session are installed.
  There is no `TEST_DATABASE_URL`, no `truncateAll`, no shared database — and
  therefore **nothing to truncate between tests.**
- **Evidence:**
  - `apps/server/test/helpers/db.ts:9-10` —
    `const ADMIN_URL = process.env['TEST_DATABASE_ADMIN_URL'] ?? 'postgres://gisik:gisik@localhost:54329/postgres';`
    (env var name `TEST_DATABASE_ADMIN_URL`, user `gisik`, **port 54329**, not
    `TEST_DATABASE_URL`/`postgres`/5432).
  - `apps/server/test/helpers/db.ts:14-18` (the `TestDatabase` type), `:31-59`
    (the whole helper), `:20-30` (the docstring: *"Each test file gets its own
    database — files can run in parallel without sharing state."*).
  - `docker-compose.yml:12-13` — `ports: - "54329:5432"`, `POSTGRES_USER: gisik`.
  - The shipped call pattern, in all 11 DB-touching test files, e.g.
    `apps/server/test/events-route.test.ts:9-17`:
    `let db: TestDatabase; beforeAll(async () => { db = await createTestDatabase(); }); afterAll(async () => { await db.drop(); });`
- **Implementer writes:** `import { createTestDatabase, type TestDatabase } from '../helpers/db.js'`
  and the `beforeAll`/`afterAll` pair above. **Do not add `testPool`,
  `migrateTestDb`, or `TEST_DATABASE_URL`** — each would be a second answer to
  a question already answered, and `TEST_DATABASE_URL` would point at a port
  with nothing on it. Where the plan calls `truncateAll()` between cases within
  one file, either (a) give each case its own ULIDs so rows cannot collide
  (preferred — matches the shipped fixtures), or (b) add a narrowly named
  `truncateProjections(pool)` to `helpers/db.ts` that truncates only the
  `proj_*` tables. It may **never** truncate `events`: the append-only trigger
  refuses TRUNCATE with `P0001 'events is append-only: TRUNCATE refused'`
  (`apps/server/migrations/1787841717635_events-and-snapshots.sql:36-38`;
  proven at `apps/server/test/migrations.test.ts:152-157`).
- **Affects tasks:** 1, 4, 6, 7, 8, 10, 11, 12, 13, 14.

---

## 10. Projection registry: `Projection` object + `buildProjectionRegistry`, not `registerProjection`

- **Plan says:** "Plan 1's `registerProjection({name, apply, reset})` at
  `apps/server/src/projections/index.ts`"; projections shaped
  `{ name, apply(env: EventEnvelope, db: Queryable), reset(db: Queryable) }`
  (plan lines 1237, 1509–1569, 2393).
- **Main has:** no `registerProjection` export. `index.ts` exports one function,
  `buildProjectionRegistry(): ProjectionRegistry`, whose body calls
  `registry.register(<projection object>)` on a locally created registry. The
  `Projection` type carries a **`tables: readonly string[]`** field the plan
  never mentions, and `apply` takes **`(event: LedgerEvent, tx: PoolClient)`** —
  a `LedgerEvent` (not `EventEnvelope`) and a `PoolClient` (not a `Queryable`).
- **Evidence:**
  - `apps/server/src/projections/index.ts:14-19` — the whole file:
    ```ts
    export function buildProjectionRegistry(): ProjectionRegistry {
      const registry = createProjectionRegistry();
      registry.register(entityHeadsProjection);
      registry.register(workflowsProjection);
      return registry;
    }
    ```
  - `apps/server/src/projections/registry.ts:44-49` — `Projection = { name; tables; apply(event: LedgerEvent, tx: PoolClient); reset(tx: PoolClient) }`.
  - `registry.ts:36-42` — an explicit **"DO NOT 'fix' this back to `EventEnvelope`
    on determinism grounds"** note. The plan's `apply(env: EventEnvelope, …)` is
    exactly that fix; do not make it.
  - `registry.ts:57-73` — `createProjectionRegistry`, which throws on a duplicate
    name and whose `all()` preserves insertion order.
  - `apps/server/src/projections/entity-heads.ts:11-42` — the reference
    implementation to copy (`name`, `tables`, idempotent `INSERT … ON CONFLICT`,
    `reset` = `TRUNCATE`).
  - Constraints on the type, all enforced by the verifier:
    `registry.ts:15-21` — unqualified table names only (never `public.x`),
    lowercase unquoted identifiers, **no `json` columns**;
    `apps/server/src/tools/verify-projections.ts:30-33, 46, 50` shows why
    (`SET search_path TO verify_shadow, public` is the only fence).
- **Registration order — the pin, and its two stale copies.**
  `apps/server/test/projection-order.test.ts:24-27` currently asserts exactly
  `['proj_entity_heads', 'proj_workflows']`. Coordination §8's authoritative
  order is
  `proj_entity_heads, proj_workflows, proj_ticket_types, proj_projects, proj_tickets, proj_rollups, proj_memberships, proj_visibility`.
  **Both shipped comments are stale** — `registry.ts:24-26` and
  `projection-order.test.ts:9-10` omit `proj_projects` — because they predate
  the 2026-08-26 owner decision that added it.
- **Implementer writes:** export a `Projection` **object literal**
  (`export const membershipsProjection: Projection = { name: 'proj_memberships', tables: ['proj_memberships'], async apply(event, tx) {…}, async reset(tx) {…} }`),
  add one `registry.register(...)` line to `buildProjectionRegistry`, and extend
  the `projection-order.test.ts` array **in the same commit** (the file's own
  docstring at `:16-17` makes this mandatory). Per coordination pre-ruling 6,
  whichever lane merges second writes the **full §8 order including
  `proj_projects`**, and fixes the two stale comments while there.
  Naming: the plan's `projMemberships`/`projVisibility` (lines 1237, 2393) drift
  from the shipped `entityHeadsProjection`/`workflowsProjection` convention —
  prefer the shipped suffix form; the `name` **string** (`'proj_memberships'`)
  is what the order test and the verifier bind to and is not negotiable.
- **Affects tasks:** 4, 6, 9, 14.

---

## 11. `Queryable` does not exist — Task 1 creates it, and it is Plan 7's blocker

- **Plan says:** `apps/server/src/db/queryable.ts` exporting
  `Queryable = Pool | PoolClient` (plan lines 61, 98, 120–131), consumed by
  Tasks 4, 5, 6, 7, 9, 10, 11.
- **Main has:** no `src/db/` directory and no `Queryable` anywhere
  (`grep -rn "Queryable" packages apps --include="*.ts"` → zero matches outside
  the plan). `apps/server/src/db.ts` exists but exports only `createPool`.
  Functions that accept either handle spell it inline:
  `client: PoolClient | Pool` (`event-store.ts:133, 155`;
  `projections/entity-heads.ts:45`).
- **Evidence:** `apps/server/src/db.ts:20-26` (whole file's exports);
  `apps/server/src/ledger/event-store.ts:133`;
  `apps/server/src/projections/entity-heads.ts:45`.
- **Implementer writes:** Task 1 creates `apps/server/src/db/queryable.ts`
  exactly as the plan specifies. Note the coexistence: `src/db.ts` and
  `src/db/queryable.ts` are legal side by side under NodeNext resolution, but
  read oddly — if the T1 implementer prefers, add `export type Queryable = Pool | PoolClient;`
  to the existing `src/db.ts` and have every consumer import from `'../db.js'`.
  **Whichever is chosen, choose it in Task 1 and record it**: coordination's
  Wave-1 schedule has *"Plan 7's server T7/T8 once Plan 4 T1 lands `Queryable`"* —
  another lane is waiting on this specifier.
  Do **not** retro-fit `Queryable` onto `Projection.apply`; that parameter is a
  `PoolClient` by design (§10 above).
- **Affects tasks:** 1 (creates); 4, 5, 6, 7, 9, 10, 11 (consume).

---

## 12. Fastify app: `buildApp(deps: AppDeps)`, synchronous, `coerceTypes: false`

- **Plan says:** `buildApp({pool, otpSender})` returning `{app}` (T12, plan line
  ~4700 area) and `buildApp({pool}) -> Promise<FastifyInstance>` (T13); "an
  app builder where routes are registered" (line 47); T8 adds
  `registerTicketRoutes(app, {pool, auth})`.
- **Main has:** `buildApp(deps: AppDeps, options?: { logLevel?: string }): FastifyInstance`
  — **synchronous, returns the instance directly (not `{app}`, not a Promise)**,
  and `AppDeps = { db: HealthDb; ingest: IngestService }` — **no `pool`, no
  `otpSender`**. `HealthDb` is the minimal `{ query(sql): Promise<unknown> }`.
- **Evidence:**
  - `apps/server/src/app.ts:19-22` (`AppDeps`), `:24` (the signature), `:60`
    (`return app;`), `:6` (`HealthDb`).
  - `apps/server/src/app.ts:58` — `registerEventRoutes(app, deps.ingest);` is the
    single registration line and the pattern Task 2/8/13/14 extend.
  - `apps/server/src/app.ts:29` —
    `ajv: { customOptions: { coerceTypes: false, removeAdditional: false } }`,
    **confirmed**, with the reasons at `:27-28`. Coordination "Plan 1
    consequences" §7 makes this instance-wide policy binding on the whole series:
    *"query and path parameters do not coerce either… Every later plan that adds
    a door inherits this; none of them may re-enable coercion instance-wide."*
  - `apps/server/src/app.ts:40-47` — the error handler: **any 5xx is replaced by
    the fixed `INTERNAL_ERROR_BODY`** (`:13-17`). A Plan 4 test asserting on a
    5xx message will see `'the server could not complete this request'` and
    nothing else.
  - Live call site: `apps/server/test/events-route.test.ts:19-26`.
- **Implementer writes:**
  - Task 2 widens `AppDeps` additively:
    `{ db: HealthDb; ingest: IngestService; pool: Pool; auth: Auth; otpSender: OtpSender; ... }`,
    and appends `registerAuthRoutes(app, deps.auth)` beside line 58. Keep
    `buildApp` **synchronous** if `createAuth` allows; if better-auth forces an
    `await`, changing the return to `Promise<FastifyInstance>` breaks all 14
    existing call sites — prefer constructing `auth` in the caller and passing it
    in, which keeps `buildApp` sync.
  - Tasks 8/13/14 append their own `registerXRoutes(app, …)` lines at the same
    point. `const server = buildApp({...})` — never `const { app } = ...`.
  - Any Plan 4 route with a query parameter (`?afterSeq=`, `?limit=`) converts
    it explicitly in the handler; AJV will hand over the **string**.
- **Affects tasks:** 2, 8, 10, 12, 13, 14.

---

## 13. `engine-context.ts`'s `'membership'` branch is Plan 4's, and no plan task names it

- **Plan says:** nothing. Plan 4 was written before the §9 rider existed.
- **Main has:** an explicit, signed hand-off to Plan 4.
- **Evidence:** `apps/server/src/engine-context.ts:59-63` —
  *"PLAN 3 TASK 12 is where this grows real bodies: 'ticket' from proj_tickets,
  'ticket-type' from proj_ticket_types. **Plan 4 owns 'membership' via
  proj_memberships.** Until each lands, its kind stays null here."*
  `:15-20` — `KINDS_WHOSE_STATE_IS_ONLY_IDENTITY` excludes `'ticket'` and
  `'membership'`; `:64-68` — `getEntityState` returns `null` for both.
  The consumer: `packages/rule-engine/src/rules/restrict-to.ts:25` —
  `await ctx.getEntityState('membership', membershipId(env.workspaceId, env.actorId))`.
- **Why it must land with Task 4 and not later.** This is coordination
  "Plan 1 consequences" §9's exact shape one layer down: with
  `proj_memberships` shipped but this branch still returning `null`,
  `evaluateRestrictTo` sees no membership and **every role-gated transition
  refuses**, with a plain-language reason that reads entirely legitimate and a
  green test suite (Plan 2's rule tests run against the in-memory fixture
  harness, `packages/rule-engine/src/fixtures/harness.ts:181`, never against
  this context).
- **Implementer writes (Task 4, same change set as `proj_memberships`):** replace
  the `'membership'` null with a real read — parse the composite id, query
  `proj_memberships` by `(workspace_id, user_id)`, and return a
  `MembershipState` (`packages/domain/src/entity-state.ts:41-47`:
  `{ kind: 'membership', id, workspaceId, userId, role }`). Update the comment
  at `engine-context.ts:59-63` to say the membership half is discharged, and add
  a case to `apps/server/test/engine-context.test.ts` (which already builds
  composite-id fixtures at `:92, :116`) that proves a granted member resolves
  and a revoked one returns `null`.
  **`role` must be a `WorkspaceRole`, and the union has no `scope`** — see §16.
- **Affects tasks:** 4 (owner), 5, 7, 12.

---

## 14. `ticket.created` and `ticket.reparented` payloads — the plan's literals are refused

- **Plan says:**
  - `created()` builds `payload: { projectId: PRJ, ...(parentId ? { parentId } : {}) }` (plan lines 2483–2488) and `seedTicket` the same (2856, 2874);
  - `reparented()` builds `payload: { parentId }` (2503–2508) and the projection reads `env.payload as { parentId: string | null }` (2711–2713);
  - the projection reads `env.payload as { projectId: string; parentId?: string }` (2698).
- **Main has (Plan 3 keystone, shipped):**
  - `ticketCreatedPayload = z.object({ typeId: z.string().min(1), projectId: ulidString, parentId: ulidString.nullable(), title: z.string().min(1) })`
    — **four required keys**; `parentId` is *nullable*, not *optional*, so the
    key must be **present** (`null` when absent), and `projectId`/`parentId` must
    be **ULIDs**.
  - `ticketReparentedPayload = z.object({ newParentId: ulidString.nullable() })`
    — the field is **`newParentId`**, not `parentId`.
- **Evidence:** `packages/domain/src/events/ticket-events.ts:16-21`
  (`ticketCreatedPayload`) and `:35` (`ticketReparentedPayload`); registrations
  at `packages/domain/src/vocabulary.ts:73-78` and `:115-120`.
- **Implementer writes:**
  - ingested `ticket.created`: `payload: { typeId: 'task', projectId: PRJ_ULID, parentId: PARENT_ULID ?? null, title: 'x' }`.
    The plan's spread-if-present form is refused `invalid-payload` at
    `parse-event.ts:87-97` (missing `typeId`, missing `title`, missing `parentId` key).
  - ingested `ticket.reparented`: `payload: { newParentId: NEW_PARENT_ULID_OR_NULL }`.
  - `proj_visibility`'s reader (T6) destructures
    `env.payload as { projectId: string; parentId: string | null }` for created
    and `as { newParentId: string | null }` for reparented.
  - There is **no `createdBy` in the payload** — the actor is `env.actorId`
    (`envelope.ts:62`). T9's `proj_tickets.created_by` read is a Plan 3 column
    (see Blockers).
- **Affects tasks:** 6, 7, 8, 9, 10, 11, 12.

---

## 15. `ticket.transitioned` — no adaptation needed (named check 7, discharged)

- **Plan says:** eleven `ticket.transitioned` sites (plan lines 1794, 1808, 1821,
  1916, 3427, 3630, 4246, 4247, 4327, 4761, 4798).
- **Main has:** `ticketTransitionedPayloadSchema = z.object({ to, comment: z.object({ text }).optional(), evidenceAttachmentId: z.string().optional(), cause: {kind:'reopened-for-child', childTicketId}.optional() })`.
- **Evidence:** `packages/domain/src/workflow.ts:137-145`; registered at
  `packages/domain/src/vocabulary.ts:80-85`; the reason recorded at
  `vocabulary.ts:50-60` and in coordination decision 6's 2026-08-28 amendment.
- **Verified result:** `grep -n "toStateId" <plan>` → **0 matches.** All eleven
  sites already spell `payload: { to: 'done' }` / `{ to: 'doing' }` or use
  `payload: {}` in pure `checkRolePermission` unit tests that never cross
  `parseEvent`. No `comment: '<bare string>'` appears anywhere.
- **Implementer writes:** nothing changes. **No Plan 4 line range needs adapting
  for the transition payload.** (Plans 5, 6, 10, 11 carry ~36 `toStateId`
  literals per coordination decision 6; Plan 4 does not.) The only adaptation
  these fixtures need is the ULID one in §8.
- **Affects tasks:** none — recorded so the T5/T12 implementers do not "fix" a
  correct spelling.

---

## 16. Membership carries no `scope` — and a `scope` key must be REFUSED

- **Plan says:** T13 asserts `proj_memberships` columns
  `workspace_id, user_id, scope_kind, role`; T3's coordination note says "Scope
  stays in the payload; `proj_memberships` keys as Plan 4 designed"
  (coordination §5); TT11 contrasts against "the old `MembershipScope`".
- **Main has:** `MembershipState = { kind: 'membership'; id; workspaceId; userId; role: WorkspaceRole }`
  — **no scope field at all**; `WorkspaceRole = 'owner' | 'admin' | 'member' | 'guest'`.
- **Evidence:** `packages/domain/src/entity-state.ts:41-47` and `:3`.
  Coordination "Outstanding from this wave" records the collapse and its two
  consequences: *"`membership.granted`/`revoked` **refuse** a `scope` rather
  than ignoring one (a stale client's claim means 'put them on project P', and
  silently doing something else is the quiet acceptance the contract forbids);
  and `membership.revoked` deletes a person's **project** rows too."*
- **Implementer writes:** `membershipGrantedPayload` = `z.object({ userId, role }).strict()`
  and `membershipRevokedPayload` = `z.object({ userId }).strict()` — `.strict()`
  is what turns a stale client's `scope` into an `invalid-payload` refusal
  rather than a silent drop. `proj_memberships` therefore has **no
  `scope_kind` column**; project membership lives in its own rows written by
  `project.member_added`/`project.member_removed`. T13's assertion on
  `scope_kind` is dropped; assert `workspace_id, user_id, role` instead.
  `membership.revoked` deletes the person's project rows in the same `apply`.
- **Affects tasks:** 3, 4, 7, 11, 12, 13, 14.

---

## 17. `POST /v1/events` — the shipped door's URL, body, and response shape

- **Plan says (T12, and coordination already caught this):** the end-to-end tests
  posted to `POST /api/workspaces/:workspaceId/events` — *a route no plan
  registers*. Plan line 4761 asserts `res.json()` matches
  `{refused: true, rule: 'permission.visibility', reason: 'This ticket is not visible to you.'}`.
- **Main has:** `POST /v1/events`, body `{ events: [...] }` (1–100 items),
  response `200 { results: IngestResult[] }` index-aligned with the request array.
  A refusal is `{ status: 'refused', eventId, rule, reason }` **inside
  `results[i]`** — never a bare `{refused: true, ...}` at the top level.
- **Evidence:**
  - `apps/server/src/routes/events.ts:12-13` (URL), `:16-23` (body schema:
    `required: ['events']`, `additionalProperties: false`, `minItems: 1`,
    `maxItems: MAX_BATCH_SIZE = 100` at `:4`), `:26-30` (`return { results };`).
  - `packages/domain/src/ingest-result.ts:14-17` — the three-arm `IngestResult`.
  - `apps/server/test/events-route.test.ts:33-42` — the shipped assertion shape:
    `body.results[0]` / `body.results[1]`.
  - The workspace travels **inside each envelope**, never in the path
    (`envelope.ts:57`).
- **Implementer writes (T12, T13, T14 end-to-end tests):**
  ```ts
  const res = await server.inject({
    method: 'POST', url: '/v1/events',
    headers: { authorization: `Bearer ${token}` },
    payload: { events: [env] },
  });
  expect(res.statusCode).toBe(200);
  expect(res.json().results[0]).toMatchObject({
    status: 'refused', rule: 'permission.visibility',
    reason: 'This ticket is not visible to you.',
  });
  ```
  The `401`-before-permission assertion (plan line 4798) is still correct in
  spirit but must come from Task 2's `requireSession` preHandler on this route —
  which does not exist today (`routes/events.ts:12-25` registers no
  `preHandler`). Task 5 or Task 12 adds it; whichever does, updates
  `events-route.test.ts`'s 12 existing unauthenticated cases in the same commit.
- **Affects tasks:** 5, 12, 13, 14.

---

## 18. `verify:projections` — script name has a colon, and the tool is a function

- **Plan says:** `pnpm --filter ./apps/server run verify-projections` (T12);
  "a verify-projections CLI script may exist" (T4); "a verify-projections
  mechanism becomes aware of proj_visibility after registration" (T6).
- **Main has:** `"verify:projections": "tsx src/tools/verify-projections.ts"`.
- **Evidence:** `apps/server/package.json:12`;
  `apps/server/src/tools/verify-projections.ts:35-38` exports
  `verifyProjections({ pool, projections }): Promise<VerifyReport>` with
  `VerifyReport = { clean: boolean; diffs: TableDiff[] }` (`:18-21`);
  `apps/server/test/verify-projections.test.ts` (5 tests) is the in-process
  pattern to copy — it calls the function, not the CLI.
- **The T6 claim is TRUE and needs no wiring:** `verifyProjections` iterates
  `deps.projections.all()` (`verify-projections.ts:43`) and creates a shadow
  copy of every `projection.tables` entry (`:45-48`), so registering
  `proj_visibility` in `buildProjectionRegistry` makes the verifier aware of it
  automatically. That is precisely why the `tables` field on `Projection` is not
  optional.
- **Implementer writes:** `pnpm --filter @gisik-nokma/server run verify:projections`
  in prose; in T12's test, call `verifyProjections({ pool: db.pool, projections: buildProjectionRegistry() })`
  in-process and assert `report.clean === true`, mirroring
  `apps/server/test/verify-projections.test.ts`. **Also note two standing
  constraints from coordination "Plan 1 consequences" §2–§4:** the verifier reads
  in autocommit (so a concurrent-ingest run can report phantom drift — Plan 11
  must rule before scheduling it), it uses `EXCEPT` not `EXCEPT ALL` (so every
  Plan 4 projection table **must** have a primary key), and it needs DDL rights.
- **Affects tasks:** 4, 6, 9, 12, 14.

---

## 19. Workflow types: flat files, not a `workflows/` directory — and the F5 advisory is live

- **Plan says:** `packages/domain/src/workflows/types.js` exports `WorkflowDef`;
  `packages/domain/src/workflows/validate.js` exports `validateWorkflowDef`;
  `packages/domain/src/workflows/simple-kanban.ts` is where T5 puts the template.
- **Main has:** no `src/workflows/` directory. `WorkflowDef` is in
  `packages/domain/src/workflow.ts:49`; `validateWorkflowDef` in
  `packages/domain/src/validate-workflow.ts:12`; both re-exported by the barrel
  (`index.ts:9, 10`).
- **Evidence:** `packages/domain/src/workflow.ts:41-49`
  (`workflowDefSchema` / `WorkflowDef` — with `initialStateId: z.string().min(1)`
  at `:45`, per coordination decision 3);
  `packages/domain/src/validate-workflow.ts:3` (`Issue`), `:12`
  (`validateWorkflowDef(def: WorkflowDef): Issue[]` — returns an array, does not
  throw); `packages/domain/src/index.ts:9-11`.
- **Implementer writes (T5):** import from the barrel —
  `import { validateWorkflowDef, type WorkflowDef } from '@gisik-nokma/domain';`
  — never a deep path. Put the template at
  **`packages/domain/src/simple-kanban.ts`** (flat, matching every sibling) and
  add `export * from './simple-kanban.js';` to `index.ts`. Test file:
  `packages/domain/test/simple-kanban.test.ts` (the shipped test dir is flat too).
  Per coordination pre-ruling 2, **Plan 4 owns this file** and Plan 8's
  create-if-absent guard must not race it — *"Plan 8 T3's guard must NOT create
  it — if absent, the lane waits."* **That makes the chosen path a cross-lane
  specifier, exactly like `Queryable` in §11:** Plan 8's lane reads its own plan
  text, which spells `src/workflows/simple-kanban.ts`, and will wait forever on a
  path Plan 4 never creates. **Task 5 must record the flat path in the
  coordination doc in the same commit that lands the file** — this map is
  gitignored, so the ruling is not durable until it is committed there.
- **The F5 advisory generalisation shipped, and it does NOT fire on simple
  Kanban.** `adviseWorkflowDef(def): Advisory[]`
  (`packages/domain/src/advise-workflow.ts:28`) runs two sweeps:
  `adviseWatchedStateBypasses` (`:48`), which iterates
  `transition.rules` and `continue`s on anything that is not
  `require-different-user` (`:53`), and `adviseLowerGuardBypasses` (`:135`),
  which compares rule *kinds* across edges into a shared target. A simple-Kanban
  definition with `rules: []` on every transition produces **zero advisories from
  both sweeps** — there is no rule for either to find. Confirmed by construction
  from the source; the equivalent rule-less fixture already ships at
  `apps/server/test/helpers/events.ts:35-45`.
  `validateWorkflowDef` requirements the template must satisfy:
  `initialStateId` names a real state, every state reachable from it, at least
  one terminal state, every terminal state enterable, no duplicate state ids, no
  duplicate transitions. `{todo → doing → done}` with `done` terminal satisfies
  all six. The engine never calls `adviseWorkflowDef`
  (`advise-workflow.ts:12-14`), so a warning could not become a refusal even if
  one fired.
- **Affects tasks:** 5.

---

## 20. `ticket-type.defined` and `builtinTicketTypeDefs` — confirmed as the plan assumes

- **Plan says (T5 Step 6):** loop `builtinTicketTypeDefs(defaultWorkflowId)`,
  emitting one `ticket-type.defined` per def, after `workflow.defined` and before
  the founder's grant.
- **Main has:** exactly that, and the docstring anticipates Plan 4 by name.
- **Evidence:**
  - `packages/domain/src/ticket-types.ts:85-94` —
    `export function builtinTicketTypeDefs(defaultWorkflowId: string): TicketTypeDef[]`,
    mapping `BUILTIN_TICKET_TYPE_SEEDS` (`:72-77`:
    `epic/1`, `story/2`, `task/3`, `sub-task/4`) into
    `{ id, name, icon, rank, workflowId: defaultWorkflowId, fields: [] }`.
  - `:79-84` — *"Built-ins are seed data: each workspace materialises them as
    ordinary `ticket-type.defined` events at creation time (**Plan 4 founds the
    workspace**), bound to that workspace's default workflow."*
  - Registration: `packages/domain/src/vocabulary.ts:66-71` —
    `type: 'ticket-type.defined', version: 1, entityKind: 'ticket-type', payloadSchema: ticketTypeDefSchema`.
    The payload **IS the whole `TicketTypeDef`** (`ticket-types.ts:27-51`).
  - Barrel: `packages/domain/src/index.ts:15`.
- **Implementer writes (T5 Step 6):** for each def, one event with
  `entity: { kind: 'ticket-type', id: <fresh ULID> }` (Plan 8 design decision 6:
  the entity id is a fresh ULID; the **stable type key is `payload.id`** —
  `'epic'`, `'story'`, `'task'`, `'sub-task'`), `type: 'ticket-type.defined'`,
  `version: 1`, `payload: def`. The `entityKind` binding at `vocabulary.ts:69`
  means filing one against any other kind is refused `entity-kind-mismatch`
  at the door (`parse-event.ts:77-85`).
  `DEEPEST_RANK = 4` (`ticket-types.ts:70`) — do not restate it.
- **Affects tasks:** 5, 13.

---

## 21. `testEnvelope` — extend the two shipped builders, do not add a third

- **Plan says:** `apps/server/test/helpers/envelope.ts` exporting `testEnvelope`,
  `nextSeq()`, `resetSeq()` (plan lines 1240–1258), plus `appendTestEvent`.
- **Main has:** two builders already, in two places, both barrel-visible:
  `makeEnvelope(partial)` in the **domain package** (shipped from `src/`, not a
  test dir, deliberately) and `submittedWorkspaceCreated` /
  `submittedWorkflowDefined` / `committed(submitted, seq, serverTime?, workspaceSeq?)`
  in `apps/server/test/helpers/events.ts`.
- **Evidence:**
  - `packages/domain/src/testing.ts:18-32` (`makeEnvelope`), barrel at
    `index.ts:17`; its docstring at `:5-8`: *"Shipped from the package (not a
    test directory) because every later plan's tests build envelopes, and one
    builder is one place for the defaults to stay valid."*
  - `apps/server/test/helpers/events.ts:59-66` (`committed`, which is exactly
    "envelope → LedgerEvent" and defaults `workspaceSeq = seq`).
  - **Gap that justifies a new helper:** `makeEnvelope` returns an
    `EventEnvelope` (no `workspaceSeq`), so it is **not** assignable to
    `Projection.apply`'s `LedgerEvent`.
- **Implementer writes (T4):** `apps/server/test/helpers/envelope.ts` exporting a
  thin `testEnvelope(partial): LedgerEvent` that **calls `makeEnvelope` and adds
  `workspaceSeq`** — not a fourth set of defaults. Add `appendTestEvent(db, env)`
  there too, using `insertEvent` from `apps/server/src/ledger/event-store.ts:58`
  rather than hand-written INSERT SQL (the column list at `:60-62` is the one
  that must not drift). `nextSeq`/`resetSeq` as the plan writes them, but rename
  to avoid colliding with `event-store.ts`'s exported `nextSeq(client, kind, id)`
  — call them `nextTestSeq`/`resetTestSeq`.
- **Affects tasks:** 4, 6, 7, 8, 10, 11, 12.

---

## 22. `AppConfig` gains `webOrigin`; there is no `.env.example` yet

- **Plan says (T14):** "`AppConfig` type exists and needs `webOrigin` field from
  `WEB_ORIGIN` env var; Plan 11's `.env.example` completeness gate exists."
- **Main has:** `AppConfig = { databaseUrl, port, host, logLevel }` and a zod
  `configSchema` over `DATABASE_URL, PORT, HOST, LOG_LEVEL`. **There is no
  `.env.example` anywhere in the repo** (`ls -a` at root, and none under
  `apps/server`), so Plan 11's completeness gate does not exist yet.
- **Evidence:** `apps/server/src/config.ts:3-8` (schema), `:10-15` (`AppConfig`),
  `:19-31` (`loadConfig`, which throws `ConfigError` naming the bad variables);
  `apps/server/test/config.test.ts` (6 tests) is the pattern to extend.
- **Implementer writes (T14):** add `WEB_ORIGIN: z.string().url()` to
  `configSchema` and `webOrigin: string` to `AppConfig`, mapped at `:25-30`. Add
  one case to `config.test.ts` proving a missing `WEB_ORIGIN` is a `ConfigError`
  naming it. **Do not create `.env.example`** — that is Plan 11's Wave-1 infra
  scaffold (coordination Wave 1, Lane 4); Plan 4 states the variable and Plan 11
  picks it up. If `.env.example` has appeared on `main` by the time T14 runs,
  add the line.
- **Affects tasks:** 14.

---

## 23. `workspaceNameFromLedger` exists nowhere — Task 13 must create it

- **Plan says:** T13 uses it and attributes it to T14 in a comment; T14 says it
  "exists / needs a single canonical location". Neither task's Files block
  creates it.
- **Main has:** no such function
  (`grep -rn "workspaceNameFromLedger" apps packages` → zero).
- **Evidence:** absent from `apps/server/src/` entirely; the only shipped path
  from a workspace id to its name is a manual query over `events` for
  `type = 'workspace.created'`/`'workspace.renamed'`
  (registered at `packages/domain/src/vocabulary.ts:28-40`, payload
  `{ name: z.string().min(1) }.strict()` for both).
- **Implementer writes:** **Task 13 creates it**, at
  `apps/server/src/workspaces/workspace-name.ts`, as
  `workspaceNameFromLedger(db: Queryable, workspaceId: string): Promise<string | null>`
  — newest of `workspace.created`/`workspace.renamed` for that workspace, ordered
  by `workspace_seq DESC` (**not** `seq`: coordination §18 — per-entity `seq`
  cannot order a workspace, and a rename on a different entity would sort wrong;
  in practice both events are filed against the workspace entity itself, but the
  stream cursor is the ordering the series pinned). Task 14 imports it. Record
  the ownership move in the coordination doc **in Task 13's commit** — this is a
  cross-plan surface (Plan 14 and, by the plan's own text, Plan 5/6 catalogues).
- **Affects tasks:** 13 (creates), 14 (consumes).

---

## 24. Small confirmations — claims that hold as written

Each verified; no adaptation, recorded so nobody re-checks.

| Claim | Verdict | Evidence |
|---|---|---|
| `apps/server` exists with Fastify 5, `pg`, `node-pg-migrate` | TRUE | `apps/server/package.json:17-18, 25` (`fastify ^5.3.0`, `pg ^8.13.0`, `node-pg-migrate ^7.9.0`) |
| Plan 1/2/3 suites pass under vitest | TRUE | `pnpm -r run test` green: domain + rule-engine 115 + server 93 |
| `parseEvent` refuses unknown event types at ingest | TRUE | `packages/domain/src/parse-event.ts:47-54`; wired at `ingest-service.ts:163-171` |
| `evaluateEvent(env, ctx)` exists | TRUE | `packages/rule-engine/src/evaluate.ts:12`, exported `src/index.ts:6`; called `ingest-service.ts:120` |
| duplicate result is `{status:'invalid', code:'duplicate-event-id'}` | TRUE (plus `eventId`, `message`) | `ingest-service.ts:142-149`; type at `packages/domain/src/ingest-result.ts:3, 16` |
| `events` table columns id, workspace_id, entity_kind, entity_id, type, version, payload, actor_id, origin, client_time, server_time, seq, workspace_seq — all NOT NULL | TRUE | `migrations/1787841717635_events-and-snapshots.sql:3-17` |
| `client_time`/`server_time` are `timestamptz`, driver yields `Date`, need `.toISOString()` | TRUE | same file `:13-14`; `event-store.ts:96-97` (`EventRow`), `:120-121` (`rowToEnvelope`) |
| filter `entity_kind='ticket' AND entity_id=$1 ORDER BY seq` | TRUE, **and already implemented** | `event-store.ts:132-143` — `readEntityEvents(client, kind, id, afterSeq)`. **T8 should call it instead of writing raw SQL.** |
| `workspaceSeq` is the per-workspace stream cursor (§18) | TRUE | `migrations/…events-and-snapshots.sql:14, 16` (`UNIQUE (workspace_id, workspace_seq)`) + `:24` comment; `event-store.ts:39-56`; `ingest-service.ts:83` |
| `seq` resets per entity while `workspaceSeq` is workspace-monotonic | TRUE | `event-store.ts:21-27` vs `:50-56`; the two UNIQUE constraints |
| `entity.kind` values ticket, membership, project, workspace, workflow, ticket-type | TRUE, exactly these six | `packages/domain/src/envelope.ts:4` |
| `newUlid()` and `SubmittedEvent` from `@gisik-nokma/domain` | TRUE | `ids.ts:13`; `envelope.ts:70`; barrel `index.ts:1, 2` |
| `ulidx` available to the server | TRUE | `apps/server/package.json:19` |
| ISO-8601 Z strings land in timestamptz | TRUE, and offsets are admitted and normalised | `envelope.ts:10-18, 41-44`; `migrations.test.ts:75-79` proves `+05:30` reads back as `…Z` |
| Features.md §6 and `test-cases/06-auth-visibility.md` are Plan 4's, unclaimed | TRUE | `Features.md` has §1–§5 only; `test-cases/` holds 03, 04, 05 + README. Coordination decision 2 assigns §6/06 to Plan 4 |
| Owner decision "a workspace can hold a ticket the moment it exists" | TRUE | coordination, "A new workspace can hold a ticket the moment it exists" (2026-08-26) |
| Coordination §5 `getEntityState('membership', id)` addressing | TRUE — **but see §7 above, the door blocks the id** | coordination decision 5; `restrict-to.ts:25` |
| `POST /v1/workspaces` route prefix `/v1/*`, better-auth at `/api/auth/*` | TRUE as a decision | coordination amendment 20 and "Route prefix" (settled 2026-08-27) |
| Plan 3 owns `routes/ticket-history.ts`, Plan 4 T8 creates `routes/tickets.ts` | TRUE | coordination pre-ruling 1 — Plan 4 adapts at merge and cites that line |

---

## Unverifiable — lane 1 artifacts not yet on `main`

Nothing below exists at `f363b2f`, and **no sibling lane branch is pushed**
(`git ls-remote --heads origin` → `main`, `pre/doc-to-plain-text`,
`pre/domain-type-hoist` only). These claims cannot be checked against shipped
code and must be re-verified at the wave boundary, before the B1 tasks run.

**Plan 3 (sibling lane, in flight):**
1. `proj_ticket_types` table and its `type_id, workflow_id, workspace_id, rank` columns (T13 asserts them).
2. `proj_tickets` table; claimed columns `ticket_id, workspace_id, project_id, parent_id, title, created_by, state_id, workflow_id, type_id`.
3. `proj_tickets`' primary key column being named `ticket_id` (T7).
4. `proj_rollups` table; claimed `ticket_id, open_count, active_count, terminal_count` + UNIQUE on `ticket_id` (T10).
5. "creating a task on the default workflow lands `state_id='todo'`" (T5) — depends on Plan 3's reducer *and* on the T5 template's own `initialStateId`.
6. Plan 3's `proj_tickets` refresh-on-publish behaviour, which T10's rollups read through.
7. `getEntityState('ticket')` / `getChildrenStates` growing real bodies at Plan 3 T12 (`engine-context.ts:59-63, 70-81`) — until then both answer `null`/`[]`, and any Plan 4 test that ingests a `ticket.transitioned` against a real ticket will see `unknown-ticket`.

**better-auth (a third category — not a lane artifact, but unverifiable from this repo).**
`grep -c "better-auth" pnpm-lock.yaml` → **0**; it is in neither
`apps/server/package.json` nor the lockfile. Every claim below is therefore
**an install-time verification owed by the Task 1 executor**, to be confirmed
against the installed package before Task 2 is written — not a plan-vs-main
adaptation:
8. `better-auth` exports `betterAuth`.
9. `better-auth/plugins` exports `bearer`, `magicLink`, `phoneNumber`; `better-auth/plugins/passkey` exports `passkey`.
10. `@better-auth/cli` supports `generate --config <path>`.
11. `better-auth/node` exports `fromNodeHeaders`.
12. `auth.api.getSession({ headers })` is the 1.x shape.
13. Endpoint paths `/api/auth/phone-number/send-otp`, `/phone-number/verify`, `/sign-in/magic-link`, `/get-session`, `/sign-in/social`, `/passkey/generate-register-options`.
14. Web session cookie is `better-auth.session_token`, set with `HttpOnly`.
15. The bearer plugin returns the token via a `set-auth-token` response header.
16. better-auth's own token tables are hashed at rest (T14's precedent argument).
17. `createAuth` accepting `{pool, otpSender, magicLinkSender, baseUrl, secret}` — a Plan 4 construct, but its viability depends on 8–15.

**Cross-plan claims about plans not yet executed:**
18. Plan 8 design decision 6 (fresh-ULID entity id, stable payload type key) — consistent with `vocabulary.ts:66-71`, but Plan 8 has not run.
19. Plan 11's two seed CLIs being idempotent via a deterministic `workspace.created` id + `duplicate-event-id` — the *mechanism* is verified (`ingest-service.ts:142-149`); the CLIs do not exist.
20. Plan 11's `.env.example` completeness gate (§22 — absent).
21. Plan 10's `visibleEventsFor` / `SyncItem` consumers, and `VISIBILITY_REFUSAL_RULE = 'permission.visibility'` — a recorded decision, no code.
22. `apps/server/src/sync/visible-events.ts`'s "switch with a default-deny shape" that T14 adds `case 'invite'` to — T11 creates that file; nothing exists to inspect.
23. T12's claim that `tickets-read.test.ts` "currently has 6 tests such that +1 = 7", and that seven named test files from earlier Plan 4 tasks pre-exist — all are this plan's own artifacts, verifiable only in sequence.

---

## Blockers

**B1 — the read-path partition is blocked on Plan 3's migrations (not a defect; the schedule's own gate).**
`proj_tickets`, `proj_rollups`, `proj_ticket_types` and `proj_projects` are all
**absent from `main`**. Verified: `ls apps/server/migrations/` returns exactly
three `.sql` files creating `events`, `snapshots`, `proj_entity_heads`,
`proj_workflows` — and `buildProjectionRegistry` registers exactly two
projections (`apps/server/src/projections/index.ts:16-17`).
Consequently **Tasks 7, 8, 9 (step 3a), 10, 11 and 12 cannot run** as written:
every one of them either seeds `proj_tickets` rows, joins `proj_rollups`, or
reads `proj_tickets.created_by` / `.workflow_id` / `.type_id`.
Per coordination Wave 1, Lane 2, Plan 4's order is **partition A → B2 → B1**:
- **A (runs today on `f363b2f`):** T1, T2, T3, T4, T5 steps 1–5 + `simple-kanban.ts`, T6, T9 step 3b (`proj_projects` + the honest project-existence refusal).
- **B2 (after Plan 3's keystone — already on `main`):** T5 step 6 (bootstrap), T13.
- **B1 (after Plan 3's T10/T11 migrations merge):** T7, T8, T9 step 3a, T10, T11, T12, T14.

Note that `proj_projects` is **Plan 4's own** (coordination, 2026-08-26 owner
decision + pre-ruling 6), so T9 step 3b is unblocked and is what makes the
`ticket.created` precondition refusal honest.

**B2 — OWNER RULING REQUESTED: the membership entity id vs. the envelope door.**
Coordination §5 pins a membership's entity id as `${workspaceId}:${userId}`;
`packages/domain/src/envelope.ts:75` requires every `entity.id` to be a bare
ULID; verified by execution that the composite fails `ULID_REGEX`
(`packages/domain/src/ids.ts:9`). The two cannot both stand. §7 above rules the
default — Task 3 amends the door's entity schema to admit the composite for
`kind === 'membership'` only, leaving the frozen `EventEnvelope` *type*
untouched — because §5 is the later, owner-recorded decision and explicitly
rejected the ULID alternative as drift. **This touches Plan 1's frozen envelope
contract**, so it is raised rather than made silently. If the owner declines,
the fallback in §7 (ULID entity ids + composite resolution inside
`engine-context`) is workable but splits `membership.granted` and
`membership.revoked` across separate entity streams.

**B3 — `ingestBatch`'s signature must widen, and it is a shared file.**
`ingestBatch(rawEvents)` carries no caller identity
(`apps/server/src/ingest/ingest-service.ts:50`) and `registerEventRoutes` adds
no session (`apps/server/src/routes/events.ts:26-29`). Task 5 must widen both,
and 31 existing tests (`ingest.test.ts` 19, `events-route.test.ts` 12) call the
current arity. `ingest-service.ts` is also the file Plan 7's `IngestDeps.gates`
amendment and Plan 10's `POST /v1/sync` both extend. **Not a blocker to
starting** — Plan 4 is first to touch it in this wave — but it is the highest
merge-conflict surface in the lane, so Task 5 should land early and its diff
should be minimal and additive.

**B4 — no non-blocker, recorded as a hazard.** `engine-context.ts`'s
`'membership'` branch (§13) is not assigned by any Plan 4 task text. If Task 4
ships `proj_memberships` without it, `restrict-to` silently refuses every
role-gated transition with a green suite — coordination "Plan 1 consequences"
§9's exact failure, one layer down. This map assigns it to Task 4; the Task 4
brief must carry it.
