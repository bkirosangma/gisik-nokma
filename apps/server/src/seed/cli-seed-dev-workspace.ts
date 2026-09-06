import { evaluateEvent } from '@gisik-nokma/rule-engine';
import { createPool } from '../db.js';
import { createIngestService } from '../ingest/ingest-service.js';
import { buildProjectionRegistry } from '../projections/index.js';
import { existingSeedEventIds } from './seed-convenience-corner.js';
import { seedDevWorkspace } from './seed-dev-workspace.js';
import { findUserIdByEmail } from './users.js';

/**
 * The Gisik Nokma dev seed, from a shell: one epic per plan document, one
 * task ticket per task heading, run from a repo checkout — the plan
 * documents in `docs/superpowers/plans/` are not in the container image.
 *
 * Composition mirrors `cli-seed-convenience-corner.ts` exactly, including its
 * own correction of the plan text's `createPool(config.databaseUrl, {
 * caCert: config.databaseCaCert })`: there is no such signature and no such
 * config field, and its deliberate avoidance of `loadConfig(process.env)`,
 * which would demand `BETTER_AUTH_URL`/`BETTER_AUTH_SECRET`/`WEB_ORIGIN` that
 * this seed never reads. `DATABASE_URL` is read directly instead, matching
 * `src/tools/sweep-notifications.ts`.
 */
function argValue(flag: string): string | null {
  const index = process.argv.indexOf(flag);
  if (index < 0) return null;
  return process.argv[index + 1] ?? null;
}

const USAGE = [
  'usage: seed:dev --owner-email <email> [--plans-dir <path>]',
  '(or set SEED_OWNER_EMAIL)',
  '(default plans-dir: docs/superpowers/plans)',
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
    const report = await seedDevWorkspace(
      {
        ingest,
        resolveUserId: (email) => findUserIdByEmail(pool, email),
        existingEventIds: (ids) => existingSeedEventIds(pool, ids),
      },
      {
        plansDir: argValue('--plans-dir') ?? 'docs/superpowers/plans',
        ownerEmail,
      },
    );
    console.log(
      `Gisik Nokma dev seed: ${report.committed} committed, ${report.skippedExisting} already present, ` +
        `${report.tickets} task tickets.`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
