import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid, type IngestResult, type SubmittedEvent } from '@gisik-nokma/domain';
import type { FastifyInstance } from 'fastify';
import type { LogOtpSender } from '../../src/auth/otp-sender.js';
import {
  GROUP_HAS_CHILDREN_RULE,
  GROUP_IN_USE_RULE,
  GROUP_LEVEL_MISMATCH_RULE,
  GROUP_NAME_TAKEN_RULE,
  GROUP_UNKNOWN_RULE,
  PERMISSION_ROLE_RULE,
  PROJECT_GROUP_UNKNOWN_RULE,
  adminOnlyReason,
} from '../../src/permissions/check-permission.js';
import { buildProjectionRegistry } from '../../src/projections/index.js';
import { verifyProjections } from '../../src/tools/verify-projections.js';
import { buildTestApp } from '../helpers/app.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { seedGuest, seedMember, seedProject } from '../helpers/seed.js';
import { signInWithPhone } from '../helpers/session.js';

/**
 * Prefixes and groups plan Task 6, cases 22.091–22.101 and 22.103–22.107: the group tree's events, its
 * projection, its door and its read route, all driven through the REAL `POST /v1/events`
 * door and `GET /v1/workspaces/:id/groups` — what COMMITS and what is SERVED, not a
 * unit over `checkGroupRules`.
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
  return signInWithPhone(app, otp, `+9190170${String(phoneCounter).padStart(5, '0')}`).then((user) => ({
    userId: user.userId,
    headers: { authorization: `Bearer ${user.token}` },
  }));
}

async function found(caller: Caller): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/v1/workspaces',
    headers: caller.headers,
    payload: { name: 'Group Co' },
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
        { id: newUlid(), version: 1, origin: 'web', clientTime: new Date().toISOString(), actorId: caller.userId, ...seed },
      ],
    },
  });
  expect(res.statusCode).toBe(200);
  return (res.json() as { results: IngestResult[] }).results[0]!;
}

const createGroup = (
  workspaceId: string,
  id: string,
  name: string,
  parent: { id: string; level: number } | null,
  rank = 'm',
): Seed => ({
  workspaceId,
  entity: { kind: 'group', id },
  type: 'group.created',
  payload: { parentId: parent?.id ?? null, level: (parent?.level ?? 0) + 1, name, rank },
});
const renameGroup = (workspaceId: string, id: string, name: string): Seed => ({
  workspaceId, entity: { kind: 'group', id }, type: 'group.renamed', payload: { name },
});
const reorderGroup = (workspaceId: string, id: string, rank: string): Seed => ({
  workspaceId, entity: { kind: 'group', id }, type: 'group.reordered', payload: { rank },
});
const deleteGroup = (workspaceId: string, id: string): Seed => ({
  workspaceId, entity: { kind: 'group', id }, type: 'group.deleted', payload: {},
});
const assign = (workspaceId: string, projectId: string, groupId: string | null): Seed => ({
  workspaceId, entity: { kind: 'project', id: projectId }, type: 'project.updated', payload: { groupId },
});

type GroupRowWire = { id: string; parentId: string | null; level: number; name: string; rank: string; projectCount: number; childCount: number };
async function readGroups(caller: Caller, workspaceId: string): Promise<{ status: number; groups: GroupRowWire[] }> {
  const res = await app.inject({ method: 'GET', url: `/v1/workspaces/${workspaceId}/groups`, headers: caller.headers });
  return { status: res.statusCode, groups: res.statusCode === 200 ? (res.json() as { groups: GroupRowWire[] }).groups : [] };
}

/** A workspace with an owner and one root group "Retail" already filed. */
async function world(): Promise<{ owner: Caller; workspaceId: string; retail: string }> {
  const owner = await signedIn();
  const workspaceId = await found(owner);
  const retail = newUlid();
  expect(await submit(owner, createGroup(workspaceId, retail, 'Retail', null))).toMatchObject({ status: 'committed' });
  return { owner, workspaceId, retail };
}

