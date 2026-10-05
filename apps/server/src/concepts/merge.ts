import type { Queryable } from '../db/queryable.js';
import type { ItemRef } from '../read/item-visibility.js';
import { LIVE_TICKET_WHERE } from '../read/visible-where.js';

/**
 * Knowledge Graph spec D §3.1 under the planner's R1 ruling (2026-10-05, option ii). Every concept row key is written
 * and removed by ONE stream, because a rebuild replays one concept's whole stream at a time (`readLedger`) and live
 * does not. So a merge C → D copies nothing from C's stream into D's rows. It is a SEQUENCE the client posts:
 * `concept.item_tagged` on D for each LIVE item C holds that D lacks (each a legal act on its own), then
 * `concept.merged` on C, which the door refuses while any such item remains (`concept.merge-incomplete`,
 * `permissions/check-concept.ts`). The ingest batch is not atomic (`ingest/ingest-service.ts:56-58`) and need not be:
 * every partial state is one a user could make by hand, and a retry completes it.
 *
 * LIVE is what `seesItem` means by it (the door refuses to tag anything else on D). An item in the trash is therefore
 * not carried: the merge deletes C's rows, so it has no concept after a restore. That loss is accepted (27.464).
 */
export async function itemsMissingFromTarget(
  db: Queryable,
  workspaceId: string,
  conceptId: string,
  intoId: string,
): Promise<ItemRef[]> {
  const { rows } = await db.query<{ item_kind: 'ticket' | 'note'; item_id: string }>(
    `SELECT ci.item_kind, ci.item_id FROM proj_concept_items ci
      WHERE ci.workspace_id = $1 AND ci.concept_id = $2
        AND NOT EXISTS (SELECT 1 FROM proj_concept_items di
                         WHERE di.concept_id = $3 AND di.item_kind = ci.item_kind AND di.item_id = ci.item_id)
        AND ((ci.item_kind = 'ticket' AND EXISTS (SELECT 1 FROM proj_tickets t
                                                   WHERE t.workspace_id = $1 AND t.ticket_id = ci.item_id AND ${LIVE_TICKET_WHERE}))
          OR (ci.item_kind = 'note' AND EXISTS (SELECT 1 FROM proj_notes n
                                                 WHERE n.workspace_id = $1 AND n.note_id = ci.item_id AND n.deleted = FALSE)))
      ORDER BY ci.item_kind, ci.item_id`,
    [workspaceId, conceptId, intoId],
  );
  return rows.map((row) => ({ kind: row.item_kind, id: row.item_id }));
}

export type ConceptMergeStep =
  | { entity: { kind: 'concept'; id: string }; type: 'concept.item_tagged'; payload: { itemKind: 'ticket' | 'note'; itemId: string } }
  | { entity: { kind: 'concept'; id: string }; type: 'concept.merged'; payload: { intoId: string } };

/** The merge C → D in posting order: D's tags, then the merge itself. The shape a client (Task 6's tool) posts. */
export async function conceptMergeSteps(
  db: Queryable,
  workspaceId: string,
  conceptId: string,
  intoId: string,
): Promise<ConceptMergeStep[]> {
  const missing = await itemsMissingFromTarget(db, workspaceId, conceptId, intoId);
  return [
    ...missing.map((item): ConceptMergeStep => ({
      entity: { kind: 'concept', id: intoId },
      type: 'concept.item_tagged',
      payload: { itemKind: item.kind as 'ticket' | 'note', itemId: item.id },
    })),
    { entity: { kind: 'concept', id: conceptId }, type: 'concept.merged', payload: { intoId } },
  ];
}
