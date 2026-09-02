import type {
  FieldClaim,
  StateCategory,
  TicketCard,
  TicketDueDate,
  TicketRollup,
} from '@gisik-nokma/domain';
import type { Queryable } from '../db/queryable.js';
import { rollupFor } from '../visibility/rollup.js';
import { stateProvenanceFor } from './state-provenance.js';

/** The snake_case row shape every read query selects (alias `t`). */
export type ProjTicketRow = {
  ticket_id: string;
  workspace_id: string;
  project_id: string;
  type_id: string;
  parent_id: string | null;
  workflow_id: string;
  state_id: string;
  state_category: StateCategory;
  assignee_id: string | null;
  collaborator_ids: string[];
  fields: Record<string, FieldClaim>;
};

export const PROJ_TICKET_COLUMNS =
  't.ticket_id, t.workspace_id, t.project_id, t.type_id, t.parent_id, ' +
  't.workflow_id, t.state_id, t.state_category, t.assignee_id, t.collaborator_ids, t.fields';

/**
 * Rows for explicit ids, in `ticket_id` order.
 *
 * **THIS FUNCTION APPLIES NO WORKSPACE PREDICATE AND NO VISIBILITY PREDICATE.
 * Its caller must supply both.** That is stated as an obligation rather than as
 * reassurance, because the whole chain below it defers the same way and nothing
 * in this file closes the loop: `stateProvenanceFor` is a by-id read over the
 * ledger, and `rollupFor` is workspace-blind by design (case 6.84). Hand
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
 * per-viewer through Plan 4's `rollupFor`.
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
 * - **`rollup: null`** → a real fact: no children at all. Restricted children
 *   make it non-null with `restrictedCount` set.
 *
 * The throws are deliberately loud rather than skipped rows: a card silently
 * missing from a board is the same lie with a longer fuse.
 *
 * ## One rollup query per row
 *
 * `rollupFor` is asked per ticket, which is N round trips for N cards. That is
 * Plan 4's shape and it is left alone here rather than reimplemented as a batch
 * — a second enumeration of "who may see which child" beside `rollupFor` is
 * exactly the duplication `visibleTicketsWhere` was extracted to stop. If the
 * board's card count makes it matter, the batch belongs INSIDE `rollupFor`.
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
  const cards: TicketCard[] = [];

  for (const row of rows) {
    const prov = provenance.get(row.ticket_id);
    if (prov === undefined) {
      throw new Error(
        `assembleTicketCards: no provenance for ticket ${row.ticket_id} — proj_tickets and the ledger disagree`,
      );
    }

    const rollupView = await rollupFor(db, viewerId, row.ticket_id);
    const rollup: TicketRollup | null =
      rollupView === null
        ? null
        : {
            totalChildren: rollupView.total,
            terminalChildren: rollupView.terminal,
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
      fields: row.fields,
      stateProvenance: prov,
      rollup,
    });
  }
  return cards;
}

function titleOf(row: ProjTicketRow): string {
  const claim = row.fields['title'];
  if (claim === undefined) {
    throw new Error(
      `assembleTicketCards: no title claim on ticket ${row.ticket_id} — every ticket.created writes one, so proj_tickets and the ledger disagree`,
    );
  }
  if (typeof claim.value !== 'string') {
    throw new Error(
      `assembleTicketCards: the title claim on ticket ${row.ticket_id} is not a string — the door refuses that (checkTicketFieldSet), so this event did not come through it`,
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
 */
function dueDateOf(row: ProjTicketRow): TicketDueDate {
  const claim = row.fields['dueDate'];
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
      `assembleTicketCards: the dueDate claim on ticket ${row.ticket_id} is neither a clearing nor a { date } — the door refuses that, so this event did not come through it`,
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
