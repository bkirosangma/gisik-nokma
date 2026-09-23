import type { Queryable } from '../db/queryable.js';

export type AttachmentRow = {
  id: string;
  workspaceId: string;
  /**
   * The owner pair, and exactly one of the two is set.
   *
   * Since the notes series (Plan 1 of 6, spec §4.4) a file may be uploaded into
   * a ticket or into a note. `attachments_one_owner_check` refuses a row that
   * sets neither or both, and `AttachmentOwner` refuses the same two shapes to
   * a writer before Postgres ever sees them.
   *
   * `null` on both fields rather than a discriminated union on the ROW is
   * deliberate: a row is what a SELECT returns, and a union would force every
   * reader that only wants a filename to narrow first.
   */
  ticketId: string | null;
  noteId: string | null;
  uploaderId: string;
  filename: string;
  mime: string;
  size: number;
  objectKey: string;
  sha256: string | null;
  createdAt: string;
};

/**
 * A row KNOWN to be ticket-owned — what the ticket-scoped readers return,
 * because their queries filter `ticket_id = $1`, so a row they hand back has a
 * non-null ticket BY CONSTRUCTION.
 *
 * The narrowing is a TYPE rather than a runtime assert on purpose. Every
 * consumer today reads `ticketId` as a string — the ticket route maps it, the
 * image-embed gate compares it — and widening to the full row would oblige each
 * of them to narrow a value that cannot be the other arm. The queries are what
 * make it true; this type states that fact once, beside them.
 */
export type TicketOwnedAttachmentRow = AttachmentRow & { ticketId: string; noteId: null };

/**
 * Exactly one owner, as a type. A writer naming neither or both is a compile
 * error here and a CHECK violation in the table — the same rule in the two
 * places it can be enforced.
 */
export type AttachmentOwner = { ticketId: string; noteId?: null } | { ticketId?: null; noteId: string };

const COLUMNS = `id, workspace_id, ticket_id, note_id, uploader_id, filename, mime, size, object_key, sha256, created_at::text AS created_at`;

type DbRow = {
  id: string;
  workspace_id: string;
  ticket_id: string | null;
  note_id: string | null;
  uploader_id: string;
  filename: string;
  mime: string;
  size: number;
  object_key: string;
  sha256: string | null;
  created_at: string;
};

function toRow(db: DbRow): AttachmentRow {
  return {
    id: db.id,
    workspaceId: db.workspace_id,
    ticketId: db.ticket_id,
    noteId: db.note_id,
    uploaderId: db.uploader_id,
    filename: db.filename,
    mime: db.mime,
    size: db.size,
    objectKey: db.object_key,
    sha256: db.sha256 ?? null,
    createdAt: db.created_at,
  };
}

/**
 * The ticket-owned reading of a row, for callers whose own query proved it.
 *
 * THROWS rather than casting: the only way a row from `SELECT … WHERE ticket_id
 * = $1` is not ticket-owned is a driver or query that stopped applying the
 * predicate, and a silent cast would hand that row to a ticket read as though
 * the ticket id were the note's. A failure here is a broken query, and it should
 * read like one.
 */
function asTicketOwned(row: AttachmentRow): TicketOwnedAttachmentRow {
  if (row.ticketId === null || row.noteId !== null) {
    throw new Error(
      `attachment ${row.id} is not ticket-owned (ticket_id=${String(row.ticketId)}, note_id=${String(row.noteId)}) but was returned by a ticket-scoped query`,
    );
  }
  return row as TicketOwnedAttachmentRow;
}

export async function insertAttachment(
  db: Queryable,
  row: Omit<AttachmentRow, 'createdAt' | 'sha256' | 'ticketId' | 'noteId'> & { sha256?: string } & AttachmentOwner,
): Promise<void> {
  await db.query(
    `INSERT INTO attachments (id, workspace_id, ticket_id, note_id, uploader_id, filename, mime, size, object_key, sha256)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
    [
      row.id,
      row.workspaceId,
      // `?? null` and not `undefined`: the driver sends `undefined` as the
      // string 'undefined' inside a parameter array in some paths, and a
      // CHECK-violating row would then name a note called 'undefined' instead
      // of failing. `AttachmentOwner` already guarantees exactly one is a
      // string, so this is a spelling of the absent arm rather than a default.
      row.ticketId ?? null,
      row.noteId ?? null,
      row.uploaderId,
      row.filename,
      row.mime,
      row.size,
      row.objectKey,
      // The `?? null` is the *unknown* case being written honestly, not a
      // default standing in for a real hash — see the migration's column
      // comment.
      row.sha256 ?? null,
    ],
  );
}

export async function getAttachment(db: Queryable, id: string): Promise<AttachmentRow | null> {
  const result = await db.query(`SELECT ${COLUMNS} FROM attachments WHERE id = $1`, [id]);
  const first = (result.rows as DbRow[])[0];
  return first ? toRow(first) : null;
}

export async function listTicketAttachments(
  db: Queryable,
  ticketId: string,
): Promise<TicketOwnedAttachmentRow[]> {
  const result = await db.query(
    `SELECT ${COLUMNS} FROM attachments WHERE ticket_id = $1 ORDER BY created_at, id`,
    [ticketId],
  );
  return (result.rows as DbRow[]).map(toRow).map(asTicketOwned);
}

/**
 * The attachments named by a set of ids, SCOPED TO ONE TICKET.
 *
 * The ticket predicate is not decoration and is not passed in: it is the same
 * rule `gates/image-embed-gate.ts` enforces at WRITE time (`WHERE ticket_id = $1
 * AND id = ANY($2::text[])`), restated at read time for the same reason that
 * gate gives — an id is a claim of the caller's, and a lookup without the
 * ticket predicate would turn this read into an existence oracle for every
 * attachment in the deployment.
 *
 * The empty case returns before querying. That is a ROUND TRIP saved on the
 * common path (a ticket whose comments embed nothing), not a behaviour: `id =
 * ANY('{}'::text[])` selects no row either.
 *
 * Order is NOT the caller's order — the result is keyed by id by the caller,
 * because `ANY` gives no ordering guarantee and inventing one here would be a
 * second, weaker answer to "what order are these files in" (the document's own
 * order is the one that means something, and it lives in the document).
 */
export async function listAttachmentsByIds(
  db: Queryable,
  ticketId: string,
  ids: readonly string[],
): Promise<TicketOwnedAttachmentRow[]> {
  if (ids.length === 0) return [];
  const result = await db.query(
    `SELECT ${COLUMNS} FROM attachments WHERE ticket_id = $1 AND id = ANY($2::text[])`,
    [ticketId, [...ids]],
  );
  return (result.rows as DbRow[]).map(toRow).map(asTicketOwned);
}
