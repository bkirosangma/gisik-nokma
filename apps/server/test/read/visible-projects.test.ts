import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid } from '@gisik-nokma/domain';
import { resolveEffectiveRole } from '../../src/permissions/effective-role.js';
import { visibleProjects } from '../../src/read/visible-projects.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { testEnvelope } from '../helpers/envelope.js';
import {
  applyAll,
  seedGuest,
  seedMember,
  seedProject,
  seedTicket,
  seedWorkflowDef,
  setVisibilityEnv,
} from '../helpers/seed.js';
import { readMyWork } from '../../src/routes/my-work.js';

/**
 * A GUEST who holds an explicit project-scope row on one project — the only way
 * a guest is ever "in" a project, and the only viewer that rule A leaves with a
 * project list SHORTER than the workspace's. Written through the real
 * `project.member_added` event, as `seedMember` writes its rosters.
 */
async function seedGuestOnProject(
  pool: import('pg').Pool,
  workspaceId: string,
  userId: string,
  projectId: string,
): Promise<void> {
  await seedGuest(pool, workspaceId, userId);
  await applyAll(pool, [
    testEnvelope({
      workspaceId,
      entity: { kind: 'project', id: projectId },
      type: 'project.member_added',
      payload: { userId, projectAdmin: false },
      actorId: '01J0SEEDADM1N0000000000000',
    }),
  ]);
}

/**
 * Cases 6.138–6.142. Rulings P32 and P38 — who may be told a project's NAME.
 *
 * ## The excluding fixture IS the test
 *
 * A visibility rule is an EXCLUSION, and an exclusion's blast radius is
 * invisible to a suite built around the included case. The exclusion cases
 * drive a viewer who is in project X and NOT in project Y, and assert BOTH
 * halves in one run: X comes back, Y does not — neither its name nor its id.
 *
 * **AMENDED 2026-09-29, owner ruling (A).** An admin or member is on EVERY
 * founded project, so the viewer who is in X and not in Y is now a GUEST holding
 * an explicit row on X (6.140, 6.142); 6.138 and 6.139 pin rule A's answer for
 * the admin and the member — both projects come back. Asserting
 * only the absence would pass equally against a door that returned nothing at
 * all, which is the shape this project has been bitten by repeatedly.
 *
 * ## Why Y's absence here is a NAME secret and not an existence one
 *
 * A guest outside Y can already hold Y's project id: `TicketCard` carries
 * `projectId` (`read/ticket-cards.ts`) and an explicit list can name them on a
 * ticket in Y (`can-see.ts`). So this list withholding Y is not pretending Y
 * does not exist — it declines to name
 * it, which is precisely the distinction P32 drew. That is why the ticket
 * surface is cited here rather than treated as a leak.
 */
