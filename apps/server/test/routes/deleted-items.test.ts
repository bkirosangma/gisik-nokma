import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid, purgeDueAt, type DeletedItem, type IngestResult, type SubmittedEvent } from '@gisik-nokma/domain';
import type { FastifyInstance } from 'fastify';
import type { LogOtpSender } from '../../src/auth/otp-sender.js';
import { buildTestApp } from '../helpers/app.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { seedMember } from '../helpers/seed.js';
import { signInWithPhone } from '../helpers/session.js';

/**
 * `GET /v1/me/deleted-items` (trash series, Plan 1 Task 7, spec §6.3's read).
 * Cases 19.060-19.067, `test-cases/19-trash.md` §19.7. Every case mints its
 * own workspace(s) so no case can read another's rows.
 */

let db: TestDatabase;
let app: FastifyInstance;
let otp: LogOtpSender;

beforeAll(async () => {
  db = await createTestDatabase();
  const built = buildTestApp(db);
  app = built.app;
  otp = built.otp;
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await db.drop();
});

let phoneCounter = 0;

type Caller = { userId: string; headers: { authorization: string } };

async function signedIn(): Promise<Caller> {
  phoneCounter += 1;
  return signInWithPhone(app, otp, `+9190033${String(phoneCounter).padStart(5, '0')}`).then((user) => ({
    userId: user.userId,
    headers: { authorization: `Bearer ${user.token}` },
  }));
}

async function found(caller: Caller, name = 'Deleted Items Co'): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/v1/workspaces',
    headers: caller.headers,
    payload: { name },
  });
  expect(res.statusCode).toBe(201);
  return (res.json() as { workspaceId: string }).workspaceId;
}

type Seed = Pick<SubmittedEvent, 'workspaceId' | 'entity' | 'type' | 'payload'>;

async function submitBatch(caller: Caller, seeds: Seed[]): Promise<IngestResult[]> {
  const res = await app.inject({
    method: 'POST',
    url: '/v1/events',
    headers: caller.headers,
    payload: {
      events: seeds.map((seed) => ({
        id: newUlid(),
        version: 1,
        origin: 'web',
        clientTime: new Date().toISOString(),
        actorId: caller.userId,
        ...seed,
      })),
    },
  });
  expect(res.statusCode).toBe(200);
  const results = (res.json() as { results: IngestResult[] }).results;
  expect(results).toHaveLength(seeds.length);
  return results;
}

async function deletedItems(caller: Caller): Promise<{ status: number; items: DeletedItem[] }> {
  const res = await app.inject({ method: 'GET', url: '/v1/me/deleted-items', headers: caller.headers });
  const body = res.statusCode === 200 ? (res.json() as { items: DeletedItem[] }).items : [];
  return { status: res.statusCode, items: body };
}

async function createProject(caller: Caller, workspaceId: string, projectId: string, name: string): Promise<void> {
  const [result] = await submitBatch(caller, [
    { workspaceId, entity: { kind: 'project', id: projectId }, type: 'project.created', payload: { name } },
  ]);
  expect(result?.status).toBe('committed');
}

async function deleteProject(caller: Caller, workspaceId: string, projectId: string): Promise<void> {
  const [result] = await submitBatch(caller, [
    { workspaceId, entity: { kind: 'project', id: projectId }, type: 'project.deleted', payload: {} },
  ]);
  expect(result?.status).toBe('committed');
}

/** `workflow.defined` + `ticket-type.defined`, so a ticket has somewhere to be created. */
async function foundWorkflow(caller: Caller, workspaceId: string): Promise<string> {
  const workflowId = newUlid();
  const typeKey = `task-${Math.random().toString(36).slice(2, 8)}`;
  const setup = await submitBatch(caller, [
    {
      workspaceId,
      entity: { kind: 'workflow', id: workflowId },
      type: 'workflow.defined',
      payload: {
        id: workflowId,
        version: 1,
        name: 'Basic',
        initialStateId: 'todo',
        states: [
          { id: 'todo', name: 'To do', category: 'open' },
          { id: 'done', name: 'Done', category: 'terminal' },
        ],
        transitions: [{ from: 'todo', to: 'done', rules: [] }],
      },
    },
    {
      workspaceId,
      entity: { kind: 'ticket-type', id: newUlid() },
      type: 'ticket-type.defined',
      payload: { id: typeKey, name: typeKey, icon: 'check', rank: 1, workflowId, fields: [] },
    },
  ]);
  expect(setup.every((r) => r.status === 'committed')).toBe(true);
  return typeKey;
}

