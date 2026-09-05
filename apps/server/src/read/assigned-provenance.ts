import type { AssignmentProvenance } from '@gisik-nokma/domain';
import type { Queryable } from '../db/queryable.js';

/**
 * The claim that produced each ticket's CURRENT assignee: the latest
 * `ticket.assigned`. Batched, exactly as `stateProvenanceFor` batches the state
 * claim — one `DISTINCT ON` over the ledger's `(entity_kind, entity_id, seq)`
 * unique index.
 *
 * ## The event set is ONE type, and it was enumerated from the REDUCER
 *
 * `stateProvenanceFor` reads two types, so the obvious move here was to copy it
 * and guess a second — `ticket.unassigned`, say. There is no such event.
 * `applyTicketEvent` is the only writer of `TicketState.assigneeId` and it
 * touches the field in exactly two places: `ticket.created` sets it to `null`
 * (`packages/domain/src/ticket-state.ts:136`) and `ticket.assigned` sets it to
 * the payload's value (`:195`, whose payload is `{ assigneeId: string | null }`
 * — `events/ticket-events.ts:50`, so an UNASSIGNMENT is a `ticket.assigned`
 * carrying null and not a type of its own). `apps/server/src/projections/tickets.ts`
 * writes `proj_tickets.assignee_id` from that state and from nothing else.
 *
 * So the latest `ticket.assigned` is the claim behind whatever
 * `assignee_id` currently holds. The creation is deliberately NOT in the `IN`
 * list: it always writes `null`, so including it would attribute "nobody is
 * assigned" to whoever created the ticket — an assignment claim nobody made.
 *
 * ## Total over its input, and the caller decides what an absence means
 *
 * An id with no `ticket.assigned` is ABSENT from the map, not mapped to a
 * null-shaped provenance, for the reason `stateProvenanceFor` gives: there is no
 * such thing as a claim with no actor. Two different absences reach this point
 * and they are the CALLER's to tell apart, because only the caller holds the
 * `proj_tickets` row:
 *
 * - `assignee_id IS NULL` and no event → never assigned. `assignedProvenance:
 *   null` is the whole truth.
 * - `assignee_id` set and no event → the projection and the ledger disagree, and
 *   `assembleListCards` throws rather than serving an unattributed assignment.
 *
 * A row whose latest `ticket.assigned` carries `null` — somebody unassigned it —
 * also has `assignee_id IS NULL`, so the caller answers `null` there too. That
 * is a real loss and it is named rather than hidden: `ListCard` pairs the
 * provenance with the ASSIGNEE, and there is no assignee for an unassignment's
 * provenance to belong to. The claim itself is not destroyed — it is in the
 * ledger and `GET /v1/workspaces/:ws/tickets/:id/events` serves it.
 *
 * ## No workspace predicate, stated rather than omitted
 *
 * The same argument `stateProvenanceFor` makes at the same spot: ticket ids are
 * entity ULIDs, globally unique across the ledger, so `entity_id = ANY($1)`
 * cannot reach another tenancy's claim for an id the caller did not already
 * hold, and every caller arrives with rows it scoped itself.
 */
export async function assignedProvenanceFor(
  db: Queryable,
  ticketIds: string[],
): Promise<Map<string, AssignmentProvenance>> {
  const provenance = new Map<string, AssignmentProvenance>();
  if (ticketIds.length === 0) {
    return provenance;
  }

  const { rows } = await db.query<{
    entity_id: string;
    actor_id: string;
    client_time: Date;
    server_time: Date;
  }>(
    `SELECT DISTINCT ON (entity_id) entity_id, actor_id, client_time, server_time
       FROM events
      WHERE entity_kind = 'ticket'
        AND entity_id = ANY ($1::text[])
        AND type = 'ticket.assigned'
      ORDER BY entity_id, seq DESC`,
    [ticketIds],
  );

  for (const row of rows) {
    provenance.set(row.entity_id, {
      actorId: row.actor_id,
      // Both clocks are `timestamptz`, so the driver yields a `Date` for each and
      // `toISOString()` is zone-free — the same rendering `stateProvenanceFor`
      // performs, for the same reason.
      clientTime: row.client_time.toISOString(),
      serverTime: row.server_time.toISOString(),
    });
  }
  return provenance;
}
