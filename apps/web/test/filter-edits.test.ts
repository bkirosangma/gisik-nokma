import { describe, expect, it } from 'vitest';
import type { FilterSpec } from '@gisik-nokma/app-core';
import { withIdAxis } from '../src/filter-edits.js';

/** 13.545 — the one place either half of one axis is written, with the collapse rule (exclude-mode spec §4). */
describe('13.545 withIdAxis writes one axis of one half and collapses emptiness', () => {
  it('sets an include axis and leaves the rest of the filter untouched', () => {
    const next = withIdAxis({ text: 'gst', typeIds: ['task'] }, 'include', 'assigneeIds', ['u1']);
    expect(next).toEqual({ text: 'gst', typeIds: ['task'], assigneeIds: ['u1'] });
  });

  it('sets an exclude axis, creating the exclude half when absent', () => {
    expect(withIdAxis({ text: 'gst' }, 'exclude', 'assigneeIds', ['u2'])).toEqual({
      text: 'gst',
      exclude: { assigneeIds: ['u2'] },
    });
  });

  it('an empty list collapses to undefined on either half', () => {
    expect(withIdAxis({ assigneeIds: ['u1'] }, 'include', 'assigneeIds', [])).toEqual({ assigneeIds: undefined });
    expect(withIdAxis({ exclude: { assigneeIds: ['u2'], typeIds: ['bug'] } }, 'exclude', 'assigneeIds', [])).toEqual({
      exclude: { assigneeIds: undefined, typeIds: ['bug'] },
    });
  });

  it('an exclude half left with no defined axis collapses to undefined — indistinguishable from never touched', () => {
    expect(withIdAxis({ text: 'gst', exclude: { typeIds: ['bug'] } }, 'exclude', 'typeIds', undefined)).toEqual({
      text: 'gst',
      exclude: undefined,
    });
  });

  it('is pure — the input is not mutated', () => {
    const input: FilterSpec = { exclude: { typeIds: ['bug'] } };
    withIdAxis(input, 'exclude', 'typeIds', ['task']);
    expect(input).toEqual({ exclude: { typeIds: ['bug'] } });
  });
});
