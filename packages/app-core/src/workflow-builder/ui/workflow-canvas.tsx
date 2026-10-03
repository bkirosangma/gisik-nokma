import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Background,
  MarkerType,
  Panel,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Connection,
  type Node,
  type NodeChange,
  type ReactFlowInstance,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { NODE_GAP, rectsOverlap, type Rect } from '../collision.js';
import { ANY_STATE_NODE_ID } from '../layout.js';
import { GRID, snapPosition, type Guide } from '../snap.js';
import { AnyStateNode } from './any-state-node.js';
import { CanvasOverlays } from './canvas-overlays.js';
import { useBuilderEnv, useBuilderStore, useDraft, useSummaryCtx } from './builder-context.js';
import { usePhoneBoard } from '../../views/use-phone-board.js';
import { connectionToTransition, phoneOpeningView, toFlowGraph, UNMEASURED_NODE, type StateNodeData } from './flow-graph.js';
import { StateNode } from './state-node.js';
import { TidyControl } from './tidy-control.js';
import { measuredSizes, useCanvasApi, type CanvasApi } from './use-canvas-api.js';
import { useCanvasKeys } from './use-canvas-keys.js';
import { TransitionEdge } from './transition-edge.js';
import { useDragEscape, useWorkingNodes } from './use-working-nodes.js';

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

type Point = { x: number; y: number };
type Size = { width: number; height: number };
const NO_GUIDES: Guide[] = [];

/** One drag, from `onNodeDragStart` to `onNodeDragStop`: what the pipeline snaps against, and the last position that cleared it. */
type Gesture = { id: string; size: Size; others: Rect[]; lastValid: Point; cancelled: boolean };

const sizeOf = (candidate: Node): Size => ({
  width: candidate.measured?.width ?? UNMEASURED_NODE.width,
  height: candidate.measured?.height ?? UNMEASURED_NODE.height,
});
const rectOf = (candidate: Node): Rect => ({ ...candidate.position, ...sizeOf(candidate) });
/** How far `a` would have to move to clear `b` by `NODE_GAP`: the smallest push over the four sides. Only meaningful while they overlap. */
const overlapDepth = (a: Rect, b: Rect) =>
  Math.min(a.x + a.width + NODE_GAP - b.x, b.x + b.width + NODE_GAP - a.x, a.y + a.height + NODE_GAP - b.y, b.y + b.height + NODE_GAP - a.y);

/**
 * The state an arrow press would run into (spec §3.3): a step either is clear of every other state or it is blocked, never slid
 * along an edge (the drag's `clampToAvoidOverlap` does that, and a key must move by exactly one step). A state that STARTS inside a
 * neighbour (a template's rows are shorter than a state is tall) is not trapped: against a neighbour it already overlaps, only a step
 * that sinks deeper is blocked, so it can be nudged out.
 */
function nudgeBlocker(from: Rect, to: Rect, others: Node[]): Node | null {
  return (
    others.find((candidate) => {
      const rect = rectOf(candidate);
      if (!rectsOverlap(to, rect, NODE_GAP)) return false;
      return !rectsOverlap(from, rect, NODE_GAP) || overlapDepth(to, rect) > overlapDepth(from, rect);
    }) ?? null
  );
}
const stateKey = (nodeId: string) => (nodeId === ANY_STATE_NODE_ID ? nodeId : nodeId.slice('s:'.length));
const nameOf = (candidate: Node) => (candidate.type === 'state' ? (candidate.data as StateNodeData).name : 'Any state');

