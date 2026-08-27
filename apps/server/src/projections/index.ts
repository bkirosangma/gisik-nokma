import { entityHeadsProjection } from './entity-heads.js';
import { createProjectionRegistry, type ProjectionRegistry } from './registry.js';

/**
 * The single wiring point for projections. Server boot, the verify CLI, and
 * tests all call this, so they can never disagree about what is registered.
 * Later plans add their projections here.
 */
export function buildProjectionRegistry(): ProjectionRegistry {
  const registry = createProjectionRegistry();
  registry.register(entityHeadsProjection);
  return registry;
}
