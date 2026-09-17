import { evaluateEvent } from '@gisik-nokma/rule-engine';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { createAuth, type Auth } from '../../src/auth/auth.js';
import { LogMagicLinkSender } from '../../src/auth/magic-link-sender.js';
import { LogOtpSender } from '../../src/auth/otp-sender.js';
import { registerAuthRoutes } from '../../src/auth/routes.js';
import { createObjectStoreFromEnv } from '../../src/attachments/store-config.js';
import { createIngestService } from '../../src/ingest/ingest-service.js';
import { buildProjectionRegistry } from '../../src/projections/index.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { submittedWorkspaceCreated } from '../helpers/events.js';
import { signInWithPhone } from '../helpers/session.js';

/**
 * Placeholders, not credentials, and there is no version of this test that uses
 * real ones: `/sign-in/social` builds a Google authorization URL locally and
 * makes no external call, so the client id only has to be present. It is set on
 * `process.env` because `createAuth` reads Google's pair from the environment by
 * design (Task 1: provider registration is not a collaborator) — and with the
 * pair absent better-auth answers 500 `CLIENT_ID_AND_SECRET_REQUIRED`, so
 * without these two lines the Google check below would be testing their absence.
 * Nothing depends on how far a `process.env` write reaches: a placeholder pair
 * leaves the provider configured-but-unusable, which is the same state an absent
 * pair leaves it in, so another file seeing these would behave identically.
 */
process.env['GOOGLE_CLIENT_ID'] = 'test-google-client-id.apps.googleusercontent.com';
process.env['GOOGLE_CLIENT_SECRET'] = 'test-google-client-secret';

/** Long enough that better-auth does not warn, and obviously not a credential. */
const TEST_SECRET = 'test-secret-not-used-anywhere-real';

const BASE_URL = 'http://localhost:3000';

let db: TestDatabase;
let app: FastifyInstance;
let otp: LogOtpSender;
let magic: LogMagicLinkSender;

/**
 * The real assembled server, not a bare Fastify with one route bolted on. That
 * is the point: `buildApp` registering the auth mount is a step of this task,
 * and a test that built its own Fastify would leave that registration as prose.
 * It also puts the auth scope and the product's `/v1/events` door in one
 * instance, which is the only way to see that the body parser one needs has not
 * eaten the other.
 */
function buildServer(baseUrl: string): {
  app: FastifyInstance;
  otp: LogOtpSender;
  magic: LogMagicLinkSender;
} {
  const otpSender = new LogOtpSender(() => {});
  const magicLinkSender = new LogMagicLinkSender(() => {});
  const auth = createAuth({
    pool: db.pool,
    otpSender,
    magicLinkSender,
    baseUrl,
    secret: TEST_SECRET,
    // The browser's origin, so better-auth trusts the product's own client.
    webOrigin: 'http://localhost:3001',
  });
  const ingest = createIngestService({
    pool: db.pool,
    evaluate: evaluateEvent,
    projections: buildProjectionRegistry(),
  });
  return { app: buildApp({
    db: db.pool,
    pool: db.pool,
    ingest,
    auth,
    serverAppend: (events) => ingest.ingestBatch(events),
    webOrigin: 'http://localhost:3001',
    // Required on `AppDeps`, and free here: a `LocalDiskStore` constructor
    // touches no filesystem, and nothing in this file uploads anything.
    store: createObjectStoreFromEnv({}),
  }), otp: otpSender, magic: magicLinkSender };
}

/** `set-cookie` arrives as a string when there is one and an array when there are several. */
function setCookies(headers: Record<string, unknown>): string[] {
  const raw = headers['set-cookie'];
  if (raw === undefined) return [];
  return Array.isArray(raw) ? (raw as string[]) : [String(raw)];
}

/** The `Cookie` request header a browser would send back, from a `Set-Cookie` response. */
function cookieHeaderFrom(headers: Record<string, unknown>): string {
  return setCookies(headers)
    .map((cookie) => cookie.split(';')[0])
    .join('; ');
}