describe('22.091 the tree is served with levels and parents', () => {
  it('22.091 an L1 and an L2 under it are both listed with their levels, parents and counts; control: another workspace sees none of them', async () => {
    const { owner, workspaceId, retail } = await world();
    const north = newUlid();
    expect(await submit(owner, createGroup(workspaceId, north, 'North', { id: retail, level: 1 }))).toMatchObject({ status: 'committed' });

    const { status, groups } = await readGroups(owner, workspaceId);
    expect(status).toBe(200);
    expect(groups).toEqual([
      { id: retail, parentId: null, level: 1, name: 'Retail', rank: 'm', projectCount: 0, childCount: 1 },
      { id: north, parentId: retail, level: 2, name: 'North', rank: 'm', projectCount: 0, childCount: 0 },
    ]);
    // CONTROL: a second workspace's owner has the same shape of tree and sees none of these rows.
    const stranger = await signedIn();
    const otherWorkspace = await found(stranger);
    expect((await readGroups(stranger, otherWorkspace)).groups).toEqual([]);
  });
});

describe('22.092 the level must be the parent’s level plus one', () => {
  it('22.092 an L2 whose parent is an L2 is refused group.level-mismatch; control: the L3 under it is accepted', async () => {
    const { owner, workspaceId, retail } = await world();
    const north = newUlid();
    await submit(owner, createGroup(workspaceId, north, 'North', { id: retail, level: 1 }));
    // `createGroup` files level = parent.level + 1, so handing it `{north, 1}` claims an L2 under an L2.
    expect(await submit(owner, createGroup(workspaceId, newUlid(), 'Wrong', { id: north, level: 1 }))).toMatchObject({
      status: 'refused',
      rule: GROUP_LEVEL_MISMATCH_RULE,
      reason: 'A level 2 group goes under a level 1 group.',
    });
    expect(await submit(owner, createGroup(workspaceId, newUlid(), 'South', { id: north, level: 2 }))).toMatchObject({ status: 'committed' });
  });
});

describe('22.093 a parent from another workspace is not found', () => {
  it('22.093 a parent that lives in another workspace is refused group.unknown, like a fabricated one; control: the same name under a real parent commits', async () => {
    const { owner, workspaceId, retail: ownRetail } = await world();
    const { retail: foreign } = await world();
    expect(await submit(owner, createGroup(workspaceId, newUlid(), 'Stray', { id: foreign, level: 1 }))).toMatchObject({
      status: 'refused', rule: GROUP_UNKNOWN_RULE,
    });
    expect(await submit(owner, createGroup(workspaceId, newUlid(), 'Ghost', { id: newUlid(), level: 1 }))).toMatchObject({
      status: 'refused', rule: GROUP_UNKNOWN_RULE,
    });
    expect(await submit(owner, createGroup(workspaceId, newUlid(), 'Stray', { id: ownRetail, level: 1 }))).toMatchObject({ status: 'committed' });
  });
});

describe('22.094 sibling names are unique ignoring case', () => {
  it('22.094 "retail" beside "Retail" is refused group.name-taken naming the existing one; control: the same name under a different parent is accepted', async () => {
    const { owner, workspaceId, retail } = await world();
    expect(await submit(owner, createGroup(workspaceId, newUlid(), 'retail', null))).toMatchObject({
      status: 'refused',
      rule: GROUP_NAME_TAKEN_RULE,
      reason: 'There is already a group called Retail here.',
    });
    // R4: "Retail" under a different parent is a different group.
    const wholesale = newUlid();
    await submit(owner, createGroup(workspaceId, wholesale, 'Wholesale', null));
    expect(await submit(owner, createGroup(workspaceId, newUlid(), 'Retail', { id: wholesale, level: 1 }))).toMatchObject({ status: 'committed' });
    expect(await submit(owner, createGroup(workspaceId, newUlid(), 'North', { id: retail, level: 1 }))).toMatchObject({ status: 'committed' });
  });
});

describe('22.095 rename follows the same sibling rule', () => {
  it('22.095 renaming onto a sibling (any case) is refused; renaming to a free name, or to its own name in another case, commits', async () => {
    const { owner, workspaceId, retail } = await world();
    const wholesale = newUlid();
    await submit(owner, createGroup(workspaceId, wholesale, 'Wholesale', null, 'n'));
    expect(await submit(owner, renameGroup(workspaceId, wholesale, 'RETAIL'))).toMatchObject({
      status: 'refused', rule: GROUP_NAME_TAKEN_RULE, reason: 'There is already a group called Retail here.',
    });
    expect(await submit(owner, renameGroup(workspaceId, wholesale, 'Trade'))).toMatchObject({ status: 'committed' });
    // Its own name in a different case is not a sibling clash with itself.
    expect(await submit(owner, renameGroup(workspaceId, retail, 'RETAIL'))).toMatchObject({ status: 'committed' });
    expect((await readGroups(owner, workspaceId)).groups.map((g) => g.name)).toEqual(['RETAIL', 'Trade']);
    expect(await submit(owner, renameGroup(workspaceId, newUlid(), 'Nobody'))).toMatchObject({ status: 'refused', rule: GROUP_UNKNOWN_RULE });
  });
});

