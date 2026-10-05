import type { SubmittedEvent } from '../envelope.js';
import { newUlid } from '../ids.js';
import { SYSTEM_ACTOR_FLOW } from '../system-actors.js';
import { BACKLOG_STATE_ID } from '../workflow.js';
import { analyzeFlow } from './analysis.js';
import type { FlowCause } from './causes.js';
import { branchOf, liveSet, loopBody, sameLabel } from './graph.js';
import { edgeKey, type FlowEdge, type FlowNode } from './types.js';

export type ProposedEvent = SubmittedEvent;

/** One move of a settle cascade. A reopen and the transition that follows it are two steps, in that order. */
export type SettleStep =
  | { kind: 'reopen'; ticketId: string }
  | { kind: 'to-initial'; ticketId: string; toStateId: string }
  | { kind: 'to-backlog'; ticketId: string; toStateId: typeof BACKLOG_STATE_ID }
  | { kind: 'not-taken-transition'; ticketId: string; toStateId: string }
  | { kind: 'not-taken-close'; ticketId: string };

/** Why the engine would refuse the cascade (PS-9). Stable codes; the gate turns them into sentences with keys. */
export type SettleBlockReason =
  | 'parent-finished' // a ticket would leave a finished state under a finished parent (transition.ts:185-205)
  | 'child-open' // a ticket would be finished over a child that stays open (transition.ts:152-164)
  | 'outcome-has-no-branch' // the outcome names a label with no edge any more
  | 'no-terminal-state'; // the workflow has no terminal state to park a Not-taken ticket in

export type SettlePlan = {
  steps: SettleStep[];
  /** A move the engine would refuse. The plan is refused whole: `steps` is empty. */
  blocked: { ticketId: string; reason: SettleBlockReason } | null;
  /** Started tickets on a branch that left the live set, not named in `closeStarted`: they need a person's choice. */
  started: string[];
  /** True when any step moves a ticket other than the Decision itself. */
  touchesOthers: boolean;
};

const NOTHING: SettlePlan = { steps: [], blocked: null, started: [], touchesOthers: false };
const blockedPlan = (ticketId: string, reason: SettleBlockReason): SettlePlan => ({ steps: [], blocked: { ticketId, reason }, started: [], touchesOthers: false });

/**
 * PS-4 to PS-6: what choosing, revising or clearing a Decision's outcome does to the rest of its flow.
 * Pure and clock-free; a function of the CURRENT node states only, so running it on the states it
 * produced gives an empty plan (a settle that arrives twice moves nothing the second time).
 *
 * - Unsettled Decision (no outcome): only the reopen to Backlog of the live tickets that carry a
 *   Not-taken close caused by THIS Decision.
 * - An outcome on a Decision that is not terminal: nothing (the cascade waits for the finish).
 * - Loop outcome (the label's edge is a back edge): the target is reopened and sent to its initial
 *   state when it is finished; every other ticket of the loop body, the Decision included, goes to
 *   Backlog; this Decision's own Not-taken tickets return to Backlog; nothing is pruned.
 * - Any other outcome: the tickets on the Decision's other branches that are not in the new live set
 *   are closed "Not taken" (children first) unless started or finished; live tickets that carry a
 *   Not-taken close are reopened to Backlog; started tickets on a left branch are untouched unless
 *   named in `closeStarted` and are returned in `started` so the caller can ask.
 * Drafts and trashed tickets are never moved.
 */
