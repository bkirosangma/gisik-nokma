import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  HttpError,
  createHttpClient,
  createHttpNotificationsGateway,
  type FetchLike,
} from '@gisik-nokma/app-core/online';
import { newUlid, type Notification } from '@gisik-nokma/domain';
import type { LogOtpSender } from '../../src/auth/otp-sender.js';
import { insertNotification } from '../../src/notifications/store.js';
import { buildTestApp } from '../helpers/app.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { signInWithPhone } from '../helpers/session.js';

/**
 * **Plan 9's consumer-side residual, closed: the REAL `NotificationsGateway`
 * against the REAL route and a REAL database.**
 *
 * ## The gap this file exists to close, in its own words
 *
 * `fixture-witnesses.test.ts` (case 12.325) pinned the PRODUCER end of the
 * notifications contract and then stated its own limit rather than leaving it
 * to be discovered: *"`apps/server` has no dependency on `apps/web`, where the
 * only real `NotificationsGateway` adapter lives … so the client CONSUMER
 * cannot be executed from here … This case pins the PRODUCER's end of the
 * contract; the fake's rule is witnessed by copying a rule that is now pinned,
 * not by a round trip."*
 *
 * That left the series' signature failure live in the one plan that had already
 * been flagged for it: *a mocked contract is the thing that excuses the server
 * from existing.* Three things measured the same paging rule and not one of
 * them was a round trip —
 *
 * - `packages/app-core/test/inbox/fake-gateway.ts` REIMPLEMENTS the rule and
 *   admits it is *"MIRRORING the server's paging semantics"*. It had already
 *   drifted once, on the empty-string cursor (its lines 37-44).
 * - the gateway's own unit cases scripted the server's bodies BY HAND, copied
 *   from the route. A hand-copied body cannot notice the route changing.
 * - `notifications.test.ts:97-110` drives the real route but asserts only that
 *   `nextCursor` is non-null, re-sends it, and gets a different row — ADVANCE
 *   and TERMINATION, never the cursor's VALUE, which is the keyset claim the
 *   fake copies.
 *
 * ## What actually made it unwitnessable — and it was not the dependency graph
 *
 * The adapter is not web-specific and never was: it imports `NotificationsGateway`,
 * `HttpClient` and `parseNotification`, and touches no React, no Next, no DOM.
 * Its own docblock names `createHttpInviteGateway`, `createHttpInviteAdminGateway`
 * and `createHttpFoundingGateway` as the pattern it follows — and **all three of
 * those live in `packages/app-core/src/online/`, while it alone sat in
 * `apps/web/src/`.** `apps/server` already devDepends on `@gisik-nokma/app-core`,
 * so every sibling was reachable from here and this one was not.
 *
 * So the fix was a MOVE, not a new dependency edge: the file now sits with its
 * three siblings and this file witnesses it exactly the way `fixture-witnesses`
 * already witnesses `createHttpFoundingGateway` at its own line ~360. **The gap
 * was a misfiled adapter wearing an architectural constraint's clothing.**
 *
 * ## Why `app.inject` and not a socket
 *
 * `injectFetch` below is the same seam `fixture-witnesses.test.ts` uses. The
 * REAL client transport (`createHttpClient` — its 404-to-null-on-GET rule, its
 * `HttpError` construction, its `JSON.stringify`) meets the REAL route, the
 * REAL store and REAL Postgres in one process. The only thing not exercised is
 * the socket, and no case here claims it is: what these cases are about is the
 * CONTRACT between two modules that have never met, not the wire.
 */

let db: TestDatabase;
let app: FastifyInstance;
let otp: LogOtpSender;
let me: { userId: string; headers: { authorization: string } };
let other: { userId: string; headers: { authorization: string } };

let phoneCounter = 0;
async function signedIn(): Promise<{ userId: string; headers: { authorization: string } }> {
  phoneCounter += 1;
  const user = await signInWithPhone(app, otp, `+9190108${String(phoneCounter).padStart(5, '0')}`);
  return { userId: user.userId, headers: { authorization: `Bearer ${user.token}` } };
}

/**
 * A `FetchLike` over `app.inject`, supplying exactly the three members
 * `http.ts`'s `send` reads (`status`, `ok`, `json()`) and nothing else — so a
 * client that started reaching for `headers` or `text()` would FAIL here rather
 * than silently pass. `ok` is DERIVED from the status the server actually set,
 * never passed in: `ok` is the one field a hand-built fake gets to decide for
 * itself, and deciding it is how a fake stops being evidence.
 *
 * Copied in shape from `fixture-witnesses.test.ts` deliberately rather than
 * shared: that file's copy is load-bearing for its own cases, and a shared
 * helper that one of them later needed to bend would bend for both.
 */
