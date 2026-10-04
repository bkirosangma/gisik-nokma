// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { ScrollAdapter, dayAt, type Frame } from '../src/index.js';
import { fakeClock, pointer, sizeOf, wheel } from './fake-clock.js';

const FIRST = 20_000; // the surface starts on this day

function mount(opts: { ppd?: number; extentDays?: number; reduced?: boolean; width?: number } = {}) {
  const el = document.createElement('div');
  el.innerHTML = '<div class="surface"><button data-bar>bar</button></div>';
  document.body.append(el);
  const ppd = opts.ppd ?? 24;
  const extentDays = opts.extentDays ?? 400;
  sizeOf(el, { clientWidth: opts.width ?? 1000, scrollWidth: extentDays * ppd });
  const fc = fakeClock();
  const frames: Frame[] = [];
  const todayDay = FIRST + 200;
  const adapter = new ScrollAdapter({ element: el, firstDay: FIRST, scale: ppd, extentDays: () => extentDays, todayDay: () => todayDay, reducedMotion: () => opts.reduced ?? false, clock: fc.clock });
  adapter.onFrame((f) => frames.push(f));
  // the surface is `extentDays * ppd` wide, so a zoom changes what the container can scroll
  const resize = () => sizeOf(el, { clientWidth: opts.width ?? 1000, scrollWidth: extentDays * adapter.scale() });
  return { el, adapter, fc, frames, resize, todayDay };
}

afterEach(() => void (document.body.innerHTML = ''));

describe('29.030 the driver reads the scroll position as a day', () => {
  it('29.030 offset = firstDay + scroll / ppd; visibleRange spans the viewport inclusive; scale writes --tl-ppd; control: a scroll of 240 px at 24 px/day is 10 days | scrollByPx moves by px; axis y reads scrollTop and the height', () => {
    const { el, adapter } = mount();
    expect(adapter.offset()).toBe(FIRST);
    expect(el.style.getPropertyValue('--tl-ppd')).toBe('24');
    el.scrollLeft = 240;
    expect(adapter.offset()).toBe(FIRST + 10);
    expect(adapter.visibleRange()).toEqual({ start: FIRST + 10, end: FIRST + 10 + Math.ceil(1000 / 24) - 1 });
    expect(adapter.viewportDays()).toBeCloseTo(41.67, 1);
    adapter.scrollByPx(48);
    expect(adapter.offset()).toBe(FIRST + 12);
    // axis y (portrait): time runs down, read from scrollTop and the height
    const v = document.createElement('div');
    document.body.append(v);
    sizeOf(v, { clientWidth: 300, scrollWidth: 300, clientHeight: 480, scrollHeight: 9600 });
    const vy = new ScrollAdapter({ element: v, axis: 'y', firstDay: FIRST, scale: 24, extentDays: () => 400 });
    v.scrollTop = 240;
    expect(vy.offset()).toBe(FIRST + 10);
    expect(vy.viewportDays()).toBe(20);
  });
});

