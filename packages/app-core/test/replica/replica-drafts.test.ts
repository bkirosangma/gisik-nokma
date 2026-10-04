import { describe, expect, it } from 'vitest';
import { newSubmittedEvent, newUlid, plainTextToDoc, type LedgerEvent } from '@gisik-nokma/domain';
import {
  createOutbox,
  createReplica,
  createSyncEngine,
  type BootstrapResponse,
  type Outbox,
  type SyncTransport,
} from '@gisik-nokma/sync-client';
import { createBetterSqliteStorage } from '@gisik-nokma/sync-client/testing';
import { createReplicaDataSource, type ReplicaDataSource } from '../../src/replica/replica-data-source.js';

/**
 * Drafts T4, cases 28.081 and 28.083 (spec R22, §12.2, §12.4): the author's replica holds their drafts (G3, G4) and
 * keeps them out of every offline view; `listDrafts` is the one offline read that returns one. The head (constants,
 * the workflow, `idleTransport`, the `world()` builder) is `replica-deleted-reads.test.ts`'s, with a draft in place
 * of the doomed ticket.
 */

const WS = newUlid();
const PROJECT = newUlid();
const USER_A = newUlid();
const WF = newUlid();
const TYPE_TASK = newUlid();
const SERVER_TIME = '2026-08-20T00:00:00.000Z';
const CLIENT_TIME = '2026-08-19T23:59:00.000Z';

