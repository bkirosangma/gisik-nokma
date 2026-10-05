import { builtinTicketTypeDefs, DECISION_TYPE_ID, newUlid, SYSTEM_ACTOR_FLOW } from '@gisik-nokma/domain';
import type { Queryable } from '../db/queryable.js';
import type { IngestService } from '../ingest/ingest-service.js';
import { requirePositiveIntervalMs } from '../ops/schedule.js';

/** The type whose workflow the Decision type is bound to (DC-3: "the workflow of its `task` type"). */
const BINDING_TYPE_ID = 'task';
const BATCH_SIZE = 100;
const DEFAULT_INTERVAL_MS = 86_400_000;
export const DECISION_BACKFILL_BOOT_DELAY_MS = 30_000;

export type DecisionBackfillCandidate = { workspaceId: string; workflowId: string };
export type DecisionBackfillReport = {
  /** Live workspaces with a task type and no decision type. */
  candidates: number;
  /** Definitions the door committed. */
  defined: number;
  /** Candidates the door did not commit (refused OR invalid), each logged. */
  refused: number;
  /** Workspaces that already have a decision type (the seed, a previous run, or an owner's custom type): adopted, never redefined. */
  alreadyHad: number;
};
export type DecisionBackfillDeps = {
  pool: Queryable;
  ingest: Pick<IngestService, 'ingestBatch'>;
  now?: () => Date;
  log?: (message: string, error?: unknown) => void;
};

/**
 * The workspaces that still lack the Decision type. The SELECT mirrors every reason the job must not write: a
 * deleted or purge-marked workspace is excluded (the ledger is append-only; an event in a workspace about to be
 * erased is unreadable), and a workspace with no `task` type has no workflow to bind to.
 */
export async function findDecisionBackfillCandidates(pool: Queryable): Promise<DecisionBackfillCandidate[]> {
  const { rows } = await pool.query<{ workspace_id: string; workflow_id: string }>(
    `SELECT t.workspace_id, t.workflow_id
       FROM proj_ticket_types t
      WHERE t.type_id = $2
        AND NOT EXISTS (SELECT 1 FROM proj_ticket_types d WHERE d.workspace_id = t.workspace_id AND d.type_id = $1)
        AND NOT EXISTS (SELECT 1 FROM proj_workspaces w
                         WHERE w.workspace_id = t.workspace_id
                           AND (w.deleted_at IS NOT NULL OR w.purge_marked_at IS NOT NULL))
      ORDER BY t.workspace_id`,
    [DECISION_TYPE_ID, BINDING_TYPE_ID],
  );
  return rows.map((row) => ({ workspaceId: row.workspace_id, workflowId: row.workflow_id }));
}

export async function backfillDecisionType(deps: DecisionBackfillDeps): Promise<DecisionBackfillReport> {
  const log = deps.log ?? ((message: string, error?: unknown) => console.error(message, error));
  const clientTime = (deps.now === undefined ? new Date() : deps.now()).toISOString();
  const candidates = await findDecisionBackfillCandidates(deps.pool);
  const had = await deps.pool.query<{ n: number }>(
    'SELECT count(DISTINCT workspace_id)::int AS n FROM proj_ticket_types WHERE type_id = $1',
    [DECISION_TYPE_ID],
  );
  const report: DecisionBackfillReport = { candidates: candidates.length, defined: 0, refused: 0, alreadyHad: had.rows[0]?.n ?? 0 };
  if (candidates.length === 0) return report;

  for (let start = 0; start < candidates.length; start += BATCH_SIZE) {
    const batch = candidates.slice(start, start + BATCH_SIZE);
    const events = batch.map(({ workspaceId, workflowId }) => {
      // The definition comes from the SEED, never retyped here: a rank or icon spelled twice is two places to disagree.
      const def = builtinTicketTypeDefs(workflowId).find((candidate) => candidate.id === DECISION_TYPE_ID);
      if (def === undefined) throw new Error(`decision backfill: builtinTicketTypeDefs carries no '${DECISION_TYPE_ID}' seed (T5 of the wtg-part2-model plan adds it)`);
      return {
        id: newUlid(), workspaceId,
        // A fresh entity id per definition, as the founding sequence files each type (bootstrap-workspace.ts:87-89).
        entity: { kind: 'ticket-type', id: newUlid() },
        type: 'ticket-type.defined', version: 1, payload: def,
        actorId: SYSTEM_ACTOR_FLOW, origin: 'server', clientTime,
      };
    });
    const results = await deps.ingest.ingestBatch(events);
    for (const [index, result] of results.entries()) {
      if (result.status === 'committed') { report.defined += 1; continue; }
      report.refused += 1;
      const workspaceId = batch[index]?.workspaceId ?? 'unknown';
      if (result.status === 'refused') log(`decision backfill refused for workspace ${workspaceId}: ${result.rule}: ${result.reason}`);
      else log(`decision backfill produced an INVALID envelope for workspace ${workspaceId}: ${result.code}: ${result.message}`, result);
    }
  }
  return report;
}

/** Empty means unset (App Platform resolves an unset variable to ''); anything else is validated by `requirePositiveIntervalMs` on every call. Sibling: `expired-sessions.ts:22`. */
export function decisionBackfillIntervalMs(env: { DECISION_BACKFILL_INTERVAL_MS?: string | undefined }): number {
  const raw = env.DECISION_BACKFILL_INTERVAL_MS;
  return Number(raw === undefined || raw.trim() === '' ? String(DEFAULT_INTERVAL_MS) : raw);
}

/** `startScheduler` calls `delayMs()` once up front and then again at every re-arm, so the first call is the boot delay. */
export function firstThenEvery(everyMs: number, bootMs: number): () => number {
  let first = true;
  return () => {
    const every = requirePositiveIntervalMs(everyMs, 'DECISION_BACKFILL_INTERVAL_MS');
    if (first) { first = false; return Math.min(bootMs, every); }
    return every;
  };
}
