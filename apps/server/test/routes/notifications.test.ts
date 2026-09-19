import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { newUlid, type Notification } from '@gisik-nokma/domain';
import type { LogOtpSender } from '../../src/auth/otp-sender.js';
import { UNAUTHENTICATED_BODY } from '../../src/auth/require-session.js';
import { putNotificationPreferences } from '../../src/notification-preferences/store.js';
import { insertNotification } from '../../src/notifications/store.js';
import { buildTestApp } from '../helpers/app.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { signInWithPhone } from '../helpers/session.js';

/**
 * Plan 9 Task 7 fix round — this file now builds through `buildTestApp`
 * (`test/helpers/app.ts`), the real `buildApp`, exactly like every sibling
 * route test (`preferences.test.ts`, `my-work.test.ts`, `security.test.ts`,
 * `invites.test.ts`, `workspaces.test.ts`). The file it replaces hand-built a
 * bare `Fastify()` with only auth and this one route registered — which meant
 * `apps/server/src/app.ts`'s actual wiring of `registerNotificationRoutes`
 * had NO test standing between it and a silent removal: commenting out that
 * registration line left all three routes' own tests green, because they
 * never went through `app.ts` at all. Routing through the shared `buildApp`
 * closes that gap for free, the same way it already does for every other
 * route (`buildTestApp`'s own docstring: "every new route registered in
 * `buildApp` has to be reachable from all of them").
 *
 * It also means the app's real `setErrorHandler` is in front of these routes
 * now, not a bare Fastify default — so an unvalidated input that reaches
 * Postgres and 500s no longer leaks the raw driver error into the response
 * body the way it did under the old harness.
 */

let db: TestDatabase;
let app: FastifyInstance;
let otp: LogOtpSender;

beforeAll(async () => {
  db = await createTestDatabase();
  const built = buildTestApp(db);
  app = built.app;
  otp = built.otp;
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await db.drop();
});

beforeEach(async () => {
  await db.pool.query('DELETE FROM notifications');
});

function sample(userId: string, overrides: Partial<Notification> = {}): Notification {
  const id = newUlid();
  return {
    id,
    userId,
    workspaceId: '01J9GWS0000000000000000000',
    kind: 'assignment',
    dedupeKey: `assignment:${id}`,
    payload: {
      ticketId: '01J9GTKA000000000000000000',
      ticketTitle: 'Renew the DLT registration',
      assignedBy: '01J9GUKR000000000000000000',
      eventId: id,
      clientTime: '2026-08-19T10:00:00.000Z',
      serverTime: '2026-08-19T10:00:01.000Z',
    },
    read: false,
    createdAt: '2026-08-23T05:00:00.000Z',
    ...overrides,
  };
}

/** A `mention` row — a payload shape distinct from `sample`'s `assignment` default. */
function mentionSample(userId: string, overrides: Partial<Notification> = {}): Notification {
  const id = newUlid();
  return sample(userId, {
    id,
    kind: 'mention',
    dedupeKey: `mention:${id}`,
    payload: {
      ticketId: '01J9GTKA000000000000000000',
      ticketTitle: 'Renew the DLT registration',
      mentionedBy: '01J9GUKR000000000000000000',
      eventId: id,
      source: 'comment',
      excerpt: 'cc @you',
      clientTime: '2026-08-19T10:00:00.000Z',
      serverTime: '2026-08-19T10:00:01.000Z',
    },
    ...overrides,
  });
}

