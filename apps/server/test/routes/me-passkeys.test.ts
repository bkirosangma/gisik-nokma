import { evaluateEvent } from '@gisik-nokma/rule-engine';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerMePasskeyRoutes } from '../../src/routes/me-passkeys.js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { createAuth } from '../../src/auth/auth.js';
import { LogMagicLinkSender } from '../../src/auth/magic-link-sender.js';
import { LogOtpSender } from '../../src/auth/otp-sender.js';
import { createObjectStoreFromEnv } from '../../src/attachments/store-config.js';
import { createIngestService } from '../../src/ingest/ingest-service.js';
import { approveDeviceCode, exchangeDeviceCode, mintDeviceCode } from '../../src/mcp/token-store.js';
import { buildProjectionRegistry } from '../../src/projections/index.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';

/**
 * Cases 6.327-6.329 - `GET /v1/me/passkeys` (devices plan Task 5). Alice has four passkeys (an iCloud one used
 * yesterday, an unknown-authenticator one used 89 d 23 h 59 min ago, an unused one, and one used exactly 90 days
 * ago); bob has one. Rows are inserted directly: the route's contract is the read, the ceremony is 6.325/6.326.
 */
const SECRET = 'me-passkeys-secret-me-passkeys-secret-1';
const WEB = 'http://localhost:3001';
const ICLOUD = 'fbfc3007-154e-4ecc-8c0b-6e020557d7bd';
let db: TestDatabase;
let app: FastifyInstance;
let otp: LogOtpSender;
let aliceCookie: string;
let aliceId: string;
let bobCookie: string;

async function signIn(phone: string): Promise<{ cookie: string; userId: string }> {
  const before = otp.sent.length;
  await app.inject({ method: 'POST', url: '/api/auth/phone-number/send-otp', payload: { phoneNumber: phone } });
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/phone-number/verify',
    payload: { phoneNumber: phone, code: otp.sent[before]?.code },
  });
  if (res.statusCode !== 200) throw new Error(`sign-in failed: ${res.statusCode} ${res.body}`);
  const raw = res.headers['set-cookie'];
  const cookies = Array.isArray(raw) ? (raw as string[]) : [String(raw)];
  return {
    cookie: cookies.map((c) => c.split(';')[0]!).find((c) => c.startsWith('better-auth.session_token='))!,
    userId: (res.json() as { user: { id: string } }).user.id,
  };
}

async function insertPasskey(id: string, userId: string, name: string | null, aaguid: string | null, created: string, lastUsed: string | null) {
  await db.pool.query(
    `INSERT INTO passkey (id, name, "publicKey", "userId", "credentialID", counter, "deviceType", "backedUp", transports, "createdAt", aaguid, "lastUsedAt")
     VALUES ($1, $2, 'SECRET-PUBLIC-KEY', $3, $4, 7, 'singleDevice', false, NULL, $5, $6, ${lastUsed === null ? 'NULL' : `now() - interval '${lastUsed}'`})`,
    [id, name, userId, `cred-${id}`, created, aaguid],
  );
}

beforeAll(async () => {
  db = await createTestDatabase();
  otp = new LogOtpSender(() => {});
  const auth = createAuth({ pool: db.pool, otpSender: otp, magicLinkSender: new LogMagicLinkSender(() => {}), baseUrl: 'http://localhost:3000', secret: SECRET, webOrigin: WEB });
  const ingest = createIngestService({ pool: db.pool, evaluate: evaluateEvent, projections: buildProjectionRegistry() });
  app = buildApp({ db: db.pool, pool: db.pool, ingest, auth, serverAppend: (e) => ingest.ingestBatch(e), webOrigin: WEB, store: createObjectStoreFromEnv({}) });
  await app.ready();
  const alice = await signIn('+919100000051');
  const bob = await signIn('+919100000052');
  aliceCookie = alice.cookie;
  aliceId = alice.userId;
  bobCookie = bob.cookie;
  await insertPasskey('p-icloud', aliceId, 'MacBook', ICLOUD, '2026-09-01T00:00:00Z', '1 day');
  await insertPasskey('p-key', aliceId, null, '00000000-0000-0000-0000-000000000000', '2026-09-02T00:00:00Z', '89 days 23 hours 59 minutes');
  await insertPasskey('p-never', aliceId, 'Old phone', ICLOUD, '2026-09-03T00:00:00Z', null);
  await insertPasskey('p-90', aliceId, 'Ninety', null, '2026-09-04T00:00:00Z', '90 days');
  await insertPasskey('p-bob', bob.userId, 'Bob key', ICLOUD, '2026-09-05T00:00:00Z', '1 day');
}, 60_000);
afterAll(async () => {
  await app.close();
  await db.drop();
});

type Row = { id: string; name: string | null; provider: string; createdAt: string; lastUsedAt: string | null; notUsedRecently: boolean };
const read = (cookie: string) => app.inject({ method: 'GET', url: '/v1/me/passkeys', headers: { cookie } });
const passkeys = async (cookie: string) => ((await read(cookie)).json() as { passkeys: Row[] }).passkeys;

