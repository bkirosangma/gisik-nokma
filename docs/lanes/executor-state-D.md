# Lane D — executor state

**This file is Lane D's restart surface, and this update is Lane D's LAST ACT for the night** — the owner
has ruled that after Monday's 06:30 weekly reset, execution goes back to SERIAL (one executor), so
whoever reads this next may have none of this session's context. Read this whole top section before
doing anything.

**What Lane D is, for a reader with zero context:** one of five parallel executor lanes on the
`gisik-nokma` project (a project-management tool codebase), each working an independent branch under a
controller session (`gisik-nokma-0d`) that is the only one that merges. Lane D's own two pieces of work
this session, both now shipped:

1. **PR #196** (branch `exec/40-socket-cut-fixture`) — **MERGED at `c5dfdcd`.** Built the first real,
   end-to-end socket-cutting test fixture for Plan 10's closure 5b, flipping case 12.290 (offline-sync
   test catalogue) from partial to fully covered on MEASURED convergence, not argument. Full detail in the
   "PRIOR WORK" section below the line.
2. **PR #213** (branch `exec/45-ping-hazard`) — **OPEN, MERGEABLE, awaiting the controller's merge under
   an explicit CI-billing waiver.** Built case 12.344, a hazard case named by a sibling case (12.361) and
   left unbuilt. Full detail in section 1-3 below.

