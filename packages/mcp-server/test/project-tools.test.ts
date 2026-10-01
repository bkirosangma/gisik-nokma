import { describe, expect, it } from 'vitest';
import { domainRegistry, parseEvent } from '@gisik-nokma/domain';
import { projectTools } from '../src/tools/project-tools.js';
import type { Session } from '../src/session.js';

/**
 * MCP CRUD plan, Task 7. Cases 14.317–14.324 (the plan's `get_project` case is
 * 14.324, not 14.316: lane 3 spent 14.316 on the lazy-session `post`).
 */
const USER = '01J0A5ER0000000000000000AA';
const WS = '01J0WS000000000000000000AA';
const WS2 = '01J0WS000000000000000001AA';
const P = '01J0PR000000000000000000AA';
const COMMITTED = { results: [{ status: 'committed', eventId: 'e', seq: 1, serverTime: '2026-10-01T10:00:00.000Z' }] };
const COMMITTED_TWO = {
  results: [
    { status: 'committed', eventId: 'e1', seq: 1, serverTime: '2026-10-01T10:00:00.000Z' },
    { status: 'committed', eventId: 'e2', seq: 2, serverTime: '2026-10-01T10:00:00.000Z' },
  ],
};
/** `adminOnlyReason('member')` and `PERMISSION_ROLE_RULE`, copied from `apps/server/src/permissions/check-permission.ts` — this package cannot import the server. */
const ADMIN_ONLY = {
  status: 'refused',
  eventId: 'e',
  rule: 'permission.role',
  reason: 'Only a workspace owner or admin can do this. Your role is member.',
};

type Proj = { projectId: string; name: string; description: string | null; prefix: string; archived: boolean; ticketCount?: number };

function fake(answer: unknown = COMMITTED, deleted: unknown[] = []) {
  const sent: unknown[][] = [];
  const gets: string[] = [];
  const projects: Proj[] = [
    { projectId: P, name: 'Shop operations', description: null, prefix: 'SO', archived: false, ticketCount: 7 },
    { projectId: 'P-OLD', name: 'Old shop', description: 'Wound down', prefix: 'OS', archived: true },
  ];
  const workspaces = [
    { workspaceId: WS, name: 'Convenience Corner', prefix: 'CC', role: 'owner', archived: false, projects },
    { workspaceId: WS2, name: 'Other', prefix: 'OT', role: 'owner', archived: false, projects: [] },
  ];
  const session: Session = {
    userId: () => USER,
    get: async (path) => {
      gets.push(path);
      // A FRESH copy per read, like the wire: handing back the same array would let a cached reference see an
      // in-place rename and make a stale-name bug invisible (14.321).
      return structuredClone(path === '/v1/me/workspaces' ? { workspaces } : path === '/v1/me/deleted-items' ? { items: deleted } : {});
    },
    post: async () => ({}),
    postEvents: async (events) => {
      sent.push(events);
      return answer;
    },
  };
  return { session, sent, gets, projects };
}

const tool = (name: string, s: Session) => {
  const t = projectTools(s).find((x) => x.name === name);
  if (!t) throw new Error(name);
  return t;
};
const types = (f: { sent: unknown[][] }) => f.sent.flat().map((e) => (e as { type: string }).type);
const parses = (e: unknown) => parseEvent({ ...(e as object), serverTime: '2026-10-01T10:00:00.000Z', seq: 1 }, domainRegistry).ok;

