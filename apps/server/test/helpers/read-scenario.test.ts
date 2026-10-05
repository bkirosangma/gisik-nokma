import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SCENARIO_DUE_DAY, SCENARIO_NOW, scenarioUsers, seedReadScenario, type ReadScenario } from './read-scenario.js';
import { createTestDatabase, type TestDatabase } from './db.js';

/**
 * The contract test for the world Tasks 6–15 all read.
 *
 * `seedReadScenario` is the same class of load-bearing artefact `makeCommitted`
 * is (case 7.59): a defect in it is ten tasks' defect, and it would surface
 * inside whichever read test happened to run — where "the world is wrong" and
 * "the code under test is wrong" look identical. So it is pinned here, once,
 * against the two things that can go wrong with it:
 *
 *  - **the payload shapes**, which no comment can establish. `applyCommitted`
 *    runs every event through the real projections, and the projections parse
 *    with the domain schemas, so a wrong key is a crash rather than a silent
 *    miss. The seed below therefore proves, by executing: `membership.granted`
 *    with NO `scope` (the 2026-08-27 collapse made it `z.never()`),
 *    `ticket.transitioned` carrying `to` and not the plan text's `toStateId`
 *    (`ticketTransitionedPayloadSchema`, workflow.ts:138), `blocked: true` on a
 *    workflow state (amendment 9), and `visibility.set`'s `userIds`.
 *  - **the resolved audience of every ticket**, asserted as an exact map. That
 *    is what `test/read/visible-where.test.ts` builds its expectations on; if
 *    the modes here are not what the docblock claims, the agreement test is
 *    agreeing about a different world than the one it describes.
 */

let db: TestDatabase;
let world: ReadScenario;

beforeAll(async () => {
  db = await createTestDatabase();
  world = await seedReadScenario(db.pool, scenarioUsers());
});

afterAll(async () => {
  await db.drop();
});

describe('SCENARIO_NOW is an instant, not a wall-clock reading', () => {
  /**
   * The `Z` suffix is load-bearing, and this is the proof rather than the
   * claim. `new Date('2026-08-20T12:00:00')` — the same literal without it — is
   * parsed in the AMBIENT zone; both machines this repo is developed on are
   * Asia/Kolkata, so the un-suffixed spelling would silently mean 06:30Z there
   * and every "overdue / stale / due today" assertion later tasks write against
   * it would pass for a reason that has nothing to do with the code.
   *
   * What this pins is the FIXTURE CONVENTION for Tasks 6–15. It is NOT a claim
   * that Task 5 computes anything in IST: `visibleTicketsWhere` reads no clock
   * at all (`can-see.ts` §Determinism), and neither does `seedReadScenario`.
   */
  function parsedUnderZone(zone: string, literal: string): number {
    const original = process.env['TZ'];
    try {
      process.env['TZ'] = zone;
      return new Date(literal).getTime();
    } finally {
      if (original === undefined) delete process.env['TZ'];
      else process.env['TZ'] = original;
    }
  }

  /**
   * The probe that keeps the two cases below from being vacuous. `process.env.TZ`
   * assignment does NOTHING inside a vitest worker THREAD; it works under the
   * `forks` pool, which vitest 3 defaults to. Asserting that varying TZ actually
   * CHANGES something is the difference between a TZ test and a test that
   * cannot fail — and, on a machine already in IST, between "the code is right"
   * and "the machine agreed with it".
   */
  it('the harness really can move the ambient zone — otherwise nothing below proves anything', () => {
    expect(parsedUnderZone('Pacific/Kiritimati', '2026-08-20T12:00:00')).not.toBe(
      parsedUnderZone('Pacific/Niue', '2026-08-20T12:00:00'),
    );
  });

  it('PLANTED DEFECT: the Z-suffixed literal is the SAME instant under three zones', () => {
    const asia = parsedUnderZone('Asia/Kolkata', '2026-08-20T12:00:00.000Z');
    expect(asia).toBe(parsedUnderZone('Pacific/Kiritimati', '2026-08-20T12:00:00.000Z'));
    expect(asia).toBe(parsedUnderZone('Pacific/Niue', '2026-08-20T12:00:00.000Z'));
    expect(SCENARIO_NOW.getTime()).toBe(asia);
  });

  it('and the suffix-less spelling really would have drifted — 05:30 off, in the zone this repo runs in', () => {
    expect(parsedUnderZone('Asia/Kolkata', '2026-08-20T12:00:00')).toBe(
      SCENARIO_NOW.getTime() - 5.5 * 60 * 60 * 1000,
    );
  });

  it('SCENARIO_DUE_DAY is a literal, so it does not move with the runner either', () => {
    expect(SCENARIO_DUE_DAY).toBe('2026-08-25');
  });
});

/**
 * 7.69 — `seedReadScenario` pinned by a contract test of its own before later tasks are built on it, in the shape 7.59 established for `makeCommitted`: the payload claims are EXECUTED through the real projections rather than asserted about the fixture.
 */
