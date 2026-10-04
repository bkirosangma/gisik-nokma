import { useLayoutEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { DrawIndex, TimelinePainter, attachDriver, type View, type Windowed } from '@gisik-nokma/app-core/timeline-graph';
import { themeStylesheet } from '@gisik-nokma/ui/tokens';
import '@gisik-nokma/ui/ui.css';
import { DESKTOP, PHONE, PPD, makeHomeScene, type HomeScene } from './timeline-scene';

/**
 * `timeline-stress.html?scene=desktop|phone[&auto=1]` (WTG Part 4 T2; cases 29.300-29.302). The Home-shaped scene in the
 * product's own scroller, bridge and painter: a scripted pan writes the scroller's `scrollLeft` once a frame, as a finger or a
 * trackpad would; Part 1's adapter, through `attachDriver`, turns that into a quantised window and `TimelinePainter` mounts what
 * is near it. `window.__tlg.run(mode)` answers a `Result`; the Run button shows it on the page (the real phone, 29.302).
 */
export type Mode = 'desktop' | 'phone' | 'unwindowed';
export type Result = {
  mode: Mode;
  fps: number;
  worstMs: number;
  frames: number;
  maxMounted: number;
  minMounted: number;
  /** Frames painted while a bar inside the scroller's visible box was NOT in the DOM (a short frame counts, not only an empty one). */
  emptyFrames: number;
  scrollYBefore: number;
  scrollYAfter: number;
  count: number;
  overscan: number;
  quantisePx: number;
  stage: { w: number; h: number };
  /** Step 7 diagnosis: each window change's render + commit (the `flushSync` inside the adapter's frame), and the frames over 50 ms. */
  diag: { renders: number; renderMaxMs: number; renderMeanMs: number; over50: number; p95Ms: number; long: Array<{ i: number; ms: number; renderMs: number }> };
};

/**
 * The two levers spec §13 leaves to this task (Step 7): px mounted beyond the window on each side, and the quantum of a window
 * change. Measured on the Pixel 7 proxy (29.301): a 256 px quantum made each change mount a 256 px strip of new bars at once and
 * the worst frame missed 50 ms; 128 halves the strip. The overscan is the lead the painter's deferred render has before a bar
 * enters the view (256 px is 0.6 s at the phone pan's speed, 0.18 s at the desktop one's).
 */
export const OVERSCAN_PX = 256;
export const QUANTISE_PX = 128;

const params = new URLSearchParams(location.search);
/** Tuning knobs (Step 4 / Step 7): `q` the quantum, `o` the overscan, `n` the phone scene's bar count. Absent: the constants. */
const knob = (name: string, fallback: number): number => (params.has(name) ? Number(params.get(name)) : fallback);
const quantum = knob('q', QUANTISE_PX);
const phoneSpec = { ...PHONE, count: knob('n', PHONE.count) };
const sceneParam: Mode = params.get('scene') === 'phone' ? 'phone' : 'desktop';
const out = document.getElementById('out') as HTMLElement;
document.documentElement.dataset['style'] = 'neo';
const themeTag = document.createElement('style');
themeTag.textContent = themeStylesheet();
document.head.appendChild(themeTag);

/** `performance.now()` at the end of each window change's render, and how long it took. */
let renders: Array<{ at: number; ms: number }> = [];
let onReady: ((w: Windowed) => void) | null = null;

function Stage({ scene, overscan }: { scene: HomeScene; overscan: number }): ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  const index = useMemo(() => new DrawIndex(scene.draws), [scene]);
  const [view, setView] = useState<View>({ x0: 0, x1: 0, y0: 0, y1: 0 });
  useLayoutEffect(() => {
    const w = attachDriver(ref.current as HTMLDivElement, { quantisePx: quantum, firstDay: 0, ppd: PPD, extentDays: () => scene.days });
    setView(w.current());
    // flushSync: the window change renders inside the frame the adapter reported it in, so the frame that paints the
    // new scroll position also paints its bars.
    const off = w.onWindow((v) => {
      const t = performance.now();
      flushSync(() => setView(v));
      const end = performance.now();
      renders.push({ at: end, ms: end - t });
    });
    onReady?.(w);
    return () => {
      off();
      w.destroy();
    };
  }, [scene]);
  return (
    <div ref={ref} id="tlg-stage" className="gn-tlg-scroller" style={{ height: window.innerHeight - 120 }}>
      <TimelinePainter draws={scene.draws} index={index} view={view} overscan={overscan} width={scene.width} height={scene.height} />
    </div>
  );
}

const root = createRoot(document.getElementById('tlg-stage-host') as HTMLElement);
let generation = 0;
const frames = (n: number): Promise<void> => new Promise((resolve) => {
  const step = (k: number): void => { if (k === 0) resolve(); else requestAnimationFrame(() => step(k - 1)); };
  step(n);
});

/** Mounts a fresh stage and resolves two frames after its first paint. */
async function mountScene(scene: HomeScene, overscan: number): Promise<void> {
  await new Promise<Windowed>((resolve) => {
    onReady = resolve;
    generation += 1;
    root.render(<Stage key={generation} scene={scene} overscan={overscan} />);
  });
  await frames(2);
}

