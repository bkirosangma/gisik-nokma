import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  newUlid,
  purgeDueAt,
  type EventEnvelope,
  type IngestResult,
  type SubmittedEvent,
} from '@gisik-nokma/domain';
import type { FastifyInstance } from 'fastify';
import type { LogOtpSender } from '../../src/auth/otp-sender.js';
import {
  ALREADY_DELETED_REASON,
  ALREADY_MARKED_REASON,
  checkLifecycle,
  DELETE_FIRST_REASON,
  LIFECYCLE_RULE,
  NOT_MARKED_REASON,
  PROJECT_DELETED_REASON,
  PURGE_DUE_REASON,
  UNMARK_FIRST_REASON,
} from '../../src/permissions/check-lifecycle.js';
import { buildTestApp } from '../helpers/app.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { seedMember, seedProject } from '../helpers/seed.js';
import { signInWithPhone } from '../helpers/session.js';

/**
 * State refusals (`checkLifecycle`), trash series Plan 1 Task 4. Cases
 * 19.030-19.035, `test-cases/19-trash.md` §19.4. 19.030-19.034 drive the real
 * `POST /v1/events` door; 19.035 calls `checkLifecycle` directly, since it is
 * the one case that must inject `now`.
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
  return signInWithPhone(app, otp, `+9190021${String(phoneCounter).padStart(5, '0')}`).then((user) => ({
    userId: user.userId,
    headers: { authorization: `Bearer ${user.token}` },
  }));
}

async function found(caller: Caller, name = 'Trash State Co'): Promise<string> {
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

type Kind = 'workspace' | 'project' | 'ticket' | 'note';

function purgeMarked(kind: Kind, workspaceId: string, id: string): Seed {
  return { workspaceId, entity: { kind, id }, type: 'purge.marked', payload: {} };
}
function purgeUnmarked(kind: Kind, workspaceId: string, id: string): Seed {
  return { workspaceId, entity: { kind, id }, type: 'purge.unmarked', payload: {} };
}

/**
 * A workspace, one project in it, a real ticket (workflow + type + created)
 * and a real note, all live and undeleted — the shared world these cases
 * delete and mark pieces of.
 */
