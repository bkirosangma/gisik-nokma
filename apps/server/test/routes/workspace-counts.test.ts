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
    // On `seen` by roster and NOT on `unseen` (amended 2026-09-29, rule A: they
    // are on it by the rule, so its name is served too — this case reads only
    // `seen`). Both tickets below live in `seen`; what separates them is their AUDIENCE, which is the only lever
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

  it("does not count another workspace's ticket that carries this project's id", async () => {
    // THE CASE THE TENANCY CLAUSE DID NOT HAVE. A reviewer mutated
    // `v.workspace_id = $n` away and all nine cases stayed green: the route only
    // reads `counts.get()` for ids `visibleProjects` returned, and `project_id`
    // is a global primary key, so no client-door world can tell the difference.
    //
    // The world that CAN is the one the internal door allows. No existence check
    // runs there (`verify-projections.test.ts` seeds tickets naming a project
    // with no row for exactly that reason), so a ticket committed under
    // workspace B can carry workspace A's `project_id` — and without the
    // tenancy clause, A's owner counts it. `visible-where.ts` says a tenancy
    // note deserves "a case that dies if this one stops being true"; this is it.
    const owner = await signedIn();
    const workspaceA = await found(owner.headers, 'Workspace A');
    const projectId = newUlid();
    await seedProject(db.pool, workspaceA, projectId, 'Shop operations');
    const mine = newUlid();
    await seedTicket(db.pool, { workspaceId: workspaceA, projectId, ticketId: mine });
    await applyAll(db.pool, [setVisibilityEnv(workspaceA, mine, 'workspace')]);

    const stranger = await signedIn();
    const workspaceB = await found(stranger.headers, 'Workspace B');
    const theirs = newUlid();
    // Workspace B's ticket, wearing workspace A's project id. `seedTicket`
    // writes the `proj_tickets` and `proj_visibility` rows with
    // `workspace_id = B` and `project_id = A's`, which is precisely the shape
    // the internal door cannot refuse.
    await seedTicket(db.pool, { workspaceId: workspaceB, projectId, ticketId: theirs });
    await applyAll(db.pool, [setVisibilityEnv(workspaceB, theirs, 'workspace')]);

    // The raw table holds TWO rows for this project id; A's owner must count
    // one. Asserted with the raw count in the same case so the `1` cannot be
    // read as "the fixture only made one".
    expect(await rawTicketCount(projectId)).toBe(2);
    const project = projectOf(await entryFor(owner.headers, workspaceA), projectId);
    expect(project['ticketCount']).toBe(1);
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
    // The RULE, not only the status: a refusal for some other reason —
    // `project.unknown`, an actor mismatch — would satisfy `status: 'refused'`
    // while proving nothing about the admin gate this case is named for.
    expect(refused['status']).toBe('refused');
    expect(refused['rule']).toBe('permission.role');
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
    // Named, because "the project does not exist" is the honest reason and
    // `permission.role` here would mean the ordering broke — the owner IS an
    // admin, so the only way a role refusal fires is if the existence check
    // stopped running first.
    expect(unfounded['rule']).toBe('project.unknown');

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
    expect(named['status']).toBe('invalid');
    expect(await archivedFlag(projectId)).toBe(false);
    // **MUTATING `.strict()` IN `packages/domain/src` PROVES NOTHING HERE.**
    // `@gisik-nokma/domain` exports `./dist/index.js` and this package has no
    // src alias, so the server under test loads the BUILT artifact: the edit
    // has to land in `dist` (or the package be rebuilt) or the mutation is a
    // null one that reports green. Measured on this very case — src edit: 9/9
    // green; the same edit in `dist`: this case red, alone.
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
      // The ticket key (2026-09-20). DERIVED — `found()` enters no prefix — so
      // 'Unchanged Corner' initials to `UC`. Asserted inside the exact
      // `toEqual` for the reason the comment below gives about `description`:
      // a new field on this route must be impossible to add by accident.
      prefix: 'UC',
      role: 'member',
      // Trash series, Plan 1 Task 5 (spec T8): served for every caller told
      // about this workspace at all, never a withholding.
      archived: false,
      memberCount: 2,
      // Task 18. Zero here for the reason 13.382 measures at length: this
      // member is on the only project seeded, so there is nothing they hold the
      // id of and may not name.
      nameRestrictedProjectCount: 0,
      // `description: null` joined this exact shape with door A (2026-09-19),
      // and the EDIT IS THE POINT: `toEqual` here is what makes a new field on
      // this route impossible to add by accident, so a reader arriving after a
      // red test finds the change named rather than guessed. `null` because
      // `seedProject` above founded this project without one — and it is an
      // always-present key rather than an omitted one, which 13.981 pins.
      projects: [
        {
          projectId,
          name: 'Shop operations',
          // Also derived, from the project's own name, at the resolved end of
          // the stored-or-derived fork (`read/visible-projects.ts`).
          prefix: 'SO',
          archived: false,
          description: null,
          ticketCount: 0,
          blockedCount: 0,
        },
      ],
    });
  });
});

