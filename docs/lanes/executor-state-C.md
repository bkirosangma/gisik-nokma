# Lane C — live state (Plan 10 Task 16, `apps/desktop` Tauri shell)

**Worktree:** `/Users/kiro/my_projects/gisik-nokma-lanes/lane3-plan7-8`
**Branch:** `exec/21-plan10-t16-desktop`, cut from `origin/main` at `1e372e3` (verify with
`git branch --contains` — empty means orphaned).
**Base at last check:** `origin/main` = `1e372e3` ("Resume as five parallel lanes...", PR #111).

## STATUS: Task 16 implemented, gated, and ready for PR — check for an open PR before redoing this

If you are resuming and `gh pr list --head exec/21-plan10-t16-desktop` shows an open PR, **this task is
done** — go straight to reporting/waiting on the controller, do not re-implement.

## SAFETY CORRECTIONS received from peers this session — adopt all, supersede the base brief where noted

**1. The reap command (from gisik-nokma-0d / Lane E).** The base brief's "reap `pgrep -f vitest`
survivors" is DANGEROUS under five concurrent lane sessions: `pgrep -f vitest` matches every lane
session's own command line (each embeds the brief text, which contains the word "vitest") plus any
peer's live test run. Running `pkill -f vitest` or killing `pgrep -f vitest`'s output would kill lanes
A–E and a peer's live gate. **The orphan criterion is `ppid=1` (reparented to launchd), never a name/arg
substring match alone.** The only reap command to use from now on:

    ps -eo pid=,ppid=,comm=,args= | awk '$3 ~ /node$/ && $2 == 1 && index($0, "vitest") > 0 {print $1}'

Read the list before killing anything; expect it EMPTY. Never `pkill -f vitest`, never blind-kill
`pgrep -f vitest` output. (Used twice this session — both times empty, as expected for package-scoped
`vitest run` invocations that complete before the next command.)

**2. The gate lock protocol (from Lane B, then refined by Lane E) — relevant ONLY if you ever run the
FULL `pnpm turbo run build test typecheck` gate, which this task's own scope does not require.** The
original `echo $$ > pid` pattern never actually held the lock — each Bash tool call is a fresh shell, so
the recorded pid dies within seconds and every peer's stale-check reclaims the lock almost immediately.
Two 9-worker pools ran concurrently on 2026-09-06 and the box hit ~66MB free / 65% swap (the 2026-09-04
crash shape). If a full gate is ever needed from this lane, use ONE backgrounded invocation
(`run_in_background: true`), never split across calls or foregrounded with a sleep:

    until mkdir /tmp/gisik-gate.lock 2>/dev/null; do
      p=$(cat /tmp/gisik-gate.lock/pid 2>/dev/null)
      if [ -n "$p" ]; then
        if ! ps -p "$p" >/dev/null 2>&1; then rm -f /tmp/gisik-gate.lock/pid; rmdir /tmp/gisik-gate.lock 2>/dev/null; fi
      else
        # empty-pid lock = a holder that died between mkdir and writing pid; reclaim after 60s, say so.
        : # (age check omitted here; see Lane E's refinement — 60s grace before reclaiming a pidless lock)
      fi
      sleep 15
    done
    echo $$ > /tmp/gisik-gate.lock/pid
    trap 'rm -f /tmp/gisik-gate.lock/pid; rmdir /tmp/gisik-gate.lock 2>/dev/null' EXIT
    # bound the zero-live-pools wait (~10 min) and say so loudly if you hit the bound — a silent wait
    # reads as a hang.
    while [ "$(ps -eo comm= | grep -c '^node (vitest')" -gt 0 ]; do sleep 15; done
    source ~/.nvm/nvm.sh && nvm use 22 && pnpm turbo run build test typecheck --force --concurrency=1 > gate.log 2>&1
    echo GATE_EXIT=$? >> gate.log

This task did NOT need the full gate — package-scoped `cargo check` + `tsc` + `vitest` in `apps/desktop`
touches nothing in `apps/server`, so no lock was taken. Recorded here only so a future task in this lane
does not rediscover the crash.

## What Task 16 actually is, and the one thing it could not close

`apps/desktop` — Tauri 2 + Vite React shell over the replica `DataSource`. Implemented via a background
Workflow (sonnet scaffold → opus review of `tauri-sql-storage.ts`, the one honesty-carrying file → no
fable anywhere in this lane), then hardened directly:

- **Real deviations from the plan's stale Task 16 text**, verified against actual source, not guessed:
  `createReplicaDataSource`/`ReplicaDataSource`/`TicketSummary` live in `@gisik-nokma/app-core` (not
  `sync-client`) with `ReplicaDataSourceDeps` needing `workspaceId` + `storage` the plan's snippet omits;
  `SyncStatusBar`/`ContestBanner` do not exist yet (Plan 6 hasn't landed them — rendered inline instead);
  `ds.query.listTickets` does not exist — used the real `listTicketSummaries`; react pinned to `^19.0.0`
  (not the plan's `18.3.1`) to match `app-core`'s peer dependency; `build` script is `vite build` only
  per this lane's override, with a separate `typecheck` script; `apps/desktop/src/vite-env.d.ts` added
  (plan's file list omits it, `import.meta.env` needs it).
- **Beyond the plan's own fixture test**: added
  `apps/desktop/src/storage/tauri-sql-storage.conformance.test.ts`, running the real
  `storageConformanceTests` (from `@gisik-nokma/sync-client/testing`) against the adapter backed by a
  real in-memory `better-sqlite3` database, not another mock. Both test files' load-bearing-ness was
  proven by mutation (swap the catch-branch `ROLLBACK` for `COMMIT` → both files go red,
  `Tests 2 failed | 3 passed (5)`; restored and re-verified green by reading the file back — **`git diff`
  is silent on an untracked path regardless of content and is NOT evidence of restoration; I made this
  mistake mid-session and caught it by re-reading the file, not by trusting the silent diff**).
- **`apps/desktop/src-tauri/icons/icon.png`** (placeholder) was required beyond the plan's file list —
  `tauri::generate_context!()` unconditionally needs it on a Unix target (verified in `tauri-codegen`'s
  own source); real artwork still needed before any actual build.
- **`.gitignore`** gained `**/src-tauri/target/` and `**/src-tauri/gen/` (globstar, not a bare
  `src-tauri/gen/`, which would anchor to the repo root and never match a nested app).

**CRITICAL, RECORDED NOT FIXED — reported to gisik-nokma-0d, this is a scope question, not a to-do:**
`tauri-plugin-sql` 2.4.1's public `Builder` (verified by reading its own source in the local cargo
registry cache: `~/.cargo/registry/src/index.crates.io-*/tauri-plugin-sql-2.4.1/`) exposes NO pool-size
or connection-pinning option — `DbPool::connect` uses sqlx's `Pool::connect`, defaulting
`max_connections` to 10. `wrapTauriDatabase`'s promise queue serialises this module's JS callers but
CANNOT guarantee `BEGIN IMMEDIATE`/writes/`COMMIT`/`ROLLBACK` land on the same pooled SQLite connection —
a concurrent unqueued read (which `app.tsx` issues on every change notification) can be routed to a
second connection mid-transaction. **This cannot be closed from apps/desktop's TypeScript** — it needs
either a Rust-side fork of the plugin or a different plugin/architecture, both outside a Tauri-shell
scaffold task. Documented in the adapter's own docblock, in `Features.md` §12, and in `test-cases/12`
(12.190's "RECORDED, NOT FIXED" item 0), each naming the owner as "whoever next hardens this adapter for
real multi-device use — a decision no task owns yet." The Important finding from the same review (
`createTauriSqlStorage` minted a fresh queue on every call, defeated by React.StrictMode's double-invoke)
WAS fixed — see the module-level `openStorages` cache in `tauri-sql-storage.ts`.

## Gate — independently re-verified by me, not just the workflow's self-report

Node 22 (`nvm use 22`). From `apps/desktop`: `pnpm exec tsc -p tsconfig.json` → `TypeScript: No errors
found`, exit 0. From `apps/desktop/src-tauri`: `cargo check` → `Finished` profile, exit 0 (cargo/rustc
1.95.0). From `apps/desktop`: `rtk proxy "pnpm exec vitest run --reporter=verbose"` (plain `pnpm exec
vitest run` gets collapsed by the rtk hook to a bare `PASS/FAIL` line with no counts — use the proxy form
for real counts) → `Test Files 2 passed (2)`, `Tests 5 passed (5)`. No orphaned vitest workers after any
run (checked with the corrected `ppid=1` filter above, each time empty).

**Full monorepo gate does NOT reach `apps/desktop` on this branch** — confirmed via
`pnpm turbo run build test typecheck --dry-run=json` (safe, no execution): `@gisik-nokma/desktop#build`
depends on `@gisik-nokma/app-core#build`, which fails with 8 pre-existing TypeScript errors in
`packages/app-core/src/precheck.ts:168,201` — confirmed present on unmodified `origin/main`
(`git diff origin/main -- packages/app-core/src/precheck.ts` returns empty) and NOT introduced by this
task. State this plainly in the PR: this task's own three checks are the honest T16 gate; a full gate on
this branch currently fails upstream of `apps/desktop` for a pre-existing, unrelated reason.

**No simulator, no app launch, no `tauri build` claim anywhere** — `vite build`/`tauri dev`/`tauri build`
were never run, per this lane's explicit scope.

## Next steps on resume

1. If no PR is open yet: stage `apps/desktop/**` (excluding `node_modules`, `src-tauri/target`,
   `src-tauri/gen` — the `.gitignore` edit already excludes the latter two), `.gitignore`, `Features.md`,
   `test-cases/12-offline-sync-apps.md`, `pnpm-lock.yaml`, and this file; commit; push; open ONE PR
   against `main` from `exec/21-plan10-t16-desktop`. Rebase onto `origin/main` first if it has moved —
   `pnpm-lock.yaml` conflicts resolve by re-running `pnpm install`, never by hand.
2. Report to `gisik-nokma-0d` with head sha, the three-check summary (cargo/tsc/vitest, all exit 0, 5
   tests), node version (22.22.2), `0 cached`, the Critical finding (own paragraph, named as a scope
   question per this lane's own reporting rule: Critical AND changes the step's scope), and the full-gate
   pre-existing-failure note above. Sign "Lane C".
3. Do not merge — the controller merges.
