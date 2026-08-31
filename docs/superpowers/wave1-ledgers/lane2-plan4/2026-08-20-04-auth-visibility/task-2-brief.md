### Task 2: Auth routes and session resolution on Fastify

**Files:**
- Create: `apps/server/src/auth/routes.ts`
- Create: `apps/server/src/auth/require-session.ts`
- Create: `apps/server/test/helpers/session.ts`
- Modify: `apps/server/src/app.ts` (Plan 1's app assembly — register the auth routes where other routes are registered)
- Test: `apps/server/test/auth/sign-in-flows.test.ts`
- Test: `apps/server/test/auth/require-session.test.ts`

**Interfaces:**
- Consumes: `createAuth`, `LogOtpSender`, `LogMagicLinkSender`, test DB helpers (Task 1).
- Produces: `registerAuthRoutes(app: FastifyInstance, auth: Auth): void` mounting `/api/auth/*`; `makeRequireSession(auth: Auth)` returning a Fastify preHandler that 401s without a session and sets `request.currentUserId: string`; test helper `signInWithPhone(app, sender, phone): Promise<string>` (bearer token) in `test/helpers/session.ts`. Every later task's routes use `makeRequireSession`; every later task's route tests sign in through `signInWithPhone`; every client plan signs in through `/api/auth/*`.

- [ ] **Step 1: Write the failing sign-in flow tests**

```ts
// apps/server/test/auth/sign-in-flows.test.ts
import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { createAuth, type Auth } from '../../src/auth/auth';
import { LogMagicLinkSender } from '../../src/auth/magic-link-sender';
import { LogOtpSender } from '../../src/auth/otp-sender';
import { registerAuthRoutes } from '../../src/auth/routes';
import { migrateTestDb, testPool, truncateAll } from '../helpers/db';

let pool: Pool;
let app: FastifyInstance;
let auth: Auth;
let otp: LogOtpSender;
let magic: LogMagicLinkSender;

beforeAll(async () => {
  migrateTestDb();
  pool = testPool();
  otp = new LogOtpSender(() => {});
  magic = new LogMagicLinkSender(() => {});
  auth = createAuth({
    pool,
    otpSender: otp,
    magicLinkSender: magic,
    baseUrl: 'http://localhost:3000',
    secret: 'test-secret-at-least-32-characters-long',
  });
  app = Fastify();
  registerAuthRoutes(app, auth);
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

beforeEach(async () => {
  await truncateAll(pool);
  otp.sent.length = 0;
  magic.sent.length = 0;
});

describe('phone OTP sign-in', () => {
  it('delivers a code through OtpSender and verifying it opens a session', async () => {
    const send = await app.inject({
      method: 'POST',
      url: '/api/auth/phone-number/send-otp',
      payload: { phoneNumber: '+919000000001' },
    });
    expect(send.statusCode).toBeLessThan(300);
    expect(otp.sent).toHaveLength(1);

    const verify = await app.inject({
      method: 'POST',
      url: '/api/auth/phone-number/verify',
      payload: { phoneNumber: '+919000000001', code: otp.sent[0].code },
    });
    expect(verify.statusCode).toBeLessThan(300);
    const setCookie = verify.headers['set-cookie'];
    expect(setCookie).toBeDefined();
    const cookieText = Array.isArray(setCookie) ? setCookie.join(';') : String(setCookie);
    expect(cookieText).toMatch(/HttpOnly/i); // web sessions are httpOnly cookies
  });
});

describe('email magic link sign-in', () => {
  it('delivers a link through MagicLinkSender and following it opens a session', async () => {
    const start = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/magic-link',
      payload: { email: 'kiro@example.com' },
    });
    expect(start.statusCode).toBeLessThan(300);
    expect(magic.sent).toHaveLength(1);

    const url = new URL(magic.sent[0].url);
    const follow = await app.inject({ method: 'GET', url: url.pathname + url.search });
    // Verification responds with a redirect carrying the session cookie.
    expect([200, 302]).toContain(follow.statusCode);
    expect(follow.headers['set-cookie']).toBeDefined();
  });
});

describe('bearer sessions for the apps', () => {
  it('returns a token on sign-in that authenticates via the Authorization header', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/auth/phone-number/send-otp',
      payload: { phoneNumber: '+919000000002' },
    });
    const verify = await app.inject({
      method: 'POST',
      url: '/api/auth/phone-number/verify',
      payload: { phoneNumber: '+919000000002', code: otp.sent[0].code },
    });
    const token = verify.headers['set-auth-token'] as string;
    expect(token).toBeTruthy();

    const session = await app.inject({
      method: 'GET',
      url: '/api/auth/get-session',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(session.statusCode).toBe(200);
    expect(session.json().user).toBeTruthy();
  });
});

describe('google oauth wiring', () => {
  it('builds a Google authorization redirect (no external call)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/social',
      payload: { provider: 'google' },
    });
    expect(res.statusCode).toBeLessThan(300);
    expect(res.json().url).toContain('accounts.google.com');
  });
});

describe('passkey endpoints', () => {
  it('offers registration options to a signed-in user', async () => {
    await app.inject({
      method: 'POST',
      url: '/api/auth/phone-number/send-otp',
      payload: { phoneNumber: '+919000000003' },
    });
    const verify = await app.inject({
      method: 'POST',
      url: '/api/auth/phone-number/verify',
      payload: { phoneNumber: '+919000000003', code: otp.sent[0].code },
    });
    const token = verify.headers['set-auth-token'] as string;
    const options = await app.inject({
      method: 'GET',
      url: '/api/auth/passkey/generate-register-options',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(options.statusCode).toBe(200);
    expect(options.json().challenge).toBeTruthy(); // WebAuthn ceremony is client-side; the server side is live
  });
});
```

Note: the `/api/auth/...` sub-paths are better-auth 1.x endpoint names. If the pinned version routes differently (versioned docs), fix the paths in the test — the flows themselves (send code → verify → session; link → verify → session; bearer; social url; passkey options) are the contract.

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `apps/server/`): `pnpm vitest run test/auth/sign-in-flows.test.ts`
Expected: FAIL — cannot resolve `../../src/auth/routes`.

