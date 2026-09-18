import type { PoolClient } from 'pg';
import type { EntityKind, MembershipState, OtherEntityState } from '@gisik-nokma/domain';
import { membershipId } from '@gisik-nokma/domain';
import type { EngineContext } from '@gisik-nokma/rule-engine';
import { resolveEffectiveRole } from './permissions/effective-role.js';
import { readEntityHead } from './projections/entity-heads.js';
import { getTicketTypeFromDb } from './projections/ticket-types.js';
import { getChildrenStatesFromDb, getTicketStateFromDb } from './projections/tickets.js';
import { getWorkflowDefFromProjection } from './projections/workflows.js';

/**
 * Kinds whose EntityState is exactly `{ kind, id }` today (`OtherEntityState`
 * in the domain's union). For these, a head row is enough to serve the state in
 * FULL: the entity exists, and existence is all the shape claims.
 *
 * `'membership'` is NOT one of them and never was — a `MembershipState` carries
 * a `workspaceId`, a `userId` and a `role`, and a role is the whole reason the
 * engine asks. It used to answer null for want of a table to read; ruling P18's
 * wiring gives it `proj_memberships` through `readMembershipState` below, so
 * every kind in the domain's union now has a body that reads something. Nothing
 * remains that answers null for lack of state to serve; the nulls left in this
 * file are all statements about the world — no such entity, not a member here.
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
 * The `'membership'` half of `getEntityState`, which is controller ruling P18 —
 * a wiring no task in Plan 4 owned, found by the step-10 integration checkpoint
 * and closed here.
 *
 * ## What it was, said plainly
 *
 * This kind answered null unconditionally, and its only production caller is
 * `restrict-to`'s role criterion (`packages/rule-engine/src/rules/restrict-to.ts`),
 * which reads the answer and then asks `rule.roles.includes(membership.role)`.
 * Null narrows that clause away, so EVERY role-gated `restrict-to` edge was
 * refused on the server path, for everyone, always — an owner included. It fails
 * CLOSED, so it was a functionality gap and never a way past a gate; what it
 * cost was every workflow whose approval step is spelled as a role.
 *
 * It survived because the contract was half witnessed. The rule engine's own
 * suite drives `restrict-to` against `packages/rule-engine/src/fixtures/harness.ts`
 * ALONE — it is the only in-memory context that carries memberships and answers
 * (`harness.ts:294`), and the eleven `rule-restrict-to-*` fixtures run through
 * it via `packages/rule-engine/test/fixtures.test.ts`. The
 * SECOND in-memory context, `packages/rule-engine/src/memory-context.ts`,
 * answered `null` for `'membership'` exactly as this file did, and its own suite
 * pins that: `packages/rule-engine/test/memory-context.test.ts:214` is a case
 * named "does not serve memberships — this context is a SECOND context, not a
 * replacement". So the criterion was green on the one side with the fake and
 * untested everywhere else. `proj_memberships` landed in Plan 4 Task 4 and
 * nothing read it through the engine.
 *
 * ## Why `resolveEffectiveRole` and not a SELECT of our own
 *
 * `proj_memberships` holds a workspace-scope row AND one row per project the
 * user is on, and its own docblock is emphatic that a project-scope row is not
 * on its own evidence that the user still belongs to the workspace:
 * `membership.revoked` deletes the workspace row alone, because the roster rows
 * are written by the PROJECT entity's stream and a cross-entity delete would
 * make the table depend on arrival interleaving. The guarantee that delete was
 * meant to give lives in `resolveEffectiveRole`'s early return instead. So that
 * function is the audited reader and the only safe one, and a fresh
 * `WHERE workspace_id = $1 AND user_id = $2` here would hand a revoked person's
 * surviving roster row back to the engine as a role. `Queryable` is
 * `Pool | PoolClient`, so the ingest transaction's own client goes in unchanged
 * and this read sees the world as of the events committed before the one under
 * judgement, like every other member of this context.
 *
 * A null `workspaceRole` means "not a member of this workspace at all", and the
 * honest answer to "what is this person's membership" is then null — the engine
 * refuses naming the roles the edge wanted, which is TRUE of the world rather
 * than true of a gap in this file.
 *
 * ## Decoding the id, and why the decode is checked by re-encoding it
 *
 * `getEntityState` is handed an entity id, and a membership's is
 * `membershipId(workspaceId, userId)` — `${workspaceId}:${userId}`
 * (`packages/domain/src/entity-state.ts`). The pair has to be recovered from it,
 * and a decode that is merely PLAUSIBLE is the thing to avoid: rather than
 * reason about whether either half can contain a colon, the split is checked by
 * re-encoding it and comparing to the input. Anything that does not round-trip
 * is an id shaped differently than this function assumed, and the answer is
 * null. That is cheaper than the reasoning it replaces and it stays correct if
 * the id convention ever changes shape — it would start answering null instead
 * of quietly resolving the wrong pair.
 *
 * It is reachable only from a caller that builds an id some other way:
 * `restrict-to` builds this one with `membershipId` itself. It is a fail-closed
 * decode, not a live refusal, and the test that pins it drives this function
 * directly.
 *
 * ## Where this sits on the tenancy question the factory docblock answers
 *
 * Every other reader here is scoped deliberately, ruling P14, and the factory
 * docblock says which and why. This one takes NO `TenantScope`, and does not
 * need one: the id ENCODES its own workspace, so the lookup is already asked
 * inside a named tenancy rather than resolved across every tenant at once — the
 * shape that made `getWorkflowDef` and `getTicketTypeDef` need the predicate.
 * The workspace in the id is not the actor's to choose either. `restrict-to`
 * builds it from `env.workspaceId` and `env.actorId`, and the permission gate
 * has already resolved the SESSION user's effective role in `env.workspaceId`
 * and refused a non-member before the engine ran, so the workspace half is the
 * event's own and the user half is the actor the door authenticated.
 *
 * The residue is worth naming rather than implying: an id naming ANOTHER
 * workspace would resolve that workspace's membership here. Nothing in the
 * product builds one — the only caller does not, and no payload field carries a
 * membership id — and the answer would be a role for a pair that genuinely
 * holds it, so it discloses nothing about the asking workspace. If a check ever
 * does resolve a membership id off a payload, that is when this reader needs the
 * `TenantScope` the other two carry, and this paragraph is the note saying so.
 */
