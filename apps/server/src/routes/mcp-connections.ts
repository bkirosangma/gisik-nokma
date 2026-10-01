import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import type { Queryable } from '../db/queryable.js';
import { listConnections, revokeConnection } from '../mcp/oauth-store.js';

/**
 * The hosted MCP door's half of "Connected assistants" (remote-MCP plan Task 8):
 * the connections a person made by pasting the URL into an assistant app, listed
 * beside the local tokens `routes/mcp-tokens.ts` serves.
 *
 * Registered ALWAYS, not only when `MCP_PUBLIC_URL` is set: with the door off the
 * list is simply empty, and `GET /v1/mcp/public-url` answers `{ url: null }` so
 * the web screen can hide its Connect panel without a build-time variable.
 *
 * ## Rows are the caller's own by construction
 *
 * `listConnections` and `revokeConnection` are scoped by `request.currentUserId`
 * inside the SQL — never by a path segment or a query parameter — so the DELETE
 * answers 404 for "not yours" and "does not exist" alike, the probe-resistance
 * `DELETE /v1/me/mcp-tokens/:id` keeps. Deleting the connection cascades to its
 * access and refresh tokens, so the assistant is signed out at once.
 *
 * The DELETE is a cookie-authenticatable mutation, so its route is in
 * `HTTP_ORIGIN_PROTECTED_ROUTES`.
 */
export function registerMcpConnectionRoutes(
  app: FastifyInstance,
  deps: { pool: Queryable; publicUrl: string | null; now?: () => Date },
  requireSession: preHandlerHookHandler,
): void {
  const now = deps.now ?? (() => new Date());

  app.get('/v1/me/mcp-connections', { preHandler: requireSession }, async (request) => {
    return { connections: await listConnections(deps.pool, request.currentUserId, now()) };
  });

  app.delete<{ Params: { id: string } }>(
    '/v1/me/mcp-connections/:id',
    { preHandler: requireSession },
    async (request, reply) => {
      const revoked = await revokeConnection(deps.pool, request.params.id, request.currentUserId);
      if (!revoked) return reply.status(404).send({ error: 'not_found' });
      return reply.status(204).send();
    },
  );

  // Unauthenticated: the address is public by nature (a person pastes it into
  // another app), and answering only for signed-in callers would add nothing.
  const url = deps.publicUrl === null ? null : `${deps.publicUrl.replace(/\/$/, '')}/mcp`;
  app.get('/v1/mcp/public-url', async () => ({ url }));
}
