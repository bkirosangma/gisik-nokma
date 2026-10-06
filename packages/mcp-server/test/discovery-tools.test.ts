import { describe, expect, it } from 'vitest';
import { HttpError } from '../src/http-client.js';
import { discoveryTools } from '../src/tools/discovery-tools.js';
import type { Session } from '../src/session.js';
import { NO_TRANSFER } from './fixtures/fake-session.js';

/**
 * MCP-everything T10: the discovery and "me" tools. Cases 14.480–14.484 (the hosted 14.485 / 14.486 are in
 * `apps/server/test/mcp/mcp-discovery.test.ts`). A fake session: `pages` answers a GET by its EXACT path
 * (an `Error` value is thrown), `asked` records every GET and `posts` every `[path, body]`.
 */
const WS = '01J0WS000000000000000000AA';
const NOT_FOUND = new HttpError(404, { error: 'not_found' });

function fake(pages: Record<string, unknown> = {}, postAnswer: unknown = { changed: 1 }) {
  const asked: string[] = [];
  const posts: Array<[string, unknown]> = [];
  const state = { post: (async () => postAnswer) as (path: string, body: unknown) => Promise<unknown> };
  const session: Session = {
    userId: () => 'u',
    get: async (path) => {
      asked.push(path);
      const answer = pages[path];
      if (answer instanceof Error) throw answer;
      if (!(path in pages)) throw new Error(`unexpected GET ${path}`);
      return answer;
    },
    post: async (path, body) => {
      posts.push([path, body]);
      return state.post(path, body);
    },
    ...NO_TRANSFER,
    postEvents: async () => {
      throw new Error('postEvents is not used by the discovery tools');
    },
  };
  return { session, asked, posts, state };
}

const tool = (name: string, s: Session) => {
  const t = discoveryTools(s).find((x) => x.name === name);
  if (t === undefined) throw new Error(`no tool ${name}`);
  return t;
};

describe('14.480 list_ticket_types and list_workflows read the builder routes', () => {
  it('14.480 the paths, the pass-through, and the two 404 sentences', async () => {
    const types = { workspaceId: WS, ticketTypes: [{ id: 't1', name: 'Task' }, { id: 't2', name: 'Bug' }] };
    const flows = { workspaceId: WS, workflows: [{ id: 'w1' }] };
    const flow = { workspaceId: WS, workflow: { id: 'w1', states: [{ id: 'todo' }], transitions: [] } };
    const f = fake({
      [`/v1/workspaces/${WS}/ticket-types`]: types,
      [`/v1/workspaces/${WS}/workflows`]: flows,
      [`/v1/workspaces/${WS}/workflows/w1`]: flow,
    });
    // CONTROL: the answers pass through unchanged (paging only adds `nextCursor`).
    expect(await tool('list_ticket_types', f.session).handler({ workspaceId: WS })).toEqual({ ...types, nextCursor: null });
    expect(await tool('list_workflows', f.session).handler({ workspaceId: WS })).toEqual({ ...flows, nextCursor: null });
    expect(await tool('list_workflows', f.session).handler({ workspaceId: WS, workflowId: 'w1' })).toEqual(flow);
    // a workflowId call reads the ONE-workflow route, never the list
    expect(f.asked).toEqual([`/v1/workspaces/${WS}/ticket-types`, `/v1/workspaces/${WS}/workflows`, `/v1/workspaces/${WS}/workflows/w1`]);

    const gone = fake({
      [`/v1/workspaces/${WS}/ticket-types`]: NOT_FOUND,
      [`/v1/workspaces/${WS}/workflows`]: NOT_FOUND,
      [`/v1/workspaces/${WS}/workflows/w9`]: NOT_FOUND,
    });
    await expect(tool('list_ticket_types', gone.session).handler({ workspaceId: WS })).rejects.toThrow('workspace not found or not visible to you');
    await expect(tool('list_workflows', gone.session).handler({ workspaceId: WS })).rejects.toThrow('workspace not found or not visible to you');
    await expect(tool('list_workflows', gone.session).handler({ workspaceId: WS, workflowId: 'w9' })).rejects.toThrow('workflow not found or not visible to you');
  });
});

