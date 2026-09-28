import { describe, expect, it } from 'vitest';
import { newSubmittedEvent, newUlid, PURGE_RULE, PURGED_OUTBOX_NOTICE, PURGED_REASON } from '@gisik-nokma/domain';
import { createOutbox, createReplica, createSyncEngine, type SyncTransport } from '@gisik-nokma/sync-client';
import { createBetterSqliteStorage } from '@gisik-nokma/sync-client/testing';
import { createReplicaDataSource } from '../../src/replica/replica-data-source.js';
import { failedClaimNotice } from '../../src/sync/sync-notices.js';

/** Trash series Plan 3, Task 6 — the replica data source's view of the outbox's notices. */

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

describe('19.186 syncNotices and dismissSyncNotice', () => {
  it('19.186 lists purge notices then failed claims, and routes each dismissal to its own delete', async () => {
    const storage = createBetterSqliteStorage();
    const replica = await createReplica({ storage });
    const outbox = createOutbox({ storage, replica });
    const engine = createSyncEngine({ replica, outbox, transport: offline });
    const ds = createReplicaDataSource({ workspaceId: WS, replica, outbox, engine, storage });
    const events = [newUlid(), newUlid()].map((ticketId) =>
      newSubmittedEvent({
        workspaceId: WS,
        entity: { kind: 'ticket', id: ticketId },
        type: 'ticket.field_set',
        payload: { fieldId: 'title', value: 'offline' },
        actorId: newUlid(),
        origin: 'desktop',
      }),
    );
    for (const event of events) {
      await storage.run(
        'INSERT INTO outbox (event_id, workspace_id, entity_kind, entity_id, envelope) VALUES (?, ?, ?, ?, ?)',
        [event.id, WS, 'ticket', event.entity.id, JSON.stringify(event)],
      );
    }
    const [purged, refused] = events as [(typeof events)[0], (typeof events)[0]];
    await outbox.applyResult(purged.id, { status: 'refused', eventId: purged.id, rule: PURGE_RULE, reason: PURGED_REASON });
    await outbox.applyResult(refused.id, { status: 'refused', eventId: refused.id, rule: 'restrict-to', reason: 'No.' });

    expect(await ds.query.syncNotices(WS)).toEqual([
      { id: `purged:${purged.id}`, text: PURGED_OUTBOX_NOTICE },
      { id: `failed:${refused.id}`, text: failedClaimNotice('restrict-to: No.') },
    ]);

    await ds.query.dismissSyncNotice(`failed:${refused.id}`);
    expect(await outbox.failedItems(WS)).toEqual([]);
    expect(await outbox.notices(WS)).toHaveLength(1);
    await ds.query.dismissSyncNotice(`purged:${purged.id}`);
    expect(await outbox.notices(WS)).toEqual([]);
    // CONTROL
    await ds.query.dismissSyncNotice('something-else');
    expect(await ds.query.syncNotices(WS)).toEqual([]);
  });
});
