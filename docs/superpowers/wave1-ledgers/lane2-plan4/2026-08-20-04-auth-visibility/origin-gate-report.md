# Envelope-origin gate — execution report

Branch `exec/04-envelope-origin-gate`, cut from `main` = `51aba55`.

## Terminology

**envelope-origin** = the event envelope's `origin` field, the provenance enum
`'web' | 'mobile' | 'desktop' | 'server'`. This report, the module, its comments and its tests are about
that field alone. It is **not** the browser `Origin` header; nothing here concerns CSRF or cross-site
navigation. The repo now uses "origin check" for both, in the same document, which is why every name is
spelled out.

## What was built

**`apps/server/src/permissions/check-permission.ts`** (new) — `checkPermission(env: EventEnvelope): Refusal | null`.
One branch: envelope-origin `'server'` is refused with rule `permission.role` and reason
`Only the server itself may record server-origin events.` — character for character as Task 5's plan text
pins them, exported as `SERVER_ORIGIN_RULE` / `SERVER_ORIGIN_REASON` so a rename cannot half-land. Also
exports `type SubmissionGate = (env: EventEnvelope) => Refusal | null`, so Task 5 can widen the signature
to carry a session without every call site changing shape.

The docblock **enumerates the absences** rather than labelling the module partial, as the coordination
ruling asks: no actor-identity check (the client door carries no session yet, so `actorId` is compared to
nothing), no role check, no membership check, no visibility check. It also carries the
envelope-origin/HTTP-Origin disambiguation and a "do not fold this into `IngestDeps.gates`" note —
decision 15's gates are construction-time and unconditional, so they cannot distinguish doors.

**`apps/server/src/ingest/ingest-service.ts`** — `IngestService` gains a second entry point.
`ingestBatch` is the INTERNAL, trusted, ungated door; `ingestClientBatch` is the CLIENT door and passes
`checkPermission` through. Both are one private `ingestAll(rawEvents, gate)` loop. `commitOne` takes
`gate: SubmissionGate | null` and applies it **between the entity↔workspace guard and `deps.evaluate`** —
the exact position the 2026-08-31 controller ruling names.

**`apps/server/src/routes/events.ts`** — `POST /v1/events` now calls `ingestClientBatch`.

**`apps/server/test/app.test.ts`** — the fake `IngestService` grows `ingestClientBatch`.

### Why not a blanket refusal in `commitOne`

Checked before writing, as instructed. `packages/domain/src/testing.ts` defaults envelopes to
`origin: 'server'`, and four server test files call `ingestBatch` directly. More importantly than the
tests: the server's own future appends are legitimately server-origin — Task 5's workspace bootstrap and
Task 14's invite acceptance append internally, and T5's brief protects exactly that. The distinguishing
fact is not the value of `origin` but **which door the event arrived through**, so the door became a named
entry point. The ruling's placement is still satisfied: the check runs inside the ingest transaction,
which decision 15 requires so a sync-path refusal can become a `claim.contested` with no extra wiring.

## Which doors are closed, and which are not

| Door | State | Why |
|---|---|---|
| `POST /v1/events` | **CLOSED** | Calls `ingestClientBatch`. Verified by running the forgery through the assembled app, not by reading the route. |
| Direct `ingestBatch` | **OPEN, by design** | The internal append path. Gating it would refuse the founding sequence and Task 14's invite acceptance. |
| `POST /v1/sync` | **OPEN — does not exist yet** (Plan 10) | When built it **must call `ingestClientBatch`**. Recorded in the coordination doc, because a Plan 10 author reaching for the obvious `ingestBatch` would reopen the window for every offline-originated event. |
| §11 envelope coherence | **OPEN, unchanged** (Plan 10 T4) | Nothing binds a contest's embedded original event to the outer envelope. The compound defect is closed at the `origin` end only. |

**Task 5 completes the gate** — actor identity, role, membership; Task 9 adds visibility. Task 4 comes
first, for `resolveEffectiveRole`.

## Falsifiability evidence

### The window was observed open, not inferred

The test was written and run **at `51aba55` before any implementation**. The forged `claim.contested`
submitted over `POST /v1/events` answered:

