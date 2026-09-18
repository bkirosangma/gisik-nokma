import type { PoolClient } from 'pg';
import {
  TICKET_EVENT_TYPES,
  applyTicketEvent,
  foldTicketToWorkflowVersion,
  workflowDefinedPayloadSchema,
  type LedgerEvent,
  type TicketState,
  type TicketStateDeps,
  type WorkflowDef,
} from '@gisik-nokma/domain';
import type { Queryable } from '../db/queryable.js';
import type { Projection } from './registry.js';
import { getTicketTypeLadderFromDb } from './ticket-types.js';
import { getWorkflowDefFromProjection, getWorkflowDefsInForce } from './workflows.js';

/**
 * Head state per ticket, driven by the SHARED reducer (Plan 3 Chain B Task 10;
 * coordination §8 position 5, which is why registering it INSERTS into
 * `./index.ts` between proj_projects and proj_memberships).
 *
 * `applyTicketEvent` is the one fold. The fixture suite runs it through
 * `buildMemoryContext`, Plan 10's replica runs it offline, and this projection
 * runs it against Postgres — so client and server cannot quietly disagree about
 * what a ticket is. Everything this module adds is persistence and lookups.
 *
 * ## Two things a definition-resolving projection has to get right
 *
 * 1. It resolves the WORKFLOW definition **as of the event it is applying**,
 *    never as of now (design decision 10, owner decision 2026-08-26). Plan 1's
 *    verifier rebuilds projection-OUTER — one projection at a time over the
 *    whole ledger — so proj_workflows is already at its newest version before
 *    this table replays its first event. Asking "latest" there re-derives a
 *    table that disagrees with the live one after any republish, and throws
 *    outright once a version has dropped a state a replayed transition names.
 *
 *    **The TICKET-TYPE lookup is NOT as-of, and "every definition" would be a
 *    false sentence here.** `getTicketTypeLadderFromDb` takes no sequence
 *    number and reads what proj_ticket_types holds NOW, because that table is
 *    last-definition-wins with no history to ask (`./ticket-types.ts`). So this
 *    table is a pure function of the ledger prefix for workflow versioning, and
 *    for type binding only until somebody re-points a ticket type at another
 *    workflow: after that, replaying the `ticket.created` resolves the NEW
 *    `workflowId` for a ticket the live path bound to the old one — the
 *    live-versus-rebuild drift class this series has already met three times,
 *    and it contradicts the owner's own "a re-binding affects new tickets only"
 *    (2026-08-26). It is the plan's **Open question 11**, scoped out
 *    deliberately rather than smuggled in: the fix is not symmetric with the
 *    workflow one, because giving proj_ticket_types history means changing its
 *    primary key, and `getTicketTypeFromDb` has readers in the engine context
 *    (Task 12) and in Plans 4–5. Recorded **UNASSIGNED** in
 *    `docs/plan-3-chain-b-handoff.md`: no plan in the series has an open task on
 *    that table's key, and parking it on one that has none would be a handoff
 *    nobody receives.
 * 2. It consumes `workflow.defined` and folds every row on that workflow
 *    forward (refresh on publish). A stored `state_category` that a new version
 *    has redefined is a lie that rollups, board columns and the overdue sweep
 *    all repeat.
 *
 * ## Why a `workflow` event may write `ticket` rows
 *
 * The registry contract says a handler may write only what the ledger totally
 * orders, and replay delivers per-entity causality alone: `workflow.defined`
 * belongs to a `workflow` entity stream, and the rows it touches belong to
 * `ticket` streams that stream does not order. That is legal HERE for one
 * reason and it must be stated rather than assumed — **the fold is monotone**.
 * `foldTicketToWorkflowVersion` returns the state unchanged when
 * `state.workflowVersion >= target.version`, and the SQL below selects only
 * `workflow_version < target.version`; the write is therefore a max-join, and a
 * max is insensitive to the order its inputs arrive in. Canonical replay hands
 * this projection EVERY ticket event before ANY workflow event (kind order:
 * `ticket` < `ticket-type` < `workflow`), which is as unlike arrival order as
 * the ledger gets, and the last `workflow.defined` still puts every row at the
 * same version. `test/proj-tickets.test.ts` proves it against the live table
 * rather than restating it.
 */

