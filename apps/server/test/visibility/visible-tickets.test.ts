import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { newUlid } from '@gisik-nokma/domain';
import { canSee } from '../../src/visibility/can-see.js';
import { listVisibleTickets } from '../../src/visibility/visible-tickets.js';
import { applyAll, revokeMember, seedGuest, seedMember, seedTicket, setVisibilityEnv } from '../helpers/seed.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';

/**
 * `listVisibleTickets` is the decision table SAID TWICE — once in
 * `canSeeResolved`, once in SQL. These cases are what stops the two copies
 * drifting, and they are deliberately BOTH kinds of assertion:
 *
 *  - the exact id set each viewer class receives, spelled out; and
 *  - a ticket-by-ticket cross-check against `canSee` for every viewer.
 *
 * Either alone is a check that can pass for the wrong reason. The cross-check
 * alone agrees vacuously wherever both answers are empty — a fixture in which
 * three viewer classes see nothing would "prove" agreement while asserting
 * nothing about the table. The explicit sets alone would not notice a `canSee`
 * that had drifted away from the SQL.
 */

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
});

afterAll(async () => {
  await db.drop();
});

beforeEach(async () => {
  await db.pool.query('TRUNCATE proj_visibility');
  await db.pool.query('TRUNCATE proj_memberships');
});

async function listedIds(userId: string, workspaceId: string): Promise<string[]> {
  const rows = await listVisibleTickets(db.pool, userId, workspaceId);
  return rows.map((r) => r['ticket_id'] as string).sort();
}