describe('29.031 Ctrl + wheel zooms about the pointer, nothing else is taken', () => {
  const sweep = (i: number) => (i < 40 ? 6 : -9);

  it('29.031 the day under the pointer keeps its x within 0.5 px over a 60-event sweep, the event is cancelled, and --tl-ppd follows; control: the same sweep zoomed about the centre moves the pointer\'s day past 0.5 px; the pointer is measured from the container\'s own left edge', () => {
    const { el, adapter, resize } = mount();
    el.scrollLeft = 2400;
    const anchorPx = 300;
    const day = dayAt({ offsetDay: adapter.offset(), ppd: adapter.scale() }, anchorPx);
    let worst = 0;
    for (let i = 0; i < 60; i += 1) {
      const e = wheel({ x: anchorPx, dy: sweep(i), ctrl: true });
      resize();
      el.dispatchEvent(e);
      expect(e.defaultPrevented).toBe(true);
      worst = Math.max(worst, Math.abs((day - adapter.offset()) * adapter.scale() - anchorPx));
    }
    expect(worst).toBeLessThan(0.5);
    expect(adapter.scale()).not.toBe(24);
    expect(el.style.getPropertyValue('--tl-ppd')).toBe(String(adapter.scale()));
    // control: the same sweep with the pointer at the viewport centre leaves the day at 300 px free to move
    const c = mount();
    c.el.scrollLeft = 2400;
    const cDay = dayAt({ offsetDay: c.adapter.offset(), ppd: c.adapter.scale() }, anchorPx);
    let centreWorst = 0;
    for (let i = 0; i < 60; i += 1) {
      c.resize();
      c.el.dispatchEvent(wheel({ x: 500, dy: sweep(i), ctrl: true }));
      centreWorst = Math.max(centreWorst, Math.abs((cDay - c.adapter.offset()) * c.adapter.scale() - anchorPx));
    }
    expect(centreWorst).toBeGreaterThan(0.5);
    // the pointer is measured from the container's own left edge, not the window's
    const o = mount();
    o.el.scrollLeft = 2400;
    const rect = o.el.getBoundingClientRect();
    o.el.getBoundingClientRect = () => ({ ...rect, left: 200, x: 200, right: 1200 });
    const oDay = dayAt({ offsetDay: o.adapter.offset(), ppd: o.adapter.scale() }, anchorPx);
    o.el.dispatchEvent(wheel({ x: 200 + anchorPx, dy: 6, ctrl: true }));
    expect(o.adapter.scale()).toBeLessThan(24);
    expect(Math.abs((oDay - o.adapter.offset()) * o.adapter.scale() - anchorPx)).toBeLessThan(0.5);
  });

  it('29.031 a zoom out at the first day, which the platform clamps, leaves the offset on the first day, not before it; a Ctrl + wheel during a glide ends the glide', () => {
    const { el, adapter, resize } = mount();
    let stored = 0;
    Object.defineProperty(el, 'scrollLeft', { configurable: true, get: () => stored, set: (v: number) => void (stored = Math.max(0, v)) });
    resize();
    el.dispatchEvent(wheel({ x: 300, dy: 50, ctrl: true })); // asks for scroll -135 px
    expect(adapter.scale()).toBeLessThan(24);
    expect(stored).toBe(0);
    expect(adapter.offset()).toBe(FIRST);
    // a glide in progress, then a Ctrl + wheel: the day under the pointer stays put, the glide does not resume
    const g = mount();
    g.el.scrollLeft = 2400;
    g.adapter.animateTo({ offset: FIRST + 300 });
    g.fc.advance(32);
    const day = dayAt({ offsetDay: g.adapter.offset(), ppd: g.adapter.scale() }, 300);
    g.resize();
    g.el.dispatchEvent(wheel({ x: 300, dy: 6, ctrl: true }));
    g.fc.advance(600);
    expect(Math.abs((day - g.adapter.offset()) * g.adapter.scale() - 300)).toBeLessThan(0.5);
    expect(g.fc.pending()).toBe(0);
  });

  it('29.031 on a platform that rounds scroll positions to whole pixels the anchor still holds within 0.5 px of the ideal on every event; control: re-reading the rounded position each event (the naive loop) drifts past 0.5 px on the same sweep', () => {
    const { el, adapter, resize } = mount();
    // Chromium at device-pixel-ratio 1: the stored scroll position is a whole number.
    let stored = 0;
    Object.defineProperty(el, 'scrollLeft', { configurable: true, get: () => stored, set: (v: number) => void (stored = Math.round(v)) });
    el.scrollLeft = 2400;
    const anchorPx = 300;
    const ideal = dayAt({ offsetDay: adapter.offset(), ppd: adapter.scale() }, anchorPx);
    let worst = 0;
    for (let i = 0; i < 60; i += 1) {
      resize();
      el.dispatchEvent(wheel({ x: anchorPx, dy: sweep(i), ctrl: true }));
      const screenX = (ideal - FIRST) * adapter.scale() - stored;
      worst = Math.max(worst, Math.abs(screenX - anchorPx));
    }
    expect(worst).toBeLessThanOrEqual(0.5 + 1e-9);
    // the naive loop: derive the anchor day from the rounded position every event
    let ppd = 24;
    let pos = 2400;
    let naiveWorst = 0;
    for (let i = 0; i < 60; i += 1) {
      const day = (pos + anchorPx) / ppd;
      ppd = Math.min(96, Math.max(4, ppd * Math.exp(-sweep(i) * 0.012)));
      pos = Math.round(day * ppd - anchorPx);
      naiveWorst = Math.max(naiveWorst, Math.abs((ideal - FIRST) * ppd - pos - anchorPx));
    }
    expect(naiveWorst).toBeGreaterThan(0.5);
  });

  it('29.031 a plain vertical wheel, a horizontal swipe and Shift + wheel are left to the platform: not cancelled, no zoom', () => {
    const { el, adapter } = mount();
    for (const e of [wheel({ dy: 80 }), wheel({ dx: 60, dy: 2 }), new WheelEvent('wheel', { deltaY: 40, shiftKey: true, bubbles: true, cancelable: true })]) {
      el.dispatchEvent(e);
      expect(e.defaultPrevented).toBe(false);
    }
    expect(adapter.scale()).toBe(24);
  });

  it('29.031 the zoom is capped by the browser scroll size: 400,000 days allow 40 px/day, not 96', () => {
    const { adapter } = mount({ extentDays: 400_000 });
    expect(adapter.maxScale()).toBe(40);
    expect(new ScrollAdapter({ element: document.createElement('div'), firstDay: 0, scale: 96, extentDays: () => 400_000 }).scale()).toBe(40);
  });
});

