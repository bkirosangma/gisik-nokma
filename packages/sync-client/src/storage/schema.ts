import type { SyncStorage } from './storage.js';

export const LOCAL_SCHEMA_VERSION = 1;

// ULID discipline: no column here carries a hand-written shape constraint.
// `events.id`, `outbox.event_id` and the entity ids are ULIDs, but the ONE
// definition of that format is `ULID_REGEX` in `@gisik-nokma/domain`, and a
// SQLite `CHECK (id GLOB '...')` would be a second definition of it in a
// second language — exactly the drift that was found and fixed in the domain
// package. Ids are validated where they are minted and where they are parsed
// (`newSubmittedEvent`, `parseEvent`); the replica's tables store what the
// ledger already vouched for. This task mints no ids at all.
const TABLES = [
  // the visibility-scoped local ledger — exactly what arrived, nothing invented
  // Mirrors the server's column set (coordination §18) — BOTH sequences are kept
  // because both are true in different senses: `seq` orders one entity's history
  // (what the reducer replays), `workspace_seq` orders the workspace's stream
  // (what a resume cursor means). Dropping either would force the replica to
  // invent an order it was never told.
  //
  // client_time / server_time hold ISO 8601 'Z' instant strings — EXACTLY what
  // the server's rowToEnvelope emits, never a device-offset label. SQLite has
  // no timestamp type, so these are TEXT; that is safe here and only here,
  // because every value is Z-normalised at millisecond precision by the server
  // before it is handed over. Two consequences worth naming: string comparison
  // IS instant comparison and lexicographic order IS chronological order (which
  // is why the outbox and the duplicate checks may compare them directly), and
  // a replica must never write a locally-formatted time into these columns —
  // '2026-08-21T00:00:00+05:30' and '2026-08-20T18:30:00.000Z' are one moment
  // and two strings, and the second one is the only one the server will ever
  // send. Owner decision 2026-08-20: both ledger clocks are timestamptz, so
  // the offset label the device attached is not a fact the server preserves.
  `CREATE TABLE IF NOT EXISTS events (
     id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, entity_kind TEXT NOT NULL, entity_id TEXT NOT NULL,
     type TEXT NOT NULL, version INTEGER NOT NULL, payload TEXT NOT NULL, actor_id TEXT NOT NULL,
     origin TEXT NOT NULL, client_time TEXT NOT NULL, server_time TEXT NOT NULL,
     seq INTEGER NOT NULL, workspace_seq INTEGER NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS events_entity_idx ON events (entity_kind, entity_id, seq)`,
  `CREATE INDEX IF NOT EXISTS events_stream_idx ON events (workspace_id, workspace_seq)`,
  // reducer-state baseline from bootstrap (server snapshots, reducer-folded)
  `CREATE TABLE IF NOT EXISTS snapshots (
     entity_kind TEXT NOT NULL, entity_id TEXT NOT NULL, seq INTEGER NOT NULL, state TEXT NOT NULL,
     PRIMARY KEY (entity_kind, entity_id)
   )`,
  // confirmed read model — folded by applyTicketEvent, NEVER downloaded projections
  `CREATE TABLE IF NOT EXISTS tickets (
     ticket_id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, parent_id TEXT, state TEXT NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS tickets_parent_idx ON tickets (parent_id)`,
  `CREATE TABLE IF NOT EXISTS workflows (
     workflow_id TEXT NOT NULL, version INTEGER NOT NULL, def TEXT NOT NULL, PRIMARY KEY (workflow_id, version)
   )`,
  `CREATE TABLE IF NOT EXISTS ticket_types (type_id TEXT PRIMARY KEY, def TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS contests (
     contested_event_id TEXT PRIMARY KEY, original_event_id TEXT NOT NULL UNIQUE, workspace_id TEXT NOT NULL,
     ticket_id TEXT NOT NULL, claimant_id TEXT NOT NULL, rule TEXT NOT NULL, reason TEXT NOT NULL,
     original_event TEXT NOT NULL, contested_at TEXT NOT NULL, resolved INTEGER NOT NULL DEFAULT 0, resolution TEXT
   )`,
  // ordered, persisted claims in transit
  `CREATE TABLE IF NOT EXISTS outbox (
     position INTEGER PRIMARY KEY AUTOINCREMENT, event_id TEXT NOT NULL UNIQUE, workspace_id TEXT NOT NULL,
     entity_kind TEXT NOT NULL, entity_id TEXT NOT NULL, envelope TEXT NOT NULL,
     status TEXT NOT NULL DEFAULT 'queued', attempts INTEGER NOT NULL DEFAULT 0,
     next_attempt_at TEXT NOT NULL DEFAULT '1970-01-01T00:00:00.000Z', last_error TEXT
   )`,
  `CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
];

export async function migrateLocal(storage: SyncStorage): Promise<void> {
  await storage.transaction(async (tx) => {
    for (const ddl of TABLES) await tx.run(ddl);
    await tx.run(
      `INSERT INTO meta (key, value) VALUES ('schema_version', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [String(LOCAL_SCHEMA_VERSION)],
    );
  });
}
