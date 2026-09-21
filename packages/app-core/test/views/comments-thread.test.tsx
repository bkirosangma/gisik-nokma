import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  CommentsThread,
  type TicketComment,
} from '../../src/views/comments-thread.js';

/**
 * The comment thread renderer.
 *
 * ## Case 16.74 — MINTED 2026-09-21, after the block was reallocated
 *
 * The controller ruled on 2026-09-20 (mid-task) that executor 2 had no free
 * ids — its own block `16.41`–`16.60` was fully minted and the tail belonged
 * to executor 1 by the block table in `test-cases/16-remaining-doors.md` — so
 * this file shipped with a header saying the id was OWED rather than omitted.
 * **That is now discharged:** the block was reallocated on 2026-09-21
 * (`16.72`–`16.80`) and the owed id is minted as **`16.74`** in that file.
 *
 * ⚠ **The id names the FILE, and the cases below are its ARMS.** §16's blocks
 * mint one id per decisive property and name the arms inside the entry, so the
 * `it` blocks below do not each carry their own number.
 *
 * ## What this file is for
 *
 * Two drawn absences, and the arm that exists to refuse one of them:
 *
 *  1. **A failed read must not render as an empty thread.** `[]` draws *"No
 *     comments yet."* — a sentence about the TICKET — so `commentsUnavailable`
 *     draws a different thing, and the HEADING drops its count, because
 *     `Comments · 0` over a read that failed is a count nobody measured.
 *  2. **A comment's files are never dropped.** The body renders through
 *     `docToPlainText`, which draws an `image` node as NOTHING, so the chip row
 *     is the only trace of a comment's file. The last case here is the one that
 *     matters most: an id the server could not resolve is rendered AS ITSELF
 *     rather than filtered out, and the chip is NOT a link, because a link to
 *     bytes nobody holds is a control that does nothing.
 */

const WITH_FILE: TicketComment = {
  commentId: '01COMMENTWITHFILE',
  authorId: 'user_anselma',
  body: {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          { type: 'text', text: 'Evidence attached. ' },
          { type: 'image', attrs: { attachmentId: '01PROOF' } },
        ],
      },
    ],
  },
  recordedAt: '2026-09-20T16:23:57.306Z',
  files: [{ attachmentId: '01PROOF', filename: 'gst-receipt.png', mime: 'image/png' }],
};

const PLAIN: TicketComment = {
  commentId: '01COMMENTPLAIN',
  authorId: 'user_kiro',
  body: {
    type: 'doc',
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: 'The shared bucket is the defect.' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'Confirmed.' }] },
    ],
  },
  recordedAt: '2026-09-20T16:24:57.306Z',
  files: [],
};

/** An id the read could not resolve — the server renders the id as the name. */
const UNRESOLVED: TicketComment = {
  commentId: '01COMMENTGHOST',
  authorId: 'user_kiro',
  body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Gone.' }] }] },
  recordedAt: '2026-09-20T16:25:57.306Z',
  files: [{ attachmentId: '01NOATTACHMENTROW', filename: '01NOATTACHMENTROW', mime: null }],
};

const nameOf = (actorId: string): string =>
  actorId === 'user_anselma' ? 'Anselma Marak' : 'Kiro';