describe('29.032 glides', () => {
  it('29.032 animateTo reaches the target and settles; the first frame is partial (never a jump); one last frame reports moving: false', () => {
    const { el, adapter, fc, frames } = mount();
    adapter.animateTo({ offset: FIRST + 100 });
    fc.advance(16);
    expect(adapter.offset()).toBeGreaterThan(FIRST);
    expect(adapter.offset()).toBeLessThan(FIRST + 50);
    fc.advance(600);
    expect(adapter.offset()).toBeCloseTo(FIRST + 100, 1);
    expect(frames[frames.length - 1]).toMatchObject({ moving: false, velocity: 0 });
    expect(frames.some((f) => f.moving && f.velocity > 0)).toBe(true);
    expect(el.scrollLeft).toBeCloseTo(100 * 24, 0);
  });

  it('29.032 a 1,000,000 px glide still lands inside 450 ms (+1 frame); control: reduced motion lands in the same call, and one frame later the loop is idle with no frames pending', () => {
    const { adapter, fc } = mount({ extentDays: 100_000 });
    adapter.animateTo({ offset: FIRST + 40_000 });
    fc.advance(450 + 16);
    expect(adapter.offset()).toBeCloseTo(FIRST + 40_000, 0);
    const r = mount({ reduced: true });
    r.adapter.animateTo({ offset: FIRST + 100 });
    expect(r.adapter.offset()).toBe(FIRST + 100);
    r.fc.advance(16);
    expect(r.fc.pending()).toBe(0);
    expect(r.frames[r.frames.length - 1]).toMatchObject({ moving: false, offset: FIRST + 100 });
  });

  it('29.039 a glide aimed past either scrollable end stops at that end and settles: a last frame reports moving: false and the loop goes idle; control: a target inside the extent lands exactly on it', () => {
    const { el, adapter, fc, frames } = mount();
    // a real scroller clamps scrollLeft to [0, scrollWidth - clientWidth]; jsdom does not, so say so
    let stored = 0;
    Object.defineProperty(el, 'scrollLeft', { configurable: true, get: () => stored, set: (v: number) => void (stored = Math.min(8600, Math.max(0, v))) });
    adapter.animateTo({ offset: FIRST + 390 }); // the last scrollable day is FIRST + 8600 / 24, about 358.3
    fc.advance(1500);
    expect(stored).toBeCloseTo(8600, 0);
    expect(frames[frames.length - 1]).toMatchObject({ moving: false });
    expect(fc.pending()).toBe(0);
    adapter.animateTo({ offset: FIRST - 50 }); // and before the first day
    fc.advance(1500);
    expect(stored).toBe(0);
    expect(frames[frames.length - 1]).toMatchObject({ moving: false, offset: FIRST });
    expect(fc.pending()).toBe(0);
    const inside = mount();
    let held = 0;
    Object.defineProperty(inside.el, 'scrollLeft', { configurable: true, get: () => held, set: (v: number) => void (held = Math.min(8600, Math.max(0, v))) });
    inside.adapter.animateTo({ offset: FIRST + 300 });
    inside.fc.advance(1500);
    expect(inside.adapter.offset()).toBeCloseTo(FIRST + 300, 1);
    expect(inside.frames[inside.frames.length - 1]).toMatchObject({ moving: false });
    expect(inside.fc.pending()).toBe(0);
  });

  it('29.032 zoom glides geometrically about the viewport centre, inside 450 ms, and the centre day does not move', () => {
    const { el, adapter, fc, resize } = mount();
    el.scrollLeft = 2400;
    const centreDay = dayAt({ offsetDay: adapter.offset(), ppd: adapter.scale() }, 500);
    adapter.animateTo({ scale: 8 });
    for (let i = 0; i < 40; i += 1) {
      resize();
      fc.advance(16);
      expect(Math.abs((centreDay - adapter.offset()) * adapter.scale() - 500)).toBeLessThan(0.5);
      if (i === 28) expect(adapter.scale(), 'landed by 464 ms').toBeCloseTo(8, 2);
    }
    expect(adapter.scale()).toBeCloseTo(8, 2);
  });

  it('29.032 a glide started during a fling replaces the fling and lands exactly on its target', () => {
    const { el, adapter, fc } = mount();
    el.scrollLeft = 4000;
    el.dispatchEvent(pointer('pointerdown', { x: 500, y: 50 }));
    for (let i = 1; i <= 4; i += 1) {
      fc.advance(16);
      el.dispatchEvent(pointer('pointermove', { x: 500 + i * 20, y: 50 }));
    }
    el.dispatchEvent(pointer('pointerup', { x: 580, y: 50 }));
    fc.advance(32);
    expect(el.scrollLeft).toBeLessThan(4000 - 80 - 10); // the fling is under way
    adapter.animateTo({ offset: FIRST + 100 });
    fc.advance(2000);
    expect(adapter.offset()).toBeCloseTo(FIRST + 100, 6);
  });
});

