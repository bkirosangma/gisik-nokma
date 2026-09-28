# Trash — Plan 2 of 4: Purge Engine and Backup Retention Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make "permanently deleted" true. Every workspace, project, ticket or note whose `purge.marked` has fallen due is erased: its ledger rows, projection rows, search rows and attachment objects are removed. Only the item's key slot and a content-free tombstone remain. After an erasure, a later ticket keeps its key, `verifyProjections` stays clean, and backups older than 30 days are pruned.

**Architecture:** There are two layers, and both run in one transaction.
- **SQL owns the ledger.** `events` is the only trigger-protected table. A new `events_append_only()` allows `DELETE`, and one exact `UPDATE` shape, only for rows in a transaction-scoped erasure set. That set is built by `purge_ledger(kind, id)`, a `SECURITY DEFINER` function.
- **TypeScript owns every other table.** `purgeItem()` in `apps/server/src/purge/purge-item.ts` takes the workspace lock and captures the stream positions. It then calls `purge_ledger` and deletes the set's rows from each table by the rule in `PURGE_TABLE_RULES`. It records the erased ids in a new `purged_entities` registry. It then re-derives every surviving row the erasure touched, by replaying that row's surviving events through the projection's own `apply`. Last, it appends one `purge.completed` tombstone.

Attachment objects are deleted after `COMMIT` through a `purge_pending_objects` queue. The hourly sweep runs in the backup worker. The same worker prunes backup objects after each successful backup.

**Tech Stack:** TypeScript monorepo (pnpm + turbo), zod in `packages/domain`, Fastify + `pg` in `apps/server`, plpgsql, `node-pg-migrate`, `@aws-sdk/client-s3` + `aws-sdk-client-mock`, vitest everywhere, Postgres 16 (test DB on port 54329).

**Spec:** `docs/superpowers/specs/2026-09-23-trash-and-purge-design.md`. This plan implements spec §5.1–§5.6, §5.8 and §7. The server half of §5.7 (the door refusal) is here; the replica half is Plan 3's. Read §2 (decisions T1, T4, T5, T6) and §5 in full before Task 1.

**The series.**

| Plan | Spec sections | Depends on | Case block |
|---|---|---|---|
| 1 Lifecycle core (landed, #737) | §4, §6.3 read, T8–T10 | — | `19.001`–`19.080` |
| **2 Purge engine + backup retention (this plan)** | §5.1–§5.6, §5.8, §7 (+ §5.7 server door) | 1 | `19.081`–`19.160` |
| 3 Replica + sync | §5.7, the replica half of §6.3 | 1, 2 | `19.161`–`19.200` |
| 4 UI: dialog, cards, Account → Deleted items | §6.1, §6.2, §6.3 screen | 1 | `19.201`–`19.260` |

## Global Constraints

- **Branch shape.**
  - Cut `task/trash-2-purge-engine` from `origin/release/trash`. Make one commit per task.
  - Open the PR through `bash scripts/ctl/ctl pr open <branch> --repo <worktree> --base release/trash --title T --body FILE`.
  - Never use `--base main`. Never push to `main` or `release/trash`.
  - CI does not run on a dev PR into a release branch. The verification is your LOCAL run: say which run you are quoting, and paste `NODE=` beside it.
- **Node 22 for every run.** `node --version` must print `v22.*` in the same shell.
- **Build before suites:** run `pnpm turbo run build` at the repo root before any package's vitest run.
- **Run a suite as** `cd <package> && pnpm exec vitest run --no-file-parallelism <files> > /tmp/trash2-<pkg>.log 2>&1; tail -20 /tmp/trash2-<pkg>.log`.
  - **Never pipe a test run into `head`.**
  - Never trust `$?` of a chain. Read the summary line. A log with no summary line is a crash, not a pass.
- **Server suites need the test Postgres:** `docker compose up -d postgres` (port 54329). Never touch 54330 (the dev DB).
- **Every case follows the same cycle:**
  1. RED first.
  2. A control in the same `it`.
  3. Commit.
  4. Apply the named mutation and show it red.
  5. Restore.

  Commit BEFORE you mutate, and restore with `git checkout -- <file>` only after the commit. Paste the RED and GREEN summary lines into the commit body.
- **Case ids.** This plan owns block **`19.081`–`19.160`** in `test-cases/19-trash.md` (3-digit padded).
  - Add new `## 19.N` sections after `## 19.8 Client contract`.
  - Write each case as a `- ❌ **19.0NN — …**` id LINE, one id per line. Never put an id in a table, a heading, backticks, or two ids in one sentence: `scripts/check-case-ids.mjs` cannot see those.
  - After adding cases, run `node scripts/check-case-ids.mjs` and confirm the count moved by EXACTLY the number you added.
  - Flip `❌`→`✅` in the commit that adds the citing test. Test names contain the id. `pnpm check:citations` stays green, and the `"19-trash.md": 0` baseline stays 0.
- **`Features.md`:** each task adds its bullet(s) under `## 16. Archive, delete and purge` (`Features.md:3258`) in the same commit as its code.
- **Migration number:** `1790600000000_purge-engine.sql`. Before committing, re-read `ls apps/server/migrations | tail -3`: yours must sort after every migration on `origin/release/trash`. Then run `pnpm check:migrations`.
- **The purge delay is one constant.** `PURGE_DELAY_DAYS = 15` lives in `packages/domain/src/lifecycle.ts:2`, and every due instant is `purgeDueAt(markedAt)` (`lifecycle.ts:8-10`). Nothing in this plan spells 15.
- **Nothing but `purge_ledger` removes or rewrites a ledger row.** No TypeScript `DELETE FROM events` or `UPDATE events` anywhere.
- **Copy (exact strings, exported constants; tests pin the constant):**
  - `PURGED_REASON = 'This item was permanently deleted.'` (`packages/domain/src/purge.ts`)
  - `PURGE_SERVER_ONLY_REASON = 'Only the permanent-deletion sweep can record a purge.'` (`packages/domain/src/purge.ts`)
  - `PURGED_ITEM_LABEL = 'Deleted item'` (`packages/domain/src/purge.ts`)
  - `SYSTEM_ACTOR_PURGE = '00000000000000000000SYS0PG'`, display name `'Permanent deletion'` (`packages/domain/src/system-actors.ts`)
- **New environment variables:** `PURGE_SWEEP_INTERVAL_MS` (default `3600000`) and `BACKUP_RETENTION_DAYS` (default `30`). Document both in `.env.example`, and run `pnpm check:env` after Tasks 9 and 10.
- **Never `AskUserQuestion`.** A question goes into your progress line for the controller.
- **Line numbers** in this plan were read at `origin/release/trash` `218a00a9`. Open the file and trust the symbol, not the number.

## Recorded deviations from the spec

> **Owner ruling 2026-09-28 (A): a purge erases the item, not other documents' quotes of it.** A ticketRef chip in a surviving comment, description or note keeps the key and title its author saw (consistent with the 2026-09-24 reference-chip ruling). Plan 2 removes those bytes from search (docToPlainText resolver + re-derivation), and Plan 3 renders the chip as 'Deleted item'. The bytes remain inside surviving documents and the ledger, and are not rewritten.

The ruling is recorded in the spec's decisions table as T11 (uncommitted edit on this branch at the time of writing). What the ruling means for this plan: the erasure proof (Tasks 5–7) carries an explicit allowlist. It lists surviving documents and surviving reference events that still name an erased id. Every allowlisted shape is seeded in the fixture, so no allowlist entry is vacuous.

- **D1 — spec §5.2 says `purge_item` performs all four steps; this plan splits it into two layers inside one transaction.**
  - SQL (`purge_ledger`) removes and redacts ledger and snapshot rows. That is the only place the trigger has to trust.
  - TypeScript (`purgeItem`) does everything else inside the same transaction:
    - deletes the set's projection, search, notification and attachment rows;
    - re-derives survivors;
    - appends the tombstone.
  - What the spec wanted is kept: one transaction, and nothing but the sanctioned function can touch a ledger row (`events_append_only`, Task 4).
- **D2 — a new table `purged_entities(entity_kind, entity_id, workspace_id, purged_at)` records every erased id. It has no content.**
  - A rebuild replays by entity, not by time (`readLedger` orders `entity_kind, entity_id, seq`, `apps/server/src/ledger/event-store.ts:154-158`). So a projection folding a surviving event that names a purged id cannot learn of the purge from the ledger. Three such events: `note.attached` to a purged ticket, an invite naming a purged project, a comment chip.
  - Such a projection must consult the registry, and does so identically live and on rebuild. `verifyProjections` puts `verify_shadow` first on `search_path` and falls through to `public` (`tools/verify-projections.ts`, the `SET search_path` line). So the unshadowed registry is read in both.
  - The registry is also the door's lookup (Task 8) and Plan 3's replica lookup. It is never reset.
  - `PURGE_TABLE_RULES` gains a fourth rule, `'purge-registry'`, for this table and for the spec's own `purge_pending_objects`.
- **D3 — `proj_note_lexemes` has no note id, so the purge re-derives the whole workspace's lexemes rather than deleting rows.**
  - It rebuilds them from the workspace's `proj_note_search` rows. That is exactly what a rebuild yields: during a rebuild, `reindexNote` reads each note's FINAL `proj_notes` row (`projections/note-search.ts:133-160`).
  - Cost: the table's "a lexeme is never deleted" (`migrations/1790200000000_note-search.sql:66-70`) no longer holds for a workspace that has had a purge. Its spelling-correction vocabulary narrows to the words present at the purge.
- **D4 — spec §5.6 says "the renderer resolves the id and finds nothing"; no renderer resolves a chip by id today.**
  - `ticketRef` bakes KEY and title into the node attrs (`packages/editor/src/extensions/ticket-ref.ts:64-86`).
  - Rendering "Deleted item" needs the client to know the purged ids. That is Plan 3's sync work, per the ruling above.
  - This plan does the server side: `purged_entities` and the search re-derivation.
- **D5 — the backup worker gains `OBJECT_STORE=s3` and `OBJECT_STORE_S3_BUCKET=gisik-nokma-attachments` (`deploy/do/app.yaml`).**
  - Why the worker needs them: without them `createObjectStoreFromEnv` builds a `LocalDiskStore` (`apps/server/src/attachments/store-config.ts:26-30`). The purge could not delete a single attachment object.
  - This also repairs the existing 30-day orphan sweep (`backup-daemon-main.ts:210-235`), which has been listing an empty local folder in production (measured 2026-09-28).
  - **It also arms that sweep against the real attachments bucket for the first time.** Its deletes are unrecoverable (`docs/runbook.md`, "Orphaned uploads"). Before the first 30-day tick, run the sweep's `--dry-run` from the worker's console (release note, Task 9).
  - Pushes do not apply spec changes: apply the spec with `doctl apps update <app-id> --spec deploy/do/app.yaml`.
- **D6 — spec §5.3 files a workspace purge's tombstone in "a system stream the owner's account reads". No such stream exists.**
  - The tombstone goes into the purged workspace's own stream, at the captured `workspace_seq`, filed against the workspace entity.
  - Nothing in this plan reads it. The server stream will not deliver a purged TICKET's tombstone either, because `canSee` answers `false` for a ticket with no `proj_visibility` row (`apps/server/src/visibility/can-see.ts:251-255`).
  - Delivering tombstones to devices is Plan 3's.
- **D7 — spec §5.4: "every reader … must produce no ticket from" a redacted `ticket.created`.**
  - `applyTicketEvent` returns `TicketState`, never `undefined` (`packages/domain/src/ticket-state.ts:117-121`). Widening that return type breaks three callers that store the result as a definite state:
    - `apps/server/src/projections/tickets.ts:568`
    - `packages/rule-engine/src/memory-context.ts:139`
    - `packages/sync-client/src/precheck/local-context.ts:151`
  - So the domain instead exports `isRedactedTicketCreated(env)` and a tolerant `foldTicketEvent(state, env, deps): TicketState | undefined`, which returns the input state unchanged for a redacted row.
  - `applyTicketEvent` itself now throws a NAMED error for a redacted row, not a zod parse error. The server readers skip it: tickets, visibility, search, snapshot writer.
  - The client folds (`replica.ts:921`, `local-context.ts:151`) switch to `foldTicketEvent` in Plan 3. The server never delivers a redacted row to a device (D6's `canSee` argument).
- **D8 — the notes projection keeps a purged attachment in the REDUCER's view while leaving it out of `proj_note_attachments`.**
  - Spec §5.6 says the row goes, and it does.
  - The hazard: a note that attached T and later moved to `inherit`. On rebuild, with T's attachment row skipped, `applyNoteEvent` refuses the `note.scope_set` ("inherit needs an attachment", `packages/domain/src/note-state.ts:164`), and the rebuild throws.
  - The fix: before folding, `notesProjection` reads the note's OWN earlier `note.created`/`note.attached`/`note.detached` payloads (per-entity causality, which replay guarantees). It re-adds any attached ticket that is now in `purged_entities`.
  - Such a note keeps `scope_mode = 'inherit'` with no attachment row. `canReadNote` then admits its author and the owner only (`visibility/can-read-note.ts:56-57,79-80`), which is what the soft-deleted ticket already gave it.
- **D9 — the backup prune deletes per key with `DeleteObjectCommand`, not the brief's `DeleteObjects`.**
  - `DeleteObjectCommand` is the call this repository has already sent to Spaces (`attachments/s3-store.ts:93-96`, `ops/object-sink.ts`'s `discard`). `DeleteObjects` never has been.
  - Backups number single digits (7 objects measured 2026-09-28), so a batch saves nothing.
- **D10 — the purged-entity refusal sits in `commitOne` and applies to BOTH doors, beside `checkContestCoherence` (`ingest/ingest-service.ts:277`). It is not only in the client gate.**
  - An offline push that is refused on a ticket becomes a server-appended `claim.contested` on that same ticket through the internal door (`sync/sync-service.ts:197-206,416-417`; `serverAppend` is `ingest.ingestBatch`, `index.ts:136`).
  - With a client-only gate, a stale device's claim against a purged ticket would re-create ledger rows for the purged entity, with the claim's payload embedded.
- **D11 — a project's erasure set also takes every ticket whose `ticket.created` names the project** (`payload->>'projectId'`), not only `proj_tickets` rows. A ticket purged individually earlier has a redacted row but no `proj_tickets` row. The project purge must still delete that row and the ticket's tombstone.
- **D12 — the guard reads eight column names, not the spec's five** (§5.5 names `workspace_id`, `project_id`, `ticket_id`, `note_id`, `entity_id`).
  - Added: `parent_id`, `home_project_id`, `parent_ticket_id`.
  - A second assertion requires EVERY base table to have a rule. That catches `invite_tokens`, which names no entity column.
- **D13 — spec §5.1 says "no later `purge.unmarked`/`purge.completed`"; the sweep reads Plan 1's projection columns instead.**
  - It selects items whose `purge_marked_at IS NOT NULL` and whose `purgeDueAt(purge_marked_at) <= now`, from `proj_workspaces`/`proj_projects`/`proj_tickets`/`proj_notes`.
  - A `purge.unmarked` already nulls the column (Plan 1 Task 2). A `purge.completed` item has no row left.

## Review Focus

Inputs and conditions the spec implies that no task's happy path exercises, most likely first. Each has its test in the owning task.

1. **A ticket purged while a SURVIVING ticket's comment chips it.**
   - Expected: the survivor's search no longer matches the purged title, and `verifyProjections` is clean.
   - Owner: Task 7, case 19.130.
2. **Two items due, and the first one's purge throws.**
   - Expected: the second still purges. The first is alerted once per failure and retried on the next sweep.
   - Owner: Task 9, case 19.146.
3. **A workspace purge while another workspace shares a user.**
   - Expected: the other workspace's memberships, preferences and notifications are untouched.
   - Owner: Task 6, case 19.122.
4. **A crash between `COMMIT` and the object delete.**
   - Expected: the key stays in `purge_pending_objects`, and the next sweep deletes it.
   - Owner: Task 5, case 19.117 (the key stays); Task 9, case 19.147 (the sweep drains it).
5. **Backups: only one pg dump exists, and it is 90 days old.**
   - Expected: it is kept. The prune never deletes the newest object under a prefix.
   - Owner: Task 10, case 19.154.

---

## File map

| File | Responsibility in this plan |
|---|---|
| `apps/server/src/purge/table-rules.ts` (new) | `PURGE_TABLE_RULES`, `ENTITY_COLUMN_NAMES`, `workspaceScopedTables()` |
| `packages/domain/src/purge.ts` (new) | `PURGED_REASON`, `PURGE_SERVER_ONLY_REASON`, `PURGED_ITEM_LABEL`, `isRedactedTicketCreated`, `redactedTicketCreatedPayload` |
| `packages/domain/src/events/lifecycle-events.ts` | `purgeCompletedPayload` |
| `packages/domain/src/vocabulary.ts` | `purge.completed` registration |
| `packages/domain/src/system-actors.ts` | `SYSTEM_ACTOR_PURGE` |
| `packages/domain/src/ticket-state.ts` | named throw for a redacted row; `foldTicketEvent` |
| `packages/domain/src/doc-text.ts`, `doc-chunks.ts` | `DocTextOptions.isPurged`, `collectDocReferences` |
| `apps/server/src/projections/tickets.ts`, `proj-visibility.ts`, `search.ts`, `sync/snapshot-writer.ts` | redacted-row tolerance |
| `apps/server/migrations/1790600000000_purge-engine.sql` (new) | `purged_entities`, `purge_pending_objects`, `purge_erasure_set`, `purge_ledger`, the new `events_append_only()` |
| `apps/server/src/purge/erasure.ts` (new) | `ErasureSet`, `toErasureSet`, `eraseRows`, `objectKeysOf`, `replayRemaining` |
| `apps/server/src/purge/pending-objects.ts` (new) | `queuePendingObjects`, `deletePendingObjects` |
| `apps/server/src/purge/purge-item.ts` (new) | `purgeItem` |
| `apps/server/src/purge/purged-lookup.ts` (new) | `purgedIdsAmong`, `purgedResolverFor` |
| `apps/server/src/purge/survivors.ts` (new) | `collectSurvivors`, `rederiveSurvivors` |
| `apps/server/src/projections/notes.ts`, `note-search.ts`, `proj-invites.ts`, `search/embed-worker.ts` | survivors read `purged_entities` |
| `apps/server/src/purge/check-purged.ts` (new) + `ingest/ingest-service.ts` | the door refusal, both doors |
| `apps/server/src/purge/sweep.ts` (new) | `runPurgeSweep`, `dueCandidates` |
| `apps/server/src/ops/prune-backups.ts` (new) | `pruneBackups`, `backupRetentionDaysFromEnv`, `runThenPrune` |
| `apps/server/src/ops/backup-daemon-main.ts` | the `purge` job; prune after the two backup jobs |
| `deploy/do/app.yaml`, `.env.example`, `docs/runbook.md` | worker env, variables, release notes |
| `apps/server/test/purge/*` (new), `apps/server/test/ops/prune-backups.test.ts` (new), `apps/server/test/deploy/backup-worker-env.test.ts` (new) | tests |

---

### Task 1: Every table has a purge rule — and a guard that proves it

**Files:**
- Create: `apps/server/src/purge/table-rules.ts`, `apps/server/test/purge/table-rules.test.ts`
- Modify: `test-cases/19-trash.md` (new `## 19.9` after `## 19.8 Client contract`), `Features.md` (`## 16`)

**Interfaces:**
- Produces:
  - `type PurgeRule = 'erase' | 'rederive' | 'not-entity-bearing' | 'purge-registry'`
  - `type PurgeTableRule = { rule: PurgeRule; by?: readonly string[]; why: string }`
  - `PURGE_TABLE_RULES: Readonly<Record<string, PurgeTableRule>>`
  - `ENTITY_COLUMN_NAMES: readonly string[]`
  - `workspaceScopedTables(): string[]`: every table other than `events` whose rule is `erase` or `rederive` and whose `by` includes `workspace_id`, sorted. Task 6's workspace purge deletes from each by `workspace_id`.
- The meaning of each rule, fixed here for every later task:
  - `erase`: the set's rows are deleted.
  - `rederive`: the set's rows are deleted, AND surviving rows the erasure touched are re-derived by replaying their surviving events.
  - `not-entity-bearing`: the table holds nothing a workspace owns.
  - `purge-registry`: the purge's own bookkeeping, kept on purpose (Task 4).

The 34 tables were enumerated from `apps/server/migrations/*.sql` at `218a00a9`: every `CREATE TABLE`, the last being `proj_workspaces` in `1790500000000_lifecycle.sql:6`. The spec's "28" (§3) predates the auth, MCP and lifecycle tables. **The guard test is the source of truth, not this list.**

Cases (`## 19.9 Purge — every table has a rule`):

```markdown
- ❌ **19.081 — every base table carrying an entity column (`workspace_id`, `project_id`, `ticket_id`, `note_id`, `entity_id`, `parent_id`, `home_project_id`, `parent_ticket_id`) has an entry in `PURGE_TABLE_RULES`;** control: the same check run against the rules minus `proj_search` names exactly `proj_search`. Mutation: delete the `proj_search` entry — the case reddens naming it.
- ❌ **19.082 — every rule names a table that exists, and every `by` column exists on its table;** control: a rule for a fictitious `proj_gone`, and a `by` of `proj_tickets.ticket_idx`, are each named. Mutation: add `proj_gone: { rule: 'erase', by: ['workspace_id'], why: '…' }`.
- ❌ **19.083 — every base table except `pgmigrations` has a rule, and no entity-bearing table is labelled `not-entity-bearing`;** control: relabelling `proj_tickets` `not-entity-bearing` is named. Mutation: relabel `attachments` `not-entity-bearing`.
```

- [ ] **Step 1: Write the cases.** Under `## 19.8 Client contract` in `test-cases/19-trash.md`, add `## 19.9 Purge — every table has a rule` with the three lines above. Run `node scripts/check-case-ids.mjs` and confirm the id count moved by exactly 3.

- [ ] **Step 2: Write the failing test** `apps/server/test/purge/table-rules.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  ENTITY_COLUMN_NAMES,
  PURGE_TABLE_RULES,
  type PurgeTableRule,
} from '../../src/purge/table-rules.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';

/**
 * Spec §5.5 — every table has a purge rule, and a guard that proves it.
 * Cases 19.081–19.083 (`test-cases/19-trash.md` §19.9).
 *
 * The schema is read from `information_schema` of a freshly MIGRATED database,
 * never from a list in this file: a table added next month must redden this
 * suite without anyone remembering to edit it. Each case carries its own
 * control — the same comparator run against a deliberately broken copy of the
 * rules — so a comparator that can never report anything cannot pass.
 */

type Rules = Readonly<Record<string, PurgeTableRule>>;

let db: TestDatabase;
let tables: string[];
let columns: Array<{ table: string; column: string }>;

beforeAll(async () => {
  db = await createTestDatabase();
  const t = await db.pool.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name <> 'pgmigrations'
      ORDER BY table_name`,
  );
  tables = t.rows.map((row) => row.table_name);
  const c = await db.pool.query<{ table_name: string; column_name: string }>(
    `SELECT table_name, column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = ANY($1::text[])
      ORDER BY table_name, column_name`,
    [tables],
  );
  columns = c.rows.map((row) => ({ table: row.table_name, column: row.column_name }));
}, 60_000);

afterAll(async () => {
  await db.drop();
});

function entityBearing(): string[] {
  const names = new Set<string>(ENTITY_COLUMN_NAMES);
  return [...new Set(columns.filter((c) => names.has(c.column)).map((c) => c.table))].sort();
}

function missing(required: readonly string[], rules: Rules): string[] {
  return required.filter((table) => !Object.hasOwn(rules, table));
}

function stale(rules: Rules): string[] {
  return Object.keys(rules).filter((table) => !tables.includes(table)).sort();
}

function unknownColumns(rules: Rules): string[] {
  const out: string[] = [];
  for (const [table, rule] of Object.entries(rules)) {
    for (const column of rule.by ?? []) {
      if (!columns.some((c) => c.table === table && c.column === column)) out.push(`${table}.${column}`);
    }
  }
  return out.sort();
}

function mislabelled(rules: Rules): string[] {
  return entityBearing().filter((table) => rules[table]?.rule === 'not-entity-bearing');
}

function without(table: string): Rules {
  return Object.fromEntries(Object.entries(PURGE_TABLE_RULES).filter(([name]) => name !== table));
}

describe('19.081 every entity-bearing table has a purge rule', () => {
  it('names no entity-bearing table without a rule, and names proj_search once its rule is removed', () => {
    // Non-emptiness first: a comparator over an empty list passes vacuously.
    expect(entityBearing().length).toBeGreaterThan(20);
    expect(missing(entityBearing(), PURGE_TABLE_RULES)).toEqual([]);
    // CONTROL — the same comparator, one rule removed.
    expect(missing(entityBearing(), without('proj_search'))).toEqual(['proj_search']);
  });
});

describe('19.082 every rule names a table and columns that exist', () => {
  it('reports no stale rule and no unknown by-column, and names a planted one of each', () => {
    expect(stale(PURGE_TABLE_RULES)).toEqual([]);
    expect(unknownColumns(PURGE_TABLE_RULES)).toEqual([]);
    // CONTROL
    expect(
      stale({ ...PURGE_TABLE_RULES, proj_gone: { rule: 'erase', by: ['workspace_id'], why: 'planted' } }),
    ).toEqual(['proj_gone']);
    expect(
      unknownColumns({
        ...PURGE_TABLE_RULES,
        proj_tickets: { rule: 'erase', by: ['ticket_idx'], why: 'planted' },
      }),
    ).toEqual(['proj_tickets.ticket_idx']);
  });
});

describe('19.083 every base table carries a deliberate rule', () => {
  it('has a rule for every base table, and never calls an entity-bearing table not-entity-bearing', () => {
    expect(tables.length).toBeGreaterThan(30);
    expect(missing(tables, PURGE_TABLE_RULES)).toEqual([]);
    expect(mislabelled(PURGE_TABLE_RULES)).toEqual([]);
    // CONTROL
    expect(
      mislabelled({ ...PURGE_TABLE_RULES, proj_tickets: { rule: 'not-entity-bearing', why: 'planted' } }),
    ).toEqual(['proj_tickets']);
  });
});
```

- [ ] **Step 3: Run to see it fail.**

```bash
pnpm turbo run build
cd apps/server && pnpm exec vitest run --no-file-parallelism test/purge/table-rules.test.ts > /tmp/trash2-server.log 2>&1; tail -20 /tmp/trash2-server.log
```

Expected: FAIL. The module `../../src/purge/table-rules.js` does not exist.

- [ ] **Step 4: Implement** `apps/server/src/purge/table-rules.ts`:

```ts
/**
 * Every table in the database, and what a permanent purge does to it (trash
 * series Plan 2; spec `docs/superpowers/specs/2026-09-23-trash-and-purge-design.md`
 * §5.5). The guard in `test/purge/table-rules.test.ts` reads
 * `information_schema` and fails when a table carrying any of
 * `ENTITY_COLUMN_NAMES` — or any base table at all — has no entry here, so a
 * table added later cannot silently keep purged data.
 *
 * The four rules:
 * - `erase` — the erasure set's rows are deleted.
 * - `rederive` — the erasure set's rows are deleted AND surviving rows the
 *   erasure touched are re-derived, by replaying their surviving events through
 *   the owning projection's own `apply` (never by hand-written SQL, which would
 *   drift from what a rebuild produces).
 * - `not-entity-bearing` — the table holds nothing a workspace owns.
 * - `purge-registry` — the purge's own bookkeeping (Task 4), kept on purpose.
 *
 * `by` names the columns that carry an entity id. It is documentation the guard
 * checks (every `by` column must exist), and `workspaceScopedTables()` reads it
 * to find what a workspace purge deletes by `workspace_id`.
 */
export type PurgeRule = 'erase' | 'rederive' | 'not-entity-bearing' | 'purge-registry';

export type PurgeTableRule = {
  rule: PurgeRule;
  by?: readonly string[];
  why: string;
};

/**
 * Spec §5.5 names five columns; the parent columns and the note's home are
 * added because each names an entity a purge can erase (deviation D12).
 */
export const ENTITY_COLUMN_NAMES: readonly string[] = [
  'workspace_id',
  'project_id',
  'ticket_id',
  'note_id',
  'entity_id',
  'parent_id',
  'home_project_id',
  'parent_ticket_id',
];

const AUTH = 'An auth table: a person, not a workspace’s content. Erasing a user is out of scope (spec §9).';

export const PURGE_TABLE_RULES: Readonly<Record<string, PurgeTableRule>> = {
  events: {
    rule: 'erase',
    by: ['workspace_id', 'entity_id'],
    why: 'The ledger. Erased ONLY by purge_ledger (Task 4); a ticket purge redacts each ticket.created in place (spec §5.4).',
  },
  snapshots: {
    rule: 'erase',
    by: ['entity_id'],
    why: 'Per-entity replay bounds; deleted by purge_ledger beside the ledger rows.',
  },
  proj_entity_heads: {
    rule: 'rederive',
    by: ['workspace_id', 'entity_id'],
    why: 'Deleted for the set, then re-derived from the rows that remain (redacted creations, the tombstone) — a rebuild writes a head for each.',
  },
  proj_workflows: { rule: 'erase', by: ['workspace_id'], why: 'Workspace-scoped definitions; go with their workspace.' },
  user: { rule: 'not-entity-bearing', why: AUTH },
  session: { rule: 'not-entity-bearing', why: AUTH },
  account: { rule: 'not-entity-bearing', why: AUTH },
  verification: { rule: 'not-entity-bearing', why: AUTH },
  passkey: { rule: 'not-entity-bearing', why: AUTH },
  proj_memberships: {
    rule: 'erase',
    by: ['workspace_id', 'project_id'],
    why: 'Workspace rows go with the workspace; project rows (project.member_added, filed on the project) go with the project.',
  },
  proj_visibility: {
    rule: 'erase',
    by: ['workspace_id', 'project_id', 'ticket_id', 'parent_id'],
    why: 'One row per ticket; a child is in its parent’s set, so no survivor inherits from an erased row.',
  },
  proj_contested: {
    rule: 'erase',
    by: ['workspace_id', 'ticket_id'],
    why: 'Contests are filed on the ticket; original_event may hold the claim’s content.',
  },
  proj_projects: { rule: 'erase', by: ['workspace_id', 'project_id'], why: 'The project row itself.' },
  proj_invites: {
    rule: 'rederive',
    by: ['workspace_id'],
    why: 'Erased with the workspace; a survivor’s project_ids array drops a purged project (Task 7).',
  },
  invite_tokens: {
    rule: 'erase',
    by: ['invite_id'],
    why: 'Names no entity column, but belongs to an invite that belongs to a workspace; erased with it (Task 6).',
  },
  proj_ticket_types: { rule: 'erase', by: ['workspace_id'], why: 'Workspace-scoped definitions.' },
  proj_tickets: {
    rule: 'erase',
    by: ['workspace_id', 'project_id', 'ticket_id', 'parent_id'],
    why: 'Ticket head state, fields and title claims included.',
  },
  proj_rollups: {
    rule: 'erase',
    by: ['workspace_id', 'project_id', 'parent_ticket_id'],
    why: 'Erased by parent_ticket_id only; a surviving parent’s row stays (Task 7, 19.136).',
  },
  proj_workspace_settings: { rule: 'erase', by: ['workspace_id'], why: 'One row per workspace.' },
  proj_search: {
    rule: 'rederive',
    by: ['workspace_id', 'project_id', 'ticket_id'],
    why: 'Erased for the set; a survivor whose documents chip an erased item is re-derived (Task 7).',
  },
  user_preferences: {
    rule: 'rederive',
    by: ['workspace_id'],
    why: 'Erased with the workspace; listColumns/grouping are keyed by project id and lose a purged project’s key (Task 6).',
  },
  attachments: {
    rule: 'erase',
    by: ['workspace_id', 'ticket_id', 'note_id'],
    why: 'Rows deleted in the transaction; their objects queued in purge_pending_objects (Task 5).',
  },
  notifications: {
    rule: 'erase',
    by: ['workspace_id'],
    why: 'payload->>ticketId and payload.ticketTitle name the ticket; deleted by that key or by workspace.',
  },
  mcp_device_codes: { rule: 'not-entity-bearing', why: 'A person’s device authorisation.' },
  mcp_tokens: { rule: 'not-entity-bearing', why: 'A person’s token.' },
  user_notification_preferences: { rule: 'not-entity-bearing', why: 'A person’s muted kinds.' },
  proj_ticket_comments: { rule: 'erase', by: ['workspace_id', 'ticket_id'], why: 'Comment bodies.' },
  proj_notes: {
    rule: 'rederive',
    by: ['workspace_id', 'note_id', 'home_project_id'],
    why: 'Erased for the set; a surviving note that attached a purged ticket is replayed (Task 7).',
  },
  proj_note_attachments: {
    rule: 'rederive',
    by: ['workspace_id', 'note_id', 'ticket_id'],
    why: 'A link to a purged ticket goes; the note is replayed so a rebuild agrees (Task 7, D8).',
  },
  proj_note_comments: { rule: 'erase', by: ['workspace_id', 'note_id'], why: 'Note comment bodies.' },
  proj_note_search: {
    rule: 'rederive',
    by: ['workspace_id', 'note_id', 'home_project_id'],
    why: 'Erased for the set; a surviving note is re-indexed (Task 7).',
  },
  proj_note_lexemes: {
    rule: 'rederive',
    by: ['workspace_id'],
    why: 'Has no note id: the whole workspace’s lexemes are re-derived from proj_note_search (D3).',
  },
  search_note_chunks: {
    rule: 'rederive',
    by: ['workspace_id', 'note_id'],
    why: 'Erased for the set; a surviving note’s chunks are deleted and the embed worker re-chunks it (Task 7).',
  },
  proj_workspaces: { rule: 'erase', by: ['workspace_id'], why: 'The workspace’s lifecycle row.' },
};

/**
 * The tables a WORKSPACE purge deletes by `workspace_id` (Task 6), derived from
 * the rules so a new workspace-scoped table with a rule is erased with no second
 * edit. `events` is excluded (purge_ledger owns it); a `purge-registry` table is
 * excluded by its rule.
 */
export function workspaceScopedTables(): string[] {
  return Object.entries(PURGE_TABLE_RULES)
    .filter(
      ([table, rule]) =>
        table !== 'events' &&
        (rule.rule === 'erase' || rule.rule === 'rederive') &&
        (rule.by ?? []).includes('workspace_id'),
    )
    .map(([table]) => table)
    .sort();
}
```

- [ ] **Step 5: Run to see it pass** (same command). Expected: `Tests  3 passed (3)`.

- [ ] **Step 6: Flip 19.081–19.083 to ✅, and write the `Features.md` bullet.** Under `## 16. Archive, delete and purge`, add:

```markdown
- ⚙️ **Every table has a purge rule — and a guard that proves it** (`apps/server/src/purge/table-rules.ts`; spec §5.5) — `PURGE_TABLE_RULES` assigns every base table one of `erase`, `rederive` (erase the set, re-derive touched survivors by replay), `not-entity-bearing` or `purge-registry`, with the entity columns (`by`) and a one-line reason. `test/purge/table-rules.test.ts` reads `information_schema` of a freshly migrated database and fails naming any table that carries `workspace_id`/`project_id`/`ticket_id`/`note_id`/`entity_id`/`parent_id`/`home_project_id`/`parent_ticket_id` without a rule, any base table without one (catches `invite_tokens`), any rule naming a missing table or column, and any entity-bearing table labelled `not-entity-bearing`. `workspaceScopedTables()` derives what a workspace purge deletes by `workspace_id`. Cases 19.081–19.083.
```

- [ ] **Step 7: Commit** `Trash 2/Task 1: every table has a purge rule, and a guard (19.081-19.083)`. Then work through the three mutations. For each: apply it, show it red, and restore.

---

