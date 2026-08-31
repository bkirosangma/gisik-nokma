import { describe, expect, it } from 'vitest';
import { buildProjectionRegistry } from '../src/projections/index.js';

/**
 * Registration order IS application order (coordination doc §8): the registry
 * applies projections in insertion order inside each ingest transaction, and
 * later plans depend on the pinned order
 *
 *   proj_entity_heads, proj_workflows, proj_ticket_types, proj_tickets,
 *   proj_rollups, proj_memberships, proj_visibility, proj_contested
 *
 * because a projection may read a table an earlier one wrote in the same
 * transaction (Plan 3's proj_rollups reads proj_tickets). A guarantee nothing
 * asserts is a guarantee that drifts on the first re-ordering, so the array
 * below is the pin: EVERY later registrant extends it in the same commit that
 * registers its projection.
 *
 * "Extends" means INSERTS AT ITS §8 POSITION, not appends. proj_memberships and
 * proj_visibility are the last two today only because the three §8 entries above
 * them do not exist yet; Plan 3 Chain B's proj_ticket_types, proj_tickets and
 * proj_rollups go BEFORE both, not after. Getting that wrong is not a cosmetic ordering slip — it puts
 * proj_rollups ahead of the proj_tickets rows it reads.
 *
 * Deliberately DB-free — no createTestDatabase, no pool, nothing that could
 * make this ordering contract skippable when Postgres is not running.
 */
describe('projection registration order (coordination §8)', () => {
  it('buildProjectionRegistry registers the pinned order: heads, workflows, memberships, visibility, contested', () => {
    const registry = buildProjectionRegistry();
    expect(registry.all().map((projection) => projection.name)).toEqual([
      'proj_entity_heads',
      'proj_workflows',
      'proj_memberships',
      'proj_visibility',
      // Plan 10 Task 4. §8's order gains one TAIL entry, so appending is its §8
      // position here — a coincidence of where it falls, not an exception to
      // the insert-at-your-position rule above.
      'proj_contested',
    ]);
  });

  /**
   * A projection whose `tables` is empty gets no shadow copy in
   * tools/verify-projections.ts, and under that CLI's `search_path =
   * verify_shadow, public` its unqualified SQL then resolves to the LIVE
   * tables: the reset TRUNCATEs live and the replay writes live. So an omitted
   * `tables` is destructive, not merely unverified — pinned here, in the one
   * projection test that runs without Postgres, so it cannot be lost with the
   * database.
   */
  it('every registered projection declares the tables it writes', () => {
    const registry = buildProjectionRegistry();
    expect(
      registry.all().map((projection) => [projection.name, [...projection.tables]]),
    ).toEqual([
      ['proj_entity_heads', ['proj_entity_heads']],
      ['proj_workflows', ['proj_workflows']],
      ['proj_memberships', ['proj_memberships']],
      ['proj_visibility', ['proj_visibility']],
      ['proj_contested', ['proj_contested']],
    ]);
  });
});
