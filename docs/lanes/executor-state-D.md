# Lane D — executor state

**This file is Lane D's restart surface.** Rewritten for THIS work (Plan 11 T7+T8) on branch
`exec/25-plan11-seed`, cut fresh from `origin/main` on 2026-09-06 after T17 (Expo mobile shell) merged
as PR #121 and was promoted in Plan 10's ledger (mobile). **Do not re-implement T17.**

> Shas below are facts about when this file was written. Verify with `git branch --contains` — empty
> means orphaned. `git cat-file`/`git show` pass on orphaned shas and will lie.

## 1. Where things stand right now

- **Worktree**: `/Users/kiro/my_projects/gisik-nokma-lanes/lane4-periphery`, branch `exec/25-plan11-seed`.
- **PR #136 is OPEN**, awaiting controller merge: `https://github.com/bkirosangma/gisik-nokma/pull/136`
- **Head sha `a2e226fc22dd0b1827ff7dc396a79aa6f3f53559`** — rebased onto `origin/main` at
  `538beb6c4b83fa65e0f1eed2d23f782266a59f7b` (the §13 block-allocation commit, PR #135) as of this write.
  `git branch --contains a2e226f` returns `exec/25-plan11-seed` only (not yet merged, as expected for an
  open PR) — re-verify reachability against whatever `origin/main` is at restart time, not this sha.
- **4 commits ahead of the `origin/main` sha above**: T7 (seed plumbing), T8 (Convenience Corner
  mapping), the Features.md §13 / test-cases/13 stub, and the §13 renumbering (see §4 below).
- Full gate ran green at this head before push: `pnpm turbo run build test typecheck --force
  --concurrency=1` → **30/30 tasks, 0 cached, exit 0**, server suite 1042/1042 tests. Scoped
  `pnpm --filter @gisik-nokma/server exec vitest run test/seed/ --maxWorkers=2` → **6 files, 46 tests,
  exit 0** (re-confirmed at the post-rebase head, not just pre-rebase).

## 2. What was built (Plan 11 Tasks 7 + 8)

All under `apps/server/src/seed/` + `apps/server/test/seed/`, nothing touched outside those two
directories plus the catalogue files in §4.

- **Task 7** (`seed-ulid.ts`, `doc-text.ts`, `users.ts`, `templates.ts`): `seedUlid` (deterministic
  ULID via SHA-256), `plainTextDoc` (built on the domain's existing `plainTextToDoc` per line — not a
  duplicate), `findUserIdByEmail` (looks up better-auth's `"user"` table, never invents a person), and
  `checkErrandTemplate` — the executable pin on Plan 8's `ERRAND_WITH_WAITS_TEMPLATE`.
- **Task 8** (`cc-board.ts`, `cc-map.ts`): `readCcBoard` reads the frozen
  `reference/convenience-corner-tracker/board.data.js` snapshot (read-only, `vm` sandbox) — 23 errands
  (13 registrations + 10 questions), 0 `done`, `week1 = 2026-08-18`. `buildErrandEvents` maps one
  tracker item to its full `ticket.created`/`field_set`/`transitioned` sequence.
- Both went through implement → independent review before landing (sonnet tier for T7, opus tier for
  T8, per this lane's model policy — no fable anywhere in this lane). Both reviews passed with only
  Minor findings; no fix rounds were needed. One Minor finding (the done-refusal should check
  `item.done` directly, not just `item.state === 'done'`) was cheap enough that I applied it myself
  after the workflow returned, with a new planted-defect test proving it (`13.72`).

## 3. Corrections applied against the plan text — verified, not assumed

The plan document (`docs/superpowers/plans/2026-08-20-11-deployment-dogfooding.md`, T7 lines
1310-1658, T8 lines 1659-2088) has bugs in its own example code, found by reading the actual domain
source (`packages/domain/src/workflow.ts`, `ticket-types.ts`, `workflows/errand-with-waits.ts`,
`advise-workflow.ts`, `events/contest-events.ts`) and the actual frozen snapshot before writing anything:

1. `ticket.transitioned`'s payload key is `to`, not `toStateId` (the plan used `toStateId` throughout).
2. `startDate` is a BUILT-IN field (`BUILTIN_FIELD_IDS` in `ticket-types.ts`), value shaped
   `{date, note?}` (`dueDateValueSchema`, shared with `dueDate`) — never a bare string (the plan sent one).
3. `ERRAND_WITH_WAITS_TEMPLATE`/`SIMPLE_KANBAN_TEMPLATE` are typed `Omit<WorkflowDef, 'id'|'version'>`,
   not `WorkflowDef` — `checkErrandTemplate`/`workflowFromTemplate`'s parameter types were adjusted
   accordingly (return type of `workflowFromTemplate` stays `WorkflowDef`).
4. Three hand-typed "ULID" literals in the plan's own fixtures are invalid (contain I/L/O/U, outside
   Crockford base32 / `ULID_REGEX`) — every fixture id now comes from `seedUlid(...)` itself.
5. `checkErrandTemplate` needed a FIFTH check beyond the plan's four (missing state / not reachable in
   one hop / waiting not blocked / done not guarded): every one-hop transition it accepts must carry
   ZERO rules, because the seed submits a bare event with no comment/evidence and any rule there would
   make the real engine refuse the seed's own event at ingest. This is **Ruling P29's tripwire** —
   `errand-with-waits.ts`'s docblock records that the template deliberately trips two `rule-bypassable`
   ADVISORIES on `later->waiting`/`next->waiting`, which is correct and must never be "fixed" on the
   template itself; `checkErrandTemplate` is the thing that must redden if a COPY of the template ever
   grows a rule there to silence the advisory. Three tests pin this (13.57-13.59): the real template
   trips exactly 2 advisories; a single-edge "fix" genuinely silences that one advisory by identity
   while `checkErrandTemplate` still reddens; guarding both edges clears the advisory panel to 0 while
   `checkErrandTemplate` still refuses it. **Correction to my own dispatch spec, found by the T7
   implementer**: my instruction asked for a literal `.length === 1` advisory-count assertion after the
   single-edge fix — this is arithmetically impossible (`adviseLowerGuardBypasses` emits one advisory
   per guarded/unguarded EDGE PAIR, not per silenced path; the count stays at 2, just a different pair).
   The implementer caught this empirically and substituted an identity assertion instead — a correct
   self-repair, not a deviation to chase.
6. `readCcBoard`'s planted-defect test as the plan wrote it never reaches its own shape check: passing
   a `.ts` file (the test file itself) throws a `SyntaxError` ("Cannot use import statement outside a
   module") inside the `vm` sandbox before any `!data || !Array.isArray(...)` check runs — proven by
   removing the wrap and watching the assertion fail on the wrong error text. Fixed by wrapping the
   sandbox eval and rethrowing with the path named; two NEW tests (an alien global, a `CC_TRACKER`
   missing `items`) exercise the actual shape-check branch via `mkdtempSync`/`os.tmpdir()`, cleaned up
   in a `finally`.

Every specific fact the plan's tests assume about the frozen snapshot (dates, `blocked_by` chains,
item titles, the 23/13/10/0 counts) was independently verified against
`reference/convenience-corner-tracker/board.data.js` directly and is correct — only the event-shape
code above needed fixing, not the tracker facts.

## 4. The §13 catalogue collision — resolved, not merely noted

`Features.md` §13 and `test-cases/13-deployment-dogfooding.md` did not exist on `origin/main` when this
task started. **Lane C's PR #134 (Plan 11 Task 14) independently opened the same section on its own
branch first**, at cases 13.1-13.6, before either PR merged. The controller allocated blocks (landed on
`main` at `538beb6`, PR #135, AFTER I had already committed my first pass at 13.1-13.36): **Lane C
13.1-13.40 · Lane D (this lane) 13.41-13.100 · Lane E 13.101-13.200**. I renumbered my 36 cases by
enumeration (never `sed`) into **13.41-13.76** (Task 7: 13.41-13.59, Task 8: 13.60-13.76) in a dedicated
commit, re-counting against both `origin/main` and Lane C's then-unmerged branch
(`origin/exec/24-plan11-ci-deploy`) as the control immediately before committing and again immediately
before pushing.

**Still true at push time**: PR #134 (Lane C) had NOT merged. `test-cases/13-deployment-dogfooding.md`
therefore exists as two DIFFERENT, non-overlapping-in-numbering files on two open PRs (mine has the
allocation-block header; #134's has its own "why this file starts at 13.1" header). **Whichever of
#136 and #134 merges second will hit a genuine add/add git conflict on this one file** — the resolution
is to keep BOTH lanes' sections (concatenate, task order, headers reconciled to state the block
allocation once) — flagged explicitly in this PR's description so whoever merges second is not
surprised. This is not a bug to fix now; it is the expected shape of two lanes opening one section
before its designated owner (Task 16) could.

## 5. An operational mistake I made and caught myself — record it so it isn't repeated

While gating, I ran the full-gate script wrapped in my own `nohup ... &` INSIDE a Bash call that was
*also* marked `run_in_background: true`. The tool's completion notification fired almost immediately —
reflecting only that the outer shell (which forked and returned) had exited, not that the detached gate
script had finished. Reading the log at that point, it looked stalled mid-task; I nearly reclaimed the
gate lock believing its holder had died. `ps -p <pid>` and a growing log proved the gate was still
genuinely alive and running; I restored the lock (correct pid) within seconds and no collision resulted
(no second vitest pool ever appeared). **Lesson: `run_in_background: true` on the Bash tool already
keeps a long-running foreground command alive and reports on its real completion — do not also wrap the
command body in `nohup ... &`. Pass the actual long-running command directly.** Filed as product
feedback separately; recording here so the next lane (or a restarted me) doesn't repeat it against a
gate that is genuinely still running.

## 6. The gate lock — unchanged from prior lane briefings

T7/T8's own tests need NO Postgres (pure unit tests, no `createTestDatabase` import) — safe to run
scoped and unlocked: `pnpm --filter @gisik-nokma/server exec vitest run test/seed/ --maxWorkers=2`. The
FULL monorepo gate does touch Postgres via other `apps/server` suites and takes the lock, as ONE
backgrounded invocation (see §5's caveat on how NOT to background it), reap orphans by `ppid=1` only
(`ps -eo pid=,ppid=,comm=,args= | awk '$3 ~ /node$/ && $2 == 1 && index($0, "vitest") > 0 {print $1}'`),
never `pkill -f vitest`, never kill `pgrep -f vitest`'s output (it also names live lane sessions and
peers' live pools). Postgres verified healthy via `docker exec gisik-nokma-exec-postgres-1 pg_isready`
(not just `docker ps`'s "Up" status) before and after gating.

## 7. Remaining steps, in order

1. **Report to the controller** (message sent to `gisik-nokma-0d`): PR #136 open, head sha, test/gate
   summary, the §13 collision handled, and the earlier flagged discrepancy — PR #121 (T17) is genuinely
   merged (`gh pr view 121` confirms `mergedAt`) but ledger row 10/17 was still `todo` as of the
   `9e8777e`/`dca435d` window I first checked; worth a controller re-check, not a Lane D action (never
   edit `docs/lanes/task-ledger.tsv`).
2. **Await the controller's word on T9+T10** (`apps/server/src/tools/seed-*.ts` plus
   `apps/server/package.json` script lines) — those collide with Lane E's manifest ownership and Lane
   C's T15; do not start until told whether to route the script lines through Lane E or take the
   manifest myself. Three things T9/T10 need from T8, already recorded in the implementer's own notes
   and reproduced here so they survive a restart:
   - `ops:owner-github-plan` has `meta.needed_week: "0"`, so its `dueDate` lands at `2026-08-17` — one
     day BEFORE `week1`. Faithful to the tracker's own arithmetic, not a bug, but T9/T10 is where this
     first becomes visible (attention strip / overdue badge) — decide there whether a day-one-overdue
     errand needs a note.
   - `ctx.errandTypeId`/`ctx.initialStateId` in T8's tests are FIXTURE values only; nothing in T8 pins
     them to the real Errand ticket-type id or the real template's `initialStateId`. T9/T10 should add
     an assertion tying `ctx.initialStateId` to the live cloned template rather than assuming it matches.
   - Plan text (line ~2317, not yet read closely by this lane) declares `counterparty` as a custom field
     on the Errand ticket type — `startDate` must NOT also be declared custom (§3 point 2 above); T9's
     ticket-type definition needs to reflect that split, not the plan's original text.
3. **Never edit `docs/lanes/task-ledger.tsv`. Never merge own PR. Never commit to `main`.**

## 8. Handoff freshness

Written and pushed at head `a2e226fc22dd0b1827ff7dc396a79aa6f3f53559` on branch `exec/25-plan11-seed`,
PR #136 open. If resumed: re-verify `origin/main`'s HEAD, re-check PR #136 and PR #134's states with
`gh pr view`, and re-run `git branch --contains` on every sha in this file before trusting any of them.
