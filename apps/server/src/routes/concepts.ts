import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import type { ConceptAudienceResponse, ConceptHistoryResponse, ConceptListResponse, ConceptSummary, ConceptView } from '@gisik-nokma/domain';
import type { Queryable } from '../db/queryable.js';
import { conceptAudience, readConceptView, seesLiveItems, visibleConceptIds, visibleConcepts } from '../read/concepts.js';
import { hiddenItems, type ItemRef } from '../read/item-visibility.js';
import { READ_NOT_FOUND_BODY, requireMember } from '../read/membership.js';
import { BAD_PAGING_BODY, parsePaging, toHistoryEvent, type HistoryRow } from './ticket-history.js';

/** The search route's 400 body (`routes/similar.ts` answers it too): a malformed `item` / `add` / `conceptId`. */
const INVALID_QUERY_BODY = { error: 'invalid_query' } as const;
const ITEM_REF = /^(ticket|note):(.+)$/;

function parseItem(raw: unknown): ItemRef | null {
  if (typeof raw !== 'string') return null;
  const match = ITEM_REF.exec(raw);
  return match === null ? null : { kind: match[1] as 'ticket' | 'note', id: match[2] as string };
}

/**
 * The workspace a concept lives in, or `null` for an unknown id. A deleted concept still names its workspace: whether
 * it may be read at all is D4's one decision (`visibleConcepts` reads live concepts only), not a second one here.
 */
async function conceptWorkspace(db: Queryable, conceptId: string): Promise<string | null> {
  const { rows } = await db.query<{ workspace_id: string }>('SELECT workspace_id FROM proj_concepts WHERE concept_id = $1', [conceptId]);
  return rows[0]?.workspace_id ?? null;
}

/**
 * Knowledge Graph spec D §5.1, the concept READS (KG-D Task 4). D4 is decided here, at read time, by
 * `read/concepts.ts`: a reader sees a concept only if they can see every live item in it, an empty one only if
 * they are not a guest, and nothing is cached, so an item whose audience narrows takes its concepts with it on the
 * next read (Review Focus 1 and 2).
 *
 * Every refusal of a thing the reader may not know about is ONE 404 (`READ_NOT_FOUND_BODY`), as
 * `routes/groups.ts` and `routes/similar.ts` give it: a non-member, an absent, deleted or hidden concept, and an
 * absent, trashed or hidden item answer alike. A malformed query is a 400 for everyone, before any of that.
 * - `GET /v1/workspaces/:workspaceId/concepts[?item=<ticket|note>:<id>]`: the concepts this reader sees, or those
 *   that hold `item`.
 * - `GET /v1/concepts/:conceptId`: one concept (`ConceptView`).
 * - `GET /v1/concepts/:conceptId/history[?afterSeq&limit]`: its ledger, paged as a ticket's history is.
 * - `GET /v1/workspaces/:workspaceId/concepts/audience?add=<kind>:<id>[&add=…][&conceptId=]`: the narrowing
 *   preview's numbers (§3.2). Guests are refused it: it counts the workspace's people, which the members route
 *   withholds from a guest, and a guest cannot tag anyway (`permission.concept`).
 */
