import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid } from '@gisik-nokma/domain';
import { resolveEffectiveRole } from '../../src/permissions/effective-role.js';
import { visibleProjects } from '../../src/read/visible-projects.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { applyAll, seedGuest, seedMember, seedProject, seedTicket, setVisibilityEnv } from '../helpers/seed.js';
import { readMyWork } from '../../src/routes/my-work.js';

/**
 * Cases 6.138–6.142. Rulings P32 and P38 — who may be told a project's NAME.
 *
 * ## The excluding fixture IS the test
 *
 * A visibility rule is an EXCLUSION, and an exclusion's blast radius is
 * invisible to a suite built around the included case. Every case below drives
 * a viewer who is in project X and NOT in project Y, and asserts BOTH halves in
 * one run: X comes back, Y does not — neither its name nor its id. Asserting
 * only the absence would pass equally against a door that returned nothing at
 * all, which is the shape this project has been bitten by repeatedly.
 *
 * ## Why Y's absence here is a NAME secret and not an existence one
 *
 * An admin or member outside Y can already hold Y's project id: `TicketCard`
 * carries `projectId` (`read/ticket-cards.ts`) and a workspace-mode ticket in
 * ANY project is visible to them (`can-see.ts`, the `workspace` branch). So this
 * list withholding Y is not pretending Y does not exist — it declines to name
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

  it('6.138 THE EXCLUSION — an ADMIN not in project Y gets neither its name nor its id', async () => {
    const admin = newUlid();
    await seedMember(db.pool, ws, admin, 'admin', [{ projectId: projectX }]);

    // Both directions in one run. Without the first assertion, "Y is absent"
    // would also pass against a door that answered nothing — and `visibleProjects`
    // returning `[]` for every viewer is a perfectly plausible wrong build.
    expect(await namesFor(admin)).toEqual(['Aisles']);
    expect(await idsFor(admin)).toEqual([projectX]);
    expect(await idsFor(admin)).not.toContain(projectY);
  });

  it('6.139 THE EXCLUSION — a MEMBER not in project Y gets neither its name nor its id', async () => {
    // Separately from the admin, because the shipped `canSeeResolved` switch
    // treats `admin` and `member` in one branch and an implementation could
    // easily special-case one of them; a single role would not notice.
    const member = newUlid();
    await seedMember(db.pool, ws, member, 'member', [{ projectId: projectX }]);
    expect(await namesFor(member)).toEqual(['Aisles']);
    expect(await idsFor(member)).not.toContain(projectY);
  });

  it('6.140 a GUEST is served only the projects it holds a membership in', async () => {
    const guest = newUlid();
    await seedGuest(db.pool, ws, guest);
    // A guest with no project membership sees an EMPTY list — a partial
    // workspace, which ruling P32 states is the correct answer rather than a
    // defect. The control is the roles above: they are non-empty in the same
    // file, so `[]` here is a fact about this guest and not about the door.
    expect(await namesFor(guest)).toEqual([]);
  });

  it('6.142 THE SECOND DOOR — a my-work item in an unnamed project carries its ID and no NAME', async () => {
    // P32's rule at the OTHER door, and it is a different code path: the
    // workspaces list omits the project entirely, while a my-work item the
    // viewer CAN see must still appear — with `projectId` and no name. Omitting
    // the item would hide their own assigned work; naming the project would
    // disclose what the list withholds. The map is how those coexist.
    const worker = newUlid();
    await seedMember(db.pool, ws, worker, 'member', [{ projectId: projectX }]);

    // A ticket in Y — which this member is NOT in — made visible to them
    // workspace-wide, so they genuinely can see it. That is what makes the
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
    await applyAll(db.pool, [setVisibilityEnv(ws, ticket, 'workspace')]);

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
