# 13. Deployment & dogfooding — test cases

Mirrors `Features.md` §13. Status: `❌` not covered · `✅` covered · `🟡` partial · `🧪` manual · `🚫` out of scope (with reason).

**Numbering, and why this file starts at 13.1.** `Features.md` §13 and this bucket belong to Plan 11 by
the coordination doc's reservation table. Plan 11's own Task 16 normally opens this section (held until
Tasks 1–15 merge) and would pin its own numbering across the whole plan. Tasks 14 and 15 landed ahead of
that, in separate PRs — lifted to close the Plan 5 gate's CI precondition sooner — so this file opens the
bucket early: 13.1–13.6 are Task 14's (added first), 13.7+ are Task 15's, continuing from Task 14's
then-highest id rather than renumbering. **Never renumber**: when Task 16, or any of Tasks 1–13, land,
they continue from this file's then-highest id in turn, exactly as `09-editor-attachments.md` and
`12-offline-sync-apps.md` did for the reservation gaps they each recorded.

**IDS IN §13 ARE ALLOCATED, NOT DISCOVERED — the same collision class §12 recorded, one file over: Lane D
independently minted its own 13.1–13.36 for Tasks 7/8 against this file's 13.1–13.6, from a fork point
that couldn't see this branch.** Blocks, controller-allocated 2026-09-06: **Lane C 13.1–13.40** (Tasks 14
[13.1–13.6, pushed], 15 [13.7–13.8], and — per `docs/lanes/controller-state.md`'s "Re-task 07:50 — Lane
C takes Plan 11 T11 + T12 (backups, restore drill) after #146" — Tasks 11 [13.9–13.39] and 12) · **Lane
D 13.41–13.100** (Tasks 7, 8) · **Lane E 13.101–13.200** (the rest of Plan 11: seam 1, Task 13, Task 16;
NOT Tasks 11–12, which the 07:50 re-task moved to Lane C) · **Lane C 13.201–13.240**, allocated
2026-09-06 once `13.1–13.40` was confirmed exhausted (the scheduler-generalisation errand, minted at
13.201–13.203). **The next free block is `13.241`, controller-allocated ON REQUEST ONLY.** A lane takes
its assigned block and does not derive the next free id from this file — recount the MAXIMUM in use
against `origin/main` at every rebase as the control, but never mint from it.

**Numbering is BLOCK-allocated across parallel lanes, controller-assigned 2026-09-06, because more than
one lane opened this section before Plan 11 Task 16's own catalogue pass (normally the sole opener, held
until Tasks 1–15 merge) could run: Lane C `13.1–13.40` (Task 14 landed at 13.1–13.6; Task 15 continues
inside the block at 13.7–13.8; Tasks 11–12 too, at 13.9+, after the 07:50 re-task cited above moved them
from Lane E) · Lane D `13.41–13.100` (Tasks 7–8 below, at 13.41–13.76; Tasks 9–10 continue inside the
block) · Lane E `13.101–13.200` (seam 1, Task 13, Task 16) · Lane C `13.201–13.240` (the scheduler
generalisation, 13.201–13.203, once `13.1–13.40` was confirmed exhausted). Next block starts at
`13.241`, controller-allocated on request. Never renumber a landed id; a lane exhausting its block asks
the controller for another rather than borrowing a neighbour's.**

Nothing in the Task 14/15 section below is proven by an automated test in the usual `vitest` sense —
there is no test runner for GitHub Actions YAML. `🧪` there means: reproduced by hand against the actual
tools involved (actionlint, a real vitest run), not inferred from reading the YAML. The Tasks 7–10 sections
below it are ordinary `vitest` coverage and use `✅`/`❌` per case (Task 9's CLI-smoke case, 13.90, is `❌`
pending the dev compose stack).

## CI pipeline and deploy spec (Tasks 14–15)

- 🧪 **13.1 — a docs-only diff still runs the ledger gate.** `check-tasks` is not gated on the
  `scope` job's `code_changed` output (unlike every other job below it), because the ledger it checks
  lives under `docs/lanes/` and a ledger-only promotion PR is exactly the docs-only case the `scope`
  job's own rule exempts everything else for. Reproduced: `node scripts/check-task-ledger.mjs` run
  standalone, no `pnpm install`, exits 0 against the current ledger. `.github/workflows/ci.yml`
  (`check-tasks` job), `scripts/check-task-ledger.mjs`
- 🧪 **13.2 — the server suite shards without dropping or duplicating tests.** `vitest run
  --shard=N/4` against `apps/server/test` (90 files) was reproduced locally at two different shard
  counts (`1/2`+`2/2` against a real multi-file directory) — each file appeared in exactly one shard's
  results, both shards reported `success: true`. `.github/workflows/ci.yml` (`server-tests` job)
- 🧪 **13.3 — a fully-skipped `skipIf` suite fails the gate instead of passing quietly, including the
  zero-evidence case.** `check-no-silent-skips.mjs` reproduced against four planted probe files (not
  committed): a file with no `.skipIf(` usage (ignored), a file with a `.skipIf(true)` guard AND a normal
  passing test in the same file (passes — partial skip is fine), a file whose entire content is behind
  `.skipIf(true)` (exit 1, names the file), and — the case an opus review found this script's first
  version got backwards — a `.skipIf(` guard wrapping a loop over an EMPTY fixture list (`for (const f of
  fixtures) it(f, ...)` with `fixtures = []`), which collects zero assertionResults entirely rather than
  skipped ones; the first version's `assertions.length > 0 &&` guard let this print "ok" and exit 0, which
  is exactly the silently-empty-suite case the script exists to catch. Fixed by dropping that guard; all
  four probes now behave correctly. No shipped file in this repo uses `.skipIf(` yet — this case is ahead
  of its first real trigger, which Plan 11 Tasks 11/12 will provide. `scripts/check-no-silent-skips.mjs`
- 🧪 **13.4 — a `.skipIf(` guard landing outside the one job that checks for silent skips fails the
  gate instead of shipping unguarded.** `check-skipif-coverage.mjs` — found missing by the same opus
  review, since `check-no-silent-skips.mjs` only runs inside `server-tests`, leaving all 8 other packages
  (and any file inside `apps/server` outside the `test/` prefix) covered by nothing — reproduced against
  the real repo (245 test files, exit 0, none outside `apps/server/test/`) and against a planted, staged
  `.skipIf(` file under `packages/domain/test/` (exit 1, names the file). `scripts/check-skipif-coverage.mjs`
- ❌ **13.5 — the postgres-client-16 install actually resolves on `ubuntu-latest`.** Not verified —
  this repository's only linter for GitHub Actions YAML (`actionlint`) does not execute apt installs,
  and this task's environment cannot run an Ubuntu Actions runner directly. The install step now runs
  `pg_dump --version | grep -q ' 16\.'` as its own falsifiable check immediately after the apt install, so
  if the assumption (`ubuntu-latest` resolves to a distro whose default PostgreSQL major is 16) is ever
  wrong, the job fails naming the mismatch rather than silently running whatever version apt gave it.
  Confirm from the PR's own CI run before treating this case as ✅. `.github/workflows/ci.yml`
  (`server-tests` job)
