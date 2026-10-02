import { statesWithBacklog, type ListCard, type TicketCard } from '@gisik-nokma/domain';
import type { Queryable } from '../db/queryable.js';
import { assignedProvenanceFor } from './assigned-provenance.js';
import { restrictedParentsFor } from './restricted-parents.js';
import type { ProjTicketRow } from './ticket-cards.js';
import { foldedDefKey, foldedWorkflowDefs } from './workflow-defs.js';

/**
 * `TicketCard`s → `ListCard`s: the five facts ruling P25 clause 1 named for the
 * list route, and nothing else.
 *
 * `epicId` arrives as a parameter rather than being read here, because the epic
 * walk carries Plan 4's visibility predicate and belongs beside the page query
 * that consumes the same expression (`routes/list.ts`). Everything else is read
 * here.
 *
 * ## Every blank this function could emit is a real fact or a throw
 *
 * `assembleTicketCards`' rule, applied to five more fields. Three of them have
 * no honest absence value at all:
 *
 * - **No type row for a card's `typeId`** → throw. `checkTicketCreated` refuses
 *   a `ticket.created` naming an unknown type, so a card whose type has no
 *   `proj_ticket_types` row means the projection and the ledger disagree. Rank
 *   `0` would sit exactly where a real rung goes, and an outline would indent by
 *   it.
 * - **No published definition at the ticket's own `(workflow_id,
 *   workflow_version)`, or one with no such state** → throw. The alternative the
 *   `status` grouping takes for its LABEL — fall back to the state id — is right
 *   for a label, which is a heading a reader can see is a slug, and wrong for a
 *   field called `stateName` that a client renders as a name.
 * - **`assignee_id` set with no `ticket.assigned` in the ledger** → throw. Same
 *   disagreement, and an unattributed assignment is the provenance floor's
 *   opposite.
 *
 * The other two have true absence values and use them: `assignedProvenance:
 * null` when nobody is assigned, `hasRestrictedParent: false` when there is no
 * parent, the parent is visible, or the `parent_id` names no row (argued in
 * `restricted-parents.ts`).
 *
 * ## Reads, and how many
 *
 * Three batched queries for the whole page — types, assignment claims, parent
 * audiences — plus one by-version definition read per distinct
 * `(workflowId, version)` pair, which is at most one per workflow on the page.
 * The rollups come from `assembleTicketCards`, one `rollupsFor` call for the whole page
 * (smoothness T11; the per-card N+1 that used to remain here is gone).
 */
export async function assembleListCards(
  db: Queryable,
  viewerId: string,
  workspaceId: string,
  rows: readonly ProjTicketRow[],
  cards: readonly TicketCard[],
  epicIds: ReadonlyMap<string, string>,
): Promise<ListCard[]> {
  if (cards.length === 0) {
    return [];
  }

  const byTicketId = new Map(rows.map((row) => [row.ticket_id, row]));
  const ranks = await typeRanks(db, workspaceId, rows.map((row) => row.type_id));
  const defs = await foldedWorkflowDefs(
    db,
    workspaceId,
    rows.map((row) => ({ workflowId: row.workflow_id, version: row.workflow_version })),
  );
  const assigned = await assignedProvenanceFor(db, cards.map((card) => card.ticketId));
  const restricted = await restrictedParentsFor(db, viewerId, rows);

  return cards.map((card) => {
    const row = byTicketId.get(card.ticketId);
    if (row === undefined) {
      throw new Error(
        `assembleListCards: no proj_tickets row for card ${card.ticketId} — the cards and the rows they were assembled from disagree`,
      );
    }

    const rank = ranks.get(card.typeId);
    if (rank === undefined) {
      throw new Error(
        `assembleListCards: no proj_ticket_types row for type ${card.typeId} of ticket ${card.ticketId} in workspace ${workspaceId} — the door refuses a ticket.created naming an unknown type, so proj_tickets and the ledger disagree`,
      );
    }

    const def = defs.get(foldedDefKey(row.workflow_id, row.workflow_version));
    if (def === undefined) {
      throw new Error(
        `assembleListCards: no published definition of workflow ${row.workflow_id} at version ${row.workflow_version}, which ticket ${card.ticketId} is folded to — the ticket names a definition proj_workflows does not hold`,
      );
    }
    // `statesWithBacklog`, not `def.states`: `backlog` (backlog/closed spec
    // §1.4/§3.2, 2026-09-17) is the universal state every workflow carries
    // WITHOUT declaring it (`validate-workflow.ts` refuses a definition that
    // tries to), so a list row sitting in it would find nothing in `def.states`
    // and this would throw a false "ledger disagreement" for a perfectly
    // ordinary backlog ticket. `statesWithBacklog` appends the one synthetic
    // state (`id: 'backlog', name: 'Backlog', category: 'open'`) so the lookup
    // succeeds the same way it does for a declared state.
    const state = statesWithBacklog(def).find((candidate) => candidate.id === card.stateId);
    if (state === undefined) {
      throw new Error(
        `assembleListCards: workflow ${row.workflow_id}@${row.workflow_version} has no state ${card.stateId}, which ticket ${card.ticketId} is in — applyTicketEvent refuses a transition to a state its workflow does not carry, so this row did not come through it`,
      );
    }

    // The provenance is paired with the ASSIGNEE and read only when there is
    // one. An unassigned card gets `null` even when a `ticket.assigned` carrying
    // null exists: `assigned-provenance.ts` argues that fork, and the claim is
    // still served whole by the history route.
    let assignedProvenance = null;
    if (card.assigneeId !== null) {
      const claim = assigned.get(card.ticketId);
      if (claim === undefined) {
        throw new Error(
          `assembleListCards: ticket ${card.ticketId} is assigned to ${card.assigneeId} with no ticket.assigned in the ledger — proj_tickets and the ledger disagree`,
        );
      }
      assignedProvenance = claim;
    }

    return {
      ...card,
      typeRank: rank,
      epicId: epicIds.get(card.ticketId) ?? null,
      stateName: state.name,
      assignedProvenance,
      hasRestrictedParent: restricted.has(card.ticketId),
    };
  });
}

/**
 * `type_id` → `rank`, in ONE workspace.
 *
 * The workspace clause is the tenancy guard and it is the same one the epic
 * walk's rank subquery carries: `proj_ticket_types`' primary key is
 * `(workspace_id, type_id)`, so a bare `type_id = ANY(...)` would read a
 * neighbouring tenancy's rank for a type key both happen to use — and `task`,
 * `story` and `epic` are seeded into EVERY workspace, so that is the common case
 * rather than a contrived one.
 */
async function typeRanks(
  db: Queryable,
  workspaceId: string,
  typeIds: readonly string[],
): Promise<Map<string, number>> {
  const ranks = new Map<string, number>();
  if (typeIds.length === 0) {
    return ranks;
  }
  const { rows } = await db.query<{ type_id: string; rank: number }>(
    `SELECT type_id, rank FROM proj_ticket_types WHERE workspace_id = $1 AND type_id = ANY ($2::text[])`,
    [workspaceId, [...new Set(typeIds)]],
  );
  for (const row of rows) {
    ranks.set(row.type_id, row.rank);
  }
  return ranks;
}
