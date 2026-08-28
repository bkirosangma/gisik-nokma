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
