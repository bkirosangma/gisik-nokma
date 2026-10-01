import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { newUlid, type FilterSpec, type LedgerEvent, type ListResponse } from '@gisik-nokma/domain';
import { applyCommitted, makeCommitted } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { buildReadTestApp, type ReadRole, type ReadWorld } from '../helpers/read-app.js';
import { signInWithPhone } from '../helpers/session.js';

/**
 * MCP CRUD plan Task 4 — `GET /v1/workspaces/:workspaceId/ticket-list` (cases 7.707–7.711).
 *
 * The plan named `/tickets`, but `GET /v1/workspaces/:workspaceId/tickets` is
 * already the Plan 4 visibility list (`{ tickets }`, 200-empty for an outsider,
 * pinned by `tickets-read.test.ts` and `members-remove.test.ts`), so this is its
 * sibling at `/ticket-list` and the old route is untouched.
 *
 * Its own database and its own world rather than a block in `list.test.ts`:
 * the workspace scope answers EVERY project, so its assertions are only exact on
 * a world no other case has been adding tickets to. The seeded world holds two
 * projects (the founding one and `read.sibling`); this file adds a third
 * (`extra`, holding a guest-visible ticket and, later, being archived/deleted).
 *
 * Every security cell has its control in the same `it`: the member's 200 beside
 * the stranger's 404, the owner's full list beside the guest's slice, the
 * sibling's tickets present before `project.archived` and again after
 * `project.restored`.
 */

type InjectResponse = Awaited<ReturnType<FastifyInstance['inject']>>;

let db: TestDatabase;
let read: ReadWorld;
const extraProjectId = newUlid();
const extraTicketId = newUlid(); // member-visible, in `extra`
const extraGuestTicketId = newUlid(); // audience [owner, guest], in `extra`
const siblingGuestTicketId = newUlid(); // audience [owner, guest], in the sibling project
const doomedProjectId = newUlid();
const doomedTicketId = newUlid();

beforeAll(async () => {
  db = await createTestDatabase();
  read = await buildReadTestApp(db);
  const ws = { workspaceId: read.world.workspaceId, actorId: read.world.owner };
  const project = (projectId: string, name: string): LedgerEvent[] => [
    makeCommitted({ ...ws, entity: { kind: 'project', id: projectId }, type: 'project.created', payload: { name } }),
    makeCommitted({ ...ws, entity: { kind: 'project', id: projectId }, type: 'project.member_added', payload: { userId: read.world.owner, projectAdmin: true } }),
    makeCommitted({ ...ws, entity: { kind: 'project', id: projectId }, type: 'project.member_added', payload: { userId: read.world.member, projectAdmin: false } }),
  ];
  const ticket = (id: string, projectId: string, title: string): LedgerEvent =>
    makeCommitted({ ...ws, entity: { kind: 'ticket', id }, type: 'ticket.created', payload: { typeId: 'task', projectId, parentId: null, title } });
  const audience = (id: string, userIds: string[]): LedgerEvent =>
    makeCommitted({ ...ws, entity: { kind: 'ticket', id }, type: 'visibility.set', payload: { ticketId: id, mode: 'explicit', userIds } });
  await applyCommitted(db.pool, [
    ...project(extraProjectId, 'Extra'),
    ticket(extraTicketId, extraProjectId, 'Extra member task'),
    ticket(extraGuestTicketId, extraProjectId, 'Extra guest task'),
    audience(extraGuestTicketId, [read.world.owner, read.userIds.guest]),
    ticket(siblingGuestTicketId, read.sibling.projectId, 'Sibling guest task'),
    audience(siblingGuestTicketId, [read.world.owner, read.userIds.guest]),
    ...project(doomedProjectId, 'Doomed'),
    ticket(doomedTicketId, doomedProjectId, 'Doomed task'),
  ]);
}, 120_000);

afterAll(async () => {
  await read.app.close();
  await db.drop();
});

type Query = { groupBy?: string; filter?: FilterSpec | string; parentId?: string; cursor?: string; limit?: string | number };

function qs(query: Query): string {
  const parts: string[] = [];
  if (query.groupBy !== undefined) parts.push(`groupBy=${encodeURIComponent(query.groupBy)}`);
  if (query.filter !== undefined) {
    const raw = typeof query.filter === 'string' ? query.filter : JSON.stringify(query.filter);
    parts.push(`filter=${encodeURIComponent(raw)}`);
  }
  if (query.parentId !== undefined) parts.push(`parentId=${encodeURIComponent(query.parentId)}`);
  if (query.cursor !== undefined) parts.push(`cursor=${encodeURIComponent(query.cursor)}`);
  if (query.limit !== undefined) parts.push(`limit=${encodeURIComponent(String(query.limit))}`);
  return parts.length > 0 ? `?${parts.join('&')}` : '';
}

