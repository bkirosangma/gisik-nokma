# Deployment & Dogfooding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put Gisik Nokma on real infrastructure — a one-command local stack, a production deployment on DigitalOcean BLR1 at `pm.artsourced.in`, backups whose restore path is proven by the freshness gate, a monitoring floor — and load it with its two real dogfood workloads: the Convenience Corner shop's actual errands (seeded verbatim from the frozen tracker snapshot, inventing nothing) and Gisik Nokma's own build (one epic per plan in this series).

**Architecture:** Everything provider-specific lives behind config and under `deploy/`; the application code stays 12-factor (env vars in, JSON logs out, health at `/healthz`). Seeds are ordinary event batches pushed through the same ingest pipeline as any client — same rule engine, same refusals — with deterministic event ids so a re-run is a no-op, not a duplicate. Backups treat the event ledger as what it is: the source of truth from which every projection rebuilds, so the restore drill is restore + `verify-projections`, the freshness gate applied to disaster recovery.

**Tech Stack:** Docker + docker compose (Postgres 16, MinIO, Mailpit), multi-stage Dockerfiles on node:22-alpine, DigitalOcean App Platform / Managed PostgreSQL / Spaces — all in BLR1, the same stack convenience-corner runs (owner sign-off 2026-08-20) — `@aws-sdk/client-s3` for object storage in ops scripts, nodemailer for SMTP magic links, Playwright for deployed-stack E2E, GitHub Actions for CI.

**Spec:** `docs/superpowers/specs/2026-08-20-gisik-nokma-product-design.md` — this plan implements §7 "Dogfooding" and the deferred "Hosting provider, region, and pricing" decision from Out of scope, plus the operational floor the whole system stands on.

**Series position:** Plan 11 of 11 (`docs/superpowers/plans/2026-08-20-00-series-coordination.md` is the interface authority; where any plan disagrees with it, the coordination document wins). This plan executes LAST — Plans 1–10 are all landed by the time an executor picks this up. **Consumes** from Plan 1: `loadConfig`/`AppConfig`/`ConfigError`, `createPool`, `buildApp(deps, options)` with `GET /healthz`, `createIngestService`/`IngestService`/`IngestResult`, `buildProjectionRegistry()`, `verifyProjections` + the `verify:projections` CLI, `readLedger` (canonical replay order), the `events` append-only table, `createTestDatabase`, `newUlid`/`ULID_REGEX`, `EventEnvelope`/`SubmittedEvent`, the root `docker-compose.yml` (Postgres 16 on host port 54329, `gisik`/`gisik`, db `gisik_nokma`), the migrate script `pnpm --filter @gisik-nokma/server run migrate`. From Plan 2: `WorkflowDef` (with `initialStateId`, coordination §3; optional `blocked` on states, amendment 9), `workflow.defined` v1, `evaluateEvent`, the rule id `require-comment`. From Plan 3: the ticket event vocabulary (`ticket.created {typeId, projectId, parentId, title}`, `ticket.transitioned {toStateId, comment?, evidenceAttachmentId?}`, `ticket.field_set {fieldId, value}`, `ticket-type.defined`), `BUILTIN_TICKET_TYPE_SEEDS`/`builtinTicketTypeDefs(defaultWorkflowId)`, `dueDateValueSchema` (`{date: 'YYYY-MM-DD', note?}`), custom `date` fields take plain `'YYYY-MM-DD'` strings, `getTicketStateFromDb`. From Plan 4: better-auth at `/api/auth/*`, `MagicLinkSender`/`LogMagicLinkSender`, `OtpSender`/`LogOtpSender`, `createAuth`, `Queryable`, `membership.granted {userId, role, scope}` (entity id `membershipId(workspaceId, userId)`, coordination §5), `project.created {name}`, `visibility.set {ticketId, mode, userIds?}`. From Plans 5–10 (per the pinned amendments): WS `/v1/stream` (13), `ObjectStore` S3-compatible attachments (15), `POST /v1/sync` (16), `apps/web` = Next.js 15 (17), Plan 8's template payloads, Plan 10's dual-client harness. **Produces:** the compose dev stack, `.env.example` + its completeness gate, both seed CLIs, the backup/restore toolchain + restore drill test, the E2E smoke package, the CI pipeline, `deploy/do/app.yaml`, `docs/runbook.md`, Features.md §13, `test-cases/13-deployment-dogfooding.md`.

## Global Constraints

Copied from the series engineering contract and the spec; every task's requirements implicitly include this section.

