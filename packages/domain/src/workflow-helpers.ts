import type { StateCategory, WorkflowDef } from './workflow.js';
import { statesWithBacklog } from './workflow.js';

/**
 * The category a workflow definition gives one of its state ids, or `undefined`
 * when the definition has no such state — including the universal Backlog,
 * category open — spec §1.1.
 *
 * `TicketState.stateCategory` is denormalized from the ticket's workflow so the
 * parent-terminal invariant needs no per-child workflow lookup
 * (`entity-state.ts:12-13`). Denormalized means *derived*, and this is the one
 * derivation: every place that writes a `stateCategory` — the reducer on
 * creation, on transition and on rebind, and the refresh-on-publish fold — asks
 * this function rather than reaching into `def.states` itself, so a ticket's
 * category cannot come to mean something the workflow does not say.
 *
 * `undefined` rather than a throw: the callers differ on what a missing state
 * means (a broken replay, a corrupt publish, a fold that stranded), and each
 * says so in its own words. A throw here would flatten three faults into one.
 */
export function stateCategoryOf(def: WorkflowDef, stateId: string): StateCategory | undefined {
  return statesWithBacklog(def).find((state) => state.id === stateId)?.category;
}
