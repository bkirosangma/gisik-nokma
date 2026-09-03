import { describe, expect, it } from 'vitest';
import { NOTIFICATION_KINDS } from '@gisik-nokma/domain';
import type { Notification } from '@gisik-nokma/domain';
import type { NotificationsGateway } from '../../src/inbox/gateway.js';
import { FakeNotificationsGateway } from './fake-gateway.js';
import { notificationOf } from './fixtures.js';

/**
 * 11.94 — `NotificationsGateway`, the contract Task 14's HTTP adapter and Plan
 * 10's replica both implement.
 *
 * A bare interface compiles whether or not it can express what its
 * implementations must do, and "it typechecks" is not a measurement. What is
 * measured here is that the shape can carry the SERVER'S OWN paging contract
 * end to end: `test/inbox/fake-gateway.ts` reimplements
 * `notifications/store.ts`'s rule — id-descending, `id < cursor`, lookahead —
 * and the walk below drains it. If `NotificationsPage` had made `nextCursor`
 * optional, or `list` had refused a `null`, the drain loop is where it would
 * show.
 */
function idsOf(notifications: Notification[]): string[] {
  return notifications.map((notification) => notification.id);
}

/** Every row the gateway will hand out, walked one page at a time. */
async function drain(gateway: NotificationsGateway): Promise<string[]> {
  const seen: string[] = [];
  let cursor: string | null | undefined;
  // A bound, not a `while (true)`: a gateway that never reports exhaustion
  // should fail this test rather than hang the suite.
  for (let page = 0; page < 20; page += 1) {
    const result = await gateway.list(cursor);
    seen.push(...idsOf(result.notifications));
    if (result.nextCursor === null) return seen;
    cursor = result.nextCursor;
  }
  throw new Error(`paging did not terminate; saw ${seen.length} rows`);
}

describe('11.94 the gateway contract carries the store’s paging without loss', () => {
  it('pages newest-first, visits every row exactly once, and terminates', async () => {
    const rows = NOTIFICATION_KINDS.map((kind) => notificationOf(kind));
    const gateway = new FakeNotificationsGateway(rows, 2);
    const seen = await drain(gateway);

    const newestFirst = [...idsOf(rows)].sort().reverse();
    expect(seen).toEqual(newestFirst);
    // Exactly once — a cursor rule that used `<=` would repeat the boundary
    // row, and the equality above would still hold if it also dropped one.
    expect(new Set(seen).size).toBe(rows.length);
    // Three pages for five rows at a page size of two: the walk really paged
    // rather than getting everything in one answer, which is the only way the
    // cursor was exercised at all.
    expect(gateway.listCalls).toHaveLength(3);
    expect(gateway.listCalls[0]).toBeUndefined();
  });

  it('the LAST page reports nextCursor null, and an exact multiple does not over-page', async () => {
    // Four rows at a page size of two: the lookahead finds nothing after the
    // second page, so exhaustion is reported without an empty third page. A
    // gateway that keyed `nextCursor` off "the page was full" would return one.
    const rows = [0, 1, 2, 3].map(() => notificationOf('assignment'));
    const gateway = new FakeNotificationsGateway(rows, 2);
    expect(await drain(gateway)).toHaveLength(4);
    expect(gateway.listCalls).toHaveLength(2);
  });

  it('an empty inbox is one page of nothing, not an error and not a cursor', async () => {
    const gateway = new FakeNotificationsGateway([], 2);
    const page = await gateway.list();
    expect(page.notifications).toEqual([]);
    expect(page.nextCursor).toBeNull();
  });

  it('list() and list(null) mean the same first page — both spellings are in the type', async () => {
    const rows = [notificationOf('mention'), notificationOf('stale-ticket')];
    const gateway = new FakeNotificationsGateway(rows, 5);
    expect(idsOf((await gateway.list()).notifications)).toEqual(
      idsOf((await gateway.list(null)).notifications),
    );
  });
});

describe('11.94 unreadCount is the viewer’s total, and markRead moves it', () => {
  it('counts the unread rows across every page, not the first page’s', async () => {
    const rows = [
      notificationOf('assignment', { read: false }),
      notificationOf('mention', { read: true }),
      notificationOf('stale-ticket', { read: false }),
      notificationOf('date-approaching', { read: false }),
    ];
    const gateway = new FakeNotificationsGateway(rows, 2);
    // Three unread, and the page size is two — a per-page count would say two.
    expect(await gateway.unreadCount()).toBe(3);
  });

  it('marking a row read lowers the total, and marking it again does not', async () => {
    const target = notificationOf('assignment', { read: false });
    const gateway = new FakeNotificationsGateway([target, notificationOf('mention')], 5);
    expect(await gateway.unreadCount()).toBe(2);
    await gateway.markRead(target.id);
    expect(await gateway.unreadCount()).toBe(1);
    // Idempotent, the way the route is: a second POST on an already-read row of
    // your own is still success, not an error and not a second decrement.
    await gateway.markRead(target.id);
    expect(await gateway.unreadCount()).toBe(1);
    expect(gateway.markReadCalls).toEqual([target.id, target.id]);
  });

  it('the read flag the list hands back follows the mark', async () => {
    const target = notificationOf('assignment', { read: false });
    const gateway = new FakeNotificationsGateway([target], 5);
    expect((await gateway.list()).notifications[0]?.read).toBe(false);
    await gateway.markRead(target.id);
    expect((await gateway.list()).notifications[0]?.read).toBe(true);
  });
});
