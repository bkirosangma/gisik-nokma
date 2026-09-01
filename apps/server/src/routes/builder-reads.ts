import type { FastifyInstance, FastifyRequest, preHandlerHookHandler } from 'fastify';
import { z } from 'zod';
import type {
  MemberListResponse,
  PublishedWorkflowDef,
  StateOccupancyResponse,
  TicketTypeDef,
  TicketTypeListResponse,
  TypePopulationResponse,
  WorkflowListResponse,
  WorkflowResponse,
  WorkspaceMember,
} from '@gisik-nokma/domain';
import type { Queryable } from '../db/queryable.js';
import type { EffectiveRole } from '../permissions/effective-role.js';
import { getWorkflowDefFromProjection } from '../projections/workflows.js';
import { READ_NOT_FOUND_BODY, requireMember } from '../read/membership.js';
import { latestWorkflowDefs } from '../read/workflow-defs.js';

/**
 * The BUILDER read surface (Plan 5 Task 9b): what a workspace IS, as opposed to
 * what work is in it.
 *
 * Plan 8's workflow builder authors `workflow.defined` and `ticket-type.defined`
 * claims and cannot author against definitions it cannot read. It needs the
 * workflow roster to list, one definition to load onto the canvas, the ticket
 * types bound to a workflow, the people a `require-different-user` rule may
 * name, and — before a publish remaps states — how much live work is sitting in
 * each state today.
 *
 * ## Why the door is the whole subject here
 *
 * Tasks 8 and 9 serve tickets, so their answer narrows through
 * `visibleTicketsWhere` and an over-broad door still yields an empty board. NONE
 * of these six reads passes through that predicate: a definition has no
 * audience, a roster row is not a ticket, and an occupancy count is deliberately
 * the whole workspace's. So on this surface the door is not the first of two
 * defences, it is the only one, and every route below states which of the three
 * levels it sits at.
 *
 * ## The three access levels, and who decided each
 *
 * 1. **Any member, guests included** — `/workflows`, `/workflows/:id`,
 *    `/ticket-types`. The plan says so for the workflow reads and gives the
 *    reason: a guest already receives definition events on the stream, and a
 *    guest's shared ticket cannot render its status without one. The type list
 *    is the same argument one step along — the same shared ticket renders its
 *    type's name and icon. Being STRICTER than the plan here would break a
 *    guest's view of the one ticket they were invited to, so the plan's reading
 *    is followed rather than tightened.
 * 2. **Any member, with guests WITHHELD from non-admin callers** — `/members`.
 *    A guest is a person invited to one shared ticket, not a member of the
 *    roster, and handing every member a directory of them leaks who else the
 *    workspace is talking to. Owners and admins — who manage people — see them.
 * 3. **Owner/admin only** — `/state-occupancy` and `/population`. The plan gates
 *    both, and its reason is worth keeping in view: the honest number is the
 *    WHOLE workspace's, including tickets the caller may not see, so there is no
 *    per-viewer variant that could be served to everyone instead.
 *
 * ## The admin refusal is 404, never 403
 *
 * `requireMember`'s 404 exists so that a 403 cannot confirm a workspace to
 * somebody with no business knowing it exists. An admin-only route that
 * answered 403 to a plain member would give that confirmation back one level
 * down — "there is a workflow here called wf-payroll" — so a member, a guest,
 * an off-project member and a total stranger all receive the same frozen
 * `READ_NOT_FOUND_BODY`, byte for byte.
 *
 * ## Tenancy: every lookup correlates on a workspace the CALLER holds
 *
 * `proj_workflows`' primary key is `(workflow_id, version)` GLOBALLY, with
 * `workspace_id` a plain column (controller ruling P14). Every id on this
 * surface — a workflow id, a type id — arrives from the URL, which is to say
 * from the actor. So the only workspace any query here is scoped by is the one
 * `requireMember` just approved for this session, and it reaches every reader as
 * an explicit parameter: `latestWorkflowDefs(db, workspaceId, ids)`,
 * `getWorkflowDefFromProjection(db, workspaceId, id)`, and a literal
 * `workspace_id = $1` in each SQL statement below. Nothing here resolves an
 * actor-supplied id without it.
 *
 * ## The registration shape is the branch's, not the plan's
 *
 * The plan's signature is `(app, { pool, auth })` with `makeRequireSession`
 * imported from `../auth/routes.js` — a module that exports no such thing. Every
 * route on this branch takes the preHandler AS AN ARGUMENT instead
 * (`registerBoardRoutes`, `registerListRoutes`, `registerEventRoutes`), so there
 * is no version of this registration that forgets the session check and still
 * compiles. That is the stronger guarantee and it is what is followed.
 */

