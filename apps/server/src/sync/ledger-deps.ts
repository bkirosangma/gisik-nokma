import {
  ticketTypeDefSchema,
  workflowDefinedPayloadSchema,
  type TicketStateDeps,
  type TicketTypeDef,
  type WorkflowDef,
} from '@gisik-nokma/domain';
import type { Queryable } from '../db/queryable.js';

/**
 * `TicketStateDeps` folded from the LEDGER's own definition events — never from
 * `proj_workflows` / `proj_ticket_types`.
 *
 * The point is equivalence, not taste. Plan 10's replica folds the same events
 * with the same reducer and has no access to this server's pg projections at
 * all; if the server's snapshots were folded with deps read from a projection,
 * "a snapshot is exactly the state a client computes from the same events"
 * would hold only for as long as the two sources happened to agree, and the
 * first disagreement would surface as a replica whose bootstrap state differs
 * from its own replay with nothing pointing at why.
 *
 * ## The resolution rules, and why each matches what the server already does
 *
 * - **Ticket types: greatest `workspace_seq` wins.** `proj_ticket_types` keeps
 *   ONE row per `(workspace_id, type_id)` and its `DO UPDATE` is guarded by
 *   `EXCLUDED.defined_workspace_seq > proj_ticket_types.defined_workspace_seq`
 *   — deliberately not last-writer-wins, so that live application and a
 *   canonical-order rebuild leave the same row. That is why this query orders
 *   by `workspace_seq` and NOT by the plan text's `(entity_kind, entity_id,
 *   seq)`: a type key is carried in the PAYLOAD and successive definitions of
 *   one key arrive on DIFFERENT entity streams (each `ticket-type.defined`
 *   gets a fresh ULID entity id — `envelope.ts` forbids a non-ULID one), so
 *   per-entity `seq` cannot order them against each other at all. Ordering by
 *   entity id would resolve the winner by ULID collation, which is only
 *   accidentally chronological and is not what the projection does.
 * - **Workflows: greatest `version` wins, first publisher of that version
 *   winning a tie.** `proj_workflows` is `ON CONFLICT (workflow_id, version) DO
 *   NOTHING` and its readers take `ORDER BY version DESC LIMIT 1`, which is the
 *   same rule; the ascending `workspace_seq` order above is what makes "first"
 *   mean first on the workspace stream.
 *
 * Both maps serve ANY id asked for, which is `TicketStateDeps`'s stated
 * contract (`ticket-state.ts`): `ticket.workflow_rebound` asks for a workflow
 * the ticket is not on yet, so a loader that served only "this ticket's
 * workflow" would resolve null on the very event the migration exists for.
 *
 * ## What this does NOT do
 *
 * - It does not filter by visibility, role or membership — it is a definition
 *   loader for a fold, not a read surface, and every caller so far is
 *   server-internal (the snapshot writer). A route that hands its output to a
 *   client owes its own gate.
 * - It loads every definition event in the workspace on every call. Bounded by
 *   the number of `workflow.defined` + `ticket-type.defined` events, which is a
 *   builder-sized number and not a ledger-sized one; the snapshot writer caches
 *   the result per workspace per pass so a thousand due tickets cost one load.
 * - It does not validate that the definitions are mutually coherent (a ticket
 *   type naming a workflow that was never published still parses here). The
 *   reducer throws on that when it reaches it, naming the missing id.
 */
export async function buildLedgerDeps(db: Queryable, workspaceId: string): Promise<TicketStateDeps> {
  const workflows = new Map<string, WorkflowDef>();
  const ticketTypes = new Map<string, TicketTypeDef>();

  const { rows } = await db.query<{ type: string; payload: unknown }>(
    `SELECT type, payload FROM events
      WHERE workspace_id = $1
        AND entity_kind IN ('workflow', 'ticket-type')
        AND type IN ('workflow.defined', 'ticket-type.defined')
      ORDER BY workspace_seq`,
    [workspaceId],
  );

  for (const row of rows) {
    if (row.type === 'workflow.defined') {
      const def = workflowDefinedPayloadSchema.parse(row.payload);
      const existing = workflows.get(def.id);
      if (existing === undefined || existing.version < def.version) {
        workflows.set(def.id, def);
      }
    } else {
      const def = ticketTypeDefSchema.parse(row.payload);
      ticketTypes.set(def.id, def);
    }
  }

  return {
    getWorkflow: (id) => workflows.get(id),
    getTicketType: (id) => ticketTypes.get(id),
  };
}
