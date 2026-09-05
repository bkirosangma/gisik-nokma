# Lane C — executor state (Plan 11 T14 → T15)

**This file is Lane C's restart surface, and nobody else's.** `executor-state.md` is Lane A's,
`executor-state-B.md`/`-D.md`/`-E.md` belong to their own lanes — never edit them. A Lane C session
relaunched from the controller's override recovers only what is written here.

> **Shas in narrative prose below are facts about when they were written.** Verify with
> `git branch --contains <sha>` — **empty output means orphaned**. `git cat-file` passes on reflog-only
> commits and will lie to you.

---

## RE-TASKED, 2026-09-06 ~02:25 IST

T16 (Tauri desktop) **MERGED as PR #120 at `9e8777e`, promoted 157/177 by #127**. Do not re-implement it.
Controller re-tasked this lane onto **Plan 11 T14 (extend `ci.yml`) then T15 (`deploy/do/` spec file)**,
file-disjoint from Lane E's current seam (Lane E owns the manifest / config surface / Dockerfiles / dev
compose stack; T14 is one file nobody else touches, T15 is a new directory).

## LIVE ANCHORS — verified 2026-09-06, re-verify before trusting

| anchor | value | how verified |
|---|---|---|
| worktree | `/Users/kiro/my_projects/gisik-nokma-lanes/lane3-plan7-8` | `pwd` |
| branch | `exec/24-plan11-ci-deploy` | `git branch --show-current`, cut fresh from `origin/main` (NOT the old `exec/21-plan10-t16-desktop`) |
| `origin/main` at branch-cut | `5abc113` (Plan 10 T16 promoted 157/177, #127) | `git fetch origin && git log origin/main --oneline -5` |
| ahead of `origin/main` | 0 commits made yet (working tree has staged/unstaged changes, nothing committed) | `git status` |
| tree state | build/typecheck verified green at branch-cut sha via `pnpm turbo run build --concurrency=1` (9/9 cached, FULL TURBO) | ran directly |
| Lane E's branch | `origin/exec/23-plan11` at `26c0f7e` (T1/config.ts NOT yet landed there — checked directly, no deploy-sha var exists in config.ts at this sha) | `git diff origin/main...origin/exec/23-plan11 --stat` |
| gate composition at this sha | `pnpm turbo run build test typecheck --force --concurrency=1` — full run launched under the lock, see below for outcome | `/tmp/laneC-gate.log` |

## WHAT'S DONE (staged, not yet committed as of this write)

**T14 files** (staged in git index): `.github/workflows/ci.yml` (single `gate` job → 8 jobs: `scope`,
`check-env`, `check-tasks`, `build`, `typecheck`, `server-tests` [4-way sharded], `other-tests`, `e2e`,
final `gate` aggregator), `scripts/check-no-silent-skips.mjs` (new — fails a shard if a `.skipIf(`-guarded
file contributes zero passed/failed tests; verified with three planted, uncommitted probe files: no-skipIf
ignored, partial-skip passes, fully-skipped-file fails at exit 1), `Features.md` §13 stub (Task 14 entries
only — 2 bullets), `test-cases/13-deployment-dogfooding.md` (new, cases 13.1–13.5, opens the bucket early
per README convention), `test-cases/README.md` (index entry for the new bucket).

**T15 files** (unstaged/untracked, NOT yet committed — waiting on T14's PR first, per the "two PRs, T14
first" instruction): `deploy/do/app.yaml`, `deploy/do/README.md`, `scripts/check-db-timezone.mjs` (verified
falsifiable against a throwaway db forced to UTC — exit 1 — and against the shared dev postgres, server-
wide `-c timezone=Asia/Kolkata` — exit 0), `package.json` (+`check:db-tz` script, +root `pg` dependency
`^8.13.0` matching `apps/server`'s own range — pnpm resolved both to 8.23.0), `pnpm-lock.yaml` (regenerated
by `pnpm install`, 26-line diff, not hand-edited).

**Corrections made against the plan's own draft** (docs/superpowers/plans/2026-08-20-11-deployment-
dogfooding.md T15 section, ~lines 3780-4157) — the plan's `app.yaml` snippet uses `S3_ENDPOINT`/
`S3_REGION`/`S3_BUCKET`/`S3_ACCESS_KEY`/`S3_SECRET_KEY` and `NEXT_PUBLIC_API_URL`/`NEXT_PUBLIC_WS_URL`,
and NONE of those five are read by any shipped code (confirmed via `pnpm check:env`, which passes
unchanged with the corrected names: `OBJECT_STORE`, `OBJECT_STORE_S3_*` (attachments,
`store-config.ts`), `SERVER_ORIGIN` + `NEXT_PUBLIC_SERVER_URL` (web, `next.config.ts` / `providers.tsx`)).

