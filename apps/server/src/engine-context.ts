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
      // Plan-1 seam. READ THIS BEFORE RELYING ON THE RETURN VALUE: what comes
      // back is an EntityHead — a head POINTER ({kind, id, headSeq,
      // headEventId, headEventType}) — and NOT per-kind entity state. It has no
      // `role`, no `stateId`, no domain fields of any kind. `as unknown as`
      // defeats every structural check, so the compiler will not tell you.
      //
      // The cast dies at PLAN 3 TASK 12, which replaces this body with one that
      // returns real state for 'ticket'/'ticket-type' and null for everything
      // else. Not Plan 2 Task 2: that task replaces the domain TYPES and never
      // touches this file's getEntityState (Plan 2 states it verbatim —
      // "getEntityState and getChildrenStates stay Plan 1's stubs until Plan 3").
      //
      // The window that matters is Plan 3 Task 2 → Task 12: once ticket
      // vocabulary is registered, the door admits transitions and a role gate
      // reading `membership.role` off this value finds `undefined`, so every
      // role-gated transition is silently refused with a reason that looks
      // entirely legitimate. Either land Task 12 first, or make this body
      // return null for the kinds it cannot honestly serve.
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
