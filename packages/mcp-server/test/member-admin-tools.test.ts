import { describe, expect, it } from 'vitest';
import { domainRegistry, isRankKey, parseEvent } from '@gisik-nokma/domain';
import { HttpError } from '../src/http-client.js';
import type { Session } from '../src/session.js';
import { memberAdminTools } from '../src/tools/member-admin-tools.js';
import { NO_TRANSFER } from './fixtures/fake-session.js';

/**
 * MCP-everything T11 (plan Task 11): `manage_members`, `change_prefix`, `manage_groups` — every write behind
 * `confirm_name`. Cases 14.500–14.504 (the hosted role and door matrices are 14.505/14.506 in
 * `apps/server/test/mcp/mcp-admin-roles.test.ts`).
 */
const ME = '01J0A5ER0000000000000000AA';
const WS = '01J0WS000000000000000000AA';
const P = '01J0PRJ000000000000000000A';
const P2 = '01J0PRJ000000000000000000B';
const RAVI = '01J0RV0000000000000000000A';
const INV = '01J0NV0000000000000000000A';
const G = '01J0GRP000000000000000000A'; // top-level, rank 'm'
const G2 = '01J0GRP000000000000000000B'; // child of G (level 2), rank 'g'
const G3 = '01J0GRP000000000000000000C'; // top-level, rank 't'

const ROUTES: Record<string, unknown> = {
  '/v1/me/workspaces': {
    workspaces: [{
      workspaceId: WS, name: 'Corner Shop', prefix: 'CS', role: 'owner', archived: false,
      projects: [
        { projectId: P, name: 'Shop floor', description: null, prefix: 'SF', archived: false, ticketCount: 7 },
        { projectId: P2, name: 'Stock', description: null, prefix: 'ST', archived: false, ticketCount: 5 },
      ],
    }],
  },
  [`/v1/workspaces/${WS}/members`]: { workspaceId: WS, members: [{ userId: RAVI, displayName: 'Ravi Sangma', role: 'member' }] },
  [`/v1/workspaces/${WS}/invites`]: { invites: [{ inviteId: INV, address: 'asha@example.in', channel: 'email', role: 'member', projectIds: [] }] },
  [`/v1/workspaces/${WS}/groups`]: {
    groups: [
      { id: G, parentId: null, level: 1, name: 'Corner Shop', rank: 'm', projectCount: 2, childCount: 1 },
      { id: G2, parentId: G, level: 2, name: 'Back room', rank: 'g', projectCount: 0, childCount: 0 },
      { id: G3, parentId: null, level: 1, name: 'Front', rank: 't', projectCount: 1, childCount: 0 },
    ],
  },
};

type Fake = { session: Session; batches: Array<Array<Record<string, unknown>>>; posts: Array<{ path: string; body: unknown }>; gets: string[] };

function fake(routes: Record<string, unknown> = ROUTES, result?: unknown): Fake {
  const batches: Fake['batches'] = [];
  const posts: Fake['posts'] = [];
  const gets: string[] = [];
  const session: Session = {
    userId: () => ME,
    get: async (path) => {
      gets.push(path);
      if (!(path in routes)) throw new HttpError(404, { error: 'not-found' });
      return routes[path];
    },
    post: async (path, body) => { posts.push({ path, body }); return { ok: true }; },
    postEvents: async (events) => {
      batches.push(events as Array<Record<string, unknown>>);
      return result ?? { results: events.map(() => ({ status: 'committed', eventId: 'e', seq: 1, serverTime: '2026-10-02T10:00:00.000Z' })) };
    },
    ...NO_TRANSFER,
  };
  return { session, batches, posts, gets };
}

function tool(name: string, session: Session) {
  const found = memberAdminTools(session).find((t) => t.name === name);
  if (found === undefined) throw new Error(`no tool named ${name}`);
  return found;
}