describe('22.096 a group a project is filed under cannot be deleted', () => {
  it('22.096 delete is refused group.in-use naming the project; after the project moves out it commits', async () => {
    const { owner, workspaceId, retail } = await world();
    const projectId = newUlid();
    await seedProject(db.pool, workspaceId, projectId, 'Shop operations');
    expect(await submit(owner, assign(workspaceId, projectId, retail))).toMatchObject({ status: 'committed' });
    expect((await readGroups(owner, workspaceId)).groups[0]).toMatchObject({ projectCount: 1 });

    expect(await submit(owner, deleteGroup(workspaceId, retail))).toMatchObject({
      status: 'refused',
      rule: GROUP_IN_USE_RULE,
      reason: 'Shop operations is in this group. Move it out first.',
    });
    // CONTROL: ungroup (groupId: null) and the same delete is accepted.
    expect(await submit(owner, assign(workspaceId, projectId, null))).toMatchObject({ status: 'committed' });
    expect(await submit(owner, deleteGroup(workspaceId, retail))).toMatchObject({ status: 'committed' });
  });
});

describe('22.103 siblings are served in rank order, a reorder moves the group, and projectCount is that group’s own', () => {
  it('22.103 A, B, C list in rank order, a reorder of C to the front lists C, A, B; one project in A counts 1 for A and 0 for B and C', async () => {
    const owner = await signedIn();
    const workspaceId = await found(owner);
    const [a, b, c] = [newUlid(), newUlid(), newUlid()];
    await submit(owner, createGroup(workspaceId, a, 'Alpha', null, 'm'));
    await submit(owner, createGroup(workspaceId, b, 'Beta', null, 'n'));
    await submit(owner, createGroup(workspaceId, c, 'Gamma', null, 'p'));
    // CONTROL: before the reorder the order is the creation (= rank) order.
    expect((await readGroups(owner, workspaceId)).groups.map((g) => g.name)).toEqual(['Alpha', 'Beta', 'Gamma']);

    expect(await submit(owner, reorderGroup(workspaceId, c, 'a'))).toMatchObject({ status: 'committed' });
    const after = (await readGroups(owner, workspaceId)).groups;
    expect(after.map((g) => g.name)).toEqual(['Gamma', 'Alpha', 'Beta']);
    expect(after[0]).toMatchObject({ id: c, rank: 'a' });

    const projectId = newUlid();
    await seedProject(db.pool, workspaceId, projectId, 'Shop');
    expect(await submit(owner, assign(workspaceId, projectId, a))).toMatchObject({ status: 'committed' });
    const counted = (await readGroups(owner, workspaceId)).groups;
    expect(counted.map((g) => [g.name, g.projectCount])).toEqual([['Gamma', 0], ['Alpha', 1], ['Beta', 0]]);
  });
});

describe('22.104 the directory serves each project’s groupId', () => {
  it('22.104 GET /v1/me/workspaces carries the group a project is filed under; control: a never-filed project reads null throughout', async () => {
    const { owner, workspaceId, retail } = await world();
    const filed = newUlid();
    const loose = newUlid();
    await seedProject(db.pool, workspaceId, filed, 'Filed');
    await seedProject(db.pool, workspaceId, loose, 'Loose');
    const read = async (): Promise<Record<string, string | null>> => {
      const res = await app.inject({ method: 'GET', url: '/v1/me/workspaces', headers: owner.headers });
      expect(res.statusCode).toBe(200);
      const ws = (res.json() as { workspaces: Array<{ workspaceId: string; projects: Array<{ projectId: string; groupId: string | null }> }> })
        .workspaces.find((w) => w.workspaceId === workspaceId)!;
      return Object.fromEntries(ws.projects.map((p) => [p.projectId, p.groupId]));
    };
    expect(await read()).toEqual({ [filed]: null, [loose]: null });
    expect(await submit(owner, assign(workspaceId, filed, retail))).toMatchObject({ status: 'committed' });
    expect(await read()).toEqual({ [filed]: retail, [loose]: null });
    expect(await submit(owner, assign(workspaceId, filed, null))).toMatchObject({ status: 'committed' });
    expect(await read()).toEqual({ [filed]: null, [loose]: null });
  });
});

