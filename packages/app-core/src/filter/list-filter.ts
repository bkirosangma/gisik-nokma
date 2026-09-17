import type { FilterSpec, ListRow } from '../view-types.js';
import type { BoardIdAxes } from './board-filter.js';
import { claimText, excludedBy, narrowsTo } from './id-axes.js';

/**
 * The axes a LIST ROW can answer (exclude-mode spec §2, 2026-09-17) — every
 * `FilterSpec` axis but collaborators, in both halves. `ListRow`
 * (`view-types.ts`) carries `assignee`, `typeId`, `stateId`, `stateCategory`,
 * `title`, a claimed `dueDate` and its `fields`, so unlike a `BoardCard` it
 * can answer the due bounds and the field clauses too; it carries no
 * collaborators, so that one axis is a compile error here, for the same
 * reason `board-filter.ts` gives: an unanswerable axis must not become a
 * wrong answer on screen. `page.tsx` drops it when it builds `listFilterSpec`
 * and `describeUnappliedListAxes` discloses it.
 *
 * `BoardIdAxes` is reused rather than re-declared: a list row answers
 * exactly the five id axes a board card does, and a second `Pick` naming the
 * same five would be one more list to keep in step.
 */
export type ListFilterSpec = Pick<FilterSpec, 'text' | 'dueBefore' | 'dueAfter' | 'fields' | 'closed'> &
  BoardIdAxes & { exclude?: BoardIdAxes };

/**
 * Semantics are `matchesFilter`'s, axis for axis — the same base rules from
 * `id-axes.ts`, the same titles-only text divergence, the same inclusive due
 * bounds with an undated row excluded (SQL NULL parity), the same `eq`-only
 * field clauses through `claimText`. `list-filter.test.ts` asserts the
 * agreement over one ticket rendered both ways rather than trusting this
 * note.
 */
export function matchesListRow(row: ListRow, projectId: string, spec: ListFilterSpec): boolean {
  const assigneeId = row.assignee?.id ?? null;
  if (!narrowsTo(spec.assigneeIds, assigneeId)) return false;
  if (!narrowsTo(spec.typeIds, row.typeId)) return false;
  if (!narrowsTo(spec.stateIds, row.stateId)) return false;
  if (!narrowsTo(spec.stateCategories, row.stateCategory)) return false;
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
  if (excludedBy(exclude.projectIds, projectId)) return false;
  return true;
}
