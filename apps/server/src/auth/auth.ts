import { newUlid } from '@gisik-nokma/domain';
import { betterAuth } from 'better-auth';
import { bearer, magicLink, phoneNumber } from 'better-auth/plugins';
import { passkey } from '@better-auth/passkey';
import type { Pool } from 'pg';
import type { MagicLinkSender } from './magic-link-sender.js';
import type { OtpSender } from './otp-sender.js';
import { normalizeOrigin } from '../http/http-origin.js';
import {
  readSocialProviderEnv,
  socialProvidersFromEnv,
  type SocialProviderConfig,
  type SocialProviderName,
} from './social-providers.js';

/**
 * The web origin, as better-auth may safely be told it. Normalised the same way
 * every other consumer normalises it, and refused outright if it carries a `*`:
 * a wildcard here would widen the CSRF boundary silently, and a thrown
 * ConfigError at assembly is the loud alternative.
 */
function trustedWebOrigin(webOrigin: string): string {
  if (webOrigin.includes('*')) {
    throw new Error(
      `WEB_ORIGIN may not contain a wildcard (got ${webOrigin}): it is handed to better-auth as a ` +
        `trusted origin, and a wildcard pattern there widens the CSRF boundary to every matching host.`,
    );
  }
  return normalizeOrigin(webOrigin);
}

export interface AuthDeps {
  pool: Pool;
  otpSender: OtpSender;
  magicLinkSender: MagicLinkSender;
  baseUrl: string; // e.g. http://localhost:3000
  secret: string; // BETTER_AUTH_SECRET
  /**
   * `WEB_ORIGIN` — where the browser that talks to this server is served from.
   * Required, not optional: a server that does not know its web origin cannot
   * trust it, and the failure is a 403 on every sign-in rather than a warning.
   */
  webOrigin: string;
  /**
   * The social providers that are FULLY configured — a key only for a provider
   * with BOTH an id and a secret (`socialProvidersFromEnv`).
   *
   * OPTIONAL, and that is a deliberate departure from `webOrigin` beside it,
   * which Plan 11 made required across fifteen call sites. The argument there
   * was that a default would let a misconfiguration pass silently. It does not
   * apply here, because the drift this field exists to prevent is closed
   * somewhere else entirely: `GET /v1/auth/methods` reads
   * `auth.options.socialProviders` back off the CONSTRUCTED INSTANCE, not off
   * any caller's copy. Whatever ends up here — passed in, or the env default —
   * is what the page is told, unconditionally. Requiring it would have bought
   * ten test-file edits and no property.
   *
   * A test that wants a provider ON passes one; everything else gets the
   * environment, which is what every caller was doing inline before.
   */
  socialProviders?: Partial<Record<SocialProviderName, SocialProviderConfig>>;
}

/**
 * The identity boundary, in one function.
 *
 * better-auth owns `user`, `session`, `account`, `verification` and `passkey` —
 * server-owned infrastructure, never events. Auth state is not workspace
 * history: knowing who signed in from which device says nothing a workspace
 * needs to remember. *Membership* — who is inside which workspace with which
 * role — IS history and lives in the ledger as attributed events; Plan 4's
 * later tasks build that. Nothing here writes to `events`, and nothing in the
 * ledger writes here.
 *
 * Delivery is injected rather than configured: `sendOTP` and `sendMagicLink`
 * close over the `OtpSender`/`MagicLinkSender` the caller passed, so a test
 * reads the code it needs from a log implementation and production swaps the
 * transport without touching this wiring.
 *
 * Social providers are now THREADED THROUGH `AuthDeps`, and the paragraph that
 * used to sit here argued the opposite — that they were "provider registration,
 * not a collaborator this function's behaviour depends on", read straight from
 * `process.env`. That reasoning had a consequence it did not mention: nothing
 * outside this function could then tell which providers were live, so the
 * sign-in page guessed, and it guessed wrong on the dev stack. The sentence it
 * ended on — *"an absent pair leaves the provider configured-but-unusable"* —
 * described the defect accurately and treated it as acceptable. It is not: a
 * provider that is configured-but-unusable is a button that cannot work.
 */
