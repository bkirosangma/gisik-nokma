// Task 3 has merged and the shim is deleted. `alerterFromConfig` treats ONLY a
// strict `null` as "no alerter", so the `|| null` at the call site below stays
// load-bearing: `.env.example` ships ALERT_WEBHOOK_URL empty and `??` would
// hand that empty string to WebhookErrorAlerter.
import { alerterFromConfig } from '../alerts/error-alerter.js';
import { createObjectStoreFromEnv } from '../attachments/store-config.js';
import { ConfigError } from '../config.js';
import { createPool } from '../db.js';
import { runNotificationSweep } from '../notifications/sweep.js';
import { createInAppTransport } from '../notifications/transport.js';
import { sweepOrphanObjects } from '../tools/sweep-orphans.js';
import { exportLedger } from './export-ledger.js';
import { s3SinkFromEnv } from './object-sink.js';
import { dumpDatabaseToSink } from './pg-dump.js';
import {
  msUntilNextUtc,
  requirePositiveIntervalMs,
  startScheduler,
  type ScheduledJob,
} from './schedule.js';

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
    //
    // NEITHER of the two errand sweeps below (orphan objects, notifications)
    // runs on this path, ON PURPOSE: this docstring, and the
    // `pnpm ops:backup-once` script that calls it, are specifically "run the
    // two BACKUP jobs right now" — silently folding a destructive sweep (an
    // orphan delete has no undo) into that would surprise whoever reaches for
    // it expecting only a backup.
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

  // Built HERE, after the `--once` early return, and not above alongside
  // `sink`/`pool`: neither the attachment object store nor the notification
  // transport is needed by `--once`, and constructing the store eagerly would
  // give an operator with a partial `OBJECT_STORE=s3` environment a new
  // `ConfigError` from `pnpm ops:backup-once`, which works today without
  // either variable set.
  const store = createObjectStoreFromEnv(process.env);
  const notificationTransport = createInAppTransport(pool);

  // Read once, validated on every `delayMs()` call below (the same "read
  // once, validate on every call" shape `LEDGER_EXPORT_DOW_UTC` already has
  // via `msUntilNextUtc`). An unset OR EMPTY binding means "use the default":
  // App Platform resolves an unset variable to `''`, and `requireDatabaseUrl`
  // and `ALERT_WEBHOOK_URL || null` above both already treat that spelling of
  // "unset" the same way, for the same reason — `Number('')` is `0`, which
  // `requirePositiveIntervalMs` would then (correctly) refuse for a value the
  // operator never actually set.
  const rawSweepInterval = process.env.NOTIFICATION_SWEEP_INTERVAL_MS;
  const notificationSweepIntervalMs = Number(
    rawSweepInterval === undefined || rawSweepInterval.trim() === '' ? '3600000' : rawSweepInterval,
  );

  const scheduledJobs: ScheduledJob[] = [
    // The three schedule values below are NOT validated here, and that is the
    // choice rather than an omission: `msUntilNextUtc` refuses a malformed
    // `HH:MM` and a `dayOfWeek` outside the integers 0-6 — including the `NaN`
    // a non-numeric `LEDGER_EXPORT_DOW_UTC` produces through `Number()`.
    // These refusals fire on the FIRST `delayMs()` call, which `startScheduler`
    // makes synchronously for every job — BEFORE arming any of their timers —
    // so a mistyped variable rejects `main()` with no scheduler timer left
    // running (not even the other, correctly-configured jobs') and exits the
    // worker 1 with the bad value named. Duplicating the range check here
    // would put the same rule in two places for no earlier a failure.
    {
      name: 'pg-dump',
      run: jobs.runPgDump,
      delayMs: () => msUntilNextUtc(process.env.BACKUP_TIME_UTC ?? '21:00', new Date()),
    },
    {
      name: 'ledger-export',
      run: jobs.runLedgerExport,
      delayMs: () =>
        msUntilNextUtc(
          process.env.LEDGER_EXPORT_TIME_UTC ?? '22:00',
          new Date(),
          Number(process.env.LEDGER_EXPORT_DOW_UTC ?? '0'),
        ),
    },
    {
      name: 'sweep-orphans',
      run: async (): Promise<void> => {
        const report = await sweepOrphanObjects(store, pool, { now: new Date(), dryRun: false });
        // Counts only — NOT the swept key list, which could be long. A
        // failure here still reaches stderr and the alerter as usual, via
        // `startScheduler`'s own `onFailure`.
        console.log(
          JSON.stringify({
            msg: 'orphan sweep complete',
            examined: report.examined,
            named: report.named,
            unrecognizedShape: report.unrecognizedShape.length,
            withinWindow: report.withinWindow.length,
            swept: report.swept.length,
            deleted: report.deleted,
          }),
        );
      },
      // Every 30 days, first run 30 days after boot. "Monthly" in the plan
      // sense would mean calendar month-of-day scheduling (`msUntilNextUtc`'s
      // day-of-week machinery generalised to a day-of-month, with February's
      // short month and DST-free UTC arithmetic to get right) — real new
      // logic this maintenance sweep does not need enough to justify.
      delayMs: () => 30 * 24 * 60 * 60 * 1000,
    },
    {
      name: 'sweep-notifications',
      run: async (): Promise<void> => {
        const report = await runNotificationSweep({ pool, transports: [notificationTransport] });
        console.log(
          JSON.stringify({
            msg: 'notification sweep complete',
            dueCandidates: report.dueCandidates,
            staleCandidates: report.staleCandidates,
            delivered: report.delivered,
          }),
        );
      },
      delayMs: () =>
        requirePositiveIntervalMs(notificationSweepIntervalMs, 'NOTIFICATION_SWEEP_INTERVAL_MS'),
    },
  ];

  const daemon = startScheduler(scheduledJobs, alerter);
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
