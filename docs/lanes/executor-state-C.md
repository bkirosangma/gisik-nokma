# Lane C — executor state

**This file is Lane C's restart surface, and nobody else's.** `executor-state.md` is Lane A's,
`executor-state-B.md`/`-D.md`/`-E.md` belong to their own lanes — never edit them. A Lane C session
relaunched from the controller's override recovers only what is written here. Newest section first;
older sections kept below as history, not deleted.

> **Shas in narrative prose below are facts about when they were written.** Verify with
> `git branch --contains <sha>` — **empty output means orphaned**. `git cat-file` passes on reflog-only
> commits and will lie to you.

---

> **CONTROLLER, 2026-09-06 20:50 — LANE C IS DONE FOR THE WEEKEND. Lane F pass 1, the citation-check ratchet, MERGED as #227 (`ba6f9e6`); its first catch (the #225 + #227 combination, §07 uncited 78 → 79 for 7.251) repaired by the controller in #228. Nothing is in flight for Lane C; the blocks below are history. From Monday 2026-09-07 execution is SERIAL — the queue and the procedure are the top block of `docs/lanes/controller-state.md`.**

## ⏩ LANE F PASS 1 — the test-cases <-> test citation check, 2026-09-06 ~20:20 IST

**PR #227 OPEN at head `afa8945`** (`exec/51-case-citation-check` → `main`). Includes the review
round's fixes (see below). Pushed by the 21:15 controller deadline with margin (~20:43). CI will show
red-at-start — GitHub Actions billing outage, per the controller, unrelated to this branch; the PR body
says so. **Not pushing again without a fresh instruction** — head frozen at `afa8945` pending
controller review/merge. If the session ends before merge: this branch is complete, gate-verified
(before the fix round, on code the fix round didn't touch) and check-verified (after), ready to merge
as-is.

**Owner context:** the owner started the Monday serial queue tonight with the remaining weekly quota
(~14% at dispatch); Lane C and Lane A only, B/D/E stay released. This is a Lane F pass (repo-wide sweep,
not tied to a specific plan task), assigned directly by the controller with an explicit measure-first
instruction.

**Branch:** `exec/51-case-citation-check`, cut from `origin/main` at `bf40c5c` ("PLAN SERIES COMPLETE —
177/177"). One commit, `bf8056b`. Working tree clean at time of writing.

**What it does:** `scripts/check-case-citations.mjs` closes the gap the coordination doc named by hand
(2026-08-31): no test in the repo cited a catalogue `✅` case id, so a case could survive the deletion of
its own covering test. Every checked id in `test-cases/*.md` must now be cited — as a test name or
comment — somewhere under a test/e2e directory, checked by its own ungated CI job (mirrors
`check-runbook`'s fix for the identical docs-only-skip hazard).

**Measured before choosing a mode, reported to the controller before building anything real:** first pass
(a throwaway script) said 632/1029 uncited — WRONG, that tool's regex missed the "bold id + trailing ✅"
style entirely (`- **3.1** ✅ ...`), which is the dominant style in several files. The real script found
1470/663/807 — corrected and reported before proceeding, still too large to backfill in one PR, so it
runs as a RATCHET: `scripts/fixtures/check-case-citations-baseline.json` commits one per-file
uncited-count ceiling that must equal reality EXACTLY (not just bound it) — an increase is a regression
(citing test deleted, or new `✅` shipped uncited); a ceiling higher than reality is ALSO a failure
(stale, must be tightened). Per-file, not summed, so one file's regression cannot hide behind another's
improvement.

**ONE opus reviewer found a real CRITICAL and a real IMPORTANT in that "1470" figure itself**, both
fixed before this PR opened — the final, correct numbers are **1525 checked ids, 710 cited, 815
uncited**:
- **CRITICAL**: range-form `✅` lines (`- **3.89–3.94** ✅ ...`, the real shape `03-foundation-ledger.md`
  uses ten times) were extracted as ONLY their leading id, with the other ids in the range silently
  dropped — not reported as malformed, just gone, contradicting the extractor's own docblock. 50 real,
  already-cited ids across one file were invisible to the ratchet entirely (would have reported "0
  uncited" for all of them forever, even if every citing test were deleted). Reviewer proved it with a
  paired mutation (delete real citations for 8 range ids in `visibility-editor.test.tsx` → check stayed
  green, `03`'s count unchanged; delete a citation for a COUNTED id as a positive control → check
  correctly reddened). I reproduced the same property myself after the fix, independently. Fixed:
  `extractCheckedIds` now parses range/malformed/ordinary as three distinct shapes and expands a valid
  range to every id in it; a cross-section range is reported malformed instead.
- **IMPORTANT**: `isCited`'s boundary guard blocked a following digit but not a following `.digit`, so
  dependency version strings (`"zod 3.25.76"`, `"@tiptap/core@3.30.5"`, `"fastify 5.12.1"`) satisfied
  ids `3.25`/`3.30`/`5.12` with no real citation anywhere — a routine dependency bump could flip a
  genuinely-deleted citation to look present. Fixed: also exclude a following `.digit`, while still
  accepting a genuine sentence-ending period (`case 5.18.`).
- Both fixes are now covered by the self-test itself (a range + a cross-section-malformed range in the
  fixture; a version-string and a sentence-period case in the citation-matching assertions), not just
  fixed and left uncovered.
- Three Minor findings also fixed: this file's own stale 1029/632 docblock numbers (now 1525/815,
  post-fix); a "152 of 160" arithmetic slip (159, not 160 — since corrected again to 153/160 by adding
  case 13.209 for the IMPORTANT fix above); `apps/web/e2e-stack/` helper files (global-setup.ts,
  helpers/*.ts) were excluded from the citation corpus while `test/` helpers were included — widened so
  the whole e2e/e2e-stack directory counts, not just its `*.spec.ts` files.

**Verification, real not just self-tested:**
- Self-test passes against a planted fixture covering every real id-line shape (bare/bold/marker-first/
  RANGE), a malformed-id guard (a truncated three-part id AND a cross-section range), the version-string
  and sentence-period citation-matching edge cases, and the ratchet's four shapes — all via
  fixture/synthetic inputs.
- **Reproduced against REAL files, twice**: (1) removed both real citations of case 11.1
  (`calendar-model.test.ts`'s `describe`, `claim-labels.test.ts`'s `it`) — `11-calendar-notifications.md`
  moved from 0 to 1 uncited against a baseline of 0, check failed naming `11.1`, restored and re-verified
  clean; (2) reproduced the reviewer's own range-deletion mutation against `visibility-editor.test.tsx`
  post-fix — `03`'s uncited count correctly rose from 45 to 51, restored and re-verified clean.
- Full local gate (run BEFORE the review round, on code the review round did not touch — scripts/*.mjs
  and docs are not turbo build/test/typecheck inputs): `GATE_EXIT=0`, 30/30 tasks, 0 cached, 2m17s, node
  `v22.22.2`. `@gisik-nokma/server`: 128 files / 1351 tests (1346 passed, 5 skipped, pre-existing).
- Four checks run individually, each on its own line: `pnpm check:env` clean; `node scripts/check-
  case-ids.mjs` — 1609 unique ids, highest 13.209, no duplicates; `pnpm check:citations` — ratchet holds
  exactly on every file; `pnpm check:runbook` — 14/14 references resolve.
- `actionlint .github/workflows/ci.yml` — exit 0 (checked again after the fix round).

**A real self-correction worth carrying forward, separate from the reviewer's findings:** the five new
catalogue cases this errand adds (13.204, 13.205, 13.207, 13.208, 13.209) are themselves currently
uncited, and I initially planned to just bump the baseline to absorb that. Caught myself: this script
(like its `check-case-ids.mjs` and `check-runbook-commands.mjs` siblings — confirmed by grep, neither
has one) has no companion `.test.ts` file, and the citation corpus is test/e2e directories only, by
explicit spec — so there genuinely is no test file these cases could cite without unilaterally widening
that scope. Recorded as its own named structural gap in `test-cases/13-deployment-dogfooding.md`'s new
section rather than silently folded into ordinary backfill debt. Case 13.206 (the real-file 11.1
mutation) is marked `🧪`, not `✅`, on purpose — a one-time hand-verified reproduction, not a standing
automated test, so it does not enter the citation ratchet at all.

**Backfill (815 pre-existing uncited cases) is carried, not attempted, with a named owner per file** in
`test-cases/13-deployment-dogfooding.md`'s new "Lane F Pass 1" section: `09-editor-attachments.md` (219
uncited, 0 cited — this lane's own prior work is a large share, first claim if this lane runs again),
`10-workflow-builder.md` (66 uncited); `05/06/04/03` mostly uncited with small existing precedent;
`07/12` already majority-cited, minority remains; `13` itself carries 153 of 160 uncited.
`11-calendar-notifications.md` needs no owner — fully cited today (0 of 147) and stays that way
structurally if new cases there are cited when written.

**Collisions respected, not touched:** `packages/rule-engine/src/index.ts`, client test sites,
`fixture-witnesses.test.ts`, `test-cases/07`, `Features.md` §7 — all Lane A's. Diff scope confirmed via
`git diff --stat origin/main...HEAD`: only `scripts/`, `.github/workflows/ci.yml`, `package.json`,
`Features.md`, `test-cases/` changed. No behaviour change to `apps/`/`packages/` source.

---

## STATUS at 2026-09-06 ~18:45 IST — DONE. PR #203 MERGED at `c1a7105`. Lane C RELEASED for the weekend.

**Both errands shipped, closed by name, nothing outstanding for Lane C.** #203 merged (squash of the
`exec/34-plan11-scheduler-errands` branch's final head `9d37936` plus a trailing docs commit) under the
owner's authorisation — CI was waived because GitHub Actions was down account-wide on a billing issue
(owner-only fix, unrelated to this branch); the merge's real evidence is the branch's own full local
gate (`GATE_EXIT=0`, 30/30 tasks, 0 cached, node v22.22.2 — see below) plus a three-round adversarial
review, both completed before the CI outage started. The controller ran a further forced gate at the
merged `main` as a backstop; that also came back clean.

**Owner ruling, 2026-09-06 18:41: after Monday's weekly reset (06:30), execution goes back to SERIAL**
(controller + ONE executor) — the five-lane parallel setup, Lane C included, **ends with this weekend**.
This file's restart procedure below (§ "A Lane C session relaunched from the controller's override") is
therefore **historical** unless the owner explicitly re-opens parallel lanes; a Monday serial executor
should read this file for the WORK RECORD (what shipped, what's still owed, who owns it), not as an
active restart target.

### The work, and its evidence (unchanged from when it was written)

Branch `exec/34-plan11-scheduler-errands`, cut from `origin/main` at `81a7e44` (post-#183, the same
commit T11+T12 merged as), rebased onto `fb5e4c2`. Full locked gate run twice: the first run showed 39
file-level test failures (`Cannot find package '@fastify/cors' / 'nodemailer' / 'yaml'`) from a STALE
`node_modules` after the rebase brought in Lane E's dependency additions — not a real regression (I'd
checked only `apps/server/package.json`'s own 1-line diff for lockfile impact instead of the ROOT
lockfile against `origin/main`, which had 26 changed lines). Fixed with `pnpm install --frozen-lockfile`
+ `pnpm rebuild better-sqlite3`; second run: `GATE_EXIT=0`, 30/30 tasks, 0 cached (forced), 2m7s, node
`v22.22.2` (confirmed from the gate script's own `nvm use 22` line). `@gisik-nokma/server`: 126 test
files / 1325 tests — 1320 passed, 5 skipped (the pre-existing restore-drill client/server
major-version skip, unrelated). Logs were local-machine-only (`/tmp/gate.log`, `/tmp/gate-run-c2.out`)
and are not preserved anywhere durable — this paragraph is the record if they're gone.

### §13 catalogue — CLOSED

Controller allocated Lane C a new block, `13.201–13.240` (next block `13.241`, on request), once
`13.1–13.40` was confirmed exhausted. **Minted at `13.201–13.203`** (the three `startScheduler` /
`requirePositiveIntervalMs` / `backup-daemon-main.ts`-wiring cases); both header paragraphs updated;
`check-case-ids.mjs` confirmed 1545 unique ids, highest 13.203, no duplicates, immediately before merge.
**`13.204–13.240` of this block remain free and are Lane C's to use next**, not up for grabs by another
lane. See "carried items" below for one specific thing that owes an id from this remainder.

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

### CATALOGUE — CLOSED for this errand; one pre-existing carried item found while closing it

- `test-cases/09-editor-attachments.md`: **9.242–9.256** minted (15 ids: `list()` × 2 stores, all 9
  `sweepOrphanObjects` behaviors including the torn-write-temp-file case). A real id collision was caught
  and fixed during this task: the branch's own stale "ending at 9.239" header led it to first claim
  9.240–9.252, which collided with `attachments-wired.test.ts`'s cases that had already shipped to
  `origin/main` at exactly those numbers. Renumbered to continue from the true `origin/main` highest.
- `test-cases/13-deployment-dogfooding.md`: **13.201–13.203 minted**, in the new block the controller
  allocated (`13.201–13.240`) once `13.1–13.40` was confirmed exhausted. `13.204–13.240` remain free —
  see the carried item immediately below, which owes one of them.
- Deliberately did NOT file the scheduler/interval-validator coverage in `test-cases/09` — that file
  mirrors Features.md §9 (editor/attachments), and `ops/schedule.ts` is unrelated to either domain; it
  belongs in §13 with the rest of Plan 11's ops/deployment coverage.

**CARRIED ITEM, found during this file's 2026-09-06 18:45 accuracy pass, owner: whoever next catalogues
Task 12 (restore drill) or audits §13.** `test-cases/13-deployment-dogfooding.md`'s own "The restore
drill (Task 12)" section (predates this errand — written in PR #183) has several `PENDING BLOCK` entries
that said they were "awaiting `13.201`" for a future id. That was true when written; it stopped being
true the moment THIS errand's PENDING BLOCK entries reached the controller's new allocation first and
consumed `13.201–13.203`. Fixed the prose in place (docs/lane-c-final-refresh branch) to say they're
awaiting one of `13.204–13.240` instead of the now-taken `13.201` — a pure accuracy fix, no ids actually
minted for Task 12's entries, because assigning them for real is more than a docs-only refresh (it means
re-confirming each restore-drill case still passes as described). That re-cataloguing is the actual
carried work; this note is so nobody reads the old "awaiting 13.201" text and mints a duplicate.

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
- **This is not an active restart target as of the owner's 2026-09-06 18:41 ruling** (serial execution
  resumes after Monday's 06:30 reset; the five-lane parallel setup ends this weekend). A session reading
  this file going forward is doing so for the work record — what shipped, what's carried and to whom —
  not because a controller is about to relaunch "Lane C" in the old sense. If parallel lanes are ever
  reopened, re-verify every sha above before trusting it; a great deal of `origin/main` history will have
  happened in between regardless.
