// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  MAX_PPD,
  MIN_PPD,
  ZOOM_PRESETS,
  clampPpd,
  dayAt,
  packScale,
  presetOf,
  stepGeometric,
  wheelIntent,
  wheelZoomFactor,
  zoomAbout,
} from '../src/index.js';

describe('29.011 anchored zoom', () => {
  it('29.011 the day under the anchor keeps its screen x within 0.5 px on every frame of a zoom sweep; control: zooming about the centre moves the day under the pointer', () => {
    const anchorPx = 300;
    let view = { offsetDay: 20_000.3, ppd: 56 };
    const anchorDay = dayAt(view, anchorPx);
    let ppd = view.ppd;
    for (let i = 0; i < 200; i += 1) {
      ppd = stepGeometric(ppd, 8, 16).value;
      view = zoomAbout(view, ppd, anchorPx);
      expect(Math.abs((anchorDay - view.offsetDay) * view.ppd - anchorPx)).toBeLessThan(0.5);
    }
    expect(view.ppd).toBeLessThan(56);
    const centred = zoomAbout({ offsetDay: 20_000.3, ppd: 56 }, 8, 600);
    expect(Math.abs((anchorDay - centred.offsetDay) * centred.ppd - anchorPx)).toBeGreaterThan(0.5);
  });
});

describe('29.012 limits, presets and the packing scale', () => {
  it('29.012 4 to 96 px per day; Day 56, Week 24, Month 8; a free zoom between presets marks none; control: the exact presets are marked', () => {
    expect([MIN_PPD, MAX_PPD]).toEqual([4, 96]);
    expect(ZOOM_PRESETS).toEqual({ day: 56, week: 24, month: 8 });
    expect(clampPpd(2)).toBe(4);
    expect(clampPpd(500)).toBe(96);
    expect(clampPpd(500, 40)).toBe(40);
    expect(clampPpd(500, 1)).toBe(4);
    expect(presetOf(40)).toBeNull();
    expect(presetOf(56)).toBe('day');
    expect(presetOf(24)).toBe('week');
    expect(presetOf(8)).toBe('month');
  });

  it('29.012 the packing scale is the lower bound of the power-of-two bucket; it changes only across a bucket edge; control: 15.99 and 16 differ', () => {
    expect([4, 7.9, 8, 15.99, 16, 31, 32, 63, 64, 96].map(packScale)).toEqual([4, 4, 8, 8, 16, 16, 32, 32, 64, 64]);
    expect(packScale(15.99)).not.toBe(packScale(16));
    expect(packScale(128)).toBe(64); // the bucket never passes 64
  });
});

describe('29.013 the wheel', () => {
  it('29.013 wheelIntent is the Knowledge Graph classifier exactly; the time surfaces take over only Ctrl + wheel; control: Shift + wheel and a plain vertical wheel are the platform\'s', () => {
    const w = (o: Partial<{ deltaMode: number; deltaX: number; deltaY: number; ctrlKey: boolean }>) => ({ deltaMode: 0, deltaX: 0, deltaY: 0, ctrlKey: false, ...o });
    expect(wheelIntent(w({ ctrlKey: true, deltaY: 10 }))).toEqual({ kind: 'zoom', factor: Math.exp(-10 * 0.012) });
    expect(wheelIntent(w({ deltaY: 100 }))).toEqual({ kind: 'zoom', factor: Math.exp(-100 * 0.0022) });
    expect(wheelIntent(w({ deltaX: 3, deltaY: 12 }))).toEqual({ kind: 'pan', dx: 3, dy: 12 });
    expect(wheelIntent(w({ deltaY: 40 }))).toEqual({ kind: 'zoom', factor: Math.exp(-40 * 0.0022) }); // 40 px is a notch
    expect(wheelIntent(w({ deltaY: 40.5 }))).toEqual({ kind: 'pan', dx: 0, dy: 40.5 }); // a fractional delta is a trackpad
    expect(wheelIntent(w({ deltaMode: 1, deltaY: 3 }))).toEqual({ kind: 'zoom', factor: Math.exp(-48 * 0.0022) });
    expect(wheelZoomFactor(w({ ctrlKey: true, deltaY: 10 }))).toBe(Math.exp(-10 * 0.012));
    expect(wheelZoomFactor(w({ ctrlKey: true, deltaMode: 1, deltaY: 1 }))).toBe(Math.exp(-16 * 0.012));
    expect(wheelZoomFactor(w({ deltaY: 100 }))).toBeNull();
    expect(wheelZoomFactor(w({ deltaX: 40 }))).toBeNull();
  });
});
