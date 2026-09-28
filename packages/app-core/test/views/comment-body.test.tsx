import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PURGED_ITEM_LABEL } from '@gisik-nokma/domain';
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

  /**
   * 9.267 — SCHEMA V2'S NODES ON THE READ-ONLY SURFACE (spec §8.3 consequence 1,
   * Plan 4 Task 2). The notes editor widened the document; a comment thread is
   * where a widened document from ANOTHER client arrives first, because the
   * server stores whatever an event carries.
   *
   * ONE document for all three families, deliberately. Each could pass in
   * isolation while an implementation that short-circuited on the first node it
   * did not recognise failed the next — which is the failure mode this file's
   * neighbouring unknown-node case pins from the other direction.
   *
   * The checkbox is DISABLED and reads the stored `checked`: a comment is
   * read-only, so this renders the STATE of the task, not a control the reader
   * owns. The wiki-link's chrome is the second thing here with teeth — the
   * stored title must be the visible words and the note id only the
   * destination, the same preference `docToPlainText` takes.
   */
  it('9.267 renders v2 nodes with their chrome: task checkboxes, a collapsible, a wiki-link', () => {
    const { container } = render(
      <>
        {renderCommentBody({
          type: 'doc',
          content: [
            {
              type: 'taskList',
              content: [
                {
                  type: 'taskItem',
                  attrs: { checked: false },
                  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'buy milk' }] }],
                },
                {
                  type: 'taskItem',
                  attrs: { checked: true },
                  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'call CA' }] }],
                },
              ],
            },
            {
              type: 'details',
              attrs: { open: false },
              content: [
                { type: 'detailsSummary', content: [{ type: 'text', text: 'Why' }] },
                {
                  type: 'detailsContent',
                  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'because' }] }],
                },
              ],
            },
            {
              type: 'paragraph',
              content: [
                { type: 'text', text: 'see ' },
                { type: 'wikiLink', attrs: { noteId: 'n1', title: 'Cold room' } },
              ],
            },
            // THE CONTROL, inside the same document: a node the renderer has
            // never heard of still contributes its text. Without it, a
            // `renderNode` that returned `null` for every unrecognised type —
            // including the v2 ones it does not yet know — would satisfy every
            // assertion above while silently eating prose.
            {
              type: 'someFutureBlock',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'still here' }] }],
            },
          ],
        })}
      </>,
    );

    const boxes = within(container).getAllByRole('checkbox') as HTMLInputElement[];
    expect(boxes).toHaveLength(2);
    expect(boxes[0]?.checked).toBe(false);
    expect(boxes[1]?.checked).toBe(true);
    for (const box of boxes) expect(box).toBeDisabled();
    expect(container.textContent).toContain('buy milk');
    expect(container.textContent).toContain('call CA');

    const details = container.querySelector('details');
    expect(details).not.toBeNull();
    expect(details?.hasAttribute('open')).toBe(false);
    expect(container.querySelector('summary')?.textContent).toBe('Why');
    expect(container.textContent).toContain('because');

    const link = within(container).getByRole('link', { name: 'Cold room' });
    expect(link.getAttribute('href')).toBe('/notes/n1');

    expect(container.textContent).toContain('still here');
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

/**
 * 9.312 — Plan 7 Task 3 (spec §14.2, D26): `renderCommentBody`'s optional
 * second parameter. The renderer has no href resolver of its own, unlike the
 * wiki-link branch which always knows `/notes/<id>` — so a `ticketRef` links
 * only when the caller supplies one, and renders as a plain span otherwise.
 */
describe('9.312 ticketRef in a comment', () => {
  const TICKET_REF = { type: 'ticketRef', attrs: { ticketId: 't2', projectId: 'p1', key: 'SHOP-8', title: 'Compressor log' } };

  it('9.312 links when ticketHref resolves and renders a span otherwise; wikiLink is unaffected (control)', () => {
    const body = doc(text('see '), TICKET_REF);

    const { container: linked } = render(<>{renderCommentBody(body, () => '/w/x/p/p1?ticket=t2')}</>);
    const link = within(linked).getByRole('link', { name: 'SHOP-8 Compressor log' });
    expect(link.getAttribute('href')).toBe('/w/x/p/p1?ticket=t2');
    expect(link.className).toBe('gn-comment__ticketref');

    // No `ticketHref` supplied at all: the default answers null, same as an
    // explicit one that refuses.
    const { container: plain } = render(<>{renderCommentBody(body)}</>);
    expect(within(plain).queryByRole('link', { name: 'SHOP-8 Compressor log' })).toBeNull();
    expect(plain.textContent).toContain('SHOP-8 Compressor log');

    // CONTROL: a wikiLink in the SAME document is unaffected by the new
    // parameter — it still resolves its own `/notes/<id>` regardless.
    const noteBody = doc({ type: 'wikiLink', attrs: { noteId: 'n1', title: 'Cold room' } });
    const { container: note } = render(<>{renderCommentBody(noteBody, () => '/w/x/p/p1?ticket=t2')}</>);
    const noteLink = within(note).getByRole('link', { name: 'Cold room' });
    expect(noteLink.getAttribute('href')).toBe('/notes/n1');
  });
});

/**
 * 9.348 — a TABLE in a comment currently produces no `<table>` at all: `table`/
 * `tableRow`/`tableHeader`/`tableCell` all fall through to the "unknown type
 * renders its children" branch, so a pasted or typed table in a comment loses
 * its shape entirely (measured against the plan this test came from — a
 * comment's schema is the same v2 schema the note document uses, and the
 * owner's screenshot named this surface explicitly: "confirm it gets the
 * skin"). `.gn-comment__table` is styled alongside `.ticket-editor__content
 * table` in the same globals.css section.
 */