/** A published version is a positive integer; anything else is a bad request. */
const versionSchema = z.coerce.number().int().positive();

/** The one body a malformed `?version=` draws. Built once, so route and test name one object. */
export const INVALID_VERSION_BODY = { error: 'invalid_version' } as const;

/**
 * The one body an absent or empty `?workflowId=` draws on the population route.
 *
 * A 400 rather than a fallback to the TYPE's own binding, and that is the whole
 * point of the parameter: a ticket pins its workflow at CREATION (owner decision
 * 2026-08-27), so the type's binding is what new tickets get and may already
 * differ from where the live ones sit. Answering with it would be a different
 * number wearing this one's name, at exactly the moment a publish is about to
 * move work on the strength of it.
 */
export const INVALID_WORKFLOW_ID_BODY = { error: 'invalid_workflow_id' } as const;

function isWorkspaceAdmin(eff: EffectiveRole): boolean {
  return eff.workspaceRole === 'owner' || eff.workspaceRole === 'admin';
}

/**
 * Every workflow id defined in this workspace, in a stable order.
 *
 * `DISTINCT` because `proj_workflows` holds every published VERSION as its own
 * row, and the roster wants one entry per workflow. `ORDER BY workflow_id` so
 * the answer is a function of the workspace's contents rather than of whichever
 * row Postgres returned first — and `latestWorkflowDefs` sorts again anyway, so
 * the two agree instead of one silently depending on the other.
 */
export async function workflowIdsOf(db: Queryable, workspaceId: string): Promise<string[]> {
  const { rows } = await db.query<{ workflow_id: string }>(
    'SELECT DISTINCT workflow_id FROM proj_workflows WHERE workspace_id = $1 ORDER BY workflow_id',
    [workspaceId],
  );
  return rows.map((row) => row.workflow_id);
}

/**
 * Every ticket type defined in this workspace, newest definition per key.
 *
 * `proj_ticket_types` already holds only the winner — the table is keyed
 * `(workspace_id, type_id)` and resolves last-definition-wins on
 * `defined_workspace_seq` — so this reader does no folding of its own.
 *
 * `ORDER BY rank, type_id`: rank is the ladder the product is arranged by, and
 * `type_id` breaks the ties rank leaves (the seeded world has two types at rank
 * 3), so the order is total and reproducible rather than planner-dependent.
 */
export async function readTicketTypes(db: Queryable, workspaceId: string): Promise<TicketTypeDef[]> {
  const { rows } = await db.query<{
    type_id: string;
    name: string;
    icon: string;
    rank: number;
    workflow_id: string;
    fields: TicketTypeDef['fields'];
  }>(
    `SELECT type_id, name, icon, rank, workflow_id, fields
       FROM proj_ticket_types
      WHERE workspace_id = $1
      ORDER BY rank, type_id`,
    [workspaceId],
  );
  return rows.map((row) => ({
    id: row.type_id,
    name: row.name,
    icon: row.icon,
    rank: row.rank,
    workflowId: row.workflow_id,
    fields: row.fields,
  }));
}

