import { useCallback, useMemo } from 'react';
import {
  Background,
  MarkerType,
  ReactFlow,
  ReactFlowProvider,
  type Connection,
  type Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { ANY_STATE_NODE_ID } from '../layout.js';
import { AnyStateNode } from './any-state-node.js';
import { useBuilderEnv, useBuilderStore, useDraft, useSummaryCtx } from './builder-context.js';
import { connectionToTransition, toFlowGraph } from './flow-graph.js';
import { StateNode } from './state-node.js';
import { TransitionEdge } from './transition-edge.js';

const NODE_TYPES = { state: StateNode, anyState: AnyStateNode };
const EDGE_TYPES = { transition: TransitionEdge };

function CanvasInner() {
  const store = useBuilderStore();
  const { canAuthor } = useBuilderEnv();
  const draft = useDraft();
  const summaryCtx = useSummaryCtx();
  const { nodes, edges } = useMemo(() => toFlowGraph(draft, summaryCtx), [draft, summaryCtx]);

  const onConnect = useCallback(
    (connection: Connection) => {
      const transition = connectionToTransition(connection);
      if (transition !== null) store.actions.addTransition(transition.from, transition.to);
    },
    [store],
  );

  const onNodeDragStop = useCallback(
    (_mouseEvent: unknown, node: Node) => {
      const key = node.id === ANY_STATE_NODE_ID ? node.id : node.id.slice('s:'.length);
      store.actions.moveState(key, node.position);
    },
    [store],
  );

  return (
    <div className="gn-workflow-canvas">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        onConnect={onConnect}
        onNodeDragStop={onNodeDragStop}
        onPaneClick={() => store.actions.select({ kind: 'none' })}
        nodesConnectable={canAuthor}
        nodesDraggable
        elementsSelectable
        fitView
        // E4-20: `fitView` alone shrinks BELOW 1:1 whenever the graph is
        // wider than the canvas — measured 0.745 at 1512px, 0.52 at 390px —
        // which paints every control on a state node (the 44px Blocked
        // checkbox included) smaller than it is declared. `minZoom: 1` floors
        // the fit at 1:1: a graph that overflows the canvas is panned and
        // scrolled into, never shrunk to fit, so on-screen controls are never
        // smaller than their own CSS says.
        fitViewOptions={{ minZoom: 1 }}
        defaultEdgeOptions={{ type: 'transition', markerEnd: { type: MarkerType.ArrowClosed } }}
      >
        <Background />
      </ReactFlow>
    </div>
  );
}

export function WorkflowCanvas() {
  return (
    <ReactFlowProvider>
      <CanvasInner />
    </ReactFlowProvider>
  );
}
