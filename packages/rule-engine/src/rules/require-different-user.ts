import type { Rule } from '@gisik-nokma/domain';
import { REFUSAL_RULES } from '../refusal-rules.js';
import { resolveStateIdForward } from '../version-map.js';
import type { RuleEvaluator } from './types.js';

/**
 * Four-eyes: the actor must differ from whoever LAST performed the named
 * earlier transition — the approval pairs with the submission it approves.
 *
 * Each log entry's toStateId is written in the vocabulary of the WORKFLOW and
 * VERSION recorded beside it, while the rule names a state in the ticket's
 * current workflow at its LATEST definition. Two guards follow, in this order:
 *
 *  1. Entries from a different workflow are skipped outright. A ticket pins
 *     the workflow it was created under and only an explicit migration
 *     (ticket.workflow_rebound) moves it; stateMapping is keyed inside one
 *     workflow's version chain, so across two graphs there is nothing to walk.
 *     Walking a foreign entry anyway either finds nothing (the rule finds
 *     nobody and one person makes both moves) or matches a state id the two
 *     workflows merely spell alike, refusing someone who did nothing.
 *  2. Surviving entries are walked forward through the same stateMapping chain
 *     the ticket's own state walks (one shared helper, never a second walk)
 *     and the RESULT is compared to the rule's target. Without this, a version
 *     that dropped and remapped the watched state would leave every historical
 *     entry unmatchable, the rule would find nobody, and one person could make
 *     both moves — versioning disarming four-eyes silently.
 *
 * Nobody ever performed the move → vacuously satisfied (creation is not a
 * transition, and neither is a migration). Publishing now refuses a rule
 * watching a state nothing enters, and the builder warns when the guarded move
 * is reachable without the watched one, so what remains here is a semantics the
 * author was told about.
 */
export const evaluateRequireDifferentUser: RuleEvaluator<
  Extract<Rule, { kind: 'require-different-user' }>
> = async (rule, input) => {
  const target = rule.thanActorOf.to;

  let prior: { actorId: string } | undefined;
  for (const entry of input.ticket.transitions) {
    // Guard 1: this entry belongs to a workflow the ticket has left. Its state
    // ids are another graph's vocabulary; there is no chain to walk them along.
    if (entry.workflowId !== input.ticket.workflowId) continue;
    const resolved = await resolveStateIdForward(
      input.ticket.workflowId,
      entry.toStateId,
      entry.workflowVersion,
      input.def,
      input.ctx,
    );
    // An entry that cannot be resolved forward is skipped, and that is not a
    // silent disarm: publishing refuses unmapped drops, so an unresolvable
    // entry only exists in a planted or corrupted store — and in such a store
    // the ticket's own state resolution refuses first, as stranded-state,
    // before any rule runs.
    if (!resolved.ok) continue;
    // Iterating oldest-first and overwriting leaves the LAST match standing.
    if (resolved.stateId === target) prior = entry;
  }

  if (prior === undefined || prior.actorId !== input.env.actorId) return { refused: false };
  return {
    refused: true,
    rule: REFUSAL_RULES.requireDifferentUser,
    reason: `This step needs a second person: ${prior.actorId} already performed the move to "${target}" on this ticket.`,
  };
};
