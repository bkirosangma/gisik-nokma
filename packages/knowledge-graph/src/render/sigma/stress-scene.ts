import { MultiGraph } from 'graphology';
import type { EdgeAttributes, NodeAttributes } from '../node-attributes.js';
import type { ThemePalette } from '../palette.js';
import { iconUri } from './icons.js';
import { initialsOf } from '../initials.js';
import { cardShape } from './card-box.js';
import { hasHead } from './card-style.js';
import { createSigma, labelsOf } from './program.js';

/**
 * Resolves once Sigma has drawn nothing for `quietMs` (or after `capMs`). The icon atlas and the label attachments are built
 * asynchronously after the first draw and each build redraws, so a quiet render loop is the observable "textures are loaded
 * and uploaded": the first camera move must not be the thing that pays for them (spec §7, cold start).
 */
function renderQuiet(sigma: { on(event: 'afterRender', cb: () => void): unknown; off(event: 'afterRender', cb: () => void): unknown }, quietMs: number, capMs: number): Promise<void> {
  return new Promise((resolve) => {
    let timer = 0;
    const finish = () => {
      window.clearTimeout(timer);
      window.clearTimeout(cap);
      sigma.off('afterRender', arm);
      resolve();
    };
    const arm = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(finish, quietMs);
    };
    const cap = window.setTimeout(finish, capMs);
    sigma.on('afterRender', arm);
    arm();
  });
}

export type SweepStats = { frames: number; fps: number; worstMs: number; p99Ms: number; over167: number; overAt: number[] };
/** `fps`/`worstMs` and the rest describe the FIRST sweep (what the spec §7 bar reads); `pass2` is an identical second sweep, warm. */
export type StressResult = SweepStats & { cards: number; fog: number; edges: number; renderer: string; firstMs: number; pass2: SweepStats };

/** 500 clear + 2,000 fog + 3,000 edges (spec §7), moved for `durationMs` while every frame is timed. */
export async function runStress(
  container: HTMLElement,
  palette: ThemePalette,
  opts: { cards?: number; fog?: number; edges?: number; durationMs?: number } = {},
): Promise<StressResult> {
  const cards = opts.cards ?? 500, fog = opts.fog ?? 2000, edgeCount = opts.edges ?? 3000, durationMs = opts.durationMs ?? 2000;
  const graph = new MultiGraph<NodeAttributes, EdgeAttributes>();
  for (let i = 0; i < cards; i += 1) {
    const a = i * 2.399, r = 40 * Math.sqrt(i);
    const kind = i % 3 === 0 ? 'note' : i % 7 === 0 ? 'person' : 'ticket';
    const image = kind === 'note' ? iconUri({ kind: 'note' }, palette) : kind === 'person' ? iconUri({ kind: 'person', initials: initialsOf(`Person ${i}`) }, palette) : '';
    graph.addNode(`c${i}`, {
      x: r * Math.cos(a), y: r * Math.sin(a), ref: `ticket:c${i}`, kind, fog: false, lv: i < 25 ? 'chip' : 'compact', center: i === 0,
      lbl: `GN-${100 + i}`, sub: i < 25 ? `Ticket ${i} with a title long enough to wrap` : null, image, sug: false, cat: (['open', 'active', 'terminal'] as const)[i % 3] ?? null,
    });
  }
  for (let i = 0; i < fog; i += 1) {
    const a = i * 2.399, r = 40 * Math.sqrt(cards) + 12 * Math.sqrt(i + 1) * 3;
    graph.addNode(`f${i}`, { x: r * Math.cos(a), y: r * Math.sin(a), ref: `ticket:f${i}`, kind: 'ticket', fog: true, lv: 'fog', center: false, lbl: '', sub: null, image: '', sug: false, cat: null });
  }
  const nodes = graph.nodes();
  const groups = ['structure', 'blocks', 'relates', 'dup', 'attached', 'ref', 'people'] as const;
  for (let i = 0, k = 0; k < edgeCount; i += 1) {
    const a = nodes[(i * 7919) % nodes.length]!, b = nodes[(i * 104729 + 13) % nodes.length]!;
    if (a === b) continue;
    graph.addEdgeWithKey(`x${k}`, a, b, { id: `x${k}`, grp: groups[k % groups.length]!, fog: a.startsWith('f') || b.startsWith('f'), sug: false, on: false, card: null });
    k += 1;
  }
  const sigma = createSigma(graph, container, () => palette, { nodeHovered: () => false, highlightOn: () => false });
  // the heads end at their target's card border, as the adapter draws them (owner ruling B): the sweep pays for that search
  const labels = labelsOf(sigma);
  graph.updateEachEdgeAttributes((_id, a, _s, target) => (hasHead(a) ? { ...a, card: cardShape(graph.getNodeAttributes(target), labels) } : a));
  await renderQuiet(sigma, 200, 10_000);
  const camera = sigma.getCamera();
  /** One timed camera sweep: every frame's delta, from a fresh `last`. */
  const sweep = () =>
    new Promise<number[]>((done) => {
      const deltas: number[] = [];
      let last = performance.now();
      const t0 = last;
      const frame = (now: number) => {
        deltas.push(now - last);
        last = now;
        const t = (now - t0) / durationMs;
        camera.setState({ x: 0.5 + 0.15 * Math.sin(t * 6.28), y: 0.5 + 0.1 * Math.cos(t * 6.28), ratio: 0.6 + 0.4 * Math.abs(Math.sin(t * 3.14)), angle: 0 });
        if (now - t0 < durationMs) requestAnimationFrame(frame); else done(deltas);
      };
      requestAnimationFrame(frame);
    });
  const summary = (deltas: number[]) => {
    const sorted = [...deltas].sort((a, b) => a - b);
    return {
      frames: deltas.length,
      fps: +(deltas.length / (durationMs / 1000)).toFixed(1),
      worstMs: +Math.max(0, ...deltas).toFixed(1),
      p99Ms: +(sorted[Math.min(sorted.length - 1, Math.ceil(0.99 * sorted.length) - 1)] ?? 0).toFixed(1),
      over167: deltas.filter((d) => d > 16.7).length,
      overAt: deltas.flatMap((d, i) => (d > 16.7 ? [i] : [])),
    };
  };
  const first = await sweep();
  const second = await sweep(); // a second identical sweep: whatever is one-time work (texture uploads, shader compiles) is paid by now
  const gl = container.querySelector('canvas')?.getContext('webgl2');
  const info = gl?.getExtension('WEBGL_debug_renderer_info');
  const renderer = gl && info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : 'unknown';
  const result: StressResult = { cards, fog, edges: graph.size, renderer, ...summary(first), firstMs: +(first[0] ?? 0).toFixed(1), pass2: summary(second) };
  sigma.kill();
  return result;
}
