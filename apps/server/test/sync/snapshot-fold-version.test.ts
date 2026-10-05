import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PoolClient } from 'pg';
import {
  applyTicketEvent,
  newUlid,
  TICKET_EVENT_TYPES,
  TICKET_FOLD_VERSION,
  type LedgerEvent,
  type TicketState,
  type TicketStateDeps,
} from '@gisik-nokma/domain';
import { insertEvent, readEntityEvents } from '../../src/ledger/event-store.js';
import { readLatestSnapshot, writeSnapshot } from '../../src/ledger/snapshot-store.js';
import { buildLedgerDeps } from '../../src/sync/ledger-deps.js';
import { bootRestate, foldTicketHead, runSnapshotPass, startSnapshotWriter } from '../../src/sync/snapshot-writer.js';
import { makeCommitted } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';

/**
 * Case 29.355 (wtg2 T9): a snapshot written before work periods existed (`fold_version` 1) is RESTATED by the snapshot
 * pass from the ticket's full history, folding each event with the definitions in force at it (`depsAsOfEvent`,
 * planner rulings 2026-10-04 Q9 and 2026-10-05 10:38), and a current-version snapshot is still resumed.
 *
 * The harness is `snapshot-writer.test.ts`'s and seeds the LEDGER ONLY (`insertEvent`, never a projection), for that
 * file's reason: the snapshot is the domain reducer's fold with ledger deps, so a loader that read `proj_workflows` /
 * `proj_ticket_types` would find them empty and throw here instead of agreeing by accident. It also means no publish
 * door runs, so a planted stale row stays stale until the pass under test meets it.
 *
 * "Resumed versus refolded" is unobservable in the state alone, so the recording proxy reads the tail read's `afterSeq`
 * bind (`tailReadsFor`), as 12.87 does; the definition loads are counted the same way (`definitionScans`).
 */

let db: TestDatabase;
const WS = newUlid();
const ACTOR = newUlid();
const PROJECT = newUlid();
// SORTED: the pass folds due tickets in id order, and a plain `newUlid()` is not monotonic within a millisecond. TICKET
// (whose fold reaches past the state-dropping publish) must be restated BEFORE TICKET_3 (whose early events precede
// it), so the pass's memo is asked about an event below its horizon: a key that ignored the event's own position would
// hand TICKET_3 the later epoch.
const SORTED = [newUlid(), newUlid(), newUlid()].sort();
const TICKET = SORTED[0]!;
const TICKET_2 = SORTED[1]!;
const TICKET_3 = SORTED[2]!;
const TICKET_4 = newUlid();
const TICKET_5 = newUlid();

const S0 = '2026-09-01T10:00:00.000Z';
const S1 = '2026-09-02T10:00:00.000Z';
const S2 = '2026-09-03T10:00:00.000Z';
const S3 = '2026-09-04T10:00:00.000Z';

const open = (id: string, name: string) => ({ id, name, category: 'open' });
const active = (id: string, name: string) => ({ id, name, category: 'active' });
const terminal = (id: string, name: string) => ({ id, name, category: 'terminal' });
const toAll = (ids: string[]) => ids.map((to) => ({ from: '*', to, rules: [] }));

/** `snapshot-writer.test.ts`'s `wfBasic`. */
const wfBasic = {
  id: 'wf-snap', version: 1, name: 'Basic', initialStateId: 'todo',
  states: [open('todo', 'To do'), active('doing', 'Doing'), terminal('done', 'Done')],
  transitions: toAll(['todo', 'doing', 'done']),
};
/** `snapshot-refresh.test.ts`'s state-dropping world (12.189), with the dropped state ACTIVE: v2 drops `review`. */
const wfDropV1 = {
  id: 'wf-drop', version: 1, name: 'Drop', initialStateId: 'todo',
  states: [open('todo', 'To do'), active('review', 'Review'), active('doing', 'Doing'), terminal('done', 'Done')],
  transitions: toAll(['todo', 'review', 'doing', 'done']),
};
const wfDropV2 = {
  id: 'wf-drop', version: 2, name: 'Drop', initialStateId: 'todo',
  states: [open('todo', 'To do'), active('doing', 'Doing'), terminal('done', 'Done')],
  transitions: toAll(['todo', 'doing', 'done']),
  stateMapping: { review: 'todo' },
};
/** v2 RE-CATEGORISES `doing` to open: a move into it opened a period under v1 and opens none under v2. */
const wfRecatV1 = {
  id: 'wf-recat', version: 1, name: 'Recat', initialStateId: 'todo',
  states: [open('todo', 'To do'), active('doing', 'Doing'), terminal('done', 'Done')],
  transitions: toAll(['todo', 'doing', 'done']),
};
const wfRecatV2 = { ...wfRecatV1, version: 2, states: [open('todo', 'To do'), open('doing', 'Doing'), terminal('done', 'Done')] };

