import { describe, expect, it } from 'vitest';
import type { Editor } from '@tiptap/core';
import { createTestEditor } from './helpers/create-editor.js';
import { exportMarkdown, looksLikeMarkdown, markdownToHtml } from '../src/markdown/serializer.js';

/**
 * 9.284–9.287 — Markdown on the clipboard and in an export (spec §8.6).
 *
 * The paste case carries its own CONTROL in the same `it`, because the
 * property is a NEGATIVE one and a handler that converted everything would
 * satisfy the positive arm alone: a clipboard with `text/html` present must go
 * through the default handler.
 */
function paste(editor: Editor, text: string, html?: string): void {
  const data = {
    getData: (type: string): string =>
      type === 'text/html' ? (html ?? '') : type === 'text/plain' ? text : '',
    types: html === undefined ? ['text/plain'] : ['text/html', 'text/plain'],
  };
  const event = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent;
  Object.defineProperty(event, 'clipboardData', { value: data });
  editor.view.dom.dispatchEvent(event);
}

describe('9.284-9.286 markdown clipboard', () => {
  it('9.284 looksLikeMarkdown', () => {
    for (const text of ['# H', '- a', '* a', '1. a', '> q', '```\nx\n```', 'x **y** z', 'see [[Cold']) {
      expect(looksLikeMarkdown(text), text).toBe(true);
    }
    for (const text of ['hello world', 'a < b', '10 * 3']) {
      expect(looksLikeMarkdown(text), text).toBe(false);
    }
  });

  it('9.285 plain markdown paste converts; html paste and plain prose do not', () => {
    const editor = createTestEditor();
    paste(editor, '# H\n\n- a\n\n**b**');
    const types = editor.getJSON().content?.map((n) => n.type);
    expect(types).toEqual(['heading', 'bulletList', 'paragraph']);
    editor.commands.clearContent();
    // THE CONTROL: the same text, with `text/html` on the clipboard. The
    // default handler takes it, so it lands as a paragraph of literal prose —
    // a `handlePaste` that ignored the html flavour would parse it instead.
    paste(editor, '# H', '<p># H</p>');
    expect(editor.getJSON().content?.[0]?.type).toBe('paragraph');
    editor.commands.clearContent();
    paste(editor, 'hello world');
    expect(editor.getJSON().content?.[0]?.type).toBe('paragraph');
    editor.destroy();
  });

  it('9.286 the plain-text clipboard flavour is Markdown', () => {
    const editor = createTestEditor(undefined, {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'H' }] },
        {
          type: 'bulletList',
          content: [
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'a' }] }] },
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'b' }] }] },
          ],
        },
        { type: 'paragraph', content: [{ type: 'text', text: 'bold', marks: [{ type: 'bold' }] }] },
      ],
    });
    editor.commands.selectAll();
    const serialize = editor.view.someProp('clipboardTextSerializer');
    expect(serialize).toBeDefined();
    const text = serialize!(editor.state.selection.content(), editor.view);
    expect(text).toBe('## H\n\n- a\n- b\n\n**bold**');
    editor.destroy();
  });
});

