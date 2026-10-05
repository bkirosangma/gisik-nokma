import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_MY_WORK_PREFERENCES } from '@gisik-nokma/domain';
import type { LogOtpSender } from '../../src/auth/otp-sender.js';
import { UNAUTHENTICATED_BODY } from '../../src/auth/require-session.js';
import { buildTestApp } from '../helpers/app.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { signInWithPhone } from '../helpers/session.js';

/**
 * `GET`/`PUT /v1/me/my-work-preferences` — the global My work page's "Show"
 * filter and "Group" toggle (my-work-global plan, Task 2; cases
 * 30.013–30.018). Built through `buildTestApp`, like
 * `notification-preferences.test.ts`, so `app.ts`'s registration sits behind
 * every case: a hand-built Fastify instance would leave an unregistered route
 * green.
 */

const URL = '/v1/me/my-work-preferences';
const VALID = { show: ['assigned', 'ws-admin'], grouping: 'flat' } as const;

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

function get(token: string) {
  return app.inject({ method: 'GET', url: URL, headers: { authorization: `Bearer ${token}` } });
}

function put(token: string, payload: unknown) {
  return app.inject({
    method: 'PUT',
    url: URL,
    headers: { authorization: `Bearer ${token}` },
    payload: payload as object,
  });
}

async function storedRows(): Promise<number> {
  const rows = await db.pool.query<{ n: number }>('SELECT count(*)::int AS n FROM user_my_work_preferences');
  return rows.rows[0]?.n ?? -1;
}

describe('GET/PUT /v1/me/my-work-preferences', () => {
  it('30.013 GET with no row answers DEFAULT_MY_WORK_PREFERENCES', async () => {
    const me = await signInWithPhone(app, otp, '+919999300013');
    const res = await get(me.token);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ show: ['created', 'assigned'], grouping: 'workspace-project' });
    expect(res.json()).toEqual(DEFAULT_MY_WORK_PREFERENCES);
  });

  it('30.014 PUT a valid doc answers it, and GET answers it after, for the same user', async () => {
    const me = await signInWithPhone(app, otp, '+919999300014');
    const res = await put(me.token, VALID);
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(VALID);
    const after = await get(me.token);
    expect(after.statusCode).toBe(200);
    expect(after.json()).toEqual(VALID);
    // A second PUT replaces the first whole.
    const again = await put(me.token, { show: ['project-admin'], grouping: 'workspace-project' });
    expect(again.statusCode).toBe(200);
    expect((await get(me.token)).json()).toEqual({ show: ['project-admin'], grouping: 'workspace-project' });
  });

  it("30.015 user B never sees user A's doc (the store is keyed per user)", async () => {
    const a = await signInWithPhone(app, otp, '+919999300151');
    const b = await signInWithPhone(app, otp, '+919999300152');
    expect((await put(a.token, VALID)).statusCode).toBe(200);
    expect((await get(b.token)).json()).toEqual(DEFAULT_MY_WORK_PREFERENCES);
    // Positive control: A's own row really did move.
    expect((await get(a.token)).json()).toEqual(VALID);
    // And B's write leaves A's alone.
    expect((await put(b.token, { show: ['created'], grouping: 'workspace-project' })).statusCode).toBe(200);
    expect((await get(a.token)).json()).toEqual(VALID);
    expect((await get(b.token)).json()).toEqual({ show: ['created'], grouping: 'workspace-project' });
  });

  it('30.016 a bad body is a 400 invalid_my_work_preferences and stores nothing', async () => {
    // Each body is valid but for ONE defect, so each leg fails on that defect alone.
    const bad = [
      { show: [], grouping: 'workspace-project' },
      { show: ['bogus'], grouping: 'workspace-project' },
      { show: ['created'], grouping: 'workspace-project', extra: true },
      { show: ['created'], grouping: 'tree' },
      // `.max(4)` bounds the RAW body, before the route de-duplicates it.
      { show: ['created', 'assigned', 'ws-admin', 'project-admin', 'created'], grouping: 'flat' },
    ];
    const fresh = await signInWithPhone(app, otp, '+919999300161');
    const prior = await signInWithPhone(app, otp, '+919999300162');
    expect((await put(prior.token, VALID)).statusCode).toBe(200);
    for (const body of bad) {
      for (const who of [fresh, prior]) {
        const res = await put(who.token, body);
        expect(res.statusCode, JSON.stringify(body)).toBe(400);
        expect(res.json()).toEqual({ error: 'invalid_my_work_preferences' });
      }
      // Nothing stored: the fresh user still reads the default, the other user their prior doc.
      expect((await get(fresh.token)).json()).toEqual(DEFAULT_MY_WORK_PREFERENCES);
      expect((await get(prior.token)).json()).toEqual(VALID);
    }
    // Controls: the same door takes a one-value doc and a four-value doc (the cap) from the fresh user.
    const ok = await put(fresh.token, { show: ['created'], grouping: 'workspace-project' });
    expect(ok.statusCode).toBe(200);
    expect((await get(fresh.token)).json()).toEqual({ show: ['created'], grouping: 'workspace-project' });
    const all = { show: ['created', 'assigned', 'ws-admin', 'project-admin'], grouping: 'flat' };
    expect((await put(fresh.token, all)).statusCode).toBe(200);
    expect((await get(fresh.token)).json()).toEqual(all);
  });

  it('30.017 anonymous GET and PUT are 401, and the PUT stores nothing', async () => {
    const before = await storedRows();
    const getRes = await app.inject({ method: 'GET', url: URL });
    expect(getRes.statusCode).toBe(401);
    expect(getRes.json()).toEqual(UNAUTHENTICATED_BODY);
    const putRes = await app.inject({ method: 'PUT', url: URL, payload: VALID });
    expect(putRes.statusCode).toBe(401);
    expect(putRes.json()).toEqual(UNAUTHENTICATED_BODY);
    expect(await storedRows()).toBe(before);
  });

  it('30.018 duplicate show values are stored once, first occurrence first', async () => {
    const me = await signInWithPhone(app, otp, '+919999300018');
    const res = await put(me.token, { show: ['created', 'created'], grouping: 'flat' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ show: ['created'], grouping: 'flat' });
    expect((await get(me.token)).json()).toEqual({ show: ['created'], grouping: 'flat' });
    const mixed = await put(me.token, { show: ['assigned', 'created', 'assigned'], grouping: 'flat' });
    expect(mixed.json()).toEqual({ show: ['assigned', 'created'], grouping: 'flat' });
    expect((await get(me.token)).json()).toEqual({ show: ['assigned', 'created'], grouping: 'flat' });
  });
});
