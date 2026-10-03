import type { Queryable } from '../db/queryable.js';
import type { EffectiveRole } from '../permissions/effective-role.js';
import { BLOCKED_MEMBERSHIP, BLOCKED_STATES_CTE } from './compile-filter.js';
import { ROSTER_VISIBLE_CLAUSE, isWorkspaceAdmin } from './membership-roster.js';
import { SqlParams } from './sql-params.js';
import { LIVE_TICKET_WHERE, visibleTicketsWhere } from './visible-where.js';

/** One project's countable work, as this caller may count it. */
export type ProjectCounts = { ticketCount: number; blockedCount: number };

/**
 * The counts on the workspaces directory, and the one rule that governs all of
 * them (Task 16, owner brief 2026-09-09).
 *
 * ## Every number here is the CALLER'S number, never the workspace's
 *
 * The product's existing answer to "may this person be told a total" is already
 * on the tree and it is not a single answer — it is a fork, stated verbatim at
 * `routes/builder-reads.ts`'s **`/ticket-types/:typeId/population`** door
 * (which says it is taking state-occupancy's terms; state-occupancy's own
 * comment two doors up words the same decision differently, so cite this one):
 *
 * > "the honest number is the whole workspace's, counted over tickets the caller
 * > may not see, **so there is no per-viewer variant to serve instead**" — and
 * > that endpoint is therefore admin-only.
 *
 * A workspace card is served to everybody, so admin-only is not available and
 * the other branch of that fork is the one taken: there IS a per-viewer variant
 * here, so serve it. `ticketCount` is the number of tickets in that project this
 * caller may see, through `visibleTicketsWhere` — the same predicate the board,
 * the list, search, attention and My Work all count through. A member outside a
 * project-mode project's audience sees a smaller number than an owner does, and
 * both numbers are true statements about their reader.
 *
 * **A scoped count is a different claim from `RollupToViewer`'s, deliberately.**
 * A rollup counts ALL of a ticket's children and names the withheld ones in
 * `restrictedCount`, because a parent's child count is already disclosed by the
 * parent-child relation the viewer can see. A project's ticket total is not
 * disclosed by anything, so the same shape would be a leak wearing an honest
 * label.
 *
 * ## A guest is served no count at all, and the field is ABSENT
 *
 * Not zero. Zero is a claim — "this project holds no work you can see" — and it
 * is one a guest could act on. The absence is what the card renders as
 * "Restricted".
 *
 * The withholding is decided HERE and returned as `null`, not as an empty Map.
 * An empty Map is what a member with no visible work anywhere also produces, and
 * the route would then have to ask `eff.workspaceRole === 'guest'` a second time
 * to tell the two apart — a second expression of one rule, which is the shape
 * this series keeps catching. `null` means withheld; a Map means served, and a
 * project absent from a served Map has an honest zero.
 *
 * ## `blockedCount` counts by the ticket's OWN workflow version, and says so
 *
 * `BLOCKED_STATES_CTE` resolves the LATEST version of each `(workspace_id,
 * workflow_id)` and `BLOCKED_MEMBERSHIP` matches `(t.workflow_id, t.state_id)`
 * against it, so a ticket standing in a state the newest version flags is
 * counted whatever version its own row is pinned at. That is inherited, not
 * chosen: BOTH constants are imported from `compile-filter.ts`, so this counts
 * by the same expression `FilterSpec.blocked` compiles — the one the board, the
 * list and the attention strip already use. `BLOCKED_MEMBERSHIP` was made
 * exported for this; restating it here while importing only the CTE would have
 * been the half-measure that looks like sharing, and it is how the card and the
 * strip it links to would come to disagree about one word.
 */