- MONOREPO: pnpm workspaces + Turborepo, TypeScript strict, Node 22 LTS, pnpm 9. Package scope `@gisik-nokma/*` (coordination §1).
- TESTING: Vitest. Every refusal and every guard is proven against planted defects before it is trusted (spec §1 invariant 6).
- IDS: ULID via `ulidx`; `ULID_REGEX` in `@gisik-nokma/domain` is the arbiter of validity.
- EVENT ENVELOPE (exact): fields `id, workspaceId, entity{kind, id}, type, version, payload, actorId, origin('web'|'mobile'|'desktop'|'server'), clientTime, serverTime, seq`.
- Refusal shape (exact): `{refused: true; rule: string; reason: string}` — plain-language reason.
- **`reference/` is frozen.** The seed reads `reference/convenience-corner-tracker/board.data.js` strictly read-only; nothing under `reference/` is ever edited, and the compose stack mounts it `:ro`.
- **Spec invariant 4 — "Nothing is invented" — binds seed scripts.** A record without a date stays undated; an undated item is absent from the calendar; every dated claim the seed makes traces to a date the frozen record itself carries (or to the tracker's own published week arithmetic, cited below). Planted-defect tests prove it.
- The audience constraint governing all hosting decisions: **India-reachable, phone-first** (spec: Out of scope defers provider/region/pricing to this plan *under that constraint*).
- `Features.md` §13 and `test-cases/13-deployment-dogfooding.md` (cases 13.x) move in the same change set as the work. This plan claims no other section numbers.
- Delivery: one PR per change, branched off `main`, merged only with explicit approval (spec, "Constraints carried from the base"). `main` is deliberately **not** server-side protected (owner sign-off 2026-08-20 — free private repo, same as convenience-corner); the standing instruction never to commit or push to `main` directly lives in the repo's `CLAUDE.md`, and that instruction is the enforcement. Task 14 Step 4 verifies it is there.

---

## Production stack — DigitalOcean BLR1, at `pm.artsourced.in` (DECIDED, owner sign-off 2026-08-20)

**The decision:** DigitalOcean, region **BLR1 (Bengaluru)** — App Platform for the server and web containers, Managed PostgreSQL in BLR1, Spaces in BLR1 for attachments and backups. This is the **same stack convenience-corner runs**; the owner signed it off on 2026-08-20, along with the custom domain **`pm.artsourced.in`** (a subdomain of the existing `artsourced.in` zone). Task 15's gate is therefore lifted — it executes with the rest of the plan.

**Object storage: Spaces, not Cloudflare R2 (the comparison, recorded so the reasoning survives).** R2 was considered and lost on **data residency**. Gisik Nokma takes arbitrary user uploads served under permission checks — attachments on tickets whose visibility is enforced per viewer — which is a different thing from convenience-corner's owner-controlled public shop imagery, and it makes *where the bytes physically live* a decision rather than a detail. R2 cannot pin data to India: it offers EU and US jurisdictions only, with `apac` a best-effort, unchangeable location *hint*. Spaces BLR1 keeps the files in Bengaluru, beside the Postgres ledger that describes them. The cost gap at v1 scale is a few dollars a month — not enough to buy a jurisdiction we cannot name. `ObjectStore`/`ObjectSink` speak the S3 protocol either way, so R2 stays available later: **revisit when monthly egress approaches 1 TiB**, the scale at which R2's zero egress charge starts to win materially.

**Why this and not elsewhere:**

1. **The audience constraint.** The primary users are non-technical operators in India on phones (spec, Decisions table). BLR1 is the only in-India region among the managed-PaaS providers with a one-file deploy story; serving Tura or Bengaluru from Singapore or Frankfurt adds 40–150 ms to every round-trip on networks that are already the slow link. The web client is online-only (spec §5) — latency is product quality here, not a nicety.
2. **The convenience-corner precedent.** The base project's infrastructure decisions already targeted DigitalOcean BLR1 — the frozen tracker snapshot itself records it: the `ops:accountant-cloud-gst` record reads "The chosen providers bill in USD. DigitalOcean and Cloudflare invoice in dollars" and asks the accountant about the GST reverse-charge treatment of that spend. The shop's operational memory (which this plan seeds into the product) is already shaped around this stack; the dogfood is more honest when the product runs where its first workload's records say its lineage runs.
3. **One operator.** App Platform is a single YAML (`deploy/do/app.yaml`), managed TLS, managed Postgres with daily platform backups, no VPC/IAM assembly. The whole ops surface must be carryable by one person who is also building the product.

**Monthly cost sketch** (list prices, **approximate — a sketch, not a quote; verify current pricing at provision time**):

| Component | Size | ~USD/mo |
|---|---|---|
| App Platform — server | professional-xs (1 vCPU / 1 GiB) | $12 |
| App Platform — web | basic-xs (1 vCPU / 512 MiB) | $5 |
| App Platform — backup worker | basic-xxs | $5 |
| Managed PostgreSQL | basic, 1 GiB RAM / 1 vCPU / 10 GiB disk | $15 |
| Spaces (attachments + backups) | 250 GiB storage, 1 TiB egress | $5 |
| Uptime check + email alerts | 1 check | $0 |
| SMTP (magic-link email) | Brevo free tier, 300/day | $0 |
| **Total** | | **≈ $42/mo (≈ ₹3,700 at ~₹88/USD — verify)** |

**The USD-invoicing tradeoff — accepted, already known, not a new question.** DigitalOcean and Cloudflare both invoice in US dollars, exactly as convenience-corner's own records state ("The chosen providers bill in USD. DigitalOcean and Cloudflare invoice in dollars", `ops:accountant-cloud-gst`, seeded by this plan). An Indian buyer therefore pays a **card/forex markup on top of the list price**, and **GST on imported services applies under reverse charge**. Both are accepted costs of this stack, carried over with it — the rupee figure above is a conversion, not an invoice total. The accountant question in the seeded board stays open on its own terms (how to *treat* the spend), and its answer does not reopen the provider decision.

**The one named alternative — AWS Mumbai (ap-south-1) — considered, NOT taken (decision made 2026-08-20; recorded because the reasoning may matter again).** AWS bills Indian customers in INR through AISPL with proper Indian GST invoices — exactly the "rupee billing with a proper Indian GST invoice" simplification the shop's accountant question is probing — and SES makes transactional email nearly free. The trade is that Lightsail/ECS + RDS + S3 replaces one YAML with IAM, VPC and service assembly that a one-operator team must own, and the owner judged that ops surface the more expensive of the two costs. The consideration stands recorded, not open: if the accountant's answer later makes INR billing decisive, the compose file and the 12-factor env contract mean the swap is contained to `deploy/` and a re-point of `S3_*`/`DATABASE_URL`/`SMTP_URL`.

**Isolation discipline (what keeps the alternative cheap, and R2 reachable):** nothing outside `deploy/do/` knows the provider's name. The app reads `DATABASE_URL`, `S3_ENDPOINT`, `SMTP_URL`, `ALERT_WEBHOOK_URL`; the backup scripts speak the S3 protocol (MinIO locally, Spaces BLR1 in prod, R2 or S3 proper if a later decision moves object storage). Task 15 writes the DO spec; no other task mentions DigitalOcean in code. This is what makes the R2 revisit above a config change rather than a project.

**✅ SIGNED OFF 2026-08-20** — see Open questions #1 and #3, both settled. Task 15 (the DO spec) is no longer gated; the whole plan executes end to end.

**Production auth honesty note:** phone OTP delivery in India requires a DLT-registered SMS provider (spec §6) — and the seeded board itself tracks the shop's twin of that errand (`ops:dlt-entity`: "Gates every SMS the platform will ever send — OTP included"). Until a DLT registration exists for Gisik Nokma, production sign-in is email magic link + Google OAuth + passkeys; the `OtpSender` stays on `LogOtpSender` (dev-only) and no SMS is attempted. This is invariant 4 applied to operations: we do not pretend a channel exists before its registration clears.

---

## The Convenience Corner seed — mapping the frozen record, inventing nothing

**Source (read-only, frozen):** `reference/convenience-corner-tracker/board.data.js` — a generated snapshot (see `reference/convenience-corner-tracker/PROVENANCE.md`, upstream commit `24e2240`) holding the shop's real errands. The seed reads the two operational epics: `registrations` (13 items) and `questions` (10 items) — 23 tickets. The phase/test-case epics are the *base project's* dev work, not shop errands, and are not seeded.

**Target shape:** workspace **"Convenience Corner"** → project **"Shop operations"** → two epic tickets (**"Registrations"**, **"Open questions"** — titles verbatim from the tracker's epic labels) → 23 errand tickets of custom type **Errand** on the **errand-with-waits** template (Plan 8's payload, consumed by name — see Task 7). The accountant joins as a **guest** with explicit visibility on exactly the tickets whose record names them.

**Status mapping (tracker state → errand-with-waits state).** The tracker's states are `later · next · in-progress · blocked` plus `done` when the origin record is closed (`reference/convenience-corner-tracker/README.md`):

| tracker `state` | meaning in the tracker | errand-with-waits state | category | count in snapshot `24e2240` |
|---|---|---|---|---|
| `later` | not started, not queued | `later` (initial — no transition emitted) | open | 5 |
| `next` | queued next | `next` | open | 14 |
| `in-progress` | asked / submitted, running | `in-progress` | active | 1 |
| `blocked` | waiting on another item | `waiting` (`blocked: true`) | active | 3 |
| `done` | origin record closed | **never seeded** — see below | terminal | 0 |

The two seeded epics contain **zero** `done` items, so the seed never emits a terminal-state claim. This is enforced, not incidental: the seed **refuses** (throws, naming the item) if it ever meets a `done` item or an unknown state — closing a ticket is a human's claim to make in the product, with the comment the workflow demands, never a script's. Every emitted transition is a **single hop from the template's initial state**; if the template cannot reach a mapped state in one legal transition, the seed refuses rather than fabricating intermediate claims ("was in progress") that the record never made. Both refusals are planted-defect tested (Task 8).

**Date mapping — the heart of invariant 4:**

| record field | provenance | seeded claim |
|---|---|---|
| `started` (from origin frontmatter `asked_on`/`submitted_on` — `build_tracker.py` lines 272–275) | origin truth | `ticket.field_set {fieldId: 'startDate', value: '<the date verbatim>'}` — exactly one item carries it in this snapshot (`ops:accountant-hsn-digits`, `2026-08-18`) |
| `meta.needed_week` (origin frontmatter) | origin truth, a week number | `ticket.field_set {fieldId: 'dueDate', value: {date: <week end>, note: 'from the tracker record — first needed in week N'}}`, attributed to the owner. The week-number→date arithmetic is **the tracker's own**: `build_tracker.py` line 390 computes `week_end = week1 + timedelta(days=7 * int(nw) - 1)` with `week1 = '2026-08-18'` published in the data file itself. Derived from the record's own semantics — not invented. `needed_week: 0` (one item, `ops:owner-github-plan`) maps to `2026-08-17` by the same arithmetic; the raw week number rides in the note so nothing is laundered. |
| `since` / `start` / `due` (authored in `board.json` — **attention**, not origin truth; the tracker README: "The origins own truth. The tracker owns attention.") | authored schedule | **No date claim.** Recorded verbatim in the ticket body under "tracker attention schedule (authored in board.json, not origin truth)". `ops:duns` — which has `since` but no `started` — is the natural planted defect proving the seed distinguishes the two. |
| absent date | — | **absent claim.** No startDate, no dueDate, nothing on the calendar. Planted-defect tested. |

**Everything else** goes into the ticket **body** (description), verbatim: the record body text (kept as literal text lines — no markdown interpretation, so `**Gates:**` renders as typed, honouring the editor's literal-text contract), then a "— tracker record —" block: tracker id, origin file, counterparty (`meta.counterparty` for registrations, `meta.who` for questions — the asks' counterparties, per the assignment), cost, lead time, clears/needed/slack week numbers raw, `blocked_by` resolved to the blocking item's title (plus its tracker id), the tracker note, the attention schedule, and the **ask text verbatim** where the record drafted one. The Errand type carries two custom fields: `counterparty` (text) and `startDate` (date).

**People are never invented.** The seed looks the owner and the accountant up by email in the auth store; if the owner has not signed in once, the seed refuses. `--allow-missing-guest` seeds everything except the guest membership + explicit visibility, and a later re-run (idempotent) completes them once the accountant has signed in.

**Explicit visibility** (`visibility.set`, mode `explicit`) goes on exactly the tickets whose record names the accountant as counterparty (`meta.who === 'Accountant'`): `ops:accountant-cloud-gst`, `ops:accountant-gst-scheme`, `ops:accountant-hsn-digits`, `ops:accountant-hsn-values`. The `userIds` list is `[ownerUserId, accountantUserId]` — the explicit list is exactly the authored list (Plan 4): the owner must be on it or the owner loses sight of their own errands.

**Idempotence mechanism:** every seed event id is a **deterministic ULID** derived from a stable key (`seedUlid('event', 'cc#ops:duns#created')`). Re-running submits identical ids; the ledger answers `duplicate-event-id` (Plan 1 / coordination amendment); the seed counts those as "already present" and commits nothing twice. Any *other* invalid or refused result fails the seed loudly — a seed that cannot land cleanly must not land partially.

## The Gisik Nokma dev seed — the product managing its own build

Workspace **"Gisik Nokma"** → project **"Build — the plan series"** on the **simple-kanban** template: one **epic per plan document** (title = the plan's H1, verbatim; description = its `**Goal:**` line + the source path), one **task ticket per `### Task N:` heading** (title verbatim). The seed parses `docs/superpowers/plans/2026-08-20-*.md` (skipping `00`, the coordination doc) — the plan documents themselves are the record, so nothing is invented and the seed stays correct if a plan gains a task. **No dates, no transitions:** the plan series claims no dates, so the calendar stays empty (invariant 4), and no script claims progress on work it did not do — execution state is authored in the product, by humans, as it happens. Planted-defect tested.

## File structure

```
.dockerignore                                  — keeps images lean; excludes reference/ (compose mounts it :ro)
.env.example                                   — every config var, documented; gated by check-env-example
docker-compose.dev.yml                         — the one-command dev stack (postgres, minio, mailpit, server, web)
scripts/check-env-example.mjs                  — the env contract gate
scripts/restore.sh                             — pg_restore wrapper with scratch-db guard
deploy/do/app.yaml                             — DigitalOcean App Platform spec, BLR1, pm.artsourced.in (Task 15)
docs/runbook.md                                — deploy · rotate secrets · restore drill · incident basics
.github/workflows/ci.yml                       — lint → typecheck → unit → fixtures → dual-client → e2e
apps/server/Dockerfile                         — multi-stage build; migrations on boot
apps/server/docker-entrypoint.sh
apps/web/Dockerfile                            — Next.js standalone
apps/server/src/http/rate-limit.ts             — fixed-window limiter (auth + events routes)
apps/server/src/alerts/error-alerter.ts        — ErrorAlerter · WebhookErrorAlerter · NoopErrorAlerter
apps/server/src/auth/smtp-magic-link-sender.ts — nodemailer sender (SMTP_URL-selected)
apps/server/src/seed/seed-ulid.ts              — deterministic ULIDs for idempotent seeds
apps/server/src/seed/doc-text.ts               — plainTextDoc: literal text → ProseMirror JSON
apps/server/src/seed/users.ts                  — findUserIdByEmail (people are never invented)
apps/server/src/seed/templates.ts              — template consumption + checkErrandTemplate + status map
apps/server/src/seed/cc-board.ts               — frozen-snapshot reader (vm sandbox) + types
apps/server/src/seed/cc-map.ts                 — record → events mapping (pure)
apps/server/src/seed/seed-convenience-corner.ts— the CC seed runner
apps/server/src/seed/cli-seed-convenience-corner.ts
apps/server/src/seed/plan-series.ts            — plan-doc parser for the dev seed
apps/server/src/seed/seed-dev-workspace.ts     — the dev seed runner
apps/server/src/seed/cli-seed-dev-workspace.ts
apps/server/src/ops/object-sink.ts             — ObjectSink + s3Sink (MinIO/Spaces/S3)
apps/server/src/ops/export-ledger.ts           — weekly ledger export (the source of truth, exported)
apps/server/src/ops/pg-dump.ts                 — nightly pg_dump → object storage
apps/server/src/ops/schedule.ts                — msUntilNextUtc + daemon loop
apps/server/src/ops/backup-daemon-main.ts      — worker entrypoint
apps/server/src/ops/fetch-backup.ts            — download a backup object to a local file
e2e/                                           — @gisik-nokma/e2e Playwright package
Features.md §13 · test-cases/13-deployment-dogfooding.md
```

## The data-testid contract (pinned for the E2E; Plan 6 must honour or amend via coordination)

The deployed-stack smoke drives the web client through stable `data-testid` hooks. This table is the contract; Open questions #5 flags it to Plan 6.

| testid | element |
|---|---|
| `auth-email-input` / `auth-magic-link-submit` | email field + submit on the sign-in screen |
| `workspace-card-<workspaceId>` | workspace entry after sign-in |
| `project-card-<projectId>` | project entry inside a workspace |
| `board-column-<stateId>` | one board column (columns are exactly the workflow's states) |
| `ticket-card-<ticketId>` | a card on the board |
| `ticket-create-button` / `ticket-title-input` / `ticket-create-submit` | the create-ticket affordance |
| `transition-option-<stateId>` | a state choice on the open ticket |
| `transition-refusal` / `transition-refusal-reason` | the refusal surface with its named reason |
| `transition-comment-input` / `transition-confirm` | comment + confirm on a guarded transition |
| `not-found` | the invisible-or-nonexistent ticket page |

---

### Task 1: Deployment config surface — the env contract grows, `/healthz` learns its version

**Files:**
- Modify: `apps/server/src/config.ts` (Plan 1's `loadConfig`)
- Modify: `apps/server/src/db/pool.ts` (Plan 1's `createPool` — adjust the path if Plan 1 placed it elsewhere; it is the module exporting `createPool`)
- Modify: `apps/server/src/app.ts` (the `/healthz` handler)
- Test: `apps/server/test/config-deploy.test.ts`, extend `apps/server/test/app.test.ts` (or wherever Plan 1's healthz test lives — add a new test file if unclear: `apps/server/test/healthz-version.test.ts`)

**Interfaces:**
- Consumes: `loadConfig(env): AppConfig`, `ConfigError`, `createPool(databaseUrl)`, `buildApp(deps, options?: {logLevel?})` (Plan 1).
- Produces (later tasks read these):
  - `AppConfig` gains: `webOrigin: string | null; trustProxy: boolean; rateLimitAuthMax: number; rateLimitEventsMax: number; rateLimitWindowSec: number; alertWebhookUrl: string | null; smtpUrl: string | null; magicLinkFrom: string; databaseCaCert: string | null`.
  - Env contract additions: `WEB_ORIGIN` (optional), `TRUST_PROXY` (`'true'`/`'false'`, default false), `RATE_LIMIT_AUTH_MAX` (default 10), `RATE_LIMIT_EVENTS_MAX` (default 120), `RATE_LIMIT_WINDOW_SEC` (default 60), `ALERT_WEBHOOK_URL` (optional), `SMTP_URL` (optional), `MAGIC_LINK_FROM` (default `sign-in@gisik-nokma.local`), `DATABASE_CA_CERT` (optional, PEM).
  - `createPool(databaseUrl: string, options?: { caCert?: string | null }): Pool` — additive; when `caCert` is set the pool connects with `ssl: { ca: caCert }` (managed-Postgres TLS).
  - `buildApp(deps, options?: { logLevel?; version?: string })` — `GET /healthz` response gains `version` (from options, `'dev'` when absent), keeping every field Plan 1 already returns.

- [ ] **Step 1: Write the failing config tests**

`apps/server/test/config-deploy.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from '../src/config.js';

const BASE = { DATABASE_URL: 'postgres://gisik:gisik@localhost:54329/gisik_nokma' };

describe('deployment config surface', () => {
  it('defaults the new knobs when unset', () => {
    const config = loadConfig({ ...BASE } as NodeJS.ProcessEnv);
    expect(config.webOrigin).toBeNull();
    expect(config.trustProxy).toBe(false);
    expect(config.rateLimitAuthMax).toBe(10);
    expect(config.rateLimitEventsMax).toBe(120);
    expect(config.rateLimitWindowSec).toBe(60);
    expect(config.alertWebhookUrl).toBeNull();
    expect(config.smtpUrl).toBeNull();
    expect(config.magicLinkFrom).toBe('sign-in@gisik-nokma.local');
    expect(config.databaseCaCert).toBeNull();
  });

  it('reads overrides', () => {
    const config = loadConfig({
      ...BASE,
      WEB_ORIGIN: 'https://app.example',
      TRUST_PROXY: 'true',
      RATE_LIMIT_AUTH_MAX: '60',
      RATE_LIMIT_EVENTS_MAX: '600',
      RATE_LIMIT_WINDOW_SEC: '30',
      ALERT_WEBHOOK_URL: 'https://hooks.example/T/B',
      SMTP_URL: 'smtp://mailpit:1025',
      MAGIC_LINK_FROM: 'hello@gisik.example',
      DATABASE_CA_CERT: '-----BEGIN CERTIFICATE-----\nabc\n-----END CERTIFICATE-----',
    } as NodeJS.ProcessEnv);
    expect(config.webOrigin).toBe('https://app.example');
    expect(config.trustProxy).toBe(true);
    expect(config.rateLimitAuthMax).toBe(60);
    expect(config.rateLimitEventsMax).toBe(600);
    expect(config.rateLimitWindowSec).toBe(30);
    expect(config.alertWebhookUrl).toBe('https://hooks.example/T/B');
    expect(config.smtpUrl).toBe('smtp://mailpit:1025');
    expect(config.magicLinkFrom).toBe('hello@gisik.example');
    expect(config.databaseCaCert).toContain('BEGIN CERTIFICATE');
  });

  it('planted defect: a non-integer rate limit is refused with the variable named', () => {
    expect(() => loadConfig({ ...BASE, RATE_LIMIT_AUTH_MAX: 'lots' } as NodeJS.ProcessEnv)).toThrowError(ConfigError);
    expect(() => loadConfig({ ...BASE, RATE_LIMIT_AUTH_MAX: 'lots' } as NodeJS.ProcessEnv)).toThrowError(/RATE_LIMIT_AUTH_MAX/);
  });

  it('planted defect: TRUST_PROXY only accepts true/false', () => {
    expect(() => loadConfig({ ...BASE, TRUST_PROXY: 'yes' } as NodeJS.ProcessEnv)).toThrowError(/TRUST_PROXY/);
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm --filter @gisik-nokma/server exec vitest run test/config-deploy.test.ts`
Expected: FAIL — the new properties do not exist on `AppConfig`.

- [ ] **Step 3: Extend `loadConfig`**

In `apps/server/src/config.ts`, extend the `AppConfig` type with the nine properties from the Produces block, and add to the loader (reusing Plan 1's error style — collect offenders into `ConfigError` naming the variable):

```ts
function optionalString(env: NodeJS.ProcessEnv, name: string): string | null {
  const raw = env[name];
  return raw === undefined || raw === '' ? null : raw;
}

function positiveInt(env: NodeJS.ProcessEnv, name: string, fallback: number, problems: string[]): number {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    problems.push(`${name} must be a positive integer, got ${JSON.stringify(raw)}`);
    return fallback;
  }
  return value;
}

function boolFlag(env: NodeJS.ProcessEnv, name: string, fallback: boolean, problems: string[]): boolean {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  if (raw !== 'true' && raw !== 'false') {
    problems.push(`${name} must be 'true' or 'false', got ${JSON.stringify(raw)}`);
    return fallback;
  }
  return raw === 'true';
}
```

and in the returned config object:

```ts
webOrigin: optionalString(env, 'WEB_ORIGIN'),
trustProxy: boolFlag(env, 'TRUST_PROXY', false, problems),
rateLimitAuthMax: positiveInt(env, 'RATE_LIMIT_AUTH_MAX', 10, problems),
rateLimitEventsMax: positiveInt(env, 'RATE_LIMIT_EVENTS_MAX', 120, problems),
rateLimitWindowSec: positiveInt(env, 'RATE_LIMIT_WINDOW_SEC', 60, problems),
alertWebhookUrl: optionalString(env, 'ALERT_WEBHOOK_URL'),
smtpUrl: optionalString(env, 'SMTP_URL'),
magicLinkFrom: optionalString(env, 'MAGIC_LINK_FROM') ?? 'sign-in@gisik-nokma.local',
databaseCaCert: optionalString(env, 'DATABASE_CA_CERT'),
```

(`problems` is whatever accumulator Plan 1's loader already uses before throwing `ConfigError`; if it throws per-variable instead, follow that style — the tests only pin the behavior.)

- [ ] **Step 4: Extend `createPool` with the CA option**

In the module exporting `createPool`, make the signature `createPool(databaseUrl: string, options: { caCert?: string | null } = {})` and pass `ssl: options.caCert ? { ca: options.caCert } : undefined` into the `Pool` constructor alongside whatever Plan 1 already configures. Add to `apps/server/test/config-deploy.test.ts`:

```ts
import { createPool } from '../src/db/pool.js';

describe('createPool TLS', () => {
  it('carries the CA into the pool options when given', () => {
    const pool = createPool('postgres://gisik:gisik@localhost:54329/gisik_nokma', { caCert: 'PEM' });
    expect((pool.options.ssl as { ca: string }).ca).toBe('PEM');
    void pool.end();
  });
  it('leaves ssl unset without a CA', () => {
    const pool = createPool('postgres://gisik:gisik@localhost:54329/gisik_nokma');
    expect(pool.options.ssl).toBeUndefined();
    void pool.end();
  });
});
```

Update the server main wiring (where `createPool(config.databaseUrl)` is called) to pass `{ caCert: config.databaseCaCert }`.

- [ ] **Step 5: `/healthz` version**

`apps/server/test/healthz-version.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';

describe('healthz version', () => {
  const db = { query: async () => [{ ok: 1 }] };
  const deps = { db } as Parameters<typeof buildApp>[0];

  it('reports the running version', async () => {
    const app = buildApp(deps, { version: '0.3.1' });
    const response = await app.inject({ method: 'GET', url: '/healthz' });
    expect(response.statusCode).toBe(200);
    expect(response.json().version).toBe('0.3.1');
  });

  it("defaults to 'dev' so a missing wire-up is visible, not invisible", async () => {
    const app = buildApp(deps);
    const response = await app.inject({ method: 'GET', url: '/healthz' });
    expect(response.json().version).toBe('dev');
  });
});
```

(`deps` needs whatever else Plan 1's final `AppDeps` requires — `ingest` may be mandatory; if so, stub it as `{ ingestBatch: async () => [], onEventCommitted: () => () => {} }`.) In `buildApp`, add `version?: string` to options and include `version: options?.version ?? 'dev'` in the healthz response object, keeping the existing fields. In the server main, pass the version read from `apps/server/package.json` (`import pkg from '../package.json' with { type: 'json' }` or `createRequire`-load it — match the repo's module style).

- [ ] **Step 6: Run the suite**

Run: `pnpm --filter @gisik-nokma/server exec vitest run test/config-deploy.test.ts test/healthz-version.test.ts`
Expected: PASS. Also run the full server suite (`pnpm --filter @gisik-nokma/server test`) — the additive changes must break nothing.

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/config.ts apps/server/src/db/pool.ts apps/server/src/app.ts apps/server/test/config-deploy.test.ts apps/server/test/healthz-version.test.ts
git commit -m "feat(server): deployment config surface — CORS/rate-limit/alert/SMTP/TLS knobs, versioned healthz

The env contract grows the nine knobs deployment needs, every one refused
loudly when malformed and named in the error. createPool learns a CA so
managed Postgres TLS is config, not code. healthz now says which build is
answering."
```

### Task 2: CORS and rate limiting — the door learns to say "slow down", in config's language

**Files:**
- Create: `apps/server/src/http/rate-limit.ts`
- Modify: `apps/server/src/app.ts` (register CORS + limiter hooks in `buildApp`)
- Modify: `apps/server/package.json` (add `@fastify/cors`)
- Test: `apps/server/test/http/rate-limit.test.ts`, `apps/server/test/http/security-middleware.test.ts`

**Interfaces:**
- Consumes: `buildApp` (Task 1's extended options), Plan 4's `/api/auth/*` mount, Plan 1's `POST /v1/events`, Plan 10's `POST /v1/sync`.
- Produces:
  - `makeFixedWindowLimiter(max: number, windowSec: number): RateLimiter` with `RateLimiter = { check(key: string, nowMs: number): { allowed: boolean; retryAfterSeconds: number } }`.
  - `buildApp` options gain `security?: { webOrigin: string | null; rateLimit: { authMax: number; eventsMax: number; windowSec: number } | null; trustProxy?: boolean }`. **When `security` is absent, behavior is exactly as before this task** — earlier plans' test suites hammer `/v1/events` and must not start tripping limits. The server main passes real config; tests opt in.
  - Wire contract: `/api/auth/*` limited per client IP at `authMax`/`windowSec`; `POST /v1/events` and `POST /v1/sync` limited per client IP at `eventsMax`/`windowSec`; refusal is HTTP 429 `{ "error": "rate_limited", "retryAfterSeconds": n }` with a `retry-after` header. Values: production defaults 10/60 s (auth) and 120/60 s (events); the dev/CI compose stack overrides to 60 and 600 so seeds and E2E never trip it.

- [ ] **Step 1: Write the failing limiter unit tests**

`apps/server/test/http/rate-limit.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { makeFixedWindowLimiter } from '../../src/http/rate-limit.js';

describe('fixed-window rate limiter', () => {
  it('allows up to max within the window, then refuses with a retry hint', () => {
    const limiter = makeFixedWindowLimiter(3, 60);
    const t0 = 1_000_000;
    expect(limiter.check('ip:1', t0).allowed).toBe(true);
    expect(limiter.check('ip:1', t0 + 10).allowed).toBe(true);
    expect(limiter.check('ip:1', t0 + 20).allowed).toBe(true);
    const fourth = limiter.check('ip:1', t0 + 30);
    expect(fourth.allowed).toBe(false);
    expect(fourth.retryAfterSeconds).toBeGreaterThan(0);
    expect(fourth.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it('keys are independent', () => {
    const limiter = makeFixedWindowLimiter(1, 60);
    expect(limiter.check('ip:1', 0).allowed).toBe(true);
    expect(limiter.check('ip:2', 1).allowed).toBe(true);
    expect(limiter.check('ip:1', 2).allowed).toBe(false);
  });

  it('the window resets', () => {
    const limiter = makeFixedWindowLimiter(1, 60);
    expect(limiter.check('ip:1', 0).allowed).toBe(true);
    expect(limiter.check('ip:1', 59_999).allowed).toBe(false);
    expect(limiter.check('ip:1', 60_000).allowed).toBe(true);
  });
});
```

- [ ] **Step 2: Run to fail, then implement the limiter**

Run: `pnpm --filter @gisik-nokma/server exec vitest run test/http/rate-limit.test.ts` — FAIL (module missing). Then `apps/server/src/http/rate-limit.ts`:

```ts
export type RateLimiter = {
  check(key: string, nowMs: number): { allowed: boolean; retryAfterSeconds: number };
};

const SWEEP_THRESHOLD = 10_000;

/**
 * Fixed-window, in-memory, per-process. Deliberately the floor, not the
 * ceiling: one instance serves the dogfood; the day a second instance exists,
 * this moves behind Redis — the call sites and the config contract stay put.
 */
export function makeFixedWindowLimiter(max: number, windowSec: number): RateLimiter {
  const windows = new Map<string, { count: number; resetAtMs: number }>();
  return {
    check(key, nowMs) {
      if (windows.size > SWEEP_THRESHOLD) {
        for (const [k, w] of windows) if (nowMs >= w.resetAtMs) windows.delete(k);
      }
      const current = windows.get(key);
      if (!current || nowMs >= current.resetAtMs) {
        windows.set(key, { count: 1, resetAtMs: nowMs + windowSec * 1000 });
        return { allowed: true, retryAfterSeconds: 0 };
      }
      current.count += 1;
      if (current.count > max) {
        return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((current.resetAtMs - nowMs) / 1000)) };
      }
      return { allowed: true, retryAfterSeconds: 0 };
    },
  };
}
```

Re-run: PASS.

- [ ] **Step 3: Write the failing app-level tests**

`apps/server/test/http/security-middleware.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';

const db = { query: async () => [{ ok: 1 }] };
const deps = { db, ingest: { ingestBatch: async () => [], onEventCommitted: () => () => {} } } as Parameters<typeof buildApp>[0];

describe('rate limiting', () => {
  it('429s the request over the auth limit, names the refusal, sets retry-after', async () => {
    const app = buildApp(deps, { security: { webOrigin: null, rateLimit: { authMax: 2, eventsMax: 100, windowSec: 60 } } });
    await app.inject({ method: 'GET', url: '/api/auth/anything' });
    await app.inject({ method: 'GET', url: '/api/auth/anything' });
    const third = await app.inject({ method: 'GET', url: '/api/auth/anything' });
    expect(third.statusCode).toBe(429);
    expect(third.json()).toMatchObject({ error: 'rate_limited' });
    expect(Number(third.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('limits POST /v1/events on its own budget', async () => {
    const app = buildApp(deps, { security: { webOrigin: null, rateLimit: { authMax: 100, eventsMax: 1, windowSec: 60 } } });
    await app.inject({ method: 'POST', url: '/v1/events', payload: { events: [{}] } });
    const second = await app.inject({ method: 'POST', url: '/v1/events', payload: { events: [{}] } });
    expect(second.statusCode).toBe(429);
  });

  it('planted defect: without the security option nothing is limited (earlier suites stay green)', async () => {
    const app = buildApp(deps);
    for (let i = 0; i < 30; i += 1) {
      const response = await app.inject({ method: 'GET', url: '/healthz' });
      expect(response.statusCode).toBe(200);
    }
  });
});

describe('CORS', () => {
  it('answers preflight for the configured web origin', async () => {
    const app = buildApp(deps, { security: { webOrigin: 'http://localhost:3001', rateLimit: null } });
    const response = await app.inject({
      method: 'OPTIONS',
      url: '/v1/events',
      headers: { origin: 'http://localhost:3001', 'access-control-request-method': 'POST' },
    });
    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:3001');
  });

  it('planted defect: a foreign origin gets no allow header', async () => {
    const app = buildApp(deps, { security: { webOrigin: 'http://localhost:3001', rateLimit: null } });
    const response = await app.inject({
      method: 'OPTIONS',
      url: '/v1/events',
      headers: { origin: 'https://evil.example', 'access-control-request-method': 'POST' },
    });
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });
});
```

Run: FAIL (options shape unknown, no 429s, no CORS headers).

- [ ] **Step 4: Wire CORS and the limiters into `buildApp`**

Run: `pnpm --filter @gisik-nokma/server add @fastify/cors`. In `apps/server/src/app.ts`:

```ts
import cors from '@fastify/cors';
import { makeFixedWindowLimiter } from './http/rate-limit.js';
```

Extend the options type with `security` (shape in Produces). When constructing Fastify, pass `trustProxy: options?.security?.trustProxy ?? false` (App Platform fronts the app with a proxy; `request.ip` must be the client, not the router). After creating `app`:

```ts
const security = options?.security;
if (security?.webOrigin) {
  await app.register(cors, { origin: security.webOrigin, credentials: true });
}
if (security?.rateLimit) {
  const { authMax, eventsMax, windowSec } = security.rateLimit;
  const authLimiter = makeFixedWindowLimiter(authMax, windowSec);
  const eventsLimiter = makeFixedWindowLimiter(eventsMax, windowSec);
  app.addHook('onRequest', async (request, reply) => {
    const url = request.raw.url ?? '';
    let verdict: { allowed: boolean; retryAfterSeconds: number } | null = null;
    if (url.startsWith('/api/auth/')) {
      verdict = authLimiter.check(`auth:${request.ip}`, Date.now());
    } else if (request.method === 'POST' && (url === '/v1/events' || url === '/v1/sync')) {
      verdict = eventsLimiter.check(`events:${request.ip}`, Date.now());
    }
    if (verdict && !verdict.allowed) {
      await reply
        .code(429)
        .header('retry-after', String(verdict.retryAfterSeconds))
        .send({ error: 'rate_limited', retryAfterSeconds: verdict.retryAfterSeconds });
    }
  });
}
```

If `buildApp` is not already async, registering cors inside it requires it to be (Fastify's `register` returns a thenable that `inject` awaits via `app.ready()`; keep `buildApp` synchronous by using `void app.register(...)` — Fastify queues plugins until ready — matching however Plan 1/4 register plugins). In the server main, pass `security: { webOrigin: config.webOrigin, rateLimit: { authMax: config.rateLimitAuthMax, eventsMax: config.rateLimitEventsMax, windowSec: config.rateLimitWindowSec }, trustProxy: config.trustProxy }`.

- [ ] **Step 5: Run to green, then the whole server suite**

Run: `pnpm --filter @gisik-nokma/server exec vitest run test/http/` then `pnpm --filter @gisik-nokma/server test`
Expected: all PASS — in particular every pre-existing suite, proving the opt-in stance.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/http/rate-limit.ts apps/server/src/app.ts apps/server/package.json pnpm-lock.yaml apps/server/test/http/
git commit -m "feat(server): CORS for the web origin, fixed-window rate limits on auth and events

/api/auth/* takes 10/min per IP and the event doors 120/min by default,
config-tunable, refused as 429 rate_limited with retry-after. Opt-in via
buildApp options so earlier suites keep their throughput. In-memory by
design: the floor for one instance, Redis the day there are two."
```

### Task 3: Error alerting hook — failures phone somewhere, the somewhere is config

**Files:**
- Create: `apps/server/src/alerts/error-alerter.ts`
- Modify: `apps/server/src/app.ts` (error handler), server main (process-level handlers)
- Test: `apps/server/test/alerts/error-alerter.test.ts`

**Interfaces:**
- Consumes: Task 1's `alertWebhookUrl` config; Fastify's `setErrorHandler`.
- Produces:
  - `type ErrorAlerter = { notify(context: string, error: unknown): Promise<void> }`
  - `WebhookErrorAlerter` (POSTs Slack-compatible `{ text }` JSON to the webhook; swallows its own failures — alerting must never take the server down), `NoopErrorAlerter`, `alerterFromConfig(alertWebhookUrl: string | null): ErrorAlerter`.
  - `buildApp` options gain `alerter?: ErrorAlerter`. 5xx errors: logged with stack (internal), alerted, answered `500 {"error": "internal_error"}` — no stack, no paths, no framework details leak (CODING_STANDARDS security). Sub-500 errors (Fastify validation 400s etc.) keep their existing behavior exactly.
  - Task 11's backup daemon reuses `ErrorAlerter` — a backup that fails silently is a lie about being backed up.

- [ ] **Step 1: Write the failing tests**

`apps/server/test/alerts/error-alerter.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { NoopErrorAlerter, WebhookErrorAlerter, alerterFromConfig } from '../../src/alerts/error-alerter.js';

describe('WebhookErrorAlerter', () => {
  it('POSTs a Slack-compatible text payload', async () => {
    const calls: Array<{ url: string; body: string }> = [];
    const fakeFetch = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), body: String(init?.body) });
      return new Response('ok');
    }) as typeof fetch;
    const alerter = new WebhookErrorAlerter('https://hooks.example/T/B', fakeFetch);
    await alerter.notify('ingest', new Error('boom'));
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://hooks.example/T/B');
    expect(JSON.parse(calls[0].body).text).toContain('ingest');
    expect(JSON.parse(calls[0].body).text).toContain('boom');
  });

  it('planted defect: a dead webhook does not throw into the caller', async () => {
    const fakeFetch = (async () => {
      throw new Error('connection refused');
    }) as typeof fetch;
    const alerter = new WebhookErrorAlerter('https://hooks.example/T/B', fakeFetch);
    await expect(alerter.notify('ingest', new Error('boom'))).resolves.toBeUndefined();
  });
});

describe('alerterFromConfig', () => {
  it('is a webhook alerter when the url is set, noop when not', () => {
    expect(alerterFromConfig('https://hooks.example/x')).toBeInstanceOf(WebhookErrorAlerter);
    expect(alerterFromConfig(null)).toBeInstanceOf(NoopErrorAlerter);
  });
});

describe('the app error handler', () => {
  const db = { query: async () => [{ ok: 1 }] };

  it('answers 500 internal_error, alerts, leaks nothing', async () => {
    const notified: string[] = [];
    const alerter = { notify: async (context: string) => void notified.push(context) };
    const deps = { db, ingest: { ingestBatch: async () => [], onEventCommitted: () => () => {} } } as Parameters<typeof buildApp>[0];
    const app = buildApp(deps, { alerter });
    app.get('/explode', async () => {
      throw new Error('secret internal detail /etc/passwd');
    });
    const response = await app.inject({ method: 'GET', url: '/explode' });
    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({ error: 'internal_error' });
    expect(response.body).not.toContain('secret internal detail');
    expect(notified.length).toBe(1);
  });

  it('planted defect: a validation 400 keeps its shape and does not alert', async () => {
    const notified: string[] = [];
    const alerter = { notify: async (context: string) => void notified.push(context) };
    const deps = { db, ingest: { ingestBatch: async () => [], onEventCommitted: () => () => {} } } as Parameters<typeof buildApp>[0];
    const app = buildApp(deps, { alerter });
    const response = await app.inject({ method: 'POST', url: '/v1/events', payload: { nope: true } });
    expect(response.statusCode).toBe(400);
    expect(notified.length).toBe(0);
  });
});
```

Run: `pnpm --filter @gisik-nokma/server exec vitest run test/alerts/` — FAIL.

- [ ] **Step 2: Implement the alerter**

`apps/server/src/alerts/error-alerter.ts`:

```ts
export type ErrorAlerter = { notify(context: string, error: unknown): Promise<void> };

export class NoopErrorAlerter implements ErrorAlerter {
  async notify(): Promise<void> {}
}

/**
 * POSTs { text } — the shape Slack, Mattermost, and Discord (with /slack
 * suffix) webhooks all accept, and any generic receiver can read. The
 * provider is whatever URL config carries; the code knows no vendor.
 */
export class WebhookErrorAlerter implements ErrorAlerter {
  constructor(
    private readonly webhookUrl: string,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async notify(context: string, error: unknown): Promise<void> {
    const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    try {
      await this.fetchFn(this.webhookUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: `gisik-nokma error — ${context}: ${message}` }),
      });
    } catch {
      // Alerting must never take the server down with it; the original
      // error is already in the structured log.
    }
  }
}

export function alerterFromConfig(alertWebhookUrl: string | null): ErrorAlerter {
  return alertWebhookUrl ? new WebhookErrorAlerter(alertWebhookUrl) : new NoopErrorAlerter();
}
```

- [ ] **Step 3: Wire the error handler**

In `buildApp` (options gain `alerter?: ErrorAlerter`, defaulting to `new NoopErrorAlerter()`):

```ts
app.setErrorHandler((error, request, reply) => {
  const statusCode = 'statusCode' in error && typeof error.statusCode === 'number' ? error.statusCode : 500;
  if (statusCode < 500) {
    // Fastify's own semantics for validation and client errors, untouched.
    return reply.send(error);
  }
  request.log.error({ err: error }, 'unhandled request error');
  void alerter.notify(`${request.method} ${request.url}`, error);
  return reply.code(500).send({ error: 'internal_error' });
});
```

In the server main: `const alerter = alerterFromConfig(config.alertWebhookUrl);` passed into `buildApp`, plus process-level last resorts:

```ts
process.on('unhandledRejection', (reason) => {
  void alerter.notify('unhandledRejection', reason);
  logger.error({ err: reason }, 'unhandled rejection');
});
process.on('uncaughtException', (error) => {
  void alerter.notify('uncaughtException', error);
  logger.fatal({ err: error }, 'uncaught exception — exiting');
  setTimeout(() => process.exit(1), 500).unref();
});
```

**Structured logs statement (no code needed):** Fastify already logs via pino as JSON to stdout with `LOG_LEVEL` from Plan 1 — that IS the structured-log floor; App Platform captures stdout. Do not add a second logger.

- [ ] **Step 4: Run to green**

Run: `pnpm --filter @gisik-nokma/server exec vitest run test/alerts/` then the full server suite.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/alerts/error-alerter.ts apps/server/src/app.ts apps/server/src/index.ts apps/server/test/alerts/
git commit -m "feat(server): error alerting behind config — webhook out, nothing leaked, noop when unset

5xx paths log the stack internally, alert the configured webhook, and
answer a bare internal_error. The webhook speaks {text} so any Slack-
compatible receiver works; the vendor lives in an env var, not in code."
```

### Task 4: SMTP magic-link sender — real email when config says so, logs otherwise

**Files:**
- Create: `apps/server/src/auth/smtp-magic-link-sender.ts`
- Modify: server main (sender selection), `apps/server/package.json` (nodemailer)
- Test: `apps/server/test/auth/smtp-magic-link-sender.test.ts`

**Interfaces:**
- Consumes: Plan 4's `MagicLinkSender { send(email: string, url: string): Promise<void> }` from `apps/server/src/auth/magic-link-sender.ts`, `LogMagicLinkSender`; Task 1's `smtpUrl`/`magicLinkFrom` config.
- Produces: `SmtpMagicLinkSender implements MagicLinkSender` — `new SmtpMagicLinkSender(smtpUrl, from, transporter?)`. Selection rule in main: `config.smtpUrl ? new SmtpMagicLinkSender(config.smtpUrl, config.magicLinkFrom) : new LogMagicLinkSender()`. Compose points `SMTP_URL` at Mailpit; production points it at any SMTP provider (Brevo/SES/etc. — vendor stays out of code). The `OtpSender` wiring is left on `LogOtpSender` with a comment naming why: no DLT registration yet (see the production proposal note; the seeded board tracks the twin errand).

- [ ] **Step 1: Write the failing test**

`apps/server/test/auth/smtp-magic-link-sender.test.ts`:

```ts
import { createTransport } from 'nodemailer';
import { describe, expect, it } from 'vitest';
import { SmtpMagicLinkSender } from '../../src/auth/smtp-magic-link-sender.js';

describe('SmtpMagicLinkSender', () => {
  it('mails the link to the address, from the configured sender, with the url intact', async () => {
    const messages: Array<Record<string, unknown>> = [];
    const transporter = createTransport({ jsonTransport: true });
    const original = transporter.sendMail.bind(transporter);
    transporter.sendMail = (async (options: Parameters<typeof original>[0]) => {
      const info = await original(options);
      messages.push(JSON.parse(String(info.message)) as Record<string, unknown>);
      return info;
    }) as typeof transporter.sendMail;

    const sender = new SmtpMagicLinkSender('smtp://ignored:1025', 'sign-in@gisik-nokma.local', transporter);
    await sender.send('kiro@example.com', 'https://app.example/verify?token=abc');

    expect(messages).toHaveLength(1);
    const message = messages[0] as { to: Array<{ address: string }>; from: { address: string }; subject: string; text: string };
    expect(message.to[0].address).toBe('kiro@example.com');
    expect(message.from.address).toBe('sign-in@gisik-nokma.local');
    expect(message.subject).toContain('Sign in');
    expect(message.text).toContain('https://app.example/verify?token=abc');
  });
});
```

Run: `pnpm --filter @gisik-nokma/server exec vitest run test/auth/smtp-magic-link-sender.test.ts` — FAIL (module missing).

- [ ] **Step 2: Install and implement**

Run: `pnpm --filter @gisik-nokma/server add nodemailer && pnpm --filter @gisik-nokma/server add -D @types/nodemailer`

`apps/server/src/auth/smtp-magic-link-sender.ts`:

```ts
import { createTransport, type Transporter } from 'nodemailer';
import type { MagicLinkSender } from './magic-link-sender.js';

export class SmtpMagicLinkSender implements MagicLinkSender {
  private readonly transporter: Transporter;

  constructor(
    smtpUrl: string,
    private readonly from: string,
    transporter?: Transporter,
  ) {
    this.transporter = transporter ?? createTransport(smtpUrl);
  }

  async send(email: string, url: string): Promise<void> {
    await this.transporter.sendMail({
      from: this.from,
      to: email,
      subject: 'Sign in to Gisik Nokma',
      text: `Follow this link to sign in:\n\n${url}\n\nThe link is single-use. If you did not request it, ignore this message.`,
    });
  }
}
```

- [ ] **Step 3: Select the sender in main**

Where the server main constructs Plan 4's `createAuth` deps, replace the hard-coded `LogMagicLinkSender` with:

```ts
const magicLinkSender = config.smtpUrl
  ? new SmtpMagicLinkSender(config.smtpUrl, config.magicLinkFrom)
  : new LogMagicLinkSender();
// OtpSender stays LogOtpSender: no DLT-registered SMS provider exists yet,
// so production sends no SMS — the board's own ops:dlt-entity twin, honoured.
```

- [ ] **Step 4: Run to green, commit**

Run: `pnpm --filter @gisik-nokma/server exec vitest run test/auth/smtp-magic-link-sender.test.ts` — PASS.

```bash
git add apps/server/src/auth/smtp-magic-link-sender.ts apps/server/src/index.ts apps/server/package.json pnpm-lock.yaml apps/server/test/auth/smtp-magic-link-sender.test.ts
git commit -m "feat(server): SMTP magic-link sender selected by config

SMTP_URL set means real mail (Mailpit in dev, any SMTP provider in prod);
unset means the log sender. Phone OTP deliberately stays on the log sender
until a DLT registration exists — the product refuses to pretend a channel
it does not have, same as its own seeded errand records."
```

### Task 5: Dockerfiles — server (migrations on boot) and web (standalone)

**Files:**
- Create: `apps/server/Dockerfile`, `apps/server/docker-entrypoint.sh`, `apps/web/Dockerfile`, `.dockerignore` (repo root)
- Modify: `apps/server/package.json` (move `node-pg-migrate` from devDependencies to dependencies — migrate-on-boot makes it runtime), `apps/web/next.config.*` (add `output: 'standalone'` — additive to Plan 6's config)

**Interfaces:**
- Consumes: Plan 1's migrations under `apps/server/migrations/` (mixed `.sql`/`.js`, node-pg-migrate), the built server entry `dist/index.js`, Plan 6's `apps/web` (Next.js 15, package name `@gisik-nokma/web` — verify against Plan 6 as landed and adjust the `--filter` if it chose another name).
- Produces: `apps/server/Dockerfile` (multi-stage, runs migrations then the server; also serves as the backup-worker image with `CMD` overridden), `apps/web/Dockerfile` (standalone, build-args `NEXT_PUBLIC_API_URL`/`NEXT_PUBLIC_WS_URL`). The server image includes `postgresql16-client` so `pg_dump`/`pg_restore` are available to the ops scripts (Tasks 11–12).

- [ ] **Step 1: Write `.dockerignore`**

Repo root `.dockerignore`:

```
.git
node_modules
**/node_modules
**/.next
**/dist
**/.turbo
docs
reference
e2e/test-results
e2e/playwright-report
*.log
```

`reference/` stays out of images deliberately — the compose file mounts it read-only where the seed needs it, which also enforces the frozen-directory rule at the filesystem level.

- [ ] **Step 2: Write the server entrypoint**

`apps/server/docker-entrypoint.sh`:

```sh
#!/bin/sh
set -e

echo "gisik-nokma: applying migrations..."
node node_modules/node-pg-migrate/bin/node-pg-migrate up --migrations-dir migrations
echo "gisik-nokma: migrations current."

exec "$@"
```

(`node-pg-migrate` reads `DATABASE_URL` from the environment; the URL is never echoed — it carries credentials.)

- [ ] **Step 3: Write the server Dockerfile**

`apps/server/Dockerfile`:

```dockerfile
# syntax=docker/dockerfile:1
FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm turbo run build --filter=@gisik-nokma/server...
RUN pnpm deploy --filter=@gisik-nokma/server --prod /out

FROM node:22-alpine AS runtime
RUN apk add --no-cache postgresql16-client
WORKDIR /app
COPY --from=build /out ./
COPY apps/server/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000
EXPOSE 3000
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "dist/index.js"]
```

Move `node-pg-migrate` in `apps/server/package.json` from `devDependencies` to `dependencies` (edit the file, run `pnpm install` to settle the lockfile) — `pnpm deploy --prod` prunes devDependencies, and the entrypoint needs the binary at runtime. Verify `apps/server/package.json` has no `files` field that would exclude `migrations/` from the deploy; if it has one, add `"migrations"` to it.

- [ ] **Step 4: Write the web Dockerfile**

First ensure `apps/web/next.config.*` (Plan 6's file — `.ts`, `.mjs`, or `.js` as it landed) sets `output: 'standalone'` — add the key to the exported config object if absent. Then `apps/web/Dockerfile`:

```dockerfile
# syntax=docker/dockerfile:1
FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_WS_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL NEXT_PUBLIC_WS_URL=$NEXT_PUBLIC_WS_URL
RUN pnpm turbo run build --filter=@gisik-nokma/web...

FROM node:22-alpine AS runtime
WORKDIR /app
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /repo/apps/web/public ./apps/web/public
ENV NODE_ENV=production HOSTNAME=0.0.0.0 PORT=3000
EXPOSE 3000
CMD ["node", "apps/web/server.js"]
```

(`NEXT_PUBLIC_*` are baked at build time — that is Next's model; the compose file and the DO spec pass them as build args. The env-var names are the pin flagged to Plan 6 in Open questions #5 — if Plan 6 landed different names, change the ARG/ENV lines here and in compose, nothing else.)

- [ ] **Step 5: Build both images and smoke the server one**

```bash
docker build -f apps/server/Dockerfile -t gisik-server:dev .
docker build -f apps/web/Dockerfile -t gisik-web:dev \
  --build-arg NEXT_PUBLIC_API_URL=http://localhost:3000 \
  --build-arg NEXT_PUBLIC_WS_URL=ws://localhost:3000/v1/stream .
docker compose up -d   # Plan 1's root compose: bare Postgres on 54329
docker run --rm --network host \
  -e DATABASE_URL='postgres://gisik:gisik@localhost:54329/gisik_nokma' \
  -e BETTER_AUTH_SECRET=dev-smoke -e BETTER_AUTH_URL=http://localhost:3000 \
  gisik-server:dev sh -c 'docker-entrypoint.sh node -e "console.log(\"migrations ran\")"'
```

Expected: both builds succeed; the last command prints the migration log then `migrations ran`. (Add any other env vars Plan 4/5 made mandatory in `loadConfig` — the `ConfigError` will name them; that is the contract working.)

- [ ] **Step 6: Commit**

```bash
git add .dockerignore apps/server/Dockerfile apps/server/docker-entrypoint.sh apps/web/Dockerfile apps/web/next.config.* apps/server/package.json pnpm-lock.yaml
git commit -m "feat(deploy): server and web images — migrations run on boot, web ships standalone

One image per app, node:22-alpine, pnpm deploy pruning. The server
entrypoint applies migrations before listening so a deploy is one atomic
gesture; node-pg-migrate moves to runtime deps to make that true. The
server image carries postgresql16-client for the backup and restore
tooling. reference/ is excluded from images and mounted read-only instead."
```

### Task 6: The dev stack — one command, five services, and a self-verifying env contract

**Files:**
- Create: `docker-compose.dev.yml`, `.env.example`, `scripts/check-env-example.mjs`
- Modify: root `package.json` (script `check:env`)

**Interfaces:**
- Consumes: Task 5's images; Plan 1's root `docker-compose.yml` conventions (Postgres 16-alpine, host port 54329, `gisik`/`gisik`, db `gisik_nokma` — kept identical here so every documented `DATABASE_URL` works against either stack).
- Produces (the contract the E2E, the runbook, and CI all use):
  - **One command:** `docker compose -f docker-compose.dev.yml up -d --build` → Postgres :54329, MinIO :9000 (console :9001, buckets `gisik-attachments` + `gisik-backups` pre-created), Mailpit :8025 (SMTP :1025), server :3000 (migrated, healthy), web :3001.
  - `.env.example` documenting **every** config var the plan series introduced, gated by `scripts/check-env-example.mjs` (root script `check:env`), which fails naming any `process.env.X` read in `apps/server/src`, `apps/web/src`, or `packages/` that `.env.example` does not document.
  - Pinned S3 env names (flagged to Plan 7 in Open questions #6): `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_FORCE_PATH_STYLE`.
  - **Do not run both compose files at once** — they share host port 54329 by design.

- [ ] **Step 1: Write `docker-compose.dev.yml`**

```yaml
# The full dev stack. One command:
#   docker compose -f docker-compose.dev.yml up -d --build
# Shares port conventions with the root docker-compose.yml (bare Postgres);
# run one stack or the other, never both.
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: gisik
      POSTGRES_PASSWORD: gisik
      POSTGRES_DB: gisik_nokma
    ports:
      - "54329:5432"
    volumes:
      - pg-dev-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U gisik -d gisik_nokma"]
      interval: 2s
      timeout: 3s
      retries: 30

  minio:
    image: minio/minio:latest
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: gisik
      MINIO_ROOT_PASSWORD: gisik-dev-secret
    ports:
      - "9000:9000"
      - "9001:9001"
    volumes:
      - minio-data:/data
    healthcheck:
      test: ["CMD", "mc", "ready", "local"]
      interval: 3s
      timeout: 5s
      retries: 20

  minio-init:
    image: minio/mc
    depends_on:
      minio:
        condition: service_healthy
    entrypoint: >
      /bin/sh -c "
      mc alias set local http://minio:9000 gisik gisik-dev-secret &&
      mc mb --ignore-existing local/gisik-attachments &&
      mc mb --ignore-existing local/gisik-backups
      "

  mailpit:
    image: axllent/mailpit
    ports:
      - "8025:8025"
      - "1025:1025"

  server:
    build:
      context: .
      dockerfile: apps/server/Dockerfile
    depends_on:
      postgres:
        condition: service_healthy
      minio-init:
        condition: service_completed_successfully
      mailpit:
        condition: service_started
    environment:
      DATABASE_URL: postgres://gisik:gisik@postgres:5432/gisik_nokma
      HOST: 0.0.0.0
      PORT: "3000"
      LOG_LEVEL: info
      WEB_ORIGIN: http://localhost:3001
      TRUST_PROXY: "false"
      RATE_LIMIT_AUTH_MAX: "60"
      RATE_LIMIT_EVENTS_MAX: "600"
      RATE_LIMIT_WINDOW_SEC: "60"
      SMTP_URL: smtp://mailpit:1025
      MAGIC_LINK_FROM: sign-in@gisik-nokma.local
      BETTER_AUTH_SECRET: dev-only-secret-do-not-deploy
      BETTER_AUTH_URL: http://localhost:3000
      S3_ENDPOINT: http://minio:9000
      S3_REGION: us-east-1
      S3_BUCKET: gisik-attachments
      S3_ACCESS_KEY: gisik
      S3_SECRET_KEY: gisik-dev-secret
      S3_FORCE_PATH_STYLE: "true"
      BACKUP_S3_BUCKET: gisik-backups
    ports:
      - "3000:3000"
    volumes:
      - ./reference:/app/reference:ro
    healthcheck:
      test: ["CMD-SHELL", "wget -qO- http://localhost:3000/healthz > /dev/null"]
      interval: 3s
      timeout: 5s
      retries: 40

  web:
    build:
      context: .
      dockerfile: apps/web/Dockerfile
      args:
        NEXT_PUBLIC_API_URL: http://localhost:3000
        NEXT_PUBLIC_WS_URL: ws://localhost:3000/v1/stream
    depends_on:
      server:
        condition: service_healthy
    ports:
      - "3001:3000"

volumes:
  pg-dev-data:
  minio-data:
```

(If Plan 4/5 introduced further **required** env vars, the server container will exit with `ConfigError` naming them — add each to this file and to `.env.example`. That failure mode is the design, not an accident.)

- [ ] **Step 2: Write `.env.example`**

Repo root `.env.example` — dev-stack values, production notes inline:

```bash
# ── gisik-nokma configuration contract ─────────────────────────────────────
# Every variable the server and web read. scripts/check-env-example.mjs
# (pnpm check:env, run in CI) fails if code reads a variable this file
# does not document. Copy to .env and adjust; never commit .env.

# Core (Plan 1)
DATABASE_URL=postgres://gisik:gisik@localhost:54329/gisik_nokma
PORT=3000
HOST=127.0.0.1                       # 0.0.0.0 in containers
LOG_LEVEL=info                       # fatal|error|warn|info|debug|trace

# Managed-Postgres TLS (production; leave empty for local)
DATABASE_CA_CERT=

# Auth (Plan 4 / better-auth)
BETTER_AUTH_SECRET=change-me         # secret; rotate per runbook
BETTER_AUTH_URL=http://localhost:3000
GOOGLE_CLIENT_ID=                    # Google OAuth (spec §6); empty disables
GOOGLE_CLIENT_SECRET=

# Web origin + proxy trust (Plan 11)
WEB_ORIGIN=http://localhost:3001
TRUST_PROXY=false                    # true behind App Platform's router

# Rate limits (Plan 11) — production defaults 10 and 120; dev/CI run looser
RATE_LIMIT_AUTH_MAX=10
RATE_LIMIT_EVENTS_MAX=120
RATE_LIMIT_WINDOW_SEC=60

# Magic-link email (Plan 11) — empty SMTP_URL falls back to the log sender
SMTP_URL=smtp://localhost:1025
MAGIC_LINK_FROM=sign-in@gisik-nokma.local

# Error alerting (Plan 11) — any Slack-compatible webhook; empty = noop
ALERT_WEBHOOK_URL=

# Object storage (Plan 7 attachments + Plan 11 backups; S3 protocol —
# MinIO locally, DO Spaces or S3 in production)
S3_ENDPOINT=http://localhost:9000
S3_REGION=us-east-1
S3_BUCKET=gisik-attachments
S3_ACCESS_KEY=gisik
S3_SECRET_KEY=gisik-dev-secret
S3_FORCE_PATH_STYLE=true             # true for MinIO; false for Spaces/S3

# Backups (Plan 11)
BACKUP_S3_BUCKET=gisik-backups
BACKUP_TIME_UTC=21:00                # nightly pg_dump; 21:00 UTC = 02:30 IST
LEDGER_EXPORT_TIME_UTC=22:00         # weekly ledger export
LEDGER_EXPORT_DOW_UTC=0              # 0 = Sunday

# Seeds (Plan 11) — people are looked up, never invented
SEED_OWNER_EMAIL=
SEED_ACCOUNTANT_EMAIL=

# Web client (Plan 6; baked at build time)
NEXT_PUBLIC_API_URL=http://localhost:3000
NEXT_PUBLIC_WS_URL=ws://localhost:3000/v1/stream

# Test-only
TEST_DATABASE_ADMIN_URL=postgres://gisik:gisik@localhost:54329/postgres
```

(At execution time, reconcile the Plan 4/5/7 variable names against the code as landed — the checker in the next step is the authority on what is missing; this file is the authority on what each one means.)

- [ ] **Step 3: Write the checker**

`scripts/check-env-example.mjs`:

```js
#!/usr/bin/env node
// The env contract gate: every process.env.X read by app code must be
// documented in .env.example. Fails naming the strays.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOTS = ['apps/server/src', 'apps/web/src', 'packages'];
const IGNORE = new Set(['NODE_ENV', 'CI', 'PATH', 'HOME', 'TEST_DATABASE_ADMIN_URL']);

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const stats = statSync(path);
    if (stats.isDirectory()) {
      if (name === 'node_modules' || name === 'dist' || name === '.next') continue;
      yield* walk(path);
    } else if (/\.(ts|tsx|mts|js|mjs|cjs)$/.test(name) && !/\.test\./.test(name)) {
      yield path;
    }
  }
}

const used = new Map(); // name -> first file seen
for (const root of ROOTS) {
  let files = [];
  try {
    files = [...walk(root)];
  } catch {
    continue; // a root that does not exist yet is not a failure
  }
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)/g)) {
      if (!used.has(match[1])) used.set(match[1], file);
    }
  }
}

const documented = new Set();
for (const line of readFileSync('.env.example', 'utf8').split('\n')) {
  const match = line.match(/^#?\s*([A-Z][A-Z0-9_]*)=/);
  if (match) documented.add(match[1]);
}

const missing = [...used.keys()].filter((name) => !IGNORE.has(name) && !documented.has(name)).sort();
if (missing.length > 0) {
  console.error('config vars read by code but undocumented in .env.example:');
  for (const name of missing) console.error(`  ${name}  (first seen in ${used.get(name)})`);
  process.exit(1);
}
console.log(`env contract clean: ${documented.size} documented, ${used.size} referenced in code.`);
```

Root `package.json` scripts gain: `"check:env": "node scripts/check-env-example.mjs"`.

- [ ] **Step 4: Prove the checker with a planted defect**

```bash
echo 'export const planted = process.env.PLANTED_UNDOCUMENTED_VAR;' > apps/server/src/planted-defect.ts
pnpm check:env   # Expected: exit 1, naming PLANTED_UNDOCUMENTED_VAR and the file
rm apps/server/src/planted-defect.ts
pnpm check:env   # Expected: exit 0, "env contract clean"
```

If the first run does NOT fail, the checker is broken — fix it before proceeding. If the second run fails naming real variables, that is the gate doing its job: document each one in `.env.example` (and add it to the compose file if the dev stack needs it) until clean.

- [ ] **Step 5: Bring the stack up and smoke it**

```bash
docker compose -f docker-compose.dev.yml up -d --build
docker compose -f docker-compose.dev.yml ps          # all healthy/running
curl -s http://localhost:3000/healthz                 # {"ok":...,"version":...}
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3001   # 200 (web)
curl -s http://localhost:8025/api/v1/messages | head -c 200      # Mailpit API answers
docker compose -f docker-compose.dev.yml exec server ls /app/reference/convenience-corner-tracker/board.data.js   # frozen snapshot mounted ro
docker compose -f docker-compose.dev.yml exec server node dist/verify-projections.js
```

Expected: healthz answers with a version; web serves; Mailpit answers; the snapshot is mounted; the verifier prints the clean line and exits 0 (empty ledger → empty projections → clean). For the last command, check `apps/server/package.json`'s `verify:projections` script for the actual compiled filename Plan 1 gave the CLI and use that path.

- [ ] **Step 6: Commit**

```bash
git add docker-compose.dev.yml .env.example scripts/check-env-example.mjs package.json
git commit -m "feat(deploy): one-command dev stack and a self-verifying env contract

docker-compose.dev.yml brings up Postgres, MinIO (buckets made), Mailpit,
the migrated server and the web client in one gesture. .env.example
documents every knob the series introduced, and check-env-example fails CI
naming any config var the code reads that the contract does not document —
proven here against a planted defect."
```

### Task 7: Seed plumbing — deterministic ULIDs, literal-text docs, looked-up people, checked templates

**Files:**
- Create: `apps/server/src/seed/seed-ulid.ts`, `apps/server/src/seed/doc-text.ts`, `apps/server/src/seed/users.ts`, `apps/server/src/seed/templates.ts`
- Test: `apps/server/test/seed/seed-ulid.test.ts`, `apps/server/test/seed/doc-text.test.ts`, `apps/server/test/seed/users.test.ts`, `apps/server/test/seed/templates.test.ts`

**Interfaces:**
- Consumes: `ULID_REGEX` (`@gisik-nokma/domain`, Plan 1); `docToPlainText(doc: unknown): string` (`@gisik-nokma/domain`, amendment 12); `WorkflowDef` (Plan 2 + coordination §3/№9); Plan 8's template payload exports — **assumed names `ERRAND_WITH_WAITS_TEMPLATE` and `SIMPLE_KANBAN_TEMPLATE` from `@gisik-nokma/domain`** (Open questions #4; if Plan 8 exported them elsewhere or under other names, update the one import in `templates.ts` — nothing else changes); Plan 4's `Queryable`.
- Produces (Tasks 8–10 import these):
  - `seedUlid(namespace: string, key: string): string` — deterministic, `ULID_REGEX`-valid, collision-resistant (SHA-256).
  - `plainTextDoc(text: string): Record<string, unknown>` — ProseMirror doc; one paragraph per line, text kept literal (markdown-looking characters stay characters).
  - `findUserIdByEmail(db: Queryable, email: string): Promise<string | null>` — reads better-auth's `"user"` table (Open questions #8).
  - `TRACKER_STATE_TO_ERRAND_STATE: Record<string, string>` — the status mapping table from the prose section, as data.
  - `checkErrandTemplate(def: WorkflowDef): { ok: true } | { ok: false; problems: string[] }` — the executable pin on Plan 8's template (below).
  - `workflowFromTemplate(template: WorkflowDef, workflowId: string): WorkflowDef` — a clone with a fresh id at version 1 (templates are cloned, spec §4).

- [ ] **Step 1: Write the failing seed-ulid tests**

`apps/server/test/seed/seed-ulid.test.ts`:

```ts
import { ULID_REGEX } from '@gisik-nokma/domain';
import { describe, expect, it } from 'vitest';
import { seedUlid } from '../../src/seed/seed-ulid.js';

describe('seedUlid', () => {
  it('is a valid ULID', () => {
    expect(seedUlid('ticket', 'cc#ops:duns')).toMatch(ULID_REGEX);
  });

  it('is deterministic — the idempotence mechanism', () => {
    expect(seedUlid('event', 'cc#ops:duns#created')).toBe(seedUlid('event', 'cc#ops:duns#created'));
  });

  it('differs across keys and across namespaces', () => {
    expect(seedUlid('event', 'a')).not.toBe(seedUlid('event', 'b'));
    expect(seedUlid('event', 'a')).not.toBe(seedUlid('ticket', 'a'));
  });

  it('planted defect: a namespace/key join ambiguity cannot collide', () => {
    // 'ab' + 'c' must not equal 'a' + 'bc' — the separator is load-bearing.
    expect(seedUlid('ab', 'c')).not.toBe(seedUlid('a', 'bc'));
  });
});
```

- [ ] **Step 2: Run to fail, implement**

`apps/server/src/seed/seed-ulid.ts`:

```ts
import { createHash } from 'node:crypto';

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/**
 * A deterministic, ULID-shaped id for seed events and seed entities.
 * Re-running a seed regenerates identical ids, so the ledger's
 * duplicate-event-id refusal makes re-runs no-ops — idempotence by
 * construction, not by bookkeeping. The leading '0' keeps the timestamp
 * field small and the string ULID_REGEX-valid.
 */
export function seedUlid(namespace: string, key: string): string {
  const digest = createHash('sha256').update(`${namespace} ${key}`).digest();
  let out = '0';
  for (let i = 0; i < 25; i += 1) {
    out += CROCKFORD[digest[i] % 32];
  }
  return out;
}
```

Run: `pnpm --filter @gisik-nokma/server exec vitest run test/seed/seed-ulid.test.ts` — PASS.

- [ ] **Step 3: Write the failing doc tests, implement `plainTextDoc`**

`apps/server/test/seed/doc-text.test.ts`:

```ts
import { docToPlainText } from '@gisik-nokma/domain';
import { describe, expect, it } from 'vitest';
import { plainTextDoc } from '../../src/seed/doc-text.js';

describe('plainTextDoc', () => {
  it('keeps record text literal — markdown-looking characters stay characters', () => {
    const doc = plainTextDoc('**Gates:** every SMS the platform will ever send — OTP included');
    const text = docToPlainText(doc);
    expect(text).toContain('**Gates:**');
  });

  it('one paragraph per line; blank lines become empty paragraphs', () => {
    const doc = plainTextDoc('line one\n\nline three') as { content: Array<{ type: string; content?: unknown[] }> };
    expect(doc.content).toHaveLength(3);
    expect(doc.content[1].content).toBeUndefined();
  });

  it('an empty string is still a valid one-paragraph doc', () => {
    const doc = plainTextDoc('') as { type: string; content: unknown[] };
    expect(doc.type).toBe('doc');
    expect(doc.content).toHaveLength(1);
  });
});
```

`apps/server/src/seed/doc-text.ts`:

```ts
/**
 * Seed bodies are the record's text, verbatim and literal. No markdown
 * parsing: a '**' in the frozen record renders as typed characters, which
 * is the editor's own literal-text honesty (spec §2) applied to seeds.
 */
export function plainTextDoc(text: string): Record<string, unknown> {
  const lines = text.split('\n');
  const paragraphs = lines.map((line) =>
    line.length === 0 ? { type: 'paragraph' } : { type: 'paragraph', content: [{ type: 'text', text: line }] },
  );
  return { type: 'doc', content: paragraphs };
}
```

(An empty string splits to one empty line → one empty paragraph — the third test.) Run to PASS.

- [ ] **Step 4: Write the failing users test, implement `findUserIdByEmail`**

`apps/server/test/seed/users.test.ts` (unit — a fake `Queryable`; the table's live schema is better-auth's and is exercised by the E2E):

```ts
import { describe, expect, it } from 'vitest';
import { findUserIdByEmail } from '../../src/seed/users.js';

describe('findUserIdByEmail', () => {
  it('queries the better-auth user table case-insensitively and returns the id', async () => {
    const queries: Array<{ sql: string; params: unknown[] }> = [];
    const db = {
      query: async (sql: string, params: unknown[]) => {
        queries.push({ sql, params });
        return { rows: [{ id: '01J5SEEDUSER0000000000000A' }] };
      },
    };
    const id = await findUserIdByEmail(db as never, 'Kiro@Example.com');
    expect(id).toBe('01J5SEEDUSER0000000000000A');
    expect(queries[0].sql).toMatch(/from\s+"user"/i);
    expect(queries[0].sql).toMatch(/lower\(email\)/i);
    expect(queries[0].params).toEqual(['Kiro@Example.com']);
  });

  it('null when nobody has signed in with that address — the seed never invents people', async () => {
    const db = { query: async () => ({ rows: [] }) };
    expect(await findUserIdByEmail(db as never, 'ghost@example.com')).toBeNull();
  });
});
```

`apps/server/src/seed/users.ts`:

```ts
import type { Queryable } from '../db/queryable.js';

/**
 * People are never invented (spec §1 invariant 4, applied to humans). A
 * seed actor must be a real signed-in user; identity's key is the email
 * better-auth stores. Table name "user" is better-auth's default — if
 * Plan 4 configured a different modelName, change it here only.
 */
export async function findUserIdByEmail(db: Queryable, email: string): Promise<string | null> {
  const result = await db.query('SELECT id FROM "user" WHERE lower(email) = lower($1) LIMIT 1', [email]);
  const rows = (result as { rows: Array<{ id: string }> }).rows;
  return rows.length > 0 ? rows[0].id : null;
}
```

(Adjust the `Queryable` import path to wherever Plan 4 placed it.) Run to PASS.

- [ ] **Step 5: Write the failing template tests**

`apps/server/test/seed/templates.test.ts`:

```ts
import { ERRAND_WITH_WAITS_TEMPLATE } from '@gisik-nokma/domain';
import type { WorkflowDef } from '@gisik-nokma/domain';
import { describe, expect, it } from 'vitest';
import { TRACKER_STATE_TO_ERRAND_STATE, checkErrandTemplate, workflowFromTemplate } from '../../src/seed/templates.js';

describe('the status mapping table', () => {
  it('maps exactly the tracker vocabulary', () => {
    expect(TRACKER_STATE_TO_ERRAND_STATE).toEqual({
      later: 'later',
      next: 'next',
      'in-progress': 'in-progress',
      blocked: 'waiting',
    });
  });
});

describe('checkErrandTemplate — the executable pin on Plan 8', () => {
  it('the real errand-with-waits template carries the tracker board', () => {
    expect(checkErrandTemplate(ERRAND_WITH_WAITS_TEMPLATE)).toEqual({ ok: true });
  });

  it('planted defect: a template missing the waiting state is named', () => {
    const broken: WorkflowDef = {
      ...ERRAND_WITH_WAITS_TEMPLATE,
      states: ERRAND_WITH_WAITS_TEMPLATE.states.filter((state) => state.id !== 'waiting'),
      transitions: ERRAND_WITH_WAITS_TEMPLATE.transitions.filter(
        (transition) => transition.to !== 'waiting' && transition.from !== 'waiting',
      ),
    };
    const verdict = checkErrandTemplate(broken);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.problems.join(' ')).toContain("missing state 'waiting'");
  });

  it('planted defect: a mapped state reachable only in two hops is refused — no fabricated intermediate claims', () => {
    const initial = ERRAND_WITH_WAITS_TEMPLATE.initialStateId;
    const broken: WorkflowDef = {
      ...ERRAND_WITH_WAITS_TEMPLATE,
      transitions: ERRAND_WITH_WAITS_TEMPLATE.transitions.filter(
        (transition) => !(transition.to === 'waiting' && (transition.from === '*' || transition.from === initial)),
      ).concat([{ from: 'in-progress', to: 'waiting', rules: [] }]),
    };
    const verdict = checkErrandTemplate(broken);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.problems.join(' ')).toContain('one transition');
  });

  it('planted defect: waiting without blocked:true is named (attention-strip contract)', () => {
    const broken: WorkflowDef = {
      ...ERRAND_WITH_WAITS_TEMPLATE,
      states: ERRAND_WITH_WAITS_TEMPLATE.states.map((state) =>
        state.id === 'waiting' ? { ...state, blocked: false } : state,
      ),
    };
    const verdict = checkErrandTemplate(broken);
    expect(verdict.ok).toBe(false);
  });

  it('planted defect: an unguarded way into done is named (closing an errand must say what happened)', () => {
    const broken: WorkflowDef = {
      ...ERRAND_WITH_WAITS_TEMPLATE,
      transitions: ERRAND_WITH_WAITS_TEMPLATE.transitions.map((transition) =>
        transition.to === 'done' ? { ...transition, rules: [] } : transition,
      ),
    };
    const verdict = checkErrandTemplate(broken);
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.problems.join(' ')).toContain('require-comment');
  });
});

describe('workflowFromTemplate', () => {
  it('clones with a fresh id at version 1, leaving the template untouched', () => {
    const cloned = workflowFromTemplate(ERRAND_WITH_WAITS_TEMPLATE, '0SEEDWORKFLOW00000000000AB');
    expect(cloned.id).toBe('0SEEDWORKFLOW00000000000AB');
    expect(cloned.version).toBe(1);
    expect(cloned.states).toEqual(ERRAND_WITH_WAITS_TEMPLATE.states);
    expect(ERRAND_WITH_WAITS_TEMPLATE.id).not.toBe('0SEEDWORKFLOW00000000000AB');
  });
});
```

Run: FAIL (module missing; possibly the import too — if the template constants live elsewhere, fix the import per Plan 8 as landed and record the actual name in the PR description).

- [ ] **Step 6: Implement `templates.ts`**

`apps/server/src/seed/templates.ts`:

```ts
import type { WorkflowDef } from '@gisik-nokma/domain';

/**
 * Tracker state → errand-with-waits state. 'done' is deliberately absent:
 * the seed never emits a terminal claim (closing a ticket is a human's
 * claim, made in the product, with the comment the workflow demands).
 * The runner treats an unmapped state as a refusal, never a guess.
 */
export const TRACKER_STATE_TO_ERRAND_STATE: Record<string, string> = {
  later: 'later',
  next: 'next',
  'in-progress': 'in-progress',
  blocked: 'waiting',
};

export type TemplateCheck = { ok: true } | { ok: false; problems: string[] };

/**
 * The seed's structural requirements on Plan 8's errand-with-waits
 * template — checked at runtime before any event is built, and pinned by
 * tests against the real template. If Plan 8's payload cannot carry the
 * tracker board, the seed refuses with the problems named; it never
 * "fixes" the shortfall by fabricating intermediate transitions, because
 * each intermediate would be a claim ('was in progress') the record never
 * made.
 */
export function checkErrandTemplate(def: WorkflowDef): TemplateCheck {
  const problems: string[] = [];
  const stateIds = new Set(def.states.map((state) => state.id));
  const targets = new Set(Object.values(TRACKER_STATE_TO_ERRAND_STATE));

  for (const target of targets) {
    if (!stateIds.has(target)) problems.push(`missing state '${target}'`);
  }
  for (const target of targets) {
    if (!stateIds.has(target) || target === def.initialStateId) continue;
    const oneHop = def.transitions.some(
      (transition) => (transition.from === '*' || transition.from === def.initialStateId) && transition.to === target,
    );
    if (!oneHop) {
      problems.push(
        `state '${target}' is not reachable from '${def.initialStateId}' in one transition — the seed will not fabricate intermediate claims`,
      );
    }
  }
  const waiting = def.states.find((state) => state.id === 'waiting');
  if (waiting && waiting.blocked !== true) {
    problems.push(`state 'waiting' must carry blocked: true so the attention strip sees waits`);
  }
  for (const transition of def.transitions) {
    if (transition.to === 'done' && !transition.rules.some((rule) => rule.kind === 'require-comment')) {
      problems.push(
        `transition ${transition.from}→done lacks require-comment — closing an errand must say what happened (the record's "append dated lines" discipline)`,
      );
    }
  }
  return problems.length > 0 ? { ok: false, problems } : { ok: true };
}

/** Templates are ordinary pre-authored workflows, cloned (spec §4). */
export function workflowFromTemplate(template: WorkflowDef, workflowId: string): WorkflowDef {
  return { ...template, id: workflowId, version: 1 };
}
```

- [ ] **Step 7: Run the seed suite, commit**

Run: `pnpm --filter @gisik-nokma/server exec vitest run test/seed/` — PASS. **If the "real template" test fails**, Plan 8's template genuinely cannot carry the tracker board — do NOT weaken `checkErrandTemplate`; raise it against the coordination document (Open questions #4 pre-declares the requirements) and amend the template, not the check.

```bash
git add apps/server/src/seed/seed-ulid.ts apps/server/src/seed/doc-text.ts apps/server/src/seed/users.ts apps/server/src/seed/templates.ts apps/server/test/seed/
git commit -m "feat(seed): deterministic ids, literal-text docs, looked-up people, checked templates

seedUlid makes idempotence structural (same key, same ULID, duplicate-id
refusal on re-run). plainTextDoc keeps record text literal. People are
looked up in the auth store, never created. checkErrandTemplate is the
executable pin on Plan 8's errand-with-waits payload: every mapped state
one legal hop from initial, waiting flagged blocked, every door into done
guarded by require-comment — refusals, never fabricated intermediates."
```

### Task 8: The Convenience Corner mapping — frozen record in, events out, nothing invented

**Files:**
- Create: `apps/server/src/seed/cc-board.ts`, `apps/server/src/seed/cc-map.ts`
- Test: `apps/server/test/seed/cc-board.test.ts`, `apps/server/test/seed/cc-map.test.ts`

**Interfaces:**
- Consumes: Task 7's `seedUlid`, `plainTextDoc`, `TRACKER_STATE_TO_ERRAND_STATE`; `SubmittedEvent` (Plan 1); `membershipId` (Plan 2, coordination §5); the frozen snapshot at `reference/convenience-corner-tracker/board.data.js` (read-only).
- Produces (Task 9 consumes):
  - `readCcBoard(boardDataPath: string): CcBoard` with `CcBoard = { week1: string; epics: Array<{id: string; label: string}>; items: CcItem[] }` and `CcItem` typed as the snapshot's item shape (`id, title, epic, state, body, done, lane, origin_file, origin_state, origin_status, meta{counterparty?, who?, cost?, lead_time?, clears_week?, needed_week?, slack?}, ask_text?, note?, blocked_by?, start?, due?, since?, started?`).
  - `errandItems(board: CcBoard): CcItem[]` — the `registrations` + `questions` epics only.
  - `neededWeekEnd(week1: string, neededWeek: number): string` — `week1 + 7·n − 1` days (the generator's own arithmetic, `build_tracker.py` line 390).
  - `errandDescriptionText(item: CcItem, titleById: Map<string, string>): string`
  - `type CcMapContext = { workspaceId: string; projectId: string; ownerUserId: string; errandTypeId: string; epicTicketIds: Record<'registrations' | 'questions', string>; initialStateId: string; week1: string; titleById: Map<string, string>; clientTime: string }`
  - `buildErrandEvents(item: CcItem, ctx: CcMapContext): SubmittedEvent[]` — throws on `done` or unknown states.
  - Ticket-id convention: `seedUlid('ticket', 'cc#' + item.id)`; event ids `seedUlid('event', 'cc#' + item.id + '#' + suffix)` with suffixes `created | description | counterparty | startDate | dueDate | transition`.

- [ ] **Step 1: Write the failing reader tests**

`apps/server/test/seed/cc-board.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { errandItems, readCcBoard } from '../../src/seed/cc-board.js';

const BOARD_PATH = 'reference/convenience-corner-tracker/board.data.js';
// Vitest cwd is apps/server — reach the repo root:
const boardPath = new URL(`../../../../${BOARD_PATH}`, import.meta.url).pathname;

describe('readCcBoard — the frozen snapshot, read-only', () => {
  it('reads week1 and the items out of the classic-script snapshot', () => {
    const board = readCcBoard(boardPath);
    expect(board.week1).toBe('2026-08-18'); // pinned to snapshot 24e2240
    expect(board.items.length).toBeGreaterThan(0);
  });

  it('the two operational epics hold exactly 23 errands in snapshot 24e2240', () => {
    const board = readCcBoard(boardPath);
    const errands = errandItems(board);
    expect(errands).toHaveLength(23);
    expect(errands.filter((item) => item.epic === 'registrations')).toHaveLength(13);
    expect(errands.filter((item) => item.epic === 'questions')).toHaveLength(10);
    expect(errands.filter((item) => item.state === 'done')).toHaveLength(0);
  });

  it('planted defect: a file that does not define window.CC_TRACKER is refused with the path named', () => {
    const selfPath = new URL(import.meta.url).pathname; // any JS-ish file that is not the snapshot
    expect(() => readCcBoard(selfPath)).toThrowError(/CC_TRACKER/);
  });
});
```

- [ ] **Step 2: Implement the reader**

`apps/server/src/seed/cc-board.ts`:

```ts
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

export type CcItemMeta = {
  counterparty?: string;
  who?: string;
  cost?: string;
  lead_time?: string;
  clears_week?: string;
  needed_week?: string | number;
  slack?: number;
};

export type CcItem = {
  id: string;
  title: string;
  epic: string;
  state: string;
  body: string;
  done: boolean;
  lane: string;
  origin_file: string;
  origin_state: string;
  origin_status: string;
  meta: CcItemMeta;
  ask_text?: string;
  note?: string;
  blocked_by?: string;
  start?: string;
  due?: string;
  since?: string;
  started?: string;
};

export type CcBoard = {
  week1: string;
  epics: Array<{ id: string; label: string }>;
  items: CcItem[];
};

/**
 * board.data.js is a classic script assigning window.CC_TRACKER (the base
 * needed file: URLs to work — see the snapshot's own header comment). We
 * read it in a vm sandbox: no eval in our process's scope, no network, a
 * timeout. The file is FROZEN — this module holds a read-only lens, never
 * a pen.
 */
export function readCcBoard(boardDataPath: string): CcBoard {
  const source = readFileSync(boardDataPath, 'utf8');
  const sandbox: { window: { CC_TRACKER?: unknown } } = { window: {} };
  runInNewContext(source, sandbox, { filename: boardDataPath, timeout: 5000 });
  const data = sandbox.window.CC_TRACKER as CcBoard | undefined;
  if (!data || !Array.isArray(data.items) || typeof data.week1 !== 'string') {
    throw new Error(`${boardDataPath} did not define window.CC_TRACKER with items and week1 — is this the frozen tracker snapshot?`);
  }
  return data;
}

/** The shop's operational errands: registrations and open questions. The
 * phase/test-case epics are the base project's dev work, not shop errands. */
export function errandItems(board: CcBoard): CcItem[] {
  return board.items.filter((item) => item.epic === 'registrations' || item.epic === 'questions');
}
```

Run: `pnpm --filter @gisik-nokma/server exec vitest run test/seed/cc-board.test.ts` — PASS.

- [ ] **Step 3: Write the failing mapping tests — the nothing-invented planted defects**

`apps/server/test/seed/cc-map.test.ts`:

```ts
import { docToPlainText } from '@gisik-nokma/domain';
import type { SubmittedEvent } from '@gisik-nokma/domain';
import { describe, expect, it } from 'vitest';
import { errandItems, readCcBoard, type CcItem } from '../../src/seed/cc-board.js';
import { buildErrandEvents, errandDescriptionText, neededWeekEnd, type CcMapContext } from '../../src/seed/cc-map.js';
import { seedUlid } from '../../src/seed/seed-ulid.js';

const boardPath = new URL('../../../../reference/convenience-corner-tracker/board.data.js', import.meta.url).pathname;
const board = readCcBoard(boardPath);
const errands = errandItems(board);
const titleById = new Map(board.items.map((item) => [item.id, item.title]));
const byId = (id: string): CcItem => {
  const item = errands.find((candidate) => candidate.id === id);
  if (!item) throw new Error(`snapshot is missing ${id} — has reference/ been re-snapshotted?`);
  return item;
};

const ctx: CcMapContext = {
  workspaceId: seedUlid('workspace', 'convenience-corner'),
  projectId: seedUlid('project', 'cc#shop-operations'),
  ownerUserId: '01J5OWNERUSER000000000000A',
  errandTypeId: 'errand',
  epicTicketIds: {
    registrations: seedUlid('ticket', 'cc#epic#registrations'),
    questions: seedUlid('ticket', 'cc#epic#questions'),
  },
  initialStateId: 'later',
  week1: board.week1,
  titleById,
  clientTime: '2026-08-20T12:00:00.000Z',
};

const eventsFor = (id: string): SubmittedEvent[] => buildErrandEvents(byId(id), ctx);
const fieldSet = (events: SubmittedEvent[], fieldId: string): SubmittedEvent | undefined =>
  events.find((event) => event.type === 'ticket.field_set' && (event.payload as { fieldId: string }).fieldId === fieldId);

describe('neededWeekEnd — the tracker generator’s own arithmetic (build_tracker.py:390)', () => {
  it('week 1 ends 2026-08-24', () => expect(neededWeekEnd('2026-08-18', 1)).toBe('2026-08-24'));
  it('week 7 ends 2026-10-05', () => expect(neededWeekEnd('2026-08-18', 7)).toBe('2026-10-05'));
  it('week 28 ends 2027-03-01', () => expect(neededWeekEnd('2026-08-18', 28)).toBe('2027-03-01'));
  it('week 0 ends 2026-08-17 — the day before week 1, exactly as the record’s arithmetic says', () =>
    expect(neededWeekEnd('2026-08-18', 0)).toBe('2026-08-17'));
});

describe('invariant 4 — a record without a date stays undated', () => {
  it('an item with no asked/submitted date gets NO startDate claim (ops:owner-github-plan)', () => {
    expect(fieldSet(eventsFor('ops:owner-github-plan'), 'startDate')).toBeUndefined();
  });

  it('planted defect from the record itself: ops:duns carries an attention `since` but no origin `started` — NO startDate claim', () => {
    const duns = byId('ops:duns');
    expect(duns.since).toBeDefined();
    expect(duns.started).toBeUndefined();
    expect(fieldSet(eventsFor('ops:duns'), 'startDate')).toBeUndefined();
  });

  it('the one origin-dated item gets its startDate verbatim (ops:accountant-hsn-digits, asked 2026-08-18)', () => {
    const claim = fieldSet(eventsFor('ops:accountant-hsn-digits'), 'startDate');
    expect(claim).toBeDefined();
    expect((claim?.payload as { value: string }).value).toBe('2026-08-18');
  });

  it('planted defect: strip needed_week from a copy and the dueDate claim disappears', () => {
    const original = byId('ops:accountant-hsn-digits');
    const stripped: CcItem = { ...original, meta: { ...original.meta, needed_week: undefined } };
    expect(fieldSet(buildErrandEvents(stripped, ctx), 'dueDate')).toBeUndefined();
  });

  it('needed_week becomes a dueDate claim carrying the derivation in its note', () => {
    const claim = fieldSet(eventsFor('ops:accountant-hsn-digits'), 'dueDate');
    const value = claim?.payload as { value: { date: string; note: string } };
    expect(value.value.date).toBe('2026-10-05'); // needed_week 7
    expect(value.value.note).toBe('from the tracker record — first needed in week 7');
  });
});

describe('statuses map without invention', () => {
  it('a `next` item transitions once, from initial, to next', () => {
    const events = eventsFor('ops:dlt-entity');
    const transitions = events.filter((event) => event.type === 'ticket.transitioned');
    expect(transitions).toHaveLength(1);
    expect((transitions[0].payload as { toStateId: string }).toStateId).toBe('next');
  });

  it('a `later` item emits NO transition — it sits in the initial state', () => {
    const events = eventsFor('ops:sms-header');
    expect(events.filter((event) => event.type === 'ticket.transitioned')).toHaveLength(0);
  });

  it('a `blocked` item maps to waiting (ops:apple-developer)', () => {
    const events = eventsFor('ops:apple-developer');
    const transition = events.find((event) => event.type === 'ticket.transitioned');
    expect((transition?.payload as { toStateId: string }).toStateId).toBe('waiting');
  });

  it('planted defect: a done item is refused — the seed never claims completion on anyone’s behalf', () => {
    const original = byId('ops:sms-header');
    expect(() => buildErrandEvents({ ...original, state: 'done', done: true }, ctx)).toThrowError(/terminal/);
  });

  it('planted defect: an unknown state is refused, never guessed', () => {
    const original = byId('ops:sms-header');
    expect(() => buildErrandEvents({ ...original, state: 'someday' }, ctx)).toThrowError(/someday/);
  });
});

describe('the body carries the record verbatim', () => {
  it('body text, counterparty, ask text and attention schedule are all present and literal', () => {
    const text = errandDescriptionText(byId('ops:duns'), titleById);
    expect(text).toContain('tracker id: ops:duns');
    expect(text).toContain('origin: operations/registrations/duns.md');
    expect(text).toContain('counterparty: Dun & Bradstreet');
    expect(text).toContain('tracker attention schedule (authored in board.json, not origin truth):');
    expect(text).toContain('since 2026-08-19');
  });

  it('a question’s who and ask ride along (ops:accountant-cloud-gst)', () => {
    const text = errandDescriptionText(byId('ops:accountant-cloud-gst'), titleById);
    expect(text).toContain('who: Accountant');
    expect(text).toContain('ask (verbatim, as drafted in the record):');
    expect(text).toContain('reverse charge');
  });

  it('blocked_by resolves to the blocking item’s human title', () => {
    const text = errandDescriptionText(byId('ops:apple-developer'), titleById);
    expect(text).toContain('blocked by: Can the proprietorship enrol as an organisation');
    expect(text).toContain('(tracker id ops:owner-store-account-entity)');
  });

  it('the description event carries the text as a literal-text doc', () => {
    const claim = fieldSet(eventsFor('ops:dlt-entity'), 'description');
    const text = docToPlainText((claim?.payload as { value: unknown }).value);
    expect(text).toContain('**Gates:** every SMS the platform will ever send');
  });
});

describe('determinism — the idempotence substrate', () => {
  it('two builds of the same item are identical, id for id', () => {
    expect(eventsFor('ops:duns')).toEqual(eventsFor('ops:duns'));
  });

  it('every event id is namespaced to the item so re-snapshotting cannot collide', () => {
    const created = eventsFor('ops:duns').find((event) => event.type === 'ticket.created');
    expect(created?.id).toBe(seedUlid('event', 'cc#ops:duns#created'));
  });
});
```

Run: FAIL (module missing).

- [ ] **Step 4: Implement the mapping**

`apps/server/src/seed/cc-map.ts`:

```ts
import type { SubmittedEvent } from '@gisik-nokma/domain';
import type { CcItem } from './cc-board.js';
import { plainTextDoc } from './doc-text.js';
import { seedUlid } from './seed-ulid.js';
import { TRACKER_STATE_TO_ERRAND_STATE } from './templates.js';

export type CcMapContext = {
  workspaceId: string;
  projectId: string;
  ownerUserId: string;
  errandTypeId: string;
  epicTicketIds: Record<'registrations' | 'questions', string>;
  initialStateId: string;
  week1: string;
  titleById: Map<string, string>;
  clientTime: string;
};

/** build_tracker.py line 390: week_end = week1 + timedelta(days=7*nw - 1).
 * The tracker's own published week arithmetic — derived, not invented. */
export function neededWeekEnd(week1: string, neededWeek: number): string {
  const date = new Date(`${week1}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 7 * neededWeek - 1);
  return date.toISOString().slice(0, 10);
}

/** Everything the record says, verbatim, in reading order. Only lines whose
 * source field exists are emitted — absence stays absent. */
export function errandDescriptionText(item: CcItem, titleById: Map<string, string>): string {
  const lines: string[] = [item.body.trimEnd(), '', '— tracker record —'];
  lines.push(`tracker id: ${item.id}`);
  lines.push(`origin: ${item.origin_file}`);
  if (item.meta.counterparty) lines.push(`counterparty: ${item.meta.counterparty}`);
  if (item.meta.who) lines.push(`who: ${item.meta.who}`);
  if (item.meta.cost) lines.push(`cost: ${item.meta.cost}`);
  if (item.meta.lead_time) lines.push(`lead time: ${item.meta.lead_time}`);
  const weeks: string[] = [];
  if (item.meta.clears_week !== undefined) weeks.push(`clears week ${item.meta.clears_week}`);
  if (item.meta.needed_week !== undefined) weeks.push(`needed week ${item.meta.needed_week}`);
  if (item.meta.slack !== undefined) weeks.push(`slack ${item.meta.slack}`);
  if (weeks.length > 0) lines.push(weeks.join(' · '));
  if (item.blocked_by) {
    const blockerTitle = titleById.get(item.blocked_by) ?? item.blocked_by;
    lines.push(`blocked by: ${blockerTitle} (tracker id ${item.blocked_by})`);
  }
  if (item.note) lines.push(`tracker note: ${item.note}`);
  const attention: string[] = [];
  if (item.start) attention.push(`start ${item.start}`);
  if (item.due) attention.push(`due ${item.due}`);
  if (item.since) attention.push(`since ${item.since}`);
  if (attention.length > 0) {
    lines.push(`tracker attention schedule (authored in board.json, not origin truth): ${attention.join(' · ')}`);
  }
  if (item.ask_text) {
    lines.push('', 'ask (verbatim, as drafted in the record):', item.ask_text.trimEnd());
  }
  return lines.join('\n');
}
```

Continue the same file:

```ts
export function buildErrandEvents(item: CcItem, ctx: CcMapContext): SubmittedEvent[] {
  const ticketId = seedUlid('ticket', `cc#${item.id}`);
  const events: SubmittedEvent[] = [];
  const push = (suffix: string, type: string, payload: unknown): void => {
    events.push({
      id: seedUlid('event', `cc#${item.id}#${suffix}`),
      workspaceId: ctx.workspaceId,
      entity: { kind: 'ticket', id: ticketId },
      type,
      version: 1,
      payload,
      actorId: ctx.ownerUserId,
      origin: 'server',
      clientTime: ctx.clientTime,
    });
  };

  const epic = item.epic as 'registrations' | 'questions';
  push('created', 'ticket.created', {
    typeId: ctx.errandTypeId,
    projectId: ctx.projectId,
    parentId: ctx.epicTicketIds[epic],
    title: item.title,
  });
  push('description', 'ticket.field_set', {
    fieldId: 'description',
    value: plainTextDoc(errandDescriptionText(item, ctx.titleById)),
  });

  const counterparty = item.meta.counterparty ?? item.meta.who;
  if (counterparty) {
    push('counterparty', 'ticket.field_set', { fieldId: 'counterparty', value: counterparty });
  }

  // Dates: ONLY what the record dates (spec §1 invariant 4).
  if (item.started) {
    push('startDate', 'ticket.field_set', { fieldId: 'startDate', value: item.started });
  }
  const neededWeekRaw = item.meta.needed_week;
  if (neededWeekRaw !== undefined && /^\d+$/.test(String(neededWeekRaw))) {
    const neededWeek = Number(neededWeekRaw);
    push('dueDate', 'ticket.field_set', {
      fieldId: 'dueDate',
      value: {
        date: neededWeekEnd(ctx.week1, neededWeek),
        note: `from the tracker record — first needed in week ${neededWeek}`,
      },
    });
  }

  if (item.state === 'done') {
    throw new Error(
      `${item.id} is 'done' in the tracker — the seed never emits a terminal claim; close it in the product, with the comment the workflow demands.`,
    );
  }
  const toStateId = TRACKER_STATE_TO_ERRAND_STATE[item.state];
  if (toStateId === undefined) {
    throw new Error(`${item.id} has tracker state '${item.state}' which has no mapping — refusing to guess.`);
  }
  if (toStateId !== ctx.initialStateId) {
    push('transition', 'ticket.transitioned', { toStateId });
  }
  return events;
}
```

- [ ] **Step 5: Run to green, commit**

Run: `pnpm --filter @gisik-nokma/server exec vitest run test/seed/cc-map.test.ts` — PASS (all planted defects firing as designed).

```bash
git add apps/server/src/seed/cc-board.ts apps/server/src/seed/cc-map.ts apps/server/test/seed/cc-board.test.ts apps/server/test/seed/cc-map.test.ts
git commit -m "feat(seed): the Convenience Corner mapping — frozen record in, events out, nothing invented

23 errands from the snapshot's registrations and questions epics. Origin
asked/submitted dates become startDate claims verbatim; needed_week
becomes a dueDate claim by the tracker's own week arithmetic with the
derivation named in the note; board.json attention dates stay prose in the
body, labelled as attention. done is refused, unknown states are refused,
and the planted defects prove each refusal — including the record's own
natural one, ops:duns, dated in attention but not in origin."
```

### Task 9: The Convenience Corner seed runner — through the real door, idempotently, verified

**Files:**
- Create: `apps/server/src/seed/seed-convenience-corner.ts`, `apps/server/src/seed/cli-seed-convenience-corner.ts`
- Modify: `apps/server/package.json` (script `seed:cc`)
- Test: `apps/server/test/seed/seed-cc.test.ts` (integration)

**Interfaces:**
- Consumes: Tasks 7–8; `createIngestService`/`IngestService`/`IngestResult` (Plan 1); `verifyProjections` + `buildProjectionRegistry` (Plan 1); `evaluateEvent` (Plan 2); `builtinTicketTypeDefs` (Plan 3); `membershipId` (Plan 2/coordination §5); `workflow.defined` (Plan 2), `ticket-type.defined` (Plan 3), `project.created`/`membership.granted`/`visibility.set` (Plan 4); `ERRAND_WITH_WAITS_TEMPLATE`, `SIMPLE_KANBAN_TEMPLATE` (Plan 8, per Task 7's pin).
- Produces:
  - `type CcSeedDeps = { ingest: IngestService; resolveUserId(email: string): Promise<string | null>; now?: () => Date }`
  - `type CcSeedOptions = { boardPath: string; ownerEmail: string; accountantEmail: string | null; allowMissingGuest: boolean }`
  - `type SeedReport = { committed: number; skippedExisting: number; tickets: number; guestConfigured: boolean }`
  - `seedConvenienceCorner(deps: CcSeedDeps, options: CcSeedOptions): Promise<SeedReport>` — refuses when the owner has never signed in; refuses on any result other than `committed` or `duplicate-event-id`.
  - CLI: `pnpm --filter @gisik-nokma/server run seed:cc` (env `SEED_OWNER_EMAIL`, `SEED_ACCOUNTANT_EMAIL`; flags `--board-path <path>` default `reference/convenience-corner-tracker/board.data.js`, `--allow-missing-guest`).
  - Seed entity ids (deterministic, shared with Task 8's tests): workspace `seedUlid('workspace','convenience-corner')`, project `seedUlid('project','cc#shop-operations')`, workflows `seedUlid('workflow','cc#errand-with-waits')` / `seedUlid('workflow','cc#simple-kanban')`, epic tickets `seedUlid('ticket','cc#epic#registrations'|'cc#epic#questions')`, errand type id `'errand'`.

- [ ] **Step 1: Write the failing integration test**

`apps/server/test/seed/seed-cc.test.ts`:

```ts
import { newUlid } from '@gisik-nokma/domain';
import { evaluateEvent } from '@gisik-nokma/rule-engine';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createIngestService } from '../../src/ingest/ingest-service.js';
import { buildProjectionRegistry } from '../../src/projections/index.js';
import { getTicketStateFromDb } from '../../src/projections/tickets.js';
import { seedUlid } from '../../src/seed/seed-ulid.js';
import { seedConvenienceCorner } from '../../src/seed/seed-convenience-corner.js';
import { verifyProjections } from '../../src/verify/verify-projections.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';

const boardPath = new URL('../../../../reference/convenience-corner-tracker/board.data.js', import.meta.url).pathname;

let db: TestDatabase;
const ownerUserId = newUlid();
const accountantUserId = newUlid();
const users = new Map([
  ['kiro@example.com', ownerUserId],
  ['accountant@example.com', accountantUserId],
]);
const resolveUserId = async (email: string): Promise<string | null> => users.get(email) ?? null;

beforeAll(async () => {
  db = await createTestDatabase();
});
afterAll(async () => {
  await db.drop();
});

function makeDeps() {
  const projections = buildProjectionRegistry();
  const ingest = createIngestService({ pool: db.pool, evaluate: evaluateEvent, projections });
  return { ingest, projections, resolveUserId };
}

async function eventCount(): Promise<number> {
  const result = await db.pool.query('SELECT count(*)::int AS n FROM events');
  return (result.rows[0] as { n: number }).n;
}

describe('seedConvenienceCorner', () => {
  it('refuses when the owner has never signed in — people are not invented', async () => {
    const { ingest } = makeDeps();
    await expect(
      seedConvenienceCorner(
        { ingest, resolveUserId },
        { boardPath, ownerEmail: 'nobody@example.com', accountantEmail: null, allowMissingGuest: true },
      ),
    ).rejects.toThrowError(/sign in once/);
    expect(await eventCount()).toBe(0);
  });

  it('first run without the accountant: everything except the guest surface lands', async () => {
    const { ingest } = makeDeps();
    const report = await seedConvenienceCorner(
      { ingest, resolveUserId },
      { boardPath, ownerEmail: 'kiro@example.com', accountantEmail: 'not-yet@example.com', allowMissingGuest: true },
    );
    expect(report.tickets).toBe(23);
    expect(report.guestConfigured).toBe(false);
    expect(report.committed).toBeGreaterThan(0);
    expect(report.skippedExisting).toBe(0);
  });

  it('the seeded board tells the record’s truth', async () => {
    const workspaceId = seedUlid('workspace', 'convenience-corner');
    const duns = await getTicketStateFromDb(db.pool, workspaceId, seedUlid('ticket', 'cc#ops:duns'));
    expect(duns?.stateId).toBe('next');
    const hsn = await getTicketStateFromDb(db.pool, workspaceId, seedUlid('ticket', 'cc#ops:accountant-hsn-digits'));
    expect(hsn?.stateId).toBe('in-progress');
    const apple = await getTicketStateFromDb(db.pool, workspaceId, seedUlid('ticket', 'cc#ops:apple-developer'));
    expect(apple?.stateId).toBe('waiting');
    // Provenance: the dueDate claim is the owner's, with the derivation note.
    const dueClaim = hsn?.fields.dueDate;
    expect(dueClaim?.actorId).toBe(ownerUserId);
    expect((dueClaim?.value as { note: string }).note).toContain('from the tracker record');
  });

  it('re-run is a no-op: every event skips as already present, none commits', async () => {
    const before = await eventCount();
    const { ingest } = makeDeps();
    const report = await seedConvenienceCorner(
      { ingest, resolveUserId },
      { boardPath, ownerEmail: 'kiro@example.com', accountantEmail: 'not-yet@example.com', allowMissingGuest: true },
    );
    expect(report.committed).toBe(0);
    expect(report.skippedExisting).toBeGreaterThan(0);
    expect(await eventCount()).toBe(before);
  });

  it('a later run with the accountant present adds ONLY the guest surface (staged seeding)', async () => {
    const before = await eventCount();
    const { ingest } = makeDeps();
    const report = await seedConvenienceCorner(
      { ingest, resolveUserId },
      { boardPath, ownerEmail: 'kiro@example.com', accountantEmail: 'accountant@example.com', allowMissingGuest: false },
    );
    expect(report.guestConfigured).toBe(true);
    // guest membership + 4 explicit visibility.set events
    expect(report.committed).toBe(5);
    expect(await eventCount()).toBe(before + 5);
  });

  it('the freshness gate holds over the seeded world', async () => {
    const { projections } = makeDeps();
    const verdict = await verifyProjections({ pool: db.pool, projections });
    expect(verdict.clean).toBe(true);
  });
});
```

(Adjust import paths for `getTicketStateFromDb` and `verifyProjections` to where Plans 3 and 1 placed them — the names are their contracted Produces.) Run: FAIL (module missing).

- [ ] **Step 2: Implement the runner**

`apps/server/src/seed/seed-convenience-corner.ts`:

```ts
import { ERRAND_WITH_WAITS_TEMPLATE, SIMPLE_KANBAN_TEMPLATE, membershipId } from '@gisik-nokma/domain';
import type { SubmittedEvent } from '@gisik-nokma/domain';
import { builtinTicketTypeDefs } from '@gisik-nokma/domain';
import type { IngestService } from '../ingest/ingest-service.js';
import { errandItems, readCcBoard } from './cc-board.js';
import { buildErrandEvents, type CcMapContext } from './cc-map.js';
import { seedUlid } from './seed-ulid.js';
import { checkErrandTemplate, workflowFromTemplate } from './templates.js';

export type CcSeedDeps = {
  ingest: IngestService;
  resolveUserId(email: string): Promise<string | null>;
  now?: () => Date;
};

export type CcSeedOptions = {
  boardPath: string;
  ownerEmail: string;
  accountantEmail: string | null;
  allowMissingGuest: boolean;
};

export type SeedReport = {
  committed: number;
  skippedExisting: number;
  tickets: number;
  guestConfigured: boolean;
};

export async function seedConvenienceCorner(deps: CcSeedDeps, options: CcSeedOptions): Promise<SeedReport> {
  const board = readCcBoard(options.boardPath);
  const errands = errandItems(board);

  const ownerUserId = await deps.resolveUserId(options.ownerEmail);
  if (!ownerUserId) {
    throw new Error(
      `no user has the email ${options.ownerEmail} — the owner must sign in once before seeding; the seed never invents people.`,
    );
  }
  const accountantUserId = options.accountantEmail ? await deps.resolveUserId(options.accountantEmail) : null;
  if (options.accountantEmail && !accountantUserId && !options.allowMissingGuest) {
    throw new Error(
      `no user has the email ${options.accountantEmail} — have the accountant sign in first, or pass --allow-missing-guest and re-run later (the seed is idempotent).`,
    );
  }

  const templateCheck = checkErrandTemplate(ERRAND_WITH_WAITS_TEMPLATE);
  if (!templateCheck.ok) {
    throw new Error(`the errand-with-waits template cannot carry the tracker board: ${templateCheck.problems.join('; ')}`);
  }

  const workspaceId = seedUlid('workspace', 'convenience-corner');
  const projectId = seedUlid('project', 'cc#shop-operations');
  const errandWorkflowId = seedUlid('workflow', 'cc#errand-with-waits');
  const kanbanWorkflowId = seedUlid('workflow', 'cc#simple-kanban');
  const clientTime = (deps.now?.() ?? new Date()).toISOString();

  const events: SubmittedEvent[] = [];
  const push = (key: string, entity: SubmittedEvent['entity'], type: string, payload: unknown): void => {
    events.push({
      id: seedUlid('event', key),
      workspaceId,
      entity,
      type,
      version: 1,
      payload,
      actorId: ownerUserId,
      origin: 'server',
      clientTime,
    });
  };

  push('cc#workspace#created', { kind: 'workspace', id: workspaceId }, 'workspace.created', { name: 'Convenience Corner' });
  push('cc#membership#owner', { kind: 'membership', id: membershipId(workspaceId, ownerUserId) }, 'membership.granted', {
    userId: ownerUserId,
    role: 'owner',
    scope: 'workspace',
  });
  push('cc#project#shop-operations', { kind: 'project', id: projectId }, 'project.created', { name: 'Shop operations' });
  push('cc#workflow#errand-with-waits', { kind: 'workflow', id: errandWorkflowId }, 'workflow.defined',
    workflowFromTemplate(ERRAND_WITH_WAITS_TEMPLATE, errandWorkflowId));
  push('cc#workflow#simple-kanban', { kind: 'workflow', id: kanbanWorkflowId }, 'workflow.defined',
    workflowFromTemplate(SIMPLE_KANBAN_TEMPLATE, kanbanWorkflowId));
  for (const typeDef of builtinTicketTypeDefs(kanbanWorkflowId)) {
    push(`cc#type#${typeDef.id}`, { kind: 'ticket-type', id: typeDef.id }, 'ticket-type.defined', typeDef);
  }
  push('cc#type#errand', { kind: 'ticket-type', id: 'errand' }, 'ticket-type.defined', {
    id: 'errand',
    name: 'Errand',
    icon: '📮',
    rank: 3,
    workflowId: errandWorkflowId,
    fields: [
      { id: 'counterparty', name: 'Counterparty', type: 'text' },
      { id: 'startDate', name: 'Started on', type: 'date' },
    ],
  });

  const epicTicketIds = {
    registrations: seedUlid('ticket', 'cc#epic#registrations'),
    questions: seedUlid('ticket', 'cc#epic#questions'),
  } as const;
  const epicLabel = (epicId: string): string => {
    const epic = board.epics.find((candidate) => candidate.id === epicId);
    if (!epic) throw new Error(`the snapshot has no epic '${epicId}' — has reference/ been re-snapshotted?`);
    return epic.label;
  };
  push('cc#epic#registrations#created', { kind: 'ticket', id: epicTicketIds.registrations }, 'ticket.created', {
    typeId: 'epic',
    projectId,
    parentId: null,
    title: epicLabel('registrations'),
  });
  push('cc#epic#questions#created', { kind: 'ticket', id: epicTicketIds.questions }, 'ticket.created', {
    typeId: 'epic',
    projectId,
    parentId: null,
    title: epicLabel('questions'),
  });

  const mapContext: CcMapContext = {
    workspaceId,
    projectId,
    ownerUserId,
    errandTypeId: 'errand',
    epicTicketIds,
    initialStateId: ERRAND_WITH_WAITS_TEMPLATE.initialStateId,
    week1: board.week1,
    titleById: new Map(board.items.map((item) => [item.id, item.title])),
    clientTime,
  };
  for (const item of errands) {
    events.push(...buildErrandEvents(item, mapContext));
  }

  const guestConfigured = accountantUserId !== null;
  if (accountantUserId) {
    push('cc#membership#accountant', { kind: 'membership', id: membershipId(workspaceId, accountantUserId) }, 'membership.granted', {
      userId: accountantUserId,
      role: 'guest',
      scope: { projectId },
    });
    // Explicit visibility on exactly the tickets whose record names the
    // accountant. The owner stays listed: the explicit list is exactly the
    // authored list (Plan 4), and losing sight of your own errand is a
    // legal claim nobody wants seeded.
    for (const item of errands.filter((candidate) => candidate.meta.who === 'Accountant')) {
      const ticketId = seedUlid('ticket', `cc#${item.id}`);
      push(`cc#${item.id}#visibility`, { kind: 'ticket', id: ticketId }, 'visibility.set', {
        ticketId,
        mode: 'explicit',
        userIds: [ownerUserId, accountantUserId],
      });
    }
  }

  const results = await deps.ingest.ingestBatch(events);
  let committed = 0;
  let skippedExisting = 0;
  results.forEach((result, index) => {
    if (result.status === 'committed') {
      committed += 1;
    } else if (result.status === 'invalid' && result.code === 'duplicate-event-id') {
      skippedExisting += 1;
    } else {
      const event = events[index];
      throw new Error(
        `seed event ${event.type} (${event.id}) was not accepted: ${JSON.stringify(result)} — a seed that cannot land cleanly must fail loudly, not partially.`,
      );
    }
  });

  return { committed, skippedExisting, tickets: errands.length, guestConfigured };
}
```

**Execution note (Plan 4's permission gate):** if `ingestBatch` refuses the bootstrap (`workspace.created` / the owner's `membership.granted`) with a `permission.*` rule, the refusal will name it — consult Plan 4's workspace-creation bootstrap as landed and mirror its event order here. Adapt the seed's order, never weaken the gate.

- [ ] **Step 3: Run the integration suite**

Run: `pnpm --filter @gisik-nokma/server exec vitest run test/seed/seed-cc.test.ts`
Expected: PASS — including the staged-guest arithmetic (exactly 5 late events) and the clean verifier.

- [ ] **Step 4: Write the CLI**

`apps/server/src/seed/cli-seed-convenience-corner.ts`:

```ts
import { evaluateEvent } from '@gisik-nokma/rule-engine';
import { loadConfig } from '../config.js';
import { createPool } from '../db/pool.js';
import { createIngestService } from '../ingest/ingest-service.js';
import { buildProjectionRegistry } from '../projections/index.js';
import { seedConvenienceCorner } from './seed-convenience-corner.js';
import { findUserIdByEmail } from './users.js';

function argValue(flag: string): string | null {
  const index = process.argv.indexOf(flag);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : null;
}

async function main(): Promise<void> {
  const config = loadConfig(process.env);
  const ownerEmail = argValue('--owner-email') ?? process.env.SEED_OWNER_EMAIL ?? null;
  if (!ownerEmail) {
    console.error('usage: seed:cc --owner-email <email> [--accountant-email <email>] [--allow-missing-guest] [--board-path <path>]');
    console.error('(or set SEED_OWNER_EMAIL / SEED_ACCOUNTANT_EMAIL)');
    process.exit(2);
  }
  const pool = createPool(config.databaseUrl, { caCert: config.databaseCaCert });
  try {
    const ingest = createIngestService({ pool, evaluate: evaluateEvent, projections: buildProjectionRegistry() });
    const report = await seedConvenienceCorner(
      { ingest, resolveUserId: (email) => findUserIdByEmail(pool, email) },
      {
        boardPath: argValue('--board-path') ?? 'reference/convenience-corner-tracker/board.data.js',
        ownerEmail,
        accountantEmail: argValue('--accountant-email') ?? process.env.SEED_ACCOUNTANT_EMAIL ?? null,
        allowMissingGuest: process.argv.includes('--allow-missing-guest'),
      },
    );
    console.log(
      `Convenience Corner seed: ${report.committed} committed, ${report.skippedExisting} already present, ` +
        `${report.tickets} errand tickets, guest ${report.guestConfigured ? 'configured' : 'NOT configured (re-run when the accountant has signed in)'}.`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
```

Add to `apps/server/package.json` scripts: `"seed:cc": "node dist/seed/cli-seed-convenience-corner.js"`.

- [ ] **Step 5: Smoke the CLI against the dev stack**

```bash
docker compose -f docker-compose.dev.yml up -d
# Sign in once through the web client (http://localhost:3001) with your email
# — Mailpit at http://localhost:8025 catches the magic link — then:
docker compose -f docker-compose.dev.yml exec \
  -e SEED_OWNER_EMAIL=<the email you signed in with> server \
  node dist/seed/cli-seed-convenience-corner.js --allow-missing-guest
# Expected: "... 23 errand tickets, guest NOT configured ...". Run it again:
# expected "0 committed, N already present".
```

Then open the board in the web client: the Registrations and Open questions epics with the shop's real errands, D-U-N-S in Next, HSN digit count in In progress with its startDate, Apple Developer waiting.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/seed/seed-convenience-corner.ts apps/server/src/seed/cli-seed-convenience-corner.ts apps/server/package.json apps/server/test/seed/seed-cc.test.ts
git commit -m "feat(seed): Convenience Corner workspace — the shop's real errands through the real door

Every seed event goes through createIngestService — same rule engine, same
refusals as any client. Deterministic ids make re-runs no-ops (proven);
staged guest seeding adds exactly the membership and four explicit
visibility claims when the accountant signs in; verify-projections runs
clean over the seeded world. Anything the ledger refuses fails the seed
loudly and completely."
```

### Task 10: The Gisik Nokma dev seed — one epic per plan, tickets per task, nothing dated

**Files:**
- Create: `apps/server/src/seed/plan-series.ts`, `apps/server/src/seed/seed-dev-workspace.ts`, `apps/server/src/seed/cli-seed-dev-workspace.ts`
- Modify: `apps/server/package.json` (script `seed:dev`)
- Test: `apps/server/test/seed/plan-series.test.ts`, `apps/server/test/seed/seed-dev.test.ts`

**Interfaces:**
- Consumes: Tasks 7 and 9's plumbing (`seedUlid`, `plainTextDoc`, `workflowFromTemplate`, `SIMPLE_KANBAN_TEMPLATE`, `builtinTicketTypeDefs`, `membershipId`, ingest wiring, `findUserIdByEmail`); the plan documents in `docs/superpowers/plans/` (the record this seed reads).
- Produces:
  - `type PlanDoc = { file: string; planNumber: string; title: string; goal: string | null; tasks: Array<{ number: number; title: string }> }`
  - `readPlanSeries(plansDir: string): PlanDoc[]` — skips `00` (coordination is not an execution plan); refuses a file with no H1.
  - `buildDevSeedEvents(docs: PlanDoc[], ownerUserId: string, clientTime: string): SubmittedEvent[]`
  - `seedDevWorkspace(deps: CcSeedDeps, options: { plansDir: string; ownerEmail: string }): Promise<SeedReport>` (reusing Task 9's deps/report types; `tickets` counts task tickets).
  - CLI: `pnpm --filter @gisik-nokma/server run seed:dev -- --plans-dir <path>` (default `docs/superpowers/plans`) — run from a repo checkout; the plan documents are not in the container image.
  - Id conventions: workspace `seedUlid('workspace','gisik-nokma-dev')`, project `seedUlid('project','dev#build')`, workflow `seedUlid('workflow','dev#simple-kanban')`, epics `seedUlid('ticket', 'dev#plan-<NN>')`, tasks `seedUlid('ticket', 'dev#plan-<NN>#task-<N>')`.

- [ ] **Step 1: Write the failing parser tests**

`apps/server/test/seed/plan-series.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { readPlanSeries } from '../../src/seed/plan-series.js';

const plansDir = new URL('../../../../docs/superpowers/plans', import.meta.url).pathname;

describe('readPlanSeries — the plan documents are the record', () => {
  it('reads the full series, skipping the coordination doc', () => {
    const docs = readPlanSeries(plansDir);
    expect(docs).toHaveLength(11);
    expect(docs.map((doc) => doc.planNumber)).toEqual(['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11']);
    expect(docs.some((doc) => doc.planNumber === '00')).toBe(false);
  });

  it('every plan has a verbatim H1 title, a goal, and at least one task', () => {
    for (const doc of readPlanSeries(plansDir)) {
      expect(doc.title.length).toBeGreaterThan(0);
      expect(doc.title).not.toContain('#');
      expect(doc.goal).not.toBeNull();
      expect(doc.tasks.length).toBeGreaterThan(0);
      for (const task of doc.tasks) {
        expect(task.title.length).toBeGreaterThan(0);
      }
    }
  });

  it('reads this very plan’s tasks (the seed will hold the plan that created it)', () => {
    const docs = readPlanSeries(plansDir);
    const eleven = docs.find((doc) => doc.planNumber === '11');
    expect(eleven?.title).toContain('Deployment');
    expect(eleven?.tasks.length).toBeGreaterThanOrEqual(16);
  });
});
```

- [ ] **Step 2: Implement the parser**

`apps/server/src/seed/plan-series.ts`:

```ts
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

export type PlanTask = { number: number; title: string };
export type PlanDoc = {
  file: string;
  planNumber: string;
  title: string;
  goal: string | null;
  tasks: PlanTask[];
};

/**
 * The dev seed's record IS the plan series: titles and task headings are
 * read verbatim from the documents; nothing is summarised, renamed, or
 * invented. Plan 00 (coordination) is skipped — it is an interface
 * authority, not an execution plan.
 */
export function readPlanSeries(plansDir: string): PlanDoc[] {
  const files = readdirSync(plansDir)
    .filter((name) => /^\d{4}-\d{2}-\d{2}-\d{2}-.+\.md$/.test(name))
    .sort();
  const docs: PlanDoc[] = [];
  for (const file of files) {
    const planNumber = file.match(/^\d{4}-\d{2}-\d{2}-(\d{2})-/)?.[1];
    if (!planNumber || planNumber === '00') continue;
    const text = readFileSync(join(plansDir, file), 'utf8');
    const lines = text.split('\n');
    const titleLine = lines.find((line) => line.startsWith('# '));
    if (!titleLine) throw new Error(`${file} has no H1 title — refusing to invent one`);
    const goalLine = lines.find((line) => line.startsWith('**Goal:**'));
    const tasks = [...text.matchAll(/^### Task (\d+): (.+)$/gm)].map((match) => ({
      number: Number(match[1]),
      title: match[2].trim(),
    }));
    docs.push({
      file,
      planNumber,
      title: titleLine.slice(2).trim(),
      goal: goalLine ? goalLine.replace('**Goal:**', '').trim() : null,
      tasks,
    });
  }
  if (docs.length === 0) throw new Error(`${plansDir} holds no plan documents`);
  return docs;
}
```

Run: `pnpm --filter @gisik-nokma/server exec vitest run test/seed/plan-series.test.ts` — PASS.

- [ ] **Step 3: Write the failing seed tests — undated by proof**

`apps/server/test/seed/seed-dev.test.ts`:

```ts
import { newUlid } from '@gisik-nokma/domain';
import { evaluateEvent } from '@gisik-nokma/rule-engine';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createIngestService } from '../../src/ingest/ingest-service.js';
import { buildProjectionRegistry } from '../../src/projections/index.js';
import { readPlanSeries } from '../../src/seed/plan-series.js';
import { buildDevSeedEvents, seedDevWorkspace } from '../../src/seed/seed-dev-workspace.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';

const plansDir = new URL('../../../../docs/superpowers/plans', import.meta.url).pathname;
const ownerUserId = newUlid();
const resolveUserId = async (email: string): Promise<string | null> =>
  email === 'kiro@example.com' ? ownerUserId : null;

describe('buildDevSeedEvents — the calendar stays empty', () => {
  const events = buildDevSeedEvents(readPlanSeries(plansDir), ownerUserId, '2026-08-20T12:00:00.000Z');

  it('planted defect (invariant 4): no date claims at all — the plan series claims no dates', () => {
    const dateClaims = events.filter((event) => {
      if (event.type !== 'ticket.field_set') return false;
      const fieldId = (event.payload as { fieldId: string }).fieldId;
      return fieldId === 'dueDate' || fieldId === 'startDate';
    });
    expect(dateClaims).toHaveLength(0);
  });

  it('planted defect: no transitions — no script claims progress on work it did not do', () => {
    expect(events.filter((event) => event.type === 'ticket.transitioned')).toHaveLength(0);
  });

  it('one epic per plan, one task ticket per task heading, titles verbatim', () => {
    const docs = readPlanSeries(plansDir);
    const created = events.filter((event) => event.type === 'ticket.created');
    const epics = created.filter((event) => (event.payload as { typeId: string }).typeId === 'epic');
    const tasks = created.filter((event) => (event.payload as { typeId: string }).typeId === 'task');
    expect(epics).toHaveLength(docs.length);
    expect(tasks).toHaveLength(docs.reduce((sum, doc) => sum + doc.tasks.length, 0));
    const eleven = docs.find((doc) => doc.planNumber === '11');
    expect(epics.some((event) => (event.payload as { title: string }).title === eleven?.title)).toBe(true);
  });
});

describe('seedDevWorkspace', () => {
  let db: TestDatabase;
  beforeAll(async () => {
    db = await createTestDatabase();
  });
  afterAll(async () => {
    await db.drop();
  });

  it('lands, and a re-run is a no-op', async () => {
    const makeIngest = () =>
      createIngestService({ pool: db.pool, evaluate: evaluateEvent, projections: buildProjectionRegistry() });
    const first = await seedDevWorkspace(
      { ingest: makeIngest(), resolveUserId },
      { plansDir, ownerEmail: 'kiro@example.com' },
    );
    expect(first.committed).toBeGreaterThan(0);
    const second = await seedDevWorkspace(
      { ingest: makeIngest(), resolveUserId },
      { plansDir, ownerEmail: 'kiro@example.com' },
    );
    expect(second.committed).toBe(0);
    expect(second.skippedExisting).toBe(first.committed);
  });
});
```

Run: FAIL.

- [ ] **Step 4: Implement the dev seed**

`apps/server/src/seed/seed-dev-workspace.ts`:

```ts
import { SIMPLE_KANBAN_TEMPLATE, builtinTicketTypeDefs, membershipId } from '@gisik-nokma/domain';
import type { SubmittedEvent } from '@gisik-nokma/domain';
import { plainTextDoc } from './doc-text.js';
import { readPlanSeries, type PlanDoc } from './plan-series.js';
import type { CcSeedDeps, SeedReport } from './seed-convenience-corner.js';
import { seedUlid } from './seed-ulid.js';
import { workflowFromTemplate } from './templates.js';

export function buildDevSeedEvents(docs: PlanDoc[], ownerUserId: string, clientTime: string): SubmittedEvent[] {
  const workspaceId = seedUlid('workspace', 'gisik-nokma-dev');
  const projectId = seedUlid('project', 'dev#build');
  const workflowId = seedUlid('workflow', 'dev#simple-kanban');
  const events: SubmittedEvent[] = [];
  const push = (key: string, entity: SubmittedEvent['entity'], type: string, payload: unknown): void => {
    events.push({
      id: seedUlid('event', key),
      workspaceId,
      entity,
      type,
      version: 1,
      payload,
      actorId: ownerUserId,
      origin: 'server',
      clientTime,
    });
  };

  push('dev#workspace#created', { kind: 'workspace', id: workspaceId }, 'workspace.created', { name: 'Gisik Nokma' });
  push('dev#membership#owner', { kind: 'membership', id: membershipId(workspaceId, ownerUserId) }, 'membership.granted', {
    userId: ownerUserId,
    role: 'owner',
    scope: 'workspace',
  });
  push('dev#project#build', { kind: 'project', id: projectId }, 'project.created', { name: 'Build — the plan series' });
  push('dev#workflow#simple-kanban', { kind: 'workflow', id: workflowId }, 'workflow.defined',
    workflowFromTemplate(SIMPLE_KANBAN_TEMPLATE, workflowId));
  for (const typeDef of builtinTicketTypeDefs(workflowId)) {
    push(`dev#type#${typeDef.id}`, { kind: 'ticket-type', id: typeDef.id }, 'ticket-type.defined', typeDef);
  }

  for (const doc of docs) {
    const epicId = seedUlid('ticket', `dev#plan-${doc.planNumber}`);
    push(`dev#plan-${doc.planNumber}#created`, { kind: 'ticket', id: epicId }, 'ticket.created', {
      typeId: 'epic',
      projectId,
      parentId: null,
      title: doc.title,
    });
    if (doc.goal) {
      push(`dev#plan-${doc.planNumber}#description`, { kind: 'ticket', id: epicId }, 'ticket.field_set', {
        fieldId: 'description',
        value: plainTextDoc(`Goal: ${doc.goal}\n\nsource: docs/superpowers/plans/${doc.file}`),
      });
    }
    for (const task of doc.tasks) {
      const taskTicketId = seedUlid('ticket', `dev#plan-${doc.planNumber}#task-${task.number}`);
      push(`dev#plan-${doc.planNumber}#task-${task.number}#created`, { kind: 'ticket', id: taskTicketId }, 'ticket.created', {
        typeId: 'task',
        projectId,
        parentId: epicId,
        title: `Task ${task.number}: ${task.title}`,
      });
      push(`dev#plan-${doc.planNumber}#task-${task.number}#description`, { kind: 'ticket', id: taskTicketId }, 'ticket.field_set', {
        fieldId: 'description',
        value: plainTextDoc(`source: docs/superpowers/plans/${doc.file} § Task ${task.number}`),
      });
    }
  }
  // Deliberately: no dates, no transitions. The plan series claims no
  // dates (invariant 4 — the calendar stays empty), and execution state is
  // authored in the product, by the humans doing the work, as it happens.
  return events;
}

export async function seedDevWorkspace(
  deps: CcSeedDeps,
  options: { plansDir: string; ownerEmail: string },
): Promise<SeedReport> {
  const ownerUserId = await deps.resolveUserId(options.ownerEmail);
  if (!ownerUserId) {
    throw new Error(
      `no user has the email ${options.ownerEmail} — the owner must sign in once before seeding; the seed never invents people.`,
    );
  }
  const docs = readPlanSeries(options.plansDir);
  const events = buildDevSeedEvents(docs, ownerUserId, (deps.now?.() ?? new Date()).toISOString());
  const results = await deps.ingest.ingestBatch(events);
  let committed = 0;
  let skippedExisting = 0;
  results.forEach((result, index) => {
    if (result.status === 'committed') committed += 1;
    else if (result.status === 'invalid' && result.code === 'duplicate-event-id') skippedExisting += 1;
    else {
      throw new Error(
        `dev seed event ${events[index].type} (${events[index].id}) was not accepted: ${JSON.stringify(result)}`,
      );
    }
  });
  const tickets = docs.reduce((sum, doc) => sum + doc.tasks.length, 0);
  return { committed, skippedExisting, tickets, guestConfigured: false };
}
```

`apps/server/src/seed/cli-seed-dev-workspace.ts` — same skeleton as Task 9's CLI with: `--plans-dir` (default `docs/superpowers/plans`), `--owner-email`/`SEED_OWNER_EMAIL`, calling `seedDevWorkspace`, printing `Gisik Nokma dev seed: N committed, M already present, T task tickets.` Add script `"seed:dev": "node dist/seed/cli-seed-dev-workspace.js"`.

- [ ] **Step 5: Run to green, commit**

Run: `pnpm --filter @gisik-nokma/server exec vitest run test/seed/plan-series.test.ts test/seed/seed-dev.test.ts` — PASS.

```bash
git add apps/server/src/seed/plan-series.ts apps/server/src/seed/seed-dev-workspace.ts apps/server/src/seed/cli-seed-dev-workspace.ts apps/server/package.json apps/server/test/seed/plan-series.test.ts apps/server/test/seed/seed-dev.test.ts
git commit -m "feat(seed): Gisik Nokma dev workspace — the product managing its own build

One epic per plan document, one task ticket per task heading, titles
verbatim from the documents (the record this seed reads). No dates and no
transitions by proof: the plan series claims no dates, and no script
claims progress on work it did not do. Idempotent like its sibling."
```

### Task 11: Backups — nightly pg_dump, weekly ledger export, a daemon that phones home on failure

**Files:**
- Create: `apps/server/src/ops/object-sink.ts`, `apps/server/src/ops/export-ledger.ts`, `apps/server/src/ops/pg-dump.ts`, `apps/server/src/ops/schedule.ts`, `apps/server/src/ops/backup-daemon-main.ts`, `apps/server/src/ops/fetch-backup.ts`
- Modify: `apps/server/package.json` (deps `@aws-sdk/client-s3`, `@aws-sdk/lib-storage`; scripts)
- Test: `apps/server/test/ops/schedule.test.ts`, `apps/server/test/ops/export-ledger.test.ts`, `apps/server/test/ops/pg-dump.test.ts`

**Interfaces:**
- Consumes: `readLedger` (Plan 1, canonical replay order), Task 3's `ErrorAlerter`, Task 6's `S3_*`/`BACKUP_*` env names, the `postgresql16-client` binaries in the server image (Task 5).
- Produces:
  - `type ObjectSink = { put(key: string, body: Readable, contentType: string): Promise<void> }`; `s3SinkFromEnv(env: NodeJS.ProcessEnv, bucketVar: string): ObjectSink` (reads `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_FORCE_PATH_STYLE`, and the named bucket var).
  - `exportLedger(pool: Pool, sink: ObjectSink, now: () => Date): Promise<string>` → key `ledger/YYYY-MM-DD.ndjson.gz` — **the ledger IS the source of truth**: every projection rebuilds from it (Plan 1's rebuild + verifier prove it), so this export alone is a sufficient recovery artifact; the pg_dump is the convenient one.
  - `dumpDatabaseToSink(databaseUrl: string, sink: ObjectSink, now: () => Date): Promise<string>` → key `pg/YYYY-MM-DDTHH-mm.dump` (pg_dump custom format).
  - `msUntilNextUtc(timeHHMM: string, from: Date, dayOfWeek?: number): number`; `startBackupDaemon(...)` — nightly dump at `BACKUP_TIME_UTC` (default `21:00` = 02:30 IST), weekly ledger export at `LEDGER_EXPORT_TIME_UTC` on `LEDGER_EXPORT_DOW_UTC` (default Sunday); failures alert via `ErrorAlerter`.
  - Worker entry: `node dist/ops/backup-daemon-main.js` (the DO worker and any cron host run this); one-shot scripts `"ops:backup": "node dist/ops/backup-once.js"`-style invocation is provided by passing `--once` to the same entry (runs both jobs immediately and exits — what the runbook's manual backup uses).

- [ ] **Step 1: Write the failing schedule tests**

`apps/server/test/ops/schedule.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { msUntilNextUtc } from '../../src/ops/schedule.js';

describe('msUntilNextUtc', () => {
  it('later today when the time is still ahead', () => {
    const from = new Date('2026-08-20T20:00:00.000Z');
    expect(msUntilNextUtc('21:00', from)).toBe(60 * 60 * 1000);
  });

  it('tomorrow when the time has passed', () => {
    const from = new Date('2026-08-20T21:30:00.000Z');
    expect(msUntilNextUtc('21:00', from)).toBe(23.5 * 60 * 60 * 1000);
  });

  it('honours a day-of-week (0 = Sunday): from Thursday 2026-08-20, next Sunday 22:00 is the 23rd', () => {
    const from = new Date('2026-08-20T12:00:00.000Z'); // a Thursday
    const ms = msUntilNextUtc('22:00', from, 0);
    expect(new Date(from.getTime() + ms).toISOString()).toBe('2026-08-23T22:00:00.000Z');
  });

  it('planted defect: a malformed time is refused, named', () => {
    expect(() => msUntilNextUtc('9pm', new Date())).toThrowError(/9pm/);
  });
});
```

- [ ] **Step 2: Implement the schedule**

`apps/server/src/ops/schedule.ts`:

```ts
import type { ErrorAlerter } from '../alerts/error-alerter.js';

export function msUntilNextUtc(timeHHMM: string, from: Date, dayOfWeek?: number): number {
  const match = timeHHMM.match(/^(\d{2}):(\d{2})$/);
  if (!match) throw new Error(`backup time must be HH:MM (UTC), got '${timeHHMM}'`);
  const [, hours, minutes] = match;
  const next = new Date(from);
  next.setUTCHours(Number(hours), Number(minutes), 0, 0);
  while (next.getTime() <= from.getTime() || (dayOfWeek !== undefined && next.getUTCDay() !== dayOfWeek)) {
    next.setUTCDate(next.getUTCDate() + 1);
    next.setUTCHours(Number(hours), Number(minutes), 0, 0);
  }
  return next.getTime() - from.getTime();
}

export type BackupJobs = { runPgDump(): Promise<void>; runLedgerExport(): Promise<void> };
export type BackupTimes = { pgDumpTimeUtc: string; ledgerExportTimeUtc: string; ledgerExportDowUtc: number };

/** A backup that fails silently is a lie about being backed up — every
 * failure goes to the alerter, and the daemon keeps its schedule. */
export function startBackupDaemon(jobs: BackupJobs, times: BackupTimes, alerter: ErrorAlerter): { stop(): void } {
  let stopped = false;
  const timers = new Set<NodeJS.Timeout>();

  const loop = (name: string, run: () => Promise<void>, delayMs: () => number): void => {
    if (stopped) return;
    const timer = setTimeout(() => {
      timers.delete(timer);
      run()
        .catch((error: unknown) => alerter.notify(`backup:${name}`, error))
        .finally(() => loop(name, run, delayMs));
    }, delayMs());
    timers.add(timer);
  };

  loop('pg-dump', jobs.runPgDump, () => msUntilNextUtc(times.pgDumpTimeUtc, new Date()));
  loop('ledger-export', jobs.runLedgerExport, () =>
    msUntilNextUtc(times.ledgerExportTimeUtc, new Date(), times.ledgerExportDowUtc));

  return {
    stop() {
      stopped = true;
      for (const timer of timers) clearTimeout(timer);
    },
  };
}
```

Run the schedule tests: PASS.

- [ ] **Step 3: Write the failing export tests, implement sinks and jobs**

`apps/server/test/ops/export-ledger.test.ts`:

```ts
import { gunzipSync } from 'node:zlib';
import type { Readable } from 'node:stream';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { evaluateEvent } from '@gisik-nokma/rule-engine';
import { createIngestService } from '../../src/ingest/ingest-service.js';
import { buildProjectionRegistry } from '../../src/projections/index.js';
import { exportLedger } from '../../src/ops/export-ledger.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { submittedWorkspaceCreated } from '../helpers/events.js';

class CaptureSink {
  puts: Array<{ key: string; bytes: Buffer; contentType: string }> = [];
  async put(key: string, body: Readable, contentType: string): Promise<void> {
    const chunks: Buffer[] = [];
    for await (const chunk of body) chunks.push(Buffer.from(chunk));
    this.puts.push({ key, bytes: Buffer.concat(chunks), contentType });
  }
}

let db: TestDatabase;
beforeAll(async () => {
  db = await createTestDatabase();
  const ingest = createIngestService({ pool: db.pool, evaluate: evaluateEvent, projections: buildProjectionRegistry() });
  await ingest.ingestBatch([submittedWorkspaceCreated(), submittedWorkspaceCreated(), submittedWorkspaceCreated()]);
});
afterAll(async () => {
  await db.drop();
});

describe('exportLedger — the source of truth, exported', () => {
  it('writes dated ndjson.gz holding every envelope in canonical order', async () => {
    const sink = new CaptureSink();
    const key = await exportLedger(db.pool, sink, () => new Date('2026-08-23T22:00:00.000Z'));
    expect(key).toBe('ledger/2026-08-23.ndjson.gz');
    expect(sink.puts[0].contentType).toBe('application/gzip');
    const lines = gunzipSync(sink.puts[0].bytes).toString('utf8').trimEnd().split('\n');
    expect(lines).toHaveLength(3);
    const envelopes = lines.map((line) => JSON.parse(line) as { seq: number; type: string });
    expect(envelopes.every((envelope) => envelope.type === 'workspace.created')).toBe(true);
  });

  it('is byte-deterministic — two exports of the same ledger are identical', async () => {
    const first = new CaptureSink();
    const second = new CaptureSink();
    await exportLedger(db.pool, first, () => new Date('2026-08-23T22:00:00.000Z'));
    await exportLedger(db.pool, second, () => new Date('2026-08-23T22:00:00.000Z'));
    expect(first.puts[0].bytes.equals(second.puts[0].bytes)).toBe(true);
  });
});
```

`apps/server/src/ops/object-sink.ts`:

```ts
import type { Readable } from 'node:stream';
import { S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';

export type ObjectSink = { put(key: string, body: Readable, contentType: string): Promise<void> };

/** S3 protocol only — MinIO in dev, DO Spaces BLR1 in production, R2 or S3
 * proper if object storage ever moves. No vendor name appears here; the
 * endpoint is env, which is what keeps that move a config change. */
export function s3SinkFromEnv(env: NodeJS.ProcessEnv, bucketVar: string): ObjectSink {
  const bucket = env[bucketVar];
  const accessKeyId = env.S3_ACCESS_KEY;
  const secretAccessKey = env.S3_SECRET_KEY;
  if (!bucket || !accessKeyId || !secretAccessKey) {
    throw new Error(`object storage needs ${bucketVar}, S3_ACCESS_KEY and S3_SECRET_KEY set`);
  }
  const client = new S3Client({
    endpoint: env.S3_ENDPOINT || undefined,
    region: env.S3_REGION ?? 'us-east-1',
    forcePathStyle: env.S3_FORCE_PATH_STYLE === 'true',
    credentials: { accessKeyId, secretAccessKey },
  });
  return {
    async put(key, body, contentType) {
      const upload = new Upload({ client, params: { Bucket: bucket, Key: key, Body: body, ContentType: contentType } });
      await upload.done();
    },
  };
}
```

`apps/server/src/ops/export-ledger.ts`:

```ts
import { Readable } from 'node:stream';
import { createGzip } from 'node:zlib';
import type { Pool } from 'pg';
import { readLedger } from '../ledger/event-store.js';
import type { ObjectSink } from './object-sink.js';

/**
 * THE LEDGER IS THE SOURCE OF TRUTH. Every projection is derived from it
 * and rebuildable from it — Plan 1's rebuild path and the verify-projections
 * gate prove that continuously. This weekly export is therefore the minimal
 * sufficient recovery artifact: gzipped ndjson, one envelope per line, in
 * the canonical replay order. The nightly pg_dump is the *convenient*
 * restore; this file is the *fundamental* one.
 */
export async function exportLedger(pool: Pool, sink: ObjectSink, now: () => Date): Promise<string> {
  const envelopes = await readLedger(pool);
  const key = `ledger/${now().toISOString().slice(0, 10)}.ndjson.gz`;
  const gzip = createGzip();
  const source = Readable.from((function* () {
    for (const envelope of envelopes) yield `${JSON.stringify(envelope)}\n`;
  })());
  await sink.put(key, source.pipe(gzip), 'application/gzip');
  return key;
}
```

`apps/server/src/ops/pg-dump.ts`:

```ts
import { spawn } from 'node:child_process';
import type { ObjectSink } from './object-sink.js';

/** Nightly full dump, custom format, streamed straight to object storage. */
export async function dumpDatabaseToSink(databaseUrl: string, sink: ObjectSink, now: () => Date): Promise<string> {
  const stamp = now().toISOString().slice(0, 16).replace(':', '-');
  const key = `pg/${stamp}.dump`;
  const child = spawn('pg_dump', ['--format=custom', '--no-owner', databaseUrl], { stdio: ['ignore', 'pipe', 'pipe'] });
  const stderr: Buffer[] = [];
  child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
  const uploaded = sink.put(key, child.stdout, 'application/octet-stream');
  const exitCode = await new Promise<number>((resolve, reject) => {
    child.on('error', reject);
    child.on('close', resolve);
  });
  if (exitCode !== 0) {
    throw new Error(`pg_dump exited ${exitCode}: ${Buffer.concat(stderr).toString('utf8').slice(-500)}`);
  }
  await uploaded;
  return key;
}
```

`apps/server/test/ops/pg-dump.test.ts`:

```ts
import { execSync } from 'node:child_process';
import type { Readable } from 'node:stream';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { dumpDatabaseToSink } from '../../src/ops/pg-dump.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';

function pgDumpAvailable(): boolean {
  try {
    execSync('pg_dump --version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

class CaptureSink {
  bytes = Buffer.alloc(0);
  key = '';
  async put(key: string, body: Readable): Promise<void> {
    this.key = key;
    const chunks: Buffer[] = [];
    for await (const chunk of body) chunks.push(Buffer.from(chunk));
    this.bytes = Buffer.concat(chunks);
  }
}

let db: TestDatabase;
beforeAll(async () => {
  db = await createTestDatabase();
});
afterAll(async () => {
  await db.drop();
});

describe.skipIf(!pgDumpAvailable())('dumpDatabaseToSink (needs pg_dump on PATH — CI installs it)', () => {
  it('streams a custom-format dump to a dated key', async () => {
    const sink = new CaptureSink();
    const key = await dumpDatabaseToSink(db.url, sink, () => new Date('2026-08-20T21:00:00.000Z'));
    expect(key).toBe('pg/2026-08-20T21-00.dump');
    expect(sink.bytes.subarray(0, 5).toString('latin1')).toBe('PGDMP');
  });

  it('planted defect: a bad database url fails loudly with pg_dump’s stderr', async () => {
    const sink = new CaptureSink();
    await expect(
      dumpDatabaseToSink('postgres://gisik:wrong@localhost:54329/no_such_db', sink, () => new Date()),
    ).rejects.toThrowError(/pg_dump exited/);
  });
});
```

Run: `pnpm --filter @gisik-nokma/server add @aws-sdk/client-s3 @aws-sdk/lib-storage`, then the three ops test files — PASS (pg-dump suite skips if the binary is absent locally; CI runs it — Task 14).

- [ ] **Step 4: The daemon main and the fetch helper**

`apps/server/src/ops/backup-daemon-main.ts`:

```ts
import { loadConfig } from '../config.js';
import { alerterFromConfig } from '../alerts/error-alerter.js';
import { dumpDatabaseToSink } from './pg-dump.js';
import { exportLedger } from './export-ledger.js';
import { s3SinkFromEnv } from './object-sink.js';
import { createPool } from '../db/pool.js';
import { startBackupDaemon } from './schedule.js';

async function main(): Promise<void> {
  const config = loadConfig(process.env);
  const alerter = alerterFromConfig(config.alertWebhookUrl);
  const sink = s3SinkFromEnv(process.env, 'BACKUP_S3_BUCKET');
  const pool = createPool(config.databaseUrl, { caCert: config.databaseCaCert });
  const jobs = {
    runPgDump: async () => {
      const key = await dumpDatabaseToSink(config.databaseUrl, sink, () => new Date());
      console.log(JSON.stringify({ msg: 'backup complete', key }));
    },
    runLedgerExport: async () => {
      const key = await exportLedger(pool, sink, () => new Date());
      console.log(JSON.stringify({ msg: 'ledger export complete', key }));
    },
  };

  if (process.argv.includes('--once')) {
    await jobs.runPgDump();
    await jobs.runLedgerExport();
    await pool.end();
    return;
  }
  startBackupDaemon(jobs, {
    pgDumpTimeUtc: process.env.BACKUP_TIME_UTC ?? '21:00',
    ledgerExportTimeUtc: process.env.LEDGER_EXPORT_TIME_UTC ?? '22:00',
    ledgerExportDowUtc: Number(process.env.LEDGER_EXPORT_DOW_UTC ?? '0'),
  }, alerter);
  console.log(JSON.stringify({ msg: 'backup daemon scheduled' }));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
```

`apps/server/src/ops/fetch-backup.ts` (for the restore path — download one object):

```ts
import { createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import type { Readable } from 'node:stream';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';

async function main(): Promise<void> {
  const [key, outFile] = process.argv.slice(2);
  if (!key || !outFile) {
    console.error('usage: node dist/ops/fetch-backup.js <object-key> <out-file>   (env: S3_*, BACKUP_S3_BUCKET)');
    process.exit(2);
  }
  const client = new S3Client({
    endpoint: process.env.S3_ENDPOINT || undefined,
    region: process.env.S3_REGION ?? 'us-east-1',
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
    credentials: { accessKeyId: process.env.S3_ACCESS_KEY ?? '', secretAccessKey: process.env.S3_SECRET_KEY ?? '' },
  });
  const object = await client.send(new GetObjectCommand({ Bucket: process.env.BACKUP_S3_BUCKET, Key: key }));
  await pipeline(object.Body as Readable, createWriteStream(outFile));
  console.log(`${key} -> ${outFile}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
```

Add scripts to `apps/server/package.json`: `"ops:backup-once": "node dist/ops/backup-daemon-main.js --once"`, `"ops:fetch-backup": "node dist/ops/fetch-backup.js"`.

- [ ] **Step 5: Smoke against the dev stack’s MinIO, commit**

```bash
docker compose -f docker-compose.dev.yml up -d
docker compose -f docker-compose.dev.yml exec server node dist/ops/backup-daemon-main.js --once
# Expected: {"msg":"backup complete","key":"pg/..."} then {"msg":"ledger export complete","key":"ledger/..."}
# Verify in the MinIO console (http://localhost:9001, gisik / gisik-dev-secret): bucket gisik-backups holds pg/ and ledger/ objects.
```

```bash
git add apps/server/src/ops/ apps/server/package.json pnpm-lock.yaml apps/server/test/ops/
git commit -m "feat(ops): nightly pg_dump and weekly ledger export to object storage, alerting on failure

The ledger is the source of truth — the weekly ndjson.gz export is the
minimal sufficient recovery artifact (byte-deterministic, canonical
order, proven); the nightly custom-format pg_dump is the convenient one.
One daemon schedules both in UTC, --once serves the runbook, and every
failure phones the error webhook because a silent backup failure is a lie
about being backed up."
```

### Task 12: The restore drill — restore into scratch, run the freshness gate, trust nothing else

**Files:**
- Create: `scripts/restore.sh`
- Test: `apps/server/test/ops/restore-drill.test.ts`

**Interfaces:**
- Consumes: Task 11's dump; `verifyProjections` + `buildProjectionRegistry` (Plan 1); `pg_restore`/`createdb` (CI + server image carry them); `TEST_DATABASE_ADMIN_URL` (Plan 1's convention, default `postgres://gisik:gisik@localhost:54329/postgres`).
- Produces:
  - `scripts/restore.sh <dump-file> <target-database-url> [--force-live]` — refuses a target whose database name does not contain `scratch`, `restore`, or `drill` unless `--force-live` (a real disaster is a deliberate act); prints the verify command to run next.
  - The automated drill: `restore-drill.test.ts` — dump a populated database, restore into a bare scratch database, run `verifyProjections`, expect **clean** — and the planted-drift variant proving the gate would catch a corrupted restore.

- [ ] **Step 1: Write `restore.sh`**

`scripts/restore.sh`:

```bash
#!/usr/bin/env bash
# Restore a pg_dump custom-format backup. The freshness gate is the
# acceptance test: a restore is not done until verify-projections is clean.
set -euo pipefail

usage() {
  echo "usage: scripts/restore.sh <dump-file> <target-database-url> [--force-live]" >&2
  echo "  fetch a dump first:  pnpm --filter @gisik-nokma/server run ops:fetch-backup -- pg/<stamp>.dump /tmp/restore.dump" >&2
  exit 2
}

[[ $# -lt 2 ]] && usage
DUMP_FILE="$1"
TARGET_URL="$2"
FORCE="${3:-}"

DB_NAME="${TARGET_URL##*/}"
DB_NAME="${DB_NAME%%\?*}"
if [[ ! "$DB_NAME" =~ (scratch|restore|drill) && "$FORCE" != "--force-live" ]]; then
  echo "refusing: target database '$DB_NAME' does not look like a scratch database." >&2
  echo "restore into a scratch database and verify first; pass --force-live only for a real disaster." >&2
  exit 1
fi

[[ -f "$DUMP_FILE" ]] || { echo "no such dump file: $DUMP_FILE" >&2; exit 1; }

pg_restore --no-owner --no-privileges --dbname "$TARGET_URL" "$DUMP_FILE"
echo "restored '$DUMP_FILE' into '$DB_NAME'."
echo "now prove it — the restore is not done until this is clean:"
echo "  DATABASE_URL='$TARGET_URL' pnpm --filter @gisik-nokma/server run verify:projections"
```

Run `chmod +x scripts/restore.sh`. Smoke the guard immediately:

```bash
scripts/restore.sh /nonexistent.dump postgres://gisik:gisik@localhost:54329/gisik_nokma; echo "exit: $?"
# Expected: "refusing: target database 'gisik_nokma' does not look like a scratch database." and exit: 1
```

- [ ] **Step 2: Write the failing drill test**

`apps/server/test/ops/restore-drill.test.ts`:

```ts
import { execSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { evaluateEvent } from '@gisik-nokma/rule-engine';
import { createIngestService } from '../../src/ingest/ingest-service.js';
import { buildProjectionRegistry } from '../../src/projections/index.js';
import { verifyProjections } from '../../src/verify/verify-projections.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { submittedWorkspaceCreated } from '../helpers/events.js';

const ADMIN_URL = process.env.TEST_DATABASE_ADMIN_URL ?? 'postgres://gisik:gisik@localhost:54329/postgres';

function binariesAvailable(): boolean {
  try {
    execSync('pg_dump --version && pg_restore --version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

describe.skipIf(!binariesAvailable())('the restore drill — disaster recovery through the freshness gate', () => {
  let source: TestDatabase;
  let scratchUrl: string;
  let scratchPool: Pool;
  let workDir: string;
  const scratchName = `gisik_drill_${Date.now()}`;

  beforeAll(async () => {
    source = await createTestDatabase();
    const ingest = createIngestService({
      pool: source.pool,
      evaluate: evaluateEvent,
      projections: buildProjectionRegistry(),
    });
    const results = await ingest.ingestBatch([
      submittedWorkspaceCreated(),
      submittedWorkspaceCreated(),
      submittedWorkspaceCreated(),
    ]);
    if (results.some((result) => result.status !== 'committed')) throw new Error('drill setup failed to seed');

    workDir = mkdtempSync(join(tmpdir(), 'gisik-drill-'));
    const dumpFile = join(workDir, 'drill.dump');
    const dump = spawnSync('pg_dump', ['--format=custom', '--no-owner', '--file', dumpFile, source.url]);
    if (dump.status !== 0) throw new Error(`pg_dump failed: ${dump.stderr.toString()}`);

    const admin = new Pool({ connectionString: ADMIN_URL });
    await admin.query(`CREATE DATABASE ${scratchName}`); // bare — the dump carries the schema
    await admin.end();
    scratchUrl = ADMIN_URL.replace(/\/[^/]*$/, `/${scratchName}`);

    const restore = spawnSync('pg_restore', ['--no-owner', '--no-privileges', '--dbname', scratchUrl, dumpFile]);
    if (restore.status !== 0) throw new Error(`pg_restore failed: ${restore.stderr.toString()}`);
    scratchPool = new Pool({ connectionString: scratchUrl });
  }, 60_000);

  afterAll(async () => {
    await scratchPool?.end();
    const admin = new Pool({ connectionString: ADMIN_URL });
    await admin.query(`DROP DATABASE IF EXISTS ${scratchName} WITH (FORCE)`);
    await admin.end();
    await source?.drop();
    rmSync(workDir, { recursive: true, force: true });
  }, 60_000);

  it('the restored database passes verify-projections clean — the gate applied to disaster recovery', async () => {
    const report = await verifyProjections({ pool: scratchPool, projections: buildProjectionRegistry() });
    expect(report.diffs).toEqual([]);
    expect(report.clean).toBe(true);
  });

  it('the restored ledger kept its append-only teeth', async () => {
    await expect(scratchPool.query("UPDATE events SET type = 'tampered'")).rejects.toThrowError(/append-only/);
  });

  it('planted defect: drift in a restored projection is caught, table named', async () => {
    await scratchPool.query("UPDATE proj_entity_heads SET head_event_type = 'tampered'");
    const report = await verifyProjections({ pool: scratchPool, projections: buildProjectionRegistry() });
    expect(report.clean).toBe(false);
    expect(report.diffs.map((diff) => diff.table)).toContain('proj_entity_heads');
  });
});
```

Run: `pnpm --filter @gisik-nokma/server exec vitest run test/ops/restore-drill.test.ts`
Expected: PASS locally (with pg client tools installed; the compose Postgres publishes 54329) — and in CI unconditionally (Task 14 installs the tools). If it skips locally, say so in the PR rather than shrugging: `brew install libpq` / `apt-get install postgresql-client-16` puts the binaries on PATH.

- [ ] **Step 3: Commit**

```bash
git add scripts/restore.sh apps/server/test/ops/restore-drill.test.ts
git commit -m "feat(ops): restore script with a scratch-database guard, and the drill that proves it

restore.sh refuses non-scratch targets unless --force-live — a real
disaster is a deliberate act. The automated drill dumps a populated
database, restores into bare scratch, and accepts the restore only when
verify-projections is clean; the planted-drift variant proves the gate
would catch a corrupted restore, and the restored ledger still refuses
UPDATEs. Backups you have not restored are Schrödinger's backups; this
test opens the box on every CI run."
```

### Task 13: Deployed-stack E2E smoke — Playwright against the compose stack

**Files:**
- Create: `e2e/package.json`, `e2e/playwright.config.ts`, `e2e/global-setup.ts`, `e2e/helpers/mailpit.ts`, `e2e/helpers/sign-in.ts`, `e2e/tests/smoke.spec.ts`, `e2e/tests/visibility.spec.ts`
- Modify: root `package.json` (script `test:e2e`), `pnpm-workspace.yaml` only if its globs do not already cover a root-level `e2e/` folder (add `- 'e2e'`)

**Interfaces:**
- Consumes: the running compose stack (Task 6), the seed CLI (Task 9), Mailpit's HTTP API (`GET /api/v1/search`, `GET /api/v1/message/:id` on :8025), the data-testid contract (prose section above), better-auth's magic-link endpoints (`POST /api/auth/sign-in/magic-link` — verify the exact path against Plan 4 as landed; it is isolated in `global-setup.ts` and `helpers/sign-in.ts` only).
- Produces: `pnpm run test:e2e` — assumes the stack is up; signs in the owner and accountant (creating the users), runs the CC seed via `docker compose exec`, then drives: create ticket → guarded transition refused with a named reason → comment satisfies → board reflects; and the restricted-visibility read test.

- [ ] **Step 1: Scaffold the package**

`e2e/package.json`:

```json
{
  "name": "@gisik-nokma/e2e",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "playwright test"
  },
  "devDependencies": {
    "@playwright/test": "^1.49.0"
  }
}
```

Check `pnpm-workspace.yaml` covers `e2e` (add `- 'e2e'` to `packages:` if the globs are only `packages/*` and `apps/*`). Run `pnpm install`, then `pnpm --filter @gisik-nokma/e2e exec playwright install chromium`. Root `package.json` scripts gain `"test:e2e": "pnpm --filter @gisik-nokma/e2e run test"`.

`e2e/playwright.config.ts`:

```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  globalSetup: './global-setup.ts',
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: 'http://localhost:3001',
    trace: 'on-first-retry',
  },
});
```

- [ ] **Step 2: Write the helpers**

`e2e/helpers/mailpit.ts`:

```ts
const MAILPIT = 'http://localhost:8025';

type SearchResult = { messages: Array<{ ID: string }> };
type Message = { Text: string; HTML: string };

/** Poll Mailpit for the newest message to an address and pull the first
 * link out of it — the test inbox half of the magic-link flow. */
export async function fetchMagicLink(email: string, timeoutMs = 15_000): Promise<string> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const search = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`);
    const result = (await search.json()) as SearchResult;
    if (result.messages.length > 0) {
      const message = await fetch(`${MAILPIT}/api/v1/message/${result.messages[0].ID}`);
      const body = (await message.json()) as Message;
      const match = body.Text.match(/https?:\/\/[^\s]+/);
      if (match) return match[0];
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`no magic-link mail arrived for ${email} within ${timeoutMs}ms — is SMTP_URL pointing at Mailpit?`);
}
```

`e2e/helpers/sign-in.ts`:

```ts
import type { Page } from '@playwright/test';
import { fetchMagicLink } from './mailpit.js';

/** Sign in through the real UI: email in, magic link out of the test
 * inbox, link followed. Ends on an authenticated app. */
export async function signIn(page: Page, email: string): Promise<void> {
  await page.goto('/');
  await page.getByTestId('auth-email-input').fill(email);
  await page.getByTestId('auth-magic-link-submit').click();
  const link = await fetchMagicLink(email);
  await page.goto(link);
  await page.waitForURL((url) => !url.pathname.includes('auth'), { timeout: 15_000 });
}

export const OWNER_EMAIL = 'kiro@e2e.gisik-nokma.local';
export const ACCOUNTANT_EMAIL = 'accountant@e2e.gisik-nokma.local';
```

`e2e/global-setup.ts` (creates the users via the auth API, then seeds — order matters: people first, because people are never invented):

```ts
import { execSync } from 'node:child_process';
import { ACCOUNTANT_EMAIL, OWNER_EMAIL } from './helpers/sign-in.js';
import { fetchMagicLink } from './helpers/mailpit.js';

const API = 'http://localhost:3000';

async function createUser(email: string): Promise<void> {
  // better-auth magic-link plugin: request + verify creates the user.
  // If Plan 4 mounted different paths, this helper is the only place to fix.
  const requested = await fetch(`${API}/api/auth/sign-in/magic-link`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  if (!requested.ok) throw new Error(`magic-link request for ${email} answered ${requested.status}`);
  const link = await fetchMagicLink(email);
  const verified = await fetch(link, { redirect: 'manual' });
  if (verified.status >= 500) throw new Error(`magic-link verify for ${email} answered ${verified.status}`);
}

export default async function globalSetup(): Promise<void> {
  await createUser(OWNER_EMAIL);
  await createUser(ACCOUNTANT_EMAIL);
  execSync(
    'docker compose -f docker-compose.dev.yml exec -T ' +
      `-e SEED_OWNER_EMAIL=${OWNER_EMAIL} -e SEED_ACCOUNTANT_EMAIL=${ACCOUNTANT_EMAIL} ` +
      'server node dist/seed/cli-seed-convenience-corner.js',
    { stdio: 'inherit', cwd: new URL('..', import.meta.url).pathname },
  );
}
```

- [ ] **Step 3: Write the smoke spec**

`e2e/tests/smoke.spec.ts`:

```ts
import { expect, test } from '@playwright/test';
import { OWNER_EMAIL, signIn } from '../helpers/sign-in.js';

test('sign in → create → refused without a comment, reason named → comment satisfies → board reflects', async ({ page }) => {
  await signIn(page, OWNER_EMAIL);

  // Into the seeded workspace and project.
  await page.getByText('Convenience Corner').click();
  await page.getByText('Shop operations').click();
  await expect(page.getByTestId(/board-column-/).first()).toBeVisible();

  // Create a ticket.
  const title = `E2E smoke errand ${Date.now()}`;
  await page.getByTestId('ticket-create-button').click();
  await page.getByTestId('ticket-title-input').fill(title);
  await page.getByTestId('ticket-create-submit').click();
  await expect(page.getByText(title)).toBeVisible();

  // Try to close it bare — the require-comment rule on the door into Done.
  await page.getByText(title).click();
  await page.getByTestId('transition-option-done').click();
  await expect(page.getByTestId('transition-refusal')).toBeVisible();
  const reason = await page.getByTestId('transition-refusal-reason').textContent();
  expect(reason?.trim().length).toBeGreaterThan(0); // the reason is named, never a bare rejection

  // Satisfy the rule.
  await page.getByTestId('transition-comment-input').fill('Closed from the E2E smoke — the workflow asked why, and this is why.');
  await page.getByTestId('transition-confirm').click();

  // The board reflects the accepted claim.
  await page.reload();
  await expect(page.getByTestId('board-column-done').getByText(title)).toBeVisible();
});
```

- [ ] **Step 4: Write the visibility spec**

`e2e/tests/visibility.spec.ts`:

```ts
import { expect, test } from '@playwright/test';
import { ACCOUNTANT_EMAIL, OWNER_EMAIL, signIn } from '../helpers/sign-in.js';

test('the guest sees exactly what is shared — and a direct probe of anything else is not found', async ({ browser }) => {
  // The owner locates a ticket the accountant is NOT on.
  const ownerContext = await browser.newContext();
  const ownerPage = await ownerContext.newPage();
  await signIn(ownerPage, OWNER_EMAIL);
  await ownerPage.getByText('Convenience Corner').click();
  await ownerPage.getByText('Shop operations').click();
  await ownerPage.getByText('D-U-N-S number').click();
  const restrictedUrl = ownerPage.url();
  await ownerContext.close();

  // The accountant sees the four shared tickets and nothing else.
  const guestContext = await browser.newContext();
  const guestPage = await guestContext.newPage();
  await signIn(guestPage, ACCOUNTANT_EMAIL);
  await guestPage.getByText('Convenience Corner').click();
  await expect(guestPage.getByText('HSN digit count')).toBeVisible();
  await expect(guestPage.getByText('D-U-N-S number')).toHaveCount(0);

  // A direct probe of the unshared ticket's URL: invisible and nonexistent
  // are indistinguishable (Plan 4's read enforcement, seen from the browser).
  await guestPage.goto(restrictedUrl);
  await expect(guestPage.getByTestId('not-found')).toBeVisible();
  await guestContext.close();
});
```

- [ ] **Step 5: Run against the stack**

```bash
docker compose -f docker-compose.dev.yml up -d --build
pnpm run test:e2e
```

Expected: both specs PASS. Where a selector misses because Plan 6 landed different testids or navigation, fix the **helper or the testid contract via coordination** (Open questions #5) — the flow assertions themselves (refusal visible, reason non-empty, board reflects, guest blindness, not-found probe) are the spec and do not weaken.

- [ ] **Step 6: Commit**

```bash
git add e2e/ package.json pnpm-workspace.yaml pnpm-lock.yaml
git commit -m "feat(e2e): deployed-stack smoke — magic link via test inbox, a refusal with its reason, a guest who sees only what is shared

Playwright drives the real compose stack end to end: sign-in lands
through Mailpit, the seeded errand board is real, closing without a
comment is refused with the reason named on screen, the comment satisfies
the rule, and the board reflects it. The guest test proves restricted
reads from the outside: four shared tickets visible, everything else
indistinguishable from nonexistent."
```

### Task 14: CI pipeline and release discipline — the gate order, restated and enforced

**Files:**
- Create: `.github/workflows/ci.yml`
- Modify: root `package.json` (scripts `test:fixtures`, `test:dual-client`)

**Interfaces:**
- Consumes: Plan 1's root turbo scripts (`lint`, `typecheck`, `test` — verify the exact names in the root `package.json` as landed; if the scaffold named them differently, use those names in the workflow rather than adding aliases), the shared fixture suite (`packages/rule-engine/src/fixtures.test.ts`, Plans 2–3), Plan 10's dual-client harness, Tasks 6/13.
- Produces:
  - `.github/workflows/ci.yml` — the pinned order: **lint → typecheck → unit → fixtures (shared, client/server) → dual-client harness → E2E**. Unit runs against a real Postgres service on 54329 with pg client tools installed, so the restore drill runs unconditionally in CI.
  - Root scripts: `"test:fixtures"` (runs the shared fixture suite in the server-side build AND the client-side build — the two-builds-one-suite guarantee of spec §7), `"test:dual-client"` (Plan 10's harness).
  - Release discipline (restated from the spec, enforced procedurally — see Step 4): one PR per change, branched off `main`, merged only with explicit approval; CI green required. `main` is **not** server-side protected and will not be; the rule lives in the repo's `CLAUDE.md` because the server will not enforce it.
  - Versioning: the **root `package.json` version is the product version** (single version for server and clients — one monorepo, one build, per the spec's single-build delivery). Patch bumps for fixes, minor bumps at plan-series milestones, `v<version>` git tag on `main` after merge; the server reports it at `/healthz` (Task 1); event schema versions are separate and live in the envelope's `version` field, unaffected by product versioning.

- [ ] **Step 1: Add the root aggregate scripts**

In root `package.json` scripts:

```json
"test:fixtures": "pnpm --filter @gisik-nokma/rule-engine exec vitest run src/fixtures.test.ts && pnpm --filter @gisik-nokma/app-core exec vitest run --project fixtures",
"test:dual-client": "pnpm --filter @gisik-nokma/sync-harness run test"
```

**Executor note (not optional):** the first half of `test:fixtures` is Plan 2/3's suite and is exact. The second half and `test:dual-client` name Plans 6/10's artifacts as pinned in Open questions #7 — open those packages as landed, confirm the package names and the fixture-runner invocation, and correct these two lines to the real commands in this same commit. What must stay true: the fixture suite runs in **both** builds, and the dual-client harness runs — the spec's testing discipline, not this plan's preference.

- [ ] **Step 2: Write the workflow**

`.github/workflows/ci.yml`:

```yaml
name: ci
on:
  pull_request:
  push:
    branches: [main]

concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm run lint
      - run: pnpm run check:env

  typecheck:
    needs: lint
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm run typecheck

  unit:
    needs: typecheck
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: gisik
          POSTGRES_PASSWORD: gisik
          POSTGRES_DB: gisik_nokma
        ports: ["54329:5432"]
        options: >-
          --health-cmd "pg_isready -U gisik" --health-interval 2s
          --health-timeout 3s --health-retries 20
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - name: Install pg client tools (the restore drill runs here, always)
        run: sudo apt-get update && sudo apt-get install -y postgresql-client-16
      - run: pnpm install --frozen-lockfile
      - run: pnpm run build
      - run: pnpm run test
        env:
          TEST_DATABASE_ADMIN_URL: postgres://gisik:gisik@localhost:54329/postgres

  fixtures:
    needs: unit
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm run build
      - name: Shared fixture suite — client and server builds can never quietly disagree
        run: pnpm run test:fixtures

  dual-client:
    needs: fixtures
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm run build
      - name: Dual-client sync harness (Plan 10)
        run: pnpm run test:dual-client

  e2e:
    needs: dual-client
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @gisik-nokma/e2e exec playwright install --with-deps chromium
      - name: Bring up the deployed stack
        run: docker compose -f docker-compose.dev.yml up -d --build
      - name: Wait for health
        run: |
          for i in $(seq 1 60); do
            curl -sf http://localhost:3000/healthz && exit 0 || sleep 2
          done
          docker compose -f docker-compose.dev.yml logs server
          exit 1
      - run: pnpm run test:e2e
      - name: Stack logs on failure
        if: failure()
        run: docker compose -f docker-compose.dev.yml logs
```

(If Plan 1's root scripts are named other than `lint`/`typecheck`/`test`, use the landed names in the `run:` lines — do not add alias scripts just to satisfy this file.)

- [ ] **Step 3: Push a branch and watch the pipeline**

```bash
git add .github/workflows/ci.yml package.json
git commit -m "feat(ci): the gate order — lint, typecheck, unit, shared fixtures, dual-client, E2E

Six jobs in strict sequence, each earning the next. Unit runs against a
real Postgres with pg client tools installed so the restore drill opens
its box on every run; the fixture job runs the one shared suite in both
builds; E2E drives the same compose stack a developer runs. Merge
discipline stays what the spec inherited: one PR per change, off main,
merged only with explicit approval, CI green required."
git push -u origin HEAD
gh run watch
```

Expected: all six jobs green on the PR.

- [ ] **Step 4: Confirm the release rule is written where it is actually read**

**Settled (owner sign-off 2026-08-20): `main` stays unprotected.** This is a free-plan private repo — same as convenience-corner — and a free-plan private repo cannot enforce server-side branch protection. The base project hit the same wall and its record is now a seeded ticket (`ops:owner-github-plan`). The owner declined both escapes (GitHub Pro, going public) and chose the procedural control instead. Do not plan a plan upgrade.

The control, stated plainly: **never commit or push to `main` directly. Branch, open a PR, merge only on explicit approval, with CI green.** That rule lives in the repo's `CLAUDE.md`, not in a GitHub setting, precisely because the server will not enforce it — a rule nobody reads is not a control, and `CLAUDE.md` is read at the start of every session by every person and every agent that touches this repo.

Verify (do not skip — an unenforced rule is only as good as its being written down):

```bash
grep -n "main" CLAUDE.md
```

Expected: the standing instruction is present and names `main` explicitly. If it is missing, add it before merging this task's PR — the plan's release discipline has no other enforcement point.

### Task 15: The DigitalOcean spec — provider-specific, quarantined in deploy/

**✅ GATE LIFTED (owner sign-off 2026-08-20).** The provider (DigitalOcean App Platform + Managed PostgreSQL + Spaces, all BLR1 — convenience-corner's stack) and the domain (`pm.artsourced.in`) are both decided; Open questions #1, #2 and #3 are settled. This task executes with the rest of the plan. Everything else here stays provider-neutral regardless, which is what keeps the recorded alternatives cheap.

**Files:**
- Create: `deploy/do/app.yaml`, `deploy/do/README.md`

**Interfaces:**
- Consumes: Task 5's Dockerfiles, Task 6's env contract, Task 11's worker entry.
- Produces: the App Platform spec (server + web + backup worker, BLR1, managed Postgres attached, Spaces BLR1 for attachments and backups, secrets as encrypted env vars, health-checked), and the provisioning commands. **Hosts:** the web app at `pm.artsourced.in` and the API at `api.pm.artsourced.in` — one decided name, split into the two hosts the ingress rules need, with the API nested under the product host so a single DNS zone and a single mental model cover both. TLS: App Platform provisions and renews Let's Encrypt certificates on both automatically; DNS is two CNAMEs in the existing `artsourced.in` zone (`pm` and `api.pm`). Secrets: `type: SECRET` env vars, encrypted at rest, rotated via `doctl apps update` (runbook). Database TLS: `${db.DATABASE_URL}` carries `sslmode=require` and `${db.CA_CERT}` feeds `DATABASE_CA_CERT` (Task 1's pool option).

- [ ] **Step 1: Write `deploy/do/app.yaml`**

```yaml
# DigitalOcean App Platform spec — the ONLY file that knows the provider.
# Region: blr (Bengaluru) — the audience constraint is India-reachable,
# phone-first; the region is the point, not a default. Spaces is BLR1 for
# the same reason: user uploads stay in India, beside the ledger.
# DOMAINS: decided 2026-08-20 — pm.artsourced.in serves the web app and
# api.pm.artsourced.in serves the API, both in the artsourced.in zone.
name: gisik-nokma
region: blr

databases:
  - name: db
    engine: PG
    version: "16"
    production: true
    cluster_name: gisik-nokma-db

services:
  - name: server
    dockerfile_path: apps/server/Dockerfile
    source_dir: /
    github:
      repo: bkirosangma/gisik-nokma
      branch: main
      deploy_on_push: true
    http_port: 3000
    instance_size_slug: professional-xs
    instance_count: 1
    health_check:
      http_path: /healthz
      initial_delay_seconds: 20
    envs:
      - key: DATABASE_URL
        value: ${db.DATABASE_URL}
        scope: RUN_TIME
      - key: DATABASE_CA_CERT
        value: ${db.CA_CERT}
        scope: RUN_TIME
      - key: HOST
        value: "0.0.0.0"
      - key: TRUST_PROXY
        value: "true"
      - key: WEB_ORIGIN
        value: https://pm.artsourced.in
      - key: BETTER_AUTH_URL
        value: https://api.pm.artsourced.in
      - key: BETTER_AUTH_SECRET
        type: SECRET
      - key: SMTP_URL
        type: SECRET
      - key: MAGIC_LINK_FROM
        value: sign-in@artsourced.in
      - key: ALERT_WEBHOOK_URL
        type: SECRET
      - key: S3_ENDPOINT
        value: https://blr1.digitaloceanspaces.com
      - key: S3_REGION
        value: blr1
      - key: S3_BUCKET
        value: gisik-nokma-attachments
      - key: S3_FORCE_PATH_STYLE
        value: "false"
      - key: S3_ACCESS_KEY
        type: SECRET
      - key: S3_SECRET_KEY
        type: SECRET
      - key: BACKUP_S3_BUCKET
        value: gisik-nokma-backups
      - key: RATE_LIMIT_AUTH_MAX
        value: "10"
      - key: RATE_LIMIT_EVENTS_MAX
        value: "120"
      - key: RATE_LIMIT_WINDOW_SEC
        value: "60"

  - name: web
    dockerfile_path: apps/web/Dockerfile
    source_dir: /
    github:
      repo: bkirosangma/gisik-nokma
      branch: main
      deploy_on_push: true
    http_port: 3000
    instance_size_slug: basic-xs
    instance_count: 1

workers:
  - name: backup
    dockerfile_path: apps/server/Dockerfile
    source_dir: /
    github:
      repo: bkirosangma/gisik-nokma
      branch: main
      deploy_on_push: true
    run_command: node dist/ops/backup-daemon-main.js
    instance_size_slug: basic-xxs
    instance_count: 1
    envs:
      - key: DATABASE_URL
        value: ${db.DATABASE_URL}
        scope: RUN_TIME
      - key: DATABASE_CA_CERT
        value: ${db.CA_CERT}
        scope: RUN_TIME
      - key: ALERT_WEBHOOK_URL
        type: SECRET
      - key: S3_ENDPOINT
        value: https://blr1.digitaloceanspaces.com
      - key: S3_REGION
        value: blr1
      - key: S3_FORCE_PATH_STYLE
        value: "false"
      - key: S3_ACCESS_KEY
        type: SECRET
      - key: S3_SECRET_KEY
        type: SECRET
      - key: BACKUP_S3_BUCKET
        value: gisik-nokma-backups
      - key: BACKUP_TIME_UTC
        value: "21:00"
      - key: LEDGER_EXPORT_TIME_UTC
        value: "22:00"
      - key: LEDGER_EXPORT_DOW_UTC
        value: "0"

domains:
  - domain: pm.artsourced.in
    type: PRIMARY
    zone: artsourced.in
  - domain: api.pm.artsourced.in
    type: ALIAS
    zone: artsourced.in

ingress:
  rules:
    - match:
        authority:
          exact: api.pm.artsourced.in
      component:
        name: server
    - match:
        authority:
          exact: pm.artsourced.in
      component:
        name: web
```

The web build args are now concrete and go in the spec rather than waiting on a decision — add them under `web.envs` with `scope: BUILD_TIME`: `NEXT_PUBLIC_API_URL=https://api.pm.artsourced.in` and `NEXT_PUBLIC_WS_URL=wss://api.pm.artsourced.in/v1/stream`. (They are build-time because Next.js inlines `NEXT_PUBLIC_*` at build; changing a host means a rebuild, not a restart.)

- [ ] **Step 2: Write `deploy/do/README.md` — provisioning, once**

```markdown
# Provisioning (DigitalOcean, BLR1) — run once

Provider and domain were signed off on 2026-08-20: DigitalOcean App
Platform + Managed PostgreSQL + Spaces, all BLR1 (convenience-corner's
stack), serving `pm.artsourced.in`.

1. `doctl auth init` with the team token.
2. Spaces, region **BLR1**: create buckets `gisik-nokma-attachments` and
   `gisik-nokma-backups` (both private), generate a Spaces key pair.
   Spaces **Standard Storage is available in BLR1** — confirmed, no
   fallback region needed. Spaces **Cold Storage is not** available there;
   backups therefore stay on Standard, which is what the backup design
   assumes (nightly dumps and weekly ledger exports are read back during
   the monthly restore drill, so a cold tier would be the wrong shape
   anyway — it optimises for never reading, and we read on purpose).
3. Nothing to substitute in `app.yaml` — the hosts and the two `BUILD_TIME`
   envs on `web` (`NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_WS_URL`) are already
   the real values.
4. `doctl apps create --spec deploy/do/app.yaml` — then paste the SECRET
   values in the dashboard (they are never committed).
5. DNS, in the existing `artsourced.in` zone: CNAME `pm` and `api.pm` to
   the app's default hostname. Both are subdomains, so no apex/ALIAS
   handling is needed and the zone's existing records are untouched. TLS
   issues automatically for both once DNS resolves.
6. Uptime: create a check on `https://api.pm.artsourced.in/healthz` from
   the nearest probe region, alerting the owner's email.
7. First deploy runs migrations on boot (the entrypoint). Then, from a
   checkout with DATABASE_URL pointed at the managed DB: sign in once in
   the product, run `seed:cc` (per the runbook), then `seed:dev`.
```

- [ ] **Step 3: Validate and commit**

```bash
doctl apps spec validate deploy/do/app.yaml   # if doctl is available; otherwise proceed — CI cannot validate a provider spec offline
git add deploy/do/
git commit -m "feat(deploy): DigitalOcean BLR1 App Platform spec, quarantined in deploy/do

Server, web and the backup worker in blr; managed Postgres attached with
its CA fed to the pool; Spaces BLR1 for attachments and backups, chosen
over Cloudflare R2 because permission-gated user uploads should sit in a
jurisdiction we can name; secrets as encrypted env vars; TLS and the two
CNAMEs under pm.artsourced.in. The provider's name appears nowhere
outside this directory, so both the AWS-Mumbai alternative and a later
move to R2 stay contained swaps."
```

### Task 16: Runbook, Features.md §13, test-cases/13 — and the whole-stack final smoke

**Files:**
- Create: `docs/runbook.md`, `test-cases/13-deployment-dogfooding.md`
- Modify: `Features.md` (append §13)

**Interfaces:**
- Consumes: everything above.
- Produces: the operational runbook; Features.md §13; test-cases 13.1–13.22. **Note:** the workspace convention routes runbooks to `/kb`; this repo keeps implementation docs in-repo. That tension is FLAGGED for the owner (Open questions #10), not resolved here — the runbook lands in-repo per this repo's own convention (`docs/`), and moves later if the owner rules otherwise.

- [ ] **Step 1: Write `docs/runbook.md`**

```markdown
# Runbook — Gisik Nokma

The ledger is the source of truth; projections are derived and rebuildable.
Every procedure below leans on that: restores are verified by rebuild-and-
diff, never by eyeballing.

## Deploy (routine)
Merge to `main` with approval → App Platform builds and deploys
(`deploy_on_push`). Migrations run on container boot (entrypoint) before
the server listens. Watch: `doctl apps logs <app-id> server --follow`;
confirm `GET /healthz` reports the new version.

## Deploy (first time)
`deploy/do/README.md`. The stack is DigitalOcean App Platform + Managed
PostgreSQL + Spaces, all BLR1 (signed off 2026-08-20), serving
`pm.artsourced.in` with the API at `api.pm.artsourced.in`.

## Rotate secrets
- `BETTER_AUTH_SECRET`, `SMTP_URL`, `ALERT_WEBHOOK_URL`, `S3_ACCESS_KEY`/
  `S3_SECRET_KEY`: update the SECRET env in the App Platform dashboard (or
  `doctl apps update --spec`), redeploy. Auth secret rotation invalidates
  sessions — announce first.
- Database password: rotate in the managed-DB control panel; the injected
  `${db.DATABASE_URL}` follows automatically on redeploy.
- Spaces keys: create the new pair, update SECRETs, verify a `--once`
  backup succeeds, then revoke the old pair.

## Backups
Nightly pg_dump (21:00 UTC = 02:30 IST) and weekly Sunday ledger export
(22:00 UTC), both to the `gisik-nokma-backups` Spaces bucket in BLR1
(Standard storage — Cold is not offered in BLR1, and these objects are
read back on every restore drill anyway), both alerting the webhook on
failure. Manual run: `pnpm --filter @gisik-nokma/server run ops:backup-once`
(or `node dist/ops/backup-daemon-main.js --once` in the container). The
managed database's own daily backups are a second string, not the plan.

## Restore drill (monthly, and after any schema change)
1. `pnpm --filter @gisik-nokma/server run ops:fetch-backup -- pg/<latest>.dump /tmp/drill.dump`
2. `createdb -h <host> gisik_drill_$(date +%Y%m%d)` (any scratch name
   containing `drill`)
3. `scripts/restore.sh /tmp/drill.dump '<scratch database url>'`
4. `DATABASE_URL='<scratch url>' pnpm --filter @gisik-nokma/server run verify:projections`
   — the drill passes only on the clean line and exit 0.
5. Drop the scratch database. Record the drill — date, dump key, verdict —
   as a ticket in the Gisik Nokma workspace (the product keeps its own
   operational memory; that is the point of it).

## Seeding production
People are never invented: the owner signs in once first. Then, from a
checkout with `DATABASE_URL` pointed at production:
`pnpm --filter @gisik-nokma/server run seed:cc -- --owner-email <email> --allow-missing-guest`
Re-run with `--accountant-email` once the accountant has signed in — the
seed is idempotent; the second run adds only the guest surface.
`seed:dev` the same way (it reads `docs/superpowers/plans/` from the
checkout).

## Incident basics
- Is it up? `curl https://api.pm.artsourced.in/healthz` — version tells you
  what is running. The uptime check emails before users do.
- Logs: `doctl apps logs <app-id> server --follow` (JSON lines; `err`
  carries stacks). 5xx bursts also hit the alert webhook.
- 429 storms: a client in a retry loop — raise `RATE_LIMIT_*` only with a
  reason; the values are load-bearing on the auth endpoints.
- Database down: App Platform restarts the server on health failure;
  managed PG failover is the provider's job. After ANY restore: the drill
  procedure, no exceptions — an unverified restore is not a recovery.
- Refusal spikes (`refused` results): not an incident — that is the
  product working. Look for a client bug only if the same actor repeats
  the same refusal rapidly.
```

- [ ] **Step 2: Append `Features.md` §13**

Append to `Features.md` (following the numbering: Plans 1–10 own §3–§12):

```markdown
## 13. Deployment & dogfooding

- ✅ One-command dev stack — `docker compose -f docker-compose.dev.yml up -d --build`: Postgres, MinIO (buckets created), Mailpit, migrated server, web. `docker-compose.dev.yml`
- ⚙️ Migrations on boot — the server container applies migrations before listening. `apps/server/docker-entrypoint.sh`
- ⚙️ Env contract — `.env.example` documents every config var; `scripts/check-env-example.mjs` fails CI on undocumented reads.
- ✅ Rate limiting — `/api/auth/*` 10/min per IP, event doors 120/min, config-tunable, 429 `rate_limited` with retry-after. `apps/server/src/http/rate-limit.ts`
- ✅ CORS for the configured web origin. `apps/server/src/app.ts`
- ⚙️ Error alerting — 5xx and backup failures POST to any Slack-compatible webhook (`ALERT_WEBHOOK_URL`); noop when unset. `apps/server/src/alerts/error-alerter.ts`
- ✅ SMTP magic-link delivery when `SMTP_URL` is set (Mailpit in dev); phone OTP stays disabled until a DLT registration exists. `apps/server/src/auth/smtp-magic-link-sender.ts`
- ✅ Convenience Corner seed — the shop's 23 real errands from the frozen tracker snapshot, statuses mapped, dates only where the record dates, accountant as guest with explicit visibility; idempotent. `apps/server/src/seed/seed-convenience-corner.ts`
- ✅ Gisik Nokma dev seed — one epic per plan, one ticket per task, titles verbatim, nothing dated, nothing transitioned; idempotent. `apps/server/src/seed/seed-dev-workspace.ts`
- ⚙️ Backups — nightly pg_dump and weekly ledger export (the ledger is the source of truth) to S3-compatible storage — Spaces BLR1 in production, MinIO locally — with a failure-alerting daemon. `apps/server/src/ops/`
- ⚙️ Restore path — `scripts/restore.sh` (scratch-guarded) + the automated restore drill: restore into scratch, `verify-projections` must be clean. `apps/server/test/ops/restore-drill.test.ts`
- ✅ Deployed-stack E2E smoke — magic link via test inbox, refusal with named reason, comment satisfies, board reflects; guest visibility probe. `e2e/`
- ⚙️ CI pipeline — lint → typecheck → unit → shared fixtures (both builds) → dual-client harness → E2E. `.github/workflows/ci.yml`
- ⚙️ Production deployment — DigitalOcean App Platform + Managed PostgreSQL + Spaces, all BLR1, serving `pm.artsourced.in` (API at `api.pm.artsourced.in`); the spec is quarantined in `deploy/do/` so the provider's name appears nowhere in application code; runbook in `docs/runbook.md`.
```

- [ ] **Step 3: Write `test-cases/13-deployment-dogfooding.md`**

```markdown
# 13. Deployment & dogfooding

Statuses: ✅ automated and passing · 🟡 partially automated (manual step
in the loop) · 🧪 verified manually at deploy time · ❌ not yet covered ·
🚫 out of scope (reason given). Test names cite case ids.

- 13.1 ✅ `docker compose -f docker-compose.dev.yml up -d --build` yields a healthy stack: server /healthz 200 with version, web 200, Mailpit API answering, MinIO buckets present. (CI e2e job brings the stack up this way on every run.)
- 13.2 ✅ Migrations run on container boot before the server listens. (Implicit in 13.1 — a healthy server proves applied migrations; entrypoint logs show the run.)
- 13.3 ✅ Every config var read by code is documented in .env.example; a planted undocumented read fails the check naming it. `scripts/check-env-example.mjs`, proven in Task 6 Step 4.
- 13.4 ✅ The request over the auth rate limit is refused 429 `rate_limited` with retry-after. `test/http/security-middleware.test.ts`
- 13.5 ✅ POST /v1/events over its budget is refused 429 on an independent budget. `test/http/security-middleware.test.ts`
- 13.6 ✅ Without the security option nothing is limited — earlier suites keep their throughput. `test/http/security-middleware.test.ts`
- 13.7 ✅ Preflight from the configured web origin is allowed; a foreign origin gets no allow header. `test/http/security-middleware.test.ts`
- 13.8 ✅ A 5xx is answered as bare internal_error (nothing leaked), logged with stack, and alerted; a dead webhook never breaks the caller; sub-500 behavior unchanged. `test/alerts/error-alerter.test.ts`
- 13.9 ✅ The SMTP sender mails the link to the address from the configured sender. `test/auth/smtp-magic-link-sender.test.ts`
- 13.10 ✅ CC seed: 23 errands from the frozen snapshot's two operational epics; statuses land per the mapping table (duns→next, hsn-digits→in-progress, apple-developer→waiting). `test/seed/cc-board.test.ts`, `test/seed/seed-cc.test.ts`
- 13.11 ✅ Nothing invented — planted defects: no origin date ⇒ no startDate claim (incl. the record's own ops:duns, attention-dated only); no needed_week ⇒ no dueDate claim; `done` and unknown states refused; a state not one hop from initial refused rather than bridged. `test/seed/cc-map.test.ts`, `test/seed/templates.test.ts`
- 13.12 ✅ needed_week → dueDate by the tracker's own week arithmetic (build_tracker.py:390), derivation named in the claim's note, attributed to the owner. `test/seed/cc-map.test.ts`, `test/seed/seed-cc.test.ts`
- 13.13 ✅ CC seed idempotence: second run commits zero, event count unchanged; staged guest run adds exactly the membership + four explicit visibility events. `test/seed/seed-cc.test.ts`
- 13.14 ✅ verify-projections is clean over the seeded world. `test/seed/seed-cc.test.ts`
- 13.15 ✅ Dev seed: one epic per plan, one ticket per task heading, titles verbatim; zero date claims, zero transitions; idempotent. `test/seed/plan-series.test.ts`, `test/seed/seed-dev.test.ts`
- 13.16 ✅ Ledger export: dated ndjson.gz, canonical order, byte-deterministic. `test/ops/export-ledger.test.ts`
- 13.17 ✅ pg_dump backup streams a valid custom-format dump; a bad URL fails loudly with stderr. `test/ops/pg-dump.test.ts` (runs in CI; skips only where the binary is absent locally)
- 13.18 ✅ Restore drill: dump → bare scratch → pg_restore → verify-projections clean; planted drift in a restored projection is caught with the table named; the restored ledger still refuses UPDATEs. `test/ops/restore-drill.test.ts`
- 13.19 ✅ E2E smoke on the deployed stack: magic link via Mailpit, ticket created, bare close refused with a visible non-empty reason, comment satisfies, board reflects after reload. `e2e/tests/smoke.spec.ts`
- 13.20 ✅ E2E visibility: the guest sees the four shared tickets, not the rest; a direct URL probe of an unshared ticket shows not-found. `e2e/tests/visibility.spec.ts`
- 13.21 🧪 Production provisioning on DigitalOcean BLR1 (Spaces buckets, the two `pm.artsourced.in` CNAMEs, TLS, secrets, uptime check) per deploy/do/README.md — verified at deploy time; a cloud control plane is not CI-testable from this repo.
- 13.22 🧪 Monthly restore drill against a real production dump, recorded as a ticket in the Gisik Nokma workspace, per the runbook.
```

- [ ] **Step 4: The whole-stack final smoke**

Run the full ladder once, top to bottom, before the PR:

```bash
pnpm run lint && pnpm run typecheck && pnpm run check:env
pnpm run build
pnpm run test                                    # unit + integration incl. seeds and the drill
pnpm run test:fixtures && pnpm run test:dual-client
docker compose -f docker-compose.dev.yml up -d --build
pnpm run test:e2e
docker compose -f docker-compose.dev.yml exec server node dist/ops/backup-daemon-main.js --once
docker compose -f docker-compose.dev.yml down
```

Expected: every command exits 0; the backup prints both `complete` lines.

- [ ] **Step 5: Commit**

```bash
git add docs/runbook.md Features.md test-cases/13-deployment-dogfooding.md
git commit -m "docs: runbook, Features.md §13, test-cases 13.1–13.22 — the catalogue moves with the work

Deploy, rotation, backups, the monthly restore drill (recorded as a
ticket in the product's own workspace — the keeper of memory keeps its
own), incident basics. The runbook lands in-repo; the workspace's /kb
convention for runbooks is flagged to the owner rather than resolved
sideways."
```

---

## Open questions

1. **Provider — SETTLED (owner sign-off 2026-08-20).** **DigitalOcean App Platform + Managed PostgreSQL + Spaces, all BLR1** — the same stack convenience-corner runs. This was written as a required sign-off before Task 15, weighing DigitalOcean BLR1 at ≈ $42/mo (list, approximate) against AWS Mumbai (ap-south-1); the owner took DigitalOcean, judging the one-YAML ops surface worth more to a one-operator team than AISPL's INR billing. AWS Mumbai stays **recorded as a considered alternative**, not an open question — the 12-factor env contract keeps it a `deploy/`-contained swap if the accountant's answer ever makes INR billing decisive. The shop's own accountant question (`ops:accountant-cloud-gst`, seeded by this very plan) remains open on its own terms — how to *treat* the spend — and does not reopen this. The USD invoicing that comes with it (forex markup on the card, GST on imported services under reverse charge) is an accepted, already-known cost carried over with the stack, recorded in the cost sketch. Task 15's gate is lifted.
2. **Spaces in BLR1 — ANSWERED (not moot).** Spaces **Standard Storage IS available in BLR1**; no SGP1 fallback is needed and the `S3_ENDPOINT`/`S3_REGION` values in `deploy/do/app.yaml` stand as written (`https://blr1.digitaloceanspaces.com`, `blr1`). The one caveat worth writing down: Spaces **Cold Storage is not** offered in BLR1. Backups therefore stay on Standard — which is the right tier regardless, since nightly dumps and weekly ledger exports are read back on every monthly restore drill, and a cold tier optimises for objects nobody reads. **Cloudflare R2 was compared here and lost on data residency:** Gisik Nokma serves arbitrary user uploads behind per-viewer permission checks (unlike convenience-corner's owner-controlled public imagery), and R2 offers EU/US jurisdictions only, with `apac` a best-effort, unchangeable hint — it cannot pin bytes to India, while Spaces BLR1 keeps them beside the ledger that describes them. The cost gap at v1 scale is a few dollars a month. `ObjectStore`/`ObjectSink` are S3-protocol either way, so the swap stays cheap: **revisit R2 when monthly egress approaches 1 TiB**, where its zero egress charge starts to win materially.
3. **Custom domain — SETTLED (owner sign-off 2026-08-20): `pm.artsourced.in`.** Branding was out of scope in the spec and `deploy/do/app.yaml` deliberately carried a placeholder; the owner has now picked a subdomain of the existing `artsourced.in` zone. The spec carries the real hosts: **`pm.artsourced.in`** for the web app and **`api.pm.artsourced.in`** for the API — the API nested under the product host so one zone and one name cover both, and DNS is two CNAMEs (`pm`, `api.pm`) with no apex/ALIAS handling and no disturbance to the zone's existing records. `WEB_ORIGIN`, `BETTER_AUTH_URL`, the two `NEXT_PUBLIC_*` build-time envs, the ingress rules and the uptime check all name them concretely; nothing in Task 15 waits on a decision any more.
4. **Plan 8 template surfaces (assumed pins).** Export names `ERRAND_WITH_WAITS_TEMPLATE` / `SIMPLE_KANBAN_TEMPLATE` from `@gisik-nokma/domain`, and the errand template's structure: state ids `later`, `next`, `in-progress`, `waiting`, `done`; `waiting` carries `blocked: true`; every mapped state reachable in ONE transition from the initial state; every transition into `done` carries `require-comment`. `checkErrandTemplate` (Task 7) is the executable pin — if Plan 8's payload differs, amend the template or the coordination doc, never the check's honesty requirements (the one-hop rule is what keeps the seed from fabricating intermediate history).
5. **Plan 6 surfaces (assumed pins).** The data-testid contract table; `NEXT_PUBLIC_API_URL` / `NEXT_PUBLIC_WS_URL` env names; web package name `@gisik-nokma/web`; `output: 'standalone'` tolerated in its Next config; a `not-found` testid on the invisible-ticket page. Isolated to the two Dockerfile ARG lines, compose args, and the E2E helpers.
6. **Plan 7 object-storage config names.** This plan pins `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_FORCE_PATH_STYLE` (compose + `.env.example` + backup sink). Plan 7's `ObjectStore` implementation should read the same names; if it landed different ones, reconcile via the coordination doc in one direction, not two.
7. **Plan 10 harness command.** `test:dual-client` assumes `pnpm --filter @gisik-nokma/sync-harness run test`, and `test:fixtures`' client half assumes an `@gisik-nokma/app-core` fixture runner — both to be corrected to Plan 10/6's real names at execution (Task 14 Step 1 says exactly where). Also: `/v1/sync` was included in the events rate-limit budget — confirm against Plan 10's retry semantics.
8. **better-auth as landed (Plan 4).** The seed reads table `"user"` (better-auth's default) by email; the E2E calls `POST /api/auth/sign-in/magic-link` and follows the mailed verify link; env names `BETTER_AUTH_SECRET`/`BETTER_AUTH_URL` and the Google OAuth pair in `.env.example`. Each is isolated to one helper file; verify against Plan 4's code and the check-env gate.
9. **Custom date fields and the calendar — SETTLED (owner sign-off 2026-08-20).** This asked whether Plan 9's calendar/timeline draws spans from custom date fields or only from the built-ins. The answer is **both halves, and neither is a span**: custom `date`-kind fields DO render in v1, as attributed markers labelled with the field's own name — and they never draw a bar, because a bar still requires the `startDate` + `dueDate` pair (pairing arbitrary claims would invent a duration nobody claimed). Plan 9 Open questions 15 carries the full ruling and Plan 9 cases 11.36–11.41 prove it. For this plan's seed the practical consequence is unchanged: a seeded custom date claim shows on the ticket and on the calendar as its own attributed marker, and the seed still claims a date only where the frozen record carries one.
10. **Runbook location.** The workspace convention routes runbooks to `/kb`; this repo keeps implementation docs in-repo (as with these plans). `docs/runbook.md` lands in-repo; the tension is the owner's to resolve, and moving the document later is cheap.
11. **Branch protection — SETTLED (owner sign-off 2026-08-20): `main` stays unprotected.** This was written as a fork in the road — GitHub Pro, a public repo, or procedural discipline — because a free-plan private repo cannot enforce server-side protection of `main`, the exact wall the base project hit (`ops:owner-github-plan`, now a seeded ticket). The owner chose to stay on the free private plan, same as convenience-corner, and to carry the rule procedurally instead. **The compensating control is a standing instruction never to commit or push to `main` directly, recorded in the repo's `CLAUDE.md`** — where every session reads it before touching anything. The discipline is unchanged from what the spec always required: branch → PR → merge on explicit approval, CI green. What changes is only who enforces it: a written rule that people and agents follow, not a server that refuses. **No plan upgrade is proposed and none should be added** — this question is closed, not deferred.
12. **Permission-gate bootstrap for server-origin seeds.** If Plan 4 wired `checkPermission` inside the ingest service (not only the HTTP route), the seed's `workspace.created`-then-`membership.granted` bootstrap order must match Plan 4's own workspace-creation flow. The seed integration test surfaces this immediately and loudly; adapt the seed's event order, never the gate.

## Self-review (per the writing-plans skill)

**Spec coverage.** §7 Dogfooding: Convenience Corner workspace with the shop's actual errands on errand-with-waits with the accountant as guest — Tasks 7–9; Gisik Nokma workspace managing its own build — Task 10. Out-of-scope deferral (provider/region/pricing, India-reachable phone-first) — the production stack section + Task 15, now decided rather than flagged (owner sign-off 2026-08-20: DigitalOcean BLR1 + Spaces BLR1, `pm.artsourced.in`). §1 invariant 4 applied to seeds — the date-mapping table, the refusal paths, and the planted defects in Tasks 8/10. §3's scheduled verifier reaching operations — Tasks 12 and 16 (drill + runbook cadence). §7 testing discipline in CI order — Task 14 (shared fixtures in both builds, dual-client harness, E2E). §6's DLT constraint honoured operationally — Task 4 and the production stack section. Assignment items 1–10 map to Tasks 5–6 (containers/stack/env), the stack section + 15 (provider), 1–2 (TLS-adjacent config, rate limits, CORS), 11–12 (backups/restore/drill), 1+3 + the stack section (monitoring floor: healthz version, uptime check, structured logs, alert hook), 7–9 (CC seed), 10 (dev seed), 13 (E2E), 14 (CI + versioning + repo rule), 16 (runbook + catalogue). Gaps: none found.

**Placeholder scan.** One near-miss was caught and rewritten during drafting (Task 8's description builder now appears once, finished). The placeholder hosts Task 15 once carried were deliberate and flagged rather than silent TODOs; they are now gone — the owner decided the domain on 2026-08-20 and `deploy/do/app.yaml` names `pm.artsourced.in` and `api.pm.artsourced.in` concretely, with the two `NEXT_PUBLIC_*` build-time envs filled in rather than deferred. The one remaining `<…>`-shaped value in the deploy tree is the Spaces key pair, which is a secret and belongs nowhere in the repo. Executor-verify notes (root script names, Plan 6/8/10 surface names, verify CLI filename) each name the exact file to check and the invariant that must survive the check — they are consumption notes on parallel plans' Produces, not deferred design.

**Type consistency.** `SeedReport`/`CcSeedDeps` defined in Task 9, reused by Task 10's `seedDevWorkspace` — consistent. `seedUlid('ticket', 'cc#<id>')` convention identical in Task 8's tests, Task 9's runner, and the guest-visibility block. `ObjectSink.put(key, body, contentType)` matches between `object-sink.ts`, `export-ledger.ts`, `pg-dump.ts`, and both capture sinks in tests (the pg-dump capture sink accepts two args — TypeScript structural typing permits the narrower test double). `ErrorAlerter.notify(context, error)` consistent across Tasks 3 and 11. `checkErrandTemplate` returns `{ok:true}|{ok:false;problems}` in both definition and tests. Rate-limit values 10/120/60 agree between Task 1 defaults, Task 2 prose, compose overrides (60/600), `.env.example`, and the DO spec.




