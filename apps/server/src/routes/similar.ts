import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import type { SimilarResponse } from '@gisik-nokma/domain';
import type { Queryable } from '../db/queryable.js';
import { READ_NOT_FOUND_BODY, requireMember } from '../read/membership.js';
import { SIMILAR_MAX_K, similarItems } from '../read/item-search.js';
import { canReadNoteById } from '../visibility/can-read-note.js';
import { canSee } from '../visibility/can-see.js';

/**
 * `GET /v1/workspaces/:workspaceId/similar?item=<ticket|note>:<id>&k=<1..20>` (Knowledge Graph spec D §5.1,
 * KG-D Task 2): the tickets and notes nearest to one item by meaning, only those the reader can see.
 *
 * - A malformed `item` or a `k` outside 1–20 (default 10) is `invalid_query`, the search route's 400 body.
 * - A non-member, and a reader who cannot see the item, get the same 404 (`READ_NOT_FOUND_BODY`): one answer
 *   for "not yours" and "not there", as `routes/groups.ts` gives.
 * - An item with no chunks yet answers `hits: []`: the worker has not reached it, which is not a refusal.
 */
export function registerSimilarRoutes(app: FastifyInstance, deps: { pool: Queryable }, requireSession: preHandlerHookHandler): void {
  app.get<{ Params: { workspaceId: string }; Querystring: { item?: string; k?: string } }>(
    '/v1/workspaces/:workspaceId/similar',
    { preHandler: requireSession },
    async (request, reply) => {
      const { workspaceId } = request.params;
      const match = /^(ticket|note):(.+)$/.exec(request.query.item ?? '');
      const k = request.query.k === undefined ? 10 : Number(request.query.k);
      if (match === null || !Number.isInteger(k) || k < 1 || k > SIMILAR_MAX_K) {
        return reply.code(400).send({ error: 'invalid_query' });
      }
      const eff = await requireMember(deps.pool, request.currentUserId, workspaceId);
      if (eff === null) return reply.code(404).send(READ_NOT_FOUND_BODY);
      const kind = match[1] as 'ticket' | 'note';
      const id = match[2] as string;
      const visible = kind === 'ticket' ? await canSee(deps.pool, request.currentUserId, id) : await canReadNoteById(deps.pool, request.currentUserId, id);
      if (!visible) return reply.code(404).send(READ_NOT_FOUND_BODY);
      const hits = await similarItems(deps.pool, eff, request.currentUserId, workspaceId, { kind, id }, k);
      const body: SimilarResponse = { workspaceId, item: { kind, id }, hits };
      return body;
    },
  );
}
