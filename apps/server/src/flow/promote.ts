import {
  BACKLOG_STATE_ID, isFlowCause, newUlid, promotionsFor, SYSTEM_ACTOR_FLOW,
  type EventEnvelope, type IngestResult, type SubmittedEvent,
} from '@gisik-nokma/domain';
import type { Queryable } from '../db/queryable.js';
import { LIVE_TICKET_WHERE } from '../read/visible-where.js';
import { latestWorkflowDefs } from '../read/workflow-defs.js';
import { readFlow } from './read-flow.js';

/** The internal door, narrowed to what the flow needs. The whole `IngestService` satisfies it; `app.ts` passes `{ingestBatch: deps.serverAppend}`. */
export type FlowIngest = { ingestBatch(events: SubmittedEvent[]): Promise<IngestResult[]> };
/** Above the UI's 300 (FL-2): a server read that is cut short cannot tell a back edge from a forward one, so it must not decide. */
export const FLOW_SERVER_CAP = 2000;

export type FlowPromoteDeps = {
  pool: Queryable; ingest: FlowIngest; now?: () => Date; flowCap?: number;
  log?: (message: string, error?: unknown) => void;
};
export type PromoteReport = { promoted: number; refused: number; skipped: number };

const logOf = (deps: { log?: (m: string, e?: unknown) => void }) => deps.log ?? ((message: string, error?: unknown) => console.error(message, error));

/** The person behind a source finishing: the actor of its latest transition; a flow-filed transition names its own cause's person; none, the flow actor. */
export async function triggeredByOf(db: Queryable, sourceTicketId: string): Promise<string> {
  const { rows } = await db.query<{ actor_id: string; cause: unknown }>(
    `SELECT e.actor_id, e.payload->'cause' AS cause FROM events e
      WHERE e.entity_kind = 'ticket' AND e.entity_id = $1 AND e.type = 'ticket.transitioned'
      ORDER BY e.seq DESC LIMIT 1`, [sourceTicketId]);
  const row = rows[0];
  if (row === undefined) return SYSTEM_ACTOR_FLOW;
  if (row.actor_id !== SYSTEM_ACTOR_FLOW) return row.actor_id;
  if (!isFlowCause(row.cause)) return SYSTEM_ACTOR_FLOW;
  return row.cause.kind === 'led-to' ? row.cause.triggeredBy : row.cause.decidedBy;
}

/** AP-1: a workflow whose initial state is terminal would be finished by the Start edge. `FlowNode` carries no category for it, so ask the definitions. */
async function terminalInitial(db: Queryable, workspaceId: string, ids: string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const { rows } = await db.query<{ ticket_id: string; workflow_id: string }>(
    'SELECT ticket_id, workflow_id FROM proj_tickets WHERE workspace_id = $1 AND ticket_id = ANY($2::text[])', [workspaceId, ids]);
  const defs = await latestWorkflowDefs(db, workspaceId, rows.map((r) => r.workflow_id));
  const out = new Set<string>();
  for (const r of rows) {
    const def = defs.get(r.workflow_id);
    if (def?.states.find((s) => s.id === def.initialStateId)?.category === 'terminal') out.add(r.ticket_id);
  }
  return out;
}

/**
 * Evaluate `targetIds` and file what is due. The ONE promotion path: the listener (AP-5) and the sweep (T14) call it.
 * Each flow component is read once, and filed as one batch. A flow cut short by the cap is skipped, counted and logged (it is
 * not half-evaluated); a target the read does not return (trashed, a draft) has nothing to promote and is not counted.
 */
