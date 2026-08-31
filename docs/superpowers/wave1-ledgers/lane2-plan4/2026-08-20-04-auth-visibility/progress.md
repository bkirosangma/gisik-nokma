# SDD ledger — plan: docs/superpowers/plans/2026-08-20-04-auth-visibility.md

## STATE — rewritten at every task boundary. Read this first; trust nothing below it for shas.

- **origin/main:** `5339af9b260cba48e26cd6dc4601c30a2131aea8`
- **current branch:** `exec/04-envelope-origin-gate`  **HEAD:** `acb9a3f0e1615a98ecfada8596ca2d79ec467733`  **merge-base:** `5f3a034d3fc84c7f146f2a15cd8f7d332e8708d8`
- **Done and MERGED:** T1, T3, T2.
- **In flight:** envelope-origin forgery gate — implemented, two fix rounds closed, re-review clean,
  controller-verified. Ready to PR.
- **Remaining:** T4 -> T5 (both halves of the merged CSRF ruling) -> T6, T9 step 3b -> T13 ->
  partition B1, still gated on lane 1's `proj_tickets`/`proj_rollups` migrations.
- **Tier note:** catalogue task and T4's migration go to SONNET per the economy directive; floor list
  (T5, T7, T11, T14) keeps opus-high implementers and fable reviewers.
- **Mutation-testing rule:** bare vitest is safe only for SAME-PACKAGE mutations. Anything crossing a
  package boundary needs `pnpm turbo run test` or an explicit rebuild — `packages/*` export only
  `dist`, so a mutated source with a stale dist passes green.

> **WARNING — shas below this block are HISTORICAL and many no longer exist.** Tested 2026-08-31: of
> 25 cited, 15 ref-reachable, 10 reflog-only orphans that are absent from a fresh clone. Use
> `git branch -a --contains`, not `git cat-file -e`, to test this — `cat-file` passes on all 25.
> `git log` and `gh pr list --state merged` are authoritative; ranges below are narrative.

<!-- STATE-BLOCK-END -->

# SDD ledger — plan: docs/superpowers/plans/2026-08-20-04-auth-visibility.md

Lane 2 controller (Opus 5), worktree lane2-plan4, branch exec/04-auth-visibility.
Baseline verified green at f363b2f: 9/9 turbo tasks, 360 tests (domain 152, rule-engine 115, server 93).

