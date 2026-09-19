import type { InboxFilter, NotificationsGateway, NotificationsPage } from '../inbox/gateway.js';
import type { HttpClient } from './http.js';
import { parseNotification } from '@gisik-nokma/domain';

/**
 * The FIRST real implementation of `packages/app-core/src/inbox/gateway.ts`'s
 * interface. Everything above it — `InboxView`, `UnreadBadge`, the formatters —
 * has so far only ever met a fake, so this file is where the fake's looseness
 * gets found. Each seam below is stated against the route that actually serves
 * it (`apps/server/src/routes/notifications.ts`), not against the plan's sketch.
 *
 * ## Built on the shell's ONE transport, not on a private `fetch`
 *
 * The plan's draft takes a `baseUrl` and calls `fetch` itself. This takes an
 * `HttpClient`, exactly as `createHttpInviteGateway`, `createHttpInviteAdminGateway`
 * and `createHttpFoundingGateway` do, and `providers.tsx` hands it the same
 * instance those three get. Three consequences, and all three are the reason:
 *
 * - `credentials: 'include'` and the same-origin `baseUrl: ''` are stated ONCE,
 *   in `createHttpClient`, rather than restated here where they could drift from
 *   the rewrites in `next.config.ts`.
 * - a non-2xx becomes `HttpError` carrying `status` AND the refusal body, which
 *   is what `refusalText` needs; the sketch's `new Error(status)` throws the
 *   server's own words away.
 * - **`send`'s method gate**: a 404 answers `null` on a GET and THROWS on a
 *   POST. That is precisely the behaviour `markRead` needs (see below), and a
 *   private `fetch` here would have had to re-derive it.
 *
 * ## `list` sends a cursor and NOTHING else — decided, not inherited
 *
 * Task 12 flagged that this route also accepts `limit` and `workspaceId` while
 * `NotificationsGateway.list` takes neither, and asked Task 14 to "decide
 * deliberately rather than by inheritance". Decided: **neither is added**, on
 * two independent grounds.
 *
 * 1. The interface's own: it is a PRODUCED contract that Plan 10's offline
 *    replica must also satisfy, and a replica has no query string to put a
 *    `workspaceId` in and no `limit` to forward. Widening the signature would
 *    oblige one implementation to fake two arguments so a caller could pass what
 *    only the other can use.
 * 2. This shell's, which the interface could not know: `/inbox` is a GLOBAL
 *    route — `app/inbox/page.tsx`, no `[workspaceId]` segment anywhere above it
 *    — so there is no workspace in scope to send. A per-workspace inbox would be
 *    a different page at a different URL, and the day it is wanted the route
 *    already serves it.
 *
 * The consequence, stated rather than left to be discovered: the route's `400
 * invalid_limit` refusal is UNREACHABLE from this client, because this client
 * never sends a `limit`. No test here pretends to exercise it — a case that
 * scripted a 400 would be testing the fixture. `apps/server/test` owns that
 * refusal, and the reason it exists is a caller this gateway is not.
 *
 * ## A 404 on the two GETs is not `null`-shaped here
 *
 * `createHttpClient` answers `null` for a 404 on a GET, because every `/v1` READ
 * route answers one frozen body for "no such thing" and for "not yours". Neither
 * of these two reads can honestly produce that: both are session-gated static
 * paths that answer 401 to a stranger, so a `null` here means the request did not
 * reach the route it names — a proxy, a rewrite, a wrong origin. Left unhandled
 * it would surface as `Cannot read properties of null (reading 'notifications')`,
 * which names neither the door nor the cause; so each read says which path
 * answered nothing.
 */