- 🧪 **13.6 — the `e2e` job never mistakes an unrelated file for Task 13's compose-based E2E readiness.**
  The first version gated on `docker-compose.dev.yml` AND `apps/web/playwright.config.ts` both existing —
  an opus review found the second file **already exists on `origin/main` today**, for a deliberately
  off-gate mock-only smoke (`apps/web/playwright.config.ts`'s own docblock: "It is not on the gate and it
  must not become so by accident"). The first version would have started running that mock smoke against
  a compose stack it never touches the moment ANY `docker-compose.dev.yml` appeared at the repo root, for
  any reason — reporting compose-based E2E coverage the gate would not actually have. Fixed: the job now
  checks only for `docker-compose.dev.yml` (Task 13's one known, not-yet-existing artifact) and never
  attempts to run anything even once that file exists — it prints that Task 13 must supply the real
  invocation, rather than guessing one. Reproduced: confirmed `apps/web/playwright.config.ts` exists on
  this branch today (verifying the bug was real, not hypothetical); the job's own logic change was
  verified by reading, not by a real Actions run — confirm from the PR's own CI run once Task 13 lands
  that this job does not silently start running the mock smoke. `.github/workflows/ci.yml` (`e2e` job)
- 🧪 **13.7 — the deploy spec's object-storage and web-client env var names match what code actually
  reads, not the plan's original draft.** `deploy/do/app.yaml` is on this branch (Task 15's own PR).
  Verified: `pnpm check:env` passes unchanged (exit 0, 47 documented / 26 referenced) with
  `deploy/do/app.yaml` written using `OBJECT_STORE`, `OBJECT_STORE_S3_ENDPOINT`, `OBJECT_STORE_S3_REGION`,
  `OBJECT_STORE_S3_BUCKET`, `OBJECT_STORE_S3_ACCESS_KEY_ID`, `OBJECT_STORE_S3_SECRET_ACCESS_KEY`,
  `OBJECT_STORE_S3_FORCE_PATH_STYLE` (confirmed by `check:env`'s own output as the names
  `apps/server/src/attachments/store-config.ts` destructures) and `SERVER_ORIGIN`/
  `NEXT_PUBLIC_SERVER_URL` (confirmed as the names `apps/web/next.config.ts` and
  `apps/web/src/providers.tsx` actually read) — not the plan's original `S3_*` /
  `NEXT_PUBLIC_API_URL` / `NEXT_PUBLIC_WS_URL`, none of which any shipped code reads; independently
  re-verified by a sonnet review agent (one comment-precision nit fixed) and, on this restart, against
  Lane E's own unmerged `origin/exec/23-plan11` at `f7c9b0f`, whose landed `config.ts` implements
  `DEPLOY_SHA`, `TRUST_PROXY`, `RATE_LIMIT_*`, `ALERT_WEBHOOK_URL`, `SMTP_URL`, `MAGIC_LINK_FROM` and
  `DATABASE_CA_CERT` under the exact names this spec already uses. `deploy/do/app.yaml`
- 🧪 **13.8 — the database-timezone check is genuinely falsifiable, against the failure mode that
  actually would have hidden a broken deployment.** `scripts/check-db-timezone.mjs` is on this branch
  (Task 15's own PR). Verified: reproduced against a throwaway database explicitly `ALTER`ed to `UTC`
  (exit 1, names the wrong zone and the fix), and on this restart re-run against the shared dev Postgres
  at `localhost:54329` (exit 0, prints `database timezone: Asia/Kolkata`). The first attempt to prove
  this — pointing the check at the shared dev Postgres's own admin `postgres` database, expecting it to
  fail because nothing had `ALTER`ed it — instead PASSED, because `docker-compose.yml`'s `-c
  timezone=Asia/Kolkata` sets the timezone at the **cluster** level, so every database on that server
  (the admin one included) already answers `Asia/Kolkata` with no per-database `ALTER` anywhere — exactly
  the trap the plan's own suggested falsifiability demo (pointing at "the dev compose Postgres has not
  been altered yet") would have fallen into, independently confirmed by a cross-lane review as a real bug
  in the plan text, not this file. The corrected demo (a database explicitly forced to `UTC`, overriding
  the cluster default) is what actually falsifies the check. `scripts/check-db-timezone.mjs`

## Seed plumbing (Task 7)
- 13.41 ✅ `seedUlid` is a valid, `ULID_REGEX`-matching id — `seed-ulid.test.ts`
- 13.42 ✅ `seedUlid` is deterministic — the idempotence mechanism — `seed-ulid.test.ts`
- 13.43 ✅ `seedUlid` differs across keys and across namespaces — `seed-ulid.test.ts`
- 13.44 ✅ planted defect: a namespace/key join ambiguity cannot collide (`'ab'+'c'` vs `'a'+'bc'`) — `seed-ulid.test.ts`
- 13.45 ✅ `plainTextDoc` keeps record text literal — markdown-looking characters stay characters — `doc-text.test.ts`
- 13.46 ✅ `plainTextDoc` renders one paragraph per line; blank lines become empty paragraphs — `doc-text.test.ts`
- 13.47 ✅ `plainTextDoc('')` is still a valid one-paragraph doc — `doc-text.test.ts`
- 13.48 ✅ `findUserIdByEmail` queries better-auth's `"user"` table case-insensitively and returns the id — `users.test.ts`
- 13.49 ✅ `findUserIdByEmail` returns null when nobody has signed in with that address — the seed never invents people — `users.test.ts`
- 13.50 ✅ `checkErrandTemplate` accepts the real errand-with-waits template — `templates.test.ts`
- 13.51 ✅ planted defect: a template missing the `waiting` state is named — `templates.test.ts`
- 13.52 ✅ planted defect: a mapped state reachable only in two hops is refused — no fabricated intermediate claims — `templates.test.ts`
- 13.53 ✅ planted defect: `waiting` without `blocked: true` is named (attention-strip contract) — `templates.test.ts`
- 13.54 ✅ planted defect: an unguarded way into `done` is named (closing an errand must say what happened) — `templates.test.ts`
- 13.55 ✅ planted defect: a rule on the one-hop seeding transition is named — Ruling P29's tripwire — `templates.test.ts`
- 13.56 ✅ `workflowFromTemplate` clones with a fresh id at version 1, leaving the template untouched — `templates.test.ts`
- 13.57 ✅ Ruling P29 pinned by identity: the real template trips exactly two `rule-bypassable` advisories — `templates.test.ts`
- 13.58 ✅ Ruling P29: "fixing" one advisory genuinely silences that advisory by identity, and `checkErrandTemplate` still reddens — `templates.test.ts`
- 13.59 ✅ Ruling P29: guarding both `waiting` paths clears the advisory panel to zero, and `checkErrandTemplate` still refuses it — `templates.test.ts`

## Convenience Corner mapping (Task 8)
- 13.60 ✅ `readCcBoard` reads week1 and the items out of the frozen snapshot — `cc-board.test.ts`
- 13.61 ✅ the two operational epics hold exactly 23 errands in snapshot `24e2240` (13 registrations + 10 questions, 0 done) — `cc-board.test.ts`
- 13.62 ✅ planted defect: a file that does not define `window.CC_TRACKER` is refused with the path named (a `.ts` module throws inside the `vm` sandbox before any shape check runs — proven by wrapping the eval and rethrowing) — `cc-board.test.ts`
- 13.63 ✅ planted defect: a sandboxed global that is not `CC_TRACKER`, and a `CC_TRACKER` missing `items`, both exercise the shape-check branch itself (not just the syntax-error path) — `cc-board.test.ts`
- 13.64 ✅ `neededWeekEnd` reproduces the tracker generator's own week arithmetic (`build_tracker.py:390`) at weeks 0, 1, 7, 28 — `cc-map.test.ts`
- 13.65 ✅ invariant 4: an item with no asked/submitted date gets no `startDate` claim — `cc-map.test.ts`
- 13.66 ✅ invariant 4, the record's own natural planted defect: `ops:duns` carries an attention `since` but no origin `started` — no `startDate` claim — `cc-map.test.ts`
- 13.67 ✅ the one origin-dated item (`ops:accountant-hsn-digits`) gets its `startDate` claim verbatim, shaped `{date, note?}` — `cc-map.test.ts`
- 13.68 ✅ planted defect: stripping `needed_week` removes the `dueDate` claim — `cc-map.test.ts`
- 13.69 ✅ `needed_week` becomes a `dueDate` claim carrying the derivation in its note — `cc-map.test.ts`
- 13.70 ✅ statuses map without invention: `next`/`later`/`blocked` (→ `waiting`) map correctly, and a `later` item emits no transition — `cc-map.test.ts`
- 13.71 ✅ planted defect: a `done` item is refused — the seed never claims completion on anyone's behalf — `cc-map.test.ts`
- 13.72 ✅ planted defect: `done: true` against a stale non-done state string is still refused — the flag is checked, not just the state string — `cc-map.test.ts`
- 13.73 ✅ planted defect: an unknown tracker state is refused, never guessed — `cc-map.test.ts`
- 13.74 ✅ the body carries the record verbatim: tracker id, origin, counterparty/who, blocked-by resolved to the blocking item's human title, attention schedule, ask text — `cc-map.test.ts`
- 13.75 ✅ the description event carries the text as a literal-text doc, round-tripped through the domain's own `docToPlainText` — `cc-map.test.ts`
- 13.76 ✅ determinism: two builds of the same item are identical id-for-id; every event id is namespaced to the item so a re-snapshot cannot collide — `cc-map.test.ts`

## Convenience Corner seed runner (Task 9)

*(Integration — real Postgres, real ingest service, real permission gate, real rule engine. The cases share one database and run in declaration order on purpose: three of them only mean anything as the SECOND run over a world the first one built.)*

- 13.77 ✅ the seed refuses when the owner has never signed in, and the ledger stays empty — people are never invented — `seed-cc.test.ts`
- 13.78 ✅ first run through `ingestClientBatch` lands exactly 118 events — 7 the seed owns plus 111 errand events — and the server adds its own 6-event founding sequence — `seed-cc.test.ts`
- 13.79 ✅ 23 errand tickets, guest NOT configured when the accountant has not signed in (`--allow-missing-guest`) — `seed-cc.test.ts`
- 13.80 ✅ the seeded board tells the record's truth: `ops:duns` in `next`, `ops:accountant-hsn-digits` in `in-progress`, `ops:apple-developer` in `waiting` — `seed-cc.test.ts`
- 13.81 ✅ provenance: the `dueDate` claim is the OWNER's, and its note carries the derivation ("from the tracker record — first needed in week N") — `seed-cc.test.ts`
- 13.82 ✅ the one origin-dated item carries its `startDate` verbatim (`2026-08-18`) as a built-in field claim — `seed-cc.test.ts`
- 13.83 ✅ re-run is a no-op: `committed` is 0 and the ledger is byte-for-byte the same size — `seed-cc.test.ts`
- 13.84 ✅ the re-run accounts for EXACTLY the first run's committed count (`skippedExisting === firstRun.committed`) — a seed that built nothing would pass `> 0` and is caught here — `seed-cc.test.ts`
- 13.85 ✅ staged guest: a later run with the accountant resolvable commits EXACTLY 5 events — 1 `membership.granted` + 4 `visibility.set` — and the ledger grows by exactly 5 — `seed-cc.test.ts`
- 13.86 ✅ the four explicit-visibility rows are exactly the items whose record names the accountant (`meta.who === 'Accountant'`), and each list is exactly `[owner, accountant]` — the owner never loses sight of their own errand — `seed-cc.test.ts`
- 13.87 ✅ `verifyProjections` is clean over the whole seeded world — every projection is derivable from the ledger the seed wrote — `seed-cc.test.ts`
- 13.88 ✅ planted defect: two records sharing one seed id fail the run before the batch is submitted or the ledger is queried — never counted as "already present" — `seed-cc.test.ts`
- 13.89 ✅ a refused event fails the run loudly with the rule id and the refusal sentence quoted, and the ledger is unchanged — `seed-cc.test.ts`
- 13.90 ❌ CLI smoke: `seed:cc` against the dev stack reports `23 errand tickets, guest NOT configured`, and a second run reports `0 committed` (Task 9 Step 5 — needs the compose stack from Tasks 1–3)
- 13.91 ✅ the door, asserted directly: the seed is handed a LIVE ungated `ingestBatch` alongside the gated one and calls it exactly 0 times, while `ingestClientBatch` is called once carrying all 118 events — the ungated door would commit the identical events, so nothing else in this file can tell the two apart — `seed-cc.test.ts`

## Gisik Nokma dev seed (Task 10)

- 13.92 ✅ `readPlanSeries` reads the full eleven-plan series (`01`-`11`), skipping the `00` coordination doc — `plan-series.test.ts`
- 13.93 ✅ every plan document has a non-empty verbatim H1 title, a goal, and at least one non-empty task title — `plan-series.test.ts`
- 13.94 ✅ `readPlanSeries` reads this very plan's own tasks — plan 11's title contains "Deployment" and it has at least 16 tasks — `plan-series.test.ts`
- 13.95 ✅ planted defects (invariant 4, "the calendar stays empty"): `buildDevSeedEvents` claims no `startDate`/`dueDate` and emits no `ticket.transitioned` — no script claims progress or dates on work it did not do — `seed-dev.test.ts`
- 13.96 ✅ every built event wears the client door's `origin: 'web'`, never the internal door's `'server'` — `seed-dev.test.ts`
- 13.97 ✅ the owner joins the one project this seed creates (`project.member_added`, correct `userId`) strictly before the first `ticket.created` — `seed-dev.test.ts`
- 13.98 ✅ one epic ticket per plan document and one task ticket per `### Task N:` heading, titles verbatim, including plan 11's own title among the epics — `seed-dev.test.ts`
- 13.99 ✅ `buildDevSeedEvents` builds no duplicate event ids across the whole batch — `seed-dev.test.ts`
- 13.100 ✅ `seedDevWorkspace` refuses when the owner has never signed in — the seed never invents people — and, once signed in, a first run commits real events while a second run is a no-op (`committed: 0`, `skippedExisting` exactly accounting for the first run) — `seed-dev.test.ts`

## Backups (Task 11)

Minted at **13.9–13.39**, continuing inside the `13.1–13.40` block the controller assigned this work
(13.1–13.8 were Tasks 14/15; 13.9–13.40 were free).

**Why this is Lane C's block and not Lane E's.** The two block paragraphs in this file's header, and
`docs/lanes/controller-state.md`'s §13 allocation, both assign Tasks 11–12 to Lane E's `13.101–13.200`.
That allocation was superseded by name, not by this file's say-so: `docs/lanes/controller-state.md`'s
heading **"Re-task 07:50 — Lane C takes Plan 11 T11 + T12 (backups, restore drill) after #146; Lane E's
queue is seam 1 → T13 → T16"**. The re-task moved the work but never amended the block sentences, so the
header's two paragraphs and the controller doc's §13 lines still read T11/T12 = Lane E. **Both header
paragraphs below are amended to read Lane C `13.1–13.40` (Tasks 14, 15, 11, 12);
`controller-state.md`'s own §13 lines are left to the controller, who owns that file — a reader of it
alone still needs the "Re-task 07:50" heading to reconcile the two.** Nothing here renumbers a landed
id either way.

**BLOCK NEARLY EXHAUSTED — the controller needs to know.** Task 11 alone consumed `13.9–13.39`, leaving
exactly `13.40` free in Lane C's `13.1–13.40`. **Task 12 (the restore drill) cannot be catalogued inside
this block and must be given another** — asked for, per the rule at the head of this file, never borrowed
from Lane D's or Lane E's. **RESOLVED, provisionally, by the "The restore drill (Task 12)" section at the
foot of this file:** `13.40` is spent there on the guard pair, and Task 12's remaining cases are written out
in full under `PENDING BLOCK` headings with **no ids minted**, awaiting `13.201`. Nothing is borrowed and
nothing is renumbered; the ask still stands.

**ONE GATE SCRIPT WAS AMENDED, disclosed here rather than only in its own comment:**
`scripts/check-env-example.mjs` — Task 14's env-contract gate — gained `PGPASSWORD` in its `IGNORE` set,
because `src/ops/pg-dump.ts` WRITES that name into a child process's environment (so the database
password stays out of argv, case 13.31) and detector D3 read it as a config key the app reads. The gate
covers what the code READS from its environment; this is the other direction, and an operator must never
set `PGPASSWORD` themselves, so documenting it in `.env.example` would invite exactly the wrong thing.
The consequence to weigh: `IGNORE` is global, so `PGPASSWORD` is now un-gateable everywhere. The gate's
printed count moved `30 referenced` → `31` (`PGPASSWORD`, attributed to `pg-dump.ts`) at 47 documented,
exit 0 — a changed number a reader diffing against the pre-Task-11 run would otherwise find unexplained.

- ✅ **13.9 — `msUntilNextUtc` returns the delay to a time still ahead today.** 20:00 → 21:00 is exactly one hour. `apps/server/test/ops/schedule.test.ts`
- ✅ **13.10 — a time already past rolls to tomorrow, not to a negative delay.** 21:30 → 21:00 is 23.5 hours. `apps/server/test/ops/schedule.test.ts`
- ✅ **13.11 — a day-of-week constraint is honoured, asserted by the resulting instant rather than by an arithmetic re-derivation.** From Thursday 2026-08-20, the next Sunday 22:00 UTC is `2026-08-23T22:00:00.000Z`. `apps/server/test/ops/schedule.test.ts`
- ✅ **13.12 — planted defect: a malformed schedule time is refused and NAMED.** `'9pm'` throws an error containing `9pm`, so an operator sees which value they mistyped rather than a generic parse failure. `apps/server/test/ops/schedule.test.ts`
- ✅ **13.13 — `exportLedger` writes a dated `ledger/YYYY-MM-DD.ndjson.gz` at content type `application/gzip`, and the three seeded `workspace.created` submissions are all present.** Asserted by counting that type, not by claiming nothing else exists: ingest derives a companion set per workspace (a workflow, four ticket types, an owner membership), so three submissions commit twenty-one events and the plan's draft `toHaveLength(3)` was stale. `apps/server/test/ops/export-ledger.test.ts`
- ✅ **13.14 — the export is byte-deterministic: two exports of the same ledger are identical.** `apps/server/test/ops/export-ledger.test.ts`
- ✅ **13.15 — the export holds exactly what the `events` table holds, proven against the DATABASE rather than against another export.** 13.14 compares an export to an export, so two exports that both dropped the same rows would agree and still pass; this case closes that by three independently-issued queries — a `count(*)` matching the line count, the decoded `seq` values in order matching `ORDER BY entity_kind, entity_id, seq` (`readLedger`'s actual canonical order, which genuinely differs from insertion order here), and the sorted `seq` multiset matching `ORDER BY seq` so the check does not rest on one ordering clause being copied correctly. `apps/server/test/ops/export-ledger.test.ts`
- ✅ **13.16 — `dumpDatabaseToSink` streams a custom-format dump to a dated `pg/YYYY-MM-DDTHH-mm.dump` key and the bytes start with the `PGDMP` magic.** `apps/server/test/ops/pg-dump.test.ts`
- ✅ **13.17 — the captured bytes are an archive `pg_restore` can actually read, whose table of contents names `events`.** Written to a `mkdtemp`'d file and listed with `pg_restore --list` (libpq on the child's `PATH`), so the claim is about a real archive rather than about five magic bytes. `apps/server/test/ops/pg-dump.test.ts`
- ✅ **13.18 — the seeded event is INSIDE the archive — the one assertion here an empty database fails.** Measured 2026-09-06 (pg_dump 18.4 / server 16.15): both an empty and a one-row database produce the identical `TABLE DATA public events` TOC line, so 13.17 alone still proves nothing about the data. This case renders the archive's COPY block with `pg_restore --data-only --table=events --file=-` and asserts the seeded event's own ULID appears in it. `apps/server/test/ops/pg-dump.test.ts`
- ✅ **13.19 — planted defect: a bad database url fails loudly, carrying `pg_dump`'s own stderr.** The call rejects rather than resolving with a key to an empty object. (What this case does NOT prove — that the failed dump leaves nothing behind — is 13.30's job; it was a disclosed gap here until `ObjectSink` grew `discard`.) `apps/server/test/ops/pg-dump.test.ts`
- 🧪 **13.20 — a BACKUP-ONLY variable read by `object-sink.ts` is seen by the env-contract gate's D2 detector, so the destructuring style is load-bearing rather than cosmetic.** Restated 2026-09-06 after a review found the first wording overclaimed. The gate's own printed output attributes all five `OBJECT_STORE_S3_*` names to `apps/server/src/attachments/store-config.ts`, not to this file: `record()` in the script is first-write-wins and the walker reaches `attachments/` before `ops/`. So rewriting *these five* to dotted `env.NAME` would leave the gate green, and the earlier probe (renaming one to `OBJECT_STORE_S3_REGION_PROBE`) proved only that a NEW name is caught — which is the real claim, and the one this case now makes. Reproduced by hand: adding a genuinely new, undocumented, backup-only name to this file's destructuring made `node scripts/check-env-example.mjs` exit 1 naming `apps/server/src/ops/object-sink.ts` by path and `via env destructuring`; removing it returned the gate to exit 0. `scripts/check-env-example.mjs`, `apps/server/src/ops/object-sink.ts`
- ✅ **13.21 — `s3TargetFromEnv` refuses with EVERY missing variable named in one error — the bucket under its caller-supplied name, and the endpoint and region among them — and resolves exactly what the environment says with no default in the way.** Each of the five is dropped in turn and the error must name it; a two-variable environment must produce `backup object storage needs: BACKUP_S3_BUCKET, OBJECT_STORE_S3_ENDPOINT, OBJECT_STORE_S3_REGION` (all three, not just the first); an empty string counts as missing, not as a value; and the built client's resolved endpoint, region and `forcePathStyle` are asserted against what was passed in. The requirement set is deliberately STRICTER than `attachments/store-config.ts`'s — see 13.35 for the measurement that made it so. `apps/server/test/ops/object-sink.test.ts`
- ✅ **13.22 — `s3SinkFromEnv` uploads to the bucket named by `bucketVar` and never to the attachment bucket.** Asserted against an environment that holds BOTH bucket names, so a swap would be visible rather than a matter of the attachment name being absent. Key and content type are asserted too. The streaming half is still by construction (`@aws-sdk/lib-storage`'s `Upload`), not by a test. `apps/server/test/ops/object-sink.test.ts`
- ❌ **13.23 — `fetch-backup` writes one object to a local file and refuses a key that came back with no body.** No automated test yet. `apps/server/src/ops/fetch-backup.ts`
- 🚫 **13.24 — RETIRED WITH ITS SUBJECT. The shim is deleted; the case is not renumbered.** This case described `error-alerter-shim.ts`, which Lane C wrote as a stand-in and whose header scheduled its own deletion for whenever Task 3 landed. Task 3 landed in this PR (seam 1), so the shim is gone and its two importers — `src/ops/schedule.ts` and `src/ops/backup-daemon-main.ts` — now import `../alerts/error-alerter.js` directly. The swap was a type-identity check, not a hope: the real module exports `type ErrorAlerter = { notify(context: string, error: unknown): Promise<void> }` and `alerterFromConfig(alertWebhookUrl: string | null): ErrorAlerter`, which is exactly the pair the shim mirrored. **The behaviour this case asserted does not transfer**, and that is the point of retiring it rather than repointing it: the shim logged to stderr itself, whereas the real `WebhookErrorAlerter` POSTs without logging and `NoopErrorAlerter.notify()` is empty. Nothing is lost, because the never-silent property was deliberately moved out of the shim before the swap and is pinned at **13.25** against `startBackupDaemon`'s own catch — the file that survives. The real module's own coverage is catalogued with Task 3 in the seam-1 retroactive section below. `apps/server/src/alerts/error-alerter.ts`
- ✅ **13.25 — a failing backup job is written to stderr BY THE DAEMON, as structured JSON, AND handed to the alerter.** The alerter is deliberately not the only witness asserted: Task 3's real `NoopErrorAlerter.notify()` is an empty async function, its `WebhookErrorAlerter` POSTs without logging, and `.env.example:99` ships `ALERT_WEBHOOK_URL` empty — so the DEFAULT deployment gets the silent one. Had the stderr line stayed in `error-alerter-shim.ts` (a file whose own header schedules its deletion, promising "nothing else should need to change"), performing that retirement would have made every backup failure completely silent. Asserted by parsing the logged line and matching `{level, job: 'pg-dump', error}`, not by counting calls. `apps/server/test/ops/schedule.test.ts`
- ✅ **13.26 — the daemon re-arms after a failure: the next night runs the job again, and not one millisecond early.** A scheduler that runs once and stops is indistinguishable from a working one for twenty-four hours, which is why this is asserted in three steps — fires at 21:00, still once at 20:59:59.999 the next day, twice at 21:00. Fake timers with `advanceTimersByTimeAsync`, since the re-arm happens in a `.finally()` after an async catch and the sync variant would assert against a timer that does not exist yet. `apps/server/test/ops/schedule.test.ts`
- ✅ **13.27 — an alerter that THROWS is logged and swallowed; it does not take the daemon down or skip the re-arm.** Failing to report a failure must not become a second failure. Asserted by the `backup alerter failed` line plus a second job run on the next occurrence. `apps/server/test/ops/schedule.test.ts`
- ✅ **13.28 — the weekly ledger export keeps its day-of-week across the re-arm and does not degrade to nightly.** From Thursday: nothing on Friday or Saturday, once on Sunday 22:00 UTC, nothing for the six days after, again the following Sunday. The re-arm recomputing the delay without the day-of-week constraint would fire six extra times here. `apps/server/test/ops/schedule.test.ts`
- ✅ **13.29 — `stop()` clears the pending timers: the count goes 2 → 0, and a fortnight of advanced time runs neither job.** The timer count is asserted, not just the absence of calls, because a daemon that stopped running jobs but kept its timers would still hold the process open past `SIGTERM`. `apps/server/test/ops/schedule.test.ts`
- ✅ **13.30 — a failed `pg_dump` leaves NO object behind: the key it was streaming to is discarded, by name.** This is what 13.19 alone does not prove and what the previous implementation got wrong. `sink.put` is handed `child.stdout` before the exit code exists, so a dump that dies halfway has already streamed a truncated archive to a normal-looking dated `pg/<stamp>.dump` — indistinguishable at rest from a good one, and exactly what a restore drill reaching for "the latest dump" picks up. Asserted as `sink.discarded === [key]` and that it is the SAME key the put was aimed at, not a near-miss. Fails against the pre-fix code, which threw without touching the upload. `apps/server/test/ops/pg-dump.test.ts`
- ✅ **13.31 — the database password reaches `pg_dump` through `PGPASSWORD`, never through argv.** Every process on the host can read another's argv (`ps -ef`), and the backup worker holds production credentials. `splitDatabaseUrl` returns the password separately and a DSN that no longer contains it, while the user and the query parameters (`sslmode=require`) survive; a conninfo string that is not a URL at all is passed through untouched, because libpq accepts that form. The three live dump cases above still pass against a password-bearing `db.url`, which is what shows the channel actually carries it; this case is the other half, that the argv no longer does. The shapes that could have produced a malformed DSN are measured, not assumed: a password with NO user (`postgres://:pw@h/db`) yields `postgres://h/db` — WHATWG `URL` drops the whole userinfo section once both halves are empty, rather than leaving the `:@` a naive strip would — and a percent-encoded password is decoded before it reaches `PGPASSWORD`. A URL with no password is returned verbatim. Deliberately OUTSIDE the `skipIf` block — it is a pure function and gating it on `pg_dump` would hide it on exactly the machines that skip. Independently confirmed in the reproduction under 13.36, whose failure output prints the spawnargs verbatim: `'postgres://gisik@localhost:54329/gisik_test_…'`, no password. `apps/server/test/ops/pg-dump.test.ts`
- ✅ **13.32 — a throwing row source makes the export's gzip stream REJECT rather than HANG.** `source.pipe(gzip)` does not forward errors: before the fix, a generator that threw emitted `'error'` on a stream with no listener — an uncaught exception — while `gzip` never ended, so the consumer waited forever. The distinction pinned here is reject-vs-hang, so the case carries its own 5 s timeout: the pre-fix code would not fail the assertion, it would never reach it. `apps/server/test/ops/export-ledger.test.ts`
- ✅ **13.33 — `gzippedNdjson` is the same stream the happy path uses: one gzipped ndjson line per row, in order.** Keeps 13.32 from being a test of a function nothing calls. `apps/server/test/ops/export-ledger.test.ts`
- ❌ **13.34 — KNOWN CEILING, recorded so it is not a surprise: the ledger export's peak memory scales with the ledger.** `readLedger` runs one `SELECT * FROM events` and materialises the whole table as JS objects before a byte is written; only the gzip/upload half downstream is streamed. So `Features.md`'s multipart-streaming claim ("a multi-gigabyte dump never lands in the worker's memory") is true of `pg_dump` and NOT of the export beside it, and on the `basic-xxs` (512 MB) worker `deploy/do/app.yaml` provisions this is the one job whose OOM means no recovery artifact at all. Not fixed here: a constant-memory export means a cursor- or `LIMIT/OFFSET`-paged read, which is a change to `readLedger`'s contract and to every other caller of it. `apps/server/src/ops/export-ledger.ts`, `apps/server/src/ledger/event-store.ts`
- 🧪 **13.35 — the backup client built from `deploy/do/app.yaml`'s OWN backup-worker env block resolves DigitalOcean Spaces BLR1, not Amazon.** The measurement a review made against the previous revision: with the worker's literal env (bucket + credential pair, nothing else) the client resolved `https://s3.us-east-1.amazonaws.com/gisik-nokma-backups` — path-style, `us-east-1`, Amazon — so every nightly dump would have posted Spaces credentials at AWS and failed from the first night, invisibly in dev because `.env.example` supplies MinIO's endpoint and region. Reproduced against the amended block by constructing the client from those exact values and printing `client.config.endpoint()`, `region()` and `forcePathStyle`. `deploy/do/app.yaml`, `apps/server/src/ops/object-sink.ts`
  **Its planted-defect half, in the same probe run** (bundled here rather than given its own id, the way 13.3 bundles four): with `OBJECT_STORE_S3_REGION` removed from that block the construction REFUSES — `backup object storage needs: OBJECT_STORE_S3_REGION`; with `OBJECT_STORE_S3_ENDPOINT` removed, likewise; with both removed (the block exactly as it WAS) it names both. So the green half is not merely a demonstration that the right values produce the right client. Both are refusals rather than defaults because a defaulted region is fatal even once the endpoint is right — SigV4 signed `us-east-1` against a `blr1` bucket is a 403.
- 🧪 **13.36 — the `skipIf` guard and the code it guards resolve `pg_dump` on the SAME `PATH`, so the guard skips cleanly when the binary is genuinely absent instead of reddening the suite.** The first version prepended libpq only for the probe's own `execSync` and for `pgRestore`'s `spawnSync`, via a per-child `env:` override, while `dumpDatabaseToSink` spawns with the inherited `process.env.PATH`. Reproduced 2026-09-06 by restoring that shape and running the file with libpq off the ambient `PATH`: `Test Files 1 failed (1) / Tests 5 failed | 1 passed (6)`, every failure `spawn pg_dump ENOENT`, the two planted-defect cases failing as "expected to throw /pg_dump exited/ but got 'spawn pg_dump ENOENT'". With the fix (`process.env.PATH` amended once at module scope, before `describe.skipIf` evaluates — `beforeAll` would be too late) the same run is `Tests 6 passed (6)`; and with `LIBPQ_BIN` pointed at a nonexistent directory as well, `Test Files 1 skipped (1) / Tests 6 skipped (6)`, exit 0 — a clean skip, which is then `check-no-silent-skips.mjs`'s to flag. `apps/server/test/ops/pg-dump.test.ts`
- ✅ **13.37 — the REAL sink's `discard` deletes the key from the backup bucket, and does so idempotently.** 13.30 proves `dumpDatabaseToSink` ASKS the sink to discard; its `CaptureSink` only records the request, so on its own "a failed dump leaves no object behind" would rest on a fake that cannot leave one. This is the other half: against `aws-sdk-client-mock`, `discard` issues exactly one `DeleteObjectCommand` with the backup bucket and the given key, and discarding a key nothing was written to is not an error. What is still NOT covered by any test: the `abort()` branch, which stops an in-flight multipart upload from completing — it needs a real multipart in flight, which the mock does not produce. `apps/server/test/ops/object-sink.test.ts`
- 🧪 **13.38 — `--once` runs BOTH jobs whatever the other does, reports both outcomes, and exits non-zero if either failed.** The plan text ordered these `await jobs.runPgDump(); await jobs.runLedgerExport();`, so a dump failure short-circuited the export — and the export is the artifact this codebase calls sufficient while the dump is merely convenient, at the exact moment (`--once` is the runbook's manual backup) someone is reaching for it because something is already wrong. Reproduced 2026-09-06 against the live Postgres with a deliberately dead sink endpoint (`http://127.0.0.1:1`, `AWS_MAX_ATTEMPTS=1`): the shipped order printed **two** error lines — `relation "events" does not exist` (the export, which ran first) and `connect ECONNREFUSED 127.0.0.1:1` (the dump) — and exited 1. The old order, restored temporarily for the contrast, printed **one** line (`connect ECONNREFUSED`) and exited 1: the export never ran at all. `apps/server/src/ops/backup-daemon-main.ts`
- ❌ **13.39 — `backup-daemon-main.ts` has no automated coverage.** 13.38 exercises the `--once` exit contract by hand; the daemon branch (schedule wiring, the `SIGTERM` handler that stops the daemon and ends the pool) is exercised by nothing. Recorded rather than left implicit, because this is the same gap a review caught one file over for `startBackupDaemon` — an entry point whose semantics this change set altered should not read as covered by the cases above it. `apps/server/src/ops/backup-daemon-main.ts`

## The restore drill (Task 12)

**LANE C'S BLOCK IS NOW EXHAUSTED — `13.40` is the last id in `13.1–13.40` and this section spends it.**
The warning at the head of this file predicted exactly this: Task 11 consumed `13.9–13.39`, leaving one.
Task 12 produced more than one case worth cataloguing, so **the remaining cases below are written in full
and deliberately carry NO id**, under `PENDING BLOCK` headings. They get ids in one pass once the
controller allocates the next block (`13.201`, allocated on request only) — asked for, per the rule at
the head of this file, never borrowed from Lane D's `13.41–13.100` or Lane E's `13.101–13.200`, and never
sub-numbered: `check-case-ids.mjs`'s `ID_LINE` captures `(\d+\.\d+)`, so a `13.40.1` would be extracted as
`13.40` and reported as a duplicate, while a `13.40a` would not match at all and become invisible.

- ✅ **13.40 — `restore.sh` refuses a target whose database name is not a scratch database, and lets a scratch-named one through.** The guard is the entire point of the script and the plan's own draft test never executed the script at all — it called `pg_dump`/`pg_restore` directly, so the guard would have shipped as a runbook safety control nothing had ever run. Both halves are asserted against the real file through `bash`: with a file that EXISTS in hand (so the non-zero exit cannot be the `-f` check wearing the guard's clothes), a target named `gisik_nokma_live_no_such_db` exits 1 with `refusing` and the offending name in stderr and nothing on stdout; the same invocation with one word changed (`gisik_scratch_no_such_db`) gets PAST the guard and fails at the NEXT check instead (`no such dump file`), which is what distinguishes a name test from a blanket refusal that would satisfy the first assertion while rejecting every restore an operator ever attempts. Bundled here rather than split, the way 13.35 bundles its planted-defect half, because the block has one id left. `--force-live` overriding the guard, and the usage text carrying the version rule in both directions (exit 2), are asserted in the same ungated describe. **UNGATED on purpose**: these cases need only `bash`, and behind the round-trip gate below they would go dark on exactly the machines where a restore target gets mistyped by hand. `apps/server/test/ops/restore-drill.test.ts`, `scripts/restore.sh`

**PENDING BLOCK — the round trip.** A seeded database is dumped with `pg_dump --format=custom`, restored
into a bare scratch database, and the restore is accepted only when the restored `events` count equals the
count measured in the SOURCE (with a `> 0` floor) **and** `verifyProjections` is clean **and** the restored
ledger still rejects an `UPDATE` with `append-only`. The count check is not decoration and its necessity was
measured, not argued: with the restore run `--schema-only`, the verify-clean case **still passed** against an
empty database while the count case failed `expected +0 to be 21` — an empty structure verifies clean in both
EXCEPT directions, so the plan's own verify-only acceptance could never have proven a restore restored
anything. The `append-only` case failed in that same probe too (`promise resolved Result{ command: 'UPDATE' }
instead of rejecting`), because `events_no_update_no_delete` is `FOR EACH ROW` and an UPDATE over an empty
table never fires it — a second, independent witness that rows crossed. Twenty-one is the real seeded count:
three `workspace.created` submissions, each deriving a workflow, four ticket types and an owner membership,
the same surprise 13.13 records. `apps/server/test/ops/restore-drill.test.ts`

**PENDING BLOCK — planted defect: drift in a restored projection is caught, table named.** An unbounded
`UPDATE proj_entity_heads SET head_event_type = 'tampered'` against the restored database makes
`verifyProjections` report `clean: false` with `proj_entity_heads` among the named tables. Runs LAST in the
file because the corruption is irreversible: anything asserting clean after it would fail.
`apps/server/test/ops/restore-drill.test.ts`

**PENDING BLOCK — `restore.sh`'s HAPPY path is executed, and the database is asked what arrived.** The drill
above proves the round trip but never runs the script; this runs `bash scripts/restore.sh <real dump> <second
scratch database>`, asserts exit 0, the `restored '<file>' into '<db>'` line, and that the printed next step
names `verify:projections` (the script must point at the gate, not declare itself done) — then opens a pool on
that database and reads the row count back. A SECOND scratch database, created and dropped inside the suite,
so it never contends with the planted-drift case's corruption. The same case also asserts the two things
`restore.sh` is only allowed to claim on this path: the **version rule on stderr** (both directions), because
it used to live only inside `usage()` — which fires solely on `$# -lt 2`, so the operator who typed the command
CORRECTLY, the one the skew is about to bite, was the one who never saw it; and that **the password is not in
what the script printed** — asserted against the real credential of the run in the `:<password>@` userinfo
form, so it still discriminates on the default DSN where username and password happen to be the same word, and
that the printed DSN is byte-identical to what `splitDatabaseUrl` produces for the same URL (the bash split and
the TypeScript split agreeing on one string, rather than each being separately plausible). Exit 0 beside those
is the half that matters: it says `PGPASSWORD` actually carried the credential, so this is a rerouting and not
a deletion. Verified by hand in both directions, 2026-09-06, against a throwaway `postgres:18-alpine` on 54398
whose password was `dr@ll-P4ss` (supplied percent-encoded as `dr%40ll-P4ss`, which also exercises the decode):
with the password in the DSN the script exited 0, three rows landed, and `grep -c` for BOTH the encoded and
decoded literal over its stdout and stderr returned `0` and `0`; with the password stripped from the same DSN
it exited 1 on `fe_sendauth: no password supplied` and the table never arrived.

**PENDING BLOCK — KNOWN, MEASURED, AND COVERED BY NO AUTOMATED TEST: the pg client/server version boundary,
in both directions.** A `pg_restore` older than the `pg_dump` that wrote the archive refuses it outright
(format version), and a `pg_restore` NEWER than the target server sends settings the server rejects.
The second direction is not theoretical — it is what this workstation does: Homebrew carries only libpq
**18.4** and the compose Postgres is `postgres:16-alpine` (server **16.15**), so `pg_restore` 18.4's opening
`SET transaction_timeout = 0` (a PG17+ parameter) draws `unrecognized configuration parameter
"transaction_timeout"`, `errors ignored on restore: 1`, and a **non-zero exit even though every table and row
landed**. `restore.sh` propagating that non-zero exit is correct, so the suite does not paper over it: the
round-trip describe gates on **client major ≤ server major**, not merely on the binaries existing, and skips
with a stderr line naming both majors rather than reddening (the 13.36 failure shape, one cause over). CI runs
it — `ci.yml` pins `postgres:16-alpine` beside `postgresql-client-16`, "pinned to the server's major version"
— and that pin, not this suite, is what keeps the matched pair honest. The drill half was nonetheless executed
green by hand on a matched pair (a throwaway `postgres:18-alpine`, client 18.4 / server 18.6 — port 54399 on
the first pass, re-run on 54398 after the fixes below: `10 passed (10)`); the committed default remains 54329.
**Consequence, and what now controls it:** `check-no-silent-skips.mjs` fails a file contributing ZERO
passed-or-failed tests, and the ungated guard cases mean this file always contributes passes — so that gate
cannot see the round-trip half going dark, and 13.3 already establishes that partial skips pass by design.
`ci.yml`'s pin is a partial control only: it asserts `pg_dump --version | grep ' 16\.'` and says nothing about
`pg_restore` (the binary the gate actually reads) or about `psql` existing or connecting. The control that
closes it is the precondition case below, inside this file, where the gate lives. **Extending the `ci.yml`
pin to `pg_restore` and `psql` was considered and deliberately NOT done:** it could not be tested from here
(Ubuntu resolves `psql` through the `postgresql-client-common` wrapper, and GitHub's runner images carry a
preinstalled client of their own, so a `grep ' 16\.'` on `psql` might hard-fail every shard for reasons
unrelated to this task), `ci.yml` is contested across lanes, and the earlier error message is all it would
buy — a wrong-major `psql` still connects and still reports the server's version correctly, so the
precondition case sees exactly what matters either way.
`scripts/restore.sh`, `deploy/do/README.md`, `apps/server/test/ops/restore-drill.test.ts`

**PENDING BLOCK — the version probes must not fail open: an unreachable server or an absent binary is a
FAILURE, never a skip.** The first cut of this file collapsed both outcomes into one `null`, so "Postgres is
down / not ready yet / `psql` is missing / the output did not parse" was indistinguishable from "this client
and this server are a skewed pair", and both silently deleted all five round-trip cases — the row-count
assertion, `verifyProjections`, and the ONLY execution of `restore.sh`'s happy path — from a run that still
exited 0. Each probe now returns `{kind:'ok', major}` or `{kind:'unavailable', detail}`; only `ok` feeds the
skip condition, and an always-running test asserts that NO probe came back `unavailable`, quoting the detail in
a custom matcher message (measured, not assumed: `toEqual([])`'s own failure line reads
`expected [ Array(1) ] to deeply equal []` and the JSON reporter carries only that line, so without the message
the red test would not name which probe failed or why). Deliberately a test rather than a module-scope throw,
which would take the four bash-only guard cases down with it. **Falsified in both directions, 2026-09-06:**
with `TEST_DATABASE_ADMIN_URL` pointed at `localhost:1`, the pre-fix file (from `1c5df30`, run under a
temporary name) reported `4 passed | 5 skipped`, **exit 0**; the fixed file reports `4 passed | 1 failed |
5 skipped`, **exit 1**, with `a pg version probe could not answer: psql exited 2 against
postgres://gisik@localhost:1/postgres: connection to server ... Connection refused` — note the quoted DSN
carries no password, because it is the one `splitDatabaseUrl` already stripped. **Trade disclosed:** a
developer with no libpq, or on a machine where `/opt/homebrew/opt/libpq/bin` does not exist (an Intel mac,
Linux), now gets a RED suite here where they previously got a silent skip. That is the point — an open failure
mode on the only test that ever executes a disaster-recovery script is worse than an install instruction.
`apps/server/test/ops/restore-drill.test.ts`

**PENDING BLOCK — the drill's teardown strands nothing, and cannot crash before the real cause is reported.**
`afterAll` was an unwrapped sequence, so one rejected `withAdmin` (an admin blip, a session still attached)
skipped `source.drop()` and left a fully migrated `gisik_test_<uuid>` on the SHARED test Postgres for every
later run to trip over; each step is now wrapped and the first error rethrown at the end, so a failing teardown
is still reported rather than swallowed. `workDir` is created FIRST in `beforeAll`, before anything that can
throw, and is typed `string | undefined` and guarded at cleanup: `rmSync`'s `force` suppresses ENOENT, not
`ERR_INVALID_ARG_TYPE`, so an undefined `workDir` used to crash the teardown and displace the seeding failure
that caused it. Scratch database names come from `randomUUID()`, the generator `test/helpers/db.ts` already
uses, not `Date.now()` evaluated once at module load — two runs in the same millisecond (plausible across this
multi-worktree lane setup) collided, and the loser's `afterAll` then issued `DROP DATABASE ... WITH (FORCE)`
against the winner's live database mid-drill. `apps/server/test/ops/restore-drill.test.ts`
## Graceful shutdown (Task 5b — Lane E block, 13.101–13.200)

**First IDs minted from Lane E's block.** The T1/T5 retroactive catalogue that
`docs/lanes/executor-state-E.md` says starts "from 13.101" continues from 13.105 instead — these landed
first and are never renumbered. (The Plan 11 Tasks 1–6 retroactive section further down this file mints
13.105–13.168 against this same block; **the block's next free id, after both sections, is `13.168`.**)

*(Every case boots a REAL process and delivers a REAL signal with `child.kill()`. Cases 13.101–13.103
spawn `src/index.ts` itself — the one non-test boot path — so deleting the `installShutdownHandlers` call
site reddens all three. 13.104 spawns `test/fixtures/sync-throw-close-hook.ts`, which imports the same
shutdown module and hands it a deliberately broken app, because a synchronous throw from inside avvio's
close chain is not reachable from outside the process. The children are **not PID 1**, so what the
container measurement showed — an unhandled SIGTERM is IGNORED — is not what these reproduce; under a
normal parent node's default disposition applies, so a missing handler kills the child BY SIGNAL instead.
Still a specific red, just for the neighbouring reason.)*

- 13.101 ✅ SIGTERM: the real boot path exits `{code: 0, signal: null}` inside 3 s with `signal received`
  → `http server closed` → `database pool closed` → `complete` in that order, and the pino `pid` on the
  first line equals `child.pid` — the process signalled is the one that installed the handler, not a CLI
  shim. Positive control: the child is asserted to hold ≥ 1 backend against the throwaway database before
  the signal (and 0 before boot), so `pool.end()` is load-bearing rather than a marker that cannot
  fail — `shutdown.test.ts`
- 13.102 ✅ SIGINT: identical sequence and exit code — `shutdown.test.ts`
- 13.103 ✅ a second signal is logged and dropped (exactly one `signal received`, exactly one `already in
  progress`), a hung `app.close()` is bounded (`app.close() did not finish within 5000ms`) and does NOT
  skip `pool.end()`, and the process still stops — the stalled socket holds the loop so the 8 s watchdog
  exits 1 rather than hanging for the platform to SIGKILL. The second signal is driven off the OBSERVED
  begin marker, not a back-to-back pair POSIX could collapse into one delivery — `shutdown.test.ts`
- 13.104 ✅ a close hook that throws **synchronously** does not skip `pool.end()`. avvio runs close hooks
  synchronously from the http server's own `'close'` callback, so the throw is an uncaughtException and
  never rejects `app.close()`'s promise — the per-step `catch` cannot see it. Measured before the fix:
  the sequence stopped after `signal received`, the pool was never ended, nothing logged `complete`, exit
  1 at 12 ms. Now: the throw is absorbed for the shutdown window only, the hooks queued behind the
  throwing one still run, the 5 s bound moves the sequence on, the pool closes, `complete` logs, and the
  process exits 0 at ~5010 ms — both timing edges asserted, since under 5 s would mean `app.close()`
  resolved after all and 8 s or more would mean the watchdog fired instead of the loop draining —
  `shutdown.test.ts`, `test/fixtures/sync-throw-close-hook.ts`

## Plan 11 Tasks 1–6 — cases written retroactively at the seam-1 PR

**These cases were NOT written in each task's own change set.** Tasks 1–6 shipped across separate
commits on this branch (`012c8cc`, `d691461`, `c31988a`, `b189bf7`, `e42e10a`+`4d16c2f`, `6251aac`)
without a `Features.md`/`test-cases` entry apiece; this section catalogues all six in one pass, at the
seam-1 PR, from two inventory reports that opened each commit's diff and every test file's assertions
directly. That counts as "the same change set" only because seam 1 ships as a single PR — this is a
disclosed deviation from the usual same-change-set rule, not a hidden one. IDs minted from Lane E's
block (`13.101–13.200`), continuing after the graceful-shutdown section's `13.104`; the block's next
free id after this section is `13.169`.

**Note for Task 9 (`13.90`):** that case is `❌ pending the dev compose stack`, owned by Lane D. Task 6
below lands `docker-compose.dev.yml`, so `13.90`'s precondition is now satisfied — **it is not flipped
here**, since satisfying the precondition is not the same as a real test run against the stack, and the
case belongs to Lane D's block. Lane D should re-run `seed:cc` against the now-real dev stack and flip
`13.90` itself.

### Config surface, CA-aware pool, `/healthz` (Task 1)

- 13.105 ✅ nine deployment env vars, plus `DEPLOY_SHA`, each parsed and each refused by name when
  malformed — `config.test.ts`
- 13.106 ✅ an empty string reads as UNSET and falls back to the documented default — for the eight
  OPTIONAL knobs plus `DEPLOY_SHA`, which is a different nine from 13.105's. **`WEB_ORIGIN` is
  explicitly NOT among them and behaves the opposite way**: `WEB_ORIGIN: ''` THROWS
  `invalid server configuration — check: WEB_ORIGIN` (`config.test.ts:191`). That is the deviation
  Task 1's bullet defends — it is required with no default precisely so an empty value cannot mint an
  unfollowable invitation link — so an "inconsistency fix" giving it a default would reintroduce the
  defect. An earlier wording of this case said "any of the nine", which named `WEB_ORIGIN` among them
  and was false — `config.test.ts`
- 13.107 ✅ planted defect: `TRUST_PROXY` accepts only the literal `'true'`/`'false'`; `'yes'` and `'1'`
  are refused by name rather than coerced by truthiness — `config.test.ts`
- 13.108 ✅ planted defect: a rate-limit var that is non-integer, zero, negative, or fractional is
  refused by its own name — `config.test.ts`
- 13.109 ✅ `ALERT_WEBHOOK_URL` and `SMTP_URL` are scheme-discriminated against each other (an http URL
  rejected as SMTP and vice versa), not just "any string fails" — `config.test.ts`
- 13.110 ✅ the regression pin: a CA cert reaches the real driver through a `?sslmode=require`
  managed-Postgres-shaped URL — this fails on the code that shipped before the fix — `config.test.ts`
- 13.111 ✅ rewriting the connection string for TLS preserves user/password/host/port/database
  byte-for-byte, including a literal `+` in a password surviving `%2B` round-trip — `config.test.ts`
- 13.112 🟡 known-and-accepted, asserted rather than hidden: an `options=` query parameter still
  clobbers the pool's timezone startup parameter through the same `Object.assign` that motivated the CA
  fix — not fixed, the test pins the current (wrong) behaviour so a silent change is visible —
  `config.test.ts`
- 13.113 ✅ an unparseable connection string that also carries an ssl parameter is refused by name,
  rather than silently discarding the CA — `config.test.ts`
- 13.114 ✅ `/healthz` answers the exact shape `{ status, sha }` — not `{ ..., version }` — on both the
  200 and 503 branches, `toEqual` not partial matching, `sha` sourced from a handed `DEPLOY_SHA` —
  `app.test.ts`
- 13.115 ❌ `sslcert`/`sslkey`/`sslrootcert` causing `pg` to `readFileSync` at client construction (a
  missing file becomes an `ENOENT` at pool creation, not a clean config refusal) — no test exercises
  this; recorded only in the commit message and the `db.ts` docblock

### CORS, rate limiting, HTTP-Origin (CSRF) check (Task 2)

- 13.116 ✅ set-equality drift guard: every protected route has a row in the suite and every row in the
  suite is a protected route in production — a genuine set comparison, not a subset check —
  `security-middleware.test.ts`
- 13.117 ✅ each of the 7 protected routes: a forged `Origin` on a cookie-carrying `POST` is refused
  `403 { error: 'forbidden_origin' }` AND the route handler never ran — `security-middleware.test.ts`
- 13.118 ✅ each of the 7 protected routes: a cookie-carrying mutation with NO `Origin` header at all is
  also refused (require, not merely validate) — `security-middleware.test.ts`
- 13.119 ✅ each of the 7 protected routes: the correctly-configured `WEB_ORIGIN` is let through —
  `security-middleware.test.ts`
- 13.120 ✅ a query string does not buy a CSRF bypass — `/v1/events?x=1` is refused identically to
  `/v1/events`, pinning the `routeOptions.url`-vs-`raw.url` fix — `security-middleware.test.ts`
- 13.121 ✅ the regression pin: a caller-prepended `X-Forwarded-For` entry does NOT buy a fresh
  rate-limit bucket — a chain with varying left / constant right entries is refused on requests 2–4,
  which reddens under leftmost-keying and passes only under rightmost-keying —
  `security-middleware.test.ts`
- 13.122 ✅ two genuinely different clients behind the same proxy still get their own buckets — the
  inverse of 13.121, so keying can't be satisfied by treating everyone as one client —
  `security-middleware.test.ts`
- 13.123 ✅ `POST /v1/attachments` is charged to the shared `events` bucket, not left unlimited —
  spending the attachments budget also refuses a subsequent `/v1/events` call —
  `security-middleware.test.ts`
- 13.124 ✅ CORS answers preflight for the configured origin with both the allow-origin and
  allow-credentials headers; a foreign origin gets no allow header at all; and CORS is not the CSRF
  control — a foreign-origin `POST` is still refused `403` even though CORS is on —
  `security-middleware.test.ts`
- 13.125 ✅ `makeFixedWindowLimiter` unit coverage: max-then-refuse with bounded retry hints, key
  independence, window reset proven by a clock argument (not `sleep`), a retry-after floor of 1ms even
  in the last millisecond of a window, and refusal repeating rather than resetting on the next call —
  `rate-limit.test.ts`
- 13.126 ❌ `rateLimitKeyFor` (the rightmost-XFF-entry keying itself — comma-splitting, array-vs-string
  header handling) has no standalone unit test; it is only exercised indirectly through the HTTP
  integration cases above, so a change hitting a header shape those cases don't cover (a trailing comma,
  an all-whitespace entry) would not be caught by a fast unit-level run
- 13.127 ❌ whether `apps/web`'s proxy actually forwards the `Origin` header on same-origin requests —
  stated in the module docblock as not measured in this repository; named as "the first thing to check"
  if the web client starts answering `403 forbidden_origin`

*(Not a numbered case, named for completeness: `POST /v1/invites/:token/accept` and
`PUT /v1/me/preferences` are cookie-authenticatable mutations deliberately excluded from the protected
set, owners named as future plans in the docblock. No case asserts they are unprotected — the 13.116
drift guard fires only on a mismatch with the production route list, so it would not catch someone
silently adding CSRF protection to either route any more than it would catch its removal.)*

### Error alerting hook on 5xx (Task 3)

- 13.128 🟡 `WebhookErrorAlerter` POSTs `{ text }` with the right headers, and an `AbortSignal` is
  wired into the request. **The 5-second VALUE is not asserted and this case must not claim it was:**
  the test checks `signal instanceof AbortSignal` only. Measured, not inferred — raising
  `WEBHOOK_TIMEOUT_MS` from `5_000` to `500_000` leaves the suite 16/16 green. Downgraded from `✅` to
  `🟡` by the verification pass that ran that mutation; the first wording said "an `AbortSignal`-based
  5s timeout wired through", which reads as coverage of the deadline itself. Open: a dead webhook could
  be widened to hold a socket for minutes with nothing reddening — `error-alerter.test.ts`
- 13.129 ✅ `alertWithoutWaiting` contains a SYNCHRONOUS throw from `notify` — it does not propagate out
  of `alertWithoutWaiting` itself — `error-alerter.test.ts`
- 13.130 ✅ `alertWithoutWaiting` contains a REJECTING `notify` — a real `process.on('unhandledRejection',
  …)` collector asserts nothing escapes the process, a genuine behavioural check rather than an inference
  from the absence of a thrown error — `error-alerter.test.ts`
- 13.131 ✅ `alertWithoutWaiting` does not wait for the alerter — a releasable gate (not an unresolvable
  promise, which would make "not settled yet" trivially true) proves the response returns before the
  alert settles, and releasing the gate is the positive control proving `notify` really was invoked —
  `error-alerter.test.ts`
- 13.132 ✅ the 5xx handler answers the exact `INTERNAL_ERROR_BODY` shape (`toEqual`) and the response
  body does not contain the thrown error's message or a real path — a leak check, not a status-code-only
  check — `error-alerter.test.ts`
- 13.133 ✅ the alert context carries the REDACTED url — asserted to literally equal
  `'GET /v1/invites/[redacted]/explode'`, confirming the redaction exactly rather than merely "doesn't
  contain the token" — `error-alerter.test.ts`
- 13.134 ✅ planted defect: a 400 from a schema refusal is the door working — zero alert contexts are
  recorded, confirming sub-500s never page — `error-alerter.test.ts`
- 13.135 ✅ planted defect: an alerter that THROWS or REJECTS still leaves the response exactly `500` +
  `INTERNAL_ERROR_BODY`, and (for the reject case) the escaped-unhandled-rejections collector is still
  empty — `error-alerter.test.ts`
- 13.136 ✅ planted defect: an alerter that HANGS does not hold the response — the 500 is already
  answered while the alert's `settled` flag is still `false`, and only flips after `release()`, a genuine
  ordering assertion (response-before-alert-settles) — `error-alerter.test.ts`
- 13.137 ✅ with NO alerter configured, nothing reaches the network — `globalThis.fetch` is replaced
  BEFORE `buildTestApp()` is called, closing the install-then-build ordering bug (`WebhookErrorAlerter`
  captures `fetch` as a default parameter at construction) a reviewer caught in an earlier, guard-that-
  cannot-fail version of this exact test — `error-alerter.test.ts`
- 13.138 ❌ the claim that `/healthz`'s 503 branch never reaches this alerter (the one 5xx an operator
  most needs paged) — stated only in prose in two files; nothing would go red if that routing were
  silently changed to alert on it
