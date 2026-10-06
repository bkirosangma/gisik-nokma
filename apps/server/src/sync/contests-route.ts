import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import type { AttentionShow, FieldClaim } from '@gisik-nokma/domain';
import type { Queryable } from '../db/queryable.js';
import { resolveEffectiveRole, type EffectiveRole } from '../permissions/effective-role.js';
import { parseShow, ticketMatchesShow } from '../read/attention-show.js';
import { canOpen } from '../visibility/can-open.js';
import { targetSight, withholdContest } from '../visibility/withhold-link-targets.js';

export type ContestView = {
  contestedEventId: string;
  originalEventId: string;
  workspaceId: string;
  ticketId: string;
  /**
   * The contested ticket's CURRENT title, joined from `proj_tickets`.
   *
   * This is the field two client refusals waited on — `ContestedClaim.title` on
   * My Work and the attention strip's `'contested'` item — and both named this
   * route as their owner for the same reason: `proj_contested` already stores
   * `ticket_id`, so the ticket the row names is one join away, and no other
   * `/v1` route answers a ticket's current title given only a ticket id.
   *
   * **Serving it discloses nothing this route was not already disclosing.** Its
   * own rule is "a contest is exactly as visible as its ticket, never more", and
   * every row here has already passed `canOpen` for the ticket the title belongs
   * to. A viewer who may read the contest may read the ticket, and a viewer who
   * may not gets no row at all — so the title travels with a row whose audience
   * is the ticket's own.
   */
  title: string;
  /**
   * The contested ticket's project, joined from the same `proj_tickets` row as
   * the title.
   *
   * It closes the attention strip's `projectId`, which was previously reachable
   * only through `GET /v1/workspaces/:workspaceId/tickets` — a SECOND route that
   * resolves its set through `listVisibleTickets` while this one filters through
   * `canSee`, with nothing anywhere asserting the two answer the same set (since drafts T4 the gate is
   * `canOpen`, which also admits the caller's own draft, and listVisibleTickets never names one). That
   * made it "a second join with a caveat" (`mappers.ts`' own words). Off this
   * row there is no caveat: same row, same tenancy, same `canOpen` gate that
   * already admitted the contest.
   *
   * The ID only, never the NAME. Rulings P32/P38 make a project's name the
   * disclosure and its id not one — an admin already receives project ids they
   * are not a member of through `TicketCard.projectId` — so this discloses
   * nothing the ticket surface does not.
   */
  projectId: string;
  claimantId: string;
  rule: string;
  reason: string;
  originalEvent: unknown;
  contestedAt: string;
  resolved: boolean;
  resolution: string | null;
  resolvedBy: string | null;
  resolvedEventId: string | null;
  resolvedAt: string | null;
};

type ContestRow = {
  contested_event_id: string;
  original_event_id: string;
  workspace_id: string;
  ticket_id: string;
  /**
   * `proj_tickets.fields` for the ticket this contest names, or `null` when
   * there is no such row — the LEFT JOIN's absence value, resolved by
   * `titleOf` below.
   */
  ticket_fields: Record<string, FieldClaim> | null;
  /** `proj_tickets.project_id`, or `null` when the LEFT JOIN found no row. */
  ticket_project_id: string | null;
  /** `proj_tickets.created_by` and `assignee_id`, for `?show=` (my-work-global T1); `null` as above. */
  ticket_created_by: string | null;
  ticket_assignee_id: string | null;
  claimant_id: string;
  rule: string;
  reason: string;
  original_event: unknown;
  contested_at: Date;
  resolved: boolean;
  resolution: string | null;
  resolved_by: string | null;
  resolved_event_id: string | null;
  resolved_at: Date | null;
};