export function createHttpNotificationsGateway(http: HttpClient): NotificationsGateway {
  async function read(path: string): Promise<unknown> {
    const body = await http.get(path);
    if (body === null) {
      throw new Error(`${path} answered 404 — this route is session-gated and should answer 401`);
    }
    return body;
  }

  /**
   * The envelope, CHECKED rather than cast — for the reason `read` above is a
   * guard rather than a `!`.
   *
   * `(await read(path)) as { notifications: unknown[]; nextCursor: string | null }`
   * is a promise the compiler cannot keep. A 200 whose body is not that shape —
   * a rewrite answering an HTML page, a proxy's own JSON, a future route
   * renaming the field — reaches `body.notifications.map` and throws `Cannot
   * read properties of undefined (reading 'map')`, which names neither the door
   * nor the cause. That is the EXACT unnamed `TypeError` the null guard above
   * exists to prevent, one line further in.
   *
   * Stated honestly: this is NOT reachable against the route that ships today
   * (`apps/server/src/routes/notifications.ts` serves the shape, and its own
   * tests hold it there), and no case here pretends otherwise. It is here on the
   * same terms as the 404 guard — which is also unreachable against a correct
   * deployment and is also tested (11.139) — because both failures arrive from
   * OUTSIDE the pair this file is written against: the transport, the rewrites,
   * the origin.
   */
  function listEnvelope(
    path: string,
    body: unknown,
  ): { notifications: readonly unknown[]; nextCursor: string | null } {
    const envelope = body as { notifications?: unknown; nextCursor?: unknown };
    const rows = envelope.notifications;
    const cursor = envelope.nextCursor;
    if (!Array.isArray(rows) || (cursor !== null && typeof cursor !== 'string')) {
      throw new Error(
        `${path} answered 200 with a body this client cannot read — expected { notifications: [...], nextCursor: string | null }`,
      );
    }
    return { notifications: rows, nextCursor: cursor };
  }

  /** The same check for the one-field envelope. See `listEnvelope`. */
  function unreadEnvelope(path: string, body: unknown): number {
    const unread = (body as { unread?: unknown }).unread;
    if (typeof unread !== 'number' || !Number.isFinite(unread)) {
      throw new Error(
        `${path} answered 200 with a body this client cannot read — expected { unread: <number> }`,
      );
    }
    return unread;
  }

  return {
    async list(cursor?: string | null, filter?: InboxFilter): Promise<NotificationsPage> {
      // Built as a LIST and joined, rather than as nested ternaries. With one
      // parameter the ternary was readable; with three independent ones it has
      // eight arms and one of them is wrong in a way no test names.
      //
      // `cursor` is opaque — it comes back from `nextCursor` and goes out
      // unread — and `URLSearchParams` encodes it without this file needing to
      // know it is a row id.
      const params = new URLSearchParams();
      if (cursor !== undefined && cursor !== null) params.set('cursor', cursor);
      // `unread=true`, NOT `read=false`: the server refuses any other spelling
      // (`invalid_unread`) precisely because `'false'` is a truthy string, and
      // this side must send the one it accepts.
      if (filter?.unreadOnly === true) params.set('unread', 'true');
      if (filter?.kind !== undefined) params.set('kind', filter.kind);
      const query = params.size === 0 ? '' : `?${params.toString()}`;
      const path = `/v1/me/notifications${query}`;
      const body = listEnvelope(path, await read(path));
      /**
       * `parseNotification` on EVERY row, and it is the domain's boundary
       * parser rather than a cast. The rows crossing here are the only place in
       * this shell where a notification's `payload` is a `z.unknown()` until
       * somebody checks it, and the check is per-KIND
       * (`notificationPayloadSchemaByKind`) — a cast would hand `InboxView` a
       * `mention` whose payload is an `assignment`'s and the formatter would
       * read `undefined` fields into a headline.
       *
       * Point-free `.map(parseNotification)` is safe here and was checked
       * rather than assumed: the signature is `(value: unknown) => Notification`
       * (`packages/domain/src/notifications.ts:151`) — one parameter, so `.map`'s
       * index and array arguments land nowhere.
       */
      return {
        notifications: body.notifications.map(parseNotification),
        nextCursor: body.nextCursor,
      };
    },

    async unreadCount(): Promise<number> {
      const path = '/v1/me/notifications/unread-count';
      return unreadEnvelope(path, await read(path));
    },

    /**
     * The interface promises idempotence — "marking an already-read row of your
     * own is not an error" — and the route honours it for YOUR OWN rows only: a
     * second POST on a row you own is still 204, while a row that is not yours
     * and a row that does not exist are the SAME 404 `{error:'not_found'}`, so a
     * caller cannot use the status as an existence oracle.
     *
     * That 404 must reach the caller, and it does: `send`'s method gate answers
     * `null` for a 404 on a GET and throws `HttpError` on a POST. So this is one
     * of the places the fake was looser than the real thing — a stub gateway
     * whose `markRead` always resolved let the page's optimistic flip stand for
     * a row the server never marked. The page's `.catch` (see
     * `app/inbox/page.tsx`) exists for exactly this throw.
     */
    async markRead(id: string): Promise<void> {
      await http.post(`/v1/me/notifications/${encodeURIComponent(id)}/read`, undefined);
    },
  };
}