export async function visibleProjectCounts(
  db: Queryable,
  eff: EffectiveRole,
  userId: string,
  workspaceId: string,
): Promise<Map<string, ProjectCounts> | null> {
  if (eff.workspaceRole === null || eff.workspaceRole === 'guest') {
    return null;
  }
  const counts = new Map<string, ProjectCounts>();

  const params = new SqlParams();
  // The tenancy clause is this function's, not the predicate's — for an owner
  // `visibleTicketsWhere` compiles to `TRUE`, so `v.workspace_id` is the only
  // thing standing between one workspace's owner and the whole table
  // (`visibility/visible-tickets.ts` says the same about its own copy).
  const workspaceClause = `v.workspace_id = ${params.add(workspaceId)}`;
  const visibleClause = visibleTicketsWhere(eff, userId, params);
  // `t.workspace_id = v.workspace_id` is not redundancy for its own sake: the
  // blocked predicate correlates on `t.workspace_id`, and this is the clause
  // that ties that correlation to the tenancy the row was admitted under. The
  // join key is the ticket id, and `proj_visibility` holds one row per ticket
  // (its migration's PRIMARY KEY), so the INNER JOIN drops nothing — proved by
  // the owner case, whose scoped count equals a raw `proj_tickets` count.
  //
  // **The tenancy clause is MEASURED, not asserted** (case 13.368's third
  // case). A reviewer found it surviving its own mutation: the route only reads
  // `counts.get()` for the ids `visibleProjects` returned, and `project_id` is a
  // global primary key, so a client-door world cannot tell the difference. The
  // world that can is the one the INTERNAL door allows — no existence check
  // runs there, so a ticket in workspace B can carry workspace A's
  // `project_id`, and without `v.workspace_id = $n` A's owner counts B's
  // ticket. The case seeds exactly that. This is the same discipline
  // `read/visible-where.ts` records for its own tenancy note ("the agreement
  // test has a case that dies if this one stops being true"); it had no such
  // case until that review.
  const { rows } = await db.query<{ project_id: string; ticket_count: string; blocked_count: string }>(
    `WITH ${BLOCKED_STATES_CTE}
     SELECT t.project_id,
            COUNT(*) AS ticket_count,
            COUNT(*) FILTER (WHERE ${BLOCKED_MEMBERSHIP}) AS blocked_count
       FROM proj_tickets t
       JOIN proj_visibility v ON v.ticket_id = t.ticket_id
      WHERE ${workspaceClause} AND t.workspace_id = v.workspace_id AND ${visibleClause}
        AND ${LIVE_TICKET_WHERE}
      GROUP BY t.project_id`,
    params.toArray(),
  );
  for (const row of rows) {
    // `COUNT(*)` comes back as a string: it is bigint, and node-postgres refuses
    // to parse a bigint into a Number that cannot hold every value of the type.
    // Parsed here rather than cast in SQL so the refusal stays visible.
    counts.set(row.project_id, {
      ticketCount: Number(row.ticket_count),
      blockedCount: Number(row.blocked_count),
    });
  }
  return counts;
}

/**
 * How many people this caller may be told are in this workspace, or `null` when
 * they may be told nothing.
 *
 * ## It counts exactly the roster `GET /v1/workspaces/:id/members` would serve
 *
 * That route hides guests from anyone who is not an admin, and it refuses a
 * guest caller outright (the executor ruling of 2026-09-02, recorded at its own
 * door). A count is a weaker disclosure than a directory but it is the SAME
 * disclosure: `COUNT(*) FROM proj_memberships` served to a plain member would
 * say "there are four people here" where the roster says three, and the missing
 * one is precisely the guest the roster is hiding. So the two share the clause
 * — `ROSTER_VISIBLE_CLAUSE`, imported, not restated — and a test asserts this
 * number equals `readMembers(...).length` for every viewer class, because two
 * expressions of one rule drifting apart is this series' signature failure.
 *
 * `null` for a guest, and the route omits the key: see `visibleProjectCounts`
 * on why absence and zero are different claims.
 */
