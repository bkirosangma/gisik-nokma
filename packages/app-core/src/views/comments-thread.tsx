import type { ReactElement, ReactNode } from 'react';
import { docToPlainText } from '@gisik-nokma/domain';
import { formatDateTime } from '../provenance.js';

/**
 * The comment thread — the prototype's `Comments · {count}` block
 * (`design-system/interactive/desktop.dc.html:1268-1330`), rendered over the
 * read that did not exist until this change.
 *
 * ## A comment's files are the attachments ITS OWN DOCUMENT names
 *
 * `TicketComment.files` is served by `GET …/tickets/:id/comments`, and its
 * source is the comment's own body, never the ticket's `attachment.added`
 * events — the ledger carries no link between an attachment and a comment, and
 * `apps/server/src/read/ticket-comments.ts` carries the measurement. So a chip
 * here means *this comment's document names this attachment*, which is the only
 * attribution the product can make.
 *
 * **WHY THAT ARM IS NOT OPTIONAL — measured, not argued.** This component
 * renders the body through `docToPlainText`, and that renderer drops an
 * `image` node entirely: `render`'s fallthrough takes `candidate.content`,
 * which an image node does not have, so it returns `''`
 * (`packages/domain/src/doc-text.ts:71-75` — `children` is `''` and the node is
 * not a `BLOCK_NODE_TYPES` member, so the ternary returns it unchanged). A
 * comment whose only trace of its file were the chip row would therefore render
 * as a comment with no file at all if the row were dropped — an absence drawn as
 * a fact. The chips are the ONLY place an embedded image is reachable from this
 * screen.
 *
 * ⚠ **This citation read `doc-text.ts:44-50`, and it RESOLVED — at the end of
 * `BLOCK_NODE_TYPES`, which is not the code it describes.** The range was
 * corrected by reading the lines; a citation that resolves is not a citation
 * that is right, which is the failure this repo has recorded most often.
 *
 * ## The two absences, kept apart
 *
 * `comments === []` and `commentsUnavailable !== undefined` are different
 * states and are drawn differently — the same three-way split the sheet already
 * draws for attachments (`attachment-list.tsx`'s own silence, and the sheet's
 * failure sentence). A read that failed must never render under the word
 * "No comments yet.", which is a claim about the ticket.
 *
 * For the same reason the HEADING drops its count when the read failed: the
 * prototype draws `Comments · {count}`, and `Comments · 0` over a failed read is
 * a count nobody measured.
 */

/** One file a comment's own document names. */
export type TicketCommentFile = {
  attachmentId: string;
  /** The stored name — or the ID itself when nothing resolved (see below). */
  filename: string;
  /**
   * `null` ONLY when no attachment row resolved for this id.
   *
   * The `image-embed-gate` makes that unreachable for anything ingested since
   * it shipped; the server renders the id in place of a name rather than
   * dropping the entry, so a comment never shows fewer files than its own
   * document claims. This component draws an unresolved entry as text and NOT
   * as a link: a link to bytes nobody holds is a control that does nothing.
   */
  mime: string | null;
};

export type TicketComment = {
  /** The `comment.added` event's id — a comment's only identity. */
  commentId: string;
  authorId: string;
  /** The structured document the editor wrote; rendered by `docToPlainText`. */
  body: unknown;
  /** The envelope's `serverTime`, ISO 8601. */
  recordedAt: string;
  files: TicketCommentFile[];
};

export type CommentsThreadProps = {
  comments: TicketComment[];
  /** The read's failure reason. Absent means the read answered. */
  commentsUnavailable?: string;
  /** The sheet's one actor-name join, the same `nameOf` every other row uses. */
  nameOf: (actorId: string) => string;
  /**
   * The composer, supplied by the sheet — it owns the ledger write, exactly as
   * it does for the description. Absent renders no composer and no sentence:
   * there is nothing to say "Posting records an event" about.
   */
  composer?: ReactNode;
};

/**
 * The prototype's avatar mark (`desktop.dc.html:1274`: a 28×28 round span
 * carrying `{{ c.who }}`). Initials from the display name the roster resolved,
 * so a person with no roster row gets initials of their ID rather than a blank
 * circle — the same totality `actorLabel` guarantees one level up.
 */
