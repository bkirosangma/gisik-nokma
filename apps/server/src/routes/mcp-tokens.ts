import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import type { Queryable } from '../db/queryable.js';
import { listMcpTokens, revokeMcpToken } from '../mcp/token-store.js';

/**
 * `/v1/me/mcp-tokens` — the revoke surface (owner ruling 5, MCP plan Task 12).
 *
 * The plan defaulted to no UI at all: granted in two clicks, withdrawn only by
 * somebody with a `psql` prompt. It flagged that asymmetry as "something a
 * person should agree to knowingly", and the owner ruled for a simple UI. These
 * are the two routes behind it.
 *
 * ## Rows are the caller's own by construction, not by filter
 *
 * Both queries are scoped with `request.currentUserId` — never a query
 * parameter, a path segment or a header the caller controls — the same
 * preHandler-by-parameter convention every `/v1/me/*` route uses
 * (`notifications.ts`, `my-work.ts`, `preferences.ts`, `workspaces.ts`): a
 * route that reads `request.currentUserId` cannot be assembled without the
 * thing that sets it.
 *
 * ## The DELETE is probe-resistant
 *
 * It answers 404 `{error:'not_found'}` for a token that is not the caller's AND
 * for one that does not exist at all, matching `POST
 * /v1/me/notifications/:id/read`. Distinguishing them would turn this route
 * into an oracle for which token hashes exist — and the scoping lives inside
 * the DELETE statement, so there is no window in which a stranger's row is read
 * on the way to refusing them.
 *
 * ## It is inside HTTP_ORIGIN_PROTECTED_ROUTES
 *
 * A cookie-authenticatable mutation, so a forged-`Origin` POST from a page the
 * victim visits must not reach it — the same category as the approval POST that
 * mints the credential this route destroys. Membership is asserted by a planted
 * defect in the test beside it, not by reading the set: a test that only reads
 * the list would pass while the route sat outside it.
 */
export function registerMcpTokenRoutes(
  app: FastifyInstance,
  deps: { pool: Queryable },
  requireSession: preHandlerHookHandler,
): void {
  app.get('/v1/me/mcp-tokens', { preHandler: requireSession }, async (request) => {
    return { tokens: await listMcpTokens(deps.pool, request.currentUserId) };
  });

  app.delete<{ Params: { id: string } }>(
    '/v1/me/mcp-tokens/:id',
    { preHandler: requireSession },
    async (request, reply) => {
      const revoked = await revokeMcpToken(deps.pool, request.currentUserId, request.params.id);
      if (!revoked) {
        return reply.status(404).send({ error: 'not_found' });
      }
      return reply.status(204).send();
    },
  );
}
