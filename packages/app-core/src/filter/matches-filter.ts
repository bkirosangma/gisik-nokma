import type { TicketState } from '@gisik-nokma/domain';
import type { FilterSpec } from '../view-types.js';

/**
 * Does this ticket satisfy the filter, evaluated on the client?
 *
 * ## Why this file is not `filter/filter-spec.ts`
 *
 * The plan proposed creating `FilterSpec` here, guarded on "Plan 6's wins if
 * landed". It landed — at `view-types.ts`, richer (it carries `dueBefore`,
 * `dueAfter` and `fields` on top of the seven axes the plan listed) and
 * already consumed by `data-source.ts`, `online/online-data-source.ts` and
 * `online/mappers.ts`, where it round-trips against the domain's
 * `filterSpecSchema`. A second declaration would fork the filter vocabulary,
 * so this module holds the PREDICATE only and imports the landed type.
 *
 * ## Every axis, because a hole here is silent
 *
 * A predicate that ignored the three axes the plan's version had never heard
 * of would widen a filtered view back to unfiltered and look exactly like a
 * filter that matched everything. So each of the ten is evaluated, and where
 * client and server cannot mean the same thing the divergence is NAMED below
 * rather than left to be discovered.
 */
export function matchesFilter(state: TicketState, spec: FilterSpec): boolean {
  if (spec.assigneeIds !== undefined && spec.assigneeIds.length > 0) {
    if (state.assigneeId === null || !spec.assigneeIds.includes(state.assigneeId)) return false;
  }
  if (spec.collaboratorIds !== undefined && spec.collaboratorIds.length > 0) {
    if (!spec.collaboratorIds.some((id) => state.collaboratorIds.includes(id))) return false;
  }
  if (spec.typeIds !== undefined && spec.typeIds.length > 0 && !spec.typeIds.includes(state.typeId)) {
    return false;
  }
  if (spec.stateIds !== undefined && spec.stateIds.length > 0 && !spec.stateIds.includes(state.stateId)) {
    return false;
  }
  if (
    spec.stateCategories !== undefined &&
    spec.stateCategories.length > 0 &&
    !spec.stateCategories.includes(state.stateCategory)
  ) {
    return false;
  }
  if (spec.projectIds !== undefined && spec.projectIds.length > 0 && !spec.projectIds.includes(state.projectId)) {
    return false;
  }
  /**
   * DIVERGENCE, stated by the plan itself: text here matches TITLES only.
   * Full-text over descriptions and comments is the server's search
   * projection (`proj_search`, `websearch_to_tsquery`), which a pure
   * view-model has no access to and must not approximate. Narrower than the
   * server's answer, never wider.
   */
  if (spec.text !== undefined && spec.text.trim() !== '') {
    const needle = spec.text.trim().toLowerCase();
    const value = state.fields['title']?.value;
    const title = typeof value === 'string' ? value.toLowerCase() : '';
    if (!title.includes(needle)) return false;
  }
  /**
   * Due bounds at exact server parity: `apps/server/src/read/compile-filter.ts`
   * compares `(t.fields -> 'dueDate' -> 'value' ->> 'date') <= before` and
   * `>= after` — plain string comparison of zero-padded days, INCLUSIVE at both
   * ends. A ticket with no claimed due date compares against SQL NULL there and
   * is excluded; `claimedDueDay` returning null reproduces that rather than
   * letting undated work slip through a dated filter.
   */
  const dueDay = claimedDueDay(state);
  if (spec.dueBefore !== undefined && (dueDay === null || dueDay > spec.dueBefore)) return false;
  if (spec.dueAfter !== undefined && (dueDay === null || dueDay < spec.dueAfter)) return false;
  /**
   * Field clauses, `eq` only, matching `compile-filter.ts`'s
   * `t.fields -> fieldId ->> 'value' = value`. `->>` renders a JSON string as
   * itself and a JSON number as its stored text, so a string or number claim
   * compares faithfully; a claim whose value is an OBJECT or ARRAY does not
   * match, because reproducing Postgres's serialisation of a jsonb object in
   * JS would be guesswork and a guess that matched would be worse than one
   * that did not. The one residue, named rather than hidden: a number stored
   * with trailing zeros (`2.50`) keeps that text in jsonb and renders as `2.5`
   * here, so such a clause matches on the server and not on the client.
   */
  for (const [fieldId, wanted] of Object.entries(spec.fields ?? {})) {
    if (claimText(state.fields[fieldId]?.value) !== wanted) return false;
  }
  return true;
}

/** The claimed due DAY, or null when nothing was claimed (or what was claimed is not a day). */
function claimedDueDay(state: TicketState): string | null {
  const value = state.fields['dueDate']?.value;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const { date } = value as { date?: unknown };
  return typeof date === 'string' ? date : null;
}

/** What Postgres's `->>` would render for this claim value, or null where it yields SQL NULL. */
function claimText(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'boolean') return String(value);
  return null;
}
