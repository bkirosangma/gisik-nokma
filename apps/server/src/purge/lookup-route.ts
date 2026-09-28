import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import { PURGED_LOOKUP_MAX_IDS, ULID_REGEX, type PurgedRef } from '@gisik-nokma/domain';
import type { Queryable } from '../db/queryable.js';
import { purgedRefsAmong } from './purged-lookup.js';

/**
 * `POST /v1/purged-lookup` (trash series Plan 3, deviation D1). A signed-in
 * caller names up to `PURGED_LOOKUP_MAX_IDS` ids it already holds and learns
 * which were permanently erased. Content-free by construction: the answer is
 * kinds and ids the caller sent, never a name, a title or a workspace. It is
 * the delivery a device cannot get from the stream (a purged ticket's
 * tombstone is invisible to everyone, `visibility/visible-events-for.ts`) and
 * the only way the web can draw a chip to an erased item as "Deleted item".
 */
export type PurgedLookupResponse = { purged: PurgedRef[] };

export function registerPurgedLookupRoute(
  app: FastifyInstance,
  deps: { pool: Queryable },
  requireSession: preHandlerHookHandler,
): void {
  app.post<{ Body: { ids: string[] } }>(
    '/v1/purged-lookup',
    {
      preHandler: requireSession,
      schema: {
        body: {
          type: 'object',
          required: ['ids'],
          additionalProperties: false,
          properties: {
            ids: {
              type: 'array',
              maxItems: PURGED_LOOKUP_MAX_IDS,
              items: { type: 'string', pattern: ULID_REGEX.source },
            },
          },
        },
      },
    },
    async (request): Promise<PurgedLookupResponse> => ({
      purged: await purgedRefsAmong(deps.pool, request.body.ids),
    }),
  );
}
