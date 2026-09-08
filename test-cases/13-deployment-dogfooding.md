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
2026-09-06 once `13.1–13.40` was confirmed exhausted — minted at **13.201–13.209** so far (13.201–13.203
the scheduler-generalisation errand, 13.204–13.209 Lane F Pass 1's citation check; **13.210–13.240 remain
free in this block**). ~~**The next free BLOCK is `13.241`, controller-allocated ON REQUEST ONLY.**~~ **STALE — CORRECTED
2026-09-08. `13.241`–`13.265` are CONSUMED** (`13.241` has 4 hits, `13.265` has 2). A lane obeying that
line would have been handed an occupied block. **Block `13.266`–`13.275` is allocated to the serial
executor (controller, 2026-09-08); the next free BLOCK is `13.276`, controller-allocated ON REQUEST
ONLY.** A lane takes its assigned block and does not derive the next free id from this file — recount
the MAXIMUM in use against `origin/main` at every rebase as the control, but never mint from it.

> **A NEXT-FREE POINTER IS A CACHE, AND THIS ONE WENT STALE SILENTLY** — the same shape as
> `11-calendar-notifications.md`'s pointer corrected on 2026-09-08, one file over. It is written once
> and read by every later lane, and nothing re-derives it, so it is wrong from the first allocation
> after it and stays wrong. **Recount before trusting it. Both readings below are ways that recount
> goes wrong, and both were made for real on 2026-09-08:**
>
> * **Do not extract ids with a bare `13\.[0-9]+`** — it matches **`13.3333px`**, the user-agent font
>   size that cases 13.266–13.267 are about, and reports a maximum of `13.3333`. The id pattern
>   collides with a pixel value living in the same file.
> * **Do not sort ids as FLOATS.** `13.99 > 13.265` numerically, so a float sort reports a maximum of
>   `13.99` and a block allocated from it would hand out ids **already in use**. A case id is a
>   `(section, ordinal)` INTEGER PAIR, not a decimal number. Compare on the ordinal.
>
> One root error under both: *treating a case id as a number.* The first reads a quantity as an id, the
> second reads an id as a quantity. They were caught only because two parties recounted independently
> and **disagreed** — `13.99` against `13.265` — and the disagreement was checked rather than resolved
> in favour of whoever read first.

**Numbering is BLOCK-allocated across parallel lanes, controller-assigned 2026-09-06, because more than
one lane opened this section before Plan 11 Task 16's own catalogue pass (normally the sole opener, held
until Tasks 1–15 merge) could run: Lane C `13.1–13.40` (Task 14 landed at 13.1–13.6; Task 15 continues
inside the block at 13.7–13.8; Tasks 11–12 too, at 13.9+, after the 07:50 re-task cited above moved them
from Lane E) · Lane D `13.41–13.100` (Tasks 7–8 below, at 13.41–13.76; Tasks 9–10 continue inside the
block) · Lane E `13.101–13.200` (seam 1, Task 13, Task 16) · Lane C `13.201–13.240` (the scheduler
generalisation, 13.201–13.203, once `13.1–13.40` was confirmed exhausted; Lane F Pass 1's citation check,
13.204–13.209). Next BLOCK starts at `13.241`, controller-allocated on request. Never renumber a landed id; a lane exhausting its block asks
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
- 13.170 🧪 the negative control that makes 13.169 falsifiable, MEASURED both ways on one stack: an image
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
- 13.174 ✅ `POST /v1/events` through the WEB container's proxy is ANSWERED BY THE SERVER — 200 exactly,
  a body that parses, one `results` entry, and NOT `malformed-envelope` — carrying the session cookie the
  browser earned, the ids read off the real page, and `actorId` read from the browser's OWN session via
  `/api/auth/get-session`. Two-sided: the identical POST from a fresh context with no session answers
  **401**. **This case was REWRITTEN after review found the first version could not fail.** It sent no
  `Origin`, and `/v1/events` is in `HTTP_ORIGIN_PROTECTED_ROUTES` where `httpOriginRefused` ends
  `input.origin !== input.expectedOrigin` — so an ABSENT origin is refused by an `onRequest` hook, before
  routing, and `requireSession` never ran. The old assertions (`not.toBe(401)`, `toBeLessThan(500)`) both
  passed on that 403, meaning "it is authenticated" had no failure mode at all: an expired or forged
  cookie produced the same answer. Measured: Playwright's `page.request` sends no `Origin` header. The
  event id was also `crypto.randomUUID()` against a `ULID_REGEX` envelope, so the ids read off the page
  never reached a parser
- 13.175 ✅ a guest sees the workspace and NOT its projects — ruling **P38**'s partial workspace, seen from
  a browser for the first time. The seed makes the accountant a WORKSPACE member with role `guest` plus
  explicit visibility on four TICKETS and never emits `project.member_added`, and `eff.projects` is built
  from that event and nowhere else, so an empty project list is the product working. Asserted as
  absent-with-a-present-sibling (the workspace heading is visible in the same render), never a bare
  `toHaveCount(0)`, which passes on a blank, 500'd or redirected page
- 13.176 🟡 **a guest has NO NAVIGATION to the four errands explicitly shared with them** — the read and
  the surface now exist; the BROWSER assertion does not. **What is served and witnessed:**
  `MyWorkResponse.shared` carries the tickets whose RESOLVED audience names the viewer
  (`explicitAudienceWhere`, exported from `read/visible-where.ts` rather than restated), a guest already
  reaches `/v1/me/work` — 13.175 asserts that very link is visible to them — and the My Work page renders
  a "Shared with me" section for it. Witnessed by 7.260–7.265 at the route, 3.159 at the mapper and
  3.160/3.161 at the view, each with measured mutations, plus both integration doors
  (`client-contract`, `real-door-round-trip`) whose exact-shape assertions now name the key.
  **What is NOT done, enumerated rather than called "partial":** (1) no Playwright spec asserts a real
  guest reaching a real errand in a real browser — this suite is structurally off the local gate (13.177)
  and GitHub Actions has had no green run since 2026-09-06, so a spec added now would execute once, by
  hand, and never again; deliberately NOT written, because an unrunnable spec landing beside verified
  work is how a 🧪 becomes a believed ✅. (2) OPENING a shared errand into a ticket sheet is still not
  possible — `DataSource.getTicket` refuses with `ServingGapError` for EVERY viewer, not only a guest — the
  route answers a snake_case `proj_visibility` row with no title, no `stateProvenance` and no domain
  `TicketState` — so the SHEET is a refusal for everybody on every surface, which predates this change.
  **A claim that stood here and was FALSE is corrected rather than deleted:** this said a guest "gets 404
  from" the project page, and `routes/board.ts` says in writing that a workspace member who is not on the
  project *"passes the gate and gets 200 with whatever their visibility yields"*. A guest IS a workspace
  member and the guest arm of `visibleTicketsWhere` is the explicit clause, so the project page loads for
  them with their shared ticket on the board. The view's open affordance was gated on that false claim and
  the gate is now GONE (3.161); navigation works to exactly the degree it works for anybody.
  Owner of (1): whoever runs the stack once CI billing is restored. Owner of (2): the `getTicket` serving
  gap, which predates this and is not this change's to close