describe('22.106 reorder and delete of a group that does not exist are refused', () => {
  it('22.106 a re-delivered delete and a reorder of a fabricated id are refused group.unknown; control: the live group’s reorder commits', async () => {
    const { owner, workspaceId, retail } = await world();
    const gone = newUlid();
    await submit(owner, createGroup(workspaceId, gone, 'Gone', null, 'n'));
    expect(await submit(owner, deleteGroup(workspaceId, gone))).toMatchObject({ status: 'committed' });
    expect(await submit(owner, deleteGroup(workspaceId, gone))).toMatchObject({ status: 'refused', rule: GROUP_UNKNOWN_RULE });
    expect(await submit(owner, reorderGroup(workspaceId, newUlid(), 'z'))).toMatchObject({ status: 'refused', rule: GROUP_UNKNOWN_RULE });
    expect(await submit(owner, reorderGroup(workspaceId, retail, 'z'))).toMatchObject({ status: 'committed' });
  });
});

describe('22.107 a trashed project still blocks its group’s delete', () => {
  it('22.107 delete is refused group.in-use while the filed project is in the trash; control: restored and ungrouped, the delete commits', async () => {
    const { owner, workspaceId, retail } = await world();
    const projectId = newUlid();
    await seedProject(db.pool, workspaceId, projectId, 'Shop operations');
    expect(await submit(owner, assign(workspaceId, projectId, retail))).toMatchObject({ status: 'committed' });
    const trash = (type: string): Seed => ({ workspaceId, entity: { kind: 'project', id: projectId }, type, payload: {} });
    expect(await submit(owner, trash('project.deleted'))).toMatchObject({ status: 'committed' });
    expect(await submit(owner, deleteGroup(workspaceId, retail))).toMatchObject({ status: 'refused', rule: GROUP_IN_USE_RULE });
    expect(await submit(owner, trash('project.undeleted'))).toMatchObject({ status: 'committed' });
    expect(await submit(owner, assign(workspaceId, projectId, null))).toMatchObject({ status: 'committed' });
    expect(await submit(owner, deleteGroup(workspaceId, retail))).toMatchObject({ status: 'committed' });
  });
});

describe('22.097 a group with children cannot be deleted', () => {
  it('22.097 delete is refused group.has-children while a child exists; control: the child itself deletes', async () => {
    const { owner, workspaceId, retail } = await world();
    const north = newUlid();
    await submit(owner, createGroup(workspaceId, north, 'North', { id: retail, level: 1 }));
    expect(await submit(owner, deleteGroup(workspaceId, retail))).toMatchObject({
      status: 'refused',
      rule: GROUP_HAS_CHILDREN_RULE,
      reason: 'This group has groups under it. Delete those first.',
    });
    expect(await submit(owner, deleteGroup(workspaceId, north))).toMatchObject({ status: 'committed' });
    expect(await submit(owner, deleteGroup(workspaceId, retail))).toMatchObject({ status: 'committed' });
  });
});

describe('22.098 an unused leaf deletes and disappears from the route', () => {
  it('22.098 deleting an unused leaf commits and the route no longer lists it; control: its sibling stays', async () => {
    const { owner, workspaceId, retail } = await world();
    const leaf = newUlid();
    await submit(owner, createGroup(workspaceId, leaf, 'Leaf', { id: retail, level: 1 }));
    expect((await readGroups(owner, workspaceId)).groups.map((g) => g.name)).toEqual(['Retail', 'Leaf']);
    expect(await submit(owner, deleteGroup(workspaceId, leaf))).toMatchObject({ status: 'committed' });
    const after = await readGroups(owner, workspaceId);
    expect(after.groups.map((g) => g.name)).toEqual(['Retail']);
    expect(after.groups[0]).toMatchObject({ childCount: 0 });
  });
});

describe('22.099 a project is filed only under a live group of its own workspace', () => {
  it('22.099 a group from another workspace, a deleted one and a fabricated one are refused project.group-unknown; control: a live group commits', async () => {
    const { owner, workspaceId, retail } = await world();
    const { retail: foreign } = await world();
    const projectId = newUlid();
    await seedProject(db.pool, workspaceId, projectId, 'Shop');
    const gone = newUlid();
    await submit(owner, createGroup(workspaceId, gone, 'Gone', null, 'n'));
    await submit(owner, deleteGroup(workspaceId, gone));

    for (const bad of [foreign, gone, newUlid()]) {
      expect(await submit(owner, assign(workspaceId, projectId, bad))).toMatchObject({
        status: 'refused', rule: PROJECT_GROUP_UNKNOWN_RULE,
      });
    }
    expect(await submit(owner, assign(workspaceId, projectId, retail))).toMatchObject({ status: 'committed' });
  });
});

