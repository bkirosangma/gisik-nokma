import { evaluateEvent } from '@gisik-nokma/rule-engine';
import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { createAuth } from '../../src/auth/auth.js';
import { deviceKey, deviceTag } from '../../src/auth/device-cookie.js';
import { LogMagicLinkSender } from '../../src/auth/magic-link-sender.js';
import { LogOtpSender } from '../../src/auth/otp-sender.js';
import { createObjectStoreFromEnv } from '../../src/attachments/store-config.js';
import { createIngestService } from '../../src/ingest/ingest-service.js';
import { approveDeviceCode, exchangeDeviceCode, mintDeviceCode } from '../../src/mcp/token-store.js';
import { buildProjectionRegistry } from '../../src/projections/index.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';

/**
 * Cases 6.311-6.320 - `GET /v1/me/devices` and `POST /v1/me/devices/:key/sign-out` (devices plan Task 3).
 * One person (alice) signs in on two "browsers" (device A twice, device B twice), with legacy and expired rows
 * inserted directly; a second person (bob) has one device. The destructive cases run LAST.
 */
const SECRET = 'devices-routes-secret-devices-routes-secret';
const WEB = 'http://localhost:3001';
const UA = 'SameBrowser/1.0';
let db: TestDatabase;
let app: FastifyInstance;
let otp: LogOtpSender;

type Browser = { sessionCookie: string; deviceId: string; token: string; userId: string };

function setCookies(headers: Record<string, unknown>): string[] {
  const raw = headers['set-cookie'];
  return raw === undefined ? [] : Array.isArray(raw) ? (raw as string[]) : [String(raw)];
}
const pair = (cookies: string[], name: string) => cookies.map((c) => c.split(';')[0]!).find((c) => c.startsWith(`${name}=`))!;

/** A sign-in the way a browser does it: optionally presenting an existing `gn_device`. */
async function signIn(phone: string, deviceId?: string): Promise<Browser> {
  const before = otp.sent.length;
  await app.inject({ method: 'POST', url: '/api/auth/phone-number/send-otp', payload: { phoneNumber: phone } });
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/phone-number/verify',
    payload: { phoneNumber: phone, code: otp.sent[before]?.code },
    headers: { 'user-agent': UA, ...(deviceId === undefined ? {} : { cookie: `gn_device=${deviceId}`, origin: WEB }) },
  });
  if (res.statusCode !== 200) throw new Error(`sign-in failed: ${res.statusCode} ${res.body}`);
  const cookies = setCookies(res.headers);
  const minted = cookies.map((c) => c.split(';')[0]!).find((c) => c.startsWith('gn_device='));
  return {
    sessionCookie: pair(cookies, 'better-auth.session_token'),
    deviceId: deviceId ?? minted!.slice('gn_device='.length),
    token: String(res.headers['set-auth-token']),
    userId: (res.json() as { user: { id: string } }).user.id,
  };
}

type Device = { key: string; tag: string | null; userAgent: string | null; isCurrent: boolean; lastSeenAt: string; firstSignedInAt: string; sessionCount: number; legacy: boolean };
const get = (as: Browser) => app.inject({ method: 'GET', url: '/v1/me/devices', headers: { cookie: as.sessionCookie } });
const list = async (as: Browser) => ((await get(as)).json() as { devices: Device[] }).devices;
const signOut = (as: Browser, key: string) =>
  app.inject({ method: 'POST', url: `/v1/me/devices/${encodeURIComponent(key)}/sign-out`, headers: { cookie: as.sessionCookie, origin: WEB } });
const sessionTotal = async (): Promise<number> => (await db.pool.query(`SELECT count(*)::int AS n FROM session`)).rows[0].n;

let aliceA1: Browser;
let aliceA2: Browser;
let aliceB1: Browser;
let aliceB2: Browser;
let bob: Browser;
let bobOnAlicesBrowser: Browser;
let aliceId: string;

