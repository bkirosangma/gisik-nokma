import type { Queryable } from '../db/queryable.js';
import { resolveEffectiveRole, type EffectiveRole } from '../permissions/effective-role.js';
import { canSeeResolved } from './can-see.js';

/**
 * A parent's child counts, as a viewer is honestly told them (Plan 4 Task 10).
 *
 * ## The product rule this shape exists to keep
 *
 * Spec §6: a rollup shows **true totals with the restriction named** — the
 * brief's example is "5 of 8 done · 2 restricted". The tempting implementation
 * shows a viewer only what they can see, which silently understates the total
 * and makes a parent look complete when it is not. So `total` is computed over
 * ALL direct children with no visibility filtering whatsoever, and the part the
 * viewer cannot reach is DISCLOSED beside it rather than subtracted out of it.
 * The count is true; the restriction is named; neither is hidden.
 *
 * ## `total` is per-PARENT; `restrictedCount` is per-VIEWER
 *
 * That asymmetry is the whole design and the thing tests must hold apart. Two
 * viewers of the same parent see the SAME `total` and different
 * `restrictedCount`s. Conflating them — computing the total from the viewer's
 * slice — is the defect this task is named for, and it is invisible to any test
 * that only ever asks one viewer.
 *
 * ## `visibleCount` is counted, never derived
 *
 * It is not `total - restrictedCount`. Both counters are incremented
 * independently in the same pass over the children, so `visible + restricted ===
 * total` is a real cross-check on that enumeration rather than an identity the
 * code just wrote. Deriving it by subtraction would make every such assertion
 * vacuous — a check that passes for a reason unrelated to the property it names,
 * which is this series' signature defect.
 *
 * ## `open` / `active` / `terminal` are ABSENT, not zero and not null
 *
 * The "5 of 8 **done**" half needs a per-category count over the children, which
 * means each child's `state_category` — and that lives in `proj_tickets`, via
 * `proj_rollups`. **Neither table exists on this branch** (Plan 3 Task 11 owns
 * `proj_rollups`, Task 12 owns `proj_tickets`), and no migration for either is
 * invented here: a table this plan authored would be a second, competing
 * definition of another plan's projection.
 *
 * They are left off the TYPE rather than shipped as `0` or `null`, and the
 * distinction is the point. A `0` would be a lie — "0 done" while five are done
 * is worse than saying nothing. A `null` still invites a client to render the
 * phrase. An absent key means the compiler demands a decision at every
 * construction site the day Plan 3 Task 11 lands, which is this codebase's
 * established idiom (the branded `EffectiveRole`, the bare exhaustive switches).
 * Recorded as case 6.82, owner Plan 3 Task 11.
 *
 * ## When `proj_rollups` lands, this does NOT become a column rename
 *
 * Plan 4's own cross-plan note (its line 46) names the columns
 * `ticket_id, open_count, active_count, terminal_count`. **That is not Plan 3's
 * table.** Plan 3 Task 11's migration creates `proj_rollups` with
 * `parent_ticket_id` (primary key), `workspace_id`, `project_id`,
 * `total_children`, `open_children`, `active_children`, `terminal_children`.
 * Two consequences worth writing down before someone codes against the wrong
 * one:
 *
 * - Plan 3 stores `total_children` DIRECTLY, so `total` comes from that column
 *   — not from `open + active + terminal` as Plan 4's text computes it.
 * - `total` here is "children `proj_visibility` knows about"; Plan 3's is
 *   "children `proj_tickets` knows about". Nothing today guarantees those two
 *   sets are equal, so the substitution is **not** a no-op and must be measured
 *   rather than assumed. Case 6.83, owner Plan 3 Task 11.
 */
export interface RollupView {
  /** ALL direct children. Never filtered by visibility — that is the honesty. */
  total: number;
  /** Direct children THIS viewer may see. Counted, not `total - restrictedCount`. */
  visibleCount: number;
  /** Direct children THIS viewer may NOT see. Per-viewer — computed at read, never stored. */
  restrictedCount: number;
}

type ChildRow = {
  ticket_id: string;
  workspace_id: string;
  project_id: string;
  resolved_mode: 'workspace' | 'project' | 'explicit';
  resolved_user_ids: string[];
};