### Task 2: The purge vocabulary

**Files:**
- Create: `packages/domain/src/purge.ts`, `packages/domain/test/purge-vocabulary.test.ts`
- Modify:
  - `packages/domain/src/events/lifecycle-events.ts`: add the schema after `purgeUnmarkedPayload`, `:26`.
  - `packages/domain/src/vocabulary.ts`:
    - import it beside the lifecycle imports, `:16-25`;
    - register it after `purge.unmarked`, `:480-485`.
  - `packages/domain/src/system-actors.ts`: after `:40`, and the map at `:54-56`.
  - `packages/domain/src/index.ts`: export `./purge.js` after `./lifecycle.js`, `:47`.
  - `test-cases/19-trash.md`, `Features.md`.

**Interfaces:**
- Consumes: `ISO_DATETIME_REGEX`, `isRealCalendarDatetime`, `ulidString` (`packages/domain/src/envelope.ts:61,73,96`).
- Produces:
  - `purgeCompletedPayload`, which is `z.object({ kind, markedBy, markedAt }).strict()`:
    - `kind: 'workspace' | 'project' | 'ticket' | 'note'`
    - `markedBy`: a ULID
    - `markedAt`: an ISO instant
  - `purge.completed` v1, registered against `['workspace', 'project', 'ticket', 'note']`.
  - `SYSTEM_ACTOR_PURGE = '00000000000000000000SYS0PG'`, named `'Permanent deletion'` in `SYSTEM_ACTOR_NAMES`.
  - `PURGED_REASON`, `PURGE_SERVER_ONLY_REASON`, `PURGED_ITEM_LABEL`.
  - `redactedTicketCreatedPayload(projectId: string): { projectId: string; purged: true }`.
  - `isRedactedTicketCreated(env: Pick<EventEnvelope, 'type' | 'payload'>): boolean`.

The ULID alphabet is `ULID_REGEX = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/` (`packages/domain/src/ids.ts:9`). `S`, `Y`, `P` and `G` are all in it, and the id is 26 characters with a leading `0`.

Cases (`## 19.10 Purge vocabulary`):

```markdown
- ❌ **19.086 — `purge.completed` parses against `workspace`, `project`, `ticket` and `note` with `{ kind, markedBy, markedAt }`, and is refused against `workflow`;** control: `ticket` accepted in the same `it`. Mutation: omit `'note'` from the registration's kinds.
- ❌ **19.087 — the `purge.completed` payload refuses a stranger's field (`title`), a missing `markedAt`, a non-ULID `markedBy` and a `kind` of `workflow`;** control: the exact three-field payload accepted. Mutation: drop `.strict()`.
- ❌ **19.088 — `SYSTEM_ACTOR_PURGE` is a ULID the ingest door can accept, is named `Permanent deletion` in `SYSTEM_ACTOR_NAMES`, and `isSystemActor` says so;** control: `'00000000000000000000SYS0PI'` (an `I`) fails `ULID_REGEX`. Mutation: spell the constant `…SYS0PI`.
- ❌ **19.089 — `PURGED_REASON`, `PURGE_SERVER_ONLY_REASON` and `PURGED_ITEM_LABEL` are the exact strings in Global Constraints;** control: `PURGED_REASON` differs from Plan 1's `WORKSPACE_DELETED_REASON` (a deleted item and an erased one are different sentences). Mutation: `PURGED_ITEM_LABEL = 'Deleted'`.
- ❌ **19.090 — `isRedactedTicketCreated` is true for `ticket.created` with `{ projectId, purged: true }` and false for an ordinary `ticket.created`, for `purged: 'true'` (a string), and for `{ purged: true }` on `ticket.field_set`;** control: `redactedTicketCreatedPayload(p)` satisfies it. Mutation: test `'purged' in payload` instead of `payload.purged === true`.
```

- [ ] **Step 1: Write the cases** under a new `## 19.10 Purge vocabulary`. Confirm the case-id count moved by 5.

- [ ] **Step 2: Write the failing test** `packages/domain/test/purge-vocabulary.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  isRedactedTicketCreated,
  isSystemActor,
  newUlid,
  parseEvent,
  purgeCompletedPayload,
  PURGE_SERVER_ONLY_REASON,
  PURGED_ITEM_LABEL,
  PURGED_REASON,
  redactedTicketCreatedPayload,
  SYSTEM_ACTOR_NAMES,
  SYSTEM_ACTOR_PURGE,
  ULID_REGEX,
} from '../src/index.js';

/** Trash series Plan 2, Task 2. Cases 19.086–19.090 (`test-cases/19-trash.md` §19.10). */

const base = (type: string, kind: string, payload: unknown) => ({
  id: newUlid(),
  version: 1,
  origin: 'server',
  clientTime: '2026-09-28T10:00:00.000Z',
  actorId: SYSTEM_ACTOR_PURGE,
  workspaceId: newUlid(),
  entity: { kind, id: newUlid() },
  type,
  payload,
});

const completed = (kind: string) => ({ kind, markedBy: newUlid(), markedAt: '2026-09-13T10:00:00.000Z' });

describe('19.086 purge.completed is filed against the four purgeable kinds', () => {
  it.each(['workspace', 'project', 'ticket', 'note'])('%s accepted', (kind) => {
    expect(parseEvent(base('purge.completed', kind, completed(kind))).ok).toBe(true);
  });
  it('workflow refused; ticket accepted (control)', () => {
    const refused = parseEvent(base('purge.completed', 'workflow', completed('ticket')));
    expect(refused.ok).toBe(false);
    expect(!refused.ok && refused.code).toBe('entity-kind-mismatch');
    expect(parseEvent(base('purge.completed', 'ticket', completed('ticket'))).ok).toBe(true);
  });
});

describe('19.087 the purge.completed payload is exactly { kind, markedBy, markedAt }', () => {
  it('refuses a stranger field, a missing markedAt, a non-ULID markedBy and an unknown kind', () => {
    const good = completed('ticket');
    expect(purgeCompletedPayload.safeParse(good).success).toBe(true);
    expect(purgeCompletedPayload.safeParse({ ...good, title: 'Invoice' }).success).toBe(false);
    const { markedAt: _dropped, ...noMarkedAt } = good;
    expect(purgeCompletedPayload.safeParse(noMarkedAt).success).toBe(false);
    expect(purgeCompletedPayload.safeParse({ ...good, markedBy: 'kiro' }).success).toBe(false);
    expect(purgeCompletedPayload.safeParse({ ...good, kind: 'workflow' }).success).toBe(false);
  });
});

describe('19.088 SYSTEM_ACTOR_PURGE is a reserved, named ULID', () => {
  it('matches ULID_REGEX, is named, and is a system actor; one letter outside the alphabet is not a ULID', () => {
    expect(ULID_REGEX.test(SYSTEM_ACTOR_PURGE)).toBe(true);
    expect(SYSTEM_ACTOR_NAMES.get(SYSTEM_ACTOR_PURGE)).toBe('Permanent deletion');
    expect(isSystemActor(SYSTEM_ACTOR_PURGE)).toBe(true);
    // CONTROL — the predicate can say no.
    expect(ULID_REGEX.test('00000000000000000000SYS0PI')).toBe(false);
  });
});

describe('19.089 the purge copy is exact', () => {
  it('pins the three strings', () => {
    expect(PURGED_REASON).toBe('This item was permanently deleted.');
    expect(PURGE_SERVER_ONLY_REASON).toBe('Only the permanent-deletion sweep can record a purge.');
    expect(PURGED_ITEM_LABEL).toBe('Deleted item');
    // CONTROL — an erased item is not a deleted one (Plan 1's sentence).
    expect(PURGED_REASON).not.toBe(
      'This workspace is deleted. Restore it from Deleted items on your Account page first.',
    );
  });
});

describe('19.090 isRedactedTicketCreated recognises only the redacted creation', () => {
  it('is true for the redacted shape and false for its near misses', () => {
    const projectId = newUlid();
    expect(isRedactedTicketCreated({ type: 'ticket.created', payload: { projectId, purged: true } })).toBe(true);
    expect(isRedactedTicketCreated({ type: 'ticket.created', payload: redactedTicketCreatedPayload(projectId) })).toBe(true);
    expect(
      isRedactedTicketCreated({
        type: 'ticket.created',
        payload: { typeId: 'task', projectId, parentId: null, title: 'Invoice' },
      }),
    ).toBe(false);
    expect(isRedactedTicketCreated({ type: 'ticket.created', payload: { projectId, purged: 'true' } })).toBe(false);
    expect(isRedactedTicketCreated({ type: 'ticket.field_set', payload: { purged: true } })).toBe(false);
    expect(isRedactedTicketCreated({ type: 'ticket.created', payload: null })).toBe(false);
  });
});
```

- [ ] **Step 3: Run to see it fail.** Run `pnpm turbo run build`, then `cd packages/domain && pnpm exec vitest run --no-file-parallelism test/purge-vocabulary.test.ts > /tmp/trash2-domain.log 2>&1; tail -20 /tmp/trash2-domain.log`. Expected: FAIL. `SYSTEM_ACTOR_PURGE` and the other new names are not exported.

- [ ] **Step 4: Implement.** Create `packages/domain/src/purge.ts`:

```ts
import type { EventEnvelope } from './envelope.js';

/**
 * The purge's shared vocabulary (trash series Plan 2; spec §5.3, §5.4, §5.6,
 * §5.7). Domain-level because the server door (Plan 2), the replica (Plan 3) and
 * the renderer (Plan 3) all speak it.
 */

/** The door's answer for any claim about an erased item (spec §5.7). */
export const PURGED_REASON = 'This item was permanently deleted.';

/** The door's answer for a `purge.completed` submitted by anyone but the purge. */
export const PURGE_SERVER_ONLY_REASON = 'Only the permanent-deletion sweep can record a purge.';

/** What a chip to an erased item renders as, in search text now and on screen in Plan 3 (spec §5.6). */
export const PURGED_ITEM_LABEL = 'Deleted item';

/**
 * The payload a purged ticket's `ticket.created` is REDACTED to (spec §5.4). The
 * row is kept, not deleted, so `row_number() OVER (PARTITION BY
 * payload->>'projectId' ORDER BY workspace_seq)` (`apps/server/src/read/
 * ticket-numbers.ts`) still counts it and no later ticket is renumbered.
 * `purge_ledger` builds the same object in SQL; the trigger accepts nothing else.
 */
export function redactedTicketCreatedPayload(projectId: string): { projectId: string; purged: true } {
  return { projectId, purged: true };
}

/**
 * True exactly for a redacted `ticket.created`. Every replay reader of
 * `ticket.created` asks this FIRST and produces no ticket from it — the payload
 * no longer satisfies `ticketCreatedPayload` (no `typeId`, `parentId`, `title`).
 * `=== true`, not truthiness: the flag is written by one SQL statement as a JSON
 * boolean, and anything else is not that statement's row.
 */
export function isRedactedTicketCreated(env: Pick<EventEnvelope, 'type' | 'payload'>): boolean {
  if (env.type !== 'ticket.created') return false;
  const payload = env.payload;
  if (payload === null || typeof payload !== 'object') return false;
  return (payload as { purged?: unknown }).purged === true;
}
```

In `packages/domain/src/events/lifecycle-events.ts`:
- change the import line to `import { z } from 'zod';` plus `import { ISO_DATETIME_REGEX, isRealCalendarDatetime, ulidString } from '../envelope.js';`;
- append after `purgeUnmarkedPayload` (`:26`):

```ts
/**
 * The tombstone (spec §5.3): the ONLY trace a purge leaves in the ledger, filed
 * against the purged item's own entity by `SYSTEM_ACTOR_PURGE`. Content-free by
 * construction — `.strict()` refuses a title, a name, a body. `markedBy`/
 * `markedAt` are copied from the item's lifecycle row (`purge_marked_by`,
 * `purge_marked_at`) inside the purge transaction, never computed.
 */
export const purgeCompletedPayload = z
  .object({
    kind: z.enum(['workspace', 'project', 'ticket', 'note']),
    markedBy: ulidString,
    markedAt: z
      .string()
      .regex(ISO_DATETIME_REGEX, 'must be ISO 8601 with at most millisecond precision')
      .refine(isRealCalendarDatetime, 'must be a real calendar datetime'),
  })
  .strict();
```

In `packages/domain/src/vocabulary.ts`:
- add `purgeCompletedPayload,` to the `./events/lifecycle-events.js` import (`:16-25`);
- after the `purge.unmarked` registration (`:480-485`), add:

```ts
domainRegistry.register({
  type: 'purge.completed',
  version: 1,
  entityKind: ['workspace', 'project', 'ticket', 'note'],
  payloadSchema: purgeCompletedPayload,
});
```

In `packages/domain/src/system-actors.ts`, after `SYSTEM_ACTOR_AUTO_CLOSE` (`:40`):

```ts
/**
 * The permanent-deletion sweep (trash series Plan 2, spec §5.3). The tombstone
 * `purge.completed` is filed under this id for the reason `SYSTEM_ACTOR_AUTO_CLOSE`
 * gives above: the erasure is nobody's act at the moment it runs — the person who
 * MARKED the item is recorded in the payload's `markedBy`, and naming them as the
 * actor of an erasure that runs after the purge delay would put an act in their
 * mouth. Case 19.088
 * pins the match against `ULID_REGEX`.
 */
export const SYSTEM_ACTOR_PURGE = '00000000000000000000SYS0PG';
```

And change the map (`:54-56`) to:

```ts
export const SYSTEM_ACTOR_NAMES: ReadonlyMap<string, string> = new Map([
  [SYSTEM_ACTOR_AUTO_CLOSE, 'Auto-close'],
  [SYSTEM_ACTOR_PURGE, 'Permanent deletion'],
]);
```

Update the map's docblock sentence "`SYSTEM_ACTOR_AUTO_CLOSE` is the only entry today" (`:50`) so it names both entries.

In `packages/domain/src/index.ts`, after `export * from './lifecycle.js';` (`:47`), add `export * from './purge.js';`.

- [ ] **Step 5: Run to see it pass** (same command). Expected: all describes green. Then run the whole domain suite once: `cd packages/domain && pnpm exec vitest run --no-file-parallelism > /tmp/trash2-domain.log 2>&1; tail -20 /tmp/trash2-domain.log`. A duplicate `type@version` registration throws at import.

- [ ] **Step 6: Flip 19.086–19.090 to ✅, and write the `Features.md` bullet:**

```markdown
- ⚙️ **The purge vocabulary** (`packages/domain/src/purge.ts`, `events/lifecycle-events.ts`, `system-actors.ts`) — `purge.completed` v1, the tombstone, `.strict()` `{ kind, markedBy, markedAt }` filed against the purged item's own kind (workspace, project, ticket, note) by the reserved actor `SYSTEM_ACTOR_PURGE = '00000000000000000000SYS0PG'` ("Permanent deletion"). `PURGED_REASON` ("This item was permanently deleted."), `PURGE_SERVER_ONLY_REASON`, `PURGED_ITEM_LABEL` ("Deleted item"), and the redacted `ticket.created` shape `{ projectId, purged: true }` with its one predicate `isRedactedTicketCreated`. Cases 19.086–19.090.
```

- [ ] **Step 7: Commit** `Trash 2/Task 2: purge vocabulary (19.086-19.090)`. Then work through the mutations: mutate, show red, restore.

---

### Task 3: Redacted `ticket.created` rows replay — the readers that would break

This task comes before the purge core so that every later task can run `verifyProjections` over a ledger that holds redacted rows.

**Files:**
- Create: `apps/server/test/purge/world.ts` (the shared world helpers; Tasks 4–10 extend it), `apps/server/test/purge/redacted-row.test.ts`, `packages/domain/test/ticket-state-redacted.test.ts`
- Modify:
  - `packages/domain/src/ticket-state.ts`: the guard at the top of `applyTicketEvent` (`:117-122`); add `foldTicketEvent` after it.
  - `apps/server/src/projections/tickets.ts`: after the `TICKET_EVENT_TYPES` guard, `:558-560`.
  - `apps/server/src/projections/proj-visibility.ts`: the `ticket.created` arm, `:239-240`.
  - `apps/server/src/projections/search.ts`: the `ticket.created` arm, `:57-86`.
  - `apps/server/src/sync/snapshot-writer.ts`: the fold, `:81-84`.
  - `test-cases/19-trash.md`, `Features.md`.

**Interfaces:**
- Consumes: `isRedactedTicketCreated`, `redactedTicketCreatedPayload`, `SYSTEM_ACTOR_PURGE` (Task 2).
- Produces:
  - `foldTicketEvent(state: TicketState | undefined, env: EventEnvelope, deps: TicketStateDeps): TicketState | undefined`. It returns `state` unchanged for a redacted row, and is `applyTicketEvent` otherwise.
  - `applyTicketEvent` itself throws `applyTicketEvent: ticket.created for ticket <id> is a purged (redacted) row — fold with foldTicketEvent, which produces no ticket from it` (D7).
  - World helpers in `apps/server/test/purge/world.ts`: `TYPE_ID`, `Base`, `ev`, `seedWorkspace`, `projectCreated`, `ticketCreated`, `noteCreated`, `doc`, `text`, `ticketRef`.

**The readers, enumerated.** Every server reader that can meet a redacted row was found by `git grep -n "ticketCreatedPayload\|'ticket.created'" -- apps/server/src packages/domain/src packages/rule-engine/src` at `218a00a9`:

| Reader | What it does today with `{ projectId, purged: true }` | This task |
|---|---|---|
| `ticket-state.ts:122-123` (`applyTicketEvent`) | `ticketCreatedPayload.parse` throws a ZodError | named throw; `foldTicketEvent` skips |
| `projections/tickets.ts:568` | calls `applyTicketEvent` → throws | skip before `current` is read |
| `projections/proj-visibility.ts:239-240` | `.parse` throws | skip |
| `projections/search.ts:74-85` | inserts `title = undefined` into `NOT NULL DEFAULT ''` → violation | skip |
| `sync/snapshot-writer.ts:81-84` (`foldTicketHead`) | `applyTicketEvent` → throws | `foldTicketEvent` |
| `projections/rollups.ts:412` → `recomputeParentOf` (`:273-282`) | reads `proj_tickets`; a missing row is a no-op | none — tolerant (19.096's verify is the witness) |
| `read/ticket-numbers.ts:104-114` | counts by `payload->>'projectId'`, which the redacted row keeps | none — the point (19.096) |
| `permissions/check-permission.ts:913-914,1155,1366` | door-time readers of a SUBMITTED event, or a lookup on a ticket the Task 8 door already refused | none |
| `auto-close/sweep.ts:181`, `notifications/sweep.ts:259`, `read/state-provenance.ts:63`, `read/assigned-provenance.ts:111` | join through `proj_tickets` or read `payload->>'assigneeId'`; a purged ticket has no `proj_tickets` row | none |

The client readers are Plan 3's (D7): `packages/sync-client/src/replica/replica.ts:921` (`refoldTicket`) and `precheck/local-context.ts:151`. The replica key counter that spec §3 cites (`replica-data-source.ts:1495`, read at `3377b10c`) is not on this tree. The replica holds no per-project number and answers an empty key (`packages/app-core/src/replica/replica-data-source.ts:862-872`), so there is no client-side counter to keep stable yet.

Cases (`## 19.11 Redacted ticket creations replay`):

```markdown
- ❌ **19.091 — `applyTicketEvent` on a redacted `ticket.created` throws the named purged-row error (not a ZodError), and `foldTicketEvent` returns the input state (`undefined`) for it;** control: `foldTicketEvent` folds an ordinary creation into a state whose title claim is the payload's. Mutation: make `foldTicketEvent` delegate without the redaction check.
- ❌ **19.092 — `ticketsProjection` applied to a redacted row writes no `proj_tickets` row and does not throw;** control: an ordinary creation in the same workspace has its row. Mutation: remove the skip in `projections/tickets.ts`.
- ❌ **19.093 — `projVisibility` applied to a redacted row writes no `proj_visibility` row;** control: the ordinary ticket's row exists. Mutation: remove the skip in `proj-visibility.ts`.
- ❌ **19.094 — `searchProjection` applied to a redacted row writes no `proj_search` row;** control: the ordinary ticket's row carries its title. Mutation: remove the skip in `search.ts`.
- ❌ **19.095 — `foldTicketHead` for a ticket whose stream is `[redacted ticket.created, purge.completed]` returns `null`;** control: the ordinary ticket folds to a state with its title. Mutation: fold with `applyTicketEvent` in `snapshot-writer.ts`.
- ❌ **19.096 — a redacted row keeps its key slot: the ticket created after it in the same project is numbered 3, not 2, and `verifyProjections` over a ledger holding redacted rows is clean;** control: the ticket created before it is numbered 1. Mutation: add `AND NOT (payload ? 'purged')` to `ticketNumbers`' `WHERE`.
```

- [ ] **Step 1: Write the cases** under `## 19.11 Redacted ticket creations replay`. Confirm the case-id count moved by 6.

- [ ] **Step 2: Create the shared world helpers** `apps/server/test/purge/world.ts`:

```ts
import type { Pool } from 'pg';
import { membershipId, newUlid, type EntityKind, type LedgerEvent } from '@gisik-nokma/domain';
import { applyCommitted, makeCommitted } from '../helpers/apply.js';

/**
 * Worlds for the purge suites (trash series Plan 2). Every world mints its own
 * workspace and ids, so worlds share a database without reading each other's
 * rows — `events` is append-only and no suite here truncates it. Events are
 * applied with `applyCommitted` (insert + every registered projection, no
 * engine), which is how every projection suite in this repo seeds.
 */

export const TYPE_ID = 'purge-task';

export type Base = { WS: string; OWNER: string; workflowId: string };

export function ev(
  base: Pick<Base, 'WS' | 'OWNER'>,
  kind: EntityKind,
  id: string,
  type: string,
  payload: unknown,
  actorId: string = base.OWNER,
): LedgerEvent {
  return makeCommitted({ workspaceId: base.WS, entity: { kind, id }, type, payload, actorId });
}

/** A workspace with one workflow, one ticket type and its owner's membership. */
export async function seedWorkspace(pool: Pool, owner: string = newUlid()): Promise<Base> {
  const WS = newUlid();
  const workflowId = newUlid();
  const base: Base = { WS, OWNER: owner, workflowId };
  await applyCommitted(pool, [
    ev(base, 'workspace', WS, 'workspace.created', { name: 'Purge world' }),
    ev(base, 'workflow', workflowId, 'workflow.defined', {
      id: workflowId,
      version: 1,
      name: 'Basic',
      initialStateId: 'todo',
      states: [
        { id: 'todo', name: 'To do', category: 'open' },
        { id: 'done', name: 'Done', category: 'terminal' },
      ],
      transitions: [{ from: 'todo', to: 'done', rules: [] }],
    }),
    ev(base, 'ticket-type', newUlid(), 'ticket-type.defined', {
      id: TYPE_ID,
      name: 'Task',
      icon: 'check',
      rank: 1,
      workflowId,
      fields: [],
    }),
    ev(base, 'membership', membershipId(WS, owner), 'membership.granted', { userId: owner, role: 'owner' }),
  ]);
  return base;
}

export function projectCreated(base: Base, projectId: string, name: string, prefix: string): LedgerEvent {
  return ev(base, 'project', projectId, 'project.created', { name, prefix });
}

export function ticketCreated(
  base: Base,
  ticketId: string,
  projectId: string,
  title: string,
  parentId: string | null = null,
): LedgerEvent {
  return ev(base, 'ticket', ticketId, 'ticket.created', { typeId: TYPE_ID, projectId, parentId, title });
}

export function noteCreated(base: Base, noteId: string, payload: Record<string, unknown>): LedgerEvent {
  return ev(base, 'note', noteId, 'note.created', payload);
}

export const text = (value: string) => ({ type: 'text', text: value });

export const doc = (...inline: unknown[]) => ({ type: 'doc', content: [{ type: 'paragraph', content: inline }] });

/** A `ticketRef` chip exactly as `packages/editor/src/extensions/ticket-ref.ts:64-86` stores it. */
export const ticketRef = (ticketId: string, projectId: string, key: string, title: string) => ({
  type: 'ticketRef',
  attrs: { ticketId, projectId, key, title },
});
```

- [ ] **Step 3: Write the failing tests.** First the domain test, `packages/domain/test/ticket-state-redacted.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  applyTicketEvent,
  builtinTicketTypeDefs,
  foldTicketEvent,
  makeEnvelope,
  newUlid,
  redactedTicketCreatedPayload,
  simpleKanbanWorkflowDef,
  type TicketStateDeps,
} from '../src/index.js';

/** Trash series Plan 2, Task 3 — case 19.091 (`test-cases/19-trash.md` §19.11). */

const workflow = simpleKanbanWorkflowDef(newUlid());
const types = builtinTicketTypeDefs(workflow.id);
const deps: TicketStateDeps = {
  getTicketType: (id) => types.find((type) => type.id === id),
  getWorkflow: (id) => (id === workflow.id ? workflow : undefined),
};

describe('19.091 a redacted ticket.created produces no ticket', () => {
  it('applyTicketEvent names the purged row; foldTicketEvent returns the input state; an ordinary creation still folds', () => {
    const redacted = makeEnvelope({
      type: 'ticket.created',
      entity: { kind: 'ticket', id: newUlid() },
      payload: redactedTicketCreatedPayload(newUlid()),
    });
    expect(() => applyTicketEvent(undefined, redacted, deps)).toThrow(/purged \(redacted\) row/);
    expect(foldTicketEvent(undefined, redacted, deps)).toBeUndefined();

    // CONTROL — the same helper folds an ordinary creation.
    const ordinary = makeEnvelope({
      type: 'ticket.created',
      entity: { kind: 'ticket', id: newUlid() },
      payload: { typeId: 'task', projectId: newUlid(), parentId: null, title: 'Reconcile the till' },
    });
    expect(foldTicketEvent(undefined, ordinary, deps)?.fields['title']?.value).toBe('Reconcile the till');
  });
});
```

Then the server test, `apps/server/test/purge/redacted-row.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  newUlid,
  redactedTicketCreatedPayload,
  SYSTEM_ACTOR_PURGE,
  type LedgerEvent,
} from '@gisik-nokma/domain';
import { insertEvent } from '../../src/ledger/event-store.js';
import { entityHeadsProjection } from '../../src/projections/entity-heads.js';
import { buildProjectionRegistry } from '../../src/projections/index.js';
import { projVisibility } from '../../src/projections/proj-visibility.js';
import type { Projection } from '../../src/projections/registry.js';
import { searchProjection } from '../../src/projections/search.js';
import { ticketsProjection } from '../../src/projections/tickets.js';
import { ticketNumbers } from '../../src/read/ticket-numbers.js';
import { buildLedgerDeps } from '../../src/sync/ledger-deps.js';
import { foldTicketHead } from '../../src/sync/snapshot-writer.js';
import { verifyProjections } from '../../src/tools/verify-projections.js';
import { applyCommitted, makeCommitted, resetEntitySeqs } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { projectCreated, seedWorkspace, ticketCreated, type Base } from './world.js';

/**
 * Spec §5.4 — "every reader of `ticket.created` payloads … must accept the
 * redacted shape and produce no ticket from it". Cases 19.092–19.096
 * (`test-cases/19-trash.md` §19.11).
 *
 * The redacted row X is PLANTED with `insertEvent` (the trigger guards UPDATE
 * and DELETE, never INSERT), plus its entity-head row, so the live tables hold
 * exactly what a rebuild derives. Each case then applies X through ONE
 * projection, so a missing skip reddens its own case rather than the whole file.
 * 19.096 runs `verifyProjections` over the whole database, so it goes last.
 */

let db: TestDatabase;
let base: Base;
const P = newUlid();
const Y1 = newUlid();
const X = newUlid();
const Y2 = newUlid();
let redacted: LedgerEvent;

async function plant(event: LedgerEvent): Promise<void> {
  const client = await db.pool.connect();
  try {
    await insertEvent(client, event);
    await entityHeadsProjection.apply(event, client);
  } finally {
    client.release();
  }
}

async function applyOne(projection: Projection, event: LedgerEvent): Promise<void> {
  const client = await db.pool.connect();
  try {
    await projection.apply(event, client);
  } finally {
    client.release();
  }
}

async function count(table: string, key: string, id: string): Promise<number> {
  const { rows } = await db.pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table} WHERE ${key} = $1`, [
    id,
  ]);
  return rows[0]?.n ?? 0;
}

beforeAll(async () => {
  db = await createTestDatabase();
  resetEntitySeqs();
  base = await seedWorkspace(db.pool);
  await applyCommitted(db.pool, [projectCreated(base, P, 'Redaction', 'RD'), ticketCreated(base, Y1, P, 'Before')]);
  redacted = makeCommitted({
    workspaceId: base.WS,
    entity: { kind: 'ticket', id: X },
    type: 'ticket.created',
    payload: redactedTicketCreatedPayload(P),
    actorId: base.OWNER,
  });
  await plant(redacted);
  await applyCommitted(db.pool, [ticketCreated(base, Y2, P, 'After')]);
  await plant(
    makeCommitted({
      workspaceId: base.WS,
      entity: { kind: 'ticket', id: X },
      type: 'purge.completed',
      payload: { kind: 'ticket', markedBy: base.OWNER, markedAt: '2026-08-20T09:00:00.000Z' },
      actorId: SYSTEM_ACTOR_PURGE,
      origin: 'server',
    }),
  );
}, 60_000);

afterAll(async () => {
  await db.drop();
});

describe('19.092 proj_tickets produces no ticket from a redacted creation', () => {
  it('writes no row for X; Y1 has its row', async () => {
    await applyOne(ticketsProjection, redacted);
    expect(await count('proj_tickets', 'ticket_id', X)).toBe(0);
    expect(await count('proj_tickets', 'ticket_id', Y1)).toBe(1);
  });
});

describe('19.093 proj_visibility produces no row from a redacted creation', () => {
  it('writes no row for X; Y1 has its row', async () => {
    await applyOne(projVisibility, redacted);
    expect(await count('proj_visibility', 'ticket_id', X)).toBe(0);
    expect(await count('proj_visibility', 'ticket_id', Y1)).toBe(1);
  });
});

describe('19.094 proj_search produces no row from a redacted creation', () => {
  it('writes no row for X; Y1 is indexed under its title', async () => {
    await applyOne(searchProjection, redacted);
    expect(await count('proj_search', 'ticket_id', X)).toBe(0);
    const { rows } = await db.pool.query<{ title: string }>('SELECT title FROM proj_search WHERE ticket_id = $1', [Y1]);
    expect(rows[0]?.title).toBe('Before');
  });
});

describe('19.095 the snapshot fold produces no head for a redacted ticket', () => {
  it('folds X to null and Y1 to its state', async () => {
    const client = await db.pool.connect();
    try {
      const deps = await buildLedgerDeps(client, base.WS);
      expect(await foldTicketHead(client, X, deps)).toBeNull();
      const y1 = await foldTicketHead(client, Y1, deps);
      expect(y1?.state.fields['title']?.value).toBe('Before');
    } finally {
      client.release();
    }
  });
});

describe('19.096 a redacted creation keeps its key slot, and the ledger still verifies', () => {
  it('numbers Y1 = 1 and Y2 = 3, and verifyProjections is clean', async () => {
    const numbers = await ticketNumbers(db.pool, base.WS, [Y1, Y2]);
    expect(numbers.get(Y1)).toBe(1); // CONTROL
    expect(numbers.get(Y2)).toBe(3);
    const report = await verifyProjections({ pool: db.pool, projections: buildProjectionRegistry() });
    expect(report).toEqual({ clean: true, diffs: [] });
  });
});
```

- [ ] **Step 4: Run to see them fail.**

```bash
pnpm turbo run build
cd packages/domain && pnpm exec vitest run --no-file-parallelism test/ticket-state-redacted.test.ts > /tmp/trash2-domain.log 2>&1; tail -20 /tmp/trash2-domain.log
cd ../../apps/server && pnpm exec vitest run --no-file-parallelism test/purge/redacted-row.test.ts > /tmp/trash2-server.log 2>&1; tail -20 /tmp/trash2-server.log
```

Expected:
- domain: FAIL. `foldTicketEvent` is not exported.
- server:
  - 19.092: a ZodError from `ticketCreatedPayload.parse`;
  - 19.093: a ZodError;
  - 19.094: `null value in column "title"`;
  - 19.095 and 19.096: throw.

- [ ] **Step 5: Implement.** In `packages/domain/src/ticket-state.ts`:
- add `import { isRedactedTicketCreated } from './purge.js';` beside the imports;
- make the first statement of `applyTicketEvent`'s body (before `if (env.type === 'ticket.created')`, `:122`) this:

```ts
  // Trash series Plan 2 (spec §5.4, D7). A purged ticket's creation is kept
  // REDACTED — `{ projectId, purged: true }` — so later keys do not shift. It
  // describes no ticket, and this function's contract is to return one, so it
  // refuses by NAME rather than letting `ticketCreatedPayload.parse` throw a
  // ZodError that reads like a corrupt ledger. Callers that may meet one fold
  // with `foldTicketEvent` below.
  if (isRedactedTicketCreated(env)) {
    throw new Error(
      `applyTicketEvent: ticket.created for ticket ${env.entity.id} is a purged (redacted) row — fold with foldTicketEvent, which produces no ticket from it`,
    );
  }
```

Immediately after `applyTicketEvent`'s closing brace, add:

```ts
/**
 * `applyTicketEvent` for a caller whose state may be absent and whose stream
 * may hold a purged ticket's redacted creation (spec §5.4, D7): that row
 * produces no ticket, so the input state comes back unchanged. Every other event
 * goes to `applyTicketEvent` untouched. A separate function rather than a wider
 * return type on `applyTicketEvent`, because three callers store its result as
 * a definite `TicketState` (`apps/server/src/projections/tickets.ts`,
 * `packages/rule-engine/src/memory-context.ts`,
 * `packages/sync-client/src/precheck/local-context.ts`).
 */
export function foldTicketEvent(
  state: TicketState | undefined,
  env: EventEnvelope,
  deps: TicketStateDeps,
): TicketState | undefined {
  if (isRedactedTicketCreated(env)) return state;
  return applyTicketEvent(state, env, deps);
}
```

In `apps/server/src/projections/tickets.ts`:
- add `isRedactedTicketCreated,` to the `@gisik-nokma/domain` import (`:2-11`);
- directly after the `if (!(TICKET_EVENT_TYPES as readonly string[]).includes(event.type)) { return; }` block (`:558-560`), add:

```ts
    // Trash series Plan 2 (spec §5.4): a purged ticket's REDACTED creation
    // produces no ticket. Skipped before `current` is read, like the two
    // content-free types above — folding it would throw by design (D7).
    if (isRedactedTicketCreated(event)) {
      return;
    }
