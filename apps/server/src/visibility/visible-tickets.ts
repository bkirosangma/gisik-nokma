import type { Queryable } from '../db/queryable.js';
import { resolveEffectiveRole } from '../permissions/effective-role.js';

/**
 * Every ticket in one workspace that this viewer may see — the same decision
 * table as `canSeeResolved`, expressed as one SQL predicate so a list never
 * does N round-trips.
 *
 * ## The rows are `proj_visibility`'s, and that is a fact about today
 *
 * The plan text has this function joining `proj_tickets` and returning ticket
 * rows. **`proj_tickets` does not exist on this branch** — Plan 3 Task 12 owns
 * it and has not run — so the join is not written, and no migration for it is
 * invented here: a table this plan authored would be a second, competing
 * definition of Plan 3's projection. What comes back is the visibility row,
 * which carries `ticket_id`, `project_id` and the resolved audience. The
 * declared contract is `Array<Record<string, unknown>>` and Task 8's route
 * reads `ticket_id`, so the shape change is invisible to the published
 * interface; when `proj_tickets` lands, this becomes
 * `SELECT t.* FROM proj_tickets t JOIN proj_visibility v USING (ticket_id)`
 * with the same WHERE clause and the same tests. Recorded as case 6.61.
 *
 * ## This function is the decision table SAID TWICE
 *
 * Once in `canSeeResolved`, once in SQL — the two-sources-of-truth shape this
 * series keeps catching. It is kept because the SQL is what makes a list one
 * round trip against an indexed predicate rather than a workspace-sized read
 * filtered in memory, and the cost is paid by a test rather than by a comment:
 * `test/visibility/visible-tickets.test.ts` asserts, for EVERY viewer class in
 * one fixture, both the exact id set expected and that `canSee` agrees ticket
 * by ticket. Per-viewer expectations alone would not catch a branch that
 * disagrees; the cross-check alone can agree vacuously on two empty answers.
 * Both, together, are what stop the copies drifting.
 *
 * ## Membership through `resolveEffectiveRole`, never a direct SELECT
 *
 * A project-scope `proj_memberships` row survives a revocation by design (see
 * `canSee`'s docblock and `../permissions/effective-role.ts`). `eff.projects`
 * below is empty for anyone with no workspace role, which is where the guard
 * lives; `$3::text[]` is therefore `{}` for a revoked member and matches no
 * project. The `workspaceRole === null` early return makes that moot, and both
 * are kept: the return is the honest answer, the empty array is the reason a
 * mistake in the return would still not leak project-mode tickets.
 */
export async function listVisibleTickets(
  db: Queryable,
  userId: string,
  workspaceId: string,
): Promise<Array<Record<string, unknown>>> {
  const eff = await resolveEffectiveRole(db, userId, workspaceId);
  if (eff.workspaceRole === null) {
    return [];
  }

  // The owner reads the whole workspace (owner decision 2026-08-27) — the same
  // disclosed power `canSeeResolved` grants, and the reason an owner viewer is
  // one of the classes the cross-check enumerates.
  if (eff.workspaceRole === 'owner') {
    const { rows } = await db.query<Record<string, unknown>>(
      `SELECT v.* FROM proj_visibility v
       WHERE v.workspace_id = $1
       ORDER BY v.ticket_id`,
      [workspaceId],
    );
    return rows;
  }

  // A guest reaches explicit lists and nothing else — no project clause here at
  // all, matching canSeeResolved's guest branch, which does not consult
  // eff.projects either.
  if (eff.workspaceRole === 'guest') {
    const { rows } = await db.query<Record<string, unknown>>(
      `SELECT v.* FROM proj_visibility v
       WHERE v.workspace_id = $1
         AND v.resolved_mode = 'explicit'
         AND $2 = ANY (v.resolved_user_ids)
       ORDER BY v.ticket_id`,
      [workspaceId, userId],
    );
    return rows;
  }

  // member and admin: identical, because an admin gets no read bypass.
  const memberProjects = [...eff.projects.keys()];
  const { rows } = await db.query<Record<string, unknown>>(
    `SELECT v.* FROM proj_visibility v
     WHERE v.workspace_id = $1
       AND (
         v.resolved_mode = 'workspace'
         OR (v.resolved_mode = 'project' AND v.project_id = ANY ($3::text[]))
         OR (v.resolved_mode = 'explicit' AND $2 = ANY (v.resolved_user_ids))
       )
     ORDER BY v.ticket_id`,
    [workspaceId, userId, memberProjects],
  );
  return rows;
}
