import { MultiGraph } from 'graphology';
import type { EdgeAttributes, NodeAttributes } from '../node-attributes.js';
import type { ThemePalette } from '../palette.js';
import { iconUri } from './icons.js';
import { initialsOf } from '../initials.js';
import { createSigma } from './program.js';

export type StressResult = { cards: number; fog: number; edges: number; fps: number; worstMs: number; renderer: string };

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
    graph.addEdgeWithKey(`x${k}`, a, b, { id: `x${k}`, grp: groups[k % groups.length]!, fog: a.startsWith('f') || b.startsWith('f'), sug: false, on: false });
    k += 1;
  }
  const sigma = createSigma(graph, container, () => palette, { nodeHovered: () => false, highlightOn: () => false });
  await new Promise((resolve) => setTimeout(resolve, 300));
  const camera = sigma.getCamera();
  let frames = 0, worst = 0, last = performance.now();
  const t0 = last;
  await new Promise<void>((done) => {
    const frame = (now: number) => {
      frames += 1; worst = Math.max(worst, now - last); last = now;
      const t = (now - t0) / durationMs;
      camera.setState({ x: 0.5 + 0.15 * Math.sin(t * 6.28), y: 0.5 + 0.1 * Math.cos(t * 6.28), ratio: 0.6 + 0.4 * Math.abs(Math.sin(t * 3.14)), angle: 0 });
      if (now - t0 < durationMs) requestAnimationFrame(frame); else done();
    };
    requestAnimationFrame(frame);
  });
  const gl = container.querySelector('canvas')?.getContext('webgl2');
  const info = gl?.getExtension('WEBGL_debug_renderer_info');
  const renderer = gl && info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : 'unknown';
  const result = { cards, fog, edges: graph.size, fps: +(frames / (durationMs / 1000)).toFixed(1), worstMs: +worst.toFixed(1), renderer };
  sigma.kill();
  return result;
}