- 13.139 ❌ no coalescing or rate-limiting of the alert channel itself — a repeat-failure storm pages the
  same webhook every time, by design, and is unbuilt and untested

### SMTP magic-link sender, OTP sign-in refused (Task 4)

- 13.140 ✅ `SmtpMagicLinkSender` composes one message to the address, from the configured sender —
  envelope AND raw `From:`/`To:`/`Subject:` headers checked via full MIME composition (`streamTransport`),
  not a spy on `sendMail`'s call args — `smtp-magic-link-sender.test.ts`
- 13.141 ✅ the link survives quoted-printable transfer encoding byte-for-byte and stands alone on its
  own decoded line, using a >76-char URL specifically so the encoding is actually exercised —
  `smtp-magic-link-sender.test.ts`
- 13.142 ✅ the email is plain-text only — asserted `Content-Type: text/plain`,
  `Content-Transfer-Encoding: quoted-printable`, and the raw message explicitly does NOT contain
  `multipart/` or `text/html` — `smtp-magic-link-sender.test.ts`
- 13.143 ✅ negative control: constructing the sender alone sends nothing —
  `smtp-magic-link-sender.test.ts`
- 13.144 ✅ an unreachable mail host that never speaks (a real TCP listener that accepts and never sends
  a banner) is given up on in seconds, not the nodemailer-default minutes — the **greeting** timeout
  specifically, `ETIMEDOUT`, elapsed time asserted bounded both above and below so an instant/no-op
  rejection cannot pass — `smtp-magic-link-sender.test.ts`
