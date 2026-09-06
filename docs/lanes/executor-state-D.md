# Lane D — executor state

**This file is Lane D's restart surface.** Rewritten for THIS work (Plan 11's two RETENTION
SWEEPS — `invite_tokens`, case 6.131, and `user_preferences` for revoked members) on branch
`exec/32-plan11-retention-sweeps`, cut from `origin/main` at `de88248` (this lane's own T9+T10,
PR #154) on 2026-09-06, per the controller's relaunch at the #154 fixed point (§13 override) and
the later re-task (#155/#157: D takes the two retention errands, C the two scheduler errands).
**Do not re-implement T7/T8/T9/T10/T17 — all merged, all promoted (11/7, 11/8, 11/9, 11/10).**

> Shas below are facts about when this file was written. Verify with `git branch --contains` —
> empty means orphaned. `git cat-file`/`git show` pass on orphaned shas and will lie.

## 1. Where things stand right now

- **Worktree**: `/Users/kiro/my_projects/gisik-nokma-lanes/lane4-periphery`, branch
  `exec/32-plan11-retention-sweeps`, head `4e88f25`, rebased onto `origin/main` at `4dd9779`.
- **PR #167 is OPEN**: https://github.com/bkirosangma/gisik-nokma/pull/167. Pushed, not merged.
  Gate green at `4e88f25`: 30/30 tasks, 0 cached, exit 0, node v22.22.2, server 107 files/1094
  tests, 0 "Unsupported engine", `check:env` exit 0, no orphaned vitest workers.
- **The branch was cut once, stopped mid-flight, and re-cut once — read this before assuming
  the git history says what you expect.** The branch was originally cut from `origin/main` at
  `c86c4b5`. A controller message ([`gisik-nokma-0d`], 2026-09-06 ~08:5x) reported that PR #150
  had concurrently minted §6 case ids **6.138–6.142** — the same block this task's dispatch had
  been told to use — between this branch's cut and the workflow's launch. The workflow had
  written **nothing to disk yet** (verified: `git status --short` was clean) when the message
  arrived, so it was stopped (`TaskStop`) rather than let mint-then-renumber, the branch was
  rebased onto the then-current `origin/main`, §6 was recounted independently (confirmed max
  **6.142**, matching the controller's own figure), and the workflow was relaunched with the
  corrected reservation (**mint from 6.143, block 6.143–6.159**). The final work mints
  **6.143–6.149**, entirely inside the corrected block. **Lesson for whoever restarts this
  lane next: a case-id block reservation is a fact about a moment, not a standing grant — recount
  at the sha you are actually minting against, every time, regardless of what an earlier message
  in this same task said.**

## 2. What was built (the two P33 retention errands)

Dispatched as a Workflow: one opus implementer (high effort) built both tools + tests +
catalogue in one pass (deliberately NOT split into two parallel agents — both errands touch the
same three shared files, `package.json`/`Features.md`/`test-cases/06-auth-visibility.md`, and
running them concurrently would have raced on those the way [[lane4-periphery/gate-lock-v3]]-class
incidents raced on shared state); one opus reviewer (high effort) re-ran everything independently
rather than trusting the implementer's report; one opus fix round, since the review found two
Important findings. No Fable at any stage, per the standing model ruling.

- **`sweepInviteTokens`** (`apps/server/src/tools/sweep-invite-tokens.ts`, closes **case 6.131**)
  — one parenthesised SQL predicate fragment (`SWEEPABLE_INVITE_TOKENS`), interpolated unchanged
  into both a dry-run `SELECT` and a live `DELETE ... RETURNING`, so the two cannot describe
  different things. Catches lapsed (`expires_at <= now()`) AND revoked-but-not-yet-expired
  invitations (an `EXISTS` against `proj_invites.status = 'revoked'`) — the revoked half is what
  case 6.131 actually names; an expiry-only sweep would leave a withdrawn workspace's credential
  live for the rest of its fortnight. `'accepted'` is deliberately absent: acceptance already
  deletes its own row atomically (`consumeInviteToken`), so an accepted invitation has no row
  left for this sweep to find, and adding the status would be a branch no fixture could reach.
- **`sweepUserPreferences`** (`apps/server/src/tools/sweep-user-preferences.ts`, new — no
  existing case; closes coordination doc finding **6c**, `docs/superpowers/plans/2026-08-20-00-
  series-coordination.md:5495-5502`) — retains a revoked member's `user_preferences` row for
  **`REVOKED_MEMBER_PREFERENCE_RETENTION_MS`** (30 days, documented as a default-under-uncertainty
  constant in the exact `INVITE_TOKEN_TTL_MS` style; *owner: product owner, to confirm or
  replace*) after their last `membership.revoked`, then deletes it. Four steps, each load-
  bearing and each documented in the source: (1) current membership is decided ONLY by
  `resolveEffectiveRole` — **ruling P22**, binding, never a direct `proj_memberships` SELECT,
  because a project-scope roster row survives revocation and a bare read would report a departed
  person as current; (2) the window's START is read from the **ledger**
  (`max(server_time)` over the membership entity's `membership.revoked` events), because
  revocation DELETES the workspace-scope projection row rather than marking it, so no column
  anywhere holds the instant; (3) a non-member with NO revocation event in the ledger is
  RETAINED and reported distinctly (`noRevocationEvidence`) rather than silently skipped — fail
  closed, same discipline as `invite_tokens.expires_at` being `NOT NULL`; (4) the DELETE itself
  re-states the membership guard (`AND NOT EXISTS (... proj_memberships ... scope_kind =
  'workspace')`), because steps 1–3 are three separate un-transacted round-trips and a
  `membership.granted` committing mid-sweep would otherwise destroy a now-current member's
  unrecoverable row (`user_preferences` is authored state; nothing rebuilds it).
- Both: `now`/predicate are inputs, never computed inside the pure sweep function (only each
  tool's `main()` reads a real clock); `--dry-run` is a plain `process.argv.includes` check, not
  the repo's one general flag-value parser (`cli-seed-convenience-corner.ts`'s `argValue`, which
  has a known bug consuming a following flag as a value — deliberately not reused here since
  neither sweep needs a flag VALUE); CLI shape mirrors `sweep-notifications.ts` exactly
  (`process.env['DATABASE_URL']` directly, no `loadConfig`, `createPool`, exit(2) if absent).
  `apps/server/package.json` gained `"sweep:invite-tokens"` and `"sweep:user-preferences"`,
  both `tsx src/tools/....ts`.
- **Deliberately not built**: any scheduling surface. Per case 6.131's own original text and
  this task's split with Lane C (the controller's 08:25 re-task): C owns the scheduler
  (`src/ops/schedule.ts`, for T11) and the two SCHEDULER-needing errands
  (`ops:sweep-orphans`, scheduling `sweep-notifications.ts`); D owns these two DELETE-shaped
  tools, invoked by whatever scheduler exists. Neither CLI `main()` is exercised by any test —
  matching the identical, pre-existing gap in the sibling `sweep-notifications.ts` and
  `verify-projections.ts` tools, named with an owner in case 6.145 rather than left implied.

## 3. The review round, and what it actually found — read before trusting the P22 wiring blindly

The review's brief specifically asked it to hunt two failure shapes: **"the sweep touched a live
row"** (not found, in code or under mutation, for either tool) and **"the excluding fixture is a
no-op against the real defect"** (found, once, for the preferences sweep — see below). Two
Important findings, both fixed in the same PR before merge:

1. **The P22 check was compliant in the shipped code but UNTESTED against the one state where it
   matters.** The original excluding fixture (a member re-granted inside the window) is built
   entirely from workspace-scope facts, so substituting the exact case-6.137 bug shape (a bare,
   unfiltered `SELECT role FROM proj_memberships`) for `resolveEffectiveRole` left the whole file
   green — the sanctioned reader and the forbidden one agreed on every state the fixture built.
   Fixed by adding a fixture where a revoked member's **project-scope roster row survives** (built
   through the real ledger — `grant` → `project.member_added` via a NEW helper,
   `attachToProjectThroughLedger`, deliberately not `seedMember(..., [{projectId}])`, which would
   re-apply the projection without appending the ledger event) — this is the one state the two
   readers disagree on, and it now reddens the mutation. **Case 6.148.**
2. **The preferences DELETE had no membership condition of its own** — it re-stated only the
   primary key, so a `membership.granted` committing between step 1 (the `resolveEffectiveRole`
   read) and step 4 (the DELETE) would silently destroy a now-current member's unrecoverable row.
   Fixed with the `NOT EXISTS (... scope_kind = 'workspace')` guard described above. **Case
   6.149.** The guard is stated in the source as a write-safety measure, NOT a second answer to
   the P22 membership question — `resolveEffectiveRole` is still the only decider of who is a
   *candidate*; the guard only stops the *act* from outliving the decision.

One Minor finding (the invite predicate's top-level `OR` was unparenthesized, safe today only
because it happens to be the entire WHERE clause in both callers) was also fixed while the file
was open. Both Important fixes were verified by planting the exact surviving mutant the review
found, confirming it now reddens the new fixture and nothing else, then restoring by byte copy
and sha256 (both new files are untracked at review time, so `git diff` could not vouch for them —
checksums were the only verifiable restore signal until the final commit).

## 4. Case-id catalogue — the collision that was caught before any file existed

**Reserved block: 6.143–6.159** (assigned by the controller after PR #150 landed 6.138–6.142
concurrently with this branch's cut — see §1 above for the full story). This PR used
**6.143–6.149** (7 ids: one per falsifiable claim in the two sweeps' design, including the two
fixtures the review round's findings drove). **6.131 amended in place** (❌→✅; its own owner
line already named "Plan 11" as the closer, so it was amended rather than re-minted, following
the file's established convention — see how 6.50 was amended for the pattern this follows).

Recounted with the file's own positive-controlled method (`node scripts/check-case-ids.mjs` +
a direct grep cross-check: total `^- ` lines vs. distinct `6\.[0-9]+`-at-line-start matches, zero
unmatched, zero duplicates) at three points: before the corrected dispatch (137 lines, max
6.142 — matching the controller's stated fork point), after the implementer's pass (142 lines,
max 6.147), and after the fix round (144 lines, max 6.149, repo-wide unique-id count 1314). The
file's own running "highest id in use" sentence near the top was updated to the true post-edit
count, not incremented from the stale number it found (PR #150 had minted 6.138–6.142 without
touching that sentence — already stale before this round touched it, named as such in the new
prose rather than silently corrected).

## 5. Left unfixed, deliberately, named rather than glossed

- **Neither CLI's `main()` is exercised by any test** (the `DATABASE_URL`-absent `exit(2)` path,
  `createPool`, the `--dry-run` argv read, both `format*Report` functions) — inspection only,
  matching the identical pre-existing gap in `sweep-notifications.ts` and `verify-projections.ts`.
  Named in case 6.145 with an owner: whoever gives these tools a scheduling surface.
- **The scheduling surface itself.** Out of scope by the P33 split with Lane C; these are the
  DELETE, safe at any moment and safe twice, per case 6.131's own original text.
- **CORRECTION, struck rather than left standing:** an earlier version of this section reported
  two `projectNames`-on-`MyWorkResponse` typecheck errors (`src/routes/my-work.ts(152,33)`,
  `test/read/visible-projects.test.ts(123,17)`) as pre-existing on `main` from PR #150. **That was
  wrong, and the controller caught it.** `main`'s forced gate at `b4e2f14` (which includes #150)
  ran all ten typecheck tasks green with 0 cached, and #150's own CI run was green. What actually
  happened: the workflow's review/fix rounds ran `pnpm --filter @gisik-nokma/server run
  typecheck` directly (the ad-hoc-tsc trap Lane A recorded the same morning — invoking the
  package script in isolation rather than through `pnpm turbo run typecheck`, which is what keeps
  a workspace dependency's `dist/` in step with the source it was typechecked against) against a
  tree whose `dist/` for at least one workspace dependency predated the rebase past #150, so the
  two-error reproduction "proved" nothing about `main` — it reproduced a stale-build artifact of
  this lane's own working tree. Verified by this session: `pnpm turbo run typecheck --force`
  (16/16 tasks, 0 cached) is clean, `@gisik-nokma/server:typecheck` included. **Never record a
  build/typecheck red as a fact about `main` without a `--force` rebuild first** — the same
  discipline this branch's own tests already apply to a stale `dist/` under bare `vitest`.

## 6. The gate lock — GATE LOCK v3.2, and the mutation-contamination rule from PR #166

Used the reference implementation at `docs/lanes/gate-lock/` (Lane E's branch `exec/23-plan11` at
`e814f49`), copied into this session's scratchpad and adapted only for `REPO=`. That copy already
implements the v3.2 token-matcher form (a controller message describing "v3.2" arrived mid-task;
the pulled reference already matched it — no further edit needed). Do the same on a restart:
pull the reference rather than hand-roll the regex, adapt only the `REPO` line.

**New standing rule, from the controller (PR #166, paid for by Lane B): never commit a shared
source file while a subagent/workflow is mutation-testing it in the same worktree** — explicit-
path staging does NOT protect against this; Lane B's incident had a mutant ride into a commit
despite it. This task's mutation rounds (both the review's and the fix's) ran entirely INSIDE
the Workflow's own agents, which had all fully terminated (`status: completed`, `agents_done: 3`,
`agents_error: 0`) before this session did ANY `git add`/`git commit` — verified after the fact
by re-reading both committed source files for mutation markers (none) and confirming their byte
counts matched the working tree exactly (8124 and 12494 bytes, both files, HEAD vs. disk). If
resumed mid-task with a mutation round still active, do NOT commit until it (and everything it
spawned) has fully returned — checking a task's own `status` field is not optional.

## 7. Reporting

Reported to `gisik-nokma-0d` (controller) at each step: initial dispatch, the case-id collision
catch + relaunch, and the PR opening. Head sha `4e88f25`, `Tasks: 30 successful, 30 total`,
`Cached: 0 cached, 30 total`, server 107 files/1094 tests, node v22.22.2, `check:env` exit 0 on
its own line, zero orphaned vitest workers. Honest gap disclosed in the same message: the sweeps
ran only against throwaway `gisik_test_*` databases under the lock; nothing was scheduled, and
scheduling is Lane C's per the P33 split.

## 8. Remaining steps, in order (mid-execution at time of writing)

1. ~~Dispatch the two sweeps~~ — done, implement → review → fix, all opus, no Fable.
2. ~~Catch and correct the case-id collision before any file existed~~ — done (§1).
3. ~~Verify the diff and both new source files directly~~ — done: read both tool files in full,
   confirmed P22 compliance and the shared-predicate discipline by inspection, not by trusting
   either subagent's report.
4. ~~Run the full gate myself, at the rebased head~~ — done, 30/30, exit 0, server 1094/1094.
5. ~~Commit, rebase onto latest `origin/main` again (it moved twice more during this task), push,
   open the PR~~ — done. **PR #167.**
6. ~~Rewrite this handoff~~ — this write.
7. **Commit and push this handoff on the same branch, so it travels with PR #167.**
8. **Report the PR to the controller** — with head sha, `Tasks:` line, test count, node version,
   `0 cached`, `check:env` on its own line, every mutation's output, and the honest sentence about
   what was not verified.
9. **Never edit `docs/lanes/task-ledger.tsv`. Never merge own PR. Never commit to `main`.**
