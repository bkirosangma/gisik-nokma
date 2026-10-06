import { DECISION_TYPE_ID, planSettle, settleEvents, SYSTEM_ACTOR_FLOW, type EventEnvelope, type FlowNode, type SubmittedEvent } from '@gisik-nokma/domain';
import type { Queryable } from '../db/queryable.js';
import type { AtomicOutcome } from '../ingest/ingest-service.js';
import { FLOW_SERVER_CAP } from './promote.js';
import { readFlow } from './read-flow.js';

/** The internal atomic door, narrowed to what the settler needs (Drafts T5b's `ingestAtomic`). `app.ts` passes `{ingestAtomic: deps.serverAtomic}`. */
export type FlowAtomicIngest = { ingestAtomic(events: SubmittedEvent[]): Promise<AtomicOutcome> };
export type SettleOutcome = 'applied' | 'empty' | 'blocked' | 'refused' | 'skipped';
export type FlowSettleDeps = {
  pool: Queryable; ingest: FlowAtomicIngest; log?: (message: string, error?: unknown) => void; plan?: typeof planSettle; now?: () => Date;
};

/** As the promoter's: a blocked or refused settle in production is a line on stderr, never silence. */
const logOf = (deps: { log?: (m: string, e?: unknown) => void }) => deps.log ?? ((message: string, error?: unknown) => console.error(message, error));

/** The Decision's latest choice, from the ledger: `closeStarted` is not folded into state (T5), and the event id and actor are the cause's. */
export async function latestDecided(db: Queryable, decisionId: string): Promise<{ eventId: string; actorId: string; closeStarted: string[] } | null> {
  const { rows } = await db.query<{ id: string; actor_id: string; payload: { closeStarted?: unknown } }>(
    `SELECT id, actor_id, payload FROM events WHERE entity_kind = 'ticket' AND entity_id = $1 AND type = 'ticket.decided' ORDER BY seq DESC LIMIT 1`,
    [decisionId],
  );
  const row = rows[0];
  if (row === undefined) return null;
  const cs = row.payload.closeStarted;
  return { eventId: row.id, actorId: row.actor_id, closeStarted: Array.isArray(cs) ? cs.filter((x): x is string => typeof x === 'string') : [] };
}

/**
 * Outcome and pass for the cause. A cleared Decision has `outcome` null and its last revision remembers what was cleared; a
 * Decision a loop released has `outcome` null and its last pass still holds the label it ran (T5's fold, PS-2).
 */
export function settleContext(node: FlowNode): { outcome: string; pass: number } | null {
  const last = node.passes.at(-1);
  if (last === undefined) return null;
  const outcome = node.outcome ?? last.revisions.at(-1)?.from ?? last.outcome;
  return outcome === null ? null : { outcome, pass: last.pass };
}

/**
 * One in-process chain per Decision. The listener fires for the `ticket.decided` and again for the finishing transition of
 * the same Decision, and a person can retry; each run plans AFTER the one before it has filed, so the second sees the first's
 * moves and plans nothing. Across processes the engine is the guard (a stale move is refused, and the sweep counts it).
 */
const chains = new Map<string, Promise<unknown>>();
function serialised<T>(key: string, work: () => Promise<T>): Promise<T> {
  const run = (chains.get(key) ?? Promise.resolve()).then(work, work);
  const tail = run.catch(() => undefined);
  chains.set(key, tail);
  void tail.then(() => {
    if (chains.get(key) === tail) chains.delete(key);
  });
  return run;
}

