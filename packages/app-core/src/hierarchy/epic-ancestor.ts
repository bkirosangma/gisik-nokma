import { BUILTIN_TICKET_TYPE_SEEDS, type TicketState } from '@gisik-nokma/domain';

/**
 * What the SERVER calls an epic, and it is a RANK, not an id.
 * `apps/server/src/routes/list.ts` groups by `type_id IN (SELECT type_id FROM
 * proj_ticket_types WHERE rank = EPIC_RANK)` — rank 1. A workspace that
 * defines its own rank-1 type ("Initiative") has epics the server groups by
 * and an id-matching client would call "No epic": the product disagreeing with
 * itself in public, which is why the predicate below is INJECTABLE.
 */
export const EPIC_RANK = 1;

/**
 * The built-in that occupies that rank, DERIVED from the domain's seed table
 * rather than spelled again here — one origin, and the derivation is pinned by
 * a test so a reordered seed table cannot silently move it.
 */
export const BUILTIN_EPIC_TYPE_ID: string | null =
  BUILTIN_TICKET_TYPE_SEEDS.find((seed) => seed.rank === EPIC_RANK)?.id ?? null;

/**
 * The DEFAULT epic test: the built-in type id only.
 *
 * It is narrower than the server's rule and deliberately so — `TicketState`
 * carries a `typeId`, not a rank, and app-core may not fetch the type roster
 * to resolve one. A shell that HAS resolved the roster (it already does, to
 * fill `customDateFields`) should pass its own rank-1 predicate instead, and
 * then client and server agree exactly. Narrower than the truth is a lane that
 * shows less; wrong about the truth would be a lane that shows the wrong work.
 */
export function isBuiltinEpicType(typeId: string): boolean {
  return BUILTIN_EPIC_TYPE_ID !== null && typeId === BUILTIN_EPIC_TYPE_ID;
}

export type IsEpicType = (typeId: string) => boolean;

/**
 * The nearest ancestor (or self) whose type counts as an epic, from the loaded
 * ticket set. Grouping is arrangement, not data: a missing ancestor is null
 * (the "No epic" lane), never a guess — and an ancestor the caller did not
 * load is likewise null rather than a half-walk reported as a whole one.
 * Cycle-safe because reparent refusals can lag in a replica.
 */
export function epicAncestorOf(
  byId: Map<string, TicketState>,
  ticketId: string,
  isEpicType: IsEpicType = isBuiltinEpicType,
): string | null {
  let current = byId.get(ticketId);
  const seen = new Set<string>();
  while (current !== undefined) {
    if (isEpicType(current.typeId)) return current.id;
    if (current.parentId === null || seen.has(current.id)) return null;
    seen.add(current.id);
    current = byId.get(current.parentId);
  }
  return null;
}
