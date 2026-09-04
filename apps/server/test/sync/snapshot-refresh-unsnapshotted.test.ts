import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  applyTicketEvent,
  newUlid,
  TICKET_EVENT_TYPES,
  type IngestResult,
  type LedgerEvent,
  type SubmittedEvent,
  type TicketState,
} from '@gisik-nokma/domain';
import { evaluateEvent } from '@gisik-nokma/rule-engine';
import { createIngestService } from '../../src/ingest/ingest-service.js';
import { buildProjectionRegistry } from '../../src/projections/index.js';
import { readEntityEvents } from '../../src/ledger/event-store.js';
import { readLatestSnapshot } from '../../src/ledger/snapshot-store.js';
import { buildLedgerDeps } from '../../src/sync/ledger-deps.js';
import { BOOTSTRAP_BACKFILL_TYPES } from '../../src/sync/sync-routes.js';
import { applyCommitted, makeCommitted } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';

/**
 * Case 12.159. The publish door repairs a ticket that has NO snapshot, and the
 * candidate query's ABSENCE of a snapshot-existence filter is what makes that
 * happen.
 *
 * ## Why this is a separate file from `./snapshot-refresh.test.ts`
 *
 * That file's fixture snapshots BOTH its tickets at seq 21 before the publish,
 * and 12.158 asserts the WHOLE `snapshots` table. Adding a never-snapshotted
 * ticket to it would change those row lists — and those lists are quoted as a
 * historical mutation record in `test-cases/12-offline-sync-apps.md`, which
 * updating would falsify. A ticket with no snapshot is also a different fixture
 * shape end to end: no snapshot pass runs here at all.
 *
 * ## The population this pins, and why the suite was blind to it
 *
 * `SNAPSHOT_MIN_EVENTS` is 20 and `runSnapshotPass` only snapshots a ticket
 * whose head has run that far past its latest snapshot, so a ticket under
 * twenty events has never been snapshotted and never would be. Every case in
 * `./snapshot-refresh.test.ts` uses a ticket that HAS one. So a change narrowing
 * the candidate query to tickets that already hold a snapshot — the obvious
 * reading of "invalidation", and a remedy an outside review actually proposed to
 * spare the publish a full replay — passes all three of those cases and breaks
 * this one. Measured, both directions; the mutation record is in
 * `test-cases/12-offline-sync-apps.md` under 12.159.
 *
 * The reason the narrowing is wrong is the same argument the module's docblock
 * already makes about DELETING a stale snapshot: a ticket with no snapshot is
 * served its FULL history, and the full history contains the offending
 * `ticket.transitioned` too. "No stale snapshot to invalidate" is not "nothing
 * to repair" — the repair is a snapshot ABOVE the offending event, and a ticket
 * with none needs one MORE than a ticket that has one.
 *
 * The fixture is therefore the 12.156 fixture with the snapshot step removed:
 * two events on the ticket, the second of them the transition into the state v2
 * drops.
 */

let db: TestDatabase;
const WS = newUlid();
const TICKET = newUlid();
const ACTOR = newUlid();
const PROJECT = newUlid();
/** The workflow's key IS its entity ULID — `evaluateWorkflowDefined` refuses `payload.id !== env.entity.id`. */
const WF = newUlid();
const TYPE_KEY = 'unsnapshotted-task';

const wfV1 = {
  id: WF,
  version: 1,
  name: 'Basic',
  initialStateId: 'todo',
  states: [
    { id: 'todo', name: 'To do', category: 'open' },
    { id: 'doing', name: 'Doing', category: 'active' },
    { id: 'done', name: 'Done', category: 'terminal' },
  ],
  transitions: [
    { from: '*', to: 'doing', rules: [] },
    { from: '*', to: 'done', rules: [] },
    { from: '*', to: 'todo', rules: [] },
  ],
};

/** v2 drops `doing`. The mapping is not optional — publishing refuses an unmapped drop. */
const wfV2 = {
  id: WF,
  version: 2,
  name: 'Basic',
  initialStateId: 'todo',
  states: [
    { id: 'todo', name: 'To do', category: 'open' },
    { id: 'done', name: 'Done', category: 'terminal' },
  ],
  transitions: [
    { from: '*', to: 'done', rules: [] },
    { from: '*', to: 'todo', rules: [] },
  ],
  stateMapping: { doing: 'todo' },
};

function ticketEvent(type: string, payload: unknown): LedgerEvent {
  return makeCommitted({
    workspaceId: WS,
    entity: { kind: 'ticket', id: TICKET },
    type,
    payload,
    actorId: ACTOR,
  });
}

function submittedPublish(payload: unknown): SubmittedEvent {
  return {
    id: newUlid(),
    workspaceId: WS,
    entity: { kind: 'workflow', id: WF },
    type: 'workflow.defined',
    version: 1,
    payload,
    actorId: ACTOR,
    origin: 'web',
    clientTime: '2026-08-20T10:00:00.000Z',
  };
}

/** Through the REAL ingest door, which is where the refresh is wired. */
async function publish(payload: unknown): Promise<IngestResult> {
  const ingest = createIngestService({
    pool: db.pool,
    evaluate: evaluateEvent,
    projections: buildProjectionRegistry(),
  });
  const [result] = await ingest.ingestBatch([submittedPublish(payload)]);
  if (result === undefined) throw new Error('ingestBatch answered nothing');
  return result;
}

/**
 * What `GET /v1/sync/bootstrap` would serve for this ticket — `bootstrapTicket`'s
 * body against the same store, reproduced for the same reason
 * `./snapshot-refresh.test.ts` reproduces it: the route's function is not
 * exported and the route needs a session, a membership and a visibility row,
 * while what this case is about is the PAYLOAD SHAPE.
 */
