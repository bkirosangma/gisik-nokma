import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { newUlid, type SubmittedEvent } from '@gisik-nokma/domain';
import { evaluateEvent } from '@gisik-nokma/rule-engine';
import type { ServerGate } from '../src/gates/server-gate.js';
import {
  ATOMIC_NO_FOUNDING_RULE,
  ATOMIC_SINGLE_WORKSPACE_RULE,
  createIngestService,
} from '../src/ingest/ingest-service.js';
import { PERMISSION_ROLE_RULE } from '../src/permissions/check-permission.js';
import { buildProjectionRegistry } from '../src/projections/index.js';
import { createTestDatabase, type TestDatabase } from './helpers/db.js';
import { submittedWorkflowDefined, submittedWorkspaceCreated } from './helpers/events.js';

/**
 * Drafts T5b. `workflow.defined` is the neutral filler (it founds nothing, see `ingest.test.ts`'s
 * `submittedNonFoundingEvent`), and every test mints its own workspace because `events` is append-only.
 */
let db: TestDatabase;
beforeAll(async () => {
  db = await createTestDatabase();
});
afterAll(async () => {
  await db.drop();
});

function service(overrides: Partial<Parameters<typeof createIngestService>[0]> = {}) {
  return createIngestService({
    pool: db.pool,
    evaluate: evaluateEvent,
    projections: buildProjectionRegistry(),
    ...overrides,
  });
}

const three = (ws: string): [SubmittedEvent, SubmittedEvent, SubmittedEvent] => [
  submittedWorkflowDefined(ws),
  submittedWorkflowDefined(ws),
  submittedWorkflowDefined(ws),
];
const ids = (events: readonly SubmittedEvent[]): string[] => events.map((event) => event.id);

async function inLedger(eventIds: readonly string[]): Promise<number> {
  const { rows } = await db.pool.query<{ n: number }>('SELECT count(*)::int AS n FROM events WHERE id = ANY($1)', [[...eventIds]]);
  return rows[0]?.n ?? 0;
}
async function headsOf(events: readonly SubmittedEvent[]): Promise<number> {
  const { rows } = await db.pool.query<{ n: number }>(
    'SELECT count(*)::int AS n FROM proj_entity_heads WHERE entity_id = ANY($1)',
    [events.map((event) => event.entity.id)],
  );
  return rows[0]?.n ?? 0;
}

