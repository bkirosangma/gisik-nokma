import type { PoolClient } from 'pg';
import {
  applyNoteEvent,
  NOTE_EVENT_TYPES,
  type LedgerEvent,
  type NoteScope,
  type NoteState,
} from '@gisik-nokma/domain';
import type { Queryable } from '../db/queryable.js';
import type { Projection } from './registry.js';

/**
 * `proj_notes` — the notes series' head-state projection (Plan 1 of 6, spec
 * §6.2).
 *
 * ## The load-bearing decision: read state, fold, write the WHOLE row
 *
 * `apply` does not translate the event into a column update. It LOADS the
 * current `NoteState` from the tables, calls `applyNoteEvent` — the same
 * function the client replica calls — and writes the resulting state back. That
 * is what makes the table a pure function of the ledger in the strict sense
 * `verify-projections` checks, and it is not a style preference: the two scopes
 * that a naive per-event UPDATE would get wrong are both in this query's own
 * docblock. `scope_mode` is the note's CURRENT scope, which after a detach is
 * the scope it reverted to and not the one the last `scope_set` payload named;
 * `pre_inherit_mode` is SET by an entering `scope_set` and CLEARED by the last
 * detach, so only a writer that has the whole state can clear it.
 *
 * The cost is a read per event on a note. It is paid deliberately: a note's
 * event count is small (a document, not a stream of field sets), and the
 * alternative is a second implementation of the reducer's transitions living in
 * SQL, free to disagree with the one the client runs.
 *
 * ## Why it reads its OWN tables rather than another projection's
 *
 * `getNoteStateFromDb` reads `proj_notes` and `proj_note_attachments` — both of
 * which this projection owns (`tables`, below). A projection that read another
 * projection's table would have to be ORDERED after it in `index.ts`, and the
 * ordering would be a fact about this file that nothing in this file states.
 * Owning both is what lets it sit anywhere in the registry.
 */

type NoteRow = {
  note_id: string;
  workspace_id: string;
  home_project_id: string;
  author_id: string;
  title: string;
  body: unknown;
  schema_version: number;
  scope_mode: NoteScope['mode'];
  scope_user_ids: string[];
  pre_inherit_mode: NoteScope['mode'] | null;
  pre_inherit_user_ids: string[];
  deleted: boolean;
  created_at: Date;
  updated_at: Date;
  last_body_event_id: string;
  seq: string | number;
  workspace_seq: string | number;
};

/**
 * A stored scope back into the union — one spelling for both callers that need
 * it (`rowToNoteState` here, and the summarisers in `read/notes.ts`, which
 * export this).
 *
 * `userIds` is carried ONLY for `explicit`, matching what the projection writes
 * (`scope_user_ids` is `'{}'` for every other mode). A row whose mode is
 * `explicit` and whose array is empty is not representable as a `NoteScope` —
 * `explicit` means a non-empty list — and that is the honest reading: the
 * schema refuses an empty explicit list at the door (`note-events.ts`), so an
 * empty array on an explicit row means the row and the ledger disagree.
 */
export function scopeOf(mode: NoteScope['mode'], userIds: string[]): NoteScope {
  return mode === 'explicit' ? { mode, userIds } : { mode };
}

export function rowToNoteState(row: NoteRow, attachedTicketIds: string[]): NoteState {
  return {
    noteId: row.note_id,
    workspaceId: row.workspace_id,
    authorId: row.author_id,
    title: row.title,
    body: row.body,
    homeProjectId: row.home_project_id,
    scope: scopeOf(row.scope_mode, row.scope_user_ids),
    scopeBeforeInherit:
      row.pre_inherit_mode === null ? null : scopeOf(row.pre_inherit_mode, row.pre_inherit_user_ids),
    attachedTicketIds,
    deleted: row.deleted,
    // `.toISOString()` rather than the driver's Date, because `NoteState`'s
    // clocks are ISO strings on BOTH sides — the reducer's `createdAt` comes
    // from `env.serverTime`, which is a string. Comparing a Date to a string
    // would make the round-trip test (18.019) fail on a value that is the right
    // instant, and it would fail in the one place a reader would then "fix" by
    // stringifying somewhere else.
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
    lastBodyEventId: row.last_body_event_id,
    // `seq` and `workspace_seq` are bigint; the pool installs an int8 parser
    // (see `read/ticket-numbers.ts`'s note on why every reader of these columns
    // must not assume the driver's default). `Number()` is the same narrowing
    // `rowToTicketState` applies.
    seq: Number(row.seq),
  };
}

/**
 * The note's current state, or `null` when it has none — the ONE reader both
 * the projection and every permission/read path go through. `canReadNote`'s
 * loader, `checkNotePermission`, the note routes and the attachment routes all
 * call this rather than assembling a state from columns themselves.
 */
export async function getNoteStateFromDb(db: Queryable, noteId: string): Promise<NoteState | null> {
  const { rows } = await db.query<NoteRow>('SELECT * FROM proj_notes WHERE note_id = $1', [noteId]);
  const row = rows[0];
  if (row === undefined) return null;
  const att = await db.query<{ ticket_id: string }>(
    'SELECT ticket_id FROM proj_note_attachments WHERE note_id = $1 ORDER BY ticket_id',
    [noteId],
  );
  return rowToNoteState(
    row,
    att.rows.map((r) => r.ticket_id),
  );
}

