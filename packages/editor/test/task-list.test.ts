import { describe, expect, it } from 'vitest';
import { createTestEditor } from './helpers/create-editor.js';
import { typeText } from './helpers/type-text.js';

/**
 * `asJson(editor)` types its `content` as Tiptap's `Content` union
 * (`NodeType | TextType`), so reading a CHILD's `content` or `attrs` off it is
 * a type error even though the runtime object has them. The cast is local and
 * named rather than sprinkled: this is the shape the assertions below read.
 */
type Json = { type?: string; attrs?: Record<string, unknown>; content?: Json[]; text?: string };

function asJson(node: { getJSON(): unknown }): Json {
  return node.getJSON() as Json;
}

describe('9.264 task items by input rule', () => {
  it('9.264 [ ] and [x] at line start become task items; mid-line stays text', () => {
    const editor = createTestEditor();
    typeText(editor, '[ ] buy milk');
    let view = asJson(editor);
    expect(view.content?.[0]?.type).toBe('taskList');
    expect(view.content?.[0]?.content?.[0]?.attrs?.checked).toBe(false);
    editor.commands.clearContent();
    typeText(editor, '[x] done');
    view = asJson(editor);
    expect(view.content?.[0]?.content?.[0]?.attrs?.checked).toBe(true);
    editor.commands.clearContent();
    typeText(editor, 'note [ ] later'); // control
    expect(asJson(editor).content?.[0]?.type).toBe('paragraph');
    editor.destroy();
  });
});
