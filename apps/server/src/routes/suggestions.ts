import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import type { SuggestionListResponse, SuggestionView } from '@gisik-nokma/domain';
import type { Queryable } from '../db/queryable.js';
import { itemLabels } from '../read/concepts.js';
import type { ItemRef } from '../read/item-visibility.js';
import { READ_NOT_FOUND_BODY, requireMember } from '../read/membership.js';
import { readsSuggestions, visibleSuggestions } from '../read/suggestions.js';

const key = (item: ItemRef): string => `${item.kind}:${item.id}`;

/**
 * `GET /v1/workspaces/:workspaceId/suggestions` (Knowledge Graph spec D §4.1/§5.2, KG-D Task 5): the suggestion job's
 * cache (`sem_suggestions`), highest score first, each served only to a reader who sees every live item in it.
 *
 * - **Who may read it:** owners, admins and members. A guest and a non-member get the one 404 (`READ_NOT_FOUND_BODY`),
 *   as `routes/groups.ts` answers them.
 * - **D4 per reader, at read time, nothing cached.** The job's audience partition is a clustering boundary, not the
 *   security one: it cannot model the assignee arm or a project note's author arm (`semantic/partition.ts`). So the
 *   row is kept only when `hiddenItems` answers none of its items for THIS reader (Review Focus 2, 27.494), asked once
 *   over the union of every row's items: `visibleSuggestions` (`read/suggestions.ts`), which the graph's suggested
 *   concepts read too (27.507).
 * - A trashed item is in no reader's `hiddenItems` answer and keeps its row until the job's next run, which reads live
 *   items only and drops it.
 */
export function registerSuggestionRoutes(app: FastifyInstance, deps: { pool: Queryable }, requireSession: preHandlerHookHandler): void {
  app.get<{ Params: { workspaceId: string } }>('/v1/workspaces/:workspaceId/suggestions', { preHandler: requireSession }, async (request, reply) => {
    const { workspaceId } = request.params;
    const eff = await requireMember(deps.pool, request.currentUserId, workspaceId);
    if (!readsSuggestions(eff)) return reply.code(404).send(READ_NOT_FOUND_BODY);
    const rows = await visibleSuggestions(deps.pool, eff, request.currentUserId, workspaceId);
    const labels = await itemLabels(deps.pool, workspaceId, rows.flatMap((row) => row.items));
    const suggestions: SuggestionView[] = rows.map((row) => ({
      id: row.id,
      label: row.label,
      terms: row.terms,
      score: Number(row.score),
      computedAt: row.computed_at.toISOString(),
      signature: row.signature,
      itemHashes: row.item_hashes,
      items: row.items.map((item) => ({ ...item, label: labels.get(key(item)) ?? '' })),
    }));
    const body: SuggestionListResponse = { workspaceId, suggestions };
    return body;
  });
}
