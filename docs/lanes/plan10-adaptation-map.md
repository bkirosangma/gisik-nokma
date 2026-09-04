# Plan 10 adaptation map — tasks 5–13

Produced 2026-09-04 by the serial executor's step-15 pre-flight (one sonnet agent), against
`exec/14-plan9-calendar` — which is `origin/main` **plus all of Plan 9**, i.e. the tree `main`
becomes once PR #93 merges. **UNTRACKED ON PURPOSE** until step 15's branch is cut off the merged
`main`; a restarted executor finds it via `git status --porcelain=v1`, which the brief says to run first.

---

## READ THIS BEFORE USING ANY CITATION BELOW

**The map's DIRECTORY PATHS are unreliable. Its substance and line numbers are good.** I spot-checked
three of its highest-value claims. All three were substantively CORRECT and two cited a path that does
not exist:

| claim | substance | path as cited | truth |
|---|---|---|---|
| `EffectiveRole.projects` is a `Map`, so the plan's `[...eff.projects]` spreads `[key,value]` TUPLES | **CORRECT** — must be `[...eff.projects.keys()]` | `apps/server/src/visibility/effective-role.ts` — **does not exist** | `apps/server/src/permissions/effective-role.ts:100` |
| `ClientIngest` makes `ingestBatch` inside a route a COMPILE error; `POST /v1/sync` must use `ingestClientBatch` | **CORRECT, and load-bearing** | `apps/server/src/ingest/ingest-service.ts:98-115` — **correct** | same |
| `DataSource.ingest` returns the 3-status `IngestResult[]`, so the plan's 4th `'pending'` status is not assignable | **CORRECT** — `DataSource` and its 13-method `DataSourceQuery` verified verbatim | `apps/server/src/ingest/ingest-result.ts` — **does not exist** | `packages/domain/src/ingest-result.ts:14-17` |

**So: trust the map to tell you WHAT is wrong with the plan text; re-locate every file yourself before
editing it.** `grep -rn "export .*<symbol>" --include='*.ts' packages apps | grep -v node_modules` is
the reliable move.

## A SECOND THING THE MAP MISSED, and it binds T9, T10 and T13

**The map never says `TZ`, and neither does Plan 10.** Measured at `e09666c` over the plan's 7,629
lines, with positive controls on the same file so the zeros are trustworthy:

```
DataSource   45 lines   } controls
istDayOf     22 lines   }
clockSkewMs  14 lines   }
TZ            0 lines   <- genuine absence
```

Thirty-six lines of clock-sensitive plan text, zero of which pin a timezone. **That half is measured
at `e09666c` and stands.**

**CORRECTED 2026-09-04 — the second half of this section was FALSE and it caused a false claim
downstream.** It read: *"on `main`, zero of 48 test files vary `TZ` while seven are day- or
clock-sensitive."* That is the executor brief's known gap #2 quoted as current, and it is **a reading of
a 48-test-file tree.** The repo now has **228** test files and **14** of them assign `process.env.TZ`.
Enumerated at `32393be`, not counted:

```
apps/server/test/helpers/read-scenario.test.ts        packages/app-core/test/provenance.test.ts
apps/server/test/integration/real-door-round-trip.ts  packages/app-core/test/views/attention-strip.tsx
apps/server/test/notifications/sweep.test.ts          packages/app-core/test/views/board.test.tsx
apps/server/test/routes/attention.test.ts             packages/app-core/test/views/history-list.tsx
apps/web/test/ist-today.test.ts                       packages/app-core/test/views/my-work.test.tsx
packages/app-core/test/calendar/clock-free.test.ts    packages/app-core/test/views/ticket-list.tsx
packages/editor/test/attachment-list-item.test.tsx    packages/editor/test/google-picker.test.ts
```

**This repo already has good `TZ` discipline, and it is more careful than the blanket rule this section
first gave.** `apps/server/test/routes/board.test.ts:80-87` reasons the other way and is right to:
*"Nothing on this response moves with `TZ` … so a `TZ`-varying case here would be a check that cannot
fail."* `board.test.tsx:304` records a restore bug "caught only by mutating it". Varying `TZ` is
evidence **only where the value under test actually moves with it**; everywhere else it is ceremony that
reads as rigour.

**What this section should have said, and now does:** Plan 10's own text pins a timezone nowhere across
36 clock-sensitive lines, so a task transcribing it inherits no `TZ` discipline even though the repo
around it has plenty. Vary `TZ` where the value moves with it; where it does not, say so in a comment
the way `board.test.ts` does, and do not add the case.

**Recorded because the failure mode is the branch's own signature:** the stale half was carried into the
executor handoff, this map, and Task 9's dispatch prompt as settled fact, and Task 9's implementer then
wrote "FIRST TEST IN THIS REPO TO VARY `TZ` AT ALL" — a stronger false claim, reasonably derived from a
false premise it was handed. A count quoted from an older tree is the same defect as a count never
measured; it is just harder to notice, because it was true once.

