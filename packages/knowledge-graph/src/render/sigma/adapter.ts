import { MultiGraph } from 'graphology';
import type { CameraState } from '../../engine/camera.js';
import { solveFit } from '../../engine/fit.js';
import { glideFrame } from '../../engine/glide.js';
import { radius } from '../../engine/layout.js';
import type { CardShape, EdgeAttributes, NodeAttributes } from '../node-attributes.js';
import type { ThemePalette } from '../palette.js';
import type { CreateRenderer, DrawNode, DrawStates, DrawView, GraphRenderer, HoverEvent, MountOptions, PickEvent } from '../renderer.js';
import { keepAttachmentCache } from './attachment-cache.js';
import { cardShape, type SigmaLabels } from './card-box.js';
import { hasHead } from './card-style.js';
import { createCameraDriver } from './camera-driver.js';
import { iconUri } from './icons.js';
import { createProbe } from './probe.js';
import { createSigma, labelsOf, type KgSigma } from './program.js';
import { drawRings } from './rings.js';

/**
 * The Sigma half of the mockup's `makeGraph` (`knowledge-graph-sigma.html:773-829`, `:855-878`, `:890-895`) and the graph
 * diff in `render` (`:932-940`), behind the `GraphRenderer` seam. Reached ONLY through `@gisik-nokma/knowledge-graph/sigma`,
 * so the view's dynamic `import()` keeps Sigma out of the server bundle.
 */
