import { parseNotification, type Notification } from '@gisik-nokma/domain';
import type { Queryable } from '../db/queryable.js';

/**
 * The `notifications` table is deliberately NOT a projection: it is never
 * registered in `buildProjectionRegistry`, the verifier never re-derives it,
 * and replaying the ledger must never re-create rows here (a notification
 * re-materialising as unread after a rebuild would be the system inventing
 * a second nag out of one fact). Writers (Task 5's fan-out, Task 6's sweep)
 * are responsible for that guarantee; this module only stores and reads.
 *
 * Ruling (Plan 9 coordination): a notification row stays UNREDACTED after
 * the recipient's visibility to the underlying ticket is later revoked — "a
 * message you were sent is yours; revocation removes future sight, not
 * letters delivered." Nothing below scrubs, filters, or redacts a row on
 * read, and nothing like that should be added.
 */

type NotificationRowRecord = {
  id: string;
  user_id: string;
  workspace_id: string;
  kind: string;
  dedupe_key: string;
  payload: unknown;
  read: boolean;
  created_at: Date;
};

function rowToNotification(row: NotificationRowRecord): Notification {
  // parseNotification is the boundary check: a row that fails its kind's
  // schema is corrupt and must fail loudly, not render as a half-message.
  return parseNotification({
    id: row.id,
    userId: row.user_id,
    workspaceId: row.workspace_id,
    kind: row.kind,
    dedupeKey: row.dedupe_key,
    payload: row.payload,
    read: row.read,
    createdAt: row.created_at.toISOString(),
  });
}

export async function insertNotification(db: Queryable, notification: Notification): Promise<'inserted' | 'duplicate'> {
  const result = await db.query(
    `INSERT INTO notifications (id, user_id, workspace_id, kind, dedupe_key, payload, read, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT ON CONSTRAINT notifications_user_dedupe_unique DO NOTHING`,
    [
      notification.id,
      notification.userId,
      notification.workspaceId,
      notification.kind,
      notification.dedupeKey,
      JSON.stringify(notification.payload),
      notification.read,
      notification.createdAt,
    ],
  );
  return result.rowCount === 1 ? 'inserted' : 'duplicate';
}

export type NotificationPage = { notifications: Notification[]; nextCursor: string | null };

export async function listNotifications(
  db: Queryable,
  userId: string,
  opts: { cursor?: string | null; limit?: number; workspaceId?: string | null },
): Promise<NotificationPage> {
  const limit = Math.min(Math.max(opts.limit ?? 30, 1), 100);
  const params: unknown[] = [userId];
  let where = 'user_id = $1';
  if (opts.cursor) {
    params.push(opts.cursor);
    where += ` AND id < $${params.length}`;
  }
  if (opts.workspaceId) {
    params.push(opts.workspaceId);
    where += ` AND workspace_id = $${params.length}`;
  }
  params.push(limit + 1); // fetch one extra to learn whether a next page exists
  const result = await db.query(
    `SELECT id, user_id, workspace_id, kind, dedupe_key, payload, read, created_at
       FROM notifications
      WHERE ${where}
      ORDER BY id DESC
      LIMIT $${params.length}`,
    params,
  );
  const rows = result.rows as NotificationRowRecord[];
  const page = rows.slice(0, limit);
  const lastRow = page[page.length - 1];
  return {
    notifications: page.map(rowToNotification),
    nextCursor: rows.length > limit && lastRow ? lastRow.id : null,
  };
}

export async function markNotificationRead(db: Queryable, userId: string, id: string): Promise<boolean> {
  const result = await db.query('UPDATE notifications SET read = true WHERE id = $1 AND user_id = $2', [id, userId]);
  return (result.rowCount ?? 0) > 0;
}

export async function unreadNotificationCount(db: Queryable, userId: string): Promise<number> {
  const result = await db.query('SELECT count(*)::int AS unread FROM notifications WHERE user_id = $1 AND read = false', [
    userId,
  ]);
  return (result.rows[0] as { unread: number }).unread;
}