const wfV1 = {
  id: WF,
  version: 1,
  name: 'Basic',
  initialStateId: 'todo',
  states: [
    { id: 'todo', name: 'To do', category: 'open' },
    { id: 'doing', name: 'Doing', category: 'active', blocked: false },
    { id: 'done', name: 'Done', category: 'terminal' },
  ],
  transitions: [
    { from: '*', to: 'todo', rules: [] },
    { from: '*', to: 'doing', rules: [] },
    { from: '*', to: 'done', rules: [] },
  ],
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

type World = {
  ds: ReplicaDataSource;
  outbox: Outbox;
  /** Applies one more server-confirmed event to the same replica. */
  apply: (entityId: string, type: string, payload: unknown) => Promise<void>;
  live: string;
  draft: string;
};

async function world(): Promise<World> {
  let seq = 0;
  let stream = 0;
  const envelope = (entity: { kind: 'ticket' | 'workflow' | 'ticket-type'; id: string }, type: string, payload: unknown, fixedSeq?: number): LedgerEvent => {
    seq += 1;
    stream += 1;
    return {
      ...newSubmittedEvent({ workspaceId: WS, entity, type, payload, actorId: USER_A, origin: 'server', now: () => new Date(CLIENT_TIME) }),
      serverTime: SERVER_TIME,
      seq: fixedSeq ?? seq,
      workspaceSeq: stream,
    };
  };
  const storage = createBetterSqliteStorage();
  const replica = await createReplica({ storage });
  const bootstrap: BootstrapResponse = {
    workspaceId: WS,
    me: { userId: USER_A, workspaceRole: 'member', projectIds: [PROJECT] },
    streamSeq: 0,
    definitions: [
      envelope({ kind: 'workflow', id: WF }, 'workflow.defined', wfV1, 1),
      envelope({ kind: 'ticket-type', id: TYPE_TASK }, 'ticket-type.defined', taskType, 1),
    ],
    tickets: [],
  };
  await replica.loadBootstrap(bootstrap);
  const apply = async (entityId: string, type: string, payload: unknown): Promise<void> => {
    await replica.applyServerItem(envelope({ kind: 'ticket', id: entityId }, type, payload));
  };
  const live = newUlid();
  const draft = newUlid();
  await apply(live, 'ticket.created', { typeId: TYPE_TASK, projectId: PROJECT, parentId: null, title: 'Live gutter' });
  await apply(draft, 'ticket.created', {
    typeId: TYPE_TASK, projectId: PROJECT, parentId: null, title: 'Draft gutter', start: 'backlog', draft: true,
  });
  for (const [id, comment] of [[live, 'the live drainpipe leaks'], [draft, 'the draft drainpipe leaks']] as const) {
    // The draft is PLANTED in `doing` (no door produces that): a Backlog draft would be absent from the board for an
    // unrelated reason, and only an active-state draft proves the DRAFT predicate is what drops it.
    await apply(id, 'ticket.transitioned', { to: 'doing' });
    await apply(id, 'ticket.assigned', { assigneeId: USER_A });
    await apply(id, 'comment.added', { body: plainTextToDoc(comment) });
  }
  const outbox = createOutbox({ storage, replica });
  const engine = createSyncEngine({ replica, outbox, transport: idleTransport });
  const ds = createReplicaDataSource({ workspaceId: WS, replica, outbox, engine, storage });
  return { ds, outbox, apply, live, draft };
}

const names = (w: World, ids: readonly string[]): string[] =>
  ids.map((id) => (id === w.draft ? 'DRAFT' : id === w.live ? 'live' : id)).sort();
/** The control: the server confirms the publish. The SAME ticket then appears in every read. */
const publish = (w: World): Promise<void> => w.apply(w.draft, 'ticket.published', { projectId: PROJECT });
const boardCards = async (w: World) =>
  (await w.ds.query.getBoard(PROJECT)).groups.flatMap((g) => g.columns.flatMap((c) => c.cards));

describe('28.081 R22: no offline view lists a draft', () => {
  it('listTicketSummaries and myWork.assigned', async () => {
    const w = await world();
    const summaries = async () => names(w, (await w.ds.query.listTicketSummaries(WS)).map((s) => s.ticketId));
    const assigned = async () => names(w, (await w.ds.query.myWork(WS, USER_A)).assigned.map((s) => s.ticketId));
    expect(await summaries()).toEqual(['live']);
    expect(await assigned()).toEqual(['live']);
    await publish(w);
    expect(await summaries()).toEqual(['DRAFT', 'live']);
    expect(await assigned()).toEqual(['DRAFT', 'live']);
  });

  it('getTickets and getBoard', async () => {
    const w = await world();
    const rows = async () => names(w, (await w.ds.query.getTickets(PROJECT, {}, 'flat')).rows.map((r) => r.ticketId));
    const cards = async () => names(w, (await boardCards(w)).map((c) => c.ticketId));
    expect(await rows()).toEqual(['live']);
    expect(await cards()).toEqual(['live']);
    await publish(w);
    expect(await rows()).toEqual(['DRAFT', 'live']);
    expect(await cards()).toEqual(['DRAFT', 'live']);
  });

  it('searchOfflineCopy, on the title arm and on the comment arm', async () => {
    const w = await world();
    for (const text of ['gutter', 'drainpipe']) {
      const hits = async () => names(w, (await w.ds.query.searchOfflineCopy(WS, text)).hits.map((h) => h.ticketId));
      expect(await hits(), text).toEqual(['live']);
    }
    await publish(w);
    for (const text of ['gutter', 'drainpipe']) {
      const hits = async () => names(w, (await w.ds.query.searchOfflineCopy(WS, text)).hits.map((h) => h.ticketId));
      expect(await hits(), text).toEqual(['DRAFT', 'live']);
    }
  });

  it('a board card whose parent is a draft draws no parent badge; once published it does', async () => {
    const w = await world();
    const child = newUlid();
    await w.apply(child, 'ticket.created', { typeId: TYPE_TASK, projectId: PROJECT, parentId: w.live, title: 'Child gutter' });
    await w.apply(child, 'ticket.transitioned', { to: 'doing' });
    // `'no card'` only when the card is absent: a card whose badge is `null` must answer `null`, not fall through.
    const parentOf = async () => {
      const card = (await boardCards(w)).find((c) => c.ticketId === child);
      return card === undefined ? 'no card' : card.parent;
    };
    expect(await parentOf()).toEqual({ ticketId: w.live, key: null }); // CONTROL: a live parent draws
    await w.apply(child, 'ticket.reparented', { newParentId: w.draft }); // no door can do this (R4): planted
    expect(await parentOf()).toBeNull();
    await publish(w);
    expect(await parentOf()).toEqual({ ticketId: w.draft, key: null });
  });
});

describe('28.083 listDrafts', () => {
  const discard = (id: string) =>
    newSubmittedEvent({ workspaceId: WS, entity: { kind: 'ticket', id }, type: 'ticket.discarded', payload: {}, actorId: USER_A, origin: 'mobile' });

  it('lists confirmed and offline-born drafts newest first, drops a queued discard at once, keeps a queued publish, and ends with the confirmed publish', async () => {
    const w = await world();
    const listed = async () => (await w.ds.query.listDrafts(WS)).map((d) => d.ticketId);
    const first = await w.ds.query.listDrafts(WS);
    expect(first.map((d) => d.ticketId)).toEqual([w.draft]); // the live twin is not a draft
    expect(first[0]).toMatchObject({
      projectId: PROJECT, typeId: TYPE_TASK, title: 'Draft gutter', parentId: null, updatedAt: SERVER_TIME, pending: false, pendingEventIds: [],
    });

    const born = newSubmittedEvent({
      workspaceId: WS, entity: { kind: 'ticket', id: newUlid() }, type: 'ticket.created',
      payload: { typeId: TYPE_TASK, projectId: PROJECT, parentId: null, title: 'Born offline', start: 'backlog', draft: true },
      actorId: USER_A, origin: 'mobile', now: () => new Date('2026-09-01T00:00:00.000Z'),
    });
    expect((await w.outbox.enqueue(born)).queued).toBe(true);
    const second = await w.ds.query.listDrafts(WS);
    expect(second.map((d) => d.ticketId)).toEqual([born.entity.id, w.draft]);
    expect(second[0]).toMatchObject({ title: 'Born offline', pending: true, pendingEventIds: [born.id] });

    // a queued discard takes the confirmed draft off the list at once
    expect((await w.outbox.enqueue(discard(w.draft))).queued).toBe(true);
    expect(await listed()).toEqual([born.entity.id]);

    // A separate world, so the discard above is not in play. A QUEUED publish keeps the draft listed, badged
    // pending (the pill stays until the server answers, spec §12.4); the server's confirmed publish ends it.
    const w2 = await world();
    expect((await w2.ds.query.listDrafts(WS)).map((d) => d.ticketId)).toEqual([w2.draft]);
    const queuedPublish = newSubmittedEvent({
      workspaceId: WS, entity: { kind: 'ticket', id: w2.draft }, type: 'ticket.published', payload: { projectId: PROJECT }, actorId: USER_A, origin: 'mobile',
    });
    expect((await w2.outbox.enqueue(queuedPublish)).queued).toBe(true);
    expect(await w2.ds.query.listDrafts(WS)).toEqual([
      expect.objectContaining({ ticketId: w2.draft, pending: true, pendingEventIds: [queuedPublish.id] }),
    ]);
    await publish(w2);
    expect(await w2.ds.query.listDrafts(WS)).toEqual([]);
  });
});
