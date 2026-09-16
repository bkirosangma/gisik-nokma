import { describe, expect, it, vi } from 'vitest';
import type { BoardFilterSpec, FilterSpec } from '@gisik-nokma/app-core';
import {
  buildFilterChips,
  describeUnappliedBoardAxes,
  describeUnappliedListAxes,
  shouldRenderNarrowingStrip,
} from '../src/board-search-scope.js';

const RESOLVERS = {
  assigneeName: (id: string) => (id === 'u1' ? 'Ada' : id),
  typeName: (id: string) => (id === 'task' ? 'Task' : id),
  stateName: (id: string) => (id === 'doing' ? 'Doing' : id),
};

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

/**
 * ## `buildBoardFilterChips` (Task 4 review, Important finding, remedy 1)
 *
 * The defect this replaces: the shipped chip builder only ever checked
 * `boardFilter.text`, because `text` was the only axis with a UI control at
 * the time it was written — so `assigneeIds`/`typeIds`/`stateIds`/
 * `stateCategories`/`projectIds` could each narrow the board while producing
 * NO chip, closing the disclosure gate on cards that had, in fact, been
 * dropped. No control exists on this page yet for any of the other five
 * (Task 5's Filters sheet and Task 8's workflow picker add them), so these
 * cases call the function directly rather than through a page render that
 * has nothing to click — the same reasoning the coordinator gave for testing
 * the disclosure gate directly below.
 */
describe('13.442 buildBoardFilterChips covers every BoardFilterSpec axis, not only text', () => {
  it('emits no chip for an empty boardFilter', () => {
    const chips = buildFilterChips({}, RESOLVERS, vi.fn());
    expect(chips).toEqual([]);
  });

  it('emits a labelled, removable chip for each of the six axes when set', () => {
    const setFilter = vi.fn();
    const filter: BoardFilterSpec = {
      text: 'board',
      assigneeIds: ['u1'],
      typeIds: ['task'],
      stateIds: ['doing'],
      stateCategories: ['active'],
      projectIds: ['p_1', 'p_2'],
    };
    const chips = buildFilterChips(filter, RESOLVERS, setFilter);
    expect(chips.map((chip) => chip.key)).toEqual([
      'text',
      'assigneeIds',
      'typeIds',
      'stateIds',
      'stateCategories',
      'projectIds',
    ]);
    expect(chips.map((chip) => chip.label)).toEqual([
      'Search: "board"',
      'Assignee: Ada',
      'Type: Task',
      'State: Doing',
      'Category: Active',
      'Project: 2 selected',
    ]);
  });

  it('resolves an id through the RESOLVER, never printing a raw id when a name is known', () => {
    const chips = buildFilterChips({ assigneeIds: ['u1'] }, RESOLVERS, vi.fn());
    expect(chips[0]?.label).toBe('Assignee: Ada');
    expect(chips[0]?.label).not.toContain('u1');
  });

  it('falls back to the raw id when the resolver has no name for it', () => {
    const chips = buildFilterChips({ assigneeIds: ['u_unknown'] }, RESOLVERS, vi.fn());
    expect(chips[0]?.label).toBe('Assignee: u_unknown');
  });

  it('ignores an EMPTY list axis — it does not narrow, so it earns no chip', () => {
    const chips = buildFilterChips({ assigneeIds: [] }, RESOLVERS, vi.fn());
    expect(chips).toEqual([]);
  });

  it("each chip's onRemove clears exactly its own axis and no other", () => {
    const setFilter = vi.fn();
    const filter: BoardFilterSpec = { text: 'board', assigneeIds: ['u1'] };
    const chips = buildFilterChips(filter, RESOLVERS, setFilter);
    const assigneeChip = chips.find((chip) => chip.key === 'assigneeIds');
    assigneeChip?.onRemove();

    expect(setFilter).toHaveBeenCalledTimes(1);
    const updater = setFilter.mock.calls[0]?.[0] as (current: FilterSpec) => FilterSpec;
    const current: FilterSpec = { text: 'board', assigneeIds: ['u1'], typeIds: ['task'] };
    // The patch clears ONLY assigneeIds — text and typeIds (an axis this
    // chip does not own) pass through untouched.
    expect(updater(current)).toEqual({ text: 'board', assigneeIds: undefined, typeIds: ['task'] });
  });
});

/**
 * ## `shouldRenderBoardNarrowingStrip` (Task 4 review, Important finding, remedy 2)
 *
 * `activeFilterChips.length > 0 || boardUnappliedAxes.length > 0` alone
 * cannot notice a mechanism that narrows the board WITHOUT setting any
 * filter axis at all — Task 8's workflow picker narrows by dropping whole
 * GROUPS. That state cannot be constructed through this page's own inputs
 * today (nothing on this page drops a group without going through a filter
 * axis first), so per the coordinator's own instruction this tests the gate
 * EXPRESSION directly rather than writing a page-render test that would pass
 * for the wrong reason.
 */