- 13.177 ✅ the suite is off the LOCAL gate structurally, for two independent reasons: it is reached by
  `test:e2e:stack`, a script name turbo defines no task for, AND `apps/web/vitest.config.ts` includes
  `test/**` only, so `e2e-stack/` is not collected by the gate's runner either. Measured before and after
  — `turbo run test --dry=json` = 16 tasks, 10 `#test`, **0** e2e. **It is deliberately ON CI's `gate`
  fan-in** (`ci.yml` lists `e2e` in `gate`'s `needs`), which is the point of Task 13 rather than an
  oversight, and it is on `turbo run typecheck` via `tsconfig.e2e.json`, which is wanted. The earlier
  wording said "off the gate" without qualification and was false in two of those three senses
- 13.178 🧪 `ci.yml`'s `e2e` job supplies the real invocation (bring the stack up, install the browser
  explicitly since playwright declares no install script, run, tear down) and keeps a visibly-skipped
  path with a printed reason. It had become **green-by-presence**: once Task 6 landed
  `docker-compose.dev.yml` the old job took its file-present branch and reported green while running
  nothing. `🧪` and not `✅` because **no CI run has ever executed it** — GitHub Actions has been failing
  account-wide before the first step on a billing block — so it is verified only by a local YAML parse
  (9 jobs, `e2e` 11 steps, `gate`'s `needs` unchanged) and by Lane C's review of the hunk
- 13.179 ❌ what the web shell RENDERS when `getTickets` throws past the 2000-row cap (case 12.258) —
  **Task 13 does not cover it**; the E2E never reaches that path. Owner: Plan 6 / web render tests
- 13.180 ✅ `seed:cc` runs inside the DEV compose container — which is what the E2E's `global-setup` does
  on every run, so it is exercised continuously. **CORRECTED after review: the stated reason was wrong.**
  This case used to say `reference/` "is present at `/app` in the image". It is not. Measured against the
  IMAGE rather than a running container — `docker run --rm --entrypoint sh <image> -c 'ls /app'` — the
  runtime image holds `dist`, `migrations`, `node_modules`, `package.json` and config and nothing else: no
  `reference/`, no `src/`, no `tsx`. `reference/` is present in the DEV container only, via
  `docker-compose.dev.yml`'s `./reference:/app/reference:ro` bind mount, which App Platform has no
  equivalent of. **The original measurement was taken inside a container that had the mount** — the same
  class of error as reading a stale image's health as the stack's health, and the third time this lane
  measured the wrong environment. In production both seeds run from a checkout (runbook, "Seeding
  production")
- 13.181 ✅ `seed:dev` now has CLI coverage, and its host-only constraint is a documented FACT rather
  than an open defect. `apps/server/test/seed/seed-dev-cli.test.ts` spawns the entry point: it refuses
  without `DATABASE_URL`, prints usage without an owner, refuses an owner who never signed in, seeds
  end to end through `--plans-dir`, and — the control that makes that mean anything — fails naming the
  directory when it holds no plan documents, so a CLI ignoring the flag and reading the repo's own
  `docs/` could not pass. (An earlier draft of that case used an unknown owner and claimed the refusal
  proved the directory was read; it did not — `seedDevWorkspace` resolves the owner BEFORE
  `readPlanSeries`, so it fired whatever `--plans-dir` pointed at. The control exposed it.)
  It still cannot run inside the production image — `docs/` is in `.dockerignore`, so
  `docker compose exec server node dist/seed/cli-seed-dev-workspace.js` cannot work — and the runbook
  now states that for BOTH seeds, with the reason. Host-side only, `DATABASE_URL` → `localhost:54330`.
  (Case 13.90 is `seed:cc`'s CLI smoke and stays Lane D's to flip)
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
  in `better-auth@1.7.2`, `validateFormCsrf` (`dist/api/middlewares/origin-check.mjs:131`) validates ONLY
  at `:137` (has cookie), `:141` (has `Sec-Fetch-*`) and `:152` (has `Origin`/`Referer`) — a request
  matching none of the three falls off the end at `:153` unvalidated — and
  `validateOrigin` (`:96`) gates on `const useCookies = headers.has("cookie")` (`:101`) at `:108`. CSRF
  needs an AMBIENT CREDENTIAL the browser attaches automatically; a caller sending none gains nothing from
  forgery. Pinned as behaviour so a version bump that changes it is visible. *(Line numbers are `dist`
  line numbers and are only valid for 1.7.2 — re-read them when the lockfile moves.)*
- 13.188 ✅ a `WEB_ORIGIN` written with a TRAILING SLASH is still trusted — it is normalised at assembly
  with the same `normalizeOrigin` every other consumer uses. Un-normalised it would reinstate the exact
  403 `INVALID_ORIGIN` this change removes, because better-auth matches http(s) patterns by EXACT equality
  (`auth/trusted-origins.mjs`, `pattern === getOrigin(url)`) while `config.ts`'s `httpUrl()` admits the
  slash — and CORS and the HTTP-Origin check would both keep working, so it would present as an auth-only
  regression
- 13.189 ✅ a `WEB_ORIGIN` containing a wildcard is REFUSED AT ASSEMBLY rather than handed to better-auth,
  which branches to `wildcardMatch` for any pattern containing `*`. That branch is not hypothetical: this
  suite's own `'*'` mutation made both permissiveness bounds go green. `auth.ts` previously asserted
  "never a wildcard" as a property nothing enforced, and `WEB_ORIGIN` is set by hand in
  `deploy/do/app.yaml`
- 13.187 🧪 node's `fetch` is not `curl`, and a probe cannot stand in for the client here: the SAME request
  answers 200 under curl and **403 `MISSING_OR_NULL_ORIGIN`** under node, because node presents
  `Sec-Fetch-*` headers and so takes `validateFormCsrf`'s force-validate branch while curl falls through
  unchecked. Pinned by the E2E's own setup, which sends the web origin as a browser does

### Runbook, and the decision the deploy spec owed (Task 16)

Plan 11's last task. `docs/runbook.md` is created here; `Features.md` §13 and this file get their final
shape rather than a first draft — both had been filled incrementally by Tasks 1–15 across five lanes, so
the plan's Step 2 and Step 3 texts (which write them as if new) are stale by construction and were
reconciled, never overwritten.

- 13.190 ✅ every command `docs/runbook.md` names **in a matched shape** resolves — `pnpm --filter <pkg>
  run|exec <script>` (with `--filter @pkg` and `--filter=@pkg`), root `pnpm <script>` with or without a
  colon, repo-relative script paths, and `node dist/…` resolved to the source that builds it. **14
  references, 12 distinct** — both numbers printed, because an earlier version reported only the raw count
  and a reader takes one figure for "how many things the runbook names". `scripts/check-runbook-commands.mjs`,
  **its own CI job**. **Stated limits, because coverage is the thing this kind of check lies about:** a
  command named in PROSE with no `pnpm` in front of it is invisible to the matchers, and so is a directory
  path with no extension. The claim is "every command named in a matched shape", not "every command"
- 13.191 ✅ the checker refuses a clean answer it has not earned: a SELF-TEST runs first against four
  planted defects (an unknown script under a real package, an unknown package, an unknown root script, a
  missing file path) and exits 1 unless all four are caught, and a mirror control requires three
  known-good commands to be accepted. Without it, deleting a matcher would make the real sweep report a
  clean zero — and a zero from a matcher never watched to fire is not a measurement. A runbook naming zero
  commands is also an error, not a pass
- 13.192 ✅ planted defect against the REAL runbook, not a synthetic one: restoring the first draft's
  `ops:sweep-orphans` reddens the check with the site named — *"no such script in
  apps/server/package.json"* — and the file restores to a clean sweep. **That name is the defect this
  check was built for: it has never existed; the script is `sweep:orphans`**
- 13.193 ✅ `verify:projections` runs from `DATABASE_URL` alone, which is how the runbook's restore drill
  invokes it. It previously opened with `loadConfig(process.env)` and so demanded `BETTER_AUTH_URL`, a
  32-character `BETTER_AUTH_SECRET` and `WEB_ORIGIN` — **none of which it reads** — and the drill's own
  step 4 answered `ConfigError: invalid server configuration — check: BETTER_AUTH_URL,
  BETTER_AUTH_SECRET, WEB_ORIGIN`. Measured both ways: with `DATABASE_URL` it now reaches the database;
  with none it exits 2 saying `DATABASE_URL is required`. A drill nobody can run is not a recovery
  procedure, and demanding three auth secrets to read a scratch database invites an operator to invent
  production-shaped values while holding a restored copy of production
- 13.194 🚫 the projection verifier's privilege question is DISCHARGED AS A RECORDED DECISION, in both
  `docs/runbook.md` and `deploy/do/README.md` (coordination doc lines 1607–1611, which required either a
  DDL-capable credential or an explicit decision; neither existed): **`verify:projections` runs only
  against restore scratch databases, never production, and no DDL credential is added.** It needs
  `CREATE SCHEMA` + `CREATE TABLE` on whatever database it verifies, and the shadow trick is safe only
  while every registered projection declares its table — one missing from `tables` gets no shadow copy and
  its unqualified `TRUNCATE` resolves to `public`, truncating the live table (cases 5.55, 7.63).
  **🚫-with-reason, not 🧪 and not ✅:** a recorded decision is a document, nothing about it is verified at
  deploy time, and **no automated check reads it.** An earlier version of this case claimed 13.190 checked
  "that the two files say so" — it does not: 13.190 asserts `deploy/do/README.md` EXISTS and never reads a
  byte of it, so the decision section could be deleted entirely with the check still green. **The cost is
  recorded with the decision:** production drift is not detected continuously — the drill restores a
  ≤1-day-old dump, so what is bounded by a month is DETECTION LATENCY, not dump staleness — and the answer
  if that becomes unacceptable is a read-only continuous checker, not a DDL credential in the deploy spec
- 13.195 ✅ the plan's Task 16 Step 4 whole-stack smoke is now RUN IN FULL, docker half included. **Its
  targets are all LOCAL** — an earlier version said it "requires the production deployment", which is
  false; Step 4 names no production resource. It still cannot be run VERBATIM: it names four root scripts
  that do not exist (`lint`, `test:fixtures`, `test:dual-client`, `test:e2e`) and a stale Postgres port
  (54329; the dev stack is on 54330). RUN: the gate half (build/test/typecheck) and the E2E half
  (13.169–13.175). **The docker half, previously NOT RUN, was run 2026-09-07 and found a real defect:**
  `compose up --build` brings all five services healthy; `check:db-tz` against the compose database on
  54330 answers `Asia/Kolkata`; and the in-container `node dist/ops/backup-daemon-main.js --once`
  REFUSED with `backup object storage needs: BACKUP_S3_BUCKET`. That variable had been deliberately
  omitted from the server service, for a reason that was correct when written — nothing read it, measured
  as 0 hits in `apps/server/src` — and that **expired when the backup work merged**: the same control
  re-run at this head gives FIVE hits, and `ops:backup-once` is a real script. Nothing was watching the
  premise. With the variable wired to the `gisik-backups` bucket `minio-init` already pre-creates, the
  rehearsal completes and writes both artifacts (`ledger/2026-09-07.ndjson.gz` 25KiB,
  `pg/2026-09-07T05-36.dump` 149KiB, verified present and non-empty in the bucket rather than trusted
  from the log line). The wiring is now asserted by `apps/server/test/ci/compose-dev-backup-wiring.test.ts`
  so the rehearsal does not have to be re-run by hand to notice it break
- 13.196 ✅ the CONTENT assertion exists now. `check-runbook-commands.mjs` still only asserts
  that `deploy/do/README.md` and `docs/runbook.md` EXIST — which is its job, and "the commands resolve"
  and "the documents still say what they decided" are different questions that should not share a
  resolver. So the content assertion lives in `apps/server/test/docs/recorded-decisions.test.ts`, where
  the gate runs it and this row can cite it: both files must still carry the three load-bearing clauses of
  13.194's recorded decision (scope limited to restore scratch databases, never production, no DDL-capable
  credential). Sentence fragments, not paragraphs — a paragraph breaks on rewrapping and teaches people to
  delete the test, while a single word like "scratch" would survive the decision being reversed

## The test-cases <-> test citation check (Lane F Pass 1)

Ruling P33 and the coordination doc's own record (2026-08-31, "Recorded with owners, not fixed" and
"What a catalogue entry is actually worth") name the gap this closes: no test in the repo cites a
catalogue case id, so the `✅` markers this whole series has been writing are one-directional — a test
can be deleted and its case keeps its checkmark. `scripts/check-case-citations.mjs`, its own ungated CI
job, `pnpm check:citations`.