- [ ] **Step 3: Implement the catch-all auth route**

```ts
// apps/server/src/auth/routes.ts
import type { FastifyInstance } from 'fastify';
import type { Auth } from './auth';

/**
 * Mounts better-auth's Web-standard handler on Fastify 5 via a catch-all
 * route — the library's documented Fastify integration.
 */
export function registerAuthRoutes(app: FastifyInstance, auth: Auth): void {
  app.route({
    method: ['GET', 'POST'],
    url: '/api/auth/*',
    async handler(request, reply) {
      const url = new URL(request.url, `http://${request.headers.host ?? 'localhost'}`);
      const headers = new Headers();
      for (const [key, value] of Object.entries(request.headers)) {
        if (typeof value === 'string') headers.append(key, value);
        else if (Array.isArray(value)) for (const v of value) headers.append(key, v);
      }
      const body =
        request.method === 'POST' && request.body !== undefined && request.body !== null
          ? JSON.stringify(request.body)
          : undefined;
      const webRequest = new Request(url.toString(), { method: request.method, headers, body });

      const response = await auth.handler(webRequest);

      reply.status(response.status);
      response.headers.forEach((value, key) => {
        if (key.toLowerCase() !== 'set-cookie') reply.header(key, value);
      });
      const cookies = response.headers.getSetCookie();
      if (cookies.length > 0) reply.header('set-cookie', cookies);
      reply.send(response.body ? await response.text() : null);
    },
  });
}
```

- [ ] **Step 4: Implement session resolution**

```ts
// apps/server/src/auth/require-session.ts
import type { FastifyReply, FastifyRequest } from 'fastify';
import { fromNodeHeaders } from 'better-auth/node';
import type { Auth } from './auth';

declare module 'fastify' {
  interface FastifyRequest {
    /** Set by requireSession; absent means the preHandler was skipped. */
    currentUserId: string;
  }
}

/**
 * Every protected route resolves session → user through this preHandler.
 * Cookie (web) and bearer (apps) both arrive as headers; better-auth
 * resolves either. No session → generic 401, no detail leaked.
 */
export function makeRequireSession(auth: Auth) {
  return async function requireSession(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
    if (!session) {
      await reply.code(401).send({ error: 'unauthenticated' });
      return;
    }
    request.currentUserId = session.user.id;
  };
}
```

- [ ] **Step 5: Run the sign-in tests to verify they pass**

Run (from `apps/server/`): `pnpm vitest run test/auth/sign-in-flows.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Write the shared sign-in test helper**

