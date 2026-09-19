import type { Notification } from '@gisik-nokma/domain';
import type { InboxFilter, NotificationsGateway, NotificationsPage } from '../../src/inbox/gateway.js';

/**
 * A `NotificationsGateway` over an in-memory list, MIRRORING the server's
 * paging semantics rather than inventing convenient ones.
 *
 * `apps/server/src/notifications/store.ts` does exactly this: order by id
 * DESCENDING, `WHERE id < $cursor` when a cursor is given, fetch `limit + 1`
 * rows and report `nextCursor` as the last row OF THE PAGE only when the
 * lookahead found an extra. Copying that here is the point of the fake — the
 * interface has no consumer in this package, so the only way to measure it as
 * something other than a declaration is to show that the shape it names can
 * carry the real store's contract without loss. A fake with a different cursor
 * rule would prove the interface is implementable by a fake, which nothing
 * needed to know.
 *
 * It lives in `test/` and not in `src/`: it is not package surface. The real
 * adapters are Task 14's (HTTP) and Plan 10's (replica).
 */
export class FakeNotificationsGateway implements NotificationsGateway {
  readonly listCalls: (string | null | undefined)[] = [];
  /**
   * The FILTER each `list` was called with, recorded separately from the cursor
   * because a case about the filter must be able to say which one was sent —
   * `listCalls` alone would let a fake that ignores its second argument look
   * identical to one that honours it.
   */
  readonly listFilters: (InboxFilter | undefined)[] = [];
  readonly markReadCalls: string[] = [];

  private readonly rows: Notification[];

  constructor(
    notifications: Notification[],
    private readonly pageSize = 2,
  ) {
    // Newest first, the order the route returns and the order the cursor walks.
    this.rows = [...notifications].sort((a, b) => (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));
  }

  list(cursor?: string | null, filter?: InboxFilter): Promise<NotificationsPage> {
    this.listCalls.push(cursor);
    this.listFilters.push(filter);
    // The ROUTE'S OWN SPELLING, character for character
    // (`routes/notifications.ts`): `typeof raw.cursor === 'string' &&
    // raw.cursor.length > 0 ? raw.cursor : null`. An EMPTY STRING is a first
    // page on the server — the route maps it to `null`, and `store.ts`'s
    // `if (opts.cursor)` would drop it anyway — and a `cursor ?? null` here
    // kept the `''` and filtered `row.id < ''`, which matches nothing. That
    // fake was STRICTER than the server, so it hid no server bug, but the
    // docblock above claims mirroring and this is the one place it did not.
    const after = typeof cursor === 'string' && cursor.length > 0 ? cursor : null;
    let matching = after === null ? this.rows : this.rows.filter((row) => row.id < after);
    /**
     * **The filter is applied BEFORE the page is cut, and that ordering IS the
     * semantics.** `store.ts` puts it in the WHERE, so it narrows the set the
     * page is taken from and the cursor walks the filtered rows. A fake that
     * filtered AFTER slicing would return short pages and a `nextCursor` into a
     * set the caller never asked for — the exact divergence this fake exists to
     * prevent, in the one direction a paging test would not catch.
     */
    if (filter?.unreadOnly === true) matching = matching.filter((row) => !row.read);
    if (filter?.kind !== undefined) matching = matching.filter((row) => row.kind === filter.kind);
    const lookahead = matching.slice(0, this.pageSize + 1);
    const page = lookahead.slice(0, this.pageSize);
    const last = page[page.length - 1];
    return Promise.resolve({
      notifications: page,
      nextCursor: lookahead.length > this.pageSize && last !== undefined ? last.id : null,
    });
  }

  unreadCount(): Promise<number> {
    return Promise.resolve(this.rows.filter((row) => !row.read).length);
  }

  markRead(id: string): Promise<void> {
    this.markReadCalls.push(id);
    const row = this.rows.find((candidate) => candidate.id === id);
    if (row === undefined) {
      // The route's 404 for a row that is not the caller's OR does not exist.
      return Promise.reject(new Error('not_found'));
    }
    row.read = true;
    return Promise.resolve();
  }
}