describe('listVisibleTickets — server-side filtering, one SQL pass', () => {
  /**
   * 6.40 — an owner on NO project and NO explicit list still receives every ticket, from the bypass alone — and the SQL and `canSee` agree ticket by ticket rather than only in aggregate.
   */
  it('every viewer class gets exactly its slice, and canSee agrees ticket by ticket', async () => {
    const ws = newUlid();
    const prj1 = newUlid();
    const prj2 = newUlid();

    const outsider = newUlid();
    const guest = newUlid();
    const memberOn1 = newUlid();
    const memberOn2 = newUlid();
    const admin = newUlid();
    const owner = newUlid();
    const revoked = newUlid();

    await seedMember(db.pool, ws, memberOn1, 'member', [{ projectId: prj1 }]);
    await seedMember(db.pool, ws, memberOn2, 'member', [{ projectId: prj2 }]);
    await seedMember(db.pool, ws, admin, 'admin'); // on no project — no bypass
    await seedMember(db.pool, ws, owner, 'owner'); // on no project — bypass only
    await seedGuest(db.pool, ws, guest);
    // Was on prj1, then put out of the workspace: the project-scope row survives
    // (proj-memberships.ts), and resolveEffectiveRole is what makes it inert.
    await seedMember(db.pool, ws, revoked, 'member', [{ projectId: prj1 }]);
    await revokeMember(db.pool, ws, revoked);

    const tktWs = newUlid();
    const tktP1 = newUlid();
    const tktP2 = newUlid();
    const tktEx = newUlid();

    await seedTicket(db.pool, { workspaceId: ws, projectId: prj1, ticketId: tktWs });
    await applyAll(db.pool, [setVisibilityEnv(ws, tktWs, 'workspace')]);
    await seedTicket(db.pool, { workspaceId: ws, projectId: prj1, ticketId: tktP1 }); // project default
    await seedTicket(db.pool, { workspaceId: ws, projectId: prj2, ticketId: tktP2 }); // project default
    await seedTicket(db.pool, { workspaceId: ws, projectId: prj1, ticketId: tktEx });
    await applyAll(db.pool, [setVisibilityEnv(ws, tktEx, 'explicit', [guest, memberOn2])]);

    const allTickets = [tktWs, tktP1, tktP2, tktEx];
    const sorted = (ids: string[]): string[] => [...ids].sort();

    const expected: ReadonlyArray<readonly [string, string[]]> = [
      [outsider, []],
      [guest, [tktEx]], // guests: explicit only, never the workspace-mode one
      [memberOn1, [tktWs, tktP1]],
      [memberOn2, [tktWs, tktP2, tktEx]],
      [admin, [tktWs]], // no project, not listed: an admin reads what any member would
      [owner, allTickets], // from the bypass alone
      [revoked, []],
    ];

    for (const [userId, ids] of expected) {
      expect(await listedIds(userId, ws)).toEqual(sorted(ids));
    }

    // The drift alarm: the SQL and the pure function must agree on every
    // (viewer, ticket) pair, not merely on the two the plan happened to name.
    for (const [userId] of expected) {
      const listed = new Set(await listedIds(userId, ws));
      for (const ticketId of allTickets) {
        expect({ userId, ticketId, listed: listed.has(ticketId) }).toEqual({
          userId,
          ticketId,
          listed: await canSee(db.pool, userId, ticketId),
        });
      }
    }

    // …and the fixture is not one where everybody sees nothing: three of the
    // seven classes receive a non-empty, non-identical slice, so the agreement
    // above is agreement about something.
    expect(sorted(await listedIds(memberOn1, ws))).not.toEqual(sorted(await listedIds(memberOn2, ws)));
    expect((await listedIds(owner, ws)).length).toBe(4);
  });

  it('the list is scoped to ONE workspace — an owner of two sees each one separately', async () => {
    const wsA = newUlid();
    const wsB = newUlid();
    const prj = newUlid();
    const owner = newUlid();
    const tktA = newUlid();
    const tktB = newUlid();

    await seedMember(db.pool, wsA, owner, 'owner');
    await seedMember(db.pool, wsB, owner, 'owner');
    await seedTicket(db.pool, { workspaceId: wsA, projectId: prj, ticketId: tktA });
    await seedTicket(db.pool, { workspaceId: wsB, projectId: prj, ticketId: tktB });

    expect(await listedIds(owner, wsA)).toEqual([tktA]);
    expect(await listedIds(owner, wsB)).toEqual([tktB]);
  });

  it('a member of one workspace lists nothing from another, though the project ids match', async () => {
    // The same project id in both workspaces: without the workspace clause the
    // project predicate alone would admit the neighbour's ticket.
    const wsMine = newUlid();
    const wsTheirs = newUlid();
    const prj = newUlid();
    const user = newUlid();
    const mine = newUlid();
    const theirs = newUlid();

    await seedMember(db.pool, wsMine, user, 'member', [{ projectId: prj }]);
    await seedTicket(db.pool, { workspaceId: wsMine, projectId: prj, ticketId: mine });
    await seedTicket(db.pool, { workspaceId: wsTheirs, projectId: prj, ticketId: theirs });

    expect(await listedIds(user, wsMine)).toEqual([mine]);
    expect(await listedIds(user, wsTheirs)).toEqual([]);
    expect(await canSee(db.pool, user, theirs)).toBe(false);
  });

  it('a guest lists explicit tickets only, and inherits one from an explicit ancestor like anyone else', async () => {
    const ws = newUlid();
    const prj = newUlid();
    const guest = newUlid();
    const parent = newUlid();
    const child = newUlid();
    const unrelated = newUlid();

    await seedGuest(db.pool, ws, guest);
    await seedTicket(db.pool, { workspaceId: ws, projectId: prj, ticketId: parent });
    await applyAll(db.pool, [setVisibilityEnv(ws, parent, 'explicit', [guest])]);
    await seedTicket(db.pool, { workspaceId: ws, projectId: prj, ticketId: child, parentId: parent });
    await seedTicket(db.pool, { workspaceId: ws, projectId: prj, ticketId: unrelated });
    await applyAll(db.pool, [setVisibilityEnv(ws, unrelated, 'workspace')]);

    // The child never authored an audience; it lists because what it inherited
    // names the guest. The workspace-mode ticket does NOT list — a guest is not
    // "a member with a smaller project set".
    expect(await listedIds(guest, ws)).toEqual([parent, child].sort());
  });
});