/**
 * 13.382 — Task 18's `nameRestrictedProjectCount`, the owner's OPTION 2.
 *
 * Owner, 2026-09-09, verbatim: *"go with 2: Count only projects the guest
 * already has sight into."* Three things could each make a check of this number
 * pass while the wrong number is served, and each has its own assertion here:
 *
 * 1. **Option 2 and option 3 agree whenever every project in the fixture is
 *    ticket-visible to the caller.** A workspace with one nameable and one
 *    unnameable project gives `1` under BOTH rules, so a fixture like that
 *    certifies nothing. `dark` exists for this: a third project the caller can
 *    neither name nor see a ticket in. Option 2 counts 1, option 3 counts 2.
 * 2. **A guest guard copied from the two counts beside it withholds this one**,
 *    and every member-only fixture stays green while the number is missing from
 *    the exact card the owner's reference draws it on. So the guest is asserted
 *    here, in the same workspace, with a positive value.
 * 3. **The tenancy clause is observable at THIS door**, unlike
 *    `visibleProjectCounts`' (whose own note records its mutation surviving,
 *    because the route reads that map only for ids `visibleProjects` returned).
 *    This count is over exactly the ids `visibleProjects` did NOT return, so a
 *    foreign workspace-mode ticket lands straight in it. The second `it` seeds
 *    another workspace and asserts the number does not move.
 */
