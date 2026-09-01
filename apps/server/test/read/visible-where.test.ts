import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Pool } from 'pg';
import { membershipId, newUlid, type LedgerEvent } from '@gisik-nokma/domain';
import { canSee } from '../../src/visibility/can-see.js';
import { resolveEffectiveRole, type EffectiveRole } from '../../src/permissions/effective-role.js';
import { requireMember, workspaceOfProject } from '../../src/read/membership.js';
import { visibleTicketsWhere } from '../../src/read/visible-where.js';
import { SqlParams } from '../../src/read/sql-params.js';
import { applyCommitted, makeCommitted } from '../helpers/apply.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';
import { scenarioUsers, seedReadScenario, type ReadScenario } from '../helpers/read-scenario.js';

/**
 * `visibleTicketsWhere` is Plan 4's read decision table compiled to SQL, and
 * `canSeeResolved` is the same table written in TypeScript. This file is what
 * keeps them from drifting.
 *
 * Two copies, not three: the SQL used to live inline inside
 * `listVisibleTickets`, and Task 5 EXTRACTED it rather than writing a second
 * expression beside it (see `src/read/visible-where.ts`). Extraction removed a
 * third copy; it did not produce a single source of truth, and this file is the
 * price of the two that remain.
 *
 * ## The shared world alone cannot exercise the table
 *
 * `seedReadScenario` contains no workspace-mode ticket, no admin, no second
 * project, and names the owner in every explicit list it authors — its own
 * docblock enumerates all four absences. Run against it alone, the agreement
 * test below would pass with the entire `'workspace'` disjunct deleted AND with
 * the owner branch replaced by the member rules: neither path is reached, so
 * neither mutation could fail. So this file AUGMENTS the world with four
 * things, and each exists to make one specific mutation die:
 *
 * - `wsWideTaskId` — the only workspace-mode ticket. Deleting
 *   `v.resolved_mode = 'workspace'` from the member clause fails here.
 * - `otherProjTaskId` — project-mode in a project the OWNER IS NOT ON. The
 *   owner reaches it by bypass alone, so replacing `case 'owner'` with the
 *   member rules fails here.
 * - `memberOnlyTaskId` — explicit, listing the member and NOT the owner. The
 *   second cell that isolates the owner bypass.
 * - `admin` on that second project — a viewer whose slice differs from both the
 *   member's and the outsider's, so `case 'admin'` is exercised and not merely
 *   compiled.
 *
 * And `neighbourTaskId` sits in a DIFFERENT workspace, workspace-mode. The
 * predicate carries no tenancy clause of its own — for an owner it compiles to
 * `TRUE` — so the caller's `workspace_id = $n` is the only thing standing
 * between the owner of one workspace and the whole table. A caller who drops
 * that clause fails here.
 *
 * ## The twelve cells, and the one that is not seeded
 *
 * Four role branches (null, guest, member/admin, owner) times three resolved
 * modes. All twelve are asserted below, by row, in "every cell of the decision
 * table is reached" — as a grid, not as prose, because a cell nobody can point
 * at is a cell nobody covered.
 *
 * `member` and `admin` are ONE `case` in the predicate and one `case` in
 * `canSeeResolved`, so the admin viewer is seeded to prove that branch is
 * reached by an admin at all rather than to cover a fourth row. Of the four
 * admin cells, three are fixtured (workspace; project on it; project off it;
 * explicit not listed — four, in fact). **`admin x explicit, LISTED` is the one
 * combination no fixture here seeds**: no explicit list names the admin. It
 * exercises no code the identical `member x explicit, listed` cell does not,
 * and the two cells that actually discriminate admin from owner — project-off-it
 * and explicit-not-listed — are both seeded and both asserted false. Named
 * rather than counted as covered.
 */

let db: TestDatabase;
let pool: Pool;
let world: ReadScenario;
let extra: Augmentation;

type Augmentation = {
  admin: string;
  stranger: string;
  otherProjectId: string;
  wsWideTaskId: string;
  otherProjTaskId: string;
  memberOnlyTaskId: string;
  neighbourWorkspaceId: string;
  neighbourTaskId: string;
};

