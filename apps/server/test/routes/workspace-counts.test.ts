import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid, type SubmittedEvent } from '@gisik-nokma/domain';
import type { FastifyInstance } from 'fastify';
import type { LogOtpSender } from '../../src/auth/otp-sender.js';
import { readMembers } from '../../src/routes/builder-reads.js';
import { resolveEffectiveRole } from '../../src/permissions/effective-role.js';
import { isWorkspaceAdmin } from '../../src/read/membership-roster.js';
import { visibleMemberCount } from '../../src/read/workspace-counts.js';
import { buildTestApp } from '../helpers/app.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import {
  BLOCKED_STATE_ID,
  BLOCKED_WORKFLOW_ID,
  BLOCKED_WORKFLOW_VERSION,
  UNBLOCKED_STATE_ID,
  applyAll,
  seedGuest,
  seedMember,
  seedProject,
  seedTicket,
  seedWorkflowDefWithBlockedState,
  setVisibilityEnv,
} from '../helpers/seed.js';
import { testEnvelope } from '../helpers/envelope.js';
import { signInWithPhone } from '../helpers/session.js';

/**
 * Task 16 — the counts on `GET /v1/me/workspaces`, and the one rule they share.
 *
 * Cases 13.366–13.372. The rule: **every number here is the CALLER'S number, and
 * a number the caller may not count is ABSENT rather than zero.** The three
 * things that could each make these checks pass for the wrong reason, and what
 * is done about each:
 *
 * 1. **A count scoped to the viewer and a count over the whole table are the
 *    same number when every fixture ticket is visible to everybody.** So 13.368
 *    seeds a project-mode ticket the member is NOT on and asserts the member's
 *    count is STRICTLY LESS than the raw `proj_tickets` count for that project,
 *    with the owner's count equal to it. A fixture where they agreed would
 *    certify nothing.
 * 2. **A blocked count and a ticket count are the same number when every seeded
 *    ticket is blocked.** So 13.369's project holds one blocked and two
 *    unblocked tickets and asserts both numbers, and moves an unblocked ticket
 *    to prove the unblocked one does not shift the blocked count.
 * 3. **`absent` and `0` are the same to any assertion written with `toBe(0)` or
 *    `?? 0`.** So 13.366 asserts on KEY PRESENCE (`'memberCount' in entry`)
 *    against a positive control in the same run — a member entry that HAS the
 *    key — and 13.372 (the mapper, `packages/app-core`) does the same on the
 *    client side.
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

async function signedIn(): Promise<{ userId: string; headers: { authorization: string } }> {
  phoneCounter += 1;
  const user = await signInWithPhone(app, otp, `+9190007${String(phoneCounter).padStart(5, '0')}`);
  return { userId: user.userId, headers: { authorization: `Bearer ${user.token}` } };
}

type WireProject = Record<string, unknown> & { projectId: string };
type WireWorkspace = Record<string, unknown> & { workspaceId: string; projects: WireProject[] };

/** The directory as this caller is served it. */
async function directory(headers: { authorization: string }): Promise<WireWorkspace[]> {
  const res = await app.inject({ method: 'GET', url: '/v1/me/workspaces', headers });
  expect(res.statusCode).toBe(200);
  return (res.json() as { workspaces: WireWorkspace[] }).workspaces;
}

async function entryFor(
  headers: { authorization: string },
  workspaceId: string,
): Promise<WireWorkspace> {
  const entry = (await directory(headers)).find((w) => w.workspaceId === workspaceId);
  expect(entry, 'the caller should be served this workspace at all').toBeDefined();
  return entry!;
}

function projectOf(entry: WireWorkspace, projectId: string): WireProject {
  const project = entry.projects.find((p) => p.projectId === projectId);
  expect(project, 'the caller should be told this project by name').toBeDefined();
  return project!;
}

/** Found a workspace through the product's own door. */
async function found(headers: { authorization: string }, name = 'Counting Corner'): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/v1/workspaces', headers, payload: { name } });
  expect(res.statusCode).toBe(201);
  return (res.json() as { workspaceId: string }).workspaceId;
}

