import { describe, expect, it } from 'vitest';
import {
  newSubmittedEvent,
  newUlid,
  type IngestResult,
  type LedgerEvent,
  type SubmittedEvent,
} from '@gisik-nokma/domain';
import {
  createOutbox,
  createReplica,
  createSyncEngine,
  type BootstrapResponse,
  type Outbox,
  type Replica,
  type StreamHandlers,
  type SyncEngine,
  type SyncStorage,
  type SyncTransport,
} from '@gisik-nokma/sync-client';
import { createBetterSqliteStorage } from '@gisik-nokma/sync-client/testing';
import type { DataSource, StreamItem } from '../../src/data-source.js';
import {
  OfflineAcceptError,
  REPLICA_GAPS,
  ReplicaGapError,
  createReplicaDataSource,
  type ReplicaDataSource,
} from '../../src/replica/replica-data-source.js';

/**
 * Plan 10 Task 12 — the replica `DataSource`. Cases 12.172–12.186.
 *
 * ## What ruling P30 asked for, and where the evidence for it is
 *
 * The ruling's own falsifier is `const _assignable: DataSource =
 * createReplicaDataSource(deps)` COMPILING. It is written out in 12.172 and it
 * is a `typecheck` guard, not a runtime one: `packages/app-core/
 * tsconfig.typecheck.json` includes `test`, so the line is in the gate's
 * program and its failure is `tsc` going red. A comment claiming assignability
 * would have been the check that cannot fail.
 *
 * ## `TZ` is not varied here, and that is a decision
 *
 * Following `apps/server/test/routes/board.test.ts:80-87`'s reasoning: nothing
 * this file asserts moves with the local zone. Every instant that appears is an
 * ISO 'Z' string the fixture wrote and the replica stored verbatim
 * (`ClaimProvenance.clientTime`/`serverTime`), and `dueDateOf` compares against
 * `IST_DAY_REGEX` on a stored day string rather than reading a clock. A
 * `TZ`-varying case over values that do not move with `TZ` is a check that
 * cannot fail.
 */

const WS = newUlid();
const OTHER_WS = newUlid();
const PROJECT = newUlid();
const USER_A = newUlid();
const USER_B = newUlid();
const WF = newUlid();
const TYPE_EPIC = newUlid();
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
    { id: 'waiting', name: 'Waiting on supplier', category: 'active', blocked: true },
    { id: 'done', name: 'Done', category: 'terminal' },
  ],
  transitions: [
    { from: '*', to: 'todo', rules: [] },
    { from: '*', to: 'doing', rules: [] },
    { from: '*', to: 'waiting', rules: [] },
    // The refusal 12.177 measures: a transition to `done` needs a comment.
    { from: '*', to: 'done', rules: [{ kind: 'require-comment' }] },
  ],
};

const wfV2 = { ...wfV1, version: 2, name: 'Basic (renamed states)' };

const epicType = { id: TYPE_EPIC, name: 'Epic', icon: 'flag', rank: 1, workflowId: WF, fields: [] };
const taskType = {
  id: TYPE_TASK,
  name: 'Task',
  icon: 'check',
  rank: 3,
  workflowId: WF,
  // A DECLARED field, because the local pre-check runs the real rule engine: a
  // `ticket.field_set` for an id the type does not declare is refused before it
  // is queued, so a fixture with `fields: []` would measure the refusal path
  // while claiming to measure the accepted one.
  fields: [{ id: 'notes', name: 'Notes', type: 'text' }],
};

let seqCounter = 0;
let streamCounter = 0;

function envelope(
  entity: { kind: 'ticket' | 'workflow' | 'ticket-type'; id: string },
  type: string,
  payload: unknown,
  opts: { seq?: number; actorId?: string } = {},
): LedgerEvent {
  seqCounter += 1;
  streamCounter += 1;
  return {
    ...newSubmittedEvent({
      workspaceId: WS,
      entity,
      type,
      payload,
      actorId: opts.actorId ?? USER_A,
      origin: 'server',
      now: () => new Date(CLIENT_TIME),
    }),
    serverTime: SERVER_TIME,
    seq: opts.seq ?? seqCounter,
    workspaceSeq: streamCounter,
  };
}

function bootstrapOf(): BootstrapResponse {
  return {
    workspaceId: WS,
    me: { userId: USER_A, workspaceRole: 'member', projectIds: [PROJECT] },
    streamSeq: 0,
    definitions: [
      envelope({ kind: 'workflow', id: WF }, 'workflow.defined', wfV1, { seq: 1 }),
      envelope({ kind: 'ticket-type', id: TYPE_EPIC }, 'ticket-type.defined', epicType, { seq: 1 }),
      envelope({ kind: 'ticket-type', id: TYPE_TASK }, 'ticket-type.defined', taskType, { seq: 1 }),
    ],
    tickets: [],
  };
}

