import { MAX_PPD, clampPpd, dayAt } from '../anchored-zoom.js';
import type { AnimateOptions, AnimateTarget, Frame, ViewportDriver } from '../driver.js';
import { momentumStep, releaseVelocity, type PanSample } from '../momentum.js';
import { rubberOvershoot, SPRING_BACK_MS } from '../rubber-band.js';
import { stepGeometric, stepLinear, tauFor } from '../spring.js';
import { wheelZoomFactor } from '../wheel.js';
import { browserClock, createFrameLoop, prefersReducedMotion, type Clock } from './clock.js';

/** A browser stops honouring a scroll position past about this many px (Firefox ~17.9 M, Chrome ~33.5 M). */
export const MAX_SCROLL_PX = 16_000_000;
const MAX_GLIDE_MS = 450;
const QUIET_MS = 100;
const DRAG_SLOP_PX = 4;
/** One notch of `+` / `-`. */
const KEY_ZOOM = 1.25;

export type ScrollAdapterOptions = {
  /** The `overflow: auto` container. Its FIRST child is the surface that carries the drawn length. */
  element: HTMLElement;
  /** `x`: time runs left to right. `y`: time runs down (portrait). */
  axis?: 'x' | 'y';
  /** The day at scroll position 0. */
  firstDay: number;
  /** Starting px per day. */
  scale: number;
  /** How many days the surface draws, so the zoom can be capped below the browser's scroll size. */
  extentDays: () => number;
  /** Today's day, for Home and `T`. Absent: those keys do nothing. */
  todayDay?: () => number;
  /** The CSS custom property that carries px per day to the surface. */
  scaleVar?: string;
  reducedMotion?: () => boolean;
  clock?: Clock;
};

type Glide = { offset: number | null; scale: number | null; anchorPx: number; tauOffset: number; tauScale: number; reduce: boolean };
type Drag = { id: number; startClient: number; startPos: number; samples: PanSample[]; moved: boolean };

/**
 * A native scroll container with a virtualised surface (spec VP-0). The platform keeps its touch momentum, wheel and
 * keyboard scrolling; this adds what it cannot do: glides (Today, keyboard, jump to a ticket), an anchored zoom, a mouse
 * drag with momentum and a rubber band, and a single stream of frames carrying the smoothed velocity.
 *
 * Px per day lives in ONE CSS custom property (`--tl-ppd`) that the stylesheet multiplies into every bar's left and
 * width, so a zoom frame is one custom-property write and one scroll write, with no React render and no per-bar work.
 */
export class ScrollAdapter implements ViewportDriver {
  private readonly el: HTMLElement;
  private readonly horizontal: boolean;
  private readonly clock: Clock;
  private readonly scaleVar: string;
  private readonly callbacks = new Set<(frame: Frame) => void>();
  private readonly loop;
  private firstDay: number;
  private ppd: number;
  private glide: Glide | null = null;
  private momentum: number | null = null;
  private overshoot = 0;
  private springing = false;
  private springTau = 85;
  private drag: Drag | null = null;
  private swallowClick = false;
  private velocity = 0;
  private lastOffset: number;
  private lastScrollAt = Number.NEGATIVE_INFINITY;
  /** The exact scroll position last asked for, and the value the DOM held right after that write (see `pos`). */
  private exact = 0;
  private written = Number.NaN;
  private readonly removers: Array<() => void> = [];

  constructor(private readonly options: ScrollAdapterOptions) {
    this.el = options.element;
    this.horizontal = (options.axis ?? 'x') === 'x';
    this.clock = options.clock ?? browserClock;
    this.scaleVar = options.scaleVar ?? '--tl-ppd';
    this.firstDay = options.firstDay;
    this.ppd = this.capped(options.scale);
    this.el.style.setProperty(this.scaleVar, String(this.ppd));
    this.lastOffset = this.offset();
    this.loop = createFrameLoop(this.clock, (now, dt) => this.tick(now, dt));
    this.listen(this.el, 'scroll', () => this.onScroll(), { passive: true });
    this.listen(this.el, 'wheel', (e) => this.onWheel(e as WheelEvent), { passive: false });
    this.listen(this.el, 'pointerdown', (e) => this.onPointerDown(e as PointerEvent));
    this.listen(this.el, 'pointermove', (e) => this.onPointerMove(e as PointerEvent));
    this.listen(this.el, 'pointerup', (e) => this.onPointerEnd(e as PointerEvent));
    this.listen(this.el, 'pointercancel', (e) => this.onPointerEnd(e as PointerEvent));
    this.listen(this.el, 'click', (e) => this.onClickCapture(e), { capture: true });
    this.listen(this.el, 'keydown', (e) => this.onKeyDown(e as KeyboardEvent));
  }

