import type { Editor } from '@tiptap/core';
import { describe, expect, it } from 'vitest';
import { createTestEditor } from './helpers/create-editor.js';
import { typeText } from './helpers/type-text.js';

/**
 * 9.268–9.271 and 9.295 — spec §8.4, the collapsible block.
 *
 * The shape is `details(open) > detailsSummary + detailsContent > paragraph…`.
 *
 * ## WHY THIS FILE DISPATCHES REAL `keydown` EVENTS
 *
 * `editor.commands.keyboardShortcut('Enter')` runs the extension handlers
 * inside `editor.captureTransaction` (core `keyboardShortcut`, dist:890), and
 * that helper replays only the captured TRANSACTION STEPS onto its own
 * transaction — the SELECTION it set is dropped. Measured: an Enter that moves
 * the cursor into the body leaves the selection exactly where it was under
 * `keyboardShortcut`, while the same Enter dispatched as a DOM event moves it.
 * So the two cases that assert a cursor position cannot be driven through that
 * command at all, and all of them are driven the way the browser does it —
 * a `keydown` on the editor's own host, which is the pattern the notes plan's
 * Task 5 uses for its suggestion keys.
 */
function key(editor: Editor, name: string): void {
  editor.view.dom.dispatchEvent(
    new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true }),
  );
}

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

describe('9.268-9.271 collapsible block', () => {
  /**
   * The `< ` trigger, and the two controls that keep it from being a greedy
   * rule: `<div>` has no space after the `<`, and `abc< ` is not at the start
   * of the line. Both controls are in the same `it` as the positive case, so a
   * rule that matched too much cannot pass by the positive case alone.
   */
  it('9.268 "< " opens a details block; "<div>" and "abc< " do not', () => {
    const editor = createTestEditor();
    typeText(editor, '< Why it broke');
    const first = asJson(editor).content?.[0];
    expect(first?.type).toBe('details');
    expect(first?.attrs?.open).toBe(true);
    expect(first?.content?.[0]?.type).toBe('detailsSummary');
    expect(first?.content?.[0]?.content?.[0]?.text).toBe('Why it broke');
    expect(first?.content?.[1]?.type).toBe('detailsContent');
    editor.commands.clearContent();
    typeText(editor, '<div>');
    expect(asJson(editor).content?.[0]?.type).toBe('paragraph');
    editor.commands.clearContent();
    typeText(editor, 'abc< ');
    expect(asJson(editor).content?.[0]?.type).toBe('paragraph');
    editor.destroy();
  });

  it('9.269 Enter in the summary moves into the content', () => {
    const editor = createTestEditor();
    typeText(editor, '< Title');
    key(editor, 'Enter');
    const { $from } = editor.state.selection;
    expect($from.parent.type.name).toBe('paragraph');
    expect($from.node(-1).type.name).toBe('detailsContent');
    editor.destroy();
  });

  it('9.270 Enter on the empty last paragraph exits the block', () => {
    const editor = createTestEditor();
    typeText(editor, '< Title');
    key(editor, 'Enter');
    typeText(editor, 'body');
    key(editor, 'Enter'); // new empty paragraph inside content
    key(editor, 'Enter'); // exit
    const doc = asJson(editor);
    expect(doc.content?.[0]?.type).toBe('details');
    expect(doc.content?.[0]?.content?.[1]?.content).toHaveLength(1); // the empty paragraph was removed
    expect(doc.content?.[1]?.type).toBe('paragraph');
    expect(editor.state.selection.$from.depth).toBe(1); // cursor is at top level
    editor.destroy();
  });

  it('9.271 open is document state for editors; readers get persist:false', () => {
    const editor = createTestEditor();
    typeText(editor, '< T');
    editor.commands.updateAttributes('details', { open: false });
    expect(asJson(editor).content?.[0]?.attrs?.open).toBe(false);
    editor.destroy();
    const reader = createTestEditor({ readOnly: true });
    const details = reader.extensionManager.extensions.find((e) => e.name === 'details');
    expect(details?.options.persist).toBe(false);
    reader.destroy();
  });

  /**
   * 9.295 — spec §8.4's Backspace rule: at the start of an empty summary of an
   * empty collapsible, the whole block goes and ONE paragraph takes its place.
   *
   * THE CONTROL IS THE OFFSET, and it is in the same `it` because it is the
   * half that makes "at the start" mean something. One position in from the
   * start, Backspace must delete a CHARACTER and leave the block standing — a
   * handler that removed the block whenever it saw Backspace in a summary
   * would satisfy the first arm and eat a titled section on the first
   * keystroke of an edit.
   */
  it('9.295 Backspace at the start of an EMPTY summary removes the block and leaves one paragraph', () => {
    const editor = createTestEditor();
    typeText(editor, '< '); // the rule fires on the space: empty summary, empty body
    const before = asJson(editor).content ?? [];
    expect(before[0]?.type).toBe('details');
    key(editor, 'Backspace');
    const after = asJson(editor).content ?? [];
    // The block is GONE — no `details` anywhere in the document.
    expect(JSON.stringify(after)).not.toContain('"details"');
    // AND EXACTLY ONE BLOCK TOOK ITS PLACE. The count is asserted as a DELTA
    // rather than as a literal, because `TrailingNode` keeps an empty
    // paragraph as a document's last block: a document ending in a collapsible
    // always carries one behind it, so `toHaveLength(1)` would be counting the
    // editor's trailing node. What §8.4 asks for is a 1:1 replacement, and
    // that is what a delta measures.
    //
    // THIS ARM IS WHY THE HANDLER IS THIS FILE'S RATHER THAN THE PACKAGE'S.
    // Removing the handler leaves this case RED at 3 — the Details
    // extension's own Backspace calls `unsetDetails`, which merges the
    // summary content AND inserts a fresh block, so an empty collapsible
    // becomes two empty paragraphs plus the trailing one. Both "leave a
    // paragraph"; only one leaves ONE.
    expect(after).toHaveLength(before.length);
    expect(after[0]?.type).toBe('paragraph');
    editor.destroy();

    const kept = createTestEditor();
    typeText(kept, '< Ti');
    kept.commands.setTextSelection(4); // one position in from the start of "Ti"
    key(kept, 'Backspace');
    const keptDoc = asJson(kept);
    expect(keptDoc.content?.[0]?.type).toBe('details');
    expect(keptDoc.content?.[0]?.content?.[0]?.content?.[0]?.text).toBe('T');
    kept.destroy();
  });
});
