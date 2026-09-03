import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { newUlid, type Notification } from '@gisik-nokma/domain';
import { createAuth, type Auth } from '../../src/auth/auth.js';
import { LogOtpSender } from '../../src/auth/otp-sender.js';
import { LogMagicLinkSender } from '../../src/auth/magic-link-sender.js';
import { makeRequireSession } from '../../src/auth/require-session.js';
import { registerAuthRoutes } from '../../src/auth/routes.js';
import { insertNotification } from '../../src/notifications/store.js';
import { registerNotificationRoutes } from '../../src/routes/notifications.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { signInWithPhone } from '../helpers/session.js';

const BASE_URL = 'http://localhost:3000';
const TEST_SECRET = 'test-secret-not-used-anywhere-real';

let db: TestDatabase;
let app: FastifyInstance;
let auth: Auth;
let otp: LogOtpSender;

beforeAll(async () => {
  db = await createTestDatabase();
  otp = new LogOtpSender();
  auth = createAuth({
    pool: db.pool,
    otpSender: otp,
    magicLinkSender: new LogMagicLinkSender(),
    baseUrl: BASE_URL,
    secret: TEST_SECRET,
  });
  app = Fastify();
  registerAuthRoutes(app, auth);
  registerNotificationRoutes(app, { pool: db.pool }, makeRequireSession(auth));
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

describe('GET /v1/me/notifications', () => {
  it('401s without a session', async () => {
    const response = await app.inject({ method: 'GET', url: '/v1/me/notifications' });
    expect(response.statusCode).toBe(401);
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
});

describe('GET /v1/me/notifications/unread-count', () => {
  it('401s without a session', async () => {
    const response = await app.inject({ method: 'GET', url: '/v1/me/notifications/unread-count' });
    expect(response.statusCode).toBe(401);
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
});

describe('POST /v1/me/notifications/:id/read', () => {
  it('401s without a session', async () => {
    const response = await app.inject({ method: 'POST', url: `/v1/me/notifications/${newUlid()}/read` });
    expect(response.statusCode).toBe(401);
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
});