function getWorkspaceList(role: ReadRole, query: Query = {}, workspaceId = read.world.workspaceId): Promise<InjectResponse> {
  return read.app.inject({ method: 'GET', url: `/v1/workspaces/${workspaceId}/ticket-list${qs(query)}`, headers: read.authOf(role) });
}
function getProjectList(role: ReadRole, projectId: string, query: Query = {}): Promise<InjectResponse> {
  return read.app.inject({ method: 'GET', url: `/v1/projects/${projectId}/tickets${qs(query)}`, headers: read.authOf(role) });
}
const ids = (list: ListResponse): string[] => list.groups.flatMap((group) => group.cards.map((card) => card.ticketId));

async function wsIds(role: ReadRole, query: Query = {}): Promise<string[]> {
  const response = await getWorkspaceList(role, { limit: 200, ...query });
  expect(response.statusCode).toBe(200);
  return ids(response.json() as ListResponse).sort();
}
async function projectIds(role: ReadRole, projectId: string, query: Query = {}): Promise<string[]> {
  const response = await getProjectList(role, projectId, { limit: 200, ...query });
  expect(response.statusCode).toBe(200);
  return ids(response.json() as ListResponse);
}
/** Every project of the world the viewer may be on, unioned — what the workspace list must equal. */
async function unionOfProjects(role: ReadRole, query: Query = {}): Promise<string[]> {
  const out: string[] = [];
  for (const projectId of [read.world.projectId, read.sibling.projectId, extraProjectId, doomedProjectId]) {
    out.push(...(await projectIds(role, projectId, query)));
  }
  return out.sort();
}

