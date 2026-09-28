import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { newUlid } from '@gisik-nokma/domain';
import type { EffectiveRole } from '../../src/permissions/effective-role.js';
import { canSee, canSeeResolved, type ResolvedVisibility } from '../../src/visibility/can-see.js';
import {
  applyAll,
  revokeMember,
  seedGuest,
  seedMember,
  seedProject,
  seedTicket,
  setVisibilityEnv,
} from '../helpers/seed.js';
import { createTestDatabase, type TestDatabase } from '../helpers/db.js';

/**
 * Plan 4 Task 7. `canSee` is the one visibility decision, so these cases
 * enumerate PATHS to the property rather than assertions about it: every
 * viewer class the product can produce, against every resolved mode.
 *
 * A mutation can only kill on a path some test already walks. The paths are
 * therefore listed first, and each is walked: non-member, guest, plain member
 * on the project, plain member off it, project admin, workspace admin, owner,
 * and — the one no mutation would have found on its own — a REVOKED member
 * whose project-scope `proj_memberships` row is still standing.
 *
 * ## Rule A and the pure cases (amended 2026-09-29, owner ruling A)
 *
 * `resolveEffectiveRole` now fills an owner's, admin's and member's project set
 * with EVERY founded project of the workspace, so `eff('admin')` or
 * `eff('member')` with an EMPTY set is a value the resolver can no longer produce
 * for those roles. The pure cases below still hold that value on purpose: they
 * measure that `canSeeResolved` consults the project SET by id and grants no
 * role-based reach beyond it. Which projects the set holds is the resolver's
 * question, measured against the real projections at the foot of this file and in
 * `permissions/effective-role*.test.ts`.
 *
 * ## No clock is enumerated, deliberately
 *
 * Nothing on this path reads one. `canSeeResolved` is a pure function of
 * `(eff, userId, v)`; `proj_visibility` has no time column at all;
 * `resolveEffectiveRole` selects `scope_kind, project_id, role, project_admin`
 * and never `granted_at`. So there is no `TZ`-varying case here, and its
 * absence is a fact about the surface rather than a gap in the suite.
 */

const PRJ = newUlid();
const OTHER_PRJ = newUlid();

/**
 * A hand-built `EffectiveRole` for the PURE cases below, which exist to drive
 * `canSeeResolved` across every role the product can produce — including ones
 * no fixture in a database could hold at the same time.
 *
 * The cast is deliberate and is the only thing that makes this legal since
 * Plan 4 Task 8 branded `EffectiveRole` (ruling P22, case 6.64). The brand does
 * not forbid a hand-built value; it forces the builder to SAY SO at a named,
 * greppable site instead of matching the shape by accident. This is that site,
 * and it is sound here for a reason that does not generalise: every value it
 * produces is fed straight into a pure function in the same file, never into a
 * path that would trust the provenance the brand stands for.
 */
function eff(
  role: EffectiveRole['workspaceRole'],
  projects: ReadonlyArray<string | [string, boolean]> = [],
): EffectiveRole {
  return {
    workspaceRole: role,
    projects: new Map(
      projects.map((p) =>
        typeof p === 'string'
          ? ([p, { projectAdmin: false }] as const)
          : ([p[0], { projectAdmin: p[1] }] as const),
      ),
    ),
  } as unknown as EffectiveRole;
}

function vis(
  resolvedMode: ResolvedVisibility['resolvedMode'],
  resolvedUserIds: string[] = [],
  projectId: string = PRJ,
): ResolvedVisibility {
  return { workspaceId: 'ws', projectId, resolvedMode, resolvedUserIds };
}

/**
 * 6.62 — cited on the block: the decision table enumerated BY PATH and pure — a non-member in all three modes including one that names them, a guest carrying only explicit lists, a member across workspace/project/explicit, an admin with no ROLE-based bypass (its reach is the project set, which rule A fills), the owner reading everything, and the project-admin flag as management rather than reading.
 */
