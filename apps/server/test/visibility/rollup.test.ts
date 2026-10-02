import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { newUlid } from '@gisik-nokma/domain';
import { canSee } from '../../src/visibility/can-see.js';
import { rollupFor, rollupsFor, type RollupView } from '../../src/visibility/rollup.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import {
  applyAll,
  revokeMember,
  seedGuest,
  seedMember,
  seedProject,
  seedTicket,
  setVisibilityEnv,
} from '../helpers/seed.js';

/**
 * Plan 4 Task 10 — rollup honesty.
 *
 * ## The property, and the trap inside it
 *
 * Spec §6: a rollup carries **true totals with the restriction named**. The
 * failure it is defined against is a rollup that shows a viewer only what they
 * can see — which understates the total and makes a parent look complete when
 * it is not.
 *
 * The trap is that **a `restrictedCount` is per-VIEWER and a `total` is not**,
 * and a test that computes both for ONE viewer passes while conflating them. So
 * these cases enumerate VIEWER CLASSES over one shared fixture and assert the
 * pairing: the `total` is IDENTICAL for every class while the `restrictedCount`
 * DIFFERS. Either half alone is decorative — an identical total across viewers
 * is trivially satisfied by a broken constant, and a differing restricted count
 * is satisfied by the viewer-filtered rollup this task exists to refuse.
 *
 * ## The fixture makes the three numbers three different numbers
 *
 * A count that equals a maximum because the fixture is tidy is this project's
 * recorded failure. For the flagship class (a member on one of the two
 * projects) the fixture yields a total of 9 over 7 children they can reach and
 * 2 they cannot — three different numbers, so no two can be swapped without a
 * case noticing. Across the classes the restricted count takes **five distinct
 * values** (0, 1, 2, 8, 9), so a mutation cannot satisfy the suite by moving
 * to any one constant. `total === restricted` for an outsider is the one
 * coincidence the semantics FORCE, which is why the discrimination does not
 * rest on that class.
 *
 * ## Amended 2026-09-29, owner ruling (A)
 *
 * This fixture read "six distinct values (0, 2, 3, 5, 8, 9)" and "9 over 6
 * reachable and 3 not". Both projects are FOUNDED now (`seedFamily` did not found
 * them, so the old table passed under rule A only because the projects did not
 * exist), and an admin/member is on every founded project: a member on A, a
 * member on A and B, a member with no roster row and an admin with no roster row
 * all reach the same seven children and are restricted from the same two
 * explicit ones. The no-see witnesses are the guest (8) and the non-members (9);
 * the class that took the restricted count to 1 is a member NAMED on the second
 * explicit list, which keeps five distinct values.
 *
 * ## `restrictedCount` is cross-checked against `canSee`, child by child
 *
 * A literal expectation alone cannot catch `rollupFor` drifting from the one
 * visibility decision; `canSee` alone can agree with it vacuously about two
 * empty answers. Both together cannot, which is the pairing
 * `listVisibleTickets` is already held to (cases 6.63, 6.65). This REPLACED an
 * earlier `visible + restricted === total` invariant over a counted
 * `visibleCount` field: mutating that counter to `total - restrictedCount` was
 * measured to kill NOTHING in the whole server suite, so the invariant was
 * decoration and the field it defended was removed (case 6.88).
 *
 * ## What is deliberately not here
 *
 * `open` and `active` are still absent from `RollupView` (case 6.82's original
 * reason: nothing reads them). `terminal` and `uncategorized` LANDED with Plan
 * 5 Task 7, which is the first construction site that needed the "5 of 8 done"
 * half, and every expectation here now names all four numbers.
 *
 * **This file used to be unable to exercise `terminal`, and that limitation is
 * now retired rather than restated.** `seedTicket` writes a `proj_tickets` head
 * row (P25 clause 1's change set — a fixture without one seeds a world the
 * ingest transaction cannot produce), so every child now HAS a state category
 * and `uncategorized` is 0 where it used to be the whole total.
 *
 * That repair created a second problem, and the mixed-family case below exists
 * for it: the head row hard-coded `state_category` to `'open'`, which left
 * `terminal` 0 always AND `uncategorized` 0 always — two numbers that cannot
 * vary are two assertions that cannot fail, so rewriting the expectations to
 * match would have made this file LESS falsifiable while reading as if it had
 * become more exact. `seedTicket` therefore takes an optional `stateCategory`
 * (default `'open'`, so no other caller moves), and one fixture drives a
 * terminal child and a category-less child through the same parent.
 *
 * The older note said extending `applyAll` to register `proj_tickets` would
 * change the seeded world of twenty test files and belongs to whoever owns that
 * helper's own recorded cleanup, not to a drive-by here.
 */

