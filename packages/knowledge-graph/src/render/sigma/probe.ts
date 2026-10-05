import type { MultiGraph } from 'graphology';
import type { CameraState } from '../../engine/camera.js';
import type { EdgeAttributes, NodeAttributes } from '../node-attributes.js';
import type { RendererProbe } from '../renderer.js';
import type { KgSigma } from './program.js';

/**
 * The browser suite's eyes (`knowledge-graph-browser`, cases 27.264–27.288). Created ONLY when the mount element carries
 * `data-kg-probe`, which only the harness sets (27.289). Display data keeps every style key the styles set (§4.2 trap 4),
 * so the styles' outputs are read back as Sigma resolved them; sigma@4.0.0-beta.7 names the attachment `labelAttachment`.
 * `inkLog` counts the stage's painted pixels at quarter scale after every frame (the mockup probe `flick3.cjs`'s method);
 * `alphaAt` arms ONE full-scale copy and redraws synchronously (`refresh()` renders at once unless `schedule`).
 */
export function createProbe(
  sigma: KgSigma,
  graph: MultiGraph<NodeAttributes, EdgeAttributes>,
  stage: HTMLElement,
  invalidated: readonly string[],
  fit: () => CameraState | null,
): RendererProbe {
  let frames = 0, rawClicks = 0;
  const ink: number[] = [];
  let armed = false;
  let full: ImageData | null = null;
  const quarter = document.createElement('canvas');
  const copy = (scale: number): ImageData | null => {
    const src = sigma.getStageCanvas();
    const w = Math.max(1, Math.round(src.width * scale)), h = Math.max(1, Math.round(src.height * scale));
    const c = scale === 1 ? document.createElement('canvas') : quarter;
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    if (ctx === null) return null;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(src, 0, 0, w, h);
    return ctx.getImageData(0, 0, w, h);
  };
  sigma.on('clickNode', () => void (rawClicks += 1));
  sigma.on('afterRender', () => {
    frames += 1;
    const q = copy(0.25);
    if (q !== null) {
      let n = 0;
      for (let i = 3; i < q.data.length; i += 4) if (q.data[i]! > 0) n += 1;
      ink.push(n);
    }
    if (armed) {
      armed = false;
      full = copy(1);
    }
  });
  const pixelRatio = () => sigma.getStageCanvas().width / Math.max(1, stage.clientWidth);
  return {
    camera: () => {
      const s = sigma.getCamera().getState();
      return { x: s.x, y: s.y, ratio: s.ratio };
    },
    fitRatio: () => fit()?.ratio ?? 1,
    viewportOf(ref) {
      const d = sigma.getNodeDisplayData(ref);
      return d === undefined ? null : sigma.framedGraphToViewport(d);
    },
    graphAt: (x, y) => sigma.viewportToGraph({ x, y }),
    normalise: (p) => sigma.getNormalizationFunction()(p),
    nodeDisplay(ref) {
      const d = sigma.getNodeDisplayData(ref) as (Record<string, unknown> & { size: number; opacity: number; color: string }) | undefined;
      if (d === undefined) return null;
      return {
        size: d.size,
        opacity: d.opacity,
        image: String(d['image'] ?? ''),
        attachment: (d['labelAttachment'] as string | null | undefined) ?? null,
        color: d.color,
        backdropColor: String(d['backdropColor'] ?? ''),
        backdropBorderColor: String(d['backdropBorderColor'] ?? ''),
      };
    },
    edgeDisplay(id) {
      const d = sigma.getEdgeDisplayData(id);
      return d === undefined ? null : { size: d.size, opacity: d.opacity };
    },
    frames: () => frames,
    rawClicks: () => rawClicks,
    inkLog: () => [...ink],
    clearInk: () => void ink.splice(0),
    alphaAt(points) {
      armed = true;
      full = null;
      sigma.refresh();
      const img = full as ImageData | null;
      if (img === null) return points.map(() => 0);
      const k = pixelRatio();
      return points.map(({ x, y }) => {
        const px = Math.round(x * k), py = Math.round(y * k);
        if (px < 0 || py < 0 || px >= img.width || py >= img.height) return 0;
        return img.data[(py * img.width + px) * 4 + 3]!;
      });
    },
    hitAt(points) {
      // sigma@4.0.0-beta.7 declares the picking read `private`; it is the same read a hover or click makes
      const s = sigma as unknown as { getHitAtPosition(p: { x: number; y: number }): { kind: string; key: string } | null };
      return points.map((p) => {
        const h = s.getHitAtPosition(p);
        return h === null ? null : `${h.kind}:${h.key}`;
      });
    },
    invalidated: () => [...invalidated],
    positions() {
      const out: Record<string, { x: number; y: number }> = {};
      graph.forEachNode((ref, a) => (out[ref] = { x: a.x, y: a.y }));
      return out;
    },
  };
}
