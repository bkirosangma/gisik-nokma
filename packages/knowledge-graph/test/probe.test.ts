import { describe, expect, it, vi } from 'vitest';
import { springStep, type CameraState } from '../src/engine/camera.js';
import { RING_CONFIGS } from '../src/engine/layout.js';
import type { ThemePalette } from '../src/render/palette.js';
import type { KgSigma } from '../src/render/sigma/program.js';

// jsdom has no WebGL, so the REAL adapter mounts with Sigma's three collaborators stubbed; graphology is plain JS and runs.
const { probeSentinel } = vi.hoisted(() => ({ probeSentinel: { sentinel: 'probe' } }));
vi.mock('../src/render/sigma/program.js', () => ({
  createSigma: () => ({ on: () => undefined, setCustomBBox: () => undefined, kill: () => undefined }),
  labelsOf: () => ({ measure: () => ({ width: 0, height: 0, textHeight: 0 }), margin: 5 }),
}));
vi.mock('../src/render/sigma/attachment-cache.js', () => ({ keepAttachmentCache: () => () => undefined }));
vi.mock('../src/render/sigma/camera-driver.js', () => ({ createCameraDriver: () => ({ goTo: () => undefined, zoomCentre: () => undefined, panBy: () => undefined, destroy: () => undefined }) }));
vi.mock('../src/render/sigma/probe.js', () => ({ createProbe: () => probeSentinel }));
const { createSigmaRenderer } = await import('../src/render/sigma/adapter.js');

describe('the probe is a test hook only', () => {
  it('27.289 inspect() is null unless the mount element carries data-kg-probe; control: the same mount WITH the attribute returns the probe', () => {
    const opts = { phone: false, config: RING_CONFIGS.desktop, reduceMotion: () => true };
    const plain = createSigmaRenderer();
    plain.mount(document.createElement('div'), {} as ThemePalette, opts);
    expect(plain.inspect()).toBeNull();
    const el = document.createElement('div');
    el.setAttribute('data-kg-probe', '');
    const probed = createSigmaRenderer();
    probed.mount(el, {} as ThemePalette, opts);
    expect(probed.inspect()).toBe(probeSentinel);
  });
});

describe('the camera spring on a stub Sigma', () => {
  it('27.284 the first spring frame steps 16 ms (1 − e^(−16/85) ≈ 0.1717 of the way), not a snap; control: a second frame 40 ms later steps the measured 40 ms (1 − e^(−40/85) ≈ 0.3753 of what is left), not the 16 ms default', async () => {
    // this file mocks the driver for the adapter above; the REAL one is under test here
    const { createCameraDriver } = await vi.importActual<typeof import('../src/render/sigma/camera-driver.js')>('../src/render/sigma/camera-driver.js');
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb));
    vi.stubGlobal('cancelAnimationFrame', () => undefined);
    try {
      let state = { x: 0.5, y: 0.5, ratio: 1, angle: 0 };
      const set: CameraState[] = [];
      const listeners: ((s: CameraState) => void)[] = [];
      const camera = {
        getState: () => ({ ...state }),
        setState: (s: typeof state) => {
          state = { ...s };
          set.push({ x: s.x, y: s.y, ratio: s.ratio });
          listeners.forEach((cb) => cb(state)); // Sigma's camera emits `updated` on every setState
        },
        on: (_: 'updated', cb: (s: CameraState) => void) => void listeners.push(cb),
      };
      const sigma = { getCamera: () => camera, on: () => undefined } as unknown as KgSigma;
      const driver = createCameraDriver(sigma, document.createElement('div'), () => 1, () => false, () => undefined);
      const start: CameraState = { x: 0.5, y: 0.5, ratio: 1 }, target: CameraState = { x: 0.9, y: 0.1, ratio: 0.5 };
      driver.goTo(target, false);
      expect(set).toEqual([]); // not instant: nothing moves before a frame
      frames.shift()!(1000); // the first frame has no previous timestamp
      expect(set).toHaveLength(1);
      expect(set[0]).toEqual(springStep(start, target, 16, false).state);
      expect((set[0]!.x - start.x) / (target.x - start.x)).toBeCloseTo(1 - Math.exp(-16 / 85), 3);
      expect((set[0]!.x - start.x) / (target.x - start.x)).toBeCloseTo(0.1717, 3);
      frames.shift()!(1040); // control: a real frame 40 ms later steps the measured dt, not the 16 ms default (a dt of 16 here could not tell them apart)
      expect(set).toHaveLength(2);
      expect(set[1]).toEqual(springStep(set[0]!, target, 40, false).state);
      expect((set[1]!.x - set[0]!.x) / (target.x - set[0]!.x)).toBeCloseTo(1 - Math.exp(-40 / 85), 3);
      expect((set[1]!.x - set[0]!.x) / (target.x - set[0]!.x)).toBeCloseTo(0.3753, 3);
      driver.destroy();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
