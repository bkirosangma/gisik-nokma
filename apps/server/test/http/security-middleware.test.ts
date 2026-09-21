import { describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp, type SecurityOptions } from '../../src/app.js';
import { createObjectStoreFromEnv } from '../../src/attachments/store-config.js';
import { createAuth } from '../../src/auth/auth.js';
import { LogMagicLinkSender } from '../../src/auth/magic-link-sender.js';
import { LogOtpSender } from '../../src/auth/otp-sender.js';
import { createPool } from '../../src/db.js';
import { HTTP_ORIGIN_PROTECTED_ROUTES, MUTATING_METHODS } from '../../src/http/http-origin.js';
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
 * 13.117 — each of the eight protected routes: a FORGED HTTP-Origin on a cookie-carrying mutation is refused `403 { error: 'forbidden_origin' }`.
 * 13.118 — each of the eight: a cookie-carrying mutation with NO HTTP-Origin header at all is also refused — the rule REQUIRES the header, it does not merely validate one when present.
 * 13.119 — each of the eight: the correctly-configured `WEB_ORIGIN` is let through. (Throughout this block "origin" is the HTTP `Origin` HEADER — the CSRF control — not the event envelope's `origin` provenance field.)
 */
describe('HTTP-Origin check on cookie-authenticated product mutations', () => {
  /**
   * One case per protected route, so a failure NAMES ITS OWN SITE. Removing the
   * check from any single route reddens exactly the row for that route and
   * nothing else.
   */
  /**
   * The METHOD is a column because it stopped being always-POST. Until MCP plan
   * Task 12 every protected route was reached by POST, so the three loops below
   * hard-coded it — and that assumption is the same one that hid a hole in
   * `httpOriginRefused`, which returned early on `method !== 'POST'` and could
   * therefore not protect a PUT, a PATCH or a DELETE that had been added to the
   * set. A table that cannot express a non-POST route cannot catch that.
   */
  const PROTECTED: Array<[name: string, url: string, pattern: string, method: string]> = [
    ['POST /v1/events', '/v1/events', '/v1/events', 'POST'],
    ['POST /v1/sync', '/v1/sync', '/v1/sync', 'POST'],
    ['POST /v1/attachments', '/v1/attachments', '/v1/attachments', 'POST'],
    [
      'the invite MINT',
      '/v1/workspaces/01JQ0000000000000000000000/invites',
      '/v1/workspaces/:workspaceId/invites',
      'POST',
    ],
    ['POST /v1/workspaces', '/v1/workspaces', '/v1/workspaces', 'POST'],
    [
      'the ticket-type MIGRATION',
      '/v1/workspaces/01JQ0000000000000000000000/ticket-types/01JT0000000000000000000000/migrate',
      '/v1/workspaces/:workspaceId/ticket-types/:typeId/migrate',
      'POST',
    ],
    [
      'mark notification read',
      '/v1/me/notifications/01JN0000000000000000000000/read',
      '/v1/me/notifications/:id/read',
      'POST',
    ],
    // The BULK sibling, added 2026-09-19 with the route itself. It needs its OWN
    // row for a reason that is not book-keeping: the row above is
    // `/v1/me/notifications/:id/read` and the drift guard below compares strings
    // for set equality, so the bulk route is NOT covered by its neighbour's row
    // any more than it is covered by its neighbour's PROTECTION — which is the
    // exact hazard the task that added it was warned about. Note the request URL
    // and the route pattern are the SAME string here: this route has no
    // parameter for `:id` to absorb a stray segment into.
    ['the inbox BULK read/unread', '/v1/me/notifications/read', '/v1/me/notifications/read', 'POST'],
    // Added by MCP plan Task 3, and added HERE because the drift guard below
    // REQUIRED it: protecting the route without a row reddens 13.116, which is
    // precisely what that guard is for. A cookie-authenticated POST that mints
    // a credential, so it belongs to the same category as the invite MINT.
    ['the MCP device APPROVAL', '/v1/mcp/device/approve', '/v1/mcp/device/approve', 'POST'],
    // Added 2026-09-19 with the DENIAL route. It needs its OWN row rather than a
    // share of approve's, because the drift guard below compares the table and
    // `HTTP_ORIGIN_PROTECTED_ROUTES` for SET EQUALITY in both directions — so
    // protecting the route without a row here reddens 13.116, and a row without
    // the protection reddens it too. That guard is what this dispatch asked to
    // have settled, and this is the answer: the route COUNT is not pinned
    // anywhere, but the route SET is, exactly.
    ['the MCP device DENIAL', '/v1/mcp/device/deny', '/v1/mcp/device/deny', 'POST'],
    // MCP plan Task 12, and the FIRST non-POST row. It is what found
    // `httpOriginRefused`'s `method !== 'POST'` early return: the forged-Origin
    // DELETE sailed past the hook to `requireSession`, which answered 401 —
    // a refusal, for entirely the wrong reason, that reads as a pass.
    [
      'the MCP token REVOKE',
      `/v1/me/mcp-tokens/${'a'.repeat(64)}`,
      '/v1/me/mcp-tokens/:id',
      'DELETE',
    ],
    // E3-14 — three cookie-authenticatable mutations found by the same
    // measurement (injecting a forged-Origin request at every non-GET route)
    // that were unrecorded omissions from the set, distinct from the invite
    // TOKEN accept and `PUT /v1/me/preferences`, which stay excluded by a
    // recorded ruling (see the docblock above `HTTP_ORIGIN_PROTECTED_ROUTES`).
    [
      'notification preferences write',
      '/v1/me/notification-preferences',
      '/v1/me/notification-preferences',
      'PUT',
    ],
    [
      'accept a workspace invitation (by id, membership-granting)',
      '/v1/me/invitations/01JI0000000000000000000000/accept',
      '/v1/me/invitations/:inviteId/accept',
      'POST',
    ],
    [
      'decline a workspace invitation (by id)',
      '/v1/me/invitations/01JI0000000000000000000000/decline',
      '/v1/me/invitations/:inviteId/decline',
      'POST',
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
   * BOTH, under a docblock claiming the exclusions were enumerated.
   *
   * **This is ONE OF TWO layers (E3-15), and it alone is not "something
   * independent."** Both sides here are hand-maintained: this table, and the
   * production `Set`. A route missing from BOTH — the exact shape of E3-14's
   * defect — leaves them equal and this test green, which is what the docblock
   * above claimed could not happen. The instrument that actually cannot be
   * satisfied by an omission from both lists is `13.198` below, which measures
   * the ASSEMBLED APP rather than a second list. This test still earns its
   * keep: it is what guarantees every production-protected route gets a named,
   * per-route test row above rather than being covered only in aggregate.
   *
   * Set-equality in BOTH directions on purpose: a missing row means an
   * unprotected route with no test, and an extra row means a test asserting a
   * protection that no longer ships.
   */
  /**
   * 13.116 — the set-equality drift guard: every protected route has a row in this suite AND every row is a protected route in production. Neither direction alone would catch a route added without a row. (Does NOT catch a route missing from both — see 13.198.)
   */
  it('every protected route has a row in this suite, and every row is a protected route', () => {
    const inTable = new Set(PROTECTED.map(([, , pattern]) => pattern));
    expect([...inTable].sort()).toEqual([...HTTP_ORIGIN_PROTECTED_ROUTES].sort());
  });

  /**
   * 13.198 — E3-15 — the instrument the docblock above claims to be but is
   * not: something INDEPENDENT of the two hand-maintained lists, so a
   * mutating route omitted from BOTH of them still reddens.
   *
   * `buildApp`'s TEST-ONLY `options.onRoute` (`app.ts`, wired first, before a
   * single route is registered) is what makes this reliable rather than
   * `app.printRoutes()`: MEASURED, `printRoutes({ commonPrefix: false })`
   * silently DROPS `/api/auth/*` from its tree entirely (a `find-my-way`
   * internal node only prints under that option when `node.isLeafNode`, which
   * a wildcard registered inside a child `app.register(...)` scope is not) —
   * an instrument that can silently omit a route is the exact defect this
   * task exists to close, so it is not the one used here. A hook added by a
   * caller AFTER `buildApp()` returns has the OTHER failure: `onRoute` fires
   * at REGISTRATION time (`fastify@5.12.1`'s `lib/route.js`), and every
   * root-level route here registers synchronously inside `buildApp()`, before
   * such a caller could ever attach anything — MEASURED, catching only the 2
   * of ~20 routes declared inside a child `register()` scope, which is
   * deferred to the `ready()` boot sequence. Wiring the hook INSIDE
   * `buildApp`, first, sees everything either approach alone misses.
   */
  it('every mutating route the real app serves is protected or explicitly, reasonedly excluded — a route missing from every hand-maintained list still reddens', async () => {
    const seen: Array<{ method: string; url: string }> = [];
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
          webOrigin: 'http://localhost:3001',
        }),
        serverAppend: async () => [],
        webOrigin: WEB_ORIGIN,
        store: createObjectStoreFromEnv({}),
      },
      {
        security: HTTP_ORIGIN_ON,
        onRoute: (routeOptions) => {
          const methods = Array.isArray(routeOptions.method) ? routeOptions.method : [routeOptions.method];
          for (const method of methods) seen.push({ method, url: routeOptions.url });
        },
      },
    );
    await app.ready();
    await app.close();

    // The seam's own control: it must have seen BOTH a root-level route
    // (`/v1/events`, registered synchronously) and a child-`register()` route
    // (`/v1/attachments`) — otherwise this test would pass vacuously by
    // observing nothing, the same way a `printRoutes` drop would.
    expect(seen).toContainEqual({ method: 'POST', url: '/v1/events' });
    expect(seen).toContainEqual({ method: 'POST', url: '/v1/attachments' });

    const realMutatingPaths = new Set(
      seen.filter((route) => MUTATING_METHODS.has(route.method)).map((route) => route.url),
    );

    /**
     * The public doors: every mutating route the real app serves that is
     * legitimately outside `HTTP_ORIGIN_PROTECTED_ROUTES`, each with its own
     * reason — the honest form the file's own docblock argues for (above
     * `HTTP_ORIGIN_PROTECTED_ROUTES`), extended here to the two the docblock
     * does not carry because they are not COOKIE-authenticatable at all.
     */
    const publicMutatingRoutesOutsideTheCheck: ReadonlySet<string> = new Set([
      // Recorded rulings — see `HTTP_ORIGIN_PROTECTED_ROUTES`'s own docblock.
      '/v1/me/preferences',
      '/v1/invites/:token/accept',
      // A READ wearing a POST: no `INSERT`/`UPDATE`/`DELETE` anywhere in
      // `reconcile-route.ts` (grepped) — it reports which presented ids are
      // now restricted and appends nothing (ruling P37). CSRF is about
      // causing a state change with an ambient credential; this route causes
      // none, the same reasoning that excludes `GET /v1/sync/bootstrap`.
      '/v1/sync/reconcile',
      // No `preHandler: requireSession` — no cookie session is ever read, so
      // there is no ambient credential to forge (`routes/mcp-device.ts`).
      '/v1/mcp/device/code',
      '/v1/mcp/device/token',
      // better-auth's OWN CSRF middleware, not this file's: `auth.ts` wires
      // `disableOriginCheck: false` and `trustedOrigins: [WEB_ORIGIN]`, which
      // is a DIFFERENT check (better-auth's `api/middlewares/origin-check.mjs`)
      // running INSIDE this route, not this hook running before it.
      '/api/auth/*',
    ]);

    const expected = new Set([...HTTP_ORIGIN_PROTECTED_ROUTES, ...publicMutatingRoutesOutsideTheCheck]);
    expect([...realMutatingPaths].sort()).toEqual([...expected].sort());
  });

  it.each(PROTECTED)(
    '%s: a cookie-carrying mutation with a FORGED HTTP-Origin is refused 403 forbidden_origin',
    async (_name, url, _pattern, method) => {
      const { app, recorder } = build(HTTP_ORIGIN_ON);
      const response = await app.inject({
        method: method as 'POST',
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
    async (_name, url, _pattern, method) => {
      const { app } = build(HTTP_ORIGIN_ON);
      const response = await app.inject({ method: method as 'POST', url, headers: COOKIE });
      await app.close();
      expect(response.statusCode).toBe(403);
      expect(response.json()).toEqual({ error: 'forbidden_origin' });
    },
  );

  it.each(PROTECTED)('%s: the configured WEB_ORIGIN is allowed through', async (_name, url, _pattern, method) => {
    const { app, recorder } = build(HTTP_ORIGIN_ON);
    await app.inject({ method: method as 'POST', url, headers: { ...COOKIE, origin: WEB_ORIGIN } });
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
      rateLimit: { authMax: 100, eventsMax: 100, inviteMax: 100, mcpMax: 100, signInMax: 100, windowSec: 60 },
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
    rateLimit: {
      authMax: 100,
      eventsMax: 100,
      inviteMax: 100,
      mcpMax: 100,
      // Deliberately EQUAL to `authMax` in the default, so that a case which
      // narrows one bucket is testing that bucket and nothing else. A helper
      // whose sign-in default were tighter than its auth default would make
      // every `authMax`-narrowing case ambiguous about which limiter answered.
      signInMax: 100,
      windowSec: 60,
      ...over,
    },
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

  /**
   * ═══════════════════════════════════════════════════════════════════════════
   * OUR LIMITER IS THE ONLY LIMITER THAT ANSWERS ON `/api/auth/*` — controller
   * ruling 2026-09-08, delegated by the owner.
   * ═══════════════════════════════════════════════════════════════════════════
   *
   * better-auth ships its own limiter, and on the real stack it could not tell
   * clients apart: `createRateLimitKey(ip ?? NO_TRUSTED_IP_KEY, path)`
   * (`dist/api/rate-limiter/index.mjs:245`) with `getIP()` falsy is one shared
   * bucket per path, for everybody. Measured there: a client on `127.0.0.1`
   * that had spent NOTHING was refused because a client on `192.168.65.1` had
   * spent. `auth.ts` now sets `rateLimit: { enabled: false }`.
   *
   * ⚠ WHAT THIS UNIT TEST CANNOT PROVE, SAID FIRST SO NOBODY READS IT AS MORE
   * THAN IT IS. It cannot reproduce the shared bucket, and the reason is exact:
   * `app.inject` clients are only distinguishable by `X-Forwarded-For`, and an
   * `X-Forwarded-For` is also enough for better-auth's `getIP()` to RESOLVE —
   * at which point better-auth separates clients too and the defect disappears
   * from the harness. **The property that makes two clients distinguishable
   * here is the same property whose absence causes the bug.** Measured, not
   * assumed: with the limiter re-enabled, a second client's first request came
   * back `500` (its own budget) rather than `429`.
   *
   * So the shared-bucket claim rests on the DEV-STACK measurement, recorded in
   * `docs/pre-launch-checklist.md`. What this case proves is the thing the
   * ruling actually changes and that a unit test CAN witness: **better-auth's
   * limiter no longer answers at all.**
   *
   * WHY `authMax: 6` AND SEVEN REQUESTS. better-auth's magic-link rule is
   * `max: 5` per 60s (`plugins/magic-link/index.mjs:197-203`), which overrides
   * the generic `/sign-in*` 10s/3 rule (`:302-308`). Six lets a client spend
   * PAST better-auth's five, so the sixth request is precisely where
   * better-auth would refuse and ours would not — the one request that can tell
   * the two apart. The seventh is where ours refuses.
   *
   * MUTATION, RUN NOT REASONED: `rateLimit: { enabled: true }` in `auth.ts` and
   * the sixth request comes back `429 {"message":"Too many requests. Please try
   * again later."}` instead of passing — red, naming better-auth's own body.
   *
   * ⚠ THE MUTATION IS `enabled: true`, NOT "delete the line", and the first
   * version of this case got that wrong. better-auth's default is
   * `enabled: options.rateLimit?.enabled ?? isProduction`
   * (`dist/context/create-context.mjs:171`), and vitest sets `NODE_ENV=test`,
   * so deleting our line leaves the limiter OFF and the mutation changes
   * nothing. That NODE_ENV-dependent default is also why no server test ever
   * exercised this and why it shipped unseen.
   */
  /**
   * 13.273 — better-auth's limiter does not answer on /api/auth/*: the sixth request, which is past better-auth's own max of 5 for the magic-link path, is NOT refused by it, and the refusal that does arrive at the seventh is OURS, identified by response BODY rather than status. Mutation: `rateLimit: { enabled: true }` in auth.ts turns the sixth into better-auth's 429.
   */
  it('better-auth does not answer on /api/auth/*, and the refusal that does is ours', async () => {
    const { app } = build({ ...limits({ authMax: 6 }), trustProxy: true });
    const send = (ip: string) =>
      app.inject({
        method: 'POST',
        url: '/api/auth/sign-in/magic-link',
        headers: { 'x-forwarded-for': ip },
        payload: { email: 'rate-limit-authority@example.test' },
      });

    const spent = [];
    for (let i = 0; i < 7; i += 1) spent.push(await send('203.0.113.1'));
    const past = spent[5]; // the 6th — past better-auth's max of 5
    const refused = spent[6]; // the 7th — past OUR authMax of 6
    const other = await send('203.0.113.2');
    await app.close();

    const BETTER_AUTH_429 = 'Too many requests. Please try again later.';

    expect(
      past?.body.includes(BETTER_AUTH_429),
      "the SIXTH request was refused by better-auth's own limiter. It is supposed to be disabled " +
        '(`rateLimit: { enabled: false }` in auth.ts) so that one limiter, ours, is the single ' +
        'authority on /api/auth/*. Two limiters with different keying on one path is the defect ' +
        `class this ruling closes. Body was: ${past?.body.slice(0, 120)}`,
    ).toBe(false);

    expect(
      refused?.statusCode,
      'our limiter did not refuse the seventh request, so nothing below distinguishes a working ' +
        'limiter from an absent one',
    ).toBe(429);
    expect(
      refused?.json(),
      'the 429 did not come from OUR limiter. A bare status cannot tell the two apart — which is ' +
        'exactly what made the shared-bucket defect invisible for so long.',
    ).toEqual({ error: 'rate_limited', retryAfterSeconds: 60 });

    expect(
      other.statusCode,
      'a second client, which had spent nothing, was refused. Under OUR limiter each address ' +
        'carries its own budget.',
    ).not.toBe(429);
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
      rateLimit: { authMax: 1, eventsMax: 100, inviteMax: 100, mcpMax: 100, signInMax: 100, windowSec: 60 },
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

// ── The sign-in bucket ───────────────────────────────────────────────────────

/**
 * The fifth bucket, and the first that classifies by PATH rather than by
 * Fastify route pattern.
 *
 * ## Why these cases cannot discriminate by response body, and what they use
 * instead
 *
 * #347's guard could name which limiter answered by reading the body, because
 * the two limiters were written by different authors: ours answers
 * `{"error":"rate_limited",…}` and better-auth's `{"message":"Too many
 * requests…"}`. Both buckets here are OURS and share that body byte for byte,
 * so a body assertion would pass whichever one refused and would prove nothing
 * about the new one.
 *
 * The discriminator is the ORDINAL, with its positive control built into the
 * same request pair: a sign-in path is refused at the sign-in bucket's ceiling
 * while a NON-sign-in path from the SAME client, in the SAME app, is still
 * being served. One assertion cannot be satisfied by "everything is limited"
 * and the other cannot be satisfied by "nothing is limited".
 */
describe('rate limiting — the sign-in bucket', () => {
  const limits = (over: Partial<SecurityOptions['rateLimit'] & object> = {}): SecurityOptions => ({
    webOrigin: null,
    rateLimit: { authMax: 100, eventsMax: 100, inviteMax: 100, mcpMax: 100, signInMax: 100, windowSec: 60, ...over },
  });

  /**
   * 13.275 — a sign-in path is bounded by its own, tighter budget, and the general auth budget is NOT what refused it.
   *
   * The load-bearing case. `authMax: 100` against `signInMax: 2` is a
   * STRUCTURAL separation, not a comment: were the two equal, the general
   * bucket would refuse at the same ordinal and this test would pass with the
   * sign-in bucket deleted — the shape of check that #347 shipped first and had
   * to rewrite.
   */
  it('refuses the third sign-in while the same client’s session reads are still served', async () => {
    const { app } = build(limits({ signInMax: 2, authMax: 100 }));
    const first = await app.inject({ method: 'GET', url: '/api/auth/sign-in/magic-link' });
    const second = await app.inject({ method: 'GET', url: '/api/auth/sign-in/magic-link' });
    const third = await app.inject({ method: 'GET', url: '/api/auth/sign-in/magic-link' });
    // The positive control, and the whole reason this is a finding rather than
    // "the app 429s": the SAME client, one request later, on a path outside the
    // sign-in family, is still being served out of a 100-request budget that
    // three sign-ins could not have exhausted.
    const sessionRead = await app.inject({ method: 'GET', url: '/api/auth/get-session' });
    await app.close();
    expect(first.statusCode).not.toBe(429);
    expect(second.statusCode).not.toBe(429);
    expect(third.statusCode).toBe(429);
    expect(third.json()).toEqual({ error: 'rate_limited', retryAfterSeconds: 60 });
    expect(sessionRead.statusCode).not.toBe(429);
  });

  /**
   * 13.276 — a sign-in request is charged to the general auth bucket AS WELL, not instead of it.
   *
   * This is the anti-LOOSENING guard, and it is the case that would go red if
   * someone "simplified" the hook by charging a matching path to the sign-in
   * bucket INSTEAD of the general one. That refactor reads like a tidy-up and
   * is a real weakening: one client would get `authMax + signInMax` requests
   * against the mount where it gets `authMax` today, reversing the third ground
   * of the ruling that authorised this bucket ("per attacker, ours is TIGHTER").
   *
   * `signInMax: 100` against `authMax: 2` is the previous case's separation
   * inverted, so the only bucket that can produce this 429 is the general one.
   */
  it('sign-in requests spend the general auth budget too — the bucket adds, it does not replace', async () => {
    const { app } = build(limits({ authMax: 2, signInMax: 100 }));
    await app.inject({ method: 'GET', url: '/api/auth/sign-in/magic-link' });
    await app.inject({ method: 'GET', url: '/api/auth/sign-in/magic-link' });
    const sessionRead = await app.inject({ method: 'GET', url: '/api/auth/get-session' });
    await app.close();
    expect(sessionRead.statusCode).toBe(429);
  });

  /**
   * 13.278 — a doubled-slash spelling of a sign-in path is charged to the sign-in bucket, at the wire.
   *
   * The unit table covers the matcher alone; this covers the seam it sits in,
   * because `app.ts` hands it `request.url` — the RAW request-target — and a
   * matcher that is right in isolation can still be wired to the wrong string.
   *
   * ## Why this asserts the DOUBLED SLASH and not the dot segment
   *
   * The dot segment is the more interesting spelling and it was this case's
   * first subject. It cannot be witnessed here, and the reason is structural
   * rather than a gap worth leaving open — MEASURED with a probe against this
   * same Fastify, `onRequest` recording `request.url` for both transports:
   *
   *     app.inject('/api/auth/x/../sign-in/magic-link')  → /api/auth/sign-in/magic-link
   *     real socket, same target                          → /api/auth/x/../sign-in/magic-link
   *
   * **`app.inject` resolves dot segments before any hook runs; a real socket
   * does not, and the raw target still routes to `/api/auth/*`.** So the
   * production hazard is real — the unresolved spelling genuinely reaches this
   * hook from the network — and the injection harness is blind to it by
   * construction. A case asserting it here PASSED with the matcher's URL
   * resolution deleted, which makes it a check that cannot fail for the reason
   * its name gives: the same shape #347 found in its first guard and deleted
   * rather than keep as a green tick meaning nothing.
   *
   * The dot segment is therefore witnessed by the unit row in 13.277, where the
   * string is handed to the matcher directly and no transport can launder it —
   * and the mutation that deletes the resolution kills exactly that row.
   *
   * The doubled slash is asserted INSTEAD because the probe shows `inject`
   * delivers it verbatim (`/api/auth//sign-in/magic-link`), so this case does
   * exercise the real seam with a real alternative spelling, and the mutation
   * that deletes the slash collapse kills it here as well as in the unit table.
   */
  /**
   * 13.280 — `retry-after` is a LOWER bound when the two buckets' windows opened at different instants, and the caller that obeys it exactly can still be refused.
   *
   * Found in review against a comment that asserted the opposite. It is pinned
   * as a case rather than left as prose for two reasons: the behaviour is
   * defensible (a hint that is too short costs a wasted round trip and admits
   * nothing that should be refused) but it is NOT obvious, and a later change
   * that widens `RateLimitVerdict` to carry each window's end can make this
   * exact assertion flip — which is what a pinned case is for.
   *
   * The mechanism: `auth:` refuses while `signin:` is still allowed but
   * filling, because a sign-in is charged to `signin:` even when `auth:` has
   * already refused it. So `signin:`'s window opens LATER than `auth:`'s and
   * outlives it.
   */
  it('tells the caller a wait shorter than the one it will actually serve, when the second bucket’s window opened later', async () => {
    let t = 1_000_000;
    const { app } = build({
      ...limits({ authMax: 10, signInMax: 5 }),
      now: () => t,
    });
    // Spend `auth:` on a path OUTSIDE the sign-in family, so `signin:` is
    // untouched and its window has not opened.
    for (let i = 0; i < 10; i += 1) {
      await app.inject({ method: 'GET', url: '/api/auth/get-session' });
    }
    // One second before `auth:` rolls over.
    t += 59_000;
    const told: number[] = [];
    for (let i = 0; i < 5; i += 1) {
      const refused = await app.inject({ method: 'GET', url: '/api/auth/sign-in/magic-link' });
      told.push(refused.json().retryAfterSeconds);
    }
    // Every one of those was refused by `auth:` — and charged to `signin:`
    // anyway, which opened `signin:`'s window HERE, 59 seconds after `auth:`'s.
    expect(told).toEqual([1, 1, 1, 1, 1]);
    // The caller obeys exactly.
    t += 1_000;
    const onTime = await app.inject({ method: 'GET', url: '/api/auth/sign-in/magic-link' });
    // `auth:` has reopened. `signin:` has not, and will not for another 59s.
    expect(onTime.statusCode).toBe(429);
    expect(onTime.json().retryAfterSeconds).toBe(59);
    await app.close();
  });

  it('charges a doubled-slash spelling of a sign-in path to the sign-in bucket', async () => {
    const { app } = build(limits({ signInMax: 1, authMax: 100 }));
    const direct = await app.inject({ method: 'GET', url: '/api/auth/sign-in/magic-link' });
    const viaDoubledSlash = await app.inject({ method: 'GET', url: '/api/auth//sign-in/magic-link' });
    await app.close();
    expect(direct.statusCode).not.toBe(429);
    expect(viaDoubledSlash.statusCode).toBe(429);
  });
});

// ── The passkey authentication probe, and the sign-in page's zero-cost rule ──

/**
 * ACCOUNT/HELP-SCREENS PLAN, TASK 8 — the server half of the constraint that
 * shapes `/sign-in`'s passkey button.
 *
 * ## The rule, stated as the thing that must stay true
 *
 * **An anonymous `/sign-in` page load must charge the shared `auth:` bucket
 * ZERO times**, even now that the page offers "Sign in with a passkey" again.
 *
 * ## Why that needs a SERVER test at all, when the button is obviously inert
 *
 * Because the danger is not the button; it is what a future edit would make
 * the button's call do on mount. `@better-auth/passkey@1.7.2`'s
 * `signInPasskey` issues `GET /passkey/generate-authenticate-options` as its
 * FIRST statement, before any capability check — read in the installed
 * `dist/client.mjs`, not taken from documentation. Under WebAuthn conditional
 * mediation (`{ autoFill: true }`) that request fires on page load, for every
 * visitor, signed in or not.
 *
 * Until now that cost lived only in a review comment and in two prose
 * docblocks. These cases MEASURE it, so the reason the button is click-only is
 * a fact in the suite rather than an argument in a paragraph — and so the day
 * somebody switches conditional mediation on, they meet the number rather than
 * the opinion.
 *
 * ## What each half does, and why neither alone is enough
 *
 * The CLIENT half — "the page does not call it until a click" — is
 * `apps/web/test/sign-in.test.tsx`'s 13.326, and it is the only place that
 * property can be witnessed: that file mocks `../src/auth-client.js` wholesale,
 * so it cannot see a request, while this file cannot see a React page. The two
 * together are the whole argument: this file proves the probe is EXPENSIVE, and
 * 13.326 proves the page does not make it.
 *
 * An honest limit on what is proven here: `app.inject` is a direct injection,
 * so these cases pin the COST of the path, never that a browser sitting on
 * `/sign-in` refrains from requesting it. The end-to-end witness for that is
 * `apps/web/e2e-stack/passkey-registration.spec.ts`, which needs a real stack.
 */
describe('rate limiting — the passkey probe, and /sign-in’s zero-cost rule', () => {
  const limits = (over: Partial<SecurityOptions['rateLimit'] & object> = {}): SecurityOptions => ({
    webOrigin: null,
    rateLimit: { authMax: 100, eventsMax: 100, inviteMax: 100, mcpMax: 100, signInMax: 100, windowSec: 60, ...over },
  });

  /** The one path `signIn.passkey(...)` reaches before anything else. */
  const PROBE = '/api/auth/passkey/generate-authenticate-options';
  const MAGIC_LINK = '/api/auth/sign-in/magic-link';
  const OUR_REFUSAL = { error: 'rate_limited', retryAfterSeconds: 60 };

  /**
   * THE INCIDENT, RE-WITNESSED — ten probes exhaust production's real budget
   * and the eleventh caller's genuine magic link is refused.
   *
   * `authMax: 10` is not an arbitrary test number: it is `RATE_LIMIT_AUTH_MAX`
   * in `deploy/do/app.yaml`, and `http/rate-limit.ts` records as MEASURED that
   * a web container proxies every browser into one client key — so these ten
   * probes are ten anonymous page loads by ten DIFFERENT people, and the
   * eleventh request is an eleventh person trying to sign in.
   *
   * The refusal is identified by BODY, following 13.273's discipline: a bare
   * 429 cannot say which limiter answered, and this path is one where
   * better-auth's own limiter would also have had an opinion.
   */
  it('ten passkey probes exhaust the production auth budget and refuse a real magic link', async () => {
    const { app } = build(limits({ authMax: 10 }));
    for (let i = 0; i < 10; i += 1) {
      await app.inject({ method: 'GET', url: PROBE });
    }
    const eleventh = await app.inject({
      method: 'POST',
      url: MAGIC_LINK,
      payload: { email: 'someone-else@example.test' },
    });
    await app.close();

    expect(
      eleventh.statusCode,
      'ten passkey probes did NOT exhaust the auth budget. If this is now free, the whole reason ' +
        "`app/sign-in/page.tsx`'s passkey button fires only on a click has evaporated — re-read " +
        'that docblock before relaxing it, because the cheaper answer here may instead mean the ' +
        'probe stopped being charged at all.',
    ).toBe(429);
    expect(
      eleventh.json(),
      'the 429 did not come from OUR limiter. A bare status cannot tell ours from better-auth’s.',
    ).toEqual(OUR_REFUSAL);
  });

  /**
   * THE CONTROL, through the IDENTICAL pipeline — and it is the half that makes
   * the case above mean anything.
   *
   * Same app construction, same `authMax: 10`, same final request, ZERO probes.
   * Without it, "the eleventh request was refused" is equally satisfied by a
   * magic-link path that is refused unconditionally — by an offline database,
   * by a misconfigured limiter, by better-auth. The control runs the same code
   * path and must NOT be refused, so the difference between the two is
   * attributable to the probes and to nothing else.
   *
   * `not.toBe(429)` rather than `toBe(200)`: this suite runs against an offline
   * pool on purpose (see the file docblock), so the honest answer here is a 500
   * from the database, and asserting a success would pin a fact about the DB
   * rather than about the limiter.
   */
  it('the same magic link, with NO probes spent, is not refused — the control', async () => {
    const { app } = build(limits({ authMax: 10 }));
    const alone = await app.inject({
      method: 'POST',
      url: MAGIC_LINK,
      payload: { email: 'someone-else@example.test' },
    });
    await app.close();
    expect(
      alone.statusCode,
      'the magic-link path is refused even with nothing spent, so the case above proves nothing ' +
        'about the probes.',
    ).not.toBe(429);
  });

  /**
   * WHICH BUCKET THE PROBE CHARGES — the discriminating case.
   *
   * `/passkey/*` is deliberately absent from `SIGN_IN_PREFIXES`, so the probe
   * spends the general `auth:` budget and never the tighter `signin:` one. With
   * `authMax: 100` and `signInMax: 10`, ten probes cannot touch a budget they
   * are not charged to, and the magic link that follows must be served.
   *
   * This is what makes the first case's NAME honest. Were the probe charged to
   * `signin:` as well, "ten probes exhaust the auth budget" would be true for
   * the wrong reason, and the eleventh refusal could not be attributed to the
   * bucket the docblocks blame.
   */
  it('the probe charges the general auth bucket, never the tighter sign-in one', async () => {
    const { app } = build(limits({ authMax: 100, signInMax: 10 }));
    for (let i = 0; i < 10; i += 1) {
      await app.inject({ method: 'GET', url: PROBE });
    }
    const link = await app.inject({
      method: 'POST',
      url: MAGIC_LINK,
      payload: { email: 'someone-else@example.test' },
    });
    await app.close();
    expect(
      link.statusCode,
      'the passkey probe is now charged to the `signin:` bucket too. That is a TIGHTENING nobody ' +
        'authorised: it would let ten passkey attempts lock a client out of magic-link sign-in ' +
        'while the general budget still had 90 units left.',
    ).not.toBe(429);
  });

  /**
   * ONE PROBE LEAVES THE MAGIC LINK AVAILABLE — and the NAME of this case is a
   * correction, recorded because the first name was a claim the test could not
   * support.
   *
   * It was called *"a single deliberate click costs one unit"*, and its docblock
   * asserted that *"a design that made the button click-only but left each click
   * costing five would have satisfied every assertion above and still be
   * wrong."* **Both were false, and the second was false about this very
   * assertion.** With `authMax: 10`, one probe followed by a magic link that must
   * not be refused passes under ANY per-request cost from 0 to 9 — including the
   * five-unit design the docblock named as the thing it excluded. It measured
   * "one probe does not exhaust ten", which is nearly nothing, while its name
   * promised a per-unit cost.
   *
   * The real per-probe cost is pinned by the BOUNDARY PAIR below plus the
   * ten-probe case above, not by this one. This case is kept, narrowly, for the
   * one thing it does show: the ordinary single-click path leaves the person's
   * own magic-link fallback working.
   *
   * ## What a completed click ACTUALLY costs, which no case here can charge
   *
   * **At least TWO units, not one.** `signInPasskey` (`dist/client.mjs`) issues
   * `GET /passkey/generate-authenticate-options` FIRST — the probe these cases
   * inject — and then, after the browser ceremony resolves, a second
   * `POST /passkey/verify-authentication`. Both are under `/api/auth/*` and
   * both are absent from `SIGN_IN_PREFIXES`, so both are charged to `auth:`.
   * The second one cannot be reached by `app.inject` without a real
   * authenticator, which is why these cases inject the first only and why this
   * paragraph exists rather than a test. Registration is dearer still — see the
   * disclosure in `apps/web/app/account/page.tsx`'s docblock.
   */
  it('one probe leaves the magic link available', async () => {
    const { app } = build(limits({ authMax: 10 }));
    await app.inject({ method: 'GET', url: PROBE });
    const link = await app.inject({
      method: 'POST',
      url: MAGIC_LINK,
      payload: { email: 'someone-else@example.test' },
    });
    await app.close();
    expect(link.statusCode).not.toBe(429);
  });

  /**
   * THE BOUNDARY, AND THE ONLY CASE HERE THAT PINS A PER-PROBE COST.
   *
   * NINE probes, not ten, then the magic link — which is the TENTH request
   * against `authMax: 10` and must therefore be served. Read together with "ten
   * passkey probes exhaust the production auth budget" above, which sends the
   * ELEVENTH and must be refused, the pair brackets the limiter exactly:
   *
   *     9 probes + 1 magic link  = 10 requests → served
   *    10 probes + 1 magic link  = 11 requests → 429
   *
   * Only a charge of exactly ONE unit per probe satisfies both. At two units a
   * probe, nine probes would already have spent eighteen and this case would go
   * red; at zero, the ten-probe case above could never reach 429. **Neither case
   * alone can say that — each is satisfiable by a whole range of costs — which
   * is precisely the gap the mis-named case above left standing.**
   *
   * The off-by-one is the point, so it is spelled out rather than left to the
   * reader: `makeFixedWindowLimiter` refuses when `count > max`, so the tenth
   * request against a max of ten is the last one allowed.
   */
  it('nine probes leave exactly one unit, and the tenth request is still served', async () => {
    const { app } = build(limits({ authMax: 10 }));
    for (let i = 0; i < 9; i += 1) {
      await app.inject({ method: 'GET', url: PROBE });
    }
    const tenth = await app.inject({
      method: 'POST',
      url: MAGIC_LINK,
      payload: { email: 'someone-else@example.test' },
    });
    await app.close();
    expect(
      tenth.statusCode,
      'nine probes already exhausted a budget of ten, so a probe is costing MORE than one unit — ' +
        'or the magic-link path is being charged twice. Either way the sibling case that sends ten ' +
        'probes is no longer measuring what its name says.',
    ).not.toBe(429);
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