async function createTicket(
  caller: Caller,
  workspaceId: string,
  projectId: string,
  typeKey: string,
  ticketId: string,
  title: string,
): Promise<void> {
  const [result] = await submitBatch(caller, [
    { workspaceId, entity: { kind: 'ticket', id: ticketId }, type: 'ticket.created', payload: { typeId: typeKey, projectId, parentId: null, title } },
  ]);
  expect(result?.status).toBe('committed');
}

async function deleteTicket(caller: Caller, workspaceId: string, ticketId: string): Promise<void> {
  const [result] = await submitBatch(caller, [
    { workspaceId, entity: { kind: 'ticket', id: ticketId }, type: 'ticket.deleted', payload: {} },
  ]);
  expect(result?.status).toBe('committed');
}

async function createNote(caller: Caller, workspaceId: string, noteId: string, title: string, homeProjectId = ''): Promise<void> {
  const [result] = await submitBatch(caller, [
    {
      workspaceId,
      entity: { kind: 'note', id: noteId },
      type: 'note.created',
      payload: { title, homeProjectId, scope: { mode: homeProjectId === '' ? 'workspace' : 'project' } },
    },
  ]);
  expect(result?.status).toBe('committed');
}

async function deleteNote(caller: Caller, workspaceId: string, noteId: string): Promise<void> {
  const [result] = await submitBatch(caller, [
    { workspaceId, entity: { kind: 'note', id: noteId }, type: 'note.deleted', payload: {} },
  ]);
  expect(result?.status).toBe('committed');
}

async function deleteWorkspace(caller: Caller, workspaceId: string): Promise<void> {
  const [result] = await submitBatch(caller, [
    { workspaceId, entity: { kind: 'workspace', id: workspaceId }, type: 'workspace.deleted', payload: {} },
  ]);
  expect(result?.status).toBe('committed');
}

describe('19.060 each role sees the deleted item its authority covers, each with deletedBy/deletedAt/purgeMarkedAt: null; a live sibling is absent', () => {
  it('owner: deleted workspace; admin: deleted project; project admin: deleted ticket; author: deleted note', async () => {
    // Owner sees a deleted workspace.
    const owner = await signedIn();
    const wsDeleted = await found(owner, 'To delete');
    const wsLive = await found(owner, 'Stays live');
    await deleteWorkspace(owner, wsDeleted);
    let { items } = await deletedItems(owner);
    const wsItem = items.find((i) => i.kind === 'workspace' && i.id === wsDeleted);
    expect(wsItem).toMatchObject({ deletedBy: owner.userId, purgeMarkedAt: null });
    expect(typeof wsItem?.deletedAt).toBe('string');
    expect(items.some((i) => i.id === wsLive)).toBe(false);

    // Admin sees a deleted project.
    const admin = await signedIn();
    const wsB = await found(owner, 'Has projects');
    await seedMember(db.pool, wsB, admin.userId, 'admin');
    const projDeleted = newUlid();
    const projLive = newUlid();
    await createProject(owner, wsB, projDeleted, 'Doomed');
    await createProject(owner, wsB, projLive, 'Live');
    await deleteProject(owner, wsB, projDeleted);
    ({ items } = await deletedItems(admin));
    const projItem = items.find((i) => i.kind === 'project' && i.id === projDeleted);
    expect(projItem).toMatchObject({ deletedBy: owner.userId, purgeMarkedAt: null });
    expect(items.some((i) => i.id === projLive)).toBe(false);

    // A project admin (not workspace admin/owner) sees a deleted ticket.
    const projectAdmin = await signedIn();
    const wsC = await found(owner, 'Has tickets');
    const proj = newUlid();
    await createProject(owner, wsC, proj, 'P');
    await seedMember(db.pool, wsC, projectAdmin.userId, 'member', [{ projectId: proj, projectAdmin: true }]);
    const typeKey = await foundWorkflow(owner, wsC);
    const ticketDeleted = newUlid();
    const ticketLive = newUlid();
    await createTicket(projectAdmin, wsC, proj, typeKey, ticketDeleted, 'Doomed T');
    await createTicket(projectAdmin, wsC, proj, typeKey, ticketLive, 'Live T');
    await deleteTicket(projectAdmin, wsC, ticketDeleted);
    ({ items } = await deletedItems(projectAdmin));
    const ticketItem = items.find((i) => i.kind === 'ticket' && i.id === ticketDeleted);
    expect(ticketItem).toMatchObject({ deletedBy: projectAdmin.userId, purgeMarkedAt: null });
    expect(items.some((i) => i.id === ticketLive)).toBe(false);

    // The author sees their own deleted note.
    const author = await signedIn();
    const wsD = await found(owner, 'Has notes');
    await seedMember(db.pool, wsD, author.userId, 'member');
    const noteDeleted = newUlid();
    const noteLive = newUlid();
    await createNote(author, wsD, noteDeleted, 'Doomed N');
    await createNote(author, wsD, noteLive, 'Live N');
    await deleteNote(author, wsD, noteDeleted);
    ({ items } = await deletedItems(author));
    const noteItem = items.find((i) => i.kind === 'note' && i.id === noteDeleted);
    expect(noteItem).toMatchObject({ deletedBy: author.userId, purgeMarkedAt: null });
    expect(items.some((i) => i.id === noteLive)).toBe(false);
  });
});

