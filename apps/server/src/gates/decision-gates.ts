import { DECISION_TYPE_ID, planSettle, stateCategoryOf, SYSTEM_ACTOR_FLOW, type SettleBlockReason, type SubmittedEvent } from '@gisik-nokma/domain';
import type { Queryable } from '../db/queryable.js';
import { FLOW_SERVER_CAP } from '../flow/promote.js';
import { readFlow } from '../flow/read-flow.js';
import { latestDecided } from '../flow/settle.js';
import type { CanSeeFn } from '../notifications/fanout.js';
import { getTicketStateFromDb } from '../projections/tickets.js';
import { keysForAncestors } from '../read/ancestry.js';
import { fetchTicketRows, titleOf } from '../read/ticket-cards.js';
import { latestWorkflowDefs } from '../read/workflow-defs.js';
import { canSee } from '../visibility/can-see.js';
import type { GateRefusal, ServerGate } from './server-gate.js';

/**
 * The Decision gates (wtg2 T16, spec PS-9). The engine cannot see a whole flow, so two refusals about a person's choice are
 * server gates: `decision.bad-close-started` (the close list names a ticket outside this Decision's flow, DC-4) and
 * `decision.cascade-blocked` (the cascade the choice would file includes a move the engine would refuse). The cascade one
 * runs on the `ticket.decided` and on a Decision's own finishing transition, which makes a stored choice take effect.
 *
 * Every gate returns `null` FIRST for the Flow actor: a gate matches one event type, so the transition gate runs for every
 * transition, the cascade's own moves and T13's promotions included, and both are filed through the same gated door
 * (`ingestAtomic` and `ingestBatch` run the gates in `commitInTx`). Without the early return the gate would re-plan the
 * cascade that is being applied and refuse its own moves. Then the cheap type test, and only then a read.
 */
export const RULE_DECISION_BAD_CLOSE_STARTED = 'decision.bad-close-started';
export const RULE_DECISION_CASCADE_BLOCKED = 'decision.cascade-blocked';
/** `flowCap` is the server cap unless a test needs a flow that is cut short. */
export type DecisionGateOptions = { plan?: typeof planSettle; canSeeTicket?: CanSeeFn; flowCap?: number };

const isFlowActor = (event: SubmittedEvent): boolean => event.actorId === SYSTEM_ACTOR_FLOW;
const closeStartedOf = (payload: unknown): string[] => {
  const cs = (payload as { closeStarted?: unknown }).closeStarted;
  return Array.isArray(cs) ? cs.filter((x): x is string => typeof x === 'string') : [];
};
const flowOf = (db: Queryable, event: SubmittedEvent, opts: DecisionGateOptions) =>
  readFlow(db, { workspaceId: event.workspaceId, seedId: event.entity.id, viewerId: null, cap: opts.flowCap ?? FLOW_SERVER_CAP });

/** `ticket.decided` with a non-empty `closeStarted`: every id must be a ticket of THIS Decision's flow (DC-4). No ids in the reason. */
function closeStartedGate(opts: DecisionGateOptions): ServerGate {
  return {
    eventType: 'ticket.decided',
    async check(event, db): Promise<GateRefusal | null> {
      if (isFlowActor(event)) return null;
      const ids = closeStartedOf(event.payload);
      if (ids.length === 0) return null;
      const flow = await flowOf(db, event, opts);
      if (flow.truncated) return null; // a flow too large to judge is not refused for it; the settler skips it the same way
      const inFlow = new Set(flow.nodes.map((n) => n.id));
      return ids.every((id) => inFlow.has(id)) ? null : { rule: RULE_DECISION_BAD_CLOSE_STARTED, reason: 'Some of the tickets chosen to close are not part of this flow.' };
    },
  };
}

/**
 * The sentence for a stable block code (planner ruling 2026-10-04, Q14; spec PS-9 "the reason names the ticket"). Called only
 * when the filer can see the ticket; the caller substitutes the generic phrase otherwise (PS-6). A ticket with no key is named
 * by its title alone.
 */
export function cascadeBlockedReason(code: SettleBlockReason, t: { key: string | null; title: string }): string {
  const name = t.key === null ? t.title : `${t.key} ${t.title}`;
  switch (code) {
    case 'parent-finished':
      return `${name} would move back under a finished parent`;
    case 'child-open':
      return `${name} would be finished while a child of it stays open`;
    case 'outcome-has-no-branch':
      return `the outcome no longer has a branch (${name})`;
    case 'no-terminal-state':
      return `${name}'s workflow has no finished state to close it in`;
  }
}

