import { parseNotification, type Notification, type NotificationKind } from '@gisik-nokma/domain';
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
  opts: {
    cursor?: string | null;
    limit?: number;
    workspaceId?: string | null;
    /**
     * Kinds this caller has muted (`getNotificationPreferences`) — rows of
     * these kinds never reach the page at all, the same exclusion
     * `unreadNotificationCount` applies to its count. Defaults to `[]`,
     * matching that function's default: `kind = ANY('{}'::text[])` is
     * `false` for every row (measured, not merely reasoned — an empty
     * Postgres array is never NULL here), so `NOT (...)` is `true` for
     * every row and an empty list excludes nothing.
     */
    mutedKinds?: readonly string[];
    /**
     * The inbox's `Unread` tab (2026-09-19). `true` narrows to unread rows
     * only; absent or `false` is the unfiltered read, so **every existing
     * caller keeps the same answer** — the shape `mutedKinds` set.
     *
     * `read = false`, not `NOT read`: the column is `NOT NULL DEFAULT false`
     * (`1788278094725`'s migration family), so the two spellings agree on
     * every row that can exist, and this one says what it means.
     */
    unreadOnly?: boolean;
    /**
     * The inbox's `Mentions` tab sends `'mention'`. Typed with the domain's own
     * union, which IS on the barrel (`index.ts:38` is `export * from
     * './notifications.js'`; an earlier draft of this docblock claimed
     * otherwise because a grep for the NAME could not see through the
     * star-export, and the claim was wrong). **The ROUTE still validates the
     * query string against `NOTIFICATION_KINDS`**, because a caller-supplied
     * value is text until something checks it — this type bounds the internal
     * callers, the route bounds the wire.
     */
    kind?: NotificationKind | null;
  },
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
  if (opts.unreadOnly) {
    where += ' AND read = false';
  }
  if (opts.kind) {
    params.push(opts.kind);
    where += ` AND kind = $${params.length}`;
  }
  params.push(opts.mutedKinds ?? []);
  where += ` AND NOT (kind = ANY($${params.length}::text[]))`;
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

/**
 * THE BULK WRITE, and with it the UNREAD direction — which did not exist before
 * this. `markNotificationRead` above is one-way, so the only edit this table
 * could take was read-ward; nothing in the product could put a notification
 * back. That is the gap a bulk action's Undo needs closed, and it is closed by
 * the same statement carrying the flag rather than by a second statement with
 * the `true` changed to `false`.
 *
 * **One statement for both directions, on purpose.** Two functions would be two
 * answers to "what does setting the flag do", free to drift; the flag is a
 * PARAMETER here, so there is nothing to drift from. Note that this did NOT
 * extend the per-id route with a flag — that route answers "mark THIS one read"
 * and stays as it was; a route that answered both would be one door answering
 * two questions, which this repo refuses by name.
 *
 * ## It RETURNS THE IDS IT CHANGED, and the client's Undo depends on it
 *
 * `RETURNING id` is not a convenience. The ruled Undo must send `read: false`
 * **for exactly the ids the bulk call changed** — not for the ids the client
 * asked about, which may include rows that were already read and that a
 * blanket un-read would therefore WRONGLY flip. The prototype happens to agree:
 * its `markAllRead` counts `s.notifs.filter((x) => !x.read).length`
 * (`desktop.dc.html:3027-3029`), i.e. the rows that actually changed, and the
 * toast prints that number.
 *
 * Scoped to the caller's own rows by `user_id` in the same statement — an id
 * belonging to somebody else is not an error, it is simply not among the rows
 * returned, so a caller cannot learn whether it exists by watching the count.
 */
export async function markNotificationsRead(
  db: Queryable,
  userId: string,
  ids: readonly string[],
  read: boolean,
): Promise<string[]> {
  /**
   * ⚠ `AND read IS DISTINCT FROM $1` IS NOT AN OPTIMISATION — THE WHOLE
   * CONTRACT RESTS ON IT, and the first version of this statement did not have
   * it.
   *
   * `UPDATE … RETURNING id` reports every row the `WHERE` **matched**, not
   * every row whose value **changed**. A row that was already read matches
   * `id = ANY(…) AND user_id = $3` and comes back in `RETURNING` identically to
   * one that flipped — so the caller is told it changed something it did not.
   * For the forward call that is a lying count; **for the Undo it is worse: the
   * client un-reads "exactly what changed", so an already-read row would be
   * flipped to unread by an action that never touched it**, inventing an unread
   * notification on screen with nothing recording who did it.
   *
   * Measured rather than reasoned: the case that asserts the Undo leaves an
   * already-read row READ failed against the unqualified statement, and names
   * this. `IS DISTINCT FROM $1::boolean` restricts the update to the rows whose
   * value actually moves — which is also what makes `changed.length` the count
   * the prototype prints (`desktop.dc.html:3027-3029`).
   */
  const result = await db.query(
    `UPDATE notifications SET read = $1
      WHERE id = ANY($2::text[]) AND user_id = $3 AND read IS DISTINCT FROM $1::boolean
      RETURNING id`,
    [read, ids, userId],
  );
  return (result.rows as { id: string }[]).map((row) => row.id);
}

/**
 * `mutedKinds` (account/help-screens plan, Task 5) defaults to `[]`, so
 * every existing caller keeps compiling and reading the same count as
 * before — the exclusion is opt-in per call, not a behaviour change nobody
 * asked for. `NOT (kind = ANY($2::text[]))` over an empty array is `true`
 * for every row (measured against the real Postgres in this repo's test
 * database, not merely reasoned from the docs), which is what makes the
 * default a true no-op rather than an accidental empty count.
 */
export async function unreadNotificationCount(
  db: Queryable,
  userId: string,
  mutedKinds: readonly string[] = [],
): Promise<number> {
  const result = await db.query(
    'SELECT count(*)::int AS unread FROM notifications WHERE user_id = $1 AND read = false AND NOT (kind = ANY($2::text[]))',
    [userId, mutedKinds],
  );
  return (result.rows[0] as { unread: number }).unread;
}