describe('19.061 a marked item carries purgeMarkedAt and purgeDueAt = purgeDueAt(purgeMarkedAt)', () => {
  it('unmarking returns both to null', async () => {
    const owner = await signedIn();
    const ws = await found(owner);
    const proj = newUlid();
    await createProject(owner, ws, proj, 'P');
    await seedMember(db.pool, ws, owner.userId, 'owner', [{ projectId: proj, projectAdmin: true }]);
    const typeKey = await foundWorkflow(owner, ws);
    const ticketId = newUlid();
    await createTicket(owner, ws, proj, typeKey, ticketId, 'T');
    await deleteTicket(owner, ws, ticketId);

    await submitBatch(owner, [{ workspaceId: ws, entity: { kind: 'ticket', id: ticketId }, type: 'purge.marked', payload: {} }]);
    let { items } = await deletedItems(owner);
    let item = items.find((i) => i.id === ticketId)!;
    expect(item.purgeMarkedAt).not.toBeNull();
    expect(item.purgeDueAt).toBe(purgeDueAt(item.purgeMarkedAt!));

    await submitBatch(owner, [{ workspaceId: ws, entity: { kind: 'ticket', id: ticketId }, type: 'purge.unmarked', payload: {} }]);
    ({ items } = await deletedItems(owner));
    item = items.find((i) => i.id === ticketId)!;
    expect(item.purgeMarkedAt).toBeNull();
    expect(item.purgeDueAt).toBeNull();
  });
});

describe('19.062 authority is per kind: a non-project-admin member does not see a deleted ticket; an admin does not see a deleted workspace', () => {
  it('control: the owner sees both', async () => {
    const owner = await signedIn();
    const member = await signedIn();
    const ws = await found(owner, 'Ticket world');
    const proj = newUlid();
    await createProject(owner, ws, proj, 'P');
    await seedMember(db.pool, ws, owner.userId, 'owner', [{ projectId: proj, projectAdmin: true }]);
    await seedMember(db.pool, ws, member.userId, 'member', [{ projectId: proj, projectAdmin: false }]);
    const typeKey = await foundWorkflow(owner, ws);
    const ticketId = newUlid();
    await createTicket(owner, ws, proj, typeKey, ticketId, 'T');
    await deleteTicket(owner, ws, ticketId);

    const memberItems = (await deletedItems(member)).items;
    expect(memberItems.some((i) => i.id === ticketId)).toBe(false);
    const ownerItems = (await deletedItems(owner)).items;
    expect(ownerItems.some((i) => i.id === ticketId)).toBe(true);

    const owner2 = await signedIn();
    const admin = await signedIn();
    const wsDeleted = await found(owner2, 'Workspace world');
    await seedMember(db.pool, wsDeleted, admin.userId, 'admin');
    await deleteWorkspace(owner2, wsDeleted);

    const adminItems = (await deletedItems(admin)).items;
    expect(adminItems.some((i) => i.id === wsDeleted)).toBe(false);
    const owner2Items = (await deletedItems(owner2)).items;
    expect(owner2Items.some((i) => i.id === wsDeleted)).toBe(true);
  });
});