**Measured before choosing a mode, per the owner's instruction, because the honest number decides the
shape:** 1525 checked ids repo-wide, 710 cited (the id string appears somewhere under a test/e2e
directory), 815 not (a first pass, before an opus review round, under-measured this at 1470/663/807 —
a real extraction bug silently dropped every range-form `✅` line, e.g. `- **3.89–3.94** ✅ ...`, from
the check entirely; case 13.204 below is the fixed claim). Too large to backfill in this errand, so the
check runs as a RATCHET rather than a
hard requirement: `scripts/fixtures/check-case-citations-baseline.json` commits one uncited-count ceiling
per `test-cases/NN-*.md` file, and the check requires the CURRENT real count to equal that ceiling
exactly — not merely be under it. An exact-match ratchet, not an upper bound, on purpose: a ceiling
nobody has to tighten when things improve stops meaning anything, and checking per file rather than a
repo-wide sum means a real regression on one bucket cannot hide behind unrelated improvement on another.

- 13.204 ✅ every id-line shape this repo's `test-cases/` files actually use is extracted correctly, and
  every non-checked shape is correctly left alone — a self-test fixture
  (`scripts/fixtures/check-case-citations-fixture.md`) plants one of each: bare-trailing (`- 90.1 ✅
  ...`), bold-trailing (`- **90.2** ✅ ...`), marker-first bold (`- ✅ **90.3 — ...`), marker-first bare
  (`- ✅ 90.4 ...`), and a RANGE (`- **90.6–90.8** ✅ ...`, expanding to three ids) as the seven ids that
  MUST be extracted; four lines using every other real status marker (🧪/❌/🟡/🚫), a renumbering
  ("absorbed into") line, and a mid-sentence prose citation as lines that must NOT be. **The range shape
  was NOT in the original fixture, and its absence was a real, live bug an opus review round found**:
  `- **3.89–3.94** ✅ ...` (the actual shape `03-foundation-ledger.md` uses ten times) extracted only the
  leading id and silently discarded the other five per line — not reported as malformed, just gone — so
  50 real, already-cited `✅` ids across that one file were invisible to the ratchet from the day this
  check shipped until the fix. Range extraction is now covered by this same self-test, and a
  cross-section range (`90.30–91.2`, which cannot be a real range) is asserted malformed rather than
  silently expanded or truncated. Run before this errand's own sweep, printed and asserted against these
  exact ids. `scripts/check-case-citations.mjs`
- 13.205 ✅ a malformed id is reported, never silently misfiled: `13.2.1` is not an N.M id, but the
  extraction regex's `(\d+\.\d+)` greedily matches its first two segments ("13.2") — without a guard, a
  three-part number would silently become a shorter real-looking id rather than what it actually is,
  which is a typo. The fixture plants `90.5.1` and the self-test asserts it is reported as malformed and
  contributes to neither the checked-id list nor any uncited count. `scripts/check-case-citations.mjs`
- 13.209 ✅ a citation match requires the id to be the WHOLE number, not a prefix of a longer decimal —
  **found live, by review, not planted in advance**: `isCited` originally excluded only a following
  digit, so a dependency version string like `"zod 3.25.76"` satisfied id `3.25` with no real citation
  anywhere, and `3.30`/`5.12` were satisfied the same way by `@tiptap/core@3.30.5` and `fastify 5.12.1`
  in real test files. The provable consequence: a routine dependency bump could flip a genuinely-deleted
  citation to look present, or an unrelated version-string coincidence could mask a real regression —
  either way the check's own failure message ("a citing test was likely deleted") would be actively
  wrong. Fixed by also excluding a further digit immediately after a following `.`; a genuine
  sentence-ending citation (`case 5.18.`, period then non-digit) still matches, asserted as its own
  self-test case so the fix cannot later over-correct into rejecting ordinary prose.
  `scripts/check-case-citations.mjs`
- 13.206 🧪 deleting the LAST test that cites a checked case reddens the check, naming the exact case —
  reproduced against real files, not only the self-test's synthetic fixtures. Case 11.1 is cited in
  exactly two places (`calendar-model.test.ts`'s `describe`, `claim-labels.test.ts`'s `it`); with both
  citation strings removed, `11-calendar-notifications.md`'s uncited count moved from 0 to 1 (its
  committed baseline is 0, the file being fully cited today), and the check failed naming `11.1`
  specifically and the file's baseline vs. actual numbers. Restored via `git status --short` confirming
  byte-identical content, then re-run clean. **🧪, not ✅, deliberately: this was a one-time hand mutation
  against real files, not a standing automated test this repo re-runs** — the general property (an
  increase is caught) IS automated, at 13.207 below, via the self-test's synthetic `checkRatchet` inputs;
  this case is the corroborating real-world instance, not a citable repeatable check, so it earns no
  citation and is excluded from this file's own citation ratchet by construction (only ✅ ids count).
  `packages/app-core/test/calendar/calendar-model.test.ts`, `packages/app-core/test/claims/claim-labels.test.ts`
