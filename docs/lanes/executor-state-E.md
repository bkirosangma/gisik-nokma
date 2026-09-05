# Lane E — live state (Plan 11: deployment & dogfooding, minus the live deploy)

**This file is Lane E's restart surface.** A Lane E session relaunched from
`gisik-nokma-lanes/dispatch-executor-E.md` recovers only what is written here. Refreshed at every task
boundary. It lives on the lane branch until that branch merges; once it merges, the next update branches
off `main`.

> **Shas in narrative prose below are facts about when they were written.** Verify anchors with
> `git branch --contains` — empty output means orphaned. `git cat-file` passes on reflog-only commits and
> will lie to you.

## Anchors — recounted 2026-09-06, at the sha named

| anchor | value |
|---|---|
| branch | `exec/23-plan11` |
| worktree | `/Users/kiro/my_projects/gisik-nokma-lanes/lane5-plan11` |
| merge-base with `origin/main` | `1394396` — **REBASED 2026-09-06**, was `1e372e3` |
| HEAD at last refresh | `0d9e24c` (verified reachable on `origin/exec/23-plan11`) |
| ahead of `origin/main` | **14**, 0 behind |
| tree state | clean |
| node | `v22.22.2` (`$HOME/.nvm/versions/node/v22.22.2/bin`), pnpm 9.15.0 |
| gate composition | **GREEN at the REBASED sha**: `EXIT=0`, `Tasks: 30 successful, 30 total`, `0 cached`, Node v22.22.2, 0 `Unsupported engine`, **248 files / 3285 tests**, `CHECK_ENV_EXIT=0`, no orphaned workers |

## ⚠️ CROSS-LANE HAZARD — `pgrep -f vitest` matches the PEER LANE SESSIONS, not vitest

**Reported to the controller 2026-09-06.** Every lane brief, and the controller's own gate procedure, says
to reap survivors with `pgrep -f vitest`. On this machine, today, that command returns **four PIDs, all of
them `comm=claude`** — lanes A, B, C and D's own sessions — and **zero vitest processes**. `pgrep -f`
matches the whole command line, and each lane session's command line embeds its brief, which contains the
word "vitest" in the piped-into-`head` rule. **A lane that follows the instruction literally kills the
other four lanes.**

Same class as the 2026-09-04 crash the instruction exists to prevent — a command that names one thing and
matches another — inverted: that one left workers alive, this one kills sessions that are not workers.

**Use this instead.** It requires the executable to actually be `node` AND the command line to mention
vitest:

```
ps -eo pid=,ppid=,comm=,args= | awk '$3 ~ /node$/ && $2 == 1 && index($0, "vitest") > 0 {print $1}'
```

