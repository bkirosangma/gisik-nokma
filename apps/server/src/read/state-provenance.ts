import { isFlowCause, viewerSafeCause, type StateProvenance, type TransitionCause } from '@gisik-nokma/domain';
import type { Queryable } from '../db/queryable.js';

/**
 * The claim that produced each ticket's CURRENT state: the latest
 * `ticket.transitioned`, or `ticket.created` if it was never transitioned —
 * the actor, both clocks, and the transition's `cause` if it carried one (a
 * flow cause as its kind only, `servedCause`).
 * Batched: one `DISTINCT ON` over the ledger's `(entity_kind, entity_id, seq)`
 * unique index.
 *
 * ## Total over its input, and that is a decision rather than a fallout
 *
 * An id with no matching event is simply ABSENT from the returned map. It is
 * not mapped to a null-shaped provenance, because there is no such thing: every
 * state a ticket is in was claimed by an event, so a ticket with a projected
 * row and no claim is a ledger/projection disagreement, and the caller that
 * would have to render it (`assembleTicketCards`) throws on the absence rather
 * than inventing an anonymous claim. Answering `{ actorId: '', … }` here would
 * move that lie one layer down where nobody could see it.
 *
 * ## No workspace predicate, stated rather than omitted
 *
 * Ticket ids are entity ULIDs, globally unique across the whole ledger, so
 * `entity_id = ANY($1)` cannot reach another tenancy's claim for an id the
 * caller did not already hold. Every caller arrives with rows it has already
 * scoped — `fetchTicketRows` and the route readers select from `proj_tickets`
 * under their own `workspace_id` clause — so a predicate here would narrow a
 * set that is already narrow.
 *
 * `getRollup` argues the other way for a similar shape ("a caller who has a
 * workspace in hand should not be able to read another tenancy's counts by
 * holding an id"), and the difference is real rather than an inconsistency to
 * tidy: that function is reachable with a bare id and answers a COUNT about
 * other tickets, whereas this one answers about the very ids it was handed.
 * Recorded so the next reader does not have to re-derive which side this is on.
 *
 * ## Both clocks are `timestamptz`
 *
 * Plan 1 Task 6, owner decision 2026-08-20 — the driver yields a `Date` for
 * each and `toISOString()` is zone-free, so nothing here moves with `TZ`.
 */
export async function stateProvenanceFor(
  db: Queryable,
  ticketIds: string[],
): Promise<Map<string, StateProvenance>> {
  const provenance = new Map<string, StateProvenance>();
  if (ticketIds.length === 0) {
    return provenance;
  }

  const { rows } = await db.query<{
    entity_id: string;
    type: string;
    actor_id: string;
    client_time: Date;
    server_time: Date;
    payload: { cause?: unknown };
  }>(
    `SELECT DISTINCT ON (entity_id) entity_id, type, actor_id, client_time, server_time, payload
       FROM events
      WHERE entity_kind = 'ticket'
        AND entity_id = ANY($1::text[])
        AND type IN ('ticket.created', 'ticket.transitioned', 'ticket.published')
      ORDER BY entity_id, seq DESC`,
    [ticketIds],
  );

  for (const row of rows) {
    provenance.set(row.entity_id, {
      actorId: row.actor_id,
      clientTime: row.client_time.toISOString(),
      serverTime: row.server_time.toISOString(),
      // A creation never carries a cause; a transition carries one when the
      // actor reopened a parent for a child, or when the flow moved it (wtg2
      // T8). `null` here is the complete answer "this claim named no cause" —
      // not a missing value: the claim itself is present, with its actor and
      // both clocks.
      cause:
        row.type === 'ticket.transitioned' && row.payload.cause !== undefined
          ? servedCause(row.payload.cause)
          : null,
    });
  }
  return provenance;
}

/**
 * A transition's cause as a viewer may see it (wtg2 T8, spec FL-1). A flow cause names a source or Decision ticket and a
 * person this viewer may not be able to see, so it is served as `{ kind }` only (`viewerSafeCause`); the old
 * `reopened-for-child` cause passes through whole, as it always has (29.207). Nothing serves `closed.cause` yet: the
 * projection stores no close cause, so `rowToTicketState` has none to hand a route.
 */
export function servedCause(raw: unknown): TransitionCause | null {
  return isFlowCause(raw) ? viewerSafeCause(raw) : (raw as TransitionCause);
}
