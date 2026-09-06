import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readLatestSnapshot, writeSnapshot } from '../src/ledger/snapshot-store.js';
import { createTestDatabase, type TestDatabase } from './helpers/db.js';

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
});

afterAll(async () => {
  await db.drop();
});

describe('snapshot store', () => {
  it('returns null when no snapshot exists', async () => {
    await expect(readLatestSnapshot(db.pool, 'workspace', '01J60000000000000000000WKA')).resolves.toBeNull();
  });

  it('returns the highest-seq snapshot for an entity', async () => {
    const client = await db.pool.connect();
    try {
      await writeSnapshot(client, {
        entityKind: 'workspace',
        entityId: '01J60000000000000000000WKA',
        seq: 1,
        state: { name: 'Convenience Corner' },
        // REQUIRED, not optional, and stated even where it is null. Ruling P36
        // made `provenance` a required field precisely so every write site has
        // to declare its intent: an optional one would let a caller omit it and
        // silently write NULL, which on the invalidation pass overwrites a good
        // block. Being required is what surfaced that site as a compile error.
        // A `workspace` snapshot has no state claim to carry — the block is a
        // ticket concern — so `null` here is the honest value, not a stub.
        provenance: null,
      });
      await writeSnapshot(client, {
        entityKind: 'workspace',
        entityId: '01J60000000000000000000WKA',
        seq: 3,
        state: { name: 'CC HQ' },
        provenance: null,
      });
    } finally {
      client.release();
    }
    await expect(
      readLatestSnapshot(db.pool, 'workspace', '01J60000000000000000000WKA'),
    ).resolves.toEqual({
      entityKind: 'workspace',
      entityId: '01J60000000000000000000WKA',
      seq: 3,
      state: { name: 'CC HQ' },
      provenance: null,
    });
  });
});
