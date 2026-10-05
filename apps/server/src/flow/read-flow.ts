import { flowNodeOf, statesWithBacklog, type FlowEdge, type FlowNode, type TicketState } from '@gisik-nokma/domain';
import type { Queryable } from '../db/queryable.js';
import { resolveEffectiveRole } from '../permissions/effective-role.js';
import { rowToTicketState } from '../projections/tickets.js';
import { listMyDrafts } from '../read/drafts.js';
import { SqlParams } from '../read/sql-params.js';
import { foldedDefKey, foldedWorkflowDefs } from '../read/workflow-defs.js';
import { LIVE_TICKET_WHERE, visibleTicketsWhere } from '../read/visible-where.js';

/** FL-2: a flow shows at most this many tickets. */
export const FLOW_DEFAULT_CAP = 300;
/** FL-2: the walk goes at most this many rings out from the ticket it was asked about. */
export const FLOW_MAX_RINGS = 30;

export type FlowReadArgs = {
  workspaceId: string;
  seedId: string;
  /** `null` = ignore visibility (the promoter, the settler and the sweep act for the system). Drafts are never read for `null`. */
  viewerId: string | null;
  cap?: number;
};

export type FlowRead = {
  /** The seed first, then ring by ring (ascending id inside a ring). Empty when the seed is not readable by the viewer. */
  nodes: FlowNode[];
  /** `leads_to` links with both ends in `nodes`. */
  edges: FlowEdge[];
  /** More tickets exist than `nodes` holds: the cap was passed, or a 31st ring is not empty. */
  truncated: boolean;
  /** How many tickets the walk admitted before it stopped (never counts a ticket the viewer cannot see). */
  reached: number;
};

export type FlowWalk = {
  read: FlowRead;
  /** The folded state of each returned node. Nothing reads it, `stateNames` or `blocks` since wtg3 T3 retired the route's small wire (the route serves `readFlowView`, whose facts come from `loadFlowFacts`). */
  states: Map<string, TicketState>;
  /** The display name of each node's current state, in the workflow version the ticket is folded to. */
  stateNames: Map<string, string>;
  /** `blocks` links with both ends in `nodes`: drawn fainter, never part of the walk (FL-1). */
  blocks: Array<{ sourceId: string; targetId: string }>;
};

type TicketRow = Parameters<typeof rowToTicketState>[0];
type LinkRow = { source_id: string; target_id: string; kind: 'leads_to' | 'blocks'; label: string | null };

/**
 * FL-1, FL-2. The flow of `seedId` for one viewer: the weakly connected component over `leads_to`, walked ring by
 * ring, one statement per ring.
 *
 * A ticket is admitted when it is in this workspace, live, and either visible to the viewer or one of the viewer's
 * OWN drafts. Anything else is a HOLE: it is not returned, it is not counted, its links are dropped, and the walk
 * does not pass through it, so a visible ticket behind a hidden one is not reached through it.
 */