export async function promoteTargets(deps: FlowPromoteDeps, workspaceId: string, targetIds: readonly string[]): Promise<PromoteReport> {
  const log = logOf(deps);
  const report: PromoteReport = { promoted: 0, refused: 0, skipped: 0 };
  const clientTime = (deps.now === undefined ? new Date() : deps.now()).toISOString();
  const covered = new Set<string>();
  for (const seed of [...new Set(targetIds)].sort()) {
    if (covered.has(seed)) continue;
    covered.add(seed);
    const flow = await readFlow(deps.pool, { workspaceId, seedId: seed, viewerId: null, cap: deps.flowCap ?? FLOW_SERVER_CAP });
    for (const n of flow.nodes) covered.add(n.id);
    if (flow.truncated) {
      report.skipped += 1;
      log(`flow promotion skipped: the flow around ticket ${seed} is truncated at ${deps.flowCap ?? FLOW_SERVER_CAP} tickets`);
      continue;
    }
    const inFlow = new Set(flow.nodes.map((n) => n.id));
    const promotions = promotionsFor({ nodes: flow.nodes, edges: flow.edges, targetIds: targetIds.filter((id) => inFlow.has(id)) });
    const blocked = await terminalInitial(deps.pool, workspaceId, promotions.map((p) => p.targetId));
    const events: SubmittedEvent[] = [];
    for (const p of promotions) {
      const node = flow.nodes.find((n) => n.id === p.targetId)!;
      if (blocked.has(p.targetId)) {
        report.skipped += 1;
        log(`flow promotion skipped for ticket ${p.targetId}: the initial state ${node.initialStateId} of its workflow is terminal`);
        continue;
      }
      events.push({
        id: newUlid(), workspaceId, entity: { kind: 'ticket', id: p.targetId }, type: 'ticket.transitioned', version: 1,
        payload: { to: node.initialStateId, cause: { kind: 'led-to', sourceTicketId: p.sourceTicketId, ...(p.label === null ? {} : { label: p.label }), triggeredBy: await triggeredByOf(deps.pool, p.sourceTicketId) } },
        actorId: SYSTEM_ACTOR_FLOW, origin: 'server', clientTime,
      });
    }
    if (events.length === 0) continue;
    const results = await deps.ingest.ingestBatch(events);
    for (const [i, result] of results.entries()) {
      if (result.status === 'committed') { report.promoted += 1; continue; }
      report.refused += 1; // copy of auto-close/sweep.ts:261-284: refused is expected (the world moved), invalid is a defect
      const ticketId = events[i]?.entity.id ?? 'unknown';
      if (result.status === 'refused') log(`flow promotion refused for ticket ${ticketId}: ${result.rule}: ${result.reason}`);
      else log(`flow promotion produced an INVALID envelope for ticket ${ticketId}: ${result.code}: ${result.message}`, result);
    }
  }
  return report;
}

/** The source-side events (AP-4): each can change whether an edge out of the ticket is satisfied, so its `leads_to` targets are re-read. */
const SOURCE_SIDE = new Set(['ticket.transitioned', 'ticket.decided', 'ticket.closed', 'ticket.reopened', 'ticket.deleted', 'ticket.restored']);

/** Which Backlog tickets does this committed event make worth re-evaluating? Only live Backlog tickets are ever promotable, so the query filters on both. */
export async function retargetsOf(db: Queryable, event: EventEnvelope): Promise<string[]> {
  if (event.entity.kind !== 'ticket') return [];
  const payload = (event.payload ?? {}) as Record<string, unknown>;
  const own: string[] = [];
  const outgoing = SOURCE_SIDE.has(event.type);
  if (event.type === 'ticket.restored') own.push(event.entity.id);
  if (event.type === 'ticket.published') own.push(event.entity.id);
  // A person's Send to backlog is not a trigger; a flow-caused move into Backlog is, for the moved ticket itself (a loop or
  // pass-2 settle sends a ticket back, and the Decision's satisfied edge must promote it without waiting for the sweep).
  if (event.type === 'ticket.transitioned' && event.actorId === SYSTEM_ACTOR_FLOW && payload['to'] === BACKLOG_STATE_ID && isFlowCause(payload['cause'])) own.push(event.entity.id);
  // A draft-side link (`from`, drafts R42) is filed on the draft's stream and promotes nothing: its target is a draft.
  if ((event.type === 'ticket.link_added' || event.type === 'ticket.link_removed') && payload['kind'] === 'leads_to' && payload['from'] === undefined && typeof payload['targetId'] === 'string') own.push(payload['targetId']);
  if (event.type === 'ticket.field_set' && payload['fieldId'] === 'waitForAll') own.push(event.entity.id);
  if (own.length === 0 && !outgoing) return [];
  const { rows } = await db.query<{ ticket_id: string }>(
    `SELECT t.ticket_id FROM proj_tickets t
      WHERE t.workspace_id = $1 AND t.state_id = $2 AND ${LIVE_TICKET_WHERE}
        AND (t.ticket_id = ANY($3::text[])
             OR ($4::boolean AND EXISTS (SELECT 1 FROM proj_ticket_links l WHERE l.source_id = $5 AND l.target_id = t.ticket_id AND l.kind = 'leads_to')))
      ORDER BY t.ticket_id`,
    [event.workspaceId, BACKLOG_STATE_ID, own, outgoing, event.entity.id]);
  return rows.map((r) => r.ticket_id);
}

export function createFlowPromoter(deps: FlowPromoteDeps): { onCommitted(event: EventEnvelope): Promise<void> } {
  const log = logOf(deps);
  return {
    /** Never rejects: it runs fire-and-forget after a commit (AP-5), like `notifications/fanout.ts:376`. */
    async onCommitted(event) {
      try {
        const targets = await retargetsOf(deps.pool, event);
        if (targets.length > 0) await promoteTargets(deps, event.workspaceId, targets);
      } catch (error) {
        log(`flow promotion failed for event ${event.id}`, error);
      }
    },
  };
}
