import type {
  FieldClaim,
  PriorityClaim,
  StateCategory,
  TicketCard,
  TicketDueDate,
  TicketRollup,
} from '@gisik-nokma/domain';
import { notTakenOf, PRIORITIES, prioritySchema, ticketKey } from '@gisik-nokma/domain';
import type { Queryable } from '../db/queryable.js';
import { rollupsFor } from '../visibility/rollup.js';
import { workspaceIdentityFromLedger } from '../workspaces/workspace-name.js';
import { stateProvenanceFor } from './state-provenance.js';
import { ticketNumbers } from './ticket-numbers.js';
import { projectPrefixesInWorkspace } from './visible-projects.js';

/** The snake_case row shape every read query selects (alias `t`). */
export type ProjTicketRow = {
  ticket_id: string;
  workspace_id: string;
  project_id: string;
  type_id: string;
  parent_id: string | null;
  workflow_id: string;
  /**
   * The version of `workflow_id` this ticket is FOLDED TO — not the latest
   * published one. Selected for `ListCard.stateName`, which must name the state
   * in the vocabulary this ticket actually sits in; carried on the row rather
   * than on the card, because no `TicketCard` field is derived from it and
   * putting it on the card would change four other routes' bodies.
   */
  workflow_version: number;
  state_id: string;
  state_category: StateCategory;
  assignee_id: string | null;
  collaborator_ids: string[];
  fields: Record<string, FieldClaim>;
  /** `TicketCard.closed`'s pair, unmapped — see `assembleTicketCards` for the fold (backlog/closed spec §3.1, 2026-09-17). */
  closed_at: Date | null;
  closed_by: string | null;
  /**
   * `TicketCard.rank`, unmapped — the column and the card field are both
   * `string | null` with the same meaning, so there is no fold to make here
   * (spec §8.1, second wave 2026-09-18).
   */
  rank: string | null;
  /** `TicketCard.notTaken`'s source, read by every card route through `notTakenOf` (wtg2 T17); `rollupsFor` reads the children's own. */
  closed_cause: unknown;
};

/**
 * `TicketState.reopenedAt` IS DELIBERATELY ABSENT from this list and from the
 * row type above, and the absence is a RULING rather than an omission.
 *
 * The plan's Task 7 `Files:` line originally asked for `t.reopened_at` here.
 * It was measured and removed: **nothing on these routes reads it.** This list
 * and `ProjTicketRow` exist to feed `assembleTicketCards`, which builds CARDS,
 * and `reopenedAt` is a server-side SWEEP INPUT (spec §8.2) that no card
 * carries — so carrying it here put one dead column into six routes' SELECTs
 * and declared a row member none of them dereferenced. The plan's own Task 8
 * Step 3 gives the auto-close sweep its own SQL, so no reader was waiting for
 * the list to have it either. The mutation that deleted the entry **survived
 * the entire server suite** (1,548 passed, byte-identical to baseline), which
 * is what settled it.
 *
 * The value is NOT lost: `rowToTicketState` reads it off its own `TicketRow`
 * in `projections/tickets.ts`, fed by that file's queries, and the
 * single-ticket route serves it through `getTicketStateFromDb`. A second
 * column list carrying a column no route on it consumes is the "carried but
 * never read" shape this repo's mapper rule exists to prevent — the closed
 * flag was dead in production; this would have been dead in the query.
 *
 * If a future card-serving route needs the column, add it HERE with that
 * reader named; do not add it on the assumption that a canonical list should
 * be complete against the table. `t.closed_cause` is the one added that way
 * (wtg2 T17): `assembleTicketCards` reads it through `notTakenOf` into
 * `TicketCard.notTaken`, on every card route.
 */
export const PROJ_TICKET_COLUMNS =
  't.ticket_id, t.workspace_id, t.project_id, t.type_id, t.parent_id, ' +
  't.workflow_id, t.workflow_version, t.state_id, t.state_category, ' +
  't.assignee_id, t.collaborator_ids, t.fields, t.closed_at, t.closed_by, t.rank, t.closed_cause';