```

In `apps/server/src/projections/proj-visibility.ts`:
- add `isRedactedTicketCreated,` to the import (`:1-5`);
- make the first statement of `case 'ticket.created': {` (`:239`) this:

```ts
        // Trash series Plan 2 (spec §5.4): a redacted creation has no parent,
        // no audience and no ticket.
        if (isRedactedTicketCreated(event)) {
          return;
        }
```

In `apps/server/src/projections/search.ts`:
- change the import (`:2`) to `import { docToPlainText, isRedactedTicketCreated, type LedgerEvent } from '@gisik-nokma/domain';`;
- make the first statement inside `if (event.type === 'ticket.created') {` (`:57`) this:

```ts
      // Trash series Plan 2 (spec §5.4): a redacted creation has no title to
      // index — and `title` is NOT NULL, so indexing it would throw.
      if (isRedactedTicketCreated(event)) {
        return;
      }
```

In `apps/server/src/sync/snapshot-writer.ts`:
- replace `applyTicketEvent,` with `foldTicketEvent,` in the domain import (`:2-7`);
- replace `state = applyTicketEvent(state, env, deps);` (`:83`) with:

```ts
      // `foldTicketEvent`, not `applyTicketEvent`: a purged ticket's redacted
      // creation produces no state (spec §5.4), and the `state === undefined`
      // return below already means "nothing to snapshot".
      state = foldTicketEvent(state, env, deps);
```

(`snapshot-writer.ts:128,171,185` mention `applyTicketEvent` in docblocks only. Leave them.)

- [ ] **Step 6: Run to see them pass** (same commands). Then run the whole server projection, sync and verify suites:

```bash
cd apps/server && pnpm exec vitest run --no-file-parallelism test/projections test/sync test/verify-projections.test.ts test/proj-tickets.test.ts test/proj-visibility.test.ts > /tmp/trash2-server.log 2>&1; tail -20 /tmp/trash2-server.log
```

- [ ] **Step 7: Flip 19.091–19.096 to ✅, and write the `Features.md` bullet:**

```markdown
- ⚙️ **A redacted `ticket.created` replays to no ticket** (spec §5.4; `packages/domain/src/ticket-state.ts`, `apps/server/src/projections/{tickets,proj-visibility,search}.ts`, `sync/snapshot-writer.ts`) — a purged ticket's creation is kept as `{ projectId, purged: true }` so `ticketNumbers` still counts it and no later key shifts. `applyTicketEvent` refuses it by name; `foldTicketEvent` returns the input state for it (D7). The ticket, visibility and search projections skip it; the snapshot fold uses `foldTicketEvent`; `proj_rollups` and `ticketNumbers` already tolerate it. The client folds switch in Plan 3. Cases 19.091–19.096.
```

- [ ] **Step 8: Commit** `Trash 2/Task 3: redacted ticket.created replays to no ticket (19.091-19.096)`. Then work through the six mutations: mutate, show red, restore.

---

### Task 4: The migration — the registry, the queue, and the one sanctioned ledger path

**Files:**
- Create: `apps/server/migrations/1790600000000_purge-engine.sql`, `apps/server/test/purge/ledger-path.test.ts`
- Modify: `apps/server/src/purge/table-rules.ts` (two entries), `test-cases/19-trash.md`, `Features.md`

**Interfaces:**
- Produces (SQL):
  - `purged_entities(entity_kind text, entity_id text, workspace_id text, purged_at timestamptz, PRIMARY KEY (entity_kind, entity_id))`
  - `purge_pending_objects(object_key text PRIMARY KEY, queued_at timestamptz NOT NULL, attempts integer NOT NULL DEFAULT 0, last_error text NULL)`
  - `purge_erasure_set(p_kind text, p_id text) RETURNS TABLE (set_kind text, set_id text)`
  - `purge_ledger(p_kind text, p_id text) RETURNS TABLE (erased_kind text, erased_id text)`
  - the replaced `events_append_only()`
- The transaction-scoped contract every later task relies on:
  - `purge_ledger` builds `pg_temp.purge_set(set_kind, set_id, purge_key)` with `ON COMMIT DROP`.
  - It sets `gisik.purge = '<kind>:<id>'` with `set_config(…, true)`, so the setting is transaction-local.
  - It deletes the set's `events` and `snapshots` rows. For a `ticket` or `note` purge it first redacts each `ticket.created` in the set in place (a note purge has none).
  - It returns the set.

What the existing schema gives this task:
- The trigger function is shared by a ROW trigger (`BEFORE UPDATE OR DELETE … FOR EACH ROW`) and a STATEMENT trigger (`BEFORE TRUNCATE … FOR EACH STATEMENT`) (`apps/server/migrations/1787841717635_events-and-snapshots.sql:29-41`).
- A statement trigger has no `OLD`. So the new body tests `TG_OP = 'TRUNCATE'` first and raises before it touches `OLD`.
- The three existing refusal messages are pinned by `apps/server/test/migrations.test.ts:149-176`, and they stay byte-identical.

**What SECURITY DEFINER does and does not buy here (measured 2026-09-28, owner-authorised):**
- On the production cluster (PG 16.15), `doadmin` (`rolsuper = false`) can create a `SECURITY DEFINER SET search_path = public` plpgsql function.
- `REVOKE EXECUTE … FROM PUBLIC` works there. The trigger + transaction-local `set_config` pattern works and does not leak past the transaction.
- **But the app connects as `doadmin` too**, the cluster's only user (`deploy/do/app.yaml`'s `DATABASE_URL: ${db.DATABASE_URL}`).
- So `SECURITY DEFINER` provides no privilege separation. The guard is the trigger's membership check, and it guards against CODE PATHS, not against a hostile SQL session. Any session as `doadmin` can drop the trigger.
- The `REVOKE` is kept as hygiene, and case 19.107 pins it.

Cases (`## 19.12 The sanctioned ledger path`):

```markdown
- ❌ **19.100 — outside a purge, `DELETE` and `UPDATE` on `events` still raise `events is append-only: DELETE refused` / `… UPDATE refused`;** control: an `INSERT` in the same transaction succeeds. Mutation: `RETURN OLD` at the top of the new function for `DELETE`.
- ❌ **19.101 — inside a transaction that ran `purge_ledger('ticket', A)`, deleting a row of B (not in A's set) raises;** control: in the same transaction, a row planted on A (in the set) is deletable. Mutation: sanction whenever `gisik.purge` is merely non-empty (spec §8's own mutation).
- ❌ **19.102 — the sanction does not outlive the transaction: after `COMMIT` of a `purge_ledger`, the same connection reads `gisik.purge` as empty, `pg_temp.purge_set` is gone, and deleting the purged ticket's surviving redacted row raises;** control: inside the transaction the setting read `ticket:<id>`. Mutation: `set_config('gisik.purge', …, false)`.
- ❌ **19.103 — the only UPDATE the trigger admits is the exact redaction: inside a purge, rewriting a set member's `ticket.created` to `{ projectId, purged: true, title }` raises, and so does changing its `actor_id`;** control: re-applying the exact redaction to a set member succeeds. Mutation: drop the `NEW.payload = jsonb_build_object(…)` condition.
- ❌ **19.104 — `TRUNCATE events` raises `events is append-only: TRUNCATE refused` even inside a purge;** control: a sanctioned `DELETE` in the same transaction succeeds. Mutation: move the `TG_OP = 'TRUNCATE'` test below the sanction lookup.
- ❌ **19.105 — `purge_erasure_set`: a ticket takes its whole subtree (child and grandchild) and not its sibling; a project takes itself, its tickets (a deleted one included) and its notes, and not a workspace-level note; a note takes itself; a workspace takes every entity in its events and none of another workspace's;** control: the sibling, the workspace-level note and the other workspace are absent. Mutation: drop the recursive arm (only the root ticket).
- ❌ **19.106 — `purge_ledger('ticket', A)` leaves exactly A's subtree's `ticket.created` rows, each `{ projectId, purged: true }`, deletes their other rows and snapshots, and returns the set; `purge_ledger('project', P2)` leaves no row for any member of P2's set;** control: B's snapshot and rows are untouched. Mutation: redact `ticket.created` for a project purge too.
- ❌ **19.107 — both functions are `SECURITY DEFINER` and neither grants EXECUTE to PUBLIC;** control: the same ACL probe reports PUBLIC execute for `events_append_only` (default ACL). Mutation: remove the two `REVOKE` lines.
```

- [ ] **Step 1: Write the cases** under `## 19.12 The sanctioned ledger path`. Confirm the case-id count moved by 8.

- [ ] **Step 2: Write the failing test** `apps/server/test/purge/ledger-path.test.ts`:

```ts
import type { PoolClient } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid, type LedgerEvent } from '@gisik-nokma/domain';
import { insertEvent } from '../../src/ledger/event-store.js';
import { applyCommitted, makeCommitted, resetEntitySeqs } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { ev, noteCreated, projectCreated, seedWorkspace, ticketCreated, type Base } from './world.js';

/**
 * Spec §5.2 / §8 "The trigger" — cases 19.100–19.107
 * (`test-cases/19-trash.md` §19.12).
 *
 * Every probe runs inside `inTx`, which ALWAYS rolls back, so the shared world
 * is unchanged between cases — except 19.102, which must COMMIT a purge to
 * prove the sanction ends with the transaction, and does it on its own ticket Z.
 * This file never runs `verifyProjections`: `purge_ledger` alone (no TypeScript
 * layer) leaves projection rows behind by design; Task 5 is the whole path.
 */

let db: TestDatabase;
let base: Base;
let other: Base;
const P = newUlid();
const A = newUlid();
const A1 = newUlid();
const A2 = newUlid();
const B = newUlid();
const Z = newUlid();
const N = newUlid();
const P2 = newUlid();
const Q = newUlid();
const NP = newUlid();

async function inTx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    return await fn(client);
  } finally {
    await client.query('ROLLBACK').catch(() => {});
    client.release();
  }
}

function plantedOn(ticketId: string): LedgerEvent {
  return makeCommitted({
    workspaceId: base.WS,
    entity: { kind: 'ticket', id: ticketId },
    type: 'ticket.field_set',
    payload: { fieldId: 'title', value: 'planted' },
    actorId: base.OWNER,
  });
}

async function setOf(client: PoolClient | null, kind: string, id: string): Promise<string[]> {
  const run = client ?? db.pool;
  const { rows } = await run.query<{ k: string }>(
    `SELECT set_kind || ':' || set_id AS k FROM purge_erasure_set($1, $2) ORDER BY 1`,
    [kind, id],
  );
  // Sorted in JS, not by SQL `ORDER BY`: the database collation and `Array.prototype.sort`
  // need not agree, and every expectation below is sorted in JS.
  return rows.map((row) => row.k).sort();
}

beforeAll(async () => {
  db = await createTestDatabase();
  resetEntitySeqs();
  base = await seedWorkspace(db.pool);
  await applyCommitted(db.pool, [
    projectCreated(base, P, 'Ledger', 'LG'),
    ticketCreated(base, A, P, 'A'),
    ticketCreated(base, A1, P, 'A1', A),
    ticketCreated(base, A2, P, 'A2', A1),
    ticketCreated(base, B, P, 'B'),
    ticketCreated(base, Z, P, 'Z'),
    noteCreated(base, N, { title: 'N', homeProjectId: '', scope: { mode: 'private' } }),
    projectCreated(base, P2, 'Second', 'SC'),
    ticketCreated(base, Q, P2, 'Q'),
    ev(base, 'ticket', Q, 'ticket.deleted', {}),
    noteCreated(base, NP, { title: 'NP', homeProjectId: P2, scope: { mode: 'project' } }),
  ]);
  for (const ticketId of [A, B]) {
    await db.pool.query(`INSERT INTO snapshots (entity_kind, entity_id, seq, state) VALUES ('ticket', $1, 1, '{}')`, [
      ticketId,
    ]);
  }
  other = await seedWorkspace(db.pool);
  await applyCommitted(db.pool, [projectCreated(other, newUlid(), 'Other', 'OT')]);
}, 60_000);

afterAll(async () => {
  await db.drop();
});

describe('19.100 outside a purge the ledger stays append-only', () => {
  it('refuses DELETE and UPDATE with the existing messages, and still admits an INSERT', async () => {
    await expect(db.pool.query('DELETE FROM events WHERE entity_id = $1', [B])).rejects.toMatchObject({
      message: 'events is append-only: DELETE refused',
    });
    await expect(db.pool.query('UPDATE events SET version = version WHERE entity_id = $1', [B])).rejects.toMatchObject({
      message: 'events is append-only: UPDATE refused',
    });
    // CONTROL — the triggers are BEFORE UPDATE/DELETE/TRUNCATE only.
    await inTx(async (client) => {
      await insertEvent(client, plantedOn(B));
    });
  });
});

describe('19.101 a purge sanctions its own set and nothing else', () => {
  it('refuses a row of B inside A’s purge, and admits a row of A', async () => {
    await inTx(async (client) => {
      await client.query('SELECT * FROM purge_ledger($1, $2)', ['ticket', A]);
      await client.query('SAVEPOINT probe');
      await expect(client.query('DELETE FROM events WHERE entity_id = $1', [B])).rejects.toMatchObject({
        message: 'events is append-only: DELETE refused',
      });
      await client.query('ROLLBACK TO SAVEPOINT probe');
      // CONTROL — a row of the SANCTIONED set is deletable in the same transaction.
      const planted = plantedOn(A);
      await insertEvent(client, planted);
      const deleted = await client.query('DELETE FROM events WHERE id = $1', [planted.id]);
      expect(deleted.rowCount).toBe(1);
    });
  });
});

describe('19.102 the sanction ends with its transaction', () => {
  it('reads the setting inside, and after COMMIT has no setting, no set, and refuses the redacted row', async () => {
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SELECT * FROM purge_ledger($1, $2)', ['ticket', Z]);
      const inside = await client.query<{ v: string | null }>(`SELECT current_setting('gisik.purge', true) AS v`);
      expect(inside.rows[0]?.v).toBe(`ticket:${Z}`); // CONTROL
      await client.query('COMMIT');

      const after = await client.query<{ v: string | null; t: string | null }>(
        `SELECT current_setting('gisik.purge', true) AS v, to_regclass('pg_temp.purge_set')::text AS t`,
      );
      expect(after.rows[0]?.v ?? '').toBe('');
      expect(after.rows[0]?.t).toBeNull();
      await expect(
        client.query(`DELETE FROM events WHERE entity_id = $1 AND type = 'ticket.created'`, [Z]),
      ).rejects.toMatchObject({ message: 'events is append-only: DELETE refused' });
    } finally {
      client.release();
    }
  });
});

describe('19.103 the only sanctioned UPDATE is the exact redaction', () => {
  it('refuses a redaction carrying a title and an actor rewrite, and admits the exact redaction', async () => {
    await inTx(async (client) => {
      await client.query('SELECT * FROM purge_ledger($1, $2)', ['ticket', A]);
      await client.query('SAVEPOINT probe');
      await expect(
        client.query(
          `UPDATE events SET payload = jsonb_build_object('projectId', payload->>'projectId', 'purged', true, 'title', 'kept')
            WHERE entity_id = $1 AND type = 'ticket.created'`,
          [A1],
        ),
      ).rejects.toMatchObject({ message: 'events is append-only: UPDATE refused' });
      await client.query('ROLLBACK TO SAVEPOINT probe');
      await expect(
        client.query(`UPDATE events SET actor_id = $2 WHERE entity_id = $1 AND type = 'ticket.created'`, [
          A1,
          newUlid(),
        ]),
      ).rejects.toMatchObject({ message: 'events is append-only: UPDATE refused' });
      await client.query('ROLLBACK TO SAVEPOINT probe');
      // CONTROL — the exact redaction, re-applied to a set member.
      const redone = await client.query(
        `UPDATE events SET payload = jsonb_build_object('projectId', payload->>'projectId', 'purged', true)
          WHERE entity_id = $1 AND type = 'ticket.created'`,
        [A1],
      );
      expect(redone.rowCount).toBe(1);
    });
  });
});

describe('19.104 TRUNCATE is refused even inside a purge', () => {
  it('refuses TRUNCATE with its message; a sanctioned DELETE in the same transaction succeeds', async () => {
    await inTx(async (client) => {
      await client.query('SELECT * FROM purge_ledger($1, $2)', ['ticket', A]);
      const planted = plantedOn(A);
      await insertEvent(client, planted);
      const deleted = await client.query('DELETE FROM events WHERE id = $1', [planted.id]);
      expect(deleted.rowCount).toBe(1); // CONTROL
      await expect(client.query('TRUNCATE events')).rejects.toMatchObject({
        message: 'events is append-only: TRUNCATE refused',
      });
    });
  });
});

describe('19.105 purge_erasure_set takes what each kind owns', () => {
  it('ticket → subtree; project → tickets and notes; note → itself; workspace → its events’ entities', async () => {
    expect(await setOf(null, 'ticket', A)).toEqual([`ticket:${A}`, `ticket:${A1}`, `ticket:${A2}`].sort());
    expect(await setOf(null, 'ticket', A)).not.toContain(`ticket:${B}`); // CONTROL
    expect(await setOf(null, 'project', P2)).toEqual([`note:${NP}`, `project:${P2}`, `ticket:${Q}`].sort());
    expect(await setOf(null, 'project', P2)).not.toContain(`note:${N}`); // CONTROL
    expect(await setOf(null, 'note', N)).toEqual([`note:${N}`]);
    const { rows } = await db.pool.query<{ k: string }>(
      `SELECT DISTINCT entity_kind || ':' || entity_id AS k FROM events WHERE workspace_id = $1 ORDER BY 1`,
      [other.WS],
    );
    const otherSet = await setOf(null, 'workspace', other.WS);
    expect(otherSet).toEqual(rows.map((row) => row.k).sort());
    expect(otherSet.some((k) => k === `ticket:${A}` || k === `project:${P}`)).toBe(false); // CONTROL
  });
});

describe('19.106 purge_ledger erases the set, redacting ticket creations only for a ticket purge', () => {
  it('keeps exactly the subtree’s redacted creations for a ticket, nothing for a project; returns the set', async () => {
    await inTx(async (client) => {
      const erased = await client.query<{ erased_kind: string; erased_id: string }>(
        'SELECT erased_kind, erased_id FROM purge_ledger($1, $2)',
        ['ticket', A],
      );
      expect(erased.rows.map((row) => `${row.erased_kind}:${row.erased_id}`).sort()).toEqual(
        [`ticket:${A}`, `ticket:${A1}`, `ticket:${A2}`].sort(),
      );
      const left = await client.query<{ type: string; payload: unknown }>(
        `SELECT type, payload FROM events WHERE entity_id = ANY($1::text[]) ORDER BY entity_id`,
        [[A, A1, A2]],
      );
      expect(left.rows).toHaveLength(3);
      for (const row of left.rows) {
        expect(row).toEqual({ type: 'ticket.created', payload: { projectId: P, purged: true } });
      }
      const snaps = await client.query<{ entity_id: string }>(
        `SELECT entity_id FROM snapshots WHERE entity_id = ANY($1::text[]) ORDER BY entity_id`,
        [[A, B]],
      );
      expect(snaps.rows.map((row) => row.entity_id)).toEqual([B]); // CONTROL — B untouched
    });
    await inTx(async (client) => {
      await client.query('SELECT * FROM purge_ledger($1, $2)', ['project', P2]);
      const left = await client.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM events WHERE entity_id = ANY($1::text[])`,
        [[P2, Q, NP]],
      );
      expect(left.rows[0]?.n).toBe(0);
    });
  });
});

describe('19.107 the two functions are SECURITY DEFINER and not executable by PUBLIC', () => {
  it('reports prosecdef and a PUBLIC-free ACL; the same probe sees PUBLIC on a default-ACL function', async () => {
    const probe = async (name: string) => {
      const { rows } = await db.pool.query<{ secdef: boolean; public_exec: boolean }>(
        `SELECT p.prosecdef AS secdef,
                (p.proacl IS NULL OR EXISTS (SELECT 1 FROM unnest(p.proacl) a WHERE a::text LIKE '=%X%')) AS public_exec
           FROM pg_proc p WHERE p.proname = $1`,
        [name],
      );
      return rows[0];
    };
    expect(await probe('purge_ledger')).toEqual({ secdef: true, public_exec: false });
    expect(await probe('purge_erasure_set')).toEqual({ secdef: true, public_exec: false });
    // CONTROL — a function with the default ACL: PUBLIC may execute.
    expect((await probe('events_append_only'))?.public_exec).toBe(true);
  });
});
```

- [ ] **Step 3: Run to see it fail.** Command: `cd apps/server && pnpm exec vitest run --no-file-parallelism test/purge/ledger-path.test.ts > /tmp/trash2-server.log 2>&1; tail -20 /tmp/trash2-server.log`. Expected: FAIL with `function purge_ledger(unknown, unknown) does not exist`. 19.100 passes already: it is the existing behaviour, and it is the control that the replacement keeps it.

- [ ] **Step 4: The migration.** Run `ls apps/server/migrations | tail -3` first. `1790500000000_lifecycle.sql` must be the last entry, and yours must sort after every entry. Match the `-- Up Migration` / `-- Down Migration` markers of `1790500000000_lifecycle.sql`. Create `apps/server/migrations/1790600000000_purge-engine.sql`:

```sql
-- Up Migration
-- Trash series, Plan 2 (spec docs/superpowers/specs/2026-09-23-trash-and-purge-design.md §5.2).
--
-- purged_entities: every erased (kind, id), content-free (deviation D2). Rebuild replays by
-- entity, not by time, so a projection folding a SURVIVING event that names a purged id
-- consults this registry, live and on rebuild alike. It is NOT a projection: never reset.
CREATE TABLE purged_entities (
  entity_kind  text        NOT NULL,
  entity_id    text        NOT NULL,
  workspace_id text        NOT NULL,
  purged_at    timestamptz NOT NULL,
  PRIMARY KEY (entity_kind, entity_id)
);
CREATE INDEX purged_entities_workspace_idx ON purged_entities (workspace_id, entity_kind);
COMMENT ON TABLE purged_entities IS 'Every entity a permanent purge erased: kind, id, workspace, instant. Content-free. Read by the ingest door (refuse), by projections folding surviving references, and by Plan 3''s replica. Never reset, never rebuilt.';

-- purge_pending_objects: attachment object keys whose rows the purge deleted; the objects
-- are deleted AFTER commit and a failure stays queued for the next sweep (spec §5.2).
CREATE TABLE purge_pending_objects (
  object_key text        PRIMARY KEY,
  queued_at  timestamptz NOT NULL,
  attempts   integer     NOT NULL DEFAULT 0,
  last_error text        NULL
);
COMMENT ON TABLE purge_pending_objects IS 'Attachment object keys a purge has orphaned, awaiting deletion from the object store. A row leaves only when its delete succeeded.';

-- The erasure set (spec §5.2), computed from projections. A project also takes every ticket
-- whose ticket.created names it — one purged individually earlier has no proj_tickets row
-- but still has its redacted creation and tombstone (deviation D11).
CREATE FUNCTION purge_erasure_set(p_kind text, p_id text)
RETURNS TABLE (set_kind text, set_id text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT e.entity_kind, e.entity_id FROM events e
   WHERE p_kind = 'workspace' AND e.workspace_id = p_id
  UNION
  SELECT 'project'::text, p_id WHERE p_kind = 'project'
  UNION
  SELECT 'ticket'::text, t.ticket_id FROM proj_tickets t
   WHERE p_kind = 'project' AND t.project_id = p_id
  UNION
  SELECT 'ticket'::text, e.entity_id FROM events e
   WHERE p_kind = 'project' AND e.entity_kind = 'ticket' AND e.type = 'ticket.created'
     AND e.payload->>'projectId' = p_id
  UNION
  SELECT 'note'::text, n.note_id FROM proj_notes n
   WHERE p_kind = 'project' AND n.home_project_id = p_id
  UNION
  SELECT 'ticket'::text, p_id WHERE p_kind = 'ticket'
  UNION
  SELECT 'ticket'::text, s.ticket_id FROM (
    WITH RECURSIVE subtree(ticket_id) AS (
      SELECT t.ticket_id FROM proj_tickets t WHERE p_kind = 'ticket' AND t.ticket_id = p_id
      UNION
      SELECT c.ticket_id FROM proj_tickets c JOIN subtree ON c.parent_id = subtree.ticket_id
    )
    SELECT ticket_id FROM subtree
  ) s
  UNION
  SELECT 'note'::text, p_id WHERE p_kind = 'note';
$$;

-- The ONE sanctioned ledger path (spec §5.2, deviation D1). Builds the transaction-scoped
-- set, sets the transaction-local sanction, then deletes — or, for a ticket purge, redacts
-- each ticket.created in place so later keys do not shift (spec §5.4).
CREATE FUNCTION purge_ledger(p_kind text, p_id text)
RETURNS TABLE (erased_kind text, erased_id text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_key text := p_kind || ':' || p_id;
BEGIN
  IF p_kind NOT IN ('workspace', 'project', 'ticket', 'note') THEN
    RAISE EXCEPTION 'purge_ledger: unknown kind %', p_kind;
  END IF;
  DROP TABLE IF EXISTS pg_temp.purge_set;
  CREATE TEMP TABLE purge_set (
    set_kind  text NOT NULL,
    set_id    text NOT NULL,
    purge_key text NOT NULL,
    PRIMARY KEY (set_kind, set_id)
  ) ON COMMIT DROP;
  INSERT INTO pg_temp.purge_set (set_kind, set_id, purge_key)
    SELECT s.set_kind, s.set_id, v_key FROM purge_erasure_set(p_kind, p_id) s;
  PERFORM set_config('gisik.purge', v_key, true);
  IF p_kind IN ('ticket', 'note') THEN
    UPDATE events e
       SET payload = jsonb_build_object('projectId', e.payload->>'projectId', 'purged', true)
      FROM pg_temp.purge_set s
     WHERE e.entity_kind = s.set_kind AND e.entity_id = s.set_id AND e.type = 'ticket.created';
    DELETE FROM events e
     USING pg_temp.purge_set s
     WHERE e.entity_kind = s.set_kind AND e.entity_id = s.set_id AND e.type <> 'ticket.created';
  ELSE
    DELETE FROM events e
     USING pg_temp.purge_set s
     WHERE e.entity_kind = s.set_kind AND e.entity_id = s.set_id;
  END IF;
  DELETE FROM snapshots sn
   USING pg_temp.purge_set s
   WHERE sn.entity_kind = s.set_kind AND sn.entity_id = s.set_id;
  RETURN QUERY SELECT s.set_kind, s.set_id FROM pg_temp.purge_set s ORDER BY s.set_kind, s.set_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION purge_erasure_set(text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION purge_ledger(text, text) FROM PUBLIC;

-- The append-only trigger, replaced (spec §5.2). TRUNCATE first: the same function backs a
-- STATEMENT trigger, which has no OLD. DELETE is sanctioned only for a row whose
-- (entity_kind, entity_id) is in THIS transaction's purge_set under THIS transaction's key;
-- UPDATE only for that row's ticket.created, and only to the exact redaction. Every refusal
-- keeps the original message.
CREATE OR REPLACE FUNCTION events_append_only() RETURNS trigger AS $$
DECLARE
  v_key text;
  v_sanctioned boolean := false;
BEGIN
  IF TG_OP = 'TRUNCATE' THEN
    RAISE EXCEPTION 'events is append-only: % refused', TG_OP;
  END IF;
  v_key := current_setting('gisik.purge', true);
  IF v_key IS NOT NULL AND v_key <> '' AND to_regclass('pg_temp.purge_set') IS NOT NULL THEN
    EXECUTE 'SELECT EXISTS (SELECT 1 FROM pg_temp.purge_set WHERE set_kind = $1 AND set_id = $2 AND purge_key = $3)'
      INTO v_sanctioned
      USING OLD.entity_kind, OLD.entity_id, v_key;
  END IF;
  IF NOT v_sanctioned THEN
    RAISE EXCEPTION 'events is append-only: % refused', TG_OP;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  IF OLD.type = 'ticket.created'
     AND NEW.payload = jsonb_build_object('projectId', OLD.payload->>'projectId', 'purged', true)
     AND (NEW.id, NEW.workspace_id, NEW.entity_kind, NEW.entity_id, NEW.type, NEW.version, NEW.actor_id,
          NEW.origin, NEW.client_time, NEW.server_time, NEW.seq, NEW.workspace_seq)
         IS NOT DISTINCT FROM
         (OLD.id, OLD.workspace_id, OLD.entity_kind, OLD.entity_id, OLD.type, OLD.version, OLD.actor_id,
          OLD.origin, OLD.client_time, OLD.server_time, OLD.seq, OLD.workspace_seq) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'events is append-only: % refused', TG_OP;
END;
$$ LANGUAGE plpgsql;

-- Down Migration

-- The original body, verbatim (1787841717635_events-and-snapshots.sql:29-33).
CREATE OR REPLACE FUNCTION events_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'events is append-only: % refused', TG_OP;
END;
$$ LANGUAGE plpgsql;
DROP FUNCTION purge_ledger(text, text);
DROP FUNCTION purge_erasure_set(text, text);
DROP TABLE purge_pending_objects;
DROP TABLE purged_entities;
```

The `EXECUTE … USING` is dynamic on purpose. `pg_temp.purge_set` is dropped and re-created per purge, and a static reference inside a cached plpgsql plan would be bound to a relation that no longer exists.

- [ ] **Step 5: Give the two new tables their rules.** Task 1's guard is now red: `purged_entities` carries `workspace_id` and `entity_id` and has no rule. Add these two entries to `PURGE_TABLE_RULES`, after `proj_workspaces`:

```ts
  purged_entities: {
    rule: 'purge-registry',
    by: ['workspace_id', 'entity_id'],
    why: 'The purge’s own registry of erased ids (D2): content-free, read by the door and by projections, never erased.',
  },
  purge_pending_objects: {
    rule: 'purge-registry',
    why: 'Object keys awaiting deletion after a purge; a row leaves when its delete succeeds (Task 5).',
  },
```

- [ ] **Step 6: Run to see it pass.**

```bash
cd apps/server && pnpm exec vitest run --no-file-parallelism test/purge/ledger-path.test.ts test/purge/table-rules.test.ts test/migrations.test.ts > /tmp/trash2-server.log 2>&1; tail -20 /tmp/trash2-server.log
cd ../.. && pnpm check:migrations
```

`test/migrations.test.ts:149-176` must stay green. It pins the three refusal messages outside a purge.

- [ ] **Step 7: Flip 19.100–19.107 to ✅, and write the `Features.md` bullet:**

```markdown
- ⚙️ **The one sanctioned ledger path** (`apps/server/migrations/1790600000000_purge-engine.sql`; spec §5.2, T6) — `purge_ledger(kind, id)` (SECURITY DEFINER, EXECUTE revoked from PUBLIC) computes the erasure set with `purge_erasure_set` (workspace → every entity in its events; project → itself, its tickets including deleted ones and any whose `ticket.created` names it, its notes; ticket → its subtree via `parent_id`; note → itself), fills a transaction-scoped `pg_temp.purge_set` (`ON COMMIT DROP`), sets a transaction-local `gisik.purge`, deletes the set's `events` and `snapshots` rows and, for a ticket purge, REDACTS each `ticket.created` in place to `{ projectId, purged: true }` so later keys do not shift. The replaced `events_append_only()` sanctions a DELETE only for a row in THIS transaction's set under THIS transaction's key, an UPDATE only as that exact redaction, and never a TRUNCATE; every refusal keeps its message. The app connects as the cluster's only user, so the guard is the trigger's check, not a privilege boundary (measured 2026-09-28). New tables `purged_entities` (content-free registry, D2) and `purge_pending_objects`. Cases 19.100–19.107.
```

- [ ] **Step 8: Commit** `Trash 2/Task 4: purge migration — registry, queue, sanctioned ledger path (19.100-19.107)`. Then work through the mutations: mutate, show red, restore. For the migration mutations, edit the `.sql` file: the test database is migrated fresh per suite.

---

### Task 5: `purgeItem` — erasing one ticket

**Files:**
- Create:
  - `apps/server/src/purge/erasure.ts`, `apps/server/src/purge/pending-objects.ts`, `apps/server/src/purge/purge-item.ts`
  - `apps/server/test/purge/scan.ts`, `apps/server/test/purge/purge-ticket.test.ts`
- Modify:
  - `apps/server/test/purge/world.ts`: append the ticket world.
  - `docs/runbook.md`: "Orphaned uploads", `:169-171`. The sentence "There is no `DELETE FROM attachments` anywhere in `apps/server/src`" becomes false in this commit.
  - `test-cases/19-trash.md`, `Features.md`.

**Interfaces:**
- Consumes: `purge_ledger` (Task 4); `lockWorkspace`, `lockEntity`, `nextWorkspaceSeq`, `nextSeq`, `insertEvent`, `rowToEnvelope`, `EventRow` (`apps/server/src/ledger/event-store.ts:8-10,21-27,39-43,50-56,58-79,86-125`); `ObjectStore.delete` (`apps/server/src/attachments/object-store.ts:20`), `ObjectNotFoundError` (`:25-30`); `purgeCompletedPayload`, `SYSTEM_ACTOR_PURGE` (Task 2); `purgeDueAt` (`packages/domain/src/lifecycle.ts:8-10`).
- Produces:
  - `type PurgeTarget = { kind: LifecycleKind; id: string }`
  - `type ErasureSet = { target: PurgeTarget; workspaceId: string; entities: ReadonlyArray<{ kind: string; id: string }>; ticketIds: string[]; noteIds: string[]; projectIds: string[] }`
  - `toErasureSet(target, workspaceId, rows: ReadonlyArray<{ erased_kind: string; erased_id: string }>): ErasureSet`
  - `objectKeysOf(db: PoolClient, set: ErasureSet): Promise<string[]>`
  - `eraseRows(db: PoolClient, set: ErasureSet): Promise<void>`
  - `recordPurged(db: PoolClient, set: ErasureSet, purgedAt: string): Promise<void>`
  - `replayRemaining(db: PoolClient, set: ErasureSet, projections: ProjectionRegistry): Promise<void>`
  - `queuePendingObjects(db: Queryable, keys: readonly string[], now: Date): Promise<void>`
  - `deletePendingObjects(db: Queryable, store: Pick<ObjectStore, 'delete'>, onlyKeys?: readonly string[]): Promise<{ deleted: number; pending: number }>`
  - `type PurgeDeps = { projections: ProjectionRegistry; store: Pick<ObjectStore, 'delete'>; now: Date }`
  - `type PurgeSkipReason = 'already-purged' | 'not-found' | 'not-marked' | 'not-due'`
  - `type PurgeOutcome = { status: 'purged'; target; workspaceId; erased: number; tombstoneId: string; objectsDeleted: number; objectsPending: number } | { status: 'skipped'; target; reason: PurgeSkipReason }`
  - `purgeItem(pool: Pool, target: PurgeTarget, deps: PurgeDeps): Promise<PurgeOutcome>`
  - Test helpers:
    - `scan(pool, needles): Promise<Record<string, number>>`
    - `buildTicketWorld(pool): Promise<TicketWorld>`
    - `dueAt(pool, kind, id): Promise<Date>`
    - `recordingStore(failing?)`
    - `insertAttachment`, `insertNotification`, `insertSnapshot`, `contestOn`, `newMarker`

**The order inside the one transaction, and why each step sits where it does:**
1. `BEGIN`, `isPurged` → `already-purged`.
2. `locate` (the item's `workspace_id`, `purge_marked_at`, `purge_marked_by` from its lifecycle table).
3. `lockWorkspace` then `lockEntity` — the same global order ingest uses (`ingest-service.ts:170-174`). Every ingest into this workspace now waits for the purge.
4. `locate` AGAIN, under the lock. An unmark committed between the first read and the lock is seen here. `purge.unmarked` is refused at the door from the due instant onward (Plan 1, `check-lifecycle.ts`, `PURGE_DUE_REASON`), so a due item cannot be unmarked while the purge runs.
5. **Capture `nextWorkspaceSeq` and the item's `nextSeq` BEFORE anything is deleted.**
   - If the deleted rows held the workspace's highest `workspace_seq`, `MAX+1` after the delete would re-issue a position clients have already seen.
   - The tombstone's per-entity `seq` would likewise reuse a seq a replica may hold.
6. `purge_ledger` → the erasure set.
7. `objectKeysOf`, before the `attachments` rows are deleted.
8. `eraseRows`.
9. `recordPurged` (`purged_entities`), before anything re-derives: the re-derivations read it (Task 7).
10. `replayRemaining`. A rebuild writes a `proj_entity_heads` row for each redacted `ticket.created` that remains, so live must too.
11. The tombstone: `insertEvent`, then every projection's `apply`, exactly as ingest applies an event (`ingest-service.ts:339-358`).
12. `queuePendingObjects`.
13. `COMMIT`.
14. `deletePendingObjects` for this purge's keys. This is best effort, and a failure stays queued (spec §5.2, §7).

Cases (`## 19.13 Purging a ticket`):

```markdown
- ❌ **19.110 — after `purgeItem` on a ticket T with a child C, the only rows anywhere naming T or C are T's and C's redacted `ticket.created`, T's tombstone, their two `proj_entity_heads` rows and their two `purged_entities` rows — no `proj_tickets`, `proj_visibility`, `proj_search`, `proj_ticket_comments`, `proj_contested`, `snapshots`, `attachments` or `notifications` row survives;** control: the sibling S1 keeps its ticket, search, attachment, contest and snapshot rows. Mutation: skip the `proj_visibility` delete in `eraseRows`.
- ❌ **19.111 — the purged ticket's content (a unique marker in its title, description, comment, attachment filename, notification and snapshot) appears in no text, jsonb, array or tsvector column anywhere;** control: before the purge the marker is in `events.payload`, `proj_tickets.fields`, `proj_search.{title,description,comments}`, `proj_ticket_comments.body`, `attachments.filename`, `notifications.payload` and `snapshots.state`. Mutation: skip the `notifications` delete.
- ❌ **19.112 — a later ticket's key is unchanged by the purge: S2 is number 4 before and after;** control: two redacted `ticket.created` rows (T, C) hold the slots. Mutation: have `purge_ledger` delete `ticket.created` for a ticket purge instead of redacting it (spec §8's own mutation).
- ❌ **19.113 — `purge.completed` is the only new event: filed on T by `SYSTEM_ACTOR_PURGE`, origin `server`, `seq` = T's old maximum + 1, `workspace_seq` = the workspace's old maximum + 1, payload `{ kind: 'ticket', markedBy, markedAt }` copied from the lifecycle row;** control: the payload parses with `purgeCompletedPayload`. Mutation: capture `nextWorkspaceSeq` after `purge_ledger` instead of before.
- ❌ **19.114 — `verifyProjections` is clean after ticket purges;** control: `proj_tickets`, `proj_search`, `proj_visibility`, `proj_contested` and `proj_entity_heads` are non-empty. Mutation: skip `replayRemaining`.
- ❌ **19.115 — `purgeItem` skips, never erases, an item not yet due (`now` = due − 1 ms → `not-due`), an unmarked one (`not-marked`), an unknown id (`not-found`) and an erased one (`already-purged`);** control: at exactly the due instant the same ticket is purged. Mutation: compare the due instant with `>=` instead of `>`.
- ❌ **19.116 — the purged ticket's attachment object is deleted from the store after commit, exactly once, and its queue row is gone;** control: the sibling's attachment row and object are untouched. Mutation: collect object keys by `workspace_id` instead of by the set's tickets and notes.
- ❌ **19.117 — a failing object delete leaves the key in `purge_pending_objects` with `attempts = 1` and the error, and the outcome reports it pending; the ledger half is committed regardless;** control: T's events are the redacted creation and the tombstone. Mutation: delete the objects inside the transaction, before `COMMIT`, letting a store error propagate.
```

- [ ] **Step 1: Write the cases** under `## 19.13 Purging a ticket`. Confirm the case-id count moved by 8.

- [ ] **Step 2: The scan helper** `apps/server/test/purge/scan.ts`:

```ts
import type { Pool } from 'pg';

/**
 * The erasure proof's instrument (spec §8: "no row in any table carries an id
 * from the erasure set"). Every text, varchar, jsonb, array and tsvector column
 * of every public base table is cast to text and searched, case-insensitively,
 * for any of `needles`. The column list is read from `information_schema` at
 * call time, so a table added later is scanned without an edit here.
 *
 * Returns `{ 'table.column': rowsMatching }` for every column with at least one
 * match — an exact map the proofs compare with `toEqual`, so an unexpected
 * survivor is a named key, not a count that happens to agree.
 */
const SCANNED_TYPES = new Set(['text', 'character varying', 'jsonb', 'ARRAY', 'tsvector']);

export async function scan(pool: Pool, needles: readonly string[]): Promise<Record<string, number>> {
  const { rows: columns } = await pool.query<{ table_name: string; column_name: string; data_type: string }>(
    `SELECT c.table_name, c.column_name, c.data_type
       FROM information_schema.columns c
       JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name
      WHERE c.table_schema = 'public' AND t.table_type = 'BASE TABLE' AND c.table_name <> 'pgmigrations'
      ORDER BY c.table_name, c.column_name`,
  );
  const patterns = needles.map((needle) => `%${needle}%`);
  const hits: Record<string, number> = {};
  for (const column of columns) {
    if (!SCANNED_TYPES.has(column.data_type)) continue;
    const { rows } = await pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM "${column.table_name}" WHERE "${column.column_name}"::text ILIKE ANY ($1::text[])`,
      [patterns],
    );
    const n = rows[0]?.n ?? 0;
    if (n > 0) hits[`${column.table_name}.${column.column_name}`] = n;
  }
  return hits;
}
```

- [ ] **Step 3: The ticket world.** Append to `apps/server/test/purge/world.ts`. Add `purgeDueAt` to the `@gisik-nokma/domain` import, and add `import { buildContestedClaim } from '../../src/sync/contest-coherence.js';` beside the imports:

```ts
/** A lower-case unique marker: `'simple'` tsvectors lower-case every token, and ILIKE does not care. */
export function newMarker(): string {
  return `zqx${newUlid().toLowerCase()}`;
}

