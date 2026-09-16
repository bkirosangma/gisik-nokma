import { describe, expect, it } from 'vitest';
import type { FilterSpec } from '@gisik-nokma/app-core';
import { describeUnappliedBoardAxes } from '../src/board-search-scope.js';

/**
 * `describeUnappliedBoardAxes` is a pure function extracted from `page.tsx`
 * (Task 4 fix round 1, coordinator concern 4). Before this file it had zero
 * executions: nothing in Task 4 sets `collaboratorIds`/`dueBefore`/
 * `dueAfter`/`fields`, so Task 5's Filters sheet would have been its FIRST
 * real caller. Unit-tested directly here so a mistake in it is caught now,
 * not discovered mid-Task-5.
 */
describe('13.440 describeUnappliedBoardAxes names each axis a board cannot evaluate', () => {
  it('reports nothing for an empty filter', () => {
    expect(describeUnappliedBoardAxes({})).toEqual([]);
  });

  it('ignores an EMPTY collaboratorIds list — an empty list does not narrow', () => {
    expect(describeUnappliedBoardAxes({ collaboratorIds: [] })).toEqual([]);
  });

  it('ignores an EMPTY fields record — nothing claimed, nothing to disclose', () => {
    expect(describeUnappliedBoardAxes({ fields: {} })).toEqual([]);
  });

  it('names "collaborator" when collaboratorIds is set and nonempty', () => {
    expect(describeUnappliedBoardAxes({ collaboratorIds: ['u9'] })).toEqual(['collaborator']);
  });

  it('names "due date" when only dueBefore is set', () => {
    expect(describeUnappliedBoardAxes({ dueBefore: '2026-09-30' })).toEqual(['due date']);
  });

  it('names "due date" when only dueAfter is set', () => {
    expect(describeUnappliedBoardAxes({ dueAfter: '2026-09-01' })).toEqual(['due date']);
  });

  it('names "due date" exactly once when BOTH dueBefore and dueAfter are set', () => {
    expect(
      describeUnappliedBoardAxes({ dueBefore: '2026-09-30', dueAfter: '2026-09-01' }),
    ).toEqual(['due date']);
  });

  it('names "custom field" when fields carries at least one clause', () => {
    expect(describeUnappliedBoardAxes({ fields: { priority: 'high' } })).toEqual(['custom field']);
  });
});

describe('13.441 the combined case names all active axes, in a stable order', () => {
  it('names all three, always in the same collaborator / due date / custom field order', () => {
    const filter: FilterSpec = {
      collaboratorIds: ['u9'],
      dueBefore: '2026-09-30',
      fields: { priority: 'high' },
    };
    expect(describeUnappliedBoardAxes(filter)).toEqual(['collaborator', 'due date', 'custom field']);
  });

  it('does not reorder when the axes are supplied in a different order on the input object', () => {
    // Object property order on the INPUT must not leak into the OUTPUT order —
    // the function's own fixed if/if/if sequence is what governs it, not
    // however the caller happened to construct the FilterSpec literal.
    const filter: FilterSpec = {
      fields: { priority: 'high' },
      dueAfter: '2026-09-01',
      collaboratorIds: ['u9'],
    };
    expect(describeUnappliedBoardAxes(filter)).toEqual(['collaborator', 'due date', 'custom field']);
  });

  it('a BoardFilterSpec-representable axis (text) never appears in this list', () => {
    // text/assigneeIds/typeIds/stateIds/stateCategories/projectIds are all
    // axes the board CAN evaluate — this function must never name one of them
    // as "unapplied", or the scope note would tell a person a real filter
    // wasn't running when it was.
    const filter: FilterSpec = { text: 'board', assigneeIds: ['u1'] };
    expect(describeUnappliedBoardAxes(filter)).toEqual([]);
  });
});
