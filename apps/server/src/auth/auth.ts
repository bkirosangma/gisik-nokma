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
