import type { PoolClient } from 'pg';
import type { EntityKind, OtherEntityState } from '@gisik-nokma/domain';
import type { EngineContext } from '@gisik-nokma/rule-engine';
import { readEntityHead } from './projections/entity-heads.js';
import { getTicketTypeFromDb } from './projections/ticket-types.js';
import { getChildrenStatesFromDb, getTicketStateFromDb } from './projections/tickets.js';
import { getWorkflowDefFromProjection } from './projections/workflows.js';

/**
 * Kinds whose EntityState is exactly `{ kind, id }` today (`OtherEntityState`
 * in the domain's union). For these, a head row is enough to serve the state in
 * FULL: the entity exists, and existence is all the shape claims. `'membership'`
 * is the one remaining kind with domain fields this server cannot produce —
 * Plan 4's proj_memberships is what will change that — so it answers null.
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
 * ## Where tenancy comes from, and why an actor cannot choose it
 *
 * This factory takes a client and NOT a workspace, deliberately: it is built
 * once per event inside `commitOne` and the workspace a lookup must be asked
 * inside is a property of the EVENT, not of the connection. So the two lookups
 * that resolve an actor-supplied id take a `TenantScope` and every check passes
 * `env` (controller ruling P14). `env.workspaceId` is not the actor's to choose:
 *
 *  - the permission gate resolves the SESSION user's effective role in
 *    `env.workspaceId` before the engine runs and refuses a non-member
 *    (`permissions/check-permission.ts` — `resolveEffectiveRole(ctx.db,
 *    ctx.sessionUserId, env.workspaceId)`), so a client cannot name a workspace
 *    it does not belong to; and
 *  - the entity-to-workspace guard in `ingest/ingest-service.ts` refuses an
 *    event whose entity already has a head row in another workspace, so a member
 *    of W cannot file an event about W''s ticket under W.
 *
 * Neither of those closes P14, and saying so is the point: an ADMIN of their own
 * workspace passes both gates and then names another workspace's workflow id in
 * a `ticket.workflow_rebound` payload. The scoped reader below is the only thing
 * that refuses it.
 *
 * ## What is scoped, what is not, and why the difference is not an oversight
 *
 * `getWorkflowDef` and `getTicketTypeDef` are scoped: a `WorkflowDef` and a
 * `TicketTypeDef` are definitions, so the answer carries no workspace for a
 * check to compare afterwards.
 *
 * `getEntityState('ticket')` and `getChildrenStates` resolve a ticket by its OWN
 * tenancy — the head row's `workspace_id`, which is the tenant boundary every
 * scoped read on this server trusts — and hand back a `TicketState` carrying
 * that `workspaceId`. That is a GLOBAL by-id lookup on purpose. Ruling P12's
 * guard (`checks/hierarchy.ts`, `parent.workspaceId !== env.workspaceId`) is
 * what refuses a foreign parent, and a scoped reader here would make that guard
 * unreachable — a branch no input can take, whose test would then pass with
 * `workspaceId` missing from `rowToTicketState`, which is the total-outage trap
 * `projections/tickets.ts` documents at length.
 *
 * The two-step — head first, then the workspace-scoped ticket reader — rather
 * than one unscoped `WHERE ticket_id = $1`: it adds no reader that a later
 * caller could reuse without a tenancy, and a head and a ticket row that
 * disagreed about the workspace would answer null rather than serve a row under
 * the wrong tenancy. Nothing produces that disagreement today (both are written
 * from the same event, heads first, and the entity-to-workspace guard refuses
 * the event that would move one), so it is a fail-closed edge and not a
 * scenario.
 *
 * ## The divergence this server carries, stated rather than smoothed over
 *
 * `getEntityState` for the four identity-only kinds is a head read, and
 * `proj_entity_heads`' primary key is `(entity_kind, entity_id)` — GLOBAL. So
 * `getEntityState('ticket-type', 'task')` answers `{kind, id}` for a slug this
 * workspace never defined, while `getTicketTypeDef(env, 'task')` — scoped —
 * answers null for the same id in the same evaluation. Two doors, opposite
 * claims. It cannot be closed here: `getEntityState` has no scope, and giving it
 * one is what would disarm P12's guard. It is latent rather than live — no check
 * in the engine reads existence for `workspace`, `project`, `workflow` or
 * `ticket-type` — and it is recorded in `docs/plan-3-chain-b-handoff.md` for
 * whoever gives the head table a per-tenant key.
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
      // 'ticket' now answers for real, from proj_tickets. Plan 4 owns
      // 'membership' via proj_memberships; until it lands, that kind stays null
      // — the engine then refuses with "no such membership", which is TRUE of
      // this server, instead of narrowing onto a role that is not there.
      //
      // 'ticket-type' is NOT on the identity-only list by accident and never
      // will be off it. Controller ruling P3 (2026-08-28) settled it: the domain
      // union keeps 'ticket-type' as identity only, and a type's DEFINITION
      // (rank, name, workflow binding, fields) arrives through the context's
      // fourth method, getTicketTypeDef, which this task backs with
      // proj_ticket_types. Growing a TicketTypeState in the union is the
      // REJECTED alternative — the plan text still instructs it at three lines —
      // and it is not to be reached for because a comment or a brief points at
      // it.
      const head = await readEntityHead(client, kind, id);
      if (head === null) {
        return null;
      }
      if (kind === 'ticket') {
        // Scoped by the TICKET's own workspace, taken off its head row — not by
        // the event's, which this method is not given and must not infer. See
        // the factory docblock: the global by-id answer is what keeps ruling
        // P12's guard reachable, and the `TicketState` returned carries the
        // `workspaceId` that guard compares.
        return await getTicketStateFromDb(client, head.workspaceId, id);
      }
      if (!isIdentityOnlyKind(kind)) {
        return null;
      }
      return { kind, id };
    },
    async getChildrenStates(ticketId) {
      // DIRECT children, from proj_tickets, in the parent's own workspace. The
      // parent-terminal invariant (`parent-terminal-with-open-children`) is the
      // only caller and it is reached solely through a resolved TicketState, so
      // this method and `getEntityState('ticket')` had to become real in the
      // same change set — a context that resolved a parent and then reported it
      // childless would refuse nothing and look like it had checked.
      //
      // Empty for a ticket with no head row, which is the same answer as "no
      // children": both are true of a parent this server has never seen, and the
      // invariant refuses nothing either way. A ticket that exists always has a
      // head — proj_entity_heads is registered first and writes on every
      // committed event.
      const head = await readEntityHead(client, 'ticket', ticketId);
      if (head === null) {
        return [];
      }
      return await getChildrenStatesFromDb(client, head.workspaceId, ticketId);
    },
    async getWorkflowDef(scope, workflowId, version) {
      // SCOPED — controller ruling P14. `proj_workflows` is keyed
      // `(workflow_id, version)` globally, so before the predicate existed
      // `ctx.getWorkflowDef(p.toWorkflowId)` in checks/workflow-rebind.ts
      // resolved an ACTOR-SUPPLIED id against every tenant's workflows at once:
      // the target-state check ran against another workspace's state graph and
      // the rebind was ACCEPTED, leaving a live ticket bound to a workflow its
      // own workspace cannot see. Latent only while getEntityState answered null
      // for 'ticket'; this commit is what makes it reachable, which is why the
      // predicate lands in the same one.
      //
      // The scope is the EVENT's workspace, threaded from `env`. It is not read
      // off the ticket: ingest's entity-to-workspace guard makes the two equal on
      // every live path, and resting on that would be a true statement about a
      // neighbouring subject.
      return await getWorkflowDefFromProjection(client, scope.workspaceId, workflowId, version);
    },
    async getContest(contestedEventId) {
      // Reads proj_contested through the ingest transaction's own client, like
      // every other member here: a `claim.contested_resolved` must be judged
      // against the contests committed BEFORE it, and a contest committed
      // earlier in this same batch is one of them.
      //
      // `ticketId` comes from the projection's `ticket_id` — the entity the
      // contest was filed against — which is what `contest.wrong-ticket`
      // compares to `env.entity.id`. Null for an unknown contest, which is a
      // TRUE statement about this server: the projection is rebuildable from
      // the whole ledger, so "no row" means "no such contest was ever
      // recorded", not "this context cannot see contests". That distinction is
      // why the evaluator THROWS when this method is absent and REFUSES when it
      // answers null — a context that cannot see contests has made no claim
      // about the world, and answering null on its behalf would turn a wiring
      // bug into a plausible-sounding lie.
      const { rows } = await client.query<{ ticket_id: string; resolved: boolean }>(
        'SELECT ticket_id, resolved FROM proj_contested WHERE contested_event_id = $1',
        [contestedEventId],
      );
      const row = rows[0];
      if (row === undefined) {
        return null;
      }
      return { ticketId: row.ticket_id, resolved: row.resolved };
    },
    async getTicketTypeDef(scope, typeId) {
      // SCOPED, and this is the second half of ruling P14 — the create path's
      // instance of the same shape. A type id is a slug the ACTOR chose (`epic`,
      // `task`, `bug`), a `TicketTypeDef` carries no workspace for a check to
      // compare afterwards, and an unscoped lookup would hand one tenancy
      // another's rank, workflow binding and field list. `getTicketTypeFromDb`
      // has carried the predicate since Task 9; this is the wiring that makes it
      // load-bearing.
      //
      // Null for a type this workspace never defined, which the hierarchy checks
      // turn into `ticket.unknown-type` / `hierarchy.parent-type-unknown` — the
      // same sentence the fixture harness and the memory context produce for the
      // same absence.
      return await getTicketTypeFromDb(client, scope.workspaceId, typeId);
    },
  };
}