describe('13.443 shouldRenderBoardNarrowingStrip is not blind to narrowing with no named axis', () => {
  it('is false when nothing is active and nothing is hidden', () => {
    expect(
      shouldRenderNarrowingStrip({ chipCount: 0, unappliedAxisCount: 0, shown: 3, total: 3 }),
    ).toBe(false);
  });

  it('is true on a chip alone (remedy 1’s own case)', () => {
    expect(
      shouldRenderNarrowingStrip({ chipCount: 1, unappliedAxisCount: 0, shown: 3, total: 3 }),
    ).toBe(true);
  });

  it('is true on an unapplied axis alone', () => {
    expect(
      shouldRenderNarrowingStrip({ chipCount: 0, unappliedAxisCount: 1, shown: 3, total: 3 }),
    ).toBe(true);
  });

  it('THE CASE THAT WOULD FAIL WITHOUT REMEDY 2: shown !== total, no chip, no unapplied axis', () => {
    // This is exactly the state a group-dropping mechanism (no filter axis
    // set at all) produces: something is hidden, but neither of the first
    // two terms has any way to know it.
    expect(
      shouldRenderNarrowingStrip({ chipCount: 0, unappliedAxisCount: 0, shown: 1, total: 3 }),
    ).toBe(true);
  });

  it('is true when all three terms are true at once', () => {
    expect(
      shouldRenderNarrowingStrip({ chipCount: 1, unappliedAxisCount: 1, shown: 1, total: 3 }),
    ).toBe(true);
  });
});

/** 13.546 — the exclude half's chips (exclude-mode spec §2/§4): one per axis set, "Not …", removable by half. */
describe('13.546 buildFilterChips emits a "Not …" chip for each exclude axis, beside its include chip', () => {
  it('labels and keys every exclude axis, directly after the same axis\'s include chip', () => {
    const chips = buildFilterChips(
      {
        assigneeIds: ['u1'],
        exclude: { assigneeIds: ['u_unknown'], typeIds: ['task'], stateIds: ['doing'], stateCategories: ['terminal'], projectIds: ['p_1', 'p_2'] },
      },
      RESOLVERS,
      vi.fn(),
    );
    expect(chips.map((chip) => chip.key)).toEqual([
      'assigneeIds',
      'exclude.assigneeIds',
      'exclude.typeIds',
      'exclude.stateIds',
      'exclude.stateCategories',
      'exclude.projectIds',
    ]);
    expect(chips.map((chip) => chip.label)).toEqual([
      'Assignee: Ada',
      'Not assignee: u_unknown',
      'Not type: Task',
      'Not state: Doing',
      'Not category: Terminal',
      'Not project: 2 selected',
    ]);
    expect(chips.map((chip) => chip.mode)).toEqual(['include', 'exclude', 'exclude', 'exclude', 'exclude', 'exclude']);
  });

  it('an exclude chip\'s onRemove clears ONLY that exclude axis — the include half of the same axis survives', () => {
    const setFilter = vi.fn();
    const chips = buildFilterChips({ assigneeIds: ['u1'], exclude: { assigneeIds: ['u2'], typeIds: ['task'] } }, RESOLVERS, setFilter);
    chips.find((chip) => chip.key === 'exclude.assigneeIds')?.onRemove();
    const updater = setFilter.mock.calls[0]?.[0] as (current: FilterSpec) => FilterSpec;
    expect(updater({ assigneeIds: ['u1'], exclude: { assigneeIds: ['u2'], typeIds: ['task'] } })).toEqual({
      assigneeIds: ['u1'],
      exclude: { assigneeIds: undefined, typeIds: ['task'] },
    });
  });

  it('removing the last exclude axis collapses the exclude half to undefined', () => {
    const setFilter = vi.fn();
    const chips = buildFilterChips({ exclude: { typeIds: ['task'] } }, RESOLVERS, setFilter);
    chips[0]?.onRemove();
    const updater = setFilter.mock.calls[0]?.[0] as (current: FilterSpec) => FilterSpec;
    expect(updater({ text: 'x', exclude: { typeIds: ['task'] } })).toEqual({ text: 'x', exclude: undefined });
  });

  it('an include chip\'s onRemove leaves the exclude half of the same axis alone', () => {
    const setFilter = vi.fn();
    const chips = buildFilterChips({ assigneeIds: ['u1'], exclude: { assigneeIds: ['u2'] } }, RESOLVERS, setFilter);
    chips.find((chip) => chip.key === 'assigneeIds')?.onRemove();
    const updater = setFilter.mock.calls[0]?.[0] as (current: FilterSpec) => FilterSpec;
    expect(updater({ assigneeIds: ['u1'], exclude: { assigneeIds: ['u2'] } })).toEqual({
      assigneeIds: undefined,
      exclude: { assigneeIds: ['u2'] },
    });
  });

  it('empty exclude lists earn no chip', () => {
    expect(buildFilterChips({ exclude: { typeIds: [] } }, RESOLVERS, vi.fn())).toEqual([]);
  });
});

/** 13.547 — the axes each tab cannot evaluate, in both halves. */
describe('13.547 unapplied axes name the exclude half too, per tab', () => {
  it('the board discloses exclude.collaboratorIds as "collaborator", once, even when the include half sets it too', () => {
    expect(describeUnappliedBoardAxes({ exclude: { collaboratorIds: ['u9'] } })).toEqual(['collaborator']);
    expect(describeUnappliedBoardAxes({ collaboratorIds: ['u1'], exclude: { collaboratorIds: ['u9'] } })).toEqual(['collaborator']);
    expect(describeUnappliedBoardAxes({ exclude: { collaboratorIds: [] } })).toEqual([]);
  });

  it('the list discloses only collaborator — it answers due dates and fields itself', () => {
    expect(describeUnappliedListAxes({})).toEqual([]);
    expect(describeUnappliedListAxes({ collaboratorIds: ['u1'] })).toEqual(['collaborator']);
    expect(describeUnappliedListAxes({ exclude: { collaboratorIds: ['u9'] } })).toEqual(['collaborator']);
    expect(describeUnappliedListAxes({ dueBefore: '2026-09-30', fields: { priority: 'high' } })).toEqual([]);
  });
});
