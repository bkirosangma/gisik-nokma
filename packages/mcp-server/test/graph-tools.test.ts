import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { edgeSentence, type GraphEdgeView, type GraphItemView } from '@gisik-nokma/domain';
import { HttpError } from '../src/http-client.js';
import type { Session } from '../src/session.js';
import { graphTools } from '../src/tools/graph-tools.js';
import type { ToolDefinition } from '../src/tools/read-tools.js';
import { allTools } from '../src/tools/register.js';
import { NO_TRANSFER } from './fixtures/fake-session.js';
import { TOOL_NAMES_BY_MODULE } from './fixtures/tool-names.js';

/**
 * Knowledge Graph spec D §5.1 (plan 2026-10-03-mcp-graph-semantic-layer.md, Tasks 2 and 6): the MCP `similar` tool
 * and the `search` description, cases 27.431–27.432; the graph tools `graph_neighbours`, `graph_path` and
 * `graph_trace`, cases 27.511–27.514. The server halves are `apps/server/test/routes/similar.test.ts` (27.430) and
 * `apps/server/test/graph/` (27.506–27.510, 27.513's server half); the hosted door's parity is 14.262
 * (`mcp-http.test.ts`), which compares to `allTools`.
 */
const byName = (tools: ToolDefinition[], name: string): ToolDefinition => {
  const tool = tools.find((t) => t.name === name);
  if (tool === undefined) throw new Error(`no tool ${name}`);
  return tool;
};

function sessionWith(get: Session['get']): Session {
  return {
    userId: () => '01J0A5ER0000000000000000AA',
    get,
    post: async () => ({}),
    postEvents: async () => ({ results: [] }),
    ...NO_TRANSFER,
  };
}

const SIMILAR_DESCRIPTION =
  'The tickets and notes nearest to one item by MEANING (what they say, not the words they share), with a ' +
  'similarity score from −1 to 1 (cosine similarity; higher is closer; unrelated items sit near 0). ' +
  'Up to k (default 10, at most 20), only items you can see. A ticket counts ' +
  'its comments. Items written in the last few seconds may not be indexed yet.';

describe('27.431–27.432 the MCP graph reads (KG-D T2)', () => {
  it('27.431 — similar GETs the encoded path and returns the route’s body; a 404 is the item sentence', async () => {
    const paths: string[] = [];
    const body = { workspaceId: 'w', item: { kind: 'ticket', id: 't' }, hits: [{ kind: 'note', id: 'n', title: 'N', score: 0.9 }] };
    const similar = byName(
      graphTools(
        sessionWith(async (path) => {
          paths.push(path);
          return body;
        }),
      ),
      'similar',
    );
    expect(similar?.name).toBe('similar');
    expect(similar?.description).toBe(SIMILAR_DESCRIPTION);

    expect(await similar!.handler({ workspaceId: 'w', item: { kind: 'ticket', id: 't' }, k: 3 })).toEqual(body);
    expect(paths).toEqual(['/v1/workspaces/w/similar?item=ticket%3At&k=3']);
    // Control: without k, no k at all (not `&k=undefined`).
    await similar!.handler({ workspaceId: 'w', item: { kind: 'ticket', id: 't' } });
    expect(paths[1]).toBe('/v1/workspaces/w/similar?item=ticket%3At');
    // k's bounds are the route's (1–20): 20 is asked, 21 and 0 are refused before any request.
    await similar!.handler({ workspaceId: 'w', item: { kind: 'note', id: 'n' }, k: 20 });
    expect(paths[2]).toBe('/v1/workspaces/w/similar?item=note%3An&k=20');
    await expect(similar!.handler({ workspaceId: 'w', item: { kind: 'note', id: 'n' }, k: 21 })).rejects.toThrow();
    await expect(similar!.handler({ workspaceId: 'w', item: { kind: 'note', id: 'n' }, k: 0 })).rejects.toThrow();
    await expect(similar!.handler({ workspaceId: 'w', item: { kind: 'note', id: 'n' }, k: 1.5 })).rejects.toThrow();
    await expect(similar!.handler({ workspaceId: 'w', item: { kind: 'widget', id: 'n' } })).rejects.toThrow();
    expect(paths).toHaveLength(3);
    // Every path segment is encoded, the workspace id too.
    await similar!.handler({ workspaceId: 'w/x', item: { kind: 'ticket', id: 'a b' } });
    expect(paths[3]).toBe('/v1/workspaces/w%2Fx/similar?item=ticket%3Aa%20b');
    // The registered schema says the same (the SDK reads `inputSchema`, not the handler's parse).
    const schema = z.object(similar!.inputSchema);
    expect(schema.safeParse({ workspaceId: 'w', item: { kind: 'ticket', id: 't' }, k: 20 }).success).toBe(true);
    expect(schema.safeParse({ workspaceId: 'w', item: { kind: 'ticket', id: 't' }, k: 21 }).success).toBe(false);

    const refusing = byName(
      graphTools(
        sessionWith(async () => {
          throw new HttpError(404, { error: 'not_found' });
        }),
      ),
      'similar',
    );
    await expect(refusing!.handler({ workspaceId: 'w', item: { kind: 'ticket', id: 't' } })).rejects.toThrow(
      /^item not found or not visible to you$/,
    );
  });

  it('27.432 — the graph block is registered directly after list_deleted, and search says meaning covers tickets', () => {
    const tools = allTools(sessionWith(async () => ({})));
    const names = tools.map((tool) => tool.name);
    expect(names.indexOf('list_deleted')).toBeGreaterThan(-1);
    // `similar` itself until KG-D T6 put graph_neighbours, graph_path and graph_trace before it (27.514).
    expect(names.indexOf('graph_neighbours')).toBe(names.indexOf('list_deleted') + 1);
    expect(names.indexOf('similar')).toBe(names.indexOf('list_deleted') + 4);

    const search = tools.find((tool) => tool.name === 'search')?.description ?? '';
    expect(search).toContain('"CCSO-12"'); // control: it is the search description
    expect(search).not.toContain('answers notes only');
    expect(search).toContain('`mode: "meaning"` ranks by what they say rather than the words they use, for tickets (their title, description and comments) and notes alike.');
  });
});

