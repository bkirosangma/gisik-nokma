import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import type { Queryable } from '../db/queryable.js';
import { readDeletedItems } from '../read/deleted-items.js';

/**
 * `GET /v1/me/deleted-items` (trash series, Plan 1 Task 7, spec §6.3's read).
 * The whole visibility decision lives in `readDeletedItems`; this route is
 * the door and nothing else.
 */
export function registerDeletedItemsRoutes(
  app: FastifyInstance,
  deps: { pool: Queryable },
  requireSession: preHandlerHookHandler,
): void {
  app.get('/v1/me/deleted-items', { preHandler: requireSession }, async (request) => {
    const items = await readDeletedItems(deps.pool, request.currentUserId);
    return { items };
  });
}