**Any clock-sensitive assertion T9, T10 or T13 writes must set `TZ` explicitly** — at minimum one case
under a non-IST `TZ` that still expects the IST-correct answer. A test that only ever runs in
Asia/Kolkata is not evidence about `istDayOf`; it is evidence about the machine.

## ONE THING THE MAP MISSED, and it binds T6 and T7

**`EffectiveRole` is BRAND-PROTECTED.** `apps/server/src/permissions/effective-role.ts:31` holds a
non-exported `unique symbol`, and the docblock records it as Ruling P22 (case 6.64): a module that
cannot name the symbol cannot write the property, so the only structurally-satisfying object in the
program is the one `resolveEffectiveRole` returns. An implementer who builds an `EffectiveRole`
literal for a bootstrap or sync test must write an explicit `as unknown as EffectiveRole` cast — a
deliberate, greppable act — and **every safety property proved of `canSeeResolved` rests on the value
having come from `resolveEffectiveRole`**, because that is what makes a null workspace role imply an
empty project set. Do not hand-build one to make a test pass.

## ⛔ CORRECTION, ADDED 2026-09-04 AFTER TASK 7 SHIPPED — THE MAP'S HEADLINE FINDING IS HALF WRONG

**The map is right that the plan's snippet takes the ungated door. It is WRONG that the compiler cannot
stop it, and that wrong half is repeated three times below** — in "The single highest-value finding in
the map" immediately following, in Task 7's disagreement 3, and in "most likely to go wrong" item 2,
where it is called "a live-security miss, not a style nit".

The map reasoned: this module needs both doors, therefore it needs the type that has both doors,
therefore the guard falls back to review. **That is true of `IngestService` as a single object and false
the moment the two doors are two parameters** — and the repo had already made them two parameters,
before Plan 10 Task 7 existed. Measured at `ba6bfe6`:

- `apps/server/src/app.ts:88` — `AppDeps` already declared `serverAppend: ServerAppend`.
- `apps/server/src/routes/invites.ts:45` — `registerInviteRoutes` already took it, calling it at `:497`.

So `sync-service.ts` takes the narrowed **`ClientIngest`** (which has no `ingestBatch` at all) **plus
`ServerAppend`** as a separately-named capability, and a reflex `deps.ingest.ingestBatch(...)` is a
**compile error**. `sync-service.ts:97-100` is the shipped shape.

**The lesson is the reusable part: an option priced as unacceptable is sometimes an option scoped too
widely.** Nobody checked whether the repo had already solved it. It had — one file away, in a route
doing the same job.

**Why this correction is written loudly rather than quietly deleted:** the false half had already
propagated into the executor handoff on a `main`-bound branch, into Task 7's own dispatch prompt, and
into a status report, before anyone tested it. A later reader designing a second client-writable route
would have inherited "the compiler cannot help here" as settled and reached for the weaker guard the
finding itself was warning about. **A wrong claim about where a guard is impossible is worse than no
claim, because it stops the search.**

## The single highest-value finding in the map

Plan 10 T7's own snippet calls `deps.ingest.ingestBatch([event])` for the **client-submitted offline
event**. That is the internal, UNGATED door. `ingest-service.ts`'s docblock names this exact case:

> *"the DANGEROUS door has the shorter, more obvious name. `ingestBatch` is what a route author
> reaches for by reflex, and reaching for it silently ungates every event that route accepts — for
> `POST /v1/sync` (Plan 10), every offline-originated event in the product."*

The type system now catches it (`ClientIngest` omits `ingestBatch`), which is why this is a design
note rather than a live hole — but note the wrinkle the map raises: `sync-service.ts` legitimately
needs BOTH doors, because the server-authored `claim.contested` append inside `contest()` is a proper
internal-door use. So its deps type cannot simply be narrowed to `ClientIngest`, and the discipline
falls back to review. **Decide that deliberately at T7 and write down which door each call uses.**

## Already-recorded obligations owned by Plan 10 Task 7

`test-cases/12-offline-sync-apps.md` carries four ❌ cases owned by T7: **12.77** (the `POST /v1/sync`
door is not enumerated), **12.82** (`originalEvent.actorId` becomes `proj_contested.claimant_id`
verbatim; type/payload effectively unvalidated), **12.83** (the `proj_contested` UNIQUE index has no
guarding lookup, so a duplicate contest rejects the WHOLE batch and a retry cannot recover — reads
like a live defect), and **12.84** (the `entity.kind` binding has no door test).

Note that bucket 12 uses **unbolded** `- 12.55 ✅` bullets, unlike bucket 11's `- **11.55** ✅`. A
`\*\*12\.\d+\*\*` sweep of that file returns nothing and looks like an empty bucket.

---

# The map as returned

# Adaptation Map — Plan 10 (offline sync & apps), Tasks 5–13

