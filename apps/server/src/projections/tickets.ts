import type { PoolClient } from 'pg';
import {
  TICKET_EVENT_TYPES,
  applyTicketEvent,
  foldTicketToWorkflowVersion,
  isRedactedTicketCreated,
  isRedactedTicketPublished,
  workflowDefinedPayloadSchema,
  type LedgerEvent,
  type TicketLink,
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
 *    **The TICKET-TYPE lookup is as-of too, since E6-13 (2026-09-21), by a
 *    different road.** `proj_ticket_types` is last-definition-wins with no
 *    history to ask (`./ticket-types.ts`), so until that task this lookup read
 *    what the table holds NOW, and this table was a pure function of the
 *    ledger prefix for workflow versioning but for type binding only until
 *    somebody re-pointed a ticket type at another workflow: after that,
 *    replaying the `ticket.created` resolved the NEW `workflowId` for a ticket
 *    the live path bound to the old one — the live-versus-rebuild drift class
 *    this series has met three times, contradicting the owner's own "a
 *    re-binding affects new tickets only" (2026-08-26) — and, when the new
 *    workflow was published AFTER the ticket, threw from the reducer instead,
 *    because a workflow not yet in force at the ticket's position was being
 *    asked for. `getTicketTypeLadderFromDb` now takes the event's position and
 *    answers as of it: a table row whose `defined_workspace_seq` post-dates the
 *    event is replaced by the ledger's own definition at that position. That
 *    row can post-date the event ONLY in a replay (its docblock cites the
 *    ingest lock that makes this so), so the live path is untouched and the
 *    ledger is read only for the tickets a later redefinition would otherwise
 *    misplace. The plan's **Open question 11** priced the fix as a
 *    primary-key change to `proj_ticket_types` with readers of
 *    `getTicketTypeFromDb` in the engine context (Task 12) and Plans 4–5 to
 *    move; none of that is touched — the table keeps one row per type and the
 *    ledger supplies the history. The consequence the question was recorded
 *    for (a rebuild that disagrees with live after a re-bind) is closed and
 *    measured in `test/verify-projections.test.ts`; the question's own text in
 *    `docs/plan-3-chain-b-handoff.md` carries a dated note saying so.
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
  /**
   * `TicketState.reopenedAt`'s column (spec §8.2, 2026-09-18) — NULL for a
   * ticket never reopened, or one transitioned since its last reopen.
   */
  reopened_at: Date | null;
  /**
   * `TicketState.deleted`'s columns — both NULL for a live ticket. The row is
   * NOT removed when these are set: the soft delete keeps the ledger and this
   * row, and the views are what exclude it (see `read/visible-where.ts`'s
   * `LIVE_TICKET_WHERE`). Nothing in this file filters on them.
   */
  deleted_at: Date | null;
  deleted_by: string | null;
  /**
   * `TicketState.draft`'s columns (drafts spec §2.3). All NULL on every non-draft. `draft_discarded` is
   * TRUE only between `ticket.discarded` and the erase (a crash window the sweep closes, T5).
   */
  draft_author_id: string | null;
  draft_at: Date | null;
  draft_discarded: boolean | null;
  /**
   * `TicketState.links`' column (typed-links T2, Knowledge Graph spec A §2.5): the source's OUTBOUND links as the
   * reducer folds them, `[]` for a ticket with none. `proj_ticket_links` is the queryable copy of the same links.
   */
  links: TicketLink[];
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
    // The instant, ISO-encoded, on the same rule as `rank` above: read
    // UNCONDITIONALLY so every row carries the key. `reopened_at` is
    // `timestamptz` and the domain field is an ISO string, so unlike `rank`
    // there IS a conversion here — and it is the reason `?? null` would be
    // wrong on the timestamp: `null.toISOString()` throws, so the null arm has
    // to be spelled out rather than falling through a default.
    //
    // `reopenedAt` is NOT a card field (`TicketCard`/`ListRow` do not carry it,
    // spec §8.2): it reaches a client only through this route's `ticketState`,
    // because the only reader that cares is the sweep on the server.
    reopenedAt: row.reopened_at === null ? null : row.reopened_at.toISOString(),
    // The soft-delete flag, on `closed`'s exact rule and for its exact reason:
    // both NULL is the common case, `??` alone is not enough because a row
    // holding one NULL and one attributed value cannot happen through
    // `upsertTicket` (both columns are written from the same `next.deleted`)
    // but this reader does not assume that of every row it is handed, and the
    // instant is `timestamptz` against a domain field that is an ISO string —
    // so `null.toISOString()` has to be spelled around rather than defaulted.
    //
    // Read UNCONDITIONALLY, so EVERY row carries the key: this is what keeps
    // this read model the same SHAPE as the reducer's output (the property the
    // dual-client rig compares with `toEqual`), and the `null` a live ticket
    // reads here is the same `null` the reducer writes at creation and folds
    // back on `ticket.restored`. The flag is NOT a filter here — see
    // `getTicketStateFromDb` below for why the engine's own reads must see
    // deleted tickets.
    deleted:
      row.deleted_at === null || row.deleted_by === null
        ? null
        : { actorId: row.deleted_by, at: row.deleted_at.toISOString() },
    // ABSENT on every non-draft, never `undefined`-valued and never null: the reducer writes no `draft` key
    // for a published ticket and `ticket.published` removes it, and the dual-client rig compares whole
    // states with `toEqual` (28.045). `draft_at` is `timestamptz` against an ISO string, so the null arm is
    // spelled out as `reopened_at`'s is.
    ...(row.draft_author_id === null || row.draft_at === null
      ? {}
      : {
          draft: {
            authorId: row.draft_author_id,
            at: row.draft_at.toISOString(),
            ...(row.draft_discarded === true ? { discarded: true as const } : {}),
          },
        }),
    // Absent when empty, the reducer's own shape (typed-links T1): the rig compares the two with toEqual. Unlike
    // `rank` and `deleted` above, the reducer never writes an empty `links` (its last removal drops the key), so the
    // column's `[]` reads back as no key at all.
    ...(row.links.length > 0 ? { links: row.links } : {}),
  };
}

