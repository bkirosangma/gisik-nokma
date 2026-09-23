import { Extension } from '@tiptap/core';
import { DOMSerializer } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { htmlToMarkdown, looksLikeMarkdown, markdownToHtml } from '../markdown/serializer.js';

/**
 * Markdown on the clipboard, both ways (spec §8.6).
 *
 * ## PASTE: ONLY WHEN THERE IS NO `text/html`, AND THAT IS THE WHOLE RULE
 *
 * A clipboard that carries HTML is a clipboard from a browser, a word
 * processor or this editor itself — it already says what it means, and parsing
 * its plain-text fallback as Markdown would replace a faithful paste with a
 * guess. The rule fires only on a plain-text-only clipboard whose text passes
 * `looksLikeMarkdown`, which is why the case has a CONTROL arm: the same text
 * with `text/html` present must go through the default handler.
 *
 * ## COPY: THE PLAIN-TEXT FLAVOUR BECOMES MARKDOWN
 *
 * `clipboardTextSerializer` changes what a plain-text consumer receives — a
 * terminal, an email, a message box. The HTML flavour is untouched, so a paste
 * back into this editor still round-trips through the node graph rather than
 * through the markdown. Both flavours describing the same selection is the
 * point; teaching the index about hrefs is not (that decision is the comment
 * renderer's, and it stands).
 */
export const MarkdownClipboard = Extension.create({
  name: 'markdownClipboard',

  addProseMirrorPlugins() {
    const editor = this.editor;
    return [
      new Plugin({
        key: new PluginKey('markdownClipboard'),
        props: {
          handlePaste(view, event) {
            // DEFENSIVE, AND IT READS AS DEFENSIVE BECAUSE IT IS — but a paste
            // handler is one of a CHAIN, and returning `false` is how this one
            // declines so the others get their turn. A synthetic event with no
            // `clipboardData`, or one whose `types` is absent, must therefore
            // DECLINE rather than throw: a throw here takes down every handler
            // behind it, including the attachment-paste one that has nothing to
            // do with markdown. Measured — five pre-existing cases reddened
            // when this read `data.types` unguarded.
            const data = event.clipboardData;
            if (data === null || data === undefined) return false;
            const types = Array.isArray(data.types) ? data.types : [];
            if (types.includes('text/html')) return false;
            if (typeof data.getData !== 'function') return false;
            const text = data.getData('text/plain');
            if (typeof text !== 'string' || text === '' || !looksLikeMarkdown(text)) return false;
            editor.commands.insertContent(markdownToHtml(text));
            return true;
          },
          clipboardTextSerializer(slice) {
            // The SLICE is serialized with the editor's own schema, so the
            // markdown describes exactly what a paste back into this editor
            // would produce — the same reasoning as `exportMarkdown`.
            const serializer = DOMSerializer.fromSchema(editor.schema);
            const container = document.createElement('div');
            container.appendChild(serializer.serializeFragment(slice.content));
            return htmlToMarkdown(container.innerHTML);
          },
        },
      }),
    ];
  },
});
