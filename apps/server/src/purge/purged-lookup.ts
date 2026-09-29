import { collectDocReferences, PURGEABLE_KINDS, type DocTextOptions, type PurgedRef } from '@gisik-nokma/domain';
import type { Queryable } from '../db/queryable.js';

/**
 * Lookups against `purged_entities` (D2). Used by the projections that fold a
 * surviving reference (search, note search, notes, invites), by the embed
 * worker, and by the purge's own survivor re-derivation — the same answer live
 * and on rebuild, because the registry is never reset.
 */

export async function purgedIdsAmong(db: Queryable, kind: string, ids: readonly string[]): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const { rows } = await db.query<{ entity_id: string }>(
    'SELECT entity_id FROM purged_entities WHERE entity_kind = $1 AND entity_id = ANY($2::text[])',
    [kind, [...ids]],
  );
  return new Set(rows.map((row) => row.entity_id));
}

/** A synchronous `isPurged` predicate over every chip in `docs`, looked up once. */
export async function purgedResolverFor(
  db: Queryable,
  docs: readonly unknown[],
): Promise<NonNullable<DocTextOptions['isPurged']>> {
  const ticketIds = new Set<string>();
  const noteIds = new Set<string>();
  for (const doc of docs) {
    const refs = collectDocReferences(doc);
    for (const id of refs.ticketIds) ticketIds.add(id);
    for (const id of refs.noteIds) noteIds.add(id);
  }
  const tickets = await purgedIdsAmong(db, 'ticket', [...ticketIds]);
  const notes = await purgedIdsAmong(db, 'note', [...noteIds]);
  return (kind, id) => (kind === 'ticket' ? tickets : notes).has(id);
}

/**
 * The subset of `ids` that a purge erased, as `{ kind, id }` (trash Plan 3,
 * D1). Restricted to the four lifecycle kinds — a workspace purge registers
 * every entity of the workspace, workflows and memberships included, and a
 * device acts only on these four. The asked ids are crossed with the kinds so
 * each probe is a primary-key lookup on `(entity_kind, entity_id)`; duplicates
 * in the input are asked once.
 */
export async function purgedRefsAmong(db: Queryable, ids: readonly string[]): Promise<PurgedRef[]> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return [];
  const { rows } = await db.query<{ entity_kind: PurgedRef['kind']; entity_id: string }>(
    `SELECT p.entity_kind, p.entity_id
       FROM unnest($1::text[]) AS q(id)
       CROSS JOIN unnest($2::text[]) AS k(kind)
       JOIN purged_entities p ON p.entity_kind = k.kind AND p.entity_id = q.id
      ORDER BY p.entity_kind, p.entity_id`,
    [unique, [...PURGEABLE_KINDS]],
  );
  return rows.map((row) => ({ kind: row.entity_kind, id: row.entity_id }));
}
