import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import { providerOf } from '../auth/passkey-providers.js';
import type { Queryable } from '../db/queryable.js';

/**
 * The caller's passkeys, for the Account page (devices plan Task 5, cases 6.327-6.329). Read here rather than through the
 * plugin's `listUserPasskeys` because the plugin does not know `lastUsedAt` (FD5). Named columns, never `SELECT *`: the row holds a
 * public key, a credential id and a replay counter, none of which the page needs. Browser-only - an MCP token gets 403.
 */
const NOT_USED_RECENTLY_MS = 90 * 24 * 60 * 60 * 1000;

export function registerMePasskeyRoutes(
  app: FastifyInstance,
  deps: { pool: Queryable; now?: () => Date },
  requireSession: preHandlerHookHandler,
): void {
  const now = deps.now ?? (() => new Date());
  const sessionOnly: preHandlerHookHandler = async (request, reply) => {
    if (request.authKind !== 'session') await reply.code(403).send({ error: 'session_required' });
  };

  app.get('/v1/me/passkeys', { preHandler: [requireSession, sessionOnly] }, async (request) => {
    const r = await deps.pool.query(
      `SELECT id, name, aaguid, "createdAt", "lastUsedAt" FROM passkey WHERE "userId" = $1 ORDER BY "createdAt", id`,
      [request.currentUserId],
    );
    const cutoff = now().getTime() - NOT_USED_RECENTLY_MS;
    return {
      passkeys: r.rows.map((p) => ({
        id: p.id as string,
        name: (p.name as string | null) ?? null,
        provider: providerOf((p.aaguid as string | null) ?? null),
        createdAt: (p.createdAt as Date).toISOString(),
        lastUsedAt: p.lastUsedAt === null ? null : (p.lastUsedAt as Date).toISOString(),
        notUsedRecently: p.lastUsedAt === null || (p.lastUsedAt as Date).getTime() <= cutoff,
      })),
    };
  });
}