describe('GET /v1/me/notifications', () => {
  it('401s without a session', async () => {
    const response = await app.inject({ method: 'GET', url: '/v1/me/notifications' });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual(UNAUTHENTICATED_BODY);
  });

  it('returns only my rows, newest first, with a working cursor', async () => {
    const me = await signInWithPhone(app, otp, '+919999000001');
    const other = await signInWithPhone(app, otp, '+919999000002');

    const a = sample(me.userId);
    const b = sample(me.userId);
    await insertNotification(db.pool, a);
    await insertNotification(db.pool, b);
    await insertNotification(db.pool, sample(other.userId));

    const page1 = await app.inject({
      method: 'GET',
      url: '/v1/me/notifications?limit=1',
      headers: { authorization: `Bearer ${me.token}` },
    });
    expect(page1.statusCode).toBe(200);
    const body1 = page1.json() as { notifications: Notification[]; nextCursor: string | null };
    expect(body1.notifications).toHaveLength(1);
    expect(body1.notifications[0]?.userId).toBe(me.userId);
    expect(body1.nextCursor).not.toBeNull();

    const page2 = await app.inject({
      method: 'GET',
      url: `/v1/me/notifications?limit=1&cursor=${body1.nextCursor}`,
      headers: { authorization: `Bearer ${me.token}` },
    });
    const body2 = page2.json() as { notifications: Notification[]; nextCursor: string | null };
    expect(body2.notifications).toHaveLength(1);
    expect(body2.notifications[0]?.id).not.toBe(body1.notifications[0]?.id);
    expect(body2.nextCursor).toBeNull();
  });

  it('never returns another user\'s row no matter what id-shaped query params are sent (planted-defect probe)', async () => {
    const me = await signInWithPhone(app, otp, '+919999000006');
    const other = await signInWithPhone(app, otp, '+919999000007');

    await insertNotification(db.pool, sample(me.userId));
    const theirs = sample(other.userId, { workspaceId: '01J9GWS0000000000000000099' });
    await insertNotification(db.pool, theirs);

    // Every one of these names the OTHER user or their workspace some way a
    // caller controls, including the one legitimate filter param
    // (`workspaceId`) pointed at THEIR workspace. None of them may be
    // honoured into seeing their row: rows come from the session only.
    const probes = [
      `/v1/me/notifications?userId=${other.userId}`,
      `/v1/me/notifications?user_id=${other.userId}`,
      `/v1/me/notifications?workspaceId=${theirs.workspaceId}`,
      `/v1/me/notifications?as=${other.userId}`,
    ];
    for (const url of probes) {
      const response = await app.inject({ method: 'GET', url, headers: { authorization: `Bearer ${me.token}` } });
      expect(response.statusCode).toBe(200);
      const body = response.json() as { notifications: Notification[] };
      for (const notification of body.notifications) {
        expect(notification.userId).toBe(me.userId);
      }
    }
  });

  it('rejects a limit that is not a positive integer within range, matching list.ts\'s invalid_limit convention', async () => {
    const me = await signInWithPhone(app, otp, '+919999000009');
    await insertNotification(db.pool, sample(me.userId));

    // A fractional limit used to reach Postgres's LIMIT clause raw and 500
    // (pg 22P02: "invalid input syntax for type bigint"). Out of range,
    // non-numeric, empty and repeated (array) values are all refused the
    // same way `list.ts` refuses them — collected into one assertion so a
    // thrown expectation on an early value can never hide an unproven later
    // one (`?limit=1&limit=2` sent as a literal repeated query param, not
    // encoded, so Fastify parses it as an array rather than one string).
    const invalidUrls = [
      '/v1/me/notifications?limit=1.5',
      '/v1/me/notifications?limit=0',
      '/v1/me/notifications?limit=-1',
      '/v1/me/notifications?limit=101',
      '/v1/me/notifications?limit=abc',
      '/v1/me/notifications?limit=1e400',
      '/v1/me/notifications?limit=',
      '/v1/me/notifications?limit=1&limit=2',
    ];
    const measured = [];
    for (const url of invalidUrls) {
      const response = await app.inject({ method: 'GET', url, headers: { authorization: `Bearer ${me.token}` } });
      measured.push({ url, status: response.statusCode, body: response.json() });
    }
    expect(measured).toEqual(
      invalidUrls.map((url) => ({ url, status: 400, body: { error: 'invalid_limit' } })),
    );

    // Absent stays valid — it means "use the default", not "invalid".
    const absent = await app.inject({
      method: 'GET',
      url: '/v1/me/notifications',
      headers: { authorization: `Bearer ${me.token}` },
    });
    expect(absent.statusCode).toBe(200);
  });

  it('11.200 excludes a kind this caller has muted (account/help-screens plan, Task 5) — the wiring witness', async () => {
    const me = await signInWithPhone(app, otp, '+919999100014');
    await insertNotification(db.pool, sample(me.userId));
    await insertNotification(db.pool, mentionSample(me.userId));

    // Positive control FIRST, same fixture, no preference saved yet: both
    // kinds are there. Without this, a query that silently returned nothing
    // at all could pass the exclusion assertion below by coincidence.
    const before = await app.inject({
      method: 'GET',
      url: '/v1/me/notifications',
      headers: { authorization: `Bearer ${me.token}` },
    });
    const beforeBody = before.json() as { notifications: Notification[] };
    expect(beforeBody.notifications.map((n) => n.kind).sort()).toEqual(['assignment', 'mention']);

    // Through the STORE directly rather than the preferences route: this test
    // pins that `/v1/me/notifications` looks the preference up and passes it
    // through, not that the preferences route itself works (that is
    // `notification-preferences.test.ts`'s job).
    await putNotificationPreferences(db.pool, me.userId, { mutedKinds: ['mention'] });

    const after = await app.inject({
      method: 'GET',
      url: '/v1/me/notifications',
      headers: { authorization: `Bearer ${me.token}` },
    });
    const afterBody = after.json() as { notifications: Notification[] };
    expect(afterBody.notifications).toHaveLength(1);
    expect(afterBody.notifications[0]?.kind).toBe('assignment');
  });
});