describe('29.033 keys', () => {
  const press = (el: HTMLElement, key: string, shiftKey = false) => {
    const e = new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true });
    el.dispatchEvent(e);
    return e;
  };

  it('29.033 Left / Right glide 7 days, with Shift 28, PageUp / PageDown 90% of a viewport, Home or T centres today, + (or =) and - (or _) zoom 1.25x; each is cancelled so the page does not also scroll', () => {
    const { el, adapter, fc, todayDay } = mount();
    el.scrollLeft = 24 * 100;
    const start = adapter.offset();
    expect(press(el, 'ArrowRight').defaultPrevented).toBe(true);
    fc.advance(700);
    expect(adapter.offset()).toBeCloseTo(start + 7, 1);
    expect(press(el, 'ArrowLeft', true).defaultPrevented).toBe(true);
    fc.advance(700);
    expect(adapter.offset()).toBeCloseTo(start + 7 - 28, 1);
    const before = adapter.offset();
    expect(press(el, 'PageDown').defaultPrevented).toBe(true);
    fc.advance(700);
    expect(adapter.offset() - before).toBeCloseTo(Math.round(adapter.viewportDays() * 0.9), 1);
    expect(press(el, 'PageUp').defaultPrevented).toBe(true);
    fc.advance(700);
    expect(adapter.offset()).toBeCloseTo(before, 1);
    expect(press(el, 'Home').defaultPrevented).toBe(true);
    fc.advance(700);
    expect(adapter.offset() + adapter.viewportDays() / 2).toBeCloseTo(todayDay + 0.5, 1);
    press(el, 'ArrowRight');
    fc.advance(700);
    expect(adapter.offset() + adapter.viewportDays() / 2).toBeCloseTo(todayDay + 7.5, 1);
    expect(press(el, 'T').defaultPrevented).toBe(true);
    fc.advance(700);
    expect(adapter.offset() + adapter.viewportDays() / 2).toBeCloseTo(todayDay + 0.5, 1);
    expect(press(el, '+').defaultPrevented).toBe(true);
    fc.advance(700);
    expect(adapter.scale()).toBeCloseTo(24 * 1.25, 2);
    expect(press(el, '-').defaultPrevented).toBe(true);
    fc.advance(700);
    expect(adapter.scale()).toBeCloseTo(24, 2);
    expect(press(el, '=').defaultPrevented).toBe(true);
    fc.advance(700);
    expect(adapter.scale()).toBeCloseTo(24 * 1.25, 2);
    expect(press(el, '_').defaultPrevented).toBe(true);
    fc.advance(700);
    expect(adapter.scale()).toBeCloseTo(24, 2);
  });

  it('29.033 two quick presses add up (the second starts from the first target); a key with Ctrl, Meta or Alt, one already handled, or one typed into an input, is left alone', () => {
    const { el, adapter, fc } = mount();
    el.scrollLeft = 24 * 100;
    const start = adapter.offset();
    press(el, 'ArrowRight');
    fc.advance(32);
    press(el, 'ArrowRight');
    fc.advance(900);
    expect(adapter.offset()).toBeCloseTo(start + 14, 1);
    for (const mod of ['ctrlKey', 'metaKey', 'altKey'] as const) {
      const e = new KeyboardEvent('keydown', { key: 'ArrowRight', [mod]: true, bubbles: true, cancelable: true });
      el.dispatchEvent(e);
      expect(e.defaultPrevented, mod).toBe(false);
    }
    // a key something inside already handled
    const bar = el.querySelector('button') as HTMLButtonElement;
    bar.addEventListener('keydown', (e) => e.preventDefault(), { once: true });
    const at = adapter.offset();
    bar.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
    fc.advance(700);
    expect(adapter.offset()).toBe(at);
    const input = document.createElement('input');
    el.append(input);
    const typed = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true });
    input.dispatchEvent(typed);
    expect(typed.defaultPrevented).toBe(false);
  });
});

