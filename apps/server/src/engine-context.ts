import type { PoolClient } from 'pg';
import type { EntityState } from '@gisik-nokma/domain';
import type { EngineContext } from '@gisik-nokma/rule-engine';
import { readEntityHead } from './projections/entity-heads.js';

/**
 * EngineContext over the ingest transaction's client. The event under
 * evaluation is not yet applied, so every read answers with the world as of
 * the previously committed events — which is exactly what rules must judge
 * against.
 *
 * getChildrenStates and getWorkflowDef answer for a world in which no
 * hierarchy or workflow events can exist (their types are not in the Plan-1
 * vocabulary): the empty answers are true answers, not stubs. The plans that
 * introduce ticket hierarchy and workflow.defined replace these bodies with
 * real queries.
 */
export function createEngineContext(client: PoolClient): EngineContext {
  return {
    async getEntityState(kind, id) {
      // Plan-1 seam: the only entity state this world holds is the head pointer.
      // Plan 2 Task 2 lands the authoritative EntityState and the real context
      // bodies — this cast dies there.
      return (await readEntityHead(client, kind, id)) as unknown as EntityState | null;
    },
    async getChildrenStates(ticketId) {
      void ticketId;
      return [];
    },
    async getWorkflowDef(workflowId, version) {
      void workflowId;
      void version;
      return null;
    },
  };
}
