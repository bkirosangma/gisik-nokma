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
 * and the `[owner, allTickets]` row in
 * `test/visibility/visible-tickets.test.ts` commented `from the bypass alone`.
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
 * The soft-delete predicate: a ticket whose `ticket.deleted` has not been undone.
 * Requires `proj_tickets` joined as alias `t`.
 *
 * ## Why this is a separate constant and NOT part of the predicate above
 *
 * A deleted ticket is in no view — the product's `Delete` is a
 * history-retaining removal, and the FAQ says what changes is that *"The ticket
 * stops appearing in views"* — but "deleted" and "may this viewer see it" are
 * different questions with different answers, and merging them would break both.
 *
 * 1. **Deletion is not visibility.** `visibleTicketsWhere` is cross-checked
 *    ticket-by-ticket against `canSeeResolved` in
 *    `test/read/visible-where.test.ts`. Widening the visibility predicate to
 *    also mean "not deleted" makes that test assert a different property than
 *    the one it was written for, and the deletion rule would then have no test
 *    of its own. A deleted ticket is still VISIBLE in the `canSee` sense — which
 *    is exactly why the history endpoint keeps serving it (the FAQ: *"Its
 *    history is retained, because other events cite it"*).
 * 2. **Not every caller of that predicate has a `proj_tickets` join.**
 *    `../visibility/visible-tickets.ts`'s `listVisibleTickets` selects from
 *    `proj_visibility v` alone, with no `t` in its FROM at all. An
 *    `AND t.deleted_at IS NULL` folded into the predicate would be a Postgres
 *    "missing FROM-clause entry for table t" at runtime for that caller, not a
 *    compile error.
 * 3. **Being a separate constant is the point.** This repo's read paths are
 *    hand-written SELECTs, not one shared assembler (the correction to the
 *    soft-delete brief, 2026-09-20, which measured the premise wrong). The only
 *    way to enumerate the coverage is `grep -rn "LIVE_TICKET_WHERE"
 *    apps/server/src/` — one spelling, one list, and a view site that forgets it
 *    is visible as an absence from that grep rather than as a silently reused
 *    predicate nobody can audit.
 *    ⚠ **This sentence gave a COUNT ("eleven") and it is withdrawn: neither the
 *    author nor an independent reviewer could reproduce it.** Measured at this
 *    tree, from the command this paragraph names, `grep -rn
 *    "LIVE_TICKET_WHERE" apps/server/src/`: **9** executable
 *    `${LIVE_TICKET_WHERE}` sites across 6 files — the tenth hit is THIS
 *    docblock — plus **5** array members written `LIVE_TICKET_WHERE,` across 4
 *    files, the rest of that grep's hits being 6 import lines and this docblock.
 *    That is **14 uses of the constant, not the 13 recorded here**, and the
 *    missing one is `read/live-ticket.ts`, which asks the same constant at a
 *    route. **And no reading of "hand-written" yields 11.** The method is the
 *    thing that matters
 *    and the method is the grep — a bare number here was a claim about a
 *    universe nobody had pinned.
 *    ⚠ **And "14" was itself INCOMPLETE, for exactly the reason this paragraph
 *    gives.** It was produced by sweeping for the CONSTANT plus one known
 *    longhand predicate. A SECOND sweep —
 *    `git grep -nE 'deleted_at +IS +NULL' -- apps/server/src` — finds **4
 *    written longhand**, so **18 SQL statements carry the rule** (14 + 4), plus
 *    one TypeScript application at `../routes/my-work.ts:364` that no SQL sweep
 *    can see. Three of the four longhand sites were measured UNCONSTRAINED
 *    (89 tests green with each un-filtered) until cases 16.88–16.90 supplied
 *    fixtures. **A sweep is only as complete as its pattern: "the constant" is
 *    not "the rule".** The line cited above was `rollup.ts:261` and the
 *    predicate sits in the child query's own conjunct
 *    (`AND (t.deleted_at IS NULL OR t.ticket_id IS NULL)`, which a grep for
 *    those words finds and a line number does not keep — it has moved since
 *    this citation was written) — a citation that RESOLVED and was still wrong.
 *
 * AND it into every SELECT that serves a VIEW. Do NOT add it to
 * `../projections/tickets.ts`'s `getTicketStateFromDb` /
 * `getChildrenStatesFromDb` / `refreshTicketsForWorkflow`: those feed
 * `EngineContext`, and an engine that cannot see a deleted ticket refuses its own
 * undo (`ticket.restored`) with `unknown-ticket`. That file's docblock carries
 * the full reason.
 *
 * ## Why `t.` and not a bare column name
 *
 * Every view site here joins `proj_tickets` as `t` — with ONE exception, the
 * longhand predicate at `../routes/builder-reads.ts:504`, whose `t` is taken by
 * `proj_ticket_types` and which therefore uses `k`. ⚠ This sentence read "the
 * alias is the house convention at all eleven of them", carrying the same
 * withdrawn count as the paragraph above AND silently excluding the one site
 * that does not follow it. The qualification is what makes a
 * mis-aliased join a compile-time-invisible but immediate Postgres error rather
 * than a predicate that silently reads some other table's column.
 *
 * ## The container clause (Plan 1 Task 6, spec §4 T10)
 *
 * A ticket whose own `deleted_at` is null is still gone from every view once
 * its PROJECT is deleted (the project's contents go with it). The
 * `NOT EXISTS` reads `proj_projects` fresh on every call rather than a denormalized
 * flag on `proj_tickets` — the same reason `checkLifecycle`'s per-container
 * gates read `proj_workspaces`/`proj_projects` directly instead of writing a
 * ticket-level "ancestor deleted" column: one row is the only place the
 * container's own state can change, and a copy on every descendant would need
 * its own fold on every `project.deleted`/`project.undeleted`.
 */
export const LIVE_TICKET_WHERE =
  't.deleted_at IS NULL AND NOT EXISTS (SELECT 1 FROM proj_projects dp WHERE dp.project_id = t.project_id AND dp.deleted_at IS NOT NULL)';

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

/**
 * The note half of the same decision table, over alias `n` of `proj_notes`
 * (notes series, Plan 1 of 6, spec §4.3).
 *
 * ## It is the SQL spelling of `canReadNote`, and 18.021 is why that is allowed
 *
 * `../visibility/can-read-note.ts` is the definition; this is the only other
 * place the rule is written, and it exists because a LIST read cannot call a
 * function per row. The two are asserted EQUAL per user on one fixture (case
 * 18.021) — that case, and not this docblock, is what keeps them in step. Change
 * an arm in either and the case is what tells you.
 *
 * ## No parameter it does not use
 *
 * The `$memberProjectIds` value is added INSIDE the arm that reads it, not above
 * the branches. `SqlParams` is positional and `$n` must reference a bound value:
 * a guest takes the `project` arm out of the list, and a value added for it
 * would be bound with no `$n` to reference — Postgres answers "bind message
 * supplies N parameters, but prepared statement requires M". This is the same
 * hazard `visibleTicketsWhere`'s docblock records; here it would have fired,
 * because 18.021 walks every fixture user and two of them are guests.
 *
 * ## Owner and non-member return before adding anything
 *
 * `TRUE` for the owner and `FALSE` for a null role, both with NO value bound,
 * for the reason above and matching `visibleTicketsWhere` exactly.
 *
 * The inherit arm reaches `visibleTicketsWhere` over alias `v`, with
 * `proj_tickets` joined as `t` for `LIVE_TICKET_WHERE`. One consequence worth
 * naming: a note attached to a DELETED ticket is not admitted through it, which
 * is the SQL half of `loadNoteForVisibility`'s `ticketIsLive` filter.
 */
export function visibleNotesWhere(eff: EffectiveRole, userId: string, params: SqlParams): string {
  if (eff.workspaceRole === null) return 'FALSE';
  if (eff.workspaceRole === 'owner') return 'TRUE';
  const user = params.add(userId);
  const isGuest = eff.workspaceRole === 'guest';
  const inheritArm = `(n.scope_mode = 'inherit' AND EXISTS (
      SELECT 1 FROM proj_note_attachments na
      JOIN proj_visibility v ON v.ticket_id = na.ticket_id
      JOIN proj_tickets t ON t.ticket_id = na.ticket_id
      WHERE na.note_id = n.note_id AND ${LIVE_TICKET_WHERE} AND ${visibleTicketsWhere(eff, userId, params)}))`;
  const arms = [
    `n.author_id = ${user}`,
    isGuest ? null : `n.scope_mode = 'workspace'`,
    isGuest
      ? null
      : `(n.scope_mode = 'project' AND n.home_project_id = ANY (${params.add([...eff.projects.keys()])}::text[]))`,
    `(n.scope_mode = 'explicit' AND ${user} = ANY (n.scope_user_ids))`,
    inheritArm,
  ].filter((arm): arm is string => arm !== null);
  return `(${arms.join(' OR ')})`;
}