beforeAll(async () => {
  db = await createTestDatabase();
  const built = buildServer(BASE_URL);
  app = built.app;
  otp = built.otp;
  magic = built.magic;
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await db.drop();
});

describe('phone OTP sign-in', () => {
  it('delivers a code through OtpSender and verifying it opens a session', async () => {
    const phone = '+919000000001';
    const send = await app.inject({
      method: 'POST',
      url: '/api/auth/phone-number/send-otp',
      payload: { phoneNumber: phone },
    });
    expect(send.statusCode).toBe(200);
    expect(otp.sent).toHaveLength(1);
    expect(otp.sent[0]?.phoneE164).toBe(phone);

    const verify = await app.inject({
      method: 'POST',
      url: '/api/auth/phone-number/verify',
      payload: { phoneNumber: phone, code: otp.sent[0]?.code },
    });
    expect(verify.statusCode).toBe(200);
    expect(verify.json().user.phoneNumber).toBe(phone);
    expect(verify.json().user.phoneNumberVerified).toBe(true);
  });

  /**
   * The exact cookie, because two other plans hardcode it.
   *
   * Plan 6's client reads the session cookie and Plan 10's sync sends it, and
   * until this ran both had only plan text to go on. The name is
   * `better-auth.session_token` and the attribute list is pinned in full —
   * including, deliberately, the ABSENCE of `Secure`, which is correct over
   * plain http and is the thing a reader most wants confirmed. The https half is
   * the next test; the two together are the whole contract.
   *
   * ## `toEqual` over the WHOLE list is load-bearing. Do not relax it to `toContain`.
   *
   * Two properties ride on the exactness, and neither has any other guard:
   *
   * 1. **No `Domain`.** A `Domain=.example.test` on this cookie would send the
   *    session to EVERY subdomain of the zone — every preview deploy, every
   *    unrelated service, anything an attacker gets hosted there — and the
   *    browser would do it silently, on every request, forever. better-auth
   *    emits one the moment `advanced.crossSubDomainCookies.enabled` is set
   *    (`createCookieGetter`, `better-auth/dist/cookies/index.mjs`), which is a
   *    one-line change somebody makes to share a session with a marketing site.
   *    Under `toEqual` that line turns this test red. Under `toContain` it
   *    would pass, because every attribute this test names would still be
   *    present — a `toContain` cannot see what was ADDED, and "what was added"
   *    is the entire question here.
   * 2. **`SameSite=Lax` is still Lax.** It is the whole cross-site defence of a
   *    cookie-authenticated `POST /v1/events` (`src/routes/events.ts` records
   *    that decision), and it is now SET rather than inherited
   *    (`advanced.defaultCookieAttributes` in `src/auth/auth.ts`). This
   *    assertion is what makes the setting checkable: mutate it to `'strict'`
   *    or `'none'` and this line names the change.
   *
   * The assertion was already exact before Task 5 — but by accident of how it
   * happened to be written, with nothing saying what the exactness was for. A
   * property that holds by accident holds until someone tidies it. This comment
   * is the difference.
   */
  /**
   * 6.18 — the session-cookie half of the row: the cookie is HttpOnly (and SameSite=Lax, not Secure over http). The row’s other two paths are proven separately rather than inferred from this one — sign-out invalidating a bearer token, and a pre-set cookie never becoming a session — in `require-session.test.ts` and `routes/security.test.ts`.
   */
  it('the session cookie is better-auth.session_token, HttpOnly, SameSite=Lax, and not Secure over http', async () => {
    const phone = '+919000000002';
    const send = await app.inject({
      method: 'POST',
      url: '/api/auth/phone-number/send-otp',
      payload: { phoneNumber: phone },
    });
    expect(send.statusCode).toBe(200);
    const verify = await app.inject({
      method: 'POST',
      url: '/api/auth/phone-number/verify',
      payload: { phoneNumber: phone, code: otp.sent.at(-1)?.code },
    });

    const cookies = setCookies(verify.headers);
    expect(cookies).toHaveLength(1);
    const [nameAndValue, ...attributes] = (cookies[0] ?? '').split('; ');
    expect(nameAndValue?.split('=')[0]).toBe('better-auth.session_token');
    expect(attributes).toEqual(['Max-Age=604800', 'Path=/', 'HttpOnly', 'SameSite=Lax']);
  });

  /**
   * Over https the cookie is a DIFFERENT NAME, not the same name with a flag
   * added — `__Secure-` is a browser-enforced prefix, and any client matching on
   * the http name would silently find nothing in production. No TLS is involved:
   * the prefix follows from the configured baseURL, so a second auth instance
   * over the same database is the whole apparatus.
   */
  it('over https the cookie becomes __Secure-better-auth.session_token and gains Secure', async () => {
    const secure = buildServer('https://app.example.test');
    await secure.app.ready();
    try {
      const phone = '+919000000003';
      await secure.app.inject({
        method: 'POST',
        url: '/api/auth/phone-number/send-otp',
        payload: { phoneNumber: phone },
      });
      const verify = await secure.app.inject({
        method: 'POST',
        url: '/api/auth/phone-number/verify',
        payload: { phoneNumber: phone, code: secure.otp.sent.at(-1)?.code },
      });
      expect(verify.statusCode).toBe(200);

      const cookies = setCookies(verify.headers);
      expect(cookies).toHaveLength(1);
      const [nameAndValue, ...attributes] = (cookies[0] ?? '').split('; ');
      expect(nameAndValue?.split('=')[0]).toBe('__Secure-better-auth.session_token');
      expect(attributes).toEqual([
        'Max-Age=604800',
        'Path=/',
        'HttpOnly',
        'Secure',
        'SameSite=Lax',
      ]);
    } finally {
      await secure.app.close();
    }
  });
});

