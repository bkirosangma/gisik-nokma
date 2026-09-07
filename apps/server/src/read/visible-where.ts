import type { EffectiveRole } from '../permissions/effective-role.js';
import type { SqlParams } from './sql-params.js';

/**
 * Plan 4's read-visibility decision table as ONE SQL predicate, for the queries
 * that filter many tickets at once (list, board, search, attention, My Work).
 * Requires `proj_visibility` joined as alias `v`.
 *
 * ## This is an EXTRACTION, not a new copy — and two copies remain
 *
 * The SQL half of this table already existed, inline inside
 * `../visibility/visible-tickets.ts`, whose own docblock named the hazard:
 * "Once in `canSeeResolved`, once in SQL — the two-sources-of-truth shape this
 * series keeps catching." Writing the plan's Step-4 predicate beside it would
 * have made a THIRD. So the clause moved here and `listVisibleTickets` now
 * calls this function; there is no parallel SQL expression left in that file.
 *
 * State the residue honestly: extraction removed the third copy, it did NOT
 * produce a single source of truth. Two expressions of one rule remain —
 * `canSeeResolved` in TypeScript and this one in SQL — because the SQL is what
 * makes a list one round trip against an indexed predicate rather than a
 * workspace-sized read filtered in memory. The cost is paid by a test rather
 * than by a comment: `test/read/visible-where.test.ts` asserts, for every
 * viewer class, both the exact id set and that `canSee` agrees ticket by
 * ticket. Either alone passes for the wrong reason — the cross-check agrees
 * vacuously on two empty answers, the exact sets do not notice a `canSee` that
 * drifted.
 *
 * Every OTHER visibility reader on this branch defers to `canSeeResolved`
 * rather than re-expressing the table: `rollup.ts:183`, `visible-events-for.ts`
 * and `routes/tickets.ts` all call `canSee`/`canSeeResolved`. Checked by
 * `grep -rn "resolved_mode" apps/server/src/`, which finds SQL rows of the
 * table nowhere but here.
 *
 * ## The table, exactly (spec §6, `can-see.ts`)
 *
 * | viewer's workspace role | 'workspace' | 'project'          | 'explicit'      |
 * |---|---|---|---|
 * | null (non-member)       | no          | no                 | no              |
 * | guest                   | no          | no                 | only if listed  |
 * | member / admin          | yes         | only if on project | only if listed  |
 * | owner                   | yes         | yes                | yes             |
 *
 * **The owner row is a separate row, and the plan text's Task 5 table is wrong
 * about it.** That table collapses owner into "member / admin / owner", and its
 * Step-4 sample predicate has no owner branch — a predicate written from it
 * fails the agreement test on the first owner fixture. The oracle is the
 * implemented Plan 4 code, which says the opposite in three places:
 * `can-see.ts:101` (`case 'owner': return true`), `can-see.ts`'s own table
 * (owner is its own yes/yes/yes row, disclosed by owner decision 2026-08-27),
 * and `test/visibility/visible-tickets.test.ts:88` ("from the bypass alone").
 * So owner compiles to `TRUE` here.
 *
 * **Admins get no bypass.** `admin` shares the member `case` deliberately.
 *
 * ## The role side is compiler-exhaustive; the mode side, here, cannot be
 *
 * The role is walked by a BARE `switch` with no `default`, exactly as in
 * `canSeeResolved`, and this note moved here with the clause it is about. The
 * `string` return annotation is what does the work: a role no `case` names ends
 * the function without returning and tsc refuses it with TS2366. Adding
 * `| 'viewer'` to `WorkspaceRole` reddens BOTH files. Measured, not asserted —
 * an if-chain (which is what the draft of this file carried, and what
 * `canSeeResolved` carried before it was measured) compiles clean and silently
 * hands a new role the member branch, which is the whole `'workspace'`-mode
 * slice of the workspace in one round trip. Do not add a `default:` to quiet a
 * linter; it converts a compile error back into a runtime guess.
 *
 * The MODE side cannot have the same guard and that is not fixable here. The
 * modes are string literals inside a SQL string, which the compiler cannot see.
 * A fourth `resolvedMode` raises TS2366 in `canSeeResolved` and nothing here —
 * it would be a silent no-match, so it fails CLOSED (rows excluded from every
 * non-owner list) rather than granting. What catches the resulting drift is the
 * agreement test, and only if its fixture is extended to carry the new mode.
 * Recorded as case 6.65.
 *
 * ## Two things this predicate deliberately does NOT do
 *
 * - **No tenancy clause.** For an owner it compiles to `TRUE`, so the caller's
 *   own `workspace_id = $n` is the only thing standing between the owner of one
 *   workspace and the whole table. Every caller must supply it; the agreement
 *   test has a case that dies if this one stops being true.
 * - **No parameter it does not use.** The clauses are built INSIDE the branches
 *   rather than above the switch, because `SqlParams` is positional: a value
 *   added for a branch that returns `'TRUE'` would be bound with no `$n` to
 *   reference it, and Postgres answers "bind message supplies N parameters, but
 *   prepared statement requires M". The test asserts `params.toArray()` is
 *   empty for both constant returns.
 *
 * Membership arrives as an `EffectiveRole`, never as a direct `proj_memberships`
 * SELECT: a project-scope roster row survives a revocation by design, and
 * `resolveEffectiveRole`'s early return is what makes it inert (`can-see.ts`).
 */