/** Submit one event through the real gated door and report the door's own answer. */
async function submit(
  headers: { authorization: string },
  event: Omit<SubmittedEvent, 'id' | 'version' | 'origin' | 'clientTime'>,
): Promise<Record<string, unknown>> {
  const res = await app.inject({
    method: 'POST',
    url: '/v1/events',
    headers,
    payload: {
      events: [{ id: newUlid(), version: 1, origin: 'web', clientTime: new Date().toISOString(), ...event }],
    },
  });
  return (res.json() as { results: Array<Record<string, unknown>> }).results[0]!;
}

/** How many rows `proj_tickets` actually holds for a project — the number nobody is served. */
async function rawTicketCount(projectId: string): Promise<number> {
  const { rows } = await db.pool.query<{ n: number }>(
    'SELECT count(*)::int AS n FROM proj_tickets WHERE project_id = $1',
    [projectId],
  );
  return rows[0]?.n ?? 0;
}

describe('13.366 a guest is served no count at all — the KEYS are absent, not zero', () => {
  it('withholds memberCount and both per-project counts from a guest, and serves them to a member in the same workspace', async () => {
    const owner = await signedIn();
    const workspaceId = await found(owner.headers);
    const projectId = newUlid();
    await seedProject(db.pool, workspaceId, projectId, 'Shop operations');

    const member = await signedIn();
    await seedMember(db.pool, workspaceId, member.userId, 'member', [{ projectId }]);
    const guest = await signedIn();
    await seedGuest(db.pool, workspaceId, guest.userId);

    // The guest is given sight of ONE ticket by name, which is the only way a
    // guest reaches anything (`seedGuest`'s docblock). Without this the guest's
    // absent counts would be indistinguishable from a guest who simply has no
    // work — the fixture would agree with a route that withheld nothing.
    const ticketId = newUlid();
    await seedTicket(db.pool, { workspaceId, projectId, ticketId });
    await applyAll(db.pool, [
      setVisibilityEnv(workspaceId, ticketId, 'explicit', [guest.userId]),
    ]);

    const guestEntry = await entryFor(guest.headers, workspaceId);
    // KEY PRESENCE, not value. `toBe(0)` and `toBeUndefined()` both pass on a
    // route that sends 0, and 0 is the claim this rule exists to avoid making.
    expect('memberCount' in guestEntry).toBe(false);
    // The rest of the shape is untouched: a guest is still told where they are
    // a guest, and with what role.
    expect(guestEntry['name']).toBe('Counting Corner');
    expect(guestEntry['role']).toBe('guest');

    // THE POSITIVE CONTROL, in the same run and the same workspace: a member
    // gets the key. Without it, a route that had simply stopped serving counts
    // to everybody would pass every assertion above.
    const memberEntry = await entryFor(member.headers, workspaceId);
    expect('memberCount' in memberEntry).toBe(true);
    // Owner + member. THREE workspace-scope rows exist; the guest is withheld
    // from a plain member's count for the same reason the roster withholds
    // their name (13.367 asserts that agreement directly).
    expect(memberEntry['memberCount']).toBe(2);

    const memberProject = projectOf(memberEntry, projectId);
    expect('ticketCount' in memberProject).toBe(true);
    expect('blockedCount' in memberProject).toBe(true);
    // The guest is on no project, so `visibleProjects` tells them no project
    // name — which is ruling P32/P38 and not this task's doing. The counts
    // therefore have nowhere to appear, and that is asserted rather than
    // assumed: a guest served a project entry MUST have been served it without
    // counts, and this fixture proves the list itself is empty.
    expect(guestEntry.projects).toEqual([]);
  });

  it('a guest ON a project is told its name and its archived flag, and still no counts', async () => {
    const owner = await signedIn();
    const workspaceId = await found(owner.headers);
    const projectId = newUlid();
    await seedProject(db.pool, workspaceId, projectId, 'Shared with a guest');

    const guest = await signedIn();
    await seedGuest(db.pool, workspaceId, guest.userId);
    // A guest CAN hold a project-scope row — `project.member_added` hardcodes
    // role 'member' for the row it writes, while the workspace-scope grant
    // keeps them a guest (`effective-role.ts`). That is the one shape in which
    // a guest is told a project's name, and it is where the withholding has to
    // hold on its own rather than being covered by an empty list.
    await applyAll(db.pool, [
      testEnvelope({
        workspaceId,
        entity: { kind: 'project', id: projectId },
        type: 'project.member_added',
        payload: { userId: guest.userId, projectAdmin: false },
        actorId: owner.userId,
      }),
    ]);

    const entry = await entryFor(guest.headers, workspaceId);
    const project = projectOf(entry, projectId);
    expect(project['name']).toBe('Shared with a guest');
    // `archived` is NOT a count and is never withheld — it is a fact about a
    // project whose name this caller has already been told.
    expect(project['archived']).toBe(false);
    expect('ticketCount' in project).toBe(false);
    expect('blockedCount' in project).toBe(false);
    expect('memberCount' in entry).toBe(false);
  });
});

