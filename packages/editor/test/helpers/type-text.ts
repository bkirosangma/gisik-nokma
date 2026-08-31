import type { Editor } from '@tiptap/core';

/**
 * Simulate real per-character typing. `insertContent`/`insertText` bypass
 * ProseMirror's `handleTextInput`, so input rules never fire under them;
 * routing each character through `someProp('handleTextInput')` follows the
 * same path the browser's beforeinput handling does. When no plugin
 * consumes the character, fall back to a plain insertText transaction —
 * exactly what the real editor does.
 *
 * The fifth argument is not optional padding. prosemirror-view calls
 * `handleTextInput(view, from, to, text, deflt)` where `deflt` builds the
 * transaction the editor would have applied unaided, and a handler is
 * entitled to call it — several compose with it rather than replacing it.
 * Omitting it (the four-argument call the plan text specifies) hands such a
 * handler `undefined` and it dies on `deflt is not a function`, which no
 * schema test would ever reach. Passing the same factory the fallback
 * dispatches also means the default transaction has ONE definition here
 * instead of two that could drift.
 */
export function typeText(editor: Editor, text: string): void {
  for (const char of text) {
    const { view } = editor;
    const { from, to } = view.state.selection;
    const defaultTransaction = () => view.state.tr.insertText(char, from, to);
    const handled = view.someProp('handleTextInput', (handler) =>
      handler(view, from, to, char, defaultTransaction),
    );
    if (!handled) {
      view.dispatch(defaultTransaction());
    }
  }
}
