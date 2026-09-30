import type { Queryable } from '../db/queryable.js';

/**
 * Devices plan Task 4 (case 6.321): an expired better-auth session is never listed and never usable, so
 * deleting it loses nothing; this keeps the table from growing forever (831 rows for one dev account,
 * 2026-09-30). `expiresAt <= now`: a session that expires at exactly `now` is expired.
 */
export async function deleteExpiredSessions(pool: Queryable, now: Date): Promise<number> {
  const r = await pool.query(`DELETE FROM session WHERE "expiresAt" <= $1`, [now]);
  return r.rowCount ?? 0;
}
