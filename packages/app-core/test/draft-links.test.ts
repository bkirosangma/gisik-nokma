import { describe, expect, it } from 'vitest';
import { newSubmittedEvent, newUlid, type LedgerEvent, type SubmittedEvent, type TicketState } from '@gisik-nokma/domain';
import { createOutbox, createReplica, createSyncEngine, type BootstrapResponse, type SyncTransport } from '@gisik-nokma/sync-client';
import { createBetterSqliteStorage } from '@gisik-nokma/sync-client/testing';
import { createClientStateCache, type ClientStateCache } from '../src/cache.js';
import { precheckEvent, type PrecheckResult } from '../src/precheck.js';
import { createReplicaDataSource } from '../src/replica/replica-data-source.js';
import { makeSubmittedFactory } from '../src/submit.js';
import { WS as SEED_WS, ticketStateSeed } from './helpers/seed.js';

/**
 * 28.126 (drafts T6 Step 7): the replica's links read and the client precheck for draft-side links. The replica
 * setup is copied from typed-links 27.061 (`replica/replica-data-source.test.ts`) and the cache setup from 27.045
 * (`precheck-links.test.ts`), by copying rather than by export.
 */

// --- the replica half (27.061's setup) ---
const WS = newUlid();
const PROJECT = newUlid();
const USER_A = newUlid();
const WF = newUlid();
const TYPE_TASK = newUlid();
const SERVER_TIME = '2026-10-04T00:00:00.000Z';
const CLIENT_TIME = '2026-10-03T23:59:00.000Z';
const wf = {
  id: WF, version: 1, name: 'Basic', initialStateId: 'todo',
  states: [{ id: 'todo', name: 'To do', category: 'open' }, { id: 'done', name: 'Done', category: 'terminal' }],
  transitions: [{ from: '*', to: 'todo', rules: [] }, { from: '*', to: 'done', rules: [] }],
};
const taskType = { id: TYPE_TASK, name: 'Task', icon: 'check', rank: 3, workflowId: WF, fields: [] };

let seq = 0;
function envelope(entity: { kind: 'ticket' | 'workflow' | 'ticket-type'; id: string }, type: string, payload: unknown): LedgerEvent {
  seq += 1;
  return {
    ...newSubmittedEvent({ workspaceId: WS, entity, type, payload, actorId: USER_A, origin: 'server', now: () => new Date(CLIENT_TIME) }),
    serverTime: SERVER_TIME,
    seq,
    workspaceSeq: seq,
  };
}
const bootstrap = (): BootstrapResponse => ({
  workspaceId: WS,
  me: { userId: USER_A, workspaceRole: 'member', projectIds: [PROJECT] },
  streamSeq: 0,
  definitions: [envelope({ kind: 'workflow', id: WF }, 'workflow.defined', wf), envelope({ kind: 'ticket-type', id: TYPE_TASK }, 'ticket-type.defined', taskType)],
  tickets: [],
});
const idleTransport: SyncTransport = {
  bootstrap: () => Promise.reject(new Error('offline')),
  sync: () => Promise.reject(new Error('offline')),
  openStream: () => ({ close: () => undefined }),
  bootstrapTicket: () => Promise.reject(new Error('no per-ticket pull in this fixture')),
  bootstrapNote: () => Promise.reject(new Error('no note pull in this fixture')),
  reconcile: () => Promise.reject(new Error('offline')),
  purgedLookup: () => Promise.reject(new Error('offline')),
  deletedItems: () => Promise.reject(new Error('offline')),
};