/**
 * The document's schema version, read out of the document itself.
 *
 * `DocJson` carries `attrs.schemaVersion` (packages/editor/src/doc.ts), so the
 * version is a property of the stored JSON and not a second fact beside it —
 * which is exactly why it must be READ rather than defaulted. A ticket document
 * written under schema 1 stays readable after the schema moves; a projection
 * that hard-coded the current version would relabel every old document as new
 * on rebuild, and the verifier would call that drift.
 *
 * The default is 1 for a body that names none: a document written before
 * versioning rides at 1 (the editor's own default), and `EMPTY_NOTE_DOC` says 1.
 */
function schemaVersionOf(body: unknown): number {
  const attrs = (body as { attrs?: { schemaVersion?: unknown } } | null)?.attrs;
  return typeof attrs?.schemaVersion === 'number' ? attrs.schemaVersion : 1;
}

async function upsertNote(tx: PoolClient, next: NoteState, event: LedgerEvent): Promise<void> {
  const pre = next.scopeBeforeInherit;
  await tx.query(
    `INSERT INTO proj_notes
       (note_id, workspace_id, home_project_id, author_id, title, body, schema_version, scope_mode, scope_user_ids,
        pre_inherit_mode, pre_inherit_user_ids, deleted, created_at, updated_at, last_body_event_id, seq, workspace_seq)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
     ON CONFLICT (note_id) DO UPDATE SET
       home_project_id = EXCLUDED.home_project_id, title = EXCLUDED.title, body = EXCLUDED.body,
       schema_version = EXCLUDED.schema_version, scope_mode = EXCLUDED.scope_mode, scope_user_ids = EXCLUDED.scope_user_ids,
       pre_inherit_mode = EXCLUDED.pre_inherit_mode, pre_inherit_user_ids = EXCLUDED.pre_inherit_user_ids,
       deleted = EXCLUDED.deleted, updated_at = EXCLUDED.updated_at, last_body_event_id = EXCLUDED.last_body_event_id,
       seq = EXCLUDED.seq, workspace_seq = EXCLUDED.workspace_seq`,
    [
      next.noteId,
      next.workspaceId,
      next.homeProjectId,
      next.authorId,
      next.title,
      JSON.stringify(next.body),
      schemaVersionOf(next.body),
      next.scope.mode,
      next.scope.mode === 'explicit' ? next.scope.userIds : [],
      pre === null ? null : pre.mode,
      pre !== null && pre.mode === 'explicit' ? pre.userIds : [],
      next.deleted,
      next.createdAt,
      next.updatedAt,
      next.lastBodyEventId,
      next.seq,
      event.workspaceSeq,
    ],
  );
}

export const notesProjection: Projection = {
  name: 'proj_notes',
  tables: ['proj_notes', 'proj_note_attachments'],

  async apply(event: LedgerEvent, tx: PoolClient): Promise<void> {
    // Two guards, and they are different questions. The KIND test keeps a
    // ticket event out of a note's tables; the TYPE test keeps a note event the
    // reducer does not fold (`comment.added` is in NOTE_EVENT_TYPES but is in
    // neither — the line below) from reaching `applyNoteEvent`, which would
    // refuse it and abort the whole replay.
    if (event.entity.kind !== 'note' || !(NOTE_EVENT_TYPES as readonly string[]).includes(event.type)) return;
    // `proj_note_comments` belongs to the comments projection, not this one, and
    // the reducer folds `comment.added` to no change — so without this line the
    // event would still cause a pointless full-row write, and `applyNoteEvent`
    // would be asked about a note the comments table already covers.
    if (event.type === 'comment.added') return;
    const current = await getNoteStateFromDb(tx, event.entity.id);
    const next = applyNoteEvent(current, event);
    await upsertNote(tx, next, event);
    if (event.type === 'note.created' && next.attachedTicketIds.length === 1) {
      await insertAttachment(tx, next, next.attachedTicketIds[0]!, event);
    } else if (event.type === 'note.attached') {
      const ticketId = (event.payload as { ticketId: string }).ticketId;
      await insertAttachment(tx, next, ticketId, event);
    } else if (event.type === 'note.detached') {
      await tx.query('DELETE FROM proj_note_attachments WHERE note_id = $1 AND ticket_id = $2', [
        next.noteId,
        (event.payload as { ticketId: string }).ticketId,
      ]);
    }
  },

  async reset(tx: PoolClient): Promise<void> {
    // TRUNCATE, not DELETE (controller ruling P4), matching every shipped
    // projection.
    await tx.query('TRUNCATE proj_notes, proj_note_attachments');
  },
};

/**
 * One note→ticket link. `ON CONFLICT DO NOTHING` rather than an update, because
 * the link's identity IS `(note_id, ticket_id)` and there is nothing about a
 * RE-attach to change: `note.attached` is idempotent in the reducer for the
 * same reason, and a device replaying a dropped ack must not rewrite
 * `attached_at` to a later instant than the link was actually made.
 */
async function insertAttachment(
  tx: PoolClient,
  next: NoteState,
  ticketId: string,
  event: LedgerEvent,
): Promise<void> {
  await tx.query(
    `INSERT INTO proj_note_attachments (note_id, ticket_id, workspace_id, attached_at, workspace_seq)
     VALUES ($1,$2,$3,$4,$5) ON CONFLICT (note_id, ticket_id) DO NOTHING`,
    [next.noteId, ticketId, next.workspaceId, event.serverTime, event.workspaceSeq],
  );
}