describe('GET /v1/me/notifications/unread-count', () => {
  it('401s without a session', async () => {
    const response = await app.inject({ method: 'GET', url: '/v1/me/notifications/unread-count' });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual(UNAUTHENTICATED_BODY);
  });

  it('counts my unread rows only', async () => {
    const me = await signInWithPhone(app, otp, '+919999000003');
    const other = await signInWithPhone(app, otp, '+919999000008');
    await insertNotification(db.pool, sample(me.userId));
    await insertNotification(db.pool, sample(me.userId, { read: true }));
    await insertNotification(db.pool, sample(other.userId)); // someone else's unread row must not count
    const response = await app.inject({
      method: 'GET',
      url: '/v1/me/notifications/unread-count',
      headers: { authorization: `Bearer ${me.token}` },
    });
    expect(response.json()).toEqual({ unread: 1 });
  });

  it('never counts another user\'s rows no matter what id-shaped query params are sent (planted-defect probe)', async () => {
    const me = await signInWithPhone(app, otp, '+919999000010');
    const other = await signInWithPhone(app, otp, '+919999000011');

    await insertNotification(db.pool, sample(me.userId)); // my 1 unread
    await insertNotification(db.pool, sample(other.userId));
    await insertNotification(db.pool, sample(other.userId));
    await insertNotification(db.pool, sample(other.userId)); // their 3 unread

    const probes = [
      `/v1/me/notifications/unread-count?userId=${other.userId}`,
      `/v1/me/notifications/unread-count?user_id=${other.userId}`,
      `/v1/me/notifications/unread-count?as=${other.userId}`,
    ];
    for (const url of probes) {
      const response = await app.inject({ method: 'GET', url, headers: { authorization: `Bearer ${me.token}` } });
      expect(response.statusCode, url).toBe(200);
      expect(response.json(), url).toEqual({ unread: 1 });
    }
  });

  it('excludes a muted kind from the count too (account/help-screens plan, Task 5) — the wiring witness', async () => {
    const me = await signInWithPhone(app, otp, '+919999100015');
    await insertNotification(db.pool, sample(me.userId));
    await insertNotification(db.pool, mentionSample(me.userId));

    // Positive control first: unmuted, both unread rows count.
    const before = await app.inject({
      method: 'GET',
      url: '/v1/me/notifications/unread-count',
      headers: { authorization: `Bearer ${me.token}` },
    });
    expect(before.json()).toEqual({ unread: 2 });

    await putNotificationPreferences(db.pool, me.userId, { mutedKinds: ['mention'] });

    const after = await app.inject({
      method: 'GET',
      url: '/v1/me/notifications/unread-count',
      headers: { authorization: `Bearer ${me.token}` },
    });
    expect(after.json()).toEqual({ unread: 1 });
  });
});

