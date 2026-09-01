import { describe, expect, it } from 'vitest';
import { buildProjectionRegistry } from '../src/projections/index.js';

/**
 * Registration order IS application order (coordination doc §8): the registry
 * applies projections in insertion order inside each ingest transaction, and
 * later plans depend on the pinned order
 *
 *   proj_entity_heads, proj_workflows, proj_ticket_types, proj_projects,
 *   proj_tickets, proj_rollups, proj_memberships, proj_invites,
 *   proj_visibility, proj_contested
 *
 * because a projection may read a table an earlier one wrote in the same
 * transaction (Plan 3's proj_rollups reads proj_tickets). A guarantee nothing
 * asserts is a guarantee that drifts on the first re-ordering, so the array
 * below is the pin: EVERY later registrant extends it in the same commit that
 * registers its projection.
 *
 * "Extends" means INSERTS AT ITS §8 POSITION, not appends. Plan 4 Task 9's
 * proj_projects is the first registrant to prove that rule rather than state it:
 * §8 puts it fourth, proj_ticket_types (third) does not exist, so it went in
 * BETWEEN proj_workflows and proj_memberships and both assertions below moved
 * with it. Plan 3 Chain B's proj_ticket_types, proj_tickets and proj_rollups go
 * BEFORE proj_memberships too, not after. Getting that wrong is not a cosmetic
 * ordering slip — it puts proj_rollups ahead of the proj_tickets rows it reads.
 *
 * Deliberately DB-free — no createTestDatabase, no pool, nothing that could
 * make this ordering contract skippable when Postgres is not running.
 */
describe('projection registration order (coordination §8)', () => {
  it('buildProjectionRegistry registers the pinned order: heads, workflows, projects, memberships, invites, visibility, contested', () => {
    const registry = buildProjectionRegistry();
    expect(registry.all().map((projection) => projection.name)).toEqual([
      'proj_entity_heads',
      'proj_workflows',
      // Plan 4 Task 9 Step 3b. §8 position 4, INSERTED here rather than
      // appended: the ticket-creation precondition reads it, and every §8 entry
      // between it and proj_memberships is still unbuilt.
      'proj_projects',
      'proj_memberships',
      // Plan 4 Task 14. §8 amended to slot it directly after proj_memberships,
      // so this INSERTS above proj_visibility rather than appending.
      'proj_invites',
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
      ['proj_projects', ['proj_projects']],
      ['proj_memberships', ['proj_memberships']],
      // ONE table, and `invite_tokens` — created by the same migration — is
      // deliberately not it. See the second assertion in this file.
      ['proj_invites', ['proj_invites']],
      ['proj_visibility', ['proj_visibility']],
      ['proj_contested', ['proj_contested']],
    ]);
  });

  /**
   * The MIRROR of the assertion above, and it guards the opposite failure.
   *
   * `1787961600000_proj-invites.sql` creates two tables: `proj_invites`, which
   * is a projection, and `invite_tokens`, which is the server-owned credential
   * store and is NOT rebuildable from the ledger — the invitation token is
   * deliberately absent from the ledger, which is the whole design.
   *
   * An omitted `tables` entry is destructive (the assertion above). A SURPLUS
   * entry is destructive in a different direction: `reset()` empties what
   * `tables` names, so listing `invite_tokens` would make every
   * `rebuildProjection` and every `verify-projections` run delete every live
   * invitation link in the product — and unlike a projection, nothing could put
   * them back, because the ledger does not hold them.
   *
   * Asserted against EVERY registered projection rather than against
   * proj_invites alone: the hazard is that some later projection reaches for
   * the credential store, not that this one does.
   */
  it('no projection claims invite_tokens — the credential store is not rebuildable and reset() must never reach it', () => {
    const registry = buildProjectionRegistry();
    const claimed = registry.all().flatMap((projection) => [...projection.tables]);
    expect(claimed).not.toContain('invite_tokens');
    // The positive control: without it this assertion would also pass on a
    // registry that had stopped declaring any tables at all.
    expect(claimed).toContain('proj_invites');
  });
});
