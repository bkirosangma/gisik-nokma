// Task 3 has merged (Lane E seam 1) and `./error-alerter-shim.ts` is deleted;
// this is the real module. The shim mirrored this exact type, so the swap is an
// import line: `notify(context, error)` returns `Promise<void>` here too.
import type { ErrorAlerter } from '../alerts/error-alerter.js';

/**
 * Milliseconds from `from` until the next `HH:MM` in UTC — optionally the next
 * such time that also falls on `dayOfWeek` (0 = Sunday). UTC throughout on
 * purpose: the container's `TZ` is Asia/Kolkata so log timestamps read against
 * the product's clock, and a schedule that drifted with the process locale
 * would be a different backup window on a differently-configured host.
 *
 * Refuses an out-of-range hour or minute as well as a malformed shape (E6-23,
 * below). No `BACKUP_TIME_UTC` key was added to `config.ts`'s schema for it,
 * although the finding suggested one: the backup daemon reads its schedule
 * values straight off the environment on purpose and never calls
 * `loadConfig` (`backup-daemon-main.ts` says why), and `startScheduler`
 * computes every job's first `delayMs()` before arming any timer, so this
 * throw already ends the worker at boot, exit 1, with the value named — a
 * schema key would put the same rule in a second place the daemon does not
 * read.
 */
export function msUntilNextUtc(timeHHMM: string, from: Date, dayOfWeek?: number): number {
  // The SHAPE and the RANGE are refused by the same sentence (E6-23). The
  // regex alone admitted `25:00`, `23:60` and `99:99`, and `setUTCHours` does
  // not refuse an out-of-range hour or minute — it ROLLS OVER, so `25:00`
  // scheduled the nightly dump at 01:00 the next day and `99:99` landed it
  // four days out at 04:39, while a daemon that started cleanly looked
  // correctly configured. Measured 2026-09-21 against the built module. The
  // bound is `< 24` and `< 60`: `24:00` is not a time of day either (it is
  // `00:00` tomorrow, which is what an operator who typed it would have to
  // learn from the schedule rather than from this sentence).
  const match = timeHHMM.match(/^(\d{2}):(\d{2})$/);
  if (!match || Number(match[1]) >= 24 || Number(match[2]) >= 60) {
    throw new Error(`backup time must be HH:MM (UTC), got '${timeHHMM}'`);
  }
  // REFUSED RATHER THAN CLAMPED, and refused BEFORE the loop below runs.
  // `getUTCDay()` only ever returns 0-6, so the loop's `next.getUTCDay() !==
  // dayOfWeek` clause is permanently true for 7, -1, or the `NaN` that
  // `Number('sunday')` produces — and the loop has no other exit. The daemon's
  // caller reads this straight off the environment
  // (`Number(process.env.LEDGER_EXPORT_DOW_UTC ?? '0')`), so a mistyped
  // deployment variable spun a worker at 100% of a core, forever, silently:
  // no dump, no export, no alert, and a process that still looks alive to App
  // Platform's health view. Throwing turns that into an immediate exit 1 that
  // NAMES the bad value, the same bargain the HH:MM refusal above makes.
  if (dayOfWeek !== undefined && !(Number.isInteger(dayOfWeek) && dayOfWeek >= 0 && dayOfWeek <= 6)) {
    throw new Error(`backup day-of-week must be an integer 0-6 (0 = Sunday), got '${dayOfWeek}'`);
  }
  const [, hours, minutes] = match;
  const next = new Date(from);
  next.setUTCHours(Number(hours), Number(minutes), 0, 0);
  while (
    next.getTime() <= from.getTime() ||
    (dayOfWeek !== undefined && next.getUTCDay() !== dayOfWeek)
  ) {
    next.setUTCDate(next.getUTCDate() + 1);
    next.setUTCHours(Number(hours), Number(minutes), 0, 0);
  }
  return next.getTime() - from.getTime();
}