export async function walkFlow(db: Queryable, args: FlowReadArgs): Promise<FlowWalk> {
  const { workspaceId, seedId } = args;
  const cap = Math.max(1, args.cap ?? FLOW_DEFAULT_CAP);
  const viewer =
    args.viewerId === null ? null : { id: args.viewerId, eff: await resolveEffectiveRole(db, args.viewerId, workspaceId) };
  const ownDrafts = viewer === null ? [] : (await listMyDrafts(db, viewer.id, workspaceId)).map((draft) => draft.ticketId);

  const admit = async (from: { seedId: string } | { frontier: readonly string[] }, seen: ReadonlySet<string>): Promise<string[]> => {
    const params = new SqlParams();
    const ws = params.add(workspaceId);
    const seenParam = params.add([...seen]);
    let reach: string;
    if ('seedId' in from) {
      reach = `t.ticket_id = ${params.add(from.seedId)}`;
    } else {
      const f = params.add(from.frontier);
      reach =
        `t.ticket_id IN (SELECT CASE WHEN l.source_id = ANY (${f}::text[]) THEN l.target_id ELSE l.source_id END ` +
        `FROM proj_ticket_links l WHERE l.workspace_id = ${ws} AND l.kind = 'leads_to' ` +
        `AND (l.source_id = ANY (${f}::text[]) OR l.target_id = ANY (${f}::text[])))`;
    }
    const seeable = viewer === null ? 'TRUE' : visibleTicketsWhere(viewer.eff, viewer.id, params);
    const own =
      ownDrafts.length === 0 ? 'FALSE' : `(t.ticket_id = ANY (${params.add(ownDrafts)}::text[]) AND t.deleted_at IS NULL)`;
    const { rows } = await db.query<{ ticket_id: string }>(
      `SELECT t.ticket_id
         FROM proj_tickets t
         JOIN proj_visibility v ON v.ticket_id = t.ticket_id
        WHERE t.workspace_id = ${ws}
          AND t.ticket_id <> ALL (${seenParam}::text[])
          AND ${reach}
          AND ((${LIVE_TICKET_WHERE} AND ${seeable}) OR ${own})
        ORDER BY t.ticket_id`,
      params.toArray(),
    );
    return rows.map((row) => row.ticket_id);
  };

  const seen = new Set<string>();
  const order: string[] = [];
  let truncated = false;
  let frontier = await admit({ seedId }, seen);
  for (let ring = 0; frontier.length > 0; ring += 1) {
    for (const id of frontier) {
      seen.add(id);
      order.push(id);
    }
    if (order.length > cap) break;
    const next = await admit({ frontier }, seen);
    if (ring === FLOW_MAX_RINGS) {
      truncated = next.length > 0;
      break;
    }
    frontier = next;
  }
  const reached = order.length;
  truncated = truncated || reached > cap;

  const keptIds = order.slice(0, cap);
  if (keptIds.length === 0) {
    return { read: { nodes: [], edges: [], truncated: false, reached: 0 }, states: new Map(), stateNames: new Map(), blocks: [] };
  }
  const { rows: ticketRows } = await db.query<TicketRow>(
    'SELECT t.* FROM proj_tickets t WHERE t.workspace_id = $1 AND t.ticket_id = ANY ($2::text[])',
    [workspaceId, keptIds],
  );
  const rowById = new Map(ticketRows.map((row) => [row.ticket_id, row] as const));
  const states = new Map<string, TicketState>();
  for (const id of keptIds) {
    const row = rowById.get(id);
    // A row purged between the ring statement and this one is simply gone; the next read will not see it either.
    if (row !== undefined) states.set(id, rowToTicketState(row));
  }

  const defs = await foldedWorkflowDefs(
    db,
    workspaceId,
    [...states.values()].map((state) => ({ workflowId: state.workflowId, version: state.workflowVersion })),
  );
  const ownSet = new Set(ownDrafts);
  const nodes: FlowNode[] = [];
  const stateNames = new Map<string, string>();
  for (const state of states.values()) {
    const def = defs.get(foldedDefKey(state.workflowId, state.workflowVersion));
    if (def === undefined) {
      throw new Error(`walkFlow: no workflow definition ${state.workflowId}@${state.workflowVersion} for ticket ${state.id}; the projection and the ledger disagree`);
    }
    nodes.push(flowNodeOf(state, def, { draft: ownSet.has(state.id) }));
    const known = statesWithBacklog(def).find((s) => s.id === state.stateId);
    if (known === undefined) {
      throw new Error(`walkFlow: ticket ${state.id} is in state ${state.stateId}, which ${state.workflowId}@${state.workflowVersion} does not declare`);
    }
    stateNames.set(state.id, known.name);
  }

  // The induced subgraph, in one statement: both ends kept. An edge to a hole or past the cap is dropped, never half-drawn.
  const nodeIds = nodes.map((node) => node.id);
  const { rows: linkRows } = await db.query<LinkRow>(
    `SELECT source_id, target_id, kind, label
       FROM proj_ticket_links
      WHERE workspace_id = $1 AND kind IN ('leads_to', 'blocks')
        AND source_id = ANY ($2::text[]) AND target_id = ANY ($2::text[])
      ORDER BY source_id, target_id, kind`,
    [workspaceId, nodeIds],
  );
  const edges: FlowEdge[] = linkRows
    .filter((row) => row.kind === 'leads_to')
    .map((row) => ({ sourceId: row.source_id, targetId: row.target_id, label: row.label ?? null }));
  const blocks = linkRows.filter((row) => row.kind === 'blocks').map((row) => ({ sourceId: row.source_id, targetId: row.target_id }));

  return { read: { nodes, edges, truncated, reached }, states, stateNames, blocks };
}

/** The contract shape (plan header): what the promoter, the settler, the sweep and the MCP read need. */
export async function readFlow(db: Queryable, args: FlowReadArgs): Promise<FlowRead> {
  return (await walkFlow(db, args)).read;
}