const definition = (kind: 'workflow' | 'ticket-type', type: string, payload: unknown): LedgerEvent =>
  makeCommitted({ workspaceId: WS, entity: { kind, id: newUlid() }, type, payload, actorId: ACTOR });
const workflowDefined = (payload: unknown) => definition('workflow', 'workflow.defined', payload);
const typeDefined = (id: string, workflowId: string) =>
  definition('ticket-type', 'ticket-type.defined', { id, name: id, icon: 'check', rank: 3, workflowId, fields: [] });

function ticketEvent(ticketId: string, type: string, payload: unknown, serverTime?: string): LedgerEvent {
  return makeCommitted({
    workspaceId: WS,
    entity: { kind: 'ticket', id: ticketId },
    type,
    payload,
    actorId: ACTOR,
    ...(serverTime === undefined ? {} : { serverTime }),
  });
}
const created = (ticketId: string, typeId: string, serverTime: string) =>
  ticketEvent(ticketId, 'ticket.created', { typeId, projectId: PROJECT, parentId: null, title: 'Restate me' }, serverTime);
const to = (ticketId: string, state: string, serverTime: string) => ticketEvent(ticketId, 'ticket.transitioned', { to: state }, serverTime);
const note = (ticketId: string, i: number) => ticketEvent(ticketId, 'ticket.field_set', { fieldId: 'notes', value: `note ${i}` });

async function seed(events: readonly LedgerEvent[]): Promise<void> {
  const client = await db.pool.connect();
  try {
    for (const event of events) await insertEvent(client, event);
  } finally {
    client.release();
  }
}

/** The reducer's fold of a ticket's stream up to `uptoSeq`, with the given definitions. */
async function foldPrefix(ticketId: string, uptoSeq: number, deps: TicketStateDeps): Promise<TicketState> {
  let state: TicketState | undefined;
  for (const env of await readEntityEvents(db.pool, 'ticket', ticketId)) {
    if (env.seq <= uptoSeq && (TICKET_EVENT_TYPES as readonly string[]).includes(env.type)) state = applyTicketEvent(state, env, deps);
  }
  if (state === undefined) throw new Error('no events folded');
  return state;
}

/** Writes a snapshot through the real door (it stamps the current fold version), then, when `stale`, makes it a pre-periods row. */
async function plant(ticketId: string, seq: number, state: TicketState, stale: boolean): Promise<void> {
  const client = await db.pool.connect();
  try {
    await writeSnapshot(client, { entityKind: 'ticket', entityId: ticketId, seq, state: JSON.parse(JSON.stringify(state)) as Record<string, unknown>, provenance: null });
  } finally {
    client.release();
  }
  if (stale) {
    await db.pool.query(
      `UPDATE snapshots SET state = state - 'periods', fold_version = 1 WHERE entity_kind = 'ticket' AND entity_id = $1 AND seq = $2`,
      [ticketId, seq],
    );
  }
}

type QueryCall = { text: string; values: unknown[] };

/** `snapshot-writer.test.ts`'s recording proxy: the SQL and binds through a pool or client, and through its `connect()`. */
function recording<T extends object>(target: T, calls: QueryCall[]): T {
  return new Proxy(target, {
    get(obj, prop) {
      const value = Reflect.get(obj, prop) as unknown;
      if (prop === 'query' && typeof value === 'function') {
        return (...args: unknown[]): unknown => {
          if (typeof args[0] === 'string') calls.push({ text: args[0], values: Array.isArray(args[1]) ? args[1] : [] });
          return (value as (...a: unknown[]) => unknown).apply(obj, args);
        };
      }
      if (prop === 'connect' && typeof value === 'function') {
        return async (...args: unknown[]): Promise<PoolClient> => {
          const client = await (value as (...a: unknown[]) => Promise<PoolClient>).apply(obj, args);
          return recording(client, calls);
        };
      }
      return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(obj) : value;
    },
  }) as T;
}