/** Clients that log BEGIN, COMMIT and ROLLBACK the moment each round-trip RESOLVES (the shape `ingest.test.ts` uses for COMMIT alone). */
function poolRecordingTransactions(real: Pool, log: string[]): Pool {
  return {
    async connect() {
      const client = await real.connect();
      return new Proxy(client, {
        get(target, property) {
          if (property === 'query') {
            return async (...args: unknown[]) => {
              const run = target.query as unknown as (...a: unknown[]) => Promise<unknown>;
              const result = await run.apply(target, args);
              if (args[0] === 'BEGIN' || args[0] === 'COMMIT' || args[0] === 'ROLLBACK') log.push(args[0]);
              return result;
            };
          }
          const value = Reflect.get(target, property, target) as unknown;
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
    },
  } as unknown as Pool;
}

const refuseEvent = (refusedId: string): typeof evaluateEvent => async (env) =>
  env.id === refusedId ? { refused: true, rule: 'planted.refuse', reason: 'planted' } : { refused: false };

function explodingProjections(doomedId: string) {
  const projections = buildProjectionRegistry();
  projections.register({
    name: 'planted_exploding_projection',
    tables: [],
    async apply(event) {
      if (event.id === doomedId) throw new Error('planted: this projection refuses to apply');
    },
    async reset() {},
  });
  return projections;
}

describe('28.104 commitOne parity: the single path after the factoring', () => {
  it('a refusal in the middle commits its neighbours; a throwing projection rolls back that one event and rejects the call; each event takes one BEGIN and one COMMIT', async () => {
    const ws = newUlid();
    const [a, b, c] = three(ws);
    const refusalLog: string[] = [];
    const answers = await service({ evaluate: refuseEvent(b.id), pool: poolRecordingTransactions(db.pool, refusalLog) }).ingestBatch([a, b, c]);
    expect(answers.map((r) => r.status)).toEqual(['committed', 'refused', 'committed']);
    expect(refusalLog).toEqual(['BEGIN', 'COMMIT', 'BEGIN', 'ROLLBACK', 'BEGIN', 'COMMIT']); // the refused event's own ROLLBACK, in commitOne
    expect(await inLedger(ids([a, c]))).toBe(2);
    expect(await inLedger([b.id])).toBe(0);

    const [d, e] = [submittedWorkflowDefined(ws), submittedWorkflowDefined(ws)];
    await expect(service({ projections: explodingProjections(e.id) }).ingestBatch([d, e])).rejects.toThrow(
      'planted: this projection refuses to apply',
    );
    expect(await inLedger([d.id])).toBe(1); // the earlier event stays
    expect(await inLedger([e.id])).toBe(0); // only the doomed one rolled back

    const log: string[] = [];
    const [f, g] = [submittedWorkflowDefined(ws), submittedWorkflowDefined(ws)];
    await service({ pool: poolRecordingTransactions(db.pool, log) }).ingestBatch([f, g]);
    expect(log).toEqual(['BEGIN', 'COMMIT', 'BEGIN', 'COMMIT']);
  });

  it('fires each listener after ITS OWN commit, before the next event begins', async () => {
    const order: string[] = [];
    const ingest = service({ pool: poolRecordingTransactions(db.pool, order) });
    ingest.onEventCommitted(() => order.push('listener'));
    const ws = newUlid();
    await ingest.ingestBatch([submittedWorkflowDefined(ws), submittedWorkflowDefined(ws)]);
    expect(order).toEqual(['BEGIN', 'COMMIT', 'listener', 'BEGIN', 'COMMIT', 'listener']);
  });
});

describe('28.099 ingestAtomic', () => {
  it('commits an ordered set in ONE transaction: consecutive workspace_seq, one BEGIN and one COMMIT, listeners only after that COMMIT, in order', async () => {
    const ws = newUlid();
    const events = three(ws);
    const order: string[] = [];
    const ingest = service({ pool: poolRecordingTransactions(db.pool, order) });
    ingest.onEventCommitted((event) => order.push(`listener:${event.id}`));

    const outcome = await ingest.ingestAtomic(events);

    expect(outcome.status).toBe('committed');
    if (outcome.status !== 'committed') return;
    expect(outcome.results.map((r) => r.status)).toEqual(['committed', 'committed', 'committed']);
    expect(outcome.results.map((r) => r.eventId)).toEqual(ids(events));
    expect(order).toEqual(['BEGIN', 'COMMIT', ...events.map((event) => `listener:${event.id}`)]);
    const { rows } = await db.pool.query<{ id: string; workspace_seq: number }>(
      'SELECT id, workspace_seq::int AS workspace_seq FROM events WHERE workspace_id = $1 ORDER BY workspace_seq',
      [ws],
    );
    expect(rows).toEqual(events.map((event, i) => ({ id: event.id, workspace_seq: i + 1 })));
  });

  it('a refusal at index 1 leaves none of the set and fires no listener; the same ids then commit (CONTROL: they were not burned)', async () => {
    const ws = newUlid();
    const events = three(ws);
    const heard: string[] = [];
    const refusing = service({ evaluate: refuseEvent(events[1].id) });
    refusing.onEventCommitted((event) => heard.push(event.id));

    const outcome = await refusing.ingestAtomic(events);

    expect(outcome).toEqual({
      status: 'rolled-back',
      index: 1,
      result: { status: 'refused', eventId: events[1].id, rule: 'planted.refuse', reason: 'planted' },
    });
    expect(await inLedger(ids(events))).toBe(0);
    expect(await headsOf(events)).toBe(0);
    expect(heard).toEqual([]);

    const again = await service().ingestAtomic(events);
    expect(again.status).toBe('committed');
    expect(await inLedger(ids(events))).toBe(3);
  });

  it('a throwing projection on the third event rejects the call and leaves none of the three; the single path leaves the first two', async () => {
    const ws = newUlid();
    const events = three(ws);
    const heard: string[] = [];
    const ingest = service({ projections: explodingProjections(events[2].id) });
    ingest.onEventCommitted((event) => heard.push(event.id));
    await expect(ingest.ingestAtomic(events)).rejects.toThrow('planted: this projection refuses to apply');
    expect(await inLedger(ids(events))).toBe(0);
    expect(await headsOf(events)).toBe(0);
    expect(heard).toEqual([]);

    const single = three(newUlid());
    await expect(service({ projections: explodingProjections(single[2].id) }).ingestBatch(single)).rejects.toThrow(
      'planted: this projection refuses to apply',
    );
    expect(await inLedger(ids(single))).toBe(2); // CONTRAST: one event rolled back, its neighbours stand
  });

  it('judges a later event against an earlier one\'s writes, from the same transaction, which a second connection cannot see', async () => {
    const observed: Array<[viaTransaction: number, viaPool: number]> = [];
    const count = async (reader: { query: Pool['query'] }, workspaceId: string): Promise<number> => {
      const { rows } = await reader.query<{ n: number }>('SELECT count(*)::int AS n FROM events WHERE workspace_id = $1', [workspaceId]);
      return rows[0]?.n ?? 0;
    };
    const gate: ServerGate = {
      eventType: 'workflow.defined',
      async check(event, txDb) {
        observed.push([await count(txDb as unknown as { query: Pool['query'] }, event.workspaceId), await count(db.pool, event.workspaceId)]);
        return null;
      },
    };
    const ingest = service({ gates: [gate] });

    expect((await ingest.ingestAtomic(three(newUlid()))).status).toBe('committed');
    expect(observed).toEqual([[0, 0], [1, 0], [2, 0]]);

    observed.length = 0;
    await ingest.ingestBatch(three(newUlid())); // CONTRAST: the single path commits between events
    expect(observed).toEqual([[0, 0], [1, 1], [2, 2]]);
  });

  it('rolls the set back at the index of a shape fault, before BEGIN where it can; an empty set is a programming error', async () => {
    const ws = newUlid();
    const log: string[] = [];
    const ingest = service({ pool: poolRecordingTransactions(db.pool, log) });
    const first = submittedWorkflowDefined(ws);

    const otherWorkspace = await ingest.ingestAtomic([first, submittedWorkflowDefined(newUlid())]);
    expect(otherWorkspace).toMatchObject({ status: 'rolled-back', index: 1, result: { status: 'refused', rule: ATOMIC_SINGLE_WORKSPACE_RULE } });
    const founding = await ingest.ingestAtomic([first, submittedWorkspaceCreated({ workspaceId: ws, entity: { kind: 'workspace', id: ws } })]);
    expect(founding).toMatchObject({ status: 'rolled-back', index: 1, result: { status: 'refused', rule: ATOMIC_NO_FOUNDING_RULE } });
    const malformed = await ingest.ingestAtomic([first, submittedWorkflowDefined(ws), { ...submittedWorkflowDefined(ws), payload: { nope: true } }]);
    expect(malformed).toMatchObject({ status: 'rolled-back', index: 2, result: { status: 'invalid' } });
    expect(log).toEqual([]); // none of the three began a transaction
    expect(await inLedger([first.id])).toBe(0);

    const second = submittedWorkflowDefined(ws);
    const repeated = await ingest.ingestAtomic([first, { ...second, id: first.id }]);
    expect(repeated).toMatchObject({ status: 'rolled-back', index: 1, result: { status: 'invalid', code: 'duplicate-event-id' } });
    expect(log).toEqual(['BEGIN', 'ROLLBACK']); // a repeated id is only provable inside the transaction
    expect(await inLedger([first.id])).toBe(0);

    // CONTROL: the set the faults were cut from commits
    expect((await ingest.ingestAtomic([first, second])).status).toBe('committed');
    await expect(ingest.ingestAtomic([])).rejects.toThrow('ingestAtomic needs at least one event');
  });

  it('holds a concurrent writer to the same workspace out until the set commits, so it lands after the set', async () => {
    const ws = newUlid();
    const [a, b, c] = three(ws);
    const rival = submittedWorkflowDefined(ws);
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    let reached!: () => void;
    const atSecond = new Promise<void>((resolve) => {
      reached = resolve;
    });
    const gate: ServerGate = {
      eventType: 'workflow.defined',
      async check(event) {
        if (event.id === b.id) {
          reached();
          await held;
        }
        return null;
      },
    };
    const ingest = service({ gates: [gate] });

    const running = ingest.ingestAtomic([a, b, c]);
    await atSecond; // the set is mid-transaction: a is written, b is being judged
    const rivalDone = ingest.ingestBatch([rival]);
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(await inLedger([rival.id])).toBe(0); // waiting on the workspace lock
    release();
    expect((await running).status).toBe('committed');
    expect((await rivalDone)[0]?.status).toBe('committed'); // CONTROL: it was held, not lost

    const { rows } = await db.pool.query<{ id: string; workspace_seq: number }>(
      'SELECT id, workspace_seq::int AS workspace_seq FROM events WHERE workspace_id = $1 ORDER BY workspace_seq',
      [ws],
    );
    expect(rows).toEqual([a, b, c, rival].map((event, i) => ({ id: event.id, workspace_seq: i + 1 })));
  });

  it('the CLIENT door puts every event through the permission gate: a non-member\'s set rolls back at index 0; CONTROL: the same events through the internal door commit', async () => {
    const ws = newUlid();
    const events = three(ws);
    // The session IS the first event's actor, so the identity check passes and the refusal is the role's: nobody
    // holds a role in a workspace that was never founded.
    const gated = await service().ingestClientAtomic(events, events[0].actorId);
    expect(gated).toMatchObject({
      status: 'rolled-back',
      index: 0,
      result: { status: 'refused', eventId: events[0].id, rule: PERMISSION_ROLE_RULE },
    });
    expect(await inLedger(ids(events))).toBe(0);

    expect((await service().ingestAtomic(events)).status).toBe('committed');
    expect(await inLedger(ids(events))).toBe(3);
  });
});