describe('14.481 my_work and get_attention', () => {
  it('14.481 my_work(workspaceId) carries the id in the query string; get_attention(workspaceId) reads the workspace route', async () => {
    const work = { groups: [] };
    const attention = { overdue: [] };
    const f = fake({ [`/v1/me/work?workspaceId=${WS}`]: work, [`/v1/workspaces/${WS}/attention?show=created,assigned`]: attention });
    expect(await tool('my_work', f.session).handler({ workspaceId: WS })).toEqual(work);
    expect(await tool('get_attention', f.session).handler({ workspaceId: WS })).toEqual(attention);
    // CONTROL: the id is in the query; get_attention now carries the default `show` (30.052)
    expect(f.asked).toEqual([`/v1/me/work?workspaceId=${WS}`, `/v1/workspaces/${WS}/attention?show=created,assigned`]);
    const gone = fake({ [`/v1/me/work?workspaceId=${WS}`]: NOT_FOUND, [`/v1/workspaces/${WS}/attention?show=created,assigned`]: NOT_FOUND });
    await expect(tool('my_work', gone.session).handler({ workspaceId: WS })).rejects.toThrow('workspace not found or not visible to you');
    await expect(tool('get_attention', gone.session).handler({ workspaceId: WS })).rejects.toThrow('workspace not found or not visible to you');
  });
});

/**
 * My-work-global T5 (cases 30.051–30.058): both tools go global when `workspaceId` is absent — one
 * `/v1/me/workspaces` read, archived workspaces skipped, then one read per workspace — and `get_attention`
 * takes `show` (default created + assigned), narrowed per workspace to what the viewer may ask there.
 * Rig: w1 the viewer OWNS; w2 a plain membership where the viewer runs a project; w3 archived; w4 a plain
 * membership whose row carries no `adminProjectIds` key at all (an older server); w5 one the viewer ADMINS.
 */
const ME_WORKSPACES = {
  workspaces: [
    { workspaceId: 'w1', name: 'One', prefix: 'ONE', role: 'owner', adminProjectIds: [], archived: false },
    { workspaceId: 'w2', name: 'Two', prefix: 'TWO', role: 'member', adminProjectIds: ['p2'], archived: false },
    { workspaceId: 'w3', name: 'Three', prefix: 'THR', role: 'owner', adminProjectIds: ['p3'], archived: true },
    { workspaceId: 'w4', name: 'Four', prefix: 'FOU', role: 'member', archived: false },
    { workspaceId: 'w5', name: 'Five', prefix: 'FIV', role: 'admin', adminProjectIds: [], archived: false },
  ],
};
const attentionPath = (ws: string, show: string) => `/v1/workspaces/${ws}/attention?show=${show}`;
const attentionBody = (ws: string) => ({ workspaceId: ws, generatedAt: '2026-10-05T00:00:00.000Z', settings: { staleDays: 7 }, items: [{ ticketId: `t-${ws}` }] });
const workBody = (ws: string) => ({ workspaceId: ws, groups: { open: [{ ticketId: `t-${ws}` }], active: [], terminal: [] }, projectNames: { [`p-${ws}`]: `P ${ws}` }, stateNames: { [`t-${ws}`]: 'Open' } });
const LIVE = ['w1', 'w2', 'w4', 'w5'] as const;
const NAMES: Record<string, string> = { w1: 'One', w2: 'Two', w4: 'Four', w5: 'Five' };