describe('bearer sessions for the apps', () => {
  /**
   * The other half of the pair Plans 6 and 10 code against: the header is
   * `set-auth-token`, and better-auth also names it in
   * `access-control-expose-headers` — which is what lets a browser client read
   * it at all cross-origin, and is therefore part of the contract rather than
   * decoration.
   */
  it('returns a token in set-auth-token that authenticates via the Authorization header', async () => {
    const phone = '+919000000004';
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
    const token = verify.headers['set-auth-token'];
    expect(typeof token).toBe('string');
    expect(token).not.toBe('');
    expect(verify.headers['access-control-expose-headers']).toBe('set-auth-token');

    const session = await app.inject({
      method: 'GET',
      url: '/api/auth/get-session',
      headers: { authorization: `Bearer ${String(token)}` },
    });
    expect(session.statusCode).toBe(200);
    expect(session.json().user.id).toBe(verify.json().user.id);
  });

  /**
   * The session object's shape, pinned by key rather than by value, because
   * `makeRequireSession` reads `session.user.id` off it and every later task
   * reads `request.currentUserId` off that. A better-auth upgrade that renamed
   * either half would otherwise surface as a `undefined` actorId in somebody's
   * ledger event.
   */
  it('the session object is {session, user} with the ULID at user.id', async () => {
    const { token, userId } = await signInWithPhone(app, otp, '+919000000005');
    const session = await app.inject({
      method: 'GET',
      url: '/api/auth/get-session',
      headers: { authorization: `Bearer ${token}` },
    });
    const body = session.json();
    expect(Object.keys(body).sort()).toEqual(['session', 'user']);
    expect(body.user.id).toBe(userId);
    expect(body.session.userId).toBe(userId);
    expect(Object.keys(body.session).sort()).toEqual([
      'createdAt',
      'expiresAt',
      'id',
      'ipAddress',
      'token',
      'updatedAt',
      'userAgent',
      'userId',
    ]);
  });
});