export async function visibleMemberCount(
  db: Queryable,
  eff: EffectiveRole,
  workspaceId: string,
): Promise<number | null> {
  if (eff.workspaceRole === null || eff.workspaceRole === 'guest') {
    return null;
  }
  // `isWorkspaceAdmin`, not a re-derivation: the roster route binds this same
  // function into `readMembers`, and the two answers must be one answer.
  const includeGuests = isWorkspaceAdmin(eff);
  const { rows } = await db.query<{ count: string }>(
    `SELECT COUNT(*) AS count
       FROM proj_memberships m
       JOIN "user" u ON u."id" = m.user_id
      WHERE m.workspace_id = $1
        AND m.scope_kind = 'workspace'
        AND ${ROSTER_VISIBLE_CLAUSE}`,
    [workspaceId, includeGuests],
  );
  return Number(rows[0]?.count ?? 0);
}

/**
 * The ids `visibleMemberCount` counts — the SAME clause (`ROSTER_VISIBLE_CLAUSE`, `isWorkspaceAdmin`), so the
 * home Members number and the people it lights cannot disagree with the roster. `null` for a guest, as there.
 */
export async function visibleMemberIds(db: Queryable, eff: EffectiveRole, workspaceId: string): Promise<string[] | null> {
  if (eff.workspaceRole === null || eff.workspaceRole === 'guest') return null;
  const { rows } = await db.query<{ user_id: string }>(
    `SELECT m.user_id
       FROM proj_memberships m
       JOIN "user" u ON u."id" = m.user_id
      WHERE m.workspace_id = $1
        AND m.scope_kind = 'workspace'
        AND ${ROSTER_VISIBLE_CLAUSE}
      ORDER BY m.user_id`,
    [workspaceId, isWorkspaceAdmin(eff)],
  );
  return rows.map((row) => row.user_id);
}

/**
 * The projects this caller can see at least one TICKET in, as a set of ids
 * (Task 18, owner ruling of 2026-09-09 — "option 2").
 *
 * ## Why this is a set of ids and not a number
 *
 * The card's string is *"N project · name restricted"*, and N is
 * `nameRestrictedProjectCount(...)` below — this set MINUS the projects the
 * caller is told the NAME of. Counting in SQL would either count tickets
 * (`COUNT(*)`, the wrong number entirely) or force the name-visibility rule to
 * be re-expressed as a second SQL filter beside `visibleProjects`, which is the
 * two-sources-of-truth shape this series keeps catching — and here it would let
 * the count and the served project list disagree about the same project.
 *
 * So the subtraction happens in TypeScript against `visibleProjects`' own
 * output, and this function answers only the half SQL is needed for.
 *
 * ## The tenancy clause is LOAD-BEARING here in a way it is not one function up
 *
 * `visibleProjectCounts` records that its own `v.workspace_id = $n` mutation
 * SURVIVES at the client door, because the route reads that map only for ids
 * `visibleProjects` returned. **This count is over exactly the ids
 * `visibleProjects` did NOT return**, so the inverse is true: without the
 * clause, a member of workspace A picks up every workspace-mode ticket in the
 * table, each foreign `project_id` lands outside A's named set, and A's card
 * inflates. That is directly observable through the client door and case 13.382
 * observes it.
 *
 * `DISTINCT` rather than `GROUP BY`: the answer is a set of projects, and the
 * ticket rows behind it are not wanted by anybody.
 */
