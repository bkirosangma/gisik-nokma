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
| Branch in flight | **`exec/04-t6-t7-visibility`**, cut from `origin/main` at `45c83eb`. **T6 committed at `0c6b8d3`** (3 commits). T7 next; one PR after T7 | `git log`, `git rev-parse` |
| `main` | **`45c83eb`** (PR #51, step 4). Verified by presence, not by report: `proj-memberships.ts`, `effective-role.ts`, `bootstrap-workspace.ts`, `simple-kanban.ts`, `test-cases/06-auth-visibility.md` and Features.md §6 are all on it | `git cat-file -e`, `git show` |
| `exec/04-auth-visibility`, `exec/04-t4-t5-permissions` | **Both merged/redundant — safe to delete.** NOTE: `cherry` returns `+` for all 10 of `t4-t5`'s commits **even though #51 merged them**, because #51 was SQUASHED. Main's subject ends `(#51)` — that suffix is the marker | `git cherry -v`, `git log -1 --format=%s` |
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

## Gate composition — recounted at the sha being reported, `e07a043` (step 4 complete)

**Status: GREEN.** `pnpm turbo run build test typecheck --force`, redirected to a file, **never piped**
— and note the broader rule: **ANY command after the gate in the same chain becomes the status you are
shown**, a bare `echo` included. The summary line is the only honest signal.

| Measure | `main @ 91df593` | `c0e3fe0` (T4) | `e07a043` (T5 + fixes + catalogue) |
|---|---|---|---|
| **Node** | v22.22.2 | v22.22.2 | **v22.22.2** |
| Exit code | 0 | 0 | **0** |
| Turbo tasks | 21/21, 0 cached | 21/21, 0 cached | **21/21, 0 cached** |
| **Tests** | **936** | **960** | **995** |
| domain | 274 | 274 | **276** |
| rule-engine | 278 | 278 | 278 |
| **server** | 143 | 167 | **200** |
| app-core | 130 | 130 | 130 |
| editor | 72 | 72 | 72 |
| sync-client | 8 | 8 | 8 |
| ui | 31 | 31 | 31 |

**Both deltas decompose, which is the only thing that makes them checkable.**
**936 → 960 (+24)**, all server: 12 `proj-memberships` + 11 `effective-role` + 1 new DB-free `tables` pin.
**960 → 995 (+35)**: domain **+2** (`simple-kanban.test.ts`) and server **+33** = 32
(`check-role-permission.test.ts`) + 1 (`events-route.test.ts`'s 401 pin). Every other package
unchanged, as it must be.

**The fix round's delta was ZERO and that was the correct result** — it modified three existing `it`
cases in place and added documentation; a non-zero delta there would itself have been a finding.

**The final commit (`e07a043`, catalogue + rulings) touches only `Features.md`, `test-cases/` and
`docs/`, all at repo root and outside every package.** `turbo.json` declares no `inputs`, so hashing
falls back to package contents — **a root-level docs commit cannot move gate composition.** The figures
above were measured at `e07a043` itself regardless, so no inference is being relied on.

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

**PHASE 0 COMPLETE.** **STEP 4 COMPLETE AND MERGED** — PR #51, `main @ 45c83eb`, 995 tests.

**STEP 5 IS IN PROGRESS on `exec/04-t6-t7-visibility`. T6 IS DONE (`0c6b8d3`), REVIEWED WITH ZERO
FINDINGS, GATE GREEN AT 1016. T7 (`canSee`) IS NEXT AND NOTHING IS IN FLIGHT.** T7 is **floor-list** —
opus implementer AND opus reviewer. One PR after T7.

### T6 — what it landed, and the vacuous test it had to replace

`proj_visibility` + migration + `reResolveSubtree`, registered at its §8 position with **both** pins
extended (`projection-order.test.ts`, still DB-free, now pinning names *and* `[name, tables]`; plus the
undocumented one in `entity-heads.test.ts`). 21 new tests, all in server.

**The plan text's determinism test could not have failed.** It replayed the same ARRIVAL order it had
applied, so it asserted only that `apply` is a deterministic function — never that the table is a pure
function of the ledger's rows. Underneath it was a real defect: every event this projection reads is
filed against a **ticket**, so canonical order is ticket-id order and a parent is routinely created when
its children are already in the table. The plan's `ticket.created` resolved only the new ticket
(*"a fresh ticket has no children"*) — true of arrival, false of replay. **Every handler now restores a
table-wide invariant rather than applying a delta.** Ruling recorded in the coordination doc.

**Carried into T7 and beyond:** the reparent payload field is **`newParentId`**, not `parentId` — the
plan text *and its own fixture* were self-consistently wrong, so nothing goes red until a real Plan 3
event flows through, at which point reparent resolution silently stops working rather than erroring.

### T7 — `canSee`, floor-list. Plan text at line 2823

- **T7 is the task that joins `proj_memberships`.** T6 legitimately never touched it. **The ruling
  stands and applies to T7 in full: read membership through `resolveEffectiveRole(db, userId,
  workspaceId)`, NEVER a direct project-scope `SELECT`** — such a row survives `membership.revoked` by
  design, because each key must have exactly one totally-ordered writer. Documented in three places and
  **enforced by nothing**. If T7 joins directly, that is a ruling, not a style note.
- **Registration/contract shapes the plan text gets wrong** (from T6's adaptation map, verified): there
  is no `registerProjection()` function — it is `registry.register(...)` inside
  `buildProjectionRegistry()`; migrations are raw **`.sql`**, not `.cjs`; and `Projection` requires
  `tables`, with `apply(event: LedgerEvent, tx: PoolClient)` — **`Queryable` is deliberately NOT the
  type for `Projection.apply`**, though it IS correct for `canSee`/`resolveEffectiveRole`.
- **Catalogue, same change set.** Plan 4 reserves **6.1–6.42** with content per id. T6 filled **6.9,
  6.10** and minted **6.55–6.58**. **Claim from the table** — check which reserved id names T7's surface
  before minting; only continue past the highest minted id for what no plan document anticipated.
- **Open question T6 raised and did not settle:** whether Task 12's catalogue intends `canSee`'s tests
  to ride under a reserved id or to need a new one. Resolve from the plan text, not by invention.

### The four carried gaps — owners unchanged, do NOT fold into step 5

**P18** membership wiring (T6-or-step-10 → now: step-10 checkpoint, since T6 has passed) ·
**P19** guest admissions, case 6.51 (T9) · second `workspace.created` still commits, 6.52 (T13) ·
half-founded workspace with no repair path, 6.53 (T13).

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
