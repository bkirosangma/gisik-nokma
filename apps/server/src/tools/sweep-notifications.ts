import { createPool } from '../db.js';
import { runNotificationSweep } from '../notifications/sweep.js';
import { createInAppTransport } from '../notifications/transport.js';

/**
 * One attention sweep, from a shell.
 *
 * Scheduling is Plan 11's concern; this only has to be safe to run at any
 * moment and safe to run twice, which is the sweep's own guarantee — the dedupe
 * keys are made of facts about the ticket, never of anything about this run.
 *
 * ADAPTED FROM PLAN TEXT: the plan builds a bare `new Pool({ connectionString })`.
 * This uses `createPool` instead, which `src/db.ts` states every pool in app and
 * tests must come through: it installs the global int8 parser and sends
 * `timezone=Asia/Kolkata` as a startup parameter, so a scheduled run reads the
 * same clock the product shows rather than whatever zone the host's Postgres
 * happens to default to. `verify-projections.ts` — the tool beside this one —
 * already resolves its handle the same way.
 */
async function main(): Promise<void> {
  const databaseUrl = process.env['DATABASE_URL'];
  if (!databaseUrl) {
    console.error('DATABASE_URL is required');
    process.exit(2);
  }
  const pool = createPool(databaseUrl);
  try {
    const report = await runNotificationSweep({ pool, transports: [createInAppTransport(pool)] });
    console.log(
      `sweep: ${report.dueCandidates} due candidates, ${report.staleCandidates} stale candidates, ${report.delivered} delivered`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error('sweep failed', error);
  process.exit(1);
});
