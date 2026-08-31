# Serial executor — live state

**This file is the restart surface.** A controller that kills and relaunches the executor from its
brief recovers only what is written here. Refreshed at every task boundary.

> **Warning about shas in narrative prose.** Every sha cited in any *narrative* document in this
> repo — the dispatch brief, the Chain B handoff, the coordination doc's sections, the narrative
> parts of this file — is a fact about the moment it was written. Anchors in the table below were
> verified with `git branch --contains` (empty output = orphaned), never with `git cat-file`, which
> passes on reflog-only commits and hands you pre-rebase content while looking like it worked.

## Live anchors — 2026-08-31, rewritten after the step-4 recon was found WRONG

**The previous version of this file told a restarted executor to rebase `exec/04-auth-visibility` and
called it "the largest rebase left in the series." That instruction was live and wrong. Do not do it.**
The branch is **fully redundant**: all four of its commits are already on `main` under different shas,
and `git cherry -v origin/main origin/exec/04-auth-visibility` prints `-` (already upstream) for every
one of them. There is no rebase in step 4.

| Anchor | Value | How verified |
|---|---|---|
| Branch in flight | **`exec/04-t4-t5-permissions`**, cut from `origin/main` at `91df593`. **T4 is committed at `c0e3fe0`** (2 commits ahead: handoff + T4). No PR yet — step 4 opens one PR after T5 | `git log`, `git rev-parse` |
| `main` | **`91df593`** (PR #48, docs-only). Moved from `452baa6` mid-session — refetch before trusting any main sha in this file | `git log origin/main --oneline -4` |
| `exec/04-auth-visibility` | **REDUNDANT — safe to delete.** Its 4 commits landed on main as `31df85b`, `24fba16`, `8c4216a`, `51aba55` | `git cherry -v` → 4 × `-` |
| Node | **v22.22.2** under the brief's PATH export. Machine default is **v24.11.1**, outside `>=22 <23`, enforced by nothing | `node -v` |
| Orphaned, do not cite | `52520b0`, `72a7e3e`, `30e3db4`, and every pre-squash sha of the Phase 0 branches | `git branch --contains`, empty = orphaned |

## THE RULE THIS COST US, and it generalises to every remaining rebase

**`git cherry` belongs BEFORE the pre-rebase gate rule fires. An ahead-count is not a work-count.**

`git rev-list --left-right --count` measures **commit identity**; `git merge-tree` measures **a merge**.
Neither asks the only question that matters — *is this content already upstream?* A branch whose commits
were rebase-merged keeps its own shas, so it reports "4 ahead" forever while contributing nothing. The
previous recon read `30 / 4` plus two real conflicts and concluded there was a large rebase to perform.
Both readings were accurate; the conclusion was false.

**The cheapest way to make a rebase gate unnecessary is discovering there is no rebase.** For every
remaining branch in the serial order, run `git cherry -v origin/main <branch>` FIRST. `-` on every line
means delete the branch and start from main.

**Cost of learning it late:** a pre-rebase gate was run at `5c71689` per the coordination doc's rule —
**green, 15/15 tasks, exit 0, 488 tests, Node v22.22.2**. It is recorded here as a footnote only. It
measured a tree strictly *behind* main and is **a control for nothing**. Do not place 488 beside any
main-derived total: they are different trees, and a total that rises without decomposing is exactly what
the coordination doc warns against.

## Gate composition — recounted at the sha being reported, `c0e3fe0` (T4 landed)

**Status: GREEN.** `pnpm turbo run build test typecheck --force`, redirected to a file, **never piped**
— a piped gate reports the pipe's exit code, and this repo has already seen `| tail` return 0 over a
failed turbo run. The general rule is broader: **ANY command after the gate in the same chain becomes
the status you are shown**, a bare `echo` included. The summary line is the only honest signal.

| Measure | `main @ 91df593` (baseline) | `c0e3fe0` (T4) |
|---|---|---|
| **Node** | **v22.22.2** | **v22.22.2** |
| Gate exit code | **0** | **0** |
| Turbo tasks | **21 of 21**, 0 cached | **21 of 21**, 0 cached |
| **Tests** | **936** | **960** |
| domain | 274 | 274 |
| rule-engine | 278 | 278 |
| **server** | 143 | **167** |
| app-core | 130 | 130 |
| editor | 72 | 72 |
| sync-client | 8 | 8 |
| ui | 31 | 31 |

**The delta decomposes, which is the only thing that makes it checkable:** +24, entirely in `server`
(143 → 167) = **12** (`proj-memberships.test.ts`) + **11** (`effective-role.test.ts`) + **1** (the new
DB-free `tables` pin added to `projection-order.test.ts`). Every other package is unchanged, as it must
be — T4 touches only `apps/server`. A total that only rises tells you nothing; one that decomposes into
named, expected parts is checkable by the next reader.

**Both figures measured under Node v22.22.2**, stated because each worktree carries its own
`node_modules` and a native binding matches whichever Node last rebuilt it — two sessions can certify
the same commit under different Node majors and both report green.

**Do not carry forward 853, or 631/658, or the 488** from the abandoned branch's pre-rebase gate.
Different trees; the 488 in particular is a control for nothing.

## What was verified about step 4's surface, so the next session does not re-pay for it

| Claim | Finding | How |
|---|---|---|
| Coordination-doc conflict would lose content | **FALSE — nothing to re-append.** The branch's 154-line §7 block is **byte-identical** on main. The one-line diff seen initially was the extraction picking up main's *next* heading (`### 8. The envelope-origin gate has landed`) | `git diff --no-index` over both extracted blocks |
| `app.ts` conflict would lose content | **FALSE.** Main's `app.ts` is a strict superset — it has the branch's `auth: Auth` block *and* the `ingest: ClientIngest` narrowing the branch lacks | read both blobs |
| T5 is unstarted | **PARTLY FALSE.** T5's **first branch already landed on main** via `fc904f4`: `checkPermission`, `SERVER_ORIGIN_RULE`, `SERVER_ORIGIN_REASON`, and the `SubmissionGate` type — which its own comment says was "named as a type so Task 5 can widen it to carry the session (`(env, session)`) without every call site changing shape." **T5 WIDENS; it does not create.** | read `apps/server/src/permissions/check-permission.ts` on main |
| T4 is unstarted | **TRUE.** `proj_memberships` appears on main only in doc comments — `registry.ts`, `engine-context.ts`, plan text. No implementation file, and `buildProjectionRegistry` registers exactly two projections | `git grep`, read `projections/index.ts` |
| CSRF anchor line | **`sign-in-flows.test.ts:148` on `main @ 91df593`**, content confirmed: `expect(attributes).toEqual(['Max-Age=604800', 'Path=/', 'HttpOnly', 'SameSite=Lax']);` — re-verified on main, not merely on the stale branch, because T5 item 3 anchors a sentence to a line and line numbers drift across a rebase-merge | `awk` over the blob at `origin/main` |
| `docs/` affects the gate | **NO.** `turbo.json` declares no `inputs`, and `docs/` sits outside every package, so a docs-only merge cannot move gate composition. **PRs #48 and #49 were both docs-only** — do not re-run a gate to "check" them | read `turbo.json` |

## Where I am in the serial sequence

**PHASE 0 COMPLETE.** Step 1 (`6b2fc76`, #38) · step 2 (`c93c910`, #43) · step 3 (`a3746fb`, #47).

**STEP 4 IN PROGRESS on `exec/04-t4-t5-permissions`. T4 IS DONE AND COMMITTED (`c0e3fe0`), GATE GREEN.
T5 IS NEXT AND NOTHING IS IN FLIGHT.** One PR opens after T5, not after T4.

### T4 — done. What it landed, and the plan-text defect it had to refuse

`proj_memberships` (+ migration), `resolveEffectiveRole`, the order pins, a fixture helper.
**Reviewed with ZERO findings**, by a reviewer that re-ran three of the nine mutations itself rather
than reading the report.

**The plan text's `membership.revoked` handler could not land as written, and this is the reusable
part.** It says to delete every row for that user, project rows included. But `membership.granted`/
`revoked` are filed against the **membership** entity and `project.member_added`/`removed` against the
**project** entity, and `readLedger` replays in `(entity_kind, entity_id, seq)` order — so a rebuild
applies every membership event before any roster event. Arrival `grant → member_added → revoked` leaves
`{}` live and `{project row}` on rebuild. `diffTable` uses `EXCEPT`, so **`verify-projections` would
have reported drift on a table nobody had corrupted.** `registry.ts` states the binding rule verbatim —
*table contents must be a pure function of the ledger's rows, never of cross-entity arrival
interleaving* — and **where the plan text and `registry.ts` disagree, `registry.ts` wins.**

What landed instead is **disjoint key ownership**: one totally-ordered writer per key, so no
interleaving can change the final set. The safety property the plan wanted moved to
`resolveEffectiveRole` (no workspace row ⇒ no projects), which is a *stronger* placement — it also
covers the roster row a legitimate rebuild leaves standing, which a table-level delete could not.

**`index.ts`'s "every new registrant appends" comment is corrected to "inserts at its §8 position."**
Appending is right today only because the three projections sorting before `proj_memberships` do not
exist yet. **Plan 3 Chain B — step 8 — adds them and MUST INSERT.**

### Carried out of T4 with named owners — recorded, deliberately not fixed

1. **RULING P18 (coordination doc): `proj_memberships` has landed and nothing reads it through the
   engine.** `engine-context.ts`'s `getEntityState('membership')` still returns `null`, and **no task in
   Plan 4 owns the wiring** — established by two sweeps with positive controls, one for the identifier
   (`getEntityState` → 1 hit, in *Task 3*; control `proj_memberships` → 32) and one for the **capability
   in prose** across Tasks 6–14 (no hit; control: 4 hits in Tasks 1–5).
   **It fails CLOSED** — `restrict-to` refuses when membership is null, and that case has its own
   fixture — so it is a **functionality gap, not a forgery window**. Report it that way or it provokes a
   mis-sequencing ruling.
   **It is reachable, not dormant.** T4's own implementation report claimed "the engine has no caller
   today"; that is **false**, and the ruling corrects it. Enumerating every call site in
   `packages/rule-engine/src` finds two in production reading *different kinds*: `transition.ts:41`
   (`'ticket'`) and **`restrict-to.ts:25` (`'membership'`)**, dispatched from `rules/index.ts:34`.
   The adapter is *trivial* — `resolveEffectiveRole(db, userId, workspaceId)` is **scopeless**, exactly
   the pair `membershipId()` encodes — and it was still not done, because it flips rule-evaluation
   outcomes and would ship unreviewed inside a reviewed diff.
   **Owner: whoever dispatches Plan 4 Task 6 or the step-10 integration checkpoint, whichever is first.**
2. **`entity-heads.test.ts` holds a SECOND, undocumented registration pin** the plan's Files list does
   not name — so T4 came back red on a file the plan never mentions. Updated, and it now points at
   `projection-order.test.ts` as the pin of record. **The duplicate sits in a DB-backed file, so it goes
   quiet exactly when Postgres is down** — which is what the DB-free pin exists to prevent.
   *Owner: Plan 3 Chain B, which is the next registrant and hits this first.*
3. **`verify-projections.test.ts` now asserts "clean" over a projection it never populates** — it seeds
   only `workspace.created` and `workflow.defined`, so `proj_memberships` diffs empty-against-empty.
   Not a correctness gap (T4's own fence test covers the real property). *Owner: whoever next extends
   that seed.*
4. **A fourth RENAMED entry, and it is the implementer's own:** the export is **`membershipsProjection`**
   (repo convention), not the plan text's `projMemberships`. **T5's plan-text code imports the old name
   and must apply this rename**, alongside the three the adaptation map found.

### T5 — floor-list. Opus implementer AND opus reviewer

**The adaptation map's corrections, which are the difference between T5 working and T5 inventing files:**

| Plan text says | Reality on `main` |
|---|---|
| Modify `apps/server/src/ingest/pipeline.ts` | **No such file.** It is `ingest/ingest-service.ts` |
| `import type { Refusal } from '@gisik-nokma/domain'` | **Not exported there.** `Refusal` lives in `@gisik-nokma/rule-engine`. **Coordination doc §10 already ruled this**: *"Plan 4's executor takes the import origin from the shipped code, not from the plan text"* |
| Create `packages/domain/src/workflows/simple-kanban.ts` | **No `workflows/` directory.** Flat: `src/simple-kanban.ts`, importing `./workflow.js` and `./validate-workflow.js` |
| `projMemberships` | **`membershipsProjection`** (see above) |

**The insertion point is not a linear insert.** `ingest-service.ts` already anticipates the widening —
two doors (`ingestBatch` ungated / `ingestClientBatch` gated), a `SubmissionGate` threaded through
`commitOne`, and a comment at lines 63–72 saying Task 5 widens the signature to carry the session. The
real shape is: widen `SubmissionGate` to async carrying `sessionUserId`, thread it through
`ingestClientBatch`, and `await` the `gate(envelope, …)` call inside `commitOne` (~line 180).

**Widening `SubmissionGate` is a breaking signature change → RULING P17 IS THE PRECEDENT:** it owes a
sweep of call sites **in the plan text**, not only in code. Note `test/permissions/check-permission.test.ts`
(249 lines, on main) exercises the old sync signature end-to-end and will need updating.

**The three CSRF items, and the sentence that unites them.** HTTP-Origin on cookie-authenticated product
requests · `sameSite` set **explicitly** (check the config, not the emitted header — observed output is
not a setting) · a sentence at **`apps/server/test/auth/sign-in-flows.test.ts:148`**, verified at that
line on `main`. **All three are already true, and all three are true for the wrong reason.** `Domain` is
forbidden by the exactness of a `toEqual` nobody chose for that purpose; `SameSite=Lax` is a library
default, not a decision. A property that holds by accident holds until someone tidies it — a `toEqual`
relaxed to `toContain`, a default that moves in a library upgrade — and nothing says a security property
just changed. **T5 converts accident into intent**: pinned, so the next edit that would undo it fails
loudly instead of succeeding quietly. A `Domain=.artsourced.in` would send the session cookie to every
subdomain of the zone.

**THE NAMING TRAP.** HTTP `Origin` **header** (CSRF) vs event-envelope `origin` **field** (provenance
enum) are unrelated and meet in T5. Say **HTTP-Origin** or **envelope-origin** everywhere.
`check-permission.ts` on main already models this, and main carries a coordination-doc section
*"The envelope-origin gate has landed"* which is about the **field**, not the header.

### Features.md §6 / test-cases 06 — the brief and the plan text DISAGREE, and the plan text wins

The dispatch brief says step 4 owns `Features.md` §6 and `test-cases/06-auth-visibility.md` in the same
change set. **Plan 4's own text does not put them in T4 or T5.** Enumerated: its Features.md steps sit at
lines **4922, 4936, 5131, 5260** — inside Tasks 12/13/14, far past T5 (which ends at 2386). T5 has **no**
Features.md step of its own. Per the precedence rule (*the document wins except on model/effort policy*),
**§6 lands with Plan 4's later tasks — step 7 of the sequence, not step 4.** T4 correctly left both
untouched and the reviewer confirmed it. Recorded so the next session does not "fix" a false omission.
**§6 is a *section* number; the never-renumber rule applies to case numbers, not section numbers.**

## What step 2 actually contained

T9 was the one task on this branch that had passed none of implementer → reviewer → fix → re-review.
It has now passed all four.

1. **Rebased** onto `55ae0a1`, resolving the `Features.md` conflict (above).
2. **F1–F4 fixed** (`c240c53`): the TZ restore that assigned the string `"undefined"`; `useBoard`
   never refetching on a `projectId` change; the views-never-speak-HTTP guard that tested a prefix and
   read one import spelling of four; the `Features.md` merge conflict.
3. **Eight mutations** run against the fix round. Seven died naming their own site. **The eighth
   survived** — F1's own pinning test read `process.env.TZ` *after* the three tests above it had
   corrupted it, so it was asserting that `"undefined"` had been faithfully restored to `"undefined"`.
   Rewritten to set both configurations; now dies under ambient TZ and under `TZ=Pacific/Niue`
   (`10a314e`).
4. **Scoped re-review** — triggered by the ruling's own criterion, since the fix round changed a public
   signature and widened four scanner claims. Three read-only lenses (1 opus, 2 sonnet; cap 6).
   Response in `439da6c`. Full disposition of all twelve findings:
   `docs/lanes/plan-6a-t9-review.md`.

## Open items for the controller — read before merging

- **The re-review's one Critical is REFUTED, and the PR body carries the experiment chain.** It claimed
  `provenance.test.ts`'s naive TZ restore leaks across files and reddens the suite. It does not: the
  failure reproduces on `main` with that file **alone**, and `forks`+`singleFork` — all seven files in
  one process, sequentially, the sharing hypothesis' own maximal configuration — is **92/92 green**.
  The variable is the vitest **pool**, not the sharing. Do not re-panic at the word "Critical" in the
  workflow output without the refutation beside it.
- **What that investigation found instead is in this branch and is fixed here:** T9's three zone tests
  were **32/32 green under `--pool=threads`** while the zone never moved, because a worker thread does
  not get the process-level clock reconfiguration. An anti-vacuity probe is now in `board.test.tsx`;
  under `threads` the file is 33 passed / 1 failed naming its own line, and under the gate's pool
  130/130. **Ruling recorded in the coordination doc** — it generalises to Plan 9's Calendar and
  Timeline.
- **`useLiveQuery`'s signature changed** and eight call sites in Plan 6's own plan text are now wrong.
  **Ruling P17**, coordination doc. Binding on Plans 6 T10–T13 and Plan 10.
- **Recorded, not fixed, with named owners:** F6, F7, F8, F9, F10 from the original review;
  `provenance.test.ts:104,130`'s naive restore (owner Plan 6a); the one-committed-render window that
  F2's fix shortens but does not remove (owner Plan 6 T7/T8, with the design that closes it together
  with F6 written up beside it); `packages/app-core` still has no owning `test-cases/` file (owner
  Plan 6a, carried forward — nothing in `test-cases/` went stale from these fixes).
- **Auto-merge eligibility is the controller's call.** The PR is offered as a review ledger with the
  fixes-applied and recorded-with-owner split stated explicitly.

## RECORDED, owner Plan 11 (infra) — the Node version is declared and enforced by nothing

Raised by the controller after it cost a round, then verified here rather than adopted:

| Fact | Evidence |
|---|---|
| `package.json` declares `"engines": { "node": ">=22.0.0 <23" }` | read at `c93c910` |
| CI pins `node-version: 22` | `.github/workflows/ci.yml:62` |
| This machine's default `node` is **v24.11.1** — outside that range | `node -v` with no PATH export |
| **Nothing pins a shell** | `.nvmrc`, `.node-version`, `.tool-versions` all **ABSENT** |
| **Nothing enforces the declaration either** | no `.npmrc`, so `engine-strict` is off by default. Tested: under v24.11.1, `pnpm exec node -v` and `pnpm run` both **succeed with no refusal and not even a warning**. Control: the same commands under v22.22.2 behave identically, so the silence is not a broken probe. |

**Why this is the same class as the TZ finding, and worse.** Each worktree carries its own
`node_modules`, and a native binding (`better-sqlite3@11.10.0`) matches whichever Node last rebuilt
it. So **two sessions can certify the same commit under different Node majors and both report
green**, with nothing in either report saying which. The controller met the loud half — a *false red*
at `@gisik-nokma/sync-client#test`, ABI 137 runtime against an ABI 127 binding. The quiet half is a
**false green**, and this repo has no way to notice it.

**A gate result is not evidence unless it names its Node.** This file now does.

**The fix is not mine to make and is named so it is not lost:** an `.nvmrc` (or `.node-version`)
pinning 22, and `engine-strict=true` in `.npmrc` so an unsupported Node is a loud refusal rather than
a silent success — *prefer the check whose failure is loud* applied to the toolchain itself. Not done
here: it is Plan 11's infra surface, `engine-strict` needs a CI run to prove it does not break the
pipeline, and it does not belong in a doc-only PR. The controller's PR #44 already carries the Node
finding and is the natural home.

**Rebuilding a stale binding takes `nvm use 22 && pnpm rebuild better-sqlite3`** — the bare rebuild
compiles against whatever Node the shell has, which on this machine's default is 24, i.e. it
reproduces the problem while looking like the cure.

## Method notes earned here — cheap to re-learn, expensive to rediscover

- **`process.env.TZ` assignment does nothing inside a worker thread.** Verified with `new Worker(...)`:
  two zones render the same instant identically there and differently on the main thread. Vitest's
  `forks` default hides this; `--pool=threads` exposes it. **A test that varies an ambient setting must
  also assert that varying it does something** — the brief's "vary `TZ` explicitly" is necessary and
  not sufficient.
- **`delete process.env.TZ` DOES restore the machine zone** (probed both ways: the naive restore lands
  on GMT+0000, the delete lands back on GMT+0530 with the key genuinely absent). This machine is
  Asia/Kolkata with TZ unset — confirmed by probe, contradicting an earlier session note that called it
  UTC.
- **A mutation harness that restores with `git checkout -- <file>` restores to the last COMMIT.** An
  uncommitted fix was silently reverted by the very run confirming it, while the harness printed
  `restore-clean = True` — true of the commit, false of the work. Only a `git commit` that reported
  "nothing to commit" caught it. **Commit before mutating, or the restore is a revert.**
- **A finding whose mechanism is refuted is not therefore worthless.** Refute the mechanism, then ask
  what the observation was actually evidence of.
- **A read-only lens that names its mutation precisely and hands it back works.** One Important here
  was a prediction the lens could not execute; running it took two seconds and confirmed it. Prefer
  that shape over granting a fan-out write access to a shared tree.
- **Hold the tree still while a fan-out reads it.** All doc edits here were deferred until the three
  lenses returned, rather than repeating 2026-08-28's concurrent-mutation incident.
- **This machine's Node was upgraded to v24.11.1 (ABI 137) mid-series**, while `better-sqlite3@11.10.0`
  bindings built under Node 22 are ABI 127. **Any worktree whose `node_modules` predates the upgrade
  shows a false RED at `@gisik-nokma/sync-client#test` that is not a code defect.** Fix:
  **`nvm use 22 && pnpm rebuild better-sqlite3`** — the bare rebuild builds against the shell's Node,
  which defaults to 24 here, so it reproduces the fault while looking like the fix. Reported by the
  controller after it cost a round, and corrected by it before this file was pushed.
- **A trailing command makes the harness report the gate's exit code as its own.** The piped-gate trap
  (`| tail` returning 0 over a failed turbo run) is the special case; the general rule is that ANY
  command after the gate in the same chain — including a bare `echo` — becomes the status you are
  shown. **The summary line is the only honest signal.** The controller hit this with a gate that
  reported "exit code 0" while its own summary said `Tasks: 11 successful, 18 total`.
