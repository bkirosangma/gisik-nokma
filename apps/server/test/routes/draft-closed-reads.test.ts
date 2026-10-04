import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { membershipId, newUlid, type HomeResponse, type LedgerEvent, type SearchResponse } from '@gisik-nokma/domain';
import { MIGRATION_RULES } from '../../src/routes/builder-reads.js';
import { workspaceIdentityFromLedger } from '../../src/workspaces/workspace-name.js';
import { applyCommitted, makeCommitted } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { seedDraftWorld, withDraftsOpened, type DraftWorld } from '../helpers/draft-world.js';
import { buildReadTestApp, type ReadRole, type ReadWorld } from '../helpers/read-app.js';

/**
 * Drafts T3 (spec §4.2 groups B and C): every read a viewer reaches through a route answers as if a draft
 * did not exist, for everyone, its author included (the author's doors are T4). Cases 28.051-28.057, 28.060,
 * 28.061, 28.063, 28.066, 28.067, 28.069. Each closed answer is paired, in the same `it`, with the SAME request after
 * `withDraftsOpened` cleared the flag: the haystack holds the needle.
 *
 * One database and one read world; 28.061, 28.063, 28.066 and 28.067 change the world, so they run last.
 */

let db: TestDatabase;
let read: ReadWorld;
let world: DraftWorld;
beforeAll(async () => {
  db = await createTestDatabase();
  read = await buildReadTestApp(db);
  world = await seedDraftWorld(db.pool, read);
}, 120_000);
afterAll(async () => {
  await read.app.close();
  await db.drop();
});

const owner = (): string => read.world.owner;

type Founded = { projectId: string; tickets: string[] };

/**
 * A project (ENTERED prefix) with `titles.length` tickets in this order, the one at `draftIndex` a DRAFT by
 * the member (`search-by-key.test.ts`'s helper plus that one parameter).
 */
async function foundProject(prefix: string, titles: readonly string[], draftIndex: number): Promise<Founded> {
  const projectId = newUlid();
  const ws = { workspaceId: WS(), actorId: owner() };
  const tickets = titles.map(() => newUlid());
  const events: LedgerEvent[] = [
    makeCommitted({ ...ws, entity: { kind: 'project', id: projectId }, type: 'project.created', payload: { name: `Keys ${prefix}`, prefix } }),
    makeCommitted({ ...ws, entity: { kind: 'project', id: projectId }, type: 'project.member_added', payload: { userId: owner(), projectAdmin: true } }),
    makeCommitted({ ...ws, entity: { kind: 'project', id: projectId }, type: 'project.member_added', payload: { userId: read.world.member, projectAdmin: false } }),
    ...titles.map((title, index) =>
      makeCommitted({
        ...ws,
        actorId: index === draftIndex ? read.world.member : owner(),
        entity: { kind: 'ticket', id: tickets[index] as string },
        type: 'ticket.created',
        payload: {
          typeId: 'task', projectId, parentId: null, title,
          ...(index === draftIndex ? { start: 'backlog', draft: true } : {}),
        },
      }),
    ),
  ];
  await applyCommitted(db.pool, events);
  return { projectId, tickets };
}

/** The workspace prefix RIGHT NOW. */
async function wsPrefix(): Promise<string> {
  const identity = await workspaceIdentityFromLedger(db.pool, WS());
  if (identity.prefix === null) throw new Error('the read world has no workspace prefix');
  return identity.prefix;
}

async function hits(role: ReadRole, q: string, workspaceId: string = WS()): Promise<SearchResponse['hits']> {
  const response = await read.app.inject({
    method: 'GET',
    url: `/v1/search?workspaceId=${encodeURIComponent(workspaceId)}&q=${encodeURIComponent(q)}`,
    headers: read.authOf(role),
  });
  expect(response.statusCode, response.body).toBe(200);
  return (response.json() as SearchResponse).hits;
}

const ids = (list: SearchResponse['hits']): string[] => list.map((hit) => hit.card.ticketId);

type Probe = { role: ReadRole; url: string; marker: string };