/** Every `readEntityEvents` tail read aimed at `ticketId`, in call order, as its `afterSeq`. */
function tailReadsFor(calls: readonly QueryCall[], ticketId: string): number[] {
  return calls.filter((call) => call.text.includes('seq > $3') && call.values[1] === ticketId).map((call) => Number(call.values[2]));
}
/** The BOUNDED definition loads (`buildLedgerDeps` with `belowWorkspaceSeq`): one per as-of resolution that missed the memo. */
function definitionScans(calls: readonly QueryCall[]): number {
  return calls.filter((call) => call.text.includes('SELECT type, payload FROM events') && call.text.includes('workspace_seq < $2')).length;
}

beforeAll(async () => {
  db = await createTestDatabase();
  await seed([
    workflowDefined(wfBasic), typeDefined('snap-task', 'wf-snap'),
    workflowDefined(wfDropV1), typeDefined('drop-task', 'wf-drop'),
    workflowDefined(wfRecatV1), typeDefined('recat-task', 'wf-recat'),
  ]);
}, 60_000);

afterAll(async () => {
  await db.drop();
});

describe('29.355 snapshot fold versions', () => {
  it('29.355 a stale snapshot is restated from the full history and carries its periods; a current-version one is resumed', async () => {
    // Built in stream order: `makeCommitted` stamps the workspace position when it is CALLED.
    const before = [
      created(TICKET, 'snap-task', S1), to(TICKET, 'doing', S2),
      created(TICKET_2, 'snap-task', S1), to(TICKET_2, 'doing', S2),
      created(TICKET_3, 'drop-task', S0), to(TICKET_3, 'review', S1), to(TICKET_3, 'doing', S2),
    ];
    const dropV2 = workflowDefined(wfDropV2); // the state-dropping publish, between TICKET_3's move out of review and its finish
    await seed([...before, dropV2, to(TICKET, 'done', S3), to(TICKET_2, 'done', S3), to(TICKET_3, 'done', S3)]);
    const newest = await buildLedgerDeps(db.pool, WS);
    const beforeDrop = await buildLedgerDeps(db.pool, WS, { belowWorkspaceSeq: dropV2.workspaceSeq });
    // Planted after ALL seeding: TICKET and TICKET_3 hold pre-periods rows at their Doing seq; TICKET_2 a CURRENT one
    // whose periods carry a marker start 'M' that only a resume can keep.
    await plant(TICKET, 2, await foldPrefix(TICKET, 2, newest), true);
    await plant(TICKET_3, 3, await foldPrefix(TICKET_3, 3, beforeDrop), true);
    await plant(TICKET_2, 2, { ...(await foldPrefix(TICKET_2, 2, newest)), periods: [{ start: 'M', end: null, pass: 1 }] }, false);
    const stale = await readLatestSnapshot(db.pool, 'ticket', TICKET);
    expect([stale?.foldVersion, 'periods' in (stale?.state ?? {})]).toEqual([1, false]); // precondition: a pre-periods row

    const calls: QueryCall[] = [];
    // The heads are one event past their snapshots, below `minEvents`: only staleness makes a ticket due.
    expect([TICKET < TICKET_2, TICKET_2 < TICKET_3]).toEqual([true, true]); // precondition: the pass's order
    const { written } = await runSnapshotPass(recording(db.pool, calls), { minEvents: 20 });
    const byId = (a: { entityId: string }, b: { entityId: string }): number => (a.entityId < b.entityId ? -1 : 1);
    expect([...written].sort(byId)).toEqual([{ entityId: TICKET, seq: 3 }, { entityId: TICKET_3, seq: 4 }].sort(byId));
    expect(tailReadsFor(calls, TICKET)).toEqual([0]); // a full fold, not a resume
    // One shared memo for the pass: the two tickets' events fall into two definition epochs (before and after the
    // publish), so two loads, not one per ticket per epoch.
    expect(definitionScans(calls)).toBe(2);
    const restated = await readLatestSnapshot(db.pool, 'ticket', TICKET);
    expect([restated?.seq, restated?.foldVersion]).toEqual([3, 2]);
    // S2 sits BELOW the stale row's seq, so only a full fold recovers the period's start.
    expect(restated?.state['periods']).toEqual([{ start: S2, end: S3, pass: 1 }]);
    // The provenance block is recomputed from the whole history, not carried from the stale row's null.
    expect(restated?.provenance?.state.serverTime).toBe(S3);
    // TICKET_3 lived through the state-dropping publish: restated with the definitions in force at each event.
    expect((await readLatestSnapshot(db.pool, 'ticket', TICKET_3))?.state['periods']).toEqual([{ start: S1, end: S3, pass: 1 }]);
    // Control: its history does not fold under the newest definitions, so the leg above is not one they could pass.
    await expect(foldPrefix(TICKET_3, Infinity, newest)).rejects.toThrow(/has no state "review"/);

    // A second pass: the restated tickets are not due again (their LATEST row is current; the stale rows remain).
    const calls2: QueryCall[] = [];
    const second = await runSnapshotPass(recording(db.pool, calls2), { minEvents: 20 });
    expect([second.written, tailReadsFor(calls2, TICKET), tailReadsFor(calls2, TICKET_3)]).toEqual([[], [], []]);

    // Control: TICKET_2's current-version snapshot is resumed, from its seq, keeping the marker it could not refold.
    expect(written.map((w) => w.entityId)).not.toContain(TICKET_2);
    const calls3: QueryCall[] = [];
    const client = await db.pool.connect();
    try {
      const head = await foldTicketHead(recording(client, calls3), TICKET_2, newest);
      expect([head?.state.periods, head?.restated]).toEqual([[{ start: 'M', end: S3, pass: 1 }], false]);
    } finally {
      client.release();
    }
    expect(tailReadsFor(calls3, TICKET_2)).toEqual([2]);
  });

  it('29.355 the restate loads definitions once per definition change, and an event before a change folds with the old one', async () => {
    // Twenty events: created, Doing and 8 notes; the publish that re-categorises Doing; 9 notes and Done.
    const before = [created(TICKET_4, 'recat-task', S1), to(TICKET_4, 'doing', S2), ...Array.from({ length: 8 }, (_, i) => note(TICKET_4, i))];
    const recatV2 = workflowDefined(wfRecatV2);
    await seed([...before, recatV2, ...Array.from({ length: 9 }, (_, i) => note(TICKET_4, 8 + i)), to(TICKET_4, 'done', S3)]);
    expect((await readEntityEvents(db.pool, 'ticket', TICKET_4)).length).toBe(20); // precondition: the tail's size
    await plant(TICKET_4, 1, await foldPrefix(TICKET_4, 1, await buildLedgerDeps(db.pool, WS, { belowWorkspaceSeq: recatV2.workspaceSeq })), true);

    const calls: QueryCall[] = [];
    const client = await db.pool.connect();
    try {
      const head = await foldTicketHead(recording(client, calls), TICKET_4, await buildLedgerDeps(db.pool, WS));
      // Doing was ACTIVE when the ticket moved into it (v1): the period opens at S2. Under v2 the move opens nothing
      // and Done records a zero-length period at S3, which is what folding with the newest definitions gives.
      expect([head?.restated, head?.state.periods]).toEqual([true, [{ start: S2, end: S3, pass: 1 }]]);
    } finally {
      client.release();
    }
    expect(tailReadsFor(calls, TICKET_4)).toEqual([0]);
    expect(definitionScans(calls)).toBe(2); // one per definition epoch, not one per event
    // The memo reads definition POSITIONS only past its horizon: each read starts where the last one stopped (1 first).
    const horizons = calls.filter((call) => call.text.includes('SELECT workspace_seq FROM events')).map((call) => Number(call.values[1]));
    expect(horizons.length).toBeGreaterThan(1); // precondition: more than one read, so "strictly rising" says something
    expect([horizons[0], horizons.every((h, i) => i === 0 || h > horizons[i - 1]!)]).toEqual([1, true]);
    // Control: the newest definitions fold the same history to the other answer.
    expect((await foldPrefix(TICKET_4, Infinity, await buildLedgerDeps(db.pool, WS))).periods).toEqual([{ start: S3, end: S3, pass: 1 }]);
  });

  it('29.355 the writer started with immediate runs its first pass at once, so a deploy restates without waiting an interval', async () => {
    // TICKET_4's stale row is still due: the leg above folded it without writing.
    expect((await readLatestSnapshot(db.pool, 'ticket', TICKET_4))?.foldVersion).toBe(1);
    // Control: without `immediate` nothing touches the database before the first tick, an hour away.
    const quiet: QueryCall[] = [];
    startSnapshotWriter(recording(db.pool, quiet), { intervalMs: 3_600_000, minEvents: 20 })();
    expect(quiet).toEqual([]);
    const logged: string[] = [];
    const stop = startSnapshotWriter(db.pool, { intervalMs: 3_600_000, minEvents: 20, immediate: true, log: (msg) => logged.push(msg) });
    try {
      await vi.waitFor(async () => expect((await readLatestSnapshot(db.pool, 'ticket', TICKET_4))?.foldVersion).toBe(2), { timeout: 10_000, interval: 50 });
    } finally {
      stop();
    }
    expect(logged).toEqual([]);
  });

  it('29.355 a stale snapshot AT the head is restated in place: its own seq, the current fold version, then due no more', async () => {
    // The common row at a deploy: a snapshot taken at the head, no event since, so the restate lands on the seq the
    // stale row already holds (`overwriteSnapshot`, not the plain insert).
    await seed([created(TICKET_5, 'snap-task', S1), to(TICKET_5, 'doing', S2), to(TICKET_5, 'done', S3)]);
    await plant(TICKET_5, 3, await foldPrefix(TICKET_5, 3, await buildLedgerDeps(db.pool, WS)), true);
    const stale = await readLatestSnapshot(db.pool, 'ticket', TICKET_5);
    expect([stale?.seq, stale?.foldVersion, 'periods' in (stale?.state ?? {})]).toEqual([3, 1, false]); // precondition
    const { written } = await runSnapshotPass(db.pool, { minEvents: 20 });
    expect(written).toEqual([{ entityId: TICKET_5, seq: 3 }]);
    const restated = await readLatestSnapshot(db.pool, 'ticket', TICKET_5);
    expect([restated?.seq, restated?.foldVersion, restated?.state['periods']]).toEqual([3, 2, [{ start: S2, end: S3, pass: 1 }]]);
    expect((await runSnapshotPass(db.pool, { minEvents: 20 })).written).toEqual([]);
  });

  it('29.355 a ticket with no snapshot is not a restate: it folds with the definitions it is handed, and the pass writes it with the plain insert', async () => {
    // Twins with the same three events, seeded after every definition: TICKET_7 holds a pre-periods row (the control),
    // TICKET_6 holds no snapshot at all, and "no row" must not read as "a row an older fold wrote". Declared here, last:
    // every ticket above is current by now, and a stale row planted earlier would join the passes of the legs above.
    const TICKET_6 = newUlid();
    const TICKET_7 = newUlid();
    await seed([
      created(TICKET_6, 'snap-task', S1), to(TICKET_6, 'doing', S2), to(TICKET_6, 'done', S3),
      created(TICKET_7, 'snap-task', S1), to(TICKET_7, 'doing', S2), to(TICKET_7, 'done', S3),
    ]);
    const newest = await buildLedgerDeps(db.pool, WS);
    await plant(TICKET_7, 1, await foldPrefix(TICKET_7, 1, newest), true);
    const twin = await readLatestSnapshot(db.pool, 'ticket', TICKET_7);
    expect([await readLatestSnapshot(db.pool, 'ticket', TICKET_6), twin?.foldVersion]).toEqual([null, 1]); // precondition

    /** One recorded fold with the newest definitions: the head's `restated`, its definition loads, its tail reads. */
    const fold = async (ticketId: string): Promise<unknown[]> => {
      const calls: QueryCall[] = [];
      const client = await db.pool.connect();
      try {
        const head = await foldTicketHead(recording(client, calls), ticketId, newest);
        return [head?.restated, definitionScans(calls), tailReadsFor(calls, ticketId)];
      } finally {
        client.release();
      }
    };
    // Control first: the stale twin is a restate, with one as-of load (no definition change in its history). The
    // subject reads the same whole stream from 0 and folds it with the definitions it was handed: no restate, no load.
    expect([await fold(TICKET_7), await fold(TICKET_6)]).toEqual([[true, 1, [0]], [false, 0, [0]]]);

    // The pass: TICKET_6 is due by its event count, TICKET_7 by its fold version; every other ticket in this file is
    // current and fewer than 3 events past its latest row. The restate writes through `overwriteSnapshot`; a first
    // snapshot takes the plain INSERT, whose primary-key collision stays reserved for overlapping passes (12.89).
    const calls: QueryCall[] = [];
    await runSnapshotPass(recording(db.pool, calls), { minEvents: 3 });
    const overwrites = (ticketId: string): boolean[] =>
      calls.filter((call) => call.text.includes('INSERT INTO snapshots') && call.values[1] === ticketId).map((call) => call.text.includes('ON CONFLICT'));
    expect([overwrites(TICKET_7), overwrites(TICKET_6)]).toEqual([[true], [false]]);
  });
});