- 13.207 ✅ the ratchet's other three shapes, proven directly against the pure `checkRatchet` function
  with synthetic inputs (the same shape `check-runbook-commands.mjs`'s own self-test uses for its
  matchers): an increase (actual 5 vs. baseline 3) is caught, reason `increased`; a STALE ceiling (actual
  2 vs. baseline 5 — the baseline is looser than reality, which this ratchet treats as equally wrong,
  not merely permissive) is caught, reason `stale`; an exact match (4 vs. 4) passes with no violation; a
  file with no committed baseline entry at all is caught, reason `missing-baseline`. `scripts/check-case-
  citations.mjs`
- 13.208 ✅ `check-citations` is its own CI job, unconditional — no `needs: scope` and no docs-only `if:`
  gate, the same shape `check-runbook` was rewritten into after review found it silently skipped on a
  runbook-only diff (`check-env`'s original bug, the exact hazard this errand exists to name one level
  up). Added to `gate`'s `needs` list. Verified with `actionlint .github/workflows/ci.yml`, exit 0.
  `.github/workflows/ci.yml`

**Backfill is real, per-file work — carried, not attempted here, owner named per file rather than one
vague "whoever":** `09-editor-attachments.md` (219 uncited, 0 cited — this lane's own attachment/backup
work is a large share of it, so first claim if this lane runs again) and `10-workflow-builder.md` (66
uncited, 0 cited) have never had a single citation attempted; `05-tickets-hierarchy.md` (68 of 73
uncited), `06-auth-visibility.md` (63 of 111), `04-workflow-engine.md` (45 of 52) and
`03-foundation-ledger.md` (45 of 154 — total corrected from an earlier 104 by the range-extraction fix
above, which recovers 50 real ids this file always had) are mostly uncited with a small existing
precedent to extend; `07-api-realtime-search.md` (78 of 229) and `12-offline-sync-apps.md` (78 of 314)
are already majority-cited and need the remaining minority closed; `13-deployment-dogfooding.md` carries
153 of 160 uncited, up from 148 by this section's own five ✅ cases (13.204, 13.205, 13.207, 13.208,
13.209) — **NOT cited,
by an honest structural gap rather than neglect**: `check-case-citations.mjs`, like its siblings
`check-case-ids.mjs` and `check-runbook-commands.mjs`, is a self-testing script with no companion
`.test.ts` file (checked: neither of those two siblings has one either, confirmed by grep), and the
citation corpus this very check scans is test/e2e directories only, by the controller's own explicit
spec — `scripts/*.mjs` is deliberately outside it. There is no test file these four cases COULD cite
without either widening that scope unilaterally or inventing an unprecedented companion test file for a
script whose entire established family never has one. Recorded here rather than silently baselined away:
the ratchet for this file is bumped to 152 to reflect it, named as its own kind of gap rather than folded
into the ordinary backfill debt above. Owner for all of the above, absent a
more specific claim: whoever next does substantial work on that bucket's tests, per the standing
same-change-set rule — cite while touching, rather than as a separate sweep. `11-calendar-notifications.md`
needs no owner: it is fully cited today (0 of 147 uncited) and stays that way structurally as long as new
cases there are cited when written.


## Pre-launch checklist — HTTPS enforcement (owner-assigned, 2026-09-07)

*Checklist item 5 asked which layer's job "force HTTPS" is. Measured against `deploy/do/app.yaml`, it
splits three ways: the HTTP→HTTPS **redirect** is App Platform's router (an in-app one would be
unreachable code), the **`Secure` cookie flag** was already correct and is pinned elsewhere by
`sign-in-flows.test.ts`, and **HSTS was genuinely missing** with no layer supplying it. These cases cover
the part that was the app's job. Both hosts are covered because HSTS is scoped per host —
`pm.artsourced.in` and `pm-api.artsourced.in` are siblings, and the API sending it says nothing about the
web app. Full findings: `docs/pre-launch-checklist.md`.*

- **13.242** ✅ `hstsHeaderFor` answers the header for `https` and nothing for http, undefined, `HTTPS` or `https:` — not a prefix match — (`apps/server/test/http/hsts.test.ts`)
- **13.243** ✅ The value is a year with `includeSubDomains`, and `preload` is asserted ABSENT so adding it must redden a test — (`apps/server/test/http/hsts.test.ts`)
- **13.244** ✅ Present on a real https request including on the 401 an unauthenticated caller gets — a first visit meets a refusal more often than a 200 — (`apps/server/test/http/hsts.test.ts`)
- **13.245** ✅ Present on an unmatched route's 404, for the same reason — (`apps/server/test/http/hsts.test.ts`)
- **13.246** ✅ Absent over plain http, AND absent when `x-forwarded-proto: https` is forged against an app with `trustProxy: false` — otherwise the control would be caller-controlled — (`apps/server/test/http/hsts.test.ts`)
- **13.247** ✅ The web shell sends it when `SERVER_ORIGIN` is https, a year long and without `preload` — (`apps/web/test/next-config.test.ts`)
- **13.248** ✅ The web shell sends nothing when `SERVER_ORIGIN` is http — RFC 6797 §7.2 forbids it and local dev is http — (`apps/web/test/next-config.test.ts`)

## Pre-launch checklist — the frontend-secrets audit (owner-assigned, 2026-09-07)

*Checklist item 4. No secret value ships in any client bundle — swept at the ARTIFACT level (50 files,
1.4 MB of built `.next/static`), not from source, with positive controls printed beside every zero. Two
`check:env` blind spots were found and closed: it scanned one of the three shipping clients, and its
detector knew only `process.env` while `apps/desktop` reads `import.meta.env`. Fixing the first revealed
the second. No new cases here — the property is enforced by `check:env` itself, which now fails on an
undocumented client-inlined variable; `docs/pre-launch-checklist.md` records the audit and the one risk
left open for the owner (`EXPO_PUBLIC_DEV_TOKEN` is a real bearer token inlined into any build made with
it set, and nothing prevents a release build from carrying it).*


## Pre-launch checklist — the 404 and the two legal pages (owner-assigned, 2026-09-07)

*Checklist items 1–3. The 404's design comes from the product's own principle: a generic "page not
found" asserts one cause for a situation with several, which is the tidier-wrong-answer this product
refuses everywhere else. One of the causes is a SECURITY property — the API answers the same 404 for
"does not exist" and "not yours", so a caller cannot probe for which records exist — so the page names
all three and says it will not guess.*

- **13.249** ✅ Names all three causes together and refuses to say which happened — asserting one would pass against the generic 404 this replaces — (`apps/web/test/not-found-and-legal.test.tsx`)
- **13.250** ✅ Offers a way out; an error without a recovery path is half a message — (`apps/web/test/not-found-and-legal.test.tsx`)
- **13.251** ✅ Both legal pages carry bracketed placeholders rather than invented party details — (`apps/web/test/not-found-and-legal.test.tsx`)
- **13.252** ✅ The "not reviewed by a lawyer" marker is in the SOURCE and absent from the RENDER — both ends asserted against both files, because asserting either alone passes against the opposite failure — (`apps/web/test/not-found-and-legal.test.tsx`)
- **13.253** ✅ The terms state the four things the product does not promise, so a later legal cleanup cannot quietly remove them — (`apps/web/test/not-found-and-legal.test.tsx`)

### Checklist items 6–7 — colour contrast and responsive (2026-09-07)

*Minted from this lane's own `13.241` block, which items 1–3 opened and used through `13.253`; `13.254`
is the next free id IN THAT BLOCK, not derived from the file's maximum.*

- **13.254** ✅ **The signed-in shell does not scroll sideways at 390px.** `apps/web/e2e-stack/viewport.spec.ts`
  — signs in through the real door, reaches a **workspace-scoped** page, and asserts both
  `scrollWidth <= clientWidth + 1` and that no element's rect crosses the right edge.
  *Why it lives in `e2e-stack` and not in the new `e2e-viewport` suite: the defect was on the
  AUTHENTICATED pages. `.gn-nav` overflowed by 10px on `/my-work`, `/members`, both settings pages and
  the board, and on none of the five signed-out routes — `AppNav` is the row that overflowed and
  signed-out pages do not render it, so the unauthed suite would have stayed green through the entire
  bug. Signing in and stopping at `/workspaces` would not have caught it either: measured, that page did
  not overflow while `/my-work` did, because `AppNav` renders a longer row once a workspace is in scope.*
  *The overflow was DATA-dependent — the row's last child is `Sign out {user.name}` — which is why the
  fix is `flex-wrap: wrap` rather than a width. Verified causally before it was written: injecting the
  rule took all five routes 10 → 0 while a negative control (an irrelevant declaration on the same
  selector) left all five at 10, and the nav was measured to WRAP (88px → 104px, every child inside)
  rather than clip.*
  *The instrument asserts itself first: `window.innerWidth` is read back inside the page, because this
  repo has a recorded failure where a resize reported success while the page stayed 1512px wide.*