function accepted(envelope: Record<string, unknown> | undefined): void {
  const parsed = parseEvent({ ...envelope, serverTime: '2026-10-02T10:00:00.000Z', seq: 1 }, domainRegistry);
  if (!parsed.ok) throw new Error(`${parsed.code}: ${parsed.message}`);
}

/** Every act, with the exact name that confirms it and the single write it makes. */
const ACTS: Array<{ label: string; tool: string; args: Record<string, unknown>; name: string; write: { type: string } | { path: string } }> = [
  { label: 'invite', tool: 'manage_members', args: { workspaceId: WS, action: 'invite', address: 'new@example.in', channel: 'email', inviteRole: 'member' }, name: 'new@example.in', write: { path: `/v1/workspaces/${WS}/invites` } },
  { label: 'revoke_invite', tool: 'manage_members', args: { workspaceId: WS, action: 'revoke_invite', inviteId: INV }, name: 'asha@example.in', write: { type: 'invite.revoked' } },
  { label: 'change_role', tool: 'manage_members', args: { workspaceId: WS, action: 'change_role', userId: RAVI, role: 'admin' }, name: 'Ravi Sangma', write: { type: 'membership.granted' } },
  { label: 'remove', tool: 'manage_members', args: { workspaceId: WS, action: 'remove', userId: RAVI }, name: 'Ravi Sangma', write: { path: `/v1/workspaces/${WS}/members/${RAVI}/remove` } },
  { label: 'add_to_project', tool: 'manage_members', args: { workspaceId: WS, action: 'add_to_project', userId: RAVI, projectId: P, projectAdmin: true }, name: 'Ravi Sangma', write: { type: 'project.member_added' } },
  { label: 'remove_from_project', tool: 'manage_members', args: { workspaceId: WS, action: 'remove_from_project', userId: RAVI, projectId: P }, name: 'Ravi Sangma', write: { type: 'project.member_removed' } },
  { label: 'change_prefix (workspace)', tool: 'change_prefix', args: { workspaceId: WS, prefix: 'CC' }, name: 'Corner Shop', write: { type: 'workspace.prefix_changed' } },
  { label: 'change_prefix (project)', tool: 'change_prefix', args: { projectId: P, prefix: 'FL' }, name: 'Shop floor', write: { type: 'project.updated' } },
  { label: 'groups create', tool: 'manage_groups', args: { workspaceId: WS, action: 'create', name: 'Garage' }, name: 'Corner Shop', write: { type: 'group.created' } },
  { label: 'groups rename', tool: 'manage_groups', args: { workspaceId: WS, action: 'rename', groupId: G3, name: 'Shopfront' }, name: 'Front', write: { type: 'group.renamed' } },
  { label: 'groups reorder', tool: 'manage_groups', args: { workspaceId: WS, action: 'reorder', groupId: G3, after: G }, name: 'Front', write: { type: 'group.reordered' } },
  { label: 'groups delete', tool: 'manage_groups', args: { workspaceId: WS, action: 'delete', groupId: G3 }, name: 'Front', write: { type: 'group.deleted' } },
  { label: 'groups file_project', tool: 'manage_groups', args: { workspaceId: WS, action: 'file_project', projectId: P, groupId: G }, name: 'Shop floor', write: { type: 'project.updated' } },
];

