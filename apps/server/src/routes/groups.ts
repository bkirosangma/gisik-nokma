import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import type { GroupListResponse, GroupRow } from '@gisik-nokma/domain';
import type { Queryable } from '../db/queryable.js';
import { READ_NOT_FOUND_BODY, requireMember } from '../read/membership.js';

/**
 * `GET /v1/workspaces/:workspaceId/groups` (prefixes and groups plan Task 6, spec
 * R3/R7) — the workspace's project-group tree, flat, with the two counts a tree
 * screen needs.
 *
 * **Who may read it: a workspace owner, admin or member; a guest and a
 * non-member get the same 404** the project list gives an outsider
 * (`READ_NOT_FOUND_BODY`, one answer for "not yours" and "not there"). A guest
 * sees no project list beyond the projects they were let into, and a group
 * tree names structure they were never told about, so it is withheld rather
 * than served empty — an empty list would be a false statement about a
 * workspace that has groups.
 *
 * Siblings sort by `rank` (then id, so equal ranks are stable); the client folds
 * the flat rows into a tree by `parentId`. `projectCount` counts the projects
 * filed DIRECTLY under the group, trashed ones included (they still point at it,
 * and the door's in-use check counts them the same way); `childCount` the groups
 * directly under it.
 */
export function registerGroupRoutes(
  app: FastifyInstance,
  deps: { pool: Queryable },
  requireSession: preHandlerHookHandler,
): void {
  app.get<{ Params: { workspaceId: string } }>(
    '/v1/workspaces/:workspaceId/groups',
    { preHandler: requireSession },
    async (request, reply) => {
      const { workspaceId } = request.params;
      const eff = await requireMember(deps.pool, request.currentUserId, workspaceId);
      if (eff === null || eff.workspaceRole === 'guest') {
        return reply.code(404).send(READ_NOT_FOUND_BODY);
      }
      const { rows } = await deps.pool.query<{
        group_id: string;
        parent_id: string | null;
        level: number;
        name: string;
        rank: string;
        project_count: number;
        child_count: number;
      }>(
        `SELECT g.group_id, g.parent_id, g.level, g.name, g.rank,
                (SELECT count(*)::int FROM proj_projects p
                  WHERE p.workspace_id = g.workspace_id AND p.group_id = g.group_id) AS project_count,
                (SELECT count(*)::int FROM proj_groups c
                  WHERE c.workspace_id = g.workspace_id AND c.parent_id = g.group_id) AS child_count
           FROM proj_groups g
          WHERE g.workspace_id = $1
          ORDER BY g.level, g.rank, g.group_id`,
        [workspaceId],
      );
      const groups: GroupRow[] = rows.map((row) => ({
        id: row.group_id,
        parentId: row.parent_id,
        level: row.level as GroupRow['level'],
        name: row.name,
        rank: row.rank,
        projectCount: row.project_count,
        childCount: row.child_count,
      }));
      const body: GroupListResponse = { workspaceId, groups };
      return body;
    },
  );
}
