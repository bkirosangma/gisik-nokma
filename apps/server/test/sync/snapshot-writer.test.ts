import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool, PoolClient } from 'pg';
import {
  applyTicketEvent,
  newUlid,
  TICKET_EVENT_TYPES,
  type LedgerEvent,
  type TicketState,
} from '@gisik-nokma/domain';
import { insertEvent, readEntityEvents } from '../../src/ledger/event-store.js';
import { readLatestSnapshot } from '../../src/ledger/snapshot-store.js';
import { buildLedgerDeps } from '../../src/sync/ledger-deps.js';
import { runSnapshotPass, startSnapshotWriter } from '../../src/sync/snapshot-writer.js';
import { BOOTSTRAP_BACKFILL_TYPES } from '../../src/sync/sync-routes.js';
import { makeCommitted } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';

/**
 * Cases 12.85–12.91. Plan 10 Task 5 — the snapshot writer.
 *
 * ## Why this file seeds the LEDGER ONLY, and never runs a projection
 *
 * The claim under test is that a snapshot is *the state a client computes from
 * the same events* — `applyTicketEvent` folded over the ledger, with deps read
 * from the ledger's own `workflow.defined` / `ticket-type.defined` events. The
 * obvious wrong implementation reads `proj_tickets` (and `proj_workflows` /
 * `proj_ticket_types`) instead, and against a fixture seeded through the full
 * ingest path BOTH implementations produce the same bytes — `proj_tickets` is
 * itself maintained by `applyTicketEvent`. The equality assertion would pass
 * and would have distinguished nothing.
 *
 * So every event here goes into `events` by `insertEvent` and nowhere else,
 * exactly as `./contested-projection.test.ts` seeds its own world. That leaves
 * all three projections EMPTY — asserted, not assumed, in 12.86 — and turns the
 * wrong implementation into a loud failure rather than a silent agreement:
 * a `buildLedgerDeps` reading `proj_workflows` resolves `getTicketType` to
 * `undefined`, and `applyTicketEvent` throws on `ticket.created` naming its own
 * site.
 *
 * ## What `fullFold()` alone does NOT prove
 *
 * `fullFold()` calls the same `buildLedgerDeps` the writer calls. So the
 * equality pins *incremental fold ≡ full fold* — snapshot + tail ≡ replay,
 * which is the property Task 6's bootstrap rests on — and it is structurally
 * incapable of detecting a wrong deps SOURCE. The empty-projection control
 * above is what covers that half. Neither half is sufficient alone.
 *
 * ## Not seeded through the ingest door, and the consequence
 *
 * Nothing here is evidence that a client could produce this world: no
 * permission gate, no rule engine, no locks (see `../helpers/apply.ts`'s own
 * enumeration). The writer reads `events` and writes `snapshots`; it never
 * consults a rule, so that gap is not the gap for this surface. It WOULD be
 * for Task 6's route, which is gated.
 */

let db: TestDatabase;
const WS = newUlid();
const TICKET = newUlid();
const ACTOR = newUlid();
const PROJECT = newUlid();
const WORKFLOW_ENTITY = newUlid();
const TYPE_ENTITY = newUlid();

/** Payload keys — what `TicketStateDeps` is keyed by, and NOT the entity ids. */
const WORKFLOW_KEY = 'wf-snap';
const TYPE_KEY = 'snap-task';

