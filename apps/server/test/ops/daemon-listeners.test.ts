import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { newUlid, type SubmittedEvent } from '@gisik-nokma/domain';
import { listNotifications } from '../../src/notifications/store.js';
import { createInAppTransport, type NotificationTransport } from '../../src/notifications/transport.js';
import { registerDaemonListeners } from '../../src/ops/daemon-listeners.js';
import { addTicket, ASSIGNEE, PERSON, realIngest, seedFlowWorld, WS } from '../flow/flow-world.js';
import { resetEntitySeqs } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';

/**
 * wtg2 T14 (NT-1): the backup daemon files events through an ingest nobody listens to (the flow sweep's promotions,
 * auto-close), so `registerDaemonListeners` subscribes the notification fan-out on it. The fan-out is the server's own
 * (`createNotificationFanout`); this pins the subscription, its unsubscribe, and that the caller's gate and log reach it.
 * An assignment is the probe: it has a fan-out arm today, and the flow's own (`flow-ready`) arrives with T18.
 */

let db: TestDatabase;
beforeEach(async () => {
  resetEntitySeqs();
  db = await createTestDatabase();
  await seedFlowWorld(db.pool);
});
afterEach(async () => {
  await db.drop();
});

/** `ticket.assigned` as a person files it (actor PERSON, origin web), for the internal door. */
const assign = (ticketId: string, assigneeId: string): SubmittedEvent => ({
  id: newUlid(), workspaceId: WS, entity: { kind: 'ticket', id: ticketId }, type: 'ticket.assigned', version: 1,
  payload: { assigneeId }, actorId: PERSON, origin: 'web', clientTime: new Date().toISOString(),
});
const inbox = async () => (await listNotifications(db.pool, ASSIGNEE, {})).notifications;
/** The absence is the claim, so a bounded wait is the honest probe. */
const settle = () => new Promise((r) => setTimeout(r, 200));

describe('29.229 the daemon\'s ingest notifies', () => {
  it('29.229 the daemon ingest delivers through the fan-out until it is unsubscribed', async () => {
    const ingest = realIngest(db.pool);
    const off = registerDaemonListeners(ingest, { pool: db.pool, transports: [createInAppTransport(db.pool)], canSeeTicket: async () => true });
    const t1 = await addTicket(db.pool);
    expect((await ingest.ingestBatch([assign(t1, ASSIGNEE)])).map((r) => r.status)).toEqual(['committed']);
    await vi.waitFor(async () => expect((await inbox()).map((n) => n.kind)).toEqual(['assignment']), { timeout: 5000 });
    off();
    // CONTROL: after the unsubscribe the same commit delivers nothing
    const t2 = await addTicket(db.pool);
    expect((await ingest.ingestBatch([assign(t2, ASSIGNEE)])).map((r) => r.status)).toEqual(['committed']);
    await settle();
    expect(await inbox()).toHaveLength(1);
  });

  it('29.229 the caller\'s visibility gate and log reach the fan-out: a gate that answers no delivers nothing; control: a gate that answers yes delivers, and a failing transport is logged through the caller\'s log', async () => {
    const ingest = realIngest(db.pool);
    const offDenied = registerDaemonListeners(ingest, { pool: db.pool, transports: [createInAppTransport(db.pool)], canSeeTicket: async () => false });
    const t1 = await addTicket(db.pool);
    expect((await ingest.ingestBatch([assign(t1, ASSIGNEE)])).map((r) => r.status)).toEqual(['committed']);
    await settle();
    expect(await inbox()).toEqual([]);
    offDenied();
    const logs: string[] = [];
    const failing: NotificationTransport = { name: 'failing', deliver: async () => { throw new Error('down'); } };
    registerDaemonListeners(ingest, { pool: db.pool, transports: [failing, createInAppTransport(db.pool)], canSeeTicket: async () => true, log: (m) => logs.push(m) });
    const t2 = await addTicket(db.pool);
    const event = assign(t2, ASSIGNEE);
    expect((await ingest.ingestBatch([event])).map((r) => r.status)).toEqual(['committed']);
    await vi.waitFor(async () => expect((await inbox()).map((n) => n.kind)).toEqual(['assignment']), { timeout: 5000 });
    expect(logs).toEqual([`notification transport failing failed for assignment:${event.id}`]);
  });

  /**
   * The daemon's own call. A behavioural leg needs a daemon-filed event the fan-out has an arm for, and there is none
   * before T18 (the sweep files `ticket.transitioned`, auto-close `ticket.closed`, and the fan-out answers neither), so
   * this pins the source until T18's `flow-ready` arm lets a spawned daemon's promotion show up in the inbox.
   */
  it('29.229 the daemon registers the fan-out on its own ingest, once, after building it', () => {
    const source = readFileSync(new URL('../../src/ops/backup-daemon-main.ts', import.meta.url), 'utf8');
    expect(source.match(/registerDaemonListeners\(/g)).toHaveLength(1);
    expect(source).toContain('registerDaemonListeners(ingest, { pool, transports: [notificationTransport] });');
    expect(source.indexOf('registerDaemonListeners(ingest')).toBeGreaterThan(source.indexOf('const ingest = createIngestService('));
  });
});
