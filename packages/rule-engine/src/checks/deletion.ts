import type { EventEnvelope } from '@gisik-nokma/domain';
import { ticketDeletedPayload, ticketRestoredPayload } from '@gisik-nokma/domain';
import type { Accept, EngineContext, Refusal } from '../engine.js';
import { REFUSAL_RULES, malformedPayloadDetail } from '../refusal-rules.js';
import { getTicketState } from './context-helpers.js';
import { ACCEPT, refuse } from './refusals.js';

/**
 * The soft-delete pair's two doors — the product's `Delete` and its undo.
 *
 * A ticket delete is a HISTORY-RETAINING REMOVAL WITH UNDO, not an erasure. The
 * product's own FAQ states these semantics before this pair existed
 * (`design-system/interactive/desktop.dc.html`, the `faq-delete` entry):
 *
 * > "The ticket stops appearing in views. Its history is retained, because other
 * > events cite it — a comment, a block, a workflow version."
 * > "This is why the product says \"deleted\" rather than \"erased\"."
 *
 * That is why this file is a near-copy of `close.ts` and not of a destruction
 * path: the whole vocabulary is append-only, so the only delete this product can
 * have is a flag on head state, and the only undo is an event that clears it.
 *
 * ## What this door does NOT police, and who does
 *
 * AUTHORIZATION is not here. "Only a project admin can delete a ticket" is
 * `checkVisibilityPermission`'s sixth check
 * (`apps/server/src/permissions/check-permission.ts`), because authority is
 * resolved from membership and is not a pure function of the envelope — this
 * engine's context carries no membership at all. A fixture or the offline
 * replica that enters through `evaluateEvent` therefore does NOT re-check it,
 * exactly as it does not re-check `visibility.set`'s authority gate. The doors
 * here are the ones that ARE pure facts about the ticket's own head state.
 *
 * ## Same shape as every other check
 *
 * The `env.entity.kind` guard names the kind it actually points at rather than
 * accepting silently (`close.ts` records the fix-round review that got this
 * backwards once); the `env.type` check ahead of it is this file's own addition
 * because two handlers share one file, and a mismatch there is a stranger's
 * event — accepted exactly as `evaluateEvent`'s dispatch guarantees.
 */
export async function checkTicketDeleted(env: EventEnvelope, ctx: EngineContext): Promise<Accept | Refusal> {
  if (env.type !== 'ticket.deleted') return ACCEPT;
  if (env.entity.kind !== 'ticket') {
    return refuse(REFUSAL_RULES.malformedPayload,
      `This ticket.deleted event does not point at a ticket; it points at a ${env.entity.kind}.`);
  }
  const parsed = ticketDeletedPayload.safeParse(env.payload);
  if (!parsed.success) {
    return refuse(REFUSAL_RULES.malformedPayload,
      `This ticket.deleted event's payload is malformed: ${malformedPayloadDetail(parsed.error)}`);
  }
  const ticket = await getTicketState(ctx, env.entity.id);
  if (ticket === null) return refuse(REFUSAL_RULES.unknownTicket, `This event deletes ticket ${env.entity.id}, but no such ticket is known.`);
  // The guard is LOAD-BEARING, and it is not the same kind of guard as
  // `alreadyClosed`. The reducer writes `deleted: { actorId: env.actorId, at:
  // env.serverTime }` from the ENVELOPE, so a second `ticket.deleted` on an
  // already-deleted ticket would not be idempotent — it would silently
  // OVERWRITE the original deleter's id and instant with the second actor's,
  // and the ledger is append-only by trigger, so the first actor's claim would
  // be unfalsifiable from the projection forever. "Deleted by A on Monday" is
  // the fact the surface renders; without this refusal, deleting again is how
  // you rewrite it.
  if ((ticket.deleted ?? null) !== null) return refuse(REFUSAL_RULES.alreadyDeleted, 'This ticket is already deleted.');
  return ACCEPT;
}

export async function checkTicketRestored(env: EventEnvelope, ctx: EngineContext): Promise<Accept | Refusal> {
  if (env.type !== 'ticket.restored') return ACCEPT;
  if (env.entity.kind !== 'ticket') {
    return refuse(REFUSAL_RULES.malformedPayload,
      `This ticket.restored event does not point at a ticket; it points at a ${env.entity.kind}.`);
  }
  const parsed = ticketRestoredPayload.safeParse(env.payload);
  if (!parsed.success) {
    return refuse(REFUSAL_RULES.malformedPayload,
      `This ticket.restored event's payload is malformed: ${malformedPayloadDetail(parsed.error)}`);
  }
  const ticket = await getTicketState(ctx, env.entity.id);
  if (ticket === null) return refuse(REFUSAL_RULES.unknownTicket, `This event restores ticket ${env.entity.id}, but no such ticket is known.`);
  // The mirror of `notClosed`, and it is what keeps `restored` a real undo
  // rather than a second way to say nothing happened: restoring a ticket nobody
  // deleted would write an event whose only effect is to fold `deleted: null`
  // onto `null`. It would be accepted, attributed, and mean nothing.
  if ((ticket.deleted ?? null) === null) return refuse(REFUSAL_RULES.notDeleted, 'This ticket is not deleted.');
  return ACCEPT;
}
