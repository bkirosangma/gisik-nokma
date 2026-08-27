# Features — gisik-nokma

Legend: ✅ user-observable · ⚙️ internal subsystem · ? inferred/unverified

## 1. Reference base

- ⚙️ **Vendored tracker snapshot** — the convenience-corner project tracker, verbatim at upstream commit `24e2240`: the four-view static page (Focus, Board, Backlog, Calendar), its authored attention file, its generated data snapshot, and the generator with its 73 tests. Frozen; provenance and the freeze rule in `reference/convenience-corner-tracker/PROVENANCE.md`. `reference/convenience-corner-tracker/`
- ⚙️ **Base design documents** — the three upstream documents that designed the base: the tracker (2026-08-18), the calendar view (2026-08-19), and the calendar's implementation plan. `reference/design-docs/`

## 2. Product design

- ⚙️ **Product design spec** — the brainstorm's approved output: audience (non-technical operators), the honesty contract, event-sourced architecture with a shared rule engine, workflow engine and builder, offline sync with contested claims, permissions and visibility, views and search, testing discipline, and the two dogfooding targets. Approved and merged (PR #1). `docs/superpowers/specs/2026-08-20-gisik-nokma-product-design.md`
- ⚙️ **Implementation plan series** — eleven task-by-task plans covering the whole build, ledger through deployment and dogfooding, written in parallel from one pinned contract and then reconciled. Reviewed and merged via PR #2; execution in progress, plan by plan. `docs/superpowers/plans/`
- ⚙️ **Series coordination document** — the single authority for cross-plan interfaces, naming, and ownership, and the record of every decision taken at review: where a plan disagrees with it, it wins. `docs/superpowers/plans/2026-08-20-00-series-coordination.md`

*(Product feature sections begin once implementation starts. Sections 3–13, and the matching `test-cases/` buckets, are already reserved one per plan by the coordination document. The brainstorm that produced the spec started from `docs/brainstorm-kickoff.md`.)*

## 3. Foundation & event ledger

- ⚙️ **Monorepo workspace** — pnpm workspaces + Turborepo, TypeScript strict, Node 22, ESM, Vitest; packages `@gisik-nokma/domain`, `@gisik-nokma/rule-engine`, `@gisik-nokma/server`. Root configs `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`; dev Postgres via `docker-compose.yml`.
- ⚙️ **Event envelope & vocabulary** — the exact `EventEnvelope` contract with zod validation, ULID helpers, and the versioned event-type registry; pure `parseEvent` refuses unknown types, unknown versions, invalid payloads, malformed envelopes. Provisional seed vocabulary: `workspace.created` v1, `workspace.renamed` v1. `packages/domain/`
- ⚙️ **IST day boundaries** — `istDayOf(instant)` and `istDayBounds(day)` against the fixed +05:30 offset (India has no DST), plus `IST_TIME_ZONE`: the single origin for where a day starts. "Due today", "overdue", calendar-cell assignment and day counts across the whole product resolve here, never from the server's locale or the viewer's device. `packages/domain/src/ist-day.ts`
- ⚙️ **Rule-engine boundary** — `evaluateEvent(env, ctx)` returning Accept or a Refusal that names its rule; pass-through internals that Plan 2 replaces. `packages/rule-engine/`
- ✅ **Event ingest API** — `POST /v1/events` batch ingest: parse at the door → advisory-locked per-entity `seq` and per-workspace `workspace_seq` (workspace lock first, then entity) + `serverTime` → rule-engine gate → append + projections in one transaction → index-aligned per-event committed/invalid/refused results. `GET /healthz`. `apps/server/src/routes/events.ts`, `apps/server/src/ingest/`
- ⚙️ **Append-only ledger** — Postgres `events` table where UPDATE/DELETE/TRUNCATE are refused by trigger, `(entity_kind, entity_id, seq)` is unique, and both clocks are `timestamptz` absolute instants: `client_time` the claimed instant beside `server_time` the received one, so they sort and compare without a cast and one moment stated in two offsets is one moment; `snapshots` table ready to bound future replay. `apps/server/migrations/`
- ⚙️ **Asia/Kolkata everywhere** — every pooled connection, the dev Postgres server, and every test database run with session timezone `Asia/Kolkata`, so an ad-hoc query reads the same clock the product shows. `apps/server/src/db.ts`, `docker-compose.yml`, `apps/server/test/helpers/db.ts`
- ⚙️ **Workspace stream cursor** — `workspace_seq`, unique per `(workspace_id, workspace_seq)` and assigned in the ingest transaction under a per-workspace advisory lock, is the only order a workspace stream may resume by; per-entity `seq` keeps entity history, replay and snapshots. Server-enriched and opaque to clients (coordination §18). `apps/server/src/ledger/event-store.ts`
- ⚙️ **Projection framework** — registry of deterministic `apply`/`reset` read models applied in the ingest transaction; `rebuildProjection` replays the canonical order; reference projection `proj_entity_heads` (newest event per entity, replay-safe). `apps/server/src/projections/`
- ⚙️ **Broadcast hook** — `onEventCommitted(cb)` fires only after commit, never for refused or invalid events; Plan 5 attaches WebSocket fan-out. `apps/server/src/ingest/ingest-service.ts`
- ⚙️ **Projection verifier** — `verify-projections` CLI re-derives every projection into a shadow schema, diffs against live in both directions, names drifted rows, exits nonzero on drift. `apps/server/src/tools/verify-projections.ts`