**Live position as of this write (head `cca84af`, frozen — do not push to this branch without the
controller's say-so):**

- PR #213: https://github.com/bkirosangma/gisik-nokma/pull/213 — MERGEABLE. `mergeStateStatus` reads
  `UNKNOWN`/`UNSTABLE` because **GitHub Actions is refusing to start any CI job on this account since
  ~14:42** ("recent account payments have failed or your spending limit needs to be increased") — this is
  an account-billing outage, NOT a defect in this PR. The controller has granted an explicit merge waiver
  covering the CI run only; everything else (a full local gate, a real review) is still owed and has now
  been done — see section 1.
- **The full forced gate has been run and is GREEN at this exact head**, under gate-lock v3.3:
  `GATE_EXIT=0` (`WRAPPER_EXIT=0` from the wrapper's own stdout), `Tasks: 30 successful, 30 total`,
  `Cached: 0 cached, 30 total`, `2m1.172s`, node v22.22.2, zero `Unsupported engine`, zero orphaned vitest
  workers. **3645 tests / 284 files, 5 skipped** (server) — ui 37 · domain 464 · rule-engine 282 ·
  editor 178 · sync-client 88 · app-core 1102 · server 1326+5 skipped · mobile 20 · web 138 · desktop 5.
  `check:env` on its own line: `CHECK_ENV_EXIT=0`.
- The PR body has been edited (twice, via `gh pr edit`, no new commits, head unchanged) to disclose: (a)
  no review agent ever ran on this PR — an account-side access error killed the dispatched reviewer before
  its first action, so the "verification" in the PR body is the orchestrating session's own independent
  re-work, not a separate reviewer; (b) the full gate result above.
- **Nothing further is owed from Lane D on this PR.** It is waiting on the controller's merge. If you are
  a fresh session picking this up: check `gh pr view 213 --json state,mergedAt` first — it may already be
  merged, in which case skip straight to "what's next" at the very bottom of this file.

> Shas below are facts about when this file was written. Verify with `git branch --contains` — empty
> means orphaned. `git cat-file`/`git show` pass on orphaned shas and will lie.

## 1. Where things stand right now

- **PR #213 IS OPEN, MERGEABLE**: https://github.com/bkirosangma/gisik-nokma/pull/213. Head
  `bc576aa5780c4fecf25d31f0b85b62b8d7d42c07`. `mergeStateStatus: UNSTABLE` — **this is the CI billing
  outage, not a defect**: GitHub Actions has been refusing to start jobs on this account since ~14:42
  ("recent account payments have failed or your spending limit needs to be increased"), stated explicitly
  in the PR body so it is not mistaken for a real red run. Diff is exactly three files: `Features.md`
  (+16), `apps/server/test/dual-client/socket-cut.test.ts` (+235/-1), `test-cases/12-offline-sync-apps.md`
  (+51/-5).
- **How this got built — worth recording because it is an unusual shape.** The dispatched
  implement→review Workflow's two agents both errored on their FINAL response with an account-side
  message ("Your organization has disabled Claude subscription access for Claude Code · Use an Anthropic
  API key instead, or ask your admin to enable access") — but the implementer's actual TOOL CALLS had
  already landed on disk and been committed (two commits, `fa9635c` and `bc576aa`) before that failure hit.
  **The lesson: a subagent's "failed" status describes its final report, not necessarily its tool effects
  — check `git log`/`git status` before assuming a failed dispatch produced nothing.** No review agent ever
  ran (its call errored identically, before doing any verification), so every verification claim in this
  file is the ORCHESTRATING SESSION'S OWN independent work, not a reviewer's.
- **My own independent verification, after the fact, exactly as if a review had run:**
  - Read both commits in full (`git show fa9635c`, `git show bc576aa`) — the test code and the catalogue
    prose.
  - Ran the new/changed test file under gate-lock v3.3 (`locked-test.sh`, fixed path form
    `pnpm --filter @gisik-nokma/server exec vitest run test/dual-client/socket-cut.test.ts` — NOTE the path
    is relative to `apps/server`, not the repo root, once `--filter` has already cd'd there; got this wrong
    once, `ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL`/"No test files found", before correcting it): **4 passed
    (4)**.
  - Independently re-ran the excluding mutation (removed the added `clientEnd.on('ping', ...)` block at
    the time, line ~1059): **`1 failed | 3 passed (4)`**, failing at exactly `"no complaint came back:
    expected 0 to be greater than or equal to 1"` — matching the commit message's claimed measurement
    exactly. Restored with `git checkout HEAD --` and verified BOTH by `git diff` (empty) AND by
    `sha256sum` matching a pre-mutation snapshot.
  - `node scripts/check-case-ids.mjs` → **CHECK_CASE_IDS_EXIT=0**: 1043 bare + 469 bold + 43 marker-first =
    1555 = union, zero duplicates, highest `13.203`.
  - `pnpm check:env` → **CHECK_ENV_EXIT=0** (separate step, own line).
  - `pnpm turbo run typecheck --filter=@gisik-nokma/server` → 6/6 tasks, exit 0 (cached).
  - `git diff origin/main -- apps/server/src/stream/hub.ts apps/server/src/stream/routes.ts
    packages/sync-client/src/engine/sync-engine.ts packages/sync-client/src/replica/replica.ts` → **empty**
    — all four protected files byte-identical to `origin/main` at this head.
  - Did NOT rebase before pushing: `origin/main` had moved 6 commits ahead of this branch's base
    (`5e3a9d5`) by the time I pushed, but `git diff --stat 5e3a9d5..origin/main` touches only
    `apps/server/test/integration/fixture-witnesses.test.ts` (Lane A's own file, confirmed disjoint by
    direct message exchange with Lane A before this branch existed), `docs/lanes/*`, and
    `test-cases/07-api-realtime-search.md` — zero overlap with this PR's three files, and `gh pr view`
    confirms `mergeable: MERGEABLE`.

## 2. What was built — the hazard, in outline

`apps/server/test/dual-client/socket-cut.test.ts` grows a new `describe('12.344 — ...')` block plus four
new observers on the existing fixture (all additive, nothing removed): `viewerClientSockets` (the CLIENT's
end of each connection — `viewerSockets` was already the SERVER's end), `clientFrames` (every raw TEXT
frame the client's end received), `clientPings` (every PROTOCOL ping the client's end saw), `serverPongs`
(every PROTOCOL pong the server's end saw back).

The case itself, on ONE connection, as an excluding pair:
1. **Control**: `serverEnd.ping()` — a real protocol ping over the real live connection, sent directly by
   calling `.ping()` on the raw server-side socket (the SAME handle the socket-cutting cases already use to
   shadow `bufferedAmount`) rather than waiting on the real 30s heartbeat interval. `ws`'s own automatic
   pong fires; NO error frame is received. Closed by an ORDERING argument rather than a sleep: a further
   commit is made and its own `event` frame is awaited on the wire, so "no complaint" is a fact about the
   whole round trip up to a known point, not about how long the case waited.
2. **Hazard**: one listener added to the CLIENT's raw socket — `on('ping', () => send('{"type":"pong"}'))`
   — simulating a shell that (mis)treats a low-level ping as needing an application-level answer. A second
   `serverEnd.ping()` now produces exactly `{type:'error', workspaceId:null, code:'bad-message',
   message:'expected {type:"subscribe", workspaceId, afterSeq}'}` from `routes.ts`'s unmodified
   `badMessage` path. The default auto-pong is asserted to KEEP firing under the added listener (not
   suppressed by it), and the connection is asserted to stay open (a complaint, not a disconnect).

No source file is touched — `routes.ts`'s `badMessage` path already does exactly this.

## 3. Catalogue

- **12.344 minted BARE** in Lane D's own block (12.340–12.359, now used through 12.344; 12.345–12.359
  still free). §12 census after this commit: bare 328 / bold 0 / marker-first 0, sum == union, zero
  duplicates (recounted fresh rather than carried forward, per this file's own standing rule — it had
  drifted stale by five before this change touched it, since Lane B's sync-surface block had landed on
  `main` in the meantime).
- **12.361 STAYS 🚫** — its point (the owner rule at both `webSocketFactory` defaults is a docblock, not a
  check) is unchanged by building 12.344; the two are cross-referenced to each other explicitly so neither
  is misread as covering the other.
- A short Features.md bullet added in the same §12 area PR #196 already added to, naming itself and citing
  case 12.344.

## 4. Coordination

- **Told Lane A (`gisik-nokma-exec-f3`) this branch's file list before it existed on origin**, confirming no
  overlap with their refusal-vocabulary cluster scoping (`packages/app-core/test/flows/`,
  `packages/rule-engine/`, `apps/server/test/integration/fixture-witnesses.test.ts`,
  `apps/web/test/notifications-gateway.test.ts` — none touched).
- **No ledger row** (Lane F item, closed by name in the PR).

## 5. A note on the account-side outage, for whoever restarts next

At 17:38 IST this session's dispatched Workflow agents failed with "Your organization has disabled Claude
subscription access for Claude Code" — an ACCOUNT-level error, not a session-limit or model error. The
controller confirmed a freshly-launched session (Lane A) worked normally minutes later, so treat this as
possibly transient/dispatch-specific rather than assuming all subagent dispatch is down — but **verify a
subagent's tool effects on disk before concluding it "did nothing"**, since this session's own failed
dispatch had in fact completed two real commits before its final report call errored.

## 6. Remaining steps, in order

1. ~~Confirm PR #196 merged, note the account-side CI-billing block, hold~~ — done (prior session block).
2. ~~Re-task by controller message: build case 12.344~~ — dispatched, agents errored on final report but
   left two real commits; discovered and verified independently.
3. ~~Verify: re-run the test, re-run and restore the excluding mutation, check-case-ids, check:env,
   typecheck, confirm protected files untouched~~ — done, all as claimed.
4. ~~Push, open PR #213, note the CI billing block in the body~~ — done.
5. **Report to the controller** — this handoff commit is part of that report's evidence trail.
6. **Never edit `docs/lanes/task-ledger.tsv`. Never merge own PR. Never commit to `main`.**

---

## PRIOR WORK (exec/40-socket-cut-fixture, PR #196 — MERGED at c5dfdcd) — kept for the record

**This file is Lane D's restart surface.** Rewritten for THIS work (the real socket-cutting fixture for
case 12.290) on branch `exec/40-socket-cut-fixture`, cut from `origin/main` at `2f18f3f` on 2026-09-06,
per the controller's re-task at the fixed point after PR #161 (Lane B's closure 5b) merged.
**Do not re-implement T7/T8/T9/T10/T17, the two retention sweeps, or the four `data-testid` hooks — all
merged, all promoted.**

- **PR #196 MERGED at `c5dfdcd`** — twelve green CI checks at frozen head `7c9ba94`, review verdict CLEAN
  (opus reviewer independently re-ran all three mutations and the baseline, reproduced every measured
  result). Case 12.290 flipped 🟡→✅ on measured convergence: a real fastify server, real Postgres, real
  bearer auth, a real WebSocket connection genuinely cut with a real 1013 slow-consumer close (via
  `app.websocketServer`'s `connection` event and an `Object.defineProperty` override of `bufferedAmount` on
  one live socket instance), and the real, unmodified `@gisik-nokma/sync-client` engine reconnecting and
  converging. Cases 12.340–12.343 minted (originally bold, normalised bare by Plan 10 T18's #188 which
  landed mid-flight).
- **Key finding recorded in the case text:** one cut is not enough to prove anything, because
  `visible-events-for.ts` scopes `backfilled` per drain and a `reach-granted` notice carries no cursor, so
  a cut taken before the trigger crosses the cursor just reconnects into a regenerated notice that repairs
  itself — the fixture needed a SECOND cut, taken after the cursor passes the trigger, to actually exercise
  `onCaughtUp`'s retry path.
- **Gate-lock v3.3 lesson learned and recorded for the next restart:** `peer_gates()`'s own `$( )`
  command-substitution subshell was undercounting itself as a peer in TWO successive "fixes" — first
  entirely unaddressed (v3.2), then addressed with an INLINE `-v fork=$BASHPID` in the awk argument list
  (my own first attempt, based on an earlier controller message) which measurably does NOT work (bash
  expands that argument in the child forked for `awk`, not in the command-substitution subshell itself) —
  the CORRECT form captures `local fork=$BASHPID` as a plain assignment FIRST, then passes `-v fork="$fork"`.
  **Always pull `docs/lanes/gate-lock/` fresh from `origin/main` rather than trusting an old scratchpad
  copy** — this exact mistake was caught and self-corrected mid-session by a dispatched subagent that
  re-pulled the canonical form, not by me.
