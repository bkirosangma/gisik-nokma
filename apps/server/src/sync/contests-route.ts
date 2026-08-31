import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import type { Queryable } from '../db/queryable.js';
import { canSee } from '../visibility/can-see.js';

export type ContestView = {
  contestedEventId: string;
  originalEventId: string;
  workspaceId: string;
  ticketId: string;
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

function toView(row: ContestRow): ContestView {
  return {
    contestedEventId: row.contested_event_id,
    originalEventId: row.original_event_id,
    workspaceId: row.workspace_id,
    ticketId: row.ticket_id,
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
 * Every row is filtered through `canSee`, which is the product's ONE visibility
 * decision. Three properties of that call are load-bearing here:
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
 * The per-row `canSee` loop is deliberate rather than lazy.
 * `listVisibleTickets` answers a different question (a viewer's ticket slice)
 * and returns a different shape; reusing it would mean stating the visibility
 * decision a second way, which is the two-sources-of-truth shape this series
 * keeps catching.
 */
export function registerContestsRoute(
  app: FastifyInstance,
  deps: { pool: Queryable },
  requireSession: preHandlerHookHandler,
): void {
  app.get<{
    Querystring: { workspaceId: string; ticketId?: string; claimantId?: string; open?: string };
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
            open: { type: 'string', enum: ['true', 'false'] },
          },
        },
      },
    },
    async (request) => {
      const { workspaceId, ticketId, claimantId, open } = request.query;
      const clauses = ['workspace_id = $1'];
      const params: unknown[] = [workspaceId];
      if (ticketId !== undefined) {
        params.push(ticketId);
        clauses.push(`ticket_id = $${params.length}`);
      }
      if (claimantId !== undefined) {
        params.push(claimantId);
        clauses.push(`claimant_id = $${params.length}`);
      }
      if (open === 'true') {
        clauses.push('NOT resolved');
      }
      const { rows } = await deps.pool.query<ContestRow>(
        `SELECT * FROM proj_contested WHERE ${clauses.join(' AND ')}
         ORDER BY contested_at, contested_event_id`,
        params,
      );

      const contests: ContestView[] = [];
      for (const row of rows) {
        if (!(await canSee(deps.pool, request.currentUserId, row.ticket_id))) {
          continue;
        }
        contests.push(toView(row));
      }
      return { contests };
    },
  );
}
