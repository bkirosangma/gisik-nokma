import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import { GRAPH_GROUPS, GRAPH_MAX_HOPS, parseGraphRef, type GraphGroup } from '@gisik-nokma/domain';
import type { Queryable } from '../db/queryable.js';
import { READ_NOT_FOUND_BODY } from '../read/membership.js';
import { readGraphRing, type GraphRingRequest } from '../read/graph-neighbours.js';

const RING_QUERY_KEYS = ['center', 'hops', 'ws', 'proj', 'groups', 'cursor'] as const;
type RawRingQuery = Partial<Record<(typeof RING_QUERY_KEYS)[number], string>>;
const list = (raw: string | undefined) => (raw === undefined || raw === '' ? [] : raw.split(','));
const DEFAULT_GROUPS = GRAPH_GROUPS.filter((g) => g !== 'concepts');

/**
 * Null = 400. Every bound is checked before a query runs.
 *
 * A REPEATED key (`?ws=a&ws=b`) reaches the handler as an array whatever `RawRingQuery` says (Fastify's query parser),
 * and `.split` on it would throw a 500; so a parameter that is present and not a string is refused first (27.291), as
 * the other read routes refuse with `typeof raw.workspaceId !== 'string'`.
 */
export function parseRingQuery(raw: RawRingQuery): GraphRingRequest | null {
  if (RING_QUERY_KEYS.some((key) => raw[key] !== undefined && typeof raw[key] !== 'string')) return null;
  const center = raw.center === undefined ? null : parseGraphRef(raw.center);
  if (center === null) return null;
  if (!/^[1-9]$/.test(raw.hops ?? '')) return null;
  const hops = Number(raw.hops);
  if (hops > GRAPH_MAX_HOPS) return null;
  const workspaceIds = list(raw.ws);
  if (workspaceIds.length === 0 || workspaceIds.length > 20) return null;
  const projectIds = list(raw.proj);
  const groups = raw.groups === undefined ? DEFAULT_GROUPS : list(raw.groups);
  if (groups.some((g) => !(GRAPH_GROUPS as readonly string[]).includes(g))) return null;
  if (raw.cursor !== undefined && !/^(0|[1-9]\d{0,6})$/.test(raw.cursor)) return null;
  return { center, hops, workspaceIds, projectIds, groups: new Set(groups as GraphGroup[]), offset: raw.cursor === undefined ? 0 : Number(raw.cursor) };
}

/**
 * One ring of the Knowledge Graph (spec C §2.2). The viewer is `request.currentUserId`: never a parameter. A workspace
 * the viewer is not in, an unknown centre, and a centre they cannot see are the SAME 404, so the answer does not reveal
 * that an id exists (as every read route here). Who may see what is decided inside `readGraphRing`, by the predicates
 * every other read uses; this route adds none of its own.
 *
 * `hops` goes to 8 (`GRAPH_MAX_HOPS`), not the spec's 1..4 (§2.2): the client asks for hops 1…n and then one more ring
 * for the fog, so 4 clear hops already need ring 5, and "Everything" (§3.1) walks until a ring comes back empty.
 */
export function registerGraphRoutes(app: FastifyInstance, deps: { pool: Queryable }, requireSession: preHandlerHookHandler): void {
  app.get<{ Querystring: RawRingQuery }>('/v1/graph/neighbours', { preHandler: requireSession }, async (request, reply) => {
    const req = parseRingQuery(request.query);
    if (req === null) return reply.status(400).send({ error: 'invalid_query' });
    const ring = await readGraphRing(deps.pool, request.currentUserId, req);
    if (ring === null) return reply.status(404).send(READ_NOT_FOUND_BODY);
    return ring;
  });
}
