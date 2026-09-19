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

describe('11.94 the gateway can express the server REFUSING, not only serving', () => {
  it('markRead on an id the caller does not own rejects — the route’s 404, not a silent success', async () => {
    const mine = notificationOf('assignment', { read: false });
    const gateway = new FakeNotificationsGateway([mine], 5);

    // `routes/notifications.ts` answers 404 `{error:'not_found'}` for a row
    // that is not the caller's AND for one that does not exist — one shape for
    // both, so a prober learns nothing about which. The fake models that with
    // a rejection, and until this case existed NOTHING asserted it: turning
    // the reject into `Promise.resolve()` left this file 7/7 green.
    //
    // This is the half of the contract Task 14's HTTP adapter has to get
    // right. An adapter that swallowed a 404 into a resolved promise would be
    // indistinguishable, here, from one that propagated it — and the whole
    // reason this fake mirrors the store rather than inventing convenient
    // semantics is so the interface is measured against what the server does.
    await expect(gateway.markRead('01J9GN0Tsomebodyelses')).rejects.toThrow('not_found');

    // A refusal changes NOTHING. Not the total, not the row that does exist —
    // a fake that rejected after mutating would pass the line above.
    expect(await gateway.unreadCount()).toBe(1);
    expect((await gateway.list()).notifications[0]?.read).toBe(false);
    // And the call was really attempted rather than refused by an argument
    // check that never reached the lookup.
    expect(gateway.markReadCalls).toEqual(['01J9GN0Tsomebodyelses']);
  });

  it('refusal and success are told apart on the SAME gateway, one call after the other', async () => {
    // The two arms of `markRead`'s one conditional, in one test: a fake that
    // rejected everything would pass the case above, and one that resolved
    // everything would pass the success cases further up. Only a gateway that
    // discriminates passes both halves of this.
    const mine = notificationOf('mention', { read: false });
    const gateway = new FakeNotificationsGateway([mine], 5);
    await expect(gateway.markRead('nope')).rejects.toThrow('not_found');
    await expect(gateway.markRead(mine.id)).resolves.toBeUndefined();
    expect(await gateway.unreadCount()).toBe(0);
  });
});

describe('11.94 the fake mirrors the route’s cursor spelling, including the empty one', () => {
  it('an EMPTY-STRING cursor is the first page, the way the route reads it', async () => {
    // `routes/notifications.ts` maps `?cursor=` to `null` before the store
    // sees it, so `''` asks for the first page. The fake used `cursor ?? null`,
    // which kept the `''` and filtered `row.id < ''` — nothing. Strictly
    // stricter than the server, so it could hide no server bug; it just made
    // the docblock's "mirroring the server's paging semantics" false at one
    // input, and this fake exists to be a truthful mirror or nothing.
    const rows = [notificationOf('mention'), notificationOf('stale-ticket')];
    const gateway = new FakeNotificationsGateway(rows, 5);
    expect(idsOf((await gateway.list('')).notifications)).toEqual(
      idsOf((await gateway.list()).notifications),
    );
    // And really both rows, not two matching emptinesses — the equality above
    // holds just as well when the fake returns nothing for every spelling.
    expect((await gateway.list('')).notifications).toHaveLength(2);
  });
});

/**
 * **16.41 — the fake's BULK write, which had no caller until this block.**
 *
 * `FakeNotificationsGateway.setRead` shipped mirroring the route — the
 * changed-set semantics, the bound, the empty-list rejection — and **nothing
 * called it**, so none of that witnessed anything. Independent review found it
 * by sweeping for a call site and finding none. The prose credited the fake
 * with catching a page that discards `changed`; the case that actually catches
 * that is `apps/web/test/inbox-bulk.test.tsx`'s, and this block is what makes
 * THIS file's copy true rather than decorative.
 */
describe('16.41 the fake mirrors the bulk route, not a convenient version of it', () => {
  function gatewayOf(count: number) {
    const rows = Array.from({ length: count }, () => notificationOf('assignment'));
    return { gateway: new FakeNotificationsGateway(rows, 50), rows };
  }

  it('16.41 returns only the ids whose value MOVED — the already-read row is absent', async () => {
    const { gateway, rows } = gatewayOf(3);
    const [a, b, c] = rows as [Notification, Notification, Notification];
    // One row is already read, the shape the server's `IS DISTINCT FROM $1`
    // excludes and a naive `WHERE`-only RETURNING would include.
    await gateway.markRead(c.id);

    const changed = await gateway.setRead([a.id, b.id, c.id], true);

    expect([...changed].sort()).toEqual([a.id, b.id].sort());
    expect(changed).not.toContain(c.id);
  });

  it('16.41 the UNDO round trip leaves an untouched row read — the property the page depends on', async () => {
    const { gateway, rows } = gatewayOf(3);
    const [a, b, c] = rows as [Notification, Notification, Notification];
    await gateway.markRead(c.id);
    const changed = await gateway.setRead([a.id, b.id, c.id], true);

    await gateway.setRead(changed, false);

    // `a` and `b` are unread again; `c`, which the forward call never touched,
    // is STILL READ. A fake that un-read its whole argument would make this
    // false — and it would also make a page that did the same pass.
    const listed = (await gateway.list()).notifications;
    const byId = new Map(listed.map((n) => [n.id, n.read]));
    expect(byId.get(a.id)).toBe(false);
    expect(byId.get(b.id)).toBe(false);
    expect(byId.get(c.id)).toBe(true);
  });

  it('16.41 rejects an over-long list WHOLE — the route’s 400, not a truncation', async () => {
    const { gateway } = gatewayOf(1);
    await expect(
      gateway.setRead(Array.from({ length: 101 }, () => 'n'), true),
    ).rejects.toThrow('invalid_ids');
  });

  it('16.41 records the direction it was asked for, so a case can tell the two apart', async () => {
    const { gateway, rows } = gatewayOf(2);
    const [id] = (rows as Notification[]).map((n) => n.id);
    await gateway.setRead([id!], true);
    await gateway.setRead([id!], false);
    expect(gateway.setReadCalls).toEqual([
      { ids: [id!], read: true },
      { ids: [id!], read: false },
    ]);
  });
});
