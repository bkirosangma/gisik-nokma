// Task 3 has merged and the shim is deleted. `alerterFromConfig` treats ONLY a
// strict `null` as "no alerter", so the `|| null` at the call site below stays
// load-bearing: `.env.example` ships ALERT_WEBHOOK_URL empty and `??` would
// hand that empty string to WebhookErrorAlerter.
import { evaluateEvent } from '@gisik-nokma/rule-engine';
import { alerterFromConfig } from '../alerts/error-alerter.js';
import { createObjectStoreFromEnv } from '../attachments/store-config.js';
import { runAutoCloseSweep } from '../auto-close/sweep.js';
import { ConfigError } from '../config.js';
import { createPool } from '../db.js';
import { createIngestService } from '../ingest/ingest-service.js';
import { runNotificationSweep } from '../notifications/sweep.js';
import { requireExplicitObjectStore, runPurgeSweep } from '../purge/sweep.js';
import { buildProjectionRegistry } from '../projections/index.js';
import { createInAppTransport } from '../notifications/transport.js';
import { sweepOrphanObjects } from '../tools/sweep-orphans.js';
import { optionalDatabaseCaCert } from './backup-env.js';
import { runExpiredSessionSweep, sessionSweepIntervalMs as readSessionSweepIntervalMs } from './expired-sessions.js';
import { exportLedger } from './export-ledger.js';
import { s3SinkFromEnv, s3TargetFromEnv } from './object-sink.js';
import { dumpDatabaseToSink } from './pg-dump.js';
import { backupRetentionDaysFromEnv, pruneBackups, runThenPrune } from './prune-backups.js';
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
 * So the two settings this daemon actually needs are read and refused here, in
 * `loadConfig`'s own style (`ConfigError`, the same message shape) so an
 * operator meets one vocabulary across both entry points: `DATABASE_URL`
 * below, and `DATABASE_CA_CERT` in `./backup-env.ts`. An earlier revision of
 * this docblock said there was no `DATABASE_CA_CERT` to read because
 * `AppConfig` had no such field; that stopped being true when go-live added
 * the field to `config.ts` and handed it to `createPool` in `src/index.ts`,
 * and this worker was not brought along — production's pool then spoke to the
 * managed cluster without the CA and every pool-backed job failed with
 * "self-signed certificate in certificate chain" (2026-09-23; case 13.1422).
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
  // The CA the managed cluster presents, when the deploy binds one — the same
  // value, through the same `createPool`, as the API server's pool in
  // `src/index.ts`. Announced before the scheduler arms so a log reader can
  // see which mode the pool was built in (13.1422): the production defect was
  // a pool built with NO CA while the variable sat unread in the environment.
  const caCert = optionalDatabaseCaCert(process.env);
  const pool = createPool(databaseUrl, { caCert });
  // Read back from the POOL, not from `caCert`: the first version of this line
  // reported the variable, and a mutation that dropped `{ caCert }` from the
  // `createPool` call above still printed "ca" — the announce was describing
  // the environment, not the connection. `pg.Pool` keeps its config on
  // `options`; `ssl` is set only when `createPool` was given a CA (`src/db.ts`).
  const tls = pool.options.ssl ? 'ca' : 'none';
  console.log(JSON.stringify({ msg: 'database pool', tls }));
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

  // Backup retention (trash series Plan 2, spec §5.8). Read HERE, after the
  // `--once` return, for the reason the store above is: the manual path runs
  // the two backups and nothing destructive. A bad value throws now, before the
  // scheduler arms anything (19.159).
  const backupRetentionDays = backupRetentionDaysFromEnv(process.env);
  const backupTarget = s3TargetFromEnv(process.env, 'BACKUP_S3_BUCKET');
  const prune = () => pruneBackups(backupTarget, { now: new Date(), retentionDays: backupRetentionDays });

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

  // The same read-once, validate-on-every-call shape, and the same EMPTY-means-
  // unset handling, for the same reason: App Platform resolves an unset variable
  // to `''`, and `Number('')` is `0`, which `requirePositiveIntervalMs` would
  // then correctly refuse for a value the operator never actually set. The
  // default is an hour, matching spec §8.2's `AUTO_CLOSE_SWEEP_INTERVAL_MS`.
  const rawAutoCloseInterval = process.env.AUTO_CLOSE_SWEEP_INTERVAL_MS;
  const autoCloseSweepIntervalMs = Number(
    rawAutoCloseInterval === undefined || rawAutoCloseInterval.trim() === ''
      ? '3600000'
      : rawAutoCloseInterval,
  );

  // The permanent-delete sweep (trash series Plan 2, spec §5.1): the same
  // read-once, validate-on-every-call shape and empty-means-unset handling as
  // the two sweeps above, default one hour.
  const rawPurgeInterval = process.env.PURGE_SWEEP_INTERVAL_MS;
  const purgeSweepIntervalMs = Number(
    rawPurgeInterval === undefined || rawPurgeInterval.trim() === '' ? '3600000' : rawPurgeInterval,
  );

  // The expired-session delete (devices plan Task 4): the same read-once, validate-on-every-call shape
  // and empty-means-unset handling as the sweeps above, default one day.
  const sessionSweepIntervalMs = readSessionSweepIntervalMs(process.env);

  // The auto-close sweep closes tickets, so it needs a door to close them
  // THROUGH — the same composition `seed/cli-seed-dev-workspace.ts` uses, built
  // here rather than there because this is the process that runs it on a timer.
  // The engine and the projection registry are the real ones: a sweep wired to a
  // permissive stub would report a clean run and write nothing.
  const projections = buildProjectionRegistry();
  const ingest = createIngestService({
    pool,
    evaluate: evaluateEvent,
    projections,
  });

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
      run: () => runThenPrune('pg-dump', jobs.runPgDump, prune, alerter),
      delayMs: () => msUntilNextUtc(process.env.BACKUP_TIME_UTC ?? '21:00', new Date()),
    },
    {
      name: 'ledger-export',
      run: () => runThenPrune('ledger-export', jobs.runLedgerExport, prune, alerter),
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
    {
      name: 'auto-close',
      run: async (): Promise<void> => {
        const report = await runAutoCloseSweep({ pool, ingest });
        console.log(
          JSON.stringify({
            msg: 'auto-close sweep complete',
            workspacesOn: report.workspacesOn,
            candidates: report.candidates,
            closed: report.closed,
            refused: report.refused,
          }),
        );
      },
      delayMs: () =>
        requirePositiveIntervalMs(autoCloseSweepIntervalMs, 'AUTO_CLOSE_SWEEP_INTERVAL_MS'),
    },
    {
      name: 'purge',
      run: async (): Promise<void> => {
        // `store` is the attachment store built above — which is why the worker
        // needs OBJECT_STORE=s3 in production (deploy/do/app.yaml, D5).
        requireExplicitObjectStore(process.env);
        const report = await runPurgeSweep({ pool, projections, store, alerter });
        console.log(JSON.stringify({ msg: 'purge sweep complete', ...report }));
      },
      delayMs: () => requirePositiveIntervalMs(purgeSweepIntervalMs, 'PURGE_SWEEP_INTERVAL_MS'),
    },
    {
      name: 'expired-sessions',
      run: async (): Promise<void> => {
        await runExpiredSessionSweep(pool, new Date(), (entry) => console.log(JSON.stringify(entry)));
      },
      delayMs: () => requirePositiveIntervalMs(sessionSweepIntervalMs, 'SESSION_SWEEP_INTERVAL_MS'),
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