/** An idle transport: every door is offline, so the engine never leaves `offline`. */
const idleTransport: SyncTransport = {
  bootstrap: () => Promise.reject(new Error('offline')),
  sync: () => Promise.reject(new Error('offline')),
  openStream: () => ({ close: () => undefined }),
};

type Fixture = {
  ds: ReplicaDataSource;
  replica: Replica;
  outbox: Outbox;
  engine: SyncEngine;
  storage: SyncStorage;
  epicId: string;
  taskId: string;
};

async function fixture(): Promise<Fixture> {
  seqCounter = 0;
  streamCounter = 0;
  const storage = createBetterSqliteStorage();
  const replica = await createReplica({ storage });
  await replica.loadBootstrap(bootstrapOf());

  const epicId = newUlid();
  const taskId = newUlid();
  await replica.applyServerItem(
    envelope({ kind: 'ticket', id: epicId }, 'ticket.created', {
      typeId: TYPE_EPIC,
      projectId: PROJECT,
      parentId: null,
      title: 'Registrations',
    }),
  );
  await replica.applyServerItem(
    envelope({ kind: 'ticket', id: taskId }, 'ticket.created', {
      typeId: TYPE_TASK,
      projectId: PROJECT,
      parentId: epicId,
      title: 'Board ticket',
    }),
  );
  await replica.applyServerItem(
    envelope({ kind: 'ticket', id: taskId }, 'ticket.assigned', { assigneeId: USER_A }, { actorId: USER_B }),
  );

  const outbox = createOutbox({ storage, replica });
  const engine = createSyncEngine({ replica, outbox, transport: idleTransport });
  const ds = createReplicaDataSource({ workspaceId: WS, replica, outbox, engine, storage });
  return { ds, replica, outbox, engine, storage, epicId, taskId };
}

function fieldSet(ticketId: string, fieldId: string, value: unknown): SubmittedEvent {
  return newSubmittedEvent({
    workspaceId: WS,
    entity: { kind: 'ticket', id: ticketId },
    type: 'ticket.field_set',
    payload: { fieldId, value },
    actorId: USER_A,
    origin: 'desktop',
  });
}

