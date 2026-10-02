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
  it('14.481 my_work carries workspaceId in the query string; get_attention reads the workspace route', async () => {
    const work = { groups: [] };
    const attention = { overdue: [] };
    const f = fake({ [`/v1/me/work?workspaceId=${WS}`]: work, [`/v1/workspaces/${WS}/attention`]: attention });
    expect(await tool('my_work', f.session).handler({ workspaceId: WS })).toEqual(work);
    expect(await tool('get_attention', f.session).handler({ workspaceId: WS })).toEqual(attention);
    expect(f.asked).toEqual([`/v1/me/work?workspaceId=${WS}`, `/v1/workspaces/${WS}/attention`]); // CONTROL: the id is in the query
    await expect(tool('my_work', f.session).handler({})).rejects.toThrow(); // never sent without one (the server would 400)
    expect(f.asked).toHaveLength(2);
    const gone = fake({ [`/v1/me/work?workspaceId=${WS}`]: NOT_FOUND, [`/v1/workspaces/${WS}/attention`]: NOT_FOUND });
    await expect(tool('my_work', gone.session).handler({ workspaceId: WS })).rejects.toThrow('workspace not found or not visible to you');
    await expect(tool('get_attention', gone.session).handler({ workspaceId: WS })).rejects.toThrow('workspace not found or not visible to you');
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
