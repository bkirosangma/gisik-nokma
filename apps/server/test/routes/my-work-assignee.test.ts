import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { newUlid } from '@gisik-nokma/domain';
import { resolveEffectiveRole } from '../../src/permissions/effective-role.js';
import { readMyWork } from '../../src/routes/my-work.js';
import { listVisibleTickets } from '../../src/visibility/visible-tickets.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { seedGuest, seedMember, seedProject, seedTicket, seedWorkflowDef } from '../helpers/seed.js';

/**
 * Access plan Task 3, cases 7.277–7.279: My Work under W3 — the assignee's own
 * ticket is theirs to see, and nothing about its project comes with it.
 *
 * `seedWorkflowDef` (`test/helpers/seed.ts:489`) is called because
 * `readMyWork` → `stateNamesFor` reads the workflow the seeded head rows name.
 * If its signature differs from the call below, read it and adapt the call — the
 * assertion is on group ids and `projectNames` only.
 */

let db: TestDatabase;

// A database PER TEST: `proj_workflows` keys its primary key on (workflow_id,
// version) alone, so a second workspace in one database cannot publish `wf-seed@1`
// through `seedWorkflowDef` and `readMyWork` would throw for its tickets.
beforeEach(async () => {
  db = await createTestDatabase();
});

afterEach(async () => {
  await db.drop();
});

async function world() {
  const ws = newUlid();
  const project = newUlid();
  const guest = newUlid();
  const member = newUlid();
  const mine = newUlid();
  const alsoMine = newUlid();
  const sibling = newUlid();
  await seedProject(db.pool, ws, project, 'Registrations');
  await seedGuest(db.pool, ws, guest);
  await seedMember(db.pool, ws, member, 'member');
  await seedTicket(db.pool, { workspaceId: ws, projectId: project, ticketId: mine, assigneeId: guest });
  await seedTicket(db.pool, { workspaceId: ws, projectId: project, ticketId: alsoMine, assigneeId: guest });
  await seedTicket(db.pool, { workspaceId: ws, projectId: project, ticketId: sibling });
  // AFTER the tickets, as `read/visible-projects.test.ts` does: the definition the head rows name.
  await seedWorkflowDef(db.pool, ws);
  return { ws, project, guest, member, mine, alsoMine, sibling };
}

async function myWorkIds(ws: string, viewerId: string): Promise<string[]> {
  const eff = await resolveEffectiveRole(db.pool, viewerId, ws);
  const work = await readMyWork(db.pool, eff, viewerId, ws);
  return [...work.groups.open, ...work.groups.active, ...work.groups.terminal].map((c) => c.ticketId).sort();
}

describe('7.277–7.279 My Work and the assignee', () => {
  it('7.277 a guest’s My Work lists the project-mode ticket assigned to them; CONTROL: not the sibling', async () => {
    const w = await world();
    const ids = await myWorkIds(w.ws, w.guest);
    expect(ids).toEqual([w.mine, w.alsoMine].sort());
    expect(ids).not.toContain(w.sibling);
  });

  it('7.278 reassigning away removes the card at once; CONTROL: the other one stays', async () => {
    const w = await world();
    await db.pool.query('UPDATE proj_tickets SET assignee_id = $2 WHERE ticket_id = $1', [w.mine, w.member]);
    expect(await myWorkIds(w.ws, w.guest)).toEqual([w.alsoMine]);
    // My Work also filters `t.assignee_id = viewer`, so on its own it cannot tell a
    // viewer-keyed assignee arm from one that matches ANY assignee. The SQL twin
    // asked directly can (the mutation `asg.assignee_id IS NOT NULL` survives the
    // My Work line above and dies here).
    const listed = (await listVisibleTickets(db.pool, w.guest, w.ws)).map((row) => row['ticket_id'] as string);
    expect(listed).toEqual([w.alsoMine]);
  });

  it('7.279 no project name reaches a guest assignee; CONTROL: a member assignee gets it', async () => {
    const w = await world();
    const guestEff = await resolveEffectiveRole(db.pool, w.guest, w.ws);
    const guestWork = await readMyWork(db.pool, guestEff, w.guest, w.ws);
    // The card IS there — otherwise the empty name map below would be vacuous.
    expect([...guestWork.groups.open, ...guestWork.groups.active, ...guestWork.groups.terminal].map((c) => c.ticketId)).toContain(w.mine);
    expect(guestWork.projectNames).toEqual({});

    await db.pool.query('UPDATE proj_tickets SET assignee_id = $2 WHERE ticket_id = $1', [w.alsoMine, w.member]);
    const memberEff = await resolveEffectiveRole(db.pool, w.member, w.ws);
    expect((await readMyWork(db.pool, memberEff, w.member, w.ws)).projectNames).toEqual({ [w.project]: 'Registrations' });
  });
});