/**
 * The workspace roster: one row per person who holds a WORKSPACE-SCOPE grant.
 *
 * ## `scope_kind = 'workspace'`, and this is not a filter of convenience
 *
 * `proj_memberships`' own table comment and `resolveEffectiveRole`'s docblock
 * both say it in as many words: **a project-scope row is not evidence that the
 * user still belongs to the workspace.** `membership.revoked` may only delete
 * what its own entity stream owns, so it removes the workspace-scope row and
 * leaves the project roster rows standing; `resolveEffectiveRole`'s early return
 * is what makes those inert everywhere else. A roster built by folding both
 * scopes together — the plan text's `DISTINCT ON (user_id) … ORDER BY
 * (scope_kind = 'workspace') DESC` — would hand a revoked person back as a
 * current `member`, which is the one answer this read must never give.
 *
 * Nothing is lost by ignoring the project rows. After the scope collapse (owner
 * decision 2026-08-27) `membership.granted` refuses a `scope` outright, so a
 * project-scope row is only ever written by `project.member_added`, which
 * hardcodes role `'member'` — it carries no role information at all. A guest is
 * a workspace-scope grant with role `'guest'`. And nobody reaches a project
 * without a workspace grant first. `GET /v1/me/workspaces` filters the same way,
 * for the same reason.
 *
 * ## Guests, and who may see them
 *
 * `includeGuests` is the caller's admin-ness, resolved at the door and passed in
 * rather than re-derived here. It is a bound PARAMETER inside the SQL rather
 * than a branch between two query strings, so there is exactly one statement to
 * read and no second copy to drift.
 *
 * ## The join is INNER, and that is a decision
 *
 * A membership naming a user id with no `"user"` row is DROPPED rather than
 * listed with an invented name. The plan forbids the fallback ("this route
 * neither invents a fallback nor formats a phone number into a name"), and a
 * null `displayName` would push the same problem onto every renderer. The shape
 * is not reachable through the shipped doors — a membership names a user who
 * signed in, and better-auth owns that row's lifetime — so this is recorded as a
 * decision rather than defended by a test that cannot be written honestly. If a
 * user row ever is deleted underneath a live membership, this roster goes quiet
 * about that person, and `proj_memberships` is where the truth still is.
 */
export async function readMembers(
  db: Queryable,
  workspaceId: string,
  includeGuests: boolean,
): Promise<WorkspaceMember[]> {
  const { rows } = await db.query<{ user_id: string; display_name: string; role: WorkspaceMember['role'] }>(
    `SELECT m.user_id, u."name" AS display_name, m.role
       FROM proj_memberships m
       JOIN "user" u ON u."id" = m.user_id
      WHERE m.workspace_id = $1
        AND m.scope_kind = 'workspace'
        AND ($2::boolean OR m.role <> 'guest')
      ORDER BY m.user_id`,
    [workspaceId, includeGuests],
  );
  return rows.map((row) => ({
    userId: row.user_id,
    displayName: row.display_name,
    role: row.role,
  }));
}

/**
 * Occupancy of one workflow's states, over the whole workspace.
 *
 * Seeded from the DEFINITION so an empty state reports 0 rather than vanishing —
 * a mapping dialog that omitted an empty state would invite an author to delete
 * a state that turns out to hold work tomorrow — then filled from
 * `proj_tickets`.
 *
 * The plan also asks that a `state_id` still occupied but no longer named by the
 * definition appear here, and the write below would put it there. **No test
 * constrains that branch, and none on this branch can**: `applyTicketEvent`
 * throws on a `ticket.transitioned` to a state its workflow does not carry and
 * throws again if the workflow itself is missing, so no hostile client, no
 * engine-bypassing `applyCommitted` seed and no internal append can produce such
 * a row — the same unreachability `board.ts`'s straggler pass records against
 * Open question 8, measured there. It is written this way anyway, and for the
 * same reason: a ticket silently absent from a mapping dialog is a lie with a
 * longer fuse than a state id nobody recognises.
 *
 * `workspace_id` AND `workflow_id` are both bound. Neither is redundant: the
 * definition was already resolved workspace-scoped, but this query reaches a
 * different table on an id the ACTOR supplied, and `proj_tickets`' primary key
 * is `ticket_id` alone with `workspace_id` a plain column.
 */
export async function readStateOccupancy(
  db: Queryable,
  workspaceId: string,
  def: PublishedWorkflowDef,
): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const state of def.states) {
    counts[state.id] = 0;
  }
  const { rows } = await db.query<{ state_id: string; occupants: number }>(
    `SELECT state_id, count(*)::int AS occupants
       FROM proj_tickets
      WHERE workspace_id = $1 AND workflow_id = $2
      GROUP BY state_id`,
    [workspaceId, def.id],
  );
  for (const row of rows) {
    counts[row.state_id] = row.occupants;
  }
  return counts;
}

/**
 * Whether this workspace defines this ticket type.
 *
 * `proj_ticket_types` is keyed `(workspace_id, type_id)`, so the scope is in the
 * key here — unlike `proj_workflows`. The predicate is written out anyway,
 * because a reader must not have to know which of two neighbouring tables
 * carries its tenancy in the key and which carries it in a plain column.
 */
