import { analyzeFlow, buildFlowRead, planFlow, type FlowRead } from '@gisik-nokma/domain';
import type { Queryable } from '../db/queryable.js';
import type { EffectiveRole } from '../permissions/effective-role.js';
import { loadAutoMoves } from './auto-moves.js';
import { loadFlowFacts } from './flow-facts.js';
import { readFlow } from './read-flow.js';

/**
 * The Workflow graph's answer for ONE viewer (Part 3, D-W3-4): Part 2's ring-by-ring walk (a hidden ticket is a hole),
 * Part 2's analysis and plan, and the facts of the tickets the walk admitted. `blocks` links are kept only when BOTH ends
 * are in the flow. `GET …/tickets/:id/flow` is a thin shell around this; Part 4 measures it (p95 <= 120 ms at 300 tickets).
 */
export async function readFlowView(
  db: Queryable,
  args: { workspaceId: string; seedId: string; viewerId: string; eff: EffectiveRole },
): Promise<FlowRead> {
  const { workspaceId, seedId, viewerId, eff } = args;
  const walk = await readFlow(db, { workspaceId, seedId, viewerId });
  const ids = walk.nodes.map((n) => n.id);
  const analysis = analyzeFlow(walk.nodes, walk.edges);
  const plan = planFlow({ nodes: walk.nodes, edges: walk.edges, analysis });
  const [facts, autoMoves, blocks] = await Promise.all([
    loadFlowFacts(db, { eff, viewerId, workspaceId, ids }),
    loadAutoMoves(db, workspaceId, ids),
    loadBlocks(db, workspaceId, ids),
  ]);
  return buildFlowRead({
    rootId: seedId,
    truncated: walk.truncated,
    reached: walk.reached,
    nodes: walk.nodes,
    edges: walk.edges,
    blocks,
    analysis,
    plan,
    facts,
    autoMoves,
    // the viewer's own drafts: Part 2's walk admits no one else's
    draftCount: walk.nodes.filter((n) => n.draft).length,
  });
}

/** `blocks` links between members of the read. `ids` already exclude what the viewer cannot see, so neither list can name a hole. */
async function loadBlocks(db: Queryable, workspaceId: string, ids: readonly string[]): Promise<Array<{ sourceId: string; targetId: string }>> {
  if (ids.length === 0) return [];
  const { rows } = await db.query<{ source_id: string; target_id: string }>(
    `SELECT source_id, target_id FROM proj_ticket_links
      WHERE workspace_id = $1 AND kind = 'blocks' AND source_id = ANY($2::text[]) AND target_id = ANY($2::text[])
      ORDER BY source_id, target_id`,
    [workspaceId, [...ids]],
  );
  return rows.map((r) => ({ sourceId: r.source_id, targetId: r.target_id }));
}