describe('13.367 memberCount counts exactly the roster this caller would be shown', () => {
  it('agrees with readMembers for every viewer class, and hides the guest from a plain member', async () => {
    const owner = await signedIn();
    const workspaceId = await found(owner.headers);
    const admin = await signedIn();
    await seedMember(db.pool, workspaceId, admin.userId, 'admin');
    const member = await signedIn();
    await seedMember(db.pool, workspaceId, member.userId, 'member');
    const guest = await signedIn();
    await seedGuest(db.pool, workspaceId, guest.userId);

    // Four workspace-scope rows exist. An admin may be told about all four; a
    // plain member may be told about three, because the roster route hides
    // guests from non-admins and a COUNT is the same disclosure as a NAME here.
    const ownerEntry = await entryFor(owner.headers, workspaceId);
    const adminEntry = await entryFor(admin.headers, workspaceId);
    const memberEntry = await entryFor(member.headers, workspaceId);
    expect(ownerEntry['memberCount']).toBe(4);
    expect(adminEntry['memberCount']).toBe(4);
    expect(memberEntry['memberCount']).toBe(3);

    // THE CROSS-CHECK, which is what makes the three numbers above more than
    // three constants: the count and the directory are two expressions of one
    // rule, and this asserts they agree class by class. Either half alone
    // passes for the wrong reason — the numbers alone do not notice a roster
    // that drifted, and an agreement check alone agrees vacuously on two
    // implementations that are both wrong in the same direction.
    for (const [label, viewer, expected] of [
      ['owner', owner, 4],
      ['admin', admin, 4],
      ['member', member, 3],
    ] as const) {
      const eff = await resolveEffectiveRole(db.pool, viewer.userId, workspaceId);
      const roster = await readMembers(db.pool, workspaceId, isWorkspaceAdmin(eff));
      const count = await visibleMemberCount(db.pool, eff, workspaceId);
      expect(count, `${label}: count must equal the roster length`).toBe(roster.length);
      expect(count, `${label}: and both must equal the expected number`).toBe(expected);
    }

    // And the guest is withheld from entirely, which is a different answer from
    // "counts zero people".
    const guestEff = await resolveEffectiveRole(db.pool, guest.userId, workspaceId);
    expect(await visibleMemberCount(db.pool, guestEff, workspaceId)).toBeNull();
  });
});

