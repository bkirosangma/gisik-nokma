import type { PublishedWorkflowDef } from '@gisik-nokma/domain';
import type { Queryable } from '../db/queryable.js';
import { getWorkflowDefFromProjection } from '../projections/workflows.js';

/**
 * The latest published definition per workflow id, within ONE workspace.
 *
 * The plan text's signature was `(db, workflowIds)` with no workspace, and that
 * does not merely fail to compile against the shipped reader — it would be a
 * tenancy hole if it did. `getWorkflowDefFromProjection` takes a `workspaceId`
 * as of Plan 3 Task 12, precisely so an actor-supplied workflow id cannot
 * resolve out of a neighbouring tenancy (controller ruling P14). Callers thread
 * it from the ticket rows they already hold.
 *
 * Unknown ids — and ids belonging to another workspace, which is the same thing
 * from here — are ABSENT from the map rather than mapped to null. A caller that
 * needs to distinguish "no such workflow" from "a workflow with no states" gets
 * that distinction from `has` versus a def whose `states` is empty; collapsing
 * them into a null value would make the two indistinguishable at the one place
 * a board decides whether to render a column at all.
 *
 * Ids are de-duplicated and sorted so the query order is a function of the
 * input SET rather than of the row order a caller happened to pass.
 */
export async function latestWorkflowDefs(
  db: Queryable,
  workspaceId: string,
  workflowIds: string[],
): Promise<Map<string, PublishedWorkflowDef>> {
  const defs = new Map<string, PublishedWorkflowDef>();
  for (const workflowId of [...new Set(workflowIds)].sort()) {
    const def = await getWorkflowDefFromProjection(db, workspaceId, workflowId);
    if (def !== null) {
      defs.set(workflowId, def);
    }
  }
  return defs;
}

/**
 * `` `${workflowId}:${stateId}` `` for every state carrying amendment 9's
 * `blocked` flag.
 *
 * The key is COMPOSITE because a state id is only unique within its workflow —
 * two workflows may both have a `waiting`, and only one of them may have
 * flagged it. A set of bare state ids would let one workflow's decision leak
 * onto another's board column.
 *
 * `blocked` is read straight off the state: `workflowStateSchema` declares it
 * (`blocked: z.boolean().optional()`), so the plan text's
 * `(state as { blocked?: boolean })` cast is removed rather than carried — a
 * cast there would hide the day the field's type changes underneath this.
 *
 * `blocked` is NOT `category === 'active'`, and nothing here derives one from
 * the other: the flag is additive and orthogonal (the seeded `waiting` state is
 * `active` AND blocked, while `doing` is `active` and not).
 */
export function blockedStateKeys(defs: Map<string, PublishedWorkflowDef>): Set<string> {
  const keys = new Set<string>();
  for (const [workflowId, def] of defs) {
    for (const state of def.states) {
      if (state.blocked === true) {
        keys.add(`${workflowId}:${state.id}`);
      }
    }
  }
  return keys;
}
