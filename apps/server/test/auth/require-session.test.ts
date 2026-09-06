import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAuth } from '../../src/auth/auth.js';
import { LogMagicLinkSender } from '../../src/auth/magic-link-sender.js';
import { LogOtpSender } from '../../src/auth/otp-sender.js';
import { makeRequireSession } from '../../src/auth/require-session.js';
import { registerAuthRoutes } from '../../src/auth/routes.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { signInWithPhone } from '../helpers/session.js';

/** Long enough that better-auth does not warn, and obviously not a credential. */
const TEST_SECRET = 'test-secret-not-used-anywhere-real';

const BASE_URL = 'http://localhost:3000';

/** The exact body, quoted rather than imported, so a change to it fails here. */
const UNAUTHENTICATED = '{"error":"unauthenticated"}';

let db: TestDatabase;
let app: FastifyInstance;
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
  const requireSession = makeRequireSession(auth);
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
});
