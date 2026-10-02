# 13. Deploy, seed, backups and shutdown — test cases

Part of bucket 13 (`Features.md` §13) — one part-file of the catalogue split performed 2026-09-19.
Index and id-block allocation: [`13-deployment-dogfooding.md`](./13-deployment-dogfooding.md).
Case ids are unchanged and are never renumbered by the split.

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
  of its first real trigger, which Plan 11 Tasks 11/12 will provide. **⚠ BOTH HALVES OF THAT LAST SENTENCE WENT STALE, AND E6-6 (2026-09-21) FIXED THE SECOND.** Plan 11 LANDED: two files carry the guard today (`apps/server/test/ops/pg-dump.test.ts`, `…/restore-drill.test.ts`), both inside the covered prefix. And **the guard had no positive control on its own universe** — every rule was applied to `report.testResults ?? []`, so an empty or mis-shaped report printed `ok (0 skipIf-guarded file(s) checked, none fully skipped)` with **EXIT=0**. **Reproduced before the fix, against the script as it stood at HEAD, on `echo '{}' > /tmp/ds3-e66-empty.json`: `old EXIT=0`, `ok (0 …)`** — a run that examined nothing and a run that examined everything and found nothing wrong were the same output. It now REFUSES that report and names both guarded files the tree holds. **⚠ ONE CORRECTION TO THE BRIEFED REMEDY, AND IT IS THE REASON FOR THE SHAPE OF THE FIX.** The remedy asks the check to refuse when "the report mentions fewer of them than exist". Measured: `ci.yml` calls this script once per `server-tests` shard with THAT SHARD'S report, the two guarded files can land in different shards, so the shortfall sentence is true of three healthy shards out of four — a check that cannot pass on a good tree is the mirror of one that cannot fail, and the literal remedy would have reddened CI on a clean branch. It refuses on the report being EMPTY (the report's own `testResults` length) and STATES the shortfall with the missing paths named; making the shortfall refusable needs the union of the four shard reports in a job of its own, which is a recorded gap rather than a silent one. `.runIf(` is also recognised now as the same guard inverted, which the script's own comment had named as a known gap. **The self-test is new** (six cases, four planted, including the empty report and a report naming one of two guarded files), and four runs are on record — `/tmp/ds3-e66-old.log` (old, EXIT=0, the finding), `/tmp/ds3-e66-red-empty.json`-driven `/tmp/ds3-e66-red-empty.log` (new, EXIT=1), `/tmp/ds3-e66-red-skip.log` (a fully-skipped guarded file still fails, EXIT=1), and `/tmp/ds3-e66-green.log` (a shard-shaped report, EXIT=0, with the shortfall stated). `scripts/check-no-silent-skips.mjs`
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
  the cluster default) is what actually falsifies the check. `scripts/check-db-timezone.mjs`. **Its
  absence from CI is a decision and is recorded as one** (F8, 2026-09-21, same change set): it is the one
  of the nine `scripts/check-*.mjs` no workflow invokes, because it needs `DATABASE_URL` and asserts a
  property of a PROVISIONED database — no CI job carries one it should point at, and the `server-tests`
  service only approximates IST through a `TZ` its own comment calls best-effort, so a step there would
  go red on a CI-only difference. The record lives beside the other checkers in `.github/workflows/ci.yml`'s
  `check-env` job and in the script's docblock; the runbook's "Time" section names the occasions it is
  for. No new case id: this extends 13.8, which already owns this script.

