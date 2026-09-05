import type { LedgerEvent } from '@gisik-nokma/domain';
import type { Queryable } from '../db/queryable.js';
import { readEntityEvents } from '../ledger/event-store.js';
import { canSee } from './can-see.js';

/**
 * Backfill on newly GRANTED visibility — the half of closure 5 that gives back
 * the copy nobody gives back (ruling P37, 2026-09-06; cases 6.104's mirror and
 * 12.274).
 *
 * ## The gap this closes, stated as the measurement that found it
 *
 * `visibleEventsFor` streams `workspace_seq > afterSeq` and filters against
 * visibility AS OF NOW. The cursor is the highest `workspace_seq` of an
 * envelope actually DELIVERED. So any visible commit landing while a ticket is
 * narrowed carries the client's cursor PAST the narrowing and past everything
 * filed on that ticket meanwhile, and re-widening later delivers only the
 * widening itself: the earlier rows sit below the cursor and nothing re-sends
 * them. Measured twice on the dual-client rig — insert ONE unrelated visible
 * commit between a narrow and a re-widen and client B ends holding 2 events
 * where the server holds 4, permanently, with no purge, no backfill and no
 * resync path (case 12.274). `visible-events-for.ts` named the absence in
 * prose — *"Backfilling a ticket's pre-cursor history when visibility is newly
 * GRANTED is Plan 10's job, on top of this primitive"* — and no task owned it
 * until P37.
 *
 * ## The trigger is the EVENT, never a reconstructed prior audience
 *
 * This module never asks "who could see this before". It cannot: `proj_visibility`
 * keeps no history and neither payload carries a before-image, and re-deriving
 * the pre-event audience here would be a second definition of visibility that
 * can disagree with the table every other door reads — the ban cases 6.82 and
 * 6.94 already recorded, and the reason the per-event PURGE walk was struck
 * (6.101). So the trigger is the arrival of a visibility-changing event on a
 * ticket the reader may see NOW, and nothing finer.
 *
 * That is deliberately coarse in one direction and exact in the other:
 *
 * - **It over-delivers.** A reader who already held the ticket is handed its
 *   pre-cursor history again. That is acceptable ONLY because replay is
 *   idempotent, which is an obligation P37 states and this branch MEASURES
 *   rather than cites — `applyServerItem` refuses a duplicate event id and
 *   `refoldTicket` is a full replay from the local snapshot in `seq` order, so
 *   arrival order does not matter and a re-delivery changes no row. Case 12.276
 *   mutates the duplicate guard out and expects red.
 * - **It never under-selects towards a leak, because narrowings never fire it.**
 *   A narrowing `visibility.set` is invisible to the viewer who just lost the
 *   ticket — `visibleEventsFor`'s `canSee` refuses to yield it — so it is never
 *   a trigger for that viewer, and the only readers who reach this module for a
 *   given event are readers `canSee` admits now. A widening self-selects; a
 *   narrowing self-excludes. No before-image is needed to tell them apart, and
 *   that is the whole reason this shape is legal under 6.82/6.94.
 *
 * ## Cost is bounded to once per subscriber per trigger
 *
 * The trigger event is itself an ordinary visible ticket event, so the caller
 * yields it and the subscriber's cursor advances past it. The next drain's range
 * starts above it and the trigger is not seen again. The backfilled envelopes
 * cannot themselves move the cursor: both consumers advance only on
 * `item.workspaceSeq > cursor` (`stream/hub.ts`'s `drain`, and the dual-client
 * rig's `syncDown`), and every backfilled envelope is at or below `afterSeq` by
 * construction.
 */

/**
 * The event types that can change a ticket's resolved audience, and therefore
 * the ones that trigger a backfill.
 *
 * Both are ticket-entity events, and both are types the reducer does NOT fold —
 * `visibility.set` is in `BOOTSTRAP_BACKFILL_TYPES` for exactly that reason, and
 * `ticket.reparented` moves the inherit chain rather than the state.
 *
 * `ticket.reparented` is here because inheritance is an audience: a ticket that
 * authored no mode of its own resolves through its parent
 * (`proj-visibility.ts`'s resolution rule), so moving it under a different
 * parent can widen it exactly as a `visibility.set` can. Reparenting a ticket
 * that DID author a mode changes nothing about its audience — the walk below
 * still runs and the events are re-delivered, which is over-delivery of the
 * kind the docblock above already accepts.
 *
 * **This list is the first of the two mutable sites this module deliberately
 * carries.** Emptying it must redden the backfill cases and nothing else; the
 * second site is `canSee` inside `grantBackfillFor`, which is what holds the
 * excluding property for DESCENDANTS. They are not redundant — see that call.
 *
 * *Absence, named rather than implied: a THIRD shape of grant exists and is not
 * here.* Visibility also widens when the READER's reach grows rather than the
 * ticket's — `membership.granted` at a higher role, or a `project.member_added`
 * that puts them on a project full of project-mode tickets. Those are roster
 * events, filed against the roster entity, and every ticket they newly reveal
 * carries the identical pre-cursor gap. P37 scopes closure 5 to "the visibility
 * event itself", so this is RECORDED and not built: case 12.281, *owner: the WS
 * catch-up/purge protocol, unassigned to any task*, alongside the residual named
 * at 6.104. It is not closed by anything here, and a reader should not infer
 * from this module's existence that it is.
 */
