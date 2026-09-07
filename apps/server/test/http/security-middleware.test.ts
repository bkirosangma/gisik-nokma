import { describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp, type SecurityOptions } from '../../src/app.js';
import { createObjectStoreFromEnv } from '../../src/attachments/store-config.js';
import { createAuth } from '../../src/auth/auth.js';
import { LogMagicLinkSender } from '../../src/auth/magic-link-sender.js';
import { LogOtpSender } from '../../src/auth/otp-sender.js';
import { createPool } from '../../src/db.js';
import { HTTP_ORIGIN_PROTECTED_ROUTES } from '../../src/http/http-origin.js';
import type { IngestService } from '../../src/ingest/ingest-service.js';

/**
 * Plan 11 Task 2 — CORS, the HTTP-`Origin` check, and the three rate-limit
 * buckets, at the assembled-app level.
 *
 * ## "HTTP-Origin" is said in full, everywhere in this file, on purpose
 *
 * Two unrelated things in this repository are called "origin": the browser
 * `Origin` REQUEST HEADER (CSRF — this file) and `EventEnvelope.origin`, the
 * provenance enum on every event. Someone who conflates them writes a header
 * check and believes the envelope forgery window is closed.
 *
 * ## Database-free, for the same reason `test/app.test.ts` is
 *
 * `createAuth` opens no connection, so an offline pool is enough: every request
 * here is refused (or recorded) by a hook that runs BEFORE `requireSession`
 * ever asks the database anything.
 *
 * ## How "this request was NOT refused" is asserted
 *
 * By a RECORDING `onRequest` hook added after `buildApp` returns. Fastify runs
 * `onRequest` hooks in registration order and stops the lifecycle the moment
 * one replies, so the recorder fires exactly when the security hooks let a
 * request through — a deterministic answer that does not depend on what
 * `requireSession` would then do with an offline database.
 */

const offlinePool = createPool('postgres://unused:unused@127.0.0.1:1/unused');

function fakeIngest(): IngestService {
  return {
    ingestBatch: async () => [],
    ingestClientBatch: async () => [],
    onEventCommitted: () => () => {},
  };
}

const WEB_ORIGIN = 'http://localhost:3001';
/** A cookie header of ANY name — presence is the whole ambient-credential test. */
const COOKIE = { cookie: 'better-auth.session_token=whatever' };

type Recorder = { passed: Array<{ method: string; routeUrl: string | undefined }> };

function build(security?: SecurityOptions): { app: FastifyInstance; recorder: Recorder } {
  const app = buildApp(
    {
      db: { query: async () => [{ ok: 1 }] },
      pool: offlinePool,
      ingest: fakeIngest(),
      auth: createAuth({
        pool: offlinePool,
        otpSender: new LogOtpSender(() => {}),
        magicLinkSender: new LogMagicLinkSender(() => {}),
        baseUrl: 'http://localhost:3000',
        secret: 'test-secret-not-used-anywhere-real',
        // The browser's origin, so better-auth trusts the product's own client.
        webOrigin: 'http://localhost:3001',
      }),
      serverAppend: async () => [],
      webOrigin: WEB_ORIGIN,
      store: createObjectStoreFromEnv({}),
    },
    security === undefined ? {} : { security },
  );
  const recorder: Recorder = { passed: [] };
  app.addHook('onRequest', async (request) => {
    recorder.passed.push({ method: request.method, routeUrl: request.routeOptions.url });
  });
  return { app, recorder };
}

/** A clock a test drives by hand, in milliseconds — the limiter's own contract. */
function fakeClock(): { now: () => number; advance: (ms: number) => void } {
  let t = 1_000_000;
  return {
    now: () => t,
    advance: (ms) => {
      t += ms;
    },
  };
}

const HTTP_ORIGIN_ON: SecurityOptions = { webOrigin: WEB_ORIGIN, rateLimit: null };

// ── The wiring, printed ──────────────────────────────────────────────────────

