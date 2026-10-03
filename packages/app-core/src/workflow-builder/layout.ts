import type { WorkflowDef } from '@gisik-nokma/domain';

export type StatePosition = { x: number; y: number };

/** The distinguished node from-any ('*') transitions will draw from once Task 5's canvas exists. */
export const ANY_STATE_NODE_ID = 'any-state';

/**
 * A state's size before React Flow has measured it. The start node always carries the "start state always allows new tickets" reason, so it sits at `.gn-state-node`'s 13rem cap (208px); about 120px tall.
 * Housed here, not in `ui/flow-graph.ts`, so the draft store (free placement) and the canvas (obstacles) read one number without the store importing React Flow.
 */
export const UNMEASURED_NODE = { width: 208, height: 120 };

export const COLUMN_WIDTH = 260;
export const ROW_HEIGHT = 140;
const TOP_MARGIN = 80;

/**
 * Deterministic layered layout: BFS distance from initialStateId decides the
 * column, arrival order decides the row. States the BFS never reaches (and
 * every state when the initial marker dangles) go to one final column. Layout
 * only has to keep drawing; whether the def is legal is validateWorkflowDef's
 * verdict (`unknown-initial-state` when the marker dangles — it then skips
 * reachability altogether — and `unreachable-state` otherwise), and Task 8's
 * issues panel, not yet written, is what will put that in front of the author.
 *
 * '*' transitions are ignored for layering: they point at everything and
 * would flatten the picture into one column. So this walk and the validator's
 * are deliberately NOT the same set — the validator counts every '*' target as
 * reachable. Measured: with transitions todo->done and '*'->cancelled,
 * `cancelled` lands in the final column here while validateWorkflowDef returns
 * no issues at all. A state in that column is therefore not evidence of a
 * problem, and this docblock must not be read as promising one.
 */
export function layoutDraft(def: WorkflowDef): Record<string, StatePosition> {
  const stateIds = new Set(def.states.map((state) => state.id));
  const layerByState = new Map<string, number>();
  const queue: string[] = [];
  if (stateIds.has(def.initialStateId)) {
    layerByState.set(def.initialStateId, 0);
    queue.push(def.initialStateId);
  }
  while (queue.length > 0) {
    const current = queue.shift() as string;
    const currentLayer = layerByState.get(current) as number;
    for (const transition of def.transitions) {
      if (transition.from !== current) continue;
      if (!stateIds.has(transition.to) || layerByState.has(transition.to)) continue;
      layerByState.set(transition.to, currentLayer + 1);
      queue.push(transition.to);
    }
  }
  const reachedLayers = [...layerByState.values()];
  const orphanLayer = reachedLayers.length === 0 ? 0 : Math.max(...reachedLayers) + 1;

  const positions: Record<string, StatePosition> = {};
  const rowsUsed = new Map<number, number>();
  for (const state of def.states) {
    const layer = layerByState.get(state.id) ?? orphanLayer;
    const row = rowsUsed.get(layer) ?? 0;
    rowsUsed.set(layer, row + 1);
    positions[state.id] = { x: (layer + 1) * COLUMN_WIDTH, y: TOP_MARGIN + row * ROW_HEIGHT };
  }
  positions[ANY_STATE_NODE_ID] = { x: 0, y: TOP_MARGIN };
  return positions;
}

/** Where a newly added state lands: first column, below everything already placed. */
export function nextFreePosition(positions: Record<string, StatePosition>): StatePosition {
  const ys = Object.values(positions).map((position) => position.y);
  return { x: COLUMN_WIDTH, y: ys.length === 0 ? TOP_MARGIN : Math.max(...ys) + ROW_HEIGHT };
}
