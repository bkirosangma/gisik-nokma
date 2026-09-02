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
 * ## There is no `visibleCount`, and it was REMOVED rather than never tried
 *
 * A third field carrying "children this viewer may see" shipped first, counted
 * in the same pass rather than derived, on the argument that
 * `visible + restricted === total` would then be a real cross-check on the
 * enumeration instead of an identity the code just wrote. **That argument was
 * measured and it is false.** Replacing the counter with
 * `visibleCount: rows.length - restrictedCount` is behaviour-equivalent for a
 * correct implementation, so the mutation killed NOTHING in the whole server
 * suite, and anything a dropped child would have caused was already caught by
 * the exact `restrictedCount` assertions. The invariant was decoration, and a
 * derivable field defended by a decorative assertion is the shape this series
 * exists to refuse — so the field is gone, not kept with the claim quietly
 * softened. Case 6.88.
 *
 * The enumeration does get a second witness, and it is an independent one
 * rather than arithmetic: the cases cross-check `restrictedCount` against
 * `canSee` child by child, the same pairing `listVisibleTickets` is held to
 * (cases 6.63, 6.65). A literal expectation alone cannot catch this function
 * drifting from the one visibility decision; `canSee` alone can agree with it
 * vacuously; both together cannot.
 *
 * ## `terminal` LANDED here (case 6.82 closed); `open` / `active` are still ABSENT
 *
 * The "5 of 8 **done**" half needs a per-category count over the children,
 * which means each child's `state_category`. That column lives in
 * `proj_tickets`, and neither it nor `proj_rollups` existed when this file was
 * written — hence case 6.82's note that they were left off the TYPE rather than
 * shipped as `0` or `null`, "so the compiler demands a decision at every
 * construction site the day Plan 3 Task 11 lands". Both tables have since
 * landed and Plan 5 Task 7's `TicketCard` is the first construction site that
 * needs the number, so the decision is made here:
 *
 * - `terminal` is now a field, counted over the SAME child rows this function
 *   already enumerates (see the join note below).
 * - `open` and `active` remain absent, for 6.82's original reason and no other.
 *   Nothing reads them yet, and a count nobody asked for would be a third
 *   number to keep honest for free.
 *
 * A `0` in place of a real count would have been the exact failure this file is
 * named against — "0 done" while five are done is worse than saying nothing.
 *
 * ## `terminal` discloses MORE than `total` does, and the spec says so
 *
 * `total` leaks the EXISTENCE of children a viewer cannot reach. `terminal`
 * additionally leaks something about their STATE. That is a bigger disclosure
 * and it is deliberate, not inherited from `total`'s precedent:
 * `docs/superpowers/specs/2026-08-20-gisik-nokma-product-design.md` line 116 —
 * "Derived parent progress is computed server-side over *all* children. A
 * viewer who cannot see two of them reads '5 of 8 done · 2 restricted' — true
 * counts, restriction named, nothing pretended absent." The "5" is a count over
 * all eight. `restrictedCount` is what keeps it honest.
 *
 * ## The category is JOINED onto this enumeration; it is NOT read from `proj_rollups`
 *
 * `proj_rollups` already stores `terminal_children` per parent, and taking the
 * number from there would be the obvious move. It is wrong, and case 6.83 asked
 * for the reason to be MEASURED rather than assumed. It now has been
 * (`test/read/ticket-cards.test.ts`, "MEASURES case 6.83"): the two tables do
 * not enumerate the same children.
 *
 * - This function reads `proj_visibility WHERE parent_id = $1` with **no
 *   workspace clause** — deliberately, see the cross-workspace note below.
 * - `getRollup` and `recomputeParent` are both `workspace_id = $1`-scoped.
 *
 * So a cross-workspace child (case 6.84, reachable today) is in one count and
 * not the other. Mixing a `total` from one table with a `restrictedCount` from
 * the other can therefore emit `restrictedCount > total`, which is an
 * incoherent triple rather than a small inaccuracy. One enumeration answers all
 * four numbers instead: a `LEFT JOIN proj_tickets` onto the rows already being
 * walked, so the child set is literally the same rows.
 *
 * ## `uncategorized` — the join's miss, counted rather than swallowed
 *
 * A child `proj_visibility` knows and `proj_tickets` has no row for has an
 * UNKNOWN category. Counting it as non-terminal would understate "done" while
 * looking exactly like a true count, which is this file's signature defect
 * entered from a new side. Throwing was considered and declined: the state is
 * unreachable through the shipped door (one ingest transaction writes both
 * projections or rolls back, and `applyTicketEvent` throws on a
 * `ticket.created` it cannot fold), but it is COMMON in fixtures that seed only
 * some projections — `test/helpers/seed.ts`'s `applyAll` applies four of them
 * and not `proj_tickets` — so a throw would convert honest partial fixtures
 * into crashes while proving nothing about the product.
 *
 * Counted, it is a true statement about those fixtures ("nine children, none of
 * them known to be done") and a countable integrity signal everywhere else. It
 * is 0 whenever both projections are current with the ledger — which is the
 * condition, not "always 0 in the product": one ingest transaction writes both
 * or rolls back, and `rebuildProjection` replays the whole ledger into one
 * projection inside one transaction, so what makes this nonzero is a caller
 * that advances one table and not the other. `terminal + uncategorized <= total`.
 */
export interface RollupView {
  /** ALL direct children. Never filtered by visibility — that is the honesty. */
  total: number;
  /**
   * Direct children whose `proj_tickets.state_category` is `'terminal'`.
   * Over ALL children, including ones this viewer may not see — spec line 116.
   */
  terminal: number;
  /**
   * Direct children `proj_tickets` has no row for, so their category is
   * unknown. Counted in `total`; counted in neither `terminal` nor its
   * complement. Always 0 for a ledger written through the shipped door.
   */
  uncategorized: number;
  /** Direct children THIS viewer may NOT see. Per-viewer — computed at read, never stored. */
  restrictedCount: number;
}

type ChildRow = {
  ticket_id: string;
  workspace_id: string;
  project_id: string;
  resolved_mode: 'workspace' | 'project' | 'explicit';
  resolved_user_ids: string[];
  /** From the LEFT JOIN: `null` when `proj_tickets` has no row for this child. */
  state_category: 'open' | 'active' | 'terminal' | null;
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
 * A `{ total: 0, restrictedCount: 0 }` would be worse than
 * uninformative: it asserts a parent-with-no-children where the system has no
 * evidence there is a parent at all.
 *
 * ## This function performs NO visibility check on the parent
 *
 * It answers about `ticketId`'s children whoever asks. That is correct for what
 * it is — a counter, not a door — but it means **calling it without a guard
 * discloses a parent's child count to someone who may not see the parent**.
 *
 * **It has TWO call sites and they govern SIX read paths, not one.** This
 * sentence used to say "its one caller is the single-ticket read", and Plan 5
 * Task 7 falsified it without touching it: `routes/tickets.ts` still asks after
 * both of that route's guards, but `read/ticket-cards.ts`'s `assembleTicketCards`
 * now asks once per card, and board, list, search, My Work and the attention
 * strip all call that. **Every one of the five passes a bound
 * `t.workspace_id` clause AND `visibleTicketsWhere` before a row reaches the
 * assembler**, so no parent is counted that its viewer may not see — checked at
 * all five sites, not assumed. The constraint below is therefore a constraint on
 * SIX paths, and the danger is a seventh: `fetchTicketRows` is exported, has no
 * production caller, and warns in its own docblock that it applies neither
 * predicate. A by-id endpoint reaching for that pair and gating only the
 * requested ids would call an unguarded counter. Hoisting a call above its
 * guards is a real leak and
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
  // LEFT, and joined on ticket_id ALONE. The child set is proj_visibility's and
  // this join may only ANNOTATE it, never shrink it — an inner join would
  // silently drop a child out of a TRUE TOTAL. ticket_id is globally unique in
  // both tables, so adding a workspace-scoped join condition would strip the
  // category off a cross-workspace child (case 6.84) and turn a known 'done'
  // into an `uncategorized`.
  const { rows } = await db.query<ChildRow>(
    `SELECT v.ticket_id, v.workspace_id, v.project_id, v.resolved_mode, v.resolved_user_ids,
            t.state_category
     FROM proj_visibility v
     LEFT JOIN proj_tickets t ON t.ticket_id = v.ticket_id
     WHERE v.parent_id = $1
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
  let restrictedCount = 0;
  let terminal = 0;
  let uncategorized = 0;

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
      restrictedCount += 1;
    }
  }

  // `rows.length`, and the loop above never touches it: the total is a fact
  // about the PARENT, and the one thing that must not be reconstructed from the
  // per-viewer pass — that reconstruction IS the defect this task is named for.
  return { total: rows.length, terminal, uncategorized, restrictedCount };
}