export function uploadPayload(attachmentId: string, filename: string) {
  return { kind: 'upload', attachmentId, filename, mime: 'application/pdf', size: 3, sha256: 'ab'.repeat(32) };
}

/** An `attachments` row as the upload route writes it (`apps/server/migrations/1788356858695_attachments.sql:3-13`). */
export async function insertAttachment(
  pool: Pool,
  base: Base,
  attachmentId: string,
  owner: { ticketId?: string; noteId?: string },
  filename: string,
  objectKey: string,
): Promise<void> {
  await pool.query(
    `INSERT INTO attachments (id, workspace_id, ticket_id, note_id, uploader_id, filename, mime, size, object_key)
     VALUES ($1, $2, $3, $4, $5, $6, 'application/pdf', 3, $7)`,
    [attachmentId, base.WS, owner.ticketId ?? null, owner.noteId ?? null, base.OWNER, filename, objectKey],
  );
}

/** An assignment notification: its payload names the ticket and quotes its title (`packages/domain/src/notifications.ts:51-60`). */
export async function insertNotification(
  pool: Pool,
  base: Pick<Base, 'WS' | 'OWNER'>,
  userId: string,
  ticketId: string,
  ticketTitle: string,
): Promise<void> {
  await pool.query(
    `INSERT INTO notifications (id, user_id, workspace_id, kind, dedupe_key, payload)
     VALUES ($1, $2, $3, 'assignment', $4, $5)`,
    [
      newUlid(),
      userId,
      base.WS,
      `assignment:${ticketId}:${newUlid()}`,
      JSON.stringify({
        ticketId,
        ticketTitle,
        assignedBy: base.OWNER,
        eventId: newUlid(),
        clientTime: '2026-08-20T09:00:00.000Z',
        serverTime: '2026-08-20T09:00:01.000Z',
      }),
    ],
  );
}

export async function insertSnapshot(pool: Pool, ticketId: string, state: unknown): Promise<void> {
  await pool.query(`INSERT INTO snapshots (entity_kind, entity_id, seq, state) VALUES ('ticket', $1, 1, $2)`, [
    ticketId,
    JSON.stringify(state),
  ]);
}

/** A server-origin contest on `ticketId`, built by the one builder the sync door uses. */
export function contestOn(base: Base, ticketId: string): LedgerEvent {
  const contest = buildContestedClaim({
    originalEvent: {
      id: newUlid(),
      workspaceId: base.WS,
      entity: { kind: 'ticket', id: ticketId },
      type: 'ticket.field_set',
      version: 1,
      payload: { fieldId: 'priority', value: 'P1' },
      actorId: base.OWNER,
      origin: 'web',
      clientTime: '2026-08-20T09:00:00.000Z',
    },
    rule: 'workflow.transition-not-allowed',
    reason: 'That move is not allowed from here.',
    actorId: base.OWNER,
  });
  return makeCommitted({
    workspaceId: contest.workspaceId,
    entity: contest.entity,
    type: contest.type,
    payload: contest.payload,
    actorId: contest.actorId,
    origin: 'server',
  });
}

const LIFECYCLE_ROW = {
  workspace: ['proj_workspaces', 'workspace_id'],
  project: ['proj_projects', 'project_id'],
  ticket: ['proj_tickets', 'ticket_id'],
  note: ['proj_notes', 'note_id'],
} as const;

/** The instant the item's mark falls due, from its lifecycle row — never computed from a literal. */
export async function dueAt(pool: Pool, kind: keyof typeof LIFECYCLE_ROW, id: string): Promise<Date> {
  const [table, key] = LIFECYCLE_ROW[kind];
  const { rows } = await pool.query<{ purge_marked_at: Date | null }>(
    `SELECT purge_marked_at FROM ${table} WHERE ${key} = $1`,
    [id],
  );
  const markedAt = rows[0]?.purge_marked_at;
  if (markedAt === undefined || markedAt === null) throw new Error(`dueAt: ${kind} ${id} is not marked`);
  return new Date(purgeDueAt(markedAt.toISOString()));
}

/** An object store that records deletes; a key in `failing` throws. */
export function recordingStore(failing: ReadonlySet<string> = new Set()) {
  const deleted: string[] = [];
  return {
    deleted,
    async delete(key: string): Promise<void> {
      if (failing.has(key)) throw new Error(`boom: ${key}`);
      deleted.push(key);
    },
  };
}

export type TicketWorld = Base & {
  P: string;
  T: string;
  C: string;
  S1: string;
  S2: string;
  keyT: string;
  keyS1: string;
  marker: string;
};

/**
 * A project with T (to be purged: deleted, then marked — the mark is the LAST
 * event of the workspace, which 19.113's seq-capture case depends on), T's child
 * C, a sibling S1 and a later ticket S2. T's content carries `marker` in its
 * title, description, comment, attachment filename, notification and snapshot;
 * S1 has the same shapes without it.
 */
export async function buildTicketWorld(pool: Pool): Promise<TicketWorld> {
  const base = await seedWorkspace(pool);
  const marker = newMarker();
  const P = newUlid();
  const T = newUlid();
  const C = newUlid();
  const S1 = newUlid();
  const S2 = newUlid();
  const attT = newUlid();
  const attS1 = newUlid();
  const keyT = `w/${base.WS}/a/${attT}`;
  const keyS1 = `w/${base.WS}/a/${attS1}`;
  await applyCommitted(pool, [
    projectCreated(base, P, 'Purge', 'PG'),
    ticketCreated(base, T, P, `Invoice ${marker}`),
    ticketCreated(base, C, P, 'Child of the purged', T),
    ticketCreated(base, S1, P, 'Sibling that survives'),
    ticketCreated(base, S2, P, 'A later ticket'),
    ev(base, 'ticket', T, 'ticket.field_set', { fieldId: 'description', value: doc(text(`the ${marker} contract`)) }),
    ev(base, 'ticket', T, 'comment.added', { body: doc(text(`remember ${marker}`)) }),
    ev(base, 'ticket', T, 'attachment.added', uploadPayload(attT, `${marker}.pdf`)),
    ev(base, 'ticket', S1, 'attachment.added', uploadPayload(attS1, 'survivor.pdf')),
    contestOn(base, T),
    contestOn(base, S1),
  ]);
  await insertAttachment(pool, base, attT, { ticketId: T }, `${marker}.pdf`, keyT);
  await insertAttachment(pool, base, attS1, { ticketId: S1 }, 'survivor.pdf', keyS1);
  await insertNotification(pool, base, base.OWNER, T, `Invoice ${marker}`);
  await insertNotification(pool, base, base.OWNER, S1, 'Sibling that survives');
  await insertSnapshot(pool, T, { title: `Invoice ${marker}` });
  await insertSnapshot(pool, S1, { title: 'Sibling that survives' });
  await applyCommitted(pool, [
    ev(base, 'ticket', T, 'ticket.deleted', {}),
    ev(base, 'ticket', T, 'purge.marked', {}),
  ]);
  return { ...base, P, T, C, S1, S2, keyT, keyS1, marker };
}
```

- [ ] **Step 4: Write the failing test** `apps/server/test/purge/purge-ticket.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid, purgeCompletedPayload, SYSTEM_ACTOR_PURGE } from '@gisik-nokma/domain';
import { buildProjectionRegistry } from '../../src/projections/index.js';
import { purgeItem, type PurgeDeps } from '../../src/purge/purge-item.js';
import { ticketNumbers } from '../../src/read/ticket-numbers.js';
import { verifyProjections } from '../../src/tools/verify-projections.js';
import { resetEntitySeqs } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { scan } from './scan.js';
import { buildTicketWorld, dueAt, recordingStore } from './world.js';

/**
 * Spec §5.2–§5.5, §8 "Purge" — erasing one ticket. Cases 19.110–19.117
 * (`test-cases/19-trash.md` §19.13). Each case builds its own world in one
 * shared database; 19.114 verifies the WHOLE database, so it runs last and
 * covers every purge above it.
 */

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
  resetEntitySeqs();
}, 60_000);

afterAll(async () => {
  await db.drop();
});

function deps(now: Date, store = recordingStore()): PurgeDeps {
  return { projections: buildProjectionRegistry(), store, now };
}

async function one<T>(sql: string, params: unknown[]): Promise<T> {
  const { rows } = await db.pool.query(sql, params);
  return rows[0] as T;
}

describe('19.110 nothing keyed by the purged ticket or its child survives', () => {
  it('leaves only the redacted creations, the tombstone, their heads and the registry; the sibling is whole', async () => {
    const w = await buildTicketWorld(db.pool);
    const outcome = await purgeItem(db.pool, { kind: 'ticket', id: w.T }, deps(await dueAt(db.pool, 'ticket', w.T)));
    expect(outcome.status).toBe('purged');
    expect(await scan(db.pool, [w.T, w.C])).toEqual({
      'events.entity_id': 3,
      'proj_entity_heads.entity_id': 2,
      'purged_entities.entity_id': 2,
    });
    // CONTROL — the sibling S1 keeps every row the world gave it.
    expect(await scan(db.pool, [w.S1])).toMatchObject({
      'proj_tickets.ticket_id': 1,
      'proj_search.ticket_id': 1,
      'attachments.ticket_id': 1,
      'proj_contested.ticket_id': 1,
      'snapshots.entity_id': 1,
    });
  });
});

describe('19.111 the purged content is nowhere', () => {
  it('finds the marker in eight columns before and in none after', async () => {
    const w = await buildTicketWorld(db.pool);
    const before = await scan(db.pool, [w.marker]);
    expect(Object.keys(before)).toEqual(
      expect.arrayContaining([
        'events.payload',
        'proj_tickets.fields',
        'proj_search.title',
        'proj_search.description',
        'proj_search.comments',
        'proj_ticket_comments.body',
        'attachments.filename',
        'notifications.payload',
        'snapshots.state',
      ]),
    ); // CONTROL
    await purgeItem(db.pool, { kind: 'ticket', id: w.T }, deps(await dueAt(db.pool, 'ticket', w.T)));
    expect(await scan(db.pool, [w.marker])).toEqual({});
  });
});

describe('19.112 a later ticket keeps its key', () => {
  it('numbers S2 4 before and after; the two redacted creations hold the slots', async () => {
    const w = await buildTicketWorld(db.pool);
    expect((await ticketNumbers(db.pool, w.WS, [w.S2])).get(w.S2)).toBe(4);
    await purgeItem(db.pool, { kind: 'ticket', id: w.T }, deps(await dueAt(db.pool, 'ticket', w.T)));
    expect((await ticketNumbers(db.pool, w.WS, [w.S2])).get(w.S2)).toBe(4);
    const redacted = await one<{ n: number }>(
      `SELECT count(*)::int AS n FROM events
        WHERE workspace_id = $1 AND type = 'ticket.created' AND payload = jsonb_build_object('projectId', $2::text, 'purged', true)`,
      [w.WS, w.P],
    );
    expect(redacted.n).toBe(2); // CONTROL
  });
});

describe('19.113 the tombstone is the only new event, at the captured positions', () => {
  it('files purge.completed on T by the system actor at old max + 1 on both sequences', async () => {
    const w = await buildTicketWorld(db.pool);
    const maxWs = (await one<{ n: number }>('SELECT max(workspace_seq)::int AS n FROM events WHERE workspace_id = $1', [w.WS])).n;
    const maxT = (
      await one<{ n: number }>(`SELECT max(seq)::int AS n FROM events WHERE entity_kind = 'ticket' AND entity_id = $1`, [w.T])
    ).n;
    const idsBefore = (await db.pool.query<{ id: string }>('SELECT id FROM events WHERE workspace_id = $1', [w.WS])).rows.map(
      (row) => row.id,
    );
    const markedAt = (
      await one<{ at: Date }>('SELECT purge_marked_at AS at FROM proj_tickets WHERE ticket_id = $1', [w.T])
    ).at.toISOString();

    const outcome = await purgeItem(db.pool, { kind: 'ticket', id: w.T }, deps(await dueAt(db.pool, 'ticket', w.T)));

    const fresh = await db.pool.query(
      `SELECT id, entity_kind, entity_id, type, actor_id, origin, seq::int AS seq, workspace_seq::int AS workspace_seq, payload
         FROM events WHERE workspace_id = $1 AND NOT (id = ANY($2::text[]))`,
      [w.WS, idsBefore],
    );
    expect(fresh.rows).toEqual([
      {
        id: outcome.status === 'purged' ? outcome.tombstoneId : 'unreachable',
        entity_kind: 'ticket',
        entity_id: w.T,
        type: 'purge.completed',
        actor_id: SYSTEM_ACTOR_PURGE,
        origin: 'server',
        seq: maxT + 1,
        workspace_seq: maxWs + 1,
        payload: { kind: 'ticket', markedBy: w.OWNER, markedAt },
      },
    ]);
    expect(purgeCompletedPayload.safeParse(fresh.rows[0]?.payload).success).toBe(true); // CONTROL
  });
});

describe('19.115 purgeItem skips what is not due, not marked, unknown or already erased', () => {
  it('answers each skip reason, and purges at exactly the due instant', async () => {
    const w = await buildTicketWorld(db.pool);
    const due = await dueAt(db.pool, 'ticket', w.T);
    expect(await purgeItem(db.pool, { kind: 'ticket', id: w.T }, deps(new Date(due.getTime() - 1)))).toMatchObject({
      status: 'skipped',
      reason: 'not-due',
    });
    expect(await purgeItem(db.pool, { kind: 'ticket', id: w.S1 }, deps(due))).toMatchObject({
      status: 'skipped',
      reason: 'not-marked',
    });
    expect(await purgeItem(db.pool, { kind: 'ticket', id: newUlid() }, deps(due))).toMatchObject({
      status: 'skipped',
      reason: 'not-found',
    });
    // CONTROL — at exactly the due instant, the same ticket is purged.
    expect((await purgeItem(db.pool, { kind: 'ticket', id: w.T }, deps(due))).status).toBe('purged');
    expect(await purgeItem(db.pool, { kind: 'ticket', id: w.T }, deps(due))).toMatchObject({
      status: 'skipped',
      reason: 'already-purged',
    });
  });
});

describe('19.116 the purged ticket’s object is deleted after commit', () => {
  it('deletes exactly T’s key, empties its queue row, and leaves S1’s attachment', async () => {
    const w = await buildTicketWorld(db.pool);
    const store = recordingStore();
    const outcome = await purgeItem(db.pool, { kind: 'ticket', id: w.T }, deps(await dueAt(db.pool, 'ticket', w.T), store));
    expect(store.deleted).toEqual([w.keyT]);
    expect(outcome).toMatchObject({ status: 'purged', objectsDeleted: 1, objectsPending: 0 });
    expect(
      (await one<{ n: number }>('SELECT count(*)::int AS n FROM purge_pending_objects WHERE object_key = $1', [w.keyT])).n,
    ).toBe(0);
    // CONTROL
    expect((await one<{ n: number }>('SELECT count(*)::int AS n FROM attachments WHERE ticket_id = $1', [w.S1])).n).toBe(1);
  });
});

describe('19.117 a failing object delete stays queued; the ledger half is committed', () => {
  it('keeps the key with attempts = 1 and the error, and has erased T', async () => {
    const w = await buildTicketWorld(db.pool);
    const store = recordingStore(new Set([w.keyT]));
    const outcome = await purgeItem(db.pool, { kind: 'ticket', id: w.T }, deps(await dueAt(db.pool, 'ticket', w.T), store));
    expect(outcome).toMatchObject({ status: 'purged', objectsDeleted: 0, objectsPending: 1 });
    const queued = await db.pool.query(
      'SELECT object_key, attempts, last_error FROM purge_pending_objects WHERE object_key = $1',
      [w.keyT],
    );
    expect(queued.rows).toEqual([{ object_key: w.keyT, attempts: 1, last_error: `boom: ${w.keyT}` }]);
    // CONTROL — the transaction committed before the object delete was tried.
    const left = await db.pool.query<{ type: string }>(
      `SELECT type FROM events WHERE entity_kind = 'ticket' AND entity_id = $1 ORDER BY seq`,
      [w.T],
    );
    expect(left.rows.map((row) => row.type)).toEqual(['ticket.created', 'purge.completed']);
  });
});