/** Frames until the canvas's children have not changed for 10 frames in a row (the painter's deferred window has caught up), at most 5 s. */
async function settle(canvas: HTMLElement): Promise<void> {
  let changed = false;
  const watch = new MutationObserver(() => {
    changed = true;
  });
  watch.observe(canvas, { childList: true });
  const t0 = performance.now();
  for (let quiet = 0; quiet < 10 && performance.now() - t0 < 5_000; ) {
    await frames(1);
    quiet = changed ? 0 : quiet + 1;
    changed = false;
  }
  watch.disconnect();
}

async function run(mode: Mode): Promise<Result> {
  const scene = makeHomeScene(mode === 'phone' ? phoneSpec : DESKTOP);
  const index = new DrawIndex(scene.draws); // the same index the painter queries, so "bars in view" is measured, not assumed
  const overscan = mode === 'unwindowed' ? scene.width : knob('o', OVERSCAN_PX);
  await mountScene(scene, overscan);
  const stage = document.getElementById('tlg-stage') as HTMLElement;
  const canvas = stage.firstElementChild as HTMLElement;
  window.scrollTo(0, 0);
  stage.scrollTo(0, 0);
  await settle(canvas);
  const vw = stage.clientWidth;
  const vh = stage.clientHeight;
  const scrollYBefore = window.scrollY;
  let mountedIds = new Set<string>();
  // Re-read the DOM's mounted ids only after the canvas's children changed (any commit of the painter, deferred or not).
  let dirty = true;
  const watch = new MutationObserver(() => {
    dirty = true;
  });
  watch.observe(canvas, { childList: true });
  /** Was a bar in the visible box missing from the DOM in the frame just painted? Read at the START of a tick, before its write. */
  const short = (): boolean => {
    if (dirty) {
      dirty = false;
      mountedIds = new Set([...canvas.querySelectorAll('[data-draw-id]')].map((e) => e.getAttribute('data-draw-id') ?? ''));
    }
    const x = stage.scrollLeft;
    const y = stage.scrollTop;
    for (const d of index.query({ x0: x, x1: x + vw, y0: y, y1: y + vh })) if (!mountedIds.has(d.id)) return true;
    return false;
  };
  let x = 0;
  let last = performance.now();
  let worst = 0;
  let count = 0;
  let maxM = 0;
  let minM = Infinity;
  let empty = 0;
  const t0 = last;
  const total = vw * 10;
  const gaps: Array<{ i: number; now: number; ms: number }> = [];
  renders = [];
  await new Promise<void>((done) => {
    const tick = (now: number): void => {
      const dt = now - last;
      last = now;
      if (count > 0) {
        worst = Math.max(worst, dt);
        gaps.push({ i: count, now, ms: dt });
        if (short()) empty += 1;
      }
      count += 1;
      const mounted = Number(canvas.dataset['mounted'] ?? 0);
      maxM = Math.max(maxM, mounted);
      minM = Math.min(minM, mounted);
      if (x >= total) {
        done();
        return;
      }
      x = Math.min(total, x + (vw * dt) / 1000);
      stage.scrollLeft = x;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  watch.disconnect();
  const round = (n: number): number => Math.round(n * 10) / 10;
  const sorted = gaps.map((g) => g.ms).sort((a, b) => a - b);
  const renderIn = (g: { now: number; ms: number }): number => renders.filter((r) => r.at > g.now - g.ms && r.at <= g.now).reduce((t, r) => t + r.ms, 0);
  const diag = {
    renders: renders.length,
    renderMaxMs: round(Math.max(0, ...renders.map((r) => r.ms))),
    renderMeanMs: round(renders.reduce((t, r) => t + r.ms, 0) / Math.max(1, renders.length)),
    over50: gaps.filter((g) => g.ms > 50).length,
    p95Ms: round(sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)] ?? 0),
    long: gaps.filter((g) => g.ms > 50).slice(0, 10).map((g) => ({ i: g.i, ms: round(g.ms), renderMs: round(renderIn(g)) })),
  };
  return {
    mode, fps: round((count * 1000) / (performance.now() - t0)), worstMs: round(worst), frames: count, maxMounted: maxM, minMounted: minM,
    emptyFrames: empty, scrollYBefore, scrollYAfter: window.scrollY, count: scene.count, overscan, quantisePx: quantum, stage: { w: vw, h: vh }, diag,
  };
}

(window as unknown as { __tlg: { run(mode: Mode): Promise<Result> } }).__tlg = { run };

async function go(): Promise<void> {
  out.textContent = '';
  const r = await run(sceneParam);
  out.textContent = `${r.fps} frames a second\nworst frame ${r.worstMs} ms\nat most ${r.maxMounted} on the page\n${r.emptyFrames} frames short of the view\n${r.mode}: ${r.count} bars, ${r.stage.w} x ${r.stage.h} px`;
}
document.getElementById('run')?.addEventListener('click', () => void go());
if (params.has('auto')) void go();