```
AssertionError: expected { status: 'committed', …(3) } to match object { status: 'refused', …(2) }
-   "rule": "permission.role",
-   "status": "refused",
+   "status": "committed",
```

and `SELECT count(*) FROM events WHERE id = $1` answered `1` where the test expected `0`
(`expected 1 to be +0`). A permanent, un-deletable ledger row, written by a client wearing the server's
provenance. `Tests 3 failed | 2 passed (5)`.

### Mutation 1 — the refusal (break the comparison)

`env.origin === 'server'` → `env.origin === 'desktop'` in `check-permission.ts`:

```
× refuses a client-submitted server-origin event with the exact rule and reason   → :123
× commits nothing for the refused forgery — the append-only ledger never sees it  → :135
× refuses only the forgery in a batch, and keeps results index-aligned            → :152
✓ still admits an ordinary client submission through the same door
✓ commits a server-origin claim.contested appended internally
Tests  3 failed | 2 passed (5)
```

Each failure lands at its own assertion line, not in setup. Restored, and the restore verified by reading
the region back (`if (env.origin === 'server')`) — not by a shell `diff`.

### Mutation 2 — the negative (gate the internal door)

`ingestBatch` passed `checkPermission` instead of `null`:

```
✓ (all four client-door cases pass)
× commits a server-origin claim.contested appended internally                     → :189
AssertionError: expected { status: 'refused', …(3) } to match object { status: 'committed', …(1) }
Tests  1 failed | 4 passed (5)
```

This is the mutation that proves the negative test discriminates **doors** rather than merely observing
that something commits. Without it, a suite proving only that the refusal fires would pass equally had the
legitimate server path been broken. Restored and read back
(`async ingestBatch(rawEvents) { return ingestAll(rawEvents, null); }`).

### Why `claim.contested` is the probe in both directions

It is the sharpest available: `contest.server-only` **requires** envelope-origin `'server'`, so the
internal-door case can only commit if the internal path leaves `origin` alone AND the engine sees it. The
same event is the forgery at the client door and the legitimate append at the internal one — one fixture,
both directions.

### The forgery's outer envelope is honest

`forgedContest()` files a real ticket under its own workspace, so `ENTITY_WORKSPACE_MISMATCH_RULE` has
nothing to catch — it compares the OUTER envelope, which in this forgery is truthful. The lie lives in
`payload.originalEvent`, attributing a fabricated `ticket.transitioned` to a victim actor in a different
workspace. That is the §11 forgery as the coordination doc describes it, and it is why that guard is not
a mitigation.

## Verification command and output

```
$ export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH"
$ pnpm turbo run build test typecheck

 Tasks:    18 successful, 18 total
Cached:    6 cached, 18 total
  Time:    7.955s
```

Server suite, assertion-level (`pnpm test` collapses to PASS/FAIL counts):

```
$ cd apps/server && node ./node_modules/vitest/vitest.mjs run test/permissions/check-permission.test.ts
 ✓ test/permissions/check-permission.test.ts (5 tests) 325ms
 Test Files  1 passed (1)
      Tests  5 passed (5)
```

Full server suite: `Test Files 21 passed (21)`, `Tests 141 passed (141)`.

## Catalogue

`Features.md` gains the **Envelope-origin gate (partial permission gate)** sub-bullet under Event ingest
API, and the parent bullet's pipeline description now names the entity↔workspace guard and the permission
gate. `test-cases/03-foundation-ledger.md` gains case **3.31** ✅. The coordination doc gains
**"Plan 4 execution consequences" §8**, in the same commit.

---

# Fix round 1

Three items from the coordinator. Spec ✅ and the design ("ship it") were unchanged; two of the three are
about evidence and compile-time reach rather than about the gate's behaviour.

## 1. The evidence hole on the admits side — closed

**The finding.** The reviewer replaced `=== 'server'` with `!== 'web'` and **all 141 server tests stayed
green.**

> *Corrected in fix round 2:* the first version of this line said **143**, which is the count AFTER
> this round's two new cases. The suite the mutant survived was **141** — quoting the post-fix number
> overstated the net by exactly the two tests that close the hole. Same count-drift class as the one
> corrected in T2.
 Under that mutant an ordinary `POST /v1/events` carrying `origin: 'mobile'` is refused
