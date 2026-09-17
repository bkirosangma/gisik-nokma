import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import { notificationPreferencesSchema } from '@gisik-nokma/domain';
import type { Queryable } from '../db/queryable.js';
import { getNotificationPreferences, putNotificationPreferences } from '../notification-preferences/store.js';

/** A document this door will not store, named so a client can tell it from bad bytes. */
const INVALID_NOTIFICATION_PREFERENCES_BODY = { error: 'invalid_notification_preferences' } as const;

/**
 * `GET`/`PUT /v1/me/notification-preferences` — the global, per-kind mute
 * list (account/help-screens plan, Task 5).
 *
 * Deliberately no `workspaceId` anywhere on this route, unlike
 * `routes/preferences.ts` (which this route otherwise mirrors): the Inbox
 * itself is a global route (`NotificationsGateway.list()` takes no
 * workspace parameter), so there is no membership to check and no
 * `requireMember` gate — `requireSession` is the whole door. See
 * `packages/domain/src/notification-preferences.ts` for why this is a
 * second table rather than a fourth key on `PreferencesDoc`.
 *
 * The subject is `request.currentUserId` alone, the same as every other
 * `/v1/me/*` route on this branch: there is no parameter by which a caller
 * could name somebody else's preference, to read or to write.
 */
export function registerNotificationPreferencesRoutes(
  app: FastifyInstance,
  deps: { pool: Queryable },
  requireSession: preHandlerHookHandler,
): void {
  app.get(
    '/v1/me/notification-preferences',
    { preHandler: requireSession },
    async (request) => {
      return getNotificationPreferences(deps.pool, request.currentUserId);
    },
  );

  app.put(
    '/v1/me/notification-preferences',
    { preHandler: requireSession },
    async (request, reply) => {
      const parsed = notificationPreferencesSchema.safeParse(request.body);
      if (!parsed.success) {
        // The zod error is deliberately not forwarded, the same reason
        // `preferences.ts` withholds its own: the refusal is the same
        // whatever failed, and its `path` array would echo the document's
        // own field spellings back at whoever probed for them.
        return reply.status(400).send(INVALID_NOTIFICATION_PREFERENCES_BODY);
      }
      await putNotificationPreferences(deps.pool, request.currentUserId, parsed.data);
      // The stored document, so a client needs no second call to know what
      // it now has — `parsed.data`, what was stored, not the raw body.
      return parsed.data;
    },
  );
}