describe('seedReadScenario builds the world its docblock describes', () => {
  it('every ticket exists with the resolved audience the read tasks expect', async () => {
    const { rows } = await db.pool.query<{
      ticket_id: string;
      resolved_mode: string;
      resolved_user_ids: string[];
      workspace_id: string;
    }>(`SELECT ticket_id, resolved_mode, resolved_user_ids, workspace_id FROM proj_visibility`);

    const byId = new Map(rows.map((r) => [r.ticket_id, r]));
    const audience = (ticketId: string): { mode: string; users: string[] } => {
      const row = byId.get(ticketId);
      if (row === undefined) throw new Error(`no proj_visibility row for ${ticketId}`);
      expect(row.workspace_id).toBe(world.workspaceId);
      return { mode: row.resolved_mode, users: [...row.resolved_user_ids].sort() };
    };

    // The epic and its child author nothing: a root falls back to the project
    // default, and the child inherits it. This is the ONLY 'project'-mode pair
    // in the world, which is why the visible-where fixture has to seed its own
    // workspace-mode row.
    expect(audience(world.epicId)).toEqual({ mode: 'project', users: [] });
    expect(audience(world.taskInEpicId)).toEqual({ mode: 'project', users: [] });
    expect(audience(world.sharedTaskId)).toEqual({
      mode: 'explicit',
      users: [world.owner, world.member].sort(),
    });
    // The planted invisible ticket: the owner and nobody else.
    expect(audience(world.hiddenTaskId)).toEqual({ mode: 'explicit', users: [world.owner] });
    expect(audience(world.guestTaskId)).toEqual({
      mode: 'explicit',
      users: [world.owner, world.guest].sort(),
    });
    expect(rows).toHaveLength(5);
  });

  it('the four viewers are seeded with the roles and project attachments claimed', async () => {
    const { rows } = await db.pool.query<{
      user_id: string;
      scope_kind: string;
      project_id: string;
      role: string;
      project_admin: boolean;
    }>(
      `SELECT user_id, scope_kind, project_id, role, project_admin FROM proj_memberships
        WHERE workspace_id = $1`,
      [world.workspaceId],
    );
    const describe_ = (userId: string): string[] =>
      rows
        .filter((r) => r.user_id === userId)
        .map((r) =>
          r.scope_kind === 'workspace'
            ? `workspace:${r.role}`
            : `project:${r.project_id === world.projectId ? 'the project' : r.project_id}:${r.project_admin}`,
        )
        .sort();

    expect(describe_(world.owner)).toEqual(['project:the project:true', 'workspace:owner']);
    expect(describe_(world.member)).toEqual(['project:the project:false', 'workspace:member']);
    // A workspace member on NO project — the viewer that makes the project
    // column of the decision table mean something.
    expect(describe_(world.outsider)).toEqual(['workspace:member']);
    // A guest is a WORKSPACE-scope grant with role 'guest' and no project
    // attachment at all; there is no project-scope guest row to hold.
    expect(describe_(world.guest)).toEqual(['workspace:guest']);
  });

  it('the workflow carries the blocked-flagged state, and the two tickets sit where the docblock says', async () => {
    const { rows: wf } = await db.pool.query<{ states: Array<{ id: string; blocked?: boolean }> }>(
      `SELECT definition -> 'states' AS states FROM proj_workflows
        WHERE workflow_id = $1 AND workspace_id = $2`,
      [world.workflowId, world.workspaceId],
    );
    const states = wf[0]?.states;
    expect(states?.find((s) => s.id === 'waiting')?.blocked).toBe(true);
    expect(states?.find((s) => s.id === 'doing')?.blocked).toBeUndefined();

    const { rows: tickets } = await db.pool.query<{
      ticket_id: string;
      state_id: string;
      assignee_id: string | null;
      parent_id: string | null;
    }>(`SELECT ticket_id, state_id, assignee_id, parent_id FROM proj_tickets WHERE workspace_id = $1`, [
      world.workspaceId,
    ]);
    const ticket = (id: string): { state: string; assignee: string | null; parent: string | null } => {
      const row = tickets.find((t) => t.ticket_id === id);
      if (row === undefined) throw new Error(`no proj_tickets row for ${id}`);
      return { state: row.state_id, assignee: row.assignee_id, parent: row.parent_id };
    };
    // `ticket.transitioned` carrying `to` reached the projection: had the plan
    // text's `toStateId` been kept, the seed would have thrown, and had it been
    // ignored these would read 'todo'.
    expect(ticket(world.taskInEpicId)).toEqual({
      state: 'doing',
      assignee: world.member,
      parent: world.epicId,
    });
    expect(ticket(world.sharedTaskId).state).toBe('waiting');
    expect(ticket(world.epicId).state).toBe('todo');
    expect(tickets).toHaveLength(5);
  });

  it('refuses a second seed into the same database, naming the fix', async () => {
    await expect(seedReadScenario(db.pool, scenarioUsers())).rejects.toThrow(
      /already holds the scenario's fixed entity ids/,
    );
  });
});
