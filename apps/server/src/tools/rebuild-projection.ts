import { pathToFileURL } from 'node:url';
import { createPool } from '../db.js';
import { buildProjectionRegistry } from '../projections/index.js';
import { rebuildProjection } from '../projections/rebuild.js';

/**
 * `pnpm --filter @gisik-nokma/server rebuild:projection <name>` — reset ONE projection
 * table and replay the whole ledger into it, in one transaction (`rebuildProjection`).
 * First use: `proj_tickets` after the 2026-09-22 change that makes `ticket.created`
 * write a birth priority — live rows written by the older reducer lack the claim and
 * every card read throws until they are replayed. `verify:projections` is the
 * detector (it reports the missing claims as drift); this is the repair.
 */
async function main(): Promise<void> {
  const name = process.argv[2];
  const databaseUrl = process.env['DATABASE_URL'];
  if (!name) {
    console.error('usage: rebuild-projection <projection name, e.g. proj_tickets>');
    process.exit(2);
  }
  if (!databaseUrl) {
    console.error('DATABASE_URL is required');
    process.exit(2);
  }
  const pool = createPool(databaseUrl);
  try {
    const started = Date.now();
    await rebuildProjection(name, { pool, projections: buildProjectionRegistry() });
    console.log(`rebuild-projection: ${name} rebuilt from the ledger in ${Date.now() - started} ms`);
  } finally {
    await pool.end();
  }
}

const executedDirectly =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;
if (executedDirectly) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
