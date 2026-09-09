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
 * ## WHAT THIS FILE DOES NOT OWN, SAID BEFORE WHAT IT DOES
 *
 * Two properties a reader would expect here are already checked elsewhere, and
 * the mutations that proved it are recorded rather than the reading that
 * suggested it:
 *
 * - **The archive/restore round trip** — an owner archives, the served flag
 *   flips, they restore, it flips back. That is case **13.370**
 *   (`test/routes/workspace-counts.test.ts`), which also refuses a plain
 *   member's `project.archived` under `permission.role`. Removing
 *   `'project.archived'` from `ADMIN_ONLY_TYPES` reddens 13.370 and this file's
 *   first case together. A third case restating it was written here and
 *   DELETED once that measurement came back: a duplicate case inflates the
 *   count and moves no floor.
 * - **The in-batch ordering guarantee** — `project.created` followed by
 *   `project.member_added` in one `ingestClientBatch`, with the reversed pair
 *   as its control. That is case **6.81**
 *   (`test/permissions/check-project-exists.test.ts`), which was written for
 *   exactly this and says so.
 *
 * ## WHAT IT DOES OWN
 *
 * 1. **The door refuses all THREE of the workspace home's mutations from a
 *    non-admin**, `member` and `guest` both, with the rule and the reason
 *    asserted and an `admin` positive control in the same workspace. 13.370
 *    drives one type and one role; this drives three and two, because the page
 *    offers three controls and hides them from both non-admin roles.
 * 2. **The visibility consequence that makes the founding form's second event
 *    non-optional.** 6.81 never reads `/v1/me/workspaces`, and its actor is the
 *    workspace OWNER, who `visibleProjects` exempts from its filter. Here the
 *    founder is a workspace ADMIN at the HTTP door, so the filter applies: the
 *    project whose roster event landed is named back to them, and the one whose
 *    roster event was refused is not — though it exists, and they founded it.
 *    That is the failure a one-event founding form would ship, and nothing else
 *    in the repo would have caught it.
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

  /**
   * WHAT THIS CASE OWNS, AND WHAT IT DOES NOT — settled by mutation, not by
   * reading.
   *
   * Removing `case 'project.member_added'` from `projectsNamedBy` reddens THIS
   * case and **two pre-existing cases in `test/permissions/check-project-exists.
   * test.ts`**, one of which is case **6.81** — *"a project founded EARLIER IN
   * THE SAME BATCH is found by the check"* — which already drives the forward
   * pair AND the reversed control through `ingestClientBatch`, with the same
   * reasoning. **So the batch-ordering property is 6.81's and this case does not
   * establish it.** Claiming otherwise would be a case advertising novelty it
   * does not have, which is worse than no case: it is a green tick over a
   * property already ticked somewhere else.
   *
   * What is NOT covered anywhere else, and is the reason this one exists: the
   * **visibility consequence** that makes the page's second event non-optional.
   * 6.81 never reads `/v1/me/workspaces`; it uses the internal door and the
   * workspace OWNER, who is exempt from `visibleProjects`' filter. Here the
   * founder is a workspace ADMIN going through the HTTP door, so the filter
   * applies — and the forward project is named back to them while the reversed
   * one, whose roster event was refused, is not. That is the failure a
   * one-event founding form would ship, and nothing else in the repo would have
   * caught it.
   *
   * The reversed batch is therefore a FIXTURE here rather than the claim: it is
   * how a project that exists and is unnamed to its own founder gets made.
   */
  it('an ADMIN founder is named their new project only because the second event landed', async () => {
    const owner = await signedIn();
    const workspaceId = await found(owner);
    const admin = await signedIn();
    await seedMember(db.pool, workspaceId, admin.userId, 'admin');

    // ── The order the page submits. Both commit, and the second commits
    //    BECAUSE the first already did — `checkProjectExists` reads the row
    //    `project.created` wrote one element earlier in the same call. That
    //    ordering is 6.81's property; here it is the setup.
    const projectId = newUlid();
    const forward = await submitBatch(admin, [
      createSeed(workspaceId, projectId, 'Deliveries'),
      joinSeed(workspaceId, projectId, admin.userId),
    ]);
    expect(forward[0]!.status).toBe('committed');
    expect(forward[1]!.status).toBe('committed');

    // ── THE SAME PAIR, REVERSED, in one call — the fixture for the assertion
    //    that follows, and a second reading of 6.81's control. It manufactures
    //    the state this case is actually about: a project that EXISTS and whose
    //    founder is on no roster for it.
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

});
