import { pathToFileURL } from 'node:url';
import { evaluateEvent } from '@gisik-nokma/rule-engine';
import { createPool } from '../db.js';
import { backfillDecisionType, findDecisionBackfillCandidates } from '../flow/decision-backfill.js';
import { createIngestService } from '../ingest/ingest-service.js';
import { optionalDatabaseCaCert } from '../ops/backup-env.js';
import { buildProjectionRegistry } from '../projections/index.js';

/** `--dry-run` lists the workspaces that would get the type and writes nothing. Exit 1 when any definition was refused. */
async function main(): Promise<void> {
  const databaseUrl = process.env['DATABASE_URL'];
  if (!databaseUrl) { console.error('DATABASE_URL is required'); process.exit(2); }
  const pool = createPool(databaseUrl, { caCert: optionalDatabaseCaCert(process.env) });
  try {
    if (process.argv.includes('--dry-run')) {
      console.log(JSON.stringify({ msg: 'decision backfill dry run', candidates: await findDecisionBackfillCandidates(pool) }));
      return;
    }
    const ingest = createIngestService({ pool, evaluate: evaluateEvent, projections: buildProjectionRegistry() });
    const report = await backfillDecisionType({ pool, ingest });
    console.log(JSON.stringify({ msg: 'decision backfill complete', ...report }));
    if (report.refused > 0) process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
const executedDirectly = process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (executedDirectly) main().catch((error: unknown) => { console.error(error); process.exit(1); });