export const createSigmaRenderer: CreateRenderer = () => {
  let sigma: KgSigma | null = null;
  let graph: MultiGraph<NodeAttributes, EdgeAttributes> | null = null;
  let palette: ThemePalette;
  let opts: MountOptions;
  let host: HTMLElement | undefined;
  let stage: HTMLDivElement;
  let ringsSvg: SVGSVGElement;
  let driver: ReturnType<typeof createCameraDriver> | undefined;
  let dropSub: (ref: string) => void = () => undefined;
  let labels: SigmaLabels;
  const invalidated: string[] = [];
  let nodeHovered = false, highlight: ReadonlySet<string> | null = null;
  let fitState: CameraState | null = null, fitPending = true, firstGraph = true, lastView: DrawView | null = null;
  let glideRaf = 0;
  let drawn: DrawNode[] = [];
  let probe: ReturnType<typeof createProbe> | null = null;
  const cams = new Set<(s: CameraState) => void>(), picks = new Set<(e: PickEvent) => void>(), hovers = new Set<(e: HoverEvent) => void>();
  const isFog = (ref: string) => graph!.hasNode(ref) && graph!.getNodeAttribute(ref, 'fog');
  const imageOf = (n: DrawNode) => (n.icon === null ? '' : iconUri(n.icon, palette));

  /** `computeFit` (`:854-861`): the solve is the pure `solveFit`; Sigma supplies px per unit and the normalisation. */
  function computeFit(view: DrawView): CameraState {
    const one = { x: 0.5, y: 0.5, ratio: 1, angle: 0 };
    const k1 = (sigma!.graphToViewport({ x: 100, y: 0 }, { cameraState: one }).x - sigma!.graphToViewport({ x: 0, y: 0 }, { cameraState: one }).x) / 100;
    const { cx, cy, ratio } = solveFit(view.fit, k1, { width: stage.clientWidth, height: stage.clientHeight }, view.topPx);
    const f = sigma!.getNormalizationFunction()({ x: cx, y: -cy });
    return { x: f.x, y: f.y, ratio };
  }

  function applyStates(states: DrawStates): void {
    const s = sigma!, g = graph!;
    highlight = states.highlight;
    s.setNodesState(g.nodes(), { isSel: false, isNb: false, isHl: false });
    s.setEdgesState(g.edges(), { isSel: false, isNb: false });
    if (states.selectedEdge !== null && g.hasEdge(states.selectedEdge)) s.setEdgeState(states.selectedEdge, { isSel: true });
    else if (states.selected !== null && g.hasNode(states.selected)) s.setNodeState(states.selected, { isSel: true });
    if (highlight !== null) s.setNodesState([...highlight].filter((ref) => g.hasNode(ref)), { isHl: true });
    s.refresh();
  }

  const renderer: GraphRenderer = {
    mount(el, pal, o) {
      host = el;
      palette = pal;
      opts = o;
      ringsSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      ringsSvg.setAttribute('class', 'gn-kg__rings');
      ringsSvg.setAttribute('aria-hidden', 'true');
      stage = document.createElement('div');
      stage.className = 'gn-kg__stage';
      el.append(ringsSvg, stage);
      graph = new MultiGraph<NodeAttributes, EdgeAttributes>();
      sigma = createSigma(graph, stage, () => palette, { nodeHovered: () => nodeHovered, highlightOn: () => highlight !== null });
      const far = radius(o.config.R, 6);
      sigma.setCustomBBox({ x: [-far[0] * 1.25, far[0] * 1.25], y: [-far[1] * 1.25, far[1] * 1.25] }); // glide keeps the frame fixed (`:756`, `:809`)
      dropSub = keepAttachmentCache(sigma, invalidated);
      labels = labelsOf(sigma);
      driver = createCameraDriver(sigma, stage, () => fitState?.ratio ?? 1, o.reduceMotion, (s) => cams.forEach((cb) => cb(s)));
      sigma.on('afterRender', () => {
        if (lastView === null) return;
        if (fitPending) {
          // trap 8: the first frame knows the real viewport size
          fitPending = false;
          fitState = computeFit(lastView);
          driver!.goTo(fitState, true);
        }
        drawRings(ringsSvg, sigma!, opts.config, lastView.clearHop, opts.phone, drawn.some((n) => n.fog));
      });
      // trap 6: fog fires events; ignore it. Port of `:875-886`.
      sigma.on('clickNode', ({ node }) => {
        if (!isFog(node)) picks.forEach((cb) => cb({ kind: 'node', ref: node, double: false }));
      });
      sigma.on('doubleClickNode', ({ node, preventSigmaDefault }) => {
        preventSigmaDefault();
        if (!isFog(node)) picks.forEach((cb) => cb({ kind: 'node', ref: node, double: true }));
      });
      sigma.on('clickEdge', ({ edge }) => {
        if (!graph!.getEdgeAttribute(edge, 'fog')) picks.forEach((cb) => cb({ kind: 'edge', id: edge }));
      });
      sigma.on('clickStage', () => picks.forEach((cb) => cb({ kind: 'stage' })));
      if (!o.phone) {
        // trap 9: dim on an ITEM hover only, through our own flag
        sigma.on('enterNode', ({ node }) => {
          if (isFog(node)) return;
          nodeHovered = true;
          sigma!.setNodesState(graph!.neighbors(node), { isNb: true });
          sigma!.setEdgesState(graph!.edges(node), { isNb: true });
          sigma!.scheduleRefresh(); // the dim is our flag, not a Sigma state: see `leaveNode`
          hovers.forEach((cb) => cb({ kind: 'node', ref: node }));
        });
        sigma.on('leaveNode', () => {
          nodeHovered = false;
          sigma!.setNodesState(graph!.nodes(), { isNb: false });
          sigma!.setEdgesState(graph!.edges(), { isNb: false });
          // Sigma restyles only items whose state changed, or all of them when its `hasHovered` flips; an edge hover keeps
          // `hasHovered` true (`sigma.esm.js:4044`), so node → edge would leave every non-neighbour at 0.32 (27.277)
          sigma!.scheduleRefresh();
          hovers.forEach((cb) => cb({ kind: 'node-leave' }));
        });
      }
      // trap 11: the sentence is a DOM tooltip the view draws; the adapter reports where
      sigma.on('enterEdge', ({ edge, event }) => {
        if (!graph!.getEdgeAttribute(edge, 'fog')) hovers.forEach((cb) => cb({ kind: 'edge', id: edge, x: event.x, y: event.y }));
      });
      sigma.on('leaveEdge', () => hovers.forEach((cb) => cb({ kind: 'edge-leave' })));
      if (el.hasAttribute('data-kg-probe')) probe = createProbe(sigma, graph, stage, invalidated, () => fitState);
    },

    setGraph(nodes, edges, positions, states, view) {
      const g = graph!;
      drawn = [...nodes];
      lastView = view;
      const shown = new Set(nodes.map((n) => n.ref));
      const from = new Map<string, { x: number; y: number }>();
      g.forEachNode((ref, a) => from.set(ref, { x: a.x, y: a.y }));
      g.forEachNode((ref) => {
        if (!shown.has(ref)) {
          g.dropNode(ref);
          dropSub(ref);
        }
      });
      g.clearEdges();
      // neighbours per ref, in-edges before out-edges, built in ONE pass (an `edges.find` per new node is O(nodes × edges))
      const ins = new Map<string, string[]>(), outs = new Map<string, string[]>();
      for (const e of edges) {
        (ins.get(e.to) ?? ins.set(e.to, []).get(e.to)!).push(e.from);
        (outs.get(e.from) ?? outs.set(e.from, []).get(e.from)!).push(e.to);
      }
      const to = new Map<string, { x: number; y: number }>();
      for (const n of nodes) {
        const p = positions.get(n.ref)!;
        to.set(n.ref, { x: p.x, y: -p.y }); // Sigma's y points up
        const attrs: Omit<NodeAttributes, 'x' | 'y'> = { ref: n.ref, kind: n.kind, fog: n.fog, lv: n.lv, center: n.center, lbl: n.lbl, sub: n.sub, image: imageOf(n), sug: n.sug, cat: n.cat };
        if (g.hasNode(n.ref)) {
          if (g.getNodeAttribute(n.ref, 'sub') !== n.sub) dropSub(n.ref);
          g.mergeNodeAttributes(n.ref, attrs);
        } else {
          // a new item grows out of its parent's old place, if it had one (`:937`)
          const parent = ins.get(n.ref)?.find((r) => from.has(r)) ?? outs.get(n.ref)?.find((r) => from.has(r));
          const start = parent === undefined ? to.get(n.ref)! : from.get(parent)!;
          g.addNode(n.ref, { ...attrs, x: start.x, y: start.y });
          from.set(n.ref, { ...start });
        }
      }
      // owner ruling B: a directed edge carries its target's card, so its head stops at that card's border (card-path.ts)
      const cards = new Map<string, CardShape | null>();
      const cardOf = (ref: string): CardShape | null => {
        if (!cards.has(ref)) cards.set(ref, cardShape(g.getNodeAttributes(ref), labels));
        return cards.get(ref)!;
      };
      for (const e of edges) {
        if (!g.hasNode(e.from) || !g.hasNode(e.to)) continue;
        g.addEdgeWithKey(e.id, e.from, e.to, { id: e.id, grp: e.grp, fog: e.fog, sug: e.sug, on: e.on, card: hasHead(e) ? cardOf(e.to) : null });
      }
      applyStates(states);
      // glide (`:890-895`): positions tween while the frame stays fixed
      cancelAnimationFrame(glideRaf);
      const t0 = performance.now();
      const step = (now: number) => {
        const { positions: at, done } = glideFrame(from, to, now - t0, opts.reduceMotion());
        g.updateEachNodeAttributes(
          (ref, a) => {
            const q = at.get(ref);
            if (q) {
              a.x = q.x;
              a.y = q.y;
            }
            return a;
          },
          { attributes: ['x', 'y'] },
        );
        if (!done) glideRaf = requestAnimationFrame(step);
      };
      step(t0); // reduced motion lands in this first step: `glideFrame` returns the targets when `reduce`
      if (firstGraph) {
        firstGraph = false;
        fitPending = true; // the first fit waits for the first afterRender
        sigma!.refresh();
        return;
      }
      fitState = computeFit(view);
      if (!view.keepView) driver!.goTo(fitState, false);
    },

    setStates: (states) => applyStates(states),
    setCamera(target, o = {}) {
      if (fitState !== null) driver!.goTo(target === 'fit' ? fitState : target, o.instant ?? false);
    },
    zoomBy: (f) => driver!.zoomCentre(f),
    onCamera: (cb) => (cams.add(cb), () => void cams.delete(cb)),
    onPick: (cb) => (picks.add(cb), () => void picks.delete(cb)),
    onHover: (cb) => (hovers.add(cb), () => void hovers.delete(cb)),

    refreshTheme(pal) {
      palette = pal;
      // new palette ⇒ new icon URIs (keys carry the colours), and every subtitle re-rasterised once in the new ink
      const byRef = new Map(drawn.map((d) => [d.ref, d]));
      graph!.updateEachNodeAttributes((ref, a) => {
        const n = byRef.get(ref);
        if (a.sub !== null) dropSub(ref);
        return { ...a, image: n === undefined ? a.image : imageOf(n) };
      });
      sigma!.refresh();
    },

    destroy() {
      cancelAnimationFrame(glideRaf);
      driver?.destroy();
      sigma?.kill();
      host?.replaceChildren();
      sigma = null;
      graph = null;
    },

    inspect: () => probe,
  };
  return renderer;
};
