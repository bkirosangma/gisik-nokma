import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid } from '@gisik-nokma/domain';
import { insertEvent } from '../src/ledger/event-store.js';
import { entityHeadsProjection, readEntityHead } from '../src/projections/entity-heads.js';
import { buildProjectionRegistry } from '../src/projections/index.js';
import { rebuildProjection } from '../src/projections/rebuild.js';
import { createTestDatabase, type TestDatabase } from './helpers/db.js';
import { committed, submittedWorkspaceCreated } from './helpers/events.js';

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
});

afterAll(async () => {
  await db.drop();
});

describe('proj_entity_heads', () => {
  it('readEntityHead is null for an entity with no committed events', async () => {
    await expect(readEntityHead(db.pool, 'workspace', newUlid())).resolves.toBeNull();
  });

  it('tracks the newest event per entity as events apply in order', async () => {
    const base = submittedWorkspaceCreated();
    const renameId = newUlid();
    const client = await db.pool.connect();
    try {
      const created = committed(base, 1, '2026-08-20T09:00:01.000Z');
      const renamed = committed(
        { ...base, id: renameId, type: 'workspace.renamed', payload: { name: 'CC HQ' } },
        2,
        '2026-08-20T09:00:02.000Z',
      );
      await insertEvent(client, created);
      await entityHeadsProjection.apply(created, client);
      await insertEvent(client, renamed);
      await entityHeadsProjection.apply(renamed, client);
    } finally {
      client.release();
    }
    await expect(readEntityHead(db.pool, 'workspace', base.entity.id)).resolves.toEqual({
      kind: 'workspace',
      id: base.entity.id,
      workspaceId: base.workspaceId,
      headSeq: 2,
      headEventId: renameId,
      headEventType: 'workspace.renamed',
    });
  });

  it('planted defect: a stale replayed apply cannot regress the head', async () => {
    const base = submittedWorkspaceCreated();
    const client = await db.pool.connect();
    try {
      const first = committed(base, 1);
      const second = committed({ ...base, id: newUlid(), type: 'workspace.renamed', payload: { name: 'X' } }, 2);
      await insertEvent(client, first);
      await insertEvent(client, second);
      await entityHeadsProjection.apply(second, client); // arrives at the projection first
      await entityHeadsProjection.apply(first, client);  // stale apply must not win
    } finally {
      client.release();
    }
    const head = await readEntityHead(db.pool, 'workspace', base.entity.id);
    expect(head?.headSeq).toBe(2);
  });

  it('rebuild derives the same heads from the raw ledger', async () => {
    const registry = buildProjectionRegistry();
    await rebuildProjection('proj_entity_heads', { pool: db.pool, projections: registry });
    const rows = await db.pool.query(
      'SELECT entity_id, head_seq FROM proj_entity_heads ORDER BY entity_id',
    );
    const direct = await db.pool.query(
      `SELECT entity_id, max(seq)::bigint AS head_seq FROM events
       WHERE entity_kind = 'workspace' GROUP BY entity_id ORDER BY entity_id`,
    );
    expect(rows.rows).toEqual(direct.rows);
  });

  it('buildProjectionRegistry registers exactly the known projections', () => {
    const registry = buildProjectionRegistry();
    expect(registry.all().map((projection) => projection.name)).toEqual([
      'proj_entity_heads',
      'proj_workflows',
    ]);
  });
});
