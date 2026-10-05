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

/**
 * 3.19 — cited on the block: `proj_entity_heads` tracks the newest event per entity, a STALE replayed apply cannot regress a head, and a rebuild derives the same heads from the raw ledger.
 */
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

  /**
   * A SECOND copy of the registration pin. test/projection-order.test.ts is the
   * pin of record — it asserts the same list plus the §8 ordering rationale and
   * is deliberately DB-free, where this one sits in a file that needs Postgres
   * and so goes silent exactly when the database is down. Both must be extended
   * in the same commit that registers a projection; a registrant who finds only
   * one of them will be told about the other by a red suite, which is the only
   * reason this duplicate is tolerable.
   */
  it('buildProjectionRegistry registers exactly the known projections', () => {
    const registry = buildProjectionRegistry();
    expect(registry.all().map((projection) => projection.name)).toEqual([
      'proj_entity_heads',
      'proj_workflows',
      // Plan 3 Chain B Task 9, INSERTED at its §8 position (third) — above
      // proj_projects, which was directly under proj_workflows only while this
      // position was empty. See test/projection-order.test.ts, the pin of
      // record.
      'proj_ticket_types',
      // Plan 4 Task 9 Step 3b, INSERTED at its §8 position (fourth) rather
      // than appended.
      'proj_projects',
      // Prefixes and groups Task 6: the group tree, directly after proj_projects.
      'proj_groups',
      // Plan 3 Chain B Task 10, §8 position 5 — INSERTED between proj_projects
      // and proj_memberships.
      'proj_tickets',
      // Plan 3 Chain B Task 11, §8 position 6 — directly after proj_tickets,
      // whose rows it reads inside the same transaction, and still ABOVE
      // proj_memberships.
      'proj_rollups',
      // Typed links T2, directly under the proj_tickets/proj_rollups pair. See test/projection-order.test.ts.
      'proj_ticket_links',
      'proj_memberships',
      // Plan 4 Task 14, §8 amended to slot it directly after proj_memberships,
      // so it too INSERTS rather than appends. This copy of the pin is exactly
      // what the docblock above promised: the registrant found the other one
      // first and was told about this one by a red suite.
      'proj_invites',
      'proj_visibility',
      // The notes series, Plan 1 of 6. INSERTED, not appended, because the notes
      // design doc §6.2 names this position ("after `proj_visibility` and
      // `proj_tickets`"). No adjacency is load-bearing at this commit —
      // `notesProjection.apply` reads only its own two tables and none is read
      // inside an ingest transaction by another projection — so this row follows
      // the spec's order rather than discharging a dependency. See
      // projection-order.test.ts, the pin of record.
      'proj_notes',
      // The trash series, Plan 1. INSERTED directly below `proj_notes`, for the
      // reason projection-order.test.ts (the pin of record) gives: every row a
      // mark can name already exists by this position. This copy of the pin did
      // its job again — the registrant found the other one first and was told
      // about this one by a red suite.
      'proj_lifecycle',
      // The notes series, Plan 3 of 6 (search). INSERTED directly below
      // `proj_notes`, and this entry is the first to make the note above it
      // load-bearing rather than spec-followed: `proj_note_search.apply` reads
      // proj_notes, proj_note_attachments, proj_tickets and proj_projects. See
      // projection-order.test.ts, the pin of record.
      'proj_note_search',
      'proj_contested',
      // Plan 5 Task 4. APPENDED, and NOT at a §8 position: §8's order ends at
      // proj_visibility and proj_contested already sits past it, so there is no
      // slot to insert into and "after proj_visibility" no longer names one.
      // The append is decided by dependency instead — this projection reads no
      // other projection's table, and none reads its table inside an ingest
      // transaction. And this copy of the pin did its job again: the registrant
      // extended projection-order.test.ts, the pin of record, and was told
      // about this one by a red suite.
      'proj_workspace_settings',
      // Plan 5 Task 6. APPENDED, and NOT at a §8 position, for the same reason
      // as the entry above. See projection-order.test.ts, the pin of record,
      // for why this projection's existing READ-TIME reader
      // (`compile-filter.ts`'s text clause) is not an adjacency.
      'proj_search',
      // Executor 2's comment-thread dispatch, 2026-09-21. APPENDED, and NOT at
      // a §8 position, for the third time and the same reason — and this copy
      // of the pin did its job a third time: the registrant extended
      // projection-order.test.ts, the pin of record, and the red suite told
      // them about this one.
      'proj_ticket_comments',
      // Knowledge Graph B: appended, as projection-order.test.ts pins.
      'proj_references',
      // Knowledge Graph D Task 3: appended, as projection-order.test.ts pins.
      'proj_concepts',
    ]);
  });
});