type TicketRow = {
  ticket_id: string;
  workspace_id: string;
  project_id: string;
  type_id: string;
  parent_id: string | null;
  workflow_id: string;
  workflow_version: number;
  state_id: string;
  state_category: TicketState['stateCategory'];
  assignee_id: string | null;
  collaborator_ids: string[];
  fields: TicketState['fields'];
  transitions: TicketState['transitions'];
  closed_at: Date | null;
  closed_by: string | null;
  /** `TicketState.rank`'s column (spec §8.1, 2026-09-18) — NULL for a ticket nobody has ranked. */
  rank: string | null;
};

/**
 * Row → `TicketState`, and TWO of the fields it produces have no column to come
 * from. Both are repopulated here, and dropping either is a total outage rather
 * than a missing field:
 *
 * - **`workspaceId`.** There IS a column, but it is not in the primary key, so a
 *   reader selecting by ticket id alone has to carry it out of the row.
 *   `checkTicketCreated`'s parent guard (controller ruling P12) is
 *   `parent.workspaceId !== env.workspaceId`, and `undefined !== <anything>` is
 *   ALWAYS TRUE — so a mapper that omits it refuses every parented
 *   `ticket.created` on the server with `hierarchy.unknown-parent`, a sentence
 *   about tenancy, on a pair of tickets sitting in the same workspace. It
 *   presents as a data problem and it is a mapping bug.
 * - **`kind: 'ticket'`.** No column carries it and none should — a table named
 *   proj_tickets holds tickets. `getTicketState` NARROWS on
 *   `state.kind === 'ticket'` (`checks/context-helpers.ts`) rather than casting,
 *   so an absent `kind` makes every ticket invisible to every check, landing at
 *   the same refusal by a different road.
 *
 * EXPORTED for `test/proj-tickets.test.ts`, which pins both through the real
 * check — a workspace-scoped reader cannot pin them, because the reader's own
 * predicate would refuse a foreign parent and the assertion would then pass
 * with `workspaceId` missing. Also exported for
 * `test/projections/tickets-closed.test.ts` (case 13.572), which reads
 * `closed_at`/`closed_by` back through this same function rather than through
 * a second, reimplemented mapping.
 *
 * Cast rather than parsed, unlike this repo's definition readers: `TicketState`
 * has no zod schema (it is a cross-plan TS type in `entity-state.ts`), and the
 * columns it is built from are constrained by the table — `state_category` by a
 * CHECK, the three jsonb columns by the reducer that wrote them.
 */
export function rowToTicketState(row: TicketRow): TicketState {
  return {
    kind: 'ticket',
    id: row.ticket_id,
    workspaceId: row.workspace_id,
    projectId: row.project_id,
    typeId: row.type_id,
    parentId: row.parent_id,
    workflowId: row.workflow_id,
    workflowVersion: row.workflow_version,
    stateId: row.state_id,
    stateCategory: row.state_category,
    assigneeId: row.assignee_id,
    collaboratorIds: row.collaborator_ids,
    fields: row.fields,
    transitions: row.transitions,
    // Both NULL is the common case — every ticket that has never been closed,
    // which is every row this table held before this migration (backlog/closed
    // spec §3.1). `??` is not enough here on its own: a row holding one NULL
    // and one attributed value cannot happen through `upsertTicket` (both
    // columns are written from the same `next.closed`), but this reader does
    // not assume that of every row it is ever handed and answers `null` unless
    // BOTH columns agree there is a claim.
    closed:
      row.closed_at === null || row.closed_by === null
        ? null
        : { actorId: row.closed_by, at: row.closed_at.toISOString() },
    // Read UNCONDITIONALLY, and the absent-versus-null distinction is the point
    // rather than a detail: `rank` is one column with one meaning (`NULL` = never
    // ranked), so there is no second field to disagree with and no fold to make.
    // `rank: row.rank` therefore emits the key on EVERY row, which is what keeps
    // this read model the same SHAPE as the reducer's output — the property the
    // dual-client rig compares with `toEqual` — and what lets the client's
    // `mapRank` refuse an absent key instead of defaulting it (case 13.703).
    rank: row.rank,
  };
}

/** This workspace's ticket, or null. */
export async function getTicketStateFromDb(
  db: Queryable,
  workspaceId: string,
  ticketId: string,
): Promise<TicketState | null> {
  const { rows } = await db.query<TicketRow>(
    'SELECT * FROM proj_tickets WHERE workspace_id = $1 AND ticket_id = $2',
    [workspaceId, ticketId],
  );
  const row = rows[0];
  return row === undefined ? null : rowToTicketState(row);
}