async function body(role: ReadRole, url: string): Promise<string> {
  const response = await read.app.inject({ method: 'GET', url, headers: read.authOf(role) });
  expect(response.statusCode, `${role} ${url}: ${response.body}`).toBe(200);
  return response.body;
}

/**
 * The shape of every closed-read case: the draft's marker is ABSENT from the answer, and the SAME request by
 * the SAME viewer with only the flag cleared CARRIES it. The second half is the haystack control: an absence
 * that cannot be told from "the fixture never held it", or from the route paging it out, proves nothing.
 */
async function expectClosed(probes: readonly Probe[]): Promise<void> {
  for (const { role, url, marker } of probes) {
    const closed = await body(role, url);
    expect(closed, `${role} ${url}: the draft ${marker} is in the answer`).not.toContain(marker);
    const opened = await withDraftsOpened(db.pool, world.draftIds, () => body(role, url));
    expect(opened, `${role} ${url}: the control does not show ${marker}`).toContain(marker);
  }
}
const PEOPLE: readonly ReadRole[] = ['owner', 'admin', 'member', 'outsider'];
const eachPerson = (url: string, marker: string): Probe[] => PEOPLE.map((role) => ({ role, url, marker }));
const PROJECT = (): string => read.world.projectId;
const WS = (): string => read.world.workspaceId;

describe('28.051 the board', () => {
  it('never carries a draft, one planted in an active state included', async () => {
    await expectClosed(eachPerson(`/v1/projects/${PROJECT()}/board`, world.draftActiveId));
  });
});

describe('28.052 the lists', () => {
  it('the project list and the workspace list carry no draft, Backlog ones included', async () => {
    const lists = [`/v1/projects/${PROJECT()}/tickets?limit=200`, `/v1/workspaces/${WS()}/ticket-list?limit=200`];
    for (const url of lists) {
      await expectClosed(eachPerson(url, world.draftId)); // a Backlog draft
      await expectClosed(eachPerson(url, world.draftActiveId));
    }
  });
});

describe('28.053 search', () => {
  it('a title search never returns a draft', async () => {
    await expectClosed(eachPerson(`/v1/search?workspaceId=${WS()}&q=Quokka`, world.draftId));
  });

  it('a key-shaped query cannot reach a draft: a draft created first takes no number', async () => {
    const ws = await wsPrefix();
    const founded = await foundProject('DK', ['Quokka key draft', 'Key A', 'Key B'], 0); // ticket 0 is a DRAFT by the member
    const [, a, b] = founded.tickets as [string, string, string];
    expect(ids(await hits('member', `${ws}DK-1`))).toEqual([a]); // CONTROL: the first PUBLISHED ticket is #1
    expect(ids(await hits('member', `${ws}DK-2`))).toEqual([b]);
    expect(await hits('member', `${ws}DK-3`)).toEqual([]);     // a counted draft would make Key B #3
    expect(JSON.stringify(await hits('owner', 'Quokka key draft'))).not.toContain(founded.tickets[0] as string);
  });
});

describe('28.054 My Work', () => {
  it('lists no draft assigned to the viewer, the author\'s own root draft included', async () => {
    await expectClosed([
      { role: 'outsider', url: `/v1/me/work?workspaceId=${WS()}`, marker: world.draftActiveId },
      { role: 'member', url: `/v1/me/work?workspaceId=${WS()}`, marker: world.rootDraftId },
    ]);
  });
});

describe('28.055 Attention', () => {
  it('shows no overdue or stale draft assigned to the viewer', async () => {
    await expectClosed([{ role: 'outsider', url: `/v1/workspaces/${WS()}/attention`, marker: world.draftActiveId }]);
    expect(await body('outsider', `/v1/workspaces/${WS()}/attention`)).toContain(world.twinActiveId); // the twin IS there
  });
});

