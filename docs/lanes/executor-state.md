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
| Branch in flight | **`exec/04-t4-t5-permissions`**, cut from `origin/main` at `91df593`. Tree identical to main at creation (`git diff --stat origin/main HEAD` empty) | `git rev-parse`, `git diff` |
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

## Gate composition — recounted at the sha being reported, `main @ 91df593`

**Status: GREEN.** `pnpm turbo run build test typecheck --force`, redirected to a file, **never piped**
— a piped gate reports the pipe's exit code, and this repo has already seen `| tail` return 0 over a
failed turbo run. The general rule is broader: **ANY command after the gate in the same chain becomes
the status you are shown**, a bare `echo` included. The summary line is the only honest signal.

| Measure | Value | How counted |
|---|---|---|
| **Node** | **v22.22.2** | `node -v` inside the brief's PATH export, printed into the log's first line before the run. The machine default is v24.11.1 — a different configuration wearing the same numbers |
| Gate exit code | **0** (`TURBO_EXIT=0`, written into the log immediately after the gate) | the run itself |
| Turbo tasks | **21 successful of 21**, 0 cached | same run |
| **Tests** | **936** | summed from the seven per-package lines in the same run |
| Decomposition | domain **274** + rule-engine **278** + server **143** + app-core **130** + editor **72** + sync-client **8** + ui **31** = **936** | a total that only *rises* tells you nothing; one that decomposes into named parts is checkable by the next reader |

**This is the baseline T4's and T5's deltas are stated against.** It was measured on
`exec/04-t4-t5-permissions` at the moment of branching, when its tree was byte-identical to `origin/main`
(`git diff --stat origin/main HEAD` empty) — so it is a fact about main, obtained without touching the
main worktree.

**Do not carry forward 853, or 631/658.** Those were measured on trees that no longer exist. And **do not
place the 488 from the abandoned branch's pre-rebase gate beside this figure**: different tree, not a
control, footnote only.

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

**PHASE 0 IS COMPLETE.** Step 1 Plan 3 Chain A (`6b2fc76`, #38) · step 2 Plan 6a T9 (`c93c910`, #43) ·
step 3 Plan 7 T4 (`a3746fb`, #47).

**STEP 4 IS IN PROGRESS: Plan 4 T4 → T5, on `exec/04-t4-t5-permissions`, cut fresh from `main`.**
T5 is **floor-list** — opus implementer AND opus reviewer. **T4 is opus implementer + sonnet reviewer:**
not because it is floor-list (it is not), but because `proj_memberships` is a **projection**, and the
model table puts core semantics — reducers, projections, engine checks, folds — at opus/high.
**Floor-list and work-class are independent axes; a task can be opus by either.**

### What T4 must do, from main's own text rather than from the plan alone

- **`proj_memberships`** — the projection. Plan 4 text at `docs/superpowers/plans/2026-08-20-04-auth-visibility.md`
  line 1227 (T5 at 1754).
- **`resolveEffectiveRole`** — named by `check-permission.ts`'s comment on main: *"Task 4 lands
  `resolveEffectiveRole`, then Task 5 fills in the role logic on top of this function."*
- **`getEntityState('membership')` in `engine-context.ts`** — that file says Plan 4 owns `'membership'`
  via `proj_memberships`, and its ticket analogue is explicit that projection and context method
  *"none may land without the others."* **A `proj_memberships` that nothing reads is the
  mocked-contract shape in miniature** — this series' signature failure, at small scale.

### The registration-order trap, and the one-line fix that defuses it for step 8

`projections/index.ts` on main says *"every new registrant **appends**"*. That is true for T4 by luck:
§8's order is

> `proj_entity_heads, proj_workflows, proj_ticket_types, proj_tickets, proj_rollups, proj_memberships, proj_visibility`

(plus `proj_projects` **before** `proj_tickets`, per the coordination doc's amendment), and since only
the first two exist, `proj_memberships` does land at the end. **But Plan 3 Chain B — step 8 of this
sequence — adds `proj_ticket_types`, `proj_tickets`, `proj_rollups`, which must be INSERTED BEFORE
`proj_memberships`, not appended.** An implementer who obeys that comment breaks §8 silently.
**T4 corrects the comment to say "inserts at its §8 position" in the same commit** that extends the
order assertion in `test/projection-order.test.ts`. Coordination doc line 557 already anticipates this
collision; this is the one-line change that stops it biting.

### Carried into T5 — do not rediscover

- **Widening `SubmissionGate` to `(env, session)` is a breaking signature change.** **Ruling P17 is the
  precedent:** it owes a sweep of call sites **in the plan text**, not only in code.
- **The three CSRF items, and the sentence that unites them.** HTTP-Origin on cookie-authenticated
  product requests · `sameSite` set **explicitly** (check the config, not the emitted header — observed
  output is not a setting) · a sentence at `sign-in-flows.test.ts:148`. **All three are already true, and
  all three are true for the wrong reason.** `Domain` is forbidden by the exactness of a `toEqual` nobody
  chose for that purpose; `SameSite=Lax` is a library default, not a decision. A property that holds by
  accident holds until someone tidies it. **T5's job is to convert accident into intent** — pinned, so
  the next edit that would undo it fails loudly instead of succeeding quietly. A `Domain=.artsourced.in`
  would send the session cookie to every subdomain of the zone.
- **THE NAMING TRAP.** The HTTP `Origin` **header** (CSRF) and the event-envelope `origin` **field**
  (provenance enum) are unrelated and they meet in T5. Say **HTTP-Origin** or **envelope-origin** in
  every task, commit, review and message. `check-permission.ts` on main already models this — its
  header comment spends a paragraph on the distinction. Main also carries a coordination-doc section
  **§8 "The envelope-origin gate has landed"**; it is about the *field*, not the header.
- **Also owned by step 4: `Features.md` §6 and `test-cases/06-auth-visibility.md`**, created in the
  **same change set** — the rule PR #47 was blocked on. Author them at the **end of T5** covering T4+T5's
  surface, because every ✅ must be sourced from an assertion that exists, not from implementation.
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