async function readMembershipState(
  client: PoolClient,
  id: string,
): Promise<MembershipState | null> {
  const [workspaceId, userId] = id.split(':');
  if (
    workspaceId === undefined ||
    userId === undefined ||
    membershipId(workspaceId, userId) !== id
  ) {
    return null;
  }

  const eff = await resolveEffectiveRole(client, userId, workspaceId);
  if (eff.workspaceRole === null) {
    return null;
  }
  return { kind: 'membership', id, workspaceId, userId, role: eff.workspaceRole };
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
 * `getEntityState('membership')` takes no scope either, and for a third reason
 * again: the id IS the tenancy. `membershipId(workspaceId, userId)` spells the
 * workspace into the entity id, so the lookup is already asked inside one named
 * workspace and there is no global key for a foreign id to resolve against —
 * which is the shape P14's predicate exists to close. The one caller builds that
 * id from `env.workspaceId` and `env.actorId`. `readMembershipState` above
 * carries the full argument, including the residue it does not close.
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
      // 'ticket' now answers for real, from proj_tickets. 'membership' answers
      // for real too, from proj_memberships through resolveEffectiveRole — that
      // is ruling P18, and until it landed this method's null was the reason
      // every role-gated restrict-to edge in the product was refused on the
      // server path. Null is still what a non-member gets, and the engine still
      // refuses them; the difference is that the sentence is now a statement
      // about the person rather than about this file.
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
      if (kind === 'membership') {
        // ANSWERED BEFORE THE HEAD READ, deliberately. proj_memberships is the
        // single authority on what somebody is here, and a membership head row
        // is precisely the instrument of the §9 hazard this file was written
        // against — the head POINTER carries `kind: 'membership'`, which is what
        // satisfied restrict-to's narrowing while `.role` was undefined. Reading
        // it first would put that row back into the decision path as a
        // precondition no ledger path can falsify — and it is the SECOND half of
        // that sentence that carries it, so both halves are spelled out rather
        // than left to one clause. "A membership with no head" is not reachable
        // at all: heads are never deleted (`projections/entity-heads.ts` is an
        // upsert and nothing else), and no event writes `proj_memberships`
        // without writing the head in the same ingest transaction. A head gate
        // would therefore be a condition that is TRUE for every membership the
        // ledger can produce — a check that cannot fail, sitting in an
        // authorisation path.
        //
        // "A head with no membership" is a different matter and is NOT the
        // hand-planted-only case an earlier draft of this comment claimed. It is
        // ordinary: grant then revoke reaches it through the ledger, because
        // `membership.revoked` deletes the workspace-scope row and leaves the
        // head standing at `membership.revoked`. Which is the point restated —
        // for a revoked person a head gate would pass and decide nothing, and
        // `resolveEffectiveRole` is what answers.
        return await readMembershipState(client, id);
      }
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
    /**
     * Owners of one workspace, for the last-owner guard (owner ruling
     * 2026-09-18).
     *
     * ## Why a fresh query here is safe when the table's own comment says not to
     *
     * `proj_memberships` carries a loud instruction — "READ IT THROUGH
     * `resolveEffectiveRole`, never directly" — and `sweep-user-preferences.ts`
     * calls a bare read of it P22, so a new `SELECT` against this table owes an
     * argument rather than an assumption. The hazard it names is specific: a
     * PROJECT-scope row survives a revocation, so a bare read can report a
     * person who is no longer in the workspace. `scope_kind = 'workspace'` is
     * exactly the predicate that excludes that class, and it makes this query
     * agree with `resolveEffectiveRole` by construction rather than by
     * coincidence: that function sets `workspaceRole` from the
     * `scope_kind === 'workspace'` row and null otherwise, so
     * `workspaceRole === 'owner'` holds for precisely the rows counted here.
     * The count and the audited reader are two spellings of one fact.
     *
     * The redundant half is recorded rather than dropped: `role = 'owner'`
     * already excludes every project-scope row, because `project.member_added`
     * hardcodes `role = 'member'` (`proj-memberships.ts`, and the column comment
     * on the migration says so). `scope_kind` is kept anyway — it is the term
     * that carries the safety argument above, and a future project-scope role
     * grant would silently make `role = 'owner'` alone mean something wider.
     *
     * ## `excludingUserId` and the NULL test
     *
     * The caller is judging a change to ONE person, and an owner being demoted
     * must not be counted among the owners who remain. `$2::text IS NULL OR
     * user_id <> $2` keeps the one-statement shape: a second query for the
     * "ignore nobody" case would be a second place for the predicate to drift.
     * The cast is explicit because a bare `$2 IS NULL` leaves Postgres
     * inferring the parameter's type from context, and `pg` sends the JS `null`
     * as an untyped parameter.
     */
    async countWorkspaceOwners(scope, excludingUserId) {
      const { rows } = await client.query<{ n: string }>(
        `SELECT count(*)::text AS n
           FROM proj_memberships
          WHERE workspace_id = $1
            AND scope_kind = 'workspace'
            AND role = 'owner'
            AND ($2::text IS NULL OR user_id <> $2)`,
        [scope.workspaceId, excludingUserId ?? null],
      );
      return Number(rows[0]?.n ?? '0');
    },
  };
}