/**
 * Case 29.404 (wtg2 fold-version bootstrap, planner ruling D 2026-10-05): the writer's boot pass sets
 * `bootRestate.complete` when it SETTLES, however it ends. A ticket whose restate throws is logged by id and does not
 * stop the pass, because once the flag is set a stale row left behind is served as stored, without its periods: a
 * stale ticket sorting AFTER the throwing one must still be restated. A pass that fails outright (before any ticket)
 * sets the flag too, after its failure is logged. Last in the file: the poisoned ticket stays stale, and a plain
 * `runSnapshotPass` after this case would throw on it.
 */
describe('29.404 the boot restate flag', () => {
  it('29.404 a restate that throws is logged by ticket and the pass goes on, and the flag is set when the pass settles; a pass that fails outright sets it too', async () => {
    // POISON moves into a state no definition ever had, so its restate throws. SORTED: the pass folds in id order, so
    // a pass that stopped at the throw would leave AFTER_POISON stale.
    const sorted = [newUlid(), newUlid()].sort();
    const POISON = sorted[0]!;
    const AFTER_POISON = sorted[1]!;
    await seed([
      created(POISON, 'snap-task', S1), to(POISON, 'nowhere', S2),
      created(AFTER_POISON, 'snap-task', S1), to(AFTER_POISON, 'doing', S2), to(AFTER_POISON, 'done', S3),
    ]);
    const newest = await buildLedgerDeps(db.pool, WS);
    await plant(POISON, 1, await foldPrefix(POISON, 1, newest), true);
    await plant(AFTER_POISON, 3, await foldPrefix(AFTER_POISON, 3, newest), true);

    bootRestate.complete = false;
    const logged: string[] = [];
    const stop = startSnapshotWriter(db.pool, { intervalMs: 3_600_000, minEvents: 1_000_000, immediate: true, log: (msg) => logged.push(msg) });
    expect(bootRestate.complete).toBe(false); // control: started is not settled
    try {
      await vi.waitFor(() => {
        expect(bootRestate.complete).toBe(true);
      }, { timeout: 10_000, interval: 50 });
    } finally {
      stop();
    }
    expect(logged).toEqual([`snapshot pass: ticket ${POISON} failed: Error: applyTicketEvent: workflow "wf-snap" has no state "nowhere"`]);
    expect([(await readLatestSnapshot(db.pool, 'ticket', POISON))?.foldVersion, (await readLatestSnapshot(db.pool, 'ticket', AFTER_POISON))?.foldVersion]).toEqual([
      TICKET_FOLD_VERSION - 1,
      TICKET_FOLD_VERSION,
    ]);

    // The pass rejects before any ticket (its due query fails): the flag is still set, after the failure is logged.
    bootRestate.complete = false;
    const down: string[] = [];
    const broken = new Proxy(db.pool, {
      get(pool, prop) {
        if (prop === 'query') return () => Promise.reject(new Error('due query down'));
        const value = Reflect.get(pool, prop) as unknown;
        return typeof value === 'function' ? (value as (...a: unknown[]) => unknown).bind(pool) : value;
      },
    });
    const stopBroken = startSnapshotWriter(broken, { intervalMs: 3_600_000, minEvents: 1_000_000, immediate: true, log: (msg) => down.push(msg) });
    try {
      await vi.waitFor(() => {
        expect(bootRestate.complete).toBe(true);
      }, { timeout: 10_000, interval: 50 });
    } finally {
      stopBroken();
    }
    expect(down).toEqual(['snapshot pass failed: Error: due query down']);
  });
});
