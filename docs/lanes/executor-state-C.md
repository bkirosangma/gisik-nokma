# Lane C — executor state (Plan 11 scheduler errands: `ops:sweep-orphans` + notification-sweep scheduling)

**This file is Lane C's restart surface, and nobody else's.** `executor-state.md` is Lane A's,
`executor-state-B.md`/`-D.md`/`-E.md` belong to their own lanes — never edit them. A Lane C session
relaunched from the controller's override recovers only what is written here.

> **Shas in narrative prose below are facts about when they were written.** Verify with
> `git branch --contains <sha>` — **empty output means orphaned**. `git cat-file` passes on reflog-only
> commits and will lie to you.

---

## STATUS at 2026-09-06 14:4x IST

Branch `exec/34-plan11-scheduler-errands`, cut from `origin/main` at `81a7e44` (post-#183, the same
commit T11+T12 merged as). Single squashed commit `efa498e`, rebased onto `origin/main` at `fb5e4c2`
(the tip as of this rebase — **origin/main has certainly moved again since; re-verify before trusting
this**). Working tree clean. Local test suite for every touched/adjacent file passed independently by
hand twice (once pre-rebase, once by the workflow's own reviewer): 111+ tests, both `tsc` invocations
clean, both catalogue check scripts (`check-case-ids.mjs`, `check-env-example.mjs`) clean.

**A full locked gate (`pnpm turbo run build test typecheck --force --concurrency=1`) was launched in the
background at ~14:38 IST**, under `/tmp/gisik-gate.lock`, PID recorded in this session's scratchpad. If
this file is being read because the session restarted before that gate finished: check `/tmp/gate.log`
for a `GATE_EXIT=` line before doing anything else. If it says `GATE_EXIT=0` and the `Tasks:` summary
line shows every task green, the branch is gate-clean and ready to push + PR without re-running it. If
it's still running or absent, re-run it (own worktree's own gate.sh, `cd` line points at
`lane3-plan7-8` — confirmed correctly scoped, v3.3 peers-check fix applied and measured).

**PR not yet opened as of this write** — pending the gate result above, per the pre-halt advisory
(session meter 75% at 14:37, 100% projected ~15:30). If the session ends before the PR opens: the branch
`exec/34-plan11-scheduler-errands` is fully rebased, commit `efa498e`, ready to push and open as-is —
`git push -u origin exec/34-plan11-scheduler-errands` then `gh pr create` with the body drafted in this
session's scratchpad (`pr-body.md`, or reconstruct from the commit message, which carries the same
content).

## THE WORK, WHAT IT IS AND WHY

Two of Plan 11's eighteen deferred errands (Ruling P33), assigned to Lane C by the 07:50-class re-task
after T11+T12 merged: `ops:sweep-orphans` and scheduling the `sweep-notifications` CLI, both folded into
the scheduler built for T11's backup daemon (`apps/server/src/ops/schedule.ts`) rather than a second one.

- **`ObjectStore.list(prefix?)`** — added to the interface, implemented in both `LocalDiskStore`
  (recursive, confined to `rootDir`) and `S3ObjectStore` (paginated `ListObjectsV2`).
- **`ops:sweep-orphans`** — deletes attachment-store objects nothing names, 30 days after they stop
  being unnamed. "Named" is a UNION of two signals (an `attachments` table row OR an `attachment.added`
  ledger event) — **load-bearing fact, verify it stays true**: `apps/web/src` does not currently post
  that ledger event at all, so a ledger-only check would flag every live attachment as an orphan. Five
  independent mutation witnesses (both survival signals separately, the age boundary, the delete branch,
  the key-shape guard) all re-run and reproduced by hand, twice.
- **`startScheduler(jobs[], alerter)`** — generalizes `schedule.ts`'s private loop/onFailure primitive
  from the two hardcoded backup jobs to an arbitrary list. Arms every job's FIRST timer only after every
  job's `delayMs()` has been computed (all-or-nothing), closing a real hazard a review round found: a
  later job's malformed schedule value could otherwise leave earlier jobs — including the irreversible
  orphan sweep — armed with no `stop()` handle reachable. `startBackupDaemon` is now a thin,
  byte-compatible wrapper; its own 14 pre-existing tests pass unedited.
- **`backup-daemon-main.ts`** now schedules all four jobs (pg-dump, ledger-export, sweep-orphans every
  30 days, sweep-notifications hourly via a new validated `NOTIFICATION_SWEEP_INTERVAL_MS`) through one
  `startScheduler` call, one alerter, one process. `--once` stays scoped to the two backup jobs only.

### KNOWN, DISCLOSED, NOT FIXED HERE

- **`deploy/do/app.yaml`'s backup worker env block does not carry `OBJECT_STORE`/`OBJECT_STORE_S3_BUCKET`.**
  Without those two, the deployed worker's `createObjectStoreFromEnv` falls back to an unreachable local
  disk store and `sweep-orphans` will run, log zero counts every 30 days, and touch nothing real in
  production. Not fixed here per the lane's scope boundary (`deploy/do/app.yaml`/`config.ts`/`index.ts`
  are Lane E's territory this round) — recorded in `Features.md`'s new ObjectStore bullet, and this is
  the explicit handoff item for whoever next touches that file.
