import type { StateCategory, TicketLinkKind } from '@gisik-nokma/domain';
import type { Queryable } from '../db/queryable.js';
import type { EffectiveRole } from '../permissions/effective-role.js';
import { keysForAncestors } from './ancestry.js';
import { SqlParams } from './sql-params.js';
import { listMyDrafts } from './drafts.js';
import { LIVE_BASE_WHERE, LIVE_TICKET_WHERE, visibleTicketsWhere } from './visible-where.js';

export type TicketLinkWire = {
  kind: TicketLinkKind;
  direction: 'out' | 'in';
  ticket: { id: string; projectId: string; key: string | null; title: string; stateCategory: StateCategory };
};

/**
 * Both directions of one ticket's typed links, as `viewerId` may see them
 * (spec A §2.4): a row whose OTHER end is hidden or trashed is not returned,
 * and nothing counts it. The caller has already answered `ticketAccess(ticketId)` and passes `ownDrafts` when that
 * is `'own-draft'`.
 * The visibility predicate is the one every list uses (`visibleTicketsWhere`,
 * over `proj_visibility v` and `proj_tickets t`), so this read and the board
 * cannot disagree about what this person sees.
 */
export async function listTicketLinks(
  db: Queryable,
  eff: EffectiveRole,
  viewerId: string,
  workspaceId: string,
  ticketId: string,
  opts: { ownDrafts?: boolean } = {},
): Promise<TicketLinkWire[]> {
  const params = new SqlParams();
  const ws = params.add(workspaceId);
  const me = params.add(ticketId);
  // Drafts R41: on a DRAFT's own sheet the author's other drafts are ends too. On a published ticket's sheet a
  // draft end stays hidden even from its author (decision 5): a draft is named only where the author opened it.
  const own = opts.ownDrafts === true ? (await listMyDrafts(db, viewerId, workspaceId)).map((d) => d.ticketId) : [];
  const visible = visibleTicketsWhere(eff, viewerId, params);
  const ends =
    own.length === 0
      ? `${LIVE_TICKET_WHERE} AND ${visible}`
      : `((${LIVE_TICKET_WHERE} AND ${visible}) OR (${LIVE_BASE_WHERE} AND t.ticket_id = ANY(${params.add(own)}::text[])))`;
  const { rows } = await db.query<{
    kind: TicketLinkKind;
    direction: 'out' | 'in';
    ticket_id: string;
    project_id: string;
    title: string | null;
    state_category: StateCategory;
  }>(
    `SELECT l.kind,
            CASE WHEN l.source_id = ${me} THEN 'out' ELSE 'in' END AS direction,
            t.ticket_id, t.project_id, t.fields -> 'title' ->> 'value' AS title, t.state_category
       FROM proj_ticket_links l
       JOIN proj_tickets t ON t.ticket_id = CASE WHEN l.source_id = ${me} THEN l.target_id ELSE l.source_id END
       JOIN proj_visibility v ON v.ticket_id = t.ticket_id
      WHERE l.workspace_id = ${ws} AND (l.source_id = ${me} OR l.target_id = ${me})
        AND t.workspace_id = ${ws} AND ${ends}
      ORDER BY l.seq`,
    params.toArray(),
  );
  const keys = await keysForAncestors(
    db,
    workspaceId,
    rows.map((r) => ({ ticketId: r.ticket_id, projectId: r.project_id })),
  );
  return rows.map((r) => ({
    kind: r.kind,
    direction: r.direction,
    ticket: {
      id: r.ticket_id,
      projectId: r.project_id,
      key: keys.get(r.ticket_id) ?? null,
      title: r.title ?? '',
      stateCategory: r.state_category,
    },
  }));
}