export function createAuth(deps: AuthDeps) {
  const auth = betterAuth({
    database: deps.pool,
    baseURL: deps.baseUrl,
    secret: deps.secret,
    // NORMALISED, and REFUSED if it carries a wildcard. Two review findings,
    // both with a concrete failure:
    //
    //   * un-normalised, `WEB_ORIGIN=http://localhost:3001/` reinstates the
    //     exact 403 INVALID_ORIGIN this line exists to fix — better-auth
    //     matches http(s) patterns by EXACT equality
    //     (`auth/trusted-origins.mjs`, `pattern === getOrigin(url)`), while
    //     `config.ts`'s `httpUrl()` admits the trailing slash and every other
    //     consumer normalises (`app.ts` calls `normalizeOrigin`). CORS and the
    //     HTTP-Origin check would keep working, so it would present as an
    //     auth-only regression.
    //   * the comment below used to assert "never a wildcard" as a property
    //     nothing enforced. `httpUrl()` accepts `https://*.example.com`, and
    //     `trusted-origins.mjs` branches to `wildcardMatch` for any pattern
    //     containing `*` — demonstrated live by this fixture's own mutation,
    //     where `'*'` made both permissiveness bounds go green. `WEB_ORIGIN` is
    //     set by hand in `deploy/do/app.yaml`, so the path is reachable.
    trustedOrigins: [trustedWebOrigin(deps.webOrigin)],
    emailAndPassword: { enabled: false }, // the spec forbids passwords
    /**
     * ONE LIMITER ON `/api/auth/*`, AND IT IS OURS. Controller ruling
     * 2026-09-08, delegated by the owner.
     *
     * ═══════════════════════════════════════════════════════════════════════
     * WHAT WAS MEASURED, BECAUSE THIS IS NOT A PREFERENCE
     * ═══════════════════════════════════════════════════════════════════════
     *
     * better-auth's own limiter **cannot tell clients apart here**. Its key is
     * built as `createRateLimitKey(ip ?? NO_TRUSTED_IP_KEY, path)`
     * (`dist/api/rate-limiter/index.mjs:245`), `getIP()` returns falsy in this
     * runtime, and `NO_TRUSTED_IP_KEY` is the literal `"no-trusted-ip"`
     * (`:233`) — **one shared bucket per path, for everybody.**
     *
     * Measured on the dev stack with two clients on genuinely different
     * addresses, hitting the server DIRECTLY with no proxy in the path:
     * `192.168.65.1` spent 5 and was refused on its 6th; `127.0.0.1`, which had
     * spent nothing, was refused on its VERY FIRST request. So any one person
     * retrying sign-in could lock out every other user — a trivial
     * unauthenticated denial of service on the first screen a new user sees.
     *
     * The library says so itself, at `:241`, and nobody had read it: *"Rate
     * limiting could not determine a client IP and is falling back to a single
     * shared per-path bucket."* It is gated by `ipWarningLogged`, so it prints
     * **once per process**, into startup noise, and never again. *A
     * once-per-process warning is a finding with a half-life.*
     *
     * ═══════════════════════════════════════════════════════════════════════
     * WHY DISABLE RATHER THAN FIX ITS IP RESOLUTION
     * ═══════════════════════════════════════════════════════════════════════
     *
     * "Fix it" means `advanced.ipAddress.ipAddressHeaders` — reading a header
     * the CALLER writes. `app.ts` already records the measurement that six
     * requests varying `X-Forwarded-For` bought six buckets, which is exactly
     * why `rateLimitKeyFor` takes the RIGHTMOST entry and only under
     * `TRUST_PROXY`. Configuring better-auth to read XFF would put a second,
     * differently-trusted IP derivation on the same path — a spoofable bucket
     * beside a hardened one. **Two limiters with different keying on one path
     * IS the defect class**, and our coverage is a strict superset: `app.ts`
     * charges every non-`OPTIONS` method on `/api/auth/*` to the `auth:` bucket,
     * and better-auth is mounted at exactly that one pattern.
     *
     * This also makes `RATE_LIMIT_AUTH_MAX` the control everyone already
     * believed it was. It was never the binding constraint before.
     *
     * **THE NAMED LOSS, so nobody finds it by surprise:** better-auth's
     * per-path tightening goes away. `plugins/magic-link/index.mjs:197-203`
     * gives `/sign-in/magic-link` its own `window || 60` / `max || 5`, which
     * overrides the generic `/sign-in*` rule of 10s/3 (`:302-308`) — that
     * override is why the black-box measurement read 5-per-60s and not 3-per-10s.
     * Ours is a flat budget across the whole mount. A sign-in-specific bucket in
     * OUR limiter would restore parity and is a RECORDED FOLLOW-UP, deliberately
     * not built here.
     *
     * **Stated explicitly for the same reason `advanced` below is:
     * better-auth's default for this depends on `NODE_ENV`** —
     * `enabled: options.rateLimit?.enabled ?? isProduction`
     * (`dist/context/create-context.mjs:171`). So it was ON in production and
     * OFF under vitest, which is precisely why no server test ever exercised it
     * and why this shipped unseen. **That is not a property a security control
     * may have**, whichever way it resolves.
     */
    rateLimit: { enabled: false },
    advanced: {
      /**
       * Stated because better-auth's default for it depends on `NODE_ENV`, and
       * that is not a property a security control may have.
       *
       * `skipOriginCheck: options.advanced?.disableOriginCheck !== undefined ? … : isTest() ? true : false`
       * (`better-auth/dist/context/create-context.mjs`) — so left unset, the CSRF
       * origin check is ON in production and OFF under vitest, which sets
       * `NODE_ENV=test`. And it is not only the origin check: while
       * `disableCSRFCheck` is unset, `shouldSkipCSRFForBackwardCompat` — which is
       * `skipOriginCheck === true && options.advanced?.disableCSRFCheck === undefined`
       * (`api/middlewares/origin-check.mjs`) — takes the whole CSRF middleware
       * down with it. The result would be a suite in which
       * every cookie-authenticated POST passes and the same request 403s in
       * production — the failure mode where the tests are the thing that is wrong.
       *
       * `false` turns it on everywhere, so `test/auth/sign-in-flows.test.ts` can
       * assert the refusals a browser will actually meet. The rule it switches on:
       * any non-GET request that CARRIES A COOKIE must also carry a trusted
       * `Origin` or `Referer`; a bearer-only request sends no cookie and is
       * exempt, which is why `signInWithPhone` hands later tasks a bearer token.
       *
       * `trustedOrigins` NO LONGER relies on its default alone. The default is
       * the origin of `baseUrl` — this server's own origin — and that is not
       * the origin a browser sends. The browser is served from `WEB_ORIGIN`,
       * so it is `WEB_ORIGIN` that appears in `Origin`, and leaving the default
       * to stand meant the product refused its own client.
       *
       * MEASURED IN THE SHIPPED COMPOSE STACK before this line existed: a real
       * browser at `http://localhost:3001` submitting the shipped sign-in form
       * got `403 {"code":"INVALID_ORIGIN"}` and the words "Invalid origin"
       * rendered on the page. `BETTER_AUTH_URL` was `http://localhost:3000` and
       * `WEB_ORIGIN` `http://localhost:3001`, which is exactly the condition the
       * paragraph this replaces described in the abstract.
       *
       * WHY THE SUITE COULD NOT SEE IT. `sign-in-flows.test.ts` asserts the
       * accepted origin as `BASE_URL` — the SERVER's origin — in both places it
       * asserts acceptance. So the suite pinned "an origin equal to baseUrl is
       * trusted", which the default already guarantees and no browser ever
       * sends. The one test that uses `http://localhost:3001` is the mounted-
       * methods gap, not an acceptance. A bound asserted on only one side of
       * its line.
       *
       * ADDED, NOT SUBSTITUTED: `getTrustedOrigins`
       * (`better-auth/dist/context/helpers.mjs:74,77`) pushes the `baseURL`
       * origin first and only then appends `options.trustedOrigins`, so passing
       * an array extends the default rather than replacing it. A same-origin
       * deployment, where `WEB_ORIGIN` and `baseUrl` share an origin, simply
       * lists it twice and behaves as before. Never a wildcard, and never read
       * from the request — the value comes from config, which is the whole
       * point of the guard below it.
       *
       * NOT SUFFICIENT FOR A CROSS-ORIGIN DEPLOYMENT, and that is a separate
       * recorded gap: `sign-in-flows.test.ts`'s "known gap: OPTIONS and HEAD are
       * not mounted" pins that a CORS preflight 404s before better-auth is
       * reached. It does not bite the compose stack, where the browser talks to
       * Next same-origin and Next proxies server-side, so no preflight is
       * issued. It would bite a deployment whose web app called this server
       * cross-origin directly.
       */
      disableOriginCheck: false,
      /**
       * `SameSite=Lax` is now a SETTING, not an observation.
       *
       * better-auth already emitted it — `createCookieGetter`
       * (`better-auth/dist/cookies/index.mjs`) hard-codes
       * `sameSite: "lax"` into the attribute defaults, and
       * `defaultCookieAttributes` spreads over them. So this line changes no
       * emitted byte today, which is exactly what makes it worth writing: it is
       * the difference between a security property the product HOLDS and one it
       * INHERITS. `SameSite=Lax` is the whole defence of a cookie-authenticated
       * `POST /v1/events` against a cross-site submission (see
       * `../routes/events.ts`, which records that decision) — the product routes
       * sit outside better-auth's own CSRF middleware entirely. A vendor default
       * that moved in an upgrade would change that defence with nothing in this
       * repository saying so; a default that is now overridden cannot move.
       *
       * `crossSubDomainCookies` is deliberately left OFF, and this is the same
       * property seen from its other side: enabling it is what makes
       * `createCookie` emit a `Domain` attribute, and a `Domain` on the session
       * cookie sends it to EVERY subdomain of the zone — every preview deploy,
       * every unrelated service, anything an attacker can get hosted there.
       * `test/auth/sign-in-flows.test.ts` pins the attribute list with `toEqual`
       * over the WHOLE list, so adding one turns that test red.
       *
       * `maxAge`, `path`, `httpOnly` and `secure` are deliberately NOT restated
       * here. `maxAge` is per-cookie and passed at each `createCookie` call, so
       * naming it here would be shadowed for some cookies and not others; and
       * `secure` is derived from the baseURL's protocol, which is the behaviour
       * `sign-in-flows.test.ts` pins over http and https as two different cookie
       * NAMES. Restating either would be a second statement of a fact this
       * repository already has one authority for.
       */
      defaultCookieAttributes: { sameSite: 'lax' },
      database: {
        /**
         * Every id better-auth mints is a ULID, because a user's id is not only
         * better-auth's business: it becomes `actorId` on every event that user
         * authors, and `packages/domain/src/envelope.ts` declares
         * `actorId: ulidString`. better-auth's default is a 32-character
         * mixed-case random string (`@better-auth/core/dist/utils/id.mjs`), which
         * that schema refuses — so without this line no user this server creates
         * could author any event, and the door would refuse every submission as
         * `malformed-envelope`: a refusal naming the envelope for a fault in the
         * identity layer. The ratified membership entity id
         * `${workspaceId}:${userId}` needs it for the same reason.
         *
         * Applied to EVERY model, not just `user`. Session, account, verification
         * and passkey ids never enter the ledger and carry no ULID requirement,
         * but one unconditional rule has no branch to get wrong, needs no vendor
         * internal as a fallback for the other models (returning `false` would
         * ask Postgres for a default our vendor schema does not define), and
         * makes any table a future plugin adds conform by default.
         *
         * `size` is deliberately ignored: a ULID is fixed at 26 characters. This
         * hook does not touch session *tokens* — those call better-auth's own
         * `generateId(32)` directly (`db/internal-adapter.mjs`), so token entropy
         * is unchanged.
         *
         * `newUlid()` rather than a local `ulid()` call: `ids.ts` is the single
         * origin of what a ULID is in this repo, the same discipline
         * `envelope.ts` states for `ULID_REGEX`.
         */
        generateId: () => newUlid(),
      },
    },
    /**
     * ONE key per FULLY configured provider, and nothing for the others.
     *
     * This used to be a literal with `google` always present and `?? ''` for
     * both values. `.env.example` has said `empty disables` beside
     * `GOOGLE_CLIENT_ID` since Plan 4 and it was true only because better-auth
     * treats `''` as absent internally — the key was still in the config, so
     * nothing OUR code could read said the provider was off, and `/sign-in`
     * rendered `Continue with Google` on a dev stack where it could not work.
     * The owner found that by clicking it.
     *
     * Whatever lands here — passed in, or the environment default — is what
     * `GET /v1/auth/methods` reports, because that route reads
     * `auth.options.socialProviders` off the CONSTRUCTED instance rather than
     * off any caller's copy. An earlier version of this comment said `app.ts`
     * "also reads back" a providers object; it does not have one. The
     * distinction matters: a config handed to two places can be handed
     * differently to each, and a config read off the instance cannot.
     */
    socialProviders: deps.socialProviders ?? socialProvidersFromEnv(readSocialProviderEnv()),
    plugins: [
      phoneNumber({
        sendOTP: async ({ phoneNumber: phone, code }) => {
          await deps.otpSender.send(phone, code);
        },
        signUpOnVerification: {
          getTempEmail: (phone) => `${phone.replace(/[^0-9]/g, '')}@phone.gisik-nokma.invalid`,
          getTempName: (phone) => phone,
        },
      }),
      magicLink({
        sendMagicLink: async ({ email, url }) => {
          await deps.magicLinkSender.send(email, url);
        },
      }),
      passkey({
        rpID: new URL(deps.baseUrl).hostname,
        rpName: 'Gisik Nokma',
      }),
      bearer(), // token sessions for the mobile/desktop apps
    ],
  });

  /**
   * THE OTP SENDER, CARRIED ON THE INSTANCE — so `GET /v1/auth/methods` can
   * report phone availability by reading the running instance, exactly as it
   * already reads `options.socialProviders`.
   *
   * The alternative was to thread the sender through `AppDeps` to `buildApp`.
   * That is the design `routes/auth-methods.ts` argues against in its own
   * docblock, in a paragraph written after an earlier version described the
   * weaker shape: *"a config passed to two places can be passed differently to
   * each, while a config read off the instance cannot."* Threading gives two
   * call sites — `createAuth` and `buildApp` — and nothing stops a future
   * caller feeding them different senders, which is precisely the arrangement
   * under which the page offers phone and the server refuses it. Read off the
   * instance, that arrangement does not exist: the object the route reports on
   * IS the object `sendOTP` awaits at `:326`.
   *
   * `Object.assign` rather than a spread: `betterAuth` returns an object whose
   * methods live on a prototype, and `{ ...auth }` would copy the own
   * properties and drop them. The intersection type it produces keeps every
   * existing `auth.handler` / `auth.options` / `auth.api` use resolving
   * unchanged, so no call site moves. Verified against better-auth 1.7.2, whose
   * own type declarations contain no `otpSender` member (measured across 210
   * declaration files, with `socialProviders` as the positive control), so this
   * augmentation collides with nothing the vendor ships.
   */
  return Object.assign(auth, { otpSender: deps.otpSender });
}

export type Auth = ReturnType<typeof createAuth>;
