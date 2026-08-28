import { createPool } from '../db.js';
import { createAuth } from './auth.js';
import { LogMagicLinkSender } from './magic-link-sender.js';
import { LogOtpSender } from './otp-sender.js';

/**
 * Concrete instance for `pnpm exec better-auth generate --config …` and local
 * dev runs. Never imported by production assembly — that wires real deps from
 * validated configuration (`src/config.ts`).
 *
 * The pool comes through `createPool` and not `new Pool(...)`: `src/db.ts`
 * installs the int8 parser and pins every session to Asia/Kolkata, and a second
 * pool built any other way would read a different clock than the product.
 * The default URL is the docker-compose database (port 54329, user `gisik`),
 * which is the only Postgres this repo ever brings up.
 */
export const auth = createAuth({
  pool: createPool(
    process.env['DATABASE_URL'] ?? 'postgres://gisik:gisik@localhost:54329/gisik_nokma',
  ),
  otpSender: new LogOtpSender(),
  magicLinkSender: new LogMagicLinkSender(),
  baseUrl: process.env['BETTER_AUTH_URL'] ?? 'http://localhost:3000',
  // Not a secret: a visible placeholder that only ever signs dev-machine
  // sessions. Production reads BETTER_AUTH_SECRET, and nothing in this file
  // is on the production path.
  secret: process.env['BETTER_AUTH_SECRET'] ?? 'dev-only-secret-change-me',
});
