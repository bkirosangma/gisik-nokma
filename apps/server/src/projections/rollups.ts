import type { PoolClient } from 'pg';
import { workflowDefinedPayloadSchema, type LedgerEvent } from '@gisik-nokma/domain';
import type { Queryable } from '../db/queryable.js';
import type { Projection } from './registry.js';

/**
 * Derived child progress — DIRECT children counted per state category, NEVER
 * authored (Plan 3 Chain B Task 11; coordination §8 position 6, directly after
 * proj_tickets, which is the ordering that makes every read below correct).
 *
 * ## What "never authored" means, and why it is bigger than "no INSERT"
 *
 * No event authors a rollup. There is no `rollup.*` event type, and nothing in
 * this file reads a NUMBER out of a payload: every count is
 * `count(*) FILTER (WHERE state_category = …)` over proj_tickets, recomputed
 * whole. The one payload field consulted anywhere here is `workflow.defined`'s
 * `id`, and it selects WHICH parents to recompute — never what to write.
 *
 * The second half is the one that is easy to lose: **a stale row asserts a
 * distribution nothing derived, exactly as an authored one would.** So the
 * trigger set below is enumerated against the events that can move a ticket's
 * `parent_id`, `state_category` or `project_id`, not against the events that
 * came to mind. That enumeration is also the determinism argument, which is
 * why it is written out once, here, rather than restated per branch.
 *
 * ## WHICH ENTITY'S STREAM OWNS EACH WRITE — and why live and rebuild agree
 *
 * The registry contract says a handler may write only keys its own entity
 * totally orders. **Every write this projection makes breaks that reading**,
 * and unlike proj_tickets' refresh-on-publish it is not one exceptional path:
 * a rollup keyed on parent P is written by events on P's CHILDREN's streams
 * (`ticket.created`, `ticket.transitioned`, `ticket.reparented`,
 * `ticket.workflow_rebound`) and on a WORKFLOW's stream (`workflow.defined`).
 * P's own stream never writes P's rollup. Many entity streams write one key.
 *
 * It is legal for a DIFFERENT reason than proj_tickets' monotone max-join, and
 * conflating the two would be this series' most expensive mistake — a true
 * statement about a neighbouring subject. The reason here is:
 *
 * 1. **Every write is a FULL RECOMPUTE, never an increment.** `recomputeParent`
 *    reads proj_tickets and writes the whole row. Its result is a function of
 *    proj_tickets' current content and of nothing else — not of the rollup
 *    row's previous value, not of how many triggers have fired, not of the
 *    order they arrived in. Two triggers naming the same parent with the same
 *    ticket table underneath write identical bytes.
 * 2. **proj_tickets is itself totally ordered by the ledger**, and this
 *    projection is registered AFTER it, so for any event the ticket table this
 *    reads has already absorbed that event.
 * 3. Therefore the final table is determined if, for every parent P, the LAST
 *    trigger naming P arrives no earlier than the last event that changes
 *    `{rows with parent_id = P}` or their `state_category`. **That is a
 *    property of the trigger set, and it is the whole correctness claim.**
 *
 * The events that can change that set, each with the trigger that covers it:
 *
 * | Event | What it moves | Trigger |
 * |---|---|---|
 * | `ticket.created` | adds a row under its parent | recompute that parent |
 * | `ticket.transitioned` | the child's `state_category` | recompute its parent |
 * | `ticket.workflow_rebound` | the child's `state_category` AND `workflow_id` | recompute its parent |
 * | `ticket.reparented` | the child's `parent_id` — TWO parents, and the old one is already overwritten | recompute the whole project |
 * | `ticket.deleted` | takes the child OUT of the counted set — the parent may lose its last one, and the parent is not named by the event | recompute the whole project (which is also the emptying path) |
 * | `ticket.restored` | puts the child BACK into the counted set, with the same two properties | recompute the whole project |
 * | `workflow.defined` | every category on that workflow, with nobody touching a ticket | recompute every parent with a child on it |
 *
 * And the ones that provably cannot, which is why they are absent rather than
 * forgotten: `ticket.assigned`, `ticket.collaborator_added`,
 * `ticket.collaborator_removed`, `ticket.field_set`, `comment.added` and
 * `attachment.added` touch none of `parent_id`, `state_category`, `project_id`
 * (`applyTicketEvent`, `packages/domain/src/ticket-state.ts`).
 *
 * **`ticket.workflow_rebound` is in that table because this task put it there.**
 * The plan's own Task 11 listing omits it, and the omission is not cosmetic: a
 * rebind moves a ticket onto another workflow's state, so its category changes
 * with no transition and no reparent. Live would keep the parent's pre-rebind
 * counts; a rebuild reads the ticket table at its final state and would produce
 * the post-rebind ones. That is live-versus-rebuild divergence — the class that
 * has bitten three projections in this series — and `test/proj-rollups.test.ts`
 * pins it in both paths.
 *
 * ## Rebuild, and the two shapes it takes
 *
 * `rebuildProjection('proj_rollups')` resets this table alone and replays the
 * whole ledger through it, with LIVE proj_tickets standing at its final state
 * throughout. `verify-projections` does the same into a shadow schema — and
 * there the ticket table this reads is `verify_shadow.proj_tickets`, because
 * the verifier creates a shadow copy of EVERY registered projection's tables
 * before it replays and rebuilds them in registration order, so proj_tickets'
 * shadow is complete before this projection's replay begins. Registration order
 * is load-bearing in three places, not one: the ingest transaction, the live
 * rebuild, and the verifier's shadow rebuild.
 *
 * In both shapes the ticket table is FIXED while this projection replays, so
 * every recompute writes the final answer and the last one wins trivially. The
 * live path arrives at the same rows by the argument above. What a rebuild
 * therefore cannot catch on its own is a parent that neither path ever
 * triggers — absent on both sides, and the diff green — so the test asserts the
 * literal expected rows beside the diff rather than only that the two agree.
 */

