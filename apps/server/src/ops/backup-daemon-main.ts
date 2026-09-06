import { loadConfig } from '../config.js';
import { createPool } from '../db.js';
// The shim, not `../alerts/error-alerter.js`, until Task 3 merges — see
// `./error-alerter-shim.ts`'s header.
import { alerterFromConfig } from './error-alerter-shim.js';
import { exportLedger } from './export-ledger.js';
import { s3SinkFromEnv } from './object-sink.js';
import { dumpDatabaseToSink } from './pg-dump.js';
import { startBackupDaemon } from './schedule.js';

/**
 * The backup worker's entry point. Deployed as `node dist/ops/backup-daemon-
 * main.js` (see `deploy/do/app.yaml`'s `backup` worker); `--once` runs both
 * jobs immediately and exits, which is what the runbook's manual backup and
 * `pnpm --filter @gisik-nokma/server ops:backup-once` use.
 */
async function main(): Promise<void> {
  const config = loadConfig(process.env);
  // Read straight from the environment until Task 2's `config.alertWebhookUrl`
  // lands; switch to reading it off the loaded config then, like every other
  // setting.
  const alerter = alerterFromConfig(process.env.ALERT_WEBHOOK_URL ?? null);
  const sink = s3SinkFromEnv(process.env, 'BACKUP_S3_BUCKET');
  const pool = createPool(config.databaseUrl);
  const jobs = {
    runPgDump: async (): Promise<void> => {
      const key = await dumpDatabaseToSink(config.databaseUrl, sink, () => new Date());
      console.log(JSON.stringify({ msg: 'backup complete', key }));
    },
    runLedgerExport: async (): Promise<void> => {
      const key = await exportLedger(pool, sink, () => new Date());
      console.log(JSON.stringify({ msg: 'ledger export complete', key }));
    },
  };

  if (process.argv.includes('--once')) {
    // LEDGER EXPORT FIRST, and BOTH jobs run whatever the other does. The plan
    // text ordered these the other way, with `await` short-circuiting the
    // second — which makes a pg_dump failure cost you the export as well, and
    // the export is the artifact this codebase's own thesis calls sufficient
    // (the dump is merely convenient). Someone reaching for `--once` is
    // typically reaching for it because something is already wrong, which is
    // the worst moment to let the convenient job veto the fundamental one. So
    // both are settled, both outcomes are reported, and the exit code is
    // non-zero if EITHER failed.
    const outcomes = await Promise.allSettled([jobs.runLedgerExport(), jobs.runPgDump()]);
    await pool.end();
    const failures = outcomes.filter((outcome) => outcome.status === 'rejected');
    for (const failure of failures) {
      const error: unknown = failure.reason;
      console.error(error instanceof Error ? error.message : String(error));
    }
    if (failures.length > 0) process.exitCode = 1;
    return;
  }

  const daemon = startBackupDaemon(
    jobs,
    {
      pgDumpTimeUtc: process.env.BACKUP_TIME_UTC ?? '21:00',
      ledgerExportTimeUtc: process.env.LEDGER_EXPORT_TIME_UTC ?? '22:00',
      ledgerExportDowUtc: Number(process.env.LEDGER_EXPORT_DOW_UTC ?? '0'),
    },
    alerter,
  );
  console.log(JSON.stringify({ msg: 'backup daemon scheduled' }));

  // App Platform stops a worker with SIGTERM, then SIGKILLs it. Without this
  // the pool's sockets are torn down by the kill rather than closed, and the
  // pending timers keep the process alive until the grace period runs out.
  const shutdown = (signal: string): void => {
    console.log(JSON.stringify({ msg: 'backup daemon stopping', signal }));
    daemon.stop();
    void pool.end();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  // `exitCode`, not `process.exit(1)`: an immediate exit kills whatever is
  // still in flight — including an object upload mid-multipart, which leaves
  // an incomplete-multipart record accruing storage cost that no bucket
  // listing shows. Setting the code lets the loop drain and exit on its own.
  process.exitCode = 1;
});