describe('9.287 exportMarkdown and the round trip', () => {
  /**
   * THE ROUND TRIP, and what it does NOT claim. Everything the spec §8.6 list
   * names is here; two members are measured rather than asserted equal:
   *
   *   - a `wikiLink` exports as `[[title]]` and re-imports as TEXT, which is
   *     the spec's own note. Markdown cannot spell a note id, so this is the
   *     designed behaviour and not a loss to fix.
   *   - a TASK LIST re-imports as a plain bullet list. `markdownToHtml`
   *     deliberately writes the disabled-checkbox shape (it is what
   *     `htmlToMarkdown` reverses, so the string round-trips bit-for-bit), and
   *     `@tiptap/extension-task-item`'s `parseHTML` matches
   *     `li[data-type="taskItem"]` — an attribute no markdown can carry. The
   *     TEXT survives; the item TYPE does not. Stated here because a case named
   *     "equals the original" would otherwise be read as covering it.
   */
  it('9.287 a document round-trips through Markdown, with the two measured exceptions', () => {
    const original = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'GST filing' }] },
        {
          type: 'bulletList',
          content: [
            { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'collect' }] }] },
          ],
        },
        {
          type: 'taskList',
          content: [
            {
              type: 'taskItem',
              attrs: { checked: true },
              content: [{ type: 'paragraph', content: [{ type: 'text', text: 'call CA' }] }],
            },
          ],
        },
        { type: 'codeBlock', content: [{ type: 'text', text: 'npm run gst' }] },
        {
          type: 'details',
          attrs: { open: true },
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
            { type: 'text', text: 'see the ' },
            { type: 'text', text: 'portal', marks: [{ type: 'link', attrs: { href: 'https://gst.gov.in' } }] },
            { type: 'text', text: ' and ' },
            { type: 'text', text: 'go', marks: [{ type: 'bold' }] },
          ],
        },
      ],
    };

    const md = exportMarkdown(original);
    // The markdown really carries each shape, so the editor below is not
    // round-tripping an empty string.
    expect(md).toContain('## GST filing');
    expect(md).toContain('- [x] call CA');
    expect(md).toContain('```\nnpm run gst\n```');
    expect(md).toContain('<details open>');
    expect(md).toContain('[portal](https://gst.gov.in)');
    expect(md).toContain('**go**');

    const editor = createTestEditor();
    editor.commands.setContent(markdownToHtml(md));
    const json = editor.getJSON();
    const types = json.content?.map((n) => n.type);
    expect(types).toEqual(['heading', 'bulletList', 'codeBlock', 'details', 'paragraph']);
    // THE TASK LIST'S TEXT SURVIVES; ITS ITEM TYPE AND ITS CHECKED STATE DO
    // NOT — and that is a property of the FORMAT, not a port defect. Three
    // things, measured rather than reasoned: CommonMark merges two
    // same-marker lists separated by a blank line, so the bullet list and the
    // task list arrive as ONE loose list; a task item's Tiptap shape is
    // `li[data-type="taskItem"]`, an attribute no markdown can carry; and the
    // `[x]` itself is written as an `<input>`, which this schema does not name
    // and therefore drops on parse. The words are what survives, which is the
    // honest half in an append-only document.
    expect(JSON.stringify(json.content?.[1])).toContain('collect');
    expect(JSON.stringify(json.content?.[1])).toContain('call CA');
    expect(JSON.stringify(json.content?.[1])).not.toContain('taskItem');
    expect(JSON.stringify(json.content?.[1])).not.toContain('checked');
    // The details block came back as a collapsible, open, with its body.
    // Indices are the MEASURED ones — the merged list above is why `details`
    // is at 3 rather than at its original block position.
    expect(json.content?.[3]?.type).toBe('details');
    expect(json.content?.[3]?.attrs?.['open']).toBe(true);
    expect(JSON.stringify(json.content?.[3])).toContain('because');
    // …and the marks are the marks.
    expect(JSON.stringify(json.content?.[4])).toContain('"type":"bold"');
    expect(JSON.stringify(json.content?.[4])).toContain('https://gst.gov.in');
    editor.destroy();

    // A note link exports as `[[title]]` and re-imports as TEXT (spec §8.6).
    const withLink = exportMarkdown({
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'see ' },
            { type: 'wikiLink', attrs: { noteId: 'n1', title: 'Cold room' } },
          ],
        },
      ],
    });
    expect(withLink).toBe('see [[Cold room]]');
    const back = createTestEditor();
    back.commands.setContent(markdownToHtml(withLink));
    expect(back.getText()).toBe('see [[Cold room]]');
    expect(JSON.stringify(back.getJSON())).not.toContain('wikiLink');
    back.destroy();
  });
});

/**
 * 9.296 — A MARKDOWN PASTE INSIDE A CODE BLOCK.
 *
 * Found by the plan-close review, and it was CONTENT-DESTROYING rather than
 * merely wrong: `markdownToHtml` produces BLOCK nodes, and inserting blocks
 * with the caret inside a code block lifts them to an ancestor and SPLITS the
 * block around them. Measured on the unguarded version — pasting
 * `# install deps\nnpm install` mid-`npm ci` gave
 * `codeBlock("npm ") | heading("install deps") | paragraph("npm install") |
 * codeBlock("ci")`. A shell snippet copied from a terminal carries no
 * `text/html`, so this is the ordinary path into a snippet block.
 *
 * The fix is to DECLINE, which hands the paste to the default handler — and
 * the default handler puts plain text exactly where the caret is. So the
 * assertion is the whole block, unchanged but for the text.
 */
describe('9.296 markdown paste inside a code block', () => {
  it('9.296 declines inside a code block so the text lands in the block', () => {
    const editor = createTestEditor(undefined, {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'intro' }] },
        { type: 'codeBlock', content: [{ type: 'text', text: 'npm ci' }] },
      ],
    });
    // Caret at the end of the code block's text.
    editor.commands.setTextSelection(editor.state.doc.content.size - 3);
    paste(editor, '# install deps\nnpm install');
    const json = editor.getJSON();
    // The trailing empty paragraph is `TrailingNode`'s — it keeps a paragraph
    // as a document's last block, so a document ending in a code block always
    // carries one. What matters is that NOTHING WAS SPLIT.
    expect(json.content?.slice(0, 2).map((n) => n.type)).toEqual(['paragraph', 'codeBlock']);
    // THE TEXT IS IN THE BLOCK, at the caret — which is what "declined"
    // produces and what the unguarded version could not: that one put a
    // heading and a paragraph BESIDE the block and left `npm ` and `ci` in two
    // half-blocks. Asserted as the block's own text rather than as a substring
    // of its JSON, because the default handler inserts AT the caret: the
    // original text survives on both sides of what was pasted in.
    // The cast is the same one the sibling suites carry: `getJSON().content`
    // is Tiptap's `Content` union, and a `TextType` member has no `.text` on
    // the TYPE even though the runtime node does.
    const blockText =
      (json.content?.[1]?.content?.[0] as { text?: string } | undefined)?.text ?? '';
    expect(blockText.startsWith('npm ')).toBe(true);
    expect(blockText.endsWith('ci')).toBe(true);
    expect(blockText).toContain('npm install');
    expect(JSON.stringify(json)).not.toContain('"heading"');
    editor.destroy();
  });
});
