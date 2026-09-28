import {
  ticketKey,
  type NoteComment,
  type NoteDetail,
  type NoteScopeMode,
  type NoteSummary,
  type NoteVersion,
} from '@gisik-nokma/domain';
import type { Queryable } from '../db/queryable.js';
import type { EffectiveRole } from '../permissions/effective-role.js';
import { scopeOf } from '../projections/notes.js';
import { LIVE_TICKET_WHERE, visibleNotesWhere, visibleTicketsWhere } from './visible-where.js';
import { SqlParams } from './sql-params.js';
import { ticketNumbers } from './ticket-numbers.js';
import { projectPrefixesInWorkspace } from './visible-projects.js';
import { workspaceIdentityFromLedger } from '../workspaces/workspace-name.js';

/**
 * A project-scoped note whose home project is deleted is gone from the notes
 * list and from a ticket's attached-notes read (Task 6, T10) — the note's own
 * `deleted` column says nothing about its CONTAINER. `n.home_project_id = ''`
 * (a workspace-scoped note) matches no `proj_projects` row, so `NOT EXISTS` is
 * trivially true for it and this clause is a no-op there.
 */
const NOTE_PROJECT_LIVE_WHERE =
  'NOT EXISTS (SELECT 1 FROM proj_projects dp WHERE dp.project_id = n.home_project_id AND dp.deleted_at IS NOT NULL)';

/**
 * The note reads (notes series, Plan 1 of 6, spec §6.4).
 *
 * ## Every function takes `(db, eff, userId, …)` and applies the predicate itself
 *
 * There is no read here that returns a note the caller may not see, and no read
 * that leaves the decision to its caller. The alternative — an "unfiltered"
 * core plus a predicate the route applies — is how one route comes to forget,
 * and the forgetting is invisible because every other route is green.
 *
 * `getNoteDetail` and the two history reads return `null` when the predicate
 * excludes the note, which the routes turn into the SAME 404 an absent note
 * gets. The plan's case 18.031 pins that: an unreadable note and a random id are
 * one answer, or the difference between them is an existence oracle.
 *
 * ## `attachedTickets` is filtered too
 *
 * A note's summary carries the ticket keys it is attached to, and a reader of
 * the note who cannot see one of those tickets does not learn its key (spec
 * §6.4). That filter is `visibleTicketsWhere`, the same predicate the ticket
 * reads use — not a second one written here.
 */

/**
 * The row shape `proj_notes` returns. Column names are the projection's; the
 * mapper is the only place they meet the domain's.
 *
 * `seq` is `bigint`, so the driver may hand back a string: the pool installs no
 * int8 parser (see `ticket-numbers.ts`), and `Number()` is the same narrowing
 * `rowToNoteState` applies. The body is `jsonb` and arrives already parsed.
 */
type NoteRow = {
  note_id: string;
  workspace_id: string;
  home_project_id: string;
  author_id: string;
  title: string;
  body: unknown;
  schema_version: number;
  scope_mode: NoteScopeMode;
  scope_user_ids: string[];
  deleted: boolean;
  created_at: Date;
  updated_at: Date;
};

/** One attached ticket, as the summary carries it. */
type AttachedTicket = { ticketId: string; projectId: string; key: string; title: string };

