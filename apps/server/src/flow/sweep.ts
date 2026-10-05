import { BACKLOG_STATE_ID } from '@gisik-nokma/domain';
import type { Queryable } from '../db/queryable.js';
import { LIVE_TICKET_WHERE } from '../read/visible-where.js';
import { promoteTargets, type FlowIngest } from './promote.js';

/**
 * The reconciling sweep (AP-5; contract decision 5). It exists for two losses the listener cannot prevent: events committed by the
 * backup daemon's own ingest never reach the server process's listeners, and a fire-and-forget promotion dies with its process.
 *
 * Modelled on `auto-close/sweep.ts`: the reserved actor, the internal door, refusals COUNTED rather than assumed away, and
 * idempotence by the ledger itself (a promoted ticket is no longer in Backlog, so a second run selects nothing and a stale
 * `led-to` is refused by the engine, `cause.led-to-not-backlog`). There is no cursor to resume.
 */
export type FlowSweepReport = { promoted: number; settled: number; refused: number };
export type FlowSweepDeps = { pool: Queryable; ingest: FlowIngest; now?: () => Date; log?: (message: string, error?: unknown) => void };

/** Five minutes, not the hour the other sweeps use: this is the only thing that moves a ticket after a daemon-filed event, and an hour-late promotion reads as broken. */
export const DEFAULT_FLOW_SWEEP_INTERVAL_MS = 300_000;

/**
 * `FLOW_SWEEP_INTERVAL_MS` as a number, read once at start-up (the daemon passes `process.env.FLOW_SWEEP_INTERVAL_MS`). Unset, empty and
 * whitespace-only all mean "use the default" (`Number('')` is 0, which `requirePositiveIntervalMs` would refuse for a value nobody set);
 * anything else is passed through and VALIDATED by `requirePositiveIntervalMs` on every `delayMs()` call, so a mistyped value fails
 * loudly by name instead of being clamped here. The shape of `ops/expired-sessions.ts`'s reader.
 */
export function flowSweepIntervalMs(raw: string | undefined): number {
  return Number(raw === undefined || raw.trim() === '' ? String(DEFAULT_FLOW_SWEEP_INTERVAL_MS) : raw);
}

/**
 * The settle half (PS-9) runs FIRST, so a Decision's cascade is applied before promotion reads the world (AP-4: "after the settle
 * cascade"). Task 16 replaces this body; until then there is nothing to settle and it reports zero.
 */
async function settleHalf(_deps: FlowSweepDeps): Promise<{ settled: number; refused: number }> {
  return { settled: 0, refused: 0 };
}

/**
 * A SUPERSET of the promotable tickets, in SQL: live, in Backlog, with an incoming `leads_to` from a live terminal source. The exact
 * rule (waitForAll, a Decision's label, not-taken sources, drafts) is `promotionsFor`'s, so a candidate it declines costs one read and
 * never an event. Draft and trashed targets never reach the rule: `LIVE_TICKET_WHERE` already carries
 * `t.draft_author_id IS NULL` (`read/visible-where.ts:256`), so this file names no Drafts column itself.
 */
async function promoteHalf(deps: FlowSweepDeps): Promise<{ promoted: number; refused: number }> {
  const { rows } = await deps.pool.query<{ workspace_id: string; ticket_id: string }>(
    `SELECT t.workspace_id, t.ticket_id
       FROM proj_tickets t
      WHERE t.state_id = $1 AND ${LIVE_TICKET_WHERE}
        AND EXISTS (SELECT 1 FROM proj_ticket_links l JOIN proj_tickets s ON s.ticket_id = l.source_id
                     WHERE l.target_id = t.ticket_id AND l.kind = 'leads_to'
                       AND s.state_category = 'terminal' AND s.deleted_at IS NULL)
      ORDER BY t.workspace_id, t.ticket_id`,
    [BACKLOG_STATE_ID],
  );
  const byWorkspace = new Map<string, string[]>();
  for (const row of rows) byWorkspace.set(row.workspace_id, [...(byWorkspace.get(row.workspace_id) ?? []), row.ticket_id]);
  let promoted = 0;
  let refused = 0;
  for (const [workspaceId, ids] of byWorkspace) {
    const report = await promoteTargets(deps, workspaceId, ids);
    promoted += report.promoted;
    refused += report.refused;
  }
  return { promoted, refused };
}

export async function runFlowSweep(deps: FlowSweepDeps): Promise<FlowSweepReport> {
  const settle = await settleHalf(deps);
  const promote = await promoteHalf(deps);
  return { promoted: promote.promoted, settled: settle.settled, refused: promote.refused + settle.refused };
}