describe('POST /v1/me/notifications/:id/read', () => {
  it('401s without a session', async () => {
    const response = await app.inject({ method: 'POST', url: `/v1/me/notifications/${newUlid()}/read` });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual(UNAUTHENTICATED_BODY);
  });

  it("marks my row (204, idempotent); someone else's row 404s — indistinguishable from missing (planted defect)", async () => {
    const me = await signInWithPhone(app, otp, '+919999000004');
    const other = await signInWithPhone(app, otp, '+919999000005');

    const mine = sample(me.userId);
    const theirs = sample(other.userId);
    await insertNotification(db.pool, mine);
    await insertNotification(db.pool, theirs);

    const ok = await app.inject({
      method: 'POST',
      url: `/v1/me/notifications/${mine.id}/read`,
      headers: { authorization: `Bearer ${me.token}` },
    });
    expect(ok.statusCode).toBe(204);
    const again = await app.inject({
      method: 'POST',
      url: `/v1/me/notifications/${mine.id}/read`,
      headers: { authorization: `Bearer ${me.token}` },
    });
    expect(again.statusCode).toBe(204);

    const foreign = await app.inject({
      method: 'POST',
      url: `/v1/me/notifications/${theirs.id}/read`,
      headers: { authorization: `Bearer ${me.token}` },
    });
    expect(foreign.statusCode).toBe(404);
    expect(foreign.json()).toEqual({ error: 'not_found' });
    const untouched = await db.pool.query('SELECT read FROM notifications WHERE id = $1', [theirs.id]);
    expect(untouched.rows[0].read).toBe(false);

    const missing = await app.inject({
      method: 'POST',
      url: `/v1/me/notifications/${newUlid()}/read`,
      headers: { authorization: `Bearer ${me.token}` },
    });
    // Byte-identical to the "not mine" refusal above — same status, same body —
    // so a caller cannot tell "exists, not yours" from "does not exist".
    expect(missing.statusCode).toBe(foreign.statusCode);
    expect(missing.json()).toEqual(foreign.json());
  });

  it('never marks another user\'s row read no matter what id-shaped query params are sent (planted-defect probe)', async () => {
    const me = await signInWithPhone(app, otp, '+919999000012');
    const other = await signInWithPhone(app, otp, '+919999000013');

    const theirs = sample(other.userId);
    await insertNotification(db.pool, theirs);

    const probes = [
      `/v1/me/notifications/${theirs.id}/read?userId=${other.userId}`,
      `/v1/me/notifications/${theirs.id}/read?user_id=${other.userId}`,
      `/v1/me/notifications/${theirs.id}/read?as=${other.userId}`,
    ];
    for (const url of probes) {
      const response = await app.inject({ method: 'POST', url, headers: { authorization: `Bearer ${me.token}` } });
      expect(response.statusCode, url).toBe(404);
      expect(response.json(), url).toEqual({ error: 'not_found' });
      const row = await db.pool.query('SELECT read FROM notifications WHERE id = $1', [theirs.id]);
      expect(row.rows[0].read, url).toBe(false);
    }
  });
});

/**
 * The inbox FILTER (2026-09-19) — cases 13.969–13.973.
 *
 * The prototype's header carries `All / Unread / Mentions`; until this change
 * the route took no `read` and no `kind`, so the tabs had nothing to ask.
 *
 * **The two refusals (13.971, 13.972) are the half worth reading.** `unread=yes`
 * and `kind=mentons` are a caller who believes they narrowed and did not, and
 * the failure mode is a person concluding their inbox is empty — which is a
 * claim about their whole inbox made on the strength of a typo. Both are
 * REFUSED, following the `invalid_limit` precedent beside them.
 */
