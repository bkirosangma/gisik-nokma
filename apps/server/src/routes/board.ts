import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import type {
  BoardColumn,
  BoardResponse,
  PublishedWorkflowDef,
  TicketCard,
} from '@gisik-nokma/domain';
import type { Queryable } from '../db/queryable.js';
import type { EffectiveRole } from '../permissions/effective-role.js';
import { requireMember, workspaceOfProject } from '../read/membership.js';
import { SqlParams } from '../read/sql-params.js';
import { assembleTicketCards, PROJ_TICKET_COLUMNS, type ProjTicketRow } from '../read/ticket-cards.js';
import { visibleTicketsWhere } from '../read/visible-where.js';
import { latestWorkflowDefs } from '../read/workflow-defs.js';

/** The one body this route refuses with, and the only one. */
export const BOARD_NOT_FOUND_BODY = { error: 'not_found' } as const;

/**
 * One project's board: every state of every workflow in use as a column, each
 * holding the cards the CALLER may see.
 *
 * Exported beside the route because the route is a shell — URL in, gate, this
 * function, JSON out — and because the gate's output (`EffectiveRole`) is the
 * only thing that decides what this returns. A test can hand it a role
 * directly; nothing it does depends on Fastify.
 *
 * ## Why it takes an `EffectiveRole` rather than a user id
 *
 * The membership question is asked ONCE, at the door, by `requireMember`, and
 * its answer is threaded here. Re-resolving it inside would be a second place
 * that decides who this caller is, and the branded `EffectiveRole` is what stops
 * a caller building one by hand instead of asking.
 *
 * ## The scope clauses, and which of them is falsifiable
 *
 * `t.project_id` is the caller's URL parameter — but only after
 * `workspaceOfProject` resolved it to a workspace and `requireMember` confirmed
 * the caller belongs to THAT workspace, so it is not an unchecked id from the
 * request. `t.workspace_id` is bound beside it because `visibleTicketsWhere`'s
 * docblock asks every caller to supply the tenancy clause the predicate
 * deliberately omits: for an owner it compiles to `TRUE`, and then the caller's
 * own scope is the only thing between the owner of one workspace and the whole
 * table.
 *
 * Stated honestly: with `project_id` already present, the `workspace_id` clause
 * is NOT falsifiable by any state the shipped door can produce. Checked rather
 * than assumed — `checkProjectExists` calls `projectExists(db, env.workspaceId,
 * projectId)`, so a `ticket.created` naming a project in another workspace is
 * refused `project.unknown` at ingest, and `checkVisibilityPermission` then
 * requires the actor to be ON that project. So no reachable ledger produces a
 * `proj_tickets` row whose `project_id` and `workspace_id` disagree, and no
 * test here can redden by deleting the clause. It stays because it costs one
 * bound parameter and because the day a projection bug or an internal-door
 * append produces such a row, this query is the one that must not show it.
 *
 * ## Columns are the workflows IN USE, not every workflow defined
 *
 * The workflow set comes from the visible ticket rows, so a workspace's unused
 * workflows contribute no columns and a viewer who can see nothing gets
 * `columns: []` rather than an empty scaffold. That is deliberate — it is also
 * why an off-project member's 200 is empty rather than a full board of empty
 * columns — and it means the column set is per-VIEWER: a guest whose one
 * visible ticket sits on `wf-errands` still gets all four of that workflow's
 * states, because within a used workflow every state appears whether or not
 * anybody is in it.
 *
 * `latestWorkflowDefs` takes the resolved `workspaceId` (Task 7, ruling P14): a
 * workflow id read off a ticket row must not resolve out of a neighbouring
 * tenancy. Ids it does not know are ABSENT from the map, which is what sends
 * their tickets to the straggler pass below rather than dropping them.
 */
export async function readBoard(
  db: Queryable,
  eff: EffectiveRole,
  viewerId: string,
  workspaceId: string,
  projectId: string,
): Promise<BoardResponse> {
  const params = new SqlParams();
  const workspaceParam = params.add(workspaceId);
  const projectParam = params.add(projectId);
  const { rows } = await db.query<ProjTicketRow>(
    `SELECT ${PROJ_TICKET_COLUMNS}
       FROM proj_tickets t
       JOIN proj_visibility v ON v.ticket_id = t.ticket_id
      WHERE t.workspace_id = ${workspaceParam}
        AND t.project_id = ${projectParam}
        AND ${visibleTicketsWhere(eff, viewerId, params)}
      ORDER BY t.ticket_id`,
    params.toArray(),
  );

  const cards = await assembleTicketCards(db, viewerId, rows);
  const defs = await latestWorkflowDefs(
    db,
    workspaceId,
    rows.map((row) => row.workflow_id),
  );

  // `defs` is keyed in sorted workflow-id order (latestWorkflowDefs sorts the
  // de-duplicated input), and each def's own `states` array is the order the
  // publisher authored. So columns come out workflow-by-workflow, states in
  // definition order, cards in `ticket_id` order — a function of the data and
  // not of whichever row the database happened to return first.
  const columns: BoardColumn[] = [];
  const placed = new Set<string>();
  for (const [workflowId, def] of defs) {
    for (const state of def.states) {
      const columnCards = cards.filter(
        (card) => card.workflowId === workflowId && card.stateId === state.id,
      );
      for (const card of columnCards) {
        placed.add(card.ticketId);
      }
      columns.push({
        workflowId,
        workflowName: def.name,
        stateId: state.id,
        name: state.name,
        category: state.category,
        // Read straight off the state — `workflowStateSchema` declares
        // `blocked`, so the plan text's `(state as { blocked?: boolean })` cast
        // is dropped rather than carried: a cast there would hide the day the
        // field's type changed underneath this.
        blocked: state.blocked === true,
        cards: columnCards,
      });
    }
  }

  appendStragglerColumns(columns, cards, placed, defs);
  return { projectId, workspaceId, columns };
}