export type BackupJobs = { runPgDump(): Promise<void>; runLedgerExport(): Promise<void> };
export type BackupTimes = {
  pgDumpTimeUtc: string;
  ledgerExportTimeUtc: string;
  ledgerExportDowUtc: number;
};

/**
 * One recurring job: a name (the alerting/logging key), the async work, and a
 * function that computes the delay to its NEXT run. `delayMs` is a function
 * rather than a fixed number so the same primitive can express both a
 * calendar-anchored schedule (`msUntilNextUtc`, re-evaluated against a fresh
 * `Date` on every re-arm) and a plain fixed interval (a job whose `delayMs`
 * always returns the same constant) — `startBackupDaemon` below is the first
 * kind, `backup-daemon-main.ts`'s orphan and notification sweeps are the
 * second.
 */
export type ScheduledJob = { name: string; run: () => Promise<void>; delayMs: () => number };

/**
 * Refuses rather than clamps a millisecond interval — the same bargain
 * `msUntilNextUtc`'s HH:MM and day-of-week checks make, and for the identical
 * reason: a caller reading this straight off an environment variable via
 * `Number(...)` can produce `0`, a negative number, or `NaN` from a mistyped
 * or malformed value, and any of those handed to `setTimeout` either spins the
 * daemon at 100% of a core in a tight re-arm loop (`0` or negative) or never
 * fires at all (`NaN` — `setTimeout` treats it as 1ms in Node today, but that
 * is an implementation detail this function refuses to depend on either way).
 * Throwing NAMES the bad value, so an operator sees which variable they
 * mistyped rather than a process that looks alive and does nothing.
 */
