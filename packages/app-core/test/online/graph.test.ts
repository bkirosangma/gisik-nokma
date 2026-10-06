import { describe, expect, it } from 'vitest';
import type { GraphRingResponse } from '@gisik-nokma/domain';
import type { HttpClient } from '../../src/online/http.js';
import { createHttpGraphGateway } from '../../src/online/graph.js';

/** Knowledge Graph view plan, Task 9 (spec C §2.2): the web's `GraphSource`, case 27.340. */

type Call = { method: string; path: string };
function fakeHttp(body: unknown): HttpClient & { calls: Call[] } {
  const calls: Call[] = [];
  return {
    calls,
    get: async (path) => {
      calls.push({ method: 'GET', path });
      return body;
    },
    post: async () => undefined,
    put: async () => undefined,
    del: async () => undefined,
  } as HttpClient & { calls: Call[] };
}

const BODY = { hop: 2, center: {}, items: [], edges: [], frontier: [], truncated: false, cursor: null } as unknown as GraphRingResponse;

describe('createHttpGraphGateway', () => {
  it('27.340 ring() GETs one ring with the centre, hops, workspaces and groups, no proj when no project is chosen, and resolves the body as is; control: a chosen project adds proj', async () => {
    const http = fakeHttp(BODY);
    const gateway = createHttpGraphGateway(http);
    const answer = await gateway.ring({ center: 'ticket:01A', hops: 2, workspaceIds: ['w1', 'w2'], projectIds: [], groups: ['blocks', 'structure'] });
    expect(http.calls).toEqual([{ method: 'GET', path: '/v1/graph/neighbours?center=ticket%3A01A&hops=2&ws=w1%2Cw2&groups=blocks%2Cstructure' }]);
    expect(answer).toBe(BODY);

    // CONTROL, same it: with projects chosen, the same query gains `proj` (so the absence above is the projectIds branch);
    // two of them, so a fold that kept only the first would fail.
    await gateway.ring({ center: 'ticket:01A', hops: 2, workspaceIds: ['w1', 'w2'], projectIds: ['p1', 'p2'], groups: ['blocks', 'structure'] });
    expect(http.calls[1]).toEqual({ method: 'GET', path: '/v1/graph/neighbours?center=ticket%3A01A&hops=2&ws=w1%2Cw2&groups=blocks%2Cstructure&proj=p1%2Cp2' });
    // ...and ONE project is enough (the guard is `> 0`, not `> 1`).
    await gateway.ring({ center: 'ticket:01A', hops: 2, workspaceIds: ['w1', 'w2'], projectIds: ['p1'], groups: ['blocks', 'structure'] });
    expect(http.calls[2]).toEqual({ method: 'GET', path: '/v1/graph/neighbours?center=ticket%3A01A&hops=2&ws=w1%2Cw2&groups=blocks%2Cstructure&proj=p1' });
  });
});
