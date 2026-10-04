import type { Pool } from 'pg';
import { purgeItem, type PurgeDeps, type PurgeGate, type PurgeOutcome } from './purge-item.js';

/**
 * Erasing a DISCARDED DRAFT (drafts spec R15, R16): the trash purge's transaction with a different gate. A draft has
 * no mark and no 15-day delay (nobody else could see it, so there is nothing to undo), but it has the flag the
 * `ticket.discarded` event set.
 *
 * The tombstone records the discarder as `markedBy` and the discard instant as `markedAt`, read from the ledger
 * under the same lock the erasure holds. The one thing the gate must never do is admit a draft that is NOT flagged
 * discarded, or a published ticket: `draft_author_id IS NULL` is a published ticket, `draft_discarded` unset is a
 * live draft, and both are `not-discarded`.
 */
export const draftDiscarded: PurgeGate = async (client, target) => {
  const { rows } = await client.query<{ draft_author_id: string | null; draft_discarded: boolean | null }>(
    'SELECT draft_author_id, draft_discarded FROM proj_tickets WHERE ticket_id = $1',
    [target.id],
  );
  const row = rows[0];
  if (row === undefined || row.draft_author_id === null || row.draft_discarded !== true) {
    return { ok: false, reason: 'not-discarded' };
  }
  const { rows: events } = await client.query<{ actor_id: string; server_time: Date }>(
    `SELECT actor_id, server_time FROM events
      WHERE entity_kind = 'ticket' AND entity_id = $1 AND type = 'ticket.discarded'
      ORDER BY seq DESC LIMIT 1`,
    [target.id],
  );
  const discarded = events[0];
  // The flag is set by folding that event, so a flagged draft with no event is a corrupted projection: fail the
  // erasure (the sweep alerts and retries) rather than invent who discarded it.
  if (discarded === undefined) {
    throw new Error(`draft ${target.id} is flagged discarded but its ticket.discarded event is missing`);
  }
  return { ok: true, markedBy: discarded.actor_id, markedAt: discarded.server_time.toISOString() };
};

/** Erases one discarded draft and, with it, its sub-drafts. Skips (never erases) anything that is not a discarded draft. */
export function discardDraft(pool: Pool, ticketId: string, deps: PurgeDeps): Promise<PurgeOutcome> {
  return purgeItem(pool, { kind: 'ticket', id: ticketId }, deps, draftDiscarded);
}

/**
 * Every draft flagged discarded and not yet erased: what the scheduled sweep retries when the post-commit hook did
 * not run (a crash between the commit and the callback) or failed. An erased draft has no row left, so it is not
 * offered again.
 */
export async function pendingDraftDiscards(pool: Pool): Promise<string[]> {
  const { rows } = await pool.query<{ ticket_id: string }>(
    'SELECT ticket_id FROM proj_tickets WHERE draft_discarded IS TRUE ORDER BY ticket_id',
  );
  return rows.map((row) => row.ticket_id);
}
