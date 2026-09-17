import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { LogOtpSender } from '../../src/auth/otp-sender.js';
import { UNAUTHENTICATED_BODY } from '../../src/auth/require-session.js';
import { buildTestApp } from '../helpers/app.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { signInWithPhone } from '../helpers/session.js';

/**
 * `GET`/`PUT /v1/me/notification-preferences` — the global, per-kind mute
 * list (account/help-screens plan, Task 5). Built through `buildTestApp`,
 * exactly like every sibling `/v1/me` route test (`preferences.test.ts`,
 * `notifications.test.ts`), so `app.ts`'s registration of this route sits
 * behind these cases the same way `notifications.test.ts`'s own docblock
 * says its route's registration must: a bare hand-built Fastify instance
 * would leave a silently-unregistered route green.
 *
 * There is no `workspaceId` anywhere on this route, deliberately — the
 * subject is `request.currentUserId` alone, the same session-only subject
 * `preferences.ts` uses, minus the membership gate that route's workspace
 * scoping needs and this one has no reason to.
 *
 * 11.199 — the route's 401/200/400/isolation behaviour, in full below.
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

describe('GET/PUT /v1/me/notification-preferences', () => {
  it('401s with no session', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/me/notification-preferences' });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual(UNAUTHENTICATED_BODY);
  });

  it('401s a PUT with no session too, and stores nothing', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/v1/me/notification-preferences',
      payload: { mutedKinds: ['mention'] },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual(UNAUTHENTICATED_BODY);
    const rows = await db.pool.query('SELECT count(*)::int AS n FROM user_notification_preferences');
    expect(rows.rows[0]?.n).toBe(0);
  });

  it('GET answers the empty default for a fresh user', async () => {
    const me = await signInWithPhone(app, otp, '+919999100001');
    const res = await app.inject({
      method: 'GET',
      url: '/v1/me/notification-preferences',
      headers: { authorization: `Bearer ${me.token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ mutedKinds: [] });
  });

  it('PUT then GET round-trips', async () => {
    const me = await signInWithPhone(app, otp, '+919999100002');
    const put = await app.inject({
      method: 'PUT',
      url: '/v1/me/notification-preferences',
      headers: { authorization: `Bearer ${me.token}` },
      payload: { mutedKinds: ['mention'] },
    });
    expect(put.statusCode).toBe(200);
    // The PUT answers what it stored, so a client needs no second call to know.
    expect(put.json()).toEqual({ mutedKinds: ['mention'] });
    const get = await app.inject({
      method: 'GET',
      url: '/v1/me/notification-preferences',
      headers: { authorization: `Bearer ${me.token}` },
    });
    expect(get.json()).toEqual({ mutedKinds: ['mention'] });
  });

  it('PUT refuses an unknown kind with 400, and stores nothing', async () => {
    const me = await signInWithPhone(app, otp, '+919999100003');
    const before = await app.inject({
      method: 'GET',
      url: '/v1/me/notification-preferences',
      headers: { authorization: `Bearer ${me.token}` },
    });
    const res = await app.inject({
      method: 'PUT',
      url: '/v1/me/notification-preferences',
      headers: { authorization: `Bearer ${me.token}` },
      payload: { mutedKinds: ['not-a-real-kind'] },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'invalid_notification_preferences' });
    // Nothing partial landed: the prior (empty) answer is unchanged.
    const after = await app.inject({
      method: 'GET',
      url: '/v1/me/notification-preferences',
      headers: { authorization: `Bearer ${me.token}` },
    });
    expect(after.json()).toEqual(before.json());
  });

  it('PUT refuses an unknown top-level key with 400 (.strict())', async () => {
    const me = await signInWithPhone(app, otp, '+919999100004');
    const res = await app.inject({
      method: 'PUT',
      url: '/v1/me/notification-preferences',
      headers: { authorization: `Bearer ${me.token}` },
      payload: { mutedKinds: [], extra: true },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'invalid_notification_preferences' });
  });

  it("one user's write never touches another's row", async () => {
    const a = await signInWithPhone(app, otp, '+919999100005');
    const b = await signInWithPhone(app, otp, '+919999100006');
    await app.inject({
      method: 'PUT',
      url: '/v1/me/notification-preferences',
      headers: { authorization: `Bearer ${a.token}` },
      payload: { mutedKinds: ['mention'] },
    });
    const getB = await app.inject({
      method: 'GET',
      url: '/v1/me/notification-preferences',
      headers: { authorization: `Bearer ${b.token}` },
    });
    expect(getB.json()).toEqual({ mutedKinds: [] });
    // Positive control: A's own row really did move.
    const getA = await app.inject({
      method: 'GET',
      url: '/v1/me/notification-preferences',
      headers: { authorization: `Bearer ${a.token}` },
    });
    expect(getA.json()).toEqual({ mutedKinds: ['mention'] });
  });
});
