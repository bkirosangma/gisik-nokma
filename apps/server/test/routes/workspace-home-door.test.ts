import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid, type IngestResult, type SubmittedEvent } from '@gisik-nokma/domain';
import type { FastifyInstance } from 'fastify';
import type { LogOtpSender } from '../../src/auth/otp-sender.js';
import {
  PERMISSION_ROLE_RULE,
  PROJECT_UNKNOWN_RULE,
  adminOnlyReason,
  projectUnknownReason,
} from '../../src/permissions/check-permission.js';
import { buildTestApp } from '../helpers/app.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { seedGuest, seedMember, seedProject } from '../helpers/seed.js';
import { signInWithPhone } from '../helpers/session.js';

/**
 * Task 19 — case 13.388. **The DOOR decides, not the workspace home.**
 *
 * `app/w/[workspaceId]/page.tsx` hides its archive, restore and new-project
 * controls from anyone who is not a workspace owner or admin. That is a display
 * decision and it is worth nothing as a guarantee: hiding a control removes a
 * temptation, never a capability, and anybody can post to `/v1/events`. So this
 * file drives every one of those mutations at the real client door with **no UI
 * in the picture at all**, which is what makes the page's own claim about
 * enforcement rest on something other than the page.
 *
 * ## THE FOUNDING SEQUENCE IS TWO EVENTS, AND THIS FILE PROVES THE ORDER MATTERS
 *
 * The page submits `project.created` and `project.member_added` in ONE batch,
 * and the reason it can is a property of the door: a batch is processed in
 * order and each event commits independently (`ingest-service.ts`), so the
 * second event's existence check sees the project the first one just made.
 *
 * A case that submitted the pair in the right order and asserted "both
 * committed" would be green for a door with **no ordering guarantee whatever** —
 * one that applied the batch in a single transaction, or in parallel, could
 * still answer committed for both if it happened to schedule them favourably.
 * So the REVERSED batch is submitted too, in the same run, and its
 * `project.member_added` must be REFUSED under `project.unknown`. That refusal
 * is the evidence; the forward pass alone is not.
 *
 * ## Why the second event is not decoration
 *
 * `visibleProjects` names every project to an `owner` and filters everyone
 * else — a workspace `admin` included — to `eff.projects`, which is built from
 * `project.member_added` and nothing else. The last assertion below reads the
 * founder's own `GET /v1/me/workspaces` after the batch and finds the project
 * there. Without the roster event that read comes back without it, which is the
 * failure a one-event founding form would ship: an admin creates a project and
 * watches it vanish.
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
  return signInWithPhone(app, otp, `+9190019${String(phoneCounter).padStart(5, '0')}`).then(
    (user) => ({ userId: user.userId, headers: { authorization: `Bearer ${user.token}` } }),
  );
}

/** Found a workspace through the product's own door — the caller becomes its owner. */
async function found(caller: Caller, name = 'Home Corner'): Promise<string> {
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

/**
 * A batch through the REAL client door, in ONE call, answered per event.
 *
 * The envelope is built here rather than by the client's factory on purpose:
 * this file is about what the SERVER does with a claim, and importing the
 * browser's builder would make a client change able to move a server case.
 */
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
  // The door's own promise, asserted rather than assumed: `result[i]` answers
  // `events[i]`. Every assertion below indexes into this array.
  expect(results).toHaveLength(seeds.length);
  return results;
}

const createSeed = (workspaceId: string, projectId: string, name: string): Seed => ({
  workspaceId,
  entity: { kind: 'project', id: projectId },
  type: 'project.created',
  payload: { name },
});

const joinSeed = (workspaceId: string, projectId: string, userId: string): Seed => ({
  workspaceId,
  entity: { kind: 'project', id: projectId },
  type: 'project.member_added',
  payload: { userId, projectAdmin: true },
});

const archiveSeed = (workspaceId: string, projectId: string, restore = false): Seed => ({
  workspaceId,
  entity: { kind: 'project', id: projectId },
  type: restore ? 'project.restored' : 'project.archived',
  payload: {},
});

type WireProject = { projectId: string; name: string; archived: boolean };

async function projectsFor(caller: Caller, workspaceId: string): Promise<WireProject[]> {
  const res = await app.inject({
    method: 'GET',
    url: '/v1/me/workspaces',
    headers: caller.headers,
  });
  expect(res.statusCode).toBe(200);
  const entry = (
    res.json() as { workspaces: Array<{ workspaceId: string; projects: WireProject[] }> }
  ).workspaces.find((w) => w.workspaceId === workspaceId);
  expect(entry, 'the caller should be served this workspace at all').toBeDefined();
  return entry!.projects;
}

