import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import type { Queryable } from '../db/queryable.js';
import { resolveEffectiveRole } from '../permissions/effective-role.js';
import { listTicketLinks } from '../read/ticket-links.js';
import { canSee } from '../visibility/can-see.js';
import { NOT_FOUND_BODY } from './tickets.js';

/** Spec A §3.1/§4: one ticket's links, both directions, visible ends only. A ticket you cannot see is a 404, byte-identical to one that does not exist. */
export function registerTicketLinkRoutes(
  app: FastifyInstance,
  deps: { pool: Queryable },
  requireSession: preHandlerHookHandler,
): void {
  app.get<{ Params: { workspaceId: string; ticketId: string } }>(
    '/v1/workspaces/:workspaceId/tickets/:ticketId/links',
    { preHandler: requireSession },
    async (request, reply) => {
      const userId = request.currentUserId;
      const { workspaceId, ticketId } = request.params;
      if (!(await canSee(deps.pool, userId, ticketId))) return reply.code(404).send(NOT_FOUND_BODY);
      const eff = await resolveEffectiveRole(deps.pool, userId, workspaceId);
      return { links: await listTicketLinks(deps.pool, eff, userId, workspaceId, ticketId) };
    },
  );
}