describe('GET /v1/me/passkeys', () => {
  it('6.327 returns only the caller\'s passkeys with provider, createdAt and lastUsedAt, oldest first, and never publicKey/credentialID/counter; control: bob\'s passkey is absent and alice\'s rows are present', async () => {
    const res = await read(aliceCookie);
    expect(res.statusCode).toBe(200);
    const rows = (res.json() as { passkeys: Row[] }).passkeys;
    expect(rows.map((r) => r.id)).toEqual(['p-icloud', 'p-key', 'p-never', 'p-90']);
    expect(rows[0]).toMatchObject({ name: 'MacBook', provider: 'iCloud Keychain', createdAt: '2026-09-01T00:00:00.000Z' });
    expect(rows[0]!.lastUsedAt).toMatch(/^\d{4}-\d\d-\d\dT/);
    expect(rows[1]).toMatchObject({ name: null, provider: 'Security key or other' });
    expect(rows[2]!.lastUsedAt).toBeNull();
    // nothing secret, in any spelling
    for (const leaked of ['SECRET-PUBLIC-KEY', 'cred-p-icloud', 'publicKey', 'credentialID', 'counter', 'aaguid']) {
      expect(res.body).not.toContain(leaked);
    }
    expect(res.body).not.toContain('p-bob');
    expect((await passkeys(bobCookie)).map((r) => r.id)).toEqual(['p-bob']);
  });

  it('6.328 notUsedRecently is true for lastUsedAt NULL or 90 days old, false at 89 d 23 h 59 min and for yesterday; control: each side of the boundary in one response', async () => {
    const byId = Object.fromEntries((await passkeys(aliceCookie)).map((r) => [r.id, r.notUsedRecently]));
    expect(byId).toEqual({ 'p-icloud': false, 'p-key': false, 'p-never': true, 'p-90': true });
  });

  it('6.329 an MCP-token caller gets 403; control: a session caller gets 200', async () => {
    const now = new Date();
    const grant = await mintDeviceCode(db.pool, now);
    await approveDeviceCode(db.pool, grant.userCode, aliceId, now);
    const exchanged = await exchangeDeviceCode(db.pool, grant.deviceCode, now);
    if (exchanged.status !== 'issued') throw new Error(`no token: ${exchanged.status}`);
    const res = await app.inject({ method: 'GET', url: '/v1/me/passkeys', headers: { authorization: `Bearer ${exchanged.token}` } });
    expect(res.statusCode).toBe(403);
    expect((await read(aliceCookie)).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/v1/me/passkeys' })).statusCode).toBe(401);
  });
});

describe('GET /v1/me/passkeys - the 90-day boundary against an injected clock', () => {
  it('6.343 a passkey last used EXACTLY 90 days before `now` is notUsedRecently; one millisecond younger is not, one older is; control: never used is', async () => {
    const NOW = new Date('2026-10-01T00:00:00.000Z');
    const DAY90 = 90 * 24 * 60 * 60 * 1000;
    const f = Fastify();
    registerMePasskeyRoutes(
      f,
      { pool: db.pool, now: () => NOW },
      async (request) => {
        (request as unknown as { authKind: string; currentUserId: string }).authKind = 'session';
        (request as unknown as { authKind: string; currentUserId: string }).currentUserId = aliceId;
      },
    );
    await f.ready();
    // alice's earlier fixtures (real-clock lastUsedAt) are replaced so the only rows are this case's
    await db.pool.query(`DELETE FROM passkey WHERE "userId" = $1`, [aliceId]);
    const insert = (id: string, lastUsed: Date | null, created: string) =>
      db.pool.query(
        `INSERT INTO passkey (id, name, "publicKey", "userId", "credentialID", counter, "deviceType", "backedUp", "createdAt", aaguid, "lastUsedAt")
         VALUES ($1, $1, 'k', $2, $1, 0, 'singleDevice', false, $3, NULL, $4)`,
        [id, aliceId, created, lastUsed],
      );
    await insert('b-exact', new Date(NOW.getTime() - DAY90), '2026-09-01T00:00:01Z');
    await insert('b-younger', new Date(NOW.getTime() - DAY90 + 1), '2026-09-01T00:00:02Z');
    await insert('b-older', new Date(NOW.getTime() - DAY90 - 1), '2026-09-01T00:00:03Z');
    await insert('b-never', null, '2026-09-01T00:00:04Z');
    const res = await f.inject({ method: 'GET', url: '/v1/me/passkeys' });
    expect(res.statusCode).toBe(200);
    const byId = Object.fromEntries(((res.json() as { passkeys: Row[] }).passkeys).map((r) => [r.id, r.notUsedRecently]));
    expect(byId).toEqual({ 'b-exact': true, 'b-younger': false, 'b-older': true, 'b-never': true });
    await f.close();
  });
});

