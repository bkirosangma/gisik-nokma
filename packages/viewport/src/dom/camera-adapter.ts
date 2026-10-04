import type { AnimateOptions, AnimateTarget, Frame, ViewportDriver } from '../driver.js';
import { momentumStep, releaseVelocity, type PanSample } from '../momentum.js';
import { stepGeometric, stepLinear, tauFor } from '../spring.js';
import { wheelIntent } from '../wheel.js';
import { browserClock, createFrameLoop, prefersReducedMotion, type Clock } from './clock.js';

const MAX_GLIDE_MS = 450;
const QUIET_MS = 100;
const KEY_PAN_PX = 80;
const KEY_ZOOM = 1.25;

export type CameraAdapterOptions = {
  /** The element that receives pointer, wheel and key input (its `touch-action` is set to `none` here). */
  element: HTMLElement;
  /** The one layer that moves: a `div` or an `svg` group. Only its `transform` is written. */
  layer: HTMLElement | SVGElement;
  minZoom: number;
  maxZoom: number;
  /** World px at the viewport's top-left, and the zoom, to start from. */
  start?: { x: number; y: number; zoom: number };
  reducedMotion?: () => boolean;
  clock?: Clock;
};

export type Camera = { x: number; y: number; zoom: number };
type Pointer = { x: number; y: number };
type Glide = { target: Partial<Camera>; anchor: Pointer; tauPan: number; tauZoom: number };

/**
 * A free 2D camera over one layer (spec VP-0), for the Workflow graph: pan by drag (mouse, pen and touch), pinch,
 * Ctrl + wheel and notched-wheel zoom about the pointer, a pixel wheel scroll pans, keys pan and zoom, glides and a
 * momentum release. Movement is ONE `transform` write per frame (VP-8). The camera is `{x, y, zoom}`: the world point at
 * the viewport's top-left corner and px per world unit, so `screen = (world - camera) * zoom`.
 *
 * As a `ViewportDriver` its axis is world x: `offset()` is the left edge, `scale()` is the zoom.
 */
export class CameraAdapter implements ViewportDriver {
  private cam: Camera;
  private readonly el: HTMLElement;
  private readonly layer: HTMLElement | SVGElement;
  private readonly clock: Clock;
  private readonly loop;
  private readonly callbacks = new Set<(frame: Frame) => void>();
  private readonly pointers = new Map<number, Pointer>();
  private glide: Glide | null = null;
  private momentum: { vx: number; vy: number } | null = null;
  private samples: Array<{ t: number; x: number; y: number }> = [];
  /** `world` is the world point under the fingers' midpoint when the pinch began: it stays under the midpoint as it moves. */
  private pinch: { distance: number; zoom: number; world: Pointer } | null = null;
  private lastScrollAt = Number.NEGATIVE_INFINITY;
  private lastX: number;
  private velocity = 0;
  private readonly removers: Array<() => void> = [];

  constructor(private readonly options: CameraAdapterOptions) {
    this.el = options.element;
    this.layer = options.layer;
    this.clock = options.clock ?? browserClock;
    // A copy: the camera is written in place, and the caller's `start` must not move with it.
    this.cam = options.start === undefined ? { x: 0, y: 0, zoom: 1 } : { ...options.start };
    this.lastX = this.cam.x;
    this.el.style.touchAction = 'none';
    this.el.style.overscrollBehavior = 'contain';
    this.paint();
    this.loop = createFrameLoop(this.clock, (now, dt) => this.tick(now, dt));
    this.listen('wheel', (e) => this.onWheel(e as WheelEvent), { passive: false });
    this.listen('pointerdown', (e) => this.onPointerDown(e as PointerEvent));
    this.listen('pointermove', (e) => this.onPointerMove(e as PointerEvent));
    this.listen('pointerup', (e) => this.onPointerEnd(e as PointerEvent));
    this.listen('pointercancel', (e) => this.onPointerEnd(e as PointerEvent));
    this.listen('keydown', (e) => this.onKeyDown(e as KeyboardEvent));
  }

  // ---- ViewportDriver ----
  offset(): number {
    return this.cam.x;
  }
  scale(): number {
    return this.cam.zoom;
  }
  visibleRange(): { start: number; end: number } {
    return { start: Math.floor(this.cam.x), end: Math.ceil(this.cam.x + this.el.clientWidth / this.cam.zoom) };
  }
  onFrame(callback: (frame: Frame) => void): () => void {
    this.callbacks.add(callback);
    return () => this.callbacks.delete(callback);
  }
  animateTo(target: AnimateTarget, options: AnimateOptions = {}): void {
    this.camera({ ...(target.offset === undefined ? {} : { x: target.offset }), ...(target.scale === undefined ? {} : { zoom: target.scale }) }, options);
  }

