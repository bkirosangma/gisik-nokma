import { ConfigError } from '../config.js';
import { createPool } from '../db.js';
// Task 3 has merged and the shim is deleted. `alerterFromConfig` treats ONLY a
// strict `null` as "no alerter", so the `|| null` at the call site below stays
// load-bearing: `.env.example` ships ALERT_WEBHOOK_URL empty and `??` would
// hand that empty string to WebhookErrorAlerter.
import { alerterFromConfig } from '../alerts/error-alerter.js';
import { exportLedger } from './export-ledger.js';
import { s3SinkFromEnv } from './object-sink.js';
import { dumpDatabaseToSink } from './pg-dump.js';
import { startBackupDaemon } from './schedule.js';

/**
 * THIS DAEMON DOES NOT CALL `loadConfig`, ON PURPOSE.
 *
 * `../config.ts` is the API SERVER's configuration contract, and it requires
 * `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET` and `WEB_ORIGIN` with no defaults —
 * correctly, for a process that serves HTTP, signs session cookies and mints
 * magic links. This process does none of those things: it is App Platform's
 * `backup` worker (`deploy/do/app.yaml`), it listens on no port, and its env
 * block there declares none of those three. Calling `loadConfig` therefore made
 * the worker UNBOOTABLE as deployed — measured with that block's literal 13
 * variables, the process exited 1 on `invalid server configuration — check:
 * BETTER_AUTH_URL, BETTER_AUTH_SECRET, WEB_ORIGIN` before it reached the sink,
 * the pool or the alerter. Adding those three to the worker's env block would
 * have "fixed" it by handing a backup process a session-signing secret it has
 * no use for, which is the wrong direction.
 *
 * So the one setting this daemon actually needs is read and refused here, in
 * `loadConfig`'s own style (`ConfigError`, the same message shape) so an
 * operator meets one vocabulary across both entry points. There is no
 * `DATABASE_CA_CERT` read to convert alongside it: `AppConfig` has no such
 * field on this branch, and this file never read one — the worker's env block
 * declares the variable ahead of its reader, exactly as `.env.example` does.
 */
function requireDatabaseUrl(env: NodeJS.ProcessEnv): string {
  const databaseUrl = env.DATABASE_URL;
  // Empty counts as missing, not as a value — an unset App Platform binding
  // resolves to an empty string, and `new pg.Pool({ connectionString: '' })`
  // would silently fall back to libpq's own defaults (local socket, $USER)
  // rather than fail, which is a backup of the wrong database.
  if (databaseUrl === undefined || databaseUrl.trim() === '') {
    throw new ConfigError('invalid backup worker configuration — check: DATABASE_URL');
  }
  return databaseUrl;
}

/**
 * The backup worker's entry point. Deployed as `node dist/ops/backup-daemon-
 * main.js` (see `deploy/do/app.yaml`'s `backup` worker); `--once` runs both
 * jobs immediately and exits, which is what the runbook's manual backup and
 * `pnpm --filter @gisik-nokma/server ops:backup-once` use.
 */
async function main(): Promise<void> {
  const databaseUrl = requireDatabaseUrl(process.env);
  // `|| null`, NOT `?? null`. Task 3's real `alerterFromConfig` treats ONLY a
  // strict `null` as "no alerter" and hands anything else to
  // `WebhookErrorAlerter` — its docblock says `null` "is precisely what
  // `loadConfig` produces for an unset or empty `ALERT_WEBHOOK_URL`", i.e. the
  // mapping of empty-to-null is the CALLER's job. `.env.example` ships this
  // variable empty and `deploy/do/app.yaml`'s backup worker declares it as a
  // SECRET with no value, which App Platform can resolve to an empty string —
  // so with `??` the default deployment would build a webhook alerter pointed
  // at `''` and POST into nothing on every failure. Logical OR maps both spellings
  // of "unset" to the one the alerter's contract recognises.
  const alerter = alerterFromConfig(process.env.ALERT_WEBHOOK_URL || null);
  const sink = s3SinkFromEnv(process.env, 'BACKUP_S3_BUCKET');
  const pool = createPool(databaseUrl);
  const jobs = {
    runPgDump: async (): Promise<void> => {
      const key = await dumpDatabaseToSink(databaseUrl, sink, () => new Date());
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

  // The three schedule values are NOT validated here, and that is the choice
  // rather than an omission: `msUntilNextUtc` refuses a malformed `HH:MM` and,
  // since the same review that found this, a `dayOfWeek` outside the integers
  // 0-6 — including the `NaN` a non-numeric `LEDGER_EXPORT_DOW_UTC` produces
  // through `Number()` below. Both refusals fire on the FIRST `delayMs()`
  // call, which `startBackupDaemon` makes synchronously while arming the
  // initial timers, so a mistyped variable rejects `main()` and exits the
  // worker 1 with the bad value named. Duplicating the range check here would
  // put the same rule in two places for no earlier a failure.
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