/**
 * The contested ticket's current title, out of the joined `proj_tickets.fields`.
 *
 * The throw discipline is `assembleTicketCards`' `titleOf`, restated here rather
 * than shared because that one is private to the card assembler and takes a
 * `ProjTicketRow` this route never builds. Both absences are projection/ledger
 * disagreements and neither has an honest value:
 *
 * - **No joined row at all** → throw. The LEFT JOIN is a LEFT join precisely so
 *   this is reachable and loud: an INNER JOIN would have DROPPED the contest,
 *   turning a data disagreement into a silently shorter list, which is the
 *   failure this series keeps finding. It is only reachable for a row that has
 *   ALREADY passed `canOpen` — a ticket with no `proj_visibility` row answers
 *   false and never gets here — so this is a visible contest whose ticket has no
 *   `proj_tickets` row, not the ordinary invisible case.
 * - **No title claim, or one whose value is not a string** → throw. Every
 *   `ticket.created` writes `fields.title` and the door refuses a non-string
 *   (`checkTicketFieldSet`), so either means the row did not come through it.
 *
 * `''` is refused for the reason `ticket-cards.ts` gives: it sits exactly where
 * a real title goes, and a client renders it as one.
 */
function titleOf(row: ContestRow): string {
  if (row.ticket_fields === null) {
    throw new Error(
      `GET /v1/contests: contest ${row.contested_event_id} names ticket ${row.ticket_id}, which has no proj_tickets row — the contest passed canOpen, so its ticket is visible and the two projections disagree`,
    );
  }
  const claim = row.ticket_fields['title'];
  if (claim === undefined) {
    throw new Error(
      `GET /v1/contests: no title claim on ticket ${row.ticket_id} — every ticket.created writes one, so proj_tickets and the ledger disagree`,
    );
  }
  if (typeof claim.value !== 'string') {
    throw new Error(
      `GET /v1/contests: the title claim on ticket ${row.ticket_id} is not a string — the door refuses that (checkTicketFieldSet), so this event did not come through it`,
    );
  }
  return claim.value;
}

/**
 * The contested ticket's project id, out of the same joined row as the title.
 *
 * Separate from `titleOf` and throwing its own message rather than sharing one:
 * a null here and a null there mean the same disagreement, but a shared throw
 * would name only one of the two fields and send a reader to the wrong column.
 * Reachable only for a contest that has ALREADY passed `canOpen`, for the reason
 * `titleOf` states.
 */
function projectIdOf(row: ContestRow): string {
  if (row.ticket_project_id === null) {
    throw new Error(
      `GET /v1/contests: contest ${row.contested_event_id} names ticket ${row.ticket_id}, which has no proj_tickets row — the contest passed canOpen, so its ticket is visible and the two projections disagree`,
    );
  }
  return row.ticket_project_id;
}

function toView(row: ContestRow): ContestView {
  return {
    contestedEventId: row.contested_event_id,
    originalEventId: row.original_event_id,
    workspaceId: row.workspace_id,
    ticketId: row.ticket_id,
    title: titleOf(row),
    projectId: projectIdOf(row),
    claimantId: row.claimant_id,
    rule: row.rule,
    reason: row.reason,
    originalEvent: row.original_event,
    // timestamptz comes back as a Date. `.toISOString()` on it is the instant,
    // not the label — the session runs in Asia/Kolkata and a rendered string
    // would carry +05:30 into a JSON field every client parses as an instant.
    contestedAt: row.contested_at.toISOString(),
    resolved: row.resolved,
    resolution: row.resolution,
    resolvedBy: row.resolved_by,
    resolvedEventId: row.resolved_event_id,
    resolvedAt: row.resolved_at === null ? null : row.resolved_at.toISOString(),
  };
}