  // ---- the camera ----
  getCamera(): Camera {
    return { ...this.cam };
  }
  /** Glide the camera (any of x, y, zoom). A zoom without a position holds the anchor still. */
  camera(target: Partial<Camera>, options: AnimateOptions = {}): void {
    const reduce = options.instant === true || (this.options.reducedMotion ?? prefersReducedMotion)();
    const maxMs = Math.min(options.maxMs ?? MAX_GLIDE_MS, MAX_GLIDE_MS);
    const anchor = options.anchorPx === undefined ? { x: this.el.clientWidth / 2, y: this.el.clientHeight / 2 } : { x: options.anchorPx, y: this.el.clientHeight / 2 };
    this.momentum = null;
    const zoom = target.zoom === undefined ? undefined : this.clampZoom(target.zoom);
    if (reduce) {
      this.glide = null;
      this.jump({ ...target, ...(zoom === undefined ? {} : { zoom }) }, anchor);
      this.wake();
      return;
    }
    const dx = target.x === undefined ? 0 : (target.x - this.cam.x) * this.cam.zoom;
    const dy = target.y === undefined ? 0 : (target.y - this.cam.y) * this.cam.zoom;
    this.glide = {
      target: { ...target, ...(zoom === undefined ? {} : { zoom }) },
      anchor,
      tauPan: tauFor(Math.hypot(dx, dy), 0.5, maxMs),
      tauZoom: tauFor(zoom === undefined ? 1 : 1000 * Math.abs(Math.log(zoom / this.cam.zoom)), 1, maxMs),
    };
    this.wake();
  }
  /** Screen px (relative to the element) to world units. */
  toWorld(px: Pointer): Pointer {
    return { x: this.cam.x + px.x / this.cam.zoom, y: this.cam.y + px.y / this.cam.zoom };
  }
  destroy(): void {
    this.loop.stop();
    for (const remove of this.removers.splice(0)) remove();
    this.callbacks.clear();
  }

  // ---- internals ----
  private clampZoom(zoom: number): number {
    return Math.min(this.options.maxZoom, Math.max(this.options.minZoom, zoom));
  }
  private paint(): void {
    const { x, y, zoom } = this.cam;
    this.layer.style.transform = `translate(${-x * zoom}px, ${-y * zoom}px) scale(${zoom})`;
    this.layer.style.transformOrigin = '0 0';
  }
  /** Zoom with the world point under `anchor` held still. */
  private zoomAbout(zoom: number, anchor: Pointer): void {
    const next = this.clampZoom(zoom);
    const world = this.toWorld(anchor);
    this.cam = { zoom: next, x: world.x - anchor.x / next, y: world.y - anchor.y / next };
  }
  private jump(target: Partial<Camera>, anchor: Pointer): void {
    if (target.zoom !== undefined) this.zoomAbout(target.zoom, anchor);
    if (target.x !== undefined) this.cam.x = target.x;
    if (target.y !== undefined) this.cam.y = target.y;
    this.paint();
  }
  private wake(): void {
    this.loop.start();
  }
  private tick(now: number, dt: number): boolean {
    let busy = false;
    if (this.glide !== null) {
      const g = this.glide;
      const reduce = false;
      let done = true;
      if (g.target.zoom !== undefined) {
        const r = stepGeometric(this.cam.zoom, g.target.zoom, dt, 1e-3, reduce, g.tauZoom);
        this.zoomAbout(r.value, g.anchor);
        done = done && r.settled;
      }
      if (g.target.x !== undefined) {
        const r = stepLinear(this.cam.x, g.target.x, dt, 0.5 / this.cam.zoom, reduce, g.tauPan);
        this.cam.x = r.value;
        done = done && r.settled;
      }
      if (g.target.y !== undefined) {
        const r = stepLinear(this.cam.y, g.target.y, dt, 0.5 / this.cam.zoom, reduce, g.tauPan);
        this.cam.y = r.value;
        done = done && r.settled;
      }
      if (done) this.glide = null;
      busy = !done;
    }
    if (this.momentum !== null) {
      const mx = momentumStep(0, this.momentum.vx, dt);
      const my = momentumStep(0, this.momentum.vy, dt);
      this.cam.x -= mx.offset / this.cam.zoom;
      this.cam.y -= my.offset / this.cam.zoom;
      this.momentum = mx.stopped && my.stopped ? null : { vx: mx.velocity, vy: my.velocity };
      busy = busy || this.momentum !== null;
    }
    this.paint();
    const seconds = Math.max(dt, 1) / 1000;
    this.velocity = dt > 0 ? this.velocity * 0.8 + ((this.cam.x - this.lastX) / seconds) * 0.2 : this.velocity;
    this.lastX = this.cam.x;
    const moving = busy || this.pointers.size > 0 || now - this.lastScrollAt < QUIET_MS;
    if (!moving) this.velocity = 0;
    for (const callback of [...this.callbacks]) callback({ now, offset: this.cam.x, scale: this.cam.zoom, velocity: this.velocity, moving });
    return moving;
  }

