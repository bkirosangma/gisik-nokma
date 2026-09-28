import { collectDocReferences, type DocTextOptions } from '@gisik-nokma/domain';
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