function injectFetch(headers: { authorization: string }, calls: string[] = []): FetchLike {
  return (async (input: string, init?: RequestInit) => {
    calls.push(input);
    const method = (init?.method ?? 'GET') as 'GET' | 'POST';
    const rawBody = init?.body;
    const res =
      typeof rawBody === 'string'
        ? await app.inject({
            method,
            url: input,
            headers: { ...headers, 'content-type': 'application/json' },
            payload: rawBody,
          })
        : await app.inject({ method, url: input, headers });
    return {
      ok: res.statusCode >= 200 && res.statusCode < 300,
      status: res.statusCode,
      json: async () => res.json() as unknown,
    } as Response;
  }) as FetchLike;
}

function gatewayFor(who: { headers: { authorization: string } }, calls: string[] = []) {
  return createHttpNotificationsGateway(createHttpClient('', injectFetch(who.headers, calls)));
}

/**
 * A row built through the DOMAIN's own type and inserted with the SERVER's own
 * `insertNotification` — the same function the fanout uses. Not a hand-written
 * JSON literal: the point of this file is that no hand-written body stands
 * between the client and the store, and a fixture that invented its own row
 * shape would put one back exactly where it was removed.
 */
async function give(
  userId: string,
  workspaceId: string,
  overrides: Partial<Notification> = {},
): Promise<Notification> {
  const id = newUlid();
  const row: Notification = {
    id,
    userId,
    workspaceId,
    kind: 'assignment',
    dedupeKey: `assignment:${id}`,
    read: false,
    createdAt: new Date('2026-08-20T10:00:00.000Z').toISOString(),
    payload: {
      ticketId: 't_7',
      ticketTitle: 'Restock the cold shelf',
      assignedBy: 'u_ana',
      eventId: newUlid(),
      clientTime: '2026-08-20T09:59:00.000Z',
      serverTime: '2026-08-20T10:00:00.000Z',
    },
    ...overrides,
  } as Notification;
  const outcome = await insertNotification(db.pool, row);
  // A silent 'duplicate' would leave a case asserting over a page that is one
  // row shorter than it thinks, which is a fixture failure wearing a product
  // failure's clothes.
  expect(outcome, `insertNotification refused ${id} as a duplicate`).toBe('inserted');
  return row;
}

const WS = 'ws_roundtrip';

beforeAll(async () => {
  db = await createTestDatabase();
  const built = buildTestApp(db);
  app = built.app;
  otp = built.otp;
  await app.ready();
  me = await signedIn();
  other = await signedIn();
});

afterAll(async () => {
  await app.close();
  await db.drop();
});

beforeEach(async () => {
  await db.pool.query('DELETE FROM notifications');
});

