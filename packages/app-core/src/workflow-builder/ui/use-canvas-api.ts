import { useEffect, type RefObject } from 'react';
import { useReactFlow, useStoreApi, type Node } from '@xyflow/react';
import { ANY_STATE_NODE_ID } from '../layout.js';

/**
 * What the screen's Add state needs from the canvas (G-9 T3): the flow-coordinate centre of what the author is looking at, and the measured
 * node sizes (by position key, as the draft stores them). A ref callback, not a context: the screen holds the api and hands it to the button.
 */
export type CanvasApi = {
  centre(): { x: number; y: number };
  sizes(): Record<string, { width: number; height: number }>;
};

export function useCanvasApi(onReady: ((api: CanvasApi | null) => void) | undefined, nodes: RefObject<{ nodes: Node[] }>) {
  const { getViewport } = useReactFlow();
  const rf = useStoreApi();
  useEffect(() => {
    onReady?.({
      centre() {
        const { width, height } = rf.getState();
        const { x, y, zoom } = getViewport();
        return { x: (width / 2 - x) / zoom, y: (height / 2 - y) / zoom };
      },
      sizes() {
        const sizes: Record<string, { width: number; height: number }> = {};
        for (const candidate of nodes.current.nodes) {
          const { width, height } = candidate.measured ?? {};
          if (width !== undefined && height !== undefined) {
            sizes[candidate.id === ANY_STATE_NODE_ID ? candidate.id : candidate.id.slice('s:'.length)] = { width, height };
          }
        }
        return sizes;
      },
    });
    return () => onReady?.(null);
  }, [onReady, getViewport, rf, nodes]);
}
