import type { Queryable } from '../db/queryable.js';
import { LIVE_BASE_WHERE, LIVE_TICKET_WHERE } from './visible-where.js';

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
 * ⚠ **THE EQUIVALENCE IS A FACT ABOUT THE WRITER, NOT ABOUT THE SCHEMA, and two
 * readers disagree about rows no writer produces.** The detail route's mapper
 * reads the flag with an OR — `deleted_at === null || deleted_by === null` →
 * `null` (`projections/tickets.ts`) — so a row with `deleted_at` SET and
 * `deleted_by` NULL would be SERVED by the detail route and REFUSED here. And a
 * ticket `proj_visibility` holds with no `proj_tickets` row at all THROWS at the
 * detail route (the two projections disagree) where these doors refuse with the
 * route's 404. Both are unreachable through the ingest path, where one
 * projection pass writes both columns and both rows; **neither is guarded, and
 * the risk is stated rather than closed**: the day a second writer reaches
 * `proj_tickets` — anything that does not go through `upsertTicket` — these two
 * doors can drift, and nothing would notice. An earlier version of this
 * paragraph named only the second, and called it "ONE reachable-in-theory case";
 * the count was wrong and the enumeration is the point.
 *
 * ## The refusal is the caller's, not this function's
 *
 * This answers a question. What a `false` becomes — a 404 in the route's shared
 * body, an empty list, a filtered row — is the caller's decision, and it has to
 * be: the same predicate is a refusal at a door (the comments door) and a filter
 * in a view. The three file doors ask `ticketIsOpenable` below instead (drafts
 * T9, G10), after `canOpen`.
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

/**
 * `ticketIsLive` for a DOOR (drafts spec G10): the deleted-ticket and deleted-project halves alone, so the author's own
 * draft passes. It never decides WHO may open a draft; `canOpen` does, and every caller asks `canOpen` first. Asked
 * alone it would admit a draft to anyone holding its id, which is why a view must keep using `ticketIsLive`. For a
 * published ticket the two answers are the same query.
 */
export async function ticketIsOpenable(db: Queryable, workspaceId: string, ticketId: string): Promise<boolean> {
  const { rowCount } = await db.query(
    `SELECT 1 FROM proj_tickets t
      WHERE t.workspace_id = $1 AND t.ticket_id = $2 AND ${LIVE_BASE_WHERE}`,
    [workspaceId, ticketId],
  );
  return rowCount === 1;
}