describe('19.063 the list is ordered by deletedAt descending', () => {
  it('three items deleted in known order', async () => {
    const owner = await signedIn();
    const ws = await found(owner);
    const proj = newUlid();
    await createProject(owner, ws, proj, 'P');
    await seedMember(db.pool, ws, owner.userId, 'owner', [{ projectId: proj, projectAdmin: true }]);
    const typeKey = await foundWorkflow(owner, ws);
    const t1 = newUlid();
    const t2 = newUlid();
    const t3 = newUlid();
    await createTicket(owner, ws, proj, typeKey, t1, 'T1');
    await createTicket(owner, ws, proj, typeKey, t2, 'T2');
    await createTicket(owner, ws, proj, typeKey, t3, 'T3');
    await deleteTicket(owner, ws, t1);
    await deleteTicket(owner, ws, t2);
    await deleteTicket(owner, ws, t3);

    // Deletion order is forced onto distinct, known instants — the event
    // door's own clock offers no guaranteed spacing within one test process.
    const base = Date.now();
    await db.pool.query('UPDATE proj_tickets SET deleted_at = $2 WHERE ticket_id = $1', [t1, new Date(base).toISOString()]);
    await db.pool.query('UPDATE proj_tickets SET deleted_at = $2 WHERE ticket_id = $1', [t2, new Date(base + 1000).toISOString()]);
    await db.pool.query('UPDATE proj_tickets SET deleted_at = $2 WHERE ticket_id = $1', [t3, new Date(base + 2000).toISOString()]);

    const { items } = await deletedItems(owner);
    const ordered = items.filter((i) => ([t1, t2, t3] as string[]).includes(i.id)).map((i) => i.id);
    expect(ordered).toEqual([t3, t2, t1]);
  });
});

describe('19.064 containedCount: a project counts its live tickets + project-scoped notes; a workspace counts its projects + tickets + notes', () => {
  it('control: a ticket deleted on its own inside the project is not counted', async () => {
    const owner = await signedIn();
    const ws = await found(owner, 'Project counts');
    const proj = newUlid();
    await createProject(owner, ws, proj, 'P');
    await seedMember(db.pool, ws, owner.userId, 'owner', [{ projectId: proj, projectAdmin: true }]);
    const typeKey = await foundWorkflow(owner, ws);
    const liveTicket = newUlid();
    const ownDeletedTicket = newUlid();
    await createTicket(owner, ws, proj, typeKey, liveTicket, 'Live');
    await createTicket(owner, ws, proj, typeKey, ownDeletedTicket, 'Own-deleted');
    await deleteTicket(owner, ws, ownDeletedTicket);
    const noteId = newUlid();
    await createNote(owner, ws, noteId, 'Project note', proj);

    await deleteProject(owner, ws, proj);
    const { items } = await deletedItems(owner);
    const projItem = items.find((i) => i.kind === 'project' && i.id === proj)!;
    // 1 live ticket + 1 project-scoped note; the individually-deleted ticket is NOT counted.
    expect(projItem.containedCount).toBe(2);

    const owner2 = await signedIn();
    const wsDeleted = await found(owner2, 'Workspace counts');
    const projA = newUlid();
    const projB = newUlid();
    await createProject(owner2, wsDeleted, projA, 'A');
    await createProject(owner2, wsDeleted, projB, 'B');
    await seedMember(db.pool, wsDeleted, owner2.userId, 'owner', [{ projectId: projA, projectAdmin: true }]);
    const typeKey2 = await foundWorkflow(owner2, wsDeleted);
    const ticketId = newUlid();
    await createTicket(owner2, wsDeleted, projA, typeKey2, ticketId, 'T');
    const wsNoteId = newUlid();
    await createNote(owner2, wsDeleted, wsNoteId, 'Workspace note');
    await deleteWorkspace(owner2, wsDeleted);

    const { items: items2 } = await deletedItems(owner2);
    const wsItem = items2.find((i) => i.kind === 'workspace' && i.id === wsDeleted)!;
    // 2 live projects + 1 live ticket + 1 live note.
    expect(wsItem.containedCount).toBe(4);
  });
});

