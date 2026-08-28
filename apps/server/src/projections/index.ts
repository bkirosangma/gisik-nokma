import { entityHeadsProjection } from './entity-heads.js';
import { createProjectionRegistry, type ProjectionRegistry } from './registry.js';
import { workflowsProjection } from './workflows.js';

/**
 * The single wiring point for projections. Server boot, the verify CLI, and
 * tests all call this, so they can never disagree about what is registered.
 * Later plans add their projections here.
 *
 * Registration order IS application order (coordination doc §8), and later
 * plans depend on it — so every new registrant appends, and extends the
 * order assertion in test/projection-order.test.ts in the same commit.
 */
export function buildProjectionRegistry(): ProjectionRegistry {
  const registry = createProjectionRegistry();
  registry.register(entityHeadsProjection);
  registry.register(workflowsProjection);
  return registry;
}