**Two open items recorded, not resolved** (in `deploy/do/README.md`'s own "does NOT resolve" section):
1. The **deploy-sha env var** `/healthz` is meant to serve (per a controller ruling recorded in
   claude-mem, not yet in any file this lane can cite by path) — checked `origin/exec/23-plan11` at
   `26c0f7e` directly, confirmed no such variable exists in `config.ts` yet. Lane E notified
   (msg sent 2026-09-06, see SendMessage log) to reconcile the exact name once it lands.
2. Whether the **backup worker's S3 credentials** are its own or shared with the app's
   `OBJECT_STORE_S3_*` pair — `.env.example` only documents `BACKUP_S3_BUCKET` (a bucket name), no
   separate credential vars exist yet. `app.yaml`'s `backup` worker currently reuses the app's pair as
   a stated working assumption. Task 11 (not this lane's) settles it.

**Root `package.json` collision with Lane E**: flagged to `lane5-plan11-1d` via SendMessage BEFORE
staging the T15 commit — the two-line addition (`check:db-tz` script, root `pg` dependency) is the exact
shape to reconcile at rebase if Lane E's `exec/23-plan11` touches the same blocks first.

## REVIEW STATUS

Two Workflow-orchestrated reviews launched (ultracode opt-in this session):
- `ci-yml-opus-review` (opus, high effort) — adversarial review of the 8-job `ci.yml` split, hunting
  specifically for "silently skips a suite" class bugs (this lane's own re-task brief names this as the
  reason ci.yml gets an opus reviewer, not the table's default sonnet). Run id in `/tmp` workflow logs;
  outcome not yet folded into this file as of this write — check for a later revision of this section.
- `deploy-spec-review` (sonnet, medium effort) — independent verification of every env var name in
  `deploy/do/app.yaml` against the actual `store-config.ts`/`next.config.ts`/`config.ts` reads, not
  trusting this file's own comments.
**If this file is being read after a restart and these reviews aren't mentioned as resolved below, they
may still be running or their findings may not yet be applied — check `/tmp/laneC-*` logs and this
session's workflow transcripts before assuming the diff is final.**

## GATE LOCK PROTOCOL USED THIS SESSION

The current (not the stale inline `echo $$`) form, ONE backgrounded invocation, `mkdir`-based lock with
a 60s empty-pid grace and a 10-minute loud-proceed bound on the live-vitest-pool drain wait. Script at
`/tmp/laneC-gate.sh`, log at `/tmp/laneC-gate.log`. Reap orphans by `ppid=1` only if ever needed — never
`pkill -f vitest`, never kill `pgrep -f vitest`'s output (five lanes' sessions all contain that string).

## NEXT STEPS, IN ORDER

1. Confirm `/tmp/laneC-gate.log`'s `GATE_EXIT=` line is `0` before committing anything (full forced gate,
   no cache, against the T14-staged tree — T15's files are untracked so this run does NOT yet cover them).
2. Fold both review workflows' findings in (fix only Important/Critical; note Minor/Nit as accepted or
   fixed at discretion).
3. Commit T14 alone (files listed above), push `exec/24-plan11-ci-deploy`, open PR #1. Report to
   `gisik-nokma-0d` per the standard format (head sha, `Tasks:` line, test count, node version,
   `0 cached`, `check:env` on its own line, honest not-verified sentence: "Actions job steps verified from
   the PR's own run at <sha>: <list>" once that run exists).
4. Rebase onto `origin/main` again (in case T14's own PR or anything else landed), re-run the gate scoped
   to T15's files (a full forced gate again, since `package.json`/`pnpm-lock.yaml` change affects the
   whole install), stage + commit T15 alone, push, open PR #2. Report similarly, with the honest sentence
   "the spec was not applied to any live app".
5. Do NOT start any other Plan 11 task without a controller message (Lane D has T7/T8, Lane E has
   everything else named in the file map).

## THINGS A RESTARTED SESSION MUST NOT ASSUME

- The gate run launched at branch-cut may still be in flight, may have found a real failure, or may have
  been superseded by a later run against a rebased tree — its log's mtime and `GATE_EXIT=` line are the
  only trustworthy signal, not this prose.
- Both review workflows' findings are NOT summarized here yet (written before they returned) — do not
  proceed to commit without checking whether a later edit to this file folded them in, and if not,
  checking the workflow transcripts directly before assuming "no findings" == "clean".
- `origin/exec/23-plan11`'s sha will have moved. Re-check it before trusting anything above about Lane
  E's current state (the deploy-sha variable, the root `package.json` collision shape).
