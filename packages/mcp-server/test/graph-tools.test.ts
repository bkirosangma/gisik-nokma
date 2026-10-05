import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { HttpError } from '../src/http-client.js';
import type { Session } from '../src/session.js';
import { graphTools } from '../src/tools/graph-tools.js';
import { allTools } from '../src/tools/register.js';
import { NO_TRANSFER } from './fixtures/fake-session.js';

/**
 * Knowledge Graph spec D §5.1 (plan 2026-10-03-mcp-graph-semantic-layer.md, Task 2): the MCP `similar` tool
 * and the `search` description. Cases 27.431–27.432. The server half is `apps/server/test/routes/similar.test.ts`
 * (27.430); the hosted door's parity is 14.262 (`mcp-http.test.ts`), which compares to `allTools`.
 */
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
    const [similar] = graphTools(
      sessionWith(async (path) => {
        paths.push(path);
        return body;
      }),
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

    const [refusing] = graphTools(
      sessionWith(async () => {
        throw new HttpError(404, { error: 'not_found' });
      }),
    );
    await expect(refusing!.handler({ workspaceId: 'w', item: { kind: 'ticket', id: 't' } })).rejects.toThrow(
      /^item not found or not visible to you$/,
    );
  });

  it('27.432 — similar is registered directly after list_deleted, and search says meaning covers tickets', () => {
    const tools = allTools(sessionWith(async () => ({})));
    const names = tools.map((tool) => tool.name);
    expect(names.indexOf('list_deleted')).toBeGreaterThan(-1);
    expect(names.indexOf('similar')).toBe(names.indexOf('list_deleted') + 1);

    const search = tools.find((tool) => tool.name === 'search')?.description ?? '';
    expect(search).toContain('"CCSO-12"'); // control: it is the search description
    expect(search).not.toContain('answers notes only');
    expect(search).toContain('`mode: "meaning"` ranks by what they say rather than the words they use, for tickets (their title, description and comments) and notes alike.');
  });
});