describe('email magic link sign-in', () => {
  it('delivers a link through MagicLinkSender and following it opens a session', async () => {
    const start = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/magic-link',
      payload: { email: 'kiro@example.test' },
    });
    expect(start.statusCode).toBe(200);
    expect(magic.sent).toHaveLength(1);
    expect(magic.sent[0]?.email).toBe('kiro@example.test');

    // The link better-auth built points at this server's configured baseURL —
    // proof the mount never let a request Host decide where a sign-in link goes.
    const url = new URL(magic.sent[0]?.url ?? '');
    expect(url.origin).toBe(BASE_URL);

    const follow = await app.inject({ method: 'GET', url: url.pathname + url.search });
    // Verification redirects to the callback and carries the session with it.
    expect(follow.statusCode).toBe(302);
    expect(setCookies(follow.headers)).toHaveLength(1);

    const token = follow.headers['set-auth-token'];
    const session = await app.inject({
      method: 'GET',
      url: '/api/auth/get-session',
      headers: { authorization: `Bearer ${String(token)}` },
    });
    expect(session.statusCode).toBe(200);
    expect(session.json().user.email).toBe('kiro@example.test');
  });
});

describe('google oauth wiring', () => {
  it('builds a Google authorization redirect from the configured baseURL (no external call)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/social',
      payload: { provider: 'google' },
    });
    expect(res.statusCode).toBe(200);
    const authorizeUrl = new URL(res.json().url);
    expect(authorizeUrl.origin).toBe('https://accounts.google.com');
    expect(authorizeUrl.searchParams.get('redirect_uri')).toBe(
      `${BASE_URL}/api/auth/callback/google`,
    );
  });
});

