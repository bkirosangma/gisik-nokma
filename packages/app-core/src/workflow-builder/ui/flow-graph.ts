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

/** F-5 (WF-03): the zoom a phone-width canvas opens at. High enough that a node's 13px checkbox is drawn near its CSS size. */
export const PHONE_OPEN_ZOOM = 0.8;

/** A node's size for a key React Flow has not measured yet: the phone opening view's start node, and Tidy / Add state for a state with no measurement. Width is `.gn-state-node`'s 13rem cap (208px); the 120px height is a floor, not a measurement: a real state is 196–214px tall in neo (the start state 227×210), so any caller that has measured sizes must pass them. */
export const UNMEASURED_NODE = { width: 208, height: 120 };

/** Where a phone-width canvas opens: the centre of the START state at {@link PHONE_OPEN_ZOOM}, not the whole graph. */
export function phoneOpeningView(
  draft: WorkflowDraft,
  size: { width: number; height: number } = UNMEASURED_NODE,
): { center: { x: number; y: number }; zoom: number } {
  const start = draft.positions[draft.def.initialStateId] ?? { x: 0, y: 0 };
  return { center: { x: start.x + size.width / 2, y: start.y + size.height / 2 }, zoom: PHONE_OPEN_ZOOM };
}