Partitions (dispatch order):
- A (today's main): T1, T2, T3, T4, T5 steps 1-5 + simple-kanban.ts, T6, T9 step 3b
- B2 (keystone on main - SATISFIED at f363b2f): T5 step 6 bootstrapWorkspace, T13
- B1 (needs lane 1 proj_tickets/proj_rollups migrations): T7, T8, T9 steps 1-3, T10, T11, T12, T14

## Controller-verified seams (read directly, f363b2f)

- **Pre-engine gate insertion point** is `commitOne` in `apps/server/src/ingest/ingest-service.ts`:
  after the entity-workspace tenant refusal (ends line 118) and BEFORE `deps.evaluate(envelope, ...)`
  (line 120). The gate runs on the transactional `client`, which is why `Queryable = Pool | PoolClient`
  is the right T1 type. Plan text's `src/ingest/pipeline.ts` does not exist.
- `IngestDeps` (lines 25-31) has `pool, evaluate, projections, registry?, now?`. Plan 4's gate needs
  a new dep. Plan 7 separately wants `IngestDeps.gates?: ServerGate[]` for IN-transaction gates —
  different seam, different phase. Do not collide the two names.
- `app.ts` `buildApp(deps: AppDeps)` with `AppDeps = { db: HealthDb; ingest: IngestService }`; routes
  registered by calling `registerEventRoutes(app, deps.ingest)` at line 58. AJV `coerceTypes: false`,
  `removeAdditional: false` instance-wide (Plan 1 consequences §7) — Plan 4 routes convert query params
  explicitly.
- `setErrorHandler`: <500 reaches the client verbatim; >=500 becomes `INTERNAL_ERROR_BODY`. Plan 4's
  401/403/404 answers ride the <500 path.
- Postgres 16 on 54329 confirmed up (`gisik-nokma-postgres-1`).
- `git ls-remote --heads origin` at preflight time: only `main` (f363b2f), `pre/doc-to-plain-text`,
  `pre/domain-type-hoist`. NO sibling lane branches pushed — the adaptation map binds against main alone.

## Standing merge obligation (coordination pre-ruling #6)

CORRECTED 2026-08-28 (peer flagged; I verified directly). My dispatch brief said main's array
"omits proj_projects and mis-slots proj_tickets". The mis-slot half is FALSE: `buildProjectionRegistry`
registers exactly two projections (index.ts:16-17) and projection-order.test.ts:24-27 pins exactly
those two — nothing is mis-slotted. What IS stale is the DOC COMMENT at projection-order.test.ts:9-10,
which lists a seven-name order omitting `proj_projects`. So the obligation is narrower than stated:
extend the array AND fix that comment to coordination §8's eight-name order. Both files still conflict
with lane 1; the merge is a UNION on the §8 order, never ours/theirs.

Coordination §8's full order is the single source:
  proj_entity_heads, proj_workflows, proj_ticket_types, proj_projects, proj_tickets, proj_rollups,
  proj_memberships, proj_visibility
Lane 2 adds proj_projects (T9 step 3b), proj_memberships (T4), proj_visibility (T6).
Whichever lane merges SECOND writes the full order. Tracked here so it is not discovered at merge.

## T3 registration shape (controller-verified)

Shipped API is `domainRegistry.register({ type, version, entityKind, payloadSchema })` from
`createEventTypeRegistry()` — NOT the plan's `registerEventType({..., parsePayload})`.
Split follows the ticket vocabulary precedent exactly: zod schemas live in
`packages/domain/src/events/<name>.ts`, REGISTRATIONS live in `packages/domain/src/vocabulary.ts`.
`entityKind` is enforced at the door (coordination §11) — every Plan 4 type declares it.

`vocabulary.ts` currently marks `workspace.created` / `workspace.renamed` as **PROVISIONAL**
("may still be revised before any production data exists"). Coordination §6: "Plan 1's
workspace.created/workspace.renamed seeds are provisional until Plan 4 lands." T3 therefore owns
retiring that comment as well as adding `project.created`/`project.member_added`/`project.member_removed`,
`membership.granted`/`membership.revoked`, `visibility.set`, and (T14) the invite triple.

## T1 pins (controller-verified 2026-08-28)

- `better-auth` latest 1.x is **1.7.2** (`npm view better-auth dist-tags`). That is the pin; the plan
  says "pin the latest 1.x at execution time and record the exact version in the lockfile."
  The plan text was written against an earlier 1.x — the T1 implementer takes the API from the
  INSTALLED package (read its `.d.ts`), not from plan text, and records any divergence.
- `apps/server/package.json` deps today: fastify ^5.3.0, pg ^8.13.0, ulidx ^2.4.1, zod ^3.25.0;
  devDeps include node-pg-migrate ^7.9.0. Note **zod 3**, not 4 — better-auth peer ranges matter.
- Migrate script: `node-pg-migrate up --migrations-dir migrations`; shipped migrations are `.sql`
  (three of them), NOT the `.cjs` the plan's File Structure names. better-auth generates its schema
  via its own CLI; T1 transcribes that output into a `.sql` migration in the shipped format.

Ruling: T1 implementer tier is **opus/high**, not sonnet. Why — "pin the latest 1.x at execution
time" means the installed API can differ from plan text, so this is adaptation work, not
transcription, and it is the type-alias other lanes are blocked on. Cost if wrong: a few thousand
extra tokens on a task that gates Plan 7's server half.

## Pre-flight ultracode fan-out — complete (7 agents: 5 extractors sonnet-low, map opus-high, lens opus-high, synthesis opus-high)

Artifacts (all gitignored — anything cross-plan must be committed to the coordination doc by the
task that acts on it):
- extract-A..E — per-task requirement briefs, 143KB. These are the implementers' requirements source.
- adaptation-map.md — 24 adaptations, BINDING over the briefs.
- coordination-obligations.md — obligation table + 13 contradictions + 7 owed rulings.
- preflight-conflict-table.md — the SDD pre-flight table.

### The four findings that change execution

**F-A (map §7 / lens G9) — membership entity id vs the envelope door. CONTRACT COLLISION.**
Coordination §5 pins membership entity id = `${workspaceId}:${userId}`; `envelope.ts:75` requires
every `entity.id` to be a bare ULID (`ids.ts:9`), so the composite is `malformed-envelope` before
any Plan 4 code runs. Verified by the controller directly: `restrict-to.ts:25` already calls
`ctx.getEntityState('membership', membershipId(env.workspaceId, env.actorId))`, and
`engine-context.ts:61` already says in a comment "Plan 4 owns 'membership' via proj_memberships".
Sent to an independent fable adversarial reviewer before ruling. RULING PENDING.

**F-B (lens C11) — `entity.kind` has no `'invite'`.** T14 registers three types with
`entityKind: 'invite'`; `ENTITY_KINDS` is the closed six-member set the Global Constraints pin.
T14 must extend `envelope.ts` — a file its own Files list does not contain — and the Global
Constraints' entity-kind line changes with it. Same file as F-A: sequence them to keep the merge
surface small.

**F-C (map B4 / lens G9) — nobody makes membership entity state honest.** No Plan 4 task text
assigns `engine-context.ts`'s `'membership'` branch. If T4 ships `proj_memberships` without it,
`restrict-to` silently refuses EVERY role-gated transition with a green suite — coordination
"Plan 1 consequences" §9's exact failure one layer down. Map assigns it to T4; the T4 brief
MUST carry it. This is the highest-value finding of the scan.

**F-D (lens C12 / map B3) — `ingestBatch` needs both a session argument and a multi-event
transaction.** Shipped `ingestBatch(rawEvents)` carries no caller identity and `commitOne` opens
BEGIN/COMMIT per event; T5's gate needs `sessionUserId`, and the founding sequence (T5 step 6),
invite acceptance (T14) each need several appends in ONE transaction. 31 existing tests call the
current arity (ingest.test.ts 19, events-route.test.ts 12). `ingest-service.ts` is also where
Plan 7's `IngestDeps.gates` and Plan 10's `/v1/sync` land. Highest merge-conflict surface in the
lane -> T5 lands early, diff minimal and additive.

### Adaptations every dispatch carries (map, abridged — full text in adaptation-map.md)

1. Migrations are handwritten `.sql`, not `.cjs`.
2. Gate goes in `commitOne` (ingest-service.ts), not the nonexistent `pipeline.ts`.
3. Registry is `domainRegistry.register({type,version,entityKind,payloadSchema})` with ZOD schemas —
   not `registerEventType({...parsePayload})` with hand-written throwing parsers. Lens C10 notes
   this puts EIGHTEEN pinned exact-message strings in need of deliberate adaptation, several
   carrying real semantic content (the two scope refusals, the ownership refusal).
4. `LedgerEvent`/`IngestResult`/`IngestErrorCode`/`ENTITY_WORKSPACE_MISMATCH_RULE` import from
   `@gisik-nokma/domain` (pre-work hoist); `event-store.ts` no longer re-exports `LedgerEvent`.
5. `Refusal` from `@gisik-nokma/rule-engine`.
6. `membershipId` ALREADY EXISTS — no task creates it.
8. Readable placeholder ids (`tkt_1`, `usr_founder`) do not survive the door — real ULIDs in every
   fixture that crosses `parseEvent`/`ingestBatch`/HTTP. Exception: `projection.apply` and pure
   `checkRolePermission` fixtures never cross the door and may keep readable strings.
9. Test DB is `createTestDatabase()`, per-file databases, port 54329 — extend, never duplicate.
10. `Projection` requires `tables: readonly string[]` and `apply(event: LedgerEvent, tx: PoolClient)`;
    registration is `registry.register(...)` inside `buildProjectionRegistry()`. Lens C13: T4's and
    T6's declared shapes are wrong and the plan is inconsistent with itself.
11. `Queryable` does not exist — T1 creates it, and it is Plan 7's blocker. MERGE T1 FIRST.
14. `ticket.created`/`ticket.reparented` payload literals in the plan differ from shipped.
17. `POST /v1/events` shipped URL/body/response — Plan 4's E2E tests were wrong about both.
21. `testEnvelope` — extend the two shipped builders, do not add a third.
23. `workspaceNameFromLedger` exists nowhere; T13 and T14 both call it, no task creates it (lens C3).

### Lens contradictions requiring a ruling (full text in coordination-obligations.md)
C1 SyncItem is three members not two · C2 T11 path governs, and case 6.38's test path moves with it ·
C3 `workspace.created` already registered — T3 TAKES OVER the provisional registrations rather than
adding (register() THROWS on duplicate); `workspace.renamed` has no owner · C5 the owner read bypass
contradicts T4's note and T7's printed decision table (both pre-amendment; the owner decision governs) ·
C6 T4's guest-inference branch is unconstructible after the membership collapse; case 6.5 cannot be
seeded · C7 T11's prose says definitions go to everyone, its code correctly narrows for guests ·
C8 `proj_invites` cites a §8 amendment that does not exist · C9 §5's "scope stays in the payload" is
stale · C11 see F-B · C12 see F-D · C13 see adaptation 10.

## PRE-FLIGHT RULINGS (controller, before Task 1 dispatches)

Numbering follows the synthesis agent's R-list; where I differ from it I say so.

**Ruling R1 — the membership entity id vs the envelope door. ADOPTED, with the adversarial
amendment.** Amend `packages/domain/src/envelope.ts` so the entity-id check is kind-aware:
`kind === 'membership'` admits exactly `^<ULID>:<ULID>$`, every other kind keeps `ulidString`
unchanged; the `EventEnvelope` TYPE is untouched. Why — coordination §5 is the later owner-recorded
decision and it explicitly branded the fresh-ULID alternative as drift; a fable adversarial reviewer
tried all four alternatives and refuted each, on stream identity: `seq`, `lockEntity`, `snapshots`,
`readEntityEvents` and canonical replay all key on `(entity_kind, entity_id)`, so grant/revoke/
re-grant must share one id and an offline replica must be able to mint it without a read-before-write.
Freeze honoured: amendment 18's freeze is about field membership ("workspaceSeq is server-enriched,
never client-authored"), and Plan 1's frozen block types `entity: { kind; id: string }` with the
`// ULID, client-generated` comment on the TOP-LEVEL id only — entity.id carries no ULID annotation
in the frozen contract.
  **MANDATORY AMENDMENT the reviewer found and I am adopting — a coherence check, BOTH halves.**
  `^ULID:ULID$` alone admits `entity.id = wsB:userC` under `workspaceId: wsA` with
  `payload.userId: userD`. The server's mismatch guard (ingest-service.ts:108-121) fires only when a
  head ALREADY exists, so the first mis-filed event commits cleanly and a later correctly-addressed
  revoke starts a NEW entity at seq 1 — a split stream, i.e. the exact defect §5 kills, reintroduced
  by the fix. So: refuse when `entity.id !== membershipId(workspaceId, payload.userId)`. The
  workspaceId half can live in the envelope `superRefine` (both fields present); the userId half
  needs the PARSED PAYLOAD and therefore lives where T9 puts the identical `visibility.set` check
  (`entity.id` must equal `payload.ticketId`). **The single most likely subtle failure is
  implementing only the prefix half** because it fits neatly where the regex change lives — the T3
  brief must say this in those words.
  Also: compose the membership pattern from `ULID_REGEX`'s source, never a second hand-spelled
  pattern (envelope.ts:46-52 states that discipline itself). Three planted defects: bare-ULID
  membership id refused; composite on a non-membership kind refused; coherence mismatch refused.
  **RAISED, NOT SILENT** — it touches Plan 1's frozen envelope contract, so T3's change set records
  a ruling-request in the coordination doc and push-notifies. Cost if wrong: the fallback (ULID
  entity ids + composite resolution in engine-context) is a contained rewrite of T3/T4, but it
  splits membership.granted and membership.revoked across separate entity streams.

**Ruling R-KANBAN — `packages/domain/src/workflows/simple-kanban.ts`, the PLAN'S OWN PATH.**
This OVERRIDES the synthesis agent, which recommended a flat `src/simple-kanban.ts` on the strength
of the map's "main uses flat files" style note. Checked instead of assumed: `grep` for
simple-kanban/SIMPLE_KANBAN/simpleKanban across Plans 8 and 11 returns **nothing** — they name no
path at all and consume the definition from the `@gisik-nokma/domain` barrel. So the internal file
path is NOT a cross-plan contract; only the export names `SIMPLE_KANBAN_TEMPLATE` and
`simpleKanbanWorkflowDef` are. Plan 4 names `src/workflows/simple-kanban.ts` in five places and the
controller's own dispatch brief names it too. A `workflows/` subdirectory is also not unprecedented —
`src/events/` already exists. Cost if wrong: one import line, and the barrel export makes even that
unnecessary. What DOES get recorded in the coordination doc at that commit is the two EXPORT NAMES,
because those are what Plan 8's guard and Plan 11's seeds actually bind to.

**Ruling R12 — `Queryable` lives at `apps/server/src/db/queryable.ts`** (the plan's path), because
Plan 7's server tasks were written against that specifier. T1 records it in the COORDINATION DOC in
the landing commit — this ledger is gitignored and the ruling is not durable until then. Do not
retro-fit `Queryable` onto `Projection.apply`, whose parameter is a `PoolClient` by design.

**Ruling R13 — `ingestBatch(rawEvents, ctx: { sessionUserId: string | null })`, second parameter
REQUIRED**, so an unauthenticated call site is a compile error rather than a silent bypass. The 31
existing tests move in the same change set. The server-origin bootstrap is recognised by the PAIR
(sessionUserId null AND origin 'server'), never by a second append function — the bootstrap must go
through `commitOne` so it gets the locks, the seqs, the projections and `notifyCommitted`. The
permission refusal returns `commitOne`'s own `IngestResult` shape after an explicit ROLLBACK, not a
bare `Refusal`. Keep the diff ADDITIVE so Plan 7's `IngestDeps.gates` appends rather than re-plumbs.

**Adopted from synthesis without change** (full text in preflight-conflict-table.md): R2 keep
`scope_kind` and the four-column key · R3 SyncItem is THREE members · R4 project-existence check sits
AFTER the workspace-role refusal and BEFORE the project-membership check (existence-first would let a
workspace outsider probe which project ids exist) · R5 make the projections order-INDEPENDENT, never
change the replay order; determinism test 3 goes live here and must be RE-READ · R6 do not duplicate
Plan 3's history route · R7 append `proj_invites` at the END of the order and record the missing §8
amendment · R8 `'invite'` joins ENTITY_KINDS with a falsifiable test · R9 T3 takes over both
provisional registrations; T13 creates `workspace-name.ts` · R10 the engine-context 'membership'
branch is T4's, same change set as proj_memberships · R11 T13 creates Features.md §6 and
test-cases/06, T12 inserts 6.1-6.22 above it, never renumber · R14 the pg_locks lock-order test is
owed here (Plan 4 is the series' second both-lock path) · R15 TRUNCATE proj_invites · R16 the invite
404 body is `{ error: 'not_found' }` · R17 resolve every test-count drift by LITERAL COUNT, never
delete a written test to match a stated total · R18 delete the dead guest-inference branch and
rewrite case 6.5 · R19 the owner read bypass governs both copies; cases 6.39/6.40 move to T7.

## Peer-reported hazards (lane co-ordinator session) — both CHECKED CLEAN for this lane

1. **Test-collection hazard.** All three vitest configs are `include: ['test/**/*.test.ts']`, so a
   test placed under `src/` runs from an explicit path and is NEVER collected by
   `pnpm turbo run test` — green in the brief, absent from the gate. Grepped all five extract briefs
   for `src/**/*.test.ts`: **no hits.** Every Plan 4 test path is under `test/`. Standing rule added
   to every dispatch anyway.
2. **`ticket.transitioned` spelling.** `grep -c toStateId` over Plan 4 = **0**. Plan 4 carries none
   of the ~36 stale literals; T6's inline payload destructuring is clean. Nothing to adapt.

## Dispatch log

**Task 1 dispatched** (opus/high, general-purpose) on branch `exec/04-t1-queryable-identity`,
BASE = f363b2f. Brief: `task-1-brief.md` (373 lines, from the SDD task-brief script) + the adaptation
map as BINDING over it. Report contract requires a better-auth API verification table (five claims,
CONFIRMED/ADAPTED with .d.ts evidence) because Task 2 is briefed from it and the package is not
installed anywhere yet (`grep -c better-auth pnpm-lock.yaml` = 0).
Carried into the dispatch: R12 (Queryable path), the .sql migration format, the 1.7.2 pin + the zod-3
peer-range question, the test-collection rule (tests under `test/` only), the never-shell-`diff`
restoration rule, and the peer's plant-in-the-production-shape rule.

**Peer findings adopted into every dispatch from here (lane co-ordinator session, verified where
checkable):**
- Mutate transcribed fixtures before trusting them. Lane 3 mutated Plan 7's plan-text fixtures and
  found four surviving mutants the specified cases do not catch, including a discriminator that
  could be deleted with every case still green. Fixtures that arrive pre-written in authoritative-
  looking plan text can AGREE with the implementation without CONSTRAINING it. This bears hardest on
  **T12 (security proofs)** — a proof that cannot fail is decorative.
- Plant in the shape the production code actually uses. Lane 4 found Plan 11's `check:env` gate greps
  for `process.env.X` while this codebase reads config through a zod schema and passes `process.env`
  in wholesale — so it finds zero variables and passes vacuously, and its own planted-defect proof
  plants the one pattern the checker CAN see. Applies to every planted check in this lane.
- Their "transcription ships green" framing is WITHDRAWN by them: `transition.ts:30` safeParses the
  payload before any rule runs, so a real engine in the path goes red. Immaterial here — Plan 4
  contains zero `toStateId`.

## Rulings forced by the cross-lane sequencing call (2026-08-28, after T1 dispatched)

The lane co-ordinator ruled the `envelope.ts` sequencing, which is theirs to make: **both amendments
land early, separate, ADDITIVE, and every other lane rebases onto them rather than editing in
parallel.** They checked the file's other claimants — Plan 3 refers to it once, Plan 9 twice, Plan 10
references ENTITY_KINDS; only Plan 3 is live in Wave 1 and lane 1 confirms it is a pure consumer
(one type-only import, nothing under Modify) and will rebase onto me. My kind-aware default was not
second-guessed; the stream-identity refutation is what carried it.

**Ruling R8-EARLY — the `'invite'` ENTITY_KINDS addition moves FORWARD from T14 into T3's change
set.** This deviates from the plan's task boundaries and from my own partition order, deliberately.
Why: T14 is the LAST task in the lane and sits in partition B1, so leaving the second envelope
amendment there would have every sibling lane rebase onto envelope.ts once for T3 and then again,
much later, for T14 — at exactly the point in the wave where a textual merge on the schema governing
every event's identity is most expensive. Adding a member to a closed entity-kind set is additive and
INERT until an event type declares it, so it carries no behaviour ahead of T14. What stays in T14:
the three invite event types, their schemas, their registrations, and the sync-down `case 'invite'`.
Cost if wrong: an unused enum member is visible in the set for a few tasks, and removing it is one
line. Recorded in the coordination doc by T3's change set alongside the membership amendment.

**Ruling R17-REFINED — resolve test-count drift by literal block count PER FILE, not per task.**
Lane 3 found the counterexample running my original rule over Plan 7: T11a shows 6 `it` blocks
against a stated 4 and is entirely CORRECT — the task is split across two packages, 4 domain cases in
one file and 2 server cases appended to another suite, with the plan stating the halves separately
further down. A split task produces the same arithmetic signature as a real stated-below drift, and
the naive repair ("plan says 4, I have 6, delete two") is precisely the deletion the rule exists to
prevent. Lane 1 added the other half: DIRECTION decides danger — stated ABOVE the blocks written
invites writing more (harmless); stated BELOW invites deletion (dangerous). So: re-check my four
instances per file before T12, and only the stated-below ones need action.

**The ULID dialect trap — my kind-aware check IS the door it meets.** The fixture dialect used
throughout `packages/rule-engine/fixtures/` (`t1`, `ws_1`) is fine THERE because the harness enters
at `evaluateEvent` and never passes the envelope door. A SERVER test that ingests one of those ids is
refused at the door for a reason unrelated to what it is proving, and the refusal reads as the thing
under test failing. My amendment is the moment the door's behaviour becomes non-uniform across kinds,
so a test's outcome now also depends on which `kind` it declares. Lane 4 found the same trap in a
different field: `app-core`'s seed builders use `actorId: 'user_kiro'` against `actorId: ulidString`
— harmless against the fake, `invalid-payload` at the first real door.
**Into T3's brief verbatim:** the kind-aware test asserts BOTH DIRECTIONS PER KIND — a `membership`
composite accepted; a `membership` bare ULID handled as intended; and **a non-membership kind still
refusing a composite byte-for-byte as before**. That last case is the regression guard that keeps the
"every other kind unchanged" claim honest, and without it the claim is untested.

## T1 in flight — two things the task reviewer must be pointed at

Observed while T1 was working (not intervened in; controller fixes skip review):
1. **better-auth 1.7.2 pulls zod 4** (`.pnpm/zod@4.4.3`) while `apps/server` depends on zod ^3.25.0.
   Two zod majors now coexist in the tree. The implementer hit TS2742 — better-auth's inferred types
   reach into `@simplewebauthn/server` and zod 4, neither nameable from this package — and resolved
   it by setting `"declaration": false` in BOTH `apps/server/tsconfig.json` and
   `tsconfig.typecheck.json`. Plausible (apps/server is a private leaf app whose `.d.ts` nothing
   imports) but it is a build-contract change made to accommodate a dependency, and it weakens type
   portability for every later task in the app. The reviewer gets this as a named attention point.
2. **`auth-dev.ts` ships a fallback secret** (`process.env['BETTER_AUTH_SECRET'] ?? 'dev-only-secret-change-me'`)
   and a hardcoded default DATABASE_URL. Labelled dev-only and off the production path, but a
   fallback secret that silently works is the shape of a real hazard. Reviewer decides; I am not
   pre-judging it, only making sure it is looked at.

## OWNER RULING RECEIVED 2026-08-28 — R1 is RATIFIED, not provisional

The membership entity-id exception is **ratified by the owner**. The kind-aware check stands as
designed: `membership` admits the composite `${workspaceId}:${userId}`, every other kind keeps
`ulidString` byte-for-byte, `EventEnvelope` untouched. R1 above is no longer a conservative default
awaiting post-hoc review — it is the decision, and dispatches must stop hedging it.
NOT ratified because not put and not needing to be: the `'invite'` ENTITY_KINDS addition (inert until
an event type declares the kind — R8-EARLY stands on its own reasoning) and the three-direction test
design (mine, and it is the part that makes "every other kind unchanged" provable rather than
asserted — lands exactly as briefed).

## Task 1 — report received: DONE_WITH_CONCERNS, commit 2c8696b

366 tests green across 3 packages (9/9 turbo tasks); server 93 -> 99 (+2 sender, +4 vendor schema).
`pnpm install --frozen-lockfile` exits 0, tree clean. `Queryable` is at `src/db/queryable.ts` as ruled.

**Two findings that rewrite later briefs — both are real catches, not process noise:**

1. **`passkey` has left better-auth core.** `better-auth/plugins/passkey` does not exist in 1.7.2
   (54 export subpaths, none of them passkey; no `@simplewebauthn/*` in its deps). It ships as
   `@better-auth/passkey@1.7.2`, now a separate dependency. `PasskeyOptions` still takes
   `rpID`/`rpName`, so the call is unchanged — only the specifier. **T2's brief was written from plan
   text and names the wrong one; correct it at dispatch.**

2. **`@better-auth/cli` is banned from this repo, and the plan's Step 10 was actively dangerous.**
   The CLI's latest release is 1.4.21 and it pins its own `better-auth@1.4.21` as a HARD DEPENDENCY,
   so it reports the 1.4 schema no matter which version the server imports. Run against this repo's
   config it emitted an `account` table with **no `"issuer"` column and no
   `account_issuer_accountId_uidx` index** — both of which 1.7.2 writes on every account link. That
   migration applies cleanly and fails on the **first Google sign-in**. The plan instructed the
   executor to reconcile against exactly that tool, so following the plan text literally would have
   shipped a broken schema, and the reconciliation step meant to catch it would have been the thing
   that introduced it. Replaced by `pnpm --filter @gisik-nokma/server run auth:schema`
   (`src/tools/auth-schema.ts`, reading the INSTALLED library's own `getMigrations`) plus a test
   asserting the live database leaves that planner nothing to create — so the next better-auth
   upgrade turns the suite red instead of production.
   Falsifiability done in the shape the real risk takes, per the peer's plant-in-production-shape
   rule: planting exactly the CLI's output makes the drift check fail naming `account.issuer` while
   the "five tables exist" and "camelCase columns" checks BOTH still pass — which is the evidence
   that those two are not sufficient on their own.

**zod: CHECKED NEGATIVE, no conflict, no upgrade.** better-auth declares no zod peer; zod ^4.3.6 is
its own direct dep nested at 4.4.3, and the monorepo's zod 3.25.76 stands. The one pnpm warning
(`better-call ✕ unmet peer zod@^4.0.0: found 3.25.76`) is cosmetic — the store holds one
`better-call`, keyed `_zod@4.4.3`. **Nobody "fixes" this by upgrading the monorepo to zod 4.**

**Cross-plan rulings written into the coordination doc by this task's own change set** (four of them),
discharging the durability obligation rather than deferring it to plan end. This is the first task in
the series to do that correctly on the first attempt.

**Self-flagged weakest check:** the "no projection claims a vendor table" boundary guard has no
planted defect, because planting one would mean inventing a bogus projection. Reported rather than
shipped silently, which is the rule working.

**Two follow-ups I sent the implementer before packaging the review** (it resumed and is running):
(a) settle by toggle whether `declaration: false` is load-bearing in `tsconfig.typecheck.json` under
`noEmit: true` — the report ASSERTS "the check fires under noEmit too" without having run it, which
is the unchecked-precondition class this series has hit four times; either answer is fine, but the
comment must not claim a mechanism nobody fired. Certain half already correct in the report:
`tsconfig.base.json:9` sets `"declaration": true`, so the line overrides an inherited true rather
than restating a default. (b) does better-auth's PUBLIC RUNTIME surface hand back zod schemas? If it
does, a zod-4 schema composed with one of ours misbehaves at runtime with no type error anywhere —
an axis declaration-emit does not touch. A checked negative gets recorded; silence does not.

### T1 follow-up verifications — both settled with evidence (commit 0d61542)

**(a) `declaration: false` in `tsconfig.typecheck.json` is LOAD-BEARING, proven by toggle.** Removed
it from the typecheck config alone and TS2742 returned immediately — four errors on `createAuth` and
`auth`, `@simplewebauthn/server` and `zod/v4/core` both unnameable. So `noEmit` suppresses the OUTPUT
of declaration files, not the declaration-emit CHECK. Both comments now state that mechanism as a
run result rather than an assertion, and both carry the anti-tidy-up clause: the line overrides
`tsconfig.base.json:9`'s inherited `"declaration": true`, so deleting it restores `true` rather than
leaving the flag unset. Restoration verified by reading both files AND `git diff` — never a shell
`diff`.

**(b) zod across better-auth's public surface — NOT inert, but the dangerous shape does not exist.**
A better answer than the checked negative I asked for:
  - Nothing flows IN. `BetterAuthOptions` has zero `Zod` references, as do the option types of every
    plugin configured (`phone-number` 0, `bearer` 0). No better-auth field could accept a zod-3
    schema of ours.
  - Zod-4 objects DO flow OUT, in two places: seven barrel exports are live zod-4 schemas
    (`userSchema`, `sessionSchema`, `accountSchema`, `verificationSchema`, `coreSchema`,
    `rateLimitSchema`, `additionalAuthorizationParamsSchema`), and every
    `auth.api.<endpoint>.options.body`/`.query` carries its schema at runtime — probed three of them,
    each reading `_zod.version = {major:4,minor:4,patch:3}`.
  - **But the mix is a COMPILE error, not a silent runtime bug.** `z.object({…}).and(userSchema)`
    fails TS2345 — zod 4's `ZodObject<…, $strip>` lacks `_type`, `_parse`, `_getType`,
    `_getOrReturnCtx` and 7 more from zod 3's `ZodType`. Only an explicit cast gets a mix through,
    which is a deliberate act rather than an accident.
  - **One residual trap, and it fails LOUDLY:** `better-auth/dist/index.d.mts:29` carries
    `export * from "zod"`, so `import { z } from 'better-auth'` TYPE-CHECKS while the runtime barrel
    has no such export — an ESM link failure at startup. It cannot reach production silently, but it
    looks correct in an editor.
  - Standing rule recorded in the coordination doc: import `z` only from `zod`, never from
    `better-auth`; never reuse `auth.api.*.options.body` as a validator inside our zod-3 code.

**T1 review dispatched** (opus/high) with the brief, the report, the 2-commit review package
(`review-f363b2f..0d61542.diff`, 75KB) and the adaptation map as binding over the brief. Seven areas
named as QUESTIONS, not conclusions — declaration scope, the auth-dev fallback secret, whether the
drift check genuinely constrains the schema, the vendor migration's completeness against 1.7.2, the
`Queryable` contract, scope leakage, and whether the coordination-doc claims match what the diff does.

### T1 review verdict — Spec ✅ PASS · Quality APPROVED conditional on fixing Important #1

Reviewer re-verified the central claims independently rather than accepting testimony: it re-ran the
tsconfig toggle (four TS2742 errors return), re-ran `auth:schema` and matched the migration
column-for-column and index-for-index, and confirmed from the npm registry that
`@better-auth/cli@1.4.21` pins `better-auth: 1.4.21`. Scope clean both directions; nothing from T2+
leaked; Features.md/test-cases correctly untouched.

**Important #1 — the coordination doc records the INVERSE of the truth on zod.** The §4 entry the
implementer wrote says "the store holds exactly one `better-call`, keyed
`better-call@1.4.0_zod@4.4.3`, so `better-call` did resolve zod 4." The lockfile says the opposite:
`pnpm-lock.yaml:1881` is the ONLY `better-call` snapshot and reads `better-call@1.4.0(zod@3.25.76)`
with `optionalDependencies: zod: 3.25.76`; line 19 carries the same key inside `@better-auth/passkey`'s
resolution; and `better-auth`, `@better-auth/core` and `@better-auth/passkey` all symlink
`better-call -> .pnpm/better-call@1.4.0_zod@3.25.76/`. So the single better-call in force resolved its
optional zod peer to 3.25.76, OUTSIDE its declared `^4.0.0` — which is exactly what the pnpm warning
reports and the doc dismisses. **The conclusion survives (do not upgrade zod) and the reason does
not.** This matters more than an ordinary inaccuracy because it is in the DURABLE cross-plan record,
where it tells every later plan to dismiss an accurate warning.
Riding with it: report §9.2's "the compiler refuses the mix" is true of OUR code and already false
inside the vendor — `better-call/dist/openapi.cjs:20,36` runs `options.body instanceof zod.ZodObject`
with a zod-3 `ZodObject` against zod-4 schema objects, a silent `false` with no compile error and no
throw. Benign only because nothing enables better-auth's openAPI plugin. That is a live caveat to
name, not a hazard to assert cannot occur.

**Important #2 — the drift test is blind to type and nullability drift, and its name overclaims.**
Reviewer proved it with two mutations against the live suite: `user."emailVerified" boolean NOT NULL`
-> nullable, all 4 tests PASS; `passkey."counter" integer NOT NULL` -> `text NOT NULL`, all 4 tests
PASS. Mechanism at `node_modules/better-auth/dist/db/get-migration.mjs:483-485` — a
nullable-where-required column and a `matchType` failure each produce only a `logger.warn`, and
neither reaches `toBeAdded`, the only thing the test asserts on. The test at `:64` calls itself "the
schema has not drifted" and the docstring at `:57-59` claims a migration "missing a table, a column,
or an index" is caught. Presence is caught; SHAPE is not. Load-bearing because the coordination doc
now tells Plan 11 to treat a red anti-drift test as a required migration — the repo is being told to
trust this check further than it reaches, so a better-auth upgrade that CHANGES a column's type or
nullability ships green.

**Ruling — Minor #4 is reclassified IMPORTANT and enters the fix round.** `auth-schema.ts:31` guards
direct execution with ``import.meta.url === `file://${process.argv[1]}` `` where the shipped
`verify-projections.ts` uses `pathToFileURL(process.argv[1]).href`. Check the repo out under a path
containing a space, `#`, or non-ASCII and `pathToFileURL` percent-encodes while the template string
does not: the guard is `false` and `auth:schema` prints NOTHING and exits 0. Why this is not minor —
a tool whose entire job is to emit text for a human to diff, which silently succeeds while emitting
nothing, is a check that cannot fail, and the Global Constraints say a check that cannot fail is not
evidence. Cost if wrong: one line, already written correctly elsewhere in the repo.

**Deferred minors** (recorded, not in the loop; final review triages):
- #5 `auth-schema.ts` takes its DB URL from `auth-dev.ts`'s hardcoded fallback where
  `verify-projections.ts` uses `loadConfig(process.env)` and fails loudly. The REPORT's claim that it
  "mirrors the shipped verify:projections shape" is right about structure and wrong about the two
  operational details; the report gets corrected even though the code stands.
- #6 `auth-dev.ts` fallback secret — the implementer's argument was traced and is CORRECT (sole
  importer is `auth-schema.ts:2`; no test imports it; `src/index.ts` goes through `loadConfig`). Two
  residuals: both files compile into `dist/` so the placeholder ships in the build artefact, and the
  only thing preventing reuse is a comment rather than code.

**Controller-resolved "cannot verify" items:** the clean-store check goes INTO the fix round
(`rm -rf node_modules && pnpm install --frozen-lockfile` — `.pnpm` still holds
`@better-auth+cli@1.4.21` and `@better-auth+core@1.4.21` which the lockfile no longer references, so
the working tree is not proof of what CI installs). The better-auth version for the Open-questions
review goes in the PR body (1.7.2) and is mine. Runtime-probe testimony stays testimony — and
finding #1 shows part of it was wrong, which is why the fix round re-derives the zod facts from the
lockfile rather than from the deleted probe.

### T1 fix round 1 — all three addressed, and one NEW finding from a sibling lane

Fix commit 00b6c9c. 366 green, 9/9 turbo tasks, unchanged after a clean install from an emptied tree.
- #1 the implementer's own diagnosis of its error is worth recording: `@better-auth/core`'s
  resolution KEY carries `(better-call@1.4.0(zod@4.4.3))` while its `dependencies` BLOCK resolves
  `better-call: 1.4.0(zod@3.25.76)` — it read the stale key as the edge, and the `.pnpm` directory
  that seemed to confirm it was an unpruned CLI leftover. So the mistake had two corroborating
  artifacts, both stale. Entry rewritten from a PRUNED tree.
- #2 took the capturing-logger route so the test's name stays true; falsifiable on both of the
  reviewer's mutations, each now failing at `expect(warnings).toEqual([])`,
  `auth-tables.test.ts:97:22`, restored with `git diff` empty.
- #3 `pathToFileURL(...).href`, demonstrated from a directory with a space in its name: old guard
  FALSE (prints nothing, exit 0), new guard TRUE.
- Clean-store verification: `rm -rf` is refused by this session's sandbox, so all four `node_modules`
  trees were MOVED ASIDE (same condition, reversible) and `find` confirmed none remained.
  `pnpm install --frozen-lockfile` exit 0, 206 packages, "Lockfile is up to date", identical 366
  green. Incidental finding worth keeping: the peer warning is not printed on a frozen-lockfile
  install at all — resolution is skipped — so it only ever appears on resolving installs.

**Peer claim CHECKED AND HALF WRONG, half live.** A sibling lane reported that `@better-auth/cli` is
still in this lane's devDependencies and would ship through Plan 11's
`pnpm install --frozen-lockfile` Dockerfile step. Verified directly: `grep -c "@better-auth/cli"
pnpm-lock.yaml` = **0**, and it appears in no package.json in the repo. It was never installed — the
peer was reasoning from my T1 report's description of the PLAN's Step 1 instruction, not from shipped
state. Their build-time assertion that the lockfile does not carry the tool will PASS against this
lane as it stands.
**Their second point is live and correct.** `auth-dev.ts:7` still reads "Concrete instance for
`pnpm exec better-auth generate --config …` and local dev runs" — a comment that re-motivates a
generation CLI workflow at the very site the replacement reads, and names a command that does not
exist (the `generate` bin ships in the banned `@better-auth/cli`, not in the `better-auth` library).
That is the comment-asserting-a-dead-precondition shape, in the one place a maintainer looks to learn
what this instance is for. Goes to the implementer as a ride-along with whatever the scoped
re-review returns, so there is ONE round rather than two.
Also confirmed by that lane and worth recording: `@better-auth/cli` appears in **Plan 4 only** —
Plan 11 names it zero times across all eleven plans, so the risk of ADDITION was never Plan 11's.
Plan 4 names it three times: line 403 (Step 10) which `auth:schema` killed, line 116 (Step 1's
`pnpm add -D`) which was never executed, and line 299's doc comment, which is the live one above.

### T1 scoped re-review (fix round 1) — #1 #2 #3 all ADDRESSED, one NEW Important

Re-reviewer re-derived rather than accepted: re-ran both drift mutations itself (failing at
`auth-tables.test.ts:97:22` with the other three green in the SAME run — assertion-level, not setup),
checked every lockfile claim line by line, and ran the entry guard against space/`#`/`ö` paths.
Two pieces of evidence worth keeping beyond this task:
- **The capturing logger does not mask and does not flake, proven empirically.** The baseline run
  emitted a real `Social provider google is missing clientId or clientSecret` WARN to stderr inside
  that very test and `warnings` still came back empty — init-time warnings go through the
  `betterAuth()` instance's own default logger, while the capture is only on the plain options object
  handed to `getMigrations`. The only other warn sites reachable inside `getMigrations` are all
  genuine drift/DB signals.
- **The rtk proxy collapses `pnpm test` output to `PASS (4) FAIL (0)`**, hiding which test failed and
  where. The re-reviewer worked around it with raw
  `node ./node_modules/vitest/vitest.mjs`. Anyone needing assertion-level evidence in this repo needs
  that workaround — a proxied summary is not falsifiability evidence.

**NEW Important — the openapi caveat names the wrong trigger, in the DURABLE record.** T1's fix wrote
at coordination `:649` that the zod-3/zod-4 `instanceof` mismatch "is inert only because nothing in
this repo enables better-auth's openAPI plugin. Whichever plan first enables it inherits this, and
the fix then is to force one zod major." The vendor tree contradicts all of that:
(1) better-auth's `openAPI()` plugin uses its OWN generator — `plugins/open-api/index.mjs:5` imports
`./generator.mjs`, whose `import * as z from "zod"` resolves through better-auth's own symlink to
zod 4.4.3 — so enabling it never reaches better-call's zod-3 code; (2) better-call's real hazard path,
its router auto-registering `/api/reference` (`router.mjs:8-15`), is UNCONDITIONALLY disabled by
better-auth at `api/index.mjs:155` (`openapi: { disabled: true }`); (3) nothing in `apps/` or
`packages/` imports `better-call` at all. Corrected trigger: the mix goes live only if repo code calls
better-call's `createRouter` WITHOUT `openapi: { disabled: true }`, or calls its root-barrel
`generator`/`getHTML` directly.
Riding with it: "not even in its `exports` map" is true of the SUBPATH only — `generator` and
`getHTML` ARE re-exported from the root barrel, so `openapi.cjs` and its `require("zod")` of zod 3
load eagerly on every `import 'better-call'`. The accurate statement is "loaded and unreached", not
"absent".
This is the third time in one task that a claim about a mechanism was written before it was checked
(the noEmit assertion, the better-call key-vs-edge, now this). All three were caught. The pattern
worth carrying into every later dispatch: **a sentence explaining WHY something is safe is itself a
claim, and gets verified like any other.**

**Fix round 2 dispatched** with that finding plus the sibling lane's ride-along (`auth-dev.ts:7`
names `pnpm exec better-auth generate`, a command that does not exist — the `generate` bin ships in
the banned `@better-auth/cli`, not in the library). Both the coordination doc AND
`task-1-report.md:302` must change; correcting only one leaves the error in the record twice.
Verified myself before dispatching: `grep -c "@better-auth/cli" pnpm-lock.yaml` = 0, in no
package.json — the install half of the peer's claim was never true.

### T1 fix round 2 re-review — #A and #B ADDRESSED, no new breakage

Re-reviewer ran the mechanism claims rather than inferring them: traced eager loading through
`require.cache` for CJS and `module.registerHooks` for ESM, and executed the actual `instanceof`
cross-major test (zod-4 object against zod-3 `ZodObject` -> `false`, no throw). Two results worth
keeping:
- **"Loaded and never reached" is not theoretical.** `@better-auth/core/dist/api/index.mjs:3` imports
  from better-call's ROOT BARREL, so every process running better-auth loads `openapi` and zod 3.
- **The corrected trigger is exhaustive, not just possible.** `createRouter` is the only entry to the
  gated block, `generator`/`getHTML` are otherwise reachable only off the root barrel, and across all
  `@better-auth/*` packages the only `createRouter` call site anywhere is
  `better-auth/dist/api/index.mjs:153`, which passes `disabled: true`. better-auth is ESM-only, so
  there is no second build to check.

Deferred minors (final review triages; none enter the loop):
- `coordination:649` cites `dist/index.mjs:7` for the RE-EXPORT of `generator`/`getHTML`; line 7 is
  the import and line 9 is the export. Incomplete rather than wrong, and 7 is the load-bearing line
  for the eager-load claim it supports.
- `task-1-report.md:89` still carries the round-1 store-key error in the original narrative with no
  INLINE retraction — it is retracted at `:289` by cross-reference only, while `:302` got an in-place
  "do not read this paragraph for it" marker. An inconsistency in correction discipline inside a
  gitignored file; noted, not fixed.
- `auth:schema` prints two `BETTER_AUTH_SECRET` low-entropy warnings and the Google-provider warning
  before the SQL. Harmless for diffing; Plan 11 owns the env contract.

## Task 1: complete (commits f363b2f..e3aba70, review clean after 2 fix rounds)

Four commits: 2c8696b (task) -> 0d61542 (two asserted mechanisms verified) -> 00b6c9c (fix round 1:
lockfile inversion, drift-test blindness, entry guard) -> e3aba70 (fix round 2: wrong openapi trigger,
dead command in docstring). 366 tests green, 9/9 turbo tasks, clean frozen-lockfile install from an
emptied tree.

## T1 shipped as PR #20; lane branch rebased; T3 dispatched

**PR #20** — `exec/04-t1-queryable-identity` -> main, four commits, body records the better-auth 1.7.2
pin (brief Step 1's Open-questions obligation), the CLI finding, the four adaptations, and the
"a sentence explaining why something is safe is itself a claim" lesson. CI watch armed; auto-merge
only on independent green per the standing authorization.

**Lane branch rebased onto origin/main at a8e746f** — five commits had landed from sibling lanes
while T1 ran: lane 4's `packages/ui` + `packages/app-core` scaffold, `scripts/check-env-example.mjs`,
and the coordination-doc updates from PRs #15 and #18. Verified before dispatching T3 that NONE of
them touch `packages/domain/src/envelope.ts`, `vocabulary.ts` or `ids.ts` —
`git log f363b2f..origin/main -- <those three>` is empty — so T3's adaptation basis still holds and
the map does not need re-running for this task. The coordination doc now carries the membership
ruling from the co-ordinator's own PR, so T3 was told to READ what is there before adding, since
duplicating a recorded ruling is its own kind of drift.

**T3 dispatched** (opus/high — the riskiest single edit in the lane; three sibling lanes rebase onto
its envelope change). Carrying: both envelope amendments with the membership one marked
OWNER-RATIFIED so it is implemented rather than re-litigated; the mandatory both-halves coherence
check with the prefix-half-only failure mode named in those words; the three-direction test including
the non-membership regression guard; the shipped zod-schema registry API and the ~18 pinned messages
needing deliberate adaptation rather than transcription; the takeover of the two provisional
registrations (register() THROWS on duplicate); membership REFUSING a `scope`; the per-file
count rule; the `test/` collection rule; the never-shell-`diff` rule; the plant-in-production-shape
rule; and the rtk workaround for assertion-level output
(`node ./node_modules/vitest/vitest.mjs run <file>`), which the T1 re-reviewer had to discover for
itself.

## Third envelope.ts amendment ruled in — payload presence (routed by the co-ordinator, verified here)

**Ruling: it rides with T3.** Same reasoning as the `'invite'` pull-forward, with more force — three
lines in a file the implementer already has open, against the cost of a THIRD sibling-lane rebase
onto the schema every event passes through. Sent to the running implementer with the option to hand
it back if it complicates the two amendments already in flight.

**The defect, reproduced here against the repo's own zod rather than accepted:** `z.unknown()` does
not require the key, so `submittedEventSchema` (`envelope.ts:72`, `payload: z.unknown()`) admits an
event carrying NO payload at all.
    absent                -> ACCEPTED  keys=["a"]   <-- key erased entirely
    present-but-undefined -> ACCEPTED  keys=["a","payload"]
    null                  -> ACCEPTED
    {}                    -> ACCEPTED
`JSON.stringify` erases absent and `undefined` alike, so the wire form loses the difference silently.
Lane 4 hit the live version in its own schema — a renderer wrote a literal `undefined` into a comment
body landing in an append-only table permanently.

**Scope verified, not assumed.** `eventEnvelopeSchema:84` inherits it via `.extend()`; its only
consumers are its own file and `test/envelope.test.ts`. `parse-event.ts` is SAFE — line 99
reconstructs as `{ ...envelope.data, payload: payload.data as unknown }`, explicitly setting the key,
and that line is the precedent for the fix. So no live exploit path; the reason to fix now is that
both schemas are EXPORTED and the next consumer inherits the hole with nothing to warn them.

**The over-fix hazard is the real content of this item.** The matrix is
`absent REFUSED · present-but-undefined REFUSED · null ACCEPTED · {} ACCEPTED`. **Only absence is the
defect.** A fix that also refuses `null` or `{}` would look correct, pass a careless review, and
quietly refuse legitimate claims — an empty claim is still a claim, and a null payload is still a
claim. All four cases go in as assertions so the two ACCEPTANCES are pinned as deliberate rather than
incidental.
Refinement I added from the probe: `'payload' in v` WOULD distinguish absent from
present-but-undefined (the key is genuinely present in the latter). `payload !== undefined` is still
correct, for a sharper reason than the one offered — both cases must be refused, so one check covers
both, and reaching for `in` invites the next reader to think a distinction matters that the matrix
says does not.

**After T3, `envelope.ts` is settled for this lane.** It will carry the membership composite id
(owner-ratified), `'invite'` in `ENTITY_KINDS`, and payload presence — all three recorded in the
coordination doc in the same change set. T14's share was pulled forward, so no further amendment to
that file is planned from lane 2 and sibling lanes can treat T3's landing as the settling point.
Not ours, recorded so nobody chases it: `z.infer` on the fixed schema yields `payload?: unknown`,
not assignable to `SubmittedEvent`, so a downstream consumer's natural unblock is a cast that erases
the guarantee rather than failing. That half is Plan 6's `makeSubmittedFactory`, held by lane 4's T6.

## T3 reported DONE_WITH_CONCERNS (commit 6f8d0e7) — and one concern reached back into T1

Gate: 15/15 tasks; domain 205 (was 152), rule-engine 115, server 93, ui 31, app-core 5. 15
falsifiability mutations, each failing at its own assertion, restorations verified with
`git diff --exit-code`. One mutation initially produced ZERO failures because it broke module load —
the implementer caught it as the setup-failure trap and re-ran it properly rather than banking it as
evidence. That is the discipline working unprompted.

**Concern 2 is the significant one, and my framing of it differs from the implementer's.** It reported
"ULID user ids are now forced at the door, a new hard constraint on Task 1". Checked: it is NOT new.
`packages/domain/src/envelope.ts:79` on **origin/main** declares `actorId: ulidString`, shipped by
Plan 1 long before either task. Every event's `actorId` is the signed-in user's id, which better-auth
mints — so if better-auth's default generator is not ULID, **no user this server creates could ever
author any event**, every submission refused `malformed-envelope` for a reason naming the envelope
rather than the identity layer that caused it. T3 only made it visible in a second place (the
membership composite). Verified `exec/04-t1-queryable-identity`'s `createAuth` configures no id
generator at all.
Ruling: this is T1's gap, fixed in T1's branch BEFORE merge rather than as a follow-up, because the
PR is open and unmerged and shipping it would plant a latent break in the identity layer that every
later plan builds on. Dispatched as fix round 3 with the falsifiability shape named (a ULID-format
assertion that passes with the config removed is not evidence) and a rider to check the vendor
migration's `user.id` column accommodates 26 characters — same class as the `account.issuer`
omission T1 already caught.

Concern 1 ACCEPTED AS BETTER THAN SPECIFIED: the userId half of the coherence check landed in
domain's `parse-event.ts` rather than a permission-layer home, because Task 9's file does not exist
and is not T3's to create. The implementer's argument that this is strictly STRONGER is correct —
client and offline replica pass the same door, where a server-side permission check would bind only
the server. Mutation M4 implements the user half as prefix-only, the exact half-done failure mode the
dispatch warned about in those words, and fails at its own two assertions; M3 proves the workspace
half fails independently. Relocatable at T9 if a permission-layer home is later wanted.
Concern 3 ACCEPTED: both coherence refusals reuse `code: 'malformed-envelope'` rather than widening
`EnvelopeErrorCode`/`IngestErrorCode`, which Plans 6 and 10 consume. Reusing an existing code is the
conservative option under the protocol and is trivially reversible.
Concern 4 RECORDED — a real behaviour change sibling lanes inherit: the blank-name refusal tightens
Plan 1's provisional `workspace.created`/`workspace.renamed`. The plan pinned `.trim() === ''`; the
shipped `z.string().min(1)` accepted `'   '`. It now REFUSES rather than trims, and a test asserts
`'  Corner  '` survives verbatim — refusing a whitespace-only name is not the same as silently
editing a name somebody claimed.

## PR #20 — the CI absence was the conflict, not a missing pipeline

`gh pr checks 20` reported no checks at all, which under the standing authorization would have
blocked auto-merge. Cause: the PR was **CONFLICTING** — main had moved five commits and the branch was
cut from f363b2f — and GitHub had created no run. Rebased onto origin/main: one coordination-doc
conflict where BOTH sides had appended at the same anchor (kept main's block, then T1's section
after it, verified both survive) and 36 lockfile conflict regions, resolved by taking main's lockfile
and regenerating with `pnpm install --lockfile-only`. Gate re-verified green post-rebase: 15/15,
`--frozen-lockfile` exit 0. Force-pushed with `--force-with-lease`; PR is now MERGEABLE and the `gate`
job is IN_PROGRESS. Lesson worth keeping: **a PR with no checks is not necessarily a pipeline
problem — check mergeability first.**

## T5 MUST-NOT-DROP: the forged-server-origin refusal (routed by the co-ordinator, verified here)

**Verified the gap:** `origin` is only ever STORED in `apps/server/src` — `event-store.ts:61` (insert
column list), `:72` (binding), `:95` (row type), `:119` (read-back). Nothing validates, overwrites or
compares it anywhere in `apps/server/src` or `packages/*/src`. `submittedEventSchema:80` is
`z.enum(ORIGINS)` and `ORIGINS` at `:7` includes `'server'`, so a client setting `origin: 'server'`
walks the door. `claim.contested` is registered ZERO times in main's `vocabulary.ts`, so reachability
is nil today and becomes live when lane 4 merges Plan 10's prefix.

**Cost to absorb: zero — T5's brief already carries it verbatim.** Line 218-219:
`if (env.origin === 'server') { return refuse('permission.role', 'Only the server itself may record
server-origin events.'); }` with the exact-rejection test at lines 56-66 asserting that message
character-for-character. So this is T5 executing as written, not new scope. **Pinned here as
must-not-drop rather than trusted to the brief**, because the whole hazard the co-ordinator named is
a window whose named closer ships without the thing it was named for.

## RULING — where the permission gate lives. Resolve before dispatching T5.

T5's brief line 292 says the bootstrap's server-origin appends bypass `checkPermission` because
"the gate is the HTTP door (Step 5)". My earlier R13 put the gate inside `commitOne` with
`sessionUserId` threaded in. These are different designs and the difference is load-bearing:
**if the gate lives only at the HTTP door, Plan 10's `POST /v1/sync` bypasses it entirely** — which
contradicts the coordination doc's own statement that a sync-refused gate violation becomes a
contested claim "with no extra wiring", and would leave every sync-path write unchecked.
**Ruling: the gate goes INSIDE the ingest path; the session originates at the HTTP door and is
threaded through.** The bootstrap is recognised by the pair (sessionUserId null AND origin 'server'),
so it still gets `commitOne`'s locks, seqs, projections and `notifyCommitted` while skipping the
permission check — rather than by a second append function that would duplicate all of that.
Cost if wrong: the gate is one call site either way, so relocating it is small; getting it wrong the
other way silently unguards a whole door that does not exist yet, which is the expensive direction.
The brief's "the gate is the HTTP door" is loose phrasing about where the SESSION originates, and
T5's dispatch will say so explicitly.

Recorded from lane 4, same §9 family, opposite remedy, worth keeping for the pattern: their
`claim.contested_resolved` will 500 until Plan 10 T4 because the engine context has no `getContest`.
The attractive fix — return `null` — is worse, and their implementer proved it BY MUTATION rather
than by argument: it converts a wiring bug into a legitimate-reading refusal telling a user "no
contested claim is recorded" when the truth is the context cannot see contests at all. A loud 500 on
an event nothing submits yet beats a quiet lie. The difference from §9's remedy is whether an honest
failure is available.

### T1 fix round 3 — the ULID gap was REAL and production-breaking (commit 0a6a568)

better-auth's default generator is `createRandomStringGenerator("a-z","A-Z","0-9")(size || 32)`
(`@better-auth/core/dist/utils/id.mjs`) — a 32-char MIXED-CASE string, which can never satisfy
`ULID_REGEX` because mixed case alone disqualifies it. So without this fix **every event any user
tried to author would have been refused at the door**, with a reason naming the envelope rather than
the identity layer that caused it. This was latent on a PR that was otherwise ready to merge.

Configuration point taken from the installed `.d.ts` as instructed: `init-options.d.mts:374`,
`generateId?: GenerateIdFn | false | "serial" | "uuid"` under `advanced.database`. Configured as
`generateId: () => newUlid()`, reusing domain's generator so `ids.ts` stays the single origin.
Scope: EVERY model, deliberately — a `user`-only branch needs a fallback and both honest ones are
worse (`false` asks Postgres for a default the vendor schema does not define; better-auth's own
`generateId` is a vendor internal), and global means a future plugin's table conforms without anyone
remembering a list.
Migration needed no change: every id column is unbounded `text` (31x text, 13x timestamptz, 3x
boolean, 1x integer, no `varchar(n)`/`char(n)` anywhere), and `get-migration.mjs:493-494` only
retypes ids for the `"uuid"`/`"serial"` literals, so the anti-drift test stays green — the library's
own planner confirms the schema still matches.

**Falsifiability in the right shape, which is why this one is trustworthy:** `test/auth/user-ids.test.ts`
signs a user up through the REAL phone-OTP path, reads the id back FROM POSTGRES, and runs it through
the REAL door (`parseEvent`) rather than a regex twin. With the option removed it fails three ways,
the first being a live reproduction of the predicted production failure:
`door refused: malformed-envelope — event envelope is malformed at actorId: must be a ULID`.
A regex-matching test over a locally generated id would have passed while proving nothing about what
better-auth actually writes.

**Two things flagged INTO the re-review rather than accepted:**
(a) `create-context.mjs:106-119` consults a LEGACY `advanced.generateId` FIRST, which the type
    definitions do not declare, while the fix uses the typed `advanced.database.generateId`. If the
    typed option works today only because the legacy one is unset, a future version or a stray config
    could shadow it silently.
(b) Does a global generator weaken SESSION TOKEN entropy? A ULID is partly timestamp and therefore
    partly predictable; a ULID where a high-entropy random token is expected would be a security
    regression. The implementer claims tokens are untouched because `internal-adapter.mjs` calls
    better-auth's own `generateId(32)` directly — that is exactly the kind of claim this task has
    already produced wrong three times, so it gets verified rather than believed.

### T1 fix round 3 re-review — ADDRESSED, no new breakage, "I would merge this branch"

Both flagged questions came back as verified non-issues, and the reasoning is worth keeping:
- **The legacy precedence chain is real but harmless, because there are TWO consumers, not one.**
  Consumer A (`create-context.mjs:106-118`) does check legacy `advanced.generateId` first. Consumer B
  — `@better-auth/core/dist/db/adapter/get-id-field.mjs:25-30`, the layer that actually supplies the
  default id for every row the adapter writes — **never consults the legacy key at all**; it reads
  only `advanced.database.generateId`, the one the fix sets. Legacy is also undeclared in the types
  and unreachable without a cast, nothing in the repo sets it, and plugins cannot inject it
  (`runPluginInit` merges into a LOCAL binding while `generateIdFunc` closes over the context's).
  Residual watch item, non-blocking: a future config setting legacy would shadow A but not B — a
  split, not a silent revert, and this diff's test would catch it.
- **No entropy regression.** Session tokens are minted by `internal-adapter.mjs:274`'s
  `token: generateId(32)` from better-auth's own CSPRNG import, not the hook. And no credential is
  looked up BY a ULID id: sessions are found by `token`, verifications by `identifier`, with `id`
  only used to update a row already found. A partly-predictable session ID is not a bearer value
  here. Also confirmed WHY `false` was the wrong fallback: `get-id-field.mjs:26` makes it return
  `undefined` as the default, and the migration declares `"id" text PRIMARY KEY` with no column
  default, so inserts would fail.
Re-reviewer reproduced the falsifiability itself (three failures at their own assertion lines,
including the live `malformed-envelope … at actorId: must be a ULID`), re-ran the anti-drift test
4/4 with the option in place, and re-ran the full gate at 15/15 / 405 tests.

Deferred minors (final review triages): test-order coupling in `user-ids.test.ts` (tests 2-3 depend
on test 1 having signed up; reliable under vitest's in-file ordering and they still fail at their own
assertions); a dead `sessionId` return value; and the observation that ULIDs embed a creation
timestamp, so a user id leaks account-creation time — the deliberate repo-wide convention for every
id in the series, worth being a conscious choice rather than an accident.
The re-reviewer also independently rediscovered the membership-vs-`ulidString` collision as an
out-of-scope note, correctly observing the composite regex is absent from THIS branch — it is on the
lane branch in T3, which is why T1 merges independently.

## PR #20 AUTO-MERGED 2026-08-28 — main at 974fb9a

Merged under the coordination doc's standing auto-merge authorization: full machinery complete (SDD
task review, three fix rounds, each closed by a scoped re-review verdicting every finding ADDRESSED,
final re-reviewer stating "I would merge this branch") AND independent CI green (`gate=pass`).
Rebase-merge, branch deleted. Owner notified via the lane co-ordinator; lane 3 notified directly
since its Plan 7 server tasks were the ones blocked on `Queryable`.

**Task 1: complete.** Six commits from f363b2f. `Queryable` is at `apps/server/src/db/queryable.ts`.

What this task actually bought, beyond its own scope — three defects that would each have shipped:
1. **The plan's own Step 10 would have shipped a broken auth schema.** `@better-auth/cli` pins
   `better-auth@1.4.21` and emits the 1.4 schema regardless of what the server imports, omitting
   `account.issuer` and its unique index — a migration that applies cleanly and fails on the first
   Google sign-in. The step that exists to catch drift would have introduced it.
2. **Every user the server could create would have been unable to author anything.** better-auth's
   default 32-char mixed-case id can never satisfy `ULID_REGEX`, and `envelope.ts:79` has required
   `actorId: ulidString` since Plan 1. Caught on a PR that was otherwise ready to merge.
3. **The durable cross-plan record carried an inverted fact and then a wrong trigger.** The zod entry
   said better-call resolved zod 4 when the lockfile says 3.25.76, and the openapi caveat named an
   event that cannot fire with a remedy aimed at it.

The through-line, now recorded in the coordination doc and carried in every later dispatch:
**a sentence explaining WHY something is safe is itself a claim, and gets verified like code.**
Three such sentences in one task were written confidently and were false; all three were caught by
asking a reviewer to run the mechanism rather than read it.

## Lane branch NOT rebased yet — deliberate

`exec/04-auth-visibility` stays at a8e746f + T3 while T3's review is in flight. Rebasing under a
running reviewer would move the working tree beneath it while it reads files, and its diff package is
already static. Rebase onto 974fb9a the moment that review returns, BEFORE dispatching T2 (which
consumes T1's `createAuth` and needs it present).

### T3 review — Spec PASS, quality APPROVED (2 Important, 6 Minor, none blocking)

Reviewer re-ran 5 of the 15 mutations itself (M2b, M3, M4, M7, M8 — including the prefix-only
half-done mode) and every one failed at exactly its claimed assertions, at assertion level. It
verified the `ulidString`-unchanged claim BY PROBE rather than by reading intent, and confirmed all
four payload cases live, with `null` and `{}` staying green under the M7 revert — which is the
property proving the over-fix hazard was avoided.
It also endorsed the parse-event home for the user half on its own analysis: a permission-layer home
covers server-only, while `parse-event.ts` covers client, server and offline replica through one
door, and `membershipId` already living in domain means this is not a layering violation.

**Design detail worth carrying to later tasks:** the two coherence halves are asserted through
DIFFERENT DOORS — the workspace half against `submittedEventSchema` directly, the user half through
`parseEvent` with prefix-CORRECT/user-WRONG ids. That is why M3 and M4 each kill one half with the
other's tests untouched. The obvious design — asserting full equality only — would have let either
check be deleted silently, because full equality subsumes the prefix.

**Fix round 1 dispatched — both Importants are the same shape: a real cross-plan constraint that
exists in the code and nowhere durable.**
1. `eventEnvelopeSchema` inherits the workspace half and NOT the user half (the latter needs the
   parsed payload). Correct and unavoidable, but invisible: zero production consumers today, and the
   first one that validates a full envelope — a sync-down reader — gets half a check with no way to
   tell. Remedy: a comment at the site AND a coordination-doc line.
2. The user half imposes an undocumented forward constraint — any future membership-KIND event type
   must carry a top-level string `userId`, enforced by kind rather than by type. Binds T14 and
   Plan 10, and the coordination doc is where those authors look.
   Plus: record the blank-name tightening, which the reviewer found missing from the landed
   consequences though the ULID one is there — it changes a Plan-1-owned type sibling lanes already
   use, and the interesting half is that it REFUSES rather than trims.

**Six minors deferred to the final whole-branch review** (SDD rule: minors never enter the loop):
issue-code drift `invalid_string`->`custom` and issue-COUNT drift, both unobservable through
`parseEvent` which reads `issues[0]`; the scope-only `membership.revoked` ordering — I checked the
realistic stale-client shape `{userId, role, scope}` and it DOES surface the pinned scope sentence,
which is why this stays minor rather than being promoted; and three stale statements in files T3 did
not touch (`engine-context.ts:11`'s now-false kind enumeration, `Features.md:22`'s "provisional seed
vocabulary", and the plan's Step-9 pinned commit string saying "seven event types" when six were
registered and one was a takeover).

**Controller-resolved "cannot verify" items:** the parse-event home is my ruling and stands; T13 owns
Features.md §6 per R11; the `malformed-envelope` reuse is my accepted conservative call (R-C3) and
the reviewer's flag does not change it; the Step-9 pinned string is not load-bearing — the working
rules require prose commit messages, so replacing it was correct.

Lane branch rebased onto 974fb9a; gate re-verified 15/15 before dispatching the fix round so the
implementer edits the CURRENT coordination doc rather than the pre-merge one.

### T3 fix round 1 re-review — all three ADDRESSED, but the round introduced two new Importants

Re-reviewer reproduced all six cells of the widening table itself against a freshly-built dist, and
confirmed the implementer's widening was RIGHT: both exported schemas are built from the same private
`submittedEventObject` and each `.superRefine`d with the same `refuseMisfiledMembership`, so there is
no mechanism by which one could carry more of the check than the other. The review had named only
`eventEnvelopeSchema`; the implementer checked and found the gap in both. Proved the by-kind
constraint three ways with an injected registry (a different registered membership-kind type with no
`userId` -> refused; non-string `userId` -> refused; identical userId-less payload on a
NON-membership kind -> accepted). Checked the "used to pass" claim at the merge-base rather than
assuming it: `git show a8e746f:...vocabulary.ts` is literally `z.string().min(1)`, which accepts `'   '`.

**Two new Importants, both introduced by the fix, both one sentence:**
1. **§6's closing sentence is false three ways and sits in the durable record.** It claims "a fixture
   with a padded workspace name now fails where it used to pass". Padded names do NOT fail — the same
   paragraph says so two lines earlier and a test pins it; no fixture anywhere carries a padded or
   blank workspace name; and it names `envelope.ts` when the door is `displayName` in
   `events/membership.ts`. Duplicated into the report, so both copies need correcting.
2. **The JSDoc binds to `submittedEventSchema` ONLY** — TypeScript attaches a `/** */` block to the
   declaration immediately below it, and the emitted `dist/envelope.d.ts` proves the consequence: the
   note is at `:64`, `submittedEventSchema` at `:84`, and `eventEnvelopeSchema` at `:162` with **no
   doc comment of its own**. So hover and jump-to-definition on the schema the ORIGINAL finding
   singled out surface nothing. This undercuts the fix's own justification in both places it is made.
   Sharp catch: true for a reader scrolling source, false through the tooling path, and only the
   emitted declarations reveal it.

Folded in two precision corrections: §6 says the user half compares `entity.id`'s "right half" where
`parse-event.ts:128` compares FULL EQUALITY against `membershipId(...)` (the doc's own test-design
bullet at `:990-993` is precise about exactly this distinction, so two passages describe one line
differently); and "whatever its type" is exact only for a FUTURE membership-kind type whose own
payload schema does not require `userId` — the two shipped types refuse `invalid-payload` first.

**Pattern named to the implementer, now the fourth instance on this branch.** T1 shipped three
sentences explaining why something was safe that were false (the `noEmit` assertion, the lockfile key
misread as an edge, the caveat naming a trigger that cannot fire); this is the fourth. Every one was
caught only because a reviewer RAN the mechanism instead of reading it. Standing instruction added to
this lane's doc rounds: **in a docs round the prose IS the deliverable — for every sentence asserting
that something happens, is inherited, or now fails, run it; if you cannot run it, do not assert it.**

### T3 fix round 2 re-review — both ADDRESSED with run evidence, ready to ship

Re-reviewer compiled BOTH states independently to check the JSDoc binding: pre-fix (from
`git show 48af597:...envelope.ts`) reproduces the finding exactly — note at `:81`,
`eventEnvelopeSchema` at `:162` preceded by `}>;` with no doc; post-fix, a fresh emit to a scratch
outDir is byte-identical to the committed `dist/envelope.d.ts` and `grep -c` for the note returns 2,
each immediately preceding its own declaration. It also traced all 16 deletions to their replacements
and confirmed nothing load-bearing was dropped.

**Tooling finding worth carrying into every dispatch:** the reviewer reports that
**`grep -r` over a directory is unreliable under the rtk proxy — one of its early directory greps
silently returned nothing**, so it redid every scan with `find … | xargs grep` and explicit file
enumeration. This matches the standing note in MEMORY.md and is now the second independent
confirmation. A silent empty result from a directory grep is indistinguishable from a true negative,
which makes it exactly the wrong tool for "does this claim have a referent anywhere in the repo".

One Minor, non-blocking and correctly analysed rather than accepted: the doc's surviving
"~100 lines apart" is accurate today (measured 97), hedged, and stated alongside the cause; the
report's own self-catch overstates by saying both files dropped the count when §6 keeps a hedged one.
The imprecision lives only in the gitignored report, so nothing false ships.

## Task 3: complete (commits a8e746f..552f62c, review clean after 2 fix rounds)

Three commits: 5cd2e5c (the task) -> 48af597 (fix round 1: two undocumented cross-plan constraints)
-> 552f62c (fix round 2: a false sentence in the durable record, and a JSDoc bound to the wrong
export). 15/15 turbo tasks, domain 152 -> 205 tests.

## PR #22 AUTO-MERGED — main at dd9c221; envelope.ts is SETTLED for this lane

Merged under the standing authorization: full machinery (task review Spec PASS/quality approved, two
fix rounds each closed by a scoped re-review with every finding ADDRESSED and the last one stating
"ready to ship as a PR") AND independent CI green (`gate=pass`). Rebase-merge, branch deleted.
Lane branch reset to origin/main; gate re-verified 15/15.

Notified: the co-ordinator (relaying to lanes 1 and 4) and lane 3 directly, since it had asked to be
pinged and wanted the rebase in one move. Told all of them the same thing — **rebase once, and that
is the last envelope amendment from lane 2**, because T14's share was spent early in T3 for exactly
this reason.

Also relayed as an INHERITED behaviour change that is not in the amendment list and is easy to miss:
`workspace.created`/`workspace.renamed`/`project.created` now refuse a whitespace-only name where
`z.string().min(1)` accepted `'   '`, and they refuse RATHER THAN TRIM. No existing fixture in the
repo is affected — swept explicitly, because the first draft of that very note claimed a fixture DID
break and that turned out to be false.

### The `ZodEffects` consequence — checked, already durable in both places

The co-ordinator flagged that "a ZodEffects has no `.extend`" belongs in the record. Verified rather
than added: it is at coordination doc `:976` AND at `packages/domain/src/envelope.ts:170`, and the
code matches — `submittedEventObject` is a private `z.object` at `:174` with both exported schemas
built from it and each `.superRefine`d. The next person extending either finds the answer in the file
they are editing, before they hit the error. Nothing to add; duplicating it would have been drift.

### Convergent rule, recorded from two directions independently

Lane 4 + the co-ordinator wrote: **where a format has one authority, assert THROUGH the authority,
not alongside it.** Their instance: a test asserting `/^[0-9A-HJKMNP-TV-Z]{26}$/` — right alphabet,
right length, **missing the leading `[0-7]`** — which pins "looks ULID-ish" rather than "passes the
door", and would accept an id `ULID_REGEX` refuses. A test that accepts what production rejects is
worse than no test, because it reports confidence. Their sweep found exactly ONE hand-spelled
ULID-shaped regex across main and all four worktrees.
My T3 dispatch had reached the same place from the definition side ("a second spelling of what a ULID
is would be free to drift"), which is genuine convergence — neither had seen the other.
**My addition, which their instance does not show: composition must be ASSERTED, not merely
performed.** `ids.test.ts:44-47` compares `MEMBERSHIP_ID_REGEX.source` against the composed string,
so a later hand-spelling that behaves identically still fails. Without that assertion the composition
is a convention rather than a guarantee, and someone "simplifying" it back to a literal gets a green
suite.

## T2 dispatched (opus/high) — auth routes + makeRequireSession

Carrying: the `@better-auth/passkey` specifier correction; the CLI ban and `auth:schema` replacement;
that better-auth now mints ULID ids; the `/v1/*` vs `/api/auth/*` prefix split; `buildApp` being
SYNCHRONOUS where the plan's tests await it; AJV `coerceTypes:false` meaning query params do not
coerce and may not be "fixed" by re-enabling coercion; that a 401 is deliberately NOT the refusal
shape because being unauthenticated is not a claim; the superset sign-in helper serving T8/T12/T13
from one function; both tooling traps (rtk's collapsed test output, and directory greps silently
returning nothing); and the run-every-claim rule.

**Explicitly assigned to T2 as ITS work rather than inherited fact:** better-auth's RUNTIME surface —
the endpoint paths, the `better-auth.session_token` cookie and its flags, and the bearer plugin's
`set-auth-token` header. T1 verified the compile-time API from the installed `.d.ts` and deliberately
left these, because establishing them needs a live request. **Plan 6's client and Plan 10's sync both
code against those exact strings, so until T2 lands they are plan text and not fact** — T2 records
the verified values in the coordination doc.

## 2026-08-31 — resumed after the weekly pool reset; T2 re-dispatched

The first T2 dispatch died to the weekly rate limit on 2026-08-28, mid-task. **Verified rather than
assumed what it left**: no tracked changes, nothing staged, no report written, HEAD unmoved — it died
during a runtime probe, before writing anything. The only residue was two untracked scratch scripts
in the repo tree (`apps/server/probe.mts`, `probe2.mts`).

**Read them before deleting, and it paid.** `probe2.mts` enumerated `auth.api` to extract better-auth's
real endpoint table — exactly the runtime verification T2 was dispatched to do. I ran it myself and
kept the findings, so the re-dispatch carries verified facts instead of a task:
- **All 46 endpoints are GET or POST; there are no other methods** (`NON GET/POST: []`). The catch-all
  needs exactly those two verbs, and that is now a checked fact rather than an assumption.
- Confirmed as the plan/map claimed: `POST /phone-number/send-otp`, `POST /phone-number/verify`,
  `POST /sign-in/magic-link`, `POST /sign-in/phone-number`, `POST /sign-in/social`, `POST /sign-out`.
- **Corrections to plan text:** `/get-session` is **GET|POST**, not GET only; and
  `/passkey/generate-register-options` + `/passkey/generate-authenticate-options` are **GET**, not
  POST. `/magic-link/verify` is GET too.
- `/reset-password/:token` is a **parameterised** vendor path — relevant to how the catch-all is shaped.
Scratch removed from the repo tree afterwards; the re-dispatch tells the agent to keep probes in the
session scratchpad, not in `apps/server`.

**Still T2's to establish by live request** (a `.d.ts` cannot answer them): the session cookie's name
and flags, and whether the bearer plugin returns its token via a `set-auth-token` header. Plan 6's
client and Plan 10's sync code against those exact strings.

Rebased onto origin/main at 2bc2e13 (the co-ordinator's #21 doc-only PR landed while the pool was
exhausted). Gate re-verified 15/15 before dispatching.

**Budget-policy note for the record:** the coordination doc's rule is that budget pressure DEFERS work
and never thins a gate. That is what happened by force here — the lane stopped rather than continuing
at reduced depth — and the resumption runs at full machinery, with T2 getting the same
implementer→review→fix-round treatment as T1 and T3.

## T2 reported DONE_WITH_CONCERNS (commits c6bafb9, 950131f) — one concern is the best catch of the lane

Gate 15/15; server 102 -> 128 tests (+17 sign-in flows, +6 require-session, +3 config). 15 mutations
biting at their own assertions, with M4 self-reported as deliberately uncovered.

**Concern 1 — a security check that would have existed in production and in NO test.** The
implementer edited `auth.ts` (TASK 1's file) to add `advanced.disableOriginCheck: false`. Mechanism:
better-auth computes `skipOriginCheck` as `isTest() ? true : false` when the option is unset, and
`isTest()` reads `NODE_ENV === 'test'`, which vitest sets. Left alone, the CSRF origin check runs in
production and never in a test — and because `disableCSRFCheck` is unset, the WHOLE CSRF middleware
goes down with it. **A green suite against a server that 403s the same requests.** Proven by
mutation, not argued. This is the "check that cannot fail" pattern in a new costume: not a check that
cannot fail, but a check the test environment silently switches OFF, so the suite reports confidence
about a code path it never exercises. Sent to review for independent verification of the mechanism
before I ratify the cross-task edit.

**Concern 2 — the boot contract changed, correctly.** `BETTER_AUTH_URL` and `BETTER_AUTH_SECRET` are
now required with no defaults. The brief's Step 9 would have DEFAULTED THE SIGNING SECRET to a string
printed in this repo — a defaulted signing secret is a real vulnerability, not a convenience. Anything
starting `index.ts` without them now fails at `loadConfig`, by design.

**Concern 3 — a forward constraint recorded in coordination §7.** `trustedOrigins` is still
better-auth's default (the `baseUrl` origin). When T14's `WEB_ORIGIN` lands and the web app is served
from a different origin, it must be added there or **every browser cookie POST 403s**.

**Concern 4 — the CSRF rule binds later tasks.** Any non-GET carrying a `Cookie` needs a trusted
`Origin`; bearer-only is exempt. That is WHY `signInWithPhone` returns a bearer token, and route tests
for T5/T8/T12/T13 should authenticate that way or send `origin: <baseUrl>`.

**Concern 5 — the standing rule worked, and worked WITHOUT a reviewer.** Three prose claims the
implementer wrote were false and it caught all three ITSELF by running them: the raw parser does not
rescue a bodyless POST; better-auth refuses form encoding rather than using it; and building the
request URL from `baseURL` rather than `Host` prevents nothing observable. All corrected, and the
third is code shipped with **no covering check, with the comment now saying so** — reported rather
than dressed up. First time on this branch the rule caught claims before review rather than after.

**Concern 6 — production still uses `LogOtpSender`**, writing every OTP to the process log. The
plan's named deployment gap, stated at the site in `index.ts`. Plan 11 owns deployment; flagging it
here so it cannot be lost.

T2 review dispatched (opus/high) with all six as named questions rather than conclusions — especially
whether forcing the origin check ON in tests makes any test pass for a reason it should not, and
whether "no covering check" is the honest description of that third item or something that should
gain a test.

### T2 review — Spec PASS, quality APPROVED, no Critical (6 Important, 5 Minor)

Reviewer ran the shipped suite (19 files, 128 tests), reproduced M8/M4/M3/M11 itself and added two
mutations of its own.

**Ruling — the cross-task edit to `auth.ts` is RATIFIED.** Mechanism independently confirmed in the
installed 1.7.2 (`create-context.mjs:210`, `env-impl.mjs`, `origin-check.mjs:14`) and M8 reproduced:
exactly two failures, both `expected 200 to be 403`. The reviewer established something the
implementer did not claim — **`disableCSRFCheck: false` alone would NOT have fixed it**, because
`skipOriginCheck` stays `true` under test and `shouldSkipOriginCheck()` returns early regardless. So
`disableOriginCheck: false` is necessary AND sufficient, and `createAuth`'s options object is the only
place it can live: the edit to Task 1's file is FORCED, not convenient. It is one line, at the site,
with the mechanism quoted, and recorded in the same commit. Cost if wrong: a lane owns one line of
another lane's file, visible in the diff and trivially relocatable.
Also checked and clean: forcing the origin check ON in tests makes no test pass for a wrong reason —
the two tests it enables are REFUSAL tests, and the accept test supplies the origin a browser actually
sends. It makes the test configuration equal the production configuration, which is the opposite of
the failure class.

**Six Importants, all cheap, all going in before the PR:**
1. **The multi-valued `Set-Cookie` forwarding has no check that can fail.** Reviewer swapped
   `getSetCookie()` for the naive `.get('set-cookie')` and got **133/133 GREEN**, while a browser
   parses the flattened result as ONE cookie and clears only `session_token` — `session_data` and
   `dont_remember` survive sign-out. Every shipped assertion is `toHaveLength(1)`, and n=1 is exactly
   where right and wrong are indistinguishable. One assertion on an existing test kills the mutant.
2. **The recorded CSRF rule is wrong for the first request a browser makes.** `formCsrfMiddleware` is
   separately mounted on four endpoints and force-validates a COOKIELESS request carrying
   Origin/Referer/Sec-Fetch-*. Measured: `sign-in/magic-link` cookieless with a hostile origin -> 403,
   while `send-otp` and `sign-out` -> 200. The practical guidance survives; the mechanism sentence
   Plan 6 and Plan 10 will read does not.
3. **`OPTIONS` is not mounted** -> cross-origin preflight 404s from Fastify before better-auth is
   reached, so T14's recorded constraint (add WEB_ORIGIN to `trustedOrigins`) is necessary but NOT
   sufficient.
4. **`.env.example` is now boot-failing** — documents a 9-character secret against the new `min(32)`,
   and `pnpm check:env` passes because it checks PRESENCE, not validity. Its header claim is also now
   false. This is the configuration contract, and same-change-set doc sync is a repo convention.
5. **Product routes are outside better-auth's CSRF entirely, unrecorded.** `validateOrigin` returns
   immediately when `!ctx.request`, and `makeRequireSession` calls `auth.api.getSession({headers})` —
   so the origin rule binds `/api/auth/*` only. Once T5/T12 put `requireSession` on `/v1/events`, a
   cookie-authenticated cross-site POST is protected by **SameSite=Lax alone**. Defensible, but a
   security posture nobody wrote down, and §7 currently implies better-auth guards a door it never sees.
6. **The `LogOtpSender` gap is marked for half of what it does** — it also accumulates every OTP ever
   issued in an unbounded array, and `otp-sender.ts:17-19`'s comment denying exactly that is made
   false by a line in THIS diff.

**Ruling — Minor 1 PROMOTED to the fix round.** `routes.ts:64`'s
`baseURL ?? http://${request.headers.host}` is dead today but activates in precisely the future its
own comment defends against, so the comment states a guarantee the code does not make
unconditionally. That is this branch's signature defect — a claim about why something is safe that
does not hold under the condition it is written for — expressed in code rather than prose, which is
why it is not staying Minor. Cost if wrong: one line, and the alternative (throw or a constant) has
no downside today.

**Four Minors deferred** to the final whole-branch review: the D9 oracle wording (it leaks short-lived
activity-recency for a phone number, not user existence — the decision stands, the record should name
what it actually leaks); `auth-dev.ts:33`'s surviving dev-secret literal, verified off the production
path; `currentUserId`'s knowing type lie, mitigated more than its comment claims because
`actorId: ulidString` would refuse a mis-attributed event at the door; and
`BETTER_AUTH_TRUSTED_ORIGINS` as an undocumented second path to the T14 change.

**Reviewer's own uncovered-code finding, worth keeping:** it applied M4 (swap `baseURL` for the Host
header) and ran the ENTIRE server suite — 128 tests, zero failures. So "no covering check" is the
honest description of `routes.ts:64`, and the implementer reporting it rather than dressing it up was
correct. It ships as-is because the behaviour is unobservable today, proven by measurement.

## 2026-08-31 — the forged-origin window is OPEN; RULING: split the closer out of T5

The co-ordinator elevated T5 and reported the window now open. **Verified every claim against
`origin/main` at b0ef5f5 rather than relaying it**, enumerating every `.ts` under `apps/server/src`
and `packages/rule-engine/src` (file-by-file, not a directory grep) and filtering the two documented
false-positive shapes:
- `claim.contested` IS registered — `vocabulary.ts:241`, `_resolved` at `:248`. `parseEvent` admits it.
- **`origin` is validated NOWHERE.** Only reads: `event-store.ts:61/72/95/119` (storage only —
  column list, binding, row type, read-back), `contests.ts:43` (the evaluator the forgery defeats),
  `harness.ts:35/101` (fixtures). Nothing compares, overwrites or refuses it.
- **No permission-gate module exists** under `apps/server/src`. Confirmed.
- **`ENTITY_WORKSPACE_MISMATCH_RULE` is genuinely not a mitigation**, and the source shows why:
  `ingest-service.ts:110` is `head.workspaceId !== envelope.workspaceId` — the OUTER envelope. The
  §11 forgery's outer envelope is honest (a real ticket in its real workspace) and the lie lives in
  `payload`, which that guard never reads.

Compounded shape, restated so it is not softened: not "a client can forge the record of a refusal"
but **a client can write a permanent, un-deletable ledger entry attributing a fabricated claim to any
actor in any workspace** — because the append-only trigger makes it permanent and §11 leaves the
embedded `originalEvent` unbound to the outer envelope.

**RULING — the origin refusal is extracted from T5 and lands as its own micro-PR.**
Checked rather than assumed whether T5 could simply go next: it cannot. `checkPermission`
(task-5-brief `:251-257`) calls `resolveEffectiveRole(db, sessionUserId, env.workspaceId)` and
`PermissionContext` embeds `EffectiveRole` — both are **Task 4's**, and T4 has not run. So "T5 next"
would wait for T4 anyway and deliver the gate as one large task at the END of it, keeping the window
open LONGER than splitting.
The origin refusal is `checkRolePermission`'s FIRST branch and reads only `env.origin` — it touches
`ctx` not at all, so it is fully extractable from what T5 owes T4. Order becomes:
**T2 -> origin micro-PR -> T4 -> T5.**
Cost if wrong: a module briefly holds one check. The only real risk is somebody reading a one-branch
gate as a complete one, so the file AND the PR must name it deliberately partial and list the pending
checks. This is the same additive layering the plan already uses when T9 extends T5's gate.
Not disturbing T2's fix round, which is live in this worktree.

**Recorded from lane 4's `contest-events.ts`, as the good version of a pattern this series keeps
getting wrong:** it REMOVED its own `.refine` asserting `payload !== undefined` because T3's envelope
amendment now enforces it at the door — **and kept the test**. Two schemas stating one rule is a
second definition that drifts the moment the door's rule moves; but deleting the test alongside the
refine would have removed the witness. Keep the guarantee pinned, drop the duplicate implementation.
The tempting symmetric move — delete both — looks tidy and loses the evidence.

### The split is RATIFIED, with one refinement to the mitigation that I am adopting verbatim

The co-ordinator accepted the correction and withdrew its own sequencing: "T5 next" would have waited
for T4 anyway and then delivered the gate as one large task at the end, which is slower to the thing
that matters. It also agreed the extraction is right ON THE MERITS rather than merely faster — the
origin refusal reads only `env.origin` and touches `ctx` not at all, so it is genuinely separable
rather than a fragment carved out for scheduling convenience.

**Refinement adopted — it improves my stated mitigation and goes into the micro-PR dispatch verbatim:**
naming the module "deliberately partial" is not enough, because *that phrase ages into background
noise*. The docblock (and ideally the name) must say **what it does NOT yet check** — "does not yet
check role, membership, or visibility" — which stays legible to someone arriving cold in three weeks.
The failure this guards against is somebody reading a one-branch gate as a complete one, and a label
that says only "partial" does not tell them what is missing.

Two records to carry:
- The co-ordination doc's section is now wrong on sequencing (it names T5 as the elevated closer; the
  closer is the micro-PR, with T5 completing the gate afterwards). The co-ordinator is proposing the
  correction to the owner rather than editing under this lane — **this lane does not wait on it.**
- The `contest-events.ts` pattern is going up beside the documentation rule: drop the duplicate
  implementation, keep the test as the witness; the tempting symmetric move is deleting both, which
  looks tidy and destroys the evidence.

Worth noting for the record: **two independent sweeps of `origin` agreed**, including both
false-positive shapes (`auth.ts`'s "origin of what a ULID is" and `rebuild.ts`'s match inside
"original"), and two independent readings of `ingest-service.ts:110` agreed it is not a mitigation.
Agreement between two separately-run verifications is worth more than either alone — and it is the
answer to the risk that a single verifier's directory grep silently returned nothing.

### T2 fix round 1 re-review — all seven ADDRESSED, one new Important (a stale count this commit created)

Re-reviewer ran every verdict rather than reading it, and went past what was asked twice:
- On finding 1 it applied the mutation AND a **second** wrong implementation
  (`cookies.map(c => c.split(';')[0])` — right names, right order, attributes stripped), which the
  assertion also caught at `Max-Age=0`. So the assertion pins three cookies BY NAME, IN ORDER, EACH
  EXPIRED — not a count a different wrong implementation could satisfy. That is the distinction
  between a count and a check.
- On finding 5 it went past the doc's sentence to the future the sentence warns about: a
  `requireSession`-protected product route with a cookie and a forged cross-site Origin returns
  **200 with the resolved userId**. That is the load-bearing confirmation for Plans 5 and 12, and it
  is the reason the recorded posture matters rather than being a footnote.
- On finding 4 it made `parseEnvExample` return `{}` and confirmed the guard fails AT THE GUARD, not
  vacuously — and separately confirmed `check:env` **still exits 0** on the bad secret, so the new
  test is genuinely the sole guard. The class is closed, not just the instance.

**New Important — a stale measured count, in the comment that says it was measured.**
`routes.ts:48` and coordination `:1693` both say removing the raw body parser fails "12 of the 17
checks"; the fix added three tests so the file has 20, and the measured figure is **13 of 20**. In
scope rather than pre-existing: **this commit's own hunks rewrote the surrounding text in both
places** — `routes.ts` corrected "46 endpoints" twelve lines above and left "17" in the same comment
block; the doc's re-flowed "46 entries / 44" sentence ends one line above the stale "17". And the
comment it sits in says "Run, not reasoned". A measured claim, in a comment asserting it was
measured, falsified by the same commit that corrected its neighbour.
Dispatched as a two-line fix with an instruction NOT to take 13/20 from me — re-run the mutation and
report the observed figures, because a relayed number is not a measured one. Also asked it to
consider whether a bare count is the right thing to state at all, since it is correct only until the
next test is added to that file, which is exactly how it broke.

**FOURTH tooling trap for this lane, and it nearly produced a false clean:** **rtk reformats
`git diff` output, indenting the `+`/`-` markers, which silently defeats any `grep "^[+-]"` filter.**
The re-reviewer's first comment-only check returned an empty result that happened to be implausible
enough to recheck. Rule: parse the `.diff` file the review-package script writes, never `git diff`
piped through a marker filter. Now in every dispatch.

Six out-of-scope observations recorded for the final whole-branch review, including a **term collision
worth resolving before T5**: §7's new prose asks whoever adds the guard to decide "whether to require
an `Origin` on product routes", while the doc's later ruling asks this lane to "land the origin check
inside Plan 4 T5" — the latter is the event-provenance `origin` FIELD, a different thing entirely.
Same task, same file region, two meanings. The T5 and micro-PR dispatches must disambiguate or an
implementer will conflate them.

### Positive-control rule, adopted from the co-ordinator

It corroborated the silent-null-scan risk twice from its own hour: a glob eaten by the shell returning
"no matches" for a schema that IS referenced, and — closer to the point — a worktree diff run against
the WRONG directory that returned "only in lane1: [] / only in main: []", a perfectly well-formed
answer meaning "identical", when the truth was main=67 fixtures. It only caught that because the
counts were printed alongside.
**Adopted: a null result must be reported alongside a positive control from the same scan.**
"No differences" alone is not self-checking; "no differences, main=67" is visibly incoherent when the
scan is wrong. Cheap, and it makes the failure self-announcing rather than needing a second lane.

### T2 fix round 2 — corrected, and the fix is better than what I asked for

The implementer re-ran the mutation rather than taking 13/20 from me: `13 failed | 7 passed (20)`,
agreeing with the re-reviewer. Then it went past the instruction — instead of a corrected count it
wrote the SET: "every check in `sign-in-flows.test.ts` that puts a JSON body through this mount
fails — every sign-in route the product offers, plus the bearer token, the passkey options and the
Google authorization URL." The seven survivors are exactly the checks that never send a body through
the mount (GET 404, OPTIONS/HEAD gap, assembly-time guard, `/v1/events` encapsulation, three
cookie-origin cases) — the same fact from the other side, which is what makes the description
checkable rather than merely durable.
Both sites keep ONE sentence of history naming how the count went stale, "inside a comment whose last
three words claim it was run". That is the right call: the failure mode is the part worth inheriting.
And the two round-1 report entries carrying the old figure were ANNOTATED rather than silently
rewritten, "since they record what was true when run" — correcting a record without falsifying its
history.

**Controller verification, done by reading rather than by dispatching a third reviewer.** Two comment
sites replacing a number with a set description, already independently measured twice, does not meet
the would-a-second-look-reverse-this test; a fresh review agent here would be the theatre the
coordination doc names as waste. Verified directly: both sites now carry the set form, and a sweep of
all 144 tracked `.ts`/`.md` files outside the SDD workspace finds exactly two remaining
"12 of the 17" occurrences — `routes.ts:54` and coordination `:1696` — both **inside their own
retraction sentences**, quotations rather than live claims. Sweep reported with its positive control
(144 files scanned), per the rule adopted this session.

## Task 2: complete (commits 2bc2e13..5c71689, review clean after 2 fix rounds)

Four commits: c6bafb9 (task) -> 950131f (an unrun claim withdrawn before review) -> e772499 (fix
round 1: six Importants + one promoted Minor) -> 5c71689 (fix round 2: the stale count, replaced by a
set). Gate 15/15; server 102 -> 132 tests.

## Owner ruling 2026-08-31 — Fable narrowed. Read from the doc (origin/main :595-635), not from the relay.

**What moves down:** three of the four final whole-branch review lenses -> **opus at `max` effort**.
They are the expensive half ($78.70 of a measured $117) and the most substitutable, because their
work is reading for the presence of correctness across a delta. The deviation-ledger path this doc
already defines for an unavailable fable dispatch becomes the NORMAL path for them.

**What stays fable, on evidence rather than caution:**
- **Adversarial refuters** — the cheaper half at $38.50, and where the top tier's judgment is
  demonstrably the product. The §11 cross-workspace forgery was found by a refuter that **committed
  the forgery end to end over the shipped door** rather than reasoning about whether it was possible.
  Three layers each individually correct, none asking the question. That is not a finding reading
  produces.
- **The mocked-contract lens**, now split out as its own row — this series' signature failure and the
  one no other lens is pointed at.
- **Floor-list task reviewers, unchanged** — this lane's are **T5, T7, T11, T14**.

**What is NOT relaxed:** escalation still runs upward (two failed fix rounds escalates the
implementer a tier; a lens returning a finding it cannot resolve escalates to fable for the re-read);
de-escalating below a class floor stays forbidden; deferral stays the sanctioned response to budget
pressure everywhere this ruling does not name. It narrows one row and does not license discretionary
tiering down.

The doc records this honestly as **a budget-motivated de-escalation of a gate, which its own
"budget pressure is never grounds to thin a gate" rule forbids in as many words** — amended by the
owner explicitly rather than worked around, on the grounds that a contradiction between two live
rules is worse than either being wrong. The controller's argument against is recorded as overruled.

**Calibration worth acting on, from the same section:** the day the pool blew (2026-08-28, 39% of the
project's entire spend in one day) was **71% Opus, not Fable** — four lanes launched at once
alongside the controller. **Concurrency, not tier, is what exhausted the pool.** 59% of all spend was
cache reads, a function of session length and request count that no tier policy touches. Practical
consequence for this lane: keep fan-outs bounded and prefer one agent where one suffices — that is a
larger lever than any model choice, and it is the lever I actually control.

**Binding on this lane's final whole-branch review:** four lenses, three at opus/max with a deviation
note, the mocked-contract lens at fable, adversarial refuters at fable, and the floor-list reviewers
for T5/T7/T11/T14 at fable.

**Term warning (PR #29, not yet on main when checked):** §7's "origin check" means the **HTTP-Origin**
header (CSRF, cross-site navigation); the forgery section means the **envelope-origin** field (the
provenance enum `contest.server-only` reads). Different layer, different attack, different fix,
meeting in one task in one region of one file. **This lane's micro-PR is envelope-origin.** Someone
who conflates them writes a header check and believes the window is closed. Both the micro-PR and T5
dispatches must say which one explicitly.

## PR #30 AUTO-MERGED — main at 51aba55. Task 2 complete.

Merged under the standing authorization: full machinery (task review Spec PASS / quality approved,
two fix rounds each closed by a scoped re-review with every finding ADDRESSED and the last stating
"ready to ship") plus independent CI green. Gate on the merged main: 18/18 (sibling lanes have added
packages since).

## Envelope-origin gate dispatched — floor-list tiers, because it IS T5's deliverable

Cut `exec/04-envelope-origin-gate` from 51aba55. Dispatched opus/high; **fable reviewer to follow**,
because this is an extraction from T5, and T5 is on the floor list precisely because a
plausible-looking wrong answer ships silently. The Fable-narrowing ruling does not touch floor-list
reviewers.

**Design constraint I verified BEFORE dispatching, which changes where the check can go.** A blanket
refusal of `origin: 'server'` inside `commitOne` would be wrong twice over:
- `packages/domain/src/testing.ts:26` defaults envelopes to `origin: 'server'`, and four server test
  files ingest directly (`app.test.ts`, `engine-context.test.ts`, `ingest.test.ts`,
  `verify-projections.test.ts`) — 24 test files scanned, positive control reported.
- More importantly than the tests: **the server's own future appends are legitimately server-origin**
  — T5's bootstrap and T14's invite acceptance append internally, not through the HTTP door.
So the distinguishing fact is **not the value of `origin` but which door the event arrived through**.
`routes/events.ts` calls `ingest.ingestBatch(events)` with no session and no filtering — that is the
client-submitted door; internal appends call `ingestBatch` directly.
This **revises my earlier R13-adjacent ruling** that the gate must live inside `commitOne`: that
holds for the FULL gate once T5 threads `sessionUserId` through and the pair
(sessionUserId null AND origin 'server') can distinguish internal from external. It does not hold for
a session-less extraction, which must discriminate by door instead. Recorded because the earlier
ruling is in this ledger and a later reader would otherwise see a contradiction rather than a
refinement.

Dispatch carries: the envelope-origin vs HTTP-Origin terminology warning in the strongest form
(someone who conflates them writes a header check and believes the window is closed); the exact
refusal pinned character-for-character; the co-ordinator's naming refinement (**enumerate what it does
NOT check** — role, membership, visibility — because "deliberately partial" ages into noise); a
requirement to state which doors are closed and which are not, since `/v1/sync` does not exist yet
and T5 completes the gate; **and a requirement to prove the negative** — an internal server-origin
append must still succeed, because a test proving only that the refusal fires would pass equally if
the legitimate path had been broken.
All four silent-empty tooling modes and the positive-control rule are in the dispatch.

## The CSRF ruling (co-ordinator, under owner delegation) — agreed, with one correction that strengthens it

My ruling-request offered two options: ratify Lax-only, or require an Origin on product routes. The
ruling takes NEITHER, and lands two items in T5. I checked both load-bearing facts.

**Item 3 — I corrected their stated confidence UPWARD. The hosting fact IS established.**
They wrote that item 3's bite depends on a hosting fact nobody has established, and that on a
dedicated domain my Lax-only option would have been defensible. Coordination doc **line 83**, the
owner sign-off table: `pm.artsourced.in` for the product and `pm-api.artsourced.in` for the API,
**two sibling subdomains of artsourced.in**. Line 84 puts the magic-link sender at the apex,
`sign-in@artsourced.in`, described as "the established zone" — so `artsourced.in` is an existing
domain with other things on it, not one bought for this product.
`SameSite` is scoped to the registrable domain, and `artsourced.in` IS the registrable domain. So
everything else on that zone is same-site with the product and Lax does nothing between them. That is
exactly the same-site-cross-origin case, and it is the signed-off deployment rather than a
possibility. **Lax-only was never defensible here.** Asked them to mark that paragraph settled-adverse
rather than "re-examine", because as written it invites a later reader to conclude the risk
evaporated.

**Item 1 — agreed, and half of it shipped in T2 already.** Verified `sameSite` is configured nowhere
in `apps/server/src` (0 hits, 24 files scanned, positive control reported). But the test they asked
for EXISTS: `sign-in-flows.test.ts:130`/`:148` assert the full attribute list with an exact `toEqual`
including `SameSite=Lax`, so it already reddens if better-auth changes its default.
The distinction worth keeping: **that assertion currently guards a DEPENDENCY'S DEFAULT; once the
value is set explicitly it guards a DECISION.** Same test, same line, different meaning — and only
the second is a security property this repo owns. So item 1's remaining work is the setting, not the
test, and the reason to do it is not that a change would go unnoticed but that an unset value is
nobody's choice.

**Item 2 — my objection dissolved, and the diagnosis is the useful part.** CSRF is about AMBIENT
credentials: a cookie is attached by the browser whether the page meant it or not; a bearer token is
attached by code that had to hold it. Scoping the Origin requirement to cookie-authenticated product
requests costs bearer callers nothing, and desktop/mobile are bearer-authenticated. My cost objection
was true of the unconditional form I stated and false of the scoped one.
**Reasoning failure worth naming, mine:** *an option priced as unacceptable is sometimes an option
scoped too widely.* I rejected a correct control because I had described it more broadly than anyone
proposed it. Sits beside the prose-claims rule as a named failure mode rather than a one-off.

Both items land in T5 with the term collision held: **item 2 is HTTP-Origin, the micro-PR is
envelope-origin**, and T5 carries both halves.

### The CSRF ruling, final form — T5's HTTP-Origin branch is the ONLY defence, not a second layer

The co-ordinator verified both my corrections at source and rewrote #31. It also supplied the half I
had missed, and it is the one that matters:

**The same-site relaxation is LOAD-BEARING.** The web client at `pm.artsourced.in` calls the API at
`pm-api.artsourced.in`. Those are cross-ORIGIN. The session cookie must reach the API for the product
to function at all, and it does so precisely BECAUSE they are same-SITE. So the relaxation cannot be
tightened without breaking the web client, and every other subdomain of `artsourced.in` inherits it
for free. **Consequence: item 2 (HTTP-Origin on cookie-authenticated product routes) is not
defence-in-depth — it is the only defence available**, and no hosting decision short of moving the
API to a different registrable domain changes that. T5 is weighted accordingly.

**My addition, which their item 1 already guards but nobody had named.** T2's assertion is an exact
`toEqual(['Max-Age=604800', 'Path=/', 'HttpOnly', 'SameSite=Lax'])` — **there is no `Domain`
attribute**, so the session cookie is host-only: set by `pm-api.artsourced.in`, sent only there.
That must stay true, and the failure mode is specific: a later task debugging a cookie-not-arriving
problem — plausible the first time the web client meets the API in a real browser — has an
obvious-looking fix in `Domain=.artsourced.in`. It would work, and it would send the session cookie
to EVERY subdomain of the zone, turning "a sibling subdomain can forge a request that carries the
cookie" into "a sibling subdomain receives the cookie directly". Strictly worse, and it would look
like configuration rather than a security change.
Because the assertion is an exact list match rather than a `toContain`, it ALREADY reddens if
`Domain` appears. The guard exists; what was missing is any statement that **preventing a `Domain`
attribute is one of the things that assertion is for.** An exact-match assertion protects absences as
well as presences, and the absences are invisible unless written down.

**Process rule, generalised from how this ruling got corrected:** stating which claim you are least
sure of is how a reader with limited budget knows where to aim a check. I had no budget to re-verify
a whole ruling and would not have tried; "this item's bite depends on a fact nobody has established"
was an explicit invitation, and it cost one grep to answer. Uniform confidence would have hidden the
one wrong paragraph inside a document that contained its own refutation eighty lines up.
Same family as **enumerate absences rather than assert partiality** — both convert a reader's
attention from scanning to targeting.

### CSRF ruling MERGED with direct owner review — 5f3a034. T5 carries three items.

The owner read #31 rather than delegating the merge, so it has the most direct owner involvement of
anything decided in this window — which retires my own concern that it was the decision with a real
security consequence and the least of it. T5's obligations, final:
- **1** — set `sameSite` EXPLICITLY. `sign-in-flows.test.ts:148` already guards the value; the
  missing piece is the setting, so the assertion guards a DECISION rather than a dependency's default.
- **1b** — state at that assertion that forbidding a `Domain` attribute is one of the things it is
  for. The exact `toEqual` already reddens if `Domain` appears; what is missing is the sentence, and
  **an absence nobody has named is an absence nobody defends.**
- **2** — HTTP-Origin validation on COOKIE-authenticated product requests; nothing required of bearer
  callers. This is the ONLY defence on those routes, not a second layer.

Three rules from this exchange now sit in the series record, and all three are about directing
attention rather than about verification technique — a different family from the four tooling traps:
- enumerate absences rather than assert partiality;
- state which claim you are least sure of, so a reader with limited budget knows where to aim a check;
- an option priced as unacceptable is sometimes an option scoped too widely (mine, and the only one
  of the three that is about how a choice gets DESCRIBED before anyone evaluates it).

## Envelope-origin gate implemented (6317701, rebased to b56692e) — a better design than either I offered

Gate: 18/18 forced, 0 cached; server 132 -> 141 tests (21 files), 5 new in
`test/permissions/check-permission.test.ts`.

**The implementer rejected both of my framings and found a third that keeps what each was reaching
for.** I had ruled the gate belongs INSIDE the ingest path so Plan 10's `/v1/sync` inherits it; then,
on discovering that a blanket refusal would kill T5's bootstrap and T14's invite acceptance, I
suggested the HTTP route instead — which would have surrendered the inheritance property. It kept the
ruled POSITION (inside the ingest transaction, between the entity-workspace guard and the engine) and
made the gate **per-call via a second entry point**: client-submitted batches go through a gated
function, internal appends through the ungated original. Both properties preserved.

**And it named the hazard its own design creates**, which is the part I want reviewed hardest:
`POST /v1/sync` MUST call the gated entry point, and calling the ungated one silently bypasses the
gate for every offline-originated event. **Two functions distinguished only by name, one of which is a
security boundary.** Recorded as coordination "Plan 4 execution consequences" §8 — the doc had settled
"gate in the ingest path" but never named the wiring, which is exactly the gap that produces a
correct-looking call to the wrong function.

Dispatched to a **fable** reviewer per the floor list (this is T5's deliverable extracted; the
Fable-narrowing ruling explicitly leaves floor-list reviewers at top tier). The review's centre of
gravity is the design question, not the code: **is an ungated entry point beside a gated one a footgun
worse than the window it closes, and is there a shape that makes the wrong call impossible rather than
merely discouraged?** Plus: enumerate every caller of both entry points and say whether any is
reachable from a client request; prove BOTH directions (refusal fires AND the legitimate internal
append still works — a test proving only the refusal would pass equally if the legitimate path were
broken); and check the tests would catch a SUBTLY wrong gate, not just an absent one.

Also sent for judgement rather than pre-ruled: the diff touches `test-cases/03-foundation-ledger.md`,
**Plan 1's bucket**, because Plan 4's own §6 / `06-auth-visibility.md` do not exist yet (T13 creates
them). Filing a Plan 4 case in Plan 1's bucket may be right — the check lives at the ledger door — or
may be misfiling that T13 then has to reconcile. I have not ruled; the reviewer has the context to
judge and I would rather have its reasoning than impose mine.

### Envelope-origin gate review (fable) — Spec PASS, approved, "ship it" on the design

The reviewer judged the two-entry-point design against every alternative and found each worse **on
the recorded requirements, not merely on the tests**: a route-level gate loses decision 15's property
that a sync-path refusal becomes a `claim.contested` with no extra wiring, and is equally bypassable
by any new route; a blanket `commitOne` refusal breaks the bootstrap and invite-acceptance appends;
construction-time `IngestDeps.gates` cannot distinguish doors. Two named entry points sharing one
loop, gate as per-call data, is the right family. **My route-level suggestion was the worse design and
the implementer was right to refuse it.**
Placement proven BEHAVIOURALLY in both halves, not read: an event both misfiled AND origin-`'server'`
answers `entity-workspace-mismatch` (guard before gate); with an injected refuse-everything engine, an
origin-`'server'` client event answers `permission.role` while a `'web'` control answers the planted
rule (gate before evaluate).
Exhaustive caller enumeration with positive control: the ONLY production caller of either entry point
is `routes/events.ts:35` -> `ingestClientBatch`. Client-reachable surface is `POST /v1/events`,
`GET /healthz` (no ingest) and the better-auth mount (no ingest access). Every `ingestBatch` caller is
a test file.

**Important — a mutation changing behaviour for every mobile and desktop user that reddens NOTHING.**
`=== 'server'` -> `!== 'web'` leaves **all 143 server tests green**. Under it, an ordinary
`origin: 'mobile'` event is refused `permission.role` and nothing notices. The gate is correct; the
hole is in the EVIDENCE, and it is on the side this branch has been weakest — the refusal direction is
well pinned, the ADMITS direction only for `'web'`. Fix: parameterize the admits test over the three
client origins. This is "a check that cannot fail is not evidence" applied to the positive case, which
is the harder half to remember.

**Important — RULING: take the type narrowing NOW rather than deferring it to Plan 10.** The reviewer
supplied the detail that decided it: **the naming asymmetry is adverse — the dangerous door has the
shorter, more obvious name.** Today's route is structurally pinned (a flip goes red), but Plan 10's
route cannot be guarded by a test that does not exist, so the defence there is prose spanning three
plans and a wave boundary. Narrowing what routes receive
(`Pick<IngestService, 'ingestClientBatch' | 'onEventCommitted'>`) makes calling the ungated door a
COMPILE ERROR. The reviewer notes T5's session-widening will diverge the signatures anyway and shrink
the window; I still take it now, because **"a later change will probably make this safe" is not a
property anyone can check.** Cost if wrong: one type annotation, reversible.

**Minor — I was wrong to doubt the test-cases filing, and the reviewer had the precedent.** Case 3.31
in `test-cases/03` is CORRECT: the mirroring rule binds test-cases files to Features.md SECTIONS, the
gate bullet belongs under §3's Event ingest API, and Features.md has no §6 yet — inventing bucket 06
early would break the mirror. Explicit precedent at `Features.md:25`, where `docToPlainText` landed in
§3 "pending Plan 5's own catalogue task, which may relocate". Adding the same relocation note.
**Sending this for judgement instead of pre-ruling it was the right call** — I would have ruled it
misfiled and been wrong, against a precedent I did not know existed.

**Recorded, not a finding:** the reviewer could not verify the TDD ordering claim (test written and
run red before implementation) — no artifact proves it after the fact. It reproduced equivalent red
evidence on today's tree instead. Generalises: **an ordering claim is unverifiable retrospectively
unless the red run is captured**, so either capture it or do not assert it.

### Envelope-origin fix round 1 — all three addressed, and TWO went past what I specified

Gate 18/18 forced, 0 cached; server 141 -> 143 tests; `check-permission.test.ts` 5 -> 7.

**Both improvements are the same move — making the fix itself falsifiable rather than merely correct:**
1. The admits list is **derived from the domain's `ORIGINS`** rather than re-spelled, so a fifth enum
   member is covered automatically. That is the convergent rule from lane 4 and the co-ordinator —
   *assert through the authority, not alongside it* — applied unprompted, and it closes the successor
   of the very hole being fixed: a hand-copied list matching today would look identical in the diff
   and silently stop covering a new member.
2. The type narrowing is made **self-enforcing** by a `@ts-expect-error` on
   `ClientIngest['ingestBatch']`, so widening the type back reddens typecheck (verified by doing it).
   Without that, someone could restore the full interface and nothing would notice — **a check on the
   check.** That is the answer to "who guards the guard", which I had not asked for.

**Scoped re-review dispatched at opus/high, and the tier choice is deliberate — recording the
reasoning because this is a floor-list extraction.** The floor list binds *task reviewers* to top tier
because a plausible-looking wrong answer ships silently; that task review is DONE, at fable, and it
settled the design question. What remains is "did three named changes land and break nothing", which
is verification rather than judgment, and the Fable-narrowing ruling is explicit that fable belongs
where the top tier's judgment is the product. Not a floor deviation — a different artifact.
The one place I told it to be hardest is the type narrowing, because `AppDeps` is a **shared surface**
that lanes 3 and 4 inherit: a wrong narrowing breaks `buildApp` for them, so it must reject only a
caller LACKING the gated method, never one holding a full ingest service.

### Second rate-limit interruption (session limit, 2026-08-31) — re-review died mid-flight

**First action was verifying the tree, not re-dispatching.** A review agent applies mutations and
restores them, so a death mid-flight can leave a mutation applied — and a silently-mutated tree that
then passes a fresh review is the worst available outcome. Checked: `git diff --quiet` exit 0,
`git diff --cached --quiet` exit 0, zero untracked, HEAD `acc7fe4`. **Reported with a positive
control** per the rule adopted this session: dropped a scratch file, confirmed
`git ls-files --others` listed it, removed it — so the preceding empty result is a real negative
rather than another silent empty. The agent had restored before dying.

**Re-dispatched the SAME review at the SAME tier.** The coordination doc's rule is that budget
pressure DEFERS work and never thins a gate; the sanctioned response to a limit is to wait and re-run,
not to review it myself or drop to a cheaper reviewer because the first attempt was expensive. The
re-dispatch carries the state verification explicitly so the new agent starts fresh rather than
wondering what its predecessor left.

Second interruption of this lane: the weekly pool on 2026-08-28 (T2's first attempt) and the session
limit today. Both were survived the same way — verify what the dead agent left, then resume at full
depth. Worth noting the pattern holds: **neither interruption cost correctness, only wall-clock**,
because the ledger carries the state and the tree check is cheap.

## 2026-08-31 economy directives — one CORRECTS a claim I recorded as fact

**Correction to my own ledger, made because I recorded a peer's claim and it has since been
retracted.** I wrote above, from the coordination doc's calibration section: *"Concurrency, not tier,
is what exhausted the pool."* The co-ordinator has corrected that to the owner — **tier drift was a
co-cause**, fixed in `5339af9`. My entry is superseded rather than deleted, since it records what the
doc said when read. The operative version: concurrency AND tier drift together.
This is the third time this session a recorded claim needed correcting after the fact, and the
pattern is worth naming: **a fact copied from another lane inherits that lane's error rate.** My
ledger now carries provenance on borrowed claims for exactly this reason.

**Directive 1 — enforce the sonnet rows. Audited honestly, and my drift is real but narrower than
the aggregate suggests.** Measured series-wide: 30.1% sonnet serial, 2.9% parallel. My own dispatches:
pre-flight extractors were sonnet/low (correct); T1, T3, T2 and the micro-PR were opus, and each is
defensible against the table — T1 was adaptation not transcription (the installed API differed from
plan text), T3 was the riskiest single edit in the lane, T2 was the auth surface, the micro-PR is a
security control. Reviewers at opus/fable per the floor list.
**Where I have genuinely not used sonnet and should:** the catalogue task (Features.md §6 +
`test-cases/06-auth-visibility.md`) is named in the table as mechanical; migrations transcribed from
pinned schemas are mechanical; barrel exports are mechanical. T4 splits — its projection reducer and
effective-role resolution are core semantics (opus-high per the table), its migration is not.
**Committed: T4's migration and the catalogue task go to sonnet, and every future dispatch gets a
tier audit against the table before sending.** The floor list (T5, T7, T11, T14) is untouched by this.

**Directive 2 — `/clear` and reload at task boundaries. I cannot do this to myself.** `/clear` is a
user-typed CLI command; a subagent-side session reset is not something I can invoke, and it is not
something I would take on a peer's say-so regardless, being a session-management action. What I CAN
say is that the precondition holds: **this ledger is the durable state, and it was built for exactly
this.** Every ruling, adaptation, cross-lane obligation and tier decision is here rather than in
conversation memory, which is why both rate-limit interruptions cost wall-clock and not correctness.
A reload from brief + ledger + coordination doc loses nothing this lane depends on. Surfacing it to
the owner rather than silently ignoring it.

**Directive 3 — cross-lane messages become short pointers.** Mine have been long. Agreed; the
substance belongs in the doc and the ledger, and a message should point at it.

### Envelope-origin scoped re-review — all three ADDRESSED, no new breakage, ready to ship

Reviewer ran four type-level probes (the reflex mistake, the actual Plan 10 registrar scenario,
assignability in BOTH directions, and self-enforcement), read `CLIENT_ORIGINS` raw off disk rather
than from the rendered diff to confirm derivation, and ruled out the
hardened-types-but-broken-legitimate-path failure BY EXECUTION — the internal door still commits a
server-origin contest and writes exactly one ledger row. Enumerated every changed `src/` line and
confirmed **the entire src change is type-level; zero runtime statements changed.**
Its cleanliness check is worth copying: `git status --porcelain | wc -l` = 0 (catches untracked,
which `git diff --quiet` misses), plus `git diff --quiet` **exit code** (an exit code cannot be
reformatted by the proxy), plus a read-back of each mutated region. It never parsed rendered diff
output for cleanliness. That is the fifth silent-empty mode being designed around rather than
stumbled into.

**Finding taken rather than deferred: the self-enforcing guard covers one of its two axes.** The
`@ts-expect-error` protects the `ClientIngest` ALIAS but not `AppDeps`'s BINDING to it — widening only
`AppDeps.ingest` back to `IngestService` typechecks **green**, and under that widening the Plan 10
registrar scenario compiles green too. The reviewer called it a later-round item; I am taking it now,
one line, because **a guard whose docblock says "self-enforcing" while covering half of what it
guards is an overclaim**, and on this branch overclaims have been wrong four times out of five when
someone actually ran them. Both axes must be proven separately: widen the alias -> fails; widen the
binding only -> now also fails, where before it passed.

**Tier: dispatched at SONNET**, and this is the first application of the economy directive's audit.
The edit is fully specified — a named line in a named file with a stated proof procedure and no
design judgment left. That is the table's "mechanical" row, and sending it to opus would be exactly
the drift the directive names (2.9% sonnet in Wave 1 against 30.1% in the serial baseline). The
floor list is untouched: T5, T7, T11, T14 keep opus-high implementers and fable reviewers.

Recorded, not fixed: the `@ts-expect-error` mechanism passes as long as its expression errors for ANY
reason, so renaming `ingestBatch` on `IngestService` would leave it green while the protection
lapsed — inherent, and covered by the docblocks.

### Cross-package mutation false-green — checked; this lane's evidence is CLEAN, but my dispatch text is the vector

**The mechanism is real and the resolution rule is import style, not package boundary.** Verified by
reading rather than by mutating (an implementer was live on the branch, and mutating under it would
have been the worse error):
- `packages/domain/test/*` imports **`../src/*.js`** — relative source. Mutating domain source and
  running domain tests catches it, bare vitest or not.
- `apps/server/test/*` imports server code **relatively** (`../../src/app.js`,
  `../../src/ingest/ingest-service.js`) but imports `@gisik-nokma/domain` and
  `@gisik-nokma/rule-engine` **by package name**, and domain's only export is `./dist/index.js`
  (no source export). So mutating DOMAIN source and verifying with SERVER tests is the false green.
- `apps/server` has no exports map and is private, so there is no dist indirection for its own code.
- `packages/domain/dist` is currently newer than every src file, so no live staleness either.

**Audit of every mutation this lane relied on — all same-package, none exposed:**
- T3's 15 mutations: domain source, domain tests, relative imports. Its reviewer re-ran five of them
  from `packages/domain`. Safe.
- T1's ULID mutation, T2's fifteen, the envelope-origin gate's: **server** source, **server** tests,
  relative imports. Safe.
**The co-ordinator's framing was wrong for this lane** — T3's amendment was NOT "proven by mutation
across the domain boundary"; it was proven within the domain package. Worth correcting, since they
flagged my evidence to other lanes as suspect.

**But the finding does land on me, one level up: my own dispatch boilerplate is the vector.** Because
rtk collapses `pnpm test` output to `PASS (n) FAIL (n)`, I have been telling every reviewer to use
`node ./node_modules/vitest/vitest.mjs run <file>` for assertion-level detail — **bare vitest, with no
qualifier about package boundaries.** That instruction is safe for the same-package mutations they
happened to run, and would have produced a false green the first time a reviewer mutated domain source
to check a server-side consequence. It was luck, not design, that none did.
**Standing correction to every future dispatch:** bare vitest is for reading assertion detail on
SAME-PACKAGE mutations. Any mutation crossing a package boundary needs `pnpm turbo run test` (whose
`test.dependsOn: ["^build"]` rebuilds) or an explicit rebuild first. CI is unaffected — turbo already
enforces it.

### Envelope-origin fix round 2 — complete, verified by the controller rather than a third agent

Implementer proved each axis separately AND reproduced the gap as a negative control: widening the
alias reddens BOTH directives; widening only `AppDeps.ingest` reddens the NEW one alone; widening only
`AppDeps.ingest` with the new guard removed goes green 9/9 — confirming my reported gap rather than
taking it on trust. It also put the known limit in the guard's own DOCBLOCK rather than only the
report: `@ts-expect-error` is satisfied by any error, so renaming `ingestBatch` would leave both green
while protection lapsed.

**It corrected me, and the correction is the same class I have been enforcing on others.** I told it
the relocation precedent was `Features.md:25`; read off disk, `:25` is IST day boundaries and the
Client envelope builder is `:24`. I had relayed the reviewer's citation without checking it — the
"a borrowed claim inherits the lender's error rate" rule biting me one level down, in the same session
I recorded it. My substantive point stood; the line number did not.

**Controller verification instead of a third review agent**, and I ran it rather than reading it:
baseline typecheck exit 0; widening ONLY `AppDeps.ingest` -> exit 2 with **exactly one** TS2578, at
`check-permission.test.ts:71`, the new guard alone; restored -> exit 0 with the line read back
(`app.ts:29  ingest: ClientIngest;`). A review agent for one type-level line, already proven on three
axes by its author, is the theatre the ultracode section names.