let db: TestDatabase;

beforeAll(async () => {
  db = await createTestDatabase();
});

afterAll(async () => {
  await db.drop();
});

beforeEach(async () => {
  // `events` is append-only and refuses TRUNCATE; the projections are
  // rebuildable and do not. Every test also mints its own workspace, so nothing
  // here depends on the truncation having reached a table it forgot.
  await db.pool.query('TRUNCATE proj_visibility');
  await db.pool.query('TRUNCATE proj_memberships');
});

/**
 * The shared honesty fixture: ONE parent, NINE direct children, spread across
 * every resolved mode so that the classes below disagree about them.
 *
 * - 4 × `workspace` — every member, admin and owner; no guest, no outsider.
 * - 2 × `project` on A — every member and admin (rule A), and the owner.
 * - 1 × `project` on B — every member and admin (rule A), and the owner.
 * - 1 × `explicit` naming the guest — the guest and the owner.
 * - 1 × `explicit` naming `namedMember` — that one member and the owner.
 *
 * Nine is not a round number on purpose: with eight, the two classes that swap
 * reached and refused counts would have gone unnoticed.
 */
async function seedFamily(): Promise<{
  ws: string;
  prjA: string;
  prjB: string;
  parent: string;
  guestUser: string;
  namedMember: string;
}> {
  const ws = newUlid();
  const prjA = newUlid();
  const prjB = newUlid();
  const parent = newUlid();
  const guestUser = newUlid();
  const namedMember = newUlid();

  // Both projects are FOUNDED (AMENDED 2026-09-29, owner ruling A). They were
  // bare ULIDs, which production cannot produce, and under rule A an unfounded
  // project puts nobody on it — so every member class below was passing for a
  // reason no rule gave.
  await seedProject(db.pool, ws, prjA);
  await seedProject(db.pool, ws, prjB);
  await seedTicket(db.pool, { workspaceId: ws, projectId: prjA, ticketId: parent });

  const child = async (projectId: string): Promise<string> => {
    const id = newUlid();
    await seedTicket(db.pool, { workspaceId: ws, projectId, ticketId: id, parentId: parent });
    return id;
  };

  const modes: Array<[string, 'workspace' | 'project' | 'explicit', string[]]> = [];
  for (let i = 0; i < 4; i += 1) modes.push([await child(prjA), 'workspace', []]);
  for (let i = 0; i < 2; i += 1) modes.push([await child(prjA), 'project', []]);
  modes.push([await child(prjB), 'project', []]);
  modes.push([await child(prjA), 'explicit', [guestUser]]);
  modes.push([await child(prjA), 'explicit', [namedMember]]);

  await applyAll(
    db.pool,
    modes.map(([id, mode, users]) =>
      setVisibilityEnv(ws, id, mode, mode === 'explicit' ? users : undefined),
    ),
  );

  return { ws, prjA, prjB, parent, guestUser, namedMember };
}