- **13.255** ✅ **The signed-out surface holds its layout at 390, 768 and 1512, and the three are
  measurably DIFFERENT.** `apps/web/e2e-viewport/responsive.spec.ts` over
  `apps/web/playwright.viewport.config.ts` — five routes × three real device viewports, each asserting
  the configured viewport AND the in-page `innerWidth` before measuring anything. The cross-width case is
  the load-bearing one: a suite that passes identically at all three widths has proven nothing about
  responsiveness. *Found a real defect on first run: `p.gn-legal__meta` rendered at 15.2px on `/privacy`
  and `/terms` — the same 0.95rem body-copy floor items 1–3 had already fixed on the 404's aside, missed
  there because that pass measured one page at desktop width.*
  *Tap targets ratchet rather than assert a floor (`e2e-viewport/tap-target-baseline.json`): the reading
  is real but it does not move with the viewport, so it is a type-and-spacing decision recorded for the
  owner in the pre-launch checklist, not a responsive defect. The count may fall, never rise.*
  *A MISSING baseline entry FAILS rather than seeding itself, and that guard exists because the first
  version did seed itself — an adversarial review caught that a fresh clone or CI checkout with no
  baseline would record whatever was broken that day and report full green with zero enforcement, on
  every first run. Recording is now `UPDATE_TAP_BASELINE=1`, an explicit act. Proven by hiding the
  committed file and running: EXIT 1, one error per route naming the key and its observed count;
  restored by SHA-256 against `HEAD` and re-run green.*

## Type scale at 390px (owner-assigned, 2026-09-08)

*The other half of the ruling whose tap-target half shipped in #328. The finding was recorded in
`docs/pre-launch-checklist.md` — "small text is real but mostly legitimate labels
(`gn-board-card__provenance` at 12.5px x25, chips at 12.8px)" — and the first thing this pass
established is that **nothing could measure it.** `responsive.spec.ts` has swept body copy against a
16px floor since item 7, but its population is `p, li, dd, dt, td, figcaption, label`, and every
element that sentence names is a `span` or a `div`. The reading came from one manual measurement and
had no guard, which is the state the tap-target note was in while the code drifted under it.*

*THE FLOOR IS 12px AND IT IS NOT A WCAG NUMBER — stated because the tap-target ratchet next door cites
2.5.5 and 2.5.8 and the symmetry invites a false citation. No WCAG success criterion sets a minimum
font size: 1.4.4 is resize-to-200%, 1.4.12 is text spacing; iOS HIG's 11pt and Material's 12sp are
native-platform guidance. 12px is the bottom rung of this product's own scale — seventeen rules sit at
exactly `0.75rem` — and the checklist itself judged the 12.5px and 12.8px labels legitimate.*

- **13.264** ✅ **Label text on the signed-out surface holds the 12px floor, ratcheted per route.**
  `apps/web/e2e-viewport/responsive.spec.ts` over the shared sweep in `e2e-viewport/type-scale.ts` (a
  plain module, not a spec — importing a sweep FROM a spec makes Playwright load that spec's `test()`
  registrations into the other config, which cost a round on the tap-target pass). Measured: `/help`
  examined 317 label elements, `/privacy` 21, `/terms` 14, the 404 seven, and **every one renders at
  exactly 16px**. `/sign-in` matched 5 and examined 0 — all five carry no direct text — which is why
  the hard control is on `rawMatches` and not on `examined`. —
  (`apps/web/e2e-viewport/responsive.spec.ts`, `apps/web/e2e-viewport/type-scale-baseline.json`)
  *The selector control is HARD and runs before the ratchet: the population includes `div`, so a
  rendered document cannot honestly report 0 matches. A sweep whose selector stopped matching finds
  zero offenders and reads as the best possible result.*
  *The disjointness that justifies two sweeps instead of one is MEASURED, not asserted in prose:
  anything matching both this selector and `measureBodyText`'s lands in `bodyOwned` and reddens by
  name. Two selectors in two files are free to drift into each other; a comment would not notice.*
  *Mutation: point the label selector at a tag that does not exist → `rawMatches` 0 → fails.*
  *Mutation: add `p` to the label selector → `bodyOwned` non-empty → fails naming the overlap.*
  *Mutation RUN, not reasoned: `.gn-help__toc-link` 1rem → 0.7rem. Result `smallest = 11.2px on
  a.gn-help__toc-link, under-12px=16`, the ratchet failing against baseline 0 and naming the offenders;
  restored from a copy made before the edit (never from `HEAD`) and re-run green, 6 passed.*