## Seed plumbing (Task 7)
- 13.41 ✅ `seedUlid` is a valid, `ULID_REGEX`-matching id — `seed-ulid.test.ts`
- 13.42 ✅ `seedUlid` is deterministic — the idempotence mechanism — `seed-ulid.test.ts`
- 13.43 ✅ `seedUlid` differs across keys and across namespaces — `seed-ulid.test.ts`
- 13.44 ✅ planted defect: a namespace/key join ambiguity cannot collide (`'ab'+'c'` vs `'a'+'bc'`) — `seed-ulid.test.ts`
- 13.45 ✅ ⚠ **REVERSED 2026-09-20** (owner: *"both"*), flipped rather than deleted: `plainTextDoc` PARSES markdown — a `**Gates:**` becomes a bold mark — while `literalTextDoc` keeps record text literal, markdown-looking characters staying characters. The record of the reversed decision lives in `src/seed/doc-text.ts`'s superseded docblock — `doc-text.test.ts`
- 13.46 ✅ the seed renderers emit one paragraph per line; blank lines become empty paragraphs — `doc-text.test.ts`
- 13.47 ✅ an empty string is still a valid one-paragraph doc in BOTH renderers — `doc-text.test.ts`
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
- 13.74 ✅ the body carries the record verbatim: tracker id, origin, counterparty/who, blocked-by resolved to the blocking item's human title, attention schedule, ask text. (Accessor changed 2026-09-20: the cases now read `errandDescriptionParts`, which replaced the string-returning `errandDescriptionText` when the split landed; the assertions themselves are unchanged.) — `cc-map.test.ts`
- 13.75 ✅ ⚠ **REVERSED 2026-09-20**, flipped rather than deleted: the description event carries a PARSED doc — `**Gates:**` arrives as a bold mark and the asterisks are gone — asserted in both directions so a "parser" that merely deleted the delimiters cannot pass — `cc-map.test.ts`
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
- 13.100 ✅ `seedDevWorkspace` refuses when the owner has never signed in — the seed never invents people — and, once signed in, a first run commits real events while a second run is a no-op (`committed: 0`, `skippedExisting` exactly accounting for the first run) — `seed-dev.test.ts`. **⚠ Runs against a two-plan FIXTURE since 2026-09-20, not the real series, and the assertion got STRONGER rather than weaker.** It used to seed all **359** real events twice and took **1690 ms** under a 30 s limit — breached on a loaded box (red at load average 201; green on the next quiet gate). `it`'s claims are `committed > 0`, `committed === 0` on a re-run and `skippedExisting === first.committed`, **none of which is a fact about corpus SIZE**, so the corpus was reduced 27.6× (359 → **13** events, 1690 ms → **~100 ms**) and `committed` is now asserted for its VALUE — `toBe(13)` — where it was `toBeGreaterThan(0)`, which a seed committing one event would satisfy. **The real corpus's SHAPE stays pinned by 13.98 and 13.99 in the same file** (in memory, over the real series, unchanged), and the real-database end-to-end path by the `seed-dev-cli` cases. Not a new case id: no behaviour changed, so per the dispatch none is minted.

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
in full under `PENDING BLOCK` headings with **no ids minted**. **`13.201` itself is no longer free** — the
controller's allocated block (`13.201–13.240`) was consumed starting there by the LATER scheduler-
generalisation errand (minted at `13.201–13.203`, see "The scheduler generalisation..." section further
down), so these entries are still awaiting one of the block's remaining free ids (`13.204` on) rather than
`13.201` specifically. Nothing is borrowed and nothing is renumbered; the ask still stands.

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
- ✅ **13.1200 — E6-23, planted defect: an `HH:MM` that looks well-formed but names no time of day is refused and NAMED with the same sentence as 13.12, never rolled over.** Before the fix the regex admitted `25:00`, `23:60`, `24:00` and `99:99` and `setUTCHours` rolled them — measured against the built module from `2026-09-21T07:30Z`: `25:00` → next run `2026-09-22T01:00Z`, `99:99` → `2026-09-25T04:39Z`, four days out — while `9:00` (the wrong SHAPE) threw; a daemon started on a mistyped `BACKUP_TIME_UTC` looked correctly configured. RED: `25:00: expected [Function] to throw an error`; GREEN after two comparisons (`>= 24`, `>= 60`) joined the shape check's own `throw`. **Ids from B16's allocated §13 block `13.1197`–`13.1206`** (controller allocation, 2026-09-21 22:0x — §13 ids are per release batch, table in `test-cases/13-hig-per-screen.md`); minted before the allocation landed from an anchored cross-branch grep (`13.12xx` over every `origin/*` branch: zero hits against a same-loop control of 36 for `13.11xx`), and inside the block once it did. No `config.ts` key was added (the finding's second half): the daemon reads the value straight off the environment by design and `startScheduler` computes every first `delayMs()` before arming, so the throw already ends the worker at boot. `apps/server/test/ops/schedule.test.ts`
- ✅ **13.1201 — the control for 13.1200: `00:00` and `23:59`, the two boundary values inside the range, still schedule and land on the minute they name** (`2026-09-22T00:00Z` and `2026-09-21T23:59Z` from the same `from`). Without it the case above passes equally well against a bound written one off. `apps/server/test/ops/schedule.test.ts`
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
and deliberately carry NO id**, under `PENDING BLOCK` headings. **The controller HAS since allocated Lane
C a block — `13.201–13.240` — but `13.201–13.203` of it were already spent by the LATER scheduler-
generalisation errand** (see "The scheduler generalisation..." section further down this file), which
reached the controller's allocation first. These entries still need one id each from what remains of that
block (`13.204` on) or a further one if it also runs out — asked for, per the rule at the head of this
file, never borrowed from Lane D's `13.41–13.100` or Lane E's `13.101–13.200`, and never sub-numbered:
`check-case-ids.mjs`'s `ID_LINE` captures `(\d+\.\d+)`, so a `13.40.1` would be extracted as `13.40` and
reported as a duplicate, while a `13.40a` would not match at all and become invisible.

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
it — `ci.yml` pins `pgvector/pgvector:pg16` beside `postgresql-client-16`, "pinned to the server's major version"
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


## The dev stack's branch source (owner, 2026-09-23)

Ids minted from the §13 tip, not from a release block: the 2026-09-22 batch blocks (`13.1057`–`13.1206`)
are spent, and the high-water mark was `13.1346` when these were written. It was recounted with
`scripts/check-case-ids.mjs`'s OWN declaration regexes rather than a bare grep — a bare `13\.[0-9]+` sweep
returns this catalogue's two documented truncation traps, `13.9999` and `13.632866`, and minting from the
larger of those would have put these cases six hundred thousand ids past the tip.

All four are 🧪: the acceptance is a hand-run `ctl rebuild --dry-run` against a checkout standing on the
branch under test. Nothing automated brings the dev stack up — `Features.md` already says that of this
bucket. The arms below were each run on 2026-09-23 against a scratch checkout named by `GISIK_PRIMARY`,
and each case records what its own run printed.

- 13.1347 🧪 `ctl rebuild` builds the stack from the branch the primary checkout stands on, not from `main`.
  On a clean checkout on `release/2026-09-99` the dry-run prints `DRY: git pull --ff-only origin
  release/2026-09-99`, the two `DRY: docker … prune` lines (13.1592), then `OK rebuild dry-run on release/2026-09-99`, exit 0 — the pulled ref and the OK
  line BOTH name the release branch, which is what makes the built tree the release branch's tree.
  `scripts/ctl/verbs/rebuild.sh`
- 13.1348 🧪 CONTROL for 13.1347 — a task branch is refused, so 13.1347 cannot be green merely because the
  guard accepts anything. On `feat/some-task`, exit 1 with `FAIL rebuild primary checkout is on
  'feat/some-task' — the stack is built from main or release/* only, never a task branch`. The refusal
  NAMES the branch it rejected, which is what distinguishes it from a guard that fires on every input.
  `scripts/ctl/verbs/rebuild.sh`
- 13.1349 🧪 CONTROL for 13.1347 — a detached HEAD is refused with its own message, because
  `git branch --show-current` returns EMPTY there and an empty string must not fall through the
  `main|release/*` case as if it matched. Exit 1, `FAIL rebuild primary checkout is on a detached HEAD`.
  This earned its own arm the hard way: the first run of these cases detached the scratch checkout through
  a failed setup line, and the `main` arm then silently re-tested detachment while appearing to be the
  `main` arm — a setup failure that reads exactly like a result if only the exit code is read.
  `scripts/ctl/verbs/rebuild.sh`
- 13.1350 🧪 REGRESSION arm — `main` is still accepted after the change: `DRY: git pull --ff-only origin
  main`, the two prune lines (13.1592), then `OK rebuild dry-run on main`, exit 0. Without this arm a guard that had been narrowed to
  `release/*` alone would look identical to the intended one across every other case in this section.
  `scripts/ctl/verbs/rebuild.sh`

## `ctl rebuild` prunes the build cache and old unused images, never a volume (`task/ctl-rebuild-prune`, owner standing rule 2026-10-01)
Why: on 2026-10-01 the Docker VM disk filled with superseded images and build cache, the test Postgres began
refusing connections, and a whole gate failed (`ECONNREFUSED`, "Cannot read properties of undefined (reading
'drop')"). A stub `docker` first on PATH records argv, so the cases assert what ctl RUNS, not what Docker did.
Block `13.1590`–`13.1595`. All six are **🧪, not ✅, on purpose** — same reason as `13.1501`–`13.1512`: 13.1590–13.1594 run automatically as `scripts/ctl/test/lib.test.sh` arms under `pnpm check:ctl`, each named for its case id, but `check-case-citations.mjs` scans only `apps/` and `packages/`, so a ✅ here would read as uncited.
Mutations measured 2026-10-01 (controller, LOCAL, the prune assertions alone, control 14/14 green first):
nine, **9 red** — drop `--filter until=24h` (3 red), `--volumes` on the image prune (5), `--volumes` on the
build-cache prune (5), the OK line without the prune result (1), the second prune skipped after the first
fails (1), the dry-run without the prune (1), the `n/a` fallback removed (1), a `docker volume prune` line
planted in `rebuild.sh` (2), a `docker system prune` planted in the dry-run (3).

- 13.1590 🧪 After the stack is verified, `ctl_prune` runs exactly `docker builder prune -f` then `docker
  image prune -a -f --filter until=24h`, in that order, and nothing else; the image prune is bounded by
  `until=24h` (an unbounded `-a` would delete the image the rebuild just built). `scripts/ctl/lib.sh`,
  `scripts/ctl/test/lib.test.sh`. Mutation: drop `--filter until=24h` → red.
- 13.1591 🧪 A prune NEVER names a volume. The stub's recorded argv carries no `volume`, `system prune` or
  `--volumes`, and no non-comment line of any ctl script runs `docker volume …`, `docker system prune` or
  `compose down -v`. CONTROLS in the same file: the detector flags each of seven volume-touching commands it
  exists to catch, and the static scan flags a planted `docker volume prune` fixture — so neither can be
  green merely because it matches nothing. Mutation: add `--volumes` to either prune → red.
- 13.1592 🧪 `ctl rebuild --dry-run` prints `DRY: git pull --ff-only origin <branch>; …`, then `DRY: docker
  builder prune -f`, then `DRY: docker image prune -a -f --filter until=24h`, then `OK rebuild dry-run on
  <branch>`, exit 0; it only prints (the stub records no docker call) and the output names no volume. Cases
  13.1347 and 13.1350 stay true: the pull line and the OK line are unchanged.
- 13.1593 🧪 `ctl_disk_line` prints `disk: images <size> (reclaimable <n>), build cache <size> (reclaimable
  <n>), Docker VM disk <pct> used`, the VM figure read through the test Postgres container whose data dir
  sits on that disk. CONTROL: when Docker cannot answer, each field reads `n/a`, never empty.
- 13.1594 🧪 A prune failure does not stop the rebuild or hide the other prune: with the build-cache prune
  failing the image prune still runs and `ctl_prune` returns non-zero (CONTROL: zero when nothing fails). In
  `rebuild.sh` the prune comes AFTER the last verification gate (`GOOGLE_CLIENT_ID`) and BEFORE the final
  `ctl_ok`, and the OK line carries the prune result and the disk line — so a failed prune is visible and a
  good build is never reported failed over it, nor a bad build pruned over.
- 13.1595 🧪 REAL RUN on the dev stack — one `ctl rebuild` from the release tip prints an OK line ending
  `…, pruned build cache + unused images >24h, disk: images …, build cache …, Docker VM disk NN% used (log
  …)`, the dev stack stays Up and healthy, the three named volumes (`gisik-nokma-dev_pg-dev-data`,
  `gisik-nokma-dev_minio-data`, the test Postgres's) are still listed by `docker volume ls`, and the Docker
  VM disk figure falls.
  **Run 2026-10-01 (controller, LOCAL, Docker Desktop) — PARTLY:** (1) the first `ctl rebuild` after this merged
  printed the OLD OK line (no prune, no disk line) — expected, not a bug: the running `rebuild.sh` is the file
  that was on disk when it started, and its own `git pull` brought the new one. (2) A second `ctl rebuild` on the
  unchanged tree **FAILed** `gisik-nokma-dev-server-1 image created … is not newer than start` — with every layer
  CACHED the image keeps its old `.Created`, so a no-op rebuild trips the freshness check; this predates the
  change and is a separate finding (open), and it means the new final step is not reached on a no-op rebuild.
  (3) So the functions were run for real, as the final step would: `ctl_prune` rc=0, build cache **3.743 GB → 0 B**,
  Docker VM disk **25% → 18% used**, the disk line read `disk: images 6.004GB (reclaimable 1.578GB (26%)), build
  cache 0B (reclaimable 0B), Docker VM disk 18% used`; `docker volume ls` identical before and after (13 volumes);
  both dev containers Up, server healthy. The unused-image prune removed nothing (no unused image older than 24 h).
  **Completed 2026-10-01 (controller, LOCAL):** the next landing's `ctl rebuild` (release tip `5685643f`, new code)
  built, verified and ended `OK rebuild release/2026-09-30 5685643f67a1 images fresh, server healthy, /healthz 200 on
  :3000, web :3001 307, sign-in configured, pruned build cache + unused images >24h, disk: images 6.696GB
  (reclaimable 2.276GB (33%)), build cache 0B (reclaimable 0B), Docker VM disk 19% used (log …)`; `docker volume
  ls` identical before and after (13 volumes); server healthy. The case is left 🧪 only because it is a hand-run
  against the real Docker (the arms above are automatic).

## `ctl dispatch`: a ghost suggestion is not input; `--submit-pending` (`task/ctl-dispatch-ghost-pending`, orchestrator 2026-10-02)
Why: at 04:38 on 2026-10-02 the dispatcher could not reach two lanes. gisik:1 showed only Claude Code's dim prompt
suggestion (`^[[2mRead the WHOLE file …`, no closing reset), which `ctl_box_text` read as real text; gisik:3 held a real
message pasted at 04:22 but never submitted, and no verb could send it. Block `13.1640`–`13.1642`, 🧪 for the same reason
as `13.1501`–`13.1512` (arms in `scripts/ctl/test/lib.test.sh` under `pnpm check:ctl`; the citation scanner reads only
`apps/` and `packages/`). Red proof (LOCAL, 2026-10-02): with the old regex 13.1640 (both arms) and 13.1642 fail.

- 13.1640 🧪 `ctl_box_text` drops a dim span that runs to the end of the line with no reset (the real gisik:1 capture),
  and — the control — still reads real text that sits between a closed dim span and an unclosed one.
- 13.1641 🧪 `ctl dispatch <window> --submit-pending` on a box holding a real multi-line message presses real Enters
  until it empties (×2 for the multi-line shape), says so in its OK line, and never pastes.
- 13.1642 🧪 `ctl dispatch <window> --submit-pending` on a box holding only a ghost suggestion is refused ("holds no
  real text") and sends no key at all.

## `ctl gate` / `land` / `check-pr` take `--base <branch>` (`fix/ctl-base-flag`, owner-flagged 2026-09-29)

Ids minted from the §13 tip: `13.1495` was the highest id on any remote branch (measured with `check-case-ids.mjs`'s own
declaration regex over every `origin/*` head, 2026-09-29), and `13.1496`–`13.1500` are held by the notes-help round, so this
block is `13.1501`–`13.1512`. All twelve are **🧪, not ✅, on purpose:** they run automatically — every one is an arm in
`scripts/ctl/test/lib.test.sh`, executed by `pnpm check:ctl` / `ctl selftest`, and each test's name starts with its case id —
but `scripts/check-case-citations.mjs` only scans `apps/` and `packages/`, so a non-suffixed ✅ here would read as uncited.
The fixtures are throwaway bare repos, a fake `gh` that performs the merge for real inside the fixture, and a private copy of
the ctl tree whose `checks` verb is a no-op. **No real PR is ever read or merged by these.** Mutation-witnessed 2026-09-29, each mutant a private copy of `scripts/ctl` with one line changed, the block run against
it (red = failing arms): `--base` validated but never applied 14 · one marker kind for every base 8 · land compares the PR
base to literal `main` 7 · land fast-forwards a primary on `main` whatever the base 1 · `check-pr.py` ignores its base 5 ·
the base validator accepts anything 4 · `pr open` reads the main-kind marker 2 · gate measures `origin/main` 2 · land's
ancestry re-read measures `origin/main` 3 · land's retarget check removed 2. **Every mutant is killed.** The validator mutant
first SURVIVED (rc 1, zero FAIL lines): the loop's `exit 1` inside `check`'s `eval` ended the whole script instead of
failing one arm — the loops now run in a subshell.

- 13.1501 🧪 `--base` accepts `main` and `release/<name>` (nested included) and NOTHING else. `develop`, a task branch,
  `release`, `release/`, `release/../main`, `release/a..b`, `release/a b`, `origin/main`, a dot-led segment and an empty value
  each exit 1 from `ctl gate`, `ctl land` (a PR whose base is `feat/x`, named by `--base feat/x`) and `check-pr`, with
  `main or release/` in the FAIL line; `--base` with no value is refused, not swallowed. `check-pr.py` exits non-zero on the
  same set. `scripts/ctl/lib.sh` (`ctl_base_valid`, `ctl_take_base`), `verbs/{gate,land,check-pr}.sh`, `verbs/check-pr.py`
- 13.1502 🧪 `ctl gate --base release/x` reads `origin/release/x`, not `origin/main`. With `release/x` ahead of the branch it
  refuses naming `origin/release/x` and a remedy that merges `origin/release/x` and repeats `--base`; with `main` ahead (and
  `release/x` contained) it proceeds. The default run — and `--base main` spelled out — still refuse on `main` moving, naming
  `origin/main`, the text unchanged. `scripts/ctl/verbs/gate.sh`
- 13.1503 🧪 Markers are per-base. A green `ctl gate --base release/x` writes `gate.release+x-<sha>` and NOT `gate-<sha>`; a
  default run writes `gate-<sha>`, the name `land` has always read. `ctl_marker_kind` is injective (`release/a/b` and
  `release/a-b` differ). `scripts/ctl/lib.sh`, `verbs/gate.sh`
- 13.1504 🧪 `ctl land` merges only a PR whose base EQUALS `--base`. A PR based on `main` under `--base release/x` is refused
  (`PR #7 base is main, not release/x`); a PR based on `release/x` under the default is refused (`base is release/x, not main`);
  in both the fixture remote's `main` and `release/x` are byte-unmoved and `gh pr merge` was never called.
  `scripts/ctl/verbs/land.sh`
- 13.1505 🧪 A gate marker satisfies only the base it was earned against. With only the `main`-kind marker a release landing
  says `no gate marker`; with only the release-kind marker a landing into `main` says the same. `verbs/land.sh`
- 13.1506 🧪 A release landing merges into `release/x` and verifies against `origin/release/x`: the OK line reads
  `merge <sha> release/x <sha> primary untouched`, the gated head is an ancestor of `origin/release/x`, the tree-identity and
  drop-check controls hold. **THE SAFETY ARM:** the same landing leaves the remote's `main` at its old sha and a primary
  checkout standing on `main` at its old sha. If `release/x` moved after the gate it refuses with `origin/release/x moved to`
  and merges nothing; `--dry-run` merges nothing. `verbs/land.sh`
- 13.1507 🧪 REGRESSION — the default still lands into `main` and fast-forwards a primary standing on `main`
  (`… main <sha> primary ff <sha>`). `verbs/land.sh`
- 13.1508 🧪 A release landing fast-forwards the primary checkout only when it stands on that release branch (`primary ff`),
  and `main` stays where it was. `verbs/land.sh`
- 13.1509 🧪 `check-pr.py` takes the diff and the commit list against `origin/<base>`: a branch on top of `release/x` with one
  task commit reports `1 task commits, 0 bookkeeping commits, 1 files, 0 failures` against `release/x`; CONTROL — the same
  branch against the default `main` also counts the release branch's own commit and fails on its subject. `verbs/check-pr.py`
- 13.1510 🧪 `ctl check-pr --base release/x` (real run, `checks` stubbed in a private copy) is green and writes
  `checked.release+x-<sha>`, not `checked-<sha>`; CONTROL — the default run on the same branch fails on the batch conditions
  and writes no marker. `verbs/check-pr.sh`
- 13.1511 🧪 `ctl pr open --require-checked` looks for the marker of the base it targets: `--base release/x` accepts the
  release-kind marker; **a PR to `main` is NOT admitted by it** (`no checked marker for <sha>`); a PR to `release/x` is not
  admitted by a `main`-kind marker; REGRESSION — a `main`-kind marker still admits a PR to `main`. `verbs/pr-open.sh`
- 13.1512 🧪 A PR retargeted between the checks and the merge is refused. `land` re-reads head AND base at the instant of
  merging; a PR that was `release/x` at the start and reports `main` then is refused with `was retargeted to main`, and
  nothing merges. `verbs/land.sh`

## Backup worker TLS to the managed cluster (`hotfix/backup-worker-ca`, 2026-09-23)

The production `backup` worker logged `backup job failed … self-signed certificate in certificate chain`
for `sweep-notifications` and `auto-close` (2026-09-23 00:13 IST). Cause: `backup-daemon-main.ts` built
its pool with `createPool(databaseUrl)` and never read `DATABASE_CA_CERT`, although `deploy/do/app.yaml`
binds it to the worker exactly as to the server, and the server hands it to `createPool` (`src/index.ts`).
The ledger export shares that pool and failed the same way; `pg_dump` goes through libpq under
`sslmode=require` and was unaffected.

- 13.1421 ✅ `optionalDatabaseCaCert(env)`: unset and blank are `null` (App Platform resolves an unbound
  variable to `''`); a PEM comes back verbatim; a non-PEM throws `ConfigError` naming `DATABASE_CA_CERT`.
  `apps/server/test/ops/backup-env.test.ts`. Mutation: return the string unconditionally → the refusal
  assertions red.
- 13.1422 ✅ The spawned daemon announces `{"msg":"database pool","tls":"ca"}` when `DATABASE_CA_CERT`
  is bound and still arms the scheduler; CONTROL in the same `it`: bound to `''` → `"tls":"none"` and the
  scheduler arms. The announce is read back from `pool.options.ssl`, NOT from the variable — the first
  version read the variable and a mutation dropping `{ caCert }` from `createPool` SURVIVED (recorded here
  because it is the shape of the original defect: the environment said "ca", the pool said nothing).
  Mutation: `createPool(databaseUrl)` without the CA → `"tls":"none"` under a bound CA → red (measured
  2026-09-23, Node v22.22.2). `apps/server/test/ops/backup-daemon-main.test.ts`.
- 13.1423 ✅ A non-PEM `DATABASE_CA_CERT` aborts the whole scheduler (no `backup daemon scheduled` line)
  and stderr names the variable, the same shape as a refused sweep interval.
  `apps/server/test/ops/backup-daemon-main.test.ts`.

## Live-update socket routing (`hotfix/stream-same-origin`, 2026-09-23)

A ticket created in production did not appear on the board or list without a manual refresh (#694's socket
multiplex, shipped in #700, did not change it). Measured in the production server log: every
`GET /v1/stream` handshake from host `pm-api.artsourced.in` answered `401` in ~1 ms, repeating on the
client's backoff. Cause: the browser dials the socket directly at `NEXT_PUBLIC_SERVER_URL` (Next cannot
proxy an upgrade), which was `https://pm-api.artsourced.in`; the stream authenticates at the upgrade with
the session cookie; that cookie belongs to `pm.artsourced.in` only (`crossSubDomainCookies` is deliberately
off). The dev stack hides it — both hosts are `localhost`, and cookies ignore ports. The fix is the deploy
spec alone: the web host's `/v1` and `/api/auth` route to the server at the edge, and the socket is dialled
at the web host.

- 13.1424 ✅ In `deploy/do/app.yaml`'s ingress, `/v1` and `/api/auth` on the primary domain `pm.artsourced.in`
  route to `server` and sit BEFORE that domain's authority-only `web` catch-all, and both set
  `preserve_path_prefix: true` — App Platform trims a matched prefix by default, so without it `/v1/stream`
  reaches the server as `/stream` and 404s. CONTROL: `pm-api.artsourced.in` still routes to `server`.
  `apps/server/test/deploy/app-spec-ingress.test.ts`. Mutations: remove the `/v1` rule → red; drop the
  `/v1` rule's `preserve_path_prefix` → red.
- 13.1425 ✅ The `web` component's `NEXT_PUBLIC_SERVER_URL` is `https://` + the PRIMARY domain, so the socket
  is dialled at the host that holds the cookie; CONTROL: `SERVER_ORIGIN` is still `https://pm-api.artsourced.in`
  (the build-time rewrite target). `apps/server/test/deploy/app-spec-ingress.test.ts`. Mutation: restore
  `pm-api` in `NEXT_PUBLIC_SERVER_URL` → red.

## Production Docker builds reuse their dependency layer (`task/docker-build-cache`, 2026-09-23)

App Platform build logs of deployment `88477008…` (copies at
`gisik-nokma-lanes/evidence-build-{server,web,backup}-2026-09-23.log`): kaniko's registry layer cache
HIT the apk layer, `RUN corepack enable`, and the retired `dev` stage's `RUN pnpm fetch` — but the
production `build` stage did `COPY . .` THEN `RUN pnpm install --frozen-lockfile`, so its install layer
had no lockfile-keyed cache to hit at all: "No cached layer found" on every deploy (71s server, 57s
web, 71s backup, which shares `apps/server/Dockerfile`). Separately, with no `--target` named anywhere
on App Platform, kaniko built the `dev` stage too — an image nothing runs — adding ~2-3 min per
component (wall: server 4:50, web 4:21, backup 4:26). Both Dockerfiles' `build` stage now uses the
`dev` stage's own layering (manifests → `pnpm fetch` → source → `pnpm install --offline`), and the
`dev` stage itself moved out to `apps/{server,web}/Dockerfile.dev`, which `docker-compose.hot.yml`'s
retired override now points at directly (`dockerfile:`, alongside the `target: dev` it already named).

- 13.1426 ✅ For BOTH Dockerfiles, in the `build` stage the manifest/lockfile `COPY` lines precede
  `RUN pnpm fetch`, which precedes `COPY . .`, which precedes `RUN pnpm install --offline
  --frozen-lockfile`. CONTROL: the `runtime` stage still `COPY --from=build`s the same paths as before
  this change (server: `/out`, the entrypoint script; web: `.next/standalone`, `.next/static`,
  `public`). `apps/server/test/deploy/dockerfile-cache-shape.test.ts`. Mutation: swap `RUN pnpm fetch`
  and `COPY . .` in the server Dockerfile's `build` stage → red (measured 2026-09-23, Node v22.23.2).
- 13.1427 ✅ No stage named `dev` remains in either production Dockerfile, the `runtime` stage is still
  the last stage in each, the moved-out `apps/{server,web}/Dockerfile.dev` files exist and each still
  carries the `dev` stage, and `docker-compose.hot.yml`'s retired override points its `build.dockerfile`
  at them. `apps/server/test/deploy/dockerfile-cache-shape.test.ts`. Mutation: re-add `FROM node:22-alpine
  AS dev` to the server Dockerfile → red (measured 2026-09-23, Node v22.23.2).
- 13.1428 🧪 LOCAL MEASUREMENT (run 2026-09-23, Node v22.23.2, Docker Desktop) — `docker build
  --no-cache -f apps/server/Dockerfile --target runtime .`, then the same command without `--no-cache`,
  then once more after a one-line comment-only edit to `apps/server/src/index.ts` (not the lockfile),
  each timed with `/usr/bin/time -p`: **266.73s cold → 24.33s fully cached (every step `CACHED`) →
  86.14s after the source edit**, with `RUN pnpm fetch` reported `CACHED` and `RUN pnpm install
  --offline --frozen-lockfile` finishing in **3.6s** (`Done in 2s`). Same recipe for
  `apps/web/Dockerfile` (with `--build-arg SERVER_ORIGIN=http://server:3000 --build-arg
  NEXT_PUBLIC_SERVER_URL=http://localhost:3000`, edit to `apps/web/next.config.ts`): **265.73s cold →
  8.43s fully cached → 59.96s after the source edit**, fetch `CACHED`, install in **2.0s** (`Done in
  1.6s`). Both edits reverted immediately after their timed build; probe images removed
  (`docker rmi`). No `docker compose` used.
- 13.1429 🧪 The existing `apps/server/test/deploy/compose-dev-contract.test.ts` cases and
  `pnpm check:runbook` stay green after the `docker-compose.hot.yml` repoint (verified 2026-09-23,
  Node v22.23.2 — see this branch's commit body for the exact run).
- 13.1430 🧪 Post-deploy App Platform log reading, once this lands and deploys: confirm the fetch layer
  and install step show cache hits, the `dev` stage no longer builds, wall times drop toward the
  13.1428 measurement, and whether the `backup` worker's layers come back CACHED once `server`'s build
  has already primed the registry cache (the two share `apps/server/Dockerfile`). Not yet run — left 🧪
  with this recipe.
  **Reading 2026-09-28 (planner, build log of production deployment 59ccb812 — the notes release, 2026-09-23 21:00Z):** the first build of the new Dockerfiles. `RUN pnpm fetch` had NO cached layer on web, server or backup (3 × "No cached layer found for cmd RUN pnpm fetch"; 5 × "Found cached layer" for earlier layers); backup did not reuse server's layers in the same build. Wall time: web 21:00:41→21:05:21 (4m40s), server 21:00:46→21:04:55 (4m09s). A first build cannot hit a cache for a new step, so this is not yet the verdict: stays 🧪 until the NEXT deploy's build log is read.

## The gate has two kinds: fresh for `main`, cached for a release branch (`task/gate-speedup`, owner 2026-10-02: *"do the caching and whatever to run the gate faster"*)

Block `13.1700`–`13.1711`, the next free ids after `13.1619` (measured 2026-10-02 with `check-case-ids.mjs`'s declaration regex; no controller block was assigned to this task). `13.1700`–`13.1707` are 🧪, **not ✅, on purpose** — same reason as `13.1501`–`13.1512`: they run automatically as arms in `scripts/ctl/test/lib.test.sh` (`13.1700`–`13.1704`) and `scripts/ctl/test/gate-cache.test.sh` (`13.1705`–`13.1709`), both inside `pnpm check:ctl` / `ctl selftest`, but `check-case-citations.mjs` scans only `apps/` and `packages/`. The ones in `scripts/` carry the id in the test name, so grep finds both directions.

- 13.1700 🧪 `gate.sh` — the REAL file, run beside a stub `locked-test.sh` and a stub `pnpm` that records argv — runs `turbo run build test typecheck --force --concurrency=1` for `GATE_MODE=fresh` AND when `GATE_MODE` is unset (a hand-run never picks the weaker mode), and `turbo run build test typecheck --concurrency=1` with no `--force` for `GATE_MODE=cached` (the brief asked for 2; see 13.1710 for why it is 1). Its console states the mode that runs (`GATE_MODE=cached TURBO_FLAGS=--concurrency=1`).
- 13.1701 🧪 CONTROL: an unknown `GATE_MODE` (`fast`) and a set-but-EMPTY one both refuse, exit 2, name the value, and the stub `pnpm` is never invoked (no guessed mode).
- 13.1702 🧪 `ctl gate <sha> --base release/x` is release-kind: its OK line says `mode=cached` and carries `Tasks: 34 successful, 34 total · Cached: N cached, 34 total`. CONTROLS: the default and `--base main` are main-kind, `mode=fresh`.
- 13.1703 🧪 `--dry-run` names the mode it would pass (`DRY: GATE_MODE=cached …` for a release base, `fresh` for main).
- 13.1704 🧪 A `gate.sh` that ran `fresh` when `cached` was asked for FAILS the verb (`asked for cached, gate.sh ran fresh`) and writes no marker; CONTROL: the same script is correct for main-kind.
- 13.1705 🧪 `ui#test`'s turbo task hash (`turbo run test --filter=@gisik-nokma/ui --dry=json`, in a copy of the tree) CHANGES when an `apps/web/src` file changes — the file the ui colour scan polices, the #270 incident's shape. CONTROL: a file it does not read (`docs/lanes/gate-lock/README.md`) leaves the hash alone; reverting restores it.
- 13.1706 🧪 Same for `mobile#test`: a `packages/editor/src/styles/editor.css` change changes the hash; the docs file does not.
- 13.1707 🧪 `mobile#test` depends on `@gisik-nokma/editor#build:webview` (the stale-build root cause: the webview bundle `mobile` embeds was never rebuilt before the test read it). Mutation measured: with `turbo.json` from before this task the arm FAILS.
- 13.1708 🧪 `gate-cache.test.sh --real` (opt-in, minutes; run after editing `turbo.json` `inputs`): in an APFS clone with a private cache, `ui#test` warms (miss), re-runs as a HIT, stays a HIT after a change to a file it does not read, and is a real MISS after an `apps/web/src` edit. Run 2026-10-02: `warm=miss rerun=hit unrelated-change=hit reader-change=miss`.
- 13.1709 🧪 The same, real, for `mobile#test` after a `packages/editor` CSS edit. Run 2026-10-02: `warm=miss rerun=hit unrelated-change=hit reader-change=miss`.
- 13.1710 🧪 Measured wall times of the two kinds on real branches (hand-run through `ctl gate`, 2026-10-02): main-kind fresh **274 s** (0/34 cached); release-kind unchanged tree **66 s** wall (34/34, turbo 0.1 s), CSS-only 93 s (30/34) and server-only 232 s (31/34) on a quiet box at `--concurrency=2`; at the shipped `--concurrency=1` and load average 30–200: server-only 371 s, mixed 335 s, CSS-only 335 s (one CSS run red on 5 s timeouts, see the README table). `--concurrency=2` was dropped after both miss-heavy runs timed out. Left 🧪: hand-run, and the numbers move with the box's load.
- 13.1711 ✅ `packages/ui/test/token-discipline.test.ts`: `ui#test` declares the wildcard readers of the `apps/` and `packages/` listing (`apps/*/test/**`, `packages/*/test/**`, both `package.json` globs) as inputs, and the literal-tree comparison against `CLIENT_SOURCE_ROOTS` ignores them.
