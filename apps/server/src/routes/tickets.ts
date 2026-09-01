import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import type { Queryable } from '../db/queryable.js';
import { canSee } from '../visibility/can-see.js';
import { rollupFor, type RollupView } from '../visibility/rollup.js';
import { listVisibleTickets } from '../visibility/visible-tickets.js';

/**
 * The one body every refusal on this surface carries.
 *
 * Invisible and nonexistent must be the SAME answer or the difference between
 * them is an existence oracle: a member who could tell "you may not see this"
 * from "this does not exist" could enumerate another project's ticket ids by
 * probing. So there is exactly one 404 body here, built once, and every branch
 * below returns this object rather than composing its own.
 */
export const NOT_FOUND_BODY = { error: 'not_found' } as const;

/**
 * A ticket row as this branch can serve it.
 *
 * ## These are `proj_visibility` rows, and that is a fact about today
 *
 * The plan text has this route serving `proj_tickets` rows — `{ ticket: <row>,
 * parent: { kind: 'ticket', id, title } }`. **`proj_tickets` does not exist on
 * this branch.** Plan 3 Task 12 owns it, no migration for it is invented here
 * (a table this plan authored would be a second, competing definition of
 * another plan's projection), and no other table stores a ticket title: the
 * title lives in the `ticket.created` payload and is edited by
 * `ticket.field_set`, so producing one would mean computing `proj_tickets`'
 * head state inside a route — the same competing definition, written in a
 * worse place.
 *
 * `listVisibleTickets` already returns `proj_visibility` rows for exactly this
 * reason (case 6.61), so the single read returns the same shape as the list,
 * and a test pins that the two agree. When `proj_tickets` lands, both sites
 * substitute the joined row together or that test reddens.
 *
 * The consequence for T8's own contract, stated rather than hidden: the
 * restricted-parent placeholder ships as EXISTENCE-AND-ID versus
 * EXISTENCE-AND-THE-ROW, not as "no title" versus "title". Recorded as case
 * 6.66, owner Plan 3 Task 12.
 */
type VisibilityRow = {
  ticket_id: string;
  workspace_id: string;
  project_id: string;
  parent_id: string | null;
  own_mode: string;
  own_user_ids: string[];
  resolved_mode: string;
  resolved_user_ids: string[];
  resolved_from: string;
  seq: number;
};

export type TicketView = {
  ticket_id: string;
  workspace_id: string;
  project_id: string;
  parent_id: string | null;
  own_mode: string;
  resolved_mode: string;
  seq: number;
};

/**
 * The columns a ticket row goes out with — an ALLOW-LIST, not `SELECT *`.
 *
 * ## `resolved_from` is cut, and it is the reason this function exists
 *
 * This route is the first thing in the product that serves a `proj_visibility`
 * row over HTTP (Task 7 returned them in-process; `contests-route.ts` serves
 * `proj_contested`), so `SELECT *` would have put every column on the wire —
 * and `resolved_from` is a TICKET ID. It names the nearest **authored
 * ancestor**, which is deliberately not the immediate parent (case 6.9: a
 * grandchild inheriting through an unauthored parent names the grandparent). So
 * it is an existence disclosure about a ticket the viewer may not see and that
 * is not their parent — outside the ONE leak spec §6 authorizes, which is
 * bounded to the parent and reachable only through a child already visible.
 * Reachable today, not hypothetical: a child in project R under a parent in
 * project Q inheriting a Q grandparent's authored mode is visible to an R
 * member who can see neither ancestor, and nothing refuses a cross-project
 * parent (case 6.57).
 *
 * `own_user_ids` and `resolved_user_ids` are cut for a smaller reason: they are
 * an explicit audience ROSTER, a disclosure no plan authorized, and leaving
 * them in would be a second decision made by the shape of a `SELECT *` rather
 * than by anyone.
 *
 * `parent_id` STAYS, and is exactly the authorized leak: it is the same fact as
 * `parent: { kind: 'restricted', id }`, bounded to the parent, reachable only
 * through a visible child. On a `parent.ticket` it discloses the grandparent —
 * which a direct read of that parent, which the viewer may do, already
 * discloses.
 *
 * ## This is NOT a licence to trim the history endpoint
 *
 * `/events` serves full envelopes, and `ticket.created` / `ticket.reparented`
 * payloads carry ancestor ids too. Those are PROVENANCE — an attributed claim
 * somebody made — and spec §6 says provenance is never redacted from someone
 * entitled to the state. `resolved_from` is not provenance: it is derived
 * projection state that happens to be a foreign key, which nobody claimed and
 * which the ledger would answer differently. Cut derived state; never cut a
 * claim.
 */
function toTicketView(row: VisibilityRow): TicketView {
  return {
    ticket_id: row.ticket_id,
    workspace_id: row.workspace_id,
    project_id: row.project_id,
    parent_id: row.parent_id,
    own_mode: row.own_mode,
    resolved_mode: row.resolved_mode,
    seq: row.seq,
  };
}

