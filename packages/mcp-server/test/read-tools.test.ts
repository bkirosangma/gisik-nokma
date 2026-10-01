import { describe, expect, it } from 'vitest';
import { readTools } from '../src/tools/read-tools.js';
import type { Session } from '../src/session.js';

/**
 * Plan: MCP server, Task 8. Cases 14.60–14.66.
 */
function sessionRecording(answer: unknown): { session: Session; paths: string[] } {
  const paths: string[] = [];
  const session: Session = {
    userId: () => '01J0USER0000000000000000AA',
    get: async (path) => { paths.push(path); return answer; },
    post: async () => { throw new Error('not a read'); },
    postEvents: async () => { throw new Error('not a read'); },
  };
  return { session, paths };
}

function tool(name: string, session: Session) {
  const found = readTools(session).find((t) => t.name === name);
  if (found === undefined) throw new Error(`no tool named ${name}`);
  return found;
}

describe('the read tools', () => {
  it('14.60 list_workspaces passes the server body through unchanged', async () => {
    const body = { workspaces: [{ workspaceId: 'w1', name: 'Shop', role: 'owner', projects: [{ projectId: 'p1', name: 'Ops' }] }] };
    const { session, paths } = sessionRecording(body);
    expect(await tool('list_workspaces', session).handler({})).toEqual(body);
    expect(paths).toEqual(['/v1/me/workspaces']);
  });

  it('14.61 list_projects reads the workspaces route, because no projects route exists', async () => {
    const body = { workspaces: [
      { workspaceId: 'w1', name: 'Shop', role: 'owner', projects: [{ projectId: 'p1', name: 'Ops' }] },
      { workspaceId: 'w2', name: 'Other', role: 'guest', projects: [{ projectId: 'p2', name: 'Else' }] },
    ] };
    const { session, paths } = sessionRecording(body);
    expect(await tool('list_projects', session).handler({ workspaceId: 'w1' })).toEqual({
      workspaceId: 'w1',
      projects: [{ projectId: 'p1', name: 'Ops' }],
    });
    expect(paths).toEqual(['/v1/me/workspaces']);
  });

  it('14.62 list_projects answers an empty list for a workspace the person cannot see', async () => {
    const { session } = sessionRecording({ workspaces: [] });
    expect(await tool('list_projects', session).handler({ workspaceId: 'nope' })).toEqual({
      workspaceId: 'nope', projects: [],
    });
  });

  it('14.63 search_tickets encodes q and workspaceId, and omits an absent filter', async () => {
    const { session, paths } = sessionRecording({ workspaceId: 'w1', query: 'gst', hits: [] });
    await tool('search_tickets', session).handler({ workspaceId: 'w1', query: 'gst return' });
    expect(paths).toEqual(['/v1/search?workspaceId=w1&q=gst+return']);
  });

  it('14.64 search_tickets refuses a filter carrying `text` before the network', async () => {
    const { session, paths } = sessionRecording({});
    // The server answers 400 {error:'invalid_filter'} for this. Refusing it
    // here as well is not a duplicated rule: it is the difference between an
    // assistant being told which of its two text terms is the problem and
    // being told "invalid_filter".
    await expect(
      tool('search_tickets', session).handler({ workspaceId: 'w1', query: 'x', filter: { text: 'y' } }),
    ).rejects.toThrow(/text/);
    expect(paths).toEqual([]);
  });

  it('14.65 list_tickets JSON-encodes the FilterSpec into one filter parameter', async () => {
    const { session, paths } = sessionRecording({ projectId: 'p1', groupBy: 'flat', groups: [], nextCursor: null });
    await tool('list_tickets', session).handler({
      projectId: 'p1', groupBy: 'status', filter: { stateCategory: 'open' }, limit: 25,
    });
    // Built with the same URLSearchParams construction the handler uses, so
    // parameter ORDER cannot drift between test and code and turn a correct
    // handler red. What is asserted is the encoding — one `filter` parameter
    // carrying the whole JSON-stringified spec — not the ordering.
    const expected = new URLSearchParams();
    expected.set('groupBy', 'status');
    expected.set('limit', '25');
    expected.set('filter', JSON.stringify({ stateCategory: 'open' }));
    expect(paths).toEqual([`/v1/projects/p1/tickets?${expected.toString()}`]);
  });

  it('14.66 get_ticket passes both casings through untouched', async () => {
    const body = {
      ticket: { ticket_id: 't1', workspace_id: 'w1', project_id: 'p1', parent_id: null, own_mode: 'inherit', resolved_mode: 'project', seq: 3 },
      ticketState: { kind: 'ticket', id: 't1', assigneeId: null, collaboratorIds: [] },
      title: 'A ticket', stateProvenance: null, parent: null, rollup: null,
    };
    const { session, paths } = sessionRecording(body);
    expect(await tool('get_ticket', session).handler({ workspaceId: 'w1', ticketId: 't1' })).toEqual(body);
    expect(paths).toEqual(['/v1/workspaces/w1/tickets/t1']);
    // The mixed casing is the SERVER's contract. Normalising it here would be
    // this package inventing a shape, which is exactly what the spec forbids.
  });
});