Later tasks' route tests all need a session; the helper lives with the other test helpers from day one:

```ts
// apps/server/test/helpers/session.ts
import type { FastifyInstance } from 'fastify';
import type { LogOtpSender } from '../../src/auth/otp-sender';

/** Sign a user in over the wire (phone OTP) and return a bearer token. */
export async function signInWithPhone(
  app: FastifyInstance,
  sender: LogOtpSender,
  phone: string,
): Promise<string> {
  const before = sender.sent.length;
  await app.inject({ method: 'POST', url: '/api/auth/phone-number/send-otp', payload: { phoneNumber: phone } });
  const verify = await app.inject({
    method: 'POST',
    url: '/api/auth/phone-number/verify',
    payload: { phoneNumber: phone, code: sender.sent[before].code },
  });
  return verify.headers['set-auth-token'] as string;
}
```

- [ ] **Step 7: Write the failing requireSession tests**

```ts
// apps/server/test/auth/require-session.test.ts
import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { createAuth, type Auth } from '../../src/auth/auth';
import { LogMagicLinkSender } from '../../src/auth/magic-link-sender';
import { LogOtpSender } from '../../src/auth/otp-sender';
import { registerAuthRoutes } from '../../src/auth/routes';
import { makeRequireSession } from '../../src/auth/require-session';
import { migrateTestDb, testPool, truncateAll } from '../helpers/db';
import { signInWithPhone } from '../helpers/session';

let pool: Pool;
let app: FastifyInstance;
let auth: Auth;
let otp: LogOtpSender;

beforeAll(async () => {
  migrateTestDb();
  pool = testPool();
  await truncateAll(pool);
  otp = new LogOtpSender(() => {});
  auth = createAuth({
    pool,
    otpSender: otp,
    magicLinkSender: new LogMagicLinkSender(() => {}),
    baseUrl: 'http://localhost:3000',
    secret: 'test-secret-at-least-32-characters-long',
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
  await pool.end();
});

describe('requireSession', () => {
  it('refuses a request with no session as a generic 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/protected' });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toEqual({ error: 'unauthenticated' });
  });

  it('refuses a forged bearer token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { authorization: 'Bearer forged-token-000000' },
    });
    expect(res.statusCode).toBe(401);
  });

  it('resolves the user for a real bearer session', async () => {
    const token = await signInWithPhone(app, otp, '+919000000004');
    const res = await app.inject({
      method: 'GET',
      url: '/protected',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().userId).toBeTruthy();
  });
});
```

- [ ] **Step 8: Run the requireSession tests**

Run (from `apps/server/`): `pnpm vitest run test/auth/require-session.test.ts`
Expected: PASS (3 tests — implementation already exists from Step 4; this step proves the guard from the outside).

- [ ] **Step 9: Register the auth routes in the app assembly**

In Plan 1's `apps/server/src/app.ts` (or its equivalent app builder), construct the auth instance from the process environment and register the routes where the other routes register:

```ts
// inside the app builder, alongside existing route registration
import { createAuth } from './auth/auth';
import { LogMagicLinkSender } from './auth/magic-link-sender';
import { LogOtpSender } from './auth/otp-sender';
import { registerAuthRoutes } from './auth/routes';

const auth = createAuth({
  pool, // the pg Pool the app already constructs
  otpSender: new LogOtpSender(), // production sender is a deployment concern (Open questions)
  magicLinkSender: new LogMagicLinkSender(),
  baseUrl: process.env.BETTER_AUTH_URL ?? 'http://localhost:3000',
  secret: process.env.BETTER_AUTH_SECRET ?? 'dev-only-secret-change-me',
});
registerAuthRoutes(app, auth);
```

Expose `auth` from the builder's return value (alongside whatever it already returns) so later tasks can build `makeRequireSession(auth)`.

- [ ] **Step 10: Run the whole server suite**

Run (from `apps/server/`): `pnpm vitest run`
Expected: PASS — all prior suites plus the 8 new auth tests.

- [ ] **Step 11: Commit**

```bash
git add apps/server/src/auth apps/server/src/app.ts apps/server/test/auth apps/server/test/helpers/session.ts
git commit -m "Sign-in works four ways with no passwords: phone OTP, magic link, Google, passkeys — cookie sessions for the web, bearer tokens for the apps, and one preHandler that resolves session to user for every protected route."
```

---