- 13.145 ✅ `selectMagicLinkSender` picks the SMTP sender when `SMTP_URL` is configured and the log
  sender otherwise, both directions — `select-senders.test.ts`
- 13.146 ✅ `selectOtpSender()` NEVER returns `LogOtpSender` on the production path — asserted
  `toBeInstanceOf(NullOtpSender)` and explicitly `not.toBeInstanceOf(LogOtpSender)` —
  `select-senders.test.ts`
- 13.147 ✅ `NullOtpSender` holds no transcript of issued codes — structural check (`'sent' in sender ===
  false`, empty own-keys), not a behavioural count after a send — `select-senders.test.ts`
- 13.148 ✅ over the real mounted route (`app.inject` against `/api/auth/phone-number/send-otp`), the
  refusal is `501` with `body.code === PHONE_SIGN_IN_UNAVAILABLE`, `body.message` mentioning email, and
  `Object.keys(body).sort()` equal to exactly `['code','message']` — guards against a future field
  leaking anything extra — `null-otp-sender.test.ts`
- 13.149 ✅ the refusal never answers with the string `'code sent'` — `null-otp-sender.test.ts`
- 13.150 ✅ positive control: the identical request against `LogOtpSender` succeeds `200` +
  `'code sent'` — the control that makes 13.148's 501 meaningful by ruling out a broken route/mount as
  the explanation — `null-otp-sender.test.ts`
