import type { WorkspaceRole } from '@gisik-nokma/domain';
import type { Queryable } from '../db/queryable.js';

/**
 * The brand that says an `EffectiveRole` came out of `resolveEffectiveRole`.
 *
 * A real runtime symbol, and deliberately NOT exported: a module that cannot
 * name it cannot write the property, so the only object literal in the program
 * that satisfies `EffectiveRole` structurally is the one this file returns.
 * `Symbol()` is unforgeable — `Symbol('x') !== Symbol('x')` — so there is no
 * string a caller could guess into place either.
 *
 * Ruling P22, closed here (case 6.64). Every safety property proved of
 * `canSeeResolved` rests on its `EffectiveRole` having been produced by
 * `resolveEffectiveRole`, because that is the only thing that makes a null
 * workspace role imply an EMPTY project set. TypeScript is structural, so
 * before this brand any object of the right shape was accepted — a caller
 * building one by hand, or caching one across a revocation, would have carried
 * a project set no early return had emptied, and nothing would have objected.
 *
 * ## What the brand buys, stated exactly
 *
 * It does NOT make `resolveEffectiveRole` the only possible source. A caller
 * can still write `{ workspaceRole, projects } as unknown as EffectiveRole`,
 * and two test files legitimately do, because `canSeeResolved` and
 * `checkRolePermission` are pure functions whose whole point is to be driven
 * across every role. What the brand buys is that such a caller must now write a
 * CAST — a deliberate, greppable act at a named site — instead of matching
 * structurally by accident. A silent grant becomes a visible assertion.
 */
const RESOLVED: unique symbol = Symbol('EffectiveRole.resolveEffectiveRole');

/**
 * What one user may be, in one workspace, as of the events committed so far.
 *
 * `workspaceRole === null` means "not a member of this workspace at all", and
 * when it is null `projects` is ALWAYS empty — see resolveEffectiveRole.
 *
 * Branded: see `RESOLVED` above. Never construct one by hand outside a test,
 * and never cache one across a membership change.
 */
export interface EffectiveRole {
  /** Proof of provenance, writable only inside this module. See `RESOLVED`. */
  readonly [RESOLVED]: true;
  /** null = not a member of this workspace at all. */
  workspaceRole: WorkspaceRole | null;
  /** Every project the user is on, with that project's project-admin flag. */
  projects: Map<string, { projectAdmin: boolean }>;
}

type MembershipRow = {
  scope_kind: string;
  project_id: string;
  role: WorkspaceRole;
  project_admin: boolean;
};

/**
 * Reads `proj_memberships` and answers what this user effectively is here.
 *
 * ## This function is the only safe reader of project-scope rows
 *
 * `proj-memberships.ts` explains why `membership.revoked` deletes the workspace
 * row alone: the roster rows are written by the PROJECT entity's event stream,
 * and a cross-entity delete would make the table's contents depend on arrival
 * interleaving, which the registry contract forbids and the verifier's EXCEPT
 * diff would report as drift.
 *
 * The guarantee that delete existed to give — a person put out of a workspace
 * resolves no project association — is given HERE instead, by the early return
 * below. Placement moved; the property did not weaken. It got stronger: it also
 * covers the row that a rebuild legitimately leaves standing, which a
 * table-level delete could not.
 *
 * The consequence for every other caller: a project-scope row in
 * `proj_memberships` is NOT on its own evidence that the user still belongs to
 * the workspace. Anything that wants "who is on project P" — Task 6's
 * `proj_visibility`, Task 7's `canSee` — must resolve membership through this
 * function rather than joining the roster rows directly.
 *
 * ## The role rules
 *
 * A user's workspace role is their workspace-scope row's role, or null. Their
 * project set is every project-scope row, with that row's project-admin flag.
 *
 * The plan text carried a second clause: a user holding only project-scope rows,
 * one of which carries role 'guest', resolves to workspace role 'guest'. It is
 * NOT implemented, because after the scope collapse (owner decision 2026-08-27)
 * it cannot fire: `membership.granted` refuses a `scope` outright
 * (`z.never()` in events/membership.ts), so a project-scope row is only ever
 * written by `project.member_added`, which hardcodes role 'member'. A branch
 * whose condition is unreachable by construction is a check that cannot fail;
 * it would read as guest handling while doing nothing. Guests still work — a
 * guest is granted at workspace scope with role 'guest' and reaches work through
 * `visibility.set`'s explicit lists (spec §6), which is where a guest's reads
 * come from anyway. If project-scope role grants ever return, this is the place
 * that changes, and the test that proves it must construct the project row with
 * role 'guest' at the ledger, not by writing the table by hand.
 */
export async function resolveEffectiveRole(
  db: Queryable,
  userId: string,
  workspaceId: string,
): Promise<EffectiveRole> {
  const result = await db.query<MembershipRow>(
    `SELECT scope_kind, project_id, role, project_admin
     FROM proj_memberships
     WHERE workspace_id = $1 AND user_id = $2`,
    [workspaceId, userId],
  );

  let workspaceRole: WorkspaceRole | null = null;
  const projects = new Map<string, { projectAdmin: boolean }>();
  for (const row of result.rows) {
    if (row.scope_kind === 'workspace') {
      workspaceRole = row.role;
    } else {
      projects.set(row.project_id, { projectAdmin: row.project_admin });
    }
  }

  if (workspaceRole === null) {
    // Not a member of the workspace, so on no project either — whatever roster
    // rows survive. A person can only be put on a project after being let into
    // the workspace, and being put out of the workspace is being put off
    // everything inside it.
    return { [RESOLVED]: true, workspaceRole: null, projects: new Map() };
  }

  return { [RESOLVED]: true, workspaceRole, projects };
}

/**
 * Management rights over one project: who may change its roster and its
 * tickets' visibility.
 *
 * Workspace owners and admins hold them everywhere (the spec has admins
 * managing projects and people); anyone else needs that project's
 * `projectAdmin` flag.
 *
 * This is NOT a read bypass. Task 7's `canSee` grants owners and admins no
 * visibility they were not given — do not reach for this function to answer
 * "may they see it".
 */
export function hasProjectAdminRights(eff: EffectiveRole, projectId: string): boolean {
  return (
    eff.workspaceRole === 'owner' ||
    eff.workspaceRole === 'admin' ||
    eff.projects.get(projectId)?.projectAdmin === true
  );
}