function CanvasInner(props: { onReady?: (api: CanvasApi | null) => void }) {
  const store = useBuilderStore();
  const { canAuthor } = useBuilderEnv();
  const draft = useDraft();
  const summaryCtx = useSummaryCtx();
  const { fitView, getNodes, getViewport } = useReactFlow();
  const phone = usePhoneBoard();
  const graph = useMemo(() => toFlowGraph(draft, summaryCtx), [draft, summaryCtx]);
  const working = useWorkingNodes(graph.nodes);
  const [guides, setGuides] = useState<Guide[]>(NO_GUIDES);
  const [outline, setOutline] = useState<Rect | null>(null);
  const [blocked, setBlocked] = useState('');
  const gesture = useRef<Gesture | null>(null);
  const { altDown, arrow, selectKey } = useCanvasKeys();
  const live = useRef({ nodes: working.nodes });
  live.current = { nodes: working.nodes };
  useCanvasApi(props.onReady, live);

  const clearOverlays = useCallback(() => {
    setGuides(NO_GUIDES);
    setOutline(null);
  }, []);

  // G-9 T1: Escape during a drag puts the state back where it started. T3 (N2): and the pipeline stops, so no guide or outline
  // survives it; React Flow keeps tracking the pointer until release, and a cancelled gesture is not snapped.
  const cancelDrag = useCallback(() => {
    if (gesture.current) gesture.current.cancelled = true;
    clearOverlays();
    working.cancelDrag();
  }, [working.cancelDrag, clearOverlays]);
  const escape = useDragEscape(cancelDrag);

  const onConnect = useCallback(
    (connection: Connection) => {
      const transition = connectionToTransition(connection);
      if (transition !== null) store.actions.addTransition(transition.from, transition.to);
    },
    [store],
  );

  const onNodeDragStart = useCallback(
    (_mouseEvent: unknown, node: Node) => {
      const found = live.current.nodes.find((candidate) => candidate.id === node.id) ?? node;
      gesture.current = {
        id: node.id,
        size: sizeOf(found),
        others: live.current.nodes.filter((candidate) => candidate.id !== node.id).map(rectOf),
        lastValid: found.position,
        cancelled: false,
      };
      working.beginDrag(node.id);
      escape.arm();
    },
    [working.beginDrag, escape.arm],
  );

  // A dropped nudge (blocked, or not from a key) must not leave React Flow's own 5 px step in its store: a fresh object makes it re-adopt the position.
  const resync = useCallback(
    (id: string) => working.setNodes((nodes) => nodes.map((candidate) => (candidate.id === id ? { ...candidate } : candidate))),
    [working.setNodes],
  );

  /** One arrow press (spec §3.3): a GRID step, 1 px with Alt, through the collision check with the obstacles read fresh, committed by `moveState`. */
  const nudge = useCallback(
    (id: string) => {
      const key = arrow.current;
      const current = live.current.nodes.find((candidate) => candidate.id === id);
      if (key === null || !current) return resync(id);
      const size = sizeOf(current);
      const others = live.current.nodes.filter((candidate) => candidate.id !== id);
      const step = key.alt ? 1 : GRID;
      const intended = { x: current.position.x + key.x * step, y: current.position.y + key.y * step };
      const blocker = nudgeBlocker({ ...current.position, ...size }, { ...intended, ...size }, others);
      if (blocker) {
        // a repeated message is still a change to the region, so a screen reader says it again
        setBlocked((message) => `Blocked by ${nameOf(blocker)}${message.endsWith('\u00a0') ? '' : '\u00a0'}`);
        return resync(id);
      }
      setBlocked('');
      store.actions.moveState(stateKey(id), intended);
    },
    [resync, store],
  );

  // Snapping and collision run on every position change BEFORE it is applied (spec §3), so the working copy, the arrows and the
  // commit all hold the clamped position. The drag-end change carries React Flow's RAW pointer position (`@xyflow/system` :2330-2331)
  // and becomes `lastValid`. Keyboard moves (`dragging: false` with no gesture) are the nudge, consumed here before the hook's allow-list.
  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      const g = gesture.current;
      const passed: NodeChange[] = [];
      for (const change of changes) {
        if (change.type === 'select' && change.selected && selectKey.current && change.id.startsWith('s:')) {
          // React Flow's keyboard selection (Tab, Enter) lives in the working copy only; the draft has to hear it, or the next merge clears it.
          const stateId = stateKey(change.id);
          const now = store.getState().selection;
          if (!(now.kind === 'state' && now.stateId === stateId)) store.actions.select({ kind: 'state', stateId });
        }
        if (change.type !== 'position' || !change.position) {
          passed.push(change);
        } else if (g !== null && change.id === g.id && !g.cancelled) {
          if (change.dragging === true) {
            const result = snapPosition(change.position, g.size, g.others, { zoom: getViewport().zoom, alt: altDown.current, lastValid: g.lastValid });
            g.lastValid = result.position;
            setGuides(result.guides.length > 0 ? result.guides : NO_GUIDES);
            setOutline(result.blocked ? { ...result.target, ...g.size } : null);
            passed.push({ ...change, position: result.position });
          } else {
            passed.push({ ...change, position: g.lastValid });
          }
        } else if (working.draggingId() === null && change.dragging !== true) {
          nudge(change.id);
        } else {
          passed.push(change); // a cancelled gesture's, or another id's, mid-drag: the hook drops it
          if (arrow.current) resync(change.id); // ...and an arrow key's own 5 px step must not stay in React Flow's store
        }
      }
      if (passed.length > 0) working.onNodesChange(passed);
    },
    [working.onNodesChange, working.draggingId, nudge, resync, getViewport, store],
  );

  // The commit is the working copy's position, never the handler's `node.position`: React Flow's drag-end position is
  // the raw pointer one, and a cancelled gesture (Escape) commits nothing.
  const onNodeDragStop = useCallback(() => {
    escape.disarm();
    gesture.current = null;
    clearOverlays();
    const done = working.endDrag();
    if (done === null) return;
    store.actions.moveState(stateKey(done.id), done.position);
  }, [store, working.endDrag, escape.disarm, clearOverlays]);

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
        nodes={working.nodes}
        edges={graph.edges}
        nodeTypes={NODE_TYPES}
        edgeTypes={EDGE_TYPES}
        onConnect={onConnect}
        onNodesChange={onNodesChange}
        onNodeDragStart={onNodeDragStart}
        onNodeDragStop={onNodeDragStop}
        nodeDragThreshold={4}
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
        <CanvasOverlays guides={guides} outline={outline} />
        <Panel position="bottom-left">
          {/* G-9 T4: Tidy sits beside Fit to screen; it renders nothing for a viewer. */}
          <div className="gn-workflow-canvas__corner">
            <button
              type="button"
              className="gn-workflow-canvas__fit"
              onClick={() => void fitView({ ...FIT_OPTIONS, duration: 200 })}
            >
              Fit to screen
            </button>
            <TidyControl sizes={() => measuredSizes(getNodes())} />
          </div>
        </Panel>
      </ReactFlow>
      <div className="gn-visually-hidden" aria-live="polite">
        {blocked}
      </div>
    </div>
  );
}

export function WorkflowCanvas(props: { onReady?: (api: CanvasApi | null) => void }) {
  return (
    <ReactFlowProvider>
      <CanvasInner onReady={props.onReady} />
    </ReactFlowProvider>
  );
}
