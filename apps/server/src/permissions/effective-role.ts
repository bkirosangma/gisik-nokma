import type { WorkspaceRole } from '@gisik-nokma/domain';
import type { Queryable } from '../db/queryable.js';

/**
 * The workspace roles that are ON EVERY PROJECT of their workspace — rule A
 * (owner ruling 2026-09-29: "admins and members see every project in their
 * workspace by default"; access plan W1).
 *
 * The OWNER is here by deviation D1: owner reads were already total
 * (`canSeeResolved`'s owner arm), but the `ticket.created` door asks the project
 * set and has no owner exemption (`check-permission.ts:1372`), so without this
 * an admin could create where the owner could not. A GUEST is not here: a guest
 * reaches work through explicit lists and assignment (W3), never a project.
 *
 * NO DATA IS WRITTEN. The set is read from `proj_projects` on every resolve, so
 * a member who joined with zero roster rows — all fifteen in production on
 * 2026-09-29 — is on every project the moment this ships (W2, case 6.184).
 */
export const RULE_A_ROLES: ReadonlySet<WorkspaceRole> = new Set<WorkspaceRole>(['owner', 'admin', 'member']);

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
 * project set is every project-scope row, with that row's project-admin flag,
 * plus — for `RULE_A_ROLES` — every founded project of the workspace with the
 * flag off.
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
  opts?: { includeDeleted?: boolean },
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

  // Trash series, Plan 1 Task 5 (spec §4 T10): a deleted workspace has no
  // members as far as reads are concerned — resolves EXACTLY the value a
  // stranger gets, by falling into the same early return below, never a
  // hand-built one. Skipped once already a non-member: no answer changes.
  // Skipped when `includeDeleted` (the write door, so the owner can still
  // undelete; the engine, which judges truth and must not filter).
  if (workspaceRole !== null && !(opts?.includeDeleted ?? false)) {
    const { rows } = await db.query<{ deleted_at: Date | null }>(
      'SELECT deleted_at FROM proj_workspaces WHERE workspace_id = $1',
      [workspaceId],
    );
    if (rows[0]?.deleted_at != null) {
      workspaceRole = null;
    }
  }

  if (workspaceRole === null) {
    // Not a member of the workspace, so on no project either — whatever roster
    // rows survive. A person can only be put on a project after being let into
    // the workspace, and being put out of the workspace is being put off
    // everything inside it.
    return { [RESOLVED]: true, workspaceRole: null, projects: new Map() };
  }

  if (!RULE_A_ROLES.has(workspaceRole)) {
    return { [RESOLVED]: true, workspaceRole, projects };
  }
  // Rule A. Every founded, LIVE project of the workspace. A DELETED project is
  // excluded (coordinator amendment 2026-09-29, case 6.217): the doors that ask
  // `canSee` alone — ticket history, attachments, reconcile, the stream — have
  // no deletion predicate, so including it would widen trash Plan 1's
  // containment gap from "the project's explicit members" to "every admin and
  // member". Explicit roster rows below are untouched, so an explicit member of
  // a deleted project keeps exactly the pre-rule-A answer (case 6.186).
  //
  // IMPLICIT FIRST, EXPLICIT SECOND, and the order is load-bearing: an explicit
  // roster row carries `projectAdmin`, and writing the implicit `false` after it
  // would strip a project admin of their rights (case 6.181).
  const { rows: founded } = await db.query<{ project_id: string }>(
    'SELECT project_id FROM proj_projects WHERE workspace_id = $1 AND deleted_at IS NULL',
    [workspaceId],
  );
  const everyProject = new Map<string, { projectAdmin: boolean }>();
  for (const row of founded) everyProject.set(row.project_id, { projectAdmin: false });
  for (const [projectId, flag] of projects) everyProject.set(projectId, flag);
  return { [RESOLVED]: true, workspaceRole, projects: everyProject };
}

/**
 * Management rights over one project: who may change its roster and its
 * tickets' visibility.
 *
 * Workspace owners and admins hold them everywhere (the spec has admins
 * managing projects and people); anyone else needs that project's
 * `projectAdmin` flag.
 *
 * Reading is `canSee`'s question. Since rule A (2026-09-29) an owner, admin or
 * member reads every project's project-mode tickets through the project set,
 * not through this function.
 */
export function hasProjectAdminRights(eff: EffectiveRole, projectId: string): boolean {
  return (
    eff.workspaceRole === 'owner' ||
    eff.workspaceRole === 'admin' ||
    eff.projects.get(projectId)?.projectAdmin === true
  );
}
