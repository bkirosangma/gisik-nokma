import { SETTLE_MS, panTarget, settleFactor, springStep, zoomTarget, type CameraState } from '../../engine/camera.js';
import { wheelIntent } from '../../engine/wheel.js';
import type { KgSigma } from './program.js';

/** Sigma types a wheel payload's `event` as `MouseCoords`; on a wheel its `original` is the `WheelEvent`. */
type SigmaWheel = { event: { x: number; y: number; original: MouseEvent | TouchEvent; preventSigmaDefault(): void } };

/**
 * The camera spring on Sigma's camera. Port of `loop` / `goTo` / `zoomAt` / `settle` / `panBy` / `onWheel` and the
 * gesture handlers (`knowledge-graph-sigma.html:823-852`); the arithmetic is the pure motion engine (`engine/camera.ts`).
 */
export function createCameraDriver(sigma: KgSigma, el: HTMLElement, fitRatio: () => number, reduce: () => boolean, onChange: (s: CameraState) => void) {
  const cam = sigma.getCamera();
  let target: CameraState | null = null, raf = 0, last = 0, idle: ReturnType<typeof setTimeout> | undefined, ours = false;
  const set = (s: CameraState) => {
    ours = true;
    cam.setState({ ...s, angle: 0 });
    ours = false;
    onChange(s);
  };
  // a Sigma drag or touch pinch moved the camera: follow it, never fight it (`:827`). `updated` passes the new state
  // (`node_modules/sigma/dist/declarations/src/core/camera.d.ts:15`).
  cam.on('updated', (s: CameraState) => {
    if (!ours && raf === 0) target = null;
    if (!ours) onChange(s);
  });
  const loop = (now: number) => {
    const dt = last === 0 ? 0 : now - last;
    last = now;
    const { state, settled } = springStep(cam.getState(), target!, dt === 0 ? 16 : dt, reduce());
    set(state);
    if (settled) {
      raf = 0;
      last = 0;
      return;
    }
    raf = requestAnimationFrame(loop);
  };
  const run = () => {
    if (raf === 0) {
      last = 0;
      raf = requestAnimationFrame(loop);
    }
  };
  const dims = () => ({ width: el.clientWidth, height: el.clientHeight });
  const base = () => target ?? cam.getState();
  function goTo(s: CameraState, instant: boolean): void {
    target = { ...s };
    if (instant || reduce()) {
      cancelAnimationFrame(raf);
      raf = 0;
      set(target);
      return;
    }
    run();
  }
  function zoomAt(factor: number, vx: number, vy: number, soft: boolean): void {
    const b = base();
    const anchor = sigma.viewportToFramedGraph({ x: vx, y: vy }, { cameraState: { ...b, angle: 0 } }); // trap 8
    target = zoomTarget(b, factor, anchor, fitRatio(), soft);
    run();
    clearTimeout(idle);
    idle = setTimeout(settle, SETTLE_MS);
  }
  function settle(): void {
    if (target === null) return;
    const f = settleFactor(target, fitRatio());
    if (f !== null) zoomAt(f, dims().width / 2, dims().height / 2, false);
  }
  function panBy(dx: number, dy: number): void {
    const b = base();
    const a = sigma.viewportToFramedGraph({ x: 0, y: 0 }, { cameraState: { ...b, angle: 0 } });
    const c = sigma.viewportToFramedGraph({ x: dx, y: dy }, { cameraState: { ...b, angle: 0 } });
    target = panTarget(b, { x: c.x - a.x, y: c.y - a.y });
    run();
  }
  // trap 7: cancel Sigma's fixed-step wheel, stop the page scroll, and belt it with a non-passive listener (`:840-848`)
  const onWheel = ({ event }: SigmaWheel) => {
    event.preventSigmaDefault();
    const original = event.original as WheelEvent;
    original.preventDefault();
    const intent = wheelIntent(original);
    if (intent.kind === 'zoom') zoomAt(intent.factor, event.x, event.y, true);
    else panBy(intent.dx, intent.dy);
  };
  sigma.on('wheelStage', onWheel);
  sigma.on('wheelNode', onWheel);
  sigma.on('wheelEdge', onWheel);
  const belt = (e: WheelEvent) => e.preventDefault();
  el.addEventListener('wheel', belt, { passive: false });
  // Safari's trackpad pinch (`:849-851`)
  let gs = 1;
  type Gesture = Event & { scale: number; clientX: number; clientY: number };
  const gStart = (e: Event) => {
    e.preventDefault();
    gs = 1;
  };
  const gChange = (e: Event) => {
    e.preventDefault();
    const g = e as Gesture, r = el.getBoundingClientRect();
    zoomAt(g.scale / gs, g.clientX - r.left, g.clientY - r.top, true);
    gs = g.scale;
  };
  const gEnd = (e: Event) => {
    e.preventDefault();
    settle();
  };
  el.addEventListener('gesturestart', gStart);
  el.addEventListener('gesturechange', gChange);
  el.addEventListener('gestureend', gEnd);
  return {
    goTo,
    zoomCentre: (f: number) => zoomAt(f, dims().width / 2, dims().height / 2, false),
    panBy,
    destroy() {
      cancelAnimationFrame(raf);
      clearTimeout(idle);
      el.removeEventListener('wheel', belt);
      el.removeEventListener('gesturestart', gStart);
      el.removeEventListener('gesturechange', gChange);
      el.removeEventListener('gestureend', gEnd);
    },
  };
}
