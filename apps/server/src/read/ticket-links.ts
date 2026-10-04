import type { StateCategory, TicketLinkKind } from '@gisik-nokma/domain';
import type { Queryable } from '../db/queryable.js';
import type { EffectiveRole } from '../permissions/effective-role.js';
import { keysForAncestors } from './ancestry.js';
import { SqlParams } from './sql-params.js';
import { LIVE_TICKET_WHERE, visibleTicketsWhere } from './visible-where.js';

export type TicketLinkWire = {
  kind: TicketLinkKind;
  direction: 'out' | 'in';
  ticket: { id: string; projectId: string; key: string | null; title: string; stateCategory: StateCategory };
};

/**
 * Both directions of one ticket's typed links, as `viewerId` may see them
 * (spec A §2.4): a row whose OTHER end is hidden or trashed is not returned,
 * and nothing counts it. The caller has already answered `canSee(ticketId)`.
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
): Promise<TicketLinkWire[]> {
  const params = new SqlParams();
  const ws = params.add(workspaceId);
  const me = params.add(ticketId);
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
        AND t.workspace_id = ${ws} AND ${LIVE_TICKET_WHERE} AND ${visibleTicketsWhere(eff, viewerId, params)}
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