describe('GET /v1/workspaces/:workspaceId/ticket-list', () => {
  it('7.707 answers visible tickets from EVERY project, keyset-paged with nextCursor; the project route still answers one project', async () => {
    const all = await wsIds('member');
    // tickets of three different projects are in the one answer
    expect(all).toContain(read.world.epicId);
    expect(all).toContain(read.sibling.ticketId);
    expect(all).toContain(extraTicketId);
    expect(all).toEqual(await unionOfProjects('member'));

    // the body names its workspace and, having no one project, a null project
    const first = await getWorkspaceList('member', { limit: 2 });
    expect(first.statusCode).toBe(200);
    const page1 = first.json() as ListResponse;
    expect(page1.workspaceId).toBe(read.world.workspaceId);
    expect(page1.projectId).toBeNull();
    expect(ids(page1)).toHaveLength(2);
    expect(page1.nextCursor).not.toBeNull();

    // walk the pages: no overlap, no gap, and the last page reports no cursor
    const walked: string[] = [];
    let cursor: string | undefined;
    for (let guard = 0; guard < 20; guard += 1) {
      const response = await getWorkspaceList('member', { limit: 2, ...(cursor === undefined ? {} : { cursor }) });
      const page = response.json() as ListResponse;
      walked.push(...ids(page));
      if (page.nextCursor === null) break;
      cursor = page.nextCursor;
    }
    expect(new Set(walked).size).toBe(walked.length);
    expect([...walked].sort()).toEqual(all);

    // control: the project route is still ONE project's
    const sibling = await projectIds('member', read.sibling.projectId);
    expect(sibling).toContain(read.sibling.ticketId);
    expect(sibling).not.toContain(read.world.epicId);
    expect(sibling).not.toContain(extraTicketId);
  });

  it('7.708 a non-member gets the 404 body, never an empty list; a member gets 200', async () => {
    const member = await getWorkspaceList('member');
    expect(member.statusCode).toBe(200);
    const notFound = await getProjectList('stranger', read.world.projectId); // the product's own 404 shape
    expect(notFound.statusCode).toBe(404);

    for (const role of ['stranger', 'neighbour'] as const) {
      const response = await getWorkspaceList(role);
      expect(response.statusCode, role).toBe(404);
      expect(response.json(), role).toEqual(notFound.json());
    }
    // an unknown workspace id is the same 404, and no session is 401
    const unknown = await getWorkspaceList('owner', {}, newUlid());
    expect(unknown.statusCode).toBe(404);
    expect(unknown.json()).toEqual(notFound.json());
    const noSession = await read.app.inject({ method: 'GET', url: `/v1/workspaces/${read.world.workspaceId}/ticket-list` });
    expect(noSession.statusCode).toBe(401);
    // a NEW signed-in user with no membership anywhere is 404 as well
    const nobody = await signInWithPhone(read.app, read.otp, '+911111111199');
    const lone = await read.app.inject({
      method: 'GET',
      url: `/v1/workspaces/${read.world.workspaceId}/ticket-list`,
      headers: { authorization: `Bearer ${nobody.token}` },
    });
    expect(lone.statusCode).toBe(404);
  });

  it('7.709 visibleTicketsWhere still applies: a guest sees only their audience across projects; the owner sees all', async () => {
    const guest = await wsIds('guest');
    expect(guest).toEqual([read.world.guestTaskId, siblingGuestTicketId, extraGuestTicketId].sort());
    // control: the owner sees all of those and more, so the guest's answer is a narrowing
    const owner = await wsIds('owner');
    for (const id of guest) expect(owner).toContain(id);
    expect(owner.length).toBeGreaterThan(guest.length);
    expect(owner).toContain(read.world.hiddenTaskId);
    expect(guest).not.toContain(read.world.hiddenTaskId);
    // a member is not told about the ticket audience-restricted away from them either
    expect(await wsIds('member')).not.toContain(read.world.hiddenTaskId);
  });

  it('7.710 tickets of an ARCHIVED project are excluded from the workspace scope and return when it is restored; a deleted project\'s are too', async () => {
    const ws = { workspaceId: read.world.workspaceId, actorId: read.world.owner };
    const before = await wsIds('member');
    expect(before).toContain(extraTicketId); // control: present while live
    expect(before).toContain(doomedTicketId);

    await applyCommitted(db.pool, [
      makeCommitted({ ...ws, entity: { kind: 'project', id: extraProjectId }, type: 'project.archived', payload: {} }),
      makeCommitted({ ...ws, entity: { kind: 'project', id: doomedProjectId }, type: 'project.deleted', payload: {} }),
    ]);
    const during = await wsIds('member');
    expect(during).not.toContain(extraTicketId);
    expect(during).not.toContain(extraGuestTicketId);
    expect(during).not.toContain(doomedTicketId);
    // the rest of the workspace is untouched
    expect(during).toContain(read.world.epicId);
    expect(during).toContain(read.sibling.ticketId);
    expect(await wsIds('guest')).not.toContain(extraGuestTicketId);
    // the archived project's OWN list still answers its own tickets (13.1164): the exclusion is workspace-scope only
    expect(await projectIds('member', extraProjectId)).toContain(extraTicketId);

    await applyCommitted(db.pool, [
      makeCommitted({ ...ws, entity: { kind: 'project', id: extraProjectId }, type: 'project.restored', payload: {} }),
      makeCommitted({ ...ws, entity: { kind: 'project', id: doomedProjectId }, type: 'project.undeleted', payload: {} }),
    ]);
    const after = await wsIds('member');
    expect(after).toContain(extraTicketId);
    expect(after).toContain(doomedTicketId);
    expect(after).toEqual(before);
  });

  it('7.711 filters, groupBy, parentId=root, "me" and limit behave as on the project route; the combined answer is the union of the per-project answers', async () => {
    const filters: FilterSpec[] = [
      { stateCategory: 'active' },
      { assigneeId: read.world.member },
      { blocked: true },
      { typeIds: ['task'] },
    ];
    for (const filter of filters) {
      expect(await wsIds('member', { filter }), JSON.stringify(filter)).toEqual(await unionOfProjects('member', { filter }));
    }
    // a filter narrows (control: the unfiltered answer is larger) and is not ignored
    const all = await wsIds('member');
    const active = await wsIds('member', { filter: { stateCategory: 'active' } });
    expect(active.length).toBeGreaterThan(0);
    expect(active.length).toBeLessThan(all.length);

    // "me": the member's own ticket across the workspace; the owner's "me" is a different (empty) set
    expect(await wsIds('member', { filter: { assigneeId: 'me' } })).toEqual([read.world.taskInEpicId]);
    expect(await wsIds('owner', { filter: { assigneeId: 'me' } })).toEqual([]);
    expect(await wsIds('member', { filter: { assigneeIds: ['me', read.world.owner] } })).toEqual([read.world.taskInEpicId]);

    // parentId=root drops the epic's child; groupBy regroups the same set
    const roots = await wsIds('member', { parentId: 'root' });
    expect(roots).not.toContain(read.world.taskInEpicId);
    expect(roots).toContain(read.world.epicId);
    for (const groupBy of ['status', 'assignee', 'type', 'epic', 'priority']) {
      const grouped = (await getWorkspaceList('member', { groupBy, limit: 200 })).json() as ListResponse;
      expect(grouped.groupBy).toBe(groupBy);
      expect(ids(grouped).sort(), groupBy).toEqual(all);
    }
    const byAssignee = (await getWorkspaceList('member', { groupBy: 'assignee', limit: 200 })).json() as ListResponse;
    expect(byAssignee.groups.find((group) => group.key === read.world.member)?.cards.map((card) => card.ticketId)).toEqual([
      read.world.taskInEpicId,
    ]);

    // refusals match the project route's named 400s
    for (const query of [{ groupBy: 'nonsense' }, { filter: '{not json' }, { limit: 0 }, { limit: 201 }] as Query[]) {
      const response = await getWorkspaceList('member', query);
      expect(response.statusCode, JSON.stringify(query)).toBe(400);
    }
    const project400 = await getProjectList('member', read.world.projectId, { groupBy: 'nonsense' });
    const workspace400 = await getWorkspaceList('member', { groupBy: 'nonsense' });
    expect(workspace400.json()).toEqual(project400.json());
  });
});
