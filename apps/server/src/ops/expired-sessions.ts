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

/** The daily default: one sweep a day is plenty for a table that only grows by sign-ins. */
export const DEFAULT_SESSION_SWEEP_INTERVAL_MS = 86_400_000;

/**
 * `SESSION_SWEEP_INTERVAL_MS` as a number, read once at start-up. Unset, empty and whitespace-only all mean "use the default"
 * (an `.env` line left blank must not become `Number('')` = 0, which `requirePositiveIntervalMs` would then refuse); anything
 * else is passed through as `Number(value)` and VALIDATED by `requirePositiveIntervalMs` on every `delayMs()` call, so a
 * mistyped value fails loudly by name instead of being clamped here.
 */
export function sessionSweepIntervalMs(env: { SESSION_SWEEP_INTERVAL_MS?: string | undefined }): number {
  const raw = env.SESSION_SWEEP_INTERVAL_MS;
  return Number(raw === undefined || raw.trim() === '' ? String(DEFAULT_SESSION_SWEEP_INTERVAL_MS) : raw);
}

/** The scheduled job's body: delete what has expired and say how many went. Returns the count. */
export async function runExpiredSessionSweep(
  pool: Queryable,
  now: Date,
  log: (entry: { msg: string; deleted: number }) => void,
): Promise<number> {
  const deleted = await deleteExpiredSessions(pool, now);
  log({ msg: 'expired-session sweep complete', deleted });
  return deleted;
}