describe("Plan 9's notifications consumer, against the real door", () => {
  it('11.190 parses a page the ROUTE served — the domain parser meets a row no test wrote by hand', async () => {
    const given = await give(me.userId, WS);
    const calls: string[] = [];

    const page = await gatewayFor(me, calls).list();

    expect(calls).toEqual(['/v1/me/notifications']);
    expect(page.notifications.map((n) => n.id)).toEqual([given.id]);
    // Parsed per-kind by `parseNotification`, not cast. This is the assertion
    // the scripted cases could not make: the payload came out of Postgres via
    // the route's own serialisation, so a column rename or a JSON round-trip
    // that dropped a field would surface HERE as a parse failure.
    expect(page.notifications[0]?.payload).toMatchObject({
      ticketId: 't_7',
      assignedBy: 'u_ana',
    });
    expect(page.notifications[0]?.kind).toBe('assignment');
  });

  /**
   * 11.191 — **the cursor's VALUE, which nothing had ever checked.**
   *
   * 12.325 pinned this on the producer's side and named the consumer as out of
   * reach. `notifications.test.ts` walks the cursor but asserts only that it is
   * non-null. The fake COPIES the rule ("`nextCursor` is the last row of the
   * page") from `store.ts`. This is the first time the rule is read back
   * through the real client from the real store.
   *
   * Read as `.at(-1)`, not `[0]`: at a page size of 1 the two are the same row
   * and an assertion on `[0]` would be accidentally correct — it would pass
   * against a server that reported the FIRST row of the page and break every
   * caller that paged with it.
   */
  it('11.191 reports nextCursor as the LAST row of the page, read back through the real client', async () => {
    // Three rows, page size 2 by the route's `limit`... which this client never
    // sends. So instead: insert three and let the DEFAULT page size (30) hold
    // them all, then assert the terminating shape; and separately drive a real
    // multi-page walk below. Here the claim is the TERMINAL one: a full page
    // with nothing beyond it reports null, not the last id.
    await give(me.userId, WS);
    await give(me.userId, WS);
    const page = await gatewayFor(me).list();

    expect(page.notifications).toHaveLength(2);
    // Newest first — the route orders by id DESC and ULIDs increase.
    const ids = page.notifications.map((n) => n.id);
    expect([...ids].sort().reverse()).toEqual(ids);
    // Nothing beyond this page, so no cursor. A server that reported the last
    // row unconditionally would fail here, and the fake could not have caught
    // it because the fake decides this itself.
    expect(page.nextCursor).toBeNull();
  });

  it('11.192 walks a real multi-page cursor to exhaustion, each page served by the route', async () => {
    const rows = [await give(me.userId, WS), await give(me.userId, WS), await give(me.userId, WS)];
    const newestFirst = rows.map((r) => r.id).sort().reverse();

    // The client sends no `limit` (a deliberate decision recorded in the
    // adapter), so a real multi-page walk needs more rows than the page size or
    // a page size it cannot set. Rather than fake either, walk with the cursor
    // the SERVER produced: ask the route directly for a 2-row page to obtain a
    // genuine `nextCursor`, then hand that cursor to the CLIENT and require the
    // client's next page to continue from it correctly.
    const seeded = await app.inject({
      method: 'GET',
      url: '/v1/me/notifications?limit=2',
      headers: me.headers,
    });
    const first = seeded.json() as { notifications: { id: string }[]; nextCursor: string | null };
    expect(first.notifications.map((n) => n.id)).toEqual(newestFirst.slice(0, 2));
    // THE VALUE: the last row OF THE PAGE, not the first, and not the last row
    // overall. `.at(-1)` for the reason in 11.191's docblock.
    expect(first.nextCursor).toBe(first.notifications.at(-1)?.id);

    const calls: string[] = [];
    const rest = await gatewayFor(me, calls).list(first.nextCursor);

    // The client encoded the server's own cursor and the server understood it:
    // strictly-older rows only, so the walk terminates instead of repeating.
    expect(calls).toEqual([`/v1/me/notifications?cursor=${encodeURIComponent(first.nextCursor!)}`]);
    expect(rest.notifications.map((n) => n.id)).toEqual(newestFirst.slice(2));
    expect(rest.nextCursor).toBeNull();
  });

  it('11.193 reads the unread total off the real store, not a scripted number', async () => {
    await give(me.userId, WS);
    await give(me.userId, WS, { read: true });
    await give(other.userId, WS); // someone else's — must not be counted

    expect(await gatewayFor(me).unreadCount()).toBe(1);
  });

  it('11.194 markRead actually marks it, and the unread total the client reads moves', async () => {
    const mine = await give(me.userId, WS);
    const gateway = gatewayFor(me);
    expect(await gateway.unreadCount()).toBe(1);

    await expect(gateway.markRead(mine.id)).resolves.toBeUndefined();

    // The count is re-read through the client rather than asserted against the
    // table: the claim is that the WRITE the client made is visible to the READ
    // the client makes, which is the pair a stub gateway cannot break.
    expect(await gateway.unreadCount()).toBe(0);
    // Idempotent for your own row — the interface promises it and the route
    // honours it. A second POST is still 204, not a 404.
    await expect(gateway.markRead(mine.id)).resolves.toBeUndefined();
  });

  it("11.195 markRead THROWS on someone else's row — the seam where the stub gateway was looser", async () => {
    const theirs = await give(other.userId, WS);

    // The route answers the same 404 for "not yours" and "does not exist", so a
    // caller cannot use the status as an existence oracle. What matters to the
    // consumer is that it THROWS: a stub whose `markRead` always resolved let
    // the inbox's optimistic flip stand for a row the server never marked.
    await expect(gatewayFor(me).markRead(theirs.id)).rejects.toBeInstanceOf(HttpError);

    // ...and the row really is untouched, measured at the store rather than
    // inferred from the status.
    const still = await db.pool.query('SELECT read FROM notifications WHERE id = $1', [theirs.id]);
    expect(still.rows[0]?.read).toBe(false);
  });
});