describe('passkey endpoints', () => {
  it('offers registration options to a signed-in user', async () => {
    const { token } = await signInWithPhone(app, otp, '+919000000006');
    const options = await app.inject({
      // GET, not POST: checked against the enumerated endpoint table rather than
      // guessed from the verb the action suggests.
      method: 'GET',
      url: '/api/auth/passkey/generate-register-options',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(options.statusCode).toBe(200);
    // The WebAuthn ceremony is the client's; what the server owes is a live
    // challenge bound to this relying party.
    expect(options.json().challenge).toBeTruthy();
    expect(options.json().rp).toEqual({ name: 'Gisik Nokma', id: 'localhost' });
  });

  /**
   * ACCOUNT/HELP-SCREENS PLAN, TASK 8 — the SERVER half of the two paths
   * `/account`'s Passkeys section drives, and the reason this block grew.
   *
   * `apps/web/src/account/account-clients.ts` reaches them as
   * `authClient.passkey.listUserPasskeys()` and
   * `authClient.passkey.deletePasskey({ id })`. Those member names are NOT
   * hand-declared by the client plugin — they are generated from the server
   * endpoint PATHS by better-auth's `PathToObject`/`CamelCase` machinery — and
   * the web suite mocks `auth-client.js` wholesale, so nothing over there can
   * witness that the paths below exist at all. These two cases are that
   * witness, from the other side: the client's member names are settled by
   * `typecheck`, the paths are settled here, and only the runtime URL the
   * generated member builds sits between them.
   */
  it('lists a signed-in user’s passkeys, and refuses an anonymous caller', async () => {
    const { token } = await signInWithPhone(app, otp, '+919000000106');
    const mine = await app.inject({
      // GET, matching the endpoint table in the installed package's
      // `dist/index-B7Y0IgKK.d.mts` — not guessed from the verb "list".
      method: 'GET',
      url: '/api/auth/passkey/list-user-passkeys',
      headers: { authorization: `Bearer ${token}` },
    });
    expect(mine.statusCode).toBe(200);
    // Honestly empty: this user has registered nothing, and an empty array is
    // the answer `createPasskeyClient().list()` maps to `[]`.
    expect(mine.json()).toEqual([]);

    /**
     * THE MEASURED FACT `apps/web/app/account/page.tsx`'s GATE RESTS ON.
     *
     * That page reads this path on mount only when `user !== null`, and its
     * docblock justifies the gate by saying an anonymous read "would buy a 401
     * with a unit of everyone's sign-in budget". That is a claim about this
     * endpoint's middleware, so it is measured here rather than asserted in
     * prose — if better-auth ever made this path public, the gate would be
     * costing a real feature nothing and the docblock would be lying.
     */
    const anonymous = await app.inject({
      method: 'GET',
      url: '/api/auth/passkey/list-user-passkeys',
    });
    expect(
      anonymous.statusCode,
      'an anonymous caller was NOT refused. `app/account/page.tsx` gates its mount-time read of ' +
        'this path on `user !== null` precisely because an anonymous read cannot succeed and ' +
        'still spends a unit of the shared `auth:` budget — re-read that docblock if this ' +
        'endpoint has become public.',
    ).toBe(401);
  });

  it('answers the delete path for a signed-in user, and refuses an anonymous one', async () => {
    const { token } = await signInWithPhone(app, otp, '+919000000107');
    const gone = await app.inject({
      // POST with `{ id }`, matching the endpoint's declared zod body.
      method: 'POST',
      url: '/api/auth/passkey/delete-passkey',
      headers: { authorization: `Bearer ${token}` },
      payload: { id: 'no-such-passkey' },
    });
    /**
     * BY BODY, NOT BY STATUS — and the first version of this assertion got it
     * wrong, which is worth keeping rather than quietly fixing.
     *
     * It read `expect(gone.statusCode).not.toBe(404)`, on the reasoning that a
     * mistyped path would 404 from Fastify's router. It went RED, and the
     * failure message printed the reason:
     * `{"message":"Passkey not found","code":"PASSKEY_NOT_FOUND"}` — **404 is
     * also better-auth's own answer for an id the caller does not own.** The
     * two are identical in status and opposite in meaning: one says the
     * feature is missing, the other says the feature ran and looked.
     *
     * So the discriminator is the BODY, which is the same discipline 13.273
     * uses in `test/http/security-middleware.test.ts` to tell two limiters
     * apart at one status. Fastify's router 404 carries
     * `{"error":"Not Found","message":"Route POST:/… not found"}` and no
     * `code`; better-auth's carries `PASSKEY_NOT_FOUND`. Only the second can
     * be produced by a handler that exists.
     */
    expect(
      gone.json(),
      `\`POST /api/auth/passkey/delete-passkey\` did not reach better-auth's handler. A Fastify ` +
        `router 404 and better-auth's PASSKEY_NOT_FOUND are both 404, so the body is the only ` +
        `thing that tells them apart. Body was: ${gone.body.slice(0, 200)}`,
    ).toMatchObject({ code: 'PASSKEY_NOT_FOUND' });

    const anonymous = await app.inject({
      method: 'POST',
      url: '/api/auth/passkey/delete-passkey',
      payload: { id: 'no-such-passkey' },
    });
    expect(anonymous.statusCode).toBe(401);
  });
});

describe('sign-in tells an unauthenticated caller nothing about who exists', () => {
  /**
   * The enumeration constraint, stated as the thing an attacker would try.
   *
   * Someone with a list of phone numbers wants to know which ones have accounts.
   * The answer they get for a wrong code must be identical either way, and this
   * asserts the bytes, not the status: a differing `code` field at the same 400
   * would be just as good an oracle.
   *
   * What this does NOT claim, because it is not true: better-auth distinguishes
   * `INVALID_OTP` (a code is pending, this is not it) from `OTP_NOT_FOUND` (no
   * code pending). That is a real difference a caller can observe — but it is a
   * fact about whether a code was recently REQUESTED, which the attacker
   * requested themselves, and it is the same answer for a number with an account
   * and a number without one. The user-existence oracle is the one that matters
   * and it is the one closed here.
   */
  it('a wrong code answers identically for a number with an account and one without', async () => {
    const registered = '+919000000007';
    await signInWithPhone(app, otp, registered); // this number now has a user
    const stranger = '+919000000008'; // this one never will

    await app.inject({
      method: 'POST',
      url: '/api/auth/phone-number/send-otp',
      payload: { phoneNumber: registered },
    });
    const knownAnswer = await app.inject({
      method: 'POST',
      url: '/api/auth/phone-number/verify',
      payload: { phoneNumber: registered, code: '000000' },
    });

    await app.inject({
      method: 'POST',
      url: '/api/auth/phone-number/send-otp',
      payload: { phoneNumber: stranger },
    });
    const strangerAnswer = await app.inject({
      method: 'POST',
      url: '/api/auth/phone-number/verify',
      payload: { phoneNumber: stranger, code: '000000' },
    });

    expect(knownAnswer.statusCode).toBe(400);
    expect(strangerAnswer.statusCode).toBe(knownAnswer.statusCode);
    expect(strangerAnswer.body).toBe(knownAnswer.body);
    expect(knownAnswer.body).toBe('{"message":"Invalid OTP","code":"INVALID_OTP"}');
  });

  it('a magic link request answers identically for a known and an unknown address', async () => {
    // `kiro@example.test` has an account by now — the magic link test above made
    // one. `nobody@example.test` never will.
    const known = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/magic-link',
      payload: { email: 'kiro@example.test' },
    });
    const unknown = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/magic-link',
      payload: { email: 'nobody@example.test' },
    });
    expect(known.statusCode).toBe(200);
    expect(unknown.statusCode).toBe(200);
    expect(unknown.body).toBe(known.body);
    expect(known.body).toBe('{"status":true}');
  });
});

