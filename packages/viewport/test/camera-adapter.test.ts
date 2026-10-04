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
  it('29.037 it writes ONE transform on the layer, from the camera: screen = (world - camera) * zoom; control: the touch-action and overscroll are set so the page never pans under it', () => {
    const { el, layer, cam } = mount();
    cam.camera({ x: 100, y: 50, zoom: 2 }, { instant: true });
    expect(layer.style.transform).toBe('translate(-200px, -100px) scale(2)');
    expect(cam.getCamera()).toEqual({ x: 100, y: 50, zoom: 2 });
    expect(el.style.touchAction).toBe('none');
    expect(el.style.overscrollBehavior).toBe('contain');
    expect(cam.toWorld({ x: 400, y: 300 })).toEqual({ x: 300, y: 200 });
  });

  it('29.037 wheel: a notched wheel and Ctrl + wheel zoom about the pointer (the world point under it does not move), a pixel scroll pans; all cancelled; zoom stays in [min, max]', () => {
    const { el, cam } = mount();
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
  });

  it('29.037 a pixel wheel pans by delta / zoom; control: the same delta at zoom 2 moves half as many world units', () => {
    const { el, cam } = mount();
    el.dispatchEvent(wheel({ dx: 40, dy: 0 }));
    expect(cam.getCamera().x).toBe(40);
    cam.camera({ x: 0, y: 0, zoom: 2 }, { instant: true });
    el.dispatchEvent(wheel({ dx: 40, dy: 0 }));
    expect(cam.getCamera().x).toBe(20);
  });

  it('29.038 drag pans (touch too); two fingers pinch about their midpoint; a flick keeps going and stops; control: a rested release does not', () => {
    const { el, cam, fc } = mount();
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
    el.dispatchEvent(pointer('pointerup', { x: 450, y: 300 }));
    const still = cam.getCamera().x;
    fc.advance(500);
    expect(cam.getCamera().x).toBe(still);
  });

  it('29.038 glides: the camera animates to a target inside 450 ms, never jumps on frame 1, and lands at once under reduced motion; the frame stream ends with moving: false', () => {
    const { cam, fc, frames } = mount();
    cam.camera({ x: 5000, y: 3000, zoom: 2 });
    fc.advance(16);
    expect(cam.getCamera().x).toBeGreaterThan(0);
    expect(cam.getCamera().x).toBeLessThan(5000);
    fc.advance(480);
    expect(cam.getCamera().x).toBeCloseTo(5000, 0);
    expect(cam.getCamera().zoom).toBeCloseTo(2, 2);
    expect(frames[frames.length - 1]?.moving).toBe(false);
    const r = mount(true);
    r.cam.camera({ x: 90, zoom: 3 });
    expect(r.cam.getCamera()).toMatchObject({ x: 90, zoom: 3 });
  });

  it('29.038 keys pan 80 px / zoom 1.25x, Shift pans four times as far; destroy detaches', () => {
    const { el, cam, fc } = mount();
    const press = (key: string, shiftKey = false) => el.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true }));
    press('ArrowRight');
    fc.advance(700);
    expect(cam.getCamera().x).toBeCloseTo(80, 0);
    press('ArrowRight', true);
    fc.advance(700);
    expect(cam.getCamera().x).toBeCloseTo(80 + 320, 0);
    press('+');
    fc.advance(700);
    expect(cam.scale()).toBeCloseTo(1.25, 2);
    // 80 SCREEN px: at zoom 1.25 a key pan is 64 world units
    const x1 = cam.getCamera().x;
    press('ArrowRight');
    fc.advance(700);
    expect((cam.getCamera().x - x1) * cam.scale()).toBeCloseTo(80, 0);
    cam.destroy();
    const e = wheel({ dy: -120 });
    el.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(false);
  });
});