describe('14.317–14.324 project tools', () => {
  it('14.317 create_project founds with the pair in ONE batch; description/prefix are keys only when given', async () => {
    const f = fake(COMMITTED_TWO);
    await tool('create_project', f.session).handler({ workspaceId: WS, name: 'Repairs', description: 'Fix list', prefix: 'RP' });
    expect(f.sent).toHaveLength(1); // ONE postEvents call, not two
    const [created, added] = f.sent[0] as Array<Record<string, unknown>>;
    expect(f.sent[0]).toHaveLength(2);
    expect(created).toMatchObject({
      type: 'project.created',
      workspaceId: WS,
      origin: 'mcp',
      actorId: USER,
      payload: { name: 'Repairs', description: 'Fix list', prefix: 'RP' },
    });
    const entity = created!['entity'] as { kind: string; id: string };
    expect(entity.kind).toBe('project');
    expect(added).toMatchObject({
      type: 'project.member_added',
      workspaceId: WS,
      origin: 'mcp',
      actorId: USER,
      entity, // both against the NEW project id
      payload: { userId: USER, projectAdmin: true },
    });
    for (const e of [created, added]) expect(parses(e)).toBe(true); // control: both pass parseEvent

    // Control, same `it`: absent description/prefix are ABSENT keys, never `undefined` (toStrictEqual sees the difference).
    await tool('create_project', f.session).handler({ workspaceId: WS, name: 'Bare' });
    expect((f.sent[1]?.[0] as { payload: unknown }).payload).toStrictEqual({ name: 'Bare' });
    expect(f.sent[1]).toHaveLength(2);
  });

  it('14.318 update_project sends only the given keys; "" clears; neither key is refused locally; no prefix argument', async () => {
    const f = fake();
    await tool('update_project', f.session).handler({ projectId: P, name: 'Shop floor' });
    await tool('update_project', f.session).handler({ projectId: P, description: '' });
    await tool('update_project', f.session).handler({ projectId: P, name: 'Shop', description: 'Day to day' });
    expect(f.sent.map((b) => (b[0] as { payload: unknown }).payload)).toStrictEqual([
      { name: 'Shop floor' },
      { description: null },
      { name: 'Shop', description: 'Day to day' },
    ]);
    expect(f.sent[0]?.[0]).toMatchObject({ type: 'project.updated', origin: 'mcp', actorId: USER, workspaceId: WS, entity: { kind: 'project', id: P } });
    expect(parses(f.sent[0]?.[0])).toBe(true);
    const sentBefore = f.sent.length;
    await expect(tool('update_project', f.session).handler({ projectId: P })).rejects.toThrow(/name or description/);
    expect(f.sent).toHaveLength(sentBefore); // nothing sent for a no-op
    // The prefix is immutable (FD3): the tool has no such argument, so it cannot be passed.
    expect(Object.keys(tool('update_project', f.session).inputSchema)).toEqual(['projectId', 'name', 'description']);
    await expect(tool('update_project', f.session).handler({ projectId: 'nope', name: 'X' })).rejects.toThrow('project not found or not visible to you');
  });

  it('14.319 archive/delete refuse without or with a wrong confirm_name, naming the expected name, and send nothing', async () => {
    for (const name of ['archive_project', 'delete_project']) {
      const f = fake();
      const expected = 'confirm_name must be "Shop operations"';
      await expect(tool(name, f.session).handler({ projectId: P })).rejects.toThrow(expected);
      await expect(tool(name, f.session).handler({ projectId: P, confirm_name: 'shop operations' })).rejects.toThrow(expected);
      await expect(tool(name, f.session).handler({ projectId: P, confirm_name: 'Shop operations ' })).rejects.toThrow(expected);
      await expect(tool(name, f.session).handler({ projectId: P, confirm_name: ' Shop operations' })).rejects.toThrow(expected);
      await expect(tool(name, f.session).handler({ projectId: 'nope', confirm_name: 'Shop operations' })).rejects.toThrow('project not found or not visible to you');
      expect(f.sent).toEqual([]);
      await tool(name, f.session).handler({ projectId: P, confirm_name: 'Shop operations' }); // control: the exact name sends one event
      expect(f.sent).toHaveLength(1);
    }
    const f = fake();
    await tool('archive_project', f.session).handler({ projectId: P, confirm_name: 'Shop operations' });
    expect(types(f)).toEqual(['project.archived']);
    expect(f.sent[0]?.[0]).toMatchObject({ origin: 'mcp', actorId: USER, workspaceId: WS, entity: { kind: 'project', id: P }, payload: {} });
    expect(parses(f.sent[0]?.[0])).toBe(true);
  });

  it('14.320 delete is soft: project.deleted only, never purge.marked; undelete emits project.undeleted; restore emits project.restored', async () => {
    const f = fake(COMMITTED, [{ kind: 'project', id: 'P-GONE', workspaceId: WS, label: 'Gone', deletedAt: '2026-09-30T00:00:00Z' }]);
    const result = await tool('delete_project', f.session).handler({ projectId: P, confirm_name: 'Shop operations' });
    expect(types(f)).toEqual(['project.deleted']);
    expect(JSON.stringify(result)).toMatch(/Deleted items/);
    expect(JSON.stringify(result)).toMatch(/15 days/);
    expect(JSON.stringify(result)).toContain('undelete_project');
    expect(types(f)).not.toContain('purge.marked');
    expect(parses(f.sent[0]?.[0])).toBe(true);
    // CONTROL, same `it`: the way back emits its own events, with no confirm_name, against the workspace the project lives in.
    await tool('undelete_project', f.session).handler({ projectId: 'P-GONE' });
    await tool('restore_project', f.session).handler({ projectId: 'P-OLD' });
    expect(types(f)).toEqual(['project.deleted', 'project.undeleted', 'project.restored']);
    expect(f.sent[1]?.[0]).toMatchObject({ workspaceId: WS, entity: { kind: 'project', id: 'P-GONE' }, payload: {} });
    expect(f.sent[2]?.[0]).toMatchObject({ workspaceId: WS, entity: { kind: 'project', id: 'P-OLD' }, payload: {} });
    await expect(tool('undelete_project', f.session).handler({ projectId: 'nope' })).rejects.toThrow('project not found or not visible to you');
  });

  it('14.321 after a rename the OLD name is refused with the NEW name in the message; nothing is sent', async () => {
    for (const name of ['archive_project', 'delete_project']) {
      const f = fake();
      await tool('get_project', f.session).handler({ projectId: P }); // the assistant holds "Shop operations"
      f.projects[0]!.name = 'Shop floor'; // renamed elsewhere (the screen, another assistant)
      await expect(tool(name, f.session).handler({ projectId: P, confirm_name: 'Shop operations' })).rejects.toThrow('confirm_name must be "Shop floor"');
      expect(f.sent).toEqual([]);
      await tool(name, f.session).handler({ projectId: P, confirm_name: 'Shop floor' }); // control: the new name passes
      expect(f.sent).toHaveLength(1);
    }
    // The directory is read at call time on EVERY call, not once per tool instance.
    const f = fake();
    const t = tool('delete_project', f.session);
    await expect(t.handler({ projectId: P, confirm_name: 'nope' })).rejects.toThrow('"Shop operations"');
    f.projects[0]!.name = 'Renamed twice';
    await expect(t.handler({ projectId: P, confirm_name: 'Shop operations' })).rejects.toThrow('"Renamed twice"');
  });

  it('14.322 a member refusal (project.created, project.updated, archive) is verbatim, with one send and no follow-up', async () => {
    const verbatim = /^refused by permission\.role: Only a workspace owner or admin can do this\. Your role is member\.$/;
    const refusedFake = () => fake({ results: [ADMIN_ONLY] });

    const create = refusedFake();
    await expect(tool('create_project', create.session).handler({ workspaceId: WS, name: 'Repairs' })).rejects.toThrow(
      /^event 0 refused by permission\.role: Only a workspace owner or admin can do this\. Your role is member\.$/,
    );
    expect(create.sent).toHaveLength(1); // the pair went as ONE batch; no second submit after the refusal

    const update = refusedFake();
    await expect(tool('update_project', update.session).handler({ projectId: P, name: 'X' })).rejects.toThrow(verbatim);
    expect(update.sent).toHaveLength(1);

    const archive = refusedFake();
    await expect(tool('archive_project', archive.session).handler({ projectId: P, confirm_name: 'Shop operations' })).rejects.toThrow(verbatim);
    expect(archive.sent).toHaveLength(1);

    // CONTROL, same `it`: an admin's identical calls commit.
    const admin = fake(COMMITTED_TWO);
    await tool('create_project', admin.session).handler({ workspaceId: WS, name: 'Repairs' });
    await tool('update_project', admin.session).handler({ projectId: P, name: 'X' });
    await tool('archive_project', admin.session).handler({ projectId: P, confirm_name: 'Shop operations' });
    expect(types(admin)).toEqual(['project.created', 'project.member_added', 'project.updated', 'project.archived']);
  });

  it('14.323 list_projects defaults to live projects; include adds archived / deleted of THAT workspace only', async () => {
    const f = fake(COMMITTED, [
      { kind: 'project', id: 'P-GONE', workspaceId: WS, label: 'Gone', deletedAt: '2026-09-30T00:00:00Z' },
      { kind: 'project', id: 'P-ELSE', workspaceId: WS2, label: 'Other workspace', deletedAt: '2026-09-30T00:00:00Z' },
      { kind: 'workspace', id: 'W-GONE', workspaceId: 'W-GONE', label: 'A workspace', deletedAt: '2026-09-30T00:00:00Z' },
      // a deleted WORKSPACE row carrying THIS workspace's id must not be listed as a project
      { kind: 'workspace', id: WS, workspaceId: WS, label: 'This workspace, deleted', deletedAt: '2026-09-30T00:00:00Z' },
    ]);
    const names = async (args: object) =>
      ((await tool('list_projects', f.session).handler({ workspaceId: WS, ...args })) as { projects: { name: string }[] }).projects.map((p) => p.name);
    expect(await names({})).toEqual(['Shop operations']);
    expect(await names({ include: ['archived'] })).toEqual(['Shop operations', 'Old shop']);
    expect(f.gets).not.toContain('/v1/me/deleted-items'); // Deleted items is read only when asked for
    expect(await names({ include: ['deleted'] })).toEqual(['Shop operations', 'Gone']);
    expect(await names({ include: ['archived', 'deleted'] })).toEqual(['Shop operations', 'Old shop', 'Gone']); // control: each once
    const gone = ((await tool('list_projects', f.session).handler({ workspaceId: WS, include: ['deleted'] })) as { projects: Array<Record<string, unknown>> }).projects[1];
    expect(gone).toMatchObject({ projectId: 'P-GONE', deleted: true });
    const old = ((await tool('list_projects', f.session).handler({ workspaceId: WS, include: ['archived'] })) as { projects: Array<Record<string, unknown>> }).projects[1];
    expect(old).toMatchObject({ projectId: 'P-OLD', archived: true });
  });

  it('14.324 get_project answers name, description, prefix, archived and ticket count; a deleted one says so and names undelete_project; unknown is not found', async () => {
    const f = fake(COMMITTED, [
      { kind: 'project', id: 'P-GONE', workspaceId: WS, label: 'Gone', deletedAt: '2026-09-30T00:00:00Z' },
      { kind: 'workspace', id: 'W-GONE', workspaceId: 'W-GONE', label: 'A workspace', deletedAt: '2026-09-30T00:00:00Z' },
    ]);
    await expect(tool('get_project', f.session).handler({ projectId: P })).resolves.toEqual({
      projectId: P,
      workspaceId: WS,
      name: 'Shop operations',
      description: null,
      prefix: 'SO',
      archived: false,
      ticketCount: 7,
    });
    expect(await tool('get_project', f.session).handler({ projectId: 'P-OLD' })).toMatchObject({
      description: 'Wound down',
      archived: true,
    });
    const gone = (await tool('get_project', f.session).handler({ projectId: 'P-GONE' })) as Record<string, unknown>;
    expect(gone).toMatchObject({ projectId: 'P-GONE', name: 'Gone', deleted: true });
    expect(JSON.stringify(gone)).toContain('undelete_project');
    // CONTROL, same `it`: a deleted WORKSPACE with the id is not a deleted project, and an unknown id is not found.
    await expect(tool('get_project', f.session).handler({ projectId: 'W-GONE' })).rejects.toThrow('project not found or not visible to you');
    await expect(tool('get_project', f.session).handler({ projectId: 'nope' })).rejects.toThrow('project not found or not visible to you');
  });
});
