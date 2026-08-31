import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { evaluateEvent } from '@gisik-nokma/rule-engine';
import { createIngestService } from '../src/ingest/ingest-service.js';
import { buildProjectionRegistry } from '../src/projections/index.js';
import { formatReport, verifyProjections } from '../src/tools/verify-projections.js';
import { createTestDatabase, type TestDatabase } from './helpers/db.js';
import { newUlid, type SubmittedEvent } from '@gisik-nokma/domain';
import { buildContestedClaim } from '../src/sync/contest-coherence.js';
import { submittedWorkflowDefined, submittedWorkspaceCreated } from './helpers/events.js';

let db: TestDatabase;

/** A server-origin contest through the internal door — the only door entitled to one. */
function contestedClaim(workspaceId: string): SubmittedEvent {
  return buildContestedClaim({
    originalEvent: {
      id: newUlid(),
      workspaceId,
      entity: { kind: 'ticket', id: newUlid() },
      type: 'ticket.transitioned',
      version: 1,
      // Keys deliberately not in alphabetical order: if jsonb's normalisation
      // ever differed between a live INSERT and a shadow rebuild, this is the
      // shape that would show it.
      payload: { toStateId: 'done', note: 'unsorted keys', assignee: null },
      actorId: newUlid(),
      origin: 'mobile',
      clientTime: '2026-08-20T09:00:00.000Z',
    },
    rule: 'workflow.transition-not-allowed',
    reason: 'That move is not allowed from here.',
    actorId: newUlid(),
  });
}

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
    // A workflow, so proj_workflows is compared with a real row in it rather
    // than empty — an empty table diffs clean without proving that live
    // application and ledger re-derivation produce the same jsonb.
    submittedWorkflowDefined(home.workspaceId),
    // A CONTEST, so proj_contested is compared with a real row in it rather than
    // empty — same reason as the workflow above, and sharper: `original_event`
    // is the repo's FIRST jsonb projection column. The registry contract forbids
    // `json` because it has no equality operator and this verifier diffs with
    // EXCEPT; jsonb HAS one, which is the argument the migration makes. THIS
    // SEED is what turns that argument into an observation — jsonb normalises
    // key order and whitespace on ingest, so a live INSERT and a shadow-schema
    // rebuild have to agree through EXCEPT in both directions, and an empty
    // table would have proven neither. The unique index on original_event_id
    // rides along through `CREATE TABLE … LIKE … INCLUDING ALL`.
    contestedClaim(home.workspaceId),
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
  it('the seed is NON-EMPTY in every table the clean verdict below covers', async () => {
    // A clean verdict over empty tables is the check that cannot fail, and this
    // file's own seed comment says so about proj_workflows. Asserted rather than
    // trusted: if a seed ever stops committing, the verdict below stops meaning
    // anything, and THIS is what says so, naming the table.
    for (const table of ['proj_entity_heads', 'proj_workflows', 'proj_contested']) {
      const { rows } = await db.pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${table}`);
      expect(
        rows[0]?.n,
        `${table} is empty — a clean verdict over it proves nothing`,
      ).toBeGreaterThan(0);
    }
  });

  it('reports clean when live projections match their rebuild, and drops its shadow schema', async () => {
    // proj_contested's jsonb column is diffed here in both directions, which is
    // what earns the migration's claim that jsonb is legal where `json` is not.
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
