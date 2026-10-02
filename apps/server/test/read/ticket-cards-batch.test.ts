import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { newUlid } from '@gisik-nokma/domain';
import { assembleTicketCards, fetchTicketRows } from '../../src/read/ticket-cards.js';
import { rollupsFor } from '../../src/visibility/rollup.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { legacyRollupFor } from '../helpers/legacy-rollup-for.js';
import {
  applyAll,
  seedGuest,
  seedMember,
  seedProject,
  seedTicket,
  setVisibilityEnv,
} from '../helpers/seed.js';

/**
 * Smoothness T11 (spec D7; audit SM-06) — the N+1 becomes one query per page, and the
 * answer does not move.
 *
 * ## What "does not move" is measured against
 *
 * `legacyRollupFor` (`test/helpers/legacy-rollup-for.ts`) is the pre-T11 `rollupFor`, frozen:
 * one query per parent. This file builds ONE board with every shape the rollup has a rule
 * for (workspace / project / explicit audiences, a terminal child, a category-less child, a
 * soft-deleted child, a child in a deleted project, a cross-workspace child (case 6.84), a
 * child reachable only through the assignee arm, a childless parent) and asks, for each
 * viewer class, what the BATCHED card assembly says about every card against what the frozen
 * per-ticket function says. The comparison is on the JSON text, so a reordered key or an
 * `undefined` where a `0` was fails too.
 *
 * ## A fixture that could have come out differently
 *
 * An equality over a degenerate board passes for any implementation, so the fixture's own
 * variety is asserted first (the control): across the viewer classes the restricted count
 * takes at least four distinct values, and the totals include a terminal and an
 * uncategorized child. If a later edit flattens the board, the control goes red before the
 * equality can pass vacuously.
 */

let db: TestDatabase;
beforeAll(async () => {
  db = await createTestDatabase();
});
afterAll(async () => {
  await db.drop();
});

type Board = {
  ws: string;
  parents: string[];
  leafIds: string[];
  viewers: Record<'owner' | 'member' | 'guestNamed' | 'guestAssignee' | 'outsider', string>;
};

async function seedBoard(): Promise<Board> {
  const ws = newUlid();
  const ws2 = newUlid();
  const p1 = newUlid();
  const p2 = newUlid();
  const gone = newUlid();
  const viewers = {
    owner: newUlid(),
    member: newUlid(),
    guestNamed: newUlid(),
    guestAssignee: newUlid(),
    outsider: newUlid(),
  };
  await seedProject(db.pool, ws, p1);
  await seedProject(db.pool, ws, p2);
  await seedProject(db.pool, ws, gone);
  await seedMember(db.pool, ws, viewers.owner, 'owner');
  await seedMember(db.pool, ws, viewers.member, 'member', [{ projectId: p1 }]);
  await seedGuest(db.pool, ws, viewers.guestNamed);
  await seedGuest(db.pool, ws, viewers.guestAssignee);

  const parentA = newUlid(); // mixed audiences + a terminal + a category-less + a deleted + a cross-workspace child
  const parentB = newUlid(); // all explicit, one assigned to guestAssignee (the arm)
  const parentC = newUlid(); // a nested parent: its own child must not count toward parentA
  const parentD = newUlid(); // childless
  const parentE = newUlid(); // every child in a deleted project
  for (const [id, prj] of [[parentA, p1], [parentB, p1], [parentC, p2], [parentD, p1], [parentE, p1]] as const) {
    await seedTicket(db.pool, { workspaceId: ws, projectId: prj, ticketId: id });
  }
  const leafIds: string[] = [];
  const child = async (
    parent: string,
    projectId: string,
    mode: 'workspace' | 'project' | 'explicit',
    users: string[] = [],
    extra: { stateCategory?: 'open' | 'active' | 'terminal' | null; assigneeId?: string; workspaceId?: string } = {},
  ): Promise<string> => {
    const id = newUlid();
    const childWs = extra.workspaceId ?? ws;
    await seedTicket(db.pool, {
      workspaceId: childWs,
      projectId,
      ticketId: id,
      parentId: parent,
      ...(extra.stateCategory === undefined ? {} : { stateCategory: extra.stateCategory }),
      ...(extra.assigneeId === undefined ? {} : { assigneeId: extra.assigneeId }),
    });
    await applyAll(db.pool, [setVisibilityEnv(childWs, id, mode, mode === 'explicit' ? users : undefined)]);
    leafIds.push(id);
    return id;
  };

  await child(parentA, p1, 'workspace');
  await child(parentA, p1, 'workspace', [], { stateCategory: 'terminal' });
  await child(parentA, p1, 'workspace', [], { stateCategory: null });
  await child(parentA, p2, 'project');
  await child(parentA, p1, 'explicit', [viewers.guestNamed]);
  const deletedChild = await child(parentA, p1, 'workspace');
  await db.pool.query('UPDATE proj_tickets SET deleted_at = now() WHERE ticket_id = $1', [deletedChild]);
  // Case 6.84's shape: a child in another workspace, one only direct SQL can write.
  await seedProject(db.pool, ws2, newUlid());
  await child(parentA, p1, 'workspace', [], { workspaceId: ws2 });

  await child(parentB, p1, 'explicit', [viewers.member]);
  await child(parentB, p1, 'explicit', [viewers.member], { assigneeId: viewers.guestAssignee });
  await child(parentB, p2, 'explicit', [viewers.owner]);

  await child(parentA, p2, 'workspace'); // a second project-level child; parentC's own children below are NOT parentA's
  await child(parentC, p2, 'workspace', [], { stateCategory: 'terminal' });
  await child(parentC, p2, 'project');

  await child(parentE, gone, 'workspace');
  await db.pool.query('UPDATE proj_projects SET deleted_at = now() WHERE project_id = $1', [gone]);

  return { ws, parents: [parentA, parentB, parentC, parentD, parentE], leafIds, viewers };
}