/**
 * The check that cannot be satisfied by a hook that fires NOWHERE.
 *
 * Two of the four HTTP-Origin-protected routes are declared inside an
 * `app.register(...)` child scope (`POST /v1/attachments`, and `/api/auth/*`
 * for the auth bucket), and this codebase has twice been surprised at that
 * boundary — `@fastify/websocket`'s `onRoute` hook arriving too late, and
 * `@fastify/multipart`'s content-type parser leaking to the root. So the
 * inheritance is MEASURED here rather than assumed, and the measurement is
 * PRINTED: a table of route patterns, not a count.
 *
 * It also pins the two facts every other test in this file rests on:
 * `routeOptions.url` is the route PATTERN (so the invite mint is
 * `'/v1/workspaces/:workspaceId/invites'`, colon and all), and it is
 * `undefined` for a request that matches no route.
 */
describe('root onRequest hooks reach every route (wiring)', () => {
  it('records the route pattern for each injected path, encapsulated routes included', async () => {
    const { app, recorder } = build();
    const paths: Array<[string, string]> = [
      ['POST', '/v1/events'],
      ['POST', '/v1/events?x=1'],
      ['POST', '/v1/attachments'],
      ['POST', '/v1/sync'],
      ['GET', '/v1/sync/bootstrap?workspaceId=W'],
      ['POST', '/v1/workspaces/01JQ0000000000000000000000/invites'],
      ['GET', '/api/auth/get-session'],
      ['GET', '/v1/stream'],
      ['POST', '/v1/nowhere'],
    ];
    for (const [method, url] of paths) {
      await app.inject({ method: method as 'GET', url });
    }
    await app.close();

    // Printed, not counted: a reader of a failure needs the strings.
    // eslint-disable-next-line no-console
    console.log(
      'route patterns seen by a ROOT onRequest hook:\n' +
        recorder.passed.map((p) => `  ${p.method} ${String(p.routeUrl)}`).join('\n'),
    );

    expect(recorder.passed).toEqual([
      { method: 'POST', routeUrl: '/v1/events' },
      // The query string does NOT reach `routeOptions.url` — this is the whole
      // reason the hooks key on it rather than on `request.raw.url`.
      { method: 'POST', routeUrl: '/v1/events' },
      // Declared inside `app.register(registerAttachmentRoutes, …)`.
      { method: 'POST', routeUrl: '/v1/attachments' },
      { method: 'POST', routeUrl: '/v1/sync' },
      { method: 'GET', routeUrl: '/v1/sync/bootstrap' },
      // The PATTERN, with the colon — never the resolved path.
      { method: 'POST', routeUrl: '/v1/workspaces/:workspaceId/invites' },
      // Declared inside `void app.register(async (scope) => …)`.
      { method: 'GET', routeUrl: '/api/auth/*' },
      { method: 'GET', routeUrl: '/v1/stream' },
      // No route matched: `undefined`, which every hook here treats as "not mine".
      { method: 'POST', routeUrl: undefined },
    ]);
  });
});

// ── HTTP-Origin: the CSRF ruling's item 2 ────────────────────────────────────

/**
 * 13.117 — each of the seven protected routes: a FORGED HTTP-Origin on a cookie-carrying mutation is refused `403 { error: 'forbidden_origin' }`.
 * 13.118 — each of the seven: a cookie-carrying mutation with NO HTTP-Origin header at all is also refused — the rule REQUIRES the header, it does not merely validate one when present.
 * 13.119 — each of the seven: the correctly-configured `WEB_ORIGIN` is let through. (Throughout this block "origin" is the HTTP `Origin` HEADER — the CSRF control — not the event envelope's `origin` provenance field.)
 */
