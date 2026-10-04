import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import { parseLinkedFromTarget, type LinkedFromTarget } from '@gisik-nokma/domain';
import type { Queryable } from '../db/queryable.js';
import { resolveEffectiveRole } from '../permissions/effective-role.js';
import { getNoteStateFromDb } from '../projections/notes.js';
import { listLinkedFrom } from '../read/linked-from.js';
import { ticketIsLive } from '../read/live-ticket.js';
import { canSee } from '../visibility/can-see.js';
import { canReadNoteById } from '../visibility/can-read-note.js';
import { NOT_FOUND_BODY } from './tickets.js';

/**
 * `GET /v1/workspaces/:workspaceId/references?target=<ticket|note>:<id>&cursor=<seq>` —
 * "Linked from" (Knowledge Graph spec B §3.2). The TARGET is checked here (the
 * viewer must be able to see it, in THIS workspace); the sources are filtered by
 * `listLinkedFrom`. An invisible, foreign and unknown target are one 404.
 */
async function targetVisible(db: Queryable, userId: string, workspaceId: string, target: LinkedFromTarget): Promise<boolean> {
  if (target.kind === 'ticket') {
    // `ticketIsLive` pins the workspace AND refuses a trashed ticket, like the detail route.
    return (await ticketIsLive(db, workspaceId, target.id)) && (await canSee(db, userId, target.id));
  }
  const state = await getNoteStateFromDb(db, target.id);
  if (state === null || state.workspaceId !== workspaceId) return false;
  return canReadNoteById(db, userId, target.id);
}

export function registerReferenceRoutes(app: FastifyInstance, deps: { pool: Queryable }, requireSession: preHandlerHookHandler): void {
  app.get<{ Params: { workspaceId: string }; Querystring: { target?: string; cursor?: string } }>(
    '/v1/workspaces/:workspaceId/references',
    { preHandler: requireSession },
    async (request, reply) => {
      const userId = request.currentUserId;
      const { workspaceId } = request.params;
      const target = parseLinkedFromTarget(request.query.target);
      if (target === null) return reply.code(400).send({ error: 'invalid_target' });
      const cursor = request.query.cursor ?? null;
      if (cursor !== null && !/^\d{1,18}$/.test(cursor)) return reply.code(400).send({ error: 'invalid_cursor' });
      if (!(await targetVisible(deps.pool, userId, workspaceId, target))) return reply.code(404).send(NOT_FOUND_BODY);
      const eff = await resolveEffectiveRole(deps.pool, userId, workspaceId);
      return listLinkedFrom(deps.pool, eff, userId, workspaceId, target, cursor);
    },
  );
}
