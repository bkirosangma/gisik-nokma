import { istDayOf } from './ist-day.js';
import type { FlowAlternateRead, FlowAutoMoveRead, FlowEdgeRead, FlowNodeRead, FlowRead } from './read-models-flow.js';
import { branchOf, edgeKey, sameLabel, type FlowAnalysis, type FlowEdge, type FlowNode, type FlowPlan } from './flow/index.js';

/** What the server knows about a ticket that Part 2's `FlowNode` (a planning input) does not carry. */
export type FlowCardFacts = {
  key: string | null;
  title: string;
  projectId: string;
  stateName: string;
  /** The NAME of the workflow's first state (where Backlog's Start edge leads), for the sentence "Moves to To do when GN-150 closes". */
  initialStateName: string;
  assigneeId: string | null;
  assigneeName: string | null;
  /** The notes the VIEWER can see, newest first. */
  notes: Array<{ id: string; title: string }>;
  /** Counts for the pin (TG-11): visible notes, and attachments the viewer may know of. */
  pinNotes: number;
  pinAttachments: number;
};

export type FlowReadInput = {
  rootId: string;
  truncated: boolean;
  reached: number;
  nodes: readonly FlowNode[];
  edges: readonly FlowEdge[];
  /** `blocks` links with BOTH ends in the flow. */
  blocks: ReadonlyArray<{ sourceId: string; targetId: string }>;
  analysis: FlowAnalysis;
  plan: FlowPlan;
  facts: ReadonlyMap<string, FlowCardFacts>;
  autoMoves: readonly FlowAutoMoveRead[];
  draftCount: number;
};

/**
 * PS-7: for each Decision with two or more forward labelled edges, a ticket on EXACTLY ONE of its branches gets the other
 * branches as alternates, each naming that branch's first ticket. A ticket on none (the Decision itself, a ticket before it) or on
 * several (the shared tail of a diamond) gets nothing from that Decision.
 */
function alternatesFor(nodes: readonly FlowNode[], edges: readonly FlowEdge[], analysis: FlowAnalysis): Map<string, FlowAlternateRead[]> {
  const out = new Map<string, FlowAlternateRead[]>();
  const rank = new Map(analysis.order.map((id, i) => [id, i] as const));
  const decisions = nodes.filter((n) => n.isDecision).sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
  for (const d of decisions) {
    const forward = edges.filter((e) => e.sourceId === d.id && e.label !== null && !analysis.backEdges.has(edgeKey(e)));
    if (forward.length < 2) continue;
    const branches = forward.map((e) => ({ edge: e, members: branchOf(d.id, e.label!, edges, analysis) }));
    for (const node of nodes) {
      const on = branches.filter((b) => b.members.has(node.id));
      if (on.length !== 1) continue;
      const list = out.get(node.id) ?? [];
      for (const other of branches) {
        if (other === on[0]) continue;
        list.push({ viaDecisionId: d.id, outcome: other.edge.label!, firstTicketId: other.edge.targetId });
      }
      out.set(node.id, list);
    }
  }
  return out;
}

function edgeRead(edge: FlowEdge, byId: ReadonlyMap<string, FlowNode>, analysis: FlowAnalysis): FlowEdgeRead {
  const source = byId.get(edge.sourceId);
  const base = { id: edgeKey(edge), kind: 'leads_to' as const, from: edge.sourceId, to: edge.targetId, label: edge.label, loop: analysis.backEdges.has(edgeKey(edge)) };
  if (source === undefined || !source.isDecision || edge.label === null) return { ...base, taken: 0, takenPasses: [], chosen: null };
  // A pass took this edge when its FINAL outcome (a revision replaces it) is the edge's label.
  const takenPasses = source.passes.filter((p) => sameLabel(p.outcome, edge.label)).map((p) => p.pass);
  const chosen = source.outcome === null ? null : sameLabel(source.outcome, edge.label);
  return { ...base, taken: takenPasses.length, takenPasses, chosen };
}

/**
 * The Workflow graph's whole answer, from Part 2's pure pieces and the facts the server read. Pure: no clock, no database, so the
 * same input is the same bytes (the route is a thin shell around it, and the replica could call it too).
 * A Not-taken ticket's Decision is named only when that Decision is in `nodes`: for this viewer anything else is a hole (FL-1).
 */
export function buildFlowRead(input: FlowReadInput): FlowRead {
  const byId = new Map(input.nodes.map((n) => [n.id, n] as const));
  const alternates = alternatesFor(input.nodes, input.edges, input.analysis);
  const rank = new Map(input.analysis.order.map((id, i) => [id, i] as const));
  const ordered = [...input.nodes].sort((a, b) => (rank.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.id) ?? Number.MAX_SAFE_INTEGER));
  const nodes: FlowNodeRead[] = ordered.map((n) => {
    const facts = input.facts.get(n.id);
    if (facts === undefined) throw new Error(`buildFlowRead: no facts for ticket ${n.id}: the read must load every node it passes in`);
    const plan = input.plan.get(n.id);
    const first = n.periods[0];
    const last = n.periods[n.periods.length - 1];
    return {
      id: n.id,
      key: n.draft ? null : facts.key,
      draft: n.draft,
      title: facts.title,
      kind: n.isDecision ? 'decision' : 'ticket',
      typeId: n.typeId,
      parentId: n.parentId,
      projectId: facts.projectId,
      state: { id: n.stateId, name: facts.stateName, category: n.category },
      initialStateName: facts.initialStateName,
      assigneeId: facts.assigneeId,
      assigneeName: facts.assigneeName,
      dueDate: n.explicitDue,
      waitForAll: n.waitForAll,
      estimate: n.estimate,
      reworkEstimate: n.reworkEstimate,
      round: n.rounds,
      outcome: n.outcome,
      passes: n.passes,
      resolution: n.notTaken === null ? null : { ...n.notTaken, decisionTicketId: byId.has(n.notTaken.decisionTicketId) ? n.notTaken.decisionTicketId : null },
      alternates: alternates.get(n.id) ?? [],
      periods: n.periods.map((p) => ({ start: istDayOf(p.start), end: p.end === null ? null : istDayOf(p.end), pass: p.pass })),
      planned: (plan?.intervals ?? []).map((i) => ({ pass: i.pass, start: i.start, end: i.end, basis: i.basis, pruned: i.pruned === true })),
      actual: first === undefined || last === undefined ? null : { start: istDayOf(first.start), end: last.end === null ? null : istDayOf(last.end) },
      tray: plan?.unscheduled ?? null,
      notes: facts.notes,
      pin: { notes: facts.pinNotes, attachments: facts.pinAttachments },
    };
  });
  const flowEdges = input.edges.map((e) => edgeRead(e, byId, input.analysis));
  const blockEdges: FlowEdgeRead[] = input.blocks
    .filter((b) => byId.has(b.sourceId) && byId.has(b.targetId))
    .map((b) => ({ id: `${b.sourceId}~${b.targetId}`, kind: 'blocks', from: b.sourceId, to: b.targetId, label: null, loop: false, taken: 0, takenPasses: [], chosen: null }));
  return {
    flowId: [...byId.keys()].sort()[0] ?? input.rootId,
    rootId: input.rootId,
    truncated: input.truncated,
    reached: input.reached,
    start: [...input.analysis.starts],
    end: [...input.analysis.ends],
    order: [...input.analysis.order],
    nodes,
    edges: [...flowEdges, ...blockEdges],
    autoMoves: [...input.autoMoves],
    draftCount: input.draftCount,
  };
}