describe('HTTP-Origin check on cookie-authenticated product mutations', () => {
  /**
   * One case per protected route, so a failure NAMES ITS OWN SITE. Removing the
   * check from any single route reddens exactly the row for that route and
   * nothing else.
   */
  const PROTECTED: Array<[name: string, url: string, pattern: string]> = [
    ['POST /v1/events', '/v1/events', '/v1/events'],
    ['POST /v1/sync', '/v1/sync', '/v1/sync'],
    ['POST /v1/attachments', '/v1/attachments', '/v1/attachments'],
    [
      'the invite MINT',
      '/v1/workspaces/01JQ0000000000000000000000/invites',
      '/v1/workspaces/:workspaceId/invites',
    ],
    ['POST /v1/workspaces', '/v1/workspaces', '/v1/workspaces'],
    [
      'the ticket-type MIGRATION',
      '/v1/workspaces/01JQ0000000000000000000000/ticket-types/01JT0000000000000000000000/migrate',
      '/v1/workspaces/:workspaceId/ticket-types/:typeId/migrate',
    ],
    [
      'mark notification read',
      '/v1/me/notifications/01JN0000000000000000000000/read',
      '/v1/me/notifications/:id/read',
    ],
  ];

  /**
   * The table above and the production set must not drift, and this is the
   * assertion that makes drift a RED TEST rather than a silent gap.
   *
   * It exists because that gap actually happened: the first cut of this suite
   * covered four routes while `HTTP_ORIGIN_PROTECTED_ROUTES` was believed
   * complete, and three cookie-authenticatable mutations — `POST /v1/workspaces`,
   * the ticket-type migration, and marking a notification read — were outside
   * BOTH, under a docblock claiming the exclusions were enumerated. Re-reading
   * a list you already believe is complete cannot find that; only comparing it
   * against something independent can. So the comparison is here, in code.
   *
   * Set-equality in BOTH directions on purpose: a missing row means an
   * unprotected route with no test, and an extra row means a test asserting a
   * protection that no longer ships.
   */
  /**
   * 13.116 — the set-equality drift guard: every protected route has a row in this suite AND every row is a protected route in production. Neither direction alone would catch a route added without a row.
   */
  it('every protected route has a row in this suite, and every row is a protected route', () => {
    const inTable = new Set(PROTECTED.map(([, , pattern]) => pattern));
    expect([...inTable].sort()).toEqual([...HTTP_ORIGIN_PROTECTED_ROUTES].sort());
  });

  it.each(PROTECTED)(
    '%s: a cookie-carrying mutation with a FORGED HTTP-Origin is refused 403 forbidden_origin',
    async (_name, url) => {
      const { app, recorder } = build(HTTP_ORIGIN_ON);
      const response = await app.inject({
        method: 'POST',
        url,
        headers: { ...COOKIE, origin: 'https://evil.example' },
      });
      await app.close();
      expect(response.statusCode).toBe(403);
      expect(response.json()).toEqual({ error: 'forbidden_origin' });
      // The refusal happened in the hook: nothing downstream ran.
      expect(recorder.passed).toEqual([]);
    },
  );

  it.each(PROTECTED)(
    '%s: a cookie-carrying mutation with NO HTTP-Origin at all is refused — require, not just validate',
    async (_name, url) => {
      const { app } = build(HTTP_ORIGIN_ON);
      const response = await app.inject({ method: 'POST', url, headers: COOKIE });
      await app.close();
      expect(response.statusCode).toBe(403);
      expect(response.json()).toEqual({ error: 'forbidden_origin' });
    },
  );

  it.each(PROTECTED)('%s: the configured WEB_ORIGIN is allowed through', async (_name, url) => {
    const { app, recorder } = build(HTTP_ORIGIN_ON);
    await app.inject({ method: 'POST', url, headers: { ...COOKIE, origin: WEB_ORIGIN } });
    await app.close();
    expect(recorder.passed).toHaveLength(1);
  });

  /**
   * THE QUERY-STRING BYPASS — the defect this project's own probe found.
   *
   * MEASURED on fastify 5.12.1 before any of this was written: with an
   * exact-match route set keyed on `request.raw.url`, `POST /v1/events`
   * answered 429 and `POST /v1/events?x=1` answered **200 with the handler
   * run**. `raw.url` carries the query string; `routeOptions.url` does not.
   * Switching either hook in `app.ts` back to `raw.url` reddens this and its
   * rate-limit twin below.
   */
  /**
   * 13.120 — a query string does not buy a CSRF bypass: `/v1/events?x=1` is refused identically to `/v1/events`, pinning `routeOptions.url` rather than the raw URL.
   */
  it('a query string does not buy a bypass — /v1/events?x=1 is refused exactly as /v1/events is', async () => {
    const { app } = build(HTTP_ORIGIN_ON);
    const bare = await app.inject({
      method: 'POST',
      url: '/v1/events',
      headers: { ...COOKIE, origin: 'https://evil.example' },
    });
    const queried = await app.inject({
      method: 'POST',
      url: '/v1/events?x=1',
      headers: { ...COOKIE, origin: 'https://evil.example' },
    });
    await app.close();
    expect(bare.statusCode).toBe(403);
    expect(queried.statusCode).toBe(403);
  });

  /**
   * The scoping the ruling turns on: *"Require and validate `Origin` on product
   * requests authenticated by cookie; require nothing of bearer-authenticated
   * requests."* A bearer token is not ambient — a browser never attaches one on
   * its own — so there is no forgery to prevent, and demanding a header would
   * break every non-browser client and every test in this repository.
   */
  it('a BEARER request with no cookie is untouched, with or without an HTTP-Origin', async () => {
    const { app, recorder } = build(HTTP_ORIGIN_ON);
    await app.inject({
      method: 'POST',
      url: '/v1/events',
      headers: { authorization: 'Bearer whatever' },
    });
    await app.inject({
      method: 'POST',
      url: '/v1/events',
      headers: { authorization: 'Bearer whatever', origin: 'https://evil.example' },
    });
    await app.close();
    expect(recorder.passed).toHaveLength(2);
  });

  it('`Origin: null` — a sandboxed iframe, some redirect chains — is refused', async () => {
    const { app } = build(HTTP_ORIGIN_ON);
    const response = await app.inject({
      method: 'POST',
      url: '/v1/events',
      headers: { ...COOKIE, origin: 'null' },
    });
    await app.close();
    expect(response.statusCode).toBe(403);
  });

  /**
   * `Referer` is deliberately NOT a fallback: it is suppressible by referrer
   * policy and by ordinary privacy settings, so accepting it would weaken the
   * match without admitting a caller `Origin` turns away.
   */
  it('a trusted Referer does not substitute for a missing HTTP-Origin', async () => {
    const { app } = build(HTTP_ORIGIN_ON);
    const response = await app.inject({
      method: 'POST',
      url: '/v1/events',
      headers: { ...COOKIE, referer: `${WEB_ORIGIN}/board` },
    });
    await app.close();
    expect(response.statusCode).toBe(403);
  });

  /**
   * A path on the header must not be normalised away. The comparison is an
   * exact string match against `new URL(WEB_ORIGIN).origin` — parsing the
   * HEADER with `new URL(...).origin` would make this 200.
   */
  it('an HTTP-Origin that merely PARSES to the right origin is still refused', async () => {
    const { app } = build(HTTP_ORIGIN_ON);
    const response = await app.inject({
      method: 'POST',
      url: '/v1/events',
      headers: { ...COOKIE, origin: `${WEB_ORIGIN}/evil` },
    });
    await app.close();
    expect(response.statusCode).toBe(403);
  });

  /**
   * `WEB_ORIGIN` is validated as an http(s) URL with a host, which admits a
   * trailing slash. A browser's `Origin` header never carries one, so the
   * configured value is normalised ONCE at assembly.
   */
  it('a WEB_ORIGIN written with a trailing slash still matches a browser HTTP-Origin', async () => {
    const { app, recorder } = build({ webOrigin: `${WEB_ORIGIN}/`, rateLimit: null });
    await app.inject({
      method: 'POST',
      url: '/v1/events',
      headers: { ...COOKIE, origin: WEB_ORIGIN },
    });
    await app.close();
    expect(recorder.passed).toHaveLength(1);
  });

  /**
   * GET routes are outside the check by definition — CSRF is about causing a
   * state change with an ambient credential. `GET /v1/sync/bootstrap` is the
   * largest read this server serves and is RATE-LIMITED instead, which is a
   * different control (below).
   */
  it('reads are not HTTP-Origin-checked — GET /v1/sync/bootstrap with a cookie and no Origin passes', async () => {
    const { app, recorder } = build(HTTP_ORIGIN_ON);
    await app.inject({ method: 'GET', url: '/v1/sync/bootstrap?workspaceId=W', headers: COOKIE });
    await app.close();
    expect(recorder.passed).toHaveLength(1);
  });

  /**
   * The COUPLING, pinned as a decision.
   *
   * `webOrigin: null` turns CORS *and* the HTTP-Origin check off together, and
   * there is no independent switch for the second. That is a hazard worth an
   * assertion rather than a comment: the HTTP-Origin check is the only CSRF
   * defence these routes have, so somebody switching CORS off would switch it
   * off too, and the request that then succeeds says nothing about it. This
   * test is what makes the coupling a thing someone chose — change the wiring
   * to decouple them and this goes red, which is the right place to have the
   * argument.
   */
  it('webOrigin: null disables the HTTP-Origin check as well as CORS — one fact, one switch', async () => {
    const { app, recorder } = build({
      webOrigin: null,
      rateLimit: { authMax: 100, eventsMax: 100, inviteMax: 100, mcpMax: 100, windowSec: 60 },
    });
    const response = await app.inject({
      method: 'POST',
      url: '/v1/events',
      headers: { ...COOKIE, origin: 'https://evil.example' },
    });
    await app.close();
    expect(response.statusCode).not.toBe(403);
    expect(recorder.passed).toHaveLength(1);
  });

  it('planted defect: with no security option nothing is HTTP-Origin-checked', async () => {
    const { app, recorder } = build();
    const response = await app.inject({
      method: 'POST',
      url: '/v1/events',
      headers: { ...COOKIE, origin: 'https://evil.example' },
    });
    await app.close();
    expect(response.statusCode).not.toBe(403);
    expect(recorder.passed).toHaveLength(1);
  });
});

