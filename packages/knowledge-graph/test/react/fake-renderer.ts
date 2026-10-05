import type { CameraState } from '../../src/engine/camera.js';
import type { CreateRenderer, DrawEdge, DrawNode, DrawStates, GraphRenderer, HoverEvent, PickEvent } from '../../src/render/renderer.js';

/** A `GraphRenderer` that records every `setGraph` and lets a test fire the callbacks the view registered. */
export function fakeRenderer() {
  const calls: { nodes: DrawNode[]; edges: DrawEdge[]; states: DrawStates }[] = [];
  let onPick: (e: PickEvent) => void = () => {}, onHover: (e: HoverEvent) => void = () => {};
  const zooms: number[] = [];
  const cameras: ('fit' | CameraState)[] = [];
  const r: GraphRenderer = {
    mount() {},
    setGraph(nodes, edges, _positions, states) {
      calls.push({ nodes: [...nodes], edges: [...edges], states });
    },
    setStates() {},
    setCamera(target) {
      cameras.push(target);
    },
    zoomBy(f) {
      zooms.push(f);
    },
    onCamera: () => () => {},
    onPick: (cb) => ((onPick = cb), () => {}),
    onHover: (cb) => ((onHover = cb), () => {}),
    refreshTheme() {},
    destroy() {},
    inspect: () => null,
  };
  const create: CreateRenderer = () => r;
  return { createRenderer: async () => create, calls, zooms, cameras, pick: (e: PickEvent) => onPick(e), hover: (e: HoverEvent) => onHover(e), last: () => calls[calls.length - 1]! };
}
