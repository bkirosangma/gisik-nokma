import type { Queryable } from '../db/queryable.js';
import { resolveEffectiveRole, type EffectiveRole } from '../permissions/effective-role.js';

/**
 * The ONE body every read route behind this gate refuses with.
 *
 * A single frozen object rather than a literal per route, because the property
 * these routes owe is that their two refusals — "no such project" and "not your
 * workspace" — are BYTE-IDENTICAL, and that a caller cannot tell one route's
 * refusal from another's. Two separately-spelled `{ error: 'not_found' }`
 * constants have that property by coincidence and lose it the first time one of
 * them grows a field. It lives here, beside `requireMember`, because this is
 * where the decision to answer 404 is made.
 */
export const READ_NOT_FOUND_BODY = { error: 'not_found' } as const;

/**
 * A project's workspace; `null` = no such project.
 *
 * Read routes take a project id from the URL and must know which workspace to
 * resolve the caller's role in BEFORE they can answer anything. Doing it the
 * other way round — trusting a workspace id the caller also supplied — is the
 * mistake `canSee` refuses to allow by taking no `workspaceId` parameter at
 * all: a caller who passes one can pass the wrong one, and an owner of a
 * workspace they do own would then read a ticket in a workspace they do not.
 *
 * `proj_entity_heads` is the source the plan declares. `proj_projects` is the
 * narrower one — it holds a row per FOUNDED project, from `project.created`
 * alone, while entity-heads holds one for any project entity that has ever
 * emitted an event. The two can differ only for a ledger no door can produce (a
 * `project.member_added` with no preceding `project.created`), and this
 * function's answer feeds a 404 either way, so the difference is recorded
 * rather than resolved. If a caller ever needs "founded", it needs
 * `proj_projects` and should say so.
 */
export async function workspaceOfProject(db: Queryable, projectId: string): Promise<string | null> {
  const { rows } = await db.query<{ workspace_id: string }>(
    `SELECT workspace_id FROM proj_entity_heads WHERE entity_kind = 'project' AND entity_id = $1`,
    [projectId],
  );
  return rows[0]?.workspace_id ?? null;
}

/**
 * The membership gate every read route stands behind: the caller's
 * `EffectiveRole` in this workspace, or `null` meaning "answer 404".
 *
 * 404 and not 403, deliberately, and for the same reason `canSee` gives an
 * invisible ticket and an unknown one the same answer: a 403 would confirm the
 * workspace exists to somebody with no business knowing it does.
 *
 * The role comes from `resolveEffectiveRole` and never from a direct
 * `proj_memberships` SELECT — a project-scope roster row survives a revocation
 * by design, and that function's early return is the only thing that makes it
 * inert (`../visibility/can-see.ts`, `../projections/proj-memberships.ts`).
 * Returning the whole `EffectiveRole` rather than a boolean is what lets the
 * route hand it straight to `visibleTicketsWhere` without resolving twice, and
 * the brand on it is what keeps the route from building one by hand.
 */
export async function requireMember(
  db: Queryable,
  userId: string,
  workspaceId: string,
): Promise<EffectiveRole | null> {
  const eff = await resolveEffectiveRole(db, userId, workspaceId);
  return eff.workspaceRole === null ? null : eff;
}