describe('12.172-12.177 the ruling P30 contract: one interface, two implementations', () => {
  it('12.172 IS a DataSource — the falsifier the ruling asked for, as a compiled line', async () => {
    const { ds } = await fixture();
    /**
     * THE RULING'S FALSIFIER. Its evidence is that `pnpm turbo run typecheck`
     * accepts this line, and its kill is `tsc` refusing it — the same
     * type-level guard `views/list-model.test.ts` uses for `TicketListView`.
     * Kept as a `const` with an explicit annotation rather than a cast: a cast
     * would compile whatever the shape is, which is the check that cannot fail.
     */
    const assignable: DataSource = ds;
    // And the runtime shape, so a reader who does not run `tsc` still sees
    // the three members named.
    expect(typeof assignable.ingest).toBe('function');
    expect(typeof assignable.subscribe).toBe('function');
    expect(typeof assignable.query.getBoard).toBe('function');
    // The superset half: replica-only members the base contract has no word for.
    expect(typeof ds.query.syncStatus).toBe('function');
    expect(typeof ds.query.searchOfflineCopy).toBe('function');
  });

  it('12.173 a locally-accepted claim answers pending — through a throw, never as an IngestResult', async () => {
    const { ds, outbox, taskId } = await fixture();
    const claim = fieldSet(taskId, 'notes', 'offline note');

    const error = await ds.ingest([claim]).then(
      () => null,
      (err: unknown) => err,
    );
    expect(error).toBeInstanceOf(OfflineAcceptError);
    const offline = error as OfflineAcceptError;
    expect(offline.results).toEqual([{ status: 'pending', eventId: claim.id }]);
    expect(offline.queuedEventIds).toEqual([claim.id]);
    // It really was queued: pending is an answer about the outbox, not a mood.
    expect(await outbox.queuedCount(WS)).toBe(1);
  });

  it('12.174 the settled columns do not move; the claim in transit is visible and DISTINCT', async () => {
    const { ds, replica, taskId } = await fixture();
    const claim = fieldSet(taskId, 'notes', 'offline note');
    await ds.ingest([claim]).catch(() => undefined);

    const settled = await replica.getTicket(taskId);
    expect(settled?.confirmed?.fields['notes']).toBeUndefined();

    const both = await ds.query.getTicketWithPending(taskId);
    expect(both?.confirmed?.fields['notes']).toBeUndefined();
    expect(both?.pending?.pending.fields['notes']?.value).toBe('offline note');
    expect(both?.pending?.pendingEventIds).toEqual([claim.id]);
  });

  it('12.175 the badge renders on BOTH doors of the pair — the list row AND the board card', async () => {
    const { ds, taskId, epicId } = await fixture();
    await ds.ingest([fieldSet(taskId, 'notes', 'in transit')]).catch(() => undefined);

    // The door that did not have the field until this task.
    const list = await ds.query.getTickets(PROJECT, {}, 'flat');
    const listRow = list.rows.find((row) => row.ticketId === taskId);
    const untouchedRow = list.rows.find((row) => row.ticketId === epicId);
    expect(listRow?.pending).toBe(true);
    expect(untouchedRow?.pending).toBe(false);

    // The door that already had it, filled `false` by the online mapper.
    const board = await ds.query.getBoard(PROJECT);
    const cards = board.groups.flatMap((group) => group.columns.flatMap((column) => column.cards));
    expect(cards.find((card) => card.ticketId === taskId)?.pending).toBe(true);
    expect(cards.find((card) => card.ticketId === epicId)?.pending).toBe(false);
  });

  it('12.176 a rule violation refuses instantly with the named rule, RETURNS a real IngestResult, and queues nothing', async () => {
    const { ds, outbox, taskId } = await fixture();
    const bare = newSubmittedEvent({
      workspaceId: WS,
      entity: { kind: 'ticket', id: taskId },
      type: 'ticket.transitioned',
      // `require-comment`, and no comment given.
      payload: { to: 'done' },
      actorId: USER_A,
      origin: 'desktop',
    });
    const results = await ds.ingest([bare]);
    expect(results).toEqual([
      { status: 'refused', eventId: bare.id, rule: 'require-comment', reason: expect.any(String) },
    ]);
    expect(await outbox.queuedCount(WS)).toBe(0);
  });

  it('12.177 ingest can never answer committed — enumerated over both outcomes, not asserted', async () => {
    const { ds, taskId } = await fixture();
    const accepted = fieldSet(taskId, 'notes', 'queued');
    const refused = newSubmittedEvent({
      workspaceId: WS,
      entity: { kind: 'ticket', id: taskId },
      type: 'ticket.transitioned',
      payload: { to: 'done' },
      actorId: USER_A,
      origin: 'desktop',
    });

    // Outcome 1: everything refused — the array comes back, and every status in
    // it is one the local rule engine actually decided.
    const returned: IngestResult[] = await ds.ingest([refused]);
    expect(returned.map((r) => r.status)).toEqual(['refused']);

    // Outcome 2: anything accepted — nothing comes back at all.
    const thrown = await ds.ingest([accepted]).then(
      () => 'returned',
      (err: unknown) => (err instanceof OfflineAcceptError ? err : 'other'),
    );
    expect(thrown).toBeInstanceOf(OfflineAcceptError);
    // The mixed batch: the refusal keeps its rule INSIDE the throw, so a caller
    // that catches loses nothing.
    const mixed = await ds
      .ingest([fieldSet(taskId, 'notes', 'second'), refused])
      .then(() => null, (err: unknown) => err as OfflineAcceptError);
    expect(mixed?.results.map((r) => r.status)).toEqual(['pending', 'refused']);
    // Those two outcomes are the whole space — `enqueue` answers
    // `{queued:true}` or `{queued:false,rule,reason}` and has no third arm — so
    // no input reaches a `committed`.
    expect([...returned, ...(mixed?.results ?? [])].some((r) => r.status === 'committed')).toBe(false);
  });
});

