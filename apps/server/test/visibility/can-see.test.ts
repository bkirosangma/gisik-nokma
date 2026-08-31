import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { newUlid } from '@gisik-nokma/domain';
import type { EffectiveRole } from '../../src/permissions/effective-role.js';
import { canSee, canSeeResolved, type ResolvedVisibility } from '../../src/visibility/can-see.js';
import { applyAll, revokeMember, seedGuest, seedMember, seedTicket, setVisibilityEnv } from '../helpers/seed.js';
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
  };
}

function vis(
  resolvedMode: ResolvedVisibility['resolvedMode'],
  resolvedUserIds: string[] = [],
  projectId: string = PRJ,
): ResolvedVisibility {
  return { workspaceId: 'ws', projectId, resolvedMode, resolvedUserIds };
}

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
    expect(canSeeResolved(eff('admin'), 'u', vis('project'))).toBe(false);
    expect(canSeeResolved(eff('admin'), 'u', vis('explicit', ['other']))).toBe(false);
    // The positive control: "an admin sees nothing" would also pass if admins
    // were treated as non-members. They are not — they are members with no
    // extra reach.
    expect(canSeeResolved(eff('admin'), 'u', vis('workspace'))).toBe(true);
    expect(canSeeResolved(eff('admin', [PRJ]), 'u', vis('project'))).toBe(true);
    expect(canSeeResolved(eff('admin'), 'u', vis('explicit', ['u']))).toBe(true);
  });

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

  it('THE RULING: a revoked member resolves nothing though their project-scope row is still standing', async () => {
    const ws = newUlid();
    const prj = newUlid();
    const user = newUlid();
    const tkt = newUlid();

    await seedMember(db.pool, ws, user, 'member', [{ projectId: prj }]);
    await seedTicket(db.pool, { workspaceId: ws, projectId: prj, ticketId: tkt });
    // Project default: ticket.created leaves own_mode 'inherit' and a root
    // resolves to 'project'. So this is the mode a project attachment answers.
    expect(await canSee(db.pool, user, tkt)).toBe(true); // positive control, before

    await revokeMember(db.pool, ws, user);

    // The row a bare project-scope SELECT would return is PRESENT — printed,
    // not counted, because it is the whole premise of the case. If it were
    // gone, `canSee` returning false below would prove nothing about the
    // ruling: it would only prove that a missing row confers nothing.
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

    // …and it confers nothing, because canSee reads membership through
    // resolveEffectiveRole, whose empty-project-set early return is the only
    // thing standing here.
    expect(await canSee(db.pool, user, tkt)).toBe(false);
  });

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

  it('an admin who has not joined the project sees its project-mode tickets only after joining — an attributed event', async () => {
    const ws = newUlid();
    const prj = newUlid();
    const admin = newUlid();
    const tkt = newUlid();

    await seedMember(db.pool, ws, admin, 'admin');
    await seedTicket(db.pool, { workspaceId: ws, projectId: prj, ticketId: tkt });
    expect(await canSee(db.pool, admin, tkt)).toBe(false);

    await seedMember(db.pool, ws, admin, 'admin', [{ projectId: prj }]);
    expect(await canSee(db.pool, admin, tkt)).toBe(true);
  });
});
