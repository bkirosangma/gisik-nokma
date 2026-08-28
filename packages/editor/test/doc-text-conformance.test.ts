import { describe, expect, it } from 'vitest';
import { docToPlainText } from '@gisik-nokma/domain';
import { createTestEditor } from './helpers/create-editor.js';
import { typeText } from './helpers/type-text.js';

/**
 * `packages/domain/src/doc-text.ts` shipped before this package existed and
 * its header names Plan 7's editor as the thing that conforms to it. That
 * conformance has been a claim in a comment; here it is a check.
 *
 * The direction matters. The walker is the reader — proj_search and
 * notifications both go through it — and it recognises a CLOSED set of block
 * node names. Any node this schema emits that the walker does not know is
 * descended into without a line break, so its text silently fuses with its
 * neighbour's in every search index and every notification. Nothing else in
 * the system would report that; the document would still round-trip, still
 * render, still validate. So the check is run against documents this editor
 * actually produced, not against hand-written JSON that could agree with the
 * walker while the editor disagreed with both.
 *
 * WHAT THESE CASES DO AND DO NOT PIN, established by deleting each entry from
 * the walker's block set and re-running: `paragraph`, `heading` and `codeBlock`
 * each kill a case. `doc`, `blockquote`, `bulletList` and `listItem` survive,
 * and no schema-v1 document can change that — every one of them contains only
 * other blocks, so the newline is emitted by the child regardless and the
 * walker's `\n{2,}` collapse hides the duplicate. Their entries are inert for
 * this editor's output. Stated here so a later reader does not mistake these
 * cases for whole-set coverage and build on a guarantee they do not give.
 */
describe('schema v1 output conforms to the shipped plain-text walker', () => {
  it('renders every block node the schema names as its own line', () => {
    const editor = createTestEditor(undefined, {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'GST filing' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'due soon' }] },
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'collect invoices' }] }],
            },
            {
              type: 'listItem',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'file GSTR-1' }] }],
            },
          ],
        },
        {
          type: 'blockquote',
          content: [{ type: 'paragraph', content: [{ type: 'text', text: 'CA said wait' }] }],
        },
        { type: 'codeBlock', content: [{ type: 'text', text: 'npm run gst' }] },
        // Deliberately NOT the last block. A textblock that ends the document
        // has its trailing newline trimmed away, so putting codeBlock last
        // would let the walker forget codeBlock is a block and still produce
        // the expected string — the mutant survived exactly that arrangement.
        { type: 'paragraph', content: [{ type: 'text', text: 'then reconcile' }] },
      ],
    });
    expect(docToPlainText(editor.getJSON())).toBe(
      'GST filing\ndue soon\ncollect invoices\nfile GSTR-1\nCA said wait\nnpm run gst\nthen reconcile',
    );
    editor.destroy();
  });

  /**
   * `orderedList` and `horizontalRule` are in the v1 node set and were in no
   * case here. Their pinning strength differs and it is worth being straight
   * about which is which.
   *
   * `orderedList` is load-bearing the same way `bulletList` is — its numbering
   * is presentational, so the plain text must carry the item text and nothing
   * else, and dropping `paragraph` from the walker's block set fails this case
   * along with the others.
   *
   * `horizontalRule` is pinned from the other direction, and it took a moment
   * to see that it was pinned at all. DELETING something cannot break it — an
   * `hr` has no content, so it contributes nothing whether or not the walker
   * calls it a block. ADDING something can: teaching the walker to render it
   * as a '---' separator fails this case, which was run and does fail. That is
   * the change worth guarding against, because it is the plausible one — a
   * later hand deciding a rule should be visible in plain text would start
   * injecting punctuation into every indexed document and every notification,
   * and would otherwise find out from a user.
   */
  it('renders an ordered list as its items and a horizontal rule as nothing', () => {
    const editor = createTestEditor(undefined, {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'before' }] },
        { type: 'horizontalRule' },
        {
          type: 'orderedList',
          content: [
            {
              type: 'listItem',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'file GSTR-1' }] }],
            },
            {
              type: 'listItem',
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'file GSTR-3B' }] }],
            },
          ],
        },
        { type: 'horizontalRule' },
        { type: 'paragraph', content: [{ type: 'text', text: 'after' }] },
      ],
    });
    // No separator, no blank line, no numbering: two rules between three
    // blocks leave no trace at all in the indexed text.
    expect(docToPlainText(editor.getJSON())).toBe('before\nfile GSTR-1\nfile GSTR-3B\nafter');
    editor.destroy();
  });

  it('renders hardBreak as a newline and marks as their bare text', () => {
    const editor = createTestEditor(undefined, {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'due ' },
            { type: 'text', text: 'soon', marks: [{ type: 'bold' }] },
            { type: 'hardBreak' },
            { type: 'text', text: 'or else', marks: [{ type: 'italic' }, { type: 'code' }] },
          ],
        },
      ],
    });
    expect(docToPlainText(editor.getJSON())).toBe('due soon\nor else');
    editor.destroy();
  });

  it('renders a link as its text, not its href — the URL is never indexed', () => {
    const editor = createTestEditor(undefined, {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'the portal',
              marks: [{ type: 'link', attrs: { href: 'https://gst.gov.in' } }],
            },
          ],
        },
      ],
    });
    expect(docToPlainText(editor.getJSON())).toBe('the portal');
    editor.destroy();
  });

  /**
   * Tables are the one place schema v1 and the walker's block set genuinely
   * differ, and the difference is benign only by accident of nesting: `table`,
   * `tableRow`, `tableHeader` and `tableCell` are all unknown to the walker,
   * but a cell's content is a `paragraph`, which is known, so each cell still
   * ends up on its own line. Pinned because it is exactly the kind of fact a
   * future edit to either side would break without failing anything else — a
   * cell whose content stopped being a paragraph would fuse a whole row into
   * one unbroken string in the search index.
   */
  it('renders each table cell on its own line despite the walker not knowing tables', () => {
    const editor = createTestEditor(undefined, {
      type: 'doc',
      content: [
        {
          type: 'table',
          content: [
            {
              type: 'tableRow',
              content: [
                {
                  type: 'tableHeader',
                  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Month' }] }],
                },
                {
                  type: 'tableHeader',
                  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Due' }] }],
                },
              ],
            },
            {
              type: 'tableRow',
              content: [
                {
                  type: 'tableCell',
                  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'August' }] }],
                },
                {
                  type: 'tableCell',
                  content: [{ type: 'paragraph', content: [{ type: 'text', text: '11th' }] }],
                },
              ],
            },
          ],
        },
      ],
    });
    expect(docToPlainText(editor.getJSON())).toBe('Month\nDue\nAugust\n11th');
    editor.destroy();
  });

  it('is unbothered by the doc attrs this schema stamps and the paragraph typing appends', () => {
    // schemaVersion lives on the doc node's attrs, which the walker ignores
    // entirely; trailingNode appends an empty paragraph after a heading the
    // moment anything is typed. Neither must reach the search index.
    const editor = createTestEditor();
    typeText(editor, '# GST filing');
    const json = editor.getJSON() as { attrs?: { schemaVersion?: number } };
    expect(json.attrs?.schemaVersion).toBe(1);
    expect(editor.getText()).toBe('GST filing\n\n');
    expect(docToPlainText(json)).toBe('GST filing');
    editor.destroy();
  });
});