/**
 * Rows for explicit ids, in `ticket_id` order.
 *
 * **THIS FUNCTION APPLIES NO WORKSPACE PREDICATE AND NO VISIBILITY PREDICATE.
 * Its caller must supply both.** That is stated as an obligation rather than as
 * reassurance, because the whole chain below it defers the same way and nothing
 * in this file closes the loop: `stateProvenanceFor` is a by-id read over the
 * ledger, and `rollupsFor` is workspace-blind by design (case 6.84). Hand
 * `assembleTicketCards` a row from another tenancy and it will assemble a full
 * card for it.
 *
 * That is correct for what these are — a by-id fetch and an assembler, not a
 * door — and it is why every route reaching a card set must arrive through
 * `listVisibleTickets` / `visibleTicketsWhere`, where the workspace clause and
 * the one visibility decision both live. `PROJ_TICKET_COLUMNS` is exported for
 * those routes to build their OWN scoped `SELECT` with; this convenience is not
 * the thing to reach for when a request supplies the ids.
 */
export async function fetchTicketRows(db: Queryable, ticketIds: string[]): Promise<ProjTicketRow[]> {
  const { rows } = await db.query<ProjTicketRow>(
    `SELECT ${PROJ_TICKET_COLUMNS} FROM proj_tickets t WHERE t.ticket_id = ANY($1::text[]) ORDER BY t.ticket_id`,
    [ticketIds],
  );
  return rows;
}

/**
 * `proj_tickets` rows → `TicketCard`s: the title and due-date claims read out
 * of the `FieldClaim` map, state provenance batched from the ledger, rollups
 * per-viewer through Plan 4's rollup (`rollupsFor`, one call per page).
 *
 * ## Every blank this function could emit is either a real fact or a throw
 *
 * The plan text's version emitted `title: ''` when no title claim was present
 * and `dueDate: null` for both "never given one" and "somebody deleted it".
 * Both are the defect this task is named for — a value that reads as data while
 * standing for the absence of data — so neither survives:
 *
 * - **No provenance** → throw. A projected ticket whose state nobody claimed
 *   means `proj_tickets` and the ledger disagree; inventing an anonymous claim
 *   would put a ticket in a status nobody chose (spec invariant 4).
 * - **No title claim** → throw. `ticket.created` writes `fields.title`
 *   unconditionally (`applyTicketEvent`), so its absence is the same
 *   disagreement. `''` would sit exactly where a real title goes.
 * - **A title claim whose value is not a string** → throw. The door refuses one
 *   (`checkTicketFieldSet`, ruling P15), so reaching it means the door was
 *   bypassed; coercing it would print a number where somebody's words belong.
 * - **A due claim that is neither `null` nor `{date: string}`** → throw, for
 *   the same reason. `null` is the one non-date value that IS meaningful, and
 *   it means cleared.
 * - **`dueDate`** → the three-state `TicketDueDate`, never a bare null.
 * - **No priority claim** → throw; see `priorityOf`.
 * - **`rollup: null`** → a real fact: no children at all. Restricted children
 *   make it non-null with `restrictedCount` set.
 *
 * The throws are deliberately loud rather than skipped rows: a card silently
 * missing from a board is the same lie with a longer fuse.
 *
 * ## One rollup pass per page
 *
 * The rollups of every row come from ONE `rollupsFor` call before the loop (smoothness T11, spec
 * D7, audit SM-06), where this used to ask `rollupFor` per card — N round trips for N cards. The
 * batch lives INSIDE `visibility/rollup.ts`, as this paragraph once said it should: there is still
 * one enumeration of "who may see which child", `rollupsFor`'s, and `rollupFor` is that function
 * asked about one parent. A card whose parent has no children has no entry in the map and carries
 * `rollup: null`, exactly as before (case 25.190 holds every card's rollup equal to the frozen
 * per-ticket answer, for every viewer class).
 */