describe('28.056 the counts', () => {
  async function ticketCount(role: ReadRole): Promise<number> {
    const text = await body(role, '/v1/me/workspaces');
    const workspace = (JSON.parse(text) as { workspaces: Array<{ workspaceId: string; projects: Array<{ projectId: string; ticketCount?: number }> }> })
      .workspaces.find((w) => w.workspaceId === WS());
    return workspace?.projects.find((p) => p.projectId === PROJECT())?.ticketCount ?? Number.NaN;
  }
  it('the workspace-card ticket count excludes drafts; cleared, it exceeds by exactly the drafts the viewer could otherwise see', async () => {
    // the owner reads everything (4 drafts); the others miss the guest-only one (3)
    const expectedExtra: Record<string, number> = { owner: 4, admin: 3, member: 3, outsider: 3 };
    for (const role of PEOPLE) {
      const closed = await ticketCount(role);
      const opened = await withDraftsOpened(db.pool, world.draftIds, () => ticketCount(role));
      expect(opened - closed, role).toBe(expectedExtra[role]);
    }
  });
});

describe('28.057 the single-ticket reads', () => {
  it('answer the not-found response to the owner, an admin and the assignee, byte for byte as for an unknown id', async () => {
    const urls = (id: string): string[] => [
      `/v1/workspaces/${WS()}/tickets/${id}`,
      `/v1/workspaces/${WS()}/tickets/${id}/events`,
      `/v1/workspaces/${WS()}/tickets/${id}/comments`,
      `/v1/workspaces/${WS()}/tickets/${id}/attachments`,
      `/v1/workspaces/${WS()}/tickets/${id}/notes`,
      `/v1/tickets/${id}/history`,
    ];
    const get = (role: ReadRole, url: string) => read.app.inject({ method: 'GET', url, headers: read.authOf(role) });
    for (const role of ['owner', 'admin', 'outsider'] as const) {
      const ghost = urls(newUlid());
      const real = urls(world.draftId);
      for (const [index, url] of real.entries()) {
        const answer = await get(role, url);
        const unknown = await get(role, ghost[index] as string);
        // The notes-of-a-ticket read answers 200 `{ notes: [] }` for ANY id, an unknown one included: it has no
        // ticket gate. No note is attached to the draft here, so this leg compares two empty lists and shows
        // nothing. The read is NOT closed: a readable note attached to a draft IS listed (reviewer probe P1).
        // G11 refuses `note.attached` naming a draft until T9, whose `isClosedDraft` closes the read. Every other
        // read is a 404.
        expect(answer.statusCode, `${role} ${url}`).toBe(url.endsWith('/notes') ? 200 : 404);
        expect(answer.json(), `${role} ${url}: not the unknown-id answer`).toEqual(unknown.json());
      }
      // the bootstrap-style ticket list names no draft either
      expect(await body(role, `/v1/workspaces/${WS()}/tickets`)).not.toContain(world.draftId);
    }
    // CONTROL, same `it`: opened, the owner reads every one of them
    await withDraftsOpened(db.pool, world.draftIds, async () => {
      for (const url of urls(world.draftId)) {
        const answer = await get('owner', url);
        expect(answer.statusCode, url).toBe(200);
        if (url.endsWith(world.draftId)) expect(answer.body, url).toContain(world.draftId); // the detail itself
      }
      expect(await body('owner', `/v1/workspaces/${WS()}/tickets`)).toContain(world.draftId);
    });
  });
});

