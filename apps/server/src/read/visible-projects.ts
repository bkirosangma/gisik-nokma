import type { EffectiveRole } from '../permissions/effective-role.js';
import type { Queryable } from '../db/queryable.js';

export type VisibleProject = { projectId: string; name: string };

/**
 * The projects a viewer may be told the NAME of, in one workspace.
 *
 * ## The rule is applied, not authored (rulings P32 and P38)
 *
 * `canSeeResolved` decides against a TICKET's audience, and a project has no
 * audience — no `resolvedMode`, no `resolvedUserIds` — so that function has
 * nothing to say here directly. What it does supply is the shape of the answer,
 * and its four branches are not uniform:
 *
 * - `owner` returns `true` unconditionally, so an owner sees every project.
 *   The exemption is the shipped switch's own, named there, not invented here.
 * - every other role reads `eff.projects`, which is the set
 *   `resolveEffectiveRole` produces and the same set `canSeeResolved` consults
 *   for project-mode tickets — with **no admin bypass, deliberate** at its own
 *   line. Ruling P38 extends that branch to this door rather than the
 *   `workspace`-mode branch, because P32 had already ruled the identical
 *   question one door over for `WorkItem.projectName`: a project's NAME is a
 *   disclosure and is not served for any other project, role-independent.
 *
 * ## Why a partial workspace is the CORRECT answer and not a defect
 *
 * A guest, member or admin outside project Y is told nothing about Y here.
 * They may still hold Y's project ID — `TicketCard` carries `projectId`
 * (`read/ticket-cards.ts`) and a workspace-mode ticket in ANY project is
 * visible to an admin or member — so this list is not an existence secret. It
 * is a NAME one, which is exactly the distinction P32 drew.
 *
 * The tie-break, recorded because the alternative is defensible: serving MORE
 * later is a widening and reversible; serving a name and retracting it is not.
 *
 * ## Ordering
 *
 * By `project_id`, so the answer is a function of the SET and not of insertion
 * order — the same reason `latestWorkflowDefs` sorts its input.
 */
export async function visibleProjects(
  db: Queryable,
  eff: EffectiveRole,
  workspaceId: string,
): Promise<VisibleProject[]> {
  if (eff.workspaceRole === null) return [];
  const { rows } = await db.query<{ project_id: string; name: string }>(
    `SELECT project_id, name FROM proj_projects
      WHERE workspace_id = $1
      ORDER BY project_id`,
    [workspaceId],
  );
  // The workspace predicate is in the SQL and the ROLE decision is not: this
  // function restates nothing about who may see what, it asks `eff` — which is
  // what makes it an application of `resolveEffectiveRole` rather than a second,
  // quieter visibility rule living in a query.
  const visible = rows.map((row) => ({ projectId: row.project_id, name: row.name }));
  if (eff.workspaceRole === 'owner') return visible;
  return visible.filter((project) => eff.projects.has(project.projectId));
}
