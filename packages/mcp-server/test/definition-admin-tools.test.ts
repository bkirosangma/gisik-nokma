import { describe, expect, it } from 'vitest';
import { domainRegistry, parseEvent, ticketTypeDefSchema, workflowDefSchema } from '@gisik-nokma/domain';
import { HttpError } from '../src/http-client.js';
import { definitionAdminTools } from '../src/tools/definition-admin-tools.js';
import type { Session } from '../src/session.js';
import { NO_TRANSFER } from './fixtures/fake-session.js';

/**
 * MCP-everything T12. Cases 14.530–14.534 (14.535 and 14.536 are hosted:
 * `apps/server/test/mcp/mcp-definitions.test.ts`).
 */
const USER = '01J0A5ER0000000000000000AA';
const WS = '01J0WS000000000000000000AA';
const T = '01J0A1CKE70000000000000001';
const WF = '01J0WF000000000000000000AA';
const RAVI = '01J0RAV10000000000000000AA';
const COMMITTED = { results: [{ status: 'committed', eventId: 'e', seq: 1, serverTime: '2026-10-01T10:00:00.000Z' }] };
const NOT_FOUND = { error: 'NOT_FOUND', message: 'not found' };

const NEW_WORKFLOW = {
  id: WF,
  version: 1,
  name: 'Repairs',
  initialStateId: 'open',
  states: [
    { id: 'open', name: 'Open', category: 'open' },
    { id: 'done', name: 'Done', category: 'terminal' },
  ],
  transitions: [{ from: 'open', to: 'done', rules: [] }],
};
const NEW_TYPE = {
  id: 'repair',
  name: 'Repair',
  icon: 'wrench',
  rank: 3,
  workflowId: WF,
  fields: [{ id: 'shelf', name: 'Shelf', type: 'text' }],
};

type Answers = Record<string, unknown>;

/** GETs answer from `answers` by exact path; an unlisted path is a 404 (what a non-admin reads on an admin-only route). */
function fake(answers: Answers = {}, over: Partial<Session> = {}) {
  const batches: unknown[][] = [];
  const posts: Array<[string, unknown]> = [];
  const gets: string[] = [];
  const base: Answers = {
    '/v1/me/workspaces': {
      workspaces: [{ workspaceId: WS, name: 'Corner Shop', prefix: 'CC', role: 'owner', archived: false, projects: [] }],
    },
    [`/v1/workspaces/${WS}/ticket-types`]: {
      workspaceId: WS,
      ticketTypes: [{ id: 'task', name: 'Task', icon: 'check', rank: 1, workflowId: 'wf-old', fields: [] }],
    },
    [`/v1/workspaces/${WS}/ticket-counts-by-type`]: { workspaceId: WS, counts: { task: 7 } },
    [`/v1/workspaces/${WS}/tickets/${T}`]: { key: 'CCSO-4', ticket: { own_mode: 'workspace', resolved_mode: 'workspace' } },
    ...answers,
  };
  const session: Session = {
    userId: () => USER,
    get: async (path) => {
      gets.push(path);
      if (!(path in base)) throw new HttpError(404, NOT_FOUND);
      return base[path];
    },
    post: async (path, body) => {
      posts.push([path, body]);
      return { status: 'migrated', count: 2 };
    },
    postEvents: async (events) => {
      batches.push(events);
      return COMMITTED;
    },
    ...NO_TRANSFER,
    ...over,
  };
  return { session, batches, posts, gets };
}

const tool = (name: string, s: Session) => {
  const t = definitionAdminTools(s).find((x) => x.name === name);
  if (!t) throw new Error(name);
  return t;
};
const stamp = (e: unknown) => ({ ...(e as object), serverTime: '2026-10-01T10:00:00.000Z', seq: 1 });