describe('13.382 nameRestrictedProjectCount counts what the caller already holds, never the workspace', () => {
  /**
   * AMENDED 2026-09-29, owner ruling (A): an admin/member is on every founded
   * project, so every project is NAMEABLE to them and the number is 0 for both —
   * the member half below pins that. The only viewer with something unnameable
   * to count is a GUEST, so the option-2-versus-option-3 discriminator (`dark`)
   * now lives on the guest: a guest on `named` alone, shared one ticket in
   * `derivable` and none in `dark`, counts 1 under option 2 and 2 under option 3.
   */
  it('counts a ticket-visible unnameable project and NOT one the caller has no sight into, for a guest — and is 0 for a member (rule A)', async () => {
    const owner = await signedIn();
    const workspaceId = await found(owner.headers);
    const named = newUlid();
    const derivable = newUlid();
    const dark = newUlid();
    await seedProject(db.pool, workspaceId, named, 'Shop operations');
    await seedProject(db.pool, workspaceId, derivable, 'Back office');
    await seedProject(db.pool, workspaceId, dark, 'Nothing you can reach');

    const member = await signedIn();
    // On `named` ONLY by roster — and, under rule A, on all three anyway.
    await seedMember(db.pool, workspaceId, member.userId, 'member', [{ projectId: named }]);
    const guest = await signedIn();
    await seedGuest(db.pool, workspaceId, guest.userId);
    // The guest holds ONE explicit project row, on `named`: the only shape in
    // which a guest is told a project's name (see 13.366's second case).
    await applyAll(db.pool, [
      testEnvelope({
        workspaceId,
        entity: { kind: 'project', id: named },
        type: 'project.member_added',
        payload: { userId: guest.userId, projectAdmin: false },
        actorId: owner.userId,
      }),
    ]);

    const inNamed = newUlid();
    const inDerivable = newUlid();
    const inDark = newUlid();
    await seedTicket(db.pool, { workspaceId, projectId: named, ticketId: inNamed });
    await seedTicket(db.pool, { workspaceId, projectId: derivable, ticketId: inDerivable });
    await seedTicket(db.pool, { workspaceId, projectId: dark, ticketId: inDark });
    await applyAll(db.pool, [
      // Explicit, naming the guest: it makes `named` ticket-visible AND
      // nameable to them, so it must NOT be counted — the subtraction is what
      // removes it.
      setVisibilityEnv(workspaceId, inNamed, 'explicit', [guest.userId]),
      // Explicit, naming the guest, in a project they hold no row on: visible
      // to them, unnameable to them. THE one project option 2 counts.
      setVisibilityEnv(workspaceId, inDerivable, 'explicit', [guest.userId]),
      // Explicit, naming the OWNER alone. `dark` therefore exists, holds work,
      // and is invisible to the guest — the project option 3 would count and
      // option 2 must not.
      setVisibilityEnv(workspaceId, inDark, 'explicit', [owner.userId]),
    ]);

    const guestEntry = await entryFor(guest.headers, workspaceId);
    // The controls, so `1` below is not one number agreeing with itself: the
    // guest is told exactly ONE project name out of three seeded.
    expect(guestEntry.projects.map((p) => p.projectId)).toEqual([named]);
    // OPTION 2 = 1 (`derivable`). OPTION 3 = 2 (`derivable` + `dark`). A
    // mutation replacing the ticket-visible set with every project in the
    // workspace produces 2 and reddens here — which is the refused option
    // measured rather than described.
    expect(guestEntry['nameRestrictedProjectCount']).toBe(1);
    // The two counts beside this one are withheld from a guest; this one is
    // not, and its value is positive so a copied guard cannot hide behind an
    // uninteresting number.
    expect('memberCount' in guestEntry, 'the withheld count is still withheld').toBe(false);
    expect('nameRestrictedProjectCount' in guestEntry, 'and this one is NOT').toBe(true);

    // THE MEMBER, same run, same workspace: rule A names all three projects to
    // them, so there is nothing they hold the id of and may not name.
    const memberEntry = await entryFor(member.headers, workspaceId);
    expect(memberEntry.projects.map((p) => p.projectId).sort()).toEqual([named, derivable, dark].sort());
    expect(memberEntry['nameRestrictedProjectCount']).toBe(0);

    // The owner: every project nameable, so the subtraction empties. Asserted
    // because `0` for an owner is the shape that proves the number is a
    // DIFFERENCE and not a count of unnameable things.
    const ownerEntry = await entryFor(owner.headers, workspaceId);
    expect(ownerEntry.projects).toHaveLength(3);
    expect(ownerEntry['nameRestrictedProjectCount']).toBe(0);
  });

  it('does not count a project in ANOTHER workspace, which is what the tenancy clause is for', async () => {
    const owner = await signedIn();
    const workspaceId = await found(owner.headers, 'Tenancy Corner');
    const named = newUlid();
    const derivable = newUlid();
    await seedProject(db.pool, workspaceId, named, 'Ours, named');
    await seedProject(db.pool, workspaceId, derivable, 'Ours, unnameable');

    // Amended 2026-09-29 (A): the viewer is a GUEST on `named` — a member names
    // both projects now, so the count would be 0 for them whatever the tenancy
    // clause did and the case could not fail.
    const guest = await signedIn();
    await seedGuest(db.pool, workspaceId, guest.userId);
    await applyAll(db.pool, [
      testEnvelope({
        workspaceId,
        entity: { kind: 'project', id: named },
        type: 'project.member_added',
        payload: { userId: guest.userId, projectAdmin: false },
        actorId: owner.userId,
      }),
    ]);

    const ours = newUlid();
    await seedTicket(db.pool, { workspaceId, projectId: derivable, ticketId: ours });
    await applyAll(db.pool, [setVisibilityEnv(workspaceId, ours, 'explicit', [guest.userId])]);

    // A SECOND workspace the guest has no membership in at all, holding an
    // explicit ticket that NAMES them. `visibleTicketsWhere` compiles the
    // guest's branch as `resolved_mode = 'explicit' AND $n = ANY (…)` with NO
    // workspace predicate of its own — that is stated in its docblock — so
    // without this query's own `v.workspace_id = $n` this row matches, its
    // foreign `project_id` is absent from the first workspace's named set, and
    // the count reads 2.
    const stranger = await signedIn();
    const otherWorkspace = await found(stranger.headers, 'Somebody else');
    const otherProject = newUlid();
    await seedProject(db.pool, otherWorkspace, otherProject, 'Not yours');
    const theirs = newUlid();
    await seedTicket(db.pool, { workspaceId: otherWorkspace, projectId: otherProject, ticketId: theirs });
    await applyAll(db.pool, [setVisibilityEnv(otherWorkspace, theirs, 'explicit', [guest.userId])]);

    // The positive control the tenancy assertion needs: the foreign ticket has
    // to be the KIND this guest's predicate matches, or a `1` below would
    // prove only that the fixture was inert. The guest's own predicate is
    // satisfied by `theirs` in every respect except the workspace.
    const { rows } = await db.pool.query<{ n: number }>(
      "SELECT count(*)::int AS n FROM proj_visibility WHERE ticket_id = $1 AND resolved_mode = 'explicit' AND $2 = ANY (resolved_user_ids)",
      [theirs, guest.userId],
    );
    expect(rows[0]?.n, 'the foreign ticket must be explicit and name the guest, or this case is vacuous').toBe(1);

    const entry = await entryFor(guest.headers, workspaceId);
    expect(entry['nameRestrictedProjectCount']).toBe(1);
  });
});

