import { collectImageAttachmentIds } from '@gisik-nokma/domain';
import { listAttachmentsByIds } from '../attachments/attachment-repo.js';
import type { Queryable } from '../db/queryable.js';

/**
 * The comment's files are the attachments ITS OWN DOCUMENT names.
 *
 * ## Why there is no join to `attachment.added`, measured rather than assumed
 *
 * Read from the ledger's own shapes at the branch head:
 *
 *  - `comment.added` is `z.object({ body })` and nothing else
 *    (`packages/domain/src/events/ticket-events.ts:108`) — no files, and no id
 *    of its own beyond the envelope's.
 *  - `attachment.added` is `{kind, attachmentId, filename, mime, size, sha256}`
 *    (or the drive-reference arm) — it names the ticket it belongs to through
 *    its ENTITY, and no comment.
 *  - `attachments` is `(id, workspace_id, ticket_id, uploader_id, filename,
 *    mime, size, object_key, created_at)` — **there is no `comment_id` column**.
 *    ⚠ **THE COLUMN LIST SPANS TWO MIGRATIONS, and citing one was wrong until a
 *    reviewer caught it**: `1788356858695_attachments.sql:3-13` declares NINE
 *    columns and no `sha256`; `sha256` arrives in
 *    `1788362657940_attachment-sha256.sql`. A citation that resolves is not a
 *    citation that is right.
 *
 *    **And the sweep is stated so that it is reproducible against THIS tree.** It
 *    read *"`grep -rn 'comment_id\|commentId'` … returns nothing"*, which is
 *    false of the tree the sentence lives in — this change set's own files are
 *    full of `commentId`. What was MEASURED is that **nothing PRE-EXISTED**: at
 *    the branch's cut point the sweep returned nothing outside the new files, and
 *    the `attachments` CREATE TABLE has never had such a column.
 *
 * So an `attachment.added` event CANNOT be attributed to the comment that was
 * on screen when the file was chosen, and rendering the ticket's files under a
 * comment would invent an attribution — the drawn-absence failure this project
 * refuses by name.
 *
 * The one per-comment file relation that EXISTS is the comment's own body: an
 * `image` node carries `attrs.attachmentId`, and the door refuses an id that
 * does not resolve on that ticket or is not an embeddable image
 * (`gates/image-embed-gate.ts:35-100`). That is the relation this read joins on,
 * and it is the one the chip row draws.
 *
 * ## The unresolvable id: id-only, never dropped
 *
 * The gate makes an unresolvable id unreachable for anything ingested since it
 * shipped — but a ledger written before it, or by a future door that forgets
 * it, would hold one. When it does, the file is rendered with the ID as its
 * name rather than skipped, for the reason `WorkItem.projectName`'s own
 * contract gives (case 3.161): a withheld name leaves the viewer holding the
 * id, *"so the item renders id-only rather than blank"*. Dropping the entry
 * would render a comment as though it carried one file fewer than it says.
 */
export type TicketCommentFile = {
  attachmentId: string;
  /** The stored filename, or the id itself when no row resolves (see above). */
  filename: string;
  /** `null` only when no row resolves — never a guess from the id. */
  mime: string | null;
};

export type TicketCommentRow = {
  /** The `comment.added` event's id — a comment's only identity. */
  commentId: string;
  authorId: string;
  /** The structured document the editor wrote, untouched. */
  body: unknown;
  /** The envelope's `serverTime`, ISO 8601. */
  recordedAt: string;
  files: TicketCommentFile[];
};

type DbRow = {
  comment_id: string;
  author_id: string;
  body: unknown;
  /**
   * A `Date`, not `::text`: `timestamptz::text` renders `2026-09-20 16:23:57.3+00`,
   * which is neither ISO 8601 nor the spelling any other instant on this wire
   * uses — and a client parsing it is parsing a format nothing else in the
   * product emits. The route serializes it back to ISO 8601, so a client can
   * compare it to a `serverTime` byte for byte.
   */
  recorded_at: Date;
};

/**
 * One ticket's comments, oldest first.
 *
 * `ORDER BY workspace_seq` and not by time: the workspace stream position is a
 * STORED property of the event (`UNIQUE(workspace_id, workspace_seq)`), it is
 * the same canonical order replay delivers, and two events may share an
 * instant — a sort on `recorded_at` alone would need a tie-break invented
 * here, and one row's position would then be a fact about this function rather
 * than about the ledger.
 *
 * The deletion predicate is deliberately NOT carried here: a predicate in this
 * SELECT would answer `[]` — an empty thread — where this read's door owes a
 * 404, and the two are not the same claim. The route carries it, and its
 * docblock names that choice.
 */
export async function listTicketComments(
  db: Queryable,
  ticketId: string,
): Promise<TicketCommentRow[]> {
  const result = await db.query(
    `SELECT comment_id, author_id, body, recorded_at
       FROM proj_ticket_comments
      WHERE ticket_id = $1
      ORDER BY workspace_seq`,
    [ticketId],
  );
  const rows = result.rows as DbRow[];

  // ONE round trip for the whole thread, then the verdict is per comment. The
  // ids are derived from each body in one pass, in DOCUMENT order (first-seen,
  // de-duplicated by `collectImageAttachmentIds` itself), because that is the
  // order a reader sees the files in.
  const withIds = rows.map((row) => ({ row, ids: collectImageAttachmentIds(row.body) }));
  const resolved = new Map(
    (await listAttachmentsByIds(db, ticketId, [...new Set(withIds.flatMap((entry) => entry.ids))])).map(
      (row) => [row.id, row],
    ),
  );

  return withIds.map(({ row, ids }) => ({
    commentId: row.comment_id,
    authorId: row.author_id,
    body: row.body,
    recordedAt: row.recorded_at.toISOString(),
    files: ids.map((attachmentId) => {
      const attachment = resolved.get(attachmentId);
      return attachment === undefined
        ? { attachmentId, filename: attachmentId, mime: null }
        : { attachmentId, filename: attachment.filename, mime: attachment.mime };
    }),
  }));
}
