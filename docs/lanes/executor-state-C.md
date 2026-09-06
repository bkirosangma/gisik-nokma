# Lane C — executor state (Plan 11 T11+T12, checkpointed ahead of the 09:40 session-limit window)

**This file is Lane C's restart surface, and nobody else's.** `executor-state.md` is Lane A's,
`executor-state-B.md`/`-D.md`/`-E.md` belong to their own lanes — never edit them. A Lane C session
relaunched from the controller's override recovers only what is written here.

> **Shas in narrative prose below are facts about when they were written.** Verify with
> `git branch --contains <sha>` — **empty output means orphaned**. `git cat-file` passes on reflog-only
> commits and will lie to you. **Every anchor below was measured shortly before the 09:40 checkpoint and
> is already stale for `origin/main`** — re-fetch before trusting any of it.

---

## WHY THIS CHECKPOINT EXISTS

The controller warned at 09:40 that the account-wide session meter read 87% and every pane was projected
to halt around 10:05 until the 12:20 reset, taking any running background workflow down with it. This
session's Plan 11 T11+T12 work was mid-flight in a Workflow tool background task (`ww599joaw`,
`wf_b926b912-c39`) at the time — the controller's instruction was to commit and push whatever had already
landed in the worktree, with an honest message, rather than let it evaporate. **That checkpoint is done**:
commit `1c5df30` on `exec/30-plan11-backups`, pushed to `origin/exec/30-plan11-backups`. It is explicitly
labeled WIP/unverified in its own commit message — do not treat it as reviewed or gate-clean.

## LIVE ANCHORS — measured ~09:42 IST, RE-VERIFY BEFORE TRUSTING, origin/main has already moved once since