describe('14.530–14.534 definition admin tools', () => {
  it('14.530 define_workflow: schema first, then the preview, then ONE event', async () => {
    // CONTROL: the fixtures are real definitions, so the refusal below can only be the `states` change.
    expect(workflowDefSchema.safeParse(NEW_WORKFLOW).success).toBe(true);
    const f = fake();
    await expect(
      tool('define_workflow', f.session).handler({ workspaceId: WS, definition: { ...NEW_WORKFLOW, states: 'x' }, confirm_name: 'Corner Shop' }),
    ).rejects.toThrow(/states/);
    expect(f.gets, 'a bad definition is refused before any read').toEqual([]);
    expect(f.batches).toEqual([]);
    // The event door files a workflow under its id, which must be a ULID: refused here, naming the field.
    await expect(
      tool('define_workflow', f.session).handler({ workspaceId: WS, definition: { ...NEW_WORKFLOW, id: 'wf-new' }, confirm_name: 'Corner Shop' }),
    ).rejects.toThrow(/definition\.id.*ULID/);
    expect(f.batches).toEqual([]);

    // A NEW workflow id: no current name, so the confirm is the workspace's.
    expect(await tool('define_workflow', f.session).handler({ workspaceId: WS, definition: NEW_WORKFLOW })).toMatchObject({
      preview: true,
      confirm: 'confirm_name must be "Corner Shop"',
      counts: { ticketsInWorkflow: 0 },
      nothingChanged: true,
    });
    expect(f.batches).toEqual([]);
    await tool('define_workflow', f.session).handler({ workspaceId: WS, definition: NEW_WORKFLOW, confirm_name: 'Corner Shop' });
    expect(f.batches).toHaveLength(1);
    expect(f.batches[0]).toHaveLength(1);
    expect(f.batches[0]?.[0]).toMatchObject({ type: 'workflow.defined', origin: 'mcp', actorId: USER, entity: { kind: 'workflow', id: WF }, payload: NEW_WORKFLOW });
    expect(parseEvent(stamp(f.batches[0]?.[0]), domainRegistry).ok).toBe(true);

    // An EXISTING workflow: confirm is ITS name, the preview counts its tickets and says version and size, and `stateMapping` rides along.
    const g = fake({
      [`/v1/workspaces/${WS}/workflows/${WF}`]: { workspaceId: WS, workflow: { ...NEW_WORKFLOW, name: 'Old repairs' } },
      [`/v1/workspaces/${WS}/workflows/${WF}/state-occupancy`]: { workspaceId: WS, workflowId: WF, counts: { open: 3, done: 1 } },
    });
    const v2 = { ...NEW_WORKFLOW, version: 2 };
    const preview = (await tool('define_workflow', g.session).handler({ workspaceId: WS, definition: v2 })) as { wouldChange: string; confirm: string; counts: unknown };
    expect(preview.confirm).toBe('confirm_name must be "Old repairs"');
    expect(preview.counts).toEqual({ ticketsInWorkflow: 4 });
    expect(preview.wouldChange).toContain('version 2');
    expect(preview.wouldChange).toContain('2 states');
    expect(preview.wouldChange).toContain('1 moves');
    await tool('define_workflow', g.session).handler({ workspaceId: WS, definition: v2, stateMapping: { gone: 'open' }, confirm_name: 'Old repairs' });
    expect(g.batches[0]?.[0]).toMatchObject({ payload: { ...v2, stateMapping: { gone: 'open' } } });
  });

  it('14.531 define_ticket_type: schema, the type name, the population, and a FRESH entity id', async () => {
    expect(ticketTypeDefSchema.safeParse(NEW_TYPE).success).toBe(true); // control: the fixture is real
    const f = fake();
    await expect(
      tool('define_ticket_type', f.session).handler({ workspaceId: WS, definition: { ...NEW_TYPE, rank: 0 }, confirm_name: 'Corner Shop' }),
    ).rejects.toThrow(/rank/);
    expect(f.batches).toEqual([]);

    // New type: the workspace's name; the preview counts none.
    expect(await tool('define_ticket_type', f.session).handler({ workspaceId: WS, definition: NEW_TYPE })).toMatchObject({
      preview: true,
      confirm: 'confirm_name must be "Corner Shop"',
      counts: { ticketsOfType: 0 },
    });
    expect(f.batches).toEqual([]);
    await tool('define_ticket_type', f.session).handler({ workspaceId: WS, definition: NEW_TYPE, confirm_name: 'Corner Shop' });
    const sent = f.batches[0]?.[0] as { type: string; entity: { kind: string; id: string }; payload: unknown };
    expect(sent.type).toBe('ticket-type.defined');
    expect(sent.payload).toEqual(NEW_TYPE);
    expect(sent.entity.kind).toBe('ticket-type');
    // The app's convention: a fresh ULID per submission, never the type's own id.
    expect(sent.entity.id).not.toBe(NEW_TYPE.id);
    expect(parseEvent(stamp(sent), domainRegistry).ok, 'the payload and the entity id pass the real parser').toBe(true);

    // An existing type: its current name, and the tickets of that type.
    const existing = { ...NEW_TYPE, id: 'task', name: 'Task changed' };
    expect(await tool('define_ticket_type', f.session).handler({ workspaceId: WS, definition: existing })).toMatchObject({
      confirm: 'confirm_name must be "Task"',
      counts: { ticketsOfType: 7 },
    });
  });

  it('14.532 migrate_ticket_type: the type name, the population, the route, its refusals verbatim', async () => {
    const f = fake({ [`/v1/workspaces/${WS}/ticket-types/task/population?workflowId=wf-old`]: { workspaceId: WS, count: 5 } });
    const args = { workspaceId: WS, typeId: 'task', fromWorkflowId: 'wf-old', toWorkflowId: WF, stateMap: { open: 'open' } };
    expect(await tool('migrate_ticket_type', f.session).handler(args)).toMatchObject({
      preview: true,
      confirm: 'confirm_name must be "Task"',
      counts: { ticketsMoved: 5 },
    });
    expect(f.posts, 'the preview posted nothing').toEqual([]);
    // CONTROL: the exact name posts the route's body, stateMap as the object it is.
    expect(await tool('migrate_ticket_type', f.session).handler({ ...args, confirm_name: 'Task' })).toEqual({ status: 'migrated', count: 2 });
    expect(f.posts).toStrictEqual([
      [`/v1/workspaces/${WS}/ticket-types/task/migrate`, { fromWorkflowId: 'wf-old', toWorkflowId: WF, stateMap: { open: 'open' } }],
    ]);
    // A refusal from the route (422 ingest result) arrives in the product's words.
    const refused = fake({}, {
      post: async () => {
        throw new HttpError(422, { status: 'refused', rule: 'migration.same-workflow', reason: 'The source and target workflow are the same.' });
      },
    });
    await expect(tool('migrate_ticket_type', refused.session).handler({ ...args, confirm_name: 'Task' })).rejects.toThrow(
      'refused by migration.same-workflow: The source and target workflow are the same.',
    );
    // The route answers a non-admin 404. A MEMBER (read the workspace and the type, so the 404 is the admin gate) is told so in the gate's own
    // sentence with their role; CONTROL: an owner's 404 is not turned into a refusal.
    const as = (role: string) =>
      fake(
        { '/v1/me/workspaces': { workspaces: [{ workspaceId: WS, name: 'Corner Shop', prefix: 'CC', role, archived: false, projects: [] }] } },
        {
          post: async () => {
            throw new HttpError(404, NOT_FOUND);
          },
        },
      );
    await expect(tool('migrate_ticket_type', as('member').session).handler({ ...args, confirm_name: 'Task' })).rejects.toThrow(
      'refused by permission.role: Only a workspace owner or admin can do this. Your role is member.',
    );
    await expect(tool('migrate_ticket_type', as('owner').session).handler({ ...args, confirm_name: 'Task' })).rejects.toThrow('gisik-nokma answered 404');
    // An unknown type is the uniform not-found, before any confirm.
    await expect(tool('migrate_ticket_type', f.session).handler({ ...args, typeId: 'nope', confirm_name: 'Task' })).rejects.toThrow('ticket type not found or not visible to you');
    // A stateMap that is not a map is refused here, naming it, rather than sent for the route's 400.
    await expect(tool('migrate_ticket_type', f.session).handler({ ...args, stateMap: ['open'], confirm_name: 'Task' })).rejects.toThrow(/stateMap/);
    expect(f.posts).toHaveLength(1);
  });

  it('14.533 set_visibility: confirm on the KEY, userIds only with explicit', async () => {
    const f = fake();
    const base = { workspaceId: WS, ticketId: T };
    await expect(
      tool('set_visibility', f.session).handler({ ...base, mode: 'project', userIds: [RAVI], confirm_name: 'CCSO-4' }),
    ).rejects.toThrow('userIds go only with mode "explicit"');
    await expect(tool('set_visibility', f.session).handler({ ...base, mode: 'explicit', confirm_name: 'CCSO-4' })).rejects.toThrow(/needs userIds/);
    expect(f.batches).toEqual([]);

    const preview = (await tool('set_visibility', f.session).handler({ ...base, mode: 'project' })) as { confirm: string; wouldChange: string };
    expect(preview.confirm).toBe('confirm_name must be "CCSO-4"');
    expect(preview.wouldChange).toContain('CCSO-4');
    expect(preview.wouldChange).toContain('workspace');
    expect(preview.wouldChange).toContain('project');
    expect(f.batches).toEqual([]);

    // CONTROL: `project` carries no `userIds` key at all (not an undefined one).
    await tool('set_visibility', f.session).handler({ ...base, mode: 'project', confirm_name: 'CCSO-4' });
    expect(f.batches[0]?.[0]).toMatchObject({ type: 'visibility.set', entity: { kind: 'ticket', id: T }, payload: { ticketId: T, mode: 'project' } });
    expect((f.batches[0]?.[0] as { payload: object }).payload).toStrictEqual({ ticketId: T, mode: 'project' });
    await tool('set_visibility', f.session).handler({ ...base, mode: 'explicit', userIds: [RAVI], confirm_name: 'CCSO-4' });
    expect(f.batches[1]?.[0]).toMatchObject({ payload: { ticketId: T, mode: 'explicit', userIds: [RAVI] } });
    expect(parseEvent(stamp(f.batches[1]?.[0]), domainRegistry).ok).toBe(true);
    // An invisible ticket is the uniform not-found.
    await expect(tool('set_visibility', f.session).handler({ ...base, ticketId: '01J0A1CKE70000000000000002', mode: 'project', confirm_name: 'X' })).rejects.toThrow(
      'ticket not found or not visible to you',
    );
  });

  it('14.534 update_workspace_settings: only the given settings; null turns auto-close off; nothing given is refused', async () => {
    const f = fake();
    await expect(tool('update_workspace_settings', f.session).handler({ workspaceId: WS, confirm_name: 'Corner Shop' })).rejects.toThrow();
    expect(f.batches).toEqual([]);
    expect(await tool('update_workspace_settings', f.session).handler({ workspaceId: WS, staleDays: 9 })).toMatchObject({
      preview: true,
      confirm: 'confirm_name must be "Corner Shop"',
    });
    expect(f.batches).toEqual([]);
    // CONTROL: one setting sends one key.
    await tool('update_workspace_settings', f.session).handler({ workspaceId: WS, staleDays: 9, confirm_name: 'Corner Shop' });
    expect(f.batches[0]?.[0]).toMatchObject({ type: 'workspace.settings_set', entity: { kind: 'workspace', id: WS } });
    expect((f.batches[0]?.[0] as { payload: object }).payload).toStrictEqual({ staleDays: 9 });
    // null is a value: auto-close off.
    await tool('update_workspace_settings', f.session).handler({ workspaceId: WS, autoCloseAfterDays: null, confirm_name: 'Corner Shop' });
    expect((f.batches[1]?.[0] as { payload: object }).payload).toStrictEqual({ autoCloseAfterDays: null });
    expect(parseEvent(stamp(f.batches[1]?.[0]), domainRegistry).ok).toBe(true);
    // Out of range is the schema's refusal, before the send.
    await expect(tool('update_workspace_settings', f.session).handler({ workspaceId: WS, staleDays: 999, confirm_name: 'Corner Shop' })).rejects.toThrow(/staleDays/);
    expect(f.batches).toHaveLength(2);
  });
});
