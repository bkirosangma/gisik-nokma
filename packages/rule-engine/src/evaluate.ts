import type { EventEnvelope } from '@gisik-nokma/domain';
import { evaluateWorkflowDefined } from './workflow-defined.js';
import { evaluateTicketTransitioned } from './transition.js';
import { evaluateClaimContested, evaluateClaimContestedResolved } from './contests.js';
import { checkTicketCreated } from './checks/hierarchy.js';
import type { Accept, EngineContext, Refusal } from './engine.js';

/**
 * The rule engine. Envelope-level checks (shape, unknown event type, ULID,
 * sequencing) belong to ingest (Plan 1) and are NOT repeated here. Plan 2
 * handles workflow.defined and ticket.transitioned; Plan 3 adds the ticket
 * cases; every other event type passes through — later plans add their own.
 *
 * Each case's check carries its OWN `env.entity.kind` guard rather than
 * trusting this dispatch, the two-layer precedent `transition.ts:11-28` set:
 * the fixture suite and Plan 10's offline replica enter here and never pass
 * through ingest's door, so the door's answer is not available to them.
 */
export async function evaluateEvent(env: EventEnvelope, ctx: EngineContext): Promise<Accept | Refusal> {
  switch (env.type) {
    case 'workflow.defined':
      return evaluateWorkflowDefined(env, ctx);
    case 'ticket.transitioned':
      return evaluateTicketTransitioned(env, ctx);
    case 'claim.contested':
      return evaluateClaimContested(env, ctx);
    case 'claim.contested_resolved':
      return evaluateClaimContestedResolved(env, ctx);
    case 'ticket.created':
      return checkTicketCreated(env, ctx);
    default:
      return { refused: false };
  }
}
