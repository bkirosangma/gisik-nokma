// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { CameraAdapter, type Frame } from '../src/index.js';
import { fakeClock, pointer, sizeOf, wheel } from './fake-clock.js';

function mount(reduced = false) {
  const el = document.createElement('div');
  const layer = document.createElement('div');
  el.append(layer);
  document.body.append(el);
  sizeOf(el, { clientWidth: 800, scrollWidth: 800, clientHeight: 600, scrollHeight: 600 });
  const fc = fakeClock();
  const frames: Frame[] = [];
  const cam = new CameraAdapter({ element: el, layer, minZoom: 0.2, maxZoom: 4, reducedMotion: () => reduced, clock: fc.clock });
  cam.onFrame((f) => frames.push(f));
  return { el, layer, cam, fc, frames };
}
afterEach(() => void (document.body.innerHTML = ''));

describe('29.037 the camera', () => {
  it('29.037 it writes ONE transform on the layer, from the camera: screen = (world - camera) * zoom; control: the touch-action and overscroll are set so the page never pans under it | offset, scale and visibleRange read the camera; animateTo maps offset and scale, and anchorPx holds that px still (control: the centre otherwise) | the camera copies start (FD-1)', () => {
    const { el, layer, cam } = mount();
    cam.camera({ x: 100, y: 50, zoom: 2 }, { instant: true });
    expect(layer.style.transform).toBe('translate(-200px, -100px) scale(2)');
    // the scale is about the layer's top-left corner (the harness layer is 0 x 0, so only this line pins it)
    expect(layer.style.transformOrigin).toBe('0 0');
    expect(cam.getCamera()).toEqual({ x: 100, y: 50, zoom: 2 });
    expect(el.style.touchAction).toBe('none');
    expect(el.style.overscrollBehavior).toBe('contain');
    expect(cam.toWorld({ x: 400, y: 300 })).toEqual({ x: 300, y: 200 });
    // the ViewportDriver reads: offset is world x at the left edge, scale is the zoom, the range spans 800 px / zoom 2 = 400 world units
    expect(cam.offset()).toBe(100);
    expect(cam.scale()).toBe(2);
    expect(cam.visibleRange()).toEqual({ start: 100, end: 500 });
    cam.camera({ x: 100.5 }, { instant: true });
    expect(cam.visibleRange()).toEqual({ start: 100, end: 501 });
    // animateTo: offset is x and scale is zoom
    cam.animateTo({ offset: 30, scale: 1 }, { instant: true });
    expect(cam.getCamera()).toMatchObject({ x: 30, zoom: 1 });
    // anchorPx 0: the world point at the left edge (half way down) holds still while the zoom changes
    const left = cam.toWorld({ x: 0, y: 300 });
    cam.animateTo({ scale: 4 }, { instant: true, anchorPx: 0 });
    expect(cam.toWorld({ x: 0, y: 300 })).toEqual(left);
    // control: with no anchorPx the zoom holds the centre, so the left edge moves
    cam.animateTo({ scale: 1 }, { instant: true });
    expect(cam.getCamera().x).not.toBe(left.x);
    // FD-1: the caller's start object is copied, never written (control: the camera itself moved)
    const start = { x: 10, y: 20, zoom: 1 };
    const view = document.createElement('div');
    const own = new CameraAdapter({ element: view, layer: document.createElement('div'), minZoom: 0.2, maxZoom: 4, start, clock: fakeClock().clock });
    view.dispatchEvent(wheel({ dx: 30, dy: 0 }));
    expect(own.getCamera()).toEqual({ x: 40, y: 20, zoom: 1 });
    expect(start).toEqual({ x: 10, y: 20, zoom: 1 });
  });

  it('29.037 wheel: a notched wheel and Ctrl + wheel zoom about the pointer (the world point under it does not move), a pixel scroll pans; all cancelled; zoom stays in [min, max] | the pointer is read relative to the element | a wheel cancels a glide (control: un-wheeled, the glide lands) | frames say moving for 100 ms after a wheel, then rest', () => {
    const { el, cam, fc, frames } = mount();
    const at = { x: 250, y: 100 };
    const world = cam.toWorld(at);
    for (const e of [wheel({ ...at, dy: -120 }), wheel({ ...at, dy: -8, ctrl: true }), wheel({ ...at, dy: 8, ctrl: true })]) {
      el.dispatchEvent(e);
      expect(e.defaultPrevented).toBe(true);
      const now = cam.toWorld(at);
      expect(Math.abs(now.x - world.x) * cam.scale()).toBeLessThan(0.5);
      expect(Math.abs(now.y - world.y) * cam.scale()).toBeLessThan(0.5);
    }
    const z = cam.scale();
    // wheel up zooms IN: the notched -120 (exp(0.264)) and the Ctrl pair (exp(0.096) * exp(-0.096)) leave exp(0.264)
    expect(z).toBeCloseTo(Math.exp(0.264), 6);
    const before = cam.getCamera();
    const pan = wheel({ dx: 30, dy: 12 });
    el.dispatchEvent(pan);
    expect(pan.defaultPrevented).toBe(true);
    expect(cam.getCamera().x).toBeCloseTo(before.x + 30 / z, 9);
    expect(cam.getCamera().y).toBeCloseTo(before.y + 12 / z, 9);
    expect(cam.scale()).toBe(z);
    for (let i = 0; i < 200; i += 1) el.dispatchEvent(wheel({ dy: -120 }));
    expect(cam.scale()).toBe(4);
    for (let i = 0; i < 400; i += 1) el.dispatchEvent(wheel({ dy: 120 }));
    expect(cam.scale()).toBe(0.2);
    // a view whose top-left corner is at client (100, 50): the zoom holds the point under the pointer, client (350, 150) = local (250, 100)
    cam.camera({ x: 0, y: 0, zoom: 1 }, { instant: true });
    el.getBoundingClientRect = () => ({ left: 100, top: 50, right: 900, bottom: 650, width: 800, height: 600, x: 100, y: 50, toJSON: () => ({}) });
    const under = cam.toWorld(at);
    el.dispatchEvent(wheel({ x: 350, y: 150, dy: -8, ctrl: true }));
    expect(cam.scale()).toBeGreaterThan(1);
    expect(Math.abs(cam.toWorld(at).x - under.x) * cam.scale()).toBeLessThan(0.5);
    expect(Math.abs(cam.toWorld(at).y - under.y) * cam.scale()).toBeLessThan(0.5);
    // a wheel cancels a glide in flight: the camera stays where the wheel left it
    cam.camera({ x: 0, y: 0, zoom: 1 }, { instant: true });
    cam.camera({ x: 5000 });
    fc.advance(16);
    const caught = cam.getCamera().x;
    el.dispatchEvent(wheel({ dx: 30, dy: 0 }));
    fc.advance(700);
    expect(cam.getCamera().x).toBe(caught + 30);
    // control: the same glide, un-wheeled, lands
    cam.camera({ x: 5000 });
    fc.advance(700);
    expect(cam.getCamera().x).toBe(5000);
    // frames report moving while a wheel is under 100 ms old (QUIET_MS): a frame 84 ms after it moves, the one at 100 ms rests and the loop idles
    el.dispatchEvent(wheel({ dx: 10, dy: 0 }));
    fc.advance(4);
    fc.advance(80);
    expect(frames[frames.length - 1]?.moving).toBe(true);
    fc.advance(16);
    expect(frames[frames.length - 1]?.moving).toBe(false);
    expect(fc.pending()).toBe(0);
  });

  it('29.037 a pixel wheel pans by delta / zoom; control: the same delta at zoom 2 moves half as many world units', () => {
    const { el, cam } = mount();
    el.dispatchEvent(wheel({ dx: 40, dy: 0 }));
    expect(cam.getCamera().x).toBe(40);
    cam.camera({ x: 0, y: 0, zoom: 2 }, { instant: true });
    el.dispatchEvent(wheel({ dx: 40, dy: 0 }));
    expect(cam.getCamera().x).toBe(20);
  });

  it('29.038 drag pans (touch too); two fingers pinch about their midpoint; a flick keeps going and stops; control: a rested release does not | frames say moving while pressed | a right-button press and a hover do not pan (control: a pen barrel press does) | the pointer is captured and released | at zoom 2 a drag and a flick move half as far, on both axes | a vertical flick | a cancelled flick leaves no momentum | the release velocity is the newest 12 samples | a stray pointerup leaves a pinch alone; the pinch clamps; two fingers on one point move nothing | a press, a wheel and camera() each stop a flick; a press stops a glide', () => {
    const { el, cam, fc, frames } = mount();
    el.dispatchEvent(pointer('pointerdown', { x: 400, y: 300, id: 1, kind: 'touch' }));
    el.dispatchEvent(pointer('pointermove', { x: 350, y: 280, id: 1, kind: 'touch' }));
    expect(cam.getCamera()).toMatchObject({ x: 50, y: 20 });
    el.dispatchEvent(pointer('pointerup', { x: 350, y: 280, id: 1, kind: 'touch' }));
    // pinch
    el.dispatchEvent(pointer('pointerdown', { x: 300, y: 300, id: 2, kind: 'touch' }));
    el.dispatchEvent(pointer('pointerdown', { x: 500, y: 300, id: 3, kind: 'touch' }));
    const mid = cam.toWorld({ x: 400, y: 300 });
    el.dispatchEvent(pointer('pointermove', { x: 200, y: 300, id: 2, kind: 'touch' }));
    el.dispatchEvent(pointer('pointermove', { x: 600, y: 300, id: 3, kind: 'touch' }));
    expect(cam.scale()).toBeCloseTo(2, 5);
    const after = cam.toWorld({ x: 400, y: 300 });
    expect(Math.abs(after.x - mid.x) * cam.scale()).toBeLessThan(0.5);
    expect(Math.abs(after.y - mid.y) * cam.scale()).toBeLessThan(0.5);
    // both fingers slide 100 px right: the midpoint leaves the viewport centre (400, 300) and the world point follows it
    el.dispatchEvent(pointer('pointermove', { x: 300, y: 300, id: 2, kind: 'touch' }));
    el.dispatchEvent(pointer('pointermove', { x: 700, y: 300, id: 3, kind: 'touch' }));
    const slid = cam.toWorld({ x: 500, y: 300 });
    expect(Math.abs(slid.x - mid.x) * cam.scale()).toBeLessThan(0.5);
    el.dispatchEvent(pointer('pointerup', { x: 300, y: 300, id: 2, kind: 'touch' }));
    el.dispatchEvent(pointer('pointerup', { x: 700, y: 300, id: 3, kind: 'touch' }));
    fc.advance(1000);
    // flick
    cam.camera({ x: 0, y: 0, zoom: 1 }, { instant: true });
    el.dispatchEvent(pointer('pointerdown', { x: 500, y: 300 }));
    for (let i = 1; i <= 5; i += 1) {
      fc.advance(16);
      el.dispatchEvent(pointer('pointermove', { x: 500 - i * 24, y: 300 }));
    }
    el.dispatchEvent(pointer('pointerup', { x: 380, y: 300 }));
    const released = cam.getCamera().x;
    expect(released).toBe(120);
    // release velocity 1.5 px/ms = 1,500 px/s: 200 ms of decay travel 360 * (1 - e^(-200/240)) = 203.5 px
    fc.advance(200);
    expect(cam.getCamera().x).toBeGreaterThan(released + 150);
    fc.advance(4000);
    const rest = cam.getCamera().x;
    // the whole flick travels v * tau = 1,500 px/s * 0.24 s = 360 px, less the < 2 px/s left when it stops
    expect(rest - released).toBeGreaterThan(355);
    expect(rest - released).toBeLessThan(361);
    fc.advance(400);
    expect(cam.getCamera().x).toBe(rest);
    // stopped means the frame loop went idle, not only that x held
    expect(fc.pending()).toBe(0);
    // rested: the move is 16 ms after the press, so the samples span time; 300 ms of rest empties the 80 ms window
    cam.camera({ x: 0, y: 0, zoom: 1 }, { instant: true });
    el.dispatchEvent(pointer('pointerdown', { x: 500, y: 300 }));
    fc.advance(16);
    el.dispatchEvent(pointer('pointermove', { x: 450, y: 300 }));
    fc.advance(300);
    // a held pointer keeps the frames moving though nothing else does
    expect(frames[frames.length - 1]?.moving).toBe(true);
    el.dispatchEvent(pointer('pointerup', { x: 450, y: 300 }));
    const still = cam.getCamera().x;
    fc.advance(500);
    expect(cam.getCamera().x).toBe(still);
    expect(frames[frames.length - 1]?.moving).toBe(false);

    const drag = (from: { x: number; y: number }, step: { x: number; y: number }, n = 5, ms = 16, end = 'pointerup'): void => {
      el.dispatchEvent(pointer('pointerdown', from));
      for (let i = 1; i <= n; i += 1) {
        fc.advance(ms);
        el.dispatchEvent(pointer('pointermove', { x: from.x + i * step.x, y: from.y + i * step.y }));
      }
      el.dispatchEvent(pointer(end, { x: from.x + n * step.x, y: from.y + n * step.y }));
    };
    // a right-button mouse press does not pan, and a hover with no press does not either
    cam.camera({ x: 0, y: 0, zoom: 1 }, { instant: true });
    el.dispatchEvent(pointer('pointerdown', { x: 500, y: 300, button: 2 }));
    el.dispatchEvent(pointer('pointermove', { x: 450, y: 300, button: 2 }));
    el.dispatchEvent(pointer('pointerup', { x: 450, y: 300, button: 2 }));
    el.dispatchEvent(pointer('pointermove', { x: 400, y: 300 }));
    expect(cam.getCamera()).toMatchObject({ x: 0, y: 0 });
    // control: a pen pressed with its barrel button (2) is not a mouse, so it pans
    el.dispatchEvent(pointer('pointerdown', { x: 500, y: 300, button: 2, kind: 'pen' }));
    el.dispatchEvent(pointer('pointermove', { x: 450, y: 300, kind: 'pen' }));
    expect(cam.getCamera().x).toBe(50);
    el.dispatchEvent(pointer('pointerup', { x: 450, y: 300, kind: 'pen' }));
    // the press captures its pointer, so a drag that leaves the view still reaches it, and the release lets go
    const captured: number[] = [];
    const freed: number[] = [];
    el.setPointerCapture = (id: number) => void captured.push(id);
    el.releasePointerCapture = (id: number) => void freed.push(id);
    el.dispatchEvent(pointer('pointerdown', { x: 500, y: 300, id: 7 }));
    expect(captured).toEqual([7]);
    el.dispatchEvent(pointer('pointerup', { x: 500, y: 300, id: 7 }));
    expect(freed).toEqual([7]);
    // at zoom 2 a drag moves half as many world units on both axes, and so does the flick that follows (dy twice dx: x stops first, y goes on)
    cam.camera({ x: 0, y: 0, zoom: 2 }, { instant: true });
    drag({ x: 500, y: 400 }, { x: -12, y: -24 });
    expect(cam.getCamera()).toMatchObject({ x: 30, y: 60 });
    fc.advance(4400);
    // release velocities 750 and 1,500 px/s travel 180 and 360 screen px: 90 and 180 world units, less what is left when each stops
    expect(cam.getCamera().x - 30).toBeGreaterThan(89.5);
    expect(cam.getCamera().x - 30).toBeLessThan(90.1);
    expect(cam.getCamera().y - 60).toBeGreaterThan(179.5);
    expect(cam.getCamera().y - 60).toBeLessThan(180.1);
    // a vertical flick, dx 0: it keeps going too, downward in the world for an upward swipe
    cam.camera({ x: 0, y: 0, zoom: 1 }, { instant: true });
    drag({ x: 400, y: 500 }, { x: 0, y: -24 });
    fc.advance(4400);
    expect(cam.getCamera().x).toBe(0);
    expect(cam.getCamera().y - 120).toBeGreaterThan(359);
    expect(cam.getCamera().y - 120).toBeLessThan(360.1);
    // a cancelled flick (pointercancel) leaves no momentum (control: the same flick ended by pointerup, above, travels 360 px)
    cam.camera({ x: 0, y: 0, zoom: 1 }, { instant: true });
    drag({ x: 500, y: 300 }, { x: -24, y: 0 }, 5, 16, 'pointercancel');
    fc.advance(500);
    expect(cam.getCamera().x).toBe(120);
    // the release velocity is the least-squares slope of the newest 12 samples: x = 500 - i^2 every 5 ms, so samples i = 5..16
    // give 2 * 10.5 / 5 = 4.2 px/ms and a flick of 4,200 px/s * 0.24 s = 1,008 px (11 samples: 1,056; 13: 960; all 17: 768)
    cam.camera({ x: 0, y: 0, zoom: 1 }, { instant: true });
    el.dispatchEvent(pointer('pointerdown', { x: 500, y: 300 }));
    for (let i = 1; i <= 16; i += 1) {
      fc.advance(5);
      el.dispatchEvent(pointer('pointermove', { x: 500 - i * i, y: 300 }));
    }
    el.dispatchEvent(pointer('pointerup', { x: 244, y: 300 }));
    expect(cam.getCamera().x).toBe(256);
    fc.advance(3000);
    expect(cam.getCamera().x - 256).toBeGreaterThan(1006);
    expect(cam.getCamera().x - 256).toBeLessThan(1008.5);
    // a pointerup from a pointer that never pressed leaves a pinch going
    cam.camera({ x: 0, y: 0, zoom: 1 }, { instant: true });
    el.dispatchEvent(pointer('pointerdown', { x: 300, y: 300, id: 4, kind: 'touch' }));
    el.dispatchEvent(pointer('pointerdown', { x: 500, y: 300, id: 5, kind: 'touch' }));
    el.dispatchEvent(pointer('pointerup', { x: 0, y: 0, id: 9, kind: 'touch' }));
    el.dispatchEvent(pointer('pointermove', { x: 100, y: 300, id: 4, kind: 'touch' }));
    expect(cam.scale()).toBeCloseTo(2, 5);
    // spread far past maxZoom: the pinch clamps at 4
    el.dispatchEvent(pointer('pointermove', { x: 2500, y: 300, id: 5, kind: 'touch' }));
    expect(cam.scale()).toBe(4);
    el.dispatchEvent(pointer('pointerup', { x: 100, y: 300, id: 4, kind: 'touch' }));
    el.dispatchEvent(pointer('pointerup', { x: 2500, y: 300, id: 5, kind: 'touch' }));
    // two fingers pressed on one point: no distance to scale by, so a move changes nothing (no infinite zoom)
    cam.camera({ x: 0, y: 0, zoom: 1 }, { instant: true });
    el.dispatchEvent(pointer('pointerdown', { x: 400, y: 300, id: 4, kind: 'touch' }));
    el.dispatchEvent(pointer('pointerdown', { x: 400, y: 300, id: 5, kind: 'touch' }));
    el.dispatchEvent(pointer('pointermove', { x: 500, y: 300, id: 5, kind: 'touch' }));
    expect(cam.getCamera()).toEqual({ x: 0, y: 0, zoom: 1 });
    el.dispatchEvent(pointer('pointerup', { x: 400, y: 300, id: 4, kind: 'touch' }));
    el.dispatchEvent(pointer('pointerup', { x: 500, y: 300, id: 5, kind: 'touch' }));
    fc.advance(100);
    // a flick is caught by a press, by a wheel and by camera(): each stops it where it is (control: the flick above runs 360 px)
    const flick = (): number => {
      cam.camera({ x: 0, y: 0, zoom: 1 }, { instant: true });
      drag({ x: 500, y: 300 }, { x: -24, y: 0 });
      fc.advance(48);
      return cam.getCamera().x;
    };
    let caught = flick();
    expect(caught).toBeGreaterThan(120);
    el.dispatchEvent(pointer('pointerdown', { x: 500, y: 300 }));
    el.dispatchEvent(pointer('pointerup', { x: 500, y: 300 }));
    fc.advance(500);
    expect(cam.getCamera().x).toBe(caught);
    caught = flick();
    el.dispatchEvent(wheel({ dx: 10, dy: 0 }));
    fc.advance(500);
    expect(cam.getCamera().x).toBe(caught + 10);
    flick();
    cam.camera({ x: 7 }, { instant: true });
    fc.advance(500);
    expect(cam.getCamera().x).toBe(7);
    // a press catches a glide too
    cam.camera({ x: 5000 });
    fc.advance(16);
    const held = cam.getCamera().x;
    el.dispatchEvent(pointer('pointerdown', { x: 500, y: 300 }));
    fc.advance(700);
    expect(cam.getCamera().x).toBe(held);
    el.dispatchEvent(pointer('pointerup', { x: 500, y: 300 }));
  });

  it('29.038 glides: the camera animates to a target inside 450 ms, never jumps on frame 1, and lands at once under reduced motion; the frame stream ends with moving: false | Frame.velocity is world x per second, smoothed 0.8 / 0.2, and 0 at rest; the last frame carries the landing | maxMs never stretches a glide past 450 ms (900 asked) and a shorter one is honoured (100); the last frame moves under 1 px | each axis lands though another settles first | a zoom past maxZoom lands at maxZoom and rests | reduced motion: a released flick leaves no momentum', () => {
    const { cam, fc, frames } = mount();
    cam.camera({ x: 5000, y: 3000, zoom: 2 });
    fc.advance(16);
    expect(cam.getCamera().x).toBeGreaterThan(0);
    expect(cam.getCamera().x).toBeLessThan(5000);
    // the first frame reports a fifth of its speed: 0.8 * 0 + 0.2 * (x - 0) / 0.016 s
    expect(frames[0]?.velocity).toBeCloseTo((cam.getCamera().x / 0.016) * 0.2, 6);
    fc.advance(480);
    expect(cam.getCamera().x).toBeCloseTo(5000, 0);
    expect(cam.getCamera().zoom).toBeCloseTo(2, 2);
    expect(frames[frames.length - 1]?.moving).toBe(false);
    expect(frames[frames.length - 1]).toMatchObject({ offset: 5000, scale: 2, velocity: 0 });
    // maxMs 900 is held to 450: a 5,000 px glide lands inside 496 ms; its first frame covers a fifth to two fifths of the way
    cam.camera({ x: 0, y: 0, zoom: 1 }, { instant: true });
    cam.camera({ x: 5000 }, { maxMs: 900 });
    fc.advance(16);
    expect(cam.getCamera().x).toBeGreaterThan(1000);
    expect(cam.getCamera().x).toBeLessThan(2000);
    fc.advance(480);
    expect(cam.getCamera().x).toBe(5000);
    // it arrives without a jump: the last frame moved under 1 px
    expect(Math.abs((frames[frames.length - 1]?.offset ?? 0) - (frames[frames.length - 2]?.offset ?? 0))).toBeLessThan(1);
    // maxMs 100 is honoured: back to 0 inside 112 ms
    cam.camera({ x: 0 }, { maxMs: 100 });
    fc.advance(112);
    expect(cam.getCamera().x).toBe(0);
    // a 1% zoom settles in about 200 ms, the 5,000 px pan later: the pan still lands (and the same for y)
    cam.camera({ x: 5000, zoom: 1.01 });
    fc.advance(700);
    expect(cam.getCamera()).toMatchObject({ x: 5000, zoom: 1.01 });
    cam.camera({ y: 5000, zoom: 1 });
    fc.advance(700);
    expect(cam.getCamera()).toMatchObject({ y: 5000, zoom: 1 });
    // a zoom asked past maxZoom glides to 4 and comes to rest
    cam.camera({ zoom: 10 });
    fc.advance(700);
    expect(cam.scale()).toBe(4);
    expect(frames[frames.length - 1]?.moving).toBe(false);
    expect(fc.pending()).toBe(0);
    const r = mount(true);
    r.cam.camera({ x: 90, zoom: 3 });
    expect(r.cam.getCamera()).toMatchObject({ x: 90, zoom: 3 });
    // reduced motion: a flick stops where the pointer let go (control: the same flick travels 360 px in the 29.038 drag case)
    r.cam.camera({ x: 0, y: 0, zoom: 1 });
    r.el.dispatchEvent(pointer('pointerdown', { x: 500, y: 300 }));
    for (let i = 1; i <= 5; i += 1) {
      r.fc.advance(16);
      r.el.dispatchEvent(pointer('pointermove', { x: 500 - i * 24, y: 300 }));
    }
    r.el.dispatchEvent(pointer('pointerup', { x: 380, y: 300 }));
    r.fc.advance(500);
    expect(r.cam.getCamera().x).toBe(120);
  });

  it('29.038 keys pan 80 px / zoom 1.25x, Shift pans four times as far; destroy detaches | every handled key is cancelled; each arrow pans its way, = and _ zoom; the zoom holds the centre and arrives without a jump; quick presses add up | ignored and not cancelled: an unhandled key, Alt, Ctrl, Meta, an already cancelled key, and typing in an input, textarea, select or contenteditable (control: a plain child pans) | destroy stops the loop mid-glide and drops the frame callbacks', () => {
    const { el, cam, fc, frames } = mount();
    const press = (key: string, shiftKey = false) => el.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true }));
    // dispatchEvent answers false when the handler cancelled the event
    expect(press('ArrowRight')).toBe(false);
    fc.advance(700);
    expect(cam.getCamera().x).toBeCloseTo(80, 0);
    press('ArrowRight', true);
    fc.advance(700);
    expect(cam.getCamera().x).toBeCloseTo(80 + 320, 0);
    const centre = cam.toWorld({ x: 400, y: 300 });
    expect(press('+')).toBe(false);
    fc.advance(700);
    expect(cam.scale()).toBeCloseTo(1.25, 2);
    // the zoom holds the world point at the centre, and its last frame changed the zoom by under 0.2%
    expect(Math.abs(cam.toWorld({ x: 400, y: 300 }).x - centre.x) * cam.scale()).toBeLessThan(0.5);
    expect(Math.abs(cam.toWorld({ x: 400, y: 300 }).y - centre.y) * cam.scale()).toBeLessThan(0.5);
    expect(Math.abs((frames[frames.length - 1]?.scale ?? 0) / (frames[frames.length - 2]?.scale ?? 1) - 1)).toBeLessThan(2e-3);
    // 80 SCREEN px: at zoom 1.25 a key pan is 64 world units
    const x1 = cam.getCamera().x;
    press('ArrowRight');
    fc.advance(700);
    expect((cam.getCamera().x - x1) * cam.scale()).toBeCloseTo(80, 0);
    // every direction and the aliases: Left, Down, Shift + Up pan their way; = zooms in and _ out
    cam.camera({ x: 0, y: 0, zoom: 1 }, { instant: true });
    expect(press('ArrowLeft')).toBe(false);
    fc.advance(700);
    expect(cam.getCamera()).toEqual({ x: -80, y: 0, zoom: 1 });
    expect(press('ArrowDown')).toBe(false);
    fc.advance(700);
    expect(cam.getCamera()).toEqual({ x: -80, y: 80, zoom: 1 });
    expect(press('ArrowUp', true)).toBe(false);
    fc.advance(700);
    expect(cam.getCamera()).toEqual({ x: -80, y: -240, zoom: 1 });
    expect(press('=')).toBe(false);
    fc.advance(700);
    expect(cam.scale()).toBe(1.25);
    expect(press('_')).toBe(false);
    fc.advance(700);
    expect(cam.scale()).toBe(1);
    expect(press('-')).toBe(false);
    fc.advance(700);
    expect(cam.scale()).toBe(0.8);
    // two quick presses add up: the second aims from the first one's target, not from where the glide has got to
    cam.camera({ x: 0, y: 0, zoom: 1 }, { instant: true });
    press('ArrowRight');
    fc.advance(32);
    press('ArrowRight');
    fc.advance(700);
    expect(cam.getCamera().x).toBe(160);
    press('+');
    fc.advance(32);
    press('+');
    fc.advance(700);
    expect(cam.scale()).toBe(1.5625);
    // ignored, and left uncancelled: a key the camera does not handle, a modifier, and a key another handler already cancelled
    cam.camera({ x: 0, y: 0, zoom: 1 }, { instant: true });
    expect(press('a')).toBe(true);
    for (const mod of ['altKey', 'ctrlKey', 'metaKey'] as const) {
      const e = new KeyboardEvent('keydown', { key: 'ArrowRight', [mod]: true, bubbles: true, cancelable: true });
      el.dispatchEvent(e);
      fc.advance(700);
      expect(e.defaultPrevented).toBe(false);
      expect(cam.getCamera().x).toBe(0);
    }
    const first = document.createElement('span');
    el.append(first);
    first.addEventListener('keydown', (e) => e.preventDefault());
    first.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
    fc.advance(700);
    expect(cam.getCamera().x).toBe(0);
    // typing in a field: each of the four kinds is left alone
    for (const html of ['<input>', '<textarea></textarea>', '<select></select>', '<div contenteditable="true"></div>']) {
      const host = document.createElement('div');
      host.innerHTML = html;
      el.append(host);
      const e = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true });
      host.firstElementChild?.dispatchEvent(e);
      fc.advance(700);
      expect(e.defaultPrevented).toBe(false);
      expect(cam.getCamera().x).toBe(0);
    }
    // control: the same ArrowRight from a plain child of the view pans
    const plain = document.createElement('span');
    el.append(plain);
    plain.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
    fc.advance(700);
    expect(cam.getCamera().x).toBe(80);
    // destroy mid-glide: the loop stops (no frame pending) and no callback hears from it again, even after a new move
    cam.camera({ x: 900 });
    fc.advance(16);
    expect(fc.pending()).toBe(1);
    const seen = frames.length;
    cam.destroy();
    expect(fc.pending()).toBe(0);
    cam.camera({ x: 1 }, { instant: true });
    fc.advance(100);
    expect(frames.length).toBe(seen);
    const e = wheel({ dy: -120 });
    el.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(false);
  });
});
