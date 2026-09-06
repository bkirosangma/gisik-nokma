# Lane E — live state (Plan 11: deployment & dogfooding, minus the live deploy)

**Written for a reader with NONE of my context.** If the session halted mid-task, everything you need to
finish is here. Verify anchors with `git branch -r --contains` — empty means orphaned; `git cat-file`
passes on orphaned commits and will lie to you.

# ▶ T16 IS WRITTEN AND GATED at content commit `07ab5fa`. Review IN FLIGHT. **Plan 11 is otherwise done.**

**If the session halted here, T16's work is COMMITTED AND PUSHED — do not rewrite it.** What remains is:
read the opus reviewer's verdict, fix what it finds, re-gate, push, open the PR. If the reviewer's output
was lost with the session, re-dispatch one over `git diff origin/main...HEAD` rather than trusting this
file's "gate green" as a substitute — **no independent party has checked T16 yet.**

| fact | value |
|---|---|
| branch | `exec/46-plan11-t16` from `origin/main` `fcd39e7` |
| content commit | **`07ab5fa`** (the handoff commit sits on top; read the head with `git rev-parse HEAD`) |
| gate | **30/30 · 0 cached · 1m57.32s · node v22.22.2 · 285 files / 3655 passed / 5 skipped · Unsupported engine 0 · no orphans** |
| `check:env` | **`CHECK_ENV_EXIT=0`** |
| `check-case-ids` | **ok**, 1590 ids, highest 13.203 |
| `check:runbook` | **ok**, all 12 resolve *(NEW in T16, its own CI step)* |
| §13 | used through **13.195. Next free: 13.196.** |
| PR | **NOT OPENED YET** |

## What T16 landed

1. **`docs/runbook.md`** — deploy, the three Asia/Kolkata settings, rotation, backups, orphan sweep,
   restore drill, seeding, incidents.
2. **`scripts/check-runbook-commands.mjs`** + root `check:runbook` + a step in `ci.yml`'s `check-env`
   job — **the only falsifiable thing about a runbook**: every command it names must resolve. Self-tests
   against 4 planted defects and 3 known-good before it will report clean; proven against the REAL
   runbook by restoring the `ops:sweep-orphans` ghost, which reddens it naming the site.
3. **`verify-projections.ts` now reads `DATABASE_URL` directly.** It used to call `loadConfig`, demanding
   `BETTER_AUTH_URL` + `BETTER_AUTH_SECRET` + `WEB_ORIGIN` — none of which it reads — so the runbook's
   own restore-drill step 4 answered `ConfigError`. **A drill nobody can run is not a recovery procedure.**
4. **THE DDL DECISION IS DISCHARGED** (carried since seam 1) in `docs/runbook.md` AND
   `deploy/do/README.md`: the verifier runs only against restore scratch databases, never production, and
   no DDL credential is added — it detects drift by rebuilding and diffing, so against production it would
   rewrite the rows it judges. **Cost recorded with it:** production drift surfaces only at the next
   monthly drill, so the exposure window is up to a month.
