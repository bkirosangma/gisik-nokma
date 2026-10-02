import { useCallback, useEffect, useRef, useState } from 'react';
import { applyNodeChanges, type Node, type NodeChange } from '@xyflow/react';

/**
 * The draft is the source of truth; only the node under an in-flight drag keeps the pipeline's position (spec §2.1).
 * `measured` (written by React Flow's dimension changes) is carried from the working copy, because T3's obstacles read it.
 */
export function mergeDraftNodes(draftNodes: Node[], working: Node[], draggingId: string | null): Node[] {
  const byId = new Map(working.map((candidate) => [candidate.id, candidate]));
  return draftNodes.map((candidate) => {
    const live = byId.get(candidate.id);
    const measured = live?.measured ? { measured: live.measured } : {};
    if (candidate.id === draggingId && live) return { ...candidate, ...measured, position: live.position, dragging: true };
    return { ...candidate, ...measured };
  });
}

type Point = { x: number; y: number };
/** `last` is written SYNCHRONOUSLY inside `onNodesChange`: React Flow emits the drag-end change and calls `onNodeDragStop` in the SAME pointer-up handler, before React re-renders, so anything read from rendered state there is one step stale (reviewer C, 2026-10-03). */
type Gesture = { id: string; start: Point; last: Point; cancelled: boolean };

/**
 * Owns the dragged id's position from drag start until `onNodeDragStop` returns (spec §2.1), and nothing else of React Flow's.
 * `onNodesChange` is an ALLOW-LIST (planner ruling 2026-10-03, F1): `select` and `dimensions` changes always, `position`
 * changes only for the active, un-cancelled gesture's id. Every other change is dropped, because the draft owns membership
 * and placement: `remove` (React Flow's Backspace default), `add`, `replace`, and a `position` with no gesture or for another id
 * (an arrow-key nudge, a box-select move) would otherwise change the canvas and leave the draft behind, a delete or a move
 * that never happened. T4's nudge commits through the draft store, outside this filter.
 * React Flow keeps emitting position changes for the id until pointer-up, and its last one (`dragging: false`)
 * carries the RAW pointer position (`@xyflow/system` :2330-2331); after a cancel every change for the id is dropped.
 */
export function useWorkingNodes(draftNodes: Node[]) {
  const [nodes, setNodes] = useState<Node[]>(draftNodes);
  const gesture = useRef<Gesture | null>(null);
  useEffect(() => {
    setNodes((working) => mergeDraftNodes(draftNodes, working, gesture.current?.id ?? null));
  }, [draftNodes]);
  const onNodesChange = useCallback((changes: NodeChange[]) => {
    const g = gesture.current;
    const kept = changes.filter(
      (change) => change.type === 'select' || change.type === 'dimensions' || (change.type === 'position' && g !== null && !g.cancelled && change.id === g.id),
    );
    if (g && !g.cancelled) {
      for (const change of kept) if (change.type === 'position' && change.id === g.id && change.position) g.last = change.position; // live, pre-render
    }
    if (kept.length > 0) setNodes((working) => applyNodeChanges(kept, working));
  }, []);
  const beginDrag = useCallback((id: string) => {
    const found = draftNodes.find((candidate) => candidate.id === id);
    gesture.current = found ? { id, start: found.position, last: found.position, cancelled: false } : null;
  }, [draftNodes]);
  /** Escape: restore the start position and keep the gesture ACTIVE but cancelled, so later changes are dropped and the nudge guard cannot fire. */
  const cancelDrag = useCallback((): void => {
    const g = gesture.current;
    if (g === null) return;
    g.cancelled = true;
    setNodes((working) => working.map((candidate) => (candidate.id === g.id ? { ...candidate, position: g.start, dragging: false } : candidate)));
  }, []);
  /** Called from `onNodeDragStop`. Returns the position to commit, or null after a cancel. */
  const endDrag = useCallback((): { id: string; position: Point } | null => {
    const g = gesture.current;
    gesture.current = null;
    if (g === null || g.cancelled) return null;
    return { id: g.id, position: g.last }; // the live ref, never rendered state (one step stale in the same pointer-up handler)
  }, []);
  const draggingId = useCallback(() => gesture.current?.id ?? null, []);
  return { nodes, setNodes, onNodesChange, beginDrag, cancelDrag, endDrag, draggingId };
}

/**
 * Escape during a drag cancels it (spec §2.1). The window listener lives for one gesture: `arm()` on drag start,
 * `disarm()` on drag stop, and the unmount disarms it too. It is a capture listener that stops the event, so no
 * other Escape owner (T5's ladder) also acts on the key that cancelled a drag.
 */
export function useDragEscape(cancelDrag: () => void) {
  const stop = useRef<(() => void) | null>(null);
  const disarm = useCallback(() => {
    stop.current?.();
    stop.current = null;
  }, []);
  const arm = useCallback(() => {
    disarm();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      cancelDrag();
      event.stopPropagation();
    };
    window.addEventListener('keydown', onKeyDown, true);
    stop.current = () => window.removeEventListener('keydown', onKeyDown, true);
  }, [cancelDrag, disarm]);
  useEffect(() => disarm, [disarm]);
  return { arm, disarm };
}
