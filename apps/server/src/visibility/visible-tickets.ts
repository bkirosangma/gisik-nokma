import type { Queryable } from '../db/queryable.js';
import { resolveEffectiveRole } from '../permissions/effective-role.js';
import { SqlParams } from '../read/sql-params.js';
import { visibleTicketsWhere } from '../read/visible-where.js';

/**
 * Every ticket in one workspace that this viewer may see — one round trip,
 * against `visibleTicketsWhere`.
 *
 * ## The decision table used to be WRITTEN HERE, and is not any more
 *
 * This function carried the SQL half of Plan 4's read table inline: three
 * hand-written queries, one per role branch. Plan 5 Task 5 needs the same
 * predicate for the list, board, search, attention and My Work endpoints, and
 * writing it a second time would have made a THIRD copy of a table this
 * function's own docblock already flagged as said twice. So the clause was
 * EXTRACTED to `../read/visible-where.ts` and this function became one of its
 * callers. Everything that was claimed here about exhaustiveness, about the
 * mode side not being compiler-checkable, and about the admin/member branch
 * moved with it — those are claims about the predicate, and leaving them here
 * describing a switch that no longer exists would be the drift the extraction
 * was for.
 *
 * Behaviour is unchanged and that is checked rather than asserted:
 * `test/visibility/visible-tickets.test.ts` is untouched by this change and
 * still passes, including the owner-bypass, cross-workspace and guest-inherits
 * cases.
 *
 * ## The rows are `proj_visibility`'s, and that is a fact about today
 *
 * The plan text has this function joining `proj_tickets` and returning ticket
 * rows. `proj_tickets` did not exist when this was written (Plan 3 Task 12 has
 * since landed it); what comes back is still the visibility row, which carries
 * `ticket_id`, `project_id` and the resolved audience. The declared contract is
 * `Array<Record<string, unknown>>` and Task 8's route reads `ticket_id`, so the
 * shape is invisible to the published interface. When a caller needs ticket
 * columns this becomes
 * `SELECT t.* FROM proj_tickets t JOIN proj_visibility v USING (ticket_id)`
 * with the same WHERE clause and the same tests — which is exactly the shape
 * Plan 5's read endpoints build, through the same predicate. Recorded as case
 * 6.61.
 *
 * ## The workspace clause is this function's, not the predicate's
 *
 * `visibleTicketsWhere` carries no tenancy of its own — for an owner it
 * compiles to `TRUE` — so the `v.workspace_id = $n` below is the only thing
 * scoping an owner's read to one workspace. It is bound through the same
 * `SqlParams` so its `$n` and the predicate's cannot drift apart.
 *
 * The `workspaceRole === null` early return is kept as well as the predicate's
 * `'FALSE'`: it is the honest answer without a round trip, and the predicate is
 * the reason a mistake here would still not leak. `eff.projects` is empty for
 * anyone with no workspace role (`resolveEffectiveRole`), so even the member
 * branch would match no project.
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

  const params = new SqlParams();
  const workspaceClause = `v.workspace_id = ${params.add(workspaceId)}`;
  const visibleClause = visibleTicketsWhere(eff, userId, params);
  // NO soft-delete predicate here, and it is a recorded ruling rather than an
  // omission (`docs/lanes/executor-state.md`'s "NAMED, NOT COVERED", item 4).
  // The reason is structural: this SELECT has no `proj_tickets` in its FROM at
  // all, so the column is not reachable without adding a join — and the same
  // note records that the route this feeds, `GET /v1/workspaces/:ws/tickets`,
  // **has no client consumer** (a controlled sweep of `apps/web/src`,
  // `apps/web/app`, `packages/app-core/src` and `packages/mcp-server/src` for
  // the collection URL returns empty, against a positive control through the
  // same pattern). A join added here would be a filter for a surface nothing
  // reads. Named so a later reader does not re-derive it; the docblock's own
  // "when a caller needs ticket columns" note is where the join lands the day
  // one exists.
  const { rows } = await db.query<Record<string, unknown>>(
    `SELECT v.* FROM proj_visibility v
      WHERE ${workspaceClause} AND ${visibleClause}
      ORDER BY v.ticket_id`,
    params.toArray(),
  );
  return rows;
}
