import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import type { Queryable } from '../db/queryable.js';
import { READ_NOT_FOUND_BODY, requireMember } from '../read/membership.js';
import { listMyDrafts, type DraftListItem } from '../read/drafts.js';

/**
 * G8 (drafts spec §4.2): the two reads of "my drafts". The subject is the SESSION user and there is no
 * parameter that names another (`routes/my-work.ts`'s rule): a route that offered one would be a read of
 * someone else's private drafts behind a 200.
 */
export function registerDraftRoutes(
  app: FastifyInstance,
  deps: { pool: Queryable },
  requireSession: preHandlerHookHandler,
): void {
  app.get<{ Params: { workspaceId: string } }>(
    '/v1/workspaces/:workspaceId/drafts',
    { preHandler: requireSession },
    async (request, reply) => {
      const { workspaceId } = request.params;
      if ((await requireMember(deps.pool, request.currentUserId, workspaceId)) === null) {
        return reply.code(404).send(READ_NOT_FOUND_BODY);
      }
      return { items: await listMyDrafts(deps.pool, request.currentUserId, workspaceId) };
    },
  );

  // Every workspace the caller belongs to, like `GET /v1/me/deleted-items` (`routes/deleted-items.ts:15`):
  // MCP's `list_my_drafts` pages over this list (T7).
  app.get<{ Querystring: { workspaceId?: string; projectId?: string } }>(
    '/v1/me/drafts',
    { preHandler: requireSession },
    async (request) => {
      const userId = request.currentUserId;
      const { workspaceId, projectId } = request.query;
      const { rows } = await deps.pool.query<{ workspace_id: string }>(
        `SELECT m.workspace_id
           FROM proj_memberships m
           LEFT JOIN proj_workspaces pw ON pw.workspace_id = m.workspace_id
          WHERE m.user_id = $1 AND m.scope_kind = 'workspace' AND pw.deleted_at IS NULL
          ORDER BY m.workspace_id`,
        [userId],
      );
      const items: Array<DraftListItem & { workspaceId: string }> = [];
      for (const row of rows) {
        if (workspaceId !== undefined && row.workspace_id !== workspaceId) continue;
        const drafts = await listMyDrafts(deps.pool, userId, row.workspace_id, projectId === undefined ? {} : { projectId });
        for (const draft of drafts) items.push({ ...draft, workspaceId: row.workspace_id });
      }
      items.sort((a, b) =>
        a.updatedAt === b.updatedAt ? (a.ticketId < b.ticketId ? 1 : -1) : a.updatedAt < b.updatedAt ? 1 : -1,
      );
      return { items };
    },
  );
}
