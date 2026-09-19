import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import { z } from 'zod';
import type { Queryable } from '../db/queryable.js';
import { listMcpTokens, nameMcpToken, revokeMcpToken } from '../mcp/token-store.js';

/**
 * What a person may call a token (door D, 2026-09-19).
 *
 * **REFUSES a blank and does NOT trim, for `displayName`'s own reasons** (the
 * domain's `displayName`, `packages/domain/src/events/membership.ts`): `.min(1)`
 * alone admits `'   '`, which names nothing while looking like a name
 * everywhere it is displayed, and quietly rewriting `'  CI  '` to `'CI'` would
 * put words in the person's mouth.
 *
 * **BOUNDED at 60 because this is a row LABEL, not prose.** The prototype draws
 * two: `Claude Desktop — Anjali` and `CI — ticket sync`. 60 is generous for a
 * label and short enough that the row cannot be pushed out of shape by it — and
 * it is deliberately NOT a column constraint (see the migration): one rule, in
 * the one place that reads it.
 */
export const mcpTokenNameSchema = z
  .string()
  .min(1)
  .max(60)
  .refine((value) => value.trim() !== '', 'must not be blank — a name of only spaces names nothing');

/** The one body a malformed name draws. Fixed text, so a caller cannot learn from the shape of a refusal. */
export const INVALID_TOKEN_NAME_BODY = {
  error: 'invalid',
  message: `A token name must be 1 to 60 characters and cannot be only spaces.`,
} as const;

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

  /**
   * Name a token the caller already holds (door D, 2026-09-19).
   *
   * ## A PUT on this path, and that is the whole of its CSRF story
   *
   * **PUT rather than PATCH, and the reason is blast radius measured rather
   * than taste.** `HttpClient` (`packages/app-core/src/online/http.ts`) carries
   * `get/post/put/del` and no `patch`; six files in this repo provide a `del:`
   * to satisfy that type, so widening the interface would edit every test double
   * in the product to serve one route. Setting a name is idempotent — the same
   * value twice is the same row — so PUT is honest here and not a compromise.
   *
   * `HTTP_ORIGIN_PROTECTED_ROUTES` is matched by **route URL, with no method in
   * the key** (`http-origin.ts` — it tests `MUTATING_METHODS` for the method and
   * then `has(input.routeUrl)`), and `/v1/me/mcp-tokens/:id` is already in that
   * set for the DELETE below. **So this route is protected by construction, and
   * adding an entry would be a second copy of a rule that is already true.** A
   * claim of coverage is worth exactly as much as its test, so the route's
   * protection is asserted beside it by a forged-`Origin` request rather than by
   * reading the set — the same standard the DELETE's own docblock sets, and for
   * the same reason: a test that only reads the list passes while the route sits
   * outside it.
   *
   * Choosing a method that ADDS to this path rather than a new path is
   * deliberate for that reason. A `/v1/me/mcp-tokens/:id/name` path would have
   * needed its own entry, and a rule that must be remembered is one that gets
   * forgotten.
   *
   * ## 404 for both "not yours" and "does not exist"
   *
   * The store scopes by owner inside the UPDATE, so the two are the same answer
   * by construction rather than by a comparison made here. Same probe-resistance
   * as the DELETE, and the same fixed refusal body as the name schema above.
   *
   * ## The name is read from the BODY, which is parsed before anything is written
   *
   * `mcpTokenNameSchema` refuses blank, over-long and whitespace-only names with
   * one fixed sentence. The store does not re-check: one rule, one reader.
   */
  app.put<{ Params: { id: string }; Body: unknown }>(
    '/v1/me/mcp-tokens/:id',
    { preHandler: requireSession },
    async (request, reply) => {
      const parsed = mcpTokenNameSchema.safeParse(
        (request.body as { name?: unknown } | null)?.name,
      );
      if (!parsed.success) {
        return reply.status(400).send(INVALID_TOKEN_NAME_BODY);
      }
      const named = await nameMcpToken(
        deps.pool,
        request.currentUserId,
        request.params.id,
        parsed.data,
      );
      if (!named) {
        return reply.status(404).send({ error: 'not_found' });
      }
      return reply.status(204).send();
    },
  );
}
