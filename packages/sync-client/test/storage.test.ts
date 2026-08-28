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
      'contests', 'events', 'meta', 'outbox', 'snapshots', 'ticket_types', 'tickets', 'workflows',
    ]);
    const version = await storage.all("SELECT value FROM meta WHERE key = 'schema_version'");
    // Pin the LITERAL, not String(LOCAL_SCHEMA_VERSION): comparing the constant
    // against itself is a round-trip check that survives any value change, so a
    // silent version bump would pass. A schema version is exactly the thing that
    // should require a conscious edit here when it moves.
    expect(LOCAL_SCHEMA_VERSION).toBe(1);
    expect(version[0]?.value).toBe('1');
    await storage.close();
  });
});
