import { describe, expect, it } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { HttpError } from '../src/http-client.js';
import { registerTools } from '../src/tools/register.js';
import { projectTools } from '../src/tools/project-tools.js';
import { readTools } from '../src/tools/read-tools.js';
import { workspaceTools } from '../src/tools/workspace-tools.js';
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

/** `list_projects` moved to `project-tools.ts` in MCP CRUD plan Task 7 (it gained `include`); 14.61/14.62 still pin its reads. */
function listProjects(session: Session) {
  const found = projectTools(session).find((t) => t.name === 'list_projects');
  if (found === undefined) throw new Error('no tool named list_projects');
  return found;
}

describe('the read tools', () => {
  // `list_workspaces` moved to `workspace-tools.ts` in MCP CRUD plan Task 6 (it gained `include`);
  // this case stays here because its claim — a live workspace's directory row is passed through
  // unchanged — is still a read-tool claim.
  it('14.60 list_workspaces passes the server body through unchanged', async () => {
    const body = { workspaces: [{ workspaceId: 'w1', name: 'Shop', role: 'owner', projects: [{ projectId: 'p1', name: 'Ops' }] }] };
    const { session, paths } = sessionRecording(body);
    const listWorkspaces = workspaceTools(session).find((t) => t.name === 'list_workspaces');
    expect(await listWorkspaces?.handler({})).toEqual(body);
    expect(paths).toEqual(['/v1/me/workspaces']);
  });

  it('14.61 list_projects reads the workspaces route, because no projects route exists', async () => {
    const body = { workspaces: [
      { workspaceId: 'w1', name: 'Shop', role: 'owner', projects: [{ projectId: 'p1', name: 'Ops' }] },
      { workspaceId: 'w2', name: 'Other', role: 'guest', projects: [{ projectId: 'p2', name: 'Else' }] },
    ] };
    const { session, paths } = sessionRecording(body);
    expect(await listProjects(session).handler({ workspaceId: 'w1' })).toEqual({
      workspaceId: 'w1',
      projects: [{ projectId: 'p1', name: 'Ops' }],
    });
    expect(paths).toEqual(['/v1/me/workspaces']);
  });

  it('14.62 list_projects answers an empty list for a workspace the person cannot see', async () => {
    const { session } = sessionRecording({ workspaces: [] });
    expect(await listProjects(session).handler({ workspaceId: 'nope' })).toEqual({
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

/**
 * MCP CRUD plan Task 8. Cases 14.328–14.333: `list_members`, the two `list_tickets` scopes, and the plural
 * filter keys — over a fake `Session` that answers by path, so what is asserted is WHICH routes are read.
 */
type Answer = unknown | Error;
function sessionAnswering(answers: Record<string, Answer>): { session: Session; paths: string[] } {
  const paths: string[] = [];
  const session: Session = {
    userId: () => '01J0USER0000000000000000AA',
    get: async (path) => {
      paths.push(path);
      const answer = answers[path];
      if (answer instanceof Error) throw answer;
      if (answer === undefined) throw new Error(`unexpected read ${path}`);
      return answer;
    },
    post: async () => { throw new Error('not a read'); },
    postEvents: async () => { throw new Error('not a read'); },
  };
  return { session, paths };
}

const WS = '01J0WORKSPACE00000000000AA';
const PROJECT = '01J0PROJECT0000000000000AA';
const notFound = () => new HttpError(404, { error: 'not_found' });
const readTool = (name: string, session: Session) => {
  const found = [...readTools(session)].find((t) => t.name === name);
  if (found === undefined) throw new Error(`no tool named ${name}`);
  return found;
};

describe('list_members (14.328)', () => {
  it('14.328 reads /members for a member (role, email where served) and falls back to /actor-names ONLY on a 404', async () => {
    const member = sessionAnswering({
      [`/v1/workspaces/${WS}/members`]: {
        workspaceId: WS,
        members: [
          { userId: 'M', displayName: 'Ravi', role: 'member', email: 'r@x.test' },
          { userId: 'P', displayName: '+911100000001', role: 'admin' }, // a phone member: no email key at all
        ],
      },
    });
    const roster = await readTool('list_members', member.session).handler({ workspaceId: WS });
    expect(roster).toStrictEqual({
      workspaceId: WS,
      members: [
        { userId: 'M', name: 'Ravi', email: 'r@x.test', role: 'member' },
        { userId: 'P', name: '+911100000001', role: 'admin' },
      ],
    });
    expect(member.paths).toEqual([`/v1/workspaces/${WS}/members`]); // no actor-names call for a member

    // A guest's `/members` is a 404; the answer is the people on their own tickets, names ONLY.
    const guest = sessionAnswering({
      [`/v1/workspaces/${WS}/members`]: notFound(),
      [`/v1/workspaces/${WS}/actor-names`]: { workspaceId: WS, names: [{ userId: 'G', displayName: 'Asha' }, { userId: 'X', displayName: 'Old Hand', removed: true }] },
    });
    expect(await readTool('list_members', guest.session).handler({ workspaceId: WS })).toStrictEqual({
      workspaceId: WS,
      members: [{ userId: 'G', name: 'Asha' }, { userId: 'X', name: 'Old Hand', removed: true }],
    });
    expect(guest.paths).toEqual([`/v1/workspaces/${WS}/members`, `/v1/workspaces/${WS}/actor-names`]);

    // CONTROL, same `it`: a 500 is NOT a guest — it is rethrown and the names route is never read.
    const broken = sessionAnswering({ [`/v1/workspaces/${WS}/members`]: new HttpError(500, null) });
    await expect(readTool('list_members', broken.session).handler({ workspaceId: WS })).rejects.toThrow('gisik-nokma answered 500');
    expect(broken.paths).toEqual([`/v1/workspaces/${WS}/members`]);

    // …and a workspace the caller cannot see (both routes 404) is said plainly, not as a raw 404.
    const outsider = sessionAnswering({
      [`/v1/workspaces/${WS}/members`]: notFound(),
      [`/v1/workspaces/${WS}/actor-names`]: notFound(),
    });
    await expect(readTool('list_members', outsider.session).handler({ workspaceId: WS })).rejects.toThrow(
      'workspace not found or not visible to you',
    );
  });
});

describe('list_members fallback is ONLY for a 404 (14.332, 14.334)', () => {
  const MEMBERS = `/v1/workspaces/${WS}/members`;
  const NAMES = `/v1/workspaces/${WS}/actor-names`;
  const guestList = { workspaceId: WS, names: [{ userId: 'G', displayName: 'Asha' }] };

  it('14.332 a 403 or a 500 from /members propagates and /actor-names is never read; a 404 DOES fall back', async () => {
    for (const status of [403, 500]) {
      const failing = sessionAnswering({ [MEMBERS]: new HttpError(status, null), [NAMES]: guestList });
      await expect(readTool('list_members', failing.session).handler({ workspaceId: WS })).rejects.toThrow(`gisik-nokma answered ${status}`);
      expect(failing.paths).toEqual([MEMBERS]);
    }
    // CONTROL, same `it`: the same setup with a 404 falls back and returns the guest list.
    const guest = sessionAnswering({ [MEMBERS]: notFound(), [NAMES]: guestList });
    expect(await readTool('list_members', guest.session).handler({ workspaceId: WS })).toStrictEqual({
      workspaceId: WS,
      members: [{ userId: 'G', name: 'Asha' }],
    });
    expect(guest.paths).toEqual([MEMBERS, NAMES]);
  });

  it('14.334 /members 404 then /actor-names 500 surfaces the 500, not "not visible"; /actor-names 404 says the sentence', async () => {
    const broken = sessionAnswering({ [MEMBERS]: notFound(), [NAMES]: new HttpError(500, null) });
    const failure = await readTool('list_members', broken.session).handler({ workspaceId: WS }).then(
      () => undefined,
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(HttpError);
    expect((failure as HttpError).status).toBe(500);
    expect((failure as Error).message).not.toContain('not visible');
    expect(broken.paths).toEqual([MEMBERS, NAMES]);
    // CONTROL, same `it`: both routes 404 IS the visibility ruling, in words.
    const outsider = sessionAnswering({ [MEMBERS]: notFound(), [NAMES]: notFound() });
    await expect(readTool('list_members', outsider.session).handler({ workspaceId: WS })).rejects.toThrow(
      'workspace not found or not visible to you',
    );
  });
});

describe('list_tickets scopes (14.329, 14.330)', () => {
  const LIST = { projectId: PROJECT, groupBy: 'status', limit: 25 } as const;

  it('14.329 projectId reads the project route, workspaceId the workspace ticket-list route, with the same query string', async () => {
    const empty = { projectId: null, groupBy: 'flat', groups: [], nextCursor: null };
    const byProject = sessionAnswering({});
    const byWorkspace = sessionAnswering({});
    const query = 'groupBy=status&limit=25';
    byProject.session.get = async (path) => { byProject.paths.push(path); return empty; };
    byWorkspace.session.get = async (path) => { byWorkspace.paths.push(path); return empty; };

    await readTool('list_tickets', byProject.session).handler({ ...LIST });
    await readTool('list_tickets', byWorkspace.session).handler({ workspaceId: WS, groupBy: 'status', limit: 25 });
    // `/ticket-list`, NOT `/tickets`: that path is Plan 4's visibility list (`{ tickets }`, `200 []` for an outsider).
    expect(byProject.paths).toEqual([`/v1/projects/${PROJECT}/tickets?${query}`]);
    expect(byWorkspace.paths).toEqual([`/v1/workspaces/${WS}/ticket-list?${query}`]);
    // CONTROL: identical parameters give identical query strings across the two scopes.
    expect(byProject.paths[0]?.split('?')[1]).toBe(byWorkspace.paths[0]?.split('?')[1]);
  });

  it('14.330 refuses neither and both of projectId / workspaceId with a plain sentence, sending nothing; the description says which to use', async () => {
    const { session, paths } = sessionAnswering({});
    const tool = readTool('list_tickets', session);
    await expect(tool.handler({})).rejects.toThrow(/needs a scope: pass projectId .* or workspaceId/);
    await expect(tool.handler({ projectId: PROJECT, workspaceId: WS })).rejects.toThrow(
      /takes one scope, not both: pass projectId .* OR workspaceId/,
    );
    expect(paths).toEqual([]);
    expect(tool.description).toMatch(/exactly one of `projectId`.*`workspaceId`/s);
    expect(tool.description).toContain('"me"');

    // CONTROL, same `it`: exactly one passes, either way round.
    const ok = sessionAnswering({});
    ok.session.get = async (path) => { ok.paths.push(path); return { groups: [] }; };
    await readTool('list_tickets', ok.session).handler({ projectId: PROJECT });
    await readTool('list_tickets', ok.session).handler({ workspaceId: WS });
    expect(ok.paths).toEqual([`/v1/projects/${PROJECT}/tickets`, `/v1/workspaces/${WS}/ticket-list`]);
  });
});

describe('list_tickets filters (14.331, 14.333)', () => {
  it('14.331 the plural keys and "me" reach the route unchanged; a singular spec is unchanged', async () => {
    const seen: string[] = [];
    const { session } = sessionAnswering({});
    session.get = async (path) => { seen.push(path); return { groups: [] }; };
    const tool = readTool('list_tickets', session);

    const plural = { assigneeIds: ['me', '01J0ASHA'], stateCategories: ['open', 'active'], priorities: ['P1', 'P2'], closed: false };
    await tool.handler({ workspaceId: WS, filter: plural });
    expect(seen[0]).toBe(`/v1/workspaces/${WS}/ticket-list?filter=${encodeURIComponent(JSON.stringify(plural))}`);

    // CONTROL, same `it`: the singular keys (and "me" in one) pass exactly as before.
    const single = { assigneeId: 'me', closed: false };
    await tool.handler({ workspaceId: WS, filter: single });
    expect(seen[1]).toBe(`/v1/workspaces/${WS}/ticket-list?filter=${encodeURIComponent('{"assigneeId":"me","closed":false}')}`);
  });

  it('14.333 a singular+plural pair of one field is refused in words an assistant can act on — by the schema, and as the server\'s invalid_filter', async () => {
    // Through a REAL McpServer + client, so the refusal is the one an assistant actually reads.
    const gets: string[] = [];
    const session: Session = {
      userId: () => 'u',
      get: async (path) => { gets.push(path); return { groups: [] }; },
      post: async () => ({}),
      postEvents: async () => ({}),
    };
    const server = new McpServer({ name: 'gisik-nokma', version: '0.1.0' });
    registerTools(server, Object.assign(session, { ready: async () => undefined }));
    const client = new Client({ name: 'test-client', version: '0.0.0' });
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    await Promise.all([server.connect(serverSide), client.connect(clientSide)]);

    const refused = await client.callTool({
      name: 'list_tickets',
      arguments: { workspaceId: WS, filter: { assigneeId: 'a', assigneeIds: ['b'] } },
    });
    expect(refused.isError).toBe(true);
    expect(JSON.stringify(refused)).toContain('a field takes a single value OR a list, not both');
    expect(gets).toEqual([]);

    // The server's own 400 `invalid_filter` (its body names nothing) is turned into a sentence that says what to change.
    const { session: serverRefuses } = sessionAnswering({
      [`/v1/workspaces/${WS}/ticket-list?filter=${encodeURIComponent('{"closed":true}')}`]: new HttpError(400, { error: 'invalid_filter' }),
    });
    await expect(
      readTool('list_tickets', serverRefuses).handler({ workspaceId: WS, filter: { closed: true } }),
    ).rejects.toThrow(/invalid_filter: .*single value OR .*list.*"me".*P1/s);

    // CONTROL, same `it`: any OTHER 400 is not dressed up as a filter problem.
    const { session: otherBadRequest } = sessionAnswering({
      [`/v1/workspaces/${WS}/ticket-list?limit=5`]: new HttpError(400, { error: 'invalid_limit' }),
    });
    await expect(readTool('list_tickets', otherBadRequest).handler({ workspaceId: WS, limit: 5 })).rejects.toThrow('gisik-nokma answered 400');
  });

  it('14.331 the invalid-filter sentence keeps the HttpError as `cause`, and ONLY a 400 is rewritten', async () => {
    const filter = { closed: true };
    const path = `/v1/workspaces/${WS}/ticket-list?filter=${encodeURIComponent(JSON.stringify(filter))}`;
    const run = (status: number) =>
      readTool('list_tickets', sessionAnswering({ [path]: new HttpError(status, { error: 'invalid_filter' }) }).session)
        .handler({ workspaceId: WS, filter })
        .then(() => undefined, (error: unknown) => error as Error);

    // The rewrite at 400 carries the original HttpError as its cause.
    const rewritten = await run(400);
    expect(rewritten?.message).toMatch(/invalid_filter: /);
    expect(rewritten?.cause).toBeInstanceOf(HttpError);
    expect((rewritten?.cause as HttpError).status).toBe(400);

    // CONTROL, same `it`: the SAME body at 500 is not a filter refusal — rethrown unchanged, not the sentence.
    const passedThrough = await run(500);
    expect(passedThrough).toBeInstanceOf(HttpError);
    expect((passedThrough as HttpError).status).toBe(500);
    expect(passedThrough?.message).toBe('gisik-nokma answered 500');
    expect(passedThrough?.message).not.toMatch(/invalid_filter/);
  });
});
