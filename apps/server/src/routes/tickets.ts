import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import { ticketKey, type TicketRollup, type TicketState } from '@gisik-nokma/domain';
import type { Queryable } from '../db/queryable.js';
import { getTicketStateFromDb } from '../projections/tickets.js';
import { ticketIsLive } from '../read/live-ticket.js';
import { stateProvenanceFor } from '../read/state-provenance.js';
import { assignedProvenanceFor } from '../read/assigned-provenance.js';
import { listTicketAttachments } from '../attachments/attachment-repo.js';
import { sanitizeFilename } from '../attachments/filename.js';
import { listTicketComments } from '../read/ticket-comments.js';
import { canSee } from '../visibility/can-see.js';
import { targetSight, withholdEvent, withholdLinks } from '../visibility/withhold-link-targets.js';
import { rollupFor, type RollupView } from '../visibility/rollup.js';
import { listVisibleTickets } from '../visibility/visible-tickets.js';
import { ticketNumber } from '../read/ticket-numbers.js';
import { projectPrefixesInWorkspace } from '../read/visible-projects.js';
import { workspaceIdentityFromLedger } from '../workspaces/workspace-name.js';
import { EPIC_RANK, MAX_ANCESTRY_DEPTH } from '../read/ancestry.js';

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
  | { kind: 'ticket'; id: string; title: string; key: string | null; ticket: TicketView }
  | { kind: 'restricted'; id: string };

/**
 * The ticket's GRANDPARENT, for the sheet's breadcrumb chain — the same three
 * answers `ParentRef` gives, and deliberately one field SHORTER.
 *
 * **It drops `ticket: TicketView`, and that is a decision rather than an
 * oversight.** That member is the `proj_visibility` row — `own_user_ids` and
 * `resolved_user_ids` among its columns — and the client never reads it: the
 * sheet's `Who can see this` section maps the TICKET's own view
 * (`mapTicketRead` → `mapTicketVisibility(record['ticket'])`), and the parent's
 * copy is dropped on arrival by `mapParentRef`, which reads exactly `kind`,
 * `id` and `title`. So serving it for the grandparent would add an audience
 * roster to the wire for a reader that does not exist — the disclosure this
 * repo refuses by name (`routes/tickets.ts`'s own note that an explicit roster
 * is *"a disclosure no plan authorized"*).
 *
 * The crumb needs the ancestor's NAME and a way to open it. Both are here; the
 * audience is not. `mapParentRef` maps this shape unchanged, so the client
 * carries no second reader for it.
 */
export type AncestorRef =
  | { kind: 'ticket'; id: string; title: string }
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

/**
 * A stored ledger row, as pg hands it back — both clocks are `timestamptz`, so
 * both arrive as `Date`.
 *
 * EXPORTED (Plan 2 of the notes series) so the note-events route declares its
 * result against the same type rather than a hand-copied twin. The column list
 * in the two SELECTs is deliberately NOT shared — case 18.075 is the drift pin
 * that compares what the two routes actually send, and a shared column list
 * would make that comparison vacuous.
 */
