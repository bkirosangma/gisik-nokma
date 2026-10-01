import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid, type IngestResult, type SubmittedEvent } from '@gisik-nokma/domain';
import type { FastifyInstance } from 'fastify';
import type { LogOtpSender } from '../../src/auth/otp-sender.js';
import {
  PERMISSION_ROLE_RULE,
  PROJECT_UNKNOWN_RULE,
  adminOnlyReason,
  checkPermission,
  projectUnknownReason,
} from '../../src/permissions/check-permission.js';
import { buildTestApp } from '../helpers/app.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { testEnvelope } from '../helpers/envelope.js';
import { seedMember, seedProject } from '../helpers/seed.js';
import { signInWithPhone } from '../helpers/session.js';

/**
 * MCP CRUD plan Task 1, cases 13.1603–13.1604. Two harnesses on purpose: the
 * real `POST /v1/events` door (the lifecycle-authority harness) proves what
 * COMMITS, and `checkPermission` directly carries the member's `ticket.created`
 * control, which would otherwise need a whole workflow/type setup to commit.
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
  return signInWithPhone(app, otp, `+9190160${String(phoneCounter).padStart(5, '0')}`).then((user) => ({
    userId: user.userId,
    headers: { authorization: `Bearer ${user.token}` },
  }));
}

async function found(caller: Caller): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/v1/workspaces',
    headers: caller.headers,
    payload: { name: 'Project Update Co' },
  });
  expect(res.statusCode).toBe(201);
  return (res.json() as { workspaceId: string }).workspaceId;
}

type Seed = Pick<SubmittedEvent, 'workspaceId' | 'entity' | 'type' | 'payload'>;

async function submit(caller: Caller, seed: Seed): Promise<IngestResult> {
  const res = await app.inject({
    method: 'POST',
    url: '/v1/events',
    headers: caller.headers,
    payload: {
      events: [
        {
          id: newUlid(),
          version: 1,
          origin: 'web',
          clientTime: new Date().toISOString(),
          actorId: caller.userId,
          ...seed,
        },
      ],
    },
  });
  expect(res.statusCode).toBe(200);
  return (res.json() as { results: IngestResult[] }).results[0]!;
}

const rename = (workspaceId: string, projectId: string, name: string): Seed => ({
  workspaceId,
  entity: { kind: 'project', id: projectId },
  type: 'project.updated',
  payload: { name },
});

describe('13.1603 project.updated is a workspace admin/owner act', () => {
  it('13.1603 refuses a member with the admin-only reason; admin and owner commit; a member may still create tickets', async () => {
    const owner = await signedIn();
    const workspaceId = await found(owner);
    const projectId = newUlid();
    await seedProject(db.pool, workspaceId, projectId, 'Refit');
    const member = await signedIn();
    await seedMember(db.pool, workspaceId, member.userId, 'member', [{ projectId }]);
    const admin = await signedIn();
    await seedMember(db.pool, workspaceId, admin.userId, 'admin');

    expect(await submit(member, rename(workspaceId, projectId, 'Member rename'))).toMatchObject({
      status: 'refused',
      rule: PERMISSION_ROLE_RULE,
      reason: adminOnlyReason('member'),
    });
    expect(await submit(admin, rename(workspaceId, projectId, 'Admin rename'))).toMatchObject({ status: 'committed' });
    expect(await submit(owner, rename(workspaceId, projectId, 'Owner rename'))).toMatchObject({ status: 'committed' });

    // control: the SAME member, same project, is not refused for an ordinary
    // member act — so the refusal above is about `project.updated`, not the member.
    const ticket = testEnvelope({
      workspaceId,
      entity: { kind: 'ticket', id: newUlid() },
      type: 'ticket.created',
      payload: { typeId: 'task', projectId, parentId: null, title: 'A ticket' },
      actorId: member.userId,
    });
    expect(await checkPermission(ticket, { db: db.pool, sessionUserId: member.userId })).toBeNull();
  });
});

describe('13.1604 project.updated names a founded project', () => {
  it('13.1604 an unfounded project is refused project-unknown; a founded one commits', async () => {
    const owner = await signedIn();
    const workspaceId = await found(owner);
    const projectId = newUlid();
    await seedProject(db.pool, workspaceId, projectId, 'Real');
    const ghost = newUlid();

    expect(await submit(owner, rename(workspaceId, ghost, 'Nobody'))).toMatchObject({
      status: 'refused',
      rule: PROJECT_UNKNOWN_RULE,
      reason: projectUnknownReason(ghost),
    });
    expect(await submit(owner, rename(workspaceId, projectId, 'Renamed real'))).toMatchObject({ status: 'committed' }); // control
  });
});

describe('13.1605 the prefix never moves through project.updated', () => {
  it('13.1605 the door refuses a payload carrying a prefix and the row keeps its founded one', async () => {
    const owner = await signedIn();
    const workspaceId = await found(owner);
    const projectId = newUlid();
    await seedProject(db.pool, workspaceId, projectId, 'Shop', undefined, 'SO');

    const refused = await submit(owner, {
      workspaceId,
      entity: { kind: 'project', id: projectId },
      type: 'project.updated',
      payload: { name: 'Shop floor', prefix: 'ZZ' },
    });
    expect(refused.status).toBe('invalid'); // the schema's refusal, not a permission one
    const { rows } = await db.pool.query('SELECT name, prefix FROM proj_projects WHERE project_id = $1', [projectId]);
    expect(rows[0]).toEqual({ name: 'Shop', prefix: 'SO' });

    // control: the same rename without a prefix commits and moves the name only
    expect(await submit(owner, rename(workspaceId, projectId, 'Shop floor'))).toMatchObject({ status: 'committed' });
    const after = await db.pool.query('SELECT name, prefix FROM proj_projects WHERE project_id = $1', [projectId]);
    expect(after.rows[0]).toEqual({ name: 'Shop floor', prefix: 'SO' });
  });
});
