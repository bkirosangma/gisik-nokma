import { createHash } from 'node:crypto';
import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import { deviceKey, deviceTag } from '../auth/device-cookie.js';
import type { Queryable } from '../db/queryable.js';

/**
 * The signed-in devices of the caller (devices plan Task 3). A "device" is every unexpired session that shares one
 * `gn_device` cookie value; the client only ever sees a one-way `key` and a 4-char `tag`, never the cookie value
 * (FD4). Sessions from before the cookie existed (`deviceId` NULL) group by user agent + address and are flagged
 * `legacy`. Browser-only: an MCP token is refused (403) on both routes.
 */
type Row = {
  id: string;
  deviceId: string | null;
  userAgent: string | null;
  ipAddress: string | null;
  createdAt: Date;
  updatedAt: Date;
  lastSeenAt: Date | null;
};

const legacyKey = (ua: string | null, ip: string | null) =>
  'legacy:' + createHash('sha256').update(`${ua ?? ''}\n${ip ?? ''}`).digest('hex');
const keyOf = (r: Row) => (r.deviceId === null ? legacyKey(r.userAgent, r.ipAddress) : deviceKey(r.deviceId));

async function liveSessions(db: Queryable, userId: string): Promise<Row[]> {
  const r = await db.query(
    `SELECT id, "deviceId", "userAgent", "ipAddress", "createdAt", "updatedAt", "lastSeenAt"
       FROM session WHERE "userId" = $1 AND "expiresAt" > now()`,
    [userId],
  );
  return r.rows as Row[];
}

export function registerMeDeviceRoutes(
  app: FastifyInstance,
  deps: { pool: Queryable },
  requireSession: preHandlerHookHandler,
): void {
  const sessionOnly: preHandlerHookHandler = async (request, reply) => {
    if (request.authKind !== 'session') await reply.code(403).send({ error: 'session_required' });
  };

  app.get('/v1/me/devices', { preHandler: [requireSession, sessionOnly] }, async (request) => {
    const rows = await liveSessions(deps.pool, request.currentUserId);
    const groups = new Map<string, Row[]>();
    for (const r of rows) {
      const key = keyOf(r);
      groups.set(key, [...(groups.get(key) ?? []), r]);
    }
    const devices = [...groups.entries()].map(([key, g]) => {
      const seen = g.map((r) => (r.lastSeenAt ?? r.updatedAt).getTime());
      const first = g.reduce((a, b) => (a.createdAt < b.createdAt ? a : b));
      const sample = g[0]!;
      return {
        key,
        tag: sample.deviceId === null ? null : deviceTag(sample.deviceId),
        userAgent: sample.userAgent,
        isCurrent: g.some((r) => r.id === request.currentSessionId),
        lastSeenAt: new Date(Math.max(...seen)).toISOString(),
        firstSignedInAt: first.createdAt.toISOString(),
        sessionCount: g.length,
        legacy: sample.deviceId === null,
      };
    });
    devices.sort((a, b) => Number(b.isCurrent) - Number(a.isCurrent) || b.lastSeenAt.localeCompare(a.lastSeenAt));
    return { devices };
  });

  app.post<{ Params: { key: string } }>(
    '/v1/me/devices/:key/sign-out',
    { preHandler: [requireSession, sessionOnly] },
    async (request, reply) => {
      const rows = await liveSessions(deps.pool, request.currentUserId);
      const target = rows.filter((r) => keyOf(r) === request.params.key);
      if (target.length === 0) return reply.code(404).send({ error: 'not_found' });
      if (target.some((r) => r.id === request.currentSessionId)) return reply.code(409).send({ error: 'current_device' });
      await deps.pool.query(`DELETE FROM session WHERE "userId" = $1 AND id = ANY($2::text[])`, [
        request.currentUserId,
        target.map((r) => r.id),
      ]);
      return reply.code(204).send();
    },
  );
}