describe('30.5 my_work and get_attention go global (my-work-global T5)', () => {
  it('30.051 get_attention with no arguments: one workspace list, then each live workspace with show=created,assigned', async () => {
    const pages: Record<string, unknown> = { '/v1/me/workspaces': ME_WORKSPACES };
    for (const ws of LIVE) pages[attentionPath(ws, 'created,assigned')] = attentionBody(ws);
    const f = fake(pages);
    const out = await tool('get_attention', f.session).handler({});
    expect(f.asked).toEqual(['/v1/me/workspaces', ...LIVE.map((ws) => attentionPath(ws, 'created,assigned'))]);
    // the pinned shape: { workspaces: [{ workspaceId, name, items }] }, in the list's order
    expect(out).toEqual({ workspaces: LIVE.map((ws) => ({ workspaceId: ws, name: NAMES[ws], items: [{ ticketId: `t-${ws}` }] })) });
  });

  it('30.052 get_attention({workspaceId}) is ONE call carrying the default show, answered in today\'s shape', async () => {
    const f = fake({ [attentionPath('w1', 'created,assigned')]: attentionBody('w1') });
    expect(await tool('get_attention', f.session).handler({ workspaceId: 'w1' })).toEqual(attentionBody('w1'));
    expect(f.asked).toEqual([attentionPath('w1', 'created,assigned')]);
    // CONTROL: an explicit show is carried as given, in canonical order and once each
    const g = fake({ [attentionPath('w1', 'created,ws-admin')]: attentionBody('w1') });
    expect(await tool('get_attention', g.session).handler({ workspaceId: 'w1', show: ['ws-admin', 'created', 'ws-admin'] })).toEqual(attentionBody('w1'));
    expect(g.asked).toEqual([attentionPath('w1', 'created,ws-admin')]);
  });

  it('30.053 show is narrowed per workspace: a workspace the viewer may not ask is skipped, never 400ed; named outright, the refusal is a sentence', async () => {
    const pages: Record<string, unknown> = {
      '/v1/me/workspaces': ME_WORKSPACES,
      [attentionPath('w1', 'ws-admin')]: attentionBody('w1'),
      [attentionPath('w5', 'ws-admin')]: attentionBody('w5'),
    };
    const f = fake(pages);
    // ws-admin: only w1 (owner) and w5 (admin) may be asked; w2 and w4 (member) are neither requested nor listed
    expect(await tool('get_attention', f.session).handler({ show: ['ws-admin'] })).toEqual({
      workspaces: [
        { workspaceId: 'w1', name: 'One', items: [{ ticketId: 't-w1' }] },
        { workspaceId: 'w5', name: 'Five', items: [{ ticketId: 't-w5' }] },
      ],
    });
    expect(f.asked).toEqual(['/v1/me/workspaces', attentionPath('w1', 'ws-admin'), attentionPath('w5', 'ws-admin')]);
    // project-admin: only w2 (runs p2); w1 and w5 (no admin project) and w4 (no key) are skipped
    const p = fake({ '/v1/me/workspaces': ME_WORKSPACES, [attentionPath('w2', 'project-admin')]: attentionBody('w2') });
    expect(await tool('get_attention', p.session).handler({ show: ['project-admin'] })).toEqual({ workspaces: [{ workspaceId: 'w2', name: 'Two', items: [{ ticketId: 't-w2' }] }] });
    expect(p.asked).toEqual(['/v1/me/workspaces', attentionPath('w2', 'project-admin')]);
    // CONTROL: a selection mixing all four asks each workspace for exactly its own part
    const all = fake({
      '/v1/me/workspaces': ME_WORKSPACES,
      [attentionPath('w1', 'created,assigned,ws-admin')]: attentionBody('w1'),
      [attentionPath('w2', 'created,assigned,project-admin')]: attentionBody('w2'),
      [attentionPath('w4', 'created,assigned')]: attentionBody('w4'),
      [attentionPath('w5', 'created,assigned,ws-admin')]: attentionBody('w5'),
    });
    const out = (await tool('get_attention', all.session).handler({ show: ['project-admin', 'ws-admin', 'assigned', 'created'] })) as { workspaces: Array<{ workspaceId: string }> };
    expect(out.workspaces.map((x) => x.workspaceId)).toEqual(['w1', 'w2', 'w4', 'w5']);
    expect(all.asked).toEqual([
      '/v1/me/workspaces',
      attentionPath('w1', 'created,assigned,ws-admin'),
      attentionPath('w2', 'created,assigned,project-admin'),
      attentionPath('w4', 'created,assigned'),
      attentionPath('w5', 'created,assigned,ws-admin'),
    ]);
    // Named outright, nothing is narrowed: the route's 400 `invalid_query` (a role the caller lacks THERE) is
    // answered with a sentence that says what each value needs, carrying the route's error as its cause.
    const refusal = new HttpError(400, { error: 'invalid_query' });
    const named = fake({ [attentionPath('w2', 'ws-admin')]: refusal });
    await expect(tool('get_attention', named.session).handler({ workspaceId: 'w2', show: ['ws-admin'] })).rejects.toMatchObject({
      message:
        "invalid_query: show was refused for this workspace. 'ws-admin' needs the owner or admin role in it, and 'project-admin' needs a project you run in it; leave out workspaceId to ask every workspace for only what it allows.",
      cause: refusal,
    });
    expect(named.asked).toEqual([attentionPath('w2', 'ws-admin')]);
    // CONTROL: any other 400, a 400 with no body, the same error under another status, and a 404 are not that refusal
    for (const [other, message] of [
      [new HttpError(400, { error: 'something_else' }), 'gisik-nokma answered 400'],
      [new HttpError(400, null), 'gisik-nokma answered 400'],
      [new HttpError(500, { error: 'invalid_query' }), 'gisik-nokma answered 500'],
      [NOT_FOUND, 'workspace not found or not visible to you'],
    ] as const) {
      const g = fake({ [attentionPath('w2', 'ws-admin')]: other });
      await expect(tool('get_attention', g.session).handler({ workspaceId: 'w2', show: ['ws-admin'] })).rejects.toMatchObject({ message });
    }
  });

  it('30.054 show:[] and an unknown value are refused before any read', async () => {
    const f = fake({ '/v1/me/workspaces': ME_WORKSPACES, [attentionPath('w1', 'created')]: attentionBody('w1') });
    await expect(tool('get_attention', f.session).handler({ show: [] })).rejects.toThrow();
    await expect(tool('get_attention', f.session).handler({ workspaceId: 'w1', show: [] })).rejects.toThrow();
    await expect(tool('get_attention', f.session).handler({ workspaceId: 'w1', show: ['bogus'] })).rejects.toThrow();
    expect(f.asked).toEqual([]);
    // CONTROL: one valid value answers
    expect(await tool('get_attention', f.session).handler({ workspaceId: 'w1', show: ['created'] })).toEqual(attentionBody('w1'));
  });

  it('30.055 my_work with no arguments fans out over /v1/me/work for each live (non-archived) workspace', async () => {
    const pages: Record<string, unknown> = { '/v1/me/workspaces': ME_WORKSPACES };
    for (const ws of LIVE) pages[`/v1/me/work?workspaceId=${ws}`] = workBody(ws);
    const f = fake(pages);
    const out = await tool('my_work', f.session).handler({});
    expect(f.asked).toEqual(['/v1/me/workspaces', ...LIVE.map((ws) => `/v1/me/work?workspaceId=${ws}`)]); // w3 (archived) never read
    expect(out).toEqual({ workspaces: LIVE.map((ws) => ({ ...workBody(ws), name: NAMES[ws] })) });
  });

  it('30.056 my_work({workspaceId}) is today\'s single call, answered unchanged', async () => {
    const f = fake({ '/v1/me/work?workspaceId=w3': workBody('w3') });
    expect(await tool('my_work', f.session).handler({ workspaceId: 'w3' })).toEqual(workBody('w3'));
    expect(f.asked).toEqual(['/v1/me/work?workspaceId=w3']); // no workspace list, and an archived id named outright is still read
  });

  it('30.057 the two descriptions, verbatim', () => {
    const f = fake();
    expect(tool('get_attention', f.session).description).toBe(
      "What needs your attention: overdue, due soon, stale and blocked work. By default only tickets you created or that are assigned to you, across all your workspaces; pass show to include 'ws-admin' or 'project-admin' tickets, and workspaceId to limit it to one workspace. With a workspaceId, a show value your role there does not allow is refused; without one, each workspace is asked only for what it allows.",
    );
    expect(tool('my_work', f.session).description).toBe(
      'What is on your plate: the tickets assigned to you or that you collaborate on, across all your workspaces, grouped the way the My Work screen groups them; pass workspaceId to limit it to one workspace.',
    );
  });

  it('30.058 one workspace answering 404 is left out and the rest return; any other failure fails the tool', async () => {
    const pages: Record<string, unknown> = { '/v1/me/workspaces': ME_WORKSPACES };
    for (const ws of LIVE) {
      pages[attentionPath(ws, 'created,assigned')] = ws === 'w2' ? NOT_FOUND : attentionBody(ws);
      pages[`/v1/me/work?workspaceId=${ws}`] = ws === 'w2' ? NOT_FOUND : workBody(ws);
    }
    const f = fake(pages);
    const att = (await tool('get_attention', f.session).handler({})) as { workspaces: Array<{ workspaceId: string }> };
    expect(att.workspaces.map((x) => x.workspaceId)).toEqual(['w1', 'w4', 'w5']);
    const work = (await tool('my_work', f.session).handler({})) as { workspaces: Array<{ workspaceId: string }> };
    expect(work.workspaces.map((x) => x.workspaceId)).toEqual(['w1', 'w4', 'w5']);
    // CONTROL: a 500 is not a missing workspace — the tool fails rather than hide it
    const boom = new HttpError(500, { error: 'internal' });
    const g = fake({ ...pages, [attentionPath('w2', 'created,assigned')]: boom, '/v1/me/work?workspaceId=w2': boom });
    await expect(tool('get_attention', g.session).handler({})).rejects.toThrow();
    await expect(tool('my_work', g.session).handler({})).rejects.toThrow();
  });
});