describe('28.126 the replica\'s links read for drafts', () => {
  it('28.126 the replica lists a draft\'s from link as in and its plain links; a published sheet never lists a draft end; a discarded draft never appears', async () => {
    seq = 0;
    const storage = createBetterSqliteStorage();
    const replica = await createReplica({ storage });
    await replica.loadBootstrap(bootstrap());
    const [S, D, D2, G] = [newUlid(), newUlid(), newUlid(), newUlid()];
    const create = (id: string, title: string, draft: boolean) =>
      replica.applyServerItem(
        envelope({ kind: 'ticket', id }, 'ticket.created', {
          typeId: TYPE_TASK, projectId: PROJECT, parentId: null, title, ...(draft ? { start: 'backlog', draft: true } : {}),
        }),
      );
    await create(S, 'Ice maker', false);
    await create(D, 'Chiller', true);
    await create(D2, 'Cold room', true);
    await create(G, 'Freezer', true);
    const link = (on: string, payload: Record<string, unknown>) => replica.applyServerItem(envelope({ kind: 'ticket', id: on }, 'ticket.link_added', payload));
    await link(D, { kind: 'blocks', targetId: D, from: S }); // S blocks D, filed from D's side
    await link(D, { kind: 'relates', targetId: D2 });
    await link(D2, { kind: 'blocks', targetId: S }); // a draft linking OUT to a published ticket
    await link(G, { kind: 'relates', targetId: D }); // an incoming end ON D's sheet, then discarded
    await replica.applyServerItem(envelope({ kind: 'ticket', id: G }, 'ticket.discarded', {}));
    const outbox = createOutbox({ storage, replica });
    const engine = createSyncEngine({ replica, outbox, transport: idleTransport });
    const source = createReplicaDataSource({ workspaceId: WS, replica, outbox, engine, storage }).query;

    const onD = (await source.getTicketLinks(WS, D)).map((l) => [l.kind, l.direction, l.ticket.id]);
    expect(onD.sort()).toEqual([['blocks', 'in', S], ['relates', 'out', D2]].sort());
    expect((await source.getTicketLinks(WS, S)).map((l) => l.ticket.id)).toEqual([]); // D2 (and G) are draft ends on a published sheet
    expect((await source.getTicketLinks(WS, D2)).map((l) => [l.kind, l.direction, l.ticket.id]).sort()).toEqual(
      [['relates', 'in', D], ['blocks', 'out', S]].sort(),
    );
    expect(onD.map(([, , id]) => id)).not.toContain(G); // G names D and is in the replica: only the discarded test hides it
  });
});

// --- the precheck half (27.045's setup) ---
const ACTOR = '01J9GKRA000000000000000000';
const PS = '01J9GTKS100000000000000000'; // published
const PS2 = '01J9GTKS200000000000000000'; // published
const PD = '01J9GTKD100000000000000000'; // the actor's draft
const PX = '01J9GTKX000000000000000000'; // real-shaped, held by no cache
const NOW = () => new Date('2026-10-04T09:00:00.000Z');
const make = makeSubmittedFactory({ actorId: ACTOR, origin: 'web', now: NOW });
const titled = (id: string, title: string, extra: Partial<TicketState> = {}): TicketState =>
  ticketStateSeed({
    id,
    fields: { title: { value: title, actorId: ACTOR, clientTime: '2026-10-04T08:00:00.000Z', serverTime: '2026-10-04T08:00:01.000Z' } },
    ...extra,
  });
function cacheOf(...tickets: TicketState[]): ClientStateCache {
  const cache = createClientStateCache();
  for (const ticket of tickets) cache.upsertTicket(ticket);
  return cache;
}
const plainLink = (source: string, target: string, kind = 'blocks'): SubmittedEvent =>
  make({ workspaceId: SEED_WS, entity: { kind: 'ticket', id: source }, type: 'ticket.link_added', payload: { kind, targetId: target } });
const fromLink = (draft: string, source: string): SubmittedEvent =>
  make({ workspaceId: SEED_WS, entity: { kind: 'ticket', id: draft }, type: 'ticket.link_added', payload: { kind: 'blocks', targetId: draft, from: source } });

describe('28.126 the client precheck for draft-side links', () => {
  it('28.126 the precheck says draft.link-form word for word, and not-evaluated for a from that is not cached', async () => {
    // cache holds S and S2 (published) and D (a draft by the actor); X is unknown. S2 must be cached, or the CONTROL
    // is `not-evaluated` by typed-links' uncached-target guard and never reaches the engine.
    const cache = cacheOf(
      titled(PS, 'Ice maker'),
      titled(PS2, 'Compressor'),
      titled(PD, 'Chiller', { draft: { authorId: ACTOR, at: '2026-10-04T08:00:00.000Z' } }),
    );
    const precheck = (submitted: SubmittedEvent): Promise<PrecheckResult> => precheckEvent(submitted, cache, { now: NOW });
    expect(await precheck(plainLink(PS, PD))).toEqual({ kind: 'refused', rule: 'draft.link-form', reason: "Link to a draft from the draft's side" });
    expect(await precheck(plainLink(PS, PS2))).toEqual({ kind: 'passed' }); // CONTROL: a published target
    expect(await precheck(fromLink(PD, PS))).toEqual({ kind: 'passed' });
    expect(await precheck(fromLink(PD, PX))).toEqual({ kind: 'not-evaluated', why: 'missing-local-state' });
  });
});
