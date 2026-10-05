import type { StateCategory, WorkflowDef } from './workflow.js';
import { BACKLOG_STATE_ID, statesWithBacklog } from './workflow.js';

/**
 * The category a workflow definition gives one of its state ids, or `undefined`
 * when the definition has no such state — including the universal Backlog,
 * category open — spec §1.1.
 *
 * `TicketState.stateCategory` is denormalized from the ticket's workflow so the
 * parent-terminal invariant needs no per-child workflow lookup
 * (`entity-state.ts:13-14`). Denormalized means *derived*, and this is the one
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

/**
 * THE ONE HELPER, USED EVERYWHERE (starting-status design, 2026-09-23): can a
 * NEW ticket be born in this state? Four conditions, all of which must hold:
 * the state exists in `def.states`, it is not the universal Backlog (a
 * backlog ticket has no starting status — spec's own ruling), its category is
 * not `terminal` (a ticket cannot be born finished), and its `creatable` flag
 * is not `false` (absent or `true` both allow it).
 *
 * Every caller that decides whether a ticket may start somewhere — the
 * reducer's `bornIn`, the rule engine's `ticket.created` check, the client
 * precheck, a board column's empty-state Add button, and the New-ticket
 * form's status options — asks THIS function and nothing else, so "can this
 * ticket start here" cannot come to mean five slightly different things
 * across five call sites.
 *
 * Deliberately reads `def.states` rather than `statesWithBacklog(def)`: the
 * backlog exclusion above is answered by the id check, and looking the id up
 * in the authored array is what makes an unknown id (one neither authored nor
 * the universal one) answer `false` rather than throw.
 */
export function isCreatableState(def: WorkflowDef, stateId: string): boolean {
  if (stateId === BACKLOG_STATE_ID) return false;
  const state = def.states.find((candidate) => candidate.id === stateId);
  if (state === undefined) return false;
  if (state.category === 'terminal') return false;
  return state.creatable !== false;
}
