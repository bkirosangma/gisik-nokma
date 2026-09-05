# Lane D (periphery) — execution state, Plan 10 Task 17 (`apps/mobile`)

**Written 2026-09-06, after both opus reviews, three rebases (past Closure 1, past T13/#117 with real
rewiring, past T16/#120), a Postgres outage (resolved), and a floating-semver typecheck break (fixed).**
This file is Lane D's own restart surface — never edit `executor-state.md` (Lane A's) or the other
lanes' `executor-state-{B,C,E}.md`.

## 1. Position

- Worktree: `/Users/kiro/my_projects/gisik-nokma-lanes/lane4-periphery`, branch `exec/22-plan10-t17-mobile`.
- HEAD is `fd5cf24`, one commit on top of `origin/main` @ `9e8777e` (Plan 10 Task 16, Lane C, PR #120)
  — rebased there, not merged. Verify with `git merge-base --is-ancestor origin/main HEAD` before
  trusting this; re-fetch/re-rebase if `origin/main` has moved since (it has moved twice already after
  this PR first opened — check every time, don't assume this is still current). Prior heads
  (`c8d1079`, `a38b3de`) and prior bases (`1e372e3`, `db64de5`, `fc5cf0d`) are behind and not
  meaningful to cite except in the history recorded in §3/§5.
- `git status` is clean. Pushed twice already (`c8d1079` then `a38b3de`, both `--force-with-lease`
  after their respective rebases); this head needs the same treatment before the next report.
- The controller merges at the EXACT head sha reported — always confirm the sha you report matches
  `git rev-parse HEAD` at the moment you message it, after any last-minute fix.

## 2. What is built and verified

All under `apps/mobile/`, package-scoped and typechecked; the full gate ran twice before this rebase
(27/27 at `c8d1079`; 27/27, 3238 tests, 0 cached at `a38b3de`) and must run again at this head before
merge (§6).

- **Scaffold**: `package.json`, `app.json`, `tsconfig.json`, `vitest.config.ts`, `index.ts`.
  `npx expo install --check` reports clean. **`react-native-webview` is PINNED to the exact `13.15.0`,
  not `^13.15.0`** — a plain `pnpm install` after Task 16 (Lane C) added its own deps to the shared
  lockfile silently resolved the caret range up to `13.17.0`, which broke `EditorWebView`'s typecheck
  outright (`WebView`'s prop overloads resolved to `never` — a `@types/react` version-duplication
  symptom: the pnpm store held three copies, `19.0.14`/`19.1.17`/`19.2.18`, and the newer webview
  version's types resolved against a different one than this package's own `tsconfig` does). Pinning
  the exact version was the fix that didn't require untangling the hoisting. **If this recurs, check
  `find node_modules/.pnpm -maxdepth 1 -iname "@types+react@*"` for more than one match before assuming
  it's a code regression** — a floating range on this dependency is a booby trap for the next rebase.
- **`src/storage/op-sqlite-storage.ts`** + test (7 tests). Opus-reviewed; fixed: `close()` now actually
  closes the underlying database (was a silent no-op); the double-cast `open({name}) as unknown as
  OpSqliteDb` is gone; nested-transaction rejection is now tested; the test docblock's false "every
  conformance assertion" claim is corrected to the measured "1 of 3".
- **`src/editor/editor-bridge.ts`** + **`src/editor/editor-web-view.tsx`** + test (9 tests, named
  `editor-web-view.test.ts` per the plan's declared file list). Opus-reviewed; fixed: `initialDoc` is
  typed as the protocol's own `DocJson | null` (was `unknown`, which let `undefined` through and
  silently made a read-only editor fully editable with nothing loaded); `isDocShaped` now does the
  real `isDocJson`'s full 4-check validation (was one check short); a rejected `onMentionQuery` now
  always answers (was: could hang the webview's mention popup forever). A round-trip test drives
  `serializeHostMessage`'s output through the REAL `parseHostMessage` for all 5 host→editor kinds.
- **`src/push/register-push.ts`** + test (4 tests). Not opus-reviewed — self-contained, scaffold-tier.
- **`src/screens/board-screen.tsx`, `src/screens/ticket-screen.tsx`, `src/app.tsx`** — use the real
  app-core helpers from Task 13 (§4). Untested directly (no RN renderer under this project's vitest
  config); typechecks clean.
- **`scripts/generate-editor-html.mjs`** + **`src/editor/editor-html.generated.ts`** (checked in,
  ~750KB, real content from `packages/editor`'s `build:webview` output). Goes stale the moment Plan 7's
  webview content changes; nothing in the gate checks its freshness. Regenerate with the two commands
  in the generated file's own header comment.
- `pnpm exec tsc -p tsconfig.json --noEmit` → exit 0. `pnpm test` → **20/20 passing, 3/3 files**, node
  v22.22.2. Rebuild the dependency chain after every rebase in this worktree —
  `pnpm turbo run build --filter=@gisik-nokma/mobile` — its `dist/` goes stale otherwise.

## 3. Deviations from the plan's assumed API

1. `createReplicaDataSource`, `ReplicaDataSource`, `TicketSummary`, `StreamItem`, `OfflineAcceptError`
   live in **`@gisik-nokma/app-core`**, not `@gisik-nokma/sync-client`.
2. **`ReplicaDataSource.ingest()` THROWS `OfflineAcceptError` on any queued write.** Both `onComment`
   and `onResolve` (via `resolveContest`) in `ticket-screen.tsx` catch it explicitly.
3. Query methods are `listTicketSummaries`, `searchOfflineCopy`, `getTicketWithPending` — not
   `listTickets`/`search`/`getTicket(ticketId)`. `getTicketWithPending` is what the ticket screen uses.
4. **Plan 7's real editor webview bridge** (`packages/editor/src/webview/bridge.ts`'s versioned
   `{bridge: 1, kind: ...}` union) replaces the plan text's stale assumed protocol.
5. **`packages/editor` exports no host-side validator for editor→host messages.**
   `editor-bridge.ts`'s `parseEditorMessage` is the first one, scoped to this app. **Confirmed after
   Task 16 landed: the desktop shell did NOT add an editor webview integration this round** (no
   `editor`/`bridge` file anywhere under `apps/desktop`), so the anticipated duplication risk did not
   materialise — the concern stands for whenever Tauri's shell adds one.
6. `emptyDoc()`/`isDocJson` (root-barrel VALUE exports) are not imported; `editor-bridge.ts`
   reimplements `isDocJson`'s 4-check logic locally, to avoid touching the shared package's export map.
7. **`plainTextToDoc` now exists** (landed with T13, `packages/domain/src/events/contest-events.ts`,
   root-barrel re-exported). `ticket-screen.tsx` uses the REAL `plainTextToDoc('')` for the comment
   draft's initial doc. Its real output has NO `attrs.schemaVersion` — an earlier hand-rolled literal
   had guessed one; the actual convention omits it.
8. `Origin` is `'web'|'mobile'|'desktop'|'server'` (`'mobile'` is valid, used throughout).

## 4. T13 wiring — real, done

`board-screen.tsx` renders `syncStatusLabel(status, queued)` (app-core's real helper) plus a
hand-matched "`{failed}` needs attention" line (the web `SyncStatusBar` component inlines that half;
there's no dedicated helper for it, and the component itself is DOM-only — `<div>`/`<span>` — so it
can't be mounted in RN directly regardless).

`ticket-screen.tsx`'s contest banner calls the real `resolveContest` for all three resolutions, via
`renderContestedClaimText`. Lane B's three rebase traps: (1) `buildReopenPair`/`nonTerminalStates` —
not used, T17 has no reopen flow; (2) **`resolveContest` does NOT catch `OfflineAcceptError`** — both
`onComment` and `onResolve` await/catch it explicitly; (3) not applicable, same reason as (1).

**Deliberate scope decision**: "Redo legally" resubmits the identical claim under a fresh envelope
(fresh id/`clientTime`, actor = `contest.claimantId`) rather than opening an edit affordance first —
matching why `ContestBanner`'s own docblock pushes building the replacement envelope to the HOST rather
than handling it itself. A full per-event-type redo editor is out of Task 17's scope. Named in
`Features.md`, not hidden.

**Actor identity remains interim** (no real session/auth in this shell): comment posting uses
`state.assigneeId ?? 'me'`; contest resolution/redo uses `contest.claimantId`. Both become the real
signed-in user once Plan 6's session handling reaches this app.

## 5. Test-case numbering — 12.224–12.227, survived THREE rebases without a further collision

History, in order: this branch's first draft collided with Closure 1's independently-landed
12.189–12.192 → controller allocated **12.224–12.227 to Task 17, 12.228–12.239 to Task 16** → T13
(Lane B) landed its own real range at 12.193–12.223 in the next rebase, confirmed no overlap → T16
(Lane C) landed its own real range at 12.228–12.229 (of its own allocation) in the rebase after that,
confirmed no overlap. **This branch's ids have never needed to move.** `origin/main`'s own header line
is the authority on the current allocation table — re-read it (not this file) before any future rebase:
`git show origin/main:test-cases/12-offline-sync-apps.md | grep -n "HIGHEST ID"`.

## 6. The gate

**Postgres outage (2026-09-06, Docker VM disk full) is resolved** — confirmed via
`docker exec gisik-nokma-exec-postgres-1 pg_isready` and clean recent checkpoint logs before gating
again. If `apps/server` tests fail with connection/disk errors in a future session, treat it as a
possible repeat and check with the controller before diagnosing it as a code defect. Lane E's
`sweep-test-dbs.sh` now runs before every gate, dropping idle `gisik_test_*` databases.

Gate lock (empty-pid lock reclaimed after 60s, drain-wait bounded at 10min, loud on either timeout), as
ONE backgrounded invocation, never split across separate tool calls:

```
lock_wait=0
until mkdir /tmp/gisik-gate.lock 2>/dev/null; do
  p=$(cat /tmp/gisik-gate.lock/pid 2>/dev/null)
  if [ -n "$p" ]; then
    if ! ps -p "$p" >/dev/null 2>&1; then rm -f /tmp/gisik-gate.lock/pid; rmdir /tmp/gisik-gate.lock 2>/dev/null; fi
  else
    lock_wait=$((lock_wait+15))
    if [ "$lock_wait" -ge 60 ]; then echo "RECLAIMING stale empty-pid lock after 60s"; rmdir /tmp/gisik-gate.lock 2>/dev/null; lock_wait=0; fi
  fi
  sleep 15
done
echo $$ > /tmp/gisik-gate.lock/pid
trap 'rm -f /tmp/gisik-gate.lock/pid; rmdir /tmp/gisik-gate.lock 2>/dev/null' EXIT
drain_wait=0
while [ "$(ps -eo comm= | grep -c '^node (vitest')" -gt 0 ]; do
  drain_wait=$((drain_wait+15))
  if [ "$drain_wait" -ge 600 ]; then echo "PROCEEDING after 10min drain-wait timeout — vitest pool still nonzero, may be a peer's unlocked run"; break; fi
  sleep 15
done
source ~/.nvm/nvm.sh && nvm use 22 && pnpm turbo run build test typecheck --force --concurrency=1 > gate.log 2>&1; echo GATE_EXIT=$? >> gate.log
```

Package-scoped, no lock needed: `pnpm --filter @gisik-nokma/mobile exec vitest run --maxWorkers=2`.
Reap orphans by `ppid=1` only, never `pgrep -f vitest`/`pkill -f vitest`.

**Push**: always `--force-with-lease` after a rebase (the remote branch already has prior pushed
commits) — a plain push is rejected as non-fast-forward, and a plain `--force` skips the safety check
that would catch a concurrent push you didn't know about.

## 7. Remaining steps, in order

1. Run the full gate (§6).
2. If green, `git push --force-with-lease`, then message the controller (`gisik-nokma-0d`) with the
   exact head sha (re-check `git rev-parse HEAD` at message time) and the gate's `Tasks:` line.
3. **Expect at least one more rebase request before merge** — three have landed already
   (Closure 1, T13/#117, T16/#120) and this is a shared-file (`Features.md`, `test-cases/12`)
   collision by construction, not a fault, per the controller's own framing: whoever lands second in a
   shared file rebases; arrival order is not something this branch controls. Re-fetch and re-check
   `git diff HEAD origin/main --stat -- Features.md test-cases/12-offline-sync-apps.md` before
   reporting done each time.
4. If the controller says its own context is about to clear/relaunch, a quiet window afterward is
   the relaunch, not a stall — don't re-send the same report speculatively.
