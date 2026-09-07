import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { HSTS_HEADER_VALUE, hstsHeaderFor } from '../../src/http/hsts.js';
import { buildTestApp } from '../helpers/app.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';

/**
 * **`Strict-Transport-Security` — pre-launch checklist item 5, "force HTTPS".**
 *
 * The checklist asked whether forcing HTTPS is the app's job or the hosting
 * layer's. Measured against `deploy/do/app.yaml`, which is the only file that
 * knows the provider, the answer is *both, in different parts*:
 *
 * - the **HTTP→HTTPS redirect** is App Platform's router, before this process
 *   sees anything — an in-app redirect would be unreachable code;
 * - the **`Secure` cookie flag** is already correct, derived by better-auth
 *   from `BETTER_AUTH_URL`'s protocol and pinned by `sign-in-flows.test.ts`;
 * - **HSTS was genuinely absent**, and no layer was supplying it.
 *
 * That last one is what these cases cover. A redirect protects the request it
 * redirects; HSTS protects the NEXT one. Without it every fresh visit opens
 * with an interceptable cleartext request and the redirect arrives too late.
 */

describe('hstsHeaderFor — the RFC rule, as a function of one string', () => {
  it('13.242 answers the header for https and NOTHING for anything else', () => {
    expect(hstsHeaderFor('https')).toBe(HSTS_HEADER_VALUE);

    // RFC 6797 §7.2 is a MUST NOT: an HSTS host must not send the header over
    // non-secure transport. `null`, not a header a browser is obliged to
    // ignore — and emitting it in dev would train every developer's browser to
    // refuse `http://localhost`, an outage that survives uninstalling the app.
    expect(hstsHeaderFor('http')).toBeNull();
    expect(hstsHeaderFor(undefined)).toBeNull();
    // Not a prefix match, not a `.includes`: a scheme this function does not
    // know is not a scheme it trusts.
    expect(hstsHeaderFor('HTTPS')).toBeNull();
    expect(hstsHeaderFor('https:')).toBeNull();
  });

  it('13.243 carries a year and includeSubDomains, and does NOT carry preload', () => {
    expect(HSTS_HEADER_VALUE).toBe('max-age=31536000; includeSubDomains');
    // `preload` is a ONE-WAY DOOR — inclusion in a list compiled into browser
    // binaries, removal measured in months, and it implies the whole zone. That
    // is an owner's decision about a domain this product does not solely own.
    // Asserted as an ABSENCE so that adding it later is a deliberate act that
    // reddens a test, rather than a word somebody appends.
    expect(HSTS_HEADER_VALUE).not.toContain('preload');
  });
});

describe('the header on real responses from the real app', () => {
  let db: TestDatabase;
  let proxied: FastifyInstance;
  let direct: FastifyInstance;

  beforeAll(async () => {
    db = await createTestDatabase();
    // Two apps, differing ONLY in `trustProxy`. That option is read by the
    // Fastify CONSTRUCTOR, so it cannot be varied per request and no header
    // can substitute for it: without a second app there is no way to reach the
    // https branch at all, and a single-app test would silently only ever
    // measure the http one.
    // `webOrigin: null` and `rateLimit: null` are how a test says those two
    // controls are not its subject — the convention `SecurityOptions.webOrigin`'s
    // own docblock names, and what the rate-limit tests already do. Both fields
    // are required-but-nullable, so they cannot simply be omitted: the type
    // refuses, which is the point. (It refused this file first, in `typecheck`,
    // after both suites had gone green — the tests could not see it because
    // JavaScript does not check a shape it never reads.)
    proxied = buildTestApp(db, {
      security: { trustProxy: true, webOrigin: null, rateLimit: null },
    }).app;
    direct = buildTestApp(db).app;
    await proxied.ready();
    await direct.ready();
  });

  afterAll(async () => {
    await proxied.close();
    await direct.close();
    await db.drop();
  });

  it('13.244 sets it on an https request, including on the 401 an unauthenticated caller gets', async () => {
    const res = await proxied.inject({
      method: 'GET',
      url: '/v1/me/notifications',
      headers: { 'x-forwarded-proto': 'https' },
    });

    // The status is deliberately NOT the subject — what matters is that the
    // header rides on a refusal too. A browser's first contact with this host
    // is far more likely to be a 401 or a 404 than a 200, and a control that
    // only ships on success is one a first visit never sees.
    expect(res.statusCode).toBe(401);
    expect(res.headers['strict-transport-security']).toBe(HSTS_HEADER_VALUE);
  });

  it('13.245 sets it on a route that does not exist, because that is where a first visit often lands', async () => {
    const res = await proxied.inject({
      method: 'GET',
      url: '/no-such-route-at-all',
      headers: { 'x-forwarded-proto': 'https' },
    });
    expect(res.statusCode).toBe(404);
    expect(res.headers['strict-transport-security']).toBe(HSTS_HEADER_VALUE);
  });

  it('13.246 sends NOTHING over plain http, and nothing when the forwarded header is untrusted', async () => {
    // (a) genuine http through the proxied app.
    const plain = await proxied.inject({ method: 'GET', url: '/v1/me/notifications' });
    expect(plain.headers['strict-transport-security']).toBeUndefined();

    // (b) THE ONE THAT MATTERS: the same forged header against an app that does
    // NOT trust proxies. `trustProxy: false` is the default for every other
    // test and for local dev, and under it `x-forwarded-proto` is a string a
    // caller wrote. If this app answered with the header, then the control
    // would be caller-controlled — and a test that only ever built the proxied
    // app would report green while that was true.
    const forged = await direct.inject({
      method: 'GET',
      url: '/v1/me/notifications',
      headers: { 'x-forwarded-proto': 'https' },
    });
    expect(forged.headers['strict-transport-security']).toBeUndefined();
  });
});