export type RollupRow = {
  parentTicketId: string;
  workspaceId: string;
  projectId: string;
  totalChildren: number;
  openChildren: number;
  activeChildren: number;
  /** Counts a Not-taken child as terminal (the structural fact). NOT a done count: no card route reads this table; `rollupsFor` is the reader that excludes it (wtg2 T17). */
  terminalChildren: number;
};

type RollupDbRow = {
  parent_ticket_id: string;
  workspace_id: string;
  project_id: string;
  total_children: number;
  open_children: number;
  active_children: number;
  terminal_children: number;
};

/**
 * One parent's derived progress, or `null` when it has no children.
 *
 * `null` is the honest answer for a leaf AND for a ticket that never existed:
 * this table holds no row for either, and inventing `{0, 0, 0, 0}` for the
 * first would be a distribution nothing derived. Plan 4's per-viewer read
 * (`src/visibility/rollup.ts`) already answers `null` on the same reasoning.
 *
 * Workspace-scoped, though `parent_ticket_id` alone is the primary key: a
 * caller who has a workspace in hand should not be able to read another
 * tenancy's counts by holding an id.
 */
export async function getRollup(
  db: Queryable,
  workspaceId: string,
  parentTicketId: string,
): Promise<RollupRow | null> {
  const { rows } = await db.query<RollupDbRow>(
    'SELECT * FROM proj_rollups WHERE workspace_id = $1 AND parent_ticket_id = $2',
    [workspaceId, parentTicketId],
  );
  const row = rows[0];
  if (row === undefined) {
    return null;
  }
  return {
    parentTicketId: row.parent_ticket_id,
    workspaceId: row.workspace_id,
    projectId: row.project_id,
    totalChildren: row.total_children,
    openChildren: row.open_children,
    activeChildren: row.active_children,
    terminalChildren: row.terminal_children,
  };
}