/**
 * The fixtures the shared world does not carry. Seeded into the SAME database
 * after `seedReadScenario`, with freshly minted ULIDs throughout — the one-seed
 * rule is about the scenario's FIXED ids (`wf-errands`, `epic`, `task`), and
 * nothing below reuses one. The neighbour workspace defines its own workflow
 * and type because entity ids are globally unique in the ledger, not
 * per-workspace.
 */
async function seedAugmentation(target: Pool, w: ReadScenario): Promise<Augmentation> {
  const admin = newUlid();
  const stranger = newUlid();
  const otherProjectId = newUlid();
  const wsWideTaskId = newUlid();
  const otherProjTaskId = newUlid();
  const memberOnlyTaskId = newUlid();
  const neighbourWorkspaceId = newUlid();
  const neighbourProjectId = newUlid();
  const neighbourTaskId = newUlid();
  const neighbourOwner = newUlid();
  const ws = { workspaceId: w.workspaceId, actorId: w.owner };
  const nb = { workspaceId: neighbourWorkspaceId, actorId: neighbourOwner };

  const events: LedgerEvent[] = [
    makeCommitted({ ...ws, entity: { kind: 'membership', id: membershipId(w.workspaceId, admin) }, type: 'membership.granted', payload: { userId: admin, role: 'admin' } }),
    makeCommitted({ ...ws, entity: { kind: 'project', id: otherProjectId }, type: 'project.created', payload: { name: 'Licences' } }),
    // The admin is on the SECOND project and on nothing else — the owner is on
    // neither, which is what makes the owner's reach of it a bypass.
    makeCommitted({ ...ws, entity: { kind: 'project', id: otherProjectId }, type: 'project.member_added', payload: { userId: admin, projectAdmin: false } }),
    makeCommitted({ ...ws, entity: { kind: 'ticket', id: wsWideTaskId }, type: 'ticket.created', payload: { typeId: 'task', projectId: w.projectId, parentId: null, title: 'Pin the holiday list on the door' } }),
    makeCommitted({ ...ws, entity: { kind: 'ticket', id: wsWideTaskId }, type: 'visibility.set', payload: { ticketId: wsWideTaskId, mode: 'workspace' } }),
    // No visibility.set: a root with no authored mode resolves to the project
    // default, which is the 'project' mode this cell needs.
    makeCommitted({ ...ws, entity: { kind: 'ticket', id: otherProjTaskId }, type: 'ticket.created', payload: { typeId: 'task', projectId: otherProjectId, parentId: null, title: 'Renew the shop licence' } }),
    makeCommitted({ ...ws, entity: { kind: 'ticket', id: memberOnlyTaskId }, type: 'ticket.created', payload: { typeId: 'task', projectId: w.projectId, parentId: null, title: 'Reconcile the till — member only' } }),
    makeCommitted({ ...ws, entity: { kind: 'ticket', id: memberOnlyTaskId }, type: 'visibility.set', payload: { ticketId: memberOnlyTaskId, mode: 'explicit', userIds: [w.member] } }),

    makeCommitted({ ...nb, entity: { kind: 'workspace', id: neighbourWorkspaceId }, type: 'workspace.created', payload: { name: 'The other shop' } }),
    makeCommitted({ ...nb, entity: { kind: 'project', id: neighbourProjectId }, type: 'project.created', payload: { name: 'Their errands' } }),
    makeCommitted({ ...nb, entity: { kind: 'membership', id: membershipId(neighbourWorkspaceId, neighbourOwner) }, type: 'membership.granted', payload: { userId: neighbourOwner, role: 'owner' } }),
    makeCommitted({
      ...nb,
      entity: { kind: 'workflow', id: 'wf-neighbour' },
      type: 'workflow.defined',
      payload: {
        id: 'wf-neighbour',
        version: 1,
        name: 'Theirs',
        initialStateId: 'todo',
        states: [{ id: 'todo', name: 'To do', category: 'open' }],
        transitions: [{ from: '*', to: 'todo', rules: [] }],
      },
    }),
    makeCommitted({ ...nb, entity: { kind: 'ticket-type', id: 'neighbour-task' }, type: 'ticket-type.defined', payload: { id: 'neighbour-task', name: 'Task', icon: 'check', rank: 3, workflowId: 'wf-neighbour', fields: [] } }),
    makeCommitted({ ...nb, entity: { kind: 'ticket', id: neighbourTaskId }, type: 'ticket.created', payload: { typeId: 'neighbour-task', projectId: neighbourProjectId, parentId: null, title: 'Their whole-workspace notice' } }),
    makeCommitted({ ...nb, entity: { kind: 'ticket', id: neighbourTaskId }, type: 'visibility.set', payload: { ticketId: neighbourTaskId, mode: 'workspace' } }),
  ];
  await applyCommitted(target, events);
  return {
    admin,
    stranger,
    otherProjectId,
    wsWideTaskId,
    otherProjTaskId,
    memberOnlyTaskId,
    neighbourWorkspaceId,
    neighbourTaskId,
  };
}