async function setupWorld(
  owner: Caller,
): Promise<{ workspaceId: string; projectId: string; typeKey: string; ticketId: string; noteId: string }> {
  const workspaceId = await found(owner);
  const projectId = newUlid();
  await seedProject(db.pool, workspaceId, projectId, 'World');
  // The owner founds the workspace but is not thereby a PROJECT member — that
  // is a separate roster (`project.member_added`), and ticket/note creation
  // checks it even for the owner (measured: refused `permission.role` /
  // "not a member of this project" without this).
  await seedMember(db.pool, workspaceId, owner.userId, 'owner', [{ projectId, projectAdmin: true }]);
  const workflowId = newUlid();
  const typeKey = `task-19-0${Math.floor(Math.random() * 900 + 100)}`;
  const setup = await submitBatch(owner, [
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
  const ticketId = newUlid();
  const ticketCreated = await submitBatch(owner, [
    {
      workspaceId,
      entity: { kind: 'ticket', id: ticketId },
      type: 'ticket.created',
      payload: { typeId: typeKey, projectId, parentId: null, title: 'T' },
    },
  ]);
  expect(ticketCreated[0]?.status).toBe('committed');
  const noteId = newUlid();
  const noteCreated = await submitBatch(owner, [
    {
      workspaceId,
      entity: { kind: 'note', id: noteId },
      type: 'note.created',
      payload: { title: 'N', homeProjectId: projectId, scope: { mode: 'project' } },
    },
  ]);
  expect(noteCreated[0]?.status).toBe('committed');
  return { workspaceId, projectId, typeKey, ticketId, noteId };
}

describe('19.030 deleting a deleted project or workspace: refused with ALREADY_DELETED_REASON', () => {
  it('refuses a second project.deleted and a second workspace.deleted; the first of each is accepted', async () => {
    const owner = await signedIn();
    const { workspaceId, projectId } = await setupWorld(owner);

    const firstProjectDelete = await submitBatch(owner, [
      { workspaceId, entity: { kind: 'project', id: projectId }, type: 'project.deleted', payload: {} },
    ]);
    expect(firstProjectDelete[0]?.status).toBe('committed');
    const secondProjectDelete = await submitBatch(owner, [
      { workspaceId, entity: { kind: 'project', id: projectId }, type: 'project.deleted', payload: {} },
    ]);
    expect(secondProjectDelete[0]).toMatchObject({
      status: 'refused',
      rule: LIFECYCLE_RULE,
      reason: ALREADY_DELETED_REASON('project'),
    });

    const firstWsDelete = await submitBatch(owner, [
      { workspaceId, entity: { kind: 'workspace', id: workspaceId }, type: 'workspace.deleted', payload: {} },
    ]);
    expect(firstWsDelete[0]?.status).toBe('committed');
    const secondWsDelete = await submitBatch(owner, [
      { workspaceId, entity: { kind: 'workspace', id: workspaceId }, type: 'workspace.deleted', payload: {} },
    ]);
    expect(secondWsDelete[0]).toMatchObject({
      status: 'refused',
      rule: LIFECYCLE_RULE,
      reason: ALREADY_DELETED_REASON('workspace'),
    });
  });
});

describe('19.031 marking a live item: refused with DELETE_FIRST_REASON, for each of the four kinds', () => {
  it('refuses purge.marked on a live workspace/project/ticket/note; accepts it once each is deleted', async () => {
    const owner = await signedIn();
    const { workspaceId, projectId, ticketId, noteId } = await setupWorld(owner);

    const liveMarks = await submitBatch(owner, [
      purgeMarked('workspace', workspaceId, workspaceId),
      purgeMarked('project', workspaceId, projectId),
      purgeMarked('ticket', workspaceId, ticketId),
      purgeMarked('note', workspaceId, noteId),
    ]);
    const kinds: Kind[] = ['workspace', 'project', 'ticket', 'note'];
    for (const [index, kind] of kinds.entries()) {
      expect(liveMarks[index], kind).toMatchObject({
        status: 'refused',
        rule: LIFECYCLE_RULE,
        reason: DELETE_FIRST_REASON(kind),
      });
    }

    // Delete the ticket and note ONLY (their project stays live) — mark succeeds.
    const deleteTicketNote = await submitBatch(owner, [
      { workspaceId, entity: { kind: 'ticket', id: ticketId }, type: 'ticket.deleted', payload: {} },
      { workspaceId, entity: { kind: 'note', id: noteId }, type: 'note.deleted', payload: {} },
    ]);
    expect(deleteTicketNote.every((r) => r.status === 'committed')).toBe(true);
    const markTicketNote = await submitBatch(owner, [
      purgeMarked('ticket', workspaceId, ticketId),
      purgeMarked('note', workspaceId, noteId),
    ]);
    expect(markTicketNote.every((r) => r.status === 'committed')).toBe(true);

    // Delete the project, then mark it.
    const deleteProject = await submitBatch(owner, [
      { workspaceId, entity: { kind: 'project', id: projectId }, type: 'project.deleted', payload: {} },
    ]);
    expect(deleteProject[0]?.status).toBe('committed');
    const markProject = await submitBatch(owner, [purgeMarked('project', workspaceId, projectId)]);
    expect(markProject[0]?.status).toBe('committed');

    // Delete the workspace, then mark it.
    const deleteWs = await submitBatch(owner, [
      { workspaceId, entity: { kind: 'workspace', id: workspaceId }, type: 'workspace.deleted', payload: {} },
    ]);
    expect(deleteWs[0]?.status).toBe('committed');
    const markWs = await submitBatch(owner, [purgeMarked('workspace', workspaceId, workspaceId)]);
    expect(markWs[0]?.status).toBe('committed');
  });
});

describe('19.032 marking twice: refused with ALREADY_MARKED_REASON; unmarking an unmarked item: refused with NOT_MARKED_REASON', () => {
  it('refuses a second mark and an unmark with nothing marked; mark -> unmark -> mark all succeed', async () => {
    const owner = await signedIn();
    const workspaceId = await found(owner);
    await submitBatch(owner, [
      { workspaceId, entity: { kind: 'workspace', id: workspaceId }, type: 'workspace.deleted', payload: {} },
    ]);

    const unmarkNever = await submitBatch(owner, [purgeUnmarked('workspace', workspaceId, workspaceId)]);
    expect(unmarkNever[0]).toMatchObject({
      status: 'refused',
      rule: LIFECYCLE_RULE,
      reason: NOT_MARKED_REASON('workspace'),
    });

    const mark1 = await submitBatch(owner, [purgeMarked('workspace', workspaceId, workspaceId)]);
    expect(mark1[0]?.status).toBe('committed');
    const mark2 = await submitBatch(owner, [purgeMarked('workspace', workspaceId, workspaceId)]);
    expect(mark2[0]).toMatchObject({
      status: 'refused',
      rule: LIFECYCLE_RULE,
      reason: ALREADY_MARKED_REASON('workspace'),
    });

    // control: mark -> unmark -> mark, all accepted.
    const unmark1 = await submitBatch(owner, [purgeUnmarked('workspace', workspaceId, workspaceId)]);
    expect(unmark1[0]?.status).toBe('committed');
    const mark3 = await submitBatch(owner, [purgeMarked('workspace', workspaceId, workspaceId)]);
    expect(mark3[0]?.status).toBe('committed');
  });
});

describe('19.033 restoring/undeleting a MARKED item: refused with UNMARK_FIRST_REASON, for each kind', () => {
  it('refuses ticket.restored/note.restored/project.undeleted/workspace.undeleted while marked; unmark then restore succeeds', async () => {
    const owner = await signedIn();
    const { workspaceId, projectId, ticketId, noteId } = await setupWorld(owner);

    // Ticket
    await submitBatch(owner, [
      { workspaceId, entity: { kind: 'ticket', id: ticketId }, type: 'ticket.deleted', payload: {} },
    ]);
    await submitBatch(owner, [purgeMarked('ticket', workspaceId, ticketId)]);
    const ticketRestoreRefused = await submitBatch(owner, [
      { workspaceId, entity: { kind: 'ticket', id: ticketId }, type: 'ticket.restored', payload: {} },
    ]);
    expect(ticketRestoreRefused[0]).toMatchObject({
      status: 'refused',
      rule: LIFECYCLE_RULE,
      reason: UNMARK_FIRST_REASON('ticket'),
    });
    await submitBatch(owner, [purgeUnmarked('ticket', workspaceId, ticketId)]);
    const ticketRestoreOk = await submitBatch(owner, [
      { workspaceId, entity: { kind: 'ticket', id: ticketId }, type: 'ticket.restored', payload: {} },
    ]);
    expect(ticketRestoreOk[0]?.status).toBe('committed');

    // Note
    await submitBatch(owner, [{ workspaceId, entity: { kind: 'note', id: noteId }, type: 'note.deleted', payload: {} }]);
    await submitBatch(owner, [purgeMarked('note', workspaceId, noteId)]);
    const noteRestoreRefused = await submitBatch(owner, [
      { workspaceId, entity: { kind: 'note', id: noteId }, type: 'note.restored', payload: {} },
    ]);
    expect(noteRestoreRefused[0]).toMatchObject({
      status: 'refused',
      rule: LIFECYCLE_RULE,
      reason: UNMARK_FIRST_REASON('note'),
    });
    await submitBatch(owner, [purgeUnmarked('note', workspaceId, noteId)]);
    const noteRestoreOk = await submitBatch(owner, [
      { workspaceId, entity: { kind: 'note', id: noteId }, type: 'note.restored', payload: {} },
    ]);
    expect(noteRestoreOk[0]?.status).toBe('committed');

    // Project
    await submitBatch(owner, [
      { workspaceId, entity: { kind: 'project', id: projectId }, type: 'project.deleted', payload: {} },
    ]);
    await submitBatch(owner, [purgeMarked('project', workspaceId, projectId)]);
    const projectUndeleteRefused = await submitBatch(owner, [
      { workspaceId, entity: { kind: 'project', id: projectId }, type: 'project.undeleted', payload: {} },
    ]);
    expect(projectUndeleteRefused[0]).toMatchObject({
      status: 'refused',
      rule: LIFECYCLE_RULE,
      reason: UNMARK_FIRST_REASON('project'),
    });
    await submitBatch(owner, [purgeUnmarked('project', workspaceId, projectId)]);
    const projectUndeleteOk = await submitBatch(owner, [
      { workspaceId, entity: { kind: 'project', id: projectId }, type: 'project.undeleted', payload: {} },
    ]);
    expect(projectUndeleteOk[0]?.status).toBe('committed');

    // Workspace
    await submitBatch(owner, [
      { workspaceId, entity: { kind: 'workspace', id: workspaceId }, type: 'workspace.deleted', payload: {} },
    ]);
    await submitBatch(owner, [purgeMarked('workspace', workspaceId, workspaceId)]);
    const wsUndeleteRefused = await submitBatch(owner, [
      { workspaceId, entity: { kind: 'workspace', id: workspaceId }, type: 'workspace.undeleted', payload: {} },
    ]);
    expect(wsUndeleteRefused[0]).toMatchObject({
      status: 'refused',
      rule: LIFECYCLE_RULE,
      reason: UNMARK_FIRST_REASON('workspace'),
    });
    await submitBatch(owner, [purgeUnmarked('workspace', workspaceId, workspaceId)]);
    const wsUndeleteOk = await submitBatch(owner, [
      { workspaceId, entity: { kind: 'workspace', id: workspaceId }, type: 'workspace.undeleted', payload: {} },
    ]);
    expect(wsUndeleteOk[0]?.status).toBe('committed');
  });
});

describe('19.034 marking a ticket inside a deleted project: refused with PROJECT_DELETED_REASON', () => {
  it('refuses the second ticket, marked after its project was deleted; the first ticket, marked BEFORE, stays marked', async () => {
    const owner = await signedIn();
    const { workspaceId, projectId, typeKey, ticketId: firstTicketId } = await setupWorld(owner);

    // Control setup: mark the first ticket BEFORE the project is deleted.
    await submitBatch(owner, [
      { workspaceId, entity: { kind: 'ticket', id: firstTicketId }, type: 'ticket.deleted', payload: {} },
    ]);
    const firstMark = await submitBatch(owner, [purgeMarked('ticket', workspaceId, firstTicketId)]);
    expect(firstMark[0]?.status).toBe('committed');

    // A second ticket in the same project, deleted but NOT marked.
    const secondTicketId = newUlid();
    const secondCreated = await submitBatch(owner, [
      {
        workspaceId,
        entity: { kind: 'ticket', id: secondTicketId },
        type: 'ticket.created',
        payload: { typeId: typeKey, projectId, parentId: null, title: 'Second' },
      },
    ]);
    expect(secondCreated[0]?.status).toBe('committed');
    await submitBatch(owner, [
      { workspaceId, entity: { kind: 'ticket', id: secondTicketId }, type: 'ticket.deleted', payload: {} },
    ]);

    // Delete the project.
    const projectDeleted = await submitBatch(owner, [
      { workspaceId, entity: { kind: 'project', id: projectId }, type: 'project.deleted', payload: {} },
    ]);
    expect(projectDeleted[0]?.status).toBe('committed');

    // control: the first ticket's mark column is NOT cleared by the project delete.
    const firstRow = await db.pool.query('SELECT purge_marked_at FROM proj_tickets WHERE ticket_id = $1', [
      firstTicketId,
    ]);
    expect(firstRow.rows[0]?.purge_marked_at).not.toBeNull();

    // Marking the second ticket now is refused: its container is deleted.
    const secondMark = await submitBatch(owner, [purgeMarked('ticket', workspaceId, secondTicketId)]);
    expect(secondMark[0]).toMatchObject({
      status: 'refused',
      rule: LIFECYCLE_RULE,
      reason: PROJECT_DELETED_REASON,
    });
  });
});

describe('19.035 unmarking after the due instant: refused with PURGE_DUE_REASON', () => {
  it('refuses purge.unmarked exactly at the due instant; accepts it one millisecond before', async () => {
    const owner = await signedIn();
    const workspaceId = await found(owner);
    await submitBatch(owner, [
      { workspaceId, entity: { kind: 'workspace', id: workspaceId }, type: 'workspace.deleted', payload: {} },
    ]);
    const marked = await submitBatch(owner, [purgeMarked('workspace', workspaceId, workspaceId)]);
    expect(marked[0]?.status).toBe('committed');

    const row = await db.pool.query<{ purge_marked_at: Date }>(
      'SELECT purge_marked_at FROM proj_workspaces WHERE workspace_id = $1',
      [workspaceId],
    );
    const markedAt = row.rows[0]!.purge_marked_at.toISOString();
    const dueAt = purgeDueAt(markedAt);

    const unmarkEnv: EventEnvelope = {
      id: newUlid(),
      workspaceId,
      entity: { kind: 'workspace', id: workspaceId },
      type: 'purge.unmarked',
      version: 1,
      payload: {},
      actorId: owner.userId,
      origin: 'web',
      clientTime: new Date().toISOString(),
      serverTime: new Date().toISOString(),
      seq: 1,
    };

    const atDue = await checkLifecycle(db.pool, unmarkEnv, new Date(dueAt));
    expect(atDue).toMatchObject({ refused: true, rule: LIFECYCLE_RULE, reason: PURGE_DUE_REASON('workspace') });

    // control: one millisecond before, accepted.
    const justBefore = await checkLifecycle(db.pool, unmarkEnv, new Date(Date.parse(dueAt) - 1));
    expect(justBefore).toBeNull();
  });
});
