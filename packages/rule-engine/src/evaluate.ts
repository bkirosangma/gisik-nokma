import type { EventEnvelope } from '@gisik-nokma/domain';
import { evaluateWorkflowDefined } from './workflow-defined.js';
import { evaluateTicketTransitioned } from './transition.js';
import { evaluateClaimContested, evaluateClaimContestedResolved } from './contests.js';
import { checkTicketCreated, checkTicketReparented } from './checks/hierarchy.js';
import { checkTicketFieldSet } from './checks/fields.js';
import { checkTicketTypeDefined } from './checks/ticket-type.js';
import { checkTicketWorkflowRebound } from './checks/workflow-rebind.js';
import { checkTicketClosed, checkTicketReopened } from './checks/close.js';
import { checkTicketRanked } from './checks/rank.js';
import { checkTicketDeleted, checkTicketRestored } from './checks/deletion.js';
import { checkMembershipGranted, checkMembershipRevoked } from './checks/membership.js';
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
    case 'ticket.reparented':
      return checkTicketReparented(env, ctx);
    case 'ticket.field_set':
      return checkTicketFieldSet(env, ctx);
    case 'ticket.workflow_rebound':
      return checkTicketWorkflowRebound(env, ctx);
    case 'ticket-type.defined':
      return checkTicketTypeDefined(env, ctx);
    case 'ticket.closed':
      return checkTicketClosed(env, ctx);
    case 'ticket.reopened':
      return checkTicketReopened(env, ctx);
    case 'ticket.ranked':
      return checkTicketRanked(env, ctx);
    // The soft-delete pair (the product's `Delete` and its undo). Both are
    // purely about the ticket's own head flag, so both are checkable here; the
    // AUTHORITY half is deliberately not — it needs membership, which this
    // context does not carry, and it lives in `checkVisibilityPermission`.
    case 'ticket.deleted':
      return checkTicketDeleted(env, ctx);
    case 'ticket.restored':
      return checkTicketRestored(env, ctx);
    // The last-owner guard (owner ruling 2026-09-18). These two types passed
    // through untouched until this arm existed, which is precisely what let an
    // admin demote the sole owner and promote themselves.
    case 'membership.granted':
      return checkMembershipGranted(env, ctx);
    case 'membership.revoked':
      return checkMembershipRevoked(env, ctx);
    default:
      return { refused: false };
  }
}
