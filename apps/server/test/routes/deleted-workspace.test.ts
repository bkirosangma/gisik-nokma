import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { AddressInfo } from 'node:net';
import { EMPTY_NOTE_DOC, newUlid, type IngestResult, type SubmittedEvent } from '@gisik-nokma/domain';
import type { FastifyInstance } from 'fastify';
import type { LogOtpSender } from '../../src/auth/otp-sender.js';
import { PERMISSION_ROLE_RULE, WORKSPACE_OWNER_ONLY_REASON } from '../../src/permissions/check-permission.js';
import { WORKSPACE_DELETED_REASON } from '../../src/permissions/check-lifecycle.js';
import { visibleEventsFor } from '../../src/visibility/visible-events-for.js';
import { buildTestApp } from '../helpers/app.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { seedMember, seedProject } from '../helpers/seed.js';
import { openStream, type TestStream } from '../helpers/stream.js';
import { signInWithPhone } from '../helpers/session.js';

/**
 * A deleted workspace — hidden from reads, recoverable at the door (T10),
 * trash series Plan 1 Task 5. Cases 19.040-19.045, `test-cases/19-trash.md`
 * §19.5.
 */

let db: TestDatabase;
let app: FastifyInstance;
let otp: LogOtpSender;
let port: number;
const openStreams: TestStream[] = [];

beforeAll(async () => {
  db = await createTestDatabase();
  const built = buildTestApp(db);
  app = built.app;
  otp = built.otp;
  await app.listen({ port: 0, host: '127.0.0.1' });
  port = (app.server.address() as AddressInfo).port;
});

afterAll(async () => {
  await app.close();
  await db.drop();
});

afterEach(async () => {
  for (const stream of openStreams.splice(0)) await stream.close();
});

let phoneCounter = 0;

type Caller = { userId: string; headers: { authorization: string } };

async function signedIn(): Promise<Caller> {
  phoneCounter += 1;
  return signInWithPhone(app, otp, `+9190022${String(phoneCounter).padStart(5, '0')}`).then((user) => ({
    userId: user.userId,
    headers: { authorization: `Bearer ${user.token}` },
  }));
}