export function registerConceptRoutes(app: FastifyInstance, deps: { pool: Queryable }, requireSession: preHandlerHookHandler): void {
  app.get<{ Params: { workspaceId: string }; Querystring: { item?: unknown } }>(
    '/v1/workspaces/:workspaceId/concepts',
    { preHandler: requireSession },
    async (request, reply) => {
      const { workspaceId } = request.params;
      const item = request.query.item === undefined ? undefined : parseItem(request.query.item);
      if (item === null) return reply.code(400).send(INVALID_QUERY_BODY);
      const viewerId = request.currentUserId;
      const eff = await requireMember(deps.pool, viewerId, workspaceId);
      if (eff === null) return reply.code(404).send(READ_NOT_FOUND_BODY);
      const visible = await visibleConcepts(deps.pool, eff, viewerId, workspaceId);
      let ids = [...visible.keys()];
      if (item !== undefined) {
        if (!(await seesLiveItems(deps.pool, eff, viewerId, workspaceId, [item]))) return reply.code(404).send(READ_NOT_FOUND_BODY);
        const holding = await deps.pool.query<{ concept_id: string }>(
          'SELECT concept_id FROM proj_concept_items WHERE workspace_id = $1 AND item_kind = $2 AND item_id = $3',
          [workspaceId, item.kind, item.id],
        );
        const holds = new Set(holding.rows.map((row) => row.concept_id));
        ids = ids.filter((id) => holds.has(id));
      }
      const concepts = await summaries(deps.pool, workspaceId, ids, visible);
      const body: ConceptListResponse = { workspaceId, concepts };
      return body;
    },
  );

  app.get<{ Params: { conceptId: string } }>('/v1/concepts/:conceptId', { preHandler: requireSession }, async (request, reply) => {
    const { conceptId } = request.params;
    const workspaceId = await conceptWorkspace(deps.pool, conceptId);
    if (workspaceId === null) return reply.code(404).send(READ_NOT_FOUND_BODY);
    const eff = await requireMember(deps.pool, request.currentUserId, workspaceId);
    if (eff === null) return reply.code(404).send(READ_NOT_FOUND_BODY);
    const view: ConceptView | null = await readConceptView(deps.pool, eff, request.currentUserId, conceptId);
    if (view === null) return reply.code(404).send(READ_NOT_FOUND_BODY);
    return view;
  });

  /**
   * The concept's ledger, as `routes/ticket-history.ts` serves a ticket's (the same paging, the same row mapping),
   * with ONE redaction: in a `concept.item_tagged` / `concept.item_untagged` naming an item this reader cannot see
   * NOW, `itemId` goes out as `''` (spec A §2.6's rule, applied at the route so the app and MCP share it). The item
   * may have narrowed since, or been untagged; what counts is the event's item, not the concept's current ones.
   * `hiddenItems` reports LIVE hidden items only, so a since-TRASHED item's id stays visible to a reader who could
   * see the concept when it was tagged: trash keeps rows, and an id is not content.
   */
  app.get<{ Params: { conceptId: string }; Querystring: { afterSeq?: unknown; limit?: unknown } }>(
    '/v1/concepts/:conceptId/history',
    { preHandler: requireSession },
    async (request, reply) => {
      const paging = parsePaging(request.query);
      if (paging === null) return reply.code(400).send(BAD_PAGING_BODY);
      const { conceptId } = request.params;
      const viewerId = request.currentUserId;
      const workspaceId = await conceptWorkspace(deps.pool, conceptId);
      if (workspaceId === null) return reply.code(404).send(READ_NOT_FOUND_BODY);
      const eff = await requireMember(deps.pool, viewerId, workspaceId);
      if (eff === null || !(await visibleConceptIds(deps.pool, eff, viewerId, workspaceId, [conceptId])).has(conceptId)) {
        return reply.code(404).send(READ_NOT_FOUND_BODY);
      }
      const { rows } = await deps.pool.query<HistoryRow>(
        `SELECT id, type, version, payload, actor_id, origin, client_time, server_time, seq
           FROM events
          WHERE entity_kind = 'concept' AND entity_id = $1 AND seq > $2
          ORDER BY seq ASC
          LIMIT $3`,
        [conceptId, paging.afterSeq, paging.limit],
      );
      const events = rows.map(toHistoryEvent);
      const named = events.flatMap((event) =>
        (event.type === 'concept.item_tagged' || event.type === 'concept.item_untagged') &&
        typeof (event.payload as { itemId?: unknown }).itemId === 'string'
          ? [{ kind: (event.payload as { itemKind: 'ticket' | 'note' }).itemKind, id: (event.payload as { itemId: string }).itemId }]
          : [],
      );
      const hidden = new Set((await hiddenItems(deps.pool, eff, viewerId, workspaceId, named)).map((item) => `${item.kind}:${item.id}`));
      const shown = events.map((event) => {
        const p = event.payload as { itemKind?: string; itemId?: string };
        return p.itemId !== undefined && hidden.has(`${String(p.itemKind)}:${p.itemId}`) ? { ...event, payload: { ...p, itemId: '' } } : event;
      });
      const body: ConceptHistoryResponse = { conceptId, events: shown };
      return body;
    },
  );

  app.get<{ Params: { workspaceId: string }; Querystring: { add?: unknown; conceptId?: unknown } }>(
    '/v1/workspaces/:workspaceId/concepts/audience',
    { preHandler: requireSession },
    async (request, reply) => {
      const { workspaceId } = request.params;
      const rawAdd = request.query.add;
      const adds = (Array.isArray(rawAdd) ? rawAdd : rawAdd === undefined ? [] : [rawAdd]).map(parseItem);
      const conceptId = request.query.conceptId;
      if (adds.length === 0 || adds.includes(null) || (conceptId !== undefined && (typeof conceptId !== 'string' || conceptId === ''))) {
        return reply.code(400).send(INVALID_QUERY_BODY);
      }
      const add = adds as ItemRef[];
      const viewerId = request.currentUserId;
      const eff = await requireMember(deps.pool, viewerId, workspaceId);
      if (eff === null || eff.workspaceRole === 'guest') return reply.code(404).send(READ_NOT_FOUND_BODY);
      if (conceptId !== undefined && !(await visibleConceptIds(deps.pool, eff, viewerId, workspaceId, [conceptId])).has(conceptId)) {
        return reply.code(404).send(READ_NOT_FOUND_BODY);
      }
      if (!(await seesLiveItems(deps.pool, eff, viewerId, workspaceId, add))) return reply.code(404).send(READ_NOT_FOUND_BODY);
      const body: ConceptAudienceResponse = await conceptAudience(deps.pool, workspaceId, conceptId ?? null, add);
      return body;
    },
  );
}

/** The list's rows, by name, each with the live item count D4 just counted (`visibleConcepts`). */
async function summaries(
  db: Queryable,
  workspaceId: string,
  ids: readonly string[],
  liveCounts: ReadonlyMap<string, number>,
): Promise<ConceptSummary[]> {
  if (ids.length === 0) return [];
  const { rows } = await db.query<{ concept_id: string; name: string; summary: string; created_by: string; origin: string }>(
    `SELECT concept_id, name, summary, created_by, origin FROM proj_concepts
      WHERE workspace_id = $1 AND concept_id = ANY ($2::text[]) ORDER BY name, concept_id`,
    [workspaceId, [...ids]],
  );
  return rows.map((row) => ({
    id: row.concept_id,
    name: row.name,
    summary: row.summary,
    itemCount: liveCounts.get(row.concept_id) ?? 0,
    createdBy: row.created_by,
    origin: row.origin,
  }));
}
