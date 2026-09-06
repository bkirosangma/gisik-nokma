# Lane C — executor state (Plan 11 T14 done, T15 in flight)

**This file is Lane C's restart surface, and nobody else's.** `executor-state.md` is Lane A's,
`executor-state-B.md`/`-D.md`/`-E.md` belong to their own lanes — never edit them. A Lane C session
relaunched from the controller's override recovers only what is written here.

> **Shas in narrative prose below are facts about when they were written.** Verify with
> `git branch --contains <sha>` — **empty output means orphaned**. `git cat-file` passes on reflog-only
> commits and will lie to you.

---

## SAFETY CORRECTIONS received from peers — adopt all, they still bind

**1. Reap by `ppid=1`, never `pgrep -f vitest`.** `pgrep -f vitest` matches every lane session's own
command line (each embeds brief text containing the word "vitest") plus any peer's live test run.
`pkill -f vitest` or killing its output would kill lanes A–E and a peer's live gate.

    ps -eo pid=,ppid=,comm=,args= | awk '$3 ~ /node$/ && $2 == 1 && index($0, "vitest") > 0 {print $1}'

Read the list before killing anything; expect it EMPTY.

**2. The gate lock — a bare `echo $$ > pid` pattern never actually holds it** (each Bash tool call is a
fresh shell, so the pid dies in seconds and every peer's stale-check reclaims almost immediately). Use an
`mkdir`-based lock, ONE `run_in_background: true` invocation, never split across calls or foregrounded:
acquire by looping `mkdir /tmp/gisik-gate.lock`, record `$$` in `pid` inside it, `trap` cleanup on EXIT,
then run `pnpm turbo run build test typecheck --force --concurrency=1 > gate.log 2>&1; echo
GATE_EXIT=$? >> gate.log` inside the held lock. This session's own script:
`scripts/laneC-gate.sh` pattern (kept in the session scratchpad, not committed) — reap orphans first,
then wait-and-acquire, then run.

**3. Verify shared external state independently before trusting a peer's word or a stale gate log** —
Postgres reachability, whether a branch a peer describes has actually merged, whether `origin/main`
moved again since your last fetch. This session hit exactly that last one twice in one restart (below).

## STATUS AS OF THIS WRITE, 2026-09-06 ~07:45 IST

**T14 is MERGED** — PR #134 at `3571d38` on `main`, promoted to done (11/14) at `cc42d01` (#144), both
confirmed reachable via `git branch --contains`. Nothing to do there; do not re-implement it.

**T15 is committed and gated green on branch `exec/28-plan11-do-spec`, not yet pushed/PR'd as of this
write — check below before assuming it still isn't.** Restarted this session cut the branch fresh from
`origin/main` (`git checkout -b exec/28-plan11-do-spec origin/main`, base `3571d38`), cherry-picked the
prior session's WIP commit (`2df7cf5`, held on the old branch `exec/24-plan11-ci-deploy` for exactly this
reason), then amended it into a real commit (dropped the "WIP" message) after folding in cross-lane
review from Lane E and rebasing.

## LIVE ANCHORS — verified 2026-09-06 ~07:48 IST, re-verify before trusting

