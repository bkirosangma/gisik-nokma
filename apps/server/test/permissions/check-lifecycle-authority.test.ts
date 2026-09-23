import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid, type IngestResult, type SubmittedEvent } from '@gisik-nokma/domain';
import type { FastifyInstance } from 'fastify';
import type { LogOtpSender } from '../../src/auth/otp-sender.js';
import {
  NOTE_PERMISSION_RULE,
  PERMISSION_ROLE_RULE,
  WORKSPACE_OWNER_ONLY_REASON,
  adminOnlyReason,
} from '../../src/permissions/check-permission.js';
import { buildTestApp } from '../helpers/app.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { seedMember, seedProject } from '../helpers/seed.js';
import { signInWithPhone } from '../helpers/session.js';

/**
 * Authority (T3), trash series Plan 1 Task 3. Cases 19.020-19.023,
 * `test-cases/19-trash.md` §19.3. Drives the real `POST /v1/events` door
 * (the same harness `test/routes/workspace-home-door.test.ts` uses) so a
 * refusal here is the door's, not a unit test's belief about it.
 *
 * Ticket and note marks DELETE THE ITEM FIRST, even though Task 4's state
 * refusal ("delete it first") does not exist yet: once it lands, marking a
 * LIVE item would be refused for a different reason and this authority case
 * would stop testing what it claims to. Writing the fixture this way now
 * means Task 4 does not silently invalidate it later.
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
  return signInWithPhone(app, otp, `+9190020${String(phoneCounter).padStart(5, '0')}`).then((user) => ({
    userId: user.userId,
    headers: { authorization: `Bearer ${user.token}` },
  }));
}

async function found(caller: Caller, name = 'Trash Authority Co'): Promise<string> {
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

describe('19.020 workspace acts: refused for an admin, accepted for the owner', () => {
  it('archive/restore/delete/undelete/mark/unmark are all refused for an admin with WORKSPACE_OWNER_ONLY_REASON, all accepted for the owner', async () => {
    const owner = await signedIn();
    const workspaceId = await found(owner);
    const admin = await signedIn();
    await seedMember(db.pool, workspaceId, admin.userId, 'admin');

    // STATE-COHERENT order (Task 4's checkLifecycle enforces real transitions
    // now: mark needs deleted, undelete needs unmarked) — the admin half is
    // refused by ROLE regardless of order, but the owner's acceptance half
    // needs a sequence a live door could actually walk: archive, restore
    // (still live), delete, mark (needs deleted), unmark (undoes the mark),
    // undelete (needs deleted AND unmarked).
    const workspaceActs: Seed[] = [
      { workspaceId, entity: { kind: 'workspace', id: workspaceId }, type: 'workspace.archived', payload: {} },
      { workspaceId, entity: { kind: 'workspace', id: workspaceId }, type: 'workspace.restored', payload: {} },
      { workspaceId, entity: { kind: 'workspace', id: workspaceId }, type: 'workspace.deleted', payload: {} },
      { workspaceId, entity: { kind: 'workspace', id: workspaceId }, type: 'purge.marked', payload: {} },
      { workspaceId, entity: { kind: 'workspace', id: workspaceId }, type: 'purge.unmarked', payload: {} },
      { workspaceId, entity: { kind: 'workspace', id: workspaceId }, type: 'workspace.undeleted', payload: {} },
    ];

    const refused = await submitBatch(admin, workspaceActs);
    for (const [index, result] of refused.entries()) {
      expect(result.status, `admin event ${index}`).toBe('refused');
      expect(result).toMatchObject({ rule: PERMISSION_ROLE_RULE, reason: WORKSPACE_OWNER_ONLY_REASON });
    }

    // control: the owner's acceptance, in the same it.
    const accepted = await submitBatch(owner, workspaceActs);
    for (const [index, result] of accepted.entries()) {
      expect(result.status, `owner event ${index}`).toBe('committed');
    }
  });
});

describe('19.021 project.deleted and a project mark: refused for a member, accepted for an admin', () => {
  it('refuses a plain member with permission.role, accepts an admin', async () => {
    const owner = await signedIn();
    const workspaceId = await found(owner);
    const projectId = newUlid();
    await seedProject(db.pool, workspaceId, projectId, 'Refit');
    const member = await signedIn();
    await seedMember(db.pool, workspaceId, member.userId, 'member', [{ projectId }]);
    const admin = await signedIn();
    await seedMember(db.pool, workspaceId, admin.userId, 'admin');

    const projectActs: Seed[] = [
      { workspaceId, entity: { kind: 'project', id: projectId }, type: 'project.deleted', payload: {} },
      { workspaceId, entity: { kind: 'project', id: projectId }, type: 'purge.marked', payload: {} },
    ];

    const refused = await submitBatch(member, projectActs);
    for (const [index, result] of refused.entries()) {
      expect(result.status, `member event ${index}`).toBe('refused');
      expect(result).toMatchObject({ rule: PERMISSION_ROLE_RULE, reason: adminOnlyReason('member') });
    }

    // control: an admin is accepted, same door, same project.
    const accepted = await submitBatch(admin, projectActs);
    for (const [index, result] of accepted.entries()) {
      expect(result.status, `admin event ${index}`).toBe('committed');
    }
  });
});

describe('19.022 a ticket mark: refused for a non-project-admin member, accepted for a project admin', () => {
  it('refuses a member with no project-admin rights, accepts a project admin', async () => {
    const owner = await signedIn();
    const workspaceId = await found(owner);
    const projectId = newUlid();
    await seedProject(db.pool, workspaceId, projectId, 'Board');

    const projectAdmin = await signedIn();
    await seedMember(db.pool, workspaceId, projectAdmin.userId, 'member', [
      { projectId, projectAdmin: true },
    ]);
    const plainMember = await signedIn();
    await seedMember(db.pool, workspaceId, plainMember.userId, 'member', [
      { projectId, projectAdmin: false },
    ]);

    // A real ticket, through the real door: `checkTicketDeleted`'s rule-engine
    // check reads `proj_entity_heads` through `ctx.getEntityState`, which only
    // a REAL `ticket.created` folds — a hand-seeded `proj_tickets` row
    // (`seedTicket`) is invisible to it and the delete below would refuse
    // `unknown-ticket` (measured).
    const workflowId = newUlid();
    const typeKey = 'task-19-022';
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
    const ticketCreated = await submitBatch(projectAdmin, [
      {
        workspaceId,
        entity: { kind: 'ticket', id: ticketId },
        type: 'ticket.created',
        payload: { typeId: typeKey, projectId, parentId: null, title: 'T' },
      },
    ]);
    expect(ticketCreated[0]?.status).toBe('committed');

    // Delete first (Task 4's future state gate reads this fixture correctly
    // once it lands) — a project admin may delete.
    const deleted = await submitBatch(projectAdmin, [
      { workspaceId, entity: { kind: 'ticket', id: ticketId }, type: 'ticket.deleted', payload: {} },
    ]);
    expect(deleted[0]?.status).toBe('committed');

    const markSeed: Seed = { workspaceId, entity: { kind: 'ticket', id: ticketId }, type: 'purge.marked', payload: {} };

    const refused = await submitBatch(plainMember, [markSeed]);
    expect(refused[0]?.status).toBe('refused');
    expect(refused[0]).toMatchObject({ rule: PERMISSION_ROLE_RULE });

    // control: the project admin is accepted.
    const accepted = await submitBatch(projectAdmin, [markSeed]);
    expect(accepted[0]?.status).toBe('committed');
  });
});

describe('19.023 a note mark: refused for a non-author member, accepted for the author, an admin who can read it, and the owner', () => {
  it('refuses a member who is not the author, accepts the author/admin/owner', async () => {
    const owner = await signedIn();
    const workspaceId = await found(owner);
    const author = await signedIn();
    await seedMember(db.pool, workspaceId, author.userId, 'member');
    const otherMember = await signedIn();
    await seedMember(db.pool, workspaceId, otherMember.userId, 'member');
    const admin = await signedIn();
    await seedMember(db.pool, workspaceId, admin.userId, 'admin');

    const noteId = newUlid();
    const created = await submitBatch(author, [
      {
        workspaceId,
        entity: { kind: 'note', id: noteId },
        type: 'note.created',
        payload: { title: 'N', homeProjectId: '', scope: { mode: 'workspace' } },
      },
    ]);
    expect(created[0]?.status).toBe('committed');
    const deleted = await submitBatch(author, [
      { workspaceId, entity: { kind: 'note', id: noteId }, type: 'note.deleted', payload: {} },
    ]);
    expect(deleted[0]?.status).toBe('committed');

    const markSeed: Seed = { workspaceId, entity: { kind: 'note', id: noteId }, type: 'purge.marked', payload: {} };
    // Task 4's checkLifecycle now refuses a SECOND purge.marked on an
    // already-marked note (ALREADY_MARKED_REASON), so each accepted mark
    // below is followed by an unmark (by the author, always authorized) —
    // this case is testing AUTHORITY per actor, not accumulating marks.
    const unmarkSeed: Seed = { workspaceId, entity: { kind: 'note', id: noteId }, type: 'purge.unmarked', payload: {} };

    const refused = await submitBatch(otherMember, [markSeed]);
    expect(refused[0]?.status, 'a non-author member').toBe('refused');
    expect(refused[0]).toMatchObject({ rule: NOTE_PERMISSION_RULE });

    // control: the author is accepted.
    const byAuthor = await submitBatch(author, [markSeed]);
    expect(byAuthor[0]?.status, 'the author').toBe('committed');
    await submitBatch(author, [unmarkSeed]);

    // An admin who can read it (workspace-scope, so every non-guest reads it).
    const byAdmin = await submitBatch(admin, [markSeed]);
    expect(byAdmin[0]?.status, 'an admin who can read it').toBe('committed');
    await submitBatch(author, [unmarkSeed]);

    // The owner.
    const byOwner = await submitBatch(owner, [markSeed]);
    expect(byOwner[0]?.status, 'the owner').toBe('committed');
  });
});