function initialsOf(label: string): string {
  const words = label.trim().split(/\s+/).filter((word) => word.length > 0);
  const first = words[0]?.[0] ?? '?';
  const second = words.length > 1 ? (words[1]?.[0] ?? '') : '';
  return `${first}${second}`.toUpperCase();
}

/** The prototype's extension badge: the name's last dot-segment, uppercased. */
function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf('.');
  if (dot <= 0 || dot === filename.length - 1) return '';
  return filename.slice(dot + 1).toUpperCase();
}

function CommentItem({
  comment,
  nameOf,
}: {
  comment: TicketComment;
  nameOf: (actorId: string) => string;
}): ReactElement {
  const name = nameOf(comment.authorId);
  const text = docToPlainText(comment.body);
  return (
    <li className="gn-comment" data-testid={`comment-${comment.commentId}`}>
      <span className="gn-comment__avatar" aria-hidden="true">
        {initialsOf(name)}
      </span>
      <div className="gn-comment__column">
        <p className="gn-comment__meta">
          <strong className="gn-comment__name">{name}</strong>
          <span className="gn-comment__time">{formatDateTime(comment.recordedAt)}</span>
        </p>
        <p className="gn-comment__body">{text}</p>
        {comment.files.length > 0 ? (
          <div className="gn-comment__files">
            {comment.files.map((file) => (
              <span className="gn-comment__file" key={file.attachmentId}>
                {extensionOf(file.filename) === '' ? null : (
                  <span className="gn-comment__file-ext">{extensionOf(file.filename)}</span>
                )}
                {file.mime === null ? (
                  <span className="gn-comment__file-name">{file.filename}</span>
                ) : (
                  <a className="gn-comment__file-name" href={`/v1/attachments/${file.attachmentId}`}>
                    {file.filename}
                  </a>
                )}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </li>
  );
}

export function CommentsThread({
  comments,
  commentsUnavailable,
  nameOf,
  composer,
}: CommentsThreadProps): ReactElement {
  const answered = commentsUnavailable === undefined;
  return (
    <section className="gn-comments" data-testid="sheet-comments">
      <p className="gn-comments__heading">
        {answered ? `Comments · ${comments.length}` : 'Comments'}
      </p>

      {answered ? (
        <>
          {comments.length === 0 ? (
            <p className="gn-comments__empty">No comments yet.</p>
          ) : (
            <ul className="gn-comments__list">
              {comments.map((comment) => (
                <CommentItem key={comment.commentId} comment={comment} nameOf={nameOf} />
              ))}
            </ul>
          )}
        </>
      ) : (
        <p className="gn-comments__error" role="alert" data-testid="sheet-comments-unavailable">
          {`This ticket's comments could not be read — ${commentsUnavailable}. That is a failure of this read, not a statement about the ticket: it may answer on a retry.`}
        </p>
      )}

      {composer === undefined ? null : (
        <div className="gn-comments__composer">
          {composer}
          {/*
            The prototype's footer sentence (`desktop.dc.html:1329`), in its
            ONLINE arm: the element renders `{{ cmtHint }}`, defined at `:3717` as
            `s.online ? "Posting records an event citing you." : "Offline — the
            comment queues until this device reconnects."` ⚠ **An earlier version
            of this comment said "verbatim", which was wrong — one arm of a
            conditional is transcribed, not the sentence.** The offline arm is
            deliberately NOT transcribed: an online-only client reaching it would
            be promising a queue it does not have, which is the same reason
            `PlainTextEditorSlot` says a build without an editor cannot write
            rather than offering a control that discards what is typed.

            ⚠ And it renders as a LINE UNDER the composer rather than inside a
            footer row with `Attach` and `Post`, because our composer is
            `packages/editor`'s `TicketEditorSlot`, which draws its own submit
            control and cannot have one injected into its markup. A deviation
            from the drawing, flagged rather than hidden.
          */}
          <p className="gn-comments__hint">Posting records an event citing you.</p>
        </div>
      )}
    </section>
  );
}
