import { entityHeadsProjection } from './entity-heads.js';
import { membershipsProjection } from './proj-memberships.js';
import { projVisibility } from './proj-visibility.js';
import { createProjectionRegistry, type ProjectionRegistry } from './registry.js';
import { workflowsProjection } from './workflows.js';

/**
 * The single wiring point for projections. Server boot, the verify CLI, and
 * tests all call this, so they can never disagree about what is registered.
 * Later plans add their projections here.
 *
 * Registration order IS application order (coordination doc §8), and later
 * plans depend on it, so the pinned order is
 *
 *   proj_entity_heads, proj_workflows, proj_ticket_types, proj_tickets,
 *   proj_rollups, proj_memberships, proj_visibility
 *
 * A NEW REGISTRANT INSERTS AT ITS §8 POSITION — it does not append. This
 * comment used to say "every new registrant appends", which is only true while
 * the registrants happen to arrive in §8 order and stops being true at the
 * first one that does not. Plan 3 Chain B is that one: proj_ticket_types,
 * proj_tickets and proj_rollups all belong ABOVE proj_memberships, which is
 * already registered below. Appending them would put proj_rollups before
 * proj_tickets in application order, and proj_rollups reads proj_tickets inside
 * the same ingest transaction.
 *
 * Whatever the position, extend the order assertion in
 * test/projection-order.test.ts in the same commit.
 */
export function buildProjectionRegistry(): ProjectionRegistry {
  const registry = createProjectionRegistry();
  registry.register(entityHeadsProjection);
  registry.register(workflowsProjection);
  registry.register(membershipsProjection);
  registry.register(projVisibility);
  return registry;
}
