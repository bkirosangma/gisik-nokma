import type { NotificationPreferences } from '@gisik-nokma/domain';

/**
 * The notification-preferences data contract — an INTERFACE and nothing
 * else, the same shape `inbox/gateway.ts` established for the notifications
 * it mutes. Task 5's server route is the sole implementation target today
 * (`GET`/`PUT /v1/me/notification-preferences`, session-gated, no
 * `workspaceId` — see `packages/domain/src/notification-preferences.ts` for
 * why this is global rather than a fourth key on `PreferencesDoc`).
 *
 * `load` answers `NotificationPreferences`, already parsed — unlike
 * `PreferencesGateway.load()`, which answers `unknown` because ITS callers
 * (`saved-filters.ts`) own the parse against a document with other,
 * unrelated keys. This document has exactly one key and one shipped
 * implementation of the parse, so validating inside the adapter (see
 * `../online/notification-preferences.ts`) does not create a second opinion
 * the way parsing preferences there would have.
 *
 * `save` takes the WHOLE document, matching the route: a PUT replaces it, so
 * there is no per-kind toggle door to call instead. A caller that wants to
 * flip one kind reads the current value first (`load`) — exactly what
 * `apps/web/app/account/page.tsx`'s `toggleKind` does — and this interface
 * does not paper over that with a narrower method the server has no door for.
 */
export interface NotificationPreferencesGateway {
  load(): Promise<NotificationPreferences>;
  save(next: NotificationPreferences): Promise<void>;
}
