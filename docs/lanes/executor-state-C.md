# Lane C — live state (Plan 10 Task 16, `apps/desktop` Tauri shell)

**Worktree:** `/Users/kiro/my_projects/gisik-nokma-lanes/lane3-plan7-8`
**Branch:** `exec/21-plan10-t16-desktop`, rebased onto `origin/main` twice (past #109/#119 and again past
#117/#122).

## STATUS: DONE from Lane C's side — PR #120 open at head `c631500`, full gate GREEN (27/27)

If you are resuming, do not re-implement. `gh pr view 120` for current state; the controller merges at
exactly `c631500` unless it has since asked for another change. Reported to `gisik-nokma-0d` with the
full gate line; awaiting merge.

## SAFETY CORRECTIONS received from peers this session — adopt all, supersede the base brief where noted

**1. Reap by `ppid=1`, never `pgrep -f vitest`.** `pgrep -f vitest` matches every lane session's own
command line (each embeds brief text containing the word "vitest") plus any peer's live test run.
`pkill -f vitest` or killing its output would kill lanes A–E and a peer's live gate.

    ps -eo pid=,ppid=,comm=,args= | awk '$3 ~ /node$/ && $2 == 1 && index($0, "vitest") > 0 {print $1}'

Read the list before killing anything; expect it EMPTY. Landed on `main` in `CLAUDE.md` (commit
`dc2ad58`).

**2. The gate lock — the original `echo $$ > pid` pattern never actually held it** (each Bash tool call
is a fresh shell, so the pid dies in seconds and every peer's stale-check reclaims almost immediately).
Corrected protocol, refined twice more (empty-pid 60s grace; bounded 10-min zero-live-pools wait, loud on
the bound), used successfully for this lane's own full gate run:

    LOCK=/tmp/gisik-gate.lock
    while ! mkdir "$LOCK" 2>/dev/null; do
      p=$(cat "$LOCK/pid" 2>/dev/null)
      if [ -n "$p" ]; then
        ! ps -p "$p" >/dev/null 2>&1 && { rm -f "$LOCK/pid"; rmdir "$LOCK" 2>/dev/null; }
      else
        age=$(( $(date +%s) - $(stat -f %m "$LOCK" 2>/dev/null || echo 0) ))
        [ "$age" -ge 60 ] && rmdir "$LOCK" 2>/dev/null
      fi
      sleep 15
    done
    echo $$ > "$LOCK/pid"
    trap 'rm -f "$LOCK/pid"; rmdir "$LOCK" 2>/dev/null' EXIT
    waited=0
    while [ "$(ps -eo comm= | grep -c '^node (vitest')" -gt 0 ]; do
      [ "$waited" -ge 600 ] && { echo "LOUD: 10-min bound hit, proceeding anyway"; break; }
      sleep 15; waited=$((waited+15))
    done
    source ~/.nvm/nvm.sh && nvm use 22
    pnpm turbo run build test typecheck --force --concurrency=1 > gate.log 2>&1
    echo "GATE_EXIT=$?" >> gate.log

Run as ONE `run_in_background: true` invocation, never split across calls or foregrounded with a sleep.

**3. Postgres went down mid-session** (Docker VM disk full, panic-loop on checkpoints) and came back
(Lane E cleared its own build cache). **Verify independently before trusting either state** —
`docker exec <postgres-container> pg_isready` — rather than taking a peer's word for it either way.

## What Task 16 actually is

`apps/desktop` — Tauri 2 + Vite React shell over the replica `DataSource`. Scaffolded via a background
Workflow (sonnet implement → opus review of `tauri-sql-storage.ts`, the one honesty-carrying file; no
fable anywhere in this lane), then hardened directly. Full detail is in the PR body and in
`Features.md`/`test-cases/12` (case 12.228–12.229); the headline points:

- **Real deviations from the plan's stale Task 16 text**, verified against actual source:
  `createReplicaDataSource`/`ReplicaDataSource`/`TicketSummary` live in `@gisik-nokma/app-core` (not
  `sync-client`) with `workspaceId`/`storage` in its deps; `SyncStatusBar`/`ContestBanner` don't exist
  yet (rendered inline); `listTicketSummaries` replaces the nonexistent `listTickets`; React `^19` to
  match `app-core`'s peer dependency; separate `build`/`typecheck` scripts per this lane's override.
- **Beyond the plan's fixture test**: a conformance test running the real `storageConformanceTests`
  against the adapter backed by a genuine in-memory `better-sqlite3` database. Both test files proven
  load-bearing by mutation.
- **`apps/desktop/src-tauri/icons/icon.png`** (placeholder) required beyond the plan's file list —
  `tauri::generate_context!()` needs it on Unix, verified in `tauri-codegen`'s own source.
- **`.gitignore`** gained `**/src-tauri/target/` and `**/src-tauri/gen/`.

**CRITICAL, MEASURED not fixed — reported to the controller, ruled on, re-measured per that ruling:**
`tauri-plugin-sql` 2.4.1's public `Builder` exposes no pool-size/connection-pinning option. Per the
controller's ruling, evaluated the TypeScript-side option too before accepting this as permanent: built
a standalone `sqlx=0.8.6` probe (the plugin's own pinned version) replicating its exact
`Pool::connect`/`sqlx::query`/`pool.execute` pattern. Result — this adapter's own BEGIN-then-INSERT
pattern reproducibly hits `SQLITE_BUSY (code 5)` with **zero concurrency** (not just a race); a single
`execute()` call carrying a whole transaction as one multi-statement string **does** work and pins the
connection, but does **not** generalise here because every real production caller of
`SyncStorage.transaction` (`schema.ts`, all four sites in `replica.ts`) reads with `tx.all()` inside the
transaction and branches on the result — dynamic control flow no pre-built SQL string can express.
Documented with this measurement in the adapter's docblock, `Features.md` §12, and `test-cases/12`
(case 12.229's "RECORDED, NOT FIXED" item). Owner: whoever next hardens this adapter for real
multi-device use. The paired Important finding (StrictMode double-invoke defeating the queue) **was**
fixed with a per-`dbName` cache in `createTauriSqlStorage`.

## Gate — independently re-verified twice, not just self-reports

Package-scoped (every push): node 22, `tsc -p apps/desktop/tsconfig.json` clean, `cargo check` in
`src-tauri` clean, `vitest run` in `apps/desktop` → 5/5 (use `rtk proxy "pnpm exec vitest run
--reporter=verbose"` — the bare form collapses to a count-free `PASS/FAIL` line via the rtk hook).

**Full monorepo gate — corrected finding.** An earlier revision of this file and the PR claimed the full
gate could not reach `apps/desktop` because `app-core` had 8 pre-existing TS errors on `origin/main`.
**That was wrong** — it was a stale-`dist` artifact of this reused worktree (rebuild fresh:
`pnpm turbo run build --filter=@gisik-nokma/app-core... --concurrency=1` → 5/5). The controller caught
this; corrected in the PR body. The REAL full gate (run once Postgres was confirmed back, through the
corrected lock protocol): **27/27 tasks, exit 0, 0 cached** — `@gisik-nokma/server:test` 90 files / 979
tests against the recovered Postgres, `@gisik-nokma/desktop:test` 2/5 matching the package-scoped run,
`@gisik-nokma/desktop:typecheck` clean. No orphaned vitest workers, lock released cleanly.

**No simulator, no app launch, no `tauri build` claim anywhere.**

## If resumed after a restart with no PR visible

Something went wrong between here and GitHub. `git log --oneline -8` on this branch should show the
Task 16 commit plus two doc-fix/measurement commits; if branch content looks right but no PR exists,
just `gh pr create` (see git history for the body shape) rather than redoing any of the above work.
