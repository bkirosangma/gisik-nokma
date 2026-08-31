import type { Queryable } from '../db/queryable.js';
import { resolveEffectiveRole, type EffectiveRole } from '../permissions/effective-role.js';

/**
 * One ticket's audience as `proj_visibility` resolved it (Plan 4 Task 6):
 * the mode that actually applies after inherit chains have been walked, so
 * `resolvedMode` is never `'inherit'`, plus the people an `'explicit'` mode
 * names.
 *
 * `workspaceId` comes from the TICKET's row, not from the caller. That is the
 * whole of how `canSee` avoids answering a question about workspace B with a
 * role held in workspace A — see the note on `canSee`.
 */
export interface ResolvedVisibility {
  workspaceId: string;
  projectId: string;
  resolvedMode: 'workspace' | 'project' | 'explicit';
  resolvedUserIds: string[];
}

/**
 * The one visibility decision, pure (Plan 4 Task 7).
 *
 * Every read path, permission check and sync-down filter defers here. One
 * function to prove, and one function that can lie if it is wrong.
 *
 * ## The decision table, exactly (spec §6)
 *
 * | viewer's workspace role | 'workspace' | 'project'          | 'explicit'      |
 * |---|---|---|---|
 * | null (non-member)       | no          | no                 | no              |
 * | guest                   | no          | no                 | only if listed  |
 * | member / admin          | yes         | only if on project | only if listed  |
 * | owner                   | yes         | yes                | yes             |
 *
 * **Guests** see ONLY what an explicit list names them in. A guest belongs to
 * the workspace and to no project (the 2026-08-27 membership collapse), so
 * there is no project attachment to even ask about — and the guest branch below
 * therefore does not consult `eff.projects` at all. Should a project-scope row
 * for a guest ever exist (a rebuild can legitimately leave one standing), it
 * confers nothing here.
 *
 * **The owner** reads everything in their workspace (owner decision
 * 2026-08-27). The workspace is the container everything else sits inside, and
 * its owner owns the container. Reads leave no event trace, so this power
 * cannot be made honest by attribution — it is made honest by DISCLOSURE: the
 * visibility controls state plainly that the workspace owner can always see
 * (Plan 6 carries the copy). A stated power is not a lie; a hidden one is.
 *
 * **Admins get no bypass.** An admin not on a project does not see its
 * project-mode tickets, and an unlisted admin does not see explicit-mode
 * tickets. An admin who wants to read joins the project — an attributed event —
 * first. `hasProjectAdminRights` is deliberately NOT consulted here: it answers
 * "may they manage this project", which is a different question, and its own
 * docblock says so.
 *
 * **The explicit list is exactly the authored list.** Creator and assignee are
 * not implicitly appended. Locking yourself out is a legal (attributed) claim,
 * and the client warns before it is made.
 *
 * ## Both unions are exhaustive, and the unenumerated direction is DENY
 *
 * The role and the mode are each walked by a BARE `switch` — no `default`, no
 * `assertNever` helper. The `boolean` return annotation is what does the work:
 * a member of either union that no `case` names falls out of the switch, the
 * function ends without returning, and tsc refuses it with TS2366 ("Function
 * lacks ending return statement"). So a role or a mode nobody has enumerated
 * fails to COMPILE rather than picking up whatever the last branch happened to
 * grant.
 *
 * This was NOT true of the role side until it was measured. The role used to be
 * an if-chain — `null`, then `'owner'`, then `'guest'`, then everything else
 * fell through into the member branch. Adding `| 'viewer'` to `WorkspaceRole`
 * compiled clean and silently GRANTED the new role every `'workspace'`-mode
 * ticket, while adding a fourth `resolvedMode` was already caught. Same
 * function, two unions, opposite defaults. Adding `| 'viewer'` now raises
 * TS2366 here and in `listVisibleTickets`.
 *
 * Do not add a `default:` to either switch to quiet a linter. A `default` is
 * exactly the thing that restores the silent fall-through this shape exists to
 * prevent — it converts a compile error into a runtime guess.
 *
 * ## Determinism
 *
 * Nothing here reads a clock, a locale or a random source, and no caller may
 * make it do so: the whole input is `(eff, userId, v)`. That is not a stylistic
 * note — an authorization answer that varied with the day would be untestable
 * by construction.
 */
export function canSeeResolved(eff: EffectiveRole, userId: string, v: ResolvedVisibility): boolean {
  if (eff.workspaceRole === null) {
    return false;
  }
  // Both unions are walked by a BARE switch with no `default` — see the
  // docblock's exhaustiveness note. Do not add one.
  switch (eff.workspaceRole) {
    case 'owner':
      return true;
    case 'guest':
      return v.resolvedMode === 'explicit' && v.resolvedUserIds.includes(userId);
    case 'admin':
    case 'member':
      switch (v.resolvedMode) {
        case 'workspace':
          return true;
        case 'project':
          // No admin bypass — deliberate, see the docblock.
          return eff.projects.has(v.projectId);
        case 'explicit':
          return v.resolvedUserIds.includes(userId);
      }
  }
}

