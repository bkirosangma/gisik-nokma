# Serial executor — live state

**This file is the restart surface.** A controller that kills and relaunches the executor from its
brief recovers only what is written here. Refreshed at every task boundary.

> **Warning about shas in narrative prose.** Every sha cited in any *narrative* document in this
> repo — the dispatch brief, the Chain B handoff, the coordination doc's sections, the narrative
> parts of this file — is a fact about the moment it was written. Anchors in the table below were
> verified with `git branch --contains` (empty output = orphaned), never with `git cat-file`, which
> passes on reflog-only commits and hands you pre-rebase content while looking like it worked.

## Live anchors — 2026-08-31

| Anchor | Value | How verified |
|---|---|---|
| Step-3 branch | `exec/07-editor-client`, pushed, **0 behind `69b7dfe`**. **No sha is recorded here on purpose** — this branch has now been rebased twice and each rebase orphaned the tip the previous version of this row named (`52520b0`, then `72a7e3e`, both `--contains`-empty). Run `git rev-parse HEAD`. | `git rev-list --left-right --count`; reachability by `git branch --contains`, empty meaning orphaned |
| Worktree | `~/my_projects/gisik-nokma-exec` — a doc-only change, so it does not need lane 4's tree | `git worktree list` |
| Base | `c93c910` — **Plan 6a T9 MERGED (PR #43)** | `git log --oneline -1 origin/main` |
| HEAD | **do not trust any sha printed here.** It cannot be recorded correctly: the commit that records it changes it. | — |
| Behind | re-measure. `main` moved twice while step 2's PR was open (#42, then #43 itself). | `git rev-list --left-right --count origin/main...HEAD` |
| `exec/06a-client-core` | **merged and done.** Its pre-rebase tips `30e3db4`, `e82a579`, `444e1ec`, `8f3d670` are orphaned; so, after the squash, is every sha on the branch itself. **Cite `c93c910`.** | `git branch --contains` |

> **A note the controller's verification earned.** Its `--contains` sweep flagged four shas in this
> file as unreachable. They were the four this file's own table labels *"Orphaned, do not cite — the
> pre-rebase tips."* The claim was correct and the label is what made it checkable. **Label an
> orphaned sha as orphaned in the same table that cites it**, or the next reader's sweep produces a
> true finding about a false problem.

## Gate composition — recounted at the final sha

**Status: GREEN.** `pnpm turbo run build test typecheck --force`, redirected to a file, **never
piped** — a piped gate reports the pipe's exit code, and this repo has already seen `| tail` return 0
over a failed turbo run.

| Measure | Value | How counted |
|---|---|---|
| **Node** | **v22.22.2** — every gate figure in this file was produced under it | `node -v` inside the same `export PATH="$HOME/.nvm/versions/node/v22.22.2/bin:$PATH"` the brief mandates. **Checked, not assumed:** this machine's *default* `node` is **v24.11.1**, outside the declared range, so a gate run without that export is a different configuration wearing the same numbers. |
| Gate exit code | **0** | the run itself |
| Turbo tasks | **18 successful of 18**, 0 cached | same run |
| Tests | **853** = domain 263 + rule-engine 278 + server 143 + app-core **130** + ui 31 + sync-client 8 | summed from the six per-package lines in the same run |
| `main` @ `55ae0a1`, app-core | **92** | measured in the main worktree with `--pool=forks --poolOptions.forks.singleFork=true` |
| app-core delta | **92 → 130**, a delta against a named sha | the only figure that survives the rebase |

**Do not carry forward the older 631/658 pair.** Plan 3 Chain A (`6b2fc76`) landed underneath and moved
domain 230 → 263 and rule-engine 128 → 278 on *both* sides, so "identical except app-core" was true of
the pair it was measured on and false of anything since. Both historical rows are kept and marked
historical in `docs/lanes/lane4-periphery-state.md`.

## Where I am in the serial sequence

**Steps 1 and 2 — CLOSED.** Plan 3 Chain A `6b2fc76` (PR #38); Plan 6a T9 `c93c910` (PR #43);
P17 obligation 1 `f40a850` (PR #45).

**Step 3 — THE REBASE IS DONE. Do not redo it.** `exec/07-editor-client` is rebased onto `69b7dfe`
(twice: first onto `f40a850`, then forward again after #44 and #46 landed),
force-pushed, and sits at **0 behind / 17 ahead**, tree clean. Its worktree is
`~/my_projects/gisik-nokma-lanes/lane3-plan7-8`.

| Fact | Value | How verified |
|---|---|---|
| Node | **v22.22.2** | `node -v` in the same shell as the gate; the machine default is v24.11.1 |
| Gate BEFORE the rebase | `Tasks: 21 successful, 21 total`, **589 tests** | run at `52520b0` — **ORPHANED by the rebase that followed; do not cite it as a live sha** — so that a post-rebase red would be attributable |
| Gate AFTER the rebase | `Tasks: 21 successful, 21 total`, 0 cached, **934 tests** — domain 274 · rule-engine 278 · server 143 · app-core 130 · editor 70 · ui 31 · sync-client 8 | forced, redirected, **summary line read, not the exit code** |
| Reconciliation | 853 (`main`) + 70 (`@gisik-nokma/editor`, this branch's package) + 11 (domain 263→274) = **934** | recounted from the run |
| range-diff | **17 rows: 14 `=`, 3 `!`** | the three `!` are the two `packages/domain/src/index.ts` commits and the coordination-doc commit; each differs **in context lines only** — inspected, no content changed |
| Conflicts resolved | 2 | `packages/domain/src/index.ts` (append/append barrel: union kept, after checking the four modules share **no** exported name, since `export *` collisions are a compile error not a silent merge) and the coordination doc (union: 9 `main` sections + 1 lane section, heading census before == after) |

**T4's scoped re-review is DONE.** Three lenses (1 opus, 2 sonnet; 3 against a cap of 6), mutations
serialised so no two agents shared the tree, read-only lens first. **No Critical.** Fixes applied on
this branch.

**The forgery fix is REAL and it reproduces** — which was the point of running this at all. M2
(remove the `userId` attribute's `parseHTML`/`renderHTML`) reddens exactly the three two-spellings
tests; N1 reddens three cases and N2 four, the counts `bdd3b46` claims and the names it predicts; M4
is an explained survivor exactly as its own code comment says; the outward direction is closed over
seven label shapes; uppercase-attribute and round-trip attacks are closed. The Tiptap mechanism was
read out of `@tiptap/core`'s dist by the reviewer, not inherited from the commit message describing it.

| Finding | Sev | Disposition |
|---|---|---|
| The HTML parse door admits a **blank** `userId` — the exact defect `bdd3b46` closes on the insert path, arriving by a door it never touched | Important | **FIXED.** Refused at the node level, where `false` short-circuits *before* the per-attribute merge — the one verdict a node-level `getAttrs` can still deliver after this file's own forgery fix. Two tests pin it; dropping the refusal kills both. |
| The coordination doc's **"Escape defect is vacuous"** verdict | Important | **CORRECTED there.** The suggestion-plugin half is unconstrained; the renderer's teardown is not — deleting `container?.remove()` reddens that test's `toBeNull()`. The test earns its place; one assertion in it cannot fail. |
| The BEM docblock's "equality in both directions" checked **three of six** classes | Important | **FIXED.** Renaming `mention-popup__status` used to leave both BEM tests green. One shared `BEM_CONTRACT`, and the emit side now collects every class the popup puts in the DOM. |

**Recorded, NOT fixed — with owners:**

- **`packages/editor` has no `Features.md` section and no `test-cases/` bucket at all.** `Features.md`
  stops at §5; `test-cases/` holds only `03`, `04`, `05`. T4's mention node, its picker and the
  blank-userId refusal are described nowhere, and no test cites a case id. Same shape as `app-core`'s
  recorded gap. **Owner: Plan 7** (its T16 pins the case numbering). Swept with a positive control —
  §§3/4/5 do have full coverage, so the method finds content where it exists.
- **Three Minor test-quality observations in `mention.test.ts`**, none false today: a fixture-count
  gate at `:332` that discriminates before the assertions under it get a chance; two candidates
  sharing a display name at `:270-277`, so the assertion discriminates on count rather than on *which*
  candidate was filtered; and `:236-247`, reddenable by no mutation of `packages/editor` because it
  exercises only `docToPlainText`, imported by package name from the frozen `@gisik-nokma/domain` —
  scope, not a defect. **Owner: Plan 7.**
- **`rule-census.test.ts` genuinely constrains** (per-extension `toEqual`, not a total-only
  tautology), but the read-only lens could not re-run the M1 mutation the commit claims reddens it.
  **Unverified by this review**, said plainly rather than inherited.

**NEXT ACTION: open the step-3 PR as a review ledger.** After that, step 4 — Plan 4 T4 → T5, where T5
carries the CSRF ruling's three items and the HTTP-Origin / envelope-origin distinction that the brief
warns is two unrelated things meeting in one task.

Remaining order is the coordination doc's `## Serial execution` section, which is the authority; the
dispatch brief is advisory where they differ — **except on model and effort policy, where the brief
is later and wins.**

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