/**
 * DIRECT children only, ordered by ticket id.
 *
 * The parent-terminal invariant's "open children" are the direct non-terminal
 * children, and direct-only suffices by induction: the refusal holds at every
 * level, so a terminal child's own subtree was already settled when it went
 * terminal.
 */
export async function getChildrenStatesFromDb(
  db: Queryable,
  workspaceId: string,
  parentId: string,
): Promise<TicketState[]> {
  const { rows } = await db.query<TicketRow>(
    'SELECT * FROM proj_tickets WHERE workspace_id = $1 AND parent_id = $2 ORDER BY ticket_id',
    [workspaceId, parentId],
  );
  return rows.map(rowToTicketState);
}

/**
 * `workspace_id` is deliberately absent from the DO UPDATE list. It is written
 * once, on creation, from the event that created the ticket; nothing in the
 * vocabulary moves a ticket between workspaces, and a later event that somehow
 * claimed to would be rewriting the row's tenancy rather than its state.
 */
async function upsertTicket(db: PoolClient, next: TicketState): Promise<void> {
  await db.query(
    `INSERT INTO proj_tickets
       (ticket_id, workspace_id, project_id, type_id, parent_id, workflow_id, workflow_version,
        state_id, state_category, assignee_id, collaborator_ids, fields, transitions,
        closed_at, closed_by, rank)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
     ON CONFLICT (ticket_id) DO UPDATE SET
       project_id = EXCLUDED.project_id,
       type_id = EXCLUDED.type_id,
       parent_id = EXCLUDED.parent_id,
       workflow_id = EXCLUDED.workflow_id,
       workflow_version = EXCLUDED.workflow_version,
       state_id = EXCLUDED.state_id,
       state_category = EXCLUDED.state_category,
       assignee_id = EXCLUDED.assignee_id,
       collaborator_ids = EXCLUDED.collaborator_ids,
       fields = EXCLUDED.fields,
       transitions = EXCLUDED.transitions,
       closed_at = EXCLUDED.closed_at,
       closed_by = EXCLUDED.closed_by,
       rank = EXCLUDED.rank`,
    [
      next.id,
      next.workspaceId,
      next.projectId,
      next.typeId,
      next.parentId,
      next.workflowId,
      next.workflowVersion,
      next.stateId,
      next.stateCategory,
      next.assigneeId,
      JSON.stringify(next.collaboratorIds),
      JSON.stringify(next.fields),
      JSON.stringify(next.transitions),
      // Both from the SAME `next.closed`, on purpose (see `rowToTicketState`'s
      // reading of this row): a close writes both, a reopen (which folds to
      // `closed: null`) clears both, and the ON CONFLICT list above is what
      // makes the clearing reach an existing row rather than leaving it
      // holding a stale close forever.
      next.closed?.at ?? null,
      next.closed?.actorId ?? null,
      // One column, read straight off the state — and the `?? null` here is for
      // the same reason as the readers': `TicketState.rank?` is optional on the
      // TYPE, because hundreds of test literals predate the field. Every
      // producer sets it (the reducer writes `rank: null` at creation), so this
      // fallback is a reachability guard for hand-built states in tests, not a
      // second meaning for the column.
      next.rank ?? null,
    ],
  );
}

/**
 * Hands the pure reducer synchronous BY-ID lookups over everything it could ask
 * for, rather than over what this loader guessed it would ask for.
 *
 * Controller ruling P1: `TicketStateDeps.getWorkflow(workflowId)` is a pure
 * by-id lookup, and the reducer is the only thing that knows which id an event
 * needs, because the event is the only thing that knows. A
 * `ticket.workflow_rebound` asks for the payload's `toWorkflowId` — a workflow
 * the ticket is NOT on yet, which no loader inspecting the ticket's row would
 * think to fetch — so caller-side pre-selection resolves null and the reducer
 * throws on the very event the migration exists for.
 *
 * Both lookups are therefore whole-set and lazily parsed (`./workflows.ts`,
 * `./ticket-types.ts`): two small indexed reads per ticket event, and only the
 * one definition an event actually asks for pays a schema parse. The cost is
 * paid on events that consult no definition at all — `ticket.assigned`,
 * `ticket.field_set` — and that is the deliberate trade. A gate on "which event
 * types consult a definition" would be a statement about the reducer's
 * internals living in a different package, and when it drifted the symptom
 * would be the reducer's own `is not defined` throw, which names the ledger for
 * a loader's omission.
 *
 * `asOfWorkspaceSeq` is this event's own position in the workspace stream, and
 * it reaches ONE of the two lookups. The WORKFLOW set is the one that was in
 * force when the event happened, never the newest. The TICKET-TYPE ladder is
 * whatever proj_ticket_types holds NOW: that table is last-definition-wins with
 * no history, so there is no as-of question it can answer (`./ticket-types.ts`).
 * Do not read this loader as "every definition as of the event" — the second
 * half of point 1 in this file's header names the drift that costs, why it is
 * not fixed here, and where it is recorded.
 */