/**
 * 13.981 (door A, 2026-09-19) — a project row on `GET /v1/me/workspaces` states
 * its description, and states it as a KEY THAT IS ALWAYS PRESENT.
 *
 * **This is the half-witnessed-contract case, and it is a test rather than a
 * convention on purpose.** The client's mapper refuses a row whose
 * `description` key is missing (13.983) — but that refusal can only fire
 * against a body some route actually produced, so the route's own obligation
 * needs a witness here. If a future refactor drops the field from this
 * construction site, this case reddens at the route rather than the failure
 * surfacing as a card that quietly says nothing.
 *
 * `null` is the spelling for a project nobody has described, and it is NOT an
 * omission: an omitted key is indistinguishable from a route that never
 * carried the field, which is precisely the confusion that makes a
 * half-witnessed contract invisible.
 */
describe('13.981 a project row states its description as an always-present key', () => {
  it('carries a served description, and carries null rather than omitting the key', async () => {
    const owner = await signedIn();
    const workspaceId = await found(owner.headers, 'Described Corner');
    const described = newUlid();
    const undescribed = newUlid();
    await seedProject(db.pool, workspaceId, described, 'Delivery', 'Sprint work for the rollout');
    await seedProject(db.pool, workspaceId, undescribed, 'Site readiness');

    const entry = await entryFor(owner.headers, workspaceId);
    const withDescription = projectOf(entry, described);
    const withoutDescription = projectOf(entry, undescribed);

    expect(withDescription['description']).toBe('Sprint work for the rollout');

    // THE PROPERTY THIS CASE IS NAMED FOR — presence, asserted with `in` rather
    // than by reading the value, because `toBeNull()` is satisfied by a mapper
    // that never saw the key either.
    expect('description' in withoutDescription).toBe(true);
    expect(withoutDescription['description']).toBeNull();

    // Controls, same run, same body: the described project's row carries the
    // key too, so the presence above is not this project's accident; and the
    // undescribed value is not the empty string, which is the specific wrong
    // spelling the column exists to avoid.
    expect('description' in withDescription).toBe(true);
    expect(withoutDescription['description']).not.toBe('');
  });
});