describe('29.034 a mouse drag pans, with momentum', () => {
  const click = () => new MouseEvent('click', { bubbles: true, cancelable: true });

  it('29.034 dragging 100 px right scrolls 100 px left; releasing at speed keeps going and stops below 2 px/s; the click that ends the drag is swallowed; frames report moving throughout the drag; control: a press that did not move clicks as usual, and a drag begun on a bar, by touch, with another button or by a second pointer does nothing', () => {
    const { el, adapter, fc, frames } = mount();
    el.scrollLeft = 2000;
    let clicks = 0;
    el.addEventListener('click', () => (clicks += 1));
    el.dispatchEvent(pointer('pointerdown', { x: 500, y: 50 }));
    expect(el.classList.contains('gn-dragging')).toBe(true);
    el.dispatchEvent(pointer('pointermove', { x: 900, y: 50, id: 2 })); // a second pointer is not the drag
    expect(el.scrollLeft).toBe(2000);
    for (let i = 1; i <= 6; i += 1) {
      fc.advance(16);
      el.dispatchEvent(pointer('pointermove', { x: 500 + i * 20, y: 50 }));
    }
    expect(el.scrollLeft).toBeCloseTo(2000 - 120, 5);
    expect(frames.length).toBeGreaterThanOrEqual(6);
    expect(frames.every((f) => f.moving)).toBe(true); // frames keep coming while the pointer drags
    el.dispatchEvent(pointer('pointerup', { x: 620, y: 50 }));
    expect(el.classList.contains('gn-dragging')).toBe(false);
    const released = el.scrollLeft;
    fc.advance(160);
    expect(el.scrollLeft).toBeLessThan(released - 30);
    fc.advance(4000);
    const rest = el.scrollLeft;
    fc.advance(500);
    expect(el.scrollLeft).toBe(rest);
    const swallowed = click();
    el.querySelector('button')?.dispatchEvent(swallowed);
    expect(clicks).toBe(0); // swallowed
    expect(swallowed.defaultPrevented).toBe(true);
    el.querySelector('button')?.dispatchEvent(click());
    expect(clicks).toBe(1); // only the one
    // control: a press on empty canvas that did not move is no drag, so its click goes through
    el.dispatchEvent(pointer('pointerdown', { x: 400, y: 50 }));
    el.dispatchEvent(pointer('pointerup', { x: 400, y: 50 }));
    el.querySelector('button')?.dispatchEvent(click());
    expect(clicks).toBe(2);
    // controls: a drag begun on a bar, by touch, or with another button
    const at = el.scrollLeft;
    el.dispatchEvent(pointer('pointerdown', { x: 500, y: 50, button: 2 }));
    el.dispatchEvent(pointer('pointermove', { x: 650, y: 50 }));
    el.querySelector('button')?.dispatchEvent(pointer('pointerdown', { x: 500, y: 50 }));
    el.dispatchEvent(pointer('pointermove', { x: 600, y: 50 }));
    el.dispatchEvent(pointer('pointerdown', { x: 500, y: 50, id: 9, kind: 'touch' }));
    el.dispatchEvent(pointer('pointermove', { x: 700, y: 50, id: 9, kind: 'touch' }));
    expect(el.scrollLeft).toBe(at);
    expect(adapter.offset()).toBeGreaterThan(FIRST);
  });

  it('29.034 a fling toward the first day stops there: the scroll rests at 0 and the loop goes idle', () => {
    const { el, fc } = mount();
    el.scrollLeft = 100;
    el.dispatchEvent(pointer('pointerdown', { x: 500, y: 50 }));
    for (let i = 1; i <= 3; i += 1) {
      fc.advance(16);
      el.dispatchEvent(pointer('pointermove', { x: 500 + i * 20, y: 50 }));
    }
    el.dispatchEvent(pointer('pointerup', { x: 560, y: 50 })); // 1,250 px/s toward 0 from 40 px
    fc.advance(400);
    expect(el.scrollLeft).toBe(0);
    expect(fc.pending()).toBe(0);
  });

  it('29.034 a pointer that rested 300 ms before release, or any release under reduced motion, has no momentum', () => {
    const { el, fc } = mount();
    el.scrollLeft = 2000;
    el.dispatchEvent(pointer('pointerdown', { x: 500, y: 50 }));
    fc.advance(16);
    el.dispatchEvent(pointer('pointermove', { x: 560, y: 50 }));
    fc.advance(300);
    el.dispatchEvent(pointer('pointerup', { x: 560, y: 50 }));
    const rest = el.scrollLeft;
    fc.advance(500);
    expect(el.scrollLeft).toBe(rest);
    const r = mount({ reduced: true });
    r.el.scrollLeft = 2000;
    r.el.dispatchEvent(pointer('pointerdown', { x: 500, y: 50 }));
    for (let i = 1; i <= 4; i += 1) {
      r.fc.advance(16);
      r.el.dispatchEvent(pointer('pointermove', { x: 500 + i * 20, y: 50 }));
    }
    r.el.dispatchEvent(pointer('pointerup', { x: 580, y: 50 }));
    const flung = r.el.scrollLeft;
    r.fc.advance(500);
    expect(r.el.scrollLeft).toBe(flung);
  });
});