/**
 * better-auth refuses any non-GET request that CARRIES A COOKIE unless it also
 * carries a trusted `Origin` (or `Referer`) — `validateOrigin` in
 * `api/middlewares/origin-check.mjs` gates on `headers.has("cookie")`. A browser
 * always sends both, so nothing about the product changes; a test using
 * `app.inject` sends neither unless told to, which is exactly how a later task
 * loses an afternoon. Pinned here as behaviour, with the vendor's own bodies,
 * because Plan 6's client and Plan 10's sync both have to live with it.
 */
describe('cross-site protection on cookie sessions', () => {
  async function signedInCookie(phone: string): Promise<string> {
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
    return cookieHeaderFrom(verify.headers);
  }

  it('refuses a cookie-carrying POST that sends no Origin', async () => {
    const cookie = await signedInCookie('+919000000009');
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-out',
      headers: { cookie },
      payload: {},
    });
    expect(res.statusCode).toBe(403);
    expect(res.body).toBe('{"message":"Missing or null Origin","code":"MISSING_OR_NULL_ORIGIN"}');
  });

  it('refuses a cookie-carrying POST from an untrusted Origin', async () => {
    const cookie = await signedInCookie('+919000000010');
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-out',
      headers: { cookie, origin: 'https://evil.example' },
      payload: {},
    });
    expect(res.statusCode).toBe(403);
    expect(res.body).toBe('{"message":"Invalid origin","code":"INVALID_ORIGIN"}');
  });

  it('accepts a cookie-carrying POST from the configured origin', async () => {
    const cookie = await signedInCookie('+919000000011');
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-out',
      headers: { cookie, origin: BASE_URL },
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe('{"success":true}');

    // The only request in this suite that emits more than one Set-Cookie, and
    // therefore the only one that can tell a correct implementation from a wrong
    // one. Everywhere else n = 1, where forwarding `getSetCookie()` and
    // flattening with `headers.get('set-cookie')` are indistinguishable — and the
    // flattened form is a comma-joined string a browser parses as ONE cookie, so
    // sign-out would clear `session_token` and leave `session_data` and
    // `dont_remember` alive. Proven by mutation: with `.get()` in place and this
    // assertion absent, the whole suite stays green.
    const cleared = setCookies(res.headers);
    expect(cleared).toHaveLength(3);
    expect(cleared.map((entry) => entry.split('=')[0])).toEqual([
      'better-auth.session_token',
      'better-auth.session_data',
      'better-auth.dont_remember',
    ]);
    for (const entry of cleared) expect(entry).toContain('Max-Age=0');
  });

  /**
   * The half of the rule that is NOT "cookie or nothing", and the half a browser
   * meets FIRST — before it has any cookie to send.
   *
   * `formCsrfMiddleware` is mounted per-endpoint (`api/routes/sign-in.mjs:245`,
   * `sign-up.mjs:26`, `plugins/magic-link/index.mjs:60`,
   * `plugins/email-otp/routes.mjs:77`; of those, `/sign-in/email`,
   * `/sign-up/email` and `/sign-in/magic-link` are registered here — the
   * email-otp plugin is not enabled). It calls `validateOrigin` with
   * `forceValidate`, so a COOKIELESS request carrying `Origin`, `Referer` or any
   * `Sec-Fetch-*` header is origin-checked anyway — while `send-otp` and
   * `sign-out`, which carry no such middleware, are not.
   */
  it('origin-checks a cookieless magic-link request, and does not for send-otp', async () => {
    const evil = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/magic-link',
      headers: { origin: 'https://evil.example' },
      payload: { email: 'csrf-a@example.test' },
    });
    expect(evil.statusCode).toBe(403);
    expect(evil.body).toBe('{"message":"Invalid origin","code":"INVALID_ORIGIN"}');

    const crossSite = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/magic-link',
      headers: { 'sec-fetch-site': 'cross-site', 'sec-fetch-mode': 'navigate' },
      payload: { email: 'csrf-b@example.test' },
    });
    expect(crossSite.statusCode).toBe(403);
    expect(crossSite.json().code).toBe('CROSS_SITE_NAVIGATION_LOGIN_BLOCKED');

    const trusted = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/magic-link',
      headers: { origin: BASE_URL },
      payload: { email: 'csrf-c@example.test' },
    });
    expect(trusted.statusCode).toBe(200);

    // No formCsrfMiddleware here: the same forged Origin passes.
    const otpFromEvil = await app.inject({
      method: 'POST',
      url: '/api/auth/phone-number/send-otp',
      headers: { origin: 'https://evil.example' },
      payload: { phoneNumber: '+919000000013' },
    });
    expect(otpFromEvil.statusCode).toBe(200);
  });

  /**
   * The exemption, and the reason `signInWithPhone` hands back a bearer token
   * rather than a cookie: a request with no cookie is not a cross-site request
   * a browser could be tricked into making, so it is not origin-checked. Later
   * tasks' route tests get to send one header.
   */
  it('a bearer-only POST needs no Origin at all', async () => {
    const { token } = await signInWithPhone(app, otp, '+919000000012');
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-out',
      headers: { authorization: `Bearer ${token}` },
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe('{"success":true}');
  });
});

