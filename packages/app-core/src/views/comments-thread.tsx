import type { ReactElement, ReactNode } from 'react';
import type { PurgedPredicate } from '@gisik-nokma/domain';
import { formatDateTime } from '../provenance.js';
import { renderCommentBody } from './comment-body.js';

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
 * **WHY THAT ARM IS NOT OPTIONAL — measured, not argued.** The body renderer
 * drops an `image` node entirely, and it is dropped in BOTH of the two
 * renderers this surface has had. `docToPlainText` (`packages/domain/src/
 * doc-text.ts`) returns `''` for it: `render`'s fallthrough takes
 * `candidate.content`, which an image node does not have, and the node is not a
 * `BLOCK_NODE_TYPES` member, so the ternary returns it unchanged. F3 replaced
 * the thread's renderer with `renderCommentBody` (`./comment-body.tsx`) for
 * every OTHER reason, and that file drops an image node deliberately and says
 * so — the declared decision that a comment's files are CHIPS. A comment whose
 * only trace of its file were the chip row would therefore render as a comment
 * with no file at all if the row were dropped — an absence drawn as a fact. The
 * chips are the ONLY place an embedded image is reachable from this screen.
 *
 * ⚠ **This paragraph used to cite `doc-text.ts:71-75` for the drop, and F3
 * moved the renderer out from under it.** The claim is still true and the code
 * it described is no longer what runs here, which is how a citation goes stale
 * without going wrong. Both are named above.
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
  /** The structured document the editor wrote; rendered by `renderCommentBody`. */
  body: unknown;
  /** The envelope's `serverTime`, ISO 8601. */
  recordedAt: string;
  files: TicketCommentFile[];
};

