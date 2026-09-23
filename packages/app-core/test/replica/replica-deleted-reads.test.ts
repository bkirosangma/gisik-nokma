import { describe, expect, it } from 'vitest';
import { newSubmittedEvent, newUlid, plainTextToDoc, type LedgerEvent } from '@gisik-nokma/domain';
import {
  createOutbox,
  createReplica,
  createSyncEngine,
  type BootstrapResponse,
  type SyncTransport,
} from '@gisik-nokma/sync-client';
import { createBetterSqliteStorage } from '@gisik-nokma/sync-client/testing';
import { createReplicaDataSource, type ReplicaDataSource } from '../../src/replica/replica-data-source.js';

/**
 * The deleted-ticket fixture the replica suite never had (round-1 F5, round-2
 * E6-24): ONE world, two tasks that differ in exactly one respect — one of them
 * receives a `ticket.deleted` — and every view-serving read of
 * `replica-data-source.ts` asked about both, before and after the delete.
 *
 * The live twin is the control, and it is inside every assertion rather than
 * in a sibling case: `toEqual(['live'])` fails on an empty world exactly as it
 * fails on a world that still carries the deleted ticket, so a read that
 * answers nothing cannot pass here as a read that filters. Each case runs its
 * own before-delete read first, so the delete is proven to be the only
 * difference between the two answers.
 *
 * The module under test is imported by RELATIVE PATH, which is what makes a
 * mutation of one of its gates reach this file without a build. That is the
 * property `apps/server/test/read/soft-delete-background-paths.test.ts` cites
 * for its (c) measurement, and this file is the half of that measurement the
 * citation is true of.
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
};

type World = {
  ds: ReplicaDataSource;
  /** Applies one more server-confirmed event to the same replica. */
  apply: (entityId: string, type: string, payload: unknown) => Promise<void>;
  live: string;
  doomed: string;
};

/**
 * Two tasks, both in `doing` and both assigned to the viewer, so that `getBoard`
 * and `myWork.assigned` have a row to carry for each. Each task also carries one
 * comment whose body names the ticket by a SECOND word, so the offline search's
 * comment arm can be asked separately from its title arm.
 */
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
  const live = newUlid();
  const doomed = newUlid();
  const apply = async (entityId: string, type: string, payload: unknown): Promise<void> => {
    await replica.applyServerItem(envelope({ kind: 'ticket', id: entityId }, type, payload));
  };
  for (const [id, title, comment] of [
    [live, 'Live gutter', 'the live drainpipe leaks'],
    [doomed, 'Doomed gutter', 'the doomed drainpipe leaks'],
  ] as const) {
    await apply(id, 'ticket.created', { typeId: TYPE_TASK, projectId: PROJECT, parentId: null, title });
    await apply(id, 'ticket.transitioned', { to: 'doing' });
    await apply(id, 'ticket.assigned', { assigneeId: USER_A });
    await apply(id, 'comment.added', { body: plainTextToDoc(comment) });
  }
  const outbox = createOutbox({ storage, replica });
  const engine = createSyncEngine({ replica, outbox, transport: idleTransport });
  const ds = createReplicaDataSource({ workspaceId: WS, replica, outbox, engine, storage });
  return { ds, apply, live, doomed };
}

/** Which of the two tickets a read answered, by name, sorted — so a failure names the ticket rather than an id. */
function names(w: World, ids: readonly string[]): string[] {
  return ids.map((id) => (id === w.doomed ? 'DOOMED' : id === w.live ? 'live' : id)).sort();
}

/** Delete the doomed twin and prove the replica FOLDED it — the flag is there for every read to consult. */
async function deleteDoomed(w: World): Promise<void> {
  await w.apply(w.doomed, 'ticket.deleted', {});
  const state = (await w.ds.query.getTicketWithPending(w.doomed))?.confirmed as { deleted?: unknown } | null | undefined;
  expect(state?.deleted ?? null).not.toBeNull();
}

describe('E6-24 — the three view-serving replica reads the Delete commit did not reach', () => {
  it('E6-24: listTicketSummaries drops a soft-deleted ticket — the phone board and the desktop list read here', async () => {
    const w = await world();
    const read = async () => names(w, (await w.ds.query.listTicketSummaries(WS)).map((s) => s.ticketId));
    expect(await read()).toEqual(['DOOMED', 'live']);
    await deleteDoomed(w);
    expect(await read()).toEqual(['live']);
  });

  it('E6-24: myWork.assigned drops it — a filter over the summaries, fixed by the same line', async () => {
    const w = await world();
    const read = async () => names(w, (await w.ds.query.myWork(WS, USER_A)).assigned.map((s) => s.ticketId));
    expect(await read()).toEqual(['DOOMED', 'live']);
    await deleteDoomed(w);
    expect(await read()).toEqual(['live']);
  });

  it('E6-24: searchOfflineCopy drops it on the TITLE arm — the phone\'s offline search reads here', async () => {
    const w = await world();
    const read = async () => names(w, (await w.ds.query.searchOfflineCopy(WS, 'gutter')).hits.map((h) => h.ticketId));
    expect(await read()).toEqual(['DOOMED', 'live']);
    await deleteDoomed(w);
    expect(await read()).toEqual(['live']);
  });

  it('E6-24: searchOfflineCopy drops it on the COMMENT arm too — a comment on a deleted ticket does not resurface its title', async () => {
    const w = await world();
    // `drainpipe` is in the comments only — neither title carries it — so a hit
    // here can only have come through the comment-owner lookup.
    const read = async () => names(w, (await w.ds.query.searchOfflineCopy(WS, 'drainpipe')).hits.map((h) => h.ticketId));
    expect(await read()).toEqual(['DOOMED', 'live']);
    await deleteDoomed(w);
    expect(await read()).toEqual(['live']);
  });
});

describe('F5 — the two replica gates the Delete commit DID write, witnessed for the first time', () => {
  /**
   * Round-1 F5 measured both of these as survivors: mutating either gate left
   * the replica suite 27 passed / 0 failed, because no replica test held a
   * deleted ticket. The same world as E6-24 above, asked at the two reads that
   * always carried the rule — so the next edit to either line cannot pass
   * without answering the question.
   */
  it('F5: getTickets drops a soft-deleted ticket — the `if ((state.deleted ?? null) !== null) continue;` in the ticket enumeration', async () => {
    const w = await world();
    const read = async () => names(w, (await w.ds.query.getTickets(PROJECT, {}, 'flat')).rows.map((r) => r.ticketId));
    expect(await read()).toEqual(['DOOMED', 'live']);
    await deleteDoomed(w);
    expect(await read()).toEqual(['live']);
  });

  it('F5: getBoard drops it — the `(state.deleted ?? null) === null` conjunct beside `closed` in the board filter', async () => {
    const w = await world();
    const read = async () =>
      names(w, (await w.ds.query.getBoard(PROJECT)).groups.flatMap((g) => g.columns.flatMap((c) => c.cards.map((k) => k.ticketId))));
    expect(await read()).toEqual(['DOOMED', 'live']);
    await deleteDoomed(w);
    expect(await read()).toEqual(['live']);
  });
});
