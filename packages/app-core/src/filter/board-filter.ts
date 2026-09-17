import type { BoardCard, BoardColumn, FilterSpec, IdAxes } from '../view-types.js';
import { excludedBy, narrowsTo } from './id-axes.js';

/**
 * The axes a BOARD can answer, derived from `IdAxes`/`FilterSpec` with `Pick` — for BOTH halves
 * since 2026-09-17 (exclude-mode spec §1) — so it cannot drift into a second vocabulary, the fork
 * `matches-filter.ts`'s docblock forbids.
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
export type BoardIdAxes = Pick<
  IdAxes,
  'assigneeIds' | 'typeIds' | 'stateIds' | 'stateCategories' | 'projectIds'
>;

/**
 * The axes a BOARD can answer, in BOTH halves. `exclude` is `BoardIdAxes` too:
 * an `exclude.collaboratorIds` handed to a card with no collaborators would
 * be `excludedBy(list, [])` — never out — and so would silently WIDEN the
 * board past what the person asked for, the mirror image of the fail-CLOSED
 * hazard the include half's docblock describes. Unrepresentable, so it is a
 * compile error instead; `page.tsx` drops it when it builds `boardFilter`
 * and `describeUnappliedBoardAxes` discloses it.
 */
export type BoardFilterSpec = Pick<FilterSpec, 'text'> & BoardIdAxes & { exclude?: BoardIdAxes };

export function matchesBoardCard(
  card: BoardCard,
  column: BoardColumn,
  projectId: string,
  spec: BoardFilterSpec,
): boolean {
  const assigneeId = card.assignee?.id ?? null;
  if (!narrowsTo(spec.assigneeIds, assigneeId)) return false;
  if (!narrowsTo(spec.typeIds, card.typeId)) return false;
  if (!narrowsTo(spec.stateIds, column.stateId)) return false;
  if (!narrowsTo(spec.stateCategories, column.category)) return false;
  if (!narrowsTo(spec.projectIds, projectId)) return false;
  if (spec.text !== undefined && spec.text.trim() !== '') {
    if (!card.title.toLowerCase().includes(spec.text.trim().toLowerCase())) return false;
  }
  const exclude = spec.exclude ?? {};
  if (excludedBy(exclude.assigneeIds, assigneeId)) return false;
  if (excludedBy(exclude.typeIds, card.typeId)) return false;
  if (excludedBy(exclude.stateIds, column.stateId)) return false;
  if (excludedBy(exclude.stateCategories, column.category)) return false;
  if (excludedBy(exclude.projectIds, projectId)) return false;
  return true;
}
