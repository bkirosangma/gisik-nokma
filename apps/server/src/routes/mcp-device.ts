import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import type { Queryable } from '../db/queryable.js';
import {
  approveDeviceCode,
  DEVICE_CODE_TTL_SEC,
  exchangeDeviceCode,
  mintDeviceCode,
  POLL_INTERVAL_SEC,
} from '../mcp/token-store.js';

/** The four refusal bodies this surface answers with. Single-key, like every
 *  other refusal on the read surface — `{error: 'not_found'}` is the house
 *  shape and these are its siblings. Built once so route and test name one
 *  object each. */
export const UNKNOWN_CODE_BODY = { error: 'unknown_code' } as const;
export const EXPIRED_CODE_BODY = { error: 'expired_code' } as const;
export const INVALID_BODY = { error: 'invalid' } as const;

/**
 * The device-authorization flow, in three doors.
 *
 * ## Why two of them are unauthenticated, and why that is not a hole
 *
 * `POST /v1/mcp/device/code` and `POST /v1/mcp/device/token` carry no session
 * BY DESIGN — the whole point of a device flow is that the thing asking for a
 * credential does not have one yet. Neither door gives anything away: the mint
 * hands back a code that authorises nothing until a signed-in person approves
 * it, and the exchange answers `pending` forever unless somebody with a
 * session has approved that exact grant. The credential is created by the
 * APPROVAL, which is the door that requires identity.
 *
 * ## Why the approval is the CSRF-sensitive one
 *
 * It is a cookie-authenticatable POST that mints a credential, which is the
 * exact category `HTTP_ORIGIN_PROTECTED_ROUTES` exists for and the reason
 * `/v1/workspaces/:workspaceId/invites` is already in it. Without that
 * membership, a page the victim visits can POST an approval for the ATTACKER's
 * device code with the victim's ambient cookie, and the attacker polls a token
 * for the victim's account. `SameSite=Lax` does not close it — `http-origin.ts`
 * records at length that the product and API are same-site siblings of one
 * registrable domain, so the origin check is not defence in depth here, it is
 * the defence.
 *
 * ## Bucket
 *
 * All three routes are charged to the `mcp:` limiter (see `app.ts`), a fourth
 * bucket fed by `RATE_LIMIT_AUTH_MAX` — the `inviteMax` precedent, no new
 * environment variable. A separate bucket rather than sharing `auth:` because
 * a CLI polling every 12 seconds must not be able to lock a person out of
 * signing in from the same machine, and a brute-force sweep of the 8-character
 * user code must not be able to spend the sign-in budget either.
 */
export function registerMcpDeviceRoutes(
  app: FastifyInstance,
  deps: { pool: Queryable; webOrigin: string; now?: () => Date },
  requireSession: preHandlerHookHandler,
): void {
  const now = deps.now ?? (() => new Date());

  app.post(
    '/v1/mcp/device/code',
    { schema: { body: { type: 'object', additionalProperties: false, properties: {} } } },
    async () => {
      const grant = await mintDeviceCode(deps.pool, now());
      return {
        deviceCode: grant.deviceCode,
        userCode: grant.userCode,
        // The WEB origin, never this API's own. The approver's session cookie
        // is presented from the web client, and an approval POST originating
        // anywhere else fails the HTTP-Origin check by construction.
        verificationUri: `${deps.webOrigin}/mcp/authorize`,
        expiresInSec: DEVICE_CODE_TTL_SEC,
        pollIntervalSec: POLL_INTERVAL_SEC,
      };
    },
  );

  app.post(
    '/v1/mcp/device/approve',
    {
      preHandler: requireSession,
      schema: {
        body: {
          type: 'object',
          required: ['userCode'],
          additionalProperties: false,
          properties: { userCode: { type: 'string', minLength: 1 } },
        },
      },
    },
    async (request, reply) => {
      const { userCode } = request.body as { userCode: string };
      const outcome = await approveDeviceCode(
        deps.pool,
        userCode.trim().toUpperCase(),
        request.currentUserId,
        now(),
      );
      if (outcome === 'expired') return reply.code(410).send(EXPIRED_CODE_BODY);
      if (outcome === 'unknown') return reply.code(404).send(UNKNOWN_CODE_BODY);
      return reply.code(200).send({ approved: true });
    },
  );

  app.post(
    '/v1/mcp/device/token',
    {
      schema: {
        body: {
          type: 'object',
          required: ['deviceCode'],
          additionalProperties: false,
          properties: { deviceCode: { type: 'string', minLength: 1 } },
        },
      },
    },
    async (request, reply) => {
      const { deviceCode } = request.body as { deviceCode: string };
      const outcome = await exchangeDeviceCode(deps.pool, deviceCode, now());
      if (outcome.status === 'unknown') return reply.code(404).send(UNKNOWN_CODE_BODY);
      if (outcome.status === 'expired') return reply.code(410).send(EXPIRED_CODE_BODY);
      if (outcome.status === 'pending') return reply.code(200).send({ status: 'pending' });
      return reply
        .code(200)
        .send({ status: 'issued', token: outcome.token, userId: outcome.userId });
    },
  );
}
