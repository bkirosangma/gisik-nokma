import type { Queryable } from '../db/queryable.js';
import type { EffectiveRole } from '../permissions/effective-role.js';
import type { ItemKind } from '../semantic/signature.js';
import { SqlParams } from './sql-params.js';
import { LIVE_TICKET_WHERE, visibleNotesWhere, visibleTicketsWhere } from './visible-where.js';

export type ItemRef = { kind: ItemKind; id: string };

/**
 * Spec D D4's primitive: of `items`, the LIVE ones this viewer cannot see. A concept is visible to a
 * reader exactly when this answers `[]` for its items.
 *
 * - **POSITIVE form: hidden = live − visible.** The visible half is the exact shape `readSearch` uses
 *   (`routes/search.ts:216-228, 293-296`: inner join to `proj_visibility`, `visibleTicketsWhere`,
 *   `LIVE_TICKET_WHERE`), and the predicates are CONSUMED, never NOT-ed. A negated predicate fails OPEN:
 *   a ticket with no `proj_visibility` row drops out of an inner join and would count as seen, and a NULL
 *   from any arm makes `NOT (NULL)` drop the row too. Here both of those land in "hidden".
 * - **Trashed and absent items are ignored**, not hidden. A concept keeps a trashed ticket's tag (trash
 *   keeps rows), and a reader is not refused a concept because of an item nobody can see in any view.
 *   Restore brings it back into the check.
 */
export async function hiddenItems(
  db: Queryable,
  eff: EffectiveRole,
  userId: string,
  workspaceId: string,
  items: readonly ItemRef[],
): Promise<ItemRef[]> {
  const hidden: ItemRef[] = [];
  const ticketIds = [...new Set(items.filter((item) => item.kind === 'ticket').map((item) => item.id))];
  const noteIds = [...new Set(items.filter((item) => item.kind === 'note').map((item) => item.id))];
  if (ticketIds.length > 0) {
    const live = await db.query<{ id: string }>(
      `SELECT t.ticket_id AS id FROM proj_tickets t
        WHERE t.workspace_id = $1 AND t.ticket_id = ANY ($2::text[]) AND ${LIVE_TICKET_WHERE}`,
      [workspaceId, ticketIds],
    );
    const params = new SqlParams();
    const workspace = params.add(workspaceId);
    const ids = params.add(ticketIds);
    const visible = visibleTicketsWhere(eff, userId, params);
    const seen = await db.query<{ id: string }>(
      `SELECT t.ticket_id AS id
         FROM proj_tickets t JOIN proj_visibility v ON v.ticket_id = t.ticket_id
        WHERE t.workspace_id = ${workspace} AND t.ticket_id = ANY (${ids}::text[]) AND ${LIVE_TICKET_WHERE}
          AND ${visible}`,
      params.toArray(),
    );
    const seenIds = new Set(seen.rows.map((row) => row.id));
    for (const row of live.rows) if (!seenIds.has(row.id)) hidden.push({ kind: 'ticket', id: row.id });
  }
  if (noteIds.length > 0) {
    const live = await db.query<{ id: string }>(
      'SELECT n.note_id AS id FROM proj_notes n WHERE n.workspace_id = $1 AND n.note_id = ANY ($2::text[]) AND n.deleted = FALSE',
      [workspaceId, noteIds],
    );
    const params = new SqlParams();
    const workspace = params.add(workspaceId);
    const ids = params.add(noteIds);
    const visible = visibleNotesWhere(eff, userId, params);
    const seen = await db.query<{ id: string }>(
      `SELECT n.note_id AS id FROM proj_notes n
        WHERE n.workspace_id = ${workspace} AND n.note_id = ANY (${ids}::text[]) AND n.deleted = FALSE AND ${visible}`,
      params.toArray(),
    );
    const seenIds = new Set(seen.rows.map((row) => row.id));
    for (const row of live.rows) if (!seenIds.has(row.id)) hidden.push({ kind: 'note', id: row.id });
  }
  return hidden;
}