describe('6.138-6.142 visibleProjects — a project NAME is a disclosure', () => {
  let db: TestDatabase;
  const ws = newUlid();
  const projectX = newUlid();
  const projectY = newUlid();

  beforeAll(async () => {
    db = await createTestDatabase();
    await seedProject(db.pool, ws, projectX, 'Aisles');
    await seedProject(db.pool, ws, projectY, 'Payroll');
  });

  afterAll(async () => {
    await db.drop();
  });

  async function namesFor(userId: string): Promise<string[]> {
    const eff = await resolveEffectiveRole(db.pool, userId, ws);
    return (await visibleProjects(db.pool, eff, ws)).map((p) => p.name);
  }
  async function idsFor(userId: string): Promise<string[]> {
    const eff = await resolveEffectiveRole(db.pool, userId, ws);
    return (await visibleProjects(db.pool, eff, ws)).map((p) => p.projectId);
  }

  it('6.138 AMENDED (A): an ADMIN off every roster is served every founded project — name and id', async () => {
    // Amended 2026-09-29, owner ruling (A): this case read "an ADMIN not in
    // project Y gets neither its name nor its id". An admin is on every founded
    // project now, so the admin who lists only X on their roster still gets Y.
    // The exclusion this case guarded moved to the guest (6.140).
    const admin = newUlid();
    await seedMember(db.pool, ws, admin, 'admin', [{ projectId: projectX }]);

    expect((await namesFor(admin)).sort()).toEqual(['Aisles', 'Payroll']);
    expect((await idsFor(admin)).sort()).toEqual([projectX, projectY].sort());
  });

  it('6.139 AMENDED (A): a MEMBER off project Y is served Y too — name and id', async () => {
    // Amended 2026-09-29, owner ruling (A). Separately from the admin, because
    // the shipped `canSeeResolved` switch treats `admin` and `member` in one
    // branch and an implementation could easily special-case one of them.
    const member = newUlid();
    await seedMember(db.pool, ws, member, 'member', [{ projectId: projectX }]);
    expect((await namesFor(member)).sort()).toEqual(['Aisles', 'Payroll']);
    expect(await idsFor(member)).toContain(projectY);
    // A member with NO roster rows at all is on every project too (case 6.184).
    const bare = newUlid();
    await seedMember(db.pool, ws, bare, 'member', []);
    expect((await namesFor(bare)).sort()).toEqual(['Aisles', 'Payroll']);
  });

  it('6.140 a GUEST is served only the projects it holds a membership in', async () => {
    const guest = newUlid();
    await seedGuest(db.pool, ws, guest);
    // A guest with no project membership sees an EMPTY list — a partial
    // workspace, which ruling P32 states is the correct answer rather than a
    // defect. The control is the roles above: they are non-empty in the same
    // file, so `[]` here is a fact about this guest and not about the door.
    expect(await namesFor(guest)).toEqual([]);

    // THE EXCLUSION, on the viewer rule A leaves it for (amended 2026-09-29):
    // a guest holding an explicit row on X is served X and NOT Y. Both halves
    // in one run, so an `[]` door cannot pass it.
    const guestOnX = newUlid();
    await seedGuestOnProject(db.pool, ws, guestOnX, projectX);
    expect(await namesFor(guestOnX)).toEqual(['Aisles']);
    expect(await idsFor(guestOnX)).toEqual([projectX]);
    expect(await idsFor(guestOnX)).not.toContain(projectY);
  });

  it('6.142 THE SECOND DOOR — a my-work item in an unnamed project carries its ID and no NAME', async () => {
    // P32's rule at the OTHER door, and it is a different code path: the
    // workspaces list omits the project entirely, while a my-work item the
    // viewer CAN see must still appear — with `projectId` and no name. Omitting
    // the item would hide their own assigned work; naming the project would
    // disclose what the list withholds. The map is how those coexist.
    //
    // AMENDED 2026-09-29, owner ruling (A). The worker was a member on X only,
    // and a member is on every project now, so Y WOULD be named for them. The
    // viewer this case needs — in X, not in Y — is a guest holding an explicit
    // row on X, with Y's ticket shared to them by an explicit list.
    const worker = newUlid();
    await seedGuestOnProject(db.pool, ws, worker, projectX);

    // A ticket in Y — which this guest is NOT in — shared to them by an
    // explicit list, so they genuinely can see it. That is what makes the
    // withheld NAME the only thing at stake here.
    // `seedTicket` seeds BOTH halves of the assignment — the ledger event and
    // the head-row column — because `assembleTicketCards` throws for one
    // without the other and `readMyWork` filters on the column. Seeding one
    // alone reproduces a corrupt store rather than an assigned ticket.
    const ticket = newUlid();
    await seedTicket(db.pool, {
      workspaceId: ws,
      projectId: projectY,
      ticketId: ticket,
      assigneeId: worker,
    });
    // `seedTicket` writes a `proj_tickets` row naming `wf-seed@1` and does not
    // publish that definition; `readMyWork` serves a state NAME now and throws
    // when a ticket names a definition `proj_workflows` does not hold — the same
    // throw `assembleListCards` has always made, and a state the product path
    // cannot reach. So the definition is published here rather than the throw
    // softened: a fallback would put a slug where a name goes.
    await seedWorkflowDef(db.pool, ws);
    await applyAll(db.pool, [setVisibilityEnv(ws, ticket, 'explicit', [worker])]);

    const eff = await resolveEffectiveRole(db.pool, worker, ws);
    const view = await readMyWork(db.pool, eff, worker, ws);
    const cards = [...view.groups.open, ...view.groups.active, ...view.groups.terminal];

    // The item IS there, with its project id — the positive control. Without
    // it, "no name for Y" would pass against a route that dropped the item.
    expect(cards.map((c) => c.ticketId)).toContain(ticket);
    expect(cards.find((c) => c.ticketId === ticket)?.projectId).toBe(projectY);

    // And Y is NOT named. `projectNames` is keyed by project id, so an absent
    // key is the withholding — and the renderer falls back to the id.
    expect(view.projectNames[projectY]).toBeUndefined();
  });

  it('6.141 the OWNER exemption is a TESTED fact, not a switch nobody exercises', async () => {
    // `canSeeResolved` returns `true` for owner unconditionally, and this door
    // follows it. Pinned because an exemption that no case drives is an
    // exemption nobody would notice disappearing — and because it is the one
    // place this rule is NOT `eff.projects`.
    const owner = newUlid();
    await seedMember(db.pool, ws, owner, 'owner', []);
    expect((await namesFor(owner)).sort()).toEqual(['Aisles', 'Payroll']);
  });
});

