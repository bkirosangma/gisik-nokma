import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import type { TicketRollup, TicketState } from '@gisik-nokma/domain';
import type { Queryable } from '../db/queryable.js';
import { getTicketStateFromDb } from '../projections/tickets.js';
import { stateProvenanceFor } from '../read/state-provenance.js';
import { assignedProvenanceFor } from '../read/assigned-provenance.js';
import { canSee } from '../visibility/can-see.js';
import { rollupFor, type RollupView } from '../visibility/rollup.js';
import { listVisibleTickets } from '../visibility/visible-tickets.js';

/**
 * A ticket's title, out of the claim map the reducer maintains.
 *
 * Throws rather than emitting `''`, for the reason `assembleTicketCards` throws
 * at the same fork: `ticket.created` writes `fields.title` unconditionally
 * (`applyTicketEvent`), and the door refuses a non-string one
 * (`checkTicketFieldSet`, ruling P15), so either absence means the projection
 * and the ledger disagree — and the empty string would sit exactly where a real
 * title goes.
 */
function titleOf(state: TicketState): string {
  const claim = state.fields['title'];
  if (claim === undefined) {
    throw new Error(
      `readTicket: no title claim on ticket ${state.id} — every ticket.created writes one, so proj_tickets and the ledger disagree`,
    );
  }
  if (typeof claim.value !== 'string') {
    throw new Error(
      `readTicket: the title claim on ticket ${state.id} is not a string — the door refuses that (checkTicketFieldSet), so this event did not come through it`,
    );
  }
  return claim.value;
}

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
 * ## These are `proj_visibility` rows, and they are now BESIDE the ticket, not
 * ## instead of it
 *
 * This docblock used to open "**`proj_tickets` does not exist on this branch**"
 * and defer the title to Plan 3 Task 12. That table landed; the sentence
 * outlived the condition it described, which is why it is corrected here rather
 * than deleted. The single read now serves `ticketState` (a domain
 * `TicketState`, through `getTicketStateFromDb`), `title` and `stateProvenance`
 * beside this row, and `parent.ticket` keeps this shape with a `title` added on
 * the visible arm — so the restricted-parent placeholder finally ships as "no
 * title" versus "title" and not merely as EXISTENCE-AND-ID versus
 * EXISTENCE-AND-THE-ROW (case 6.66's condition, met).
 *
 * The visibility row STAYS on the wire rather than being swapped out. Removing
 * `own_mode` / `resolved_mode` / `seq` would be a decision about what this
 * surface discloses — the allow-list below is argued column by column — and no
 * gap this change closes requires it. `listVisibleTickets` still returns the
 * same shape for the collection read (case 6.61), so the two sites still agree.
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
  | { kind: 'ticket'; id: string; title: string; ticket: TicketView }
  | { kind: 'restricted'; id: string };

/**
 * `title` on the visible branch, and its ABSENCE on the restricted branch, are
 * one decision made once (ruling P25 clause 1).
 *
 * The rule applied is `canSee` (`../visibility/can-see.ts:227`), at the call the
 * handler below already makes about the parent — the branch that chooses between
 * these two members IS the rule's answer. So the title travels on exactly the
 * arm where the viewer may read the parent, which is the arm on which a direct
 * read of that parent would serve them the same title anyway; and the restricted
 * arm has no field for a title, so a serializer cannot be talked into filling
 * one in. That is the shape `packages/app-core/src/view-types.ts:110` states as
 * "Plan 4's read shape: a restricted parent is existence-without-title,
 * structurally" — this makes the wire match it instead of leaving the client
 * unable to form either arm.
 */

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

      // The ticket's own domain state, read AFTER `canSee` said yes and scoped
      // to the workspace the path names. `getTicketStateFromDb` is the reader
      // Plan 3 Task 12 shipped for `proj_tickets`; nothing here re-expresses it.
      const state = await getTicketStateFromDb(deps.pool, workspaceId, ticketId);
      if (state === null) {
        throw new Error(
          `readTicket: proj_visibility holds ${ticketId} in workspace ${workspaceId} and proj_tickets does not — the two projections disagree`,
        );
      }

      // A SOFT-DELETED ticket is 404 on its own detail route, the same answer
      // an invisible one gets — the FAQ's *"The ticket stops appearing in
      // views"* covers this route like every list, and a ticket absent from
      // every board but reachable at its URL would be the half-state this
      // repo's read surfaces exist to refuse.
      //
      // The row is NOT gone (`getTicketStateFromDb` serves it to the engine on
      // purpose — see its docblock; that is what makes `ticket.restored`
      // possible), so this is a predicate at the ROUTE, not a filter in the
      // reader. Do not move it.
      //
      // The undo therefore does not come from a read of this route: the design
      // system's delete flow is a toast with an Undo button
      // (`design-system/interactive/desktop.dc.html:1869`), which posts
      // `ticket.restored` against the id the client already holds. If the
      // interface half ever needs to render a deleted ticket READ-BACK, that is
      // a new surface with its own decision, not a hole opened here.
      if ((state.deleted ?? null) !== null) {
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
          // The title is read INSIDE this branch, so the read itself is gated by
          // the answer rather than being filtered afterwards — there is no code
          // path on which a restricted parent's title is in a variable at all.
          const parentState = await getTicketStateFromDb(
            deps.pool,
            workspaceId,
            parentRow.ticket_id,
          );
          if (parentState === null) {
            throw new Error(
              `readTicket: proj_visibility holds parent ${parentRow.ticket_id} in workspace ${workspaceId} and proj_tickets does not — the two projections disagree`,
            );
          }
          // A soft-deleted PARENT withholds its title too, and answers the
          // `restricted` shape rather than a fourth one. The distinction this
          // branch is about is whose data is whose: the child is live and its
          // `parentId` rides on its own card, so naming the parent's ID claims
          // nothing new — but the parent's TITLE is the deleted ticket's
          // content, and the FAQ's "stops appearing in views" is exactly a
          // statement about content. `restricted` already means "there is a
          // parent here whose name you do not get", which is precisely true and
          // is not a visibility claim, so it is reused rather than re-invented.
          // (`null` would be worse: it asserts the projection resolved this
          // child as a ROOT, which is false.)
          if ((parentState.deleted ?? null) !== null) {
            parent = { kind: 'restricted', id: ticket.parent_id };
          } else {
            parent = {
              kind: 'ticket',
              id: parentRow.ticket_id,
              title: titleOf(parentState),
              ticket: toTicketView(parentRow),
            };
          }
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
      const rollupView: RollupView | null = await rollupFor(
        deps.pool,
        request.currentUserId,
        ticketId,
      );

      // TRANSLATED to `TicketRollup`, not served as the `RollupView` it arrives
      // as, and the translation is the same one `assembleTicketCards` performs
      // for every card (`read/ticket-cards.ts`). Returning `rollupFor`'s own
      // shape here put a SECOND rollup spelling on the `/v1` surface: cards
      // carried `totalChildren`/`terminalChildren`/`uncategorizedChildren` and
      // this one route carried `total`/`terminal`/`uncategorized`. The client's
      // `mapRollup` reads the first spelling and is the only rollup reader it
      // has, so this route answered a `MappingError` for every ticket that HAS
      // CHILDREN while every leaf mapped fine — a gap recorded CLOSED that was
      // closed only for the case the fixtures used.
      //
      // `RollupView` is a VISIBILITY type (it is what `rollupFor` computes,
      // restricted count and all); `TicketRollup` is the read-model the `/v1`
      // surface is defined in. Serving the former was leaking an internal
      // spelling, which is why the fix belongs here rather than in a second
      // client-side reader.
      const rollup: TicketRollup | null =
        rollupView === null
          ? null
          : {
              totalChildren: rollupView.total,
              terminalChildren: rollupView.terminal,
              uncategorizedChildren: rollupView.uncategorized,
              restrictedCount: rollupView.restrictedCount,
            };

      const provenance = await stateProvenanceFor(deps.pool, [ticketId]);
      const stateProvenance = provenance.get(ticketId);
      if (stateProvenance === undefined) {
        throw new Error(
          `readTicket: no provenance for ticket ${ticketId} — every state a ticket is in was claimed by an event, so proj_tickets and the ledger disagree`,
        );
      }

      /**
       * WHO ASSIGNED THIS TICKET, and when — the SAME reader the list already
       * uses (`read/assigned-provenance.ts`, batched by the same `DISTINCT ON`
       * shape as `stateProvenanceFor` directly above), called here because the
       * ticket SHEET can now edit the assignee and an edited field that does not
       * say who set it is the one row on that sheet which cannot be trusted.
       *
       * **This widening is deliberate and it is NOT a second door:** it is one
       * more call to an existing reader, on the existing route, beside the
       * existing call — the list route has served this field on every card since
       * it existed (`read-models.ts`'s `TicketCard.assignedProvenance`), and the
       * single read was the one place it did not.
       *
       * The two absences the reader leaves to its CALLER (see its docblock) are
       * answered the way `assembleListCards` answers them, so the two reads
       * cannot disagree: an unassigned ticket answers `null` — which is the
       * whole truth for "nobody is assigned, and nobody ever was" AND for "the
       * last claim was a `null` unassignment" — while an assignee with NO
       * `ticket.assigned` behind it is a projection/ledger disagreement and
       * throws rather than serving an unattributed assignment.
       */
      const assigned = await assignedProvenanceFor(deps.pool, [ticketId]);
      const assignedProvenance = assigned.get(ticketId) ?? null;
      if (state.assigneeId !== null && assignedProvenance === null) {
        throw new Error(
          `readTicket: ticket ${ticketId} carries assignee ${state.assigneeId} with no ticket.assigned behind it — proj_tickets and the ledger disagree`,
        );
      }

      return {
        ticket: toTicketView(ticket),
        ticketState: state,
        title: titleOf(state),
        stateProvenance,
        assignedProvenance,
        parent,
        rollup,
      };
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
