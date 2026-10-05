import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import type { Queryable } from '../db/queryable.js';
import { readFlowView } from '../flow/flow-view.js';
import { ticketIsLive, ticketIsOpenable } from '../read/live-ticket.js';
import { READ_NOT_FOUND_BODY, requireMember } from '../read/membership.js';
import { ticketAccess } from '../visibility/can-open.js';

/**
 * The seed's liveness, in the path's workspace. A visible ticket asks `ticketIsLive` (`LIVE_TICKET_WHERE`); the author's own
 * draft asks `ticketIsOpenable` (`LIVE_BASE_WHERE`: not deleted, its project not deleted), because `LIVE_TICKET_WHERE`
 * refuses every draft. Both are scoped to the PATH's workspace: `ticketAccess` reads the ticket's own workspace, so without
 * that clause a draft of workspace B would seed a read in workspace A.
 */
// planner ruling 2026-10-04: T3-Q1 (spec FL-1 :363 "plus the viewer's own drafts", D-8 :817)
async function seedIsLive(db: Queryable, workspaceId: string, ticketId: string, access: 'visible' | 'own-draft'): Promise<boolean> {
  if (access === 'visible') return ticketIsLive(db, workspaceId, ticketId);
  return ticketIsOpenable(db, workspaceId, ticketId);
}

/**
 * `GET /v1/workspaces/:workspaceId/tickets/:ticketId/flow` (FL-1, FL-2; Part 3 D-W3-4): one `FlowRead` for the signed-in
 * viewer, seeded from a ticket they can see or their own draft (`ticketAccess`, the detail route's door). A caller outside
 * the workspace, a seed they cannot open, one that does not exist and one that is deleted all answer the one shared 404
 * body, so the route is no oracle (planner ruling 2026-10-04: T3-Q4, the guard order need not be the attachments route's).
 */
export function registerFlowRoutes(app: FastifyInstance, deps: { pool: Queryable }, requireSession: preHandlerHookHandler): void {
  app.get<{ Params: { workspaceId: string; ticketId: string } }>(
    '/v1/workspaces/:workspaceId/tickets/:ticketId/flow',
    { preHandler: requireSession },
    async (request, reply) => {
      const { workspaceId, ticketId } = request.params;
      const eff = await requireMember(deps.pool, request.currentUserId, workspaceId);
      if (eff === null) return reply.code(404).send(READ_NOT_FOUND_BODY);
      // planner ruling 2026-10-04: T3-Q1 — `ticketAccess` replaces `canSee`, so the author's own draft is a seed
      const access = await ticketAccess(deps.pool, request.currentUserId, ticketId);
      if (access === 'none') return reply.code(404).send(READ_NOT_FOUND_BODY);
      if (!(await seedIsLive(deps.pool, workspaceId, ticketId, access))) return reply.code(404).send(READ_NOT_FOUND_BODY);
      return readFlowView(deps.pool, { workspaceId, seedId: ticketId, viewerId: request.currentUserId, eff });
    },
  );
}
