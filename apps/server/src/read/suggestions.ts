import type { Queryable } from '../db/queryable.js';
import type { EffectiveRole } from '../permissions/effective-role.js';
import { hiddenItems, type ItemRef } from './item-visibility.js';

const key = (item: ItemRef): string => `${item.kind}:${item.id}`;

/** A `sem_suggestions` row (the suggestion job's cache, KG-D Task 5) with its items as refs, in the row's order. */
export type SuggestionRow = {
  id: string;
  signature: string;
  label: string;
  terms: string[];
  score: number;
  computed_at: Date;
  item_hashes: string[];
  items: ItemRef[];
};

/** Spec D §4.2/§4.3: suggestions are for owners, admins and members. A guest and a non-member read none. */
export function readsSuggestions(eff: EffectiveRole | null): eff is EffectiveRole {
  return eff !== null && eff.workspaceRole !== 'guest';
}

/**
 * The cached suggestions of one workspace (of `ids`, when given) that this reader may see, highest score first, then
 * by id: none for a reader `readsSuggestions` refuses, and a row only when `hiddenItems` answers none of its items for
 * THIS reader (D4 per reader, at read time, nothing cached), asked once over the union of every row's items. The one
 * decision behind `GET /v1/workspaces/:id/suggestions` (`routes/suggestions.ts`) and the graph's suggested concepts
 * (`read/graph-neighbours.ts`).
 */
export async function visibleSuggestions(
  db: Queryable,
  eff: EffectiveRole | null,
  userId: string,
  workspaceId: string,
  ids?: readonly string[],
): Promise<SuggestionRow[]> {
  if (!readsSuggestions(eff)) return [];
  const { rows } = await db.query<Omit<SuggestionRow, 'items'> & { item_kind: ItemRef['kind'][]; item_id: string[] }>(
    `SELECT id, signature, label, terms, score, computed_at, item_kind, item_id, item_hashes
       FROM sem_suggestions WHERE workspace_id = $1 AND ($2::text[] IS NULL OR id = ANY ($2::text[])) ORDER BY score DESC, id`,
    [workspaceId, ids === undefined ? null : [...ids]],
  );
  const listed = rows.map(({ item_kind, item_id, ...row }) => ({
    ...row,
    items: item_id.map((id, index) => ({ kind: item_kind[index] as ItemRef['kind'], id })),
  }));
  const hidden = new Set((await hiddenItems(db, eff, userId, workspaceId, listed.flatMap((row) => row.items))).map(key));
  return listed.filter((row) => row.items.every((item) => !hidden.has(key(item))));
}

/**
 * Of `ids`, the suggestions of `workspaceId` nobody has resolved yet. A row stays in the cache until the job's next run
 * (nightly, or after 200 changes), so after a Confirm or a Reject the graph must not keep drawing it:
 * - **rejected:** a rejection of the same signature in the same workspace (`proj_concept_rejections`);
 * - **confirmed:** a LIVE concept in the same workspace made from it (`proj_concepts.from_suggestion`). A deleted one
 *   does not count, as it does not for the job (27.490): its group may be offered again.
 */
export async function openSuggestionIds(db: Queryable, workspaceId: string, ids: readonly string[]): Promise<string[]> {
  const { rows } = await db.query<{ id: string }>(
    `SELECT s.id FROM sem_suggestions s
      WHERE s.workspace_id = $1 AND s.id = ANY ($2::text[])
        AND NOT EXISTS (SELECT 1 FROM proj_concept_rejections r WHERE r.workspace_id = s.workspace_id AND r.signature = s.signature)
        AND NOT EXISTS (SELECT 1 FROM proj_concepts c WHERE c.workspace_id = s.workspace_id AND c.from_suggestion = s.id AND c.deleted = FALSE)`,
    [workspaceId, [...ids]],
  );
  return rows.map((row) => row.id);
}