/**
 * Cards whose `(workflow, state)` no published definition names, shown under a
 * column of their own rather than dropped.
 *
 * Two ways in, and neither is currently reachable: a `state_id` absent from its
 * workflow's latest definition (Plan 3's refresh-on-publish folds every row
 * forward, owner decision 2026-08-26), or a `workflow_id` `latestWorkflowDefs`
 * could not resolve at all. The second is the reason this pass is not deleted
 * as dead code: an unresolvable workflow id yields NO columns from the loop
 * above, so without this every one of its tickets would vanish from the board
 * silently. A board that hides work it cannot classify is worse than one that
 * shows it under an ugly heading.
 *
 * The column's `name` is the bare state id — there is no definition to read a
 * human name from, and inventing one would print a label nobody authored. The
 * `category` comes from `proj_tickets.state_category`, which the reducer
 * denormalized at the time the state was entered, so it is a recorded fact
 * rather than a guess. `blocked` is `false` for the same reason the name is the
 * id: the flag lives on the definition, and there is none.
 */
function appendStragglerColumns(
  columns: BoardColumn[],
  cards: TicketCard[],
  placed: Set<string>,
  defs: Map<string, PublishedWorkflowDef>,
): void {
  const byColumn = new Map<string, TicketCard[]>();
  for (const card of cards) {
    if (placed.has(card.ticketId)) {
      continue;
    }
    const key = `${card.workflowId}:${card.stateId}`;
    const bucket = byColumn.get(key) ?? [];
    bucket.push(card);
    byColumn.set(key, bucket);
  }

  for (const key of [...byColumn.keys()].sort()) {
    const bucket = byColumn.get(key);
    if (bucket === undefined || bucket[0] === undefined) {
      continue;
    }
    const { workflowId, stateId, stateCategory } = bucket[0];
    columns.push({
      workflowId,
      workflowName: defs.get(workflowId)?.name ?? workflowId,
      stateId,
      name: stateId,
      category: stateCategory,
      blocked: false,
      cards: bucket,
    });
  }
}

/**
 * `GET /v1/projects/:projectId/board`.
 *
 * ## The gate, and why both of its refusals are 404
 *
 * Three questions in order, and the order is the contract:
 *
 * 1. `requireSession` (the preHandler) — no session is **401**, and the handler
 *    never runs. `currentUserId` exists only because this route registers it.
 * 2. `workspaceOfProject` — an unknown project id is **404**.
 * 3. `requireMember` — a caller who is not a member of THAT workspace is
 *    **404**, not 403. A 403 would confirm the project exists to somebody with
 *    no business knowing it does, so the two answers are byte-identical: same
 *    status, same body, same headers. `test/routes/board.test.ts` compares them
 *    rather than checking one status twice.
 *
 * A workspace member who is NOT on the project passes the gate and gets **200**
 * with whatever their visibility yields, which for a project-mode project is an
 * empty board. That is deliberate and it is where the boundary is: the gate
 * asks about the WORKSPACE, so a project's existence is not a secret from
 * somebody already inside the tenancy — its contents are, and the emptiness is
 * `visibleTicketsWhere` answering rather than the door.
 *
 * ## `requireSession` by parameter, not `auth` by dependency
 *
 * The plan's signature is `(app, { pool, auth })` and its snippet builds the
 * preHandler here via `makeRequireSession` imported from `../auth/routes.js` —
 * a module that exports no such thing (it is `../auth/require-session.js`, and
 * the plan repeats the wrong import at seven more sites in later tasks). Rather
 * than fix the import and keep the shape, this follows the shape every route on
 * this branch already has: the preHandler arrives as an argument, exactly as
 * `registerEventRoutes`, `registerTicketRoutes` and `registerInviteRoutes` take
 * it, so there is no version of this registration that forgets the session
 * check and still compiles. That is `app.ts`'s stated reason and it is stronger
 * than a shared `auth` object: a route reading `request.currentUserId` cannot be
 * assembled without the thing that sets it.
 */
export function registerBoardRoutes(
  app: FastifyInstance,
  deps: { pool: Queryable },
  requireSession: preHandlerHookHandler,
): void {
  app.get<{ Params: { projectId: string } }>(
    '/v1/projects/:projectId/board',
    { preHandler: requireSession },
    async (request, reply) => {
      const { projectId } = request.params;
      const viewerId = request.currentUserId;

      const workspaceId = await workspaceOfProject(deps.pool, projectId);
      if (workspaceId === null) {
        return reply.status(404).send(BOARD_NOT_FOUND_BODY);
      }
      const eff = await requireMember(deps.pool, viewerId, workspaceId);
      if (eff === null) {
        return reply.status(404).send(BOARD_NOT_FOUND_BODY);
      }
      return readBoard(deps.pool, eff, viewerId, workspaceId, projectId);
    },
  );
}
