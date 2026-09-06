import { evaluateEvent } from '@gisik-nokma/rule-engine';
import { createPool } from '../db.js';
import { createIngestService } from '../ingest/ingest-service.js';
import { buildProjectionRegistry } from '../projections/index.js';
import { existingSeedEventIds, seedConvenienceCorner } from './seed-convenience-corner.js';
import { findUserIdByEmail } from './users.js';

/**
 * The Convenience Corner seed, from a shell.
 *
 * ## Composition, mirrored from the real composition roots
 *
 * ADAPTED FROM PLAN TEXT, which calls
 * `createPool(config.databaseUrl, { caCert: config.databaseCaCert })`. There is
 * no such signature and no such config field: `src/db.ts` exports
 * `createPool(databaseUrl: string)`, which is what installs the int8 parser and
 * the Asia/Kolkata session timezone, so a seeded day is the day the product
 * shows.
 *
 * Deliberately NOT `loadConfig(process.env)`: that schema requires
 * `BETTER_AUTH_URL`, a 32-character `BETTER_AUTH_SECRET` and `WEB_ORIGIN` with
 * no defaults — none of which this seed reads — so a seed run would refuse to
 * start over auth secrets it never touches. `DATABASE_URL` is read directly,
 * mirroring `src/tools/sweep-notifications.ts`'s own deviation from its plan
 * text for exactly this reason.
 *
 * The ingest service is built exactly as the server builds it, and the seed is
 * handed only the CLIENT door (`SeedIngest`). Running this CLI is running the
 * product's own rules over the shop's record.
 *
 * ## Safe to run twice, and that is the point
 *
 * The seed is idempotent by construction: every event id is a deterministic
 * ULID derived from the record, so a second run finds them all already in the
 * ledger and commits nothing. The staged case is the same mechanism — run it
 * once with `--allow-missing-guest` before the accountant has signed in, run it
 * again afterwards, and the second run adds exactly the guest membership and
 * the explicit visibility claims.
 */
function argValue(flag: string): string | null {
  const index = process.argv.indexOf(flag);
  if (index < 0) return null;
  return process.argv[index + 1] ?? null;
}

const USAGE = [
  'usage: seed:cc --owner-email <email> [--accountant-email <email>] [--allow-missing-guest] [--board-path <path>]',
  '(or set SEED_OWNER_EMAIL / SEED_ACCOUNTANT_EMAIL)',
].join('\n');

async function main(): Promise<void> {
  const databaseUrl = process.env['DATABASE_URL'];
  if (!databaseUrl) {
    console.error('DATABASE_URL is required');
    process.exit(2);
  }
  const ownerEmail = argValue('--owner-email') ?? process.env['SEED_OWNER_EMAIL'] ?? null;
  if (!ownerEmail) {
    console.error(USAGE);
    process.exit(2);
  }
  const pool = createPool(databaseUrl);
  try {
    const ingest = createIngestService({ pool, evaluate: evaluateEvent, projections: buildProjectionRegistry() });
    const report = await seedConvenienceCorner(
      {
        ingest,
        resolveUserId: (email) => findUserIdByEmail(pool, email),
        existingEventIds: (ids) => existingSeedEventIds(pool, ids),
      },
      {
        boardPath: argValue('--board-path') ?? 'reference/convenience-corner-tracker/board.data.js',
        ownerEmail,
        accountantEmail: argValue('--accountant-email') ?? process.env['SEED_ACCOUNTANT_EMAIL'] ?? null,
        allowMissingGuest: process.argv.includes('--allow-missing-guest'),
      },
    );
    console.log(
      `Convenience Corner seed: ${report.committed} committed, ${report.skippedExisting} already present, ` +
        `${report.tickets} errand tickets, guest ${
          report.guestConfigured ? 'configured' : 'NOT configured (re-run when the accountant has signed in)'
        }.`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
