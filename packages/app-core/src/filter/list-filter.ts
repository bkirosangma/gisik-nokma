import type { FilterSpec, ListRow } from '../view-types.js';
import type { BoardIdAxes } from './board-filter.js';
import { claimText, excludedBy, narrowsTo } from './id-axes.js';

/**
 * The axes a LIST ROW can answer (exclude-mode spec §2, 2026-09-17) — every
 * `FilterSpec` axis but collaborators, in both halves for the id axes.
 * `ListRow` (`view-types.ts`) carries `assignee`, `typeId`, `stateId`,
 * `stateCategory`, `title`, a claimed `dueDate`, its `fields`, and — since
 * backlog/closed spec §4, 2026-09-17 — a required `closed`, so unlike a
 * `BoardCard` it can answer the due bounds, the field clauses, AND `closed`
 * too (`closed` has no exclude half, same as on `FilterSpec` itself: a single
 * boolean, not an id axis). It carries no collaborators, so that one axis is
 * a compile error here, for the same reason `board-filter.ts` gives: an
 * unanswerable axis must not become a wrong answer on screen. `page.tsx`
 * drops it when it builds `listFilterSpec` and `describeUnappliedListAxes`
 * discloses it.
 *
 * `BoardIdAxes` is reused rather than re-declared: a list row answers
 * exactly the SIX id axes a board card does (the sixth is `priorities`, spec
 * 2026-09-22 — both views read the claim, so neither has to hold the axis back),
 * and a second `Pick` naming the same six would be one more list to keep in
 * step.
 */
export type ListFilterSpec = Pick<FilterSpec, 'text' | 'dueBefore' | 'dueAfter' | 'fields' | 'closed'> &
  BoardIdAxes & { exclude?: BoardIdAxes };

/**
 * Semantics are `matchesFilter`'s, axis for axis — the same base rules from
 * `id-axes.ts`, the same titles-only text divergence, the same inclusive due
 * bounds with an undated row excluded (SQL NULL parity), the same `eq`-only
 * field clauses through `claimText`, and the same single-boolean `closed`
 * axis. `list-filter.test.ts` asserts the agreement over one ticket rendered
 * both ways rather than trusting this note.
 */
export function matchesListRow(row: ListRow, projectId: string, spec: ListFilterSpec): boolean {
  const assigneeId = row.assignee?.id ?? null;
  if (!narrowsTo(spec.assigneeIds, assigneeId)) return false;
  if (!narrowsTo(spec.typeIds, row.typeId)) return false;
  if (!narrowsTo(spec.stateIds, row.stateId)) return false;
  if (!narrowsTo(spec.stateCategories, row.stateCategory)) return false;
  // The level the row HOLDS (spec 2026-09-22). Never absent: `ListRow.priority`
  // is required and its mapper throws rather than defaulting, so there is no
  // "unknown level" case for this axis to be lenient about.
  if (!narrowsTo(spec.priorities, row.priority.value)) return false;
  if (!narrowsTo(spec.projectIds, projectId)) return false;
  if (spec.text !== undefined && spec.text.trim() !== '') {
    if (!row.title.toLowerCase().includes(spec.text.trim().toLowerCase())) return false;
  }
  const dueDay = row.dueDate?.date ?? null;
  if (spec.dueBefore !== undefined && (dueDay === null || dueDay > spec.dueBefore)) return false;
  if (spec.dueAfter !== undefined && (dueDay === null || dueDay < spec.dueAfter)) return false;
  for (const [fieldId, wanted] of Object.entries(spec.fields ?? {})) {
    if (claimText(row.fields[fieldId]?.value) !== wanted) return false;
  }
  // `closed` — `matchesFilter`'s own rule, over `row.closed` directly: `ListRow`
  // makes it REQUIRED, so there is no legacy-fixture case to fold with `?? null`.
  if (spec.closed !== undefined && (row.closed !== null) !== spec.closed) return false;
  const exclude = spec.exclude ?? {};
  if (excludedBy(exclude.assigneeIds, assigneeId)) return false;
  if (excludedBy(exclude.typeIds, row.typeId)) return false;
  if (excludedBy(exclude.stateIds, row.stateId)) return false;
  if (excludedBy(exclude.stateCategories, row.stateCategory)) return false;
  if (excludedBy(exclude.priorities, row.priority.value)) return false;
  if (excludedBy(exclude.projectIds, projectId)) return false;
  return true;
}
