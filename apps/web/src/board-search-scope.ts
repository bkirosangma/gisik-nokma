import type { BoardFilterSpec, FilterSpec } from '@gisik-nokma/app-core';

/**
 * Axes an active filter carries that a BOARD cannot evaluate at all —
 * `matchesBoardCard`'s own docblock names why: `BoardCard`
 * (`view-types.ts:106-116`) carries no collaborators, no claimed dates and no
 * custom-field claims, so `collaboratorIds`, `dueBefore`/`dueAfter` and
 * `fields` have nothing on a board card to compare against. This is a PURE
 * function — extracted out of `page.tsx`'s own `useMemo` (coordinator Ruling
 * on Task 4's fix round 1, concern 4) so it has a test that runs it directly,
 * rather than shipping unexecuted until Task 5's Filters sheet gives it its
 * first real caller.
 *
 * Order is FIXED and hand-written, never derived from object key order or a
 * `Set`/`Map` iteration — a note whose wording reshuffled between renders
 * would read as flicker. Always called with the FULL `FilterSpec`, never with
 * `BoardFilterSpec` (which cannot carry any of these three axes at all by
 * construction) — see `page.tsx`'s own comment on why its `filter` state is
 * typed `FilterSpec`.
 */
export function describeUnappliedBoardAxes(filter: FilterSpec): string[] {
  const axes: string[] = [];
  if (filter.collaboratorIds !== undefined && filter.collaboratorIds.length > 0) {
    axes.push('collaborator');
  }
  if (filter.dueBefore !== undefined || filter.dueAfter !== undefined) {
    axes.push('due date');
  }
  if (filter.fields !== undefined && Object.keys(filter.fields).length > 0) {
    axes.push('custom field');
  }
  return axes;
}

export type BoardFilterChip = { key: string; label: string; onRemove: () => void };

/** How each `BoardFilterSpec` id axis turns a raw id into words a chip can show. */
export type BoardFilterChipResolvers = {
  assigneeName: (id: string) => string;
  typeName: (id: string) => string;
  stateName: (id: string) => string;
};

function capitalizeWord(word: string): string {
  return word.length === 0 ? word : word.charAt(0).toUpperCase() + word.slice(1);
}

/**
 * One removable chip per axis ACTUALLY SET on `boardFilter` — the same
 * six-field object handed to `matchesBoardCard` (`text`, `assigneeIds`,
 * `typeIds`, `stateIds`, `stateCategories`, `projectIds`), read directly
 * rather than re-declared as a second, independently-maintained list.
 *
 * THE DEFECT THIS REPLACES (Task 4 review, Important finding): the first
 * version of this function only ever checked `boardFilter.text`, because
 * `text` was the only axis with a UI control when it was written. The other
 * five could narrow the rendered board while producing no chip and no
 * unapplied-axis entry, closing the disclosure gate on cards that had, in
 * fact, been dropped — `board.tsx:216-219` exactly, unreachable only because no
 * control existed yet to set them. Building the chip list from `boardFilter`
 * itself, covering every one of its six fields, is what stops a future
 * control (Task 5's Filters sheet, Task 8's workflow picker) writing an axis
 * this function has never heard of.
 *
 * `projectIds` has no name resolver — this page is already scoped to one
 * project, so a project-picker axis has no natural label source here and the
 * chip names a COUNT rather than inventing one; `stateCategories` needs no
 * resolver at all, since its three values (`open`/`active`/`terminal`) are
 * already words, only needing a capital letter.
 */
export function buildBoardFilterChips(
  boardFilter: BoardFilterSpec,
  resolvers: BoardFilterChipResolvers,
  setFilter: (updater: (current: FilterSpec) => FilterSpec) => void,
): BoardFilterChip[] {
  const chips: BoardFilterChip[] = [];
  const clear = (patch: Partial<FilterSpec>) => () =>
    setFilter((current) => ({ ...current, ...patch }));

  const text = boardFilter.text?.trim();
  if (text !== undefined && text !== '') {
    chips.push({ key: 'text', label: `Search: "${text}"`, onRemove: clear({ text: undefined }) });
  }
  if (boardFilter.assigneeIds !== undefined && boardFilter.assigneeIds.length > 0) {
    chips.push({
      key: 'assigneeIds',
      label: `Assignee: ${boardFilter.assigneeIds.map(resolvers.assigneeName).join(', ')}`,
      onRemove: clear({ assigneeIds: undefined }),
    });
  }
  if (boardFilter.typeIds !== undefined && boardFilter.typeIds.length > 0) {
    chips.push({
      key: 'typeIds',
      label: `Type: ${boardFilter.typeIds.map(resolvers.typeName).join(', ')}`,
      onRemove: clear({ typeIds: undefined }),
    });
  }
  if (boardFilter.stateIds !== undefined && boardFilter.stateIds.length > 0) {
    chips.push({
      key: 'stateIds',
      label: `State: ${boardFilter.stateIds.map(resolvers.stateName).join(', ')}`,
      onRemove: clear({ stateIds: undefined }),
    });
  }
  if (boardFilter.stateCategories !== undefined && boardFilter.stateCategories.length > 0) {
    chips.push({
      key: 'stateCategories',
      label: `Category: ${boardFilter.stateCategories.map(capitalizeWord).join(', ')}`,
      onRemove: clear({ stateCategories: undefined }),
    });
  }
  if (boardFilter.projectIds !== undefined && boardFilter.projectIds.length > 0) {
    chips.push({
      key: 'projectIds',
      label: `Project: ${boardFilter.projectIds.length} selected`,
      onRemove: clear({ projectIds: undefined }),
    });
  }
  return chips;
}

/**
 * THE DISCLOSURE GATE ITSELF (Task 4 review, Important finding, remedy 2).
 *
 * `chipCount > 0 || unappliedAxisCount > 0` alone enumerates only the
 * mechanisms this file knows the NAME of — a filter axis, or an axis outside
 * `BoardFilterSpec`. `shown !== total` is an INDEPENDENT third term that asks
 * a different question entirely: did the board actually hide something, for
 * ANY reason? This is what the first two terms cannot be extended to cover
 * even in principle: Task 8's workflow picker narrows by dropping whole
 * GROUPS, not by setting a filter axis, so no enumeration of axes — however
 * complete — could ever notice it. `shown`/`total` are Ruling 1's own
 * one-pass count, so this term is true exactly when `<Board>` is rendering
 * fewer cards than the project actually has, regardless of which mechanism
 * caused it.
 */
export function shouldRenderBoardNarrowingStrip(params: {
  chipCount: number;
  unappliedAxisCount: number;
  shown: number;
  total: number;
}): boolean {
  return params.chipCount > 0 || params.unappliedAxisCount > 0 || params.shown !== params.total;
}
