import { describe, expect, it } from 'vitest';
import {
  newSubmittedEvent,
  newUlid,
  type EventEnvelope,
  type LedgerEvent,
  type SubmittedEvent,
} from '@gisik-nokma/domain';
import { createBetterSqliteStorage } from '../src/storage/better-sqlite3.js';
import type { SyncStorage } from '../src/storage/storage.js';
import { createReplica, type BootstrapResponse, type Replica } from '../src/replica/replica.js';
import { createOutbox, type Outbox } from '../src/outbox/outbox.js';

/**
 * Drafts T4, case 28.082 (spec R22): an offline-born draft never reaches a view. `pendingCreatedTickets` leaves it
 * out (it cannot flash on a board) and `pendingCreatedDrafts` lists it for the Drafts page until a queued discard.
 * The head (constants, `committed`, `bootstrapOf`, `fixture`, `createTicket`) is `outbox.test.ts`'s.
 */

const WS = newUlid();
const OTHER_WS = newUlid();
const PROJECT = newUlid();
const USER_A = newUlid();
const WF = newUlid();
const TYPE_TASK = newUlid();

const SERVER_TIME = '2026-08-20T00:00:00.000Z';
const CLIENT_TIME = '2026-08-19T23:59:00.000Z';

const wf = {
  id: WF,
  version: 1,
  name: 'W',
  initialStateId: 'todo',
  states: [
    { id: 'todo', name: 'To do', category: 'open' },
    { id: 'done', name: 'Done', category: 'terminal' },
  ],
  transitions: [
    { from: '*', to: 'done', rules: [] },
    { from: '*', to: 'todo', rules: [] },
  ],
};

const taskType = { id: TYPE_TASK, name: 'Task', icon: 'check', rank: 3, workflowId: WF, fields: [] };

let seqCounter = 0;
let streamCounter = 0;

function committed(entity: EventEnvelope['entity'], type: string, payload: unknown, seq?: number): LedgerEvent {
  seqCounter += 1;
  streamCounter += 1;
  return {
    ...newSubmittedEvent({
      workspaceId: WS,
      entity,
      type,
      payload,
      actorId: USER_A,
      origin: 'server',
      now: () => new Date(CLIENT_TIME),
    }),
    serverTime: SERVER_TIME,
    seq: seq ?? seqCounter,
    workspaceSeq: streamCounter,
  };
}

function bootstrapOf(): BootstrapResponse {
  return {
    workspaceId: WS,
    me: { userId: USER_A, workspaceRole: 'member', projectIds: [PROJECT] },
    streamSeq: 0,
    definitions: [
      committed({ kind: 'workflow', id: WF }, 'workflow.defined', wf, 1),
      committed({ kind: 'ticket-type', id: TYPE_TASK }, 'ticket-type.defined', taskType, 1),
    ],
    tickets: [],
  };
}

type Fixture = { storage: SyncStorage; replica: Replica; outbox: Outbox };

async function fixture(): Promise<Fixture> {
  seqCounter = 0;
  streamCounter = 0;
  const storage = createBetterSqliteStorage();
  const replica = await createReplica({ storage });
  await replica.loadBootstrap(bootstrapOf());
  return { storage, replica, outbox: createOutbox({ storage, replica }) };
}

function createTicket(ticketId = newUlid(), title = 'Offline born'): SubmittedEvent {
  return newSubmittedEvent({
    workspaceId: WS,
    entity: { kind: 'ticket', id: ticketId },
    type: 'ticket.created',
    payload: { typeId: TYPE_TASK, projectId: PROJECT, parentId: null, title },
    actorId: USER_A,
    origin: 'mobile',
  });
}

/** A brand-new DRAFT, born offline: the same shape the dialog's "Save as draft" queues. */
function createDraft(ticketId = newUlid(), title = 'Offline draft'): SubmittedEvent {
  return newSubmittedEvent({
    workspaceId: WS,
    entity: { kind: 'ticket', id: ticketId },
    type: 'ticket.created',
    payload: { typeId: TYPE_TASK, projectId: PROJECT, parentId: null, title, start: 'backlog', draft: true },
    actorId: USER_A,
    origin: 'mobile',
  });
}

describe('28.082 offline-born drafts', () => {
  it('are absent from pendingCreatedTickets and present in pendingCreatedDrafts; an ordinary offline ticket is the reverse', async () => {
    const { storage, outbox } = await fixture();
    const plain = createTicket(newUlid(), 'Offline plain');
    const draft = createDraft(newUlid(), 'Offline draft');
    expect((await outbox.enqueue(plain)).queued).toBe(true);
    expect((await outbox.enqueue(draft)).queued).toBe(true);

    expect((await outbox.pendingCreatedTickets(WS)).map((t) => t.pending.id)).toEqual([plain.entity.id]);
    const drafts = await outbox.pendingCreatedDrafts(WS);
    expect(drafts.map((t) => t.pending.id)).toEqual([draft.entity.id]);
    expect(drafts[0]?.pending.draft).toMatchObject({ authorId: USER_A });
    expect(drafts[0]?.pendingEventIds).toEqual([draft.id]);
    // another workspace's caller sees neither
    expect(await outbox.pendingCreatedDrafts(OTHER_WS)).toEqual([]);

    // a queued discard of the offline-born draft takes it off the list
    const discard = newSubmittedEvent({
      workspaceId: WS, entity: { kind: 'ticket', id: draft.entity.id }, type: 'ticket.discarded', payload: {}, actorId: USER_A, origin: 'mobile',
    });
    expect((await outbox.enqueue(discard)).queued).toBe(true);
    expect(await outbox.pendingCreatedDrafts(WS)).toEqual([]);
    expect((await outbox.pendingCreatedTickets(WS)).map((t) => t.pending.id)).toEqual([plain.entity.id]); // still never the draft
    await storage.close();
  });
});
