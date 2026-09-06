import { describe, expect, it } from 'vitest';
import type { Editor } from '@tiptap/core';
import { getEscapeSuggestion } from '../src/extensions/escape-suggestion.js';
import { createTestEditor } from './helpers/create-editor.js';
import { typeText } from './helpers/type-text.js';

function pressEscape(editor: Editor): boolean {
  const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
  return editor.view.someProp('handleKeyDown', (handler) => handler(editor.view, event)) ?? false;
}

function firstBlock(editor: Editor): { type: string; text: string } {
  const node = editor.state.doc.firstChild;
  return { type: node?.type.name ?? 'none', text: node?.textContent ?? '' };
}

type Trigger = { typed: string; formatted: (editor: Editor) => boolean; label: string };

const BLOCK_TRIGGERS: Trigger[] = [
  { typed: '# ', label: 'heading 1', formatted: (e) => firstBlock(e).type === 'heading' },
  { typed: '## ', label: 'heading 2', formatted: (e) => firstBlock(e).type === 'heading' },
  { typed: '### ', label: 'heading 3', formatted: (e) => firstBlock(e).type === 'heading' },
  { typed: '#### ', label: 'heading 4', formatted: (e) => firstBlock(e).type === 'heading' },
  { typed: '##### ', label: 'heading 5', formatted: (e) => firstBlock(e).type === 'heading' },
  { typed: '###### ', label: 'heading 6', formatted: (e) => firstBlock(e).type === 'heading' },
  { typed: '- ', label: 'bullet (dash)', formatted: (e) => firstBlock(e).type === 'bulletList' },
  { typed: '* ', label: 'bullet (star)', formatted: (e) => firstBlock(e).type === 'bulletList' },
  { typed: '+ ', label: 'bullet (plus)', formatted: (e) => firstBlock(e).type === 'bulletList' },
  { typed: '1. ', label: 'ordered list', formatted: (e) => firstBlock(e).type === 'orderedList' },
  { typed: '> ', label: 'blockquote', formatted: (e) => firstBlock(e).type === 'blockquote' },
  { typed: '``` ', label: 'code block', formatted: (e) => firstBlock(e).type === 'codeBlock' },
  {
    typed: '---',
    label: 'horizontal rule',
    formatted: (e) => {
      let found = false;
      e.state.doc.descendants((node) => {
        if (node.type.name === 'horizontalRule') found = true;
        return !found;
      });
      return found;
    },
  },
];

const MARK_TRIGGERS: Trigger[] = [
  { typed: 'x **bold**', label: 'bold **', formatted: (e) => e.getHTML().includes('<strong') },
  { typed: 'x __bold__', label: 'bold __', formatted: (e) => e.getHTML().includes('<strong') },
  { typed: 'x *it*', label: 'italic *', formatted: (e) => e.getHTML().includes('<em') },
  { typed: 'x _it_', label: 'italic _', formatted: (e) => e.getHTML().includes('<em') },
  { typed: 'x ~~st~~', label: 'strike', formatted: (e) => e.getHTML().includes('<s') },
  { typed: 'x `co`', label: 'inline code', formatted: (e) => e.getHTML().includes('<code') },
];