describe('28.060 the builder reads', () => {
  it('the guest\'s actor names omit the author of a guest-visible draft', async () => {
    // A phone sign-in is never labelled (FD3, `labelled`), so the lead gets a real address for this case, the
    // `builder-reads.test.ts` precedent; otherwise the control could never name them and the case is vacuous.
    const lead = read.userIds.projectLead;
    const original = (await db.pool.query<{ email: string }>('SELECT email FROM "user" WHERE id = $1', [lead])).rows[0]!.email;
    await db.pool.query('UPDATE "user" SET email = $1 WHERE id = $2', ['quokka.lead@example.com', lead]);
    try {
      await expectClosed([{ role: 'guest', url: `/v1/workspaces/${WS()}/actor-names`, marker: lead }]);
    } finally {
      await db.pool.query('UPDATE "user" SET email = $1 WHERE id = $2', [original, lead]);
    }
  });

  it('state occupancy, the type population and the per-type counts do not count a draft; cleared they exceed by exactly the four drafts', async () => {
    const num = async (url: string, pick: (json: any) => number): Promise<number> => pick(JSON.parse(await body('owner', url)));
    const reads: Array<[string, (json: any) => number]> = [
      [`/v1/workspaces/${WS()}/workflows/${read.world.workflowId}/state-occupancy`, (j) => Object.values(j.counts as Record<string, number>).reduce((a, b) => a + b, 0)],
      [`/v1/workspaces/${WS()}/ticket-types/task/population?workflowId=${read.world.workflowId}`, (j) => j.count],
      [`/v1/workspaces/${WS()}/ticket-counts-by-type`, (j) => j.counts.task],
    ];
    for (const [url, pick] of reads) {
      const closed = await num(url, pick);
      const opened = await withDraftsOpened(db.pool, world.draftIds, () => num(url, pick));
      expect(opened - closed, url).toBe(4);
    }
  });
});

describe('28.069 Home', () => {
  it('neither counts nor lists a draft for any role; cleared, each count exceeds by exactly the drafts the viewer could otherwise see', async () => {
    const url = `/v1/workspaces/${WS()}/home`;
    // The haystack: the published twin in `doing`, due DUE, is in every closed answer (Tickets, Open, Due soon).
    for (const role of PEOPLE) expect(await body(role, url), role).toContain(world.twinActiveId);
    await expectClosed(eachPerson(url, world.draftActiveId));
    // The owner reads all four drafts and the others miss the guest-only one (28.056's split). Only draftActive
    // carries a due date (DUE, inside the window at SCENARIO_NOW), and no draft is terminal or closed.
    const counts = async (role: ReadRole): Promise<HomeResponse['counts']> => (JSON.parse(await body(role, url)) as HomeResponse).counts;
    const extra = (drafts: number) => ({ tickets: drafts, open: drafts, pastDue: 0, dueSoon: 1, members: 0, notes: 0 });
    const expected: Record<string, ReturnType<typeof extra>> = { owner: extra(4), admin: extra(3), member: extra(3), outsider: extra(3) };
    for (const role of PEOPLE) {
      const closed = await counts(role);
      const opened = await withDraftsOpened(db.pool, world.draftIds, () => counts(role));
      const delta = Object.fromEntries(
        Object.entries(closed).map(([key, value]) => [key, (opened[key as keyof typeof opened] ?? Number.NaN) - (value ?? Number.NaN)]),
      );
      expect(delta, role).toEqual(expected[role]);
    }
  });
});

describe('28.067 notes attached to a draft', () => {
  it('list only the published ticket; control: opened, both', async () => {
    const note = newUlid();
    const ws = { workspaceId: WS(), actorId: read.world.owner };
    await applyCommitted(db.pool, [
      makeCommitted({ ...ws, entity: { kind: 'note', id: note }, type: 'note.created', payload: { title: 'Quokka note', homeProjectId: '', scope: { mode: 'workspace' } } }),
      makeCommitted({ ...ws, entity: { kind: 'note', id: note }, type: 'note.attached', payload: { ticketId: world.twinId } }),
      makeCommitted({ ...ws, entity: { kind: 'note', id: note }, type: 'note.attached', payload: { ticketId: world.draftId } }),
    ]);
    for (const role of ['owner', 'outsider'] as const) {
      const url = `/v1/workspaces/${WS()}/notes`;
      expect(await body(role, url), `${role}: the published ticket is attached`).toContain(world.twinId);
      await expectClosed([{ role, url, marker: world.draftId }]);
    }
  });
});

