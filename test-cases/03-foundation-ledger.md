# 3. Foundation & event ledger

Mirrors `Features.md` §3. Status: `❌` not covered · `✅` covered · `🟡` partial · `🧪` manual · `🚫` out of scope.

- **3.1** ✅ A well-formed submitted event passes envelope validation; a non-ULID id, unknown entity kind, missing actor, unreal datetime, or micro-second timestamp is refused (planted defects). — `packages/domain/test/envelope.test.ts`
- **3.2** ✅ An event of an unregistered type is refused `unknown-event-type` with the type named (planted defect). — `packages/domain/test/parse-event.test.ts`
- **3.3** ✅ A registered type at an unregistered version is refused `unknown-event-version` (planted defect). — `packages/domain/test/parse-event.test.ts`
- **3.4** ✅ A payload missing a required field or smuggling extra keys is refused `invalid-payload` (planted defects). — `packages/domain/test/parse-event.test.ts`
- **3.5** ✅ Registering the same event type@version twice, or the same projection name twice, is refused (planted defects). — `packages/domain/test/registry.test.ts`, `apps/server/test/projection-framework.test.ts`
- **3.6** ✅ The pass-through rule engine accepts every event and consults nothing; a Refusal carries `rule` + plain-language `reason`. — `packages/rule-engine/test/engine.test.ts`
- **3.7** ✅ UPDATE, DELETE and TRUNCATE on `events` are refused by the append-only trigger (planted defects). — `apps/server/test/migrations.test.ts`
- **3.8** ✅ A duplicate `(entity_kind, entity_id, seq)` violates `events_entity_seq_unique` (planted defect); two concurrent appends to one entity serialise to consecutive seqs. — `apps/server/test/migrations.test.ts`, `apps/server/test/event-store.test.ts`
- **3.9** ✅ A stored claim reads back as the same instant: jsonb payload intact, `client_time` an absolute `timestamptz`, `seq` as a number; an ISO `+05:30` claim round-trips through `rowToEnvelope` as the equivalent `Z` instant, with `client_time` and `server_time` still two separate facts. — `apps/server/test/migrations.test.ts`, `apps/server/test/event-store.test.ts`
- **3.10** ✅ Snapshots store and return the highest-seq state per entity; absent means null. — `apps/server/test/snapshot-store.test.ts`
- **3.11** ✅ Batch ingest answers per event, index-aligned: committed with seq/serverTime, invalid with named code, refused with rule + reason. — `apps/server/test/ingest.test.ts`
- **3.12** ✅ A rule-refused event leaves NO trace in ledger or projections (planted defect). — `apps/server/test/ingest.test.ts`
- **3.13** ✅ A replayed client event id is answered `duplicate-event-id` (planted defect). — `apps/server/test/ingest.test.ts`
- **3.14** ✅ Projections apply in the same transaction as the event; the rule engine judges the world as of the previous event. — `apps/server/test/ingest.test.ts`
- **3.15** ✅ `onEventCommitted` fires only after commit, never for invalid/refused; unsubscribe works; a throwing listener cannot break ingest (planted defect). — `apps/server/test/ingest.test.ts`
- **3.16** ✅ `POST /v1/events` returns 200 with per-event results; a missing/empty/oversized `events` array is a 400 (planted defects). — `apps/server/test/events-route.test.ts`
- **3.17** ✅ `GET /healthz` answers ok only when the database responds; 503 otherwise (planted defect). — `apps/server/test/app.test.ts`
- **3.18** ✅ `rebuildProjection` resets once then replays the canonical order regardless of arrival interleaving; unknown projection names are refused (planted defect). — `apps/server/test/projection-framework.test.ts`
- **3.19** ✅ `proj_entity_heads` tracks the newest event per entity; a stale replayed apply cannot regress a head (planted defect); rebuild equals a direct ledger derivation. — `apps/server/test/entity-heads.test.ts`
- **3.20** ✅ verify-projections is clean on honest state; corrupted and deleted live rows are named with per-direction counts and samples, the shadow schema is always dropped, and a rebuild repairs the drift (planted defects). — `apps/server/test/verify-projections.test.ts`
- **3.21** ✅ Replaying the fixture ledger twice yields byte-identical projection rows with the expected heads; reversed arrival derives the same bytes; every fixture id is regex-proven a ULID. — `apps/server/test/determinism.test.ts`
- **3.22** ✅ Boot refuses a missing `DATABASE_URL` or non-numeric `PORT` with the variable named (planted defects). — `apps/server/test/config.test.ts`
- **3.23** 🧪 End-to-end smoke: compose up, migrate, verify clean, boot, healthz ok, one event ingested over HTTP, verify clean again — run per release (Plan 1 Task 14 steps 1–2).
- **3.24** ✅ A duplicate `(workspace_id, workspace_seq)` violates `events_workspace_seq_unique` (planted defect); two entities in one workspace get strictly increasing cursors while both honestly keep `seq` 1; concurrent appends and four racing ingests never mint one cursor twice (planted defects). — `apps/server/test/migrations.test.ts`, `apps/server/test/event-store.test.ts`, `apps/server/test/ingest.test.ts`
- **3.25** ✅ The workspace cursor changes nothing about replay: canonical order stays `(entity_kind, entity_id, seq)`, every stored row carries a cursor unique within its workspace, and `onEventCommitted` hands listeners the cursor a stream resumes by. — `apps/server/test/event-store.test.ts`, `apps/server/test/ingest.test.ts`
- **3.26** ✅ Two clients stating the SAME instant with different offsets (`+05:30` and `Z`) store as one instant and compare equal, in SQL and after the round trip through `rowToEnvelope` — the comparison a text `client_time` silently got wrong (planted defects). — `apps/server/test/migrations.test.ts`, `apps/server/test/event-store.test.ts`
- **3.27** ✅ IST day boundaries: `18:29:59Z` and `18:30:00Z` fall on different IST days; a day's bounds are the half-open `[startUtc, endUtc)` UTC interval and round-trip back to that day for all 365 days of a year with every day exactly 24h and no gap between consecutive days; month, year and leap-day rollovers happen at the IST boundary; date-only strings, unparseable instants, offsetless instants, malformed days and unreal calendar days are refused (planted defects). — `packages/domain/test/ist-day.test.ts`
- **3.28** ✅ Every pooled session reports `Asia/Kolkata`, so an ad-hoc query reads the product's clock; the dev compose server and each test database are pinned to it too. — `apps/server/test/migrations.test.ts`