async function loadDeps(db: PoolClient, event: LedgerEvent): Promise<TicketStateDeps> {
  const types = await getTicketTypeLadderFromDb(db, event.workspaceId);
  const workflows = await getWorkflowDefsInForce(db, event.workspaceId, event.workspaceSeq);
  return {
    getTicketType: (typeId) => types.get(typeId),
    getWorkflow: (workflowId) => workflows.get(workflowId),
  };
}

/**
 * Refresh on publish (owner decision 2026-08-26, design decision 10): a new
 * version of workflow W re-categorises, renames or drops states that existing
 * tickets are standing in, so every row on W is folded forward in the same
 * transaction that published it.
 *
 * The workflow is keyed on the PAYLOAD's `id`, not on `event.entity.id`. Those
 * are the same value for a well-formed `workflow.defined` and they are NOT the
 * same subject: `proj_workflows` stores `workflow_id` from `payload.id`
 * (`./workflows.ts`), and `proj_tickets.workflow_id` holds whatever the ticket
 * type bound, which is also the payload's id. Keying on the entity id would be
 * a true statement about the event applied to the neighbouring question this
 * code is actually asking, and its failure mode is the throw below — "the
 * registration order is broken" — which would send a reader to the wrong file.
 *
 * The target definition is read through the same as-of lookup the reducer path
 * uses rather than parsed out of the payload: proj_workflows is registered
 * BEFORE this projection, so the version being published is already stored when
 * this runs and `published_workspace_seq <= event.workspaceSeq` includes it.
 * One code path for "which definition is in force here".
 */
async function refreshTicketsForWorkflow(db: PoolClient, event: LedgerEvent): Promise<void> {
  const workflowId = workflowDefinedPayloadSchema.parse(event.payload).id;
  const inForce = await getWorkflowDefsInForce(db, event.workspaceId, event.workspaceSeq);
  const target = inForce.get(workflowId);
  if (target === undefined) {
    throw new Error(
      `proj_tickets: workflow.defined for "${workflowId}" but proj_workflows holds no version at workspace_seq ${event.workspaceSeq} — projection registration order is broken`,
    );
  }

  // `workflow_version < target.version` is the monotone guard expressed in SQL,
  // so untouched rows never leave Postgres. `foldTicketToWorkflowVersion` holds
  // the same guard because Plan 10's replica has no SQL to hold it in — neither
  // copy is redundant, and deleting either breaks a different caller.
  const { rows } = await db.query<TicketRow>(
    `SELECT * FROM proj_tickets
      WHERE workspace_id = $1 AND workflow_id = $2 AND workflow_version < $3
      ORDER BY ticket_id`,
    [event.workspaceId, workflowId, target.version],
  );
  if (rows.length === 0) {
    return;
  }

  // Intermediate versions are fetched ONCE for the whole batch, not once per
  // row: a workspace with ten thousand tickets on one workflow must not issue
  // ten thousand lookups. `reduce`, not `Math.min(...spread)` — the row count is
  // a workspace's whole ticket table, and spreading it is an argument-limit
  // crash waiting for the first workspace big enough to matter.
  const oldest = rows.reduce((lowest, row) => Math.min(lowest, row.workflow_version), target.version);
  const cache = new Map<number, WorkflowDef>();
  for (let version = oldest + 1; version < target.version; version += 1) {
    const def = await getWorkflowDefFromProjection(db, event.workspaceId, workflowId, version);
    if (def !== null) {
      cache.set(version, def);
    }
  }
  // `null`, not `undefined`, for a version this cache cannot supply: that is
  // `foldStateIdForward`'s contract, and it is what makes a HOLE in the version
  // chain report as a hole instead of as an unmapped drop.
  const getVersion = (version: number): WorkflowDef | null => cache.get(version) ?? null;

  for (const row of rows) {
    await upsertTicket(db, foldTicketToWorkflowVersion(rowToTicketState(row), target, getVersion));
  }
}