export type CommentsThreadProps = {
  /**
   * V4 — `null` means THE READ HAS NOT ANSWERED, and it is NOT the same as an
   * empty thread. `useLiveQuery` initialises `data` to `null` and leaves it
   * there while the request is in flight, so a caller that collapsed it to `[]`
   * at the boundary made a still-loading read render as *"Comments · 0"* and
   * *"No comments yet."* — the exact claim this component's own docblock says
   * it exists to prevent, because *"No comments yet."* is a statement about the
   * TICKET and nobody had asked the ticket yet.
   *
   * The collapse is therefore removed AT THE BOUNDARY rather than compensated
   * for here: `null` arrives as `null`, and the three arms below tell it apart
   * from both `[]` and a failure.
   */
  comments: TicketComment[] | null;
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
  /**
   * A `ticketRef` chip's link (Plan 7 Task 3, spec §14.2) — `renderCommentBody`'s
   * own optional parameter, threaded through this component because the
   * renderer has no href resolver of its own. Absent → every `ticketRef` in
   * this thread's comments renders as a plain span.
   */
  ticketHref?: (ref: { ticketId: string; projectId: string }) => string | null;
  /** Trash Plan 3: which chips point at erased items (they draw "Deleted item"). */
  isPurged?: PurgedPredicate;
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
  ticketHref,
  isPurged,
}: {
  comment: TicketComment;
  nameOf: (actorId: string) => string;
  ticketHref?: (ref: { ticketId: string; projectId: string }) => string | null;
  isPurged?: PurgedPredicate;
}): ReactElement {
  const name = nameOf(comment.authorId);
  // F3 — the body is rendered as the DOCUMENT the composer wrote, not as its
  // plain text. `docToPlainText` still serves the search projection and the
  // notifications; it is a display of last resort and never was this one.
  const text = renderCommentBody(
    comment.body,
    ticketHref ?? (() => null),
    isPurged ?? (() => false),
    `comment-${comment.commentId}`,
  );
  return (
    <li className="gn-comment" id={`comment-${comment.commentId}`} data-testid={`comment-${comment.commentId}`}>
      <span className="gn-comment__avatar" aria-hidden="true">
        {initialsOf(name)}
      </span>
      <div className="gn-comment__column">
        <p className="gn-comment__meta">
          <strong className="gn-comment__name">{name}</strong>
          <span className="gn-comment__time">{formatDateTime(comment.recordedAt)}</span>
        </p>
        <div className="gn-comment__body">{text}</div>
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
  ticketHref,
  isPurged,
}: CommentsThreadProps): ReactElement {
  // THREE FACTS, THREE ARMS — and the ORDER of these two lines is the whole
  // fix. A failure outranks a wait: `useLiveQuery` leaves `data` at `null` after
  // a rejection too, so a document that failed must not be read as one that has
  // not answered yet. Once the failure is excluded, `comments === null` can
  // only mean "still in flight".
  // `comments === null` is tested INLINE rather than hoisted into a `pending`
  // boolean, and that is not a style choice: the compiler narrows `comments`
  // through the ternary chain only when the null test is one of its own
  // conditions. A hoisted boolean narrows nothing, and the list arm then needs
  // an `?? []` — which is the collapse this fix removed, reintroduced in the
  // type system's name.
  const failed = commentsUnavailable !== undefined;
  return (
    <section className="gn-comments" data-testid="sheet-comments">
      {/*
        TWO CLASSES ON THE HEADING, and the second one is the sheet's caption —
        the prototype draws `Comments · {count}` and `SUBTASKS · …` in the SAME
        eyebrow style (`desktop.dc.html:1250`, `:1236`), so the shared class is
        the name for that style and `.gn-comments__heading` is this block's own.

        ⚠ **THIS PARAGRAPH SAID THE SHARED CLASS CARRIED NO RULE YET, AND IT DOES
        NOW.** It read: *"`.gn-ticket-sheet__caption` is created by Task 4 … which
        runs on the TAIL lane … so this task's job is to put the name on the
        element so that lane has one fewer edit to make. Measured: the heading is
        styled identically either way today … and the duplicate declarations under
        `.gn-comments__heading` are the tail lane's to remove once the shared rule
        exists. Removing them BEFORE that rule lands would leave the heading with
        no style at all."* **Every clause of that was true when written and the
        last one was a guard rather than a description** — Task 4 landed the
        shared rule, so the tail lane removed the six duplicate declarations in
        the same change (spec decision 11). The element keeps BOTH class names:
        this one is its own hook, and `.gn-ticket-sheet__caption` is the style.
      */}
      <p className="gn-comments__heading gn-ticket-sheet__caption">
        {/* A count appears only when there is one to give. `Comments · 0` over a
            read that failed — or over one that has not answered — is a count
            nobody measured, which is why the heading drops it in BOTH cases
            rather than only the one the failure arm already handled. */}
        {failed || comments === null ? 'Comments' : `Comments · ${comments.length}`}
      </p>

      {failed ? (
        <p className="gn-comments__error" role="alert" data-testid="sheet-comments-unavailable">
          {`This ticket's comments could not be read — ${commentsUnavailable}. That is a failure of this read, not a statement about the ticket: it may answer on a retry.`}
        </p>
      ) : comments === null ? (
        /*
          V4 — the wait arm. The same word the History tab three arms away uses
          for the same state, so the two tabs do not describe one read's progress
          two different ways. Nothing about the ticket is claimed here: an empty
          thread is a fact, and this is not one yet.
        */
        <p className="gn-comments__loading" data-testid="sheet-comments-loading">
          Loading…
        </p>
      ) : comments.length === 0 ? (
        <p className="gn-comments__empty">No comments yet.</p>
      ) : (
        <ul className="gn-comments__list">
          {comments.map((comment) => (
            <CommentItem key={comment.commentId} comment={comment} nameOf={nameOf} ticketHref={ticketHref} isPurged={isPurged} />
          ))}
        </ul>
      )}

      {composer === undefined ? null : (
        /*
          ⚠ THE HINT PARAGRAPH WAS HERE AND IS NOT ANY MORE (2026-09-22), and the
          paragraph that blamed a deviation is CLOSED rather than moved.

          It read *"it renders as a LINE UNDER the composer rather than inside a
          footer row with `Attach` and `Post`, because our composer is
          `packages/editor`'s `TicketEditorSlot`, which draws its own submit
          control and cannot have one injected into its markup"* — true when
          written. `TicketEditorSlot` now draws that footer row, and its LEFT is
          `EditorSlotProps.footerNote`, which is precisely where this sentence
          belongs. The sentence itself is drawn THERE now, handed over by the
          sheet's comment mount (`ticket-sheet.tsx`), and **this component no
          longer knows it exists** — which is the point rather than a side effect:
          the thread renders a composer it is given, and what that composer says
          about posting is the composer's business.

          ⚠ **THE DELETION AND THE MOUNT ARE ONE CHANGE, and that is why the
          paragraph above stood here for a day rather than being tidied away.**
          Removing this `<p>` without the mount passing `footerNote` would have
          LOST the sentence from the product, since nothing else drew it. Case
          `16.127` reads both halves — the note reached the seam AND the section
          shows it exactly once — so a change that did one without the other
          reddens there rather than shipping a sentence drawn twice or not at all.
        */
        <div className="gn-comments__composer">
          {composer}
        </div>
      )}
    </section>
  );
}