describe('12.178-12.181 what the offline copy answers that the online source refuses', () => {
  it('12.178 getTickets fills all FIVE fields online/mappers.ts refuses getTickets over', async () => {
    const { ds, taskId, epicId } = await fixture();
    const list = await ds.query.getTickets(PROJECT, {}, 'flat');
    const row = list.rows.find((r) => r.ticketId === taskId);
    expect(row).toBeDefined();
    // The five, as rows rather than as "five".
    expect(row?.typeRank).toBe(3);
    expect(row?.epicId).toBe(epicId);
    expect(row?.stateName).toBe('To do');
    expect(row?.hasRestrictedParent).toBe(false);
    expect(row?.assignedProvenance).toEqual({
      actorId: USER_B,
      actorName: null,
      clientTime: CLIENT_TIME,
      serverTime: SERVER_TIME,
    });
    // And `rollup` is null rather than a fabricated `restrictedCount`: a replica
    // cannot count the children it was never sent.
    expect(row?.rollup).toBeNull();
  });

  it('12.179 hasRestrictedParent stays FALSE while the engine is not live — lag is not restriction', async () => {
    const { ds, replica, taskId } = await fixture();
    // The parent is purged, so it is genuinely absent from local scope.
    const before = await ds.query.getTickets(PROJECT, {}, 'flat');
    expect(before.rows.find((r) => r.ticketId === taskId)?.parentId).not.toBeNull();
    const parentId = before.rows.find((r) => r.ticketId === taskId)?.parentId ?? '';
    await replica.purgeEntity(parentId);

    const list = await ds.query.getTickets(PROJECT, {}, 'flat');
    const row = list.rows.find((r) => r.ticketId === taskId);
    expect(row?.parentId).toBe(parentId);
    // The parent is gone AND the engine has never reached `live`, so the two
    // causes — "you may not see it" and "it has not arrived yet" — are
    // indistinguishable. The narrower answer is the one that does not claim a
    // restriction nobody imposed.
    expect(row?.hasRestrictedParent).toBe(false);
  });

  it('12.180 getWorkflowDef answers a NAMED version, not merely the latest', async () => {
    const { ds, replica } = await fixture();
    await replica.applyServerItem(envelope({ kind: 'workflow', id: WF }, 'workflow.defined', wfV2, { seq: 2 }));

    expect((await ds.query.getWorkflowDef(WS, WF))?.version).toBe(2);
    expect((await ds.query.getWorkflowDef(WS, WF, 1))?.name).toBe('Basic');
    expect((await ds.query.getWorkflowDef(WS, WF, 2))?.name).toBe('Basic (renamed states)');
    expect(await ds.query.getWorkflowDef(WS, WF, 9)).toBeNull();
    expect(await ds.query.getWorkflowDef(OTHER_WS, WF)).toBeNull();
  });

  it('12.181 board columns are the definition\'s own states, in order, carrying its blocked flag', async () => {
    const { ds, taskId } = await fixture();
    const board = await ds.query.getBoard(PROJECT);
    expect(board.groups).toHaveLength(1);
    const group = board.groups[0];
    expect(group?.workflowVersion).toBe(1);
    expect(group?.columns.map((c) => c.stateId)).toEqual(['todo', 'doing', 'waiting', 'done']);
    expect(group?.columns.map((c) => c.blocked)).toEqual([false, false, true, false]);
    expect(group?.columns.find((c) => c.stateId === 'todo')?.cards.map((c) => c.ticketId)).toContain(taskId);
  });
});

describe('12.182-12.184 the replica-only surface, and what it confesses', () => {
  it('12.182 myWork separates assigned, claims in transit, and contested', async () => {
    const { ds, taskId } = await fixture();
    await ds.ingest([fieldSet(taskId, 'notes', 'x')]).catch(() => undefined);
    const mine = await ds.query.myWork(WS, USER_A);
    expect(mine.assigned.map((t) => t.ticketId)).toEqual([taskId]);
    expect(mine.claimsInTransit.map((t) => t.ticketId)).toEqual([taskId]);
    expect(mine.contested).toEqual([]);
  });

  it('12.183 search names its source: the base method REFUSES, and only the offline-copy door answers', async () => {
    const { ds, taskId } = await fixture();
    await expect(ds.query.search(WS, 'board')).rejects.toBeInstanceOf(ReplicaGapError);
    const gap = await ds.query.search(WS, 'board').then(
      () => null,
      (err: unknown) => err as ReplicaGapError,
    );
    expect(gap?.absences.map((absence) => absence.field)).toEqual([
      'SearchHit.matchedIn',
      'SearchHit.snippet',
    ]);

    const local = await ds.query.searchOfflineCopy(WS, 'board');
    expect(local.offlineCopy).toBe(true);
    expect(local.hits.map((h) => h.ticketId)).toEqual([taskId]);
  });

  it('12.184 syncStatus reports the engine, the queue depth and the terminal failures', async () => {
    const { ds, taskId } = await fixture();
    expect(await ds.query.syncStatus(WS)).toEqual({ status: 'offline', queued: 0, failed: 0 });
    await ds.ingest([fieldSet(taskId, 'notes', 'a')]).catch(() => undefined);
    await ds.ingest([fieldSet(taskId, 'notes', 'b')]).catch(() => undefined);
    expect(await ds.query.syncStatus(WS)).toEqual({ status: 'offline', queued: 2, failed: 0 });
  });
});