/**
 * 13.979-13.980 (door A, 2026-09-19) — the project DESCRIPTION this read now
 * carries.
 *
 * **Both cases assert the served half and the withheld half in ONE run.** A
 * description is a new column on a read whose whole job is a disclosure
 * decision, so the interesting question is not "does it arrive" but "does it
 * arrive to the same callers the NAME arrives to, and to no others" — and a
 * fixture containing only the described project cannot answer that.
 */
describe('13.979-13.980 visibleProjects carries a description, scoped as the name is', () => {
  let db: TestDatabase;
  const ws = newUlid();
  const described = newUlid();
  const undescribed = newUlid();

  beforeAll(async () => {
    db = await createTestDatabase();
    await seedProject(db.pool, ws, described, 'Delivery', 'Sprint work for the rollout');
    await seedProject(db.pool, ws, undescribed, 'Site readiness');
  });

  afterAll(async () => {
    await db.drop();
  });

  async function projectsFor(userId: string) {
    const eff = await resolveEffectiveRole(db.pool, userId, ws);
    return visibleProjects(db.pool, eff, ws);
  }

  it('13.979 — a described project carries its prose; an undescribed one carries NULL, not an empty string', async () => {
    const owner = newUlid();
    await seedMember(db.pool, ws, owner, 'owner', []);
    const byId = new Map((await projectsFor(owner)).map((p) => [p.projectId, p]));

    expect(byId.get(described)!.description).toBe('Sprint work for the rollout');
    expect(byId.get(undescribed)!.description).toBeNull();
    // Controls, same run. `toBeNull` alone also passes against a read that
    // stopped selecting the column, so the first line proves the query can
    // return a value at all; the second names the specific wrong value this
    // case exists to catch.
    expect(byId.get(described)!.description).not.toBeNull();
    expect(byId.get(undescribed)!.description).not.toBe('');
  });

  it('13.980 — the description is scoped EXACTLY as the name is: no row, no description', async () => {
    // Amended 2026-09-29, owner ruling (A): a member is on every project, so
    // the viewer with ONE project row and no other is a guest holding an
    // explicit row on `described`.
    const member = newUlid();
    await seedGuest(db.pool, ws, member);
    await applyAll(db.pool, [
      testEnvelope({
        workspaceId: ws,
        entity: { kind: 'project', id: described },
        type: 'project.member_added',
        payload: { userId: member, projectAdmin: false },
        actorId: '01J0SEEDADM1N0000000000000',
      }),
    ]);

    const rows = await projectsFor(member);
    // Both halves in one run: the project they ARE on arrives with its
    // description, and the other project's description is unreachable for the
    // only reason the name is — no row was served at all. Asserting only the
    // absence would pass against a read that returned nothing to anyone.
    expect(rows.map((p) => p.projectId)).toEqual([described]);
    expect(rows[0]!.description).toBe('Sprint work for the rollout');
    expect(rows.some((p) => p.projectId === undescribed)).toBe(false);

    // Rule A's other half, same run: a MEMBER on `described` alone is served
    // BOTH projects, each with its own description.
    const roster = newUlid();
    await seedMember(db.pool, ws, roster, 'member', [{ projectId: described }]);
    const all = new Map((await projectsFor(roster)).map((p) => [p.projectId, p]));
    expect([...all.keys()].sort()).toEqual([described, undescribed].sort());
    expect(all.get(undescribed)!.description).toBeNull();
  });
});