export function planSettle(input: {
  nodes: readonly FlowNode[];
  edges: readonly FlowEdge[];
  decisionId: string;
  closeStarted?: readonly string[];
}): SettlePlan {
  const { nodes, edges, decisionId } = input;
  const byId = new Map(nodes.map((n) => [n.id, n] as const));
  const d = byId.get(decisionId);
  if (d === undefined || !d.isDecision) return NOTHING;
  if (d.outcome !== null && d.category !== 'terminal') return NOTHING;

  const analysis = analyzeFlow(nodes, edges);
  const flowRank = new Map(analysis.order.map((id, i) => [id, i] as const));
  const depth = (n: FlowNode): number => {
    let hops = 0;
    for (let at = n.parentId === null ? undefined : byId.get(n.parentId); at !== undefined && hops <= nodes.length; at = at.parentId === null ? undefined : byId.get(at.parentId)) hops += 1;
    return hops;
  };
  const byFlowOrder = (a: FlowNode, b: FlowNode): number => (flowRank.get(a.id) ?? 0) - (flowRank.get(b.id) ?? 0);
  const movable = (n: FlowNode): boolean => !n.draft && !n.trashed;
  const parentOf = (n: FlowNode): FlowNode | undefined => (n.parentId === null ? undefined : byId.get(n.parentId));
  const reset = (ofOutcome: string | null): FlowNode[] => nodes.map((n) => (n.id === d.id ? { ...n, outcome: ofOutcome } : n));

  /** Reopen (when the closed flag is set) then a transition, for a ticket that leaves its finished or running state. */
  const leave = (n: FlowNode, to: SettleStep & { kind: 'to-initial' | 'to-backlog' }): SettleStep[] => (n.closed ? [{ kind: 'reopen', ticketId: n.id }, to] : [to]);
  /** PS-9: a ticket may not leave a finished state under a finished parent unless the parent leaves first. */
  const leavesUnderFinishedParent = (moved: readonly FlowNode[]): FlowNode | undefined => {
    const leaving = new Set(moved.filter((n) => n.category === 'terminal').map((n) => n.id));
    return moved.find((n) => {
      if (n.category !== 'terminal') return false;
      const parent = parentOf(n);
      return parent !== undefined && parent.category === 'terminal' && !leaving.has(parent.id);
    });
  };
  const parentsFirst = (a: FlowNode, b: FlowNode): number => depth(a) - depth(b) || byFlowOrder(a, b);
  const childrenFirst = (a: FlowNode, b: FlowNode): number => depth(b) - depth(a) || byFlowOrder(a, b);
  const finish = (steps: SettleStep[], started: string[]): SettlePlan => ({
    steps,
    blocked: null,
    started,
    touchesOthers: steps.some((s) => s.ticketId !== d.id),
  });
  const ownNotTaken = (live: ReadonlySet<string>): FlowNode[] =>
    nodes.filter((n) => movable(n) && n.notTaken?.decisionTicketId === d.id && live.has(n.id));

  // Unsettled: cleared, or released by a loop reset.
  if (d.outcome === null) {
    const reopened = ownNotTaken(liveSet(nodes, edges, analysis)).sort(parentsFirst);
    const stuck = leavesUnderFinishedParent(reopened);
    if (stuck !== undefined) return blockedPlan(stuck.id, 'parent-finished');
    return finish(reopened.flatMap((n) => leave(n, { kind: 'to-backlog', ticketId: n.id, toStateId: BACKLOG_STATE_ID })), []);
  }

  const chosen = edges.find((e) => e.sourceId === d.id && sameLabel(e.label, d.outcome));
  if (chosen === undefined) return blockedPlan(d.id, 'outcome-has-no-branch');

  // Loop outcome (PS-4).
  if (analysis.backEdges.has(edgeKey(chosen))) {
    const body = [...loopBody(chosen, edges, analysis)].map((id) => byId.get(id)).filter((n): n is FlowNode => n !== undefined && movable(n));
    const moved: Array<{ node: FlowNode; to: 'to-initial' | 'to-backlog' }> = [];
    for (const n of body) {
      if (n.id === chosen.targetId) {
        if (n.category === 'terminal') moved.push({ node: n, to: 'to-initial' });
      } else if (n.stateId !== BACKLOG_STATE_ID) {
        moved.push({ node: n, to: 'to-backlog' });
      }
    }
    const inBody = new Set(moved.map((m) => m.node.id));
    for (const n of ownNotTaken(liveSet(reset(null), edges, analysis))) {
      if (!inBody.has(n.id)) moved.push({ node: n, to: 'to-backlog' });
    }
    moved.sort((a, b) => parentsFirst(a.node, b.node));
    const stuck = leavesUnderFinishedParent(moved.map((m) => m.node));
    if (stuck !== undefined) return blockedPlan(stuck.id, 'parent-finished');
    return finish(
      moved.flatMap(({ node, to }) =>
        leave(node, to === 'to-initial' ? { kind: 'to-initial', ticketId: node.id, toStateId: node.initialStateId } : { kind: 'to-backlog', ticketId: node.id, toStateId: BACKLOG_STATE_ID }),
      ),
      [],
    );
  }

  // Any other outcome (PS-5).
  const live = liveSet(nodes, edges, analysis);
  const named = new Set(input.closeStarted ?? []);
  const left = new Set<string>();
  for (const e of edges) {
    if (e.sourceId !== d.id || sameLabel(e.label, d.outcome) || analysis.backEdges.has(edgeKey(e))) continue;
    for (const id of branchOf(d.id, e.label, edges, analysis)) left.add(id);
  }
  const closing = new Set<string>();
  const waiting: string[] = [];
  for (const id of [...left].sort((a, b) => (flowRank.get(a) ?? 0) - (flowRank.get(b) ?? 0))) {
    const n = byId.get(id);
    if (n === undefined || n.id === d.id || !movable(n) || live.has(id) || n.notTaken !== null || n.category === 'terminal') continue;
    if (n.started && !named.has(id)) waiting.push(id);
    else closing.add(id);
  }
  // PS-5.1: the children of a ticket that closes close first, by the same rule; one that cannot is a block.
  const childrenOf = new Map<string, FlowNode[]>();
  for (const n of nodes) if (n.parentId !== null) childrenOf.set(n.parentId, [...(childrenOf.get(n.parentId) ?? []), n]);
  const queue = [...closing];
  for (let i = 0; i < queue.length; i += 1) {
    const parentId = queue[i] as string;
    for (const child of childrenOf.get(parentId) ?? []) {
      if (child.category === 'terminal' || closing.has(child.id)) continue;
      if (!movable(child) || live.has(child.id) || (child.started && !named.has(child.id))) return blockedPlan(parentId, 'child-open');
      closing.add(child.id);
      queue.push(child.id);
    }
  }
  const closes = [...closing].map((id) => byId.get(id)).filter((n): n is FlowNode => n !== undefined).sort(childrenFirst);
  if (closes.length > 0 && closes.some((n) => n.firstTerminalStateId === null)) {
    return blockedPlan((closes.find((n) => n.firstTerminalStateId === null) as FlowNode).id, 'no-terminal-state');
  }
  const reopened = nodes.filter((n) => movable(n) && live.has(n.id) && n.notTaken !== null).sort(parentsFirst);
  const stuck = leavesUnderFinishedParent(reopened);
  if (stuck !== undefined) return blockedPlan(stuck.id, 'parent-finished');
  const steps: SettleStep[] = [
    ...reopened.flatMap((n) => leave(n, { kind: 'to-backlog', ticketId: n.id, toStateId: BACKLOG_STATE_ID })),
    ...closes.flatMap((n): SettleStep[] => [
      { kind: 'not-taken-transition', ticketId: n.id, toStateId: n.firstTerminalStateId as string },
      { kind: 'not-taken-close', ticketId: n.id },
    ]),
  ];
  return finish(steps, waiting);
}