/**
 * Key and title of a ticket the way the History route names a link target (`routes/ticket-history.ts`: `keysForAncestors` on
 * the row's project; no key composed here). The id comes from this workspace's own flow read, so the by-id fetch needs no
 * workspace clause.
 */
async function describeTicket(db: Queryable, workspaceId: string, ticketId: string): Promise<{ key: string | null; title: string }> {
  const [row] = await fetchTicketRows(db, [ticketId]);
  if (row === undefined) return { key: null, title: '' };
  const keys = await keysForAncestors(db, workspaceId, [{ ticketId, projectId: row.project_id }]);
  return { key: keys.get(ticketId) ?? null, title: titleOf(row) };
}

/**
 * Plan the cascade of the choice being made, against the world BEFORE it (`server-gate.ts`: a gate judges the claim), with the
 * Decision's node patched to the claimed state: finished, holding the claimed outcome. On the `ticket.decided` gate that judges
 * a choice made ahead of the finish as if it finished now (planner ruling 2026-10-06: the choose-time dialog refuses it the same
 * way, spec :519).
 */
async function cascadeRefusal(event: SubmittedEvent, db: Queryable, claim: { outcome: string | null; closeStarted: string[] }, opts: DecisionGateOptions): Promise<GateRefusal | null> {
  if (claim.outcome === null) return null; // a clear only returns Not-taken tickets; the settler logs a block it meets
  const flow = await flowOf(db, event, opts);
  if (flow.truncated) return null;
  const nodes = flow.nodes.map((n) => (n.id === event.entity.id ? { ...n, category: 'terminal' as const, outcome: claim.outcome } : n));
  const plan = (opts.plan ?? planSettle)({ nodes, edges: flow.edges, decisionId: event.entity.id, closeStarted: claim.closeStarted });
  if (plan.blocked === null) return null;
  const visible = await (opts.canSeeTicket ?? ((d, u, t) => canSee(d, u, t)))(db, event.actorId, plan.blocked.ticketId);
  const why = visible ? cascadeBlockedReason(plan.blocked.reason, await describeTicket(db, event.workspaceId, plan.blocked.ticketId)) : 'a step you cannot see is blocking it';
  return { rule: RULE_DECISION_CASCADE_BLOCKED, reason: `This choice cannot be applied: ${why}.` };
}

function cascadeOnDecidedGate(opts: DecisionGateOptions): ServerGate {
  return {
    eventType: 'ticket.decided',
    async check(event, db) {
      if (isFlowActor(event)) return null;
      const ticket = await getTicketStateFromDb(db, event.workspaceId, event.entity.id);
      if (ticket === null || ticket.typeId !== DECISION_TYPE_ID) return null;
      const outcome = (event.payload as { outcome?: unknown }).outcome;
      return cascadeRefusal(event, db, { outcome: typeof outcome === 'string' ? outcome : null, closeStarted: closeStartedOf(event.payload) }, opts);
    },
  };
}

/** A Decision's own finishing transition decides nothing by itself, but it makes a stored choice take effect: judge that cascade too. */
function cascadeOnTransitionGate(opts: DecisionGateOptions): ServerGate {
  return {
    eventType: 'ticket.transitioned',
    async check(event, db) {
      if (isFlowActor(event)) return null;
      const ticket = await getTicketStateFromDb(db, event.workspaceId, event.entity.id);
      if (ticket === null || ticket.typeId !== DECISION_TYPE_ID) return null;
      const to = (event.payload as { to?: unknown }).to;
      if (typeof to !== 'string' || ticket.outcome === undefined) return null; // finishing with no choice made settles nothing
      const defs = await latestWorkflowDefs(db, event.workspaceId, [ticket.workflowId]);
      const def = defs.get(ticket.workflowId);
      if (def === undefined || stateCategoryOf(def, to) !== 'terminal') return null;
      const decided = await latestDecided(db, event.entity.id);
      return cascadeRefusal(event, db, { outcome: ticket.outcome, closeStarted: decided?.closeStarted ?? [] }, opts);
    },
  };
}

export function makeDecisionGates(opts: DecisionGateOptions = {}): ServerGate[] {
  return [closeStartedGate(opts), cascadeOnDecidedGate(opts), cascadeOnTransitionGate(opts)];
}
