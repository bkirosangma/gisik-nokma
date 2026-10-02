import type { Queryable } from '../db/queryable.js';

/**
 * The number in a ticket key — `1183` in `CCSO-1183` — for one workspace's
 * tickets.
 *
 * ## The counter is the ledger's own order, and that is not a shortcut
 *
 * The owner's spec says the number is "the counter per project". This derives
 * it rather than storing it, and the reason is a wall rather than a preference:
 *
 * - **It cannot be stored on the founding event.** `events` carries a
 *   `BEFORE UPDATE OR DELETE` trigger that RAISES
 *   (`migrations/1787841717635_events-and-snapshots.sql`, `events_append_only`),
 *   so the ledger cannot be given a number after the fact.
 * - **It cannot be stored only in a projection.** `tools/verify-projections.ts`
 *   diffs every `proj_` table against a rebuild from the ledger with `EXCEPT` in
 *   both directions, so a column whose value a replay could not reproduce is a
 *   verifier failure — and a value allocated live and never written to the
 *   ledger is exactly that. `proj_tickets` is a pure function of the ledger, and
 *   a number allocated outside it would end that.
 *
 * So the number is a fact about the LEDGER, read from it, and the counter is the
 * ticket's position among its project's creations. It is a counter in every
 * sense that matters to a reader: per project, monotonic, never reused.
 *
 * ## What it orders by, and why that is provable rather than assumed
 *
 * `workspace_seq` — **not** `server_time`, and **not** `created_at`, which
 * `proj_tickets` does not have (measured: the table's columns are ticket_id,
 * workspace_id, project_id, type_id, parent_id, workflow_id, workflow_version,
 * state_id, state_category, assignee_id, collaborator_ids, fields, transitions,
 * rank, closed_at, closed_by, reopened_at — no `created_at` anywhere). The
 * dispatch that asked for this said the controller could not confirm one, and
 * could not, because it does not exist.
 *
 * `workspace_seq` is the right key for a stronger reason than "it is available":
 * it is assigned at append under `lockWorkspace` (`ledger/event-store.ts`,
 * `nextWorkspaceSeq`) and `events` carries
 * `CONSTRAINT events_workspace_seq_unique UNIQUE (workspace_id, workspace_seq)`.
 * So it is a TOTAL ORDER — two tickets can never share one — and it is a fact
 * about the ledger rather than about a clock. A timestamp could tie, and on
 * 2026-09-04 this repo shipped a clock that did: two events inside one ingest
 * share a millisecond, which the same file's docblock names as the reason a
 * different read orders by `workspace_seq` (`workspaces/workspace-name.ts`).
 *
 * ## Two simultaneous creations cannot take one number, by construction
 *
 * `nextWorkspaceSeq` reads `max(workspace_seq) + 1` INSIDE the transaction that
 * holds the per-workspace advisory lock, and the unique constraint above refuses
 * a duplicate at COMMIT if that lock were ever lost. Two creations therefore
 * land at two different `workspace_seq`s, and two different positions. There is
 * no allocation to race on here because there is no allocation: the number IS
 * the ordering the append already had to establish. That is the "look for an
 * existing precedent before adding a mechanism" answer — the precedent is
 * `nextWorkspaceSeq`, and this read consumes its output rather than duplicating
 * it.
 *
 * ## Gaps, and the thing this design does NOT say
 *
 * The dispatch that specified this asked for a docblock saying *"a gap means a
 * creation was abandoned"*. **That sentence would be false here, and it is not
 * written.** With the number as the ticket's POSITION, a rolled-back or refused
 * creation leaves no `ticket.created` event at all — so it consumes no position
 * — and the numbers in a project are 1..N with no holes. There is no delete
 * event for a ticket anywhere in the vocabulary either. A gap is therefore
 * unconstructible rather than merely unhappened, and a reader who found one
 * would have found a corrupt ledger, which is a different and louder fact than
 * "somebody abandoned a form".
 *
 * **The property the dispatch was protecting is kept, and kept absolutely:
 * a number is NEVER REUSED.** That follows from `workspace_seq` never
 * repeating. What is not kept is the expectation of holes.
 *
 * ## Per project, partitioned on a payload key
 *
 * `payload->>'projectId'` is the ticket's project — `ticketCreatedPayload`
 * requires it, so every `ticket.created` in the ledger has one, and it is also
 * the key `proj_tickets` is written with. Partitioning on the event's own field
 * rather than joining the projection means this read answers from the ledger
 * alone, which is what a rebuild has.
 *
 * ## The cost, named
 *
 * The window runs over every `ticket.created` in the WORKSPACE and the id filter
 * is applied after it, because filtering first would renumber the survivors.
 * That is one scan of a workspace's ticket-creations per call, not per row — a
 * board or list page pays it once. An index on `(workspace_id, type)` would help
 * it; none is added here because the product's workspaces are small and an index
 * maintained on every append for a read that may never be hot is the trade
 * `proj_tickets`' own docblock refuses for `(workspace_id, workflow_id)`.
 */