- 13.151 ❌ whether `requireTLS` should be forced on the SMTP transport — deliberately left off to keep
  working against Mailpit's plaintext `smtp://`; no test asserts TLS behaviour either way
- 13.152 ❌ a refused OTP request still leaves an expiring verification row in better-auth's own storage
  — documented in the docblock as a known, accepted side effect; would require inspecting better-auth's
  internal tables and is not asserted by any test here

### Server and web Dockerfiles (Task 5)

*(🧪 here means a `docker build` run by hand and recorded in commit `e42e10a`'s message — it has not been
re-run by anything since, automated or otherwise.)*

- 13.153 🧪 the server image builds and, run with no database, prints "applying migrations…" then dies
  `ECONNREFUSED` — manually observed against a real build (exit 0, ~607 MB), recorded in the commit
  message, not automated; never run against a real Postgres
- 13.154 🧪 the web image builds standalone and the resulting artifact contains `.next/standalone`'s
  `server.js` and `.next/static` — manually observed (exit 0, ~241 MB), recorded in the commit message;
  `node apps/web/server.js` has never actually answered a request, by anyone, at any point in this
  branch's history
- 13.155 ❌ no automated test builds or runs either Dockerfile — confirmed by grep: `apps/server/test`
  and `apps/web` have no hits for `Dockerfile`/`docker` outside the dev-compose-stack tests below, which
  test the compose YAML, not an image build