describe('12.185-12.186 the refusals, and the frames subscribe carries', () => {
  it('12.185 SEVEN methods refuse, enumerated by id rather than counted', async () => {
    const { ds } = await fixture();
    const refusals: Array<[string, () => Promise<unknown>]> = [
      ['getMyWorkspaces', () => ds.query.getMyWorkspaces()],
      ['getMembers', () => ds.query.getMembers(WS)],
      ['search', () => ds.query.search(WS, 'x')],
      ['getMyWork', () => ds.query.getMyWork(WS)],
      ['getAttention', () => ds.query.getAttention(WS)],
      ['getPreferences', () => ds.query.getPreferences(WS)],
      ['putPreferences', () => ds.query.putPreferences(WS, { version: 1, projects: {}, savedFilters: [] })],
    ];
    const names: string[] = [];
    for (const [name, call] of refusals) {
      const err = await call().then(
        () => null,
        (e: unknown) => e,
      );
      expect(err, name).toBeInstanceOf(ReplicaGapError);
      for (const absence of (err as ReplicaGapError).absences) {
        // A replica absence is NOT a serving gap, and the difference is
        // structural rather than a matter of wording: `online/mappers.ts`'s
        // `Absence` carries `wireKey` and `wireRoute` because
        // `client-contract.test.ts` measures each against a real `/v1` body. A
        // `ReplicaAbsence` has neither key — there is no route to measure — so
        // one of these can never be fed into `SERVING_GAPS` and pass vacuously
        // through a `wireRoute: null`.
        expect(Object.keys(absence).sort(), `${name}: ${absence.field}`).toEqual([
          'because',
          'field',
          'owner',
        ]);
        // And every owner is something the CLIENT would have to change.
        expect(absence.owner, `${name}: ${absence.field}`).toMatch(/^Plan 10 — /);
      }
      names.push(name);
    }
    expect(names).toEqual(Object.keys(REPLICA_GAPS));

    // And the ones that do NOT refuse, named too — a refusal list is only
    // evidence beside the list of what answers.
    await expect(ds.query.getTicketTypes(WS)).resolves.toHaveLength(2);
    await expect(ds.query.getTicketHistory(newUlid())).resolves.toEqual([]);
  });

  it('12.186 subscribe hands its callback a real StreamItem — the kind useLiveQuery acts on', async () => {
    // A transport that hands the engine one stream, so a frame can be delivered
    // through the door a production stream uses.
    let handlers: StreamHandlers | null = null;
    const storage = createBetterSqliteStorage();
    const replica = await createReplica({ storage });
    await replica.loadBootstrap(bootstrapOf());
    const outbox = createOutbox({ storage, replica });
    const engine = createSyncEngine({
      replica,
      outbox,
      transport: {
        bootstrap: () => Promise.resolve(bootstrapOf()),
        sync: () => Promise.resolve([]),
        openStream: (_ws, _afterSeq, h) => {
          handlers = h;
          return { close: () => undefined };
        },
      },
    });
    const ds = createReplicaDataSource({ workspaceId: WS, replica, outbox, engine, storage });

    const seen: StreamItem[] = [];
    const off = ds.subscribe(WS, 0, (item) => seen.push(item));
    await engine.start(WS);
    const streamed = envelope({ kind: 'ticket', id: newUlid() }, 'ticket.created', {
      typeId: TYPE_TASK,
      projectId: PROJECT,
      parentId: null,
      title: 'Streamed in',
    });
    (handlers as unknown as StreamHandlers).onItem(streamed);
    await engine.settled();

    // NOT a bare change signal: the frame is the 5-kind union's `event` arm,
    // carrying the envelope. `views/use-live-query.ts` re-queries only on
    // `event` and `purge`, so a source that emitted anything else here would
    // leave every app-core view frozen while looking wired up.
    expect(seen.filter((item) => item.type === 'event')).toEqual([{ type: 'event', envelope: streamed }]);

    off();
    (handlers as unknown as StreamHandlers).onItem(
      envelope({ kind: 'ticket', id: newUlid() }, 'ticket.created', {
        typeId: TYPE_TASK,
        projectId: PROJECT,
        parentId: null,
        title: 'After unsubscribe',
      }),
    );
    await engine.settled();
    expect(seen.filter((item) => item.type === 'event')).toHaveLength(1);
    engine.stop();
  });
});
