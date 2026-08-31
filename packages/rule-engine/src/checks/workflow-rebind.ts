import type { EventEnvelope } from '@gisik-nokma/domain';
import { ticketWorkflowReboundPayload } from '@gisik-nokma/domain';
import type { Accept, EngineContext, Refusal } from '../engine.js';
import { REFUSAL_RULES, malformedPayloadDetail } from '../refusal-rules.js';
import { getTicketState } from './context-helpers.js';
import {
  ACCEPT,
  reboundSameWorkflowRefusal,
  reboundUnknownStateRefusal,
  reboundUnknownWorkflowRefusal,
  refuse,
} from './refusals.js';

/**
 * The migration check — `ticket.workflow_rebound`.
 *
 * A ticket pins the workflow it was created under (owner decision 2026-08-26,
 * coordination doc): re-pointing a TYPE's binding changes only what new tickets
 * get, and this event is the deliberate, attributed act that moves an existing
 * one. Its own file, because a workflow migration is not hierarchy.
 *
 * Order: unknown ticket → same workflow → target workflow undefined → target
 * state unknown. Each names its own subject: the ticket, the ticket's current
 * workflow, the workflow the payload names, and that workflow's states.
 *
 * **The payload's destination field genuinely IS `toStateId`** — the one place
 * in this vocabulary where that spelling is correct (`events/ticket-events.ts:158-161`,
 * pre-flight A10 / Verified facts). `ticket.transitioned`'s is `to`. Both
 * spellings are real and neither is "adapted" into the other.
 *
 * Who may EMIT it is Plan 4's to enforce, alongside its other pre-engine
 * permission gates — the event joined `ADMIN_ONLY_TYPES` there (coordination
 * doc, 2026-08-26 wave). A migration re-homes work other people are doing, so
 * it belongs with the admin-gated actions rather than with ordinary ticket
 * edits. Recorded so the ownership is explicit rather than assumed.
 */
export async function checkTicketWorkflowRebound(
  env: EventEnvelope,
  ctx: EngineContext,
): Promise<Accept | Refusal> {
  // Two layers, exactly as the hierarchy checks (pre-flight A19): the fixture
  // suite and Plan 10's offline replica enter at `evaluateEvent` and never pass
  // ingest's door, so this check keeps its own copy of both questions.
  if (env.entity.kind !== 'ticket') {
    return {
      refused: true,
      rule: REFUSAL_RULES.malformedPayload,
      reason: `This ticket.workflow_rebound event does not point at a ticket; it points at a ${env.entity.kind}.`,
    };
  }

  const parsed = ticketWorkflowReboundPayload.safeParse(env.payload);
  if (!parsed.success) {
    const detail = malformedPayloadDetail(parsed.error);
    return {
      refused: true,
      rule: REFUSAL_RULES.malformedPayload,
      reason: `This ticket.workflow_rebound event's payload is malformed: ${detail}`,
    };
  }
  const p = parsed.data;

  const ticket = await getTicketState(ctx, env.entity.id);
  if (!ticket) return refuse('ticket.unknown');

  // THE LOAD-BEARING ONE, and not a tidiness rule. This event sets `stateId`
  // directly: it performs no transition-legality check and evaluates no
  // transition rules, because across two unrelated graphs there is no transition
  // to check — the ticket is being placed, not moved. Permit that within a
  // single workflow and it becomes a universal bypass: any actor who can emit it
  // reaches any state without satisfying `restrict-to`, `require-comment`,
  // `require-evidence`, `require-field` or `require-different-user`, and without
  // the move ever appearing in the transition log four-eyes reads (the reducer
  // deliberately appends no entry, `ticket-state.ts:233-240`). Moving inside one
  // workflow already has a mechanism that honours all of those, so there is no
  // case to weigh.
  if (p.toWorkflowId === ticket.workflowId) {
    return refuse('ticket.rebound-same-workflow', reboundSameWorkflowRefusal(ticket.id));
  }

  // The subject is the workflow the PAYLOAD names, not the ticket type's
  // binding — which may be perfectly well defined and is beside the point here.
  // This used to answer `ticket.workflow-undefined` ("This ticket type's
  // workflow has not been defined yet…"), which sent an admin to inspect a
  // binding that was not broken. Controller ruling P13; same defect class as
  // P11 and P12, third instance.
  const target = await ctx.getWorkflowDef(p.toWorkflowId);
  if (!target) return refuse('ticket.rebound-unknown-workflow', reboundUnknownWorkflowRefusal(p.toWorkflowId));

  // "The ledger accepts only what it can later replay" (spec §3): the reducer
  // throws on a rebound whose destination state the target workflow does not
  // have (`ticket-state.ts:229-232`), so an accepted one would be unprojectable.
  if (!target.states.some((state) => state.id === p.toStateId)) {
    return refuse('ticket.rebound-unknown-state', reboundUnknownStateRefusal(target.name, p.toStateId, ticket.id));
  }

  return ACCEPT;
}
