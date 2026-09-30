import { createHash } from 'node:crypto';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAuth } from '../../src/auth/auth.js';
import { LogMagicLinkSender } from '../../src/auth/magic-link-sender.js';
import { LogOtpSender } from '../../src/auth/otp-sender.js';
import type { Queryable } from '../../src/db/queryable.js';
import { makeRequireSession } from '../../src/auth/require-session.js';
import { registerAuthRoutes } from '../../src/auth/routes.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { signInWithPhone } from '../helpers/session.js';
import { approveDeviceCode, exchangeDeviceCode, mintDeviceCode } from '../../src/mcp/token-store.js';

/** Long enough that better-auth does not warn, and obviously not a credential. */
const TEST_SECRET = 'test-secret-not-used-anywhere-real';

const BASE_URL = 'http://localhost:3000';

/** The exact body, quoted rather than imported, so a change to it fails here. */
const UNAUTHENTICATED = '{"error":"unauthenticated"}';

let db: TestDatabase;
let app: FastifyInstance;
/** Every credential the PAT fallback was asked to resolve, in order. */
let patLookups: string[] = [];
let otp: LogOtpSender;

/**
 * A bare Fastify and not `buildApp`: this file is about the preHandler factory,
 * so the app around it should be the smallest thing that can carry one protected
 * route. `sign-in-flows.test.ts` is where the assembled server is the subject.
 */
beforeAll(async () => {
  db = await createTestDatabase();
  otp = new LogOtpSender(() => {});
  const auth = createAuth({
    pool: db.pool,
    otpSender: otp,
    magicLinkSender: new LogMagicLinkSender(() => {}),
    baseUrl: BASE_URL,
    secret: TEST_SECRET,
    // The browser's origin, so better-auth trusts the product's own client.
    webOrigin: 'http://localhost:3001',
  });
  app = Fastify();
  registerAuthRoutes(app, auth);
  // A stub rather than `db.pool`, and the stub RECORDS, so the case below can
  // assert the fallback was actually REACHED rather than inferring it from a
  // 401 that the old code produced anyway. The narrowest thing satisfying
  // `Queryable` for this purpose: a `query` that always misses.
  patLookups = [];
  const patStub = {
    query: async (_text: string, values?: unknown[]) => {
      patLookups.push(String((values ?? [])[0] ?? ''));
      return { rows: [], rowCount: 0 };
    },
  } as unknown as Queryable;
  const requireSession = makeRequireSession(auth, patStub);
  app.get('/protected', { preHandler: requireSession }, async (request) => ({
    userId: request.currentUserId,
  }));
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await db.drop();
});

