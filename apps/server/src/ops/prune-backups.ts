import { DeleteObjectCommand, ListObjectsV2Command, type _Object } from '@aws-sdk/client-s3';
import type { ErrorAlerter } from '../alerts/error-alerter.js';
import type { BackupS3Target } from './object-sink.js';

/**
 * Backup retention (trash series Plan 2; spec §5.8, decision T4). Measured
 * 2026-09-28: neither bucket carries a lifecycle rule, so this is the only
 * retention. An erased item leaves the last backup within the purge delay plus
 * `BACKUP_RETENTION_DAYS` of being marked.
 *
 * The prefixes are the two jobs' own key shapes: `pg/<stamp>.dump`
 * (`./pg-dump.ts`) and `ledger/<day>.ndjson.gz` (`./export-ledger.ts`).
 */

export const BACKUP_PREFIXES = ['pg/', 'ledger/'] as const;
export const DEFAULT_BACKUP_RETENTION_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export type PruneReport = { examined: number; deleted: string[]; keptNewest: string[]; errors: string[] };

/**
 * Read once at daemon start (after the `--once` return — the manual path never
 * prunes). Unset or empty means the default, for the reason the sweep intervals
 * give: App Platform resolves an unset binding to `''`. Anything but a positive
 * integer throws, naming the variable, so the scheduler never arms on a typo.
 */
export function backupRetentionDaysFromEnv(env: NodeJS.ProcessEnv): number {
  const { BACKUP_RETENTION_DAYS } = env;
  if (BACKUP_RETENTION_DAYS === undefined || BACKUP_RETENTION_DAYS.trim() === '') {
    return DEFAULT_BACKUP_RETENTION_DAYS;
  }
  const trimmed = BACKUP_RETENTION_DAYS.trim();
  if (!/^[0-9]+$/.test(trimmed) || Number(trimmed) <= 0) {
    throw new Error(`BACKUP_RETENTION_DAYS must be a positive integer number of days, got '${BACKUP_RETENTION_DAYS}'`);
  }
  return Number(trimmed);
}

async function listAll(target: BackupS3Target, prefix: string): Promise<_Object[]> {
  const objects: _Object[] = [];
  let token: string | undefined;
  do {
    const page = await target.client.send(
      new ListObjectsV2Command({ Bucket: target.bucket, Prefix: prefix, ContinuationToken: token }),
    );
    objects.push(...(page.Contents ?? []));
    token = page.IsTruncated === true ? page.NextContinuationToken : undefined;
  } while (token !== undefined);
  return objects;
}

/**
 * Deletes every object under each prefix strictly older than the window, NEVER
 * the newest under a prefix (spec §5.8: "never deletes the newest successful
 * backup, whatever its age"). A listing failure throws — the caller alerts; a
 * delete failure is recorded and the rest continue. One key at a time with
 * `DeleteObjectCommand`, the call this repository already sends to Spaces (D9).
 */
export async function pruneBackups(
  target: BackupS3Target,
  options: { now: Date; retentionDays: number },
): Promise<PruneReport> {
  const cutoff = options.now.getTime() - options.retentionDays * DAY_MS;
  const report: PruneReport = { examined: 0, deleted: [], keptNewest: [], errors: [] };
  for (const prefix of BACKUP_PREFIXES) {
    const objects = (await listAll(target, prefix)).filter(
      (object): object is _Object & { Key: string; LastModified: Date } =>
        object.Key !== undefined && object.LastModified !== undefined,
    );
    report.examined += objects.length;
    if (objects.length === 0) continue;
    const newest = objects.reduce((best, object) =>
      object.LastModified.getTime() > best.LastModified.getTime() ||
      (object.LastModified.getTime() === best.LastModified.getTime() && object.Key > best.Key)
        ? object
        : best,
    );
    report.keptNewest.push(newest.Key);
    for (const object of objects) {
      if (object.Key === newest.Key) continue;
      if (object.LastModified.getTime() >= cutoff) continue;
      try {
        await target.client.send(new DeleteObjectCommand({ Bucket: target.bucket, Key: object.Key }));
        report.deleted.push(object.Key);
      } catch (error) {
        report.errors.push(`${object.Key}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
  return report;
}

/**
 * A scheduled backup job, then the prune — only if the job succeeded. The
 * prune can never fail the backup: a throw, or a report with errors, is
 * alerted as `backup:prune-after-<job>` and swallowed. The job's own failure
 * propagates unchanged to `startScheduler`'s `onFailure`, as before.
 */
export async function runThenPrune(
  name: string,
  run: () => Promise<void>,
  prune: () => Promise<PruneReport>,
  alerter: ErrorAlerter,
  log: (message: string, error?: unknown) => void = (message, error) => console.error(message, error),
): Promise<void> {
  await run();
  let report: PruneReport;
  try {
    report = await prune();
  } catch (error) {
    log(`backup prune after ${name} failed`, error);
    await alerter.notify(`backup:prune-after-${name}`, error);
    return;
  }
  console.log(
    JSON.stringify({
      msg: 'backup prune complete',
      after: name,
      examined: report.examined,
      deleted: report.deleted.length,
      errors: report.errors.length,
    }),
  );
  if (report.errors.length > 0) {
    await alerter.notify(
      `backup:prune-after-${name}`,
      new Error(`backup prune could not delete ${report.errors.length} object(s): ${report.errors.join('; ')}`),
    );
  }
}