describe('GET /v1/me/notifications — the filter (13.969–13.973)', () => {
  const listOf = (body: unknown): string[] =>
    (body as { notifications: { id: string }[] }).notifications.map((n) => n.id);

  it('13.969 narrows to UNREAD rows, and the unfiltered read still returns both', async () => {
    const me = await signInWithPhone(app, otp, '+919999200001');
    const unread = sample(me.userId);
    const read = sample(me.userId, { read: true });
    await insertNotification(db.pool, unread);
    await insertNotification(db.pool, read);

    const filtered = await app.inject({
      method: 'GET',
      url: '/v1/me/notifications?unread=true',
      headers: { authorization: `Bearer ${me.token}` },
    });
    expect(filtered.statusCode).toBe(200);
    expect(listOf(filtered.json())).toEqual([unread.id]);

    // **The control, and it is not decoration.** A route that had simply stopped
    // returning read rows — a broken WHERE, a dropped column — would pass the
    // assertion above. This is what says the FIRST result is a filter rather
    // than a loss.
    const all = await app.inject({
      method: 'GET',
      url: '/v1/me/notifications',
      headers: { authorization: `Bearer ${me.token}` },
    });
    expect(listOf(all.json()).sort()).toEqual([unread.id, read.id].sort());
  });

  it('13.970 narrows by KIND — the tab says `Mentions`, the read says `kind=mention`', async () => {
    const me = await signInWithPhone(app, otp, '+919999200002');
    const assigned = sample(me.userId);
    const mentioned = mentionSample(me.userId);
    await insertNotification(db.pool, assigned);
    await insertNotification(db.pool, mentioned);

    const filtered = await app.inject({
      method: 'GET',
      url: '/v1/me/notifications?kind=mention',
      headers: { authorization: `Bearer ${me.token}` },
    });
    expect(filtered.statusCode).toBe(200);
    expect(listOf(filtered.json())).toEqual([mentioned.id]);

    // The control again: the assignment is still there without the filter.
    const all = await app.inject({
      method: 'GET',
      url: '/v1/me/notifications',
      headers: { authorization: `Bearer ${me.token}` },
    });
    expect(listOf(all.json()).sort()).toEqual([assigned.id, mentioned.id].sort());
  });

  it('13.971 refuses an `unread` value it cannot honour, rather than ignoring it', async () => {
    const me = await signInWithPhone(app, otp, '+919999200003');
    await insertNotification(db.pool, sample(me.userId, { read: true }));

    // `'false'` is a truthy STRING, which is why the parameter is spelled
    // `unread=true` rather than `read=false` — and why anything else is refused
    // instead of read as absent. Silently ignoring it would answer the
    // UNFILTERED page to a caller who asked for the unread one.
    for (const bad of ['yes', 'false', '1', '']) {
      const response = await app.inject({
        method: 'GET',
        url: `/v1/me/notifications?unread=${bad}`,
        headers: { authorization: `Bearer ${me.token}` },
      });
      // `''` is the exception: an empty value is the route's own "absent"
      // spelling (`cursor` uses the same rule), so it is the unfiltered read.
      if (bad === '') {
        expect(response.statusCode, 'empty means absent').toBe(200);
      } else {
        expect(response.statusCode, `unread=${bad}`).toBe(400);
        expect(response.json(), `unread=${bad}`).toEqual({ error: 'invalid_unread' });
      }
    }
  });

  it('13.972 refuses an unknown KIND, rather than answering an empty page', async () => {
    const me = await signInWithPhone(app, otp, '+919999200004');
    await insertNotification(db.pool, mentionSample(me.userId));

    // The failure this prevents: `kind=mentons` would match no row, and the page
    // would render "No mentions" — which under this filter's own copy means
    // "nobody has named you", a false statement about the caller's whole inbox.
    const response = await app.inject({
      method: 'GET',
      url: '/v1/me/notifications?kind=mentons',
      headers: { authorization: `Bearer ${me.token}` },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: 'invalid_kind' });

    // The control: the REAL kind is accepted, so the refusal above is about the
    // spelling and not about `kind` being rejected outright.
    const ok = await app.inject({
      method: 'GET',
      url: '/v1/me/notifications?kind=mention',
      headers: { authorization: `Bearer ${me.token}` },
    });
    expect(ok.statusCode).toBe(200);
  });

  it('13.973 the cursor walks the FILTERED set — paging and filtering compose', async () => {
    const me = await signInWithPhone(app, otp, '+919999200005');
    /**
     * **The ids are EXPLICIT, and an earlier draft's were not — which reddened
     * this case under load and only under load.** It used three `newUlid()`
     * calls, whose ids share a millisecond prefix when the machine is busy;
     * ULID ordering falls to the RANDOM TAIL within one millisecond, so
     * "created second" does not imply "sorts higher". The case passed alone and
     * failed in the full gate with two ids differing only past `01M2WN1XC1B`.
     *
     * The property under test is the ORDER the cursor walks, and a fixture that
     * relies on the clock to supply that order is testing the clock. These sort
     * by construction: `…01` < `…02` < `…03`.
     */
    const first = sample(me.userId, { id: '01J9ZZ00000000000000000001' });
    const second = sample(me.userId, { id: '01J9ZZ00000000000000000002' });
    const read = sample(me.userId, { id: '01J9ZZ00000000000000000003', read: true });
    // `read` is the NEWEST by id, so a cursor that walked the UNFILTERED set
    // would hand it back on page two and this case would redden naming it.
    for (const row of [first, second, read]) await insertNotification(db.pool, row);

    const pageOne = await app.inject({
      method: 'GET',
      url: '/v1/me/notifications?unread=true&limit=1',
      headers: { authorization: `Bearer ${me.token}` },
    });
    const bodyOne = pageOne.json() as { notifications: { id: string }[]; nextCursor: string | null };
    expect(listOf(bodyOne)).toEqual([second.id]);
    expect(bodyOne.nextCursor).not.toBeNull();

    const pageTwo = await app.inject({
      method: 'GET',
      url: `/v1/me/notifications?unread=true&limit=1&cursor=${encodeURIComponent(bodyOne.nextCursor!)}`,
      headers: { authorization: `Bearer ${me.token}` },
    });
    const bodyTwo = pageTwo.json() as { notifications: { id: string }[] };
    // `first`, NOT `read` — the filter narrows the set the cursor walks.
    expect(listOf(bodyTwo)).toEqual([first.id]);
  });
});