`permission.role`, and nothing in the repository notices. The gate was correct; the *evidence* was
one-sided — the refusal direction well pinned, the admits direction pinned for one of three values.

**The fix.** `check-permission.test.ts`'s admits case is now `it.each(CLIENT_ORIGINS)`, where

```ts
const CLIENT_ORIGINS: Origin[] = ORIGINS.filter((origin) => origin !== 'server');
```

is **derived from the domain's own `ORIGINS`, not re-spelled**. That is the repository's recorded rule —
where a format has one authority, tests assert through the authority — and it means a fifth origin member
is covered the day it is added rather than the day somebody remembers this file.

**Proven, not asserted.** With the `!== 'web'` mutant applied:

```
✓ still admits an ordinary web-origin client submission through the same door
× still admits an ordinary mobile-origin client submission through the same door    → :208
× still admits an ordinary desktop-origin client submission through the same door   → :208
AssertionError: expected { status: 'refused', …(3) } to match object { status: 'committed', …(1) }
Tests  2 failed | 5 passed (7)
```

The same mutant reddened **nothing** before this change. Restored; the restore verified by reading the
function body back AND by `git diff --stat HEAD -- apps/server/src/permissions/check-permission.ts`
returning empty.

## 2. The wrong door is now a compile error, not a documented mistake

**The finding.** The naming asymmetry is adverse: **the dangerous door has the shorter, more obvious
name.** `ingestBatch` is what a route author reaches for by reflex, and for Plan 10's `POST /v1/sync` that
reflex silently ungates every offline-originated event in the product. Today's route is structurally
pinned by tests; Plan 10's cannot be guarded by a test that does not exist yet, so the defence there was
prose spanning three plans and a wave boundary.

**The fix.** `ingest-service.ts` exports

```ts
export type ClientIngest = Pick<IngestService, 'ingestClientBatch' | 'onEventCommitted'>;
```

`registerEventRoutes` takes `ClientIngest`, and `AppDeps.ingest` is narrowed to it as well, so the
internal door is not in scope anywhere inside an assembled HTTP app. `ingestBatch` stays on
`IngestService` for the callers that legitimately use it — the workspace bootstrap (Task 5), invite
acceptance (Task 14), Plan 11's seed CLIs, and tests. A full `IngestService` is still what callers pass;
it is assignable.

**The narrowing is self-enforcing**, which matters because a `Pick` is exactly the kind of thing a later
author "simplifies" back. `check-permission.test.ts` carries:

```ts
// @ts-expect-error — a route may not reach the ungated internal append path
type _RoutesCannotReachTheInternalDoor = ClientIngest['ingestBatch'];
```

**Proven falsifiable.** Widening `ClientIngest` to `IngestService`:

```
test/permissions/check-permission.test.ts(53,1): error TS2578: Unused '@ts-expect-error' directive.
 Tasks:    8 successful, 9 total
```

Typecheck goes red at the guard's own line. Restored, and the restore read back.

This closes at compile time the risk the first round could only record in prose. **Coordination §8's
sentence still stands and is still the instruction** — `/v1/sync` must call `ingestClientBatch` — but a
Plan 10 author who ignores it now fails to compile rather than shipping an ungated door.

## 3. Case 3.31 stays in `test-cases/03` — with the relocation pointer

The reviewer confirmed the filing is **correct, not misfiled**: `test-cases/` mirrors Features.md's
sections, the gate bullet belongs under §3's Event ingest API, and Features.md has no §6 yet — minting
bucket 06 early would break the mirror. Precedent at **`Features.md:27`** (`docToPlainText`, landed in
§3 "pending Plan 5's own catalogue task, which may relocate this bullet to §7").

> *Corrected in fix round 2:* the first version cited ``:25``/``:27``. Only **`:27`** carries a
> relocation note. Read off disk: `:24` is **Client envelope builder**, `:25` is **IST day boundaries**,
> and neither carries one.
 The sub-bullet now carries the same
relocation note, so whoever creates §6 finds a pointer instead of a puzzle. Case 3.31's text was widened
to record the parameterised origins and the compile-time guard.

## Note on the TDD-ordering claim

