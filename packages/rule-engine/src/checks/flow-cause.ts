import {
  BACKLOG_STATE_ID,
  isFlowCause,
  stateCategoryOf,
  SYSTEM_ACTOR_FLOW,
  type EventEnvelope,
  type Transition,
  type WorkflowDef,
  type WorkflowState,
} from '@gisik-nokma/domain';
import type { Refusal } from '../engine.js';
import { refuse } from './refusals.js';

/**
 * The flow causes (wtg2 T8, spec AP-2 and PS-11) are the one `cause` the engine reads. `led-to`, `reopened-by-flow` and
 * `branch-not-taken` (`@gisik-nokma/domain` `flow/causes.ts`) are written only by the reserved flow actor, and two of them
 * unlock moves no workflow declares, so a person must never be able to type one. Nothing accepts an actor id from a
 * client (`system-actors.ts`; the ingest door stamps the actor), which is what makes `env.actorId` the test.
 */

/**
 * A flow cause on an event filed by anyone but the flow actor. Runs FIRST at the three doors (`transition.ts`, and
 * `checkTicketClosed` / `checkTicketReopened` in `close.ts`), right after the payload parses: a forged cause must hear
 * "forged", not whatever else its move would earn (29.203).
 */
export function flowCauseForgery(env: EventEnvelope, cause: unknown): Refusal | null {
  return isFlowCause(cause) && env.actorId !== SYSTEM_ACTOR_FLOW ? refuse('cause.forged') : null;
}

/**
 * PS-11. The one-off, rules-less edge the flow's two undeclared moves ride; null for anything else: a person, a missing
 * cause, `led-to` (provenance only), or a move of the wrong shape.
 *
 * - `reopened-by-flow`: to the initial state or `backlog`, from any other state (a loop reset).
 * - `branch-not-taken`: to the FIRST-declared terminal state, from a non-terminal one (spec PS-8 parks "Not taken" there).
 * - Never to the state the ticket is already in (plan departure 11).
 *
 * `transition.ts` asks only after the declared and universal edges found nothing (a declared edge keeps its authored
 * rules), after the closed-ticket refusal and before the parent/child invariants, which no actor can switch off.
 */
export function flowExemptEdge(
  env: EventEnvelope,
  def: WorkflowDef,
  fromStateId: string,
  to: WorkflowState,
  cause: unknown,
): Transition | null {
  if (env.actorId !== SYSTEM_ACTOR_FLOW || !isFlowCause(cause) || fromStateId === to.id) return null;
  if (cause.kind === 'reopened-by-flow') {
    return to.id === def.initialStateId || to.id === BACKLOG_STATE_ID ? { from: fromStateId, to: to.id, rules: [] } : null;
  }
  if (cause.kind === 'branch-not-taken') {
    // `stateCategoryOf(def, 'backlog')` is `open`, so a ticket in Backlog is non-terminal here.
    const firstTerminal = def.states.find((state) => state.category === 'terminal');
    return firstTerminal !== undefined && to.id === firstTerminal.id && stateCategoryOf(def, fromStateId) !== 'terminal'
      ? { from: fromStateId, to: to.id, rules: [] }
      : null;
  }
  return null;
}
