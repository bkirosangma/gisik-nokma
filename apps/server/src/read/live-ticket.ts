import type { Queryable } from '../db/queryable.js';
import { LIVE_TICKET_WHERE } from './visible-where.js';

/**
 * The route-level application of the soft-delete rule: **is this ticket still
 * one the product shows?**
 *
 * ## Why this exists rather than a `getTicketStateFromDb` call at each route
 *
 * `getTicketStateFromDb` deliberately serves deleted tickets — the engine reads
 * it to resolve the ticket that `ticket.restored` names, so filtering there
 * would make the undo refuse its own ticket (`projections/tickets.ts` carries
 * the argument). Its docblock names the remedy for a caller that wants live
 * tickets only: *"that is the caller's predicate to add (`read/visible-where.ts`'s
 * `LIVE_TICKET_WHERE`), never this function's."* This is that predicate, asked at
 * the route, in the constant's one spelling — so the sites that carry the rule
 * stay enumerable by the grep the constant's own docblock publishes, instead of
 * a second expression of it living where that sweep cannot see it.
 *
 * ## The DETAIL route asks the same question a different way, and they agree
 *
 * `routes/tickets.ts`'s detail route answers from the state it has ALREADY read:
 * `(state.deleted ?? null) !== null` → 404. Disagreeing with it would be the
 * defect this module was written to make impossible, so the equivalence is
 * stated and sourced rather than assumed: `upsertTicket` derives `deleted_at`
 * and `deleted_by` from the *same* `next.deleted` — a delete writes both, the
 * undo clears both — so `deleted_at IS NULL` holds exactly when the domain flag
 * is `null`. A second read of the full row there would buy nothing.
 *
 * They differ in ONE reachable-in-theory case, named rather than left to be
 * found: a ticket `proj_visibility` holds and `proj_tickets` does not. The
 * detail route THROWS on that (the two projections disagree); these doors refuse
 * with the route's 404. Both refuse the read — the difference is loudness, not
 * access — and no ingest path reaches the state, because one projection pass
 * writes both rows.
 *
 * ## The refusal is the caller's, not this function's
 *
 * This answers a question. What a `false` becomes — a 404 in the route's shared
 * body, an empty list, a filtered row — is the caller's decision, and it has to
 * be: the same predicate is a refusal at a file door and a filter in a view.
 */
export async function ticketIsLive(
  db: Queryable,
  workspaceId: string,
  ticketId: string,
): Promise<boolean> {
  const { rowCount } = await db.query(
    `SELECT 1 FROM proj_tickets t
      WHERE t.workspace_id = $1 AND t.ticket_id = $2 AND ${LIVE_TICKET_WHERE}`,
    [workspaceId, ticketId],
  );
  return rowCount === 1;
}