/**
 * The resolved audience of one ticket, or `null` if `proj_visibility` has no
 * row for it.
 *
 * `resolved_*` and never `own_*`: a ticket that authored nothing inherits, and
 * `own_mode` would read `'inherit'`, which is not an audience at all.
 */
export async function getResolvedVisibility(
  db: Queryable,
  ticketId: string,
): Promise<ResolvedVisibility | null> {
  const result = await db.query<{
    workspace_id: string;
    project_id: string;
    resolved_mode: ResolvedVisibility['resolvedMode'];
    resolved_user_ids: string[];
  }>(
    `SELECT workspace_id, project_id, resolved_mode, resolved_user_ids
     FROM proj_visibility WHERE ticket_id = $1`,
    [ticketId],
  );
  const row = result.rows[0];
  if (row === undefined) {
    return null;
  }
  return {
    workspaceId: row.workspace_id,
    projectId: row.project_id,
    resolvedMode: row.resolved_mode,
    resolvedUserIds: row.resolved_user_ids,
  };
}

/**
 * May this user see this ticket?
 *
 * ## Membership is read through `resolveEffectiveRole`, never by a direct
 * ## project-scope SELECT
 *
 * `membership.revoked` deletes the workspace-scope row ALONE — it may not reach
 * across into the rows the project entity's stream owns, or the table's
 * contents would depend on arrival interleaving
 * (`../projections/proj-memberships.ts`). So a project-scope row SURVIVES a
 * revocation, and `SELECT ... WHERE scope_kind = 'project'` returns rows for
 * people who are no longer in the workspace at all. The guarantee that the
 * deleted rows used to give lives in `resolveEffectiveRole`'s early return: no
 * workspace role means an EMPTY project set. It is documented on the migration's
 * `COMMENT ON TABLE`, in `effective-role.ts` and in `check-permission.ts`, and
 * it is enforced by that one line — so every reader here goes through the
 * function rather than the table.
 *
 * ## Two guards stand on this path, and what they cover is mode-dependent
 *
 * Measured at ASSERTION level, not at test-file level — the coarser
 * measurement is what made an earlier version of this note claim the two guards
 * were "independent rather than redundant", which is false on the mode the
 * ruling is actually about. `canSeeResolved` refuses a null workspace role
 * BEFORE the project set is ever consulted; `resolveEffectiveRole` separately
 * hands a revoked member no projects. Deleting one at a time:
 *
 * - **Neutralise only the null short-circuit** — route a null role into the
 *   member branch, which is what DELETING it did while the role was an
 *   if-chain; since the switch landed, deleting it outright is a TS2366 instead
 *   → `can-see.test.ts:232` (`workspaceMode`) fails, but **`:231`
 *   (`projectMode` — the revoked member of the ruling) still PASSES**, because
 *   the emptied project set answers it.
 * - **Delete only `resolveEffectiveRole`'s early return** → **nothing in this
 *   file fails**, and the whole server suite stays green but for Task 4's own
 *   `test/permissions/effective-role.test.ts` case "a revoked member resolves
 *   to nothing, though the roster row survives in the table".
 * - **Both together** → `:231` fails — the leak.
 *
 * So on the PROJECT-mode path the two are REDUNDANT: each alone blocks it, and
 * only removing both produces the leak. On the WORKSPACE-mode path they are
 * not — no project is consulted there, so the null short-circuit is the only
 * thing standing, which is why `:232` reddens on its own. Both guards are
 * present and the code is correct; what is recorded here is which one is doing
 * the work on which path.
 *
 * The early return is still worth keeping, and for a reason that is not
 * "independence" on this path: it protects readers that have **no null check of
 * their own**. `hasProjectAdminRights` is the live example — it consults
 * `eff.projects.get(projectId)?.projectAdmin` without ever asking whether the
 * workspace role is null, so a revoked member whose surviving project row
 * carries `project_admin = true` would answer TRUE there if the project set
 * were not emptied upstream.
 *
 * No test reachable from `canSee` can pin that early return, because no input
 * to it can make the project set matter while the workspace role is null. A
 * test here claiming to prove the ruling would be passing for a reason
 * unrelated to the property it named. The ruling's line is covered where it
 * lives.
 *
 * ## The workspace is the TICKET's, not the caller's
 *
 * The role is resolved in `v.workspaceId` — the workspace the ticket's own row
 * names — so a role held elsewhere answers nothing. `canSee` deliberately takes
 * no `workspaceId` parameter: a caller who passed one could pass the wrong one,
 * and an owner of a workspace they do own would then read a ticket in a
 * workspace they do not.
 *
 * ## Unknown and invisible are the same answer
 *
 * A ticket with no `proj_visibility` row answers `false`, identically to a
 * ticket the viewer may not see. Task 8's route turns both into the same 404,
 * so a member probing ids learns nothing; giving them different answers here
 * would put the oracle one layer down instead of removing it.
 */
export async function canSee(db: Queryable, userId: string, ticketId: string): Promise<boolean> {
  const v = await getResolvedVisibility(db, ticketId);
  if (v === null) {
    return false;
  }
  const eff = await resolveEffectiveRole(db, userId, v.workspaceId);
  return canSeeResolved(eff, userId, v);
}