describe('19.065 a ticket inside a deleted project is not listed on its own', () => {
  it('after project.undeleted the individually-deleted ticket is listed again', async () => {
    const owner = await signedIn();
    const ws = await found(owner);
    const proj = newUlid();
    await createProject(owner, ws, proj, 'P');
    await seedMember(db.pool, ws, owner.userId, 'owner', [{ projectId: proj, projectAdmin: true }]);
    const typeKey = await foundWorkflow(owner, ws);
    const ticketId = newUlid();
    await createTicket(owner, ws, proj, typeKey, ticketId, 'T');
    await deleteTicket(owner, ws, ticketId);

    let { items } = await deletedItems(owner);
    expect(items.some((i) => i.id === ticketId)).toBe(true);

    await deleteProject(owner, ws, proj);
    ({ items } = await deletedItems(owner));
    expect(items.some((i) => i.id === ticketId)).toBe(false);

    await submitBatch(owner, [{ workspaceId: ws, entity: { kind: 'project', id: proj }, type: 'project.undeleted', payload: {} }]);
    ({ items } = await deletedItems(owner));
    expect(items.some((i) => i.id === ticketId)).toBe(true);
  });
});

describe('19.066 an admin demoted to member no longer sees the deleted project they deleted', () => {
  it('control: the owner still does', async () => {
    const owner = await signedIn();
    const admin = await signedIn();
    const ws = await found(owner);
    await seedMember(db.pool, ws, admin.userId, 'admin');
    const projId = newUlid();
    await createProject(owner, ws, projId, 'P');
    await deleteProject(admin, ws, projId);

    let { items } = await deletedItems(admin);
    expect(items.some((i) => i.id === projId)).toBe(true);

    // Demoted directly (setup, not a door authority test): the same
    // `membership.granted` upsert a re-grant through the door would write.
    await seedMember(db.pool, ws, admin.userId, 'member');
    ({ items } = await deletedItems(admin));
    expect(items.some((i) => i.id === projId)).toBe(false);

    const ownerItems = (await deletedItems(owner)).items;
    expect(ownerItems.some((i) => i.id === projId)).toBe(true);
  });
});

describe('19.067 a signed-out caller gets 401', () => {
  it('control: signed in, 200', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/me/deleted-items' });
    expect(res.statusCode).toBe(401);

    const owner = await signedIn();
    const { status } = await deletedItems(owner);
    expect(status).toBe(200);
  });
});

describe('19.206 each row names who deleted it: deletedByName', () => {
  it('19.206 the owner and an admin are each named on their own row; a blank name is null', async () => {
    const owner = await signedIn();
    const admin = await signedIn();
    await db.pool.query('UPDATE "user" SET "name" = $2 WHERE "id" = $1', [owner.userId, 'Kiro']);
    await db.pool.query('UPDATE "user" SET "name" = $2 WHERE "id" = $1', [admin.userId, 'Anselma Marak']);
    const ws = await found(owner, 'Named deleters');
    await seedMember(db.pool, ws, admin.userId, 'admin');
    const byOwner = newUlid();
    const byAdmin = newUlid();
    await createProject(owner, ws, byOwner, 'Deleted by the owner');
    await createProject(owner, ws, byAdmin, 'Deleted by the admin');
    await deleteProject(owner, ws, byOwner);
    await deleteProject(admin, ws, byAdmin);

    let { items } = await deletedItems(owner);
    // CONTROL in the same `it`: two rows, two DIFFERENT names — a join on the
    // caller would name the owner on both.
    expect(items.find((item) => item.id === byOwner)?.deletedByName).toBe('Kiro');
    expect(items.find((item) => item.id === byAdmin)?.deletedByName).toBe('Anselma Marak');

    await db.pool.query('UPDATE "user" SET "name" = $2 WHERE "id" = $1', [admin.userId, '   ']);
    ({ items } = await deletedItems(owner));
    expect(items.find((item) => item.id === byAdmin)?.deletedByName).toBeNull();
    expect(items.find((item) => item.id === byOwner)?.deletedByName).toBe('Kiro');
  });
});