/**
 * `GET /v1/contests` — the read surface for contested claims. The ticket
 * banner, My Work and the attention strip all read this.
 *
 * ## A contest is exactly as visible as its ticket, never more
 *
 * Every row is filtered through `canOpen` (drafts G6): `canSee`, which is the product's ONE visibility
 * decision, or the caller's own openable draft, so a contest on a draft is listed to its author and to
 * nobody else. Three properties of that call are load-bearing here:
 *
 * - It takes no `workspaceId`. The role is resolved in the workspace the
 *   TICKET's own `proj_visibility` row names, so a caller who is an owner of
 *   workspace A cannot read a workspace-B ticket's contests by naming A in the
 *   query string. A `workspaceId` parameter would be a caller-supplied fact
 *   about someone else's row.
 * - It resolves the `EffectiveRole` itself, through `resolveEffectiveRole`.
 *   This route never builds one and never queries `proj_memberships` directly —
 *   a project-scope row SURVIVES `membership.revoked` by design, so a bare read
 *   of that table returns rows for people who are no longer in the workspace.
 *   (Ruling P22: `EffectiveRole` is trusted by convention and TypeScript is
 *   structural, so any object of the right shape is accepted; the defence is to
 *   never hand-build one.)
 * - A ticket with no visibility row answers `false`, identically to one the
 *   caller may not see, so this route is not an existence oracle.
 *
 * ## The filter is not an authorisation, and the loop is not an optimisation
 *
 * `workspaceId` narrows the query; it does not authorise it. An outsider who
 * names a workspace they are not in gets `{ contests: [] }` — a 200 with
 * nothing, not a 403: "you may not see this" and "there is nothing here" must
 * be the same answer or the empty/non-empty distinction becomes the oracle the
 * 404 discipline exists to remove.
 *
 * The per-row `canOpen` loop is deliberate rather than lazy.
 * `listVisibleTickets` answers a different question (a viewer's ticket slice)
 * and returns a different shape; reusing it would mean stating the visibility
 * decision a second way, which is the two-sources-of-truth shape this series
 * keeps catching.
 *
 * ## `?show=`: the attention strip's filter, on the contests it appends
 *
 * My-work-global T1 (plan AMEND 16:26, cases 30.059–30.061). The client builds
 * the strip from the attention route AND this one, so this route takes the same
 * `show` through the same parse (`read/attention-show.ts`): without it, a viewer
 * on the default "created by me or assigned to me" would still be shown every
 * contest in the workspace. Absent, nothing changes — no role is resolved and
 * no row is dropped.
 *
 * Given, the viewer's role in the NAMED workspace is resolved through
 * `resolveEffectiveRole` (never built by hand, per the paragraph above), and
 * `parseShow` refuses what it refuses on the attention route, with the same
 * `400 {error:'invalid_query'}`. That is not an oracle either: a caller outside
 * the workspace, and one naming a workspace that does not exist, both resolve
 * no role and get the same answer for the same `show`. Each surviving row is
 * then judged by the ticket it names (`ticketMatchesShow`, over the joined
 * `created_by` / `assignee_id` / `project_id`) BEFORE `canSee`, which still
 * decides the audience: `show` only narrows.
 */