export function requirePositiveIntervalMs(value: number, name: string): number {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer number of milliseconds, got '${value}'`);
  }
  return value;
}

/**
 * Arms every job's first timer synchronously (each `delayMs()` is called once
 * here, before this function returns), then re-arms each job independently
 * after it settles — one job's failure, or its own schedule, never affects
 * another's. Every failure is written to stderr as structured JSON AND
 * handed to the alerter, and a job re-arms rather than dying. Covered by
 * cases 13.25–13.29 (via `startBackupDaemon`, the wrapper below).
 *
 * EVERY JOB'S INITIAL `delayMs()` IS COMPUTED BEFORE ANY TIMER IS ARMED, ON
 * PURPOSE. `delayMs` can throw — `requirePositiveIntervalMs` and
 * `msUntilNextUtc` both refuse rather than clamp a malformed schedule value,
 * by design (see their own docblocks). If jobs were armed one at a time in
 * loop order and a LATER job's `delayMs()` threw (e.g. a mistyped
 * `NOTIFICATION_SWEEP_INTERVAL_MS` on the fourth job while the first three —
 * including the irreversible orphan-object sweep — had already been armed),
 * the exception would unwind out of `startScheduler` with those earlier
 * timers already live, orphaned: no `stop()` is ever returned to the caller
 * in that case, so nothing can ever cancel them, and — because this is
 * reached from `backup-daemon-main.ts`'s `main()`, which only sets
 * `process.exitCode = 1` on a throw rather than exiting immediately — the
 * process does not even end; it looks crashed (exit code 1) while the
 * armed jobs keep running via their own closures forever. Computing every
 * `delayMs()` up front means a throw here happens before any `setTimeout` is
 * scheduled, so `startScheduler` either arms all N jobs or none of them.
 *
 * THE STDERR LINE IS WRITTEN HERE, BY THE SCHEDULER, ON PURPOSE, NOT BY THE
 * ALERTER (`../alerts/error-alerter.ts`, Task 3's real module — this file
 * used to import a temporary shim of the same shape until Task 3 merged;
 * that retirement is done). Neither real `ErrorAlerter` implementation logs:
 * `WebhookErrorAlerter` POSTs and swallows (reasoning that the original error
 * is already in the structured log, which is true of `buildApp`'s error
 * handler and false of this caller), and `NoopErrorAlerter.notify()` is an
 * empty async function. `.env.example` ships `ALERT_WEBHOOK_URL` empty, so
 * the DEFAULT deployment gets the Noop. Had this line lived in the alerter
 * instead, every backup and sweep failure in the default deployment would be
 * completely silent — precisely the failure this scheduler exists to
 * prevent.
 */
export function startScheduler(jobs: ScheduledJob[], alerter: ErrorAlerter): { stop(): void } {
  let stopped = false;
  const timers = new Set<NodeJS.Timeout>();

  const onFailure = async (name: string, error: unknown): Promise<void> => {
    // Logged BEFORE the alerter is reached, so an alerter that throws, hangs
    // or does nothing cannot eat the only record that the job failed.
    console.error(
      JSON.stringify({
        level: 'error',
        msg: 'backup job failed',
        job: name,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    try {
      await alerter.notify(`backup:${name}`, error);
    } catch (notifyError: unknown) {
      // Failing to REPORT a failure must not become a second failure that skips
      // the re-arm below or takes the scheduler down.
      console.error(
        JSON.stringify({
          level: 'error',
          msg: 'backup alerter failed',
          job: name,
          error: notifyError instanceof Error ? notifyError.message : String(notifyError),
        }),
      );
    }
  };

  const arm = (job: ScheduledJob, delay: number): void => {
    if (stopped) return;
    const timer = setTimeout(() => {
      timers.delete(timer);
      job
        .run()
        .catch((error: unknown) => onFailure(job.name, error))
        .finally(() => loop(job));
    }, delay);
    timers.add(timer);
  };

  // Re-arm path: each re-arm still calls `delayMs()` fresh (a calendar-
  // anchored schedule like `msUntilNextUtc` needs a new `Date` on every
  // occurrence), so a job whose schedule value changes out from under it
  // between runs picks up the new value the same way it always has.
  const loop = (job: ScheduledJob): void => {
    if (stopped) return;
    arm(job, job.delayMs());
  };

  // Compute every job's FIRST delay before arming ANY timer — see the
  // docblock above. `jobs.map` runs synchronously and in order, so a job
  // that throws here does so before its predecessors' timers exist and
  // before its successors' `delayMs()` is even called. Pairing each job with
  // its delay up front (rather than indexing back into a parallel array)
  // sidesteps `noUncheckedIndexedAccess` for no behavioural difference.
  const armedJobs = jobs.map((job) => ({ job, delay: job.delayMs() }));
  for (const { job, delay } of armedJobs) arm(job, delay);

  return {
    stop() {
      stopped = true;
      for (const timer of timers) clearTimeout(timer);
    },
  };
}

/**
 * A thin wrapper over `startScheduler`, kept for its own existing callers and
 * tests: the two backup jobs, expressed as `ScheduledJob`s with the same
 * names (`'pg-dump'`, `'ledger-export'`) and the same `msUntilNextUtc`-derived
 * schedules as before the generalisation. `test/ops/schedule.test.ts`'s
 * `startBackupDaemon` suite pins this function's observable behaviour
 * byte-for-byte (the exact stderr shape, the `backup:${name}` alerter key,
 * two timers armed synchronously at construction) — that suite is the
 * contract, not this wrapper's body, so a future change to `startScheduler`
 * that keeps that suite green is safe by construction.
 */
export function startBackupDaemon(
  jobs: BackupJobs,
  times: BackupTimes,
  alerter: ErrorAlerter,
): { stop(): void } {
  return startScheduler(
    [
      {
        name: 'pg-dump',
        run: jobs.runPgDump,
        delayMs: () => msUntilNextUtc(times.pgDumpTimeUtc, new Date()),
      },
      {
        name: 'ledger-export',
        run: jobs.runLedgerExport,
        delayMs: () => msUntilNextUtc(times.ledgerExportTimeUtc, new Date(), times.ledgerExportDowUtc),
      },
    ],
    alerter,
  );
}
