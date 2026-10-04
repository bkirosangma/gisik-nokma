import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import { newUlid, ORIGINS, ULID_REGEX, type Origin, type SubmittedEvent } from '@gisik-nokma/domain';
import type { Queryable } from '../db/queryable.js';
import type { ClientIngest } from '../ingest/ingest-service.js';
import { PERMISSION_VISIBILITY_RULE, TICKET_NOT_VISIBLE_REASON } from '../permissions/check-permission.js';
import { planPublishRanks } from '../read/publish-ranks.js';
import { composeCardKey } from '../read/ticket-cards.js';
import { READ_NOT_FOUND_BODY, requireMember } from '../read/membership.js';
import { ticketNumbers } from '../read/ticket-numbers.js';
import { projectPrefixesInWorkspace } from '../read/visible-projects.js';
import { ticketAccess } from '../visibility/can-open.js';
import { workspaceIdentityFromLedger } from '../workspaces/workspace-name.js';

export const DRAFT_PUBLISH_REFUSED_RULE = 'draft.publish-refused';
/** The most drafts one request publishes (drafts spec R48). */
export const MAX_PUBLISH_SET = 200;
/** The cause for an id the caller cannot open: the permission gate's own unknown-ticket answer, word for word (R9, R54). */
const NOT_OPENABLE = { rule: PERMISSION_VISIBILITY_RULE, reason: TICKET_NOT_VISIBLE_REASON } as const;
const DOORS = ORIGINS.filter((origin): origin is Exclude<Origin, 'server'> => origin !== 'server');

/**
 * `POST /v1/workspaces/:workspaceId/drafts/publish` (drafts spec R48 to R54): publish an ORDERED set of the
 * caller's drafts, all or nothing. Online only. The route builds one `ticket.published {projectId}` per id, filed
 * by the session user, and hands the list to `ingestClientAtomic`, which judges every event with the permission
 * gate and the engine in order, against the state the earlier events left.
 *
 * The order is the caller's and the route never sorts: a parent listed after its child is refused
 * `draft.parent-unpublished` (R51). The refusal names the FIRST ticket that stopped the set and its underlying
 * rule, and nothing is committed (R49).
 *
 * The rank events (R64) follow the publishes in the same transaction, so a refused rank answers 409 naming the ranked
 * ticket and nothing is published.
 *
 * **No oracle (R54; planner ruling on the T5b amendment's Q1, 2026-10-04).** Before any event is built, the ids
 * are walked in the caller's order and the FIRST one that has no row in THIS workspace, or that the caller cannot
 * open (`ticketAccess` is `none`: another person's draft, a ticket they cannot see), refuses the set with the
 * permission gate's unknown-ticket cause, and ingest is not asked. Both halves of the test are needed:
 * - without the workspace scope, a ticket of another workspace the caller CAN open there would reach ingest and
 *   be refused `entity-workspace-mismatch`, a sentence that names the other workspace;
 * - without `ticketAccess`, a walk that skipped only the ids with no row would let `[another person's draft, a
 *   random id]` name the random id, telling the caller the draft exists.
 * So which id is named depends only on what the caller can already learn from a one-id set. The `project_id`
 * read is for the event's payload and never leaves the server.
 */
