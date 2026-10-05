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

## `ctl seats`: one line per seat, read-only (`task/ctl-seats`, plan #3, owner-approved 2026-10-03)
Why: the orchestrator's watch loop and the 300k-mid-step flag (plan #18) read raw `tmux capture-pane` dumps, which cost
context on every check and miss a stranded input box or a dead watcher. `ctl seats` reads every window of `gisik` once
(`has-session`, `list-windows` + `capture-pane`, never `send-keys`) and prints one line each. Block `13.1800`–`13.1824` (of the reserved
`13.1800`–`13.1829`; `13.1820`–`13.1823` are FIX 1 and `13.1824` is FIX 2, 2026-10-03), 🧪 for the same reason as `13.1501`–`13.1512` (arms in `scripts/ctl/test/seats.test.sh` under
`pnpm check:ctl`; the citation scanner reads only `apps/` and `packages/`). The pane fixtures in
`scripts/ctl/test/fixtures/seats/` are real captures of the live session (address masked).

- 13.1800 🧪 A spinner line above the box reads `busy` with its elapsed time (`3m59s`); Ctx, model and the 0/0 shell and monitor counts come from the status line and footer.
- 13.1801 🧪 `4 shells, 1 monitor` in the footer parses to 4 and 1, and a `cutting it close` segment in the status line does not displace Ctx or the model.
- 13.1802 🧪 A `done 1:54 AM` turn-end line reads `idle` with that time (and the footer's `2 shells, 1 monitor` on the real opus capture).
- 13.1803 🧪 The singular `1 shell` parses; a seconds-only spinner is busy; CONTROL: `⎿  Running… (3s of output)` inside tool output is not a spinner.
- 13.1804 🧪 The input box: real text is `text`; a dim ghost suggestion, closed or running to the line end, is empty; real text before a ghost tail keeps the real part; a `❯` in the transcript is not the box. The box is the one above the status line (13.1820). It agrees with `ctl_box_text` (13.1819).
- 13.1805 🧪 `pane_in_mode=1` reads `copy_mode` true and the state `unknown` (a scrolled view hides the spinner).
- 13.1806 🧪 The last DONE / CHECKPOINT line wins; its age is the checkpointed commit's time (a reviewer's and a FIX session's lines: 13.1821).
- 13.1807 🧪 `needs fresh session at step N` is a signal; CONTROL: the brief's template text (`<branch> <sha40>`, `<n+1>`) and a DONE quoted inside a monitor-event line are not.
- 13.1808 🧪 An unknown sha falls back to the next turn-end stamp for the age; with neither, the age is `?`.
- 13.1809 🧪 Roles: `main` controller, `exec*` lane, `planner`, `reviewer*`, `dispatcher`, anything else `other`.
- 13.1810 🧪 The text line (window, name, role | state | sh/mon | box | Ctx model/effort | branch@head unpushed dirty | last), copy-mode (in the state field, `| unknown copy-mode |`) and box text visible on it, shells before monitors (`sh 2 mon 1` with different counts), one `OK seats` summary last; `--json` is one object per line with the summary on stderr.
- 13.1811 🧪 `--flag` `idle-no-task`: a lane idle with no shell and no monitor, or idle after its DONE; CONTROLS: a shell running, or busy, is not.
- 13.1812 🧪 `idle-no-watch`: a coordinator idle with nothing armed; CONTROL: with a monitor armed it is quiet.
- 13.1813 🧪 `ctx>20%-at-boundary` (idle at a CHECKPOINT/DONE, or a coordinator's quiet point) and `ctx>30%-mid-step` (plan #18); CONTROLS: exactly 20% and exactly 30% are not flagged.
- 13.1814 🧪 `box-text` (busy or not), `copy-mode`, `no-claude` (a bare shell), `needs-fresh-session`.
- 13.1815 🧪 `--flag` prints only the flagged seats and `OK seats F flagged of N`; with nothing to flag, no seat lines and exit 0; `--flag --json` prints only the flagged objects.
- 13.1816 🧪 Against a fake `tmux`: windows in numeric order (2 before 10), branch and short head; `unpushed` counts against `origin/<branch>` (not the release upstream of a task branch), else commits on no origin ref; `dirty`; a directory that is not a worktree has null branch facts.
- 13.1817 🧪 Read-only: the verb called only `has-session`, `list-windows` and `capture-pane` (the set is asserted exactly; no `display-message`), and left the checkout unchanged.
- 13.1818 🧪 `--dry-run` calls no `tmux` at all and exits OK.
- 13.1819 🧪 13 windows in under 2 s through the fake `tmux` (live run, 2026-10-03: 0.82 s), and `seats.py` agrees with `ctl_box_text` on plain text, a closed ghost, an unclosed ghost, real+ghost, empty, and the agent-panel shape (empty box; typed text).
- 13.1820 🧪 The background-agent panel opens BELOW the footer and puts `❯` on its selected row; that row is not the input box (live gisik:6 flagged `box-text` with `◯ general-purpose …`). The box is the `❯` above the status line (preferring the one above a `─` rule), read by `scripts/ctl/boxtext.py`, shared by `ctl seats` and `ctl_box_text`. Arms: the real capture (`fixtures/seats/agents-panel-ghost.pane`; its selection marker was placed by hand, the live panel was not focused) reads an empty box, no `box-text` flag and busy from the spinner; a ghost in the real box is empty; a spinner and an `esc to interrupt` footer are still read with 12 agent rows below; a box wrapped onto a second line is still read with the panel (a pipe in its last row) below it; with no status line the `❯` above a `─` rule wins, else the last `❯`; `ctl_box_text` on the same shapes (lib.test.sh). CONTROLS: typed text with the panel open is `text` and is the typed text; a panel alone leaves an idle seat idle and empty.
- 13.1821 🧪 Protocol lines (MSG-no-midtask-seats): `CHECKPOINT reviewer idle after <branch> <hex sha>` is a CHECKPOINT signal (live gisik:9 read `last: none`); `needs fresh FIX session` is kind needs-fresh and raises `needs-fresh-session`; a lane's `CHECKPOINT task/<b> <sha> DONE` counts as DONE (`idle-no-task` with a monitor armed). CONTROLS: the reviewer template (`<branch> <sha8>`, no hex), a quoted `"needs fresh FIX session"`, and a step checkpoint (`step 2/3`, not DONE) are not signals / not DONE.
- 13.1822 🧪 A turn-end stamp later than now is yesterday's (now 00:05, `done 11:58 PM` is 7 min); CONTROL: `done 12:03 AM` at 00:05 is 2 min.
- 13.1823 🧪 `ctl selftest` prints the number of steps it ran: counted in `step()`, never a typed literal (both sides of a tip merge had bumped `16 steps` to `18 steps`; the merged tree ran 20).
- 13.1824 🧪 A `ctl seats` text line in a pane's scrollback (`… | Ctx 11% sonnet-5-5 | …`, which matches `Ctx N%` + `|`) above the real transcript, box and status line (`Ctx 27% opus-5-5`) is not the status line: the LAST such line is, so ctx, model and the typed box text come from the real ones (both `seats.py` and `ctl_box_text`, which share `boxtext.py`); CONTROL: the same pane without the scrollback line reads the same.

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

## `ctl tipmerge` — a clean tip merge made by the controller, with no checkout and no LLM turn (`task/ctl-auto-tipmerge`, owner-approved 2026-10-03, plan #20 + B3)

Why: a task branch behind its release tip needed a MERGETIP to a lane and then a reviewer fast-path re-check even when `git merge-tree` said the merge was clean — 2–4 rounds per task, 15–30 min each, all mechanical. `ctl tipmerge <branch> --base release/<name> --expect <sha>` does the clean case itself and sends only a real conflict (a hand-resolved file) to a lane and a reviewer.

Block `13.1775`–`13.1799` (measured 2026-10-03: the §13 high-water was `13.1774` — `task/ctl-run-tests` owns `13.1750`–`13.1774` — across every `origin/*` head and every local branch). Run by `scripts/ctl/test/tipmerge.test.sh`, a `pnpm check:ctl` step; each case builds a throwaway bare origin and clones, no network.

- 13.1775 🧪 The branch must be a task branch: `main`, any `release/*` name (including `release/-x`, a valid ref that `ctl_base_valid` would not accept as a base), `HEAD`, an empty name, a leading dash, an invalid ref name (`a..b`, a space) and a `refs/…` spelling are all refused with `FAIL tipmerge` before anything is pushed; CONTROL — an ordinary `task/*` branch is accepted; a branch that is not on origin is refused (`cannot fetch`). Each refusal is asserted by its message with `--expect` set to the branch's own tip, so a missing guard cannot hide behind a "moved" refusal.
- 13.1776 🧪 Arguments: `--base` is required and must be `main` or `release/<name>`; `--expect` is required and must be 7–40 hex characters; no branch, an extra positional, and an unknown flag (`--force` included) all refuse, each with its own message.
- 13.1777 🧪 A clean merge (the branch and the base touched different files): exit 0; the sha on the `OK tipmerge` line IS `origin/<branch>` afterwards and differs from the old tip; its parents are exactly `[old branch tip, base tip]` in that order; its tree equals the tree of an independent `git merge` made in another clone before the verb ran, and differs from both parents' trees; the base is an ancestor of it (what `ctl gate --base` requires); no other ref on origin moved; the message names the base and the branch; the OK line prints the `ctl gate <sha> --base <base>` command and sends the gate to a detached checkout at the new sha (`git fetch origin && git checkout --detach <sha>`), not to a `git pull` in the lane's worktree, and says a lane that commits on its now-behind local branch must pull in its OWN worktree first.
- 13.1778 🧪 A clean merge inside one file (distant hunks) gives the same tree as the independent merge and contains both edits.
- 13.1779 🧪 No working tree is touched: run from a clone standing on another branch with a staged change, a dirty tracked file and an untracked file, HEAD, status, file bytes, the staged diff and the local branches are byte-identical after a push and after a conflict refusal.
- 13.1780 🧪 A conflicted merge: exit 3, one `CONFLICT <path>` line per conflicted file (each once, the clean file not listed), the last line `FAIL tipmerge … conflicted`, nothing pushed; CONTROL — the same flags on a clean pair push. A `git merge-tree` failure that is not a conflict (unrelated histories) is `FAIL` exit 1, never reported as conflicted.
- 13.1781 🧪 A branch that moved since `--expect` was read: refused with exit 1, naming both shas; origin keeps the other push; CONTROL — with the current tip as `--expect` the same fixture proceeds.
- 13.1782 🧪 `--expect` accepts a 7-character prefix of the tip; a sha that is an ancestor of the tip but not the tip is refused as moved.
- 13.1783 🧪 A race between the verb's fetch and its push (the branch moves on origin in between): the plain push is refused, `FAIL`, origin keeps the racer's commit; CONTROL — a no-op pre-push hook alone does not stop a push.
- 13.1784 🧪 Positive proof: a push that origin accepted and then undid (a post-receive rewind) is a `FAIL` — the verb re-reads origin with `ls-remote` and requires the new sha. An unreachable origin fails (a stale ref is never merged against).
- 13.1785 🧪 A branch that already contains the base tip: exit 0, `already contains`, the tip printed, no commit made, nothing pushed.
- 13.1786 🧪 `--dry-run`: a clean pair prints the auto-merge tree and the push it would make, exit 0, origin unchanged; a conflicted pair exits 3 with the paths; a moved branch is still refused.
- 13.1787 🧪 The verb has exactly one `git push`, with no `--force`, `-f`, `--delete`, `--mirror` or `+` refspec, and it names exactly `refs/heads/$branch`; CONTROL — the detector flags each forceful spelling.
- 13.1788 🧪 `ctl help` lists `tipmerge`; `selftest.sh` runs this suite and a `tipmerge` refusal step as live, uncommented `step` lines (a commented-out step fails; CONTROL — the patterns reject a commented line and accept a live one).
- 13.1789 🧪 The real thing (2026-10-03, dry-run): `ctl tipmerge task/sm-t13-native-loading --base release/smoothness --expect 9a76ca1fc35f --dry-run` against the live origin reported a clean merge, tree `ef15dfb07a1e` — equal to `git merge-tree --write-tree` run by hand — of `release/smoothness` `dfe7afe3` into `9a76ca1f`, exit 0; with `--expect 0000000` it refused as moved, exit 1. The tree is re-derived offline on every `check:ctl` run from the two shas (skipped, with a printed notice, in a clone that lacks the commits).

## `ctl archive` — stale lanes-dir files to `archive/<date>/` and a daily notes roll (`task/ctl-archive`, owner plan B13, 2026-10-03)

Why: the lanes directory held ~1,700 loose files (BRIEF/PTR/MSG/NOTE/HANDOFF/EXEC/pr/DISPATCH scratch) and a 2,000-line `CTL-TO-PLANNER-notes.md`; every `ls`, `grep` and tail read paid for them. `ctl archive [--apply] [--list]` MOVES (never deletes) the top-level working files older than 7 days that nothing live references into `archive/<YYYY-MM-DD>/`, writes `INDEX.tsv` (file, mtime, size, original path) and rolls the notes file by rename + a fresh file at the same path (last 40 lines carried, a one-line `# rolled <ts>` header). Dry-run unless `--apply`; refuses `--apply` while a landing is in flight. The lanes root is `CTL_LANES_DIR` (default `/Users/kiro/my_projects/gisik-nokma-lanes`); the clock is `CTL_ARCHIVE_NOW`; the ps command is `CTL_ARCHIVE_PS_CMD` (test seams). `--list` prints one `VERDICT<TAB>name` line per file: `MOVE` or `KEEP:recent|lanes|queue-ref|script-ref|live-ptr|protected|collision`. Known limit: `roles/QUEUE-*.md` lines carry `HH:MM` and no date, so "the last 3 days of the queues" is read as the whole queue files (they began 2026-10-01; later this only over-protects).

Block `13.2000`–`13.2014` (measured 2026-10-03: `task/ctl-postman` owns `13.1900`–`13.1999`; no live tip carries a `13.2xxx` id). Run by `scripts/ctl/test/archive.test.sh`, a `pnpm check:ctl` step, on a SCRATCH lanes root with a fixed clock. Every exclusion case asserts the verdict REASON on a fixture that meets every other move condition, and has a CONTROL (the same file with that one attribute changed is `MOVE`).

- 13.2000 🧪 No flag is a dry-run: exit 0, the files it would move are named, and the lanes tree is byte-identical (no `archive/`, no INDEX, no roll). `--apply` together with `--dry-run` refuses. `CTL_DRY_RUN=0` in the environment does not apply; CONTROL — `--apply` on the same fixture moves the file.
- 13.2001 🧪 Every working-file family moves (`BRIEF-` `PTR-` `MSG-` `NOTE-` `HANDOFF-` `EXEC-` `EXEC<n>-` `pr-` `DISPATCH-` `gate-`) with the same name and the same bytes and the source gone; the file count is conserved; `INDEX.tsv` has one header and a row per file (file, mtime, size, original path) and a second apply the same day appends to it; the plan log agrees with the OK line.
- 13.2002 🧪 The 7-day line: 7 days + 1 hour moves, 7 days − 1 hour is `KEEP:recent` and stays after `--apply`; a file dated in the future is kept.
- 13.2003 🧪 Referenced files stay: a name in any `roles/QUEUE-*.md` (bare, as a path, or with no extension) is `KEEP:queue-ref`; a name in `roles/LANES.md` is `KEEP:lanes`; a name in a lanes-root `*.sh` is `KEEP:script-ref`; matching is by substring of the stem (a mention of `BRIEF-ab.md` also keeps `BRIEF-a.md`, the safe side); each has its unreferenced twin as CONTROL, which moves.
- 13.2004 🧪 A live pointer keeps what it names: a file named only inside a kept (listed or recent) `PTR-`/`BRIEF-`/`HANDOFF-`/`MSG-` is `KEEP:live-ptr`, to a fixed point (PTR → BRIEF → HANDOFF → MSG); CONTROL — named only inside an unlisted old PTR (which itself moves) it moves; a kept `pr-`/`DISPATCH-` file does not chain.
- 13.2005 🧪 Protected names never move: a name containing `STEPS-common`, `CARD`, `ROLES` or `BOOT` (also a family-shaped `PTR-x-CARD.md`) is `KEEP:protected`, and so is `CTL-TO-PLANNER-notes.md`; CONTROL — the same shape without the word moves. Outside the families nothing is touched (`CTL-NOTE-*`, lowercase `dispatch-*`/`msg-*`, `exec-claude.sh`, a `.sh` in a family name, `REVIEW-*`, a name that only contains a family word later).
- 13.2006 🧪 Top level only: old family-named files under `roles/`, `archive/`, `smoothness-2026-10-02/`, `audit-*/` and a nested directory are untouched by `--apply`, `roles/` keeps and gains nothing; a top-level symlink and a directory with a family-shaped name are never moved; CONTROL — the same name at the top level moves.
- 13.2007 🧪 Never overwrite: a new file whose name is already in `archive/<date>/` is `KEEP:collision` and the archive copy keeps its first bytes; a second `--apply` with nothing left is a no-op that exits 0; a destination that appears between the plan and the move (a race) is left alone with a `FAIL` naming it and the source stays.
- 13.2008 🧪 Fail closed: no `roles/LANES.md`, or no `roles/QUEUE-*.md`, or no lanes directory is a `FAIL` (exit 1) with nothing moved or rolled, in `--apply` and in the dry-run; CONTROL — with the file back the same tree applies.
- 13.2009 🧪 The notes roll: the archive file is the ORIGINAL inode (a rename, not a truncate) and byte-identical, the path holds a new inode; the new file is a one-line `# rolled <ts>` header plus exactly the last 40 lines (41 lines); a file under 40 lines carries all of it, and one with no trailing newline keeps its last line; the mode survives, no temp file is left, the roll has an INDEX row; a writer holding the old file open keeps appending to the archive copy and one opening the path afterwards writes the new file; the dry-run does not roll; no notes file is not an error.
- 13.2010 🧪 A running `tail -F` on the notes path keeps following after the roll: a line appended afterwards, and the `# rolled` header, reach it.
- 13.2011 🧪 Once a day: a second roll on the same day does not roll again (inode and archive bytes unchanged, OK line still printed); CONTROL — the next day rolls into `archive/<next day>/` and leaves the first day untouched.
- 13.2012 🧪 No move and no roll while a landing is in flight: a LIVE `ctl gate` marker, or a `land`/`gate`/`tipmerge` verb in `ps` (each of the three, via the verb script and via the `ctl` door; also a real process seen through the real `ps`), refuses `--apply` with exit 1 and nothing changed; CONTROL — a marker naming a dead pid, an unrelated ps line, or none, does not block. The dry-run reports the landing in flight, exits 0 and changes nothing.
- 13.2013 🧪 An unknown argument refuses (exit 1) and changes nothing.
- 13.2014 🧪 Wiring: `ctl help` lists `archive` with its dry-run default; `selftest.sh` runs this suite as a live step (CONTROL — the pattern rejects a commented-out step); the verb deletes nothing (no `rmtree`/`os.remove`/`shutil.move`/`os.rename`, its only two unlinks are the temp file and a moved source after `os.link`); the dispatcher knows the verb.

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
- 13.1430 🟡 Post-deploy App Platform log reading, once this lands and deploys: confirm the fetch layer
  and install step show cache hits, the `dev` stage no longer builds, wall times drop toward the
  13.1428 measurement, and whether the `backup` worker's layers come back CACHED once `server`'s build
  has already primed the registry cache (the two share `apps/server/Dockerfile`). Not yet run — left 🧪
  with this recipe.
  **Reading 2026-09-28 (planner, build log of production deployment 59ccb812 — the notes release, 2026-09-23 21:00Z):** the first build of the new Dockerfiles. `RUN pnpm fetch` had NO cached layer on web, server or backup (3 × "No cached layer found for cmd RUN pnpm fetch"; 5 × "Found cached layer" for earlier layers); backup did not reuse server's layers in the same build. Wall time: web 21:00:41→21:05:21 (4m40s), server 21:00:46→21:04:55 (4m09s). A first build cannot hit a cache for a new step, so this is not yet the verdict: stays 🧪 until the NEXT deploy's build log is read.
  **Reading 2026-10-02 (HK-1, build logs of production deployment bf9c374b, commit 5485384, the first deploy read since 59ccb812: five deploys came between, d97397ad, a0c4c92d, 0e1e0c05, c15fa5d4 and 67b02899 (d66c11e, 2026-10-02 10:10 UTC, the one just before); read with `doctl apps logs 61d94fe7-… <component> --type build --deployment bf9c374b-…`):**
  - **The fetch layer IS cached on web, server and backup (3 of 3).** Each log has `Using caching version of cmd: RUN pnpm fetch` and then, at the `RUN pnpm fetch` step, `Found cached layer, extracting to filesystem` (web 14:02:51, server 13:57:00, backup 13:56:53 UTC). The 59ccb812 reading had `No cached layer found for cmd RUN pnpm fetch` on all three.
  - **`RUN pnpm install --offline --frozen-lockfile` has no cached layer** (`No cached layer found for cmd RUN pnpm install --offline --frozen-lockfile` on all three). That is the design, not a defect: the step follows `COPY . .`, which changes with every commit. It ran in about 5 s after the cached fetch.
  - **The `dev` stage does not build:** two `Building stage 'node:22-alpine'` lines per log (build and runtime), idx 0 and 1.
  - **Wall times did NOT drop, and the cache hit is slower than the same morning's uncached build.** Each wall time is the log's first to last line, each fetch figure runs from the `RUN pnpm fetch` line to the `COPY . .` line, all read from the logs (`--deployment 67b02899-e5e5-4b95-8c43-a4667603f642` for the baseline):

    | Component | Uncached fetch at 67b02899 | Wall time at 67b02899 | Cached fetch at bf9c374b | Wall time at bf9c374b |
    |---|---|---|---|---|
    | web | 10:11:18 → 10:13:13 (115 s) | 10:10:55 → 10:15:11 (4m16s) | 14:02:51 → 14:05:27 (156 s) | 14:02:25 → 14:07:42 (5m17s) |
    | backup | 10:11:25 → 10:13:17 (112 s) | 10:11:01 → 10:15:18 (4m17s) | 13:56:53 → 13:59:29 (156 s) | 13:56:29 → 14:01:47 (5m18s) |
    | server | 10:16:05 → 10:18:40 (155 s) | 10:15:38 → 10:21:05 (5m27s) | 13:57:00 → 13:59:36 (156 s) | 13:56:37 → 14:01:57 (5m20s) |

    All three logs of 67b02899 say `No cached layer found for cmd RUN pnpm fetch`, so 67b02899 is the build that primed the cache bf9c374b hit. On web and backup the cached fetch is about 41 to 44 s slower than the uncached one of that morning and the whole build about a minute slower; on server it is a wash. History, kept: at 59ccb812 (2026-09-23, the first build of the new Dockerfiles) web took 4m40s and server 4m09s, with an uncached server fetch of 114 s (21:01:08 → 21:03:01). kaniko pulls the cached layer from the registry and unpacks it, so on App Platform a cache hit costs about what the fetch itself did.
  - **Backup reusing server's layers is not shown by this pair.** backup (13:56:29) and server (13:56:37) built in parallel, and both hit the cache the previous deploy had primed; neither primed it for the other.
  - Verdict: the cache-hit and no-`dev`-stage parts hold; the wall-time part fails, so the case is 🟡, not ✅. Whether the registry cache is worth keeping (or the fetch layer should be dropped) is an owner or planner call, not made here.

## The gate has two kinds: fresh for `main`, cached for a release branch (`task/gate-speedup`, owner 2026-10-02: *"do the caching and whatever to run the gate faster"*)

Block `13.1700`–`13.1716`, the next free ids after `13.1619` (measured 2026-10-02 with `check-case-ids.mjs`'s declaration regex; no controller block was assigned to this task). `13.1700`–`13.1710` and `13.1712`–`13.1716` are 🧪, **not ✅, on purpose** — same reason as `13.1501`–`13.1512`: they run automatically as arms in `scripts/ctl/test/lib.test.sh` (`13.1700`–`13.1704`, `13.1716`) and `scripts/ctl/test/gate-cache.test.sh` (`13.1705`–`13.1709`, `13.1712`–`13.1715`), both inside `pnpm check:ctl` / `ctl selftest`, but `check-case-citations.mjs` scans only `apps/` and `packages/`. The ones in `scripts/` carry the id in the test name, so grep finds both directions.

- 13.1700 🧪 `gate.sh` — the REAL file, run beside a stub `locked-test.sh` and a stub `pnpm` that records argv — runs `turbo run build test typecheck --force --concurrency=1` for `GATE_MODE=fresh` AND when `GATE_MODE` is unset (a hand-run never picks the weaker mode), and `turbo run build test typecheck --concurrency=1` with no `--force` for `GATE_MODE=cached` (the brief asked for 2; see 13.1710 for why it is 1). Its console states the mode that runs (`GATE_MODE=cached TURBO_FLAGS=--concurrency=1`).
- 13.1701 🧪 CONTROL: an unknown `GATE_MODE` (`fast`) and a set-but-EMPTY one both refuse, exit 2, name the value, and the stub `pnpm` is never invoked (no guessed mode).
- 13.1702 🧪 `ctl gate <sha> --base release/x` is release-kind: its OK line says `mode=cached` and carries `Tasks: 41 successful, 41 total · Cached: N cached, 41 total`. CONTROLS: the default and `--base main` are main-kind, `mode=fresh`.
- 13.1703 🧪 `--dry-run` names the mode it would pass (`DRY: GATE_MODE=cached …` for a release base, `fresh` for main).
- 13.1704 🧪 A `gate.sh` that ran `fresh` when `cached` was asked for FAILS the verb (`asked for cached, gate.sh ran fresh`) and writes no marker; CONTROL: the same script is correct for main-kind.
- 13.1705 🧪 `ui#test`'s turbo task hash (`turbo run test --filter=@gisik-nokma/ui --dry=json`, in a copy of the tree) CHANGES when an `apps/web/src` file changes — the file the ui colour scan polices, the #270 incident's shape. CONTROL: a file it does not read (`docs/lanes/gate-lock/README.md`) leaves the hash alone; reverting restores it.
- 13.1706 🧪 Same for `mobile#test`: a `packages/editor/src/styles/editor.css` change changes the hash; the docs file does not.
- 13.1707 🧪 `mobile#test` depends on `@gisik-nokma/editor#build:webview` (the stale-build root cause: the webview bundle `mobile` embeds was never rebuilt before the test read it). Mutation measured: with `turbo.json` from before this task the arm FAILS.
- 13.1708 🧪 `gate-cache.test.sh --real` (opt-in, minutes; run after editing `turbo.json` `inputs`): in an APFS clone with a private cache, `ui#test` warms (miss), re-runs as a HIT, stays a HIT after a change to a file it does not read, and is a real MISS after an `apps/web/src` edit. Run 2026-10-02: `warm=miss rerun=hit unrelated-change=hit reader-change=miss`.
- 13.1709 🧪 The same, real, for `mobile#test` after a `packages/editor` CSS edit. Run 2026-10-02: `warm=miss rerun=hit unrelated-change=hit reader-change=miss`.
- 13.1710 🧪 Measured wall times of the two kinds on real branches (hand-run through `ctl gate`, 2026-10-02): main-kind fresh **274 s** (0/34 cached); release-kind unchanged tree **66 s** wall (34/34, turbo 0.1 s), CSS-only 93 s (30/34) and server-only 232 s (31/34) on a quiet box at `--concurrency=2`; at the shipped `--concurrency=1` and load average 30–200: server-only 371 s, mixed 335 s, CSS-only 335 s (one CSS run red on 5 s timeouts, see the README table). `--concurrency=2` was dropped after both miss-heavy runs timed out. Left 🧪: hand-run, and the numbers move with the box's load.
- 13.1711 ✅ `packages/ui/test/token-discipline.test.ts`: `ui#test` declares the wildcard readers of the `apps/` and `packages/` listing (`apps/*/test/**`, `packages/*/test/**`, both `package.json` globs) as inputs, and the literal-tree comparison against `CLIENT_SOURCE_ROOTS` ignores them.
- 13.1712 🧪 `tsconfig.base.json` is a `globalDependencies` entry: touching it changes `@gisik-nokma/ui#test`'s hash (any task would do). CONTROL: `docs/lanes/gate-lock/README.md`, read by none of the audited tasks, leaves it alone. Mutation measured 2026-10-02: with `globalDependencies` removed the row FAILS.
- 13.1713 🧪 `@gisik-nokma/app-core#test` (the help suite walks the source trees): a change to `docs/manual.md`, to an `apps/desktop/src` file (under the broad `apps/**` entry only) and to a `packages/mcp-server/src` file (under the broad `packages/**` entry only) each change the hash. CONTROL per row: the README leaves it alone. Mutations measured: dropping `apps/**`+`packages/**` turns the two broad rows RED; dropping `docs/manual.md` turns the manual row RED.
- 13.1714 🧪 `@gisik-nokma/server#test`: a `reference/` file (seed suites), `.env.example` (`config.test.ts`), `apps/web/e2e-stack/helpers/teardown.ts` (`e2e-teardown.test.ts` imports it) and `apps/web/next.config.ts` (`security-middleware.test.ts`) each change the hash although `web` is not a dependency of `server`. CONTROL per row: `CLAUDE.md` (the gate-lock README is itself read via `docs/**`). Mutations measured: dropping each entry turns its own row RED.
- 13.1715 🧪 `@gisik-nokma/editor#test`: a `packages/app-core/src/views` file (read as text) and `packages/ui/test/helpers/css-rules.ts` (imported by four editor tests; `ui` is not a dependency of `editor`) each change the hash. CONTROL per row: the README leaves it alone. Mutations measured: dropping the views entry or the ui helpers entry turns its own row RED. No `packages/ui/test/tsconfig.json` exists, so none is declared.
- 13.1716 🧪 `ctl gate` fails a short run: a fixture gate printing `GATE_MODE=cached …` and `Tasks: 33 successful, 33 total` makes the verb FAIL, naming the Tasks line, for a release-kind and a main-kind run, and a `40 successful, 41 total` run fails too. CONTROL in the same arm: the same fixture at `41 successful, 41 total` passes, so the failure arms fail on the count alone (the count was 34 until G-9 T1 put `workflow-canvas-browser`'s `test` and `typecheck` on the gate, making 36, and 36 until Knowledge Graph C T1 put `knowledge-graph`'s `build`, `test`, `typecheck` and `knowledge-graph-browser`'s `test`, `typecheck` on it, making 41). Mutation measured: loosening `grep -q '41 successful, 41 total'` to `grep -q 'successful'` turns the three failure arms RED and leaves the control green.
- 13.1840 🧪 `ctl gate` accepts a 41-task run: a fixture gate printing `Tasks: 41 successful, 41 total` is OK for a release-kind (`mode=cached`) and a main-kind (`mode=fresh`) run. Why: Knowledge Graph C T1 adds `packages/knowledge-graph` (`build`, `test`, `typecheck`) and `packages/knowledge-graph-browser` (`test`, `typecheck`), so its gate runs 41 of 41 (36 + 5) and the verb said FAIL on the hard-coded count, and the verb that runs is the release tip's (G-9 had the same: 34 → 36; #968's transitional `36 or 41` carried the gap until C T1 landed). `scripts/ctl/verbs/gate.sh` was 41-only from KG C T1's last commit until the WTG `41 or 46` transition (13.2020-13.2024); the 41 arm stays. Mutation measured: narrowing the pattern to 36-only turns 13.1840's two arms RED; loosening it to `grep -q 'successful'` turns every 13.1841/13.1842 arm RED (and three older 13.1716 arms).
- 13.1841 🧪 CONTROL for 13.1840: `40 successful, 40 total` and `42 successful, 42 total` still FAIL naming the Tasks line, and `41 successful, 40 total` too — 41 is accepted by value, not by loosening to any count. 34/34 is in the FAIL set too (13.1843), as is 36/36 (13.1849).
- 13.1842 🧪 CONTROL for 13.1840: a short 41-task run (`40 successful, 41 total`) and a mixed pair (`39 successful, 41 total`, `41 successful, 39 total`) FAIL — the successful and total halves must agree.
- 13.1843 🧪 CONTROL: the gate rejects the old graph — a 34-task run (`34 successful, 34 total`) FAILS the verb, naming the Tasks line, on the merged tip (41-only until the WTG `41 or 46` transition, 13.2020), for a release-kind run. This is the reviewer's control that the old graph is gone. Mutation (own, at the tip merge): loosening `gate.sh`'s pattern to accept `34 successful, 34` too turns this case RED.
- 13.1844 🧪 `ctl gate` accepts a 41-task run in both kinds: a fixture gate printing `Tasks: 41 successful, 41 total` is OK for a release-kind (`mode=cached`) and a main-kind (`mode=fresh`) run (one arm, both kinds). Mutation measured: narrowing the pattern to 36-only turns it RED.
- 13.1845 🧪 CONTROL for 13.1844: `34/34`, `35/35`, `36/36`, `37/37`, `40/40` and `42/42` FAIL naming the Tasks line — the graph is accepted by value, not by a range. Mutation measured: admitting any `N/N` turns every 13.1845 arm RED (and 13.1841's, 13.1843's, 13.1716's).
- 13.1846 🧪 CONTROL for 13.1844: mixed pairs (`36 successful, 41 total`; `41 successful, 36 total`) and a short 41-task run (`40 successful, 41 total`, main-kind) FAIL — successful and total must name the SAME graph.
- 13.1847 🧪 CONTROL for 13.1844: the match is anchored — `141 successful, 41 total` (the accepted count as the tail of a longer one), `41 successful, 410 total` (as the prefix of the total) and `41 successful, 41 total total` (text after `total`) all FAIL. Mutation measured: dropping `^Tasks: +` (a bare substring match) turns the 141 arm RED; dropping ` total *$` (a prefix match) turns the 410 and `total total` arms RED; dropping only the trailing ` *$` turns the `total total` arm RED. Equivalent mutant, measured and left alone: dropping only the `^` (the sed makes the line begin with `Tasks:` anyway).
- 13.1848 🧪 The transitional marker is gone: `gate.sh` carries no `TEMPORARY "36 or 41"` comment and names the 41 graph (the 41-only line until the WTG `41 or 46` transition, 13.2020-13.2024; 13.2025 rewrites this check when the 41 arm goes), so the 36 arm cannot linger. Mutation: restoring the comment turns it RED.
- 13.1849 🧪 The old 36 graph stays rejected: `36 successful, 36 total` FAILS naming the Tasks line for a release-kind and a main-kind run, and 41/41 passes (13.1840, 13.1844). The verb was 41-only from Knowledge Graph C T1's last commit until the WTG `41 or 46` transition (13.2020); the case landed with that commit, ❌ PENDING while the tip accepted both. Mutation measured: re-admitting the 36 arm turns it RED.
- 13.2020 🧪 `ctl gate` accepts a 46-task run: a fixture gate printing `Tasks: 46 successful, 46 total` is OK for a release-kind (`mode=cached`) and a main-kind (`mode=fresh`) run, and 41/41 still passes both. Why: the verb that runs is the PRIMARY checkout's (41-only, 13.1849), but Workflow and Timeline graphs Part 1 T1 adds `packages/viewport` (build, test, typecheck) and `packages/flow-graph-browser` (test, typecheck), so its gate is 46 tasks, and the T1 lane's gate would FAIL the verb whatever its branch (the KG C T1 precedent, `36 or 41`). The verb accepts `41 successful, 41` OR `46 successful, 46` (`scripts/ctl/verbs/gate.sh`, an anchored two-alternative `grep -E`), with a TEMPORARY marker, until T1's last commit pins 46-only. Mutation measured: narrowing the pattern to 41-only turns 13.2020's 46 arms RED.
- 13.2021 🧪 CONTROL for 13.2020: `44/44`, `45/45`, `47/47` and `51/51` still FAIL naming the Tasks line — the two graphs are accepted by value, not by a range between them. Mutation measured: admitting any `N/N` turns every 13.2021 arm RED (and 13.1841's, 13.1843's, 13.1716's).
- 13.2022 🧪 CONTROL for 13.2020: mixed pairs (`41 successful, 46 total`; `46 successful, 41 total`) and a short 46-task run (`45 successful, 46 total`, release-kind and main-kind) FAIL — successful and total must name the SAME graph.
- 13.2023 🧪 CONTROL for 13.2020: the match is anchored on both sides — `146 successful, 46 total` (a longer count ending in an accepted one) and `46 successful, 460 total` (an accepted count as a prefix of the total) FAIL. Mutation measured: dropping the `^Tasks: +` prefix turns the 146 arm RED; dropping the ` total *$` suffix turns the 460 arm RED.
- 13.2024 🧪 The TEMPORARY marker is greppable: `gate.sh` carries `TEMPORARY "41 or 46"` and names WTG Part 1 T1's last commit as the one that pins 46-only, so the removal is not forgotten. Mutation: deleting the comment turns it RED.
- 13.2025 ❌ PENDING (lands with Part 1 T1's last commit, which takes gate.sh's 46-only line): the verb is 46-only — `41 successful, 41 total` FAILS naming the Tasks line for a release-kind and a main-kind run, 46/46 passes, and 13.1840/13.2020's 41 arms flip to FAIL controls. Not covered here: this tip accepts both.

## CI repair: when CI runs, and the failures it had hidden (`task/ci-repair`, owner 2026-10-02: *"check the CI again … CI to be run only on merges to main"*)

Block `13.1720`–`13.1729`, taken whole (the tip across every remote branch was `13.1716`; the block leaves `13.1717`–`13.1719` for a peer). There was not one green run in the 200 before this repair (back to 2026-09-20): every release PR and every push to `main` was red.

- 13.1720 ✅ `ci.yml`'s parsed `on:` holds exactly `pull_request` (branches `[main]`) and `workflow_dispatch` — NO `push`. A push-to-`main` run starts after `deploy_on_push` has begun deploying, so it is a post-mortem; the owner chose the release PR (2026-10-02). CONTROL in the same `describe`: the same reader finds a `push` key in a planted workflow that has one. Mutation measured: re-adding `push: branches: [main]` turns the first arm RED and leaves the control green.
- 13.1721 ✅ No service in `docker-compose.dev.yml` uses `minio/minio` or `minio/mc` (Docker Hub answers "pull access denied" for every tag; it was the `e2e` job's "bring the stack up" failure), and every image carries an exact, non-`latest` tag. CONTROL: the matcher refuses the two removed images and accepts the `ghcr.io/coollabsio/minio` pin. Mutation measured: pointing `minio-init` back at `minio/mc` turns the first arm RED. The pull and the bucket creation themselves were run once on `linux/amd64` (the healthcheck, `mc ready`, answered `The cluster 'h' is ready`); the full `up` is proven by CI's `e2e` job only.
- 13.1722 ✅ No mode-`160000` gitlink is in the index, and `.gitignore` lists `.claude/worktrees/` (a committed gitlink with no `.gitmodules` entry failed `actions/checkout`'s post-job step on every job: `No url found for submodule path '.claude/worktrees/agent-…'`). CONTROL: the same reader finds a gitlink in `ls-files -s` output that has one.
- 13.1723 🧪 `pnpm check:runbook` passes on a checkout with NO build output: `docs/runbook.md` names the container's `/repo/packages/ui/dist/tokens.js`, not the repo-relative `packages/ui/dist/tokens.js` that resolved only where a build had run (it failed in CI, which does not build for that job). Measured 2026-10-02 with `packages/ui/dist` moved aside: the old text reports `1 problem(s)`, the new text `ok`. Run by the `check-runbook` job, green in run 36977866115 (8c8e79dc); kept 🧪 because the check is a script (`scripts/check-runbook-commands.mjs`), not a test file, so `check-case-citations` has nothing to cite it from.
- 13.1724 🧪 `node scripts/check-task-ledger.mjs` exits 0 on this branch: all 506 plan tasks have a ledger row (182 rows backfilled 2026-10-02 from the merged-PR record: `done` where a PR title names the task, `claimed` where a plan- or feature-level PR covers it, `in-flight`/`todo` for `release/prefix-groups-ux` work and the browser passes that are not fully run). The checker's rule is unchanged. A `gh` outage (measured with `GH_TOKEN=bogus`) prints `merged PRs cited by no ledger row: UNKNOWN` and still exits 0, so the CI token's missing `pull-requests` read does not fail the job. Run: `node scripts/check-task-ledger.mjs` → exit 0 at this commit. Run by the `check-tasks` job, green in run 36977866115 (8c8e79dc); kept 🧪 because the check is a script (`scripts/check-task-ledger.mjs`), not a test file, so `check-case-citations` has nothing to cite it from.
- 13.1725 ✅ The `other-tests` job's second web-suite timeout is budgeted, not hidden: `TicketSheet — the transition round-trip > PLANTED DEFECT: the ledger payload is the SHIPPED spelling` took 5249 ms in CI (run 36924505378, a ~102 s file) against the 5000 ms default, so it carries its own `20_000` ms per-test budget, and the file's `settled()` wait takes 4 s instead of `waitFor`'s 1 s default (its first, cold test missed 1 s in run 36968817666); the global `testTimeout` is unchanged (the 18.226 rule) and every assertion in the test is untouched, so it still fails on `{toStateId}`. `packages/app-core/test/views/ticket-sheet.test.tsx` (local: 184 passed). Covered by the `other-tests` job, green in run 36977866115 (8c8e79dc).
- 13.1726 ✅ The `viewport` job's 25 failures were drift against ruled changes, re-pinned rather than loosened: the page gutter is 24 px at every width and the title 22/34 px (U2, case 23.040), and 13.362 reads the track token `--gn-surface-track` (`#e6dcd2`) and the tablist's computed background. `apps/web/e2e-viewport/responsive.spec.ts` (local `playwright.viewport.config.ts`: 41 passed). Re-checked after U-T11 (#910, 2026-10-02) changed the copy: the empty-workspaces sentence reads `No workspaces yet. Ask an admin for an invite link, or create your own.` Covered by the `viewport` job, green in run 36977866115 (8c8e79dc).
- 13.1727 ✅ The dev stack's `server` healthcheck dials `http://127.0.0.1:3000/healthz`, never `localhost`: the server listens on IPv4 only, and on a CI runner the container has an IPv6 loopback, so busybox `wget` resolves `localhost` to `::1` and is refused (run 36970366578: `FailingStreak 40`, `wget: can't connect to remote host: Connection refused`, `e2e` red at "bring the stack up"); Docker Desktop has no `::1`, which hid it on every dev machine. CONTROL: the same reader finds `localhost` in a copy with the old spelling. `apps/server/test/ci/ci-trigger.test.ts`.
- 13.1728 ✅ The `e2e` job builds every `@gisik-nokma/*` package its spec files import before it runs them: the job installs but never builds, and a workspace package resolves to its `dist/`, so once the stack came up the run died with `Cannot find module '…/@gisik-nokma/domain/dist/index.js' imported from …/e2e-stack/smoke.spec.ts` (run 36971568470). Today that is `domain` (`newUlid`). CONTROL: with the build step removed, the reader reports `domain` unbuilt. `apps/server/test/ci/ci-trigger.test.ts`. Proven by the `e2e` job in run 36977866115 (8c8e79dc): the stack came up and the specs ran.
- 13.1729 ✅ The deployed-stack E2E specs match the product they run against (run 36972594038 was the first run to get the stack up: 10 passed, 7 failed). Corrected here and PROVEN by run 36977866115 (8c8e79dc: the `e2e` and `viewport` jobs green): the `Create` button is addressed `exact: true` in `notes-references.spec.ts` / `notes-ticket.spec.ts` (the Notes page also has `Create note`); `smoke.spec.ts` asserts the first VISIBLE `board-column-*` (an empty workflow group rests collapsed, `board.tsx` `defaultCollapsed`); `viewport.spec.ts` opens the "Create workspace" dialog before asserting the founding form's `.gn-field__input`; `tap-target-baseline.json` and `type-scale-baseline.json` carry every route key (recorded 2026-10-02 against the local dev stack, the suite's own `UPDATE_*_BASELINE=1` procedure). The two that were red after that run are resolved separately: the `nav.gn-bottom-bar` 1.12:1 contrast by 13.1730, the `passkey-registration.spec.ts` CI hang by 13.1731. `apps/web/e2e-stack/`.
- 13.1730 ✅ The non-text-contrast roster EXEMPTS exactly one boundary, `nav.gn-bottom-bar` (1.12:1), with the owner's reason verbatim: *"container, not a control; its items carry their own >=3:1 cues (icon, label, current-item bar)"* (owner ruling 2026-10-02; NO visual change). `apps/web/e2e-stack/helpers/contrast-exemptions.ts` (`CONTRAST_EXEMPT`, `splitByExemption`) is what `viewport.spec.ts` asserts through, and the roster JSON lists the exemption beside the sub-3:1 count. CONTROL in the same `describe` (`apps/web/test/contrast-exemptions.test.ts`): a planted `button.planted-low-contrast` at 1.4:1 still fails, and the bar's descendants and lookalikes (`a.gn-bottom-bar__item`, `button.gn-bottom-bar__more`, `nav.gn-bottom-bar.extra`, `div.gn-bottom-bar`, `nav`, `toString`, `constructor`) are not exempt. Mutation measured: matching by `startsWith` turns the descendant arm RED.
- 13.1731 ✅ `passkey-registration.spec.ts` hung to the 90 s test timeout on CI (run 36972594038) and passes in seconds locally. DIAGNOSTICS, gated by `GISIK_E2E_DIAG=1` (set on the CI e2e step only): the spec logs, stamped in seconds, the CDP `WebAuthn.enable`, the `addVirtualAuthenticator` options and returned id, browser console, page errors, failed requests, passkey/auth responses, navigations and credential events, and on failure the URL, the authenticator's credentials and a body-text snippet; every action in the spec has a 20 s budget so the failure names the stalled step; the cleanup no longer replaces the real failure with "Target page, context or browser has been closed". `ci.yml` keeps the server log's passkey/webauthn lines and uploads `apps/web/test-results` (Playwright trace, `retain-on-failure`) on failure. CAUSE (run 36976174333, the first with the trail): NOT WebAuthn. The virtual authenticator, the registration (`credentialAdded`, `verify-registration` 200, rpId `localhost`) and the passkey row all worked in CI; the 20 s budget then named the stalled step, `getByRole('menuitem', { name: /^Sign out .+/ })`. The e2e owner signs up by email with `name: ''`, so the menu item's label is `Sign out ` and its accessible name is `Sign out`, which `.+` after the space never matches; a dev machine's owner had been given a name. The spec now matches `/^Sign out/` (role `menuitem` already excludes the Sessions rows' buttons). The spec also waits for the post-sign-out `/sign-in` before the passkey click (one local run timed out in `waitForURL` after the sign-out click returned immediately; not reproduced in 4 reruns, so the race with the in-flight sign-out is a suspected, unproven cause). PROVEN by the `e2e` job in run 36977866115 (8c8e79dc), all 17 specs passing.
- 13.1732 ❌ The browser-smoke specs in `apps/web/e2e/` (`smoke.spec.ts`, `workflow-builder.spec.ts`) quote the copy U-T11 (#910) shipped. CI runs only `test:e2e:stack` and `test:e2e:viewport`, so no green run vouches for this directory; re-pinned by reading the product source, NOT by running it (it needs its own `pnpm dev` on :3001, which the primary dev stack occupies). Sweep 2026-10-02: 33 getBy/toHave strings checked, 4 fixed: `No issues. This workflow can be published.` (×2, `issues-panel.tsx`), `You can look, but not change anything. Only a workspace owner or admin can change workflows and ticket types.` (`read-only-banner.tsx`), `5 of 8 done, 2 restricted` (`views/rollup-text.ts`). The four absent-control assertions (`toHaveCount(0)`) pass whether or not the string exists. `apps/web/e2e/`.
- 13.1733 ✅ Every `vitest.config.ts` in the repo gives tests a 20 s budget and hooks a 30 s one (`testTimeout` ≥ 20000, `hookTimeout` ≥ 30000; housekeeping HK-7, owner 2026-10-02 "go it", parallel runs kept). Only `apps/server` set 30 000; the other ten ran on vitest's 5 s / 10 s default and ordinary jsdom tests crossed 5 s under load (#898, #918, #923, #937 CI run 37019480109, 3.991/3.992). The per-test literal `20_000` arguments those fixes added are removed (the config gives the same). Control, same `it`: the sweep finds ≥ 11 configs including `apps/server/vitest.config.ts`, and the reader reads `7_000` as 7000 and an unset key as null. Mutation: delete `testTimeout` from one config → red, naming it. `apps/server/test/ci/vitest-timeouts.test.ts`.

## `ctl run-tests` — a machine-wide test semaphore and a ≤ 30-line summary (`task/ctl-run-tests`, owner-approved 2026-10-03, plan #12 + #17)

Why: raw vitest/tsc/build output was 4.4–6.4 M characters of tool results per seat in 18 h, and the "gate only at load < 25" rule plus broadcast gate windows gave starvation (23:22) and a gate started at load 73 (00:05) whose timeouts were swap. `ctl run-tests -- <command>` writes the whole output to a log file, prints at most 30 lines, and takes one of N machine-wide slots (default 2) that open only while memory pressure is normal and the swap-in rate is low; a running `ctl gate` has priority.

Block `13.1750`–`13.1774` (measured 2026-10-03: the §13 high-water was `13.1733` across every `origin/*` head updated in the last 14 days and every local branch; the block is written here in the first minting commit). All twenty-five are **🧪, not ✅, on purpose** — the same reason as `13.1501`–`13.1512`: every one is an arm in `scripts/ctl/test/run-tests.test.sh`, executed by `pnpm check:ctl` / `ctl selftest`, and each check's name starts with its case id, but `scripts/check-case-citations.mjs` reads only `apps/` and `packages/`. Fixtures: PATH stubs for `memory_pressure` / `sysctl` / `vm_stat` that read files, a fake clock file (a sleep advances it and runs a hook), planted slot directories with live or dead pids, and a fixture repo for the gate; `13.1767` and `13.1774` use the real clock and real processes.

- 13.1750 🧪 A passing run: the whole output goes to a log file under `~/.cache/gisik-ctl/run-tests-*.log`, stdout is at most 30 lines and carries the counts, the log path and the exit code, and the last line is `OK run-tests`.
- 13.1751 🧪 A failing vitest run: the first failure's test name and its assertion are in the summary, with both count lines; the last line is `FAIL run-tests`.
- 13.1752 🧪 The exit code is the command's own — 3 stays 3, 0 stays 0, a signal-killed command reports 128+signal — and is printed.
- 13.1753 🧪 Everything after `--` reaches the command untouched, including `--dry-run`, `--repo` and `--label`.
- 13.1754 🧪 A tsc run shows the error count and the first error.
- 13.1755 🧪 ANSI codes and turbo `pkg:task:` prefixes are stripped before parsing and printing.
- 13.1756 🧪 A run with 400 failures still prints at most 30 lines, counts first; the digest script itself never prints more than the MAXLINES it is given.
- 13.1757 🧪 A crash with no test summary keeps its exit code and shows the log tail — the cause text comes from a file, not from the command line, so only the digest's indented tail can satisfy the check; the log FILE holds the command's stderr and no raw line leaks to stdout.
- 13.1758 🧪 Uncontended: the slot exists while the command runs, is gone after, and the queue wait is 0 s; a slot whose holder file names another pid is left alone when this run ends, and so is a slot dir whose holder file has gone (another waiter's claim in progress), with no error line printed.
- 13.1759 🧪 Both slots held: the third run waits (fake time) until one frees, runs, and names `slots` as the reason.
- 13.1760 🧪 The slot count is configurable: a `slots` file in the sem dir, else `CTL_TEST_SLOTS`, else 2; the file wins.
- 13.1761 🧪 Low free memory holds the slot back until it recovers, reason `pressure`.
- 13.1762 🧪 The kernel pressure level gates too (2 and 4 wait, 1 does not), and the probe never passes a simulate flag to `memory_pressure`.
- 13.1763 🧪 A sustained swap-in rate at or over the threshold holds the slot back, reason `swap`; one high window is a blip and does not; a rate under the threshold does not.
- 13.1764 🧪 A running gate has priority: while its marker is live at most `CTL_SEM_GATE_SLOTS` (default 1) slots are held and with 0 none is granted, held slots are untouched, and a gate that starts between the claim and the run makes the verb give the slot back and wait when, counting the claim, more than `CTL_SEM_GATE_SLOTS` slots are held.
- 13.1765 🧪 A stale gate marker (dead pid, or a live pid with another start time) is ignored and removed; a LIVE gate's marker is never reclaimed because the waiter runs under another `TZ` (the start time is read as `LC_ALL=C TZ=UTC0`).
- 13.1766 🧪 Stale slots (dead pid; reused pid) are reclaimed at once; a fresh holder-less slot dir is a claim in progress and is waited for; an old holder-less one is reclaimed; a dead pid whose recorded start time is empty is stale too. A live pid with another start time is the ONLY stale slot in one arm (slot-1 genuinely live: the run starts at once, slot-2 becomes the verb's, slot-1 is untouched; control: both live → waits), and a LIVE holder is never reclaimed because the waiter's `TZ` / locale renders its start time differently.
- 13.1767 🧪 Two real processes racing for one slot, with a stale slot to reclaim, never overlap.
- 13.1768 🧪 The slot is released when the command fails and when the verb is terminated (the verb exits within 12 s of a SIGTERM, not when a 300 s command ends), and the wrapped command AND what it spawned die with the verb (a process-group stop — no orphaned vitest workers).
- 13.1769 🧪 Every run appends its queue wait to `waits.tsv` (time, label, seconds, reason, slots).
- 13.1770 🧪 A queue wait past `CTL_SEM_MAX_WAIT` exits 75, runs nothing and says `no slot after`.
- 13.1771 🧪 `--dry-run` prints the plan, takes no slot, runs nothing, exits 0.
- 13.1772 🧪 `ctl gate` writes its priority marker only around the real gate run (not on `--dry-run`), removes it on green, red and exit, and does it from `verbs/gate.sh` (the gate-lock scripts are untouched).
- 13.1773 🧪 `ctl help` lists `run-tests`, and `ctl selftest` runs the suite and a `run-tests --dry-run` step.
- 13.1774 🧪 The real thing: two parallel runs overlap and a third waits at least 2 s for one of them to finish and logs that wait.
- 13.1850 🧪 The wrapped command runs in the caller's directory — from a subdirectory with no `--repo`, `pwd -P` is that subdirectory; with `--repo W` it is `W` — and the summary's first line, the log header and the `--dry-run` line name it. (Minted 2026-10-03 for FIX 1 outside the full `13.1750`–`13.1774` block and tipmerge's `13.1775`–`13.1799`: the §13 high-water was `13.1843` (`release/smoothness`), across every `origin/*` head and local branch updated in the last 4 days. 🧪 for the same reason as the block.)

Block `13.2230`–`13.2239` for `task/ctl-sem-gate-slot` (planner 2026-10-04, process log P25: one slot during a gate, `CTL_SEM_GATE_SLOTS`; measured 2026-10-04: the §13 high-water was `13.2229` (`task/ctl-mutate`) across the KG / WG release tips, every `origin/task/ctl-*`, `kg-*`, `wg-*` head and the local task branches; `13.2236`–`13.2239` are unused). 🧪 for the same reason as the block above: arms in `scripts/ctl/test/run-tests.test.sh`, each check's name starting with its id.

- 13.2230 🧪 A gate is live and no slot is held: one new run is granted at once (the marker present while it ran); a SECOND run started while the first holds its slot waits, reason `gate`, until the gate ends — the second decides. A stale (dead-pid) holder is not a held slot: one stale holder plus a live gate is granted at 0 s, because the count runs after the reclaim; a dir a reclaimer moved aside (`slot-<n>.stale.<pid>`) and a fresh holder-less dir (a claim in progress) are not held slots either.
- 13.2231 🧪 A gate is live with one slot held: a new run waits (reason `gate`) though another slot is free; when that holder exits it is granted while the gate is still live.
- 13.2232 🧪 `CTL_SEM_GATE_SLOTS=0` is the old rule: with no slot held nothing is granted while the gate is live (reason `gate`); CONTROL — the same fixture at the default is granted at 0 s.
- 13.2233 🧪 A gate that starts between the probe and the claim: with one slot already held the claimed slot is given back and the run waits (reason `gate`); with none held the claim is kept and the run starts while the gate is live.
- 13.2234 🧪 Under the cap the probes still bind during a gate: low free memory waits (reason `pressure`) and a sustained swap-in waits (reason `swap`), never reason `gate`.
- 13.2235 🧪 `ctl run-tests --dry-run` names the cap: `at least N slot(s) are held (CTL_SEM_GATE_SLOTS)` with 1 by default, the set value for 0 and 3, and 1 for a value that is not a number.

Block `13.2270`–`13.2279` for `task/ctl-sem-gate-slots-file` (planner 2026-10-04, P31: the gate cap from a file so the owner can retune it without restarting the lanes; measured 2026-10-04: `13.2270`–`13.2279` unused across the KG / WG release tips; `13.2277`–`13.2279` are unused). 🧪 as above: arms in `scripts/ctl/test/run-tests.test.sh`, each check's name starting with its id.

- 13.2270 🧪 The `gate-slots` file in the semaphore dir sets the gate cap when `CTL_SEM_GATE_SLOTS` is unset: file `2` (or `  2  `, whitespace trimmed) with one slot held and a live gate is granted at once; CONTROL — the same state with file `1` waits (reason `gate`) until the holder exits. The marker globs are `gate-[0-9]*`, so the file is never reclaimed as a stale gate marker.
- 13.2271 🧪 The env wins over the file: `CTL_SEM_GATE_SLOTS=0` with file `3` and a live gate grants nothing; a non-numeric env (`abc`) falls through to the file (abc with file `0` and none held waits like 0).
- 13.2272 🧪 A file that is not a number (`abc`) or is empty behaves as 1, never 0: none held and a live gate is granted, one held waits (reason `gate`).
- 13.2273 🧪 File `0` is a valid cap: nothing is granted while the gate is live; CONTROL — file `1` with the same state is granted at once.
- 13.2274 🧪 The file is re-read on every poll: rewritten from 1 to 2 while a run waits behind one held slot and a live gate, that run is granted at the next poll with no restart.
- 13.2275 🧪 `ctl run-tests --dry-run` names the cap from the file: file `3` names 3, env `0` over file `3` names 0, file `abc` names 1.
- 13.2276 🧪 No `gate-slots` file (the normal state) prints no read error: with `CTL_SEM_GATE_SLOTS` unset, one slot held and a live gate, the run waits (reason `gate`) until the holder exits and its `2>&1` output holds no `No such file` line on any poll; `--dry-run` holds none either. CONTROL — the same output carries the `queue wait: 20s (waited for: gate)` line (and the dry-run names cap 1), so an empty capture cannot pass.

## Playwright ports: the gate on 3291 / 3292, every other browser run on a free port (`task/ctl-pw-ports`, planner P35 2026-10-05: gates #1 and #2 went RED on "localhost:3191 already used")

- 13.2280 🧪 `ctl gate` exports `KG_PW_PORT=3291` and `FG_PW_PORT=3292`: its `--dry-run` line names both, the REAL gate run's environment (what `gate.sh`, and so turbo, starts with) carries them, and a port the caller exported (3191 / 3192) does not leak in
- 13.2281 🧪 Two CONCURRENT `ctl run-tests` of a Playwright command (two slots) get four DIFFERENT ports (a KG port is not the other run's FG port either), all inside the range, never 3191 / 3291 / 3192 / 3292; a `--dry-run` names ports inside the range and a command with no Playwright in it names none; each trigger alone (the word `playwright`, `turbo`, a `*-graph-browser` package in the command or as the directory) is enough, read from the WHOLE command: a command longer than the 120-character display whose `playwright` falls after the cut still names ports (CONTROL: its shown line is cut and the same command without the word names none). (A dry-run holds no slot, so two dry-runs cannot reserve against each other: the concurrency leg uses real runs.)
- 13.2282 🧪 A HELD port is skipped (CONTROL: with nothing held a lone run gets the range's first two ports): with the range's first port listened on (on `::1`, on `127.0.0.1`, and on the WILDCARD `0.0.0.0` and `::` — a server started with no host — one run each) the run gets KG >= base+1 and another FG, and its `--dry-run` names base+1
- 13.2283 🧪 A `KG_PW_PORT` the caller exported is kept, and so is a `FG_PW_PORT` (the other port still picked in the range); a command naming neither Playwright, a `*-graph-browser` package nor turbo runs with its environment untouched (CONTROL for 13.2281)
- 13.2284 🧪 The summary prints `ports: KG_PW_PORT=… FG_PW_PORT=…` right after the queue wait, and the log header records them
- 13.2285 🧪 With fewer than two free ports in the range (`CTL_PW_PORT_COUNT=1`) the run FAILS (`FAIL run-tests <label> no free Playwright ports — nothing was run`, rc 1) and the command is not run; its `--dry-run` fails too
- 13.2286 🧪 turbo's strict env mode would drop the gate's port: `turbo run test --filter=@gisik-nokma/knowledge-graph-browser --dry=json` lists `KG_PW_PORT` as a pass-through variable of that task, and the task hash is identical under two different ports (a pass-through is not hashed; an `env` entry would split the cache per port)
- 13.2294 ✅ `pnpm check:env` passes on the tree with the Playwright port variables documented (`KG_PW_PORT`, `FG_PW_PORT` as commented optional lines in `.env.example`) (CONTROL: the same run against a copy of `.env.example` without the `# KG_PW_PORT=` line fails, rc 1, naming `KG_PW_PORT`) — `apps/server/test/deploy/check-env-example.test.ts`
- 13.2295 ✅ A Playwright `*.spec.ts` whose test title reads `'x; CONTROL: 1'` is not scanned by `check:env` (no `CONTROL` reported; D3 reads titles as config keys) (CONTROL: the same text in a non-test `.ts` file IS reported, rc 1, proving D3 still runs, and in a source file whose name merely contains `spec`/`test`, e.g. `inspector.ts`, `latest.ts`, `a.specific.ts`) — `apps/server/test/deploy/check-env-example.test.ts`

## `ctl post` / `inbox` / `ack` / `postman` — the postman: ledger, inbox files, ack/redelivery, the QUEUE-dispatch bridge (`task/ctl-postman`, owner-approved 2026-10-03, plan #1 + #2 + B2 + B6)

Why: inter-seat messages were `tmux send-keys` pastes and regex-filtered `tail -n0 -F` monitors, which lose lines at every 30-minute expiry, are eaten by copy mode, pick option 1 of a permission prompt, and leave a FIX written to QUEUE-gate but never delivered (mechanisms a–g of `PLAN-efficiency-robustness-2026-10-03.md`); a Claude seat (the dispatcher, $89/week) did the relaying. Design: `docs/superpowers/specs/2026-10-03-ctl-postman-design.md` (planner ack 2026-10-03 06:37 with amendments A–C: shadow mode ≥ 20 deliveries AND one gate cycle with zero misses; `postman audit` and the planner-target page → ⚑ notes line are part of the MVP; `pane_state` refuses a menu, copy-mode and non-empty box text, each with its control in the same check).

Block `13.1900`–`13.1999` (measured 2026-10-03: the §13 high-water was `13.1843` — `task/ctl-run-tests` owns `13.1751`–`13.1773`, `task/ctl-seats` `13.1800`–`13.1829` — across every `origin/*` head of the last 36 h, `13.9999` being the plan sentinel). Run by `scripts/ctl/test/postman.test.sh`, a `pnpm check:ctl` step; every case runs on a SCRATCH tmux session (`ctlpm-<pid>`) with fake panes (`scripts/ctl/test/fakeseat.sh`), a scratch ledger root, a scratch notes file and a fake clock (`CTL_POSTMAN_NOW`) — it can never reach a live seat, and `13.1952` proves the daemon refuses a live/scratch mismatch. `13.1981`–`13.1987` are FIX 1 of reviewer B's review; `13.1988`–`13.1991` are FIX 2 (the on-demand audit's same-branch bound, its midnight rollover and its needs-tip key, and `ctl restart`'s three barriers: the cases reach it only through a PATH-front tmux shim that logs every write, `CTL_DRY_RUN=1` next to `--dry-run`, and `restart.sh`'s own guard that refuses a live restart while `CTL_TMUX_SESSION` is not `gisik`; the windows sit at indices 91–98, which no live session has).

- 13.1900 🧪 post: one ledger line with exactly the schema fields; summary names the id
- 13.1901 🧪 post: 20 parallel posts → ids 1..20 unique, every line valid JSON
- 13.1902 🧪 post --text: the body is a spooled file holding the text
- 13.1903 🧪 post: a missing --body file, no body and both body forms are refused, nothing appended; CONTROL: a valid post is accepted
- 13.1904 🧪 post: a bad seat name, a bad kind and a missing --from are refused; CONTROL: a valid post is accepted
- 13.1905 🧪 post: a bare window number resolves to the window NAME; orch aliases main
- 13.1906 🧪 post --reply-to: replying acks the replied-to id for the poster
- 13.1907 🧪 post --dry-run: appends nothing, prints a DRY line
- 13.1910 🧪 ack: a second ack is OK 'already acked', exit 0, the ack file is untouched
- 13.1911 🧪 ack: the wrong seat is refused (exit 1, no ack file); the addressee succeeds
- 13.1912 🧪 ack: an unknown id exits 1
- 13.1913 🧪 ack --cancel: any seat can close a message; the ack records cancelled and the note
- 13.1914 🧪 inbox: lists only MY unacked messages, oldest first; --all adds acked
- 13.1920 🧪 watch: a kill between reading and emitting loses nothing — the line is replayed, the cursor moves only after the emit
- 13.1921 🧪 watch: a MISSING cursor starts at 0 and prints only the still-unacked ids
- 13.1922 🧪 watch: starting a second watcher for the seat stops the old one by its exact pid and takes over
- 13.1923 🧪 watch: a file that shrinks below the cursor restarts at 0 (acked ids skipped, new ones shown)
- 13.1924 🧪 watch: the heartbeat file is touched on every poll
- 13.1930 🧪 bridge: a FIX / NEXT / MERGETIP queue line becomes ONE note to main (from queue; laneN accepted; ref from the line or the brief) — `needs ctl restart` for FIX/NEXT, `needs ctl tipmerge` for MERGETIP — and NOTHING is pasted into any lane (planner ruling 2026-10-04 02:08); CONTROL in the same check: a manual `ctl post` of a fix IS pasted
- 13.1931 🧪 bridge: the first run starts at EOF — history is never reposted
- 13.1932 🧪 bridge: the same line seen twice (a reset cursor) makes ONE note (src dedupe); CONTROL in the same check: a different line makes a second
- 13.1933 🧪 bridge: an unparsable line (missing brief, target orchestrator or a branch, a MERGETIP without a release base) is never dropped — one `could not route` note to main quoting it each; CONTROL in the same check: FIX 6 / FIX 7 parse and make ordinary notes; nothing reaches a lane
- 13.1934 🧪 bridge: a line addressed to a window that is not an exec lane (3 = reviewerA here) reaches no pane — notes only; CONTROL in the same check: a manual post to that window IS pasted (the pane tier is alive)
- 13.1935 🧪 bridge: TOOK/DONE/NOTE/HOLD are ignored by name; CLOSE sends no lane message, only a note to main
- 13.1936 🧪 bridge: with the pane tier ON a handled line gets a DONE line written back into QUEUE-dispatch.md naming the message (13.1981: never in the shadow run)
- 13.1940 🧪 deliver: the message reaches the inbox file first (one line) and the state records the time; no window → nothing else
- 13.1941 🧪 watched + idle: no pane paste inside the 120 s grace
- 13.1942 🧪 watched + BUSY: no pane paste at all (the Monitor line is already queued in the session)
- 13.1943 🧪 unwatched seat (every lane): the pane pointer goes at once, one line, carrying the id and the ack command
- 13.1944 🧪 a PROVEN delivery is not re-pasted before 15 min (the seat has it, it is busy)
- 13.1945 🧪 ack stops redelivery: nothing more is pasted after the ack, however late
- 13.1946 🧪 one open message per seat, in id order: the second waits; its inbox line appears only after the first is acked
- 13.1947 🧪 backoff ladder: an unproven seat is re-pointed at +3, +10, +20 min and paged (once) after the 4th try
- 13.1948 🧪 page chain: an unreachable main pages the planner (inbox) and the page is flagged into the notes file as exactly ONE ⚑ line when it is delivered (the next pass) — a second write beside the page is red (mutant N10)
- 13.1949 🧪 lost body: bounced — a bounce message goes back to the sender, nothing is delivered
- 13.1950 🧪 crash between writing the attempt and the paste: nothing typed, ledger intact
- 13.1951 🧪 a second daemon is refused while the first pid is alive
- 13.1952 🧪 live/scratch guard: the live session with a scratch root, and a scratch session with the live root, are both refused before anything runs (both halves run `postman once --dry-run`: the guard precedes the dry-run exit, and a guard-removal mutant only prints DRY)
- 13.1953 🧪 restart supersedes: a message posted BEFORE the restart is cancelled-by-restart with ONE note to main listing its id; one posted AFTER is kept
- 13.1954 🧪 planner seat: never a pane paste (inbox only); the message is flagged ONCE when delivered (a ⚑ line at once, not repeated by later passes); unacked 30 min → exactly ONE more ⚑ line, the reminder
- 13.1955 🧪 audit: inside the grace nothing is reported (the FIX may still be coming)
- 13.1960 🧪 pane_state menu: a permission/option menu is refused (a pasted Enter would pick option 1); CONTROL in the same check: an idle pane is pasted
- 13.1961 🧪 pane_state text: a box holding foreign text is never cleared or pasted over; CONTROL in the same check: an idle pane is pasted
- 13.1962 🧪 pane_state copy-mode: nothing typed while in copy mode; after 180 s cancelled once and delivered; CONTROL in the same check: an idle (not copy-mode) pane is pasted at once
- 13.1963 🧪 pane_state not-claude: with the DEFAULT allowlist a bash pane is never typed into; CONTROL: the same pane under a regex that allows bash is pasted
- 13.1964 🧪 pane_state not-claude: a less pane (not a shell, still not claude) is refused — the guard is an allowlist; CONTROL: an idle pane is pasted
- 13.1965 🧪 pane_state ours: our own unsubmitted pointer in the box is SUBMITTED, not pasted a second time (exactly one copy reaches the seat)
- 13.1966 🧪 busy seat: the pointer is pasted once (it queues) and not again inside 15 min
- 13.1967 🧪 no window: exec1 absent while exec11 exists — the prefix is NOT matched (exact name), nothing typed into exec11, the message stays open
- 13.1968 🧪 kind note: delivered to the inbox only, never pasted into a pane, never blocks the head of the queue
- 13.1969 🧪 lib ctl_cmd_is_claude: the version string, claude and node pass; zsh bash less vim python3 ssh fail
- 13.1970 🧪 watched + idle: after 120 s without an ack the pane pointer is pasted ONCE
- 13.1971 🧪 …and is re-pointed after 15 min of silence
- 13.1972 🧪 …the page is not repeated while the message stays open
- 13.1973 🧪 …the attempt repeats after the backoff (at-least-once) with the SAME id, once
- 13.1974 🧪 …but a stale pidfile (dead pid) is taken over
- 13.1975 🧪 audit: after the grace an undelivered FIX and an undelivered needs-tip each get ONE note to main; READY lines are not audited
- 13.1976 🧪 audit: not reported twice
- 13.1977 🧪 audit: a delivered FIX (a fix message with that ref) satisfies it — no note
- 13.1978 🧪 ctl postman audit (on demand) exits 1 and names the unmatched line; CONTROL: exit 0 once a fix message with that ref exists, and on an empty queue
- 13.1979 🧪 watch: a pidfile whose pid is NOT a watcher for that seat is never signalled
- 13.1980 🧪 page by AGE: a seat that has the pointer (proven) but never acks is not paged at 17 min and is paged once at 33 min
- 13.1981 🧪 pane tier off (CTL_POSTMAN_PANE=0): the bridge posts its notes but writes NO DONE line into QUEUE-dispatch.md — the dispatcher's open line stays open; CONTROL in the same check: pane tier on → a DONE line for the handled AND for the refused line
- 13.1982 🧪 audit matches THIS verdict: FIX 1's message 35 min before a FIX 2 verdict does not satisfy it — exactly ONE note after the grace; CONTROL in the same check: a FIX 2 message posted after the verdict → no note
- 13.1983 🧪 ctl postman audit (on demand) applies the same window: FIX 1's message does not satisfy a FIX 2 verdict 35 min later (exit 1, names it); a FIX 2 message after it does (exit 0); with a FIX 1 and a FIX 2 verdict and only FIX 2's message, exactly the FIX 1 verdict is named
- 13.1984 🧪 ack re-check: a seat that acks between pane_state and the paste is never typed into; CONTROL in the same check: without that ack the pointer is pasted
- 13.1985 🧪 ctl restart --dry-run: the window keeps its NAME and the supersede marker is called for it (window 91 = reviewerB → -n reviewerB, never exec91); CONTROL in the same check: window 94 = exec4 and an absent window falls back to exec<N>; nothing is written and the tmux shim logged no write
- 13.1986 🧪 ctl restart: a supersede marker that cannot be written prints a WARN (not silent) and the restart still proceeds; CONTROL in the same check: a valid seat name prints no WARN; the tmux shim logged no write
- 13.1987 🧪 pane_state no prompt: a screen with NO ❯ at all (a dialog, a full-screen view) is refused as menu and nothing is typed; CONTROL in the same check: an idle pane is pasted
- 13.1988 🧪 `ctl postman audit` (on demand): a verdict's window ends at the next verdict of the SAME branch, not of any branch — task/a's message posted after task/b's verdict still satisfies task/a (task/b is named); CONTROL in the same check: with no task/a message, task/a IS named
- 13.1989 🧪 `ctl postman audit` (on demand) across midnight: a 23:50 verdict followed by a 00:10 line, read at 00:20 the next day, is dated yesterday, so task/m's 23:55 message satisfies it (exit 0); CONTROL in the same check: with no message task/m is named (exit 1)
- 13.1990 🧪 `ctl postman audit` (on demand): a `needs-tip` verdict is satisfied by a `mergetip` message with that ref; CONTROL in the same check: a `fix` message with that ref does not (exit 1, named)
- 13.1991 🧪 `ctl restart` whose dry-run exit is REMOVED (a stripped copy of the ctl tree) reaches no tmux write: the `CTL_TMUX_SESSION` guard refuses it (rc ≠ 0, "a live restart refuses it"), the tmux shim log is empty and `tmux list-panes -a` (names and pids) is identical before and after; CONTROL in the same check: the shim logs a write it is handed (a forward-everything shim is red), still forwards `list-windows`, and the unmodified `restart --dry-run` prints `DRY: mark … restarted` and `OK restart`
- 13.2040 🧪 a message TO THE PLANNER is a ⚑ line in the notes file — one per message, its text carried, repeated passes add none — and never a pane paste; CONTROL in the same check: the message to exec3 in the same passes is pasted and flagged nowhere
- 13.2041 🧪 `ctl postman run/once/status/audit/restarted` refuse an unknown flag (exit 1, nothing ran); CONTROL in the same check: the same subcommands with `--dry-run` are accepted
- 13.2042 🧪 a MERGETIP queue line that arrives AFTER its lane was restarted produces only the note to main (`ctl tipmerge`) — nothing is pasted into the new session; CONTROL in the same check: a manual mergetip message to the same lane IS pasted
- 13.2043 🧪 `--shadow` computes every delivery and writes nothing a seat can see: no tmux write (a PATH-front shim logs every non-read subcommand), no pane line, no inbox file, no notes line, no DONE write-back, no ledger line; the shadow log holds the queue line, the manual fix (channel pane, would paste) and the planner question (channel flag); CONTROL in the same check: the same passes without `--shadow` reach the shim with a load-buffer, create the inbox and write a ⚑ line
- 13.2044 🧪 `--shadow` logs ONE record per message however many passes ran (four passes over the backoff ladder and a reset QUEUE cursor add none); CONTROL in the same check: a new queue line adds exactly one
- 13.2045 🧪 `--shadow` and the planner: a message to the planner is logged as channel flag and writes NO notes line; CONTROL in the same check: the next live pass writes exactly ONE ⚑ line for it
- 13.2046 🧪 `run --shadow` exits 0 after its passes and leaves no daemon pid; messages in the ledger at the first shadow pass are baseline, never replayed; CONTROL in the same check: a message posted after it is logged
- 13.2047 🧪 `audit --parity`, clean window: every dispatcher delivery pairs with a shadow delivery (parity-ref: each record carries a brief or branch and each dispatcher line its ref before the verb, `dispatcher: delivered x FIX 1 pointer to lane2`, so the pairs agree) → matched=2 missed=0 duplicate=0, and condition A (MATCHED >= 20) fails: `CONDITION A FAIL: matched 2 < 20`, exit 2; CONTROL in the same check: an unpaired dispatcher delivery exits 1, MISSED
- 13.2048 🧪 `audit --parity`, MISSED: a delivery the bridge refused is named with the bridge's reason, exit 1 (parity-ref: each record carries a brief or branch and each dispatcher line its ref before the verb, `dispatcher: delivered x FIX 1 pointer to lane2`, so the pairs agree); CONTROL in the same check: without it exit 2 (no miss; condition A not met)
- 13.2049 🧪 `audit --parity`, DUPLICATE: the same QUEUE line recorded twice is a duplicate, exit 1; CONTROL in the same check: distinct srcs, each delivery naming its own record before the verb, pair cleanly (matched=2 unpaired=0; exit 2: no duplicate; condition A not met)
- 13.2050 🧪 `audit --parity`, ledger leg: two ledger messages to one seat with the same kind and body within 10 min are a DUPLICATE, a ledger message the shadow run never recorded is MISSED (both exit 1); CONTROL in the same check: distinct bodies, each recorded (exit 2: no miss or duplicate; condition A not met) — printed as 2 ledger records BESIDE the queue count (0) as information, never counted: `CONDITION A FAIL: matched 0 < 20`
- 13.2051 🧪 `audit --parity`, EXTRA (parity-ref: each record carries a brief or branch and each dispatcher line its ref before the verb, `dispatcher: delivered x FIX 1 pointer to lane2`, so the pairs agree): a shadow delivery the dispatcher never logged is listed (with no derivable reason: `reason=?`) and is no miss (exit 2, not 1); CONTROL in the same check: an extra never hides a miss
- 13.2052 🧪 audit windows (parity-ref: each record carries a brief or branch and each dispatcher line its ref before the verb, `dispatcher: delivered x FIX 1 pointer to lane2`, so the pairs agree): `--window 2` (the last 2 QUEUE deliveries) and `--since T` leave an old miss outside the window (exit 2: parity clean, and `CONDITION A FAIL: matched 2 < 20` — the condition counts MATCHED; the queue-delivery count and the ledger records are printed beside it as information); CONTROL in the same check: `--parity` over the whole log exits 1; `--since` with `--window`, `--window 0` and an unreadable time are refused
- 13.2053 🧪 DISPATCH-log grammar over real line shapes: `FIX 2 … delivered to lane 2; FIX 3 skipped`, `MERGETIP lane 2 + FIX lane 4 … delivered`, `delivered G-3 MERGETIP (…) to lane 5` and the exact `DELIVERED FIX 3` form each give their deliveries, none MISSED (exit 2: parity clean, condition A not met) — parity-ref: only `delivered G-3 MERGETIP` names its task before the verb and pairs (MATCHED `ref=g-3 ~ task/sm2-g-3`); the other four are UNPAIRED `ref=(none) reason=no-ref` naming their verb + lane (FIX 2, MERGETIP 2, FIX 4, FIX 3), with the NOTE on the 10-03 format boundary; HOLD / not delivered / nothing delivered / HELD give none; CONTROL in the same check: a line that names a verb and says sent but pairs nothing is printed UNPARSED
- 13.2054 🧪 plain `ctl postman audit` (no window flag) stays the mechanism-g sweep and ignores the shadow log; CONTROL in the same check: `--parity` over the same files exits 1, and with no shadow log it refuses
- 13.2055 🧪 end to end: a real `--shadow` pass over a QUEUE-dispatch FIX 2 and the dispatcher's DISPATCH-log line for it audit as matched=1 missed=0 (exit 2: condition A not met); CONTROL in the same check: the same log line for FIX 3 (no queue line) is MISSED
- 13.2056 🧪 `--shadow` runs no restart supersede (mutant N2): a restart marker for exec3 and an open message to it posted before the marker, then a `--shadow` pass → no ack file, the message stays open, the marker stays, no note, no tmux write; CONTROL in the same check: the next live pass cancels it (ack marked cancelled, marker consumed, one note to main)
- 13.2057 🧪 mechanism g counts a BRIDGED queue note (mutant N11): a reviewer `DONE … FIX task/foo-bar` verdict plus the bridge's `FIX 4 …` note with ref task/foo-bar → no audit note after the grace, on-demand `ctl postman audit` exits 0; CONTROL in the same check: a bridged FIX note for another branch, and a bridged MERGETIP note for the same branch, leave the verdict unmatched (an audit note, exit 1, named)
- 13.2058 🧪 end to end, a REFUSED line (mutant N14): a QUEUE-dispatch FIX 4 with a missing brief through a real `--shadow` pass, plus the dispatcher's delivery of it → MISSED naming the bridge's reason (`brief file … not found`), exit 1; CONTROL in the same check: the same line with an existing brief → matched=1 (exit 2: condition A not met)
- 13.2059 🧪 DISPATCH-log grammar, a fix ROUND is not the LANE (F1 i): the real lines `delivered T9 FIX 1 pointer to lane3`, `delivered G-3 FIX 1 pointer to lane5`, `T4 FIX 1 delivered to lane 5 (…)`, `T10 FIX 2 delivered to lane 1 (…)` and, lane before the verb, `lane4 F-5 FIX 1 delivered once (…)` pair with shadow FIX records for lanes 3, 5, 5, 1, 4 that carry the matching briefs (t9, g-3, t4, t10, f-5; matched=5 unpaired=0, exit 2: condition A not met); CONTROL in the same check: against shadow records for the round numbers 1, 1, 1, 2, 1 four stay MISSED, and the lane-1 line finds lane-1 records but not its t10 one (on lane 2): UNPAIRED `ref=t10 reason=ref-mismatch` (matched=0 missed=4 extra=5 unpaired=1, exit 1)
- 13.2070 🧪 DISPATCH-log grammar, sentences (F1 ii): the real 04:40 line `FIX 4 (…) delivered, acked. NEXT 1 U-T9 still waits behind lane 1's …` yields only (FIX, 4) — a sentence end splits clauses; CONTROL in the same check: a real delivered second sentence / clause still pairs (`MERGETIP lane1 … delivered (FIX 1 already DONE …); … MERGETIP lane5 … delivered` → MERGETIP 1 and 5, the `FIX 1 already DONE` no delivery; `… (REVIEW by lane 1); T5 FIX 1 delivered to lane 2` → FIX 2; `lane1 T4 MERGETIP (…) delivered once, folded into FIX 1` → only MERGETIP 1), none MISSED and no NEXT 1 (exit 2: condition A not met) — parity-ref: `T5 FIX 1` and `lane1 T4 MERGETIP` name their task before the verb and pair (MATCHED `ref=t5`, `ref=t4`), while `FIX 4 (…)`, `MERGETIP lane1 task/…` and `MERGETIP lane5 task/…` name it after the verb: UNPAIRED `no-ref` (matched=2 extra=3 unpaired=3)
- 13.2071 🧪 DISPATCH-log grammar, several deliveries in a line and the orchestrator's (F1 iii): the real 06:33 line `delivered 06:32 NEXT 4 (…), MERGETIP 5, MERGETIP 1, NEXT 2 (…); lane 3 still waits …` gives exactly its four (verb, lane) deliveries — parity-ref: each UNPAIRED, NEXT 4 (`ref=891-p-t8-landed-031c800c-06-32`) and MERGETIP 5 (`ref=4-u-t4-u-t5`) `ref-mismatch`, MERGETIP 1 (`ref=5`) and NEXT 2 (`ref=1`) `no-ref` (no letter); the real `ACK T8 FIX 1 delivered by orchestrator (lane 4)` is NOT a dispatcher delivery — listed BY-ORCH; its shadow FIX 4 record has no brief and no branch (an empty ref), so it agrees with nothing and stays EXTRA with `reason=?` (`CONDITION A FAIL: matched 0 < 20; unpaired 4 (ref-mismatch 2, no-ref 2); 5 EXTRA without a reason`, exit 2); CONTROL in the same check: the same ACK text without `by orchestrator`, against a FIX 4 record for `BRIEF-t8-member-admin-fix-1.md`, is a dispatcher pair (MATCHED `ref=t8`, by_orchestrator=0); and the real 05:58 `ACK ctl-run-tests FIX 1 delivered by orchestrator (lane 2); hold closed` AGREES with a shadow FIX 2 record whose brief is `BRIEF-ctl-run-tests-fix-1.md` (MATCHED `= BY-ORCH`, agreed=1)
- 13.2072 🧪 condition A counts MATCHED, never deliveries (planner ruling 09:03, FIX 2 i): a window of 25 shadow queue deliveries, each held (a `HOLD T<k> FIX 1 (not delivered; …)` line of the real 07:00 shape names it), with 0 matches → `CONDITION A FAIL: matched 0 < 20` as its only clause and exit 2; CONTROL in the same check: the same window plus 20 agreeing BY-ORCH acks (`ACK T<k> FIX 1 delivered by orchestrator (lane N)`) → `CONDITION A PASS` (the other 5 EXTRA `reason=held`), exit 0; 19 acks → `matched 19 < 20`, exit 2
- 13.2073 🧪 a BY-ORCH agreement needs verb + lane + ref (FIX 2 ii): the real 05:58 `ACK ctl-run-tests FIX 1 delivered by orchestrator (lane 2); hold closed` agrees with a shadow FIX 2 record for `BRIEF-ctl-run-tests-fix-1.md` (MATCHED `= BY-ORCH`, agreed=1 — the CONTROL); one field off agrees with nothing: the verb (MERGETIP 2), the lane (the real queue line's lane 5 — EXTRA `reason=held`: the real 05:58 QUEUE-dispatch HOLD names it, and so does the ack's own `hold closed`), the ref (`BRIEF-ctl-seats-fix-1.md`); and the real `ACK batch-6 FIX 3 delivered by orchestrator; hold closed` names no lane (the 3 is the fix round) and agrees with nothing
- 13.2074 🧪 the ref rule and the pairing window: the real `ACK G-9 T1 FIX 1 delivered by orchestrator (lane 7); …` agrees with `BRIEF-g9-t1-live-drag-fix-1.md` (g9t1 = the run g9-t1), the ctl-run-tests ack agrees with its record 2580 s before and 60 s after it; CONTROL in the same check: `T1` never agrees with `BRIEF-sm-t10-notes-fix-1.md` (whole words), the real `ACK ctl tipmerge FIX 1 …` never with `BRIEF-ctl-auto-tipmerge-fix-1.md` (contiguous), `ACK 6 FIX 1 delivered by orchestrator (lane 2)` never with `BRIEF-batch-6-fix-1.md` (the joined ref words need a letter), and the pair 2780 s apart or the record 220 s after the ack agrees with nothing
- 13.2075 🧪 EXTRA reasons (FIX 2 iii): beside 20 agreements, one EXTRA per reason from its real line — `held` (07:00 FIX 3 `BRIEF-sm-t9-notes-fix-1.md` + `HOLD T9 FIX 1 (not delivered; …)`), `no-deliver` (`ACK deliver nothing for ctl-model-effort-catalogue …`), `superseded` (09:11 MERGETIP 1 then 09:42 FIX 1 to lane 1) → `CONDITION A PASS`, exit 0; CONTROL in the same check: one more EXTRA no rule explains (a line names it without HOLD or deliver-nothing; a HOLD naming it 50 min later; other HOLDs in its window) prints `reason=?` and FAILs although matched = 20, exit 2
- 13.2076 🧪 the superseded rule clause by clause: the real 09:11 MERGETIP 1 followed by a lane-1 queue record is superseded (also with lane-1 acks before it and after the later record, a lane-7 ack between, and 2600 s apart); CONTROL in the same check, each `reason=?`: the later record to lane 2; only an EARLIER lane-1 record, 50 s before it (inside the pairing window); 2800 s apart; a lane-1 BY-ORCH ack between them; a dispatcher delivery to lane 1 between them
- 13.2077 🧪 what NAMES a record for held / no-deliver: the real 10:42 QUEUE-dispatch HOLD names `FIX 4 BRIEF-ctl-postman-followup-fix-2.md` by the whole brief stem → held; the real 05:54 `HOLD batch-6 FIX 3 (not delivered; …)` names `FIX 4 BRIEF-smoothness-batch-6-fix-3.md` by its words before the verb → held; so does the real 05:54 `ACK batch-6 FIX 3 delivered by orchestrator; hold closed`, whose verb is its first key word (the line's HH:MM time is no ref word; `hold closed` says HOLD) → held; CONTROL in the same check: the real 05:56 `HOLD batch-6 MERGETIP 4 (…)` (same words, another verb) names it not → `reason=?`
- 13.2078 🧪 condition A's other clauses: the 20-agreement PASS window plus one unpaired dispatcher delivery → `CONDITION A FAIL: missed 1`, exit 1; plus one queue record recorded twice → `CONDITION A FAIL: duplicate 1`, exit 1; CONTROL in the same check: the window alone → `CONDITION A PASS`, exit 0
- 13.2079 🧪 end to end, a BY-ORCH agreement: a real `--shadow` pass over the real 07:00 `FIX 3 BRIEF-sm-t9-notes-fix-1.md` (no branch anywhere) records the brief, and the real 07:01 `ACK T9 FIX 1 delivered by orchestrator (lane 3); …` agrees with it by that brief alone (matched=1, agreed=1); CONTROL in the same check: the same line queued for lane 4 agrees with nothing and stays EXTRA `reason=held`
- 13.2080 🧪 a record's OWN queue line is no evidence for its EXTRA reason (FIX 3, F1 i): the real 20:03 `FIX lane5 BRIEF-hk-1-docker-cache-check-fix-1.md (…; catalogue prose only; branch stays HELD)` through a real `--shadow` pass, with no other line, is EXTRA `reason=?` and condition A FAILs on it (`1 EXTRA without a reason`, exit 2); so are the real 12:48 `FIX 1 BRIEF-wtg1-route-fix-1.md (… HELD pending reviewer B …)` and the real 21:46 `MERGETIP 5 task/sm-t4-workspaces-read … HOLD the merge until T3 …`, each alone, and the 12:48 one under a Latin-1 locale (its `⚑` read as the bridge reads it); CONTROL in the same check: each plus one HOLD line naming it → `held` (a `HOLD dispatcher: FIX 5 BRIEF-hk-1-… — …; not delivered …` line in the real 12:49 HOLD's shape, the real 12:49 `HOLD dispatcher: FIX 1 BRIEF-wtg1-route-fix-1.md …`, the real 21:47 `HOLD 21:46 MERGETIP 5 task/sm-t4-workspaces-read: NOT delivered …`)
- 13.2081 🧪 the same for no-deliver (FIX 3, F1 i): a record whose OWN queue line says `(if lane 1 is busy, deliver nothing)` (reviewer C's probe line; no real queue line says it of itself), through a real `--shadow` pass, is `reason=?`; CONTROL in the same check: plus `ACK deliver nothing for hk-1-docker-cache-check (lane 1 restarted by orchestrator)` (the real 05:31 ack's shape) → `no-deliver`
- 13.2082 🧪 a name that holds the word is never its own `held` (FIX 3, F1 ii): the record of the real 20:19 `FIX lane1 BRIEF-hk-6-held-work-shipped-fix-1.md (…)` (a real `--shadow` pass; its brief names `task/hk-6-held-work-shipped`) with the real 20:19 `TOOK 20:19 FIX lane1 BRIEF-hk-6-held-work-shipped-fix-1.md (HK-6 e8f561b8): short pointer sent …` (the whole stem, held only inside it) → `reason=?`, and with the real 20:26 `TOOK→DONE … DONE task/hk-6-held-work-shipped 96f661dc (…, docs/held-work.md only) …` (a chunk holding the name's pair held-work) → `reason=?`; CONTROL in the same check: plus `HOLD hk-6 FIX 1 (not delivered; orchestrator to restart a lane)` → `held`, and with the real 20:17 `TOOK→DONE … HK-6 task/hk-6-held-work-shipped e8f561b8: … both HELD` (a lone HELD, one of the name's words, still counts) → `held`
- 13.2083 🧪 a name's LAST pair is a name too (FIX 3, F1 ii edge): a MERGETIP 4 record for `task/cycle36-hold` (two words, the phrase last; synthetic, in the shape of the real ref `ctl/cycle36-hold-anchor`) with `TOOK 19:43 MERGETIP 4 task/cycle36-hold: short pointer sent` → `reason=?`; CONTROL in the same check: plus `HOLD MERGETIP 4 task/cycle36-hold (not delivered; orchestrator routes tip merges)` (the real 05:56 HOLD's shape) → `held`: the lone HOLD chunk is no name
- 13.2084 🧪 the ref rule reaches a name's LAST word (FIX 3, F2 C1): `ACK sm-t4-workspaces-read MERGETIP delivered by orchestrator (lane 5)` agrees with the real 21:46 MERGETIP 5 `task/sm-t4-workspaces-read` record (no brief: the ref words spell the whole branch name) and `ACK ux-t11-copy-glossary NEXT delivered by orchestrator (lane 2)` with the real 10:48 NEXT 2 `BRIEF-ux-t11-copy-glossary.md` (a stem with no `-fix-N` tail) → agreed=1 each; CONTROL in the same check: `ACK sm-t4-read MERGETIP …` and `ACK ux-t11-glossary NEXT …` (no contiguous run) → agreed=0
- 13.2085 🧪 a REFUSED later queue record never supersedes (FIX 3, F2 C3): the real 09:11 MERGETIP 1 `task/wtg1-stress-output-ignored` followed 15 min later by a refused `FIX orchestrator BRIEF-wtg1-scroll-fix-1.md` (13.1933's refused shape) stays `reason=?` and the audit completes (exit 2, no Traceback); followed by a refused FIX 1 to its own lane (the brief file missing) it stays `reason=?`; CONTROL in the same check: followed by a bridged FIX 1 → `superseded`
- 13.2086 🧪 a lane named BEFORE the verb is no ref word (FIX 3, F2 C4): `ACK lane 3 T9 FIX 1 delivered by orchestrator` (rule 3 names lane 3; the ref words are `t9`) agrees with a FIX 3 record for the real `BRIEF-sm-t9-notes-fix-1.md` (agreed=1); CONTROL in the same check: the same line against a FIX 4 record for that brief → agreed=0
- 13.2240 🧪 parity-ref, the HK-3b replay shape (planner ruling 2026-10-04 17:54, REQUIRE): the real 20:39 `dispatcher: delivered HK-3b FIX 1 pointer to lane1` with the real 20:21 hk-3 FIX lane1 record EARLIER in its window and the hk-3b record later pairs the LATER, ref-agreeing record (MATCHED `ref=hk-3b ~ BRIEF-hk-3b-client-em-dashes-fix-1.md task/hk-3b-client-em-dashes`); the hk-3 record stays EXTRA; CONTROL in the same check: without the hk-3b record the delivery is UNPAIRED `ref=hk-3b reason=ref-mismatch`, naming the hk-3 record it would not take
- 13.2241 🧪 parity-ref, a wrong pair whose leftover has a reason fails condition A: beside the 20-agreement window, the HK-3b delivery's only FIX lane1 records are a wrong-ref hk-3 record (EXTRA `reason=superseded`) and a later held hk-6 record → UNPAIRED `ref-mismatch` and `CONDITION A FAIL: unpaired 1 (ref-mismatch 1)` as its ONLY clause, exit 2; CONTROL in the same check: the same record with the right ref (hk-3b) pairs → `CONDITION A PASS: matched 21 …`, exit 0
- 13.2242 🧪 parity-ref, no-ref (planner ruling 18:57): the real 10-02 `FIX 2 toolbar-brd08 delivered, saw echoed` (the task AFTER the verb) beside the 20-agreement window and a held FIX 2 toolbar-brd08 record → UNPAIRED `ref=(none) reason=no-ref`, the NOTE `dispatcher lines before 2026-10-03 name the task after the verb and audit as no-ref; run condition A on windows from 10-03 on`, `PAIRING matched 20; unpaired 1 (ref-mismatch 0, no-ref 1); extra 6`, `CONDITION A FAIL: unpaired 1 (no-ref 1)` as its only clause, exit 2; CONTROL in the same check: the 10-03 shape `dispatcher: delivered toolbar-brd08 FIX 1 pointer to lane2` pairs → PASS, exit 0, no NOTE
- 13.2243 🧪 parity-ref, two agreeing records: the EARLIEST in the window pairs (fix-1 1200 s before the delivery beats fix-2 600 s before it; the other EXTRA); CONTROL in the same check: the same records in the same file order with the times swapped → fix-2 pairs
- 13.2244 🧪 parity-ref, the exact form `HH:MM DELIVERED <VERB> <lane> …` (planner 18:57; 0 live lines): `DELIVERED FIX 2 BRIEF-toolbar-brd08-fix-1.md` names the brief only after the verb → UNPAIRED `no-ref`, `CONDITION A FAIL: unpaired 1 (no-ref 1)`, exit 2; CONTROL in the same check: the 10-03 shape of the same delivery passes (exit 0)
- 13.2245 🧪 parity-ref, ONE ref rule for both pairings: a dispatcher pair drops a lane named before the verb (`lane1 HK-3b FIX 1 delivered once (…)` pairs hk-3b), needs whole words (`delivered T1 FIX 1 …` never pairs `BRIEF-sm-t10-notes-fix-1.md`: ref-mismatch) and a contiguous run (`delivered ctl tipmerge FIX 1 …` never pairs `BRIEF-ctl-auto-tipmerge-fix-1.md`: ref-mismatch); `postman.py` holds ONE `def ref_agrees` (and one `def …agree…`), called four times (its def, `names()`, the dispatcher pairing, the BY-ORCH agreement); CONTROL in the same check: `delivered ctl-auto-tipmerge FIX 1 …` pairs that record
- 13.2246 🧪 parity-ref, `ctl help` states the format boundary (planner 18:57, addition 1): the `postman audit --parity|--since T|--window N` entry says dispatcher lines before 2026-10-03 name the task after the verb and audit as no-ref, so condition A runs on windows from 10-03 on (the audit's NOTE says the same); CONTROL in the same check: the `postman run|once|…` entry is still listed
- 13.2247 🧪 parity-ref FIX 1 (X1, reviewer C), the brief's own name is no reason either: a FIX lane1 record for `BRIEF-held-work-tidy-fix-1.md` on `task/hw-tidy` (the branch lacks the pair held-work) with a plain `TOOK 19:38 FIX lane1 BRIEF-held-work-tidy-fix-1.md: short pointer sent` QUEUE-dispatch line (no HOLD, no not-delivered phrase; held only inside the brief chunk) → EXTRA `reason=?`: `name_cut` blanks the chunks holding a pair of the brief stem, not only of the branch; CONTROL in the same check: plus `HOLD held-work-tidy FIX 1 (not delivered; orchestrator to restart a lane)` → `held`
- 13.2248 🧪 parity-ref FIX 1 (Y2), the dispatcher pairing window: a ref-agreeing FIX lane2 record 2760 s before `dispatcher: delivered x FIX 1 pointer to lane2` (outside `CTL_POSTMAN_AUDIT_TOL`, 2700 s) or 180 s after it (later than 120 s) → MISSED, exit 1, `matched=0 … unpaired=0`; CONTROL in the same check: the record 2640 s before or 60 s after → MATCHED, exit 2, `matched=1 … unpaired=0` (the line's HH:MM floors it by 20 s, so each probe clears its bound by 40–80 s)
- 13.2249 🧪 parity-ref FIX 1 (Y3), the UNPAIRED candidate cap: the real 20:39 HK-3b delivery whose ref agrees with none of SIX FIX lane1 records in its window → one `UNPAIRED  FIX lane 1 ref=hk-3b reason=ref-mismatch` line naming exactly the 5 earliest (in time order), its list ending ` +1 more`; CONTROL in the same check: with FIVE records the same 5 names and no `more`

Block `13.2040`–`13.2079` (measured 2026-10-04 over 891 `origin/*` refs: the high-water was `13.2039`, `task/ctl-model-effort`; extended to `13.2079` by FIX 1 after a re-grep of 911 `origin/*` refs at 07:50 found no id >= `13.2040` on any ref but this branch). Block `13.2080`–`13.2089` for FIX 3 (measured 2026-10-04 16:40, path-limited to `test-cases` + `docs/superpowers/plans`, over `origin/release/knowledge-graph` and `origin/release/workflow-graph` (high-water `13.2039` on both), the 10 newest `origin/task/*` refs, the `origin/task/ctl-*` refs and the 25 newest `origin/*` refs: no id in `13.2080`–`13.2099` anywhere; `task/ctl-autopilot` holds `13.2100`–`13.2147`); `13.2080`–`13.2086` are minted. `13.2040`–`13.2059` and `13.2070`–`13.2086` are `task/ctl-postman-followup` (`postman.test.sh`): the planner-target ⚑, strict flags, the bridge's note-only rule, `--shadow` and the parity audit (13.2072–13.2079: FIX 2, the matched-count condition A, BY-ORCH agreements and EXTRA reasons; 13.2080–13.2086: FIX 3, a record's own queue line and its own name are no evidence for its reason, plus the C1/C3/C4 legs); `13.1930`–`13.1934`, `13.1948`, `13.1954` and `13.1981` above were rewritten for them. `13.2060`–`13.2066` are `ctl check-base` (below). Block `13.2240`–`13.2249` for parity-ref (`task/ctl-postman-parity-ref`, planner rulings 2026-10-04 17:54 and 18:57; measured 2026-10-04 19:2x over `origin/release/knowledge-graph`, `origin/release/workflow-graph` and the 26 `origin/task/ctl-*` refs: the high-water was `13.2239`); 13.2047–13.2049, 13.2051–13.2053, 13.2055, 13.2058, 13.2059, 13.2070 and 13.2071 above were rewritten for it (their records carry a name, their dispatcher lines a ref before the verb, or the real pre-10-03 lines now audit as UNPAIRED). `13.2247`–`13.2249` are its FIX 1 legs (reviewer A's brief, 2026-10-04: X1, the pairing window, the candidate cap); the block is full.

## `ctl check-base` — a REVIEW line's stated base against the base the branch was cut from (`task/ctl-postman-followup`, planner ruling 2026-10-04 02:08)

Run by `scripts/ctl/test/check-base.test.sh`, a `pnpm check:ctl` step, on a scratch repo with a bare origin.

- 13.2060 🧪 a branch cut from release/smoothness (a synthetic fixture: the real 01:36 branch, `task/sm2-g1-cls`, was cut from KG and check-base clears it) and stated as knowledge-graph is WRONG-BASE (exit 1, both refs, the behind counts and the first-parent fork distances named); CONTROL in the same check: stated as smoothness it is OK
- 13.2061 🧪 a STALE branch (behind its stated base, but cut from it) is OK — a younger release with fewer new commits is not a closer base; CONTROL in the same check: stated as a release it was not cut from it IS WRONG-BASE
- 13.2062 🧪 a TIE — a branch on the commit two releases share — is OK; CONTROL in the same check: a branch one commit past release/ta stated as release/tb IS WRONG-BASE
- 13.2063 🧪 origin/main is a candidate: a branch cut from main (past X) stated as a release that lacks those commits is WRONG-BASE, closest=main; CONTROL in the same check: stated main is OK
- 13.2064 🧪 usage and bad input (missing args, a third positional (mutant N21), a stated base that is not main/release/* although origin HAS that ref — `feat/x` is pushed, so only the name check refuses it (mutant M26) — unknown branch or release) are refused, exit 1, no WRONG-BASE line; CONTROL in the same check: a valid call is accepted
- 13.2065 🧪 planner arm (c): a branch cut from release/knowledge-graph that later merged another release IN is OK stated as KG whichever release is deeper — merged release shallower than the KG cut (smoothness) AND deeper (deep, which the merge-base-depth rule called closer); CONTROL in the same check: the fixture really holds both orderings, arm (a) (task/from-sm) is still WRONG-BASE, and the deep-merged branch stated as release/deep is WRONG-BASE closest=KG
- 13.2066 🧪 planner arm (b) FAR behind: a branch cut from release/deep's first commit, deep 4 commits on (more than smoothness's 2 or ta's 1), is OK stated as deep; CONTROL in the same check: the fixture really is far behind (behind deep > behind smoothness > behind ta > 0) and stated as release/ta it IS WRONG-BASE closest=release/deep

## `ctl restart --model / --effort` and the effort in `ctl seats` (`task/ctl-model-effort`, owner 2026-10-04: *"the lanes should not stick to a single model and effort. assign it accordingly. if reviewer sends it back, elevate its judgement and send it to a higher model or effort."*)

Why: every lane ran on one model and one effort. `ctl restart` now takes `--model <alias|name>` and `--effort <low|medium|high|xhigh|max>`, appended to the pasted launch line as claude's own flags (`claude --help`: `--effort <level>  Effort level for the current session (low, medium, high, xhigh, max)`); `exec-claude.sh` already lets a caller's value win. Block `13.2026`–`13.2039` (measured 2026-10-04 over the 406 origin refs with a commit in the last 10 days: the highest `13.2xxx` id on any tip is `13.2025`, `task/wtg1-gate-widen`; this branch's base ends at `13.2014`, and `13.2015`–`13.2019` was left alone). Run by `scripts/ctl/test/restart.test.sh` and `scripts/ctl/test/seats.test.sh`, `pnpm check:ctl` steps. Every assertion reads the launched ARGV, never the prompt text (the test brief contains `--model opus --effort max` on purpose). Also changed: `13.1810`'s expected text line now reads `Ctx 11% sonnet-5-5/high`.

- 13.2026 🧪 `restart --model sonnet --effort medium`: the pasted line, evaluated against a stub launcher, delivers exactly `--permission-mode bypassPermissions --model sonnet --effort medium <prompt>`; each flag alone delivers only itself; the flag order on the command line does not matter
- 13.2027 🧪 CONTROL — without `--model` / `--effort` the dry-run line is BYTE-IDENTICAL to the pre-change line (a literal frozen in the test, the log stamp normalised), the argv carries neither flag although the brief text contains both, and `--override` alone changes nothing about the launch line
- 13.2028 🧪 A bad value fails before anything is written: `--effort ultra`, `--effort` and `--model` with no value, `--model --effort high`, `--model 'x;y'`, `--model 'Sonnet 5'`, `--effort high --model` each exit 1, name the flag, print no `DRY:` line (no supersede marker, no kill-window), log no tmux write and leave the postman root empty; CONTROL in the same check: valid values print the marker and the launch line
- 13.2029 🧪 End to end through the real `exec-claude.sh` (a fake `claude` on PATH, `EXECUTOR_MODEL=opus GISIK_LANE_EFFORT=high` pinned because a lane's environment may set its own): `--model sonnet --effort medium` reach claude as exactly one `--model sonnet` and one `--effort medium`; CONTROL — without them the launcher supplies its own single opus / high; `--effort max` alone keeps the launcher's model
- 13.2030 🧪 A bad value on a LIVE (not `--dry-run`) restart is refused in the argument loop: exit 1, nothing but `list-windows` reaches the tmux shim, the postman root stays empty and the scratch session's windows are unchanged; CONTROL in the same check: a valid value gets past the loop and is stopped later by the `CTL_TMUX_SESSION` guard
- 13.2031 🧪 Wiring: `selftest.sh` runs the suite as a live (uncommented) step (CONTROL — the pattern rejects a commented-out step); `ctl help` and the usage line show `--model M` and `--effort E`
- 13.2032 🧪 `ctl seats` reads the effort from the status line's own `effort: <level>` segment: `high` from the real capture; `xhigh`, `max`, `medium`, `low` from built panes (a parser fixed on `high` is red); CONTROL — the model beside it is still read
- 13.2033 🧪 No effort segment (the DeepSeek backend sends none): `effort` is null in `--json` and the text line reads `sonnet-5-5/?`, never a guessed level; CONTROL — the same pane with `effort: medium` reads `sonnet-5-5/medium`
- 13.2034 🧪 Scrollback: a `ctl seats` line (`sonnet-5-5/max`) and a sentence quoting `| effort: max |` above the real status line (effort low) — the effort comes from the real status line; CONTROL — the real pane alone reads the same
- 13.2035 🧪 The real thing, run 2026-10-04 on idle lane 2 after #989 (KG 56eeb993): `ctl restart 2 /Users/kiro/my_projects/gisik-nokma-exec2 PTR-restart-proof-lane2.md --model sonnet --effort medium`, then `ctl seats` after 12 s and the lane's status line. The restart printed `FAIL restart no backend line in gisik:2 after 30 s` (the known false negative of the backend-line probe, unrelated to the flags). `ctl seats`: `gisik:2 exec2 lane | idle (done 5:25 AM) | ... | Ctx 5% sonnet-5-5/medium | task/drafts-t3-projections@4cdf7730 ...`; status line: `sonnet-5-5 | advisor: opus | effort: medium`. Second launch, the real use: `ctl restart 2 ... PTR-wtg1-measure-fix-1-lane2.md --model opus --effort xhigh` -> `ctl seats`: `gisik:2 exec2 lane | busy 44s | ... Ctx 7% opus-5-5/xhigh | wtg1-measure-fix-l2@37227d0f`; status line `opus-5-5 | effort: xhigh`. Record: `gisik-nokma-lanes/RESTART-PROOF-13.2035.md`.
- 13.2036 🧪 One launch line, pinned by structure (the live paste cannot run in a test): over `verbs/restart.sh` with comment lines stripped there is exactly one `cmd=` assignment, the dry-run echo prints `paste: $cmd;`, the only `load-buffer` is `printf '%s' "$cmd" | tmux load-buffer`, and no line but the `cmd=` line carries `--permission-mode`; CONTROL in the same check: a copy with a flagless `cmd=` re-assigned just before the paste (on its own line, and inline), a copy whose dry-run echo prints the old literal, and, so that each clause has a copy only it rejects, a mid-line flagless `cmd=` (the count), an echo printing a flagless line (the dry echo), a paste of a string other than `$cmd` (load-buffer) and a second launch typed with `send-keys` (`--permission-mode` off the `cmd=` line) are all rejected

## `ctl autopilot` and `ctl prune-gate-locks` — the controller's matchmaking as a loop; the gate-lock dirs pruned (`task/ctl-autopilot`, planner MSG-orch-bottleneck-1 2026-10-04: *"the HAND-OFF is the bottleneck"*)

Why: items waited hours in the review queue while lanes and reviewers sat idle, because every TOOK, restart and PTR went through one controller session. `ctl autopilot` does that matchmaking every 60 s; the controller keeps the judgement work (FIX briefs, conflicts, gates, landings, syncs, flags). Every guard has its CONTROL in the same check (`scripts/ctl/test/autopilot.test.sh`, `scripts/ctl/test/prune-gate-locks.test.sh`, `scripts/ctl/test/seats.test.sh`).

- 13.2100 🧪 prune: a gate-lock dir 2 days old with a dead pid that no process names is REMOVE and `--apply` removes it; the 1 h dir (recent), the newest dir, a 2-day dir whose run pid is alive (live-pid) and one a running bash names (in-ps) are KEPT with that reason; CONTROL: the same four with the protecting attribute removed are REMOVE
- 13.2101 🧪 prune: dry-run is the default (no flag and `--list` leave the log dir byte-for-byte unchanged, "would remove"); CONTROL: `--apply` changes it, "removed"; `--apply --dry-run` is refused
- 13.2102 🧪 prune: an 8-day gate log and its `.console` are REMOVE, a 6-day one KEEP:recent, an 8-day one with a live pid KEEP:live-pid, an 8-day tipmerge log is never listed or touched; the dir line is 24 h (25 h REMOVE, 23 h KEEP)
- 13.2103 🧪 prune: a symlink or a file named like a gate-lock dir, and a gate-lock dir nested one level down, are never listed or removed; CONTROL: a real old dir beside them is REMOVE
- 13.2104 🧪 prune: copies with the age test dropped, the live-pid / in-ps / newest guard dropped, and the 24 h line stepped to 0 each FAIL 13.2100's assertion; CONTROL: the real file passes it
- 13.2105 🧪 `ctl seats --json` carries `weekly` from the status line's "weekly N%" (a transcript line saying "weekly 99%" does not count); CONTROL: the segment cut → null, Ctx still read
- 13.2106 🧪 The review queue's real shapes: REVIEW lines sharing one minute stay separate items, a TOOK closes only the branch+sha8/time it names, a newer sha supersedes, a DONE naming no branch closes nothing alone, NOTE lines are no items, a TOOK closes by its sha8 alone or its time alone, a held TOOK is released by its holder's DONE or its holder's later TOOK; CONTROL: deleting the TOOK reopens the item; and the frozen live queue (`fixtures/autopilot/QUEUE-review-2026-10-04.md`) yields exactly the hand-checked open set
- 13.2107 🧪 A BUSY reviewer is not restarted, nor an idle one with box text or in copy mode (a background shell is no reason: 13.2144); a busy lane, or one whose last line is a step CHECKPOINT, is not restarted; CONTROL: the idle clean seat acts
- 13.2108 🧪 A DIRTY lane is not restarted; CONTROL: the clean lane starts KV4 at its row's own rung M (sonnet/high)
- 13.2109 🧪 A lane with UNPUSHED commits (1, or unknown) is not restarted; CONTROL: 13.2108's clean lane
- 13.2110 🧪 A SELF-REVIEW is refused (a lane-reviewer and its own lane= item); CONTROL: the same item from another lane is taken
- 13.2111 🧪 A branch STACKED on the reviewer's own task is refused (by its `base=origin/task/<own>@…`, and by ancestry when the line says release), and so is a branch its own task stacks on; CONTROL: a lane that does not own it takes the item
- 13.2112 🧪 An item whose lane has a PREFLIGHT IN FLIGHT (lane busy, or idle but dirty, on that branch) is skipped, and so is a STALE sha (origin moved); CONTROL: the lane idle and clean → taken
- 13.2113 🧪 A MISSING Need (a path not on the tip, an unknown id, a branch never pushed) is a NEEDS skip, not a launch; CONTROL: Needs on the tip, including one found only by the tip's `Merge pull request … from …/<branch>-gated`, → start
- 13.2114 🧪 STACKS: 2 levels → start STACKED on the top branch at its head; 3 levels and two unlanded bases are refused; a base whose REVIEW line is not at its origin head is not stacked on; CONTROL: one level starts
- 13.2115 🧪 A FIX goes first, from an open `FIX KG <PTR> <branch>` line of `roles/QUEUE-autopilot.md` at the PTR's own `RUNG:` (H+ → opus/xhigh); a fresh FIX verdict with no such line holds the pool's free lane for 15 min (10 and 14 min wait); CONTROL: once TOOK, or at 15 and 20 min, the lane takes new work
- 13.2116 🧪 An idle reviewer that holds an open TOOK (no DONE yet) is not restarted; CONTROL: after its DONE it takes the next item
- 13.2117 🧪 `--shadow` WRITES NOTHING AND SENDS NOTHING: a world with ≥ 4 due actions logs WOULD lines while the lanes root, the repo refs and status are unchanged, the stub ctl and the tmux shim are never called and PULL-B.boot stays; CONTROL: the same world live restarts lane 3 and reviewer B, appends the TOOK, removes PULL-B.boot, writes the ledger; and a mutant whose door does not return under `--shadow` turns the shadow assertion RED
- 13.2118 🧪 The PULL-<X>.boot protocol: an idle, box-empty, clean reviewer with its PULL file is restarted on that boot (opus/high) and the file removed; a missing boot is dropped; CONTROL: text in its box → WAIT
- 13.2119 🧪 The pull order: FIX re-check, then `critical`, then the oldest; A/B their own pool first, C a same-minute tie to KG; one item per seat per pass; an item addressed to reviewer X waits 20 min for X (20 min still waits, 21 is open to all); a needs-tip item is skipped
- 13.2120 🧪 BUDGET: weekly 96 % and 95 % → no lane launch; 86 %, 85 % or unknown → no H++ (an H++ row); CONTROL: 94 % launches the M row and 84 % launches the H++ row with opus/max
- 13.2121 🧪 A lane whose DONE has no REVIEW line yet is not restarted; CONTROL: with the line it starts
- 13.2122 🧪 COOLDOWN: a window acted on 60 s or 179 s ago is left alone; CONTROL: 180 s ago (the line) it acts
- 13.2123 🧪 make-lane-ptr: `RUNG:` = the order row's LAUNCH rung as given (planner R2; L sonnet/medium, M sonnet/high, H+ opus/xhigh), the task heading, its line range at origin/<base>, the case range, the REVIEW template; a rung not on the ladder refused; a missing or duplicated heading, a plan not on origin/<base>, a non-release base refused; `--dry-run` writes nothing; a STACKED brief says so; CONTROL: a real write never overwrites (-2 suffix)
- 13.2124 🧪 Wiring: selftest runs the autopilot suite as a live step; `ctl help` lists autopilot and prune-gate-locks; `ctl autopilot start --dry-run` prints the tmux line and opens nothing
- 13.2125 🧪 One loop at a time: `run` refuses while the lock's pid lives; CONTROL: a dead pid's lock is taken over
- 13.2126 🧪 One row per lane and one item per seat per pass (two free lanes, one row → one start; two free reviewers, one item → one review); a row is not started, each leg alone, when its branch is on origin, a recent hand-written PTR names it, it has a REVIEW line, a seat is on it, or the ledger shows it started; CONTROL: two rows → each lane its own
- 13.2127 🧪 An order file without the ```` ```autopilot ```` block starts nothing, a malformed row is needs-unparsed; CONTROL: the block world starts
- 13.2128 🧪 An item whose sha is already on a release tip or main is skipped; CONTROL: the unlanded item behind it is taken
- 13.2129 🧪 An item older than 12 h (the queue has no dates: a time > 6 h below the previous line's is the next day) is skipped (13 h, 12 h 1 min); CONTROL: exactly 12 h, 11 h, and an item written after midnight (02:00, 8 h old) are taken
- 13.2130 🧪 A lane serving as a reviewer (last line `CHECKPOINT reviewer idle after …`) that still holds its open TOOK is not restarted; CONTROL: after its `(lane N as reviewer)` DONE it takes the next item
- 13.2131 🧪 The TOOK is appended under the reviewers' `.queue.lock.d` mkdir lock with a re-check inside it: an item another seat TOOK between the decision and the door gets no TOOK and no restart (NOT TAKEN); CONTROL: without the race the TOOK is appended and `ctl restart` called; the lock dir is gone either way
- 13.2132 🧪 FIX-WAIT ends, each leg alone, when the verdict is handled: the controller's `TOOK … FIX <branch> (orchestrator: lane N …)`, a newer REVIEW line for the branch, or a QUEUE-autopilot FIX line for it (addressed to another lane); CONTROL: the bare 5-min-old verdict holds the lane
- 13.2133 🧪 A FIX line is not launched, each leg alone, when its branch is checked out in another lane, its PTR has no `RUNG:` first line, or its PTR is missing (the lane falls through to new work); CONTROL: a valid PTR → WOULD fix at its rung
- 13.2134 🧪 `WARN hold >10 min with waiters` (orchestrator 11:10, planner finding P10): each pass reads the slot holders (`sem/slot-<n>/holder`) and the running `run-tests.sh` processes, and warns when a hold passes 10 min (601 s) while another run waits; CONTROL: 600 s with a waiter, and 51 min with no waiter (the holder's own subshell is no waiter), log nothing
- 13.2135 🧪 A reviewer whose worktree is DIRTY is not restarted (`ctl restart` refuses it, after the TOOK was written): no review pick, and a PULL file waits; CONTROL: clean seats are picked and pulled
- 13.2136 🧪 A failed `ctl restart` (not the known `no backend line` false negative) keeps the PULL file, writes no ledger row and logs `FLAG restart failed`; CONTROL: a succeeding restart removes the file
- 13.2137 🧪 The oldest is by (day, clock) across days (FIX 1, F1): yesterday's 09:00 line (itself skipped, 25 h old) does not rank today's 09:00 item before today's 08:00 one, and yesterday evening's 23:00 item (11 h old) ranks before today's 08:00 one; CONTROL: the single-day queue (08:00, 09:00) takes 08:00
- 13.2138 🧪 FIX-WAIT ages a verdict across days, like items (FIX 1, F2): yesterday's unhandled 09:55 FIX verdict holds no lane at 10:00 today (the clock alone reads 5 min); CONTROL: the same verdict written today 5 min ago, below yesterday's lines, holds it
- 13.2139 🧪 A READY of a FIX-delta re-check is no FIX verdict, the verdict being the word right after the cited time (FIX 1, F3): `DONE 09:50 READY task/… (reviewer A; FIX 1 delta; …)` 5 min old holds no lane, and over the live queue's DONE shapes the parser keeps only the `DONE <time> FIX task/…` lines; CONTROL: `DONE 09:50 FIX task/… → BRIEF-…` 5 min old holds it
- 13.2140 🧪 A review TOOK that mentions a FIX delta (`TOOK <time> task/… (reviewer C, pull, FIX 1 delta)`) does not end FIX-WAIT, and over the live queue's TOOK shapes the parser keeps only the controller's `TOOK <time> FIX task/…` (FIX 1, F3); CONTROL: that controller TOOK ends it
- 13.2141 🧪 The preflight guard's two other legs, each alone (FIX 1, F4): the item's lane idle and clean but unpushed 1, or with text in its box, on that branch → skipped (the reason names state, dirty, unpushed and box); CONTROL: idle, clean, pushed, box empty → taken
- 13.2142 🧪 A hand-written PTR stops a row only while recent (FIX 1, F4): 25 h old → the row starts; CONTROL: 23 h old → not started; both mtimes are set from the fixed clock, never the wall clock (13.2126's PTR leg too)
- 13.2143 🧪 FIX-WAIT holds only the verdict's own pool (FIX 1, F4): a fresh FIX verdict on a WG item does not hold KG lane 3; CONTROL: the same verdict on a KG item holds it
- 13.2144 🧪 A reviewer's background shells keep it from nothing (planner R1, finding P13): idle, box empty, clean, no open TOOK, 1 shell → takes the item; with its PULL file → pulled; with 1 shell AND an open TOOK → not picked; CONTROL: 0 shells takes the item
- 13.2145 🧪 A lane's shells are ignored only when its task is over (planner R1): its DONE's REVIEW line queued, 1 shell → starts; 1 shell mid-task (a step CHECKPOINT) or back from a lane-review (`CHECKPOINT reviewer idle after …`) → `SKIP … 1 shells running`; CONTROL: that lane-reviewer with 0 shells takes the next item
- 13.2146 🧪 The order row's rung is the LAUNCH rung, as given (planner R2): an H+ row launches at opus/xhigh, an L row at sonnet/medium, an H++ row is refused at weekly 86 %; CONTROL: at 50 % the H++ row launches live (make-lane-ptr gets `--weekly 50` and writes `RUNG: H++ (Opus/max)`, ctl restart gets opus/max)
- 13.2147 🧪 make-lane-ptr writes H++ only under the budget guard (planner R2): no `--weekly`, 86 and 85 → exactly `FAIL make-lane-ptr rung H++ needs --weekly below 85 (is …): the budget guard`, nothing written; CONTROL: 84 and 50 write H++ opus/max, and H+ at 86 is written
- 13.2148 🧪 A lane's DONE is matched to its REVIEW line by sha, not by branch (FIX 2, F5): a FIX round, the lane's last line `DONE task/<b> <new sha>` with only the first round's older-sha REVIEW line queued → `SKIP … DONE task/<b> <sha8> has no REVIEW line yet`, and with 1 shell → `SKIP … 1 shells running` (R1's exception needs that sha queued); CONTROL: the new sha's REVIEW line appended → the lane starts, with 0 shells and with 1
- 13.2149 🧪 The ages see midnight with no queue line written since (FIX 2, F6; `item_age_min`'s 6 h mirrors the parser's rollover, 13.2129): the last line a 23:50 FIX verdict and the clock at 00:05 → 15 min old, no FIX-WAIT; a 12:00 REVIEW item as the last line at 05:00 (7 h below it: the next day, 17 h old) → skipped as older than 12 h; CONTROL: 00:04 → WAIT (14 min old); 06:30 (5.5 h below: the same day) → taken
