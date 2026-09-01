import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { newUlid } from '@gisik-nokma/domain';
import { canSee } from '../../src/visibility/can-see.js';
import { rollupFor, type RollupView } from '../../src/visibility/rollup.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import {
  applyAll,
  revokeMember,
  seedGuest,
  seedMember,
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
 * projects) the fixture yields a total of 9 over 6 children they can reach and
 * 3 they cannot — three different numbers, so no two can be swapped without a
 * case noticing. Across the classes the restricted count takes **six distinct
 * values** (0, 2, 3, 5, 8, 9), so a mutation cannot satisfy the suite by moving
 * to any one constant. `total === restricted` for an outsider is the one
 * coincidence the semantics FORCE, which is why the discrimination does not
 * rest on that class.
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
 * No case asserts `open`/`active`/`terminal`. Those need each child's
 * `state_category`, which lives in `proj_tickets` via `proj_rollups`, and
 * **neither table exists on this branch** (cases 6.82, 6.83). They are absent
 * from `RollupView` rather than zeroed, so there is nothing here to assert
 * about — writing `expect(rollup.terminal).toBeUndefined()` would pass for a
 * reason unrelated to the property it names, which is this series' signature
 * defect and the same thing case 6.66 refused to write for titles.
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
 * - 2 × `project` on A — a member of A (and the owner).
 * - 1 × `project` on B — a member of B (and the owner).
 * - 1 × `explicit` naming the guest — the guest and the owner.
 * - 1 × `explicit` naming a stranger — the owner alone.
 *
 * Nine is not a round number on purpose: with eight, a member off every project
 * would have reached four and been refused four, and a swap of the reached and
 * refused counts would have gone unnoticed on exactly the class that is meant
 * to catch the admin-no-bypass rule.
 */
async function seedFamily(): Promise<{
  ws: string;
  prjA: string;
  prjB: string;
  parent: string;
  guestUser: string;
}> {
  const ws = newUlid();
  const prjA = newUlid();
  const prjB = newUlid();
  const parent = newUlid();
  const guestUser = newUlid();
  const stranger = newUlid();

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
  modes.push([await child(prjA), 'explicit', [stranger]]);

  await applyAll(
    db.pool,
    modes.map(([id, mode, users]) =>
      setVisibilityEnv(ws, id, mode, mode === 'explicit' ? users : undefined),
    ),
  );

  return { ws, prjA, prjB, parent, guestUser };
}

describe('rollupFor — the total is the parent’s, the restriction is the viewer’s', () => {
  it('every viewer class reports the SAME total over all nine children while the restricted count differs, six distinct values', async () => {
    const { ws, prjA, prjB, parent, guestUser } = await seedFamily();

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
    await seedGuest(db.pool, ws, guestUser);
    // A revoked member whose PROJECT-scope row is still standing — the class no
    // mutation would have found on its own, and the one that proves this
    // function reads membership through `resolveEffectiveRole` rather than by
    // joining the roster rows, whose project scope survives a revocation.
    await seedMember(db.pool, ws, revoked, 'member', [{ projectId: prjA }]);
    await revokeMember(db.pool, ws, revoked);
    // `outsider` is granted nothing at all.

    const classes: Array<[string, string, RollupView]> = [
      ['owner — the disclosed workspace-wide read', owner, { total: 9, restrictedCount: 0 }],
      ['member on project A', onA, { total: 9, restrictedCount: 3 }],
      ['member on projects A and B', onAB, { total: 9, restrictedCount: 2 }],
      ['member on no project', offAll, { total: 9, restrictedCount: 5 }],
      // Identical to the plain member above: an admin gets NO read bypass.
      ['workspace admin on no project', adminOffAll, { total: 9, restrictedCount: 5 }],
      ['guest — one explicit list and nothing else', guestUser, { total: 9, restrictedCount: 8 }],
      ['non-member', outsider, { total: 9, restrictedCount: 9 }],
      ['revoked member, project row surviving', revoked, { total: 9, restrictedCount: 9 }],
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
    expect([...new Set(restricted)].sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual([0, 2, 3, 5, 8, 9]);

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

  it('a viewer-filtered total would make a parent look complete: the member sees six of nine, and is told nine', async () => {
    const { ws, prjA, parent } = await seedFamily();
    const onA = newUlid();
    await seedMember(db.pool, ws, onA, 'member', [{ projectId: prjA }]);

    const rollup = await rollupFor(db.pool, onA, parent);
    expect(rollup).toEqual({ total: 9, restrictedCount: 3 });

    // Nine children, six this member can reach, three it cannot: three
    // DIFFERENT numbers, so no two can be swapped silently. The six comes from
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
    expect([children.length, reachable, rollup?.restrictedCount]).toEqual([9, 6, 3]);
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
    expect(await rollupFor(db.pool, viewer, parent)).toEqual({ total: 1, restrictedCount: 0 });
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
    // A ticket in workspace B naming a parent in workspace A. Nothing on this
    // branch refuses that — `proj_visibility` writes `workspace_id` from the
    // envelope and `parent_id` from the payload and no check compares them.
    // Recorded as observed rather than asserted legal (case 6.84, owner Plan 3).
    await seedTicket(db.pool, { workspaceId: wsB, projectId: prjB, ticketId: b1, parentId: parent });
    await applyAll(db.pool, [
      setVisibilityEnv(wsA, a1, 'workspace'),
      setVisibilityEnv(wsA, a2, 'workspace'),
      setVisibilityEnv(wsB, b1, 'workspace'),
    ]);

    // The B child counts toward the TRUE total — dropping it would understate a
    // number this task exists to keep honest — and is restricted, because the
    // viewer holds no role in B.
    expect(await rollupFor(db.pool, viewer, parent)).toEqual({ total: 3, restrictedCount: 1 });

    // This case does not depend on which child sorts first, which is why it can
    // be written against minted ULIDs: resolving ONE role from the first row
    // restricts all three children if that row is B's and none of them if it is
    // A's, and both differ from the one asserted.
  });
});
