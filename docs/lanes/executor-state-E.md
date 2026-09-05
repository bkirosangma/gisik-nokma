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
