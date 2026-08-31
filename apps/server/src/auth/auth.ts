import { newUlid } from '@gisik-nokma/domain';
import { betterAuth } from 'better-auth';
import { bearer, magicLink, phoneNumber } from 'better-auth/plugins';
import { passkey } from '@better-auth/passkey';
import type { Pool } from 'pg';
import type { MagicLinkSender } from './magic-link-sender.js';
import type { OtpSender } from './otp-sender.js';

export interface AuthDeps {
  pool: Pool;
  otpSender: OtpSender;
  magicLinkSender: MagicLinkSender;
  baseUrl: string; // e.g. http://localhost:3000
  secret: string; // BETTER_AUTH_SECRET
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
 * Google credentials are read from the environment here rather than threaded
 * through `AuthDeps` because they are provider registration, not a collaborator
 * this function's behaviour depends on — and an absent pair leaves the provider
 * configured-but-unusable rather than failing server start.
 */
export function createAuth(deps: AuthDeps) {
  return betterAuth({
    database: deps.pool,
    baseURL: deps.baseUrl,
    secret: deps.secret,
    emailAndPassword: { enabled: false }, // the spec forbids passwords
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
       * `trustedOrigins` is left at its default — the origin of `baseUrl`. When
       * the web app is served from a different origin than this server, that
       * origin must be added here or the browser's own cookie POSTs will 403.
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
    socialProviders: {
      google: {
        clientId: process.env['GOOGLE_CLIENT_ID'] ?? '',
        clientSecret: process.env['GOOGLE_CLIENT_SECRET'] ?? '',
      },
    },
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
}

export type Auth = ReturnType<typeof createAuth>;