describe('the catch-all mount', () => {
  /**
   * Whose answer a caller gets for a body Fastify would have opinions about.
   *
   * The mount registers a raw `'*'` parser, and the point of it is that
   * better-auth judges its own requests. Measured both ways: an empty body under
   * `content-type: application/json` is Fastify's 400 `FST_ERR_CTP_EMPTY_JSON_BODY`
   * without that parser and better-auth's 200 with it, and a form-encoded POST
   * is 415 either way but only with the parser is the 415 better-auth's own,
   * naming the types it allows.
   *
   * The bodyless POST is here for the opposite reason — it reaches the vendor
   * with or without the parser, so it is pinned as a fact and explicitly NOT as
   * evidence for the parser. A reader who assumed otherwise would be crediting
   * the wrong line.
   */
  it('lets better-auth judge the body, whatever shape it arrives in', async () => {
    const emptyJson = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-out',
      headers: { 'content-type': 'application/json' },
      body: '',
    });
    expect(emptyJson.statusCode).toBe(200);
    expect(emptyJson.body).toBe('{"success":true}');

    const formEncoded = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/magic-link',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'email=form%40example.test',
    });
    expect(formEncoded.statusCode).toBe(415);
    expect(formEncoded.json().code).toBe('UNSUPPORTED_MEDIA_TYPE');

    const bodyless = await app.inject({ method: 'POST', url: '/api/auth/sign-out' });
    expect(bodyless.statusCode).toBe(200);
    expect(bodyless.body).toBe('{"success":true}');

    const needsOne = await app.inject({ method: 'POST', url: '/api/auth/phone-number/send-otp' });
    expect(needsOne.statusCode).toBe(400);
    expect(needsOne.body).toBe(
      '{"message":"[body] Invalid input: expected object, received undefined","code":"VALIDATION_ERROR"}',
    );
  });

  it('forwards the vendor 404 for an unknown auth sub-path', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/auth/no-such-endpoint' });
    expect(res.statusCode).toBe(404);
  });

  /**
   * A KNOWN GAP, pinned so it is visible rather than discovered.
   *
   * The catch-all mounts GET and POST because those are the only methods any of
   * better-auth's 44 routed endpoints uses. A cross-origin browser, however,
   * preflights every `application/json` POST with OPTIONS — and that request
   * never reaches better-auth: Fastify answers 404 first, in Fastify's own
   * words. So adding the web origin to `trustedOrigins` when Task 14's
   * `WEB_ORIGIN` lands will NOT be enough on its own; the preflight has to be
   * answered too. This test turns red the moment somebody mounts CORS, so the
   * fix and this pin land together.
   */
  it('known gap: OPTIONS and HEAD are not mounted, so a CORS preflight 404s before better-auth', async () => {
    const preflight = await app.inject({
      method: 'OPTIONS',
      url: '/api/auth/get-session',
      headers: {
        origin: 'http://localhost:3001',
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type',
      },
    });
    expect(preflight.statusCode).toBe(404);
    expect(preflight.json()).toEqual({
      message: 'Route OPTIONS:/api/auth/get-session not found',
      error: 'Not Found',
      statusCode: 404,
    });

    const head = await app.inject({ method: 'HEAD', url: '/api/auth/get-session' });
    expect(head.statusCode).toBe(404);
  });

  /**
   * The mount refuses to improvise an origin. `createAuth` always sets `baseURL`,
   * which is exactly why the guard needs a check of its own: without one,
   * deleting it would be invisible until some future caller built an auth
   * instance the other way and silently inherited the request's Host header.
   */
  it('refuses at assembly to mount an auth instance with no baseURL', () => {
    const withoutBaseUrl = { options: {} } as unknown as Auth;
    expect(() => registerAuthRoutes(Fastify(), withoutBaseUrl)).toThrowError(
      'registerAuthRoutes: the auth instance has no baseURL. This mount will not fall back to the request Host header — pass baseUrl to createAuth.',
    );
  });

  /**
   * The encapsulation check, and the reason it belongs in this file: the raw
   * body parser the auth mount needs would, registered on the root instance,
   * silently turn `/v1/events` into a door that no longer validates anything.
   * Plan 1's `removeAdditional: false` promise is the sharpest thing to point
   * at — if the parser had leaked, this unknown key would arrive unparsed and
   * the refusal would never happen.
   */
  it('leaves the product door parsing JSON and refusing unknown keys', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/events',
      payload: { events: [submittedWorkspaceCreated()], nope: 1 },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({
      statusCode: 400,
      code: 'FST_ERR_VALIDATION',
      error: 'Bad Request',
      message: 'body must NOT have additional properties',
    });
  });
});