/** What `settleEvents` needs beyond the plan: who decided what, when, and in which workspace. */
export type SettleContext = {
  workspaceId: string;
  decisionId: string;
  /** The `ticket.decided` (or finishing transition) event that caused this cascade; goes into every cause. */
  decisionEventId: string;
  decidedBy: string;
  /** The label the cause names: the chosen one, or on a clear the label that was cleared. */
  outcome: string;
  pass: number;
  /**
   * ISO instant stamped on every event as its `clientTime`; passed in so this module reads no clock for any value a
   * reader sees. The ids aside: the default `mintId` is `newUlid`, whose ULID carries the minting time (`ids.ts`).
   */
  clientTime: string;
  /** Event id source; defaults to `newUlid` (a time-stamped ULID). Tests pass a counter. */
  mintId?: () => string;
};

/**
 * The real events of a plan, in step order, filed as the reserved flow actor with `origin: 'server'`.
 * Loop and reopen steps carry `reopened-by-flow`; Not-taken steps carry `branch-not-taken`. The order
 * of the plan is the order of submission: reopens come before the transition that needs them,
 * parents before children when leaving a finished state, children before parents when closing.
 */
export function settleEvents(plan: SettlePlan, ctx: SettleContext): ProposedEvent[] {
  const mint = ctx.mintId ?? newUlid;
  const cause = (kind: 'reopened-by-flow' | 'branch-not-taken'): FlowCause => ({
    kind,
    decisionTicketId: ctx.decisionId,
    outcome: ctx.outcome,
    pass: ctx.pass,
    decidedBy: ctx.decidedBy,
    decisionEventId: ctx.decisionEventId,
  });
  return plan.steps.map((step): ProposedEvent => {
    const [type, payload] = ((): [string, unknown] => {
      switch (step.kind) {
        case 'reopen':
          return ['ticket.reopened', { cause: cause('reopened-by-flow') }];
        case 'to-initial':
        case 'to-backlog':
          return ['ticket.transitioned', { to: step.toStateId, cause: cause('reopened-by-flow') }];
        case 'not-taken-transition':
          return ['ticket.transitioned', { to: step.toStateId, cause: cause('branch-not-taken') }];
        case 'not-taken-close':
          return ['ticket.closed', { cause: cause('branch-not-taken') }];
      }
    })();
    return {
      id: mint(),
      workspaceId: ctx.workspaceId,
      entity: { kind: 'ticket', id: step.ticketId },
      type,
      version: 1,
      payload,
      actorId: SYSTEM_ACTOR_FLOW,
      origin: 'server',
      clientTime: ctx.clientTime,
    };
  });
}