/**
 * Recompute ONE parent's direct-children counts from proj_tickets.
 *
 * ONE statement, and the file used to carry a second: a
 * `DELETE … WHERE NOT EXISTS (SELECT 1 FROM proj_tickets WHERE parent_id = $2)`
 * meant to drop the row of a parent that had just lost its last child. **It
 * could never fire, and a mutation deleting it killed nothing while two other
 * mutations killed in the same run** — so it was a statement that passed for a
 * reason unrelated to the property it named. Every one of this function's three
 * call sites hands it a parent that demonstrably HAS a child at that moment:
 * `recomputeParentOf` reads the parent off a ticket row that names it, and both
 * scans select `DISTINCT parent_id … WHERE parent_id IS NOT NULL` out of
 * proj_tickets. `NOT EXISTS` was therefore always false.
 *
 * The row of an emptied parent is removed by `recomputeProject`'s
 * project-scoped DELETE instead, and that is not an accident of layering: a
 * parent loses its last child either by a `ticket.reparented` — which is
 * exactly the event that recomputes the whole project — or, since 2026-09-20,
 * by a `ticket.deleted`, which this file's header predicted would "join the
 * trigger table in this file's header and bring its own emptying path with it".
 * `ticket.deleted`/`ticket.restored` do exactly that: the same project-scoped
 * recompute, whose trailing DELETE is the emptying path.
 *
 * **`deleted_at IS NULL` is in the count below, and that is what makes a
 * deletion able to empty a parent at all.** The predicate is the same one every
 * view applies (`read/visible-where.ts`'s `LIVE_TICKET_WHERE`): a soft-deleted
 * ticket is in no view, and a parent's progress is a view of its children.
 *
 * The remaining statement's `HAVING count(*) > 0` is what declines to write a
 * row for a childless parent at all: the aggregate would otherwise return one
 * row of zeros, which the table's own CHECK forbids and which would be an
 * invented parent.
 *
 * `min(project_id)` is EXACT, not an arbitrary pick from a group: every child
 * of one parent is in that parent's project, because `hierarchy.cross-project`
 * refuses both a creation and a reparent naming a parent in another project
 * (`packages/rule-engine/src/checks/hierarchy.ts`). If that refusal ever went
 * away this would silently pick one project and the project-scoped DELETE below
 * would then be looking in the wrong place, so the two are named together.
 *
 * `workspace_id` is deliberately absent from the DO UPDATE list, matching
 * proj_tickets: a rollup's tenancy is written once and nothing in the
 * vocabulary moves a ticket between workspaces, so a later write claiming to
 * would be rewriting the row's tenancy rather than its counts. `project_id` IS
 * in the list even though no event moves a ticket between projects: it is
 * derived from the children rather than from the caller, and a derived column
 * that refused to be re-derived would be the stale-row shape this file exists
 * to avoid.
 */
async function recomputeParent(
  tx: PoolClient,
  workspaceId: string,
  parentId: string,
): Promise<void> {
  await tx.query(
    // NOT converted to `LIVE_TICKET_WHERE` (Task 6, T10 coverage sweep), and
    // this one needed working out rather than assuming: `hierarchy.cross-project`
    // (`packages/rule-engine/src/checks/hierarchy.ts:157`) refuses a parent and
    // child in different projects, so every child THIS query scans shares ONE
    // parent's ONE project — a project's deletion therefore excludes either ALL
    // of a parent's live children or NONE, never a subset. The all-excluded case
    // makes `count(*) = 0`, which `HAVING count(*) > 0` below turns into ZERO
    // rows to insert — no write happens at all, and the row already on disk
    // (written while the project was live) is left stale rather than corrected.
    // There is therefore no reachable case in which the container clause could
    // be observed changing this query's answer, on this trigger or any other —
    // adding it would be an assertion with no case that can drive it. The
    // staleness itself is a real, PRE-EXISTING gap (the `workflow.defined`
    // trigger below has no trailing DELETE the way `recomputeProject` does for
    // the ticket-delete path), recorded here rather than fixed: fixing it is a
    // rollup-staleness question, not a T10 container-clause one.
    //
    // `draft_author_id IS NULL` (drafts T3, C1, spec R19): a draft is not a child anyone counts, so a
    // parent's progress never moves on work only its author can see.
    `INSERT INTO proj_rollups
       (parent_ticket_id, workspace_id, project_id,
        total_children, open_children, active_children, terminal_children)
     SELECT $2, $1, min(project_id), count(*),
            count(*) FILTER (WHERE state_category = 'open'),
            count(*) FILTER (WHERE state_category = 'active'),
            count(*) FILTER (WHERE state_category = 'terminal')
       FROM proj_tickets
      WHERE workspace_id = $1 AND parent_id = $2
        AND deleted_at IS NULL
        AND draft_author_id IS NULL
     HAVING count(*) > 0
     ON CONFLICT (parent_ticket_id) DO UPDATE SET
       project_id = EXCLUDED.project_id,
       total_children = EXCLUDED.total_children,
       open_children = EXCLUDED.open_children,
       active_children = EXCLUDED.active_children,
       terminal_children = EXCLUDED.terminal_children`,
    [workspaceId, parentId],
  );
}

