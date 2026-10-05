import { BACKLOG_STATE_ID } from '../workflow.js';
import { analyzeFlow } from './analysis.js';
import { effectiveEdges, sameLabel } from './graph.js';
import { edgeKey, type FlowEdge, type FlowNode } from './types.js';

/** AP-1 to AP-3. Pure and clock-free: the server (promoter, sweep) is its only caller (AP-5). */
export type Promotion = { targetId: string; sourceTicketId: string; label: string | null };

/**
 * An edge is satisfied by the source's CATEGORY, never its `closed` flag (spec decision 1: the flag is set days later by the
 * auto-close sweep). A Decision satisfies only the edge whose label is its CURRENT outcome; a loop reset leaves it null.
 */
function satisfied(source: FlowNode, edge: FlowEdge): boolean {
  if (source.category !== 'terminal' || source.notTaken !== null) return false;
  if (!source.isDecision) return true;
  return source.outcome !== null && edge.label !== null && sameLabel(source.outcome, edge.label);
}

type Incoming = { edge: FlowEdge; node: FlowNode };
const finishedAt = (n: FlowNode): string => n.periods.at(-1)?.end ?? '';

export function promotionsFor(input: { nodes: FlowNode[]; edges: FlowEdge[]; targetIds: readonly string[] }): Promotion[] {
  const byId = new Map(input.nodes.map((n) => [n.id, n] as const));
  const analysis = analyzeFlow(input.nodes, input.edges);
  const inEffective = new Set(effectiveEdges(input.nodes, input.edges).map(edgeKey));
  const out: Promotion[] = [];
  for (const targetId of [...new Set(input.targetIds)].sort()) {
    const target = byId.get(targetId);
    if (target === undefined || target.stateId !== BACKLOG_STATE_ID || target.trashed || target.draft) continue;
    // I(T): incoming edges from live, published sources. A hidden source is present here on purpose (the read ignores visibility).
    const incoming: Incoming[] = [];
    for (const edge of input.edges) {
      const node = byId.get(edge.sourceId);
      if (edge.targetId === targetId && node !== undefined && !node.trashed && !node.draft) incoming.push({ edge, node });
    }
    incoming.sort((a, b) => (a.edge.sourceId < b.edge.sourceId ? -1 : a.edge.sourceId > b.edge.sourceId ? 1 : 0));
    if (incoming.length === 0) continue;

    let considered: Incoming[];
    if (target.waitForAll) {
      const forward = incoming.filter((i) => !analysis.backEdges.has(edgeKey(i.edge)));
      const base = forward.length > 0 ? forward : incoming; // I′, or I(T) when only back edges remain
      considered = base.filter((i) => inEffective.has(edgeKey(i.edge)) && i.node.notTaken === null); // I*
      if (considered.length === 0 || !considered.every((i) => satisfied(i.node, i.edge))) continue;
    } else {
      considered = incoming.filter((i) => satisfied(i.node, i.edge));
      if (considered.length === 0) continue;
    }
    // The source that just completed the condition: the latest finisher; `incoming` is id-sorted, so a tie keeps the smaller id.
    const pick = considered.reduce((best, cur) => (finishedAt(cur.node) > finishedAt(best.node) ? cur : best));
    out.push({ targetId, sourceTicketId: pick.edge.sourceId, label: pick.edge.label });
  }
  return out;
}