  // ---- ViewportDriver ----
  offset(): number {
    return this.firstDay + this.pos() / this.ppd;
  }
  scale(): number {
    return this.ppd;
  }
  visibleRange(): { start: number; end: number } {
    const off = this.offset();
    return { start: Math.floor(off), end: Math.max(Math.floor(off), Math.ceil(off + this.viewportDays()) - 1) };
  }
  onFrame(callback: (frame: Frame) => void): () => void {
    this.callbacks.add(callback);
    return () => this.callbacks.delete(callback);
  }
  animateTo(target: AnimateTarget, options: AnimateOptions = {}): void {
    const reduce = options.instant === true || this.reduced();
    const maxMs = Math.min(options.maxMs ?? MAX_GLIDE_MS, MAX_GLIDE_MS);
    const anchorPx = options.anchorPx ?? this.size() / 2;
    const scale = target.scale === undefined ? null : this.capped(target.scale);
    const offset = target.offset === undefined ? null : target.offset;
    this.momentum = null;
    if (reduce) {
      this.glide = null;
      if (scale !== null) this.applyScale(scale, anchorPx);
      if (offset !== null) this.setOffset(offset);
      this.wake();
      return;
    }
    const distancePx = offset === null ? 0 : Math.abs(offset - this.offset()) * this.ppd;
    this.glide = {
      offset,
      scale,
      anchorPx,
      tauOffset: tauFor(distancePx, 0.5, maxMs),
      tauScale: tauFor(scale === null ? 1 : this.ppd * Math.abs(Math.log(scale / this.ppd)), 0.01, maxMs),
      reduce: false,
    };
    this.wake();
  }

  // ---- extras the time views use ----
  /** The surface's first day moved (data arrived to the left): keep the same day at the viewport edge. */
  rebase(newFirstDay: number): void {
    const keep = this.offset();
    this.firstDay = newFirstDay;
    this.setOffset(keep);
    this.lastOffset = this.offset();
  }
  /** Pan by px with no animation (tests, and the harness's scripted pan). */
  scrollByPx(px: number): void {
    this.write(this.pos() + px);
  }
  viewportDays(): number {
    return this.size() / this.ppd;
  }
  maxScale(): number {
    return Math.max(4, Math.min(MAX_PPD, Math.floor(MAX_SCROLL_PX / Math.max(1, this.options.extentDays()))));
  }
  destroy(): void {
    this.loop.stop();
    for (const remove of this.removers.splice(0)) remove();
    this.callbacks.clear();
    this.el.style.removeProperty('--tl-overshoot');
  }

  // ---- geometry ----
  /**
   * The scroll position in px. A browser at device-pixel-ratio 1 rounds `scrollLeft` to a whole pixel, so reading it back
   * between frames would feed that rounding into the next frame and the zoom anchor would random-walk (each frame up to 0.5
   * px off the last). The engine therefore remembers the EXACT position it asked for (`exact`) and the value the DOM held right
   * after the write (`written`); while the DOM still shows `written`, nobody else has scrolled and `exact` is the truth. Any
   * other value (a touch pan, the scrollbar, the platform's momentum) wins, because then the platform moved it.
   */
  private pos(): number {
    const dom = this.horizontal ? this.el.scrollLeft : this.el.scrollTop;
    return dom === this.written ? this.exact : dom;
  }
  private size(): number {
    return this.horizontal ? this.el.clientWidth : this.el.clientHeight;
  }
  private maxPos(): number {
    return Math.max(0, (this.horizontal ? this.el.scrollWidth - this.el.clientWidth : this.el.scrollHeight - this.el.clientHeight));
  }
  private write(px: number): void {
    if (this.horizontal) this.el.scrollLeft = px;
    else this.el.scrollTop = px;
    const dom = this.horizontal ? this.el.scrollLeft : this.el.scrollTop;
    this.written = dom;
    // Rounded by the platform: keep the exact ask. Clamped by it (past the end): the platform's value is the truth.
    this.exact = Math.abs(dom - px) < 1 ? px : dom;
  }
  private setOffset(day: number): void {
    this.write((day - this.firstDay) * this.ppd);
  }
  private capped(scale: number): number {
    return clampPpd(scale, this.maxScale());
  }
  private reduced(): boolean {
    return (this.options.reducedMotion ?? prefersReducedMotion)();
  }

