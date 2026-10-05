import { isFlowCause, isWithheldFlowCause, withholdCauseTicket, type FlowCause } from '@gisik-nokma/domain';
import type { Queryable } from '../db/queryable.js';
import type { TicketHistoryEvent } from '../routes/ticket-history.js';
import type { TargetSight } from '../visibility/withhold-link-targets.js';
import { keysForAncestors } from './ancestry.js';

/**
 * wtg2 T17: the History route names a flow cause's ticket per viewer. The lookup repeats the link-target block of
 * `routes/ticket-history.ts` on purpose (that route records why two blocks do not share a helper that would make them
 * agree by construction); it asks the page's ONE sight (`targetSight`, `canOpen` memoised), as the link withhold does.
 */

/** The flow cause on a ticket event, or null (also for the older `reopened-for-child` cause, which is not the flow's). */
export function causeOf(payload: unknown): FlowCause | null {
  const cause = typeof payload === 'object' && payload !== null ? (payload as { cause?: unknown }).cause : undefined;
  return isFlowCause(cause) ? cause : null;
}

/** The ticket a cause names: the finished source of a promotion, else the Decision. */
export function causeTicketId(cause: FlowCause): string {
  return cause.kind === 'led-to' ? cause.sourceTicketId : cause.decisionTicketId;
}

/**
 * Sets `causeTicket` on every flow-caused event: `{ key }` when this viewer can see the cause's ticket, else `null`,
 * and then the payload's cause is served with its ticket id and people nulled (`withholdCauseTicket`, AMEND 2). A cause
 * the route's `withholdEvent` already withheld reads `null` with no lookup; the nulling here still answers a raw cause
 * whose ticket has no row (unknown and invisible are one answer). An event with no flow cause is left as it is, with no
 * `causeTicket` key. A page is at most `MAX_LIMIT` events, so the per-ticket lookups are bounded.
 */
export async function annotateFlowCauses(db: Queryable, sees: TargetSight, events: TicketHistoryEvent[]): Promise<void> {
  // The route's `withholdEvent` runs first, with the same sight, and has already withheld a cause naming a ticket this
  // viewer cannot see (wtg-flow-cause-withhold): that event's ticket is hidden, and there is no id left to look up.
  for (const event of events) {
    const cause = typeof event.payload === 'object' && event.payload !== null ? (event.payload as { cause?: unknown }).cause : undefined;
    if (isWithheldFlowCause(cause)) event.causeTicket = null;
  }
  const caused = events.flatMap((event) => {
    const cause = causeOf(event.payload);
    return cause === null ? [] : [{ event, cause }];
  });
  if (caused.length === 0) return;
  const { rows } = await db.query<{ ticket_id: string; workspace_id: string; project_id: string }>(
    'SELECT ticket_id, workspace_id, project_id FROM proj_tickets WHERE ticket_id = ANY($1::text[])',
    [[...new Set(caused.map((c) => causeTicketId(c.cause)))]],
  );
  const visible = new Map<string, string | null>();
  for (const row of rows) {
    if (!(await sees(row.ticket_id))) continue;
    const keys = await keysForAncestors(db, row.workspace_id, [{ ticketId: row.ticket_id, projectId: row.project_id }]);
    visible.set(row.ticket_id, keys.get(row.ticket_id) ?? null);
  }
  for (const { event, cause } of caused) {
    const id = causeTicketId(cause);
    if (visible.has(id)) {
      event.causeTicket = { key: visible.get(id) ?? null };
      continue;
    }
    event.causeTicket = null; // unknown and invisible are one answer, as in `canSee`
    event.payload = { ...(event.payload as object), cause: withholdCauseTicket(cause) };
  }
}