describe('14.500 / 14.502 the confirmation', () => {
  it('14.500 every act without the exact confirm_name answers a preview and writes NOTHING; with it, exactly one write', async () => {
    for (const act of ACTS) {
      const f = fake();
      const preview = await tool(act.tool, f.session).handler(act.args);
      expect(preview, act.label).toMatchObject({ preview: true, nothingChanged: true, confirm: `confirm_name must be "${act.name}"` });
      expect(f.batches, `${act.label}: no event`).toEqual([]);
      expect(f.posts, `${act.label}: no post`).toEqual([]);
      // CONTROL, same it: the exact name makes exactly one write, of the kind the act is.
      await tool(act.tool, f.session).handler({ ...act.args, confirm_name: act.name });
      expect(f.batches.length + f.posts.length, `${act.label}: one write with the exact name`).toBe(1);
    }
  });

  it('14.502 a trailing space, a wrong case or an inner space is not the exact name', async () => {
    const f = fake();
    const calls: Array<[string, Record<string, unknown>]> = [
      ['manage_members', { workspaceId: WS, action: 'change_role', userId: RAVI, role: 'admin', confirm_name: 'ravi sangma' }],
      ['manage_members', { workspaceId: WS, action: 'invite', address: 'new@example.in', channel: 'email', inviteRole: 'member', confirm_name: 'new@example.in ' }],
      ['change_prefix', { workspaceId: WS, prefix: 'CC', confirm_name: 'Corner Shop ' }],
      ['manage_groups', { workspaceId: WS, action: 'create', name: 'Garage', confirm_name: 'Corner Shop ' }],
      ['manage_groups', { workspaceId: WS, action: 'rename', groupId: G3, name: 'Shopfront', confirm_name: 'Front ' }],
    ];
    for (const [name, args] of calls) {
      expect(await tool(name, f.session).handler(args), `${name} ${JSON.stringify(args['confirm_name'])}`).toMatchObject({ preview: true, nothingChanged: true });
    }
    expect(f.batches).toEqual([]);
    expect(f.posts).toEqual([]);
    // CONTROL: the exact name writes.
    await tool('change_prefix', f.session).handler({ workspaceId: WS, prefix: 'CC', confirm_name: 'Corner Shop' });
    expect(f.batches.flat().map((e) => e['type'])).toEqual(['workspace.prefix_changed']);
  });
});

describe('14.501 manage_members', () => {
  it('14.501 each act sends the one write the app sends, and every envelope passes parseEvent', async () => {
    const send = async (args: Record<string, unknown>, name: string) => {
      const f = fake();
      await tool('manage_members', f.session).handler({ workspaceId: WS, ...args, confirm_name: name });
      return f;
    };
    // CONTROL: invite posts the route, not an event.
    const invite = await send({ action: 'invite', address: 'new@example.in', channel: 'phone', inviteRole: 'guest', projectIds: [P] }, 'new@example.in');
    expect(invite.posts).toEqual([{ path: `/v1/workspaces/${WS}/invites`, body: { address: 'new@example.in', channel: 'phone', role: 'guest', projectIds: [P] } }]);
    expect(invite.batches).toEqual([]);

    const revoked = await send({ action: 'revoke_invite', inviteId: INV }, 'asha@example.in');
    expect(revoked.batches[0]).toHaveLength(1);
    expect(revoked.batches[0]![0]).toMatchObject({ type: 'invite.revoked', entity: { kind: 'invite', id: INV }, payload: { inviteId: INV }, origin: 'mcp', actorId: ME, workspaceId: WS });
    accepted(revoked.batches[0]![0]);

    const role = await send({ action: 'change_role', userId: RAVI, role: 'admin' }, 'Ravi Sangma');
    expect(role.batches[0]![0]).toMatchObject({ type: 'membership.granted', entity: { kind: 'membership', id: `${WS}:${RAVI}` }, payload: { userId: RAVI, role: 'admin' } });
    accepted(role.batches[0]![0]);

    const removed = await send({ action: 'remove', userId: RAVI }, 'Ravi Sangma');
    expect(removed.posts).toEqual([{ path: `/v1/workspaces/${WS}/members/${RAVI}/remove`, body: {} }]);
    expect(removed.batches).toEqual([]);

    const added = await send({ action: 'add_to_project', userId: RAVI, projectId: P, projectAdmin: true }, 'Ravi Sangma');
    expect(added.batches[0]![0]).toMatchObject({ type: 'project.member_added', entity: { kind: 'project', id: P }, payload: { userId: RAVI, projectAdmin: true } });
    accepted(added.batches[0]![0]);

    const out = await send({ action: 'remove_from_project', userId: RAVI, projectId: P }, 'Ravi Sangma');
    expect(out.batches[0]![0]).toMatchObject({ type: 'project.member_removed', entity: { kind: 'project', id: P }, payload: { userId: RAVI } });
    accepted(out.batches[0]![0]);
  });

  it('14.501 a person who is not on the roster and an invitation that is not pending are named, not guessed', async () => {
    const f = fake();
    await expect(tool('manage_members', f.session).handler({ workspaceId: WS, action: 'change_role', userId: INV, role: 'admin' })).rejects.toThrow('person not found in this workspace');
    await expect(tool('manage_members', f.session).handler({ workspaceId: WS, action: 'revoke_invite', inviteId: RAVI })).rejects.toThrow('invitation not found or not visible to you');
    expect(f.batches).toEqual([]);
  });

  it('14.501 an admin-only read a member cannot make is answered in the product\'s words', async () => {
    const f = fake();
    const denied: Session = { ...f.session, get: async (path) => {
      if (path.endsWith('/invites')) throw new HttpError(403, { error: 'forbidden', rule: 'permission.role', message: 'Only a workspace owner or admin can see or manage this workspace’s invitations.' });
      return f.session.get(path);
    } };
    await expect(tool('manage_members', denied).handler({ workspaceId: WS, action: 'revoke_invite', inviteId: INV, confirm_name: 'asha@example.in' }))
      .rejects.toThrow('refused by permission.role: Only a workspace owner or admin can see or manage this workspace’s invitations.');
  });
});

