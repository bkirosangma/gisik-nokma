import {
  edgeSentence, graphRef, parseGraphRef,
  type GraphEdgeView, type GraphItemView, type GraphTraceDirection, type GraphTraceKind, type GraphTraceResponse,
} from '@gisik-nokma/domain';
import type { Queryable } from '../db/queryable.js';
import { createGraphVisibility } from './graph-neighbours.js';

/** Spec D §5.1 `graph_trace`: `maxDepth ≤ 10`. The route refuses a larger one with this bound. */
export const TRACE_MAX_DEPTH = 10;
export type GraphTraceRequest = { from: string; kind: GraphTraceKind; direction: GraphTraceDirection; maxDepth: number };

type Step = { from: string; to: string };
const byPair = (x: Step, y: Step) => (x.from < y.from ? -1 : x.from > y.from ? 1 : x.to < y.to ? -1 : x.to > y.to ? 1 : 0);

/**
 * One step of the chain from `frontier` (refs), unfiltered: the caller keeps only what `resolve` returns. `out` follows
 * the link's own direction: a blocker to what it blocks, a duplicate to its original, a text to what it links to, and
 * a subtask UP to its parent. `in` walks each of them back.
 */
async function step(db: Queryable, frontier: readonly string[], kind: GraphTraceKind, direction: GraphTraceDirection): Promise<Step[]> {
  const parsed = frontier.map(parseGraphRef);
  const ticketIds = parsed.filter((r) => r?.kind === 'ticket').map((r) => r!.id);
  if (kind === 'blocks' || kind === 'duplicates') {
    const [near, far] = direction === 'out' ? ['source_id', 'target_id'] : ['target_id', 'source_id'];
    const { rows } = await db.query<{ a: string; b: string }>(`SELECT ${near} AS a, ${far} AS b FROM proj_ticket_links WHERE kind = $1 AND ${near} = ANY ($2::text[])`, [kind, ticketIds]);
    return rows.map((row) => ({ from: graphRef('ticket', row.a), to: graphRef('ticket', row.b) }));
  }
  if (kind === 'parent') {
    const sql = direction === 'out'
      ? 'SELECT ticket_id AS a, parent_id AS b FROM proj_tickets WHERE ticket_id = ANY ($1::text[]) AND parent_id IS NOT NULL'
      : 'SELECT parent_id AS a, ticket_id AS b FROM proj_tickets WHERE parent_id = ANY ($1::text[])';
    const { rows } = await db.query<{ a: string; b: string }>(sql, [ticketIds]);
    return rows.map((row) => ({ from: graphRef('ticket', row.a), to: graphRef('ticket', row.b) }));
  }
  // ref: plan B's proj_references, from the item a text belongs to (a comment's is its ticket) to the ticket or note it
  // links to. People are not items of a chain: a mention is the `people` group's, never a `ref` step.
  const noteIds = parsed.filter((r) => r?.kind === 'note').map((r) => r!.id);
  const sql = direction === 'out'
    ? `SELECT source_parent_kind AS ak, source_parent_id AS a, target_kind AS bk, target_id AS b FROM proj_references
        WHERE ((source_parent_kind = 'ticket' AND source_parent_id = ANY ($1::text[])) OR (source_parent_kind = 'note' AND source_parent_id = ANY ($2::text[])))
          AND target_kind IN ('ticket', 'note')`
    : `SELECT target_kind AS ak, target_id AS a, source_parent_kind AS bk, source_parent_id AS b FROM proj_references
        WHERE (target_kind = 'ticket' AND target_id = ANY ($1::text[])) OR (target_kind = 'note' AND target_id = ANY ($2::text[]))`;
  const { rows } = await db.query<{ ak: 'ticket' | 'note'; a: string; bk: 'ticket' | 'note'; b: string }>(sql, [ticketIds, noteIds]);
  return rows.map((row) => ({ from: graphRef(row.ak, row.a), to: graphRef(row.bk, row.b) }));
}

/**
 * Spec D §5.1 `graph_trace`: the transitive chain, breadth-first, ending at a hidden node (it is not returned, and
 * nothing past it is reached) and at a repeat (a cycle ends at the first one). Each layer's steps are sorted by
 * (via, ref), so a node two items reach is credited to the lower ref and the chain is the same on every call.
 * `null` when the start is hidden or unknown (the route's one 404).
 */
export async function traceChain(db: Queryable, viewerId: string, req: GraphTraceRequest) {
  const { from, kind, direction } = req;
  const vis = createGraphVisibility(db, viewerId);
  const start = await vis.resolve([from]);
  if (!start.has(from)) return null;
  const seen = new Set([from]);
  const items = new Map(start);
  const chain: GraphTraceResponse['chain'] = [];
  let frontier = [from];
  for (let depth = 1; depth <= Math.min(req.maxDepth, TRACE_MAX_DEPTH) && frontier.length > 0; depth += 1) {
    const steps = (await step(db, frontier, kind, direction)).filter((s) => !seen.has(s.to)).sort(byPair);
    const resolved = await vis.resolve(steps.map((s) => s.to));
    const next: string[] = [];
    for (const s of steps) {
      const item = resolved.get(s.to);
      if (item === undefined || seen.has(s.to)) continue; // hidden: the chain ends here, and nothing past it is reached
      seen.add(s.to);
      items.set(s.to, item);
      chain.push({ ref: s.to, depth, via: s.from });
      next.push(s.to);
    }
    frontier = next;
  }
  return { chain, items, vis };
}

/**
 * The edge a chain entry stands for, read the way the graph draws it (`edgeSentence` reads from `from`): a blocker,
 * a duplicate and a linking text are the source; for `parent`, the ring's edge runs parent → subtask ("has subtask",
 * `expand` in `graph-neighbours.ts`), which is the reverse of a trace's `out` (subtask → parent).
 */
function entryEdge(kind: GraphTraceKind, direction: GraphTraceDirection, entry: { ref: string; via: string }): GraphEdgeView {
  const forward = kind === 'parent' ? direction === 'in' : direction === 'out';
  const [from, to] = forward ? [entry.via, entry.ref] : [entry.ref, entry.via];
  return { id: `${kind}|${from}|${to}`, kind, from, to, snippet: null, addedBy: null, addedAt: null, origin: null, suggested: false };
}

/** The trace answer: the chain, its items (labelled by card key, asked ONCE), and one sentence per entry. */
export async function readGraphTrace(db: Queryable, viewerId: string, req: GraphTraceRequest): Promise<GraphTraceResponse | null> {
  const found = await traceChain(db, viewerId, req);
  if (found === null) return null;
  const { chain, vis } = found;
  const depthOf = new Map<string, number>([[req.from, 0], ...chain.map((entry): [string, number] => [entry.ref, entry.depth])]);
  const resolved = [...found.items.values()];
  const keys = await vis.keysFor(resolved);
  const items: GraphItemView[] = resolved.map((item) => ({ ...item, label: keys.get(item.id) ?? item.label, hop: depthOf.get(item.ref)!, out: false }));
  const labels = new Map(items.map((item) => [item.ref, item.label]));
  const labelOf = (ref: string) => labels.get(ref) ?? '';
  return {
    from: req.from,
    kind: req.kind,
    direction: req.direction,
    chain,
    items,
    sentences: chain.map((entry) => edgeSentence(entryEdge(req.kind, req.direction, entry), labelOf)),
  };
}
