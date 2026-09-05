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
| merge-base with `origin/main` | `1e372e3` |
| HEAD at last refresh | `f621a8c` (verified reachable on `origin/exec/23-plan11`) |
| ahead of `origin/main` | 2 — `22ba60d` state file, `f621a8c` `.nvmrc`/`.npmrc` |
| tree state | clean |
| node | `v22.22.2` (`$HOME/.nvm/versions/node/v22.22.2/bin`), pnpm 9.15.0 |
| gate composition | baseline run IN FLIGHT at `f621a8c` — see "Gate baseline" below |

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
ps -eo pid=,comm=,args= | awk '$2 ~ /node$/ && index($0, "vitest") > 0 {print $1}'
```

Verified three ways, not reasoned about:
- **negative control** — returns 0 rows now (no orphans exist);
- **positive control** — a throwaway `node … /node_modules/vitest/dist/worker.js` IS matched, so the
  matcher is not vacuous. **This control earned its keep:** the first version of this awk had an
  unterminated character class and printed an *error* that read exactly like a clean empty result. Only
  the positive control separated "nothing there" from "the matcher is broken";
- **safety check** — all four peer session PIDs explicitly NOT matched.

## Where I am in the sequence

**Seam 1 (PR 1) — the server's deployment surface. IN PROGRESS.**

| # | item | state |
|---|---|---|
| A0 | wire `registerAttachmentRoutes` into `app.ts` (+ `Features.md` / cases 9.59, 9.61) | **next** |
| T1 | config surface + `/healthz` version | not started |
| T2 | CORS + rate limiting (**HTTP-Origin**, not envelope-origin) | not started |
| T3 | error alerting hook | not started |
| T4 | SMTP magic-link sender | not started |
| T5 | Dockerfiles (server migrates on boot; web `standalone`) | not started |
| — | `.nvmrc` = 22, `engine-strict=true` in `.npmrc` | **DONE — `f621a8c`** |
| T6 | `docker-compose.dev.yml`, five services, self-verifying env contract | not started (LAST in seam) |

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
- **`/healthz` returns `{status:'ok'}`, not `{ok:...}`.** Adding `version` breaks `app.test.ts:59` AND
  `events-route.test.ts:289` — **the plan names neither.** Decide explicitly whether the 503 branch
  carries `version` too (if yes, `app.test.ts:74` breaks as well). T6's smoke line must become
  `{"status":"ok","version":…}`.
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

- **`request.raw.url === '/v1/events'` carries the QUERY STRING** — `POST /v1/events?x=1` bypasses the
  limiter entirely. Use `request.routeOptions.url`, or strip at `?`. Same for `/v1/sync`.
- **`await reply.code(429).send(...)` in an `onRequest` hook then falling out returns `undefined`** —
  Fastify halts an async hook only on `return reply` or a throw. Expect `FST_ERR_REP_ALREADY_SENT` and a
  500 where a 429 was intended. **Verify at implementation.**
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
