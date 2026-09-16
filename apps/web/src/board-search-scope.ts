import type { FilterSpec } from '@gisik-nokma/app-core';

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