describe('19.114 the projections verify clean after every purge above', () => {
  it('reports no drift, over non-empty tables', async () => {
    const w = await buildTicketWorld(db.pool);
    await purgeItem(db.pool, { kind: 'ticket', id: w.T }, deps(await dueAt(db.pool, 'ticket', w.T)));
    for (const table of ['proj_tickets', 'proj_search', 'proj_visibility', 'proj_contested', 'proj_entity_heads']) {
      const { rows } = await db.pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table}`);
      expect(rows[0]?.n, `${table} is empty — a clean verdict over it proves nothing`).toBeGreaterThan(0);
    } // CONTROL
    const report = await verifyProjections({ pool: db.pool, projections: buildProjectionRegistry() });
    expect(report).toEqual({ clean: true, diffs: [] });
  });
});
```

- [ ] **Step 5: Run to see it fail.** Command: `cd apps/server && pnpm exec vitest run --no-file-parallelism test/purge/purge-ticket.test.ts > /tmp/trash2-server.log 2>&1; tail -20 /tmp/trash2-server.log`. Expected: FAIL. `../../src/purge/purge-item.js` does not exist.

- [ ] **Step 6: Implement.** Create `apps/server/src/purge/erasure.ts`:

```ts
import type { PoolClient } from 'pg';
import type { LifecycleKind } from '@gisik-nokma/domain';
import { rowToEnvelope, type EventRow } from '../ledger/event-store.js';
import type { ProjectionRegistry } from '../projections/registry.js';

/**
 * The non-ledger half of a purge (trash series Plan 2, D1). `purge_ledger`
 * has already removed or redacted the set's `events`/`snapshots` rows in this
 * same transaction; everything here deletes by the erasure set, per the rules
 * in `./table-rules.ts`.
 */

export type PurgeTarget = { kind: LifecycleKind; id: string };

export type ErasureSet = {
  target: PurgeTarget;
  workspaceId: string;
  entities: ReadonlyArray<{ kind: string; id: string }>;
  ticketIds: string[];
  noteIds: string[];
  projectIds: string[];
};

export function toErasureSet(
  target: PurgeTarget,
  workspaceId: string,
  rows: ReadonlyArray<{ erased_kind: string; erased_id: string }>,
): ErasureSet {
  const entities = rows.map((row) => ({ kind: row.erased_kind, id: row.erased_id }));
  const of = (kind: string): string[] => entities.filter((entity) => entity.kind === kind).map((entity) => entity.id);
  return { target, workspaceId, entities, ticketIds: of('ticket'), noteIds: of('note'), projectIds: of('project') };
}

function kindsAndIds(set: ErasureSet): [string[], string[]] {
  return [set.entities.map((entity) => entity.kind), set.entities.map((entity) => entity.id)];
}

/** The attachment object keys the set owns — read BEFORE the rows are deleted. */
export async function objectKeysOf(db: PoolClient, set: ErasureSet): Promise<string[]> {
  const { rows } =
    set.target.kind === 'workspace'
      ? await db.query<{ object_key: string }>(
          'SELECT object_key FROM attachments WHERE workspace_id = $1 ORDER BY object_key',
          [set.workspaceId],
        )
      : await db.query<{ object_key: string }>(
          `SELECT object_key FROM attachments
            WHERE ticket_id = ANY($1::text[]) OR note_id = ANY($2::text[])
            ORDER BY object_key`,
          [set.ticketIds, set.noteIds],
        );
  return rows.map((row) => row.object_key);
}

/**
 * Deletes the set's rows from every non-ledger table (rules `erase` and
 * `rederive` in `PURGE_TABLE_RULES`). Survivor re-derivation is Task 7's
 * `rederiveSurvivors`; entity heads of the rows that REMAIN are re-derived by
 * `replayRemaining` below.
 */
export async function eraseRows(db: PoolClient, set: ErasureSet): Promise<void> {
  if (set.target.kind === 'workspace') {
    throw new Error('eraseRows: a workspace purge is wired in trash Plan 2 Task 6');
  }
  const [kinds, ids] = kindsAndIds(set);
  await db.query(
    `DELETE FROM proj_entity_heads h
      USING unnest($1::text[], $2::text[]) AS s(kind, id)
      WHERE h.entity_kind = s.kind AND h.entity_id = s.id`,
    [kinds, ids],
  );
  const T = set.ticketIds;
  const N = set.noteIds;
  const P = set.projectIds;
  const statements: ReadonlyArray<readonly [string, unknown[]]> = [
    ['DELETE FROM proj_tickets WHERE ticket_id = ANY($1::text[])', [T]],
    ['DELETE FROM proj_visibility WHERE ticket_id = ANY($1::text[])', [T]],
    ['DELETE FROM proj_rollups WHERE parent_ticket_id = ANY($1::text[])', [T]],
    ['DELETE FROM proj_search WHERE ticket_id = ANY($1::text[])', [T]],
    ['DELETE FROM proj_ticket_comments WHERE ticket_id = ANY($1::text[])', [T]],
    ['DELETE FROM proj_contested WHERE ticket_id = ANY($1::text[])', [T]],
    [`DELETE FROM notifications WHERE payload->>'ticketId' = ANY($1::text[])`, [T]],
    ['DELETE FROM attachments WHERE ticket_id = ANY($1::text[]) OR note_id = ANY($2::text[])', [T, N]],
    ['DELETE FROM proj_note_attachments WHERE ticket_id = ANY($1::text[]) OR note_id = ANY($2::text[])', [T, N]],
    ['DELETE FROM proj_notes WHERE note_id = ANY($1::text[])', [N]],
    ['DELETE FROM proj_note_comments WHERE note_id = ANY($1::text[])', [N]],
    ['DELETE FROM proj_note_search WHERE note_id = ANY($1::text[])', [N]],
    ['DELETE FROM search_note_chunks WHERE note_id = ANY($1::text[])', [N]],
    ['DELETE FROM proj_memberships WHERE project_id = ANY($1::text[])', [P]],
    ['DELETE FROM proj_projects WHERE project_id = ANY($1::text[])', [P]],
  ];
  for (const [sql, params] of statements) {
    await db.query(sql, params);
  }
}

/** Every erased id, content-free (D2). `ON CONFLICT DO NOTHING`: a project purge may re-meet a ticket purged earlier (D11). */
export async function recordPurged(db: PoolClient, set: ErasureSet, purgedAt: string): Promise<void> {
  const [kinds, ids] = kindsAndIds(set);
  await db.query(
    `INSERT INTO purged_entities (entity_kind, entity_id, workspace_id, purged_at)
     SELECT s.kind, s.id, $3, $4 FROM unnest($1::text[], $2::text[]) AS s(kind, id)
     ON CONFLICT (entity_kind, entity_id) DO NOTHING`,
    [kinds, ids, set.workspaceId, purgedAt],
  );
}

/**
 * The set's rows that REMAIN in the ledger — a ticket purge's redacted
 * creations — replayed through every projection, in canonical replay order. A
 * rebuild derives a `proj_entity_heads` row from each; every other projection
 * skips a redacted creation (Task 3). Live must equal rebuild.
 */
export async function replayRemaining(
  db: PoolClient,
  set: ErasureSet,
  projections: ProjectionRegistry,
): Promise<void> {
  const [kinds, ids] = kindsAndIds(set);
  const { rows } = await db.query<EventRow>(
    `SELECT e.* FROM events e
       JOIN unnest($1::text[], $2::text[]) AS s(kind, id) ON e.entity_kind = s.kind AND e.entity_id = s.id
      ORDER BY e.entity_kind, e.entity_id, e.seq`,
    [kinds, ids],
  );
  for (const row of rows) {
    const event = rowToEnvelope(row);
    for (const projection of projections.all()) {
      await projection.apply(event, db);
    }
  }
}
```

Create `apps/server/src/purge/pending-objects.ts`:

```ts
import { ObjectNotFoundError, type ObjectStore } from '../attachments/object-store.js';
import type { Queryable } from '../db/queryable.js';

/**
 * Attachment objects a purge orphaned (spec §5.2, §7). Keys are queued INSIDE
 * the purge transaction and deleted after it commits, so a crash between the
 * two leaves the key queued rather than a file no row points at. A row leaves
 * the queue only when its delete succeeded — the delete is attempted FIRST.
 */

export async function queuePendingObjects(db: Queryable, keys: readonly string[], now: Date): Promise<void> {
  if (keys.length === 0) return;
  await db.query(
    `INSERT INTO purge_pending_objects (object_key, queued_at)
     SELECT unnest($1::text[]), $2
     ON CONFLICT (object_key) DO NOTHING`,
    [[...keys], now.toISOString()],
  );
}

export type DrainReport = { deleted: number; pending: number };

/**
 * Deletes queued objects — only `onlyKeys` when given (the purge's own, right
 * after commit), every queued key otherwise (the sweep's drain, Task 9). An
 * object already gone counts as deleted: the goal is its absence.
 */
export async function deletePendingObjects(
  db: Queryable,
  store: Pick<ObjectStore, 'delete'>,
  onlyKeys?: readonly string[],
): Promise<DrainReport> {
  const { rows } =
    onlyKeys === undefined
      ? await db.query<{ object_key: string }>(
          'SELECT object_key FROM purge_pending_objects ORDER BY queued_at, object_key',
        )
      : await db.query<{ object_key: string }>(
          'SELECT object_key FROM purge_pending_objects WHERE object_key = ANY($1::text[]) ORDER BY queued_at, object_key',
          [[...onlyKeys]],
        );
  const report: DrainReport = { deleted: 0, pending: 0 };
  for (const { object_key: key } of rows) {
    try {
      await store.delete(key);
    } catch (error) {
      if (!(error instanceof ObjectNotFoundError)) {
        report.pending += 1;
        await db.query(
          'UPDATE purge_pending_objects SET attempts = attempts + 1, last_error = $2 WHERE object_key = $1',
          [key, error instanceof Error ? error.message : String(error)],
        );
        continue;
      }
    }
    await db.query('DELETE FROM purge_pending_objects WHERE object_key = $1', [key]);
    report.deleted += 1;
  }
  return report;
}
```

Create `apps/server/src/purge/purge-item.ts`:

```ts
import type { Pool, PoolClient } from 'pg';
import {
  newUlid,
  purgeCompletedPayload,
  purgeDueAt,
  SYSTEM_ACTOR_PURGE,
  type LedgerEvent,
  type LifecycleKind,
} from '@gisik-nokma/domain';
import type { ObjectStore } from '../attachments/object-store.js';
import { insertEvent, lockEntity, lockWorkspace, nextSeq, nextWorkspaceSeq } from '../ledger/event-store.js';
import type { ProjectionRegistry } from '../projections/registry.js';
import { eraseRows, objectKeysOf, recordPurged, replayRemaining, toErasureSet, type PurgeTarget } from './erasure.js';
import { deletePendingObjects, queuePendingObjects } from './pending-objects.js';

export type { PurgeTarget } from './erasure.js';

export type PurgeDeps = {
  projections: ProjectionRegistry;
  store: Pick<ObjectStore, 'delete'>;
  now: Date;
};

export type PurgeSkipReason = 'already-purged' | 'not-found' | 'not-marked' | 'not-due';

export type PurgeOutcome =
  | {
      status: 'purged';
      target: PurgeTarget;
      workspaceId: string;
      erased: number;
      tombstoneId: string;
      objectsDeleted: number;
      objectsPending: number;
    }
  | { status: 'skipped'; target: PurgeTarget; reason: PurgeSkipReason };

const LOCATE: Record<LifecycleKind, string> = {
  workspace: 'SELECT workspace_id, purge_marked_at, purge_marked_by FROM proj_workspaces WHERE workspace_id = $1',
  project: 'SELECT workspace_id, purge_marked_at, purge_marked_by FROM proj_projects WHERE project_id = $1',
  ticket: 'SELECT workspace_id, purge_marked_at, purge_marked_by FROM proj_tickets WHERE ticket_id = $1',
  note: 'SELECT workspace_id, purge_marked_at, purge_marked_by FROM proj_notes WHERE note_id = $1',
};

type Located = { workspaceId: string; markedAt: string | null; markedBy: string | null };

async function locate(db: PoolClient, target: PurgeTarget): Promise<Located | null> {
  const { rows } = await db.query<{
    workspace_id: string;
    purge_marked_at: Date | null;
    purge_marked_by: string | null;
  }>(LOCATE[target.kind], [target.id]);
  const row = rows[0];
  if (row === undefined) return null;
  return {
    workspaceId: row.workspace_id,
    markedAt: row.purge_marked_at === null ? null : row.purge_marked_at.toISOString(),
    markedBy: row.purge_marked_by,
  };
}

async function isPurged(db: PoolClient, target: PurgeTarget): Promise<boolean> {
  const { rows } = await db.query('SELECT 1 FROM purged_entities WHERE entity_kind = $1 AND entity_id = $2', [
    target.kind,
    target.id,
  ]);
  return rows.length > 0;
}

async function inTransaction<T>(pool: Pool, work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  let rollbackFailure: Error | undefined;
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch((failure: unknown) => {
      rollbackFailure = failure instanceof Error ? failure : new Error(String(failure));
    });
    throw error;
  } finally {
    client.release(rollbackFailure);
  }
}

type Committed =
  | { status: 'skipped'; reason: PurgeSkipReason }
  | { status: 'erased'; workspaceId: string; erased: number; tombstoneId: string; keys: string[] };

/**
 * Permanently erases one item (trash series Plan 2; spec §5.2–§5.6). One
 * transaction for everything but the object store; see this plan's Task 5 for
 * why each step sits where it does. Skips — never erases — an item that is
 * already erased, gone, unmarked or not yet due, re-reading the mark UNDER the
 * workspace lock so an unmark that committed first is honoured.
 */
export async function purgeItem(pool: Pool, target: PurgeTarget, deps: PurgeDeps): Promise<PurgeOutcome> {
  const committed = await inTransaction<Committed>(pool, async (client) => {
    if (await isPurged(client, target)) return { status: 'skipped', reason: 'already-purged' };
    const first = await locate(client, target);
    if (first === null) return { status: 'skipped', reason: 'not-found' };
    await lockWorkspace(client, first.workspaceId);
    await lockEntity(client, target.kind, target.id);
    const item = await locate(client, target);
    if (item === null) return { status: 'skipped', reason: 'not-found' };
    if (item.markedAt === null || item.markedBy === null) return { status: 'skipped', reason: 'not-marked' };
    if (Date.parse(purgeDueAt(item.markedAt)) > deps.now.getTime()) return { status: 'skipped', reason: 'not-due' };

    // BEFORE anything is deleted: the deleted rows may hold the workspace's
    // highest workspace_seq, and MAX+1 afterwards would re-issue a stream
    // position clients have already seen; likewise the item's own seq.
    const workspaceSeq = await nextWorkspaceSeq(client, item.workspaceId);
    const seq = await nextSeq(client, target.kind, target.id);

    const { rows } = await client.query<{ erased_kind: string; erased_id: string }>(
      'SELECT erased_kind, erased_id FROM purge_ledger($1, $2)',
      [target.kind, target.id],
    );
    const set = toErasureSet(target, item.workspaceId, rows);
    const keys = await objectKeysOf(client, set);
    await eraseRows(client, set);
    await recordPurged(client, set, deps.now.toISOString());
    await replayRemaining(client, set, deps.projections);

    const at = deps.now.toISOString();
    const tombstone: LedgerEvent = {
      id: newUlid(),
      workspaceId: item.workspaceId,
      entity: { kind: target.kind, id: target.id },
      type: 'purge.completed',
      version: 1,
      payload: purgeCompletedPayload.parse({ kind: target.kind, markedBy: item.markedBy, markedAt: item.markedAt }),
      actorId: SYSTEM_ACTOR_PURGE,
      origin: 'server',
      clientTime: at,
      serverTime: at,
      seq,
      workspaceSeq,
    };
    await insertEvent(client, tombstone);
    for (const projection of deps.projections.all()) {
      await projection.apply(tombstone, client);
    }
    await queuePendingObjects(client, keys, deps.now);
    return { status: 'erased', workspaceId: item.workspaceId, erased: set.entities.length, tombstoneId: tombstone.id, keys };
  });

  if (committed.status === 'skipped') return { status: 'skipped', target, reason: committed.reason };
  const drained = await deletePendingObjects(pool, deps.store, committed.keys);
  return {
    status: 'purged',
    target,
    workspaceId: committed.workspaceId,
    erased: committed.erased,
    tombstoneId: committed.tombstoneId,
    objectsDeleted: drained.deleted,
    objectsPending: drained.pending,
  };
}
```

- [ ] **Step 7: Run to see it pass** (same command). Then run `test/purge` whole and `test/verify-projections.test.ts`.

- [ ] **Step 8: The runbook sentence this commit falsifies.** In `docs/runbook.md`, replace `:169-171` ("**It does not delete `attachments` rows.** There is no `DELETE FROM attachments` anywhere in `apps/server/src`. …") with:

```markdown
**It does not delete `attachments` rows.** The one `DELETE FROM attachments` in `apps/server/src` is the
permanent purge's (`src/purge/erasure.ts`): it deletes an erased ticket's, note's or workspace's rows and
queues their objects in `purge_pending_objects`, which the purge sweep empties. Orphaned rows — a row whose
object never arrived — therefore still accumulate and are not swept by this tool. That is a known gap, not
an oversight of this runbook.
```

Then run `pnpm check:runbook`. The paragraph names no command.

- [ ] **Step 9: Flip 19.110–19.117 to ✅, and write the `Features.md` bullet:**

```markdown
- ⚙️ **`purgeItem` — permanent erasure of one item** (`apps/server/src/purge/purge-item.ts`, `erasure.ts`, `pending-objects.ts`; spec §5.2–§5.5) — one transaction: skip what is already erased / gone / unmarked / not due (re-reading the mark under the workspace lock), capture `workspace_seq` and the item's `seq` BEFORE anything is deleted, call `purge_ledger`, read the set's attachment keys, delete the set's rows from every non-ledger table, record the ids in `purged_entities`, replay the rows that remain (redacted creations) so entity heads match a rebuild, append `purge.completed` (actor `SYSTEM_ACTOR_PURGE`, payload copied from the lifecycle row) through every projection, queue the object keys, commit — then delete the objects best-effort; a failure stays in `purge_pending_objects` with its attempt count and error. The erasure proof scans every text/jsonb/array/tsvector column in the database for the erased ids and a content marker. Cases 19.110–19.117.
```

- [ ] **Step 10: Commit** `Trash 2/Task 5: purgeItem erases a ticket (19.110-19.117)`. Then work through the mutations: mutate, show red, restore.

---

### Task 6: Erasing a note, a project and a workspace

**Files:**
- Create: `apps/server/test/purge/purge-kinds.test.ts`
- Modify:
  - `apps/server/src/purge/erasure.ts`: the workspace branch; the `user_preferences` strip.
  - `apps/server/src/projections/note-search.ts`: add `rederiveWorkspaceLexemes` after `insertLexemes`, `:222-233`.
  - `apps/server/src/purge/purge-item.ts`: call it.
  - `apps/server/test/purge/world.ts`: append three worlds.
  - `test-cases/19-trash.md`, `Features.md`.

**Interfaces:**
- Consumes:
  - `workspaceScopedTables()` (Task 1); `purgeItem`, `eraseRows` (Task 5).
  - `insertLexemes(tx, workspaceId, text)`. It is module-private in `projections/note-search.ts:222-233`, and this task leaves it private.
- Produces:
  - `rederiveWorkspaceLexemes(tx: PoolClient, workspaceId: string): Promise<void>`, exported from `projections/note-search.ts`.
  - `buildNoteWorld`, `buildProjectWorld`, `buildWorkspacePair` and `insertChunk` in `test/purge/world.ts`.

**What each kind adds over Task 5:**
- **A note:** its comments (`comment.added` is filed on the note entity, so `purge_ledger` takes them), its attachments (`attachments.note_id`, `apps/server/migrations/1790110000000_attachments-note-owner.sql:44-50`), its `proj_note_search` row and its `search_note_chunks`. Its words must also leave `proj_note_lexemes`. That table has no note id, so the purge re-derives the workspace's lexemes (D3).
- **A project:** its tickets (a deleted one included) and its notes, via `purge_erasure_set` (Task 4). Also:
  - its project-scoped membership rows;
  - every ticket an earlier purge left redacted (D11);
  - its keys in `user_preferences.doc.listColumns` and `.grouping`, which are keyed by project id (`packages/domain/src/preferences.ts:111-117`). Those keys are stripped.

  Saved filters cannot name a project or ticket (`filterSpecSchema`, `packages/domain/src/filter-spec.ts`; a saved filter "is a question", `preferences.ts:6-15`), so they are left alone.
- **A workspace:** every row of every table in `workspaceScopedTables()`, and the `invite_tokens` of its invites (deleted before `proj_invites`, which is how they are found). Another workspace's rows are untouched, even for a user who belongs to both (Review Focus 3).

Cases (`## 19.14 Purging a note, a project, a workspace`):

```markdown
- ❌ **19.120 — after purging a note N (with a comment, an attachment, a search row, chunks and lexemes), the only rows naming N are its tombstone, its head and its registry row, and the note's marker is nowhere — `proj_note_lexemes` included;** control: the ticket X that N was attached to keeps its row. Mutation: skip the `proj_note_comments` delete.
- ❌ **19.121 — after purging a project P2 (tickets A and child A1, deleted ticket B, ticket B2 purged individually beforehand, note NP, a project membership, preferences keyed by P2), the only rows naming any of them are P2's tombstone, its head and six registry rows; the preferences keep only the sibling project's keys;** control: the sibling project's ticket keeps its number and the workspace-level note survives. Mutation: drop the `ticket.created` arm of `purge_erasure_set`'s project branch (D11).
- ❌ **19.122 — a workspace purge erases every row of W1 — `invite_tokens` included — and leaves W2's memberships, preferences, notifications and events exactly as they were, though one user belongs to both;** control: W2's four counts, compared before and after. Mutation: delete `user_preferences` by `user_id` instead of `workspace_id` in the workspace branch.
- ❌ **19.123 — after a workspace purge the workspace's stream is exactly one event, `purge.completed` `{ kind: 'workspace', markedBy, markedAt }` filed on the workspace at the old maximum `workspace_seq` + 1, and `verifyProjections` is clean over every purge in the file;** control: the verify is over non-empty `proj_notes` and `proj_projects`. Mutation: capture `nextWorkspaceSeq` after `purge_ledger`.
```

- [ ] **Step 1: Write the cases** under `## 19.14 Purging a note, a project, a workspace`. Confirm the case-id count moved by 4.

- [ ] **Step 2: Append the three worlds** to `apps/server/test/purge/world.ts`:

```ts
/** A chunk row as the embed worker writes one (`apps/server/src/search/embed-worker.ts:152-170`); the vector is irrelevant here. */
export async function insertChunk(pool: Pool, base: Pick<Base, 'WS'>, noteId: string, chunkText: string): Promise<void> {
  await pool.query(
    `INSERT INTO search_note_chunks (note_id, chunk_index, workspace_id, heading_path, chunk_text, model, source_seq, embedding)
     VALUES ($1, 0, $2, '', $3, 'test-model@1', 1, $4)`,
    [noteId, base.WS, chunkText, `[${new Array(512).fill(0).join(',')}]`],
  );
}

export type NoteWorld = Base & { P: string; X: string; N: string; keyN: string; marker: string };

/** A private workspace-level note N, attached to ticket X, deleted and then marked. */
export async function buildNoteWorld(pool: Pool): Promise<NoteWorld> {
  const base = await seedWorkspace(pool);
  const marker = newMarker();
  const P = newUlid();
  const X = newUlid();
  const N = newUlid();
  const attN = newUlid();
  const keyN = `w/${base.WS}/a/${attN}`;
  await applyCommitted(pool, [
    projectCreated(base, P, 'Notes', 'NT'),
    ticketCreated(base, X, P, 'A ticket the note hangs on'),
    noteCreated(base, N, {
      title: `Minutes ${marker}`,
      homeProjectId: '',
      scope: { mode: 'private' },
      body: doc(text(`we agreed ${marker}`)),
    }),
    ev(base, 'note', N, 'comment.added', { body: doc(text(`noted ${marker}`)) }),
    ev(base, 'note', N, 'note.attached', { ticketId: X }),
  ]);
  await insertAttachment(pool, base, attN, { noteId: N }, `${marker}.pdf`, keyN);
  await insertChunk(pool, base, N, `we agreed ${marker}`);
  await applyCommitted(pool, [ev(base, 'note', N, 'note.deleted', {}), ev(base, 'note', N, 'purge.marked', {})]);
  return { ...base, P, X, N, keyN, marker };
}

export type ProjectWorld = Base & {
  P2: string;
  Q: string;
  A: string;
  A1: string;
  B: string;
  B2: string;
  NP: string;
  NW: string;
  Q1: string;
  marker: string;
};

/**
 * Project P2 (to be purged) beside project Q (kept). P2 holds A and its child
 * A1, B (deleted), B2 (deleted AND marked — purged individually by the test
 * before the project, D11), a project note NP and a project membership. The
 * owner's preferences are keyed by both projects. NW is a workspace-level note.
 */
export async function buildProjectWorld(pool: Pool): Promise<ProjectWorld> {
  const base = await seedWorkspace(pool);
  const marker = newMarker();
  const [P2, Q, A, A1, B, B2, NP, NW, Q1] = Array.from({ length: 9 }, () => newUlid()) as [
    string, string, string, string, string, string, string, string, string,
  ];
  await applyCommitted(pool, [
    projectCreated(base, P2, 'Doomed', 'DM'),
    projectCreated(base, Q, 'Kept', 'KP'),
    ticketCreated(base, A, P2, `Doomed ${marker}`),
    ticketCreated(base, A1, P2, 'Its child', A),
    ticketCreated(base, B, P2, 'Deleted on its own'),
    ev(base, 'ticket', B, 'ticket.deleted', {}),
    ticketCreated(base, B2, P2, 'Purged on its own'),
    ev(base, 'ticket', B2, 'ticket.deleted', {}),
    ev(base, 'ticket', B2, 'purge.marked', {}),
    ticketCreated(base, Q1, Q, 'Kept ticket'),
    noteCreated(base, NP, { title: `Plan ${marker}`, homeProjectId: P2, scope: { mode: 'project' } }),
    noteCreated(base, NW, { title: 'Workspace note', homeProjectId: '', scope: { mode: 'workspace' } }),
    ev(base, 'project', P2, 'project.member_added', { userId: base.OWNER, projectAdmin: true }),
  ]);
  await pool.query(
    `INSERT INTO user_preferences (user_id, workspace_id, doc, updated_at) VALUES ($1, $2, $3, now())`,
    [
      base.OWNER,
      base.WS,
      JSON.stringify({
        savedFilters: [],
        listColumns: { [P2]: ['title'], [Q]: ['title'] },
        grouping: { [P2]: 'status', [Q]: 'epic' },
      }),
    ],
  );
  await applyCommitted(pool, [
    ev(base, 'project', P2, 'project.deleted', {}),
    ev(base, 'project', P2, 'purge.marked', {}),
  ]);
  return { ...base, P2, Q, A, A1, B, B2, NP, NW, Q1, marker };
}

export type WorkspacePair = {
  U: string;
  W1: Base;
  W2: Base;
  P1: string;
  T1: string;
  N1: string;
  INV: string;
  marker: string;
};

/** User U owns W1 (to be purged) and W2 (kept); both hold preferences and notifications for U. */
export async function buildWorkspacePair(pool: Pool): Promise<WorkspacePair> {
  const U = newUlid();
  const W1 = await seedWorkspace(pool, U);
  const W2 = await seedWorkspace(pool, U);
  const marker = newMarker();
  const [P1, T1, N1, INV, att1, PW2, TW2] = Array.from({ length: 7 }, () => newUlid()) as [
    string, string, string, string, string, string, string,
  ];
  await applyCommitted(pool, [
    projectCreated(W1, P1, 'Gone', 'GN'),
    ticketCreated(W1, T1, P1, `Doomed ${marker}`),
    noteCreated(W1, N1, { title: `Minutes ${marker}`, homeProjectId: '', scope: { mode: 'workspace' } }),
    ev(W1, 'invite', INV, 'invite.sent', {
      inviteId: INV,
      address: 'guest@example.com',
      channel: 'email',
      role: 'member',
      projectIds: [P1],
    }),
    projectCreated(W2, PW2, 'Stays', 'ST'),
    ticketCreated(W2, TW2, PW2, 'Survivor'),
  ]);
  await pool.query(
    `INSERT INTO invite_tokens (invite_id, token_hash, created_at, expires_at) VALUES ($1, $2, now(), now() + interval '7 days')`,
    [INV, `hash-${newUlid()}`],
  );
  await insertAttachment(pool, W1, att1, { ticketId: T1 }, `${marker}.pdf`, `w/${W1.WS}/a/${att1}`);
  await insertNotification(pool, W1, U, T1, `Doomed ${marker}`);
  await insertNotification(pool, W2, U, TW2, 'Survivor');
  for (const ws of [W1.WS, W2.WS]) {
    await pool.query(
      `INSERT INTO user_preferences (user_id, workspace_id, doc, updated_at) VALUES ($1, $2, $3, now())`,
      [U, ws, JSON.stringify({ savedFilters: [], listColumns: {}, grouping: {} })],
    );
  }
  await applyCommitted(pool, [
    ev(W1, 'workspace', W1.WS, 'workspace.deleted', {}),
    ev(W1, 'workspace', W1.WS, 'purge.marked', {}),
  ]);
  return { U, W1, W2, P1, T1, N1, INV, marker };
}
```

- [ ] **Step 3: Write the failing test** `apps/server/test/purge/purge-kinds.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildProjectionRegistry } from '../../src/projections/index.js';
import { purgeItem, type PurgeDeps } from '../../src/purge/purge-item.js';
import { ticketNumbers } from '../../src/read/ticket-numbers.js';
import { verifyProjections } from '../../src/tools/verify-projections.js';
import { resetEntitySeqs } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { scan } from './scan.js';
import { buildNoteWorld, buildProjectWorld, buildWorkspacePair, dueAt, recordingStore } from './world.js';

/**
 * Spec §5.2, §5.5 — the other three kinds. Cases 19.120–19.123
 * (`test-cases/19-trash.md` §19.14). 19.123 verifies the WHOLE database, so it
 * runs last and covers every purge above it.
 */

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
  resetEntitySeqs();
}, 60_000);

afterAll(async () => {
  await db.drop();
});

function deps(now: Date): PurgeDeps {
  return { projections: buildProjectionRegistry(), store: recordingStore(), now };
}

async function count(sql: string, params: unknown[]): Promise<number> {
  const { rows } = await db.pool.query<{ n: number }>(sql, params);
  return rows[0]?.n ?? 0;
}

describe('19.120 a note purge erases the note, its comments, attachments, search rows, chunks and lexemes', () => {
  it('leaves only the tombstone, head and registry row; X keeps its row', async () => {
    const w = await buildNoteWorld(db.pool);
    const outcome = await purgeItem(db.pool, { kind: 'note', id: w.N }, deps(await dueAt(db.pool, 'note', w.N)));
    expect(outcome.status).toBe('purged');
    expect(await scan(db.pool, [w.N])).toEqual({
      'events.entity_id': 1,
      'proj_entity_heads.entity_id': 1,
      'purged_entities.entity_id': 1,
    });
    expect(await scan(db.pool, [w.marker])).toEqual({});
    // CONTROL
    expect(await count('SELECT count(*)::int AS n FROM proj_tickets WHERE ticket_id = $1', [w.X])).toBe(1);
  });
});

describe('19.121 a project purge erases its tickets, notes, memberships, earlier redactions and preference keys', () => {
  it('leaves only P2’s tombstone, head and six registry rows; Q keeps its keys and numbers; NW survives', async () => {
    const w = await buildProjectWorld(db.pool);
    const q1Before = (await ticketNumbers(db.pool, w.WS, [w.Q1])).get(w.Q1);
    expect((await purgeItem(db.pool, { kind: 'ticket', id: w.B2 }, deps(await dueAt(db.pool, 'ticket', w.B2)))).status).toBe(
      'purged',
    );
    const outcome = await purgeItem(db.pool, { kind: 'project', id: w.P2 }, deps(await dueAt(db.pool, 'project', w.P2)));
    expect(outcome.status).toBe('purged');
    expect(await scan(db.pool, [w.P2, w.A, w.A1, w.B, w.B2, w.NP])).toEqual({
      'events.entity_id': 1,
      'proj_entity_heads.entity_id': 1,
      'purged_entities.entity_id': 6,
    });
    expect(await scan(db.pool, [w.marker])).toEqual({});
    const prefs = await db.pool.query<{ doc: unknown }>(
      'SELECT doc FROM user_preferences WHERE user_id = $1 AND workspace_id = $2',
      [w.OWNER, w.WS],
    );
    expect(prefs.rows[0]?.doc).toEqual({ savedFilters: [], listColumns: { [w.Q]: ['title'] }, grouping: { [w.Q]: 'epic' } });
    // CONTROL — the sibling project's key and the workspace note are untouched.
    expect((await ticketNumbers(db.pool, w.WS, [w.Q1])).get(w.Q1)).toBe(q1Before);
    expect(await count('SELECT count(*)::int AS n FROM proj_notes WHERE note_id = $1', [w.NW])).toBe(1);
  });
});

describe('19.122 a workspace purge erases W1 and leaves W2 alone, though one user belongs to both', () => {
  it('leaves only W1’s tombstone and head; W2’s memberships, preferences, notifications and events are unchanged', async () => {
    const pair = await buildWorkspacePair(db.pool);
    const w2 = async () => ({
      memberships: await count('SELECT count(*)::int AS n FROM proj_memberships WHERE workspace_id = $1', [pair.W2.WS]),
      preferences: await count('SELECT count(*)::int AS n FROM user_preferences WHERE workspace_id = $1', [pair.W2.WS]),
      notifications: await count('SELECT count(*)::int AS n FROM notifications WHERE workspace_id = $1', [pair.W2.WS]),
      events: await count('SELECT count(*)::int AS n FROM events WHERE workspace_id = $1', [pair.W2.WS]),
    });
    const before = await w2();
    expect(before.preferences).toBe(1);
    const outcome = await purgeItem(
      db.pool,
      { kind: 'workspace', id: pair.W1.WS },
      deps(await dueAt(db.pool, 'workspace', pair.W1.WS)),
    );
    expect(outcome.status).toBe('purged');
    const registry = await count('SELECT count(*)::int AS n FROM purged_entities WHERE workspace_id = $1', [pair.W1.WS]);
    expect(registry).toBe(outcome.status === 'purged' ? outcome.erased : -1);
    // The registry holds W1's id by design (its workspace_id, and membership
    // entity ids `<W1>:<user>`); asserted above, then set aside.
    const hits = await scan(db.pool, [pair.W1.WS]);
    delete hits['purged_entities.workspace_id'];
    delete hits['purged_entities.entity_id'];
    expect(hits).toEqual({
      'events.workspace_id': 1,
      'events.entity_id': 1,
      'proj_entity_heads.workspace_id': 1,
      'proj_entity_heads.entity_id': 1,
    });
    expect(await scan(db.pool, [pair.marker])).toEqual({});
    expect(await count('SELECT count(*)::int AS n FROM invite_tokens WHERE invite_id = $1', [pair.INV])).toBe(0);
    // CONTROL — W2, the shared user's other workspace, is exactly as it was.
    expect(await w2()).toEqual(before);
  });
});

describe('19.123 the workspace tombstone lands at the captured position; everything verifies clean', () => {
  it('leaves exactly one event in W1’s stream, at old max + 1, and verifyProjections is clean', async () => {
    const pair = await buildWorkspacePair(db.pool);
    const maxWs = await count('SELECT max(workspace_seq)::int AS n FROM events WHERE workspace_id = $1', [pair.W1.WS]);
    const markedAt = (
      await db.pool.query<{ at: Date }>('SELECT purge_marked_at AS at FROM proj_workspaces WHERE workspace_id = $1', [
        pair.W1.WS,
      ])
    ).rows[0]!.at.toISOString();
    await purgeItem(db.pool, { kind: 'workspace', id: pair.W1.WS }, deps(await dueAt(db.pool, 'workspace', pair.W1.WS)));
    const stream = await db.pool.query(
      `SELECT type, entity_kind, entity_id, workspace_seq::int AS workspace_seq, payload FROM events WHERE workspace_id = $1`,
      [pair.W1.WS],
    );
    expect(stream.rows).toEqual([
      {
        type: 'purge.completed',
        entity_kind: 'workspace',
        entity_id: pair.W1.WS,
        workspace_seq: maxWs + 1,
        payload: { kind: 'workspace', markedBy: pair.U, markedAt },
      },
    ]);
    for (const table of ['proj_notes', 'proj_projects']) {
      expect(await count(`SELECT count(*)::int AS n FROM ${table}`, []), `${table} is empty`).toBeGreaterThan(0);
    } // CONTROL
    expect(await verifyProjections({ pool: db.pool, projections: buildProjectionRegistry() })).toEqual({
      clean: true,
      diffs: [],
    });
  });
});
```

- [ ] **Step 4: Run to see it fail.** Command: `cd apps/server && pnpm exec vitest run --no-file-parallelism test/purge/purge-kinds.test.ts > /tmp/trash2-server.log 2>&1; tail -20 /tmp/trash2-server.log`. Expected:
  - 19.120: red on `proj_note_lexemes.lexeme`.
  - 19.121: red on `user_preferences.doc`.
  - 19.122 and 19.123: throw `eraseRows: a workspace purge is wired in trash Plan 2 Task 6`.

- [ ] **Step 5: Implement.** In `apps/server/src/purge/erasure.ts`:
- add `import { workspaceScopedTables } from './table-rules.js';`;
- replace the `if (set.target.kind === 'workspace') { throw … }` block at the top of `eraseRows` with:

```ts
  if (set.target.kind === 'workspace') {
    await eraseWorkspace(db, set.workspaceId);
    return;
  }
```

After the `for (const [sql, params] of statements)` loop at the end of `eraseRows`, add:

```ts
  // A project's keys in each member's preferences (`listColumns`, `grouping`
  // are keyed by project id — `packages/domain/src/preferences.ts:111-117`).
  // `savedFilters` cannot name a project or a ticket, so it is left alone.
  for (const projectId of P) {
    await db.query(
      `UPDATE user_preferences
          SET doc = doc #- ARRAY['listColumns', $2::text] #- ARRAY['grouping', $2::text]
        WHERE workspace_id = $1 AND (doc->'listColumns' ? $2 OR doc->'grouping' ? $2)`,
      [set.workspaceId, projectId],
    );
  }
```

After `eraseRows`, add:

```ts
/**
 * A workspace purge: every row of every workspace-scoped table (derived from
 * `PURGE_TABLE_RULES`, so a new table with a rule is covered without an edit),
 * and the tokens of its invites — deleted FIRST, because `proj_invites` is how
 * they are found. Rows of any other workspace are never touched, even for a
 * user who belongs to both (Review Focus 3).
 */
async function eraseWorkspace(db: PoolClient, workspaceId: string): Promise<void> {
  await db.query(
    'DELETE FROM invite_tokens WHERE invite_id IN (SELECT invite_id FROM proj_invites WHERE workspace_id = $1)',
    [workspaceId],
  );
  for (const table of workspaceScopedTables()) {
    await db.query(`DELETE FROM ${table} WHERE workspace_id = $1`, [workspaceId]);
  }
}
```

In `apps/server/src/projections/note-search.ts`, after `insertLexemes` (`:222-233`), add:

```ts
/**
 * Re-derives one workspace's lexemes from its CURRENT `proj_note_search` rows —
 * trash series Plan 2, deviation D3. The table has no note id, so an erased
 * note's words cannot be deleted by key. This is what a rebuild produces:
 * during a rebuild `reindexNote` reads each note's FINAL `proj_notes` row, so the
 * rebuilt vocabulary is the tokens of every surviving note's final text. It
 * narrows the "a lexeme is never deleted" property of
 * `migrations/1790200000000_note-search.sql:66-70` for a workspace that has had
 * a purge — recorded in the plan.
 */
export async function rederiveWorkspaceLexemes(tx: PoolClient, workspaceId: string): Promise<void> {
  await tx.query('DELETE FROM proj_note_lexemes WHERE workspace_id = $1', [workspaceId]);
  const { rows } = await tx.query<{ title: string; body_text: string; ticket_text: string }>(
    'SELECT title, body_text, ticket_text FROM proj_note_search WHERE workspace_id = $1 ORDER BY note_id',
    [workspaceId],
  );
  for (const row of rows) {
    await insertLexemes(tx, workspaceId, `${row.title} ${row.body_text} ${row.ticket_text}`);
  }
}
```

In `apps/server/src/purge/purge-item.ts`:
- add `import { rederiveWorkspaceLexemes } from '../projections/note-search.js';`;
- directly after `await replayRemaining(client, set, deps.projections);`, add:

```ts
    // Last among the re-derivations (Task 7 inserts the survivors above it):
    // the vocabulary is read off the note search rows as they now stand (D3).
    if (target.kind !== 'workspace') {
      await rederiveWorkspaceLexemes(client, item.workspaceId);
    }
```

- [ ] **Step 6: Run to see it pass** (same command). Then run `test/purge`, `test/projections/note-search.test.ts` and `test/search`.

- [ ] **Step 7: Flip 19.120–19.123 to ✅, and write the `Features.md` bullet:**

```markdown
- ⚙️ **Erasing a note, a project, a workspace** (`apps/server/src/purge/erasure.ts`, `projections/note-search.ts`'s `rederiveWorkspaceLexemes`; spec §5.2) — a note takes its comments, attachments, search row and chunks, and the workspace's `proj_note_lexemes` are re-derived from the surviving `proj_note_search` rows (the table has no note id; D3). A project takes its tickets (deleted ones too), notes and project memberships, every ticket an earlier purge left redacted (D11), and its keys in each member's `user_preferences` `listColumns`/`grouping`. A workspace takes every row of every workspace-scoped table (derived from `PURGE_TABLE_RULES`) and its invites' tokens, and leaves every other workspace's rows untouched even for a user in both; its tombstone is the only event left in its stream, at the captured `workspace_seq`. Cases 19.120–19.123.
```

- [ ] **Step 8: Commit** `Trash 2/Task 6: erasing a note, a project, a workspace (19.120-19.123)`. Then work through the mutations: mutate, show red, restore.

---

### Task 7: Survivors — references to an erased item

**Files:**
- Create:
  - `apps/server/src/purge/purged-lookup.ts`, `apps/server/src/purge/survivors.ts`
  - `packages/domain/test/purge-doc-text.test.ts`, `apps/server/test/purge/purge-survivors.test.ts`
- Modify:
  - `packages/domain/src/doc-text.ts`: `docToPlainText` `:64-66`, `render` `:68-116`; append `collectDocReferences`.
  - `packages/domain/src/doc-chunks.ts`: import `:1`, `chunkDoc` `:73-106`.
  - `apps/server/src/projections/search.ts`: `:17-23` docblock, `:83`, `:112`, `:120`.
  - `apps/server/src/projections/note-search.ts`: `reindexNote` `:133-160` (export it, resolver at `:146`).
  - `apps/server/src/projections/notes.ts`: the fold at `:235-251`.
  - `apps/server/src/projections/proj-invites.ts`: `invite.sent`, `:93-104`.
  - `apps/server/src/search/embed-worker.ts`: `:142`.
  - `apps/server/src/purge/purge-item.ts`, `apps/server/test/purge/world.ts`, `test-cases/19-trash.md`, `Features.md`.

**Interfaces:**
- Consumes: `purged_entities` (Task 4); `PURGED_ITEM_LABEL` (Task 2); `ErasureSet`, `purgeItem` (Task 5); `rederiveWorkspaceLexemes` (Task 6); `readEntityEvents` (`apps/server/src/ledger/event-store.ts:132-143`).
- Produces:
  - Domain:
    - `type DocTextOptions = { isPurged?: (kind: 'ticket' | 'note', id: string) => boolean }`
    - `docToPlainText(doc: unknown, options?: DocTextOptions): string`
    - `chunkDoc(doc: unknown, options?: DocTextOptions): DocChunk[]`
    - `type DocReferences = { ticketIds: string[]; noteIds: string[] }`
    - `collectDocReferences(doc: unknown): DocReferences`
  - Server:
    - `purgedIdsAmong(db: Queryable, kind: string, ids: readonly string[]): Promise<Set<string>>`
    - `purgedResolverFor(db: Queryable, docs: readonly unknown[]): Promise<(kind: 'ticket' | 'note', id: string) => boolean>`
    - `type Survivors = { ticketIds: string[]; noteIds: string[]; inviteIds: string[] }`
    - `collectSurvivors(db: PoolClient, set: ErasureSet): Promise<Survivors>`
    - `rederiveSurvivors(db: PoolClient, survivors: Survivors, set: ErasureSet, registry: ProjectionRegistry): Promise<void>`
    - `reindexNote`, now exported from `projections/note-search.ts`
  - Test world: `buildReferenceWorld`.

**The rule for every survivor — live must equal a rebuild over the post-purge ledger.** A rebuild replays each projection over `readLedger`'s entity order. So the purge re-derives a touched survivor the same way: delete its row, then replay the survivor's own surviving events through the owning projection's `apply`. Hand-written SQL is not used, because it would drift. Each projection that folds a surviving reference consults `purged_entities`, so the same replay produces the same row on a rebuild (D2).

| Survivor | Found by (after `purge_ledger`, before `eraseRows`) | Re-derived by |
|---|---|---|
| A ticket whose description or comments chip an erased item (`docToPlainText` renders `ticketRef` as `KEY title` and `wikiLink` as its stored title, `packages/domain/src/doc-text.ts:88-110`) | its events' `payload::text LIKE '%<erased id>%'`, scoped to the workspace | `DELETE FROM proj_search`, replay `proj_search` over its events. The projection renders a purged chip as `Deleted item`. |
| A note that attached an erased ticket, or whose body chips an erased item | the same scan, plus `proj_note_attachments.ticket_id` | delete its `proj_notes` + `proj_note_attachments` rows; replay `proj_notes` and `proj_lifecycle` over its events (D8); `reindexNote`; delete its `search_note_chunks`. The embed worker re-chunks it on its next interval, because a note with no chunk row is stale by the worker's own query (`embed-worker.ts:124-135`). |
| A pending invite naming an erased project | `proj_invites.project_ids && <erased projects>` | `UPDATE … project_ids` minus the erased ids, keeping order. The `invite.sent` fold filters the same ids on rebuild. |
| The workspace's lexemes | — | `rederiveWorkspaceLexemes` (Task 6), after all of the above |

Out of scope, and why:
- **Notifications** are erased by `payload->>'ticketId'` (Task 5). No survivor notification names an erased ticket except by quoting a document: a mention's `excerpt` is the ruling-A case, and those bytes stay.
- **`proj_contested` rows** are claims filed ON the erased ticket, so they go with it (Task 5).
- **A surviving child of a purged parent** cannot exist: children are in the set (Task 4, `purge_erasure_set`).
- **A child reparented out before the purge** keeps `parentId` in its `ticket.created` payload (ruling A: bytes stay). Its `proj_tickets.parent_id` and `proj_visibility` were already re-resolved by the reparent (`proj-visibility.ts:265-272`, `resolveOne`'s `parent === null` arm at `:151-154` writes `resolved_from = ''`).
- **Chip scope:** the scan is scoped to the purged item's workspace. A chip is authored from a workspace-scoped picker (`buildProjectPageQueryTickets(dataSource, workspaceId, projectId)`, `apps/web/app/w/[workspaceId]/p/[projectId]/page.tsx:241`). A workspace purge has no survivors to scan.

Cases (`## 19.15 Survivors`):

```markdown
- ❌ **19.128 — `docToPlainText` with an `isPurged` resolver renders a purged `ticketRef` and a purged `wikiLink` as `Deleted item`, and `chunkDoc` passes the resolver to both the body and a heading path;** control: without the option the same document renders `KEY title` and the link's title. Mutation: ignore `options` in the `wikiLink` branch.
- ❌ **19.129 — `collectDocReferences` returns each chipped ticket id and linked note id once, at any depth, ignoring mentions and empty ids;** control: a non-document input returns empty lists. Mutation: omit the `wikiLink` arm.
- ❌ **19.130 — a surviving ticket S1 whose comment chips the purged ticket T no longer matches T's title in search after the purge, matches `deleted item`, and `verifyProjections` is clean;** control: before the purge S1 matches T's title. Mutation: replay `proj_search` without the resolver (plain `docToPlainText(payload.body)` in the comment arm).
- ❌ **19.131 — surviving notes attached to T lose their `proj_note_attachments` rows; a note that moved to `inherit` after attaching T keeps `scope_mode = 'inherit'`; the purge does not throw and a rebuild agrees;** control: before the purge both notes had their rows. Mutation: remove `purgedAttachmentsOf` from the notes fold — the replay refuses "inherit needs an attachment".
- ❌ **19.132 — a surviving note whose body chips T is re-indexed: its `body_text` reads `deleted item`, T's title is gone from `proj_note_lexemes`, and its `search_note_chunks` are deleted;** control: an unrelated note keeps its chunk. Mutation: skip the `search_note_chunks` delete in `rederiveSurvivors`.
- ❌ **19.133 — the embed worker re-chunks that note with `Deleted item` in place of the chip;** control: the unrelated note's chunk, current by model and seq, is not rewritten. Mutation: call `chunkDoc(note.body)` without the resolver in `embed-worker.ts`.
- ❌ **19.134 — the erasure proof with ruling A's allowlist: after purging T in a world seeded with every referencing shape, T's and C's ids appear only in `events.entity_id` (3), `events.payload` (4: S1's chip comment, N1's creation, N2's attach, R's creation), `proj_entity_heads.entity_id` (2), `purged_entities.entity_id` (2), `proj_ticket_comments.body` (1) and `proj_notes.body` (1); T's content only in `events.payload` (2), `proj_ticket_comments.body` (1) and `proj_notes.body` (1);** control: before the purge the content marker is also in `proj_search`, `proj_note_search`, `proj_note_lexemes` and `search_note_chunks`. Mutation: skip `reindexNote` in `rederiveSurvivors`.
- ❌ **19.135 — purging a project drops it from a pending invite's `project_ids`, keeping the other project in order, and `verifyProjections` is clean;** control: the invite is still `pending`. Mutation: remove the purged-project filter from `proj-invites.ts`'s `invite.sent` fold.
- ❌ **19.136 — purging a child whose parent survives leaves the parent's `proj_rollups` row as it was, and a rebuild agrees;** control: the parent's row counted one live child before the purge. Mutation: erase `proj_rollups` by the set's `workspace_id` instead of by `parent_ticket_id`.
```

- [ ] **Step 1: Write the cases** under `## 19.15 Survivors`. Confirm the case-id count moved by 9.

- [ ] **Step 2: Write the failing domain test** `packages/domain/test/purge-doc-text.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { chunkDoc, collectDocReferences, docToPlainText, PURGED_ITEM_LABEL } from '../src/index.js';

/** Trash series Plan 2, Task 7 — cases 19.128, 19.129 (`test-cases/19-trash.md` §19.15). */

const T = 'ticket-purged';
const T2 = 'ticket-deep';
const N = 'note-purged';
const ref = (ticketId: string) => ({ type: 'ticketRef', attrs: { ticketId, projectId: 'p', key: 'PG-1', title: 'Invoice' } });
const link = (noteId: string) => ({ type: 'wikiLink', attrs: { noteId, title: 'Minutes' } });
const txt = (text: string) => ({ type: 'text', text });

const body = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [txt('see '), ref(T), txt(' and '), link(N)] }],
};
const purged = (kind: 'ticket' | 'note', id: string) => (kind === 'ticket' && id === T) || (kind === 'note' && id === N);

describe('19.128 a purged chip renders as Deleted item', () => {
  it('replaces both chip kinds, passes through chunkDoc (body and heading), and is inert without the option', () => {
    expect(docToPlainText(body, { isPurged: purged })).toBe(`see ${PURGED_ITEM_LABEL} and ${PURGED_ITEM_LABEL}`);
    expect(chunkDoc(body, { isPurged: purged })).toEqual([
      { headingPath: '', text: `see ${PURGED_ITEM_LABEL} and ${PURGED_ITEM_LABEL}` },
    ]);
    const headed = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [ref(T)] },
        { type: 'paragraph', content: [txt('body')] },
      ],
    };
    expect(chunkDoc(headed, { isPurged: purged })).toEqual([
      { headingPath: PURGED_ITEM_LABEL, text: `${PURGED_ITEM_LABEL}\nbody` },
    ]);
    // CONTROL — the same documents without a resolver, and with one that purges nothing.
    expect(docToPlainText(body)).toBe('see PG-1 Invoice and Minutes');
    expect(docToPlainText(body, { isPurged: () => false })).toBe('see PG-1 Invoice and Minutes');
  });
});

describe('19.129 collectDocReferences finds every chip once', () => {
  it('collects ticket and note ids at any depth, once each, ignoring mentions and empty ids', () => {
    const doc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            ref(T),
            ref(T),
            link(N),
            { type: 'mention', attrs: { userId: 'u1' } },
            { type: 'ticketRef', attrs: { ticketId: '' } },
          ],
        },
        { type: 'blockquote', content: [{ type: 'paragraph', content: [ref(T2)] }] },
      ],
    };
    expect(collectDocReferences(doc)).toEqual({ ticketIds: [T, T2], noteIds: [N] });
    expect(collectDocReferences(null)).toEqual({ ticketIds: [], noteIds: [] }); // CONTROL — total
    expect(collectDocReferences('not a doc')).toEqual({ ticketIds: [], noteIds: [] });
  });
});
```

- [ ] **Step 3: Append the reference world** to `apps/server/test/purge/world.ts`:

```ts
export type ReferenceWorld = TicketWorld & { R: string; N1: string; N2: string; NU: string };

/**
 * The ticket world plus every shape that references T and SURVIVES its purge
 * (ruling A): S1's comment chips T; N1 is born attached to T with a body chip;
 * N2 attaches T and then moves to `inherit` (the D8 hazard); R is born under T
 * and reparented out; NU is unrelated. N1 and NU have chunk rows.
 */
export async function buildReferenceWorld(pool: Pool): Promise<ReferenceWorld> {
  const w = await buildTicketWorld(pool);
  const [R, N1, N2, NU] = [newUlid(), newUlid(), newUlid(), newUlid()];
  const chip = ticketRef(w.T, w.P, 'PG-1', `Invoice ${w.marker}`);
  await applyCommitted(pool, [
    ev(w, 'ticket', w.S1, 'comment.added', { body: doc(text('see '), chip) }),
    noteCreated(w, N1, {
      title: 'Minutes',
      homeProjectId: '',
      scope: { mode: 'workspace' },
      attachTicketId: w.T,
      body: doc(text('about '), chip),
    }),
    noteCreated(w, N2, { title: 'Private', homeProjectId: '', scope: { mode: 'private' } }),
    ev(w, 'note', N2, 'note.attached', { ticketId: w.T }),
    ev(w, 'note', N2, 'note.scope_set', { mode: 'inherit' }),
    ticketCreated(w, R, w.P, 'Moved out', w.T),
    ev(w, 'ticket', R, 'ticket.reparented', { newParentId: null }),
    noteCreated(w, NU, {
      title: 'Unrelated',
      homeProjectId: '',
      scope: { mode: 'workspace' },
      body: doc(text('nothing to see')),
    }),
  ]);
  await insertChunk(pool, w, N1, `about PG-1 Invoice ${w.marker}`);
  await insertChunk(pool, w, NU, 'nothing to see');
  return { ...w, R, N1, N2, NU };
}
```

- [ ] **Step 4: Write the failing server test** `apps/server/test/purge/purge-survivors.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid } from '@gisik-nokma/domain';
import { buildProjectionRegistry } from '../../src/projections/index.js';
import { purgeItem, type PurgeDeps } from '../../src/purge/purge-item.js';
import { startEmbedWorker } from '../../src/search/embed-worker.js';
import { verifyProjections } from '../../src/tools/verify-projections.js';
import { applyCommitted, resetEntitySeqs } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { scan } from './scan.js';
import {
  buildProjectWorld,
  buildReferenceWorld,
  dueAt,
  ev,
  projectCreated,
  recordingStore,
  seedWorkspace,
  ticketCreated,
} from './world.js';

/**
 * Spec §5.6 (T5) and owner ruling 2026-09-28 (A) — survivors. Cases
 * 19.130–19.136 (`test-cases/19-trash.md` §19.15). Every world is its own
 * workspace in one shared database; each `verifyProjections` covers all.
 */

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
  resetEntitySeqs();
}, 60_000);

afterAll(async () => {
  await db.drop();
});

function deps(now: Date): PurgeDeps {
  return { projections: buildProjectionRegistry(), store: recordingStore(), now };
}

async function count(sql: string, params: unknown[]): Promise<number> {
  const { rows } = await db.pool.query<{ n: number }>(sql, params);
  return rows[0]?.n ?? 0;
}

async function clean(): Promise<void> {
  expect(await verifyProjections({ pool: db.pool, projections: buildProjectionRegistry() })).toEqual({
    clean: true,
    diffs: [],
  });
}

describe('19.130 a surviving ticket that chips the purged one stops matching its title', () => {
  it('matches T’s title before, not after; matches "deleted item"; verifies clean', async () => {
    const w = await buildReferenceWorld(db.pool);
    const matches = (query: string) =>
      count(
        `SELECT count(*)::int AS n FROM proj_search WHERE ticket_id = $1 AND tsv @@ plainto_tsquery('simple', $2)`,
        [w.S1, query],
      );
    expect(await matches(w.marker)).toBe(1); // CONTROL
    await purgeItem(db.pool, { kind: 'ticket', id: w.T }, deps(await dueAt(db.pool, 'ticket', w.T)));
    expect(await matches(w.marker)).toBe(0);
    expect(await matches('deleted item')).toBe(1);
    const { rows } = await db.pool.query<{ comments: string }>('SELECT comments FROM proj_search WHERE ticket_id = $1', [
      w.S1,
    ]);
    expect(rows[0]?.comments).toBe('see Deleted item');
    await clean();
  });
});

describe('19.131 surviving notes are detached; an inherit note stays inherit; the replay does not throw', () => {
  it('removes both attachment rows, keeps N2 inherit, and verifies clean', async () => {
    const w = await buildReferenceWorld(db.pool);
    const attached = () =>
      count('SELECT count(*)::int AS n FROM proj_note_attachments WHERE note_id = ANY($1::text[])', [[w.N1, w.N2]]);
    expect(await attached()).toBe(2); // CONTROL
    const outcome = await purgeItem(db.pool, { kind: 'ticket', id: w.T }, deps(await dueAt(db.pool, 'ticket', w.T)));
    expect(outcome.status).toBe('purged');
    expect(await attached()).toBe(0);
    const scopes = await db.pool.query<{ note_id: string; scope_mode: string }>(
      'SELECT note_id, scope_mode FROM proj_notes WHERE note_id = ANY($1::text[]) ORDER BY note_id',
      [[w.N1, w.N2]],
    );
    expect(Object.fromEntries(scopes.rows.map((row) => [row.note_id, row.scope_mode]))).toEqual({
      [w.N1]: 'workspace',
      [w.N2]: 'inherit',
    });
    await clean();
  });
});

describe('19.132 a surviving note that chips T is re-indexed, its lexemes and chunks follow', () => {
  it('renders deleted item, drops T’s words from the vocabulary, deletes its chunks, keeps NU’s', async () => {
    const w = await buildReferenceWorld(db.pool);
    await purgeItem(db.pool, { kind: 'ticket', id: w.T }, deps(await dueAt(db.pool, 'ticket', w.T)));
    const { rows } = await db.pool.query<{ body_text: string }>(
      'SELECT body_text FROM proj_note_search WHERE note_id = $1',
      [w.N1],
    );
    expect(rows[0]?.body_text).toBe('about deleted item');
    const lexemes = await db.pool.query<{ lexeme: string }>(
      'SELECT lexeme FROM proj_note_lexemes WHERE workspace_id = $1',
      [w.WS],
    );
    const words = lexemes.rows.map((row) => row.lexeme);
    expect(words).toContain('deleted');
    expect(words).not.toContain(w.marker);
    expect(await count('SELECT count(*)::int AS n FROM search_note_chunks WHERE note_id = $1', [w.N1])).toBe(0);
    // CONTROL
    expect(await count('SELECT count(*)::int AS n FROM search_note_chunks WHERE note_id = $1', [w.NU])).toBe(1);
  });
});

describe('19.133 the embed worker re-chunks the survivor with Deleted item', () => {
  it('writes N1’s chunk without T’s title, and leaves NU’s current chunk alone', async () => {
    const w = await buildReferenceWorld(db.pool);
    await purgeItem(db.pool, { kind: 'ticket', id: w.T }, deps(await dueAt(db.pool, 'ticket', w.T)));
    const worker = startEmbedWorker(db.pool, {
      intervalMs: 3_600_000,
      embedTexts: async (texts) => texts.map(() => new Float32Array(512).fill(0.5)),
      model: 'test-model@1',
    });
    try {
      for (let pass = 0; pass < 50 && (await worker.runOnce()) > 0; pass += 1) {
        // drain: every note in the database lacking a current chunk is embedded
      }
    } finally {
      worker.stop();
    }
    const n1 = await db.pool.query<{ chunk_text: string }>('SELECT chunk_text FROM search_note_chunks WHERE note_id = $1', [
      w.N1,
    ]);
    expect(n1.rows.map((row) => row.chunk_text)).toEqual(['about Deleted item']);
    // CONTROL
    const nu = await db.pool.query<{ chunk_text: string }>('SELECT chunk_text FROM search_note_chunks WHERE note_id = $1', [
      w.NU,
    ]);
    expect(nu.rows.map((row) => row.chunk_text)).toEqual(['nothing to see']);
  });
});

describe('19.134 the erasure proof, with ruling A’s allowlist', () => {
  it('finds the erased ids and content only where a surviving document quotes them', async () => {
    const w = await buildReferenceWorld(db.pool);
    const before = await scan(db.pool, [w.marker]);
    expect(Object.keys(before)).toEqual(
      expect.arrayContaining([
        'proj_search.comments',
        'proj_note_search.body_text',
        'proj_note_lexemes.lexeme',
        'search_note_chunks.chunk_text',
      ]),
    ); // CONTROL
    await purgeItem(db.pool, { kind: 'ticket', id: w.T }, deps(await dueAt(db.pool, 'ticket', w.T)));
    expect(await scan(db.pool, [w.T, w.C])).toEqual({
      'events.entity_id': 3,
      'events.payload': 4,
      'proj_entity_heads.entity_id': 2,
      'purged_entities.entity_id': 2,
      'proj_ticket_comments.body': 1,
      'proj_notes.body': 1,
    });
    expect(await scan(db.pool, [w.marker])).toEqual({
      'events.payload': 2,
      'proj_ticket_comments.body': 1,
      'proj_notes.body': 1,
    });
    await clean();
  });
});

describe('19.135 a project purge drops the project from a pending invite', () => {
  it('keeps [Q] of [Q, P2], keeps the invite pending, and verifies clean', async () => {
    const w = await buildProjectWorld(db.pool);
    const INV = newUlid();
    await applyCommitted(db.pool, [
      ev(w, 'invite', INV, 'invite.sent', {
        inviteId: INV,
        address: 'guest@example.com',
        channel: 'email',
        role: 'member',
        projectIds: [w.Q, w.P2],
      }),
    ]);
    await purgeItem(db.pool, { kind: 'project', id: w.P2 }, deps(await dueAt(db.pool, 'project', w.P2)));
    const { rows } = await db.pool.query<{ project_ids: string[]; status: string }>(
      'SELECT project_ids, status FROM proj_invites WHERE invite_id = $1',
      [INV],
    );
    expect(rows[0]?.project_ids).toEqual([w.Q]);
    expect(rows[0]?.status).toBe('pending'); // CONTROL
    await clean();
  });
});

describe('19.136 a surviving parent keeps its rollup', () => {
  it('counts one live child before and after purging the deleted one; verifies clean', async () => {
    const base = await seedWorkspace(db.pool);
    const [P, Q0, K1, K2] = [newUlid(), newUlid(), newUlid(), newUlid()];
    await applyCommitted(db.pool, [
      projectCreated(base, P, 'Rollups', 'RL'),
      ticketCreated(base, Q0, P, 'Parent'),
      ticketCreated(base, K1, P, 'Doomed child', Q0),
      ticketCreated(base, K2, P, 'Kept child', Q0),
      ev(base, 'ticket', K1, 'ticket.deleted', {}),
      ev(base, 'ticket', K1, 'purge.marked', {}),
    ]);
    const total = () => count('SELECT total_children AS n FROM proj_rollups WHERE parent_ticket_id = $1', [Q0]);
    expect(await total()).toBe(1); // CONTROL
    await purgeItem(db.pool, { kind: 'ticket', id: K1 }, deps(await dueAt(db.pool, 'ticket', K1)));
    expect(await total()).toBe(1);
    await clean();
  });
});
```

- [ ] **Step 5: Run to see them fail.**

```bash
pnpm turbo run build
cd packages/domain && pnpm exec vitest run --no-file-parallelism test/purge-doc-text.test.ts > /tmp/trash2-domain.log 2>&1; tail -20 /tmp/trash2-domain.log
cd ../../apps/server && pnpm exec vitest run --no-file-parallelism test/purge/purge-survivors.test.ts > /tmp/trash2-server.log 2>&1; tail -20 /tmp/trash2-server.log
```

Expected:
- domain: FAIL. `collectDocReferences` is not exported.
- server:
  - 19.130 red: the marker still matches;
  - 19.131 red: attachment rows remain;
  - 19.132–19.135 red;
  - 19.136 green. It is already true: its control, and the mutation, are what make it a case.

- [ ] **Step 6: Implement the domain half.** In `packages/domain/src/doc-text.ts`, add `import { PURGED_ITEM_LABEL } from './purge.js';` at the top. Then replace `docToPlainText` and `render` (`:64-116`) with:

```ts
/**
 * Trash series Plan 2 (spec §5.6; owner ruling 2026-09-28 A). A chip to an
 * ERASED item keeps its baked KEY and title in the stored document — a purge
 * does not rewrite other documents — but a caller that knows which ids are
 * erased passes `isPurged`, and the chip then renders as `PURGED_ITEM_LABEL`.
 * Synchronous on purpose: this function runs inside projections and the embed
 * worker, which look the ids up first (`collectDocReferences` below) and pass a
 * predicate over the answer.
 */
export type DocTextOptions = {
  isPurged?: (kind: 'ticket' | 'note', id: string) => boolean;
};

export function docToPlainText(doc: unknown, options: DocTextOptions = {}): string {
  return render(doc, 0, options).replace(/[ \t]+\n/g, '\n').replace(/\n{2,}/g, '\n').trim();
}

function render(node: unknown, depth: number, options: DocTextOptions): string {
  if (depth > MAX_DEPTH) return '';
  if (node === null || typeof node !== 'object' || Array.isArray(node)) return '';
  const candidate = node as { type?: unknown; text?: unknown; attrs?: unknown; content?: unknown };
  if (candidate.type === 'text') {
    return typeof candidate.text === 'string' ? candidate.text : '';
  }
  if (candidate.type === 'mention') {
    const attrs = (
      typeof candidate.attrs === 'object' && candidate.attrs !== null ? candidate.attrs : {}
    ) as { userId?: unknown; label?: unknown };
    const label =
      typeof attrs.label === 'string' && attrs.label.length > 0
        ? attrs.label
        : typeof attrs.userId === 'string'
          ? attrs.userId
          : 'unknown';
    return `@${label}`;
  }
  if (candidate.type === 'hardBreak' || candidate.type === 'hard_break') return '\n';
  // A wiki-link (spec §3.5) contributes its stored TITLE, never its noteId.
  // The id is what the editor navigates by; the title is what a person read,
  // and a search index that carried `01J9GNOTE…` would match nothing anyone
  // typed. An absent or non-string title renders '', the same safe branch the
  // mention node takes for a missing label. A link to an ERASED note renders
  // `PURGED_ITEM_LABEL` (trash Plan 2).
  if (candidate.type === 'wikiLink') {
    const attrs = (
      typeof candidate.attrs === 'object' && candidate.attrs !== null ? candidate.attrs : {}
    ) as { title?: unknown; noteId?: unknown };
    if (typeof attrs.noteId === 'string' && options.isPurged?.('note', attrs.noteId) === true) {
      return PURGED_ITEM_LABEL;
    }
    return typeof attrs.title === 'string' ? attrs.title : '';
  }
  // A ticket reference (spec §14.2, Plan 7 Task 1) contributes `KEY title`,
  // never its ticketId — the same rule the wiki-link branch above follows for
  // its own id. A missing key falls back to the title alone rather than
  // gluing an empty string onto the front of it. A reference to an ERASED
  // ticket renders `PURGED_ITEM_LABEL` (trash Plan 2).
  if (candidate.type === 'ticketRef') {
    const attrs = (
      typeof candidate.attrs === 'object' && candidate.attrs !== null ? candidate.attrs : {}
    ) as { key?: unknown; title?: unknown; ticketId?: unknown };
    if (typeof attrs.ticketId === 'string' && options.isPurged?.('ticket', attrs.ticketId) === true) {
      return PURGED_ITEM_LABEL;
    }
    const key = typeof attrs.key === 'string' ? attrs.key : '';
    const title = typeof attrs.title === 'string' ? attrs.title : '';
    return key.length > 0 ? `${key} ${title}` : title;
  }
  const children = Array.isArray(candidate.content)
    ? candidate.content.map((child) => render(child, depth + 1, options)).join('')
    : '';
  const isBlock = typeof candidate.type === 'string' && BLOCK_NODE_TYPES.has(candidate.type);
  return isBlock && children.length > 0 ? `${children}\n` : children;
}

export type DocReferences = { ticketIds: string[]; noteIds: string[] };

/**
 * Every ticket a `ticketRef` chips and every note a `wikiLink` links, once each,
 * in document order — what a caller must look up before it can build an
 * `isPurged` predicate. Total, and depth-capped by the same `MAX_DEPTH` as
 * `render`, for the same reasons.
 */
export function collectDocReferences(doc: unknown): DocReferences {
  const ticketIds: string[] = [];
  const noteIds: string[] = [];
  const walk = (node: unknown, depth: number): void => {
    if (depth > MAX_DEPTH) return;
    if (Array.isArray(node)) {
      for (const child of node) walk(child, depth);
      return;
    }
    if (node === null || typeof node !== 'object') return;
    const candidate = node as { type?: unknown; attrs?: unknown; content?: unknown };
    const attrs = (
      typeof candidate.attrs === 'object' && candidate.attrs !== null ? candidate.attrs : {}
    ) as { ticketId?: unknown; noteId?: unknown };
    if (candidate.type === 'ticketRef' && typeof attrs.ticketId === 'string' && attrs.ticketId !== '') {
      if (!ticketIds.includes(attrs.ticketId)) ticketIds.push(attrs.ticketId);
    }
    if (candidate.type === 'wikiLink' && typeof attrs.noteId === 'string' && attrs.noteId !== '') {
      if (!noteIds.includes(attrs.noteId)) noteIds.push(attrs.noteId);
    }
    if (candidate.content !== undefined) walk(candidate.content, depth + 1);
  };
  walk(doc, 0);
  return { ticketIds, noteIds };
}
```

In `packages/domain/src/doc-chunks.ts`:
- change the import (`:1`) to `import { docToPlainText, type DocTextOptions } from './doc-text.js';`;
- change the signature (`:73`) to `export function chunkDoc(doc: unknown, options: DocTextOptions = {}): DocChunk[] {`;
- change both calls, `path[level - 1] = docToPlainText(block);` (`:99`) and `const text = docToPlainText(block);` (`:103`), to pass `options` as the second argument.

- [ ] **Step 7: Implement the server half.** Create `apps/server/src/purge/purged-lookup.ts`:

```ts
import { collectDocReferences, type DocTextOptions } from '@gisik-nokma/domain';
import type { Queryable } from '../db/queryable.js';

/**
 * Lookups against `purged_entities` (D2). Used by the projections that fold a
 * surviving reference (search, note search, notes, invites), by the embed
 * worker, and by the purge's own survivor re-derivation — the same answer live
 * and on rebuild, because the registry is never reset.
 */

export async function purgedIdsAmong(db: Queryable, kind: string, ids: readonly string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const { rows } = await db.query<{ entity_id: string }>(
    'SELECT entity_id FROM purged_entities WHERE entity_kind = $1 AND entity_id = ANY($2::text[])',
    [kind, [...ids]],
  );
  return new Set(rows.map((row) => row.entity_id));
}

/** A synchronous `isPurged` predicate over every chip in `docs`, looked up once. */
export async function purgedResolverFor(
  db: Queryable,
  docs: readonly unknown[],
): Promise<NonNullable<DocTextOptions['isPurged']>> {
  const ticketIds = new Set<string>();
  const noteIds = new Set<string>();
  for (const doc of docs) {
    const refs = collectDocReferences(doc);
    for (const id of refs.ticketIds) ticketIds.add(id);
    for (const id of refs.noteIds) noteIds.add(id);
  }
  const tickets = await purgedIdsAmong(db, 'ticket', [...ticketIds]);
  const notes = await purgedIdsAmong(db, 'note', [...noteIds]);
  return (kind, id) => (kind === 'ticket' ? tickets : notes).has(id);
}
```

In `apps/server/src/projections/search.ts`:
- add `import { purgedResolverFor } from '../purge/purged-lookup.js';`;
- change the three renders:
  - `:83`: `docToPlainText(payload.description, { isPurged: await purgedResolverFor(tx, [payload.description]) }),`
  - `:112`: `docToPlainText(payload.value, { isPurged: await purgedResolverFor(tx, [payload.value]) }),`
  - `:120`: `const text = docToPlainText(payload.body, { isPurged: await purgedResolverFor(tx, [payload.body]) });`
- In the "Determinism" docblock (`:17-23`), after "reads no other projection's table", add: "— it does read `purged_entities` (trash Plan 2, D2), which is not a projection, is never reset, and answers identically live and on rebuild, so a chip to an erased item renders `Deleted item` both ways".

In `apps/server/src/projections/note-search.ts`:
- add `import { purgedResolverFor } from '../purge/purged-lookup.js';`;
- change `async function reindexNote(` (`:133`) to `export async function reindexNote(`;
- change `:146` to `const bodyText = foldSearchText(docToPlainText(note.body, { isPurged: await purgedResolverFor(tx, [note.body]) }));`.

In `apps/server/src/projections/notes.ts`:
- add `import { purgedIdsAmong } from '../purge/purged-lookup.js';`;
- add this function above `notesProjection`:

```ts
/**
 * Trash series Plan 2, deviation D8. The tickets this note attached — by its
 * OWN earlier `note.created`/`note.attached`/`note.detached` — that are now
 * erased. They have no `proj_note_attachments` row (a purge removes it, and the
 * fold below never writes one), but the REDUCER must still see them: a note
 * that attached T and later moved to `inherit` was legal, and without T in
 * `attachedTicketIds` `applyNoteEvent` refuses the `note.scope_set` and a
 * rebuild throws. Reads the note's own stream strictly before this event —
 * per-entity causality, which replay guarantees. The EXISTS short-circuits the
 * common case (no ticket in this workspace has ever been purged).
 */
async function purgedAttachmentsOf(tx: PoolClient, event: LedgerEvent): Promise<string[]> {
  const any = await tx.query<{ present: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM purged_entities WHERE workspace_id = $1 AND entity_kind = 'ticket') AS present`,
    [event.workspaceId],
  );
  if (any.rows[0]?.present !== true) return [];
  const { rows } = await tx.query<{ type: string; payload: { ticketId?: unknown; attachTicketId?: unknown } }>(
    `SELECT type, payload FROM events
      WHERE entity_kind = 'note' AND entity_id = $1 AND seq < $2
        AND type IN ('note.created', 'note.attached', 'note.detached')
      ORDER BY seq`,
    [event.entity.id, event.seq],
  );
  const attached = new Set<string>();
  for (const row of rows) {
    const id = row.type === 'note.created' ? row.payload.attachTicketId : row.payload.ticketId;
    if (typeof id !== 'string') continue;
    if (row.type === 'note.detached') attached.delete(id);
    else attached.add(id);
  }
  return [...(await purgedIdsAmong(tx, 'ticket', [...attached]))].sort();
}
```

Then replace `apply`'s body from `const current = await getNoteStateFromDb(tx, event.entity.id);` (`:235`) through the end of the attachment `if`/`else if` chain (`:251`) with:

```ts
    const stored = await getNoteStateFromDb(tx, event.entity.id);
    const purgedAttached = stored === null ? [] : await purgedAttachmentsOf(tx, event);
    const current =
      stored === null || purgedAttached.length === 0
        ? stored
        : { ...stored, attachedTicketIds: [...new Set([...stored.attachedTicketIds, ...purgedAttached])].sort() };
    const next = applyNoteEvent(current, event);
    const priorDeletion = await currentNoteDeletion(tx, event.entity.id);
    const deletedAt = event.type === 'note.deleted' ? event.serverTime : event.type === 'note.restored' ? null : priorDeletion.deletedAt;
    const deletedBy = event.type === 'note.deleted' ? event.actorId : event.type === 'note.restored' ? null : priorDeletion.deletedBy;
    await upsertNote(tx, next, event, deletedAt, deletedBy);
    // A link to an ERASED ticket is never written (spec §5.6: the surviving note
    // is detached) — live and on rebuild alike, because the registry answers
    // the same both ways.
    const isErased = async (ticketId: string) => (await purgedIdsAmong(tx, 'ticket', [ticketId])).size > 0;
    if (event.type === 'note.created' && next.attachedTicketIds.length === 1) {
      const ticketId = next.attachedTicketIds[0]!;
      if (!(await isErased(ticketId))) await insertAttachment(tx, next, ticketId, event);
    } else if (event.type === 'note.attached') {
      const ticketId = (event.payload as { ticketId: string }).ticketId;
      if (!(await isErased(ticketId))) await insertAttachment(tx, next, ticketId, event);
    } else if (event.type === 'note.detached') {
      await tx.query('DELETE FROM proj_note_attachments WHERE note_id = $1 AND ticket_id = $2', [
        next.noteId,
        (event.payload as { ticketId: string }).ticketId,
      ]);
    }
```

In `apps/server/src/projections/proj-invites.ts`:
- add `import { purgedIdsAmong } from '../purge/purged-lookup.js';`;
- in the `invite.sent` arm (`:93-104`), replace `payload.projectIds ?? [],` with a filtered list computed just above the `tx.query`:

```ts
      // Trash series Plan 2 (spec §5.6): a project erased after the invitation
      // was sent is no longer offered — live (the purge's survivor update) and on
      // rebuild (this filter) alike.
      const projectIds = payload.projectIds ?? [];
      const erased = await purgedIdsAmong(tx, 'project', projectIds);
```

and pass `projectIds.filter((id) => !erased.has(id)),` in that parameter position.

In `apps/server/src/search/embed-worker.ts`:
- add `import { purgedResolverFor } from '../purge/purged-lookup.js';`;
- change `:142` to `const chunks = chunkDoc(note.body, { isPurged: await purgedResolverFor(pool, [note.body]) });`.

Create `apps/server/src/purge/survivors.ts`:

```ts
import type { PoolClient } from 'pg';
import { readEntityEvents } from '../ledger/event-store.js';
import { reindexNote } from '../projections/note-search.js';
import type { Projection, ProjectionRegistry } from '../projections/registry.js';
import type { ErasureSet } from './erasure.js';

/**
 * Survivors (spec §5.6, owner ruling 2026-09-28 A): rows OUTSIDE the erasure set
 * that a purge touches. Each is re-derived by replaying its own surviving events
 * through the owning projection — the same computation a rebuild performs over
 * the post-purge ledger, so `verifyProjections` stays clean.
 */

export type Survivors = { ticketIds: string[]; noteIds: string[]; inviteIds: string[] };

/**
 * Called after `purge_ledger` (the set is known and its own events are gone)
 * and BEFORE `eraseRows` (the attachment rows that name erased tickets are still
 * there to find). Scoped to the workspace: chips are authored from a
 * workspace-scoped picker, and a workspace purge has no survivors at all.
 */
export async function collectSurvivors(db: PoolClient, set: ErasureSet): Promise<Survivors> {
  if (set.target.kind === 'workspace') return { ticketIds: [], noteIds: [], inviteIds: [] };
  const erased = new Set(set.entities.map((entity) => `${entity.kind}:${entity.id}`));
  const patterns = [...set.ticketIds, ...set.noteIds, ...set.projectIds].map((id) => `%${id}%`);
  const referencing = await db.query<{ entity_kind: string; entity_id: string }>(
    `SELECT DISTINCT entity_kind, entity_id FROM events
      WHERE workspace_id = $1 AND entity_kind IN ('ticket', 'note') AND payload::text LIKE ANY ($2::text[])`,
    [set.workspaceId, patterns],
  );
  const attached = await db.query<{ note_id: string }>(
    'SELECT DISTINCT note_id FROM proj_note_attachments WHERE ticket_id = ANY($1::text[])',
    [set.ticketIds],
  );
  const invites = await db.query<{ invite_id: string }>(
    `SELECT invite_id FROM proj_invites WHERE workspace_id = $1 AND project_ids && $2::text[] ORDER BY invite_id`,
    [set.workspaceId, set.projectIds],
  );
  const tickets = new Set<string>();
  const notes = new Set<string>();
  for (const row of referencing.rows) {
    if (erased.has(`${row.entity_kind}:${row.entity_id}`)) continue;
    (row.entity_kind === 'ticket' ? tickets : notes).add(row.entity_id);
  }
  for (const row of attached.rows) {
    if (!erased.has(`note:${row.note_id}`)) notes.add(row.note_id);
  }
  return {
    ticketIds: [...tickets].sort(),
    noteIds: [...notes].sort(),
    inviteIds: invites.rows.map((row) => row.invite_id),
  };
}

function projectionNamed(registry: ProjectionRegistry, name: string): Projection {
  const projection = registry.get(name);
  if (projection === undefined) throw new Error(`rederiveSurvivors: projection ${name} is not registered`);
  return projection;
}

/**
 * Called after `recordPurged` — every projection replayed here reads
 * `purged_entities` — and before `rederiveWorkspaceLexemes`, which reads the
 * note search rows this rewrites.
 */
export async function rederiveSurvivors(
  db: PoolClient,
  survivors: Survivors,
  set: ErasureSet,
  registry: ProjectionRegistry,
): Promise<void> {
  const search = projectionNamed(registry, 'proj_search');
  const notes = projectionNamed(registry, 'proj_notes');
  const lifecycle = projectionNamed(registry, 'proj_lifecycle');

  for (const ticketId of survivors.ticketIds) {
    await db.query('DELETE FROM proj_search WHERE ticket_id = $1', [ticketId]);
    for (const event of await readEntityEvents(db, 'ticket', ticketId)) {
      await search.apply(event, db);
    }
  }

  for (const noteId of survivors.noteIds) {
    await db.query('DELETE FROM proj_note_attachments WHERE note_id = $1', [noteId]);
    await db.query('DELETE FROM proj_notes WHERE note_id = $1', [noteId]);
    for (const event of await readEntityEvents(db, 'note', noteId)) {
      // `proj_lifecycle` writes the note's purge_marked_* columns, which
      // `proj_notes`' whole-row upsert preserves (`notes.ts`'s ON CONFLICT list
      // omits them), so the per-event interleaving matches a rebuild's order.
      await notes.apply(event, db);
      await lifecycle.apply(event, db);
    }
    await reindexNote(db, noteId);
    await db.query('DELETE FROM search_note_chunks WHERE note_id = $1', [noteId]);
  }

  for (const inviteId of survivors.inviteIds) {
    await db.query(
      `UPDATE proj_invites
          SET project_ids = ARRAY(
                SELECT p FROM unnest(project_ids) WITH ORDINALITY AS u(p, n)
                 WHERE p <> ALL($2::text[]) ORDER BY n)
        WHERE invite_id = $1`,
      [inviteId, set.projectIds],
    );
  }
}
```

In `apps/server/src/purge/purge-item.ts`:
- add `import { collectSurvivors, rederiveSurvivors } from './survivors.js';`;
- directly after `const set = toErasureSet(target, item.workspaceId, rows);`, add `const survivors = await collectSurvivors(client, set);`;
- directly after `await replayRemaining(client, set, deps.projections);`, and before the lexeme call, add `await rederiveSurvivors(client, survivors, set, deps.projections);`.

- [ ] **Step 8: Run to see them pass** (same commands). Then run the whole server suite once. This task touches the search, note-search, notes and invite projections, which many suites read:

```bash
cd apps/server && pnpm exec vitest run --no-file-parallelism > /tmp/trash2-server.log 2>&1; tail -20 /tmp/trash2-server.log
```

Then run the domain suite: `packages/editor/test/doc-text-conformance.test.ts` must stay green. `docToPlainText`'s output without options is unchanged.

- [ ] **Step 9: Flip 19.128–19.136 to ✅, and write the `Features.md` bullet:**

```markdown
- ⚙️ **Survivors of a purge** (`apps/server/src/purge/survivors.ts`, `purged-lookup.ts`; `packages/domain/src/doc-text.ts`; spec §5.6, owner ruling 2026-09-28 A) — a purge erases the item, not other documents' quotes of it: a chip in a surviving comment, description or note keeps its baked KEY and title. `docToPlainText`/`chunkDoc` take an `isPurged` resolver and render a chip to an erased item as `Deleted item`; `collectDocReferences` finds the ids to look up. The purge finds every surviving ticket and note whose events name an erased id (and every note attached to an erased ticket) and re-derives it by replay — `proj_search`, `proj_notes`/`proj_note_attachments` (the link to an erased ticket is dropped; a note that moved to `inherit` keeps its scope, D8), `proj_note_search` — deletes the note's chunks for the embed worker to rebuild (it applies the same resolver), drops erased projects from pending invites, and re-derives the workspace's lexemes. Every projection that folds such a reference consults `purged_entities`, so a rebuild agrees. Rendering the chip on screen is Plan 3's. Cases 19.128–19.136.
```

- [ ] **Step 10: Commit** `Trash 2/Task 7: survivors — search, notes, chunks, invites (19.128-19.136)`. Then work through the mutations: mutate, show red, restore.

---

### Task 8: The door after a purge

**Files:**
- Create: `apps/server/src/purge/check-purged.ts`, `apps/server/test/purge/door.test.ts`
- Modify:
  - `apps/server/src/ingest/ingest-service.ts`: `commitOne`, between the entity↔workspace guard (`:201-213`) and the permission gate (`:215-253`).
  - `test-cases/19-trash.md`, `Features.md`.

**Interfaces:**
- Consumes: `PURGED_REASON`, `PURGE_SERVER_ONLY_REASON` (Task 2); `purged_entities` (Task 4); `Refusal` (`@gisik-nokma/rule-engine`, the shape `permissions/check-lifecycle.ts:34-36` returns).
- Produces:
  - `PURGE_RULE = 'purge.erased'`
  - `checkPurged(db: Queryable, env: EventEnvelope): Promise<Refusal | null>`

**Why both doors (D10).**
- The permission gate (`checkPermission`) runs only at the client door (`ingest-service.ts:236-246`: `door === null ? null : …`).
- An offline push refused on a ticket is answered by a server-appended `claim.contested` on that ticket, through `deps.serverAppend`, which is `ingest.ingestBatch`, the internal door (`sync/sync-service.ts:197-206,416-417`; `index.ts:136`).
- A client-only refusal would therefore let a stale device's claim against a purged ticket write a new ledger row for the purged entity, with the claim embedded whole.
- So `checkPurged` is unconditional, like `checkContestCoherence` (`ingest-service.ts:255-289`). With the refusal in place, that contest append is refused too, and `sync-service.ts:254-258` answers the claim with the refusal instead of a 500.

**Placement inside `commitOne`:**
- **After** the entity↔workspace guard. A purged ticket's entity head is its tombstone, in the same workspace, so the guard passes.
- **Before** the permission gate. A purged workspace has no memberships left, so the gate would otherwise answer `permission.role` and name the wrong fault. This is the ordering rule `commitOne` already states for its own guard (`ingest-service.ts:226-230`, "the refusal that names the actual fault").

**What it refuses:**
- `purge.completed` from anyone: `PURGE_SERVER_ONLY_REASON`. The purge appends it directly and never through ingest.
- With `PURGED_REASON`, any event where one of these is in `purged_entities`:
  - the event's entity;
  - its workspace;
  - an id its payload names as a container or link target:
    - `ticket.created`: `projectId`, `parentId`;
    - `ticket.reparented`: `newParentId`;
    - `note.created`: `homeProjectId`, `attachTicketId`;
    - `note.moved`: `homeProjectId`;
    - `note.attached`: `ticketId`.

  The payload field names are read from `packages/domain/src/events/ticket-events.ts:42-49,208` and `events/note-events.ts:72-79,96-97`.

Cases (`## 19.16 The door after a purge`):

```markdown
- ❌ **19.140 — `purge.completed` is refused with `PURGE_SERVER_ONLY_REASON` at the client door (from the workspace owner) and at the internal door;** control: an ordinary `ticket.field_set` by the same owner commits. Mutation: drop the `purge.completed` arm of `checkPurged`.
- ❌ **19.141 — at the client door, a `ticket.field_set` and a `comment.added` on the purged ticket, and a `ticket.created` naming it as parent, are refused with `PURGED_REASON`;** control: a `comment.added` on the surviving sibling commits. Mutation: drop the payload-id arm (the `ticket.created` then answers with a hierarchy refusal).
- ❌ **19.142 — a `project.created` in a purged workspace, by the user who owned it, is refused with `PURGED_REASON`, not `permission.role`;** control: the same event in that user's other workspace commits. Mutation: check only the event's entity, not its workspace.
- ❌ **19.143 — at the INTERNAL door, a server-origin `claim.contested` on the purged ticket is refused with `PURGED_REASON` and the ticket's stream is unchanged; at the client door, a `note.attached` naming it is refused;** control: the same contest on the sibling, and an attach of the sibling, commit. Mutation: move the `checkPurged` call from `commitOne` into `checkPermission` (client door only).
```

- [ ] **Step 1: Write the cases** under `## 19.16 The door after a purge`. Confirm the case-id count moved by 4.

- [ ] **Step 2: Write the failing test** `apps/server/test/purge/door.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { evaluateEvent } from '@gisik-nokma/rule-engine';
import {
  newUlid,
  PURGE_SERVER_ONLY_REASON,
  PURGED_REASON,
  type EntityKind,
  type SubmittedEvent,
} from '@gisik-nokma/domain';
import { createIngestService, type IngestService } from '../../src/ingest/ingest-service.js';
import { buildProjectionRegistry } from '../../src/projections/index.js';
import { PURGE_RULE } from '../../src/purge/check-purged.js';
import { purgeItem } from '../../src/purge/purge-item.js';
import { buildContestedClaim } from '../../src/sync/contest-coherence.js';
import { applyCommitted, resetEntitySeqs } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import {
  buildTicketWorld,
  buildWorkspacePair,
  dueAt,
  noteCreated,
  recordingStore,
  TYPE_ID,
  type TicketWorld,
  type WorkspacePair,
} from './world.js';

/**
 * Spec §5.7, server half — "a device holding unsent events against a purged
 * item has them refused at the door ('This item was permanently deleted')".
 * Cases 19.140–19.143 (`test-cases/19-trash.md` §19.16), through the real
 * ingest service: `ingestClientBatch` is the client door, `ingestBatch` the
 * internal one.
 */

let db: TestDatabase;
let ingest: IngestService;
let w: TicketWorld;
let pair: WorkspacePair;
const NOTE = newUlid();

function submitted(
  workspaceId: string,
  actorId: string,
  kind: EntityKind,
  id: string,
  type: string,
  payload: unknown,
  origin: SubmittedEvent['origin'] = 'web',
): SubmittedEvent {
  return {
    id: newUlid(),
    workspaceId,
    entity: { kind, id },
    type,
    version: 1,
    payload,
    actorId,
    origin,
    clientTime: '2026-09-28T10:00:00.000Z',
  };
}

beforeAll(async () => {
  db = await createTestDatabase();
  resetEntitySeqs();
  const projections = buildProjectionRegistry();
  ingest = createIngestService({ pool: db.pool, evaluate: evaluateEvent, projections });
  w = await buildTicketWorld(db.pool);
  await applyCommitted(db.pool, [
    noteCreated(w, NOTE, { title: 'Live note', homeProjectId: '', scope: { mode: 'workspace' } }),
  ]);
  await purgeItem(db.pool, { kind: 'ticket', id: w.T }, {
    projections,
    store: recordingStore(),
    now: await dueAt(db.pool, 'ticket', w.T),
  });
  pair = await buildWorkspacePair(db.pool);
  await purgeItem(db.pool, { kind: 'workspace', id: pair.W1.WS }, {
    projections,
    store: recordingStore(),
    now: await dueAt(db.pool, 'workspace', pair.W1.WS),
  });
}, 60_000);

afterAll(async () => {
  await db.drop();
});

describe('19.140 only the purge records a purge', () => {
  it('refuses purge.completed at both doors; the owner’s ordinary claim commits', async () => {
    const payload = { kind: 'ticket', markedBy: w.OWNER, markedAt: '2026-09-13T10:00:00.000Z' };
    const [client] = await ingest.ingestClientBatch(
      [submitted(w.WS, w.OWNER, 'ticket', w.S1, 'purge.completed', payload)],
      w.OWNER,
    );
    expect(client).toMatchObject({ status: 'refused', rule: PURGE_RULE, reason: PURGE_SERVER_ONLY_REASON });
    const [internal] = await ingest.ingestBatch([
      submitted(w.WS, w.OWNER, 'ticket', w.S1, 'purge.completed', payload, 'server'),
    ]);
    expect(internal).toMatchObject({ status: 'refused', rule: PURGE_RULE, reason: PURGE_SERVER_ONLY_REASON });
    // CONTROL
    const [ok] = await ingest.ingestClientBatch(
      [submitted(w.WS, w.OWNER, 'ticket', w.S1, 'ticket.field_set', { fieldId: 'title', value: 'Renamed sibling' })],
      w.OWNER,
    );
    expect(ok?.status).toBe('committed');
  });
});

describe('19.141 claims about a purged ticket are refused', () => {
  it('refuses a field set, a comment and a child creation; a comment on the sibling commits', async () => {
    const body = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'late' }] }] };
    const results = await ingest.ingestClientBatch(
      [
        submitted(w.WS, w.OWNER, 'ticket', w.T, 'ticket.field_set', { fieldId: 'title', value: 'late' }),
        submitted(w.WS, w.OWNER, 'ticket', w.T, 'comment.added', { body }),
        submitted(w.WS, w.OWNER, 'ticket', newUlid(), 'ticket.created', {
          typeId: TYPE_ID,
          projectId: w.P,
          parentId: w.T,
          title: 'Orphan',
        }),
      ],
      w.OWNER,
    );
    for (const result of results) {
      expect(result).toMatchObject({ status: 'refused', rule: PURGE_RULE, reason: PURGED_REASON });
    }
    // CONTROL
    const [ok] = await ingest.ingestClientBatch([submitted(w.WS, w.OWNER, 'ticket', w.S1, 'comment.added', { body })], w.OWNER);
    expect(ok?.status).toBe('committed');
  });
});

describe('19.142 a purged workspace answers with the purge, not a membership refusal', () => {
  it('refuses project.created in W1 with PURGED_REASON; the same in W2 commits', async () => {
    const [refused] = await ingest.ingestClientBatch(
      [submitted(pair.W1.WS, pair.U, 'project', newUlid(), 'project.created', { name: 'Back again', prefix: 'BA' })],
      pair.U,
    );
    expect(refused).toMatchObject({ status: 'refused', rule: PURGE_RULE, reason: PURGED_REASON });
    // CONTROL
    const [ok] = await ingest.ingestClientBatch(
      [submitted(pair.W2.WS, pair.U, 'project', newUlid(), 'project.created', { name: 'Back again', prefix: 'BA' })],
      pair.U,
    );
    expect(ok?.status).toBe('committed');
  });
});

describe('19.143 the internal door refuses too, so a sync contest cannot resurrect the purged ticket', () => {
  it('refuses a contest on T and an attach of T; the same on the sibling commit', async () => {
    const contestOn = (ticketId: string) =>
      buildContestedClaim({
        originalEvent: submitted(w.WS, w.OWNER, 'ticket', ticketId, 'ticket.field_set', { fieldId: 'title', value: 'x' }),
        rule: 'workflow.transition-not-allowed',
        reason: 'That move is not allowed from here.',
        actorId: w.OWNER,
      });
    const streamOfT = async () =>
      (
        await db.pool.query<{ type: string }>(
          `SELECT type FROM events WHERE entity_kind = 'ticket' AND entity_id = $1 ORDER BY seq`,
          [w.T],
        )
      ).rows.map((row) => row.type);
    const before = await streamOfT();
    const [refused] = await ingest.ingestBatch([contestOn(w.T)]);
    expect(refused).toMatchObject({ status: 'refused', rule: PURGE_RULE, reason: PURGED_REASON });
    expect(await streamOfT()).toEqual(before);
    expect(before).toEqual(['ticket.created', 'purge.completed']);
    const [attach] = await ingest.ingestClientBatch(
      [submitted(w.WS, w.OWNER, 'note', NOTE, 'note.attached', { ticketId: w.T })],
      w.OWNER,
    );
    expect(attach).toMatchObject({ status: 'refused', rule: PURGE_RULE, reason: PURGED_REASON });
    // CONTROL
    const [contestOk] = await ingest.ingestBatch([contestOn(w.S1)]);
    expect(contestOk?.status).toBe('committed');
    const [attachOk] = await ingest.ingestClientBatch(
      [submitted(w.WS, w.OWNER, 'note', NOTE, 'note.attached', { ticketId: w.S1 })],
      w.OWNER,
    );
    expect(attachOk?.status).toBe('committed');
  });
});
```

- [ ] **Step 3: Run to see it fail.** Command: `cd apps/server && pnpm exec vitest run --no-file-parallelism test/purge/door.test.ts > /tmp/trash2-server.log 2>&1; tail -20 /tmp/trash2-server.log`. Expected: FAIL. `../../src/purge/check-purged.js` does not exist.

- [ ] **Step 4: Implement.** Create `apps/server/src/purge/check-purged.ts`:

```ts
import { PURGE_SERVER_ONLY_REASON, PURGED_REASON, type EventEnvelope } from '@gisik-nokma/domain';
import type { Refusal } from '@gisik-nokma/rule-engine';
import type { Queryable } from '../db/queryable.js';

/**
 * The door after a purge (trash series Plan 2; spec §5.7, server half). Runs
 * at BOTH ingest doors (D10) — see `ingest-service.ts`'s call site for why the
 * internal door needs it too.
 */
export const PURGE_RULE = 'purge.erased';

function refuse(reason: string): Refusal {
  return { refused: true, rule: PURGE_RULE, reason };
}

/**
 * The ids a payload names as a container or a link target, by type. Field names
 * are the schemas' own (`events/ticket-events.ts` `ticketCreatedPayload`,
 * `ticketReparentedPayload`; `events/note-events.ts` `noteCreatedPayload`,
 * `noteMovedPayload`, `noteAttachedPayload`). Read defensively: the payload
 * has already parsed, but this must never throw on a shape it does not know.
 */
function payloadIds(env: EventEnvelope): Array<[kind: string, id: string]> {
  const payload = (typeof env.payload === 'object' && env.payload !== null ? env.payload : {}) as Record<
    string,
    unknown
  >;
  const named: Array<[string, string]> = [];
  const add = (kind: string, value: unknown): void => {
    if (typeof value === 'string' && value !== '') named.push([kind, value]);
  };
  switch (env.type) {
    case 'ticket.created':
      add('project', payload['projectId']);
      add('ticket', payload['parentId']);
      break;
    case 'ticket.reparented':
      add('ticket', payload['newParentId']);
      break;
    case 'note.created':
      add('project', payload['homeProjectId']);
      add('ticket', payload['attachTicketId']);
      break;
    case 'note.moved':
      add('project', payload['homeProjectId']);
      break;
    case 'note.attached':
      add('ticket', payload['ticketId']);
      break;
    default:
      break;
  }
  return named;
}

export async function checkPurged(db: Queryable, env: EventEnvelope): Promise<Refusal | null> {
  if (env.type === 'purge.completed') return refuse(PURGE_SERVER_ONLY_REASON);
  const named: Array<[string, string]> = [
    [env.entity.kind, env.entity.id],
    ['workspace', env.workspaceId],
    ...payloadIds(env),
  ];
  const { rows } = await db.query<{ hit: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM purged_entities p
         JOIN unnest($1::text[], $2::text[]) AS n(kind, id) ON p.entity_kind = n.kind AND p.entity_id = n.id
     ) AS hit`,
    [named.map(([kind]) => kind), named.map(([, id]) => id)],
  );
  return rows[0]?.hit === true ? refuse(PURGED_REASON) : null;
}
```

In `apps/server/src/ingest/ingest-service.ts`:
- add `import { checkPurged } from '../purge/check-purged.js';`;
- directly after the entity↔workspace guard's closing `}` (`:213`), and before the permission-gate comment (`:215`), add:

```ts
      // Trash series Plan 2 (spec §5.7, server half; deviation D10). BOTH
      // doors, like `checkContestCoherence` below. The internal door needs it:
      // an offline claim refused on a ticket comes back as a server-appended
      // `claim.contested` on that ticket through `serverAppend`
      // (`sync/sync-service.ts`), and against a PURGED ticket that append would
      // write the purged entity back into the ledger with the claim embedded.
      // Before the permission gate: a purged workspace has no members left, and
      // "you are not a member" would name the wrong fault. Also refuses
      // `purge.completed` from anyone — the purge appends it directly.
      const purgedRefusal = await checkPurged(client, envelope);
      if (purgedRefusal !== null) {
        await client.query('ROLLBACK');
        return {
          result: { status: 'refused', eventId: envelope.id, rule: purgedRefusal.rule, reason: purgedRefusal.reason },
          committed: null,
        };
      }