/**
 * This workspace's ticket, or null.
 *
 * ## This read does NOT filter `deleted_at`, and that is load-bearing
 *
 * This reader is the ENGINE's own by-id read: it is what `engine-context.ts`
 * hands `EngineContext.getEntityState('ticket')`, which is how
 * `checkTicketRestored` resolves the ticket its UNDO names. Filter deleted rows
 * here and the undo refuses its own ticket with `unknown-ticket` — "no such
 * ticket is known" — and the soft delete becomes irreversible from the product
 * side while the ledger keeps insisting it can be reversed. The feature would
 * be broken in the one direction nobody tests, because the DELETE still works.
 *
 * The distinction is the FAQ's own: *"The ticket stops appearing in views. Its
 * history is retained, because other events cite it"* — the exclusion belongs
 * to the VIEWS, and a rule engine judging a claim ABOUT a ticket is not a view.
 * `ticket.closed` set the same precedent from the other side: the reducer and
 * this reader keep serving a closed ticket to every check.
 *
 * The same prohibition covers `getChildrenStatesFromDb` below (the parent's
 * child set, which the hierarchy guard reads) and the refresh-on-publish read
 * further down this file. If a caller needs "live tickets only", that is the
 * caller's predicate to add (`read/visible-where.ts`'s `LIVE_TICKET_WHERE`),
 * never this function's.
 */
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
        closed_at, closed_by, rank, reopened_at, deleted_at, deleted_by,
        draft_author_id, draft_at, draft_discarded, links)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)
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
       rank = EXCLUDED.rank,
       reopened_at = EXCLUDED.reopened_at,
       deleted_at = EXCLUDED.deleted_at,
       deleted_by = EXCLUDED.deleted_by,
       draft_author_id = EXCLUDED.draft_author_id,
       draft_at = EXCLUDED.draft_at,
       draft_discarded = EXCLUDED.draft_discarded,
       links = EXCLUDED.links`,
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
      // The reopen instant, straight off the state. `?? null` for the same
      // reason as the line above — and it is a reachability guard for
      // hand-built states in tests, never a second meaning for the column: the
      // reducer writes `reopenedAt` on all three of `ticket.created`,
      // `ticket.transitioned` and `ticket.reopened`, so a state that reached
      // this function through a real event always carries a value or an
      // explicit null.
      next.reopenedAt ?? null,
      // Both from the SAME `next.deleted`, on `closed`'s exact rule: a delete
      // writes both, the undo (which folds to `deleted: null`) clears both, and
      // the ON CONFLICT list above is what makes the CLEARING reach an existing
      // row rather than leaving it holding a stale delete forever — which is
      // the whole mechanism of the undo, since nothing here ever DELETEs a row.
      //
      // `?? null` for the same reachability reason as `rank`/`reopenedAt`
      // above: `TicketState.deleted?` is optional on the TYPE because hundreds
      // of test literals predate it, while the reducer writes an explicit null
      // at creation and on every restore.
      next.deleted?.at ?? null,
      next.deleted?.actorId ?? null,
      // The draft block, all three from the SAME `next.draft` (the `closed` rule): a publish folds to NO
      // `draft`, and the DO UPDATE list above is what makes that CLEAR the columns of an existing row.
      next.draft?.authorId ?? null,
      next.draft?.at ?? null,
      next.draft?.discarded ?? null,
      // The source's outbound links (typed-links T2). `?? []` because the reducer leaves the key ABSENT for a ticket
      // with none (never `[]`), and the column is NOT NULL; the ON CONFLICT list above is what makes the last
      // removal's absent key clear an existing row rather than leave it holding a stale link.
      JSON.stringify(next.links ?? []),
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
 * `event.workspaceSeq` is this event's own position in the workspace stream,
 * and it reaches BOTH lookups. The WORKFLOW set is the one that was in force
 * when the event happened, never the newest. The TICKET-TYPE ladder is what
 * proj_ticket_types holds, except for a type whose row post-dates this event
 * — possible only in a replay — which is answered from the ledger's own
 * definition at this position instead (`./ticket-types.ts`, E6-13). So this
 * loader IS "every definition as of the event"; the second half of point 1 in
 * this file's header records the drift and the throw that stood here before,
 * and the road taken around the primary-key change the plan priced.
 */
async function loadDeps(db: PoolClient, event: LedgerEvent): Promise<TicketStateDeps> {
  const types = await getTicketTypeLadderFromDb(db, event.workspaceId, event.workspaceSeq);
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
  //
  // NO `deleted_at` predicate, deliberately — see `getTicketStateFromDb`'s
  // docblock for the rule and the reason. A deleted ticket is still a ticket, a
  // republish still redefines the states it may be shown in, and the undo has
  // to find it in the shape its own workflow version says. Filtering here would
  // leave restored tickets landing on a stale `state_category`, which rollups,
  // board columns and the overdue sweep all then repeat.
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
 * they fall through to `{ refused: false }` with no existence check OF THEIR OWN.
 * **The door still refuses them, and this paragraph said it did not.** The
 * permission gate runs before the engine: `checkPermission` asks `canSee` for the
 * event's entity, and `canSee` answers `false` for a ticket with no
 * `proj_visibility` row exactly as it does for an invisible one
 * (`visibility/can-see.ts`), so a `ticket.assigned` naming a ticket that was
 * never created is refused `TICKET_NOT_VISIBLE_REASON` at both client doors.
 * The citation this paragraph used to carry is the proof of the opposite now:
 * `test/permissions/check-role-permission.test.ts`'s `visibleTicket` helper
 * exists precisely BECAUSE the gate started refusing a bare `newUlid()`, and its
 * own docblock says so in as many words. Folding one would still throw INSIDE the
 * ingest transaction — turning a submission into a 500 — and would leave the
 * table unrebuildable from a ledger the product itself wrote, which is why the
 * skip stays and why the set is keyed by name rather than by "unknown ticket".
 *
 * The skip is deliberately NOT "skip whenever the ticket is unknown". That is
 * the shape this series keeps catching — two cases that cannot be told apart,
 * both treated as the permissive one — and here they CAN be told apart, by name,
 * against what the door actually covers. Nothing is invented either way: there is
 * no ticket to assign, so there is no row to write.
 *
 * **What remains true is narrower than "the gap is open":** the ENGINE has no
 * existence check for these three, so a caller that reached `evaluateEvent`
 * without the permission gate — an internal door — could still write an
 * assignment of nothing to somebody. That is an absence rather than a reachable
 * hole: at both client doors the gate above answers first. The set below is what
 * keeps the projection from throwing on the outcome if it ever happens.
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
    // Trash series Plan 2 (spec §5.4): a purged ticket's REDACTED creation
    // produces no ticket. Skipped before `current` is read, like the two
    // content-free types above — folding it would throw by design (D7). The
    // same for a purged ticket's redacted PUBLISH (drafts T2: kept as a
    // numbering row).
    if (isRedactedTicketCreated(event) || isRedactedTicketPublished(event)) {
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