**The `$2 == 1` is the controller's correction, and it matters more than the rest of this section.** My
first version omitted it, and it was wrong for a reason worth keeping: I wrote a FINDER ("which processes
are vitest") and called it a REAPER ("which vitest processes are abandoned"). Those differ by exactly the
orphan criterion — ppid=1, reparented to launchd — from the 2026-09-04 post-mortem. Without it, a lane
reaping after its own fast return kills a PEER'S LIVE GATE: the same shape as the finding above, one step
further along. My "negative control returns 0 rows" was true when measured and false minutes later, when a
peer started a 10-worker pool. **An absolute is a fact about a moment, and nobody holds the moment** —
including the person quoting that rule.

Verified three ways, not reasoned about:
- **negative control** — returned 0 rows at the moment of measurement (see the caveat above);
- **positive control** — a throwaway `node … /node_modules/vitest/dist/worker.js` IS matched, so the
  matcher is not vacuous. **This control earned its keep:** the first version of this awk had an
  unterminated character class and printed an *error* that read exactly like a clean empty result. Only
  the positive control separated "nothing there" from "the matcher is broken";
- **safety check** — all four peer session PIDs explicitly NOT matched.

## RULING P33 (controller, 2026-09-06) — the 18 deferred errands ARE Plan 11's work

**Received and binding.** The owner's instruction is the answer: *"aside from the actual deployments to
the servers, make sure every single thing is completed."* **A deferral carrying a file:line that names
Plan 11 IS Plan 11's work, whatever T1–T16's text says.** All six seam-1 adoptions confirmed as mapped
(HTTP-Origin, shutdown path, `LogOtpSender`, invite-issuance rate limiting, strict URL validation, the
lockfile assertion in the Docker build), and all seam-2/3 adoptions confirmed.

Two refinements to this lane's proposed defaults:

1. **The repo-wide test-cases↔test citation convention goes to LANE F, named** — not to "an owner".
   It is a convention rather than a deployment task, *and* it is the worst possible collision surface
   while five lanes are writing tests, so it belongs in the serial end-of-run passes after all merges.
   It is NOT dropped: the owner also said testing thoroughly done, and **a ✅ nobody can grep-check is
   exactly the drift this series exists to refuse.** Stream load/soak (7.35) stays 🚫.

2. **`/healthz` serves the DEPLOY SHA ONLY** — not the semver from `apps/server/package.json`, not
   dependency versions — and it stays **unauthenticated**, because App Platform's health probe and an
   operator verifying a rollout both need it without a session. **Record it at the handler as a
   deliberate, bounded disclosure**, in the same register as `{kind: 'restricted', id}`. If T1's text
   asks for more than the sha, the sha is what it gets, and the handler says why.
   *This also dissolves the `resolveJsonModule`/TS2732 trap: a sha comes from the environment or the
   build, never from a JSON import of `package.json`.*

The controller also accepted this lane's correction to its own override: **`contact@artsourced.in` binds
T15's `app.yaml` only**; a production domain in a code default or a unit test would be wrong. Recorded on
main as part of P33.

## Where I am in the sequence

**Seam 1 (PR 1) — the server's deployment surface. IN PROGRESS.**

| # | item | state |
|---|---|---|
| A0 | wire `registerAttachmentRoutes` into `app.ts` | **DONE — `b2682c6`.** Reviewer: no Critical/Important. 4 mutations, incl. the row mutation the reviewer ran itself |
| — | `.nvmrc` = 22, `engine-strict=true` in `.npmrc` | **DONE — `f621a8c`** |
| T5 | Dockerfiles + `node-pg-migrate` → `dependencies` + Lane B's two devDeps | **DONE — `a30496f`.** Both images BUILT: server 607 MB, web 241 MB |
| — | 25 MiB ceiling test timeout (controller-assigned) | **DONE — `bb174fe`** |
| T1 | config surface + `/healthz` **deploy SHA** (P33) + strict URL validation | **IN FLIGHT** — opus impl → opus review |
| T2 | CORS + rate limiting (**HTTP-Origin**) + invite-mint bucket | not started |
| T3 | error alerting hook | not started |
| T4 | SMTP magic-link sender + `LogOtpSender`'s two faults | not started |
| T5b | SIGTERM / shutdown path (inherited errand #2) | not started |
| T6 | `docker-compose.dev.yml`, five services, port **54330** | not started (LAST in seam) |

**Seam 2 (PR 2) — T7 seed plumbing · T8 Convenience Corner mapping · T9 seed runner · T10 dev seed ·
T11 backups · T12 restore drill.** Not started.

**Seam 3 (PR 3) — T13 Playwright E2E vs compose · T14 extend the EXISTING `ci.yml` · T15 `deploy/do/`
spec FILE (write, do not apply) · T16 runbook + `Features.md` §13 + `test-cases/13`, HELD until T1–T15
have MERGED.** Not started.

## Schedule inside seam 1 — set by FILE OWNERSHIP, not task number

`config.ts` is touched by T1, T2, T3 and T4; `app.ts` by A0, T1, T2 and T3. So those five are **serial**:

    A0 → T1 → T2 → T3 → T4

**T5 (Dockerfiles + `.nvmrc` + `.npmrc`) is all-new files and runs CONCURRENTLY with that chain.**
**T6 runs LAST**, because `.env.example` must document everything T1–T4 added.

## Measurements taken this session — each one, and how

- **`registerAttachmentRoutes` has never been called.** `grep -rn` over `apps packages scripts`: the only
  `src/` occurrence is its own definition (`routes/attachments.ts:211`). Two test files register it by
  hand; `src/index.ts:38` and `test/notifications/fanout.test.ts:823` both DOCUMENT the unwired state in
  prose, and **both sentences become false in A0's commit.**
- **`app.register(asyncPlugin, deps)` from a SYNCHRONOUS builder works here.** Probed against this repo's
  own fastify (**5.12.1**), not assumed: a sync `buildApp`-shaped builder that calls
  `app.register(async (app, deps) => { await …; app.post(…) }, {pool, store})` answers **200** on
  `inject()`, `printRoutes()` lists the route, and the **negative control with the register line deleted
  answers 404**. This is the resolution for "`registerAttachmentRoutes` is `async`, `buildApp` is
  deliberately synchronous" — `register` defers the body to `ready()`, and `inject()`/`listen()` drive it.
  A floating `void registerAttachmentRoutes(...)` is the WRONG answer: Fastify refuses route registration
  once listening.
- **`buildApp(` direct call-site blast radius is 6 files, not ~60.** `apps/server/test/app.test.ts`,
  `auth/sign-in-flows.test.ts`, `events-route.test.ts`, `helpers/app.ts`, `notifications/fanout.test.ts`,
  `permissions/check-permission.test.ts`. 17 test files reach it through `buildTestApp`
  (`test/helpers/app.ts:104`). So adding a REQUIRED `store` to `AppDeps` costs 6 edits, not sixty.
- **T11 needs NO new dependency.** `@aws-sdk/client-s3`, `@aws-sdk/lib-storage` and `aws-sdk-client-mock`
  are already in `apps/server/package.json`. One less `pnpm-lock.yaml` conflict with lanes C and D.
- **`pnpm-workspace.yaml` globs are `packages/*` and `apps/*` only** — confirmed, so T13's root `e2e/`
  genuinely needs a third entry.
- **`.nvmrc` and `.npmrc` did not exist** at the repo root (`ls` errored on both). **Now landed at
  `f621a8c`**, and the flag was proved to BIND rather than assumed: node 22.22.2 + `engine-strict` → exit
  0; node 24.11.1 + `engine-strict` → exit 1; node 24.11.1 with the flag removed → exit 0. The third row
  is what attributes the failure to the flag rather than to node 24 breaking pnpm generally — without it
  the negative control proves only that *something* went wrong.
  **AND: that refusal is SILENT.** Under a wrong Node, pnpm 9.15.0 exits 1 and prints **nothing** — not
  stdout, not stderr, at `--loglevel=info` and `--reporter=append-only` alike, four settings probed. A CI
  log shows a bare non-zero exit with no explanation, and every natural reading of it (broken lockfile,
  registry down) is wrong. `.npmrc` carries that warning in its own comment, which is the only place a
  person debugging it will be looking. **Blast radius: lanes A–D inherit the flag when this merges**; they
  are unaffected under node 22 (`pnpm install --frozen-lockfile` re-run in this worktree with the real
  `.npmrc` in place: exit 0), and get the silent exit 1 under anything else.
- **`.github/workflows/ci.yml` EXISTS**, 208 lines / 10.7K, one `gate` job with a docs-only scope skip.
  T14 EXTENDS it. Do not recreate it.
- **`apps/server/test/node-version.test.ts` already asserts the running Node against root
  `engines.node` from inside a vitest worker** — and its docblock records that pnpm's
  `WARN Unsupported engine` NEVER fires for per-package scripts, because `engines` is declared only in the
  ROOT manifest. That is the existing half of the `.nvmrc`/`engine-strict` item; the new half is making
  the declared engine bind at INSTALL time.

## Two false-green surfaces in seam 1 — named so they are not rediscovered

1. **`.env.example`'s "LIVE TODAY" block enumerates `config.ts`'s zod schema by name, and
   `check:env` cannot catch it going stale.** The gate only checks that a variable READ by code appears
   *somewhere* in the file; a variable that moved from documented-ahead-of-its-reader to live passes
   either way. T1–T4 all add variables. **Update that block explicitly, and keep the file's own
   ahead-of-reader/live distinction.**
2. **`turbo.json` `globalEnv` lists exactly four variables** (`DATABASE_URL`,
   `TEST_DATABASE_ADMIN_URL`, `NEXT_PUBLIC_SERVER_URL`, `SERVER_ORIGIN`). Any new variable read during
   `test` that is not there lets turbo serve a **cache hit across differing environments**. This lane's
   own gate is `--force` so it will never see it — but **T14's CI job persists the turbo cache**, and
   #85's false green is the cited precedent. Add T1–T4's variables in the same seam.

## Standing corrections that must ride in every dispatch prompt

- **T4's production sender is `contact@artsourced.in`** (owner correction 2026-09-02), **NOT `sign-in@`**.
  Dev/CI stays `sign-in@gisik-nokma.local` via Mailpit. **The plan text predates the correction**, so an
  implementer who transcribes faithfully gets it wrong.
- **"The origin check" means two unrelated things.** The **HTTP `Origin` header** (CORS/CSRF) and the
  **event-envelope `origin` field** (provenance enum). T2 is the HTTP one. Say **HTTP-Origin** in every
  commit, comment and review on it.
- **Ruling P29 stands: T8's errand-with-waits template keeps its two `rule-bypassable` advisories.**
  Do not "fix" them.
- **T16 is HELD until T1–T15 have MERGED** (catalogue precondition rule).
- **The live deploy is OUT of scope.** T15's `deploy/do/app.yaml` is a FILE and is in scope; applying it
  to a DigitalOcean app is the one thing this lane does not do.

## Open rulings / blocked on

None. Nothing in this lane is waiting on the owner or the controller as of this refresh.

## Plan 11 task text — line ranges, so no dispatch inlines a document

`docs/superpowers/plans/2026-08-20-11-deployment-dogfooding.md` (4422 lines):
T1 `167–363` · T2 `364–575` · T3 `576–753` · T4 `754–857` · T5 `858–991` · T6 `992–1309` ·
T7 `1310–1658` · T8 `1659–2088` · T9 `2089–2496` · T10 `2497–2799` · T11 `2800–3205` · T12 `3206–3372` ·
T13 `3373–3603` · T14 `3604–3779` · T15 `3780–4157` · T16 `4158–4422`.
Global constraints `15–31` · production stack `32–70` · CC seed `71–105` · dev seed `106–109` ·
file structure `110–147` · the `data-testid` contract `148–166`.

## The gate, in this lane

Every run that includes `apps/server` takes the machine-wide lock first (five lanes share one Postgres on
54329 and one 16 GB machine):

```
until mkdir /tmp/gisik-gate.lock 2>/dev/null; do p=$(cat /tmp/gisik-gate.lock/pid 2>/dev/null); [ -n "$p" ] && ! kill -0 $p 2>/dev/null && rm -rf /tmp/gisik-gate.lock; sleep 15; done; echo $$ > /tmp/gisik-gate.lock/pid; trap 'rm -rf /tmp/gisik-gate.lock' EXIT
```

Full gate: `pnpm turbo run build test typecheck --force --concurrency=2 > gate.log 2>&1; echo GATE_EXIT=$?`
— **never piped into `head`** (the 2026-09-04 crash), always redirected. `check:env` is a **SEPARATE gate
step, reported on its own line at every PR** — #85's false green is why. Reap `pgrep -f vitest` survivors
after any run that returned suspiciously fast.

Docker: **the dev stack's Postgres must not collide with the test Postgres on 54329** — give the compose
stack its own port.

## Collisions with the other four lanes

- `apps/server/package.json` — Lane B adds a T14 devDep; this lane adds deps at T2/T4/T5. Rebase and
  re-run `pnpm install`; never hand-merge `pnpm-lock.yaml`.
- `apps/server/src/app.ts` and `apps/server/src/index.ts` — **this lane alone** among the five.
- root `package.json` scripts, `pnpm-lock.yaml`, `pnpm-workspace.yaml` — C, D and E all touch them.
  Rebase before every PR.
- `Features.md` §13 and `test-cases/13` are this lane's. **Do not touch §12 / `test-cases/12`.**
- Never edit `docs/lanes/task-ledger.tsv`. Never merge this lane's own PR. Never commit to `main`.

---

# SEAM 1 PRE-FLIGHT — findings, 2026-09-06 (4 read-only agents, 0 errors)

## THE BIG ONE: Plan 11's task text does not contain the work Plan 11 was assigned

**Eighteen errands were deferred to this plan BY NAME from other plans and from the coordination doc, and
Plan 11's T1–T16 claims almost none of them.** They are invisible to a `Plan 11` grep — several say only
"the deployment errand" or "Owner: whoever owns the boot path". Reported to the controller for a ruling;
**absent a ruling the lane proceeds on the defaults below and records each one.**

### Adopt into seam 1 — the server's deployment surface, files this lane owns alone

| # | errand | where it was deferred from | lands in |
|---|---|---|---|
| 1 | **HTTP-Origin on cookie-authenticated product mutations** (CSRF ruling item 1) | `coordination:936-937` assigned it to Plan 4 T5; **T5 DECLINED it in writing and named Plan 11.** No line in `apps/server/src` reads the `Origin` header. | **T2** |
| 2 | **The shutdown path** — no SIGTERM handler, no `pool.end()`, no `app.close()` | `index.ts:124-131`; the snapshot writer's stop hangs on `onClose` *specifically* so it works "on the day Plan 11 adds a real shutdown". **Plan 11 contains ZERO occurrences of sigterm/shutdown/app.close.** | **T5** |
| 3 | `registerAttachmentRoutes` never called | `index.ts:37-49` | **A0 — in flight** |
| 4 | **`LogOtpSender`'s two production faults** — logs every code, AND accumulates every code ever issued in an unbounded in-process array | `coordination:2455-2460` "Plan 11 owns the replacement"; `index.ts:60-73` | **T4** |
| 5 | **Invite-issuance rate limiting** — each issuance mints a credential | `check-permission.ts:321-329`, case 6.123, both "Owner: Plan 11, which owns `RATE_LIMIT_*`" | **T2** |
| 6 | **`WEB_ORIGIN`/`BETTER_AUTH_URL` accept `localhost:3001`** — `z.string().url()` only requires a scheme, so a bad value mints dead invitation links | case 6.124, "Owner: Plan 11" | **T1** |
| 7 | **Assert `pnpm-lock.yaml` carries no `@better-auth/cli` INSIDE the Docker build** (not in CI — so it cannot regress) | `coordination:1791-1803` | **T5** |
| 8 | `.nvmrc` + `engine-strict` | `coordination:5040-5051` | **DONE `f621a8c`** |

### Adopt into seams 2/3 — same family as work already scheduled there

`ops:sweep-orphans` (monthly, 30-day, only objects no ledger event ever named — `coordination:310`,
`:1115`: *"no task, no Files entry, no steps anywhere in Plan 11"*) · the `invite_tokens` sweep (6.131) ·
`user_preferences` retention for revoked members (`coordination:5495-5502`) · scheduling the notification
sweep CLI (`tools/sweep-notifications.ts:8`) · the verifier's DDL credential in `app.yaml`
(`coordination:1607-1611`; its sibling §2 autocommit MUST is **discharged**, `:1602-1606`) · the
interim-plumbing CI gate (`coordination:296`, `:1114`; `ci.yml:192-196` documents it as absent) · CI
wiring for `apps/web/e2e` (`plan-06:8993`; those specs are outside every automated gate today because
`turbo.json` defines only build/test/typecheck).

### DEFERRED, recorded with owners rather than dropped

- **The repo-wide test-cases↔test citation convention** (`coordination:3749`, `:4108`). Today **no ✅
  marker is grep-checkable and deleting a test reddens nothing.** That is a repo-wide convention, not a
  deployment task. Owner: workspace convention.
- **Stream load/soak** (7.35, already 🚫; `plan-05:6122`).

## Corrections to THIS LANE'S OWN BRIEF, found by agents contradicting the orchestrator

1. **The `contact@artsourced.in` correction binds T15 ONLY — not T4.** Measured: no line in T1–T4 is wrong
   about the sender. Every `sign-in@gisik-nokma.local` in that range is the DEV/CI default the correction
   explicitly preserves, and `contact@artsourced.in` appears **once in the whole plan**, at line 3859, in
   T15's `app.yaml`. **Do not put a real production domain into a code default or a unit test.** The lane
   brief (and this file's earlier "standing corrections" section) said otherwise; the plan was right.
2. **Case 9.61 is NOT about server wiring** and must not be touched by A0 — it is the editor's React
   surface not existing in `apps/web`, and stays ❌. The wiring claim lives at **9.59** (line 315) and in
   the file header (lines 31–34), which no brief named. **9.59 stays 🟡** — its marker is for a CLIENT-side
   gap (`uploadAttachmentHttp` has zero coverage) that A0 does not close.
3. **`.nvmrc`/`.npmrc` were reported UNTRACKED** by an agent whose sweep ran *before* the commit. They are
   tracked at `f621a8c` (`git ls-files` returns both, against a positive control). A clean instance of
   *a sweep is a fact about a tree, and the tree moved.*

## `/healthz`'s version string is an UNRULED DISCLOSURE DECISION this lane ORIGINATES

`healthz` and `health check` occur **ZERO times** in the 6592-line coordination doc. The only disclosure
rulings there are about guest/purge visibility and `LogOtpSender`'s heap transcript. So putting a build
version on an unauthenticated endpoint is **not** an inherited decision. Two defensible shapes: an opaque
build id rather than the semver from `apps/server/package.json`, or the version behind auth with
`/healthz` staying `{status}` only. **Whichever is chosen, the reasoning goes at the handler — the
document will not have it.**

## Where the plan text is WRONG about this repo — T1–T6

- **`WEB_ORIGIN` is already REQUIRED and LIVE** (`config.ts:39`, `z.string().url()`, no default), read by
  Plan 4 T14 as the invite-link host. T1 says add it as *optional* with `expect(config.webOrigin)
  .toBeNull()` (plan:196) — an assertion that **can never pass**. **T1 adds EIGHT variables, not nine.**
  Name collision to keep separate: `AppDeps.webOrigin` = invite-link host; T2's `security.webOrigin` =
  CORS allowlist. Same string today, two meanings.
- **`/healthz` — RESOLVED BY T1. The field is `sha`, NOT `version`, and BOTH branches carry it:**
  `{status:'ok', sha}` on 200 and `{status:'unavailable', sha}` on 503 (`app.ts:276,278`).
  **T6's smoke line must therefore be `{"status":"ok","sha":…}`.** This bullet previously said `version`
  and would have handed T6 an assertion that fails against the shipped route — caught by T1's own fix
  round reading this file, not by anyone reading the route. The original note stands as history: adding
  the field broke `app.test.ts:59`, `app.test.ts:74` and `events-route.test.ts:289`, and the plan named
  none of the three.
- **`config.test.ts:18-28` is an exact-shape `toEqual` over 9 fields** — eight new fields break it, and the
  plan never mentions the file. **`config.test.ts:197-207` is a hand-maintained array of the nine LIVE
  variable names**; extending the schema without extending that array leaves *a guard that passes while
  covering nothing new* — the classic non-falsifiable check.
- **T3's error handler already exists** and already does everything T3 describes except the alert call.
  Its 5xx body is the exported `INTERNAL_ERROR_BODY`, pinned by `toEqual` in four places. **Do NOT change
  the 5xx body**; T3's real diff is ~3 lines.
- **`createPool` is at `apps/server/src/db.ts:20`, not `src/db/pool.ts`.** The existing Pool already passes
  `options: '-c timezone=Asia/Kolkata'` — an `ssl` addition sits ALONGSIDE it, never replacing the object.
- **T2 hand-rolls `makeFixedWindowLimiter`; it does NOT use `@fastify/rate-limit`.** Packages actually
  needed: `@fastify/cors` (T2), `nodemailer` + `-D @types/nodemailer` (T4). **T11 needs none** — the three
  AWS packages are already present.
- **The plan's T1 `problems: string[]` accumulator does not exist to reuse** — `loadConfig` is one
  `safeParse`. Traps named: `z.coerce.boolean()` accepts any non-empty string (use
  `z.enum(['true','false'])` for `TRUST_PROXY`).
- **`import pkg from '../package.json' with { type: 'json' }` fails two ways**, each caught by a different
  gate: `apps/server/tsconfig.json` has no `resolveJsonModule` → TS2732 under both build and typecheck.
- **T5's `files` field warning is a false positive** — `apps/server/package.json` has no `files` key. The
  real edit there is moving `node-pg-migrate` from devDependencies to dependencies.
- **`apps/web/next.config.ts` does NOT set `output: 'standalone'`** and is **not** in the controller's
  collision map — safe for this lane, additive only, leave the webpack/rewrites logic alone.

## Traps in T2 that would each cost a round

- **CONFIRMED BY PROBE — `request.raw.url === '/v1/events'` carries the QUERY STRING**, and the bypass is
  total. Measured on fastify 5.12.1: `POST /v1/events` → **429** (limited), `POST /v1/events?x=1` →
  **200, handler ran, limiter never fired**. In the same run `request.raw.url` was `"/v1/events?x=1"`
  while `request.routeOptions.url` was `"/v1/events"` — so **`routeOptions.url` is the fix** and it
  matched correctly for BOTH requests. Applies equally to `/v1/sync`. This is a rate-limit bypass
  reachable by appending one character.
- **REFUTED BY PROBE — the `await reply.code(429).send(...)`-then-fall-out shape is FINE here.** The
  pre-flight predicted `FST_ERR_REP_ALREADY_SENT` and a 500 where a 429 was intended, and flagged it
  "verify at implementation". Verified: on fastify 5.12.1 the plan's form answers **429**, and so does the
  `return reply.code(429).send(...)` control — identical observable behaviour, handler not run in either.
  **Do not "fix" this**; an implementer acting on the warning would be changing working code to satisfy a
  prediction that reproduction does not support. (`return reply` remains the documented form and is
  better style — but it is style here, not a defect.)
- **`GET /v1/sync/bootstrap` — the most expensive read the server serves — is unlimited** under an
  exact-match limiter on `POST /v1/sync`.
- **`trustProxy` is NOT passed today** (`Fastify({...})` sets logger and ajv only). Behind App Platform
  `request.ip` is the router, so **enabling rate limiting without `TRUST_PROXY=true` is worse than not
  enabling it** — every client shares one bucket.
- **T2's CORS has no shipped browser caller.** Next rewrites `/v1/*` and `/api/auth/*` to `SERVER_ORIGIN`
  server-side, so the browser only ever talks to its own origin. Keep CORS (bearer-token mobile/desktop
  are the future callers) but **do not claim it fixes a live breakage.**
- **`void app.register(...)` is the settled pattern, not an open question** — `auth/routes.ts:44` already
  does it, and 18 files depend on `buildApp` returning synchronously. **Do not make `buildApp` async.**

## Checks that pass for the wrong reason — seam 1

- **`pnpm check:env` green is NOT evidence T1 landed.** `.env.example` already documents all eight T1
  variables while `config.ts` reads none, and the gate only fails on code-that-reads-but-is-undocumented,
  never the reverse.
- **`.env.example:15` asserts the LIVE list is "exactly `config.ts`'s zod schema".** That sentence goes
  false the instant the schema grows, and **no gate catches it.**
- **The compose healthcheck `wget -qO- http://localhost:3000/healthz` runs INSIDE the container**, so it
  is green whether or not the service is reachable from outside.

## T6 — the port collision, stated plainly

**The plan pins the DEV stack's Postgres to host port 54329** ("kept identical here so every documented
`DATABASE_URL` works against either stack", plan T6 header). **54329 is the shared TEST Postgres all five
lanes are using right now** (`docker ps`: `gisik-nokma-exec-postgres-1`). Written verbatim the dev stack
would either fail to bind or silently point at the test database. **Use 54330** (confirmed free by `lsof`).
Occupied on this machine and therefore also unusable: 5432, 27017, 6379, 8001.

**And the MinIO variable split, which the plan does not catch:** the plan's compose wires MinIO with
`S3_ENDPOINT`/`S3_REGION`/`S3_BUCKET`/`S3_ACCESS_KEY`/`S3_SECRET_KEY`. **The shipped code reads a
different set** — `OBJECT_STORE`, `OBJECT_STORE_DIR`, `OBJECT_STORE_S3_*` (`store-config.ts:15-24`) —
and nothing in `src/` reads any `S3_*` name. Written verbatim, **attachments silently stay on the
local-disk store inside the container** instead of reaching MinIO.

## T6's env-contract slice is ALREADY DONE and BETTER than the plan asks

`scripts/check-env-example.mjs` exists with **three** detectors plus two anti-vacuity guards; the plan
specifies **one** regex which the script's own header records as matching *nothing* on this codebase.
`pnpm check:env` is already wired and already runs in CI. **Re-implementing per the plan text would be a
regression.** Remaining honest T6 scope: `docker-compose.dev.yml` (Step 1) and proving the checker against
a planted defect (Step 4).

---

# THE BRIEF IS WRONG ABOUT TZ — measured, with a positive control

The lane brief's **"TWO KNOWN GAPS" item 2** says: *"Zero of 48 test files vary `TZ`; seven are day- or
clock-sensitive; all seven omit it."* **All three numbers are false.**

| claim | measured |
|---|---|
| "48 test files" | **235** repo-wide (`apps` + `packages`, excluding `node_modules`); **89** under `apps/server/test` alone |
| "zero vary `TZ`" | **11 files assign `process.env['TZ']`** |
| implied: no controls exist | at least two carry an explicit control proving the assignment moves local time |

The eleven: `apps/web/test/ist-today.test.ts` · `apps/server/test/integration/real-door-round-trip.test.ts`
· `apps/server/test/routes/attention.test.ts` · `apps/server/test/helpers/read-scenario.test.ts` ·
`apps/server/test/notifications/sweep.test.ts` · `packages/app-core/test/calendar/clock-free.test.ts` ·
`packages/app-core/test/views/my-work.test.tsx` · `.../attention-strip.test.tsx` ·
`.../history-list.test.tsx` · `packages/editor/test/google-picker.test.ts` ·
`packages/editor/test/attachment-list-item.test.tsx`.

**Positive control**: the same tooling found 89 files containing `describe(` under `apps/server/test`.
Without it this measurement would have been worthless — **my first attempt returned 0 for the TZ sweep AND
0 for the control**, because zsh expanded the unquoted `--include=*.test.ts` and the whole run errored.
A bare "0 files vary TZ" from that run would have *confirmed the brief* and been pure artefact.

**Consequence for this lane:** do NOT add TZ-varying cases to close a gap that is not there.
`apps/server/test/routes/board.test.ts:80-87` already argues that a TZ case over clock-free output is
itself a check that cannot fail. The brief's *rule* still stands — a clock-sensitive assertion must vary
`TZ` explicitly — but its premise that nothing does was stale.

## A NEW SILENT-EMPTY MODE — the ninth, and it hits the plan documents

**`grep -c '^# '` returns an EMPTY STRING, not `0`, on the plan markdown files.** Measured on
`2026-08-20-08-workflow-builder.md` and `2026-08-20-11-deployment-dogfooding.md`; both are *"UTF-8 text,
with very long lines"*. `awk` on the identical pattern returns 2 and 53. So a count that should be a
number comes back blank, and any arithmetic built on it silently degrades. **Use `awk` for counts over
the plan documents.** Add to the recorded silent-empty set.

---

# SEAM 2 PRE-FLIGHT — findings (3 opus agents, 0 errors), 2026-09-06

## T7 / T8 — the Convenience Corner mapping

**The frozen record was actually parsed, not described.** `reference/convenience-corner-tracker/board.data.js`
(231 KB) evaluated in a vm sandbox: `week1 = 2026-08-18`, **191 items over 16 epics**, 13 registrations +
10 questions = **23 errands**, states `{later:5, next:14, in-progress:1, blocked:3, done:0}` — exactly the
plan's table. Generator arithmetic reproduced for w0/w1/w7/w28. Every named fixture holds its claimed
property.

**What the record does NOT contain — this is what "nothing invented" guards:** no user identities of any
kind (no emails, no user ids; `counterparty`/`who` are free text like "Dun & Bradstreet", "Accountant");
no workspace, project, epic-ticket or workflow ids; no ticket type; no assignees; no comments; no
attachments; no ordering/rank; no priority; no estimates; **no transition history or timestamps** (only
the current state); **no `ended` date on any of the 191 items**; and **no origin date on 22 of the 23
errands** — exactly one, `ops:accountant-hsn-digits`, carries `started`. Everything the seed adds beyond
this (workspace, project, epics, type, workflow, actor, clientTime) is invented **by construction** and
each needs a named justification.

### ⚠️ RULING P29's TRIPWIRE — the oracle does NOT defend the ruling

The two `rule-bypassable` advisories live at `packages/domain/src/workflows/errand-with-waits.ts`:
`{from:'later',to:'waiting',rules:[]}` and `{from:'next',to:'waiting',rules:[]}`, beside
`{from:'in-progress',to:'waiting',rules:[{kind:'require-comment'}]}`.

**`checkErrandTemplate` — T7's own oracle — would still return `ok:true` after someone "fixed" them.** It
checks state presence, one-hop reachability, `waiting.blocked`, and `require-comment` into `done`; none of
that changes if `later→waiting` and `next→waiting` acquire a guard. **The ONLY thing that catches it is
`packages/app-core/test/workflow-builder/templates.test.ts:80`**, which asserts the advisories equal
`['rule-bypassable','rule-bypassable']`.

The runtime consequence is concrete: the **3 blocked errands transition `later→waiting` in one hop**, so a
`require-comment` there would make the seed's own transitions refusable — and the seed would have to
**invent a comment**, the exact thing T8 forbids. A second temptation: `templates.test.ts:50-55` asserts
every *other* template has zero advisories under the banner *"a shipped template that greets the author
with a warning is a shipped template that is wrong"*; errand-with-waits is excluded **on purpose**.

### Defects in T7/T8's own text

- **PAYLOAD FIELD NAME MISMATCH — the most consequential.** T8 emits `ticket.transitioned` with
  `{toStateId}`; the registered schema uses **`to`** (`packages/domain/src/workflow.ts:137-145`).
- **`startDate` is a BUILT-IN field id.** T8 and the CC-seed prose declare it as a *custom* field;
  `ticketTypeDefSchema`'s superRefine raises *"field id \"startDate\" shadows a built-in field"* and the
  founding `ticket-type.defined` event would not parse. **Only `counterparty` is a legitimate custom field.**
- **`startDate`'s VALUE takes the day-claim object** `{date, note?}`, not a bare string; a bare
  `'2026-08-18'` is refused `field.type-mismatch`. The plan's own `dueDate` branch already has the right shape.
- **Three hand-written "ULID" literals are not ULIDs** — `01J5SEEDUSER0000000000000A`,
  `01J5OWNERUSER000000000000A` and a third all contain `U`/`O`, which Crockford base32 excludes. T7/T8
  never parse them so their tests stay green; **T9/T10 call the real `ingestBatch` and would fail there.**
- **`workflowFromTemplate`'s `{...template}` is a SHALLOW spread** — `states`/`transitions` are the very
  arrays of the frozen module-level constant, so mutating a clone mutates the template for every importer.
  Use `structuredClone`; assert non-sharing by **identity** (`not.toBe`), not `toEqual`.
- `ERRAND_WITH_WAITS_TEMPLATE` is `Omit<WorkflowDef,'id'|'version'>`, **not** `WorkflowDef` — every T7
  signature that says otherwise is a strict-mode error.
- **`seedUlid` needs nothing from `ulidx`** — only `node:crypto` plus the shared `ULID_REGEX`. Verified:
  output matches `ids.ts:9`'s regex and `seedUlid('ab','c') !== seedUlid('a','bc')`.
- **Idempotence rests on `events_pkey` alone.** Only that violation is translated to `duplicate-event-id`;
  the events table carries two further UNIQUEs whose violation escapes as a thrown error rejecting the
  whole batch. Deterministic ids are therefore load-bearing: random ids on a re-run means **23 duplicate
  tickets, not 23 no-ops**.

## T9 / T10 — the seed runners

- **`'errand'` as an entity id is refused.** Every entity kind except `membership` needs a **ULID** entity
  id; `parseEvent` rejects it as invalid (not duplicate), so the seed throws and fails whole. File the
  type against `seedUlid('ticket-type','cc#errand')` and keep `id:'errand'` **in the payload only**.
- **`readPlanSeries`'s `/^### Task (\d+):/` misses ELEVEN task headings** carrying a letter suffix (4a,
  9b, 12a, 15b, 9a, 11a, 12b, 12c, 13a …). The repo's own validator uses `(\d+[a-z]?)`. And
  `Number('12a')` is `NaN`, so widening the regex without changing `PlanTask.number` to a **string** makes
  Task 12 and Task 12a **share one seed id**.
- **`createPool` is at `src/db.ts` and takes ONE argument** — not `src/db/pool.js`, no `caCert` option.
  `AppConfig` has no `databaseCaCert`.
- **A seed must not call `loadConfig`** — it requires `BETTER_AUTH_URL`, a 32-char `BETTER_AUTH_SECRET`
  and `WEB_ORIGIN`, none of which a seed reads. Follow `tools/sweep-notifications.ts:12-18`, which recorded
  this exact deviation. Same applies to T11's backup daemon.
- **CLI convention**: all three existing tools live flat in `src/tools/` and run as `tsx src/tools/<name>.ts`.
  **No package.json script anywhere in `apps/server` references `dist/`.**
- **`report.tickets` is computed from the parsed INPUT before any database call** in both seeds — it
  reports the source file's contents, never the ledger's. **Keep it, but it is not verification.** Assert
  `committed + skippedExisting === events.length` and verify with a projection read.
- **The simple-Kanban workflow id is minted with `newUlid()` inside the founding sequence** and is not the
  seed's to fix — remove it from the published id contract.

## T11 / T12 — backups and the restore drill

- **`assertValidObjectKey`'s per-segment regex `^[A-Za-z0-9_-]+$` (`object-store.ts:30`) REFUSES BOTH of
  T11's key formats** (`ledger/YYYY-MM-DD.ndjson.gz` — dots; `pg/…THH-mm.dump` — dot). Widening it touches
  a **security control with a planted-defect test across all three S3 verbs** (`s3-store.test.ts:76-89`).
  Make it an explicit recorded choice; if widened, extend the planted-defect test to prove `..` is still
  unrepresentable.
- **CONFIRMED: T11 needs no new dependency** — all three AWS packages already present, resolved 3.1124.0.
  **Delete the plan's `pnpm add` line and its `git add pnpm-lock.yaml`.**
- **`pg_dump` is NOT on PATH on this machine** — keg-only at `/opt/homebrew/opt/libpq/bin`, **v18.4** —
  and `ci.yml` installs no postgres client. So `describe.skipIf(!pgDumpAvailable())` means **both suites
  silently skip and the gate is green having tested nothing.** Either install client tools in CI or make
  the skip LOUD.
- **PG VERSION SKEW**: local `pg_dump`/`pg_restore` are **18.4**; the compose Postgres and the CI service
  container are **16.15** (measured inside the container with a working negative control). v18 → v16 dump
  is fine, but the **archive version** a v18 `pg_dump` writes is what a v16 `pg_restore` must read.
- **Both acceptance assertions cannot fail for the reason their names imply.** "Two exports of the same
  ledger are identical" is satisfied by two exports that both drop the same rows; `PGDMP` magic bytes
  appear on a dump of an **empty** database. Assert the export's line count against an independently
  issued `SELECT count(*)`, and the decoded tuples against a separately ordered query.
- **`restore.sh`'s guard is its entire purpose and no test runs the script** — the drill calls
  `spawnSync('pg_restore')` directly, and **no test in this repo executes any shell script.**
- **T12 imports `verifyProjections` from `src/verify/`; it lives at `src/tools/`.** All six existing
  consumers use `src/tools/`.
- **T11's alerter (`src/alerts/error-alerter.ts`) does not exist** — Task 3 has not landed. Define a
  minimal local shape and inject it, so T11 does not block on T3.

## Full seam-2 map output

`/private/tmp/.../4f2fa6a7-a0c3-491c-8589-fec56d263147/tasks/whbotz9a0.output` (~95 KB) — **a temp file;
the distillation above is the durable copy.**

---

# T5a — Dockerfiles, DONE and actually BUILT

| image | build | size | verified |
|---|---|---|---|
| `apps/server/Dockerfile` | **exit 0** | **823 MB** | node **v22.23.2**; `node-pg-migrate.js` present 0755; entrypoint runs migrations FIRST and **fails closed with no DB**; `dist/` and `migrations/` both landed |
| `apps/web/Dockerfile` | **exit 0** | **241 MB** | `apps/web/server.js`, `.next/static` populated, `public/` present |

Reviewer rebuilt with `--no-cache`; no Critical findings; implementer stayed inside its four allowed paths
and touched no lockfile.

**Two real defects, both disclosed rather than hidden:**
1. **The runtime image ships the ENTIRE devDependency set** (typescript, vitest, tsx, aws-sdk-client-mock,
   `@types/*`, ws) **plus `apps/server`'s `src/` and `test/` trees** — because `node-pg-migrate` had to stay
   reachable at runtime and the lockfile was off-limits, so `pnpm deploy` ran **without `--prod`**.
   823 MB is the honest cost. **RESOLUTION, serialized: move `node-pg-migrate` to `dependencies`, re-run
   `pnpm install`, switch to `pnpm deploy --prod`.** Blocked only on the concurrent gate.
2. **`apps/web` has no `public/` directory at all**, contradicting the plan; the build `mkdir -p`s it so
   the COPY is stable and picks up real assets the day one appears.

**Not proven, stated plainly:** neither image was ever run against a real Postgres, and
`node apps/web/server.js` was never hit with a request. Both belong to T6/T13.

---

# TEST-CASE ID COLLISION PROTOCOL — controller broadcast 2026-09-06, adopted

Two lanes minting from the same "NEXT FREE ID" line at the same time collided twice in the first hour
(Lanes A and B, four ids each). **It is only visible at rebase; no header can prevent it.**

**Rule.** Whatever is already on `main` keeps its numbers. **At every rebase, RE-MEASURE main's maximum in
every section this lane mints into, and move MY ids above it**, renumbering the catalogue and every
citation in one commit. **Measure, do not recall.**

**Do NOT fix it with a project-wide `sed`.** It silently repoints *other lanes'* citations in files this
change never touches. Lane A found two such comments in `sync-client` that a `sed` would have broken
**while every test stayed green — because a comment does not run.**

## Extraction that actually works across both catalogue formats

§6 writes `- **6.17** ✅ …` (bold ids); §9 writes `- 9.200 ✅ …` (bare). A `^- N\.` pattern silently
returns NOTHING for §6 — measured: it produced an empty result for §6 while returning real numbers for
§9, so the naive pattern *looks* fine on whichever file you happen to check first. Use:

```
git show "origin/main:test-cases/<file>.md" | grep -oE "(^|[^0-9])<N>\.[0-9]+" \
  | grep -oE "<N>\.[0-9]+" | cut -d. -f2 | sort -n | tail -1
```

## Maxima on `origin/main`, measured 2026-09-06 — **re-measure at rebase, these WILL move**

| section | max on main | this lane's interest |
|---|---|---|
| §6 auth/visibility | **137** | the 18 errands cite 6.123, 6.124, 6.131 — other lanes are minting here NOW |
| §7 api/realtime/search | **209** | 7.35 (stream soak, 🚫) |
| §9 editor/attachments | **239** | **A0 minted 9.240 and 9.241 — currently correct, above 239** |
| §12 offline sync | **193** | **NOT this lane's** — do not touch |
| §13 deployment | does not exist | **this lane creates it, at T16** |

**A0's 9.240/9.241 are above main's 239 as of this measurement and must be re-checked before the seam-1
PR.** If §9's max has moved, mine move above it, catalogue and citations together.

---

# SEAM 3 PRE-FLIGHT — findings (3 opus agents, 0 errors), 2026-09-06

## T13 — the E2E. **The plan's own package would turn CI red on every PR.**

**THE ONE THAT BREAKS CI TODAY.** The plan's `e2e/package.json` declares `"scripts": {"test": "playwright
test"}` and adds `- 'e2e'` to `pnpm-workspace.yaml`. **Turbo enumerates the `test` script of EVERY
workspace package**, and CI's only execution step is `pnpm turbo run build test typecheck`. Measured with
`turbo run test --dry=json`: 8 tasks today, one per package declaring `test`. Add the plan's package
verbatim and `@gisik-nokma/e2e#test` joins the gate — **on a runner with no compose stack, no Mailpit and
no browser binary** (`playwright@1.62.1` declares no install script, so `pnpm install --frozen-lockfile`
fetches nothing and CI never runs `playwright install`).
**FIX: name the script `e2e`, not `test`**, with a root `"test:e2e": "pnpm --filter @gisik-nokma/e2e run e2e"`.
Turbo defines no `e2e` task, so the suite is **structurally** unreachable from `turbo run test` — a guard,
not a comment asking someone not to.

**ZERO of the 15 pinned `data-testid`s exist.** Two independent sweeps (`grep -r` and a `find`-enumerated
807-file `xargs grep`), **both with positive controls that fired** (`state-node-` → 3,
`dialog-scrim` → 2). The client was built with **role/aria addressing throughout** —
`apps/web/e2e/smoke.spec.ts` uses `getByRole` everywhere and `getByTestId` zero times. The 11 testids that
DO exist are all workflow-builder or list-internals hooks. Split the amendment: the flat ones adapt today
with **zero component edits** (`auth-email-input` → `getByLabel('Email')`, `auth-magic-link-submit` →
`getByRole('button', {name:'Send magic link'})`); the per-entity ones (`ticket-card-<id>`,
`board-column-<stateId>`) genuinely need component changes and belong to whoever owns those components.

**Playwright is ALREADY installed and configured** — `@playwright/test` **1.62.1** in `apps/web`, a config
at `apps/web/playwright.config.ts`, two specs, browser binaries already in `~/Library/Caches/ms-playwright`,
and `apps/web` already TYPE-gates `e2e/**` via `tsconfig.e2e.json`. T13 is not greenfield. **Pin
`^1.62.1`, not the plan's `^1.49.0`**, so both suites share one resolved version and one browser download.

**The plan's navigation click CAN NEVER LAND.** `getMyWorkspaces` is an unconditional refusal —
`online-data-source.ts:111` → `mapWorkspaceRefs`, which is `(_raw: unknown): never { throw new
ServingGapError(...) }`. Reach the board by **direct URL** `/w/<id>/p/<id>`, taking ids from T7's
deterministic ULIDs — the pattern `smoke.spec.ts:196-203` already uses for this reason.
**FORBIDDEN: weakening `mapWorkspaceRefs` or any of the six `): never` mappers to make the click land.**
They encode P25 clause 1, HELD pending an owner ruling; softening one converts a recorded gap into an
invented fact.

**The refusal assertion cannot fire.** `transition-dialog.tsx:160-166` DISABLES confirm when a
require-comment transition has an empty comment, so the plan's bare-close never reaches the server and no
refusal is ever produced. And the state choice is `<option>` inside `<select>` — drive it with
`selectOption()`, not `click()`. **Do not put a `transition-refusal` testid on the client's own preview
to make it green** — that proves nothing about the rule engine.

Other T13 hazards: every URL (`:3001`, `:3000`, `:8025`) is satisfiable by **stray local dev processes
with the compose stack entirely down** — assert `/healthz`'s version against the built image tag in
globalSetup. `toHaveCount(0)` passes on a blank, 500'd or redirected page. `fetchMagicLink` takes
`messages[0]` with no ordering and no nonce while globalSetup already burned one link per address —
**if Mailpit sorts oldest-first, `signIn` follows a spent link and a green run means the globalSetup
cookie was reused.** An empty `testDir` exits 0 with `0 passed` — **pin an expected test count.**

## T15 — the DigitalOcean spec file

**⚠️ ATTACHMENTS WOULD SILENTLY GO TO EPHEMERAL DISK.** `store-config.ts:26` is
`const kind = OBJECT_STORE ?? 'local'`. The plan's `app.yaml` sets **no `OBJECT_STORE`**, so a production
deploy builds `LocalDiskStore('var/attachments')` **inside an App Platform container** and every uploaded
attachment is destroyed on the next redeploy — **no error, no log line, no failed request.** Set
`OBJECT_STORE=s3` and the six `OBJECT_STORE_S3_*` names. **The plan's `S3_*` block is read by nothing.**

**⚠️ THE FALSIFIABILITY PROOF IS ITSELF UNFALSIFIABLE.** T15 Step 2a offers a negative control —
*"# Fails — the dev compose Postgres has not been altered"* — and **that invocation PASSES.**
`docker-compose.yml:6` starts Postgres with `-c timezone=Asia/Kolkata`, a **CLUSTER-level** GUC, so every
database on it (including `postgres`) already answers `Asia/Kolkata` with no `ALTER DATABASE` anywhere.
CI does the same via the service container's `TZ`. An operator runs the demo, watches the "Fails" line
pass, and concludes the check works. **Use the technique this repo already proved** —
`migrations.test.ts:172-203` creates a scratch database and `ALTER DATABASE <scratch> SET timezone TO
'UTC'`, the OPPOSITE of the product zone.

**`check:db-tz` cannot resolve `pg` from the repo root** — root `package.json` declares exactly one
devDependency (`turbo`), and pnpm's isolated `node_modules` has no hoisted `pg`. Either add `pg` to root
devDependencies (a real new dependency the plan never mentions) or move the script under `apps/server`.

**`DATABASE_CA_CERT` is INERT.** `db.ts:20-26` passes only `connectionString`, `max` and `options` — no
`ssl`, no `ca`. Nothing in `apps/server/src` or `packages/` reads the variable. Either add TLS to
`createPool` (**a Plan 1 file this lane does not own — route it, do not edit it**) or say in
`deploy/do/README.md` that it is currently inert.

**`NEXT_PUBLIC_API_URL` / `NEXT_PUBLIC_WS_URL` were DELETED as unread.** The shipped web reads
`SERVER_ORIGIN` (`next.config.ts:9`) and `NEXT_PUBLIC_SERVER_URL` (`providers.tsx:104`). `NEXT_PUBLIC_WS_URL`
was also the wrong SHAPE — `streamUrl()` appends `/v1/stream` itself.

**The CSRF ruling's Plan-11 touchpoint is UNDISCHARGED.** `coordination:823-827` routes the
provider-default-host question here explicitly. Measured in Plan 11: `ondigitalocean` **0×**, `SameSite`
**0×**, `CSRF` **0×**, `Public Suffix` **0×** (positive control, same sweep: `TRUST_PROXY` 8×). T15 must
state that the API is never served from a `*.ondigitalocean.app` host (that parent is not on the PSL, so
every other tenant would be same-site) and that `Domain=` is never added to the session cookie.

**NO GATE SEES `deploy/` OR `scripts/`.** `check-env-example.mjs:54` scans
`['apps/server/src','apps/web','packages']`. Nothing compares `app.yaml` to `.env.example` or to
`config.ts`'s schema, so **every defect above is invisible to CI.** A ~30-line check would close it.

**Standing correction VERIFIED**: `MAGIC_LINK_FROM=contact@artsourced.in` at plan:3859, and an
`@artsourced.in` sweep over the whole plan returns exactly three lines with **no line disagreeing**.

## T16 — the runbook

**IT NAMES SEVEN NONEXISTENT COMMANDS AND ONE BROKEN ONE.** `ops:backup-once`, `ops:fetch-backup`,
`ops:sweep-orphans`, `seed:cc`, `seed:dev`, `check:db-tz` and `scripts/restore.sh` exist in **no
package.json on this tree**; `verify:projections` exists but **throws `ConfigError` as the runbook invokes
it** — `verify-projections.ts:108` calls `loadConfig`, which demands `BETTER_AUTH_URL`, a 32-char
`BETTER_AUTH_SECRET` and `WEB_ORIGIN`, none of which the verifier uses. **A runbook is prose and prose
cannot fail**; the only honest check is that every command it names resolves.

**`test-cases/README.md` must be in T16's Modify list** — it carries a "Buckets so far" index that already
reserves `13-deployment-dogfooding.md`. Adding a bucket without editing the index leaves the repo
describing itself wrongly.

## Ownership of `deploy/do/app.yaml` — RESOLVED HERE, no ruling needed

`coordination:1610` says *"Lane 4 owns `deploy/do/app.yaml`"*. That is the **pre-2026-09-06 four-lane
numbering**; the five-lane resume (`controller-state.md:73`) names *"T15 DO spec file"* for **Lane E**, is
LATER, and the owner's 2026-09-06 instruction superseded the serial topology outright. **T15 is this
lane's.** Note the collision hazard in the naming itself: `controller-state.md:70` gives Lane B *"T15
scenarios"* — that is **Plan 10's T15**, a different task with the same number.
**The §4 obligation travels with the file**: `deploy/do/` must carry EITHER a verifier credential OR an
explicit recorded decision that it runs only against restore scratch DBs. **Recorded, not inferred.**

---

# THE DISK INCIDENT, 2026-09-06 — and this lane's share of causing it

**The shared Postgres (`gisik-nokma-exec-postgres-1`, port 54329) went into a PANIC loop** because
Docker's VM disk hit 100% (56.1 G / 58.4 G) — *"No space left on device"* on every checkpoint. Every
lane's server gate went down with it. `docker ps` still reported the container **Up**, which is why it
read as a code defect first.

**What it looked like from inside a gate**, recorded because the visible error is not the real one:

```
TypeError: Cannot read properties of undefined (reading 'drop')   <- afterAll, MASKING the cause
  ❯ test/engine-context.test.ts:47:12
...
error: the database system is in recovery mode                     <- the actual cause, visible only in
                                                                      the two tests that got far enough
```

73 of 89 server test files "failed" at file level; `beforeAll` could not `CREATE DATABASE`, so `db` was
undefined and **the teardown threw first**. A reader who stops at the first error diagnoses a test bug.

**This lane caused most of the disk pressure.** Build cache went **986 MB → 12.6 GB** during the session:
four Docker image builds for T5a. Cleared with `docker builder prune -f` — authorised cache-only by this
lane's own T5a brief, and structurally incapable of touching images, containers or volumes (0 of 94
entries were ACTIVE). Two superseded `gisik-server` images removed as well. **~13.1 GB reclaimed; the
owner's 17 images and all 4 containers untouched; the 36.8 GB of unused images was NOT touched and
remains the owner's call.**

## STANDING FIX (assigned by the controller, owner: this lane) — sweep at the START, not the end

`createTestDatabase` drops its database in `drop()`, called from `afterAll`. **A killed run, a crashed
worker, a jetsam kill or a Postgres panic never reaches `afterAll`** — so the cleanup that exists is
exactly the cleanup that does not run on the occasions that produce the mess. 39 orphaned
`gisik_test_*` databases had accumulated.

`scratchpad/sweep-test-dbs.sh`, wired into `locked-test.sh` **before** every run. Result: `39 present →
39 dropped → 0 remain`. **The rule that makes it safe with five lanes on one cluster: it drops only
databases with ZERO backends in `pg_stat_activity`**, selected in ONE query rather than a list-then-check
round trip, because a `gisik_test_*` with a live connection is a **peer's running suite** and dropping it
reddens their gate with something that reads exactly like a code defect.

## For T6, carried

The dev stack's volume lives on this same Docker disk. **State the budget in the compose file's docblock
and in the runbook**, and make the seed runner **refuse rather than half-write** when `CREATE DATABASE`
fails on space — the exact failure mode watched here.

## A log line that will mislead the next reader

Turbo's failure output names `/Users/kiro/.nvm/versions/node/v24.11.1/bin/pnpm`. **That is not a Node-24
run.** Turbo prints the binary path ONLY on error, so it is absent from every green log and reads as a
regression when compared against one. pnpm's shebang resolves `node` through `PATH`, and
`node-version.test.ts` — which asserts the worker's Node from inside the worker — passed in both green
gates. Do not chase it.

---

# T1 — landed. Three findings of one class, and two more recorded rather than fixed

## The Critical, and why the guard could not fire

`DATABASE_CA_CERT` was documented "LIVE AND CONSUMED" and was **silently discarded whenever
`DATABASE_URL` carried any ssl parameter** — i.e. on every managed-Postgres URL, DigitalOcean's included.
Mechanism, measured at the source: pg builds parameters with
`config = Object.assign({}, config, parse(config.connectionString))`
(`pg 8.23.0, lib/connection-parameters.js:60`), so the **parsed URL is applied ON TOP of the caller's
object** and its `ssl` replaces `ssl: {ca}` wholesale.

**And the guard asserted the wrong object.** It read `pool.options` — what the driver was *handed* —
instead of `connectionParameters` — what it *connects with*. **Mutation C proved this by construction:**
restore the defect AND revert the assertion to the old shape, and the CA assertions go **GREEN with the
defect present**. That is not an argument that the old guard was blind; it is a demonstration.

**The fix**: strip the ssl query parameters from the URL when, and only when, a CA is configured. Verified
three ways independently — reviewer, fix agent, and the orchestrator against installed pg 8.23.0:

```
ssl:{ca} + ?sslmode=require   -> ssl={}          CA DISCARDED
ssl:false + ?sslmode=require  -> ssl={} not false  (the docblock had precedence BACKWARDS)
ssl:{ca} + plain URL          -> ssl={ca:...}    control
ssl:{ca} + params stripped    -> ssl={ca:...}    the fix
```

**The fix round corrected the REVIEWER twice**, and both corrections matter:
1. The finding prescribed "parse `databaseUrl` yourself (pg-connection-string is already a dependency)".
   **It is not a dependency of `apps/server`** and does not resolve from it under pnpm's isolated
   `node_modules`. The prescribed mechanism would not have compiled.
2. The finding named **four** ssl parameters; there are **six**. `ssl` and `sslnegotiation` set the config
   to a BOOLEAN, the other four to an object — read off `pg-connection-string/index.js:69-84` and then
   confirmed one parameter at a time against the installed driver, not assumed.

**A regression the fix introduced and then closed**: `withoutSslParameters` calls `new URL()`, which
**throws on connection-string forms pg accepts** — a bare database name and an empty string both raise
`TypeError: Invalid URL` (verified independently by the orchestrator; a unix socket path and a
`?host=/var/run/...` form both parse fine). Gated behind `caCert !== null` and given an explicit
boot-time refusal, so the eight non-CA call sites are byte-identical to before.

## The stated trade — recorded because it is a JUDGEMENT, not a measurement

With a CA configured, a `?sslmode=no-verify` or `?sslmode=disable` in the URL now **loses to the CA** and
the connection becomes verified TLS. The reasoning: that configuration is self-contradictory (it supplies
a trust anchor and then asks for no trust) and it is resolved in the direction that **cannot downgrade a
deployment**. **The honest risk, in the fix author's own words:** an operator on a provider whose chain
does not validate cleanly may have set `no-verify` deliberately *and* pasted the CA in, and for them this
converts a working connection into a handshake failure at boot. Not reproducible from this machine.
**If a managed deploy fails TLS at boot with a CA set, look here first.**

## Two NEW findings of the identical class — recorded with owners, NOT fixed

1. **An `options=` query parameter in `DATABASE_URL` silently CLOBBERS `-c timezone=Asia/Kolkata`**, by
   the same `Object.assign` at `connection-parameters.js:60`. Every timestamptz an ad-hoc query prints
   would quietly move off India time, with nothing failing. **Owner: unassigned — belongs with whoever
   next touches `createPool`.**
2. **`sslcert`/`sslkey`/`sslrootcert` in a URL make pg `readFileSync` the path at CLIENT CONSTRUCTION**,
   so a missing cert file throws `ENOENT` at pool creation rather than on first query. Reproduced.
   **Owner: T15's `deploy/do/` documentation.**

Plus the review's two Minors, neither fixed and both now MORE worth doing: `verify-projections.ts:109`
and `sweep-notifications.ts:26` call `createPool` without the CA — and as of T1 that second argument
actually does something. `verify-projections` is the freshness gate **T12's restore drill schedules
against production.**

## T1's numbers, with the arithmetic stated rather than implied

`EXIT=0` · `Tasks: 24 successful, 24 total` · `0 cached` · Node v22.22.2 · pnpm 9.15.0 ·
0 `Unsupported engine` · **0 skips/todos** · `CHECK_ENV_EXIT=0`.
**235 files / 3199 tests** — server 89/993.

    header baseline   235 / 3183   (server 977)
    at review         235 / 3193   (server 987)
    final             235 / 3199   (server 993)

`3193 − 2 + 8 = 3199`: the **2** are the replaced `pool.options` assertions, the **8** the new
`connectionParameters` ones. File count unchanged — no test file added or removed.

## Nine variables, not eight

`DEPLOY_SHA` is the ninth, and it comes from the **environment**, never a JSON import — which is what
dissolves the `resolveJsonModule`/TS2732 trap. `TRUST_PROXY` is `z.enum(['true','false'])` because
`z.coerce.boolean()` turns the string `'false'` into `true` — the one spelling an operator writes for
"off". `MAGIC_LINK_FROM` defaults to the **dev** `sign-in@gisik-nokma.local`; `contact@artsourced.in`
appears in **no** code default and **no** test.

---

# ⚠️ CATALOGUE DEBT THIS LANE HAS ACCRUED — must clear before the seam-1 PR

**T1 and T5 catalogued NOTHING**, and that is a gap I created by telling their implementers not to touch
`Features.md` or `test-cases/` (to avoid a five-lane collision). Measured: my commits touched
`Features.md` twice — A0's attachment bullets and T5's correction of a stale "no Dockerfile" claim — and
`test-cases/09-editor-attachments.md` once, for A0's cases 9.240/9.241. **A0 is correctly catalogued in
§9 (attachments). T1's nine config variables, the deploy sha, the CA fix and the strict-URL refusal are
catalogued NOWHERE. Neither are T5's two Dockerfiles.**

The lane brief holds the Plan 11 catalogue to **T16** ("HELD until T1–T15 have MERGED"), which is why the
implementers were told to stay out. **The controller has now superseded that for the file's EXISTENCE:**
Lane C's #134 (T14) **CREATES** `Features.md` §13 and `test-cases/13-deployment-dogfooding.md` and claims
§13 in the `test-cases/README.md` index. **T16's final SHAPE stays this lane's.**

**So the standing instruction changes to:** this lane's seam-1 PR **APPENDS its own subsections to an
existing §13** — it must NOT create the file, and a rebase must land C's version first.

**Owed, and to be cleared in one dedicated commit after rebasing onto C's #134:**
- §13 + `test-cases/13` entries for **T1** (nine variables, `/healthz` deploy sha, the CA fix, the
  strict-URL refusal closing case 6.124) and **T5** (both Dockerfiles, the `node-pg-migrate` move).
- Then **T2, T3, T4, T6** catalogue in their own change sets, as the convention actually requires.
### 🔒 §13 CASE-ID BLOCK — **LANE E OWNS 13.101–13.200**

Allocated by the controller 2026-09-06 **after Lanes C and D both minted from 13.1** — the same collision
class as §12's, one section over.

| lane | block |
|---|---|
| C | 13.1 – 13.40 |
| D | 13.41 – 13.100 |
| **E (this lane)** | **13.101 – 13.200** — seam 1, T11/T12, T13 |
| next | 13.201, on request |

**MINT FROM 13.101. Never from the file's apparent next-free position** — that position is what produced
the collision, because two lanes reading the same "next free" line at the same fork point both get it
right and still collide. **T16 re-states the header; it never renumbers.**

**Other sections this lane's 18 errands touch:** §6 (cases 6.123, 6.124), §7 (7.35), §9 (A0's 9.240/9.241,
already minted and confirmed correct against `test-cases/README.md`'s "new cases continue from 9.240").
For any NEW id in those: **measure `origin/main`'s maximum at rebase.** **§12 is BLOCKED — A 240–259,
B 260–289 — ASK before minting there.** §12 is not this lane's anyway.

# Lane C's #134 — what it does to this lane's CI surface

`ci.yml` becomes **8 jobs**, server suite **sharded 4-way**, `check:tasks` its own job,
**`postgresql-client-16` installed in server-tests with a version check**, plus two new guards:

1. **`scripts/check-no-silent-skips.mjs`** run on the server suite — reads vitest's native
   `--reporter=json` output (`testResults[].assertionResults[].status`) and fails when a file contributes
   zero real tests. **This is aimed straight at T11/T12's `describe.skipIf(!pgDumpAvailable())`**: if
   `pg_dump` is missing in CI, the suite no longer skips quietly — it goes red. That is the intended
   behaviour, not a problem to work around. C installs `postgresql-client-16` precisely so it passes.
2. **`scripts/check-skipif-coverage.mjs`** in check-env — **FAILS if `.skipIf(` appears ANYWHERE outside
   `apps/server/test/`.** Verified on this branch: zero occurrences anywhere at all (the positive control
   was also empty, so this is "none exists yet", not "correctly placed"). **T11/T12 must keep their
   `skipIf` under `apps/server/test/`.**

**The e2e job only DETECTS `docker-compose.dev.yml` and prints that T13 must supply the real invocation.
T13 stays this lane's**, and so does T6's compose file that the detection looks for.
