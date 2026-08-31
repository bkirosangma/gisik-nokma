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
| Branch | `exec/06a-client-core` | `git rev-parse --abbrev-ref HEAD` |
| **Worktree** | `~/my_projects/gisik-nokma-lanes/lane4-periphery` — **NOT the exec worktree** | `git worktree list`. A `git checkout` of this branch from `gisik-nokma-exec` will refuse. Work there, or remove that worktree first. Decide before dispatching. |
| HEAD | **do not trust any sha printed here** — run `git rev-parse HEAD`. It cannot be recorded correctly: the commit that records it changes it. | — |
| Merge-base with `origin/main` | `55ae0a1` — HEAD is a direct descendant | `git rev-list --left-right --count origin/main...HEAD`, left half **0** |
| Ahead / behind | **0 behind** is the stable half and the one that matters. Re-measure the ahead-count. | same command |
| Tree state | clean | `git status --porcelain` empty |
| Orphaned, do not cite | `30e3db4`, `e82a579`, `444e1ec`, `8f3d670` — the pre-rebase tips | superseded by the rebase |

### Why the rebase is trusted

`git range-diff 3fb22d3..30e3db4 origin/main..HEAD` reported **three `=` and one `!`**. The `!` is the
commit carrying `Features.md`, and its only difference is the context line for the **Local pre-check**
bullet that `main`'s `6b2fc76` rewrote. The resolution keeps `main`'s rewritten bullet — md5-checked
identical to `origin/main`'s line 35 — and appends the branch's three new bullets after it.
`Features.md` was the only collision, **re-confirmed against current main** with
`git merge-tree --write-tree origin/main <branch>` rather than adopted from the review's older
measurement.

## Gate composition — recounted at the final sha

**Status: GREEN.** `pnpm turbo run build test typecheck --force`, redirected to a file, **never
piped** — a piped gate reports the pipe's exit code, and this repo has already seen `| tail` return 0
over a failed turbo run.

| Measure | Value | How counted |
|---|---|---|
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

**Phase 0 step 1 — CLOSED.** Plan 3 Chain A merged as `6b2fc76` (PR #38).

**Phase 0 step 2 — COMPLETE on the branch. PR #43 is OPEN against `main`, awaiting the controller's
merge.** That is the whole of what is in flight; nothing else is running. If you are a restarted
executor and #43 is already merged, step 2 is closed — go to step 3.

**Step 3 is next:** `exec/07-editor-client`, whose T4 scoped re-review was never dispatched. Recon done
so the next session does not pay for it: it is **20 behind / 17 ahead** of `main` (the brief's "13+
behind" is stale), and `git merge-tree --write-tree origin/main origin/exec/07-editor-client` reports
**two** conflicts, not one — `docs/superpowers/plans/2026-08-20-00-series-coordination.md` and
`packages/domain/src/index.ts`. The second is code. Budget for it.

Remaining order is the coordination doc's `## Serial execution` section, which is the authority; the
dispatch brief is a copy and is advisory where they differ — **except on model and effort policy,
where the brief is later and wins.**

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