/**
 * The parent of the ticket this event is about, recomputed — or nothing, when
 * the ticket has no parent or no row at all.
 *
 * The parent is read from proj_tickets rather than from the event's payload,
 * which unifies `ticket.created`, `ticket.transitioned` and
 * `ticket.workflow_rebound` into one branch and keeps this file's "no number
 * and no key comes from a payload" claim literally true.
 *
 * Reading the row means that during a rollups-only replay the row is at its
 * FINAL parent, not the parent it had when the event was applied. That is
 * harmless and it is worth saying why rather than leaving it to be
 * rediscovered: what the trigger set has to guarantee is that every parent
 * whose child set changed gets recomputed at some point at or after that
 * change, not that a particular trigger names a particular parent. A ticket
 * that moved was reparented, and `ticket.reparented` recomputes the whole
 * project, which covers the parent this branch would have named.
 *
 * A MISSING row is a no-op and never a throw. proj_tickets itself skips the
 * five event types the door leaves without an existence check, so a ledger the
 * product genuinely wrote can hold a ticket event against a ticket that has no
 * row; a projection that threw on it would be unrebuildable from that ledger,
 * which is the defect proj_tickets spent a commit avoiding.
 */
async function recomputeParentOf(tx: PoolClient, event: LedgerEvent): Promise<void> {
  const { rows } = await tx.query<{ parent_id: string | null }>(
    'SELECT parent_id FROM proj_tickets WHERE workspace_id = $1 AND ticket_id = $2',
    [event.workspaceId, event.entity.id],
  );
  const parentId = rows[0]?.parent_id ?? null;
  if (parentId !== null) {
    await recomputeParent(tx, event.workspaceId, parentId);
  }
}

/**
 * A reparent has TWO affected parents and this projection can only see one of
 * them: proj_tickets has already overwritten `parent_id` by the time this runs,
 * so the OLD parent is unrecoverable here. Recovering it would mean a channel
 * from one projection into the next, and projections that read each other's
 * intermediate state stop being independently rebuildable — the property Plan
 * 1's verifier rests on.
 *
 * So the scope is the whole project, which is a superset containing both:
 * `hierarchy.cross-project` refuses a reparent whose new parent is in another
 * project, and the ticket's own project never changes, so the old parent, the
 * new parent and the ticket are all in this one project. The extra parents cost
 * an idempotent rewrite each and nothing else.
 *
 * The trailing DELETE is THE ONLY DELETE IN THIS FILE, and it is what empties
 * the OLD parent's row when the reparent took its last child. `recomputeParent`
 * only ever visits parents that still have children, so nothing in the loop
 * above would have reached it — and a per-parent DELETE beside that upsert was
 * measurably unreachable, which is why it is not there any more. It also
 * handles a detach to root: `ticketReparentedPayload.newParentId` is nullable,
 * and a ticket moved to project root is a child of nobody.
 *
 * That makes this one statement load-bearing for every way a parent can lose
 * its last child — a reparent (both directions), and, since 2026-09-20, a
 * `ticket.deleted`; the undo reaches it by the same call.
 */
