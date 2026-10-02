import type { PoolClient } from 'pg';
import {
  applyNoteEvent,
  isCommentEvent,
  NOTE_EVENT_TYPES,
  type LedgerEvent,
  type NoteScope,
  type NoteState,
} from '@gisik-nokma/domain';
import type { Queryable } from '../db/queryable.js';
import { purgedIdsAmong } from '../purge/purged-lookup.js';
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
  deleted_at: Date | null;
  deleted_by: string | null;
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
 * versioning rides at 1. It is not `EMPTY_NOTE_DOC`'s version — the empty
 * document names its version in `attrs`, so it never reaches this default, and
 * the version it names moved to 2 with `DOC_SCHEMA_VERSION` in Plan 4.
 */
function schemaVersionOf(body: unknown): number {
  const attrs = (body as { attrs?: { schemaVersion?: unknown } } | null)?.attrs;
  return typeof attrs?.schemaVersion === 'number' ? attrs.schemaVersion : 1;
}

/**
 * `deleted_at`/`deleted_by` (trash series, Plan 1 Task 2) beside `deleted`.
 * Computed at apply time from the EVENT — `note.deleted` writes `serverTime`/
 * `actorId`, `note.restored` nulls both — never from the reducer: `NoteState`
 * is a shared domain type the client replica also builds, and these two
 * columns are server-projection-only, the same reason `workspace_seq` lives
 * here and not in `NoteState`. Every other note event must PRESERVE whatever
 * is already on the row, since `upsertNote` rewrites the whole row on every
 * note event (19.014's control: `deleted` still flips on delete/restore,
 * independent of this pair).
 */
async function currentNoteDeletion(
  tx: PoolClient,
  noteId: string,
): Promise<{ deletedAt: string | null; deletedBy: string | null }> {
  const { rows } = await tx.query<{ deleted_at: Date | null; deleted_by: string | null }>(
    'SELECT deleted_at, deleted_by FROM proj_notes WHERE note_id = $1',
    [noteId],
  );
  const row = rows[0];
  return { deletedAt: row?.deleted_at ? row.deleted_at.toISOString() : null, deletedBy: row?.deleted_by ?? null };
}

async function upsertNote(
  tx: PoolClient,
  next: NoteState,
  event: LedgerEvent,
  deletedAt: string | null,
  deletedBy: string | null,
): Promise<void> {
  const pre = next.scopeBeforeInherit;
  await tx.query(
    `INSERT INTO proj_notes
       (note_id, workspace_id, home_project_id, author_id, title, body, schema_version, scope_mode, scope_user_ids,
        pre_inherit_mode, pre_inherit_user_ids, deleted, deleted_at, deleted_by, created_at, updated_at,
        last_body_event_id, seq, workspace_seq)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
     ON CONFLICT (note_id) DO UPDATE SET
       home_project_id = EXCLUDED.home_project_id, title = EXCLUDED.title, body = EXCLUDED.body,
       schema_version = EXCLUDED.schema_version, scope_mode = EXCLUDED.scope_mode, scope_user_ids = EXCLUDED.scope_user_ids,
       pre_inherit_mode = EXCLUDED.pre_inherit_mode, pre_inherit_user_ids = EXCLUDED.pre_inherit_user_ids,
       deleted = EXCLUDED.deleted, deleted_at = EXCLUDED.deleted_at, deleted_by = EXCLUDED.deleted_by,
       updated_at = EXCLUDED.updated_at, last_body_event_id = EXCLUDED.last_body_event_id,
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
      deletedAt,
      deletedBy,
      next.createdAt,
      next.updatedAt,
      next.lastBodyEventId,
      next.seq,
      event.workspaceSeq,
    ],
  );
}

/**
 * Trash series Plan 2, deviation D8. The tickets this note attached — by its
 * OWN earlier `note.created`/`note.attached`/`note.detached` — that are now
 * erased. They have no `proj_note_attachments` row (a purge removes it, and the
 * fold below never writes one), but the REDUCER must still see them: a note
 * that attached T and later moved to `inherit` was legal, and without T in
 * `attachedTicketIds` `applyNoteEvent` refuses the `note.scope_set` and a
 * rebuild throws. Reads the note's own stream strictly before this event —
 * per-entity causality, which replay guarantees. The EXISTS short-circuits the
 * common case (no ticket in this workspace has ever been purged).
 */
async function purgedAttachmentsOf(tx: PoolClient, event: LedgerEvent): Promise<string[]> {
  const any = await tx.query<{ present: boolean }>(
    `SELECT EXISTS (SELECT 1 FROM purged_entities WHERE workspace_id = $1 AND entity_kind = 'ticket') AS present`,
    [event.workspaceId],
  );
  if (any.rows[0]?.present !== true) return [];
  const { rows } = await tx.query<{ type: string; payload: { ticketId?: unknown; attachTicketId?: unknown } }>(
    `SELECT type, payload FROM events
      WHERE entity_kind = 'note' AND entity_id = $1 AND seq < $2
        AND type IN ('note.created', 'note.attached', 'note.detached')
      ORDER BY seq`,
    [event.entity.id, event.seq],
  );
  const attached = new Set<string>();
  for (const row of rows) {
    const id = row.type === 'note.created' ? row.payload.attachTicketId : row.payload.ticketId;
    if (typeof id !== 'string') continue;
    if (row.type === 'note.detached') attached.delete(id);
    else attached.add(id);
  }
  return [...(await purgedIdsAmong(tx, 'ticket', [...attached]))].sort();
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
    // the reducer folds the comment events to no change — so without this line the
    // event would still cause a pointless full-row write, and `applyNoteEvent`
    // would be asked about a note the comments table already covers.
    if (isCommentEvent(event.type)) return;
    const stored = await getNoteStateFromDb(tx, event.entity.id);
    const purgedAttached = stored === null ? [] : await purgedAttachmentsOf(tx, event);
    const current =
      stored === null || purgedAttached.length === 0
        ? stored
        : { ...stored, attachedTicketIds: [...new Set([...stored.attachedTicketIds, ...purgedAttached])].sort() };
    const next = applyNoteEvent(current, event);
    const priorDeletion = await currentNoteDeletion(tx, event.entity.id);
    const deletedAt = event.type === 'note.deleted' ? event.serverTime : event.type === 'note.restored' ? null : priorDeletion.deletedAt;
    const deletedBy = event.type === 'note.deleted' ? event.actorId : event.type === 'note.restored' ? null : priorDeletion.deletedBy;
    await upsertNote(tx, next, event, deletedAt, deletedBy);
    // A link to an ERASED ticket is never written (spec §5.6: the surviving note
    // is detached) — live and on rebuild alike, because the registry answers
    // the same both ways.
    const isErased = async (ticketId: string) => (await purgedIdsAmong(tx, 'ticket', [ticketId])).size > 0;
    if (event.type === 'note.created' && next.attachedTicketIds.length === 1) {
      const ticketId = next.attachedTicketIds[0]!;
      if (!(await isErased(ticketId))) await insertAttachment(tx, next, ticketId, event);
    } else if (event.type === 'note.attached') {
      const ticketId = (event.payload as { ticketId: string }).ticketId;
      if (!(await isErased(ticketId))) await insertAttachment(tx, next, ticketId, event);
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