5. `Features.md` §13 intro reconciled (it claimed the runbook's gate was "NOT cleared") + two bullets;
   cases **13.190–13.195**.

**Two ghosts the first draft carried, both now fixed and both the reason (2) exists:** `ops:sweep-orphans`
has never existed (the script is `sweep:orphans`), and the restore drill's step 4 could not run at all.

# ▶ WHERE THIS LANE IS: T13 IS MERGED. **T16 IS THE ONLY THING LEFT IN PLAN 11.**

| fact | value |
|---|---|
| T13 | **MERGED as `f4a8cca` (PR #205)** — the deployed-stack E2E + the P42 auth fix. Reviewed, one Critical fixed. **Do not redo any of it.** |
| this branch | `exec/46-plan11-t16`, cut from `origin/main` `fcd39e7` |
| task | **Plan 11 Task 16** — plan text at `docs/superpowers/plans/2026-08-20-11-deployment-dogfooding.md` lines **4158–4422** |
| §13 case ids | Lane E block `13.101–13.200`, **used through 13.189. NEXT FREE: 13.190.** Never renumber. |
| precondition | **MET, measured** — #205 merged, Lane C's #203 merged, Lane D's #196 merged. Only open PR touching `Features.md`/`test-cases/13` is #213, which is §12 and disjoint. |

## T16's four deliverables

1. **`docs/runbook.md`** (create) — the plan's Step 1 gives full prose. **Its commands are WRONG; see below.**
2. **`Features.md` §13 final shape** — §13 already exists and is long. The plan's Step 2 text is the
   ORIGINAL draft and is stale; the section has been filled incrementally by Tasks 1–15 across five lanes.
   T16 reconciles it, it does not overwrite it.
3. **`test-cases/13-deployment-dogfooding.md` final shape** — same: the plan's Step 3 lists 13.1–13.23 as
   if writing the file fresh. **The file already holds ~150 cases.** T16 gives it its final shape.
4. **THE VERIFIER'S DDL DECISION — still undischarged, carried since seam 1.** Coordination doc lines
   **1607–1611** require `deploy/do/` to carry EITHER a DDL-capable credential for the projection verifier
   OR an explicit recorded decision that it runs only against restore scratch DBs. **Neither exists**
   (measured: every "verif" hit in `deploy/do/` is `sslmode=verify-full`). Record the decision in
   `docs/runbook.md` AND `deploy/do/README.md`, with the reason. That file is Lane C's T15 file and C is
   done with it — say so in the PR.

## MEASURED AT THIS SHA — the runbook's commands, because prose cannot fail

**A runbook is prose. The only honest check is that every command it names RESOLVES AND RUNS.** Measured:

| command the plan's runbook names | reality |
|---|---|
| `ops:backup-once` | ✅ exists (`apps/server`) |
| `ops:fetch-backup` | ✅ exists |
| `seed:cc`, `seed:dev` | ✅ exist |
| `check:db-tz`, `check:env`, `check:tasks` | ✅ exist (root) |
| `scripts/restore.sh` | ✅ exists |
| **`ops:sweep-orphans`** | ❌ **WRONG NAME. The real script is `sweep:orphans`** (Lane C landed it as `sweep:orphans -> tsx src/tools/sweep-orphans.ts`). The runbook must say `sweep:orphans`. |
| **`verify:projections`** | ⚠️ **exists but THROWS as the runbook invokes it.** `src/tools/verify-projections.ts:108` calls `loadConfig(process.env)`, which demands `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET` and `WEB_ORIGIN` — **none of which the verifier reads** (grep returns zero hits in that file). Reproduced with only `DATABASE_URL` set: `ConfigError: invalid server configuration — check: BETTER_AUTH_URL, BETTER_AUTH_SECRET, WEB_ORIGIN`. **So the runbook's restore-drill step 4 cannot work as written.** Either fix the tool to read `DATABASE_URL` directly (the pattern `cli-seed-*.ts` and `sweep-notifications.ts` already use, and which their docblocks explain choosing for exactly this reason) or the runbook must document the three dummy vars. **Recommend fixing the tool** — it is a `src/tools/` file, small, and the drill is the product's own recovery story. |

**The falsifiable artefact T16 should add:** a check that every command named in `docs/runbook.md`
resolves to a real script or file. Without it the runbook is unfalsifiable prose, which is this plan's
signature failure. Put it in `scripts/`, wire it to the `check-env` CI job (cheap, no build), and give it
a planted-defect self-test the way `scripts/check-case-ids.mjs` does.

## Standing rules that bind whoever finishes this

- **NEVER commit or push to `main`.** Branch → PR → the CONTROLLER merges. Never merge your own PR.
- **Never edit `docs/lanes/task-ledger.tsv`.**
- **Never pipe a test run into `head`** — it orphans the whole vitest worker pool at `ppid=1`. Use
  `> /tmp/x.log 2>&1` then read the file, or `| tail -N`.
- **Stage explicit paths, but DERIVE the list from `git status --porcelain`, never from memory**, and diff
  HEAD against the working tree before pushing. *A gate is a fact about a TREE, and the tree you hold is
  not the tree that ships* — this lane earned that twice in one day, once from each direction.
- **A handoff commit cannot name its own sha.** Name the last CONTENT commit; read the head with
  `git rev-parse HEAD`.
- **Gate:** copy `docs/lanes/gate-lock/{gate.sh,locked-test.sh,sweep-test-dbs.sh}` to a scratchpad, then
  `GATE_REPO=<this worktree> bash gate.sh /tmp/gate.log` backgrounded. Report `GATE_EXIT`, tasks, files/tests,
  node version, **`check:env` on its own line**, **`check-case-ids` on its own line** (it is a SEPARATE CI
  step, NOT part of `check:env`). Check the log's mtime against the clock before reading it.
- **Re-gate decision rule:** after a rebase, run
  `git diff --name-only <last-gated-content-sha> HEAD | grep -vE '^(docs/|test-cases/|Features\.md)'`.
  Empty ⇒ the old gate still covers the code. Non-empty ⇒ re-gate. Say which, and why.
- **Report to the controller** with `SendMessage` to **`gisik-nokma-0d`**.
- **CI:** GitHub Actions has been failing account-wide before the first step on the owner's BILLING BLOCK.
  Nothing merges until that is fixed. A local gate is the only gate available.

## Carried findings with owners — record, do not fix

- **13.176** a guest has NO navigation to the four errands explicitly shared with them; the only path to a
  ticket is through a project they cannot see. Owner Plan 6 / visibility.
- **13.179** (= 12.258) what the web shell renders past the 2000-row cap. Owner Plan 6 / web.
- **13.181** `seed:dev` has no runtime coverage and cannot run in-container (`docs/superpowers/plans` is
  absent from the image; `reference/` IS present, which is the positive control). Owner Lane D. **13.90 is
  `seed:cc`'s CLI smoke and is Lane D's to flip, not this lane's.**
- **OPTIONS is unmounted on the auth catch-all**, so a genuinely cross-origin deployment still needs the
  CORS preflight answered; `sign-in-flows.test.ts` pins it as a known gap. Trusting the origin was
  necessary, not sufficient.
- **The E2E is close to the auth rate limit** (2 user creations + 3 sign-ins per run). A re-run inside the
  window meets 429; restarting the server container clears the in-memory bucket.

## The two traps this lane hit, so you do not

1. **`docker compose ps` reports every container healthy while the proxy is completely broken.** `up -d`
   WITHOUT `--build` reuses a web image built before `SERVER_ORIGIN` landed, and that image proxies
   `/v1/*` at itself: 500 after ~30 s. Always `--build` after a source change.
2. **A check can pass for a reason unrelated to the property it names.** The review's Critical was exactly
   this: a `/v1/events` probe that was refused 403 by the HTTP-Origin hook before routing, so
   "authenticated" had no failure mode. Playwright's `page.request` sends **no Origin header** — if you
   write a request-level probe, send `origin` explicitly or it never reaches the door.