describe('28.061 the delete-confirm counts', () => {
  it('a deleted project lists only its published tickets; cleared, the draft counts too', async () => {
    const { owner, member, workspaceId } = read.world;
    const projectId = newUlid();
    const [pub, draft] = [newUlid(), newUlid()];
    const ws = { workspaceId };
    await applyCommitted(db.pool, [
      makeCommitted({ ...ws, actorId: owner, entity: { kind: 'project', id: projectId }, type: 'project.created', payload: { name: 'Doomed', prefix: 'DM' } }),
      makeCommitted({ ...ws, actorId: owner, entity: { kind: 'project', id: projectId }, type: 'project.member_added', payload: { userId: owner, projectAdmin: true } }),
      makeCommitted({ ...ws, actorId: owner, entity: { kind: 'ticket', id: pub }, type: 'ticket.created', payload: { typeId: 'task', projectId, parentId: null, title: 'kept' } }),
      makeCommitted({ ...ws, actorId: member, entity: { kind: 'ticket', id: draft }, type: 'ticket.created', payload: { typeId: 'task', projectId, parentId: null, title: 'private', start: 'backlog', draft: true } }),
      makeCommitted({ ...ws, actorId: owner, entity: { kind: 'project', id: projectId }, type: 'project.deleted', payload: {} }),
    ]);
    const contained = async (): Promise<number> => {
      const items = (JSON.parse(await body('owner', '/v1/me/deleted-items')) as { items: Array<{ kind: string; id: string; containedCount: number }> }).items;
      return items.find((item) => item.kind === 'project' && item.id === projectId)!.containedCount;
    };
    expect(await contained()).toBe(1);
    expect(await withDraftsOpened(db.pool, [draft], contained)).toBe(2);
  });

  it('a deleted workspace counts its project and its published ticket only; cleared, the draft counts too', async () => {
    // Its own workspace: the read world's must stay live for 28.063 and 28.066. Its own workflow and type ids,
    // because `proj_workflows` and `proj_ticket_types` are keyed by those ids (the neighbour's are taken).
    const { owner, member } = read.world;
    const [workspaceId, projectId, pub, draft] = [newUlid(), newUlid(), newUlid(), newUlid()];
    const [workflowId, typeId] = ['wf-doomed-ws', 'doomed-ws-task'];
    const ws = { workspaceId, actorId: owner };
    await applyCommitted(db.pool, [
      makeCommitted({ ...ws, entity: { kind: 'workspace', id: workspaceId }, type: 'workspace.created', payload: { name: 'Doomed workspace' } }),
      makeCommitted({ ...ws, entity: { kind: 'membership', id: membershipId(workspaceId, owner) }, type: 'membership.granted', payload: { userId: owner, role: 'owner' } }),
      makeCommitted({ ...ws, entity: { kind: 'project', id: projectId }, type: 'project.created', payload: { name: 'Doomed', prefix: 'DW' } }),
      makeCommitted({
        ...ws, entity: { kind: 'workflow', id: workflowId }, type: 'workflow.defined',
        payload: {
          id: workflowId, version: 1, name: 'Doomed flow', initialStateId: 'todo',
          states: [{ id: 'todo', name: 'To do', category: 'open' }, { id: 'done', name: 'Done', category: 'terminal' }],
          transitions: [{ from: '*', to: 'todo', rules: [] }, { from: '*', to: 'done', rules: [] }],
        },
      }),
      makeCommitted({ ...ws, entity: { kind: 'ticket-type', id: typeId }, type: 'ticket-type.defined', payload: { id: typeId, name: 'Task', icon: 'check', rank: 3, workflowId, fields: [] } }),
      makeCommitted({ ...ws, entity: { kind: 'ticket', id: pub }, type: 'ticket.created', payload: { typeId, projectId, parentId: null, title: 'kept' } }),
      makeCommitted({ ...ws, actorId: member, entity: { kind: 'ticket', id: draft }, type: 'ticket.created', payload: { typeId, projectId, parentId: null, title: 'private', start: 'backlog', draft: true } }),
      makeCommitted({ ...ws, entity: { kind: 'workspace', id: workspaceId }, type: 'workspace.deleted', payload: {} }),
    ]);
    const contained = async (): Promise<number> => {
      const items = (JSON.parse(await body('owner', '/v1/me/deleted-items')) as { items: Array<{ kind: string; id: string; containedCount: number }> }).items;
      return items.find((item) => item.kind === 'workspace' && item.id === workspaceId)!.containedCount;
    };
    expect(await contained()).toBe(2); // the project and the published ticket
    expect(await withDraftsOpened(db.pool, [draft], contained)).toBe(3);
  });
});

