import { suggestionRejectedPayload } from '@gisik-nokma/domain';
import type { Projection } from './registry.js';

/**
 * Knowledge Graph spec D §4.3 (KG-D Task 5): who rejected which suggested group, by signature and item HASHES (the
 * event is on the workspace stream; `events/suggestion-events.ts` says why it holds no ids). The suggestion job reads
 * it to skip a group unless it changed by more than half. Every row key is written by ONE stream, the workspace's,
 * so a replay in stream order rebuilds it as live wrote it.
 */
export const projConceptRejections: Projection = {
  name: 'proj_concept_rejections',
  tables: ['proj_concept_rejections'],
  async apply(event, tx) {
    if (event.type !== 'workspace.concept_suggestion_rejected') return;
    const p = suggestionRejectedPayload.parse(event.payload);
    await tx.query(
      `INSERT INTO proj_concept_rejections (workspace_id, signature, item_hashes, rejected_by, rejected_at, origin)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (workspace_id, signature) DO UPDATE SET item_hashes = EXCLUDED.item_hashes, rejected_by = EXCLUDED.rejected_by,
         rejected_at = EXCLUDED.rejected_at, origin = EXCLUDED.origin`,
      [event.workspaceId, p.signature, p.itemHashes, event.actorId, event.serverTime, event.origin],
    );
  },
  async reset(tx) {
    await tx.query('DELETE FROM proj_concept_rejections');
  },
};