  /** Zoom with the day under `anchorPx` held still (VP-6). One property write, one scroll write. */
  private applyScale(scale: number, anchorPx: number): void {
    const next = this.capped(scale);
    const anchorDay = dayAt({ offsetDay: this.offset(), ppd: this.ppd }, anchorPx);
    this.ppd = next;
    this.el.style.setProperty(this.scaleVar, String(next));
    this.write((anchorDay - this.firstDay) * next - anchorPx);
  }

  // ---- the loop ----
  private wake(): void {
    this.loop.start();
  }

  private tick(now: number, dt: number): boolean {
    let busy = false;
    if (this.glide !== null) busy = this.stepGlide(dt) || busy;
    if (this.momentum !== null) busy = this.stepMomentum(dt) || busy;
    if (this.springing && this.drag === null) busy = this.stepSpringBack(dt) || busy;
    if (this.drag !== null) busy = true;
    const offset = this.offset();
    const seconds = Math.max(dt, 1) / 1000;
    const instant = (offset - this.lastOffset) / seconds;
    this.velocity = dt > 0 ? this.velocity * 0.8 + instant * 0.2 : this.velocity;
    this.lastOffset = offset;
    const moving = busy || now - this.lastScrollAt < QUIET_MS;
    if (!moving) this.velocity = 0;
    this.emit({ now, offset, scale: this.ppd, velocity: this.velocity, moving });
    return moving;
  }

  private stepGlide(dt: number): boolean {
    const g = this.glide as Glide;
    let done = true;
    if (g.scale !== null) {
      const r = stepGeometric(this.ppd, g.scale, dt, 1e-3, g.reduce, g.tauScale);
      this.applyScale(r.value, g.anchorPx);
      done = done && r.settled;
    }
    if (g.offset !== null) {
      // A target past either end of the scroller can never be reached (the platform clamps the write), so the glide would
      // chase it forever and no resting frame would be emitted: aim at the nearest day the scroller can show.
      const last = this.firstDay + this.maxPos() / this.ppd;
      const aim = Math.min(last, Math.max(this.firstDay, g.offset));
      const r = stepLinear(this.offset(), aim, dt, 0.5 / this.ppd, g.reduce, g.tauOffset);
      this.setOffset(r.value);
      done = done && r.settled;
    }
    if (done) this.glide = null;
    return !done;
  }

  private stepMomentum(dt: number): boolean {
    const m = momentumStep(this.pos(), this.momentum as number, dt);
    const max = this.maxPos();
    const clamped = Math.min(max, Math.max(0, m.offset));
    this.write(clamped);
    if (m.stopped || clamped !== m.offset) {
      this.momentum = null;
      return false;
    }
    this.momentum = m.velocity;
    return true;
  }

  private setOvershoot(px: number): void {
    this.overshoot = px;
    this.el.style.setProperty('--tl-overshoot', `${px}px`);
  }

  private stepSpringBack(dt: number): boolean {
    const r = stepLinear(this.overshoot, 0, dt, 0.5, this.reduced(), this.springTau);
    this.setOvershoot(r.value);
    if (r.settled) this.springing = false;
    return !r.settled;
  }

  private emit(frame: Frame): void {
    for (const callback of [...this.callbacks]) callback(frame);
  }

  // ---- input ----
  private onScroll(): void {
    this.lastScrollAt = this.clock.now();
    this.wake();
  }

  private onWheel(e: WheelEvent): void {
    const factor = wheelZoomFactor(e);
    if (factor === null) return;
    e.preventDefault();
    const rect = this.el.getBoundingClientRect();
    const anchorPx = this.horizontal ? e.clientX - rect.left : e.clientY - rect.top;
    this.glide = null;
    this.applyScale(this.ppd * factor, anchorPx);
    this.lastScrollAt = this.clock.now();
    this.wake();
  }

