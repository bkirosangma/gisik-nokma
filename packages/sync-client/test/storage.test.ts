import { describe, expect, it } from 'vitest';
import { createBetterSqliteStorage } from '../src/storage/better-sqlite3.js';
import { LOCAL_SCHEMA_VERSION, migrateLocal } from '../src/storage/schema.js';
import { storageConformanceTests } from '../src/storage/conformance.js';

storageConformanceTests('better-sqlite3', async () => createBetterSqliteStorage());

describe('migrateLocal', () => {
  it('creates the replica tables and stamps the version, idempotently', async () => {
    const storage = createBetterSqliteStorage();
    await migrateLocal(storage);
    await migrateLocal(storage); // second run is a no-op
    const tables = await storage.all(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    );
    expect(tables.map((t) => t.name)).toEqual([
      // `snapshot_provenance` joined the list with ruling P36. It is a SIBLING
      // TABLE rather than a column on `snapshots` because `migrateLocal` runs
      // `CREATE TABLE IF NOT EXISTS` and nothing else — there is no `ALTER`
      // path, and `LOCAL_SCHEMA_VERSION` was written into `meta` and never read
      // back (its one reader since version 5, `createReplica`'s re-pull, converges
      // state, not columns) — so a new column would work on a fresh device and throw
      // `no such column` on every existing one. An exact `toEqual` here is what
      // made that decision visible instead of silent.
      // `notes` and `note_comments` joined with Plan 2 of the notes series and
      // the version moved with them. The two arrived as NEW TABLES for exactly
      // the reason the paragraph above gives — `CREATE TABLE IF NOT EXISTS` is
      // the only DDL `migrateLocal` runs, so a table is safe on an existing
      // device and a changed column is not.
      // `purged_ids`, `sync_notices` and `deleted_items_cache` joined with trash Plan 3 (version 3), new tables for the same reason.
      // `comment_changes` joined with MCP-everything T4 (version 4), a new table for the same reason.
      'comment_changes', 'contests', 'deleted_items_cache', 'events', 'meta', 'note_comments', 'notes', 'outbox', 'purged_ids',
      'snapshot_provenance', 'snapshots', 'sync_notices', 'ticket_types', 'tickets', 'workflows',
    ]);
    const version = await storage.all("SELECT value FROM meta WHERE key = 'schema_version'");
    // Pin the LITERAL, not String(LOCAL_SCHEMA_VERSION): comparing the constant
    // against itself is a round-trip check that survives any value change, so a
    // silent version bump would pass. A schema version is exactly the thing that
    // should require a conscious edit here when it moves.
    // 5: Workflow and Timeline graphs T9 (no DDL; `createReplica` re-pulls held tickets).
    expect(LOCAL_SCHEMA_VERSION).toBe(5);
    expect(version[0]?.value).toBe('5');
    await storage.close();
  });
});
