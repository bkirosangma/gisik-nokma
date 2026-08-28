import type { Pool, PoolClient } from 'pg';
import { workflowDefinedPayloadSchema, type PublishedWorkflowDef } from '@gisik-nokma/domain';
import type { Projection } from './registry.js';

/**
 * Projects workflow.defined events into proj_workflows — every published
 * version, queryable individually, because the engine's version walk needs the
 * intermediates and their stateMappings, not just the newest definition.
 * Idempotent on (workflow_id, version) so ledger replays and the
 * rebuild-and-diff verifier are deterministic.
 *
 * Each row records published_workspace_seq: the stream position of the event
 * that published it. It comes off the LedgerEvent apply receives, so it is the
 * stored position of that event and not a fact about when this projection ran
 * — replay reproduces it exactly, which is what keeps apply deterministic.
 */
export const workflowsProjection: Projection = {
  name: 'proj_workflows',
  tables: ['proj_workflows'],

  async apply(event, tx) {
    if (event.type !== 'workflow.defined') {
      return;
    }
    const payload = workflowDefinedPayloadSchema.parse(event.payload);
    await tx.query(
      `INSERT INTO proj_workflows
         (workspace_id, workflow_id, version, name, definition, defined_by, defined_at, published_workspace_seq)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (workflow_id, version) DO NOTHING`,
      [
        event.workspaceId,
        payload.id,
        payload.version,
        payload.name,
        JSON.stringify(payload),
        event.actorId,
        event.serverTime,
        event.workspaceSeq,
      ],
    );
  },

  async reset(tx) {
    await tx.query('TRUNCATE proj_workflows');
  },
};

/**
 * How to name the version you want.
 *
 *   omitted                  the newest published version
 *   3                        exactly version 3
 *   { asOfWorkspaceSeq: 3 }  whatever was in force at stream position 3
 *
 * The last is not a nicety. A projection replaying the ledger must resolve the
 * definition as of the event it is applying, never as of now: the verifier
 * rebuilds projection-outer, so proj_workflows is already at the newest
 * version before a ticket projection replays its first event. Asking "latest"
 * there gives a re-derivation that disagrees with the live row after any
 * republish, and throws outright once a version has dropped a state.
 *
 * A union rather than a fourth parameter, because "version 3" and "as of
 * position 3" are different questions and a call site must not be able to
 * blur them.
 */
export type WorkflowDefSelector = number | { asOfWorkspaceSeq: number };

export async function getWorkflowDefFromProjection(
  db: PoolClient | Pool,
  workflowId: string,
  select?: WorkflowDefSelector,
): Promise<PublishedWorkflowDef | null> {
  const result =
    select === undefined
      ? await db.query<{ definition: unknown }>(
          'SELECT definition FROM proj_workflows WHERE workflow_id = $1 ORDER BY version DESC LIMIT 1',
          [workflowId],
        )
      : typeof select === 'number'
        ? await db.query<{ definition: unknown }>(
            'SELECT definition FROM proj_workflows WHERE workflow_id = $1 AND version = $2',
            [workflowId, select],
          )
        : // Ordered by version, not by published_workspace_seq. The two agree —
          // publishing refuses a version that is not exactly one past the
          // latest, so one workflow's versions are appended in ascending order
          // and their publish positions ascend with them — and ordering by the
          // version stays correct if that ever stops being true, because "the
          // greatest version at or before this point" is the question actually
          // being asked.
          await db.query<{ definition: unknown }>(
            `SELECT definition FROM proj_workflows
             WHERE workflow_id = $1 AND published_workspace_seq <= $2
             ORDER BY version DESC LIMIT 1`,
            [workflowId, select.asOfWorkspaceSeq],
          );
  const row = result.rows[0];
  if (row === undefined) {
    return null;
  }
  return workflowDefinedPayloadSchema.parse(row.definition);
}