beforeAll(async () => {
  db = await createTestDatabase();
  pool = db.pool;
  // Seeded ONCE for the file, not per test: the scenario's workflow and ticket
  // types are fixed entity ids, so a per-test re-seed collides on
  // events_entity_seq_unique (seedReadScenario's guard says so in words). Every
  // test here is a read.
  world = await seedReadScenario(pool, scenarioUsers());
  extra = await seedAugmentation(pool, world);
});

afterAll(async () => {
  await db.drop();
});

/** Every ticket this file seeded in the scenario's workspace, plus the neighbour's. */
function allTickets(): string[] {
  return [
    world.epicId,
    world.taskInEpicId,
    world.sharedTaskId,
    world.hiddenTaskId,
    world.guestTaskId,
    extra.wsWideTaskId,
    extra.otherProjTaskId,
    extra.memberOnlyTaskId,
    extra.neighbourTaskId,
  ];
}

const sorted = (ids: readonly string[]): string[] => [...ids].sort();

async function sqlVisibleSet(userId: string): Promise<string[]> {
  const eff = await resolveEffectiveRole(pool, userId, world.workspaceId);
  const params = new SqlParams();
  const workspaceClause = `t.workspace_id = ${params.add(world.workspaceId)}`;
  const visibleClause = visibleTicketsWhere(eff, userId, params);
  const { rows } = await pool.query(
    `SELECT t.ticket_id FROM proj_tickets t
     JOIN proj_visibility v ON v.ticket_id = t.ticket_id
     WHERE ${workspaceClause} AND ${visibleClause}`,
    params.toArray(),
  );
  // Sorted in JS, exactly as canSeeSet is — an `ORDER BY` here would sort under
  // the database's collation while the other side sorted by code unit, and the
  // two agreeing would then be a fact about the fixture's ids.
  return sorted(rows.map((r) => (r as { ticket_id: string }).ticket_id));
}

async function canSeeSet(userId: string): Promise<string[]> {
  const visible: string[] = [];
  for (const ticketId of allTickets()) {
    if (await canSee(pool, userId, ticketId)) visible.push(ticketId);
  }
  return sorted(visible);
}