- 13.156 ❌ the build-arg defect itself (before the fix): the plan's `NEXT_PUBLIC_API_URL`/
  `NEXT_PUBLIC_WS_URL` have zero readers in `apps/`/`packages/` (measured with a grep, not assumed), and
  the commit message for the fix (`4d16c2f`) documents that an unset `SERVER_ORIGIN` bakes
  `http://localhost:3000` into `routes-manifest.json` at build time. **The earlier rationale here was
  wrong about its own source** — it called this "recorded reasoning, not an inspection of a built
  manifest", while commit `4d16c2f` says the opposite in its own words ("proven from this repo's own
  build output"), and applying that invented standard would have forced 13.153/13.154 down to `❌` too,
  since those rest on the same kind of commit-recorded measurement. The marker stays `❌` for the honest
  reason instead: this catalogue entry describes the defect as it existed BEFORE the fix, and nothing
  reproduces the pre-fix state on demand. The post-fix behaviour IS measured, at 13.167. Automated regression coverage for the FIXED names living correctly in the compose file is
  Task 6's 13.162/13.163 below; no test in this repo reproduces the original defect end-to-end against a
  real image build

### Dev stack (`docker-compose.dev.yml`) checked against real config loaders (Task 6)

- 13.157 ✅ anti-vacuity guard: all 6 expected compose service names actually parse out of the YAML,
  guarding against a parser silently returning `{}` — `compose-dev-contract.test.ts`