/**
 * What a child says about its parent.
 *
 * Three answers, and the third is the deliberate one:
 *
 * - `null` — this ticket claims no parent, **or** the parent it names has no
 *   row at all. Those are one answer on purpose. A ticket whose `parent_id`
 *   points at nothing is resolved as a ROOT by `proj_visibility` (case 6.9), so
 *   the projection has already decided it has no parent; answering
 *   `{ kind: 'restricted' }` there would assert the existence of a ticket the
 *   system has no evidence for — an invented existence leak, which is the exact
 *   inverse of what this route is for.
 * - `{ kind: 'ticket', id, ticket }` — the viewer may see the parent, so they
 *   get it: the same row a direct read of that parent would serve.
 * - `{ kind: 'restricted', id }` — the parent EXISTS and the viewer may not see
 *   it. Existence and id, nothing else. This is the ONE deliberate existence
 *   leak in the product (spec §6), and it is reachable only through a child the
 *   viewer can already see. It is here because the alternative is worse: a
 *   child silently posing as a root would be the system lying about the shape
 *   of the work.
 *
 * The union is discriminated so the restricted branch STRUCTURALLY cannot carry
 * the parent's row — there is no field on it to leak through, and a serializer
 * cannot be talked into filling one in.
 */
export type ParentRef =
  | { kind: 'ticket'; id: string; ticket: TicketView }
  | { kind: 'restricted'; id: string };

/**
 * One ticket's row IN THE NAMED WORKSPACE, or `undefined`.
 *
 * The `workspace_id` clause is why the route's `:workspaceId` parameter means
 * something. `canSee` deliberately takes no workspace — it resolves the
 * viewer's role in the workspace the TICKET's own row names — which is exactly
 * right for the visibility decision and leaves the URL free to lie: someone who
 * belongs to two workspaces would otherwise read workspace B's ticket through a
 * workspace-A path, and every caller that trusted the path (a client cache, a
 * breadcrumb, a later rollup) would file it under the wrong workspace. The
 * mismatch answers the same 404 as everything else, so it is not an oracle
 * either.
 */
async function loadTicketRow(
  db: Queryable,
  workspaceId: string,
  ticketId: string,
): Promise<VisibilityRow | undefined> {
  const { rows } = await db.query<VisibilityRow>(
    `SELECT ticket_id, workspace_id, project_id, parent_id,
            own_mode, own_user_ids, resolved_mode, resolved_user_ids, resolved_from, seq
     FROM proj_visibility WHERE ticket_id = $1 AND workspace_id = $2`,
    [ticketId, workspaceId],
  );
  return rows[0];
}

/** A stored ledger row, as pg hands it back — both clocks are `timestamptz`, so both arrive as `Date`. */
type LedgerRow = {
  id: string;
  workspace_id: string;
  entity_kind: string;
  entity_id: string;
  type: string;
  version: number;
  payload: unknown;
  actor_id: string;
  origin: string;
  client_time: Date;
  server_time: Date;
  seq: number;
  workspace_seq: number;
};

/**
 * A ledger row on the wire. Every field of the stored event, unchanged.
 *
 * ## There is no redacting path, and that is the point
 *
 * Provenance is never withheld from someone entitled to the state (spec §6).
 * `actor_id` goes out even when the actor shares no project — indeed no
 * anything — with the viewer, and both clocks go out beside each other so the
 * client/server skew the product reports stays visible. There is deliberately
 * no second serializer here that "anonymizes": a redacting path that exists is
 * a path something can drift into.
 *
 * Both instants are rendered with `.toISOString()` rather than left to the JSON
 * serializer, for the reason `sync/contests-route.ts` gives at the same spot:
 * the session runs in Asia/Kolkata, and any rendering that is not the ISO
 * instant would put a `+05:30` label into a field every client parses as an
 * absolute moment. The value survives untouched; the offset label the
 * submitting device happened to attach does not, and never was a fact.
 */
export type LedgerEventView = Omit<LedgerRow, 'client_time' | 'server_time'> & {
  client_time: string;
  server_time: string;
};

function toEventView(row: LedgerRow): LedgerEventView {
  return {
    ...row,
    client_time: row.client_time.toISOString(),
    server_time: row.server_time.toISOString(),
  };
}

