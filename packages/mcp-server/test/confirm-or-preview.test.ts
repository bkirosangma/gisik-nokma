import { describe, expect, it } from 'vitest';
import { confirmOrPreview } from '../src/tools/preview.js';

const explain = async () => ({ sentence: 'Does the thing.', counts: { n: 2 } });

describe('confirmOrPreview', () => {
  it('14.603 names the confirm parameter it was given; the default is confirm_name; the comparison is exact', async () => {
    expect(await confirmOrPreview('KEY-1', undefined, explain)).toEqual({
      preview: true, wouldChange: 'Does the thing.', counts: { n: 2 }, nothingChanged: true, confirm: 'confirm_name must be "KEY-1"',
    });
    expect((await confirmOrPreview('01J0USER', undefined, explain, 'confirm_assignee'))?.confirm).toBe('confirm_assignee must be "01J0USER"');
    expect((await confirmOrPreview('3', undefined, explain, 'confirm_count'))?.confirm).toBe('confirm_count must be "3"');
    for (const wrong of ['KEY-1 ', ' KEY-1', 'key-1', 'KEY-2', '']) expect(await confirmOrPreview('KEY-1', wrong, explain), JSON.stringify(wrong)).not.toBeNull();
    // CONTROL, same `it`: the exact value goes ahead, whatever the parameter is called.
    expect(await confirmOrPreview('KEY-1', 'KEY-1', explain)).toBeNull();
    expect(await confirmOrPreview('3', '3', explain, 'confirm_count')).toBeNull();
  });
});