- 13.158 ✅ project isolation: the dev stack declares a `name:`, and it is truthy and differs from the
  root compose file's (undefined) name — `compose-dev-contract.test.ts`
- 13.159 ✅ the server service's parsed env satisfies the REAL `loadConfig()` (not a mock) without
  throwing — `compose-dev-contract.test.ts`
- 13.160 ✅ the server service's parsed env satisfies the REAL `createObjectStoreFromEnv()` without
  throwing, and resolves to `S3ObjectStore` specifically, not the local-disk fallback — upgraded from a
  `toBeTruthy()` key-presence check after a review showed that passed even against a malformed
  `DATABASE_URL`, a schemeless `BETTER_AUTH_URL`, and a mismatched bucket name —
  `compose-dev-contract.test.ts`
- 13.161 ✅ object-store wiring: `OBJECT_STORE === 's3'`, `OBJECT_STORE_S3_FORCE_PATH_STYLE === 'true'`,
  the endpoint contains `'minio'`, the bucket name matches the one actually created by the `minio-init`
  entrypoint (parsed by regex out of the real entrypoint string, not hand-copied), and no bare `S3_*` keys
  survive — checked through an `envOf()` helper that normalizes both Compose environment syntaxes,
  because list-form `Object.keys()` yielding `'0','1','2'` made an earlier version of the "no bare keys"
  check pass vacuously against a file that still had three — `compose-dev-contract.test.ts`
- 13.162 ✅ web build-args: `SERVER_ORIGIN` is present as a **build arg** (not runtime env), contains
  `'server'`, and explicitly does NOT contain `'localhost'` — the direct regression test for the
  routes-manifest bug named in 13.156 — `compose-dev-contract.test.ts`
- 13.163 ✅ web build-args: `NEXT_PUBLIC_SERVER_URL` is present, and neither of the plan's dead names
  (`NEXT_PUBLIC_API_URL`/`NEXT_PUBLIC_WS_URL`) appear anywhere — `compose-dev-contract.test.ts`
- 13.164 ✅ Postgres port: `54329` (the live shared cross-lane test Postgres) is NOT in the published
  ports, and `54330` IS — a two-sided check, since a negative-only assertion would pass if the ports
  block were deleted entirely or moved to a third port while `.env.example` still claimed 54330 —
  `compose-dev-contract.test.ts`
- 13.165 🟡 the load-bearing bug this whole deviation chain was about: the first version of this file and
  the root `docker-compose.yml` resolved to the same directory-inferred project name and both declared a
  service literally named `postgres`, so bringing either stack up destroyed the other's containers —
  directly contradicting the landing commit's own "the two stacks are now co-runnable" claim. Fixed the
  same day by adding the explicit `name:` covered structurally by 13.158; no test actually brings both
  stacks up together and confirms neither is destroyed, so this is `🟡` on the fix's structural proxy, not
  a reproduction of the original collision
- 13.166 🧪 the MinIO healthcheck (`curl -f http://localhost:9000/minio/health/live` against the pinned
  tag) returns healthy. **Upgraded from `❌` to `🧪` by an actual run** — the catalogue pass was right to
  refuse the comment as evidence, and the run has since happened. `docker compose ps` reported
  `minio ... (healthy)` on a live stack; the chain is self-witnessing beyond that, because `minio-init`
  is gated on `condition: service_healthy` and `server` on `minio-init`'s
  `condition: service_completed_successfully`, so a healthcheck that never went healthy could not have
  produced a healthy `server`. `curl` is confirmed present in the pinned image
  (`docker run --rm --entrypoint sh minio/minio:RELEASE.2024-11-07T00-52-20Z -c 'command -v curl'` →
  `/usr/bin/curl`), so the check is not silently a no-op. Still `🧪` and not `✅`: nothing in the gate
  runs it
- 13.167 🧪 **TASK 6'S ACCEPTANCE, RUN.** A request through the WEB container's proxy is answered by the
  SERVER. `docker compose -f docker-compose.dev.yml up -d --build` reached a healthy server, then
  `GET http://localhost:3001/v1/me/work` (the web container's published port; `/v1/*` is rewritten by
  `next.config.ts` to `$SERVER_ORIGIN`) returned **HTTP 401, `content-type: application/json`, body
  `{"error":"unauthenticated"}`**. A 401 is the PASS: the question is who answered, not whether the
  caller was authorised, and only Fastify produces that body. Direct control the same run:
  `GET :3000/healthz` → `200 {"status":"ok","sha":"dev"}`.
  **The discriminator was written down BEFORE the run** so the result could not be reinterpreted
  afterwards, and the case is `🧪` rather than `✅` because nothing in the gate brings a stack up.
- 13.168 🧪 **the negative control for 13.167 — the acceptance can fail, and its real failure mode is not
  the one that was predicted.** With `SERVER_ORIGIN` reverted to the pre-fix `http://localhost:3000` and
  the web image rebuilt, the same request returned **HTTP 500 after a 30-second stall**, body
  `Internal Server Error`, while the server stayed healthy on :3000 and the web container still served
  its own pages (`GET :3001/` → 307). The web container's log names the cause:
  `Failed to proxy http://localhost:3000/v1/me/work [Error: connect EADDRNOTAVAIL 127.0.0.1:3000 -
  Local (0.0.0.0:0)]`, then `[Error: socket hang up] { code: 'ECONNRESET' }`.
  **The prediction — written into the compose file, the contract test and commit `4d16c2f` before any
  measurement — was that Next would proxy back into itself and answer its own 404. That is false.** It
  attempts the hop, cannot connect, and 500s slowly. The measured symptom is worse than the predicted
  one and much harder to spot: every healthcheck stays green, the web tier serves pages, and only the
  proxied path fails. Recorded because the first pass through this acceptance nearly skipped the control
  on the grounds that the positive run had already passed — **a matcher never watched failing is not a
  measurement**, and the branch that would have fired here (`HTML`) never did