  private local(e: { clientX: number; clientY: number }): Pointer {
    const rect = this.el.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  private onWheel(e: WheelEvent): void {
    e.preventDefault();
    this.glide = null;
    this.momentum = null;
    const intent = wheelIntent(e);
    if (intent.kind === 'zoom') this.zoomAbout(this.cam.zoom * intent.factor, this.local(e));
    else {
      this.cam.x += intent.dx / this.cam.zoom;
      this.cam.y += intent.dy / this.cam.zoom;
    }
    this.paint();
    this.lastScrollAt = this.clock.now();
    this.wake();
  }

  private onPointerDown(e: PointerEvent): void {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    this.glide = null;
    this.momentum = null;
    this.pointers.set(e.pointerId, this.local(e));
    this.el.setPointerCapture?.(e.pointerId);
    this.samples = [{ t: this.clock.now(), ...this.local(e) }];
    this.pinch = this.pointers.size === 2 ? { distance: this.pinchDistance(), zoom: this.cam.zoom, world: this.toWorld(this.pinchMid()) } : null;
    this.wake();
  }

  private pinchMid(): Pointer {
    const [a, b] = [...this.pointers.values()];
    return a === undefined || b === undefined ? { x: 0, y: 0 } : { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }

  private pinchDistance(): number {
    const [a, b] = [...this.pointers.values()];
    return a === undefined || b === undefined ? 0 : Math.hypot(a.x - b.x, a.y - b.y);
  }

  private onPointerMove(e: PointerEvent): void {
    const before = this.pointers.get(e.pointerId);
    if (before === undefined) return;
    const now = this.local(e);
    this.pointers.set(e.pointerId, now);
    if (this.pointers.size === 2 && this.pinch !== null && this.pinch.distance > 0) {
      // Pinch and two-finger pan are one gesture: the world point first under the midpoint follows the midpoint.
      const zoom = this.clampZoom((this.pinch.zoom * this.pinchDistance()) / this.pinch.distance);
      const mid = this.pinchMid();
      this.cam = { zoom, x: this.pinch.world.x - mid.x / zoom, y: this.pinch.world.y - mid.y / zoom };
    } else if (this.pointers.size === 1) {
      this.cam.x -= (now.x - before.x) / this.cam.zoom;
      this.cam.y -= (now.y - before.y) / this.cam.zoom;
      this.samples.push({ t: this.clock.now(), ...now });
      if (this.samples.length > 12) this.samples.shift();
    }
    this.paint();
  }

  private onPointerEnd(e: PointerEvent): void {
    if (!this.pointers.delete(e.pointerId)) return;
    this.el.releasePointerCapture?.(e.pointerId);
    this.pinch = null;
    if (this.pointers.size === 0 && e.type === 'pointerup' && !(this.options.reducedMotion ?? prefersReducedMotion)()) {
      const t = this.clock.now();
      const vx = releaseVelocity(this.samples.map((s): PanSample => ({ t: s.t, x: s.x })), t);
      const vy = releaseVelocity(this.samples.map((s): PanSample => ({ t: s.t, x: s.y })), t);
      if (vx !== 0 || vy !== 0) this.momentum = { vx, vy };
    }
    this.wake();
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    if ((e.target as Element | null)?.closest('input, textarea, select, [contenteditable="true"]') != null) return;
    const base = this.glide?.target ?? {};
    const x = base.x ?? this.cam.x;
    const y = base.y ?? this.cam.y;
    const zoom = base.zoom ?? this.cam.zoom;
    const step = (KEY_PAN_PX * (e.shiftKey ? 4 : 1)) / this.cam.zoom;
    const pan = (dx: number, dy: number): void => {
      e.preventDefault();
      this.camera({ x: x + dx, y: y + dy });
    };
    if (e.key === 'ArrowLeft') pan(-step, 0);
    else if (e.key === 'ArrowRight') pan(step, 0);
    else if (e.key === 'ArrowUp') pan(0, -step);
    else if (e.key === 'ArrowDown') pan(0, step);
    else if (e.key === '+' || e.key === '=') {
      e.preventDefault();
      this.camera({ zoom: zoom * KEY_ZOOM });
    } else if (e.key === '-' || e.key === '_') {
      e.preventDefault();
      this.camera({ zoom: zoom / KEY_ZOOM });
    }
  }

  private listen(type: string, handler: (e: Event) => void, options?: AddEventListenerOptions): void {
    this.el.addEventListener(type, handler, options);
    this.removers.push(() => this.el.removeEventListener(type, handler, options));
  }
}
