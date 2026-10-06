import type { PinCounts } from '@gisik-nokma/domain';
import type { Queryable } from '../db/queryable.js';
import type { EffectiveRole } from '../permissions/effective-role.js';
import { NOTE_PROJECT_LIVE_WHERE } from './notes.js';
import { SqlParams } from './sql-params.js';
import { visibleNotesWhere } from './visible-where.js';

/**
 * The paper pin (Workflow and Timeline graphs, TG-11 and TV-10): per ticket, how many notes THIS viewer may read are
 * attached to it, and how many attachments the ticket owns.
 *
 * - A note counts only if `visibleNotesWhere` admits it for the viewer, it is not deleted, and its home project is live
 *   (`NOTE_PROJECT_LIVE_WHERE`, the notes list's own two clauses, so the pin never disagrees with the Notes tab). A note the
 *   viewer cannot read adds nothing, so the count cannot reveal that it exists. `count(*)` is one per note: the link table's
 *   primary key is `(note_id, ticket_id)` (`1790100000000_proj-notes.sql`).
 * - An attachment counts when `attachments.ticket_id` is the ticket. A note-owned attachment has `ticket_id IS NULL`
 *   (`1790110000000_attachments-note-owner.sql`) and is not a ticket's. No attachment-removal event exists, so a row is live
 *   until a purge deletes it.
 *
 * The caller passes ONLY ids the viewer can already see (the list page's own rows), so this makes no ticket-visibility
 * decision of its own. One batched read per page (two queries, none for an empty page), never one per row. A ticket with
 * neither is absent from the map, and `pinOf` spells the absence as zeros.
 */
export const NO_PIN: PinCounts = { notes: 0, attachments: 0 };

export async function pinCountsFor(
  db: Queryable,
  eff: EffectiveRole,
  viewerId: string,
  ticketIds: readonly string[],
): Promise<Map<string, PinCounts>> {
  const pins = new Map<string, PinCounts>();
  if (ticketIds.length === 0) return pins;
  const params = new SqlParams();
  const ids = params.add([...ticketIds]);
  const notes = await db.query<{ ticket_id: string; n: number }>(
    `SELECT na.ticket_id, count(*)::int AS n
       FROM proj_note_attachments na
       JOIN proj_notes n ON n.note_id = na.note_id
      WHERE na.ticket_id = ANY(${ids}::text[])
        AND n.deleted = FALSE
        AND ${NOTE_PROJECT_LIVE_WHERE}
        AND ${visibleNotesWhere(eff, viewerId, params)}
      GROUP BY na.ticket_id`,
    params.toArray(),
  );
  const files = await db.query<{ ticket_id: string; n: number }>(
    'SELECT ticket_id, count(*)::int AS n FROM attachments WHERE ticket_id = ANY($1::text[]) GROUP BY ticket_id',
    [[...ticketIds]],
  );
  for (const row of notes.rows) pins.set(row.ticket_id, { notes: row.n, attachments: 0 });
  for (const row of files.rows) pins.set(row.ticket_id, { notes: pins.get(row.ticket_id)?.notes ?? 0, attachments: row.n });
  return pins;
}

/** The counts for one ticket of the page: zeros when the ticket has no readable note and no attachment (known: none). */
export function pinOf(pins: ReadonlyMap<string, PinCounts>, ticketId: string): PinCounts {
  return pins.get(ticketId) ?? NO_PIN;
}
