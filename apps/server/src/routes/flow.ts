import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import type { FlowNode, TicketState } from '@gisik-nokma/domain';
import type { Queryable } from '../db/queryable.js';
import { walkFlow, type FlowWalk } from '../flow/read-flow.js';
import { keysForAncestors } from '../read/ancestry.js';
import { NOT_FOUND_BODY } from './tickets.js';

export type FlowTicketWire = {
  id: string;
  /** `null` for the viewer's own draft (it has no number yet) and for a workspace with no prefix. */
  key: string | null;
  title: string;
  projectId: string;
  assigneeId: string | null;
  /** The display name of the ticket's current state, in the workflow version it is folded to. */
  stateName: string;
  /** The planner's and the graph's input shape; every fact about the ticket the flow code reads. */
  node: FlowNode;
};
export type FlowLinkWire = { sourceId: string; targetId: string; label: string | null; kind: 'leads_to' | 'blocks' };
export type FlowReadWire = {
  rootId: string;
  tickets: FlowTicketWire[];
  links: FlowLinkWire[];
  truncated: boolean;
  reached: number;
};

function titleOf(state: TicketState): string {
  const claim = state.fields['title'];
  if (claim === undefined || typeof claim.value !== 'string') {
    throw new Error(`flow read: ticket ${state.id} has no string title claim; ticket.created writes one, so proj_tickets and the ledger disagree`);
  }
  return claim.value;
}

/** The wire form of a walk: the same rows `walkFlow` returned, plus the keys and titles a surface prints. */
export async function flowWire(db: Queryable, workspaceId: string, rootId: string, walk: FlowWalk): Promise<FlowReadWire> {
  const stateOf = (id: string): TicketState => {
    const state = walk.states.get(id);
    if (state === undefined) throw new Error(`flow read: no state for node ${id}`);
    return state;
  };
  const stateNameOf = (id: string): string => {
    const name = walk.stateNames.get(id);
    if (name === undefined) throw new Error(`flow read: no state name for node ${id}`);
    return name;
  };
  // A draft has no number: leave it out of the key lookup rather than ask for a number that does not exist.
  const keys = await keysForAncestors(
    db,
    workspaceId,
    walk.read.nodes.filter((node) => !node.draft).map((node) => ({ ticketId: node.id, projectId: stateOf(node.id).projectId })),
  );
  return {
    rootId,
    tickets: walk.read.nodes.map((node) => {
      const state = stateOf(node.id);
      return {
        id: node.id,
        key: keys.get(node.id) ?? null,
        title: titleOf(state),
        projectId: state.projectId,
        assigneeId: state.assigneeId,
        stateName: stateNameOf(node.id),
        node,
      };
    }),
    links: [
      ...walk.read.edges.map((e): FlowLinkWire => ({ ...e, kind: 'leads_to' })),
      ...walk.blocks.map((b): FlowLinkWire => ({ ...b, label: null, kind: 'blocks' })),
    ],
    truncated: walk.read.truncated,
    reached: walk.read.reached,
  };
}

/**
 * `GET /v1/workspaces/:workspaceId/tickets/:ticketId/flow` (FL-1, FL-2): the flow of one ticket for the signed-in
 * viewer. A seed the viewer cannot read, one that does not exist and one in another workspace all answer the same
 * 404 body, so the route is no oracle (`routes/ticket-history.ts` does the same with `canSee`).
 */
export function registerFlowRoute(app: FastifyInstance, deps: { pool: Queryable }, requireSession: preHandlerHookHandler): void {
  app.get<{ Params: { workspaceId: string; ticketId: string } }>(
    '/v1/workspaces/:workspaceId/tickets/:ticketId/flow',
    { preHandler: requireSession },
    async (request, reply) => {
      const { workspaceId, ticketId } = request.params;
      const walk = await walkFlow(deps.pool, { workspaceId, seedId: ticketId, viewerId: request.currentUserId });
      if (walk.read.nodes.length === 0) return reply.code(404).send(NOT_FOUND_BODY);
      return flowWire(deps.pool, workspaceId, ticketId, walk);
    },
  );
}