describe('9.348 table in a comment', () => {
  it('9.348 renders a table node as real table/tr/th/td elements, not flattened children', () => {
    const body = {
      type: 'doc',
      content: [
        {
          type: 'table',
          content: [
            {
              type: 'tableRow',
              content: [
                { type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Name' }] }] },
              ],
            },
            {
              type: 'tableRow',
              content: [
                { type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Ada' }] }] },
              ],
            },
          ],
        },
      ],
    };
    const { container } = render(<>{renderCommentBody(body)}</>);
    expect(container.querySelector('table.gn-comment__table')).not.toBeNull();
    expect(container.querySelectorAll('tr')).toHaveLength(2);
    expect(container.querySelector('th')?.textContent).toBe('Name');
    expect(container.querySelector('td')?.textContent).toBe('Ada');
  });

  /**
   * Review finding: a wide comment table (long unbreakable cell values) had
   * no scroll container at all — `.gn-comment__table` alone would widen the
   * comment thread and the ticket sheet around it, the exact "must scroll
   * inside the document, never widen the page" failure the plan's Review
   * Focus names, on a SECOND rendering surface the plan's own gallery
   * (which only ever exercises the live editor) never touched.
   */
  it('9.356 wraps the table in a scrolling container, so a wide table cannot widen the thread', () => {
    const body = {
      type: 'doc',
      content: [
        {
          type: 'table',
          content: [
            { type: 'tableRow', content: [{ type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'a' }] }] }] },
          ],
        },
      ],
    };
    const { container } = render(<>{renderCommentBody(body)}</>);
    const wrap = container.querySelector('.gn-comment__table-wrap');
    expect(wrap, 'no .gn-comment__table-wrap around the table').not.toBeNull();
    expect(wrap!.querySelector('table.gn-comment__table')).not.toBeNull();
  });

  /**
   * kb-editor-parity: the toolbar now offers H1-H6 and a horizontal rule, so a
   * comment that carries either must show it. Before this, `heading` was the
   * same arm as `paragraph` (level dropped) and `horizontalRule` fell to the
   * "unknown type renders its children" arm — an `<hr>` has no children, so it
   * rendered as NOTHING.
   */
  it('9.371 renders a heading as a paragraph that keeps its level, without entering the heading outline', () => {
    const body = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Plan' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'body' }] },
      ],
    };
    const { container } = render(<>{renderCommentBody(body)}</>);
    const heading = container.querySelector('.gn-comment__heading');
    expect(heading?.tagName).toBe('P');
    expect(heading?.className).toContain('gn-comment__heading--2');
    expect(heading?.textContent).toBe('Plan');
    expect(container.querySelector('h1, h2, h3, h4, h5, h6')).toBeNull();
    // CONTROL: the plain paragraph beside it carries no heading class.
    expect(container.querySelectorAll('.gn-comment__heading')).toHaveLength(1);
  });

  it('9.372 a heading with a malformed level still renders its text, with no modifier class', () => {
    for (const level of [0, 7, 'x', null, undefined]) {
      const body = { type: 'doc', content: [{ type: 'heading', attrs: { level }, content: [{ type: 'text', text: 'T' }] }] };
      const { container, unmount } = render(<>{renderCommentBody(body)}</>);
      const heading = container.querySelector('.gn-comment__heading');
      expect(heading?.textContent, `level ${String(level)}`).toBe('T');
      expect(heading?.className, `level ${String(level)}`).toBe('gn-comment__heading');
      unmount();
    }
  });

  it('9.373 renders a horizontal rule as an <hr>, not as nothing', () => {
    const body = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'above' }] },
        { type: 'horizontalRule' },
        { type: 'paragraph', content: [{ type: 'text', text: 'below' }] },
      ],
    };
    const { container } = render(<>{renderCommentBody(body)}</>);
    expect(container.querySelector('hr.gn-comment__rule')).not.toBeNull();
    expect(container.querySelectorAll('p')).toHaveLength(2);
  });
});

describe('19.188 a chip to an erased item', () => {
  it('19.188 renders PURGED_ITEM_LABEL with no link for a purged ticketRef and wikiLink; a live chip keeps its text and link', () => {
    const body = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'ticketRef', attrs: { ticketId: 'gone_ticket', projectId: 'p1', key: 'SHOP-7', title: 'Invoice' } },
            { type: 'text', text: ' / ' },
            { type: 'wikiLink', attrs: { noteId: 'gone_note', title: 'Cold room' } },
            { type: 'text', text: ' / ' },
            { type: 'ticketRef', attrs: { ticketId: 'live_ticket', projectId: 'p1', key: 'SHOP-9', title: 'Fix the freezer' } },
          ],
        },
      ],
    };
    const isPurged = (_kind: 'ticket' | 'note', id: string) => id === 'gone_ticket' || id === 'gone_note';
    const { container } = render(<>{renderCommentBody(body, () => '/w/x/p/p1?ticket=t', isPurged)}</>);
    const purged = [...container.querySelectorAll('.gn-comment__ref--purged')];
    expect(purged.map((el) => [el.tagName, el.textContent])).toEqual([
      ['SPAN', PURGED_ITEM_LABEL],
      ['SPAN', PURGED_ITEM_LABEL],
    ]);
    expect(container.textContent).not.toContain('Invoice');
    expect(container.textContent).not.toContain('Cold room');
    // CONTROL
    const links = [...container.querySelectorAll('a')];
    expect(links.map((a) => a.textContent)).toEqual(['SHOP-9 Fix the freezer']);
  });
});