async function recomputeProject(
  tx: PoolClient,
  workspaceId: string,
  projectId: string,
): Promise<void> {
  // ORDER BY is not needed for correctness — each recompute is independent of
  // the others — but a deterministic write order makes any failure reproduce in
  // the same place twice.
  const { rows } = await tx.query<{ parent_id: string }>(
    `SELECT DISTINCT parent_id FROM proj_tickets
      WHERE workspace_id = $1 AND project_id = $2 AND parent_id IS NOT NULL
      ORDER BY parent_id`,
    [workspaceId, projectId],
  );
  for (const row of rows) {
    await recomputeParent(tx, workspaceId, row.parent_id);
  }
  // `NOT IN` over a subquery that can yield NULL matches nothing at all, which
  // is why the subquery carries the same `IS NOT NULL` filter as the scan above
  // rather than relying on the outer predicate.
  //
  // NOT converted to `LIVE_TICKET_WHERE` (Task 6, T10 coverage sweep): every
  // caller hands this function a `projectId` the door has ALREADY verified is
  // live at the instant of the triggering ticket event (`ticket.deleted`/
  // `restored`/`reparented`, the only three callers, one project id apiece).
  // The container clause would ask whether project $2 is deleted while the
  // query is already scoped to project $2 — a question this call site cannot
  // observe answered "yes", so there is no case that can drive it and no
  // reason to add an unobservable branch.
  await tx.query(
    `DELETE FROM proj_rollups
      WHERE workspace_id = $1 AND project_id = $2
        AND parent_ticket_id NOT IN (
          SELECT parent_id FROM proj_tickets
           WHERE workspace_id = $1 AND project_id = $2 AND parent_id IS NOT NULL
             AND deleted_at IS NULL AND draft_author_id IS NULL)`,
    [workspaceId, projectId],
  );
}

/**
 * Refresh on publish (owner decision 2026-08-26, design decision 10), and the
 * one branch here driven by an event that is not a ticket event at all.
 *
 * Every count in this table is a FILTER on `state_category`, and publishing a
 * version can move what a category MEANS for tickets nobody has touched. A
 * refresh that stopped at proj_tickets would leave each parent's progress
 * stating a distribution that no longer exists — and would make the
 * parent-terminal invariant go on refusing closes the new version has just made
 * legitimate, because `total - terminal` would still count a child whose state
 * the new version calls terminal.
 *
 * Scope: the distinct parents of tickets whose `workflow_id` is the published
 * workflow. That is a SUPERSET of the strictly affected set — parents of
 * tickets whose category actually moved — and it is deliberately the superset,
 * because the smaller set is not computable from here: this projection runs
 * after proj_tickets has folded, so the pre-fold categories are gone.
 * `recomputeParent` writes the same numbers when nothing changed, so the
 * superset costs work and never correctness. A parent whose children are all on
 * other workflows is untouched, which is right — its children's categories did
 * not move.
 *
 * The workflow is keyed on the PAYLOAD's `id`, not on `event.entity.id`, for
 * the reason `tickets.ts` gives at the same fork: `proj_tickets.workflow_id`
 * holds what the ticket type bound, which is the payload's id.
 * `checkWorkflowDefined` refuses a `workflow.defined` whose two ids disagree
 * (`packages/rule-engine/src/workflow-defined.ts`, pinned end to end by
 * `packages/rule-engine/fixtures/workflow-defined-refuses-entity-id-mismatch.json`),
 * so no ledger the door wrote can hold a mismatched pair and NO TEST HERE CAN
 * TELL THE TWO CHOICES APART — this is a claim about which subject the code is
 * naming, not one this suite can falsify. It matters anyway because the failure
 * mode differs from proj_tickets': that projection THROWS when the id resolves
 * to no workflow, and this one would simply recompute nothing and stay silent.
 */
