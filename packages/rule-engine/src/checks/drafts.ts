import type { EventEnvelope } from '@gisik-nokma/domain';
import {
  DRAFT_GATE_EXEMPT_EVENT_TYPES,
  draftAllows,
  draftNotAllowedReason,
  ticketDiscardedPayload,
  ticketPublishedPayload,
} from '@gisik-nokma/domain';
import type { Accept, EngineContext, Refusal } from '../engine.js';
import { REFUSAL_RULES, malformedPayloadDetail } from '../refusal-rules.js';
import { getTicketState, getTicketTypeDef } from './context-helpers.js';
import { checkParentPlacement } from './hierarchy.js';
import { ACCEPT, refuse } from './refusals.js';

/**
 * The rule id an event outside the author's allowlist is refused with (drafts spec R7). The permission gate
 * (`apps/server/src/permissions/check-permission.ts`, G1) spells the same string; a parity case (28.090) fails if
 * the two drift, because the client precheck and the server must tell a person the same thing.
 */
export const DRAFT_NOT_ALLOWED_RULE = 'draft.not-allowed';

const EXEMPT: ReadonlySet<string> = new Set(DRAFT_GATE_EXEMPT_EVENT_TYPES);

/**
 * THE DRAFT GATE (drafts spec R6, R7, R12), the engine's twin of G1. It runs in `evaluateEvent` right after the
 * live-ticket gate and before the per-type dispatch, for the reason that gate gives: most of the types it refuses
 * have no dispatch arm at all, so a guard inside one check could not have reached them.
 *
 * It reads the ticket's state and nothing about the ACTOR: who may do what to a draft is the permission gate's
 * (a non-author is answered as for an unknown ticket before the engine runs), exactly as `checks/deletion.ts`
 * leaves the authority half of a delete to `checkVisibilityPermission`. The gate exists because the fixture suite,
 * the client precheck and the offline replica enter at `evaluateEvent` and never pass G1.
 *
 * - a ticket that does not resolve, or is not a draft: not this gate's business (ACCEPT);
 * - the exempt bookkeeping types (the birth, the contest pair, the purge types): not judged, even on a discarded
 *   draft, so an offline edit that met the erasure can still be recorded as refused;
 * - a DISCARDED draft: `ticket.unknown`, because it is gone between the commit and the erasure (R12);
 * - any other type outside the allowlist: `draft.not-allowed` with the sentence that names the way out (R7).
 */
export async function checkTicketDraftGate(env: EventEnvelope, ctx: EngineContext): Promise<Accept | Refusal> {
  if (env.entity.kind !== 'ticket') return ACCEPT;
  if (EXEMPT.has(env.type)) return ACCEPT;
  const ticket = await getTicketState(ctx, env.entity.id);
  if (ticket === null || ticket.draft === undefined) return ACCEPT;
  if (ticket.draft.discarded === true) return refuse('ticket.unknown');
  if (!draftAllows(env.type)) return refuse(DRAFT_NOT_ALLOWED_RULE, draftNotAllowedReason(env.type));
  return ACCEPT;
}

/**
 * `ticket.published` (drafts spec R10 to R12): the ticket is a draft, the payload names its project, and the
 * creation checks still hold against the world as it is now. Order, most fundamental first: not a draft, wrong
 * project, type, workflow, then the placement (`checkParentPlacement`, the very function `ticket.created` ends
 * with; a parent that is still a draft is `draft.parent-unpublished`). A DISCARDED draft never gets this far: the
 * gate above answered `ticket.unknown`.
 *
 * Who publishes is not asked here (R13: the author alone); G1 answers anyone else as for an unknown ticket.
 */
export async function checkTicketPublished(env: EventEnvelope, ctx: EngineContext): Promise<Accept | Refusal> {
  if (env.type !== 'ticket.published') return ACCEPT;
  if (env.entity.kind !== 'ticket') {
    return refuse(
      REFUSAL_RULES.malformedPayload,
      `This ticket.published event does not point at a ticket; it points at a ${env.entity.kind}.`,
    );
  }
  const parsed = ticketPublishedPayload.safeParse(env.payload);
  if (!parsed.success) {
    return refuse(
      REFUSAL_RULES.malformedPayload,
      `This ticket.published event's payload is malformed: ${malformedPayloadDetail(parsed.error)}`,
    );
  }
  const ticket = await getTicketState(ctx, env.entity.id);
  if (ticket === null) return refuse('ticket.unknown');
  if (ticket.draft === undefined) return refuse('draft.not-a-draft');
  if (parsed.data.projectId !== ticket.projectId) return refuse('draft.project-mismatch');
  const type = await getTicketTypeDef(ctx, env, ticket.typeId);
  if (!type) return refuse('ticket.unknown-type');
  const workflow = await ctx.getWorkflowDef(env, type.workflowId);
  if (!workflow) return refuse('ticket.workflow-undefined');
  return checkParentPlacement(env, ctx, {
    parentId: ticket.parentId,
    projectId: ticket.projectId,
    type,
    placed: 'publishing',
  });
}

/** `ticket.discarded` (drafts spec R15): the ticket is a draft. The erasure itself is the server's (`apps/server/src/purge/discard-draft.ts`). */
export async function checkTicketDiscarded(env: EventEnvelope, ctx: EngineContext): Promise<Accept | Refusal> {
  if (env.type !== 'ticket.discarded') return ACCEPT;
  if (env.entity.kind !== 'ticket') {
    return refuse(
      REFUSAL_RULES.malformedPayload,
      `This ticket.discarded event does not point at a ticket; it points at a ${env.entity.kind}.`,
    );
  }
  const parsed = ticketDiscardedPayload.safeParse(env.payload);
  if (!parsed.success) {
    return refuse(
      REFUSAL_RULES.malformedPayload,
      `This ticket.discarded event's payload is malformed: ${malformedPayloadDetail(parsed.error)}`,
    );
  }
  const ticket = await getTicketState(ctx, env.entity.id);
  if (ticket === null) return refuse('ticket.unknown');
  if (ticket.draft === undefined) return refuse('draft.not-a-draft');
  return ACCEPT;
}