export async function assembleTicketCards(
  db: Queryable,
  viewerId: string,
  rows: ProjTicketRow[],
): Promise<TicketCard[]> {
  const provenance = await stateProvenanceFor(
    db,
    rows.map((r) => r.ticket_id),
  );
  const keys = await cardKeysFor(db, rows);
  const rollups = await rollupsFor(
    db,
    viewerId,
    rows.map((r) => r.ticket_id),
  );
  const cards: TicketCard[] = [];

  for (const row of rows) {
    const prov = provenance.get(row.ticket_id);
    if (prov === undefined) {
      throw new Error(
        `assembleTicketCards: no provenance for ticket ${row.ticket_id} — proj_tickets and the ledger disagree`,
      );
    }

    const rollupView = rollups.get(row.ticket_id) ?? null;
    const rollup: TicketRollup | null =
      rollupView === null
        ? null
        : {
            totalChildren: rollupView.total,
            terminalChildren: rollupView.terminal,
            ...(rollupView.notTaken === undefined ? {} : { notTakenChildren: rollupView.notTaken }),
            uncategorizedChildren: rollupView.uncategorized,
            restrictedCount: rollupView.restrictedCount,
          };

    cards.push({
      ticketId: row.ticket_id,
      workspaceId: row.workspace_id,
      projectId: row.project_id,
      typeId: row.type_id,
      parentId: row.parent_id,
      workflowId: row.workflow_id,
      stateId: row.state_id,
      stateCategory: row.state_category,
      assigneeId: row.assignee_id,
      collaboratorIds: row.collaborator_ids,
      title: titleOf(row),
      dueDate: dueDateOf(row),
      key: keys.get(row.ticket_id) ?? null,
      priority: priorityOf(row),
      fields: row.fields,
      stateProvenance: prov,
      rollup,
      // Both NULL means never closed — the same fold `rowToTicketState` makes
      // over these two columns (backlog/closed spec §3.1/§3.3, 2026-09-17).
      closed:
        row.closed_at === null || row.closed_by === null
          ? null
          : { actorId: row.closed_by, at: row.closed_at.toISOString() },
      // Straight off the row: `rank` is one column with one meaning and the
      // card field is the same `string | null`, so unlike `closed` above there
      // is nothing to fold and no pair that could disagree. Reading it here,
      // beside `closed`, is what carries the key onto EVERY card-building route
      // (board, list, my-work, search, attention, single-ticket) — the list is
      // the one spec §8.1 names, and the others get it for free rather than by
      // a second enumeration that could be forgotten (case 13.603's failure).
      rank: row.rank,
      // wtg2 T17 (Q1): closed Not taken by the flow; absent otherwise, and never the Decision's id (a card is served to
      // viewers who may not see it).
      ...(notTakenOf(row.closed_cause) === null ? {} : { notTaken: true as const }),
    });
  }
  return cards;
}

/**
 * A row's title claim, or a throw naming the ticket: `assembleTicketCards` and the Workflow graph's facts loader
 * (`flow/flow-facts.ts` `loadFlowFacts`) both print it, so the messages name this function, not either caller.
 */
export function titleOf(row: ProjTicketRow): string {
  const claim = row.fields['title'];
  if (claim === undefined) {
    throw new Error(
      `titleOf: no title claim on ticket ${row.ticket_id} — every ticket.created writes one, so proj_tickets and the ledger disagree`,
    );
  }
  if (typeof claim.value !== 'string') {
    throw new Error(
      `titleOf: the title claim on ticket ${row.ticket_id} is not a string — the door refuses that (checkTicketFieldSet), so this event did not come through it`,
    );
  }
  return claim.value;
}

/**
 * The three states a due date can be in, read off the one claim map.
 *
 * The KEY's presence is what separates "never claimed" from the other two; the
 * claim's VALUE separates "cleared" from "claimed". Both distinctions exist in
 * the stored data already (`ticket.field_set` refuses an absent value outright
 * so a `null` is always somebody's act) — this function's only job is to not
 * throw them away.
 *
 * `dueDateOfClaim` is the rule over ONE claim, for reads that select `fields -> 'dueDate'` alone (home, spec E);
 * `dueDateOf` is the same body over a full row.
 */
export function dueDateOfClaim(claim: FieldClaim | undefined, ticketId: string): TicketDueDate {
  if (claim === undefined) {
    return { state: 'never-claimed' };
  }
  if (claim.value === null) {
    return {
      state: 'cleared',
      actorId: claim.actorId,
      clientTime: claim.clientTime,
      serverTime: claim.serverTime,
    };
  }

  const value = claim.value as { date?: unknown; note?: unknown };
  if (typeof value !== 'object' || typeof value.date !== 'string') {
    throw new Error(
      `assembleTicketCards: the dueDate claim on ticket ${ticketId} is neither a clearing nor a { date } — the door refuses that, so this event did not come through it`,
    );
  }
  return {
    state: 'claimed',
    claim: {
      date: value.date,
      ...(typeof value.note === 'string' ? { note: value.note } : {}),
      actorId: claim.actorId,
      clientTime: claim.clientTime,
      serverTime: claim.serverTime,
    },
  };
}