async function plannedFor(deps: Pick<FlowSettleDeps, 'pool' | 'plan'>, workspaceId: string, decisionId: string) {
  const flow = await readFlow(deps.pool, { workspaceId, seedId: decisionId, viewerId: null, cap: FLOW_SERVER_CAP });
  if (flow.truncated) return { kind: 'skipped' as const };
  const node = flow.nodes.find((n) => n.id === decisionId);
  const decided = await latestDecided(deps.pool, decisionId);
  const ctx = node === undefined ? null : settleContext(node);
  if (node === undefined || node.typeId !== DECISION_TYPE_ID || node.category !== 'terminal' || ctx === null || decided === null) return { kind: 'skipped' as const };
  const plan = (deps.plan ?? planSettle)({ nodes: flow.nodes, edges: flow.edges, decisionId, closeStarted: decided.closeStarted });
  return { kind: 'planned' as const, plan, ctx, decided };
}

/**
 * Plan the Decision's cascade from the world as it is NOW and file it as one atomic batch under the Flow actor (PS-9). Called by
 * the listener and by the sweep's settle half. Never throws: a failure is logged and answered `'refused'`.
 */
export function settleDecision(deps: FlowSettleDeps, workspaceId: string, decisionId: string): Promise<SettleOutcome> {
  return serialised(decisionId, async (): Promise<SettleOutcome> => {
    const log = logOf(deps);
    try {
      const p = await plannedFor(deps, workspaceId, decisionId);
      if (p.kind === 'skipped') return 'skipped';
      if (p.plan.blocked !== null) {
        log(`flow settle blocked for ${decisionId}: ${p.plan.blocked.reason} (${p.plan.blocked.ticketId})`);
        return 'blocked';
      }
      if (p.plan.steps.length === 0) return 'empty';
      const clientTime = (deps.now ?? (() => new Date()))().toISOString();
      const events = settleEvents(p.plan, {
        workspaceId, clientTime, decisionId, decisionEventId: p.decided.eventId, decidedBy: p.decided.actorId, outcome: p.ctx.outcome, pass: p.ctx.pass,
      });
      const outcome = await deps.ingest.ingestAtomic(events);
      if (outcome.status !== 'committed') {
        log(`flow settle refused for ${decisionId}: event ${outcome.index} ${JSON.stringify(outcome.result)}`);
        return 'refused';
      }
      return 'applied';
    } catch (error) {
      log(`flow settle failed for ${decisionId}`, error);
      return 'refused';
    }
  });
}

/** "Flow changes waiting" (PS-9): the plan still has work, or cannot be applied. Server-side data only; Part 3 draws it. */
export async function pendingSettle(db: Queryable, deps: { plan?: typeof planSettle }, workspaceId: string, decisionId: string): Promise<boolean> {
  const p = await plannedFor({ pool: db, ...deps }, workspaceId, decisionId);
  return p.kind === 'planned' && (p.plan.blocked !== null || p.plan.steps.length > 0);
}

/** One row read: is this ticket a Decision at all? Every other ticket's transition is answered without walking its flow. */
async function isDecisionTicket(db: Queryable, ticketId: string): Promise<boolean> {
  const { rows } = await db.query<{ type_id: string }>('SELECT type_id FROM proj_tickets WHERE ticket_id = $1', [ticketId]);
  return rows[0]?.type_id === DECISION_TYPE_ID;
}

export function createFlowSettler(deps: FlowSettleDeps): {
  onCommitted(event: EventEnvelope): Promise<void>;
  settleDecision(workspaceId: string, decisionId: string): Promise<SettleOutcome>;
} {
  return {
    settleDecision: (workspaceId, decisionId) => settleDecision(deps, workspaceId, decisionId),
    async onCommitted(event) {
      try {
        if (event.actorId === SYSTEM_ACTOR_FLOW || event.entity.kind !== 'ticket') return; // no re-entry: the cascade's own events never settle again
        if (event.type !== 'ticket.decided' && event.type !== 'ticket.transitioned') return;
        if (!(await isDecisionTicket(deps.pool, event.entity.id))) return;
        await settleDecision(deps, event.workspaceId, event.entity.id); // not terminal yet, or no choice: 'skipped'
      } catch (error) {
        logOf(deps)('flow settle listener failed', error);
      }
    },
  };
}
