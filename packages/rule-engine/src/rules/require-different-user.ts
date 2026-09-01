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
 * Two properties the loop below establishes rather than inherits, each argued
 * at its own line: entries are read in ascending `seq`, not in array order,
 * and an entry that cannot be walked forward REFUSES instead of being skipped.
 * Both were fail-open shapes on Plan 2's branch, both are decisions rather than
 * bug fixes, and both are recorded in the coordination document (Plan 2
 * execution consequences §3 and §4, discharged by Plan 3 Task 4b).
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

  // Ascending `seq`, on a COPY — this ordering is established HERE and is no
  // longer inherited from whoever built the log. `seq` is the per-entity
  // sequence number, so within one ticket's log it is a total order. The field
  // was carried from the start and nothing in the monorepo read it, which left
  // the whole content of four-eyes — the identity of the last person to make
  // this move — resting on a projection's append order. A projection that
  // appended out of order would have inverted latest-wins with no error at all:
  // the wrong person's id compared against the wrong actor, refusing legitimate
  // moves and accepting self-approvals, against a green suite, because every
  // fixture's log is built in order. A COPY because `input.ticket.transitions`
  // is engine input, and a rule that reorders the state it was handed is a
  // defect of its own kind.
  const ordered = [...input.ticket.transitions].sort((a, b) => a.seq - b.seq);

  let prior: { actorId: string } | undefined;
  for (const entry of ordered) {
    // Guard 1: this entry belongs to a workflow the ticket has left. Its state
    // ids are another graph's vocabulary; there is no chain to walk them along.
    // It is skipped BEFORE any resolution is attempted and stays skipped: it is
    // not unreadable, it is correctly out of scope, so it must not reach the
    // refusal below.
    if (entry.workflowId !== input.ticket.workflowId) continue;
    const resolved = await resolveStateIdForward(
      input.env,
      input.ticket.workflowId,
      entry.toStateId,
      entry.workflowVersion,
      input.def,
      input.ctx,
    );
    // An entry that cannot be resolved forward REFUSES the transition. It used
    // to be skipped, under a comment arguing the skip was safe because an
    // unresolvable entry only exists in a corrupted or planted store, and "in
    // such a store the ticket's own state resolution refuses first, as
    // stranded-state, before any rule runs."
    //
    // That precondition is gone. It rested on the ticket's workflowVersion and
    // the entry's workflowVersion coinciding — true of every fixture on Plan 2's
    // branch, and Plan 3's refresh-on-publish is exactly what ends it: a ticket's
    // row is folded to the latest version, and from then on the ticket folds
    // latest→latest as a no-op while an entry recorded under v1 still walks the
    // whole chain. An entry can now strand where the ticket cannot. (Even at
    // equal versions the old claim was only nearly true: the ticket walks the ONE
    // id it currently sits in, so a version that dropped some OTHER state without
    // mapping it strands the entry and not the ticket.) Skipping there leaves
    // `prior` undefined and returns {refused:false} — four-eyes silently
    // disarmed, for a security control, with no diagnostic anywhere. "Only
    // reachable through corruption" is exactly the condition under which a
    // security control should fail CLOSED, and the conservative option is the
    // standing default for a question the plans do not answer.
    //
    // The FIRST unresolvable entry refuses, rather than the loop finishing and
    // refusing at the end: an entry that cannot be read is a fact about the
    // store, and continuing past it to find a resolvable match would let a later
    // entry paper over an unreadable earlier one — the same fail-open wearing a
    // longer loop.
    if (!resolved.ok) {
      return {
        refused: true,
        // The four-eyes id, not a sixth one: the rule vocabulary is closed and
        // versioned, and a client filtering on this rule must see the refusal
        // its rule produced.
        rule: REFUSAL_RULES.requireDifferentUser,
        reason: `This step needs a second person, and this ticket's history cannot be read against its current workflow, so who last performed the move to "${target}" is unknown. Ask an admin to check this workflow's version history.`,
      };
    }
    // Overwriting as we go leaves the LAST match in `seq` order standing.
    if (resolved.stateId === target) prior = entry;
  }

  if (prior === undefined || prior.actorId !== input.env.actorId) return { refused: false };
  return {
    refused: true,
    rule: REFUSAL_RULES.requireDifferentUser,
    reason: `This step needs a second person: ${prior.actorId} already performed the move to "${target}" on this ticket.`,
  };
};