export function registerContestsRoute(
  app: FastifyInstance,
  deps: { pool: Queryable },
  requireSession: preHandlerHookHandler,
): void {
  app.get<{
    Querystring: { workspaceId: string; ticketId?: string; claimantId?: string; open?: string; show?: unknown };
  }>(
    '/v1/contests',
    {
      preHandler: requireSession,
      schema: {
        querystring: {
          type: 'object',
          required: ['workspaceId'],
          additionalProperties: false,
          properties: {
            workspaceId: { type: 'string' },
            ticketId: { type: 'string' },
            claimantId: { type: 'string' },
            /**
             * `'true'` ONLY, deliberately. The contract is `open=<true?>` — a filter
             * you either apply or omit. An enum admitting `'false'` read as if the
             * parameter were honoured on both sides, while the handler below has no
             * `else`: `open=false` returned EVERYTHING, open contests included, with
             * a 200 and no signal the filter had been ignored. A caller asking for
             * the settled ones would have rendered open contests into a resolved pane.
             *
             * Narrowed rather than implemented, because `resolved` as a filter is not
             * in this task's contract, and inventing it here would put a second,
             * unspecified meaning into an API Plans 5 and 9 both consume. `open=false`
             * is now a 400 that says so — prefer the check whose failure is loud over
             * the one that quietly does nothing.
             */
            open: { type: 'string', enum: ['true'] },
            /**
             * UNTYPED on purpose: `parseShow` is the one door for `show`, so a
             * repeated `show` (an array) reaches it and is refused with the same
             * `{error:'invalid_query'}` body the attention route answers, rather
             * than a schema error worded differently for the same mistake.
             */
            show: {},
          },
        },
      },
    },
    async (request, reply) => {
      const { workspaceId, ticketId, claimantId, open } = request.query;
      let filter: { show: ReadonlySet<AttentionShow>; eff: EffectiveRole } | undefined;
      if (request.query.show !== undefined) {
        const eff = await resolveEffectiveRole(deps.pool, request.currentUserId, workspaceId);
        const parsed = parseShow(request.query, eff);
        if (!parsed.ok) {
          return reply.status(400).send({ error: 'invalid_query' });
        }
        if (parsed.show !== undefined) filter = { show: parsed.show, eff };
      }
      const clauses = ['c.workspace_id = $1'];
      const params: unknown[] = [workspaceId];
      if (ticketId !== undefined) {
        params.push(ticketId);
        clauses.push(`c.ticket_id = $${params.length}`);
      }
      if (claimantId !== undefined) {
        params.push(claimantId);
        clauses.push(`c.claimant_id = $${params.length}`);
      }
      if (open === 'true') {
        clauses.push('NOT c.resolved');
      }
      // The title join, and every clause above is qualified `c.` for it. LEFT,
      // not INNER: an inner join would drop a contest whose ticket row is
      // missing, which is a data disagreement answered with a shorter list
      // instead of a loud failure — `titleOf` throws on the null instead.
      //
      // The join is on `(ticket_id, workspace_id)` and not on `ticket_id`
      // alone. `proj_contested` has no foreign key into `proj_tickets` and
      // cannot have one, so nothing in the schema stops a ticket id from
      // appearing under two workspaces; matching on the id alone would let a
      // neighbouring tenancy's row supply the title. The workspace clause on
      // `c` narrows the contests, and this one keeps the JOIN inside the same
      // tenancy rather than trusting that it already is.
      const { rows } = await deps.pool.query<ContestRow>(
        // NO soft-delete predicate, and this is the dispatch's own recorded
        // ruling rather than an oversight (`docs/lanes/executor-state.md`'s
        // "NAMED, NOT COVERED", item 2, verbatim: *"A deleted ticket's contest
        // still renders."*). The reason is the FAQ's: a contest is an event
        // that CITES the ticket — *"Its history is retained, because other
        // events cite it"* — and this roster is gated per row by `canOpen`,
        // which is the whole audience decision here (one rewrite rides on it:
        // a contested LINK claim whose target this viewer cannot see is served
        // with that target withheld and the gate's cause, typed-links T4b,
        // `withholdContest` below). The consequence is named
        // rather than left to be found: the deleted ticket's TITLE travels with
        // the contest, because the title is joined from `proj_tickets.fields`
        // and `canOpen` knows nothing about deletion.
        `SELECT c.*, t.fields AS ticket_fields, t.project_id AS ticket_project_id,
                t.created_by AS ticket_created_by, t.assignee_id AS ticket_assignee_id
           FROM proj_contested c
           LEFT JOIN proj_tickets t
             ON t.ticket_id = c.ticket_id AND t.workspace_id = c.workspace_id
          WHERE ${clauses.join(' AND ')}
          ORDER BY c.contested_at, c.contested_event_id`,
        params,
      );

      const contests: ContestView[] = [];
      const sees = targetSight(deps.pool, request.currentUserId);
      for (const row of rows) {
        if (
          filter !== undefined &&
          !ticketMatchesShow(
            { createdBy: row.ticket_created_by, assigneeId: row.ticket_assignee_id, projectId: row.ticket_project_id },
            filter.show,
            request.currentUserId,
            filter.eff,
          )
        ) {
          continue;
        }
        if (!(await canOpen(deps.pool, request.currentUserId, row.ticket_id))) {
          continue;
        }
        // A contested link claim whose target this viewer cannot see: the
        // embedded payload withheld and the gate's cause (typed-links T4b).
        contests.push(await withholdContest(toView(row), sees));
      }
      return { contests };
    },
  );
}