**Base-truth caveat (stated once, applies to every claim below):** this tree is `origin/main` + all of
Plan 9 (PR #93 open, unmerged). Everything below is measured against *this* branch. If `main` moves
before step 15 starts, re-verify file:line citations — the plan-vs-repo drift documented here should
not, but exact line numbers may shift.

## Cross-cutting facts (apply to all nine tasks)

- **Route mounting site is wrong in every task that says "Modify `apps/server/src/index.ts` (mount
  register…)".** All route registration happens in `apps/server/src/app.ts` inside `buildApp`
  (`app.ts:204-271`), not `index.ts`. `index.ts:11-95` builds `ingest`/`auth`/`pool` and calls
  `buildApp(...)`; it has **no shutdown path at all** — no SIGTERM handler, no `pool.close()`, no
  `app.close()` (confirmed: `grep -n "close|shutdown"` on `index.ts` returns nothing but `/healthz`).
  So T5's "call `stopSnapshots()` in the shutdown path beside the existing pool/app close calls"
  describes machinery that doesn't exist — the implementer must either add a minimal shutdown hook or
  (more consistent with "Plan 11 owns the boot path", `index.ts:34-40`) leave the writer running
  unstopped for the dev process, and say which choice was made.
- **House route-registration pattern**: every existing route registrar takes `(app, deps, requireSession)`
  as three parameters and `app.ts` builds `requireSession` once (`makeRequireSession(deps.auth)`,
  `app.ts:206`) and threads it in — see `registerContestsRoute(app, {pool}, requireSession)` at
  `app.ts:211`. T6/T7's plan snippet instead has `registerSyncRoutes(app, {pool, auth})` build its own
  `requireSession` internally from `deps.auth`. Not a compile error, just off-pattern — for consistency
  with T4 (already landed, same file family) it should take `requireSession` as the third parameter too.
- **`listVisibleTickets` lives at `apps/server/src/visibility/visible-tickets.ts:56`, not
  `../visibility/can-see.js`** as T6's snippet imports it from. `can-see.ts` exports `canSee`,
  `canSeeResolved`, `getResolvedVisibility`, `ResolvedVisibility` — `listVisibleTickets` is a sibling
  file. Both files are real; the plan's import just names the wrong one for that one symbol.

## Task 5 — Snapshot writer

1. **Status: not run.** No `apps/server/src/sync/ledger-deps.ts`, `snapshot-writer.ts`, or
   `test/sync/snapshot-writer.test.ts` in the tree; `apps/server/src/sync/` today holds only
   `contest-coherence.ts`, `contests-route.ts`, `stream-seq.ts` (T1/T2/T4 artefacts).
2. **Consumes/produces**: as declared.
3. **Disagreements**:
   - `applyTicketEvent(state, env, deps)` — arity and order match exactly (`ticket-state.ts:89`).
   - `TicketStateDeps = {getTicketType, getWorkflow}` matches (`ticket-state.ts:48`).
   - `TICKET_EVENT_TYPES` (10 types) matches (`ticket-state.ts:60`); note its docblock explicitly
     names *"the fixture context, Plan 10's replica"* as callers that must "serve ANY id asked for" —
     bears on T9 too.
   - `workflowDefinedPayloadSchema.parse(...)` → `PublishedWorkflowDef = WorkflowDefinedPayload`
     (`workflow.ts:68-74`) — the payload **is** the def, `.id`/`.version` read straight off it exactly
     as the plan's fallback instruction predicted. No adjustment needed.
   - `readEntityEvents(client, kind, id, afterSeq=0)` and `readLatestSnapshot`/`writeSnapshot` match
     signatures exactly (`event-store.ts:132`, `snapshot-store.ts:16,23`).
   - `config.ts` does **not** use a freeform `parseInt`-style pattern for `PORT` — it's a single
     `zod` object (`configSchema`, `config.ts:3-36`) with `.coerce.number()`. The two new fields
     (`SNAPSHOT_INTERVAL_MS`, `SNAPSHOT_MIN_EVENTS`) must be added as `z.coerce.number().int().positive().default(...)`
     entries in that schema, plus to `AppConfig` and the return object in `loadConfig` — not a
     free-standing parse. (See cross-cutting note above re: shutdown wiring for the rest of Step 5.)

## Task 6 — `GET /v1/sync/bootstrap`

1. **Status: not run.** No `sync-routes.ts`, no `test/sync/bootstrap.test.ts`.
2. **Consumes/produces**: as declared, modulo the import-path fix above.
3. **Disagreements**:
   - Import fix: `listVisibleTickets` from `../visibility/visible-tickets.js`.
   - `resolveEffectiveRole(db, userId, workspaceId): Promise<EffectiveRole>` matches
     (`effective-role.ts:100`), **but** `EffectiveRole.projects` is
     `Map<string, {projectAdmin: boolean}>` (`effective-role.ts:114-116`), not a `Set<string>` of ids.
     The plan's route snippet does `projectIds: [...eff.projects]`, which spreads `[key, value]` tuples
     — a real bug the implementer must catch: it must be `[...eff.projects.keys()]`.
   - `readStreamSeq(client, workspaceId): Promise<number>` matches exactly (`stream-seq.ts:25`), and
     its own docblock states the "read first inside REPEATABLE READ" contract the plan relies on.
   - `rowToEnvelope` exists at `event-store.ts:110` as stated; the plan's placeholder
     `rowToEnvelopeCompat` name is explicitly flagged in the plan text itself as something to delete —
     just confirming it resolves.
   - `WorkspaceRole = 'owner'|'admin'|'member'|'guest'` matches (`entity-state.ts:3`).
   - Route mount + `requireSession` pattern: see cross-cutting notes.