async function servedBootstrap(): Promise<{
  snapshot: TicketState | null;
  seq: number;
  tail: LedgerEvent[];
}> {
  const client = await db.pool.connect();
  try {
    const snapshot = await readLatestSnapshot(client, 'ticket', TICKET);
    const all = await readEntityEvents(client, 'ticket', TICKET);
    const seq = snapshot?.seq ?? 0;
    const backfill: readonly string[] = BOOTSTRAP_BACKFILL_TYPES;
    return {
      snapshot: (snapshot?.state as TicketState | undefined) ?? null,
      seq,
      tail: all.filter((e) => e.seq > seq || backfill.includes(e.type)),
    };
  } finally {
    client.release();
  }
}

/** The replica's side: fold the served tail onto the served snapshot with the NEWEST definitions. */
async function replayServed(): Promise<TicketState> {
  const served = await servedBootstrap();
  const deps = await buildLedgerDeps(db.pool, WS);
  let state = served.snapshot ?? undefined;
  for (const env of served.tail) {
    if ((TICKET_EVENT_TYPES as readonly string[]).includes(env.type)) {
      state = applyTicketEvent(state, env, deps);
    }
  }
  if (state === undefined) throw new Error('nothing folded');
  return state;
}

/**
 * EVERY row in the whole `snapshots` table. A per-ticket read cannot support
 * "there is no snapshot", because the rows it skips are exactly the ones that
 * would falsify it.
 */
async function allSnapshotRows(): Promise<string[]> {
  const { rows } = await db.pool.query<{
    entity_kind: string;
    entity_id: string;
    seq: number;
    state: TicketState;
  }>('SELECT entity_kind, entity_id, seq, state FROM snapshots ORDER BY entity_kind, entity_id, seq');
  return rows.map(
    (row) =>
      `${row.entity_kind}:${row.entity_id === TICKET ? 'T' : row.entity_id}:${row.seq}:${row.state.stateId}:v${row.state.workflowVersion}`,
  );
}

beforeAll(async () => {
  db = await createTestDatabase();
  await applyCommitted(db.pool, [
    makeCommitted({
      workspaceId: WS,
      entity: { kind: 'workflow', id: WF },
      type: 'workflow.defined',
      payload: wfV1,
      actorId: ACTOR,
    }),
    makeCommitted({
      workspaceId: WS,
      entity: { kind: 'ticket-type', id: newUlid() },
      type: 'ticket-type.defined',
      payload: { id: TYPE_KEY, name: 'Task', icon: 'check', rank: 3, workflowId: WF, fields: [] },
      actorId: ACTOR,
    }),
    ticketEvent('ticket.created', {
      typeId: TYPE_KEY,
      projectId: PROJECT,
      parentId: null,
      title: 'Never snapshotted',
    }),
    // THE OFFENDING EVENT, and the whole fixture is two events: eighteen short
    // of `SNAPSHOT_MIN_EVENTS`, so no snapshot pass runs here and none would
    // have written a row if it had.
    ticketEvent('ticket.transitioned', { to: 'doing' }),
  ]);
});

afterAll(async () => {
  await db.drop();
});

describe('refresh on publish, snapshot door — a ticket with no snapshot', () => {
  it('12.159 a publish repairs a ticket that never crossed SNAPSHOT_MIN_EVENTS, writing its first snapshot at head', async () => {
    // The pre-state, printed rather than counted, and the positive control in
    // one: the table is empty, the served payload is full history, and that
    // full history REPLAYS CLEAN while v1 is still the newest version. So a
    // throw after the publish is caused by the publish, not by a fixture that
    // never replayed at all.
    expect(await allSnapshotRows()).toEqual([]);
    const before = await servedBootstrap();
    expect(before.snapshot).toBeNull();
    expect(before.seq).toBe(0);
    expect(before.tail.map((e) => `${e.seq}:${e.type}`)).toEqual([
      '1:ticket.created',
      '2:ticket.transitioned',
    ]);
    const beforeState = await replayServed();
    expect({ stateId: beforeState.stateId, version: beforeState.workflowVersion }).toEqual({
      stateId: 'doing',
      version: 1,
    });

    const result = await publish(wfV2);
    expect(result.status).toBe('committed');

    // Asserted in this order on purpose, following 12.156: the DAMAGE first,
    // the mechanism second. Without the repair this line does not fail an
    // equality — it throws `applyTicketEvent: workflow "…" has no state
    // "doing"` out of the fold, which is the defect itself and not a
    // bookkeeping difference. A row-list assertion placed above it would red
    // first and hide which of the two a reader is looking at.
    const afterState = await replayServed();
    expect({ stateId: afterState.stateId, version: afterState.workflowVersion }).toEqual({
      stateId: 'todo',
      version: 2,
    });

    // Then the mechanism that bought it: ONE row where there were none, at the
    // ticket's own head seq 2 — a snapshot eighteen events below the threshold
    // the background pass uses, folded onto the version just published.
    const after = await servedBootstrap();
    expect(after.seq).toBe(2);
    expect(after.tail.map((e) => `${e.seq}:${e.type}`)).toEqual([]);
    expect(await allSnapshotRows()).toEqual(['ticket:T:2:todo:v2']);

    // The repair is a snapshot above the offending event, never a rewrite of
    // history: the `ticket.transitioned` into the dropped state is still in the
    // ledger, exactly as 12.156 asserts for the snapshotted case.
    const client = await db.pool.connect();
    try {
      const all = await readEntityEvents(client, 'ticket', TICKET);
      expect(all.map((e) => `${e.seq}:${e.type}`)).toEqual([
        '1:ticket.created',
        '2:ticket.transitioned',
      ]);
      expect(all[1]?.payload).toEqual({ to: 'doing' });
    } finally {
      client.release();
    }
  });
});
