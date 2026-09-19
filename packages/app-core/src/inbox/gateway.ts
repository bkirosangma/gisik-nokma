import type { Notification, NotificationKind } from '@gisik-nokma/domain';

/**
 * The inbox's data contract — an INTERFACE and nothing else. No implementation
 * lives in this package's view layer: the web shell's HTTP adapter is Task 14's
 * and Plan 10's offline replica writes its own, both against the shape below.
 *
 * ## The page shape is the server's, character for character
 *
 * `apps/server/src/notifications/store.ts` already declares
 * `NotificationPage = { notifications: Notification[]; nextCursor: string | null }`
 * and `GET /v1/me/notifications` returns exactly it. This type is that shape
 * restated for a client that cannot import from the server package — so it is
 * restated EXACTLY, including `nextCursor: string | null` rather than an
 * optional. An adapter that had to reshape the body would be a second opinion
 * about what a page is, living in the one place a paging bug is invisible.
 *
 * ## `list` takes a cursor and nothing else, deliberately
 *
 * The route also accepts `limit` and `workspaceId`. Neither is here. This
 * interface is a PRODUCED contract — Task 14 and Plan 10's shell consume it —
 * and every parameter in it is one both implementations must honour. The
 * replica has no `limit` to pass on to anybody and no query string to put a
 * `workspaceId` in; widening the signature now would oblige it to fake two
 * arguments so that a caller could pass what only one of the two backings can
 * use. The cursor is the one parameter paging genuinely needs, and it is opaque
 * to the caller: it comes back from `nextCursor` and goes out unread.
 *
 * ## The FILTER joined on 2026-09-19, and it passes the test the other two failed
 *
 * The inbox's `All / Unread / Mentions` tabs needed a `filter`. **`limit` and
 * `workspaceId` stay refused, and the same two grounds are what let the filter
 * in — which is the point rather than a loophole.**
 *
 * 1. **The interface's ground.** The test is *"every parameter in it is one both
 *    implementations must honour"*. A replica holds the rows, so narrowing them
 *    by `read` or by `kind` is a filter over data it already has — it does not
 *    have to fake anything. `limit` and `workspaceId` failed that test because a
 *    local reader has no page-size knob and no query string; `unreadOnly` and
 *    `kind` pass it because every backing can answer them.
 * 2. **This shell's ground.** Task 14's second reason was that `/inbox` is a
 *    GLOBAL route with no workspace in scope. That is an argument about
 *    `workspaceId` specifically, and it says nothing about a filter that is not
 *    workspace-scoped.
 *
 * The alternative was a second method, `listFiltered`, and it is refused by
 * name: two methods over one read are two places for paging to drift, and the
 * repo's standing rule is that one thing gets one door.
 *
 * `cursor` is `string | null | undefined` — the first page is expressible two
 * ways on purpose, because `list()` (no argument) and `list(page.nextCursor)`
 * on an exhausted page are the two spellings a caller actually writes, and a
 * signature that refused the second would push a `?? undefined` into every
 * loop.
 *
 * ## Unredacted, and there is no parameter here that could change that
 *
 * The coordination ruling — "a message you were sent is yours; revocation
 * removes future sight, not letters delivered" — shows up in this file as an
 * ABSENCE: no viewer id, no visibility argument, no `redacted` flag on the
 * page. The rows a gateway hands back are rendered as they were delivered.
 * `notifications.ts` in the domain and `routes/notifications.ts` on the server
 * carry the same absence; this is the third door and it stays open too.
 */
export type NotificationsPage = { notifications: Notification[]; nextCursor: string | null };

/**
 * What the inbox's filter tab asks the read for, in the DOMAIN's terms rather
 * than the tab strip's: the `Mentions` tab sends `kind: 'mention'`, not the word
 * it prints. A tab name is a UI concept, and this type is shared with a backing
 * that has no tabs.
 *
 * **`All` is the ABSENCE of a filter, not a value for one.** A caller rendering
 * the `All` tab passes nothing, which is also what every caller wrote before
 * this existed — so the unfiltered read is one spelling rather than two.
 */
export type InboxFilter = {
  /** The `Unread` tab. `false`/absent is the unfiltered read. */
  unreadOnly?: boolean;
  /** The `Mentions` tab. Absent is every kind. */
  kind?: NotificationKind;
};

/** Implemented by the web shell (Task 14) and by Plan 10's replica. */
export interface NotificationsGateway {
  /**
   * One page, newest first. `undefined`/`null` asks for the first page.
   *
   * `filter` narrows the SAME read rather than adding a second one — see the
   * docblock above for why it passes the test that keeps `limit` and
   * `workspaceId` out.
   */
  list(cursor?: string | null, filter?: InboxFilter): Promise<NotificationsPage>;
  /** The viewer's own unread total — never a per-page count. */
  unreadCount(): Promise<number>;
  /** Idempotent: marking an already-read row of your own is not an error. */
  markRead(id: string): Promise<void>;
}