describe('visibleTicketsWhere agrees with canSee — one decision table, two implementations, zero drift', () => {
  it('agrees for every viewer in the matrix, on the exact id set', async () => {
    const expected: ReadonlyArray<readonly [string, string, string[]]> = [
      [
        'owner (bypass)',
        world.owner,
        [
          world.epicId,
          world.taskInEpicId,
          world.sharedTaskId,
          world.hiddenTaskId,
          world.guestTaskId,
          extra.wsWideTaskId,
          extra.otherProjTaskId,
          extra.memberOnlyTaskId,
        ],
      ],
      [
        'member, on the first project',
        world.member,
        [world.epicId, world.taskInEpicId, world.sharedTaskId, extra.wsWideTaskId, extra.memberOnlyTaskId],
      ],
      ['outsider, a member on no project', world.outsider, [extra.wsWideTaskId]],
      ['admin, on the second project, no bypass', extra.admin, [extra.wsWideTaskId, extra.otherProjTaskId]],
      ['guest, explicit only', world.guest, [world.guestTaskId]],
      ['a stranger to the workspace', extra.stranger, []],
    ];

    for (const [label, userId, ids] of expected) {
      expect({ label, ids: await sqlVisibleSet(userId) }).toEqual({ label, ids: sorted(ids) });
    }

    // The drift alarm, ticket by ticket rather than set by set: an exact-set
    // pass and a cross-check pass are different facts, and only the pair of
    // them stops the two copies drifting.
    for (const [label, userId] of expected) {
      const listed = new Set(await sqlVisibleSet(userId));
      for (const ticketId of allTickets()) {
        expect({ label, ticketId, listed: listed.has(ticketId) }).toEqual({
          label,
          ticketId,
          listed: await canSee(pool, userId, ticketId),
        });
      }
    }

    // …and the agreement is agreement about something: the six slices are not
    // all empty and not all equal.
    expect((await sqlVisibleSet(world.owner)).length).toBe(8);
    expect(await sqlVisibleSet(world.member)).not.toEqual(await sqlVisibleSet(extra.admin));
    expect(await sqlVisibleSet(world.outsider)).not.toEqual(await sqlVisibleSet(world.guest));
  });

  it('every cell of the decision table is reached — four role branches by three resolved modes', async () => {
    const slices = {
      stranger: new Set(await sqlVisibleSet(extra.stranger)),
      guest: new Set(await sqlVisibleSet(world.guest)),
      member: new Set(await sqlVisibleSet(world.member)),
      admin: new Set(await sqlVisibleSet(extra.admin)),
      owner: new Set(await sqlVisibleSet(world.owner)),
    };

    // Each entry is one cell: [cell, viewer's slice, ticket standing in that
    // mode, whether the table says yes]. A cell whose ticket does not exist
    // would read as `false` here for the wrong reason, so `allTickets()`
    // membership is asserted first.
    const cells: ReadonlyArray<readonly [string, Set<string>, string, boolean]> = [
      ['null x workspace', slices.stranger, extra.wsWideTaskId, false],
      ['null x project', slices.stranger, world.epicId, false],
      ['null x explicit (listed for others)', slices.stranger, world.guestTaskId, false],

      ['guest x workspace', slices.guest, extra.wsWideTaskId, false],
      ['guest x project', slices.guest, world.epicId, false],
      ['guest x explicit, listed', slices.guest, world.guestTaskId, true],
      ['guest x explicit, not listed', slices.guest, world.hiddenTaskId, false],

      ['member x workspace', slices.member, extra.wsWideTaskId, true],
      ['member x project, on it', slices.member, world.epicId, true],
      ['member x project, off it', slices.member, extra.otherProjTaskId, false],
      ['member x explicit, listed', slices.member, world.sharedTaskId, true],
      ['member x explicit, not listed', slices.member, world.hiddenTaskId, false],

      ['admin x workspace', slices.admin, extra.wsWideTaskId, true],
      ['admin x project, on it', slices.admin, extra.otherProjTaskId, true],
      ['admin x project, off it', slices.admin, world.epicId, false],
      ['admin x explicit, not listed', slices.admin, world.sharedTaskId, false],

      ['owner x workspace', slices.owner, extra.wsWideTaskId, true],
      // The two cells that ISOLATE the bypass: the owner is on neither the
      // second project nor the member-only list, so a member-rules owner
      // answers false to both.
      ['owner x project, off it (bypass)', slices.owner, extra.otherProjTaskId, true],
      ['owner x explicit, not listed (bypass)', slices.owner, extra.memberOnlyTaskId, true],
    ];

    const seeded = new Set(allTickets());
    for (const [cell, slice, ticketId, expectedVisible] of cells) {
      expect({ cell, seeded: seeded.has(ticketId) }).toEqual({ cell, seeded: true });
      expect({ cell, visible: slice.has(ticketId) }).toEqual({ cell, visible: expectedVisible });
    }
  });

  it('PLANTED DEFECT: the explicit-mode ticket that omits the member never surfaces for them', async () => {
    const memberSet = await sqlVisibleSet(world.member);
    expect(memberSet).not.toContain(world.hiddenTaskId);
    expect(memberSet).not.toContain(world.guestTaskId); // explicit lists are exactly the authored list
    expect(memberSet).toEqual(
      sorted([world.epicId, world.taskInEpicId, world.sharedTaskId, extra.wsWideTaskId, extra.memberOnlyTaskId]),
    );
  });

  it('a guest sees only what was explicitly shared; an off-project member sees only the workspace-mode one', async () => {
    expect(await sqlVisibleSet(world.guest)).toEqual([world.guestTaskId]);
    expect(await sqlVisibleSet(world.outsider)).toEqual([extra.wsWideTaskId]);
  });

  it('the predicate carries NO tenancy clause — the caller’s workspace clause is what fences an owner', async () => {
    // The owner of this workspace compiles to TRUE, so the neighbour's
    // workspace-mode ticket is excluded by `t.workspace_id = $1` and by nothing
    // else. Drop that clause from sqlVisibleSet and this dies.
    expect(await sqlVisibleSet(world.owner)).not.toContain(extra.neighbourTaskId);
    expect(await canSee(pool, world.owner, extra.neighbourTaskId)).toBe(false);

    const params = new SqlParams();
    const eff = await resolveEffectiveRole(pool, world.owner, world.workspaceId);
    expect(visibleTicketsWhere(eff, world.owner, params)).toBe('TRUE');
    expect(params.toArray()).toEqual([]);
  });

  it('a non-member compiles to FALSE — not to an empty string that matches everything', () => {
    const params = new SqlParams();
    // `as unknown as EffectiveRole`: the interface carries a required,
    // UNEXPORTED unique-symbol brand (ruling P22), so no literal satisfies it
    // structurally. The cast is the deliberate, greppable act the brand exists
    // to force.
    const nonMember = { workspaceRole: null, projects: new Map() } as unknown as EffectiveRole;
    expect(visibleTicketsWhere(nonMember, newUlid(), params)).toBe('FALSE');
    expect(params.toArray()).toEqual([]);
  });

  it('binds every value — a userId carrying SQL text is a parameter, never syntax', async () => {
    const eff = await resolveEffectiveRole(pool, world.guest, world.workspaceId);
    const params = new SqlParams();
    const injected = "' OR TRUE) --";
    const clause = visibleTicketsWhere(eff, injected, params);
    expect(clause).not.toContain(injected);
    // Executed, not merely compared: the proof is that the query runs and
    // returns nothing, not that a string looks safe.
    const { rows } = await pool.query(
      `SELECT t.ticket_id FROM proj_tickets t
       JOIN proj_visibility v ON v.ticket_id = t.ticket_id
       WHERE ${clause}`,
      params.toArray(),
    );
    expect(rows).toEqual([]);
  });
});

describe('membership helpers', () => {
  it('resolves a project to its workspace via proj_entity_heads, null for unknown ids', async () => {
    expect(await workspaceOfProject(pool, world.projectId)).toBe(world.workspaceId);
    expect(await workspaceOfProject(pool, extra.otherProjectId)).toBe(world.workspaceId);
    expect(await workspaceOfProject(pool, newUlid())).toBeNull();
  });

  it('requireMember answers the effective role for members and null for strangers', async () => {
    const asMember = await requireMember(pool, world.member, world.workspaceId);
    expect(asMember?.workspaceRole).toBe('member');
    expect(asMember?.projects.has(world.projectId)).toBe(true);

    const asGuest = await requireMember(pool, world.guest, world.workspaceId);
    expect(asGuest?.workspaceRole).toBe('guest');

    expect(await requireMember(pool, extra.stranger, world.workspaceId)).toBeNull();
    // A member HERE is a stranger THERE: the gate is per workspace, and the
    // 404 it produces must not depend on which workspace was asked about.
    expect(await requireMember(pool, world.owner, extra.neighbourWorkspaceId)).toBeNull();
  });
});