> ### That mutation went red through the WRONG check the first time, and that is how a hole was found
>
> Run before `a` was in the population, the same plant went **red — through the TAP-TARGET ratchet**,
> because the links also lost height, while this sweep reported `under-12px=0` on the same page in the
> same run. Written down uninspected it would have read as proof.
>
> `a` was in NEITHER population: not here, and not in `measureBodyText`'s `p, li, dd, dt, td,
> figcaption, label`. **Every link and every button in the product had no font-size floor of any
> kind**, and the mutation designed to test this check could not be seen by it — this repo's recorded
> shape of a control that does not traverse the same path as the measurement.
>
> `a`, `button`, `summary` and `th` are now in the population: `/help` goes from 317 examined to 341,
> still zero offenders. Headings stay out, matching the body sweep's stated reasoning. **The lesson is
> not "the mutation worked" — it is that a red result must be read for WHICH check produced it.**

- **13.265** ✅ **Label text on the signed-in surface holds the 12px floor, over five routes.**
  `apps/web/e2e-stack/viewport.spec.ts`, signing in through the real door and reading every id out of
  the seeded world rather than hardcoding one. **The route list is the whole case.** `/my-work` and the
  board were the obvious two — the checklist's own reading is about the board — and measured first they
  BOTH came back with zero under the floor (smallest 12.8px, the chips; board histogram
  `{12.8px: 24, 13.6px: 6, 16px: 6}`). A sweep of just those two would have ratcheted 0 and 0, reported
  green, and been blind to every rule this change fixes. Adding `/members`,
  `/settings/ticket-types` and `/settings/workflows` found the defect: **four
  `span.ticket-type-list__badge` at 11.2px**, before → after **4 → 0**. —
  (`apps/web/e2e-stack/viewport.spec.ts`, `apps/web/e2e-stack/type-scale-baseline.json`)
  *A ratchet on the pages a finding NAMED is not a ratchet on the pages the defect is ON. Zero
  offenders on two routes is evidence about two routes.*
  *WIDENING THE POPULATION FOUND THE CHECKLIST'S OWN NAMED ELEMENT.* Once `a`/`button` joined the
  sweep, the board went from 36 examined to 104 and reported
  `smallest = 12.48px on button.gn-board-card__provenance`, x26 — the very thing the checklist
  recorded as "`gn-board-card__provenance` at 12.5px x25" and which had been invisible to every sweep
  because it is a `<button>`. It sits ABOVE the 12px floor, so it is not an offender and the
  checklist's judgment stands; it is now measured on every run instead of once by hand.
  *Also newly visible: `13.3333px` on buttons such as `button.workflow-list__new` — the user-agent
  default where a control does not set `font: inherit`. Above the floor, so recorded rather than
  changed.*
  *ONE OF THE FIVE FIXED RULES IS WITNESSED, AND THE OTHER FOUR WERE CHASED UNTIL THEY WERE MEASURED
  RATHER THAN ASSUMED.* `.ticket-type-list__badge` is witnessed (4 → 0) and now also carries a
  **`MUST_EXAMINE` coverage assertion**: the route must examine an element with that class, so a 0 for
  a rule that stopped rendering reddens instead of passing. A ratchet at 0 for an absent rule looks
  exactly like a ratchet at 0 for a healthy one, and that was the gap.
  *`.gn-transition-edge__label` — TRIED AND MEASURED UNWITNESSABLE. Its route
  (`/settings/workflows/<id>`) was added, reached by clicking (the list navigates by `router.push`;
  there is no `<a href>`), and reported `{labelsInDom: 0, rulesInDom: 0, flowNodes: 0, flowEdges: 0}`
  with the page a shell of five nav elements. The canvas renders nothing at all at 390px in the seeded
  world. The route was REMOVED rather than kept as a green row meaning nothing — and it was the
  `MUST_EXAMINE` assertion that said so, in one line naming the selector.*
  *`.gn-avatar--small` — UNWITNESSABLE, for a reason read out of the seed rather than guessed: it
  renders only when a card has an assignee, and the Convenience Corner seed **assigns nothing** (zero
  `assign` mentions across `apps/server/src/seed`). It is a `<span>` with direct text, so this sweep
  would report it at 10.4px the moment one exists.*
  *`.escape-chip__hint` and `.upload-chips__chip` are editor chrome inside a ticket's description
  editor; no route here reaches them. All four are fixed and unproven, owner recorded.*
  *`/members` examines ZERO elements today — its roster rows are `li`/`p`, which belong to the body
  sweep's population rather than this one. Its 0 baseline is still a live guard (new label text there
  would be examined and would redden) but it proves nothing now, and it does NOT cover
  `.gn-avatar--small`, which is why it was added. Recorded rather than quietly dropped.*
  *Two route guesses cost a run each and are recorded in the spec so the third person does not pay
  again: `/my-work` carries no project link (it links to ticket surfaces), and `/w/<id>` is not a page
  at all — there is no `app/w/[workspaceId]/page.tsx`, so it renders the 404, a document with a nav and
  prose that would have swept cleanly while measuring nothing. The project links are on `/workspaces`,
  the same page the workspace id came from.*
  *Mutation: revert `.ticket-type-list__badge` to `0.7rem` → 13.265 fails naming four offenders.*
  *Mutation RUN on the coverage assertion itself: point `MUST_EXAMINE` at a class nothing renders →
  `EXIT 1`, "examined no element matching `.ticket-type-list__badge-THAT-DOES-NOT-RENDER`". Restored
  from a copy taken before the edit and re-run green. The assertion had already fired once for real,
  on the workflow-editor route, which is how that route was found to be an empty shell.*

> ### The enumeration that found the offenders was wrong the first time, in the shape this repo collects
>
> The first sweep for sub-floor declarations used a digit pattern — `0\.(6[0-9]|7[0-4])[0-9]*rem` —
> whose alternation requires TWO digits after the point, so it **cannot match `0.7rem`**. It reported
> three offenders, missed two, and reported them in the confident shape of a complete answer. It was
> caught only because an earlier value histogram over the same file, taken a different way, had already
> counted `0.7rem` twice.
>
> Redone by parsing each value and converting to px, the set across all three shipped stylesheets is
> exactly five: `.escape-chip__hint` 10.00px (with `opacity: 0.7` on top of it), `.gn-avatar--small`
> 10.40px, `.upload-chips__chip` 11.00px, `.gn-transition-edge__label` and `.ticket-type-list__badge`
> 11.20px. All five now at `0.75rem`.
>
> The re-scan reports nothing under 12px, and prints a POSITIVE CONTROL from the same run so the
> emptiness is a reading rather than a broken scan: at a 12.5px threshold the same scan reports 22
> declarations in `ui.css`, which reconciles exactly — 20 at 12px plus the two `0.78rem` (12.48px)
> rules.
>
> The after-reading reconciles the same way rather than just reporting a smaller number:
> `/settings/ticket-types` went from `{11.2px: 4, 12px: 10, 14.4px: 5}` to `{12px: 14, 14.4px: 5}` —
> the four badges moved onto the 12px rung, 10 + 4 = 14, and nothing else changed.
>
> The image was confirmed to CARRY the fix before the 0 was believed: `docker exec` grep of the built
> stylesheet reports `font-size:.75rem` on all three `ui.css` rules. A 0 from an unchanged image and a
> 0 from a fixed one print identically, and the recorded trap on the previous pass was a measurement
> taken against an image that predated the change.

## Controls render in the product's font, not the browser's (owner-assigned, 2026-09-08)

*The owner ruled on 2026-09-08 to apply `font: inherit` against `docs/pre-launch-checklist.md`'s
`NEW, 2026-09-08` bullet: 22 unclassed `button` + 2 `.ticket-type-list__new` + 2 `.workflow-list__new`,
all at exactly 13.3333px on the signed-in surface at 390px. The ruling was widened to the signed-out
surface on a measurement taken before the rule was written (see 13.266).*

*IDS ARE PROVISIONAL. §13's header requires block allocation by the controller ON REQUEST and says
never to mint from the maximum. The controller was asked and was mid-incident on a production
sign-in-redirect bug; 13.266–13.267 are the recounted next-free (maximum in use against `origin/main`
is 13.265, and both are free repo-wide) and are to be renumbered if the controller assigns otherwise.
**Recount trap for whoever does this next: `grep -oE '13\.[0-9]+'` matches `13.3333px` and reports a
maximum of `13.3333` — the id pattern collides with the pixel value this very section is about.***

- **13.266** ✅ **No control on the signed-out surface is painted in the browser's font.**
  `apps/web/e2e-viewport/responsive.spec.ts` asserts `measureTypeScale`'s `uaFont` is empty on all five
  routes at all three widths — every examined element's computed `font-family` equals the one `body`
  resolves to. Before → after on `/sign-in`: `{13.3333px: 2, 16px: 3}` → `{16px: 5}`, the two
  `<button role="tab">` in `.gn-view-tabs` (which sets `min-height` and `padding-inline` and no font). —
  (`apps/web/e2e-viewport/responsive.spec.ts`, `apps/web/e2e-viewport/type-scale.ts`,
  `apps/web/app/globals.css`)
  *Mutation RUN, not reasoned: delete `button { font: inherit }` from `globals.css` → **EXIT 1, 6
  failed** — `/sign-in` AND `/help` at all three widths, each naming its own selectors. Restored with
  `git checkout --` from a commit made BEFORE the mutation (never from an uncommitted tree) and re-run
  green: 19 passed, EXIT 0.*
  *THE MUTATION FOUND A SITE NO SIZE INSTRUMENT COULD HAVE: `button.gn-help__tab` was rendering at
  **16px in Arial**. `ui.css:1321` sets `font-size: 1rem` and no `font-family`, so its SIZE was already
  correct and the defect was invisible to the 12px floor, to the size histogram, and to the raised-floor
  enumeration that found the original 26. **This is the case for reading font-FAMILY rather than
  asserting the `13.3333px` bucket is absent** — the bucket form would have passed here, and would pass
  again the day a UA constant changes.*
  *`font: inherit` is the SHORTHAND and carries `font-weight` and `line-height` too, so the row was
  read for those and not just for size: `.gn-help__tab[aria-pressed='true']`'s deliberate
  `font-weight: 600` SURVIVES (0,2,0 beats 0,0,1), measured 600/400 before and after. Boxes: help tabs
  unchanged at 366x44; sign-in tabs 67x44 → 74x44 and 85x44 → 96x44 — wider, never shorter, because
  `min-height: 2.75rem` holds the height. Tap-target offender counts are byte-identical before and
  after on every signed-out route (10/16/16 on `/help`, 0 elsewhere), so no ratchet moved.*
- **13.267** 🟡 **The same guard on the signed-in surface, over the five stack routes.**
  The assertion is written in `apps/web/e2e-stack/viewport.spec.ts` beside the existing type-scale
  ratchet and is collected by that suite. — (`apps/web/e2e-stack/viewport.spec.ts`)
  *🟡 AND NOT ✅ FOR ONE STATED REASON: it has not been RUN. The signed-in suite measures the compose
  web container, which must be rebuilt to carry the new stylesheet, and at the time of writing those
  containers are serving the owner, who is testing the product by hand. The controller instructed that
  they not be rebuilt or restarted without clearance. **The 26 controls this ruling is actually about
  are therefore fixed-but-unwitnessed**, exactly the status `.gn-transition-edge__label` carries above,
  and for a comparable reason: the instrument is unavailable, not absent. Flip to ✅ on a green run
  after the rebuild window; do not flip it on the strength of the signed-out result.*


## The magic link lands on the app, not the API (owner-dispatched P1, 2026-09-08)

*The owner signed in by hand on 2026-09-08 and the link dead-ended on a JSON 404.
`apps/web/app/sign-in/page.tsx` handed better-auth a RELATIVE `callbackURL`, which the browser resolves
at the moment the token is verified — and at that moment it is on the API origin, because that is where
the emailed link points. Measured on the dev stack: `:3001/workspaces` → **200**, `:3000/workspaces` →
**404**. Not a dev-stack artefact: `deploy/do/app.yaml` puts production on two sibling subdomains
(`pm.artsourced.in`, `pm-api.artsourced.in`), the same split, so every magic-link sign-in in production
ended on raw JSON at the API host — the first thing a new user would ever have seen.*

*The dispatch named the magic link. **`signIn.social` had the identical shape** and is fixed in the same
change; two call sites, one bug.*

- **13.268** ✅ **An ABSOLUTE `callbackURL` on `WEB_ORIGIN` is accepted (200).** The value the shipped
  page now sends. Requirement 1 said verify rather than assume: the behaviour was first read out of
  better-auth's `origin-check.mjs` (`isTrustedOrigin(url, { allowRelativePaths: true })`) and then
  measured, because reading is not measuring. — (`apps/server/test/auth/trusted-origins.test.ts`)
  *Mutation: drop `trustedOrigins` from `createAuth` → the absolute callback is refused and the
  client-side fix would trade a 404 for a 403 rather than working.*
- **13.269** ✅ **An absolute `callbackURL` on an UNTRUSTED origin is refused `403
  INVALID_CALLBACK_URL`.** — (`apps/server/test/auth/trusted-origins.test.ts`)
  *The refusal side of 13.268, and not optional: **"the absolute URL is accepted" is equally true of a
  server that validates nothing at all.** A bound asserted on one side of its line is the failure this
  very file already records for `sign-in-flows.test.ts`.*
- **13.270** 🟡 **Following the magic link LANDS THE BROWSER ON THE WEB APP** — origin asserted, not
  merely "the path no longer says /sign-in". — (`apps/web/e2e-stack/helpers/sign-in.ts`)
  *🟡 because it has not been RUN: it needs the compose stack rebuilt to carry the fixed page, and the
  rebuild window opened only as this was written. **Flip to ✅ on a green stack run, not before.***
  *THE ASSERTION IT REPLACES IS A CHECK THAT COULD NOT FAIL, and it is why this defect reached the
  owner's hands: `waitForURL((url) => !url.pathname.includes('/sign-in'))` **is satisfied by a JSON
  404.** It asserted the user LEFT the sign-in page and never that they ARRIVED anywhere.*
  *WHY NOTHING DOWNSTREAM NOTICED, which is the part worth carrying: on localhost the web and API
  ports **share cookies**, so the session was genuinely set and every later test navigated explicitly
  and passed. **The property that made the suite green is the same property that concealed the
  defect** — which is exactly why the new assertion is on ORIGIN and not on "some page loaded".*
  *⚠ A LOCALHOST GREEN DOES NOT PROVE THIS, stated in those words per the dispatch's requirement 3.
  The dev stack is two PORTS on one host; production is two SUBDOMAINS. The test proves the browser
  ends on `WEB` rather than `SERVER`, which is the defect's actual signature and does discriminate.
  It does NOT exercise cross-subdomain cookie behaviour, and nothing in this repo can today.*
- **13.271** ✅ **The page sends an ABSOLUTE `callbackURL`, for BOTH the magic link and Google.**
  Pinned as the literal resolved URL rather than rebuilt from `window.location.origin`, which would
  restate the implementation and pass for a relative value too. — (`apps/web/test/sign-in.test.tsx`)
  *Mutation RUN: revert both call sites to `callbackURL: next` → **EXIT 1, 6 failed**, the magic-link
  and Google cases naming the relative value. Restored from a commit made before the mutation.*
- **13.272** ✅ **`?next=` is constrained to a same-site PATH, so it cannot steer the authenticated
  callback off-site.** Four hostile shapes: protocol-relative `//evil.example`, absolute
  `https://evil.example`, backslash-authority `/\evil.example`, and schemeless junk. —
  (`apps/web/test/sign-in.test.tsx`)
  *This guard is load-bearing BECAUSE of 13.271. A bare `next` was already reaching `router.push`,
  where `//evil.example` navigates off-site; making the callback absolute would additionally have fed
  `new URL()` an attacker's absolute URL, turning a client-side redirect into an authenticated one.
  better-auth refuses to send a token there (13.269 proves it) — but a hole this file opens should not
  be closed by a library's check.*
  *⚠ AN ASSERTION THAT COULD NOT FAIL WAS FOUND INSIDE THIS CASE BY MUTATION, AND FIXED. The first
  version asserted only the callback's ORIGIN. Removing the guard killed three of the four rows —
  `not-a-path` stayed green, because `new URL('not-a-path', origin)` resolves SAME-ORIGIN. One row that
  could not fail, hiding inside a set that could, and invisible while the suite was green. The
  assertion now pins the whole resolved URL, and the re-run of the same mutation kills **4 of 4**.*