// ── Rate limiting: three buckets ─────────────────────────────────────────────

describe('rate limiting', () => {
  const limits = (over: Partial<SecurityOptions['rateLimit'] & object> = {}): SecurityOptions => ({
    webOrigin: null,
    rateLimit: { authMax: 100, eventsMax: 100, inviteMax: 100, mcpMax: 100, windowSec: 60, ...over },
  });

  it('429s the request over the auth limit, names the refusal, sets retry-after', async () => {
    const { app } = build(limits({ authMax: 2 }));
    await app.inject({ method: 'GET', url: '/api/auth/anything' });
    await app.inject({ method: 'GET', url: '/api/auth/anything' });
    const third = await app.inject({ method: 'GET', url: '/api/auth/anything' });
    await app.close();
    expect(third.statusCode).toBe(429);
    expect(third.json()).toEqual({ error: 'rate_limited', retryAfterSeconds: 60 });
    expect(Number(third.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('limits POST /v1/events on its own budget', async () => {
    const { app } = build(limits({ eventsMax: 1 }));
    await app.inject({ method: 'POST', url: '/v1/events', payload: { events: [{}] } });
    const second = await app.inject({ method: 'POST', url: '/v1/events', payload: { events: [{}] } });
    await app.close();
    expect(second.statusCode).toBe(429);
  });

  it('POST /v1/sync shares the events budget', async () => {
    const { app } = build(limits({ eventsMax: 1 }));
    await app.inject({ method: 'POST', url: '/v1/events', payload: { events: [{}] } });
    const sync = await app.inject({ method: 'POST', url: '/v1/sync', payload: { events: [{}] } });
    await app.close();
    expect(sync.statusCode).toBe(429);
  });

  /**
   * DEVIATION from the plan's wire contract, and the reason it is one:
   * `GET /v1/sync/bootstrap` is the most expensive read this server serves —
   * one `REPEATABLE READ` transaction over a whole workspace's history. An
   * exact-match limiter on `POST /v1/sync` alone caps the cheap door beside it
   * and leaves the expensive one open.
   */
  it('GET /v1/sync/bootstrap is limited too, on the same events budget', async () => {
    const { app } = build(limits({ eventsMax: 1 }));
    const first = await app.inject({ method: 'GET', url: '/v1/sync/bootstrap?workspaceId=W' });
    const second = await app.inject({ method: 'GET', url: '/v1/sync/bootstrap?workspaceId=W' });
    await app.close();
    expect(first.statusCode).not.toBe(429);
    expect(second.statusCode).toBe(429);
  });

  /**
   * The SECOND inherited errand. `check-permission.ts` and test case 6.123 both
   * name Plan 11 as the owner of invite-issuance limiting, and neither of the
   * plan's two buckets covers this route — where **each request mints a
   * credential**.
   */
  it('the invite MINT has its own bucket', async () => {
    const url = '/v1/workspaces/01JQ0000000000000000000000/invites';
    const { app } = build(limits({ inviteMax: 1 }));
    const first = await app.inject({ method: 'POST', url, payload: {} });
    const second = await app.inject({ method: 'POST', url, payload: {} });
    await app.close();
    expect(first.statusCode).not.toBe(429);
    expect(second.statusCode).toBe(429);
  });

  it('the three buckets are independent — spending one does not spend another', async () => {
    const { app } = build(limits({ authMax: 1, eventsMax: 1, inviteMax: 1 }));
    // Spend the events budget entirely.
    await app.inject({ method: 'POST', url: '/v1/events', payload: { events: [{}] } });
    expect(
      (await app.inject({ method: 'POST', url: '/v1/events', payload: { events: [{}] } })).statusCode,
    ).toBe(429);
    // Auth and invite are untouched.
    expect((await app.inject({ method: 'GET', url: '/api/auth/anything' })).statusCode).not.toBe(429);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/v1/workspaces/01JQ0000000000000000000000/invites',
          payload: {},
        })
      ).statusCode,
    ).not.toBe(429);
    await app.close();
  });

  /** The rate-limit twin of the HTTP-Origin bypass test — same defect, same fix. */
  it('a query string does not buy a bypass — /v1/events?x=1 is charged to the same bucket', async () => {
    const { app } = build(limits({ eventsMax: 1 }));
    await app.inject({ method: 'POST', url: '/v1/events', payload: { events: [{}] } });
    const queried = await app.inject({
      method: 'POST',
      url: '/v1/events?x=1',
      payload: { events: [{}] },
    });
    await app.close();
    expect(queried.statusCode).toBe(429);
  });

  /**
   * The WINDOW REOPENS — asserted through the HTTP surface, with no sleep. The
   * seam is `security.now`, which exists for exactly this: a test that slept
   * out a real window would take a real minute, and one that shrank `windowSec`
   * would be asserting about a limiter no deployment runs.
   */
  it('the window reopens — proven by advancing an injected clock, not by sleeping', async () => {
    const clock = fakeClock();
    const { app } = build({ ...limits({ eventsMax: 1 }), now: clock.now });
    const first = await app.inject({ method: 'POST', url: '/v1/events', payload: { events: [{}] } });
    const refused = await app.inject({ method: 'POST', url: '/v1/events', payload: { events: [{}] } });
    clock.advance(60_000);
    const afterReset = await app.inject({
      method: 'POST',
      url: '/v1/events',
      payload: { events: [{}] },
    });
    await app.close();
    expect(first.statusCode).not.toBe(429);
    expect(refused.statusCode).toBe(429);
    expect(afterReset.statusCode).not.toBe(429);
  });

  /**
   * A CORS preflight is a browser asking permission, not an attempt. Charging
   * one against a ten-per-minute sign-in budget would let five genuine sign-ins
   * exhaust the window.
   */
  it('an OPTIONS preflight is not charged to the auth bucket', async () => {
    const { app } = build({
      webOrigin: WEB_ORIGIN,
      rateLimit: { authMax: 1, eventsMax: 100, inviteMax: 100, mcpMax: 100, windowSec: 60 },
    });
    await app.inject({
      method: 'OPTIONS',
      url: '/api/auth/sign-in',
      headers: { origin: WEB_ORIGIN, 'access-control-request-method': 'POST' },
    });
    await app.inject({
      method: 'OPTIONS',
      url: '/api/auth/sign-in',
      headers: { origin: WEB_ORIGIN, 'access-control-request-method': 'POST' },
    });
    const real = await app.inject({ method: 'GET', url: '/api/auth/anything' });
    await app.close();
    expect(real.statusCode).not.toBe(429);
  });

  /**
   * `/v1/stream` is a GET WebSocket UPGRADE, and this hook DOES fire on it
   * (measured, in the wiring test above). It is excluded by DECISION: a 429
   * sent to an upgrade does not reach the client as a readable body, it arrives
   * as an opaque failed upgrade — which a reconnecting client answers by
   * reconnecting. The control that bounds that route is
   * `requireConnectionBudget` in `stream/routes.ts`, which caps concurrent
   * sockets per USER and refuses with a body.
   */
  it('the WebSocket upgrade at /v1/stream is not rate-limited by this hook', async () => {
    const { app } = build(limits({ eventsMax: 1, authMax: 1, inviteMax: 1 }));
    const first = await app.inject({ method: 'GET', url: '/v1/stream' });
    const second = await app.inject({ method: 'GET', url: '/v1/stream' });
    await app.close();
    expect(first.statusCode).not.toBe(429);
    expect(second.statusCode).not.toBe(429);
  });

  /**
   * TRUST_PROXY is not decoration. Behind App Platform every request arrives
   * from the router, so with proxy trust OFF every client in the world shares
   * one bucket — the limiter becomes a shared outage. These two cases are the
   * same traffic and differ only in that flag.
   */
  it('with trustProxy ON, X-Forwarded-For gives each client its own bucket', async () => {
    const { app } = build({ ...limits({ eventsMax: 1 }), trustProxy: true });
    const a = await app.inject({
      method: 'POST',
      url: '/v1/events',
      headers: { 'x-forwarded-for': '203.0.113.1' },
      payload: { events: [{}] },
    });
    const b = await app.inject({
      method: 'POST',
      url: '/v1/events',
      headers: { 'x-forwarded-for': '203.0.113.2' },
      payload: { events: [{}] },
    });
    await app.close();
    expect(a.statusCode).not.toBe(429);
    expect(b.statusCode).not.toBe(429);
  });

  /**
   * 13.123 — `POST /v1/attachments` is charged to the SHARED events bucket rather than left unlimited: spending the attachments budget also refuses a subsequent event.
   */
  it('POST /v1/attachments is charged to the events bucket, not left unlimited', async () => {
    // It was in no bucket at all — the most byte-expensive write this server
    // takes, bounded by nothing. Charged to `events:` now, so spending that
    // budget on uploads must refuse the next upload AND the next event: one
    // bucket, one client, which is what sharing means.
    const { app } = build(limits({ eventsMax: 1 }));
    const first = await app.inject({
      method: 'POST', url: '/v1/attachments',
      headers: { 'content-type': 'multipart/form-data; boundary=x' }, payload: '--x--\r\n',
    });
    const second = await app.inject({
      method: 'POST', url: '/v1/attachments',
      headers: { 'content-type': 'multipart/form-data; boundary=x' }, payload: '--x--\r\n',
    });
    // And the SHARED half: the same spent budget refuses an event too.
    const event = await app.inject({ method: 'POST', url: '/v1/events', payload: { events: [{}] } });
    await app.close();
    expect(first.statusCode).not.toBe(429);
    expect(second.statusCode).toBe(429);
    expect(event.statusCode).toBe(429);
  });

  /**
   * THE CRITICAL THIS SUITE COULD NOT SEE, now pinned.
   *
   * The two cases above send a ONE-ENTRY `X-Forwarded-For`, and with one entry
   * every keying strategy agrees, so both passed against a limiter an attacker
   * could switch off. MEASURED against this repo's Fastify 5: with
   * `trustProxy: true`, `request.ip` is the LEFTMOST XFF entry — the one the
   * CALLER writes. Six requests from one caller varying only that entry, at
   * `eventsMax: 1`, were never limited (`401,401,401,401,401,401`) while the
   * unforged control was limited from the second (`401,429,429,…`).
   *
   * A proxy APPENDS its observation to the RIGHT, so the last entry is the one
   * the nearest trusted proxy wrote about the connection it actually accepted,
   * and it is the only entry a caller cannot choose. `rateLimitKeyFor` keys on
   * it. This test sends a chain whose LEFT half varies and whose RIGHT half is
   * constant — one client behind one proxy, lying — and requires that it be
   * limited exactly as an honest caller is.
   */
  /**
   * 13.121 — the regression pin: a caller-PREPENDED `X-Forwarded-For` entry does NOT buy a fresh rate-limit bucket.
   */
  it('a caller-prepended X-Forwarded-For entry does NOT buy a fresh bucket', async () => {
    const { app } = build({ ...limits({ eventsMax: 1 }), trustProxy: true });
    const statuses: number[] = [];
    for (let i = 0; i < 4; i += 1) {
      const r = await app.inject({
        method: 'POST',
        url: '/v1/events',
        headers: { 'x-forwarded-for': `10.0.0.${i}, 203.0.113.5` },
        payload: { events: [{}] },
      });
      statuses.push(r.statusCode);
    }
    await app.close();
    // The first is spent; every later one is refused, because all four key on
    // the constant rightmost entry rather than the varying leftmost one.
    expect(statuses[0]).not.toBe(429);
    expect(statuses.slice(1)).toEqual([429, 429, 429]);
  });

  /**
   * 13.122 — the inverse of 13.121, and required by it: two genuinely different clients behind the same proxy still get their own buckets, so the keying cannot be satisfied by ignoring the header entirely.
   */
  it('two genuinely different clients behind the same proxy still get their own buckets', async () => {
    // The inverse, so the fix above cannot be satisfied by keying on something
    // constant (the proxy's own address, say) and calling every client one.
    const { app } = build({ ...limits({ eventsMax: 1 }), trustProxy: true });
    const a = await app.inject({
      method: 'POST', url: '/v1/events',
      headers: { 'x-forwarded-for': '203.0.113.1' }, payload: { events: [{}] },
    });
    const b = await app.inject({
      method: 'POST', url: '/v1/events',
      headers: { 'x-forwarded-for': '203.0.113.2' }, payload: { events: [{}] },
    });
    await app.close();
    expect(a.statusCode).not.toBe(429);
    expect(b.statusCode).not.toBe(429);
  });

  it('with trustProxy OFF, the same two clients share one bucket — which is why the flag must be wired', async () => {
    const { app } = build(limits({ eventsMax: 1 }));
    await app.inject({
      method: 'POST',
      url: '/v1/events',
      headers: { 'x-forwarded-for': '203.0.113.1' },
      payload: { events: [{}] },
    });
    const b = await app.inject({
      method: 'POST',
      url: '/v1/events',
      headers: { 'x-forwarded-for': '203.0.113.2' },
      payload: { events: [{}] },
    });
    await app.close();
    expect(b.statusCode).toBe(429);
  });

  it('planted defect: without the security option nothing is limited (earlier suites stay green)', async () => {
    const { app } = build();
    for (let i = 0; i < 30; i += 1) {
      const response = await app.inject({ method: 'GET', url: '/healthz' });
      expect(response.statusCode).toBe(200);
    }
    for (let i = 0; i < 30; i += 1) {
      const response = await app.inject({ method: 'POST', url: '/v1/events', payload: { events: [{}] } });
      expect(response.statusCode).not.toBe(429);
    }
    await app.close();
  });
});

