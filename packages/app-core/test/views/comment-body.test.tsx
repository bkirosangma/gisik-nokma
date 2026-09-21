import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderCommentBody, safeHref } from '../../src/views/comment-body.js';

/**
 * F3 — the comment body as the DOCUMENT the composer wrote.
 *
 * ## CASE `17.021` — MINTED IN §17, BECAUSE THE §16 DOOR'S BLOCK WAS SPENT
 *
 * This property belongs to **§16's comment-thread door**, and its id could not be
 * minted there: `test-cases/16-remaining-doors.md` records exec 2's block as
 * fully spent and its own rule is *"When your block is empty, STOP AND ASK. Do
 * not mint from the tip and do not borrow a neighbour's — that is the rule whose
 * breach made §13 go red twice."* So the property shipped with its id recorded
 * as **OWED** — the same discharge pattern `comments-thread.test.tsx` itself
 * used before `16.74` was minted for it — and the controller allocated
 * `17.021`–`17.040` to this lane on 2026-09-21 21:0x, directing the mint into
 * §17. **§16 was not touched to mint it.** The §16 door is named above, so a
 * reader arriving from that file's comments-thread section can find this one.
 *
 * ## What this file is for
 *
 * The composer is the real editor and offers **Bold, Italic, Code, Link, List,
 * Quote**; each is written into the `comment.added` body. The thread rendered
 * that body through `docToPlainText`, which reads `type`/`text`/`attrs` and
 * **never reads `marks`** — so bold, italic, code and the LINK'S DESTINATION
 * were all discarded on the way to the screen. The link case is not a lesser
 * rendering, it is a loss: the destination was unrecoverable from anywhere on
 * the surface. Lists lost their markers; a blockquote lost its quotation.
 *
 * The cases below are that table, one arm per row, plus the three properties a
 * naive implementation gets wrong: an href is UNTRUSTED, a malformed document
 * must not throw, and an image must stay the chip row's business.
 */

/** A one-paragraph document, with `content` as its inline children. */
function doc(...content: unknown[]): unknown {
  return { type: 'doc', content: [{ type: 'paragraph', content }] };
}

function text(value: string, marks?: unknown): unknown {
  return marks === undefined ? { type: 'text', text: value } : { type: 'text', text: value, marks };
}

describe('renderCommentBody — the composer’s marks, rendered', () => {
  it('renders bold, italic, code and strike as ELEMENTS, not as lost formatting', () => {
    const { container } = render(
      <>
        {renderCommentBody(
          doc(
            text('bold', [{ type: 'bold' }]),
            text(' '),
            text('italic', [{ type: 'italic' }]),
            text(' '),
            text('code', [{ type: 'code' }]),
            text(' '),
            text('struck', [{ type: 'strike' }]),
          ),
        )}
      </>,
    );
    expect(container.querySelector('strong')?.textContent).toBe('bold');
    expect(container.querySelector('em')?.textContent).toBe('italic');
    expect(container.querySelector('code')?.textContent).toBe('code');
    expect(container.querySelector('s')?.textContent).toBe('struck');
  });

  /**
   * THE ROW THAT COST THE MOST. A link's href is not decoration: without it the
   * destination does not exist anywhere on screen, and the person who typed
   * `[the doc](https://…)` cannot recover it.
   */
  it('renders a link as an ANCHOR carrying its href — the destination is recoverable', () => {
    const { container } = render(
      <>{renderCommentBody(doc(text('the doc', [{ type: 'link', attrs: { href: 'https://gst.gov.in' } }])))}</>,
    );
    const anchor = container.querySelector('a');
    expect(anchor).not.toBeNull();
    expect(anchor?.getAttribute('href')).toBe('https://gst.gov.in');
    expect(anchor?.textContent).toBe('the doc');
    // The label is the label, never the URL printed in its place.
    expect(anchor?.textContent).not.toContain('https://');
    // Opening a stranger's link in this tab would navigate away from the sheet.
    expect(anchor?.getAttribute('rel')).toContain('noopener');
  });

  it('renders lists as REAL lists, so the markers the plain renderer dropped come back', () => {
    const list = (type: 'bulletList' | 'orderedList', items: string[]): unknown => ({
      type: 'doc',
      content: [
        {
          type,
          content: items.map((item) => ({
            type: 'listItem',
            content: [{ type: 'paragraph', content: [{ type: 'text', text: item }] }],
          })),
        },
      ],
    });
    const bullets = render(<>{renderCommentBody(list('bulletList', ['one', 'two']))}</>);
    expect(bullets.container.querySelector('ul')).not.toBeNull();
    expect(within(bullets.container).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'one',
      'two',
    ]);

    const numbered = render(<>{renderCommentBody(list('orderedList', ['first', 'second']))}</>);
    // `<ol>` is what makes the browser NUMBER them — a `<ul>` here would satisfy
    // "it is a list" and lose the ordering the author chose.
    expect(numbered.container.querySelector('ol')).not.toBeNull();
  });

  it('renders a blockquote as a quotation, and a code block as preformatted text', () => {
    const quote = render(
      <>{renderCommentBody({ type: 'doc', content: [{ type: 'blockquote', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'quoted' }] }] }] })}</>,
    );
    expect(quote.container.querySelector('blockquote')?.textContent).toBe('quoted');

    const pre = render(
      <>{renderCommentBody({ type: 'doc', content: [{ type: 'codeBlock', content: [{ type: 'text', text: 'npm run gst' }] }] })}</>,
    );
    expect(pre.container.querySelector('pre code')?.textContent).toBe('npm run gst');
  });

  /**
   * The mention is the ONE thing the plain renderer already kept, and the two
   * projections must not disagree about it — a mention that read `@Anselma` in
   * the thread and `@user_anselma` in search would be two names for one person.
   */
  it('renders a mention as @label, the same spelling the plain projection produces', () => {
    const { container } = render(
      <>{renderCommentBody(doc({ type: 'mention', attrs: { userId: 'user_anselma', label: 'Anselma Marak' } }))}</>,
    );
    expect(container.querySelector('.gn-comment__mention')?.textContent).toBe('@Anselma Marak');
  });

  /**
   * The declared decision, UNCHANGED — a comment's files are chips. This
   * renderer must not become a second place an embedded image is drawn, or the
   * chip row would stop being the only trace of the file.
   */
  it('draws an image node as NOTHING — the chip row stays the only trace of a file', () => {
    const { container } = render(
      <>{renderCommentBody(doc(text('Evidence attached. '), { type: 'image', attrs: { attachmentId: 'x' } }))}</>,
    );
    expect(container.querySelector('img')).toBeNull();
    expect(container.textContent).toBe('Evidence attached. ');
  });

  it('preserves a hard break, and renders an unknown node’s CHILDREN rather than nothing', () => {
    const br = render(<>{renderCommentBody(doc(text('a'), { type: 'hardBreak' }, text('b')))}</>);
    expect(br.container.querySelector('br')).not.toBeNull();

    const unknown = render(
      <>{renderCommentBody({ type: 'doc', content: [{ type: 'someFutureBlock', content: [{ type: 'text', text: 'still here' }] }] })}</>,
    );
    expect(unknown.container.textContent).toContain('still here');
  });
});