describe('requireSession', () => {
  it('refuses a request with no session as a generic 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/protected' });
    expect(res.statusCode).toBe(401);
    expect(res.body).toBe(UNAUTHENTICATED);
  });

  /**
   * The same answer, to the byte, as the no-header case above. Anything a caller
   * could tell apart here — a different code, a different message, even a
   * different content length — is a signal about whether the token they guessed
   * was closer, and there is no legitimate client that needs to know.
   */
  it('refuses a forged bearer token with exactly the same answer', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { authorization: 'Bearer forged-token-000000' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.body).toBe(UNAUTHENTICATED);
  });

  /**
   * A cookie whose value is not a valid signed token must be a 401 and not a
   * 500. It is the same class of input as the forged bearer above, arriving by
   * the other transport, and a thrown error here would answer with the app's
   * internal-error body — telling an attacker they had reached something.
   */
  it('refuses a corrupt session cookie with exactly the same answer', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { cookie: 'better-auth.session_token=not-a-real-token.not-a-signature' },
    });
    expect(res.statusCode).toBe(401);
    expect(res.body).toBe(UNAUTHENTICATED);
  });

  /**
   * `toBeTruthy` would pass on any string. What the later tasks need is that the
   * id on the request is THE signed-in user's — it becomes `actorId` on the
   * events that route authors, so a right-shaped wrong id would attribute one
   * person's work to another.
   */
  it('resolves the exact user for a real bearer session', async () => {
    const { token, userId } = await signInWithPhone(app, otp, '+919000000004');
    const res = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ userId });
  });

  /**
   * The web transport, through the same preHandler and with no branch for it:
   * cookie and bearer are both just headers, and better-auth resolves either.
   */
  it('resolves the same user from a session cookie', async () => {
    const phone = '+919000000005';
    await app.inject({
      method: 'POST',
      url: '/api/auth/phone-number/send-otp',
      payload: { phoneNumber: phone },
    });
    const verify = await app.inject({
      method: 'POST',
      url: '/api/auth/phone-number/verify',
      payload: { phoneNumber: phone, code: otp.sent.at(-1)?.code },
    });
    const raw = verify.headers['set-cookie'];
    const cookie = (Array.isArray(raw) ? raw : [String(raw)])
      .map((entry) => entry.split(';')[0])
      .join('; ');

    const res = await app.inject({ method: 'GET', url: '/protected', headers: { cookie } });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ userId: verify.json().user.id });
  });

  /**
   * The check that separates a session from a signature.
   *
   * A signed-out token still verifies cryptographically — the secret has not
   * changed and neither have the bytes. It must stop working anyway, because the
   * session row is gone, and that is only true if the guard asks the database on
   * every request rather than trusting the signature. Sign-out is the one
   * observable way to make that difference visible from outside.
   */
  it('refuses a token whose session has been signed out', async () => {
    const { token } = await signInWithPhone(app, otp, '+919000000006');
    const before = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(before.statusCode).toBe(200);

    const signOut = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-out',
      headers: { authorization: `Bearer ${token}` },
      payload: {},
    });
    expect(signOut.statusCode).toBe(200);

    const after = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(after.statusCode).toBe(401);
    expect(after.body).toBe(UNAUTHENTICATED);
  });

  /**
   * 14.36 — a request better-auth REJECTS still reaches the MCP fallback, and
   * still answers the same contentless 401 when the fallback misses.
   *
   * The 401 alone proves nothing here: it is exactly what this route answered
   * before the fallback existed. What makes the case a discriminator is
   * `patLookups` — the stub records every credential it was asked to resolve,
   * so this asserts the fallback was REACHED and missed, rather than inferring
   * it from an unchanged status code.
   */
  it('14.36 a rejected bearer reaches the MCP fallback and still 401s when it misses', async () => {
    patLookups = [];
    const response = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { authorization: 'Bearer definitely-not-a-session' },
    });
    expect(response.statusCode).toBe(401);
    expect(response.body).toBe(UNAUTHENTICATED);
    // Reached, with the raw credential and nothing else.
    expect(patLookups).toHaveLength(1);
    expect(patLookups[0]).toBe(
      // sha256('definitely-not-a-session') — the store hashes before it looks up,
      // so what reaches the query is never the credential itself.
      createHash('sha256').update('definitely-not-a-session').digest('hex'),
    );
  });

  /**
   * 14.37 — a request carrying NO Authorization header does not reach the
   * fallback at all. The guard is `startsWith('Bearer ')`, and without this
   * case a fallback that ran on every unauthenticated request — one database
   * write per anonymous probe — would look identical from the outside.
   */
  it('14.37 an unauthenticated request with no bearer never reaches the fallback', async () => {
    patLookups = [];
    const response = await app.inject({ method: 'GET', url: '/protected' });
    expect(response.statusCode).toBe(401);
    expect(patLookups).toEqual([]);
  });
});

/**
 * Cases 6.307-6.310 - `lastSeenAt` and `currentSessionId` (devices plan Task 2, 2026-10-01). A second bare app
 * over the REAL pool (the stub above answers every query with no rows), with an injected clock.
 */