describe('14.482 list_notifications', () => {
  it('14.482 no arguments → no query string; unread, cursor and limit map to unread=true, cursor, limit; nextCursor passes through', async () => {
    const page = { notifications: [{ id: 'n1' }], nextCursor: 'n1' };
    const f = fake({ '/v1/me/notifications': page, '/v1/me/notifications?unread=true&limit=5&cursor=n0': page });
    expect(await tool('list_notifications', f.session).handler({})).toEqual(page); // CONTROL
    expect(await tool('list_notifications', f.session).handler({ unreadOnly: true, limit: 5, cursor: 'n0' })).toEqual(page);
    expect(f.asked).toEqual(['/v1/me/notifications', '/v1/me/notifications?unread=true&limit=5&cursor=n0']);
    // unreadOnly: false is "no narrowing", and the limit is bounded 1–100 before the server sees it
    await tool('list_notifications', fake({ '/v1/me/notifications': page }).session).handler({ unreadOnly: false });
    await expect(tool('list_notifications', f.session).handler({ limit: 101 })).rejects.toThrow();
    await expect(tool('list_notifications', f.session).handler({ limit: 0 })).rejects.toThrow();
    expect(f.asked).toHaveLength(2);
  });

  it('14.482 the description names the kinds of message in words, the two flow kinds included (wtg2 T18)', () => {
    expect(tool('list_notifications', fake({}).session).description).toBe(
      'Your notifications, newest first (mentions, assignments, conflicts, tickets ready to start, tickets reopened by a flow). unreadOnly for just the unread; page with cursor (the answer carries nextCursor); limit 1–100.',
    );
  });
});