/** A ring item as the fake serves it (only the fields the tool reads matter; the rest keep the wire shape). */
const item = (ref: string, label: string): GraphItemView => {
  const [kind, id] = ref.split(':') as [GraphItemView['kind'], string];
  return { ref, kind, id, workspaceId: 'w', projectId: null, label, title: null, category: null, hop: 1, out: false, suggested: false };
};
const edge = (kind: GraphEdgeView['kind'], from: string, to: string): GraphEdgeView => ({
  id: `${kind}|${from}|${to}`, kind, from, to, snippet: null, addedBy: null, addedAt: null, origin: null, suggested: false,
});
const DIRECTORY = {
  workspaces: [
    { workspaceId: 'w', name: 'W', prefix: 'W', role: 'owner', archived: false, projects: [] },
    { workspaceId: 'w2', name: 'W2', prefix: 'V', role: 'member', archived: true, projects: [] },
  ],
};
const NEIGHBOURS_DESCRIPTION =
  'Items linked to one ticket, note, person, project, workspace or concept, ring by ring up to 4 hops, with each link as a ' +
  'sentence ("GN-133 blocks GN-142"). Same visibility and scope rules as the Knowledge Graph: you never see an ' +
  'item you cannot open, nor a link into one.';
const PATH_DESCRIPTION = 'Up to 3 shortest chains of links between two items (at most 6 hops), each as a list of sentences. Only through items you can see.';
const TRACE_DESCRIPTION =
  'Follow one kind of link transitively from an item: everything that blocks it (kind blocks, direction in), ' +
  'everything it blocks (out), its parents (parent, out) or subtasks (parent, in), duplicates, or text links ' +
  '(ref). Stops at anything you cannot see.';

