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
 * — `events/ticket-events.ts:51`, so an UNASSIGNMENT is a `ticket.assigned`
 * carrying null and not a type of its own). `apps/server/src/projections/tickets.ts`
 * writes `proj_tickets.assignee_id` from that state and from nothing else.
 *
 * So the latest `ticket.assigned` is the claim behind whatever
 * `assignee_id` currently holds. The creation is deliberately NOT in the `IN`
 * list: it always writes `null`, so including it would attribute "nobody is
 * assigned" to whoever created the ticket — an assignment claim nobody made.
 *
 * ## ⚠ CORRECTED 2026-09-23 — the paragraph above was true and is now WRONG
 *
 * It is kept rather than deleted because the reasoning still decides the shape of
 * the fix. `ticket.created` gained an optional `assigneeId` (owner request, the
 * New ticket dialog's Assignee picker), so "it always writes `null`" is no longer
 * a fact about that event: `applyTicketEvent` now sets the field from the
 * payload's member when one is present. A BIRTH ASSIGNEE therefore produces no
 * `ticket.assigned` at all, and this function answered ABSENT for it — which
 * `assembleListCards` and `readTicket` are built to read as "the projection and
 * the ledger disagree" and to THROW on.
 *
 * That is not a hypothetical. Measured on the dev stack the day the feature
 * landed: every read of a ticket created with an assignee answered **HTTP 500** —
 * `GET /v1/projects/:id/tickets` for the whole list, and
 * `GET /v1/workspaces/:ws/tickets/:id` for the one ticket — so a single such
 * ticket took out the List, Calendar, Timeline and Backlog tabs of its project
 * and the sheet with them. The write door and the permission door were both
 * updated for the new member; this read door was not, and no test drove a
 * created-with-assignee ticket through a read.
 *
 * The exclusion becomes a PREDICATE: a `ticket.created` joins the candidates only
 * when its payload actually names somebody. A birth with no assignee still
 * contributes nothing, so the original argument — never attribute "nobody is
 * assigned" to the creator — holds exactly as it did, and `DISTINCT ON … ORDER BY
 * seq DESC` keeps a later `ticket.assigned` winning over the birth claim.
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
    // TWO types, not one, since 2026-09-23 — see the docblock's own correction.
    // A `ticket.created` counts ONLY when it actually names somebody: a birth
    // with no assignee still writes nothing here, which is what keeps "nobody is
    // assigned" from being attributed to whoever created the ticket. That was the
    // whole reason creation was excluded, and it survives as this predicate
    // rather than as an exclusion.
    //
    // `payload->>'assigneeId' IS NOT NULL` is a JSON-null-safe test in Postgres:
    // `->>` yields SQL NULL both for an absent key and for a JSON `null`, and the
    // two mean the same thing here (absent means nobody — `ticket-events.ts`).
    `SELECT DISTINCT ON (entity_id) entity_id, actor_id, client_time, server_time
       FROM events
      WHERE entity_kind = 'ticket'
        AND entity_id = ANY ($1::text[])
        AND (
          type = 'ticket.assigned'
          OR (type = 'ticket.created' AND payload->>'assigneeId' IS NOT NULL)
        )
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
