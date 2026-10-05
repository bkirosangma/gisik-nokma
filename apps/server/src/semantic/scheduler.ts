import type { Pool } from 'pg';
import { runSuggestionJob } from './suggestion-job.js';

export const CHANGES_BEFORE_RUN = 200;
export const CHANGE_DEBOUNCE_MS = 10 * 60 * 1000;
export const NIGHTLY_IST_HOUR = 2;
const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

/** The IST calendar date (YYYY-MM-DD) and hour of an instant. */
export function istClock(at: Date): { date: string; hour: number } {
  const shifted = new Date(at.getTime() + IST_OFFSET_MS);
  return { date: shifted.toISOString().slice(0, 10), hour: shifted.getUTCHours() };
}

/**
 * Spec D §4.1 "When it runs": nightly, and after 200 item changes in a workspace, debounced 10 minutes.
 *
 * - `change` counts the commit feed's embedding nudges per workspace (`app.ts` `onSemanticChange`). The 200th arms a
 *   10-minute timer, each later change re-arms it, and the run resets the count. The count is in memory: a restart
 *   loses at most 199, and the nightly run covers them.
 * - `tick` is the hourly check for the nightly run: during the 02:00 IST hour, once per IST date per workspace,
 *   recorded in `sem_job_state`. The workspaces are those holding the job's inputs or outputs (the two chunk tables
 *   and `sem_suggestions`), minus the archived and the deleted: nobody curates those. A workspace has a
 *   `proj_workspaces` row only once a lifecycle event names it (`migrations/1790500000000_lifecycle.sql`: absence is
 *   live), so the lifecycle table is LEFT-joined, never the list.
 * - Failures are logged and swallowed, as the embed worker's are (`embed-worker.ts:209-216`): a job that throws, and a
 *   tick whose own query throws, which the hourly `void tick()` would otherwise leave as an unhandled rejection.
 */
export function startSuggestionScheduler(
  pool: Pool,
  options: { log?: (msg: string) => void; now?: () => Date; runJob?: typeof runSuggestionJob } = {},
): { change(workspaceId: string): void; stop(): void; tick(): Promise<void> } {
  const log = options.log ?? ((): undefined => undefined);
  const now = options.now ?? (() => new Date());
  const runJob = options.runJob ?? runSuggestionJob;
  const counts = new Map<string, number>();
  const timers = new Map<string, NodeJS.Timeout>();
  const run = async (workspaceId: string): Promise<void> => {
    try {
      await runJob(pool, workspaceId, { now: now() });
    } catch (error) {
      log(`suggestion job failed for ${workspaceId}: ${String(error)}`);
    }
  };
  async function tick(): Promise<void> {
    try {
      const { date, hour } = istClock(now());
      if (hour !== NIGHTLY_IST_HOUR) return;
      const due = await pool.query<{ workspace_id: string }>(
        `SELECT k.workspace_id
           FROM (SELECT workspace_id FROM search_item_chunks
                 UNION SELECT workspace_id FROM search_note_chunks
                 UNION SELECT workspace_id FROM sem_suggestions) k
           LEFT JOIN proj_workspaces w ON w.workspace_id = k.workspace_id
           LEFT JOIN sem_job_state s ON s.workspace_id = k.workspace_id
          WHERE (w.workspace_id IS NULL OR (w.deleted_at IS NULL AND NOT w.archived))
            AND (s.last_nightly_ist_date IS NULL OR s.last_nightly_ist_date < $1::date)
          ORDER BY k.workspace_id`,
        [date],
      );
      for (const { workspace_id: workspaceId } of due.rows) {
        await run(workspaceId);
        await pool.query(
          `INSERT INTO sem_job_state (workspace_id, last_nightly_ist_date) VALUES ($1, $2::date)
           ON CONFLICT (workspace_id) DO UPDATE SET last_nightly_ist_date = EXCLUDED.last_nightly_ist_date`,
          [workspaceId, date],
        );
      }
    } catch (error) {
      log(`suggestion scheduler tick failed: ${String(error)}`);
    }
  }
  const hourly = setInterval(() => {
    void tick();
  }, 60 * 60 * 1000);
  hourly.unref();
  return {
    change(workspaceId) {
      const count = (counts.get(workspaceId) ?? 0) + 1;
      counts.set(workspaceId, count);
      if (count < CHANGES_BEFORE_RUN) return;
      const existing = timers.get(workspaceId);
      if (existing !== undefined) clearTimeout(existing);
      const timer = setTimeout(() => {
        timers.delete(workspaceId);
        counts.set(workspaceId, 0);
        void run(workspaceId);
      }, CHANGE_DEBOUNCE_MS);
      timer.unref();
      timers.set(workspaceId, timer);
    },
    stop() {
      clearInterval(hourly);
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    },
    tick,
  };
}