/**
 * THE HREF IS ANOTHER PERSON'S DATA. React does not sanitise an `href`, and the
 * markdown-link input rule only validates what THIS client types — the server
 * stores whatever an event carries, and one member can write a comment another
 * member reads.
 */
describe('renderCommentBody — an href is untrusted input', () => {
  it('REFUSES a javascript: href and leaves the label as text', () => {
    const { container } = render(
      <>{renderCommentBody(doc(text('click me', [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }])))}</>,
    );
    expect(container.querySelector('a')).toBeNull();
    // The label survives; only the destination is refused. And the raw URL is
    // NOT printed as text — putting `javascript:…` on screen would dress it as
    // a destination somebody could use.
    expect(container.textContent).toBe('click me');
    expect(container.textContent).not.toContain('javascript');
  });

  it('REFUSES a scheme split by a control character — browsers strip them, so the check must too', () => {
    // `java\tscript:` executes. A `startsWith('javascript:')` check reads this
    // as harmless, which is exactly why the sanitizer collapses first.
    for (const href of ['java\tscript:alert(1)', 'javascript\n:alert(1)', ' javascript:alert(1)']) {
      expect(safeHref(href), href).toBeNull();
    }
    expect(safeHref('data:text/html,<script>alert(1)</script>')).toBeNull();
    expect(safeHref('vbscript:msgbox(1)')).toBeNull();
  });

  it('REFUSES a protocol-relative href — `//host` is another origin wearing a path’s clothes', () => {
    expect(safeHref('//evil.example/steal')).toBeNull();
    // …while a genuinely root-relative path is allowed.
    expect(safeHref('/w/ws-1/p/prj-1')).toBe('/w/ws-1/p/prj-1');
  });

  it('ALLOWS http, https and mailto, case-insensitively, and a fragment', () => {
    expect(safeHref('http://gst.gov.in')).toBe('http://gst.gov.in');
    expect(safeHref('HTTPS://GST.GOV.IN')).toBe('HTTPS://GST.GOV.IN');
    expect(safeHref('mailto:kiro@example.com')).toBe('mailto:kiro@example.com');
    expect(safeHref('#the-section')).toBe('#the-section');
  });

  it('refuses a non-string href rather than stringifying whatever arrived', () => {
    expect(safeHref(undefined)).toBeNull();
    expect(safeHref(null)).toBeNull();
    expect(safeHref(42)).toBeNull();
    expect(safeHref({ toString: () => 'https://evil.example' })).toBeNull();
  });
});

/**
 * TOTALITY. A comment body is stored JSON written by whoever wrote the comment,
 * and one malformed document must not take down the thread it sits in.
 */
describe('renderCommentBody — total, never a throw', () => {
  it('renders nothing for unrenderable input, and does not throw', () => {
    for (const input of [null, undefined, 42, 'a string', [], {}, { type: 7 }, { content: 'not an array' }]) {
      expect(() => renderCommentBody(input), JSON.stringify(input) ?? 'undefined').not.toThrow();
    }
    const { container } = render(<>{renderCommentBody(null)}</>);
    expect(container.textContent).toBe('');
  });

  it('survives a document whose nesting exceeds the depth cap — partial text, never a stack overflow', () => {
    // Built as a JS object graph rather than JSON, which is the shape the cap
    // exists for: `JSON.parse` cannot construct a cycle but this function takes
    // `unknown`.
    let node: unknown = { type: 'text', text: 'deep' };
    for (let i = 0; i < 500; i += 1) node = { type: 'paragraph', content: [node] };
    expect(() => renderCommentBody({ type: 'doc', content: [node] })).not.toThrow();
  });
});