describe('canSeeResolved — the decision table, exactly', () => {
  it('a non-member sees nothing at all, in every mode including one that names them', () => {
    expect(canSeeResolved(eff(null), 'u', vis('workspace'))).toBe(false);
    expect(canSeeResolved(eff(null), 'u', vis('project'))).toBe(false);
    expect(canSeeResolved(eff(null), 'u', vis('explicit', ['u']))).toBe(false);
  });

  it('a guest sees only explicit lists that name them — never workspace or project modes, and never through a project attachment', () => {
    // The guest carries a project attachment here on purpose: it is the path
    // that proves the guest branch does not consult eff.projects. A rebuild can
    // legitimately leave such a row standing.
    expect(canSeeResolved(eff('guest', [PRJ]), 'u', vis('workspace'))).toBe(false);
    expect(canSeeResolved(eff('guest', [PRJ]), 'u', vis('project'))).toBe(false);
    expect(canSeeResolved(eff('guest', [PRJ]), 'u', vis('explicit', ['u']))).toBe(true);
    expect(canSeeResolved(eff('guest', [PRJ]), 'u', vis('explicit', ['other']))).toBe(false);
  });

  it('a member sees workspace mode, project mode only from inside the project, explicit only when listed', () => {
    expect(canSeeResolved(eff('member'), 'u', vis('workspace'))).toBe(true);
    expect(canSeeResolved(eff('member', [PRJ]), 'u', vis('project'))).toBe(true);
    expect(canSeeResolved(eff('member'), 'u', vis('project'))).toBe(false);
    // On a project, but not THIS one — the project set is consulted by id.
    expect(canSeeResolved(eff('member', [OTHER_PRJ]), 'u', vis('project'))).toBe(false);
    expect(canSeeResolved(eff('member'), 'u', vis('explicit', ['u']))).toBe(true);
    expect(canSeeResolved(eff('member'), 'u', vis('explicit', ['other']))).toBe(false);
  });

  it('an ADMIN gets no visibility bypass — and is not thereby blinded, which is the other half', () => {
    // Pure-function level (see the docblock): with an EMPTY project set an admin
    // sees no project-mode ticket. Since 2026-09-29 (owner ruling A) the resolver
    // never hands an admin an empty set in a workspace that has a founded project,
    // so this measures that the function's only project-mode door is the SET.
    expect(canSeeResolved(eff('admin'), 'u', vis('project'))).toBe(false);
    expect(canSeeResolved(eff('admin'), 'u', vis('explicit', ['other']))).toBe(false);
    // The positive control: "an admin sees nothing" would also pass if admins
    // were treated as non-members. They are not — they are members with no
    // extra reach.
    expect(canSeeResolved(eff('admin'), 'u', vis('workspace'))).toBe(true);
    expect(canSeeResolved(eff('admin', [PRJ]), 'u', vis('project'))).toBe(true);
    expect(canSeeResolved(eff('admin'), 'u', vis('explicit', ['u']))).toBe(true);
  });

  /**
   * 6.39 — the OWNER reads everything in the workspace, including an explicit list naming only other people. The row’s other half — that an ADMIN gets no such bypass and is not thereby blinded either — is the test above.
   */
  it('the OWNER reads everything in the workspace — disclosed, not hidden', () => {
    expect(canSeeResolved(eff('owner'), 'u', vis('workspace'))).toBe(true);
    // On no project at all, and named by nobody: everything here comes from the
    // bypass alone.
    expect(canSeeResolved(eff('owner'), 'u', vis('project'))).toBe(true);
    expect(canSeeResolved(eff('owner'), 'u', vis('explicit', ['other']))).toBe(true);
  });

  it('the project-admin flag is management, not reading', () => {
    // Project admin of PRJ: they may run its roster and retarget its tickets
    // (hasProjectAdminRights), and that buys them no audience they were not in.
    const projectAdmin = eff('member', [[PRJ, true]]);
    expect(canSeeResolved(projectAdmin, 'u', vis('explicit', ['other']))).toBe(false);
    expect(canSeeResolved(projectAdmin, 'u', vis('project', [], OTHER_PRJ))).toBe(false);
    // …and the attachment they do have still works normally.
    expect(canSeeResolved(projectAdmin, 'u', vis('project'))).toBe(true);
  });
});

