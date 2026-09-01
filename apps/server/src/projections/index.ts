import { projContested } from './contested.js';
import { entityHeadsProjection } from './entity-heads.js';
import { projInvites } from './proj-invites.js';
import { membershipsProjection } from './proj-memberships.js';
import { projProjects } from './proj-projects.js';
import { projVisibility } from './proj-visibility.js';
import { createProjectionRegistry, type ProjectionRegistry } from './registry.js';
import { ticketsProjection } from './tickets.js';
import { ticketTypesProjection } from './ticket-types.js';
import { workflowsProjection } from './workflows.js';

/**
 * The single wiring point for projections. Server boot, the verify CLI, and
 * tests all call this, so they can never disagree about what is registered.
 * Later plans add their projections here.
 *
 * Registration order IS application order (coordination doc §8), and later
 * plans depend on it, so the pinned order is
 *
 *   proj_entity_heads, proj_workflows, proj_ticket_types, proj_projects,
 *   proj_tickets, proj_rollups, proj_memberships, proj_invites,
 *   proj_visibility, proj_contested
 *
 * `proj_projects` is in that list by the owner decision of 2026-08-26 and was
 * MISSING from this comment until Plan 4 Task 9 registered it — coordination
 * doc, "the phrase is this document's own error": what omitted it was the doc
 * comment, not the assertion. §8 is the single source; the comment and the
 * array move together.
 *
 * proj_contested (Plan 10 Task 4) is the one tail entry: §8's order gains it at
 * the END, so appending IS its §8 position. That is a coincidence of where it
 * falls, not an exception to the rule below.
 *
 * A NEW REGISTRANT INSERTS AT ITS §8 POSITION — it does not append. This
 * comment used to say "every new registrant appends", which is only true while
 * the registrants happen to arrive in §8 order and stops being true at the
 * first one that does not. Plan 3 Chain B is that one: proj_ticket_types,
 * proj_tickets and proj_rollups all belong ABOVE proj_memberships, which is
 * already registered below. Appending them would put proj_rollups before
 * proj_tickets in application order, and proj_rollups reads proj_tickets inside
 * the same ingest transaction. Plan 3 Chain B Task 9 is the first of the three
 * to arrive, and it inserted at position 3 — above proj_projects, which had
 * been sitting at position 2 in the array only because position 3 was empty.
 *
 * Whatever the position, extend the order assertion in
 * test/projection-order.test.ts in the same commit.
 */
export function buildProjectionRegistry(): ProjectionRegistry {
  const registry = createProjectionRegistry();
  registry.register(entityHeadsProjection);
  registry.register(workflowsProjection);
  // §8 position 3 (Plan 3 Chain B Task 9). It INSERTS above proj_projects,
  // which had been immediately after proj_workflows only because this position
  // was empty. Nothing registered below reads proj_ticket_types today — Task 12
  // wires the engine context onto it — but proj_tickets (position 5) resolves a
  // ticket's type inside the same ingest transaction, so the ladder is applied
  // before anything that could ask about it.
  registry.register(ticketTypesProjection);
  // §8 position 4.
  registry.register(projProjects);
  // §8 position 5 (Plan 3 Chain B Task 10). It INSERTS above proj_memberships,
  // which has been registered since Plan 4 and sits at position 7. Two
  // adjacencies are load-bearing and neither is with proj_memberships: it must
  // apply AFTER proj_workflows and proj_ticket_types, because it resolves a
  // ticket's type and the workflow definition in force inside the same ingest
  // transaction; and it must apply BEFORE proj_rollups (position 6, Task 11),
  // which reads the rows this projection has just written for the same event.
  registry.register(ticketsProjection);
  registry.register(membershipsProjection);
  // §8 position amended by Plan 4 Task 14: proj_invites slots directly AFTER
  // proj_memberships. Nothing in this task's own path depends on that
  // adjacency — the invite projection reads no other projection's table — but
  // acceptance appends `membership.granted` and `project.member_added` in the
  // same ingest run, and putting the invitation's own status ahead of the
  // roster rows it causes keeps application order matching causal order for
  // anyone reading the two tables inside one transaction.
  registry.register(projInvites);
  registry.register(projVisibility);
  registry.register(projContested);
  return registry;
}