describe('13.388 the door refuses the workspace home’s mutations from a non-admin, whatever the page rendered', () => {
  it('refuses project.created, project.archived and project.restored from a member and from a guest', async () => {
    const owner = await signedIn();
    const workspaceId = await found(owner);
    const projectId = newUlid();
    await seedProject(db.pool, workspaceId, projectId, 'Shop operations');

    const member = await signedIn();
    await seedMember(db.pool, workspaceId, member.userId, 'member', [{ projectId }]);
    const guest = await signedIn();
    await seedGuest(db.pool, workspaceId, guest.userId);

    for (const [role, caller] of [
      ['member', member],
      ['guest', guest],
    ] as const) {
      const results = await submitBatch(caller, [
        createSeed(workspaceId, newUlid(), 'A project they may not found'),
        archiveSeed(workspaceId, projectId),
        archiveSeed(workspaceId, projectId, true),
      ]);
      for (const [index, result] of results.entries()) {
        // The RULE and the REASON, not merely "not committed": a refusal under
        // some other rule would mean the three types are being turned away for
        // a reason that has nothing to do with the role, and this case would be
        // certifying the wrong door.
        expect(result.status, `${role} event ${index}`).toBe('refused');
        expect(result).toMatchObject({
          rule: PERMISSION_ROLE_RULE,
          reason: adminOnlyReason(role),
        });
      }
      // And nothing landed. A refusal that still wrote would be the worst of
      // both — the answer says no and the world says yes.
      const stillLive = await projectsFor(owner, workspaceId);
      expect(stillLive.find((p) => p.projectId === projectId)?.archived).toBe(false);
      expect(stillLive).toHaveLength(1);
    }

    // THE POSITIVE CONTROL, same door, same workspace, same three types: an
    // ADMIN is not refused. Without it every assertion above would also pass
    // against a door that refused these types from everybody, and the page
    // would be hiding controls that could never have worked.
    const admin = await signedIn();
    await seedMember(db.pool, workspaceId, admin.userId, 'admin');
    const allowed = await submitBatch(admin, [
      archiveSeed(workspaceId, projectId),
      archiveSeed(workspaceId, projectId, true),
    ]);
    expect(allowed.every((result) => result.status === 'committed')).toBe(true);
  });

  it('commits the two-event founding batch in ONE call, and refuses it reversed', async () => {
    const owner = await signedIn();
    const workspaceId = await found(owner);
    const admin = await signedIn();
    await seedMember(db.pool, workspaceId, admin.userId, 'admin');

    // ── The order the page submits. Both commit, and the second commits
    //    BECAUSE the first already did — `checkProjectExists` reads the row
    //    `project.created` wrote one element earlier in the same call.
    const projectId = newUlid();
    const forward = await submitBatch(admin, [
      createSeed(workspaceId, projectId, 'Deliveries'),
      joinSeed(workspaceId, projectId, admin.userId),
    ]);
    expect(forward[0]!.status).toBe('committed');
    expect(forward[1]!.status).toBe('committed');

    // ── THE SAME PAIR, REVERSED, in one call. This is the assertion that
    //    witnesses the ordering: a door with no in-batch ordering guarantee
    //    could answer committed for both above and would have to answer
    //    committed here too. It must not.
    const reversedId = newUlid();
    const reversed = await submitBatch(admin, [
      joinSeed(workspaceId, reversedId, admin.userId),
      createSeed(workspaceId, reversedId, 'Signage'),
    ]);
    expect(reversed[0]).toMatchObject({
      status: 'refused',
      rule: PROJECT_UNKNOWN_RULE,
      reason: projectUnknownReason(reversedId),
    });
    // The `project.created` behind it still commits — one bad event never rolls
    // back its neighbours — so the reversed batch leaves a project nobody is on.
    // That is precisely the state the page's founding order exists to avoid, and
    // it is asserted rather than described.
    expect(reversed[1]!.status).toBe('committed');

    // ── WHY THE SECOND EVENT IS NOT DECORATION. The founder is a workspace
    //    ADMIN, not the owner, so `visibleProjects` filters them to
    //    `eff.projects` — the set `project.member_added` builds. The forward
    //    project is named to them; the reversed one, whose roster event was
    //    refused, is NOT, even though it exists and they founded it.
    const named = await projectsFor(admin, workspaceId);
    expect(named.map((p) => p.projectId)).toContain(projectId);
    expect(named.map((p) => p.projectId)).not.toContain(reversedId);
    // The control that keeps the line above from passing on an empty answer:
    // the workspace OWNER is told both, because an owner is exempt from that
    // filter. So `reversedId` really does exist — it is withheld, not missing.
    const ownerSees = await projectsFor(owner, workspaceId);
    expect(ownerSees.map((p) => p.projectId)).toEqual(
      expect.arrayContaining([projectId, reversedId]),
    );
  });

  it('archives and restores through the door, and the served flag follows', async () => {
    const owner = await signedIn();
    const workspaceId = await found(owner);
    const projectId = newUlid();
    await seedProject(db.pool, workspaceId, projectId, 'Old signage');

    const flag = async (): Promise<boolean | undefined> =>
      (await projectsFor(owner, workspaceId)).find((p) => p.projectId === projectId)?.archived;

    expect(await flag()).toBe(false);
    expect((await submitBatch(owner, [archiveSeed(workspaceId, projectId)]))[0]!.status).toBe(
      'committed',
    );
    expect(await flag()).toBe(true);
    expect((await submitBatch(owner, [archiveSeed(workspaceId, projectId, true)]))[0]!.status).toBe(
      'committed',
    );
    // Restore is not merely "not archived" — it must be reachable FROM the
    // archived state, which is what makes the pair symmetric rather than a
    // one-way flag with a second name.
    expect(await flag()).toBe(false);
  });
});