/**
 * **16.41 — the BULK write, in both directions, on one route.**
 *
 * The ruled Undo is what shapes every assertion below. A bulk action marks a
 * set of rows read; the Undo must put back **exactly the rows the bulk call
 * changed** — not the rows the client asked about. Those differ whenever a
 * requested id was ALREADY read: flipping it to unread on undo would invent an
 * unread row out of an action that never touched it, and nothing on screen
 * would say so.
 *
 * That is why the route answers with `changed` rather than 204, and the
 * "already read" arm below is the case that makes the distinction visible —
 * without it, a route that returned every requested id would pass.
 */
describe('POST /v1/me/notifications/read (bulk, both directions)', () => {
  async function insertMany(userId: string, count: number, read = false): Promise<Notification[]> {
    const rows = Array.from({ length: count }, () => sample(userId, { read }));
    for (const row of rows) await insertNotification(db.pool, row);
    return rows;
  }

  /**
   * Every authenticated call in this block goes through here, so a missing
   * `Authorization` header cannot be mistaken for a route that refuses.
   *
   * `payload: object` rather than `unknown`, and `method` is a LITERAL: an
   * `unknown` payload makes the whole object unassignable to Fastify's
   * `InjectOptions`, and a plain `method: 'POST'` infers as `string`, which is
   * not one of its accepted members.
   *
   * ⚠ Neither matters to the RUNNER — vitest strips types without checking
   * them, so these cases ran GREEN while `tsc` refused the file. Only the gate
   * caught it, which is the argument for running one.
   */
  function asUser(token: string, payload: object) {
    return {
      method: 'POST' as const,
      url: '/v1/me/notifications/read',
      headers: { authorization: `Bearer ${token}` },
      payload,
    };
  }

  it('401s without a session', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/v1/me/notifications/read',
      payload: { ids: [newUlid()], read: true },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual(UNAUTHENTICATED_BODY);
  });

  it('16.41 marks the named rows read and answers with EXACTLY the ids that changed', async () => {
    const me = await signInWithPhone(app, otp, '+919999000021');
    const [a, b, already] = await insertMany(me.userId, 3);
    await app.inject({
      method: 'POST',
      url: `/v1/me/notifications/${already!.id}/read`,
      headers: { authorization: `Bearer ${me.token}` },
    });

    const response = await app.inject(asUser(me.token, { ids: [a!.id, b!.id, already!.id], read: true }));

    expect(response.statusCode).toBe(200);
    // ⚠ `already` is NOT here, and that absence is the whole point: the Undo
    // un-reads precisely this set, so including a row the call did not change
    // would create an unread row that nobody un-read.
    expect([...response.json().changed].sort()).toEqual([a!.id, b!.id].sort());
  });

  it("16.41 does not change someone else's row, and does not say whether it exists", async () => {
    const me = await signInWithPhone(app, otp, '+919999000022');
    const other = await signInWithPhone(app, otp, '+919999000023');
    const mine = sample(me.userId);
    const theirs = sample(other.userId);
    const missing = newUlid();
    await insertNotification(db.pool, mine);
    await insertNotification(db.pool, theirs);

    const response = await app.inject(asUser(me.token, { ids: [mine.id, theirs.id, missing], read: true }));

    expect(response.statusCode).toBe(200);
    // Both ids that are not mine answer IDENTICALLY — absent. A caller cannot
    // learn, one bulk call at a time, which ids exist elsewhere in the
    // deployment; the same indistinguishability the per-id 404 keeps.
    expect(response.json().changed).toEqual([mine.id]);
  });

  it('16.41 UNDO: `read: false` puts back exactly the rows the forward call changed', async () => {
    const me = await signInWithPhone(app, otp, '+919999000024');
    const [a, b, already] = await insertMany(me.userId, 3);
    await app.inject({
      method: 'POST',
      url: `/v1/me/notifications/${already!.id}/read`,
      headers: { authorization: `Bearer ${me.token}` },
    });

    const forward = await app.inject(asUser(me.token, { ids: [a!.id, b!.id, already!.id], read: true }));
    const changed = forward.json().changed as string[];

    const undo = await app.inject(asUser(me.token, { ids: changed, read: false }));

    expect(undo.statusCode).toBe(200);
    expect([...undo.json().changed].sort()).toEqual([...changed].sort());

    // The round trip left the inbox as it started: `a` and `b` unread again,
    // and `already` — which the forward call never touched — STILL READ. An
    // undo that had sent every requested id would have made it unread, and
    // that is the lie this arm exists to catch.
    const rows = await db.pool.query('SELECT id, read FROM notifications WHERE user_id = $1', [me.userId]);
    const byId = new Map((rows.rows as { id: string; read: boolean }[]).map((r) => [r.id, r.read]));
    expect(byId.get(a!.id)).toBe(false);
    expect(byId.get(b!.id)).toBe(false);
    expect(byId.get(already!.id)).toBe(true);
  });

  it('16.41 REFUSES more ids than a page can hold, whole — never truncating', async () => {
    const me = await signInWithPhone(app, otp, '+919999000025');
    const ids = Array.from({ length: 101 }, () => newUlid());

    const response = await app.inject(asUser(me.token, { ids, read: true }));

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: 'invalid_ids', max: 100 });
  });

  it('16.41 accepts exactly the bound — the control that makes the refusal a boundary, not a broken route', async () => {
    const me = await signInWithPhone(app, otp, '+919999000026');
    const ids = Array.from({ length: 100 }, () => newUlid());

    const response = await app.inject(asUser(me.token, { ids, read: true }));

    // No rows exist for these ids, so nothing changed — but the request was
    // ACCEPTED. Without this arm, a route that refused everything would pass
    // the case above.
    expect(response.statusCode).toBe(200);
    expect(response.json().changed).toEqual([]);
  });

  it('16.41 refuses malformed bodies by name, rather than reaching Postgres', async () => {
    const me = await signInWithPhone(app, otp, '+919999000027');
    const cases: Array<[string, object]> = [
      ['ids omitted', { read: true }],
      ['ids empty', { ids: [], read: true }],
      ['ids not an array', { ids: newUlid(), read: true }],
      ['an id not a string', { ids: [newUlid(), 7], read: true }],
      ['an id empty', { ids: [''], read: true }],
      ['read omitted', { ids: [newUlid()] }],
      ['read not a boolean', { ids: [newUlid()], read: 'true' }],
    ];
    for (const [label, payload] of cases) {
      const response = await app.inject(asUser(me.token, payload));
      expect(response.statusCode, label).toBe(400);
    }
  });
});
