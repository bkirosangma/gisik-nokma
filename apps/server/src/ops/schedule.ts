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
 */
export function msUntilNextUtc(timeHHMM: string, from: Date, dayOfWeek?: number): number {
  const match = timeHHMM.match(/^(\d{2}):(\d{2})$/);
  if (!match) throw new Error(`backup time must be HH:MM (UTC), got '${timeHHMM}'`);
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
 * A backup that fails silently is a lie about being backed up — every failure
 * is written to stderr as structured JSON AND handed to the alerter, and the
 * daemon re-arms rather than dying. Covered by cases 13.25–13.29.
 *
 * THE STDERR LINE IS WRITTEN HERE, BY THE DAEMON, ON PURPOSE. It used to be
 * written by `alerterFromConfig` — but that was `error-alerter-shim.ts`, now
 * deleted as its own header promised, and Task 3's real module does not
 * log: `WebhookErrorAlerter` POSTs and swallows (reasoning that the original
 * error is already in the structured log, which is true of `buildApp`'s error
 * handler and false of this caller), and `NoopErrorAlerter.notify()` is an
 * empty async function. `.env.example` ships `ALERT_WEBHOOK_URL` empty, so the
 * DEFAULT deployment gets the Noop. Had the property stayed in the alerter,
 * performing the shim's own documented one-line retirement would have made
 * every backup failure completely silent — precisely the failure this daemon
 * exists to prevent. Keeping it here makes that swap genuinely a one-liner.
 */
export function startBackupDaemon(
  jobs: BackupJobs,
  times: BackupTimes,
  alerter: ErrorAlerter,
): { stop(): void } {
  let stopped = false;
  const timers = new Set<NodeJS.Timeout>();

  const onFailure = async (name: string, error: unknown): Promise<void> => {
    // Logged BEFORE the alerter is reached, so an alerter that throws, hangs
    // or does nothing cannot eat the only record that the backup failed.
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
      // the re-arm below or takes the daemon down.
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

  const loop = (name: string, run: () => Promise<void>, delayMs: () => number): void => {
    if (stopped) return;
    const timer = setTimeout(() => {
      timers.delete(timer);
      run()
        .catch((error: unknown) => onFailure(name, error))
        .finally(() => loop(name, run, delayMs));
    }, delayMs());
    timers.add(timer);
  };

  loop('pg-dump', jobs.runPgDump, () => msUntilNextUtc(times.pgDumpTimeUtc, new Date()));
  loop('ledger-export', jobs.runLedgerExport, () =>
    msUntilNextUtc(times.ledgerExportTimeUtc, new Date(), times.ledgerExportDowUtc),
  );

  return {
    stop() {
      stopped = true;
      for (const timer of timers) clearTimeout(timer);
    },
  };
}