/** The due-date state of a full ticket row: `dueDateOfClaim` over its `dueDate` claim. */
function dueDateOf(row: ProjTicketRow): TicketDueDate {
  return dueDateOfClaim(row.fields['dueDate'], row.ticket_id);
}

/**
 * ALWAYS a claim (spec 2026-09-22). An absent key does not mean "never claimed" here
 * as it does for `dueDate`: `applyTicketEvent` writes the birth priority on every
 * `ticket.created`, so a row without one was written by a reducer that predates the
 * field and has not been rebuilt — `pnpm --filter @gisik-nokma/server rebuild:projection proj_tickets`.
 * Filling in P2 would be approach B of the spec by the back door.
 */
function priorityOf(row: ProjTicketRow): PriorityClaim {
  const claim = row.fields['priority'];
  if (claim === undefined) {
    throw new Error(
      `assembleTicketCards: no priority claim on ticket ${row.ticket_id} — every ticket.created writes one since 2026-09-22, so proj_tickets predates the reducer; rebuild it (rebuild:projection proj_tickets)`,
    );
  }
  const parsed = prioritySchema.safeParse(claim.value);
  if (!parsed.success) {
    throw new Error(
      `assembleTicketCards: the priority claim on ticket ${row.ticket_id} is not one of ${PRIORITIES.join('/')} — the door refuses that (checkTicketFieldSet), so this event did not come through it`,
    );
  }
  return { value: parsed.data, actorId: claim.actorId, clientTime: claim.clientTime, serverTime: claim.serverTime };
}

/**
 * `<workspace prefix><project prefix>-<number>`, or `null` when ANY of the three
 * is missing — never a partial key. The same rule the single-ticket route
 * applies to the parent crumb (`routes/tickets.ts`, `parentKey`).
 */
export function composeCardKey(
  workspacePrefix: string | null,
  projectPrefix: string | null | undefined,
  number: number | null | undefined,
): string | null {
  if (workspacePrefix === null || projectPrefix === null || projectPrefix === undefined) return null;
  if (number === null || number === undefined) return null;
  return ticketKey(workspacePrefix, projectPrefix, number);
}

/**
 * The keys for one batch of rows (owner, 2026-09-22: the board card shows its
 * key like the prototype). Three reads PER WORKSPACE in the batch — the
 * identity for the workspace prefix, the project prefixes, the ticket numbers
 * over exactly these ids — the three the single-ticket route already makes for
 * one ticket, batched. Two callers' rows span workspaces — My Work, and the
 * Knowledge Graph ring read (`graph-neighbours.ts` `keysFor`, whose tickets
 * reach across workspaces through people) — which is why this groups by
 * `workspace_id` instead of assuming one.
 */
export async function cardKeysFor(
  db: Queryable,
  rows: readonly Pick<ProjTicketRow, 'ticket_id' | 'workspace_id' | 'project_id'>[],
): Promise<Map<string, string | null>> {
  const byWorkspace = new Map<string, Pick<ProjTicketRow, 'ticket_id' | 'workspace_id' | 'project_id'>[]>();
  for (const row of rows) {
    const bucket = byWorkspace.get(row.workspace_id) ?? [];
    bucket.push(row);
    byWorkspace.set(row.workspace_id, bucket);
  }
  const keys = new Map<string, string | null>();
  for (const [workspaceId, bucket] of byWorkspace) {
    const [identity, prefixes, numbers] = await Promise.all([
      workspaceIdentityFromLedger(db, workspaceId),
      projectPrefixesInWorkspace(db, workspaceId),
      ticketNumbers(db, workspaceId, bucket.map((r) => r.ticket_id)),
    ]);
    for (const row of bucket) {
      keys.set(row.ticket_id, composeCardKey(identity.prefix, prefixes.get(row.project_id), numbers.get(row.ticket_id)));
    }
  }
  return keys;
}
