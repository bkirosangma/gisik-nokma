import type { TicketState } from '@gisik-nokma/domain';

/**
 * The base rules every filter predicate reads — `matchesFilter`
 * (`TicketState`), `matchesBoardCard` (`BoardCard`) and `matchesListRow`
 * (`ListRow`) — declared once (exclude-mode spec §2, 2026-09-17). Before this
 * module each predicate spelled "an absent or empty list does not narrow" by
 * hand, and the agreement tests were the only thing keeping three copies of
 * one rule in step. The exclude half doubles the number of places that rule
 * is needed; this is where it lives now. The agreement tests stay — they are
 * the proof, this is the mechanism.
 */

/** An absent or empty list does not narrow; otherwise the value must be listed. A null value never matches a set list. */
export function narrowsTo<T>(list: readonly T[] | undefined, value: T | null): boolean {
  if (list === undefined || list.length === 0) return true;
  return value !== null && list.includes(value);
}

/** An absent or empty list excludes nothing; otherwise a listed value is out. A null value is never out. */
export function excludedBy<T>(list: readonly T[] | undefined, value: T | null): boolean {
  if (list === undefined || list.length === 0) return false;
  return value !== null && list.includes(value);
}

/** `narrowsTo` for an axis whose ticket-side value is itself a list (collaborators): any listed value is enough. */
export function narrowsToAny<T>(list: readonly T[] | undefined, values: readonly T[]): boolean {
  if (list === undefined || list.length === 0) return true;
  return values.some((value) => list.includes(value));
}

/** `excludedBy` for a list-valued axis: any listed value puts the ticket out. */
export function excludedByAny<T>(list: readonly T[] | undefined, values: readonly T[]): boolean {
  if (list === undefined || list.length === 0) return false;
  return values.some((value) => list.includes(value));
}

/** The claimed due DAY, or null when nothing was claimed (or what was claimed is not a day). Moved here from `matches-filter.ts` unchanged. */
export function claimedDueDay(state: TicketState): string | null {
  const value = state.fields['dueDate']?.value;
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const { date } = value as { date?: unknown };
  return typeof date === 'string' ? date : null;
}

/** What Postgres's `->>` would render for this claim value, or null where it yields SQL NULL. Moved here from `matches-filter.ts` unchanged. */
export function claimText(value: unknown): string | null {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'boolean') return String(value);
  return null;
}