- `sweepOrphanObjects` materializes the whole `store.list()` result before its loop — same memory-ceiling
  class as case 13.34's `readLedger` finding. Recorded in the function's own docblock, not fixed.
- No automated test exercises `backup-daemon-main.ts` as an entry point (same pre-existing gap as the
  two original jobs); wiring is proven by the unit-level `startScheduler`/`requirePositiveIntervalMs`
  tests plus reading the wiring, not by an integration test of the process.

### CATALOGUE — the one open ask for the controller

- `test-cases/09-editor-attachments.md`: **9.242–9.256** minted (15 ids: `list()` × 2 stores, all 9
  `sweepOrphanObjects` behaviors including the torn-write-temp-file case). **A real id collision was
  caught and fixed during this task**: the branch's own stale "ending at 9.239" header led it to first
  claim 9.240–9.252, which collided with `attachments-wired.test.ts`'s cases that had already shipped to
  `origin/main` at exactly those numbers. Renumbered to continue from the true `origin/main` highest;
  verified no duplicates post-rebase (`check-case-ids.mjs`: 1542 unique ids, highest 13.168, matching
  Lane E's block).
- `test-cases/13-deployment-dogfooding.md`: **Lane C's `13.1–13.40` block is confirmed exhausted** (the
  file's own text already recorded this before this task started — 13.40 was already spent on the
  restore-drill guard pair). **Zero ids minted here.** The scheduler-generalization and
  interval-validator coverage (10 real vitest tests: 4 `startScheduler` + 6
  `requirePositiveIntervalMs`, both in `schedule.test.ts`) is written out in full under a `PENDING BLOCK`
  heading, following this file's own established precedent for exactly this situation (Task 12's section
  two up does the same thing) — **awaiting one new id from the controller's next allocation (`13.201` or
  whatever is current)**. This is the ask: Lane C needs a new §13 block before this PENDING content can
  be numbered.
- Deliberately did NOT file the scheduler/interval-validator coverage in `test-cases/09` — that file
  mirrors Features.md §9 (editor/attachments), and `ops/schedule.ts` is unrelated to either domain; it
  belongs in §13 with the rest of Plan 11's ops/deployment coverage.

## HOW THIS WAS BUILT — for anyone auditing the method, not just the result

Implemented via a Workflow (implement → adversarial review → fix, **gated on the LAST review verdict every
round**, not the first — the exact process bug that let an unresolved Critical get committed in T11).
Three review rounds, two fix rounds, six agents total (at the lane's HARD CAP). Round 1 found the
"named" union check correct but flagged an uncommitted fix-round artifact and one Important
(all-or-nothing arming, not yet applied). Round 2 found the fix had genuinely been left uncommitted on
disk (a process defect, not a logic defect) and a live id collision with `origin/main`'s
`attachments-wired.test.ts` cases; round 3 (after both were fixed and independently re-verified by the
fixer, including a trial-merge into a throwaway worktree) came back clean. **I then independently
re-verified the whole result myself** rather than trust the "clean" verdict at face value (its summary
field was a thin placeholder) — read `sweep-orphans.ts` and the refactored `schedule.ts` in full, re-ran
all touched/adjacent tests (111 passed), both `tsc` invocations, and both catalogue scripts, all green,
before proceeding to rebase.

Shim retirement (Task 3 / Lane E seam 1, landed on `origin/main` while this branch was in flight):
repointed both `schedule.ts`'s and `backup-daemon-main.ts`'s `ErrorAlerter` imports from the now-deleted
`./error-alerter-shim.js` to `../alerts/error-alerter.js` — confirmed identical contract
(`ErrorAlerter` type, `alerterFromConfig(url: string | null): ErrorAlerter`) against `origin/main` before
making the change. One-line swap, exactly as the shim's own header always promised.

Rebase conflicts (four files, all previously flagged by the controller) resolved by squashing this
branch's history to one commit first (never pushed, safe to squash) rather than replaying multiple
historical states: `backup-daemon-main.ts`/`schedule.ts` (duplicate/stale shim-repoint text, kept
origin's phrasing plus my new imports), `test-cases/09` (kept my already-corrected renumbering text over
origin's stale "ending at 9.241"), `test-cases/13` (both lanes appended a new section at the same
end-of-file anchor — kept both in full, E's first, mine after).

## THINGS A RESTARTED SESSION MUST NOT ASSUME

- `origin/main` has certainly moved again since `fb5e4c2` — refetch before trusting any anchor above.
- Do not re-run the implement/review workflow — the work is done and independently verified twice. If
  something looks wrong, read the actual code and fix it directly; don't re-dispatch the whole workflow.
- A gate result is a fact about the tree it ran against at that moment — re-verify before relying on the
  `/tmp/gate.log` result above if any commit has landed on this branch since, or if meaningful time has
  passed.
- The gate lock script in this session's scratchpad is v3.3 (peers-check fix for the `$BASHPID`
  off-by-one, measured with a positive control: buggy form read 2, fixed form read 0, in isolation).
  If copying it elsewhere, copy the CURRENT version, not the v3.2 form still referenced in older memory.
