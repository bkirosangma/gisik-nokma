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
line would have been handed an occupied block. ~~**Block `13.266`–`13.275` is allocated to the serial
executor (controller, 2026-09-08); the next free BLOCK is `13.276`, controller-allocated ON REQUEST
ONLY.**~~ **SUPERSEDED 2026-09-08 (same day, one change set later).** `13.266`–`13.275` is EXHAUSTED
and `13.276`–`13.280` are CONSUMED by the sign-in bucket (see that section at the foot of this file):
the block was requested from the controller and used provisionally rather than waited on, because
serial mode has one executor and therefore no competing claimant, and an id that has not merged can
still be renumbered. ~~**The next free BLOCK is `13.281`, controller-allocated ON REQUEST ONLY.**~~ **`13.281`–`13.320` is ALLOCATED to the serial executor (controller, 2026-09-08) — `13.281`–`13.284` minted by the HIG palette adoption and the border sweep, `13.285`–`13.287` minted by Task 0 of the HIG per-screen plan, `13.288`–`13.294` by Tasks 1 and 2, `13.295`–`13.319` reserved by the per-screen plan for Tasks 3–11, `13.320` reserved and deliberately unused. `13.321`–`13.326` is ALLOCATED to the owner's sign-in feedback round (controller, 2026-09-08): `13.321`–`13.323` minted by items 1 and 3, `13.324`–`13.326` by item 2. `13.327`–`13.333` is ALLOCATED to Task 12 (passkey registration), of which `13.333` is the rate-limit property. `13.334`–`13.336` is ALLOCATED to round 2c, the phone gating (controller, 2026-09-08). ~~The next free BLOCK after that is `13.337`, controller-allocated ON REQUEST ONLY.~~** **`13.337`–`13.356` is ALLOCATED to the neomorphism-amendment's Tasks 14 and 15 (AMENDMENT 2026-09-09 to `docs/superpowers/plans/2026-09-08-hig-per-screen.md`) — `13.337`–`13.347` minted by Task 14 (the style axis, the toggle, and the shared-pieces restyle; this PR), `13.348`–`13.356` reserved for Task 15 (the sign-in/workspaces/invite neo restyle, not yet landed). The next free BLOCK is `13.357`, controller-allocated ON REQUEST ONLY.** A lane takes its assigned block and does not derive the next free id from this file — recount
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
  *SELECTOR RENAMED 2026-09-15, finding unchanged: `.gn-help__tab` no longer exists — `/help`'s
  document switch became the shared `SegmentedControl`, and the class's one remaining user,
  `apps/desktop`'s help toggle, is now `.gn-help__toggle`. The record below is kept verbatim because it
  documents how the defect was FOUND; only the name it was found under has moved. See 15.22.*
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
- **13.267** ✅ **The same guard on the signed-in surface, over the five stack routes.**
  `apps/web/e2e-stack/viewport.spec.ts` asserts `uaFont` is empty on all five. **RUN after the rebuild
  window opened: 1 passed, EXIT 0, zero font-family offenders and ZERO `13.3333px` readings anywhere on
  the signed-in surface** — the 26 controls this ruling is about. —
  (`apps/web/e2e-stack/viewport.spec.ts`)
  *The container was confirmed to CARRY the fix before the zero was believed, because a 0 from an
  unchanged image and a 0 from a fixed one print identically: the served stylesheet contains
  `button{font:inherit}`, fetched over HTTP from the running container.*
  *POSITIVE CONTROL ON THE NULL: all five routes printed a histogram, so the zero is a reading rather
  than a sweep that never ran. That control earned itself twice in this task — an earlier attempt
  addressed the test by LINE NUMBER (`viewport.spec.ts:220`), the line had moved, and playwright ran
  **nothing** in 20ms while the greps for `13.3333` and for offenders both returned a clean-looking 0.
  A second attempt died in `globalSetup` and printed the same reassuring zeros. **Neither zero meant
  anything, and neither was distinguishable from success without the control.** Address a test by
  TITLE, not by a line number that any edit above it invalidates.*
  *SCOPE, MEASURED ON THIS SURFACE TOO: the board still reads `{12.48px: 26, 12.8px: 24, 13.6px: 6,
  16px: 48}` — `.gn-board-card__provenance` unmoved at 12.48px x26. The element selector loses to every
  class rule, which is the ruling's "and no further" as a measurement rather than a promise.*


## One limiter on `/api/auth/*`, and it is ours (controller ruling, 2026-09-08)

*better-auth's own limiter could not tell clients apart — `createRateLimitKey(ip ?? NO_TRUSTED_IP_KEY, path)`
(`dist/api/rate-limiter/index.mjs:245`) with `getIP()` falsy is **one shared bucket per path, for
everybody**. `auth.ts` now sets `rateLimit: { enabled: false }`; our limiter, which keys per client
address under `TRUST_PROXY`, becomes the single authority. `RATE_LIMIT_AUTH_MAX` is untouched — it was
never the binding constraint, and now it is the control everyone already believed it was.*

- **13.273** ✅ **better-auth's limiter does not answer on `/api/auth/*`, and the refusal that does
  arrive is OURS — identified by BODY, not by status.** Seven requests at `authMax: 6`: the **sixth**,
  which is past better-auth's own `max: 5` for the magic-link path, must not carry
  `Too many requests. Please try again later.`; the **seventh** must be `429` with
  `{"error":"rate_limited","retryAfterSeconds":60}`; and a second address must not be refused at all. —
  (`apps/server/test/http/security-middleware.test.ts`, `apps/server/src/auth/auth.ts`)
  *A bare 429 cannot tell the two limiters apart, which is exactly what kept this invisible. The body is
  the discriminator that found the bug, inverted into the guard.*
  *Mutation RUN: `rateLimit: { enabled: true }` → **EXIT 1**, the sixth request refused with
  better-auth's own body quoted back in the failure message. Restored, re-run green, 58 passed.*
  *⚠ **THE MUTATION IS `enabled: true`, NOT DELETING THE LINE**, and the first version of this case got
  that wrong and passed 59/59 against its own defect. better-auth's default is
  `enabled: options.rateLimit?.enabled ?? isProduction` (`dist/context/create-context.mjs:171`) and
  vitest sets `NODE_ENV=test`, so deleting the line leaves the limiter OFF and the mutation mutates
  nothing. **That NODE_ENV-dependent default is also why no server test ever exercised this, and why it
  shipped unseen** — the same objection `auth.ts` already records against `skipOriginCheck`.*
  *⚠ **WHAT THIS CASE CANNOT PROVE, and the reason is worth more than the case.** It does NOT reproduce
  the shared bucket. `app.inject` clients are only distinguishable by `X-Forwarded-For`, and an
  `X-Forwarded-For` is also enough for better-auth's `getIP()` to RESOLVE — at which point better-auth
  separates clients too and the defect vanishes from the harness. **The property that makes two clients
  distinguishable here is the same property whose absence causes the bug.** Measured, not assumed: with
  the limiter re-enabled, a second client's first request came back `500`, its own budget, not `429`.
  The shared-bucket claim rests on the dev-stack measurement in `docs/pre-launch-checklist.md`.*
- **13.274** 🧪 **The "could not determine a client IP" warning is GONE from the running server, and the
  fix is witnessed by BEHAVIOUR as well as by absence.** Rebuild the server container, then send eight
  magic-link requests. — (`apps/server/src/auth/auth.ts`, manual against the dev stack)
  *Measured 2026-09-08. **Before:** the warning appeared **2 times** in the running server's log (once
  per process start — it is gated by `ipWarningLogged`), and the sixth send was better-auth's `429`.
  **After:** **8/8 sends returned `200`** and the warning appears **0** times.*
  *POSITIVE CONTROLS on the null, because an absence proves nothing on its own: the same run reports 39
  log lines, 16 `incoming request` lines and 8 `sign-in/magic-link` lines. **A first attempt at this
  check reported 0 warning hits AND 0 for a line known to be present** — the proxied-pipe silent-empty
  mode — and without the control it would have been filed as "already gone".*
  *🧪 rather than ✅ because it needs a container rebuild and a real process start; `onRequestRateLimit`
  returns at its first line under `enabled: false`, so the warning cannot fire, and 13.273 is the
  automated half of the same claim.*

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
- **13.270** ✅ **Following the magic link LANDS THE BROWSER ON THE WEB APP** — origin asserted, not
  merely "the path no longer says /sign-in". — (`apps/web/e2e-stack/helpers/sign-in.ts`)
  *RUN after the rebuild: every stack test that signs in goes through this assertion, and the three
  that reached it passed (`smoke.spec.ts` x2, `viewport.spec.ts:66`). The container was confirmed to
  carry the fix first — the served sign-in chunk contains `location.origin`, fetched over HTTP.*
  *MUTATION RUN, and it needed no rebuild, which is the trick worth keeping: **the emitted link carries
  `callbackURL` in its own query**, so rewriting it to the pre-fix relative value in the helper puts the
  server in exactly the state it was in before the fix, from the test process. Result: **EXIT 1**, and
  the assertion named the site — `after following the magic link the browser is on
  http://localhost:3000/workspaces, not the web app at http://localhost:3001`, `Received:
  "http://localhost:3000"`. Restored and re-run green.*
  ***THE OLD ASSERTION WOULD HAVE PASSED THAT EXACT RUN.*** The mutated landing path is `/workspaces`,
  which contains no `/sign-in`. So this is not merely "the new check fails when the code is broken" —
  it is the direct demonstration that the check it replaced could not distinguish the defect from
  success. Requirement 4 of the dispatch, satisfied against the property that mattered.*
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


## The sign-in bucket (2026-09-08) — the follow-up the better-auth ruling recorded

*Block note: `13.275` is the last id of the executor's `13.266`–`13.275` allocation; `13.276`–`13.280`
are taken from the next block, **requested from the controller and used provisionally** rather than
waited on — serial mode has one executor and therefore no other claimant, and an unmerged id can still
be renumbered. **The next free BLOCK is now `13.280`, controller-allocated ON REQUEST ONLY.** Recount
the maximum in use against `origin/main` before trusting that pointer; this file records twice that a
next-free pointer is a cache which goes stale silently, and this line is one more of them.*

- **13.275** ✅ A sign-in path is refused at its own, tighter ceiling while the SAME client's
  `/api/auth/get-session` — one request later, out of a 100-request general budget that three requests
  could not have exhausted — is still served. The load-bearing case. Both buckets answer with the same
  body, so unlike 13.273 the body cannot say which limiter refused; the discriminator is the **ordinal,
  with its positive control in the same pair**. `authMax: 100` against `signInMax: 2` is a STRUCTURAL
  separation, not a comment: were the two equal the general bucket would refuse at the same ordinal and
  the case would pass with the sign-in bucket deleted.
  *Controlled: a matcher hard-wired to `false` reddens this and 12 others.*
- **13.276** ✅ A sign-in request is charged to the general auth bucket **as well**, not instead of it —
  two sign-ins against `authMax: 2` leave `get-session` refused. The anti-**loosening** guard, and the
  case that goes red if someone "simplifies" the hook into charging one bucket or the other: that
  refactor reads as a tidy-up and would hand a client `authMax + signInMax` requests against the mount
  where it gets `authMax` today, reversing the third ground of the ruling that authorised the bucket.
  *Controlled: making the bucket replace rather than add reddens this and 13.273.*
- **13.277** ✅ Every alternative spelling of a sign-in path that still reaches the vendor handler is
  matched — query string, trailing slash, doubled slash, dot segment, mixed case, percent-encoding, and
  a malformed escape *inside* a sign-in path — while the paths better-auth never tightened are not:
  `get-session`, `sign-out`, `/phone-number/*`, the mount root, and a path outside the mount. **The
  negative rows are half the case**: a matcher returning `true` unconditionally satisfies every positive
  row, and `get-session` is the row that refuses it — sweeping the highest-frequency signed-in path into
  a half-size budget would be a self-inflicted outage, not a tightening.
  *Controlled four ways, each killing its own row and no other: deleting the dot-segment resolution, the
  doubled-slash collapse, the lowercase, or the decoded candidate. No normalisation here is dead code.*
  *One row asserted the wrong thing when written and the run is what caught it — `/api/auth/%zz` was
  expected to match on the theory that an unparseable target should get the tighter bucket. `new URL()`
  does not throw on a bad escape; only `decodeURIComponent` does. The expectation was wrong, not the
  code.*
- **13.278** ✅ A **doubled-slash** spelling is charged to the sign-in bucket at the wire, through the
  real hook rather than the matcher alone.
  *Scoped deliberately, and the dot segment is NOT what it asserts. Measured with a probe recording
  `request.url` at `onRequest` on both transports: `app.inject` resolves `/api/auth/x/../sign-in/...`
  to `/api/auth/sign-in/...` before any hook runs, while a **real socket delivers it verbatim and it
  still routes to `/api/auth/*`**. So the production hazard is real and the injection harness is blind
  to it by construction — a case asserting it here PASSED with the matcher's URL resolution deleted,
  i.e. a check that cannot fail for the reason its name gives. It was rewritten around the doubled
  slash, which the probe shows `inject` delivers verbatim, rather than kept as a green tick meaning
  nothing — the same call 13.273's author made in #347.*
- **13.279** ✅ `signInMaxFor` is half the auth budget — **5** at the shipped `RATE_LIMIT_AUTH_MAX=10`,
  30 at the dev stack's 60 — never 0, and **strictly** smaller than `authMax` for every budget above 1,
  with `authMax: 1` asserted as the one named exception. Both invariants are load-bearing: a bucket of 0
  refuses the FIRST request, and a bucket that equals `authMax` refuses at the same ordinal as the
  general one and so changes no verdict.
  *Controlled: returning `authMax` unchanged reddens it.*
  *Two corrections from review, both in this one case. Its NAME was "returns better-auth's magic-link
  max at the shipped default" — **a false claim pinned where it reads as measured.** 5 is the same
  integer, but better-auth keyed per (ip, PATH), so each leg of a sign-in cycle had its own 5; this is
  one bucket across the family and a cycle costs two of it, i.e. 2 complete cycles per window against
  better-auth's 5. And the bound was `toBeLessThanOrEqual(authMax)`, which **admitted the single value
  (`authMax: 1`) at which the docblock's own stated failure — inertness — actually occurs**: a gate
  closing one end of a range, the exact shape this file catalogues.*
- **13.280** ✅ `retry-after` is a **lower** bound when the two buckets' windows opened at different
  instants: a caller refused by `auth:` is charged to `signin:` anyway, so `signin:`'s window opens
  later and outlives it. Measured at production-shaped config — told **1 second**, refused for **59
  more** — and the case asserts exactly that, `[1,1,1,1,1]` then a 429 carrying 59.
  *Pinned rather than fixed, and pinned rather than left as prose. It is a HINT being short, never a
  bound admitting too much: the early caller gets another 429 with a fresh figure. The correct fix
  needs each bucket's window END, which `RateLimitVerdict` does not carry, and widening that contract
  touches all five buckets to sharpen an advisory header. **Owner: whoever next changes
  `RateLimitVerdict`** — and this case is what that change flips.*
  *Found in review against a comment in `app.ts` that asserted the OPPOSITE as an invariant the code
  upheld. The `Math.max` it pointed at covers only the both-refuse-the-same-request shape.*


## The HIG palette adoption (2026-09-08) — block `13.281`–`13.320`

*Both cases pin a place where the adoption deliberately did NOT follow Apple. Neither departure is
visible from reading the palette — the values look reasonable, and the harm is a ratio you have to
compute against one specific background — which is exactly why they are cases and not comments.*

- **13.281** ✅ `success` is not Apple's increased-contrast green, and the case computes *why* rather
  than restating the ruling: `successText` on Apple's `#248A3D` measures **4.40** against 4.5, while the
  kept `green700` `#1e7a34` measures **5.40**. The counterfactual is calculated in the test against the
  same foreground the shipped palette actually puts on it, so "complete the palette" arrives as a red
  test naming the pair instead of a shipped 4.40.
  *Controlled: swapping in `#248a3d` reddens **two** guards — this case (naming the hex) and the
  data-driven declared pair, which prints **4.395**. Two independent witnesses for one defect.*
- **13.282** ✅ `textMuted` and `categoryOpen` must not resolve to the same primitive. They shared
  `inkMuted` before this change, which is precisely the shape that invites reuniting them. Apple's
  accessible grey `#6C6C70` is correct for a chip dot's 3:1 and **wrong for read text at 4.16 on
  `surfaceSunken`** — and `textMuted on surfaceSunken` is a declared pair because `/mcp/tokens` puts
  muted text on a sunken row.
  *Controlled three ways, and the second and third matter more than the first: reuniting them on the
  safe grey reddens the identity assertion; reuniting them on the DOT grey reddens this case **and** the
  declared pair, which prints **4.164** — the figure §8 predicted and an independent solver computed,
  agreeing three ways; and making the dot grey clear 4.5 reddens the assertion that states the REASON,
  so the case cannot keep passing while its own explanation has become false.*

> **Not in this change, and deliberately: the `border`-on-`surface` and `focusRing`-on-`surface` pairs.**
> Ruling R1(c) drops borders in favour of fill, so the `border` role must be remapped to a grey that
> clears 3:1 *and* the declarations that paint it must be removed. **Those are one atomic change.**
> Landing the remap alone would give every card, chip, table cell and column a heavy dark rule, and
> **no gate would object — a *darker* border fails nothing** — leaving the product visibly wrong on
> `main` between two PRs while it is being tested by hand. The measurement the sweep starts from, taken
> here: `border` on `surface` is **1.34** light and **1.49** dark against 3:1.


## The border sweep (2026-09-08) — R1(c) applied, and the number that closed

- **13.283** ✅ Non-text contrast (WCAG 1.4.11) across the rendered signed-in surface: **zero classes
  below 3:1**, product-wide, on five routes.
  *This case changed shape mid-change and the reason is the useful part. It was written to RECORD, not
  assert, because the defect was live at **13 of 20**. It carried
  `expect(examinedTotal).toBeGreaterThan(20)` to guard the real hazard that **a sweep matching nothing
  reports zero offenders — the best possible result and the least trustworthy one.** The sweep then
  removed 54 borders, the population fell to **19**, and the guard went RED. It was working; its
  threshold had become an assumption about a population this very change was designed to shrink.*
  *It was **not** lowered to 19 — that is moving a bar to meet a result. It was replaced by a control
  that runs through the SAME path as the measurement: **the same sweep, on the same rendered page,
  re-run at 25:1, must report offenders.** A sweep that answers "zero below 3" AND "zero below 25" is
  not measuring anything, and that control stays honest at any future population.*
  *The instrument composites alpha, which `relativeLuminance` cannot — the checklist records that mode
  reading 11.87 where the truth is 1.85, a false GREEN. Every fill R1(c) introduces is `rgba()`.*
- **13.284** ✅ A non-primary control is identifiable without a boundary — the affordance is fill plus an
  accent-coloured semibold label, and the case measures which of the two actually carries it.
  *Measured, because the ruling explicitly declined to assert it: **the FILL is 1.09–1.15 against every
  surface and carries nothing.** The **LABEL** measures **5.31–6.81**, well past the 4.5 it owes as text.*
  *The reading, stated as a reading: WCAG 1.4.11 asks for 3:1 on "visual information required to
  identify" a component; where the label does the identifying and clears 3:1 several times over, the
  fill is reinforcement rather than the identifying signal. **Its weakest point, named rather than
  omitted: this product colours links with the same accent, so accent-plus-semibold is not UNIQUELY a
  button.** What is left to separate them is fill, radius and a 44px target — each individually
  sub-3:1. A reader who thinks that insufficient should reopen R1, which is the owner's call.*

> **THREE FIELDS ARE DELIBERATELY NOT SWEPT, and this is requirement 4's "say so" half.**
> `.gn-sign-in__method label input`, `.gn-mcp-authorize__input` and `.gn-notfound__link` keep their
> borders. **13.284's argument does not transfer to them:** an EMPTY text field has no accent label
> inside it, so removing its boundary leaves a 1.09–1.15 fill as the only thing marking it, which I
> believe genuinely fails 1.4.11. The ruling says to come back rather than quietly ADD a boundary; the
> same logic forbids quietly REMOVING one. Looked at directly on `/sign-in`, the bordered phone field
> reads correctly and is easy to locate — which is the evidence for leaving it. **Owner's call.**

> **SEEN BY LOOKING, NOT BY COUNTING — and it is NOT this change's doing.** On `/sign-in` the
> `Phone | Email link` segmented control renders as two browser-default boxes, visibly inconsistent
> beside the swept `Continue with Google` and `Sign in with a passkey`. Verified rather than assumed:
> `.gn-view-tabs button` sets `min-height` and `padding-inline` **and nothing else** — globals.css says
> so in its own comment — and `git diff` over this change touches none of it. It is the same
> already-recorded finding as the 26 controls rendering at the browser's font. **The sweep did not
> break it; the sweep made it visible**, because the controls beside it stopped looking browser-default
> too. Per-screen work, so it belongs to the reconciliation audit, recorded here rather than fixed.


## Task 0 of the HIG per-screen plan (2026-09-08) — the accessible-name gate

*Built BEFORE any screen is touched, and that ordering is the point: the per-screen work is delegated
to smaller models, and **a rule enforced by a test survives a delegation while a rule enforced by
attention does not.** The owner's rule is "reject anything that loses information or an aria-label";
before this, **46 `aria-label` and 140 `role` attributes existed across 53 source files and NOT ONE
ASSERTION TOUCHED ANY OF THEM** — a restyle could have deleted every accessible name in the product and
the gate would have stayed 33/33.*

> **⚠ WHAT 13.285/13.287 CANNOT SEE, measured 2026-09-08 by the mutation that was supposed to prove
> the opposite.** The plan's Task 2 required deleting the passkey button to redden **both** 13.292 and
> 13.285. **Only 13.292 fired.** Root cause, read from `button.tsx`: `Button` renders a bare
> `<button>` whose role is IMPLICIT in the tag and whose accessible name comes from its TEXT — so none
> of the four counted attributes moves when an entire unlabelled control is deleted.
>
> **The gate counts ARIA ATTRIBUTES, not accessible roles**, and it therefore cannot see the loss of
> any control named by its own text — which is most buttons in this product. The case wording below is
> accurate (it names the four attributes) but **Task 0's rationale oversold it**: "a rule enforced by a
> test survives a delegation" is true only for the population the test counts. Every remaining
> per-screen task leans on this gate, so the limit is written here rather than left to be rediscovered.
>
> **It is a real gap, not a nuisance, and it is recorded rather than fixed** — closing it means
> counting computed accessible roles instead of attributes, which is a different instrument.
> **Owner: whoever next touches `sweepAccessibleNames`.** What still holds: explicit `role`,
> `aria-label`, `aria-selected` and `aria-describedby` cannot fall, which is what caught the
> SegmentedControl transcription and what the sign-in restyle was measured against.

- **13.285** ✅ Accessible names and roles on the signed-out surface are a one-way ratchet: `aria-label`,
  `role`, `aria-selected` and `aria-describedby` counts per `viewport|route` may rise and never fall.
  Lowering one is a deliberate deletion of the key in a commit that names the element — the same
  contract as the tap-target and type-scale baselines, and `recordAccessibleBaseline` writes ABSENT keys
  only so a branch that lowered a count cannot re-baseline over it.
  *Mutation-witnessed, and the witness is the whole reason to believe the rest: deleting
  `aria-selected` from the Phone tab alone (`sign-in/page.tsx:104`) reddens it on all three viewports,
  naming the route and printing **"LOST ariaSelected: baseline 2, now 1"**. Committed first, then
  mutated, then restored — `git checkout --` restores from HEAD and has destroyed uncommitted work here
  twice.*
  **FLOOR 0 ON `/sign-in` SINCE ROUND 2c (2026-09-08), and it is recorded here rather than left to be
  discovered.** Gating the Phone tab removed the segmented control, which carried this page's only
  `aria-label`, its `tablist`/`tab` roles and both `aria-selected`s — so all four ratcheted counts are
  `0`, and **a floor of zero cannot fall: 13.285 protects nothing on `/sign-in`** until a labelled
  control returns (Task 12's passkey UI, or a deployment with a provider configured). 13.286 still
  guards the sweep on that route — `rawMatches` is 54, so a sweep that saw nothing is still caught. The
  ratchet MECHANISM is witnessed on `/privacy`, whose floor is non-zero: deleting the back button's
  `aria-label` reddens 6 of 19 with **"LOST ariaLabel: baseline 1"** naming `/privacy` and `/terms` at
  all three viewports.
- **13.286** ✅ The sweep's selector control, asserted HARD and BEFORE the ratchet: `*` over a rendered
  document must examine more than zero elements. *A sweep that stopped matching reports zero losses and
  is byte-for-byte indistinguishable from a page that lost nothing — the failure this file catalogues
  more than any other. Measured populations range from 48 elements on `/sign-in` to 999 on `/help`.*
- **13.287** ✅ The signed-in twin, over the stack suite's five routes, with its own baseline file
  because it is a different population. *It is not redundant with 13.285 and the numbers show why:
  `AppNav`, the view tabs, the board and every settings screen exist only behind a session, so the
  signed-out ratchet is structurally blind to them — `/p/:projectId` alone carries 13 roles and 4
  `aria-selected`, and the signed-out sweep sees none of it.*

> **What this gate deliberately does NOT do.** It counts; it does not read. A restyle that swaps one
> accessible name for another of equal count passes here, and should — whether the new words are better
> is the copy rule, which is a person's judgement. This gate catches the LOSS, which is the half that
> can be mechanised and the half a delegated implementer is most likely to cause by accident.

## Task 1 of the HIG per-screen plan (2026-09-08) — the four shared pieces every screen reuses

- **13.288** ✅ `SegmentedControl` renders `role=tablist` (named by a required `aria-label`), one
  `role=tab` per option, `aria-selected` true on exactly the chosen one, and calls `onChange` with the
  clicked value — the exact roles `.gn-view-tabs` carried, so replacing it registers no loss on 13.285.
  — (`packages/ui/test/components.test.tsx`)
- **13.289** ✅ A ghost button renders as fill plus an accent 600 label with **no painting border on either rule** — the modifier AND the base, because `button.tsx` always emits them together and a boundary reintroduced on the base would reach the screen while a modifier-only assertion stayed green.
  *The plan justified this case with "its 2.49:1 border was its only affordance". **That was true of the pre-#354 tree and is false now** — the border sweep removed it and the base `.gn-button` has carried `border: none` plus the fill, accent and weight ever since, so the new modifier rule is inert duplication that repairs nothing. Corrected here rather than left standing, because this file is read later as a record of what the tree used to be.*
  *And the guard the plan shipped could not have caught what it names: `not.toMatch(/border:\s*1px/)` sees only the shorthand, so **`border: 2px solid` beside a `border-color: transparent` passed green**, demonstrated. Widened to any border longhand that PAINTS — `-color` and `-radius` excluded because neither draws one, and `none`/`0` excluded because they are how a rule says there is no border, which the first draft of the regex forbade and went red against a correct file.*
  affordance), is fill `--gn-fill-tertiary` + accent 600 label with `border-color: transparent`.
  Mutation-witnessed: restoring a border reddens it by name. — (`packages/ui/test/components.test.tsx`)
- **13.290** ✅ `.gn-refusal--preview` / `--server` carry tone as `inset 4px 0 0` box-shadow fills, and
  *Same widening as 13.289, and it was needed here too: the shipped `/\bborder:/` let **`border-left: 4px solid` beside the inset shadow** pass green — a visible rule on the one panel whose whole job is to look like content rather than decoration.*
  declare no `border`. The honesty panels are the last thing that should look decorative. —
  (`packages/ui/test/components.test.tsx`)
- **13.291** ✅ `.gn-field__input` keeps `border: 1px solid var(--gn-border)` — the one R1(c) exception,
  because an empty field has no label to identify it. — (`packages/ui/test/components.test.tsx`)

## Sign-in on the HIG surface (2026-09-08) — Task 2 of the per-screen plan

- **13.292** ✅ **AMENDED 2026-09-08 (controller ruling). Its property is now: _every method the server
  will accept is offered, and no control the server will refuse is rendered._** The struck property
  below is kept rather than deleted, per the ruling, because it is the finding: ~~The sign-in restyle
  keeps all four shipped methods — Phone (default), Email link, Continue with Google, Sign in with a
  passkey — where the prototype drew two. Mutation-witnessed: removing the passkey button reddens
  this.~~ **Two of those four could not work — Google was unconfigured on the dev stack and passkey has
  no registration flow anywhere in app code — so a case that pinned their presence was pinning the
  defect.** The case now drives `/v1/auth/methods` through `page.route` in BOTH directions at each
  viewport: with `{google:false, apple:false}`, count 0 for Google, Apple and the passkey button and no
  `.gn-sign-in__marks` row; with `{google:true}`, `Continue with Google` at count 1, visible, and
  `toHaveText('')` because it is icon-only with the shipped wording in `aria-label`. Passkey is asserted
  by `autocomplete="username webauthn"` on the email input, never by a button.
  **THE NEGATIVE HALF WAS A CHECK THAT COULD NOT FAIL BEFORE THE ANSWER WAS DRIVEN, and a mutation
  proved it rather than a reading.** This suite runs `next dev` with no API behind it, so
  `/v1/auth/methods` never resolved, the page's availability state stayed `null`, and nothing rendered
  whatever the gate did — a mutation dropping the provider check and rendering the row on any answer
  left all three viewports GREEN. With the empty answer supplied and a positive control asserting the
  page came back, the same mutation reddens: Expected 0, Received 1, ×3. **13.285 (the accessible-name/role ratchet) was
  expected to also redden and did NOT** — `Button` (`packages/ui/src/components/button.tsx`)
  renders a plain `<button>` with no explicit `role`, `aria-label`, `aria-selected` or
  `aria-describedby` attribute, so removing one moves none of the four counts
  `sweepAccessibleNames` tracks; its accessible name comes from text content and its role is
  implicit from the tag. 13.285 is inert against the loss of a whole unlabelled button — a real
  gap in that guard, reported rather than papered over. — (`apps/web/e2e-viewport/responsive.spec.ts`)

> **13.292 AMENDED AGAIN, 2026-09-15 (final whole-branch review of the account/help-screens plan, fix
> wave item 1).** The "count 0 ... for the passkey button" sentence above described the case as it
> stood *before* Task 8: registration now exists on `/account`, so the passkey button is no longer one
> of the two methods "that could not work". The case's own code kept asserting `toHaveCount(0)` for it
> anyway — a stale assertion Task 8's own audit had already found and fixed once, in the identical
> shape, in `apps/web/e2e/smoke.spec.ts`; this file just sat outside that audit's `apps/web/e2e/` grep
> scope. Deterministic red, not gated by CI (this suite isn't in the turbo gate), caught only by this
> review. Fixed to `toBeVisible()`: the passkey button is not gated on `/v1/auth/methods` the way
> Google/Apple are (it needs no provider), so it is the one control that survives the all-refused
> answer this case drives — the honest expectation is now Google absent, Apple absent, the passkey
> button visible, and no `.gn-sign-in__marks` row.

- **13.293** ✅ The adopted helper text ("It expires in 15 minutes.") renders on the Email method
  only, not on Phone. — (`apps/web/e2e-viewport/responsive.spec.ts`)
- **13.294** ✅ No `Password` tab exists on sign-in; `auth.ts:84` forbids the method
  (`emailAndPassword: { enabled: false }`). — (`apps/web/e2e-viewport/responsive.spec.ts`)

## The owner's sign-in feedback round (2026-09-08) — item 2, the methods that can work

*The owner's item 2 read "Google and Apple, as logo marks". The work underneath it was not icons: two
of the four visible sign-in options could not succeed for anybody. Item 2 is therefore **render only
what works, then style what remains**.*

- **13.324** ✅ `GET /v1/auth/methods` answers which social providers this server will accept, and the
  answer is read off `auth.options.socialProviders` — **the constructed better-auth instance**, not the
  environment and not a copy any caller kept. `toEqual` and not a partial match, because the point is
  that the route says NOTHING else: a body that grew a client id would satisfy `toMatchObject`. Each
  provider is asserted alone as well as together, since `{google:true,apple:true}` and
  `{google:false,apple:false}` are both satisfied by a route returning one boolean twice. One case also
  pins that **better-auth preserves the ABSENCE of an unconfigured provider in `options`** — if a future
  version normalised absent keys into present-and-disabled ones, every boolean would silently become
  true and the dead button would come back. — (`apps/server/test/routes/auth-methods.test.ts`)
- **13.325** ✅ "Empty disables" is a property of this repo rather than a vendor coincidence. The whole
  cross-product of the four variables, asserted twice per row — once on the config
  `socialProvidersFromEnv` builds, once through the real route on a real auth instance built from it,
  because asserting the config alone would pass against a route that never consulted it. **The mixed
  rows are the ones that matter**: an id with no secret is the state a deployment is in for the seconds
  between setting two variables, and it must read as OFF, not as ON-and-broken. Empty strings and
  whitespace are included; `.env.example` ships the empty pair. A separate case asserts the optional
  `APPLE_APP_BUNDLE_IDENTIFIER` is OMITTED rather than present-and-undefined, via `Object.keys` —
  `toEqual` treats a key holding `undefined` as absent and would pass against the shape being avoided.
  — (`apps/server/test/routes/auth-methods.test.ts`)
- **13.326** ✅ The page renders exactly the social methods the server accepts. The load-bearing shape
  is a **DISCRIMINATION case, and it replaced a negative that could not fail** — the second instance of
  that defect in this one change set, found by mutation and not by reading.
  *The first version answered `{google:false, apple:false}` and wrapped the absence in `waitFor`.
  **`waitFor` waits for nothing when its callback asserts an absence**: it retries until the callback
  PASSES, and "the button is not there" passes on the first tick, before the fetch resolves and before
  the page has been told anything. The mutation that drops the per-provider check and renders the row
  on any answer left it GREEN. It asserted the absence of a state update, not the presence of a gate —
  and the comment at the site claimed `waitFor` handled it, which is what made the gap read as covered.*
  The replacement answers **asymmetrically** — `apple: true, google: false`, then the reverse. The
  enabled button appearing is a positive, genuinely awaited signal (`findByRole` waits because it waits
  for something to EXIST) and the other's absence is read off the same settled DOM; no tick passes
  vacuously. Both orderings run, because a page rendering whichever provider it checked first satisfies
  one of them. The all-disabled answer is kept for the one thing the asymmetric pair cannot show — that
  the marks ROW disappears rather than rendering empty — anchored on the fetch having been made and its
  body consumed plus a microtask flush, which is weaker by construction and labelled so at the site.
  With the server answering all-true, both buttons resolve by their exact shipped accessible names,
  have empty text content (icon-only), and each reaches the provider it names — a mark wired to the
  wrong provider would satisfy every other assertion. Passkey is asserted as
  **no passkey request at all, plus the field kept ready** — and the deferral is the finding.
  *The dispatch specified `signIn.passkey({ autoFill: true })` as the replacement for the dead button.
  Two defects were found in it, in order. First it fired on MOUNT with `[]` deps while the default tab
  is Phone, so the only field carrying `autocomplete="username webauthn"` was not rendered and the
  request had nothing to attach to — the replacement for the dead button was itself dead, and every
  test passed because a mock can see that a call happened and with what argument but not that the call
  was pointless. Then, with that fixed, review DEMONSTRATED the real objection:
  `signInPasskey` issues `GET /passkey/generate-authenticate-options` as its first statement, charged
  against the shared `auth:` bucket (`RATE_LIMIT_AUTH_MAX` = 10/60s in production); ten such probes
  through the assembled app made the eleventh real `POST /sign-in/magic-link` answer **429**, with a
  zero-probe control answering 500 and not 429, and `http/rate-limit.ts` records as measured that a web
  container proxies every browser into ONE client key. **A request that spends a shared sign-in budget
  on a flow with zero possible successes is this round's own defect one layer down.*** So the case now
  asserts there is no passkey button, that the email field DOES carry the token (asserting only "no
  button" would let the request return silently; asserting only "no request" would let the token be
  dropped and Task 12 start from a worse place), and — after a microtask flush, because asserting
  immediately would pass against a page that fires one tick later — that `passkey` was never called.
  Turning mediation on is Task 12's, in the change set that makes a passkey obtainable.
  *(Refuted limb, recorded so nobody builds against it: the challenge rows are NOT unbounded.
  `findVerificationValue` sweeps expired rows globally on every call, `disableCleanup` is unset, and
  phone-OTP verification calls it. No cleanup job is owed.)*
  Mutation-witnessed: the provider check dropped reddens the discrimination case and the all-disabled
  case; the `google:true, apple:false` ordering correctly stays green because that mutation leaves
  Apple's branch intact, which is why two orderings run. — (`apps/web/test/sign-in.test.tsx`)

> **Case 3.84 was amended in the same change set** (`apps/web/test/sign-in.test.tsx`): it asserted that
> all four methods render as controls, and asserting the presence of the two that could not work is what
> kept them on screen. Its property is now *phone and email are offered unconditionally, and nothing
> password-shaped is*; the social pair and passkey are 13.326's subject. The password absence is
> unchanged — `auth.ts:84` forbids the method, so the prototype's Password tab is not merely absent.

> **What the `/sign-in` accessible-name floor raise does and does not guard, stated because the
> difference is not visible from the number.** The key was recorded at Task 0, before Tasks 1 and 2
> added labels, and `recordAccessibleBaseline` refuses to overwrite an existing key — so the tree
> emitted one `aria-label` against a floor of `0` and a deletion would have cleared it. Raised to 1 and
> witnessed: deleting `SegmentedControl`'s label reddens 13.285 at all three viewports. **It does NOT
> guard the two icon buttons' labels**, because those render only when a provider is configured and this
> suite's server has no credentials. Those are guarded by 13.326 in the unit suite. A floor that cannot
> see the thing it was raised for is worth naming rather than counting.

## The owner's sign-in feedback round (2026-09-08) — items 1 and 3

*Four items came back from the owner's live look at `/sign-in` on `ebb21aa`. Items 1 and 3 are here;
item 2 (render only the auth methods that can actually work, then style them) is its own change set
because the finding underneath it is a product gap, not a styling one.*

- **13.334** ✅ With the server reporting `phone: false` — the dev stack's real state — `/sign-in`
  offers **neither the Phone tab nor the OTP form nor a segmented control at all**, at all three
  viewports, and Email link is the method the page opens on. The Email field is asserted FIRST and is
  what makes the four zero counts mean anything: it is a positive, awaited signal that the answer
  arrived and the page re-rendered against it, and without it **a blank document satisfies every
  `toHaveCount(0)` in the case** — the same vacuous shape 13.292's own social half was rewritten to
  escape, which is why it is not repeated here. The answer is supplied by `page.route`, because this
  suite's `next dev` has no API behind it and an unanswered fetch leaves the page's availability state
  `null`, which renders nothing whatever the gate does. Mutation: dropping `phoneAvailable ?` in
  `sign-in/page.tsx` so the control renders unconditionally → RED at all three viewports.
  — (`apps/web/e2e-viewport/responsive.spec.ts`)
- **13.335** ✅ And with `phone: true` driven through `page.route`, the Phone tab is back, Email link
  beside it, and **phone is the default** — the half that stops 13.334 from being satisfied by simply
  deleting phone sign-in. The phone FORM is asserted, not merely the tab: a selected tab sitting over
  the email form is the state the page would reach if `method` were stored and corrected by an effect
  rather than derived, and that state is unrecoverable by clicking because the tab that would switch
  back is the one that is missing. Mutation: forcing `method` to `'email'` → RED here, and 13.334
  stays green, so the two cases fail for different reasons.
  — (`apps/web/e2e-viewport/responsive.spec.ts`)
- **13.336** ✅ `GET /v1/auth/methods` reports `phone` from the sender the running auth instance holds
  — `NullOtpSender` ⇒ `false`, a sender that can deliver ⇒ `true` — and **both directions are pinned**,
  because the false half alone would pass forever against a route that hard-coded false. The third
  case builds two apps in ONE process, so `process.env` is byte-identical for both, and they disagree:
  no answer derived from an environment variable can produce two different booleans there, which is
  what makes "from the selection, not from env" a measurement rather than a claim. That case is also
  the one that fails if the route is "simplified" into calling `selectOtpSender()` itself, which
  re-decides instead of reporting and so stops reporting on the instance that actually sends.
  Mutations: hard-code `phone: true` → RED on exactly two cases, both 13.336's, naming their own site;
  hard-code `phone: false` → RED including 13.336's true half; substitute `selectOtpSender()` for
  `auth.otpSender` → RED on the true half and the disagreement case, with the false half correctly
  still green. — (`apps/server/test/routes/auth-methods.test.ts`)

- **13.321** ✅ The sign-in sheet is centred in the viewport — **both halves, measured from the live
  box rather than the computed style.** (a) the `<main>` is at least the viewport height, and (b) the
  space above its first child equals the space below its last within 2px. *Either assertion alone
  passes on a broken page: a full-height container with the content pinned to the top satisfies (a),
  and a shrink-to-fit container satisfies (b) trivially because its own padding is all the space
  there is.* Asserting `justify-content: center` instead would have been the useless check — the card
  was ALREADY `margin: 3rem auto` and therefore already centred horizontally, and a declaration does
  not say which axis a reader sees. Mutation: deleting `justify-content` reddens (b) on all three
  viewports; deleting the two `min-height` lines reddens (a). — (`apps/web/e2e-viewport/responsive.spec.ts`)
- **13.322** ✅ `/privacy` carries a Back control, and **the branch that matters is the one without
  history.** The accessible name is `Back to the previous page` while the visible word is `Back` —
  asserted as containment, which is WCAG 2.5.3 (Label in Name) and what keeps voice control working.
  With `history.length > 1` the control calls `router.back()` and never `push`; with `history.length`
  driven to 1 it calls `push('/sign-in')` and never `back()`. *An unconditional `router.back()` is
  indistinguishable from a correct control on every page a test navigates to — it fails only for the
  reader who opened the link in a new tab, where `back()` is a silent no-op and the page appears
  frozen.* Mutation: deleting the `history.length > 1` guard reddens the second case alone. —
  (`apps/web/test/not-found-and-legal.test.tsx`)
- **13.323** ✅ The same pair for `/terms`. Both pages get the case because both had the same defect:
  they linked only to EACH OTHER, so a reader arriving from the sign-in card could cross between them
  indefinitely without ever returning. — (`apps/web/test/not-found-and-legal.test.tsx`)

> **The accessible-name floors for `/privacy` and `/terms` were RAISED in this change, deliberately.**
> Both keys read `ariaLabel: 0` and the pages now carry one. The baseline writer refuses to overwrite
> an existing key (`recordAccessibleBaseline`, `accessible-names.ts:63`) precisely so a regression
> cannot re-baseline over itself, so raising it means deleting the key and letting the run record it —
> which is what happened here, in this commit, for these two routes only. **Leaving the floor at 0
> would have left 13.285 unable to see the new label disappear**, which is the same inertness 13.292
> already records for an unlabelled button. Raising a floor only ever tightens the gate; lowering one
> is the move that needs the argument.



> ### Two things Task 2 corrected that belong to earlier PRs, recorded here because nothing else would
>
> **The segmented control shipped 4px under the tap-target floor.** `.gn-segmented__item` landed in
> #360 with `min-height: 2.5rem` — 40px against the 44px this repo's own ratchet enforces and every
> other control here uses. **It was invisible for exactly one PR because nothing rendered the component
> yet**; sign-in is the first screen to use it, and the ratchet reddened on all three viewports the
> moment it did. Raised to 2.75rem, with the reason written at the site. *Controlled: reverting the
> line to #360's value reddens `/sign-in` at 390, 768 and 1512.* **A number that only becomes wrong
> when something finally uses it is the kind a component library ships most easily.**
>
> **13.292 claimed a default it did not assert.** Its own text says "Phone (default)", and review
> showed the whole viewport suite stayed green with `useState<Method>('phone')` flipped to `'email'` —
> the only thing that reddened was an unnamed vitest case that types into "Phone number" without
> clicking the tab, i.e. it caught the default by accident. The assertion is now explicit.
> *Controlled: the same flip now reddens three viewports.*

> ### One deviation from the plan's literal JSX, declared rather than left for a reader to find
>
> The plan puts the adopted helper text *before* the `{emailSent ? …}` ternary; it shipped inside the
> not-yet-sent branch, so the hint disappears once the link is on its way rather than sitting above the
> confirmation. Kept, because a hint about what a button will do reads oddly beside a message saying it
> already happened — but the plan called Task 2 transcription, and this is a departure from it.
> **13.293 cannot see the difference**, since it never sends; that is a limit of the case, not evidence
> the placement is right.

## Task 4a / 4b of the HIG per-screen plan (2026-09-08) — Workspaces + Invite

The surface half is transcription and carries no new ids: `/workspaces` and `/invite/<token>` move onto
`surface-raised` at 12px with no container borders, the founding form adopts the shared `.gn-field`, and
the guard is the existing suites plus the ratchet. **The ratchet is the part that needed fixing first**:
Task 4's dispatch said the signed-in sweep already watched `/workspaces`, and it did not — the baseline
held five keys and neither of this task's routes was among them. `/workspaces` joins it here.
`/invite/<token>` does NOT, and the reason is recorded in `docs/pre-launch-checklist.md` with a named
owner rather than left as an absence a later reader mistakes for coverage: this suite holds no standing
invite token, and a token-less visit renders the DEAD-LINK branch, so the baseline would pin a page
nobody ships and then defend it.

- **13.298** ✅ A 401 from `/v1/me/workspaces` leaves the **real browser settled on `/sign-in`** — the
  navigation itself, which nothing had ever witnessed. **This is NOT the case the plan specified, and
  the substitution was measured rather than argued.** The plan asked for *401 renders
  `ExpiredSessionNotice`, mutation: delete the 401 branch → RED, **alone***. Deleting that arm on a
  committed tree gives `EXIT=1`, **19 pass / 1 fail**, and the failure is a PRE-EXISTING case —
  `apps/web/test/page-refusals.test.tsx:180` — which already asserts the notice, the `push` and the
  absence of the spinner, so "alone" was unsatisfiable before the plan was written. And it could not
  have been witnessed in a browser at all: `useSignInOnExpiredSession` pushes to `/sign-in`, so the
  notice is transient and mutant and original both SETTLE there. **A case whose mutation cannot redden
  it is not a guard.** Re-pointed by controller ruling at the claim every other case only assumes:
  `page-refusals.test.tsx:180` awaits `expect(push).toHaveBeenCalledWith('/sign-in')` — *a double that
  records a call is not a browser that moved*. The two are complements: that one owns what is rendered
  in the interim, this one owns where the browser ends up. The positive control is `/sign-in`'s Email
  field and deliberately **not** the redirect, because a page that failed to load would leave the
  pathname at `/workspaces` and read as a clean kill for the wrong reason. `?next=` is **not** carried
  by the push (`/invite/[token]` does carry one on its own link, so the product is inconsistent); the
  assertion checks the PATHNAME only and leaves the query free, so adding `next=` later is not a test
  change. Mutation: delete `router.push('/sign-in')` from `expired-session.tsx` → **WITNESSED RED on
  all three viewports and on this case ALONE** (13.299 and 13.300 green in the same run). **What
  reddens is the POSITIVE CONTROL, not the pathname assertion** — an earlier draft of this row said
  "RED naming both routes", which the run disproved: with the push gone the browser sits on
  `/workspaces`, so `getByLabel('Email')` times out first and the pathname line is never evaluated.
  Its long diagnostic is unreachable under THIS mutation and is kept for a different one — arriving
  somewhere that is neither route. The row is corrected rather than the assertions reordered, because
  putting the pathname check above the control would restore the message and destroy the control's
  own reason for existing. — (`apps/web/e2e-viewport/responsive.spec.ts`)
- **13.299** ✅ `/workspaces` with the roster answering `[]` renders the empty-state sentence and the
  founding form's `Create workspace` button. **The empty-state sentence is the positive control and its
  position is load-bearing**: `<FoundingForm />` renders OUTSIDE all four branches of that page — by
  design, so a person who cannot be told which workspaces they are in can still found one — which means
  `Create workspace` is visible on a page that never received an answer at all. Asserting it first would
  establish nothing about the stub. The sentence is the only thing on the screen gated on `[]`.
  Reordering the two assertions destroys the case without reddening it. The `<h1>` is deliberately NOT
  asserted: it renders `Workspaces — {user.name}` from a session request `next.config.ts` proxies to the
  running stack, so its text is whichever developer is signed in on the machine — the same class of leak
  that put a live Google credential in a baseline on 2026-09-08. Mutation: delete the
  `workspaces.length === 0` arm → RED. — (`apps/web/e2e-viewport/responsive.spec.ts`)
- **13.300** ✅ `/invite/<token>` names the workspace **and the role** —
  `/You are invited to join .+ as (admin|member|guest)\./`. The role is the whole point: the prototype's
  sentence drops it and the copy rule rejects that, because a person accepting an invitation is being
  told what they will be able to do. The alternation is the shipped `InviteSummary['role']` union, not a
  guess. Matched on the `.gn-invite` container rather than one element, because the sentence is split
  across three text nodes and a `<strong>`. Two assertions that do not subsume each other: removing the
  `<strong>` reddens the name assertion but **not** the regex. The last assertion says the DEAD-LINK
  branch is not what was measured — a stubbed body that failed `createHttpInviteGateway`'s validation
  would render that branch and read exactly like a copy regression. Mutation: drop ` as {invite.role}` →
  RED. — (`apps/web/e2e-viewport/responsive.spec.ts`)

> ### The next-free pointer at the head of this file already collides, and it is NOT this task's doing
>
> `13.321` is what the plan's Global Constraints tell the LAST task of the series to set the pointer
> to — and `13.321` is **already consumed by a live case in this file**. Verified pre-existing on
> `origin/main`, so nothing on this branch caused it. Recorded because Task 11 will walk into it, and
> because this branch is the last to touch this section. The pointer is a CACHE — this file warns
> that twice about itself — and this is the third time one has gone stale here.
> **Owner: the controller, who allocates the blocks.**

> ### The instrument cannot see a case that has no catalogue row
>
> Found while writing these: `check-case-citations` runs catalogue → test, so an id **cited by a test
> with no row in this file is invisible to it**. Both id checkers stayed green with 13.299 and 13.300
> cited from `responsive.spec.ts` and no rows here. The direction it guards — deleting the last citing
> test for a catalogued case — is real; the opposite direction is not guarded at all, and nothing in the
> repo would have reminded anyone to write these three rows. Recorded rather than fixed: widening it is
> a change to a shared instrument, not part of Task 4.

## Task 14 of the neomorphism amendment (2026-09-09) — the style axis, the toggle, and the shared pieces

Block `13.337`–`13.347`. `packages/ui/src/tokens.ts` gains a `StyleName` axis (`hig`|`minimal`|`neo`)
beside `ThemeName`, plus `radiusOf`/`shadowValueOf` (roles `card`/`control` and `raised`/`sunken`/`overlay` —
**a fourth shadow role, `sunken-compact`, joined 2026-09-16 (block `13.411`), and a fifth, `selected`,
joined the same day (block `13.412`); see those blocks below rather than treating
this historical sentence as the current roster**);
`StyleToggle` (`apps/web/src/style-toggle.tsx`) ships beside `ThemeToggle`, neo default. That half
committed separately (`8e6c6d31`); this section is the CSS restyle of the nine shared class families
(`.gn-segmented*`, `.gn-field*`, `.gn-button*`, `.gn-refusal*`, `.gn-page-header*`, `.gn-card`,
`.gn-chip*`, `.gn-sheet*`, `.gn-avatar*` in `packages/ui/src/ui.css`; `.gn-shell__refusal`/`.gn-shell__expired`
in `apps/web/app/globals.css`) onto the two new variable families, plus the owner's pure-neo field
ruling and the positive/negative controls the amendment's rule (a)–(c) need.

**Judgment calls, recorded rather than made silently.** `.gn-workspace-list .gn-card` and
`.gn-card.gn-invite` (`globals.css:65,92`) keep their literal `12px` rather than moving to
`var(--gn-radius-card)` — they are a page-specific BUMP over the base radius (`.gn-card` was 8px, these
were 12px), and folding them in would make both rules no-ops identical to the base, losing the
double-class specificity fix `.gn-card.gn-invite` exists for (see that line's own docblock). **Flagged
for the owner: under `neo` this literal (12px) is now SMALLER than the restyled base `.gn-card`'s own
radius (20px)**, inverting the original "these are deliberately bigger" intent — Task 15 owns these
routes and is the natural place to resolve it. `.gn-founding` (`globals.css:71-79`, in the same line
range but a different class) is OUT OF SCOPE for the same reason: it is `/workspaces`' own surface, not
one of the nine enumerated families, and Task 15 owns that route.

**Two scale calls the brief's own text didn't settle, made by analogy rather than found in writing.**
The brief's Goal paragraph names `.gn-card`/`.gn-sheet`/`.gn-page-header` card-scale and
`.gn-button`/`.gn-field__input`/`.gn-chip`/`.gn-segmented__item` control-scale, but says nothing about
`.gn-refusal`/`.gn-shell__refusal`/`.gn-shell__expired`. Mapped to `var(--gn-radius-control)` by analogy
(a small inline banner reads closer to a control than a card) — **this VISIBLY changes the refusal/expired
panels' radius, 6px/6.4px → 8px under `hig`/`minimal` and → 14px under `neo`** (the shipped default), on
exactly the kind of surface this repo escalates reviewers for. `.gn-page-header__icon` → `var(--gn-radius-card)`
(14px → 16px `hig`/`minimal`, → 20px `neo`) DOES follow the brief's explicit text (page-header is listed
card-scale) and is recorded here only for completeness, not as a call.

- **13.337** ✅ Every token role (colour, radius, shadow) has a value for every (style × theme) and
  reaches `themeStylesheet()`'s own output under the right `[data-style]`/`[data-theme]` selector.
  *Mutation-witnessed: dropping `'neo'` from the style loop reddens this case by name (plus the
  OS-dark-arm test and 13.347, both checking the same removed selector from a different angle) — 225/228
  pass, 3 fail, all naming `neo`. Restored via `Edit`, checksum-verified byte-identical to the
  pre-mutation file.* — (`packages/ui/test/tokens.test.ts`)
- **13.338** ✅ Every shadow layer colour is an 8-digit alpha primitive, and no `CONTRAST_PAIRS` row
  names one — the same false-green `relativeLuminance`-ignores-alpha hazard the fill ladder's own
  docblock warns against, now checked across all three styles. — (`packages/ui/test/tokens.test.ts`)
- **13.339** ✅ Under `data-style="neo"` the empty `.gn-field__input` renders sunken and borderless —
  `border: none`, `background: var(--gn-surface-sunken)`, `box-shadow: var(--gn-shadow-sunken)` — while
  `hig`/`minimal` keep 13.291's bordered look unchanged, asserted from the SAME `rule()` helper 13.289–13.291
  use. **OWNER-ACCEPTED WAIVER (Task 14 AMENDMENT rule (a), 2026-09-09, "pure neo look"): the sunken
  shadow edge measures 1.24 (light) / 1.16 (dark), both below the 3:1 WCAG 1.4.11 floor — accepted
  knowingly, not hidden.** A positive control guards `rule()`'s substring matching: the neo selector and
  the base selector must read back DIFFERENT bodies. *Mutation-witnessed: giving the neo override a
  border reddens this case alone (227/228 pass). Restored, checksum-verified.* — (`packages/ui/test/components.test.tsx`)
- **13.340** ✅ No `[data-style="…"]` block anywhere in `ui.css` touches `.gn-button` — a positive scan
  (at least one `[data-style]` block must exist, so "found none" cannot pass by finding nothing), which
  makes 13.289's unconditional assertion the WHOLE story for every style: ghost/secondary controls keep
  fill-plus-accent-label identification in `hig`, `minimal` AND `neo` alike, never a style-specific
  override stripping it back to a boundary. — (`packages/ui/test/components.test.tsx`)
- **13.341** ✅ Dark theme, per style: `surface`↔`surfaceRaised`, `surface`↔`surfaceSunken` and
  `surfaceRaised`↔`surfaceSunken` each separate by fill at or above a LITERAL floor (never derived from
  the same `colorOf` call the assertion reads) — for `hig`/`minimal` only. **UPDATED 2026-09-10, owner:
  "revert to prototype's exact dark hex and fix the accent colour ratio instead" (the dark+neo input box
  read visibly lighter/flatter than the prototype's own screenshot).** `neo` previously carried its own
  narrower `1.20` floor here — `tokens.ts`'s `neoNavyRaised` docblock recorded a genuine collision at the
  time: lightening `neoNavy` far enough to clear hig/minimal's `1.214` floor pushed the THEN-bare `accent`
  role below the 4.5 `CONTRAST_PAIRS` guarantee it carried as text against `surfaceRaised`. **That
  collision stopped binding the same day it was written**: a same-day change split `accent` into a
  fill-only role and `textAccent` (the role actually derived to read as text), so `CONTRAST_PAIRS` no
  longer names bare `accent` on `surfaceRaised`/`surface` at all. With `neoNavyRaised`/`neoNavySunken`
  reverted to `neoNavy`, `neo` is now EXEMPT from this separation floor in dark, the same way it was always
  exempt in light (`neoPaper`, one shared hex) — a new positive case in the same describe block asserts
  `surfaceRaised`/`surfaceSunken` equal `surface` exactly for `neo`/dark. Verified empirically before the
  revert: every `CONTRAST_PAIRS` row for `neo`/dark still passes, with MORE margin, because darker
  backgrounds only help the light-toned foregrounds in play. — (`packages/ui/test/tokens.test.ts`)
- **13.342** ✅ The accessible-name ratchet (13.285–13.287) does not fall on any route and rises by
  EXACTLY the `StyleToggle`'s contribution on every signed-in route: `ariaLabel` +1, `role` +4,
  `ariaSelected` +3, `ariaDescribedby` +0 (one `tablist` + three `tab`s), measured live against the
  rebuilt dev stack on all six `stack-phone-390` keys and hand-verified identical across every one of
  them before being written back (`apps/web/e2e-stack/accessible-names-baseline.json`). The signed-out
  ratchet (`apps/web/e2e-viewport/accessible-names-baseline.json`) is UNCHANGED, byte-for-byte — verified
  by diff before AND after the live run — because `AppNav` (and therefore `StyleToggle`) never renders on
  `/help`, `/privacy`, `/terms`, `/sign-in` or the 404 (grepped: no signed-out route imports `AppNav`).
  Both suites pass with no seeding variable set. — (`apps/web/e2e-stack/viewport.spec.ts`, `apps/web/e2e-viewport/responsive.spec.ts`)
- **13.343** 🟡 **FINDING, not a pass on the plan's own terms — reported rather than forced.** The
  amendment expected `apps/web/e2e-stack/non-text-contrast-roster.json` to grow by exactly one sanctioned
  entry (the neo field input's sunken shadow edge, 1.24/1.16, citing 13.339's waiver). Measured against
  the rebuilt stack: **the roster does NOT grow — it stays at the same 6 classes, `belowCount: 0`** (only
  ratios/backdrop shifted, e.g. `input`/`select` 4.07→3.62, backdrop `rgb(242,242,247)`→`rgb(237,228,219)`
  — `border`/`borderStrong` do not vary by style, so the shift is the BACKDROP's: the adopted palette
  (Task 13) landing in the image, composed with `neo` being the DEFAULT style, which is this task's own
  doing — `rgb(237,228,219)` is `neoPaper`, not `warmPaper`). Two independent reasons, both checked rather than assumed: (1)
  `sweepBorders` (`e2e-stack/helpers/non-text-contrast.ts`) reads only `border-{side}-width/style/color` —
  it has no box-shadow compositing at all, so an element with `border: none` is invisible to it regardless
  of what its `box-shadow` does; (2) `.gn-field__input` renders only on `/workspaces` (the founding form)
  and `/sign-in` (three fields) — NEITHER is among the five routes this sweep visits
  (`/my-work`, `/p/:projectId`, `/members`, `/settings/ticket-types`, `/settings/workflows`). The waiver
  citation therefore lives only in `ui.css`'s docblock and 13.339's test comment, not in the roster file —
  **rule (a)'s waiver-SCOPE assumption (that this specific instrument would see it) was wrong; the
  ruling's SUBSTANCE (the owner accepted the sub-3:1 edge) is unaffected.** The roster file itself is
  updated to the freshly measured (unchanged-membership) state; no entry was invented to match the
  plan's prediction. **Owner/controller: decide whether this needs its own instrument, an explicit
  roster-exemption line, or stands as documented and sufficient.** — (`apps/web/e2e-stack/viewport.spec.ts`, `apps/web/e2e-stack/helpers/non-text-contrast.ts`)
- **13.344** ✅ (retitled a FOURTH time, 2026-09-15: back to `SegmentedControl`, on an owner
  reference image for the Appearance card. The full identity chain is `SegmentedControl` → plain
  `<select>` → shared `Select` → `SegmentedControl`; Phase 2 Wave A's invariant that no native
  `<select>` remains in scope is untouched, since a segmented picker is not a native select — this
  control simply stopped being a `Select` call site.) `StyleToggle` renders one labelled control —
  a `role="tablist"` named `Style` holding 3 `role="tab"` entries, **`Apple HIG`/`Minimal`/
  `Neomorphic`** (the labels changed with the reference, from `HIG`/`Minimal`/`Neu`) — with
  `data-style` landing on `document.documentElement` when a choice is made, and a line beneath the
  control naming the selected style. That description line has its own case: it must TRACK the
  selection, asserted by switching and reading again, because fixed copy would satisfy any
  single-state assertion. Mutation: drop the control's `aria-label` → RED (the lookup is by that
  name); hard-code the description → RED on the second read. —
  (`apps/web/test/style-toggle.test.tsx`)
- **13.345** ✅ With nothing stored, the applied `data-style` is `neo` — witnessed as
  `aria-selected="true"` on the `Neomorphic` tab (retitled 2026-09-15 with the return to
  `SegmentedControl`; previously the `Select` trigger's own visible label text, and before that a
  native `<select>`'s `value`). *Mutation-witnessed here:
  defaulting the component's initial state to `hig` reddens this case (plus 13.344's broader render
  check, which also asserts the default) — 2/4 fail in `style-toggle.test.tsx`. Restored, checksum-verified.* — (`apps/web/test/style-toggle.test.tsx`)
- **13.346** ✅ A stored style choice survives a reload — asserted the same way `ThemeToggle`'s
  persistence is, a fresh mount restoring from `localStorage` rather than drifting from what
  `layout.tsx`'s pre-paint script already applied; witnessed via the selected `role="tab"`
  (retitled 2026-09-15 with the return to `SegmentedControl`; previously the shared `Select`
  trigger's own visible label text, and before that a native `<select>`'s `value`). —
  (`apps/web/test/style-toggle.test.tsx`)
- **13.347** ✅ The positive control the axis needs: switching style changes a WITNESSED rendered value,
  not two numbers that merely differ in memory. `hig` and `neo`'s `raised` box-shadow both appear in
  `themeStylesheet()`'s own output under their own declaration (reusing 13.337's machinery) and the two
  values differ. *Mutation-witnessed with its OWN, narrower mutation than 13.337's (equalising ONLY
  `neo.light.raised` to `hig.light.raised`, not removing the whole style): reddens this case ALONE,
  227/228 pass. Restored, checksum-verified.* — (`packages/ui/test/tokens.test.ts`)

> **Live-suite method, recorded because it is not obvious from the baseline JSON diffs alone.** Both
> `accessible-names-baseline.json` files were backed up to a scratch directory before any live run. The
> stack baseline's six keys were verified to hand-derive the identical per-route delta
> (`+1/+4/+3/+0`/`ariaLabel`/`role`/`ariaSelected`/`ariaDescribedby`) by clearing the file to `{}` and
> re-running with `UPDATE_ACCESSIBLE_BASELINE=1` (which writes ABSENT keys only, so a cleared file
> re-records every key from the live DOM rather than from a guess), then diffing the fresh numbers
> against the backup — a stronger proof than trusting a `>=` check that cannot print what it actually
> measured. The viewport baseline was left untouched and diffed byte-identical before/after. The dev
> stack was rebuilt from this branch's working tree (`docker compose -f docker-compose.dev.yml up -d
> --build --wait web`) before either suite ran, so the measurements are against Task 14's actual CSS, not
> a stale image.

## Task 15 of the neomorphism amendment (2026-09-09) — sign-in, workspaces and invite restyled in neo

Block `13.348`–`13.357`. The amendment reserved `13.348`–`13.356` for this task; the plan's own case list
(§ "Task 15", `docs/superpowers/plans/2026-09-08-hig-per-screen.md`) uses `13.348`–`13.354`. `13.355` and
`13.356` close the two judgment calls Task 14's own section (above) flagged and explicitly declined to
resolve, naming Task 15 as the owner of both. `13.357` — one past the reserved block, the amendment's own
"next free" pointer — is the additions table's one owner-approved invented row (role labels on workspace
cards), requested and used provisionally per this file's standing convention: serial mode has one executor
and therefore no other claimant, and an unmerged id can still be renumbered. ~~**The next free BLOCK is now
`13.358`** (this PR carries the header, per the standing §12/§13 rule that the first PR minting from a
block does so) — recount the maximum in use against `origin/main` before trusting this pointer.~~
~~**`13.358`–`13.365` is CONSUMED by Round 2d, the owner's `/sign-in` neo design feedback (controller,
2026-09-09) — see that section at the foot of this file. The next free BLOCK is now `13.366`,
controller-allocated ON REQUEST ONLY**~~ — `13.358`–`13.365` is consumed by Round 2d as stated, and
**`13.366`–`13.389` is ALLOCATED to the owner's `/workspaces` cluster, Tasks 16–19 of the neomorphism
amendment (controller, 2026-09-09): `13.366`–`13.372` minted by Task 16 (this PR), `13.373`–`13.378`
reserved for Task 17, `13.379`–`13.383` for Task 18, `13.384`–`13.389` for Task 19. The next free BLOCK
is `13.390`, controller-allocated ON REQUEST ONLY** — recount the maximum in use against `origin/main`
before trusting this pointer, same caveat as every prior one in this paragraph. **Recounted at
`1417580` for Task 16's PR: the maximum id in use was `13.365`, and `13.366` appeared only in the pointer
prose above. Recounted again at `02641cb` for TASK 17's PR: the maximum in use was `13.372`, and every id
from `13.373` to `13.389` occurred ONLY in reservation prose — this file's paragraph here, the plan's Task
17 line, and the two lane state files — file-by-file, four hits for `13.373` and four for `13.378`, none of
them a case. Both documented traps reproduced again: the ordinal sweep still reports `13.3333` as its
maximum, and it also surfaces `13.9999` and a `13.632866`-shaped hit, none of which are case ids.** Both documented traps were reproduced rather than avoided by memory — a bare
`13\.[0-9]+` sweep still reports `13.3333` (the user-agent font size cases 13.266–13.267 are about) as
its maximum under an ordinal sort, and a float sort still puts `13.99` above `13.365`.

**`13.390`–`13.399` is CONSUMED by Round 19b, the owner's feedback on the workspace screens (controller,
2026-09-09) — see "Round 19b" at the foot of this file. The next free BLOCK is now `13.400`,
controller-allocated ON REQUEST ONLY** — recount the maximum in use against `origin/main` before
trusting this pointer, same caveat as every prior one in this paragraph. **Recounted at `b47f0253`
(this branch's own merge-base) before minting: the maximum id in use was `13.389`; `13.390` occurred
only in this pointer's own prose, reproducing the documented trap once more.**

**CORRECTED 2026-09-15 — the pointer above was already stale.** `13.400`–`13.402` were minted the same
day as owner-direct commits on `owner/workspace-edits` (the segmented-control sunken-selection restyle,
13.400–13.401, and the floating app bar, 13.402) without going through this paragraph's own
controller-allocation ritual — an owner editing the primary checkout does not queue behind it. Recounted
at HEAD (`d904efab`, this branch's own tip before Task 10) before minting: the maximum id in use was
`13.402`. **The workspaces-prototype-port plan's Task 10 (catalogue consolidation, 2026-09-15) mints
`13.403`–`13.410`** for the eight test-cases debts its own task brief names by description — two
uncased composite-contrast blocks in `packages/ui/test/tokens.test.ts`, the `projectLine` boundary unit
tests, the summary-line refusal/empty-read cases, the rendered project-line truncation case, and three
whole new test files (`workspace-restricted-spacing.test.ts`, `workspace-list-role-pin.test.ts`, and the
Task 8 fix-round-1 block in `workspaces-invitation-banner.test.tsx`) — see each entry below for the exact
mapping.

**CORRECTED 2026-09-16 — recounted before minting, per this paragraph's own ritual.** A coordinator
review of the `sunken-compact` shadow-role fix (owner round 3) stated the next free id as `13.412`; a
repo-wide grep for every `13.4\d\d` occurrence at this branch's HEAD found the true maximum IN USE was
still `13.410` (the `13.411` hit was this pointer's own prose, reproducing the exact trap this file's
"CORRECTED 2026-09-15" paragraph above already documented once). **`13.411` is minted below** for the
`sunken-compact` role and its `.gn-chip`/`.ticket-type-list__badge` call sites. **`13.412` is minted below**
for the `selected` shadow role. **`13.413` is minted at the foot of this file** for Round 20, the
workspace-home prototype port. **The next free BLOCK is now `13.416`.**

**What did NOT need new CSS.** Task 14 already made the shared component classes this route reuses
(`.gn-card`, `.gn-field`, `.gn-button`, `.gn-segmented`, `.gn-page-header`) variable-driven, and `neo` is
the toggle's default — so `/sign-in`, `/workspaces` and `/invite/<token>` already rendered in neo the
moment Task 14 merged, with no page-specific rule to write. **What DID need fixing were two radius
inversions Task 14's cascade change exposed** (13.355) and a real, previously-undocumented specificity
landmine 13.355 found while auditing the first two: `.gn-sign-in`'s own literal `border-radius: 16px` ties
`.gn-card`'s token-driven radius at identical specificity and wins ONLY because `layout.tsx` imports
`globals.css` after `ui.css` — the exact hazard `.gn-card.gn-invite`'s (now-removed) doubled class used to
guard against, on a selector nobody had audited for it. No markup changed on `/sign-in` or `/invite/<token>`
at all; `/workspaces` gained one new element (the role label, 13.357).

- **13.348** ✅ `/sign-in` still renders every method the server offers and no control it refuses (13.292's
  property) — unaffected by a CSS-only restyle with zero markup changes to this page in this task.
  Continuously asserted by the pre-existing suite. — (`apps/web/e2e-viewport/responsive.spec.ts`,
  `apps/web/test/sign-in.test.tsx`)
- **13.349** ✅ `/workspaces`' three-state machine (13.298–13.300: loading / refusal / empty, and the 401
  settle on `/sign-in`) is unchanged — the only markup edit this task made to this page is additive (the
  13.357 role label, inside the populated-list branch), and deletes no state. Continuously asserted by the
  pre-existing suite. — (`apps/web/e2e-viewport/responsive.spec.ts`, `apps/web/test/workspaces-cards.test.tsx`,
  `apps/web/test/founding.test.tsx`)
- **13.350** ✅ Accessible-name floors on `/sign-in` and `/workspaces` do not fall — both already carry a
  one-way ratchet (`apps/web/e2e-viewport/accessible-names.ts`'s `RATCHETED` baseline; `/sign-in` in the
  signed-out suite, `/workspaces` in the signed-in stack suite since Task 4) and both suites stayed green
  through this task with baselines unchanged (the 13.357 role label is a `<p>`, which carries no
  accessible name of its own to ratchet). `/invite/<token>`'s floor was and remains a KNOWN RESIDUAL GAP
  in the signed-in ratchet (no standing invite token in the stack seed, recorded at
  `apps/web/e2e-stack/viewport.spec.ts:375` since Task 4) — untouched by this task, and its markup is
  byte-identical (13.353), so nothing here could have moved it either way.
  — (`apps/web/e2e-viewport/responsive.spec.ts`, `apps/web/e2e-stack/viewport.spec.ts`)
- **13.351** ✅ Tap-target and type-scale ratchets do not fall on `/sign-in` or `/workspaces` — both
  routes' baselines are unchanged by this task (both suites re-run green, no `UPDATE_*_BASELINE` set).
  — (`apps/web/e2e-viewport/responsive.spec.ts`, `apps/web/e2e-stack/viewport.spec.ts`)
- **13.352** ✅ The Back control on `/privacy` and `/terms` survives — this task touches neither
  `apps/web/app/privacy/page.tsx`, `apps/web/app/terms/page.tsx` nor `apps/web/src/back-button.tsx` at
  all (verified: `git diff 73e189de.. -- apps/web/app/privacy apps/web/app/terms apps/web/src/back-button.tsx`
  is empty), and both routes remain inside the signed-out accessible-name sweep that would catch a
  regression there. — (`apps/web/e2e-viewport/responsive.spec.ts`)
- **13.353** ✅ `apps/web/app/invite/[token]/page.tsx` markup is byte-identical — no hunk touches this
  file in this task (verified the same way as 13.352). The invite surface's neo look is entirely CSS over
  existing markup, continuing the Task 4a precedent. — (`git diff` against this task's own commits)
- **13.354** ✅ The stack suite signs in through the restyled `/sign-in` and reaches `/workspaces` — **6/6**,
  witnessed live against the web image rebuilt from this task's frozen head (`docker compose -f
  docker-compose.dev.yml build web && up -d --wait web`). See the live-run note below.
  — (`apps/web/e2e-stack/smoke.spec.ts`, `apps/web/e2e-stack/viewport.spec.ts`)
- **13.355** ✅ No page-specific literal `border-radius` competes with `.gn-card`'s own
  `--gn-radius-card` token on `.gn-workspace-list .gn-card`, `.gn-card.gn-invite` (rule deleted) or
  `.gn-sign-in` (property removed) — a SOURCE scan, because the fix is the absence of a competing
  declaration. `.gn-founding` is excluded on purpose: it is not a `.gn-card` sibling, and Task 15 gave it
  `var(--gn-radius-card)` explicitly rather than deleting a rule. *Mutation-witnessed live against the
  real file (not only the in-memory self-test): reintroducing `.gn-card.gn-invite { border-radius: 12px; }`
  reddens this case's `.gn-card.gn-invite` assertion ALONE, 3 pass / 1 fail; restored via
  `git checkout HEAD --`, re-verified 4/4 green.* — (`apps/web/test/neo-card-radius.test.ts`)
- **13.356** ✅ The non-text-contrast sweep (case 13.283) now visits `/sign-in` and `/workspaces` — the two
  routes `.gn-field__input` actually renders on, and therefore the two routes case 13.339's neo pure-look
  waiver actually lives on, which the sweep never looked at before (Task 14's own 13.343 finding: neither
  route "is among the five routes this sweep visits"). The sweep still cannot compute a `box-shadow`'s
  contrast ratio (`sweepBorders` composites `border-{side}-*` only, by design), so this does not become a
  fifth measured route in the ordinary sense: a live DOM check on each route confirms the field genuinely
  has `border: none` and a non-`none` `box-shadow` (grounding the waiver's premise against THIS tree
  rather than trusting Task 13's report unverified), and Task 13's own measured numbers (1.24 light / 1.16
  dark) are then recorded as a SANCTIONED entry in the persisted roster — appended after `below` is
  computed, so it can never trip the zero-below-3 assertion, since that assertion is about what this
  instrument measured and this number is cited, not remeasured. **Witnessed live**, against the rebuilt
  image: both DOM checks passed (`border: none` and a real `box-shadow` on `/sign-in` and `/workspaces`),
  the roster now sweeps 7 routes (19 elements examined, unchanged — no bordered element exists on either
  new route), `belowCount: 0`, and `non-text-contrast-roster.json`'s `sanctionedWaivers` carries exactly
  the entry above. — (`apps/web/e2e-stack/viewport.spec.ts`, `apps/web/e2e-stack/helpers/non-text-contrast.ts`)
- **13.357** ✅ `WorkspaceRef` gains `role`; `mapWorkspaceRefs` reads it (`GET /v1/me/workspaces` has
  disclosed `role` since the route first answered, per its own docblock — only the client-side read was
  missing) and each `/workspaces` card renders its own caller role. The additions table's one
  owner-approved invented row on this screen; the other seven I-rows the audit found (member counts,
  avatars, chips, the invitation banner, Help/Account nav) stay unbuilt because no data exists for them.
  *Mutation-witnessed live against the real file: removing the rendered `<p className="gn-workspace-list__role">`
  line reddens exactly the 13.357 assertion in `workspaces-cards.test.tsx`, leaving 3.153/3.154 green;
  restored via `git checkout HEAD --`, re-verified 3/3 green.* *(Historical: 3.154 was later removed —
  see `test-cases/03-foundation-ledger.md`'s 🚫 entry, workspaces-prototype-port Task 10, 2026-09-15 —
  because the per-project rows its testid keyed no longer render. This mutation record is unaffected;
  it reports what the tree looked like at the time.)* A second refusal at the mapper level pins
  the same property one layer down: a body with no `role` key throws `MappingError` rather than
  defaulting one. — (`apps/web/test/workspaces-cards.test.tsx`,
  `packages/app-core/test/online/mappers.test.ts`)

> **Live-run note (13.354, 13.356).** The web image was rebuilt from this task's frozen head
> (`docker compose -f docker-compose.dev.yml build web`), the container recreated
> (`up -d --wait web`), and both suites run against it. `test:e2e:stack`: 6/6 (smoke ×2, the
> signed-in no-sideways-scroll check, the 12px label-text floor across 7 routes, the non-text-contrast
> sweep with its 1 sanctioned waiver, and the guest partial-workspace visibility case). `test:e2e:viewport`:
> 28/28 passed, 2 skipped (the two viewport-comparison cases this suite always skips outside its own
> three-viewport matrix run). Neither `accessible-names-baseline.json` file changed
> (`git status` clean on both after the run — `UPDATE_ACCESSIBLE_BASELINE` was never set), so "baselines
> only upward" holds trivially: nothing moved. `non-text-contrast-roster.json` is the one file the run
> changed, and its diff is committed alongside this catalogue entry.

## Round 2d of the neomorphism amendment (2026-09-09) — sign-in neo design feedback

Block `13.358`–`13.365`. The owner's post-Task-15 review found `/sign-in` did not fully match the neo
design reference (`design-system/interactive/desktop.dc.html`'s signin screen and `:root`/
`body[data-style="neo"]` token blocks) on eight points; this round closes all eight. **The largest single
finding widens the change beyond `/sign-in` itself:** `tokens.ts` already declared `{ fg: 'accent',
bg: 'surface'/'surfaceRaised', minimum: 4.5 }`, and the owner's neo-round accent hexes
(`#3A6DB0`/`#7FA9E4`) measure 4.19–4.30 as TEXT on those same backgrounds — below that floor, though
comfortably above it as a FILL (5.25+ against `accentText`). A new role, `textAccent` — the
`text`/`textMuted`/`textInverted` family, and explicitly NOT `accentText` (its opposite: colour ON an
accent-filled surface, not accent-hued text ON a neutral one) — carries the guarantee instead, derived to
clear 4.5 against every surface/raised background in every style, the `.gn-button--ghost`
fillTertiary-composited background, AND `surfaceSunken` (beyond what the two declared rows strictly
require, at zero extra cost — see `tokens.ts`'s `textAccentLight`/`textAccentDark` docblocks for the exact
derivation and margins). `blue600`/`blue300` are retired in place to the new hexes (`focusRing`/
`categoryActive` share them and are re-verified at their own 3:1 floor). A new pairless `brand` role
(`brandOrange` `#ee7733`) fills the sign-in icon tile with the prototype's one fixed hue, exempted from a
`CONTRAST_PAIRS` row with the measured number recorded rather than hidden (2.87 light, `textInverted` on
`brand` — below even 3:1, for a purely decorative `aria-hidden="true"` glyph the export itself renders the
same way).

- **13.358** ✅ The `brand` role: one primitive (`brandOrange`), both themes, no `STYLE_COLOR_OVERRIDES`
  entry — `themeStylesheet()` emits the identical literal `--gn-brand: #ee7733;` under both `:root` and
  `[data-theme="dark"]`, pinned as a hardcoded string rather than derived from the same function under
  test. `.gn-page-header__icon` fills with `var(--gn-brand)` and labels with the existing `textInverted`
  role (not a new one) rather than `accent`/`accentText`. *Mutation-witnessed: planting a wrong
  `brandOrange` hex reddens exactly the three `brand`-suite cases (200/203 pass); restored,
  re-verified 203/203 green.* — (`packages/ui/test/tokens.test.ts`)
- **13.359** ✅ The text ladder (`text`/`textMuted`) on `/sign-in` — unchanged values, confirmed still
  wired: `.gn-sign-in__hint`/`.gn-sign-in__legal` and `.gn-page-header__tagline` read `--gn-text-muted`,
  a SOURCE scan rather than a rendered one (jsdom applies no stylesheet — see 13.362's own docblock for
  why that gap matters here too). — (`apps/web/test/sign-in-neo-restyle.test.ts`)
- **13.360** ✅ `textAccent`'s derivation and the two renamed `CONTRAST_PAIRS` rows (`accent` →
  `textAccent` on `surface`/`surfaceRaised`), plus the retired accent hex measured in both directions: it
  no longer clears 4.5 as text on a bare light surface, and dark clears the two declared rows unaided.
  **UPDATED 2026-09-10 (see 13.341's own update, same day): the third check — `accent` against
  `neoNavySunken` specifically — used to fail at 4.11, which was WHY `.gn-help__result-title` (rendered on
  `surfaceSunken`) moved to `textAccent` rather than staying on `accent`. Reverting `neoNavySunken` to
  `neoNavy` flips that ONE assertion: `accent` now clears 4.5 there too (≈6.39), a changed FACT rather
  than a claim this case still needs to hold the old way.** `accent` still carries no formal guarantee on
  a sunken background — nothing derives it to — so `.gn-help__result-title` stays on `textAccent`
  regardless. `accentText` on the new `accent` still clears 4.5 in both themes, unnudged (dispatch item
  10, verified rather than assumed).
  *Mutation-witnessed: reverting `textAccentLight` to an intermediate value that clears the two declared
  rows but not the ghost-button composite reddens exactly three cases (200/203 pass) — the pinned-hex
  case, the composite/sunken case, and 13.284's own label-contrast case one describe block up, which is
  the live CSS site this derivation exists to protect; restored, re-verified 203/203 green.* — (`packages/ui/test/tokens.test.ts`)
- **13.361** ✅ Sign-in markup/CSS fidelity to the export. **Dispatch item 4 (card width/padding, field/
  button/segment geometry) needed no fix, confirmed rather than assumed**: card `26rem`/`1.5rem` padding
  already equal the export's `416px`/`24px`; `.gn-field__input`/`.gn-button` `2.75rem` min-height already
  equals the export's `44px`; neo's control radius (`14px`) already equals the export's `--ctlR`; the
  primary button's full width comes for free from `.gn-sign-in__method`'s `flex-direction:column`
  (default `align-items:stretch`). Task 14/15 already landed this; nothing here reopens it. What DID need
  fixing, four small items: (1) `.gn-sign-in__mark`
  widens to `min-width:56px` (was 44px) and, under `[data-style="neo"]` only, takes a raised
  neumorphic-square treatment (`background:var(--gn-surface)`, `box-shadow:var(--gn-shadow-raised)`) —
  `hig`/`minimal` keep the flat ghost fill unchanged, matching the export's own hig rendering of this
  screen; (2) the email input gains the export's `placeholder="you@example.com"` verbatim, an ADDITION
  since the shipped field had none; (3) the footer's Terms/Privacy links underline on hover and
  focus-visible — a deliberate departure from the export's colour-and-opacity-only affordance
  (`a:hover,a:focus-visible{text-decoration:none;opacity:.68}`), because WCAG's "more than colour alone"
  is not satisfied by an opacity shift on the same hue — and pick up the branded `--gn-focus-ring` outline
  they previously lacked; (4) `.gn-notfound__link`, which SELECTOR-OVERRIDES the global `a` rule at equal
  specificity, is moved to `--gn-text-accent` alongside it — fixing only the global rule would have left
  this one page's recovery links on the retired, now text-unsafe `--gn-accent`. *Mutation-witnessed:
  reverting `.gn-notfound__link`'s `color` to `var(--gn-accent)` reddens exactly one case in this file
  (8/9 pass); restored, re-verified 9/9 green.* — (`apps/web/test/sign-in-neo-restyle.test.ts`,
  `apps/web/test/sign-in.test.tsx`)
- **13.362** ✅ The derived segmented control, witnessed live under `data-style="neo"` — a standalone
  Playwright case (not inside the signed-out `UNAUTHED_ROUTES` sweep, so it cannot move that sweep's
  accessible-names baseline) drives `/v1/auth/methods` to `phone:true`, confirms the page actually
  rendered under `neo` (positive control), renders the control with both tabs and correct
  `aria-selected`, then reads BOTH the declared value (`--gn-fill-tertiary` on the root resolves to
  `neo`'s own hex, `#b0988429`, not `hig`/`minimal`'s) and the RENDERED one (the selected tab's own
  `box-shadow`, distinguished from `hig`'s by shape — two layers, a 16px blur — not mere non-`none`-ness,
  since `hig`'s own raised shadow is also non-`none`). This does not reopen the phone-tab removal
  decision (2c's ruling stands, reaffirmed by the owner 2026-09-09): `phone` availability is still fully
  DERIVED from the (here, stubbed) `/v1/auth/methods` response — this case changes only what the stub
  answers, not the page's own gating logic — and it is a style witness only, run against a fresh browser
  context where nothing is stored. — (`apps/web/e2e-viewport/responsive.spec.ts`)
- **13.363** ✅ The accessible-name floor on `/sign-in` does not fall — no role or label changed in this
  round (the only markup edit is the email placeholder, which carries no accessible name of its own), and
  13.362's phone:true witness runs OUTSIDE the `UNAUTHED_ROUTES` sweep specifically so it cannot move the
  baseline that ratchet reads. — (`apps/web/e2e-viewport/responsive.spec.ts`)
- **13.364** ✅ Both viewport suites (`test:e2e:stack`, `test:e2e:viewport`) pass against the dev stack
  rebuilt from this round's frozen head, `--env-file` included so Google sign-in stays configured (Task
  14's rebuild dropped it; not repeated here). See the live-run note below. — (`apps/web/e2e-stack/viewport.spec.ts`,
  `apps/web/e2e-viewport/responsive.spec.ts`)
- **13.365** ✅ The non-text-contrast roster does not grow — a straightforward re-assertion, not a new
  waiver: this round adds no new sub-3:1 pairing the roster's own instrument can see (`sweepBorders` reads
  only `border-{side}-*`, and none of this round's changes touch a border). **This is narrower than "no
  new sub-3:1 pairing exists" — case 13.358 records one this instrument cannot see**: the page-header
  icon's `textInverted`-on-`brand` measures 2.87 in light, an exempted decorative-glyph pairing with no
  `CONTRAST_PAIRS` row and no box/border for the roster to sweep. Recorded as an open item with an owner
  (this catalogue entry), not silently absorbed into "the roster is unchanged". See the live-run note
  below for the measured roster diff.

> **Live-run note (13.364, 13.365).** The dev stack was rebuilt with `docker compose --env-file
> /Users/kiro/my_projects/gisik-nokma/.env -f docker-compose.dev.yml up -d --build --wait web` (the
> `--env-file` form, per this round's own dispatch — Task 14's plain `up -d --build --wait web` had
> dropped Google sign-in's env vars). `curl -s localhost:3000/v1/auth/methods` confirmed
> `{"google":true,"apple":false,"phone":false}` before either suite ran. `test:e2e:viewport`: **31
> passed, 2 skipped** (the two viewport-comparison cases this suite always skips outside its own
> three-viewport matrix run), including 13.362 on all three viewport projects. The suite's own console
> output confirms the derived hexes live in a real browser: `.gn-button--primary` (white on the new
> accent) measures **5.26:1** — matching the computed 5.258 — and `.gn-help__toc-link`/
> `.gn-notfound__link`/`.gn-legal__back` (all now `textAccent`) measure **5.31:1** and **4.75:1** on
> their respective backgrounds, `rgb(50,93,151)` being `#325d97` (`textAccentLight`) rendered. `failures=0`
> on every route's contrast sweep. `test:e2e:stack`: **6/6** (both smoke cases, the signed-in
> no-sideways-scroll check, the 12px label-text floor across 7 routes, the non-text-contrast sweep, the
> guest partial-workspace visibility case). The non-text-contrast sweep's own summary line: **"0 of 6
> distinct bordered classes below 3:1 (19 bordered elements examined across 7 routes; ... 1 sanctioned
> waiver(s) recorded separately)"**. `non-text-contrast-roster.json` is written UNCONDITIONALLY by every
> run of this sweep (`viewport.spec.ts`'s own `writeFileSync`, not gated behind an `UPDATE_*` flag the
> way the three baseline files below are) — so a clean `git status` on it after this run is a direct
> byte-for-byte match against whatever this branch already had committed (Task 15's last write, since
> nothing has touched this file since), not merely "the printed shape looks the same". That is the
> evidence for 13.365's "the roster does not grow": this round's live measurement reproduced the
> committed file exactly, ratios and border/backdrop strings included (rounded to 2 decimals by the
> sweep itself — a sub-hundredth drift in an unrounded ratio would not show here, which is a real but
> immaterial limit on what "byte-identical" can claim for a membership/count property).
> `git status` on both `accessible-names-baseline.json` files and both `tap-baseline.json`/
> `type-scale-baseline.json` files was ALSO clean after both suites ran — those four are gated behind
> `UPDATE_*` flags that were never set, so a clean status there means "no operator asked to move the
> baseline", the weaker but still relevant claim for 13.363 (no floor moved) that this run neither needed
> nor attempted a baseline update.


## Task 16 of the neomorphism amendment (2026-09-09) — `/v1/me/workspaces` real counts, archived, visibility-scoped

Block `13.366`–`13.372`. The owner's `/workspaces` reference shows member counts, per-project ticket and
blocked chips, archived projects, and a GUEST card carrying no numbers at all. This task is **server-first**
— the card that renders any of it is Task 18. What it builds: `memberCount` per workspace and
`{ticketCount, blockedCount, archived}` per project on `GET /v1/me/workspaces`, a new `proj_projects.archived`
column folded from a new `project.archived`/`project.restored` event pair, and the mapper that reads them.

**The premise this task was dispatched on was already stale and is recorded as corrected rather than acted
on:** the owner brief's *"`getMyWorkspaces` REFUSES whole"* was true in the Plan 5/6 era and was closed by
rulings P32/P38. The route SERVES `{workspaceId, name, role, projects}` today. There was no refusal to fix;
the gap was the counts.

**The one rule under all seven cases: every number is the CALLER'S number, and a number the caller may not
count is ABSENT rather than zero.** Three ways these checks could have passed for the wrong reason, each
closed by the fixture rather than by an argument:

1. *A visibility-scoped count and a whole-table count are the same number when every fixture ticket is
   visible to everybody.* 13.368 seeds a ticket in the member's own project with an explicit audience
   naming only the owner, and asserts the member's count is STRICTLY LESS than the raw `proj_tickets`
   count while the owner's EQUALS it.
2. *A blocked count and a ticket count are the same number when every seeded ticket is blocked.* 13.369's
   project holds one blocked and two unblocked tickets, both unblocked ones in an `active` state — which
   also pins that `blocked` is not derived from `category === 'active'`.
3. *`absent` and `0` are the same to any assertion written `toBe(0)` or `?? 0`.* 13.366 and 13.372 assert
   on KEY PRESENCE (`'memberCount' in entry`), each against a positive control in the same run.

- **13.366** ✅ A guest is served no count at all — `memberCount` and both per-project count keys are
  ABSENT from the wire, not 0 — while name, role and the visibility-scoped project list are unchanged.
  Two shapes, because the withholding has to hold in both: a guest on NO project (whose project list is
  empty anyway, so the counts have nowhere to appear) and a guest who DOES hold a project-scope row and is
  therefore told that project's name and its `archived` flag and still no counts. The positive control is a
  member of the same workspace, in the same run, who has the keys — without it, a route that had stopped
  serving counts to everybody would pass. Mutation witness: permitting the guest branch in
  `visibleMemberCount` / `visibleProjectCounts` reddens this case and nothing else.
  — (`apps/server/test/routes/workspace-counts.test.ts`)
- **13.367** ✅ `memberCount` equals exactly what `readMembers` would list for the same caller, asserted
  class by class (owner 4, admin 4, member 3 over a fixture of owner+admin+member+guest), and a guest
  resolves `null`. The cross-check is the point: the count and the directory are two expressions of one
  rule — a plain member's roster hides the guest, so a naive `COUNT(*)` would have told them the withheld
  person exists. Either half alone passes for the wrong reason (three constants notice no roster drift; an
  agreement check alone agrees vacuously on two implementations wrong in the same direction), so both run.
  — (`apps/server/test/routes/workspace-counts.test.ts`)
- **13.368** ✅ `ticketCount` counts what THIS caller may see: strictly less than the raw `proj_tickets`
  count for a member outside a ticket's audience, and equal to it for the owner — the owner half being what
  proves the `proj_visibility` INNER JOIN drops nothing, so the smaller number is a SCOPE and not a bug.
  A sibling asserts an explicit `0` (key PRESENT) for a project a caller can name and has no visible work
  in, which is a claim they are entitled to and a different answer from "restricted". **A third case, added
  after an opus review found the SURVIVOR the first seven mutations missed**: neutralising the query's
  `v.workspace_id = $n` left every case green, because the route reads `counts.get()` only for the ids
  `visibleProjects` returned and `project_id` is a global primary key — from a client's side the tenancy
  clause is invisible. The world that can see it is the INTERNAL door's, where no existence check runs: a
  ticket committed under workspace B can carry workspace A's `project_id`. The case seeds exactly that, and
  asserts the raw table holds TWO rows for the id while A's owner counts ONE — so the `1` cannot be read as
  "the fixture only made one". Mutation-witnessed: the clause's removal now reddens this case ALONE.
  — (`apps/server/test/routes/workspace-counts.test.ts`)
- **13.369** ✅ `blockedCount` counts tickets in a state its own workflow flags `blocked: true` and nothing
  else: three tickets, one blocked, two in a different `active` state, and the two numbers must differ.
  The definition is `BLOCKED_STATES_CTE`, imported from `read/compile-filter.ts` rather than restated, so
  the card counts by the same expression as the board, the list and the attention strip.
  — (`apps/server/test/routes/workspace-counts.test.ts`)
- **13.370** ✅ `archived` is a fold of the new event pair, and only an owner or admin may claim it. The
  REFUSAL is asserted FIRST, so the later success cannot be mistaken for a gate that never ran: a plain
  member who is ON the project is refused, the flag is unmoved, and the project is still served to them
  unarchived. Then an owner archives (flag true, served true, and the member — whose access archiving does
  not touch — is served true as well), and `project.restored` returns it to false. A second case pins the
  two refusals the event pair inherits: an archive naming a project nobody founded is told the project does
  not exist (both types are in `projectsNamedBy`), and an empty `.strict()` payload refuses a body that
  names a project rather than ignoring it. **All three refusals name their RULE, not only their status** —
  `permission.role`, `project.unknown` (where `permission.role` would mean the existence check stopped
  running first, since that caller IS an admin) and `invalid`; a refusal for some other reason would satisfy
  a bare `status: 'refused'` while proving nothing about the gate the case is named for. **A note lives at
  the payload case because it will mislead the next person**: mutating `.strict()` in
  `packages/domain/src` proves nothing here — `@gisik-nokma/domain` exports `./dist/index.js` and
  `apps/server` has no src alias, so the server loads the BUILT artifact. Measured: the src edit leaves
  9/9 green, the same edit in `dist` reddens this case alone.
  — (`apps/server/test/routes/workspace-counts.test.ts`)
- **13.371** ✅ The shape the directory already served is unchanged for a member — the whole entry asserted
  with `toEqual`, so a future change that quietly dropped `role` or renamed `workspaceId` fails here, and
  so that the additions are pinned as ADDITIONS. — (`apps/server/test/routes/workspace-counts.test.ts`)
- **13.372** ✅ `mapWorkspaceRefs` keeps WITHHELD and a counted zero apart: an absent count maps to `null`
  and a present `0` maps to `0`, both in one body, so neither the `?? 0` bug nor its mirror (a truthiness
  check collapsing a real zero to withheld) survives. A count that is present and not a number — `null`,
  a string, a boolean — is a `MappingError` rather than a second spelling of withheld, because guessing
  which of the two claims a server meant is the invention this mapper exists to refuse. `archived` is
  REQUIRED, with a positive control on the same body. — (`packages/app-core/test/online/mappers.test.ts`)

> **One thing this task does NOT build, escalated rather than decided.** The task text asks for a
> "visible/restricted count" of the projects a caller may not name, so Task 18 can render *"1 project ·
> name restricted"*. `mapWorkspaceRefs`' own docblock forbids exactly that — *"there is deliberately no
> 'and N more', because the COUNT would itself be the disclosure the rule withholds"* — and the task text's
> own "escalate before a new rule" clause fires on the conflict. The field is strictly additive and its
> absence blocks nothing in this PR; the question, with three options and the asymmetry that decides them,
> is at `docs/lanes/owner-question-restricted-project-count.md`. **Task 18's card string has no data source
> until it is answered.**


## Task 17 of the neomorphism amendment (2026-09-09) — caller-scoped invitations, and Decline

Block `13.373`–`13.378`. The invite surface Plan 4 Task 14 shipped is **admin-and-token shaped**, measured
before a line was written: an admin mints, an admin lists their own workspace's pending ones, and anybody
holding a link can read it and accept it. Two things were therefore missing and this task builds both — a
**caller-scoped read**, so a person who lost the email can still discover they were invited, and **Decline**,
which existed nowhere in the product: the only exits from `pending` were an acceptance or an admin's
revocation, so saying no was not expressible.

**The dispatch said Accept must reuse `/v1/invites/:token/accept` and not be reimplemented. It cannot be
called from a banner, and the reason is a measured property of the design rather than an oversight:**
`invite_tokens` stores `sha256(token)` and the raw token exists in exactly one place for exactly one moment
— the body of the 201 that minted it. A caller-scoped list has no token to serve and could not be given one
without changing how invitations are stored. So the flow is not reimplemented, it is SHARED:
`apps/server/src/invites/acceptance.ts` holds the whole acceptance sequence once, moved verbatim with its
reasoning, and the two doors differ only in the proof they demand — **possession of the link**, or **a
verified email equal to the address the invitation names**. The second is strictly the NARROWER (a forwarded
link admits somebody the invitation never named; a verified address cannot), which is why adding it widens
nothing. `INVITE_ACCEPTANCE_IS_THE_SERVERS_REASON` is untouched and stays exactly as strong: it refuses
CLIENT-SUBMITTED `invite.accepted`, and both doors append through the server's internal door.

**Four ways these checks could have passed for the wrong reason, each closed by a fixture rather than an
argument:**

1. *An empty invitations list is what BOTH "correctly scoped" and "this caller has no verified address" look
   like from outside.* Every caller here signs in through `signInWithEmail`, a new helper that follows a real
   magic link and **asserts `emailVerified` on the session it returns** — `signInWithPhone` cannot produce a
   verified address at all, because better-auth's phone plugin mints a synthetic
   `@phone.gisik-nokma.invalid` and never sets the flag. Without that assertion a library change would turn
   every case in the block green for the wrong reason at once.
2. *A scope filter and no filter agree when only one invitation exists.* 13.373 mints two from ONE workspace
   to TWO addresses, so the rows differ in exactly the field under test and in nothing else.
3. *`status = 'pending'` alone is not "still live".* The claim is in the projection and the clock is in the
   credential store, and they disagree: 13.374 checks all four dead shapes — accepted, declined, revoked,
   and **lapsed-but-still-pending** — each against a live invitation in the same response.
4. *A table holding no row of the new shape diffs clean for the same reason an empty one does.* This is Task
   16's `proj_projects` trap in its own house. `proj_invites`' verify case held only `pending` and
   `accepted` rows, so it was extended with a DECLINED one: without it the rebuild's fold of
   `invite.declined` is never exercised, and — because `verify-projections` builds its shadow tables with
   `LIKE public.<table> INCLUDING ALL` — the widened `status` CHECK is never asked to admit `'declined'` in
   the shadow schema. A migration that widened only the live table would throw there and nowhere else.

**Named absences, recorded rather than papered over** (`apps/server/src/routes/my-invitations.ts` carries
them in full): phone-channel invitations do not surface here, because this read is email-scoped by the
task's own words; a phone-only account has no verified address and is answered an empty list, which is the
truth about it and not a failure; and `"user"."email"` is UNIQUE **case-sensitively**, so two accounts
differing only in case are constructible and would both match one invitation under the case-insensitive
comparison this uses — closing that means a citext or a normalising constraint on better-auth's own schema.
*Owner for the first: whoever next takes the invitations surface. For the third: whoever next touches the
auth tables.*

- **13.373** ✅ Only the invitations addressed to the CALLER surface, matched case-insensitively — two
  invitations from one workspace to two addresses, each caller served exactly their own, and the mixed-case
  address proves the comparison rather than assuming it (`seed/users.ts` already matches addresses that
  way). The ACTIONS carry the same scope as the list, asserted in the same case: a decline of somebody
  else's invitation is 404 with the frozen body and leaves it `pending` — an inviteId is a ULID any member
  can read out of their own workspace's history, so a list-only assertion would leave that open.
  **Mutation, and what it actually did:** dropping the address predicate reddens this case — and four
  others in the same file, because the suite shares one database per file and an unscoped read then
  serves every caller every invitation any case ever minted. Reported as measured rather than as the
  "reddens alone" this entry first claimed: the mutation is specific enough to identify its site (the
  message names the address scope) but it is not isolated, and saying otherwise would misdescribe what a
  future reader will see.
  — (`apps/server/test/routes/my-invitations.test.ts`)
- **13.374** ✅ An accepted, declined, revoked or lapsed invitation does not surface, while a fifth to the
  same address still does. All five are asserted LIVE first, so the final `[live]` is a filter working
  rather than a route that never served anything. The lapsed one is aged by moving
  `invite_tokens.expires_at` into the past — the only hand-written row in the file, written to the
  CREDENTIAL store because `expires_at` genuinely lives there (a projection reads no clock), and its
  projection row is asserted still `pending` so the case cannot be satisfied by the status check alone.
  — (`apps/server/test/routes/my-invitations.test.ts`)
- **13.375** ✅ A caller with no VERIFIED address is answered an empty list, while the very same invitation
  reaches a caller who has verified that address. The two responses differ in exactly one property, so a
  read that dropped `"emailVerified"` from its `WHERE` reddens this and nothing else — the escalation that
  guards against is that anyone may sign up claiming an address and only its holder can prove it. The
  phone account's synthetic `@phone.gisik-nokma.invalid` address and its `false` flag are READ from the
  table rather than assumed, because the case's whole claim is about that column.
  — (`apps/server/test/routes/my-invitations.test.ts`)
- **13.376** ✅ Declining is a real, attributed, terminal claim made by the server for the person the
  invitation names **and by nobody else** — one rule, measured on both sides in one case. The positive half
  asserts four things, because a decline doing only three would be a different feature: the EVENT is in the
  ledger under the decliner's name (not the admin's) with envelope-origin `server`, the PROJECTION moved to
  `declined`, the invitation left the caller's list, and the emailed LINK stops opening — without that last
  one a person could decline and still be admitted by the link they already had. The negative half submits
  the same claim through the client door as the workspace OWNER, the role that reaches the check with every
  earlier guard passed, and nothing lands. Mutations it reddens: make the decline a no-op; delete the
  `invite.declined` branch from `checkRolePermission`.
  **What it does NOT detect, corrected after a reviewer found this entry claiming otherwise eight lines
  from 13.377's measurement of the opposite:** dropping the token spend from the decline handler. Every
  assertion here survives it — `openableInvite` refuses on `status` before it consults the credential, so
  the link 404s once the projection reads `declined` whether or not the row was spent, and `pendingFor`'s
  own status filter answers the rest. That property belongs to 13.377's race, and even there it reddens
  probabilistically rather than certainly.
  — (`apps/server/test/routes/my-invitations.test.ts`)
- **13.377** ✅ Accepting from the caller-scoped door joins the workspace at the invited role, read back
  through `GET /v1/me/workspaces` rather than out of the table, and **spends the link with it**. Then a
  RACE, twelve trials, firing all three doors at one invitation at once — accept by link, accept from the
  banner, decline from the banner — asserting exactly one wins and that the ledger holds one terminal
  event rather than two.
  **The race is here because the sequential assertions could not see what the spend does.** Deleting the
  spend from either caller-scoped handler left every sequential check green, measured: `openableInvite`
  refuses on `status` before it reaches the credential, so the link stops opening the moment the
  projection moves whether or not the row was spent. The spend guards the CONCURRENT window and only a
  race can see it — the same reason case 6.129 needed one, after three parallel acceptances of one token
  committed in 24 of 25 trials. **And the race had to be three-way**: a pair of link-accept and
  banner-decline never runs the banner ACCEPT handler, so deleting THAT spend survived the pair.
  — (`apps/server/test/routes/my-invitations.test.ts`)
- **13.378** ✅ The banner renders the offer as a sentence with the role as a sentence too (never the raw
  enum), the dates in the PRODUCT's timezone, and Accept/Decline whose accessible names carry the workspace
  — TWO invitations in the fixture, four buttons, four different accessible names, and the PLURAL heading a
  singular fixture never reached. The second invitation carries the two names the server can honestly not
  supply, and one of them is not hypothetical: **`invitedByName: ''`**, because better-auth's
  `"user"."name"` is `NOT NULL` with no non-blank constraint and the dev workspace's own owner carries the
  empty string. Found by probing the real stack, where the banner rendered *" invited you to Convenience
  Corner as a member."* — `?? 'Someone'` does not catch a value that is neither null nor a name. Mutation:
  drop the blank guard from `named()` and this reddens. It renders **nothing at all** when none is
  waiting, which is the same claim from the side that
  matters: a banner rendering its heading unconditionally would pass every assertion about the full case.
  The expiry fixture is deliberately on the far side of the date line (`19:30Z` on the 20th renders *20
  Sept* in the `Pacific/Niue` the case renders under and *21 Sept* in the product's `Asia/Kolkata`), so a component formatting in
  the machine's zone reddens this; a same-day instant could never do that, and neither could an unvaried
  render on a gate machine that is already `Asia/Kolkata`. **The zone has to span the AWAITS and not just
  the `render()` call** — the banner renders twice, formats no date on the first pass, and produces the
  dates on the microtask after the read resolves, so a zone restored at the end of `render()` is already
  back to IST by then and the mutation survives. Measured, both ways round. Accept navigates into the workspace; Decline is witnessed as a
  RE-READ (the stub answers differently the second time and the call count is asserted), because a page that
  edited its own copy would be asserting an outcome instead of reading one. A failed invitations read leaves
  the founding form standing and says so in one muted line — not a `<ShellRefusal>`, and carrying no
  `role="status"`: in that scenario the workspace read SUCCEEDED, so the page's only live region
  (`ShellRefusal`'s) never rendered and the case asserts **zero**. The assertion's point is that this line
  does not add a SECOND one over the top of the page's own refusal when both reads fail.
  — (`apps/web/test/workspaces-invitation-banner.test.tsx`)

## Task 18 — the neo workspace card, Help/Account nav, and the option-2 restricted count (2026-09-09)

**Case ids `13.379`–`13.383`, the block allocated to Task 18** by the controller's 2026-09-09
`13.366`–`13.389` cluster allocation above. **Recounted at `11af5bc` before minting: the maximum id in
use in this file was `13.378`**, Task 17's last, and every id from `13.379` to `13.390`
occurred ONLY in reservation prose — this file's allocation paragraph, the plan's Task 18/19 lines, and
the two lane state files. Checked id by id with `grep -rn` across the whole tree, not by an ordinal sweep:
both documented traps reproduced again, `13\.[0-9]+` still reporting `13.3333` as its maximum and a float
sort still putting `13.99` above `13.378`, so the pattern used was `\b13\.3[0-9][0-9]\b`. The next free
BLOCK is still **`13.390`**, controller-allocated ON REQUEST ONLY — unchanged by this PR, which consumed
its own five and no more.

**The owner ruling this cluster carries.** 2026-09-09, verbatim: *"go with 2: Count only projects the
guest already has sight into."* The escalation is `docs/lanes/owner-question-restricted-project-count.md`,
now RESOLVED. Option 3 — count every project the caller cannot name — is refused as a plain existence
leak. The `mapWorkspaceRefs` comment forbidding any such count ("the COUNT would itself be the disclosure
the rule withholds") is AMENDED in the same change set, quoting the sentence it replaces.

- **13.379** ✅ **UPDATED same day, Round 19c** (see 13.390 below). The card renders every element from
  data the route served, and every input to every displayed number is a DIFFERENT number, so a card
  reading one field off another cannot pass: member count 5, three projects at 9/4/7 tickets and 3/1/2
  blocked, restricted count 2. The monogram carries the workspace's own name as its accessible name and
  `CC` as its text; the chips read `14 active` (`20 − 6`) and `6 blocked`; the per-project counts are
  asserted INSIDE their own rows, so a card printing one project's number on another's reddens. **Archived
  is a COUNT, not a disclosure** (Round 19c replaced the toggle-and-reveal pattern, since the revealed rows
  used to carry the one nested `<button>`/project-`<a>` pair that capped the door at the card's head): the
  archived project's own row is simply absent from the live list, and its only trace is a `1 archived`
  chip alongside the member/active/blocked chips — asserted present here and, in the negative-control case
  below, asserted absent at zero rather than printing `0 archived`. The restricted line is one text node
  (`2 projects · name restricted`), which a three-interpolation version fails. **Negative controls, because
  zero is where this card lies most easily:** a card with nothing restricted renders no line at all
  (*"0 projects · name restricted"* would appear on every owner's card, where the count is zero by
  construction), a card with nothing archived renders no chip mentioning it, and both singulars — `1
  member`, `1 project · name restricted` — are asserted on cards that have one, so the plurals above are a
  choice rather than the only string the code can produce. Mutations, each red at its own site: drop the
  `− blocked` subtraction from the active chip; stop splitting archived out of the live list; loosen
  `count <= 0` to `count < 0` so the line prints at zero. **And the TINT, which the rest of this case does
  not reach**: `getByLabelText` finds the avatar by
  the workspace NAME and asserts its INITIALS, both functions of the name — so keying the tint on the name
  instead of the id survives every other assertion here. Measured, not supposed: that mutation was run and
  passed 235/235 in `packages/ui` and every case in this file. Two cards with IDENTICAL names and
  different ids now assert different tint classes (nothing refuses a duplicate workspace name, and
  `initialsOf` gives both the same two letters), and a re-mount under a changed name asserts the SAME
  class — a colour someone has learned must survive a rename. The exact index is deliberately not
  asserted; that would pin the hash rather than the property. Positive control: both avatars carry a tint
  class at all, so the inequality cannot pass on two undefineds.
  — (`apps/web/test/workspaces-cards.test.tsx`)
- **13.380** ✅ A guest card shows ONE `Restricted` chip and no number outside the owner-ruled restricted sentence (whole-branch review, Minor 2: retitled from "no number anywhere", which the card's own *"1 project · name restricted"* falsified — the test strips that exact sentence before its digit scan). The point of the case is
  the absence, not the presence: a card printing the chip AND a zero passes *"'Restricted' is present"*
  and fails this. `0` is a claim — *"no work you can see"* — and it is exactly the claim the server
  declined to make by omitting the key (`13.366` on the route side). The numbers are queried away
  individually, by shape, so a failure says which one leaked. What the guest IS still told is asserted in
  the same run: the project's NAME (rulings P32/P38 withhold names, not this), and
  *"1 project · name restricted"* — the string the whole owner ruling exists to make renderable.
  Mutation: print `${memberCount ?? 0} members` beside the chip → RED.
  — (`apps/web/test/workspaces-cards.test.tsx`)
- **13.381** ✅ The role sentence and every gated affordance read ONE value. The fixture is deliberately
  one the shipped server never sends — **`role: 'guest'` WITH the counts present** — because it is the
  only body that separates the two possible implementations: reading `role` (what ships) renders
  `Restricted`; reading `memberCount === null` (the second source that suggests itself, and which agrees
  on every REAL guest response) renders `7 members` and two chip numbers. A case built from a realistic
  guest body cannot tell them apart, which is why this one is unrealistic on purpose. Measured both ways:
  the second-source mutation reddens this case and NOT `13.380`, and `13.380`'s own mutation reddens both
  — so the one-source property lives here and nowhere else. The unknown-role half is the same value read
  again: `WorkspaceRef.role` is a `string` on the wire (the server sends `proj_memberships.role`
  verbatim), so a role this build has never heard of is reachable, and the two answers pull opposite ways
  on purpose — the sentence stays a sentence (*"Your role here is auditor."*), the counts are WITHHELD,
  because being wrong in that direction is recoverable and being wrong in the other is not.
  — (`apps/web/test/workspaces-cards.test.tsx`)
- **13.382** ✅ `nameRestrictedProjectCount` counts what the caller already holds, never what the
  workspace contains. Three things could each make this pass while the wrong number is served, and each
  has its own assertion. **(1) Option 2 and option 3 agree whenever every project in the fixture is
  ticket-visible** — a workspace with one nameable and one unnameable project gives `1` under both rules,
  so a fixture like that certifies nothing. A THIRD project exists that the caller can neither name nor
  see a ticket in (its only ticket is explicit to the owner): option 2 counts 1, option 3 counts 2, and
  the count-all mutation reddens with *"expected 2 to be 1"*. **(2) A guest guard copied from
  `visibleMemberCount` withholds this one**, and every member-written fixture stays green while the number
  is missing from the exact card the owner's reference draws it on — so the guest is asserted in the same
  workspace, key PRESENT, value positive, beside `memberCount`'s key being ABSENT on the same object.
  **(3) The tenancy clause is observable at THIS door**, unlike `visibleProjectCounts`', whose own note
  records its mutation surviving because the route reads that map only for ids `visibleProjects` returned;
  this count is over exactly the ids it did NOT return, so a foreign workspace-mode ticket lands straight
  in it. A second workspace the caller has no membership in seeds one, with a positive control that the
  foreign row really is `resolved_mode = 'workspace'` — the kind the member's predicate matches — or the
  assertion would prove only that the fixture was inert. **The tenancy mutation had to be written twice**:
  deleting the clause outright leaves `params.add(workspaceId)` bound with no `$n` to reference it and
  Postgres answers *"bind message supplies 2 parameters"* — a 500, which reddens 22 cases and measures
  nothing about the count. Replaced with a tautology (`(v.workspace_id = $1 OR TRUE)`), which keeps the
  parameter bound and produces the wrong NUMBER: *"expected 7 to be 1"*. The owner's own answer is `0` by
  construction (every project nameable, so the subtraction empties), asserted because it is what proves
  the number is a DIFFERENCE and not a count of unnameable things.
  — (`apps/server/test/routes/workspace-counts.test.ts`)
- **13.383** ✅ The accessible-name floor RISES with the card's new controls and falls nowhere, and the
  other two signed-in ratchets do not move. Measured on the real deployed stack, not predicted:
  `stack-phone-390|/workspaces` goes `ariaLabel` **2 → 3** — the `Avatar`'s own `aria-label`, one per
  card — with `role`, `ariaSelected` and `ariaDescribedby` unchanged. **The five other signed-in routes
  rose on `rawMatches` by exactly +2 each and on NO ratcheted attribute**, and that is the interesting
  half: `/help` and `/account` are plain `<a href>` elements, an implicit role is not a `role`
  ATTRIBUTE, and `sweepAccessibleNames` counts attributes — so the nav additions contribute nothing to
  the floor. The +2 is the control proving the sweep saw them at all; without it, "no ratcheted change"
  and "the sweep never reached the new links" are the same reading. **The rise was recorded in the only
  way this file permits one** — the keys deleted and re-recorded under `UPDATE_ACCESSIBLE_BASELINE=1`,
  since `recordAccessibleBaseline` writes ABSENT keys only — and it was safe to re-record all six
  because the run immediately BEFORE asserted every old baseline and passed 6/6, so nothing could be
  lowered under cover of the update. Verified again with a THIRD run against the new file, no update
  flag, asserting: 6/6. **Type-scale is unmoved and the reason is arithmetic**: the card's two new muted
  rules are `0.8rem` = 12.8px, above the 12px floor, and the sweep's own smallest on `/workspaces` is
  12.8px on `span.gn-avatar.gn-avatar--medium.gn-avatar--tint-2` — which is also the run's independent
  confirmation that the deterministic tint really reaches the deployed DOM. **The non-text-contrast
  roster does not grow**: 6 distinct bordered classes, 0 below 3:1, 19 elements across 7 routes,
  positive control 16.72 — byte-identical to the file on `main`. `e2e-viewport`, the signed-out twin,
  is 31/31 with its baselines untouched, which is correct rather than lucky: its `UNAUTHED_ROUTES`
  render no `AppNav`, and both of its `/workspaces` blocks stub `{workspaces: []}` and a 401, so
  neither renders a card. **One control in this case is NOT exercised and it is named rather than
  implied**: the seeded Convenience Corner world has no archived project, so the archive disclosure
  never renders on the stack and its `aria-label` is not in the risen floor, nor is `button` added to
  `/workspaces`' roster row. That control is witnessed by 13.379 in jsdom instead. Closing it needs a
  seeded archived project — owner: whoever next extends the CC seed, plausibly Task 19, which builds
  archive/restore.
  — (`apps/web/e2e-stack/viewport.spec.ts`)

## Task 19 — the workspace home, a new route `app/w/[workspaceId]/page.tsx` (2026-09-09)

**Case ids `13.384`–`13.389`, the block allocated to Task 19** by the controller's 2026-09-09
`13.366`–`13.389` cluster allocation above. **Recounted at `4924dc1` before minting: the maximum id in
use in this file was `13.383`**, Task 18's last, and every id from `13.384` to `13.390` occurred ONLY in
reservation prose — this file's allocation paragraph, the plan's Task 19 line, and the two lane state
files. Checked id by id with `grep -rn` across the whole tree rather than by an ordinal sweep, because
both documented traps reproduce: `13\.[0-9]+` still reports `13.3333` as its maximum and a float sort
still puts `13.99` above `13.383`. `13.386`, `13.387` and `13.388` appeared **nowhere at all** before this
PR; `13.384`/`13.385`/`13.389` appeared only in the prose named above. The next free BLOCK is still
**`13.390`**, controller-allocated ON REQUEST ONLY — unchanged by this PR, which consumed its own six and
no more.

**What the route is.** Until this commit `/w/<workspaceId>` was not a page: a workspace was reachable only
through a project link, and that path rendered the 404. The e2e sweep's own comment said so in as many
words and is corrected in the same change set — the standing rule that a claim about the tree stops being
true the moment the tree changes.

- **13.384** ✅ The home lists THIS CALLER'S projects with THIS CALLER'S counts, and a withheld count is
  rendered as nothing rather than as zero. Every displayed number in the fixture is DIFFERENT from every
  other and each is asserted INSIDE its own row (`within(row)`), with the sibling's number asserted absent
  from it — so a page printing one project's count on every row fails, where a bare
  `getByText('9 tickets')` would pass. **Zero blocked prints no chip at all**: `0 blocked` is a true
  number and a useless one, and the row carrying it is the row a reader scans past. **Archived is marked
  AND hidden**: the archived project is absent from the default list, the disclosure's accessible name
  carries the workspace (two workspaces would otherwise present two identically-named buttons),
  `aria-expanded` is asserted in both states, and the revealed row carries an `Archived` chip — marking
  without hiding, or hiding without marking, each fails half of this. The restricted line is ONE text node,
  which a three-interpolation version fails. **The withheld half is asserted BY SHAPE** — a guest's row
  must contain no digit at all — because `toBe(0)` and `toBeUndefined()` both pass against a page that
  printed `0 tickets`, which is exactly the claim the server declined to make by omitting the key. Its
  POSITIVE CONTROL runs in the same test, same component, same one-project fixture with only the role and
  the served keys changed: without it, a page that had stopped rendering counts for EVERYBODY would pass
  the withholding assertion and the case would certify nothing. **Two mutations measured.** Rendering a
  withheld count as `count ?? 0` reddens the withholding half ALONE — 1 failed / 201 passed across
  `apps/web`. Removing the archived split (`live = workspace.projects`) reddens FOUR cases here, and that
  breadth is recorded as a limit rather than as strength: three of the four fail because they click a
  disclosure the mutation deletes, so it is a shape gate and not a site-specific measurement. The
  site-specific evidence for the archived split is this case's own assertion pair — absent from the
  default list, present with an `Archived` chip behind the toggle.
  — (`apps/web/test/workspace-home.test.tsx`)
- **13.385** ✅ Every admin affordance is gated on the caller's served role, and the case is the PAIRING.
  Asserting only that an admin has an Archive button passes against a page that shows it to everybody;
  asserting only that a member lacks one passes against a page that shows it to nobody. So all four roles
  are driven against the SAME fixture and each of the three affordances — archive, restore, new-project —
  is checked present on `owner`/`admin` and absent on `member`/`guest`. **Both non-admin roles are driven
  because they fail differently**: a gate written `role !== 'member'` admits a guest, and one written
  `role === 'owner'` locks out an admin. Every role is also asserted to get the LIST and the LINKS, so a
  page that refused the whole screen to a member would redden here rather than passing the four absence
  assertions by accident. **Mutation measured: widening the client gate (`mayAdminister` returning true
  for `member`) reddens THIS case and nothing else.** The server half is 13.388's, deliberately — the two
  halves of *"hiding a control is not enforcement"* fail at their own sites, and a mutation that reddened
  both would tell you nothing about which one is load-bearing. The measurement: **1 failed / 201 passed**
  across the whole of `apps/web` — the complete blast radius, since `src/workspace-viewer.ts` has no
  consumer outside this app — failing as *"member must not be offered “Archive Shop operations”: expected
  <button …> to be null"*, which names its own site.
  — (`apps/web/test/workspace-home.test.tsx`)
- **13.386** ✅ The screen follows the DOOR'S answer, in both directions. **Committed arm:** archiving
  takes a project out of the default list and restoring brings it back, and the movement comes from the
  RE-READ — the stub serves a different directory on the second and third calls, so a client that moved
  the row in its own copy of the list fails, which a case with a fixed stub could not detect. The
  submitted claim is asserted too, because "the row moved" is satisfied by any event at all: exactly ONE
  event, `project.archived`, filed against `{kind:'project', id:'p1'}` in this workspace, actor the
  signed-in user, envelope-origin `web`. The restore submits `project.restored` and the disclosure then
  disappears with nothing behind it. **Refused arm:** the door's own `rule: reason` reaches the screen and
  the row does not move. This is the arm that matters — a `.then()` that reloaded unconditionally passes
  the committed arm and shows a non-admin a screen indistinguishable from success, on the surface whose
  whole subject is who may do what. **Mutation measured:** dropping the re-read after a commit (an early
  `return` where the reload is) reddens this case ALONE, 1 failed / 201 passed.
  — (`apps/web/test/workspace-home.test.tsx`)
- **13.387** ✅ The five doors out of the page resolve to routes that exist, asserted as five LITERAL
  paths. **Three are workspace-scoped and two are not**: `/mcp/tokens` is a global route that takes no
  `workspaceId`, so a page building its hrefs from one `/w/${id}/` prefix would emit
  `/w/<id>/mcp/tokens`, which resolves to nothing — **and a test building its expectations the same way
  would agree with the bug.** That is the whole reason the paths are literals, and the negative naming the
  defect (`MCP tokens` must NOT point at a workspace-scoped MCP route) is asserted directly. The link
  count is asserted too, so a sixth link cannot appear unnamed. **Mutation measured:** building the MCP
  href as `/w/<workspaceId>/mcp/tokens` — the exact defect the case is named for — reddens this case
  ALONE, 1 failed / 201 passed. **UPDATED same day (Round 19e, owner: "the ticket type edit is opening in
  a separate route... repoint it"):** `Ticket types` is now the SECOND non-`/w/<id>/…` door, targeting
  `/settings?workspaceId=<id>&tab=ticket-types` — the bare `/w/<id>/settings/ticket-types` list it used to
  point at has no sidebar, and its own Edit button opened the ticket-type editor as a third, separate
  route, which is the exact bug just closed on `/settings` (§10's ticket-type-editor-inlining entry). The
  header's own `Settings` button carried the same stale href and is repointed to
  `/settings?workspaceId=<id>` the same way. `Workflows` is unchanged — its own editor (the builder) was
  never inlined into `/settings`, so repointing its list here would be cosmetic, not a fix.
  — (`apps/web/test/workspace-home.test.tsx`)
- **13.388** ✅ The DOOR decides, not the page — driven with no UI in the picture at all. A `member` and a
  `guest` each submit `project.created`, `project.archived` and `project.restored` at the real client door
  and are refused; the RULE and the REASON are asserted, not merely "not committed", because a refusal
  under some other rule would mean the three types are turned away for something unrelated to the role and
  the case would be certifying the wrong door. Nothing lands: the owner's own read afterwards shows the
  project still unarchived and the list unchanged, so a refusal that still wrote — the answer saying no
  while the world says yes — reddens. **The positive control is an `admin` at the same door in the same
  workspace with the same types**, without which every assertion above would also pass against a door that
  refused these types from everybody, and the page would be hiding controls that could never have worked.
  **WHAT THIS CASE DOES NOT OWN, established by mutation rather than by reading — and a third `it` was
  DELETED when the measurement came back.** Removing `'project.archived'` from `ADMIN_ONLY_TYPES` reddens
  this case AND pre-existing **13.370**, which already drives an owner's archive/restore round trip and a
  plain member's refusal; a case restating that here was written, measured redundant, and removed rather
  than kept to inflate a count. Removing `case 'project.member_added'` from `projectsNamedBy` reddens this
  case AND **two** cases in `test/permissions/check-project-exists.test.ts`, one of them **6.81** — *"a
  project founded EARLIER IN THE SAME BATCH is found by the check"* — which already drives the forward
  pair and the reversed control through `ingestClientBatch` with the same argument. **So the in-batch
  ordering guarantee is 6.81's property and this case does not establish it**; the reversed batch here is
  a FIXTURE, not the claim, and the case was re-aimed and renamed once that was measured. Advertising
  novelty a case does not have is worse than no case — it is a second green tick over one property.
  **What it DOES own beyond 13.370 and 6.81:** three event types rather than one and two non-admin roles
  rather than one — the page offers three controls and hides them from both; and **the visibility
  consequence that makes the founding form's second event non-optional.** 6.81 never reads
  `/v1/me/workspaces` and its actor is the workspace OWNER, whom `visibleProjects` exempts from its
  filter. Here the founder is a workspace ADMIN at the HTTP door, so the filter applies: the project whose
  `project.member_added` landed is named back to them and the one whose roster event was refused is NOT —
  though it exists and they founded it — with the workspace owner told BOTH as the control proving the
  second project is withheld rather than missing. That is the failure a one-event founding form ships, and
  nothing else in the repo would have caught it.
  — (`apps/server/test/routes/workspace-home-door.test.ts`)
- **13.389** ✅ `/w/<workspaceId>` joins the three signed-in ratchets as a seventh route, and its FIRST
  run is given teeth it would not otherwise have. `recordAccessibleBaseline` writes ABSENT keys only, so a
  route joining the sweep records its floor and asserts nothing against it on that run — *"the floor did
  not fall"* is vacuously true for a floor written from the same numbers it is compared against, and a new
  route's first pass is green by construction. So this route carries **`MUST_NAME`**, the accessible-name
  twin of the existing `MUST_EXAMINE`, asserted on every run including the first: the `Workspace sections`
  navigation, an `Archive <project>` button, and the `Ticket types` link must each be visible before any
  count taken on the page is believed. A count of 3 for a page that rendered a 404 and a count of 3 for a
  page that rendered its controls are the same number, which is the failure the sibling map already
  exists for. **Named absence, carried forward from 13.383 and NOT closed here:** the seeded stack world
  has no archived project, so the archive DISCLOSURE renders on neither `/workspaces` nor this route and
  its `aria-label` is in neither floor; that control is witnessed by 13.384 in jsdom instead. Task 19
  builds archive/restore and was named as the plausible closer — it declines, because seeding one would
  raise `/workspaces`' floor and force the delete-and-re-record dance on a baseline this task otherwise
  does not touch, which is a change with its own risk and no case here asking for it. **Owner unchanged:
  whoever next extends the CC seed.**
  — (`apps/web/e2e-stack/viewport.spec.ts`)

## Round 19b — owner feedback on the workspace screens (Task 19's cluster, revisited)

Three owner words drove this block: *"the workspace card should be clickable ... the navigation bar ...
the create workspace card shouldnt be that big."* The controller's reading of the owner's reference image
(neo, dark) elaborated four items from those three sentences; cases 13.390–13.399 are the client-only
result. No server change — `WorkspaceRef`/`ProjectRef` are unchanged, every number rendered is one Task
16/18 already served.

- **13.390** ✅ **UPDATED same day, Round 19c (owner: "the entire workspace card should be clickable ...
  everything else on the card should just be info, nothing clickable").** The `/workspaces` card's WHOLE
  content — not just the head — is a door to `/w/<id>`: `aria-label` set to EXACTLY the workspace's name,
  which overrides the content-derived name a bare anchor would compute from the avatar's own label, the
  heading, the role sentence, every project name/count and the restricted line, all now sitting inside it.
  Two elements legitimately share that accessible name (the door and the avatar), which is not an error
  but did require three pre-existing `getByLabelText` sites to disambiguate with `{ selector: '.gn-avatar'
  }`. The per-project link, the archived toggle and "My Work" are not merely moved inside the door —
  they are GONE from the card (project names are plain text; archived survives as a count chip) — so this
  case now asserts the direct, stronger shape its Round 19b version could only approximate: exactly one
  link and zero buttons anywhere in the card (`getAllByRole('link')` length 1, `queryAllByRole('button')`
  length 0), rather than proving absence indirectly by showing other controls still reachable at their own
  top-level role. Nothing removed is unreachable: `/w/<id>`, one click through this same door, already
  carries all three (Task 19, Round 19b). —
  (`workspaces-cards.test.tsx`)
- **13.391** ✅ The nav is CONTEXTUAL, transcribing the prototype's `navItems` FILTER rather than its
  picture: without a workspace in the route, only the `always` items render plus a scope note; with one,
  the served workspace name, My Work and Members join. **UPDATED same day (Round 19c, owner: "move
  members into settings and settings should always be visible on the nav bar"): the always tier grew
  from four items to five, and Members stayed put.** An earlier draft of this case (and the nav change
  it covers) also dropped `Members` from the workspace-scoped group, on the theory that "into settings"
  meant folding it there; the owner's own reference screenshots (design mockups, same feedback round)
  keep `Members` as its own top-level link beside `Settings`, so that draft was reverted — `Members` is
  UNCHANGED from before this round, still `!noWorkspace`-gated at `/w/<id>/members`. What DID move is
  `Settings`: it used to join Members and My Work only when a workspace was in the route, pointed at
  `/w/<id>/settings/ticket-types`; it now renders UNCONDITIONALLY (Workspaces, Inbox, Members,
  **Settings**, Help, Account, with Members present only inside a workspace), pointed at a new global
  `/settings` (`app/settings/page.tsx`) that carries the workspace forward as `?workspaceId=` rather than
  a path segment, because this shell remembers no "current workspace" outside a route or query param for
  an unconditional link to target — a query-carrying one still can. **Board is a second, narrower filter
  this product has and the prototype does not**: it renders only when the route ALSO carries a project,
  applying the prototype's own "a link appears only when its target exists" rule one level down (a
  workspace has no single board; a project does). The three shapes are three separate `it()`s (11.185,
  same file) rather than one array, and the Board-only-with-a-project rule is what that split exists to
  keep mutation-witnessable at all: widening the condition to drop the project check reddens the "with a
  workspace, no project" arm alone, because it is the one shape whose expected set has no Board entry
  while a workspace is present. The workspace-name item OMITS while its read is pending or fails — never
  the raw id — because `getMyWorkspaces` is one of this product's refusing reads and a name that might be
  wrong is worse than a name not yet shown. **KNOWN FAILURE (whole-branch review, deferred item 11,
  recorded 2026-09-16): this case is currently RED at `app-nav.test.tsx:238` (the "no workspace selected"
  scope-note assertion). It predates the workspaces-prototype-port branch — the last commit to touch nav
  behaviour is the owner's own `d904efab` — and is deliberately NOT fixed here: repointing a nav
  scope-note assertion is scope creep inside a `/workspaces` styling fix wave, and the spec already pushed
  this to a separate pass. Recorded so the ✅ above is not read as "passing" — it means "covered," and one
  uniformly-ignored red is how a whole gate becomes background noise.** —
  (`app-nav.test.tsx`)
- **13.392** ✅ Every literal nav target is checked against the app directory itself, not only against
  what the component renders: a table of `[href, page.tsx path]` pairs (nine, after Round 19c swapped
  `/w/<id>/settings/ticket-types` for `/settings?workspaceId=<id>` and kept `/w/<id>/members`), each
  existence-checked with `node:fs`, and the nav's own rendered href set checked both for coverage (every
  table entry appears) and for closure (every rendered href is in the table) — so a href this table
  forgot would fail loudly rather than silently passing because nobody asked. —
  (`app-nav.test.tsx`)
- **13.393** ✅ The current nav item carries `aria-current="page"`, and it is asserted the ONLY one that
  does — a page with two "current" items is a page that has not said which one is true. The sign-out
  control's VISIBLE label shrank to "Sign out" (the monogram beside it carries the rest of the reference's
  design), and its ACCESSIBLE name is asserted to still be the full "Sign out {name}" sentence via
  `aria-label` — a floor this shell ratchets elsewhere and must not fall here. The active style reuses
  `--gn-fill-tertiary`/`--gn-text-accent`, the SAME pair `.gn-button` (ghost, the product's most common
  control) already renders everywhere — no new `CONTRAST_PAIRS` row is needed because no new pair reaches
  the screen; the pairing's own measured margin (4.539, `packages/ui/src/tokens.ts`'s `textAccentLight`
  docblock) already covers it in every style and theme. —
  (`app-nav.test.tsx`)
- **13.394** ✅ Two founding-form class families, not one — `.gn-workspace-founding` (a bare column,
  max-width 420px, no card) for `/workspaces`' "New workspace" block, and `.gn-project-founding` (a
  raised card, an inline field+button row) for the home's "New project" row. Both asserted by className
  on the real `<form>` element, positively (carries its own class) and negatively (does not carry the
  other's) — a shared class regressing back to one family would redden both halves at once. Owner's
  words, verbatim, on the first: *"shouldn't be that big."* —
  (`founding.test.tsx`, `workspace-home.test.tsx`)
- **13.395** ✅ The home's header: the 56px/radius-14 monogram tints from the workspace ID — asserted by
  computing `tintIndexOf` on the id AND on the name directly (rather than comparing two renders, which
  this page's fixed route param cannot produce) and requiring the rendered class to match the id-keyed
  index and NOT the name-keyed one, with a positive control that the fixture's id and name do not
  coincidentally hash to the same tint. The meta line — *"N members · M active projects · you're an
  X"* — reads only SERVED numbers (`memberCount`; `live.length`, this caller's own non-archived list)
  and a role CLAUSE from the SAME `viewerOf` call the `/workspaces` card's sentence reads, so the two
  cannot disagree about the same person. **The member-count gate is `viewer.countsWithheld`, NOT
  `memberCount === null` — a SONNET REVIEW of the opened PR caught the first draft reading the second,
  the exact anti-pattern case 13.381 exists on the sibling `/workspaces` card to forbid.** `=== null`
  agrees with the role gate on every body the shipped server actually sends and disagrees only on a
  malformed or unrecognised-role one — precisely the divergence `viewerOf` exists to settle once. Fixed
  before merge; a second case drives the discriminating fixture (`role: 'guest'` served WITH a
  `memberCount`, which the server never sends) through both the header and 13.398's Members note in one
  body, and dies if either reverts to reading the number. A guest's line carries no member-count prefix
  at all, never a `0`. —
  (`workspace-home.test.tsx`)
- **13.396** ✅ An archived project still opens through the **same door a live one gets** — never "Open
  read-only" — at its own href; archiving is a workspace decision (Task 16), not a permission, and the
  board underneath stays writable, so the prototype's read-only label would be a false claim about this
  product's own rule. Archive/Restore reads the same `isAdmin` value 13.388's server-side door answers
  independently — this case does not re-derive a second opinion, it drives the pairing 13.385 already
  owns. **Round 20 rewrote the ASSERTION, not the claim:** the "Open board" button this used to name no
  longer exists (the owner ruled the card's body into the door — 13.413), so the case now reaches the
  door by its accessible name, and asserts that name CARRIES "archived". That half has teeth:
  `aria-label` overrides everything inside the anchor, so the visible Archived chip is invisible to
  assistive tech and a non-admin gets no Archive/Restore button to infer the state from — a door named
  plainly "Old signage" would leave an archived project indistinguishable from a live one for exactly
  the callers who cannot see the chip. A LIVE project in the same render is asserted named WITHOUT the
  suffix, as the positive control against a page that appended it to everything. —
  (`workspace-home.test.tsx`)
- **13.397** ✅ The home's archived-disclosure control is ABSENT, not merely collapsed, when nothing is
  archived — the SAME rule Task 18/19 already shipped on the `/workspaces` card, restated here because
  this round moved the control's POSITION (into the "Projects" heading row, at its end) without touching
  the rule: a control that reveals nothing lies about the shape of the data. —
  (`workspace-home.test.tsx`)
- **13.398** ✅ The five door cards carry NOTES now, verbatim from the prototype's own `wsLinks` — except
  the Members note, whose *"{N} people · roles and pending invitations."* only prints a number when
  `memberCount` is served; a guest (withheld) gets the sentence with the prefix OMITTED, never a `0`, the
  same rule the header's meta line and the `/workspaces` card both keep. Targets are UNCHANGED from Task
  19 (13.387's own literals) — only the notes are new, transcribed rather than invented. —
  (`workspace-home.test.tsx`)
- **13.399** ✅ The accessible-name floor rises and never falls across this round's changes to the four
  existing signed-in ratchet routes plus the seventh (13.389's), and the non-text-contrast roster does
  not grow — measured live against the rebuilt dev stack, `e2e-stack` (6/6) and `e2e-viewport` (31/31,
  2 skipped), owner and guest, neither baseline JSON touched. **A REAL regression was caught by this
  measurement, not merely by the suite existing.** The first draft of the five door-card notes (item 4's
  last bullet) let each note join its link's accessible name by ordinary content concatenation —
  `/w/<workspaceId>`'s own MUST_NAME probe (13.389's witness on this exact route) names a link
  `/^Ticket types$/`, exactly, and the widened name *"Ticket types Fields and the workflow each type
  follows."* no longer matched. Caught within the hour of the live rebuild, not in review. Fixed with
  `aria-label` (pins each door's accessible name to its label) plus `aria-describedby` (links the note
  as a DESCRIPTION — the correct ARIA shape for a control with a name and a supplementary note, and
  still announced by most assistive tech, after the name rather than folded into it); re-measured green.
  Archive/restore driven through the real page on the live world (owner), left exactly as found
  (`archived = f`, read back from the database); the guest's restricted view and the non-admin refusal
  note both verified live. —
  (`apps/web/e2e-stack/viewport.spec.ts`, `apps/web/e2e-viewport/responsive.spec.ts`)
- **pending-13.4xx** ✅ `/account`'s page shell (account/help screens plan, Task 2) — `AccountPage`
  became a `'use client'` shell composing `AppNav` and the page's `<h1>Account</h1>` title, and gained
  its first real content section, Appearance, wrapping the already-tested `StyleToggle`/`ThemeToggle`
  pair (`ThemeToggle` moved off `AppNav` into this new section in the same task). **Task 3 adds two
  more cases to this same pending block:** the Profile section shows the signed-in caller's current
  `name` and `email`, edits and saves the name through `authClient.updateUser({ name })` (verified
  against the installed `better-auth@1.7.2` client's generated types, not assumed), and a save that
  comes back with an `error` renders that door's `message` verbatim in a `role="alert"` rather than a
  paraphrase. **Task 4 adds one more case to this same pending block:** the Your workspaces section
  lists every workspace `dataSource.query.getMyWorkspaces()` answers, each row showing its real `role`
  (verbatim from `proj_memberships.role`) and `projects.length` as "N project"/"N projects" — no
  invented fields; two workspaces with different roles and project counts (one with a project, one
  without) render correctly and independently in the same list. A failed read is out of scope for this
  case — it collapses to the same empty render an honestly-empty answer produces (disclosed in
  `Features.md`'s bullet, not asserted here). **Task 7 adds three more cases to this same pending
  block:** the Sessions half of the new Sign-in and devices section lists every session
  `authClient.listSessions()` answers with an HONEST device label — a short, explicit substring match
  against `userAgent` (`Chrome`/`Safari`/`Firefox` × `Mac`/`Windows`/`iPhone`/`iPad`/`Android`) producing
  e.g. "Chrome on Mac", never a fabricated specific like "iPhone · Shillong", and falling back to
  "Unknown device" for anything that doesn't match or for a `null`/absent `userAgent`; the current
  session (matched by token against `authClient.useSession()`'s own `session.token`) renders no revoke
  control at all, while every other listed session gets one; and clicking that control's "Sign out"
  calls `authClient.revokeSession({ token })` with the clicked row's own token and re-lists afterward,
  proven at the page level with two sessions (one current, one not) and a real revoke click. **A real
  shape mismatch was found and fixed, not merely assumed away:** the plan's own verification step
  assumed `listSessions()` answers `createdAt`/`updatedAt` as strings; the installed
  `better-auth@1.7.2` client types them `Date` (its fetch client revives ISO strings back into `Date`
  instances on the way in), so the adapter converts explicitly rather than passing either straight
  through as a `string`. **Task 8 adds nine more cases to this same pending block**, the Passkeys half
  of the same Sign-in and devices section plus the `/sign-in` entry point it makes honest:
  (a) `PasskeysSection` shows the named empty state ("You have no passkeys yet.") with nothing
  registered, and no `role="alert"` at all when there is no refusal — the negative half, without which
  the refusal case is satisfied by a component that renders an empty alert unconditionally;
  (b) each listed credential carries a delete control whose ACCESSIBLE name is its own
  (`Delete passkey {name}`), driven with TWO rows and the SECOND clicked, because a single-row fixture
  passes against a component wired to `passkeys[0]`;
  (c) adding submits the typed name and then CLEARS the field, so a second click cannot silently
  re-submit the first name;
  (d) at the page level, the empty state → add → the row appearing comes from a RE-READ that answers
  differently the second time (`listUserPasskeys` called twice), which is what distinguishes the
  server confirming the credential from the page appending the name it was given;
  (e) deleting calls `authClient.passkey.deletePasskey({ id })` with the clicked row's own id and
  re-reads, the row leaving and its sibling staying;
  (f) a refused add renders better-auth's message verbatim in a `role="alert"` AND does not re-read
  (the call count discriminates the refusal branch from the success branch), and a refusal carrying NO
  message still surfaces rather than reading as success — `error?.message ?? null` would collapse a
  message-less refusal to "no error", and a silent no-op after a WebAuthn ceremony is
  indistinguishable from the passkey having been saved;
  (g) an ANONYMOUS `/account` load makes NO passkey request at all — the rate-limit gate, since
  `GET /passkey/list-user-passkeys` is charged to the shared `auth:` bucket and sits behind session
  middleware (measured as a real 401 in `apps/server/test/auth/sign-in-flows.test.ts`, not asserted in
  prose), so an anonymous read would spend everyone's sign-in budget on a request that cannot succeed.
  **Mutation-checked:** deleting the `user !== null` guard reddens this case and only this case;
  (h) the SERVER half of both paths, from the other side of a seam neither web suite can cross:
  `GET /api/auth/passkey/list-user-passkeys` answers `200 []` for a signed-in caller and `401` for an
  anonymous one, and `POST /api/auth/passkey/delete-passkey` reaches better-auth's handler —
  **asserted by BODY (`code: 'PASSKEY_NOT_FOUND'`), not by status, and the first version of that
  assertion was WRONG and went red: `not.toBe(404)` cannot work, because 404 is ALSO better-auth's own
  answer for an id the caller does not own, so a missing route and a working handler are identical in
  status and opposite in meaning** (the same discipline 13.273 uses to tell two limiters apart);
  (i) `/sign-in`'s restored "Sign in with a passkey" button — present under every social answer
  including the dev stack's neither-provider one (it needs no provider, so it is NOT gated on
  `GET /v1/auth/methods`, and it lives outside `.gn-sign-in__marks`), never called on mount, and called
  exactly once with `{ autoFill: false }` on click. The argument is asserted rather than the call,
  because `{ autoFill: true }` would satisfy "was called" while being precisely the
  conditional-mediation request that must not ship.
  The SERVER-side companion to (i) lives in this file's own "One limiter on `/api/auth/*`" family
  rather than here: ten `GET /api/auth/passkey/generate-authenticate-options` probes exhaust
  production's real `RATE_LIMIT_AUTH_MAX` of 10 and the eleventh genuine `POST /sign-in/magic-link` is
  refused **by our limiter, identified by body**, against a zero-probe control through the identical
  pipeline that must NOT be refused; a third case pins that the probe charges the general `auth:`
  bucket and never the tighter `signin:` one (`/passkey/*` is absent from `SIGN_IN_PREFIXES`), and a
  fourth that one deliberate click costs one unit and leaves the magic link available.
  **Both directions mutation-checked:** adding `/passkey` to `SIGN_IN_PREFIXES` reddens the bucket
  case alone; pointing the probe at a non-auth path reddens the exhaustion case alone.
  **NOT WITNESSED END TO END, and named rather than left to be discovered:**
  `apps/web/e2e-stack/passkey-registration.spec.ts` (register a credential over a CDP virtual
  authenticator on `/account`, sign out, then sign in with it on `/sign-in`, no magic link in the
  second half) is written and typechecked — `tsconfig.e2e.json` includes `e2e-stack/**`, so it cannot
  rot silently — but was **never executed**: the stack port was held by a developer's own `next dev`,
  and `playwright.stack.config.ts` refuses (correctly) to adopt a stray server. Its first green is owed
  to CI's `gate` job. So the WebAuthn ceremony itself, and the runtime URL better-auth's generated
  client builds for `listUserPasskeys`/`deletePasskey`, are the two things no test in this change set
  observes; the member NAMES are settled by `typecheck` (with a negative control) and the PATHS by (h).
  **The Account STYLING port adds four more cases to this same pending block** (owner, 2026-09-15:
  "take the styling of the account page and fix the styling in the code", then "it still doesn't match
  the Style"). **THE REFERENCE IS THE DESKTOP PROTOTYPE'S `isAccount` SCREEN**
  (`design-system/interactive/desktop.dc.html:1471-1529`), the file this plan's own spec names; the
  first cut styled against the MOBILE canvas's "Account" screen, which is the phone's More TAB, and
  that is what "doesn't match" meant. (a) `/account` renders as a centred 680px column of cards with
  `<h1>Your account</h1>` and a lead sentence, cards at 20px padding, headings at 20px/25px/600, and
  **transparent** rows separated by the card gap — measured live at 680px, not asserted. The cards
  run in the SPEC'S ORDER, which is the prototype's — Profile, Appearance, Notifications, Your
  workspaces, Sign-in and devices, Passkeys — replacing the order they happened to land in as Tasks
  2-8 each appended its own; §2's "composed in the prototype's order" had not actually been met.
  Passkeys stays adjacent to Sessions because §7 covers both as one concern; rendering them as ONE
  card is the remaining divergence from §7 and is not done here. **(f) The APPEARANCE card is rebuilt
  to its own owner reference image** (2026-09-15) — the one card with no prototype counterpart, since
  it is this page's own section per spec §4 — as two labelled `SegmentedControl`s in place of a
  `Select` trigger and an icon-only cycle button: Style (`Apple HIG`/`Minimal`/`Neomorphic`) with a
  description line that must TRACK the selection, Theme (`System`/`Light`/`Dark`), and a closing
  footnote. Cases 13.344-13.346 and 3.83 are retitled for the new control shapes rather than
  renumbered, and both component suites were rewritten to assert the SAME properties through the new
  shape. **`system` is kept as a third Theme segment against the reference image's two, pinned by its
  own case** — it is the default state and the only route back to the device preference. The
  accessible-name ratchet was CHECKED, not assumed: the signed-out baseline holds no `/account` entry,
  the stack baseline is `{}`, and the assertion is a `toBeGreaterThanOrEqual` floor that this change
  raises (`role`, `ariaSelected`) while holding `ariaLabel` level at two. (b)
  Notifications rows carry a switch built by restyling the real `<input type="checkbox">`, so
  `getByLabelText(...).not.toBeChecked()` still drives it — the control is unchanged, only its paint
  is. (c) Each workspace row is a real `<a href="/w/{id}">` named `Open <name>` exactly once, the one
  piece of new BEHAVIOUR in the port; asserted as a LINK WITH AN HREF rather than as a click, because
  a `<div onClick>` that passed a click test would still be the defect this shape exists to prevent,
  and the accessible name is pinned because `Avatar` labels itself with the same workspace name. (d)
  Sign-in and devices renders a HEDGED empty state ("No signed-in devices to show.") instead of the
  bare heading it showed before — the wording is the assertion, since the page collapses a failed read
  to `[]` and a message claiming "you have no other devices" would assert what an empty array does not
  establish. A fifth case pins the append-only footnote.
  **(e) The per-device Sign out button stays SOLID, refusing the prototype's tint on a MEASUREMENT.**
  Measured in a real browser across all six theme x style combinations: `danger` on `surfaceSunken`
  is 3.84:1 and `danger` on `surfaceRaised` is 4.29:1 (light/`neo`), both under the 4.5 a 0.9375rem
  label owes, against `dangerText on danger` at 5.38:1 — the only one of the three `CONTRAST_PAIRS`
  declares and gates. A tinted class was written and then DELETED on that reading, which is the case
  worth recording: the prototype is the reference for shape, not an override on accessibility. The
  same sweep found TWO PRE-EXISTING failures outside this change set and left them alone —
  `.ticket-type-editor__issues` at the same 3.84 and `.gn-contest-banner__action--discard` at 4.29
  under light/`neo`, both product-wide palette decisions.
  **WHAT IS AND IS NOT OBSERVED BY A TEST, stated because a styling change invites the assumption that
  green means it looks right:** (c) and (d) and the footnote ARE covered —
  `apps/web/test/account-page.test.tsx` (16) and `packages/app-core/test/account/*` (14) are green,
  and the two new `SessionsSection` cases plus the new workspace-door case are what took app-core
  1181→1183 and web 262→263. `packages/ui/test/token-discipline.test.ts` proves the block writes no
  colour literal, and that instrument was POSITIVE-CONTROLLED for this change rather than trusted — a
  planted `#ff0000` took it red naming `apps/web/app/globals.css` and the exact line. NOTHING asserts
  the RENDERED geometry of (a) or the switch paint of (b): no unit test reads these rules, and
  `apps/web/e2e-stack/helpers/non-text-contrast.ts` does not sweep `/account`. Both were instead
  verified by SCREENSHOT against a static render of the prototype's own markup and tokens, in light/
  `hig` and dark/`neo`, which is how the `neo` row-invisibility defect in the intermediate cut was
  caught at all. A rendered sweep of `/account` is the test these two still want. ❌ — **and that ❌
  sits inside this block's ✅ deliberately, not by oversight:** the behavioural half of this port is
  test-observed, the geometric half is screenshot-observed only, and flipping the block either way
  would misreport one of them. The mixed marker is the honest reading until a rendered sweep exists.
  **Not yet ID-allocated**: this file's own header requires the next free block
  (after 13.399) to be requested from the controller before minting, and this task has no channel to
  request one — the same gap `apps/web/test/app-nav.test.tsx`'s own `pending-13.4xx` describe block
  already carries for its three cases (`/help` and `/account` mounting `AppNav`), unresolved before
  Task 2, unresolved after Task 2, unresolved after Task 3, unresolved after Task 4, and still
  unresolved after Task 7. Rename every case in this block to real case ids, in order, once a block is
  requested. —
  (`apps/web/test/account-page.test.tsx`, `apps/web/src/account/profile-section.tsx`,
  `apps/web/src/account/workspaces-section.tsx`, `apps/web/src/account/account-clients.ts`,
  `packages/app-core/src/account/sessions-section.tsx`,
  `packages/app-core/test/account/sessions-section.test.tsx`,
  `packages/app-core/src/account/passkeys-section.tsx`,
  `packages/app-core/test/account/passkeys-section.test.tsx`,
  `apps/web/test/sign-in.test.tsx`, `apps/web/app/sign-in/page.tsx`,
  `apps/server/test/auth/sign-in-flows.test.ts`,
  `apps/server/test/http/security-middleware.test.ts`,
  `apps/web/e2e-stack/passkey-registration.spec.ts`,
  `apps/web/app/globals.css`, `packages/ui/test/token-discipline.test.ts`,
  `apps/web/app/account/page.tsx`, `packages/app-core/src/account/notifications-section.tsx`,
  `design-system/interactive/desktop.dc.html`)

- **13.400** ❌ **The selected segment is PRESSED under `neo`, lifted under `hig`, flat under `minimal`**
  — `[data-style="neo"] .gn-segmented__item--on` overrides the base rule's `var(--gn-shadow-raised)`
  with `var(--gn-shadow-sunken)`. Owner, 2026-09-15: *"in the prototype it was sunken style. i want it
  to follow that."*
  *THE REFERENCE HAS FIVE VALUES FOR THIS CONTROL, NOT ONE, and they split on the style axis. Read off
  `--segOnShadow` in `design-system/interactive/desktop.dc.html` rather than eyeballed from a
  screenshot: `0 3px 8px rgba(39,58,99,.16), 0 3px 1px rgba(39,58,99,.06)` (hig light),
  `0 3px 8px rgba(6,10,22,.66)` (hig dark), `none` (minimal), and two `inset 3px 3px 6px … , inset
  -3px -3px 6px …` pairs (neo light, neo dark). So the base rule was ALREADY right for two styles of
  three — `--gn-shadow-raised` resolves to `none` under `minimal` — and only `neo` was inverted. That
  is why it read as simply backwards rather than as a per-style nuance: `neo` is the shipped default,
  so the one wrong arm was the one everybody saw. One `[data-style]` override reproduces all five from
  the two existing shadow roles; no new role, no literal, and `hig`/`minimal` untouched — the same
  shape as 13.339's `[data-style="neo"] .gn-field__input` rule directly above it in `ui.css`.*
  *THE BACKGROUND MOVED TOO, and only because a failing assertion forced the value to be looked up
  rather than assumed. The first draft kept the base rule's `var(--gn-surface-raised)`, reasoning that
  `neo` collapses its surfaces anyway. It does not collapse them in LIGHT: `surfaceRaised` is `#fbf7f3`
  there against `surfaceSunken`'s `#ede4db`, so the pressed segment sat a shade too high in exactly the
  theme this suite runs in. The reference settles it — its own `--segOnBg` under `neo` is `#EDE4DB`
  light and `#1B2340` dark, which are byte-for-byte
  `colorOf('light'|'dark', 'surfaceSunken', 'neo')`. So the neo override carries
  `background: var(--gn-surface-sunken)` as well as the shadow: sunken ground, sunken shadow, the same
  pairing `.gn-field__input` (13.339) and `.gn-help__search-input` (15.34) take under `neo`.*
  ***CORRECTION, and it is the useful part of this entry.** The first version of this case said the
  change was "unasserted — nothing in the suite reads a computed style on this component," and the
  commit (810d8470) repeated it as "no gate can move on this and none did." **Both were false.**
  `13.362` reads the selected tab's rendered `box-shadow` in a real Chromium page and pins its
  geometry; it reddened on all three viewports on the very next run — 3 failed became 6. The reasoning
  behind the wrong claim was sound as far as it went (`box-shadow` is outside layout, so no ratchet
  could move) and it was still wrong, because it answered "which RATCHETS can see this" when the
  question was "what asserts this". A ratchet is not the only kind of gate. The suite caught it before
  anything shipped further, which is exactly what 13.362's docblock argues for witnessing a rendered
  value instead of trusting the source.*
  *So this case IS covered: `13.362` now asserts the `inset` keyword and both `4px 4px 9px` /
  `-4px -4px 9px` offsets, and asserts the old `7px 7px 16px` raised geometry is GONE — without that
  last line a rule emitting both would satisfy the others. The discrimination is sharper than the
  version it replaced: `hig` and `minimal` both resolve `sunken` to `none`, so these offsets can only
  appear under `neo`.* — (`apps/web/e2e-viewport/responsive.spec.ts`, case 13.362)
  ***SUPERSEDED, owner round 5 (2026-09-16, case 13.412).** The two-role approximation this entry
  documents (`raised` for `hig`, `sunken` for `neo`) is replaced by a dedicated fifth `ShadowRole`,
  `selected`, that reproduces all five prototype values exactly — including `neo`'s own 3px/3px/6px
  geometry, which `sunken`'s 4px/4px/9px never matched precisely. `13.362`'s pinned offsets moved with
  it (`4px 4px 9px` → `3px 3px 6px`); see 13.412 for the new arithmetic and mutation evidence. The
  background half of this entry is UNCHANGED — `background: var(--gn-surface-sunken)` still stands,
  since a shadow role carries no background of its own.*

- **13.401** ✅ **The segmented track paints no background of its own** — `.gn-segmented` dropped
  `background: var(--gn-fill-tertiary)`. Owner, 2026-09-15: *"the background also needs to be removed
  from the tablist."*
  *It follows from 13.400 rather than being a separate taste call: once the selected segment is a WELL
  pressed into the page, a tint behind the whole control gives the well a second ground to compose
  against, and the reference's own neo values compose against the page. The unselected segment is now
  bare page with no fill of its own — the "normal" half of the owner's description. Geometry
  (`gap`/`padding`/`--gn-radius-control`) is kept deliberately: with no fill, spacing is the only
  thing left holding the two segments apart.*
  *Asserted, and the assertion had to MOVE to stay honest: 13.362 used to read `--gn-fill-tertiary`
  off the root as its declared-value control, naming it "the segmented track background". That would
  have gone on passing forever while describing a property this component no longer has — green about
  a thing that stopped existing. It reads `--gn-surface-sunken` now (what the pressed segment actually
  composes against) and adds a direct reading of the track's own computed `backgroundColor`, which is
  `rgba(0, 0, 0, 0)`.* — (`apps/web/e2e-viewport/responsive.spec.ts`, case 13.362)

- **13.402** ❌ **The app bar floats, and everything that must clear it does** — `.gn-nav` is
  `position: sticky; top: 0; z-index: 20` with a declared `background`. Owner, 2026-09-15: *"make the
  top nav bar always be floating on the top."* It reverses this rule's own recorded decision — the
  comment used to end "the bar sits in normal document flow (not `position: sticky`/`fixed`)" — which
  is rewritten rather than left contradicting the CSS under it.
  *`sticky`, NOT `fixed`: sticky stays in flow, so the bar still occupies its own height and nothing
  below needs a compensating top margin — and that margin would have been a second copy of the bar's
  height to keep in sync with it.*
  *TWO CONSEQUENCES THE REQUEST DOES NOT NAME, both found by looking rather than by reasoning.*
  *(1) THE BAR HAD NO BACKGROUND. It only ever looked solid because `body` paints the same
  `--gn-surface` behind it; measured as `rgba(0, 0, 0, 0)`. Transparent is invisible until something
  scrolls under it, and then the page's text runs straight through the bar. Declared now at
  `var(--gn-surface)`, which keeps the resting appearance byte-identical.*
  *(2) EVERY ANCHOR LANDED BEHIND IT. A fragment navigation scrolls its target to the top of the
  viewport, which is now under a 69.6px bar. Measured before the fix: clicking "§4 — Getting your
  people in" put its heading at `top: 0.04px` with `scroll-margin-top: 0px` — the heading you asked
  for was the only thing you could not see, on every topic link and every search result in `/help`.
  `.gn-help__section`/`.gn-help__entry` now carry `scroll-margin-top`; re-measured at 86px against a
  70px bar, clear with 16px of air.*
  *`--app-nav-offset: 4.35rem` is not a magic number: `.gn-nav__links` is a 2.75rem control row and
  `.gn-nav__inner` adds 0.8rem of padding twice, which is the 69.6px the browser reports, identical at
  768px and 1512px — the whole range in which anything else here is sticky. It is DELIBERATELY not a
  `--gn-` token: `tokens.test.ts` requires every `var(--gn-…)` in `ui.css` to name a declared role, and
  this is one shell's layout fact rather than a design value. `apps/desktop` renders no nav, resolves
  the `0px` fallback, and reproduces its previous behaviour exactly.*
  *WHERE THE NUMBER IS AN UNDERSTATEMENT, recorded rather than left to be discovered: `.gn-nav__links`
  wraps, so the bar grows on narrow viewports — **measured at 190px on a signed-in workspace route at
  500px wide**, three rows of links. No single value can cover that, because the height depends on how
  many links the ROUTE contributes and on the signed-in name's width, neither of which CSS can see, so
  a media query would only trade one wrong value for another. Both consequences are bounded and both
  were checked: `.gn-help__sidebar` is `position: static` below 48rem and cannot collide at all, and a
  fragment lands ~86px down, correct wherever the bar does not wrap and merely short of it on a
  wrapped phone bar — the heading is then a short scroll away rather than lost. Exactness here needs
  the bar measured at runtime into the variable, which is a script, not a stylesheet.*
  *The one property a spec DOES assert about this element was re-checked directly, since it covers
  signed-in routes the viewport suite never visits: `e2e-stack/viewport.spec.ts` measures `.gn-nav`
  for horizontal overflow (item 7's own defect — it escaped the viewport by 10px at 390px). Measured
  live on a signed-in `/members` at the narrowest width this browser allows: **0 escaping elements,
  `scrollWidth === clientWidth`**, bar sticky and wrapped to 190px. `position: sticky` does not alter
  horizontal layout, so this was expected — but it is the assertion that exists, so it was read rather
  than reasoned about.*
  *`z-index: 20` is chosen against what is already in the tree, not picked: `.gn-select__panel` and
  `.mention-popup` are 30, `.gn-dialog__scrim`/`.gn-sheet__scrim` are 40. A dropdown opening near the
  top must render OVER the bar and a modal scrim must cover it; a bar outranking either would clip the
  menu it belongs to.*
  *Unasserted — this is CSS positioning, and nothing in the suite reads a computed style on the shell.
  **Stated carefully this time:** 13.400's first draft made the same claim about the segmented control
  and was WRONG (13.362 reads that one), so this was checked rather than assumed — no spec in
  `e2e-viewport` or `e2e-stack` queries `.gn-nav`'s position, background or z-index. What the suite
  DOES cover is that nothing regressed: overflow 0 at all three viewports, tap-target counts unmoved
  at 25/23/25, 3 failed / 28 passed unchanged. Verified by direct measurement in the running dev
  server — bar pinned at `top: 0` while scrolled 1400px, sidebar at 93.6px, anchors at 86px.* —
  (no test; owner: whoever next asserts computed style on the shell)

## The workspaces-prototype-port plan — Task 10, catalogue consolidation (2026-09-15)

Nine tasks (1–9) ported the owner's `desktop.dc.html` prototype onto `/workspaces`: tokens, shared
`ui.css` metrics, page shell/title/summary, grid and card geometry, card head/meta line, the project
line's truncation, the invitation banner, and the founding form. Two of those tasks left tests
deliberately uncased — Task 1's and Task 3's own reports name the reason: an implementer mid-plan has no
visibility into numbers concurrent work may claim, so minting was deferred to this consolidation task.
Five more new test files/cases were built and flagged as owed here by the tasks that wrote them (Task 2,
Task 4, Task 7 ×3, Task 8). Block `13.403`–`13.410`, minted per the corrected pointer above.

- **13.403** ✅ **`tintWarning` composites legibly on every surface it can reach** — the invitation
  banner's alpha wash cannot carry a `CONTRAST_PAIRS` row (`tokens.ts:228` forbids naming an alpha
  primitive there, since `relativeLuminance` ignores alpha and such a row would measure the tint's own
  colour rather than what it blends into), so the obligation is measured against the COMPOSITE instead,
  the same shape the pre-existing `fillTertiary` check uses. All twelve numbers (3 styles × 2 themes × 2
  foregrounds, `text` and `textMuted`) clear 4.5 with margin, tightest at neo/light's `textMuted`, 7.434 —
  65% above the floor. Carries the anti-vacuous control (`expect(washed).not.toBe(surface)`) so a
  fully-transparent tint cannot pass by degenerating to text-on-bare-surface. — (`packages/ui/test/tokens.test.ts`)
- **13.404** ✅ **The chip label composites legibly on `fillTertiary`, over every ground it can reach** —
  closes a gap the two pre-existing `fillTertiary` checks left open: both measure `textAccent`, not the
  chip's own `color: var(--gn-text)`, and both composite over `surface`, not `surfaceRaised` — the chip's
  actual ground, since it sits on `.gn-card`. All six style/theme combinations clear 4.5 with wide margin
  (minimum 10.49), checked over both `surfaceRaised` and `surface`. Same anti-vacuous-control shape as
  13.403. — (`packages/ui/test/tokens.test.ts`)
- **13.405** ✅ **`projectLine`'s truncation boundary: at the cap, over the cap, and the withheld
  suffix** — joined names exactly at `PROJECT_LINE_CAP` (3) take no suffix at all, the boundary a
  cap-off-by-one implementation gets wrong; one name past it truncates and COUNTS the remainder
  (`· +1 more`); and when `countsWithheld` is true the suffix drops the number (`· and more`) rather than
  leaking one to a guest — 13.380's own property ("no number anywhere") applied to a second surface. Six
  cases total (`projectLine`), plus three for the sibling `projectCountLine` (singular, plural, and
  renders nothing at zero, the same withholding rule `restrictedLine` keeps). —
  (`apps/web/test/workspace-viewer.test.ts`)
- **13.406** ✅ **The `/workspaces` page-head summary is gated on `workspaces !== null &&
  workspaces.length > 0`, both halves independently proven** — a REFUSED read is `null` exactly like an
  in-flight one, so `!== null` must be checked and must short-circuit BEFORE `.length`, or a refusal
  prints "0 workspaces you belong to." (a count of a list nobody managed to read); fix round 1 added the
  `length > 0` half, since a SUCCESSFUL empty read is a real counted zero and the summary would sit
  redundantly atop the page's own "No workspaces yet…" sentence. Both halves mutation-witnessed live: an
  ungated summary reddens the refusal case alone (`PASS 14 FAIL 1`) and, after the `length > 0` term was
  added, reddens BOTH the refusal and the empty-read case together (`PASS 14 FAIL 2`) — confirming
  neither term is redundant with the other. — (`apps/web/test/workspaces-cards.test.tsx`)
- **13.407** ✅ **The card itself truncates a wide workspace's project line, not only `projectLine`'s own
  unit tests** — "names three projects and counts the rest, so a wide workspace does not grow the card,"
  pinning `PROJECT_LINE_CAP` where it actually renders. The fixture was extended past the brief's own
  version (one project, which never reaches the truncating branch: `hidden = 1 − 3 = −2`, an unobservable
  no-op) to four, so `hidden = 1` and the branch genuinely matters; mutation-witnessed live (`projectLine`
  forced to always take the numeric branch, ignoring `countsWithheld`) reddens this case alone, caught
  first by the positive safe-string assertion and independently, with that assertion disabled, by a
  card-wide digit scan that strips the one digit-bearing string the card IS allowed to show and asserts no
  digit survives the strip. — (`apps/web/test/workspaces-cards.test.tsx`)
- **13.408** ✅ **The cross-page spacing pin for `.gn-workspace-card__restricted`, at its two call
  sites** — `/workspaces` (inside the door's flex column, where `gap` supplies the offset and the shared
  rule correctly carries `margin: 0`) and the workspace-home header (a direct `<Card>` child outside any
  flex-gap container, needing its own `margin-top: 0.55rem` via a second class,
  `.gn-workspace-home__restricted`, since no stable sibling exists there to hang a combinator off). Four
  source-scan cases: the shared rule still declares `margin: 0`; the override declares
  `margin-top: 0.55rem`; the override's line index sits textually AFTER the shared rule's (the tie-break
  both equal-specificity rules rely on); and a mutation witness that swaps the two rules' lines in a copy
  of the source and re-runs the same ordering computation, confirming it flips to `false` on the swapped
  text rather than merely being trusted to. — (`apps/web/test/workspace-restricted-spacing.test.ts`)
- **13.409** ✅ **`.gn-workspace-list__role`'s two cross-page borrowers are pinned back to their
  pre-port size** — Task 6 resized the shared rule (`0.8rem` → `0.9375rem`, plus a new `line-height`) for
  the `/workspaces` card's own sake, which silently also grew the class's two OTHER call sites: `/settings`'s
  workspace-name subtitle and the workspace-home header's meta line. Both are pinned back via a dedicated
  `.gn-workspace-list__role--pinned` modifier class (`font-size: 0.8rem; line-height: inherit` — `inherit`
  reproduces the pre-Task-6 rule's own unset `line-height`, verified via `git show` rather than guessed)
  added directly in JSX at both call sites. Three source-scan cases (the pin rule exists and declares
  `0.8rem`; the namesake bare-class rule is untouched at `0.9375rem`; a mutation witness deleting the pin
  rule's text confirms the scan then finds nothing), plus rendered-DOM assertions confirming the modifier
  class actually reaches the element at both call sites — mutation-witnessed live: removing the class from
  either JSX call site reddens exactly that page's own case. — (`apps/web/test/workspace-list-role-pin.test.ts`,
  `apps/web/test/workspace-home.test.tsx`, `apps/web/test/settings-page.test.tsx`)
- **13.410** ✅ **The invitation banner's restyle is pinned at both the CSS and the rendered-DOM level,
  not only its behaviour** — the four pre-existing cases in this file are behaviour-only (heading text,
  per-invitation sentences, accept/decline, the one-line failure message), and none pinned the tint
  background, the absent shadow/edge, or the icon's `aria-hidden` state, so the whole Task 8 restyle could
  be reverted with the suite staying green. Four new cases: `.gn-invitations` fills with
  `var(--gn-tint-warning)`; carries no `box-shadow` (the raised-card treatment is gone); carries no
  `border-inline-start` (the accent edge is gone); and the rendered banner root carries the class with its
  icon `aria-hidden`. Both the CSS-level and render-level halves are separately mutation-witnessed live
  against the real source (planting `box-shadow` back into the rule reddens exactly the box-shadow case;
  removing `aria-hidden` from the JSX reddens exactly the render-level case), each reverted immediately
  after capture. — (`apps/web/test/workspaces-invitation-banner.test.tsx`)

## Owner round 3 fix round 1 (2026-09-16) — the fourth shadow role, `sunken-compact`

Block `13.411`, minted per this file's own recount ritual (see the "CORRECTED 2026-09-16" note above
`13.400`'s block) — the true maximum id in use at HEAD was `13.410`, not `13.411` as a coordinator review
first stated.

- **13.411** ✅ **A fourth `ShadowRole`, `sunken-compact`, and every place it had to reach** — owner round
  3: "check the prototype for the shadows of the sunken badges. looks like too much shadow for a small
  badge." `[data-style="neo"] .gn-chip` and `[data-style="neo"] .ticket-type-list__badge` were both carved
  with `--gn-shadow-sunken` (`inset 4px 4px 9px`, the SAME treatment `.gn-field__input`/
  `.ticket-type-list__row` correctly use) where the prototype's own `--chipShadow`
  (`design-system/interactive/desktop.dc.html:59` light, `:71` dark) defines a smaller `inset 2px 2px 4px`
  step reserved for badge/chip-scale elements; `--fieldShadow`/`--trayShadow` (`:61`/`:62`) stay the 4px/9px
  step. Three of the four prototype layer colours are byte-identical to existing primitives
  (`shadowNeoRaisedDarkLight`, `shadowNeoHighlightLight`, `shadowNeoSunkenHighlightDark` — verified by
  converting each `rgba()` to this file's 8-digit-hex convention and diffing, not assumed); the dark
  theme's first layer needed one new primitive, `shadowNeoSunkenCompactDarkDark` (`rgba(0,0,0,0.55)` →
  `#0000008c`, distinct from `sunken`'s own `rgba(0,0,0,0.6)`). `hig`/`minimal` are `[]` for the new role in
  both themes, matching the prototype's `--chipShadow:none`. Pinned assertions: `shadowValueOf`'s exact
  return string for `neo`/light and `neo`/dark (not merely that it contains `inset` or differs from
  `sunken` — a same-shape-wrong-colour regression would survive a looser check); `hig`'s value is `'none'`.
  A SEPARATE case (this same block) closes the emission gap the coordinator review's F5 named:
  `SHADOW_ROLES` (`tokens.ts`, the array `themeStylesheet()` actually emits from) and this file's own
  `SHADOW_ROLE_NAMES` used to be two hand-maintained, unlinked arrays — a role dropped from the emission
  array alone would leave every prior case green while the var vanished from the browser. `SHADOW_ROLES` is
  now exported and `SHADOW_ROLE_NAMES` re-exports it directly (cannot diverge at the source), AND a new
  case asserts, against a deliberately-hardcoded literal role list (NOT derived from either array, so it
  cannot silently shrink with a regression), that every declared shadow role's exact declaration string
  reaches `themeStylesheet()`'s output for every style×theme. Mutation performed and reverted live, not
  merely claimed: temporarily dropping `'sunken-compact'` from `SHADOW_ROLES` reddened this case
  (`AssertionError: hig/light/sunken-compact — expected declaration "--gn-shadow-sunken-compact: none;" in
  themeStylesheet()'s output`), confirming it actually catches the regression it exists for. Every other
  remaining `--gn-shadow-sunken` call site in `ui.css` (`.fields-editor__row`, `.ticket-type-list__row`,
  `.gn-help__search-input`, `.gn-help__results`, `.gn-help__none`, `.gn-help__toggle:hover`,
  `.gn-help__quote`, `.gn-field__input`) was individually reviewed and confirmed field/tray-scale, correctly
  left on `sunken` — enumerated one by one, not summarised as a group, since a group summary
  ("fields, trays, rows") is what let `.ticket-type-list__badge` go unnoticed in the first pass.
  `[data-style="neo"] .gn-segmented__item--on` (`ui.css:2474`) is flagged as needing its OWN, third
  geometry (the prototype's `--segOnShadow`, `inset 3px 3px 6px`) rather than either existing step, and is
  deliberately left untouched — a separate scope decision for the owner, out of this block. —
  (`packages/ui/test/tokens.test.ts`)

### Round 20 — the workspace-home prototype port (`/w/[workspaceId]`)

Block `13.413`, the next free one this file's own pointer recorded after `13.411` and `13.412` were
minted for the shadow-role work. **The next free BLOCK is now `13.416`.** Round 20 ports the desktop prototype's `isWorkspace`
screen onto the page Task 19 built: the project list becomes a GRID of per-project cards, the "Projects"
heading and its toggle leave the `<Card>` that used to wrap them, the archived list merges into the one
grid, the toggle takes the reference's own label, and the five door-cards move BELOW the projects and the
founding form. Five prototype elements were deliberately NOT transcribed, each for a reason that already
exists in this repo: a project `desc` (no such field is served), "Open read-only" (13.396 forbids it),
"0 archived · show" (13.397 forbids it), "Ask to be named" rows (rulings P32/P38 serve a COUNT, not
rows), and "Delete this workspace" (the prototype's own handler refuses it as irreversible).

**The bottom "Workspace" card is NOT ported, and that is a measured omission rather than an oversight.**
Its rename field is gated on admin, but `apps/server/src/permissions/check-permission.ts:349-358` records
that `workspace.renamed` is not in `ADMIN_ONLY_TYPES`, that a workspace GUEST is admitted for it today,
and that "which roles may rename a workspace is a product decision no plan in this series has taken".
Shipping an admin-gated field would therefore render a permission rule the product has not decided —
unlike every other admin affordance on this page, whose hiding is a DISPLAY of a real server gate, there
is no gate behind this one to display. **Owner: whoever next takes the rename-permission decision.**

- **13.413** ✅ **Each project card is ONE door, and the admin control is not inside it.** Round 20's owner
  ruling reverses Round 19b's separate "Open board" button: the card's informational body (name, archived
  badge, counts) is a single `<Link>` to that project's board. Three things are pinned, and each fails a
  different plausible implementation. **One link per card**, and no "Open board" anywhere on the page —
  the ruling REMOVES that button rather than leaving it beside the new door, because a card that was a
  link and also held an "Open board" button would be the two-doors-to-one-target failure Round 19b named,
  arrived at from the other side; an implementation that merely wrapped the existing row in a link passes
  every other assertion here and fails this. **Archive/Restore is not a descendant of the anchor** —
  `<a>` may not contain `<button>`, a nested one is invalid HTML that renders anyway, and jsdom does not
  complain, so containment is asserted directly (`door.contains(button)` false, `button.closest('a')`
  null). **The archived card is revealed IN PLACE**, keeping the served order, which is what the page's
  single `filter(p => showArchived || !p.archived)` preserves and what `[...live, ...archived]` — the
  obvious way to build one list from the two bindings already in scope — would break by sinking every
  archived project to the end. **That third assertion needed its OWN fixture and the shared one would
  have made it vacuous:** `workspaceAs` serves p1, p2, p3 with p3 archived, already last, so both
  expressions yield the identical order and the check could not have failed against the implementation it
  exists to rule out. The case's fixture puts the archived project in the MIDDLE — the only arrangement
  where the two disagree — and asserts the collapsed order first as a positive control, so a failure is
  about the disclosure rather than about the grid never having been ordered at all. —
  (`workspace-home.test.tsx`)

### Round 21 — owner corrections to the workspace-home port

Block `13.414`–`13.415`, the next free ids this file's own pointer recorded after Round 20 minted
`13.413`. **The next free BLOCK is now `13.416`.** Seven owner corrections, of which three touch cases:
archived projects sort to the END of the disclosed grid (reversing 13.413), MCP tokens moves off the
workspace home and out of `/settings` to `/account` (revising 13.387, minting 13.415), and the nav's
Settings link goes back behind a workspace while Inbox moves to just before Help (minting 13.414 and
amending 11.185's three arms). The other four are CSS-only and mint nothing: the projects grid becomes
three fixed columns on `/workspaces`' own breakpoints, Archive/Restore gains a hover, the archived
dimming moves from the card onto its door, and the four section cards trade a background swap for the
same brightness pair.

- **13.413** ✅ **REVERSED, not deleted** — the archived cards now sort to the END of the disclosed grid
  (owner: "always sort the archived projects to the end"), where Round 20 asserted the served order.
  `[...live, ...archived]` was the implementation Round 20 named as the thing to rule out; it is the
  requirement now, and the single filter it replaced is what this case rules out. **The cost Round 20
  argued from was ACCEPTED, not refuted:** a disclosed project does move twice on one click (in, and
  down); the owner weighed that against grouping retired work and chose the grouping. The other two
  assertions in this case (exactly one link per card; Archive/Restore not nested in the anchor) are
  untouched. **Round 20's fixture is what made this a one-line flip** — it puts the archived project in
  the MIDDLE, the only arrangement where the two expressions disagree, so it discriminates in EITHER
  direction; had the case been written against the shared `workspaceAs` fixture (p3 archived, already
  last) it would have been vacuous before and after, and the reversal would have been invisible. —
  (`workspace-home.test.tsx`)
- **13.387** ✅ **REVISED from five doors to four.** `/mcp/tokens` left this nav for `/account`, and its
  absence is now asserted by name rather than left to the length check, so restoring the link reddens the
  case with a sentence instead of "expected 5 to be 4". The case's ARGUMENT survives the removal, which
  is why the literals stay: `/mcp/tokens` was the obvious non-`/w/<id>/…` door, but Ticket types is still
  one (`/settings?workspaceId=<id>&tab=…`, workspace as a query param), so a builder-based rewrite would
  now emit `/w/<id>/settings?…` and break that door instead — the same defect, one door over. The
  negative assertion was repointed accordingly. Its other half is 13.415. — (`workspace-home.test.tsx`)
- **13.414** ✅ Inbox renders IMMEDIATELY before Help (owner: "move inbox to just before help"). Nothing
  else in the suite pinned nav ORDER — 11.170/11.171 assert presence, and 11.185's arms assert the full
  ordered set but would keep passing if this pair moved together within it. Asserted over the DOM's own
  order (`compareDocumentPosition`) plus an adjacency check on the rendered link list, so a link inserted
  between them fails rather than passing the looser "somewhere after". — (`app-nav.test.tsx`)
- **13.415** ✅ `/account` mounts the "Connected assistants" section, at heading level 2. **The other half
  of 13.387's removal**, and the reason it is a separate case: an absence asserted alone is satisfied by
  deleting the feature outright, so one case proves the link left the workspace and this one proves the
  screen arrived. **`level: 2` is load-bearing, not decoration** — `McpTokensScreen` defaults to `h1`,
  right for the standalone `/mcp/tokens` page and wrong here, where `/account`'s own `<h1>Your account</h1>`
  already owns level 1; mounting it with the default would pass a name-only query and fail this one. —
  (`account-page.test.tsx`)

**13.391 went GREEN in this round, having been red since `762b1c8d`, and it was not fixed — it became
true.** That commit moved Settings to the always tier, which made the scope note's sentence ("pick one to
reach its board, members and settings") false while a Settings link sat plainly in the bar; the note was
commented out and the case left failing. Round 21's ruling put Settings back behind a workspace, so all
three nouns the sentence names are workspace-conditional again — verified against the component rather
than assumed (Board needs `projectId`, Members and Settings need `!noWorkspace`) — and the note renders
again. The assertion was not touched. Its sibling case in the same describe was rewritten: Settings is
now asserted as workspace-conditional, and it pins the href that must NOT come back with the revert
(`/w/<id>/settings/ticket-types`, the sidebar-less page whose Edit button opened a third route), because
the obvious way to "move it back" is to restore the old target along with the old condition.

### Round 22 — five more owner corrections to the workspace home

**No new ids: the next free BLOCK is still `13.416`.** Four of the five corrections landed; the fifth
was put to the owner and DECLINED (below), so nothing shipped for it. Only 13.387 changed, and only in its expected set — the other three
shipped items are CSS-only and mint nothing, the same treatment Round 21's four CSS-only items got.

- **13.387** ✅ **REVISED AGAIN — Workflows joined Ticket types as a query-scoped door**
  (`/settings?workspaceId=<id>&tab=workflows`), so the split is now two path-segment doors and two
  query-scoped ones rather than three and one. Owner: "clicking workflows from the project screen opens
  up a separate page. it should open up the workflows tab in the settings page." Round 19e had left it
  pointed at the bare route, reasoning the move closed no defect the way ticket types' did; the merit it
  missed is that the bare page has NO SIDEBAR, so following the card dropped you out of the settings
  shell with no way back. The case's argument is untouched and now has two doors supporting it instead
  of one. — (`workspace-home.test.tsx`)

**A false claim was removed from 13.387's docblock in the same edit, and it is worth recording because
it is the kind that reads as measured.** The docblock asserted "The paths are also checked against the
app directory itself, in the same run: a link is only proven live by a `page.tsx` existing at the route
it names." A grep for `existsSync` across `apps/web/test` finds exactly one such check — 13.392's, in
`app-nav.test.tsx`, over the NAV's targets. These four doors are not nav targets and no filesystem
assertion has ever covered them. The sentence invited a reader to trust that a typo'd href here would be
caught by something other than the literal expected in the case itself, which was never true. Three of
the four targets happen to coincide with routes 13.392 does check, so the real gap is narrow — but the
claim was wrong about this case, and a wrong claim about coverage is worse than no claim.

**SUPERSEDED THE SAME DAY BY ROUND 23 — read that section first: the Board item is GONE, not merely
conditional.** What follows is the Round 22 ruling as taken, kept because its reasoning is what rules
out the implementation somebody will otherwise reach for.

**RULED, 2026-09-16 — "once inside a workspace, the board nav bar item should be always
visible" is NOT adopted; Board stays conditional on a project being in the route.** The owner was given
the three options below and chose to leave the behaviour as it is, so `app-nav.tsx` is unchanged by this
round and the prototype's `navDef` divergence on Board is now a DECIDED difference rather than an
untranscribed one. Anyone reading that docblock's "a workspace with no project in scope has no true
Board target" should treat it as standing product policy, re-affirmed here, not as a gap awaiting work.
The reasoning that made the question worth asking is kept below, because it is what rules out the
implementation somebody will otherwise reach for next time.

Board renders only when the route carries a project, because the only board route in
the product is `/w/<id>/p/<pid>`: there is one board per PROJECT, not one per workspace. Making the item
unconditional therefore needs a target, and the obvious one — the workspace's first served project — was
REJECTED rather than shipped. It would send two people with the same workspace to different boards
depending on server ordering, move under one person when a project is founded or archived, and
manufacture the "current project" `app-nav.tsx`'s own docblock records this shell as refusing to
remember outside the URL. It would also still need a fallback when a workspace has no projects, so the
item would remain conditional and the instruction would go unmet anyway. The prototype's `navDef` is not
evidence for it either: its `go("board")` works because its state holds one implicit current project,
which is a state model this product does not have. The two alternatives put to the owner were a
`/w/<id>/board` route rendering a picker, and pointing Board at `/w/<id>` when no project is in scope
(which would put two nav items on one target while you are on that page — the two-doors-to-one-target
shape this repo has ruled against twice). **Both were declined in favour of the current behaviour: the
nav does not offer a link that cannot resolve, which is the prototype's own stated filter rule, and
that rule wins over its Board row's particular placement.**

### Round 23 — the Board nav item is removed

**No new ids: the next free BLOCK is still `13.416`.** Owner, hours after the Round 22 ruling above:
"the board on the nav bar doesn't work. lets remove it." It is gone, along with `AppNav`'s `projectId`
prop, whose only consumer it was.

**It could not have worked, and that is the finding worth keeping.** Round 22 asked the narrower
question — should the item be visible without a project — and answering "leave it conditional" left in
place something nobody had stated plainly: this product has one board per PROJECT, so Board's only
possible target was `/w/<id>/p/<pid>`, so it could render only when the route already carried a
project, which is exactly when the reader is already standing on that board. **The item was a link to
the current page in every state it could reach, and `aria-current` resolved to `"page"` every time it
appeared.** No regression made it useless; it had no useful state. The Round 22 options remain the only
ways it could return, and both still need a decision nobody has taken.

Three cases moved, none minted. Case **11.185**'s third arm — "WITH a workspace AND a project" — was
kept, with its job changed: it used to prove a project in the route ADDS Board, and now proves a project
in the route adds NOTHING. Its expected array is now deliberately identical to the second arm's, because
the two nav shapes have collapsed into one. That is not a redundant arm: the nav still reads
`usePathname()`, so a board route remains a distinct input, and a future project-conditional link would
redden this arm while leaving the second green — which is what would name the fault. Two explicit
negatives were added beside the array (`not.toContain('/w/ws_1/p/p_1')`, and no link named `Board`) so a
failure says what came back rather than only that an array grew. The arm's own docblock, which used to
describe the Board mutation witness, was rewritten rather than left describing a link that no longer
exists. Case **13.392** lost `/w/ws_1/p/p_1` from the route table. The case checks routes the nav
RENDERS, and the board route is no longer one — it still exists and is still reached from the workspace
home's project cards. The table is bidirectional (rendered hrefs are subtracted from it), so a stale row
would have failed loudly as "nav does not render it" rather than rotting quietly. Case **13.391** is
untouched and still green, but was re-verified rather than assumed: its scope note says "pick one to
reach its board, members and settings", and this round removed the bar's only Board link. The sentence
describes what picking a workspace GETS you, not what the bar renders — a board is one click from the
workspace home's project grid — so it stays true. It would become false only if boards stopped being
reachable from a workspace at all. This was checked because the case was made green one round earlier on
precisely that sentence's accuracy, and a claim that was true when written is exactly the kind that goes
stale without anyone looking.

### Round 24 — the account menu, and the inbox becomes an icon

**Block `13.416`–`13.423` minted here; the next free BLOCK is `13.424`.** Owner, two instructions in one
message: *"Current Signout button: make it into a round profile pic like thing, that opens up a context
menu on click. signout option will be moved to the bottom of that menu. along with the help and account
item from the nav bar"* and *"make inbox an icon. with an indicator (green dot?) if there is an unread
event. place it on the left of the round profile pic like thing."*

**This is the first surface on this branch with no prototype to transcribe.** Every other port here
could point at `desktop.dc.html`. Its nav is a flat `navDef` list (`:2277`) with no avatar, no menu and
no popover anywhere in the file, so the menu follows the prototype's CONTROL metrics while the behaviour
is the product's own. A later round that "restores prototype fidelity" here would be restoring something
that never existed.

**Two owner rulings taken before implementation, both on questions the instruction left open:**

1. **The unread count.** A dot can only say "some", and the badge it replaces said "3". Ruled: dot for
   the visible signal, **count in the accessible name**. Dropping the number would have removed it for
   exactly the readers least able to go looking, and would leave unread state signalled by COLOUR ALONE
   (WCAG 1.4.1). `UnreadBadge` is untouched and still renders the number on `/inbox` itself.
2. **The menu's header.** Ruled: **name and email**. The control being replaced was `Sign out {name}`,
   whose accessible name carried the signed-in identity on every page; a monogram carries none, two
   people with the same initial rendering identically. `useCurrentUser` gained `email` to serve it.

**A regression caught during implementation, recorded because the test that would have caught it was
already there and green.** The first cut had `AccountMenu` return `null` when signed out — correct in
itself, it has no name, no email and nothing to sign out of — which silently deleted the only route to
`/help` from the signed-out shell, on a page explicitly reachable signed out. Help and Account therefore
**stay bar links when there is no session**, and the pre-existing case "AppNav renders its always-items
with NO session at all" passes unmodified, which is the evidence the fallback is right rather than
merely present.

**13.414 is SUPERSEDED, and its subject is gone rather than its claim being false.** Help is no longer a
link in this bar, so "renders Inbox immediately before Help" is not wrong — it is unaskable. It is
replaced by 13.416, which pins the same KIND of claim (adjacency in the bar's tail) at the arrangement
that now exists, so the ordering tripwire Round 21 bought is not lost in the move. Case **13.414** is
superseded by Round 24 — not renumbered, not reused.

- **13.416** ✅ The inbox icon renders immediately left of the account-menu trigger, asserted over
  `compareDocumentPosition` plus sibling adjacency so an element inserted between them fails.
  — (`apps/web/test/app-nav.test.tsx`)
- **13.417** ✅ The menu holds Help and Account, both reachable once opened, both with their real hrefs;
  and the menu is CLOSED on mount with `aria-expanded="false"`. **This case is what makes 11.185's
  shortened link list safe to assert** — that list got shorter by two entries, which is also exactly
  what DELETING the links would produce, so without this the suite would agree with that bug.
  — (`apps/web/test/app-nav.test.tsx`)
- **13.418** ✅ Sign out is the LAST menu item and keeps the accessible name `Sign out {name}`. Two
  claims in one case because they fail together: the owner asked for it at the bottom, and the shell
  ratchets an accessible-name floor on that string which `e2e-stack/passkey-registration.spec.ts` also
  addresses the control by. — (`apps/web/test/app-nav.test.tsx`)
- **13.419** ✅ The menu heads with the signed-in name and email, the identity the replaced control used
  to carry. — (`apps/web/test/app-nav.test.tsx`)
- **13.420** ✅ Escape closes the menu AND returns focus to the trigger. The focus half is the
  load-bearing one: closing without it strands focus at the document root, so a keyboard user who opens
  the menu and changes their mind must tab from the top of the page. A case asserting only that the menu
  had gone would pass on that bug. — (`apps/web/test/app-nav.test.tsx`)
- **13.421** ✅ The dot appears only when unread > 0, and the count is in the link's accessible name at
  both states. Asserting only "a dot appears" would pass on an implementation that dropped the number,
  which is the change this case exists to forbid. — (`apps/web/test/app-nav.test.tsx`)
- **13.422** ✅ "1 unread notification" is singular. — (`apps/web/test/app-nav.test.tsx`)
- **13.423** ✅ Opening the menu focuses the first item, and ArrowDown/ArrowUp walk the items, wrapping
  at both ends. **Recorded late — the test landed in Round 24's commit while this file carried `13.423`
  only as the next-free pointer, so for one commit the case existed in code and nowhere in the
  catalogue.** That is the drift `Features.md`'s "same change set, never a follow-up" rule exists to
  prevent, and it is written down rather than quietly backfilled. The case is also **13.420's
  precondition**: until focus moved into the menu on open, "Escape returns focus to the trigger" was
  vacuous, because focus had never left. — (`apps/web/test/app-nav.test.tsx`)

**Five existing cases in `inbox-nav-link.test.tsx` were re-aimed, not weakened.** 11.152, 11.155, 11.156,
11.169 and the load-window case all asserted the count through `UnreadBadge`'s `role="img"`, which the
nav no longer renders. Each now asserts the same count through the link's accessible name, plus the
dot's presence or absence — so 11.156 ("keeps the last count when a refresh fails") and 11.169 ("clears
the count when the session ends in place") still measure exactly what they always did. 11.169 asserts
BOTH the name and the dot deliberately: a dot that disappeared while the name still read "3 unread"
would leave the previous session's count being announced to whoever is looking now, which is the defect
that case exists for.

### Round 25 — the nav remembers the last workspace you opened

**Block `13.424`–`13.427` minted here; the next free BLOCK is `13.428`.** Owner: *"keep the last opened
workspace in local storage, and based on that, the workspace scoped navbar items should be made visible.
so that just moving to a separate page (inbox, help, account, etc) does not automatically hide them."*

`use-last-workspace.ts` (NEW) holds the memory, following the `gn-style`/`gn-theme` convention already in
this shell. `AppNav` takes the route's workspace when there is one and the remembered one otherwise.

**The rule the bar has held since Round 19b is UNCHANGED: a link renders only when its target exists.**
What changed is where the workspace comes from. That matters because a remembered id is a *guess about
the past* — it may name a workspace you have since been removed from, or one that was deleted — so the
two sources are NOT treated alike:

- A **routed** workspace renders its links immediately. Standing on `/w/<id>/members` is proof.
- A **remembered** one renders them only once `useWorkspaceName` resolves a name from
  `getMyWorkspaces()`. Rounds 22 and 23 deleted the Board item for offering a link that could not
  resolve; this is the same hazard arriving from storage instead of from a route. No second request and
  no second definition of "reachable" — it reuses the read the bar already makes.

**Two assertions in 13.391 changed, and neither was relaxed to fit the code.**

1. The scope note's query moved from `getByText` to `findByText`. It is now gated on a POSITIVE "storage
   read, nothing remembered for this person" rather than on the synchronous "no workspace", because the
   synchronous form would flash *"No workspace selected"* at every viewer who HAS a remembered workspace,
   on every global page they open. The sentence is one tick later and never false.
2. "No workspace in the ROUTE, no Settings link at all" became "no workspace REACHABLE — none routed and
   none remembered — no Settings link." The old wording is precisely what the owner's instruction
   revokes. **13.424 is the counterpart that keeps this honest**: without it, the "no Settings" assertion
   could be satisfied by a nav that had simply stopped remembering anything at all.

**A stated cost, rather than a hidden one.** When a workspace IS remembered but its name never resolves,
neither the scoped links nor the scope note render. The alternative — clearing the memory when the name
fails — would destroy a valid workspace on a TRANSIENT `getMyWorkspaces` failure, throwing away real
state to recover a hint. `Workspaces` remains one click away and is the real route out.

Case **13.423** belongs in this list too, recorded late in Round 24 — see that section.

- **13.424** ✅ On a global page (`/inbox`) with a workspace remembered and resolvable, the name, My
  Work, Members and Settings all render with their real hrefs, none carries `aria-current`, and the
  scope note is absent. The owner's instruction, asserted directly.
  — (`apps/web/test/app-nav.test.tsx`)
- **13.425** ✅ A workspace remembered for a DIFFERENT user is ignored: the scope note renders and the
  other person's workspace NAME appears nowhere. `localStorage` outlives a session, so an unkeyed memory
  would render the previous viewer's workspace in the next viewer's chrome — the defect 11.169 exists
  for, one surface over. The assertion is on the name, because the name is the part that leaks.
  **Mutation-witnessed:** deleting the `storedUserId !== userId` guard reddens this case and nothing
  else. — (`apps/web/test/app-nav.test.tsx`)
- **13.426** ✅ A remembered workspace that no longer resolves offers no scoped links. The fixture is a
  SUCCESSFUL read that does not contain it (`workspacesOf([])`) — what being removed looks like — rather
  than a rejecting stub, which would prove something weaker since a refusal also yields a null name. The
  inbox link is asserted first as a settled-render witness, so "no My Work" is a decision and not a
  snapshot taken too early. **Mutation-witnessed:** treating a remembered id as authoritative reddens
  this case and nothing else. — (`apps/web/test/app-nav.test.tsx`)
- **13.427** ✅ Opening a workspace records `{userId, workspaceId}` under `gn-last-workspace`. Asserted
  through the STORAGE KEY, not through a later render: a later render would also pass if the value were
  held only in React state, which would not survive the page navigation this whole feature exists for.
  — (`apps/web/test/app-nav.test.tsx`)

**Test isolation, added here because the nav now WRITES.** jsdom keeps one `localStorage` for the whole
module, so a case rendering `<AppNav workspaceId="ws_1" />` left the key behind for every case after it —
order-dependence that shows up as a suite going red when one test is renamed. `app-nav.test.tsx` now
clears storage and reseeds the mock session in `beforeEach`.

### Round 26 — the nav stops jittering on page changes

**Block `13.428`–`13.429` minted here; the next free BLOCK is `13.430`.** Owner: *"the nav bar item
jitters on changing pages. the workspace scoped items briefly disappears and reappears. make it so that
it is smooth and the jitter does not happen."*

**The mount is the bug.** `Providers` lives in the root layout and persists across client-side
navigation, but `AppNav` is rendered by each PAGE (`app/inbox/page.tsx:210` and fourteen siblings), so
every navigation unmounts and remounts it. Its state therefore reset to "nothing known yet" on every page
change: `useLastWorkspace` restarted at `unknown` and `useWorkspaceName` at `null`, so the
workspace-scoped links vanished for the tick it took to re-read storage and re-fetch the name, then came
back. Round 25 made this loud by putting four links behind that state; **the workspace-NAME half of it
predates Round 25 entirely** and flickered even when navigating between two pages of the same workspace,
where it was one item and easier to miss.

Fixed by holding both answers in MODULE scope, which survives the remount, and initialising `useState`
from them. The first load of a session still resolves asynchronously — nothing is known yet, and
painting links from no information would be inventing state.

**Two things the fix must not do, each with its own case and each mutation-witnessed:**

- It must not **resurrect a workspace you have lost**. The cache is read on every remount, so an entry
  left behind after the product learns the workspace is gone would put the name back one navigation
  later — 13.426's defect displaced in time rather than fixed. A successful read that does not contain
  the workspace therefore EVICTS; only a rejected read (transient) leaves the entry alone.
- It must not **leak across viewers**. Neither cache passes through `readFor`'s user guard — the
  remembered-workspace cache is checked before it, the name cache is keyed by workspace id alone — so
  both are dropped when the observed user id changes. Signing out and back in as someone else is a
  client-side navigation, which does NOT reset module state.

- **13.428** ✅ After a navigation, the workspace name, My Work, Members and Settings are present in the
  FIRST committed render, and the scope note never flashes in their place. **The case mounts twice and
  asserts synchronously, and both are load-bearing**: every other case in this file mounts once and so
  could not see a remount defect at all, and any `findBy*` here would wait exactly long enough to hide
  the flicker it exists to catch. **Mutation-witnessed:** restoring either hook's cold start reddens this
  case and nothing else. — (`apps/web/test/app-nav.test.tsx`)
- **13.429** ✅ A workspace that has become unreachable does not reappear on the next navigation, proving
  the eviction above. — (`apps/web/test/app-nav.test.tsx`)

**A mutation that was thrown away rather than believed.** The first attempt at witnessing 13.428 replaced
the `useState` initialiser with `() => { status: 'unknown' }` — a block body returning `undefined`, not
the object literal intended. It reddened 22 cases, which looks like a strong witness and is worthless:
the code under test was malformed rather than reverted. A mutation must be the code that plausibly
SHIPS, and a failure count far larger than expected is a reason to re-read the mutant, not to record a
result.

### Round 27 — the project/board page's desktop-prototype-port begins: page chrome (`/w/[workspaceId]/p/[projectId]`)

**Block `13.430` minted here; the next free BLOCK is `13.431`.** Task 2 of
`docs/superpowers/plans/2026-09-16-board-prototype-port.md` (Task 1 was STRUCK — see the plan's
Progress log — so this is the port's first landed code). Restyles the page's existing chrome rather
than rebuilding it: `role="tablist"`/`role="tab"`/`aria-selected` are unchanged throughout.

**The tab rail becomes the shared segmented control.** The container's class moves from the
page-local `.gn-view-tabs` to `.gn-segmented`, and each tab button gains `.gn-segmented__item` plus
`.gn-segmented__item--on` when selected — the same classes `/sign-in`, `/account` and `/help` already
share (`packages/ui/src/ui.css`). `.gn-view-tabs` now survives nowhere in the product;
`apps/web/app/globals.css`'s own docblock had already recorded it as surviving "only on the project
page", and its three now-dead rules are left in place rather than deleted — out of this task's file
scope (`page.tsx` and `ui.css` only) and reported rather than silently removed.

**The New-ticket control moves out of the tablist into a new `.gn-project__header` row.** It used to
render as the tablist's fifth child — a plain `<button>` (or a `<p role="status">` while gated) sitting
inside a `role="tablist"` beside four `role="tab"` children, an ARIA defect the 2px-gap segmented track
would only have made more visible. `.gn-project__header` is the container Task 4 (search), Task 5
(Filters) and Task 8 (the workflow `<select>`) add their own controls to; New ticket is the one already
built, so it moves in now. No test scopes a `New ticket` query from the tablist container — both
`page-refusals.test.tsx` and `project-create-gate.test.tsx` query `screen` (or `within(dialog)`)
directly — so the move changes no test's reach.

**`.gn-project`, `.gn-project__breadcrumb`, `.gn-project__title` and `.gn-project__summary` are
declared in `ui.css` per the spec's Page-chrome metrics table, and are UNCONSUMED here.** This page
reads no project name anywhere: `BoardView` is `{projectId, groups}` (`view-types.ts:139`), and
`DataSourceQuery` has thirteen methods, none named `getProject`/`getProjects` — only
`getMyWorkspaces()` carries project names, and only on the workspace-home page
(`apps/web/app/w/[workspaceId]/page.tsx`), not here. Grepped across every task in the port's plan:
no task ever references `.gn-project__breadcrumb`/`__title`/`__summary` outside this one CSS-declaring
step. Recorded rather than guessed at — a future task (not yet in this plan) owes the read before
these three rules render anything real; `.gn-project` itself IS consumed, as the page's own content
wrapper (`padding`/`column`/`gap`, nested inside the existing `.gn-shell__main`, not merged onto it —
the two files' rules would otherwise cascade-order against each other).

- **13.430** ✅ The selected tab, and only it, carries `gn-segmented__item--on`, driven from the same
  boolean that sets `aria-selected` rather than two comparisons kept in agreement by hand.
  — (`apps/web/test/project-calendar-timeline.test.tsx`)

**Task 2 fix round 1 (coordinator Rulings 5 and 6, same day) — the two findings above were correct,
and both are now closed rather than merely flagged.**

**Block `13.431`–`13.432` minted here; the next free BLOCK is `13.433`.** Ruling 5: `.gn-project`
drops its horizontal `padding` entirely (it kept only `flex-direction`/`gap`/bottom `padding`) — the
brief's literal `padding: 0 2rem 1.5rem` stacked additively on top of `.gn-shell`'s own
`padding: 0 1.25rem 3rem` (`apps/web/app/globals.css:101`), landing this page's content at 52px from
the viewport edge (20px + 32px) rather than the prototype's own 32px. `.gn-workspaces`
(`globals.css:210`) already answers this exact shape for a sibling page — it keeps ONLY what
`.gn-shell` does not already provide — and `.gn-project` now follows the same rule, with the
residual 20px-vs-32px gap recorded in a comment on the rule rather than closed: closing it would mean
moving `.gn-shell` itself, shifting every route in the product for one page's inset.

Ruling 6: the CSS gap was real, but the DATA gap was not — `ProjectRef.name`
(`packages/app-core/src/view-types.ts:15-23`) already travels on `WorkspaceRef.projects`, served by
the SAME `getMyWorkspaces()` read `apps/web/src/use-workspace-name.ts` already makes for this page's
own `<AppNav>` link. Added `apps/web/src/use-project-name.ts`, mirroring `use-workspace-name.ts`'s
shape and its "omission, never the id" contract exactly, but WITHOUT that hook's module-scoped name
cache: `AppNav` remounts on every client-side navigation (Round 26's whole reason for caching), while
this hook mounts once per page load, so there is nothing a cache would buy here and the asymmetry is
recorded as a decision in the new hook's own docblock. `page.tsx` now renders the workspace name in
`.gn-project__breadcrumb` and the project name in `<h1 className="gn-project__title">`, each
independently omitted (not the raw id, not a placeholder) while its own hook holds `null`. Neither
reserves layout space while absent — no fixed-height wrapper sits around either — so
`.gn-project__header` is exactly as tall as whichever of its children have resolved and grows once a
name mounts, rather than holding blank space that a name later fills. `.gn-project__summary` (the
`N of M shown` line) is UNCHANGED from Round 27: still declared, still unconsumed, left for the task
that adds the count rather than filled with an invented number.

- **13.431** ✅ A resolved `getMyWorkspaces` read names both the breadcrumb (the workspace) and the
  title (the project), each independently, disambiguated from `<AppNav>`'s own workspace-name link by
  scoping to `.gn-project__breadcrumb`. — (`apps/web/test/project-page-chrome.test.tsx`)
- **13.432** ✅ While `getMyWorkspaces` has not answered (left unstubbed — pending or refused, the same
  state either way to the caller), neither the breadcrumb nor the title element exists at all, and
  specifically the raw workspace/project ids are absent from the document — the failure this pair
  exists to catch is the id standing in for the name nobody could confirm.
  — (`apps/web/test/project-page-chrome.test.tsx`)

No new token roles: Task 1 was struck, so every `var(--gn-…)` referenced above (`--gn-text-muted`)
was already declared before this change — the same role `.gn-field__label` already reads in the same
file. `packages/ui/test/tokens.test.ts`'s role-existence guard and `token-discipline.test.ts`'s
no-literal-colours guard both pass unchanged.

**Task 2 fix round 2 (coordinator review of fix round 1) — one Critical, one Important, one
amendment to the coordinator's own Ruling 5.**

**Critical, no new case (the existing 11.160/13.430 tab-role/class assertions and 13.431/13.432's
own name assertions already cover the corrected markup — the defect was purely structural
placement, not a missing behaviour).** `.gn-project__header` had been holding the breadcrumb, the
`<h1>` AND `createRegion` as three children of one `flex; align-items: center; flex-wrap: wrap`
row — the 34px/700 title sat vertically centred beside the 13px breadcrumb and the New-ticket
button. The metrics table's separate "Breadcrumb 13/18" / "Title 34/41" / "Header row top margin
24px" entries describe three STACKED children of `.gn-project`'s own column, not one line, and
Tasks 4/5/8 would each have landed their own control on that same crowded line. Restructured:
breadcrumb and `<h1>` are now direct children of `.gn-project`, spaced by its 14px `gap`;
`.gn-project__header` holds only `createRegion` and keeps its own `margin-top: 1.5rem`. The ARIA
fix (`createRegion` out of `role="tablist"`) is unchanged.

**Ruling 8 (amending Ruling 5) — `.gn-project` drops its bottom padding too.** Round 1 kept it,
reasoning `.gn-shell`'s bottom padding didn't "double as this row's tighter one" — wrong: `.gn-shell`
already supplies 48px bottom, so the kept 24px stacked to 72px against the prototype's 24px alone,
the same additive defect Ruling 5 removed on the horizontal axis. `.gn-workspaces`, round 1's own
cited precedent, adds no bottom padding either. `.gn-project` now sets no `padding` property at
all; the residual gap (20px-vs-32px sides, 48px-vs-24px bottom) is recorded in the rule's own
comment on both axes, not closed — closing either moves `.gn-shell` for every route.

**Important — 13.432 was order-dependent.** `project-page-chrome.test.tsx` never cleared
`useWorkspaceName`'s module-scoped `nameCache`, which 13.431 (run first) populates for `WORKSPACE`.
13.432's assertions were still correct — they would have caught a real `?? id` regression — but its
*initial* render painted the stale cached name rather than starting cold, so the case was not
exercising the state its own description names when run after 13.431, and could have walked a
different path standalone or under `--shuffle`. Fixed the way `app-nav.test.tsx` already does for
the identical cache: `clearWorkspaceNameCache()` in `beforeEach`. **Confirmed by running 13.432
alone** (`vitest run -t 13.432`), the check that actually proves the order-dependence is gone
rather than merely re-passing the full file in its usual order.

Neither case ID changes: 13.431 and 13.432 still name the same two behaviours, now proven true
independent of run order and with the DOM shape the metrics table actually describes.

## Task 3 — the board's own filter vocabulary (board-prototype-port plan, 2026-09-16)

**Block `13.433`–`13.434` minted here; the next free BLOCK is `13.435`.** The plan's draft proposed
synthesizing a `TicketState` from a `BoardCard` so the board could reuse `matchesFilter` directly;
rejected before being built, because `matchesFilter` fails CLOSED on every axis a card cannot supply
(`collaboratorIds`, `dueBefore`/`dueAfter`, any `fields` clause) and a synthesized state would EMPTY
the board rather than narrow it. `BoardFilterSpec` is `Pick<FilterSpec, …>` over the six axes a board
can answer; the four it cannot are unrepresentable, a compile error rather than a wrong answer on
screen. Two cases, and neither substitutes for the other: agreement proves the shared axes decide
alike, the compile-time case proves the narrowing is real rather than merely documented.

- **13.433** ✅ `matchesBoardCard` and `matchesFilter` decide identically on all six shared axes
  (assignee, type, state, state category, project, text — matching and non-matching, plus the empty
  spec) over a `BoardCard`/`BoardColumn` pair and the equivalent `TicketState`. A dedicated control
  asserts the corpus contains at least one rejection, so the agreement is not vacuously true of two
  predicates that both always answer `true`. — (`packages/app-core/test/filter/board-filter.test.ts`)
- **13.434** ✅ `collaboratorIds` and `dueBefore` are rejected on a `BoardFilterSpec` literal at
  COMPILE TIME (`@ts-expect-error`), not merely absent from a runtime check — witnessed by temporarily
  widening `BoardFilterSpec` from the `Pick` to bare `FilterSpec` and confirming `tsc` then reports
  both directives as unused (`TS2578`), proving the narrowing is what rejects the two axes rather than
  a typo the compiler happened not to catch. — (`packages/app-core/test/filter/board-filter.test.ts`)

## Task 4 — the board's search box, count, chip, and scope note (board-prototype-port plan, 2026-09-16)

**Block `13.435`–`13.444` minted here; the next free BLOCK is `13.445`.** `matchesBoardCard` (Task 3)
had no caller. This task adds one: a page-level search box narrows the board through it, an
`N of M shown` count and a removable chip are derived from the SAME pass that narrows the render
(coordinator Ruling 1 — never a second count), and a scope note names the axes a `BoardFilterSpec`
cannot answer. `13.436` replaces the brief's own Step 5 second test, which asked for a case the
architecture cannot produce — `getBoard(projectId: string)` (`data-source.ts:134`) takes no filter
argument, so the board's own total is never narrowed by the server-side "Only tickets in progress"
toggle, and the brief's literal assertion ("a bare `M` would claim the project holds more than it
does") is false of the board's `M` specifically. The real, reachable version of that hazard — `M`
accidentally sourced from the LIST's own (narrower) row count instead of the board's — is what
`13.436` actually witnesses; its FIRST version used a zero-row list fixture, which could not
distinguish a correct count from a wrong one (any wrong `M` would have failed the single assertion
just as the real bug would), so it was rewritten (fix round 1) to a nonzero, unequal list fixture
plus a negative assertion naming the exact wrong string a `list.rows`-sourced bug would print.
**Fix round 1 (coordinator Ruling 10 and concern 4)** adds `13.439`–`13.441`: the search box sits on
every tab but narrows only the board, which is the identical asymmetry the spec's own search ruling
exists to avoid, just approached from the other direction (a WIRE search would narrow the list and
leave the board unnarrowed; this client search narrows the board and leaves the other three
unnarrowed with no visible sign of it) — `13.439` is the mirror note that names the limit, only
while a search term is actually present. `describeUnappliedBoardAxes` (the board's own scope-note
logic) was extracted to a pure function (`apps/web/src/board-search-scope.ts`) specifically so it
could be unit-tested directly rather than shipping with zero executions until Task 5's Filters sheet
became its first real caller — `13.440`/`13.441` are that unit test. **Review fix round (Important
finding) adds `13.442`–`13.444`.** The disclosure gate (`page.tsx`) enumerated a DIFFERENT axis set
than the narrowing did: `activeFilterChips` covered only `text`, `boardUnappliedAxes` covered only
the four board-blind axes, but the `boardFilter` object handed to `matchesBoardCard` carries SIX
(`text`, `assigneeIds`, `typeIds`, `stateIds`, `stateCategories`, `projectIds`) — so five of those
six could narrow the rendered cards while tripping neither term, closing the whole disclosure strip
(count included) on cards that had, in fact, been dropped. Unreachable today (only `text` has a UI
control), but reachable the instant Task 5's Filters sheet or Task 8's workflow picker writes any
other axis onto the same state. **Two independent remedies, both required:** (1) the chip list is
now built by reading `boardFilter` itself (`buildBoardFilterChips`, `13.442`) — one enumeration,
not two hand-kept in sync; (2) the gate gained a THIRD, independent term,
`boardNarrowing.shown !== boardNarrowing.total` (`shouldRenderBoardNarrowingStrip`, `13.443`) —
because Task 8's workflow picker narrows by dropping whole GROUPS, never by setting a filter axis,
so no enumeration of axes, however complete, could ever notice it; only a fact about the actual
render (fewer cards shown than exist) can. `13.443` tests the gate expression directly rather than
through a page render, since the state remedy 2 exists for cannot be constructed from this page's
current inputs. `13.444` is the review's Minor: Ruling 10's mirror note gained a Calendar-tab arm
alongside its existing List/Timeline coverage.

- **13.435** ✅ Typing into the board's search box narrows the rendered grid AND reads an honest
  `N of M shown`: two of three fixture cards leave the DOM, the remaining one stays, and the count
  names both numbers correctly. — (`apps/web/test/board-narrowing.test.tsx`)
- **13.436** ✅ The count is read from `board.data`, never from `list.rows.length` — a board fixture
  of three cards against a list fixture of TWO rows (nonzero, and different from three so a
  `list.rows`-sourced bug prints a plausible wrong number rather than an obviously broken one), with
  the "Only tickets in progress" toggle on, still reads the board's own total (three) once the
  search box narrows it to one — and does NOT read "1 of 2 shown", the exact string a
  `list.rows`-sourced `M` would produce. Mutation-verified: temporarily sourcing `M` from
  `list.rows.length` was confirmed to fail this case with exactly that string before the fix
  landed. — (`apps/web/test/board-narrowing.test.tsx`)
- **13.437** ✅ The chip and the count move together: removing the one active filter chip clears the
  search box, restores every card, AND removes the count with it — no stale "M of M" survives an
  empty filter, because the strip they share is one conditional block, not two independently gated
  elements. — (`apps/web/test/board-narrowing.test.tsx`)
- **13.438** ✅ The `.gn-project__narrowing` strip does not render at all while no filter is active —
  the count is not an unconditional fixture of the board tab. — (`apps/web/test/board-narrowing.test.tsx`)
- **13.439** ✅ The List and Timeline tabs show no "search doesn't apply here" note until a search
  term actually exists, name the limit once one is typed, and drop the note again once it is
  cleared; the Board tab — where the search DOES apply — never shows the note at all, even with a
  term present and cards visibly narrowed. — (`apps/web/test/board-narrowing.test.tsx`)
- **13.440** ✅ `describeUnappliedBoardAxes` (unit, no page mount): an empty filter, an EMPTY
  `collaboratorIds`/`fields` (which must not narrow), and each of `collaboratorIds`/`dueBefore`/
  `dueAfter`/`fields` set individually — including `dueBefore` and `dueAfter` set TOGETHER, which
  names "due date" exactly once, not twice. — (`apps/web/test/board-search-scope.test.ts`)
- **13.441** ✅ `describeUnappliedBoardAxes` names all three unapplied axes together in a FIXED
  order (collaborator, due date, custom field) regardless of the order the caller supplied them on
  the `FilterSpec` object, and never names a `BoardFilterSpec`-representable axis (`text`,
  `assigneeIds`) as unapplied. — (`apps/web/test/board-search-scope.test.ts`)
- **13.442** ✅ `buildBoardFilterChips` (review, Important finding, remedy 1): emits a labelled,
  removable chip for EACH of the six `BoardFilterSpec` axes when set (not only `text`), resolves an
  id through the supplied name resolver and falls back to the raw id when the resolver has none,
  ignores an empty list axis, and each chip's `onRemove` clears exactly its own axis and no
  other. — (`apps/web/test/board-search-scope.test.ts`)
- **13.443** ✅ `shouldRenderBoardNarrowingStrip` (review, Important finding, remedy 2): false with
  nothing active and nothing hidden; true on a chip alone; true on an unapplied axis alone; true on
  ALL three together; and — the case that would fail without remedy 2 — true when `shown !== total`
  with NEITHER a chip NOR an unapplied axis, the exact state a group-dropping narrowing mechanism
  (no filter axis set) produces. Tests the gate expression directly rather than through a page
  render, per the coordinator's own instruction, since that state cannot be constructed from this
  page's current inputs (nothing here drops a group without going through a filter axis
  first). — (`apps/web/test/board-search-scope.test.ts`)
- **13.444** ✅ The review's Minor: Ruling 10's mirror note (`13.439`) is exercised on the Calendar
  tab too, not only List and Timeline — the gate is one uniform `view !== 'board'` check, so
  divergence was unlikely, but untested. — (`apps/web/test/board-narrowing.test.tsx`)

## Task 5 — the Filters sheet (board-prototype-port plan, 2026-09-16)

**Block `13.445`–`13.462` minted here.** The Filters button Task 4
deliberately left unrendered ("An inert Filters button is a button that lies... I chose do not render
it yet") gets its sheet: a `role="dialog"` side panel writing straight through to the SAME
page-level `filter` state the search box and the removable chips already share — no draft copy, no
"Apply" button. Five of `BoardFilterSpec`'s six axes get a control (`text` already had the search
box): Assignee and Collaborators as "person row" checkbox lists, Type and State as "category chip"
multi-selects, and Category over the three fixed `stateCategories` values. `projectIds` gets none —
this page is already scoped to the one project it shows, and Task 4's own report found no natural
label source for it here. `dueBefore`/`dueAfter`/`fields` get no control either: the design spec's
own Filters-sheet metrics name exactly two control shapes ("person row", "category chip"), and this
task's brief curates those same two into its metrics line while dropping the spec's "Toggle" row
entirely — the discriminating fact that no boolean/date control was meant to land here. Both remain
unsettable anywhere in the product after this task, a named gap for whoever builds their control
next, not a surprise.

`13.451` is the test Task 4's own brief deferred to this commit by name: "names the axes the board
could not evaluate, beside the count and not inside it... helper added in Task 5... do not stub the
helper." `openFiltersAndPickCollaborator` in `filters-sheet.test.tsx` is that helper, doing the real
thing — open the sheet through the Filters button, click a real checkbox — rather than reaching into
`setFilter` directly. Because `collaboratorIds` is one of the four axes `matchesBoardCard` cannot
evaluate at all, this is `describeUnappliedBoardAxes`'s (Task 4) first execution through the rendered
page rather than through its own unit test; it ran clean on the first try.

The scope note's trailing clause — "— set on the list tab, where a ticket carries the field", written
before this sheet existed — is REMOVED, not re-pointed at the Filters sheet. `boardUnappliedAxes` can
join up to three axis names in one sentence, and after this task only ONE of the three
(`collaborator`) has a control anywhere in the product; `dueBefore`/`dueAfter`/`fields` remain
unsettable anywhere. A single trailing clause cannot name a different true location per axis in a
joined list, and "set in the Filters sheet" would be right for collaborator today and silently wrong
for the other two the moment either gains a control elsewhere — the exact "names the wrong place"
failure the task's own brief warned against. `13.456` guards the deletion.

The dialog's focus contract is mutation-verified in both directions, not merely asserted once:
`account-menu.tsx`'s own docblock warns that "Escape returns focus to the trigger" is vacuously true
if focus never left it in the first place. `13.445` asserts focus DID leave the trigger on open
(`document.activeElement` inside the panel, not on the button) — confirmed load-bearing by temporarily
deleting the focus-on-open effect and watching that exact assertion fail. `13.446` asserts Escape
returns focus to the trigger — confirmed load-bearing the same way, by temporarily deleting the
focus-return line and watching that assertion fail with the trigger untouched. Both mutations were
reverted with a targeted edit (not `git checkout`), confirmed clean by re-running the full suite.

- **13.445** ✅ The Filters button opens a `role="dialog"` panel with `aria-modal="true"`, labelled by
  its own `<h2>Filters</h2>` via `aria-labelledby`, and focus moves off the trigger and into the panel
  on open. Mutation-verified: deleting the focus-on-open effect fails this exact
  assertion. — (`apps/web/test/filters-sheet.test.tsx`)
- **13.446** ✅ Escape closes the sheet and returns focus to the exact Filters button that opened it.
  Mutation-verified: deleting the focus-return line fails this exact
  assertion. — (`apps/web/test/filters-sheet.test.tsx`)
- **13.447** ✅ Checking a person row in the Assignee section narrows the board, shows the
  `assigneeIds` chip naming them, and the count reflects the real removal. — (`apps/web/test/filters-sheet.test.tsx`)
- **13.448** ✅ Pressing a Type chip (`aria-pressed` toggles true) narrows the board, shows the
  `typeIds` chip, and the count reflects the real removal. — (`apps/web/test/filters-sheet.test.tsx`)
- **13.449** ✅ Pressing a State chip discloses via the `stateIds` chip even when it removes no card
  (every fixture card shares the one state) — the narrowing strip's three-term gate opens on a chip
  existing, independent of whether it removed anything. — (`apps/web/test/filters-sheet.test.tsx`)
- **13.450** ✅ Pressing a Category chip narrows the board to zero cards and shows the
  `stateCategories` chip — the empty-columns-not-vanished-board rule (`board.tsx:216-219`) holds at the
  limit. — (`apps/web/test/filters-sheet.test.tsx`)
- **13.451** ✅ THE DEFERRED TASK 4 TEST. Picking a Collaborator through the real
  `openFiltersAndPickCollaborator` helper does not narrow the board (the count stays `M of M`) but
  the scope note names "collaborator" as not applied on the board — the count reports cards the board
  filtered, the note reports an axis it never ran, and they stay
  separate. — (`apps/web/test/filters-sheet.test.tsx`)
- **13.452** ✅ "Clear all" resets the sheet's own five axes (proven on Assignee) without closing the
  sheet — a distinct action from "Done". — (`apps/web/test/filters-sheet.test.tsx`)
- **13.453** ✅ Absence, not an invented empty list: while the roster has not been read
  (`getMembers` never resolving), the Assignee section states so and renders no checkboxes at
  all. — (`apps/web/test/filters-sheet.test.tsx`)
- **13.454** ✅ A FAILED ticket-types read renders a refusal sentence in the Type section, never
  falling back to the built-in ladder — the built-in fallback is for a read still PENDING, never one
  that has REFUSED. — (`apps/web/test/filters-sheet.test.tsx`)
- **13.455** ✅ While the board has not been read, the State section states so rather than rendering
  zero chips (which would claim the board legitimately has no states). — (`apps/web/test/filters-sheet.test.tsx`)
- **13.456** ✅ The scope note's copy no longer names "the list tab" — the location clause removed
  because it names the wrong place for two of the three axes it can
  join. — (`apps/web/test/filters-sheet.test.tsx`)

**Task 5 fix round 1, same session — `advisor()` review before reporting done.** One real, blocking
gap: `13.453`/`13.455` proved the PENDING sentence for Assignee/Collaborators/State, but those two
sections collapsed PENDING and REFUSED into one `members === null` / `!boardLoaded` check — the Type
section already distinguished `typesError`/`typesPending` for the identical reason, and this was the
same wrong-cause failure `page.tsx`'s own `useSessionStatus` docblock was written about, one component
over: a real roster/board refusal would have printed "has not loaded yet" instead of naming the
refusal. Fixed by threading `members.error`/`board.error` (`useLiveQuery`'s own error channel) into
`FiltersSheet` as `membersError`/`boardError`, checked ahead of the pending branch in both sections —
`13.457`/`13.458` prove BOTH halves: the refusal sentence appears, AND the pending sentence does not.
Also fixed in the same round: `.gn-filters__scrim` had no `z-index`, so it would have painted BELOW
`TicketSheet`'s `.gn-sheet__scrim` (`z-index: 40`) were both ever open at once — invisible to every
test in this file, since jsdom computes no paint order at all. Matched the house scrims' own `40`
rather than inventing a second stacking scale; no case can exercise this (jsdom's blindness to paint
order is exactly the reason it was missed the first time), so it is recorded here as reasoned from the
CSS rather than proven by a test.

- **13.457** ✅ A FAILED roster read renders the refusal sentence in Assignee, and NOT the "has not
  loaded yet" pending sentence — the two are checked as mutually exclusive facts, not merely the
  refusal's presence alone. — (`apps/web/test/filters-sheet.test.tsx`)
- **13.458** ✅ A FAILED board read renders the refusal sentence in State, and NOT the "has not loaded
  yet" pending sentence, for the identical reason. — (`apps/web/test/filters-sheet.test.tsx`)

**Ruling 12 (coordinator remediation, same session) — "Clear all" was not true.** `clearAll` cleared
the sheet's own five axes and deliberately left `text` alone, on the reasoning that the search box is
Task 4's control, living outside this sheet — a correct fact about ownership and a wrong answer about
what the button ON SCREEN promises. A person who types a search term, opens Filters, and clicks a
button labelled "Clear all" would have watched the text chip survive: an accurate docblock above an
inaccurate control is still a lie to whoever is looking at the control. **Fix: `clearAll` now clears
all SIX `BoardFilterSpec` axes the narrowing strip's chips can represent — `text` included** — keeping
`activeFilterChips` as the one disclosure surface the button's label actually promises. Checked, not
assumed, before writing the fix: the search `<input>` (`ProjectBoard`'s own JSX) is
`value={filter.text ?? ''}`, a CONTROLLED component with no local state, so clearing `filter.text` was
sufficient on its own — no separate desync between the box and the filter to fix.

- **13.459** ✅ "Clear all" removes the text chip AND empties the search box — the two are asserted as
  separate failure modes (the disclosure surface lying vs. the control itself holding stale text),
  confirming the fix covers both rather than only the chip the earlier version already
  handled. — (`apps/web/test/filters-sheet.test.tsx`)

**Ruling 13 (coordinator remediation, same session) — Ruling 12's own fix cleared the WRONG six.** The
reviewer checked `clearAll` axis-by-axis against `BoardFilterSpec` rather than accepting Ruling 12's
"clears all six" claim, and found a DIFFERENT six than the docblock and both commit messages named:
`collaboratorIds` **included** (not a `BoardFilterSpec` axis — produces no chip via
`buildBoardFilterChips`, only a scope-note entry) while `projectIds` **omitted** (one of the six, WITH
a working chip). Wrong in both directions at once, and harmless only because nothing on this page sets
`filter.projectIds` yet — precisely why it needed fixing now: the first future control that writes
`projectIds` would have found "Clear all" silently failing to clear it, with nothing pointing back at
this function. **Fix:** the exact axis set — `FILTERS_SHEET_CLEARABLE_AXES`, exported once from
`page.tsx` — is now the SINGLE source both `clearAll` (via the extracted `clearFilterAxes`) and this
test file read, rather than two independently hand-typed literals, which is the mechanism that produced
the wrong six twice. `13.460`'s first case pins the array's own content; its second case is a UNIT test
against `clearFilterAxes` directly (no UI control exists for `projectIds`, so no end-to-end case is
possible) with every field asserted by NAME rather than by looping over the array under test — the
first draft of this case looped over `FILTERS_SHEET_CLEARABLE_AXES` to decide what to check, which
passed vacuously when `projectIds` was mutated out of the array (the check shrank along with the
implementation). Mutation-verified both ways: temporarily removing `projectIds` from the array failed
BOTH of `13.460`'s cases at exactly that field, and the revert was confirmed clean via
`grep -n MUTATION page.tsx` (zero matches) before the final suite run.

**MINOR (same review) — "Done" and the scrim click were wired but untested.** Both close paths route
through the same `onClose`/`closeFilters` `13.446` already mutation-proves for Escape, so the risk was
low, but neither had a passing assertion, and `filters-scrim`'s own testid was referenced by no test at
all. `13.461`/`13.462` close that gap directly.

- **13.460** ✅ `FILTERS_SHEET_CLEARABLE_AXES` names exactly the six `BoardFilterSpec` fields plus
  `collaboratorIds` (order-independent set comparison), and `clearFilterAxes` clears every one of those
  seven fields BY NAME on a `FilterSpec` carrying `projectIds` — the axis Ruling 13 found silently
  omitted, settable by no control on this page — while leaving an eighth axis outside the clearable set
  (`dueBefore`) untouched as a negative control. — (`apps/web/test/filters-sheet.test.tsx`)
- **13.461** ✅ Clicking "Done" closes the sheet and returns focus to the Filters button, the same as
  Escape. — (`apps/web/test/filters-sheet.test.tsx`)
- **13.462** ✅ Clicking the scrim (outside the panel) closes the
  sheet. — (`apps/web/test/filters-sheet.test.tsx`)

## Task 6 — columns as trays, cards, and the blocked-column indicator (board-prototype-port plan, 2026-09-16)

**Case `13.463` minted here.** Geometry only, per the task's own brief: the column rail
(`.gn-board__columns` renamed `.gn-board__rail`, spec Board `:354-399`'s "Column rail" row), the
column tray itself (`.gn-board__column` — sunken surface, sunken shadow, card radius, 18rem lane,
its own flex column layout), the count (`.gn-board__count`'s body updated to the spec's 13px/18px,
selector kept for `board.test.tsx:142`), and the card (`.gn-board-card`, 14px padding via
`.gn-card.gn-board-card`'s source-order win over the untouched `.gn-card`, never a specificity win —
both are `(0,1,0)`). One real behaviour change, not merely restyling: `.gn-board-card--pending`'s
dashed in-transit outline had a rule but no wiring — `board.tsx:719` never added the modifier class —
so it is wired onto `card.pending`, the same flag the existing "claim in transit" chip already reads.
**The blocked-column indicator needed no CSS work, confirmed rather than assumed**: `board.tsx:409`
already renders `<Chip tone={column.blocked ? 'blocked' : column.category}>`, and `.gn-chip--blocked
.gn-chip__dot` (`ui.css:155`) already carries the tone as a coloured dot against a readable
`--gn-text` label — the tinted-ground-plus-same-hue-text version the prototype and an earlier draft of
this task's own brief called for was measured (twice, independently) at 3.229–4.291 against the 4.5:1
WCAG floor in all six style×theme combinations and does not ship (spec, "Both tints were measured and
NEITHER can ship"). A second, unrelated finding surfaced while confirming that: `.gn-board__column--
blocked`'s `border-color: var(--gn-blocked)` had been inert since before this task — nothing on
`.gn-board__column` declared a `border-style`, so the colour painted nothing, and `board.test.tsx`'s
"marks a blocked state visibly" case asserts only that the class string is present, never a computed
style, so it could not have caught it.

**Coordinator rulings 14–16, same day, closing all three open items from this task's first pass.**
**Ruling 14** strikes the brief's own `.gn-board__column-title` metric (17px/22px, 600) the same way
Task 1 was struck: it has no attachment point under the header markup Tasks 3–5 already shipped
(`Chip` takes no `className`, and the header renders the column name AS the chip's own child text),
and a split into a separate title plus a standalone blocked chip was considered and rejected — that
chip's tone carries CATEGORY for every column, not only blocked, so separating them would change what
the colour means across the whole board, a semantic change outside this task's scope. **Ruling 15**
removes the spec's own `cursor: grab` from `.gn-board-card` — shipped in the first pass with no drag
behaviour behind it, the same "a control that lies" shape Task 4's own brief withheld the inert
Filters button for; it moves to Task 14's commit, beside the behaviour it promises. **Ruling 16**
removes the inert `.gn-board__column--blocked` border declaration found above — the sixth time this
session hit the "declares a visual effect that never paints" shape the dead `.gn-view-tabs` rules were
(Task 4); the class itself is untouched, still applied conditionally and still asserted by
`board.test.tsx:56-61`, only the misleading declaration is gone. Confirmed to change no rendered
pixel: nothing else in the cascade sets `border`/`border-style` on that selector either, before or
after.

**Coordinator ruling 17, code review — the padding fix's own reasoning was not applied to the
neighbouring property in the same rule.** `.gn-board-card`'s literal `border-radius: 0.75rem` (12px)
carried the SAME `(0,1,0)` specificity as `.gn-card`'s own token-driven radius and sat later in the
file, so it won on source order for every style — pinning every board card at 12px where `neo` should
draw `.gn-card`'s `--gn-radius-card` at 20px (`tokens.ts:798-801`). This is the exact defect case
13.355 already fixed one surface over (`.gn-card.gn-invite`'s literal radius tying `.gn-card`'s
token); the padding line two properties over got the "does this compete with `.gn-card`'s own token"
scrutiny (verified 12px stays the product default, only the board card takes 14px), and the radius
line, transcribed from the brief's own CSS block, did not. **Removed, not replaced with a token —
minting a `.gn-board-card`-specific radius role to preserve the prototype's flatter 12px corner was
considered and rejected, the same precedent 13.355 already set: a new token role to reproduce one
decoration.** The board card now falls through to `.gn-card`'s own radius and moves with the style
axis like every other card; the prototype's genuine 12px-vs-16px distinction is given up, honestly,
not silently.

- **13.463** ✅ `BoardCardView` outlines the card container itself (`.gn-board-card--pending`) while
  `card.pending` is true and not otherwise — proven in both directions on the same render/rerender
  pair the neighbouring "claim in transit" chip test already uses, and mutation-checked: a
  never-wired constant class fails the positive assertion, an always-wired one fails the negative. —
  (`packages/app-core/test/views/board.test.tsx`)
- **13.464** ✅ `.gn-board-card` declares no `border-radius` of its own (mirroring case 13.355's own
  source-scan shape, `neo-card-radius.test.ts`) — the rule still exists and still carries its 14px
  padding, only the radius literal is asserted absent, so the board card falls through to `.gn-card`'s
  token-driven radius rather than pinning 12px under every style. Mutation-witnessed: a planted literal
  `border-radius` on the rule is caught by the same test. — (`packages/ui/test/components.test.tsx`)

## Task 7 — the per-column empty state and Ruling R6 (board-prototype-port plan, 2026-09-16)

**Cases `13.465`–`13.466` minted here**, continuing directly from `13.464` (verified against the real
case list via `node scripts/check-case-ids.mjs`, not the file's own "next free" prose, per this task's
own brief). `board.tsx:70` (pre-R6; that line is unrelated comment prose today, the gate it names having
been superseded by this very ruling) — its whole-board sentence (`EMPTY_BOARD_COPY`) was gated on
`board.groups.length === 0` — a project with a workflow attached and zero tickets in it took
`groups.length === 1`, skipped the sentence, and drew a silent rail of empty column trays, one layer
under the exact "loaded, refused nothing, said nothing" failure that branch was first written to catch.
**Ruling R6** (owner, spec review pass, "go with your recommendation" — the one ruling in this port that
went the recommended way rather than the owner's own free-text alternative) widens the gate to
`board.tsx`'s new `totalCards` fold: the sentence renders whenever the board holds zero cards in TOTAL,
not only when it holds zero GROUPS. `groups.length === 0` implies `totalCards === 0`, so this is a strict
**superset** — the pre-existing `EMPTY_BOARD_COPY` assertions (3.112, 3.113, and 3.114's CONTROL
sub-case) pass UNMODIFIED, run and confirmed rather than assumed (`packages/app-core` suite, 1224/1224
green, Node v22.23.2). One pre-existing test's own assertion contradicted the new behaviour by
construction rather than by defect — **3.114's second `it`**
(`test-cases/03-foundation-ledger.md:100`, "a group whose columns are all empty is NOT an empty board")
used a single-group, single-empty-column fixture and asserted `EMPTY_BOARD_COPY` absent; that fixture IS
the R6 case in miniature, so its assertion was now the opposite of correct and is AMENDED, not left
standing — see its own updated comment in `board.test.tsx` for the before/after. The rail's own presence
claim in that test (`getByRole('region', ...)`) is untouched and still passes.

**The witness (Step 6 of this task's own brief).** Reverted `emptyBanner`'s gate from `totalCards === 0`
back to the old `board.groups.length === 0` (a one-line, targeted `Edit`, never `git checkout --`, and
only after the real work below was committed) and re-ran `test/views/board.test.tsx`: **exactly two
tests reddened** — `13.466` (below) and the amended 3.114 test, both of which depend on the widened
gate by construction — while every other test, INCLUDING the three pre-existing `EMPTY_BOARD_COPY`
assertions, stayed green. Restored immediately after, confirmed clean, no second commit needed since the
mutation was never committed. Two reddening rather than the brief's literal "the new test alone" is the
correct count here: the brief's wording assumed only one new test would exist, and this task additionally
corrects a second, pre-existing test whose own assertion the ruling falsifies — both are R6-dependent by
the same construction, so both flip together.

**The per-column empty state** (spec Board `:354-399`, "Empty column"/"Empty icon"/"Empty copy"/"Empty
action" rows; markup verified against `design-system/interactive/desktop.dc.html:387-394`, the ONLY
place in the repo giving the icon itself — a plain "+" glyph, `stroke="currentColor"`, `aria-hidden`) is
a DIFFERENT granularity from R6's sentence and both may render together: `.gn-board__column-empty`
(fill4 → `--gn-fill-quaternary`, radius → the TOKEN `--gn-radius-card` rather than the prototype's
literal 12px — a new card-like rule takes the token, the same rule case 13.464 just above already
established for `.gn-board-card`'s own radius), a 34px `.gn-board__column-empty-icon` circle replicating
`.gn-chip`'s own three-branch chipBg/chipShadow treatment on a new selector (never editing the shared,
do-not-edit `.gn-chip`), and `EMPTY_COLUMN_COPY` — a new exported constant, deliberately NOT a
re-spelling of `EMPTY_BOARD_COPY` (`"No tickets in this column yet."` against `"No tickets here
yet — create one."`), because both can render on the same screen under R6 and a `getByText` query on
either must still resolve to exactly one element. The action button reuses `@gisik-nokma/ui`'s `Button`
component UNCHANGED (`.gn-button`, ghost variant) rather than inventing a `ctlBg`/`ctlShadow` CSS
treatment: `ui.css:22-30`'s own docblock already records the prototype's raised neo control shadow as an
OPEN DECISION deliberately left to the repo owner, and this port's own plan settles it for every board
control — "Board controls use `.gn-button` unchanged"
(`docs/superpowers/plans/2026-09-16-board-prototype-port.md:57`) — so this task does not reopen it.
Labelled "Add a ticket" rather than repeating the whole-board button's "Create a ticket": both reuse the
SAME unscoped `onCreateTicket` handler (`BoardProps` carries no per-column target, and adding one is
outside this task), so identical wording on every button rendered when a board is both globally and
per-column empty (R6) would be indistinguishable by accessible role and name alike; the different wording
does not claim the created ticket lands in that specific column.

**The filtered-to-zero column, considered and decided against a second copy.** `BoardColumn`
(`view-types.ts:119-125`) carries `stateId`/`name`/`category`/`blocked`/`cards` and nothing else — no
signal distinguishing a column that genuinely holds no tickets from one the client-side board filter
(`filter/board-filter.ts`, Task 3) narrowed to zero. The narrowing pass that WOULD know the difference
runs above `Board`, in the shell computing `boardNarrowing`, and it already discloses an active filter
through the `N of M shown` count and its removable chips (spec, "The count must not lie"). Writing a
second, column-scoped disclosure here — with data this component was never given — would risk an
unsynchronised second copy of the same fact, so `EMPTY_COLUMN_COPY` says only what is true in both cases,
the same discipline `EMPTY_BOARD_COPY`'s own docblock already holds itself to. No new prop, no new field
on `BoardColumn`, and no second sentence were added; this is a decision, not an oversight, and it is
recorded here rather than only in the component's own comment.

- **13.465** ✅ The per-column empty state: an empty column renders `EMPTY_COLUMN_COPY` and its icon; a
  column holding a card does not (`errandBoard()`'s three empty columns vs. `Doing`, scoped with
  `within` so a false positive from an unscoped `getByText` cannot pass). Both arms of the optional
  "Add a ticket" action are tested — present and wired to `onCreateTicket` when the shell hands one down,
  absent (words only) when it does not — the same both-arms discipline `emptyBanner`'s own docblock
  already holds itself to. — (`packages/app-core/test/views/board.test.tsx`)
- **13.466** ✅ RULING R6 ITSELF: one group, every column empty — `EMPTY_BOARD_COPY` renders AND both
  columns' names render, proving the rail survives beside the sentence. This is the case no existing
  assertion could witness before this task, and the witness above (revert to `groups.length === 0`,
  re-run) proves it: this case and the amended 3.114 test are the only two that redden. —
  (`packages/app-core/test/views/board.test.tsx`)

## Task 7 fix round — Ruling 19: the R6 sentence must be gated on the board BEFORE narrowing (found in review, 2026-09-16)

**Case `13.467` minted here**, continuing directly from `13.466`. A cross-task interaction neither Task 4
(client-side board narrowing) nor this task's own R6 caught on its own: `page.tsx:1063` hands `<Board>`
`boardNarrowing.view`, the POST-FILTER groups, never `board.data` directly (Ruling 1, Task 4). Task 4's
narrowing drops CARDS only — never a column or a group (`board.tsx:216-219`'s own invariant) — so pre-R6
this was harmless: the old gate read `board.groups.length`, which a card filter never touches, so the
narrowed-to-zero state could never reach it. R6's `totalCards` fold reads exactly the narrowed cards,
so without a fix a search matching nothing rendered `EMPTY_BOARD_COPY` — "No tickets here yet — create
one." — over a project holding real tickets, one row beneath a strip reading "0 of 10 shown" with a
removable chip: the page contradicting itself on one screen, and "create one" naming the wrong remedy
(the fix is clearing the filter sitting right there, not creating a ticket).

**Fix: `Board` gains an optional `isNarrowed?: boolean` prop** (`BoardProps`, following `onCreateTicket`'s
own precedent immediately above it — a mount with nothing to say passes nothing, and `Board` behaves
exactly as before this prop existed). `emptyBanner`'s gate becomes `totalCards === 0 && isNarrowed !==
true`. `page.tsx` passes `isNarrowed={boardNarrowing.shown !== boardNarrowing.total}` — the SAME
expression `shouldRenderBoardNarrowingStrip` already reads as one of its three terms, not a second
definition of "narrowed"; since narrowing drops cards only, `shown !== total` is true exactly when real
cards exist but were filtered away, and by construction `shown === total === 0` whenever the board is
genuinely, unfilteredly empty — so the flag never suppresses R6's real case. `EMPTY_BOARD_COPY`'s text is
unchanged; this changes WHEN it shows, never what it says.

**Deliberately NOT changed, per the ruling itself**: the per-column `EMPTY_COLUMN_COPY` shown under a
filter, where the column may hold hidden tickets. The reviewer judged that copy neutral (it names no
reason, per its own docblock) and approved it deliberately in Task 7's review; not overruled mid-task,
recorded for final review instead.

**Witness, same discipline as R6's own**: committed the real work first, then reverted `emptyBanner`'s
condition from `totalCards === 0 && isNarrowed !== true` back to `totalCards === 0` alone (a targeted
`Edit`, never `git checkout --`) and re-ran `board.test.tsx`. Confirmed the narrowed-to-zero case (the
first `it` below) reddens while the R6 case (13.466, not narrowed) and the "not narrowed" arms of this
same case stay green — proving `isNarrowed` and only `isNarrowed` discriminates the two. Restored; `git
diff --stat HEAD` empty, full suite green again.

**Standing instruction now in force (coordinator, this round): every report must carry `tsc` output for
every package touched.** `packages/ui`'s typecheck, red since `8eb40607` (Task 6 fix round 2) on two
`noUncheckedIndexedAccess` errors in `test/components.test.tsx`, was fixed in a concurrent commit
(`ddc42c21`, "Task 6 fix round 3") by another implementer on this same branch while this fix round was in
progress — confirmed by re-running `tsc -p tsconfig.typecheck.json` in `packages/ui` twice, both exit 0,
rather than assumed from the earlier report's stash-verified baseline.

- **13.467** ✅ `isNarrowed` suppresses `EMPTY_BOARD_COPY` on a board narrowed to zero cards (the rail and
  per-column empty states still render, `EMPTY_COLUMN_COPY` unaffected — the same fixture proves both:
  `isNarrowed` true suppresses, `isNarrowed` false OR omitted on the IDENTICAL fixture still shows the
  sentence, isolating the flag as the one variable that discriminates. Mutation-witnessed: reverting the
  `&& isNarrowed !== true` guard reddens this case's first `it` while 13.466 and this case's other two
  `it`s stay green. — (`packages/app-core/src/views/board.tsx`, `packages/app-core/test/views/board.test.tsx`,
  `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx`)

## Task 8 — the workflow picker, defaulting to All workflows (Ruling R3, 2026-09-16)

**Cases `13.468`–`13.471` minted here**, continuing directly from `13.467` (verified against the real
case list via `scripts/check-case-ids.mjs`, not the file's own "next free" prose, which the script's own
self-test proves can false-hit on a truncated id — the sweep run before this task started found `13.632`
and `13.999` as apparent hits that were actually a truncation of `13.632866`/`13.9999`, two example ids
inside this file's own prose about the script's regex, three sections up). The picker narrows the board
by dropping a whole GROUP — `matchesBoardCard` (`board-filter.ts`) takes a `card`/`column`/`projectId`
and a `BoardFilterSpec`, with no group anywhere in that signature, so no axis this file's own chip
builder enumerates could ever name this mechanism. `boardNarrowing` (`page.tsx`, Task 4's "ONE PASS"
fold) widens to fold BOTH mechanisms into the SAME `shown`/`total` pair rather than gaining a second,
parallel count: `total` sums every card in every group, including ones the workflow picker drops;
`shown` counts only cards that are both in a KEPT group and pass `matchesBoardCard`.
`shouldRenderBoardNarrowingStrip`'s third term (`shown !== total`, `board-search-scope.ts`) was written
for exactly this case in Task 4's own review — before this task nothing could make it true while
`activeFilterChips` stayed empty, so the wiring was verified by reading the code, not by a test that
reaches it through real narrowing data. `13.470` is that test, and the wiring was
MUTATION-WITNESSED, not merely asserted: the gate's own call was temporarily changed from
`shown: boardNarrowing.shown` to `shown: boardNarrowing.total` (defeating only the third term), `13.470`
and `13.471` reddened while every other case in the file — including `13.468`, which does not depend on
the gate firing — stayed green, and the change was reverted and the suite re-run clean.

The picker's own chip is built separately from `buildBoardFilterChips` (which enumerates `boardFilter`'s
six fields and cannot be extended to a seventh it structurally has no data for) and merged with
`activeFilterChips` ONLY at the render site (`narrowingChips`, `page.tsx`) — the gate's own `chipCount`
argument deliberately keeps reading `activeFilterChips.length` alone, since the third term already covers
group-dropping and double-counting the workflow chip there would not change the gate's answer, only
obscure which term does the work.

**The single-workflow decision (`13.469`).** A project with exactly one workflow offers no real choice
between "All workflows" and that one workflow's name — both render the identical board. The picker is
gated on `board.data.groups.length > 1`, mirroring `Board`'s OWN identical judgment for its group heading
(`board.tsx`: `board.groups.length > 1 ? <h3 className="gn-board__workflow">`). Deliberately reads
`board.data.groups` (the full, unfiltered set), never `boardNarrowing.view.groups` — the latter is
already narrowed BY the picker, so once a workflow is picked it holds only the one surviving group, and
gating against it would unmount the very control that let a person pick it.

**Interaction with Task 7's `isNarrowed` (Ruling 19) — checked, not assumed.** Picking a workflow whose
own group holds zero cards makes `boardNarrowing.shown === 0` while `boardNarrowing.total > 0` (the OTHER
workflow's cards), so `isNarrowed` is `true` and `Board`'s `EMPTY_BOARD_COPY` — "create one" — is
suppressed exactly as it is for a card-level filter that empties the view. The per-column
`EMPTY_COLUMN_COPY` and its own "Add a ticket" button still render (unaffected by `isNarrowed`, per
`Board`'s own docblock), and the narrowing strip reads "0 of N shown" with the removable workflow chip.
Judged CORRECT, matching Ruling 19's own reasoning exactly: the remedy for an empty picked workflow is
the chip sitting in the strip, not a project-wide "create a ticket" prompt naming the wrong fix. Not
separately case-numbered — no new branch exists to test; the SAME `isNarrowed` expression Task 7 already
built and case `13.467` already covers is what fires here, over data this task's own fixtures did not
happen to construct.

- **13.468** ✅ The picker defaults to `'all'`, so every group renders, no card is dropped, and the
  disclosure strip this mechanism shares with the client filter (`13.438`'s own rule) stays absent at the
  resting state. — (`apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx`,
  `apps/web/test/board-narrowing.test.tsx`)
- **13.469** ✅ The picker renders no `<select>` at all for a project with exactly one workflow —
  mirroring `Board`'s own group-heading gate, cross-confirmed by asserting the heading is absent too. —
  (`apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx`, `apps/web/test/board-narrowing.test.tsx`)
- **13.470** ✅ THE DEFERRED TASK 4 TEST, by name: reaches `shouldRenderBoardNarrowingStrip`'s third term
  through real group-dropping data. Picking a workflow narrows the board to that group's own cards, reads
  an honest `N of M shown` against the PROJECT's whole total (not the surviving group's), and shows a
  removable chip naming the hidden workflow — the surviving cards are asserted BY NAME, not only by
  count, and the dropped group's own heading is asserted absent. Mutation-witnessed: hardcoding the
  gate's `shown` argument to equal `total` reddens this case (and `13.471`) while every other case in the
  file stays green. — (`apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx`,
  `apps/web/test/board-narrowing.test.tsx`)
- **13.471** ✅ Removing the workflow chip restores every group, resets the picker to `'all'`, and the
  strip disappears entirely — the same rule `13.438` pins for the card-level filter, proven here for the
  group-level one. — (`apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx`,
  `apps/web/test/board-narrowing.test.tsx`)

## Task 8 fix round — Ruling 20, 2026-09-16

**Cases `13.472`–`13.473` minted here**, continuing directly from `13.471` (verified against
`scripts/check-case-ids.mjs`'s real sweep, not a naive grep — see the false-hit note in the section
above). Two closures the coordinator required after reviewing Task 8's own report.

**Ruling 20(a) — the deferred fixture, taken up on the report's own offer.** The Task 8 report verified
the empty-picked-workflow / `isNarrowed` interaction by COMPOSITION: `isNarrowed={boardNarrowing.shown
!== boardNarrowing.total}` (`page.tsx`) and `Board`'s own gate (`totalCards === 0 && isNarrowed !==
true`, `board.tsx`) are both unchanged by Task 8, and case `13.467` already proves the second half while
`13.470` already proves the picker drives the first. The coordinator's reasoning for still wanting it
run: this session already carries two instances of a path that was reasoned about correctly and still
hid something when it finally executed (the board scope-note JSX shipping unexercised through two tasks;
`rule()`'s `string | undefined` sitting latent in a shared helper until one new call site used the value
as a plain string). "Composition proves the pieces; it does not run them together." `13.472` is that run,
mutation-witnessed: hardcoding `<Board isNarrowed={false}>` (defeating only the suppression) reddens
`13.472` alone — every other case in the file, `13.473` included, stays green.

**Ruling 20(b) — an unresolvable picked workflow falls back to `All`.** The Task 8 report's own second
concern: if the picked workflow's group disappears from `board.data` mid-session (reassigned or detached
elsewhere, page left open), `workflowFilter` keeps naming an id nothing in `board.data.groups` matches
any more. Recoverable (remove the chip), but until then the page would assert a phantom as real — the
chip's own label falls back to `group?.workflowName ?? workflowFilter`, and with no group to find that
prints the RAW INTERNAL ID as if it were a real, chosen narrowing, on a project that may hold tickets
(`boardNarrowing`'s own `total`) the person can no longer see any trace of. Fixed with
`resolvedWorkflowFilter` (`page.tsx`) — a plain, unmemoized `const`, recomputed every render from
`workflowFilter` and the CURRENT `board.data`, falling back to `'all'` when the picked id matches no
group; every consumer that narrows or displays by workflow (`boardNarrowing`'s `keepGroup`,
`workflowChip`, the `<select>`'s own `value`) reads THIS, never raw `workflowFilter`, except the
`<select>`'s `onChange`, which only ever WRITES a value drawn from the current option list and is
therefore always valid when written. `13.473` is the case, exercised through a REAL mid-session update —
`rerender` with a new `Providers services={…}` whose `getBoard` no longer carries the picked workflow,
keeping the SAME `ProjectPage` instance mounted so `workflowFilter`'s own state survives the change; this
is not a simulated shortcut but the same effect-dependency path (`useLiveQuery`'s first effect keys on
`source` identity) a real workspace-stream event drives in production, confirmed by reading
`use-live-query.ts`'s own two effects before relying on it. Mutation-witnessed: collapsing
`resolvedWorkflowFilter` to raw `workflowFilter` reddens `13.473` alone — all thirteen other cases in the
file, `13.472` included, stay green.

`packages/app-core/src/index.ts` also gains `EMPTY_COLUMN_COPY` in its public re-export, alongside
`EMPTY_BOARD_COPY` — `13.472` is the first `apps/web` case that needs it, for the identical reason
`EMPTY_BOARD_COPY`'s own docblock already gives (assert the SAME string that renders, never a re-typed
copy of it).

- **13.472** ✅ Picking a workflow whose own group holds zero cards, on a project whose OTHER workflow
  holds real tickets: `EMPTY_BOARD_COPY` is absent (R19's remedy is the chip, not "create one"), the
  strip reads an honest `0 of 2 shown` against the project's whole total, the removable chip names the
  picked workflow, and the rail still draws both of the picked group's columns with their own
  `EMPTY_COLUMN_COPY`. Mutation-witnessed: `isNarrowed={false}` reddens only this case. —
  (`apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx`, `apps/web/test/board-narrowing.test.tsx`,
  `packages/app-core/src/index.ts`)
- **13.473** ✅ A picked workflow that drops out of `board.data` via a real mid-session re-fetch (`rerender`
  with new `Providers services`, the SAME `ProjectPage` instance) falls back to the picker's own `'all'`
  default — no phantom chip naming a raw internal id, no strip at all, every surviving group's cards
  shown. Mutation-witnessed: collapsing `resolvedWorkflowFilter` to raw `workflowFilter` reddens only
  this case. — (`apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx`,
  `apps/web/test/board-narrowing.test.tsx`)

## Task 11: Timeline restyle — geometry only, 2026-09-16

**Case `13.474` minted here**, continuing directly from `13.473` (verified against `scripts/
check-case-ids.mjs`'s real sweep — max ordinal in this file's own `13.` pool is `13.473`, matching the
dispatching agent's own count — never the file's own "next free" prose, per the false-hit note two
sections up). Pure geometry over the metrics spec's Timeline table (`:506-538`), on selectors this task
already owns end to end (`.gn-timeline*`) — no shared-surface question of the kind Task 9 hit, since
`TimelineView` renders its own markup rather than a shared component. No new token role: `trayBg`/
`trayShadow` → `--gn-surface-sunken`/`--gn-shadow-sunken` (the same pair the board's own column trays,
Task 6, already use for identical prototype vocabulary) and `fill4` → `--gn-fill-quaternary`, both
already declared and already consumed elsewhere in `ui.css`. The bar's `accent` ground / `accentText`
text is UNCHANGED — it already used the pair `.gn-filters__chip[aria-pressed='true']` settled during
this port's own Filters-sheet task over the plan's literal `--onColor` → `--gn-text-inverted` mapping,
because `CONTRAST_PAIRS` (`tokens.ts`) measures `accentText` against `accent` and never measures
`textInverted` there — so nothing about the bar's colour changed here, only its box.

**Two pinned literals updated, both sanctioned by the tests' own docblocks rather than loosened.**
`test/timeline/timeline-view.test.tsx` (11.82, "the window width is the model's, stated once") pins the
component's published `--timeline-week-columns` value by EXACT equality (two cases: the default-eight
window and a `weeksCount:2` forward) and, separately, an EXACT substring of `ui.css` itself
(`` `grid-template-columns: 12rem var(${published[0]});` ``) whose own comment reads *"a change to the
width alone will redden this too, and re-reading this comment is the intended cost."* Both paid here:
the leading (title) track widens from Plan 9's `12rem` to the spec's `230px` (`14.375rem` — this repo's
existing rem idiom, 1rem = 16px), and the published track-list value changes from `repeat(n, 1fr)` to
`repeat(n, minmax(0, 1fr))` — the spec's own literal for this row ("`repeat(8,minmax(0,1fr))`"), and not
merely a spec transcription: a bare `1fr` track carries CSS Grid's implicit automatic minimum of `auto`
(min-content), so without `minmax(0, …)` a long bar or title could still push a week column wider than
its share and defeat `.gn-timeline__bar`'s own `overflow:hidden; text-overflow:ellipsis`. Both the
component (`timeline-view.tsx`) and the three affected assertions in `timeline-view.test.tsx` were
updated together; the test's own regex guard against the WRAPPED form
(`expect(css).not.toMatch(/repeat\(\s*var\(--timeline-/)`) is unaffected — `ui.css` still never wraps the
var in `repeat()`, only the component's own published STRING contains the function now. The `+2` column
arithmetic the `12rem` comment protects depends on there being exactly ONE leading track, not its width,
and that count is unchanged.

**Zebra uses `:nth-of-type`, not `:nth-child`, and this was checked rather than assumed.** Each row's
siblings inside `.gn-timeline__group` include the group's own `<h3 class="gn-timeline__group-heading">`
ahead of the rows; `:nth-child(odd)` would count that heading as sibling #1 and shift every row's parity
by one, so a group's FIRST row would render unshaded. Read `timeline-view.tsx` to confirm every sibling
`<div>` inside a group is in fact a `.gn-timeline__row` (the heading is the only non-div sibling), which
is what makes `:nth-of-type` — same-tag-name counting only — the correct fix rather than a coincidental
one.

**Row height is a floor, not a match.** `min-height: 2.625rem` (42px) sets the metric's own number, but
`.gn-timeline__bar` carries `margin: 0.3125rem 0.1875rem` (5px top and bottom) inside the row, and
`.gn-timeline__title` carries its own `padding: 0.25rem` — a row whose content needs more than 42px
(the bar's 16px line-height plus its 10px of vertical margin already totals 26px before the title's own
padding) renders taller than 42px rather than clipping to it, which is the correct behaviour for a floor
but is worth naming since the prototype's own 42px may read as a fixed height rather than a minimum.

**The two load-bearing checks named in this task's brief, both re-verified rather than assumed clean.**
(1) `timeline-view.test.tsx:396-441`'s per-reason side-list modifier classes
(`gn-timeline__side-entry--no-dates`/`--start-only`/`--due-only`/`--start-after-due`/`--unplaceable-day`)
are untouched by this task — no selector renamed, no modifier collapsed — and the case they anchor
(11.77) still passes; this task never rendered a side-list fixture at all, so nothing here could have
reached that code. (2) `packages/app-core/test/inbox/inbox-css-binding.test.tsx` references
`.gn-timeline__bar` in exactly three places, and reading them shows why the reference is inert to this
task: all three are FIXTURE STRINGS inside the inbox scanner's own self-test, proving the `gn-inbox`
prefix matcher is not fooled by a different prefix (`.gn-timeline__bar { color: blue; }` as planted CSS,
a rendered `<span class="gn-inbox__glyph gn-timeline__bar">` as a planted DOM tree, and
`.gn-timeline__bar[data-pending] { outline: 1px dashed red; }` as a planted attribute-selector rule) —
none of the three reads the REAL `ui.css` or the REAL `TimelineView`. The gate is a NEGATIVE control on a
literal string, not a binding assertion on this component; it passed before this task's edits and after,
unchanged (`inbox-css-binding.test.tsx`'s own suite: 8/8).

`tsc --noEmit` clean on `packages/app-core` and `packages/ui` (Node v22.23.2). `pnpm exec vitest run` on
`packages/app-core` (1227/1227) and `packages/ui` (308/308); `pnpm turbo run test` at the repo root
confirmed `apps/web`'s `test/project-calendar-timeline.test.tsx` (queries `.gn-calendar`/`.gn-timeline`/
`.gn-board` existence — Test impact table's own instruction to re-verify, not assume) still passes
against the rebuilt `dist/` app-core consumes. `packages/ui/test/token-discipline.test.ts` and
`tokens.test.ts` re-run directly (not from cache): clean, no colour literal, every new `var(--gn-…)`
declared. **No live cross-style/cross-theme visual check was performed** — the spec's own Verification
section calls for one ("A live read of the board, list, calendar and timeline in all three styles × both
themes") and it is named here as a gap for whoever reviews this before merge, not silently skipped.

- **13.474** 🟡 The timeline restyles to the prototype's metrics: 230px title column + `trayBg`/
  `trayShadow` header grid, `minmax(0, 1fr)` week tracks, 42px zebra rows, a 6px-radius `accent`/
  `accentText` bar (still `0` on the clipped side only), and a `trayBg`/`trayShadow` undrawn footer.
  **Covered:** the three literals `timeline-view.test.tsx` pins by exact equality/substring
  (`--timeline-week-columns`'s two values, the `ui.css` leading-track string), re-run and green after
  each edit; the untouched 11.77 modifier-class case and the `inbox-css-binding` self-test, both re-run
  unchanged. **NOT covered:** every other geometry value in the table above (padding, margin, radius,
  min-height, colours as rendered) — jsdom computes no layout, so nothing here mechanically asserts a
  pixel. `🧪` is not used because that marker means a hand reproduction was actually performed
  (this file's own legend), and no live render, in any style or theme, was — corrected from an initial
  `🧪` marking that overstated what had been checked. Marked `🟡` pending that render, matching `13.475`'s
  own honesty about what a suite-and-`tsc` pass does and does not prove for a pure restyle. **This bullet
  as originally written was also incomplete against the SPEC, not merely unverified by eye: the spec's
  Timeline table's "Row title" row was missing from what shipped, because the plan's own condensed prose
  had dropped it before it ever reached this task's brief — see Ruling 22, `13.477`, immediately below.**
  — (`packages/app-core/src/timeline/timeline-view.tsx`, `packages/app-core/test/timeline/
  timeline-view.test.tsx`, `packages/ui/src/ui.css`)

## Ruling 22 (coordinator, 2026-09-16) — the plan dropped a Timeline row; the spec still had it

**Case `13.477` minted here**, continuing directly from `13.476` (verified against
`scripts/check-case-ids.mjs`'s real sweep). The spec's Timeline metrics table
(`docs/superpowers/specs/2026-09-16-board-prototype-port-design.md:365-376`) has EIGHT rows; the plan's
own Task 11 section condensed that table into a single prose sentence naming only six, dropping "Header
cell" (implemented anyway, from the spec directly) and "Row title" (not implemented — nothing named it).
`task-brief` extracts the task section verbatim, so the loss was inherited silently: `grep "Row title"`
returns zero hits in the plan and zero in the Task 11 brief, against one in the spec. The coordinator
verified this directly before ruling, rather than taking the report's "every metric in its brief" framing
as sufficient — true of the brief, not of the spec the plan itself says wins on disagreement.

**The missing row:** `| Row title | padding 6px 12px; 15px/20px; ellipsis; nowrap |`. Landed on
`.gn-timeline__title` — previously `padding: 0.25rem; min-width: 0;` (4px all round, no type at all) —
now `padding: 0.375rem 0.75rem; min-width: 0; font-size: 0.9375rem; line-height: 1.25rem;`. `min-width: 0`
is kept though it names no metric: it is load-bearing for `.gn-timeline__title-text`'s own
`overflow:hidden; text-overflow:ellipsis; white-space:nowrap` (unchanged, already correct before this
ruling) to truncate inside a grid item rather than push the column wide. No token role involved — both
new values are plain length/type literals, matching how every other spacing/size value in this file is
written.

**Checked row by row against the CURRENT tree, not assumed clean from memory, per the coordinator's own
ask ("tell me if anything else is missing").** All other seven Timeline metric rows read directly against
`packages/ui/src/ui.css` after Ruling 22's own edit: Header grid (`.gn-timeline__weeks`), Header cell
(`.gn-timeline__week`), Row (`.gn-timeline__row`), Bar (`.gn-timeline__bar`), Bar-clipped
(`[data-clipped-start]`/`[data-clipped-end]`), Undrawn footer (`.gn-timeline__side`), and Undrawn copy
(`.gn-timeline__side-copy`) all match their spec row exactly. Nothing else is missing.

**Not a finding, explicitly cleared by the coordinator and left alone:** `.gn-timeline__bar`'s
`border-radius: 0.375rem` (6px) is a literal, not a token — `RADIUS_ROLES` is only `card` (16/20px) and
`control` (8/14px), neither near 6px, so this is a literal-to-literal change from the pre-existing 4px,
not a Ruling-17-shaped token→literal regression.

**A stale self-citation was also fixed in this commit, unrelated to the missing row:** a comment at
`ui.css` (immediately above `.gn-timeline__weeks,` `.gn-timeline__row`) cited
`` `.gn-filters__chip[aria-pressed='true']` `` at `:3224-3227` — correct when Ruling 21's own commit was
written, but Ruling 21's ~67-line insertion earlier in the same file moved the real rule to `:3306-3309`.
Re-grepped and corrected.

Full `packages/ui` (308/308) and `packages/app-core` (1227/1227) suites green; `packages/ui/test/
token-discipline.test.ts`/`tokens.test.ts` re-run directly (not cached): clean. `tsc --noEmit` clean on
both packages (Node v22.23.2). `pnpm turbo run test` at the repo root, run on the true final tree rather
than a pre-Ruling-21 snapshot: **all 17 tasks green, `apps/server` included (149/149)** — the `apps/server`
failures earlier this session (a different pair each of three prior runs) are now confirmed as
environmental flakes rather than anything this work touched, since the identical suite is clean here with
no `apps/server` changes at all.

- **13.477** ✅ The Timeline's "Row title" metric (`padding 6px 12px; 15px/20px`, the spec table's fourth
  row, dropped by the plan before reaching this task's brief) lands on `.gn-timeline__title`. All eight
  Timeline spec rows re-checked row by row against the shipped CSS and confirmed matching. Not verified
  by a live render in any style or theme. — (`packages/ui/src/ui.css`)

## Task 9: List restyle — geometry only, ONE ruling deferred, 2026-09-16

**Case `13.475` minted here**, continuing directly from `13.474` (verified against
`scripts/check-case-ids.mjs`'s real sweep, run again after Task 11's own addition — not the file's own
"next free" prose, per the false-hit note recorded three sections up). Landed on `.gn-list-*` selectors
only, per the task's own Step 1 ("`.gn-table` and `.gn-select` are shared surfaces — do not edit them"):
a new `.gn-list__table-wrap` wraps `<Table>` (`ticket-list.tsx`'s `ListTable`, `@gisik-nokma/ui`'s shared
component) FROM THE OUTSIDE, giving the metrics table's "Container" row (`cardBg + cardShadow; radius
cardR; overflow:auto`) without adding or changing any rule `Table` itself renders through
(`.gn-table__scroll`, `.gn-table`). `cardBg`/`cardShadow`/`cardR` → `--gn-surface-raised`/
`--gn-shadow-raised`/`--gn-radius-card` — not a new triple, but the SAME three roles the shared `.gn-card`
rule (`ui.css:160-165`, unedited) already pairs, confirmed by reading it rather than assumed. The
Group-by/Columns picker's `<summary>` becomes a pill (`min-height:36px; padding:0 12px; radius 999px;
cardBg + cardShadow; 13px`), its `999px` a plain corner-radius literal — lengths are not what
`token-discipline.test.ts` bans, and `radiusVariableName` names only `card`/`control` roles, so a pill
radius has never been tokenised anywhere in this file, `.gn-chip`'s own identical literal included
(`ui.css:113`). Its checkboxes are sized to the metric's 18px tick box via `accent-color: var(--gn-accent)`
— the FIRST use of that property in `ui.css`, checked by grep before writing the justifying comment, not
assumed. The collapse caret (`.gn-list__collapse`) gets a real `min-width`/`min-height: 22px` tap target
around its glyph (previously sized only to the glyph's own intrinsic box); the title button
(`.gn-list__open`) goes to 17px/22px.

**The depth-based title indentation's FORMULA changes; its TOTAL does not become pixel-exact, and this
distinction is the whole reason Task 9 could not simply "restyle the title cell."** The metric reads
`padding:12px 16px 12px calc(16px + depth*22px)`, applying to the `<td>` (`.gn-table__cell`) itself. This
task cannot zero out that shared cell's own `padding: 0.45rem 0.6rem` (the do-not-edit rule again), so the
depth term is applied where it already lived — a `paddingLeft` INLINE STYLE on the inner
`.gn-list__title-cell` span, ADDED ON TOP OF the cell's own padding rather than replacing it — with its
FORMULA corrected from the old, ungrounded `depth * 1.1rem` to the metric's own `16 + depth * 22` (in px,
computed in JS since `depth` is a render-time number, not a CSS `calc()`). The rendered offset is
therefore the metric's indentation LOGIC, layered on a base this task cannot remove — not the metric's
exact total. Recorded rather than left implicit, so a reviewer measuring pixels against the metrics table
does not read this as a shipped miss.

**DECLARED DIVERGENCE, not a match: "Group header row."** The metric (`padding 11px 16px; trayBg +
trayShadow`) is applied to `.gn-list__section-title`, the existing per-group `<h3>` that sits OUTSIDE the
table — the closest restyle available without rebuilding the grouping shape this task's own brief holds
fixed ("Keep the Group-by / Columns wiring untouched... this is a restyle, not a rewiring"). The prototype
draws this as a `<tr>` spanning the table's own columns; this product's architecture already renders one
grouping's rows as a SEPARATE `<table>` per section (`apps/web/test/list-prefs-wiring.test.tsx` proves the
wiring this shape depends on), so there is no in-table row to restyle. `trayBg`/`trayShadow` →
`--gn-surface-sunken`/`--gn-shadow-sunken`, the same pair Task 11's `.gn-timeline__weeks` uses for
identical prototype vocabulary — cited forward at the time it was written, confirmed still true by
re-reading `ui.css` after both tasks landed.

**FIVE metrics NOT implemented — a stop-and-report, not a silent gap, and named by the task's own brief
before this task started.** "Table: min-width:820px", "Header cell" (13px/18px/600/label2/trayBg/padding/
nowrap), "Zebra" (odd rows `fill4`), "Data cell" (padding/15px/nowrap), and the title cell's own
`min-width:260px` are each reachable only by putting a class on an element `Table` (`@gisik-nokma/ui`)
renders ITSELF — `<table>`, `<th>`, `<td>`, `<tr>` — confirmed by reading `table.tsx`: no `className` prop
on the root, no per-column class hook on `TableColumn`, unlike `Card` (`card.tsx:7`,
`['gn-card', className].filter(Boolean).join(' ')`), which is exactly the shape that would fix this. Two
alternatives were considered and both rejected on this task's own authority: (1) a descendant-scoped
override such as `.gn-list__table-wrap .gn-table__header {…}` still NAMES `.gn-table__header` in a
selector `grep '\.gn-table'` would find, which is precisely what the shared-surface doctrine exists to
keep out of reach from outside the component; (2) inventing a way to zero the shared cell's padding and
restate it on an inner wrapper (as was done for the title cell's indentation ALONE) cannot reach `<table>`'s
own `min-width` or `<tr>`'s own zebra at all, since neither has an inner wrapper this task controls. **A
ruling request, recorded here rather than landed:** extend `Table`'s props the same way `Card` already is
— optional `className` on `<table>`, `headerClassName`, `rowClassName`, `TableColumn.cellClassName` — so
every rule these five metrics need could be written on a `.gn-list-*` selector alone, with `.gn-table`'s
own rule untouched for `Table`'s one other repo-wide consumer today: none (`<Table` greps to exactly the
one call site in `ticket-list.tsx`, confirmed before writing this). Not built on this task's own
authority: the port's own global constraints name this precise trap for Task 9 by number ("if a list
metric seems reachable only by editing `.gn-table`, stop and report rather than editing"), and eight
implementers on this plan have been right to stop and report before this task.

**The visible result is a mixed one — a finished frame around an unfinished interior — and this is
recorded so a screenshot is not mistaken for the whole job.** A rounded, shadowed card now surrounds a
header row, zebra pattern, and data cells that still render at `Table`'s original, unrestyled metrics.

`apps/web/test/list-prefs-wiring.test.tsx` — the Group-by/Columns wiring this task was told to leave
alone — re-run unchanged, both before and after, 2/2. `packages/app-core/test/views/ticket-list.test.tsx`
37/37. Full `packages/app-core` (1227/1227) and `packages/ui` (308/308) suites green;
`packages/ui/test/token-discipline.test.ts`/`tokens.test.ts` re-run directly (not cached): clean, no
colour literal, every `var(--gn-…)` this task added (`--gn-surface-raised`, `--gn-shadow-raised`,
`--gn-radius-card`, `--gn-surface-sunken`, `--gn-shadow-sunken`, `--gn-accent`) already declared in
`TOKEN_ROLES`/`radiusVariableName`. `pnpm turbo run test` at the repo root: `apps/web` 363/363 against the
rebuilt `dist/` app-core consumes. `tsc --noEmit` clean on `packages/app-core` and `packages/ui` (Node
v22.23.2). **No live cross-style/cross-theme visual check was performed**, the same open item Task 11
carries — named here rather than silently skipped.

- **13.475** 🟡 The list restyled PARTIALLY to the prototype's metrics as of Task 9's own commit: the
  container frame, the Group-by/Columns picker pill and its 18px tick boxes, the collapse caret's 22px
  tap target, the title button's 17px/22px, and the title cell's corrected depth formula landed; the
  table's own min-width, header cell, zebra, and data-cell padding did not — each reachable only through
  the shared `Table` component's own `<table>`/`<th>`/`<td>`/`<tr>`, which had no class hook, and a ruling
  request (extend `Table` the way `Card` already is) was recorded rather than acted on. Group-by/Columns
  wiring re-verified unchanged (`list-prefs-wiring.test.tsx`, 2/2). **The ruling request was approved
  (Ruling 21) and the remaining five metrics landed — see `13.476` immediately below.** Still not
  verified by a live render in any style or theme. — (`packages/app-core/src/views/ticket-list.tsx`,
  `packages/ui/src/ui.css`)

## Ruling 21 (coordinator, 2026-09-16) — `Table` gains class hooks, the five deferred List metrics land

**Case `13.476` minted here**, continuing directly from `13.475` (verified against
`scripts/check-case-ids.mjs`'s real sweep, run again after this section's own addition). The coordinator
verified the report's premise independently before ruling — `Table` has exactly one PRODUCTION consumer
repo-wide (`ticket-list.tsx`) plus its own test (`packages/ui/test/components.test.tsx`) — and approved
extending `Table` (`packages/ui/src/components/table.tsx`) with four optional props: `className` on
`<table>`, `headerClassName` on `TableColumn` (applied to every `<th>`), `rowClassName` on `<Table>`
(applied to every `<tr>`), and `cellClassName` on `TableColumn` (applied to that column's `<td>`s). All
four compose the way `card.tsx:7` already composes `Card`'s own `className` —
`[own, extra].filter(Boolean).join(' ')`, appending to `gn-table*` rather than replacing it — so a caller
passing nothing (every consumer before this change, and `Table`'s own existing test, which passes none of
the four) gets byte-identical output. Confirmed, not assumed: `components.test.tsx`'s `Table` describe
block (renders headers/cells, asserts a row click fires) re-run unmodified and green.

`ticket-list.tsx`'s `ListTable` now passes `className="gn-list__table"` and `rowClassName="gn-list__table-row"`
to `<Table>`, and `headerClassName: 'gn-list__table-header'` plus a per-column `cellClassName`
(`gn-list__table-cell--title` on the title column, `gn-list__table-cell--data` on every other) on each
`TableColumn`. Every new `ui.css` rule these add is a plain `.gn-list-*` selector — none names
`.gn-table`/`.gn-table__header`/`.gn-table__cell`/`.gn-table__row` — so those four rules (`ui.css:284-288`
and neighbours) are unedited, confirmed by grepping the full diff for any added/removed line that BEGINS
with one of the seven shared do-not-edit selectors (`.gn-card`, `.gn-chip`, `.gn-avatar`, `.gn-table`,
`.gn-select`, `.gn-button`, `.gn-segmented`): zero matches. `.gn-list__table-cell--data`/`--title` win
over `.gn-table__cell`'s own shared `padding: 0.45rem 0.6rem` by the SAME equal-specificity/
later-source-order technique `.gn-board-card` already uses against `.gn-card` (both single-class rules,
`(0,1,0)`, this one later in the file) — not `!important`, not extra specificity.

**The title cell's padding is pixel-exact for the first time.** `.gn-list__table-cell--title` zeroes the
`<td>`'s own left padding and supplies the metric's static top/right/bottom third (`12px 16px 12px`); the
DEPTH-dependent left term (`calc(16px + depth*22px)`) stays exactly where it already was — a per-row
inline `paddingLeft` on the inner `.gn-list__title-cell` span, since `depth` is a fact about one ROW and
`cellClassName` is declared once per COLUMN — but now composes against a zeroed base instead of an
uneditable one, closing the "not pixel-exact" caveat `13.475` recorded.

No new token role: `--gn-text-muted` (label2) and `--gn-surface-sunken` (trayBg) on the header cell are
the SAME pair `.gn-timeline__weeks` already uses (`ui.css:1939-1942`); `--gn-fill-quaternary` (fill4) on
the zebra row is already declared and consumed elsewhere. The two new length-only rules (`min-width:820px`
on `.gn-list__table`, `min-width:260px` on `.gn-list__table-cell--title`) are plain literals — this file
has no length-token axis (`radiusVariableName` names only `card`/`control`), matching how every other
spacing/size value in `ui.css` is written.

Full `packages/ui` (308/308) and `packages/app-core` (1227/1227) suites green; `packages/ui/test/
token-discipline.test.ts`/`tokens.test.ts` re-run directly (not cached): clean. `tsc --noEmit` clean on
both packages (Node v22.23.2). `pnpm turbo run test` at the repo root: `apps/desktop` (3/3),
`apps/web` (363/363) — both rebuilt against the changed `packages/ui`/`packages/app-core` — green;
`apps/server` failed on two DB-dependent tests unrelated to this change (a different pair failed than in
the prior two runs, consistent with a pre-existing environmental flake, not a regression this change
introduced).

- **13.476** ✅ The five metrics `13.475` deferred now land through `Table`'s new optional class hooks:
  `.gn-list__table` (min-width:820px), `.gn-list__table-header` (13px/18px/600/label2/trayBg/padding/
  nowrap, uniform across every column), `.gn-list__table-row:nth-child(odd)` (fill4 zebra), `.gn-list__
  table-cell--data` (12px 16px padding/15px/nowrap), and `.gn-list__table-cell--title` (min-width:260px
  plus the pixel-exact static padding third). `Table`'s own test (`components.test.tsx`) and the seven
  shared do-not-edit selectors confirmed unedited by a full-diff grep. Not verified by a live render in
  any style or theme. — (`packages/ui/src/components/table.tsx`, `packages/ui/src/ui.css`,
  `packages/app-core/src/views/ticket-list.tsx`)

## Task 12 — the transition gate, as a pure function (board-prototype-port plan, 2026-09-16)

**Cases `13.478`–`13.485` minted here**, continuing directly from `13.477` (verified against the real
case list via `scripts/check-case-ids.mjs`'s real sweep — max ordinal in this file's own `13.` pool is
`13.477` — never the file's own "next free BLOCK" prose at :2415, which an earlier task already found to
be a false hit). Phase 6, Board writes: `moveOutcome(def, fromStateId, toStateId)` is the gate Tasks 13
(move arrows) and 14 (drag-and-drop) both route a proposed move through before anything is submitted. It
ships no UI and derives nothing of its own — built entirely over `transitionOptions`
(`views/transition-dialog.tsx:41-61`), which already predicts the engine's own `find(exact) ?? find('*')`
resolution (`rule-engine/src/transition.ts:91-93`). Fixture: `WF_ERRAND` (`test/helpers/seed.ts`), which
already declares a wildcard edge (`* -> todo`), so the plain wildcard-reachable case needed no second
fixture; two purpose-built definitions cover the precedence and wildcard-carries-rules cases below.

**Mutation-witnessed** (`board-moves.ts` edited in place, `pnpm exec vitest run test/views/
board-moves.test.ts` re-run after each edit, then reverted with a targeted `Edit` — never `git checkout
--`, which has destroyed uncommitted work in this repo before). Replacing the `transitionOptions` call
with a naive re-derivation that scanned `def.transitions` in array order and stopped at the first edge
reaching `toStateId` — ignoring exact-before-wildcard — reddened `13.483` alone; every other case in the
file stayed green. Hardcoding `available: []` on the refused branch reddened all three REFUSED cases —
`13.478`, `13.479`, **and `13.485`** (a first prediction named only the first two and was corrected against
the actual run: `13.485` is a refusal too, off `todo → todo`) — while the five direct/needs-dialog cases,
`13.480`–`13.484`, which never reach that branch, stayed green. Inverting the rules check
(`rules.length === 0` routing to `needs-dialog`, anything else to `direct`) reddened exactly those five —
`13.480`/`13.481`/`13.482`/`13.483`/`13.484`, every direct/needs-dialog case swapping kind — while
`13.478`/`13.479`/`13.485` (the refused cases, unreached by that branch) stayed green.

- **13.478** ✅ Refuses an undeclared target and names the one move that IS available from that state. —
  (`packages/app-core/src/views/board-moves.ts`, `packages/app-core/test/views/board-moves.test.ts`)
- **13.479** ✅ Refusing from a state with THREE declared edges names all three, in `transitionOptions`'
  own order — not merely a non-empty list. — (same files)
- **13.480** ✅ A declared, rules-free edge answers `direct`. — (same files)
- **13.481** ✅ A declared edge carrying `require-comment` answers `needs-dialog`. — (same files)
- **13.482** ✅ A target reachable ONLY through the wildcard edge (no exact edge exists to it) still
  answers `direct`, off the wildcard edge's own (empty) rules. — (same files)
- **13.483** ✅ Wildcard declared FIRST and carrying rules, exact declared SECOND and rules-free, both
  reaching the SAME target: the exact edge's rules win — `direct`, matching the engine's `find(exact) ??
  find('*')` regardless of array order. This is ruling P27's own concern one level up, and the case the
  re-derivation mutation above reddens alone. — (same files)
- **13.484** ✅ A wildcard-only edge that DOES carry rules answers `needs-dialog`, on a purpose-built
  definition with a `flagged` state reachable only by `* -> flagged`. — (same files)
- **13.485** ✅ A move back onto the current state refuses like any other undeclared move —
  `transitionOptions` already excludes `to === fromStateId`, even against a wildcard edge that would
  otherwise reach it. Asserts both `kind: 'refused'` and `available: ['doing']`; the mutation above
  kills it on the `available` half — self-exclusion itself (the `kind`) is pinned by
  `transitionOptions`'s own tests in `transition-dialog.test.tsx`, not mutated here. — (same files)

`tsc -p tsconfig.typecheck.json` clean on `packages/app-core` (Node v22.23.2, `pnpm exec vitest run
test/views/board-moves.test.ts`: 8/8 green). `node scripts/check-case-ids.mjs` re-run after minting:
duplicate list unchanged at `13.387`/`13.413` only.

## Task 12, Ruling 25 — `moveOutcome` must not answer differently from the dialog it opens

**Cases `13.486`–`13.487` minted here**, continuing directly from `13.485` (verified against the real
case list via `scripts/check-case-ids.mjs`'s real sweep). Same-day coordinator ruling on Task 12's own
concern 2: `TransitionDialog` skips an already-claimed `require-field` input
(`transition-dialog.tsx:183`/`:257`, calling the shared `fieldAlreadyClaimed` predicate —
extracted since this ruling to `field-claims.ts:55`, see below), but `moveOutcome` never received
`ticketFields` and always answered `needs-dialog` for any `require-field` rule — the exact fork Task 12's
own docblock warned `transitionOptions` against, arriving from the other side: two places deriving "does
this field still need asking" and free to disagree.

**Fixed by extraction, not by a third re-derivation.** `fieldAlreadyClaimed(ticketFields, field)`
(`packages/app-core/src/views/field-claims.ts`, new) is the ONE predicate now read by both
`TransitionDialog` (its `missingFields` filter and its required-field render gate) and `moveOutcome`
(its `unmet` filter). `moveOutcome` gained a fourth parameter, `ticketFields: Record<string, FieldClaim>`;
a declared edge is `direct` only once every `require-field` rule on it reads satisfied through that
predicate, and `needs-dialog` otherwise. `require-comment`/`require-evidence` are unaffected — neither has
an "already satisfied" reading before a submission exists, so either still always answers `needs-dialog`.
`restrict-to`/`require-different-user`-only edges still always answer `needs-dialog` too — recorded this
time as a DELIBERATE choice (Ruling 25), considered and rejected routing to `direct`, not the same shape
of gap `require-field` was.

**Regression proof, not just new coverage.** The full `transition-dialog.test.tsx` suite (21/21) was
re-run after refactoring the dialog onto the shared predicate — unchanged and green, confirming the
extraction changed nothing about the dialog's own behaviour, only where the check lives. The full
`packages/app-core` suite (82 files, 1239 tests) was re-run too: green.

**Mutation-witnessed** (`board-moves.ts`'s `unmet` filter edited to treat every `require-field` rule as
always unmet — `ticketFields` read but not applied — re-run, then reverted with a targeted `Edit`,
`git diff --stat` confirmed empty after). Prediction, written before running: reddens `13.486` alone;
`13.487` and all eight `13.478`–`13.485` cases stay green. Result matched exactly — 9/10 green, `13.486`
failed with `expected { kind: 'direct', toStateId: 'doing' }` and received `{ kind: 'needs-dialog', toStateId:
'doing' }`.

- **13.486** ✅ A `require-field` edge whose field the ticket ALREADY carries a value for (mirroring
  `transition-dialog.test.tsx`'s own "a required field the ticket ALREADY carries is not re-asked" scenario
  one layer up, same field name and claim shape) answers `direct`, not `needs-dialog`. — (`packages/
  app-core/src/views/board-moves.ts`, `packages/app-core/src/views/field-claims.ts`,
  `packages/app-core/test/views/board-moves.test.ts`)
- **13.487** ✅ THE CONTROL 13.486 needs: the identical edge with the field UNCLAIMED still answers
  `needs-dialog` — without it, an implementation that always answered `direct` for `require-field`, or that
  accepted `ticketFields` and silently ignored it, would pass 13.486 for the wrong reason. — (same files)

## Task 12, Ruling 26 — mirror the rule engine: trim, treat whitespace-only as unset

**Cases `13.488`–`13.489` minted here**, continuing directly from `13.487` (verified against the real case
list via `scripts/check-case-ids.mjs`'s real sweep). Same-day coordinator ruling on Ruling 25's own
follow-up: `fieldAlreadyClaimed` (`!= null`) disagreed with `evaluateRequireField`
(`packages/rule-engine/src/rules/require-field.ts`), which trims and treats a whitespace-only value as
unset — deliberate, tested, Task 9's own controller ruling
(`packages/rule-engine/test/engine.test.ts`, describe "require-field and require-evidence refuse a blank
value, not only an absent one", case "refuses require-field when the field is set to a whitespace-only
string"). Before Ruling 25 the divergence was contained (every `require-field` edge opened
`TransitionDialog`, which has `serverRefusal` wired); Ruling 25 removed that containment, so a ticket with
`dueDate: '   '` could answer `direct` from `moveOutcome` and then fail against the real server with
nothing visible on Tasks 13/14's arrows or drag-and-drop — the exact failure `transitionOptions`'s own
docblock warns against.

**Fixed by mirroring the engine's semantics, not by importing its machinery.**
`packages/rule-engine/src/index.ts:32-39` deliberately withholds `refuse()`/`ACCEPT` — "a consumer outside
this package has no business minting a `Refusal`" — so `fieldAlreadyClaimed` was NOT changed to call into
the engine; it now computes the same `isSet` expression `evaluateRequireField` computes
(`value !== undefined && value !== null && !(typeof value === 'string' && value.trim().length === 0)`),
independently stated in the client's own vocabulary.

**Checked for an existing test pinning the old, wrong behaviour before changing anything.** An earlier
pass of this grep ran over `packages/app-core/test` and `packages/app-core/src` only, and a claim naming
`packages/rule-engine/test` as covered was written before that path was actually searched — caught in
review and corrected here rather than left standing. The command actually run, both patterns over BOTH
directories: `grep -rn "value: ''" packages/app-core/test packages/rule-engine/test` and `grep -rn
"value: '   '\|value: ' '\|value: '\t" packages/app-core/test packages/rule-engine/test`. Three hits, all
accounted for and none a counter-example: a `<select>` option's `value: ''` in
`new-ticket-dialog.test.tsx` (not a `FieldClaim`); a DOM `target: { value: '   ' }` in
`saved-filters-menu.test.tsx` (not a `FieldClaim`); and `engine.test.ts:855`'s own `due_date: '   '`
fixture — the SERVER's test asserting the engine REFUSES that ticket, i.e. the correct, authoritative
behaviour this change now matches, not an assertion of the client's old, wrong "claimed" reading. No
`FieldClaim` fixture anywhere asserts a blank/whitespace value as already claimed or satisfied. Nothing
needed amending; this is a pure gap-fill, not a defect-vs-test negotiation. The full `packages/app-core`
suite (83 files, 1249 tests, up from 82/1239 — the new file and cases, nothing lost) and the full
`transition-dialog.test.tsx` (21/21) were re-run to confirm, not merely grepped for.

**The dialog's behaviour changes, and it is a FIX, not a regression**, per the coordinator's own framing:
today a blank-but-present field reads as claimed, the dialog does not prompt for it, the person clicks
Move, and the server refuses them; after the trim the dialog prompts, they fill it in, and the move
succeeds. The engine required this all along — `TransitionDialog` was the thing out of step, not the
other way round.

**The agreement is pinned by a genuine round trip against the real, exported engine**, not a
self-comparison: `packages/app-core/test/views/field-claims.test.ts` (13.489) runs `fieldAlreadyClaimed`
and the real `evaluateTransitionRules` (`@gisik-nokma/rule-engine`'s public dispatcher — the same one the
server calls) side by side over nine value shapes, through a minimal stub `EngineContext`
`evaluateRequireField` never touches (it reads only `input.ticket.fields`). Each shape states its own
expected `direct`/`unset` verdict independently, so a bug shared by both implementations would still show
up as a wrong comparison against that independent expectation rather than a silent agreement.

**Mutation-witnessed** (`fieldAlreadyClaimed`'s trim removed, reverted to bare `!= null`; reverted after
with a targeted `Edit`, `git diff --stat` confirmed empty). Prediction, written before running: reddens
`13.488` and exactly the THREE whitespace/blank sub-cases of `13.489` (empty string, whitespace-only,
mixed whitespace); the other ten `board-moves` cases and six other `field-claims` sub-cases stay green.
Result matched exactly — 4 failed / 16 passed across the two files, the failing set precisely `13.488` plus
those three `13.489` sub-cases.

- **13.488** ✅ The SAME `require-field` edge as `13.486`/`13.487`, field set to a WHITESPACE-ONLY string
  (`'   '`), answers `needs-dialog` — not `direct`. This is the case that motivated Ruling 26. —
  (`packages/app-core/src/views/board-moves.ts`, `packages/app-core/src/views/field-claims.ts`,
  `packages/app-core/test/views/board-moves.test.ts`)
- **13.489** ✅ `fieldAlreadyClaimed` agrees with the REAL rule engine across nine value shapes (absent,
  `null`, `''`, whitespace-only, mixed-whitespace, a real string, `0`, `false`, a real object) — a genuine
  round trip against `evaluateTransitionRules`, not a self-comparison, so a future drift between the two
  implementations reddens this rather than passing silently. — (`packages/app-core/src/views/
  field-claims.ts`, `packages/app-core/test/views/field-claims.test.ts`)

`tsc -p tsconfig.typecheck.json` clean on `packages/app-core` (Node v22.23.2). `node
scripts/check-case-ids.mjs` re-run after minting: duplicate list unchanged at `13.387`/`13.413` only.

## Task 13 — move arrows: refusal and its positive control (board-prototype-port plan, 2026-09-16)

**Cases `13.490`–`13.505` minted here**, continuing directly from `13.489` (verified against the real case
list via `scripts/check-case-ids.mjs`'s real sweep — max ordinal in this file's own `13.` pool was
`13.489` — never the file's own "next free BLOCK" prose, an already-recorded false hit). Phase 6, Board
writes: per-card `‹ ›` move arrows, the first WRITE path in this port. `arrowTarget`
(`views/board-arrows.ts`) resolves each arrow's target — the nearest state in that direction for which
`transitionOptions` declares a real edge, never the literal adjacent column — and `MoveArrows`
(`views/board.tsx`) routes every click through `moveOutcome` (Task 12) without re-deriving its verdict.

**`board-arrows.test.ts` — 8 cases (`13.490`–`13.497`), all against the pure `arrowTarget` scan.**
Fixture: `WF_ERRAND` for the ordinary and wildcard cases, plus one purpose-built three-state definition
(`todo -> done` declared, `doing` undeclared and sitting between them in column order) for the brief's own
canonical illustration.

**Mutation-witnessed** (`board-arrows.ts` edited in place — `scanRange.find((id) => declared.has(id)) ??
null` replaced with the naive `scanRange[0] ?? null`, i.e. the literal adjacent column, ignoring
`declared` entirely — `pnpm exec vitest run test/views/board-arrows.test.ts` re-run, then reverted with a
targeted `Edit`; a functional re-run of the full 8-case file afterward confirmed the revert, since a new,
still-untracked file shows no `git diff` either way). Prediction, written before running: reddens exactly
the two cases built to distinguish "nearest declared" from "literal adjacent" — `13.494` and `13.496` —
leaving the other six green, since every other case's expected answer happens to coincide with the literal
adjacent column for reasons unrelated to the scan (either only one candidate exists, or none does).
Result matched exactly: 6 passed / 2 failed, the failing set precisely `13.494` and `13.496` —
`expected 'waiting' to be 'doing'` and `expected 'doing' to be 'done'` respectively.

- **13.490** ✅ The nearest declared forward target IS the adjacent column — the ordinary case, `todo`
  `next` → `doing`. — (`packages/app-core/src/views/board-arrows.ts`,
  `packages/app-core/test/views/board-arrows.test.ts`)
- **13.491** ✅ No declared edge points back at `todo` from anywhere, so `previous` answers `null`. —
  (same files)
- **13.492** ✅ From `doing`, THREE targets are declared (`todo` via wildcard, `waiting`, `done`); `next`
  picks the NEARER of the two forward ones (`waiting`), not merely a declared one — proves "nearest",
  not "any". — (same files)
- **13.493** ✅ `previous` from `doing` resolves through the WILDCARD edge (`* -> todo`), not only an
  exact one. — (same files)
- **13.494** ✅ THE SKIP CASE inside the shared fixture: from `done`, `waiting` sits between `doing` and
  `done` in column order but is NOT declared reachable from `done`; `previous` skips it and lands on the
  further, genuinely declared `doing`. The mutation's own witness. — (same files)
- **13.495** ✅ `done` is the last column; `next` has nothing to scan forward into and answers `null`. —
  (same files)
- **13.496** ✅ THE BRIEF'S OWN CANONICAL EXAMPLE, its own purpose-built fixture: `todo -> done` declared,
  `doing` sitting between them purely visually with no edge touching it at all. `next` from `todo`
  resolves straight to `done`, never the physically adjacent `doing`; the paired control confirms `doing`
  itself has no move in EITHER direction, so the skip did not merely relabel which arrow `doing` answers
  to. The mutation's other witness. — (same files)
- **13.497** ✅ A `fromStateId` absent from `columnOrder` entirely has no column to scan from and answers
  `null` in both directions. — (same files)

**`board-moves-ui.test.tsx` — 8 cases (`13.498`–`13.505`), the component-level wiring: `Board`'s `moves`
capability, `MoveArrows`, and `MoveRefusalNotice`.**

**Why the refusal path is proven at the `moveOutcome`/`refusalCopy`/`MoveRefusalNotice` seam, not through a
simulated wrong click.** `MoveArrows` computes each arrow's target via `arrowTarget`, which by
construction only ever returns a member of `transitionOptions(workflow, fromStateId)` — the SAME set
`moveOutcome`'s own refusal check reads off the identical `(workflow, fromStateId)`. So a target this
component ever actually SUBMITS is, by construction, always declared, and a live click on an ENABLED arrow
cannot organically drive `moveOutcome` into its `refused` branch. `13.502`/`13.503` prove the real refusal
RENDERING instead — the actual `moveOutcome` output, fed into the actual `refusalCopy`/`MoveRefusalNotice`
— which is the honest seam given the click-side is provably unreachable, and is also exactly the pipeline
Task 14's drag-and-drop reuses for real, since a drop target is not filtered this way.

- **13.498** ✅ THE POSITIVE CONTROL the brief demands: clicking an available arrow on a declared,
  rules-free edge submits the SHIPPED `{to}` `ticket.transitioned` payload (never `{toStateId}`), with the
  right `actorId`/`origin`, calls `onMoved`, and renders no refusal of either kind. Only this case tells a
  refusal that fires on everything apart from a refusal that actually works. — (`packages/app-core/src/
  views/board.tsx`, `packages/app-core/test/views/board-moves-ui.test.tsx`)
- **13.499** ✅ THE PAIRED NEGATIVE CONTROL: the direction with no declared target is a genuinely disabled
  button (native `disabled`, not merely styled to look inert), and firing a click at it anyway submits
  nothing. — (same files)
- **13.500** ✅ The `moves` capability itself absent (not passed to `Board` at all) renders NO move arrows
  whatsoever — the whole feature absent, not merely every direction disabled. — (same files)
- **13.501** ✅ A declared edge whose rules are NOT already met (`require-comment` on the nearest-declared
  edge, a purpose-built gated `WF_ERRAND` variant) opens `TransitionDialog` rather than submitting blind.
  **The dialog is NOT pre-aimed at the arrow's own target** — only `(workflow, fromStateId)` are threaded
  through; the dialog's own `<Select>` starts empty and this test picks "Doing" from it the same way a
  person would. What it proves: the dialog opens on the right workflow and the right `fromStateId` (not
  merely that SOME dialog opens), and completing it submits the SHIPPED `{to, comment: {text}}` payload. —
  (same files)
- **13.502** ✅ The refusal pipeline, end to end and for real: `moveOutcome(WF_ERRAND, 'todo', 'waiting',
  {})` refuses with `available: ['doing']` (the one real alternative — `moveOutcome`'s own test suite
  already proves this fact; this case's job is only what renders from it), and `MoveRefusalNotice` fed
  that exact output renders text naming "Doing" BY NAME — never a bare "you can't do that", and never the
  raw id leaking through unnamed. — (same files)
- **13.503** ✅ The zero-alternatives sentence (`moveOutcome`'s `available: []`) is still an honest one —
  `"This ticket can't move from here."`, not `"try ."` — both from `refusalCopy` directly and from
  `MoveRefusalNotice`'s own rendering. — (same files)
- **13.504** ✅ A REJECTED `ingest` (a transport failure, not a server answer) does not brick the card:
  found in review, not authored blind — `submitDirect`'s own `submitting` latch (no precedent in
  `TicketSheet.submitTransition`, which never disables its Move button in flight) was originally reset
  only after a successful `await`, so a rejection left both arrows `disabled` forever with nothing on
  screen. Fixed with `try/catch/finally`. Mutation-witnessed the other direction — the FIX reverted back
  to the pre-fix shape, `pnpm exec vitest run test/views/board-moves-ui.test.tsx` re-run, reddened this
  case alone (`Unable to find role="alert"`, and the DOM dump shows both arrows `disabled=""`) — the other
  six cases in the file stayed green, then reverted with a targeted `Edit`. — (`packages/app-core/src/
  views/board.tsx`, `packages/app-core/test/views/board-moves-ui.test.tsx`)
- **13.505** ✅ THE SAME transport-failure fix `13.504` proved for `submitDirect`, now proved for
  `submitFromDialog`: found in a THIRD review round, requested before declaring the `13.504` follow-up
  done. `TransitionDialog`'s `onSubmit` prop is `void`-typed and `MoveArrows`' own call site is
  fire-and-forget (`onSubmit={(submission) => void submitFromDialog(submission)}`), so before this fix a
  rejected `ingest` from inside the dialog became an unhandled promise rejection — the dialog stayed open
  with nothing on screen saying it failed. Fixed with a `try/catch` around `submitFromDialog`'s body,
  reusing `TransitionDialog`'s EXISTING `serverRefusal` display (`transition-dialog.tsx:311-314`) rather
  than inventing a new one. Mutation-witnessed: the `try/catch` reverted to the pre-fix shape, `pnpm exec
  vitest run test/views/board-moves-ui.test.tsx` re-run, reddened this case alone (`PASS (7) FAIL (1)`,
  timeout waiting for the dialog's own alert), the other seven cases in the file stayed green, then
  reverted with a targeted `Edit` and re-confirmed `PASS (8) FAIL (0)`. — (`packages/app-core/src/
  views/board.tsx`, `packages/app-core/test/views/board-moves-ui.test.tsx`)

**A separate, related fix carries NO case number, and that absence is deliberate, not an oversight.**
The `try/catch/finally` `13.504` added made every local `setState` call in both `submitDirect` and
`submitFromDialog` run unconditionally after an `await` — including on a card that has unmounted in the
meantime, which is not rare: a successful move on ANY card (this one or a sibling) calls `moves.onMoved()`
→ `board.reload()`, which can restructure the board and unmount a DIFFERENT card whose own slower `ingest`
is still in flight. Found in a second-opinion review (the same one that led to `13.505`), fixed with a
`mountedRef` gating every local setter in both submit paths — the identical idiom `use-live-query.ts`'s
`isCurrent()` and `TransitionDialog`'s own precheck `cancelled` flag already use — while leaving
`moves.onMoved()` itself unguarded (it reaches the parent and is safe regardless of this component's mount
state). **React 18 drops the console warning for a setState on an unmounted component, so no assertion in
jsdom/RTL can observe the difference the guard makes** — confirmed true of both cited precedents as well,
neither of which carries a dedicated test for this either. Rather than write a test that only LOOKS like it
exercises the race (and would pass identically with or without the guard), this fix is documented instead
of witnessed — the honest alternative to a check that cannot fail. `packages/app-core/src/views/board.tsx`.

`tsc -p tsconfig.typecheck.json` clean on `packages/app-core`; `tsc -p tsconfig.json --noEmit && tsc -p
tsconfig.e2e.json --noEmit` (the package's own `typecheck` script) clean on `apps/web`. Node `v22.23.2`.
Full `packages/app-core` suite: 87 files, 1265 tests, green (up from 83/1249 before this task — the two
new files' 16 cases, nothing lost). Full `apps/web` suite: 363 tests, green, run AFTER wiring `moves` into
`page.tsx` — whether any of those 363 tests exercise the project page's board tab with a signed-in session
was not individually traced; the claim made here is only the measured one, that the full suite stayed
green with the wiring in place, not a claim about which tests do or do not reach the new code path.

**A repo-wide `pnpm turbo run test` (dist freshly built for every upstream package, so `apps/web`'s own
resolution of `@gisik-nokma/app-core` to `dist/` is proven against this task's REAL changes, not a stale
build) surfaced 3 unrelated timeouts in `apps/server`** (`test/determinism.test.ts`,
`test/seed/seed-dev.test.ts`, `test/visibility/grant-backfill.test.ts`, all `Error: Test timed out in
30000ms`, 1518 passed / 5 skipped otherwise) — investigated, not waved off: this task changed zero files
under `apps/server`, `apps/server:typecheck` already passed clean in the same run, the log's own error
line names a DIFFERENT Node (`v24.11.1`) than every other package ran under in this task (`v22.23.2`), and
all 18 tests across the three files pass cleanly when re-run in isolation under the correct Node with no
contention from the other 16 packages building/testing at once. Pre-existing environmental flakiness
and/or a Node-version drift in turbo's own subprocess spawning, not a regression this task introduced —
see the task report for the full account. Every package this task actually touched (`ui` 309/309,
`app-core` 1264/1264, `web` 363/363) passed clean in that same full run, as did every other untouched
package.

**Review caught two additional real defects before this landed, both fixed and both proven with their own
mutation witnesses (case `13.504` above, and see that case for the specific witness); a third was a wording
correction with no code change** — `board-moves-ui.test.tsx`'s own `13.501` describe block and the
`13.501` bullet above both originally claimed `TransitionDialog` opens "aimed at the right target"; it does
not — only `(workflow, fromStateId)` are threaded through, and the target is chosen from the dialog's own
dropdown, the same way `TicketSheet`'s "Move…" button already works. Reworded in the test file, this
file, and the task report rather than left standing. `.gn-board-card__move--previous`/`--next` were also
dropped from the arrow buttons' `className` — empty class hooks with no corresponding `ui.css` rule, the
exact shape this repo has already removed once (`481ad12c`).

**A THIRD review round, requested before declaring the `13.504` follow-up done, found two more real
issues** — `13.505` above (the `submitFromDialog` transport-failure fix, code changed and
mutation-witnessed) and the `mountedRef` guard (code changed, deliberately NOT mutation-witnessed, see
above for why). Two further points from that same round were left as documented judgment calls rather
than code changes: `submitFromDialog` still carries no `try/catch` of its OWN distinct from the transport
fix already applied (moot — the fix IS the catch); and the client-invented `rule: 'transport'`/
`rule: 'no-response'` values render through the identical `Refused by the server — ${rule}: ${reason}`
sentence a REAL server refusal uses, which a viewer cannot distinguish from an actual server answer —
changing that sentence now would redden the `13.504` mutation-witnessed assertion that the alert text
contains `'network unreachable'`, so it was left as a coordinator-level decision rather than changed
unilaterally.

`node scripts/check-case-ids.mjs` re-run after minting `13.505`: duplicate list unchanged at
`13.387`/`13.413` only.

## Ruling 27 (coordinator, 2026-09-16) — the client was minting refusals

The coordinator's own review of Task 13's four commits found what the third review round above (concern 5
in the task report) treated as a documented, deliberately-unfixed judgment call was actually a real
violation of `rule-engine/src/index.ts:32-41`'s own stated door: "`refuse()` and `ACCEPT`... stay internal…
a consumer outside this package has no business minting a `Refusal`, and exporting them would hand every
client a way to fabricate a verdict that looks engine-made". `board.tsx` never imported `refuse()` — it
built `{ rule: 'no-response'|'transport', reason }` objects by hand instead, and fed them into
`serverRefusal`, the SAME channel `TransitionDialog`'s own docblock calls "the authority's answer, shown
VERBATIM whenever present." Neither `no-response` nor `transport` exists in `REFUSAL_RULES`
(`rule-engine/src/refusal-rules.ts:9-25`, fifteen real entries). A dropped connection or an empty `ingest`
response rendered through the identical `Refused by the server — ${rule}: ${reason}` sentence a real
refusal uses — indistinguishable from an actual server verdict, and calling for the opposite next action
(retry, not "fix the thing the server objected to").

**The fix: a wholly separate channel, never a `{rule, reason}` pair.** `MoveArrows` (`board.tsx`) gained a
new `transportError: string | null` state, kept SEPARATE from `serverRefusal` rather than merged into it
with a `kind` tag — `serverRefusal` now carries ONLY what `moveOutcome`'s gate or a real `IngestResult`
actually said; `transportError` carries a plain sentence for the two cases where nobody adjudicated at all.
`TransitionDialog` (`transition-dialog.tsx`) gained the identical `transportError: string | null` prop
(now REQUIRED, matching `serverRefusal`'s own required shape — every caller must consciously pass `null`
rather than silently defaulting), rendered in its own `<p role="alert" className="gn-refusal
gn-refusal--transport">`, never alongside "Refused by the server". `ui.css` gained `.gn-refusal--transport`,
reusing the `warning` role `.gn-refusal--preview` already uses (amber, not `--server`'s danger-red) — the
same "not the authority speaking" register, a different reason. `ticket-sheet.tsx`'s own
`TransitionDialog` mount passes `transportError={null}`, with a comment explaining why: `TicketSheet.
submitTransition` stays unguarded (an unhandled promise rejection on a transport failure, the existing,
untouched precedent `board.tsx`'s own docblocks already cite) — it never fabricated a refusal either, it
just never caught the rejection at all, so there is nothing to pass but `null`. No import of `refuse()`/
`ACCEPT` anywhere — the fix stays on the "never mint a verdict" side of the door the ruling quotes, not a
smaller violation of it.

**Wording:** the "silence" case (`results[0] === undefined`) keeps its exact original sentence, moved to
the new channel — `"The server did not answer this move."` The "transport failure" case (a rejected
`ingest`) is new — `` `We could not reach the server for this move — ${message}` ``.

**On `13.504`: amended, and the amendment is quoted, not just described, per the coordinator's own
instruction.**

- **BEFORE:** `expect(screen.getByRole('alert')).toHaveTextContent('network unreachable')` — one substring
  check.
- **Measured, not assumed, that this did NOT organically redden under Ruling 27's fix** (the coordinator
  expected it would): the new sentence — `"We could not reach the server for this move — network
  unreachable"` — still CONTAINS the substring `'network unreachable'`, so the old assertion passed under
  BOTH the defective rendering and the fixed one. Running the full affected suite (`board-moves-ui.
  test.tsx` + `transition-dialog.test.tsx`) against the fix with the assertion still in its pre-amendment
  shape confirmed this directly: `PASS (29) FAIL (0)`. The test was too weak to catch the defect it was
  never written to look for — it checked that SOME message with the right substring appeared, never that
  the message avoided claiming server authority it did not have.
- **AFTER:** the alert is captured once and checked five ways — `toHaveTextContent('We could not reach the
  server for this move')`, `toHaveTextContent('network unreachable')`, `not.toHaveTextContent('Refused by
  the server')`, `toHaveClass('gn-refusal--transport')`, `not.toHaveClass('gn-refusal--server')` — plus the
  original "arrows stay usable" assertion, unchanged. `13.505` (the `submitFromDialog` sibling) got the
  identical amendment for the identical reason, quoted the same way in its own docblock.
- **Mutation witness, run against the fix itself rather than assumed correct:** `board.tsx`,
  `transition-dialog.tsx`, and `ticket-sheet.tsx` reverted in place to their exact pre-Ruling-27 content
  (`git show f5041052:<path>`, the last commit before this ruling), the two affected test files re-run.
  Result: `PASS (27) FAIL (3)` — exactly the three cases touched by this ruling (amended `13.504`, the new
  `13.506` below, amended `13.505`) and nothing else. The failure text is the ruling's own defect, produced
  by the actual reverted code rather than described secondhand: `13.504` and `13.505` both failed with
  `Received: "Refused by the server — transport: network unreachable"`; the new case failed with `Received:
  "Refused by the server — no-response: The server did not answer this move."` — direct proof the
  pre-ruling code fabricated BOTH `rule: 'transport'` and `rule: 'no-response'`, not only the one the
  coordinator's file:line citations named first. Files restored byte-identical afterward (`diff` against a
  pre-revert backup of each, confirmed clean) and the full suite re-confirmed green.

- **13.506** ✅ (new, no prior coverage existed of this path in this file) — `submitDirect`'s "silence"
  case: `ingest` answers with an empty array, so `results[0]` is `undefined` and nobody adjudicated. Same
  channel, same distinguishing assertions as amended `13.504`, checked against `"The server did not answer
  this move."` instead of the transport sentence. — (`packages/app-core/src/views/board.tsx`,
  `packages/app-core/test/views/board-moves-ui.test.tsx`)

**Case IDs `13.506` minted here**, continuing from `13.505` (verified against `scripts/check-case-ids.mjs`'s
real sweep, not this file's own prose). `packages/app-core/test/views/transition-dialog.test.tsx`'s shared
`renderDialog` helper gained a `transportError={null}` default (the prop is now required on
`TransitionDialogProps`) — no new case minted there: `13.505`'s amended assertions already exercise
`TransitionDialog`'s own `transportError` rendering through the real dialog (`within(dialog).getByRole(
'alert')`), so a second, isolated unit test of the identical render branch would be a redundant guard
rather than new coverage — the exact shape this repo's own case-review discipline warns against minting
for its own sake.

`tsc -p tsconfig.typecheck.json` clean on `packages/app-core` (Node `v22.23.2`). Full `packages/app-core`
suite: 85 files, 1266 tests, green (up from 1265 — the one new case, nothing lost). `node
scripts/check-case-ids.mjs` re-run after minting `13.506`: duplicate list unchanged at `13.387`/`13.413`
only.

## Task 14 — drag-and-drop, the plan's final task (board-prototype-port plan, 2026-09-16)

**Cases `13.507`–`13.513` minted here**, continuing directly from `13.506` (verified against the real case
list via `scripts/check-case-ids.mjs`'s real sweep, not this file's own prose). Dragging a card from one
board column and dropping it on another — the SAME `moveOutcome` gate Task 13's arrows already route
through, never a second one: a drop's target comes from whichever column it lands on, and the dragged
card's own `MoveArrows` instance (`views/board.tsx`) registers its real `attemptMove` closure into a
shared per-board registry (`MoveRegistry`) keyed by ticket id, on every render; the target column's drop
handler looks it up and calls it — the identical function an arrow click on that card would call. This
ships **no second module and no second decision point** — `views/board-arrows.ts`'s own forward reference
to "that task's own module" is corrected in place (this task's own commit) to describe the registry
instead, since no second module exists.

**`board-drag-drop.test.tsx` — 6 cases (`13.507`–`13.512`), a sibling file to `board-moves-ui.test.tsx`,
the same convention that file's own docblock set for itself relative to `board.test.tsx`.** Every test
drives the board through a REAL `fireEvent.dragStart` → (`dragover` where relevant) → `fireEvent.drop`
sequence, never calling anything drag-specific directly — the whole point of this task is that a drop and
an arrow reach `moveOutcome` through the exact same code, provable only by reaching it the way a person
actually would. `DataTransfer`/`DragEvent` are unimplemented in this repo's jsdom (25.0.1 — confirmed
empirically: `new window.DataTransfer()` throws `is not a constructor`); `@testing-library/dom`'s own
`events.js` documents the identical gap and attaches whatever plain object is passed as `dataTransfer`
directly onto the fired event with no validation, so each test builds a hand-rolled `DataTransfer`
stand-in (`setData`/`getData` over a `Map`, format-aware — never answering the same value for every
format), cast `as unknown as DataTransfer`, mirroring the established `ClipboardEvent`/`clipboardData`
precedent already in this codebase (`packages/editor/test/drive-never-inline.test.ts`). ONE instance is
passed to both the `dragStart` and the `drop` fire calls in every test, never two — a real browser hands
one `DataTransfer` object to every event in a single drag gesture, and two fakes would prove nothing about
whether the drop side actually reads what the drag side wrote.

- **13.507** ✅ THE POSITIVE CONTROL the brief demands, mirroring `13.498`'s role for the arrows: dragging
  the card in `todo` and dropping it on `doing` (a declared, rules-free edge) submits the SHIPPED `{to:
  'doing'}` `ticket.transitioned` payload with the right actor/origin, calls `onMoved`, and renders no
  alert. — (`packages/app-core/src/views/board.tsx`, `packages/app-core/test/views/board-drag-drop.test.tsx`)
- **13.508** ✅ THE CASE AN ARROW CANNOT ORGANICALLY REACH: dropping the `todo` card on `waiting` (`todo`'s
  only declared target in `WF_ERRAND` is `doing` — proven by `moveOutcome`'s own suite and reused verbatim
  by `13.502`) refuses, and the rendered alert NAMES "Doing" rather than merely appearing; nothing is
  ingested. The first END-TO-END exercise of the refusal pipeline this port has — `13.502` proves the same
  pipeline only at the pure-gate seam, because an arrow's own target is always declared by construction. —
  (same files)
- **13.509** ✅ THE THIRD OUTCOME the design spec's own Test impact section names for this task alongside
  the positive control and the refusal above ("a drop on a rules-bearing edge opening the dialog"):
  dropping on a `todo -> doing` edge regated with `require-comment` (`13.501`'s own gated-edge fixture,
  reused verbatim) opens `TransitionDialog`, aimed at the right `(workflow, fromStateId)`. Does not
  re-prove `submitFromDialog`'s own mechanics — `13.501`/`13.504`/`13.505` already do, over the identical
  function this drop reaches; this case's whole job is the DISPATCH, not what happens after. — (same files)
- **13.510** ✅ THE MECHANISM every outcome case above is blind to: `fireEvent.drop` in a test dispatches
  straight to React's listener regardless of what `dragover` did, so a suite built only from `13.507`–
  `13.509` could pass in full against an implementation where a real browser's default action (disallow
  dropping) would silently defeat every drop. Pinned directly — `fireEvent.dragOver(column, {
  dataTransfer })` returns `false`, the `dispatchEvent` return value exactly when something called
  `preventDefault()` on a cancelable event (`dragover`'s own default `cancelable: true`,
  `@testing-library/dom`'s event map) — not inferred from any drop succeeding. — (same files)
- **13.511** ✅ A `drop` with no real `dragstart` behind it (an empty `DataTransfer`, `getData` answering
  `''`) is a SILENT, INERT no-op, not a thrown error and not a refusal: `''` is not a ticket id the
  registry has ever seen, so `Map.get` answers `undefined` and the drop handler does nothing further — no
  ingest, no alert, no dialog. Distinguishes "the gate ran and refused" from "the handler found nothing to
  act on", the one outcome `MoveRegistry`'s own docblock names as the case this feature does not narrate. —
  (same files)
- **13.512** ✅ RULING 15'S OWN WORDS, proven rather than asserted in prose: "a grab cursor on an
  undraggable card is an affordance claim the product cannot honour." Mirrors `13.500`'s identical "no
  arrows at all" proof for the same `moves` capability being absent: the card's `<li>` is NOT matched by the
  literal selector `ui.css` uses to grant the grab cursor when there is no `MoveArrows` instance behind it
  to register an `attemptMove`, and a drop aimed at it anyway is still inert, since `onDropCard` itself is
  `null` on that path and the column never receives an `onDrop` handler at all. — (same files)

  **AMENDED, Ruling 29 (coordinator, 2026-09-16).** Originally asserted the literal
  `toHaveAttribute('draggable', 'false')` — a SPELLING of how the element fails to be draggable, not the
  CONTRACT the cursor rule depends on. `.gn-board__card-slot[draggable="true"]` is equally unmatched by an
  EXPLICIT `draggable="false"` and by the attribute being ABSENT entirely — both read "not draggable" to a
  browser. The old assertion would have reddened a future refactor that switched to omitting the attribute
  instead of setting it `false` (e.g. `draggable={arrows !== null ? true : undefined}`), even though the
  CSS contract would still hold — a phantom regression, found by the coordinator rather than caught by any
  test. **Now asserts the contract directly**: `card.matches('[draggable="true"]')` is `false` — the
  identical selector string `ui.css` uses, read off the real DOM via the standard `Element.matches` API,
  rather than one particular way of failing to satisfy it.

  **Mutation-witnessed both directions, not merely reasoned about.** (A) `draggable={arrows !== null}` →
  `draggable={true}` (a REAL regression — always draggable, even with no `moves` capability): reddened
  `13.512` and nothing else (`AssertionError: expected true to be false`). (B) `draggable={arrows !== null}`
  → `draggable={arrows !== null ? true : undefined}` (the PHANTOM the old assertion would have flagged —
  omits the attribute rather than setting it `false`, same CSS outcome): the AMENDED assertion stayed
  green (`PASS (9) FAIL (0)`), confirmed by first restoring the OLD assertion text and re-running the same
  mutation — which reddened, proving the fix actually removes the phantom rather than merely being asserted
  to. Both mutations reverted; the 9-case file re-confirmed green afterward.
- **13.514** ✅ THE REGISTRY MUST HOLD THE LATEST `attemptMove`, not one captured once. Every other case in
  this file drops exactly once; this drags and drops the SAME card TWICE in sequence (both times onto the
  declared, rules-free `doing` edge) and asserts BOTH submit — two `ingest` calls, `onMoved` called twice.
  Proves the `useEffect` that re-registers `attemptMove` on every render actually publishes the fresh
  closure (the one that sees `submitDirect`'s own `finally`-reset `submitting` flip back to `false`), not a
  closure frozen at first render — the shape of bug an over-eager `useCallback` memoization could introduce
  silently, either bricking the card after one move or bypassing the double-submit latch entirely, without
  touching any line this file's other six cases exercise. — (same files)

## Ruling 28 — the notice scrolls into view following a drop, never following an arrow (coordinator, 2026-09-16)

**The tension, named rather than resolved unilaterally.** `.gn-board__rail` (`packages/ui/src/ui.css:315`) is
`overflow-x: auto`. The refusal/server-refusal/transport-error notices render exactly where `MoveArrows`
already renders them for arrow clicks — under the SOURCE card, in its origin column — never a second site
near the drop point, since a second site would be the "two products" fork this task exists to avoid. But
after a rightward drag the origin column can scroll out of view before a sighted person reads why their
card snapped back, which is functionally the "silent snap-back" the design spec forbids
(`docs/superpowers/specs/2026-09-16-board-prototype-port-design.md:270-271`) — for sighted users
specifically: `role="alert"` already announces the notice to assistive technology regardless of scroll
position.

**Fix: keep the single rendering site, scroll it into view on the drop path only.** `MoveArrows` gained a
`lastAttemptSourceRef` (`'arrow' | 'drop'`), set by `attemptMove`'s own new optional second parameter
(defaulting to `'arrow'` — every arrow `onClick` is unchanged); the registry wrapper `registerAttempt`
registers now passes `'drop'` explicitly. The three notices are wrapped in one `<div
className="gn-board-card__notice" ref={noticeRef}>` (`display: contents` in `ui.css`, so the wrapper is
invisible to `.gn-board-card__moves`'s own flex layout — no visual change to the arrows or notice
placement), and a `useEffect` watching `[refusal, serverRefusal, transportError]` calls
`noticeRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' })` exactly when something is
about to render AND the triggering attempt's source was `'drop'`.

- **13.515** ✅ Drops a card onto an undeclared column (the refusal path, reusing `13.508`'s own setup) and
  asserts `scrollIntoView` — a `vi.fn()` stub, since jsdom 25 implements no `scrollIntoView` at all
  (confirmed empirically: a bare jsdom element throws `is not a function`) — was called exactly once, with
  `{ block: 'nearest', inline: 'nearest' }`. — (`packages/app-core/src/views/board.tsx`,
  `packages/app-core/test/views/board-drag-drop.test.tsx`)
- **13.516** ✅ THE PAIRED NEGATIVE, proving the DISCRIMINATION itself rather than only the drop side: an
  arrow click that reaches a real notice (`board-moves-ui.test.tsx`'s own `13.504` transport-failure
  fixture — an arrow click can never reach the CLIENT-side `refusal` notice, Task 13's own unrelated
  constraint, so any real notice reached via an arrow proves the point equally well) must NOT call
  `scrollIntoView`. `13.515` alone would still pass an implementation that scrolled on every notice
  regardless of source; this is what rules that out. — (same files)

**Both mutation-witnessed.** (1) The `scrollIntoView` call itself removed: reddened exactly `13.515`
(`AssertionError: expected "spy" to be called 1 times, but got 0 times`), `13.516` untouched (still nothing
to assert against). (2) The `lastAttemptSourceRef.current !== 'drop'` guard removed (scroll fires
regardless of source): reddened exactly `13.516` (`Number of calls: 1`, expected `0`), `13.515` untouched
(still correctly called once on its own drop). Both reverted; the 9-case file re-confirmed green
afterward.

## Ruling 29 — `13.512` asserts the contract, not one spelling of how it fails to match (coordinator, 2026-09-16)

See `13.512`'s own AMENDED bullet above for the fix and its mutation witness (both directions: the amended
assertion still catches a real regression, `draggable={true}` unconditionally, AND stays green under the
phantom `draggable={arrows !== null ? true : undefined}` mutation the OLD assertion would have wrongly
reddened on — verified by literally restoring the old assertion text against that same phantom mutation and
watching it fail, not merely reasoned about).

**Every outcome-dispatch case (`13.507`–`13.509`) and the `dragover` mechanism case (`13.510`) is
mutation-witnessed, not merely passing once.** Two mutations, each applied via a targeted `Edit`, run
against the 6-case file, then reverted via a second targeted `Edit` restoring the exact original text
(confirmed by re-reading the diff, not assumed):

1. `handleDrop`'s `if (attempt !== undefined) attempt(toStateId);` changed to `if (false && attempt !==
   undefined) attempt(toStateId);` — predicted to redden exactly the three cases that depend on
   `attemptMove` actually firing. Result: `PASS (3) FAIL (3)`, the failing set exactly `13.507`/`13.508`/
   `13.509`, the other three (`13.510`–`13.512`, none of which depends on the registry call firing)
   untouched.
2. `onDragOver`'s handler changed from `(event) => event.preventDefault()` to a no-op `(_event) => {}` —
   predicted to redden exactly `13.510`. Result: `PASS (5) FAIL (1)`, the sole failure `13.510` with
   `AssertionError: expected true to be false`.

Both mutations reverted; the full 6-case file, plus the full 76-case pre-existing board suite
(`board-moves-ui.test.tsx`, `board.test.tsx`, `board-arrows.test.ts`, `board-moves.test.ts`), re-confirmed
green afterward (`PASS (82) FAIL (0)`).

**`packages/ui/test/components.test.tsx` — 1 case (`13.513`), a CSS-binding gate, the same shape
`inbox-css-binding.test.tsx` already uses for `gn-timeline__bar`.**

- **13.513** ✅ `.gn-board__card-slot[draggable="true"]` sets `cursor: grab` in `ui.css`. Proves only that
  the RULE exists with the right body — `13.512` above is what proves `draggable="true"` (and therefore
  this selector's match) actually tracks the `moves` capability rather than being always on or always off.
  — (`packages/ui/src/ui.css`, `packages/ui/test/components.test.tsx`)

**Why `cursor: grab` is NOT declared on `.gn-board-card` itself** (Ruling 15's own instruction was to add
it "beside the behaviour that makes it true", not where the spec's literal metrics table puts it) — two
independent reasons, either alone sufficient: (1) `.gn-board-card` still renders on the READ-ONLY path
(`moves` capability absent — session loading, signed out, or no capability wired at all), where the card
genuinely cannot be dragged, and a grab cursor there would be the exact "control that lies" shape Ruling
15 already named; `13.512` is the case that would have caught the alternative. (2) Case `13.464`'s own
`rule()` helper (`packages/ui/test/components.test.tsx`) matches the FIRST literal substring
`.gn-board-card {` it finds via a plain regex with no selector parser — any new rule whose selector text
happened to end in that exact substring, even a compound one like `.foo .gn-board-card { … }`, would
silently hijack `13.464`'s match and break a case this task never touched. `.gn-board__card-slot` contains
no `.gn-board-card` substring at all (`__card-slot`, not `-card`), so it cannot collide — checked by
inspection of the regex (`packages/ui/test/components.test.tsx`'s own `rule()`), not merely assumed safe.

**Two decisions recorded here rather than left for a reviewer to find, per the task's own instruction to
surface a stated decision rather than let it be discovered:**

- **Same-column drop.** Dropping a card back onto the column it is already in is refused like any other
  undeclared target — `transitionOptions` already excludes `toStateId === fromStateId`
  (`board-moves.ts`'s own docblock), so `moveOutcome` treats a same-column drop identically to any other
  wrong target, with no special case. Consistent with the plan's own "same four outcomes" instruction; not
  separately tested, since it is the same code path `13.508` already exercises for a different
  `toStateId`.
- **Where the refusal renders.** `MoveRefusalNotice` renders where `MoveArrows` already renders it — under
  the SOURCE card, in its origin column — never a second site near the drop point. Adding a second
  rendering site would be exactly the fork ("two products") this task exists to avoid, even though the
  rail is `overflow-x: auto` and the origin column can in principle be scrolled out of view by the time the
  drag lands elsewhere. Left as-is, named rather than silently accepted.

**Keyboard reachability — proven unaffected, not merely assumed.** `board-moves-ui.test.tsx` (the arrows'
own 8-case suite, `13.498`–`13.505`) runs UNCHANGED and stays green — this task edited no assertion, no
`aria-label`, no `disabled` logic in that file (confirmed: `PASS (9) FAIL (0)` on that file alone,
unmodified). `draggable` is a plain HTML attribute; it adds no tabstop, no ARIA role, and no accessible-name
change, so the `‹ ›` arrows remain the complete keyboard path they were before this task — drag-and-drop is
a pure addition, never a replacement.

`tsc -p tsconfig.typecheck.json` clean on `packages/app-core` AND `packages/ui` (Node `v22.23.2`). Full
`packages/app-core` suite: 1272 tests green; full `packages/ui` suite: 310 tests green; full `apps/web`
suite: 363 tests green (`tsc` clean there too — `tsconfig.json` and `tsconfig.e2e.json` both). `pnpm turbo
run typecheck` and `pnpm turbo run test` both green across all 17 packages. `node scripts/check-case-ids.mjs`
re-run after minting `13.507`–`13.513`: sum rose from 2047 to 2054 (+7) and union rose from 2044 to 2051
(+7) — the same delta, so the pre-existing `13.387`/`13.413` duplicates are unchanged and no new duplicate
was introduced.

## Final whole-branch review, fix wave (2026-09-16) — Findings 1–5

The whole-branch review ("I would merge this, with Findings 1 and 2 fixed first") returned five
findings. **Case `13.517` minted here** for Finding 1, the one that changes tested behavior; Findings
2, 4 and 5 are prose/citation corrections with no new case; Finding 3 changes an exported string
constant (covered by existing cases that read the constant rather than a hand-typed copy of it, so no
new case is needed there either — see `board.test.tsx`'s own docblock on why `EMPTY_COLUMN_COPY` is
exported in the first place).

- **13.517** ✅ **Finding 1 — the Filters sheet's five non-`text` axes were undisclosed on the three
  non-board tabs.** The mirror note (Ruling 10, `13.439`/`13.444`) was gated on
  `activeFilterChips.some((chip) => chip.key === 'text')` — accurate when `text` was the only axis with
  a control, silently inert on `assigneeIds`/`typeIds`/`stateIds`/`stateCategories`/`projectIds` once
  Task 5's Filters sheet reached them onto the same page-level `filter` from every tab. Open Filters on
  List, tick an assignee, press Done: the list did not change, and nothing on screen said so — the same
  one-axis-enumeration defect `buildBoardFilterChips` was already rewritten to stop repeating for the
  strip eight lines above, recurring in the note eight lines below it.
  **Fixed by widening the gate to `activeFilterChips.length > 0 || boardUnappliedAxes.length > 0`** —
  the SAME two terms the strip's own three-term gate reads (never its third, `shown !== total`, which is
  a fact about the BOARD's own render and meaningless on a tab the board never touches).
  `activeFilterChips` already enumerates all six `BoardFilterSpec` axes; `boardUnappliedAxes` covers the
  three the board itself cannot evaluate either — between them every axis `filter` can carry is covered.
  **The sentence itself was also generalised, and deliberately does not say "the board only":** a
  `filter` set to only a `boardUnappliedAxes` entry (`collaboratorIds`/`dueBefore`/`dueAfter`/`fields`)
  narrows nothing on the board either, so claiming "the board only" would overclaim exactly there — the
  new copy, "Filters set here are not applied on this tab.", names only what the page can know for
  certain under every combination that trips the gate.
  Drives the REAL path — the Filters sheet's own Assignee checkbox, not a `setFilter` shortcut — on the
  List tab, and asserts the List tab's own render is untouched (the axis has no control anywhere else,
  which is precisely why the note is the only disclosure available). **Mutation-witnessed**: reverting
  the gate to the old `chip.key === 'text'` check reddened `13.517` alone — `13.439`/`13.444` (both
  driven by a real search TERM, which still trips the old gate) stayed green — confirming the new case
  discriminates rather than merely existing. Reverted with a targeted `Edit`, confirmed byte-identical by
  SHA-256 checksum (not `git diff` — this repo has a recorded case of `git diff` reporting identical for
  differing files). — (`apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx`,
  `apps/web/test/board-narrowing.test.tsx`)

**Finding 2 — 34 stale line-number citations swept**, all introduced by this branch's own edits shifting
content the citations pointed at. Six in shipped source (`page.tsx:342`, `board-search-scope.ts:59`,
`ui.css:336`/`:718`/`:1906`, `board.tsx:1043`), the rest across `Features.md`, this file, the spec and
the plan, plus two more found in `board-narrowing.test.tsx` itself by an exhaustive repo grep that the
review's own summary count had missed. Every citation whose target still exists in the file (just moved)
was re-pointed to its real current line, verified by opening the file there rather than computing an
offset. Five citations of `board.tsx:70` name a gate (`board.groups.length === 0` as the sole
`EMPTY_BOARD_COPY` condition) that Ruling 19/R6 SUPERSEDED rather than merely moved — re-pointing those
to a "current" line would have manufactured a second falsehood that reads as freshly checked, so they
are marked `(pre-R6)` instead, left without a specific present-day line. One citation
(`transition-dialog.tsx:128`) named an inline predicate later extracted to `field-claims.ts:55`
(Ruling 25) — a cross-file re-point, not a number bump. Full table in
`.superpowers/sdd/2026-09-16-board-prototype-port/final-fix-report.md`.

**Finding 3 — `EMPTY_COLUMN_COPY`'s docblock corrected, and "yet" dropped.** The docblock justified the
unconditional per-column copy on "the narrowing pass... runs above this component... with data this
component was never given" — no longer true since Ruling 19 gave `Board` an `isNarrowed` signal; `Board`
simply does not thread it down into `BoardGroupSection`. Docblock now says exactly that: the shell can
disclose narrowing (it does, via the strip), `Board` itself now could too, but the wiring the rest of the
way stops one level short — a deferred follow-up, not a structural impossibility. **"Yet" dropped**: `No
tickets in this column yet.` reads, under an active filter, as asserting none were ever created — chosen
because it reads better once the reason it might be empty is no longer "definitely none ever existed".
No test hand-types the string (all reference the exported constant), so no case needed updating.

**Finding 4 — page.tsx docblock hedged.** "Counting it [`workflowChip`] here too would not change the
gate's answer in any case" was false for one constructible case: a workflow with its own cards picked
while an empty SIBLING group is dropped leaves `shown === total` with the other two terms already zero,
so the strip stays closed though the picker is non-default — counting `workflowChip` there would open it.
The invariant the gate exists for still holds (no card is ever hidden without disclosure) and the
`<select>` keeps showing the pick regardless, so nothing is lost; the docblock now says so instead of
claiming a certainty that does not hold.

**Finding 5 — this file's own `13.505` narrative said "checked four ways" while listing five assertions
and the code has five** (`13-deployment-dogfooding.md:5424`, above). Corrected to "checked five ways".

`node scripts/check-case-ids.mjs` re-run after minting `13.517`: only `13.387`/`13.413` remain as
duplicates (pre-existing, unrelated to this fix wave, carried since before Task 3 — see the "Case-id fix"
entry in `.superpowers/sdd/2026-09-16-board-prototype-port/progress.md`). Verified by ID, not by count.

## The whole card opens the ticket (owner request, 2026-09-17)

Before this, only the title button on a board card opened the ticket sheet; the owner asked for a click
anywhere on `.gn-board-card` to open it, "but take care that dragging the ticket does not open it". The
listener lives on the `<li class="gn-board__card-slot">` wrapper — extracted into `BoardCardSlot`
(`board.tsx`) so it can hold a ref — never on `Card` (`packages/ui`, documented "never itself
interactive") and never as a `role="button"` (the card already contains buttons). The title stays a real
`<button>`: the keyboard path and the accessible name are unchanged. Two bail-outs, both proven by
deletion below: a click whose target sits inside a control or inside the `TransitionDialog` subtree
(`CARD_CLICK_BAIL_SELECTOR`) is that thing's click, and a click that follows `dragstart` is the tail of a
drag. The flag clears on the NEXT `mousedown`, not on `dragend` (which precedes any stray click the same
gesture could produce) and not on a timer. Suite: `packages/app-core/test/views/board-card-click.test.tsx`
(6 cases), `packages/ui/test/components.test.tsx` (`13.523`). All under Node v22.23.2.

- **13.518** ✅ A click on the card body itself (`.gn-board-card`, no `moves` wired — the read-only path)
  calls `onOpenTicket` exactly once with that ticket's id.
- **13.519** ✅ A click on the title button still opens the ticket EXACTLY ONCE. The button's own `onClick`
  opens it and the click then bubbles into the slot's listener; the `closest()` bail is what stops a
  second open. Mutation M2 (bail deleted) → this case fails with 2 calls.
- **13.520a** ✅ A click on the provenance toggle unfolds it (`aria-expanded="true"`) and does NOT open the
  ticket. M2 → fails.
- **13.520b** ✅ A click on a live `›` arrow submits the move (`onMoved` called) and does NOT open the
  ticket. M2 → fails.
- **13.521** ✅ THE GUARD THE REQUEST IS ABOUT. `mousedown` → `dragstart` (real `DataTransfer` stand-in,
  the same one `board-drag-drop.test.tsx` documents) → `click`: swallowed, zero calls. Then a fresh
  `mousedown` → `click`: opens once — the positive control for the first half. Mutation M1 (the
  `draggedRef` check deleted) → first half fails; mutation M3 (the `mousedown` reset deleted) → second
  half fails with `expected 1, got 0`. Native drag-and-drop withholds `click` after a completed drag in
  every browser this product targets, so in the field this is belt-and-braces; in jsdom, which drags
  nothing, it is the only observable proof.
- **13.522** ✅ THE HAZARD THAT ONLY EXISTS BECAUSE THE DIALOG RENDERS INSIDE THE CARD: `MoveArrows`
  mounts `TransitionDialog` under the card and `Dialog` (`packages/ui`) does not portal; its scrim closes
  the dialog on click WITHOUT stopping propagation. Reached through a REAL arrow click on a workflow
  whose `todo → doing` edge requires a comment (`WF_GATED`), then a click on `dialog-scrim`: the dialog
  closes and `onOpenTicket` is NOT called. M2 → fails (the sheet would open as the dialog closed).
- **13.523** ✅ CSS binding, `packages/ui/test/components.test.tsx`: the bare `.gn-board__card-slot` rule
  sets `cursor: pointer` (a card that can be opened but not dragged — the read-only path — looks
  clickable) AND `.gn-board__card-slot[draggable="true"]` still sets `cursor: grab` (`13.513`'s own
  assertion, repeated here because the new bare rule sits immediately above it and loses on
  specificity by design). Watched fail RED with `no rule for .gn-board__card-slot` before the rule
  existed.

Mutation results, `board-card-click.test.tsx`, each run against a scratchpad backup and restored
byte-identical (`cmp`): M1 kills `13.521` only; M2 kills `13.519`, `13.520a`, `13.520b`, `13.522` and
nothing else; M3 kills `13.521` only. `13.518` survives all three, as it should — it is the positive
case none of the guards touch. Full `app-core` suite 1281/1281, `ui` 311/311, `apps/web`
`board-narrowing` + `filters-sheet` 34/34, `app-core` typecheck clean, Node v22.23.2.

Known limit, named rather than hidden: selecting text inside a card body by mouse-drag on the READ-ONLY
board (where the slot is not `draggable`, so no `dragstart` fires) ends in a `click` and opens the ticket.
The title is a button and the meta chips are short, so there is little to select; no guard was added for
it because jsdom has no honest way to fail such a case.

Citations displaced by this change set, re-pointed against the current tip (Ruling 30's own method —
opened the file, never added an offset): `BoardCardSlot` and its docblock land ABOVE `BoardCardView`, so
`<Card className={card.pending …}>` moved `board.tsx:650` → `:719` (`Features.md`, this file's Task 6
narrative, the port plan `:751`); the bare `.gn-board__card-slot` rule and its comment add five lines to
`ui.css`, so `.gn-timeline__weeks` moved `ui.css:1934-1937` → `:1939-1942` (this file, the Ruling 21
narrative). Every other `ui.css` citation past `:514` was checked against HEAD and found ALREADY stale
before this change (e.g. `ui.css:1321` cited as "sets `font-size: 1rem`" points at `cursor: pointer;`);
left untouched — not this change's drift, and a blind `+5` would have moved wrong numbers to different
wrong numbers. `scripts/check-case-citations.mjs` reports `13.401`/`13.476`/`13.477`/`15.26` uncited —
all four already uncited at HEAD (`git grep` on the tests at HEAD finds none), pre-existing on this
branch and not touched here; the six new cases are each cited by id in their test file.

## Move arrows: one declared target moves, several ask (owner request, 2026-09-17)

Owner's words: "The next button: this needs care, as the ticket may be able to move to different columns.
If multiple paths exist for the column, on clicking next, it should open up a modal to select which. Also
this modal will be used if any comments/attachments required rules are there on the workflow." Rulings
taken in the brainstorm: `›` offers forward targets only, `‹` backward only (symmetric); a single target
that carries a rule opens the dialog ALREADY AIMED at it. Task 13 shipped the arrows on `arrowTarget` —
the NEAREST declared target — so `WF_ERRAND`'s `doing` (forward: `waiting`, then `done`) silently took
`waiting` and `done` was unreachable by arrow at all. Now `arrowTargets` (the same walk, kept in full;
the singular is defined as its head) drives each arrow: one entry → `attemptMove`, unchanged; several →
`TransitionDialog` as a picker over exactly those (`offerStateIds`), aimed when one (`initialToStateId`).
`MoveArrows` mounts the dialog only while its `dialog` state is non-null — a fresh mount per open.
Suites: `board-arrows.test.ts`, `transition-dialog.test.tsx`, `board-moves-ui.test.tsx`,
`board-drag-drop.test.tsx`. Every case watched RED first (the plural "is not a function", the picker
labels absent, the dialog on "Choose a state" with three options). Node v22.23.2 throughout.

- **13.524** ✅ `arrowTargets(WF_ERRAND, order, 'doing', 'next')` is `['waiting', 'done']` — nearest
  first — and `arrowTarget(...)` equals its head, asserted as `toBe(arrowTargets(...)[0])` so a second walk
  that disagreed would fail here by name.
- **13.525** ✅ Backward from `done`: `['doing', 'todo']` — `waiting` between them is NOT declared from
  `done` and is skipped (`13.494`'s skip, in list form); the wildcard `* → todo` is included, after the
  nearer exact edge.
- **13.526** ✅ `[]` wherever the singular answered `null`: nothing declared that way (`todo` previous,
  `done` next) and a column the def does not know.
- **13.527** ✅ `TransitionDialog` with `offerStateIds: ['waiting', 'done']` from `doing` offers EXACTLY
  `Waiting on counterparty, Done` in declaration order; `To do` (declared via the wildcard, but not
  offered) is absent. Mutation M4 (the filter replaced by `() => true`) → fails.
- **13.528** ✅ `initialToStateId: 'done'` opens with the trigger reading `Done` (not "Choose a state"),
  the comment box already on screen, Move disabled until it is filled; filling and pressing Move hands
  back `{ toStateId: 'done', comment: 'shipped', fieldValues: {} }`. M5 (`useState('')`) → fails.
- **13.528b** ✅ The control: neither prop → placeholder and all three options, exactly as before.
- **13.529** ✅ THROUGH THE BOARD. Card in `doing`; `›` is enabled and named "Move to next state —
  Waiting on counterparty or Done"; the click opens the dialog on "Choose a state"; the select lists
  exactly `[Waiting on counterparty, Done]` and NOT `To do`; picking the rules-free one and pressing Move
  ingests ONE `ticket.transitioned` with the shipped `{ to: 'waiting' }` and calls `onMoved`. M4 → fails
  (`To do` appears); M6 (several targets take the nearest, Task 13's behaviour restored) → fails (no dialog,
  a direct submit instead).
- **13.530** ✅ `‹` MIRRORED — on a def built so the negative can fail. From `WF_ERRAND`'s `done` every
  declared target is backward, so "offers only the backward ones" passed under M4 in the first draft of
  this case (measured; a check that could not fail). Rebuilt on `WF_ERRAND` + `waiting → done`, card in
  `waiting`: `‹` reads "Move to previous state — Doing or To do", the picker offers `Doing`/`To do` and
  NOT `Done`, which `transitionOptions` does declare from `waiting`. M4 → fails; M6 → fails.
- **13.531** ✅ ONE gated forward target (`todo → doing` with `require-comment`, `13.501`'s idiom): the
  arrow keeps its plain name "Move to Doing"; the dialog opens with the trigger reading `Doing` and the
  comment box visible with NO pick; typing and Move ingests `{ to: 'doing', comment: { text } }`. M5 →
  fails. `13.501`'s docblock, which said the dialog was NOT pre-aimed, is corrected; its re-pick of "Doing"
  is kept deliberately — it now proves the select is live over a one-entry offer, not a dead control.
- **13.532** ✅ A cancelled pick does not survive into the next open: pick `Done`, Cancel, click `›`
  again → "Choose a state". Before, the dialog stayed mounted while closed and its `toStateId` state
  survived. M6 → fails (the second `›` never opens a dialog).
- **13.533** ✅ (in `13.509`'s own case) A DROP on the gated `doing` column opens the dialog aimed at
  `doing`, comment box on screen — "what the gesture meant" for the drop path. M5 → fails.
- **13.534** ✅ THE FLAKE MADE DETERMINISTIC. While gating this work on a machine at load average 11.5,
  `13.507`, `13.514` and `13.515` each failed once, in separate runs, with one signature: the drop did
  NOTHING — no `onMoved`, no notice of any kind in the DOM dump, the case dying at `waitFor`'s 1000 ms
  (1070/1068/1025 ms measured against ~20 ms for a pass). Mechanism: `settled()` returns when the arrows
  are IN THE DOM (a MutationObserver microtask), while the drop registry was filled by a PASSIVE effect
  React schedules as a later macrotask for a render a promise resolution triggered; under load the drop
  could look before the effect ran, and `13.511` documents that a drop with nothing registered is silent.
  This case fires the drop from INSIDE a MutationObserver callback of its own — the same microtask slot,
  never later — and failed 3/3 RED under `useEffect` (`expected [] to have a length of 1`), then passed
  3/3 under `useLayoutEffect`, which registers synchronously inside the commit that paints the card
  `draggable="true"`. Ruling 15 from the other side: an affordance the DOM shows is live the instant it
  is shown. Nothing else about the registration changed. The commit message's "React 19.2.8, no SSR
  warning" is from React 19's own changelog (the `useLayoutEffect`-on-the-server warning was removed),
  NOT measured here — vitest/jsdom is not SSR; the stronger reason no warning could fire is structural:
  `MoveArrows` mounts only after `useLiveQuery` resolves the workflow read, which never happens during a
  prerender.

Mutations (scratchpad backups, restored byte-identical by `cmp`): M4 kills `13.527`, `13.529`, `13.530`;
M5 kills `13.528`, `13.531`, `13.533`; M6 kills `13.529`, `13.530`, `13.532`. Gate after the last edit:
`app-core` 1292/1292 twice in a row, `ui` 311/311, `apps/web` 364/364 (the whole suite), both typechecks
clean, Node v22.23.2.

Citations displaced and re-pointed against the tip: `TransitionDialogProps` gained two documented props
(+21 lines) and the component two lines of destructuring and two of filtering, so `transition-dialog.tsx:158`
→ `:183` and `:232` → `:257` (Task 12 narrative, above), `:286-289` → `:311-314` (Task 13 narrative and
`board.tsx`'s own `submitFromDialog` docblock). `board-moves.ts:67`'s wrapped `transition-dialog.tsx: 241-248`
(the restrict-to notice) was ALREADY stale at HEAD — that notice sat at `:271` before this change — and is
left alone for the same reason as the `ui.css` ones above.

Named, not absorbed: the board path still passes `ticketFields={{}}` / `moveOutcome(…, {})`, so
`require-field` is always treated as unmet there (`MoveArrows`'s own docblock, "the conservative reading of
an honest absence"). `BoardCard` carries no field claims; fixing it needs data the board does not have.

## The whole card opens the ticket — the portal the first pass missed (review, 2026-09-17)

Advisor review of the two change sets above raised what the six cases in `board-card-click.test.tsx`
could not see: `Select` (`packages/ui`) portals its dropdown panel to `document.body`. React synthetic
events bubble through the REACT tree, so a click inside that panel reaches `BoardCardSlot`'s `onClick`;
`closest()` walks the DOM, where the panel's ancestors are itself and `body`, and can match nothing in
`CARD_CLICK_BAIL_SELECTOR`. And `13.529` had just made that dropdown the primary path for a multi-target
move. Measured before designing anything, in three cases (same file):

- **13.535** ✅ THE FACT: with the picker's dropdown open, `listbox.closest('.gn-board__card-slot')` is
  `null`. Established rather than assumed; the next two rest on it.
- **13.536** ✅ An OPTION click does NOT open the ticket — and not because of anything in
  `BoardCardSlot`: react-aria's `usePress` (behind `useOption`) stops the synthetic `click`, so it never
  arrives. Named as the positive control it is. Deleting the `contains` guard leaves it green; deleting
  `closest()` fails it at the `›` ARROW click on the way in, never at the option.
- **13.537** ✅ THE CLICK THAT DOES ARRIVE: `.gn-select__panel` carries `0.25rem` of padding (`ui.css`),
  plain DOM with no press handling. A click there — the dropdown's edge, its scrollbar gutter — bubbles up
  through the portal to the slot. First run: GREEN with no new guard, which meant something else was
  bailing; found by reading the React tree, then PROVED by mutation: `Dialog`'s own
  `<section role="dialog" onClick={stopPropagation}>` (`packages/ui/src/components/dialog.tsx`) sits on
  the portal's React-parent chain and swallows the click on its way up. With that one line mutated to a
  no-op, `13.537` fails (`onOpenTicket` called) and `13.536` still passes (react-aria). That line exists
  for the scrim's sake, in another package; a card's click guard should not be correct only by courtesy
  of it. Guard added — `if (!event.currentTarget.contains(event.target as Node)) return;` ahead of the
  existing `closest()` bail — under the Dialog mutation as its RED: mutated Dialog + guard → 9/9 green;
  Dialog restored → 9/9 green; Dialog restored + guard deleted (M7) → 9/9 green, DOCUMENTED as expected:
  the guard's falsifier is the combined mutation, because two independent mechanisms now cover the same
  click. It names no library internals and catches any future portal from inside the card, whether or not
  a `Dialog` happens to sit above it in the React tree.

M1/M2/M3 re-run after the guard landed: M1 kills `13.521`; M2 kills `13.519`, `13.520a`, `13.520b`,
`13.522`, `13.536`, `13.537` (the last two at the arrow click on the way in); M3 kills `13.521` —
`contains` subsumed none of them, since every one of those targets is DOM-contained.

## Filters: exclude mode, reaching every tab (owner request, 2026-09-17)

The exclude-mode design (`docs/superpowers/specs/2026-09-17-filter-exclude-all-tabs-design.md`)
extends filter semantics to every tab by adding an `exclude` half to `FilterSpec`, eliminating the
need for per-tab filter variants. These eleven tasks build that capability from the vocabulary up.

- **13.538** ✅ `filter/id-axes.ts` — the two base rules (`narrowsTo`/`excludedBy`) and their any-of forms,
  plus `claimedDueDay`/`claimText` moved here unchanged; and `FilterSpec.exclude` typed as the same
  `IdAxes` the include half spreads in (a `@ts-expect-error` proves `text` has no exclude form).
- **13.539** ✅ `matchesFilter` honours `exclude` on all six id axes, after the include half; empty
  exclude lists exclude nothing; unassigned work survives an assignee exclusion; include+exclude on one
  axis = must match an include and none of the excludes. Mutation (the `typeIds` exclude line deleted)
  kills the type case and the composition case.
- **13.540** ✅ `BoardFilterSpec.exclude` is `BoardIdAxes` — `exclude.collaboratorIds` is a compile error
  (it would silently WIDEN the board: `excludedBy(list, [])` is never out).
- **13.541** ✅ `13.433`'s agreement corpus extended with eight exclude cases and a rejection control;
  mutation (the `stateIds` exclude line deleted) kills the `excluded state` case.
- **13.542** ✅ `matchesListRow` agrees with `matchesFilter` over one ticket rendered as a `ListRow` on 28
  cases spanning every axis it serves — the five id axes, text, both due bounds (inclusive; undated
  excluded), field clauses (string, number-as-text, mismatch, unknown) and the exclude half — with a
  rejection control. Mutations: `dueAfter` line → its case fails; `projectIds` exclude line → its case fails.
- **13.543** ✅ `ListFilterSpec` rejects `collaboratorIds` in both halves at compile time.
- **13.544** ✅ `toServerFilterSpec` throws `UnexpressibleFilterError('exclude', …)` naming the axes on any
  non-empty exclude; an empty object or empty lists pass through unrefused.
- **13.545** ✅ `withIdAxis` (`apps/web/src/filter-edits.ts`) — the one writer of either half of one axis:
  empty list → `undefined`, an exclude half with no defined axis → `undefined`; pure.
- **13.546** ✅ `buildFilterChips` (renamed from `buildBoardFilterChips`) emits `exclude.<axis>` chips
  labelled "Not assignee/type/state/category/project: …" directly after each axis's include chip, with
  `mode`; an exclude chip's × clears only that half (the include half survives, and vice versa); the last
  exclude axis removed collapses `exclude`; empty lists earn no chip. Mutation (clearExclude clearing the
  whole half) kills the only-that-axis case.
- **13.547** ✅ `describeUnappliedBoardAxes` names collaborator for `exclude.collaboratorIds` (once);
  `describeUnappliedListAxes` names collaborator only — due dates and fields are answered by the list.
- **13.548** ✅ `choiceMode` reads a value's half (include wins if both); `nextMode` cycles off → include →
  exclude → off.
- **13.549** ✅ `withCycledId` moves a value between halves through `withIdAxis`, collapses what empties,
  repairs a both-halves shape, and over a full three-click cycle never leaves a value in both halves;
  works on the `StateCategory`-typed axis. Mutation (exclude-half removal skipped) kills the repair case.
- **13.550** ✅ `TriStateChoice` — accessible names "X" / "X, included" / "X, excluded" via `aria-label`
  built from a required `label: string` prop (the brief's verbatim code used a visually-hidden sibling
  span instead; measured RED — the accname algorithm joins sibling contributions with a synthetic space,
  producing "Uma One , included", not the exact string). Fix round 1 (2026-09-17) split `label` out of
  `children`: `children` is optional `ReactNode`, defaulting to `label`, free to carry a person row's
  avatar beside the name — proven by a case rendering an `aria-hidden` avatar span plus a name span as
  children and confirming all three exact names still hold. `data-mode` as the only hook, SVG glyphs
  `aria-hidden`, no `aria-pressed`, `onCycle` on click, variant class accepted.
- **13.551** ✅ CSS binding: include = accent ground + accent text; exclude strikes the label and never
  names `--gn-danger`; the row variant keeps 2.75rem. (Fix round 1 dropped the `.gn-visually-hidden` case
  and rule — the naming mechanism it served was replaced by `aria-label` before this task shipped, leaving
  it an unconsumed utility; removed as YAGNI rather than left as a rule nothing calls.)
- **13.552** ✅ Through the real sheet, a person row's accessible name walks "Uma One" → "Uma One, included"
  → "Uma One, excluded" → "Uma One", `data-mode` following, no `aria-pressed`.
- **13.553** ✅ Excluding an assignee drops that card from the board under "1 of 2 shown" with a
  "Not assignee: Uma One" chip (and no include chip); the chip's × restores both cards and the strip goes.
  Mutation (`boardFilter.exclude` forced `undefined`) kills this, 13.554 AND 13.555 — the last only because
  its own `1 of 2 shown` precondition reads the narrowed board, not because it independently exercises
  Clear-all-clears-exclude — while 13.552 stays green (the name cycles regardless of board wiring).
- **13.554** ✅ A type chip excludes (bug card gone, "Not type: Bug"); a category chip reaches the excluded
  state and empties the one-column board honestly ("0 of 2 shown").
- **13.555** ✅ "Clear all" clears an exclusion through the real button, without closing the sheet;
  `13.460` extended: `FILTERS_SHEET_CLEARABLE_AXES` names `exclude` and `clearFilterAxes` resets it.
- **13.556a** ✅ (Task 9 fix round 1, coordinator Important finding) An EXCLUDED collaborator — the one
  axis `boardFilter.exclude` cannot carry at all — is disclosed ONLY by the scope note
  (`describeUnappliedBoardAxes` → `collaboratorsSet` reading `filter.exclude?.collaboratorIds`), never by
  a chip in either direction, and narrows nothing (both cards stay, "2 of 2 shown"). Two clicks (off →
  included → excluded) show the note naming "collaborator"; a third (excluded → off) clears it. Mutation
  (`filter.exclude` dropped from `boardUnappliedAxes`'s deps in `page.tsx`) kills the THIRD click's
  assertion specifically — that transition is the one where `filter.collaboratorIds` itself does not
  change (`undefined` on both sides), so it cannot ride along on a co-occurring change to a still-watched
  dependency the way the first two clicks do; the stale note ("Not applied on the board: collaborator.")
  survives instead of clearing.
- `13.447`/`13.448`/`13.451`/`13.452`/`13.460` updated for the control change (checkbox → button;
  `aria-pressed` → `data-mode`).
- **13.556** ✅ `listNarrowingWord`: undefined / "tickets in progress" / "your filters" / both joined.
- **13.556b** ✅ (controller ruling, Task 10 fix round 1, 2026-09-17) The scope note names its OWN tab, not
  always "the board": on the List tab, an excluded collaborator (`ListFilterSpec`'s one unanswerable axis,
  same as the board's) narrows nothing and earns no chip, and `board-scope-note` reads "Not applied on the
  list: collaborator." — both list rows stay on screen, the strip itself still renders. Mutation (hard-coding
  `tabNoun` to `'board'`) kills it — the note then reads "the board" while sitting on the List tab.
- **13.557** ✅ The search box narrows the List tab: the non-matching row drops, the strip shows the LIST's
  own count ("1 of 2 shown", never the board's 3), the text chip is there, the old mirror note's testid
  is absent, and `TicketList`'s summary reads "narrowed to your filters". Mutation (`rows={list.rows}`)
  kills it via its row-absence assertion; the same mutation also killed 13.517 and 13.560, which assert
  row absence too.
- **13.558** ✅ The Timeline draws from the narrowed rows at TICKET LEVEL; the Calendar shows the same
  count ("1 of 2 shown" on each; no mirror note). The strip's own count is `listNarrowing`'s alone and
  cannot distinguish a correct `dateInputs` from a stale one, so the real proof is a title check on the
  Timeline tab (left active after the loop): a due-only fixture ticket lands in `TimelineView`'s own
  `sideList` ("Undated or partially dated"), which renders `entry.title` regardless of a missing
  `startDate` — Calendar's own due-only marker does not render the ticket's title at all, so Timeline is
  the tab that can prove this at ticket level (Calendar's own assertion stays at the count level). The
  fixture needs `fields.dueDate`/`fields.title` as real `FieldClaim`s (`fieldClaim()`), not the top-level
  `ListRow.dueDate` convenience field alone — `dateClaimOf`/`titleOf` read `row.fields` verbatim and never
  look at it. Mutation (`dateInputs` from `list.rows`) kills it.
- **13.559** ✅ Clearing the term restores the row and removes the strip on the List tab.
- `13.517` FLIPPED 2026-09-17 (see its own bullet above): an assignee picked in the sheet now NARROWS the
  list (the row assigned to someone else drops) and discloses through the strip; the note it asserted is
  gone along with the mechanism it disclosed.
- **13.560** ✅ An EXCLUDED assignee drops the row assigned to them on the List tab, "Not assignee" chip shown.
- **13.561** ✅ The create dialog's parent picker still offers a ticket the filter dropped — `parentCandidates`
  reads the unnarrowed rows. Passes unchanged before this task's implementation lands (`parentCandidates`
  already read unnarrowed `list.rows`) — a regression guard against a future narrowing reaching it, not a
  TDD RED/GREEN case for this task's own code.
- `13.439`/`13.444` retired (their subject — the mirror note — no longer exists); their numbers stay unused.

**Task 11 — final gate, catalogue checks, citation sweep, spec amendments (2026-09-17).** Node
`v22.23.2` for every command below (`source ~/.nvm/nvm.sh && nvm use 22`, printed once per shell and
re-confirmed before each run).

*Gate (all EXIT 0):* `packages/app-core` — `pnpm exec vitest run`: **1353 passed (1353)**;
`pnpm run typecheck`: clean. `packages/ui` — `pnpm exec vitest run`: **314 passed (314)**.
`apps/web` — `pnpm exec vitest run`: **405 passed (405)**; `pnpm run typecheck`: clean. `apps/server`
— `pnpm run typecheck` (`tsconfig.typecheck.json`): clean.

*Catalogue checks:* `node scripts/check-case-ids.mjs` — real sweep 2106 sum / 2103 union across 12
files; the only duplicates are `13.387` (three citations) and `13.413` (two), the known baseline,
unchanged by this plan. `node scripts/check-case-citations.mjs` — 1997 checked ✅ ids across 12
files, 1976 cited, 21 uncited; this file's own count is 444 cited / 3 uncited / 447 total, and the
three uncited ids are exactly `13.401`, `13.476`, `13.477` — the pre-existing baseline, and every
✅ id this plan minted (`13.538`–`13.561`, `13.556a`, `13.556b`) is cited. The ratchet also reports
regressions in `03-foundation-ledger.md` (1), `10-workflow-builder.md` (15),
`11-calendar-notifications.md` (1) and `15-in-app-help.md` (1) — pre-existing, in files this plan
never touched, left as found per the dispatch brief.

*Mutation summary, one line per task, read from each task's own catalogue entry:*

- **Task 1** (`13.538`) — type-level only: an `@ts-expect-error` on `exclude.text` and `BoardIdAxes`'s
  `Pick` stand in for a mutation; no runtime mutation is cited.
- **Task 2** (`13.539`) — deleting the `typeIds` exclude line kills the type case and the
  include+exclude composition case.
- **Task 3** (`13.540`–`13.541`) — `13.540` is compile-time (`exclude.collaboratorIds` on
  `BoardFilterSpec` is a type error, no runtime mutation); deleting the `stateIds` exclude line kills
  `13.541`'s excluded-state case.
- **Task 4** (`13.542`–`13.543`) — deleting the `dueAfter` line fails `13.542`'s due-bound case;
  deleting the `projectIds` exclude line fails `13.542`'s project-exclude case; `13.543` is
  compile-time (no runtime mutation).
- **Task 5** (`13.544`) — no mutation cited; the refusal is asserted directly against the exact axes
  named in the thrown error.
- **Task 6** (`13.545`–`13.547`) — mutating `clearExclude` to clear the whole half instead of one axis
  kills `13.546`'s only-that-axis case; `13.545`/`13.547` cite no mutation.
- **Task 7** (`13.548`–`13.549`) — skipping the exclude-half removal in the repair step kills
  `13.549`'s repair case; `13.548` cites no mutation.
- **Task 8** (`13.550`–`13.551`) — no mutation cited; verified instead against the brief's own
  rejected mechanism (the visually-hidden sibling span), which measured RED with the exact wrong
  string before the `aria-label` fix.
- **Task 9** (`13.552`–`13.555`, `13.556a`) — forcing `boardFilter.exclude` to `undefined` kills
  `13.553`, `13.554` **and** `13.555` (the last only because its own "1 of 2 shown" precondition reads
  the narrowed board, not because it independently exercises Clear-all); dropping `filter.exclude`
  from `boardUnappliedAxes`'s dependency list in `page.tsx` kills `13.556a`'s THIRD-click assertion
  specifically (the transition where `filter.collaboratorIds` itself does not change).
- **Task 10** (`13.556`, `13.556b`, `13.557`–`13.561`, `13.517` flipped) — hard-coding `tabNoun` to
  `'board'` kills `13.556b` (the note then names the board while rendered on the List tab); reverting
  `dateInputs`/the tab's rows source back to `rows={list.rows}` (unnarrowed) kills `13.557` via its
  row-absence assertion, and the SAME mutation also kills `13.517` and `13.560`; sourcing
  `dateInputs` from `list.rows` instead of the narrowed rows kills `13.558`. `13.556` and `13.559`
  cite no mutation; `13.561` is an explicit regression guard, not a TDD case, and was green
  unmodified.

*Citation sweep (`git diff --stat 5c8d1bd6..HEAD`'s seven touched basenames, grepped per the brief's
exact command against `Features.md`, `test-cases/`, `docs/superpowers/specs/`,
`packages/*/src`, `apps/web/src`, `apps/web/app`):*

- **Re-pointed** (correct at `5c8d1bd6`, displaced by this plan, fixed by direct read at HEAD, never
  by offset arithmetic): `page.tsx`'s own docblock citing `mappers.ts:838-853` → `:855-870`, and the
  adjacent self-citation of its own `:180-184` → `:187-191` (both shifted by the Task 5 exclude-refusal
  block inserted above them); the 2026-09-17 spec's own `mappers.ts:836-859` → `:837-876` and
  `view-types.ts:159-200` (`ListRow`) → `:180-221` (shifted by the same refusal block and by `IdAxes`
  being declared above `ListRow`, respectively); the 2026-09-16 board-prototype-port spec's
  `view-types.ts:142-153` (the old single-block `FilterSpec`) → `:148-155` (the new standalone
  `IdAxes`, the type that actually carries the "plural" claim being made) and its
  `matches-filter.ts:25-56` → `:35-97` (the exclude checks appended to the function body).
- **`board-filter.ts`** — zero citations of this basename exist anywhere in the searched tree; nothing
  to check.
- **`ui.css`** — this plan's only edit is a pure append after line 3612 (the new
  `.gn-filters__choice[data-mode=…]` rules); every existing citation of `ui.css` in the searched tree
  targets a line at or below 2596, so none are displaced by this plan. Left unchanged.
- **Already-stale before this plan, left alone (not this plan's doing):** `page.tsx:1063` in this
  file's own Task-4-era Finding (`13.467`'s note) already pointed at unrelated tab-button code at
  `5c8d1bd6`, not the `<Board boardNarrowing.view>` handoff it describes; `mappers.ts:508` (cited
  twice from `data-source-gateway.ts`) and `mappers.ts:906` (`builder-wiring.tsx`) were already
  pointing at unrelated docblocks pre-plan; `view-types.ts:157`/`:180`/`:220` (`07-api-realtime-search.md`)
  and `:183`/`:165` (`index.ts`, `contest-view-model.ts`) were already wrong pre-plan; `page.tsx:129`
  and its four sibling line numbers in `12-offline-sync-apps.md` were already wrong pre-plan. None of
  these sit in a file this plan touched for its own reasons, and re-pointing them was out of this
  task's scope.
- **Historical narrative, left as written:** the earlier "Finding 2 — 34 stale line-number citations
  swept" paragraph above (2026-09-16, `board-prototype-port`) names `page.tsx:342` and
  `board-search-scope.ts:59` as citations it fixed at the time; and this file's own 2026-09-02
  planted-defect note names `mappers.ts:818`/`:822` and `view-types.ts:238`/`:239`. Both are frozen
  records of a past verification, not live claims about current code shape, so re-pointing their
  numbers to today's tip would misrepresent what those past events actually found — left as written,
  per the same reasoning `03-foundation-ledger.md`'s other pre-existing issues are left alone.

*Prose citations of pre-Task-6 names, re-pointed to the current names* (`board-search-scope.ts`,
`filters-sheet.test.tsx`, `board-narrowing.test.tsx`, `Features.md`): `buildBoardFilterChips` →
`buildFilterChips` and `shouldRenderBoardNarrowingStrip` → `shouldRenderNarrowingStrip`, each marked
"(renamed 2026-09-17)" where the surrounding sentence is itself historical (`board-narrowing.test.tsx:613`'s
workflow-picker docblock; `filters-sheet.test.tsx:502`'s Ruling 13 paragraph;
`board-search-scope.test.ts:93`/`:174`'s section headers), and left as a plain current-name swap where
the sentence is a live "see also" pointer (`filters-sheet.test.tsx:245`). The `describe(...)` titles at
`board-search-scope.test.ts:106`/`:185` are untouched — `13.442`/`13.443` are cited by those titles
verbatim, and the catalogue names them historically. `Features.md` (lines 75, 83, 85) had seven mentions
of the two pre-Task-6 names, all seven re-pointed, and every one of the seven carries the full
"(renamed 2026-09-17; was `...`)" annotation — none of them is a bare, unannotated swap, including the
two inside the live `- ✅` workflow-picker bullet at line 85. Commit `e282fa96`'s own message describes
two of those seven as plain renames with no annotation; that description is wrong — all seven carry the
annotation — and this paragraph, not the commit message, is the record. **Final review fix wave
(2026-09-17) correction: this paragraph itself previously undercounted — a seventh, bare mention (the
`13.443` gate-expression sentence on line 75, quoting `13.443`'s own unrenamed describe title) survived
the round this paragraph describes, contradicting its own "none of them is a bare, unannotated swap."
Now annotated, and the count above is the corrected seven, not the original six.** `apps/web/src/filter-edits.ts:7`'s
citation of "the `toggledArray` convention" (deleted in Task 9) is rephrased to name it as the collapse convention
`page.tsx`'s former `toggledArray` set, deleted 2026-09-17, with `withIdAxis` as its successor.

*Spec amendments* (`docs/superpowers/specs/2026-09-17-filter-exclude-all-tabs-design.md`, new
"Amendments during execution" section): (1) §4's accessible name is set via `aria-label` from a new
`label: string` prop, not a visually-hidden suffix span — the sibling-span mechanism measured
"Uma One , included" (a synthetic space between sibling contributions), so `.gn-visually-hidden` was
never shipped and `13.551` does not assert it; (2) §3's scope note names its own tab via `TAB_NOUN`, a
`Record` over the `view` union, so a fifth tab is a compile error rather than a silent `'board'`
fallback (`13.556b`); (3) §2's wire refusal is reachable today through `toServerPreferences`
(`online/mappers.ts:1018`, which maps every saved filter through `toServerFilterSpec`) for a saved
filter carrying `exclude` — no code path writes one yet, since the project page mounts no saved-filter
control, but whoever wires one owes it a catch/translate layer so the person sees a sentence about
what their filter cannot express, not `UnexpressibleFilterError`'s developer-facing string.
`toServerPreferences` builds a WHOLE-DOCUMENT PUT — one `.map()` over every `SavedFilter` feeds a
single request body that also carries `listColumns` and `grouping` for every project — so an uncaught
throw here fails the entire preferences save, not just the one filter; the follow-on catch/translate
layer must scope the failure to the one filter.

*Spec §8, named but not built, unchanged by this task:* server-side negation and plural axes on the
wire (worth doing only past the 2000-row cap); filter state in the URL (a separate change — today's
include-only filter isn't there either); date and field controls in the Filters sheet
(`matchesListRow` already answers both axes, so a future control narrows every tab without touching
the predicates); and State options' source moving from the board's rendered columns to the workflow
definitions, deferred to the backlog/closed change set's own spec.

## Backlog and closed (owner request, 2026-09-17)

*Owner's words (brainstorm, 2026-09-17): "lets have another status for tickets (this status is default
in all workflows) - backlog. have a separate tab for backlogs. so that board is only populated by
tickets which need to be in focus. another status on the other side should be closed. closed tickets
are also not shown on the board." Then: "backlog by default. and lets actually have closed be a flag
instead of a status. but you can only close a ticket in a terminal state. so that we can see the final
state of the ticket easily, and maybe even filter to see things." Then: "explicit reopen." Spec:
`docs/superpowers/specs/2026-09-17-backlog-and-closed-design.md`. Every task below is TDD with mutation.*

- **13.562** ✅ `statesWithBacklog` appends the one universal Backlog state (category open) after the
  declared states; `universalTransitions` declares Start (`backlog → initialStateId`) and Send-to-backlog
  from every declared NON-terminal state, no rules, and never from a terminal one; `transitionsWithBacklog`
  is the declared edges followed by the universal ones with declared rules intact; `stateCategoryOf(def,
  'backlog')` reads `'open'`; both helpers are pure — the def is never mutated. Mutation (dropping the
  `state.category !== 'terminal'` filter in `universalTransitions`) kills the "no edge from done"
  assertion — (`packages/domain/test/backlog.test.ts`)
- **13.563** ✅ `foldStateIdForward('backlog', …)` folds forward across a version that dropped a declared
  state, with no mapping required — the exemption is for backlog alone; a dropped DECLARED state with no
  mapping still refuses. Mutation (dropping the early-return in `foldStateIdForward`) kills the backlog
  case only — (`packages/domain/test/backlog.test.ts`)
- **13.564** ✅ `validateWorkflowDef` refuses `backlog` as a reserved id — as a declared state and as a
  transition endpoint even when no state declares it — with the message "`backlog` is reserved — every
  workflow has it without declaring it."; a clean def carries no such issue —
  (`packages/domain/test/validate-workflow.test.ts`)
- **13.565** ✅ `ticket.created`'s `start` decides where a ticket is born: `'backlog'` lands it in the
  universal state (category open, `closed` null); `'focus'` and an absent `start` (a v1 event) both land
  it at the workflow's own initial state — absence must mean focus, not a new default, or an additive
  field would rewrite what every event before it meant. Mutation (`p.start === 'backlog'` →
  `p.start !== 'focus'`) kills the "no start → focus" case, and only that case —
  (`packages/domain/test/ticket-state.test.ts`)
- **13.566** ✅ `ticket.closed` records `{ actorId, at }` from the envelope into `TicketState.closed`;
  `ticket.reopened` clears it back to `null`; neither ever touches `stateId`. `TICKET_EVENT_TYPES` names
  both, so every replay reader that iterates it folds them —
  (`packages/domain/test/ticket-state.test.ts`)
- **13.567** ✅ `ticketCreatedPayload` accepts `start: 'backlog' | 'focus'` and its absence, refuses any
  other value; `ticketClosedPayload` and `ticketReopenedPayload` are `z.object({}).strict()` — an empty
  claim accepted, an extra key refused; both event types are registered on the ticket entity at version 1
  — (`packages/domain/test/ticket-events.test.ts`)
- **13.568** ✅ `checkTicketClosed` accepts closing a ticket sitting in a terminal state and refuses two
  ways: a non-terminal state names it (`close-requires-terminal`, `A ticket can only be closed from a
  terminal state; "Doing" is not one.`), and a second close on an already-closed ticket refuses
  `already-closed`; both are reachable through `evaluateEvent`. *Fix round 1 (review, Important 1):* a
  misfiled entity kind is REFUSED `malformed-payload` naming the kind, not silently accepted — the shape
  every sibling check already has (`transition.ts`, `workflow-rebind.ts`, `fields.ts`). Mutation (reverting
  the split guard to its original `env.type !== … || env.entity.kind !== 'ticket') return ACCEPT`) kills
  the misfiled-kind case only, and only that case — (`packages/rule-engine/test/close.test.ts`)
- **13.569** ✅ `checkTicketReopened` accepts reopening a closed ticket and refuses `not-closed` on one that
  is not, reachable through `evaluateEvent`. *Fix round 1 (review, Important 1):* a misfiled entity kind is
  refused `malformed-payload` naming the kind, not silently accepted, mirroring 13.568's mutation —
  (`packages/rule-engine/test/close.test.ts`)
- **13.570** ✅ A closed ticket's `ticket.transitioned` is refused `closed-ticket` ("This ticket is closed —
  reopen it first.") before any edge is looked at — proven not merely against a legal destination but
  against `move('nowhere')`, a destination that is not even a real state, which still answers
  `closed-ticket` rather than `unknown-state` (fix round 1, review, Minor 3: the earlier case proved the
  closed check beats one legal move, not that it runs before the workflow is consulted at all); after a
  `ticket.reopened` the same move is judged by the workflow again —
  (`packages/rule-engine/test/close.test.ts`)
- **13.571** ✅ The universal edges are legal through the real engine without being declared: Start
  (`backlog → initialStateId`) is accepted and a non-initial destination from backlog is still
  `illegal-transition`; Send-to-backlog is accepted from a non-terminal state and refused
  `illegal-transition` from a terminal one; the parent-terminal invariant counts a backlog child as open;
  and — controller ruling extending this task's brief — a declared wildcard edge (`from: '*'`) never
  resolves FROM backlog under `WF` (every state reachable via `* →` edges): `move('done')` from backlog is
  refused `illegal-transition` and only `move('todo')`, backlog's Start edge, is accepted. Mutation
  (reverting `statesWithBacklog(latest)` to `latest.states` for `toState`) kills the Send-to-backlog case
  with `unknown-state`; a second mutation (dropping the backlog-only branch in `transition.ts`'s edge
  resolution) kills the wildcard-from-backlog case by wrongly accepting `move('done')` —
  (`packages/rule-engine/test/transition-backlog.test.ts`)
- **13.572** ✅ `proj_tickets.closed_at` / `closed_by` (backlog/closed spec §3.1, 2026-09-17): a created
  ticket has both NULL; a `ticket.closed` fills both from the event (`closed_by` the actor, `closed_at`
  the event's server time); a `ticket.reopened` clears both back to NULL — proven through a real
  `ticket.created` → two `ticket.transitioned` → `ticket.closed` → `ticket.reopened` sequence, one
  `applyCommitted` per step, reading the row after each. `rowToTicketState` maps the pair to
  `TicketState.closed` and null to null. Mutation (`rowToTicketState` returning `closed: null`
  unconditionally) kills the second case only, and only that case —
  (`apps/server/test/projections/tickets-closed.test.ts`)
- **13.573** ✅ A card `assembleTicketCards` produces from a closed row carries `closed: { actorId, at }`;
  from an open row `closed: null` — both assertions in the same call, so a reader that answered `null`
  unconditionally cannot pass the closed half (backlog/closed spec §3.1/§3.3, 2026-09-17) —
  (`apps/server/test/read/ticket-cards.test.ts`)
