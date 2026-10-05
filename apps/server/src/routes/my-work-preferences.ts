import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import { myWorkPreferencesSchema, type MyWorkPreferences } from '@gisik-nokma/domain';
import type { Queryable } from '../db/queryable.js';
import { getMyWorkPreferences, putMyWorkPreferences } from '../my-work-preferences/store.js';

/** A document this door will not store, named so a client can tell it from bad bytes. */
const INVALID_MY_WORK_PREFERENCES_BODY = { error: 'invalid_my_work_preferences' } as const;

/**
 * `GET`/`PUT /v1/me/my-work-preferences` — the global My work page's "Show"
 * filter and "Group" toggle, remembered per person (my-work-global plan,
 * Task 2). A copy of `routes/notification-preferences.ts`: no `workspaceId`
 * (the page spans every workspace), so `requireSession` is the whole door and
 * the subject is `request.currentUserId` alone — no parameter names anybody
 * else's document, to read or to write.
 */
export function registerMyWorkPreferencesRoutes(
  app: FastifyInstance,
  deps: { pool: Queryable },
  requireSession: preHandlerHookHandler,
): void {
  app.get('/v1/me/my-work-preferences', { preHandler: requireSession }, async (request) => {
    return getMyWorkPreferences(deps.pool, request.currentUserId);
  });

  app.put('/v1/me/my-work-preferences', { preHandler: requireSession }, async (request, reply) => {
    const parsed = myWorkPreferencesSchema.safeParse(request.body);
    if (!parsed.success) {
      // The zod error is withheld, as `notification-preferences.ts` withholds
      // its own: the refusal is the same whatever failed.
      return reply.status(400).send(INVALID_MY_WORK_PREFERENCES_BODY);
    }
    // A repeated `show` value means nothing more than one, so it is stored
    // once, first occurrence first.
    const prefs: MyWorkPreferences = { ...parsed.data, show: [...new Set(parsed.data.show)] };
    await putMyWorkPreferences(deps.pool, request.currentUserId, prefs);
    // What was stored, so a client needs no second call to know.
    return prefs;
  });
}