## Security headers beyond HSTS (owner-assigned, 2026-09-08)

*Before this the whole product sent exactly ONE security header — `hsts.ts`'s `Strict-Transport-Security`.
A sweep of `apps/server/src` and `apps/web/next.config.ts` for `helmet`, `Content-Security-Policy`,
`X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy` and `Permissions-Policy` returned nothing
else. The gap had been carried as open in the executor handoff for days. The owner ruled on 2026-09-08:
close the unambiguous part, defer CSP.*

- **13.256** ✅ The three ride on an ordinary answered request. — (`apps/server/test/http/security-headers.test.ts`)
- **13.257** ✅ …and on a **404 and an unauthenticated 401** too. That is why the hook is a root
  `onRequest` and not an `onSend`: a browser's first meeting with an unfamiliar host is often an error
  reply, and a header that appeared only on 2xx would be absent exactly then. —
  (`apps/server/test/http/security-headers.test.ts`)
- **13.258** ✅ They do **not depend on the `options.security` block being configured** — the same three,
  byte for byte, from an app built with it and one built without. `buildTestApp` passes no security
  options and roughly sixty other call sites do the same, so a header registered inside that block is a
  control that exists only in the configuration nobody exercises. —
  (`apps/server/test/http/security-headers.test.ts`)
  *Mutation: move the hook inside the block → 13.258 fails.*
- **13.259** ✅ Each VALUE is pinned, not merely "three headers are present": `nosniff`, `DENY` (not
  `SAMEORIGIN` — nothing this server returns is a document meant to be framed by anything, itself
  included), `no-referrer`. And **CSP and Permissions-Policy are asserted ABSENT**, so adding either is a
  deliberate act that reddens a test rather than a quiet drift. —
  (`apps/server/test/http/security-headers.test.ts`)
  *Mutations: weaken `DENY` to `SAMEORIGIN` → fails. Add a CSP to the set → fails.*
- **13.260** ✅ The web app sends all three over **http AND https**, both inputs in one case — either
  alone passes for a function that gates everything on the protocol, which is exactly the shape this
  replaced. `referrer-policy` is `strict-origin-when-cross-origin` here and `no-referrer` on the API,
  deliberately: this is a document origin and that one is never a page a browser navigates FROM. —
  (`apps/web/test/next-config.test.ts`)
  *Mutation: restore the `if (!https) return []` gate → 13.260 fails.*
- **13.261** ✅ The web app sends **no `Content-Security-Policy` and no `Permissions-Policy`** — deferred
  by the owner, and pinned so adding one is deliberate. A CSP for this app is a real design problem
  (webpack rather than Turbopack, `output: 'standalone'`, a rewrite-based same-origin proxy) whose
  failure mode is breaking in production only. — (`apps/web/test/next-config.test.ts`)
  *Mutation: add a CSP to `headers()` → fails.*

- **13.263** ✅ The web app does **not advertise its framework** — `poweredByHeader: false`. Found by
  CURLING THE RUNNING CONTAINER, not by reading the source: the sweep that produced the rest of this
  section looked for headers that were MISSING and had no way to notice one that was present and
  unwanted. `/sign-in` answered with `X-Powered-By: Next.js` and nothing in this repo had recorded it.
  Not a vulnerability and removing it is not a defence — anyone can fingerprint Next.js from `/_next/`
  asset paths in the HTML — but it is a header the product never chose to send, naming its framework to
  every client for no benefit to any of them, and the cost of not sending it is one line. —
  (`apps/web/test/next-config.test.ts`)
  *Mutation: set it back to `true` → 13.263 fails.*

