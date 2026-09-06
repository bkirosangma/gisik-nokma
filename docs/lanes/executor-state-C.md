# Lane C — executor state (Plan 11 T11+T12: PR #183 OPEN, awaiting controller merge)

**This file is Lane C's restart surface, and nobody else's.** `executor-state.md` is Lane A's,
`executor-state-B.md`/`-D.md`/`-E.md` belong to their own lanes — never edit them. A Lane C session
relaunched from the controller's override recovers only what is written here.

> **Shas in narrative prose below are facts about when they were written.** Verify with
> `git branch --contains <sha>` — **empty output means orphaned**. `git cat-file` passes on reflog-only
> commits and will lie to you.

---

## STATUS: PR #183 OPEN — https://github.com/bkirosangma/gisik-nokma/pull/183

Head sha `636db92` on `exec/30-plan11-backups`, rebased onto `origin/main` at `3e6d606`. Local gate green:
`GATE_EXIT=0`, 30/30 tasks, 0 cached, **3439 tests / 269 test files**, node `v22.22.2`. `check:env` and
`check-case-ids.mjs` both exit 0 on their own. Nothing left to do here except wait for controller review/CI,
UNLESS the CI-vs-local restore-drill skip discrepancy below turns up something (see "What to check when CI
runs").

## THE STORY, SHORT, FOR THE NEXT SESSION THAT NEEDS IT

1. Branch cut from `origin/main` at `56cd091` (after #146 merged) per the controller's re-task ("Lane C
   takes Plan 11 T11+T12 after #146").
2. A Workflow-tool background job implemented, reviewed, and committed T11 then T12. **Its own bug**: the
   fix→re-review loop gated on the FIRST review's verdict, not the last — so when a SECOND review round on
   T11 still found one Critical + three Important, the script committed anyway (`cf5b3c5`, since rewritten
   by rebase). **The lesson, worth carrying into any future Workflow script with a fix→re-review loop: gate
   on the LAST verdict, always.**
3. Session hit the account-wide limit mid-flight; checkpointed uncommitted work honestly (labeled WIP) and
   pushed before the halt, per the controller's instruction.
4. On resume: the workflow's result arrived (it had finished, not been killed) and revealed the unresolved
   Critical. **Corrected the handoff immediately** rather than let a stale "reviewed" claim stand, then
   dispatched a second, narrower fix+review workflow.
5. That workflow's agents ALSO errored on the (still-recovering) session limit before returning. On the
   controller's resume instruction: **read the actual diffs myself, verified all four fixes by hand**
   (including reproducing the boot fix under `env -i` with `deploy/do/app.yaml`'s literal backup-worker env
   block), ran the affected tests (41 passed), and committed with an honest message crediting the
   verification method used.
6. Rebased onto the (by-then-current) `origin/main` at `3e6d606`. Two conflicts, both simple keep-both:
   `apps/server/package.json` scripts (mine beside Lane D's `seed:*`/`sweep:*`) and
   `test-cases/13-deployment-dogfooding.md` (Lane D's Task 9/10 cases vs my Task 11 cases, both appended
   after the same line — no semantic overlap, kept both in task order).
7. Ran restore-drill.test.ts for the first time ever (it had been committed but never executed): 5 passed /
   5 skipped, the skip disclosed on stderr as a client/server major-version mismatch (18 vs 16 locally).
8. Full gate green post-rebase. Force-pushed (rebase rewrote already-pushed history) and opened PR #183.

## WHAT TO CHECK WHEN CI RUNS ON #183 — the controller's instruction, don't skip it

**Locally the restore drill's round-trip half SKIPS** (client 18 vs server 16 — this machine's libpq vs the
compose Postgres). **CI installs `postgresql-client-16`** (this same branch's own Task 14 CI work), so in
CI that half should actually RUN, not skip. Read the `server-tests` shard's real step output once CI
finishes and confirm it shows something like "N passed, 0 skipped" for `restore-drill.test.ts`, not the
same 5-skipped shape as local. **If CI shows the same skip, that is a live finding, not a shrug** — the
controller named this explicitly: a skip that discloses its reason locally and silently persists in CI is
the "check that cannot fail" class in its deployment costume. Put the real CI number in the PR body/thread
once known.

## KNOWN, DISCLOSED LIMITATIONS (already stated in the PR body and in-code — not new work items)

- No automated test proves a cross-version restore (`pg_restore` older or newer than the `pg_dump` that
  wrote the archive) — `restore.sh`'s usage text and `deploy/do/README.md` both say so, naming the specific
  failure (a newer `pg_restore` sends settings like `transaction_timeout` an older server rejects).
- The backup worker's boot fix was verified under a synthetic `env -i` block, not against real DigitalOcean
  Spaces credentials or an actual deployed worker.
- `error-alerter-shim.ts` is temporary. Lane E's Plan 11 Task 3 (`apps/server/src/alerts/error-alerter.ts`)
  is still on `origin/exec/23-plan11`, not `main`, as of `3e6d606`. **Whoever rebases past T3 first: delete
  the shim, repoint its two importers (`schedule.ts`, `backup-daemon-main.ts`) at
  `../alerts/error-alerter.js` — nothing else should need to change**, per the shim's own header (a checked
  claim, not a hope — verified against the real module by `git show origin/exec/23-plan11:...` before this
  PR opened).

## NEXT ERRANDS, QUEUED, NOT STARTED (per the controller's instruction — after #183 merges)

- `ops:sweep-orphans` (monthly, 30-day, object-store orphans with no ledger event) and scheduling
  `tools/sweep-notifications.ts` — both fold into `src/ops/schedule.ts`'s existing scheduler, not a second
  one. Lane D takes the two data-retention sweeps in `src/tools/` separately.

## THINGS A RESTARTED SESSION MUST NOT ASSUME

- `origin/main` has certainly moved again since `3e6d606` — refetch before trusting any anchor above.
- Do not re-implement T11 or T12. Do not start the sweep-orphans/sweep-notifications errand before #183
  merges.
- A gate result is a fact about the tree it ran against at that moment, not about "the branch" in general —
  re-verify before relying on the numbers above if any time has passed or any commit landed since.
