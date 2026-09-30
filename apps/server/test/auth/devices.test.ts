import { evaluateEvent } from '@gisik-nokma/rule-engine';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { createAuth } from '../../src/auth/auth.js';
import { deviceSessionHook } from '../../src/auth/device-cookie.js';
import { LogMagicLinkSender } from '../../src/auth/magic-link-sender.js';
import { LogOtpSender } from '../../src/auth/otp-sender.js';
import { createObjectStoreFromEnv } from '../../src/attachments/store-config.js';
import { createIngestService } from '../../src/ingest/ingest-service.js';
import { buildProjectionRegistry } from '../../src/projections/index.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';

/**
 * Cases 6.300-6.306 - the `gn_device` cookie and `session."deviceId"` on every sign-in (devices plan,
 * Task 1; spec V1). Harness copied from `sign-in-flows.test.ts`.
 */
const TEST_SECRET = 'devices-test-secret-devices-test-secret';
let db: TestDatabase;
let app: FastifyInstance;
let httpsApp: FastifyInstance;
let otp: LogOtpSender;
let magic: LogMagicLinkSender;
let httpsOtp: LogOtpSender;

function build(baseUrl: string): { app: FastifyInstance; otp: LogOtpSender; magic: LogMagicLinkSender } {
  const otpSender = new LogOtpSender(() => {});
  const magicSender = new LogMagicLinkSender(() => {});
  const auth = createAuth({ pool: db.pool, otpSender, magicLinkSender: magicSender, baseUrl, secret: TEST_SECRET, webOrigin: 'http://localhost:3001' });
  const ingest = createIngestService({ pool: db.pool, evaluate: evaluateEvent, projections: buildProjectionRegistry() });
  return {
    app: buildApp({
      db: db.pool,
      pool: db.pool,
      ingest,
      auth,
      serverAppend: (events) => ingest.ingestBatch(events),
      webOrigin: 'http://localhost:3001',
      store: createObjectStoreFromEnv({}),
    }),
    otp: otpSender,
    magic: magicSender,
  };
}

function cookies(headers: Record<string, unknown>): string[] {
  const raw = headers['set-cookie'];
  return raw === undefined ? [] : Array.isArray(raw) ? (raw as string[]) : [String(raw)];
}
const deviceCookie = (headers: Record<string, unknown>) => cookies(headers).find((c) => c.startsWith('gn_device='));
const valueOf = (cookie: string | undefined) => (cookie as string).split(';')[0]!.slice('gn_device='.length);

async function phoneSignIn(target: FastifyInstance, sender: LogOtpSender, phone: string, cookieHeader?: string) {
  const before = sender.sent.length;
  await target.inject({ method: 'POST', url: '/api/auth/phone-number/send-otp', payload: { phoneNumber: phone } });
  return target.inject({
    method: 'POST',
    url: '/api/auth/phone-number/verify',
    payload: { phoneNumber: phone, code: sender.sent[before]?.code },
    // A request that carries a cookie must also carry a trusted Origin (better-auth's CSRF rule, on everywhere here).
    headers: cookieHeader === undefined ? {} : { cookie: cookieHeader, origin: 'http://localhost:3001' },
  });
}

async function sessionCount(phone: string): Promise<number> {
  const r = await db.pool.query(`SELECT count(*)::int AS n FROM session s JOIN "user" u ON u.id = s."userId" WHERE u."phoneNumber" = $1`, [phone]);
  return r.rows[0].n;
}

async function deviceIdOfLatestSession(phone: string): Promise<string | null> {
  const r = await db.pool.query(
    `SELECT s."deviceId" FROM session s JOIN "user" u ON u.id = s."userId" WHERE u."phoneNumber" = $1 ORDER BY s."createdAt" DESC LIMIT 1`,
    [phone],
  );
  return r.rows[0]?.deviceId ?? null;
}

beforeAll(async () => {
  db = await createTestDatabase();
  const built = build('http://localhost:3000');
  app = built.app;
  otp = built.otp;
  magic = built.magic;
  const builtHttps = build('https://api.example.test');
  httpsApp = builtHttps.app;
  httpsOtp = builtHttps.otp;
  await app.ready();
  await httpsApp.ready();
});
afterAll(async () => {
  await app.close();
  await httpsApp.close();
  await db.drop();
});