async function insertSession(id: string, userId: string, deviceId: string | null, ua: string, ip: string, expiresAt: string, createdAt = '2026-09-01T00:00:00Z') {
  await db.pool.query(
    `INSERT INTO session (id, "expiresAt", token, "createdAt", "updatedAt", "ipAddress", "userAgent", "userId", "deviceId")
     VALUES ($1, $2, $1, $3, $3, $4, $5, $6, $7)`,
    [id, expiresAt, createdAt, ip, ua, userId, deviceId],
  );
}

beforeAll(async () => {
  db = await createTestDatabase();
  otp = new LogOtpSender(() => {});
  const auth = createAuth({ pool: db.pool, otpSender: otp, magicLinkSender: new LogMagicLinkSender(() => {}), baseUrl: 'http://localhost:3000', secret: SECRET, webOrigin: WEB });
  const ingest = createIngestService({ pool: db.pool, evaluate: evaluateEvent, projections: buildProjectionRegistry() });
  app = buildApp({ db: db.pool, pool: db.pool, ingest, auth, serverAppend: (e) => ingest.ingestBatch(e), webOrigin: WEB, store: createObjectStoreFromEnv({}) });
  await app.ready();

  aliceA1 = await signIn('+919000000401');
  aliceA2 = await signIn('+919000000401', aliceA1.deviceId);
  aliceB1 = await signIn('+919000000401');
  aliceB2 = await signIn('+919000000401', aliceB1.deviceId);
  bob = await signIn('+919000000402');
  // A shared computer: bob signs in on the very browser alice's device B uses, so the two share one gn_device value.
  bobOnAlicesBrowser = await signIn('+919000000402', aliceB1.deviceId);
  aliceId = aliceA1.userId;
  // Device B's two sessions carry explicit, distinguishable times (6.311); neither authenticates a request below, so nothing re-stamps them.
  await db.pool.query(`UPDATE session SET "createdAt" = '2026-09-20T10:00:00Z', "lastSeenAt" = '2026-09-21T10:00:00Z' WHERE token = $1`, [aliceB1.token.split('.')[0]]);
  await db.pool.query(`UPDATE session SET "createdAt" = '2026-09-25T10:00:00Z', "lastSeenAt" = '2026-09-30T10:00:00Z' WHERE token = $1`, [aliceB2.token.split('.')[0]]);
  // Expired: one under a device that has no live session (6.314), one under device A (must not count).
  await insertSession('exp-own-device', aliceId, 'E'.repeat(43), UA, '10.9.9.9', '2026-01-01T00:00:00Z');
  await insertSession('exp-on-a', aliceId, aliceA1.deviceId, UA, '10.9.9.9', '2026-01-01T00:00:00Z');
  // Pre-V1 rows (deviceId NULL): two share an address, one does not (6.315).
  await insertSession('legacy-1a', aliceId, null, 'Old/1.0', '10.0.0.1', '2999-01-01T00:00:00Z', '2026-09-02T00:00:00Z');
  await insertSession('legacy-1b', aliceId, null, 'Old/1.0', '10.0.0.1', '2999-01-01T00:00:00Z', '2026-09-03T00:00:00Z');
  await insertSession('legacy-2', aliceId, null, 'Old/1.0', '10.0.0.2', '2999-01-01T00:00:00Z');
});
afterAll(async () => {
  await app.close();
  await db.drop();
});

describe('6.311 one device, many sessions', () => {
  it('6.311 two sessions under one deviceId list as ONE row; first = earlier createdAt, last = later stamp; control: a second deviceId is a second row', async () => {
    const devices = await list(aliceA2);
    const b = devices.find((d) => d.key === deviceKey(aliceB1.deviceId))!;
    expect(b.sessionCount).toBe(2);
    expect(b.firstSignedInAt).toBe('2026-09-20T10:00:00.000Z');
    expect(b.lastSeenAt).toBe('2026-09-30T10:00:00.000Z');
    const a = devices.find((d) => d.key === deviceKey(aliceA1.deviceId))!;
    expect(a).toBeDefined();
    expect(a.key).not.toBe(b.key);
    // Device A's two live sessions are one row too (the expired third one is not counted: 6.314).
    expect(a.sessionCount).toBe(2);
  });
});

