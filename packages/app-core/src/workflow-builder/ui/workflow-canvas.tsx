import { useCallback, useMemo } from 'react';
import {
  Background,
  MarkerType,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Connection,
  type Node,
  type ReactFlowInstance,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { ANY_STATE_NODE_ID } from '../layout.js';
import { AnyStateNode } from './any-state-node.js';
import { useBuilderEnv, useBuilderStore, useDraft, useSummaryCtx } from './builder-context.js';
import { usePhoneBoard } from '../../views/use-phone-board.js';
import { connectionToTransition, phoneOpeningView, toFlowGraph } from './flow-graph.js';
import { StateNode } from './state-node.js';
import { TransitionEdge } from './transition-edge.js';

const NODE_TYPES = { state: StateNode, anyState: AnyStateNode };
const EDGE_TYPES = { transition: TransitionEdge };

/**
 * UX fixes T10 (WF-02, 23.175): the lowest zoom a fit may reach. React Flow's own default floor (0.5) also caps
 * `fitView`, so a graph wider than the canvas opened cropped — the E4-20 floor of 1:1 below traded "the whole
 * graph is visible" for "no control is drawn smaller than its CSS". The audit's reading wins: the canvas opens
 * on the WHOLE graph, and the "Fit to screen" control brings it back after the reader has panned or zoomed.
 */
const FIT_MIN_ZOOM = 0.25;
const FIT_OPTIONS = { minZoom: FIT_MIN_ZOOM, padding: 0.1 };

function CanvasInner() {
  const store = useBuilderStore();
  const { canAuthor } = useBuilderEnv();
  const draft = useDraft();
  const summaryCtx = useSummaryCtx();
  const { fitView } = useReactFlow();
  const phone = usePhoneBoard();
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

  // F-5 (WF-03): on a phone the whole graph fits only at ~0.28, where a 13px checkbox is drawn at 4px. The canvas opens
  // at a readable zoom on the start state instead and the reader pans; "Fit to screen" still shows everything.
  const openOnStart = useCallback(
    (instance: ReactFlowInstance) => {
      if (!phone) return;
      const draftNow = store.getState();
      const measured = instance.getNode(`s:${draftNow.def.initialStateId}`)?.measured;
      const { center, zoom } = phoneOpeningView(
        draftNow,
        measured?.width !== undefined && measured.height !== undefined ? { width: measured.width, height: measured.height } : undefined,
      );
      void instance.setCenter(center.x, center.y, { zoom });
    },
    [phone, store],
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
        // `fitView` runs ONCE, when the canvas opens — never again on an edit, so the reader's own zoom
        // and pan survive every change (23.175's control). E4-20 had floored the fit at 1:1 (`minZoom: 1`)
        // so no control was drawn smaller than its CSS; that opened wide graphs cropped (WF-02), so the
        // floor is lowered and `minZoom` is passed to the instance too, which otherwise caps the fit at 0.5.
        fitView={!phone}
        onInit={openOnStart}
        minZoom={FIT_MIN_ZOOM}
        fitViewOptions={FIT_OPTIONS}
        defaultEdgeOptions={{ type: 'transition', markerEnd: { type: MarkerType.ArrowClosed } }}
      >
        <Background />
        <Panel position="bottom-left">
          <button
            type="button"
            className="gn-workflow-canvas__fit"
            onClick={() => void fitView({ ...FIT_OPTIONS, duration: 200 })}
          >
            Fit to screen
          </button>
        </Panel>
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