describe('6.300 first sign-in sets gn_device and records it', () => {
  it('6.300 cookie attributes and session.deviceId', async () => {
    const res = await phoneSignIn(app, otp, '+919000000301');
    expect(res.statusCode).toBe(200);
    const c = deviceCookie(res.headers);
    expect(c).toBeDefined();
    expect(c).toMatch(/HttpOnly/i);
    expect(c).toMatch(/SameSite=Lax/i);
    expect(c).toMatch(/Path=\//);
    expect(c).toMatch(/Max-Age=31536000/);
    expect(c).not.toMatch(/Secure/i);
    const value = valueOf(c);
    expect(value).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(await deviceIdOfLatestSession('+919000000301')).toBe(value);
    // CONTROL - the session cookie is still set.
    expect(cookies(res.headers).some((x) => x.startsWith('better-auth.session_token='))).toBe(true);
  });
});

describe('6.301 the same browser keeps its id', () => {
  it('6.301 reuse, no new Set-Cookie; control: no cookie mints another', async () => {
    const first = await phoneSignIn(app, otp, '+919000000302');
    const value = valueOf(deviceCookie(first.headers));
    const second = await phoneSignIn(app, otp, '+919000000302', `gn_device=${value}`);
    // The second sign-in really happened (a refused request would leave the first session as "latest" and pass vacuously).
    expect(second.statusCode).toBe(200);
    expect(await sessionCount('+919000000302')).toBe(2);
    expect(deviceCookie(second.headers)).toBeUndefined();
    expect(await deviceIdOfLatestSession('+919000000302')).toBe(value);
    const third = await phoneSignIn(app, otp, '+919000000302');
    expect(valueOf(deviceCookie(third.headers))).not.toBe(value);
  });
});

describe('6.302 magic link and passkey sign-in also record deviceId', () => {
  it('6.302 magic link through its real routes; control: phone (6.300)', async () => {
    const email = 'devices-magic@example.test';
    await app.inject({ method: 'POST', url: '/api/auth/sign-in/magic-link', payload: { email } });
    const url = new URL(magic.sent.at(-1)?.url ?? '');
    const follow = await app.inject({ method: 'GET', url: url.pathname + url.search });
    expect(follow.statusCode).toBe(302);
    const c = deviceCookie(follow.headers);
    expect(c).toBeDefined();
    const r = await db.pool.query(
      `SELECT s."deviceId" FROM session s JOIN "user" u ON u.id = s."userId" WHERE u.email = $1 ORDER BY s."createdAt" DESC LIMIT 1`,
      [email],
    );
    expect(r.rows[0]?.deviceId).toBe(valueOf(c));
  });

  it('6.302 passkey: every method creates its session through the ONE `session.create.before` hook, so the passkey path is pinned by calling the hook with a passkey-verify context (a real WebAuthn assertion cannot be produced in the server suite; the real round trip is 6.357, browser)', async () => {
    const set: string[] = [];
    const ctx = { path: '/passkey/verify-authentication', getCookie: () => null, setCookie: (k: string, v: string) => (set.push(`${k}=${v}`), '') };
    const out = await deviceSessionHook({ secure: false })({ id: 's', userId: 'u' }, ctx);
    expect(out.data['deviceId']).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(set).toHaveLength(1);
  });
});

describe('6.303 a malformed cookie is replaced', () => {
  it('6.303 junk -> new id; control 6.301 keeps a good one', async () => {
    const res = await phoneSignIn(app, otp, '+919000000303', 'gn_device=not-a-device-id');
    expect(res.statusCode).toBe(200);
    const c = deviceCookie(res.headers);
    expect(c).toBeDefined();
    expect((c as string).split(';')[0]).not.toBe('gn_device=not-a-device-id');
    expect(valueOf(c)).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
});

describe('6.304 Secure over https only', () => {
  it('6.304 https gains Secure; control: http does not (6.300)', async () => {
    const res = await phoneSignIn(httpsApp, httpsOtp, '+919000000304');
    expect(res.statusCode).toBe(200);
    expect(deviceCookie(res.headers)).toMatch(/Secure/i);
  });
});

describe('6.305 no endpoint context', () => {
  it('6.305 ctx null -> deviceId null, no throw; control: with context it is set', async () => {
    const hook = deviceSessionHook({ secure: false });
    const fake = { id: 's1', userId: 'u1' };
    const bare = await hook(fake, null);
    expect(bare).toEqual({ data: { id: 's1', userId: 'u1', deviceId: null } });
    const withCtx = await hook(fake, { getCookie: () => null, setCookie: () => '' });
    expect(withCtx.data['deviceId']).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
});

describe('6.306 the migration is additive', () => {
  it('6.306 column types, NULL defaults, existing rows untouched', async () => {
    const cols = await db.pool.query(
      `SELECT table_name, column_name, data_type, is_nullable, column_default FROM information_schema.columns
        WHERE (table_name = 'session' AND column_name IN ('deviceId','lastSeenAt')) OR (table_name = 'passkey' AND column_name = 'lastUsedAt')
        ORDER BY table_name, column_name`,
    );
    expect(cols.rows).toEqual([
      { table_name: 'passkey', column_name: 'lastUsedAt', data_type: 'timestamp with time zone', is_nullable: 'YES', column_default: null },
      { table_name: 'session', column_name: 'deviceId', data_type: 'text', is_nullable: 'YES', column_default: null },
      { table_name: 'session', column_name: 'lastSeenAt', data_type: 'timestamp with time zone', is_nullable: 'YES', column_default: null },
    ]);
    // A row written the way the OLD code writes it (none of the new columns named) reads back NULL in all of them.
    await db.pool.query(`INSERT INTO "user" (id, name, email, "emailVerified", "createdAt", "updatedAt") VALUES ('old-u','Old','old@x.test',true,now(),now())`);
    await db.pool.query(`INSERT INTO session (id, "expiresAt", token, "createdAt", "updatedAt", "userId") VALUES ('old-s', now() + interval '1 day', 'old-tok', now(), now(), 'old-u')`);
    const old = await db.pool.query(`SELECT "deviceId", "lastSeenAt" FROM session WHERE id = 'old-s'`);
    expect(old.rows[0]).toEqual({ deviceId: null, lastSeenAt: null });
  });
});