describe('14.503 change_prefix', () => {
  it('14.503 the preview counts the ticket keys that change; the server refusal comes back verbatim', async () => {
    const f = fake();
    // CONTROL: the workspace count is every project's tickets (7 + 5), a project's is its own.
    expect(await tool('change_prefix', f.session).handler({ workspaceId: WS, prefix: 'CC' })).toMatchObject({ counts: { ticketKeys: 12 }, confirm: 'confirm_name must be "Corner Shop"' });
    expect(await tool('change_prefix', f.session).handler({ projectId: P, prefix: 'FL' })).toMatchObject({ counts: { ticketKeys: 7 }, confirm: 'confirm_name must be "Shop floor"' });

    await tool('change_prefix', f.session).handler({ workspaceId: WS, prefix: 'CC', confirm_name: 'Corner Shop' });
    await tool('change_prefix', f.session).handler({ projectId: P, prefix: 'FL', confirm_name: 'Shop floor' });
    expect(f.batches.flat()).toMatchObject([
      { type: 'workspace.prefix_changed', entity: { kind: 'workspace', id: WS }, payload: { prefix: 'CC' } },
      { type: 'project.updated', entity: { kind: 'project', id: P }, payload: { prefix: 'FL' } },
    ]);
    f.batches.flat().forEach(accepted);

    const refused = fake(ROUTES, { results: [{ status: 'refused', eventId: 'e', rule: 'project.prefix-taken', reason: 'ST is already the prefix of Stock.' }] });
    await expect(tool('change_prefix', refused.session).handler({ projectId: P, prefix: 'ST', confirm_name: 'Shop floor' })).rejects.toThrow('refused by project.prefix-taken: ST is already the prefix of Stock.');
  });

  it('14.503 exactly one of workspaceId / projectId, and an unseen project is not found', async () => {
    const f = fake();
    await expect(tool('change_prefix', f.session).handler({ prefix: 'CC' })).rejects.toThrow('exactly one of workspaceId or projectId');
    await expect(tool('change_prefix', f.session).handler({ workspaceId: WS, projectId: P, prefix: 'CC' })).rejects.toThrow('exactly one of workspaceId or projectId');
    await expect(tool('change_prefix', f.session).handler({ projectId: INV, prefix: 'CC' })).rejects.toThrow('project not found or not visible to you');
    await expect(tool('change_prefix', f.session).handler({ workspaceId: INV, prefix: 'CC' })).rejects.toThrow('workspace not found or not visible to you');
  });
});