*(`scripts/check-env-example.mjs` was reused by Task 6, not created by it — it already existed from an
earlier lane's work (`git log` shows it first at `b641a28`, unchanged in the Task 4–6 diffs inspected). No
case above credits Task 6 with authoring it; flagging this so a future edit doesn't misattribute it.)*

## The scheduler generalisation and the notification-sweep registration (Plan 11's two deferred "ops errands")

**Lane C's `13.1–13.40` block was fully exhausted (13.40 above already spends the last one on the
restore-drill guard pair) — this contradicted the brief this task was given ("13.40 is your LAST free
id"), which was already stale by the time this task started. The three cases below were written out in
full with no id first (following this file's own Task 12 precedent two sections up) and flagged as a
block-exhaustion ask in this task's own report; the controller then allocated Lane C a new block,
`13.201–13.240` (next block `13.241`, on request), and they are minted below at 13.201–13.203.** Header
paragraphs at the top of this file updated to record the new block.

- ✅ **13.201 — `startScheduler` generalises the daemon's private `loop`/`onFailure` primitive from a
fixed two-job shape to an arbitrary list of `{name, run, delayMs}` jobs, and `startBackupDaemon` becomes a
thin wrapper over it with an UNCHANGED external signature.** Every existing `startBackupDaemon` case in
`test/ops/schedule.test.ts` (the stderr shape, the `` `backup:${name}` `` alerter key, two timers armed
synchronously at construction, independent re-arm, `stop()` clearing both) passes byte-for-byte against the
new implementation with no edits to those cases — proof the wrapper is genuinely thin rather than a
same-behavior rewrite that happens to pass. Four NEW cases prove the generalisation itself, none of them
reachable through the two-job wrapper alone: N independent jobs are armed with N timers **synchronously at
construction** (not on a microtask — the existing `stop()` case's `toBe(2)` immediately after construction
already pins this for two jobs; the new case pins it for three); one job's failure and re-arm leaves a
sibling job's own call count and schedule untouched; each job re-arms strictly on its OWN `delayMs()`, so a
fast job firing three times causes zero calls to a slow job on a much longer interval; and `stop()` clears
EVERY job's timer (five, not two) with nothing firing across a fortnight of advanced time afterward.
**Review-round addition (2026-09-06): construction is all-or-nothing, not first-come-first-armed.** Every
job's initial `delayMs()` is now called BEFORE any of them is armed, so a LATER job's `delayMs()` throwing
(the shape `requirePositiveIntervalMs` and `msUntilNextUtc` both produce on a malformed schedule value)
leaves ZERO timers live, rather than orphaning the earlier jobs' timers with no `stop()` ever returned to
cancel them. Two new cases pin this: a three-job list where the third throws leaves `vi.getTimerCount() === 0`
(mutation-verified — reverting the fix to the original one-job-at-a-time loop reddens exactly this
assertion, at exactly the pre-fix value 2, with every other case in the file still green); and a two-job
list where the first throws proves the second job's `delayMs()` is never even called.
`apps/server/src/ops/schedule.ts`, `apps/server/test/ops/schedule.test.ts`

- ✅ **13.202 — `requirePositiveIntervalMs` refuses rather than clamps a millisecond interval, the same
"refuse, don't clamp" bargain `msUntilNextUtc`'s HH:MM and day-of-week checks already make for the two
existing backup jobs, applied to the notification sweep's configurable interval.** Six cases: a legitimate
positive integer (and the boundary value `1`) pass through unchanged; `0` is refused, naming `0` in the
thrown message; a negative value is refused, naming it; `NaN` (what a non-numeric
`NOTIFICATION_SWEEP_INTERVAL_MS` produces through `Number()`, mirroring how `LEDGER_EXPORT_DOW_UTC`'s own
`NaN` case is asserted above at 13.9–13.12's neighbourhood) is refused; a fractional value is refused,
because "positive integer" means the integers, not the range; and `Infinity` is refused, because "positive"
alone would pass it and only a `setTimeout` scheduled for the heat death of the universe would ever reveal
the mistake. Every refusal is a SYNCHRONOUS throw, asserted the same way the day-of-week cases above are:
the failure mode this guards against is not a wrong value but a call that never returns (`0`/negative spin
the daemon in a tight re-arm loop; the pre-fix code had no guard against either).
`apps/server/test/ops/schedule.test.ts`

- ✅ **13.203 — `backup-daemon-main.ts` registers two more jobs on the SAME scheduler as the existing
pg-dump and ledger-export jobs, and neither reaches the `--once` path.** The entry point now calls
`startScheduler` DIRECTLY with all four jobs, not `startBackupDaemon` — one scheduler, one `stop()`, one
`'backup daemon scheduled'` log line, for all four. `startBackupDaemon`'s only remaining caller is its own
test file above (13.9, 13.25–13.29), kept because it is what pins `startScheduler`'s stderr/alerter contract
in one place; that pinning is what makes it true, by construction rather than by a fifth case, that a
`sweep-orphans` failure in production alerts as `` `backup:sweep-orphans` `` with `msg: 'backup job failed'`
— the exact shape 13.25/13.27 assert against `startBackupDaemon`. `sweep-orphans` runs
`sweepOrphanObjects` against the worker's own `createObjectStoreFromEnv` store on a fixed 30-day interval
(first run 30 days after boot — the same `delayMs`-called-once-to-arm, called-again-after-completion
semantics `startScheduler` already gives the two backup jobs) and logs COUNTS only (`examined`, `named`,
`unrecognizedShape`, `withinWindow`, `swept`, `deleted`), never the swept key list itself, at `info` level.
`sweep-notifications` runs `runNotificationSweep` with `createInAppTransport(pool)` on
`NOTIFICATION_SWEEP_INTERVAL_MS` (optional, default one hour; unset OR empty both mean "use the default",
the same equivalence `requireDatabaseUrl` and the `ALERT_WEBHOOK_URL || null` mapping already draw
elsewhere in this file, because an unset App Platform binding resolves to `''` and `Number('')` is `0`,
which the validator above would then — correctly — refuse for a value the operator never actually set).
Both new jobs are absent from the `process.argv.includes('--once')` branch, with a comment at that branch
saying so explicitly: that flag's own docstring, and the `pnpm ops:backup-once` script that calls it, are
"run the two BACKUP jobs right now," and folding a sweep whose delete has no undo into that silently would
surprise whoever reaches for it expecting only a backup. `console.log(JSON.stringify({msg: 'backup daemon
scheduled'}))` still fires exactly once, after all FOUR jobs are armed — no competing log line was added.
**No automated test exercises `backup-daemon-main.ts` itself** — this is the same gap 13.39 already records
for the two original jobs, now also true of the two new ones; the claim above is proven at the unit level
(`startScheduler`'s and `requirePositiveIntervalMs`'s own cases, immediately above) and by reading the
wiring, not by an integration test of the entry point. `apps/server/src/ops/backup-daemon-main.ts`,
`apps/server/src/ops/schedule.ts`

### Deployed-stack E2E, and the sign-in defect it found (Task 13)

Playwright against the **running compose stack** — real Next container proxying to a real API server,
real Postgres, real Mailpit — under `apps/web/playwright.stack.config.ts`, a SECOND config with no
`webServer`. Run: `pnpm run test:e2e:stack` with the stack up. **Three specs, all passing at the head
that carries this file.** The auth cases below are ordinary `vitest` server cases
(`apps/server/test/auth/trusted-origins.test.ts`), not E2E.

- 13.169 ✅ the run REFUSES to start unless what is listening is the stack: `/healthz` answers `ok` with a
  non-empty deploy sha, AND `GET :3001/v1/me/workspaces` is answered by the API SERVER — status 401 with
  the server's own `{"error":"unauthenticated"}` body, inside a 10 s bound (`e2e-stack/helpers/stack.ts`)
- 13.170 ✅ the negative control that makes 13.169 falsifiable, MEASURED both ways on one stack: an image
  built without `SERVER_ORIGIN` (what `up -d` reuses WITHOUT `--build`) proxies `/v1/*` at itself and
  answers **500 after 30.014 s**; rebuilt, the same request answers **401 in 0.059 s** — and
  `docker compose ps` reported **every container healthy in BOTH states**, so "the containers are up" is
  not evidence about the hop
- 13.171 ✅ the test inbox is purged immediately before each send and EXACTLY ONE message is then required;
  two after a purge raises rather than picking a winner. `messages[0]` under an unknown sort order can
  return an already-SPENT link, and following one does not fail loudly — the earlier session cookie is
  still in the context, so the suite would go green having proved nothing (`e2e-stack/helpers/mailpit.ts`)
- 13.172 ✅ sign-in through the SHIPPED UI: the email goes into the real form (`getByLabel('Email')`,
  `getByRole('button', {name:'Send magic link'})` — role/label addressing, no test id added to suit a
  test), the link comes out of Mailpit, the browser follows it and lands authenticated
- 13.173 ✅ the seeded board renders from REAL projections: `Convenience Corner` → `Shop operations` →
  at least one `board-column-*`, and `ticket-card-*` COUNTED greater than zero (an empty board would
  satisfy "no error appeared")
- 13.174 ✅ `POST /v1/events` through the WEB container's proxy carries the session cookie the browser
  actually earned — not 401, and under 500 — with the ticket and workspace ids read off the real page. A
  probe against an invented workspace is refused for an UNRELATED reason while reading as though the
  transition rule had fired
- 13.175 ✅ a guest sees the workspace and NOT its projects — ruling **P38**'s partial workspace, seen from
  a browser for the first time. The seed makes the accountant a WORKSPACE member with role `guest` plus
  explicit visibility on four TICKETS and never emits `project.member_added`, and `eff.projects` is built
  from that event and nowhere else, so an empty project list is the product working. Asserted as
  absent-with-a-present-sibling (the workspace heading is visible in the same render), never a bare
  `toHaveCount(0)`, which passes on a blank, 500'd or redirected page
- 13.176 ❌ **a guest has NO NAVIGATION to the four errands explicitly shared with them** — the only path
  to a ticket is through a project they cannot see (13.175). Explicit per-ticket visibility exists and is
  unreachable from the UI. **13.175 passing does NOT mean the shared tickets were verified reachable —
  none was ever reached.** Owner: Plan 6 / visibility
- 13.177 ✅ the suite is off the gate STRUCTURALLY, not by request: it is reached by `test:e2e:stack`, a
  script name turbo defines no task for. Measured before and after the change — `turbo run test
  --dry=json` = 16 tasks, 10 `#test`, **0** matching e2e. (An earlier pre-flight recorded "8 tasks": true
  when written, stale by the time it was used. Recount, never carry.)
- 13.178 🧪 `ci.yml`'s `e2e` job supplies the real invocation (bring the stack up, install the browser
  explicitly since playwright declares no install script, run, tear down) and keeps a visibly-skipped
  path with a printed reason. It had become **green-by-presence**: once Task 6 landed
  `docker-compose.dev.yml` the old job took its file-present branch and reported green while running
  nothing. `🧪` and not `✅` because **no CI run has ever executed it** — GitHub Actions has been failing
  account-wide before the first step on a billing block — so it is verified only by a local YAML parse
  (9 jobs, `e2e` 11 steps, `gate`'s `needs` unchanged) and by Lane C's review of the hunk
- 13.179 ❌ what the web shell RENDERS when `getTickets` throws past the 2000-row cap (case 12.258) —
  **Task 13 does not cover it**; the E2E never reaches that path. Owner: Plan 6 / web render tests
- 13.180 ✅ `seed:cc` runs INSIDE the server container exactly as the plan wrote — `reference/convenience-
  corner-tracker` is present at `/app` in the image (measured) — and it is the seed T13 needs, because the
  visibility spec requires a guest and only this seed produces one
- 13.181 ❌ `seed:dev` has no runtime coverage and CANNOT be run the plan's way: it reads
  `docs/superpowers/plans`, which is **absent** from the image (measured, against `reference/` present as
  the positive control), so `docker compose exec server node dist/seed/cli-seed-dev-workspace.js` cannot
  work. Host-side only, `DATABASE_URL` → `localhost:54330`. Owner: Lane D. (Case 13.90 is `seed:cc`'s CLI
  smoke and stays Lane D's to flip; Task 13 produces evidence for it but does not claim it)

### `WEB_ORIGIN` is a trusted origin — the defect the E2E found (Task 13, ruling P42)

`apps/server/test/auth/trusted-origins.test.ts`. **The product refused its own client**: a real browser at
`http://localhost:3001` submitting the shipped sign-in form got
`403 {"message":"Invalid origin","code":"INVALID_ORIGIN"}`, with "Invalid origin" rendered on the page.
`trustedOrigins` was left at better-auth's default — the origin of `baseURL`, i.e. THIS SERVER's origin,
which no browser ever sends. **`deploy/do/app.yaml` had the same condition waiting**
(`WEB_ORIGIN=https://pm.artsourced.in` vs `BETTER_AUTH_URL=https://pm-api.artsourced.in`).

**Why the existing suite was green through it:** `sign-in-flows.test.ts` asserts acceptance with
`origin: BASE_URL` in both places it asserts acceptance at all — pinning what the default already
guarantees and no client exercises — while pinning refusals against `evil.example`. A bound asserted on
only one side of its line.

- 13.182 ✅ the WEB_ORIGIN a browser actually sends is ACCEPTED on `/sign-in/magic-link` (200). **Mutation:
  delete `trustedOrigins` from `createAuth` → this case reddens ALONE, 4 pass / 1 fail, `expected 403 to
  be 200` — the production defect reproduced, and the only assertion in the suite that distinguishes the
  default from the fix**
- 13.183 ✅ an origin in neither the default nor `WEB_ORIGIN` (`http://evil.test:9`) is still refused 403
  `INVALID_ORIGIN`
- 13.184 ✅ the `baseUrl` origin the default provides is STILL trusted — the fix ADDS, never substitutes:
  `getTrustedOrigins` (`better-auth@1.7.2`, `dist/context/helpers.mjs:74,77`) pushes the `baseURL` origin
  and only then appends `options.trustedOrigins`
- 13.185 ✅ a same-origin deployment (`WEB_ORIGIN` == `baseUrl`) behaves exactly as before AND does not
  become permissive — `:3001` is refused by that deployment. **Mutation: trust every origin (`'*'`) → 3
  pass / 2 fail; both this case and 13.183 redden, because both are permissiveness bounds. The ruling
  predicted one; two is more constraint than predicted, not less**
- 13.186 🚫 a request with NO cookie, NO `Sec-Fetch-*` and NO `Origin`/`Referer` is not origin-checked at
  all and answers 200 — read from outside that looks inverted, since the browser's own origin was refused.
  **Deliberate library policy, cited to the vendor's source rather than inferred from response codes**:
  in `better-auth@1.7.2`, `validateFormCsrf` (`dist/api/middlewares/origin-check.mjs:131`) returns
  unvalidated at `:137` (no cookie), `:141` (no `Sec-Fetch-*`) and `:152` (no `Origin`/`Referer`), and
  `validateOrigin` (`:96`) gates on `const useCookies = headers.has("cookie")` (`:101`) at `:108`. CSRF
  needs an AMBIENT CREDENTIAL the browser attaches automatically; a caller sending none gains nothing from
  forgery. Pinned as behaviour so a version bump that changes it is visible. *(Line numbers are `dist`
  line numbers and are only valid for 1.7.2 — re-read them when the lockfile moves.)*
- 13.187 ✅ node's `fetch` is not `curl`, and a probe cannot stand in for the client here: the SAME request
  answers 200 under curl and **403 `MISSING_OR_NULL_ORIGIN`** under node, because node presents
  `Sec-Fetch-*` headers and so takes `validateFormCsrf`'s force-validate branch while curl falls through
  unchecked. Pinned by the E2E's own setup, which sends the web origin as a browser does
