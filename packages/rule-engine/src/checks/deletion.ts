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

/**
 * The types the live-ticket gate below lets THROUGH on a deleted ticket, each
 * for a reason a reader can check rather than a category a reader has to
 * trust. Everything else filed against `kind: 'ticket'` is gated.
 *
 * - `ticket.deleted` — its own check answers `already-deleted`, which is the
 *   better sentence and the one that protects the first deleter's record.
 * - `ticket.restored` — the undo; it REQUIRES the flag to be set.
 * - `ticket.created` — an id that already resolves is `ticket.already-exists`'s
 *   sentence to say (`checks/hierarchy.ts`), not this gate's.
 * - `claim.contested` / `claim.contested_resolved` — bookkeeping ABOUT a
 *   refusal, filed by the server (`contests.ts`). Refusing them here would make
 *   THIS refusal unrecordable for an offline claimant whose queued edit meets
 *   it, and a resolution settles a contest, not the ticket.
 */
const LIVE_GATE_EXEMPT: ReadonlySet<string> = new Set([
  'ticket.deleted',
  'ticket.restored',
  'ticket.created',
  'claim.contested',
  'claim.contested_resolved',
  // Trash series, Plan 1 (spec §4): `purge.marked` REFUSES a ticket that is
  // NOT deleted ("Delete it first" — Task 4's checkLifecycle), so marking one
  // for permanent deletion is exactly the act this gate would otherwise turn
  // away. `purge.unmarked` is its undo and must reach the same deleted ticket.
  'purge.marked',
  'purge.unmarked',
  // Trash series, Plan 2: `purge.completed` is the tombstone the purge itself
  // appends to an item that is, by definition, deleted. It never reaches the
  // engine through a door (ingest refuses it from anyone, `purge/check-purged.ts`);
  // it is exempt so that no path that does evaluate it turns it away as a write
  // to a deleted ticket.
  'purge.completed',
]);

/**
 * THE LIVE-TICKET GATE (round-2 finding E6-2).
 *
 * INVARIANT, in one sentence: an event filed against a ticket that resolves and
 * whose `deleted` flag is set is refused `deleted-ticket`, unless it is one of
 * the five kinds in `LIVE_GATE_EXEMPT` that are about the deletion itself or
 * its record.
 *
 * Until this check, the product's every READ surface said a deleted ticket
 * "stops appearing in views" while its WRITE doors accepted `ticket.assigned`,
 * `comment.added`, `ticket.transitioned`, `ticket.field_set`,
 * `ticket.collaborator_added` and `visibility.set` against one — byte-identical
 * to the same battery on a live ticket — and the assignment fanout then served
 * the assignee an inbox notification pointing at a 404. The engine read the
 * flag in exactly one file, this one, and only for the pair above.
 *
 * It runs in `evaluateEvent` BEFORE the per-type dispatch, and that placement
 * is the whole design: five of the six measured types have no dispatch arm at
 * all (they fall through to `{ refused: false }`), so no guard inside any one
 * check could have reached them, and a guard copied into every check is the
 * shape this series keeps catching one copy short. The precedent is the
 * attachments UPLOAD door, which already refuses a deleted ticket at the door
 * (`routes/attachments.ts`, cases 16.97–16.99) — this is that decision reaching
 * the ingest door for every write at once.
 *
 * NARROW, deliberately: a ticket that does NOT resolve passes through
 * UNCHANGED. `ticket.assigned` and both collaborator events have no existence
 * check today and the server commits them for a never-created ticket
 * (`apps/server/src/projections/tickets.ts` records it under
 * `DOOR_LEAVES_EXISTENCE_UNCHECKED`, and
 * `test/permissions/check-role-permission.test.ts` pins it). Refusing an
 * unknown ticket here would be a second ruling under the first's name; this
 * gate makes one.
 *
 * AUTHORIZATION is not here either, for the reason the file header gives: this
 * gate reads only the ticket's own head state, so the fixture suite and the
 * offline replica — which enter at `evaluateEvent` — get the same answer the
 * server does, and an offline device that still holds the ticket gets its
 * refusal (and its contest) instead of a silently accepted edit.
 */
export async function checkTicketLive(env: EventEnvelope, ctx: EngineContext): Promise<Accept | Refusal> {
  if (env.entity.kind !== 'ticket') return ACCEPT;
  if (LIVE_GATE_EXEMPT.has(env.type)) return ACCEPT;
  const ticket = await getTicketState(ctx, env.entity.id);
  if (ticket === null) return ACCEPT;
  if ((ticket.deleted ?? null) !== null) {
    return refuse(REFUSAL_RULES.deletedTicket, 'This ticket is deleted; restore it first.');
  }
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