The reviewer could not verify that the test was written and run red at `51aba55` before implementation —
no artifact proves the ordering, and it reproduced equivalent red evidence on today's tree instead. That
is fair, and worth stating plainly: **TDD ordering claims are unverifiable after the fact unless the red
run is captured.** The red output quoted in the first half of this report is a faithful transcript of the
run I made, but the report is the only witness to *when* I made it; the mutation evidence, which is
reproducible on demand from the committed tree, is the part that carries weight.

## Verification

```
$ pnpm turbo run build test typecheck --force

 Tasks:    18 successful, 18 total
Cached:    0 cached, 18 total
  Time:    9.803s
```

`check-permission.test.ts`: **7 passed (7)** — up from 5, the two new cases being the mobile and desktop
admits. Full server suite green.

---

# Fix round 2

One line of code plus two corrections to this report.

## The guard covered one of its two axes

**The finding.** The `@ts-expect-error` on `ClientIngest['ingestBatch']` protects what the ALIAS means.
It says nothing about whether `AppDeps` still BINDS to that alias. Widening only `AppDeps.ingest` back to
`IngestService`, leaving `ClientIngest` narrow, **typechecks green** — the directive is still satisfied
and notices nothing. Under that widening a Plan 10 registrar typed `(app, i: IngestService)` also
compiles green, which is exactly the scenario the narrowing exists to stop.

A guard whose docblock says "self-enforcing" while covering half of what it guards is an overclaim, and
on this branch overclaims have been wrong four times out of five whenever somebody actually ran them.
This one was too.

**The fix**, one line beside the first:

```ts
// @ts-expect-error — AppDeps.ingest must stay narrowed; see ClientIngest above.
type _AppDepsIngestIsNarrowed = AppDeps['ingest']['ingestBatch'];
```

**Three probes, each axis separately, and the gap itself reproduced.**

| # | Mutation | Result |
|---|---|---|
| **A** | Widen `ClientIngest` alias (both guards present) | **RED** — `TS2578` at **both** `:69` and `:71`; 8/9 tasks |
| **B** | Widen `AppDeps.ingest` **only** (both guards present) | **RED** — `TS2578` at `:71` **alone**; 8/9 tasks |
| **C** | Widen `AppDeps.ingest` **only**, second guard **removed** | **GREEN — 9/9 tasks.** The gap, reproduced exactly as reported |

Probe B is the one that matters: the new guard fires alone on the axis the old one could not see. Probe C
is the control proving the axis was genuinely unguarded before, rather than merely under-documented — with
the alias guard by itself, the whole typecheck passes while the protection is gone.

All three restored, and every restored line **read back individually** rather than through a rendered
diff: `export type ClientIngest = Pick<IngestService, 'ingestClientBatch' | 'onEventCommitted'>;`
(`ingest-service.ts:94`), `ingest: ClientIngest;` (`app.ts:29`), and both directives at
`check-permission.test.ts:69-72`. `git status --porcelain` then showed a single modified file — the test,
which is the only file this round intends to change.

## Known limit of the mechanism, recorded rather than fixed

`@ts-expect-error` is satisfied by the expression erroring for **any** reason, so renaming `ingestBatch`
on `IngestService` would leave both directives green while the protection lapsed. Inherent to the
mechanism; it is now stated in the guard's own docblock so a reader meets it where the guard lives, not
only here.

## Two corrections to this report

Both were wrong claims in the fix-round-1 text, corrected in place above with a marked note rather than
silently overwritten, since the report is the artifact a later reader trusts:

1. **Test count.** "all **143** server tests stayed green" under the pre-fix mutant — 143 is the
   *post*-fix count. The suite the mutant survived was **141**; the two new cases are the difference.
   Quoting the post-fix number overstated the net by exactly the two tests that close the hole.
2. **Relocation precedent.** Cited as `Features.md:25`/`:27`; only **`:27`** carries a relocation note.
   Read off disk rather than relayed: `:24` is **Client envelope builder**, `:25` is **IST day
   boundaries**, and neither carries one.

## Verification

```
$ pnpm turbo run build test typecheck --force

 Tasks:    18 successful, 18 total
Cached:    0 cached, 18 total
  Time:    9.564s
```

`check-permission.test.ts`: 7 passed. Full server suite: 143 passed (21 files). No code behaviour changed
this round — the only source edit is the added type-level guard, which emits nothing.