> ### 13.248 was a weaker claim wearing a stronger sentence
>
> It read *"sends NOTHING for an http `SERVER_ORIGIN`"* and asserted `toEqual([])`. That passes just as
> happily if `headers()` is deleted outright, so what it actually measured was "the function returns an
> empty array", not "HSTS is withheld over http". Landing three headers that legitimately ship over http
> forced the distinction. It now names the header that must be absent and asserts the others are there,
> which fails if the protocol gate is removed AND if the function stops being wired.


## Tap targets, measured and moved (owner-assigned, 2026-09-08)

*Pre-launch item 6/7 recorded tap targets as "reported, not fixed — an owner call about the design".
Assigned 2026-09-08. No new case ids: the viewport suite's ratchet (13.254–13.255) already IS the test,
and minting cases that restate a committed baseline would be numbering the same evidence twice. What
changed is the baseline, and this is the reading behind it.*

| route × viewport | before | after |
|---|---|---|
| `/sign-in` × phone-390 · tablet-768 · desktop-1512 | 6 each | **0 each** |
| `/help` × phone-390 | 10 | 10 |
| `/help` × tablet-768 · desktop-1512 | 16 each | 16 each |
| **total** | **60** | **42** — 18 removed |

**Three fixes, each traced to a measurement rather than a guess:**

- `.gn-button` was **`340x38`** — six pixels short of 44, *everywhere it is used*, which made the shared
  button the single largest source of offenders in the product. `display: inline-flex` is the
  load-bearing half: a button whose height was padding plus one line of text ignores `min-height`
  otherwise.
- `.gn-view-tabs button` was **`55x21`**. The same class carries the board's view tabs, which the
  pre-launch review measured at `52x21` — one rule, both surfaces.
- `.gn-sign-in__method label input` was **`340x21`**. Unclassed `<input>`s inside their labels, so the
  label is the only handle. `font-size: 1rem` went with the height: under 16px iOS Safari zooms the
  viewport on focus.

**`/help` does not move, and that is a decision rather than a leftover.** Its offenders are
`a.gn-help__toc-link`, raised from **23px to 24px** — WCAG **2.5.8**'s floor, which they now meet. The
suite enforces **2.5.5**'s enhanced 44px, and a nineteen-entry table of contents at 44px each is 836px
tall on a 390px phone. Dense in-list links stay at 24; standalone controls use 44. The ratchet holds the
count so it can fall again but never rise.

### The signed-in shell had no tap-target guard at all

The pre-launch review measured 48 interactive elements under 24×24 on the board and recorded them as
"reported, not fixed". **Nothing pinned them.** `e2e-stack/viewport.spec.ts` measured OVERFLOW only, and
the unauthed suite cannot see these pages — so the one place those counts existed was a prose note in a
checklist, which no run can contradict. It now carries the same sweep, the same 44px threshold and the
same ratchet, against `e2e-stack/tap-target-baseline.json`.

| signed-in `/my-work` at 390px | offenders | smallest examined |
|---|---|---|
| with `.gn-button` fixed (first reading) | 9 | `89x23` — the nav's links |
| after `.gn-nav a, .gn-nav button` → 44px | 7 | `249x23` — `button.gn-attention__title` |
| after the nav MIN-WIDTH and the title buttons → 24px | **6** | `249x24` |

**Forcing the ratchet to 0 to print all seven, instead of re-reading the smallest, is what finished
this.** The list was not what the previous fix assumed:

```
 39x44  a.gn-nav__inbox "Inbox"          <- tall enough, six pixels too NARROW
249x23  button.gn-attention__title  (x4)
249x23  button.gn-my-work__title    (x2)
```

`.gn-nav a, .gn-nav button` had only `min-height`. **A tap target is a box**, a short word is a narrow
target, and re-reading the COUNT would never have shown it — the count was 7 either way. Same shape as
the `340x38` miss earlier in this section, one axis over.

The six title buttons went to 24px, WCAG 2.5.8's floor, and deliberately not 2.5.5's 44: they are bare
text buttons sharing a baseline with a chip and a reason on the same row (`.gn-attention__item` is
`align-items: baseline`), and 44px would break that alignment and turn a compact strip into a list of
slabs. `inline-flex` is the load-bearing half — `padding: 0` means the button's height IS its line box,
so `min-height` alone does nothing to it.

The sweep is IMPORTED from `e2e-viewport/tap-targets.ts`, a plain module. The first attempt imported it
from `responsive.spec.ts` and **Playwright loaded that spec's `test()` registrations into the stack
config** — six `project "" has no entry in VIEWPORTS` failures from an import that typechecked and read
as harmless. A spec is not a library. The move was verified not to shift any number: the unauthed suite
re-ran 19 passed with byte-identical readings.

**The remaining 7 are dense in-list controls** — attention-row titles at `249x23`, the same shape as
`/help`'s TOC links. By the rule this change follows they should go to 24px (2.5.8) rather than 44px.
**Not shipped, deliberately:** the compose `web` container serves a pre-built image, so verifying one
more CSS rule costs a full rebuild — and this session has already had one of those die on `ENOSPC`
mid-run. An unverified CSS change is exactly what the two process notes below are about. The number is
recorded so the next person starts from a reading rather than a guess.

> ### Two process notes from this run
>
> **A `python3` `.replace()` with no assertion is a silent no-op.** The first attempt at the
> `.gn-button` fix matched against whitespace-collapsed text that only existed in my own earlier
> `print`, so nothing was edited — and the re-measurement, unchanged at `340x38`, is what said so before
> the assertion did. Every edit in this change asserts its anchor is present first.
>
> **`UPDATE_TAP_BASELINE=1` does not lower a number.** `recordTapBaseline` writes only ABSENT keys, on
> purpose, so a branch that made things worse cannot re-baseline itself upward — the file's own docblock
> says falling numbers are re-recorded by deleting it. Two runs reported "0 removed" before that was
> read rather than assumed.

## The ledger guard for a PR that never merged (2026-09-08)

*`mcp-server/12` read `in-flight  324  -` while the work had landed through **#329**. Merging #323
deleted `exec/111`, which was #324's base, so GitHub auto-closed #324 as closed-not-merged — the same
mechanic that had already closed #313/#315/#317/#319 that night. The row survived saying "in flight,
see #324", pointing whoever restarts from this file at a closed PR for work that shipped hours earlier.*

- **13.262** 🚫 The guard's own cases live in `scripts/check-task-ledger.mjs`'s **self-test** (four
  inputs with known answers, run before the real sweep) rather than as vitest cases — the same shape
  `check-runbook-commands.mjs`, `check-case-ids.mjs` and `check-case-citations.mjs` use, and for the
  same reason: a gate must refuse to certify anything when its own instrument is broken, and a matcher
  that silently matched nothing would report "no bad citations" on every run. The four: a row citing a
  never-merged PR → 1; a row citing a **merged** PR with a non-`done` status → 0 (without this the
  guard is "any non-done row fails", a different check wearing this one's name); a row with no PR at
  all → 0; one offender among three sound rows → 1.
  *Controlled: replacing the matcher's predicate with `false` makes `pnpm check:tasks` exit 1 naming
  two of the four before the ledger is read. Controlled again against reality: pointing
  `mcp-server/12` back at `#324` fails with `LEDGER ROWS CITING A PR THAT NEVER MERGED`, naming the
  row, its `file:line`, its status and that PR's title.*

> ### Why nothing already here could see it
>
> `done` rows are validated by sha reachability against `origin/main`. A **non-`done` row requires no
> evidence BY DESIGN** — that is the entire point of the status split, and the reason `claimed` exists.
> So a wrong status carrying a stale PR number is invisible to every other check in the file, and the
> ledger is the restart surface: the one artefact a controller reads to find out what is still owed.
>
> It is a hard failure rather than a printed note, unlike the reverse-drift list beside it. An unciteed
> merged PR is often a docs or ruling PR that legitimately closes no task, and this repo has many. A row
> citing a PR that never merged is always one of exactly two real problems: the row is stale, or the
> work is not on `main` at all.

