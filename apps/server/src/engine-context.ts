import type { PoolClient } from 'pg';
import type { EntityKind, OtherEntityState } from '@gisik-nokma/domain';
import type { EngineContext } from '@gisik-nokma/rule-engine';
import { readEntityHead } from './projections/entity-heads.js';
import { getWorkflowDefFromProjection } from './projections/workflows.js';

/**
 * Kinds whose EntityState is exactly `{ kind, id }` today (`OtherEntityState`
 * in the domain's union). For these, a head row is enough to serve the state in
 * FULL: the entity exists, and existence is all the shape claims. Every other
 * kind — 'ticket' and 'membership' — has domain fields this server cannot
 * produce until Plan 3 Task 12 lands proj_tickets and Plan 4 lands
 * proj_memberships, so it answers null instead.
 */
const KINDS_WHOSE_STATE_IS_ONLY_IDENTITY: ReadonlySet<string> = new Set<OtherEntityState['kind']>([
  'workspace',
  'project',
  'workflow',
  'ticket-type',
]);

/** A type guard, not a boolean, so the return below needs no cast to be an EntityState. */
function isIdentityOnlyKind(kind: EntityKind): kind is OtherEntityState['kind'] {
  return KINDS_WHOSE_STATE_IS_ONLY_IDENTITY.has(kind);
}

/**
 * EngineContext over the ingest transaction's client. The event under
 * evaluation is not yet applied, so every read answers with the world as of
 * the previously committed events — which is exactly what rules must judge
 * against.
 *
 * getWorkflowDef reads proj_workflows through the ingest transaction's own
 * client, so a publish sees every version committed before it and none of
 * itself — which is what the version rule ("the next version must be exactly
 * one past the latest") has to be judged against.
 */
export function createEngineContext(client: PoolClient): EngineContext {
  return {
    async getEntityState(kind, id) {
      // What this can honestly answer, and what it refuses to invent
      // (coordination doc, Plan 1 consequences §9).
      //
      // This body used to be `readEntityHead(...) as unknown as EntityState`,
      // returning a head POINTER — {kind, id, headSeq, headEventId,
      // headEventType} — for every kind. `as unknown as` defeats every
      // structural check, so nothing warned the callers: a ticket came back
      // looking like a TicketState whose `workflowId` was `undefined`, and a
      // membership came back satisfying restrict-to's
      // `membership.kind === 'membership'` narrowing with `role` undefined.
      //
      // Registering the ticket vocabulary (Plan 3 Task 2) is what turned that
      // into a live defect rather than a documented seam: transitions became
      // ingestible while ticket state is still ten tasks away. The honest
      // answer is null for the kinds this server cannot serve — the engine then
      // refuses with "no such ticket is known", which is TRUE of this server
      // today, instead of blaming a workflow named `undefined`.
      //
      // PLAN 3 TASK 12 is where this grows a real body for 'ticket', from
      // proj_tickets. Plan 4 owns 'membership' via proj_memberships. Until each
      // lands, its kind stays null here, and the cast stays gone — the four
      // identity-only kinds are returned as themselves, structurally, with the
      // compiler checking.
      //
      // 'ticket-type' is NOT on that list and never will be. This comment used
      // to promise it a real body here too; controller ruling P3 (2026-08-28)
      // settled the opposite — the domain union keeps 'ticket-type' as identity
      // only, and a type's DEFINITION (rank, name, workflow binding, fields)
      // arrives through the context's fourth method, getTicketTypeDef, which
      // Task 12 backs with proj_ticket_types. Growing a TicketTypeState in the
      // union is the rejected alternative; do not reach for it because this
      // comment once pointed at it.
      const head = await readEntityHead(client, kind, id);
      if (head === null || !isIdentityOnlyKind(kind)) {
        return null;
      }
      return { kind, id };
    },
    async getChildrenStates(ticketId) {
      // Empty because getEntityState answers null for 'ticket': the only
      // caller (the parent-terminal invariant) is reached solely through a
      // resolved TicketState, so on this server it is unreachable until Plan 3
      // Task 12. It is NOT "no hierarchy events can exist" any more — Plan 3
      // Task 2 put ticket.created in the vocabulary, and children can now be
      // committed to the ledger. Task 12 replaces this with the real
      // proj_tickets query, in the same change set that makes getEntityState
      // answer for 'ticket'; neither may land without the other.
      void ticketId;
      return [];
    },
    async getWorkflowDef(workflowId, version) {
      return await getWorkflowDefFromProjection(client, workflowId, version);
    },
    async getTicketTypeDef(typeId) {
      // Null for the same reason getEntityState answers null for 'ticket':
      // proj_ticket_types does not exist yet (Plan 3 Task 9 lands the table,
      // Task 12 wires this method to it). Null, not a throw, because this
      // server is live — the engine's hierarchy checks then refuse with "no
      // such ticket type is known", which is TRUE of this server today, rather
      // than turning an ingest into a 500. It joins getEntityState('ticket')
      // and getChildrenStates in the same change set: Task 12 replaces all
      // three, and none may land without the others.
      void typeId;
      return null;
    },
  };
}
