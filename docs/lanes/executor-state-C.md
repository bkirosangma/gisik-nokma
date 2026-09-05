# Lane C — live state (Plan 10 Task 16, `apps/desktop` Tauri shell)

**Worktree:** `/Users/kiro/my_projects/gisik-nokma-lanes/lane3-plan7-8`
**Branch:** `exec/21-plan10-t16-desktop`, cut from `origin/main` at `1e372e3` (verify with
`git branch --contains` — empty means orphaned).
**Base at last check:** `origin/main` = `1e372e3` ("Resume as five parallel lanes...", PR #111).

## Where this is

Fresh lane start, 2026-09-06. No prior executor-state-C.md existed. Read `docs/lanes/controller-state.md`
top section (`⚡ RESUMED 2026-09-06`) for the five-lane topology — this file only tracks Lane C's own
position.

**In flight:** a background Workflow (`wf_3df8650b-3fb`, task id `w1n32eoc7`) is implementing Task 16 —
`apps/desktop`, a Tauri 2 + Vite React shell over the replica `DataSource`. Three phases: Implement
(sonnet, medium) → Review (opus, high, the one honesty-carrying file: `tauri-sql-storage.ts`) → conditional
Fix (sonnet, medium, only if the reviewer found Important/Critical). No fable anywhere in this lane per the
lane brief ("a Tauri shell is a scaffold... do not use a butcher's knife to kill a chicken").

## Research done before dispatch (so a restart does not redo it)

Verified against real source, not the plan doc alone — the plan text at
`docs/superpowers/plans/2026-08-20-10-offline-sync-apps.md:6524-6931` (Task 16) is stale in several places:

1. `createReplicaDataSource` / `ReplicaDataSource` / `TicketSummary` live in **`@gisik-nokma/app-core`**
   (`packages/app-core/src/replica/replica-data-source.ts`), NOT `@gisik-nokma/sync-client` as the plan's
   `app.tsx` snippet imports them from. Consistent with Ruling P30 and the deviation controller-state.md
   already recorded for T11/T12.
2. `ReplicaDataSourceDeps` is `{ workspaceId: string; replica; outbox; engine; storage }` — the plan's
   snippet calls `createReplicaDataSource({replica, outbox, engine})`, missing `workspaceId` and `storage`.
3. `SyncStatusBar` / `ContestBanner` do not exist anywhere in `@gisik-nokma/app-core` yet (grepped the
   whole package) — Plan 6 has not landed them; the plan's own text flags this as an assumption. The shell
   must render sync status inline instead.
4. `ds.query.listTickets` does not exist. The real, already-shipped method is
   `listTicketSummaries(workspaceId): Promise<TicketSummary[]>`, returning exactly the shape the plan's
   hand-rolled ticket-list rendering expects (`title`, `stateId`, `pending`, `openContests`).
5. `apps/desktop`'s `package.json` `build` script must be `"vite build"` only (lane brief supersedes the
   plan's `"tsc ... && vite build"`) — turbo's generic pipeline gates it; a separate `"typecheck"` script
   carries `tsc`.
6. React version should be `^19.0.0` (matching `@gisik-nokma/app-core`'s peer dependency and `apps/web`),
   not the plan's pinned `18.3.1` — installing 18 would create a second incompatible React copy in the
   workspace. This is a judgment call I made, not an owner ruling — flagged for the reviewer.
7. `packages/sync-client`'s `./testing` subpath (`storageConformanceTests`) exists precisely so every
   `SyncStorage` adapter is checked against ONE behavioural contract. The plan's Step 2 test alone (a
   fixture with `vi.fn()`) is NOT that suite — I required the implementer to add a second test,
   `tauri-sql-storage.conformance.test.ts`, wrapping a real in-memory `better-sqlite3` database behind a
   fake matching `tauri-plugin-sql`'s `execute`/`select` shape, run through the real
   `storageConformanceTests`. This is the check most likely to catch a transaction-queue bug the fixture
   test's exact-string-sequence assertion would miss.
8. `apps/desktop/src/vite-env.d.ts` (a triple-slash `vite/client` reference) is required for
   `import.meta.env.VITE_API_BASE` to typecheck — the plan's file list omits it.

Gate for this task, per the lane brief: `cargo check` in `src-tauri`, `tsc`, and `vitest` on the storage
adapter. **No simulator, no app-launch, no `tauri build` claim** — must say so explicitly in the PR and in
the `Features.md` / `test-cases/12` entries.

## What is NOT done yet

- Workflow result not yet returned (implement/review/fix). Do not assume pass — read the actual result
  when the notification lands, then independently re-run `cargo check` / `tsc` / `vitest` myself before
  writing any gate-honesty claim into a commit or PR (per "verify what the handoff claims, do not adopt
  it" — that rule applies to my own workflow's self-report too).
- `Features.md` §Plan 10 T16 entry and `test-cases/12` T16 catalogue rows: NOT YET WRITTEN. Append only —
  never touch other lanes' entries in the same section (collision map: A, B, C, D each append only their
  own plan's section; Lane B's T18 owns §12's final shape).
- Commit, push, PR: NOT YET DONE.
- `pnpm-lock.yaml` will have changed (new package added) — expect a conflict on rebase if another lane
  also touched it; resolve by re-running `pnpm install`, never by hand (named collision in
  controller-state.md).

## Next steps on resume

1. Check workflow `wf_3df8650b-3fb` / task `w1n32eoc7` result (via task notification, or `Workflow`
   resume with the same `scriptPath` + `resumeFromRunId` if the notification was missed — cached agent
   results return instantly).
2. Independently re-run: node 22 (`nvm use 22`), `cargo check` in `apps/desktop/src-tauri`,
   `pnpm exec tsc -p apps/desktop/tsconfig.json` (or via turbo), `pnpm exec vitest run` in `apps/desktop`
   (package-scoped — does NOT touch `apps/server`, so the gate lock is not needed for this package's own
   tests; only a *full* `pnpm turbo run build test typecheck` invocation would need the lock).
3. Append `Features.md` (Plan 10 section) and `test-cases/12` (own T16 rows only) with the honest gate
   description — name exactly cargo check + tsc + vitest, and name exactly what was NOT verified
   (simulator, app launch, `tauri build`).
4. Commit (`Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>` per the base brief's
   convention), push, open ONE PR. Rebase onto `origin/main` first if it has moved.
5. Report to `gisik-nokma-0d` (or tmux `gisik:0`) with head sha, `Tasks:` line, test count, node version,
   `0 cached`, and the honest not-verified sentence. Signed "Lane C".