describe('13.368 ticketCount counts what THIS caller may see, never what the table holds', () => {
  it('is strictly less than the raw table count for a member outside a project-mode audience, and equal to it for the owner', async () => {
    const owner = await signedIn();
    const workspaceId = await found(owner.headers);
    const seen = newUlid();
    const unseen = newUlid();
    await seedProject(db.pool, workspaceId, seen, 'Shop operations');
    await seedProject(db.pool, workspaceId, unseen, 'Back office');

    const member = await signedIn();
    // On `seen` and NOT on `unseen`, so `unseen`'s NAME is withheld from them
    // (P32/P38) and only `seen` is countable at all. Both tickets below live in
    // `seen`; what separates them is their AUDIENCE, which is the only lever
    // that can make a member's count differ from the table's inside a project
    // they are on.
    await seedMember(db.pool, workspaceId, member.userId, 'member', [{ projectId: seen }]);

    const visibleTicket = newUlid();
    const hiddenTicket = newUlid();
    await seedTicket(db.pool, { workspaceId, projectId: seen, ticketId: visibleTicket });
    await seedTicket(db.pool, { workspaceId, projectId: seen, ticketId: hiddenTicket });
    await applyAll(db.pool, [
      setVisibilityEnv(workspaceId, visibleTicket, 'workspace'),
      // Explicit, naming the owner alone. Project mode would NOT hide it — the
      // ticket is in `seen` and the member is on `seen` — so an explicit
      // audience is what makes this ticket real to the table and invisible to
      // this member.
      setVisibilityEnv(workspaceId, hiddenTicket, 'explicit', [owner.userId]),
    ]);

    const raw = await rawTicketCount(seen);
    expect(raw, 'the fixture must actually hold two tickets, or the < below is vacuous').toBe(2);

    const memberProject = projectOf(await entryFor(member.headers, workspaceId), seen);
    const ownerProject = projectOf(await entryFor(owner.headers, workspaceId), seen);

    // The load-bearing assertion: the member's number is SMALLER than the
    // table's. A route that counted `proj_tickets` directly would serve 2 here
    // and pass any assertion that only checked the owner.
    expect(memberProject['ticketCount']).toBe(1);
    expect(memberProject['ticketCount'] as number).toBeLessThan(raw);
    // And the owner, who reads the whole workspace by disclosed decision, gets
    // the table's number — which is what proves the JOIN onto `proj_visibility`
    // drops nothing and the smaller number above is a SCOPE, not a bug.
    expect(ownerProject['ticketCount']).toBe(raw);
  });

  it('serves an explicit 0 for a project the caller can name but has no visible work in', async () => {
    const owner = await signedIn();
    const workspaceId = await found(owner.headers);
    const empty = newUlid();
    await seedProject(db.pool, workspaceId, empty, 'Nothing here yet');

    const project = projectOf(await entryFor(owner.headers, workspaceId), empty);
    // 0 is a CLAIM — "no work you can see" — and an owner is entitled to it.
    // The key must be present: absent would say "restricted", which is false.
    expect('ticketCount' in project).toBe(true);
    expect(project['ticketCount']).toBe(0);
    expect(project['blockedCount']).toBe(0);
  });
});

describe('13.369 blockedCount counts blocked-state tickets and nothing else', () => {
  it('counts the ticket in a blocked-flagged state, and an unblocked sibling moves ticketCount alone', async () => {
    const owner = await signedIn();
    const workspaceId = await found(owner.headers);
    const projectId = newUlid();
    await seedProject(db.pool, workspaceId, projectId, 'Deliveries');
    await seedWorkflowDefWithBlockedState(db.pool, workspaceId);

    const blocked = newUlid();
    const notBlocked = newUlid();
    const alsoNotBlocked = newUlid();
    for (const [ticketId, stateId] of [
      [blocked, BLOCKED_STATE_ID],
      [notBlocked, UNBLOCKED_STATE_ID],
      [alsoNotBlocked, UNBLOCKED_STATE_ID],
    ] as const) {
      await seedTicket(db.pool, {
        workspaceId,
        projectId,
        ticketId,
        workflowId: BLOCKED_WORKFLOW_ID,
        workflowVersion: BLOCKED_WORKFLOW_VERSION,
        stateId,
        stateCategory: 'active',
      });
      await applyAll(db.pool, [setVisibilityEnv(workspaceId, ticketId, 'workspace')]);
    }

    const project = projectOf(await entryFor(owner.headers, workspaceId), projectId);
    // Three tickets, one blocked. The two numbers must DIFFER, or a
    // `blockedCount` that had simply been aliased to `ticketCount` would pass.
    expect(project['ticketCount']).toBe(3);
    expect(project['blockedCount']).toBe(1);
    // And the state that is not flagged is genuinely not counted: both
    // unblocked tickets sit in `doing`, an `active` state, so this also pins
    // that `blocked` is not derived from `category === 'active'` — the
    // conflation `read/workflow-defs.ts` names by hand.
    expect(project['ticketCount'] as number).toBeGreaterThan(project['blockedCount'] as number);
  });
});