describe('the batched card assembly answers what the per-ticket rollup answers (spec D7; audit SM-06)', () => {
  it('25.190 every card on a mixed board carries the rollup the frozen per-ticket function gives, for every viewer class', async () => {
    const board = await seedBoard();
    const ids = [...board.parents, ...board.leafIds];
    const rows = await fetchTicketRows(db.pool, ids);

    // CONTROL (same it()): the board is not degenerate. Four distinct restricted counts, a
    // terminal child and a category-less child somewhere, a parent with no rollup at all.
    const seen = {
      restricted: new Set<number>(),
      terminal: 0,
      uncategorized: 0,
      nullRollups: 0,
    };
    const classes = Object.entries(board.viewers);
    for (const [, viewer] of classes) {
      for (const parent of board.parents) {
        const view = await legacyRollupFor(db.pool, viewer, parent);
        if (view === null) {
          seen.nullRollups += 1;
          continue;
        }
        seen.restricted.add(view.restrictedCount);
        seen.terminal += view.terminal;
        seen.uncategorized += view.uncategorized;
      }
    }
    expect(seen.restricted.size).toBeGreaterThanOrEqual(4);
    expect(seen.terminal).toBeGreaterThan(0);
    expect(seen.uncategorized).toBeGreaterThan(0);
    expect(seen.nullRollups).toBeGreaterThan(0);

    for (const [name, viewer] of classes) {
      const cards = await assembleTicketCards(db.pool, viewer, rows);
      expect(cards).toHaveLength(rows.length);
      for (const card of cards) {
        const legacy = await legacyRollupFor(db.pool, viewer, card.ticketId);
        const expected =
          legacy === null
            ? null
            : {
                totalChildren: legacy.total,
                terminalChildren: legacy.terminal,
                uncategorizedChildren: legacy.uncategorized,
                restrictedCount: legacy.restrictedCount,
              };
        expect(JSON.stringify(card.rollup), `${name} · ${card.ticketId}`).toBe(JSON.stringify(expected));
      }
    }
  });

  it('25.194 the per-viewer filter still applies per card: one page, two viewers, different restricted counts and the same totals', async () => {
    const board = await seedBoard();
    const rows = await fetchTicketRows(db.pool, board.parents);
    const asOwner = await assembleTicketCards(db.pool, board.viewers.owner, rows);
    const asOutsider = await assembleTicketCards(db.pool, board.viewers.outsider, rows);
    const byId = (cards: typeof asOwner) => new Map(cards.map((c) => [c.ticketId, c.rollup]));
    const owner = byId(asOwner);
    const outsider = byId(asOutsider);
    let differing = 0;
    for (const parent of board.parents) {
      const o = owner.get(parent);
      const x = outsider.get(parent);
      if (o === null || x === null || o === undefined || x === undefined) {
        expect(o, `null for the owner iff null for the outsider (${parent})`).toEqual(x);
        continue;
      }
      expect(x.totalChildren, `the true total is the parent's, not the viewer's (${parent})`).toBe(o.totalChildren);
      // The outsider has no workspace role: every child is restricted from them (case 6.276).
      expect(x.restrictedCount).toBe(x.totalChildren);
      if (x.restrictedCount !== o.restrictedCount) differing += 1;
    }
    // Control: the two viewers really did disagree on at least one card.
    expect(differing).toBeGreaterThan(0);
  });

  it('25.195 the card assembly costs the same number of queries at two parents as at five, and an empty page asks the database nothing', async () => {
    const board = await seedBoard();
    let queries = 0;
    const spy = {
      query: (...args: unknown[]) => {
        queries += 1;
        return (db.pool.query as (...a: unknown[]) => unknown)(...args);
      },
    } as unknown as typeof db.pool;
    const viewer = board.viewers.member;
    const [parentA, parentB] = board.parents as [string, string];

    const small = await fetchTicketRows(db.pool, [parentA, parentB]);
    queries = 0;
    await assembleTicketCards(spy, viewer, small);
    const atTwo = queries;

    const all = await fetchTicketRows(db.pool, board.parents);
    queries = 0;
    await assembleTicketCards(spy, viewer, all);
    const atFive = queries;
    // The rollup is no longer a slope: five cards cost what two cost (the old shape added one
    // query, or more, per card).
    expect(atFive).toBe(atTwo);
    // CONTROL: the count is a real measurement, not a spy that saw nothing, and the member's page
    // reaches the arm query (parent B holds children the member is not admitted to).
    expect(atTwo).toBeGreaterThan(3);

    // An empty page asks the database nothing; a page with one parent does.
    queries = 0;
    expect((await rollupsFor(spy, newUlid(), [])).size).toBe(0);
    expect(queries).toBe(0);
    await rollupsFor(spy, newUlid(), [newUlid()]);
    expect(queries).toBeGreaterThan(0);
  });
});
