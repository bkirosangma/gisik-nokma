import { CodeBlock } from '@tiptap/extension-code-block';

/**
 * The code block, with a Copy button in its corner (spec §8.2).
 *
 * ## WHY THE NODE NAME IS UNCHANGED, AND WHY THAT IS THE POINT
 *
 * `CodeBlock.extend` keeps the name `codeBlock`, so this is the SAME node the
 * schema already had — the document does not change, only its node view does.
 * A rename would be a schema change disguised as a UI one: every stored
 * document would need migrating, and the two input rules that make ``` and ~~~
 * produce a block would be registered under a name the schema does not have.
 *
 * ## THE `contentDOM` IS THE WHOLE CONTRACT
 *
 * A node view that returns only a `dom` produces a block nobody can type into —
 * ProseMirror has nowhere to put the text. `contentDOM` is the `<code>`
 * element, which is also why the button is a SIBLING of the `<pre>` rather than
 * inside it: a control within the editable region would be content, would be
 * serialized into the document, and would be deleted by the first Backspace
 * that reached it.
 *
 * `ignoreMutation` is the second half of that. ProseMirror watches the node
 * view's DOM for changes it did not make; the button's own label flipping to
 * "Copied" is exactly such a change, and without the guard it is read as an
 * external edit to the document.
 *
 * ## THE FALLBACK IS NOT DEAD CODE
 *
 * `navigator.clipboard` is unavailable outside a secure context — and the
 * mobile WebView bundle (`src/webview/entry.tsx`) is one of those contexts.
 * `document.execCommand('copy')` is deprecated and still the only thing that
 * works there; the branch is chosen at CALL time, not at module load, because
 * the same bundle runs in both.
 */
export const CodeBlockWithCopy = CodeBlock.extend({
  /**
   * ## BACKSPACE RIGHT AFTER THE ``` / ~~~ SHORTCUT RESTORES THE FENCE (A5a)
   *
   * The upstream code block binds its own `Backspace` — "caret at the start of
   * an empty block: `clearNodes()`" — and it runs BEFORE core's keymap, the one
   * that calls `undoInputRule`. So for a code block the shortcut's undo (the
   * repair in `escape-suggestion.ts`, which every other block shortcut gets)
   * never ran: Backspace right after typing ``` deleted the block and left an
   * empty paragraph, the three backticks gone. Owner ruling 2026-09-29: the
   * first Backspace after the shortcut gives the typed characters back.
   *
   * `undoInputRule` is the escape-suggestion override, which only succeeds
   * while its record is live — i.e. IMMEDIATELY after the rule fired — and
   * returns false otherwise. Falling through to the upstream handler then
   * keeps its behaviour for a block that was not just created by typing
   * (empty block made from the toolbar or a command still exits to a paragraph).
   */
  addKeyboardShortcuts() {
    const parent = this.parent?.() ?? {};
    return {
      ...parent,
      Backspace: (args) => this.editor.commands.undoInputRule() || (parent['Backspace']?.(args) ?? false),
    };
  },

  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement('div');
      dom.className = 'editor-codeblock';
      const pre = document.createElement('pre');
      const code = document.createElement('code');
      // The language class is what a highlighter would key on; this build ships
      // none, but the class is the node's own serialization and is not the
      // button's business to change.
      const language: unknown = node.attrs['language'];
      if (typeof language === 'string' && language !== '') code.className = `language-${language}`;
      pre.appendChild(code);
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'editor-codeblock__copy';
      button.setAttribute('aria-label', 'Copy code');
      // Explicitly not editable, so a click cannot put a caret inside the
      // control and typing cannot land in it.
      button.setAttribute('contenteditable', 'false');
      button.textContent = 'Copy';
      // Keep the editor's selection: without this the mousedown moves the caret
      // into the button's position in the document.
      button.addEventListener('mousedown', (event) => event.preventDefault());
      button.addEventListener('click', () => {
        const text = code.textContent ?? '';
        const done = (): void => {
          button.textContent = 'Copied';
          setTimeout(() => {
            button.textContent = 'Copy';
          }, 1500);
        };
        // The textarea route is ALSO the answer to a REJECTED write (a denied
        // permission or a sandboxed frame), not only to a missing API — the
        // reference's `codeBlockCopy.tsx` falls back from its catch, and
        // swallowing the rejection left a button that said nothing and copied
        // nothing.
        const fallback = (): void => {
          const area = document.createElement('textarea');
          area.value = text;
          document.body.appendChild(area);
          area.select();
          try {
            document.execCommand('copy');
          } finally {
            area.remove();
          }
          done();
        };
        if (navigator.clipboard?.writeText !== undefined) {
          navigator.clipboard.writeText(text).then(done, fallback);
          return;
        }
        fallback();
      });
      dom.append(pre, button);
      return {
        dom,
        contentDOM: code,
        ignoreMutation: (mutation) =>
          mutation.target === button || button.contains(mutation.target),
      };
    };
  },
});
