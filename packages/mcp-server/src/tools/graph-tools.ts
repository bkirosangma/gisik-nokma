import { z } from 'zod';
import {
  edgeSentence, GRAPH_GROUPS, GRAPH_ITEM_KINDS, GRAPH_TRACE_DIRECTIONS, GRAPH_TRACE_KINDS,
  type GraphEdgeView, type GraphItemView,
} from '@gisik-nokma/domain';
import type { Session } from '../session.js';
import { readDirectory } from './directory.js';
import type { ToolDefinition } from './read-tools.js';
import { readOrNotFound } from './reads.js';

/**
 * Knowledge Graph spec D §5.1: the graph and meaning READS. Every one calls the HTTP API, so the server's
 * visibility answers for it (`reads.ts`). D6's switch has no effect on any of them (§5.2 "Switch"): no tool takes a
 * semantic-layer parameter (27.513).
 */
const id = z.string().min(1);
const enc = encodeURIComponent;
const itemRef = z.object({ kind: z.enum(['ticket', 'note']), id });
const similarShape = { workspaceId: id, item: itemRef, k: z.number().int().min(1).max(20).optional() };
const graphRef = z.object({ kind: z.enum(GRAPH_ITEM_KINDS), id });
const groups = z.array(z.enum(GRAPH_GROUPS)).optional();
/** The ring route's own bound on `ws` (`apps/server/src/routes/graph.ts`, `parseRingQuery`). */
const RING_MAX_WORKSPACES = 20;
const neighboursShape = {
  center: graphRef,
  hops: z.number().int().min(1).max(4).optional(),
  groups,
  scope: z.object({ workspaces: z.array(id).min(1).max(RING_MAX_WORKSPACES), projects: z.array(id).optional() }).optional(),
};
const pathShape = { from: graphRef, to: graphRef, maxHops: z.number().int().min(1).max(6).optional(), groups };
const traceShape = {
  from: graphRef,
  kind: z.enum(GRAPH_TRACE_KINDS),
  direction: z.enum(GRAPH_TRACE_DIRECTIONS),
  maxDepth: z.number().int().min(1).max(10).optional(),
};
const refOf = (r: { kind: string; id: string }) => `${r.kind}:${r.id}`;
/** One page of one ring, as `GET /v1/graph/neighbours` answers it; `center` once the route carries it (KG-C T7, ruling Q1). */
type RingPage = { center?: GraphItemView; items: GraphItemView[]; edges: GraphEdgeView[]; cursor: string | null };

/**
 * `graph_neighbours`: rings 1..hops, each page followed to its end, merged by ref and by edge id, with one sentence per
 * edge over the merged labels (the centre's too, so a ring-1 edge reads from it).
 */
async function neighbours(session: Session, a: z.infer<z.ZodObject<typeof neighboursShape>>) {
  const workspaces = a.scope?.workspaces ?? (await readDirectory(session)).map((w) => w.workspaceId);
  if (workspaces.length > RING_MAX_WORKSPACES) {
    throw new Error(`you are in more than ${String(RING_MAX_WORKSPACES)} workspaces: name up to ${String(RING_MAX_WORKSPACES)} in scope.workspaces`);
  }
  const items = new Map<string, GraphItemView>();
  const edges = new Map<string, GraphEdgeView>();
  let center: GraphItemView | null = null;
  for (let hop = 1; hop <= (a.hops ?? 2); hop += 1) {
    let cursor: string | null = null;
    do {
      const q = `center=${enc(refOf(a.center))}&hops=${String(hop)}&ws=${enc(workspaces.join(','))}` +
        (a.scope?.projects === undefined || a.scope.projects.length === 0 ? '' : `&proj=${enc(a.scope.projects.join(','))}`) +
        (a.groups === undefined ? '' : `&groups=${enc(a.groups.join(','))}`) +
        (cursor === null ? '' : `&cursor=${enc(cursor)}`);
      const ring = (await readOrNotFound(session, `/v1/graph/neighbours?${q}`, 'item')) as RingPage;
      center ??= ring.center ?? null;
      for (const item of ring.items) if (!items.has(item.ref)) items.set(item.ref, item);
      for (const edge of ring.edges) if (!edges.has(edge.id)) edges.set(edge.id, edge);
      cursor = ring.cursor;
    } while (cursor !== null);
  }
  const labels = new Map([...items.values()].map((item) => [item.ref, item.label]));
  if (center !== null) labels.set(center.ref, center.label);
  const merged = [...edges.values()];
  return { center, items: [...items.values()], edges: merged, sentences: merged.map((edge) => edgeSentence(edge, (ref) => labels.get(ref) ?? '')) };
}

export function graphTools(session: Session): ToolDefinition[] {
  return [
    {
      name: 'graph_neighbours',
      description:
        'Items linked to one ticket, note, person, project, workspace or concept, ring by ring up to 4 hops, with each link as a ' +
        'sentence ("GN-133 blocks GN-142"). Same visibility and scope rules as the Knowledge Graph: you never see an ' +
        'item you cannot open, nor a link into one.',
      inputSchema: neighboursShape,
      handler: async (args) => neighbours(session, z.object(neighboursShape).parse(args)),
    },
    {
      name: 'graph_path',
      description: 'Up to 3 shortest chains of links between two items (at most 6 hops), each as a list of sentences. Only through items you can see.',
      inputSchema: pathShape,
      handler: async (args) => {
        const a = z.object(pathShape).parse(args);
        const qs = `from=${enc(refOf(a.from))}&to=${enc(refOf(a.to))}` +
          (a.maxHops === undefined ? '' : `&maxHops=${String(a.maxHops)}`) +
          (a.groups === undefined ? '' : `&groups=${enc(a.groups.join(','))}`);
        return readOrNotFound(session, `/v1/graph/path?${qs}`, 'item');
      },
    },
    {
      name: 'graph_trace',
      description:
        'Follow one kind of link transitively from an item: everything that blocks it (kind blocks, direction in), ' +
        'everything it blocks (out), its parents (parent, out) or subtasks (parent, in), duplicates, or text links ' +
        '(ref). Stops at anything you cannot see.',
      inputSchema: traceShape,
      handler: async (args) => {
        const a = z.object(traceShape).parse(args);
        const qs = `from=${enc(refOf(a.from))}&kind=${a.kind}&direction=${a.direction}` + (a.maxDepth === undefined ? '' : `&maxDepth=${String(a.maxDepth)}`);
        return readOrNotFound(session, `/v1/graph/trace?${qs}`, 'item');
      },
    },
    {
      name: 'similar',
      description:
        'The tickets and notes nearest to one item by MEANING (what they say, not the words they share), with a ' +
        'similarity score from −1 to 1 (cosine similarity; higher is closer; unrelated items sit near 0). ' +
        'Up to k (default 10, at most 20), only items you can see. A ticket counts ' +
        'its comments. Items written in the last few seconds may not be indexed yet.',
      inputSchema: similarShape,
      handler: async (args) => {
        const a = z.object(similarShape).parse(args);
        const qs = `item=${enc(`${a.item.kind}:${a.item.id}`)}${a.k === undefined ? '' : `&k=${String(a.k)}`}`;
        return readOrNotFound(session, `/v1/workspaces/${enc(a.workspaceId)}/similar?${qs}`, 'item');
      },
    },
  ];
}