describe('CommentsThread', () => {
  it('draws the heading with its count, the author, and the body as text', () => {
    render(<CommentsThread comments={[PLAIN, WITH_FILE]} nameOf={nameOf} />);

    expect(screen.getByText('Comments · 2')).toBeInTheDocument();
    // The name is the one the roster resolved, and the avatar carries its
    // INITIALS — the prototype's `{{ c.who }}` mark. ⚠ BOTH SHAPES ARE HERE ON
    // PURPOSE: a one-word name yields ONE initial (`Kiro` → `K`) and a two-word
    // one yields two (`Anselma Marak` → `AM`), so a renderer that blindly took
    // the first two characters would satisfy only the second. Read through the
    // avatar's own class, because a bare `K` matches half the screen.
    expect(screen.getByText('Kiro')).toBeInTheDocument();
    expect(screen.getAllByText('K', { selector: '.gn-comment__avatar' })).toHaveLength(1);
    expect(screen.getByText('AM', { selector: '.gn-comment__avatar' })).toBeInTheDocument();
    // Both paragraphs render as ELEMENTS, so the body is the document and not a
    // stringified one. (This comment named `docToPlainText` until F3 replaced
    // the thread's renderer with `renderCommentBody`; the assertion it explains
    // did not change, and the sentence describing it did.)
    expect(screen.getByText(/The shared bucket is the defect\./)).toBeInTheDocument();
    expect(screen.getByText(/Confirmed\./)).toBeInTheDocument();
    // The instant goes through the product's ONE renderer, which names the
    // clock — never `toLocaleString`, which would shift with the reader's
    // laptop (spec §2's clock constraint). Scoped to ONE comment because both
    // fixture comments are on screen and both carry a time.
    expect(
      within(screen.getByTestId(`comment-${PLAIN.commentId}`)).getByText(/20 Sep 2026, .* IST/),
    ).toBeInTheDocument();
  });

  it('says "No comments yet." for an ANSWERED empty thread', () => {
    render(<CommentsThread comments={[]} nameOf={nameOf} />);
    expect(screen.getByText('Comments · 0')).toBeInTheDocument();
    expect(screen.getByText('No comments yet.')).toBeInTheDocument();
  });

  it('draws a FAILED read as a sentence and drops the count, never as an empty thread', () => {
    render(
      <CommentsThread comments={[]} commentsUnavailable="the server said 404" nameOf={nameOf} />,
    );

    // The empty sentence is the drawn absence this case exists to refuse: an
    // empty list and a failed read must not render alike.
    expect(screen.queryByText('No comments yet.')).toBeNull();
    const failure = screen.getByTestId('sheet-comments-unavailable');
    expect(failure).toHaveAttribute('role', 'alert');
    // The reason travels VERBATIM inside the sentence — a paraphrase would be a
    // second story about why the read failed.
    expect(failure).toHaveTextContent('the server said 404');
    // `Comments · 0` over a failed read is a count nobody measured, so the
    // heading loses it. Asserted as an absence of the string, so a heading that
    // grew a count back would redden here.
    expect(screen.queryByText('Comments · 0')).toBeNull();
    expect(screen.getByText('Comments')).toBeInTheDocument();
  });

  it('renders a comment’s files as chips, and an unresolvable id as itself', () => {
    render(<CommentsThread comments={[WITH_FILE, UNRESOLVED]} nameOf={nameOf} />);

    const withFile = screen.getByTestId(`comment-${WITH_FILE.commentId}`);
    // The resolved file: its name, and the prototype's extension badge.
    expect(within(withFile).getByText('gst-receipt.png')).toBeInTheDocument();
    expect(within(withFile).getByText('PNG')).toBeInTheDocument();
    // ⚠ AND THE BODY DOES NOT CONTAIN IT: `docToPlainText` draws an `image`
    // node as nothing, so the chip is the ONLY trace of this comment's file.
    // A body assertion alone would pass on a comment whose file was dropped.
    expect(withFile).not.toHaveTextContent('01PROOF');

    const ghost = screen.getByTestId(`comment-${UNRESOLVED.commentId}`);
    // Rendered AS ITSELF rather than filtered out: dropping it would draw the
    // comment as carrying one file fewer than its own document says.
    expect(within(ghost).getByText('01NOATTACHMENTROW')).toBeInTheDocument();
  });

  it('links a RESOLVED file and does not link an unresolvable one', () => {
    render(<CommentsThread comments={[WITH_FILE, UNRESOLVED]} nameOf={nameOf} />);

    // The resolved chip is a link to the bytes, which is how a file is reached
    // from here at all — the body cannot show it.
    expect(screen.getByRole('link', { name: 'gst-receipt.png' })).toHaveAttribute(
      'href',
      '/v1/attachments/01PROOF',
    );
    // The unresolvable one is text, not a link: the bytes it names do not
    // exist, and a control that does nothing is worse than a name.
    expect(screen.queryByRole('link', { name: '01NOATTACHMENTROW' })).toBeNull();
  });

  it('draws the composer only when one is supplied, and always with the prototype’s sentence', () => {
    const { rerender } = render(<CommentsThread comments={[PLAIN]} nameOf={nameOf} />);
    // No composer, no sentence: "Posting records an event citing you." is a
    // claim about a control that is not on the screen.
    expect(screen.queryByText('Posting records an event citing you.')).toBeNull();

    rerender(
      <CommentsThread
        comments={[PLAIN]}
        nameOf={nameOf}
        composer={<button type="button">Post</button>}
      />,
    );
    expect(screen.getByRole('button', { name: 'Post' })).toBeInTheDocument();
    expect(screen.getByText('Posting records an event citing you.')).toBeInTheDocument();
  });

  /**
   * F3 — THE THREAD RENDERS THE COMPOSER'S MARKS, through the new projection.
   *
   * The cases in `comment-body.test.tsx` prove the projection; this proves the
   * thread USES it, which is the part a person meets and the part that was
   * wrong. Before F3 this body rendered through `docToPlainText`, so the
   * anchor did not exist and the destination was unrecoverable from anywhere on
   * the surface — the finding's worst row.
   *
   * ⚠ THE §16 CASE ID FOR THIS ARM IS OWED: exec 2's block is fully spent and
   * `test-cases/16-remaining-doors.md` forbids minting from the tip. See the
   * header of `comment-body.test.tsx` for the full record.
   */
  it('renders a comment’s link as an anchor — the destination survives the round trip', () => {
    const linked: TicketComment = {
      commentId: '01COMMENTLINKED',
      authorId: 'user_kiro',
      body: {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'See ' },
              {
                type: 'text',
                text: 'the doc',
                marks: [{ type: 'link', attrs: { href: 'https://gst.gov.in' } }],
              },
              { type: 'text', text: ' for the rates.' },
            ],
          },
        ],
      },
      recordedAt: '2026-09-20T16:26:57.306Z',
      files: [],
    };
    render(<CommentsThread comments={[linked]} nameOf={nameOf} />);

    const body = screen.getByTestId(`comment-${linked.commentId}`);
    const anchor = within(body).getByRole('link', { name: 'the doc' });
    expect(anchor).toHaveAttribute('href', 'https://gst.gov.in');
    // The sentence around it is intact, so the link was lifted out of the text
    // rather than the text being rebuilt around it.
    expect(body.textContent).toContain('See the doc for the rates.');
  });
});
