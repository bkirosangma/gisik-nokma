import { describe, expect, it } from 'vitest';
import { buildProjectionRegistry } from '../src/projections/index.js';

/**
 * Registration order IS application order (coordination doc §8): the registry
 * applies projections in insertion order inside each ingest transaction, and
 * later plans depend on the pinned order
 *
 *   proj_entity_heads, proj_workflows, proj_ticket_types, proj_tickets,
 *   proj_rollups, proj_memberships, proj_visibility
 *
 * because a projection may read a table an earlier one wrote in the same
 * transaction (Plan 3's proj_rollups reads proj_tickets). A guarantee nothing
 * asserts is a guarantee that drifts on the first re-ordering, so the array
 * below is the pin: EVERY later registrant extends it in the same commit that
 * registers its projection.
 *
 * Deliberately DB-free — no createTestDatabase, no pool, nothing that could
 * make this ordering contract skippable when Postgres is not running.
 */
describe('projection registration order (coordination §8)', () => {
  it('buildProjectionRegistry registers the pinned order, heads before workflows', () => {
    const registry = buildProjectionRegistry();
    expect(registry.all().map((projection) => projection.name)).toEqual([
      'proj_entity_heads',
      'proj_workflows',
    ]);
  });
});