| anchor | value | how verified |
|---|---|---|
| worktree | `/Users/kiro/my_projects/gisik-nokma-lanes/lane3-plan7-8` | `pwd` |
| branch | `exec/28-plan11-do-spec` (NEW — the old `exec/24-plan11-ci-deploy` is merged, left alone) | `git branch --show-current` |
| HEAD | `c48302c` | `git rev-parse HEAD` |
| `origin/main` at last rebase | `1b72900` (Closure 5 / Ruling P37, #139) | `git rev-parse origin/main`, `git branch --contains 1b72900` includes this branch |
| ahead of `origin/main` | 1 commit (T15, real message) | `git log origin/main..HEAD --oneline` |
| `pnpm check:env` | exit 0, 47 documented / 26 referenced, unchanged by this branch's additions | ran directly on the rebased tree |
| `scripts/check-case-ids.mjs` | exit 0, 1272 unique ids, highest `13.76`, self-test passes | ran directly on the rebased tree |
| `scripts/check-db-timezone.mjs` | exit 0 against shared dev Postgres (`localhost:54329`), prints `Asia/Kolkata` | ran directly |
| full forced gate at `3571d38`+T15 (BEFORE the Closure-5 rebase) | green: `GATE_EXIT=0`, 30/30 tasks, 0 cached, 253 files / 3320 tests, 1m45s | `/tmp/laneC-gate2.log` — **superseded by the re-gate below, kept only as a data point** |
| full forced gate at `c48302c` (AFTER rebasing past Closure 5, HEAD before the handoff commit) | **green: `GATE_EXIT=0`, 30/30 tasks, 0 cached, 256 files / 3334 tests, 1m27s** — `origin/main` re-fetched immediately after and confirmed unchanged (`1b72900`) before trusting this | `/tmp/laneC-gate3.log`, summed directly from its per-package `Test Files`/`Tests` lines, not estimated |

**The trap this restart actually hit, twice, worth naming for the next one:** `origin/main` moved TWICE
between "fetch and branch" and "ready to commit" — once by two docs-only commits (safe to ignore), once
by a real code merge (Lane B's Closure 5, `visible-events-for.ts`/sync surface) that landed **during the
gate run this session had already kicked off against the pre-Closure-5 tree**. A gate that passed against
a tree you then rebased past is not evidence about the tree you're now on — **re-verify `origin/main`'s
sha immediately before trusting any completed gate, not just before starting one.**

## WHAT'S IN THE T15 COMMIT

`deploy/do/app.yaml` + `deploy/do/README.md` (DigitalOcean App Platform spec: server/web/backup-worker,
region `blr`, managed Postgres, object storage + backup env vars named against the ACTUAL schema —
`OBJECT_STORE_S3_*`/`SERVER_ORIGIN`/`NEXT_PUBLIC_SERVER_URL`, not the plan's unread `S3_*`/
`NEXT_PUBLIC_API_URL`/`NEXT_PUBLIC_WS_URL` draft; `MAGIC_LINK_FROM=contact@artsourced.in` per the 2026-09-02
owner correction; not applied to any live app), `scripts/check-db-timezone.mjs` (falsifiable against a
throwaway UTC-forced database, re-verified against the shared dev Postgres this restart), root
`package.json` (+`check:db-tz` script, +`pg` devDependency `^8.13.0`→resolved `8.23.0`) + regenerated
`pnpm-lock.yaml` (cleared with Lane E as manifest owner — confirmed by Lane E directly, no collision),
`Features.md` + `test-cases/13-deployment-dogfooding.md` (13.7/13.8 flipped `❌`→`🧪` now the files
actually exist on this branch).

**Two items folded in from Lane E's cross-lane review during this restart, both phrased to hold
regardless of merge order** (Lane E flagged that the first draft of both was only true *because* of an
assumed merge order — the exact "checks that cannot fail" class this whole series hunts):
- README's `DATABASE_CA_CERT`/`sslmode` item now states the CA-discard as a present-tense fact about
  `main` today (not "Lane E fixed it"), naming Lane E's T1 `withoutSslParameters` (`apps/server/src/db.ts`,
  on unmerged `origin/exec/23-plan11`) as the fix and stating plainly "until that lands, a CA set here has
  no effect."
- `app.yaml`'s `TRUST_PROXY` comment now names the rightmost-XFF rate-limit-key fix as "Plan 11 T2 (not
  yet on main)" and states the forged-header gap is open on whatever's on `main` today — not contingent on
  which PR merges first.

Confirmed directly against Lane E's branch (`origin/exec/23-plan11` at `f7c9b0f` when checked, later
`T2 committed and green` per Lane E's own report): `DEPLOY_SHA`, `TRUST_PROXY`, `RATE_LIMIT_*`,
`ALERT_WEBHOOK_URL`, `SMTP_URL`, `MAGIC_LINK_FROM`, `DATABASE_CA_CERT` all land in `config.ts` under the
exact names this spec already uses — no renaming needed when Lane E's branch merges.

## NEXT STEPS, IN ORDER

1. **Re-verify `origin/main`'s sha right now** — do not trust the "AFTER rebasing past Closure 5" gate
   row above without re-fetching first; another lane may have merged again since this was written.
2. Confirm the re-gate's `GATE_EXIT=` line is `0` at the CURRENT `origin/main` sha. If `origin/main` moved
   again while that gate ran, rebase again and re-gate again — do not commit/push on a stale gate.
3. Push `exec/28-plan11-do-spec`, open the T15 PR. Report to `gisik-nokma-0d`: head sha, `Tasks:` line,
   test count, node version, `0 cached`, `check:env` on its own line, and the honest sentence: "the spec
   was not applied to any live app."
4. Do NOT start any other Plan 11 task without a controller message (Lane D has T7/T8/T9/T10, Lane E has
   everything else named in the file map from the override brief).

## THINGS A RESTARTED SESSION MUST NOT ASSUME

- Any sha in this file is stale the moment another lane's PR merges — `origin/main` moved three times in
  the roughly 20 minutes this restart took to get T15 from cherry-pick to gate. `git fetch` and compare
  before trusting an anchor, including the ones in this file.
- A gate log's `GATE_EXIT=0` is evidence about the tree it ran against, not about "the branch" in general —
  check the log's own timestamp against `git log -1 --format=%cd` and against whether you've rebased since.
- Lane E's branch (`origin/exec/23-plan11`) is unmerged and moving — anything cited from it above
  (`DEPLOY_SHA`, `TRUST_PROXY` semantics, the CA fix) is real on that branch, not yet on `main`. The T15
  files are written so their prose stays true either way; re-check that a later edit hasn't broken that
  property if you touch them again.
