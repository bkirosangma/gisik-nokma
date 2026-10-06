import { SYSTEM_ACTOR_FLOW, type FlowAutoMoveRead } from '@gisik-nokma/domain';
import type { Queryable } from '../db/queryable.js';

/** Newest first. The inspector shows one ticket's own latest five; the read carries the flow's latest fifty. */
export const AUTO_MOVE_LIMIT = 50;

type CauseRow = { entity_id: string; server_time: Date; payload: { cause?: { kind?: string; sourceTicketId?: string; decisionTicketId?: string; outcome?: string; pass?: number } } };

/**
 * What the flow actor did to the tickets of one read (WG-3's "Automatic moves in this flow"), newest first. The two event
 * types are the ones Part 2's causes ride on: `ticket.transitioned` for a promotion or a reset, `ticket.closed` for a
 * Not-taken close. A reset of a FINISHED ticket files a `ticket.reopened` beside its `ticket.transitioned`, both carrying
 * the cause; only the transition is read, so one reset is one move. The cause is read off the payload. When the ticket it
 * names is not in the viewer's flow, `becauseTicketId` is blanked (FL-1: a hole leaves no id) and the `outcome` key is
 * absent: a hidden Decision's outcome is its authored branch name (planner ruling 2026-10-06 05:46). A `led-to` cause's
 * label is never read here.
 */
export async function loadAutoMoves(db: Queryable, workspaceId: string, ids: readonly string[]): Promise<FlowAutoMoveRead[]> {
  if (ids.length === 0) return [];
  const { rows } = await db.query<CauseRow>(
    `SELECT e.entity_id, e.server_time, e.payload
       FROM events e
      WHERE e.workspace_id = $1 AND e.actor_id = $2 AND e.type IN ('ticket.transitioned', 'ticket.closed')
        AND e.entity_id = ANY($3::text[]) AND e.payload->'cause'->>'kind' IN ('led-to', 'reopened-by-flow', 'branch-not-taken')
      ORDER BY e.server_time DESC, e.id DESC
      LIMIT ${AUTO_MOVE_LIMIT}`,
    [workspaceId, SYSTEM_ACTOR_FLOW, [...ids]],
  );
  const inFlow = new Set(ids);
  return rows.map((row) => {
    const cause = row.payload.cause ?? {};
    const kind = cause.kind as FlowAutoMoveRead['kind'];
    const because = kind === 'led-to' ? cause.sourceTicketId : cause.decisionTicketId;
    const seen = because !== undefined && inFlow.has(because);
    return {
      ticketId: row.entity_id,
      at: row.server_time.toISOString(),
      kind,
      becauseTicketId: seen ? because : null,
      pass: typeof cause.pass === 'number' ? cause.pass : null,
      ...(seen ? { outcome: typeof cause.outcome === 'string' ? cause.outcome : null } : {}),
    };
  });
}