describe('6.312 two devices with the same user agent', () => {
  it('6.312 different key and tag; control: the same device keeps its key across calls', async () => {
    const first = await list(aliceA2);
    const a = first.find((d) => d.key === deviceKey(aliceA1.deviceId))!;
    const b = first.find((d) => d.key === deviceKey(aliceB1.deviceId))!;
    expect(a.userAgent).toBe(UA);
    expect(b.userAgent).toBe(UA);
    expect(a.tag).toMatch(/^[A-Z2-7]{4}$/);
    expect(a.tag).toBe(deviceTag(aliceA1.deviceId));
    expect(a.tag).not.toBe(b.tag);
    expect(a.key).not.toBe(b.key);
    const again = (await list(aliceA2)).find((d) => d.key === a.key);
    expect(again?.tag).toBe(a.tag);
  });
});

describe('6.313 no raw device id on the wire', () => {
  it('6.313 the body holds no stored deviceId; control: it does hold the one-way key', async () => {
    const res = await get(aliceA2);
    const stored = await db.pool.query(`SELECT "deviceId" FROM session WHERE "deviceId" IS NOT NULL`);
    expect(stored.rows.length).toBeGreaterThan(3);
    for (const row of stored.rows) expect(res.body).not.toContain(row.deviceId);
    expect(res.body).toContain(deviceKey(aliceA1.deviceId));
  });
});

describe('6.314 expired sessions are not listed', () => {
  it('6.314 a device whose sessions are all expired is absent; control: live device A is present', async () => {
    const devices = await list(aliceA2);
    expect(devices.some((d) => d.key === deviceKey('E'.repeat(43)))).toBe(false);
    expect(devices.some((d) => d.key === deviceKey(aliceA1.deviceId))).toBe(true);
  });
});

describe('6.315 pre-V1 sessions group by user agent + address', () => {
  it('6.315 NULL-deviceId rows: legacy, no tag, one group per user agent + IP; control: a deviceId session is not legacy', async () => {
    const devices = await list(aliceA2);
    const legacy = devices.filter((d) => d.legacy);
    expect(legacy).toHaveLength(2);
    expect(legacy.every((d) => d.tag === null && d.key.startsWith('legacy:'))).toBe(true);
    expect(legacy.map((d) => d.sessionCount).sort()).toEqual([1, 2]);
    expect(devices.find((d) => d.key === deviceKey(aliceA1.deviceId))?.legacy).toBe(false);
  });
});

describe('6.316 the current device', () => {
  it('6.316 isCurrent is true on the caller session\'s device only, and it is listed first; control: another browser flips it', async () => {
    // Make another device the most recently seen one, so only the current-first rule can put the caller on top.
    await db.pool.query(`UPDATE session SET "lastSeenAt" = now() + interval '1 hour' WHERE id = 'legacy-2'`);
    const asA = await list(aliceA2);
    await db.pool.query(`UPDATE session SET "lastSeenAt" = NULL WHERE id = 'legacy-2'`);
    expect(asA.find((d) => !d.isCurrent)!.lastSeenAt > asA[0]!.lastSeenAt).toBe(true);
    expect(asA[0]!.key).toBe(deviceKey(aliceA1.deviceId));
    expect(asA.filter((d) => d.isCurrent).map((d) => d.key)).toEqual([deviceKey(aliceA1.deviceId)]);
    const asB = await list(aliceB2);
    expect(asB[0]!.key).toBe(deviceKey(aliceB1.deviceId));
    expect(asB.filter((d) => d.isCurrent).map((d) => d.key)).toEqual([deviceKey(aliceB1.deviceId)]);
  });
});