export async function ticketTypeExists(db: Queryable, workspaceId: string, typeId: string): Promise<boolean> {
  const { rows } = await db.query(
    'SELECT 1 FROM proj_ticket_types WHERE workspace_id = $1 AND type_id = $2',
    [workspaceId, typeId],
  );
  return rows.length > 0;
}

/**
 * How many tickets of one type are pinned to one workflow.
 *
 * Both ids came from the URL and both have already been resolved against this
 * workspace by the caller; the `workspace_id` predicate is bound here regardless
 * because `proj_tickets`' primary key is `ticket_id` ALONE, so nothing about
 * this table's shape scopes a count on its own.
 *
 * `::int` on the count: `createPool` installs an int8 parser, but saying it in
 * the SQL means the JSON carries a number no matter which pool this runs on.
 */
export async function readTypePopulation(
  db: Queryable,
  workspaceId: string,
  typeId: string,
  workflowId: string,
): Promise<number> {
  const { rows } = await db.query<{ population: number }>(
    `SELECT count(*)::int AS population
       FROM proj_tickets
      WHERE workspace_id = $1 AND type_id = $2 AND workflow_id = $3`,
    [workspaceId, typeId, workflowId],
  );
  return rows[0]?.population ?? 0;
}

export function registerBuilderReadRoutes(
  app: FastifyInstance,
  deps: { pool: Queryable },
  requireSession: preHandlerHookHandler,
): void {
  /**
   * The door, asked once per handler. Returns the caller's `EffectiveRole` in
   * the workspace named by the URL, or `null` meaning "answer 404".
   *
   * `admin` is a REQUIRED argument rather than an optional flag: every route on
   * this surface has an answer to "must this caller be an admin", and a default
   * would let a new route inherit the permissive one by saying nothing.
   */
  async function door(
    request: FastifyRequest,
    workspaceId: string,
    admin: 'members-only' | 'admins-only',
  ): Promise<EffectiveRole | null> {
    const eff = await requireMember(deps.pool, request.currentUserId, workspaceId);
    if (eff === null) return null;
    if (admin === 'admins-only' && !isWorkspaceAdmin(eff)) return null;
    return eff;
  }

  app.get<{ Params: { workspaceId: string } }>(
    '/v1/workspaces/:workspaceId/workflows',
    { preHandler: requireSession },
    async (request, reply) => {
      const { workspaceId } = request.params;
      if ((await door(request, workspaceId, 'members-only')) === null) {
        return reply.code(404).send(READ_NOT_FOUND_BODY);
      }
      const defs = await latestWorkflowDefs(
        deps.pool,
        workspaceId,
        await workflowIdsOf(deps.pool, workspaceId),
      );
      const body: WorkflowListResponse = { workspaceId, workflows: [...defs.values()] };
      return body;
    },
  );

  app.get<{ Params: { workspaceId: string; workflowId: string }; Querystring: { version?: string } }>(
    '/v1/workspaces/:workspaceId/workflows/:workflowId',
    { preHandler: requireSession },
    async (request, reply) => {
      const { workspaceId, workflowId } = request.params;
      // THE DOOR ANSWERS BEFORE THE QUERY STRING IS PARSED. Task 9's deviation
      // (case 7.83) is the convention on this branch: the plan's snippet parses
      // `?version=` first, which hands a stranger a 400 — an oracle saying the
      // workspace and the route are real. An unauthorised caller never reaches
      // the parser at all.
      if ((await door(request, workspaceId, 'members-only')) === null) {
        return reply.code(404).send(READ_NOT_FOUND_BODY);
      }
      let select: number | undefined;
      if (request.query.version !== undefined) {
        const parsed = versionSchema.safeParse(request.query.version);
        if (!parsed.success) return reply.code(400).send(INVALID_VERSION_BODY);
        select = parsed.data;
      }
      // Workspace-scoped, ruling P14: `proj_workflows` is keyed
      // `(workflow_id, version)` globally, so an id from the URL would otherwise
      // resolve out of a neighbouring tenancy. A version that was never
      // published and a workflow that does not exist are the same null, and both
      // are the same 404 — the builder is told "not here", not "not yet".
      const workflow = await getWorkflowDefFromProjection(deps.pool, workspaceId, workflowId, select);
      if (workflow === null) return reply.code(404).send(READ_NOT_FOUND_BODY);
      const body: WorkflowResponse = { workspaceId, workflow };
      return body;
    },
  );

  app.get<{ Params: { workspaceId: string } }>(
    '/v1/workspaces/:workspaceId/ticket-types',
    { preHandler: requireSession },
    async (request, reply) => {
      const { workspaceId } = request.params;
      if ((await door(request, workspaceId, 'members-only')) === null) {
        return reply.code(404).send(READ_NOT_FOUND_BODY);
      }
      const body: TicketTypeListResponse = {
        workspaceId,
        ticketTypes: await readTicketTypes(deps.pool, workspaceId),
      };
      return body;
    },
  );

  app.get<{ Params: { workspaceId: string } }>(
    '/v1/workspaces/:workspaceId/members',
    { preHandler: requireSession },
    async (request, reply) => {
      const { workspaceId } = request.params;
      const eff = await door(request, workspaceId, 'members-only');
      if (eff === null) return reply.code(404).send(READ_NOT_FOUND_BODY);
      const body: MemberListResponse = {
        workspaceId,
        // The ONE place the caller's own role changes what comes back. It is
        // the door's answer threaded through, never a second resolution.
        members: await readMembers(deps.pool, workspaceId, isWorkspaceAdmin(eff)),
      };
      return body;
    },
  );

  app.get<{ Params: { workspaceId: string; workflowId: string } }>(
    '/v1/workspaces/:workspaceId/workflows/:workflowId/state-occupancy',
    { preHandler: requireSession },
    async (request, reply) => {
      const { workspaceId, workflowId } = request.params;
      // Not an admin reads exactly like not a member, which reads exactly like
      // no such workflow: this endpoint's number is the whole workspace's, so
      // nobody learns it exists by being refused.
      if ((await door(request, workspaceId, 'admins-only')) === null) {
        return reply.code(404).send(READ_NOT_FOUND_BODY);
      }
      const def = await getWorkflowDefFromProjection(deps.pool, workspaceId, workflowId);
      if (def === null) return reply.code(404).send(READ_NOT_FOUND_BODY);
      const body: StateOccupancyResponse = {
        workspaceId,
        workflowId,
        counts: await readStateOccupancy(deps.pool, workspaceId, def),
      };
      return body;
    },
  );

  app.get<{ Params: { workspaceId: string; typeId: string }; Querystring: { workflowId?: string } }>(
    '/v1/workspaces/:workspaceId/ticket-types/:typeId/population',
    { preHandler: requireSession },
    async (request, reply) => {
      const { workspaceId, typeId } = request.params;
      // Admin-only, on state-occupancy's exact terms and for its exact reason:
      // the honest number is the whole workspace's, counted over tickets the
      // caller may not see, so there is no per-viewer variant to serve instead.
      // The door precedes the query parse here too (case 7.83's order).
      if ((await door(request, workspaceId, 'admins-only')) === null) {
        return reply.code(404).send(READ_NOT_FOUND_BODY);
      }
      const workflowId = request.query.workflowId;
      if (typeof workflowId !== 'string' || workflowId === '') {
        return reply.code(400).send(INVALID_WORKFLOW_ID_BODY);
      }
      // BOTH actor-supplied ids are resolved against the caller's workspace
      // before anything is counted, and an unknown one is the same 404 as an
      // unauthorised caller. Counting first would answer 0 for a type this
      // workspace has never defined and for a workflow belonging to the tenant
      // next door — a zero that looks like an answer, at the moment a mapping
      // dialog is deciding there is nothing to move.
      if (!(await ticketTypeExists(deps.pool, workspaceId, typeId))) {
        return reply.code(404).send(READ_NOT_FOUND_BODY);
      }
      if ((await getWorkflowDefFromProjection(deps.pool, workspaceId, workflowId)) === null) {
        return reply.code(404).send(READ_NOT_FOUND_BODY);
      }
      const body: TypePopulationResponse = {
        workspaceId,
        typeId,
        workflowId,
        count: await readTypePopulation(deps.pool, workspaceId, typeId, workflowId),
      };
      return body;
    },
  );
}
