import { describe, expect, it } from 'vitest';
import { domainRegistry, parseEvent } from '@gisik-nokma/domain';
import { HttpError } from '../src/http-client.js';
import { workspaceTools } from '../src/tools/workspace-tools.js';
import type { Session } from '../src/session.js';

/**
 * MCP CRUD plan, Task 6. Cases 14.304–14.312.
 */
const USER = '01J0A5ER0000000000000000AA';
const WS = '01J0WS000000000000000000AA';
const COMMITTED = { results: [{ status: 'committed', eventId: 'e', seq: 1, serverTime: '2026-10-01T10:00:00.000Z' }] };
/** `WORKSPACE_OWNER_ONLY_REASON` and `PERMISSION_ROLE_RULE`, copied from `apps/server/src/permissions/check-permission.ts:111` / `:323` — this package cannot import the server. */
const OWNER_ONLY = {
  status: 'refused',
  eventId: 'e',
  rule: 'permission.role',
  reason: 'Only the workspace owner can archive, delete or restore a workspace.',
};

type Dir = { name: string; archived?: boolean };

function fake(dir: Dir[] = [{ name: 'Convenience Corner' }], deleted: unknown[] = [], answer: unknown = COMMITTED) {
  const sent: unknown[][] = [];
  const posts: Array<[string, unknown]> = [];
  const gets: string[] = [];
  const workspaces = dir.map((w, i) => ({
    workspaceId: i === 0 ? WS : `01J0WS00000000000000000${i}AA`,
    name: w.name,
    prefix: 'CC',
    role: 'owner',
    archived: w.archived ?? false,
    projects: [
      { projectId: 'p1', name: 'Shop', description: null, prefix: 'SH', archived: false },
      { projectId: 'p2', name: 'Old shop', description: null, prefix: 'OS', archived: true },
    ],
  }));
  const state = { post: (async () => ({ workspaceId: WS })) as (path: string, body: unknown) => Promise<unknown> };
  const session: Session = {
    userId: () => USER,
    get: async (path) => {
      gets.push(path);
      return path === '/v1/me/workspaces' ? { workspaces } : path === '/v1/me/deleted-items' ? { items: deleted } : {};
    },
    post: async (path, body) => {
      posts.push([path, body]);
      return state.post(path, body);
    },
    postEvents: async (events) => {
      sent.push(events);
      return answer;
    },
  };
  return { session, sent, posts, gets, workspaces, state };
}

const tool = (name: string, s: Session) => {
  const t = workspaceTools(s).find((x) => x.name === name);
  if (!t) throw new Error(name);
  return t;
};
const types = (f: { sent: unknown[][] }) => f.sent.flat().map((e) => (e as { type: string }).type);