export function registerDraftPublishRoutes(
  app: FastifyInstance,
  deps: { pool: Queryable; ingest: ClientIngest },
  requireSession: preHandlerHookHandler,
): void {
  app.post<{ Params: { workspaceId: string }; Body: { ticketIds: string[]; origin?: Exclude<Origin, 'server'> } }>(
    '/v1/workspaces/:workspaceId/drafts/publish',
    {
      preHandler: requireSession,
      schema: {
        body: {
          type: 'object',
          required: ['ticketIds'],
          additionalProperties: false,
          properties: {
            ticketIds: {
              type: 'array',
              minItems: 1,
              maxItems: MAX_PUBLISH_SET,
              items: { type: 'string', pattern: ULID_REGEX.source },
            },
            origin: { type: 'string', enum: DOORS },
          },
        },
      },
    },
    async (request, reply) => {
      const { workspaceId } = request.params;
      const userId = request.currentUserId;
      const eff = await requireMember(deps.pool, userId, workspaceId);
      if (eff === null) {
        return reply.code(404).send(READ_NOT_FOUND_BODY);
      }
      const { ticketIds, origin = 'web' } = request.body;
      if (new Set(ticketIds).size !== ticketIds.length) {
        return reply.code(400).send({ error: 'bad_request', message: 'ticketIds must not repeat an id.' });
      }

      const { rows } = await deps.pool.query<{ ticket_id: string; project_id: string }>(
        'SELECT ticket_id, project_id FROM proj_tickets WHERE workspace_id = $1 AND ticket_id = ANY($2)',
        [workspaceId, ticketIds],
      );
      const projectOf = new Map(rows.map((row) => [row.ticket_id, row.project_id]));
      const clientTime = new Date().toISOString();
      const events: SubmittedEvent[] = [];
      for (const ticketId of ticketIds) {
        const projectId = projectOf.get(ticketId);
        if (projectId === undefined || (await ticketAccess(deps.pool, userId, ticketId)) === 'none') {
          return reply.code(409).send({ rule: DRAFT_PUBLISH_REFUSED_RULE, ticketId, cause: NOT_OPENABLE });
        }
        events.push({
          id: newUlid(),
          workspaceId,
          entity: { kind: 'ticket', id: ticketId },
          type: 'ticket.published',
          version: 1,
          payload: { projectId },
          actorId: userId,
          origin,
          clientTime,
        });
      }

      // R64, R65: after ALL the publishes (so their ledger rows stay consecutive), per project in order of first
      // appearance, the backfill of the rows the publisher can see and then the set in the given order. Same
      // transaction: a rank the gate refuses rolls the publishes back too.
      const setByProject = new Map<string, string[]>();
      for (const ticketId of ticketIds) {
        const projectId = projectOf.get(ticketId);
        if (projectId !== undefined) setByProject.set(projectId, [...(setByProject.get(projectId) ?? []), ticketId]);
      }
      const ranks = await planPublishRanks(deps.pool, eff, userId, workspaceId, setByProject);
      const rankEvents: SubmittedEvent[] = ranks.map((assignment) => ({
        id: newUlid(),
        workspaceId,
        entity: { kind: 'ticket', id: assignment.ticketId },
        type: 'ticket.ranked',
        version: 1,
        payload: { rank: assignment.rank },
        actorId: userId,
        origin,
        clientTime,
      }));
      const submitted = [...events, ...rankEvents];

      const outcome = await deps.ingest.ingestClientAtomic(submitted, userId);
      if (outcome.status === 'rolled-back') {
        const result = outcome.result;
        const cause =
          result.status === 'refused'
            ? { rule: result.rule, reason: result.reason }
            : result.status === 'invalid'
              ? { rule: result.code, reason: result.message }
              : { rule: 'unexpected', reason: 'The publish did not commit.' };
        return reply.code(409).send({
          rule: DRAFT_PUBLISH_REFUSED_RULE,
          ticketId: submitted[outcome.index]?.entity.id,
          cause,
        });
      }

      // After the COMMIT: the keys are positions among numbering rows, which the set has just added.
      const [identity, prefixes, numbers] = await Promise.all([
        workspaceIdentityFromLedger(deps.pool, workspaceId),
        projectPrefixesInWorkspace(deps.pool, workspaceId),
        ticketNumbers(deps.pool, workspaceId, ticketIds),
      ]);
      return {
        results: ticketIds.map((ticketId) => ({
          ticketId,
          key: composeCardKey(identity.prefix, prefixes.get(projectOf.get(ticketId) ?? ''), numbers.get(ticketId)),
        })),
      };
    },
  );
}
