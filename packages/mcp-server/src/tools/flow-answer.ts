import type { Session } from '../session.js';
import { FLOW_PATH, flowWireSchema, parseWire, type FlowWire } from './flow-seams.js';
import { readOrNotFound } from './reads.js';

/** The flow route's answer, parsed (`parseWire` says which member is wrong and that it is a server mismatch). */
export async function readFlow(session: Session, workspaceId: string, ticketId: string): Promise<FlowWire> {
  return parseWire(flowWireSchema, await readOrNotFound(session, FLOW_PATH(workspaceId, ticketId), 'ticket'), 'flow');
}

/**
 * Decision 8 / spec §14 "only what the caller can see": the server redacts, and this pass makes it impossible to forget.
 * An id that is not a node of the flow becomes null; an edge or an automatic move that names an unseen ticket is dropped.
 * A parent outside the flow reads null (publish_flow needs only parents that are drafts of the flow). A flow cut at its
 * cap (`truncated`) nulls the ids it did not return, which is the safe side.
 */
export function toFlowAnswer(wire: FlowWire): FlowWire {
  const seen = new Set(wire.nodes.map((n) => n.id));
  const known = (id: string | null): string | null => (id !== null && seen.has(id) ? id : null);
  return {
    ...wire,
    start: wire.start.filter((id) => seen.has(id)),
    end: wire.end.filter((id) => seen.has(id)),
    nodes: wire.nodes.map((n) => ({
      ...n,
      parentId: known(n.parentId),
      resolution: n.resolution === null ? null : { ...n.resolution, decisionTicketId: known(n.resolution.decisionTicketId) },
      alternates: n.alternates.map((a) => ({ ...a, viaDecisionId: known(a.viaDecisionId), firstTicketId: known(a.firstTicketId) })),
    })),
    edges: wire.edges.filter((e) => seen.has(e.from) && seen.has(e.to)),
    autoMoves: wire.autoMoves.filter((m) => seen.has(m.ticketId)).map((m) => ({ ...m, becauseTicketId: known(m.becauseTicketId) })),
  };
}