describe('14.483 mark_notifications_read', () => {
  it('14.483 ids, or all unread in pages; both or neither is refused', async () => {
    const pages: Record<string, unknown> = {
      '/v1/me/notifications?unread=true&limit=100': { notifications: Array.from({ length: 100 }, (_, i) => ({ id: `n${i}` })), nextCursor: 'n99' },
      '/v1/me/notifications?unread=true&limit=100&cursor=n99': { notifications: [{ id: 'n100' }], nextCursor: null },
    };
    const f = fake(pages, { changed: 1 });
    await tool('mark_notifications_read', f.session).handler({ ids: ['a', 'b'] });
    expect(f.posts[0]).toEqual(['/v1/me/notifications/read', { ids: ['a', 'b'], read: true }]);
    const all = (await tool('mark_notifications_read', f.session).handler({ all: true })) as { changed: number };
    expect(f.posts.slice(1).map(([, b]) => (b as { ids: string[] }).ids.length)).toEqual([100, 1]);
    expect(f.posts.slice(1).every(([p, b]) => p === '/v1/me/notifications/read' && (b as { read: boolean }).read === true)).toBe(true);
    expect(all.changed).toBe(2);
    await expect(tool('mark_notifications_read', f.session).handler({})).rejects.toThrow('mark_notifications_read takes ids or all: true, not both and not neither');
    await expect(tool('mark_notifications_read', f.session).handler({ ids: ['a'], all: true })).rejects.toThrow('not both and not neither');
    await expect(tool('mark_notifications_read', f.session).handler({ ids: [] })).rejects.toThrow();
    await expect(tool('mark_notifications_read', f.session).handler({ ids: Array.from({ length: 101 }, (_, i) => `n${i}`) })).rejects.toThrow();
    // the real route answers `changed` as the ids that flipped, not a number: the total is still a count
    const real = fake({ '/v1/me/notifications?unread=true&limit=100': { notifications: [{ id: 'x' }, { id: 'y' }], nextCursor: null } }, { changed: ['x', 'y'] });
    expect(await tool('mark_notifications_read', real.session).handler({ all: true })).toEqual({ changed: 2 });
    // CONTROL: an empty unread list answers 0 and posts nothing
    const empty = fake({ '/v1/me/notifications?unread=true&limit=100': { notifications: [], nextCursor: null } });
    expect(await tool('mark_notifications_read', empty.session).handler({ all: true })).toEqual({ changed: 0 });
    expect(empty.posts).toEqual([]);
  });
});

