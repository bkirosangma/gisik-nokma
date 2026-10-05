import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid, type LedgerEvent } from '@gisik-nokma/domain';
import { buildProjectionRegistry } from '../../src/projections/index.js';
import { PURGE_TABLE_RULES } from '../../src/purge/table-rules.js';
import { itemHash, itemKey, signatureOf } from '../../src/semantic/signature.js';
import { verifyProjections } from '../../src/tools/verify-projections.js';
import { applyCommitted, makeCommitted } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { seedNotesFixture, type NotesFixture } from '../helpers/notes-fixture.js';

/**
 * Knowledge Graph spec D §4.1/§4.3 (KG-D Task 5): the suggestion job's database plumbing, cases 27.485 and 27.487–27.490
 * (`test-cases/27-knowledge-graph.md` §27.D). What vectors MEAN is Task 1's (`pipeline.test.ts`, `quality.test.ts`);
 * here every vector is a basis direction written straight into the chunk tables, so the clusters are certain.
 *
 * The world is `seedNotesFixture` (real events through the real projections, so `verifyProjections` agrees), and each
 * case seeds its OWN tickets: a ticket with no chunk row is no item of the job, so the fixture's TP and TE and every
 * earlier case's tickets that this case does not re-chunk stay out of its counts (`clearCache` empties the chunk
 * tables and the suggestions between cases).
 */
let db: TestDatabase;
let world: NotesFixture;

function rejection(workspaceId: string, signature: string, itemHashes: string[], actorId: string, origin: LedgerEvent['origin'] = 'mcp'): LedgerEvent {
  return makeCommitted({
    workspaceId,
    actorId,
    origin,
    entity: { kind: 'workspace', id: workspaceId },
    type: 'workspace.concept_suggestion_rejected',
    payload: { signature, itemHashes },
  });
}

beforeAll(async () => {
  db = await createTestDatabase();
  world = await seedNotesFixture(db.pool);
}, 60_000);

afterAll(async () => {
  await db.drop();
});

describe('27.485 the rejection projection and the three tables', () => {
  it('27.485 the three tables have their purge rules; a rejection lands with its actor, hashes and origin; control: verifyProjections agrees', async () => {
    expect(PURGE_TABLE_RULES['sem_suggestions']).toMatchObject({ rule: 'rederive', by: ['workspace_id'] });
    expect(PURGE_TABLE_RULES['proj_concept_rejections']).toMatchObject({ rule: 'erase', by: ['workspace_id'] });
    expect(PURGE_TABLE_RULES['sem_job_state']).toMatchObject({ rule: 'erase', by: ['workspace_id'] });

    const keys = [newUlid(), newUlid(), newUlid()].map((id) => itemKey('ticket', id));
    const hashes = keys.map(itemHash);
    const event = rejection(world.WS, signatureOf(keys), hashes, world.ids.memberIn);
    await applyCommitted(db.pool, [event]);
    const { rows } = await db.pool.query<{ signature: string; item_hashes: string[]; rejected_by: string; rejected_at: Date; origin: string }>(
      'SELECT signature, item_hashes, rejected_by, rejected_at, origin FROM proj_concept_rejections WHERE workspace_id = $1',
      [world.WS],
    );
    expect(rows).toEqual([
      { signature: signatureOf(keys), item_hashes: hashes, rejected_by: world.ids.memberIn, rejected_at: new Date(event.serverTime), origin: 'mcp' },
    ]);
    // A replay that wrote another `rejected_at` (or skipped the row) would differ from live.
    expect(await verifyProjections({ pool: db.pool, projections: buildProjectionRegistry() })).toEqual({ clean: true, diffs: [] });
  });
});