```

- [ ] **Step 5: Run to see it pass** (same command). Then run `test/ingest.test.ts`, `test/events-route.test.ts`, `test/sync`, `test/permissions` and `test/gates`. Every ingest now makes one indexed lookup on `purged_entities`.

- [ ] **Step 6: Flip 19.140–19.143 to ✅, and write the `Features.md` bullet:**

```markdown
- ⚙️ **The door after a purge** (`apps/server/src/purge/check-purged.ts`, called from `ingest/ingest-service.ts`'s `commitOne`; spec §5.7 server half) — at BOTH ingest doors, after the entity↔workspace guard and before the permission gate: `purge.completed` from anyone is refused with `PURGE_SERVER_ONLY_REASON` (only the purge writes it, directly); any event whose entity, workspace, or payload container/link (`ticket.created` projectId/parentId, `ticket.reparented` newParentId, `note.created` homeProjectId/attachTicketId, `note.moved`, `note.attached`) is in `purged_entities` is refused with `PURGED_REASON` ("This item was permanently deleted.", rule `purge.erased`). The internal door matters: a sync-time contest against a purged ticket would otherwise write the purged entity back into the ledger (D10). The device-side notice and outbox drop are Plan 3's. Cases 19.140–19.143.
```

- [ ] **Step 7: Commit** `Trash 2/Task 8: the door refuses claims about purged items (19.140-19.143)`. Then work through the mutations: mutate, show red, restore.

---

### Task 9: The purge sweep, the pending-object drain, and the worker's object store

**Files:**
- Create: `apps/server/src/purge/sweep.ts`, `apps/server/test/purge/sweep.test.ts`, `apps/server/test/deploy/backup-worker-env.test.ts`
- Modify:
  - `apps/server/src/ops/backup-daemon-main.ts`: the interval reads `:156-171`, `ingest` `:178-182`, `scheduledJobs` `:184-269`.
  - `apps/server/test/ops/backup-daemon-main.test.ts`: a new `it` in the `describe` at `:63`.
  - `deploy/do/app.yaml`: the `backup` worker's envs, after `OBJECT_STORE_S3_SECRET_ACCESS_KEY`, `:311-312`.
  - `.env.example`: after `AUTO_CLOSE_SWEEP_INTERVAL_MS`, `:352`.
  - `docs/runbook.md`: a new section before "## Restore drill".
  - `test-cases/19-trash.md`, `Features.md`.

**Interfaces:**
- Consumes: `purgeItem`, `PurgeOutcome`, `PurgeTarget` (Task 5); `deletePendingObjects` (Task 5); `ErrorAlerter` (`apps/server/src/alerts/error-alerter.ts`); `requirePositiveIntervalMs`, `ScheduledJob` (`apps/server/src/ops/schedule.ts`); `purgeDueAt`.
- Produces:
  - `PURGE_KIND_ORDER: readonly LifecycleKind[]` (`['workspace', 'project', 'ticket', 'note']`)
  - `dueCandidates(pool: Pool, now: Date): Promise<PurgeTarget[]>`
  - `type PurgeSweepDeps = { pool: Pool; projections: ProjectionRegistry; store: Pick<ObjectStore, 'delete'>; alerter: ErrorAlerter; now?: () => Date; log?: (message: string, error?: unknown) => void; purge?: typeof purgeItem }`
  - `type PurgeSweepReport = { candidates: number; purged: number; skipped: number; failed: number; objectsDeleted: number; objectsPending: number }`
  - `runPurgeSweep(deps: PurgeSweepDeps): Promise<PurgeSweepReport>`

**The sweep, and why it lives in the backup worker:**
- It is modelled on `auto-close/sweep.ts` (an injected `now` and `log`, and a report), and is hosted as a new job `purge` on the backup worker's one scheduler.
- That worker already runs the auto-close, notification and orphan sweeps (`backup-daemon-main.ts:184-269`). A new process would be a new App Platform component for no gain.
- `backup-daemon-main.ts` calls `main()` at import (`:286`), so tests drive `runPurgeSweep` directly. The daemon's wiring is proved by spawning it (`test/ops/backup-daemon-main.test.ts:26-61`).
- **Candidates:**
  - every workspace, project, ticket and note row with `purge_marked_at IS NOT NULL` and `purgeDueAt(purge_marked_at) <= now` (D13), minus any id already in `purged_entities`;
  - ordered parents first (workspace, project, ticket, note), then by mark instant, then by id.
- **Each item runs in its own transaction.** A throw is logged and alerted once, as `purge:<kind>:<id>`, and the sweep continues. The item keeps its mark and is retried on the next sweep (spec §5.1, §7).
- **Then the queue drains.** `deletePendingObjects` over every queued key is the only path by which an object whose delete failed, or whose process died between `COMMIT` and the delete, is ever removed (Review Focus 4).

Cases (`## 19.17 The purge sweep`):

```markdown
- ❌ **19.145 — the sweep purges every due item parents first: with a marked project P2 and its marked ticket B2 both due, P2 is purged and B2 is skipped (already erased by P2), and a note marked later (not yet due) is not a candidate;** control: the later note is untouched. Mutation: reverse `PURGE_KIND_ORDER` (B2 is then purged on its own first — `purged: 2`).
- ❌ **19.146 — when the first of two due items throws, the second is still purged, the failure is logged and alerted once as `purge:ticket:<id>`, and the next sweep purges the first;** control: the second sweep reports no failure and the alert count stays one. Mutation: remove the `try`/`catch` around the per-item purge.
- ❌ **19.147 — an object left queued by a failed delete is retried by every sweep: a still-failing store leaves it queued with `attempts` incremented, a working one deletes it and empties the queue;** control: before any sweep the key is queued with `attempts = 1`. Mutation: in `deletePendingObjects`, delete the queue row before calling `store.delete`.
- ❌ **19.148 — a marked item is not a candidate one millisecond before `purgeDueAt(mark)` and is one at exactly that instant;** control: the second run purges it. Mutation: filter with `<` instead of `<=`.
- ❌ **19.149 — the daemon refuses `PURGE_SWEEP_INTERVAL_MS=0` before arming any job, naming the variable;** control: with `3600000` it arms and announces itself. Mutation: remove the `requirePositiveIntervalMs` call from the `purge` job's `delayMs`.
- ❌ **19.150 — the deploy spec's `backup` worker declares `OBJECT_STORE=s3` and `OBJECT_STORE_S3_BUCKET=gisik-nokma-attachments`;** control: that is the bucket the `server` service writes attachments to, and it differs from `BACKUP_S3_BUCKET`. Mutation: delete the worker's `OBJECT_STORE` entry.
- ❌ **19.151 — an item already in `purged_entities` is never a candidate, even if its lifecycle row still says it is due;** control: a second due item in the same sweep is a candidate and is purged. Mutation: drop the `NOT EXISTS (… purged_entities …)` filter from the candidate query.
```

- [ ] **Step 1: Write the cases** under `## 19.17 The purge sweep`. Confirm the case-id count moved by 7.

- [ ] **Step 2: Write the failing tests.** First `apps/server/test/purge/sweep.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { newUlid } from '@gisik-nokma/domain';
import type { ErrorAlerter } from '../../src/alerts/error-alerter.js';
import { buildProjectionRegistry } from '../../src/projections/index.js';
import { purgeItem } from '../../src/purge/purge-item.js';
import { runPurgeSweep, type PurgeSweepDeps } from '../../src/purge/sweep.js';
import { applyCommitted, resetEntitySeqs } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import {
  buildProjectWorld,
  buildTicketWorld,
  dueAt,
  ev,
  projectCreated,
  recordingStore,
  seedWorkspace,
  ticketCreated,
} from './world.js';

/**
 * Spec §5.1, §7 — the purge sweep. Cases 19.145–19.148, 19.151
 * (`test-cases/19-trash.md` §19.17). EVERY CASE BUILDS ITS OWN DATABASE, for
 * the reason `test/auto-close/sweep.test.ts` gives: the report's counters are
 * global, so a shared database would make each case's arithmetic depend on its
 * neighbours' residue.
 */

async function withDb(fn: (db: TestDatabase) => Promise<void>): Promise<void> {
  resetEntitySeqs();
  const db = await createTestDatabase();
  try {
    await fn(db);
  } finally {
    await db.drop();
  }
}

function recordingAlerter() {
  const calls: Array<{ context: string; message: string }> = [];
  const alerter: ErrorAlerter & { calls: typeof calls } = {
    calls,
    async notify(context: string, error: unknown): Promise<void> {
      calls.push({ context, message: error instanceof Error ? error.message : String(error) });
    },
  };
  return alerter;
}

function sweepDeps(db: TestDatabase, now: Date, overrides: Partial<PurgeSweepDeps> = {}): PurgeSweepDeps {
  return {
    pool: db.pool,
    projections: buildProjectionRegistry(),
    store: recordingStore(),
    alerter: recordingAlerter(),
    now: () => now,
    log: () => {},
    ...overrides,
  };
}

async function count(db: TestDatabase, sql: string, params: unknown[]): Promise<number> {
  const { rows } = await db.pool.query<{ n: number }>(sql, params);
  return rows[0]?.n ?? 0;
}

describe('19.145 parents first; what is not due is not touched', () => {
  it('purges P2, skips B2 as already erased, and leaves the later-marked note alone', async () => {
    await withDb(async (db) => {
      const w = await buildProjectWorld(db.pool);
      await applyCommitted(db.pool, [ev(w, 'note', w.NW, 'note.deleted', {}), ev(w, 'note', w.NW, 'purge.marked', {})]);
      const now = await dueAt(db.pool, 'project', w.P2);
      const report = await runPurgeSweep(sweepDeps(db, now));
      expect(report).toMatchObject({ candidates: 2, purged: 1, skipped: 1, failed: 0 });
      expect(await count(db, `SELECT count(*)::int AS n FROM events WHERE entity_id = $1`, [w.B2])).toBe(0);
      // CONTROL — the note marked after P2 is not yet due.
      expect(await count(db, 'SELECT count(*)::int AS n FROM proj_notes WHERE note_id = $1', [w.NW])).toBe(1);
    });
  }, 60_000);
});

describe('19.146 one failure neither stops the sweep nor is forgotten', () => {
  it('purges T2 past T1’s failure, alerts once, and purges T1 on the next sweep', async () => {
    await withDb(async (db) => {
      const base = await seedWorkspace(db.pool);
      const [P, T1, T2] = [newUlid(), newUlid(), newUlid()];
      await applyCommitted(db.pool, [
        projectCreated(base, P, 'Sweep', 'SW'),
        ticketCreated(base, T1, P, 'First'),
        ticketCreated(base, T2, P, 'Second'),
        ev(base, 'ticket', T1, 'ticket.deleted', {}),
        ev(base, 'ticket', T1, 'purge.marked', {}),
        ev(base, 'ticket', T2, 'ticket.deleted', {}),
        ev(base, 'ticket', T2, 'purge.marked', {}),
      ]);
      const now = await dueAt(db.pool, 'ticket', T2);
      const failing = new Set([T1]);
      const purge: typeof purgeItem = async (pool, target, deps) => {
        if (failing.has(target.id)) throw new Error(`injected failure for ${target.id}`);
        return purgeItem(pool, target, deps);
      };
      const alerter = recordingAlerter();
      const logged: string[] = [];
      const deps = sweepDeps(db, now, { purge, alerter, log: (message) => logged.push(message) });

      const first = await runPurgeSweep(deps);
      expect(first).toMatchObject({ candidates: 2, purged: 1, failed: 1 });
      expect(alerter.calls).toEqual([{ context: `purge:ticket:${T1}`, message: `injected failure for ${T1}` }]);
      expect(logged.some((line) => line.includes(T1))).toBe(true);
      expect(await count(db, 'SELECT count(*)::int AS n FROM proj_tickets WHERE ticket_id = $1', [T1])).toBe(1);
      expect(await count(db, 'SELECT count(*)::int AS n FROM proj_tickets WHERE ticket_id = $1', [T2])).toBe(0);

      failing.delete(T1);
      const second = await runPurgeSweep(deps);
      expect(second).toMatchObject({ candidates: 1, purged: 1, failed: 0 }); // CONTROL
      expect(alerter.calls).toHaveLength(1);
    });
  }, 60_000);
});

describe('19.147 a queued object is retried by every sweep until its delete succeeds', () => {
  it('keeps it queued through a failing sweep and empties the queue through a working one', async () => {
    await withDb(async (db) => {
      const w = await buildTicketWorld(db.pool);
      const due = await dueAt(db.pool, 'ticket', w.T);
      await purgeItem(db.pool, { kind: 'ticket', id: w.T }, {
        projections: buildProjectionRegistry(),
        store: recordingStore(new Set([w.keyT])),
        now: due,
      });
      const attempts = () => count(db, 'SELECT attempts AS n FROM purge_pending_objects WHERE object_key = $1', [w.keyT]);
      expect(await attempts()).toBe(1); // CONTROL — the crash window: committed, object still there

      const stillFailing = await runPurgeSweep(sweepDeps(db, due, { store: recordingStore(new Set([w.keyT])) }));
      expect(stillFailing).toMatchObject({ candidates: 0, objectsDeleted: 0, objectsPending: 1 });
      expect(await attempts()).toBe(2);

      const store = recordingStore();
      const working = await runPurgeSweep(sweepDeps(db, due, { store }));
      expect(working).toMatchObject({ candidates: 0, objectsDeleted: 1, objectsPending: 0 });
      expect(store.deleted).toEqual([w.keyT]);
      expect(await count(db, 'SELECT count(*)::int AS n FROM purge_pending_objects', [])).toBe(0);
    });
  }, 60_000);
});

describe('19.148 the due instant is purgeDueAt(mark), inclusive', () => {
  it('is not a candidate 1 ms before, and is purged at exactly the instant', async () => {
    await withDb(async (db) => {
      const w = await buildTicketWorld(db.pool);
      const due = await dueAt(db.pool, 'ticket', w.T);
      expect(await runPurgeSweep(sweepDeps(db, new Date(due.getTime() - 1)))).toMatchObject({ candidates: 0, purged: 0 });
      expect(await runPurgeSweep(sweepDeps(db, due))).toMatchObject({ candidates: 1, purged: 1 }); // CONTROL
    });
  }, 60_000);
});

describe('19.151 the registry wins over a stale lifecycle row', () => {
  it('never offers an id already in purged_entities; purges the other due item', async () => {
    await withDb(async (db) => {
      const stale = await buildTicketWorld(db.pool);
      const live = await buildTicketWorld(db.pool);
      await db.pool.query(
        `INSERT INTO purged_entities (entity_kind, entity_id, workspace_id, purged_at) VALUES ('ticket', $1, $2, now())`,
        [stale.T, stale.WS],
      );
      const now = new Date(
        Math.max((await dueAt(db.pool, 'ticket', stale.T)).getTime(), (await dueAt(db.pool, 'ticket', live.T)).getTime()),
      );
      const report = await runPurgeSweep(sweepDeps(db, now));
      expect(report).toMatchObject({ candidates: 1, purged: 1, skipped: 0 });
      expect(await count(db, 'SELECT count(*)::int AS n FROM proj_tickets WHERE ticket_id = $1', [live.T])).toBe(0); // CONTROL
      expect(await count(db, 'SELECT count(*)::int AS n FROM proj_tickets WHERE ticket_id = $1', [stale.T])).toBe(1);
    });
  }, 60_000);
});
```

Then `apps/server/test/deploy/backup-worker-env.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';

/**
 * Trash series Plan 2, deviation D5 — the purge deletes attachment objects
 * from the BACKUP worker, which (measured 2026-09-28) had no OBJECT_STORE /
 * OBJECT_STORE_S3_BUCKET and so built a LocalDiskStore
 * (`apps/server/src/attachments/store-config.ts`, `OBJECT_STORE ?? 'local'`).
 * Case 19.150 (`test-cases/19-trash.md` §19.17). A spec change is NOT applied by
 * a push: see docs/runbook.md, "Permanent-delete sweep".
 */

type Env = { key: string; value?: string; type?: string };
type Component = { name: string; envs?: Env[] };
type Spec = { services?: Component[]; workers?: Component[] };

const spec = parseYaml(readFileSync(resolve(__dirname, '../../../../deploy/do/app.yaml'), 'utf8')) as Spec;

function envOf(components: Component[] | undefined, name: string): Record<string, string | undefined> {
  const component = components?.find((candidate) => candidate.name === name);
  return Object.fromEntries((component?.envs ?? []).map((env) => [env.key, env.value]));
}

describe('19.150 the backup worker reaches the real attachment store', () => {
  it('declares OBJECT_STORE=s3 and the attachment bucket, the one the server writes to', () => {
    const worker = envOf(spec.workers, 'backup');
    const server = envOf(spec.services, 'server');
    expect(worker['OBJECT_STORE']).toBe('s3');
    expect(worker['OBJECT_STORE_S3_BUCKET']).toBe('gisik-nokma-attachments');
    // CONTROL — the same bucket as the server's attachments, and not the backup bucket.
    expect(server['OBJECT_STORE_S3_BUCKET']).toBe(worker['OBJECT_STORE_S3_BUCKET']);
    expect(worker['BACKUP_S3_BUCKET']).not.toBe(worker['OBJECT_STORE_S3_BUCKET']);
  });
});
```

Add to `apps/server/test/ops/backup-daemon-main.test.ts`, inside `describe('backup-daemon-main — one scheduler for all five jobs', …)` (`:63`):

```ts
  it('19.149 refuses PURGE_SWEEP_INTERVAL_MS=0 before arming any job, naming the variable', async () => {
    const refused = await runDaemon({
      DATABASE_URL: db.url,
      NOTIFICATION_SWEEP_INTERVAL_MS: '3600000',
      PURGE_SWEEP_INTERVAL_MS: '0',
    });
    expect(refused.stdout).not.toContain(SCHEDULED);
    expect(refused.stderr).toContain('PURGE_SWEEP_INTERVAL_MS');
    // CONTROL — the same command with a valid interval arms and announces itself.
    const armed = await runDaemon({
      DATABASE_URL: db.url,
      NOTIFICATION_SWEEP_INTERVAL_MS: '3600000',
      PURGE_SWEEP_INTERVAL_MS: '3600000',
    });
    expect(armed.stdout).toContain(SCHEDULED);
  }, 90_000);
```

- [ ] **Step 3: Run to see them fail.**

```bash
cd apps/server && pnpm exec vitest run --no-file-parallelism test/purge/sweep.test.ts test/deploy/backup-worker-env.test.ts test/ops/backup-daemon-main.test.ts > /tmp/trash2-server.log 2>&1; tail -20 /tmp/trash2-server.log
```

Expected:
- `sweep.js` is missing;
- 19.150 red: the worker has no `OBJECT_STORE`;
- 19.149 red: the daemon arms, because `PURGE_SWEEP_INTERVAL_MS` is not read yet.

- [ ] **Step 4: Implement the sweep** `apps/server/src/purge/sweep.ts`:

```ts
import type { Pool } from 'pg';
import { purgeDueAt, type LifecycleKind } from '@gisik-nokma/domain';
import type { ErrorAlerter } from '../alerts/error-alerter.js';
import type { ObjectStore } from '../attachments/object-store.js';
import type { ProjectionRegistry } from '../projections/registry.js';
import { deletePendingObjects } from './pending-objects.js';
import { purgeItem, type PurgeOutcome, type PurgeTarget } from './purge-item.js';

/**
 * The permanent-delete sweep (trash series Plan 2; spec §5.1, §7), modelled on
 * `../auto-close/sweep.ts` and hosted on the backup worker's scheduler
 * (`../ops/backup-daemon-main.ts`, job `purge`).
 */

/** Parents first: a workspace purge takes its projects; a project its tickets and notes. */
export const PURGE_KIND_ORDER: readonly LifecycleKind[] = ['workspace', 'project', 'ticket', 'note'];

export type PurgeSweepDeps = {
  pool: Pool;
  projections: ProjectionRegistry;
  store: Pick<ObjectStore, 'delete'>;
  alerter: ErrorAlerter;
  now?: () => Date;
  log?: (message: string, error?: unknown) => void;
  /** Test seam: the per-item purge. Defaults to `purgeItem`. */
  purge?: typeof purgeItem;
};

export type PurgeSweepReport = {
  candidates: number;
  purged: number;
  skipped: number;
  failed: number;
  objectsDeleted: number;
  objectsPending: number;
};

type CandidateRow = { kind: LifecycleKind; id: string; purge_marked_at: Date };

/**
 * Plan 1's lifecycle columns, not a ledger scan (D13): `purge.unmarked` nulls
 * `purge_marked_at`, and an erased item has no row left. An id already in
 * `purged_entities` is never offered — the registry is the truth about what is
 * gone. The due instant is `purgeDueAt(mark)`, inclusive, computed here; the
 * delay is spelled only in `packages/domain/src/lifecycle.ts`.
 */
export async function dueCandidates(pool: Pool, now: Date): Promise<PurgeTarget[]> {
  const { rows } = await pool.query<CandidateRow>(
    `SELECT c.kind, c.id, c.purge_marked_at FROM (
       SELECT 'workspace' AS kind, workspace_id AS id, purge_marked_at FROM proj_workspaces WHERE purge_marked_at IS NOT NULL
       UNION ALL
       SELECT 'project', project_id, purge_marked_at FROM proj_projects WHERE purge_marked_at IS NOT NULL
       UNION ALL
       SELECT 'ticket', ticket_id, purge_marked_at FROM proj_tickets WHERE purge_marked_at IS NOT NULL
       UNION ALL
       SELECT 'note', note_id, purge_marked_at FROM proj_notes WHERE purge_marked_at IS NOT NULL
     ) c
     WHERE NOT EXISTS (SELECT 1 FROM purged_entities p WHERE p.entity_kind = c.kind AND p.entity_id = c.id)`,
  );
  return rows
    .filter((row) => Date.parse(purgeDueAt(row.purge_marked_at.toISOString())) <= now.getTime())
    .sort(
      (a, b) =>
        PURGE_KIND_ORDER.indexOf(a.kind) - PURGE_KIND_ORDER.indexOf(b.kind) ||
        a.purge_marked_at.getTime() - b.purge_marked_at.getTime() ||
        (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
    )
    .map((row) => ({ kind: row.kind, id: row.id }));
}

export async function runPurgeSweep(deps: PurgeSweepDeps): Promise<PurgeSweepReport> {
  const log = deps.log ?? ((message: string, error?: unknown) => console.error(message, error));
  const now = deps.now === undefined ? new Date() : deps.now();
  const purge = deps.purge ?? purgeItem;
  const targets = await dueCandidates(deps.pool, now);
  const report: PurgeSweepReport = {
    candidates: targets.length,
    purged: 0,
    skipped: 0,
    failed: 0,
    objectsDeleted: 0,
    objectsPending: 0,
  };

  for (const target of targets) {
    let outcome: PurgeOutcome;
    try {
      outcome = await purge(deps.pool, target, { projections: deps.projections, store: deps.store, now });
    } catch (error) {
      // Spec §7: logged, alerted, retried next sweep. The item keeps its mark,
      // so it stays in Deleted items (overdue) until a sweep succeeds; one
      // failure never stops the others.
      report.failed += 1;
      log(`purge failed for ${target.kind} ${target.id}`, error);
      try {
        await deps.alerter.notify(`purge:${target.kind}:${target.id}`, error);
      } catch (notifyError) {
        log('purge alerter failed', notifyError);
      }
      continue;
    }
    if (outcome.status === 'purged') {
      report.purged += 1;
      report.objectsDeleted += outcome.objectsDeleted;
    } else {
      report.skipped += 1;
    }
  }

  // The drain (spec §5.2): the only path by which an object whose delete
  // failed — or whose process died between COMMIT and the delete — is removed.
  const drained = await deletePendingObjects(deps.pool, deps.store);
  report.objectsDeleted += drained.deleted;
  report.objectsPending = drained.pending;
  return report;
}
```

- [ ] **Step 5: Wire the daemon.** In `apps/server/src/ops/backup-daemon-main.ts`, add `import { runPurgeSweep } from '../purge/sweep.js';` beside the other sweep imports (`:8-15`). After the auto-close interval block (`:166-171`), add:

```ts
  // The permanent-delete sweep (trash series Plan 2, spec §5.1): the same
  // read-once, validate-on-every-call shape and empty-means-unset handling as
  // the two sweeps above, default one hour.
  const rawPurgeInterval = process.env.PURGE_SWEEP_INTERVAL_MS;
  const purgeSweepIntervalMs = Number(
    rawPurgeInterval === undefined || rawPurgeInterval.trim() === '' ? '3600000' : rawPurgeInterval,
  );
```

Replace the `ingest` construction (`:178-182`) so that the ingest service and the purge share one registry:

```ts
  const projections = buildProjectionRegistry();
  const ingest = createIngestService({
    pool,
    evaluate: evaluateEvent,
    projections,
  });
```

Append a sixth job to `scheduledJobs`, after `auto-close` (`:252-268`):

```ts
    {
      name: 'purge',
      run: async (): Promise<void> => {
        // `store` is the attachment store built above — which is why the worker
        // needs OBJECT_STORE=s3 in production (deploy/do/app.yaml, D5).
        const report = await runPurgeSweep({ pool, projections, store, alerter });
        console.log(JSON.stringify({ msg: 'purge sweep complete', ...report }));
      },
      delayMs: () => requirePositiveIntervalMs(purgeSweepIntervalMs, 'PURGE_SWEEP_INTERVAL_MS'),
    },
```

One text goes stale in this change: the test file's `describe` title `'backup-daemon-main — one scheduler for all five jobs'` (`test/ops/backup-daemon-main.test.ts:63`). Rename it to `'backup-daemon-main — one scheduler for all six jobs'`. The `.env.example` sentence calling auto-close "the FIFTH job" stays true.

- [ ] **Step 6: The worker's object store** (D5). In `deploy/do/app.yaml`, in the `backup` worker's `envs`, directly after the `OBJECT_STORE_S3_SECRET_ACCESS_KEY` entry (`:311-312`), add:

```yaml
      # Trash series Plan 2 (2026-09-28, deviation D5): the permanent-delete
      # sweep deletes ATTACHMENT objects from this worker, so it needs the
      # attachment store -- without these two, createObjectStoreFromEnv defaults
      # to a LocalDiskStore (apps/server/src/attachments/store-config.ts) and
      # every purge's object delete would "succeed" against an empty local
      # folder. Measured 2026-09-28: the live worker had neither, so the 30-day
      # orphan sweep on this same worker has been listing that empty folder too.
      # THIS ALSO ARMS THE ORPHAN SWEEP AGAINST THE REAL BUCKET FOR THE FIRST
      # TIME -- run it with --dry-run first (docs/runbook.md, "Permanent-delete
      # sweep"). Same bucket as the server component's OBJECT_STORE_S3_BUCKET.
      - key: OBJECT_STORE
        value: s3
      - key: OBJECT_STORE_S3_BUCKET
        value: gisik-nokma-attachments
```

In `.env.example`, after `AUTO_CLOSE_SWEEP_INTERVAL_MS=3600000` (`:352`), add:

```bash

# The permanent-delete sweep (trash series Plan 2, spec §5.1) is the SIXTH job
# of the same daemon: every workspace, project, ticket or note whose purge mark
# has fallen due (purgeDueAt, packages/domain/src/lifecycle.ts) is erased, then
# queued attachment objects are deleted. Same read-once, validate-on-every-call
# shape and the same empty-means-unset handling as the two sweeps above:
# optional, default 3600000 (one hour); a non-positive or non-numeric value is
# refused with THIS name, aborting the whole scheduler before any timer is armed.
# The sweep deletes attachment objects, so the worker needs OBJECT_STORE=s3 and
# the attachment bucket in production (deploy/do/app.yaml), not the local default.
PURGE_SWEEP_INTERVAL_MS=3600000
```

In `docs/runbook.md`, add before `## Restore drill (monthly, and after any schema change)`:

```markdown
## Permanent-delete sweep (trash series)

The backup worker runs an hourly `purge` job (`apps/server/src/purge/sweep.ts`): every workspace, project,
ticket or note whose "delete permanently" mark has fallen due is erased — its ledger rows, projections,
search rows and attachment objects — leaving only a content-free `purge.completed` tombstone and, for a
ticket, its redacted key slot. A failure alerts the webhook as `purge:<kind>:<id>` and is retried on the
next run; the item stays in Deleted items, overdue, until one succeeds. Object deletes that fail stay in
`purge_pending_objects` (with `attempts` and `last_error`) and are retried every run.

**Release note for the first deploy of this job.** It needs the worker to reach the attachment bucket:
`deploy/do/app.yaml` now gives the `backup` worker `OBJECT_STORE=s3` and the attachment bucket. **A push
does not apply spec changes** — apply the spec with `doctl apps update <app-id> --spec deploy/do/app.yaml`
and confirm the worker's environment afterwards. The same change arms the 30-day orphan sweep against the
real bucket for the first time (it has been listing an empty local folder): before its first run, 30 days
after the worker boots, run `sweep:orphans` with `--dry-run` from the worker's console and read the count
(see "Orphaned uploads" above).
```

Run `pnpm check:runbook` and `pnpm check:env`.

- [ ] **Step 7: Run to see them pass** (same command as Step 3). Then run the whole `test/ops`, `test/purge` and `test/deploy` directories.

- [ ] **Step 8: Flip 19.145–19.151 to ✅, and write the `Features.md` bullet:**

```markdown
- ⚙️ **The purge sweep** (`apps/server/src/purge/sweep.ts`; job `purge` on the backup worker, `ops/backup-daemon-main.ts`; spec §5.1, §7) — hourly (`PURGE_SWEEP_INTERVAL_MS`, default 3600000, refused if not a positive integer): every workspace/project/ticket/note whose `purge_marked_at` is set and `purgeDueAt(mark) <= now`, minus anything already in `purged_entities`, parents first; each in its own transaction via `purgeItem`; a throw is logged, alerted once as `purge:<kind>:<id>`, and retried next sweep while the rest continue; then `purge_pending_objects` is drained. The backup worker now declares `OBJECT_STORE=s3` and the attachment bucket (`deploy/do/app.yaml`) — without them it had a local-disk store, which also means the 30-day orphan sweep had been a no-op in production and is now armed against the real bucket (D5; release note in `docs/runbook.md`). Cases 19.145–19.151.
```

- [ ] **Step 9: Commit** `Trash 2/Task 9: purge sweep, pending-object drain, worker object store (19.145-19.151)`. Then work through the mutations: mutate, show red, restore.

---

### Task 10: Backup retention

**Files:**
- Create: `apps/server/src/ops/prune-backups.ts`, `apps/server/test/ops/prune-backups.test.ts`
- Modify:
  - `apps/server/src/ops/backup-daemon-main.ts`: imports `:16-25`; after the store construction `:145-146`; the `pg-dump` and `ledger-export` jobs `:195-209`.
  - `apps/server/test/ops/backup-daemon-main.test.ts`: one `it`.
  - `.env.example`: after `LEDGER_EXPORT_DOW_UTC`, `:330`.
  - `docs/runbook.md`: "## Backups", `:138-145`.
  - `test-cases/19-trash.md`, `Features.md`.

**Interfaces:**
- Consumes:
  - `BackupS3Target` and `s3TargetFromEnv(env, bucketVar)` (`apps/server/src/ops/object-sink.ts`, the `BackupS3Target` type and the function after it).
  - `ErrorAlerter`.
  - The backup key shapes: `pg/<YYYY-MM-DDTHH-MM>.dump` (`ops/pg-dump.ts:34-35`) and `ledger/<YYYY-MM-DD>.ndjson.gz` (`ops/export-ledger.ts:54`).
- Produces:
  - `BACKUP_PREFIXES = ['pg/', 'ledger/'] as const`
  - `DEFAULT_BACKUP_RETENTION_DAYS = 30`
  - `type PruneReport = { examined: number; deleted: string[]; keptNewest: string[]; errors: string[] }`
  - `backupRetentionDaysFromEnv(env: NodeJS.ProcessEnv): number`
  - `pruneBackups(target: BackupS3Target, options: { now: Date; retentionDays: number }): Promise<PruneReport>`
  - `runThenPrune(name: string, run: () => Promise<void>, prune: () => Promise<PruneReport>, alerter: ErrorAlerter, log?: (message: string, error?: unknown) => void): Promise<void>`

**What was measured before writing this (2026-09-28, owner-authorised, read-only):**
- Neither bucket, `gisik-nokma-backups` nor `gisik-nokma-attachments`, has a lifecycle rule: `GET ?lifecycle` answered `404 NoSuchLifecycleConfiguration`. The control was the same key listing the bucket.
- The backup bucket held 7 objects: 6 under `pg/` and 1 under `ledger/`.
- So this prune is the ONLY retention, and nothing is duplicated (spec §5.8's condition).

**The rules:**
1. Retention is by `LastModified`, per prefix.
2. An object is deleted when it is strictly older than `retentionDays` (`LastModified < now − retentionDays`), so one exactly at the boundary is kept.
3. **The newest object under each prefix is never deleted, whatever its age** (spec §5.8; Review Focus 5). A worker that stopped backing up for three months must not wake to an empty bucket.
4. `ListObjectsV2` pagination is followed.
5. Deletes go one key at a time with `DeleteObjectCommand` (D9). A failed delete is recorded in the report and never thrown.
6. The prune runs after each SUCCESSFUL scheduled `pg-dump` and `ledger-export` (`runThenPrune`):
   - a failed backup is not followed by a prune;
   - a prune failure, thrown or reported, alerts `backup:prune-after-<job>` and never fails the backup job.
7. **Not on `--once`.** `backup-daemon-main.ts:122-127` keeps every destructive errand off the manual path, and so does this.

Cases (`## 19.18 Backup retention`):

```markdown
- ❌ **19.153 — `pruneBackups` deletes a `pg/` object older than the window and keeps one exactly at the boundary and the newest;** control: `examined` counts all three and `keptNewest` names the newest. Mutation: delete at `<=` the cutoff instead of `<`.
- ❌ **19.154 — the newest object under a prefix is kept even when it is older than the window: a lone 90-day-old `pg/` dump survives;** control: under `ledger/`, of a 90-day and a 60-day export, the 90-day one IS deleted. Mutation: drop the newest-per-prefix exclusion.
- ❌ **19.155 — pagination is followed: an old object on the second `ListObjectsV2` page is deleted, and the second request carries the first page's continuation token;** control: the first page's old object is deleted too. Mutation: read only the first page (ignore `IsTruncated`).
- ❌ **19.156 — a failing `DeleteObject` is reported in `errors`, not thrown, and the other deletes still happen;** control: the second old object is in `deleted`. Mutation: remove the `try`/`catch` around the delete.
- ❌ **19.157 — `BACKUP_RETENTION_DAYS` defaults to 30 when unset or empty, accepts `45`, and throws naming the variable for `abc`, `0`, `-3` and `1.5`;** control: the default. Mutation: parse with `Number.parseInt` (accepts `1.5` as 1).
- ❌ **19.158 — `runThenPrune` prunes only after the job succeeds; a prune that throws or reports errors alerts `backup:prune-after-<job>` and resolves;** control: a failing job rejects and the prune is never called. Mutation: rethrow the prune's error.
- ❌ **19.159 — the daemon refuses `BACKUP_RETENTION_DAYS=abc` before arming any job, naming the variable;** control: with `30` it arms and announces itself. Mutation: move the `backupRetentionDaysFromEnv` call inside the prune closure (read lazily).
```

- [ ] **Step 1: Write the cases** under `## 19.18 Backup retention`. Confirm the case-id count moved by 7.

- [ ] **Step 2: Write the failing test** `apps/server/test/ops/prune-backups.test.ts`:

```ts
import { DeleteObjectCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { mockClient } from 'aws-sdk-client-mock';
import { beforeEach, describe, expect, it } from 'vitest';
import type { ErrorAlerter } from '../../src/alerts/error-alerter.js';
import {
  backupRetentionDaysFromEnv,
  DEFAULT_BACKUP_RETENTION_DAYS,
  pruneBackups,
  runThenPrune,
  type PruneReport,
} from '../../src/ops/prune-backups.js';

/**
 * Spec §5.8 (T4) — backup retention. Cases 19.153–19.158
 * (`test-cases/19-trash.md` §19.18). S3 is mocked the way
 * `test/ops/object-sink.test.ts` mocks it; the clock is a fixed `now`.
 */

const s3Mock = mockClient(S3Client);
const target = { client: new S3Client({ region: 'us-east-1' }), bucket: 'gisik-nokma-backups' };
const NOW = new Date('2026-09-28T00:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY);

beforeEach(() => {
  s3Mock.reset();
});

function listing(prefix: string, contents: Array<{ Key: string; LastModified: Date }>) {
  s3Mock.on(ListObjectsV2Command, { Prefix: prefix }).resolves({ Contents: contents, IsTruncated: false });
}

function deletedKeys(): string[] {
  return s3Mock.commandCalls(DeleteObjectCommand).map((call) => call.args[0].input.Key ?? '');
}

describe('19.153 older than the window is deleted; the boundary and the newest are kept', () => {
  it('deletes only the 31-day-old dump', async () => {
    listing('pg/', [
      { Key: 'pg/2026-08-28T21-00.dump', LastModified: daysAgo(31) },
      { Key: 'pg/2026-08-29T21-00.dump', LastModified: daysAgo(30) },
      { Key: 'pg/2026-09-27T21-00.dump', LastModified: daysAgo(1) },
    ]);
    listing('ledger/', []);
    s3Mock.on(DeleteObjectCommand).resolves({});
    const report = await pruneBackups(target, { now: NOW, retentionDays: 30 });
    expect(report.deleted).toEqual(['pg/2026-08-28T21-00.dump']);
    expect(deletedKeys()).toEqual(['pg/2026-08-28T21-00.dump']);
    // CONTROL
    expect(report.examined).toBe(3);
    expect(report.keptNewest).toEqual(['pg/2026-09-27T21-00.dump']);
  });
});

describe('19.154 the newest backup under a prefix is never deleted', () => {
  it('keeps a lone 90-day-old dump, and still prunes an old export that is not the newest', async () => {
    listing('pg/', [{ Key: 'pg/2026-06-30T21-00.dump', LastModified: daysAgo(90) }]);
    listing('ledger/', [
      { Key: 'ledger/2026-06-30.ndjson.gz', LastModified: daysAgo(90) },
      { Key: 'ledger/2026-07-30.ndjson.gz', LastModified: daysAgo(60) },
    ]);
    s3Mock.on(DeleteObjectCommand).resolves({});
    const report = await pruneBackups(target, { now: NOW, retentionDays: 30 });
    expect(report.deleted).not.toContain('pg/2026-06-30T21-00.dump');
    expect(report.keptNewest).toEqual(['pg/2026-06-30T21-00.dump', 'ledger/2026-07-30.ndjson.gz']);
    // CONTROL — the window still applies to everything that is not the newest.
    expect(report.deleted).toEqual(['ledger/2026-06-30.ndjson.gz']);
  });
});

describe('19.155 pagination is followed', () => {
  it('deletes old objects from both pages and sends the continuation token', async () => {
    s3Mock
      .on(ListObjectsV2Command, { Prefix: 'pg/' })
      .resolvesOnce({
        Contents: [{ Key: 'pg/a.dump', LastModified: daysAgo(40) }],
        IsTruncated: true,
        NextContinuationToken: 'page-2',
      })
      .resolvesOnce({
        Contents: [
          { Key: 'pg/b.dump', LastModified: daysAgo(35) },
          { Key: 'pg/c.dump', LastModified: daysAgo(1) },
        ],
        IsTruncated: false,
      });
    listing('ledger/', []);
    s3Mock.on(DeleteObjectCommand).resolves({});
    const report = await pruneBackups(target, { now: NOW, retentionDays: 30 });
    expect(report.deleted).toContain('pg/b.dump');
    const tokens = s3Mock
      .commandCalls(ListObjectsV2Command)
      .filter((call) => call.args[0].input.Prefix === 'pg/')
      .map((call) => call.args[0].input.ContinuationToken);
    expect(tokens).toEqual([undefined, 'page-2']);
    expect(report.deleted).toContain('pg/a.dump'); // CONTROL
  });
});

describe('19.156 a failed delete is reported, not thrown', () => {
  it('records the failure and still deletes the other old object', async () => {
    listing('pg/', [
      { Key: 'pg/a.dump', LastModified: daysAgo(40) },
      { Key: 'pg/b.dump', LastModified: daysAgo(35) },
      { Key: 'pg/c.dump', LastModified: daysAgo(1) },
    ]);
    listing('ledger/', []);
    s3Mock.on(DeleteObjectCommand, { Key: 'pg/a.dump' }).rejects(new Error('AccessDenied'));
    s3Mock.on(DeleteObjectCommand, { Key: 'pg/b.dump' }).resolves({});
    const report = await pruneBackups(target, { now: NOW, retentionDays: 30 });
    expect(report.errors).toEqual(['pg/a.dump: AccessDenied']);
    expect(report.deleted).toEqual(['pg/b.dump']); // CONTROL
  });
});

describe('19.157 BACKUP_RETENTION_DAYS is a positive integer, default 30', () => {
  it('defaults, accepts 45, and refuses every non-positive or non-integer spelling by name', () => {
    expect(backupRetentionDaysFromEnv({})).toBe(DEFAULT_BACKUP_RETENTION_DAYS); // CONTROL
    expect(DEFAULT_BACKUP_RETENTION_DAYS).toBe(30);
    expect(backupRetentionDaysFromEnv({ BACKUP_RETENTION_DAYS: '' })).toBe(30);
    expect(backupRetentionDaysFromEnv({ BACKUP_RETENTION_DAYS: '45' })).toBe(45);
    for (const bad of ['abc', '0', '-3', '1.5']) {
      expect(() => backupRetentionDaysFromEnv({ BACKUP_RETENTION_DAYS: bad })).toThrow(/BACKUP_RETENTION_DAYS/);
    }
  });
});

describe('19.158 the prune follows a successful backup and never fails it', () => {
  it('alerts a thrown prune and a prune with errors, resolves both; a failing job never prunes', async () => {
    const calls: Array<{ context: string; message: string }> = [];
    const alerter: ErrorAlerter = {
      async notify(context, error) {
        calls.push({ context, message: error instanceof Error ? error.message : String(error) });
      },
    };
    const quiet = () => {};
    await expect(
      runThenPrune('pg-dump', async () => {}, async () => {
        throw new Error('list failed');
      }, alerter, quiet),
    ).resolves.toBeUndefined();
    const withErrors: PruneReport = { examined: 2, deleted: [], keptNewest: ['pg/c.dump'], errors: ['pg/a.dump: AccessDenied'] };
    await expect(runThenPrune('ledger-export', async () => {}, async () => withErrors, alerter, quiet)).resolves.toBeUndefined();
    expect(calls.map((call) => call.context)).toEqual(['backup:prune-after-pg-dump', 'backup:prune-after-ledger-export']);
    expect(calls[0]?.message).toBe('list failed');
    // CONTROL — a failed backup rejects, and is never followed by a prune.
    let pruned = false;
    await expect(
      runThenPrune('pg-dump', async () => {
        throw new Error('pg_dump exited 1');
      }, async () => {
        pruned = true;
        return withErrors;
      }, alerter, quiet),
    ).rejects.toThrow('pg_dump exited 1');
    expect(pruned).toBe(false);
  });
});
```

Add to `apps/server/test/ops/backup-daemon-main.test.ts`, in the same `describe` as 19.149:

```ts
  it('19.159 refuses BACKUP_RETENTION_DAYS=abc before arming any job, naming the variable', async () => {
    const refused = await runDaemon({
      DATABASE_URL: db.url,
      NOTIFICATION_SWEEP_INTERVAL_MS: '3600000',
      BACKUP_RETENTION_DAYS: 'abc',
    });
    expect(refused.stdout).not.toContain(SCHEDULED);
    expect(refused.stderr).toContain('BACKUP_RETENTION_DAYS');
    // CONTROL
    const armed = await runDaemon({
      DATABASE_URL: db.url,
      NOTIFICATION_SWEEP_INTERVAL_MS: '3600000',
      BACKUP_RETENTION_DAYS: '30',
    });
    expect(armed.stdout).toContain(SCHEDULED);
  }, 90_000);
```

- [ ] **Step 3: Run to see them fail.** Command: `cd apps/server && pnpm exec vitest run --no-file-parallelism test/ops/prune-backups.test.ts test/ops/backup-daemon-main.test.ts > /tmp/trash2-server.log 2>&1; tail -20 /tmp/trash2-server.log`. Expected:
  - `prune-backups.js` is missing;
  - 19.159 red: the daemon arms, because the variable is not read yet.

- [ ] **Step 4: Implement** `apps/server/src/ops/prune-backups.ts`:

```ts
import { DeleteObjectCommand, ListObjectsV2Command, type _Object } from '@aws-sdk/client-s3';
import type { ErrorAlerter } from '../alerts/error-alerter.js';
import type { BackupS3Target } from './object-sink.js';

/**
 * Backup retention (trash series Plan 2; spec §5.8, decision T4). Measured
 * 2026-09-28: neither bucket carries a lifecycle rule, so this is the only
 * retention. An erased item leaves the last backup within the purge delay plus
 * `BACKUP_RETENTION_DAYS` of being marked.
 *
 * The prefixes are the two jobs' own key shapes: `pg/<stamp>.dump`
 * (`./pg-dump.ts`) and `ledger/<day>.ndjson.gz` (`./export-ledger.ts`).
 */

export const BACKUP_PREFIXES = ['pg/', 'ledger/'] as const;
export const DEFAULT_BACKUP_RETENTION_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export type PruneReport = { examined: number; deleted: string[]; keptNewest: string[]; errors: string[] };

/**
 * Read once at daemon start (after the `--once` return — the manual path never
 * prunes). Unset or empty means the default, for the reason the sweep intervals
 * give: App Platform resolves an unset binding to `''`. Anything but a positive
 * integer throws, naming the variable, so the scheduler never arms on a typo.
 */
export function backupRetentionDaysFromEnv(env: NodeJS.ProcessEnv): number {
  const { BACKUP_RETENTION_DAYS } = env;
  if (BACKUP_RETENTION_DAYS === undefined || BACKUP_RETENTION_DAYS.trim() === '') {
    return DEFAULT_BACKUP_RETENTION_DAYS;
  }
  const trimmed = BACKUP_RETENTION_DAYS.trim();
  if (!/^[0-9]+$/.test(trimmed) || Number(trimmed) <= 0) {
    throw new Error(`BACKUP_RETENTION_DAYS must be a positive integer number of days, got '${BACKUP_RETENTION_DAYS}'`);
  }
  return Number(trimmed);
}

async function listAll(target: BackupS3Target, prefix: string): Promise<_Object[]> {
  const objects: _Object[] = [];
  let token: string | undefined;
  do {
    const page = await target.client.send(
      new ListObjectsV2Command({ Bucket: target.bucket, Prefix: prefix, ContinuationToken: token }),
    );
    objects.push(...(page.Contents ?? []));
    token = page.IsTruncated === true ? page.NextContinuationToken : undefined;
  } while (token !== undefined);
  return objects;
}

/**
 * Deletes every object under each prefix strictly older than the window, NEVER
 * the newest under a prefix (spec §5.8: "never deletes the newest successful
 * backup, whatever its age"). A listing failure throws — the caller alerts; a
 * delete failure is recorded and the rest continue. One key at a time with
 * `DeleteObjectCommand`, the call this repository already sends to Spaces (D9).
 */
export async function pruneBackups(
  target: BackupS3Target,
  options: { now: Date; retentionDays: number },
): Promise<PruneReport> {
  const cutoff = options.now.getTime() - options.retentionDays * DAY_MS;
  const report: PruneReport = { examined: 0, deleted: [], keptNewest: [], errors: [] };
  for (const prefix of BACKUP_PREFIXES) {
    const objects = (await listAll(target, prefix)).filter(
      (object): object is _Object & { Key: string; LastModified: Date } =>
        object.Key !== undefined && object.LastModified !== undefined,
    );
    report.examined += objects.length;
    if (objects.length === 0) continue;
    const newest = objects.reduce((best, object) =>
      object.LastModified.getTime() > best.LastModified.getTime() ||
      (object.LastModified.getTime() === best.LastModified.getTime() && object.Key > best.Key)
        ? object
        : best,
    );
    report.keptNewest.push(newest.Key);
    for (const object of objects) {
      if (object.Key === newest.Key) continue;
      if (object.LastModified.getTime() >= cutoff) continue;
      try {
        await target.client.send(new DeleteObjectCommand({ Bucket: target.bucket, Key: object.Key }));
        report.deleted.push(object.Key);
      } catch (error) {
        report.errors.push(`${object.Key}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
  return report;
}

/**
 * A scheduled backup job, then the prune — only if the job succeeded. The
 * prune can never fail the backup: a throw, or a report with errors, is
 * alerted as `backup:prune-after-<job>` and swallowed. The job's own failure
 * propagates unchanged to `startScheduler`'s `onFailure`, as before.
 */
export async function runThenPrune(
  name: string,
  run: () => Promise<void>,
  prune: () => Promise<PruneReport>,
  alerter: ErrorAlerter,
  log: (message: string, error?: unknown) => void = (message, error) => console.error(message, error),
): Promise<void> {
  await run();
  let report: PruneReport;
  try {
    report = await prune();
  } catch (error) {
    log(`backup prune after ${name} failed`, error);
    await alerter.notify(`backup:prune-after-${name}`, error);
    return;
  }
  console.log(
    JSON.stringify({
      msg: 'backup prune complete',
      after: name,
      examined: report.examined,
      deleted: report.deleted.length,
      errors: report.errors.length,
    }),
  );
  if (report.errors.length > 0) {
    await alerter.notify(
      `backup:prune-after-${name}`,
      new Error(`backup prune could not delete ${report.errors.length} object(s): ${report.errors.join('; ')}`),
    );
  }
}
```

- [ ] **Step 5: Wire the daemon.** In `apps/server/src/ops/backup-daemon-main.ts`:
- add `import { backupRetentionDaysFromEnv, pruneBackups, runThenPrune } from './prune-backups.js';`;
- change `import { s3SinkFromEnv } from './object-sink.js';` to `import { s3SinkFromEnv, s3TargetFromEnv } from './object-sink.js';`;
- directly after `const notificationTransport = createInAppTransport(pool);` (`:146`), add:

```ts
  // Backup retention (trash series Plan 2, spec §5.8). Read HERE, after the
  // `--once` return, for the reason the store above is: the manual path runs
  // the two backups and nothing destructive. A bad value throws now, before the
  // scheduler arms anything (19.159).
  const backupRetentionDays = backupRetentionDaysFromEnv(process.env);
  const backupTarget = s3TargetFromEnv(process.env, 'BACKUP_S3_BUCKET');
  const prune = () => pruneBackups(backupTarget, { now: new Date(), retentionDays: backupRetentionDays });
```

Change the `pg-dump` job's `run` (`:197`) to `run: () => runThenPrune('pg-dump', jobs.runPgDump, prune, alerter),`, and the `ledger-export` job's `run` (`:202`) to `run: () => runThenPrune('ledger-export', jobs.runLedgerExport, prune, alerter),`. `jobs.runPgDump` and `jobs.runLedgerExport` themselves are unchanged, so `--once` still runs them bare (`:128`).

In `.env.example`, after `LEDGER_EXPORT_DOW_UTC=0              # 0 = Sunday` (`:330`), add:

```bash
# Retention (trash series Plan 2, spec §5.8): after each successful scheduled
# pg_dump and ledger export, objects under pg/ and ledger/ older than this many
# days are deleted — never the newest under each prefix, whatever its age.
# Optional, default 30; anything but a positive integer is refused at startup,
# naming this variable. `--once` never prunes.
BACKUP_RETENTION_DAYS=30
```

In `docs/runbook.md` "## Backups" (`:138-145`), after the line "The managed database's own daily backups are a second string, not the plan." (`:145`), add:

```markdown
After each successful scheduled backup the worker prunes the backups bucket: anything under `pg/` or
`ledger/` older than `BACKUP_RETENTION_DAYS` (default 30) is deleted, except the newest object under each
prefix, which is kept whatever its age. The bucket has no lifecycle rule of its own (measured
2026-09-28); this prune is the only retention. A prune failure alerts `backup:prune-after-<job>` and never
fails the backup. The manual `ops:backup-once` run does not prune. A permanently deleted item therefore
leaves the last backup within the purge delay plus the retention window of being marked.
```

Run `pnpm check:runbook` and `pnpm check:env`.

- [ ] **Step 6: Run to see them pass** (same command). Then run the whole `test/ops` directory.

- [ ] **Step 7: Flip 19.153–19.159 to ✅, and write the `Features.md` bullet:**

```markdown
- ⚙️ **Backup retention** (`apps/server/src/ops/prune-backups.ts`, wired in `ops/backup-daemon-main.ts`; spec §5.8, T4) — after each successful scheduled `pg-dump` and `ledger-export`, `pruneBackups` lists `pg/` and `ledger/` (following pagination) and deletes, one key at a time, every object strictly older than `BACKUP_RETENTION_DAYS` (default 30; refused at startup unless a positive integer) — never the newest under a prefix, whatever its age. A delete failure is reported, not thrown; any prune failure alerts `backup:prune-after-<job>` and never fails the backup; `--once` never prunes. The buckets carry no lifecycle rule (measured 2026-09-28), so this is the only retention. Cases 19.153–19.159.
```

- [ ] **Step 8: Commit** `Trash 2/Task 10: backup retention (19.153-19.159)`. Then work through the mutations: mutate, show red, restore.

---

## Wrap-up (after Task 10)

- [ ] **Run the whole repo, in order:**
  1. `pnpm turbo run build`
  2. `pnpm turbo run typecheck`
  3. each package's suite with the command in Global Constraints (`packages/domain`, `packages/editor`, `packages/rule-engine`, `packages/sync-client`, `packages/app-core`, `apps/server`, `apps/web`)
  4. `pnpm check:citations`, `node scripts/check-case-ids.mjs`, `pnpm check:migrations`, `pnpm check:env`, `pnpm check:runbook`

  Paste every summary line with `NODE=`, and say that these are LOCAL runs.
- [ ] **Count the cases.** Confirm the case-id count moved by exactly the number of cases this plan added, `19.081`–`19.159` as pinned here: 3 + 5 + 6 + 8 + 8 + 4 + 9 + 4 + 7 + 7 = **61**. Re-read every `test-cases/19-trash.md` line you flipped against its test.
- [ ] **Re-read `Features.md` `## 16`** against the code. Ten bullets were added, one per task.
- [ ] **Grep for strays:**
  - `git grep -n "DELETE FROM events\|UPDATE events" -- apps/server/src` must return nothing. Only `purge_ledger` touches the ledger.
  - `git grep -nE "\b15\b" -- apps/server/src/purge` must return nothing.
- [ ] **Write the PR body.** It must carry:
  - the owner ruling (A), verbatim;
  - D1–D13;
  - the release note:
    - apply `deploy/do/app.yaml` with `doctl apps update <app-id> --spec deploy/do/app.yaml` (a push does not apply spec changes);
    - run the orphan sweep with `--dry-run` from the worker before its first 30-day tick;
  - what is left for Plan 3:
    - delivering `purge.completed` to devices (D6);
    - the client folds switching to `foldTicketEvent` (D7);
    - the "Deleted item" chip on screen (D4);
    - the outbox notice for a refused claim (spec §5.7);
  - each mutation with its red line.