describe('14.504 manage_groups', () => {
  it('14.504 list reads the groups route and pages', async () => {
    const f = fake();
    const first = (await tool('manage_groups', f.session).handler({ workspaceId: WS, action: 'list', limit: 2 })) as { groups: Array<{ id: string }>; nextCursor: string | null };
    expect(f.gets).toContain(`/v1/workspaces/${WS}/groups`);
    expect(first.groups.map((g) => g.id)).toEqual([G, G2]);
    expect(first.nextCursor).toBe('2');
    const rest = (await tool('manage_groups', f.session).handler({ workspaceId: WS, action: 'list', limit: 2, cursor: '2' })) as { groups: Array<{ id: string }>; nextCursor: string | null };
    expect(rest.groups.map((g) => g.id)).toEqual([G3]);
    expect(rest.nextCursor).toBeNull();
  });

  it('14.504 create: the level is the parent\'s plus one (1 at the top) and the rank is after the last sibling', async () => {
    const f = fake();
    await tool('manage_groups', f.session).handler({ workspaceId: WS, action: 'create', name: 'Garage', confirm_name: 'Corner Shop' });
    await tool('manage_groups', f.session).handler({ workspaceId: WS, action: 'create', name: 'Shelves', parentId: G2, confirm_name: 'Corner Shop' });
    const [top, child] = f.batches.flat();
    expect(top).toMatchObject({ type: 'group.created', entity: { kind: 'group' }, payload: { parentId: null, level: 1, name: 'Garage' } });
    expect((top!['payload'] as { rank: string }).rank > 't').toBe(true); // after the last top-level sibling 't'
    expect(child).toMatchObject({ payload: { parentId: G2, level: 3, name: 'Shelves' } });
    expect(isRankKey((child!['payload'] as { rank: string }).rank)).toBe(true);
    expect((top!['entity'] as { id: string }).id).not.toBe((child!['entity'] as { id: string }).id);
    [top, child].forEach(accepted);
  });

  it('14.504 rename, reorder, delete and file_project send their events; delete previews the projects in it', async () => {
    const f = fake();
    const g = (args: Record<string, unknown>, name: string) => tool('manage_groups', f.session).handler({ workspaceId: WS, ...args, confirm_name: name });
    expect(await tool('manage_groups', f.session).handler({ workspaceId: WS, action: 'delete', groupId: G })).toMatchObject({ counts: { projects: 2 }, confirm: 'confirm_name must be "Corner Shop"' });
    await g({ action: 'rename', groupId: G3, name: 'Shopfront' }, 'Front');
    await g({ action: 'reorder', groupId: G3, before: G2, after: G }, 'Front');
    await g({ action: 'delete', groupId: G3 }, 'Front');
    await g({ action: 'file_project', projectId: P, groupId: G }, 'Shop floor');
    await g({ action: 'file_project', projectId: P, groupId: null }, 'Shop floor');
    const events = f.batches.flat();
    expect(events).toMatchObject([
      { type: 'group.renamed', entity: { kind: 'group', id: G3 }, payload: { name: 'Shopfront' } },
      { type: 'group.reordered', entity: { kind: 'group', id: G3 } },
      { type: 'group.deleted', entity: { kind: 'group', id: G3 }, payload: {} },
      { type: 'project.updated', entity: { kind: 'project', id: P }, payload: { groupId: G } },
      { type: 'project.updated', entity: { kind: 'project', id: P }, payload: { groupId: null } },
    ]);
    const rank = (events[1]!['payload'] as { rank: string }).rank;
    expect(rank > 'g' && rank < 'm').toBe(true); // between the neighbours it was given
    events.forEach(accepted);
  });
});
