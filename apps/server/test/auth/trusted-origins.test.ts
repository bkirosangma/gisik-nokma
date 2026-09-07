import { evaluateEvent } from '@gisik-nokma/rule-engine';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../../src/app.js';
import { createAuth } from '../../src/auth/auth.js';
import { LogMagicLinkSender } from '../../src/auth/magic-link-sender.js';
import { LogOtpSender } from '../../src/auth/otp-sender.js';
import { createObjectStoreFromEnv } from '../../src/attachments/store-config.js';
import { createIngestService } from '../../src/ingest/ingest-service.js';
import { buildProjectionRegistry } from '../../src/projections/index.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';

/**
 * `WEB_ORIGIN` is trusted by better-auth — the fix for a defect the whole auth
 * suite was green through.
 *
 * WHAT WENT WRONG, MEASURED IN THE SHIPPED COMPOSE STACK. A real browser at
 * `http://localhost:3001` submitting the shipped sign-in form got
 * `403 {"message":"Invalid origin","code":"INVALID_ORIGIN"}`, with the words
 * "Invalid origin" rendered on the page. `trustedOrigins` was left at
 * better-auth's default, which is the origin of `baseURL` — THIS SERVER's
 * origin. No browser ever sends that. The browser sends `WEB_ORIGIN`.
 *
 * WHY THE EXISTING SUITE COULD NOT SEE IT, and this is the part worth keeping:
 * `sign-in-flows.test.ts` asserts acceptance twice, and both times the accepted
 * origin is `BASE_URL` — the server's own. So it pinned "an origin equal to
 * baseUrl is trusted", which better-auth's default already guarantees and which
 * no client ever exercises. The refusals were pinned on the other side
 * (`https://evil.example` → 403) and the two together read as full coverage. A
 * bound asserted on only one side of its line.
 *
 * THE MUTATION THIS FILE IS BUILT TO KILL. Delete `trustedOrigins` from
 * `createAuth` and `accepts the WEB_ORIGIN a browser actually sends` reddens
 * ALONE — every other case here, and every case in `sign-in-flows.test.ts`,
 * stays green. That is the whole point: it is the only assertion in the suite
 * that distinguishes the default from the fix.
 */

const BASE_URL = 'http://localhost:3000';
const WEB_ORIGIN = 'http://localhost:3001';
const TEST_SECRET = 'test-secret-not-used-anywhere-real';

let db: TestDatabase;

function buildServer(webOrigin: string) {
  const otpSender = new LogOtpSender(() => {});
  const auth = createAuth({
    pool: db.pool,
    otpSender,
    magicLinkSender: new LogMagicLinkSender(() => {}),
    baseUrl: BASE_URL,
    secret: TEST_SECRET,
    webOrigin,
  });
  const ingest = createIngestService({
    pool: db.pool,
    evaluate: evaluateEvent,
    projections: buildProjectionRegistry(),
  });
  const app = buildApp({
    db: db.pool,
    pool: db.pool,
    ingest,
    auth,
    serverAppend: (events) => ingest.ingestBatch(events),
    webOrigin,
    store: createObjectStoreFromEnv({}),
  });
  return app;
}

beforeAll(async () => {
  db = await createTestDatabase();
});

afterAll(async () => {
  await db.drop();
});

