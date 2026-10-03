import type { Queryable } from '../../src/db/queryable.js';
import { resolveEffectiveRole, type EffectiveRole } from '../../src/permissions/effective-role.js';
import { assigneeArmTickets } from '../../src/visibility/assignee-arm.js';
import { canSeeResolved } from '../../src/visibility/can-see.js';
import type { RollupView } from '../../src/visibility/rollup.js';

/**
 * The PRE-T11 `rollupFor`, frozen (smoothness T11, case 25.190). The body below is the
 * function exactly as it stood at `release/smoothness` 604242a1 (`rollup.ts:224-335`), one
 * query per parent, with only its name and its imports changed. It is the "before" half of
 * the before/after equality test: the batched `rollupsFor` must answer what this answers,
 * for every parent and every viewer class. Do NOT edit it to follow `rollup.ts`; a change
 * to the rollup's rules changes this file in the same commit as a deliberate act, or the
 * equality test is measuring a copy of itself.
 */
type ChildRow = {
  ticket_id: string;
  workspace_id: string;
  project_id: string;
  resolved_mode: 'workspace' | 'project' | 'explicit';
  resolved_user_ids: string[];
  state_category: 'open' | 'active' | 'terminal' | null;
};

export async function legacyRollupFor(
  db: Queryable,
  viewerId: string,
  ticketId: string,
): Promise<RollupView | null> {
  // LEFT, and joined on ticket_id ALONE. The child set is proj_visibility's and
  // this join may only ANNOTATE it, never shrink it — an inner join would
  // silently drop a child out of a TRUE TOTAL. ticket_id is globally unique in
  // both tables, so adding a workspace-scoped join condition would strip the
  // category off a cross-workspace child (case 6.84) and turn a known 'done'
  // into an `uncategorized`.
  // This site writes the predicate LONGHAND rather than splicing
  // `LIVE_TICKET_WHERE`, because it is the one view site whose `t` may be
  // ABSENT (the point two paragraphs down). The constant is referenced here so
  // `grep -rn "LIVE_TICKET_WHERE" apps/server/src/` still enumerates this file.
  //
  // `AND t.deleted_at IS NULL` is in the WHERE and NOT in the join's ON clause,
  // and the difference is the whole reason this is spelled out rather than
  // merged into the left join above. An ON-clause predicate cannot remove a row
  // (that is what LEFT means) — it would leave the deleted child in `rows` with
  // `state_category = null`, counted as `uncategorized`, which this file's own
  // docblock defines as "always 0 for a ledger written through the shipped
  // door". Soft-deleting a ticket would silently inflate a number that is
  // documented as an integrity signal. So the child LEAVES the enumeration.
  //
  // `OR t.ticket_id IS NULL` keeps the left join's other job intact: a child
  // `proj_tickets` has no row for (case 6.84, reachable today) has
  // `t.deleted_at = NULL` by the join miss, and a bare `t.deleted_at IS NULL`
  // in the WHERE would drop it — turning a cross-workspace child's
  // `uncategorized` and its `restrictedCount` contribution into silence. The
  // predicate is therefore "not known to be deleted", which is exactly the
  // question a soft delete can answer.
  //
  // This is a DEPARTURE from the "the join may only ANNOTATE, never shrink"
  // doctrine stated above, made deliberately and recorded here rather than
  // quietly: that doctrine protects the count against VISIBILITY (a viewer must
  // not shrink a true total), and a soft-deleted ticket is not a visibility
  // question — it is absent from every view by the product's own definition, so
  // a parent's progress that still counted it would be the "5 of 8" this file
  // exists to keep honest reading "5 of 8" about a ticket nobody can reach.
  const { rows } = await db.query<ChildRow>(
    // Task 6 (T10) added the container half — `AND NOT EXISTS (… dp.deleted_at
    // IS NOT NULL)` — inside the first disjunct only. It reads `t.project_id`,
    // which is NULL on the same join-miss row `t.ticket_id IS NULL` answers
    // for, so `NOT EXISTS` against a NULL project id matches no row and is
    // TRUE — it does not fight the join-miss escape, it is simply moot there.
    `SELECT v.ticket_id, v.workspace_id, v.project_id, v.resolved_mode, v.resolved_user_ids,
            t.state_category
     FROM proj_visibility v
     LEFT JOIN proj_tickets t ON t.ticket_id = v.ticket_id
     WHERE v.parent_id = $1
       AND ((t.deleted_at IS NULL
             AND NOT EXISTS (SELECT 1 FROM proj_projects dp WHERE dp.project_id = t.project_id AND dp.deleted_at IS NOT NULL))
            OR t.ticket_id IS NULL)
     ORDER BY v.ticket_id`,
    [ticketId],
  );
  if (rows.length === 0) {
    return null;
  }

  // One resolve per distinct workspace, not one per child: the children of a
  // parent are nearly always in one workspace, and a per-child resolve would be
  // N round-trips for an answer that cannot differ within a workspace.
  const roleByWorkspace = new Map<string, EffectiveRole>();
  let terminal = 0;
  let uncategorized = 0;
  // Children the AUDIENCE does not admit, and the subset of them the assignee arm may still open.
  let notAdmitted = 0;
  const armCandidates: string[] = [];

  for (const child of rows) {
    // Counted BEFORE the audience question and never inside it: the category
    // half is a fact about the parent's children, the restriction half is a
    // fact about the viewer, and the whole point of this file is that the two
    // are not computed from one another.
    if (child.state_category === null) {
      uncategorized += 1;
    } else if (child.state_category === 'terminal') {
      terminal += 1;
    }

    let eff = roleByWorkspace.get(child.workspace_id);
    if (eff === undefined) {
      eff = await resolveEffectiveRole(db, viewerId, child.workspace_id);
      roleByWorkspace.set(child.workspace_id, eff);
    }
    // The audience question is `canSeeResolved`'s, exactly as everywhere else —
    // no SQL and no branch here restates who may see what.
    const visible = canSeeResolved(eff, viewerId, {
      workspaceId: child.workspace_id,
      projectId: child.project_id,
      resolvedMode: child.resolved_mode,
      resolvedUserIds: child.resolved_user_ids,
    });
    if (!visible) {
      notAdmitted += 1;
      // A viewer with NO workspace role reaches nothing by assignment (case 6.276): such a child
      // stays restricted and is never put to the arm.
      if (eff.workspaceRole !== null) armCandidates.push(child.ticket_id);
    }
  }
  // The per-viewer half follows `canSee`, including the assignee arm (R1, FD1 of the access follow-ups
  // plan): a child the viewer can open — a ticket assigned to them, or one inheriting from such a
  // ticket — is not "restricted".
  const armReach = await assigneeArmTickets(db, viewerId, armCandidates);
  const restrictedCount = notAdmitted - armReach.size;

  // `rows.length`, and the loop above never touches it: the total is a fact
  // about the PARENT, and the one thing that must not be reconstructed from the
  // per-viewer pass — that reconstruction IS the defect this task is named for.
  return { total: rows.length, terminal, uncategorized, restrictedCount };
}
