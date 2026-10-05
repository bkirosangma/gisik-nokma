import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import { GRAPH_GROUPS, GRAPH_TRACE_DIRECTIONS, GRAPH_TRACE_KINDS, parseGraphRef, type GraphGroup, type GraphTraceDirection, type GraphTraceKind } from '@gisik-nokma/domain';
import type { Queryable } from '../db/queryable.js';
import { PATH_DEFAULT_GROUPS, PATH_MAX_HOPS, readGraphPath, type GraphPathRequest } from '../read/graph-path.js';
import { readGraphTrace, TRACE_MAX_DEPTH, type GraphTraceRequest } from '../read/graph-trace.js';
import { READ_NOT_FOUND_BODY } from '../read/membership.js';

const PATH_KEYS = ['from', 'to', 'maxHops', 'groups'] as const;
const TRACE_KEYS = ['from', 'kind', 'direction', 'maxDepth'] as const;
type RawPathQuery = Partial<Record<(typeof PATH_KEYS)[number], string>>;
type RawTraceQuery = Partial<Record<(typeof TRACE_KEYS)[number], string>>;
const list = (raw: string | undefined) => (raw === undefined || raw === '' ? [] : raw.split(','));
const ref = (raw: string | undefined) => (raw === undefined || parseGraphRef(raw) === null ? null : raw);

/** `1..max` from its decimal digits only (no sign, no zero padding, no exponent); `fallback` when absent; `null` = 400. */
function bounded(raw: string | undefined, max: number, fallback: number): number | null {
  if (raw === undefined) return fallback;
  if (!/^[1-9]\d?$/.test(raw)) return null;
  const n = Number(raw);
  return n > max ? null : n;
}

/**
 * Null = 400. A REPEATED key reaches the handler as an array (Fastify's query parser), so a present non-string is
 * refused first, as `parseRingQuery` does (27.291).
 */
export function parsePathQuery(raw: RawPathQuery): GraphPathRequest | null {
  if (PATH_KEYS.some((key) => raw[key] !== undefined && typeof raw[key] !== 'string')) return null;
  const from = ref(raw.from);
  const to = ref(raw.to);
  const maxHops = bounded(raw.maxHops, PATH_MAX_HOPS, PATH_MAX_HOPS);
  if (from === null || to === null || maxHops === null) return null;
  const groups = raw.groups === undefined ? PATH_DEFAULT_GROUPS : list(raw.groups);
  if (groups.some((g) => !(GRAPH_GROUPS as readonly string[]).includes(g))) return null;
  return { from, to, maxHops, groups: new Set(groups as GraphGroup[]) };
}

export function parseTraceQuery(raw: RawTraceQuery): GraphTraceRequest | null {
  if (TRACE_KEYS.some((key) => raw[key] !== undefined && typeof raw[key] !== 'string')) return null;
  const from = ref(raw.from);
  const maxDepth = bounded(raw.maxDepth, TRACE_MAX_DEPTH, TRACE_MAX_DEPTH);
  if (from === null || maxDepth === null) return null;
  if (!(GRAPH_TRACE_KINDS as readonly string[]).includes(raw.kind ?? '')) return null;
  if (!(GRAPH_TRACE_DIRECTIONS as readonly string[]).includes(raw.direction ?? '')) return null;
  return { from, kind: raw.kind as GraphTraceKind, direction: raw.direction as GraphTraceDirection, maxDepth };
}

/**
 * Spec D §5.1's graph queries beside the ring (`routes/graph.ts`), for `graph_path` and `graph_trace`:
 * - `GET /v1/graph/path?from=<kind>:<id>&to=<kind>:<id>[&maxHops=1..6][&groups=g,…]` (`maxHops` defaults to 6, `groups`
 *   to every group but `projects` and `concepts`, `PATH_DEFAULT_GROUPS`);
 * - `GET /v1/graph/trace?from=<kind>:<id>&kind=blocks|parent|duplicates|ref&direction=out|in[&maxDepth=1..10]`.
 *
 * The viewer is the session, never a parameter, and who may see what is decided inside the reads, by the ring read's
 * own `resolve`. A hidden or unknown end is the same 404 as the ring's, so an id's existence is never revealed. A bad
 * parameter is 400 `invalid_query`, the ring's body.
 */
export function registerGraphQueryRoutes(app: FastifyInstance, deps: { pool: Queryable }, requireSession: preHandlerHookHandler): void {
  app.get<{ Querystring: RawPathQuery }>('/v1/graph/path', { preHandler: requireSession }, async (request, reply) => {
    const req = parsePathQuery(request.query);
    if (req === null) return reply.status(400).send({ error: 'invalid_query' });
    const answer = await readGraphPath(deps.pool, request.currentUserId, req);
    if (answer === null) return reply.status(404).send(READ_NOT_FOUND_BODY);
    return answer;
  });
  app.get<{ Querystring: RawTraceQuery }>('/v1/graph/trace', { preHandler: requireSession }, async (request, reply) => {
    const req = parseTraceQuery(request.query);
    if (req === null) return reply.status(400).send({ error: 'invalid_query' });
    const answer = await readGraphTrace(deps.pool, request.currentUserId, req);
    if (answer === null) return reply.status(404).send(READ_NOT_FOUND_BODY);
    return answer;
  });
}
