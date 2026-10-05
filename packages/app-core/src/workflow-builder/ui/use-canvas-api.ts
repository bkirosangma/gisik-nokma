import { useEffect, type RefObject } from 'react';
import { useReactFlow, useStoreApi, type FitViewOptions, type Node } from '@xyflow/react';
import { ANY_STATE_NODE_ID } from '../layout.js';

/**
 * What the screen's controls need from the canvas, which they sit outside of (React Flow's provider wraps the canvas only). Add state (G-9 T3):
 * the flow-coordinate centre of what the author is looking at, and the measured node sizes (by position key, as the draft stores them). The
 * full-screen toolbar's zoom group (G-9 T5): zoom out, zoom in and fit, the same moves as the canvas corner's "Fit to screen". A ref
 * callback, not a context: the screen holds the api and hands it to its controls.
 */
export type CanvasApi = {
  centre(): { x: number; y: number };
  sizes(): Record<string, { width: number; height: number }>;
  zoomIn(): void;
  zoomOut(): void;
  fit(): void;
};

/** React Flow's measured nodes as sizes by position key (`s:<id>` becomes `<id>`, `any-state` stays). A node not yet measured has no entry. */
export function measuredSizes(nodes: readonly Node[]): Record<string, { width: number; height: number }> {
  const sizes: Record<string, { width: number; height: number }> = {};
  for (const candidate of nodes) {
    const { width, height } = candidate.measured ?? {};
    if (width !== undefined && height !== undefined) {
      sizes[candidate.id === ANY_STATE_NODE_ID ? candidate.id : candidate.id.slice('s:'.length)] = { width, height };
    }
  }
  return sizes;
}

/** How long a zoom or fit from the toolbar animates, as the corner's "Fit to screen" does. */
const ZOOM_MS = 200;

export function useCanvasApi(
  onReady: ((api: CanvasApi | null) => void) | undefined,
  nodes: RefObject<{ nodes: Node[] }>,
  fitOptions: FitViewOptions,
) {
  const { getViewport, zoomIn, zoomOut, fitView } = useReactFlow();
  const rf = useStoreApi();
  useEffect(() => {
    onReady?.({
      centre() {
        const { width, height } = rf.getState();
        const { x, y, zoom } = getViewport();
        return { x: (width / 2 - x) / zoom, y: (height / 2 - y) / zoom };
      },
      sizes() {
        return measuredSizes(nodes.current.nodes);
      },
      zoomIn() {
        void zoomIn({ duration: ZOOM_MS });
      },
      zoomOut() {
        void zoomOut({ duration: ZOOM_MS });
      },
      fit() {
        void fitView({ ...fitOptions, duration: ZOOM_MS });
      },
    });
    return () => onReady?.(null);
  }, [onReady, getViewport, rf, nodes, zoomIn, zoomOut, fitView, fitOptions]);
}
