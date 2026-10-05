import {
  conceptCreatedPayload,
  conceptDeletedPayload,
  conceptDescribedPayload,
  conceptItemTaggedPayload,
  conceptItemUntaggedPayload,
  conceptLinkedPayload,
  conceptMergedPayload,
  conceptRenamedPayload,
  conceptUnlinkedPayload,
} from '@gisik-nokma/domain';
import type { Projection } from './registry.js';

/**
 * Knowledge Graph spec D §3.1, under the planner's R1 ruling (2026-10-05): every row key here is written AND removed
 * by ONE concept's stream, because a rebuild replays one concept's whole stream at a time (`readLedger`) and live
 * does not. A link row is (a, b) = (the concept whose stream wrote it, the other one): `broader` as written, and
 * `related` only ever from the lower id (the door refuses the other side), so the table's `a < b` CHECK holds. A merge
 * copies nothing: the client tags the merged concept's items on the target first (`concepts/merge.ts`).
 *
 * The one cross-stream removal left, a delete or merge dropping the links OTHER concepts wrote to it, converges
 * because the `linked` arm never writes a link to a deleted end. A tag naming a PURGED item is skipped (the
 * `purged_entities` read, as `notes.ts:233-235` reads it), so a rebuild after a purge equals the live table, which the
 * purge erased.
 */
export const projConcepts: Projection = {
  name: 'proj_concepts',
  tables: ['proj_concepts', 'proj_concept_items', 'proj_concept_links'],

  async apply(event, tx) {
    const concept = event.entity.id;
    switch (event.type) {
      case 'concept.created': {
        const p = conceptCreatedPayload.parse(event.payload);
        await tx.query(
          `INSERT INTO proj_concepts (concept_id, workspace_id, name, summary, created_by, created_at, origin, from_suggestion)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT (concept_id) DO NOTHING`,
          [concept, event.workspaceId, p.name, p.summary ?? '', event.actorId, event.serverTime, event.origin, p.fromSuggestion ?? null],
        );
        return;
      }
      case 'concept.renamed': {
        const p = conceptRenamedPayload.parse(event.payload);
        await tx.query('UPDATE proj_concepts SET name = $2 WHERE concept_id = $1', [concept, p.name]);
        return;
      }
      case 'concept.described': {
        const p = conceptDescribedPayload.parse(event.payload);
        await tx.query('UPDATE proj_concepts SET summary = $2 WHERE concept_id = $1', [concept, p.summary]);
        return;
      }
      case 'concept.item_tagged': {
        const p = conceptItemTaggedPayload.parse(event.payload);
        await tx.query(
          `INSERT INTO proj_concept_items (concept_id, workspace_id, item_kind, item_id, tagged_by, tagged_at, origin)
           SELECT $1, $2, $3, $4, $5, $6, $7
            WHERE NOT EXISTS (SELECT 1 FROM purged_entities WHERE entity_kind = $3 AND entity_id = $4)
           ON CONFLICT DO NOTHING`,
          [concept, event.workspaceId, p.itemKind, p.itemId, event.actorId, event.serverTime, event.origin],
        );
        return;
      }
      case 'concept.item_untagged': {
        const p = conceptItemUntaggedPayload.parse(event.payload);
        await tx.query('DELETE FROM proj_concept_items WHERE concept_id = $1 AND item_kind = $2 AND item_id = $3', [
          concept,
          p.itemKind,
          p.itemId,
        ]);
        return;
      }
      case 'concept.linked': {
        const p = conceptLinkedPayload.parse(event.payload);
        // A link to a deleted (or merged) concept is never written. Both are terminal, and the door refuses a link to
        // a deleted concept, so the other end was deleted AFTER this event — but replay can meet this event after the
        // other end's whole stream. Skipped here or deleted there, live and a rebuild both end with no row. This end
        // is the stream's own concept, which only its own stream deletes, later.
        await tx.query(
          `INSERT INTO proj_concept_links (workspace_id, a, b, relation, linked_by, linked_at, origin)
           SELECT $1, $2, $3, $4, $5, $6, $7
            WHERE NOT EXISTS (SELECT 1 FROM proj_concepts WHERE concept_id = $3 AND deleted = TRUE)
           ON CONFLICT DO NOTHING`,
          [event.workspaceId, concept, p.otherId, p.relation, event.actorId, event.serverTime, event.origin],
        );
        return;
      }
      case 'concept.unlinked': {
        const p = conceptUnlinkedPayload.parse(event.payload);
        await tx.query('DELETE FROM proj_concept_links WHERE a = $1 AND b = $2 AND relation = $3', [concept, p.otherId, p.relation]);
        return;
      }
      case 'concept.merged': {
        const p = conceptMergedPayload.parse(event.payload);
        // Its items reached the target as the target's own `concept.item_tagged` events, before this one (the door's
        // `concept.merge-incomplete`). An item that was not live then (in the trash) is not carried.
        await tx.query('DELETE FROM proj_concept_items WHERE concept_id = $1', [concept]);
        await tx.query('DELETE FROM proj_concept_links WHERE a = $1 OR b = $1', [concept]);
        await tx.query('UPDATE proj_concepts SET deleted = TRUE, merged_into = $2 WHERE concept_id = $1', [concept, p.intoId]);
        return;
      }
      case 'concept.deleted': {
        conceptDeletedPayload.parse(event.payload);
        await tx.query('DELETE FROM proj_concept_links WHERE a = $1 OR b = $1', [concept]);
        await tx.query('UPDATE proj_concepts SET deleted = TRUE WHERE concept_id = $1', [concept]);
        return;
      }
      default:
        return;
    }
  },

  async reset(tx) {
    await tx.query('DELETE FROM proj_concept_links');
    await tx.query('DELETE FROM proj_concept_items');
    await tx.query('DELETE FROM proj_concepts');
  },
};