async function recomputeParentsOnWorkflow(tx: PoolClient, event: LedgerEvent): Promise<void> {
  const workflowId = workflowDefinedPayloadSchema.parse(event.payload).id;
  const { rows } = await tx.query<{ parent_id: string }>(
    `SELECT DISTINCT parent_id FROM proj_tickets
      WHERE workspace_id = $1 AND workflow_id = $2 AND parent_id IS NOT NULL
      ORDER BY parent_id`,
    [event.workspaceId, workflowId],
  );
  for (const row of rows) {
    await recomputeParent(tx, event.workspaceId, row.parent_id);
  }
}

export const rollupsProjection: Projection = {
  name: 'proj_rollups',
  tables: ['proj_rollups'],

  async apply(event, tx) {
    switch (event.type) {
      // Not a ticket event, and handled first for that reason: it changes what
      // every ticket on the published workflow MEANS.
      case 'workflow.defined':
        await recomputeParentsOnWorkflow(tx, event);
        return;
      // One branch for the three events that add a child or move its category.
      // `ticket.workflow_rebound` belongs here and is absent from the plan's
      // own listing: a rebind changes `state_category` with no transition, so
      // leaving it out is a live-versus-rebuild divergence, not a slow path.
      // `ticket.published` (drafts T3, C1): the published draft joins its parent's child set exactly as a
      // created ticket does. A redacted publish finds no `proj_tickets` row: `recomputeParentOf` is a no-op.
      case 'ticket.created':
      case 'ticket.transitioned':
      case 'ticket.workflow_rebound':
      case 'ticket.published':
        await recomputeParentOf(tx, event);
        return;
      // The soft-delete pair (2026-09-20). This is the case this file's header
      // and `recomputeParent`'s docblock both PREDICTED — "Should a delete or an
      // archive event ever join the vocabulary, it joins the trigger table in
      // this file's header and brings its own emptying path with it" — and it is
      // the same scope as a reparent for the same reason: a delete takes a child
      // out of the set `recomputeParent` counts, and an undo puts it back, so
      // BOTH directions change that set and neither names the parent whose row
      // changes (the undo's ticket has no parent to read either).
      //
      // `recomputeProject` is the emptying path, and it is REQUIRED rather than
      // tidy: `recomputeParent` writes nothing for a parent with no live child
      // (`HAVING count(*) > 0`), so a parent whose last live child was just
      // deleted would keep its pre-delete counts forever without the trailing
      // DELETE.
      case 'ticket.deleted':
      case 'ticket.restored': {
        const { rows } = await tx.query<{ project_id: string }>(
          'SELECT project_id FROM proj_tickets WHERE workspace_id = $1 AND ticket_id = $2',
          [event.workspaceId, event.entity.id],
        );
        const projectId = rows[0]?.project_id;
        if (projectId !== undefined) {
          await recomputeProject(tx, event.workspaceId, projectId);
        }
        return;
      }
      // Two parents change and only one is still visible — see recomputeProject.
      case 'ticket.reparented': {
        const { rows } = await tx.query<{ project_id: string }>(
          'SELECT project_id FROM proj_tickets WHERE workspace_id = $1 AND ticket_id = $2',
          [event.workspaceId, event.entity.id],
        );
        const projectId = rows[0]?.project_id;
        if (projectId !== undefined) {
          await recomputeProject(tx, event.workspaceId, projectId);
        }
        return;
      }
      // Everything else, enumerated in this file's header rather than filtered
      // by a predicate: the remaining ticket events move none of `parent_id`,
      // `state_category` or `project_id`, so recomputing on them would write
      // the same bytes and skipping them is provably identical.
      default:
        return;
    }
  },

  async reset(tx) {
    // TRUNCATE, not DELETE (controller ruling P4), matching every shipped
    // projection.
    await tx.query('TRUNCATE proj_rollups');
  },
};