describe('27.511–27.514 the MCP graph tools (KG-D T6)', () => {
  it('27.511 — graph_neighbours reads rings 1..hops page by page over every workspace, merges by ref and edge id, and writes one sentence per edge; control: a scope is used as given', async () => {
    const C = item('ticket:t', 'GN-1');
    const pages: Record<string, unknown> = {
      '1|': { hop: 1, center: C, items: [item('ticket:a', 'GN-2')], edges: [edge('blocks', 'ticket:t', 'ticket:a')], frontier: [], truncated: true, cursor: '2000' },
      '1|2000': { hop: 1, center: C, items: [item('note:n', 'Venue notes')], edges: [edge('attached', 'note:n', 'ticket:t')], frontier: [], truncated: false, cursor: null },
      '2|': { hop: 2, center: C, items: [item('note:n', 'Venue notes'), item('ticket:b', 'GN-3')], edges: [edge('blocks', 'ticket:t', 'ticket:a'), edge('relates', 'ticket:a', 'ticket:b')], frontier: [], truncated: false, cursor: null },
    };
    const paths: string[] = [];
    const tool = byName(
      graphTools(
        sessionWith(async (path) => {
          paths.push(path);
          if (path === '/v1/me/workspaces') return DIRECTORY;
          const q = new URLSearchParams(path.slice(path.indexOf('?') + 1));
          return pages[`${q.get('hops') ?? ''}|${q.get('cursor') ?? ''}`];
        }),
      ),
      'graph_neighbours',
    );
    expect(tool.description).toBe(NEIGHBOURS_DESCRIPTION);
    const answer = (await tool.handler({ center: { kind: 'ticket', id: 't' }, hops: 2 })) as {
      center: GraphItemView | null; items: GraphItemView[]; edges: GraphEdgeView[]; sentences: string[];
    };
    expect(paths).toEqual([
      '/v1/me/workspaces',
      '/v1/graph/neighbours?center=ticket%3At&hops=1&ws=w%2Cw2',
      '/v1/graph/neighbours?center=ticket%3At&hops=1&ws=w%2Cw2&cursor=2000',
      '/v1/graph/neighbours?center=ticket%3At&hops=2&ws=w%2Cw2',
    ]);
    // Merged once each: note:n was served on two pages, the blocks edge on two rings.
    expect(answer.items.map((i) => i.ref)).toEqual(['ticket:a', 'note:n', 'ticket:b']);
    expect(answer.items.filter((i) => i.ref === 'note:n')).toHaveLength(1);
    expect(answer.edges.map((e) => e.id)).toEqual(['blocks|ticket:t|ticket:a', 'attached|note:n|ticket:t', 'relates|ticket:a|ticket:b']);
    expect(answer.center).toEqual(C);
    const labels = new Map([[C.ref, C.label], ...answer.items.map((i): [string, string] => [i.ref, i.label])]);
    answer.edges.forEach((e, index) => expect(answer.sentences[index]).toBe(edgeSentence(e, (ref) => labels.get(ref) ?? '')));
    // The centre labels a ring-1 edge: both ends' labels are in the first sentence.
    expect(answer.sentences).toEqual(['GN-1 blocks GN-2', 'Venue notes is attached to GN-1', 'GN-2 relates to GN-3']);

    // `hops` is 1..4: 5 is refused before any request, and so is a kind the graph has no node for.
    const before = paths.length;
    await expect(tool.handler({ center: { kind: 'ticket', id: 't' }, hops: 5 })).rejects.toThrow();
    await expect(tool.handler({ center: { kind: 'widget', id: 't' } })).rejects.toThrow();
    expect(paths).toHaveLength(before);
    const schema = z.object(tool.inputSchema);
    expect(schema.safeParse({ center: { kind: 'concept', id: 'c' }, hops: 4 }).success).toBe(true);
    expect(schema.safeParse({ center: { kind: 'ticket', id: 't' }, hops: 5 }).success).toBe(false);
    expect(schema.safeParse({ center: { kind: 'ticket', id: 't' }, hops: 0 }).success).toBe(false);
    expect(schema.safeParse({ center: { kind: 'ticket', id: 't' }, scope: { workspaces: [] } }).success).toBe(false);
    const ws = (n: number) => Array.from({ length: n }, (_, i) => `w${String(i)}`);
    expect(schema.safeParse({ center: { kind: 'ticket', id: 't' }, scope: { workspaces: ws(20) } }).success).toBe(true);
    expect(schema.safeParse({ center: { kind: 'ticket', id: 't' }, scope: { workspaces: ws(21) } }).success).toBe(false);

    // Control: a scope is used as given (no directory read), with its projects and the named groups; hops defaults to 2.
    paths.length = 0;
    await tool.handler({ center: { kind: 'note', id: 'n' }, scope: { workspaces: ['w9'], projects: ['p1', 'p2'] }, groups: ['blocks', 'concepts'] });
    expect(paths).toEqual([
      '/v1/graph/neighbours?center=note%3An&hops=1&ws=w9&proj=p1%2Cp2&groups=blocks%2Cconcepts',
      '/v1/graph/neighbours?center=note%3An&hops=1&ws=w9&proj=p1%2Cp2&groups=blocks%2Cconcepts&cursor=2000',
      '/v1/graph/neighbours?center=note%3An&hops=2&ws=w9&proj=p1%2Cp2&groups=blocks%2Cconcepts',
    ]);
    // An empty project list is no project scope: no `proj=` at all.
    paths.length = 0;
    await tool.handler({ center: { kind: 'note', id: 'n' }, hops: 1, scope: { workspaces: ['w9'], projects: [] } });
    expect(paths).toEqual(['/v1/graph/neighbours?center=note%3An&hops=1&ws=w9', '/v1/graph/neighbours?center=note%3An&hops=1&ws=w9&cursor=2000']);
  });

  it('27.511 — graph_neighbours: a centre the route does not carry labels nothing; more than 20 workspaces is a sentence; a 404 is the item sentence', async () => {
    const ring = { hop: 1, items: [item('ticket:a', 'GN-2')], edges: [edge('blocks', 'ticket:t', 'ticket:a')], frontier: [], truncated: false, cursor: null };
    const bare = byName(graphTools(sessionWith(async () => ring)), 'graph_neighbours');
    expect(await bare.handler({ center: { kind: 'ticket', id: 't' }, hops: 1, scope: { workspaces: ['w'] } })).toEqual({
      center: null, items: ring.items, edges: ring.edges, sentences: [' blocks GN-2'],
    });
    const many = { workspaces: Array.from({ length: 21 }, (_, i) => ({ workspaceId: `w${String(i)}`, name: 'W', prefix: 'W', role: 'member', archived: false, projects: [] })) };
    const crowded = byName(graphTools(sessionWith(async (path) => (path === '/v1/me/workspaces' ? many : ring))), 'graph_neighbours');
    await expect(crowded.handler({ center: { kind: 'ticket', id: 't' } })).rejects.toThrow(/^you are in more than 20 workspaces: name up to 20 in scope\.workspaces$/);
    // Control: exactly 20 is asked.
    const twenty = { workspaces: many.workspaces.slice(0, 20) };
    const fits = byName(graphTools(sessionWith(async (path) => (path === '/v1/me/workspaces' ? twenty : ring))), 'graph_neighbours');
    expect(await fits.handler({ center: { kind: 'ticket', id: 't' }, hops: 1 })).toMatchObject({ items: ring.items });
    const refusing = byName(graphTools(sessionWith(async () => { throw new HttpError(404, { error: 'not_found' }); })), 'graph_neighbours');
    await expect(refusing.handler({ center: { kind: 'ticket', id: 't' }, scope: { workspaces: ['w'] } })).rejects.toThrow(/^item not found or not visible to you$/);
  });

  it('27.512 — graph_path and graph_trace GET the encoded route and return its body untouched; no optional key is sent unasked; a 404 is the item sentence', async () => {
    const paths: string[] = [];
    const tools = graphTools(
      sessionWith(async (path) => {
        paths.push(path);
        return path.startsWith('/v1/graph/path') ? { marker: 'p', paths: [] } : { marker: 't', chain: [] };
      }),
    );
    const gPath = byName(tools, 'graph_path');
    const gTrace = byName(tools, 'graph_trace');
    expect(gPath.description).toBe(PATH_DESCRIPTION);
    expect(gTrace.description).toBe(TRACE_DESCRIPTION);
    expect(await gPath.handler({ from: { kind: 'ticket', id: 't' }, to: { kind: 'note', id: 'n' }, maxHops: 3 })).toEqual({ marker: 'p', paths: [] });
    expect(await gTrace.handler({ from: { kind: 'ticket', id: 't' }, kind: 'blocks', direction: 'in', maxDepth: 4 })).toEqual({ marker: 't', chain: [] });
    await gPath.handler({ from: { kind: 'ticket', id: 't' }, to: { kind: 'note', id: 'n' } });
    await gTrace.handler({ from: { kind: 'ticket', id: 't' }, kind: 'parent', direction: 'out' });
    await gPath.handler({ from: { kind: 'ticket', id: 'a b' }, to: { kind: 'concept', id: 'c' }, groups: ['projects', 'ref'] });
    expect(paths).toEqual([
      '/v1/graph/path?from=ticket%3At&to=note%3An&maxHops=3',
      '/v1/graph/trace?from=ticket%3At&kind=blocks&direction=in&maxDepth=4',
      '/v1/graph/path?from=ticket%3At&to=note%3An',
      '/v1/graph/trace?from=ticket%3At&kind=parent&direction=out',
      '/v1/graph/path?from=ticket%3Aa%20b&to=concept%3Ac&groups=projects%2Cref',
    ]);
    // The bounds are the routes' (maxHops 1..6, maxDepth 1..10), refused before any request.
    for (const bad of [{ maxHops: 7 }, { maxHops: 0 }]) await expect(gPath.handler({ from: { kind: 'ticket', id: 't' }, to: { kind: 'note', id: 'n' }, ...bad })).rejects.toThrow();
    for (const bad of [{ maxDepth: 11 }, { maxDepth: 0 }, { kind: 'relates' }, { direction: 'up' }]) {
      await expect(gTrace.handler({ from: { kind: 'ticket', id: 't' }, kind: 'blocks', direction: 'out', ...bad })).rejects.toThrow();
    }
    expect(paths).toHaveLength(5);
    expect(z.object(gPath.inputSchema).safeParse({ from: { kind: 'ticket', id: 't' }, to: { kind: 'ticket', id: 'u' }, maxHops: 6 }).success).toBe(true);
    expect(z.object(gTrace.inputSchema).safeParse({ from: { kind: 'ticket', id: 't' }, kind: 'ref', direction: 'out', maxDepth: 10 }).success).toBe(true);

    const refusing = graphTools(sessionWith(async () => { throw new HttpError(404, { error: 'not_found' }); }));
    await expect(byName(refusing, 'graph_path').handler({ from: { kind: 'ticket', id: 't' }, to: { kind: 'note', id: 'n' } })).rejects.toThrow(/^item not found or not visible to you$/);
    await expect(byName(refusing, 'graph_trace').handler({ from: { kind: 'ticket', id: 't' }, kind: 'ref', direction: 'out' })).rejects.toThrow(/^item not found or not visible to you$/);
  });

  it('27.513 — no tool takes a semantic-layer parameter (D6 is view-only); control: the scan reads real, nested schemas', () => {
    const keysOf = (shape: z.ZodRawShape, prefix = ''): string[] =>
      Object.entries(shape).flatMap(([key, schema]) => {
        let inner: z.ZodTypeAny = schema;
        while (inner instanceof z.ZodOptional || inner instanceof z.ZodNullable) inner = inner.unwrap() as z.ZodTypeAny;
        return [`${prefix}${key}`, ...(inner instanceof z.ZodObject ? keysOf(inner.shape as z.ZodRawShape, `${prefix}${key}.`) : [])];
      });
    const keys = allTools(sessionWith(async () => ({}))).flatMap((tool) => keysOf(tool.inputSchema).map((key) => `${tool.name}:${key}`));
    expect(keys.filter((key) => /semantic|layer|switch/i.test(key.slice(key.indexOf(':') + 1)))).toEqual([]);
    expect(keys).toEqual(expect.arrayContaining(['graph_neighbours:groups', 'graph_neighbours:scope.workspaces', 'graph_path:maxHops']));
  });

  it('27.514 — the graph block is graph_neighbours, graph_path, graph_trace, similar, in that order, after list_deleted, and the fixture agrees', () => {
    const names = allTools(sessionWith(async () => ({}))).map((tool) => tool.name);
    const at = names.indexOf('list_deleted');
    expect(names.slice(at + 1, at + 5)).toEqual(['graph_neighbours', 'graph_path', 'graph_trace', 'similar']);
    expect(TOOL_NAMES_BY_MODULE.graph).toEqual(['graph_neighbours', 'graph_path', 'graph_trace', 'similar']);
    expect(graphTools(sessionWith(async () => ({}))).map((tool) => tool.name)).toEqual(['graph_neighbours', 'graph_path', 'graph_trace', 'similar']);
  });
});
