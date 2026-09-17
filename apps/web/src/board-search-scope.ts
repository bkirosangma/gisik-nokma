import type { BoardFilterSpec, FilterSpec, IdAxes } from '@gisik-nokma/app-core';
import { withIdAxis } from './filter-edits.js';

/** Either half naming collaborators — the one axis neither a BoardCard nor a ListRow can answer. */
function collaboratorsSet(filter: FilterSpec): boolean {
  const include = filter.collaboratorIds ?? [];
  const exclude = filter.exclude?.collaboratorIds ?? [];
  return include.length > 0 || exclude.length > 0;
}

/**
 * The axes a LIST ROW cannot evaluate (exclude-mode spec §2): only
 * collaborators, in either half — `matchesListRow` answers due bounds and
 * field clauses itself, so unlike `describeUnappliedBoardAxes` there is
 * nothing else to disclose. Same fixed order discipline: one possible entry.
 */
export function describeUnappliedListAxes(filter: FilterSpec): string[] {
  return collaboratorsSet(filter) ? ['collaborator'] : [];
}

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
  if (collaboratorsSet(filter)) axes.push('collaborator');
  if (filter.dueBefore !== undefined || filter.dueAfter !== undefined) {
    axes.push('due date');
  }
  if (filter.fields !== undefined && Object.keys(filter.fields).length > 0) {
    axes.push('custom field');
  }
  return axes;
}

export type BoardFilterChip = {
  key: string;
  label: string;
  /** Which half the chip names — the strip prefixes exclude chips with the ⊘ glyph (spec §4). */
  mode: 'include' | 'exclude';
  onRemove: () => void;
};

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
 * One removable chip per axis ACTUALLY SET on `spec`, in EITHER half — the
 * same six-field object handed to `matchesBoardCard`/`matchesListRow`
 * (`text`, `assigneeIds`, `typeIds`, `stateIds`, `stateCategories`,
 * `projectIds`) plus its `exclude` counterpart, now named `buildFilterChips`
 * since Task 6 makes it emit the exclude half's "Not …" chips too
 * (exclude-mode spec §2/§4), directly after each axis's include chip.
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
export function buildFilterChips(
  spec: BoardFilterSpec & { closed?: boolean },
  resolvers: BoardFilterChipResolvers,
  setFilter: (updater: (current: FilterSpec) => FilterSpec) => void,
): BoardFilterChip[] {
  const chips: BoardFilterChip[] = [];
  const clear = (patch: Partial<FilterSpec>) => () =>
    setFilter((current) => ({ ...current, ...patch }));
  const clearExclude = (axis: keyof IdAxes) => () =>
    setFilter((current) => withIdAxis(current, 'exclude', axis, undefined));
  const exclude = spec.exclude ?? {};
  const has = (list: readonly unknown[] | undefined): list is readonly unknown[] & { length: number } =>
    list !== undefined && list.length > 0;

  const text = spec.text?.trim();
  if (text !== undefined && text !== '') {
    chips.push({ key: 'text', label: `Search: "${text}"`, mode: 'include', onRemove: clear({ text: undefined }) });
  }
  if (has(spec.assigneeIds)) {
    chips.push({ key: 'assigneeIds', label: `Assignee: ${spec.assigneeIds.map(resolvers.assigneeName).join(', ')}`, mode: 'include', onRemove: clear({ assigneeIds: undefined }) });
  }
  if (has(exclude.assigneeIds)) {
    chips.push({ key: 'exclude.assigneeIds', label: `Not assignee: ${exclude.assigneeIds.map(resolvers.assigneeName).join(', ')}`, mode: 'exclude', onRemove: clearExclude('assigneeIds') });
  }
  if (has(spec.typeIds)) {
    chips.push({ key: 'typeIds', label: `Type: ${spec.typeIds.map(resolvers.typeName).join(', ')}`, mode: 'include', onRemove: clear({ typeIds: undefined }) });
  }
  if (has(exclude.typeIds)) {
    chips.push({ key: 'exclude.typeIds', label: `Not type: ${exclude.typeIds.map(resolvers.typeName).join(', ')}`, mode: 'exclude', onRemove: clearExclude('typeIds') });
  }
  if (has(spec.stateIds)) {
    chips.push({ key: 'stateIds', label: `State: ${spec.stateIds.map(resolvers.stateName).join(', ')}`, mode: 'include', onRemove: clear({ stateIds: undefined }) });
  }
  if (has(exclude.stateIds)) {
    chips.push({ key: 'exclude.stateIds', label: `Not state: ${exclude.stateIds.map(resolvers.stateName).join(', ')}`, mode: 'exclude', onRemove: clearExclude('stateIds') });
  }
  if (has(spec.stateCategories)) {
    chips.push({ key: 'stateCategories', label: `Category: ${spec.stateCategories.map(capitalizeWord).join(', ')}`, mode: 'include', onRemove: clear({ stateCategories: undefined }) });
  }
  if (has(exclude.stateCategories)) {
    chips.push({ key: 'exclude.stateCategories', label: `Not category: ${exclude.stateCategories.map(capitalizeWord).join(', ')}`, mode: 'exclude', onRemove: clearExclude('stateCategories') });
  }
  /**
   * `closed` (Task 11, Ruling 44/45, spec §5.5) — ONE chip, never two: unlike
   * every axis above, `closed` is a single boolean with no include/exclude
   * halves (`FilterSpec.closed`'s own docblock), so `true`/`false` are
   * mutually exclusive states rather than two halves that could both be set.
   * `spec`'s own type widens `BoardFilterSpec` with an optional `closed`
   * rather than `closed` joining `BoardFilterSpec` itself — a `BoardCard`
   * cannot answer it at all (no field for it, unlike the four axes
   * `describeUnappliedBoardAxes` already discloses as merely board-blind), so
   * the Board tab's own call into this function (still bare `boardFilter`,
   * `page.tsx`) never sets it and this branch never fires for that tab.
   */
  if (spec.closed === true) {
    chips.push({ key: 'closed', label: 'Closed: only', mode: 'include', onRemove: clear({ closed: undefined }) });
  } else if (spec.closed === false) {
    chips.push({ key: 'closed', label: 'Closed: hidden', mode: 'exclude', onRemove: clear({ closed: undefined }) });
  }
  if (has(spec.projectIds)) {
    chips.push({ key: 'projectIds', label: `Project: ${spec.projectIds.length} selected`, mode: 'include', onRemove: clear({ projectIds: undefined }) });
  }
  if (has(exclude.projectIds)) {
    chips.push({ key: 'exclude.projectIds', label: `Not project: ${exclude.projectIds.length} selected`, mode: 'exclude', onRemove: clearExclude('projectIds') });
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
 *
 * Evaluated PER TAB since 2026-09-17 — the board with `boardNarrowing`'s
 * count, the other tabs with `listNarrowing`'s (exclude-mode spec §3).
 */
export function shouldRenderNarrowingStrip(params: {
  chipCount: number;
  unappliedAxisCount: number;
  shown: number;
  total: number;
}): boolean {
  return params.chipCount > 0 || params.unappliedAxisCount > 0 || params.shown !== params.total;
}