describe('29.035 the rubber band', () => {
  it('29.035 pulling past the first day shows a resisted overshoot (less than the pull, in its direction), and 160 ms after release it is back at 0; control: inside the limits there is none', () => {
    const { el, fc } = mount();
    el.scrollLeft = 0;
    el.dispatchEvent(pointer('pointerdown', { x: 300, y: 50 }));
    el.dispatchEvent(pointer('pointermove', { x: 350, y: 50 }));
    const shown = parseFloat(el.style.getPropertyValue('--tl-overshoot'));
    expect(el.scrollLeft).toBe(0);
    expect(shown).toBeGreaterThan(10); // positive: the surface follows the pointer to the right
    expect(shown).toBeLessThan(50);
    el.dispatchEvent(pointer('pointerup', { x: 350, y: 50 }));
    fc.advance(48);
    expect(Math.abs(parseFloat(el.style.getPropertyValue('--tl-overshoot')))).toBeLessThan(shown);
    fc.advance(112);
    expect(parseFloat(el.style.getPropertyValue('--tl-overshoot'))).toBeCloseTo(0, 5);
    el.scrollLeft = 1000;
    el.dispatchEvent(pointer('pointerdown', { x: 300, y: 50 }));
    el.dispatchEvent(pointer('pointermove', { x: 350, y: 50 }));
    expect(parseFloat(el.style.getPropertyValue('--tl-overshoot'))).toBeCloseTo(0, 5);
  });
});