export async function ticketNumbers(
  db: Queryable,
  workspaceId: string,
  /** Restrict to these tickets. Omit for the whole workspace. */
  ticketIds?: readonly string[],
): Promise<Map<string, number>> {
  if (ticketIds !== undefined && ticketIds.length === 0) {
    return new Map();
  }
  const filter = ticketIds === undefined ? '' : 'WHERE ticket_id = ANY($2)';
  const params: unknown[] = ticketIds === undefined ? [workspaceId] : [workspaceId, [...ticketIds]];
  const { rows } = await db.query<{ ticket_id: string; number: string | number }>(
    `SELECT ticket_id, number FROM (
       SELECT entity_id AS ticket_id,
              row_number() OVER (PARTITION BY payload->>'projectId' ORDER BY workspace_seq) AS number
         FROM events
        WHERE workspace_id = $1 AND type = 'ticket.created'
     ) ranked
     ${filter}`,
    params,
  );
  return new Map(rows.map((row) => [row.ticket_id, Number(row.number)]));
}

/**
 * The number for one ticket, or `null` when the ledger holds no `ticket.created`
 * for it — a ticket this replica has been told about but whose creation is not
 * in the workspace's stream, which is the snapshot-bounded case
 * `app-core`'s replica already names.
 *
 * Returns `null` rather than throwing, and the caller renders the absence: a
 * key is not worth refusing a ticket read over, and inventing a number would
 * make the key name a ticket that does not exist.
 */
export async function ticketNumber(
  db: Queryable,
  workspaceId: string,
  ticketId: string,
): Promise<number | null> {
  const numbers = await ticketNumbers(db, workspaceId, [ticketId]);
  return numbers.get(ticketId) ?? null;
}

/**
 * The tickets numbered `number` in each of `projectIds` — at most one per project, since a number
 * is a ticket's position among its project's creations. The inverse of `ticketNumbers`, over the
 * same ranking and under the same cost (one scan of the workspace's creations), so a key and the
 * number it names can never disagree about which ticket is which.
 */
export async function ticketIdsAtNumber(
  db: Queryable,
  workspaceId: string,
  projectIds: readonly string[],
  number: number,
): Promise<string[]> {
  if (projectIds.length === 0) {
    return [];
  }
  const { rows } = await db.query<{ ticket_id: string }>(
    `SELECT ticket_id FROM (
       SELECT entity_id AS ticket_id,
              payload->>'projectId' AS project_id,
              row_number() OVER (PARTITION BY payload->>'projectId' ORDER BY workspace_seq) AS number
         FROM events
        WHERE workspace_id = $1 AND type = 'ticket.created'
     ) ranked
     WHERE project_id = ANY($2) AND number = $3
     ORDER BY ticket_id`,
    [workspaceId, [...projectIds], number],
  );
  return rows.map((row) => row.ticket_id);
}