export async function ticketVisibleProjectIds(
  db: Queryable,
  eff: EffectiveRole,
  userId: string,
  workspaceId: string,
): Promise<Set<string>> {
  if (eff.workspaceRole === null) return new Set();
  const params = new SqlParams();
  const workspaceClause = `v.workspace_id = ${params.add(workspaceId)}`;
  const visibleClause = visibleTicketsWhere(eff, userId, params);
  const { rows } = await db.query<{ project_id: string }>(
    // `LIVE_TICKET_WHERE` here for the conservative-direction reason this whole
    // function is written in: the answer is a set of projects the caller is told
    // they have sight into, and it is derived from ticket rows. A project whose
    // only sight-into row is a soft-deleted ticket is not a project they can see
    // anything in, and saying otherwise is the existence-disclosure the docblock
    // below refuses for the neighbouring count. ⚠ **There IS a fixture now**:
    // this sentence read "No fixture separates the two today; stated here rather
    // than left as an absence", and case 16.89's `ticketVisibleProjectIds` case
    // closed it — a project holding ONE tombstone and nothing else is asserted
    // ABSENT from the set, with a project holding live tickets as the control.
    `SELECT DISTINCT t.project_id
       FROM proj_tickets t
       JOIN proj_visibility v ON v.ticket_id = t.ticket_id
      WHERE ${workspaceClause} AND t.workspace_id = v.workspace_id AND ${visibleClause}
        AND ${LIVE_TICKET_WHERE}`,
    params.toArray(),
  );
  return new Set(rows.map((row) => row.project_id));
}

/**
 * *"N project · name restricted"* — how many projects this caller already holds
 * the ID of, and may not be told the NAME of.
 *
 * ## The owner ruled this, and ruled OUT the obvious neighbour
 *
 * Owner, 2026-09-09, verbatim: *"go with 2: Count only projects the guest
 * already has sight into."* The escalation that produced it
 * (`docs/lanes/owner-question-restricted-project-count.md`) put three options
 * up. **Option 3 — count every project in the workspace the caller cannot name
 * — is REFUSED**, and the refusal is the whole content of this function: a
 * caller with no sight into a project is not told it exists, so a total would
 * be a plain existence disclosure. Do not "simplify" this to
 * `allProjects − named`; case 13.382 seeds a project that separates the two and
 * dies on exactly that change.
 *
 * ## Why the number discloses nothing, in the ruling's own terms
 *
 * A project in this set is one the caller can see a ticket in, and
 * `read/ticket-cards.ts` puts `projectId` on the card — so the caller already
 * HOLDS the id. What is withheld is the NAME (`read/visible-projects.ts`:
 * *"this list is not an existence secret. It is a NAME one, which is exactly
 * the distinction P32 drew"*), and a count of ids the reader already carries
 * says only *some of what you hold has a name you may not be told*. That is the
 * P32 distinction applied, not a new concession.
 *
 * ## A GUEST IS SERVED THIS NUMBER, and that is not an oversight
 *
 * Both counts above open with `role === 'guest' → null`. **This one must not,
 * and copying that guard is the single most likely way to ship this field
 * broken**: the owner's reference draws *"1 project · name restricted"* on the
 * GUEST card, so a guest-withheld count is withheld from precisely the viewer
 * it exists for — and every fixture written from a member passes.
 *
 * The two are different disclosures. `ticketCount` is VOLUME, which nothing
 * else tells the caller. This is a count of ids already in their hands. A guest
 * reaches tickets only through an explicit audience (`visibleTicketsWhere`'s
 * guest branch), so their set is exactly the errands handed to them by name.
 *
 * ## It is never split by `archived`, and cannot be
 *
 * A project whose name is withheld has no `archived` flag as far as this caller
 * is concerned — `visible-projects.ts` serves that flag only alongside the name
 * it rides with. Splitting this number by archived state would disclose a
 * property of a project the caller may not name, so the toggle on the card
 * governs NAMED projects only and this number sits outside it.
 *
 * An owner is always `0` by construction — `visibleProjects` returns every
 * project for an owner, so nothing survives the subtraction. That is the
 * correct answer and not a special case, which is why there is no owner branch.
 */
export function nameRestrictedProjectCount(
  ticketVisible: ReadonlySet<string>,
  named: readonly { projectId: string }[],
): number {
  const namedIds = new Set(named.map((project) => project.projectId));
  let count = 0;
  for (const projectId of ticketVisible) {
    if (!namedIds.has(projectId)) count += 1;
  }
  return count;
}
