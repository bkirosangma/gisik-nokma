import { describe, expect, it } from 'vitest';
import { newUlid } from '@gisik-nokma/domain';
import { createOutbox, createReplica, createSyncEngine, type SyncTransport } from '@gisik-nokma/sync-client';
import { createBetterSqliteStorage } from '@gisik-nokma/sync-client/testing';
import { createReplicaDataSource } from '../../src/replica/replica-data-source.js';

const WS = newUlid();
const offline: SyncTransport = {
  bootstrap: () => Promise.reject(new Error('offline')),
  sync: () => Promise.reject(new Error('offline')),
  openStream: () => ({ close: () => undefined }),
  bootstrapTicket: () => Promise.reject(new Error('offline')),
  bootstrapNote: () => Promise.reject(new Error('offline')),
  reconcile: () => Promise.reject(new Error('offline')),
  purgedLookup: () => Promise.reject(new Error('offline')),
  deletedItems: () => Promise.reject(new Error('offline')),
};

describe('19.189 purgedAmong — the replica twin', () => {
  it('19.189 answers from purged_ids, offline; an unrecorded id is absent', async () => {
    const storage = createBetterSqliteStorage();
    const replica = await createReplica({ storage });
    const outbox = createOutbox({ storage, replica });
    const engine = createSyncEngine({ replica, outbox, transport: offline });
    const ds = createReplicaDataSource({ workspaceId: WS, replica, outbox, engine, storage });
    const [gone, live] = [newUlid(), newUlid()];
    await replica.eraseEntities([{ kind: 'note', id: gone }]);
    expect(await ds.query.purgedAmong([gone, live])).toEqual([{ kind: 'note', id: gone }]);
    // CONTROL
    expect(await ds.query.purgedAmong([live])).toEqual([]);
  });
});