function summaryOf(row: NoteRow, attachedTickets: AttachedTicket[]): NoteSummary {
  return {
    noteId: row.note_id,
    workspaceId: row.workspace_id,
    homeProjectId: row.home_project_id,
    authorId: row.author_id,
    title: row.title,
    scope: scopeOf(row.scope_mode, row.scope_user_ids),
    attachedTickets,
    deleted: row.deleted,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

/**
 * The `key` and `title` of each attached, VISIBLE, live ticket, grouped by note.
 *
 * ## Why the key is composed here and three reads go with it
 *
 * `ticketKey(workspacePrefix, projectPrefix, number)` is the product's one
 * composer (see `routes/tickets.ts`'s docblock at the call site): the two
 * prefixes come from readers that are already tested and already served, and the
 * number is the ticket's position among its project's creations by
 * `workspace_seq` (`ticket-numbers.ts`, which explains why it cannot be a
 * column). Composing on the CLIENT would need three numbers shipped per row and
 * a second composer free to disagree; composing here means a note row costs one
 * extra pass over the workspace's prefixes and one batched number lookup, not
 * one lookup per attached ticket.
 *
 * A ticket whose number or project prefix is unavailable renders `''` for the
 * key rather than dropping the row: `ticket-numbers.ts`'s ruling is that a key
 * is not worth refusing a read over, and dropping the ticket would hide an
 * attachment the viewer CAN see.
 */
export async function attachedTicketsByNote(
  db: Queryable,
  eff: EffectiveRole,
  userId: string,
  workspaceId: string,
  noteIds: readonly string[],
): Promise<Map<string, AttachedTicket[]>> {
  const grouped = new Map<string, AttachedTicket[]>();
  if (noteIds.length === 0) return grouped;
  const params = new SqlParams();
  const ids = params.add(noteIds);
  const { rows } = await db.query<{
    note_id: string;
    ticket_id: string;
    project_id: string;
    title: string | null;
  }>(
    `SELECT na.note_id, t.ticket_id, t.project_id, t.fields -> 'title' ->> 'value' AS title
       FROM proj_note_attachments na
       JOIN proj_tickets t ON t.ticket_id = na.ticket_id
       JOIN proj_visibility v ON v.ticket_id = na.ticket_id
      WHERE na.note_id = ANY (${ids}::text[]) AND ${LIVE_TICKET_WHERE} AND ${visibleTicketsWhere(eff, userId, params)}
      ORDER BY na.note_id, t.ticket_id`,
    params.toArray(),
  );
  const identity = await workspaceIdentityFromLedger(db, workspaceId);
  const prefixes = await projectPrefixesInWorkspace(db, workspaceId);
  const numbers = await ticketNumbers(
    db,
    workspaceId,
    rows.map((row) => row.ticket_id),
  );
  for (const row of rows) {
    const projectPrefix = prefixes.get(row.project_id) ?? null;
    const number = numbers.get(row.ticket_id) ?? null;
    const key =
      identity.prefix === null || projectPrefix === null || number === null
        ? ''
        : ticketKey(identity.prefix, projectPrefix, number);
    const list = grouped.get(row.note_id) ?? [];
    list.push({ ticketId: row.ticket_id, projectId: row.project_id, key, title: row.title ?? '' });
    grouped.set(row.note_id, list);
  }
  return grouped;
}

async function summariesOf(
  db: Queryable,
  eff: EffectiveRole,
  userId: string,
  workspaceId: string,
  rows: NoteRow[],
): Promise<NoteSummary[]> {
  const attached = await attachedTicketsByNote(
    db,
    eff,
    userId,
    workspaceId,
    rows.map((row) => row.note_id),
  );
  return rows.map((row) => summaryOf(row, attached.get(row.note_id) ?? []));
}

/**
 * Every note in one workspace this viewer may read, newest first.
 *
 * `ORDER BY updated_at DESC, note_id` — the id is the tiebreak, not decoration:
 * two notes saved in the same millisecond must come back in a STABLE order, or a
 * client that pages or caches sees them swap.
 */
export async function listNotes(
  db: Queryable,
  eff: EffectiveRole,
  userId: string,
  workspaceId: string,
  filter: { homeProjectId?: string; authorId?: string; scopeMode?: NoteScopeMode; deleted?: boolean } = {},
): Promise<NoteSummary[]> {
  const params = new SqlParams();
  const clauses = [
    `n.workspace_id = ${params.add(workspaceId)}`,
    visibleNotesWhere(eff, userId, params),
    NOTE_PROJECT_LIVE_WHERE,
  ];
  if (filter.deleted === true) {
    clauses.push('n.deleted = TRUE');
    // Spec §4.1's deleted rule, and it is NOT `visibleNotesWhere`'s: a deleted
    // note is readable by the same people, but only the author, a workspace
    // admin or the owner may go LOOKING for deleted notes. Without this line any
    // reader would see the whole undo pile of their workspace.
    const role = eff.workspaceRole;
    if (role !== 'owner' && role !== 'admin') clauses.push(`n.author_id = ${params.add(userId)}`);
  } else {
    clauses.push('n.deleted = FALSE');
  }
  if (filter.homeProjectId !== undefined) clauses.push(`n.home_project_id = ${params.add(filter.homeProjectId)}`);
  if (filter.authorId !== undefined) clauses.push(`n.author_id = ${params.add(filter.authorId)}`);
  if (filter.scopeMode !== undefined) clauses.push(`n.scope_mode = ${params.add(filter.scopeMode)}`);
  const { rows } = await db.query<NoteRow>(
    `SELECT n.* FROM proj_notes n WHERE ${clauses.join(' AND ')} ORDER BY n.updated_at DESC, n.note_id`,
    params.toArray(),
  );
  return summariesOf(db, eff, userId, workspaceId, rows);
}

/**
 * One note, with its body — or `null` when it does not exist OR this viewer may
 * not see it. The two are one answer on purpose (spec §6.4).
 */
export async function getNoteDetail(
  db: Queryable,
  eff: EffectiveRole,
  userId: string,
  noteId: string,
): Promise<NoteDetail | null> {
  const params = new SqlParams();
  const id = params.add(noteId);
  const { rows } = await db.query<NoteRow>(
    `SELECT n.* FROM proj_notes n WHERE n.note_id = ${id} AND ${visibleNotesWhere(eff, userId, params)}`,
    params.toArray(),
  );
  const row = rows[0];
  if (row === undefined) return null;
  const attached = await attachedTicketsByNote(db, eff, userId, row.workspace_id, [row.note_id]);
  return {
    ...summaryOf(row, attached.get(row.note_id) ?? []),
    body: row.body,
    schemaVersion: row.schema_version,
  };
}

/**
 * The notes attached to one ticket that this viewer may read (owner decision D5:
 * a note the viewer cannot read is simply ABSENT — no locked badge, no count of
 * hidden notes).
 */
export async function listNotesForTicket(
  db: Queryable,
  eff: EffectiveRole,
  userId: string,
  workspaceId: string,
  ticketId: string,
): Promise<NoteSummary[]> {
  const params = new SqlParams();
  const clauses = [
    `n.workspace_id = ${params.add(workspaceId)}`,
    `na.ticket_id = ${params.add(ticketId)}`,
    'n.deleted = FALSE',
    visibleNotesWhere(eff, userId, params),
    NOTE_PROJECT_LIVE_WHERE,
  ];
  const { rows } = await db.query<NoteRow>(
    `SELECT n.* FROM proj_notes n
       JOIN proj_note_attachments na ON na.note_id = n.note_id
      WHERE ${clauses.join(' AND ')}
      ORDER BY n.updated_at DESC, n.note_id`,
    params.toArray(),
  );
  return summariesOf(db, eff, userId, workspaceId, rows);
}

/**
 * A note's comment thread, oldest first.
 *
 * ORDER BY `workspace_seq`, matching `listTicketComments`: a comment thread
 * reads as a conversation, so it is ordered by when the claim entered the
 * workspace rather than by any per-entity numbering.
 *
 * CARRIES NO READABILITY CHECK, and its caller must apply one. That is the one
 * exception to this module's rule, and it exists because the route already has
 * the answer: it resolved the note to learn its workspace, which means it has
 * already been through `getNoteDetail` or an equivalent. A second check inside
 * would be a second source of truth for "may this person read it".
 */
export async function listNoteComments(db: Queryable, noteId: string): Promise<NoteComment[]> {
  const { rows } = await db.query<{
    comment_id: string;
    author_id: string;
    body: unknown;
    recorded_at: Date;
  }>(
    `SELECT comment_id, author_id, body, recorded_at
       FROM proj_note_comments
      WHERE note_id = $1
      ORDER BY workspace_seq`,
    [noteId],
  );
  return rows.map((row) => ({
    commentId: row.comment_id,
    authorId: row.author_id,
    body: row.body,
    recordedAt: row.recorded_at.toISOString(),
  }));
}

/**
 * The note's saved versions, oldest first: `note.created` and every
 * `note.body_set`, and nothing else.
 *
 * `note.renamed` is deliberately OUT. The versions screen exists to show and
 * restore what the note SAID (D15); a rename moves the title, which the note's
 * current row already carries and which no version view offers to restore. A
 * version that only changed the title would appear as a duplicate body, which
 * is a worse lie than an omission.
 *
 * Read straight from `events` — there is no `proj_note_versions` table and
 * `1790100000000_proj-notes.sql` says why: the ledger already holds every
 * version, and a projection of it would be a second copy that can go stale.
 */
export async function listNoteHistory(db: Queryable, noteId: string): Promise<NoteVersion[]> {
  const { rows } = await db.query<{
    id: string;
    actor_id: string;
    server_time: Date;
    seq: string | number;
  }>(
    `SELECT id, actor_id, server_time, seq
       FROM events
      WHERE entity_kind = 'note' AND entity_id = $1 AND type IN ('note.created', 'note.body_set')
      ORDER BY seq`,
    [noteId],
  );
  return rows.map((row) => ({
    eventId: row.id,
    authorId: row.actor_id,
    recordedAt: row.server_time.toISOString(),
    seq: Number(row.seq),
  }));
}

/**
 * One version's body — that event's `payload.body`, or `null` when the event is
 * not a version of this note at all.
 *
 * The event type is constrained as well as the id, so a `note.renamed` id
 * answers `null` rather than leaking a payload the history does not list. A
 * `note.created` written without a body answers `null` too, and that is the
 * honest answer at this layer: the EMPTY document is the REDUCER's fallback
 * (`EMPTY_NOTE_DOC`), not a fact any event recorded.
 */
export async function getNoteVersionBody(
  db: Queryable,
  noteId: string,
  eventId: string,
): Promise<unknown | null> {
  const { rows } = await db.query<{ body: unknown }>(
    `SELECT payload -> 'body' AS body
       FROM events
      WHERE entity_kind = 'note' AND entity_id = $1 AND id = $2
        AND type IN ('note.created', 'note.body_set')`,
    [noteId, eventId],
  );
  const row = rows[0];
  if (row === undefined) return null;
  return row.body ?? null;
}