const wfBasic = {
  id: WORKFLOW_KEY,
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

type QueryCall = { text: string; values: unknown[] };

/**
 * A `Pool` (or `PoolClient`) that records the SQL and bind values passing
 * through it, and hands out recording clients from `connect()`.
 *
 * It exists for 12.87 only: "folds from the previous snapshot rather than from
 * scratch" is otherwise UNOBSERVABLE from the result — both strategies compute
 * the same state, so an equality assertion cannot tell them apart and would be
 * a check that cannot fail. What distinguishes them is the `afterSeq` bind
 * value `readEntityEvents` is called with, and that is what this reads.
 */
function recording<T extends object>(target: T, calls: QueryCall[]): T {
  return new Proxy(target, {
    get(obj, prop) {
      const value = Reflect.get(obj, prop) as unknown;
      if (prop === 'query' && typeof value === 'function') {
        return (...args: unknown[]): unknown => {
          if (typeof args[0] === 'string') {
            calls.push({ text: args[0], values: Array.isArray(args[1]) ? args[1] : [] });
          }
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

/** Every `readEntityEvents` tail read aimed at `TICKET`, in call order, as its `afterSeq`. */
function tailReadsFor(calls: readonly QueryCall[], ticketId: string): number[] {
  return calls
    .filter((call) => call.text.includes('seq > $3') && call.values[1] === ticketId)
    .map((call) => Number(call.values[2]));
}

async function seed(events: readonly LedgerEvent[]): Promise<void> {
  const client = await db.pool.connect();
  try {
    for (const event of events) {
      await insertEvent(client, event);
    }
  } finally {
    client.release();
  }
}

function ticketEvent(type: string, payload: unknown, ticketId = TICKET): LedgerEvent {
  return makeCommitted({
    workspaceId: WS,
    entity: { kind: 'ticket', id: ticketId },
    type,
    payload,
    actorId: ACTOR,
  });
}

async function seedDefinitionsAndTicket(): Promise<void> {
  await seed([
    makeCommitted({
      workspaceId: WS,
      entity: { kind: 'workflow', id: WORKFLOW_ENTITY },
      type: 'workflow.defined',
      payload: wfBasic,
      actorId: ACTOR,
    }),
    makeCommitted({
      workspaceId: WS,
      entity: { kind: 'ticket-type', id: TYPE_ENTITY },
      type: 'ticket-type.defined',
      payload: {
        id: TYPE_KEY,
        name: 'Task',
        icon: 'check',
        rank: 3,
        workflowId: WORKFLOW_KEY,
        fields: [],
      },
      actorId: ACTOR,
    }),
    ticketEvent('ticket.created', {
      typeId: TYPE_KEY,
      projectId: PROJECT,
      parentId: null,
      title: 'Snapshot me',
    }),
  ]);
}

async function appendFieldSets(n: number, ticketId = TICKET): Promise<void> {
  const events: LedgerEvent[] = [];
  for (let i = 0; i < n; i += 1) {
    events.push(ticketEvent('ticket.field_set', { fieldId: 'notes', value: `note ${i}` }, ticketId));
  }
  await seed(events);
}

/** The independent truth: a full fold of the ledger through the domain reducer. */
async function fullFold(ticketId = TICKET): Promise<TicketState> {
  const deps = await buildLedgerDeps(db.pool, WS);
  const events = await readEntityEvents(db.pool, 'ticket', ticketId);
  let state: TicketState | undefined;
  for (const env of events) {
    if ((TICKET_EVENT_TYPES as readonly string[]).includes(env.type)) {
      state = applyTicketEvent(state, env, deps);
    }
  }
  if (state === undefined) throw new Error('no events folded');
  return state;
}

/** What the ledger says the entity's head is — the positive control for every "wrote nothing". */
async function headSeq(ticketId = TICKET): Promise<number> {
  const { rows } = await db.pool.query<{ head: number }>(
    "SELECT coalesce(max(seq), 0)::bigint AS head FROM events WHERE entity_kind = 'ticket' AND entity_id = $1",
    [ticketId],
  );
  return Number(rows[0]?.head ?? 0);
}

async function countRows(table: string): Promise<number> {
  const { rows } = await db.pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table}`);
  return Number(rows[0]?.n ?? 0);
}

async function snapshotSeqs(ticketId = TICKET): Promise<number[]> {
  const { rows } = await db.pool.query<{ seq: number }>(
    "SELECT seq FROM snapshots WHERE entity_kind = 'ticket' AND entity_id = $1 ORDER BY seq",
    [ticketId],
  );
  return rows.map((row) => Number(row.seq));
}

beforeAll(async () => {
  db = await createTestDatabase();
  await seedDefinitionsAndTicket();
});

afterAll(async () => {
  await db.drop();
});

describe('runSnapshotPass', () => {
  it('12.85 writes nothing below the threshold — against a ledger the same run proves is not empty', async () => {
    await appendFieldSets(10); // ticket now has 11 events, threshold 20

    const { written } = await runSnapshotPass(db.pool, { minEvents: 20 });

    // The positive control for the null. Without it, `written === []` is
    // satisfied just as well by a pass that found no events at all, by a
    // fixture that seeded nothing, or by a query aimed at the wrong entity
    // kind — three well-formed wrong answers.
    expect(await headSeq()).toBe(11);
    expect(written).toEqual([]);
    expect(await snapshotSeqs()).toEqual([]);
  });

  /**
   * 12.14 — the written snapshot equals the reducer's full fold, proven with every source projection empty (this test); the resume-from-previous-snapshot half is proved by 12.87 (snapshot-writer.test.ts:272-294, asserting the bounded replay reads only the tail past seq 21).
   */
  it('12.86 the snapshot IS the reducer fold, and the projections it could have been read from are empty', async () => {
    await appendFieldSets(10); // 21 events total

    const { written } = await runSnapshotPass(db.pool, { minEvents: 20 });

    expect(written).toEqual([{ entityId: TICKET, seq: 21 }]);
    const client = await db.pool.connect();
    try {
      const snapshot = await readLatestSnapshot(client, 'ticket', TICKET);
      expect(snapshot?.seq).toBe(21);
      expect(snapshot?.state).toEqual(JSON.parse(JSON.stringify(await fullFold())));
    } finally {
      client.release();
    }

    // The half the equality above cannot prove: that the state and the deps
    // came from the LEDGER. Every projection this world could have been read
    // from holds nothing, so a writer that read one would have produced no
    // snapshot at all (or thrown on the missing ticket type).
    expect(await countRows('proj_tickets')).toBe(0);
    expect(await countRows('proj_workflows')).toBe(0);
    expect(await countRows('proj_ticket_types')).toBe(0);
  });

  it('12.87 the next pass folds from the previous snapshot, not from scratch', async () => {
    await appendFieldSets(20); // 41 events
    const calls: QueryCall[] = [];

    const { written } = await runSnapshotPass(recording(db.pool, calls), { minEvents: 20 });

    expect(written).toEqual([{ entityId: TICKET, seq: 41 }]);
    const client = await db.pool.connect();
    try {
      const snapshot = await readLatestSnapshot(client, 'ticket', TICKET);
      expect(snapshot?.seq).toBe(41);
      expect(snapshot?.state).toEqual(JSON.parse(JSON.stringify(await fullFold())));
    } finally {
      client.release();
    }

    // The observation the equality cannot make. A from-scratch fold reads the
    // whole history — `afterSeq = 0`. Bounded replay reads only the tail past
    // the snapshot this file's 12.86 already wrote, so the bind value is 21.
    // Asserting the exact number rather than "> 0" is what makes a writer that
    // resumed from the WRONG snapshot fail here too.
    expect(tailReadsFor(calls, TICKET)).toEqual([21]);
  });

  it('12.88 a non-ticket event LAST on the ticket stream still advances the snapshot seq, and is not folded', async () => {
    // `claim.contested` is filed against `kind: 'ticket'` but is deliberately
    // NOT in TICKET_EVENT_TYPES, so the reducer never sees it. Two separate
    // properties, and the contest is seeded LAST so each one can fail alone:
    //
    //  * the snapshot's seq must advance PAST it — 61, not 60. That seq is
    //    Task 6's resume cursor, and a writer that advanced seq only on folded
    //    events would claim 60 and make a replica re-deliver event 61 forever.
    //    Seeding the contest in the middle would have hidden this: the last
    //    event would be a foldable one and both writers would answer 61.
    //  * it must not reach `applyTicketEvent`, whose `default` branch throws
    //    `not a ticket event` — so a writer that dropped the TICKET_EVENT_TYPES
    //    filter fails here loudly rather than differing by a field.
    await appendFieldSets(19); // 60 events
    await seed([
      ticketEvent('claim.contested', {
        originalEvent: { id: newUlid(), type: 'ticket.transitioned' },
        rule: 'restrict-to',
        reason: 'not yours',
      }),
    ]); // 61 events, the last of them unfoldable

    const { written } = await runSnapshotPass(db.pool, { minEvents: 20 });

    expect(await headSeq()).toBe(61);
    expect(written).toEqual([{ entityId: TICKET, seq: 61 }]);
    const client = await db.pool.connect();
    try {
      const snapshot = await readLatestSnapshot(client, 'ticket', TICKET);
      expect(snapshot?.seq).toBe(61);
      // `fullFold` skips the contest too, so this pins that the state stored at
      // seq 61 is the fold of the sixty events that ARE ticket events.
      expect(snapshot?.state).toEqual(JSON.parse(JSON.stringify(await fullFold())));
    } finally {
      client.release();
    }
    expect(await snapshotSeqs()).toEqual([21, 41, 61]);
  });

  it('12.89 a repeated pass at minEvents 0 does not collide on the snapshots primary key', async () => {
    // `minEvents: 0` makes every entity due on every pass, so the second pass
    // recomputes a snapshot at a seq that already has a row and the PK
    // (entity_kind, entity_id, seq) refuses it. Only the PROGRAMMATIC door can
    // reach this — `SNAPSHOT_MIN_EVENTS` is `.positive()` in the config schema,
    // so no environment can produce a 0.
    const other = newUlid();
    await seed([
      makeCommitted({
        workspaceId: WS,
        entity: { kind: 'ticket', id: other },
        type: 'ticket.created',
        payload: { typeId: TYPE_KEY, projectId: PROJECT, parentId: null, title: 'Zero threshold' },
        actorId: ACTOR,
      }),
    ]);

    const first = await runSnapshotPass(db.pool, { minEvents: 0 });
    expect(first.written).toContainEqual({ entityId: other, seq: 1 });

    const second = await runSnapshotPass(db.pool, { minEvents: 0 });

    expect(second.written).toEqual([]);
    expect(await snapshotSeqs(other)).toEqual([1]);
  });
});

/**
 * REAL timers throughout, deliberately. Vitest's fake timers patch the timer
 * functions and nothing else, so a faked `advanceTimersByTimeAsync` flushes
 * microtasks but does NOT wait for a pg round trip to come back off the socket —
 * 12.90 would then read the snapshots table before the pass that writes it has
 * finished, and fail intermittently for a reason that has nothing to do with
 * the writer. Polling for the expected state with a deadline is slower and
 * fails loudly instead.
 */
/**
 * 12.244 — RULING P36's EXCLUDING FIXTURE, first half.
 *
 * The snapshot carries the RECORDED provenance of the state claim, and the test
 * that matters is not "a serverTime is present" — a fabricated one is present
 * too. It is that the value EQUALS the ledger row's own `server_time` at the seq
 * the claim was made, **read out of the events table in the same run rather than
 * compared against a fixture constant**. A constant would pass against a writer
 * that copied the right value and equally against one that happened to compute
 * the same string; the row is the only thing that can tell those apart.
 *
 * The mutation this exists to catch is option 3 — the remedy P36 refused in
 * writing: spending a NEIGHBOURING event's instant, which is attributing one
 * event's time to another. It looks like provenance and is a fabrication.
 */
describe('12.244 the snapshot copies the state claim’s recorded instant, not a neighbour’s', () => {
  it('12.244 stateProvenance.serverTime equals the ledger row at that seq — asserted against the ROW', async () => {
    // A SECOND state-claiming event, and the case could not test its own title
    // without it. `TICKET` was created and then only ever `field_set`, so
    // `ticket.created` was the ONLY candidate — "the LAST such event wins" was
    // unconstrained, and a capture-first-only writer passed. It still would
    // have caught option 3 (a non-state neighbour's instant), which is why the
    // gap was easy to miss: the case DID kill the mutation it was written for,
    // while its stated property went untested.
    await seed([ticketEvent('ticket.transitioned', { to: 'doing' }, TICKET)]);

    await runSnapshotPass(db.pool, { minEvents: 0 });

    const client = await db.pool.connect();
    try {
      const snapshot = await readLatestSnapshot(client, 'ticket', TICKET);
      expect(snapshot?.provenance, 'a provenance block was written at all').not.toBeNull();

      // The ledger's own answer for the LAST state-claiming event on this
      // ticket — the row the writer folded and, before P36, dropped.
      const { rows } = await db.pool.query<{ seq: number; server_time: string; actor_id: string }>(
        `SELECT seq, server_time, actor_id FROM events
          WHERE entity_kind = 'ticket' AND entity_id = $1
            AND type IN ('ticket.created', 'ticket.transitioned')
          ORDER BY seq DESC LIMIT 1`,
        [TICKET],
      );
      const row = rows[0];
      // Positive control for the query itself: a null here would make every
      // comparison below vacuously true against `undefined`.
      expect(row, 'the ledger has a state-claiming event for this ticket').toBeDefined();

      expect(snapshot?.provenance?.state.serverTime).toBe(
        new Date(row!.server_time).toISOString(),
      );
      expect(snapshot?.provenance?.state.actorId).toBe(row!.actor_id);

      // AND IT IS NOT A NEIGHBOUR'S. The ticket's stream carries other events
      // with their own instants; asserting equality above does not by itself
      // show the writer picked the right row unless a wrong row would differ.
      // This is that check: the adjacent event's time is asserted DIFFERENT, so
      // the equality above is discriminating rather than lucky.
      const { rows: others } = await db.pool.query<{ server_time: string }>(
        `SELECT server_time FROM events
          WHERE entity_kind = 'ticket' AND entity_id = $1 AND seq <> $2
          ORDER BY seq DESC LIMIT 1`,
        [TICKET, row!.seq],
      );
      if (others[0] !== undefined) {
        expect(new Date(others[0].server_time).toISOString()).not.toBe(
          snapshot?.provenance?.state.serverTime,
        );
      }
    } finally {
      client.release();
    }
  });
});

describe('startSnapshotWriter', () => {
  it('12.90 writes real snapshots on its interval, and the returned stop function halts it', async () => {
    const ticket = newUlid();
    await seed([
      makeCommitted({
        workspaceId: WS,
        entity: { kind: 'ticket', id: ticket },
        type: 'ticket.created',
        payload: { typeId: TYPE_KEY, projectId: PROJECT, parentId: null, title: 'Ticked' },
        actorId: ACTOR,
      }),
    ]);
    await appendFieldSets(19, ticket); // 20 events — due at threshold 20

    const stop = startSnapshotWriter(db.pool, { intervalMs: 10, minEvents: 20 });
    let stopped = false;
    try {
      await waitFor(
        async () => (await snapshotSeqs(ticket)).length === 1,
        'the interval writer never wrote a snapshot',
      );
      expect(await snapshotSeqs(ticket)).toEqual([20]);

      stop();
      stopped = true;
      await appendFieldSets(20, ticket); // 40 events — due again, were anything still running
      await sleep(150); // fifteen intervals' worth

      // The head proves the entity really WAS due across that window, so
      // "nothing more was written" is a fact about the stop function rather
      // than about there being nothing left to write.
      expect(await headSeq(ticket)).toBe(40);
      expect(await snapshotSeqs(ticket)).toEqual([20]);
    } finally {
      if (!stopped) stop();
    }
  });

  it('12.91 a failing pass is logged and the timer survives to try again', async () => {
    const logged: string[] = [];
    let attempts = 0;
    const brokenPool = {
      query: (): Promise<never> => {
        attempts += 1;
        return Promise.reject(new Error('connection terminated unexpectedly'));
      },
      connect: (): Promise<never> =>
        Promise.reject(new Error('connection terminated unexpectedly')),
    } as unknown as Pool;

    const stop = startSnapshotWriter(brokenPool, {
      intervalMs: 5,
      minEvents: 20,
      log: (msg) => logged.push(msg),
    });
    let stopped = false;
    try {
      await waitFor(async () => logged.length >= 2, 'a failing pass was never logged');
      stop();
      stopped = true;
      const frozen = attempts;
      await sleep(100); // twenty intervals' worth

      // Survived its own failure to run again, then stopped when told to.
      expect(frozen).toBeGreaterThanOrEqual(2);
      expect(attempts).toBe(frozen);
      // The message names the failure, not merely that one happened.
      expect(logged[0]).toContain('connection terminated unexpectedly');
    } finally {
      if (!stopped) stop();
    }
  });
});

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** Polls until the condition holds, or fails naming what never happened. */
async function waitFor(
  condition: () => Promise<boolean>,
  what: string,
  timeoutMs = 5000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await condition()) return;
    await sleep(10);
  }
  throw new Error(`${what} — waited ${String(timeoutMs)}ms`);
}

/**
 * Cases 12.92–12.93 — which DEFINITION wins.
 *
 * Its own workspace, deliberately. `runSnapshotPass` scans every workspace in
 * the database, and redefining `TYPE_KEY` in `WS` would change what
 * `applyTicketEvent` resolves for the tickets the cases above already
 * snapshotted — a fixture edit here would break assertions a hundred lines up,
 * for a reason nothing in either test names. A second workspace also makes the
 * `workspace_id = $1` filter observable, which is asserted rather than assumed.
 *
 * These fold `buildLedgerDeps` directly instead of going through the writer.
 * The writer's own cases prove the deps come FROM the ledger (12.86); nothing
 * there can see WHICH of several definitions of one key was chosen, because the
 * fixture up there defines each key exactly once.
 */
describe('buildLedgerDeps', () => {
  const WS2 = newUlid();
  // Used in DESCENDING order below, which is
  // the whole point of 12.92: the winning definition sits on the entity stream
  // with the SMALLER ULID, so an ordering by `(entity_kind, entity_id, seq)` —
  // what the plan text said to use — picks the loser. Both entity streams carry
  // exactly one event, so per-entity `seq` is 1 for both and cannot order them
  // against each other at all.
  // ORDERED by construction rather than by mint order: `newUlid()` is NOT
  // monotonic within a millisecond on this implementation — the premise
  // assertion below caught exactly that on the first run, with the two ids
  // minted in order and coming out reversed.
  const typeEntityA = newUlid();
  const typeEntityB = newUlid();
  const FIRST_TYPE_ENTITY = typeEntityA < typeEntityB ? typeEntityA : typeEntityB;
  const SECOND_TYPE_ENTITY = typeEntityA < typeEntityB ? typeEntityB : typeEntityA;

  function definition(entity: { kind: 'workflow' | 'ticket-type'; id: string }, type: string, payload: unknown): LedgerEvent {
    return makeCommitted({ workspaceId: WS2, entity, type, payload, actorId: ACTOR });
  }

  function workflow(version: number, name: string): LedgerEvent {
    return definition({ kind: 'workflow', id: newUlid() }, 'workflow.defined', {
      ...wfBasic,
      id: 'wf-a',
      version,
      name,
    });
  }

  beforeAll(async () => {
    // The premise 12.92 rests on. Strictly ordered, so this also catches the
    // degenerate case the construction above cannot rule out — two EQUAL ids,
    // which would put both definitions on one entity stream and make the
    // discrimination between workspace-stream order and entity-id order vanish
    // while every assertion below still passed.
    expect(FIRST_TYPE_ENTITY < SECOND_TYPE_ENTITY).toBe(true);
    await seed([
      workflow(1, 'A v1'),
      // The LOSING type definition, on the LATER-sorting entity id.
      definition({ kind: 'ticket-type', id: SECOND_TYPE_ENTITY }, 'ticket-type.defined', {
        id: 'kind-x', name: 'Kind X', icon: 'check', rank: 3, workflowId: 'wf-a', fields: [],
      }),
      workflow(3, 'A v3 first'),
      // Version 2 published AFTER version 3 — so "greatest version" and "last on
      // the stream" are different answers and 12.93 can tell them apart.
      workflow(2, 'A v2'),
      // A second publish of version 3 — so "first publisher of the winning
      // version" and "last publisher" are different answers too.
      workflow(3, 'A v3 second'),
      // The WINNING type definition: later on the workspace stream, earlier by
      // entity id.
      definition({ kind: 'ticket-type', id: FIRST_TYPE_ENTITY }, 'ticket-type.defined', {
        id: 'kind-x', name: 'Kind X, rebound', icon: 'check', rank: 3, workflowId: 'wf-b', fields: [],
      }),
    ]);
  });

  it('12.92 a redefined ticket type resolves to the LAST definition on the workspace stream', async () => {
    const deps = await buildLedgerDeps(db.pool, WS2);

    // `workflowId`, not `name`: the binding is the field with a consequence —
    // it is what `applyTicketEvent` looks a workflow up by on `ticket.created`.
    expect(deps.getTicketType('kind-x')?.workflowId).toBe('wf-b');
    expect(deps.getTicketType('kind-x')?.name).toBe('Kind X, rebound');
    // The loser named explicitly, so "the winner is wf-b" cannot be satisfied by
    // a fixture that only ever defined one.
    expect(deps.getTicketType('kind-x')?.workflowId).not.toBe('wf-a');
    // Unknown ids resolve undefined rather than throwing — the reducer is what
    // decides that a missing definition is fatal, and it names the id when it does.
    expect(deps.getTicketType('kind-nope')).toBeUndefined();
  });

  it('12.93 a workflow resolves to its GREATEST version, first publisher of it winning a tie, and never across workspaces', async () => {
    const deps = await buildLedgerDeps(db.pool, WS2);

    // Version 2 was published after version 3, so last-on-the-stream would say 2.
    expect(deps.getWorkflow('wf-a')?.version).toBe(3);
    // Two events published version 3; the earlier one wins, matching
    // `proj_workflows`' `ON CONFLICT (workflow_id, version) DO NOTHING`.
    expect(deps.getWorkflow('wf-a')?.name).toBe('A v3 first');
    // The workspace filter, made observable: WS's own definitions are seeded and
    // resolvable there (the control immediately below) and invisible here.
    expect(deps.getWorkflow(WORKFLOW_KEY)).toBeUndefined();
    expect(deps.getTicketType(TYPE_KEY)).toBeUndefined();

    const depsWs1 = await buildLedgerDeps(db.pool, WS);
    expect(depsWs1.getWorkflow(WORKFLOW_KEY)?.id).toBe(WORKFLOW_KEY);
    expect(depsWs1.getTicketType(TYPE_KEY)?.id).toBe(TYPE_KEY);
    expect(depsWs1.getWorkflow('wf-a')).toBeUndefined();
  });
});

describe('27.064 a snapshot of a linked ticket carries its links; link events fold, so they are not backfilled', () => {
  it('27.064 the snapshot state holds links exactly, and BOOTSTRAP_BACKFILL_TYPES holds neither link type; control: comment.added is backfilled', async () => {
    const LINKED = newUlid();
    const TARGET = newUlid();
    await seed([
      ticketEvent('ticket.created', { typeId: TYPE_KEY, projectId: PROJECT, parentId: null, title: 'Linked' }, LINKED),
      ticketEvent('ticket.link_added', { kind: 'blocks', targetId: TARGET }, LINKED),
    ]);

    const { written } = await runSnapshotPass(db.pool, { minEvents: 0 });

    expect(written).toContainEqual({ entityId: LINKED, seq: 2 });
    const client = await db.pool.connect();
    try {
      const snapshot = await readLatestSnapshot(client, 'ticket', LINKED);
      expect(snapshot?.seq).toBe(2);
      expect((snapshot?.state as TicketState).links).toEqual([{ kind: 'blocks', targetId: TARGET }]);
    } finally {
      client.release();
    }
    const backfilled = BOOTSTRAP_BACKFILL_TYPES as readonly string[];
    expect(backfilled).not.toContain('ticket.link_added');
    expect(backfilled).not.toContain('ticket.link_removed');
    expect(backfilled).toContain('comment.added'); // control: 12.115's backfilled member
  });
});
