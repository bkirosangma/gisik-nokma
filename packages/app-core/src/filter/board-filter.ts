import type { BoardCard, BoardColumn, FilterSpec } from '../view-types.js';

/**
 * The axes a BOARD can answer, derived from `FilterSpec` with `Pick` so it
 * cannot drift into a second vocabulary — the fork `matches-filter.ts`'s
 * docblock forbids.
 *
 * The four that are absent are absent on purpose. A `BoardCard`
 * (`view-types.ts:106-116`) carries no collaborators, no claimed dates and no
 * custom fields, and `matchesFilter` fails CLOSED on each: `collaboratorIds`
 * runs `some()` over `[]`, `dueBefore`/`dueAfter` get `null` from
 * `claimedDueDay`, and a `fields` clause compares `null` to the wanted value.
 * A synthesized state would therefore not narrow the board — it would EMPTY
 * it, while the list showed matches. Making them unrepresentable turns that
 * into a compile error instead of a wrong answer on screen.
 */
export type BoardFilterSpec = Pick<
  FilterSpec,
  'text' | 'assigneeIds' | 'typeIds' | 'stateIds' | 'stateCategories' | 'projectIds'
>;

/**
 * Semantics are `matchesFilter`'s, axis for axis — an empty or absent list
 * does not narrow, and `text` matches TITLES only (the same divergence
 * `matches-filter.ts:48-54` states: full text is the server's projection).
 * `board-filter.test.ts` asserts the agreement rather than trusting this note.
 */
export function matchesBoardCard(
  card: BoardCard,
  column: BoardColumn,
  projectId: string,
  spec: BoardFilterSpec,
): boolean {
  if (spec.assigneeIds !== undefined && spec.assigneeIds.length > 0) {
    if (card.assignee === null || !spec.assigneeIds.includes(card.assignee.id)) return false;
  }
  if (spec.typeIds !== undefined && spec.typeIds.length > 0 && !spec.typeIds.includes(card.typeId)) {
    return false;
  }
  if (spec.stateIds !== undefined && spec.stateIds.length > 0 && !spec.stateIds.includes(column.stateId)) {
    return false;
  }
  if (
    spec.stateCategories !== undefined &&
    spec.stateCategories.length > 0 &&
    !spec.stateCategories.includes(column.category)
  ) {
    return false;
  }
  if (spec.projectIds !== undefined && spec.projectIds.length > 0 && !spec.projectIds.includes(projectId)) {
    return false;
  }
  if (spec.text !== undefined && spec.text.trim() !== '') {
    if (!card.title.toLowerCase().includes(spec.text.trim().toLowerCase())) return false;
  }
  return true;
}
