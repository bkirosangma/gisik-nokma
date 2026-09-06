import { describe, expect, it } from 'vitest';
import { createTestEditor } from './helpers/create-editor.js';
import { typeText } from './helpers/type-text.js';

/**
 * `typeText` exists because the obvious way to put text in an editor is the
 * wrong one. Every editor test in this plan reaches for it, and a helper
 * that quietly stopped driving input rules would make those tests assert
 * against a document no user could ever produce — while staying green,
 * because the text would still be there. So the helper gets its own
 * coverage, and the contrast case below is half the point.
 */
describe('typeText', () => {
  /**
   * 9.95 — the `typeText` test helper drives Tiptap's input rules the way a real keystroke does, unlike `insertContent`, which leaves typed markdown as literal text with no autoformat firing.
   */
  it('drives input rules the way a real keystroke does', () => {
    const editor = createTestEditor();
    typeText(editor, '# GST filing');
    const json = editor.getJSON() as {
      content?: Array<{ type?: string; attrs?: { level?: number } }>;
    };
    expect(json.content?.[0]?.type).toBe('heading');
    expect(json.content?.[0]?.attrs?.level).toBe(1);
    expect(editor.getText()).toBe('GST filing\n\n');
    editor.destroy();
  });

  it('unlike insertContent, which leaves the markup as literal text', () => {
    const editor = createTestEditor();
    editor.commands.insertContent('# GST filing');
    const json = editor.getJSON() as { content?: Array<{ type?: string }> };
    expect(json.content?.[0]?.type).toBe('paragraph');
    expect(editor.getText()).toBe('# GST filing');
    editor.destroy();
  });

  it('falls back to a plain insertion when no rule claims the character', () => {
    const editor = createTestEditor();
    typeText(editor, 'due soon');
    const json = editor.getJSON() as { content?: Array<{ type?: string }> };
    expect(json.content?.[0]?.type).toBe('paragraph');
    expect(editor.getText()).toBe('due soon');
    editor.destroy();
  });
});