describe('22.100 groups are an owner/admin act; members and guests may only read', () => {
  it('22.100 every group event by a member is refused permission.role; an admin commits; a member reads, a guest and an outsider get 404', async () => {
    const { owner, workspaceId, retail } = await world();
    const admin = await signedIn();
    await seedMember(db.pool, workspaceId, admin.userId, 'admin');
    const member = await signedIn();
    await seedMember(db.pool, workspaceId, member.userId, 'member');
    const guest = await signedIn();
    await seedGuest(db.pool, workspaceId, guest.userId);
    const outsider = await signedIn();

    const target = newUlid();
    const attempts: Seed[] = [
      createGroup(workspaceId, target, 'Member made', null, 'p'),
      renameGroup(workspaceId, retail, 'Renamed'),
      reorderGroup(workspaceId, retail, 'z'),
      deleteGroup(workspaceId, retail),
    ];
    for (const seed of attempts) {
      expect(await submit(member, seed), seed.type).toMatchObject({
        status: 'refused', rule: PERMISSION_ROLE_RULE, reason: adminOnlyReason('member'),
      });
    }
    // CONTROL: the admin's same four acts are accepted (create, rename, reorder, delete).
    expect(await submit(admin, createGroup(workspaceId, target, 'Admin made', null, 'p'))).toMatchObject({ status: 'committed' });
    expect(await submit(admin, renameGroup(workspaceId, target, 'Admin renamed'))).toMatchObject({ status: 'committed' });
    expect(await submit(admin, reorderGroup(workspaceId, target, 'q'))).toMatchObject({ status: 'committed' });
    expect(await submit(admin, deleteGroup(workspaceId, target))).toMatchObject({ status: 'committed' });

    expect((await readGroups(member, workspaceId)).status).toBe(200);
    expect((await readGroups(member, workspaceId)).groups.map((g) => g.name)).toEqual(['Retail']);
    expect((await readGroups(owner, workspaceId)).status).toBe(200);
    expect((await readGroups(guest, workspaceId)).status).toBe(404);
    expect((await readGroups(outsider, workspaceId)).status).toBe(404);
  });
});

describe('22.101 the projections verify clean after the whole life of a group', () => {
  it('22.101 create, rename, reorder, assign and delete leave verify-projections clean; control: a group row edited behind the ledger is reported', async () => {
    // A DATABASE OF ITS OWN, and a project founded by an EVENT: `verifyProjections` diffs the whole
    // database, so a `seedProject` row (written behind the ledger) in the shared one is drift it would,
    // rightly, report. Only the ledger may have built what is verified here.
    const ownDb = await createTestDatabase();
    const shared = { app, otp };
    const built = buildTestApp(ownDb);
    app = built.app;
    otp = built.otp;
    try {
      await app.ready();
      const { owner, workspaceId, retail } = await world();
      const north = newUlid();
      const projectId = newUlid();
      expect(
        await submit(owner, { workspaceId, entity: { kind: 'project', id: projectId }, type: 'project.created', payload: { name: 'Shop' } }),
      ).toMatchObject({ status: 'committed' });
      await submit(owner, createGroup(workspaceId, north, 'North', { id: retail, level: 1 }));
      await submit(owner, renameGroup(workspaceId, north, 'Northern'));
      await submit(owner, reorderGroup(workspaceId, north, 'z'));
      expect(await submit(owner, assign(workspaceId, projectId, north))).toMatchObject({ status: 'committed' });
      const doomed = newUlid();
      await submit(owner, createGroup(workspaceId, doomed, 'Doomed', null, 'q'));
      expect(await submit(owner, deleteGroup(workspaceId, doomed))).toMatchObject({ status: 'committed' });

      const projections = buildProjectionRegistry();
      expect(await verifyProjections({ pool: ownDb.pool, projections })).toEqual({ clean: true, diffs: [] });
      // The verifier SEES the tree: a name rewritten behind the ledger is drift, so "clean" above compared it.
      await ownDb.pool.query(`UPDATE proj_groups SET name = 'Tampered' WHERE group_id = $1`, [north]);
      const report = await verifyProjections({ pool: ownDb.pool, projections });
      expect(report.clean).toBe(false);
      expect(report.diffs.map((diff) => diff.table)).toEqual(['proj_groups']);
    } finally {
      await app.close();
      await ownDb.drop();
      app = shared.app;
      otp = shared.otp;
    }
  });
});