| anchor | value | how verified |
|---|---|---|
| worktree | `/Users/kiro/my_projects/gisik-nokma-lanes/lane3-plan7-8` | `pwd` |
| branch | `exec/30-plan11-backups` (cut fresh from `origin/main` at `56cd091`, after #146 merged) | `git branch --show-current` |
| HEAD | `1c5df30` (the WIP checkpoint commit, on top of `cf5b3c5`) | `git rev-parse HEAD` |
| `cf5b3c5` | T11's real, reviewed commit — "feat(ops): nightly pg_dump and weekly ledger export..." | `git log --oneline` |
| `1c5df30` | WIP checkpoint — T11 follow-up fixes (PGPASSWORD gate exemption, DO Spaces worker env fix, object-sink discard test) + T12's in-progress files (restore.sh, restore-drill.test.ts, catalogue entries) | see commit body for the full honest inventory |
| `origin/main` at branch cut | `56cd091` | `git rev-parse origin/main` at cut time |
| `origin/main` LATEST KNOWN (controller messages received this session, NOT independently re-verified past this point) | `2d90a03` per a `git show origin/main:...` I ran seconds before writing this file — but I have NOT diffed what moved beyond `aa17046` (the last sha the controller explicitly named to me) | **re-fetch and read `git log aa17046..origin/main` before rebasing** |
| controller-named rebase target as of the last explicit instruction | `aa17046` (#167 Lane D sweeps, #169 Lane A my-work/contests-route/seed.ts) — **but `origin/main` has moved past this too (to `2d90a03`), unexplained to this session** | do not assume `aa17046` is still the tip |
| gate | **NOT RUN in this checkpoint.** No `pnpm turbo run build test typecheck` since the branch was cut. Do not report or imply a gate result until one is actually run. | n/a |
| Gate Lock version in force | **v3.2** (controller ruling, this session) — noclobber-file lock, dead-pid-only reclaim, 10-min+idle-machine empty-file reclaim, single backgrounded invocation, name the script `gate.sh` or `locked-test.sh` so the peers-check can see it. v1/v2/v3/v3.1 are all superseded; do not copy them from memory or from an old message. Reference copy: `docs/lanes/gate-lock/` on `origin/exec/23-plan11` at `e814f49`. | controller messages this session |

## WHAT IS ACTUALLY DONE, VERIFIED, AND SAFE TO TRUST

- **T11 (Backups), core implementation: DONE, reviewed, committed at `cf5b3c5`.** This went through the
  full implement → independent-opus-review → commit cycle inside the background workflow before the
  checkpoint fired. Six files under `apps/server/src/ops/` (`object-sink.ts`, `export-ledger.ts`,
  `pg-dump.ts`, `schedule.ts`, `backup-daemon-main.ts`, `fetch-backup.ts`), three test files under
  `apps/server/test/ops/` (`schedule.test.ts`, `export-ledger.test.ts`, `pg-dump.test.ts`),
  `apps/server/package.json`'s two new script lines (`ops:backup-once`, `ops:fetch-backup`, both `tsx
  src/ops/...` per Lane E's correction — NOT `node dist/...`), and catalogue entries. I have **not**
  re-run its test suite since that commit; the review that passed it ran inside the same workflow
  invocation, not independently by me afterward. Re-run before trusting if resuming after a gap:
  `source ~/.nvm/nvm.sh && nvm use 22 && export PATH=/opt/homebrew/opt/libpq/bin:$PATH && cd apps/server
  && pnpm exec vitest run test/ops/schedule.test.ts test/ops/export-ledger.test.ts test/ops/pg-dump.test.ts`.

## WHAT IS IN THE WIP CHECKPOINT (`1c5df30`) — NOT independently verified, NOT reviewed, NOT gated

- **T11 follow-up**, apparently produced during T11's fix round but never staged by my own overly-narrow
  commit-agent file list (my mistake — I told the commit agent to stage only the ops/ source+test files,
  package.json, Features.md and test-cases/13; I did not anticipate the implementer would also touch
  `.env.example`, `deploy/do/app.yaml`, or `scripts/check-env-example.mjs`, so those sat uncommitted until
  this checkpoint):
  - `scripts/check-env-example.mjs`: adds `PGPASSWORD` to the `IGNORE` set, with a stated reason —
    `apps/server/src/ops/pg-dump.ts` writes it into a child process's environment (not argv) so the
    database password never appears where `ps` can read it, and it is derived from the already-documented
    `DATABASE_URL` rather than something an operator should set directly. **Read `pg-dump.ts` and confirm
    this claim before trusting it** — I have not independently verified `pg-dump.ts` actually does this;
    it may be a real, good finding, or the implementer's own justification for a shortcut. Check.
  - `deploy/do/app.yaml` + `.env.example`: settle the "does the backup daemon share the app's
    `OBJECT_STORE_S3_*` credentials" question left open by my own T15 work (yes, it does, taking only its
    bucket from `BACKUP_S3_BUCKET`), and claim to fix a real bug — the backup worker block was missing
    `OBJECT_STORE_S3_ENDPOINT`/`_REGION`/`_FORCE_PATH_STYLE`, which (the diff claims) would have made the
    AWS SDK default to `us-east-1` and sent DO Spaces credentials to Amazon on the first real run. **This
    is a plausible and well-reasoned claim (matches known AWS SDK default-region behavior) but I have not
    independently confirmed it** — no test exercises `deploy/do/app.yaml` (it's a spec file, not applied
    to a live app), so this is confirmable only by re-reading the AWS SDK's own default-resolution
    behavior or by testing `s3SinkFromEnv`'s refusal path directly.
  - `apps/server/test/ops/object-sink.test.ts` (new, not in my original file list): direct unit coverage
    of `s3SinkFromEnv`, including a `discard()` idempotency case — implies `ObjectSink` grew a `discard`
    method beyond the three the plan/my instructions specified (`put` only was asked for). **Read
    `object-sink.ts` itself to confirm what `ObjectSink`'s actual interface now is** — I have not
    re-read it since the checkpoint; if `discard` exists, it needs to appear in Features.md's bullet too.
- **T12 (restore drill), in progress, not committed as a clean reviewed unit:**
  - `scripts/restore.sh` — the scratch-database guard, executable, PLUS a real finding beyond what I
    asked for: `pg_restore` must be **at least as new as** the `pg_dump` that wrote the archive **and no
    newer than the target server's major version** — a `pg_restore` newer than the server sends settings
    (named example: `SET transaction_timeout = 0`, a PG17+ parameter) the older server rejects, so
    restoring into an older server can exit non-zero even though the data landed. Stated as "measured by
    hand, 2026-09-06" and "not covered by any automated test in this repo" — an honest limitation, not a
    gap to silently close.
  - `apps/server/test/ops/restore-drill.test.ts` (329 lines, reads complete — ends cleanly on the
    planted-drift case, not truncated) — **never run against Postgres in this checkpoint.** Do not assume
    it passes.
  - `deploy/do/README.md` — presumably carries the same cross-version restore sentence; not diffed in
    detail before this write, only confirmed the sentence is present via grep.
  - `Features.md` (+29 lines) and `test-cases/13-deployment-dogfooding.md` (+62 lines) — catalogue entries
    for both T11's follow-up and T12; **`scripts/check-case-ids.mjs` has NOT been re-run since these
    landed.** Run it before trusting the numbering (my instructions told the implementer to mint from
    13.9; confirm no collision and no gap before relying on it).

## NEXT STEPS, IN ORDER, ON RESUME

1. **Re-fetch `origin/main` and read what moved since `56cd091`** (known: #146, then further merges the
   controller named — #154 at `de88248`, #167+#169 at `aa17046` — and `origin/main` was already at
   `2d90a03` per a spot-check moments before this write, unexplained). Do not assume `aa17046` is still
   the tip.
2. **Re-run T11's three test files** (schedule/export-ledger/pg-dump) to re-confirm `cf5b3c5` is still
   good — nothing should have changed it, but confirm rather than assume.
3. **Independently verify the four WIP-checkpoint claims listed above** (PGPASSWORD's actual origin in
   pg-dump.ts, the AWS-SDK-default-region claim, `object-sink.ts`'s actual current interface including
   `discard`, and whether `deploy/do/README.md`'s diff matches what `restore.sh` claims) — these were
   never independently reviewed; treat them as an implementer's unverified self-report, not as fact.
4. **Run `node scripts/check-case-ids.mjs` and `node scripts/check-env-example.mjs`** from the repo root;
   fix anything that fails before proceeding.
5. **Run T12's restore-drill.test.ts for the first time** (`export PATH=/opt/homebrew/opt/libpq/bin:$PATH`
   needed for `pg_dump`/`pg_restore`). If it fails, this is genuinely new information, not a regression —
   nothing in this checkpoint has been executed yet.
6. **Resume or re-run the T12 review/fix cycle** — the background workflow (`wf_b926b912-c39`) may still
   be resumable via `Workflow({scriptPath: ..., resumeFromRunId: "wf_b926b912-c39"})` if the harness
   preserved it; if not, re-run the T12 implement→review→fix→commit sequence fresh against what's already
   on disk (do not re-implement — verify and review what exists, since the files read as complete).
7. **Split the WIP checkpoint into clean, reviewed commits** before opening the PR: the plan was always
   two commits (T11 "feat", T12 "feat") — `1c5df30` is neither; it is scaffolding to survive the quota
   window. Rewrite history (`git reset --soft cf5b3c5` and re-commit in clean pieces) or accept a third
   honest commit that supersedes the WIP label once everything above is verified — controller's call on
   which is cleaner for review, but the PR must not carry a commit literally titled "wip" without at least
   a follow-up commit explaining resolution.
8. **Rebase onto whatever `origin/main` actually is by then, keep-both on `apps/server/package.json`'s
   scripts block** (ops:* beside seed:* and sweep:*, per the controller's #154/#167+#169 messages),
   `pnpm install` after, re-run `check-case-ids.mjs` and `check-env-example.mjs` again post-rebase.
9. **Run the full gate under Gate Lock v3.2** (name the script `gate.sh`, libpq PATH export inside the
   same backgrounded invocation) before pushing further or opening the PR.
10. **THEN** push and open one PR for T11+T12 (or T11 alone if T12 genuinely doesn't converge — say which),
    per the override brief. Report to `gisik-nokma-0d` with head sha, `Tasks:` line, test count, node
    version, `0 cached`, `check:env` on its own line, and the honest sentence about what was not verified.
11. **Do not start the two follow-up errands** (`ops:sweep-orphans`, scheduling `sweep-notifications`,
    both to fold into `src/ops/schedule.ts`) until T11+T12's PR is open — they were explicitly queued
    "after T11+T12, not now" by the controller.

## THINGS A RESTARTED SESSION MUST NOT ASSUME

- **`1c5df30` is not evidence of anything passing.** It is an unverified snapshot. Every claim inside its
  commit message is the checkpoint-writer's best understanding of what a background agent reported, not
  independently confirmed.
- **The background workflow may or may not still be running or resumable.** Check `/workflows` or attempt
  the `resumeFromRunId` above; do not assume either outcome.
- **`origin/main` has moved past every sha named to this session by message.** Re-fetch before trusting
  any rebase target.
- **No gate has run on this branch at all yet.** Not once. Do not report a task count or test count for
  this branch until one actually runs.
