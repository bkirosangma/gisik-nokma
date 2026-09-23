import { MarkerType, type Edge, type Node } from '@xyflow/react';
import type { WorkflowDraft } from '../draft-store.js';
import { ANY_STATE_NODE_ID } from '../layout.js';
import { summarizeRules, type SummaryContext } from '../summaries.js';

export type StateNodeData = {
  stateId: string;
  name: string;
  category: 'open' | 'active' | 'terminal';
  blocked: boolean;
  isInitial: boolean;
  creatable: boolean;
};

export type TransitionEdgeData = { index: number; summaries: string[] };

const STATE_PREFIX = 's:';

export function toFlowGraph(
  draft: WorkflowDraft,
  ctx: SummaryContext,
): { nodes: Node[]; edges: Edge[] } {
  const stateIds = new Set(draft.def.states.map((state) => state.id));
  const nodes: Node[] = draft.def.states.map((state) => ({
    id: `${STATE_PREFIX}${state.id}`,
    type: 'state',
    position: draft.positions[state.id] ?? { x: 0, y: 0 },
    data: {
      stateId: state.id,
      name: state.name,
      category: state.category,
      blocked: state.blocked === true,
      isInitial: state.id === draft.def.initialStateId,
      creatable: state.creatable !== false,
    } satisfies StateNodeData,
    selected: draft.selection.kind === 'state' && draft.selection.stateId === state.id,
  }));
  nodes.push({
    id: ANY_STATE_NODE_ID,
    type: 'anyState',
    position: draft.positions[ANY_STATE_NODE_ID] ?? { x: 0, y: 80 },
    data: {},
  });

  const edges: Edge[] = [];
  draft.def.transitions.forEach((transition, index) => {
    if (transition.from !== '*' && !stateIds.has(transition.from)) return; // dangling — issues panel names it
    if (!stateIds.has(transition.to)) return;
    edges.push({
      id: `t:${index}`,
      source: transition.from === '*' ? ANY_STATE_NODE_ID : `${STATE_PREFIX}${transition.from}`,
      target: `${STATE_PREFIX}${transition.to}`,
      type: 'transition',
      markerEnd: { type: MarkerType.ArrowClosed }, // transitions are drawn ARROWS (spec §4)
      data: { index, summaries: summarizeRules(transition.rules, ctx) } satisfies TransitionEdgeData,
      selected: draft.selection.kind === 'transition' && draft.selection.index === index,
    });
  });
  return { nodes, edges };
}

/** Turns a React Flow connection into a transition, or null when it is not one we allow. */
export function connectionToTransition(connection: {
  source: string | null;
  target: string | null;
}): { from: string; to: string } | null {
  if (connection.source === null || connection.target === null) return null;
  if (connection.target === ANY_STATE_NODE_ID) return null; // '*' is a source, never a destination
  const from =
    connection.source === ANY_STATE_NODE_ID ? '*' : connection.source.slice(STATE_PREFIX.length);
  const to = connection.target.slice(STATE_PREFIX.length);
  return { from, to };
}