describe('escape suggestion — every reserved sequence, planted-defect style', () => {
  /**
   * 9.88 — every reserved autoformat sequence (13 block triggers, 6 mark triggers, 19 total, table-driven) applies its formatting AND surfaces the escape suggestion, and accepting via `undoInputRule` reverses the formatting and leaves the literal typed characters.
   */
  it.each([...BLOCK_TRIGGERS, ...MARK_TRIGGERS])(
    '$label: formatting applies, the suggestion appears, accepting yields literal text',
    ({ typed, formatted }) => {
      const editor = createTestEditor();
      typeText(editor, typed);

      // The autoformat happened (dismissing would keep exactly this)…
      expect(formatted(editor), `"${typed}" should have autoformatted`).toBe(true);
      // …and the suggestion is on offer, with a chip in the DOM.
      const suggestion = getEscapeSuggestion(editor.state);
      expect(suggestion, `no suggestion after typing "${typed}"`).not.toBeNull();
      expect(editor.view.dom.querySelector('[data-escape-chip]')).not.toBeNull();

      // Accept: the literal typed characters stand, the formatting is gone.
      expect(editor.commands.undoInputRule()).toBe(true);
      expect(formatted(editor), `accepting the escape must undo "${typed}"`).toBe(false);
      expect(editor.state.doc.textContent).toContain(typed.trim());
      expect(getEscapeSuggestion(editor.state)).toBeNull();
      expect(editor.view.dom.querySelector('[data-escape-chip]')).toBeNull();
      editor.destroy();
    },
  );

  /**
   * 9.89 — Backspace accepts through a real `keydown` (core's Backspace keymap routes it through `undoInputRule`), proven with a genuine event rather than the `keyboardShortcut` test helper.
   */
  it('Backspace accepts (core keymap routes it through undoInputRule)', () => {
    // A real keydown, not `editor.commands.keyboardShortcut('Backspace')`:
    // that test-only helper replays the shortcut's captured transaction
    // onto a second, outer transaction (core dist:895-902), and the replay
    // mishandles a multi-step transaction ending in a position-shifting
    // step — verified independent of this file: with this extension's
    // addCommands removed so core's OWN unmodified undoInputRule runs on a
    // mark trigger whose record this file never touches, the helper still
    // fails, this time with a hard `RangeError` from inside its own replay
    // (see escape-suggestion.ts's docblock for the isolation). A genuine
    // keydown event is what core's Backspace keymap and every real user
    // actually drive, and it is what `pressEscape` above already uses for
    // the same reason.
    const editor = createTestEditor();
    typeText(editor, '# ');
    expect(firstBlock(editor).type).toBe('heading');
    const event = new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true });
    const handled = editor.view.someProp('handleKeyDown', (h) => h(editor.view, event));
    expect(handled).toBe(true);
    expect(firstBlock(editor)).toEqual({ type: 'paragraph', text: '# ' });
    editor.destroy();
  });

  /**
   * 9.90 — clicking the chip accepts: the formatting is gone from the rendered HTML and the typed markup stands as literal text.
   */
  it('clicking the chip accepts', () => {
    const editor = createTestEditor();
    typeText(editor, 'x **bold**');
    const chip = editor.view.dom.querySelector('[data-escape-chip]') as HTMLButtonElement;
    expect(chip).not.toBeNull();
    expect(chip.textContent).toContain('**bold**');
    chip.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    expect(editor.getHTML()).not.toContain('<strong');
    expect(editor.state.doc.textContent).toContain('**bold**');
    editor.destroy();
  });

  /**
   * 9.91 — Escape dismisses: the suggestion and the chip both disappear and the formatting stays applied.
   */
  it('Escape dismisses: the formatting stays, the chip goes', () => {
    const editor = createTestEditor();
    typeText(editor, '# ');
    expect(getEscapeSuggestion(editor.state)).not.toBeNull();
    expect(pressEscape(editor)).toBe(true);
    expect(getEscapeSuggestion(editor.state)).toBeNull();
    expect(editor.view.dom.querySelector('[data-escape-chip]')).toBeNull();
    expect(firstBlock(editor).type).toBe('heading');
    editor.destroy();
  });

  /**
   * 9.92 — continuing to type dismisses the suggestion the same way Escape does, and the formatting stays.
   */
  it('continuing to type dismisses: the formatting stays', () => {
    const editor = createTestEditor();
    typeText(editor, '# ');
    expect(getEscapeSuggestion(editor.state)).not.toBeNull();
    typeText(editor, 'title');
    expect(getEscapeSuggestion(editor.state)).toBeNull();
    expect(firstBlock(editor)).toEqual({ type: 'heading', text: 'title' });
    editor.destroy();
  });

  /**
   * 9.93 — Escape with no active suggestion is not consumed — `handleKeyDown` returns `false`, leaving the key free for whatever else wants it.
   */
  it('Escape without an active suggestion is not consumed', () => {
    const editor = createTestEditor();
    typeText(editor, 'plain');
    expect(pressEscape(editor)).toBe(false);
    editor.destroy();
  });
});

describe('non-triggers stay literal with no suggestion', () => {
  /**
   * 9.94 — three non-triggers stay literal with no suggestion offered at all: a markdown link `[text](url)`, a line containing pipe characters, and a bare URL — no `<a>` in the rendered HTML for any of them.
   */
  it.each([
    { typed: 'see [the doc](http://x) now', literal: '[the doc](http://x)' },
    { typed: 'a | b | c', literal: 'a | b | c' },
    { typed: 'go to https://example.com now', literal: 'https://example.com' },
  ])('"$literal" stays literal', ({ typed, literal }) => {
    const editor = createTestEditor();
    typeText(editor, typed);
    expect(editor.state.doc.textContent).toContain(literal);
    expect(editor.getHTML()).not.toContain('<a ');
    expect(getEscapeSuggestion(editor.state)).toBeNull();
    editor.destroy();
  });
});