  private onPointerDown(e: PointerEvent): void {
    // Touch keeps the platform's scrolling and momentum (VP-2); only a mouse or pen drags here, and only on empty canvas.
    if (e.pointerType === 'touch' || e.button !== 0) return;
    if ((e.target as Element | null)?.closest('button, a, input, textarea, select, [data-no-pan]') != null) return;
    this.glide = null;
    this.momentum = null;
    const client = this.horizontal ? e.clientX : e.clientY;
    this.drag = { id: e.pointerId, startClient: client, startPos: this.pos(), samples: [{ t: this.clock.now(), x: this.pos() }], moved: false };
    this.el.setPointerCapture?.(e.pointerId);
    this.el.classList.add('gn-dragging');
    this.wake();
  }

  private onPointerMove(e: PointerEvent): void {
    const d = this.drag;
    if (d === null || e.pointerId !== d.id) return;
    const client = this.horizontal ? e.clientX : e.clientY;
    const raw = d.startPos - (client - d.startClient);
    if (Math.abs(client - d.startClient) > DRAG_SLOP_PX) d.moved = true;
    const max = this.maxPos();
    const clamped = Math.min(max, Math.max(0, raw));
    this.write(clamped);
    const beyond = raw < 0 ? raw : raw > max ? raw - max : 0;
    this.setOvershoot(beyond === 0 ? 0 : -Math.sign(beyond) * rubberOvershoot(Math.abs(beyond), Math.max(1, this.size())));
    d.samples.push({ t: this.clock.now(), x: raw });
    if (d.samples.length > 12) d.samples.shift();
  }

  private onPointerEnd(e: PointerEvent): void {
    const d = this.drag;
    if (d === null || e.pointerId !== d.id) return;
    this.drag = null;
    this.el.releasePointerCapture?.(e.pointerId);
    this.el.classList.remove('gn-dragging');
    this.swallowClick = d.moved;
    if (this.overshoot !== 0) {
      // Fixed for the whole spring-back: recomputing it as the overshoot shrinks would slow the tail past 160 ms.
      this.springTau = tauFor(this.overshoot, 0.5, SPRING_BACK_MS);
      this.springing = true;
    } else if (e.type === 'pointerup') {
      const v = releaseVelocity(d.samples, this.clock.now());
      if (v !== 0 && !this.reduced()) this.momentum = v;
    }
    this.wake();
  }

  /** A drag that panned must not also click the bar it ended on. */
  private onClickCapture(e: Event): void {
    if (!this.swallowClick) return;
    this.swallowClick = false;
    e.stopPropagation();
    e.preventDefault();
  }

  private onKeyDown(e: KeyboardEvent): void {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    if ((e.target as Element | null)?.closest('input, textarea, select, [contenteditable="true"]') != null) return;
    const back = this.horizontal ? 'ArrowLeft' : 'ArrowUp';
    const forward = this.horizontal ? 'ArrowRight' : 'ArrowDown';
    const off = this.glide?.offset ?? this.offset();
    const go = (days: number): void => {
      e.preventDefault();
      this.animateTo({ offset: off + days });
    };
    const page = Math.max(1, Math.round(this.viewportDays() * 0.9));
    if (e.key === back) go(e.shiftKey ? -28 : -7);
    else if (e.key === forward) go(e.shiftKey ? 28 : 7);
    else if (e.key === 'PageUp') go(-page);
    else if (e.key === 'PageDown') go(page);
    else if ((e.key === 'Home' || e.key === 't' || e.key === 'T') && this.options.todayDay !== undefined) {
      e.preventDefault();
      this.animateTo({ offset: this.options.todayDay() + 0.5 - this.viewportDays() / 2 });
    } else if (e.key === '+' || e.key === '=') {
      e.preventDefault();
      this.animateTo({ scale: (this.glide?.scale ?? this.ppd) * KEY_ZOOM });
    } else if (e.key === '-' || e.key === '_') {
      e.preventDefault();
      this.animateTo({ scale: (this.glide?.scale ?? this.ppd) / KEY_ZOOM });
    }
  }

  private listen(target: HTMLElement, type: string, handler: (e: Event) => void, options?: AddEventListenerOptions): void {
    target.addEventListener(type, handler, options);
    this.removers.push(() => target.removeEventListener(type, handler, options));
  }
}
