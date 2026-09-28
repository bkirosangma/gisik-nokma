import { describe, expect, it } from 'vitest';
import { createTestEditor } from './helpers/create-editor.js';

/**
 * 9.368 / 9.369 / 9.370 — `TableNoNest`, ported from the knowledge-base app's
 * `tableNoNest.test.ts` (its DOC-4.3-26 and DOC-4.3-27). The reference builds a
 * bare `Editor`; this one drives the SHIPPED extension list through
 * `createTestEditor`, so a schema that quietly lost the wrapper fails here too.
 */
function tableCount(html: string): number {
  return (html.match(/<table[\s>]/g) ?? []).length;
}

describe('TableNoNest', () => {
  it('9.368 insertTable succeeds when the caret is not inside a table', () => {
    const editor = createTestEditor({}, { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }] });
    expect(editor.isActive('table')).toBe(false);
    expect(editor.chain().focus().insertTable({ rows: 2, cols: 2 }).run()).toBe(true);
    expect(tableCount(editor.getHTML())).toBe(1);
    editor.destroy();
  });

  it('9.369 insertTable is refused with the caret inside a table, and the document keeps its ONE table', () => {
    const editor = createTestEditor({}, { type: 'doc', content: [{ type: 'paragraph' }] });
    editor.chain().focus().insertTable({ rows: 2, cols: 2 }).run();
    expect(editor.isActive('table')).toBe(true);
    const before = JSON.stringify(editor.getJSON());
    expect(editor.chain().insertTable({ rows: 3, cols: 3 }).run()).toBe(false);
    expect(tableCount(editor.getHTML())).toBe(1);
    expect(JSON.stringify(editor.getJSON())).toBe(before);
    editor.destroy();
  });

  it('9.370 insertTable works again once the caret has left the table', () => {
    const editor = createTestEditor({}, { type: 'doc', content: [{ type: 'paragraph' }] });
    editor.chain().focus().insertTable({ rows: 2, cols: 2 }).run();
    editor.chain().focus('end').createParagraphNear().run();
    expect(editor.isActive('table')).toBe(false);
    expect(editor.chain().focus().insertTable({ rows: 2, cols: 2 }).run()).toBe(true);
    expect(tableCount(editor.getHTML())).toBe(2);
    editor.destroy();
  });
});