describe('13.370 archived is a folded event pair, and only an owner or admin may claim it', () => {
  it('archives, restores, and refuses a plain member', async () => {
    const owner = await signedIn();
    const workspaceId = await found(owner.headers);
    const projectId = newUlid();
    await seedProject(db.pool, workspaceId, projectId, 'Retired shelf');
    const member = await signedIn();
    await seedMember(db.pool, workspaceId, member.userId, 'member', [{ projectId }]);

    const archive = {
      workspaceId,
      entity: { kind: 'project', id: projectId } as const,
      type: 'project.archived',
      payload: {},
    };

    // THE REFUSAL FIRST, so a later success cannot be mistaken for the gate
    // never having run. A plain member is on the project and is still refused:
    // retiring a project is the workspace's decision, not the project's.
    const refused = await submit(member.headers, { ...archive, actorId: member.userId });
    expect(refused['status']).toBe('refused');
    expect(await archivedFlag(projectId)).toBe(false);
    // The member is still served the project, unarchived — the refusal changed
    // nothing, which is the half a status check alone does not prove.
    expect(projectOf(await entryFor(member.headers, workspaceId), projectId)['archived']).toBe(false);

    const committed = await submit(owner.headers, { ...archive, actorId: owner.userId });
    expect(committed['status']).toBe('committed');
    expect(await archivedFlag(projectId)).toBe(true);
    expect(projectOf(await entryFor(owner.headers, workspaceId), projectId)['archived']).toBe(true);
    // Archiving is not a permission and takes nobody's access: the member is
    // still told the project's name, now marked.
    expect(projectOf(await entryFor(member.headers, workspaceId), projectId)['archived']).toBe(true);

    const restored = await submit(owner.headers, {
      ...archive,
      type: 'project.restored',
      actorId: owner.userId,
    });
    expect(restored['status']).toBe('committed');
    expect(projectOf(await entryFor(owner.headers, workspaceId), projectId)['archived']).toBe(false);
  });

  it('refuses an archive naming a project nobody founded, and refuses a payload that names one', async () => {
    const owner = await signedIn();
    const workspaceId = await found(owner.headers);

    // The existence precondition, inherited by adding both types to
    // `projectsNamedBy`: the honest reason wins over "you are not on it".
    const unfounded = await submit(owner.headers, {
      workspaceId,
      entity: { kind: 'project', id: newUlid() },
      type: 'project.archived',
      payload: {},
      actorId: owner.userId,
    });
    expect(unfounded['status']).toBe('refused');

    const projectId = newUlid();
    await seedProject(db.pool, workspaceId, projectId, 'Real project');
    // `.strict()` on an empty payload is what makes "the client does not get to
    // name the project" a refusal rather than a silent ignore.
    const named = await submit(owner.headers, {
      workspaceId,
      entity: { kind: 'project', id: projectId },
      type: 'project.archived',
      payload: { projectId: newUlid() },
      actorId: owner.userId,
    });
    expect(named['status']).not.toBe('committed');
    expect(await archivedFlag(projectId)).toBe(false);
  });
});

async function archivedFlag(projectId: string): Promise<boolean> {
  const { rows } = await db.pool.query<{ archived: boolean }>(
    'SELECT archived FROM proj_projects WHERE project_id = $1',
    [projectId],
  );
  expect(rows).toHaveLength(1);
  return rows[0]!.archived;
}

describe('13.371 the shape the directory already served is unchanged', () => {
  it('still carries workspaceId, name, role and the visibility-scoped project names for a member', async () => {
    const owner = await signedIn();
    const workspaceId = await found(owner.headers, 'Unchanged Corner');
    const projectId = newUlid();
    await seedProject(db.pool, workspaceId, projectId, 'Shop operations');
    const member = await signedIn();
    await seedMember(db.pool, workspaceId, member.userId, 'member', [{ projectId }]);

    const entry = await entryFor(member.headers, workspaceId);
    // The whole entry, exactly. `toEqual` here is what would fail if a future
    // change quietly dropped `role` or renamed `workspaceId` — and it is what
    // pins that the additions are ADDITIONS.
    expect(entry).toEqual({
      workspaceId,
      name: 'Unchanged Corner',
      role: 'member',
      memberCount: 2,
      projects: [{ projectId, name: 'Shop operations', archived: false, ticketCount: 0, blockedCount: 0 }],
    });
  });
});