describe('devices plan: lastSeenAt and currentSessionId', () => {
  let clock = new Date('2026-10-01T00:00:00Z');
  let stampApp: FastifyInstance;
  let failingApp: FastifyInstance;
  let stampOtp: LogOtpSender;
  let failOtp: LogOtpSender;
  const PROBE = '/probe';

  function buildApp(database: Queryable, sender: LogOtpSender): FastifyInstance {
    const auth = createAuth({
      pool: db.pool,
      otpSender: sender,
      magicLinkSender: new LogMagicLinkSender(() => {}),
      baseUrl: BASE_URL,
      secret: TEST_SECRET,
      webOrigin: 'http://localhost:3001',
    });
    const built = Fastify();
    registerAuthRoutes(built, auth);
    built.get(PROBE, { preHandler: makeRequireSession(auth, database, () => clock) }, async (request) => ({
      userId: request.currentUserId,
      sessionId: request.currentSessionId,
      authKind: request.authKind,
    }));
    return built;
  }

  beforeAll(async () => {
    stampOtp = new LogOtpSender(() => {});
    failOtp = new LogOtpSender(() => {});
    stampApp = buildApp(db.pool, stampOtp);
    // Every query passes through EXCEPT the lastSeenAt stamp, which throws.
    const failing = {
      query: (text: string, values?: unknown[]) =>
        /UPDATE session SET "lastSeenAt"/.test(text) ? Promise.reject(new Error('stamp down')) : db.pool.query(text, values),
    } as unknown as Queryable;
    failingApp = buildApp(failing, failOtp);
    await stampApp.ready();
    await failingApp.ready();
  });
  afterAll(async () => {
    await stampApp.close();
    await failingApp.close();
  });

  const sessionIdOf = async (token: string): Promise<string> => {
    // The bearer token is `<session token>.<signature>`; the row is keyed on the first part.
    const r = await db.pool.query(`SELECT id FROM session WHERE token = $1`, [token.split('.')[0]]);
    return r.rows[0].id as string;
  };
  const lastSeen = async (sessionId: string): Promise<Date | null> => {
    const r = await db.pool.query(`SELECT "lastSeenAt" FROM session WHERE id = $1`, [sessionId]);
    return r.rows[0].lastSeenAt as Date | null;
  };
  const hit = (target: FastifyInstance, token: string) =>
    target.inject({ method: 'GET', url: PROBE, headers: { authorization: `Bearer ${token}` } });

  it('6.307 null -> stamped; 4m59s later -> unchanged; 6.308 exactly 5m -> restamped (both sides of the boundary)', async () => {
    const { token } = await signInWithPhone(stampApp, stampOtp, '+919000000307');
    const sid = await sessionIdOf(token);
    // CONTROL - a fresh session has never been stamped.
    expect(await lastSeen(sid)).toBeNull();

    clock = new Date('2026-10-01T00:00:00Z');
    expect((await hit(stampApp, token)).statusCode).toBe(200);
    expect(await lastSeen(sid)).toEqual(clock);
    const first = clock;

    clock = new Date(first.getTime() + 299_000); // 4 m 59 s: inside the throttle, nothing written
    expect((await hit(stampApp, token)).statusCode).toBe(200);
    expect(await lastSeen(sid)).toEqual(first);

    clock = new Date(first.getTime() + 300_000); // exactly 5 m: the next request stamps (6.308)
    expect((await hit(stampApp, token)).statusCode).toBe(200);
    expect(await lastSeen(sid)).toEqual(clock);
  });

  it('6.309 currentSessionId is the session row id for a session request, null for an MCP token; currentUserId unchanged in both', async () => {
    const { token, userId } = await signInWithPhone(stampApp, stampOtp, '+919000000309');
    const sid = await sessionIdOf(token);
    const viaSession = (await hit(stampApp, token)).json() as { userId: string; sessionId: string | null; authKind: string };
    expect(viaSession).toEqual({ userId, sessionId: sid, authKind: 'session' });

    const grant = await mintDeviceCode(db.pool, clock);
    expect(await approveDeviceCode(db.pool, grant.userCode, userId, clock)).toBe('approved');
    const exchanged = await exchangeDeviceCode(db.pool, grant.deviceCode, clock);
    if (exchanged.status !== 'issued') throw new Error(`exchange did not issue a token: ${exchanged.status}`);
    const viaToken = (await hit(stampApp, exchanged.token)).json() as { userId: string; sessionId: string | null; authKind: string };
    expect(viaToken).toEqual({ userId, sessionId: null, authKind: 'mcp-token' });
  });

  it('6.310 a failing stamp is swallowed: the request still answers 200; control: the same request through the working app stamped', async () => {
    const { token } = await signInWithPhone(failingApp, failOtp, '+919000000310');
    const sid = await sessionIdOf(token);
    clock = new Date('2026-10-01T06:00:00Z');
    const res = await hit(failingApp, token);
    expect(res.statusCode).toBe(200);
    expect(await lastSeen(sid)).toBeNull(); // the stamp really was refused...
    expect((await hit(stampApp, token)).statusCode).toBe(200); // ...and the same session stamps fine through the working app
    expect(await lastSeen(sid)).toEqual(clock);
  });
});
