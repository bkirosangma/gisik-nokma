import { describe, expect, it } from 'vitest';
import { createTestEditor } from './helpers/create-editor.js';
import { typeText } from './helpers/type-text.js';

describe('9.264 task items by input rule', () => {
  it('9.264 [ ] and [x] at line start become task items; mid-line stays text', () => {
    const editor = createTestEditor();
    typeText(editor, '[ ] buy milk');
    let json = editor.getJSON();
    expect(json.content?.[0]?.type).toBe('taskList');
    expect(json.content?.[0]?.content?.[0]?.attrs?.checked).toBe(false);
    editor.commands.clearContent();
    typeText(editor, '[x] done');
    json = editor.getJSON();
    expect(json.content?.[0]?.content?.[0]?.attrs?.checked).toBe(true);
    editor.commands.clearContent();
    typeText(editor, 'note [ ] later'); // control
    expect(editor.getJSON().content?.[0]?.type).toBe('paragraph');
    editor.destroy();
  });
});
