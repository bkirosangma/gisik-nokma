import { notificationPreferencesSchema, type NotificationPreferences } from '@gisik-nokma/domain';
import type { NotificationPreferencesGateway } from '../account/notification-preferences-gateway.js';
import type { HttpClient } from './http.js';

const PATH = '/v1/me/notification-preferences';

/**
 * The real implementation of `../account/notification-preferences-gateway.js`,
 * modelled directly on this directory's own `notifications.ts` — same
 * `HttpClient` seam, same same-origin transport `providers.tsx` hands every
 * gateway here, same reason: `credentials: 'include'` and the same-origin
 * `baseUrl: ''` are stated once in `createHttpClient`, not restated per file.
 *
 * ## A 404 on `load` is not `null`-shaped here
 *
 * `createHttpClient` answers `null` for a 404 on a GET, because every `/v1`
 * READ route on this branch answers one frozen body for "no such thing" and
 * for "not yours". This route cannot honestly produce that: it is
 * session-gated (`GET /v1/me/notification-preferences` needs no
 * `workspaceId` and answers 401 to a stranger, never 404), so a `null` here
 * means the request did not reach the route it names — a proxy, a rewrite, a
 * wrong origin. Left unhandled it would reach `notificationPreferencesSchema
 * .parse(null)` and throw a zod message about a missing object, which names
 * neither the door nor the cause; this guard names both, exactly as
 * `notifications.ts`'s own `read()` does for its two GETs.
 *
 * ## `load` parses; `save` does not need to
 *
 * `load` crosses the one boundary in this file where the response body is
 * `unknown` until something checks it, so it is parsed against the domain's
 * own schema rather than cast — a future field rename or a malformed value
 * reaches this line as a thrown error instead of a `NotificationPreferences`
 * this package cannot vouch for. `save` sends a value this package already
 * built and typed (`NotificationPreferences`), so there is nothing left to
 * validate on the way out.
 */
export function createHttpNotificationPreferencesGateway(
  http: HttpClient,
): NotificationPreferencesGateway {
  return {
    async load(): Promise<NotificationPreferences> {
      const raw = await http.get(PATH);
      if (raw === null) {
        throw new Error(`${PATH} answered 404 — this route is session-gated and should answer 401`);
      }
      return notificationPreferencesSchema.parse(raw);
    },
    async save(next: NotificationPreferences): Promise<void> {
      await http.put(PATH, next);
    },
  };
}
