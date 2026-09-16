import { describe, expect, it } from 'vitest';
import type { FilterSpec } from '@gisik-nokma/app-core';
import { choiceMode, nextMode, withCycledId } from '../src/filter-cycle.js';

/** 13.548 — the tri-state cycle (exclude-mode spec §4): off → include → exclude → off. */
describe('13.548 choiceMode and nextMode', () => {
  it('reads the mode of one value on one axis from either half', () => {
    const filter: FilterSpec = { assigneeIds: ['u1'], exclude: { assigneeIds: ['u2'] } };
    expect(choiceMode(filter, 'assigneeIds', 'u1')).toBe('include');
    expect(choiceMode(filter, 'assigneeIds', 'u2')).toBe('exclude');
    expect(choiceMode(filter, 'assigneeIds', 'u3')).toBe('off');
    expect(choiceMode({}, 'stateCategories', 'active')).toBe('off');
  });

  it('cycles off → include → exclude → off', () => {
    expect(nextMode('off')).toBe('include');
    expect(nextMode('include')).toBe('exclude');
    expect(nextMode('exclude')).toBe('off');
  });
});

/** 13.549 — one click moves the value between halves and never leaves it in both. */
describe('13.549 withCycledId', () => {
  it('off → include: adds to the include list', () => {
    expect(withCycledId({}, 'typeIds', 'bug')).toEqual({ typeIds: ['bug'] });
  });

  it('include → exclude: removes from include, adds to exclude', () => {
    expect(withCycledId({ typeIds: ['task', 'bug'] }, 'typeIds', 'bug')).toEqual({
      typeIds: ['task'],
      exclude: { typeIds: ['bug'] },
    });
  });

  it('exclude → off: removes from exclude and collapses what empties', () => {
    expect(withCycledId({ exclude: { typeIds: ['bug'] } }, 'typeIds', 'bug')).toEqual({
      exclude: undefined,
    });
    expect(withCycledId({ typeIds: ['task'], exclude: { typeIds: ['bug'] } }, 'typeIds', 'bug')).toEqual({
      typeIds: ['task'],
      exclude: undefined,
    });
  });

  it('a value the caller left in BOTH halves is treated as include and moves to exclude alone', () => {
    // The sheet never produces this shape; the cycler repairs it rather than preserving it.
    expect(withCycledId({ typeIds: ['bug'], exclude: { typeIds: ['bug'] } }, 'typeIds', 'bug')).toEqual({
      typeIds: undefined,
      exclude: { typeIds: ['bug'] },
    });
  });

  it('never leaves a value in both halves, over a full cycle of three clicks', () => {
    let filter: FilterSpec = { assigneeIds: ['u1'] };
    for (let i = 0; i < 3; i += 1) {
      filter = withCycledId(filter, 'assigneeIds', 'u9');
      const inInclude = filter.assigneeIds?.includes('u9') ?? false;
      const inExclude = filter.exclude?.assigneeIds?.includes('u9') ?? false;
      expect(inInclude && inExclude).toBe(false);
      expect(filter.assigneeIds?.includes('u1')).toBe(true);
    }
    expect(choiceMode(filter, 'assigneeIds', 'u9')).toBe('off');
  });

  it('works for the StateCategory-typed axis', () => {
    expect(withCycledId({ stateCategories: ['active'] }, 'stateCategories', 'active')).toEqual({
      stateCategories: undefined,
      exclude: { stateCategories: ['active'] },
    });
  });
});
