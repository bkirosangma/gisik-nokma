/**
 * The synthetic scenes of the §13 pan bars. Each scene is plain DOM driven by a scripted pan, so what is measured is the cost
 * of the SURFACE the engine will move (compositing a native scroller full of absolutely placed bars, or a transformed layer of
 * nodes and edges), not React and not the product's code. The product's own view is the `view` scene (`stress.tsx`).
 *
 * Colours are literals on purpose: this is a measurement harness, not product UI, and it sits outside the colour scan's roots.
 */
import { frameStats, samplePan, type FrameStats } from './sampler.js';

export type Scene = {
  /** Mounted bars or nodes. */
  count: number;
  /** One scripted pan of `durationMs`; resolves with its frame statistics. */
  pan(durationMs: number): Promise<FrameStats>;
};

const ACCENT = '#2f5f9e';

/**
 * Home's Timeline shape (spec §13, "Pan, desktop ... <= 1,200 mounted bars"): a native scroll container three viewports wide
 * holding `bars` absolutely placed 28 px bars in 40 px rows, each a button with a key and a title like the product's bars.
 * The pan scrolls one viewport per second, bouncing at the ends, which is what the engine's keyboard glide and a fling ask of it.
 */
export function timeScene(host: HTMLElement, bars: number): Scene {
  host.replaceChildren();
  const scroller = document.createElement('div');
  scroller.style.cssText = 'width:100%;height:70vh;overflow:auto;overscroll-behavior:contain;position:relative;background:#f0e9e1';
  const surface = document.createElement('div');
  const viewport = Math.max(320, host.clientWidth || window.innerWidth);
  const rows = 14;
  surface.style.cssText = `position:relative;width:${viewport * 3}px;height:${rows * 40 + 34}px`;
  const fragment = document.createDocumentFragment();
  for (let i = 0; i < bars; i += 1) {
    const bar = document.createElement('button');
    const width = 36 + ((i * 29) % 220);
    bar.style.cssText = `position:absolute;left:${(i * 53) % (viewport * 3 - width)}px;top:${34 + (i % rows) * 40 + 6}px;width:${width}px;height:28px;border:none;border-radius:6px;background:${ACCENT};color:#fff;font:600 11px system-ui;text-align:left;overflow:hidden;white-space:nowrap`;
    bar.textContent = `GN-${100 + i}  Ticket ${i} with a long title`;
    fragment.appendChild(bar);
  }
  surface.appendChild(fragment);
  scroller.appendChild(surface);
  host.appendChild(scroller);
  return {
    count: bars,
    async pan(durationMs) {
      scroller.scrollLeft = 0;
      let direction = 1;
      const gaps = await samplePan((dt) => {
        const max = scroller.scrollWidth - scroller.clientWidth;
        const next = scroller.scrollLeft + direction * (scroller.clientWidth * dt) / 1000;
        if (next >= max || next <= 0) direction = -direction;
        scroller.scrollLeft = Math.min(max, Math.max(0, next));
      }, durationMs);
      return frameStats(gaps);
    },
  };
}

/**
 * The flow graph's shape ("a flow of 300 bars/nodes"): one layer under one transform holding `nodes` boxes and about 1.3
 * edges per node as SVG paths, panned and gently zoomed the way `CameraAdapter` moves it.
 */
export function flowScene(host: HTMLElement, nodes: number): Scene {
  host.replaceChildren();
  const view = document.createElement('div');
  view.style.cssText = 'width:100%;height:70vh;overflow:hidden;position:relative;touch-action:none;background:#f0e9e1';
  const layer = document.createElement('div');
  layer.style.cssText = 'position:absolute;left:0;top:0;transform-origin:0 0;will-change:transform';
  const columns = 12;
  const svgNs = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(svgNs, 'svg');
  const rowsCount = Math.ceil(nodes / columns);
  svg.setAttribute('width', String(columns * 180));
  svg.setAttribute('height', String(rowsCount * 80));
  svg.style.cssText = 'position:absolute;left:0;top:0';
  const at = (i: number): { x: number; y: number } => ({ x: (i % columns) * 180 + 10, y: Math.floor(i / columns) * 80 + 10 });
  const edges = Math.floor(nodes * 1.3);
  for (let e = 0; e < edges; e += 1) {
    const from = at(e % nodes);
    const to = at((e * 7 + 13) % nodes);
    const path = document.createElementNS(svgNs, 'path');
    path.setAttribute('d', `M${from.x + 140} ${from.y + 22} L${from.x + 160} ${from.y + 22} L${from.x + 160} ${to.y + 22} L${to.x} ${to.y + 22}`);
    path.setAttribute('stroke', '#8a7f74');
    path.setAttribute('fill', 'none');
    svg.appendChild(path);
  }
  layer.appendChild(svg);
  for (let i = 0; i < nodes; i += 1) {
    const { x, y } = at(i);
    const node = document.createElement('div');
    node.style.cssText = `position:absolute;left:${x}px;top:${y}px;width:140px;height:44px;border-radius:8px;background:${ACCENT};color:#fff;font:600 11px system-ui;padding:6px;box-sizing:border-box;overflow:hidden`;
    node.textContent = `GN-${100 + i} Step ${i}`;
    layer.appendChild(node);
  }
  view.appendChild(layer);
  host.replaceChildren(view);
  return {
    count: nodes,
    async pan(durationMs) {
      let x = 0;
      const gaps = await samplePan((dt, elapsed) => {
        x += (view.clientWidth * dt) / 1000;
        const zoom = 1 + 0.2 * Math.sin(elapsed / 700);
        layer.style.transform = `translate3d(${-(x % (columns * 180))}px,0,0) scale(${zoom})`;
      }, durationMs);
      return frameStats(gaps);
    },
  };
}