async function found(caller: Caller, name = 'Deleted Workspace Co'): Promise<string> {
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

type WireWorkspace = { workspaceId: string; archived: boolean };

async function myWorkspaces(caller: Caller): Promise<WireWorkspace[]> {
  const res = await app.inject({ method: 'GET', url: '/v1/me/workspaces', headers: caller.headers });
  expect(res.statusCode).toBe(200);
  return (res.json() as { workspaces: WireWorkspace[] }).workspaces;
}

async function myWork(caller: Caller, workspaceId: string): Promise<{ status: number; body: unknown }> {
  const res = await app.inject({
    method: 'GET',
    url: `/v1/me/work?workspaceId=${workspaceId}`,
    headers: caller.headers,
  });
  return { status: res.statusCode, body: res.json() };
}

async function search(caller: Caller, workspaceId: string): Promise<{ status: number; body: unknown }> {
  const res = await app.inject({
    method: 'GET',
    url: `/v1/search?workspaceId=${workspaceId}&q=test`,
    headers: caller.headers,
  });
  return { status: res.statusCode, body: res.json() };
}

async function workflows(caller: Caller, workspaceId: string): Promise<{ status: number; body: unknown }> {
  const res = await app.inject({
    method: 'GET',
    url: `/v1/workspaces/${workspaceId}/workflows`,
    headers: caller.headers,
  });
  return { status: res.statusCode, body: res.json() };
}

async function ticketHistory(caller: Caller, ticketId: string): Promise<{ status: number; body: unknown }> {
  const res = await app.inject({
    method: 'GET',
    url: `/v1/tickets/${ticketId}/history`,
    headers: caller.headers,
  });
  return { status: res.statusCode, body: res.json() };
}

async function bootstrap(caller: Caller, workspaceId: string): Promise<{ status: number; body: unknown }> {
  const res = await app.inject({
    method: 'GET',
    url: `/v1/sync/bootstrap?workspaceId=${workspaceId}`,
    headers: caller.headers,
  });
  return { status: res.statusCode, body: res.json() };
}

/**
 * The world for 19.040-19.042: an owner, a member on TWO workspaces (`deleted`
 * and `live`), a real ticket in `deleted`, and a stranger with no membership
 * anywhere — the yardstick 19.040's comparisons are measured against.
 */
async function setupWorld(): Promise<{
  owner: Caller;
  member: Caller;
  stranger: Caller;
  deletedWs: string;
  liveWs: string;
  ticketId: string;
  noteId: string;
}> {
  const owner = await signedIn();
  const member = await signedIn();
  const stranger = await signedIn();
  const deletedWs = await found(owner, 'To be deleted');
  const liveWs = await found(owner, 'Stays live');
  await seedMember(db.pool, liveWs, member.userId, 'member');

  const projectId = newUlid();
  await seedProject(db.pool, deletedWs, projectId, 'Project');
  await seedMember(db.pool, deletedWs, owner.userId, 'owner', [{ projectId, projectAdmin: true }]);
  // The member needs PROJECT access, not just workspace membership — a
  // ticket's default visibility is project-scope, and `canSeeResolved` gives
  // a plain member no admin bypass for it (measured: without this the
  // member's ticket-history read is 404 for an unrelated reason, before and
  // after the workspace is even deleted, which would make 19.040's
  // stranger-comparison vacuous).
  await seedMember(db.pool, deletedWs, member.userId, 'member', [{ projectId }]);
  const workflowId = newUlid();
  const typeKey = 'task-19-04x';
  const setup = await submitBatch(owner, [
    {
      workspaceId: deletedWs,
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
      workspaceId: deletedWs,
      entity: { kind: 'ticket-type', id: newUlid() },
      type: 'ticket-type.defined',
      payload: { id: typeKey, name: typeKey, icon: 'check', rank: 1, workflowId, fields: [] },
    },
  ]);
  expect(setup.every((r) => r.status === 'committed')).toBe(true);
  const ticketId = newUlid();
  const ticketCreated = await submitBatch(owner, [
    {
      workspaceId: deletedWs,
      entity: { kind: 'ticket', id: ticketId },
      type: 'ticket.created',
      payload: { typeId: typeKey, projectId, parentId: null, title: 'T' },
    },
  ]);
  expect(ticketCreated[0]?.status).toBe('committed');

  const noteId = newUlid();
  const noteCreated = await submitBatch(owner, [
    {
      workspaceId: deletedWs,
      entity: { kind: 'note', id: noteId },
      type: 'note.created',
      payload: { title: 'N', homeProjectId: '', scope: { mode: 'workspace' } },
    },
  ]);
  expect(noteCreated[0]?.status).toBe('committed');

  const deleted = await submitBatch(owner, [
    { workspaceId: deletedWs, entity: { kind: 'workspace', id: deletedWs }, type: 'workspace.deleted', payload: {} },
  ]);
  expect(deleted[0]?.status).toBe('committed');

  return { owner, member, stranger, deletedWs, liveWs, ticketId, noteId };
}

describe('19.040 after workspace.deleted, every read serves the member what a non-member gets; the live workspace is unaffected', () => {
  it('GET /v1/me/workspaces, /v1/me/work, /v1/search, a :workspaceId route and /v1/tickets/:id/history', async () => {
    const { member, stranger, deletedWs, liveWs, ticketId } = await setupWorld();

    // GET /v1/me/workspaces: the deleted workspace is omitted; the live one is not.
    const memberWs = await myWorkspaces(member);
    expect(memberWs.map((w) => w.workspaceId)).not.toContain(deletedWs);
    expect(memberWs.map((w) => w.workspaceId)).toContain(liveWs);

    // Every other read: the member's answer for the deleted workspace equals
    // a real stranger's — never hardcoded 404 or an empty body.
    const memberWork = await myWork(member, deletedWs);
    const strangerWork = await myWork(stranger, deletedWs);
    expect(memberWork).toEqual(strangerWork);

    const memberSearch = await search(member, deletedWs);
    const strangerSearch = await search(stranger, deletedWs);
    expect(memberSearch).toEqual(strangerSearch);

    const memberWorkflows = await workflows(member, deletedWs);
    const strangerWorkflows = await workflows(stranger, deletedWs);
    expect(memberWorkflows).toEqual(strangerWorkflows);

    const memberHistory = await ticketHistory(member, ticketId);
    const strangerHistory = await ticketHistory(stranger, ticketId);
    expect(memberHistory).toEqual(strangerHistory);

    // control: the live workspace still answers normally for the member.
    const liveWork = await myWork(member, liveWs);
    expect(liveWork.status).toBe(200);
  });
});

describe('19.041 the owner recovers a deleted workspace at the write door; an admin cannot', () => {
  it('undelete/mark/unmark accepted for the owner, undelete refused for an admin; every 19.040 read serves it again afterward', async () => {
    const { owner, member, deletedWs, ticketId } = await setupWorld();
    const admin = await signedIn();
    // Grant admin AFTER the delete: purge.marked/unmarked are workspace-owner
    // acts, but membership.granted into a deleted workspace is refused by the
    // gate this task adds -- so the admin must be seeded directly, matching
    // spec's own answer for who the workspace's OWNER already is.
    await seedMember(db.pool, deletedWs, admin.userId, 'admin');

    // control: an admin's undelete is refused.
    const adminUndelete = await submitBatch(admin, [
      { workspaceId: deletedWs, entity: { kind: 'workspace', id: deletedWs }, type: 'workspace.undeleted', payload: {} },
    ]);
    expect(adminUndelete[0]).toMatchObject({
      status: 'refused',
      rule: PERMISSION_ROLE_RULE,
      reason: WORKSPACE_OWNER_ONLY_REASON,
    });

    // The owner's mark, unmark and undelete are all accepted.
    const ownerMark = await submitBatch(owner, [
      { workspaceId: deletedWs, entity: { kind: 'workspace', id: deletedWs }, type: 'purge.marked', payload: {} },
    ]);
    expect(ownerMark[0]?.status).toBe('committed');
    const ownerUnmark = await submitBatch(owner, [
      { workspaceId: deletedWs, entity: { kind: 'workspace', id: deletedWs }, type: 'purge.unmarked', payload: {} },
    ]);
    expect(ownerUnmark[0]?.status).toBe('committed');
    const ownerUndelete = await submitBatch(owner, [
      { workspaceId: deletedWs, entity: { kind: 'workspace', id: deletedWs }, type: 'workspace.undeleted', payload: {} },
    ]);
    expect(ownerUndelete[0]?.status).toBe('committed');

    // Every 19.040 read serves the workspace again.
    const memberWs = await myWorkspaces(member);
    expect(memberWs.map((w) => w.workspaceId)).toContain(deletedWs);
    const memberWork = await myWork(member, deletedWs);
    expect(memberWork.status).toBe(200);
    const memberHistory = await ticketHistory(member, ticketId);
    expect(memberHistory.status).toBe(200);
  });
});

describe('19.042 any other event into a deleted workspace is refused with WORKSPACE_DELETED_REASON', () => {
  it('refuses a ticket field set, a note body set and workspace.renamed; the same events succeed after undelete', async () => {
    const { owner, deletedWs, ticketId, noteId } = await setupWorld();

    const refused = await submitBatch(owner, [
      {
        workspaceId: deletedWs,
        entity: { kind: 'ticket', id: ticketId },
        type: 'ticket.field_set',
        payload: { fieldId: 'title', value: 'renamed' },
      },
      {
        workspaceId: deletedWs,
        entity: { kind: 'note', id: noteId },
        type: 'note.body_set',
        payload: { body: EMPTY_NOTE_DOC },
      },
      { workspaceId: deletedWs, entity: { kind: 'workspace', id: deletedWs }, type: 'workspace.renamed', payload: { name: 'New name' } },
    ]);
    for (const [index, result] of refused.entries()) {
      expect(result.status, `event ${index}`).toBe('refused');
      expect(result).toMatchObject({ reason: WORKSPACE_DELETED_REASON });
    }

    // control: the same events succeed after undelete.
    const undelete = await submitBatch(owner, [
      { workspaceId: deletedWs, entity: { kind: 'workspace', id: deletedWs }, type: 'workspace.undeleted', payload: {} },
    ]);
    expect(undelete[0]?.status).toBe('committed');
    const accepted = await submitBatch(owner, [
      {
        workspaceId: deletedWs,
        entity: { kind: 'ticket', id: ticketId },
        type: 'ticket.field_set',
        payload: { fieldId: 'title', value: 'renamed' },
      },
      {
        workspaceId: deletedWs,
        entity: { kind: 'note', id: noteId },
        type: 'note.body_set',
        payload: { body: EMPTY_NOTE_DOC },
      },
      { workspaceId: deletedWs, entity: { kind: 'workspace', id: deletedWs }, type: 'workspace.renamed', payload: { name: 'New name' } },
    ]);
    for (const [index, result] of accepted.entries()) {
      expect(result.status, `event ${index}`).toBe('committed');
    }
  });
});

describe('19.043 GET /v1/me/workspaces serves archived truthfully; an archived workspace is still served in full', () => {
  it('archived: true after workspace.archived, false after workspace.restored; a never-archived workspace serves false', async () => {
    const owner = await signedIn();
    const workspaceId = await found(owner);
    const otherWorkspaceId = await found(owner, 'Never archived');

    let rows = await myWorkspaces(owner);
    expect(rows.find((w) => w.workspaceId === workspaceId)?.archived).toBe(false);
    // control: a never-archived workspace serves false.
    expect(rows.find((w) => w.workspaceId === otherWorkspaceId)?.archived).toBe(false);

    const archived = await submitBatch(owner, [
      { workspaceId, entity: { kind: 'workspace', id: workspaceId }, type: 'workspace.archived', payload: {} },
    ]);
    expect(archived[0]?.status).toBe('committed');
    rows = await myWorkspaces(owner);
    const archivedRow = rows.find((w) => w.workspaceId === workspaceId);
    expect(archivedRow?.archived).toBe(true);
    // T8: archive removes nobody's access -- the workspace is still served in full.
    expect(archivedRow).toBeDefined();

    const restored = await submitBatch(owner, [
      { workspaceId, entity: { kind: 'workspace', id: workspaceId }, type: 'workspace.restored', payload: {} },
    ]);
    expect(restored[0]?.status).toBe('committed');
    rows = await myWorkspaces(owner);
    expect(rows.find((w) => w.workspaceId === workspaceId)?.archived).toBe(false);
  });
});

describe('19.045 GET /v1/stream and POST /v1/sync/bootstrap for a member of a deleted workspace deliver nothing from it', () => {
  it('visibleEventsFor (the stream hub\'s sole audience filter) yields nothing for the deleted workspace and something for the live one', async () => {
    const { member, deletedWs, liveWs } = await setupWorld();

    const deletedEvents = [];
    for await (const item of visibleEventsFor(db.pool, member.userId, deletedWs, 0)) {
      deletedEvents.push(item);
    }
    expect(deletedEvents).toEqual([]);

    // control: the live workspace still yields events for the same member.
    const liveEvents = [];
    for await (const item of visibleEventsFor(db.pool, member.userId, liveWs, 0)) {
      liveEvents.push(item);
    }
    expect(liveEvents.length).toBeGreaterThan(0);
  });

  it('a real WS /v1/stream subscription to the deleted workspace answers not-a-member, while a separate connection to the live workspace still streams', async () => {
    const { owner, member, deletedWs, liveWs } = await setupWorld();

    // Two SEPARATE connections, deliberately: subscribing to both workspaces
    // on one socket left the deleted workspace's `not-a-member` response
    // racing the live workspace's much longer catch-up sequence for the same
    // pooled DB connection (measured: the error frame arrived AFTER
    // caught-up, sometimes past the wait window) — a timing artefact of this
    // test's own plumbing, not the door. One socket per workspace removes it.
    const deletedStream = await openStream(port, member.headers);
    openStreams.push(deletedStream);
    deletedStream.subscribe(deletedWs, 0);
    const notAMember = await deletedStream.next((f) => f.type === 'error' && f.workspaceId === deletedWs);
    expect(notAMember).toMatchObject({ type: 'error', workspaceId: deletedWs, code: 'not-a-member' });
    expect(deletedStream.frames.some((f) => f.type === 'event')).toBe(false);

    // control: a separate connection to the live workspace still streams.
    const liveStream = await openStream(port, member.headers);
    openStreams.push(liveStream);
    liveStream.subscribe(liveWs, 0);
    await liveStream.next((f) => f.type === 'caught-up' && f.workspaceId === liveWs);
    await submitBatch(owner, [
      { workspaceId: liveWs, entity: { kind: 'workspace', id: liveWs }, type: 'workspace.archived', payload: {} },
    ]);
    await liveStream.next((f) => f.type === 'event' && f.envelope.workspaceId === liveWs);
  });

  it('POST-equivalent GET /v1/sync/bootstrap refuses a member of a deleted workspace as not_a_member; the live workspace still bootstraps', async () => {
    const { member, deletedWs, liveWs } = await setupWorld();
    const deletedBootstrap = await bootstrap(member, deletedWs);
    expect(deletedBootstrap.status).toBe(403);
    expect(deletedBootstrap.body).toEqual({ error: 'not_a_member' });

    // control: the live workspace still bootstraps.
    const liveBootstrap = await bootstrap(member, liveWs);
    expect(liveBootstrap.status).toBe(200);
  });
});
