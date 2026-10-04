import { BACKLOG_STATE_ID, planTailRank, type RankAssignment } from '@gisik-nokma/domain';
import type { Queryable } from '../db/queryable.js';
import type { EffectiveRole } from '../permissions/effective-role.js';
import { SqlParams } from './sql-params.js';
import { LIVE_TICKET_WHERE, visibleTicketsWhere } from './visible-where.js';

/**
 * The `ticket.ranked` claims that place a set of just-published tickets at the END of their projects' Backlogs (drafts
 * spec R64, R65, Q15). `setByProject` maps each project to the set's tickets in the project, in the order they must
 * draw; projects are planned in the Map's order. Per project: the Backlog rows `userId` can SEE (`visibleTicketsWhere`,
 * exactly the rows a drag could rank: a `ticket.ranked` on a restricted ticket is refused by the permission gate), then
 * `planTailRank`. A row the publisher cannot see keeps no key and so draws below the new tickets for people who can see it.
 *
 * Read BEFORE the publish transaction, so the set's own tickets are still drafts and `LIVE_TICKET_WHERE` leaves them
 * out; `planTailRank` ignores them either way. It carries a drag's staleness: a row moved by someone else between this
 * read and the commit makes the gate refuse the whole set, which the route reports (the set is all or nothing).
 */
export async function planPublishRanks(
  db: Queryable,
  eff: EffectiveRole,
  userId: string,
  workspaceId: string,
  setByProject: ReadonlyMap<string, readonly string[]>,
): Promise<RankAssignment[]> {
  const out: RankAssignment[] = [];
  for (const [projectId, ticketIds] of setByProject) {
    const params = new SqlParams();
    const { rows } = await db.query<{ ticket_id: string; rank: string | null }>(
      `SELECT t.ticket_id, t.rank
         FROM proj_tickets t
         JOIN proj_visibility v ON v.ticket_id = t.ticket_id
        WHERE t.workspace_id = ${params.add(workspaceId)}
          AND t.project_id = ${params.add(projectId)}
          AND t.state_id = ${params.add(BACKLOG_STATE_ID)}
          AND ${LIVE_TICKET_WHERE}
          AND ${visibleTicketsWhere(eff, userId, params)}`,
      params.toArray(),
    );
    const plan = planTailRank(
      rows.map((row) => ({ ticketId: row.ticket_id, rank: row.rank })),
      ticketIds,
    );
    out.push(...plan.backfill, ...plan.tail);
  }
  return out;
}
