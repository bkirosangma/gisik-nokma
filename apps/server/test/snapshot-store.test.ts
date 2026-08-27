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
      });
      await writeSnapshot(client, {
        entityKind: 'workspace',
        entityId: '01J60000000000000000000WKA',
        seq: 3,
        state: { name: 'CC HQ' },
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
    });
  });
});
