import { describe, expect, it } from 'vitest';
import { newUlid } from '@gisik-nokma/domain';
import {
  createHttpTransport,
  createOutbox,
  createReplica,
  createSyncEngine,
  type SyncTransport,
} from '@gisik-nokma/sync-client';
import { createBetterSqliteStorage } from '@gisik-nokma/sync-client/testing';
import { DeletedItemsFromCache, cachedDeletedItemsOf } from '../../src/deleted-items-from-cache.js';
import { MappingError } from '../../src/online/mappers.js';
import {
  DELETED_ITEMS_NOT_CACHED,
  REPLICA_GAPS,
  ReplicaGapError,
  createReplicaDataSource,
} from '../../src/replica/replica-data-source.js';

/**
 * Trash series Plan 3, Task 9 (deviation D9; spec §6.3: "the replica serves it
 * offline"). The replica has no lifecycle state of its own, so it keeps the last
 * ONLINE answer and says, when it serves it, that it is a saved copy.
 */

const WS = newUlid();
const USER = newUlid();

const row = (id: string) => ({
  kind: 'ticket',
  id,
  workspaceId: WS,
  workspaceName: 'Convenience Corner',
  projectId: newUlid(),
  projectName: 'Shop operations',
  label: 'CCSO-3 Renew the lease',
  deletedBy: USER,
  // Plan 4 adds this key and its mapper requires it; an older mapper ignores it.
  deletedByName: 'Kiro',
  deletedAt: '2026-09-28T10:00:00.000Z',
  purgeMarkedAt: null,
  purgeDueAt: null,
  containedCount: 0,
});

async function fixture(serve: () => Promise<unknown>) {
  return fixtureOver({
    bootstrap: () => Promise.reject(new Error('offline')),
    sync: () => Promise.reject(new Error('offline')),
    openStream: () => ({ close: () => undefined }),
    bootstrapTicket: () => Promise.reject(new Error('offline')),
    bootstrapNote: () => Promise.reject(new Error('offline')),
    reconcile: () => Promise.reject(new Error('offline')),
    purgedLookup: () => Promise.reject(new Error('offline')),
    deletedItems: serve,
  });
}

async function fixtureOver(transport: SyncTransport) {
  const storage = createBetterSqliteStorage();
  const replica = await createReplica({ storage });
  const outbox = createOutbox({ storage, replica });
  const engine = createSyncEngine({ replica, outbox, transport });
  const ds = createReplicaDataSource({ workspaceId: WS, replica, outbox, engine, storage });
  return { ds, replica };
}

describe('19.196 the cached list, offline', () => {
  it('19.196 caches an online answer, rejects offline with it and its instant, and loses an erased item', async () => {
    const [T, other] = [newUlid(), newUlid()];
    let online = true;
    const { ds, replica } = await fixture(async () => {
      if (!online) throw new TypeError('fetch failed');
      return { items: [row(T), row(other)] };
    });

    expect((await ds.query.getDeletedItems()).map((item) => item.id)).toEqual([T, other]);

    online = false;
    const cause = await ds.query.getDeletedItems().catch((e: unknown) => e);
    expect(cause).toBeInstanceOf(DeletedItemsFromCache);
    const cached = cachedDeletedItemsOf(cause);
    expect(cached?.items.map((item) => item.id)).toEqual([T, other]);
    expect(Number.isNaN(Date.parse(cached?.fetchedAt ?? ''))).toBe(false);

    await replica.eraseEntities([{ kind: 'ticket', id: T }]);
    const after = cachedDeletedItemsOf(await ds.query.getDeletedItems().catch((e: unknown) => e));
    expect(after?.items.map((item) => item.id)).toEqual([other]);

    // CONTROL
    online = true;
    await expect(ds.query.getDeletedItems()).resolves.toHaveLength(2);
  });
});

describe('19.197 never cached, a malformed body, and a status answer', () => {
  it('19.197 a cold device refuses with the narrowed gap; a mapping failure is not masked by the cache', async () => {
    const cold = await fixture(() => Promise.reject(new Error('offline')));
    const gap = await cold.ds.query.getDeletedItems().catch((e: unknown) => e);
    expect(gap).toBeInstanceOf(ReplicaGapError);
    expect((gap as ReplicaGapError).absences).toEqual(DELETED_ITEMS_NOT_CACHED);
    expect(REPLICA_GAPS['getDeletedItems']).toBe(DELETED_ITEMS_NOT_CACHED);

    let answer: () => Promise<unknown> = async () => ({ items: [row(newUlid())] });
    const warm = await fixture(() => answer());
    await warm.ds.query.getDeletedItems();
    answer = async () => ({ items: [{ kind: 'ticket' }] });
    await expect(warm.ds.query.getDeletedItems()).rejects.toBeInstanceOf(MappingError);
    // CONTROL
    answer = () => Promise.reject(new Error('offline'));
    await expect(warm.ds.query.getDeletedItems()).rejects.toBeInstanceOf(DeletedItemsFromCache);
  });
});

/**
 * Only a TRANSPORT failure (no answer at all) is "offline". A status answer
 * from the server — 401 signed out, 403, 500 — is an answer, and it surfaces
 * exactly as it does online rather than being papered over with an old list.
 * Driven through the REAL `createHttpTransport`, because the classification is
 * made there (`HttpStatusError`), not in the replica.
 */
describe('19.197 a status answer is not offline', () => {
  const httpFixture = (fetchImpl: typeof fetch) =>
    fixtureOver(createHttpTransport({ baseUrl: 'https://api.test', token: 't', fetchImpl }));

  it('19.197 a 401 and a 500 still throw while a saved copy exists; a transport failure serves the copy', async () => {
    let answer: () => Promise<Response> = async () => new Response(JSON.stringify({ items: [row(newUlid())] }), { status: 200 });
    const { ds } = await httpFixture(() => answer());
    await expect(ds.query.getDeletedItems()).resolves.toHaveLength(1);

    for (const status of [401, 403, 500, 503]) {
      answer = async () => new Response('{}', { status });
      const error = await ds.query.getDeletedItems().catch((e: unknown) => e);
      expect(error, String(status)).not.toBeInstanceOf(DeletedItemsFromCache);
      expect((error as Error).message).toBe(`deleted-items failed: ${String(status)}`);
    }

    // CONTROL: a fetch that never gets an answer is the offline case.
    answer = () => Promise.reject(new TypeError('fetch failed'));
    await expect(ds.query.getDeletedItems()).rejects.toBeInstanceOf(DeletedItemsFromCache);
  });
});