describe('canSee — against the real projections', () => {
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

  it('walks projection state end to end: guest vs member vs outsider on one explicit ticket', async () => {
    const ws = newUlid();
    const prj = newUlid();
    const member = newUlid();
    const guest = newUlid();
    const outsider = newUlid();
    const tkt = newUlid();

    await seedMember(db.pool, ws, member, 'member', [{ projectId: prj }]);
    await seedGuest(db.pool, ws, guest);
    await seedTicket(db.pool, { workspaceId: ws, projectId: prj, ticketId: tkt });
    await applyAll(db.pool, [setVisibilityEnv(ws, tkt, 'explicit', [guest])]);

    expect(await canSee(db.pool, guest, tkt)).toBe(true);
    expect(await canSee(db.pool, member, tkt)).toBe(false);
    expect(await canSee(db.pool, outsider, tkt)).toBe(false);
  });

  it('an unknown ticket is invisible to everyone, the owner included', async () => {
    const ws = newUlid();
    const prj = newUlid();
    const member = newUlid();
    const owner = newUlid();
    await seedMember(db.pool, ws, member, 'member', [{ projectId: prj }]);
    await seedMember(db.pool, ws, owner, 'owner');

    expect(await canSee(db.pool, member, newUlid())).toBe(false);
    // The owner bypass is inside canSeeResolved, which a missing row never
    // reaches — so "unknown" is answered before role is even resolved.
    expect(await canSee(db.pool, owner, newUlid())).toBe(false);
  });

  it('inherited visibility governs: a child under an explicit parent is seen by the listed member and not by the unlisted one', async () => {
    const ws = newUlid();
    const prj = newUlid();
    const unlisted = newUlid();
    const listed = newUlid();
    const parent = newUlid();
    const child = newUlid();

    await seedMember(db.pool, ws, unlisted, 'member', [{ projectId: prj }]);
    await seedMember(db.pool, ws, listed, 'member', [{ projectId: prj }]);
    await seedTicket(db.pool, { workspaceId: ws, projectId: prj, ticketId: parent });
    await applyAll(db.pool, [setVisibilityEnv(ws, parent, 'explicit', [listed])]);
    await seedTicket(db.pool, { workspaceId: ws, projectId: prj, ticketId: child, parentId: parent });

    // The child authored nothing; what it inherited is what decides.
    expect(await canSee(db.pool, unlisted, child)).toBe(false);
    expect(await canSee(db.pool, listed, child)).toBe(true);
  });

  /**
   * 6.59 — the ruling made FALSIFIABLE: a member on a project, revoked from the workspace, resolves nothing in ANY mode.
   * 6.148 — the P22 fixture on the same test: the revoked person’s PROJECT-scope roster row is still standing and they are swept anyway. That standing row is the one state in which a wrong implementation would still answer yes.
   */
  it('THE RULING: a revoked member resolves nothing in ANY mode, though their project-scope row is still standing', async () => {
    const ws = newUlid();
    const prj = newUlid();
    const user = newUlid();
    const projectMode = newUlid();
    const workspaceMode = newUlid();
    const explicitMode = newUlid();

    // Founded (AMENDED 2026-09-29, owner ruling A) so that rule A's implicit
    // membership is ALSO on the table: a revoked member must lose the implicit
    // set as well as the standing roster row, and an unfounded project would leave
    // that half of the ruling unmeasured.
    await seedProject(db.pool, ws, prj);
    await seedMember(db.pool, ws, user, 'member', [{ projectId: prj }]);
    // All three resolved modes, because the guarantee is enforced at two
    // independent points and each mode reaches a different one. `project` is
    // the mode a project attachment answers, so it is the one the surviving
    // roster row would speak to; `workspace` and `explicit` never consult the
    // project set at all and are answered by the workspace role alone.
    await seedTicket(db.pool, { workspaceId: ws, projectId: prj, ticketId: projectMode });
    await seedTicket(db.pool, { workspaceId: ws, projectId: prj, ticketId: workspaceMode });
    await applyAll(db.pool, [setVisibilityEnv(ws, workspaceMode, 'workspace')]);
    await seedTicket(db.pool, { workspaceId: ws, projectId: prj, ticketId: explicitMode });
    await applyAll(db.pool, [setVisibilityEnv(ws, explicitMode, 'explicit', [user])]);

    // The positive control: every one of them was visible a moment ago, so the
    // `false`s below are a change and not a fixture that never worked.
    expect(await canSee(db.pool, user, projectMode)).toBe(true);
    expect(await canSee(db.pool, user, workspaceMode)).toBe(true);
    expect(await canSee(db.pool, user, explicitMode)).toBe(true);

    await revokeMember(db.pool, ws, user);

    // The row a bare project-scope SELECT would return is PRESENT — printed,
    // not counted, because it is the whole premise of the case. If it were
    // gone, the `false`s below would prove nothing about the ruling: they would
    // only prove that a missing row confers nothing.
    const surviving = await db.pool.query(
      `SELECT workspace_id, user_id, scope_kind, project_id, role, project_admin
       FROM proj_memberships
       WHERE workspace_id = $1 AND user_id = $2
       ORDER BY scope_kind, project_id`,
      [ws, user],
    );
    expect(surviving.rows).toEqual([
      {
        workspace_id: ws,
        user_id: user,
        scope_kind: 'project',
        project_id: prj,
        role: 'member',
        project_admin: false,
      },
    ]);

    // …and it confers nothing. An explicit list that still NAMES them by id
    // confers nothing either — the list is not a membership.
    expect(await canSee(db.pool, user, projectMode)).toBe(false);
    expect(await canSee(db.pool, user, workspaceMode)).toBe(false);
    expect(await canSee(db.pool, user, explicitMode)).toBe(false);
  });

  /**
   * 6.60 — a visibility answer is scoped to ONE workspace. `canSee` takes no `workspaceId`: it resolves the role in the TICKET’s workspace, never in one the viewer happens to own.
   */
  it('a role is resolved in the TICKET’s workspace, not in one the viewer happens to own', async () => {
    const wsMine = newUlid();
    const wsTheirs = newUlid();
    const prj = newUlid();
    const outsideOwner = newUlid();
    const insideOwner = newUlid();
    const tkt = newUlid();

    await seedMember(db.pool, wsMine, outsideOwner, 'owner');
    await seedMember(db.pool, wsTheirs, insideOwner, 'owner');
    await seedTicket(db.pool, { workspaceId: wsTheirs, projectId: prj, ticketId: tkt });
    await applyAll(db.pool, [setVisibilityEnv(wsTheirs, tkt, 'workspace')]);

    // Owning one workspace answers nothing about another's ticket, even in the
    // widest mode there is.
    expect(await canSee(db.pool, outsideOwner, tkt)).toBe(false);
    expect(await canSee(db.pool, insideOwner, tkt)).toBe(true);
  });

  /**
   * AMENDED 2026-09-29, owner ruling (A). This case read "an admin who has not
   * joined the project sees its project-mode tickets only after joining" and it
   * seeded NO project, so under rule A it kept passing for a reason production
   * cannot produce. The project is founded now, and the answer is rule A's.
   */
  it('an admin who has not joined the project sees its project-mode tickets — rule A, no join needed', async () => {
    const ws = newUlid();
    const prj = newUlid();
    const admin = newUlid();
    const guest = newUlid();
    const tkt = newUlid();

    await seedProject(db.pool, ws, prj);
    await seedMember(db.pool, ws, admin, 'admin');
    await seedGuest(db.pool, ws, guest);
    await seedTicket(db.pool, { workspaceId: ws, projectId: prj, ticketId: tkt });
    expect(await canSee(db.pool, admin, tkt)).toBe(true);
    // The no-see witness the case used to be: someone on no project by any rule.
    expect(await canSee(db.pool, guest, tkt)).toBe(false);
  });
});
