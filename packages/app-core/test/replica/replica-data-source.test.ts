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
import type { ClientStreamFrame, DataSource } from '../../src/data-source.js';
import {
  OFFLINE_BORN_ABSENCE,
  OfflineAcceptError,
  REPLICA_GAPS,
  ReplicaGapError,
  createReplicaDataSource,
  type ReplicaDataSource,
} from '../../src/replica/replica-data-source.js';

/**
 * Plan 10 Task 12 — the replica `DataSource`. Cases 12.172–12.187.
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
  bootstrapTicket: () => Promise.reject(new Error('closure 5b(d): no per-ticket pull in this fixture')),
  bootstrapNote: () => Promise.reject(new Error('Plan 2: no note pull in this fixture')),
  reconcile: () => Promise.reject(new Error('offline')),
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

  /**
   * 12.22 — a locally-accepted claim through the replica DataSource answers pending (via a thrown OfflineAcceptError carrying {status:'pending'}), and no path in this test returns 'committed' for a local accept.
   */
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

  /**
   * 13.1434a — starting-status design, 2026-09-23. The REPLICA's own
   * `isCreatableState` derivation (`replica-data-source.ts`'s `getBoard`,
   * `columns: def.states.map(...)`), UNWITNESSED until this case: earlier
   * fixture edits in this file only satisfied the typecheck each `creatable`
   * addition required, without asserting the VALUE the replica actually
   * computes. Suffixed because the UI block (`13.1431`–`13.1445`) is fully
   * spent; cited by hand, since `check-case-citations`' ratchet skips
   * suffixed ids.
   */
  it('13.1434a getBoard carries creatable per column, read off the SAME workflow def every other query answers from', async () => {
    const { ds } = await fixture();
    const board = await ds.query.getBoard(PROJECT);
    const columns = board.groups.flatMap((group) => group.columns);
    const byState = new Map(columns.map((column) => [column.stateId, column.creatable]));
    // `wfV1` (this file's own fixture, above): three non-terminal states —
    // creatable regardless of `blocked` — and one terminal state — not.
    expect(byState.get('todo')).toBe(true);
    expect(byState.get('doing')).toBe(true);
    expect(byState.get('waiting')).toBe(true);
    expect(byState.get('done')).toBe(false);
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

  /**
   * 13.1338 — the offline list row's `key` is `null`, and that is a measured
   * answer rather than a hole (owner request 2026-09-22, the List's key column).
   *
   * The key is `<workspace prefix><project prefix>-<number>` and the NUMBER is
   * derived from the ledger's order, which the device does not hold — the same
   * under-claim the board cards make in the same file (`key: null` on both card
   * builders, whose docblocks record it and why a locally re-derived number
   * would be worse than no key). So a row here must answer `null` exactly as the
   * board does, and the list's Key cell renders the em dash for it.
   *
   * `toBeNull` and not `toBeFalsy`: `ListRow.key` is REQUIRED, so the failure
   * this case exists to catch is a producer that stopped carrying the field at
   * all — `undefined` — which `toBeFalsy` would accept. The control is in the
   * same case and reads the SAME object: `typeRank` is populated off the same
   * `rowOf`, so the null above is a value on a real row and not the shape of a
   * row that failed to build.
   */
  it('13.1338 a list row read from the replica carries key null, and is otherwise a real row', async () => {
    const { ds, taskId } = await fixture();
    const list = await ds.query.getTickets(PROJECT, {}, 'flat');
    const row = list.rows.find((r) => r.ticketId === taskId);
    expect(row).toBeDefined();
    // The control, first and on the same object.
    expect(row?.typeRank).toBe(3);
    expect(row?.key).toBeNull();
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
  it('12.185 TEN methods refuse, enumerated by id rather than counted', async () => {
    const { ds } = await fixture();
    const refusals: Array<[string, () => Promise<unknown>]> = [
      ['getMyWorkspaces', () => ds.query.getMyWorkspaces()],
      ['getMembers', () => ds.query.getMembers(WS)],
      // Added 2026-09-20 with the attachments read. The entry's POSITION here
      // matters: the assertion below is `toEqual(Object.keys(REPLICA_GAPS))`,
      // which is order-sensitive, and `REPLICA_GAPS` gained this key directly
      // under `getMembers`. Enumerated rather than counted, as the comment
      // above says, so the name travels with the list.
      ['getTicketAttachments', () => ds.query.getTicketAttachments(WS, newUlid())],
      // Added 2026-09-21 with the comment thread, and placed here for the SAME
      // reason the entry above is placed where it is: the assertion is
      // `toEqual(Object.keys(REPLICA_GAPS))`, which is order-sensitive, and
      // `REPLICA_GAPS` gained this key directly under `getTicketAttachments`.
      ['getTicketComments', () => ds.query.getTicketComments(WS, newUlid())],
      // THE SEVEN NOTE ENTRIES WERE HERE, and they left when Plan 2 of the notes
      // series landed the replica tables and the implementations. Deleting them
      // was forced by the assertion below rather than remembered: this list is
      // compared against `Object.keys(REPLICA_GAPS)`, so a gap that outlives its
      // gap fails here — which is the property 18.038 now pins from the other
      // side. `search` is STILL in the list and unrelated: local note search is
      // Plan 3's.
      ['search', () => ds.query.search(WS, 'x')],
      // Added by the notes series' search plan (Plan 3 of 6). This entry is the
      // list announcing itself, exactly as the comment below describes: the
      // replica gained the method and this case, which compares the list against
      // `Object.keys(REPLICA_GAPS)`, reddened until it was named here.
      ['searchNotes', () => ds.query.searchNotes(WS, 'x', { mode: 'lexical' })],
      ['getMyWork', () => ds.query.getMyWork(WS)],
      ['getAttention', () => ds.query.getAttention(WS)],
      // Added by second wave Task 6. This list is enumerated rather than
      // counted, and it is compared against `Object.keys(REPLICA_GAPS)` below,
      // so adding the method to the replica WITHOUT adding it here reddens this
      // case rather than passing quietly — which is how it announced itself.
      ['getWorkspaceSettings', () => ds.query.getWorkspaceSettings(WS)],
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
        // And every owner is something the CLIENT would have to change. The
        // notes series (Plan 1 of 6) added a SECOND such owner and named it
        // honestly rather than writing "Plan 10" over Plan 2's work: the
        // property this line holds is that the owner is a NAMED plan the client
        // must change, which was a one-plan set until the notes replica landed.
        // Widening it to the two plans that will actually do the work keeps the
        // property; hard-coding `Plan 10` would have made the sentence false.
        expect(absence.owner, `${name}: ${absence.field}`).toMatch(/^(Plan 10|Plan 2 of the notes series) — /);
      }
      names.push(name);
    }
    expect(names).toEqual(Object.keys(REPLICA_GAPS));

    // And the ones that do NOT refuse, named too — a refusal list is only
    // evidence beside the list of what answers.
    await expect(ds.query.getTicketTypes(WS)).resolves.toHaveLength(2);
    await expect(ds.query.getTicketHistory(newUlid())).resolves.toEqual([]);
  });

  /**
   * 18.038 — the same seven doors as 12.185's list, asserted as ONE case with
   * its own id.
   *
   * It is deliberately a second pass over ground 12.185 already walks: 12.185 is
   * the ENUMERATION case (it compares the whole refusal list against
   * `REPLICA_GAPS`), and this is the notes series' own witness that the seven
   * note reads are among them. A case id belongs to the plan that mints it, and
   * 12.185 cannot cite 18.038 for the same reason it cannot cite any other
   * later plan's id.
   *
   * The CONTROL is in the same `it` because a rejection list on its own is
   * satisfied by a source that rejects everything: `getTicketTypes` resolves.
   */
  it('18.038 the seven note reads ANSWER, and the gap list is what says so', async () => {
    // INVERTED, not deleted. Plan 1 wrote this case as "note reads are replica
    // gaps until Plan 2" and Plan 2 landed the tables and the implementations —
    // so the same claim, read one plan later, is now FALSE in the direction it
    // was written and TRUE in the direction that matters. Rewriting it to pin
    // the reconciled state is the move `client-contract.test.ts` made for
    // `scope-revoked`: a divergence that closed is a divergence that can
    // silently re-open, and the machinery that caught the closing is what
    // catches the regression.
    const { ds } = await fixture();
    for (const [m, args] of [
      ['getNotes', [WS]],
      ['getDeletedNotes', [WS]],
      ['getNote', [WS, newUlid()]],
      ['getNotesForTicket', [WS, newUlid()]],
      ['getNoteComments', [WS, newUlid()]],
      ['getNoteHistory', [WS, newUlid()]],
      ['getNoteVersion', [WS, newUlid(), newUlid()]],
    ] as const) {
      // Not "does not throw" — an ANSWER. Every one of these is a local read
      // over an empty replica, and the honest answer to all seven is an empty
      // one; a read that threw a `ReplicaGapError` would be the screen saying a
      // feature is missing when it is not.
      await expect((ds.query[m] as (...a: readonly string[]) => Promise<unknown>)(...args)).resolves.toBeDefined();
      expect(REPLICA_GAPS[m], `${m} is still listed as a gap`).toBeUndefined();
    }
    // CONTROL, and it is the same one the case carried before inversion: an
    // implemented read still answers, so the seven above are about the note
    // group and not about a source that resolves everything.
    await expect(ds.query.getTicketTypes(WS)).resolves.toHaveLength(2);
    // ...and the gap list still has teeth: `search` refuses, which is what
    // separates "the note reads were implemented" from "the gap machinery was
    // switched off".
    await expect(ds.query.search(WS, 'x')).rejects.toBeInstanceOf(ReplicaGapError);
  });

  it('12.186 subscribe hands its callback a real ClientStreamFrame — the kind useLiveQuery acts on', async () => {
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
        bootstrapTicket: () => Promise.reject(new Error('closure 5b(d): no per-ticket pull in this fixture')),
        bootstrapNote: () => Promise.reject(new Error('Plan 2: no note pull in this fixture')),
        reconcile: (ws: string) => Promise.resolve({ workspaceId: ws, restricted: [], restrictedNotes: [] }),
      },
    });
    const ds = createReplicaDataSource({ workspaceId: WS, replica, outbox, engine, storage });

    const seen: ClientStreamFrame[] = [];
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

/**
 * 12.249 — THE STALE ATTRIBUTION, found by review and reproduced.
 *
 * `claimsFor` branched ONCE on the state event and, finding none, took the
 * snapshot block for BOTH claims — never looking at the local `ticket.assigned`
 * events it had been handed. On the ordinary fresh-device path that is a wrong
 * answer on screen: a snapshot-bounded bootstrap ships neither
 * `ticket.created`/`.transitioned` NOR `ticket.assigned` below the line, then a
 * streamed `ticket.assigned` arrives, and the door served the snapshot's OLD
 * assignment claim beside the NEW assignee — a stale actor and a stale instant,
 * rendered as the claim that produced the current assignment.
 *
 * The guard that was supposed to prevent it checked only NULLNESS, while its
 * comment claimed to catch drift "if a local fold has moved the assignment on".
 * **A guard that checks whether a value exists is not checking whether it is
 * the right value** — and the comment saying otherwise made the gap read as
 * covered.
 */
describe('12.249 a newer local assignment beats the shipped block', () => {
  const TICKET = 'tkt-stale';
  const USER_C = newUlid();
  const USER_D = newUlid();
  // Deliberately NOT `SERVER_TIME`, which is what `envelope` stamps on the
  // local event. The two must differ or the instant assertion below cannot
  // tell the block's value from the event's — the first draft used a string
  // that happened to equal `SERVER_TIME`, and the case failed for that reason
  // rather than for a defect.
  const OLD = { actorId: USER_A, clientTime: '2026-01-01T00:00:00.000Z', serverTime: '2026-01-01T00:00:00.000Z' };

  it('12.249 assignedProvenance names the actor of the LOCAL assignment, not the snapshot’s', async () => {
    const storage = createBetterSqliteStorage();
    const replica = await createReplica({ storage });
    // A ticket that exists ONLY as a snapshot — no events below the line, which
    // is the fresh-device shape, not an exotic one.
    await replica.loadBootstrap({
      ...bootstrapOf(),
      tickets: [
        {
          ticketId: TICKET,
          snapshot: {
            seq: 1,
            state: {
              kind: 'ticket', id: TICKET, workspaceId: WS, projectId: PROJECT,
              typeId: TYPE_TASK, parentId: null, workflowId: WF, workflowVersion: 1,
              stateId: wfV1.initialStateId, stateCategory: 'open',
              assigneeId: USER_B, collaboratorIds: [],
              // The birth claim the reducer writes on every `ticket.created`
              // (spec 2026-09-22). A snapshot carrying NO claim is a replica
              // whose reducer predates the field — which `priorityOf` THROWS on,
              // deliberately. This case is about `assignedProvenance`, so the
              // snapshot here has to be a state the product can actually
              // produce, or it fails for a reason it is not testing.
              fields: { priority: { value: 'P2', actorId: USER_A, clientTime: CLIENT_TIME, serverTime: SERVER_TIME } },
              transitions: [],
            },
            provenance: { state: OLD, assigned: OLD },
          },
          events: [],
        } as never,
      ],
    });

    // THE PRE-STATE, so the case cannot pass by the block never arriving.
    expect((await replica.getSnapshotProvenance(TICKET))?.assigned?.actorId).toBe(USER_A);

    // Now the assignment MOVES, locally, by a different actor at a later time.
    await replica.applyServerItem(
      envelope({ kind: 'ticket', id: TICKET }, 'ticket.assigned', { assigneeId: USER_D }, { actorId: USER_C }),
    );

    const outbox = createOutbox({ storage, replica });
    const engine = createSyncEngine({ replica, outbox, transport: idleTransport });
    const ds = createReplicaDataSource({ workspaceId: WS, replica, outbox, engine, storage });
    const row = (await ds.query.getTickets(PROJECT, {}, 'flat')).rows.find((r) => r.ticketId === TICKET);

    expect(row?.assignee?.id, 'the state moved').toBe(USER_D);
    // THE DEFECT: this read USER_A — the snapshot's actor — beside USER_D.
    expect(row?.assignedProvenance?.actorId).toBe(USER_C);
    // Asserted POSITIVELY against the local event's own stamp, not merely as
    // "not the old one": a build that invented a third instant would satisfy a
    // negative and name a moment nothing recorded.
    expect(row?.assignedProvenance?.serverTime).toBe(SERVER_TIME);

    // AND THE CONTROL: the STATE claim still comes from the block, because
    // there is no local state event. Without this the case would also pass
    // against a build that abandoned the block entirely — which would reopen
    // the very refusal ruling P36 exists to close.
    expect(row?.stateProvenance.actorId).toBe(USER_A);
    expect(row?.stateProvenance.serverTime).toBe(OLD.serverTime);
  });
});

describe('12.187 the three doors an offline-born ticket reaches', () => {
  it('12.187 a ticket that exists only as a queued claim is in the summaries and in NEITHER settled listing', async () => {
    const { ds } = await fixture();
    const bornId = newUlid();
    const born = newSubmittedEvent({
      workspaceId: WS,
      entity: { kind: 'ticket', id: bornId },
      type: 'ticket.created',
      payload: { typeId: TYPE_TASK, projectId: PROJECT, parentId: null, title: 'Born on a plane' },
      actorId: USER_A,
      origin: 'desktop',
    });
    const thrown = await ds.ingest([born]).then(
      () => null,
      (err: unknown) => err as OfflineAcceptError,
    );
    expect(thrown?.queuedEventIds).toEqual([born.id]);

    // Door 1 — the summary door, which exists for exactly this ticket and
    // carries no provenance field.
    const summaries = await ds.query.listTicketSummaries(WS);
    const summary = summaries.find((s) => s.ticketId === bornId);
    expect(summary).toMatchObject({ title: 'Born on a plane', pending: true, pendingEventIds: [born.id] });

    // Doors 2 and 3 — the settled listings. ABSENT, and this assertion is the
    // whole reason the absence is not silent: `ListRow` and `BoardCard` both
    // require a `stateProvenance` whose `serverTime` no server has assigned,
    // and `outbox.ts`'s own invariant is that such a ticket is "never in any
    // settled listing". THE FIRST DRAFT PUT IT IN `getTickets` AND NOT ON THE
    // BOARD, and `getTickets` then THREW `ReplicaGapError` on the ordinary
    // offline path — the one-door class, with a third behaviour on the third
    // door. Nothing in this file reached it until this case did.
    const list = await ds.query.getTickets(PROJECT, {}, 'flat');
    expect(list.rows.map((row) => row.ticketId)).not.toContain(bornId);
    // It does not throw either, which is the half the first draft failed.
    expect(list.rows.length).toBeGreaterThan(0);

    const board = await ds.query.getBoard(PROJECT);
    const cards = board.groups.flatMap((group) => group.columns.flatMap((column) => column.cards));
    expect(cards.map((card) => card.ticketId)).not.toContain(bornId);

    // And the absence has a NAME and an owner, so a shell can render the
    // union rather than rediscovering the gap.
    //
    // The owner MOVED: ruling P34 reassigned this to Lane A's closure 2b after
    // establishing that Plan 10 Task 13 shipped no ticket list and so could
    // never have discharged it — the old owner named the next task touching
    // app-core UX by NUMBER rather than by content. P34 rewrote the docblock
    // and left THIS field saying `Plan 10 Task 13`, so the entry contradicted
    // itself: prose naming one owner, the enumerable datum naming another, and
    // this assertion pinning the stale half. An owner-less gap gets dropped
    // rather than deferred, and a gap owned by a task that cannot discharge it
    // is the same thing wearing a name.
    expect(OFFLINE_BORN_ABSENCE.owner).toMatch(/^Lane A, closure 2b \(ruling P34\) — /);
    // Non-vacuity in the same run: the field is a real sentence naming the
    // remedy, not just a prefix that satisfies the regex above.
    expect(OFFLINE_BORN_ABSENCE.owner).toContain('unions getTickets with listTicketSummaries');
  });

  /**
   * 12.240-12.242 — THE UNION THE ABSENCE ENTRY PRESCRIBED, built (ruling P34,
   * closure 2b). `OFFLINE_BORN_ABSENCE` has said all along what the remedy is:
   * "an offline shell that wants one project list containing both must union
   * `getTickets` with `listTicketSummaries` and render the second kind as
   * claims." This is that door.
   *
   * The two kinds stay DISTINGUISHABLE — `kind: 'settled'` carries a `ListRow`,
   * `kind: 'offline-born'` carries a `TicketSummary` — because an offline-born
   * ticket cannot be a `ListRow`: no server has assigned it a `serverTime`, and
   * flattening it into one would either invent one or ship a row missing a
   * required field.
   */
  it('12.240 one project list carries BOTH kinds, each tagged, and the settled row keeps its ListRow shape', async () => {
    const { ds } = await fixture();
    const bornId = newUlid();
    const born = newSubmittedEvent({
      workspaceId: WS,
      entity: { kind: 'ticket', id: bornId },
      type: 'ticket.created',
      payload: { typeId: TYPE_TASK, projectId: PROJECT, parentId: null, title: 'Born on a plane' },
      actorId: USER_A,
      origin: 'desktop',
    });
    await ds.ingest([born]).catch(() => undefined);

    const view = await ds.query.listProjectWithOfflineBorn(PROJECT, {}, 'flat');
    const born_ = view.entries.find(
      (e) => e.kind === 'offline-born' && e.summary.ticketId === bornId,
    );
    expect(born_, 'the offline-born ticket is IN this list').toBeDefined();

    // THE CONTROL IN THE SAME RUN, and it is what makes the line above a
    // measurement: the settled rows are still here too, still tagged
    // `settled`, and still carrying a real `stateProvenance`. A door that
    // answered ONLY the queued claims would satisfy the assertion above.
    const settled = view.entries.filter((e) => e.kind === 'settled');
    expect(settled.length).toBeGreaterThan(0);
    for (const entry of settled) {
      if (entry.kind !== 'settled') continue;
      expect(entry.row.stateProvenance.serverTime).toBeTruthy();
    }

    // And `getTickets` — the door this one exists beside — still omits it, so
    // this change added a door rather than quietly widening a settled listing.
    const list = await ds.query.getTickets(PROJECT, {}, 'flat');
    expect(list.rows.map((row) => row.ticketId)).not.toContain(bornId);
  });

  it('12.241 THE EXCLUSION — a ticket born in ANOTHER project is not in this project’s list', async () => {
    const { ds } = await fixture();
    const otherProject = newUlid();
    const hereId = newUlid();
    const thereId = newUlid();
    for (const [id, projectId, title] of [
      [hereId, PROJECT, 'Born here'],
      [thereId, otherProject, 'Born elsewhere'],
    ] as const) {
      await ds
        .ingest([
          newSubmittedEvent({
            workspaceId: WS,
            entity: { kind: 'ticket', id },
            type: 'ticket.created',
            payload: { typeId: TYPE_TASK, projectId, parentId: null, title },
            actorId: USER_A,
            origin: 'desktop',
          }),
        ])
        .catch(() => undefined);
    }

    const view = await ds.query.listProjectWithOfflineBorn(PROJECT, {}, 'flat');
    const ids = view.entries.map((e) => (e.kind === 'settled' ? e.row.ticketId : e.summary.ticketId));

    // Both directions in one run. `listTicketSummaries` is WORKSPACE-scoped, so
    // without the project filter the second ticket rides in — and asserting only
    // its absence would also pass against a door that returned nothing at all.
    expect(ids).toContain(hereId);
    expect(ids).not.toContain(thereId);
  });

  /**
   * 12.243 — THE CASE THE FIRST DRAFT COULD NOT HAVE FAILED, added after a
   * reviewer reproduced the defect it now pins.
   *
   * Every case above passes `{}`. `matchesFilter` guards every axis on
   * `!== undefined`, so an empty spec matches everything — and under it the
   * settled half and the born half cannot disagree about what belongs in the
   * list. The first draft read the born half out of `listTicketSummaries`,
   * which answers EVERY confirmed ticket, and deduped it against the FILTERED
   * settled rows; every confirmed ticket the filter excluded then came back
   * tagged `offline-born` with `pending: false`. Typing in a search box turned
   * settled tickets into claims.
   *
   * **An empty filter is not a neutral default. It is the one input under which
   * a filter bug cannot show.**
   */
  it('12.243 a NON-EMPTY filter narrows both halves, and no confirmed ticket comes back tagged offline-born', async () => {
    const { ds, replica } = await fixture();
    const bornEpicId = newUlid();
    const bornTaskId = newUlid();
    for (const [id, typeId, title] of [
      [bornEpicId, TYPE_EPIC, 'Born epic'],
      [bornTaskId, TYPE_TASK, 'Born task'],
    ] as const) {
      await ds
        .ingest([
          newSubmittedEvent({
            workspaceId: WS,
            entity: { kind: 'ticket', id },
            type: 'ticket.created',
            payload: { typeId, projectId: PROJECT, parentId: null, title },
            actorId: USER_A,
            origin: 'desktop',
          }),
        ])
        .catch(() => undefined);
    }

    const view = await ds.query.listProjectWithOfflineBorn(PROJECT, { typeIds: [TYPE_EPIC] }, 'flat');

    // (a) NO entry tagged offline-born is actually a confirmed ticket. This is
    // the assertion the defect failed: it re-tagged settled tickets.
    for (const entry of view.entries) {
      if (entry.kind !== 'offline-born') continue;
      const confirmed = await replica.getTicket(entry.summary.ticketId);
      expect(confirmed?.confirmed ?? null, `${entry.summary.ticketId} is confirmed`).toBeNull();
      // And an offline-born entry is ALWAYS badged — it exists only as a claim.
      expect(entry.summary.pending).toBe(true);
    }

    // (b) every entry satisfies the filter, on BOTH sides of the union.
    for (const entry of view.entries) {
      const typeId = entry.kind === 'settled' ? entry.row.typeId : entry.summary.ticketId;
      if (entry.kind === 'settled') expect(typeId).toBe(TYPE_EPIC);
      else expect(entry.summary.ticketId).toBe(bornEpicId);
    }

    // (c) ids are unique — the dedup is not doing the filter's job for it.
    const ids = view.entries.map((e) => (e.kind === 'settled' ? e.row.ticketId : e.summary.ticketId));
    expect(new Set(ids).size).toBe(ids.length);

    // THE CONTROL, in the same run: the born TASK is excluded by this filter and
    // present without it. Without this, "the born task is absent" would also
    // pass against a door that dropped the born half entirely.
    expect(ids).not.toContain(bornTaskId);
    const unfiltered = await ds.query.listProjectWithOfflineBorn(PROJECT, {}, 'flat');
    const allIds = unfiltered.entries.map((e) =>
      e.kind === 'settled' ? e.row.ticketId : e.summary.ticketId,
    );
    expect(allIds).toContain(bornTaskId);
    expect(allIds).toContain(bornEpicId);
  });

  it('12.242 a ticket that is confirmed while its claim is still queued is listed ONCE, not twice', async () => {
    const { ds } = await fixture();
    // A ticket the replica already holds as CONFIRMED, with a queued claim
    // against it: `getTickets` answers it and `listTicketSummaries` also
    // answers it with `pending: true`. Concatenating the two doors would show
    // one ticket as two rows — the dedup is what stops that, and it keys on
    // ticket id rather than on `pending`, because `pending` is true for both.
    const settledFirst = await ds.query.getTickets(PROJECT, {}, 'flat');
    const existing = settledFirst.rows[0];
    expect(existing, 'the fixture has at least one settled ticket').toBeDefined();
    await ds
      .ingest([
        newSubmittedEvent({
          workspaceId: WS,
          entity: { kind: 'ticket', id: existing!.ticketId },
          type: 'ticket.renamed',
          payload: { title: 'Renamed while offline' },
          actorId: USER_A,
          origin: 'desktop',
        }),
      ])
      .catch(() => undefined);

    const view = await ds.query.listProjectWithOfflineBorn(PROJECT, {}, 'flat');
    const ids = view.entries.map((e) => (e.kind === 'settled' ? e.row.ticketId : e.summary.ticketId));
    expect(ids.filter((id) => id === existing!.ticketId)).toHaveLength(1);
    // Non-vacuity: the summary door really does still name it, so the single
    // occurrence is the dedup working and not the summary having dropped it.
    const summaries = await ds.query.listTicketSummaries(WS);
    expect(summaries.map((s) => s.ticketId)).toContain(existing!.ticketId);
  });

  /**
   * THE FOURTH DOOR, and the one where INCLUSION is the correct answer.
   *
   * 12.187 pins three doors that agree by excluding. This one differs on
   * purpose, so a later reader does not "fix" it into agreement with them.
   *
   * The type argument that keeps a queued claim out of the settled listings is
   * that `ListRow` and `BoardCard` both require a `stateProvenance`, and
   * `ClaimProvenance` requires a `serverTime` no server has assigned. A search
   * hit is `{ticketId, title}`. It carries no provenance field, so the argument
   * does not reach here — and the method exists precisely so a device with no
   * network can still answer. A ticket created on a plane that cannot be found
   * by its own title is the failure `searchOfflineCopy` exists to prevent.
   *
   * `search` and `searchOfflineCopy` are therefore NOT a pair that should
   * agree: one is the wire shape this device cannot fill, the other is the
   * local answer. The distinction is the point of the second method.
   */
  it('12.188 the offline-born ticket the settled listings omit IS findable by its own title', async () => {
    const { ds } = await fixture();
    const bornId = newUlid();
    const born = newSubmittedEvent({
      workspaceId: WS,
      entity: { kind: 'ticket', id: bornId },
      type: 'ticket.created',
      payload: { typeId: TYPE_TASK, projectId: PROJECT, parentId: null, title: 'Written above the Atlantic' },
      actorId: USER_A,
      origin: 'desktop',
    });
    await ds.ingest([born]).catch(() => undefined);

    const found = await ds.query.searchOfflineCopy(WS, 'Atlantic');
    expect(found.offlineCopy).toBe(true);
    expect(found.hits.map((hit) => hit.ticketId)).toContain(bornId);

    // The same ticket, through the settled door 12.187 pins: still absent.
    // Asserted HERE as well as there, because the two facts are only
    // interesting together — either one alone reads as an ordinary filter.
    const list = await ds.query.getTickets(PROJECT, {}, 'flat');
    expect(list.rows.map((row) => row.ticketId)).not.toContain(bornId);

    // NON-VACUITY: the search door is answering, not empty. Without this a
    // `searchOfflineCopy` that returned every ticket unfiltered would also
    // satisfy the assertion above, and so would one that returned nothing if
    // `toContain` were ever loosened.
    const miss = await ds.query.searchOfflineCopy(WS, 'Pacific');
    expect(miss.hits.map((hit) => hit.ticketId)).not.toContain(bornId);
  });
});

/**
 * 13.584 — `ticket.closed`/`ticket.reopened` fold through the SAME shared
 * reducer (`applyTicketEvent`) every other ticket event does, and `start:
 * 'backlog'` folds to the universal state: neither is a new fold this file
 * has to teach the replica, because both landed on `TICKET_EVENT_TYPES` and
 * `applyTicketEvent`'s own switch before this task (Task 1) — confirmed
 * here rather than re-derived, over the settled `getTicket` read.
 *
 * **What this task does NOT add, and why**: a `getBoard`/`getTickets`
 * exclusion for backlog/closed tickets, mirroring the server's `readBoard`
 * WHERE clause (13.574). `getBoard`'s own filter DOES gain the two conjuncts
 * (below, over the straggler path a backlog ticket would otherwise fall into)
 * — but `getTickets` deliberately does NOT exclude either: 13.575 already
 * settled that the LIST carries a backlog and a closed ticket alongside every
 * other row, narrowable by the new `closed` filter term rather than dropped
 * outright, and `stateName` for a backlog row already reads `statesWithBacklog`
 * (`stateNameFrom`, fixed alongside `rowOf`'s new `closed` field in this same
 * change). So the replica's `getTickets` matches the server's LIST behaviour;
 * its `getBoard` now matches the server's BOARD behaviour.
 */
describe('13.584 ticket.closed / ticket.reopened fold through the shared reducer; a backlog-born ticket is served, not invented', () => {
  it("a ticket created with start:'backlog' is served at stateId 'backlog' by getTicket AND by getTickets, closed: null", async () => {
    const { ds, replica } = await fixture();
    const bornId = newUlid();
    await replica.applyServerItem(
      envelope({ kind: 'ticket', id: bornId }, 'ticket.created', {
        typeId: TYPE_TASK,
        projectId: PROJECT,
        parentId: null,
        title: 'Born in the backlog',
        start: 'backlog',
      }),
    );

    const read = await ds.query.getTicket(WS, bornId);
    expect(read?.ticket.stateId).toBe('backlog');
    expect(read?.ticket.closed ?? null).toBeNull();

    const row = (await ds.query.getTickets(PROJECT, {}, 'flat')).rows.find((r) => r.ticketId === bornId);
    expect(row?.stateId).toBe('backlog');
    // `stateNameFrom` reads `statesWithBacklog(def)` — `wfV1.states` alone
    // does not declare 'backlog', and would otherwise fall back to the bare id.
    expect(row?.stateName).toBe('Backlog');
    expect(row?.closed).toBeNull();
  });

  function cardIdsOn(board: Awaited<ReturnType<ReplicaDataSource['query']['getBoard']>>): string[] {
    return board.groups.flatMap((group) => group.columns.flatMap((column) => column.cards.map((c) => c.ticketId)));
  }

  it('after ticket.closed, getTicket AND getTickets both report closed — and getBoard drops the card', async () => {
    const { ds, replica } = await fixture();
    const bornId = newUlid();
    await replica.applyServerItem(
      envelope({ kind: 'ticket', id: bornId }, 'ticket.created', {
        typeId: TYPE_TASK,
        projectId: PROJECT,
        parentId: null,
        title: 'Filed, then closed',
      }),
    );

    // POSITIVE CONTROL, before the fold: the ticket IS on the board while it
    // is open, so the exclusion asserted below is a genuine drop and not an
    // empty board that would have said "not there" regardless.
    expect(cardIdsOn(await ds.query.getBoard(PROJECT))).toContain(bornId);

    // `applyServerItem` replays a fact the server already accepted (this
    // file's own idiom throughout) — it does not re-derive legality, so it is
    // not asserting that closing from `todo` would pass the real engine's
    // `close-requires-terminal` gate, only that the FOLD sets the flag.
    await replica.applyServerItem(
      envelope({ kind: 'ticket', id: bornId }, 'ticket.closed', {}, { actorId: USER_B }),
    );

    const read = await ds.query.getTicket(WS, bornId);
    expect(read?.ticket.closed).toEqual({ actorId: USER_B, at: SERVER_TIME });

    const row = (await ds.query.getTickets(PROJECT, {}, 'flat')).rows.find((r) => r.ticketId === bornId);
    expect(row?.closed).toEqual({ actorId: USER_B, at: SERVER_TIME });

    // The `closed` FILTER TERM pinned at this seam, not merely the field:
    // `getTickets` runs every row through `matchesFilter`, so `{ closed: true }`
    // must actually narrow to this ticket and `{ closed: false }` must drop it —
    // the mechanism 13.575's server-side parity relies on this replica having too.
    expect(
      (await ds.query.getTickets(PROJECT, { closed: true }, 'flat')).rows.map((r) => r.ticketId),
    ).toContain(bornId);
    expect(
      (await ds.query.getTickets(PROJECT, { closed: false }, 'flat')).rows.map((r) => r.ticketId),
    ).not.toContain(bornId);

    // getBoard EXCLUDES it — the replica's own mirror of 13.574's two bound
    // conjuncts (`state.stateId !== BACKLOG_STATE_ID`, `(closed ?? null) ===
    // null`), unlike getTickets above, which carries it.
    expect(cardIdsOn(await ds.query.getBoard(PROJECT))).not.toContain(bornId);
  });

  it('getBoard also excludes a confirmed backlog ticket, straggler path included — a backlog ticket never becomes a board column', async () => {
    const { ds, replica } = await fixture();
    const bornId = newUlid();
    await replica.applyServerItem(
      envelope({ kind: 'ticket', id: bornId }, 'ticket.created', {
        typeId: TYPE_TASK,
        projectId: PROJECT,
        parentId: null,
        title: 'Parked before triage',
        start: 'backlog',
      }),
    );
    const board = await ds.query.getBoard(PROJECT);
    const cardIds = board.groups.flatMap((group) => group.columns.flatMap((column) => column.cards.map((c) => c.ticketId)));
    expect(cardIds).not.toContain(bornId);
    // NON-VACUOUS: no group anywhere is named for the reserved id — the
    // straggler path a bare `def.states.find` miss would otherwise take.
    expect(board.groups.flatMap((group) => group.columns.map((c) => c.stateId))).not.toContain('backlog');
  });
});

/**
 * 13.704 — the REPLICA's half of the rank wire. `ticket.ranked` folds through
 * the same shared reducer every other ticket event does (13.696 pins the fold
 * itself), so nothing here re-derives the key: what this case measures is that
 * `getTickets` — the replica's list door, the one the Backlog tab reads — puts
 * the folded value on the row, and puts `null` there for a ticket nobody has
 * ranked rather than omitting the field. `ListRow.rank` is REQUIRED (spec §8.1)
 * and `compareByRank` reads the two apart, so an omitted key and a `null` are
 * not interchangeable at this seam even though they are at the `TicketState`
 * one.
 */
describe('13.704 the replica list row carries the folded rank', () => {
  it('an unranked row reads null; after ticket.ranked the SAME row reads the key', async () => {
    const { ds, replica } = await fixture();
    const bornId = newUlid();
    await replica.applyServerItem(
      envelope({ kind: 'ticket', id: bornId }, 'ticket.created', {
        typeId: TYPE_TASK,
        projectId: PROJECT,
        parentId: null,
        title: 'Order me',
        start: 'backlog',
      }),
    );

    const rowOf = async () => {
      const rows = (await ds.query.getTickets(PROJECT, {}, 'flat')).rows;
      return rows.find((r) => r.ticketId === bornId);
    };
    // Positive control: the row exists and is reachable, so the assertions
    // below are about the field and not about a row that was never served.
    expect(await rowOf()).toBeDefined();
    expect((await rowOf())?.rank).toBeNull();

    await replica.applyServerItem(
      envelope({ kind: 'ticket', id: bornId }, 'ticket.ranked', { rank: 'i' }),
    );

    // `toBe('i')` and not `toBeTruthy`: the key is read off the FOLDED state,
    // so a row builder that hardcoded `null` — or read `rank` off the wrong
    // source — fails here rather than passing on "some string was present".
    expect((await rowOf())?.rank).toBe('i');
  });
});

describe('3.970 the replica carries the birth priority claim, on the row and on the card', () => {
  it('a ticket created through the replica reads P2, attributed to its creator with both clocks', async () => {
    const { ds, replica } = await fixture();
    const bornId = newUlid();
    await replica.applyServerItem(
      envelope({ kind: 'ticket', id: bornId }, 'ticket.created', {
        typeId: TYPE_TASK,
        projectId: PROJECT,
        parentId: null,
        title: 'Order me',
      }),
    );

    const row = (await ds.query.getTickets(PROJECT, {}, 'flat')).rows.find(
      (candidate) => candidate.ticketId === bornId,
    );
    // Positive control: the row is reachable, so what follows is about the
    // field and not about a row that was never served.
    expect(row).toBeDefined();
    // `actorName: null` is exact, not a stand-in: this source is handed the local
    // ledger and no roster, which is the same lossless absence `dueDateOf` and
    // every other claim here carry (provenance.ts renders the raw id for it).
    expect(row?.priority).toEqual({
      value: 'P2',
      claim: {
        actorId: USER_A,
        actorName: null,
        clientTime: CLIENT_TIME,
        serverTime: SERVER_TIME,
      },
    });

    // The CARD, off the same state — the claim is read by one reader at both
    // sites, so a card and a row for one ticket cannot disagree about it.
    const card = (await ds.query.getBoard(PROJECT)).groups
      .flatMap((group) => group.columns)
      .flatMap((column) => column.cards)
      .find((candidate) => candidate.ticketId === bornId);
    expect(card).toBeDefined();
    expect(card?.priority).toEqual(row?.priority);
  });

  it('3.971 a state whose reducer predates the field makes the read THROW, never default to P2', async () => {
    const { ds, replica, storage } = await fixture();
    const bornId = newUlid();
    await replica.applyServerItem(
      envelope({ kind: 'ticket', id: bornId }, 'ticket.created', {
        typeId: TYPE_TASK,
        projectId: PROJECT,
        parentId: null,
        title: 'Order me',
      }),
    );

    // POSITIVE CONTROL FIRST, and deliberately above the mutation: a control
    // placed after the subject is masked by it, and a control in a sibling
    // `it` is not a control at all. Asserted on THIS row and not on the page
    // length — the fixture seeds two tickets of its own, so a length here would
    // be a fact about the fixture rather than about the read.
    const before = (await ds.query.getTickets(PROJECT, {}, 'flat')).rows;
    expect(before.some((candidate) => candidate.ticketId === bornId)).toBe(true);

    // The stale state is MANUFACTURED, the way the server-side case manufactures
    // one: the reducer that predates the field no longer exists to write a row
    // for this test, so the claim is stripped out of the stored state instead.
    // Asserted, not assumed — a strip that silently did nothing would leave the
    // positive control green and prove nothing.
    const stored = await storage.all('SELECT state FROM tickets WHERE ticket_id = ?', [bornId]);
    const state = JSON.parse(stored[0]?.['state'] as string) as { fields: Record<string, unknown> };
    expect(state.fields['priority']).toBeDefined();
    delete state.fields['priority'];
    await storage.run('UPDATE tickets SET state = ? WHERE ticket_id = ?', [
      JSON.stringify(state),
      bornId,
    ]);
    expect(
      JSON.parse(
        (await storage.all('SELECT state FROM tickets WHERE ticket_id = ?', [bornId]))[0]?.[
          'state'
        ] as string,
      ).fields['priority'],
    ).toBeUndefined();

    // THROWN, not defaulted: filling in P2 here would print a value with no
    // claim line beside it, and would put the ladder in a second place.
    await expect(ds.query.getTickets(PROJECT, {}, 'flat')).rejects.toThrow(/no priority claim/);
  });
});

/**
 * The attachments read at the replica (2026-09-20).
 *
 * ## Why this is a case of its own rather than one more name in 12.185
 *
 * 12.185 proves the SHAPE of every refusal is right — a `ReplicaGapError` whose
 * absences carry exactly `{field, because, owner}` and an owner under `Plan 10`.
 * It says nothing about whether any particular refusal was JUSTIFIED, and this
 * one is the only refusal in the file with a tempting alternative: the local
 * ledger really does carry `attachment.added`, so the list looks derivable on
 * the spot. The case below is that temptation, measured: the event is applied
 * to a real replica, the history door serves it, and the attachments door
 * refuses anyway — with an absence that names the table it cannot read and the
 * plan that owns closing it.
 */
describe('16.56 the attachments read refuses although the local ledger holds the event', () => {
  it('16.56 refuses with a named absence while getTicketHistory serves the same fact', async () => {
    const { ds, replica, taskId } = await fixture();
    await replica.applyServerItem(
      envelope({ kind: 'ticket', id: taskId }, 'attachment.added', {
        kind: 'upload',
        attachmentId: newUlid(),
        filename: 'gst-receipt.pdf',
        mime: 'application/pdf',
        size: 48211,
        sha256: 'a'.repeat(64),
      }),
    );

    // THE POSITIVE CONTROL, and it is the whole point of the case: the local
    // ledger really does hold the fact, and a door on the same source serves it.
    // Without this line, the refusal below would be evidence of nothing — an
    // empty replica refuses an empty list for the wrong reason.
    const history = await ds.query.getTicketHistory(taskId);
    expect(history.map((event) => event.type)).toContain('attachment.added');

    const err = await ds.query.getTicketAttachments(WS, taskId).then(
      () => null,
      (cause: unknown) => cause,
    );
    expect(err).toBeInstanceOf(ReplicaGapError);
    const absence = (err as ReplicaGapError).absences[0];
    // The absence names WHAT cannot be filled, WHY the ledger cannot stand in
    // for it, and WHO closes it — an absence with no owner is a gap that gets
    // dropped rather than deferred.
    expect(absence?.field).toContain('AttachmentListEntry');
    expect(absence?.because).toContain('attachments table');
    expect(absence?.owner).toMatch(/^Plan 10 — /);
  });
});

/**
 * Owner request, 2026-09-23 (board-card badges) — the offline board's own
 * `parent`/`epic`, via `boardHierarchyOf` (`replica-data-source.ts`).
 *
 * `fixture()` already gives every case `epicId` (`TYPE_EPIC`, root, titled
 * "Registrations") and `taskId` (its DIRECT child) for free — the exact
 * shape `apps/server/test/read/ancestry.test.ts` builds from `world.epicId`/
 * `world.taskInEpicId`, so this suite is that one's offline mirror.
 *
 * Case ids from the task's own block, §13 (13.1451-13.1470).
 */
describe('13.1465 boardHierarchyOf — the offline board draws parent/epic, deleted-safe', () => {
  it("13.1465 a direct child of the epic: parent and epic are the SAME ticket — key null on both, honestly (the replica cannot compose one)", async () => {
    const { ds, epicId, taskId } = await fixture();
    const board = await ds.query.getBoard(PROJECT);
    const card = board.groups
      .flatMap((group) => group.columns)
      .flatMap((column) => column.cards)
      .find((candidate) => candidate.ticketId === taskId);
    expect(card?.parent).toEqual({ ticketId: epicId, key: null });
    expect(card?.epic).toEqual({ ticketId: epicId, key: null, title: 'Registrations' });
  });

  it('13.1465 a grandchild of the epic: parent and epic DIFFER — the epic title still resolves offline, from the local ledger', async () => {
    const { ds, replica, epicId, taskId } = await fixture();
    const grandchildId = newUlid();
    await replica.applyServerItem(
      envelope({ kind: 'ticket', id: grandchildId }, 'ticket.created', {
        typeId: TYPE_TASK,
        projectId: PROJECT,
        parentId: taskId,
        title: 'Chase the stamp duty office',
      }),
    );
    const board = await ds.query.getBoard(PROJECT);
    const card = board.groups
      .flatMap((group) => group.columns)
      .flatMap((column) => column.cards)
      .find((candidate) => candidate.ticketId === grandchildId);
    expect(card?.parent).toEqual({ ticketId: taskId, key: null });
    expect(card?.epic).toEqual({ ticketId: epicId, key: null, title: 'Registrations' });
  });

  it('13.1465 a root ticket (no parent) gets null for both', async () => {
    const { ds, replica } = await fixture();
    const rootId = newUlid();
    await replica.applyServerItem(
      envelope({ kind: 'ticket', id: rootId }, 'ticket.created', {
        typeId: TYPE_TASK,
        projectId: PROJECT,
        parentId: null,
        title: 'A root errand',
      }),
    );
    const board = await ds.query.getBoard(PROJECT);
    const card = board.groups
      .flatMap((group) => group.columns)
      .flatMap((column) => column.cards)
      .find((candidate) => candidate.ticketId === rootId);
    expect(card?.parent).toBeNull();
    expect(card?.epic).toBeNull();
  });

  /**
   * 13.1466 — DELETED-SAFE, unlike `epicAncestorOf`/`confirmedById`'s own
   * `byId`, which deliberately keep a deleted ticket reachable for the LIST's
   * own reasons (`boardHierarchyOf`'s own docblock). A live device must not
   * name a deleted parent, or walk THROUGH a deleted hop to an epic beyond
   * it — mirrors `apps/server/test/read/ancestry.test.ts`'s 13.1462/13.1463,
   * which pin the server's identical rule over `LIVE_TICKET_WHERE`.
   */
  it('13.1466 a soft-deleted immediate parent is not named, even though the replica still holds the ticket', async () => {
    const { ds, replica } = await fixture();
    const parentId = newUlid();
    const childId = newUlid();
    await replica.applyServerItem(
      envelope({ kind: 'ticket', id: parentId }, 'ticket.created', {
        typeId: TYPE_TASK,
        projectId: PROJECT,
        parentId: null,
        title: 'Renamed the till float',
      }),
    );
    await replica.applyServerItem(
      envelope({ kind: 'ticket', id: childId }, 'ticket.created', {
        typeId: TYPE_TASK,
        projectId: PROJECT,
        parentId,
        title: 'Balance the till',
      }),
    );
    await replica.applyServerItem(envelope({ kind: 'ticket', id: parentId }, 'ticket.deleted', {}));

    const board = await ds.query.getBoard(PROJECT);
    const card = board.groups
      .flatMap((group) => group.columns)
      .flatMap((column) => column.cards)
      .find((candidate) => candidate.ticketId === childId);
    expect(card?.parent).toBeNull();
  });

  it('13.1466 an epic reached only by walking through a soft-deleted hop is not named', async () => {
    const { ds, replica, epicId, taskId } = await fixture();
    const grandchildId = newUlid();
    await replica.applyServerItem(
      envelope({ kind: 'ticket', id: grandchildId }, 'ticket.created', {
        typeId: TYPE_TASK,
        projectId: PROJECT,
        parentId: taskId,
        title: 'Chase the stamp duty office',
      }),
    );
    // `taskId` is the hop between the grandchild and `epicId` — deleting it
    // must stop the epic walk, exactly as it stops the parent badge.
    await replica.applyServerItem(envelope({ kind: 'ticket', id: taskId }, 'ticket.deleted', {}));

    const board = await ds.query.getBoard(PROJECT);
    const card = board.groups
      .flatMap((group) => group.columns)
      .flatMap((column) => column.cards)
      .find((candidate) => candidate.ticketId === grandchildId);
    expect(card?.parent).toBeNull();
    expect(card?.epic).toBeNull();
    // Positive control: `epicId` itself is untouched, so a walk that ignored
    // the deleted hop and jumped straight to it would still (wrongly) find it.
    expect(epicId).not.toBe(taskId);
  });
});
