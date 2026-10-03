import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid, type LedgerEvent } from '@gisik-nokma/domain';
import { buildProjectionRegistry } from '../../src/projections/index.js';
import { rebuildProjection } from '../../src/projections/rebuild.js';
import { fetchTicketRows } from '../../src/read/ticket-cards.js';
import { applyCommitted, makeCommitted } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { scenarioUsers, seedReadScenario, type ReadScenario } from '../helpers/read-scenario.js';

/**
 * 13.1227 — the deploy step the spec names: after the reducer learns to write the
 * birth priority, a live `proj_tickets` written by the OLD reducer lacks the claim,
 * and `rebuildProjection('proj_tickets')` is what puts it there. The stale row is
 * manufactured by stripping the key, because the old reducer no longer exists to
 * write one.
 */
describe('13.1227 rebuild:projection puts the birth priority on a stale proj_tickets row', () => {
  let db: TestDatabase;
  let world: ReadScenario;
  beforeAll(async () => {
    db = await createTestDatabase();
    world = await seedReadScenario(db.pool, scenarioUsers());
  });
  afterAll(async () => {
    await db.drop();
  });

  /** A `ticket.created` in the seeded workspace, on its `task` type — mirrors `ticket-cards.test.ts`'s `created`. */
  function created(args: { id: string; actorId: string }): LedgerEvent {
    return makeCommitted({
      workspaceId: world.workspaceId,
      actorId: args.actorId,
      entity: { kind: 'ticket', id: args.id },
      type: 'ticket.created',
      payload: { typeId: 'task', projectId: world.projectId, parentId: null, title: 'Minted ticket' },
    });
  }

  it('a row without the claim gets it back from the ledger, attributed to its creator', async () => {
    const id = newUlid();
    await applyCommitted(db.pool, [created({ id, actorId: world.owner })]);
    await db.pool.query(`UPDATE proj_tickets SET fields = fields - 'priority' WHERE ticket_id = $1`, [id]);
    const before = await fetchTicketRows(db.pool, [id]);
    expect(before[0]?.fields['priority']).toBeUndefined(); // the stale state is real, not assumed

    await rebuildProjection('proj_tickets', { pool: db.pool, projections: buildProjectionRegistry() });

    const after = await fetchTicketRows(db.pool, [id]);
    expect(after[0]?.fields['priority']?.value).toBe('P2');
    expect(after[0]?.fields['priority']?.actorId).toBe(world.owner);
  });
});

describe('27.117 rebuild:projection can reach a managed database', () => {
  it('27.117 a DATABASE_CA_CERT turns TLS on; without one the pool has no ssl (control)', async () => {
    const { toolPool } = await import('../../src/tools/rebuild-projection.js');
    const pem = '-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----';
    const withCa = toolPool('postgres://u:p@localhost:5432/x', { DATABASE_CA_CERT: pem });
    const without = toolPool('postgres://u:p@localhost:5432/x', {});
    expect((withCa as unknown as { options: { ssl?: unknown } }).options.ssl).toBeDefined();
    expect((without as unknown as { options: { ssl?: unknown } }).options.ssl).toBeUndefined();
    await Promise.all([withCa.end(), without.end()]);
  });
});
