import { describe, expect, it, vi } from 'vitest';
import { RING_CONFIGS } from '../src/engine/layout.js';
import type { ThemePalette } from '../src/render/palette.js';

// jsdom has no WebGL, so the REAL adapter mounts with Sigma's three collaborators stubbed; graphology is plain JS and runs.
const { probeSentinel } = vi.hoisted(() => ({ probeSentinel: { sentinel: 'probe' } }));
vi.mock('../src/render/sigma/program.js', () => ({ createSigma: () => ({ on: () => undefined, setCustomBBox: () => undefined, kill: () => undefined }) }));
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
