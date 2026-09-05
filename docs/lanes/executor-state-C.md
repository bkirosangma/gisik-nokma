# Lane C — executor state (Plan 11 T14 → T15)

**This file is Lane C's restart surface, and nobody else's.** `executor-state.md` is Lane A's,
`executor-state-B.md`/`-D.md`/`-E.md` belong to their own lanes — never edit them. A Lane C session
relaunched from the controller's override recovers only what is written here.

> **Shas in narrative prose below are facts about when they were written.** Verify with
> `git branch --contains <sha>` — **empty output means orphaned**. `git cat-file` passes on reflog-only
> commits and will lie to you.

---

## STATUS AS OF THIS WRITE: T14 PR #134 open with two amendments, third CI run in flight; T15 committed locally, not yet its own PR

**PR #134** (Plan 11 T14, ci.yml 8-job split) head is `0761d08`, rebased onto `63296d2`. Two amendments
landed on top of the original `e78212b`:
1. Root-`package.json` script omission stated explicitly + §13 id-block allocation header (controller's
   first catch: the plan's Files: block names root scripts this PR never added or explained).
2. Two more controller catches, both fixed: (a) `test-cases/13`'s 13.7/13.8 described T15 artifacts
   (`deploy/do/app.yaml`, `check-db-timezone.mjs`) not on this branch — flipped to `❌` naming Task 15's
   PR as the real landing point; (b) added `scripts/check-case-ids.mjs` (a cross-style duplicate-case-id
   detector, self-tested against a checked-in fixture BEFORE trusting the real sweep — this session's own
   first draft had a real bug the fixture caught: a greedy marker-group swallowed a compound id line
   whole and reported the wrong number as duplicated), which found two genuine pre-existing ambiguities
   in `test-cases/07-api-realtime-search.md` (not this PR's file). Controller ruled: reword the two
   ambiguous lines rather than add a checker exception (an exception for that section shape would itself
   be a check that cannot fail for what it exempts) — done, Lane A notified (it mints in §7).

**CI run in flight at push time** (`33995268917`) — **re-check its conclusion, do not assume green.** Two
earlier runs at prior heads were both fully green (all 11 jobs each, verified via `gh api .../jobs`, not
just top-level conclusion): `e78212b` (original) and the first-amendment head. The SECOND amendment's own
run has not yet been read by this session as of this write.

**T15** (deploy/do/ spec) is fully drafted, sonnet-reviewed (one nit, fixed), and refined via repeated
cross-session exchange with Lane E (DEPLOY_SHA shape/scope, an sslmode/verify-full downgrade risk, pg
moved to root devDependencies not a new dependencies block). Committed LOCALLY as a WIP checkpoint on
top of PR #134's current head — **NOT yet pushed as its own branch/PR**, held per "two PRs, T14 first"
until #134 actually merges.

## LIVE ANCHORS — verified 2026-09-06, re-verify before trusting

| anchor | value | how verified |
|---|---|---|
| worktree | `/Users/kiro/my_projects/gisik-nokma-lanes/lane3-plan7-8` | `pwd` |
| branch | `exec/24-plan11-ci-deploy` | `git branch --show-current` |
| PR #134 head | `0761d08` | `git log --oneline`, matches what was pushed |
| local HEAD (T15 WIP on top) | one commit ahead of `0761d08` | `git log --oneline -3` |
| `0761d08`'s parent chain | `0761d08` → `19f68b3` (amendment 1) → `9c19d2a` (T14) → `63296d2` (origin/main at rebase time) | `git log --oneline` |
| full rebuild at this HEAD | green, cached FULL TURBO; `actionlint`/`check:env`/`check-skipif-coverage`/`check-case-ids`/`check-task-ledger` all clean | ran directly, this session |
| PR #134's 3rd CI run | in flight at write time (`33995268917`) — **re-check**, do not assume green | `gh run view 33995268917` |

## WHAT'S IN #134 (T14, both amendments included)

`.github/workflows/ci.yml` split into 8 jobs (`scope`, `check-env` + `check-skipif-coverage.mjs` +
`check-case-ids.mjs`, `check-tasks`, `build`, `typecheck`, `server-tests` [4-shard], `other-tests`, `e2e`,
aggregating `gate`), `scripts/check-no-silent-skips.mjs`, `scripts/check-skipif-coverage.mjs`,
`scripts/check-case-ids.mjs` + `scripts/fixtures/check-case-ids-fixture.md`, `Features.md` §13 stub,
`test-cases/13-deployment-dogfooding.md` (opened early, merged with Lane D's Tasks 7/8 cases at rebase),
`test-cases/07-api-realtime-search.md` (two disposition bullets reworded), `test-cases/README.md`.

**Opus review findings on the original ci.yml split, all fixed**: (1) `check-no-silent-skips.mjs`'s
`assertions.length > 0` guard let a skipIf file with ZERO assertionResults (an empty-fixture-list guard)
print "ok" — dropped the guard. (2) The guard only covered `server-tests`; added
`check-skipif-coverage.mjs` as a trip-wire in `check-env`. (3) The `e2e` job's stack-detection would have
mis-triggered on `apps/web/playwright.config.ts`, which already exists for an unrelated, deliberately
off-gate mock smoke — fixed to check only for `docker-compose.dev.yml` and never attempt a run.

## WHAT'S IN THE LOCAL T15 WIP (not yet its own PR)

`deploy/do/app.yaml`, `deploy/do/README.md`, `scripts/check-db-timezone.mjs`, root `package.json`
(+`check:db-tz` script, +`pg` in devDependencies), `pnpm-lock.yaml` (regenerated via `pnpm install`),
`Features.md`/`test-cases/13`'s T15 bullets (13.7–13.8, currently `❌` inside PR #134's committed
content — flip them to `🧪` in T15's own PR once these files actually land).

**Corrected against the plan's own draft**: object-storage/web-client env var names
(`OBJECT_STORE_S3_*`/`SERVER_ORIGIN`/`NEXT_PUBLIC_SERVER_URL`, confirmed via `pnpm check:env`'s own
output — not the plan's `S3_*`/`NEXT_PUBLIC_API_URL`/`NEXT_PUBLIC_WS_URL`, which nothing reads).
`DEPLOY_SHA` deliberately OMITTED from `app.yaml` (Lane E confirmed the shape, forthcoming on their
branch; the CI step to keep it current per-deploy is a live-deploy action, out of scope). A third open
item (`sslmode=require` vs `verify-full` on `pg` major bumps) is documented in `deploy/do/README.md`'s
unresolved section.

## GATE LOCK PROTOCOL, AND A MEMORY-PRESSURE NOTE

ONE backgrounded invocation, `mkdir`-based lock, 60s empty-pid grace, 10-min loud-proceed bound. Never
`pkill -f vitest`. **Background wait loops for another lane's PR merge status got killed twice this
session for system-wide memory pressure** (verified: zero of this lane's own orphaned vitest processes
both times) — prefer single lightweight `gh pr view`/`gh run view` checks over a polling loop.

## A STAGING MISTAKE MADE TWICE THIS SESSION — the actual trap for a restarted session

**`git reset --soft <ref>` does NOT unstage anything — it only moves HEAD, leaving the index exactly as
it was.** Twice this session, after `git reset --soft` to re-split a combined commit, `git add <the T14
files>` was additive on top of an index that STILL had T15's files staged from before the reset — and
`git commit` (no pathspec) picked up everything staged, silently recombining T14 and T15 into one commit
again. The fix both times: after `reset --soft`, explicitly `git restore --staged <files to exclude>`
before committing — never assume the index is clean just because the working tree diff looks right.
**Verify with `git diff --cached --name-only` before every commit that is supposed to be scoped.**

## NEXT STEPS, IN ORDER

1. Check `gh run view 33995268917 --json conclusion` and read job steps via `gh api
   repos/bkirosangma/gisik-nokma/actions/runs/33995268917/jobs` before reporting or assuming green.
2. Wait for the controller to merge #134. Do not start T15's PR before that (two-PRs-T14-first).
3. Once #134 merges: `git log --oneline` to find the T15 WIP commit fresh (its sha will have moved),
   `git fetch origin`, rebase T15 onto the new `origin/main`, re-run the FULL forced gate (package.json/
   lockfile changed, so a cached partial run is not sufficient evidence), flip 13.7/13.8 back to `🧪`
   in `test-cases/13-deployment-dogfooding.md` and the matching Features.md bullets, commit for real
   (drop the "WIP" message), push, open PR #2.
4. Report PR #2 to the controller: head sha, `Tasks:` line, test count, node version, `0 cached`,
   `check:env` on its own line, "the spec was not applied to any live app".
5. Do NOT start any other Plan 11 task without a controller message.

## THINGS A RESTARTED SESSION MUST NOT ASSUME

- A CI run starting, or even a prior head's run being green, is not this head's run being green —
  always re-check the specific run id's conclusion and read its job steps.
- Any sha quoted above will be stale the moment another lane's PR merges — `origin/main` moved five
  times in this session's roughly two hours of work. `git fetch` and compare before trusting an anchor.
- The T15 WIP commit's position and sha will have moved if this session did anything after writing this
  section — use `git log --oneline` fresh.