/**
 * The ticket read surface (Plan 4 Task 8) — a list, a single read, and one
 * ticket's history, all three enforcing visibility server-side.
 *
 * ## Every refusal on this surface is the same 404
 *
 * A direct read of an invisible ticket is `404 {error:'not_found'}`,
 * indistinguishable from a read of an id that never existed: same status, same
 * body, same headers. That is the whole reason a member cannot probe another
 * project's ids. The list is the same rule expressed the other way — an
 * outsider gets `200 { tickets: [] }`, because "you may not see this" and
 * "there is nothing here" must not be tellable apart on a collection either.
 *
 * ## The visibility decision is `canSee`'s, always
 *
 * No SQL here re-states who may see what. `canSee` resolves the viewer's
 * `EffectiveRole` itself (never a direct `proj_memberships` read, whose
 * project-scope rows survive a revocation by design) and answers `false` alike
 * for an invisible ticket and one with no row. This route adds exactly one
 * question of its own — is the ticket in the workspace the URL names — and that
 * is a question about identity, not about audience.
 *
 * ## `requireSession` arrives by parameter
 *
 * Same shape as `registerEventRoutes` and `registerContestsRoute`, and for the
 * same structural reason: these handlers read `request.currentUserId`, which is
 * written only by that preHandler, so there is no version of the assembly that
 * forgets it and still compiles. The plan text had this function taking `Auth`
 * and building its own — a second `makeRequireSession` in the app, which would
 * drift from the one every other route shares.
 */
export function registerTicketRoutes(
  app: FastifyInstance,
  deps: { pool: Queryable },
  requireSession: preHandlerHookHandler,
): void {
  app.get<{ Params: { workspaceId: string } }>(
    '/v1/workspaces/:workspaceId/tickets',
    { preHandler: requireSession },
    async (request) => {
      const rows = await listVisibleTickets(
        deps.pool,
        request.currentUserId,
        request.params.workspaceId,
      );
      // The one cast on this surface, and it is at the boundary on purpose.
      // `listVisibleTickets` declares `Array<Record<string, unknown>>`
      // deliberately loosely (case 6.61) because the row it returns changes
      // shape when `proj_tickets` lands. Its query is NOT touched here — case
      // 6.65's role/mode asymmetry lives in it, and loosening either side turns
      // a drift into a grant — so the column choice is made HERE, in the one
      // mapper both routes go through.
      const tickets = (rows as unknown as VisibilityRow[]).map(toTicketView);
      return { tickets };
    },
  );

  app.get<{ Params: { workspaceId: string; ticketId: string } }>(
    '/v1/workspaces/:workspaceId/tickets/:ticketId',
    { preHandler: requireSession },
    async (request, reply) => {
      const { workspaceId, ticketId } = request.params;
      const ticket = await loadTicketRow(deps.pool, workspaceId, ticketId);
      // Absent, or in some other workspace than the one the path names.
      if (ticket === undefined) {
        return reply.code(404).send(NOT_FOUND_BODY);
      }
      if (!(await canSee(deps.pool, request.currentUserId, ticketId))) {
        return reply.code(404).send(NOT_FOUND_BODY);
      }

      let parent: ParentRef | null = null;
      if (ticket.parent_id !== null) {
        const parentRow = await loadTicketRow(deps.pool, workspaceId, ticket.parent_id);
        if (parentRow === undefined) {
          // A parent_id naming no row. The projection already resolved this
          // ticket as a root; claiming a restricted parent would invent one.
          parent = null;
        } else if (await canSee(deps.pool, request.currentUserId, ticket.parent_id)) {
          parent = { kind: 'ticket', id: parentRow.ticket_id, ticket: toTicketView(parentRow) };
        } else {
          parent = { kind: 'restricted', id: ticket.parent_id };
        }
      }

      // AFTER both guards, and that order is load-bearing rather than tidy:
      // `rollupFor` performs no visibility check of its own, so asking it above
      // the guards would disclose a parent's child count to someone answered
      // 404. The leak is NOT observable through the responses — the 404 body is
      // fixed and identical either way — so it is recorded (case 6.85) rather
      // than pinned by a test that could only pass for the wrong reason.
      const rollup: RollupView | null = await rollupFor(
        deps.pool,
        request.currentUserId,
        ticketId,
      );

      return { ticket: toTicketView(ticket), parent, rollup };
    },
  );

  app.get<{ Params: { workspaceId: string; ticketId: string } }>(
    '/v1/workspaces/:workspaceId/tickets/:ticketId/events',
    { preHandler: requireSession },
    async (request, reply) => {
      const { workspaceId, ticketId } = request.params;
      // The same two guards, in the same order, answering the same body: the
      // history of a ticket you may not see is not a different question from
      // the ticket you may not see.
      if ((await loadTicketRow(deps.pool, workspaceId, ticketId)) === undefined) {
        return reply.code(404).send(NOT_FOUND_BODY);
      }
      if (!(await canSee(deps.pool, request.currentUserId, ticketId))) {
        return reply.code(404).send(NOT_FOUND_BODY);
      }

      // The history view IS the ledger, filtered (spec §3) — ordered by the
      // per-entity sequence, which is this entity's own history in the order it
      // was made.
      const { rows } = await deps.pool.query<LedgerRow>(
        `SELECT id, workspace_id, entity_kind, entity_id, type, version, payload,
                actor_id, origin, client_time, server_time, seq, workspace_seq
         FROM events
         WHERE entity_kind = 'ticket' AND entity_id = $1
         ORDER BY seq`,
        [ticketId],
      );
      return { events: rows.map(toEventView) };
    },
  );
}