describe('rollupFor — the total is the parent’s, the restriction is the viewer’s', () => {
  /**
   * 6.86 — nine viewer classes (eight until 2026-09-29) over ONE fixture, with the honesty claim asserted as a PAIRING: the `total` is the parent’s and identical for everyone, while `restrictedCount` is per-viewer and differs. Either number alone could be satisfied by a wrong implementation.
   */
  it('every viewer class reports the SAME total over all nine children while the restricted count differs, five distinct values', async () => {
    const { ws, prjA, prjB, parent, guestUser, namedMember } = await seedFamily();

    const owner = newUlid();
    const onA = newUlid();
    const onAB = newUlid();
    const offAll = newUlid();
    const adminOffAll = newUlid();
    const outsider = newUlid();
    const revoked = newUlid();

    await seedMember(db.pool, ws, owner, 'owner');
    await seedMember(db.pool, ws, onA, 'member', [{ projectId: prjA }]);
    await seedMember(db.pool, ws, onAB, 'member', [{ projectId: prjA }, { projectId: prjB }]);
    await seedMember(db.pool, ws, offAll, 'member');
    await seedMember(db.pool, ws, adminOffAll, 'admin');
    await seedMember(db.pool, ws, namedMember, 'member');
    await seedGuest(db.pool, ws, guestUser);
    // A revoked member whose PROJECT-scope row is still standing — the class no
    // mutation would have found on its own, and the one that proves this
    // function reads membership through `resolveEffectiveRole` rather than by
    // joining the roster rows, whose project scope survives a revocation.
    await seedMember(db.pool, ws, revoked, 'member', [{ projectId: prjA }]);
    await revokeMember(db.pool, ws, revoked);
    // `outsider` is granted nothing at all.

    // `uncategorized: 0` — and it read `9` until `seedTicket` began writing a
    // `proj_tickets` head row. Every child here is now `open`: known, and known
    // not to be done. What this case is ABOUT is `restrictedCount`, which is the
    // only number that varies across the nine viewer classes below and the only
    // one this fixture is built to drive. `terminal` and `uncategorized` are held
    // constant here on purpose and are exercised in the mixed-family case below,
    // which is where they can actually differ.
    const family = (restrictedCount: number): RollupView => ({
      total: 9,
      terminal: 0,
      uncategorized: 0,
      restrictedCount,
    });
    const classes: Array<[string, string, RollupView]> = [
      ['owner — the disclosed workspace-wide read', owner, family(0)],
      // Rule A: a roster row adds nothing. The four classes below reach the same
      // seven children and are restricted from the two explicit lists.
      ['member on project A', onA, family(2)],
      ['member on projects A and B', onAB, family(2)],
      ['member with no roster row', offAll, family(2)],
      ['workspace admin with no roster row', adminOffAll, family(2)],
      // The one class that differs: named on the second explicit list.
      ['member named on the second explicit list', namedMember, family(1)],
      ['guest — one explicit list and nothing else', guestUser, family(8)],
      ['non-member', outsider, family(9)],
      ['revoked member, project row surviving', revoked, family(9)],
    ];

    const observed: Array<[string, RollupView | null]> = [];
    for (const [name, viewer] of classes) {
      observed.push([name, await rollupFor(db.pool, viewer, parent)]);
    }
    expect(observed).toEqual(classes.map(([name, , expected]) => [name, expected]));

    // The honesty pairing, asserted as a pairing rather than left implicit in
    // the table above — this is the assertion a viewer-filtered `total` fails.
    const totals = observed.map(([, r]) => r?.total);
    expect(totals).toEqual(Array.from({ length: classes.length }, () => 9));

    // …and the other half: the restriction really is per-viewer. Without this,
    // a `restrictedCount` hard-wired to any single constant would satisfy
    // everything above that a broken total did not.
    const restricted = observed.map(([, r]) => r?.restrictedCount);
    expect([...new Set(restricted)].sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual([0, 1, 2, 8, 9]);

    // The INDEPENDENT witness: `canSee`, child by child, for every class. The
    // literal table above cannot catch this function drifting from the one
    // visibility decision, and `canSee` alone could agree with it vacuously —
    // so the count is rebuilt from `canSee` and both are asserted, with a
    // non-vacuity check that nine children were really enumerated.
    const childIds = (
      await db.pool.query<{ ticket_id: string }>(
        'SELECT ticket_id FROM proj_visibility WHERE parent_id = $1',
        [parent],
      )
    ).rows.map((r) => r.ticket_id);
    expect(childIds).toHaveLength(9);

    for (const [name, viewer, expected] of classes) {
      let viaCanSee = 0;
      for (const childId of childIds) {
        if (!(await canSee(db.pool, viewer, childId))) viaCanSee += 1;
      }
      expect([name, viaCanSee]).toEqual([name, expected.restrictedCount]);
    }
  });

  it('a viewer-filtered total would make a parent look complete: the member sees seven of nine, and is told nine', async () => {
    const { ws, prjA, parent } = await seedFamily();
    const onA = newUlid();
    await seedMember(db.pool, ws, onA, 'member', [{ projectId: prjA }]);

    const rollup = await rollupFor(db.pool, onA, parent);
    expect(rollup).toEqual({ total: 9, terminal: 0, uncategorized: 0, restrictedCount: 2 });

    // Nine children, seven this member can reach, two it cannot: three
    // DIFFERENT numbers, so no two can be swapped silently. The seven comes from
    // `canSee` rather than from `total - restrictedCount`, which would only
    // restate the line above it.
    const children = (
      await db.pool.query<{ ticket_id: string }>(
        'SELECT ticket_id FROM proj_visibility WHERE parent_id = $1',
        [parent],
      )
    ).rows.map((r) => r.ticket_id);
    let reachable = 0;
    for (const id of children) if (await canSee(db.pool, onA, id)) reachable += 1;
    expect([children.length, reachable, rollup?.restrictedCount]).toEqual([9, 7, 2]);
  });
});

describe('rollupFor — what null means, and what it must not invent', () => {
  it('a ticket with no children reports null rather than a zeroed family', async () => {
    const ws = newUlid();
    const prj = newUlid();
    const leaf = newUlid();
    const viewer = newUlid();
    await seedMember(db.pool, ws, viewer, 'member', [{ projectId: prj }]);
    await seedTicket(db.pool, { workspaceId: ws, projectId: prj, ticketId: leaf });
    await applyAll(db.pool, [setVisibilityEnv(ws, leaf, 'workspace')]);

    expect(await rollupFor(db.pool, viewer, leaf)).toBeNull();

    // The positive control in the same test: the very same viewer against a
    // parent that DOES have children gets a rollup. Without it, "null" would
    // also pass against a build that returned null unconditionally.
    const parent = newUlid();
    const child = newUlid();
    await seedTicket(db.pool, { workspaceId: ws, projectId: prj, ticketId: parent });
    await seedTicket(db.pool, { workspaceId: ws, projectId: prj, ticketId: child, parentId: parent });
    await applyAll(db.pool, [setVisibilityEnv(ws, child, 'workspace')]);
    expect(await rollupFor(db.pool, viewer, parent)).toEqual({
      total: 1,
      terminal: 0,
      uncategorized: 0,
      restrictedCount: 0,
    });
  });

  it('counts a terminal child and a category-less child apart — the two numbers the seed used to hold constant', async () => {
    // THE FALSIFIABILITY CASE. Every other fixture in this file seeds children
    // at the default `open`, so `terminal` and `uncategorized` are 0 in all of
    // them and a build that hard-wired either to 0 would pass the whole file.
    // Here one child is terminal, one has NO category at all, and one is open —
    // three different answers from one parent, so each number is measured
    // against a fixture that could have produced a different one.
    const ws = newUlid();
    const prj = newUlid();
    const parent = newUlid();
    const done = newUlid();
    const unknown = newUlid();
    const open = newUlid();
    const viewer = newUlid();
    await seedMember(db.pool, ws, viewer, 'member', [{ projectId: prj }]);
    await seedTicket(db.pool, { workspaceId: ws, projectId: prj, ticketId: parent });
    await seedTicket(db.pool, {
      workspaceId: ws, projectId: prj, ticketId: done, parentId: parent, stateCategory: 'terminal',
    });
    await seedTicket(db.pool, {
      // NO head row. `proj_tickets.state_category` is NOT NULL, so an
      // uncategorized child is not one with a null category — it is one the
      // `LEFT JOIN proj_tickets` MISSES. The ticket is real in the ledger and in
      // `proj_visibility`; only the head row is absent, which is the state every
      // fixture here was in before that row began being written.
      workspaceId: ws, projectId: prj, ticketId: unknown, parentId: parent, stateCategory: null,
    });
    await seedTicket(db.pool, {
      workspaceId: ws, projectId: prj, ticketId: open, parentId: parent,
    });
    await applyAll(db.pool, [
      setVisibilityEnv(ws, done, 'workspace'),
      setVisibilityEnv(ws, unknown, 'workspace'),
      setVisibilityEnv(ws, open, 'workspace'),
    ]);

    // Three children, one terminal, one uncategorized — and the third is neither,
    // so neither count can be reading `total` under another name.
    expect(await rollupFor(db.pool, viewer, parent)).toEqual({
      total: 3,
      terminal: 1,
      uncategorized: 1,
      restrictedCount: 0,
    });
  });

  it('a ticket that never existed is the same null as a leaf — no existence oracle one layer down', async () => {
    const ws = newUlid();
    const prj = newUlid();
    const leaf = newUlid();
    const viewer = newUlid();
    await seedMember(db.pool, ws, viewer, 'member', [{ projectId: prj }]);
    await seedTicket(db.pool, { workspaceId: ws, projectId: prj, ticketId: leaf });
    await applyAll(db.pool, [setVisibilityEnv(ws, leaf, 'workspace')]);

    const ghost = await rollupFor(db.pool, viewer, newUlid());
    expect(ghost).toBeNull();
    expect(ghost).toEqual(await rollupFor(db.pool, viewer, leaf));
  });
});

describe('rollupFor — the role is resolved in each CHILD’s own workspace', () => {
  it('a child in another workspace is counted in the total and judged by that workspace’s role, not by the first child’s', async () => {
    const wsA = newUlid();
    const wsB = newUlid();
    const prjA = newUlid();
    const prjB = newUlid();
    const parent = newUlid();
    const viewer = newUlid();

    // The viewer belongs to workspace A alone.
    await seedMember(db.pool, wsA, viewer, 'member', [{ projectId: prjA }]);

    await seedTicket(db.pool, { workspaceId: wsA, projectId: prjA, ticketId: parent });
    const a1 = newUlid();
    const a2 = newUlid();
    const b1 = newUlid();
    await seedTicket(db.pool, { workspaceId: wsA, projectId: prjA, ticketId: a1, parentId: parent });
    await seedTicket(db.pool, { workspaceId: wsA, projectId: prjA, ticketId: a2, parentId: parent });
    // A ticket in workspace B naming a parent in workspace A. NO DOOR CAN WRITE
    // THIS ROW: `hierarchy.unknown-parent` compares the parent's workspace
    // against the envelope's at both doors that set a parent (`hierarchy.ts:124`
    // for `ticket.created`, `:250` for `ticket.reparented`, controller ruling
    // P12). The fixture seeds `proj_visibility` directly, which is what keeps
    // this a live defensive property rather than a reachable input (case 6.84).
    await seedTicket(db.pool, { workspaceId: wsB, projectId: prjB, ticketId: b1, parentId: parent });
    await applyAll(db.pool, [
      setVisibilityEnv(wsA, a1, 'workspace'),
      setVisibilityEnv(wsA, a2, 'workspace'),
      setVisibilityEnv(wsB, b1, 'workspace'),
    ]);

    // The B child counts toward the TRUE total — dropping it would understate a
    // number this task exists to keep honest — and is restricted, because the
    // viewer holds no role in B.
    expect(await rollupFor(db.pool, viewer, parent)).toEqual({
      total: 3,
      terminal: 0,
      uncategorized: 0,
      restrictedCount: 1,
    });

    // This case does not depend on which child sorts first, which is why it can
    // be written against minted ULIDs: resolving ONE role from the first row
    // restricts all three children if that row is B's and none of them if it is
    // A's, and both differ from the one asserted.
  });
});

describe('rollupsFor — one query for many parents (spec D7; audit SM-06)', () => {
  /** `n` parents in one workspace, each with two workspace-visible children and a third only the owner may see. */
  async function seedParents(n: number): Promise<{ ws: string; viewer: string; parents: string[] }> {
    const ws = newUlid();
    const prj = newUlid();
    const viewer = newUlid();
    await seedProject(db.pool, ws, prj);
    await seedMember(db.pool, ws, viewer, 'member', [{ projectId: prj }]);
    const parents: string[] = [];
    const visibility: ReturnType<typeof setVisibilityEnv>[] = [];
    for (let i = 0; i < n; i += 1) {
      const parent = newUlid();
      await seedTicket(db.pool, { workspaceId: ws, projectId: prj, ticketId: parent });
      parents.push(parent);
      for (let c = 0; c < 3; c += 1) {
        const id = newUlid();
        await seedTicket(db.pool, { workspaceId: ws, projectId: prj, ticketId: id, parentId: parent });
        visibility.push(setVisibilityEnv(ws, id, c < 2 ? 'workspace' : 'explicit', c < 2 ? undefined : [newUlid()]));
      }
    }
    await applyAll(db.pool, visibility);
    return { ws, viewer, parents };
  }

  /** A pool that counts the queries it is asked. */
  function counting(): { pool: typeof db.pool; count: () => number; reset: () => void } {
    let queries = 0;
    const pool = {
      query: (...args: unknown[]) => {
        queries += 1;
        return (db.pool.query as (...a: unknown[]) => unknown)(...args);
      },
    } as unknown as typeof db.pool;
    return { pool, count: () => queries, reset: () => { queries = 0; } };
  }

  it('25.191 the batch equals the per-ticket answers for every parent, and a parent with no children is absent', async () => {
    const { viewer, parents, ws } = await seedParents(2);
    const childless = newUlid();
    await seedTicket(db.pool, { workspaceId: ws, projectId: newUlid(), ticketId: childless });
    const batch = await rollupsFor(db.pool, viewer, [...parents, childless]);
    for (const id of parents) {
      const single = await rollupFor(db.pool, viewer, id);
      expect(single).not.toBeNull();
      expect(JSON.stringify(batch.get(id))).toBe(JSON.stringify(single));
    }
    // Control: the answers are not all zero, so equality is not two empty objects agreeing.
    expect(batch.get(parents[0]!)).toEqual({ total: 3, terminal: 0, uncategorized: 0, restrictedCount: 1 });
    expect(batch.has(childless)).toBe(false);
    expect(await rollupFor(db.pool, viewer, childless)).toBeNull();
  });

  it('25.192 fifty parents cost a constant number of queries, not fifty', async () => {
    const { viewer, parents } = await seedParents(50);
    const spy = counting();
    const batch = await rollupsFor(spy.pool, viewer, parents);
    expect(batch.size).toBe(50);
    const batched = spy.count();
    // The children, the viewer's role in the (single) workspace, the arm set: a handful, never per parent.
    expect(batched).toBeLessThanOrEqual(6);
    // Control: the per-ticket path costs at least one query per parent.
    spy.reset();
    for (const id of parents) await rollupFor(spy.pool, viewer, id);
    // `rollupFor` delegates, so this measures the delegation: one parent at a time is one batch of one.
    expect(spy.count()).toBeGreaterThanOrEqual(50);
    // And the page is the SAME size at five parents as at fifty (a constant, not a slope).
    const five = counting();
    await rollupsFor(five.pool, viewer, parents.slice(0, 5));
    expect(five.count()).toBe(batched);
  });
});
