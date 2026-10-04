import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import type { Queryable } from '../db/queryable.js';
import { resolveEffectiveRole } from '../permissions/effective-role.js';
import { listTicketLinks } from '../read/ticket-links.js';
import { ticketAccess } from '../visibility/can-open.js';
import { NOT_FOUND_BODY } from './tickets.js';

/**
 * Spec A §3.1/§4: one ticket's links, both directions, visible ends only. A ticket you cannot see is a 404, byte-identical to one that does not exist.
 * A draft is a 404 to everyone but its author (the unknown-ticket body, R9).
 */
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
      const access = await ticketAccess(deps.pool, userId, ticketId);
      if (access === 'none') return reply.code(404).send(NOT_FOUND_BODY);
      const eff = await resolveEffectiveRole(deps.pool, userId, workspaceId);
      return { links: await listTicketLinks(deps.pool, eff, userId, workspaceId, ticketId, { ownDrafts: access === 'own-draft' }) };
    },
  );
}