export function visibleTicketsWhere(eff: EffectiveRole, userId: string, params: SqlParams): string {
  if (eff.workspaceRole === null) {
    return 'FALSE';
  }

  // A BARE switch with no `default` — see the exhaustiveness note above.
  switch (eff.workspaceRole) {
    // The owner reads the whole workspace (owner decision 2026-08-27), the same
    // disclosed power canSeeResolved grants. No parameter is added.
    case 'owner':
      return 'TRUE';

    // A guest reaches explicit lists and nothing else — no project clause at
    // all, matching canSeeResolved's guest branch, which does not consult
    // eff.projects either.
    case 'guest':
      return explicitAudienceWhere(userId, params);

    // member and admin: identical, because an admin gets no read bypass.
    case 'admin':
    case 'member': {
      const projects = [...eff.projects.keys()];
      return `(v.resolved_mode = 'workspace' OR (v.resolved_mode = 'project' AND v.project_id = ANY (${params.add(projects)}::text[])) OR ${explicitAudienceWhere(userId, params)})`;
    }
  }
}

/**
 * The `'explicit'` COLUMN of the table above, on its own: this ticket's resolved
 * audience names this user.
 *
 * `resolved_user_ids` is `text[]` — see the migration, which says why in words:
 * `json` has no equality operator and `verify-projections` diffs with `EXCEPT`,
 * which needs one for every column. So this is `= ANY (...)` and NOT the plan
 * text's `@> to_jsonb(...)`, which would raise 42883 against the shipped column.
 *
 * ## Exported for ONE caller, and exported rather than copied
 *
 * "Shared with me" (`routes/my-work.ts`'s `shared` key) asks a question no other
 * read asks: not *may this viewer see the ticket* but *was this ticket handed to
 * them BY NAME*. That is exactly this clause and nothing else, so it is exported
 * instead of restated — the module docblock above records that writing the SQL a
 * second time beside this file is how the third copy of the decision table
 * nearly happened, and a fourth would be the same mistake at column scale.
 *
 * **The resolved column, so an INHERITED audience counts.** A child that
 * authored no `visibility.set` of its own carries its nearest authoring
 * ancestor's audience in `resolved_user_ids` (`resolved_from` names whose), and
 * a person handed a parent errand has been handed its sub-errands with it. Using
 * `own_user_ids` here would answer a different and wronger question.
 */
export function explicitAudienceWhere(userId: string, params: SqlParams): string {
  return `(v.resolved_mode = 'explicit' AND ${params.add(userId)} = ANY (v.resolved_user_ids))`;
}