/**
 * One parent's rollup for one viewer, or `null` if it has no direct children.
 *
 * ## `null` means "no children", and a nonexistent ticket answers it too
 *
 * A leaf and a ticket that never existed are the same `null` here, deliberately
 * and for the reason `canSee` gives at the same spot: giving them different
 * answers would put an existence oracle one layer down from the 404 Task 8
 * spent a commit removing. It also matches what Plan 3 Task 11 stores —
 * childless parents are ABSENT from `proj_rollups`, not zeroed (Plan 3 case
 * 5.17) — so `null` will keep meaning the same thing when the table lands.
 *
 * A `{ total: 0, visibleCount: 0, restrictedCount: 0 }` would be worse than
 * uninformative: it asserts a parent-with-no-children where the system has no
 * evidence there is a parent at all.
 *
 * ## This function performs NO visibility check on the parent
 *
 * It answers about `ticketId`'s children whoever asks. That is correct for what
 * it is — a counter, not a door — but it means **calling it without a guard
 * discloses a parent's child count to someone who may not see the parent**. Its
 * one caller is the single-ticket read, which asks it only after both of that
 * route's guards have passed. Hoisting the call above them is a real leak and
 * is **not observable through the route's responses** (the 404 body is fixed and
 * identical either way), so no test here claims to pin that ordering — a test
 * that did would be passing for a reason unrelated to the property it names.
 * The constraint is recorded instead, the way case 6.73 records the other
 * placement nothing can observe. Case 6.85.
 *
 * ## The role is resolved per CHILD WORKSPACE, not once from the first child
 *
 * `canSee`'s documented rule is that the workspace is the TICKET's, never the
 * caller's — a role held in workspace A must answer nothing about a ticket in
 * workspace B. So a viewer's `EffectiveRole` is resolved once per DISTINCT
 * `workspace_id` among the children and each child is judged with its own
 * workspace's role.
 *
 * The plan text resolved one role from `children.rows[0].workspace_id` and
 * applied it to every child. That is the same class of bug the route's
 * `workspace_id` clause exists to prevent (case 6.67), just entered from the
 * other side: with a cross-workspace child in the set, whichever workspace
 * happened to sort first would decide the audience for all of them.
 *
 * **Reachable rather than hypothetical**, and stated as observed rather than as
 * legal: nothing on this branch refuses a `ticket.created` in workspace B naming
 * a `parentId` in workspace A — `proj_visibility` writes `workspace_id` from the
 * envelope and `parent_id` from the payload, and no check compares them. That
 * sits alongside the family of unrefused corrupt parent links already recorded
 * (6.57 the stale `project_id`, 6.58 the parent cycle). Whether a cross-workspace
 * parent link is legal at all is not this task's to decide. Case 6.84, owner
 * Plan 3.
 *
 * Counting only the parent's own workspace would also be defensible; it is NOT
 * what is chosen, because it would silently drop children from a TRUE TOTAL,
 * which is the one number this task exists to keep honest. A child in the wrong
 * workspace is a corruption to refuse upstream, not a row to quietly not count.
 */
export async function rollupFor(
  db: Queryable,
  viewerId: string,
  ticketId: string,
): Promise<RollupView | null> {
  const { rows } = await db.query<ChildRow>(
    `SELECT ticket_id, workspace_id, project_id, resolved_mode, resolved_user_ids
     FROM proj_visibility WHERE parent_id = $1
     ORDER BY ticket_id`,
    [ticketId],
  );
  if (rows.length === 0) {
    return null;
  }

  // One resolve per distinct workspace, not one per child: the children of a
  // parent are nearly always in one workspace, and a per-child resolve would be
  // N round-trips for an answer that cannot differ within a workspace.
  const roleByWorkspace = new Map<string, EffectiveRole>();
  let visibleCount = 0;
  let restrictedCount = 0;

  for (const child of rows) {
    let eff = roleByWorkspace.get(child.workspace_id);
    if (eff === undefined) {
      eff = await resolveEffectiveRole(db, viewerId, child.workspace_id);
      roleByWorkspace.set(child.workspace_id, eff);
    }
    // Two counters, both incremented here. Neither is derived from the other —
    // see the note on `visibleCount`.
    if (
      canSeeResolved(eff, viewerId, {
        workspaceId: child.workspace_id,
        projectId: child.project_id,
        resolvedMode: child.resolved_mode,
        resolvedUserIds: child.resolved_user_ids,
      })
    ) {
      visibleCount += 1;
    } else {
      restrictedCount += 1;
    }
  }

  // `rows.length` and not `visibleCount + restrictedCount`: the total is a fact
  // about the parent that must not be reconstructed from the per-viewer pass,
  // or a bug in that pass would silently move the total too.
  return { total: rows.length, visibleCount, restrictedCount };
}