/**
 * The folding ticket events that reach the ledger with NO existence check in
 * front of them — and the reason this projection may not simply fold them.
 *
 * `applyTicketEvent` throws for any non-`ticket.created` event on a ticket it
 * has never seen, and it is RIGHT to: the reducer folds only ACCEPTED events, so
 * meeting one in replay means ledger integrity is broken, and degrading
 * silently would put a ticket in a status nobody claimed. That reasoning holds
 * exactly where the door refuses the event first. It does for four of the
 * folding types — `ticket.transitioned` (`transition.ts`), `ticket.reparented`
 * and `ticket.field_set` and `ticket.workflow_rebound` (each `refuse('ticket.unknown')`)
 * — and the throw stays for all four.
 *
 * It does NOT for these three. `evaluateEvent`'s switch has no case for them, so
 * they fall through to `{ refused: false }` with no existence check, and the
 * server commits them today: `test/permissions/check-role-permission.test.ts`
 * ingests two `ticket.assigned` events against tickets that were never created,
 * and they are committed, not refused. Folding one would throw INSIDE the ingest
 * transaction — turning a submission the product currently accepts into a 500 —
 * and would leave the table unrebuildable from a ledger the product itself
 * wrote. Registering this projection is what makes that reachable; it was
 * latent, and it becomes live in this commit.
 *
 * The skip is deliberately NOT "skip whenever the ticket is unknown". That is
 * the shape this series keeps catching — two cases that cannot be told apart,
 * both treated as the permissive one — and here they CAN be told apart, by name,
 * against what the door actually covers. Nothing is invented either way: there is
 * no ticket to assign, so there is no row to write.
 *
 * THE UNDERLYING GAP IS NOT FIXED HERE and is not this task's: nothing refuses a
 * `ticket.assigned` (or either collaborator event) for a ticket that does not
 * exist, so the ledger can hold an assignment of nothing to somebody. That is a
 * refusal no plan document owns — recorded as a finding for the controller.
 * When it lands, this set becomes unreachable rather than wrong, and the two
 * lines below can go.
 *
 * `comment.added` and `attachment.added` are the same gap and are absent from
 * this set only because `apply` has already returned for them above, before the
 * row was read.
 */
const DOOR_LEAVES_EXISTENCE_UNCHECKED: ReadonlySet<string> = new Set([
  'ticket.assigned',
  'ticket.collaborator_added',
  'ticket.collaborator_removed',
]);

export const ticketsProjection: Projection = {
  name: 'proj_tickets',
  tables: ['proj_tickets'],

  async apply(event, tx) {
    // A workflow event is not a ticket event, but it changes what every ticket
    // on that workflow MEANS — so it is handled before the ticket-vocabulary
    // filter below, which would otherwise discard it.
    if (event.type === 'workflow.defined') {
      await refreshTicketsForWorkflow(tx, event);
      return;
    }

    // `comment.added` and `attachment.added` are in TICKET_EVENT_TYPES and the
    // reducer returns the state UNCHANGED for both — neither adds to head
    // state. Skipping them before `current` is read is therefore provably
    // identical for a ticket that exists, and it is the SAFE branch for one
    // that does not: `evaluateEvent` has no case for either type, so both fall
    // through to `{ refused: false }` with no existence check, and folding one
    // for a never-created ticket would throw inside the ingest transaction and
    // 500 the request.
    //
    // The skip is deliberately NOT "return whenever `current` is undefined".
    // That would swallow the genuine replay-integrity break the reducer is
    // contracted to throw on for the events that DO fold. Three of those —
    // `ticket.assigned` and both collaborator events — reach the same door with
    // no existence check either; that is a refusal nothing owns, recorded as a
    // finding rather than papered over here.
    if (event.type === 'comment.added' || event.type === 'attachment.added') {
      return;
    }
    if (!(TICKET_EVENT_TYPES as readonly string[]).includes(event.type)) {
      return;
    }

    const current = (await getTicketStateFromDb(tx, event.workspaceId, event.entity.id)) ?? undefined;
    if (current === undefined && DOOR_LEAVES_EXISTENCE_UNCHECKED.has(event.type)) {
      return;
    }
    const deps = await loadDeps(tx, event);
    await upsertTicket(tx, applyTicketEvent(current, event, deps));
  },

  async reset(tx) {
    // TRUNCATE, not DELETE (controller ruling P4), matching every shipped
    // projection.
    await tx.query('TRUNCATE proj_tickets');
  },
};
