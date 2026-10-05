import { describe, expect, it } from 'vitest';
import { newSubmittedEvent, newUlid, type LedgerEvent } from '@gisik-nokma/domain';
import { createOutbox, createReplica, createSyncEngine, type BootstrapResponse, type SyncTransport } from '@gisik-nokma/sync-client';
import { createBetterSqliteStorage } from '@gisik-nokma/sync-client/testing';
import { createReplicaDataSource } from '../../src/replica/replica-data-source.js';

/**
 * Case 28.152 (drafts T8). The harness is the head of `replica-drafts.test.ts` (T4's, case 28.081-28.083), cut to
 * what `getMyDrafts` needs: one confirmed draft and one born offline through the outbox.
 */
const WS = newUlid();
const PROJECT = newUlid();
const USER_A = newUlid();
const WF = newUlid();
const TYPE_TASK = newUlid();
const SERVER_TIME = '2026-10-01T08:00:00.000Z';

const wfV1 = {
  id: WF, version: 1, name: 'Basic', initialStateId: 'todo',
  states: [
    { id: 'todo', name: 'To do', category: 'open' },
    { id: 'done', name: 'Done', category: 'terminal' },
  ],
  transitions: [{ from: '*', to: 'todo', rules: [] }, { from: '*', to: 'done', rules: [] }],
};
const taskType = { id: TYPE_TASK, name: 'Task', icon: 'check', rank: 3, workflowId: WF, fields: [] };
const idleTransport: SyncTransport = {
  bootstrap: () => Promise.reject(new Error('offline')),
  sync: () => Promise.reject(new Error('offline')),
  openStream: () => ({ close: () => undefined }),
  bootstrapTicket: () => Promise.reject(new Error('offline')),
  bootstrapNote: () => Promise.reject(new Error('offline')),
  reconcile: () => Promise.reject(new Error('offline')),
  purgedLookup: () => Promise.reject(new Error('offline')),
  deletedItems: () => Promise.reject(new Error('offline')),
};

async function draftHarness() {
  let seq = 0;
  const envelope = (entity: { kind: 'ticket' | 'workflow' | 'ticket-type'; id: string }, type: string, payload: unknown): LedgerEvent => {
    seq += 1;
    return {
      ...newSubmittedEvent({ workspaceId: WS, entity, type, payload, actorId: USER_A, origin: 'server', now: () => new Date(SERVER_TIME) }),
      serverTime: SERVER_TIME, seq: 1, workspaceSeq: seq,
    };
  };
  const storage = createBetterSqliteStorage();
  const replica = await createReplica({ storage });
  const bootstrap: BootstrapResponse = {
    workspaceId: WS,
    me: { userId: USER_A, workspaceRole: 'member', projectIds: [PROJECT] },
    streamSeq: 0,
    definitions: [
      envelope({ kind: 'workflow', id: WF }, 'workflow.defined', wfV1),
      envelope({ kind: 'ticket-type', id: TYPE_TASK }, 'ticket-type.defined', taskType),
    ],
    tickets: [],
  };
  await replica.loadBootstrap(bootstrap);
  const outbox = createOutbox({ storage, replica });
  const engine = createSyncEngine({ replica, outbox, transport: idleTransport });
  const source = createReplicaDataSource({ workspaceId: WS, replica, outbox, engine, storage });
  /** A draft the server confirmed. */
  const seedDraft = async (ticketId: string, title: string): Promise<void> => {
    await replica.applyServerItem(envelope({ kind: 'ticket', id: ticketId }, 'ticket.created', {
      typeId: TYPE_TASK, projectId: PROJECT, parentId: null, title, start: 'backlog', draft: true,
    }));
  };
  /** A draft created on this device while offline: queued, never confirmed. */
  const bornOffline = async (ticketId: string, title: string): Promise<void> => {
    const born = newSubmittedEvent({
      workspaceId: WS, entity: { kind: 'ticket', id: ticketId }, type: 'ticket.created',
      payload: { typeId: TYPE_TASK, projectId: PROJECT, parentId: null, title, start: 'backlog', draft: true },
      actorId: USER_A, origin: 'web', now: () => new Date('2026-10-03T08:00:00.000Z'),
    });
    expect((await outbox.enqueue(born)).queued).toBe(true);
  };
  return { source, seedDraft, bornOffline };
}

describe('28.152 the replica serves getMyDrafts from listDrafts', () => {
  it('28.152 answers DraftRows with unknown project name and attachment count, offline-born included, newest first', async () => {
    const { source, seedDraft, bornOffline } = await draftHarness();
    const old = newUlid();
    const fresh = newUlid();
    await seedDraft(old, 'Old');
    await bornOffline(fresh, 'New');
    const rows = await source.query.getMyDrafts(WS);
    expect(rows).toEqual([
      { ticketId: fresh, projectId: PROJECT, projectName: null, typeId: TYPE_TASK, title: 'New', parentId: null,
        updatedAt: '2026-10-03T08:00:00.000Z', attachmentCount: null, pending: true },
      { ticketId: old, projectId: PROJECT, projectName: null, typeId: TYPE_TASK, title: 'Old', parentId: null,
        updatedAt: SERVER_TIME, attachmentCount: null, pending: false },
    ]);
    // The control: the same drafts are on no other offline read (R22).
    expect((await source.query.listTicketSummaries(WS)).map((s) => s.ticketId)).not.toContain(old);
  });
});