4. **Coordination obligation, direct hit**: `Features.md` §12 (`Features.md:996`) names
   *"owner: Plan 10 Task 7, `POST /v1/sync`"* for the still-missing check that an embedded contested
   claim was **actually refused** — bootstrap doesn't touch this, but it's adjacent context the T6/T7
   implementer should read before touching `contest-coherence.ts`.

## Task 7 — `POST /v1/sync`

1. **Status: not run.**
2. **Consumes/produces**: `parseEvent` returns `ParsedEvent{ok:true,event}` or
   `EnvelopeError{ok:false,code,message,eventId}` (`parse-event.ts:12-19`) — matches. `IngestErrorCode
   = EnvelopeErrorCode | 'duplicate-event-id'` (`ingest-result.ts:3`) so `SyncInvalidCode` typechecks.
   `getResolvedVisibility(db, ticketId)` and `canSee(db, userId, ticketId)` both match signature
   (`can-see.ts:126,227`).
3. **DISAGREEMENT — the load-bearing one in this whole batch.** The plan's `sync-service.ts` snippet
   calls `deps.ingest.ingestBatch([event])` for the **client-submitted offline event itself**
   (inside `processOne`). That is the internal, UNGATED door. The codebase has since drawn this
   distinction explicitly and structurally:
   - `apps/server/src/ingest/ingest-service.ts:98-115` — `ingestClientBatch` docblock: *"`POST
     /v1/events` calls this; **Plan 10's `POST /v1/sync` must call it too**, or offline-originated
     events bypass the gate entirely."*
   - `ingest-service.ts:99-116` — `ClientIngest = Pick<IngestService, 'ingestClientBatch' |
     'onEventCommitted'>` exists *specifically* so `ingest.ingestBatch(...)` "inside a route handler is
     now a COMPILE error, not a documented mistake" — quoting the docblock verbatim.
   - `apps/server/src/routes/events.ts:11-25,77,97` — the interactive route is typed
     `ingest: ClientIngest` and calls `ingest.ingestClientBatch(events, request.currentUserId)`.
   - So: the offline claim itself must go through `deps.ingest.ingestClientBatch([event], userId)`.
     The server-authored `claim.contested` append inside `contest()` is correctly left on
     `ingest.ingestBatch(...)` in the plan's own snippet (that's a legitimate internal-door use,
     matching T5/T14's pattern) — **do not "fix" that one**. This means `sync-service.ts`'s deps type
     cannot be narrowed to `ClientIngest` (it legitimately needs both doors); it needs the full
     `IngestService`, with discipline enforced by code review rather than by the type system, exactly
     like T5's snapshot writer and T14's invite acceptance are named as the other legitimate
     `ingestBatch` callers (`ingest-service.ts:114-116`).
   - Route mount pattern / `index.ts` vs `app.ts`: see cross-cutting notes.
4. **Coordination obligation**: `Features.md:996` names T7 as owner of the "was it actually refused"
   coherence gap in `contest-coherence.ts` — worth resolving in this task, or explicitly deferring
   with a comment naming why not.

## Task 8 — `packages/sync-client` scaffold

1. **Status: ALREADY DONE.** Landed in `b62be74` ("…the replica's storage seam…"), confirmed live:
   `packages/sync-client/src/index.ts:10-11` exports `SqlRow, SqlValue, SyncStorage` and
   `LOCAL_SCHEMA_VERSION, migrateLocal`; `storage/storage.ts` defines `SyncStorage`/`SqlValue`/`SqlRow`;
   `storage/schema.ts` has `LOCAL_SCHEMA_VERSION=1` and all eight tables (`events`, `snapshots`,
   `tickets`, `workflows`, `ticket_types`, `contests`, `outbox`, `meta`). Matches the plan's produced
   API closely. **`controller-state.md:21` confirms this**: the permitted-without-asking list names
   T5,T6,T7,T9,T10,T11,T12,T13 and skips T8 — consistent with T8 already being closed. Do not re-scaffold.
2. No disagreements worth recording beyond: it exists, use it, don't recreate `package.json`/`tsconfig`.

## Task 9 — The replica

1. **Status: not run.** No `packages/sync-client/src/replica/`.
2. **Consumes**: every domain symbol named by the plan resolves — `CONTEST_EVENT_TYPES`
   (`contest-events.ts:90`), `claimContestedPayloadSchema`/`claimContestedResolvedPayloadSchema`
   (`contest-events.ts:40,70`), `foldStateIdForward` (`workflow.ts:109`), `stateCategoryOf`
   (`workflow-helpers.ts:19`), `docToPlainText` (`doc-text.ts:47`), `istDayOf`/`istDayBounds`/`IST_DAY_REGEX`
   (`ist-day.ts:27,37,61`), `plainTextToDoc` (`contest-events.ts:113`). No renames to chase.
3. **DISAGREEMENT**: `SyncItem` is not the two-member union the plan's interface list implies
   (`SyncItem, PurgeInstruction shape (Plan 4, as wire data)`). The real type, landed by Plan 4/5, is
   **three-way**: `SyncItem = LedgerEvent | PurgeInstruction | ScopeRevokedInstruction`
   (`apps/server/src/visibility/visible-events-for.ts:159`, consumed by `stream/hub.ts:6,37`).
   `ScopeRevokedInstruction = {kind:'scope-revoked', workspaceId, projectId?}`
   (`visible-events-for.ts:127-132`) fires "at a scope-revocation boundary." `Replica.applyServerItem`
   must discriminate all three kinds, not two — the plan's own `Replica` type signature
   (`applyServerItem(item: SyncItem)`) is actually already correct if `SyncItem` is imported for real
   rather than re-declared from the plan's abbreviated description; the risk is an implementer
   re-declaring a truncated two-member `SyncItem` locally in sync-client instead of importing/mirroring
   the real three-member one.
4. This task carries the largest, most detailed prose contract in the whole batch (workflow-republish
   fold via `foldStateIdForward`, snapshot-as-replay-baseline). I did not attempt to verify
   `foldStateIdForward`'s exact signature against the plan's usage — **flagged, not verified** (see
   closing claim).

## Task 10 — Outbox + local pre-check

1. **Status: not run.**
2. Consumed rule-engine/domain symbols (`evaluateEvent`, `EngineContext`, `Verdict`, `membershipId`,
   `MembershipState`) were not individually re-verified against current signatures — **not verified**,
   flagged rather than assumed. They are used elsewhere in `apps/server/src/ingest/ingest-service.ts`
   so they exist; arity match with T10's usage wasn't checked line-by-line.
3. No file-level collisions found (`precheck/`, `outbox/` are new directories under `sync-client/src`).
4. Naming trap worth recording: T10's `backoffMs(attempts) = min(1000*2^attempts, 60_000)` (outbox
   retry) is a **different function with a different formula** from `packages/app-core/src/online/stream.ts:27-30`'s
   `backoffDelayMs` (`BACKOFF_INITIAL_MS=500`, cap `30_000`, ±20% jitter, stream reconnect). Don't
   conflate or dedupe these — they serve different retry surfaces (outbox flush vs. WS reconnect) and
   already have two independently-chosen constants in this codebase.

## Task 11 — The sync engine

1. **Status: not run.**
2. **Disagreement/precedent**: `packages/app-core/src/online/stream.ts` already implements a WS client
   for the *online* `DataSource`, using `streamUrl(baseUrl) = ${baseUrl.replace(/^http/,'ws')}/v1/stream`
   and a hand-injectable `WebSocketLike` (not the DOM `WebSocket` type) *specifically* so both browser
   and non-browser shells can supply it (`stream.ts:4-12`) — and its docblock explains it
   deliberately does **not** validate frames through `@gisik-nokma/domain`'s
   `serverStreamFrameSchema` because that schema is stricter than a client should be (`stream.ts:34-45`).
   T11's `createHttpTransport`/`openStream` should follow the same `WebSocketLike`-injection and
   lenient-parsing pattern rather than inventing a second WS abstraction — not a hard bug, but a
   real precedent the plan text doesn't mention and an implementer could easily miss, producing two
   different WS reconnect/parse strategies in the same repo for the same wire protocol.
3. `SyncItem`'s three-way shape (see T9) applies here too — `StreamHandlers.onItem` must handle
   `scope-revoked` as well as `event`/`purge`, and the plan's own comment
   (`onItem(item: SyncItem): void; // {type:'event'}... {type:'purge'}... {type:'scope-revoked'}...`)
   actually already names it correctly in T11's prose even though T9's interface list above omitted it
   — internally inconsistent plan text, resolve toward the three-way truth.