describe('29.036 the frame stream', () => {
  it('29.036 a native scroll produces frames with the smoothed velocity in days per second, and a final frame once it is quiet; rebase keeps the day at the edge', () => {
    const { el, adapter, fc, frames } = mount();
    for (let i = 0; i < 10; i += 1) {
      el.scrollLeft = i * 48; // 2 days per 16 ms frame = 125 days/s
      el.dispatchEvent(new Event('scroll'));
      fc.advance(16);
    }
    const moving = frames.filter((f) => f.moving);
    expect(moving).toHaveLength(10);
    // smoothed 0.8 / 0.2 from rest: frame k carries 125 * (1 - 0.8^k) days/s (not px/s, not the raw 125)
    moving.forEach((f, k) => expect(f.velocity, `frame ${k}`).toBeCloseTo(125 * (1 - 0.8 ** k), 6));
    fc.advance(400);
    expect(frames[frames.length - 1]).toMatchObject({ moving: false, velocity: 0 });
    const day = adapter.offset();
    adapter.rebase(FIRST - 30);
    expect(adapter.offset()).toBeCloseTo(day, 6);
    expect(el.scrollLeft).toBeCloseTo((day - (FIRST - 30)) * 24, 6);
  });

  it('29.036 a Ctrl + wheel zoom streams moving frames with the new scale | destroy removes every listener, the overshoot property and stops the loop; control: before destroy the same wheel zoomed', () => {
    const { el, adapter, fc, frames } = mount();
    el.dispatchEvent(wheel({ dy: 5, ctrl: true, x: 100 }));
    const zoomed = adapter.scale();
    expect(zoomed).not.toBe(24);
    fc.advance(16);
    expect(frames[frames.length - 1]).toMatchObject({ moving: true, scale: zoomed }); // a wheel zoom streams frames
    el.scrollLeft = 2000; // a drag inside the limits writes the overshoot property (0px)
    el.dispatchEvent(pointer('pointerdown', { x: 500, y: 50 }));
    el.dispatchEvent(pointer('pointermove', { x: 520, y: 50 }));
    el.dispatchEvent(pointer('pointerup', { x: 520, y: 50 }));
    expect(el.style.getPropertyValue('--tl-overshoot')).toBe('0px');
    adapter.destroy();
    expect(el.style.getPropertyValue('--tl-overshoot')).toBe('');
    const e = wheel({ dy: 50, ctrl: true, x: 100 });
    el.dispatchEvent(e);
    expect(adapter.scale()).toBe(zoomed);
    expect(e.defaultPrevented).toBe(false);
    expect(fc.pending()).toBe(0);
  });
});
