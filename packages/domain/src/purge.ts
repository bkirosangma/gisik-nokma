import type { EventEnvelope } from './envelope.js';

/**
 * The purge's shared vocabulary (trash series Plan 2; spec §5.3, §5.4, §5.6,
 * §5.7). Domain-level because the server door (Plan 2), the replica (Plan 3) and
 * the renderer (Plan 3) all speak it.
 */

/** The door's answer for any claim about an erased item (spec §5.7). */
export const PURGED_REASON = 'This item was permanently deleted.';

/** The door's answer for a `purge.completed` submitted by anyone but the purge. */
export const PURGE_SERVER_ONLY_REASON = 'Only the permanent-deletion sweep can record a purge.';

/** What a chip to an erased item renders as, in search text now and on screen in Plan 3 (spec §5.6). */
export const PURGED_ITEM_LABEL = 'Deleted item';

/**
 * The payload a purged ticket's `ticket.created` is REDACTED to (spec §5.4). The
 * row is kept, not deleted, so `row_number() OVER (PARTITION BY
 * payload->>'projectId' ORDER BY workspace_seq)` (`apps/server/src/read/
 * ticket-numbers.ts`) still counts it and no later ticket is renumbered.
 * `purge_ledger` builds the same object in SQL; the trigger accepts nothing else.
 */
export function redactedTicketCreatedPayload(projectId: string): { projectId: string; purged: true } {
  return { projectId, purged: true };
}

/**
 * True exactly for a redacted `ticket.created`. Every replay reader of
 * `ticket.created` asks this FIRST and produces no ticket from it — the payload
 * no longer satisfies `ticketCreatedPayload` (no `typeId`, `parentId`, `title`).
 * `=== true`, not truthiness: the flag is written by one SQL statement as a JSON
 * boolean, and anything else is not that statement's row.
 */
export function isRedactedTicketCreated(env: Pick<EventEnvelope, 'type' | 'payload'>): boolean {
  if (env.type !== 'ticket.created') return false;
  const payload = env.payload;
  if (payload === null || typeof payload !== 'object') return false;
  return (payload as { purged?: unknown }).purged === true;
}