describe('28.063 migrate_ticket_type', () => {
  it('other members\' drafts of the type do not block an owner (it reaches the next rule); an admin who cannot see a published ticket of the type is blocked, so the gate is live', async () => {
    const target = 'wf-draft-target';
    await applyCommitted(db.pool, [
      makeCommitted({
        workspaceId: WS(), actorId: read.world.owner, entity: { kind: 'workflow', id: target }, type: 'workflow.defined',
        payload: {
          id: target, version: 1, name: 'Target', initialStateId: 'todo',
          states: [
            { id: 'todo', name: 'To do', category: 'open' },
            { id: 'doing', name: 'Doing', category: 'active' },
            { id: 'waiting', name: 'Waiting', category: 'active', blocked: true },
            { id: 'done', name: 'Done', category: 'terminal' },
          ],
          transitions: [{ from: '*', to: 'todo', rules: [] }, { from: '*', to: 'doing', rules: [] }, { from: '*', to: 'waiting', rules: [] }, { from: '*', to: 'done', rules: [] }],
        },
      }),
    ]);
    // `waiting` is deliberately absent from the map: the scenario's shared task sits there, so a call that
    // PASSES the visibility gate stops at `migration.unmapped-state` and writes nothing.
    const payload = { fromWorkflowId: read.world.workflowId, toWorkflowId: target, stateMap: { todo: 'todo', doing: 'doing', done: 'done' } };
    const migrateAs = async (role: ReadRole) => {
      const response = await read.app.inject({
        method: 'POST', url: `/v1/workspaces/${WS()}/ticket-types/task/migrate`, headers: read.authOf(role), payload,
      });
      return { status: response.statusCode, rule: (response.json() as { rule?: string }).rule };
    };
    const before = (await db.pool.query('SELECT count(*)::int AS n FROM events')).rows[0].n;
    expect(await migrateAs('admin')).toEqual({ status: 422, rule: MIGRATION_RULES.notVisible }); // CONTROL: a hidden published ticket blocks
    expect(await migrateAs('owner')).toEqual({ status: 422, rule: MIGRATION_RULES.unmappedState }); // four drafts of the type are in the world
    expect((await db.pool.query('SELECT count(*)::int AS n FROM events')).rows[0].n).toBe(before); // and neither call wrote
  });
});

describe('28.066 a workflow republish folds drafts forward', () => {
  it('after workflow.defined v2 every ticket of the workflow, drafts included, is on v2', async () => {
    await applyCommitted(db.pool, [
      makeCommitted({
        workspaceId: WS(), actorId: read.world.owner, entity: { kind: 'workflow', id: read.world.workflowId }, type: 'workflow.defined',
        payload: {
          id: read.world.workflowId, version: 2, name: 'Errands', initialStateId: 'todo',
          states: [
            { id: 'todo', name: 'To do', category: 'open' },
            { id: 'doing', name: 'Doing', category: 'active' },
            { id: 'waiting', name: 'Waiting on counterparty', category: 'active', blocked: true },
            { id: 'review', name: 'Review', category: 'active' },
            { id: 'done', name: 'Done', category: 'terminal' },
          ],
          transitions: [{ from: '*', to: 'todo', rules: [] }, { from: '*', to: 'doing', rules: [] }, { from: '*', to: 'waiting', rules: [] }, { from: '*', to: 'review', rules: [] }, { from: '*', to: 'done', rules: [] }],
        },
      }),
    ]);
    const { rows } = await db.pool.query<{ ticket_id: string; workflow_version: number }>(
      'SELECT ticket_id, workflow_version FROM proj_tickets WHERE ticket_id = ANY($1::text[]) ORDER BY ticket_id',
      [[world.twinId, ...world.draftIds]],
    );
    expect(rows).toHaveLength(1 + world.draftIds.length);
    for (const row of rows) expect(row.workflow_version, row.ticket_id).toBe(2); // the twin is the control
  });
});