describe('WEB_ORIGIN is a trusted origin', () => {
  /**
   * `/sign-in/magic-link` carries `formCsrfMiddleware`, so a COOKIELESS request
   * that presents an `Origin` is origin-checked with `forceValidate`
   * (`better-auth/dist/api/middlewares/origin-check.mjs:152` → `:96`). That is
   * what makes this reachable without first minting a session, and it is the
   * exact path the browser takes on its very first sign-in.
   */
  /**
   * 13.182 — POSTing to /sign-in/magic-link with the WEB_ORIGIN header a real browser sends is accepted (200); deleting trustedOrigins from createAuth reddens this case alone (4 pass / 1 fail, expected 403 to be 200), making it the one assertion in the suite that distinguishes the default from the fix.
   */
  it('accepts the WEB_ORIGIN a browser actually sends', async () => {
    const app = buildServer(WEB_ORIGIN);
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/magic-link',
      headers: { origin: WEB_ORIGIN },
      payload: { email: 'trusted-origin-a@example.test' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe('{"status":true}');
    await app.close();
  });

  /**
   * 13.183 — an origin in neither the default (baseUrl) nor WEB_ORIGIN (http://evil.test:9) is still refused 403 INVALID_ORIGIN after the trustedOrigins fix.
   */
  it('still refuses an origin that is in neither the default nor WEB_ORIGIN', async () => {
    const app = buildServer(WEB_ORIGIN);
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/magic-link',
      headers: { origin: 'http://evil.test:9' },
      payload: { email: 'trusted-origin-b@example.test' },
    });
    expect(res.statusCode).toBe(403);
    expect(res.body).toBe('{"message":"Invalid origin","code":"INVALID_ORIGIN"}');
    await app.close();
  });

  /**
   * ADDED, NOT SUBSTITUTED. `getTrustedOrigins`
   * (`better-auth/dist/context/helpers.mjs:74,77`) pushes the `baseURL` origin
   * and only then appends `options.trustedOrigins`. If the fix had replaced the
   * default instead of extending it, this case would 403.
   */
  /**
   * 13.184 — the baseUrl origin the better-auth default already trusts is STILL accepted (200) after WEB_ORIGIN is added, proving the fix appends to trustedOrigins rather than substituting for the default (getTrustedOrigins pushes baseURL's origin, then options.trustedOrigins).
   */
  it('keeps trusting the baseUrl origin the default provides', async () => {
    const app = buildServer(WEB_ORIGIN);
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/magic-link',
      headers: { origin: BASE_URL },
      payload: { email: 'trusted-origin-c@example.test' },
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  /**
   * The same-origin deployment — one host serving both — must be unaffected.
   * Here `WEB_ORIGIN` and `baseUrl` are the same string, so the list simply
   * holds it twice.
   */
  /**
   * 13.185 — a same-origin deployment (WEB_ORIGIN == baseUrl) still accepts BASE_URL (200) and does not become permissive: :3001/WEB_ORIGIN is refused 403 INVALID_ORIGIN by that deployment. Mutation: trusting every origin ('*') reddens this case AND 13.183, both being the suite's permissiveness bounds.
   */
  it('a same-origin deployment behaves exactly as before', async () => {
    const app = buildServer(BASE_URL);
    const accepted = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/magic-link',
      headers: { origin: BASE_URL },
      payload: { email: 'trusted-origin-d@example.test' },
    });
    expect(accepted.statusCode).toBe(200);

    // And it does NOT become permissive: 3001 is not trusted by this deployment.
    const refused = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/magic-link',
      headers: { origin: WEB_ORIGIN },
      payload: { email: 'trusted-origin-e@example.test' },
    });
    expect(refused.statusCode).toBe(403);
    expect(refused.json().code).toBe('INVALID_ORIGIN');
    await app.close();
  });

  /**
 * 13.188 — a `WEB_ORIGIN` written with a TRAILING SLASH is still trusted, normalised at assembly with the same `normalizeOrigin` every other consumer uses; un-normalised it would reinstate the exact 403 `INVALID_ORIGIN` this change removes, and would present as an auth-only regression because CORS and the HTTP-Origin check would both keep working.
 *
   * A trailing slash must not reinstate the very 403 this change removes.
   * `config.ts`'s `httpUrl()` admits `http://localhost:3001/`, and better-auth
   * matches http(s) patterns by EXACT equality
   * (`auth/trusted-origins.mjs`, `pattern === getOrigin(url)`), so an
   * un-normalised value would be trusted for a string no browser ever sends.
   * Every other consumer normalises; this one does too.
   */
  it('trusts WEB_ORIGIN written with a trailing slash', async () => {
    const app = buildServer(`${WEB_ORIGIN}/`);
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/magic-link',
      headers: { origin: WEB_ORIGIN },
      payload: { email: 'trusted-origin-g@example.test' },
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  /**
   * A wildcard is REFUSED AT ASSEMBLY rather than handed to better-auth.
   * `trusted-origins.mjs` branches to `wildcardMatch` for any pattern
   * containing `*` — this suite's own mutation proved that branch live, by
   * making both permissiveness bounds go green. `WEB_ORIGIN` is set by hand in
   * `deploy/do/app.yaml`, so nothing but this check stands between a typo and a
   * silently widened CSRF boundary.
   */
  /**
   * 13.189 — proves a WEB_ORIGIN containing a wildcard is refused at assembly, before it ever reaches better-auth's wildcardMatch branch.
   */
  it('refuses a wildcard WEB_ORIGIN instead of trusting it', () => {
    expect(() => buildServer('https://*.artsourced.in')).toThrowError(/wildcard/);
  });

  /**
   * THE INVERSION, RECORDED RATHER THAN CHANGED (ruling P42 item 3).
   *
   * A request that presents NO `Origin`, NO `Referer`, NO `Sec-Fetch-*` and NO
   * cookie is not origin-checked at all, and answers 200 — while the browser's
   * own origin was, before this fix, refused. Read from the outside that looks
   * inverted. It is deliberate library policy, and the source says so:
   *
   *   `validateFormCsrf` (origin-check.mjs:131) returns without validating when
   *   the request carries no cookie (`:137`), no `Sec-Fetch-*` (`:141`) and no
   *   `Origin`/`Referer` (`:152`); and `validateOrigin` (`:96`) itself gates on
   *   `const useCookies = headers.has("cookie")` (`:101`) with
   *   `if (!(forceValidate || useCookies)) return;` (`:108`).
   *
   * The rationale is CSRF's own definition: the attack needs an AMBIENT
   * CREDENTIAL the browser attaches automatically. A caller sending no cookie
   * and no browser provenance headers gains nothing from forgery — it could
   * make the same request directly. So the check is scoped to requests that
   * could be forged, which is why the docblock at `:43` calls it "CSRF
   * protection using Fetch Metadata headers" and `:44` names "progressive
   * enhancement" as the reason header-less callers are let through.
   *
   * Marked 🚫 in `test-cases/13`, not ❌: the behaviour is cited to the vendor's
   * own source, not inferred from the response codes.
   */
  it('does not origin-check a request with no cookie and no browser provenance', async () => {
    const app = buildServer(WEB_ORIGIN);
    const res = await app.inject({
      method: 'POST',
      url: '/api/auth/sign-in/magic-link',
      payload: { email: 'trusted-origin-f@example.test' },
    });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});