describe('6.318 a foreign or unknown key', () => {
  it('6.318 another person\'s key (and no key) answers 404 and deletes nothing; control: the own key answers 204 (6.317)', async () => {
    const before = await sessionTotal();
    const theirs = await signOut(aliceA2, deviceKey(bob.deviceId));
    expect(theirs.statusCode).toBe(404);
    expect(theirs.json()).toEqual({ error: 'not_found' });
    expect((await signOut(aliceA2, deviceKey('nobody'))).statusCode).toBe(404);
    expect(await sessionTotal()).toBe(before);
    // bob is still signed in
    expect((await get(bob)).statusCode).toBe(200);
  });
});

describe('6.319 the current device cannot be signed out from the list', () => {
  it('6.319 409 current_device and nothing deleted; control: another device signs out (6.317)', async () => {
    const before = await sessionTotal();
    const res = await signOut(aliceA2, deviceKey(aliceA1.deviceId));
    expect(res.statusCode).toBe(409);
    expect(res.json()).toEqual({ error: 'current_device' });
    expect(await sessionTotal()).toBe(before);
  });
});

describe('6.320 a browser concept: MCP tokens are refused', () => {
  it('6.320 an MCP-token caller gets 403 on both routes; control: a session caller gets 200', async () => {
    const now = new Date();
    const grant = await mintDeviceCode(db.pool, now);
    await approveDeviceCode(db.pool, grant.userCode, aliceId, now);
    const exchanged = await exchangeDeviceCode(db.pool, grant.deviceCode, now);
    if (exchanged.status !== 'issued') throw new Error(`no token: ${exchanged.status}`);
    const headers = { authorization: `Bearer ${exchanged.token}` };
    expect((await app.inject({ method: 'GET', url: '/v1/me/devices', headers })).statusCode).toBe(403);
    expect((await app.inject({ method: 'POST', url: `/v1/me/devices/${deviceKey(aliceB1.deviceId)}/sign-out`, headers })).statusCode).toBe(403);
    expect((await get(aliceA2)).statusCode).toBe(200);
  });
});

describe('6.317 sign out another device', () => {
  it('6.317 deletes exactly that device\'s sessions of the CALLER and answers 204; control: the caller\'s other devices and bob survive', async () => {
    const before = await db.pool.query(`SELECT "deviceId", count(*)::int AS n FROM session WHERE "userId" = $1 AND "expiresAt" > now() GROUP BY "deviceId"`, [aliceId]);
    const countOf = (id: string | null) => before.rows.find((r) => r.deviceId === id)?.n ?? 0;
    expect(countOf(aliceB1.deviceId)).toBe(2);
    const res = await signOut(aliceA2, deviceKey(aliceB1.deviceId));
    expect(res.statusCode).toBe(204);
    const after = await db.pool.query(`SELECT "deviceId", count(*)::int AS n FROM session WHERE "userId" = $1 AND "expiresAt" > now() GROUP BY "deviceId"`, [aliceId]);
    expect(after.rows.find((r) => r.deviceId === aliceB1.deviceId)).toBeUndefined();
    expect(after.rows.find((r) => r.deviceId === aliceA1.deviceId)?.n).toBe(countOf(aliceA1.deviceId));
    expect(after.rows.find((r) => r.deviceId === null)?.n).toBe(countOf(null)); // the legacy rows survive
    expect((await get(bob)).statusCode).toBe(200);
    // bob is signed in on the SAME browser (same gn_device): the sign-out is alice's sessions only, never his.
    expect((await get(bobOnAlicesBrowser)).statusCode).toBe(200);
    const bobLeft = await db.pool.query(`SELECT count(*)::int AS n FROM session WHERE "userId" = $1 AND "deviceId" = $2`, [bob.userId, aliceB1.deviceId]);
    expect(bobLeft.rows[0].n).toBe(1);
    // and that browser is signed out on its next request
    expect((await get(aliceB2)).statusCode).toBe(401);
    // the route cannot sign out a legacy group's... (a legacy key is an ordinary key of the caller's own)
    const legacyKey = (await list(aliceA2)).find((d) => d.legacy && d.sessionCount === 2)!.key;
    expect((await signOut(aliceA2, legacyKey)).statusCode).toBe(204);
  });
});
