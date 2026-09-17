import { describe, expect, it } from 'vitest';
import type { FilterSpec } from '@gisik-nokma/app-core';
import { choiceMode, closedMode, nextMode, withCycledClosed, withCycledId } from '../src/filter-cycle.js';

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

/**
 * 13.598 — the Closed axis's own cycle (backlog/closed spec §5.5, amended by
 * Ruling 44/45): `closed: undefined | true | false` in `ChoiceMode`'s own
 * three terms (`off`/`include`/`exclude`), cycling through `nextMode`
 * UNCHANGED rather than a second three-state vocabulary. `closed` is a
 * single boolean, not an id axis, so `withCycledClosed` writes/deletes
 * `filter.closed` directly instead of going through `withIdAxis`.
 */
describe('13.598 closedMode and withCycledClosed', () => {
  it('reads all/only/hidden as off/include/exclude', () => {
    expect(closedMode({})).toBe('off');
    expect(closedMode({ closed: true })).toBe('include');
    expect(closedMode({ closed: false })).toBe('exclude');
  });

  it('cycles off -> include -> exclude -> off, over filter.closed directly', () => {
    let filter: FilterSpec = {};

    filter = withCycledClosed(filter);
    expect(filter).toEqual({ closed: true });
    expect(closedMode(filter)).toBe('include');

    filter = withCycledClosed(filter);
    expect(filter).toEqual({ closed: false });
    expect(closedMode(filter)).toBe('exclude');

    filter = withCycledClosed(filter);
    expect(filter).toEqual({});
    expect(closedMode(filter)).toBe('off');
    // Off DELETES the key (Ruling 44) rather than writing `closed: undefined`
    // the way `withIdAxis`'s own collapse rule does — `toEqual` treats the
    // two the same, so the key's actual presence is checked directly.
    expect('closed' in filter).toBe(false);
  });

  it('a full cycle leaves every other axis on the filter untouched', () => {
    const withOtherAxes: FilterSpec = { text: 'restock', assigneeIds: ['u1'] };
    const cycled = withCycledClosed(withCycledClosed(withCycledClosed(withOtherAxes)));
    expect(cycled).toEqual({ text: 'restock', assigneeIds: ['u1'] });
  });
});