describe('14.484 list_my_invitations and respond_to_invitation', () => {
  it('14.484 the list path; accept and decline post to their own routes; a 404 is the one sentence', async () => {
    const inv = { invitations: [{ inviteId: 'i1' }] };
    const f = fake({ '/v1/me/invitations': inv }, { workspaceId: WS });
    expect(await tool('list_my_invitations', f.session).handler({})).toEqual({ ...inv, nextCursor: null });
    // CONTROL: accept answers the server's own body
    expect(await tool('respond_to_invitation', f.session).handler({ inviteId: 'i1', answer: 'accept' })).toEqual({ workspaceId: WS });
    expect(f.posts).toEqual([['/v1/me/invitations/i1/accept', {}]]);
    f.state.post = async () => null; // the decline route answers 204
    expect(await tool('respond_to_invitation', f.session).handler({ inviteId: 'i1', answer: 'decline' })).toEqual({ declined: true });
    expect(f.posts[1]).toEqual(['/v1/me/invitations/i1/decline', {}]);
    f.state.post = async () => {
      throw NOT_FOUND;
    };
    await expect(tool('respond_to_invitation', f.session).handler({ inviteId: 'i9', answer: 'accept' })).rejects.toThrow('invitation not found or not yours');
    await expect(tool('respond_to_invitation', f.session).handler({ inviteId: 'i1', answer: 'maybe' })).rejects.toThrow();
  });
});
