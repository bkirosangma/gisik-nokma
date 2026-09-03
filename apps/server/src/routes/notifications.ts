import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import type { Queryable } from '../db/queryable.js';
import { listNotifications, markNotificationRead, unreadNotificationCount } from '../notifications/store.js';

/**
 * `/v1/me/notifications` — the inbox. Three routes, all session-gated with
 * the same preHandler-by-parameter convention every `/v1/me/*` route on this
 * branch uses (`my-work.ts`, `preferences.ts`, `workspaces.ts`): a route that
 * reads `request.currentUserId` cannot be assembled without the thing that
 * sets it.
 *
 * ## Rows are the caller's own by construction, not by filter
 *
 * Every query below is scoped with `request.currentUserId` — never a query
 * parameter, a path segment, or a header the caller controls. There is no
 * `userId` parameter anywhere here on purpose: `listNotifications`,
 * `markNotificationRead` and `unreadNotificationCount` all take the viewer id
 * as an argument supplied by this route, not read off the request body.
 *
 * ## Mark-read is probe-resistant
 *
 * `POST /v1/me/notifications/:id/read` answers 404 `{error:'not_found'}` for
 * a row that is not the caller's and for a row that does not exist at all —
 * the same shape Plan 4's ticket reads chose, so a caller who supplies
 * someone else's id learns nothing about whether that id exists. It is also
 * idempotent: marking an already-read row of your own is still 204.
 *
 * ## Unredacted by design
 *
 * `listNotifications` (Task 4) carries no visibility join and none is added
 * here — a delivered notification stays exactly as delivered even after the
 * underlying ticket's visibility narrows (Plan 9 coordination ruling: "a
 * message you were sent is yours; revocation removes future sight, not
 * letters delivered").
 */
/**
 * The ceiling `listNotifications` (`notifications/store.ts`) already clamps
 * to (`Math.min(Math.max(opts.limit ?? 30, 1), 100)`). This route follows
 * `src/routes/list.ts`'s CONVENTION — refuse an out-of-range or non-integer
 * `limit` with 400 rather than silently clamping or defaulting it — using
 * `list.ts`'s own ceiling value (100), not its `MAX_LIMIT` (200).
 */
const MAX_LIMIT = 100;

export function registerNotificationRoutes(
  app: FastifyInstance,
  deps: { pool: Queryable },
  requireSession: preHandlerHookHandler,
): void {
  app.get<{ Querystring: { cursor?: string; limit?: string; workspaceId?: string } }>(
    '/v1/me/notifications',
    { preHandler: requireSession },
    async (request, reply) => {
      const raw = request.query;
      const cursor = typeof raw.cursor === 'string' && raw.cursor.length > 0 ? raw.cursor : null;
      const workspaceId = typeof raw.workspaceId === 'string' && raw.workspaceId.length > 0 ? raw.workspaceId : null;

      let limit: number | undefined;
      // `raw.limit !== undefined`, not a `typeof === 'string'` check: Fastify
      // hands a REPEATED query param (`?limit=1&limit=2`) through as an
      // array, and `list.ts` sends that through `Number()` too (-> NaN ->
      // refused) rather than silently treating it as absent.
      if (raw.limit !== undefined) {
        // `Number` and not `parseInt`, same reasoning as `list.ts`:
        // `parseInt('2.5')` is 2 and passes an integer test that should have
        // refused it. `Number('2.5')` is 2.5 and fails `Number.isInteger`,
        // which is what stops a fractional limit from ever reaching
        // `LIMIT $n` in `listNotifications` (Postgres 22P02 otherwise).
        limit = Number(raw.limit);
        if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
          return reply.status(400).send({ error: 'invalid_limit' });
        }
      }

      return listNotifications(deps.pool, request.currentUserId, { cursor, limit, workspaceId });
    },
  );

  app.get(
    '/v1/me/notifications/unread-count',
    { preHandler: requireSession },
    async (request) => {
      return { unread: await unreadNotificationCount(deps.pool, request.currentUserId) };
    },
  );

  app.post<{ Params: { id: string } }>(
    '/v1/me/notifications/:id/read',
    { preHandler: requireSession },
    async (request, reply) => {
      const marked = await markNotificationRead(deps.pool, request.currentUserId, request.params.id);
      if (!marked) {
        return reply.status(404).send({ error: 'not_found' });
      }
      return reply.status(204).send();
    },
  );
}
