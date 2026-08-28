import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { evaluateEvent } from '@gisik-nokma/rule-engine';
import { createIngestService } from '../src/ingest/ingest-service.js';
import { buildProjectionRegistry } from '../src/projections/index.js';
import { formatReport, verifyProjections } from '../src/tools/verify-projections.js';
import { createTestDatabase, type TestDatabase } from './helpers/db.js';
import { submittedWorkflowDefined, submittedWorkspaceCreated } from './helpers/events.js';

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
  const ingest = createIngestService({
    pool: db.pool,
    evaluate: evaluateEvent,
    projections: buildProjectionRegistry(),
  });
  const home = submittedWorkspaceCreated();
  const results = await ingest.ingestBatch([
    home,
    submittedWorkspaceCreated(),
    // A workflow, so proj_workflows is not verified empty. Its definition
    // column is jsonb and not json exactly so the shadow-rebuild diff can
    // compare rows at all — json has no equality operator, and a projection
    // the verifier only ever meets with zero rows would never have said so.
    submittedWorkflowDefined(home.workspaceId),
  ]);
  if (results.some((result) => result.status !== 'committed')) {
    throw new Error('seeding failed — verifier tests need an honest baseline');
  }
});

afterAll(async () => {
  await db.drop();
});

async function shadowSchemaExists(): Promise<boolean> {
  const result = await db.pool.query(
    "SELECT count(*)::int AS n FROM pg_namespace WHERE nspname = 'verify_shadow'",
  );
  return result.rows[0].n > 0;
}

describe('verifyProjections', () => {
  it('reports clean when live projections match their rebuild, and drops its shadow schema', async () => {
    const report = await verifyProjections({ pool: db.pool, projections: buildProjectionRegistry() });
    expect(report).toEqual({ clean: true, diffs: [] });
    await expect(shadowSchemaExists()).resolves.toBe(false);
  });

  it('planted defect: a corrupted live row is reported with the table named and both directions counted', async () => {
    const victim = await db.pool.query('SELECT entity_id FROM proj_entity_heads LIMIT 1');
    const entityId: string = victim.rows[0].entity_id;
    await db.pool.query('UPDATE proj_entity_heads SET head_seq = 999 WHERE entity_id = $1', [entityId]);

    const report = await verifyProjections({ pool: db.pool, projections: buildProjectionRegistry() });
    expect(report.clean).toBe(false);
    expect(report.diffs).toHaveLength(1);
    expect(report.diffs[0]).toMatchObject({
      table: 'proj_entity_heads',
      missingFromLive: 1, // the honest row the ledger derives
      extraInLive: 1,     // the corrupted row live holds
    });
    expect(report.diffs[0]?.samples.join('\n')).toContain('999');
    await expect(shadowSchemaExists()).resolves.toBe(false);

    // Repair via rebuild, then verify is clean again — the loop closes.
    const { rebuildProjection } = await import('../src/projections/rebuild.js');
    await rebuildProjection('proj_entity_heads', {
      pool: db.pool,
      projections: buildProjectionRegistry(),
    });
    const repaired = await verifyProjections({ pool: db.pool, projections: buildProjectionRegistry() });
    expect(repaired.clean).toBe(true);
  });

  it('planted defect: a deleted live row is one missing, zero extra', async () => {
    const victim = await db.pool.query('SELECT entity_id FROM proj_entity_heads LIMIT 1');
    const entityId: string = victim.rows[0].entity_id;
    await db.pool.query('DELETE FROM proj_entity_heads WHERE entity_id = $1', [entityId]);

    const report = await verifyProjections({ pool: db.pool, projections: buildProjectionRegistry() });
    expect(report.clean).toBe(false);
    expect(report.diffs[0]).toMatchObject({ table: 'proj_entity_heads', missingFromLive: 1, extraInLive: 0 });

    const { rebuildProjection } = await import('../src/projections/rebuild.js');
    await rebuildProjection('proj_entity_heads', {
      pool: db.pool,
      projections: buildProjectionRegistry(),
    });
  });
});

describe('formatReport', () => {
  it('says clean plainly', () => {
    expect(formatReport({ clean: true, diffs: [] })).toBe(
      'verify-projections: clean — every projection matches its rebuild from the ledger',
    );
  });

  it('names each drifted table with counts and samples', () => {
    const text = formatReport({
      clean: false,
      diffs: [
        {
          table: 'proj_entity_heads',
          missingFromLive: 1,
          extraInLive: 1,
          samples: ['missing from live: {"head_seq":2}', 'extra in live: {"head_seq":999}'],
        },
      ],
    });
    expect(text).toContain('DRIFT DETECTED');
    expect(text).toContain('proj_entity_heads: 1 row(s) missing from live, 1 extra in live');
    expect(text).toContain('extra in live: {"head_seq":999}');
  });
});
