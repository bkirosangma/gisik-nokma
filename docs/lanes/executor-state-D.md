# Lane D — executor state

**This file is Lane D's restart surface.** Rewritten for THIS work (the real socket-cutting fixture for
case 12.290) on branch `exec/40-socket-cut-fixture`, cut from `origin/main` at `2f18f3f` on 2026-09-06,
per the controller's re-task at the fixed point after PR #161 (Lane B's closure 5b) merged.
**Do not re-implement T7/T8/T9/T10/T17, the two retention sweeps, or the four `data-testid` hooks — all
merged, all promoted (see the prior block below, kept for the record).**

> Shas below are facts about when this file was written. Verify with `git branch --contains` — empty
> means orphaned. `git cat-file`/`git show` pass on orphaned shas and will lie.

## 1. Where things stand right now

- **PR #196 IS OPEN, MERGEABLE, CLEAN**: https://github.com/bkirosangma/gisik-nokma/pull/196. Pushed, not
  merged. Branch `exec/40-socket-cut-fixture`, head `ec5beca` (force-pushed after a rebase onto
  `origin/main` at `fb5e4c2`, past PR #188 (T18, §12's final shape and bare-id normalisation), #193/#195
  (gate lock v3.3's correction), #198/#199 (the mapper-cluster witness pass and ruling P42) — none of
  which touch anything this PR touches; the rebase applied with zero conflicts). Commits, in order:
  `cbd43f3` (the fixture itself, 872 lines), `aeb1e1c` (a flake fix found by the sweep's own baseline —
  sibling ULIDs minted in the same millisecond sorted randomly, so the drain order of two children was a
  coin flip; sorted them), `c36a8f8` (catalogue: 12.290 flips 🟡→✅, mints 12.340–12.343 bare-style),
  `ec5beca` (one more assertion: the socket count on both sides of the convergence check).
- **CI**: triggered by the force-push, `gh pr checks 196` shows the `scope` check `pending` as of this
  writing (checked immediately after push) — **re-check before treating this as ready to merge; it had not
  had time to run.**
- **Diff is exactly three files**: `Features.md` (+46/-14 after the rebase's line-number shift; the actual
  prose delta is the same content the review verified), `apps/server/test/dual-client/socket-cut.test.ts`
  (new, 872 lines), `test-cases/12-offline-sync-apps.md` (+169/-... — same content, shifted). Confirmed
  `git diff origin/main -- apps/server/src/stream/hub.ts apps/server/src/stream/routes.ts
  packages/sync-client/src/engine/sync-engine.ts packages/sync-client/src/replica/replica.ts` is EMPTY at
  this head — the four protected sync-surface files are byte-identical to `origin/main`.
- **Full verification run AFTER the rebase** (not carried across it — this lane's own prior handoff already
  states the rule that a gate carried across intervening commits is not a gate):
  - `pnpm install --frozen-lockfile` + `pnpm rebuild better-sqlite3` + `pnpm turbo run build --force
    --concurrency=1` → **BUILD_EXIT=0**, 10/10 tasks.
  - Server package under gate-lock v3.3's `locked-test.sh` (`pnpm --filter @gisik-nokma/server exec vitest
    run`): **126 test files passed, 1296 tests passed, 5 skipped**, 0 `Unsupported engine`, 0 orphaned
    vitest workers, node v22.22.2.
  - `node scripts/check-case-ids.mjs` → **CHECK_CASE_IDS_EXIT=0**: bare 1022 + bold 469 + marker-first 40 =
    sum 1531 = union 1531, zero duplicates, highest `13.168`.
  - `pnpm check:env` → **CHECK_ENV_EXIT=0** (separate step from check-case-ids, run and reported on its own
    line per the standing rule).
  - `pnpm turbo run typecheck --filter=@gisik-nokma/server --concurrency=1` → **6/6 tasks, exit 0**.
  - Did **not** re-run the full 30-task cross-workspace gate after the rebase — the rebase touched zero
    source files (confirmed by diffing `8373ae5..origin/main`: docs/lanes/*, a new Lane A test file, and
    one unrelated `Features.md` §7 addition, none overlapping this PR's three files) and the mechanical
    replay carried no code change, so the server-package run above plus build+typecheck is the equivalent
    evidence the branch review round itself used for an identical situation (see §3 below).

## 2. What was built, and where — the mechanism, in outline

`apps/server/test/dual-client/socket-cut.test.ts` (new file; `rig.ts` and `grant-backfill.test.ts`
untouched — the existing dual-client rig is socketless by construction, so this fixture stands its own
real server rather than extending the rig, and that deviation is recorded in both the PR body and case
12.290's text):

- A REAL `buildTestApp` + `app.listen({port: 0, host: '127.0.0.1'})`, real Postgres, two real
  `signInWithPhone` sign-ins (bearer tokens used on both HTTP calls and the WS handshake headers).
  Membership/project seeding goes through the real `POST /v1/events` door (as
  `test/integration/client-contract.test.ts` does), not `seedMember`/`seedProject` — more end-to-end than
  the brief asked for.
- A REAL client: `createHttpTransport`/`createSyncEngine`/`createReplica`/`createOutbox` from
  `@gisik-nokma/sync-client`, unmodified, resolved through the package's own `dist` build (no alias). Only
  two of its declared seams are supplied — `fetchImpl` (to inject one transient, non-404 pull failure so a
  ticket stays durably pending) and `webSocketFactory` (bearer header on the WS handshake) — plus the
  public `reconnectDelayMs: 80` engine option (disclosed inline in the test; the outward-facing prose in
  the PR/Features.md omits this third knob, a Minor/cosmetic gap the review left open, see §4).
- The REAL socket cut: `app.websocketServer.on('connection', ...)` (the real `ws.Server` `@fastify/websocket`
  decorates the app with) hands back the live raw socket for the connection under test;
  `Object.defineProperty(socket, 'bufferedAmount', {get: () => 999_999_999})` shadows the `ws` library's own
  getter on that one instance; a subsequent real, ordinary commit makes `hub.ts`'s unmodified `send()` see
  the forced value and close with the REAL 1013 `slow-consumer` code — measured, not assumed
  (`toEqual([{1013,'slow-consumer'}, {1013,'slow-consumer'}])`, two cuts — see the finding below for why
  two). `hub.ts`'s bound is the shipped `DEFAULT_MAX_BUFFERED_BYTES` (1 MB), never shrunk.
- **Key finding, load-bearing for why the fixture needs TWO cuts, not one:** `visible-events-for.ts` scopes
  `backfilled` per drain and a `reach-granted` notice advances no cursor, so a cut taken while the cursor is
  still below the trigger reconnects into a re-generated notice that repairs the pull by itself — during
  which `onCaughtUp`'s own `drainPendingPulls` retry is unreachable, and deleting it changes nothing. The
  second cut, taken after the cursor has passed the trigger, is the one no notice can regenerate — that is
  the case that actually exercises the retry mutation (a) targets.

## 3. Mutation sweep — predicted then measured, restored, and independently re-run by the reviewer

Run under one locked acquisition; every mutation applied to `packages/sync-client/src/engine/sync-engine.ts`
SOURCE, the package rebuilt (`apps/server` resolves it by package name through `dist`), the mutant's
presence in `dist` PROVED before running, and `git checkout HEAD -- <path>` + `git diff` + a read-back after
every one:

| mutation | predicted | measured |
|---|---|---|
| baseline | 3/3 pass | 3 passed (3) |
| (a) delete `onCaughtUp`'s `await drainPendingPulls(ws)` | 12.340+12.341 red, rest green | **`1 failed \| 2 passed (3)`, exactly as predicted** — "C1 never converged" |
| (b) batch `clearPendingPull` after the loop instead of per-ticket | 12.343 red on the pull count | **`2 failed \| 1 passed (3)`** — 12.340 AND 12.343 red, both at their *pending-set* assertion, not at the pull-count assertion (which is never reached under this mutation — disclosed as an open, unkilled assertion in the case text itself, not hidden) |
| (c) control, cut removed | stays green | green in all three blocks (permanent case 12.342) |

The opus reviewer independently reconstructed all three mutations from prose alone (not from a saved patch)
and reproduced the same measured results, including reproducing mutation (b)'s exact non-obvious failure
signature. **Verdict: clean.** Three Minor/cosmetic findings only, all pre-closed or already disclosed in
the case text (see §4) — no fix round was needed or run.

## 4. Left open, named rather than glossed (all Minor, not blocking)

- The PR/Features.md/test-file-docblock prose says the real sync-client is used "with only its two
  declared seams supplied" — a third, `reconnectDelayMs: 80`, is also supplied (a legitimate public engine
  option, disclosed inline in the test at the point of use, just not repeated in the outward-facing prose).
  No measurement is affected by this.
- Case 12.343's headline prose calls the pull-count assertion "the discriminator" for mutation (b), but the
  mutation table in the same file correctly and voluntarily records that under (b) that specific assertion
  is never reached (the pending-set assertion above it fires first) — the file is self-consistent read
  whole, the one-line headline overstates it read alone. Cosmetic; not fixed, since the honest disclosure
  already exists two paragraphs below it.
- These two are the kind of thing worth a one-line prose tighten in a future pass over this file, but do not
  rise to a fix-round threshold on their own (both Minor, both already substantively disclosed).

## 5. Coordination notes for whoever restarts this lane or reads this file next

- **§12 ids: this lane's block is 12.340–12.359, used through 12.343 (12.344–12.359 still free).** Written
  BARE style (`- 12.34X ✅ …`) per PR #188's normalisation — the file's whole §12 is bare now, 322 ids at
  this head, zero bold.
- **Gate lock: use v3.3** (`docs/lanes/gate-lock/` on `origin/main`, NOT this lane's own earlier scratchpad
  copies) — v3.2 and this lane's own earlier hand-patch both undercounted `peer_gates`'s own `$( )` subshell
  as a peer; v3.3's `README.md` carries the corrected form and now reads `REPO="${GATE_REPO:-$PWD}"` rather
  than a hard-coded worktree path, so no per-lane `sed` adaptation is needed — just `cd` into the worktree
  and optionally set `GATE_REPO`.
- **Exchanged file lists with Lane B (`lane2-plan4-a2`) before pushing**, since Lane B is landing a
  sync-surface SOURCE PR (`exec/43-sync-surface-fixes`: deletions in `http-transport.ts`/`stream.ts`'s dead
  ping/pong arm, a narrowed `parseFrame` return type in `app-core`, docblock-only prose in `outbox.ts`, and
  test/catalogue changes with §12 ids 12.360–12.379). Confirmed: none of it touches anything this fixture
  imports by signature. Lane B was told this PR's head sha (`ec5beca`) and asked to rebase past it, or vice
  versa — whoever lands second rebases, per the controller's rule.
- **No ledger row for this task** (Lane F item, closed by name in the PR — `docs/lanes/task-ledger.tsv`
  untouched, correctly).

## 6. Remaining steps, in order

1. ~~Confirm #161 merged, cut branch, verify build~~ — done.
2. ~~Design the real seam (read hub.ts, routes.ts, sync-engine.ts, replica.ts, http-transport.ts, rig.ts,
   the test helpers) and dispatch an opus implementer → opus reviewer pipeline~~ — done; workflow returned
   `verdict: clean`.
3. ~~Rebase past #187/#188/#193/#195/#198/#199 (main moved twice more during and after the build), rebuild,
   re-verify (server suite, check-case-ids, check:env, typecheck), force-push~~ — done, head `ec5beca`,
   PR #196 now MERGEABLE/CLEAN.
4. **Confirm CI goes green on PR #196** (was `pending` immediately after the force-push — re-check before
   reporting this as merge-ready) and report to the controller.
5. **Never edit `docs/lanes/task-ledger.tsv`. Never merge own PR. Never commit to `main`.**