## Task 12 — The replica `DataSource`

1. **Status: not run.**
2. **DISAGREEMENT — the largest structural one in the batch.** The plan declares its own parallel
   types (`ReplicaQuery`, `LocalIngestResult`, a bespoke `subscribe(...,cb:()=>void)`) and calls this
   "amendment 10's `DataSource` shape," but the **real, already-shipped** `DataSource` at
   `packages/app-core/src/data-source.ts:142-146` is:
   ```ts
   export type DataSource = {
     ingest(events: SubmittedEvent[]): Promise<IngestResult[]>;
     query: DataSourceQuery;
     subscribe(workspaceId: string, afterSeq: number, cb: (item: StreamItem) => void): Unsubscribe;
   };
   ```
   - `ingest` must return `Promise<IngestResult[]>` — the real, 3-status `IngestResult`
     (`committed`/`invalid`/`refused`, `ingest-result.ts:14-17`). The plan's `LocalIngestResult` adds a
     4th `'pending'` status; a function returning that is **not assignable** where `DataSource.ingest`
     is expected (return-type covariance rejects the extra member). If `ReplicaDataSource` is meant to
     actually satisfy the shipped `DataSource` interface (so app-core views can use it interchangeably
     with the online source, which is the whole point of amendment 10), the `'pending'` status cannot
     ride on `ingest`'s return type as designed — it needs a separate channel (e.g. exposed through
     `query.syncStatus` / a subscribe event / the outbox), not a widened `IngestResult`.
   - `DataSourceQuery` (`data-source.ts:125-137`) has **13** methods with these exact names:
     `getMyWorkspaces, getMembers, getBoard, getTickets, getTicket, getTicketHistory, getWorkflowDef,
     getTicketTypes, search, getMyWork, getAttention, getPreferences, putPreferences`. The plan's
     `ReplicaQuery` has 6, under **different names** (`listTickets` vs `getTickets`, `myWork` vs
     `getMyWork`) and is missing `getMyWorkspaces`, `getMembers`, `getBoard`, `getWorkflowDef`,
     `getTicketTypes`, `getAttention`, `getPreferences`, `putPreferences` entirely, while adding
     `listContests`/`syncStatus` that aren't on `DataSourceQuery` at all.
   - `subscribe`'s callback in the real type carries a typed `StreamItem`
     (`{type:'event'|'purge'|'scope-revoked'|'caught-up'|'error', ...}`, `data-source.ts:65-70`); the
     plan's is a bare `() => void` change signal.
   - The plan text itself hedges this exact risk ("Plan 6's app-core query expectations… written in
     parallel… divergences reconciled at execution") but the actual divergence is not a few renames —
     it's a different interface shape entirely. **The implementer should build `ReplicaDataSource`
     against the real `DataSourceQuery`/`DataSource`/`StreamItem` types in `data-source.ts`, not invent
     `ReplicaQuery`/`LocalIngestResult` as designed**, and separately surface pending/queued state
     through whatever seam `DataSourceQuery` already offers (most likely folded into
     `getTickets`/`getTicket` results plus a status method that isn't yet on `DataSourceQuery` — which
     would itself need a Plan 6/10 coordination amendment, not a silent local addition).
   - Bonus obligation surfaced by the same file: `data-source.ts:60-63`'s docblock states *"`stream-frames.ts`'s
     own docblock argues `StreamItem` should be REPLACED by `ServerStreamFrame` rather than
     re-synchronised with it, **owner Plan 10**."* T12 (or a task near it) is named as the owner of that
     replacement decision — not mentioned anywhere in Plan 10's own task text.

## Task 13 — app-core UX

1. **Status: not run** (the specific files — `contests/contest-view-model.ts`, `contests/contest-banner.tsx`,
   `offline/reopen-pair.ts`, `history/clock-skew-badge.tsx`, `sync/sync-status-bar.tsx` — do not exist).
2. **Step 0 guard confirmed moot**: `packages/app-core` already exists richly (dozens of files under
   `src/views/`, `src/online/`, tests, `package.json`), so Step 0 (minimal scaffold) is skipped as the
   plan's own guard says.
3. Consumed domain symbols all resolve: `renderContestedClaimText` (`contest-events.ts:104`),
   `clockSkewMs`/`hasGrossClockSkew`/`formatIstInstant`/`IST_CLOCK_NOTE` (`clock-skew.ts:76,83,51,21`),
   `Origin` (`envelope.ts:27`).
4. **Ruling P17 is directly load-bearing here even though the plan text never mentions
   `useLiveQuery`.** The real signature, already applied across app-core, is
   `useLiveQuery<T>(source, workspaceId, queryKey, load, debounceMs=200)`
   (`packages/app-core/src/views/use-live-query.ts:34-39`), with the unstated invariant *"the key must
   name every input `load` closes over"* (coordination doc, `controller-state.md:1239-1244`). Any new
   view T13 adds under `sync/sync-status-bar.tsx` or elsewhere that reads through `useLiveQuery` must
   use this 5-arg form and a key that captures every closed-over input — precedent at
   `ticket-sheet.tsx:174-189`, `attention-strip.tsx:100-123`, `my-work.tsx:176`. **I could not confirm
   whether the coordination doc's "five neither named" P17 call sites (5514, 6390, 6391, 6395, 6396)
   refer to line numbers in Plan 10's own file or elsewhere** — I checked both `2026-08-20-10-offline-sync-apps.md`
   and `2026-08-20-00-series-coordination.md` at those exact line numbers and neither matches
   `useLiveQuery` content (see closing claim).
5. Minor collision risk, not confirmed as a real one: `packages/app-core/src/views/reopen-dialog.tsx`
   already exists (an *online*, interactive reopen flow) alongside the new `offline/reopen-pair.ts`
   builder T13 adds. Different files, different jobs (component vs. pure event-pair builder) — worth a
   quick read before assuming zero overlap, not verified either way.

## Test-case numbering (§12)

- **Live measurement, cross-checked two ways** (grep of `- 12\.N` lines in the file, and the file's own
  stated maximum): `test-cases/12-offline-sync-apps.md:11` says *"HIGHEST ID IN USE HERE IS `12.84`.
  THE NEXT FREE ID IS `12.85`."* — I recounted independently and got the same max (84).
- `test-cases/README.md:9` (§12 entry) confirms: **opened by Plan 10 Task 4 only**; **12.1–12.44 are
  RESERVED by Task 18** (not yet run, so still absent — Task 18 is out of scope for T5–T13); live cases
  today run 12.45–12.84 (Task 4's contest-coherence/`proj_contested`/route surface only).
- `test-cases/12-offline-sync-apps.md:19` records a gotcha future authors will hit: **12.15 is
  already true on `main`** (`apps/server/test/sync/stream-seq.test.ts`, Task 2) but stays unflipped
  because 12.15 sits in the reserved 12.1–12.44 block — owned by Task 18, not by whoever notices it's
  passing.
- T5–T13 each add cases starting from **12.85** upward, grouped by surface per the file's stated
  convention (not append-only-at-tail) — and each task must update the "HIGHEST ID… NEXT FREE ID" line
  itself in the same commit, per that line's own warning about going stale.
- `Features.md` §12 (`Features.md:973-979`) currently documents **only Task 4's scope**; every task
  T5–T13 adding server/client behaviour must extend this section in the same change set (workspace
  convention), not create a new section — §8/§10/§11 are explicitly named as staying absent from §12
  because sections are claimed by plan, never taken next-free.

## Coordination obligations

- **Ruling P17** (`controller-state.md:1239-1244`): breaking `useLiveQuery` signature, binds Plan 6
  T10–T13 *and Plan 10* — see Task 13 above.
- **`Plan 10 T4 is lifted to Phase 1`** (`controller-state.md:1238-1239`): already done, don't re-plan
  it; it closed only the client-side envelope-coherence door per `fc904f4` — the server-side "was it
  actually refused" half is explicitly still open and owned by **T7** (`Features.md:996`).
- **CSRF ruling** (`controller-state.md:1229-1230`): binds Plan 4 T5, not directly T5–T13, but the
  **envelope-`origin` vs HTTP-`Origin` distinction is directly in scope for this whole plan** —
  `test-cases/12-offline-sync-apps.md:27-29` states it explicitly: *"'envelope-origin' … is NOT the
  browser `Origin` header; nothing in this file concerns CSRF. The two are routinely conflated in this
  area of the repo…"* Every T5–T13 task that touches `origin: 'server'|'mobile'|'web'` on a
  `newSubmittedEvent(...)` call is the envelope-provenance enum, never an HTTP header — worth restating
  in any commit message that mentions "origin" so a reviewer doesn't conflate the two.
- **Owner-set stop point** (`controller-state.md:19-21`): T5,T6,T7,T9,T10,T11,T12,T13 (exactly this
  task's scope) are pre-authorized without asking; **T14 requires asking the owner first** —
  `docs/lanes/controller-state.md:1980` and `docs/lanes/executor-state.md:1979-1980` both restate this.
- **`registerContestsRoute`/`registerSyncRoutes` pool of routes must all land inside `buildApp`**
  (`app.ts`), matching how T4 already did it — a structural obligation, not a formal ruling, but every
  future route task's "modify index.ts" instruction is wrong for the same reason each time.

## The two or three tasks most likely to go wrong

1. **Task 12** (replica `DataSource`) — by a wide margin the riskiest. The plan's own type surface
   (`ReplicaQuery`, `LocalIngestResult`, bare-callback `subscribe`) is not the real `DataSource`
   contract app-core already ships and app-core's views already call by these 13 real method names.
   Anyone implementing T12 to the plan's literal text produces a type that cannot substitute for the
   online `DataSource` — defeating the entire point of amendment 10 (one interface, two
   implementations) — and won't be caught until Task 13's views, or a later app shell (T16/T17), try to
   swap sources and fail to compile or silently duck-type past a linter that isn't strict enough.
2. **Task 7** (`POST /v1/sync`) — the `ingestBatch` vs `ingestClientBatch` distinction is exactly the
   kind of "prose across three plans" hazard the codebase's own docblock calls out by name as the
   reason `ClientIngest` was carved out in the first place — and Plan 10's plan text, written before
   that carve-out, still shows the vulnerable call. If sync-service is typed against the full
   `IngestService` (which it legitimately needs, for the `claim.contested` append), the compiler
   **won't** stop a wrong `ingestBatch([event])` call for the client's own claim — the guard only fires
   when a route is typed `ClientIngest`. This is a live-security miss, not a style nit: an offline event
   ingested through the ungated door skips `checkPermission` entirely.
3. **Task 9** (the replica) — largest single prose contract in the batch (workflow-republish fold via
   `foldStateIdForward`, snapshot-as-baseline correctness), and the one place I did not verify
   `foldStateIdForward`'s exact signature/behaviour against the plan's described usage — high blast
   radius (wrong fold = silently wrong board state on every client, exactly the failure mode its own
   docblock spends four paragraphs warning about) combined with the one area of this map I'm least
   confident in.

## Least-sure claim

I am least sure about the coordination doc's "five neither named" P17 call sites at line numbers
5514, 6390, 6391, 6395, 6396 (`controller-state.md:1243-1244`). I checked both candidate files at those
exact line numbers — `docs/superpowers/plans/2026-08-20-10-offline-sync-apps.md` (5514 lands in Task 13's
`buildReopenPair` docstring; 6390–6396 land in Task 15's dual-client scenario code) and
`docs/superpowers/plans/2026-08-20-00-series-coordination.md` (5514 and 6390–6396 land in unrelated
prose about savedFilters and TemplateGallery) — and neither location contains a `useLiveQuery` call.
I could not determine which document those five line numbers actually address, so I cannot confirm
whether any of Tasks 9/11–13 as literally drafted contain a stale 3- or 4-argument `useLiveQuery` call
that needs updating to the 5-arg P17 form. The P17 rule itself (5-arg signature, key-must-name-every-input
invariant) is independently confirmed live in the codebase and stated above with certainty — only the
specific "five uncounted sites" attribution is unverified.

---

# ADDENDUM — the map's own "not verified" entries, closed by the executor

The map flagged several claims as unverified and said so honestly. Those are the entries that cost an
implementer a round, so they were closed before step 15 starts. All citations below were run at
`exec/14-plan9-calendar`.

**T9 — `foldStateIdForward` VERIFIED.** `packages/domain/src/workflow.ts:109`:
`foldStateIdForward(stateId: string, fromVersion: number, latest: WorkflowDef, intermediate: (version: number) => WorkflowDef | null): FoldedState`.
Four arguments; the `intermediate` callback is a lookup the replica must be able to answer for every
version between `fromVersion+1` and `latest.version`, which is a real constraint on what the local
store has to retain.

**T10 — `evaluateEvent` EXISTS and the plan's import is right.** `packages/rule-engine/src/evaluate.ts:22`,
`export async function evaluateEvent(env: EventEnvelope, ctx: EngineContext): Promise<Accept | Refusal>`
— exactly the signature the plan declares — and the barrel re-exports it explicitly
(`packages/rule-engine/src/index.ts:6`), so `import { evaluateEvent } from '@gisik-nokma/rule-engine'`
resolves. `EngineContext` (`engine.ts:59`), `Verdict` (`engine.ts:11`), `membershipId`
(`entity-state.ts:58`) and `MembershipState` (`entity-state.ts:41`) all exist.

> *A caution about how this was nearly recorded wrong.* A first sweep for
> `export function evaluateEvent` returned NOTHING and I briefly had it down as missing — the
> declaration is `export **async** function`. A pattern that cannot match the thing it is looking for
> produces a confident absence, which is the same failure this branch met four times in Plan 9. Match
> on the NAME and filter afterwards.

**T10 — TWO THINGS THE MAP MISSED, and both are load-bearing.**

1. **`buildMemoryContext` already exists for exactly this job** (`memory-engine`: `index.ts:14`,
   `packages/rule-engine/src/memory-context.ts`). Its docblock states the purpose in Plan 10's own
   terms: *"Every ticket event here goes through `applyTicketEvent`, the same function `proj_tickets`
   and **Plan 10's offline replica** fold with, so a rule cannot answer one way in a unit test and
   another on the server."* **T10's local pre-check must build its context from this, not invent a
   third one** — a pre-check that can disagree with the server is worse than no pre-check, because it
   teaches the user to trust an answer the server will overturn. The docblock also records why this
   is a SECOND in-memory context and must not be merged with `fixtures/harness.js`'s
   `buildInMemoryContext` (61 fixtures and 30 harness tests bind to that one, and its prior-event
   dialect is deliberately not the domain schemas).
2. **The fixture harness is deliberately NOT on the barrel** (`index.ts:1-4`): it imports
   `node:fs`/`node:path`/`node:url` at module top level, and *"Plans 6 and 10 run this package in the
   browser entering at `evaluateEvent`."* It ships as the `@gisik-nokma/rule-engine/fixtures` subpath.
   An implementer who reaches for the harness inside `sync-client` will pull `node:fs` into a browser
   bundle.

**T6/T7 — `EffectiveRole` is brand-protected.** See the header section above; repeated here because it
is the kind of thing that only bites at test-writing time.
