# Lane B — executor state (Plan 10 T13 → T14 → T15 → T18)

**This file is Lane B's restart surface, and nobody else's.** `executor-state.md` is Lane A's — never
edit it. A Lane B session relaunched from `dispatch-executor-serial.md` + the Lane B override recovers
only what is written here.

> **Shas in narrative prose below are facts about when they were written.** Verify with
> `git branch --contains <sha>` — **empty output means orphaned**. `git cat-file` passes on reflog-only
> commits and will lie to you.

---

## LIVE ANCHORS — measured 2026-09-06 after the #126 relaunch. RE-VERIFY BEFORE TRUSTING.

| anchor | value | how verified |
|---|---|---|
| branch | `exec/26-closure5-catchup` | `git branch --show-current` |
| cut from | `origin/main` = **`c7c2b8e`** (the #126 merge — T14 + T15) | `git checkout -b … origin/main` |
| HEAD | **`13586c68`** | `git rev-parse HEAD` |
| ahead of `origin/main` | **3** | `git rev-list --count origin/main..HEAD` |
| HEAD reachable? | **YES — `git branch --contains 13586c68` prints `exec/26-closure5-catchup`** | `git branch --contains HEAD` — empty output would mean orphaned |
| tree | clean (`git status --short` empty) | `git status --short` |
| node | v22.22.2 | `node -v` after `source ~/.nvm/nvm.sh && nvm use 22` |
| gate | **`GATE_EXIT=0` · `Tasks: 30 successful, 30 total` · `Cached: 0 cached, 30 total` · 1m29.168s · node v22.22.2 · zero `Unsupported engine` · `check:env` exit 0 on its own line · `pg_isready` exit 0.** **3280 tests / 10 packages**, enumerated per package and summed rather than taken from a total: domain 464 · ui 37 · editor 178 · rule-engine 282 · sync-client 64 · app-core 1086 · web 136 · server 1008 · desktop 5 · mobile 20. **The delta is stated against `c7c2b8e`, NOT against the controller's 3254/983 figure — that one was measured at `e407bf5`, BEFORE #126 merged, and this branch is cut from `c7c2b8e`.** This branch adds 13 `it` blocks, enumerated: server 12 (12.277-12.282 at the filter, 12.284-12.286 at the route, 12.275/12.276/12.289 on the rig) and sync-client 1 (12.287, `sync-engine.test.ts:1006`). So `c7c2b8e` held server 996 and sync-client 63, and #126 accounts for the rest. *The `it`-block count was read from the FILES, not from `git diff | grep -c '^+'`, which answered **0** here — the reformatted-diff-marker silent-empty mode this machine has on record.* | one backgrounded invocation under the lock |

**⚠️ BRANCH-NUMBER COLLISION, flagged by Lane A and NOT resolved by either of us.** Lane A's branch is
`exec/26-provenance-block` and this one is `exec/26-closure5-catchup` — two `exec/26-*` branches. Not a
git conflict (different refs), but ambiguous in the ledger and in PR titles, which is one level up from
the `12.156` id collision that cost a day. Lane A pushed first and declined to rename unilaterally;
**the controller decides who renumbers.** Neither lane should assume the other did.

---

## POSITION IN THE LANE SEQUENCE

| # | task | state |
|---|---|---|
| 1 | T13 — app-core contested-claim UX, reopen pair, skew badge, status bar | **DONE, MERGED** (#117) |
| 2 | T14 — dual-client harness rig | **DONE, MERGED** (#126) |
| 3 | T15 — scenarios S1–S6 | **DONE, MERGED** (#126) |
| 4 | **CLOSURE 5 — ruling P37, both halves** | **BUILT AND MEASURED.** Two commits on this branch; catalogue in the same change set. See the section below. |
| 5 | T18 — `Features.md` §12 + `test-cases/12` final shape | **NEXT, and STILL HELD.** Plan lines 7471–7629. **Precondition unchanged: it cannot be complete while what it catalogues is still moving.** Lane A's closure 2b, closure 4 and the HELD pair (ids 12.240–12.259) were still landing in §12 when closure 5 was written. **Re-measure §12 against `origin/main` at the moment T18 starts**; if Lane A's §12 writes have not landed, tell the controller and HOLD rather than catalogue a moving target — the controller decides whether T18 waits or closes with Lane A's items named as "landing under Lane A". |

**⚠️ THIS LANE'S §12 BLOCK (12.260–12.289) IS NOW EXHAUSTED.** 12.289 is its last id and it is used.
Any further §12 case from this lane needs a controller-allocated block. Do not mint from the header's
maximum — that is exactly what collided twice in one day. Recounted at this sha: **215 ids, max 12.289,
zero duplicates, nothing above 12.289** (enumerated with `grep -o '^- 12\.[0-9]*' | sort -t. -k2 -n`,
rows printed rather than counted).

---

## WHAT THIS LANE HAS ESTABLISHED SO FAR — facts, with how each was measured

These are cheap to re-derive but were not free the first time. A restart should read them before
re-measuring.

1. **T13's Step 0 is moot.** `packages/app-core` exists richly (95 source files). The plan's own guard
   says skip Step 0 in that case. Confirmed by `find packages/app-core/src -type f`.

2. **Every domain symbol T13 consumes resolves**, verified by `grep -rn "export ..." packages/domain/src`
   and confirmed present in `packages/domain/src/index.ts`'s re-export list:
   `renderContestedClaimText` + `plainTextToDoc` (`events/contest-events.ts:104,113`),
   `clockSkewMs` / `hasGrossClockSkew` / `formatIstInstant` / `IST_CLOCK_NOTE`
   (`clock-skew.ts:76,83,51,21`), `newSubmittedEvent` (`submit.ts:9`), `Origin` (`envelope.ts`).

3. **`hasGrossClockSkew` returns `true` when the skew is unparseable** (`clock-skew.ts:84` —
   `skew === null || Math.abs(skew) >= GROSS_CLOCK_SKEW_MS`). This is why the plan's `formatClockSkew`
   ordering is correct: gate on `hasGrossClockSkew` FIRST, then re-read `clockSkewMs` and answer
   `'device clock claim unreadable'` on `null`. Inverting those two lines makes the unreadable case
   return `null` (no badge) — the exact silent-hiding the plan's third test exists to forbid.

4. **`GROSS_CLOCK_SKEW_MS = 600_000`** (10 min), and the comparison is `>=`. The plan's 11-minute case
   clears it; the 30-second case does not.

5. **`newSubmittedEvent` sets `clientTime` from `now().toISOString()`** and does NOT set `serverTime`
   or `seq` — `SubmittedEvent = Omit<EventEnvelope, 'serverTime' | 'seq'>` (`envelope.ts:164`).
   `renderContestedClaimText` prints `formatIstInstant(originalEvent.clientTime)`, which is where the
   banner's required `'IST'` substring comes from.

6. **`ContestedClaim` ALREADY EXISTS in app-core and is NOT the plan's `ContestLike`.**
   `view-types.ts:165` — `{ ticketId, title, rule, reason, claim: ClaimProvenance }`, the `MyWorkView`
   row. The plan's `ContestLike` is a different, locally-declared structural type
   (`{ contestedEventId, ticketId, claimantId, rule, reason, originalEvent, contestedAt, resolved,
   resolution }`). Two contest-shaped types in one package is a real confusion hazard; the new file
   must name the distinction in a docblock rather than leave it to be rediscovered.
   *(Measured with QUOTED grep globs plus a positive control — an earlier unquoted
   `--include=*.ts` was eaten by zsh and returned a silently-empty wrong answer.)*

7. **T13 has NO dependency on Lane A's `getAttention` / `ContestedClaim.title` work.** T13's five files
   are pure-props components and pure functions; `ContestLike` is declared locally by the plan's own
   design ("app-core declares the minimal structural types it needs"). The replica source's refusal at
   `replica-data-source.ts:289` (`ContestedClaim.title` — "no title on the contests table") therefore
   does not block this task. **Recorded rather than built toward.**

8. **Ruling P17 does not bind T13.** P17 governs the `useLiveQuery(source, workspaceId, queryKey, load,
   debounceMs)` 5-arg form. None of T13's five files reads through `useLiveQuery` — they take props.
   The adaptation map flagged P17 as "directly load-bearing here"; that is true only *if* a live-reading
   view is added, and the plan text adds none. **This lane deliberately adds none.**

9. **Ruling P30 is not at risk from T13.** No T13 file touches `packages/app-core/src/data-source.ts`.
   The one place a widening could tempt someone is `IngestFn` — which the plan declares in T13's OWN
   new file (`contests/contest-view-model.ts`), never in `data-source.ts`.

10. **Test-case numbering, recounted at this sha rather than trusted:**
    `test-cases/12-offline-sync-apps.md:11` claims *"HIGHEST ID IN USE HERE IS `12.188`. THE NEXT FREE
    ID IS `12.189`."* Independent recount — `grep -o '^- 12\.[0-9]*' | sed | sort -n | tail` — returns
    **188**. The header agrees. **T13's cases start at 12.189**, and this lane must update that header
    line in the same change set (the line's own parenthesis records five separate occasions it went
    stale inside one change set).

11. **`Features.md` §12 must be extended in the same change set**, appending only within Plan 10's
    section. T18 owns §12's final shape — this lane must not restructure it now.

12. **THE TZ PREMISE, corrected.** The blanket "zero of 48 test files vary `TZ`" in the executor brief
    is a reading of an old tree. The adaptation map's own correction (measured at `32393be`) is that the
    repo has **228** test files and **14** assign `process.env.TZ`. The operative rule is narrower and
    better: **vary `TZ` where the value under test actually moves with it; where it does not, say so in
    a comment and do not add the case** (`apps/server/test/routes/board.test.ts:80-87` reasons exactly
    this way and is right to). Plan 10's own text pins a timezone on **zero** lines across 36
    clock-sensitive ones, so a task transcribing it inherits no discipline from the plan.

---

## ✅ RESOLVED (2026-09-06 ~01:50): the Docker blocker below is CLEARED — kept for its lessons

`pg_isready` accepting; `/dev/vda1` 58.4G with **12.8 G available (77%)**; build cache 12.60 GB → 442 MB;
images essentially untouched (39.79 → 39.35 GB, 29 → 28); all four containers up, **including the
owner's `mongo`, `redis` and `postgres:15.3`**; zero `gisik_test_*` remaining. Lane E cleared its own
build cache — 92% of which was its own image builds, zero entries active — and the owner independently
authorised exactly that least-destructive option when this lane put the three choices to them. The
36.8 GB of unused images stays the owner's call and is no longer urgent.

**Two lessons kept because they will recur:**
1. **`docker ps` said "Up 43 hours" throughout.** The container was up and the database was not. Never
   read database liveness off `docker ps`; use `pg_isready`.
2. **`createTestDatabase` drops its database in `drop()`, and a killed run never calls it** — which is
   how 39 accumulated. A sweep belongs at the START of a gate, because the end is the part that does
   not happen when it matters. Now Lane E's `sweep-test-dbs.sh`, dropping only idle ones (zero backends).

### The original blocker, as measured

**No lane could run `apps/server` tests or a full gate until disk was freed inside Docker.** Measured:

- `docker exec gisik-nokma-exec-postgres-1 df -h /var/lib/postgresql/data` → `/dev/vda1 58.4G 56.1G **0 available** 100%`.
- **The host Mac is fine** — 77 GB free on `/System/Volumes/Data`. This is Docker's own VM disk.
- Postgres cannot exit recovery: `PANIC: could not write to file "pg_logical/replorigin_checkpoint.tmp":
  No space left on device` → `checkpointer process ... terminated by signal 6` → `all server processes
  terminated; reinitializing` → repeat. `pg_isready` answers **no response**.
- **`docker ps` still says "Up 43 hours".** The container is up; the database is not. Do not read
  liveness off `docker ps` here.

**Where the space went, and it is not this project:** `docker system df` → Images 39.79 GB (36.83 GB
reclaimable), Build Cache 12.60 GB (12.60 GB reclaimable, **0 active**), Local Volumes 2.31 GB (1.44 GB
reclaimable). The 39 orphaned `gisik_test_*` databases totalled **331 MB** — real litter, under 1% of
the problem.

**What this lane did and did not do.** It dropped the 39 orphaned test databases (all idle, zero active
connections, checked before dropping). Those DROPs reached the WAL, and the checkpoint after them
PANICked — but the volume was already at 100% and `CREATE DATABASE` was already failing before any of
it, which is how the problem was found. Any write would have hit the same wall. **It did NOT run
`docker system prune` or `docker builder prune`**: that is destructive and machine-wide, and this
daemon also hosts `mongo`, `redis` and a `postgres:15.3` belonging to the owner's other projects. It
needs the owner's authorization and was surfaced to them.

**Recovery order when authorized:** `docker builder prune -f` (12.6 GB, nothing active) → if still
short, prune unused images → restart the gisik postgres container → `pg_isready` → re-run the rig.

**Standing fix worth making afterwards:** `createTestDatabase` drops its database in `drop()`, and a
killed or crashed run never calls it — which is exactly how 39 accumulated. A gate should sweep idle
`gisik_test_*` databases at the START of a run, because the end is the part that does not happen when
it matters.

## T14 — WHAT IS BUILT, AND THE THREE MUTATIONS THAT MEASURE IT

`apps/server/test/dual-client/rig.ts` (472 lines) and `rig.test.ts` (4 cases), plus **both**
`@gisik-nokma/sync-client` **and** `@gisik-nokma/app-core` as `apps/server` devDependencies. Self-test
**4 passed** under the lock at `0cbdc82`.

The implementer's own least-sure claim **HELD**: full `TicketState` equality between the replica's
reducer fold and the server's `rowToTicketState` row mapping. That is the property Task 15 leans on,
now measured rather than assumed.

| mutation | result |
|---|---|
| `ingestInteractive` swapped from `ingestClientBatch` back to `ingestBatch` | gated-door case red ALONE, `1 failed \| 2 passed` |
| `BOOTSTRAP_BACKFILL_TYPES` → the plan's four-entry literal | **ALL THREE CASES STAYED GREEN.** The edit was confirmed present before the run, so an unconstrained path — not a mutation that never fired. |
| the same, after adding the `visibility.set` case | that case red ALONE, `1 failed \| 3 passed`; `4 passed` on restore |

**The middle row is the finding.** The backfill correction was right and nothing tested it. A dropped
`visibility.set` would leave the replica holding a different AUDIENCE for a ticket than the server does,
and every Task 15 scenario asserting who can see what would have been asserting it against a bootstrap
the server never sends. The new case commits a `visibility.set`, runs the snapshot pass so the claim
sits BELOW the snapshot line — the only position where the backfill is load-bearing — then requires a
fresh client to still hold it. Its control (`not.toContain('ticket.created')`) proves the snapshot
actually covered the ticket, so "below the line" is a fact about the run rather than an assumption.

**Twenty-one departures from the plan's rig text**, of which two were errors in THIS FILE's own
correction table: `me.projectIds` needs `[...eff.projects.keys()]` (`EffectiveRole.projects` is a `Map`,
so the plan's spread yields `[key, value]` tuples — the shape matched, the value did not), and
workflow/ticket-type ENTITY ids must be ULIDs too, not only users and the workspace.

## T14 FABLE REVIEW — no Critical; three Important, all FIXED; and what it means for T15

**No Critical.** The reviewer compared every assembly the rig shares with the server — bootstrap,
both ingest doors, the sync-down cursor, the parked transport — and found no silent divergence. It
verified the load-bearing claim independently: *"flush hands back the in-flight promise"* is TRUE
(`sync-engine.ts`: `if (flushing !== null) return flushing`), so no claim is lost, double-sent, or
stranded by the gate.

### The three Important findings, and why each was a real hole

- **I1 — `goOnline()` could resolve "successfully" with a claim still queued and never sent.**
  `flush` answers a `transport.sync` THROW with `outbox.recordFailure` and returns normally: the row
  stays `'queued'`, `next_attempt_at` moves out, `lastApplyFailure()` stays null and **`failedItems`
  stays EMPTY** — `recordFailure` deliberately does not mark `'failed'`, or every retryable claim
  would strand forever. A Task 15 scenario would then assert one contest, see zero, and blame the
  product; the reason sat in `outbox.last_error`, which nothing read. **Fixed:** `goOnline` now
  reads `queuedCount` after the flush and throws carrying each row's `last_error`. In this harness
  there is no network — `transport.sync` calls `processBatch` in-process — so a still-queued claim is
  never transient and the backoff that would excuse it in the product excuses nothing here.
- **I2 — S3, S4 and any revocation scenario were INEXPRESSIBLE.** `ADMIN_ONLY_TYPES` refuses
  `workflow.defined`, `ticket-type.defined`, `project.created` and `ticket.workflow_rebound` from
  every non-admin, and both users were `'member'`. An author hitting that reaches for the ungated
  internal door and silently stops testing the product. **Fixed:** `USER_ADMIN`, seeded `'owner'` and
  project-admin. Pinned by a case that asserts the MEMBER is refused and the owner commits, so it
  proves the gate is live rather than absent.
- **I3 — S6 (same batch twice) was INEXPRESSIBLE.** `engine.flush()` drains only what is queued and
  the rows are gone after the first flush; the plan's S6 built its own `createSyncService({pool,
  ingest})`, which does not compile (`serverAppend` is required) and would have been a SECOND
  instance, hiding any per-instance duplicate-suppression bug. **Fixed:** `Harness.sync(userId,
  events)` → the same `syncService.processBatch` the route delegates to.

### Minor — recorded, and the third is a PRODUCT defect, not the rig's

- **M1** `engine.settled()` deadlocks while a claim is parked on the offline gate (it awaits
  `flushing`). Scenarios must not use it; documented at the engine field.
- **M2** `goOnline` flushes then catches up; the product catches up, then flushes inside
  `onCaughtUp`. Measured benign for the S1/S2 shapes (the reducer only throws on unknown
  type/workflow/state or an uncreated ticket, which an assign/field/transition gap cannot produce),
  but **T15 should `syncDown()` before `goOnline()`** where it cares about the intermediate state.
- **M3 — PRODUCT DEFECT. OWNER: Lane A, closure 4. Owner ruling: P36 (2026-09-06).** P36 widens the
  BOOTSTRAP payload ADDITIVELY — the snapshot carries the recorded `(actorId, serverTime, seq)`
  provenance of the state claim, copied by the snapshot writer from the ledger row at that seq. The
  preferred shape is a **sibling block on the snapshot row, NOT a widening of
  `TicketState.transitions[]`** — deliberately, so **this rig's full-`TicketState` equality across the
  fold stays untouched**. If Lane A measures that it must widen `TicketState` after all, the controller
  says it will warn this lane before it lands; until then, 12.260's exact equality assertion is safe and
  must NOT be pre-emptively weakened. T15's ❌ case for the DataSource door stands as written and cites
  P36 as its owner ruling.
  *Original wording, kept because it is what was measured:* After `snapshotPass()`, a fresh client's
  `ds.query.getTicket` throws `ReplicaGapError`: `replica-data-source.ts` requires a
  `ticket.created`/`ticket.transitioned` in local `events` for `stateProvenance`, and a
  snapshot-bounded bootstrap ships neither below the line. `replica.getTicket` works; only the
  DataSource door refuses. **The snapshot-bounded bootstrap and the DataSource's provenance rule
  contradict each other.** Recorded, not fixed — it is not the rig's bug, but it will surface as one
  in any scenario that snapshots before creating a client.
- **M4** after a workspace-wide `scope-revoked` the cursor row is gone, so later `syncDown()`s
  re-scan from 0 and re-yield it (idempotent; the engine delivers nothing further).
- **M5** the roster seed is projection-only, so no `membership.granted` / `project.created` rows
  exist in the ledger. Nothing in the replica reads them; cursors are just smaller.

### T15 PITFALLS THE REVIEW MEASURED — read these before writing scenarios

1. **S1's `ticket.field_set {fieldId:'notes'}` is refused LOCALLY** (`field.unknown`) — the seeded
   types have `fields: []`. Use a built-in (`title`, `description`, `dueDate`, `startDate`) or seed a
   field.
2. **S4's expected `purge` on `visibility.set` DOES NOT EXIST in the product** — the per-event walk
   was struck (cases 6.101/6.104). Measured: B keeps the ticket, B's cursor lags, and re-widening
   re-delivers the full history. **The rig reproduces the server correctly; S4's script must change.**
3. `ticket.transitioned`'s payload key is **`to`**, not the plan's `toStateId` — the same error T13
   already paid for.
4. The plan's T15 text repeats T14's API errors: `ingestInteractive` takes `(userId, events)`;
   `ds.query.getTicket` takes `(workspaceId, ticketId)`; **`listEntityEvents` is on the REPLICA, not
   `ds.query`**; `'usr_a'`/`'usr_b'`/`'task'` must be the rig's exported ULIDs; and `seedTicket` takes
   `(pool, args)` with **no `visibility` field at all** (`setVisibilityEnv` is separate).

### The reviewer's own least-sure claim, carried rather than absorbed

M2's "benign for the six scenarios" rests on the S1 and S2 shapes only; S5 was not run. **Not
checked at all:** S3–S6 end to end, the stall path where `lastApplyFailure` is non-null, the
no-progress guard, `bootstrapFor` under a concurrent writer, the JSON round trip, and `contests()`
ordering with two contests in one batch.

## T15 — THE SIXTEEN CORRECTIONS, and the one that is a PLAN DEFECT

Verified against source before dispatch. The plan's T15 block repeats every T14 API error and adds more.

**Rig API:** `ingestInteractive(userId, events)` is two-arg · admin-only claims (`workflow.defined` and
kin) need `USER_ADMIN`, not a member · use the rig's exported ULIDs, never `'usr_a'`/`'wf_h'`/`'task'` ·
`ticket.transitioned`'s key is **`to`**, not `toStateId` · **`ds.query.getTicket` returns `TicketRead` =
`{ticket, title, stateProvenance, parent, rollup}` — it has NO `confirmed`, NO `contests`, NO `pending`,
and the plan reads all three off it** (use `replica.getTicket`, `getTicketWithPending`, `listContests`) ·
`listEntityEvents` is on the REPLICA · `ds.query.search` REFUSES on the replica, use
`searchOfflineCopy` → `{offlineCopy, hits}` · `seedTicket(pool, args)` is ONE options object with **no
`visibility` field at all** · S6 must use `h.sync(userId, events)`.

**Correct as the plan has them, do NOT "fix":** `myWork(workspaceId, userId)` and
`listContests(workspaceId, filter)` both exist on `ReplicaOnlyQuery` with those exact signatures.

**⚠️ S4's CENTRAL PREMISE IS FALSE, and this is a PLAN defect, not a lane one.** S4 expects a `purge`
on `visibility.set`. **There is no such purge in the product** — the per-event visibility walk was
struck (coordination cases 6.101/6.104). Measured on this rig: after a narrowing `visibility.set`,
client B KEEPS the ticket, B's cursor merely lags the head, and re-widening later re-delivers the full
history. **The rig reproduces the server correctly; the SCENARIO is wrong.** The conservative default
taken: write S4 against what the product actually does, assert that exactly, and say in a docblock which
half of the plan's S4 was false and which half (the offline edit contesting) still holds. **Bending the
rig to make the plan's S4 pass would be a harness excusing the server from existing** — this series'
signature failure. Raised with the controller; not blocking.

**Rig behaviours a scenario must work with:** `goOnline()` THROWS if any claim remains queued after the
flush · `goOnline()` flushes then catches up, the INVERSE of the product, so call `syncDown()` first
where the intermediate state matters (measured benign for S1/S2, **not measured for S5**) · do not
`snapshotPass()` then create a client and call `ds.query.getTicket` (product defect M3) ·
`engine.settled()` deadlocks while offline.

## ✅ CLOSURE 5 — BUILT. What it is, and the four mutations that measure it

**Two commits**, catalogue in the same change set. Ruling P37's constraints were followed, not
redesigned around; where a constraint's wording turned out narrower than the gap, the extra is
RECORDED with an owner rather than built.

### The grant half — `apps/server/src/visibility/grant-backfill.ts` (new), wired into `visibleEventsFor`

A visibility-changing event on a ticket the reader may see NOW hands back that ticket's pre-cursor
history — and every INHERITING DESCENDANT's. Triggers: `visibility.set` and `ticket.reparented`.

**The safety argument is an asymmetry, not a check, and it is the thing to re-read before touching this.**
No before-image is consulted or reconstructed (6.82/6.94 hold, and the per-event purge walk stays struck).
A NARROWING is invisible to the viewer it narrowed away, so `visibleEventsFor`'s own `canSee` never
yields it to them and it never becomes their trigger. **A widening self-selects; a narrowing
self-excludes.** That is why a trigger this coarse is legal.

**The subtree walk is `reResolveSubtree`'s own traversal, read-only** — the projection restores the
resolution invariant over exactly the set whose audience the event changed, so "whose row did it change"
and "whose history is owed" are one question asked the same way. It reads `parent_id`/`own_mode`
(structure), never re-derives the RULE; `canSee` still decides every audience question. `visited` guards
a `parent_id` cycle for case 6.58's reason.

### The narrow half — `apps/server/src/sync/reconcile-route.ts` (new) + `SyncTransport`/`SyncEngine`

`POST /v1/sync/reconcile`: the CLIENT names the ids it holds, the server answers only about those, in the
`{kind:'restricted', id}` register. **Existence is never consulted** — a handler that omitted ids it had
no row for would make presence-vs-absence the oracle, which is "lost vs never-had" closed in the content
and reopened in the SHAPE. `canSee` already answers unknown and invisible identically and says so; this
door is the second reader depending on that sentence.

**`SyncTransport` grew a fourth method** (P17's class). Controller approved with an enumeration rule.

### THE FOUR MUTATIONS — results, which are the measurement, not the intent

| mutation | result |
|---|---|
| `GRANT_BACKFILL_TRIGGERS` → `[]` | `5 failed \| 1 passed`. **Not "alone", and it should not be** — emptying it removes the mechanism. The SURVIVOR (12.277) is the finding: exclusion is the caller's `canSee`, not this list. |
| `grantBackfillFor`'s own `canSee` → permits | `1 failed \| 5 passed` — **12.280 ALONE.** Edit confirmed present before the run, so: killed guard, not a mutation that never fired. |
| reconcile route enumerates `proj_visibility` | `2 failed \| 10 passed` — 12.285 + 12.286. **12.284 stayed GREEN, which is why 12.285 exists.** |
| engine drops `chunk.includes(item.id)` | `1 failed \| 63 passed` — **12.287 ALONE.** |

### TWO LESSONS THAT COST A ROUND EACH — both will recur

1. **`git checkout HEAD -- <path>` DOES NOT RESTORE AN UNTRACKED FILE.** It fails with *"pathspec did not
   match any file(s) known to git"* — one line, easy to skim past in a background log. The first run of
   the `canSee` mutation therefore executed with the TRIGGER mutation still applied, and its result was
   confounded and discarded. **This lane's own state file predicted this exact failure** (T13's section:
   "`git checkout --` does NOT restore these files — they were untracked when the mutations ran") and it
   happened anyway, because the prediction was about T13's files and the reflex did not transfer.
   **The fix is to COMMIT BEFORE MUTATING, not to remember.** Both later mutation rounds did, and both
   restored clean and were verified by READING the file back.
2. **A grep for an interface's name does NOT enumerate its implementors.**
   `grep -rn 'SyncTransport|createHttpTransport' --include='*.ts' --include='*.tsx' apps packages` found
   FOUR. `pnpm turbo run typecheck` found a FIFTH: an inline object literal at
   `packages/app-core/test/replica/replica-data-source.test.ts:486` with no `: SyncTransport` annotation,
   structurally typed by inference, invisible to any textual search for the type name. **The compiler is
   the enumerator; the grep is a hint.** Reported to the controller, which had asked for exactly this
   enumeration — the rule it gave was right and the tool the rule implies is not.

### WHAT CLOSURE 5 DID NOT CLOSE — recorded with owners, not fixed

- **Case 12.283** — visibility that widens because the READER's reach grew (`membership.granted`,
  `project.member_added`) rather than the ticket's. Identical pre-cursor gap; P37 scopes closure 5 to
  "the visibility event itself". Named in `GRANT_BACKFILL_TRIGGERS`' own docblock so the module's
  existence cannot be read as covering it. *Owner: WS catch-up/purge protocol, no task.*
- **Case 12.288** — nothing calls `reconcile` on a schedule. When a device should reconcile is a product
  decision with a cost (one request per 100 tickets held) and no plan states it. *Owner: unassigned.*
  Sibling: the engine presents `replica.listTickets`, so a ticket held only as unfolded events with no
  local `tickets` row is not presented.
- **Case 6.102's GUEST side** — the same reconcile primitive, unmeasured for a guest.

### LANE A's HEADS-UP, carried because it expires this lane's assertions

After closure 4 lands, a snapshot row carries a provenance block and the invalidation pass CARRIES IT
FORWARD rather than recomputing. It is ADDITIVE (P36 constraint b), but **an exact `toEqual` on a
snapshot row or a bootstrap body will redden, and that is a real expiry rather than a defect.** Lane A
confirmed it prefers a SIBLING block over widening `TicketState.transitions[]`, so 12.260's full
`TicketState` equality is safe. Lane A also confirmed it adds/wraps/constructs NO `SyncTransport`.

## ⚠️ THE FOUR THINGS A RESTART MUST KNOW BEFORE TOUCHING T14

1. **The T14 plan text's rig code block is a DRAFT and ELEVEN of its details are wrong.** The verified
   correction list is in the section "T14 — WHAT THE PLAN TEXT GETS WRONG" below. Do not implement from
   the plan verbatim; the two that matter most are a security bypass and a fabricated bootstrap.
2. **§12 case ids are ALLOCATED now, not discovered** (cross-lane, 2026-09-06). This lane keeps
   **≤ 12.223**; Lane D holds 12.224–12.227, Lane C 12.228–12.239, Lane A 12.240+. The header's
   NEXT-FREE sentence reads **12.240** deliberately. **Do not mint from 12.224.**
3. **The gate lock protocol changed.** Acquire + pid + trap + drain-wait + run must be ONE backgrounded
   invocation. **`rm -rf` is refused by this machine's permission layer** — use `rm -f <file>` plus
   `rmdir <dir>`. Foreground `sleep` is refused too, which is why it must be backgrounded.
4. **PR #117 is not merged and has been rebased twice.** Never assume a merge from a report; check
   `gh pr view 117 --json state,mergedAt`. A `gh pr merge | tail -1` once hid its own exit code and was
   reported as merged when GitHub had refused it.

## T14 — WHAT THE PLAN TEXT GETS WRONG, verified against the tree at `a23d686`

Plan lines 5897–6202. Every item below was read from source, not inferred.

| # | plan says | truth |
|---|---|---|
| 1 | `createReplicaDataSource`, `ReplicaDataSource`, `LocalIngestResult` from `@gisik-nokma/sync-client` | They are in **`@gisik-nokma/app-core`** (Ruling P30). app-core→sync-client is the only dependency edge that exists. **`apps/server` needs BOTH packages as devDeps**, not the one the plan and the lane brief name. |
| 2 | `IngestResult` from `ingest-service.js` | Not exported there — import from `@gisik-nokma/domain`. |
| 3 | `listVisibleTickets` from `visibility/can-see.js` | It is in **`visibility/visible-tickets.ts`**, `(db: Queryable, userId, workspaceId)`. |
| 4 | `ingestInteractive` uses `ingest.ingestBatch` | **SECURITY.** `ingestBatch` passes `door = null`, so `checkPermission` NEVER runs (`ingest-service.ts:437-442`); its docblock says *"An HTTP route must never call this"*. Every real online door uses `ingestClientBatch(events, userId)`. Using the internal door for the "online user stand-in" would let Task 15 assert permission outcomes the product does not have. `ingestBatch` **is** right for the SEED. |
| 5 | `ds.query.getTicket(ticketId)` | Takes **two** args: `(workspaceId, ticketId)`. |
| 6 | `ds.query.listEntityEvents(...)` | **Does not exist on `ds.query`.** It is `replica.listEntityEvents(ticketId)`. |
| 7 | `seedMember(pool, workspaceId, userId)` | `role` is a **required 4th** positional arg. |
| 8 | `'usr_a'`, `'ws_harness'` | Must be **ULIDs**. `membershipGrantedPayload` requires `ulidString` inside the projection's `apply()`, and `submittedEventSchema.workspaceId` is `ulidString` at `parseEvent`, which the real ingest door calls. |
| 9 | a hardcoded 4-entry `BACKFILL` list | The server's `BOOTSTRAP_BACKFILL_TYPES` (`apps/server/src/sync/sync-routes.ts`) has **five** — it also carries `'visibility.set'`. Import it. A hand-copied list has the harness proving replicas against a bootstrap **the server never sends**, which is this series' signature failure wearing a new costume. |
| 10 | `createReplica(...)` used synchronously | It is **async**; `createOutbox` and `createSyncEngine` are not. |
| 11 | `export type Harness` omits `projTicket` | Its own interface block and implementation both include it. Include it. |

**Verified CORRECT and not to be "fixed":** `createIngestService`, `buildProjectionRegistry`,
`getTicketStateFromDb`, `createSyncService`, `visibleEventsFor`, `readStreamSeq`, `runSnapshotPass`,
`readEntityEvents`, `rowToEnvelope`, `readLatestSnapshot`, `resolveEffectiveRole`, `createTestDatabase`,
`createBetterSqliteStorage` from the `/testing` subpath, `processBatch(userId, rawEvents)`,
`{ kind: 'restrict-to', assignee: true }`, `getCursor`/`setCursor` taking a workspaceId, and
`loadBootstrap`'s shape. `apps/server/vitest.config.ts` includes `test/**/*.test.ts` recursively and CI
runs `apps/server` with Postgres on 54329 — **a new `test/dual-client/` suite needs ZERO config change**,
and the CI file's own comment already says the dual-client job is absent by design pending this task.

## OPEN RULINGS FROM THIS LANE

**R-B1 — RULED (P34, 2026-09-06). Kept for its reasoning.** Of the three annotations, none was Task
13's and none stays unassigned: the offline union list and the `ListRow.pending` renderer went to
**Lane A as closure 2b**; the third was SPLIT — its surface half shipped here (`syncErrorNotice`,
cases 12.216–12.219), its POLICY half stays in `createSyncEngine`, unassigned, and went to the owner as
a task-wanting question. The split was this lane's pushback on the ruling's own wording and was
accepted: a label asserting *"will not reconnect"* for a code the engine reconnects on would be a view
deciding on the engine's behalf.

**Original R-B1: three in-code annotations name "Plan 10 Task 13" as the owner of work that
Task 13's own Files block does not reach.**

1. `packages/app-core/src/replica/replica-data-source.ts:353` — `OFFLINE_BORN_ABSENCE`, owner
   *"Plan 10 Task 13 — an offline list that unions `getTickets` with `listTicketSummaries`"*.
2. `Features.md` §12 on `ListRow.pending` — *"the field exists and nothing renders it until Task 13"*.
3. `packages/sync-client/src/engine/sync-engine.ts:181` — a per-`StreamErrorCode` retry policy, deferred
   to *"whoever owns the client's error surface — Plan 10 Task 13 is the first task with a place to show it"*.

T13's five files are the banner, the view-model, the reopen pair, the skew badge and the status bar.
There is no ticket list, no `ListRow` renderer and no error surface among them. Those annotations named
the next task touching app-core UX **by number, not by content**.

**Conservative default taken, and it is reversible:** all three are RECORDED with owner *"unassigned —
plausibly Tasks 16/17, the first code that actually draws a list"* in both `Features.md` §12 and
`test-cases/12-offline-sync-apps.md`'s "Carried, with owners — Task 13" section, and **none is built**.
Building any would be inventing a surface no plan specifies. Raised with the controller 2026-09-06; if
it rules the other way, the cost is lowest before T14's harness lands.

## WHAT T13 SHIPPED, AND THE FOUR DEVIATIONS FROM THE PLAN TEXT

Commit `0b1b515`. Five source files under `packages/app-core/src/{contests,offline,history,sync}/`,
four test files, `src/index.ts` exports appended at the tail (append-vs-append with Lane A's closure 3),
three style blocks appended to `packages/ui/src/ui.css`, `Features.md` §12 extended, and
`test-cases/12-offline-sync-apps.md` cases **12.189–12.215** with its HIGHEST-ID header, its running
parenthesis and its scope enumeration all rewritten in the same change set.

**Each deviation exists because the plan's own prescribed test could not have caught the thing it named.**

1. **The wire field is `to`, not `toStateId`.** `ticketTransitionedPayloadSchema`
   (`packages/domain/src/workflow.ts:138`) names the destination `to`; `cause` is its declared optional
   sibling, exactly `{ kind: 'reopened-for-child', childTicketId }` — so the plan was right about
   `cause` and wrong about the destination. The schema is NOT `.strict()`, so `toStateId` is stripped
   rather than named and the parse then fails on the missing required `to`. The plan's test asserted
   `toStateId` with `toMatchObject` against an envelope the function had just built — green for any
   spelling. Case **12.190** parses through `domainRegistry` and carries the plan's spelling as a
   negative control in the same test.
2. **`nonTerminalStates` ships as declared but is documented as NOT the reopen picker.**
   `reopenStateOptions(def, currentStateId)` (`flows/guarded-child-event.ts:106`) already answers
   "what may this parent be reopened into", composing `transitionOptions`; it is what the ONLINE dialog
   is fed from. `nonTerminalStates` cannot filter by reachability — it never receives the current state.
   Case **12.191** pins the divergence on the plan's own fixture (two states versus none).
3. **A queued resolution is not an accepted one.** The replica's `ingest` THROWS `OfflineAcceptError`;
   `resolveContest` deliberately does not catch it. Case **12.195**.
4. **The components' classes bound to nothing.** `ui.css` had no `gn-contest-banner`,
   `gn-clock-skew-badge` or `gn-sync-status-bar` selector at all (measured, `gn-inbox` as the positive
   control on the same file). Rules added; case **12.199** ties them by set equality in both directions.

**Six mutations run, each failing at its own site and nowhere else** — `to:`→`toStateId:` (12.189 +
12.190, 2 failed / 3 passed); `formatClockSkew` gate reordered (12.213 + 12.214, 2 / 6); Redo rewired to
`onResolve` (12.203 alone, 1 / 12); domain `getUTCHours`→`getHours` rebuilt (12.194 naming its own zone,
*"21 Aug 2026, 17:00 IST"* — label right, hour the device's); a class rename and a CSS-rule deletion
(both directions of 12.199). **Every restore was verified by reading the file, never by a shell `diff`.**
`git checkout --` does NOT restore these files — they were untracked when the mutations ran, and the
command fails with *"pathspec did not match any file(s) known to git"*, which is easy to skim past.

## THE OTHER LANES' NAMES FOR THINGS

Lane D asked for `syncStatusLabel`, `resolveContest`, `buildReopenPair` from `@gisik-nokma/app-core`.
All three are exported under exactly those names, plus `ContestBanner`, `ClockSkewBadge`,
`formatClockSkew`, `SyncStatusBar`, `nonTerminalStates` and the types `ContestLike` / `IngestFn` /
`ResolveContestInput`. Told Lane D three things it needs before rebasing: the `to`/`toStateId`
correction, that `resolveContest` propagates `OfflineAcceptError` rather than swallowing it, and that
its reopen picker must use `reopenStateOptions`, not `nonTerminalStates`.

## ⛔ THE GATE LOCK DOES NOT HOLD IN THIS HARNESS — measured, reported, affects every lane

**Each Bash tool call is a fresh, short-lived shell.** `echo $$ > /tmp/gisik-gate.lock/pid` therefore
records a pid that exits seconds later, and every peer's stale-check is then CORRECT to fire —
`kill -0 <dead pid>` fails, `rm -rf`, lock reclaimed within one 15-second poll. **The lock releases
itself almost immediately after every acquisition.**

Traced here: `mkdir` succeeded, pid written, `ls -la` confirmed the pid file; minutes later the
backgrounded gate's own `echo $$ > .../pid` failed with *"no such file or directory"* because a peer had
already removed the directory, and `ls` showed it gone while this lane's gate was still running. Two
independent vitest pools (pids 98373 and 99418, nine workers each) were live at that moment, with
**~66 MB free** (`vm_stat` Pages free 4119 x 16KB) and **1983.50M of 3072.00M swap used**.

**The trap that makes it worse:** the brief's one-liner is DENIED as a foreground command — foreground
`sleep` is blocked by this harness, so the `until … sleep 15; done` loop cannot run in the foreground at
all. The natural repair is to split acquire and run across two tool calls, and **that split is exactly
what breaks the lock.**

**THE RULE: acquire + write pid + trap + run gate MUST be ONE backgrounded Bash invocation.**
Backgrounded is the only form where the `sleep` is permitted AND `$$` is a pid that outlives the gate.
Never split it.

**Reaping:** `pgrep -f vitest` matches all five lane sessions (their command lines embed a brief
containing the word) plus any peer's live run — never kill its output. The only correct reap, per the
controller's 2026-09-06 correction:
`ps -eo pid=,ppid=,comm=,args= | awk '$3 ~ /node$/ && $2 == 1 && index($0, "vitest") > 0 {print $1}'`
Read the list before killing anything; expect it empty. Checked after every run this session: empty.

## KNOWN HAZARDS CARRIED INTO T13's IMPLEMENTATION — BOTH NOW RESOLVED

- **RESOLVED:** `cause` IS declared, exactly as the plan assumed — but the destination field is `to`,
  not `toStateId`. See deviation 1 above. Original note follows.
  **`cause: { kind: 'reopened-for-child', childTicketId }` on a `ticket.transitioned` payload was
  UNVERIFIED against the real payload schema.** If that schema is `.strict()` and declares no `cause`,
  the plan's `buildReopenPair` builds an event the real door refuses — and the plan's own unit test
  (`toMatchObject` on a freshly built envelope) **cannot catch it**, because nothing in that test passes
  the event through a schema. This surfaces later, in T15's S5. Being verified now; if the field is
  absent, it is **recorded with a named owner, not fixed by widening the domain schema**.
- **RESOLVED: it compiles.** `IngestResult` is a discriminated union whose every arm satisfies the
  shape; app-core `typecheck` is **0 errors against a 0-error baseline recorded at `1e372e3` before any
  edit**. Note the baseline mattered: a probe run before the dependency dists were built reported ~90
  errors that were entirely stale-dist artefact. Original note follows.
  **`IngestResult[]` → `Array<{status: string; eventId: string|null} & Record<string, unknown>>`
  assignability was UNVERIFIED.** Turns on implicit index signatures (type aliases get them, interfaces
  do not). T13's tests all pass `vi.fn()`, so they cannot detect a failure here. Being probed with real
  `tsc`, not by reading types.

---

## MECHANICS FOR THIS LANE

- Toolchain: `export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH"` in every shell invocation.
- **app-core tests may run UNLOCKED** (`--maxWorkers=2`) — they include no `apps/server`.
- **Any run that includes `apps/server` takes the machine-wide gate lock** (T14/T15 will take it often):
  `until mkdir /tmp/gisik-gate.lock 2>/dev/null; do p=$(cat /tmp/gisik-gate.lock/pid 2>/dev/null); [ -n "$p" ] && ! kill -0 $p 2>/dev/null && rm -rf /tmp/gisik-gate.lock; sleep 15; done; echo $$ > /tmp/gisik-gate.lock/pid; trap 'rm -rf /tmp/gisik-gate.lock' EXIT`
- **Never pipe a test run into `head`** — it orphans the whole vitest worker pool at `ppid=1`. Redirect
  to a file and `head` the file. Reap `pgrep -f vitest` survivors after any suspiciously fast return.
- **Build `domain` before running app-core tests.** A fresh `pnpm install --frozen-lockfile` does not
  build, and `@gisik-nokma/domain` resolves through `./dist` — a bare `vitest` run would read a stale or
  missing dist and fail in a way that looks like a config problem.
- Collisions this lane must respect: `packages/app-core/src/index.ts` (Lane A's closure 3 also touches
  it — whoever lands second rebases) · `apps/server/package.json` at T14 (Lane E) · `Features.md` /
  `test-cases/12` (append only in Plan 10's section).
- Never edit `docs/lanes/task-ledger.tsv`. Never merge this lane's own PR. Never commit to `main`.