export type LedgerRow = {
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

export function toEventView(row: LedgerRow): LedgerEventView {
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

      // P3 — THE TWO PREFIXES ARE READ **BEFORE** THE PARENT BRANCH, because the
      // parent crumb now carries a key and composing one needs them. They are
      // the same two reads the ticket's OWN key uses a few lines below, hoisted
      // rather than duplicated: `projectPrefixesInWorkspace` answers the whole
      // workspace in one call, so the parent's key costs ONE extra read
      // (`ticketNumber` for the parent) and not a second prefix lookup. The
      // ticket's own `number` is still read where it was — it is not needed
      // here, and reading it early would be a read that might not be used.
      const identity = await workspaceIdentityFromLedger(deps.pool, workspaceId);
      const prefixes = await projectPrefixesInWorkspace(deps.pool, workspaceId);
      const projectPrefix = prefixes.get(state.projectId) ?? null;

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
            // P3 — the parent's KEY, composed exactly as the ticket's own is
            // (same two prefixes, same `ticketNumber`, same `ticketKey`), so the
            // crumb can read `KEY Title` as the prototype's does
            // (`desktop.dc.html:3417`). `null` when the number falls outside the
            // snapshot the number is derived from — never a refusal, per
            // `read/ticket-numbers.ts`'s ruling, and never a made-up number.
            const parentNumber = await ticketNumber(deps.pool, workspaceId, parentRow.ticket_id);
            const parentKey =
              identity.prefix === null || projectPrefix === null || parentNumber === null
                ? null
                : ticketKey(identity.prefix, projectPrefix, parentNumber);
            parent = {
              kind: 'ticket',
              id: parentRow.ticket_id,
              title: titleOf(parentState),
              key: parentKey,
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

      /**
       * THE TICKET'S KEY — `CCSO-1183` — composed here because it is a fact about
       * three LEDGER reads and about none of the rows this handler already has.
       *
       * **The owner's spec (2026-09-20) is `workspacePrefix + projectPrefix +
       * '-' + number`, and every one of the three is derived rather than
       * stored.** The two prefixes come from readers that are already tested
       * and already served on `GET /v1/me/workspaces`; the number is the
       * ticket's position among its project's creations by `workspace_seq`
       * (`read/ticket-numbers.ts`, which explains why it cannot be a column).
       * Composing on the SERVER rather than shipping three numbers for the
       * client to join is deliberate: it keeps ONE composer — `ticketKey`,
       * whose own docblock says *"there is nothing for a caller to forget to
       * pass"* — and it means the sheet needs no new host props to render the
       * crumb.
       *
       * ## Every absence is `null`, and NOT a refusal
       *
       * `ticketNumber` returns `null` when the ticket has no creation position
       * — which is the snapshot-bounded case — and `read/ticket-numbers.ts`
       * records the ruling: *"a key is not worth refusing a ticket read over,
       * and inventing a number would make the key name a ticket that does not
       * exist."* The two prefixes are total for a named workspace and a listed
       * project, but `workspaceIdentityFromLedger` answers `null` for a
       * workspace with no `workspace.created` at all, and the project map is
       * keyed by id — so both are checked rather than asserted, and the crumb
       * renders an absence instead of a key assembled from a hole.
       */
      // (`identity`, `prefixes` and `projectPrefix` are read above, before the
      // parent branch — see the note there. Only the NUMBER is this ticket's.)
      const number = await ticketNumber(deps.pool, workspaceId, ticketId);
      const key =
        identity.prefix === null || projectPrefix === null || number === null
          ? null
          : ticketKey(identity.prefix, projectPrefix, number);

      /**
       * THE GRANDPARENT — the nearest PROPER ancestor whose type carries the
       * epic rank, or `null` when there is none.
       *
       * ## Why this walks with `canSee` instead of calling `epicAncestors`
       *
       * `routes/list.ts` groups a whole PAGE by epic with one recursive CTE,
       * and that CTE carries `visibleTicketsWhere` — a SQL visibility
       * expression. **This route may not have one.** Its own docblock is
       * explicit (`:309-316`): *"The visibility decision is `canSee`'s,
       * always. No SQL here re-states who may see what."*
       *
       * So the walk is the `parent` branch directly above, repeated: **the same
       * `loadTicketRow` existence test FIRST**, then the same `canSee`, the
       * same `getTicketStateFromDb`, the same soft-delete arm, the same
       * `restricted` shape for an ancestor this viewer may not see. **No
       * visibility rule is restated** — each hop asks `canSee` the question it
       * already answers — and the two reads agree by construction because they
       * are the same calls.
       *
       * ⚠ **THE ORDER IS NOT DECORATION AND THIS SENTENCE ONCE OMITTED IT.** An
       * earlier version of this docblock said the walk repeated the parent
       * branch while the code asked `canSee` FIRST and never tested the row —
       * and an independent reviewer caught that the claim was false of the code
       * beneath it. The consequences were not cosmetic: see the existence test
       * in the loop for what that ordering was emitting.
       *
       * ## PROPER ancestor, unlike the list's walk
       *
       * `epicAncestorOf` is ancestor-OR-SELF, because a board lane legitimately
       * groups an epic's own card under that epic. A CRUMB is different: the
       * chain `workspace › project › epic › parent › ticket` names layers
       * ABOVE the ticket, so a ticket that IS an epic must not appear as its
       * own grandparent. The walk therefore starts at `state.parentId` and
       * never considers `ticketId` itself.
       *
       * Depth is capped by `MAX_ANCESTRY_DEPTH`, shared with the list walk so
       * the two cannot disagree about how deep the product's hierarchy goes. A
       * chain that hits the cap answers `null` — the same absence as "no epic",
       * which is honest: this read did not find one, and it does not claim
       * there is none.
       */
      // ⚠ THE RANK QUERY IS GUARDED ON THERE BEING SOMETHING TO CLIMB FROM, and
      // that is not premature optimisation on a route the owner has open. A
      // ticket with no parent never enters the walk below, so its `epic` is
      // `null` whatever this set holds — the query would be a round trip whose
      // answer nothing reads, on every root ticket's sheet open. The set stays
      // EMPTY rather than unset, so the walk's own test is unchanged and this
      // remains one code path rather than two.
      const epicTypeIds = new Set<string>();
      if (state.parentId !== null) {
        const { rows: epicTypeRows } = await deps.pool.query<{ type_id: string }>(
          `SELECT type_id FROM proj_ticket_types WHERE workspace_id = $1 AND rank = $2`,
          [workspaceId, EPIC_RANK],
        );
        for (const row of epicTypeRows) {
          epicTypeIds.add(row.type_id);
        }
      }

      let epic: AncestorRef | null = null;
      let cursor = state.parentId;
      let depth = 0;
      while (cursor !== null && depth < MAX_ANCESTRY_DEPTH) {
        // ⚠ EXISTENCE IS ASKED FIRST, AND THE ORDER IS THE WHOLE OF CASE 6.68.
        // This walk originally asked `canSee` here and nothing else, which was a
        // defect an independent reviewer caught: **`canSee` answers `false` for
        // an invisible ticket AND for a ticket with no row** (its own docblock:
        // *"Unknown and invisible are the same answer"*), so a `parent_id`
        // naming a ticket that was never created took the `restricted` arm on
        // the first hop and this route emitted `{kind:'restricted', id:<never
        // created>}` — **asserting the existence of a ticket the system has no
        // evidence for**, which is the inverse leak `tickets-read.test.ts:419`
        // exists to prevent, and the authority omits the crumb entirely in that
        // case (`desktop.dc.html:3416-3419`, `if (p) chain.push(...)`, no else).
        //
        // The parent branch directly above orders it this way, and that is what
        // makes the docblock's claim about it true rather than merely intended.
        // A dangling id breaks the walk: `proj_visibility` already resolved such
        // a child as a ROOT (case 6.9), so the chain genuinely ends here and
        // `null` is the answer the projection gave.
        const row = await loadTicketRow(deps.pool, workspaceId, cursor);
        if (row === undefined) {
          break;
        }
        if (!(await canSee(deps.pool, request.currentUserId, cursor))) {
          epic = { kind: 'restricted', id: cursor };
          break;
        }
        const ancestor = await getTicketStateFromDb(deps.pool, workspaceId, cursor);
        if (ancestor === null) {
          throw new Error(
            `readTicket: proj_visibility holds ancestor ${cursor} in workspace ${workspaceId} and proj_tickets does not — the two projections disagree`,
          );
        }
        // An ancestor this viewer may not be told the TITLE of, for the same
        // reason the parent branch above reuses `restricted` rather than
        // inventing a fourth arm: `restricted` already means exactly "there is
        // one here whose name you do not get".
        if ((ancestor.deleted ?? null) !== null) {
          epic = { kind: 'restricted', id: cursor };
          break;
        }
        if (epicTypeIds.has(ancestor.typeId)) {
          epic = { kind: 'ticket', id: cursor, title: titleOf(ancestor) };
          break;
        }
        cursor = ancestor.parentId;
        depth += 1;
      }

      // Spec A §2.4: the folded links are the engine's whole truth; a reader gets
      // only the targets they can see, and no key at all when none remain (the
      // reducer's absent-not-empty shape), so nothing counts a hidden one. The
      // one predicate every door uses (`withhold-link-targets.ts`, typed-links T4b).
      const servedState: TicketState = await withholdLinks(state, targetSight(deps.pool, request.currentUserId));

      return {
        ticket: toTicketView(ticket),
        ticketState: servedState,
        title: titleOf(state),
        stateProvenance,
        assignedProvenance,
        parent,
        rollup,
        key,
        epic,
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
      // A link whose target this viewer cannot see goes out at its own seq
      // with `targetId: null`, and a contest of such a claim with the gate's
      // cause (typed-links T4b, spec A §2.4): never skipped, so there is no gap.
      const sees = targetSight(deps.pool, request.currentUserId);
      const events: LedgerEventView[] = [];
      for (const row of rows) events.push(await withholdEvent(toEventView(row), sees));
      return { events };
    },
  );

  /**
   * One ticket's attachments — the read `listTicketAttachments`
   * (`../attachments/attachment-repo.ts:76`) has been waiting for.
   *
   * ## Why this door exists at all
   *
   * `listTicketAttachments` was written and tested by Plan 7 and had **zero
   * production callers**: every reference in the tree was a test. So a ticket's
   * files reached no surface — `TicketSheetProps` has accepted an `attachments`
   * prop since Plan 6 (`packages/app-core/src/views/ticket-sheet.tsx`), and the
   * product's single mount never passed it. Nothing here is new machinery: the
   * rows come from the table the upload door writes, ordered `created_at, id` —
   * creation order, which is the order the list renders.
   *
   * ## The predicate is the one the door above uses, and there is exactly one
   *
   * Same guards, same order, same body: `loadTicketRow` → 404, then `canSee`
   * → 404, and — since the soft-delete change — `ticketIsLive` → 404, which is
   * the THIRD guard the DETAIL route carries and this pair did not. That is
   * deliberate rather than convenient — "may this caller see this ticket" is
   * asked in exactly one place (`../visibility/can-see.ts:227`), and a second,
   * weaker answer to it is this project's signature failure. The deletion
   * question is a DIFFERENT one and is asked in its own one place
   * (`../read/live-ticket.ts`), because folding it into `canSee` would break
   * that predicate's cross-check and its callers — see `visible-where.ts`.
   *
   * ⚠ **The ORDER of the first two is a copy, not a measurement** — recorded
   * because a reader would otherwise take "in the same order" for a witnessed
   * property; the note below is the review that could not falsify it. The third
   * guard is placed AFTER both for the reason that note gives: its refusal must
   * be indistinguishable from theirs, and it is by construction, since all
   * three return the same `NOT_FOUND_BODY`. ⚠ It is a THIRD query on a request
   * that already made two; if the order ever matters for cost rather than for
   * answers, this is the line to move, and `ticketIsLive`'s own docblock says
   * why it is a separate read rather than a field off the state the detail
   * route already holds.
   *
   * `ticket-attachments.test.ts` holds the doors to AGREEMENT (case 16.52)
   * rather than asserting the sameness in prose: an unseen ticket and a
   * nonexistent one get the same status and the same bytes from both doors,
   * behind a positive control that both answer for a ticket the caller may see.
   * The tombstoned arm is case 16.96 in
   * `test/integration/soft-deleted-attachments.test.ts`, which also pins the
   * HISTORY doors' deliberate exception.
   *
   * ⚠ **And the ORDER is a copy, not a measurement — recorded because a reader
   * would otherwise take "in the same order" for a witnessed property.**
   * Independent review could not falsify it: swapping the two guards survives
   * every suite in this change, because `canSee` on a foreign-workspace ticket
   * the caller does belong to answers `true` and the `loadTicketRow` refusal
   * follows either way, so the response is identical under both orders. The
   * order is kept because it is the door's, and its one visible effect is the
   * QUERY COUNT on a ticket that exists (the cheap existence check first), which
   * nothing asserts.
   *
   * ## What is served, and why the wire carries five fields and no `kind`
   *
   * Each row is `{attachmentId, filename, mime, size, sha256}` — the five fields
   * the view's own upload arm names (`packages/app-core/src/views/attachment-list.tsx`,
   * `AttachmentListEntry`), so the client's mapper is a field-for-field copy plus
   * the `kind: 'upload'` literal. It is deliberately NOT the upload door's
   * response shape, which also carries `url`: that door answers a POST and must
   * say where the bytes it just took now live, while here the id is the address
   * and the list item derives its own href.
   *
   * ## The arm this door does NOT serve, named rather than left to inference
   *
   * `attachment.added` (`packages/domain/src/events/ticket-events.ts`) is a
   * discriminated union carrying a Drive REFERENCE as well as an upload, and
   * `AttachmentListEntry` renders both. This route cannot serve the reference
   * arm and does not pretend to: the `attachments` table has no kind column, and
   * its only writer is the upload door. **The row and the event are two facts,
   * not one** — a row exists the moment bytes land, whereas the event is the
   * client's claim about them, which `routes/attachments.ts` says it expects
   * afterwards and which `Features.md` §9 records the web client does not post
   * at all today. So a ticket whose reference arrived as a ledger EVENT shows
   * nothing in this list. **That is not a live absence at this commit** —
   * measured: **no PRODUCTION code emits it.** The runtime composer DOES exist —
   * `composeDriveReferenceAdded`
   * (`packages/editor/src/drive/attachment-claims.ts:41`), exported from the
   * package index, whose own docblock says *"the client submits it through
   * `POST /v1/events` like any other claim"* — but its only callers are tests
   * (swept at this commit), and `openDrivePicker` / `toDriveReference` have no
   * production caller either. ⚠ **CORRECTED 2026-09-20: this sentence's
   * exclusion list named only the domain's schema, the editor's TYPES and
   * `attachment-list.tsx`'s union, and it missed that composer — the conclusion
   * holds, the enumeration did not.** So it becomes a live absence the day a
   * producer lands, and it would become one
   * silently, because the list omits it rather than refusing. **RECORDED, not
   * fixed. Owner: whoever gives the `attachments` table a kind column, or emits
   * the reference arm for the first time — those are one task, not two.**
   *
   * ## The filename is sanitized here, exactly as it is at the download door
   *
   * The upload door sanitizes on the way in, so a row this product wrote is
   * already clean. It runs again here for the row some OTHER writer put there —
   * the same fixture, and the same argument, that
   * `test/routes/attachments-download.test.ts` makes for its own
   * re-sanitization. The alternative is that the list shows `bad"name.pdf` while
   * the download names the same object `badname.pdf`: two surfaces of one row
   * disagreeing about what it is called. Case 16.53.
   *
   * ## Empty is a 200, and that is load-bearing
   *
   * A visible ticket with no attachments answers `{attachments: []}`; only the
   * guards answer 404. `AttachmentList` returns `null` on an empty list —
   * *"must not promise there are none"* — so the one answer this door must never
   * give is `[]` for a ticket the caller may not see: that is precisely the
   * drawn absence the component's own docblock refuses to make. Case 16.49 pins
   * the pair, the empty list and the refusal, in one run.
   */
  app.get<{ Params: { workspaceId: string; ticketId: string } }>(
    '/v1/workspaces/:workspaceId/tickets/:ticketId/attachments',
    { preHandler: requireSession },
    async (request, reply) => {
      const { workspaceId, ticketId } = request.params;
      // The same two guards, in the same order, answering the same body.
      if ((await loadTicketRow(deps.pool, workspaceId, ticketId)) === undefined) {
        return reply.code(404).send(NOT_FOUND_BODY);
      }
      if (!(await canSee(deps.pool, request.currentUserId, ticketId))) {
        return reply.code(404).send(NOT_FOUND_BODY);
      }
      // …and the THIRD, which the DETAIL route above carries and this pair did
      // not. `canSee` is the visibility predicate and does not mean "not
      // deleted" — `read/visible-where.ts` says so in its own words — so until
      // this landed a tombstoned ticket kept serving its file list while the
      // ticket itself answered 404: a ticket absent from every view and
      // reachable at its URL, which is the half-state the detail route's
      // docblock refuses by name.
      //
      // `ticketIsLive` is `LIVE_TICKET_WHERE` asked at a route, and NOT a
      // widened `canSee`: folding deletion into the visibility predicate breaks
      // the `canSeeResolved` cross-check AND makes `listVisibleTickets` — whose
      // SELECT has no `proj_tickets` in its FROM — a runtime "missing FROM-clause
      // entry". `read/live-ticket.ts` carries both reasons.
      if (!(await ticketIsLive(deps.pool, workspaceId, ticketId))) {
        return reply.code(404).send(NOT_FOUND_BODY);
      }

      const rows = await listTicketAttachments(deps.pool, ticketId);
      return {
        attachments: rows.map((row) => ({
          attachmentId: row.id,
          filename: sanitizeFilename(row.filename),
          mime: row.mime,
          size: row.size,
          sha256: row.sha256,
        })),
      };
    },
  );

  /**
   * One ticket's comments — the read `comment.added` has never had.
   *
   * `comment.added` was fully wired (vocabulary, reducer, mention fan-out,
   * sync, a `require-comment` seed rule) and reached no surface: the only place
   * its text landed was `proj_search.comments`, a CONCATENATED TEXT column built
   * for full-text search with no author, no time and no per-comment identity.
   * It cannot serve a thread and is not press-ganged into one.
   *
   * ## THE THIRD GUARD, AND WHY IT IS NOT IN THE SELECT
   *
   * The two guards above are the ledger's and the attachments read's — same
   * order, same body, because "may this caller see this ticket" is asked in
   * exactly one place (`../visibility/can-see.ts:227`). The THIRD is the
   * deletion question, which is a different one and is asked in its own one
   * place (`../read/live-ticket.ts`): **a ticket the product has stopped showing
   * must not serve its thread either**, and a ticket absent from every view but
   * reachable at its URL is the half-state the detail route's docblock refuses
   * by name.
   *
   * **⚠ CORRECTED 2026-09-21, ON THE FOLD.** This paragraph read: *"This door
   * carries a third one that the attachments read does not … a soft-deleted
   * ticket's FILES are served today (case 16.90(a), measured, owned by whoever
   * next picks up the attachment surface)."* That was true when this branch was
   * cut and **false by the time it was folded**: executor 1's `#610` shipped the
   * same guard at the three attachment doors and put it in
   * `read/live-ticket.ts`, and the leak this branch was carrying a citation for
   * is closed. So the sentence is corrected rather than kept, and this route now
   * RIDES that helper.
   *
   * **It is applied HERE and not as the constant in `listTicketComments`'s
   * SELECT, deliberately.** The constant FILTERS ROWS; a route must REFUSE. A
   * predicate in that SELECT would answer `200 {comments: []}` — a thread with
   * nothing in it, which is a claim about the ticket — where a deleted ticket
   * owes the same 404 an invisible one gets. Rendering an absence where the
   * product means a refusal is the failure this repo records most often, and a
   * second predicate here would be worse than either: the route check is
   * evaluated first, so the SQL one could never fire, and a check that cannot
   * fail reads exactly like protection.
   *
   * ## The files
   *
   * Joined on the comment's OWN DOCUMENT, never on `attachment.added` — see
   * `../read/ticket-comments.ts`, which carries the measurement and the reason
   * at length. An `attachment.added` event belongs to the ticket; attributing it
   * to whichever comment was open would invent an attribution.
   */
  app.get<{ Params: { workspaceId: string; ticketId: string } }>(
    '/v1/workspaces/:workspaceId/tickets/:ticketId/comments',
    { preHandler: requireSession },
    async (request, reply) => {
      const { workspaceId, ticketId } = request.params;
      if ((await loadTicketRow(deps.pool, workspaceId, ticketId)) === undefined) {
        return reply.code(404).send(NOT_FOUND_BODY);
      }
      if (!(await canSee(deps.pool, request.currentUserId, ticketId))) {
        return reply.code(404).send(NOT_FOUND_BODY);
      }

      // The third guard, and it is the SHARED one. Read AFTER `canSee` said yes,
      // like the attachments list and the ledger beside it, so an invisible
      // ticket and a deleted one are indistinguishable from outside — all three
      // return the same `NOT_FOUND_BODY` and nothing else.
      //
      // ⚠ **THIS ROUTE HAND-ROLLED IT FIRST, AND THE FOLD REPLACED THAT.** It
      // read the folded `deleted` flag off `getTicketStateFromDb`, which is the
      // DETAIL route's mechanism. Between this branch's cut and its fold,
      // executor 1 shipped `read/live-ticket.ts` — the route-level application
      // of `LIVE_TICKET_WHERE`, whose own docblock names the two mechanisms and
      // argues that the constant's spelling keeps the sites enumerable by the
      // sweep its grep publishes. A second spelling of one rule at the routes is
      // exactly what that module was written to prevent, so this door now rides
      // it, and the divergence it names is worth knowing here: a ticket
      // `proj_visibility` holds with no `proj_tickets` row THROWS at the detail
      // route and answers 404 at this one — which is what the attachments list
      // does too, because the two are the same kind of read.
      if (!(await ticketIsLive(deps.pool, workspaceId, ticketId))) {
        return reply.code(404).send(NOT_FOUND_BODY);
      }

      const comments = await listTicketComments(deps.pool, ticketId);
      return {
        comments: comments.map((comment) => ({
          commentId: comment.commentId,
          authorId: comment.authorId,
          body: comment.body,
          recordedAt: comment.recordedAt,
          editedAt: comment.editedAt,
          deletedAt: comment.deletedAt,
          files: comment.files.map((file) => ({
            attachmentId: file.attachmentId,
            // Sanitized for the same reason the attachments list sanitizes: the
            // stored name is a claim the uploader made, and a filename that
            // reaches a rendering surface unsanitized is how a stored name
            // becomes a rendered one.
            filename: sanitizeFilename(file.filename),
            mime: file.mime,
          })),
        })),
      };
    },
  );
}
