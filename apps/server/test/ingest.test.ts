import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid, type EntityHead, type EventEnvelope } from '@gisik-nokma/domain';
import { evaluateEvent } from '@gisik-nokma/rule-engine';
import { createIngestService } from '../src/ingest/ingest-service.js';
import { buildProjectionRegistry } from '../src/projections/index.js';
import { createTestDatabase, type TestDatabase } from './helpers/db.js';
import { submittedWorkspaceCreated } from './helpers/events.js';

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

  it('applies projections in the same transaction as the event', async () => {
    const event = submittedWorkspaceCreated();
    await service().ingestBatch([event]);
    const head = await db.pool.query(
      'SELECT head_seq, head_event_id FROM proj_entity_heads WHERE entity_kind = $1 AND entity_id = $2',
      ['workspace', event.entity.id],
    );
    expect(head.rows).toEqual([{ head_seq: 1, head_event_id: event.id }]);
  });

  it('the engine sees the world as of the previous event — not the one under evaluation', async () => {
    const observed: Array<number | null> = [];
    const peeking: typeof evaluateEvent = async (env, ctx) => {
      // Plan-1 seam: the context answers with the head pointer; the narrowing dies with the cast in engine-context.ts.
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
    ingest.onEventCommitted((event) => seen.push(event));

    const valid = submittedWorkspaceCreated();
    const invalid = { ...submittedWorkspaceCreated(), type: 'shop.opened' };
    await ingest.ingestBatch([valid, invalid]);

    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ id: valid.id, seq: 1, type: 'workspace.created' });
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
    const racers = [
      anchor,
      submittedWorkspaceCreated({ workspaceId, entity: { kind: 'project', id: newUlid() } }),
      submittedWorkspaceCreated({ workspaceId, entity: { kind: 'ticket', id: newUlid() } }),
      submittedWorkspaceCreated({ workspaceId, entity: { kind: 'membership', id: newUlid() } }),
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
