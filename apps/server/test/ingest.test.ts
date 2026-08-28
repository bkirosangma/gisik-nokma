import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import {
  newUlid,
  ENTITY_WORKSPACE_MISMATCH_RULE,
  type EntityHead,
  type EventEnvelope,
} from '@gisik-nokma/domain';
import { evaluateEvent } from '@gisik-nokma/rule-engine';
import { createIngestService } from '../src/ingest/ingest-service.js';
import { buildProjectionRegistry } from '../src/projections/index.js';
import { createTestDatabase, type TestDatabase } from './helpers/db.js';
import { submittedWorkflowDefined, submittedWorkspaceCreated } from './helpers/events.js';

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

/**
 * Hands out clients that append 'commit-completed' to `log` the moment a COMMIT
 * round-trip RESOLVES. Reads through a Proxy and never mutates the borrowed
 * client, so it goes back to the pool exactly as it came out.
 *
 * This exists because the cross-connection read in the hook test below cannot
 * settle the ordering on its own: ingest never awaits its listeners, so that
 * read races the COMMIT and loses. Ordering has to be observed where it is
 * decided — in the ingest transaction itself.
 */
function poolRecordingCommits(real: Pool, log: string[]): Pool {
  return {
    async connect() {
      const client = await real.connect();
      return new Proxy(client, {
        get(target, property) {
          if (property === 'query') {
            return async (...args: unknown[]) => {
              const run = target.query as unknown as (...a: unknown[]) => Promise<unknown>;
              const result = await run.apply(target, args);
              if (args[0] === 'COMMIT') {
                log.push('commit-completed');
              }
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

/**
 * Hands out real clients whose ROLLBACK always rejects — the dead-connection
 * case, reachable no other way against a live database. Everything else is the
 * real client doing real work through the same Proxy shape as above; only the
 * one statement is intercepted, and the borrowed client is never mutated.
 */
function poolWithFailingRollback(real: Pool): Pool {
  return {
    async connect() {
      const client = await real.connect();
      return new Proxy(client, {
        get(target, property) {
          if (property === 'query') {
            return async (...args: unknown[]) => {
              if (args[0] === 'ROLLBACK') {
                throw new Error('planted: connection terminated unexpectedly');
              }
              const run = target.query as unknown as (...a: unknown[]) => Promise<unknown>;
              return run.apply(target, args);
            };
          }
          const value = Reflect.get(target, property, target) as unknown;
          return typeof value === 'function' ? value.bind(target) : value;
        },
      });
    },
  } as unknown as Pool;
}

describe('ingestBatch', () => {
  it('answers per event, in order: committed, unknown type, invalid payload', async () => {
    const valid = submittedWorkspaceCreated();
    const unknownType = { ...submittedWorkspaceCreated(), type: 'shop.opened' };
    const badPayload = { ...submittedWorkspaceCreated(), payload: {} };

    const results = await service().ingestBatch([valid, unknownType, badPayload]);

    expect(results).toHaveLength(3);
    expect(results[0]).toMatchObject({ status: 'committed', eventId: valid.id, seq: 1 });
    expect(results[1]).toMatchObject({ status: 'invalid', code: 'unknown-event-type', eventId: unknownType.id });
    expect(results[2]).toMatchObject({ status: 'invalid', code: 'invalid-payload', eventId: badPayload.id });
    if (results[0]?.status === 'committed') {
      expect(results[0].serverTime).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    }
  });

  it('planted defect: an event filed against the wrong entity kind is refused at the door', async () => {
    // The ledger is append-only by trigger, so this event could never be taken
    // back once written — and the ticket it names would carry a workspace's
    // creation in its history forever (coordination doc §11). On the server
    // path this door answers first, before the engine is ever consulted; the
    // engine carries the same check per event type for the callers that never
    // come through here — the fixture suite and Plan 10's offline replica,
    // which both enter at evaluateEvent.
    const misfiled = submittedWorkspaceCreated({ entity: { kind: 'ticket', id: newUlid() } });

    const results = await service().ingestBatch([misfiled]);

    expect(results[0]).toEqual({
      status: 'invalid',
      eventId: misfiled.id,
      code: 'entity-kind-mismatch',
      message: 'This workspace.created event does not point at a workspace; it points at a ticket.',
    });
    const ledger = await db.pool.query('SELECT count(*)::int AS n FROM events WHERE id = $1', [misfiled.id]);
    expect(ledger.rows[0]).toEqual({ n: 0 });
  });

  it('planted defect: the version rule is judged against proj_workflows, not against a stub', async () => {
    // createEngineContext.getWorkflowDef used to return null unconditionally,
    // and every test above stays green with it back: they publish version 1
    // only, which a null answer accepts. So this is the test that holds the
    // wiring — the projection is read through the ingest transaction's own
    // client, which is the only way a publish can be judged against every
    // version committed before it and none of itself.
    //
    // Version 2 committing proves the read finds version 1. The second version
    // 2 proves what it FOUND: a stubbed null would refuse it too, but with
    // "the first published version must be version 1", so the reason is the
    // assertion that tells the two worlds apart.
    const ingest = service();
    const home = submittedWorkspaceCreated();
    const v1 = submittedWorkflowDefined(home.workspaceId);
    const republish = (version: number) => ({
      ...v1,
      id: newUlid(),
      payload: {
        id: v1.entity.id,
        version,
        name: 'Basic',
        initialStateId: 'todo',
        states: [
          { id: 'todo', name: 'To do', category: 'open' },
          { id: 'done', name: 'Done', category: 'terminal' },
        ],
        transitions: [{ from: 'todo', to: 'done', rules: [] }],
      },
    });

    const opening = await ingest.ingestBatch([home, v1, republish(2)]);
    expect(opening.map((result) => result.status)).toEqual(['committed', 'committed', 'committed']);

    const stale = republish(2);
    const results = await ingest.ingestBatch([stale]);

    expect(results[0]).toEqual({
      status: 'refused',
      eventId: stale.id,
      rule: 'workflow-version',
      reason: 'Workflow "Basic" is at version 2; the next published version must be 3, not 2.',
    });
  });

  it('planted defect: an entity already bound to one workspace cannot be re-filed under another', async () => {
    // The other half of coordination doc §11. `workspaceId` is a per-event
    // claim that nothing validated: a second event on this entity naming a
    // different workspace parsed cleanly and committed, splitting the entity's
    // history across two streams — a client resuming workspace A's cursor
    // never sees the event filed under B — and flipping
    // proj_entity_heads.workspace_id, the tenant boundary every scoped read
    // trusts, because the head advance's ON CONFLICT overwrites it. The ledger
    // is append-only by trigger, so a mis-filed event can never be taken back.
    //
    // This is a SERVER-side refusal, deliberately not an engine rule, so it has
    // no shared fixture: a client replica holds one workspace's events and
    // cannot see that an entity id is already bound elsewhere, so an engine
    // check would make client and server disagree by construction. Plan 10's
    // offline replica mirrors this KNOWINGLY, as a server-only door.
    //
    // The re-filed event is a LEGAL version 2, not a repeat of version 1. The
    // version rule reads proj_workflows by workflow_id alone — no workspace
    // scope — so without this door the event passes every engine rule, commits,
    // and flips the head row. A repeat v1 would be refused by the version rule
    // instead, and this test would stay green with the door taken out.
    const ingest = service();
    const home = submittedWorkspaceCreated();
    const first = submittedWorkflowDefined(home.workspaceId);
    const opening = await ingest.ingestBatch([home, first]);
    expect(opening.map((result) => result.status)).toEqual(['committed', 'committed']);

    const otherWorkspaceId = newUlid();
    const reFiled = {
      ...first,
      id: newUlid(),
      workspaceId: otherWorkspaceId,
      payload: {
        id: first.entity.id,
        version: 2,
        name: 'Basic',
        initialStateId: 'todo',
        states: [
          { id: 'todo', name: 'To do', category: 'open' },
          { id: 'done', name: 'Done', category: 'terminal' },
        ],
        transitions: [{ from: 'todo', to: 'done', rules: [] }],
      },
    };

    const results = await ingest.ingestBatch([reFiled]);

    // The assertion below names the constant, so on its own a rename would
    // move producer and expectation together and half-land silently. This is
    // the one place the wire value itself is pinned: Plan 10's replica and
    // Plan 6's UI bind to this exact string, not to the identifier.
    expect(ENTITY_WORKSPACE_MISMATCH_RULE).toBe('entity-workspace-mismatch');
    expect(results[0]).toEqual({
      status: 'refused',
      eventId: reFiled.id,
      rule: ENTITY_WORKSPACE_MISMATCH_RULE,
      reason:
        `This workflow belongs to workspace ${home.workspaceId}; ` +
        `this event files it under workspace ${otherWorkspaceId}. ` +
        'An entity cannot move between workspaces.',
    });
    // The head row did NOT flip: the workflow still belongs where it was born.
    const head = await db.pool.query<{ workspace_id: string }>(
      'SELECT workspace_id FROM proj_entity_heads WHERE entity_kind = $1 AND entity_id = $2',
      ['workflow', first.entity.id],
    );
    expect(head.rows).toEqual([{ workspace_id: home.workspaceId }]);
    const ledger = await db.pool.query('SELECT count(*)::int AS n FROM events WHERE id = $1', [reFiled.id]);
    expect(ledger.rows[0]).toEqual({ n: 0 });
  });

  it('assigns consecutive seqs to one entity across batches', async () => {
    const ingest = service();
    const base = submittedWorkspaceCreated();
    const rename = {
      ...base,
      id: newUlid(),
      type: 'workspace.renamed',
      payload: { name: 'CC HQ' },
    };
    const [first] = await ingest.ingestBatch([base]);
    const [second] = await ingest.ingestBatch([rename]);
    expect(first).toMatchObject({ status: 'committed', seq: 1 });
    expect(second).toMatchObject({ status: 'committed', seq: 2 });
  });

  it('planted defect: a rule refusal is reported verbatim and leaves NO trace in ledger or projections', async () => {
    const refuseAll: typeof evaluateEvent = async () => ({
      refused: true,
      rule: 'planted.rule',
      reason: 'planted: refused so the test can watch the door',
    });
    const event = submittedWorkspaceCreated();
    const results = await service({ evaluate: refuseAll }).ingestBatch([event]);

    expect(results[0]).toEqual({
      status: 'refused',
      eventId: event.id,
      rule: 'planted.rule',
      reason: 'planted: refused so the test can watch the door',
    });
    const ledger = await db.pool.query('SELECT count(*)::int AS n FROM events WHERE id = $1', [event.id]);
    expect(ledger.rows[0]).toEqual({ n: 0 });
    const heads = await db.pool.query(
      'SELECT count(*)::int AS n FROM proj_entity_heads WHERE entity_id = $1',
      [event.entity.id],
    );
    expect(heads.rows[0]).toEqual({ n: 0 });
  });

  it('planted defect: a replayed event id is answered duplicate-event-id', async () => {
    const ingest = service();
    const event = submittedWorkspaceCreated();
    await ingest.ingestBatch([event]);
    const results = await ingest.ingestBatch([event]);
    expect(results[0]).toMatchObject({
      status: 'invalid',
      code: 'duplicate-event-id',
      eventId: event.id,
    });
    if (results[0]?.status === 'invalid') {
      expect(results[0].message).toContain(event.id);
    }
  });

  it('planted defect: a ROLLBACK that throws cannot swallow the duplicate-event-id answer', async () => {
    // The dead connection is exactly the case where the original error matters
    // most, and an unguarded ROLLBACK in the catch throws its own error over it
    // — skipping the duplicate check below it and rejecting the whole batch
    // with something opaque. The duplicate answer stays truthful even here: a
    // unique violation proves a prior transaction committed that id.
    const event = submittedWorkspaceCreated();
    expect((await service().ingestBatch([event]))[0]?.status).toBe('committed');

    const results = await service({ pool: poolWithFailingRollback(db.pool) }).ingestBatch([event]);

    expect(results).toEqual([
      {
        status: 'invalid',
        eventId: event.id,
        code: 'duplicate-event-id',
        message: `an event with id ${event.id} is already in the ledger`,
      },
    ]);
  });

  it('applies projections in the same transaction as the event', async () => {
    const event = submittedWorkspaceCreated();
    await service().ingestBatch([event]);
    const head = await db.pool.query(
      'SELECT head_seq, head_event_id FROM proj_entity_heads WHERE entity_kind = $1 AND entity_id = $2',
      ['workspace', event.entity.id],
    );
    expect(head.rows).toEqual([{ head_seq: 1, head_event_id: event.id }]);
  });

  it('SAME transaction, proved: a projection that throws takes the ledger row down with it', async () => {
    // The head-row test above shows the projection ran; it cannot show WHERE.
    // Moving the projection loop after COMMIT leaves it green, because the same
    // client then writes proj_entity_heads in autocommit. Only a projection
    // that fails mid-apply can tell the two worlds apart: if the append and the
    // projections share one transaction, the failure erases the event too.
    const doomed = submittedWorkspaceCreated();
    const projections = buildProjectionRegistry();
    // Registered after proj_entity_heads, so the head row is already written
    // inside this transaction when the throw lands — both must roll back.
    projections.register({
      name: 'planted_exploding_projection',
      tables: [],
      async apply(event) {
        if (event.id === doomed.id) {
          throw new Error('planted: this projection refuses to apply');
        }
      },
      async reset() {},
    });

    await expect(service({ projections }).ingestBatch([doomed])).rejects.toThrow(
      'planted: this projection refuses to apply',
    );

    // Read back on a fresh pool connection: the ingest transaction is over.
    const ledger = await db.pool.query('SELECT count(*)::int AS n FROM events WHERE id = $1', [doomed.id]);
    expect(ledger.rows[0]).toEqual({ n: 0 });
    const heads = await db.pool.query(
      'SELECT count(*)::int AS n FROM proj_entity_heads WHERE entity_id = $1',
      [doomed.entity.id],
    );
    expect(heads.rows[0]).toEqual({ n: 0 });
  });

  it('the engine sees the world as of the previous event — not the one under evaluation', async () => {
    const observed: Array<number | null> = [];
    const peeking: typeof evaluateEvent = async (env, ctx) => {
      const state = (await ctx.getEntityState(env.entity.kind, env.entity.id)) as EntityHead | null;
      observed.push(state === null ? null : state.headSeq);
      return { refused: false };
    };
    const ingest = service({ evaluate: peeking });
    const base = submittedWorkspaceCreated();
    await ingest.ingestBatch([base]);
    await ingest.ingestBatch([
      { ...base, id: newUlid(), type: 'workspace.renamed', payload: { name: 'CC HQ' } },
    ]);
    expect(observed).toEqual([null, 1]);
  });
});

describe('onEventCommitted', () => {
  it('fires after commit with the full envelope, and only for committed events', async () => {
    const ingest = service();
    const seen: EventEnvelope[] = [];
    // AFTER is the load-bearing word, and only another connection can see it.
    // The listener reads the ledger through the pool, never through ingest's
    // own client: a hook fired inside the transaction would find nothing there,
    // because an uncommitted row is invisible outside the writer.
    const visibleFromAnotherConnection: Array<Promise<number>> = [];
    ingest.onEventCommitted((event) => {
      seen.push(event);
      visibleFromAnotherConnection.push(
        db.pool
          .query<{ n: number }>('SELECT count(*)::int AS n FROM events WHERE id = $1', [event.id])
          .then((result) => result.rows[0]?.n ?? -1),
      );
    });

    const valid = submittedWorkspaceCreated();
    const invalid = { ...submittedWorkspaceCreated(), type: 'shop.opened' };
    await ingest.ingestBatch([valid, invalid]);

    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ id: valid.id, seq: 1, type: 'workspace.created' });
    expect(await Promise.all(visibleFromAnotherConnection)).toEqual([1]);
  });

  it('fires only once the COMMIT round-trip has RESOLVED, not before it is issued', async () => {
    // The cross-connection read above states the intent but cannot enforce it:
    // ingest does not await its listeners, so that read is dispatched a tick
    // late and the COMMIT lands first even when the hook fired inside the
    // transaction. Recording the commit where it happens removes the race —
    // this ordering is decided in JavaScript, not by two racing backends.
    const order: string[] = [];
    const ingest = service({ pool: poolRecordingCommits(db.pool, order) });
    ingest.onEventCommitted(() => order.push('listener'));

    const results = await ingest.ingestBatch([submittedWorkspaceCreated()]);

    expect(results[0]?.status).toBe('committed');
    expect(order).toEqual(['commit-completed', 'listener']);
  });

  it('never fires for refused events', async () => {
    const refuseAll: typeof evaluateEvent = async () => ({
      refused: true,
      rule: 'planted.rule',
      reason: 'planted: refused',
    });
    const ingest = service({ evaluate: refuseAll });
    const seen: EventEnvelope[] = [];
    ingest.onEventCommitted((event) => seen.push(event));
    await ingest.ingestBatch([submittedWorkspaceCreated()]);
    expect(seen).toEqual([]);
  });

  it('unsubscribe stops delivery', async () => {
    const ingest = service();
    const seen: EventEnvelope[] = [];
    const unsubscribe = ingest.onEventCommitted((event) => seen.push(event));
    unsubscribe();
    await ingest.ingestBatch([submittedWorkspaceCreated()]);
    expect(seen).toEqual([]);
  });

  it('planted defect: a throwing listener cannot break ingest or starve other listeners', async () => {
    const ingest = service();
    const seen: EventEnvelope[] = [];
    ingest.onEventCommitted(() => {
      throw new Error('broken listener');
    });
    ingest.onEventCommitted((event) => seen.push(event));
    const results = await ingest.ingestBatch([submittedWorkspaceCreated()]);
    expect(results[0]?.status).toBe('committed');
    expect(seen).toHaveLength(1);
  });
});

describe('workspace stream cursor (coordination §18)', () => {
  it('two entities in one workspace get strictly increasing workspace_seq while both keep seq 1', async () => {
    const ingest = service();
    const workspaceCreated = submittedWorkspaceCreated();
    const workspaceId = workspaceCreated.workspaceId;
    const renamed = {
      ...workspaceCreated,
      id: newUlid(),
      type: 'workspace.renamed',
      payload: { name: 'CC HQ' },
    };
    const otherWorkspace = submittedWorkspaceCreated();

    await ingest.ingestBatch([workspaceCreated, renamed, otherWorkspace]);

    const stream = await db.pool.query<{ id: string; seq: number; workspace_seq: number }>(
      'SELECT id, seq, workspace_seq FROM events WHERE workspace_id = $1 ORDER BY workspace_seq',
      [workspaceId],
    );
    expect(stream.rows.map((row) => [row.id, row.workspace_seq])).toEqual([
      [workspaceCreated.id, 1],
      [renamed.id, 2],
    ]);
    // Cursors are per workspace, so a second workspace starts at 1 again —
    // and never appears in this workspace's stream.
    const other = await db.pool.query<{ workspace_seq: number }>(
      'SELECT workspace_seq FROM events WHERE workspace_id = $1',
      [otherWorkspace.workspaceId],
    );
    expect(other.rows.map((row) => row.workspace_seq)).toEqual([1]);
  });

  it('onEventCommitted hands the listener the cursor the stream resumes by', async () => {
    const ingest = service();
    const cursors: number[] = [];
    ingest.onEventCommitted((event) => cursors.push(event.workspaceSeq));
    const base = submittedWorkspaceCreated();
    await ingest.ingestBatch([base]);
    await ingest.ingestBatch([{ ...base, id: newUlid(), type: 'workspace.renamed', payload: { name: 'CC HQ' } }]);
    expect(cursors).toEqual([1, 2]);
  });

  it('planted defect: concurrent ingests to different entities never mint a cursor twice', async () => {
    const ingest = service();
    const anchor = submittedWorkspaceCreated();
    const workspaceId = anchor.workspaceId;
    // Four DIFFERENT entities in one workspace: the per-entity lock cannot
    // serialise them, so only the per-workspace lock keeps the cursor unique.
    // Without it all four read the same max(workspace_seq) and
    // events_workspace_seq_unique refuses the losers.
    //
    // The three companions are workflows rather than the workspace.created
    // events against project/ticket/membership entities this test used to
    // send: an event type is now bound to the kind it is about, so those three
    // are refused at the door and would never reach the lock this test is
    // about. Distinct (kind, id) pairs are the only property that matters here.
    const racers = [
      anchor,
      submittedWorkflowDefined(workspaceId),
      submittedWorkflowDefined(workspaceId),
      submittedWorkflowDefined(workspaceId),
    ];
    const results = await Promise.all(racers.map((event) => ingest.ingestBatch([event])));
    expect(results.flat().filter((result) => result.status === 'committed')).toHaveLength(4);
    const cursors = await db.pool.query<{ workspace_seq: number }>(
      'SELECT workspace_seq FROM events WHERE workspace_id = $1 ORDER BY workspace_seq',
      [workspaceId],
    );
    expect(cursors.rows.map((row) => row.workspace_seq)).toEqual([1, 2, 3, 4]);
  });
});