describe('14.304–14.312 workspace tools', () => {
  it('14.304 create_workspace posts the founding door; no prefix → no key; a 400/422 is passed through', async () => {
    const f = fake();
    await expect(tool('create_workspace', f.session).handler({ name: 'Shop' })).resolves.toEqual({ workspaceId: WS });
    // toStrictEqual: `{ name, prefix: undefined }` would pass `toEqual` and is exactly the shape the mutation sends.
    expect(f.posts[0]).toStrictEqual(['/v1/workspaces', { name: 'Shop' }]);
    // CONTROL, same `it`: a prefix, when given, is sent.
    await tool('create_workspace', f.session).handler({ name: 'Shop', prefix: 'SHP' });
    expect(f.posts[1]).toStrictEqual(['/v1/workspaces', { name: 'Shop', prefix: 'SHP' }]);

    f.state.post = async () => {
      throw new HttpError(400, { error: 'invalid', message: 'A workspace needs a name.' });
    };
    await expect(tool('create_workspace', f.session).handler({ name: '  ' })).rejects.toThrow('invalid: A workspace needs a name.');
    f.state.post = async () => {
      throw new HttpError(422, { status: 'refused', eventId: 'e', rule: 'permission.role', reason: 'Not allowed.' });
    };
    await expect(tool('create_workspace', f.session).handler({ name: 'X' })).rejects.toThrow('refused by permission.role: Not allowed.');
  });

  it('14.305 get_workspace answers from the directory; a deleted one says so and names undelete_workspace; an unknown id is not found', async () => {
    const f = fake([{ name: 'Convenience Corner' }], [
      { kind: 'workspace', id: 'D', workspaceId: 'D', label: 'Gone', deletedAt: '2026-09-30T00:00:00Z' },
      { kind: 'project', id: 'P', workspaceId: 'W2', label: 'A deleted project', deletedAt: '2026-09-30T00:00:00Z' },
    ]);
    await expect(tool('get_workspace', f.session).handler({ workspaceId: WS })).resolves.toEqual({
      workspaceId: WS,
      name: 'Convenience Corner',
      prefix: 'CC',
      role: 'owner',
      archived: false,
      projectCount: 1,
      archivedProjectCount: 1,
    });
    // Read at call time, never remembered: the same id after a rename answers the new name.
    f.workspaces[0]!.name = 'Corner Shop';
    expect(await tool('get_workspace', f.session).handler({ workspaceId: WS })).toMatchObject({ name: 'Corner Shop' });

    const gone = (await tool('get_workspace', f.session).handler({ workspaceId: 'D' })) as Record<string, unknown>;
    expect(gone).toMatchObject({ workspaceId: 'D', name: 'Gone', deleted: true });
    expect(JSON.stringify(gone)).toContain('undelete_workspace');
    // CONTROL, same `it`: a PROJECT row in Deleted items with the id does not make a deleted workspace.
    await expect(tool('get_workspace', f.session).handler({ workspaceId: 'P' })).rejects.toThrow('workspace not found or not visible to you');
    await expect(tool('get_workspace', f.session).handler({ workspaceId: 'nope' })).rejects.toThrow('workspace not found or not visible to you');
  });

  it('14.306 rename emits a parseable workspace.renamed with origin mcp; a member refusal is verbatim', async () => {
    const f = fake();
    await tool('rename_workspace', f.session).handler({ workspaceId: WS, name: 'Corner Shop' });
    const e = f.sent[0]?.[0] as Record<string, unknown>;
    expect(e).toMatchObject({ type: 'workspace.renamed', origin: 'mcp', actorId: USER, entity: { kind: 'workspace', id: WS }, payload: { name: 'Corner Shop' } });
    expect(parseEvent({ ...e, serverTime: '2026-10-01T10:00:00.000Z', seq: 1 }, domainRegistry).ok).toBe(true); // control

    const refused = fake(undefined, undefined, {
      results: [{ status: 'refused', eventId: 'e', rule: 'permission.role', reason: 'Only a workspace owner or admin can rename the workspace.' }],
    });
    await expect(tool('rename_workspace', refused.session).handler({ workspaceId: WS, name: 'X' })).rejects.toThrow(
      /^refused by permission\.role: Only a workspace owner or admin can rename the workspace\.$/,
    );
  });

  it('14.307 archive/delete refuse without or with a wrong confirm_name, naming the expected name, and send nothing', async () => {
    for (const name of ['archive_workspace', 'delete_workspace']) {
      const f = fake();
      await expect(tool(name, f.session).handler({ workspaceId: WS })).rejects.toThrow('confirm_name must be "Convenience Corner"');
      await expect(tool(name, f.session).handler({ workspaceId: WS, confirm_name: 'convenience corner' })).rejects.toThrow('confirm_name must be "Convenience Corner"');
      await expect(tool(name, f.session).handler({ workspaceId: WS, confirm_name: 'Convenience Corner ' })).rejects.toThrow('confirm_name must be "Convenience Corner"');
      await expect(tool(name, f.session).handler({ workspaceId: 'unknown', confirm_name: 'Convenience Corner' })).rejects.toThrow('workspace not found or not visible to you');
      expect(f.sent).toEqual([]);
      await tool(name, f.session).handler({ workspaceId: WS, confirm_name: 'Convenience Corner' }); // control
      expect(f.sent).toHaveLength(1);
    }
    const f = fake();
    await tool('archive_workspace', f.session).handler({ workspaceId: WS, confirm_name: 'Convenience Corner' });
    expect(types(f)).toEqual(['workspace.archived']);
    expect(f.sent[0]?.[0]).toMatchObject({ origin: 'mcp', actorId: USER, entity: { kind: 'workspace', id: WS }, payload: {} });
  });

  it('14.308 confirm_name is checked against the CURRENT name: after a rename the old name is refused with the new one', async () => {
    for (const name of ['archive_workspace', 'delete_workspace']) {
      const f = fake();
      await tool('get_workspace', f.session).handler({ workspaceId: WS }); // the assistant holds "Convenience Corner"
      f.workspaces[0]!.name = 'Corner Shop'; // renamed elsewhere (the screen, another assistant)
      await expect(tool(name, f.session).handler({ workspaceId: WS, confirm_name: 'Convenience Corner' })).rejects.toThrow('confirm_name must be "Corner Shop"');
      expect(f.sent).toEqual([]);
      await tool(name, f.session).handler({ workspaceId: WS, confirm_name: 'Corner Shop' }); // control: the new name passes
      expect(f.sent).toHaveLength(1);
    }
  });

  it('14.309 delete is soft: workspace.deleted only, never purge.marked; undelete emits workspace.undeleted', async () => {
    const f = fake();
    const result = await tool('delete_workspace', f.session).handler({ workspaceId: WS, confirm_name: 'Convenience Corner' });
    expect(types(f)).toEqual(['workspace.deleted']);
    expect(JSON.stringify(result)).toMatch(/Deleted items/);
    expect(JSON.stringify(result)).toMatch(/15 days/);
    expect(JSON.stringify(result)).toContain('undelete_workspace');
    expect(types(f)).not.toContain('purge.marked');
    // CONTROL, same `it`: undelete emits its own event.
    await tool('undelete_workspace', f.session).handler({ workspaceId: WS });
    expect(types(f)).toEqual(['workspace.deleted', 'workspace.undeleted']);
  });

  it('14.310 restore/undelete need no confirm_name; an unknown id is still refused with the server reason', async () => {
    const f = fake();
    await tool('restore_workspace', f.session).handler({ workspaceId: WS });
    await tool('undelete_workspace', f.session).handler({ workspaceId: WS });
    expect(types(f)).toEqual(['workspace.restored', 'workspace.undeleted']);
    expect(f.sent[0]?.[0]).toMatchObject({ origin: 'mcp', entity: { kind: 'workspace', id: WS }, payload: {} });
    // CONTROL, same `it`: the server's refusal for an id it does not know is thrown in its own words.
    const unknown = fake(undefined, undefined, {
      results: [{ status: 'refused', eventId: 'e', rule: 'workspace-unknown', reason: 'No such workspace.' }],
    });
    await expect(tool('restore_workspace', unknown.session).handler({ workspaceId: 'nope' })).rejects.toThrow(
      'refused by workspace-unknown: No such workspace.',
    );
  });

  it('14.311 an owner-only refusal comes back verbatim; the owner commits', async () => {
    const member = fake(undefined, undefined, { results: [OWNER_ONLY] });
    for (const name of ['archive_workspace', 'delete_workspace']) {
      await expect(tool(name, member.session).handler({ workspaceId: WS, confirm_name: 'Convenience Corner' })).rejects.toThrow(
        /^refused by permission\.role: Only the workspace owner can archive, delete or restore a workspace\.$/,
      );
    }
    await expect(tool('restore_workspace', member.session).handler({ workspaceId: WS })).rejects.toThrow(
      /^refused by permission\.role: Only the workspace owner can archive, delete or restore a workspace\.$/,
    );
    // CONTROL, same `it`: the owner's own call commits.
    const owner = fake();
    await expect(tool('archive_workspace', owner.session).handler({ workspaceId: WS, confirm_name: 'Convenience Corner' })).resolves.toMatchObject({ status: 'committed' });
  });

  it('14.312 list_workspaces defaults to live; include adds archived/deleted (flagged), each once', async () => {
    const f = fake([{ name: 'Live' }, { name: 'Old', archived: true }], [
      { kind: 'workspace', id: 'D', workspaceId: 'D', label: 'Gone', deletedAt: '2026-09-30T00:00:00Z' },
      { kind: 'project', id: 'P', workspaceId: WS, label: 'Not a workspace', deletedAt: '2026-09-30T00:00:00Z' },
    ]);
    const list = async (args: Record<string, unknown>) =>
      ((await tool('list_workspaces', f.session).handler(args)) as { workspaces: Array<{ name: string; archived?: boolean; deleted?: boolean }> }).workspaces;
    const names = async (args: Record<string, unknown>) => (await list(args)).map((w) => w.name);
    expect(await names({})).toEqual(['Live']);
    expect(f.gets).not.toContain('/v1/me/deleted-items'); // the Deleted items read is paid for only when asked
    expect(await names({ include: ['archived'] })).toEqual(['Live', 'Old']);
    expect(await names({ include: ['deleted'] })).toEqual(['Live', 'Gone']);
    expect(await names({ include: ['archived', 'deleted'] })).toEqual(['Live', 'Old', 'Gone']); // control
    const all = await list({ include: ['archived', 'deleted'] });
    expect(all.find((w) => w.name === 'Old')).toMatchObject({ archived: true });
    expect(all.find((w) => w.name === 'Gone')).toMatchObject({ deleted: true });
    expect(all.find((w) => w.name === 'Live')?.deleted).toBeUndefined();
  });
});
