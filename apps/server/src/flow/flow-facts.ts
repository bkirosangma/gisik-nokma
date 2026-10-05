import { statesWithBacklog, type FlowCardFacts } from '@gisik-nokma/domain';
import type { Queryable } from '../db/queryable.js';
import type { EffectiveRole } from '../permissions/effective-role.js';
import { readActorNames } from '../routes/builder-reads.js';
import { listNotesForTickets } from '../read/notes.js';
import { cardKeysFor, PROJ_TICKET_COLUMNS, titleOf, type ProjTicketRow } from '../read/ticket-cards.js';
import { foldedDefKey, foldedWorkflowDefs } from '../read/workflow-defs.js';

/**
 * Titles, keys, state names, assignee names, the notes the viewer may read and the pin counts for `ids`, which are ALREADY the
 * viewer's flow (Part 2's `readFlow` did the visibility walk): this function adds names to tickets the walk admitted and never
 * widens the set. The workspace clause is bound beside the id list because `fetchTicketRows` applies none.
 *
 * A fixed number of queries whatever the flow's size: the rows, the keys (three per workspace, one workspace here), one
 * definition per distinct workflow version, the roster, the notes and the attachment counts. The full roster
 * (`readActorNames`) is read for a guest too: a guest holds no draft rights (`holdsDraftRights`), so every node of their flow
 * is a live ticket they can see, whose assignee `readActorNamesForGuest` would name anyway.
 */
export async function loadFlowFacts(
  db: Queryable,
  args: { eff: EffectiveRole; viewerId: string; workspaceId: string; ids: readonly string[] },
): Promise<Map<string, FlowCardFacts>> {
  const { eff, viewerId, workspaceId, ids } = args;
  const facts = new Map<string, FlowCardFacts>();
  if (ids.length === 0) return facts;
  const { rows } = await db.query<ProjTicketRow>(
    `SELECT ${PROJ_TICKET_COLUMNS} FROM proj_tickets t WHERE t.workspace_id = $1 AND t.ticket_id = ANY($2::text[]) ORDER BY t.ticket_id`,
    [workspaceId, [...ids]],
  );
  const [keys, defs, roster, notes, attachments] = await Promise.all([
    cardKeysFor(db, rows),
    foldedWorkflowDefs(db, workspaceId, rows.map((r) => ({ workflowId: r.workflow_id, version: r.workflow_version }))),
    readActorNames(db, workspaceId),
    listNotesForTickets(db, eff, viewerId, workspaceId, ids),
    db.query<{ ticket_id: string; n: number }>(
      `SELECT ticket_id, COUNT(*)::int AS n FROM attachments WHERE workspace_id = $1 AND ticket_id = ANY($2::text[]) GROUP BY ticket_id`,
      [workspaceId, [...ids]],
    ),
  ]);
  const names = new Map(roster.map((r) => [r.userId, r.displayName] as const));
  const attached = new Map(attachments.rows.map((r) => [r.ticket_id, r.n] as const));
  for (const row of rows) {
    const def = defs.get(foldedDefKey(row.workflow_id, row.workflow_version));
    if (def === undefined) {
      throw new Error(`loadFlowFacts: no published definition of workflow ${row.workflow_id} at version ${row.workflow_version}, which ticket ${row.ticket_id} is folded to`);
    }
    const state = statesWithBacklog(def).find((s) => s.id === row.state_id);
    if (state === undefined) {
      throw new Error(`loadFlowFacts: workflow ${row.workflow_id}@${row.workflow_version} has no state ${row.state_id}, which ticket ${row.ticket_id} is in`);
    }
    const mine = notes.get(row.ticket_id) ?? [];
    facts.set(row.ticket_id, {
      key: keys.get(row.ticket_id) ?? null,
      title: titleOf(row),
      projectId: row.project_id,
      stateName: state.name,
      initialStateName: def.states.find((s) => s.id === def.initialStateId)?.name ?? state.name,
      assigneeId: row.assignee_id,
      assigneeName: row.assignee_id === null ? null : (names.get(row.assignee_id) ?? null),
      notes: mine.map((n) => ({ id: n.noteId, title: n.title })),
      pinNotes: mine.length,
      pinAttachments: attached.get(row.ticket_id) ?? 0,
    });
  }
  return facts;
}