// ── CORS ─────────────────────────────────────────────────────────────────────

/**
 * CORS closes NOTHING that the HTTP-Origin check closes, and it fixes no live
 * breakage today: `apps/web`'s Next config rewrites `/v1/*` and `/api/auth/*`
 * to `SERVER_ORIGIN` server-side, so the shipped browser client only ever talks
 * to its own origin and issues no preflight. It ships for the callers the
 * product is built for — bearer-token mobile and desktop — and for any future
 * browser client served from `WEB_ORIGIN` directly.
 */
describe('CORS', () => {
  /**
   * 13.124 — CORS answers preflight for the configured origin with both the allow-origin and allow-credentials headers. The row’s other half — a foreign origin getting no allow header — is the test below.
   */
  it('answers preflight for the configured web origin', async () => {
    const { app } = build(HTTP_ORIGIN_ON);
    const response = await app.inject({
      method: 'OPTIONS',
      url: '/v1/events',
      headers: { origin: WEB_ORIGIN, 'access-control-request-method': 'POST' },
    });
    await app.close();
    expect(response.headers['access-control-allow-origin']).toBe(WEB_ORIGIN);
    expect(response.headers['access-control-allow-credentials']).toBe('true');
  });

  it('planted defect: a foreign origin gets no allow header', async () => {
    const { app } = build(HTTP_ORIGIN_ON);
    const response = await app.inject({
      method: 'OPTIONS',
      url: '/v1/events',
      headers: { origin: 'https://evil.example', 'access-control-request-method': 'POST' },
    });
    await app.close();
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  /**
   * The sentence a reader must not be able to believe: that CORS is the CSRF
   * control. A foreign origin gets no allow header from the preflight above AND
   * its actual POST is still refused by the HTTP-Origin check — because a
   * cross-site form submission or a `no-cors` fetch never asks for permission
   * in the first place.
   */
  it('CORS is not the CSRF control: a foreign origin is refused by the HTTP-Origin check as well', async () => {
    const { app } = build(HTTP_ORIGIN_ON);
    const response = await app.inject({
      method: 'POST',
      url: '/v1/events',
      headers: { ...COOKIE, origin: 'https://evil.example' },
    });
    await app.close();
    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({ error: 'forbidden_origin' });
  });
});
