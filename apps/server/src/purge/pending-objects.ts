import { ObjectNotFoundError, type ObjectStore } from '../attachments/object-store.js';
import type { Queryable } from '../db/queryable.js';

/**
 * Attachment objects a purge orphaned (spec §5.2, §7). Keys are queued INSIDE
 * the purge transaction and deleted after it commits, so a crash between the
 * two leaves the key queued rather than a file no row points at. A row leaves
 * the queue only when its delete succeeded — the delete is attempted FIRST.
 */

export async function queuePendingObjects(db: Queryable, keys: readonly string[], now: Date): Promise<void> {
  if (keys.length === 0) return;
  await db.query(
    `INSERT INTO purge_pending_objects (object_key, queued_at)
     SELECT unnest($1::text[]), $2
     ON CONFLICT (object_key) DO NOTHING`,
    [[...keys], now.toISOString()],
  );
}

export type DrainReport = { deleted: number; pending: number };

/**
 * Deletes queued objects — only `onlyKeys` when given (the purge's own, right
 * after commit), every queued key otherwise (the sweep's drain, Task 9). An
 * object already gone counts as deleted: the goal is its absence.
 */
export async function deletePendingObjects(
  db: Queryable,
  store: Pick<ObjectStore, 'delete'>,
  onlyKeys?: readonly string[],
): Promise<DrainReport> {
  const { rows } =
    onlyKeys === undefined
      ? await db.query<{ object_key: string }>(
          'SELECT object_key FROM purge_pending_objects ORDER BY queued_at, object_key',
        )
      : await db.query<{ object_key: string }>(
          'SELECT object_key FROM purge_pending_objects WHERE object_key = ANY($1::text[]) ORDER BY queued_at, object_key',
          [[...onlyKeys]],
        );
  const report: DrainReport = { deleted: 0, pending: 0 };
  for (const { object_key: key } of rows) {
    try {
      await store.delete(key);
    } catch (error) {
      if (!(error instanceof ObjectNotFoundError)) {
        report.pending += 1;
        await db.query(
          'UPDATE purge_pending_objects SET attempts = attempts + 1, last_error = $2 WHERE object_key = $1',
          [key, error instanceof Error ? error.message : String(error)],
        );
        continue;
      }
    }
    await db.query('DELETE FROM purge_pending_objects WHERE object_key = $1', [key]);
    report.deleted += 1;
  }
  return report;
}
