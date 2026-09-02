import type { Queryable } from '../db/queryable.js';

export type AttachmentRow = {
  id: string;
  workspaceId: string;
  ticketId: string;
  uploaderId: string;
  filename: string;
  mime: string;
  size: number;
  objectKey: string;
  sha256: string | null;
  createdAt: string;
};

const COLUMNS = `id, workspace_id, ticket_id, uploader_id, filename, mime, size, object_key, sha256, created_at::text AS created_at`;

type DbRow = {
  id: string;
  workspace_id: string;
  ticket_id: string;
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
    uploaderId: db.uploader_id,
    filename: db.filename,
    mime: db.mime,
    size: db.size,
    objectKey: db.object_key,
    sha256: db.sha256 ?? null,
    createdAt: db.created_at,
  };
}

export async function insertAttachment(
  db: Queryable,
  row: Omit<AttachmentRow, 'createdAt' | 'sha256'> & { sha256?: string },
): Promise<void> {
  await db.query(
    `INSERT INTO attachments (id, workspace_id, ticket_id, uploader_id, filename, mime, size, object_key, sha256)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [
      row.id,
      row.workspaceId,
      row.ticketId,
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

export async function listTicketAttachments(db: Queryable, ticketId: string): Promise<AttachmentRow[]> {
  const result = await db.query(
    `SELECT ${COLUMNS} FROM attachments WHERE ticket_id = $1 ORDER BY created_at, id`,
    [ticketId],
  );
  return (result.rows as DbRow[]).map(toRow);
}
