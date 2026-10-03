import { expect, test } from '@playwright/test';
import { parseResult } from '../harness/results.js';

const pan = { frames: 120, fps: 59.9, worstMs: 18.2, p95Ms: 16.9, over167: 3, over20: 0, over50: 0 };
const good = { scene: 'time', count: 1200, device: 'Mozilla/5.0 (iPhone)', touch: true, pan, clickToSettleMs: null };

test('29.005 parseResult accepts a run record and refuses everything else; control: one field changed at a time', () => {
  expect(parseResult(good)).toEqual({ ok: true, record: good });
  expect(parseResult({ ...good, scene: 'view', clickToSettleMs: 41.5 }).ok).toBe(true);
  for (const bad of [
    null,
    'x',
    { ...good, scene: 'graph' },
    { ...good, count: -1 },
    { ...good, device: '' },
    { ...good, touch: 'yes' },
    { ...good, pan: null },
    { ...good, pan: { ...pan, fps: Number.NaN } },
    { ...good, pan: { ...pan, worstMs: '18' } },
    { ...good, clickToSettleMs: 'fast' },
  ]) {
    expect(parseResult(bad).ok, JSON.stringify(bad)).toBe(false);
  }
});
