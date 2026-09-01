import { describe, expect, it } from 'vitest';
import { buildProjectionRegistry } from '../src/projections/index.js';

/**
 * Registration order IS application order (coordination doc §8): the registry
 * applies projections in insertion order inside each ingest transaction, and
 * later plans depend on the pinned order
 *
 *   proj_entity_heads, proj_workflows, proj_ticket_types, proj_projects,
 *   proj_tickets, proj_rollups, proj_memberships, proj_invites,
 *   proj_visibility, proj_contested, proj_workspace_settings
 *
 * because a projection may read a table an earlier one wrote in the same
 * transaction (proj_rollups reads proj_tickets, and since Task 11 that is a
 * shipped dependency rather than a forecast one). A guarantee nothing
 * asserts is a guarantee that drifts on the first re-ordering, so the array
 * below is the pin: EVERY later registrant extends it in the same commit that
 * registers its projection.
 *
 * "Extends" means INSERTS AT ITS §8 POSITION, not appends. Plan 4 Task 9's
 * proj_projects was the first registrant to prove that rule rather than state
 * it: §8 puts it fourth, and it went in BETWEEN proj_workflows and
 * proj_memberships, both assertions below moving with it. Plan 3 Chain B Task
 * 9's proj_ticket_types is the second, and the first to insert ABOVE an entry
 * that inserted before it — §8 position 3, so proj_projects moved down one.
 * Chain B Task 10's proj_tickets is the third, and the first to insert into
 * the MIDDLE of the array — §8 position 5, between proj_projects and
 * proj_memberships. Chain B Task 11's proj_rollups is the fourth: §8 position
 * 6, directly after proj_tickets and BEFORE proj_memberships, not after it.
 * Getting that one wrong would not have been a cosmetic ordering slip — it puts
 * proj_rollups ahead of the proj_tickets rows it reads, in the ingest
 * transaction AND in the verifier's shadow rebuild, which replays projections
 * in this same order into `verify_shadow`.
 *
 * Plan 5 Task 4's proj_workspace_settings is the first registrant for which §8
 * NAMES NO POSITION, and it is extended here on different grounds from every
 * entry above it. §8's canonical order (coordination doc line 51) stops at
 * proj_visibility; proj_contested was appended past its end already. So "after
 * proj_visibility" — the phrase Plan 5 Task 4 uses — no longer picks a unique
 * slot, and the deciding question is dependency instead. Both directions were
 * read before this line was written: the projection's `apply` touches its own
 * table and nothing else, and no registered projection reads
 * proj_workspace_settings inside an ingest transaction (`getWorkspaceSettings`
 * is a READ-TIME function for the attention strip, called by routes, never by a
 * handler). Neither adjacency is load-bearing, so appending is correct — and
 * that is the justification, NOT a §8 position this projection does not have.
 *
 * The rule above is unchanged for anyone §8 does name: insert at your position.
 *
 * Deliberately DB-free — no createTestDatabase, no pool, nothing that could
 * make this ordering contract skippable when Postgres is not running.
 */
describe('projection registration order (coordination §8)', () => {
  it('buildProjectionRegistry registers the pinned order: heads, workflows, ticket types, projects, tickets, rollups, memberships, invites, visibility, contested, workspace settings', () => {
    const registry = buildProjectionRegistry();
    expect(registry.all().map((projection) => projection.name)).toEqual([
      'proj_entity_heads',
      'proj_workflows',
      // Plan 3 Chain B Task 9. §8 position 3, INSERTED ABOVE proj_projects,
      // which had been sitting directly under proj_workflows only because this
      // position was empty.
      'proj_ticket_types',
      // Plan 4 Task 9 Step 3b. §8 position 4, itself INSERTED rather than
      // appended when it landed: the ticket-creation precondition reads it.
      'proj_projects',
      // Plan 3 Chain B Task 10. §8 position 5 — INSERTED between proj_projects
      // and proj_memberships, which is neither end of this array. It must sit
      // BELOW proj_workflows and proj_ticket_types (it resolves a ticket's type
      // and its workflow definition in the same ingest transaction) and ABOVE
      // proj_rollups, which Task 11 inserted directly after it because that
      // projection reads these rows for the same event.
      'proj_tickets',
      // Plan 3 Chain B Task 11. §8 position 6. The adjacency directly under
      // proj_tickets is the only one this entry cannot survive losing, and it
      // is depended on in three places: the ingest transaction, the live
      // projection-outer rebuild, and the verifier's shadow rebuild, which
      // replays projections in THIS order into `verify_shadow` — so the ticket
      // table proj_rollups reads there is complete only because proj_tickets
      // was replayed before it.
      'proj_rollups',
      'proj_memberships',
      // Plan 4 Task 14. §8 amended to slot it directly after proj_memberships,
      // so this INSERTS above proj_visibility rather than appending.
      'proj_invites',
      'proj_visibility',
      // Plan 10 Task 4. §8's order gains one TAIL entry, so appending is its §8
      // position here — a coincidence of where it falls, not an exception to
      // the insert-at-your-position rule above.
      'proj_contested',
      // Plan 5 Task 4. APPENDED, and deliberately not described as a §8
      // position: §8's order ends at proj_visibility and proj_contested already
      // sits past it, so there is no slot to insert into. The append is decided
      // by dependency instead — this projection reads no other projection's
      // table, and none reads its table inside an ingest transaction — which is
      // the same question §8 exists to answer, asked directly.
      'proj_workspace_settings',
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
      ['proj_ticket_types', ['proj_ticket_types']],
      ['proj_projects', ['proj_projects']],
      ['proj_tickets', ['proj_tickets']],
      ['proj_rollups', ['proj_rollups']],
      ['proj_memberships', ['proj_memberships']],
      // ONE table, and `invite_tokens` — created by the same migration — is
      // deliberately not it. See the second assertion in this file.
      ['proj_invites', ['proj_invites']],
      ['proj_visibility', ['proj_visibility']],
      ['proj_contested', ['proj_contested']],
      ['proj_workspace_settings', ['proj_workspace_settings']],
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
