import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { PoolClient } from 'pg';
import {
  applyTicketEvent,
  newUlid,
  TICKET_EVENT_TYPES,
  type LedgerEvent,
  type TicketState,
  type TicketStateDeps,
} from '@gisik-nokma/domain';
import { insertEvent, readEntityEvents } from '../../src/ledger/event-store.js';
import { readLatestSnapshot, writeSnapshot } from '../../src/ledger/snapshot-store.js';
import { buildLedgerDeps } from '../../src/sync/ledger-deps.js';
import { foldTicketHead, runSnapshotPass, startSnapshotWriter } from '../../src/sync/snapshot-writer.js';
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
const TICKET = newUlid();
const TICKET_2 = newUlid();
const TICKET_3 = newUlid();
const TICKET_4 = newUlid();

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
});