export const GRANT_BACKFILL_TRIGGERS = ['visibility.set', 'ticket.reparented'] as const;

export function isGrantBackfillTrigger(type: string): boolean {
  const triggers: readonly string[] = GRANT_BACKFILL_TRIGGERS;
  return triggers.includes(type);
}

/**
 * The tickets whose resolved audience depends on `ticketId`: itself, plus every
 * descendant that inherits, pruning at any child with an authored mode.
 *
 * **This is `reResolveSubtree`'s traversal, read-only.** That function
 * (`../projections/proj-visibility.ts`) restores the resolution invariant over
 * exactly this set when one of these same events lands, so "whose row did that
 * event change" and "whose audience must be backfilled" are the same question,
 * and asking it the same way is what keeps the two answers from drifting. The
 * prune is the same prune and for the same reason: an authored subtree resolves
 * from its own claim, so nothing above it can change what it sees.
 *
 * It is a read of `proj_visibility`'s own `parent_id` / `own_mode` columns — the
 * projection's structure — and NOT a re-derivation of the visibility RULE. The
 * audience question is still asked once per candidate, of `canSee`, and of
 * nothing else. That is the line 6.82 and 6.94 draw, and this stays the legal
 * side of it.
 *
 * `visited` guards a `parent_id` cycle, exactly as `reResolveSubtree`'s does and
 * for the reason case 6.58 records: nothing on this branch refuses a
 * cycle-creating reparent, so a walk that assumed acyclicity would hang the
 * drain rather than serve a wrong answer. Termination is all it provides.
 *
 * A ticket with no `proj_visibility` row yields the empty set — `canSee` answers
 * false for it anyway, so this only saves the work.
 */
async function audienceDependents(db: Queryable, ticketId: string): Promise<string[]> {
  const visited = new Set<string>();
  const out: string[] = [];
  const frontier: string[] = [ticketId];
  while (frontier.length > 0) {
    const current = frontier.shift();
    if (current === undefined || visited.has(current)) continue;
    visited.add(current);
    out.push(current);
    const children = await db.query<{ ticket_id: string }>(
      `SELECT ticket_id FROM proj_visibility
       WHERE parent_id = $1 AND own_mode = 'inherit' ORDER BY ticket_id`,
      [current],
    );
    for (const child of children.rows) frontier.push(child.ticket_id);
  }
  return out;
}

/**
 * The pre-cursor history this reader is owed because `ticketId`'s audience just
 * changed and they are inside the new one.
 *
 * Yields envelopes in `(ticket, seq)` order, at or below `afterSeq` — the range
 * the caller's own stream query excludes, and precisely the gap. Everything
 * above `afterSeq` is already in the caller's range and is yielded there, under
 * the caller's own `canSee`; re-yielding it here would be duplicate work with no
 * property attached.
 *
 * `backfilled` is the caller's per-drain ledger of tickets already served. Two
 * triggers on one ticket in one range, or a trigger on a ticket already covered
 * by an ancestor's subtree walk, deliver once.
 *
 * ## The `canSee` on every candidate is NOT redundant with the caller's
 *
 * The caller checked `canSee` for the TRIGGER ticket alone. Every other ticket
 * this generator reaches arrives through `audienceDependents`, which the caller
 * never asked about — a descendant may be inside the new audience or outside it
 * (it may have an authored explicit list of its own further down, or the reader
 * may be a guest whom the widening did not name), and this call is the only
 * thing that decides. Mutating it to permit must redden the excluding case on
 * its own; the trigger list above is the site that carries the other half.
 * Measured, both, rather than asserted — a guard no mutation can kill is
 * unmeasured code a later reader trusts, which is the lesson `stream/hub.ts`
 * paid four `sub.ended` guards to learn.
 */
export async function* grantBackfillFor(
  db: Queryable,
  userId: string,
  ticketId: string,
  afterSeq: number,
  backfilled: Set<string>,
): AsyncGenerator<LedgerEvent> {
  for (const candidate of await audienceDependents(db, ticketId)) {
    if (backfilled.has(candidate)) continue;
    backfilled.add(candidate);
    // THE SECOND MUTABLE SITE. See the docblock: load-bearing for descendants,
    // redundant only for the trigger ticket itself.
    if (!(await canSee(db, userId, candidate))) continue;
    for (const env of await readEntityEvents(db, 'ticket', candidate)) {
      if (env.workspaceSeq <= afterSeq) yield env;
    }
  }
}
